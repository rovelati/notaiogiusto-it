import { query } from './db';

export type Service = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  plain_language_name: string | null;
  user_intent: string | null;
  seo_title: string | null;
  seo_description: string | null;
  service_scope: string | null;
  complexity: string | null;
  remote_possible: boolean | null;
  requires_in_person: boolean | null;
  required_documents: unknown[] | null;
  faqs: Array<{ question?: string; answer?: string }> | null;
  price_min_cents: number | null;
  price_avg_cents: number | null;
  price_max_cents: number | null;
  confidence: string | null;
};

export type Notary = {
  id: string;
  source_slug: string;
  full_name: string;
  comune: string | null;
  district: string | null;
  address: string | null;
  cap: string | null;
  phone: string | null;
  email: string | null;
  pec: string | null;
  website: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  official_reference_url: string | null;
  is_official_notariato: boolean;
};

export type NotaryService = {
  slug: string;
  name: string;
  plain_language_name: string | null;
  category: string | null;
  price_min_cents: number | null;
  price_avg_cents: number | null;
  price_max_cents: number | null;
  source: string | null;
  confidence: string | null;
};

export async function getTopServices(limit = 18) {
  return query<Service>(
    `
    select st.id, st.slug, st.name, st.category, st.plain_language_name, st.user_intent,
           st.seo_title, st.seo_description, st.service_scope, st.complexity,
           st.remote_possible, st.requires_in_person, st.required_documents, st.faqs,
           spb.price_min_cents, spb.price_avg_cents, spb.price_max_cents, spb.confidence
    from notai.services_taxonomy st
    left join lateral (
      select *
      from notai.service_price_benchmarks b
      where b.service_id = st.id and b.location_scope = 'national'
      order by b.confidence desc nulls last, b.updated_at desc
      limit 1
    ) spb on true
    order by st.priority asc, st.category nulls last, st.name asc
    limit $1
    `,
    [limit],
  );
}

export async function getService(slug: string) {
  const rows = await query<Service>(
    `
    select st.id, st.slug, st.name, st.category, st.plain_language_name, st.user_intent,
           st.seo_title, st.seo_description, st.service_scope, st.complexity,
           st.remote_possible, st.requires_in_person, st.required_documents, st.faqs,
           spb.price_min_cents, spb.price_avg_cents, spb.price_max_cents, spb.confidence
    from notai.services_taxonomy st
    left join lateral (
      select *
      from notai.service_price_benchmarks b
      where b.service_id = st.id and b.location_scope = 'national'
      order by b.confidence desc nulls last, b.updated_at desc
      limit 1
    ) spb on true
    where st.slug = $1
    limit 1
    `,
    [slug],
  );
  return rows[0] || null;
}

export async function getAllServices() {
  return query<
    Pick<
      Service,
      | 'id'
      | 'slug'
      | 'name'
      | 'plain_language_name'
      | 'category'
      | 'user_intent'
      | 'complexity'
      | 'price_avg_cents'
    >
  >(
    `
    select st.id, st.slug, st.name, st.plain_language_name, st.category, st.user_intent, st.complexity,
           spb.price_avg_cents
    from notai.services_taxonomy st
    left join lateral (
      select price_avg_cents
      from notai.service_price_benchmarks b
      where b.service_id = st.id and b.location_scope = 'national'
      order by b.confidence desc nulls last
      limit 1
    ) spb on true
    order by st.priority asc, st.name asc
    `,
  );
}

export async function getNotariesByIds(ids: string[]) {
  const cleanIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, 3);
  if (!cleanIds.length) return [] as Notary[];
  return query<Notary>(
    `
    select id, source_slug, full_name, comune, district, address, cap, phone, email, pec, website,
           lat, lng, description, official_reference_url, is_official_notariato
    from notai.notaries
    where status = 'published' and id = any($1::uuid[])
    order by full_name asc
    `,
    [cleanIds],
  );
}

export async function getPublishedNotarySlugs(limit = 5000) {
  return query<{ source_slug: string; updated_at: string | null }>(
    `
    select source_slug, updated_at::text
    from notai.notaries
    where status = 'published' and coalesce(source_slug, '') <> ''
    order by updated_at desc nulls last, full_name asc
    limit $1
    `,
    [limit],
  );
}

export type QuoteRequestRow = {
  id: string;
  service_slug: string | null;
  service_name: string;
  comune: string | null;
  requester_email: string;
  requester_name: string | null;
  requester_phone: string | null;
  requester_message: string | null;
  case_details: Record<string, unknown> | null;
  status: string;
  source_url: string | null;
  created_at: string;
  recipient_names: string | null;
  recipient_count: string;
};

export async function listQuoteRequests(limit = 100) {
  return query<QuoteRequestRow>(
    `
    select qr.id, qr.service_slug, qr.service_name, qr.comune,
           qr.requester_email, qr.requester_name, qr.requester_phone, qr.requester_message,
           qr.case_details, qr.status, qr.source_url, qr.created_at::text,
           coalesce(string_agg(n.full_name, ', ' order by n.full_name), '') as recipient_names,
           count(qrr.id)::text as recipient_count
    from notai.quote_requests qr
    left join notai.quote_request_recipients qrr on qrr.quote_request_id = qr.id
    left join notai.notaries n on n.id = qrr.notary_id
    group by qr.id
    order by qr.created_at desc
    limit $1
    `,
    [limit],
  );
}

