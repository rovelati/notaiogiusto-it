import type { APIRoute } from 'astro';

export const prerender = false;

/** Crawl pubblico: esclude aree private, funnel e URL non canonici. */
export const GET: APIRoute = async () => {
  const body = [
    'User-agent: *',
    'Disallow: /admin/',
    'Disallow: /admin-test',
    'Disallow: /adminconsole',
    'Disallow: /api/',
    'Disallow: /accedi',
    'Disallow: /area-clienti',
    'Disallow: /area-notai/accedi',
    'Disallow: /area-notai/scheda',
    'Disallow: /area-notai/esci',
    'Disallow: /claim',
    'Disallow: /preventivo',
    'Disallow: /grazie',
    'Disallow: /sitemap-report.json',
    '# Permetti risorse statiche e asset versionati con query string per il rendering',
    'Allow: /*.css*',
    'Allow: /*.js*',
    'Allow: /*.png*',
    'Allow: /*.jpg*',
    'Allow: /*.jpeg*',
    'Allow: /*.webp*',
    'Allow: /*.svg*',
    'Allow: /*.ico*',
    'Allow: /*.woff*',
    'Allow: /*.woff2*',
    '# URL parametrizzati e paginazione restano fuori dal crawl',
    'Disallow: /*?*',
    'Allow: /',
    '',
    'Sitemap: https://www.notaiogiusto.it/sitemap.xml',
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  });
};
