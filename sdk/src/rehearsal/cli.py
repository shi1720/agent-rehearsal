"""Validate a metadata trace in CI; nonzero exits support regression gates."""
import argparse
import json
from pathlib import Path
import sys
from .schema import validate_trace


def main(argv=None):
    parser = argparse.ArgumentParser(description="Validate an Agent Rehearsal trace without executing tools")
    parser.add_argument("trace", type=Path)
    parser.add_argument("--fail-on-errors", action="store_true", help="Fail when any recorded call has a non-OK status")
    args = parser.parse_args(argv)
    try:
        if args.trace.stat().st_size > 2 * 1024 * 1024:
            raise ValueError("trace exceeds 2 MB")
        trace = validate_trace(json.loads(args.trace.read_text(encoding="utf-8")))
    except (OSError, UnicodeError, ValueError, TypeError, OverflowError) as error:
        print(f"Invalid trace: {type(error).__name__}", file=sys.stderr)
        return 2
    errors = sum(event["status"] != "ok" for event in trace["events"])
    print(json.dumps({"valid": True, "events": len(trace["events"]), "nonOk": errors}))
    return 1 if args.fail_on_errors and errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
