import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  CreditCard, Lock, CheckCircle2, ChevronLeft, Loader2, ShieldCheck,
  AlertCircle, Smartphone, Info,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/api';
import { formatPrice } from '@/lib/money';

// ── Provider options ────────────────────────────────────────────────────────
const PROVIDERS = [
  {
    id: 'mtn_momo',
    name: 'MTN Mobile Money',
    logo: 'MTN',
    color: 'bg-yellow-500',
    textColor: 'text-black',
    fields: 'phone',
  },
  {
    id: 'vodafone_cash',
    name: 'Vodafone Cash',
    logo: 'Voda',
    color: 'bg-red-500',
    textColor: 'text-white',
    fields: 'phone',
  },
  {
    id: 'airteltigo_money',
    name: 'AirtelTigo Money',
    logo: 'AT',
    color: 'bg-blue-600',
    textColor: 'text-white',
    fields: 'phone',
  },
  {
    id: 'card',
    name: 'Mastercard / Visa',
    logo: 'CARD',
    color: 'bg-slate-700',
    textColor: 'text-white',
    fields: 'card',
  },
];

// ── Formatters ──────────────────────────────────────────────────────────────
function formatCardNumber(v) {
  return v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
}
function formatExpiry(v) {
  const digits = v.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 3) return digits.slice(0, 2) + '/' + digits.slice(2);
  return digits;
}
function formatPhone(v) {
  return v.replace(/\D/g, '').slice(0, 10);
}

