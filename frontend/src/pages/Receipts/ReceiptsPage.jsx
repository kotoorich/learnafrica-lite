import { useEffect, useMemo, useState } from 'react';
import { Receipt as ReceiptIcon, Filter, Download, Trash2, Search, CheckCircle2, XCircle, Clock, AlertCircle, RotateCcw, Copy } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input, Label } from '@/components/common/Input';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';

// ── helpers ────────────────────────────────────────────────────────────────
const authedFetch = (url, opts = {}) => {
  const token = sessionStorage.getItem('auth_token');
  return fetch(`${API_BASE}${url}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
};

const formatDate = (s) => {
  if (!s) return '—';
  try {
    const d = new Date(s);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return String(s); }
};

const StatusPill = ({ status }) => {
  const map = {
    success:  { icon: CheckCircle2, cls: 'bg-success/10 text-success border-success/30' },
    pending:  { icon: Clock,        cls: 'bg-warning/10 text-warning border-warning/30' },
    failed:   { icon: XCircle,      cls: 'bg-destructive/10 text-destructive border-destructive/30' },
    refunded: { icon: RotateCcw,    cls: 'bg-muted text-muted-foreground border-border' },
  };
  const m = map[status] || map.pending;
  const Icon = m.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border', m.cls)}>
      <Icon className="h-2.5 w-2.5" /> {status || 'pending'}
    </span>
  );
};

// ── Page ───────────────────────────────────────────────────────────────────
export default function ReceiptsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [filters, setFilters] = useState({
    date_from: '', date_to: '', status: '', type: '', search: '',
  });
  const [copied, setCopied] = useState('');

  const loadRows = () => {
    setLoading(true); setError('');
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v && k !== 'search') params.set(k, v);
    });
    authedFetch(`/api/transactions?${params.toString()}`)
      .then(r => r.json())
      .then(d => {
        setRows(d.transactions || []);
        if (d.error) setError(d.error);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadRows(); /* eslint-disable-next-line */ }, [filters.date_from, filters.date_to, filters.status, filters.type]);

  // Client-side search across visible columns
  const filtered = useMemo(() => {
    const s = filters.search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      (r.receipt_id || '').toLowerCase().includes(s) ||
      (r.user_name  || '').toLowerCase().includes(s) ||
      (r.user_email || '').toLowerCase().includes(s) ||
      (r.course_title || '').toLowerCase().includes(s)
    );
  }, [rows, filters.search]);

  const onDelete = async (tid) => {
    if (!window.confirm('Remove this transaction from your view? (Admins will still see it.)')) return;
    try {
      await authedFetch(`/api/transactions/${tid}`, { method: 'DELETE' });
      setRows(rs => rs.filter(r => r.id !== tid));
    } catch (e) {
      alert(e.message || 'Failed to delete');
    }
  };

  const copyId = (id) => {
    try {
      navigator.clipboard.writeText(id);
      setCopied(id);
      setTimeout(() => setCopied(''), 1500);
    } catch { /* fallback ignored */ }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ReceiptIcon className="h-6 w-6 text-primary" /> Receipts
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isAdmin
              ? 'All transactions on the platform — payments and payouts.'
              : 'Your transaction history. Receipts you hide here are still visible to admins.'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6 space-y-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filter
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase font-bold">Search</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Receipt, name, course…"
                value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                className="pl-8 h-9 text-xs" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase font-bold">From</Label>
            <Input type="date" value={filters.date_from}
              onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
              className="h-9 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase font-bold">To</Label>
            <Input type="date" value={filters.date_to}
              onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
              className="h-9 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase font-bold">Status</Label>
            <select value={filters.status}
              onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
              className="w-full h-9 rounded-lg border border-input bg-background px-2 text-xs outline-none">
              <option value="">All</option>
              <option value="success">Success</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase font-bold">Type</Label>
            <select value={filters.type}
              onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}
              className="w-full h-9 rounded-lg border border-input bg-background px-2 text-xs outline-none">
              <option value="">All</option>
              <option value="purchase">Purchase</option>
              <option value="payout">Payout</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setFilters({ date_from:'', date_to:'', status:'', type:'', search:'' })}>
            Clear
          </Button>
        </div>
      </Card>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="px-3 py-2.5 text-left text-[10px] uppercase font-bold text-muted-foreground">Receipt ID</th>
                <th className="px-3 py-2.5 text-left text-[10px] uppercase font-bold text-muted-foreground">Date</th>
                <th className="px-3 py-2.5 text-left text-[10px] uppercase font-bold text-muted-foreground">Type</th>
                <th className="px-3 py-2.5 text-left text-[10px] uppercase font-bold text-muted-foreground">Description</th>
                <th className="px-3 py-2.5 text-right text-[10px] uppercase font-bold text-muted-foreground">Amount</th>
                <th className="px-3 py-2.5 text-left text-[10px] uppercase font-bold text-muted-foreground">Status</th>
                <th className="px-3 py-2.5 text-right text-[10px] uppercase font-bold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                  <ReceiptIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No transactions yet.
                </td></tr>
              ) : filtered.map(t => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5">
                    <button onClick={() => copyId(t.receipt_id)}
                      className="inline-flex items-center gap-1 font-mono text-[11px] hover:text-primary"
                      title="Click to copy">
                      {t.receipt_id}
                      {copied === t.receipt_id
                        ? <CheckCircle2 className="h-3 w-3 text-success" />
                        : <Copy className="h-3 w-3 opacity-50" />}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{formatDate(t.created_at)}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn('text-[10px] uppercase font-bold px-2 py-0.5 rounded',
                      t.type === 'payout' ? 'bg-blue-500/10 text-blue-500' : 'bg-purple-500/10 text-purple-500')}>
                      {t.type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="text-xs font-medium">{t.course_title || '—'}</div>
                    {isAdmin && (
                      <div className="text-[10px] text-muted-foreground">{t.user_name || t.user_email || '—'}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums whitespace-nowrap">
                    {formatMoney(t.amount, t.currency)}
                  </td>
                  <td className="px-3 py-2.5"><StatusPill status={t.status} /></td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => onDelete(t.id)}
                      title={isAdmin ? 'Permanently delete (admin)' : 'Hide from your view'}
                      className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground mt-3 text-center">
        {filtered.length} of {rows.length} {rows.length === 1 ? 'receipt' : 'receipts'}
      </p>
    </div>
  );
}
