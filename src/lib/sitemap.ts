import { MACRO_CATEGORIES, SEO_SERVICE_LINKS } from './locations';
import { getAllServices, getPublishedNotarySlugs } from './notai';
import { getSiteUrl } from './site';
import {
  SITEMAP_CITY_MIN_NOTARIES,
  SITEMAP_LOCAL_MIN_NOTARIES,
  getSitemapListingCities,
  getSitemapProvinces,
} from './sitemap-locations';

/**
 * Policy sitemap NotaioGiusto.it — grafo crawl (quando si toglierà il noindex globale).
 *
 * Hub → province → città → schede notai / locali servizio×città
 * Esclusi: query `?`, paginazione, funnel, area privata.
 */

export type SitemapBucket =
  | 'static'
  | 'province'
  | 'citta'
  | 'servizi'
  | 'local'
  | 'notai';

export type SitemapUrl = {
  path: string;
  bucket: SitemapBucket;
  changefreq?: 'daily' | 'weekly' | 'monthly';
  priority?: number;
  lastmod?: string | null;
};

export const SITEMAP_POLICY = {
  cityMinNotaries: SITEMAP_CITY_MIN_NOTARIES,
  localMinNotaries: SITEMAP_LOCAL_MIN_NOTARIES,
  localServiceSlugs: SEO_SERVICE_LINKS.map((item) => item.slug),
  localServiceCount: SEO_SERVICE_LINKS.length,
} as const;

export const STATIC_PATHS = [
  '/',
  '/notai',
  '/quanto-costa',
  '/chi-siamo',
  '/contatti',
  '/area-notai',
  '/privacy-policy',
  '/cookie-policy',
  '/note-legali',
  '/credits',
] as const;

export function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function renderUrlSet(urls: SitemapUrl[]) {
  const site = getSiteUrl();
  const body = urls
    .map((item) => {
      const loc = xmlEscape(`${site}${item.path}`);
      const lastmod = item.lastmod
        ? `\n    <lastmod>${xmlEscape(item.lastmod.slice(0, 10))}</lastmod>`
        : '';
      const changefreq = item.changefreq || 'weekly';
      const priority =
        item.priority != null
          ? item.priority.toFixed(1)
          : item.path === '/'
            ? '1.0'
            : '0.6';
      return `  <url>
    <loc>${loc}</loc>${lastmod}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}

export function renderSitemapIndex(entries: Array<{ path: string; lastmod?: string }>) {
  const site = getSiteUrl();
  const body = entries
    .map((item) => {
      const loc = xmlEscape(`${site}${item.path}`);
      const lastmod = item.lastmod
        ? `\n    <lastmod>${xmlEscape(item.lastmod.slice(0, 10))}</lastmod>`
        : '';
      return `  <sitemap>
    <loc>${loc}</loc>${lastmod}
  </sitemap>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</sitemapindex>`;
}

export function xmlResponse(body: string, maxAge = 3600) {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}`,
    },
  });
}

