import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';

const COOKIE_NAME = 'ng_client';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const MAGIC_TTL_MS = 1000 * 60 * 30;

function getAuthSecret() {
  return String(
    import.meta.env.AUTH_SECRET ||
      process.env.AUTH_SECRET ||
      import.meta.env.ADMIN_TOKEN ||
      process.env.ADMIN_TOKEN ||
      '',
  ).trim();
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
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    return raw.split('|');
  } catch {
    return [];
  }
}

function cookieSecure() {
  const siteUrl = String(import.meta.env.SITE_URL || process.env.SITE_URL || '');
  return siteUrl.startsWith('https://');
}

export function hasClientAuthSecret() {
  return Boolean(getAuthSecret());
}

export function createMagicLoginToken(email: string) {
  const normalized = email.trim().toLowerCase();
  const exp = String(Date.now() + MAGIC_TTL_MS);
  const payload = `magic|${normalized}|${exp}`;
  const sig = sign(payload);
  return encodeToken(['magic', normalized, exp, sig]);
}

export function verifyMagicLoginToken(token: string) {
  const [kind, email, exp, sig] = decodeToken(token);
  if (kind !== 'magic' || !email || !exp || !sig) return null;
  if (Number(exp) < Date.now()) return null;
  const payload = `magic|${email}|${exp}`;
  if (!safeEqual(sign(payload), sig)) return null;
  return email;
}

export function setClientSession(cookies: AstroCookies, email: string) {
  const normalized = email.trim().toLowerCase();
  const exp = String(Date.now() + SESSION_TTL_MS);
  const payload = `session|${normalized}|${exp}`;
  const sig = sign(payload);
  const value = encodeToken(['session', normalized, exp, sig]);
  cookies.set(COOKIE_NAME, value, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function getClientEmail(cookies: AstroCookies) {
  const value = cookies.get(COOKIE_NAME)?.value;
  if (!value) return null;
  const [kind, email, exp, sig] = decodeToken(value);
  if (kind !== 'session' || !email || !exp || !sig) return null;
  if (Number(exp) < Date.now()) return null;
  const payload = `session|${email}|${exp}`;
  if (!safeEqual(sign(payload), sig)) return null;
  return email;
}

export function clearClientSession(cookies: AstroCookies) {
  cookies.delete(COOKIE_NAME, { path: '/' });
}

export function isMailConfigured() {
  return Boolean(
    (import.meta.env.MAILGUN_API_KEY || process.env.MAILGUN_API_KEY) &&
      (import.meta.env.MAILGUN_DOMAIN || process.env.MAILGUN_DOMAIN),
  );
}
