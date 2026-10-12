/**
 * EmailSendersCard — connect and choose the app's outgoing email sender.
 *
 * Up to three senders can be connected independently: two Gmail accounts via
 * Google OAuth, and SendPulse. One is selected as the active sender. All
 * secrets (OAuth refresh tokens, client secrets) are stored server-side and are
 * never returned to the browser — this UI only ever sees connected/not and the
 * sender address.
 */
import { useEffect, useState } from 'react';
import { Mail, CheckCircle2, AlertTriangle, Loader2, Plug, Unplug, Send, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { API } from '@/lib/adminApi';

const SLOTS = [
  { id: 'gmail1', label: 'Gmail account 1', hint: 'Connect with Google (OAuth).' },
  { id: 'gmail2', label: 'Gmail account 2', hint: 'A second Gmail account, e.g. a fallback or a different brand address.' },
  { id: 'sendpulse', label: 'SendPulse', hint: 'Uses your SendPulse API client ID and secret.' },
];

function SenderRow({ slot, cfg, active, refresh }) {
  const acct = cfg[slot.id] || {};
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [sp, setSp] = useState({ client_id: '', client_secret: '', sender_email: '', sender_name: 'LearnAfrica' });
  const [testTo, setTestTo] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({ refresh_token: '', sender_email: '' });

  const select = async () => {
    setBusy('select'); setMsg(null);
    try {
      await API('/api/admin/email/config', { method: 'PUT', body: JSON.stringify({ selected: slot.id }) });
      refresh();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(''); }
  };

  const connectGoogle = async () => {
    setBusy('connect'); setMsg(null);
    try {
      const d = await API(`/api/admin/email/oauth/url?slot=${slot.id}`);
      window.location.href = d.url;
    } catch (e) { setMsg({ type: 'error', text: e.message }); setBusy(''); }
  };

  const connectManual = async () => {
    setBusy('manual'); setMsg(null);
    try {
      await API('/api/admin/email/connect', {
        method: 'POST',
        body: JSON.stringify({ slot: slot.id, ...manual }),
      });
      setManual({ refresh_token: '', sender_email: '' });
      setShowManual(false);
      refresh();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(''); }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect this sender? Any emails will use the selected sender instead.')) return;
    setBusy('disconnect'); setMsg(null);
    try {
      await API('/api/admin/email/disconnect', { method: 'POST', body: JSON.stringify({ slot: slot.id }) });
      refresh();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(''); }
  };

  const saveSendpulse = async () => {
    setBusy('save'); setMsg(null);
    try {
      await API('/api/admin/email/config', {
        method: 'PUT',
        body: JSON.stringify({
          sendpulse_client_id: sp.client_id,
          sendpulse_client_secret: sp.client_secret,
          sendpulse_sender_email: sp.sender_email,
          sendpulse_sender_name: sp.sender_name,
        }),
      });
      setMsg({ type: 'success', text: 'SendPulse credentials saved.' });
      refresh();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(''); }
  };

  const sendTest = async () => {
    setBusy('test'); setMsg(null);
    try {
      const d = await API('/api/admin/email/test', {
        method: 'POST',
        body: JSON.stringify({ slot: slot.id, to: testTo }),
      });
      setMsg({ type: 'success', text: d.message || 'Test email sent.' });
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(''); }
  };

  const connected = !!acct.connected;
  const hasCreds = !!acct.has_credentials;

  return (
    <div className={`rounded-xl border p-4 ${active ? 'border-primary bg-primary/5' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${connected ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
            <Mail className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-sm flex items-center gap-2 flex-wrap">
              {slot.label}
              {active && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                  Active
                </span>
              )}
              {connected
                ? <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-success/10 text-success">Connected</span>
                : <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Not connected</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {acct.sender_email || slot.hint}
            </p>
            {acct.last_error && (
              <p className="text-xs text-destructive mt-0.5 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />{acct.last_error}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {connected && (
            <label className="flex items-center gap-1.5 text-xs cursor-pointer font-medium">
              <input type="radio" name="email-sender" checked={active} disabled={busy === 'select'}
                onChange={select} />
              {active ? 'This is the active sender' : 'Make active'}
            </label>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {(slot.id === 'gmail1' || slot.id === 'gmail2') && (
          <>
            <Button size="sm" onClick={connectGoogle} disabled={busy === 'connect'}>
              {busy === 'connect' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
              {connected ? 'Reconnect with Google' : 'Connect with Google'}
            </Button>
            <button type="button" onClick={() => setShowManual(s => !s)}
              className="text-xs text-muted-foreground hover:text-foreground underline">
              {showManual ? 'Hide manual setup' : 'Enter a refresh token manually'}
            </button>
          </>
        )}

        {connected && (
          <>
            <input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="test recipient email"
              className="h-9 rounded-lg border border-border bg-background px-2 text-xs min-w-[200px]" />
            <Button size="sm" variant="outline" onClick={sendTest} disabled={busy === 'test'}>
              {busy === 'test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send test
            </Button>
            <Button size="sm" variant="outline" onClick={disconnect} disabled={busy === 'disconnect'}>
              <Unplug className="h-3.5 w-3.5" /> Disconnect
            </Button>
          </>
        )}
      </div>

      {showManual && (
        <div className="mt-3 space-y-2 rounded-lg bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">
            Paste a Google OAuth refresh token you already generated for this project.
          </p>
          <input value={manual.refresh_token} onChange={e => setManual(m => ({ ...m, refresh_token: e.target.value }))}
            placeholder="1//0g… refresh token" className="w-full rounded-lg border border-border bg-background p-2 text-xs" />
          <input value={manual.sender_email} onChange={e => setManual(m => ({ ...m, sender_email: e.target.value }))}
            placeholder="sender address (optional)" className="w-full rounded-lg border border-border bg-background p-2 text-xs" />
          <Button size="sm" onClick={connectManual} disabled={busy === 'manual' || !manual.refresh_token}>
            {busy === 'manual' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />} Connect
          </Button>
        </div>
      )}

      {slot.id === 'sendpulse' && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input value={sp.client_id} onChange={e => setSp(s => ({ ...s, client_id: e.target.value }))}
            placeholder="Client ID" className="rounded-lg border border-border bg-background p-2 text-xs" />
          <input value={sp.client_secret} onChange={e => setSp(s => ({ ...s, client_secret: e.target.value }))}
            type="password" placeholder="Client Secret (leave blank to keep)"
            className="rounded-lg border border-border bg-background p-2 text-xs" />
          <input value={sp.sender_email} onChange={e => setSp(s => ({ ...s, sender_email: e.target.value }))}
            placeholder="Sender email" className="rounded-lg border border-border bg-background p-2 text-xs" />
          <input value={sp.sender_name} onChange={e => setSp(s => ({ ...s, sender_name: e.target.value }))}
            placeholder="Sender name" className="rounded-lg border border-border bg-background p-2 text-xs" />
          <Button size="sm" onClick={saveSendpulse} disabled={busy === 'save'}>
            {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save SendPulse'}
          </Button>
        </div>
      )}

      {msg && (
        <p className={`text-xs mt-2 ${msg.type === 'error' ? 'text-destructive' : 'text-success'}`}>{msg.text}</p>
      )}
    </div>
  );
}

export default function EmailSendersCard() {
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = () => {
    setLoading(true);
    API('/api/admin/email/config')
      .then(setCfg)
      .catch(e => setMsg({ type: 'error', text: e.message }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const setEnabled = async (enabled) => {
    setSaving(true); setMsg(null);
    try {
      const d = await API('/api/admin/email/config', { method: 'PUT', body: JSON.stringify({ enabled }) });
      setCfg(d);
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-bold">Email Senders</h3>
        <p className="text-xs text-muted-foreground">
          Connect Gmail accounts or SendPulse, then choose which one sends verification codes and
          other emails. You can connect all three and switch freely.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !cfg ? (
          <div className="text-sm text-destructive">Could not load email settings.</div>
        ) : (
          <div className="space-y-4">
            {/* At-a-glance status: which sender is live right now. */}
            <div className={`rounded-lg border p-3 text-sm ${cfg.enabled ? 'border-success/30 bg-success/5' : 'border-border bg-muted/40'}`}>
              <p className="font-medium">
                {cfg.enabled
                  ? <>Email sending is <span className="text-success font-bold">ON</span> — active sender:{' '}
                      <span className="font-bold">{(SLOTS.find(x => x.id === cfg.selected) || {}).label || cfg.selected || 'none'}</span></>
                  : <>Email sending is <span className="font-bold">OFF</span> — no emails are sent, including password resets.</>}
              </p>
            </div>

            <details className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-semibold text-foreground">Quick guide</summary>
              <ul className="mt-2 space-y-1 list-disc pl-4">
                <li><strong>ON/OFF</strong> — the master switch. When off, nothing is emailed at all.</li>
                <li><strong>Active sender</strong> — the sender marked <em>Active</em> is used first.</li>
                <li><strong>Failover</strong> — if it fails, the next connected sender is tried: Gmail 1 → Gmail 2 → SendPulse.</li>
                <li><strong>Switch</strong> — tick <em>Make active</em> on another connected row; no redeploy needed.</li>
                <li><strong>Skipped</strong> — senders you never connected are skipped automatically.</li>
              </ul>
            </details>

            <label className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border">
              <div>
                <p className="text-sm font-semibold">Email sending</p>
                <p className="text-xs text-muted-foreground">
                  Master switch. When off, no email is sent at all.
                </p>
              </div>
              <input type="checkbox" checked={!!cfg.enabled} disabled={saving}
                onChange={e => setEnabled(e.target.checked)} className="h-4 w-4" />
            </label>

            {SLOTS.map(slot => (
              <SenderRow key={slot.id} slot={slot} cfg={cfg}
                active={cfg.selected === slot.id} refresh={load} />
            ))}

            {msg && (
              <p className={`text-xs ${msg.type === 'error' ? 'text-destructive' : 'text-success'}`}>{msg.text}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
