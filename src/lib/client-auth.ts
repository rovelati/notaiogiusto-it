import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';
import { query } from './db';
import { hashPassword, verifyPassword } from './notary-auth';

const COOKIE_NAME = 'ng_client';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type ClientAccount = {
  id: string;
  email: string;
  password_hash: string | null;
  google_sub: string | null;
};

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

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function hasClientAuthSecret() {
  return Boolean(getAuthSecret());
}

export function validClientPassword(password: string) {
  return password.length >= 8;
}

export async function getClientAccountByEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized.includes('@')) return null;
  const rows = await query<ClientAccount>(
    `
    select id, email, password_hash, google_sub
    from notai.client_accounts
    where lower(email) = $1
    limit 1
    `,
    [normalized],
  );
  return rows[0] || null;
}

export async function registerClientAccount(email: string, password: string) {
  const normalized = normalizeEmail(email);
  if (!normalized.includes('@') || !normalized.includes('.')) {
    return { ok: false as const, error: 'invalid_email' };
  }
  if (!validClientPassword(password)) {
    return { ok: false as const, error: 'weak_password' };
  }
  const existing = await getClientAccountByEmail(normalized);
  if (existing) return { ok: false as const, error: 'already_registered' };

  await query(
    `
    insert into notai.client_accounts (email, password_hash, email_verified_at, last_login_at)
    values ($1, $2, now(), now())
    `,
    [normalized, hashPassword(password)],
  );
  return { ok: true as const, email: normalized };
}

export async function loginClientAccount(email: string, password: string) {
  const account = await getClientAccountByEmail(email);
  if (!account) return { ok: false as const, error: 'invalid_credentials' };
  if (account.password_hash?.startsWith('oauth_google$') && !verifyPassword(password, account.password_hash)) {
    return { ok: false as const, error: 'use_google' };
  }
  if (!verifyPassword(password, account.password_hash)) {
    return { ok: false as const, error: 'invalid_credentials' };
  }
  await query(
    `update notai.client_accounts set last_login_at = now(), updated_at = now() where id = $1::uuid`,
    [account.id],
  );
  return { ok: true as const, email: account.email };
}

export async function upsertClientGoogleAccount(email: string, googleSub: string) {
  const normalized = normalizeEmail(email);
  if (!normalized.includes('@') || !googleSub) {
    return { ok: false as const, error: 'invalid_profile' };
  }
  const existing = await getClientAccountByEmail(normalized);
  if (existing) {
    await query(
      `
      update notai.client_accounts
      set google_sub = coalesce(google_sub, $2),
          email_verified_at = coalesce(email_verified_at, now()),
          last_login_at = now(),
          updated_at = now()
      where id = $1::uuid
      `,
      [existing.id, googleSub],
    );
    return { ok: true as const, email: existing.email };
  }
  await query(
    `
    insert into notai.client_accounts (email, password_hash, google_sub, email_verified_at, last_login_at)
    values ($1, $2, $3, now(), now())
    `,
    [normalized, `oauth_google$${googleSub}`, googleSub],
  );
  return { ok: true as const, email: normalized };
}

export function setClientSession(cookies: AstroCookies, email: string) {
  const normalized = email.trim().toLowerCase();
  const exp = String(Date.now() + SESSION_TTL_MS);
  const payload = `session|${normalized}|${exp}`;
  cookies.set(COOKIE_NAME, encodeToken(['session', normalized, exp, sign(payload)]), {
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
  if (!safeEqual(sign(`session|${email}|${exp}`), sig)) return null;
  return email;
}

export function clearClientSession(cookies: AstroCookies) {
  cookies.delete(COOKIE_NAME, { path: '/' });
}
