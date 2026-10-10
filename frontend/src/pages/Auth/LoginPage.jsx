import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Input, Label } from '@/components/common/Input';
import { useAuth } from '@/context/AuthContext';
import { GoogleAuthButton } from '@/components/common/GoogleAuthButton';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnUrl = new URLSearchParams(location.search).get('returnUrl');

  const handleGoogle = async (credential) => {
    setError('');
    setIsLoading(true);
    try {
      const u = await loginWithGoogle(credential);
      if (returnUrl) navigate(returnUrl);
      else navigate(u?.role === 'instructor' ? '/instructor' : '/dashboard');
    } catch (err) {
      setError(err?.message || 'Google sign-in failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Client-side validation
    if (!email || !password) {
      setError('Please enter both your email and password.');
      return;
    }
    if (!email.includes('@') || email.length < 5) {
      setError('That doesn\'t look like a valid email address.');
      return;
    }

    // Check offline BEFORE trying to hit the server
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError('You appear to be offline. Please check your internet connection and try again.');
      return;
    }

    setIsLoading(true);
    try {
      await login({ email, password });
      if (returnUrl) {
        navigate(returnUrl);
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      // Translate technical errors into friendly user messages
      const raw = String(err?.message || err || '').toLowerCase();

      if (raw.includes('failed to fetch') || raw.includes('networkerror')
          || raw.includes('network request failed') || raw.includes('load failed')) {
        setError('Could not connect to the server. Please check your internet and try again.');
      } else if (raw.includes('401') || raw.includes('invalid') || raw.includes('incorrect')
          || raw.includes('wrong') || raw.includes('credentials') || raw.includes('unauthorized')
          || raw.includes('password') || raw.includes('not found') || raw.includes('no user')) {
        setError('Incorrect email or password. Please try again.');
      } else if (raw.includes('locked') || raw.includes('too many') || raw.includes('rate')) {
        setError('Too many login attempts. Please wait a moment and try again.');
      } else if (raw.includes('500') || raw.includes('server error')) {
        setError('The server ran into a problem. Please try again in a few seconds.');
      } else if (raw.includes('timeout') || raw.includes('timed out')) {
        setError('The server took too long to respond. Please try again.');
      } else if (raw) {
        // Show original message if it's short and readable
        setError(err.message.length < 120 ? err.message : 'Login failed. Please try again.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground">Enter your credentials to access your account</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@learnafrica.com"
              className="pl-10"
              autoComplete="email"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-sm text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="pl-10 pr-10"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm text-center">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">or</span>
        </div>
      </div>

      <GoogleAuthButton text="continue_with" onCredential={handleGoogle} />

      <p className="text-center text-sm text-muted-foreground">
        Don't have an account?{' '}
        <Link to="/signup" className="text-primary hover:underline font-medium">
          Sign up
        </Link>
      </p>
    </div>
  );
}