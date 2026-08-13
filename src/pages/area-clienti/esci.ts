import type { APIRoute } from 'astro';
import { clearClientSession } from '../../lib/client-auth';

export const prerender = false;

export const GET: APIRoute = async ({ cookies, redirect }) => {
  clearClientSession(cookies);
  return redirect('/area-clienti');
};
