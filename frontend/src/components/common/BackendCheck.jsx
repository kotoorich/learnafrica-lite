/**
 * BackendCheck — mounts once at app root.
 *
 * 1. DEVELOPMENT: logs a console warning if backend isn't reachable.
 *    Helps developers remember to start `python run.py`.
 *
 * 2. PRODUCTION: silently pings /api/keepalive every 4 minutes while
 *    a user is on the site. This keeps Render's free dyno warm so
 *    subsequent API calls never hit a cold-start.
 *
 * Never shows a UI banner. All messages go to console only.
 */
import { useEffect } from 'react';
import { API_BASE } from '@/lib/api';

export default function BackendCheck() {
  useEffect(() => {
    const isDev = import.meta.env.DEV;
    let cancelled = false;

    // ── DEV: one-time check ──
    if (isDev) {
      (async () => {
        try {
          const res = await fetch(`${API_BASE}/api/health`, {
            signal: AbortSignal.timeout(4000),
          });
          if (cancelled) return;
          if (!res.ok) {
            console.warn(
              '%c[BackendCheck] Backend returned %d',
              'color: orange; font-weight: bold',
              res.status,
            );
          }
        } catch {
          if (cancelled) return;
          console.warn(
            '%c[BackendCheck] Backend is not running.\n' +
              'Open a terminal in your backend/ folder and run:\n' +
              '  python run.py',
            'color: orange; font-weight: bold',
          );
        }
      })();
      return () => { cancelled = true; };
    }

    // ── PRODUCTION: keepalive ping every 4 minutes ──
    // Pings /api/keepalive silently so Render doesn't spin down.
    // Render free dyno sleeps after 15 min idle; 4-min pings prevent that.
    const ping = () => {
      fetch(`${API_BASE}/api/keepalive`, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),  // generous - cold start can be slow
      }).catch(() => {
        // Silent - ping failures are okay, the next one will succeed
      });
    };

    // Ping immediately on mount, then every 4 minutes
    ping();
    const interval = setInterval(ping, 4 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Render nothing — never show a UI banner
  return null;
}
