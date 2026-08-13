import type { APIRoute } from 'astro';
import { absoluteUrl } from '../lib/site';

export const prerender = false;

export const GET: APIRoute = async () => {
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /admin/',
    'Disallow: /claim',
    'Disallow: /preventivo',
    'Disallow: /api/',
    'Disallow: /grazie',
    `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
