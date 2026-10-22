import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  Receipt as ReceiptIcon, Filter, Search, CheckCircle2, XCircle, Clock,
  AlertCircle, RotateCcw, ChevronRight, Wallet, Trash2, Loader2,
} from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input, Label } from '@/components/common/Input';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/common/Toast';
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
    return new Date(s).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return String(s); }
};

// One place that maps a status to its icon, colour and wording — the same
// vocabulary the statement page and PDF use, so nothing disagrees.
const STATUS = {
  success:  { icon: CheckCircle2, label: 'Successful', ring: 'bg-success/10 text-success',           dot: 'bg-success' },
  pending:  { icon: Clock,        label: 'Pending',    ring: 'bg-warning/10 text-warning',           dot: 'bg-warning' },
  failed:   { icon: XCircle,      label: 'Failed',     ring: 'bg-destructive/10 text-destructive',   dot: 'bg-destructive' },
  refunded: { icon: RotateCcw,    label: 'Refunded',   ring: 'bg-muted text-muted-foreground',       dot: 'bg-muted-foreground' },
};
const statusMeta = (s) => STATUS[String(s || '').toLowerCase()] || STATUS.pending;

function StatusAvatar({ status }) {
  const m = statusMeta(status);
  const Icon = m.icon;
  return (
    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', m.ring)}>
      <Icon className="h-5 w-5" />
    </span>
  );
}

function StatusChip({ status }) {
  const m = statusMeta(status);
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', m.ring)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', m.dot)} /> {m.label}
    </span>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function ReceiptsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, label }
  const [deletingId, setDeletingId] = useState(null);
  const [filters, setFilters] = useState({
    date_from: '', date_to: '', status: '', type: '', search: '',
  });

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

  // Soft-delete from the list. Guarded against rapid/repeated taps and the
  // list is refreshed from the server on success.
  const handleDelete = async () => {
    if (!confirmDelete || deletingId) return;
    const { id } = confirmDelete;
    setDeletingId(id);
    try {
      const res = await authedFetch(`/api/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Could not delete this statement.');
      }
      showToast({ type: 'success', message: 'Statement deleted.' });
      setConfirmDelete(null);
      loadRows();
    } catch (e) {
      showToast({ type: 'error', message: e.message || 'Could not delete this statement.' });
      setConfirmDelete(null);
    } finally {
      setDeletingId(null);
    }
  };

  // Client-side search across the visible fields.
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

  // A small, honest summary derived from the rows on screen. Only confirmed
  // purchases count toward "paid"; nothing is invented.
  const summary = useMemo(() => {
    const purchases = rows.filter(r => r.type !== 'payout');
    const paid = purchases
      .filter(r => String(r.status).toLowerCase() === 'success')
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const currency = purchases.find(r => r.currency)?.currency || 'GHS';
    return { count: purchases.length, paid, currency };
  }, [rows]);

  const activeFilters = filters.status || filters.type || filters.date_from || filters.date_to;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ReceiptIcon className="h-6 w-6 text-primary" /> {isAdmin ? 'Transactions' : 'My Statements'}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isAdmin
            ? 'Every payment and payout on the platform.'
            : 'Tap any statement to view, download or print it.'}
        </p>
      </div>

      {/* Summary strip — mirrors the balance/usage header of a mobile-money app */}
      <Card className="mb-4 overflow-hidden">
        <div className="bg-gradient-to-br from-primary to-primary/80 px-5 py-4 text-primary-foreground">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-primary-foreground/80">
            <Wallet className="h-3.5 w-3.5" /> Total paid
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {formatMoney(summary.paid, summary.currency)}
          </div>
          <div className="mt-0.5 text-[11px] text-primary-foreground/80">
            {summary.count} {summary.count === 1 ? 'statement' : 'statements'}
          </div>
        </div>
      </Card>

      {/* Filters */}
      <Card className="p-3 mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by receipt, course or name…"
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            className="pl-9 h-10 text-sm" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
              <option value="success">Successful</option>
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
        {activeFilters && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs"
              onClick={() => setFilters(f => ({ ...f, date_from: '', date_to: '', status: '', type: '' }))}>
              <Filter className="h-3.5 w-3.5" /> Clear filters
            </Button>
          </div>
        )}
      </Card>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Statements list — a tappable ledger, not a dense table */}
      <div className="space-y-2">
        {loading ? (
          <Card className="py-10 text-center text-sm text-muted-foreground">Loading…</Card>
        ) : filtered.length === 0 ? (
          <Card className="py-12 text-center text-sm text-muted-foreground">
            <ReceiptIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
            No statements yet.
          </Card>
        ) : filtered.map(t => {
          const isPayout = t.type === 'payout';
          return (
            <div
              key={t.id}
              className="relative rounded-xl border border-border bg-card transition-colors hover:bg-muted/40 focus-within:ring-2 focus-within:ring-primary/30"
            >
              <Link
                to={`/receipts/${t.id}`}
                className="block px-3 py-3 pr-12 focus:outline-none"
              >
                <div className="flex items-center gap-3">
                  <StatusAvatar status={t.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {t.course_title || (isPayout ? 'Payout' : 'Course purchase')}
                      </span>
                      {isPayout && (
                        <span className="shrink-0 rounded bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-blue-500">Payout</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>{formatDate(t.created_at)}</span>
                      <span className="font-mono">{t.receipt_id}</span>
                      {isAdmin && (t.user_name || t.user_email) && (
                        <span className="truncate">· {t.user_name || t.user_email}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={cn('text-sm font-bold tabular-nums', isPayout ? 'text-blue-500' : 'text-foreground')}>
                      {isPayout ? '+' : ''}{formatMoney(t.amount, t.currency)}
                    </span>
                    <StatusChip status={t.status} />
                  </div>
                </div>
              </Link>
              {/* Row delete — soft-deletes the statement (kept for the platform's
                  records). Outside the Link so tapping it never opens the detail. */}
              <button
                type="button"
                aria-label="Delete statement"
                title="Delete statement"
                disabled={deletingId === t.id}
                onClick={() => setConfirmDelete({ id: t.id, label: t.course_title || t.receipt_id })}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 transition-colors"
              >
                {deletingId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          );
        })}
      </div>

      {!loading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3 text-center">
          {filtered.length} of {rows.length} {rows.length === 1 ? 'statement' : 'statements'}
        </p>
      )}

      {confirmDelete && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => !deletingId && setConfirmDelete(null)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl bg-background border border-border shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <Trash2 className="h-7 w-7 text-destructive" />
              </div>
              <h2 className="text-xl font-bold mb-2">Delete this statement?</h2>
              <p className="text-sm text-muted-foreground mb-6">
                {confirmDelete.label ? <><span className="font-medium text-foreground">{confirmDelete.label}</span> will be removed from your statements. </> : null}
                The payment record is kept for the platform&apos;s financial history.
              </p>
              <div className="flex flex-col w-full gap-3">
                <button
                  type="button"
                  disabled={!!deletingId}
                  onClick={handleDelete}
                  className="w-full h-11 inline-flex items-center justify-center rounded-lg bg-destructive text-destructive-foreground font-semibold hover:bg-destructive/90 disabled:opacity-60 transition-colors"
                >
                  {deletingId ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button
                  type="button"
                  disabled={!!deletingId}
                  onClick={() => setConfirmDelete(null)}
                  className="w-full h-11 inline-flex items-center justify-center rounded-lg border border-border bg-background text-foreground font-semibold hover:bg-muted disabled:opacity-60 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
