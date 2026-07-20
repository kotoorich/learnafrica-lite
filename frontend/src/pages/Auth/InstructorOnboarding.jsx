import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Globe, MapPin, FileText, ArrowLeft, Loader2, Clock, Briefcase, CreditCard } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Input, Label } from '@/components/common/Input';
import { useAuth } from '@/context/AuthContext';
import { PaymentMethodForm } from '@/components/common/PaymentMethodForm';
import { API_BASE } from '@/lib/api';

export default function InstructorOnboarding() {
  const locationState = useLocation().state;
  const navigate      = useNavigate();
  const { signup }    = useAuth();

  const [formData, setFormData] = useState({
    bio: '', title: '', location: '', website: '',
  });
  // REQUIRED payment method for instructor onboarding
  const [paymentMethod, setPaymentMethod] = useState({ method: 'momo', country: 'GH', details: {} });
  const [errors,    setErrors]   = useState({});
  const [isLoading, setLoading]  = useState(false);
  const [done,      setDone]     = useState(false);

  if (!locationState) { navigate('/signup'); return null; }

  const set = (key, val) => setFormData(p => ({ ...p, [key]: val }));

  // Payment validity — mirrors PaymentMethodForm's internal check so we can
  // disable submit cleanly.
  const isPaymentValid = () => {
    const m = paymentMethod?.method;
    const d = paymentMethod?.details || {};
    if (m === 'momo') {
      return !!(d.provider && d.phone && d.account_name &&
                String(d.phone).replace(/\D/g, '').length >= 9);
    }
    if (m === 'bank') {
      return !!(d.bank_name && d.account_number && d.account_name &&
                String(d.account_number).replace(/\D/g, '').length >= 6);
    }
    return false;
  };

  const validate = () => {
    const e = {};
    if (!formData.bio || formData.bio.length < 50)
      e.bio = 'Please provide a bio of at least 50 characters.';
    if (!formData.title)
      e.title = 'Your field / specialisation is required.';
    if (!formData.location)
      e.location = 'Location is required.';
    if (!isPaymentValid())
      e.payment = 'Please complete your payment method — this is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      // Step 1: create the account (signup)
      const result = await signup({ ...locationState, ...formData, role: 'instructor' });
      // If email verification is required, redirect to /verify-email — payment
      // method setup will happen after they verify (they can add it later from
      // their instructor settings).
      if (result && result.needs_verification) {
        navigate('/verify-email', { state: { email: result.email || locationState.email } });
        return;
      }
      // Step 2: immediately save the payment method (token is now set by signup)
      try {
        const token = sessionStorage.getItem('auth_token');
        if (token) {
          await fetch(`${API_BASE}/api/users/me/payment-method`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(paymentMethod),
          });
        }
      } catch (_) { /* non-fatal — they can complete it from Profile */ }
      setDone(true);
    } catch (err) {
      setErrors({ submit: err.message || 'Registration failed. Please try again.' });
    } finally { setLoading(false); }
  };

  /* ── Success / pending screen ── */
  if (done) {
    return (
      <div className="space-y-6 max-w-md mx-auto text-center py-10">
        <div className="w-16 h-16 mx-auto rounded-full bg-warning/10 flex items-center justify-center">
          <Clock className="h-8 w-8 text-warning" />
        </div>
        <h1 className="text-2xl font-bold">Application Submitted!</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Your instructor application is pending admin review. You'll be notified once it's
          approved. In the meantime you can browse courses as a student.
        </p>
        <Button onClick={() => navigate('/courses')} className="w-full">Browse Courses</Button>
      </div>
    );
  }

  /* ── Form ── */
  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div className="space-y-2">
        <button onClick={() => navigate('/signup')}
          className="flex items-center text-xs text-muted-foreground hover:text-primary transition-colors mb-4">
          <ArrowLeft className="mr-1 h-3 w-3" /> Back to account details
        </button>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Professional Profile</h1>
        <p className="text-sm text-muted-foreground">
          Complete your instructor profile to start creating courses. An admin will review your
          application before you can publish.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Professional Bio */}
        <div className="space-y-2">
          <Label htmlFor="bio" className="text-xs font-bold uppercase tracking-wider">
            Professional Bio <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <textarea id="bio" value={formData.bio}
              onChange={e => set('bio', e.target.value)}
              placeholder="Tell students about your experience, expertise, and teaching style… (min 50 characters)"
              className="flex min-h-[140px] w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 resize-none" />
          </div>
          {errors.bio && <p className="text-xs text-destructive font-medium">{errors.bio}</p>}
        </div>

        {/* Field / Specialisation — the key field the user asked about */}
        <div className="space-y-2">
          <Label htmlFor="title" className="text-xs font-bold uppercase tracking-wider">
            Your Field / Specialisation <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Briefcase className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="title" value={formData.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Web Developer, Data Scientist, UI/UX Designer, Cybersecurity Expert…"
              className="pl-10" />
          </div>
          <p className="text-[10px] text-muted-foreground">
            This appears on your profile and course pages so students know your expertise.
          </p>
          {errors.title && <p className="text-xs text-destructive font-medium">{errors.title}</p>}
        </div>

        {/* Location */}
        <div className="space-y-2">
          <Label htmlFor="location" className="text-xs font-bold uppercase tracking-wider">
            Your Location <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="location" value={formData.location}
              onChange={e => set('location', e.target.value)}
              placeholder="e.g. Accra, Ghana" className="pl-10" />
          </div>
          {errors.location && <p className="text-xs text-destructive font-medium">{errors.location}</p>}
        </div>

        {/* Portfolio / Website */}
        <div className="space-y-2">
          <Label htmlFor="website" className="text-xs font-bold uppercase tracking-wider">
            Portfolio / Website <span className="text-muted-foreground font-normal normal-case">(optional)</span>
          </Label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="website" type="url" value={formData.website}
              onChange={e => set('website', e.target.value)}
              placeholder="https://yourportfolio.com" className="pl-10" />
          </div>
        </div>

        {/* ── REQUIRED: Payment method for receiving payouts ── */}
        <div className="pt-2 space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5" /> Payout Method <span className="text-destructive normal-case font-bold">*</span>
          </Label>
          <p className="text-xs text-muted-foreground -mt-1">
            Required — this is where your course earnings will be sent. You can update it later from your profile.
          </p>
          <div className="p-4 rounded-xl border border-border bg-muted/20">
            <PaymentMethodForm
              value={paymentMethod}
              onChange={setPaymentMethod}
              showSaveButton={false}
            />
          </div>
          {errors.payment && (
            <p className="text-xs text-destructive font-bold">{errors.payment}</p>
          )}
        </div>

        {errors.submit && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-xs font-bold text-center">
            {errors.submit}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying Profile…</>
            : 'Complete Registration'}
        </Button>
      </form>

      <p className="text-center text-[11px] text-muted-foreground px-4 leading-relaxed italic">
        By completing this registration, you agree to our Instructor Guidelines and Content Quality Standards.
      </p>
    </div>
  );
}
