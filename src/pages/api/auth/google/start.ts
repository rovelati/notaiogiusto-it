import type { APIRoute } from 'astro';
import {
  createOAuthState,
  getGoogleOAuthConfig,
  oauthStateCookieOptions,
  safeAuthRedirect,
  type AuthAudience,
} from '../../../../lib/google-oauth';

export const prerender = false;

function parseAudience(raw: string): AuthAudience {
  if (raw === 'client') return 'client';
  if (raw === 'admin') return 'admin';
  return 'notary';
}

function fallbackFor(audience: AuthAudience) {
  if (audience === 'client') return '/area-clienti/richieste';
  if (audience === 'admin') return '/admin-test';
  return '/area-notai/scheda';
}

export const GET: APIRoute = async (context) => {
  const { clientId, redirectUri, configured } = getGoogleOAuthConfig();
  if (!configured || !clientId || !redirectUri) {
    return new Response('Google OAuth non configurato.', { status: 503 });
  }

  const audience = parseAudience(String(context.url.searchParams.get('audience') || 'notary').trim());
  const callbackPath = safeAuthRedirect(
    context.url.searchParams.get('redirect_to') || context.url.searchParams.get('next'),
    fallbackFor(audience),
  );

  let state: string;
  try {
    state = createOAuthState({ audience, callbackPath });
  } catch {
    return new Response('AUTH_SECRET non configurato.', { status: 503 });
  }

  const cookie = oauthStateCookieOptions();
  context.cookies.set(cookie.name, state, {
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    secure: cookie.secure,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'select_account');
  if (audience === 'admin') {
    authUrl.searchParams.set('login_hint', 'romolo.velati@gmail.com');
  }

  return context.redirect(authUrl.toString(), 302);
};
