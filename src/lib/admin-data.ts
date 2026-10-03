import { getPool, query } from './db';

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
    with request_summary as (
      select lower(requester_email) as email,
             count(*)::text as requests,
             max(created_at) as last_request_at,
             string_agg(distinct service_name, ', ' order by service_name) as sample_services
      from notai.quote_requests
      group by lower(requester_email)
    ),
    property_summary as (
      select lower(owner_email) as email,
             count(*)::text as properties
      from notai.client_properties
      where status = 'active'
      group by lower(owner_email)
    )
    select rs.email,
           rs.requests,
           rs.last_request_at::text,
           coalesce(ps.properties, '0') as properties,
           rs.sample_services
    from request_summary rs
    left join property_summary ps on ps.email = rs.email
    order by rs.last_request_at desc
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
    content_status: string | null;
    has_html: boolean;
    has_image: boolean;
    record_kind: 'service' | 'alias' | 'hub';
    is_searchable: boolean;
    canonical_slug: string | null;
  }>(
    `
    select st.slug, st.name, st.plain_language_name, st.category, st.complexity,
           st.record_kind, st.is_searchable, canonical.slug as canonical_slug,
           spb.price_avg_cents,
           coalesce(jsonb_array_length(st.required_documents), 0)::text as docs_count,
           st.content_status,
           (st.html_content is not null and length(trim(st.html_content)) > 200) as has_html,
           (st.image_url is not null and length(trim(st.image_url)) > 0) as has_image
    from notai.services_taxonomy st
    left join notai.services_taxonomy canonical on canonical.id = st.canonical_service_id
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

export async function getAdminService(slug: string) {
  const rows = await query<{
    id: string;
    slug: string;
    name: string;
    plain_language_name: string | null;
    category: string | null;
    seo_title: string | null;
    seo_description: string | null;
    description: string | null;
    html_content: string | null;
    image_url: string | null;
    content_status: string | null;
    faqs: unknown;
    required_documents: unknown;
  }>(
    `
    select id, slug, name, plain_language_name, category, seo_title, seo_description,
           description, html_content, image_url, content_status, faqs, required_documents
    from notai.services_taxonomy
    where slug = $1
    limit 1
    `,
    [slug],
  );
  return rows[0] || null;
}

export async function updateAdminServiceContent(input: {
  slug: string;
  seo_title?: string;
  seo_description?: string;
  description?: string;
  html_content?: string;
  image_url?: string;
  content_status?: string;
}) {
  const rows = await query<{ slug: string }>(
    `
    update notai.services_taxonomy
    set seo_title = coalesce(nullif($2, ''), seo_title),
        seo_description = coalesce(nullif($3, ''), seo_description),
        description = coalesce(nullif($4, ''), description),
        html_content = coalesce($5, html_content),
        image_url = coalesce(nullif($6, ''), image_url),
        content_status = coalesce(nullif($7, ''), content_status),
        content_updated_by = 'admin',
        updated_at = now()
    where slug = $1
    returning slug
    `,
    [
      input.slug,
      input.seo_title || '',
      input.seo_description || '',
      input.description || '',
      input.html_content ?? null,
      input.image_url || '',
      input.content_status || '',
    ],
  );
  return Boolean(rows[0]?.slug);
}

export async function updateClaimStatus(id: string, status: 'approved' | 'rejected' | 'pending') {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const claimRes = await client.query<{
      id: string;
      notary_id: string;
      claimant_email: string;
    }>(
      `
      update notai.notary_claims
      set status = $2,
          approved_at = case when $2 = 'approved' then now() else approved_at end,
          rejected_at = case when $2 = 'rejected' then now() else rejected_at end,
          verified_at = case when $2 = 'approved' then now() else verified_at end,
          updated_at = now()
      where id = $1
      returning id, notary_id, claimant_email
      `,
      [id, status],
    );
    const claim = claimRes.rows[0];
    if (!claim) {
      await client.query('rollback');
      return false;
    }

    if (status === 'approved') {
      await client.query(
        `
        update notai.notaries
        set owner_email = $2,
            profile_status = 'verified',
            claimed_at = coalesce(claimed_at, now()),
            updated_at = now()
        where id = $1::uuid
        `,
        [claim.notary_id, claim.claimant_email.toLowerCase()],
      );
    } else if (status === 'rejected') {
      await client.query(
        `
        update notai.notaries
        set owner_email = case
              when lower(coalesce(owner_email, '')) = lower($2) then null
              else owner_email
            end,
            profile_status = case
              when lower(coalesce(owner_email, '')) = lower($2) then null
              else profile_status
            end,
            updated_at = now()
        where id = $1::uuid
        `,
        [claim.notary_id, claim.claimant_email],
      );
    } else if (status === 'pending') {
      await client.query(
        `
        update notai.notaries
        set owner_email = $2,
            profile_status = 'in_revisione',
            updated_at = now()
        where id = $1::uuid
        `,
        [claim.notary_id, claim.claimant_email.toLowerCase()],
      );
    }

    await client.query('commit');
    return true;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function listAdminAccounts(limit = 100) {
  const notaries = await query<{
    kind: string;
    email: string;
    google: boolean;
    has_password: boolean;
    last_login_at: string | null;
    created_at: string;
  }>(
    `
    select 'notary'::text as kind,
           email,
           (google_sub is not null) as google,
           (password_hash is not null and password_hash not like 'oauth_google$%') as has_password,
           last_login_at::text,
           created_at::text
    from notai.notary_accounts
    order by coalesce(last_login_at, created_at) desc nulls last
    limit $1
    `,
    [limit],
  ).catch(() => [] as never[]);

  const clients = await query<{
    kind: string;
    email: string;
    google: boolean;
    has_password: boolean;
    last_login_at: string | null;
    created_at: string;
  }>(
    `
    select 'client'::text as kind,
           email,
           (google_sub is not null) as google,
           (password_hash is not null and password_hash not like 'oauth_google$%') as has_password,
           last_login_at::text,
           created_at::text
    from notai.client_accounts
    order by coalesce(last_login_at, created_at) desc nulls last
    limit $1
    `,
    [limit],
  ).catch(() => [] as never[]);

  return [...notaries, ...clients].sort((a, b) => {
    const ta = Date.parse(a.last_login_at || a.created_at || '') || 0;
    const tb = Date.parse(b.last_login_at || b.created_at || '') || 0;
    return tb - ta;
  });
}
