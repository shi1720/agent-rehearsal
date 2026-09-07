"""Validation for the portable v1 trace, mirrored by the browser importer."""
import math
from .chaos import FAULTS
from .recorder import _label


def _number(value, label, minimum, maximum, integer=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < minimum or value > maximum or not math.isfinite(value) or (integer and value != int(value)):
        raise ValueError(f"invalid {label}")
    return value


def validate_trace(value):
    if not isinstance(value, dict) or type(value.get("schemaVersion")) is not int or value["schemaVersion"] != 1:
        raise ValueError("unsupported trace schema")
    _label(value.get("name"), "name")
    if value.get("source") not in ("python-sdk", "manual"):
        raise ValueError("unsupported trace source")
    events = value.get("events")
    if not isinstance(events, list) or not 1 <= len(events) <= 5000:
        raise ValueError("expected 1..5000 events")
    ids = set()
    result = []
    for event in events:
        if not isinstance(event, dict):
            raise ValueError("event must be an object")
        event_id = _label(event.get("id"), "id")
        if event_id in ids:
            raise ValueError("duplicate event ID")
        ids.add(event_id)
        _label(event.get("tool"), "tool")
        if event.get("kind") not in ("read", "write") or event.get("status") not in ("ok", "error", "cancelled", "injected") or not isinstance(event.get("fault"), str) or event.get("fault") not in FAULTS or event.get("effect") not in ("none", "unknown", "committed"):
            raise ValueError("invalid event enum")
        _number(event.get("attempt"), "attempt", 1, 100000, True)
        _number(event.get("startMs"), "startMs", 0, 1e12)
        _number(event.get("durationMs"), "durationMs", 0, 1e12)
        clean = {key: event[key] for key in ("id", "tool", "kind", "attempt", "startMs", "durationMs", "status", "fault", "effect")}
        if event.get("errorType"):
            clean["errorType"] = _label(event["errorType"], "errorType")
        result.append(clean)
    return {"schemaVersion": 1, "name": value["name"], "source": value["source"], "events": result}
