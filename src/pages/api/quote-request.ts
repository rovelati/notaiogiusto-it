import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { query } from '../../lib/db';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const email = String(form.get('email') || '').trim().toLowerCase();
  const serviceSlug = String(form.get('service_slug') || '').trim();
  const serviceName = String(form.get('service_name') || form.get('service_slug') || 'Richiesta notarile').trim();
  const comune = String(form.get('comune') || '').trim();
  const name = String(form.get('name') || '').trim();
  const phone = String(form.get('phone') || '').trim();
  const message = String(form.get('message') || '').trim();
  const targetNotaryId = String(form.get('target_notary_id') || '').trim();

  if (!email.includes('@')) {
    return new Response('Email non valida', { status: 400 });
  }

  const hash = createHash('sha256')
    .update([email, serviceSlug, comune.toLowerCase(), message.slice(0, 120).toLowerCase()].join('|'))
    .digest('hex');

  const serviceRows = serviceSlug
    ? await query<{ id: string; price_avg_cents: number | null }>(
        `
        select st.id, b.price_avg_cents
        from notai.services_taxonomy st
        left join lateral (
          select price_avg_cents
          from notai.service_price_benchmarks
          where service_id = st.id and location_scope = 'national'
          order by confidence desc nulls last
          limit 1
        ) b on true
        where st.slug = $1
        limit 1
        `,
        [serviceSlug],
      )
    : [];
  const service = serviceRows[0];

  const rows = await query<{ id: string }>(
    `
    insert into notai.quote_requests (
      service_id, service_slug, service_name, comune, requester_email, requester_name,
      requester_phone, requester_message, average_price_cents, source_url, status,
      idempotency_hash, case_details
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,$12::jsonb)
    on conflict (idempotency_hash) where idempotency_hash is not null
    do update set updated_at = now()
    returning id
    `,
    [
      service?.id || null,
      serviceSlug || null,
      serviceName,
      comune || null,
      email,
      name || null,
      phone || null,
      message || null,
      service?.price_avg_cents || null,
      request.headers.get('referer') || null,
      hash,
      JSON.stringify({ target_notary_id: targetNotaryId || null, mvp: true }),
    ],
  );

  if (targetNotaryId && rows[0]?.id) {
    await query(
      `
      insert into notai.quote_request_recipients (quote_request_id, notary_id, match_type, status)
      values ($1, $2, 'selected_by_user', 'pending')
      on conflict do nothing
      `,
      [rows[0].id, targetNotaryId],
    );
  }

  return redirect('/grazie', 303);
};
