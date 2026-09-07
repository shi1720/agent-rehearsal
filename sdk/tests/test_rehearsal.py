import asyncio
import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from rehearsal import Recorder, FaultPlan, ToolTimeout, RateLimited, PermanentFailure, MalformedOutput, RetryPolicy, BudgetExceeded, retry_call, retry_async, sample
from rehearsal.cli import main as cli
from rehearsal.schema import validate_trace

ROOT = Path(__file__).resolve().parents[2]

class RecorderTests(unittest.TestCase):
    def test_metadata_only(self):
        r=Recorder('privacy')
        @r.tool
        def tool(api_key):
            raise ValueError('secret exception payload '+api_key)
        with self.assertRaises(ValueError): tool('sk-sensitive-123')
        serialized=json.dumps(r.snapshot())
        self.assertNotIn('sensitive',serialized)
        self.assertNotIn('payload',serialized)
        self.assertEqual(r.snapshot()['events'][0]['errorType'],'ValueError')

    def test_sensitive_custom_class_name_omitted(self):
        sensitive_error=type('SecretToken123', (Exception,), {})
        r=Recorder('private')
        @r.tool
        def tool(): raise sensitive_error('secret')
        with self.assertRaises(sensitive_error): tool()
        self.assertNotIn('SecretToken123',json.dumps(r.snapshot()))

    def test_fault_before_prevents_side_effect(self):
        r=Recorder('before'); effects=[]
        @r.tool(kind='write',faults=FaultPlan({1:'timeout_before'}))
        def tool():effects.append(1)
        with self.assertRaises(ToolTimeout): tool()
        self.assertEqual(effects,[])
        self.assertEqual(r.snapshot()['events'][0]['effect'],'none')

    def test_fault_after_performs_side_effect_and_marks_unknown(self):
        r=Recorder('after');effects=[]
        @r.tool(kind='write',faults=FaultPlan({1:'timeout_after_write'}))
        def tool():effects.append(1)
        with self.assertRaises(ToolTimeout):tool()
        self.assertEqual(effects,[1]);event=r.snapshot()['events'][0]
        self.assertEqual(event['effect'],'unknown');self.assertEqual(event['fault'],'timeout_after_write')

    def test_falsey_exception_is_still_failure(self):
        class Falsey(Exception):
            def __bool__(self):return False
        r=Recorder('falsey')
        @r.tool(kind='write')
        def tool(): raise Falsey()
        with self.assertRaises(Falsey):tool()
        self.assertEqual(r.snapshot()['events'][0]['status'],'error')
        self.assertEqual(r.snapshot()['events'][0]['effect'],'unknown')

    def test_nested_injection_does_not_claim_outer_planned_fault(self):
        r=Recorder('nested')
        @r.tool(faults=FaultPlan({1:'timeout_after_write'}))
        def tool():raise RateLimited()
        with self.assertRaises(RateLimited):tool()
        event=r.snapshot()['events'][0]
        self.assertEqual(event['status'],'error');self.assertEqual(event['fault'],'none')

    def test_fault_plan_is_snapshot_and_deterministic(self):
        script={1:'permanent'};plan=FaultPlan(script);script[1]='none'
        self.assertEqual(plan.at('x',1),'permanent')
        self.assertEqual(plan.at('x',2),'none')
        with self.assertRaises(TypeError):plan.script[1]='none'
        a=FaultPlan(seed=8,probability=.4);b=FaultPlan(seed=8,probability=.4)
        self.assertEqual([a.at('tool',i) for i in range(1,30)],[b.at('tool',i) for i in range(1,30)])

    def test_thread_safety_and_event_limit(self):
        r=Recorder('parallel',max_events=100)
        @r.tool
        def tool(n):return n*2
        with ThreadPoolExecutor(max_workers=8) as pool:self.assertEqual(sum(pool.map(tool,range(100))),9900)
        events=r.snapshot()['events'];self.assertEqual(len(events),100);self.assertEqual(len({e['id'] for e in events}),100)
        with self.assertRaises(RuntimeError):tool(101)
        self.assertEqual(len(r.snapshot()['events']),100)

    def test_export_refuses_inflight(self):
        r=Recorder('running');entered=threading.Event();release=threading.Event()
        @r.tool
        def tool():entered.set();release.wait(2)
        thread=threading.Thread(target=tool);thread.start();entered.wait(1)
        try:
            with self.assertRaises(RuntimeError):r.snapshot()
        finally:release.set();thread.join()
        self.assertEqual(len(r.snapshot()['events']),1)

    def test_atomic_export_and_cli(self):
        r=Recorder('export')
        @r.tool
        def tool():return {'sensitive':'result'}
        tool()
        with tempfile.TemporaryDirectory() as td:
            path=r.export(Path(td)/'trace.json');self.assertEqual(path.stat().st_mode & 0o777,0o600)
            validate_trace(json.loads(path.read_text()))
            with contextlib.redirect_stdout(io.StringIO()):self.assertEqual(cli([str(path),'--fail-on-errors']),0)
            self.assertEqual(list(Path(td).glob('.rehearsal-*')),[])

    def test_schema_type_bounds_and_duplicates(self):
        r=Recorder('schema')
        @r.tool
        def tool():return None
        tool();valid=r.snapshot();validate_trace(valid)
        for key,bad in [('durationMs',10**1000),('status',['ok']),('fault',{}),('attempt',True),('durationMs',float('nan'))]:
            data=json.loads(json.dumps(valid));data['events'][0][key]=bad
            with self.assertRaises((ValueError,TypeError)):validate_trace(data)
        with self.assertRaises(ValueError):validate_trace({**valid,'events':valid['events']*2})

    def test_labels_match_javascript_unicode_limit(self):
        Recorder('😀'*160)
        with self.assertRaises(ValueError):Recorder('😀'*161)
        for name in ['', 'x\n', 'x'*161]:
            with self.assertRaises(ValueError):Recorder(name)

    def test_generators_rejected(self):
        r=Recorder('generator')
        def tool():yield 1
        with self.assertRaises(TypeError):r.tool(tool)

    def test_lazy_coroutine_from_sync_function_rejected(self):
        r=Recorder('lazy')
        async def inner():return 1
        @r.tool
        def tool():return inner()
        with self.assertRaises(TypeError):tool()
        self.assertEqual(r.snapshot()['events'][0]['status'],'error')

    def test_all_fault_types(self):
        for fault,exception in [('rate_limit',RateLimited),('timeout_before',ToolTimeout),('timeout_after_write',ToolTimeout),('permanent',PermanentFailure),('malformed',MalformedOutput)]:
            r=Recorder(fault)
            @r.tool(kind='write',faults=FaultPlan({1:fault}))
            def tool():return 'ok'
            with self.assertRaises(exception):tool()
            self.assertEqual(r.snapshot()['events'][0]['fault'],fault)
            self.assertEqual(tool(),'ok')

    def test_shared_random_vectors(self):
        vectors=json.loads((ROOT/'fixtures/random-vectors.json').read_text())
        for v in vectors:self.assertEqual(sample(v['seed'],v['trial'],v['step'],v['attempt'],v['channel']),v['expected'])

    def test_invalid_policies(self):
        for kwargs in [{'max_attempts':True},{'backoff_ms':-1},{'budget_ms':0},{'max_attempts':21}]:
            with self.assertRaises(ValueError):RetryPolicy(**kwargs)
        for kwargs in [{'probability':float('nan')},{'seed':True},{'script':{0:'none'}},{'fault':'x'}]:
            with self.assertRaises(ValueError):FaultPlan(**kwargs)

