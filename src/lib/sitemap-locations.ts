import { query } from './db';
import { slugify, titleCase } from './format';
import {
  CAPOLUOGHI,
  SEO_EXTRA_CITIES,
  SEO_LISTING_CITIES,
  canonicalNotaiCityPath,
  findCapoluogo,
  toLocationSlug,
} from './locations';

/** Soglie crawl: listing città vs locali servizio×città. */
export const SITEMAP_CITY_MIN_NOTARIES = 2;
export const SITEMAP_LOCAL_MIN_NOTARIES = 3;

export type ListingCity = {
  name: string;
  province: string;
  notaryCount: number;
  path: string;
  locationSlug: string;
};

export type ListingProvince = {
  code: string;
  name: string;
  path: string;
  cityCount: number;
  notaryCount: number;
};

function provinceLabel(code: string) {
  const cap = CAPOLUOGHI.find((item) => item.province === code.toUpperCase());
  return cap?.name || code.toUpperCase();
}

/** Risolve sigla provincia da comune noto o dal distretto notarile. */
export function inferProvinceCode(comune?: string | null, district?: string | null): string | null {
  const city = String(comune || '').trim();
  if (city) {
    const cap = findCapoluogo(city);
    if (cap) return cap.province;
    const extra = SEO_EXTRA_CITIES.find((item) => slugify(item.name) === slugify(city));
    if (extra) return extra.province;
    const listed = SEO_LISTING_CITIES.find((item) => slugify(item.name) === slugify(city));
    if (listed) return listed.province;
  }

  const blob = slugify(`${city} ${district || ''}`);
  if (!blob) return null;

  let best: (typeof CAPOLUOGHI)[number] | null = null;
  for (const cap of CAPOLUOGHI) {
    const needle = slugify(cap.name);
    if (!needle || needle.length < 4) continue;
    if (blob.includes(needle) && (!best || needle.length > slugify(best.name).length)) {
      best = cap;
    }
  }
  return best?.province || null;
}

export function canonicalNotaiProvincePath(provinceCode: string) {
  const code = String(provinceCode || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .slice(0, 2);
  return code ? `/notai/provincia/${code}` : '/notai';
}

type CityRow = {
  comune: string;
  district: string | null;
  notary_count: number;
};

async function loadCityAggregates(minNotaries: number) {
  return query<CityRow>(
    `
    select
      min(comune) as comune,
      max(nullif(district, '')) as district,
      count(*)::int as notary_count
    from notai.notaries
    where status = 'published'
      and coalesce(comune, '') <> ''
    group by lower(comune)
    having count(*) >= $1
    order by count(*) desc, min(comune) asc
    `,
    [minNotaries],
  );
}

function toListingCity(row: CityRow): ListingCity | null {
  const name = titleCase(row.comune);
  const province = inferProvinceCode(row.comune, row.district);
  if (!province) return null;
  const path = canonicalNotaiCityPath(name, province);
  if (!path.startsWith('/notai/') || path.includes('?')) return null;
  return {
    name,
    province,
    notaryCount: row.notary_count,
    path,
    locationSlug: toLocationSlug(name, province),
  };
}

/** Città indexabili: comuni con abbastanza studi e provincia risolvibile (niente URL `?`). */
export async function getSitemapListingCities(minNotaries = SITEMAP_CITY_MIN_NOTARIES) {
  const rows = await loadCityAggregates(minNotaries);
  const byPath = new Map<string, ListingCity>();

  for (const city of SEO_LISTING_CITIES) {
    const path = canonicalNotaiCityPath(city.name, city.province);
    byPath.set(path, {
      name: city.name,
      province: city.province,
      notaryCount: 0,
      path,
      locationSlug: toLocationSlug(city.name, city.province),
    });
  }

  for (const row of rows) {
    const city = toListingCity(row);
    if (!city) continue;
    const prev = byPath.get(city.path);
    if (!prev || city.notaryCount > prev.notaryCount) {
      byPath.set(city.path, city);
    } else {
      byPath.set(city.path, { ...prev, notaryCount: Math.max(prev.notaryCount, city.notaryCount) });
    }
  }

  return [...byPath.values()].sort(
    (a, b) => b.notaryCount - a.notaryCount || a.name.localeCompare(b.name, 'it'),
  );
}

export async function getSitemapProvinces(minNotaries = SITEMAP_CITY_MIN_NOTARIES) {
  const cities = await getSitemapListingCities(minNotaries);
  const map = new Map<string, ListingProvince>();
  for (const city of cities) {
    const code = city.province.toUpperCase();
    const prev = map.get(code);
    if (!prev) {
      map.set(code, {
        code,
        name: provinceLabel(code),
        path: canonicalNotaiProvincePath(code),
        cityCount: 1,
        notaryCount: city.notaryCount,
      });
    } else {
      map.set(code, {
        ...prev,
        cityCount: prev.cityCount + 1,
        notaryCount: prev.notaryCount + city.notaryCount,
      });
    }
  }
  return [...map.values()].sort(
    (a, b) => b.notaryCount - a.notaryCount || a.name.localeCompare(b.name, 'it'),
  );
}

export async function getListingCitiesForProvince(
  provinceCode: string,
  minNotaries = SITEMAP_CITY_MIN_NOTARIES,
) {
  const code = provinceCode.trim().toUpperCase();
  const cities = await getSitemapListingCities(minNotaries);
  return cities.filter((city) => city.province.toUpperCase() === code);
}

export async function searchNotariesInProvince(provinceCode: string, limit = 36, page = 1) {
  const cities = await getListingCitiesForProvince(provinceCode);
  const names = cities.map((city) => city.name.toLowerCase());
  if (!names.length) {
    return {
      notaries: [] as Array<{
        id: string;
        source_slug: string;
        full_name: string;
        comune: string | null;
        address: string | null;
        phone: string | null;
        lat: number | null;
        lng: number | null;
        is_official_notariato: boolean;
      }>,
      total: 0,
      totalPages: 1,
      page: 1,
      cities,
    };
  }

  const rows = await query<{
    id: string;
    source_slug: string;
    full_name: string;
    comune: string | null;
    address: string | null;
    phone: string | null;
    lat: number | null;
    lng: number | null;
    is_official_notariato: boolean;
  }>(
    `
    select id, source_slug, full_name, comune, address, phone, lat, lng,
           is_official_notariato
    from notai.notaries
    where status = 'published'
      and lower(coalesce(comune, '')) = any($1::text[])
    order by full_name asc
    `,
    [names],
  );

  const pageSize = Math.max(1, limit);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * pageSize;
  return {
    notaries: rows.slice(offset, offset + pageSize),
    total,
    totalPages,
    page: safePage,
    cities,
  };
}
