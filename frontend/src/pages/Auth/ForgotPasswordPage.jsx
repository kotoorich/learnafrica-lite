/**
 * ForgotPasswordPage — password recovery.
 *
 * Two modes, chosen by whether outgoing email is switched on:
 *   - Email ON  : the normal self-service form. The user enters their email and
 *                 the system emails them a reset link straight away.
 *   - Email OFF : a small modal (mini-tab) with a dropdown, an email field and
 *                 a Send button. The request is recorded for an administrator,
 *                 who later generates and shares a one-time reset link by hand.
 *
 * The response is always worded the same way so the page never reveals whether
 * an account exists for the address.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle2, ChevronDown, Send, LifeBuoy } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Label } from '@/components/common/Input';
import { Modal } from '@/components/common/Modal';
import { API_BASE } from '@/lib/api';

const REASONS = [
  { value: 'Forgot Password',      label: 'Forgot Password' },
  { value: 'Lost access to email', label: 'Lost access to my email' },
  { value: 'Other account issue',  label: 'Other account issue' },
];

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('Forgot Password');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  const [emailEnabled, setEmailEnabled] = useState(null); // null = unknown
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/password-reset-mode`)
      .then(r => r.json())
      .then(d => setEmailEnabled(!!d.email_enabled))
      .catch(() => setEmailEnabled(false));
  }, []);

  const validate = () => {
    if (!email) { setError('Email is required'); return false; }
    if (!/\S+@\S+\.\S+/.test(email)) { setError('Enter a valid email'); return false; }
    setError(''); return true;
  };

  const submitRequest = async (chosenReason) => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, reason: chosenReason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      setMessage(data.message || '');
      setSent(true);
      setModalOpen(false);
    } catch (e) {
      setError(e.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAutoSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    submitRequest('Forgot Password');
  };

  if (sent) {
    return (
      <div className="space-y-6 text-center animate-in fade-in duration-500">
        <div className="w-16 h-16 mx-auto rounded-full bg-success/10 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-success" />
        </div>
        <h1 className="text-2xl font-bold">
          {emailEnabled ? 'Check your inbox' : 'Request received'}
        </h1>
        <p className="text-muted-foreground text-sm">
          {message || (emailEnabled
            ? <span>If an account exists for <strong>{email}</strong>, you'll receive a reset link shortly. Check your spam folder if you don't see it.</span>
            : <span>Your request for <strong>{email}</strong> has been recorded. An administrator will review it and send you a reset link.</span>)}
        </p>
        <Link to="/login" className="flex items-center justify-center text-sm text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to sign in
        </Link>
      </div>
    );
  }

  const emailField = (
    <div className="space-y-2">
      <Label htmlFor="email">Email address</Label>
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="name@example.com"
          className="w-full pl-10 pr-4 py-2 border rounded-md bg-background border-input focus:ring-2 focus:ring-primary/20 outline-none" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );

  // Unknown yet: avoid flashing the wrong UI.
  if (emailEnabled === null) {
    return <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  // ── Email ON: normal self-service form ────────────────────────────────────
  if (emailEnabled) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Forgot password?</h1>
          <p className="text-muted-foreground text-sm">Enter your email and we'll send a reset link.</p>
        </div>
        <form onSubmit={handleAutoSubmit} className="space-y-4">
          {emailField}
          <Button type="submit" className="w-full h-11" disabled={isLoading}>
            {isLoading ? 'Sending…' : 'Send Reset Link'}
          </Button>
        </form>
        <Link to="/login" className="flex items-center justify-center text-sm text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to sign in
        </Link>
      </div>
    );
  }

  // ── Email OFF: manual request modal ───────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Forgot password?</h1>
        <p className="text-muted-foreground text-sm">
          Automatic reset emails are turned off. Send a request and an administrator
          will provide you with a reset link.
        </p>
      </div>
      <Button className="w-full h-11 gap-2" onClick={() => { setError(''); setModalOpen(true); }}>
        <LifeBuoy className="h-4 w-4" /> Request a password reset
      </Button>
      <Link to="/login" className="flex items-center justify-center text-sm text-muted-foreground hover:text-primary transition-colors">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to sign in
      </Link>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold">Request a password reset</h2>
            <p className="text-xs text-muted-foreground">
              Choose what you need, enter your registered email, and send.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">What do you need?</Label>
            <div className="relative">
              <select id="reason" value={reason} onChange={e => setReason(e.target.value)}
                className="w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-9 text-sm outline-none focus:ring-2 focus:ring-primary/20">
                {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          {emailField}

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button className="flex-1 gap-2" disabled={isLoading}
              onClick={() => { if (validate()) submitRequest(reason); }}>
              {isLoading ? 'Sending…' : <><Send className="h-4 w-4" /> Send</>}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default ForgotPasswordPage;
