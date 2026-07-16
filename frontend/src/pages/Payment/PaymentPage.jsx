import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CreditCard, Lock, CheckCircle2, ChevronLeft, Loader2, ShieldCheck,
  AlertCircle, Smartphone, Info, Wifi,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/api';
import { formatPrice } from '@/lib/money';
import { courseThumbnail } from '@/lib/courseThumbnail';

// ── Provider definitions ────────────────────────────────────────────────────
const PROVIDERS = [
  {
    id: 'mtn_momo',
    name: 'MTN Mobile Money',
    short: 'MTN',
    tileBg: 'bg-yellow-400',
    tileText: 'text-yellow-950',
    cardGradient: 'from-yellow-400 via-yellow-500 to-amber-600',
    cardText: 'text-black',
    type: 'momo',
  },
  {
    id: 'vodafone_cash',
    name: 'Vodafone Cash',
    short: 'Voda',
    tileBg: 'bg-red-500',
    tileText: 'text-white',
    cardGradient: 'from-red-500 via-red-600 to-rose-700',
    cardText: 'text-white',
    type: 'momo',
  },
  {
    id: 'airteltigo_money',
    name: 'AirtelTigo Money',
    short: 'AT',
    tileBg: 'bg-blue-600',
    tileText: 'text-white',
    cardGradient: 'from-blue-500 via-indigo-600 to-purple-700',
    cardText: 'text-white',
    type: 'momo',
  },
  {
    id: 'card',
    name: 'Mastercard / Visa',
    short: 'CARD',
    tileBg: 'bg-slate-800',
    tileText: 'text-white',
    cardGradient: 'from-slate-800 via-slate-900 to-black',
    cardText: 'text-white',
    type: 'card',
  },
];

const formatCardNumber = (v) =>
  v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
const formatExpiry = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length >= 3 ? d.slice(0, 2) + '/' + d.slice(2) : d;
};
const formatPhone = (v) => v.replace(/\D/g, '').slice(0, 10);
const detectBrand = (num) => {
  const n = (num || '').replace(/\s/g, '');
  if (n.startsWith('4')) return 'VISA';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'MASTERCARD';
  if (/^3[47]/.test(n)) return 'AMEX';
  return 'CARD';
};