class RetryTests(unittest.TestCase):
    def test_read_retries(self):
        calls=[]
        def tool():
            calls.append(1)
            if len(calls)<3:raise ConnectionError()
            return 42
        self.assertEqual(retry_call(tool,policy=RetryPolicy(backoff_ms=0)),42)
        self.assertEqual(len(calls),3)

    def test_nonidempotent_outer_write_never_retries_nested_failure(self):
        for error in [ToolTimeout(),RateLimited(),ToolTimeout(True),ConnectionError(),MalformedOutput()]:
            charges=[]
            def outer():charges.append(1);raise error
            with self.assertRaises(type(error)):retry_call(outer,kind='write',policy=RetryPolicy(backoff_ms=0))
            self.assertEqual(charges,[1])

    def test_idempotent_write_retries_with_caller_implemented_contract(self):
        attempts=[];bank={}
        def tool():
            attempts.append(1);bank.setdefault('same-operation',29)
            if len(attempts)==1:raise ToolTimeout(True)
            return bank['same-operation']
        self.assertEqual(retry_call(tool,kind='write',idempotent=True,policy=RetryPolicy(backoff_ms=0)),29)
        self.assertEqual(len(bank),1);self.assertEqual(len(attempts),2)

    def test_permanent_failure_not_retried(self):
        calls=[]
        def tool():calls.append(1);raise PermanentFailure()
        with self.assertRaises(PermanentFailure):retry_call(tool)
        self.assertEqual(len(calls),1)

    def test_retry_after_fits_deadline(self):
        now=[0.];waits=[];calls=[]
        def sleep(n):waits.append(n);now[0]+=n
        def tool():
            calls.append(1)
            if len(calls)==1:raise RateLimited(1200)
            return 'ok'
        self.assertEqual(retry_call(tool,clock=lambda:now[0],sleep=sleep),'ok');self.assertGreaterEqual(waits[0],1.2)

    def test_backoff_does_not_overshoot_budget(self):
        calls=[]
        def tool():calls.append(1);raise RateLimited(2000)
        with self.assertRaises(BudgetExceeded):retry_call(tool,policy=RetryPolicy(budget_ms=1000),sleep=lambda _:self.fail('must not sleep'))
        self.assertEqual(len(calls),1)

    def test_sync_late_return_is_not_claimed_within_deadline(self):
        now=[0.]
        def tool():now[0]=2.;return 'late'
        with self.assertRaises(BudgetExceeded):retry_call(tool,clock=lambda:now[0],policy=RetryPolicy(budget_ms=1000))

