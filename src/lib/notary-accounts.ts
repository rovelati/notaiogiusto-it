import { query } from './db';
import { hashPassword, verifyPassword } from './notary-auth';

export type NotaryAccount = {
  id: string;
  email: string;
  password_hash: string | null;
  google_sub: string | null;
  email_verified_at: string | null;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validNotaryPassword(password: string) {
  return password.length >= 8;
}

export async function getNotaryAccountByEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized.includes('@')) return null;
  const rows = await query<NotaryAccount>(
    `
    select id, email, password_hash, google_sub, email_verified_at::text
    from notai.notary_accounts
    where lower(email) = $1
    limit 1
    `,
    [normalized],
  );
  return rows[0] || null;
}

export async function registerNotaryAccount(email: string, password: string) {
  const normalized = normalizeEmail(email);
  if (!normalized.includes('@') || !normalized.includes('.')) {
    return { ok: false as const, error: 'invalid_email' };
  }
  if (!validNotaryPassword(password)) {
    return { ok: false as const, error: 'weak_password' };
  }

  const existing = await getNotaryAccountByEmail(normalized);
  if (existing) {
    return { ok: false as const, error: 'already_registered' };
  }

  const passwordHash = hashPassword(password);
  await query(
    `
    insert into notai.notary_accounts (email, password_hash, email_verified_at, last_login_at)
    values ($1, $2, now(), now())
    `,
    [normalized, passwordHash],
  );

  return { ok: true as const, email: normalized };
}

export async function loginNotaryAccount(email: string, password: string) {
  const account = await getNotaryAccountByEmail(email);
  if (!account) {
    return { ok: false as const, error: 'invalid_credentials' };
  }
  if (account.password_hash?.startsWith('oauth_google$') && !verifyPassword(password, account.password_hash)) {
    return { ok: false as const, error: 'use_google' };
  }
  if (!verifyPassword(password, account.password_hash)) {
    return { ok: false as const, error: 'invalid_credentials' };
  }
  await query(
    `update notai.notary_accounts set last_login_at = now(), updated_at = now() where id = $1::uuid`,
    [account.id],
  );
  return { ok: true as const, email: account.email };
}

/** Upsert account after Google OAuth (no email token). */
export async function upsertNotaryGoogleAccount(email: string, googleSub: string) {
  const normalized = normalizeEmail(email);
  if (!normalized.includes('@') || !googleSub) {
    return { ok: false as const, error: 'invalid_profile' };
  }

  const existing = await getNotaryAccountByEmail(normalized);
  if (existing) {
    await query(
      `
      update notai.notary_accounts
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
    insert into notai.notary_accounts (email, password_hash, google_sub, email_verified_at, last_login_at)
    values ($1, $2, $3, now(), now())
    `,
    [normalized, `oauth_google$${googleSub}`, googleSub],
  );
  return { ok: true as const, email: normalized };
}
