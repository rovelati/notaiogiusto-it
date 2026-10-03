import type { APIRoute } from 'astro';
import { asCoord, isPlausibleItalianPoint } from '../../../lib/geo';

export const prerender = false;

const cityCache = new Map<string, string>();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}

export const GET: APIRoute = async ({ url }) => {
  const lat = asCoord(url.searchParams.get('lat'));
  const lng = asCoord(url.searchParams.get('lng'));
  if (lat == null || lng == null || !isPlausibleItalianPoint({ lat, lng })) {
    return json({ error: 'Coordinate non valide' }, 400);
  }

  // Circa 1 km: precisione sufficiente per proporre il comune senza conservare
  // la posizione puntuale dell'utente nella cache in-process.
  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = cityCache.get(cacheKey);
  if (cached) return json({ comune: cached });

  try {
    const endpoint = new URL('https://nominatim.openstreetmap.org/reverse');
    endpoint.searchParams.set('format', 'jsonv2');
    endpoint.searchParams.set('lat', String(lat));
    endpoint.searchParams.set('lon', String(lng));
    endpoint.searchParams.set('zoom', '10');
    endpoint.searchParams.set('addressdetails', '1');
    endpoint.searchParams.set('accept-language', 'it');

    const response = await fetch(endpoint, {
      headers: {
        'User-Agent': 'NotaioGiusto.it/0.1 (reverse-geocoding; contact=redazione@notaiogiusto.it)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return json({ comune: '' });

    const data = (await response.json()) as {
      address?: Record<string, string | undefined>;
    };
    const address = data.address || {};
    const comune = String(
      address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.hamlet ||
      '',
    ).trim();

    if (comune) cityCache.set(cacheKey, comune);
    return json({ comune });
  } catch {
    return json({ comune: '' });
  }
};
