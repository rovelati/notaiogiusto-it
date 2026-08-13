import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { query } from '../../lib/db';
import {
  getPropertiesByIdsForEmail,
  linkPropertiesToQuoteRequest,
} from '../../lib/properties';

export const prerender = false;

function collectNotaryIds(form: FormData) {
  const fromMulti = form.getAll('notary_ids').map((value) => String(value || '').trim());
  const fromCsv = String(form.get('notary_ids_csv') || '')
    .split(',')
    .map((value) => value.trim());
  const fromLegacy = String(form.get('target_notary_id') || '').trim();
  const ids = [...fromMulti, ...fromCsv, fromLegacy].filter(Boolean);
  return [...new Set(ids)].slice(0, 3);
}

function collectPropertyIds(form: FormData) {
  return [...new Set(form.getAll('property_ids').map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 10);
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const email = String(form.get('email') || '').trim().toLowerCase();
  const serviceSlug = String(form.get('service_slug') || '').trim();
  const serviceName = String(form.get('service_name') || form.get('service_slug') || 'Richiesta notarile').trim();
  const comune = String(form.get('comune') || '').trim();
  const name = String(form.get('name') || '').trim();
  const phone = String(form.get('phone') || '').trim();
  const message = String(form.get('message') || '').trim();
  const urgency = String(form.get('urgency') || '').trim();
  const propertyValue = String(form.get('property_value') || '').trim();
  const parties = String(form.get('parties') || '').trim();
  const documentsReady = String(form.get('documents_ready') || '').trim();
  const notaryIds = collectNotaryIds(form);
  const propertyIds = collectPropertyIds(form);

  if (!email.includes('@')) {
    return new Response('Email non valida', { status: 400 });
  }

  if (!serviceSlug) {
    return new Response('Servizio obbligatorio', { status: 400 });
  }

  const linkedProperties = propertyIds.length
    ? await getPropertiesByIdsForEmail(propertyIds, email)
    : [];

  const hash = createHash('sha256')
    .update(
      [
        email,
        serviceSlug,
        comune.toLowerCase(),
        message.slice(0, 120).toLowerCase(),
        notaryIds.slice().sort().join(','),
        linkedProperties.map((item) => item.id).sort().join(','),
      ].join('|'),
    )
    .digest('hex');

  const serviceRows = await query<{ id: string; price_avg_cents: number | null; name: string; plain_language_name: string | null }>(
    `
    select st.id, st.name, st.plain_language_name, b.price_avg_cents
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
  );
  const service = serviceRows[0];
  if (!service) {
    return new Response('Servizio non trovato', { status: 400 });
  }

  const resolvedServiceName = service.plain_language_name || service.name || serviceName;
  const caseDetails = {
    mvp: true,
    funnel: true,
    urgency: urgency || null,
    property_value: propertyValue || null,
    parties: parties || null,
    documents_ready: documentsReady || null,
    selected_notary_ids: notaryIds,
    selected_property_ids: linkedProperties.map((item) => item.id),
    properties_snapshot: linkedProperties.map((item) => ({
      id: item.id,
      nickname: item.nickname,
      address: item.address,
      comune: item.comune,
      province: item.province,
      foglio: item.foglio,
      particella: item.particella,
      subalterno: item.subalterno,
      sezione: item.sezione,
      categoria_catastale: item.categoria_catastale,
      rendita_catastale: item.rendita_catastale,
      quota_possesso: item.quota_possesso,
      usable_for: item.usable_for,
      data_source: item.data_source,
    })),
    service_requested_by_user: true,
    service_source: 'user_request',
  };

  const rows = await query<{ id: string }>(
    `
    insert into notai.quote_requests (
      service_id, service_slug, service_name, comune, requester_email, requester_name,
      requester_phone, requester_message, average_price_cents, source_url, status,
      idempotency_hash, case_details
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,$12::jsonb)
    on conflict (idempotency_hash) where idempotency_hash is not null
    do update set updated_at = now(), case_details = excluded.case_details
    returning id
    `,
    [
      service.id,
      serviceSlug,
      resolvedServiceName,
      comune || null,
      email,
      name || null,
      phone || null,
      message || null,
      service.price_avg_cents || null,
      request.headers.get('referer') || null,
      hash,
      JSON.stringify(caseDetails),
    ],
  );

  const quoteId = rows[0]?.id;
  if (quoteId && notaryIds.length) {
    const validNotaries = await query<{ id: string }>(
      `
      select id
      from notai.notaries
      where status = 'published' and id = any($1::uuid[])
      `,
      [notaryIds],
    );
    for (const notary of validNotaries.slice(0, 3)) {
      await query(
        `
        insert into notai.quote_request_recipients (quote_request_id, notary_id, match_type, status)
        values ($1, $2, 'selected_by_user', 'pending')
        on conflict do nothing
        `,
        [quoteId, notary.id],
      );
    }
  }

  if (quoteId && linkedProperties.length) {
    await linkPropertiesToQuoteRequest(quoteId, linkedProperties.map((item) => item.id));
  }

  return redirect('/grazie', 303);
};
