/**
 * EmailUsageCard — per-provider sending usage for the admin dashboard.
 *
 * Counts successful sends only. When a provider exposes a real quota we show it;
 * otherwise the figure is an application estimate and is labelled as such.
 */
import { useEffect, useState } from 'react';
import { Mail, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { API } from '@/lib/adminApi';

const STATUS_STYLE = {
  ok: 'bg-success/10 text-success',
  approaching: 'bg-amber-500/10 text-amber-600',
  exhausted: 'bg-destructive/10 text-destructive',
  error: 'bg-destructive/10 text-destructive',
};

function Bar({ percent }) {
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  const tone = pct >= 100 ? 'bg-destructive' : pct >= 80 ? 'bg-amber-500' : 'bg-success';
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function EmailUsageCard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingLimit, setSavingLimit] = useState('');
  const [msg, setMsg] = useState(null);

  const load = (refresh) => {
    setLoading(true);
    API(`/api/admin/email/usage${refresh ? '?refresh=1' : ''}`)
      .then(d => setRows(d.usage || []))
      .catch(e => setMsg({ type: 'error', text: e.message }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(false); }, []);

  const setLimit = async (provider, limit) => {
    setSavingLimit(provider); setMsg(null);
    try {
      await API('/api/admin/email/usage/limit', {
        method: 'PUT', body: JSON.stringify({ provider, limit: Number(limit) }),
      });
      load(false);
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setSavingLimit(''); }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-bold">Email Usage</h3>
            <p className="text-xs text-muted-foreground">
              Successful sends per account today. Failed attempts are not counted.
              Gmail limits are estimates; SendPulse reports its own quota.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => load(true)} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No usage recorded yet.</div>
        ) : (
          <div className="space-y-3">
            {rows.map(r => (
              <div key={r.provider} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-muted text-muted-foreground">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                        {r.name}
                        {r.active
                          ? <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-success/10 text-success">Active</span>
                          : <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Inactive</span>}
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status] || STATUS_STYLE.ok}`}>
                          {r.status}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.sender_email || (r.connected ? 'Connected' : 'Not connected')}
                        {r.is_estimate ? ' · limit is an estimate' : ' · limit reported by provider'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{r.sent_today}{r.limit ? ` / ${r.limit}` : ''}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.percent != null ? `${r.percent}% used today` : 'no limit set'}
                      {' · '}{r.sent_total} total
                    </p>
                  </div>
                </div>

                <div className="mt-3"><Bar percent={r.percent} /></div>

                {r.last_error && (
                  <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />{r.last_error}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-3">
                  <label className="text-xs text-muted-foreground">Daily limit</label>
                  <input
                    type="number" min="0" defaultValue={r.limit || ''}
                    onBlur={e => {
                      const v = e.target.value;
                      if (v !== '' && Number(v) !== r.limit) setLimit(r.provider, v);
                    }}
                    className="h-8 w-28 rounded-lg border border-border bg-background px-2 text-xs"
                  />
                  {savingLimit === r.provider && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
              </div>
            ))}
          </div>
        )}
        {msg && (
          <p className={`text-xs mt-3 ${msg.type === 'error' ? 'text-destructive' : 'text-success'}`}>{msg.text}</p>
        )}
      </CardContent>
    </Card>
  );
}
