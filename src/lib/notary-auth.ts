import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';

const COOKIE_NAME = 'ng_notary';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

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
    return Buffer.from(token, 'base64url').toString('utf8').split('|');
  } catch {
    return [];
  }
}

function cookieSecure() {
  const siteUrl = String(import.meta.env.SITE_URL || process.env.SITE_URL || '');
  return siteUrl.startsWith('https://');
}

export function hasNotaryAuthSecret() {
  return Boolean(getAuthSecret());
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url');
  const hash = pbkdf2Sync(password, salt, 120_000, 32, 'sha256').toString('base64url');
  return `pbkdf2_sha256$120000$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null | undefined) {
  if (!stored || stored.startsWith('oauth_google$')) return false;
  const [algo, iterationsRaw, salt, hash] = stored.split('$');
  if (algo !== 'pbkdf2_sha256' || !iterationsRaw || !salt || !hash) return false;
  const computed = pbkdf2Sync(password, salt, Number(iterationsRaw), 32, 'sha256').toString('base64url');
  const left = Buffer.from(computed);
  const right = Buffer.from(hash);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function setNotarySession(cookies: AstroCookies, email: string) {
  const normalized = email.trim().toLowerCase();
  const exp = String(Date.now() + SESSION_TTL_MS);
  const payload = `nsession|${normalized}|${exp}`;
  cookies.set(COOKIE_NAME, encodeToken(['nsession', normalized, exp, sign(payload)]), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function getNotaryEmail(cookies: AstroCookies) {
  const value = cookies.get(COOKIE_NAME)?.value;
  if (!value) return null;
  const [kind, email, exp, sig] = decodeToken(value);
  if (kind !== 'nsession' || !email || !exp || !sig) return null;
  if (Number(exp) < Date.now()) return null;
  if (!safeEqual(sign(`nsession|${email}|${exp}`), sig)) return null;
  return email;
}

export function clearNotarySession(cookies: AstroCookies) {
  cookies.delete(COOKIE_NAME, { path: '/' });
}
