import { useState, useEffect, useMemo } from 'react';
import { Loader2, Plus, Copy, Check, Trash2, Ticket, AlertCircle, Calendar, Users, Percent, DollarSign, ToggleLeft, ToggleRight, Search } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { API_BASE } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/money';

/**
 * CouponsManager — shared UI for admin and instructor to manage coupons.
 * The backend already restricts what each role can create/see; this component
 * just adapts labels + form options based on the role prop.
 *
 * Props:
 *   role: 'admin' | 'instructor'
 *   myCourses: optional array of {id, title} — needed by instructors to pick
 *              a course when creating course-specific coupons
 */
export default function CouponsManager({ role = 'admin', myCourses = [] }) {
  const [coupons,  setCoupons]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [filter,   setFilter]   = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const authFetch = async (path, opts = {}) => {
    const token = sessionStorage.getItem('auth_token');
    const res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.detail || `Request failed (${res.status})`);
    return data;
  };

  const load = async () => {
    setLoading(true); setError('');
    try {
      const d = await authFetch('/api/coupons');
      setCoupons(d.coupons || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const copyCode = (code, id) => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const deleteCoupon = async (id) => {
    if (!confirm('Delete this coupon? Anyone still trying to use it will get an error.')) return;
    try {
      await authFetch(`/api/coupons/${id}`, { method: 'DELETE' });
      setCoupons(prev => prev.filter(c => c.id !== id));
    } catch (e) { alert(e.message); }
  };

  const toggleActive = async (c) => {
    try {
      const d = await authFetch(`/api/coupons/${c.id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: !c.active }),
      });
      setCoupons(prev => prev.map(x => x.id === c.id ? d.coupon : x));
    } catch (e) { alert(e.message); }
  };

  const filtered = useMemo(() => {
    const q = filter.toLowerCase().trim();
    if (!q) return coupons;
    return coupons.filter(c =>
      c.code.toLowerCase().includes(q) ||
      (c.applies_to || '').toLowerCase().includes(q)
    );
  }, [coupons, filter]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" /> Coupons
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {role === 'admin'
              ? 'Create discount codes for any course. Track usage and deactivate anytime.'
              : 'Create discount codes for your own courses.'}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> New coupon
        </Button>
      </div>

      {/* Filter */}
      {coupons.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter by code..."
            className="w-full h-10 pl-10 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      )}

      {error && (
        <Card className="p-3 bg-destructive/10 border-destructive/30 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {error}
        </Card>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary/50" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <Ticket className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {coupons.length === 0 ? 'No coupons yet. Create one to get started.' : 'No coupons match your filter.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(c => <CouponCard
            key={c.id}
            coupon={c}
            copied={copiedId === c.id}
            onCopy={() => copyCode(c.code, c.id)}
            onDelete={() => deleteCoupon(c.id)}
            onToggle={() => toggleActive(c)}
          />)}
        </div>
      )}

      {showCreate && (
        <CreateCouponModal
          role={role}
          myCourses={myCourses}
          onClose={() => setShowCreate(false)}
          onCreated={(cpn) => {
            setCoupons(prev => [cpn, ...prev]);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function CouponCard({ coupon, copied, onCopy, onDelete, onToggle }) {
  const isActive = !!coupon.active;
  const usesText = coupon.max_uses ? `${coupon.current_uses}/${coupon.max_uses}` : `${coupon.current_uses}`;
  const expired = coupon.expires_at ? new Date(coupon.expires_at) < new Date() : false;
  const depleted = coupon.max_uses && coupon.current_uses >= coupon.max_uses;

  const statusBadge = !isActive
    ? { label: 'Inactive', color: 'bg-muted text-muted-foreground' }
    : expired
    ? { label: 'Expired',  color: 'bg-destructive/15 text-destructive' }
    : depleted
    ? { label: 'Depleted', color: 'bg-warning/15 text-warning' }
    : { label: 'Active',   color: 'bg-success/15 text-success' };

  const discountText = coupon.discount_type === 'percent'
    ? `${coupon.discount_value}% OFF`
    : `${formatPrice(coupon.discount_value)} OFF`;

  const scopeText = coupon.applies_to === 'all'
    ? 'All courses'
    : coupon.applies_to === 'course'
    ? 'Specific course'
    : 'My courses';

  return (
    <Card className={cn(
      'p-4 relative transition-all',
      !isActive || expired || depleted ? 'opacity-70' : ''
    )}>
      {/* Status badge (top-right) */}
      <span className={cn('absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider', statusBadge.color)}>
        {statusBadge.label}
      </span>

      {/* Code + copy */}
      <div className="flex items-center gap-2 mb-3 pr-16">
        <button onClick={onCopy}
          className="flex items-center gap-2 font-mono font-bold text-lg tracking-wider hover:text-primary transition-colors"
          title="Copy code">
          {coupon.code}
          {copied
            ? <Check className="h-4 w-4 text-success" />
            : <Copy className="h-4 w-4 opacity-60" />}
        </button>
      </div>

      {/* Discount amount */}
      <div className="text-2xl font-black text-primary mb-3">{discountText}</div>

      {/* Metadata rows */}
      <div className="space-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5" />
          <span>Used {usesText} times</span>
        </div>
        <div className="flex items-center gap-2">
          {coupon.discount_type === 'percent'
            ? <Percent className="h-3.5 w-3.5" />
            : <DollarSign className="h-3.5 w-3.5" />}
          <span>{scopeText}</span>
        </div>
        {coupon.expires_at && (
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            <span>Expires {new Date(coupon.expires_at).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/50">
        <Button size="sm" variant="ghost" onClick={onToggle} className="flex-1 gap-1.5">
          {isActive
            ? <><ToggleRight className="h-4 w-4" /> Deactivate</>
            : <><ToggleLeft  className="h-4 w-4" /> Activate</>}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive hover:text-destructive hover:bg-destructive/10">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

function CreateCouponModal({ role, myCourses, onClose, onCreated }) {
  const [code,       setCode]       = useState('');
  const [dtype,      setDtype]      = useState('percent');
  const [dvalue,     setDvalue]     = useState('');
  const [appliesTo,  setAppliesTo]  = useState(role === 'admin' ? 'all' : 'instructor');
  const [courseId,   setCourseId]   = useState('');
  const [maxUses,    setMaxUses]    = useState('');
  const [expiresAt,  setExpiresAt]  = useState('');
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSaving(true);
    try {
      const body = {
        code: code.trim().toUpperCase(),
        discount_type: dtype,
        discount_value: parseFloat(dvalue),
        applies_to: appliesTo,
      };
      if (appliesTo === 'course') {
        if (!courseId) { setError('Pick a course.'); setSaving(false); return; }
        body.course_id = courseId;
      }
      if (maxUses) body.max_uses = parseInt(maxUses, 10);
      if (expiresAt) body.expires_at = new Date(expiresAt).toISOString();

      const token = sessionStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/api/coupons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create coupon');
      onCreated(data.coupon);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <Card className="w-full max-w-md p-6 my-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" /> New coupon
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {/* Code */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Code</label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
              placeholder="e.g. LAUNCH25"
              maxLength={40}
              required
              className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Letters, numbers, dashes and underscores only. Minimum 3 characters.</p>
          </div>

          {/* Discount type */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Discount type</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDtype('percent')}
                className={cn('h-10 rounded-lg border text-sm font-medium transition-colors',
                  dtype === 'percent' ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted')}>
                Percentage
              </button>
              <button type="button" onClick={() => setDtype('fixed')}
                className={cn('h-10 rounded-lg border text-sm font-medium transition-colors',
                  dtype === 'fixed' ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted')}>
                Fixed amount
              </button>
            </div>
          </div>

          {/* Value */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">
              Discount value {dtype === 'percent' ? '(%)' : '(GH₵)'}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={dvalue}
              onChange={e => {
                const v = e.target.value;
                if (v === '' || /^\d*\.?\d*$/.test(v)) setDvalue(v);
              }}
              placeholder={dtype === 'percent' ? 'e.g. 25' : 'e.g. 20'}
              required
              className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Applies to */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Applies to</label>
            <select
              value={appliesTo}
              onChange={e => setAppliesTo(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {role === 'admin' && <option value="all">All courses (platform-wide)</option>}
              <option value="instructor">{role === 'admin' ? 'All my courses' : 'All my courses'}</option>
              <option value="course">One specific course</option>
            </select>
          </div>

          {/* Course picker (only when applies_to === 'course') */}
          {appliesTo === 'course' && (
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Course</label>
              <select
                value={courseId}
                onChange={e => setCourseId(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select a course...</option>
                {myCourses.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          )}

          {/* Max uses */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Max uses (optional)</label>
            <input
              type="text"
              inputMode="numeric"
              value={maxUses}
              onChange={e => {
                const v = e.target.value;
                if (v === '' || /^\d+$/.test(v)) setMaxUses(v);
              }}
              placeholder="Leave blank for unlimited"
              className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Expires at */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Expires on (optional)</label>
            <input
              type="date"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create coupon'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
