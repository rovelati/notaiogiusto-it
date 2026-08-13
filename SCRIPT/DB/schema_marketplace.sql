create extension if not exists pgcrypto;

create schema if not exists notai;

alter table notai.services_taxonomy
    add column if not exists user_intent text,
    add column if not exists plain_language_name text,
    add column if not exists seo_title text,
    add column if not exists seo_description text,
    add column if not exists service_scope text not null default 'notarial',
    add column if not exists standardizable boolean not null default true,
    add column if not exists remote_possible boolean,
    add column if not exists requires_in_person boolean,
    add column if not exists complexity text,
    add column if not exists required_documents jsonb not null default '[]'::jsonb,
    add column if not exists faqs jsonb not null default '[]'::jsonb,
    add column if not exists source_url text,
    add column if not exists priority integer not null default 100;

create table if not exists notai.service_price_benchmarks (
    id uuid primary key default gen_random_uuid(),
    service_id uuid not null references notai.services_taxonomy(id) on delete cascade,
    location_scope text not null default 'national',
    comune text,
    province text,
    region text,
    price_min_cents integer,
    price_max_cents integer,
    price_avg_cents integer,
    currency text not null default 'EUR',
    sample_size integer not null default 0,
    source text not null,
    confidence numeric(4,3),
    evidence text,
    payload jsonb not null default '{}'::jsonb,
    valid_from date not null default current_date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists service_price_benchmarks_unique
    on notai.service_price_benchmarks (service_id, location_scope, coalesce(comune, ''), coalesce(province, ''), coalesce(region, ''), source, valid_from);

create index if not exists service_price_benchmarks_service_idx
    on notai.service_price_benchmarks (service_id, location_scope);

create table if not exists notai.notary_price_list_items (
    id uuid primary key default gen_random_uuid(),
    notary_id uuid not null references notai.notaries(id) on delete cascade,
    service_id uuid not null references notai.services_taxonomy(id) on delete cascade,
    title text,
    price_min_cents integer,
    price_max_cents integer,
    fixed_price_cents integer,
    currency text not null default 'EUR',
    includes_taxes boolean,
    source text not null,
    confidence numeric(4,3),
    evidence text,
    status text not null default 'active',
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists notary_price_list_items_unique
    on notai.notary_price_list_items (notary_id, service_id, source, coalesce(title, ''));

create index if not exists notary_price_list_items_service_idx
    on notai.notary_price_list_items (service_id, status);

create table if not exists notai.quote_requests (
    id uuid primary key default gen_random_uuid(),
    service_id uuid references notai.services_taxonomy(id) on delete set null,
    service_slug text,
    service_name text not null,
    comune text,
    province text,
    region text,
    requester_email text not null,
    requester_name text,
    requester_phone text,
    requester_message text,
    case_details jsonb not null default '{}'::jsonb,
    average_price_cents integer,
    source_url text,
    status text not null default 'pending',
    duplicate_of uuid references notai.quote_requests(id) on delete set null,
    idempotency_hash text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    sent_at timestamptz
);

create unique index if not exists quote_requests_idempotency_hash_unique
    on notai.quote_requests (idempotency_hash)
    where idempotency_hash is not null;

create index if not exists quote_requests_created_idx
    on notai.quote_requests (created_at desc);

create index if not exists quote_requests_service_location_idx
    on notai.quote_requests (service_slug, lower(comune), lower(province));

create table if not exists notai.quote_request_recipients (
    id uuid primary key default gen_random_uuid(),
    quote_request_id uuid not null references notai.quote_requests(id) on delete cascade,
    notary_id uuid references notai.notaries(id) on delete set null,
    recipient_email text,
    recipient_name text,
    match_type text not null default 'local',
    distance_km numeric(8,2),
    status text not null default 'pending',
    sent_at timestamptz,
    opened_at timestamptz,
    clicked_at timestamptz,
    replied_at timestamptz,
    error text,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create unique index if not exists quote_request_recipients_unique
    on notai.quote_request_recipients (quote_request_id, coalesce(notary_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(recipient_email, ''));

create index if not exists quote_request_recipients_status_idx
    on notai.quote_request_recipients (status, created_at desc);

create table if not exists notai.notary_reviews (
    id uuid primary key default gen_random_uuid(),
    notary_id uuid not null references notai.notaries(id) on delete cascade,
    source text not null,
    source_review_id text,
    author_name text,
    rating numeric(2,1),
    text text,
    language text,
    published_at timestamptz,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists notary_reviews_unique
    on notai.notary_reviews (notary_id, source, coalesce(source_review_id, ''), coalesce(author_name, ''), coalesce(published_at, 'epoch'::timestamptz));

create index if not exists notary_reviews_notary_source_idx
    on notai.notary_reviews (notary_id, source);

create table if not exists notai.notary_review_summaries (
    notary_id uuid not null references notai.notaries(id) on delete cascade,
    source text not null,
    rating_avg numeric(3,2),
    review_count integer not null default 0,
    sentiment_label text,
    sentiment_score numeric(5,2),
    strengths jsonb not null default '[]'::jsonb,
    concerns jsonb not null default '[]'::jsonb,
    summary text,
    payload jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    primary key (notary_id, source)
);

create table if not exists notai.notary_claims (
    id uuid primary key default gen_random_uuid(),
    notary_id uuid not null references notai.notaries(id) on delete cascade,
    claimant_email text not null,
    claimant_name text,
    claimant_phone text,
    status text not null default 'pending',
    verification_method text,
    verified_at timestamptz,
    approved_at timestamptz,
    rejected_at timestamptz,
    notes text,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists notary_claims_status_idx
    on notai.notary_claims (status, created_at desc);

create unique index if not exists notary_claims_active_unique
    on notai.notary_claims (notary_id, lower(claimant_email))
    where status in ('pending', 'approved');

create table if not exists notai.notary_metrics_daily (
    notary_id uuid not null references notai.notaries(id) on delete cascade,
    day date not null,
    page_views integer not null default 0,
    phone_clicks integer not null default 0,
    direction_clicks integer not null default 0,
    website_clicks integer not null default 0,
    quote_requests integer not null default 0,
    claim_clicks integer not null default 0,
    payload jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    primary key (notary_id, day)
);

create table if not exists notai.notary_events (
    id uuid primary key default gen_random_uuid(),
    notary_id uuid references notai.notaries(id) on delete set null,
    service_id uuid references notai.services_taxonomy(id) on delete set null,
    event_type text not null,
    source_url text,
    session_id text,
    user_hash text,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists notary_events_type_created_idx
    on notai.notary_events (event_type, created_at desc);

create index if not exists notary_events_notary_created_idx
    on notai.notary_events (notary_id, created_at desc);

create table if not exists notai.content_articles (
    id uuid primary key default gen_random_uuid(),
    service_id uuid references notai.services_taxonomy(id) on delete set null,
    author_notary_id uuid references notai.notaries(id) on delete set null,
    slug text not null unique,
    title text not null,
    excerpt text,
    body text,
    status text not null default 'draft',
    reviewed_by text,
    reviewed_at timestamptz,
    published_at timestamptz,
    seo_title text,
    seo_description text,
    structured_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists content_articles_status_idx
    on notai.content_articles (status, published_at desc);

create or replace function notai.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_service_price_benchmarks_updated_at on notai.service_price_benchmarks;
create trigger set_service_price_benchmarks_updated_at
before update on notai.service_price_benchmarks
for each row execute function notai.set_updated_at();

drop trigger if exists set_notary_price_list_items_updated_at on notai.notary_price_list_items;
create trigger set_notary_price_list_items_updated_at
before update on notai.notary_price_list_items
for each row execute function notai.set_updated_at();

drop trigger if exists set_quote_requests_updated_at on notai.quote_requests;
create trigger set_quote_requests_updated_at
before update on notai.quote_requests
for each row execute function notai.set_updated_at();

drop trigger if exists set_notary_reviews_updated_at on notai.notary_reviews;
create trigger set_notary_reviews_updated_at
before update on notai.notary_reviews
for each row execute function notai.set_updated_at();

drop trigger if exists set_notary_claims_updated_at on notai.notary_claims;
create trigger set_notary_claims_updated_at
before update on notai.notary_claims
for each row execute function notai.set_updated_at();

drop trigger if exists set_content_articles_updated_at on notai.content_articles;
create trigger set_content_articles_updated_at
before update on notai.content_articles
for each row execute function notai.set_updated_at();

update notai.services_taxonomy
set
    plain_language_name = coalesce(plain_language_name, name),
    user_intent = coalesce(user_intent, 'Capire documenti, tempi e costo indicativo prima di contattare un notaio.'),
    seo_title = coalesce(seo_title, initcap(name) || ': costo, documenti e preventivo notaio'),
    seo_description = coalesce(seo_description, 'Guida al servizio notarile ' || lower(name) || ': quando serve, documenti richiesti, prezzo indicativo e richiesta preventivo ai notai disponibili.'),
    standardizable = true
where plain_language_name is null
   or user_intent is null
   or seo_title is null
   or seo_description is null;

update notai.services_taxonomy
set
    remote_possible = coalesce(remote_possible, false),
    requires_in_person = coalesce(requires_in_person, true),
    complexity = coalesce(complexity, 'media')
where remote_possible is null
   or requires_in_person is null
   or complexity is null;

update notai.services_taxonomy
set
    plain_language_name = 'Donazione',
    user_intent = 'Trasferire gratuitamente un immobile, denaro o altri beni a un familiare o a un terzo.',
    complexity = 'media'
where slug in ('atto-di-donazione', 'donazione');

update notai.services_taxonomy
set
    plain_language_name = 'Successione',
    user_intent = 'Gestire eredita, dichiarazione di successione, accettazione o divisione tra eredi.',
    complexity = 'media'
where slug in ('pratica-di-successione', 'successione-ereditaria', 'eredita');

update notai.services_taxonomy
set
    plain_language_name = 'Rogito casa',
    user_intent = 'Comprare o vendere casa e capire costi, controlli e documenti prima dell''atto.',
    complexity = 'media'
where slug = 'compravendita-immobiliare';

update notai.services_taxonomy
set
    plain_language_name = 'Mutuo casa',
    user_intent = 'Stipulare un mutuo ipotecario con la banca e coordinare atto di mutuo e acquisto.',
    complexity = 'media'
where slug in ('mutuo', 'mutuo-ipotecario');

update notai.services_taxonomy
set
    plain_language_name = 'Aprire una societa',
    user_intent = 'Costituire una societa o modificare assetto, statuto e quote.',
    complexity = 'media'
where slug in ('diritto-societario', 'costituzione-srl', 'costituzione-spa', 'startup-innovativa', 'modifiche-statutarie', 'cessione-quote', 'fusioni-e-scissioni');

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'veterinari_app') then
        grant usage, create on schema notai to veterinari_app;
        grant select, insert, update, delete on all tables in schema notai to veterinari_app;
        grant usage, select, update on all sequences in schema notai to veterinari_app;
        alter default privileges in schema notai
            grant select, insert, update, delete on tables to veterinari_app;
        alter default privileges in schema notai
            grant usage, select, update on sequences to veterinari_app;
    end if;
end;
$$;
