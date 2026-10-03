import type { APIRoute } from 'astro';
import { renderSitemapIndex, xmlResponse } from '../lib/sitemap';

export const prerender = false;

/** Indice sitemap: grafo hub → province → città → locali / schede. */
export const GET: APIRoute = async () => {
  const today = new Date().toISOString().slice(0, 10);
  const body = renderSitemapIndex([
    { path: '/sitemap-static.xml', lastmod: today },
    { path: '/sitemap-province.xml', lastmod: today },
    { path: '/sitemap-citta.xml', lastmod: today },
    { path: '/sitemap-servizi.xml', lastmod: today },
    { path: '/sitemap-local.xml', lastmod: today },
    { path: '/sitemap-notai.xml', lastmod: today },
  ]);
  return xmlResponse(body);
};
