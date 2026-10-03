import type { APIRoute } from 'astro';

export const prerender = false;

/** Legacy endpoint: il claim passa da /claim/start (wizard autenticato). */
export const POST: APIRoute = async ({ redirect }) => {
  return redirect('/claim/start', 303);
};

export const GET: APIRoute = async ({ redirect }) => {
  return redirect('/claim/start', 302);
};
