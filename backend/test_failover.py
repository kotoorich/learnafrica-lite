"""Focused test: email sender failover (primary Gmail -> secondary Gmail -> SendPulse)."""
import sys, os, importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('email_service', os.path.join(HERE, 'app', 'email_service.py'))
es = importlib.util.module_from_spec(spec); spec.loader.exec_module(es)

class FakeDB:
    def __init__(self): self.settings = {}
    def execute(self, sql, params=()):
        return self
    def fetchone(self): return None
    def commit(self): pass

def cfg(selected='gmail1', g1=True, g2=True, sp=True):
    c = es.default_config()
    c['selected'] = selected
    c['gmail1']['connected'] = g1
    c['gmail1']['refresh_token'] = 'rt1' if g1 else ''
    c['gmail2']['connected'] = g2
    c['gmail2']['refresh_token'] = 'rt2' if g2 else ''
    c['sendpulse']['connected'] = sp
    c['sendpulse']['client_id'] = 'x' if sp else ''
    c['sendpulse']['client_secret'] = 'y' if sp else ''
    c['sendpulse']['sender_email'] = 'a@b.com' if sp else ''
    return c

def run(selected, results):
    """results: dict slot -> (ok, err). Returns the list of slots attempted."""
    calls = []
    es.load_email_config = lambda db: cfg(selected)
    es.save_email_config = lambda *a, **k: None
    def fake_dispatch(c, slot, *a, **k):
        calls.append(slot)
        return results[slot]
    es._dispatch = fake_dispatch
    ok, err = es.send_email(FakeDB(), 'to@x.com', 'T', 'S', '<p>h</p>', 't')
    return calls, ok, err

# 1. gmail1 fails retryable -> gmail2
calls, ok, err = run('gmail1', {'gmail1': (False, 'Gmail send exception: timeout'),
                                'gmail2': (True, None), 'sendpulse': (True, None)})
assert calls == ['gmail1', 'gmail2'] and ok, (calls, ok, err)
print('PASS primary fails retryable -> secondary used', calls)

# 2. gmail1 and gmail2 fail -> sendpulse
calls, ok, err = run('gmail1', {'gmail1': (False, 'Gmail send exception: timeout'),
                                'gmail2': (False, 'Gmail send exception: timeout'),
                                'sendpulse': (True, None)})
assert calls == ['gmail1', 'gmail2', 'sendpulse'] and ok, (calls, ok, err)
print('PASS both gmails fail -> SendPulse used', calls)

# 3. primary succeeds -> nothing else tried
calls, ok, err = run('gmail1', {'gmail1': (True, None), 'gmail2': (True, None), 'sendpulse': (True, None)})
assert calls == ['gmail1'] and ok, (calls, ok, err)
print('PASS primary succeeds -> no failover', calls)

# 4. terminal failure (invalid recipient) stops — no duplicate send
calls, ok, err = run('gmail1', {'gmail1': (False, 'Gmail send failed: 400 invalid recipient'),
                                'gmail2': (True, None), 'sendpulse': (True, None)})
assert calls == ['gmail1'] and not ok, (calls, ok, err)
print('PASS terminal failure stops the chain (no duplicate)', calls)

# 5. swapped primary: gmail2 chosen -> order gmail2, gmail1, sendpulse
calls, ok, err = run('gmail2', {'gmail1': (True, None), 'gmail2': (False, 'Gmail send exception: timeout'),
                                'sendpulse': (True, None)})
assert calls == ['gmail2', 'gmail1'] and ok, (calls, ok, err)
print('PASS swapped primary honoured', calls)

# 6. targeted test-send uses only that sender (no failover)
calls = []
es.load_email_config = lambda db: cfg()
es.save_email_config = lambda *a, **k: None
def fake_dispatch2(c, slot, *a, **k):
    calls.append(slot); return (False, 'Gmail send exception: timeout')
es._dispatch = fake_dispatch2
ok, err = es.send_email(FakeDB(), 'to@x.com', 'T', 'S', 'h', 't', provider='gmail1')
assert calls == ['gmail1'] and not ok, (calls, ok, err)
print('PASS targeted test-send stays on one sender', calls)

# 7. disabled email switch
es.load_email_config = lambda db: {**cfg(), 'enabled': False}
ok, err = es.send_email(FakeDB(), 'to@x.com', 'T', 'S', 'h', 't')
assert not ok and 'turned off' in err.lower(), (ok, err)
print('PASS email-off switch honoured')

# 8. ONE Gmail + SendPulse: Gmail 2 never set up -> skipped, no red error
calls = []
es.load_email_config = lambda db: cfg('gmail1', g1=True, g2=False, sp=True)
es.save_email_config = lambda *a, **k: None
def fake_dispatch3(c, slot, *a, **k):
    calls.append(slot)
    if slot == 'gmail1': return (False, 'Gmail send exception: timeout')
    return (True, None)
es._dispatch = fake_dispatch3
ok, err = es.send_email(FakeDB(), 'to@x.com', 'T', 'S', 'h', 't')
assert calls == ['gmail1', 'sendpulse'] and ok, (calls, ok, err)
print('PASS single Gmail + SendPulse skips unconfigured Gmail 2', calls)

# 9. Nothing configured -> clear message, not a sender error
es.load_email_config = lambda db: cfg('gmail1', g1=False, g2=False, sp=False)
ok, err = es.send_email(FakeDB(), 'to@x.com', 'T', 'S', 'h', 't')
assert not ok and 'No email sender is configured' in err, (ok, err)
print('PASS nothing configured -> clear message')

print('\nALL FAILOVER CHECKS PASSED')
