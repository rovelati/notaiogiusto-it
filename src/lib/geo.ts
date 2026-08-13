export type GeoPoint = {
  lat: number;
  lng: number;
};

export function asCoord(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function hasCoords(item: { lat?: number | null; lng?: number | null }): item is { lat: number; lng: number } {
  return asCoord(item.lat) !== null && asCoord(item.lng) !== null;
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
