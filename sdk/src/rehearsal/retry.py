"""Small opt-in retry helpers. Recording alone never changes retry behavior."""
import asyncio
from dataclasses import dataclass
import time
from typing import Callable, Optional
from .chaos import RateLimited, ToolTimeout, PermanentFailure, MalformedOutput, sample


@dataclass(frozen=True)
class RetryPolicy:
    max_attempts: int = 3
    backoff_ms: int = 100
    budget_ms: int = 5000

    def __post_init__(self):
        for name, minimum, maximum in (("max_attempts", 1, 20), ("backoff_ms", 0, 60000), ("budget_ms", 1, 3600000)):
            value = getattr(self, name)
            if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
                raise ValueError(f"{name} must be an integer between {minimum} and {maximum}")


class BudgetExceeded(TimeoutError):
    """The retry deadline expired. The last operation may have had side effects."""


def _retryable(error: Exception, kind: str, idempotent: bool) -> bool:
    if isinstance(error, PermanentFailure) or isinstance(error, PermissionError):
        return False
    # Nested failures do not prove that this outer operation did no work.
    # Without an idempotency contract, every write exception requires escalation.
    if kind == "write" and not idempotent:
        return False
    return isinstance(error, (RateLimited, TimeoutError, asyncio.TimeoutError, ConnectionError, MalformedOutput))



def _wait_ms(policy: RetryPolicy, attempt: int, error: Exception, seed: int) -> float:
    delay = policy.backoff_ms * 2 ** (attempt - 1) * (0.75 + sample(seed, 0, "retry", attempt, "jitter") * 0.5)
    if isinstance(error, RateLimited):
        delay = max(delay, error.retry_after_ms)
    return delay


def _validate(kind: str, idempotent: bool):
    if kind not in ("read", "write"):
        raise ValueError("kind must be read or write")
    if not isinstance(idempotent, bool):
        raise TypeError("idempotent must be a boolean")


def retry_call(function: Callable, *, policy: Optional[RetryPolicy] = None,
               kind: str = "read", idempotent: bool = False, seed: int = 1720,
               clock: Callable[[], float] = time.monotonic,
               sleep: Callable[[float], None] = time.sleep):
    """Retry a zero-argument callable. Sync timeouts must be enforced by its transport.

    A stable idempotency key must be implemented BY THE TOOL before setting
    idempotent=True. This helper does not add a key or guarantee exactly-once work.
    A running sync call is not interrupted; a late result raises BudgetExceeded.
    """
    _validate(kind, idempotent)
    policy = policy or RetryPolicy()
    deadline = clock() + policy.budget_ms / 1000
    for attempt in range(1, policy.max_attempts + 1):
        if clock() >= deadline:
            raise BudgetExceeded("Retry deadline exceeded")
        try:
            result = function()
        except Exception as error:
            if not _retryable(error, kind, idempotent) or attempt == policy.max_attempts:
                raise
            delay = _wait_ms(policy, attempt, error, seed) / 1000
            if clock() + delay >= deadline:
                raise BudgetExceeded("No budget remains for retry") from error
            sleep(delay)
        else:
            if clock() > deadline:
                raise BudgetExceeded("Tool returned after the retry deadline")
            return result
    raise AssertionError("unreachable")


async def _within_deadline(awaitable, seconds):
    # asyncio.wait_for on Python 3.9 can swallow caller cancellation when the
    # child completes concurrently. wait() preserves the outer cancellation.
    child = asyncio.ensure_future(awaitable)
    try:
        done, _ = await asyncio.wait({child}, timeout=seconds)
        if not done:
            child.cancel()
            await asyncio.gather(child, return_exceptions=True)
            raise BudgetExceeded("Async retry deadline exceeded")
        return child.result()
    except BaseException:
        if not child.done():
            child.cancel()
        await asyncio.gather(child, return_exceptions=True)
        raise


async def retry_async(function: Callable, *, policy: Optional[RetryPolicy] = None,
                      kind: str = "read", idempotent: bool = False, seed: int = 1720):
    """Async retry with a total cooperative cancellation deadline.

    The deadline waits for cancellation to complete. A tool which suppresses
    cancellation may exceed the deadline; a late return is still rejected.
    """
    _validate(kind, idempotent)
    policy = policy or RetryPolicy()
    loop = asyncio.get_running_loop()
    deadline = loop.time() + policy.budget_ms / 1000
    for attempt in range(1, policy.max_attempts + 1):
        remaining = deadline - loop.time()
        if remaining <= 0:
            raise BudgetExceeded("Retry deadline exceeded")
        try:
            result = await _within_deadline(function(), remaining)
        except Exception as error:
            if loop.time() >= deadline:
                raise BudgetExceeded("Async retry deadline exceeded") from error
            if not _retryable(error, kind, idempotent) or attempt == policy.max_attempts:
                raise
            delay = _wait_ms(policy, attempt, error, seed) / 1000
            if loop.time() + delay >= deadline:
                raise BudgetExceeded("No budget remains for retry") from error
            await asyncio.sleep(delay)
        else:
            if loop.time() > deadline:
                raise BudgetExceeded("Tool returned after the retry deadline")
            return result
    raise AssertionError("unreachable")
