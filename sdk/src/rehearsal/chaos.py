"""Explicit, deterministic failures. No network interception or hidden global state."""
from dataclasses import dataclass, field
from typing import Mapping
import math

FAULTS = frozenset({"none", "rate_limit", "timeout_before", "timeout_after_write", "malformed", "permanent"})


def sample(seed: int, trial: int, step: str, attempt: int, channel: str = "fault") -> float:
    """Version 1 keyed sampler, bit-identical to the TypeScript engine."""
    value = 2166136261
    for byte in f"{seed}:{trial}:{step}:{attempt}:{channel}".encode("utf-8"):
        value = ((value ^ byte) * 16777619) & 0xFFFFFFFF
    value ^= value >> 16
    value = (value * 0x7FEB352D) & 0xFFFFFFFF
    value ^= value >> 15
    value = (value * 0x846CA68B) & 0xFFFFFFFF
    value ^= value >> 16
    return value / 4294967296


class InjectedFault(Exception):
    """Marker for an explicit Rehearsal injection."""
    fault = "none"


class RateLimited(InjectedFault):
    fault = "rate_limit"

    def __init__(self, retry_after_ms: int = 1200):
        super().__init__("Injected rate limit")
        self.retry_after_ms = retry_after_ms


class ToolTimeout(InjectedFault, TimeoutError):
    def __init__(self, after_write: bool = False):
        super().__init__("Injected response loss" if after_write else "Injected pre-call timeout")
        self.fault = "timeout_after_write" if after_write else "timeout_before"


class MalformedOutput(InjectedFault, ValueError):
    fault = "malformed"


class PermanentFailure(InjectedFault):
    fault = "permanent"


@dataclass(frozen=True)
class FaultPlan:
    """Call-number script or seeded injection. Script entries take precedence.

    timeout_after_write and malformed execute the wrapped function first.
    All other faults happen before the function. Use sandbox tools/test doubles.
    """
    script: Mapping[int, str] = field(default_factory=dict)
    seed: int = 1720
    probability: float = 0.0
    fault: str = "timeout_before"

    def __post_init__(self):
        if isinstance(self.seed, bool) or not isinstance(self.seed, int) or not 0 <= self.seed <= 0xFFFFFFFF:
            raise ValueError("seed must be an unsigned 32-bit integer")
        if isinstance(self.probability, bool) or not isinstance(self.probability, (int, float)) or not math.isfinite(self.probability) or not 0 <= self.probability <= 1:
            raise ValueError("probability must be between 0 and 1")
        if self.fault not in FAULTS:
            raise ValueError("unknown fault")
        for call, fault in self.script.items():
            if isinstance(call, bool) or not isinstance(call, int) or call < 1 or fault not in FAULTS:
                raise ValueError("script requires positive integer calls and known faults")
        # Snapshot mutable caller-owned mappings, then forbid accidental mutation.
        from types import MappingProxyType
        object.__setattr__(self, "script", MappingProxyType(dict(self.script)))

    def at(self, tool: str, call: int) -> str:
        if call in self.script:
            return self.script[call]
        return self.fault if sample(self.seed, 0, tool, call) < self.probability else "none"


def before(fault: str) -> None:
    if fault == "rate_limit":
        raise RateLimited()
    if fault == "timeout_before":
        raise ToolTimeout()
    if fault == "permanent":
        raise PermanentFailure("Injected permanent failure")


def after(fault: str) -> None:
    if fault == "timeout_after_write":
        raise ToolTimeout(after_write=True)
    if fault == "malformed":
        raise MalformedOutput("Injected output contract failure")
