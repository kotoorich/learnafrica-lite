import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Loader2, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { API_BASE } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import Navbar from '@/components/layout/Navbar';

/**
 * One-time instructor registration fee checkout. Only reached when the admin
 * has switched instructor registration to paid. The amount is always the
 * server-configured fee; the client never sends it.
 */
export default function RegistrationPaymentPage() {
  const navigate = useNavigate();
  const { refreshProfile, refreshRegistrationPayment } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(null);

  const token = sessionStorage.getItem('auth_token');
  const authHeaders = { Authorization: `Bearer ${token}` };

  const loadStatus = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/instructor/registration/status`, { headers: authHeaders });
      const d = await r.json();
      setStatus(d);
      if (d && d.is_free) navigate('/instructor', { replace: true });
    } catch (e) {
      setError('Could not load your registration status. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); /* eslint-disable-next-line */ }, []);

  const pay = async () => {
    setPaying(true); setError(null);
    try {
      const r = await fetch(`${API_BASE}/api/instructor/registration/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Payment could not be started.');
      if (d.checkout_url) { window.location.href = d.checkout_url; return; }
      if (d.paid) {
        try { await refreshProfile(); } catch (_) {}
        // Clear the "payment due" flag so the instructor layout stops routing
        // back here (and no longer bounces the paid user in a loop).
        try { await refreshRegistrationPayment(); } catch (_) {}
        await loadStatus();
      }
    } catch (e) {
      setError(e.message);
    } finally { setPaying(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      </div>
    );
  }

  if (status?.paid) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="space-y-6 max-w-md mx-auto text-center py-10 px-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-success/10 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <h1 className="text-2xl font-bold">Registration fee paid</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Thank you. Your instructor application is now with our team for review. You'll be
            notified once it's approved.
          </p>
          <Button onClick={() => navigate('/instructor')} className="w-full">Go to my dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="space-y-6 max-w-md mx-auto py-8 px-4">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <CreditCard className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Complete your registration</h1>
          <p className="text-sm text-muted-foreground">
            A one-time instructor registration fee is required before your account can be activated.
          </p>
        </div>

        <div className="p-5 rounded-xl border border-primary/30 bg-primary/5 text-center">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Amount due</p>
          <p className="text-3xl font-black text-primary mt-1">
            {status?.currency || 'GHS'} {Number(status?.fee || 0).toFixed(2)}
          </p>
        </div>

        <div className="p-3 rounded-lg bg-muted/40 border border-border flex items-start gap-3">
          <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Your application has been received. It will only be reviewed by an admin once this fee is
            confirmed by the payment provider.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {error}
          </div>
        )}

        <Button className="w-full" onClick={pay} disabled={paying}>
          {paying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting payment…</>
                  : `Pay ${status?.currency || 'GHS'} ${Number(status?.fee || 0).toFixed(2)}`}
        </Button>
      </div>
    </div>
  );
}
