import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';

const COOKIE_NAME = 'ng_admin';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const DEFAULT_ADMIN_EMAILS = ['romolo.velati@gmail.com'];

function getAuthSecret() {
  return String(
    import.meta.env.AUTH_SECRET ||
      process.env.AUTH_SECRET ||
      import.meta.env.ADMIN_TOKEN ||
      process.env.ADMIN_TOKEN ||
      '',
  ).trim();
}

function cookieSecure() {
  const siteUrl = String(import.meta.env.SITE_URL || process.env.SITE_URL || '');
  return siteUrl.startsWith('https://');
}

function sign(payload: string) {
  const secret = getAuthSecret();
  if (!secret) throw new Error('AUTH_SECRET o ADMIN_TOKEN non configurato');
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function encodeToken(parts: string[]) {
  return Buffer.from(parts.join('|'), 'utf8').toString('base64url');
}

function decodeToken(token: string) {
  try {
    return Buffer.from(token, 'base64url').toString('utf8').split('|');
  } catch {
    return [];
  }
}

/** Email admin ammesse (default: romolo.velati@gmail.com). Override con ADMIN_EMAILS csv. */
export function getAdminEmails() {
  const raw = String(import.meta.env.ADMIN_EMAILS || process.env.ADMIN_EMAILS || '').trim();
  const list = raw
    ? raw.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_ADMIN_EMAILS;
  return [...new Set(list)];
}

export function isAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  return getAdminEmails().includes(email.trim().toLowerCase());
}

/** Password di emergenza admin (stesso ADMIN_TOKEN legacy). */
export function getAdminPassword() {
  return String(import.meta.env.ADMIN_TOKEN || process.env.ADMIN_TOKEN || '').trim();
}

export function hasAdminAuthSecret() {
  return Boolean(getAuthSecret());
}

export function setAdminSession(cookies: AstroCookies, email: string) {
  const normalized = email.trim().toLowerCase();
  if (!isAdminEmail(normalized)) {
    throw new Error('Email non autorizzata come admin');
  }
  const exp = String(Date.now() + SESSION_TTL_MS);
  const payload = `asession|${normalized}|${exp}`;
  cookies.set(COOKIE_NAME, encodeToken(['asession', normalized, exp, sign(payload)]), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function getAdminEmail(cookies: AstroCookies) {
  const value = cookies.get(COOKIE_NAME)?.value;
  if (!value) return null;

  // Legacy: cookie = raw ADMIN_TOKEN
  const legacy = getAdminPassword();
  if (legacy && value === legacy) {
    return getAdminEmails()[0] || null;
  }

  const [kind, email, exp, sig] = decodeToken(value);
  if (kind !== 'asession' || !email || !exp || !sig) return null;
  if (Number(exp) < Date.now()) return null;
  if (!safeEqual(sign(`asession|${email}|${exp}`), sig)) return null;
  if (!isAdminEmail(email)) return null;
  return email;
}

export function isAdminAuthenticated(cookies: AstroCookies) {
  return Boolean(getAdminEmail(cookies));
}

export function clearAdminCookie(cookies: AstroCookies) {
  cookies.delete(COOKIE_NAME, { path: '/' });
}

/** @deprecated use setAdminSession */
export function setAdminCookie(cookies: AstroCookies, _token: string) {
  const email = getAdminEmails()[0];
  if (email) setAdminSession(cookies, email);
}

/** @deprecated */
export function getAdminToken() {
  return getAdminPassword() || getAuthSecret();
}
