import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Download, Printer, Loader2, CheckCircle2, XCircle,
  Clock, AlertCircle, RotateCcw, FileText, Trash2,
} from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { useToast } from '@/components/common/Toast';
import { API_BASE } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { drawStatementPdf, downloadPdf, printPdf } from '@/lib/pdf';
import { cn } from '@/lib/utils';

const STATUS_STYLE = {
  success:  { icon: CheckCircle2, cls: 'bg-success/10 text-success border-success/30', label: 'Paid' },
  pending:  { icon: Clock,        cls: 'bg-warning/10 text-warning border-warning/30', label: 'Pending' },
  failed:   { icon: XCircle,      cls: 'bg-destructive/10 text-destructive border-destructive/30', label: 'Failed' },
  refunded: { icon: RotateCcw,    cls: 'bg-muted text-muted-foreground border-border', label: 'Refunded' },
};

function StatusPill({ status }) {
  const m = STATUS_STYLE[String(status || '').toLowerCase()] || STATUS_STYLE.pending;
  const Icon = m.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase border', m.cls)}>
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}

const fmtDate = (s) => {
  if (!s) return '—';
  try { return new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return String(s); }
};

function Meta({ label, value, mono }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('text-sm font-semibold text-foreground break-words', mono && 'font-mono text-xs')}>{value || '—'}</div>
    </div>
  );
}

export default function ReceiptStatementPage() {
  const { tid } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [tx, setTx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    const token = sessionStorage.getItem('auth_token');
    fetch(`${API_BASE}/api/transactions/${encodeURIComponent(tid)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Could not load this statement.');
        return d.transaction;
      })
      .then((t) => { if (alive) setTx(t); })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tid]);

  const withPdf = async (mode) => {
    setBusy(mode);
    try {
      const doc = await drawStatementPdf(tx);
      if (mode === 'download') {
        downloadPdf(doc, `learnafrica-statement-${tx.statement_no || tx.receipt_id || tid}.pdf`);
        showToast({ type: 'success', message: 'Statement downloaded as a PDF.' });
      } else {
        printPdf(doc);
      }
    } catch (e) {
      showToast({ type: 'error', message: 'Could not create the statement PDF.' });
    } finally {
      setBusy('');
    }
  };

  // Soft-delete: hides the statement from this account while the underlying
  // payment record, provider reference and audit history are preserved.
  const handleDelete = async () => {
    if (deleting) return;              // guard against rapid / repeated taps
    setDeleting(true);
    try {
      const token = sessionStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/api/transactions/${encodeURIComponent(tid)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Could not delete this statement.');
      }
      showToast({ type: 'success', message: 'Statement deleted.' });
      setConfirmDelete(false);
      navigate('/receipts', { replace: true });
    } catch (e) {
      showToast({ type: 'error', message: e.message || 'Could not delete this statement.' });
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-3xl text-center text-muted-foreground">
        <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3" /> Loading statement…
      </div>
    );
  }

  if (error || !tx) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <Card className="p-8 text-center">
          <AlertCircle className="h-10 w-10 mx-auto text-destructive mb-3" />
          <h1 className="text-lg font-bold mb-1">Statement unavailable</h1>
          <p className="text-sm text-muted-foreground mb-6">{error || 'This transaction could not be found.'}</p>
          <Button variant="outline" onClick={() => navigate('/receipts')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to receipts
          </Button>
        </Card>
      </div>
    );
  }

  const cur = tx.currency || 'GHS';
  const money = (n) => formatMoney(n, cur);
  const items = Array.isArray(tx.line_items) && tx.line_items.length
    ? tx.line_items
    : [{ title: tx.course_title || 'Course purchase', amount: tx.original_amount ?? tx.amount ?? 0 }];
  const discount = Number(tx.discount_applied || 0);
  const status = String(tx.status || '').toLowerCase();

  const confirmation = status === 'success'
    ? 'Payment confirmed. Thank you — this transaction is complete and the course(s) above are on your account.'
    : status === 'pending'
      ? 'This payment is still pending and has not been confirmed as successful. No course access is granted until it succeeds.'
      : status === 'failed'
        ? 'This payment did not complete. You were not charged for a successful purchase.'
        : status === 'refunded'
          ? 'This payment was refunded.'
          : 'This payment has an unrecognised status. Please contact support.';

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <Link to="/receipts" className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to receipts
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => withPdf('print')} disabled={!!busy}>
            {busy === 'print' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />} Print
          </Button>
          <Button onClick={() => withPdf('download')} disabled={!!busy}>
            {busy === 'download' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />} Download PDF
          </Button>
          <Button variant="outline" onClick={() => setConfirmDelete(true)} disabled={deleting}
            className="border-destructive/30 text-destructive hover:bg-destructive/10">
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        {/* Header band */}
        <div className="bg-[#0B3D2E] px-6 py-5 text-white flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-bold leading-tight">LearnAfrica</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-200 mt-1">Payment Statement</div>
          </div>
          <StatusPill status={tx.status} />
        </div>

        <div className="p-6 space-y-6">
          {/* Meta grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <Meta label="Statement No" value={tx.statement_no || tx.receipt_id} mono />
            <Meta label="Payment Date" value={fmtDate(tx.created_at)} />
            <Meta label="Receipt No" value={tx.receipt_id} mono />
            <Meta label="Reference" value={tx.reference} mono />
            <Meta label="Student" value={tx.buyer?.name} />
            <Meta label="Payment Method" value={tx.payment_method} />
            <Meta label="Account" value={tx.buyer?.email} />
            <Meta label="Provider" value={tx.provider} />
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              <FileText className="h-3.5 w-3.5" /> Courses
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-4 py-2 text-left text-[10px] font-bold uppercase text-muted-foreground">Course</th>
                    <th className="px-4 py-2 text-right text-[10px] font-bold uppercase text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-4 py-2.5">{it.title || 'Course'}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{money(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-full sm:w-72 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold tabular-nums">{money(tx.original_amount)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-success">
                  <span>Discount{tx.coupon_code ? ` (${tx.coupon_code})` : ''}</span>
                  <span className="font-semibold tabular-nums">- {money(discount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-2 text-base">
                <span className="font-bold text-[#0B3D2E] dark:text-emerald-300">Total Paid</span>
                <span className="font-bold tabular-nums text-[#0B3D2E] dark:text-emerald-300">{money(tx.amount)}</span>
              </div>
            </div>
          </div>

          {/* Confirmation */}
          <div className="rounded-lg bg-muted/40 border border-border p-4 text-sm text-muted-foreground italic">
            {confirmation}
          </div>

          <p className="text-[11px] text-muted-foreground text-center">
            This is a computer-generated payment statement from LearnAfrica.
          </p>
        </div>
      </Card>

      {confirmDelete && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => !deleting && setConfirmDelete(false)}
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
                It will be removed from your statements. The payment record is kept
                for the platform&apos;s financial history and cannot be recovered here.
              </p>
              <div className="flex flex-col w-full gap-3">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDelete}
                  className="w-full h-11 inline-flex items-center justify-center rounded-lg bg-destructive text-destructive-foreground font-semibold hover:bg-destructive/90 disabled:opacity-60 transition-colors"
                >
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setConfirmDelete(false)}
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
