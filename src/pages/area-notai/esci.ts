import type { APIRoute } from 'astro';
import { clearNotarySession } from '../../lib/notary-auth';

export const prerender = false;

export const GET: APIRoute = async ({ cookies, redirect }) => {
  clearNotarySession(cookies);
  return redirect('/area-notai');
};
