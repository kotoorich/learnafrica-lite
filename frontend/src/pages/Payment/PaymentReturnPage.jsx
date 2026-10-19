import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { API_BASE } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatPrice } from '@/lib/money';

/**
 * Landing page after Paystack redirects the user back from checkout.
 * URL: /payment/return?reference=<txn_id>&trxref=<txn_id>
 *
 * Calls the backend verify endpoint to confirm the payment status
 * and enroll the student if successful.
 */
export default function PaymentReturnPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refreshCourses, refreshProfile } = useAuth();

  const reference = params.get('reference') || params.get('trxref') || '';
  const [state, setState]   = useState('checking'); // checking | success | failed | pending
  const [result, setResult] = useState(null);
  const [error,  setError]  = useState('');

  useEffect(() => {
    if (!reference) {
      setState('failed');
      setError('No transaction reference found in the URL.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = sessionStorage.getItem('auth_token');
        const res = await fetch(`${API_BASE}/api/payments/verify/${encodeURIComponent(reference)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.detail || data.error || 'Could not verify the payment.');
          setState('failed');
          return;
        }
        setResult(data);
        if (data.status === 'success') {
          // Refresh user info so the newly-enrolled course shows up
          await Promise.allSettled([refreshCourses?.(), refreshProfile?.()]);
          setState('success');
        } else if (data.status === 'failed') {
          setState('failed');
          setError('The payment was not completed.');
        } else {
          setState('pending');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Unable to verify payment.');
          setState('failed');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [reference, refreshCourses, refreshProfile]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <Card className="p-8 max-w-md w-full text-center">
        {state === 'checking' && (
          <>
            <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary mb-4" />
            <h2 className="text-xl font-bold">Verifying your payment</h2>
            <p className="text-sm text-muted-foreground mt-2">Please wait a moment...</p>
          </>
        )}

        {state === 'success' && (
          <>
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h2 className="text-2xl font-bold">Payment Successful</h2>
            <p className="text-sm text-muted-foreground mt-2">
              You are now enrolled. Enjoy your course!
            </p>
            {result && (
              <div className="mt-6 p-4 rounded-lg bg-muted/40 text-left text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-bold">{formatPrice(result.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Receipt ID</span>
                  <span className="font-mono text-xs">{result.receipt_id}</span>
                </div>
              </div>
            )}
            <div className="mt-6 flex flex-col sm:flex-row gap-2">
              <Button onClick={() => navigate('/dashboard')} className="flex-1">Go to dashboard</Button>
              <Button variant="outline" onClick={() => navigate('/receipts')} className="flex-1">View receipt</Button>
            </div>
          </>
        )}

        {state === 'failed' && (
          <>
            <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-4">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-2xl font-bold">Payment Not Completed</h2>
            <p className="text-sm text-muted-foreground mt-2">
              {error || 'Your payment could not be processed. You have not been charged.'}
            </p>
            <div className="mt-6">
              <Button onClick={() => navigate('/courses')} className="w-full">Back to courses</Button>
            </div>
          </>
        )}

        {state === 'pending' && (
          <>
            <div className="w-16 h-16 rounded-full bg-warning/20 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-warning" />
            </div>
            <h2 className="text-2xl font-bold">Payment Pending</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Your payment is still being processed. If you completed the payment,
              please check back in a few minutes, or view your receipts.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-2">
              <Button onClick={() => window.location.reload()} className="flex-1">Check again</Button>
              <Button variant="outline" onClick={() => navigate('/receipts')} className="flex-1">View receipts</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
