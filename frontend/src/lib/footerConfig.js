/**
 * footerConfig.js — shared footer configuration helpers.
 *
 * The admin edits the footer through /api/admin/footer; the public site reads
 * it from /api/site/footer. Both return the same shape. If the request fails we
 * fall back to DEFAULT_FOOTER so the footer never renders empty.
 */
import { publicFetch, API_BASE } from './api';

export const SOCIAL_NAMES = ['facebook', 'twitter', 'linkedin', 'instagram'];

export const AUDIENCES = [
  { value: 'all',        label: 'Everyone' },
  { value: 'guest',      label: 'Guests (logged out)' },
  { value: 'student',    label: 'Students' },
  { value: 'instructor', label: 'Instructors' },
  { value: 'admin',      label: 'Admins' },
];

export const DEFAULT_FOOTER = {
  email: 'support@learnafrica.com',
  phone: '+233 256 411 155',
  location: 'Western Region, Ghana',
  tagline:
    'Practical, affordable learning for Africans, built in Ghana. Learn at your ' +
    'own pace, earn a certificate you can verify, and grow with people who ' +
    'understand your journey.',
  socials: {
    facebook:  { enabled: false, url: '', icon_url: '' },
    twitter:   { enabled: false, url: '', icon_url: '' },
    linkedin:  { enabled: false, url: '', icon_url: '' },
    instagram: { enabled: false, url: '', icon_url: '' },
  },
  platform_links: [
    { label: 'Browse Courses',       url: '/courses',   enabled: true, audience: 'all' },
    { label: 'Become an Instructor', url: '/signup',    enabled: true, audience: 'guest' },
    { label: 'Sign In',              url: '/login',     enabled: true, audience: 'guest' },
    { label: 'My Dashboard',         url: '/dashboard', enabled: true, audience: 'student' },
    { label: 'My Receipts',          url: '/receipts',  enabled: true, audience: 'student' },
    { label: 'Admin Panel',          url: '/admin',     enabled: true, audience: 'admin' },
    { label: 'Manage Courses',       url: '/instructor/courses', enabled: true, audience: 'admin' },
    { label: 'Receipts',             url: '/receipts',  enabled: true, audience: 'admin' },
    { label: 'Instructor Dashboard', url: '/instructor', enabled: true, audience: 'instructor' },
    { label: 'My Courses',           url: '/instructor/courses', enabled: true, audience: 'instructor' },
    { label: 'Receipts',             url: '/instructor/receipts', enabled: true, audience: 'instructor' },
  ],
  support_links: [
    { label: 'Email support',        url: 'mailto:support@learnafrica.com', enabled: true },
    { label: 'Call or WhatsApp',     url: 'tel:+233256411155',              enabled: true },
    { label: 'Verify a certificate', url: '/#verify-section',               enabled: true },
  ],
};

/** Which audience bucket is the current visitor in? */
export function viewerAudience(isAuthenticated, role) {
  if (!isAuthenticated) return 'guest';
  if (role === 'admin' || role === 'superadmin') return 'admin';
  if (role === 'instructor') return 'instructor';
  return 'student';
}

/** A platform link shows when enabled and its audience matches (or is 'all'). */
export function linkVisibleForViewer(link, audience) {
  if (!link || link.enabled === false) return false;
  return link.audience === 'all' || link.audience === audience;
}

export function mergeFooterConfig(data) {
  const base = DEFAULT_FOOTER;
  if (!data || typeof data !== 'object') return base;
  const socials = { ...base.socials };
  if (data.socials && typeof data.socials === 'object') {
    for (const name of SOCIAL_NAMES) {
      const row = data.socials[name];
      if (row && typeof row === 'object') {
        socials[name] = {
          enabled:  !!row.enabled,
          url:      row.url || '',
          icon_url: row.icon_url || '',
        };
      }
    }
  }
  return {
    email:          data.email    || base.email,
    phone:          data.phone    || base.phone,
    location:       data.location || base.location,
    tagline:        data.tagline  || base.tagline,
    socials,
    platform_links: Array.isArray(data.platform_links) && data.platform_links.length
      ? data.platform_links : base.platform_links,
    support_links:  Array.isArray(data.support_links) && data.support_links.length
      ? data.support_links : base.support_links,
  };
}

/** Public read for the footer. Never throws — returns defaults on failure. */
export async function fetchFooterConfig() {
  try {
    const res = await publicFetch(`${API_BASE}/api/site/footer`);
    if (!res.ok) return DEFAULT_FOOTER;
    return mergeFooterConfig(await res.json());
  } catch {
    return DEFAULT_FOOTER;
  }
}