export function jsonResponse(data: unknown, maxAge = 300) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}`,
    },
  });
}

export function buildStaticUrls(): SitemapUrl[] {
  return STATIC_PATHS.map((path) => ({
    path,
    bucket: 'static',
    changefreq: path === '/' ? 'daily' : 'weekly',
    priority: path === '/' ? 1 : path === '/notai' || path === '/quanto-costa' ? 0.9 : 0.5,
  }));
}

export async function buildProvinceUrls(): Promise<SitemapUrl[]> {
  const provinces = await getSitemapProvinces(SITEMAP_CITY_MIN_NOTARIES);
  return provinces.map((item) => ({
    path: item.path,
    bucket: 'province',
    changefreq: 'weekly',
    priority: 0.85,
  }));
}

export async function buildCittaUrls(): Promise<SitemapUrl[]> {
  const cities = await getSitemapListingCities(SITEMAP_CITY_MIN_NOTARIES);
  return cities.map((city) => ({
    path: city.path,
    bucket: 'citta',
    changefreq: 'weekly',
    priority: city.notaryCount >= 10 ? 0.8 : 0.7,
  }));
}

export async function buildServiziUrls(): Promise<SitemapUrl[]> {
  const services = await getAllServices();
  return [
    ...MACRO_CATEGORIES.map((macro) => ({
      path: `/quanto-costa/categoria/${macro.slug}`,
      bucket: 'servizi' as const,
      changefreq: 'weekly' as const,
      priority: 0.75,
    })),
    ...services.map((service) => ({
      path: `/quanto-costa/${service.slug}`,
      bucket: 'servizi' as const,
      changefreq: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}

/**
 * Locali: comuni con >= LOCAL_MIN studi × servizi SEO ad alto intento.
 * Niente query string; pagine indexabili clean URL.
 */
export async function buildLocalQuantoCostaUrls(): Promise<SitemapUrl[]> {
  const cities = await getSitemapListingCities(SITEMAP_LOCAL_MIN_NOTARIES);
  const urls: SitemapUrl[] = [];
  for (const city of cities) {
    for (const service of SEO_SERVICE_LINKS) {
      urls.push({
        path: `/quanto-costa/${city.locationSlug}/${service.slug}/notai`,
        bucket: 'local',
        changefreq: 'weekly',
        priority: city.notaryCount >= 10 ? 0.6 : 0.5,
      });
    }
  }
  return urls;
}

export async function buildNotaiUrls(): Promise<SitemapUrl[]> {
  const rows = await getPublishedNotarySlugs(6000);
  return rows.map((row) => ({
    path: `/notai/${row.source_slug}`,
    bucket: 'notai',
    changefreq: 'monthly',
    priority: 0.65,
    lastmod: row.updated_at,
  }));
}

export async function buildSitemapCardinalityReport() {
  const [province, citta, servizi, local, notai] = await Promise.all([
    buildProvinceUrls(),
    buildCittaUrls(),
    buildServiziUrls(),
    buildLocalQuantoCostaUrls(),
    buildNotaiUrls(),
  ]);
  const staticUrls = buildStaticUrls();

  const counts = {
    static: staticUrls.length,
    province: province.length,
    citta: citta.length,
    servizi_nazionali: servizi.length,
    local_quanto_costa: local.length,
    notai: notai.length,
  };
  const total =
    counts.static +
    counts.province +
    counts.citta +
    counts.servizi_nazionali +
    counts.local_quanto_costa +
    counts.notai;

  return {
    generatedAt: new Date().toISOString(),
    policy: {
      cityMinNotaries: SITEMAP_POLICY.cityMinNotaries,
      localMinNotaries: SITEMAP_POLICY.localMinNotaries,
      localServiceCount: SITEMAP_POLICY.localServiceCount,
      localServiceSlugs: [...SITEMAP_POLICY.localServiceSlugs],
      crawlGraph:
        'Hub /notai → /notai/provincia/{xx} → /notai/{xx}/{citta} → /notai/{slug} e /quanto-costa/{localita}/{servizio}/notai. Query ? e paginazione: noindex + nofollow, fuori sitemap.',
      excluded: [
        'URL con query string (?page, ?raggio, ?q, ?comune, utm, …)',
        'Paginazione listing (page>1): noindex,nofollow',
        '/preventivo, /claim, /grazie, area clienti/notai private, /api, /admin',
      ],
    },
    counts,
    totals: {
      urlsInSitemapIndex: total,
      quantoCostaSharePct: Number(
        (((1 + counts.servizi_nazionali + counts.local_quanto_costa) / total) * 100).toFixed(1),
      ),
      notaiSharePct: Number(((counts.notai / total) * 100).toFixed(1)),
      cittaSharePct: Number(((counts.citta / total) * 100).toFixed(1)),
      provinceSharePct: Number(((counts.province / total) * 100).toFixed(1)),
    },
    sitemaps: [
      { path: '/sitemap-static.xml', bucket: 'static', approx: counts.static },
      { path: '/sitemap-province.xml', bucket: 'province', approx: counts.province },
      { path: '/sitemap-citta.xml', bucket: 'citta', approx: counts.citta },
      { path: '/sitemap-servizi.xml', bucket: 'servizi', approx: counts.servizi_nazionali },
      { path: '/sitemap-local.xml', bucket: 'local', approx: counts.local_quanto_costa },
      { path: '/sitemap-notai.xml', bucket: 'notai', approx: counts.notai },
    ],
    samples: {
      static: staticUrls.slice(0, 5).map((u) => u.path),
      province: province.slice(0, 5).map((u) => u.path),
      citta: citta.slice(0, 5).map((u) => u.path),
      servizi: servizi.slice(0, 5).map((u) => u.path),
      local: local.slice(0, 5).map((u) => u.path),
      notai: notai.slice(0, 5).map((u) => u.path),
    },
  };
}
