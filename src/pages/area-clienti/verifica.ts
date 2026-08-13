import type { APIRoute } from 'astro';
import { setClientSession, verifyMagicLoginToken } from '../../lib/client-auth';

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const token = String(url.searchParams.get('token') || '').trim();
  const email = token ? verifyMagicLoginToken(token) : null;
  if (!email) {
    return redirect('/area-clienti/accedi?errore=link');
  }
  setClientSession(cookies, email);
  return redirect('/area-clienti/richieste');
};
