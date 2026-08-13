import type { AstroCookies } from 'astro';

const COOKIE_NAME = 'ng_admin';

export function getAdminToken() {
  return String(import.meta.env.ADMIN_TOKEN || process.env.ADMIN_TOKEN || '').trim();
}

export function isAdminAuthenticated(cookies: AstroCookies) {
  const token = getAdminToken();
  if (!token) return false;
  return cookies.get(COOKIE_NAME)?.value === token;
}

export function setAdminCookie(cookies: AstroCookies, token: string) {
  const siteUrl = String(import.meta.env.SITE_URL || process.env.SITE_URL || '');
  cookies.set(COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: siteUrl.startsWith('https://'),
    maxAge: 60 * 60 * 12,
  });
}

export function clearAdminCookie(cookies: AstroCookies) {
  cookies.delete(COOKIE_NAME, { path: '/' });
}
