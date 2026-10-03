import type { APIRoute } from 'astro';
import { buildCittaUrls, renderUrlSet, xmlResponse } from '../lib/sitemap';

export const prerender = false;

export const GET: APIRoute = async () => {
  const urls = await buildCittaUrls();
  return xmlResponse(renderUrlSet(urls));
};