class AsyncTests(unittest.IsolatedAsyncioTestCase):
    async def test_async_record(self):
        r=Recorder('async')
        @r.tool
        async def tool():await asyncio.sleep(0);return 42
        self.assertEqual(await tool(),42);self.assertEqual(r.snapshot()['events'][0]['status'],'ok')

    async def test_async_callable_instance(self):
        class Tool:
            async def __call__(self):raise ValueError('hidden')
        r=Recorder('instance');tool=r.tool(Tool(),name='instance')
        with self.assertRaises(ValueError):await tool()
        self.assertEqual(r.snapshot()['events'][0]['status'],'error')

    async def test_async_cancellation_propagates(self):
        r=Recorder('cancel');started=asyncio.Event()
        @r.tool(kind='write')
        async def tool():started.set();await asyncio.sleep(60)
        task=asyncio.create_task(retry_async(tool,kind='write'));await started.wait();task.cancel()
        with self.assertRaises(asyncio.CancelledError):await task
        events=r.snapshot()['events'];self.assertEqual(len(events),1);self.assertEqual(events[0]['status'],'cancelled');self.assertEqual(events[0]['effect'],'unknown')

    async def test_async_deadline(self):
        async def tool():await asyncio.sleep(1)
        with self.assertRaises(BudgetExceeded):await retry_async(tool,policy=RetryPolicy(budget_ms=10))

    async def test_completion_cancellation_race_on_python39(self):
        async def tool():
            asyncio.get_running_loop().call_soon(task.cancel)
            return 42
        task=asyncio.create_task(retry_async(tool))
        with self.assertRaises(asyncio.CancelledError):await task

    async def test_asyncio_timeout_retries_on_python39(self):
        calls=[]
        async def tool():
            calls.append(1)
            if len(calls)==1:raise asyncio.TimeoutError()
            return 7
        self.assertEqual(await retry_async(tool,policy=RetryPolicy(backoff_ms=0)),7);self.assertEqual(len(calls),2)

    async def test_async_side_effect_conservative(self):
        calls=[]
        async def tool():calls.append(1);raise ToolTimeout()
        with self.assertRaises(ToolTimeout):await retry_async(tool,kind='write')
        self.assertEqual(len(calls),1)

if __name__=='__main__':unittest.main()
