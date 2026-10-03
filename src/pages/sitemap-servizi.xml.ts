import type { APIRoute } from 'astro';
import { buildServiziUrls, renderUrlSet, xmlResponse } from '../lib/sitemap';

export const prerender = false;

/** Hub + categorie macro + pagine nazionali `/quanto-costa/{servizio}` (senza locali). */
export const GET: APIRoute = async () => {
  const urls = await buildServiziUrls();
  return xmlResponse(renderUrlSet(urls));
};