export async function listQuoteRequestsByEmail(email: string, limit = 50) {
  return query<QuoteRequestRow>(
    `
    select qr.id, qr.service_slug, qr.service_name, qr.comune,
           qr.requester_email, qr.requester_name, qr.requester_phone, qr.requester_message,
           qr.case_details, qr.status, qr.source_url, qr.created_at::text,
           coalesce(string_agg(n.full_name, ', ' order by n.full_name), '') as recipient_names,
           count(qrr.id)::text as recipient_count
    from notai.quote_requests qr
    left join notai.quote_request_recipients qrr on qrr.quote_request_id = qr.id
    left join notai.notaries n on n.id = qrr.notary_id
    where lower(qr.requester_email) = lower($1)
    group by qr.id
    order by qr.created_at desc
    limit $2
    `,
    [email.trim().toLowerCase(), limit],
  );
}

export async function getQuoteRequestForEmail(id: string, email: string) {
  const rows = await query<QuoteRequestRow>(
    `
    select qr.id, qr.service_slug, qr.service_name, qr.comune,
           qr.requester_email, qr.requester_name, qr.requester_phone, qr.requester_message,
           qr.case_details, qr.status, qr.source_url, qr.created_at::text,
           coalesce(string_agg(n.full_name, ', ' order by n.full_name), '') as recipient_names,
           count(qrr.id)::text as recipient_count
    from notai.quote_requests qr
    left join notai.quote_request_recipients qrr on qrr.quote_request_id = qr.id
    left join notai.notaries n on n.id = qrr.notary_id
    where qr.id = $1 and lower(qr.requester_email) = lower($2)
    group by qr.id
    limit 1
    `,
    [id, email.trim().toLowerCase()],
  );
  return rows[0] || null;
}

export type QuoteRecipientRow = {
  notary_id: string | null;
  full_name: string | null;
  source_slug: string | null;
  comune: string | null;
  match_type: string;
  status: string;
};

export async function getQuoteRecipients(quoteRequestId: string) {
  return query<QuoteRecipientRow>(
    `
    select qrr.notary_id, n.full_name, n.source_slug, n.comune, qrr.match_type, qrr.status
    from notai.quote_request_recipients qrr
    left join notai.notaries n on n.id = qrr.notary_id
    where qrr.quote_request_id = $1
    order by n.full_name nulls last
    `,
    [quoteRequestId],
  );
}

export async function searchNotaries({ comune, q, limit = 12 }: { comune?: string; q?: string; limit?: number }) {
  const searchTerm = (q || '').trim();
  const cityTerm = (comune || '').replace(/-/g, ' ').trim();
  const search = `%${searchTerm}%`;
  const city = `%${cityTerm}%`;
  return query<Notary>(
    `
    select id, source_slug, full_name, comune, district, address, cap, phone, email, pec, website,
           lat, lng, description, official_reference_url, is_official_notariato
    from notai.notaries
    where status = 'published'
      and ($1 = '%%' or full_name ilike $1 or coalesce(comune, '') ilike $1 or coalesce(address, '') ilike $1)
      and ($2 = '%%' or coalesce(comune, '') ilike $2 or coalesce(district, '') ilike $2)
    order by
      case when $4 = '' then 0 when lower(coalesce(comune, '')) = lower($4) then 0 else 1 end,
      case when $4 = '' then 0 when coalesce(comune, '') ilike $2 then 0 else 1 end,
      case when lat is not null and lng is not null then 0 else 1 end,
      full_name asc
    limit $3
    `,
    [search, city, limit, cityTerm],
  );
}

export async function getNotary(slug: string) {
  const rows = await query<Notary>(
    `
    select id, source_slug, full_name, comune, district, address, cap, phone, email, pec, website,
           lat, lng, description, official_reference_url, is_official_notariato
    from notai.notaries
    where source_slug = $1 and status = 'published'
    limit 1
    `,
    [slug],
  );
  return rows[0] || null;
}

export async function getNotaryServices(notaryId: string, limit = 10) {
  return query<NotaryService>(
    `
    select st.slug, st.name, st.plain_language_name, st.category,
           b.price_min_cents, b.price_avg_cents, b.price_max_cents,
           ns.source, ns.confidence
    from notai.notary_services ns
    join notai.services_taxonomy st on st.id = ns.service_id
    left join lateral (
      select price_min_cents, price_avg_cents, price_max_cents
      from notai.service_price_benchmarks
      where service_id = st.id and location_scope = 'national'
      order by confidence desc nulls last, updated_at desc
      limit 1
    ) b on true
    where ns.notary_id = $1
    order by ns.confidence desc nulls last, st.priority asc, st.name asc
    limit $2
    `,
    [notaryId, limit],
  );
}

export async function getStats() {
  const rows = await query<{ notaries: string; services: string; prices: string }>(
    `
    select
      (select count(*) from notai.notaries where status = 'published') as notaries,
      (select count(*) from notai.services_taxonomy) as services,
      (select count(*) from notai.service_price_benchmarks) as prices
    `,
  );
  return rows[0];
}
