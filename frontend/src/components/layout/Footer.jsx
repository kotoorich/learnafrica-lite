import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../common/Logo';
import { useAuth } from '../../context/AuthContext';
import {
  fetchFooterConfig, linkVisibleForViewer, viewerAudience, SOCIAL_NAMES,
} from '../../lib/footerConfig';

const socialIcons = {
  facebook: (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" />
    </svg>
  ),
  twitter: (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z" />
    </svg>
  ),
  linkedin: (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M4.98 3.5c0 1.381-1.11 2.5-2.48 2.5s-2.48-1.119-2.48-2.5c0-1.38 1.11-2.5 2.48-2.5s2.48 1.12 2.48 2.5zm.02 4.5h-5v16h5v-16zm7.982 0h-4.968v16h4.969v-8.399c0-4.67 6.029-5.052 6.029 0v8.399h4.988v-10.131c0-7.88-8.922-7.593-11.018-3.714v-2.155z" />
    </svg>
  ),
  instagram: (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  ),
};

const isInternal = (url) => typeof url === 'string' && url.startsWith('/');

function FooterLink({ link }) {
  if (isInternal(link.url)) {
    return (
      <Link to={link.url} className="text-sm text-muted-foreground transition-colors hover:text-primary">
        {link.label}
      </Link>
    );
  }
  return (
    <a href={link.url} className="text-sm text-muted-foreground transition-colors hover:text-primary">
      {link.label}
    </a>
  );
}

export default function Footer() {
  const { user, isAuthenticated } = useAuth();
  const [config, setConfig] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchFooterConfig().then((c) => { if (alive) setConfig(c); });
    return () => { alive = false; };
  }, []);

  if (!config) return null;

  const cfg = config;
  const audience = viewerAudience(isAuthenticated, user?.role);
  const platformLinks = (cfg.platform_links || []).filter((l) => linkVisibleForViewer(l, audience));
  const supportLinks  = (cfg.support_links || [])
    .filter((l) => l.enabled !== false && l.label && l.url)
    // Safety net: if a Support link still points at the built-in demo contact
    // while the admin has set a real email/phone, show the real one instead.
    .map((l) => {
      const url = String(l.url || '');
      const low = url.toLowerCase();
      if (cfg.email && (low === 'mailto:support@learnafrica.com' || low === 'support@learnafrica.com')) {
        return { ...l, url: `mailto:${cfg.email}` };
      }
      if (cfg.phone && low.startsWith('tel:') && url.replace(/\D/g, '') === '233256411155') {
        const digits = String(cfg.phone).replace(/\D/g, '');
        return { ...l, url: `tel:${String(cfg.phone).trim().startsWith('+') ? '+' : ''}${digits}` };
      }
      return l;
    });

  const activeSocials = SOCIAL_NAMES
    .map((name) => [name, cfg.socials?.[name]])
    .filter(([, s]) => s && s.enabled && s.url);

  return (
    <footer id="about-section" className="border-t border-border bg-card">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand Column — spans the full row on mobile so it isn't
              squeezed into half-width alongside a links column */}
          <div className="col-span-2">
            <Link to="/" className="flex items-center gap-2">
              <Logo size={40} />
              <span className="text-xl font-bold text-foreground">
                Learn<span className="text-primary">Africa</span>
              </span>
            </Link>
            <p className="mt-4 text-sm text-muted-foreground max-w-xs">
              {cfg.tagline}
            </p>

            <div className="mt-6 space-y-2">
              {cfg.email && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <a href={`mailto:${cfg.email}`} className="hover:text-primary transition-colors">{cfg.email}</a>
                </div>
              )}
              {cfg.phone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <a href={`tel:${String(cfg.phone).replace(/\s+/g, '')}`} className="hover:text-primary transition-colors">{cfg.phone}</a>
                </div>
              )}
              {cfg.location && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{cfg.location}</span>
                </div>
              )}
            </div>

            {activeSocials.length > 0 && (
              <div className="mt-6 flex gap-3">
                {activeSocials.map(([name, s]) => (
                  <a
                    key={name}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={name}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary overflow-hidden"
                  >
                    {s.icon_url
                      ? <img src={s.icon_url} alt="" className="h-4 w-4 object-contain" />
                      : socialIcons[name]}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Links Columns */}
          {platformLinks.length > 0 && (
            <div>
              <h4 className="font-semibold text-foreground mb-4">Platform</h4>
              <ul className="space-y-2">
                {platformLinks.map((link, i) => (
                  <li key={`${link.label}-${i}`}><FooterLink link={link} /></li>
                ))}
              </ul>
            </div>
          )}

          {supportLinks.length > 0 && (
            <div>
              <h4 className="font-semibold text-foreground mb-4">Support</h4>
              <ul className="space-y-2">
                {supportLinks.map((link, i) => (
                  <li key={`${link.label}-${i}`}><FooterLink link={link} /></li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 md:flex-row">
          <p className="text-sm text-muted-foreground text-center">
            &copy; {new Date().getFullYear()} LearnAfrica Lite. All rights reserved.
          </p>
          <p className="text-sm text-muted-foreground">Made with love for African learners</p>
        </div>
      </div>
    </footer>
  );
}
