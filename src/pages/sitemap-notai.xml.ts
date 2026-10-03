import type { APIRoute } from 'astro';
import { buildNotaiUrls, renderUrlSet, xmlResponse } from '../lib/sitemap';

export const prerender = false;

export const GET: APIRoute = async () => {
  const urls = await buildNotaiUrls();
  return xmlResponse(renderUrlSet(urls));
};
