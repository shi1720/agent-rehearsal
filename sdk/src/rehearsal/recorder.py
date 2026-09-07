"""Bounded metadata-only recording for sync and asynchronous tool functions."""
import asyncio
import functools
import inspect
import json
import os
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional
from .chaos import FaultPlan, InjectedFault, before, after


def _label(value: str, field: str) -> str:
    if not isinstance(value, str) or not value or len(value) > 160 or any(ord(c) < 32 for c in value):
        raise ValueError(f"{field} must be 1..160 characters without control characters")
    return value


def _error_type(error: BaseException) -> str:
    # User-defined class names may themselves contain secrets. Export only allowlisted classes.
    if isinstance(error, asyncio.CancelledError):
        return "CancelledError"
    if isinstance(error, (TimeoutError, asyncio.TimeoutError)):
        return "TimeoutError"
    if isinstance(error, PermissionError):
        return "PermissionError"
    if isinstance(error, ValueError):
        return "ValueError"
    if isinstance(error, ConnectionError):
        return "ConnectionError"
    if isinstance(error, InjectedFault):
        return "InjectedFault"
    return "ToolError"


class Recorder:
    """Record calls without arguments, results, or raw exception messages.

    A recorder is thread-safe. Each decorated function maintains a call counter,
    not a logical retry counter. The ``attempt`` field is 1 for observations;
    fault scripts use the wrapper's call number. Max events fail closed BEFORE
    another tool is executed. A fresh recorder gives a fresh recording origin.
    """
    def __init__(self, name: str, max_events: int = 5000, clock: Callable[[], float] = time.perf_counter):
        self.name = _label(name, "name")
        if isinstance(max_events, bool) or not isinstance(max_events, int) or not 1 <= max_events <= 5000:
            raise ValueError("max_events must be an integer between 1 and 5000")
        self.max_events = max_events
        self._clock = clock
        self._origin = clock()
        self._lock = threading.RLock()
        self._events: Dict[int, Dict[str, Any]] = {}
        self._reserved = 0
        self._tools = set()

    def _reserve(self):
        with self._lock:
            if self._reserved >= self.max_events:
                raise RuntimeError("Rehearsal event limit reached; start a new recorder")
            self._reserved += 1
            return self._reserved

    def _finish(self, index, name, kind, start, fault, executed, error, injected_here):
        end = self._clock()
        cancelled = isinstance(error, asyncio.CancelledError)
        injected = injected_here
        status = "cancelled" if cancelled else "injected" if injected else "error" if error is not None else "ok"
        effect = "none"
        if kind == "write" and executed:
            # A successful function return is still not proof of durable commit.
            effect = "unknown" if error is not None else "committed"
        event = {"id": f"call-{index:05d}", "tool": name, "kind": kind, "attempt": 1,
                 "startMs": round(max(0, (start - self._origin) * 1000), 3),
                 "durationMs": round(max(0, (end - start) * 1000), 3),
                 "status": status, "fault": fault if injected else "none", "effect": effect}
        if error is not None:
            event["errorType"] = _error_type(error)
        with self._lock:
            self._events[index] = event

    def tool(self, function: Optional[Callable] = None, *, name: Optional[str] = None,
             kind: str = "read", faults: Optional[FaultPlan] = None):
        if kind not in ("read", "write"):
            raise ValueError("kind must be read or write")
        if faults is not None and not isinstance(faults, FaultPlan):
            raise TypeError("faults must be a FaultPlan")

        def decorate(fn):
            tool_name = _label(name or getattr(fn, "__name__", type(fn).__name__), "tool name")
            if inspect.isgeneratorfunction(fn) or inspect.isasyncgenfunction(fn):
                raise TypeError("Generator tools are unsupported; wrap consumption in a regular function")
            with self._lock:
                if tool_name in self._tools:
                    raise ValueError("Tool names must be unique within a recorder")
                self._tools.add(tool_name)
            calls = 0
            call_lock = threading.Lock()

            def prepare():
                nonlocal calls
                with call_lock:
                    index = self._reserve()
                    calls += 1
                    return index, self._clock(), faults.at(tool_name, calls) if faults else "none"

            if inspect.iscoroutinefunction(fn) or inspect.iscoroutinefunction(getattr(fn, "__call__", None)):
                @functools.wraps(fn)
                async def async_wrapper(*args, **kwargs):
                    index, start, fault = prepare()
                    executed, injected_here, error = False, False, None
                    try:
                        try:
                            before(fault)
                        except InjectedFault:
                            injected_here = True
                            raise
                        executed = True
                        result = await fn(*args, **kwargs)
                        try:
                            after(fault)
                        except InjectedFault:
                            injected_here = True
                            raise
                        return result
                    except BaseException as exc:
                        error = exc
                        raise
                    finally:
                        self._finish(index, tool_name, kind, start, fault, executed, error, injected_here)
                return async_wrapper

            @functools.wraps(fn)
            def wrapper(*args, **kwargs):
                index, start, fault = prepare()
                executed, injected_here, error = False, False, None
                try:
                    try:
                        before(fault)
                    except InjectedFault:
                        injected_here = True
                        raise
                    executed = True
                    result = fn(*args, **kwargs)
                    if inspect.isawaitable(result) or inspect.isgenerator(result) or inspect.isasyncgen(result):
                        if inspect.iscoroutine(result):
                            result.close()
                        raise TypeError("Sync tools must not return lazy generators or awaitables")
                    try:
                        after(fault)
                    except InjectedFault:
                        injected_here = True
                        raise
                    return result
                except BaseException as exc:
                    error = exc
                    raise
                finally:
                    self._finish(index, tool_name, kind, start, fault, executed, error, injected_here)
            return wrapper
        return decorate(function) if function is not None else decorate

    def snapshot(self) -> Dict[str, Any]:
        """Copy completed events ordered by invocation, never completion time."""
        with self._lock:
            if len(self._events) != self._reserved:
                raise RuntimeError("Cannot export while tool calls are in flight")
            return {"schemaVersion": 1, "name": self.name, "source": "python-sdk",
                    "events": [dict(event) for _, event in sorted(self._events.items())]}

    def export(self, path) -> Path:
        """Atomically replace an explicit destination with restrictive file permissions."""
        destination = Path(path)
        payload = json.dumps(self.snapshot(), indent=2, allow_nan=False) + "\n"
        if len(payload.encode("utf-8")) > 2 * 1024 * 1024:
            raise ValueError("Trace exceeds the 2 MB import limit; reduce max_events")
        if not self._events:
            raise ValueError("Cannot export an empty trace")
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=destination.parent,
                                             prefix=".rehearsal-", delete=False) as handle:
                temporary = Path(handle.name)
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, destination)
        finally:
            if temporary is not None and temporary.exists():
                temporary.unlink()
        return destination
