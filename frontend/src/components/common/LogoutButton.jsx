import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

/**
 * LogoutButton — one red Logout control used everywhere, with a themed
 * confirmation dialog. Logging out is destructive (loses session), so we always
 * ask first rather than dropping the user out on a stray tap.
 *
 * variant 'solid'  — filled red button (used in the mobile profile drawer)
 * variant 'menu'   — red row inside a dropdown/menu
 */
export default function LogoutButton({
  variant = 'menu',
  className,
  onLoggedOut,
  iconClassName,
}) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const doLogout = useCallback(async () => {
    setBusy(true);
    // Clear the session and auth state FIRST. The API call is best-effort and
    // `logout()` also awaits a course reload, so awaiting it before clearing
    // could leave the user still signed in if that reload failed.
    sessionStorage.removeItem('auth_token');
    setConfirming(false);
    if (onLoggedOut) onLoggedOut();
    try { await logout(); } catch {}
    navigate('/', { replace: true });
    setBusy(false);
  }, [logout, navigate, onLoggedOut]);

  const base =
    'flex w-full items-center gap-3 transition-all text-red-500 font-semibold';
  const styles = variant === 'solid'
    ? 'h-11 justify-center rounded-xl bg-red-500/5 border border-red-500/10 text-[11px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white'
    : 'rounded-xl px-4 py-3 text-sm hover:bg-red-500/10';

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={cn(base, styles, className)}
      >
        <LogOut className={cn('h-4 w-4', iconClassName)} strokeWidth={2.5} />
        <span>Logout</span>
      </button>

      {confirming && createPortal(
        <div
          data-logout-confirm
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => !busy && setConfirming(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl bg-background border border-border shadow-2xl p-6 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="h-14 w-14 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <LogOut className="h-7 w-7 text-red-500" />
              </div>
              <h2 className="text-xl font-bold mb-2">Log out?</h2>
              <p className="text-sm text-muted-foreground mb-6">
                You'll be signed out of LearnAfrica on this device. You can sign
                back in any time.
              </p>
              <div className="flex flex-col w-full gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={doLogout}
                  className="w-full h-11 inline-flex items-center justify-center rounded-lg bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-60 transition-colors"
                >
                  {busy ? 'Logging out…' : 'Yes, log out'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                  className="w-full h-11 inline-flex items-center justify-center rounded-lg border border-border bg-background text-foreground font-semibold hover:bg-muted disabled:opacity-60 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
