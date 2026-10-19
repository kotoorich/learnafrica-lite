import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, CheckCircle2, CreditCard, MapPin, IdCard, ShieldCheck, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { API_BASE } from '@/lib/api';

/**
 * Shown before an instructor signs up, so the applicant sees — before entering
 * any details — whether instructor registration is free or paid, the exact fee,
 * and what information they must provide.
 */
export default function InstructorInfoPage() {
  const navigate = useNavigate();
  const [reg, setReg] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/instructor-registration`)
      .then(r => r.json())
      .then(setReg)
      .catch(() => setReg({ is_free: true, fee: 0, currency: 'GHS' }));
  }, []);

  const isFree = reg?.is_free !== false;
  const fee = Number(reg?.fee || 0);
  const currency = reg?.currency || 'GHS';

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <GraduationCap className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Become an instructor</h1>
        <p className="text-sm text-muted-foreground">
          Review what you'll need before you start. Student accounts are always free to create.
        </p>
      </div>

      {/* Fee banner */}
      <div className={isFree ? 'p-4 rounded-xl bg-success/10 border border-success/30 text-center'
                             : 'p-4 rounded-xl bg-primary/10 border border-primary/30 text-center'}>
        {reg === null ? (
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking registration fee…
          </span>
        ) : isFree ? (
          <>
            <p className="text-lg font-bold text-success">Instructor registration is FREE</p>
            <p className="text-xs text-muted-foreground mt-1">No registration fee is charged.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-muted-foreground">One-time instructor registration fee</p>
            <p className="text-2xl font-black text-primary">{currency} {fee.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Payable after you submit your application, before your account is activated.
            </p>
          </>
        )}
      </div>

      {/* What you need */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">What you'll need</h2>
        <div className="flex items-start gap-3">
          <IdCard className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-sm"><strong>Ghana Card number</strong> — format GHA-123456789-0.</p>
        </div>
        <div className="flex items-start gap-3">
          <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-sm"><strong>GhanaPost GPS digital address</strong> — e.g. GA-123-4567.</p>
        </div>
        <div className="flex items-start gap-3">
          <CreditCard className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-sm"><strong>A payout method</strong> — mobile money or bank, where your earnings are sent.</p>
        </div>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-sm"><strong>A professional bio</strong> and your field / specialisation.</p>
        </div>
      </div>

      {/* Agreement note */}
      <div className="p-3 rounded-lg bg-muted/40 border border-border flex items-start gap-3">
        <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          You'll be asked to confirm that the information you provide is accurate and truthful, and to
          acknowledge that LearnAfrica may verify it. Providing false or misleading information may
          result in rejection, suspension, account termination, or referral to the appropriate authorities.
        </p>
      </div>

      <Button className="w-full" onClick={() => navigate('/signup?type=instructor')}>
        Continue to registration <ArrowRight className="ml-2 h-4 w-4" />
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Just want to learn?{' '}
        <Link to="/signup?type=student" className="text-primary hover:underline font-medium">Create a free student account</Link>
      </p>
    </div>
  );
}
