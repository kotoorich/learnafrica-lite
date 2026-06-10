import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Label } from '@/components/common/Input';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const validate = () => {
    if (!email) { setError('Email is required'); return false; }
    if (!/\S+@\S+\.\S+/.test(email)) { setError('Enter a valid email'); return false; }
    setError(''); return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    // In production this would POST to /api/auth/forgot-password
    // For now we acknowledge the request without revealing if email exists (security best practice)
    await new Promise(r => setTimeout(r, 1000));
    setIsLoading(false);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="space-y-6 text-center animate-in fade-in duration-500">
        <div className="w-16 h-16 mx-auto rounded-full bg-success/10 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-success" />
        </div>
        <h1 className="text-2xl font-bold">Check your inbox</h1>
        <p className="text-muted-foreground text-sm">
          If an account exists for <strong>{email}</strong>, you'll receive a password reset link shortly.
          Check your spam folder if you don't see it.
        </p>
        <Link to="/login" className="flex items-center justify-center text-sm text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Forgot password?</h1>
        <p className="text-muted-foreground text-sm">Enter your email and we'll send a reset link.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
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
