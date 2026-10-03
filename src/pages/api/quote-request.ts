import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { verifyMathChallenge } from '../../lib/antispam';
import { query } from '../../lib/db';
import { isMailConfigured } from '../../lib/mail';
import { MAX_QUOTE_NOTARIES } from '../../lib/notai';
import {
  getPropertiesByIdsForEmail,
  linkPropertiesToQuoteRequest,
} from '../../lib/properties';
import { sendQuoteRequestEmails, type QuoteMailNotary } from '../../lib/quote-mail';
import { collectIntakeValues, getServiceIntake } from '../../lib/service-intake';

export const prerender = false;

function collectNotaryIds(form: FormData) {
  const fromMulti = form.getAll('notary_ids').map((value) => String(value || '').trim());
  const fromCsv = String(form.get('notary_ids_csv') || '')
    .split(',')
    .map((value) => value.trim());
  const fromLegacy = String(form.get('target_notary_id') || '').trim();
  const ids = [...fromMulti, ...fromCsv, fromLegacy].filter(Boolean);
  return [...new Set(ids)].slice(0, MAX_QUOTE_NOTARIES);
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
  const honeypot = String(form.get('website') || '').trim();
  const notaryIds = collectNotaryIds(form);
  const propertyIds = collectPropertyIds(form);

  if (honeypot || !verifyMathChallenge(String(form.get('antispam_token') || ''), String(form.get('antispam_answer') || ''))) {
    return new Response('Codice antispam non valido. Torna indietro e riprova.', { status: 400 });
  }

  if (!email.includes('@')) {
    return new Response('Email non valida', { status: 400 });
  }

  if (!serviceSlug) {
    return new Response('Servizio obbligatorio', { status: 400 });
  }

  const linkedProperties = propertyIds.length
    ? await getPropertiesByIdsForEmail(propertyIds, email)
    : [];

  const serviceRows = await query<{
    id: string;
    slug: string;
    category: string | null;
    user_intent: string | null;
    required_documents: unknown[] | null;
    price_avg_cents: number | null;
    name: string;
    plain_language_name: string | null;
  }>(
    `
    with requested as (
      select *
      from notai.services_taxonomy
      where slug = $1
      limit 1
    )
    select st.id, st.slug, st.name, st.plain_language_name, st.category, st.user_intent,
           st.required_documents, b.price_avg_cents
    from requested
    join notai.services_taxonomy st on st.id = coalesce(requested.canonical_service_id, requested.id)
    left join lateral (
      select price_avg_cents
      from notai.service_price_benchmarks
      where service_id = st.id and location_scope = 'national'
      order by confidence desc nulls last
      limit 1
    ) b on true
    where st.is_searchable
    limit 1
    `,
    [serviceSlug],
  );
  const service = serviceRows[0];
  if (!service) {
    return new Response('Servizio non trovato', { status: 400 });
  }

  const hash = createHash('sha256')
    .update(
      [
        email,
        service.slug,
        comune.toLowerCase(),
        message.slice(0, 120).toLowerCase(),
        notaryIds.slice().sort().join(','),
        linkedProperties.map((item) => item.id).sort().join(','),
      ].join('|'),
    )
    .digest('hex');

  const resolvedServiceName = service.plain_language_name || service.name || serviceName;
  const intake = getServiceIntake(service);
  const intakeValues = collectIntakeValues(form, intake.fields);
  const caseDetails = {
    mvp: true,
    funnel: true,
    urgency: urgency || intakeValues.timing_preference || null,
    property_value: propertyValue || intakeValues.deal_value || intakeValues.loan_amount || null,
    parties: parties || null,
    documents_ready: documentsReady || null,
    intake_profile: intake.profile,
    intake: intakeValues,
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

  const rows = await query<{ id: string; inserted: boolean }>(
    `
    insert into notai.quote_requests (
      service_id, service_slug, service_name, comune, requester_email, requester_name,
      requester_phone, requester_message, average_price_cents, source_url, status,
      idempotency_hash, case_details
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,$12::jsonb)
    on conflict (idempotency_hash) where idempotency_hash is not null
    do update set updated_at = now(), case_details = excluded.case_details
    returning id, (xmax = 0) as inserted
    `,
    [
      service.id,
      service.slug,
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
  const quoteWasInserted = Boolean(rows[0]?.inserted);
  const selectedNotaries: QuoteMailNotary[] = [];
  if (quoteId && notaryIds.length) {
    const validNotaries = await query<{
      id: string;
      full_name: string;
      recipient_email: string | null;
    }>(
      `
      select id, full_name,
             coalesce(nullif(owner_email, ''), nullif(email, '')) as recipient_email
      from notai.notaries
      where status = 'published' and id = any($1::uuid[])
      `,
      [notaryIds],
    );
    for (const notary of validNotaries.slice(0, MAX_QUOTE_NOTARIES)) {
      await query(
        `
        insert into notai.quote_request_recipients (
          quote_request_id, notary_id, recipient_email, recipient_name, match_type, status
        )
        values ($1, $2, $3, $4, 'selected_by_user', 'pending')
        on conflict (
          quote_request_id,
          coalesce(notary_id, '00000000-0000-0000-0000-000000000000'::uuid),
          coalesce(recipient_email, '')
        )
        do update set recipient_email = excluded.recipient_email, recipient_name = excluded.recipient_name
        `,
        [quoteId, notary.id, notary.recipient_email, notary.full_name],
      );
      if (notary.recipient_email?.includes('@')) {
        selectedNotaries.push({
          id: notary.id,
          fullName: notary.full_name,
          email: notary.recipient_email,
        });
      }
    }
  }

  if (quoteId && linkedProperties.length) {
    await linkPropertiesToQuoteRequest(quoteId, linkedProperties.map((item) => item.id));
  }

  if (quoteId && quoteWasInserted && isMailConfigured()) {
    const details = intake.fields
      .map((field) => ({ label: field.label, value: intakeValues[field.name] || '' }))
      .filter((item) => item.value);
    if (propertyValue && !details.some((item) => item.value === propertyValue)) {
      details.push({ label: 'Valore indicativo', value: propertyValue });
    }
    if (parties) details.push({ label: 'Parti coinvolte', value: parties });
    if (documentsReady) details.push({ label: 'Documenti disponibili', value: documentsReady });

    const deliveries = await sendQuoteRequestEmails({
      quoteId,
      requesterEmail: email,
      requesterName: name,
      requesterPhone: phone,
      serviceName: resolvedServiceName,
      comune,
      message,
      urgency: urgency || intakeValues.timing_preference || '',
      details,
      notaries: selectedNotaries,
    });

    for (const delivery of deliveries) {
      if (delivery.kind !== 'notary' || !delivery.notaryId) continue;
      await query(
        `
        update notai.quote_request_recipients
        set status = $3,
            sent_at = case when $3 = 'sent' then now() else sent_at end,
            error = $4
        where quote_request_id = $1 and notary_id = $2
        `,
        [
          quoteId,
          delivery.notaryId,
          delivery.result.success ? 'sent' : 'failed',
          delivery.result.error || null,
        ],
      );
    }

    if (deliveries.some((delivery) => delivery.result.success)) {
      await query(`update notai.quote_requests set sent_at = now() where id = $1`, [quoteId]);
    }

    const failures = deliveries.filter((delivery) => !delivery.result.success);
    if (failures.length) {
      console.error(
        `[quote-mail] ${failures.length}/${deliveries.length} invii falliti per richiesta ${quoteId}:`,
        failures.map((delivery) => `${delivery.kind}:${delivery.result.error || 'errore sconosciuto'}`).join('; '),
      );
    }
  }

  return redirect(
    `/grazie?servizio=${encodeURIComponent(service.slug)}${comune ? `&comune=${encodeURIComponent(comune)}` : ''}`,
    303,
  );
};
