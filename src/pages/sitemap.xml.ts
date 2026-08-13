import type { APIRoute } from 'astro';
import { getAllServices, getPublishedNotarySlugs } from '../lib/notai';
import { absoluteUrl } from '../lib/site';

export const prerender = false;

function xmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export const GET: APIRoute = async () => {
  const [services, notaries] = await Promise.all([getAllServices(), getPublishedNotarySlugs(5000)]);
  const staticPaths = ['/', '/quanto-costa', '/notai', '/area-notai'];
  const urls = [
    ...staticPaths.map((path) => ({ loc: absoluteUrl(path), changefreq: 'weekly', priority: '0.9' })),
    ...services.map((service) => ({
      loc: absoluteUrl(`/quanto-costa/${service.slug}`),
      changefreq: 'weekly',
      priority: '0.8',
    })),
    ...notaries.map((notary) => ({
      loc: absoluteUrl(`/notai/${notary.source_slug}`),
      changefreq: 'monthly',
      priority: '0.6',
      lastmod: notary.updated_at || undefined,
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (item) => `  <url>
    <loc>${xmlEscape(item.loc)}</loc>
    ${item.lastmod ? `<lastmod>${xmlEscape(item.lastmod.slice(0, 10))}</lastmod>` : ''}
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=1800',
    },
  });
};
