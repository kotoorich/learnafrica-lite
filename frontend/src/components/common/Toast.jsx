/**
 * Toast.jsx — lightweight, dependency-free toast notification system.
 *
 * Usage:
 *   1. Mount <ToastProvider> once near the root of the app (in App.jsx).
 *   2. Anywhere inside it, call `const { showToast } = useToast()`, then
 *      showToast({ type: 'success', message: 'Signed in' }).
 *
 * Only fires when explicitly called by the code after an operation actually
 * resolves, so it never appears unless the caller confirms success/failure.
 * Auto-dismisses on its own after a few seconds and never blocks navigation
 * or redirects, it's a floating overlay, not a modal.
 */
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const showToast = useCallback(({ type = 'success', message, duration = 3200 }) => {
    const id = ++idCounter;
    setToasts(prev => [...prev, { id, type, message }]);
    timers.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast, dismiss }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[10000] flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
      >
        {toasts.map(t => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto flex items-center gap-2.5 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-bottom-2 fade-in duration-300 max-w-sm',
              t.type === 'success'
                ? 'bg-success/10 border-success/30 text-success'
                : 'bg-destructive/10 border-destructive/30 text-destructive'
            )}
          >
            {t.type === 'success'
              ? <CheckCircle2 className="h-4.5 w-4.5 shrink-0" />
              : <XCircle className="h-4.5 w-4.5 shrink-0" />}
            <span className="text-sm font-medium text-foreground">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="ml-auto text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fail soft rather than crashing the page if a component renders
    // outside the provider during development.
    return { showToast: () => {}, dismiss: () => {} };
  }
  return ctx;
}
