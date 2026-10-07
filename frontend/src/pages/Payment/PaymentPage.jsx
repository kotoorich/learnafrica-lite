import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Lock, CheckCircle2, ChevronLeft, Loader2, ShieldCheck,
  AlertCircle, Smartphone, Info, Ticket, CreditCard,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/api';
import { formatPrice } from '@/lib/money';
import { courseThumbnail } from '@/lib/courseThumbnail';
import { normalizeGhPhone, isValidGhPhone } from '@/lib/payoutDetails';

// ── Provider definitions ────────────────────────────────────────────────────
// These are a *preference*. Paystack's hosted checkout shows the matching
// channel(s), and the student can still switch method on that page.
const PROVIDERS = [
  {
    id: 'any',
    name: 'Card, Mobile Money or Bank',
    short: 'ANY',
    tileBg: 'bg-primary',
    tileText: 'text-primary-foreground',
    type: 'any',
    hint: 'Choose on Paystack',
  },
  {
    id: 'card',
    name: 'Card',
    short: 'CARD',
    tileBg: 'bg-slate-800',
    tileText: 'text-white',
    type: 'card',
    hint: 'Visa, Mastercard, Verve',
  },
  {
    id: 'mtn_momo',
    name: 'MTN Mobile Money',
    short: 'MTN',
    tileBg: 'bg-yellow-400',
    tileText: 'text-yellow-950',
    type: 'momo',
    hint: 'Approve on your phone',
  },
  {
    id: 'vodafone_cash',
    name: 'Vodafone Cash',
    short: 'Voda',
    tileBg: 'bg-red-500',
    tileText: 'text-white',
    type: 'momo',
    hint: 'Approve on your phone',
  },
  {
    id: 'airteltigo_money',
    name: 'AirtelTigo Money',
    short: 'AT',
    tileBg: 'bg-blue-600',
    tileText: 'text-white',
    type: 'momo',
    hint: 'Approve on your phone',
  },
  {
    id: 'bank_transfer',
    name: 'Bank Transfer',
    short: 'BANK',
    tileBg: 'bg-emerald-700',
    tileText: 'text-white',
    type: 'bank',
    hint: 'Pay from your bank app',
  },
];

const formatPhone = (v) => normalizeGhPhone(v);

