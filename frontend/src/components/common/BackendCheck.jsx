/**
 * BackendCheck — mounts once at app root, silently checks if Flask is reachable.
 * Shows a visible banner if it's not, so the user knows to start the backend.
 */
import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { API_BASE } from '@/lib/api';

export default function BackendCheck() {
  const [backendDown, setBackendDown] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/health`,  { signal: AbortSignal.timeout(3000) });
        setBackendDown(!res.ok);
      } catch {
        setBackendDown(true);
      }
    };
    check();
    // Re-check every 10 seconds
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!backendDown || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-lg px-4">
      <div className="flex items-start gap-3 bg-destructive text-destructive-foreground p-4 rounded-xl shadow-2xl border border-destructive/80">
        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">Backend server is not running</p>
          <p className="text-xs opacity-90 mt-0.5">
            Open a terminal in your project folder and run:&nbsp;
            <code className="bg-white/20 px-1.5 py-0.5 rounded font-mono">python app.py</code>
          </p>
        </div>
        <button onClick={() => setDismissed(true)} className="p-0.5 opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
