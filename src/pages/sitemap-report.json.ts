import type { APIRoute } from 'astro';
import { buildSitemapCardinalityReport, jsonResponse } from '../lib/sitemap';

export const prerender = false;

/**
 * Report di cardinalità / policy (utile in fase SEO, noindex-friendly).
 * Esempio: /sitemap-report.json
 */
export const GET: APIRoute = async () => {
  const report = await buildSitemapCardinalityReport();
  return jsonResponse(report);
};
