import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getSiteUrl } from './site';

export type AuthAudience = 'notary' | 'client' | 'admin';

const STATE_COOKIE = 'ng_oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000;

function getAuthSecret() {
  return String(
    import.meta.env.AUTH_SECRET ||
      process.env.AUTH_SECRET ||
      import.meta.env.ADMIN_TOKEN ||
      process.env.ADMIN_TOKEN ||
      '',
  ).trim();
}

export function getGoogleOAuthConfig() {
  const clientId = String(
    import.meta.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || '',
  ).trim();
  const clientSecret = String(
    import.meta.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
  ).trim();
  const redirectUri = String(
    import.meta.env.GOOGLE_OAUTH_REDIRECT_URI ||
      process.env.GOOGLE_OAUTH_REDIRECT_URI ||
      `${getSiteUrl()}/api/auth/google/callback`,
  ).trim();
  return { clientId, clientSecret, redirectUri, configured: Boolean(clientId && clientSecret && redirectUri) };
}

export function isGoogleOAuthConfigured() {
  return getGoogleOAuthConfig().configured;
}

function signState(encoded: string) {
  const secret = getAuthSecret();
  if (!secret) throw new Error('AUTH_SECRET non configurato');
  return createHmac('sha256', secret).update(encoded).digest('base64url');
}

export function createOAuthState(payload: { audience: AuthAudience; callbackPath: string }) {
  const body = {
    audience: payload.audience,
    callbackPath: payload.callbackPath,
    nonce: randomBytes(16).toString('base64url'),
    createdAt: Date.now(),
  };
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${encoded}.${signState(encoded)}`;
}

export function verifyOAuthState(token: string | null | undefined) {
  if (!token || !token.includes('.')) return null;
  const [encoded, signature] = token.split('.');
  const expected = signState(encoded);
  const left = Buffer.from(signature || '');
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      audience?: AuthAudience;
      callbackPath?: string;
      createdAt?: number;
    };
    if (!payload.audience || !payload.callbackPath || !payload.createdAt) return null;
    if (Date.now() - Number(payload.createdAt) > STATE_TTL_MS) return null;
    if (payload.audience !== 'notary' && payload.audience !== 'client' && payload.audience !== 'admin') return null;
    return {
      audience: payload.audience,
      callbackPath: payload.callbackPath,
    };
  } catch {
    return null;
  }
}

export function oauthStateCookieOptions() {
  const siteUrl = String(import.meta.env.SITE_URL || process.env.SITE_URL || '');
  return {
    name: STATE_COOKIE,
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: siteUrl.startsWith('https://'),
    path: '/',
    maxAge: Math.floor(STATE_TTL_MS / 1000),
  };
}

export function safeAuthRedirect(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (value.startsWith('/area-notai/accedi') || value.startsWith('/area-clienti/accedi') || value.startsWith('/admin/login')) return fallback;
  if (value.startsWith('/api/auth/google')) return fallback;
  return value;
}

export type GoogleProfile = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
};

export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth non configurato');
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tokenPayload = (await tokenResponse.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    throw new Error(tokenPayload.error_description || tokenPayload.error || 'Scambio token Google fallito');
  }

  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
  });
  const profile = (await profileResponse.json().catch(() => ({}))) as Partial<GoogleProfile>;
  if (!profileResponse.ok || !profile.email || !profile.sub) {
    throw new Error('Profilo Google non disponibile');
  }
  return profile as GoogleProfile;
}
