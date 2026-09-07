"""Executable regression: lost payment response must not cause a duplicate charge.

Uses an in-memory sandbox only. No network calls, API keys, or dependencies.
"""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sdk" / "src"))
from rehearsal import Recorder, FaultPlan, ToolTimeout, RetryPolicy, retry_call


class PaymentSandbox:
    def __init__(self):
        self.charges = []
        self.results = {}

    def charge(self, amount, key=None):
        if key is not None and key in self.results:
            return self.results[key]
        receipt = {"id": f"charge-{len(self.charges)+1}", "amount": amount}
        self.charges.append(receipt)
        if key is not None:
            self.results[key] = receipt
        return receipt


def main():
    recorder = Recorder("Checkout: a payment succeeded, then timed out")
    unsafe_bank, safe_bank = PaymentSandbox(), PaymentSandbox()

    @recorder.tool(name="blind.payments.charge", kind="write", faults=FaultPlan({1: "timeout_after_write"}))
    def blind_charge():
        return unsafe_bank.charge(2900)

    try:
        blind_charge()
    except ToolTimeout:
        blind_charge()  # Deliberately buggy control.

    @recorder.tool(name="guarded.payments.charge", kind="write", faults=FaultPlan({1: "timeout_after_write"}))
    def guarded_charge():
        return safe_bank.charge(2900, key="order-demo-001")

    receipt = retry_call(guarded_charge, kind="write", idempotent=True,
                         policy=RetryPolicy(backoff_ms=0))
    assert len(unsafe_bank.charges) == 2, "broken control did not reproduce the duplicate"
    assert len(safe_bank.charges) == 1, "idempotency regression: customer charged twice"
    assert receipt["id"] == "charge-1"
    target = Path(sys.argv[1]) if len(sys.argv)>1 else Path("trace.json")
    recorder.export(target)
    print(f"Blind retry: {len(unsafe_bank.charges)} charges. Guarded retry: {len(safe_bank.charges)} charge.")
    print(f"PASS: lost-response regression. Trace written to {target}")
    return recorder.snapshot()


if __name__ == "__main__":
    main()
