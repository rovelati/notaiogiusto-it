import type { APIRoute } from 'astro';

export const prerender = false;

/** Legacy magic-link route removed. */
export const GET: APIRoute = async ({ redirect }) => {
  return redirect('/area-clienti/accedi?errore=link', 302);
};
