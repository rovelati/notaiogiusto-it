import type { APIRoute } from 'astro';
import { query } from '../../../../../lib/db';

export const prerender = false;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async ({ params }) => {
  const notaryId = String(params.id || '');
  const index = Number(params.index);
  if (!UUID_RE.test(notaryId) || !Number.isInteger(index) || index < 0 || index > 4) {
    return new Response('Foto non valida', { status: 400 });
  }

  const apiKey = String(
    import.meta.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '',
  ).trim();
  if (!apiKey) return new Response('Google Places non configurato', { status: 503 });

  const rows = await query<{ photo: { reference?: string } | null }>(
    `
    select google_photos -> $2::int as photo
    from notai.notaries
    where id = $1::uuid and status = 'published'
    limit 1
    `,
    [notaryId, index],
  );
  const reference = rows[0]?.photo?.reference;
  if (!reference) return new Response('Foto non disponibile', { status: 404 });

  const endpoint = new URL('https://maps.googleapis.com/maps/api/place/photo');
  endpoint.searchParams.set('maxwidth', '1200');
  endpoint.searchParams.set('photoreference', reference);
  endpoint.searchParams.set('key', apiKey);

  try {
    const response = await fetch(endpoint, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok || !response.body) {
      return new Response('Foto non disponibile', { status: 502 });
    }
    return new Response(response.body, {
      headers: {
        'Content-Type': response.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=21600, stale-while-revalidate=86400',
        'X-Robots-Tag': 'noindex, noarchive',
      },
    });
  } catch {
    return new Response('Foto non disponibile', { status: 502 });
  }
};
