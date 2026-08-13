import type { APIRoute } from 'astro';
import { clearAdminCookie } from '../../lib/admin';

export const prerender = false;

export const GET: APIRoute = async ({ cookies, redirect }) => {
  clearAdminCookie(cookies);
  return redirect('/admin/login');
};
