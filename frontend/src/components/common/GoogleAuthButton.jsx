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
import { useCallback, useEffect, useRef, useState } from 'react';

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

export function GoogleAuthButton({ onCredential, text = 'continue_with', role, helper }) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const holder = useRef(null);
  const wrap = useRef(null);
  const [failed, setFailed] = useState(false);

  // Google renders inside its own iframe and centres the logo itself, so the
  // reliable way to make it line up with our buttons is to give it the exact
  // width of the container it sits in (clamped to Google's 200-400px range).
  const render = useCallback(() => {
    if (!window.google?.accounts?.id || !holder.current) return;
    const avail = wrap.current?.clientWidth || 320;
    const width = Math.max(200, Math.min(400, Math.floor(avail)));
    window.google.accounts.id.initialize({
      client_id: clientId,
      // Ask Google for the display-name claim explicitly. Without this the ID
      // token can arrive without `name`, and the account ends up named after
      // the email local part.
      essential_claims: 'name',
      callback: (response) => {
        if (response?.credential) onCredential?.(response.credential, role);
      },
    });
    holder.current.innerHTML = '';
    window.google.accounts.id.renderButton(holder.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text,                 // 'continue_with' | 'signup_with' | 'signin_with'
      // 'pill' is Google's fully-rounded shape. A square logo inside a rounded
      // custom button is not permitted by Google's branding rules, so the
      // official pill is how we get the round look while staying compliant and
      // keeping sign-in working.
      shape: 'pill',
      logo_alignment: 'left',
      width,
    });
  }, [clientId, onCredential, text, role]);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadGsi().then(() => { if (!cancelled) render(); })
      .catch(() => { if (!cancelled) setFailed(true); });
    // Re-render on resize so the button keeps matching the layout on mobile.
    const onResize = () => { if (!cancelled) { try { render(); } catch { /* noop */ } } };
    window.addEventListener('resize', onResize);
    return () => { cancelled = true; window.removeEventListener('resize', onResize); };
  }, [clientId, render]);

  if (!clientId || failed) return null;

  return (
    <div ref={wrap} className="w-full flex flex-col items-center gap-1.5">
      <div ref={holder} className="flex justify-center w-full" />
      <p className="text-[11px] text-muted-foreground text-center leading-relaxed px-1">
        {helper || 'Google sign-in is provided by Google. We never see your Google password.'}
      </p>
    </div>
  );
}

export default GoogleAuthButton;
