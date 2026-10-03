export type GeoPoint = {
  lat: number;
  lng: number;
};

export const SEARCH_RADIUS_STEPS = [10, 20, 30, 50, 100] as const;

export function asCoord(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return null;
  const raw = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(raw) ? raw : null;
}

export function hasCoords(item: { lat?: number | null; lng?: number | null }): item is { lat: number; lng: number } {
  const lat = asCoord(item.lat);
  const lng = asCoord(item.lng);
  if (lat == null || lng == null) return false;
  // Null Island / placeholder geocodes
  if (lat === 0 && lng === 0) return false;
  return true;
}

/** Bounding box ampia sull’Italia (evita pin in oceano/Africa da geocode sporchi). */
export function isPlausibleItalianPoint(point: GeoPoint): boolean {
  return point.lat >= 35 && point.lat <= 48 && point.lng >= 6 && point.lng <= 19.5;
}

export function distanceKm(a: GeoPoint, b: GeoPoint) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earth = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function averageCenter(points: GeoPoint[]): GeoPoint | null {
  if (!points.length) return null;
  const sum = points.reduce(
    (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

export function openStreetMapEmbedUrl(lat: number, lng: number, zoom = 13) {
  const delta = zoom >= 13 ? 0.018 : 0.08;
  const west = lng - delta;
  const south = lat - delta;
  const east = lng + delta;
  const north = lat + delta;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${west}%2C${south}%2C${east}%2C${north}&layer=mapnik&marker=${lat}%2C${lng}`;
}

export function googleDirectionsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export function formatDistanceKm(km: number | null | undefined) {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.max(0.1, Math.round(km * 10) / 10).toString().replace('.', ',')} km`;
  if (km < 10) return `${(Math.round(km * 10) / 10).toString().replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}

export function parseRadiusKm(raw: string | null | undefined, fallback: number | null = null) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  if ((SEARCH_RADIUS_STEPS as readonly number[]).includes(value)) return value;
  return fallback;
}

/** Messaggio espansione per prossimità (stile veterinari.org). */
export function locationScopeNote({
  locationLabel,
  scope,
  exactCityCount,
  radiusKm,
}: {
  locationLabel: string;
  scope?: string | null;
  exactCityCount?: number;
  radiusKm?: number | null;
}) {
  const place = (locationLabel || '').trim();
  if (!place) return '';
  if (scope === 'distretto') {
    return `Pochi risultati nel comune: mostriamo anche studi del distretto notarile.`;
  }
  if (scope === 'raggio' && radiusKm != null) {
    if ((exactCityCount || 0) <= 0) {
      return `Nessun notaio a ${place}: abbiamo esteso la ricerca a ${radiusKm} km.`;
    }
    return `Pochi studi a ${place}: ricerca estesa a ${radiusKm} km.`;
  }
  return '';
}

const geocodeCache = new Map<string, GeoPoint | null>();

/** Geocoding comune IT via Nominatim (cache in-process). */
export async function geocodeItalianComune(comune: string): Promise<GeoPoint | null> {
  const key = comune.replace(/-/g, ' ').trim().toLowerCase();
  if (!key) return null;
  if (geocodeCache.has(key)) return geocodeCache.get(key) || null;

  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', `${comune.replace(/-/g, ' ').trim()}, Italia`);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'it');
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'NotaioGiusto.it/0.1 (local-search; contact=redazione@notaiogiusto.it)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      geocodeCache.set(key, null);
      return null;
    }
    const rows = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    const lat = asCoord(rows?.[0]?.lat);
    const lng = asCoord(rows?.[0]?.lon);
    const point = lat != null && lng != null ? { lat, lng } : null;
    geocodeCache.set(key, point);
    return point;
  } catch {
    geocodeCache.set(key, null);
    return null;
  }
}
