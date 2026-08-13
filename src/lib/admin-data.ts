import { query } from './db';

export async function getAdminOverview() {
  const rows = await query<{
    notaries: string;
    with_email: string;
    with_phone: string;
    with_website: string;
    with_geo: string;
    official: string;
    services: string;
    quotes: string;
    quotes_7d: string;
    claims_pending: string;
    client_emails: string;
    properties: string;
    enrichments: string;
    notary_services_links: string;
  }>(
    `
    select
      (select count(*) from notai.notaries where status = 'published') as notaries,
      (select count(*) from notai.notaries where status = 'published' and coalesce(email, '') <> '') as with_email,
      (select count(*) from notai.notaries where status = 'published' and coalesce(phone, '') <> '') as with_phone,
      (select count(*) from notai.notaries where status = 'published' and coalesce(website, '') <> '') as with_website,
      (select count(*) from notai.notaries where status = 'published' and lat is not null and lng is not null) as with_geo,
      (select count(*) from notai.notaries where status = 'published' and is_official_notariato) as official,
      (select count(*) from notai.services_taxonomy) as services,
      (select count(*) from notai.quote_requests) as quotes,
      (select count(*) from notai.quote_requests where created_at >= now() - interval '7 days') as quotes_7d,
      (select count(*) from notai.notary_claims where status = 'pending') as claims_pending,
      (select count(distinct lower(requester_email)) from notai.quote_requests) as client_emails,
      (select count(*) from notai.client_properties where status = 'active') as properties,
      (select count(*) from notai.notary_enrichments) as enrichments,
      (select count(*) from notai.notary_services) as notary_services_links
    `,
  );
  return rows[0];
}

export async function getEnrichmentBreakdown() {
  return query<{ source: string; status: string; total: string }>(
    `
    select coalesce(source, 'unknown') as source,
           coalesce(status, 'unknown') as status,
           count(*)::text as total
    from notai.notary_enrichments
    group by 1, 2
    order by count(*) desc, source asc
    limit 40
    `,
  );
}

export async function listAdminClients(limit = 100) {
  return query<{
    email: string;
    requests: string;
    last_request_at: string;
    properties: string;
    sample_services: string | null;
  }>(
    `
    select lower(qr.requester_email) as email,
           count(*)::text as requests,
           max(qr.created_at)::text as last_request_at,
           (
             select count(*)::text
             from notai.client_properties cp
             where lower(cp.owner_email) = lower(qr.requester_email)
               and cp.status = 'active'
           ) as properties,
           string_agg(qr.service_name, ', ') as sample_services
    from notai.quote_requests qr
    group by lower(qr.requester_email)
    order by max(qr.created_at) desc
    limit $1
    `,
    [limit],
  );
}

export async function listAdminClaims(limit = 100) {
  return query<{
    id: string;
    status: string;
    claimant_email: string;
    claimant_name: string | null;
    claimant_phone: string | null;
    notary_name: string | null;
    notary_slug: string | null;
    comune: string | null;
    created_at: string;
    notes: string | null;
  }>(
    `
    select c.id, c.status, c.claimant_email, c.claimant_name, c.claimant_phone,
           n.full_name as notary_name, n.source_slug as notary_slug, n.comune,
           c.created_at::text, c.notes
    from notai.notary_claims c
    left join notai.notaries n on n.id = c.notary_id
    order by
      case when c.status = 'pending' then 0 else 1 end,
      c.created_at desc
    limit $1
    `,
    [limit],
  );
}

export async function listAdminServices(limit = 200) {
  return query<{
    slug: string;
    name: string;
    plain_language_name: string | null;
    category: string | null;
    complexity: string | null;
    price_avg_cents: number | null;
    docs_count: string;
  }>(
    `
    select st.slug, st.name, st.plain_language_name, st.category, st.complexity,
           spb.price_avg_cents,
           coalesce(jsonb_array_length(st.required_documents), 0)::text as docs_count
    from notai.services_taxonomy st
    left join lateral (
      select price_avg_cents
      from notai.service_price_benchmarks b
      where b.service_id = st.id and b.location_scope = 'national'
      order by b.confidence desc nulls last
      limit 1
    ) spb on true
    order by st.priority asc nulls last, st.name asc
    limit $1
    `,
    [limit],
  );
}

export async function updateClaimStatus(id: string, status: 'approved' | 'rejected' | 'pending') {
  const rows = await query<{ id: string }>(
    `
    update notai.notary_claims
    set status = $2,
        approved_at = case when $2 = 'approved' then now() else approved_at end,
        rejected_at = case when $2 = 'rejected' then now() else rejected_at end,
        updated_at = now()
    where id = $1
    returning id
    `,
    [id, status],
  );
  return Boolean(rows[0]?.id);
}
