import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CreditCard, Lock, CheckCircle2, ChevronLeft, Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Input, Label } from '@/components/common/Input';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/api';

function formatCardNumber(v) {
  return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}
function formatExpiry(v) {
  const digits = v.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 3) return digits.slice(0,2) + '/' + digits.slice(2);
  return digits;
}

export default function PaymentPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { refreshCourses, refreshProfile } = useAuth();

  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState('form'); // form | processing | success | error
  const [paymentRef, setPaymentRef] = useState('');
  const [error, setError] = useState('');

  const [card, setCard] = useState({ name: '', number: '', expiry: '', cvv: '' });
  const [cardErrors, setCardErrors] = useState({});
  const [focused, setFocused] = useState('');

  useEffect(() => {
    const fetchCourse = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/courses/${courseId}`);
        const data = await res.json();
        if (!res.ok || data.course?.is_free) {
          navigate(`/courses/${courseId}`, { replace: true }); return;
        }
        setCourse(data.course);
        // Initiate payment on the server
        const token = sessionStorage.getItem('auth_token');
        const pres = await fetch(`${API_BASE}/api/payments/initiate`,  {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ course_id: courseId }),
        });
        const pdata = await pres.json();
        if (!pres.ok) {
          // Already enrolled?
          if (pdata.error?.includes('enrolled')) navigate(`/courses/${courseId}`, { replace: true });
          else setError(pdata.error || 'Could not initiate payment');
        } else {
          setPaymentRef(pdata.payment_ref);
        }
      } catch { setError('Unable to load payment page.'); }
      setLoading(false);
    };
    fetchCourse();
  }, [courseId, navigate]);

  const validate = () => {
    const errs = {};
    if (!card.name.trim()) errs.name = 'Cardholder name required';
    const digits = card.number.replace(/\s/g, '');
    if (digits.length !== 16) errs.number = 'Enter a valid 16-digit card number';
    const [m, y] = (card.expiry || '').split('/');
    const now = new Date();
    if (!m || !y || parseInt(m) < 1 || parseInt(m) > 12 ||
        (parseInt(y) + 2000) < now.getFullYear() ||
        ((parseInt(y) + 2000) === now.getFullYear() && parseInt(m) < now.getMonth() + 1)) {
      errs.expiry = 'Invalid or expired date';
    }
    if (!card.cvv || card.cvv.length < 3) errs.cvv = 'Enter valid CVV';
    setCardErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handlePay = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setStep('processing');
    setError('');
    try {
      const token = sessionStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/api/payments/confirm`,  {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          course_id: courseId,
          payment_ref: paymentRef,
          card: {
            name: card.name,
            number: card.number.replace(/\s/g, ''),
            expiry: card.expiry,
            cvv: card.cvv,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment failed');
      // Refresh profile (updates enrollmentMap) and course list
      await Promise.allSettled([refreshCourses(), refreshProfile()]);
      setStep('success');
    } catch (e) {
      setError(e.message || 'Payment failed. Please try again.');
      setStep('form');
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (step === 'success') return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="max-w-md w-full p-10 text-center space-y-6 shadow-2xl">
        <div className="w-20 h-20 mx-auto rounded-full bg-success/10 flex items-center justify-center">
          <CheckCircle2 className="h-10 w-10 text-success" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Payment Successful!</h1>
          <p className="text-muted-foreground mt-2">You're now enrolled in <strong>{course?.title}</strong>.</p>
          <p className="text-xs text-muted-foreground mt-1">Receipt: {paymentRef}</p>
        </div>
        <Button className="w-full" onClick={() => navigate(`/courses/${courseId}`)}>
          Start Learning
        </Button>
      </Card>
    </div>
  );

  if (step === 'processing') return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="text-center space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
        <p className="text-lg font-semibold">Processing payment…</p>
        <p className="text-sm text-muted-foreground">Please do not close this page.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="max-w-4xl mx-auto px-0 sm:px-0">
        {/* Back */}
        <Link to={`/courses/${courseId}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-6">
          <ChevronLeft className="h-4 w-4" /> Back to Course
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
          {/* Payment form */}
          <div className="lg:col-span-3">
            <Card className="p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2 bg-primary/10 rounded-xl"><CreditCard className="h-5 w-5 text-primary" /></div>
                <div>
                  <h1 className="text-xl font-bold">Secure Checkout</h1>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Lock className="h-3 w-3" /> SSL encrypted • PCI compliant
                  </p>
                </div>
              </div>

              {error && (
                <div className="mb-6 flex items-center gap-3 p-4 bg-destructive/5 border border-destructive/20 rounded-xl text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />{error}
                </div>
              )}

              {/* Card preview */}
              <div className={cn('relative h-44 rounded-2xl p-6 mb-8 overflow-hidden transition-all duration-500',
                focused === 'cvv' ? 'bg-gradient-to-br from-slate-600 to-slate-800' : 'bg-gradient-to-br from-primary to-primary/70')}>
                <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-white/5 -mr-16 -mt-16" />
                <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-white/5 -ml-10 -mb-10" />
                <div className="relative z-10 h-full flex flex-col justify-between text-white">
                  <div className="flex justify-between items-start">
                    <svg className="h-8 w-auto opacity-90" viewBox="0 0 48 48" fill="none">
                      <rect width="48" height="48" rx="8" fill="white" fillOpacity=".15"/>
                      <circle cx="18" cy="24" r="10" fill="#EB001B" fillOpacity=".9"/>
                      <circle cx="30" cy="24" r="10" fill="#F79E1B" fillOpacity=".9"/>
                    </svg>
                    {focused === 'cvv'
                      ? <div className="bg-white/20 px-3 py-1 rounded text-sm font-mono tracking-widest">
                          {card.cvv || '•••'}
                        </div>
                      : <ShieldCheck className="h-6 w-6 opacity-60" />}
                  </div>
                  <div>
                    <p className="font-mono text-lg tracking-[0.2em] mb-2">
                      {card.number || '•••• •••• •••• ••••'}
                    </p>
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-[9px] opacity-60 uppercase">Card Holder</p>
                        <p className="text-sm font-medium">{card.name || 'Your Name'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] opacity-60 uppercase">Expires</p>
                        <p className="text-sm font-medium">{card.expiry || 'MM/YY'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <form onSubmit={handlePay} className="space-y-5">
                <div className="space-y-1.5">
                  <Label>Cardholder Name</Label>
                  <Input value={card.name} onFocus={() => setFocused('name')} onBlur={() => setFocused('')}
                    onChange={e => setCard(p => ({...p, name: e.target.value}))}
                    placeholder="John Doe" className={cardErrors.name ? 'border-destructive' : ''} />
                  {cardErrors.name && <p className="text-xs text-destructive">{cardErrors.name}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label>Card Number</Label>
                  <div className="relative">
                    <Input value={card.number} onFocus={() => setFocused('number')} onBlur={() => setFocused('')}
                      onChange={e => setCard(p => ({...p, number: formatCardNumber(e.target.value)}))}
                      placeholder="1234 5678 9012 3456" inputMode="numeric"
                      className={cn('pr-12', cardErrors.number ? 'border-destructive' : '')} />
                    <CreditCard className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                  {cardErrors.number && <p className="text-xs text-destructive">{cardErrors.number}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Expiry Date</Label>
                    <Input value={card.expiry} onFocus={() => setFocused('expiry')} onBlur={() => setFocused('')}
                      onChange={e => setCard(p => ({...p, expiry: formatExpiry(e.target.value)}))}
                      placeholder="MM/YY" inputMode="numeric"
                      className={cardErrors.expiry ? 'border-destructive' : ''} />
                    {cardErrors.expiry && <p className="text-xs text-destructive">{cardErrors.expiry}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>CVV</Label>
                    <Input value={card.cvv} onFocus={() => setFocused('cvv')} onBlur={() => setFocused('')}
                      onChange={e => setCard(p => ({...p, cvv: e.target.value.replace(/\D/g,'').slice(0,4)}))}
                      placeholder="•••" inputMode="numeric" type="password"
                      className={cardErrors.cvv ? 'border-destructive' : ''} />
                    {cardErrors.cvv && <p className="text-xs text-destructive">{cardErrors.cvv}</p>}
                  </div>
                </div>

                <Button type="submit" className="w-full h-13 text-sm font-bold" size="lg">
                  <Lock className="mr-2 h-4 w-4" />
                  Pay ${course?.price?.toFixed(2)}
                </Button>
              </form>

              <p className="text-center text-xs text-muted-foreground mt-4">
                Your payment is secured with 256-bit SSL encryption
              </p>
            </Card>
          </div>

          {/* Order summary */}
          <div className="lg:col-span-2">
            <Card className="p-6 shadow-sm sticky top-24 space-y-5">
              <h2 className="font-bold text-lg">Order Summary</h2>
              <div className="flex gap-4">
                <img src={course?.thumbnail || '/placeholder.jpg'} alt={course?.title}
                  className="w-20 h-14 rounded-lg object-cover shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-sm line-clamp-2">{course?.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{course?.instructor_name}</p>
                  <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full mt-1 inline-block">
                    {course?.category}
                  </span>
                </div>
              </div>
              <div className="space-y-2 border-t border-border pt-4 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Original Price</span><span className="line-through">${(course?.price * 1.5).toFixed(2)}</span></div>
                <div className="flex justify-between text-success font-medium"><span>Discount</span><span>-${(course?.price * 0.5).toFixed(2)}</span></div>
              </div>
              <div className="flex justify-between font-bold text-lg border-t border-border pt-4">
                <span>Total</span>
                <span>${course?.price?.toFixed(2)}</span>
              </div>
              <div className="space-y-2 pt-2">
                {[
                  course?.has_certificate && '✓ Certificate of completion',
                  course?.has_lifetime_access && '✓ Lifetime access',
                  '✓ 30-day money-back guarantee',
                ].filter(Boolean).map(item => (
                  <p key={item} className="text-xs text-muted-foreground">{item}</p>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
