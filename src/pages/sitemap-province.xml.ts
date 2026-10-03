import type { APIRoute } from 'astro';
import { buildProvinceUrls, renderUrlSet, xmlResponse } from '../lib/sitemap';

export const prerender = false;

export const GET: APIRoute = async () => {
  const urls = await buildProvinceUrls();
  return xmlResponse(renderUrlSet(urls));
};
