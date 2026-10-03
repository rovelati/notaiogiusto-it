import type { APIRoute } from 'astro';
import { isAdminEmail, setAdminSession } from '../../../../lib/admin';
import { upsertClientGoogleAccount, setClientSession } from '../../../../lib/client-auth';
import {
  exchangeGoogleCode,
  oauthStateCookieOptions,
  safeAuthRedirect,
  verifyOAuthState,
} from '../../../../lib/google-oauth';
import { upsertNotaryGoogleAccount } from '../../../../lib/notary-accounts';
import { setNotarySession } from '../../../../lib/notary-auth';

export const prerender = false;

function failUrl(audience: string | undefined) {
  if (audience === 'client') return '/area-clienti/accedi?errore=google';
  if (audience === 'admin') return '/admin/login?errore=google';
  return '/area-notai/accedi?errore=google';
}

function fallbackFor(audience: string | undefined) {
  if (audience === 'client') return '/area-clienti/richieste';
  if (audience === 'admin') return '/admin-test';
  return '/area-notai/scheda';
}

export const GET: APIRoute = async (context) => {
  const code = context.url.searchParams.get('code');
  const state = context.url.searchParams.get('state');
  const cookieName = oauthStateCookieOptions().name;
  const storedState = context.cookies.get(cookieName)?.value;
  const statePayload = verifyOAuthState(state);
  const storedPayload = verifyOAuthState(storedState);

  context.cookies.delete(cookieName, { path: '/' });

  const failLogin = failUrl(statePayload?.audience);

  if (!code || !statePayload || !storedPayload || state !== storedState) {
    return context.redirect(failLogin, 302);
  }
  if (statePayload.audience !== storedPayload.audience) {
    return context.redirect(failLogin, 302);
  }

  const callbackPath = safeAuthRedirect(statePayload.callbackPath, fallbackFor(statePayload.audience));

  try {
    const profile = await exchangeGoogleCode(code);
    if (profile.email_verified === false) {
      return context.redirect(failLogin, 302);
    }

    const email = profile.email.trim().toLowerCase();

    if (statePayload.audience === 'admin') {
      if (!isAdminEmail(email)) {
        return context.redirect('/admin/login?errore=forbidden', 302);
      }
      setAdminSession(context.cookies, email);
      return context.redirect(callbackPath, 302);
    }

    if (statePayload.audience === 'client') {
      const result = await upsertClientGoogleAccount(email, profile.sub);
      if (!result.ok) return context.redirect(failLogin, 302);
      setClientSession(context.cookies, result.email);
    } else {
      const result = await upsertNotaryGoogleAccount(email, profile.sub);
      if (!result.ok) return context.redirect(failLogin, 302);
      setNotarySession(context.cookies, result.email);
    }

    return context.redirect(callbackPath, 302);
  } catch (error) {
    console.error('Google OAuth callback failed', error);
    return context.redirect(failLogin, 302);
  }
};