// ── Momo card visual — like a SIM card ────────────────────────────────────
function MomoCard({ provider, phone, name }) {
  const displayPhone = phone
    ? phone.replace(/(\d{3})(\d{3})(\d{0,4})/, (_m, a, b, c) => c ? `${a} ${b} ${c}` : `${a} ${b}`)
    : '••• ••• ••••';
  return (
    <div className={cn(
      'relative aspect-[1.6/1] w-full max-w-sm mx-auto rounded-2xl p-5 shadow-xl transition-all duration-500 overflow-hidden',
      `bg-gradient-to-br ${provider.cardGradient}`,
      provider.cardText
    )}>
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white blur-2xl -translate-y-10 translate-x-10" />
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-white blur-2xl translate-y-10 -translate-x-10" />
      </div>

      {/* Top row: brand + signal icon */}
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Mobile Money</p>
          <p className="text-xl font-black mt-0.5">{provider.short}</p>
        </div>
        <Wifi className="h-5 w-5 opacity-70" />
      </div>

      {/* SIM chip */}
      <div className="relative mt-5 flex items-center gap-3">
        <div className="w-10 h-8 rounded bg-gradient-to-br from-yellow-200 to-yellow-400 border border-yellow-500/50 shadow-sm flex-shrink-0">
          <div className="w-full h-full opacity-70 grid grid-cols-2 grid-rows-3 gap-[1px] p-0.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-yellow-600/30 rounded-sm" />
            ))}
          </div>
        </div>
      </div>

      {/* Phone number */}
      <div className="relative mt-4">
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Phone number</p>
        <p className="text-2xl font-mono font-bold tracking-wider tabular-nums mt-0.5">
          {displayPhone}
        </p>
      </div>

      {/* Bottom row: name */}
      <div className="relative mt-3 flex items-end justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest opacity-70">Account name</p>
          <p className="text-sm font-bold uppercase mt-0.5">
            {name?.trim() || '—————'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Bank card visual — realistic Mastercard/Visa look ────────────────────
function BankCard({ number, name, expiry, cvv, focus, flipped }) {
  const brand = detectBrand(number);
  const groups = (formatCardNumber(number) + ' •••• •••• •••• ••••').split(' ').slice(0, 4);
  return (
    <div className="relative aspect-[1.6/1] w-full max-w-sm mx-auto" style={{ perspective: '1000px' }}>
      <div
        className={cn(
          'relative w-full h-full transition-transform duration-700',
          flipped && 'rotate-y-180'
        )}
        style={{
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* FRONT */}
        <div
          className="absolute inset-0 rounded-2xl p-5 shadow-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-black text-white overflow-hidden"
          style={{ backfaceVisibility: 'hidden' }}
        >
          {/* Decorative rings */}
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full border-[30px] border-white/5" />
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full border-[20px] border-white/5" />

          {/* Top: brand */}
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-7 rounded bg-gradient-to-br from-yellow-200 to-yellow-500 shadow-sm">
                <div className="w-full h-full opacity-60 grid grid-cols-2 grid-rows-3 gap-[1px] p-0.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-yellow-700/40 rounded-sm" />
                  ))}
                </div>
              </div>
              <Wifi className="h-4 w-4 opacity-60 rotate-90" />
            </div>
            <div className="text-right">
              {brand === 'VISA' && (
                <p className="font-black text-2xl italic tracking-tighter">VISA</p>
              )}
              {brand === 'MASTERCARD' && (
                <div className="flex items-center">
                  <div className="w-7 h-7 rounded-full bg-red-500 opacity-90 -mr-2.5" />
                  <div className="w-7 h-7 rounded-full bg-yellow-400 opacity-90 mix-blend-screen" />
                </div>
              )}
              {brand === 'AMEX' && (
                <p className="font-black text-lg italic tracking-tight">AMEX</p>
              )}
              {brand === 'CARD' && (
                <p className="font-bold text-xs opacity-60 uppercase">Card</p>
              )}
            </div>
          </div>

          {/* Number */}
          <div className={cn(
            'relative mt-6 grid grid-cols-4 gap-2 font-mono text-lg tracking-widest tabular-nums transition-all duration-300',
            focus === 'number' && 'scale-105'
          )}>
            {groups.map((g, i) => (
              <span key={i} className="text-center font-bold">{g}</span>
            ))}
          </div>

          {/* Bottom row */}
          <div className="relative mt-5 flex items-end justify-between text-xs">
            <div className="flex-1 min-w-0">
              <p className="text-[9px] uppercase tracking-widest opacity-60 mb-0.5">Cardholder</p>
              <p className={cn(
                'font-bold uppercase truncate transition-all duration-300',
                focus === 'name' && 'text-primary-foreground'
              )}>
                {name?.trim() || 'YOUR NAME'}
              </p>
            </div>
            <div className="ml-4 flex-shrink-0">
              <p className="text-[9px] uppercase tracking-widest opacity-60 mb-0.5">Expires</p>
              <p className={cn(
                'font-mono font-bold tabular-nums transition-all duration-300',
                focus === 'expiry' && 'text-primary-foreground'
              )}>
                {expiry || 'MM/YY'}
              </p>
            </div>
          </div>
        </div>

        {/* BACK */}
        <div
          className="absolute inset-0 rounded-2xl shadow-2xl bg-gradient-to-br from-slate-700 via-slate-900 to-black overflow-hidden"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          {/* Magnetic strip */}
          <div className="w-full h-10 bg-black mt-6" />
          {/* Signature area with CVV */}
          <div className="px-5 mt-6">
            <p className="text-[9px] uppercase tracking-widest text-white/60 mb-1">CVV</p>
            <div className="h-8 bg-white/95 rounded flex items-center px-3">
              <p className="font-mono text-slate-900 tracking-widest">
                {cvv?.padEnd(3, '•') || '•••'}
              </p>
            </div>
          </div>
          <div className="absolute bottom-3 right-4 text-white/40 text-[8px] uppercase tracking-wider">
            LearnAfrica · Encrypted
          </div>
        </div>
      </div>
    </div>
  );
}

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

  const [provider, setProvider] = useState('mtn_momo');
  const [phone,    setPhone]    = useState('');
  const [phoneName,setPhoneName]= useState(user?.name || '');
  const [card,     setCard]     = useState({ number: '', name: '', expiry: '', cvv: '' });
  const [focus,    setFocus]    = useState(null);
  const [errs,     setErrs]     = useState({});

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

  const currentProvider = PROVIDERS.find(p => p.id === provider);

  const validate = () => {
    const e = {};
    if (currentProvider.type === 'momo') {
      const clean = phone.replace(/\D/g, '');
      if (clean.length < 9) e.phone = 'Enter a valid Ghana phone number';
      if (!phoneName.trim()) e.phoneName = 'Enter the account holder name';
    } else {
      const digits = card.number.replace(/\s/g, '');
      if (digits.length < 13) e.number = 'Enter a valid card number';
      if (!card.name.trim()) e.name = 'Cardholder name is required';
      const [m, y] = (card.expiry || '').split('/');
      const now = new Date();
      if (!m || !y || +m < 1 || +m > 12 ||
          (+y + 2000) < now.getFullYear() ||
          ((+y + 2000) === now.getFullYear() && +m < now.getMonth() + 1))
        e.expiry = 'Invalid or expired';
      if (!card.cvv || card.cvv.length < 3) e.cvv = 'Enter a valid CVV';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const handlePay = async (evt) => {
    evt.preventDefault();
    if (!validate()) return;
    setStep('processing');
    setError('');

    const payment_details = currentProvider.type === 'momo'
      ? { phone: phone.replace(/\D/g, ''), account_name: phoneName.trim(), provider: currentProvider.short }
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
        body: JSON.stringify({ payment_method: provider, payment_details }),
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
              <ShieldCheck className="h-5 w-5 text-primary" /> Choose a payment method
            </h1>

            {/* Provider tiles */}
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {PROVIDERS.map(p => (
                <button
                  key={p.id} type="button"
                  onClick={() => { setProvider(p.id); setErrs({}); setError(''); }}
                  className={cn(
                    'p-3 rounded-xl border-2 transition-all text-left',
                    provider === p.id ? 'border-primary bg-primary/5 shadow-sm scale-[1.02]' : 'border-border hover:border-primary/40'
                  )}>
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs', p.tileBg, p.tileText)}>
                    {p.short}
                  </div>
                  <p className="text-[11px] font-medium mt-2 leading-tight">{p.name}</p>
                </button>
              ))}
            </div>

            {/* Animated card visual */}
            <div className="mt-6 mb-6">
              {currentProvider.type === 'momo'
                ? <MomoCard provider={currentProvider} phone={phone} name={phoneName} />
                : <BankCard number={card.number} name={card.name} expiry={card.expiry} cvv={card.cvv} focus={focus} flipped={focus === 'cvv'} />}
            </div>

            <form onSubmit={handlePay} className="space-y-3.5">
              {currentProvider.type === 'momo' ? (
                <>
                  <div>
                    <label className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                      <Smartphone className="h-3.5 w-3.5" /> {currentProvider.short} phone number
                    </label>
                    <input
                      type="tel" inputMode="numeric" placeholder="0244 123 456"
                      value={phone}
                      onChange={e => setPhone(formatPhone(e.target.value))}
                      className={cn(
                        'w-full mt-1.5 h-11 px-3 rounded-lg border-2 outline-none transition bg-background',
                        errs.phone ? 'border-destructive' : 'border-border focus:border-primary'
                      )}
                    />
                    {errs.phone && <p className="text-xs text-destructive mt-1">{errs.phone}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-muted-foreground">Account name</label>
                    <input
                      placeholder="Name on the mobile money account"
                      value={phoneName}
                      onChange={e => setPhoneName(e.target.value)}
                      className={cn(
                        'w-full mt-1.5 h-11 px-3 rounded-lg border-2 outline-none transition bg-background',
                        errs.phoneName ? 'border-destructive' : 'border-border focus:border-primary'
                      )}
                    />
                    {errs.phoneName && <p className="text-xs text-destructive mt-1">{errs.phoneName}</p>}
                  </div>
                  <p className="text-[11px] text-muted-foreground -mt-1">
                    You'll get a prompt on your phone to authorize the payment.
                  </p>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5" /> Card number
                    </label>
                    <input
                      inputMode="numeric" placeholder="1234 5678 9012 3456"
                      value={card.number}
                      onFocus={() => setFocus('number')}
                      onChange={e => setCard({ ...card, number: formatCardNumber(e.target.value) })}
                      className={cn(
                        'w-full mt-1.5 h-11 px-3 rounded-lg border-2 outline-none transition bg-background font-mono',
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
                      onFocus={() => setFocus('name')}
                      onChange={e => setCard({ ...card, name: e.target.value })}
                      className={cn(
                        'w-full mt-1.5 h-11 px-3 rounded-lg border-2 outline-none transition bg-background',
                        errs.name ? 'border-destructive' : 'border-border focus:border-primary'
                      )}
                    />
                    {errs.name && <p className="text-xs text-destructive mt-1">{errs.name}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold uppercase text-muted-foreground">Expiry (MM/YY)</label>
                      <input
                        inputMode="numeric" placeholder="MM/YY"
                        value={card.expiry}
                        onFocus={() => setFocus('expiry')}
                        onChange={e => setCard({ ...card, expiry: formatExpiry(e.target.value) })}
                        className={cn(
                          'w-full mt-1.5 h-11 px-3 rounded-lg border-2 outline-none transition bg-background font-mono',
                          errs.expiry ? 'border-destructive' : 'border-border focus:border-primary'
                        )}
                      />
                      {errs.expiry && <p className="text-xs text-destructive mt-1">{errs.expiry}</p>}
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase text-muted-foreground">CVV</label>
                      <input
                        inputMode="numeric" placeholder="123" maxLength={4}
                        value={card.cvv}
                        onFocus={() => setFocus('cvv')}
                        onBlur={() => setFocus(null)}
                        onChange={e => setCard({ ...card, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                        className={cn(
                          'w-full mt-1.5 h-11 px-3 rounded-lg border-2 outline-none transition bg-background font-mono',
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

              <Button type="submit" disabled={step === 'processing'} className="w-full h-11 text-sm">
                {step === 'processing'
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing…</>
                  : <><Lock className="h-4 w-4 mr-2" /> Pay {formatPrice(course.price)}</>}
              </Button>

              <p className="text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1">
                <Lock className="h-3 w-3" /> Encrypted end-to-end. We never store your full card details.
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
              <div className="flex justify-between pt-3 mt-3 border-t border-border font-bold text-base">
                <span>Total</span><span>{formatPrice(course.price)}</span>
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
