import type { APIRoute } from 'astro';
import { buildLocalQuantoCostaUrls, renderUrlSet, xmlResponse } from '../lib/sitemap';

export const prerender = false;

/**
 * Locali: comuni con >= 3 studi × servizi SEO ad alto intento (clean URL, no query).
 */
export const GET: APIRoute = async () => {
  const urls = await buildLocalQuantoCostaUrls();
  return xmlResponse(renderUrlSet(urls));
};
