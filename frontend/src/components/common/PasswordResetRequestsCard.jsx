/**
 * PasswordResetRequestsCard — admin review of forgot-password requests.
 *
 * Lists every request (email, reason, date/time, status) and, per request, lets
 * an administrator generate a one-time reset link, copy it, optionally email it
 * (only when outgoing email is on), or dismiss it. The raw link is shown once
 * and can be copied; it is never stored or logged.
 */
import { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCw, Loader2, Copy, Check, Mail, Link2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { API } from '@/lib/adminApi';

const STATUS_STYLES = {
  pending:   'bg-amber-500/10 text-amber-600 border-amber-500/20',
  link_sent: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  completed: 'bg-success/10 text-success border-success/20',
  dismissed: 'bg-muted text-muted-foreground border-border',
};

function fmt(ts) {
  if (!ts) return '—';
  try { return new Date(ts.replace(' ', 'T') + (ts.includes('Z') ? '' : 'Z')).toLocaleString(); }
  catch { return ts; }
}

export default function PasswordResetRequestsCard() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState('');
  const [links, setLinks] = useState({});   // request_id -> link
  const [copied, setCopied] = useState('');
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    API(`/api/admin/password-reset-requests?status=${filter}`)
      .then(d => setRequests(d.requests || []))
      .catch(e => setMsg({ type: 'error', text: e.message }))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const generate = async (rid) => {
    setBusy(rid); setMsg(null);
    try {
      const d = await API(`/api/admin/password-reset-requests/${rid}/generate-link`, { method: 'POST' });
      setLinks(prev => ({ ...prev, [rid]: d.link }));
      setMsg({ type: 'success', text: `Link generated. It expires in ${d.expires_hours || 12} hours.` });
      load();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(''); }
  };

  const copy = async (rid, link) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(rid);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setMsg({ type: 'error', text: 'Could not copy. Select the link and copy it manually.' });
    }
  };

  const emailIt = async (rid, link) => {
    setBusy(rid); setMsg(null);
    try {
      const d = await API(`/api/admin/password-reset-requests/${rid}/email-link`, {
        method: 'POST', body: JSON.stringify({ link }),
      });
      setMsg({ type: 'success', text: d.message });
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(''); }
  };

  const dismiss = async (rid) => {
    setBusy(rid); setMsg(null);
    try {
      await API(`/api/admin/password-reset-requests/${rid}/dismiss`, { method: 'POST' });
      setMsg({ type: 'success', text: 'Request dismissed.' });
      load();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(''); }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-bold flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" /> Forgot Password Requests
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Users who asked for help. Generate a one-time link and share it, or email it
              when outgoing email is on.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-2 text-xs">
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="link_sent">Link sent</option>
              <option value="completed">Completed</option>
              <option value="dismissed">Dismissed</option>
            </select>
            <Button size="sm" variant="outline" onClick={load} className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {msg && (
          <p className={`text-xs mb-3 ${msg.type === 'error' ? 'text-destructive' : 'text-success'}`}>{msg.text}</p>
        )}
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin inline" />
          </div>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No requests.</p>
        ) : (
          <div className="space-y-3">
            {requests.map(r => (
              <div key={r.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{r.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.reason || 'Forgot Password'} · {fmt(r.created_at)}
                    </p>
                  </div>
                  <Badge className={STATUS_STYLES[r.status] || STATUS_STYLES.dismissed}>
                    {r.status.replace('_', ' ')}
                  </Badge>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => generate(r.id)} disabled={busy === r.id} className="gap-1.5">
                    {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                    Generate Password Reset Link
                  </Button>
                  {links[r.id] && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => copy(r.id, links[r.id])} className="gap-1.5">
                        {copied === r.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied === r.id ? 'Copied' : 'Copy link'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => emailIt(r.id, links[r.id])}
                        disabled={busy === r.id} className="gap-1.5">
                        <Mail className="h-3.5 w-3.5" /> Email link
                      </Button>
                    </>
                  )}
                  {r.status !== 'completed' && r.status !== 'dismissed' && (
                    <Button size="sm" variant="outline" onClick={() => dismiss(r.id)}
                      disabled={busy === r.id} className="gap-1.5 text-muted-foreground">
                      <XCircle className="h-3.5 w-3.5" /> Dismiss
                    </Button>
                  )}
                </div>

                {links[r.id] && (
                  <input readOnly value={links[r.id]} onFocus={e => e.target.select()}
                    className="mt-2 w-full rounded-lg border border-border bg-muted/40 p-2 text-xs" />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