// ────────────────────────────────────────────────────────────────────────────
export default function PaymentPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { user, refreshCourses, refreshProfile } = useAuth();

  const [course,  setCourse]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [step,    setStep]    = useState('form'); // form | processing | success
  const [error,   setError]   = useState('');
  const [receipt, setReceipt] = useState(null);
  const [providerStatus, setProviderStatus] = useState(null); // {is_live, is_mock, provider}

  // Students tell us who they are here; the actual payment (card / mobile
  // money / bank transfer) is entered once, on Paystack's hosted page. So the
  // raw card number and CVV never pass through our servers (PCI scope stays
  // with Paystack).
  const [details,  setDetails]  = useState({
    name:  user?.name  || '',
    phone: user?.phone || '',
    city:  '',
  });
  const [errs,     setErrs]     = useState({});

  // The first screen collects the student's contact details for the receipt and
  // order reference only. The payment method (card / mobile money / bank) and
  // the number are entered once, on Paystack's hosted page — so the student
  // never types the same number twice.
  const provider = 'any';

  // ── Coupon state ─────────────────────────────────────────────────
  const [showCouponInput, setShowCouponInput] = useState(false);
  const [couponInput,     setCouponInput]     = useState('');
  const [couponLoading,   setCouponLoading]   = useState(false);
  const [couponError,     setCouponError]     = useState('');
  const [appliedCoupon,   setAppliedCoupon]   = useState(null); // {code, discount_amount, final_amount, original_amount}

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponLoading(true); setCouponError('');
    try {
      const res = await fetch(`${API_BASE}/api/coupons/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, course_id: courseId }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setCouponError(data.error || 'Invalid coupon.');
        setAppliedCoupon(null);
      } else {
        setAppliedCoupon(data);
        setCouponInput(code);
      }
    } catch {
      setCouponError('Could not validate coupon. Try again.');
    }
    setCouponLoading(false);
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError('');
  };

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/courses/${courseId}`);
        const data = await res.json();
        if (!ok) return;
        if (!res.ok) setLoadErr(data.error || 'Course not found.');
        else if (data.course?.is_free) navigate(`/courses/${courseId}`, { replace: true });
        else setCourse(data.course);
      } catch { if (ok) setLoadErr('Unable to load course.'); }
      if (ok) setLoading(false);
    })();
    // Fetch payment provider status so we can show/hide the demo banner correctly
    fetch(`${API_BASE}/api/payments/provider-status`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (ok && d) setProviderStatus(d); })
      .catch(() => {});
    return () => { ok = false; };
  }, [courseId, navigate]);

  // ── Check if we have a pending payment from a previous session (Paystack) ─
  // If the user was redirected to Paystack but came back without completing
  // (or the redirect back to /payment/return got lost), we'll have a saved
  // reference in sessionStorage. Auto-verify it on mount.
  useEffect(() => {
    let pendingRef, pendingCourse;
    try {
      pendingRef    = sessionStorage.getItem('pending_payment_ref');
      pendingCourse = sessionStorage.getItem('pending_payment_course');
    } catch (_) {}
    if (!pendingRef || pendingCourse !== courseId) return;
    // Clear immediately — we're handling it now
    try { sessionStorage.removeItem('pending_payment_ref'); } catch (_) {}
    try { sessionStorage.removeItem('pending_payment_course'); } catch (_) {}
    // Ask backend to verify
    (async () => {
      try {
        const token = sessionStorage.getItem('auth_token');
        const res = await fetch(`${API_BASE}/api/payments/verify/${encodeURIComponent(pendingRef)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
          setReceipt(data);
          setStep('success');
          await Promise.allSettled([refreshCourses?.(), refreshProfile?.()]);
        }
        // If failed or pending, just leave the form as-is
      } catch (_) {}
    })();
  }, [courseId, refreshCourses, refreshProfile]);
  // If the user leaves for Paystack and comes back (via close/back button),
  // the browser may restore the frozen page state including the spinning
  // button. Reset it to 'form' so the button becomes clickable again.
  useEffect(() => {
    const handlePageShow = (event) => {
      // event.persisted = true when page was restored from bfcache (they hit
      // back/close from Paystack). This is the reliable signal.
      if (event.persisted) {
        setStep('form');
        setError('You returned from the payment page. If you completed the payment, refresh to see your enrolled course. Otherwise you can try again.');
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  // ── Watchdog: if 'processing' state lasts more than 90 seconds, reset it ──
  // The redirect to Paystack normally fires within 2 seconds. If we're still
  // "processing" 90 seconds later, something went wrong (Paystack modal blocked,
  // popup blocker, network hiccup on redirect). Reset so the user can retry.
  useEffect(() => {
    if (step !== 'processing') return;
    const t = setTimeout(() => {
      setStep('form');
      setError('The payment window did not open. Please check your browser popup settings and try again.');
    }, 90000);
    return () => clearTimeout(t);
  }, [step]);

  const validate = () => {
    const e = {};
    if (!details.name.trim()) e.name = 'Please enter your full name';
    // Phone is optional here: it is only used on the receipt. The number that
    // actually pays (mobile money) is entered once on Paystack's page.
    if (details.phone.trim() && !isValidGhPhone(details.phone)) {
      e.phone = 'Enter a valid Ghana number, e.g. 0244123456';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const handlePay = async (evt) => {
    evt.preventDefault();
    if (!validate()) return;
    setStep('processing');
    setError('');

    const payment_details = {
      name:  details.name.trim(),
      phone: normalizeGhPhone(details.phone),
      city:  details.city.trim(),
    };

    try {
      const token = sessionStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/api/courses/${courseId}/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          payment_method: provider,
          payment_details,
          ...(appliedCoupon ? { coupon_code: appliedCoupon.code } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'Payment failed');

      // Paystack path: MUST have a checkout URL to redirect to.
      // If the backend returned `pending` but no URL, something went wrong
      // upstream (Paystack API error, invalid key, etc.). Show a real error.
      if (data.provider === 'paystack' || data.status === 'pending') {
        if (data.checkout_url) {
          // Save the transaction reference so we can verify status if the
          // user closes/cancels the Paystack window without completing.
          try {
            sessionStorage.setItem('pending_payment_ref', data.transaction_id || data.receipt_id || '');
            sessionStorage.setItem('pending_payment_course', courseId);
          } catch (_) {}
          window.location.href = data.checkout_url;
          return;
        }
        // No checkout URL means Paystack init failed silently.
        throw new Error(
          'Could not open the payment gateway. Please contact support with this reference: ' +
          (data.receipt_id || data.transaction_id || 'unknown')
        );
      }

      // Mock path — instant success
      await Promise.allSettled([refreshCourses?.(), refreshProfile?.()]);
      setReceipt(data);
      setStep('success');
    } catch (e) {
      setError(e.message || 'Payment could not be completed. Try again.');
      setStep('form');
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (loadErr || !course) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-6 max-w-md w-full text-center">
          <AlertCircle className="h-10 w-10 mx-auto text-destructive mb-3" />
          <h2 className="text-lg font-bold">Could not load course</h2>
          <p className="text-sm text-muted-foreground mt-1">{loadErr || 'Please try again.'}</p>
          <Button onClick={() => navigate(-1)} className="mt-5">Go back</Button>
        </Card>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
        <Card className="p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <h2 className="text-2xl font-bold">Payment Successful</h2>
          <p className="text-sm text-muted-foreground mt-1.5">You are now enrolled in <strong>{course.title}</strong>.</p>
          <div className="mt-6 p-4 rounded-lg bg-muted/40 text-left text-sm space-y-1.5">
            <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-bold">{formatPrice(receipt?.amount)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span>{PROVIDERS.find(p => p.id === receipt?.payment_method)?.name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Receipt ID</span><span className="font-mono text-xs">{receipt?.receipt_id}</span></div>
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-2">
            <Button onClick={() => navigate(`/courses/${courseId}`)} className="flex-1">Start learning</Button>
            <Button variant="outline" onClick={() => navigate('/receipts')} className="flex-1">View receipt</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="max-w-4xl mx-auto pt-6 pb-12">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5">
          <ChevronLeft className="h-4 w-4" /> Back to course
        </button>

        {providerStatus?.is_mock && (
          <div className="mb-5 p-3 rounded-lg bg-warning/10 border-2 border-warning/30 flex items-start gap-2.5">
            <Info className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-warning">Demo mode, no real charge</p>
              <p className="text-muted-foreground mt-0.5">This site is in test mode. Payments are simulated. You'll be enrolled but no money is taken.</p>
            </div>
          </div>
        )}
        {providerStatus?.is_live && (
          <div className="mb-5 p-3 rounded-lg bg-success/10 border-2 border-success/30 flex items-start gap-2.5">
            <ShieldCheck className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-success">Secure payment via Paystack</p>
              <p className="text-muted-foreground mt-0.5">You will be redirected to Paystack to complete your payment safely.</p>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-[1fr,340px] gap-6">
          <Card className="p-5 sm:p-6">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Your details
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Tell us who you are for your receipt, then pay securely on Paystack.
              You choose your method — card, mobile money or bank — and enter your
              number there, just once.
            </p>

            <form onSubmit={handlePay} className="space-y-4 mt-5">
              {/* ── Personal details ───────────────────────────────── */}
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground">Full name</label>
                <input
                  type="text" placeholder="e.g. Ama Mensah"
                  value={details.name}
                  onChange={e => setDetails({ ...details, name: e.target.value })}
                  className={cn(
                    'w-full mt-1.5 h-11 px-3 rounded-lg border-2 outline-none transition bg-background',
                    errs.name ? 'border-destructive' : 'border-border focus:border-primary'
                  )}
                />
                {errs.name && <p className="text-xs text-destructive mt-1">{errs.name}</p>}
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5" /> Phone number
                  <span className="font-normal normal-case opacity-60">(optional, for your receipt)</span>
                </label>
                <input
                  type="tel" inputMode="numeric" placeholder="0244 123 456"
                  value={details.phone}
                  onChange={e => setDetails({ ...details, phone: formatPhone(e.target.value) })}
                  className={cn(
                    'w-full mt-1.5 h-11 px-3 rounded-lg border-2 outline-none transition bg-background',
                    errs.phone ? 'border-destructive' : 'border-border focus:border-primary'
                  )}
                />
                {errs.phone && <p className="text-xs text-destructive mt-1">{errs.phone}</p>}
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground">
                  City / Town <span className="font-normal normal-case opacity-60">(optional)</span>
                </label>
                <input
                  type="text" placeholder="e.g. Accra"
                  value={details.city}
                  onChange={e => setDetails({ ...details, city: e.target.value })}
                  className="w-full mt-1.5 h-11 px-3 rounded-lg border-2 outline-none transition bg-background border-border focus:border-primary"
                />
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                <CreditCard className="h-4 w-4 flex-shrink-0 text-primary" />
                <span>Paying as <strong className="text-foreground">{user?.email}</strong></span>
              </div>

              {/* ── Payment method is chosen on Paystack's page ──────── */}
              <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
                <CreditCard className="h-4 w-4 flex-shrink-0 text-primary mt-0.5" />
                <span>
                  On the next page, Paystack lets you pay by <strong className="text-foreground">card, mobile money or bank transfer</strong>.
                  Pick one there and enter your details once.
                </span>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* ── Coupon code section ─────────────────────────────── */}
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                {!appliedCoupon && !showCouponInput && (
                  <button
                    type="button"
                    onClick={() => setShowCouponInput(true)}
                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-1.5"
                  >
                    <Ticket className="h-3.5 w-3.5" /> Have a coupon code?
                  </button>
                )}

                {!appliedCoupon && showCouponInput && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Coupon code
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponInput}
                        onChange={e => setCouponInput(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                        placeholder="e.g. LAUNCH25"
                        maxLength={40}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } }}
                        className="flex-1 h-9 px-3 rounded-lg border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={applyCoupon}
                        disabled={couponLoading || !couponInput.trim()}
                        className="h-9"
                      >
                        {couponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => { setShowCouponInput(false); setCouponInput(''); setCouponError(''); }}
                        className="h-9 text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                    {couponError && (
                      <p className="text-[11px] text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {couponError}
                      </p>
                    )}
                  </div>
                )}

                {appliedCoupon && (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-success/10 border border-success/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-success/20 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-success truncate">
                          {appliedCoupon.code} applied
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          You saved {formatPrice(appliedCoupon.discount_amount)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeCoupon}
                      className="text-xs text-muted-foreground hover:text-destructive px-2 py-1"
                      aria-label="Remove coupon"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              <Button type="submit" disabled={step === 'processing'} className="w-full h-11 text-sm">
                {step === 'processing'
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Opening secure payment…</>
                  : <><Lock className="h-4 w-4 mr-2" /> Continue to payment · {formatPrice(appliedCoupon ? appliedCoupon.final_amount : course.price)}</>}
              </Button>

              <p className="text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1">
                <Lock className="h-3 w-3" /> Payment is handled securely by Paystack. We never store your full card details.
              </p>
            </form>
          </Card>

          {/* Order summary */}
          <Card className="p-5 sm:p-6 h-fit md:sticky md:top-6">
            <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Order summary</p>
            <div className="flex gap-3 mt-3 pb-4 border-b border-border">
              <img src={courseThumbnail(course)} alt={course.title} className="w-16 h-16 rounded-lg object-cover"
                   onError={(e) => { e.target.style.display = 'none'; }} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm leading-snug">{course.title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">by {course.instructor_name}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Course price</span><span>{formatPrice(course.price)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Platform fee</span><span>Included</span></div>
              {appliedCoupon && (
                <div className="flex justify-between text-success">
                  <span>Coupon ({appliedCoupon.code})</span>
                  <span>−{formatPrice(appliedCoupon.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between pt-3 mt-3 border-t border-border font-bold text-base">
                <span>Total</span>
                <span>{formatPrice(appliedCoupon ? appliedCoupon.final_amount : course.price)}</span>
              </div>
            </div>
            <div className="mt-5 p-3 rounded-lg bg-primary/5 text-[11px] space-y-1.5">
              <p className="flex items-center gap-1.5 font-bold text-primary"><ShieldCheck className="h-3.5 w-3.5" /> What you get</p>
              <ul className="space-y-1 text-muted-foreground pl-1">
                <li>✓ Lifetime access</li>
                <li>✓ Certificate on completion</li>
                <li>✓ Learn at your own pace</li>
              </ul>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