// ────────────────────────────────────────────────────────────────────────────
export default function PaymentPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { refreshCourses, refreshProfile } = useAuth();

  const [course,   setCourse]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [loadErr,  setLoadErr]  = useState('');
  const [step,     setStep]     = useState('form'); // form | processing | success
  const [error,    setError]    = useState('');
  const [receipt,  setReceipt]  = useState(null);

  // Which provider is selected
  const [provider, setProvider] = useState('mtn_momo');
  // Momo phone (single field)
  const [phone,    setPhone]    = useState('');
  // Card fields
  const [card,     setCard]     = useState({ number: '', name: '', expiry: '', cvv: '' });
  const [errs,     setErrs]     = useState({});

  // Load course info
  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/courses/${courseId}`);
        const data = await res.json();
        if (!ok) return;
        if (!res.ok) {
          setLoadErr(data.error || 'Course not found.');
        } else if (data.course?.is_free) {
          // Free course — redirect back
          navigate(`/courses/${courseId}`, { replace: true });
        } else {
          setCourse(data.course);
        }
      } catch {
        if (ok) setLoadErr('Unable to load course.');
      }
      if (ok) setLoading(false);
    })();
    return () => { ok = false; };
  }, [courseId, navigate]);

  const currentProvider = PROVIDERS.find(p => p.id === provider);

  // Validation
  const validate = () => {
    const e = {};
    if (currentProvider.fields === 'phone') {
      const clean = phone.replace(/\D/g, '');
      if (clean.length < 9 || clean.length > 10) e.phone = 'Enter a valid Ghana phone number';
    } else if (currentProvider.fields === 'card') {
      const digits = card.number.replace(/\s/g, '');
      if (digits.length < 13) e.number = 'Enter a valid card number';
      if (!card.name.trim()) e.name = 'Cardholder name is required';
      const [m, y] = (card.expiry || '').split('/');
      const now = new Date();
      if (!m || !y || parseInt(m) < 1 || parseInt(m) > 12 ||
          (parseInt(y) + 2000) < now.getFullYear() ||
          ((parseInt(y) + 2000) === now.getFullYear() && parseInt(m) < now.getMonth() + 1)) {
        e.expiry = 'Invalid or expired date';
      }
      if (!card.cvv || card.cvv.length < 3) e.cvv = 'Enter a valid CVV';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  // Submit
  const handlePay = async (evt) => {
    evt.preventDefault();
    if (!validate()) return;
    setStep('processing');
    setError('');

    const payment_details = currentProvider.fields === 'phone'
      ? { phone: phone.replace(/\D/g, '') }
      : {
          card_number: card.number.replace(/\s/g, ''),
          card_name:   card.name.trim(),
          card_expiry: card.expiry,
          card_cvv:    card.cvv,
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
          payment_method:  provider,
          payment_details,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment failed');
      // If Paystack later, follow the checkout URL
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      // Mock mode: success is immediate
      await Promise.allSettled([refreshCourses?.(), refreshProfile?.()]);
      setReceipt(data);
      setStep('success');
    } catch (e) {
      setError(e.message || 'Payment could not be completed. Try again.');
      setStep('form');
    }
  };

  // ─── LOADING ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
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

  // ─── SUCCESS ────────────────────────────────────────────────────────────
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

  // ─── FORM ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="max-w-3xl mx-auto pt-6 pb-12">
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5"
        >
          <ChevronLeft className="h-4 w-4" /> Back to course
        </button>

        {/* Mock-mode banner (remove/hide when Paystack is live) */}
        <div className="mb-5 p-3 rounded-lg bg-warning/10 border-2 border-warning/30 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-warning">Demo mode — no real charge</p>
            <p className="text-muted-foreground mt-0.5">
              This site is in test mode. Payments are simulated. You'll be enrolled but no money is taken.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-[1fr,320px] gap-6">
          {/* ── Left: Payment methods ── */}
          <Card className="p-5 sm:p-6">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Choose a payment method
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Payments are encrypted end-to-end.</p>

            {/* Provider list */}
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setProvider(p.id); setErrs({}); setError(''); }}
                  type="button"
                  className={cn(
                    'p-3 rounded-xl border-2 transition-all text-left group',
                    provider === p.id
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:border-primary/40 hover:bg-muted/30'
                  )}
                >
                  <div className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs',
                    p.color, p.textColor
                  )}>{p.logo}</div>
                  <p className="text-[11px] font-medium mt-2 leading-tight">{p.name}</p>
                </button>
              ))}
            </div>

            {/* Selected method — form */}
            <form onSubmit={handlePay} className="mt-6 space-y-4">
              {currentProvider.fields === 'phone' && (
                <div>
                  <label className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                    <Smartphone className="h-3.5 w-3.5" />
                    {currentProvider.name} number
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="0244 123 456"
                    value={phone}
                    onChange={e => setPhone(formatPhone(e.target.value))}
                    className={cn(
                      'w-full mt-1.5 h-11 px-3 rounded-lg border-2 outline-none transition-colors bg-background',
                      errs.phone ? 'border-destructive' : 'border-border focus:border-primary'
                    )}
                  />
                  {errs.phone && <p className="text-xs text-destructive mt-1">{errs.phone}</p>}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    You'll receive a prompt on your phone to approve the payment (simulated in demo mode).
                  </p>
                </div>
              )}

              {currentProvider.fields === 'card' && (
                <>
                  <div>
                    <label className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5" />
                      Card number
                    </label>
                    <input
                      inputMode="numeric"
                      placeholder="1234 5678 9012 3456"
                      value={card.number}
                      onChange={e => setCard({ ...card, number: formatCardNumber(e.target.value) })}
                      className={cn(
                        'w-full mt-1.5 h-11 px-3 rounded-lg border-2 outline-none transition-colors bg-background',
                        errs.number ? 'border-destructive' : 'border-border focus:border-primary'
                      )}
                    />
                    {errs.number && <p className="text-xs text-destructive mt-1">{errs.number}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-muted-foreground">Cardholder name</label>
                    <input
                      placeholder="Full name on card"
                      value={card.name}
                      onChange={e => setCard({ ...card, name: e.target.value })}
                      className={cn(
                        'w-full mt-1.5 h-11 px-3 rounded-lg border-2 outline-none transition-colors bg-background',
                        errs.name ? 'border-destructive' : 'border-border focus:border-primary'
                      )}
                    />
                    {errs.name && <p className="text-xs text-destructive mt-1">{errs.name}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold uppercase text-muted-foreground">Expiry (MM/YY)</label>
                      <input
                        inputMode="numeric"
                        placeholder="MM/YY"
                        value={card.expiry}
                        onChange={e => setCard({ ...card, expiry: formatExpiry(e.target.value) })}
                        className={cn(
                          'w-full mt-1.5 h-11 px-3 rounded-lg border-2 outline-none transition-colors bg-background',
                          errs.expiry ? 'border-destructive' : 'border-border focus:border-primary'
                        )}
                      />
                      {errs.expiry && <p className="text-xs text-destructive mt-1">{errs.expiry}</p>}
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase text-muted-foreground">CVV</label>
                      <input
                        inputMode="numeric"
                        placeholder="123"
                        value={card.cvv}
                        maxLength={4}
                        onChange={e => setCard({ ...card, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                        className={cn(
                          'w-full mt-1.5 h-11 px-3 rounded-lg border-2 outline-none transition-colors bg-background',
                          errs.cvv ? 'border-destructive' : 'border-border focus:border-primary'
                        )}
                      />
                      {errs.cvv && <p className="text-xs text-destructive mt-1">{errs.cvv}</p>}
                    </div>
                  </div>
                </>
              )}

              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={step === 'processing'}
                className="w-full h-11 text-sm"
              >
                {step === 'processing'
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing…</>
                  : <><Lock className="h-4 w-4 mr-2" /> Pay {formatPrice(course.price)}</>}
              </Button>

              <p className="text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1">
                <Lock className="h-3 w-3" />
                Your payment details are encrypted and never stored on our servers.
              </p>
            </form>
          </Card>

          {/* ── Right: Order summary ── */}
          <Card className="p-5 sm:p-6 h-fit md:sticky md:top-6">
            <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Order summary</p>

            <div className="flex gap-3 mt-3 pb-4 border-b border-border">
              {course.thumbnail && (
                <img src={course.thumbnail} alt={course.title}
                     className="w-16 h-16 rounded-lg object-cover" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm leading-snug">{course.title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">by {course.instructor_name}</p>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Course price</span>
                <span>{formatPrice(course.price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Platform fee</span>
                <span>Included</span>
              </div>
              <div className="flex justify-between pt-3 mt-3 border-t border-border font-bold text-base">
                <span>Total</span>
                <span>{formatPrice(course.price)}</span>
              </div>
            </div>

            <div className="mt-5 p-3 rounded-lg bg-primary/5 text-[11px] space-y-1.5">
              <p className="flex items-center gap-1.5 font-bold text-primary">
                <ShieldCheck className="h-3.5 w-3.5" /> What you get
              </p>
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
