import type { APIRoute } from 'astro';

export const prerender = false;

/** Legacy email-token route: magic/verify links removed. */
export const GET: APIRoute = async ({ redirect }) => {
  return redirect('/area-notai/accedi?mode=login', 302);
};
