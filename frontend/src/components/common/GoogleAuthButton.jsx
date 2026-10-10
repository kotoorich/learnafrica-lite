/**
 * GoogleAuthButton — the official "Sign in / Sign up with Google" button.
 *
 * Uses Google Identity Services (GSI). The browser gets a signed ID token from
 * Google and hands it to the app, which sends it to the backend for
 * verification. No Google secret ever touches the frontend.
 *
 * The client ID is public by design (it is not a secret) and comes from
 * VITE_GOOGLE_CLIENT_ID. If it is not configured, the button is hidden so it can
 * never look functional when it is not.
 */
import { useEffect, useRef, useState } from 'react';

const GSI_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise = null;

function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google sign-in'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function GoogleAuthButton({ onCredential, text = 'continue_with', role }) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const holder = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadGsi().then(() => {
      if (cancelled || !window.google?.accounts?.id || !holder.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response?.credential) onCredential?.(response.credential, role);
        },
      });
      holder.current.innerHTML = '';
      window.google.accounts.id.renderButton(holder.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text,           // 'continue_with' | 'signup_with' | 'signin_with'
        shape: 'rectangular',
        logo_alignment: 'left',
        width: 320,
      });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [clientId, onCredential, text, role]);

  if (!clientId || failed) return null;

  return (
    <div className="flex flex-col items-center gap-1">
      <div ref={holder} />
      <p className="text-[11px] text-muted-foreground text-center">
        Google sign-in is provided by Google. We never see your Google password.
      </p>
    </div>
  );
}

export default GoogleAuthButton;
