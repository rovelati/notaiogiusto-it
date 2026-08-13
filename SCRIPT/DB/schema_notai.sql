create extension if not exists pgcrypto;

create schema if not exists notai;

create table if not exists notai.import_runs (
    id uuid primary key default gen_random_uuid(),
    source text not null,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    status text not null default 'running',
    selected_count integer not null default 0,
    processed_count integer not null default 0,
    inserted_count integer not null default 0,
    updated_count integer not null default 0,
    skipped_count integer not null default 0,
    error_count integer not null default 0,
    options jsonb not null default '{}'::jsonb,
    notes text
);

create table if not exists notai.notaries (
    id uuid primary key default gen_random_uuid(),
    source text not null default 'notariato',
    source_url text not null unique,
    source_slug text,
    official_reference_url text,
    canonical_url text,
    wp_json_url text,
    official_lastmod timestamptz,

    full_name text not null,
    first_name text,
    last_name text,
    birth_date date,
    fiscal_code text,

    comune text,
    address text,
    cap text,
    district text,
    current_office_since date,
    phone text,
    phones text[] not null default '{}'::text[],
    email text,
    pec text,
    previous_locations jsonb not null default '[]'::jsonb,

    lat double precision,
    lng double precision,
    website text,
    description text,
    status text not null default 'published',
    is_official_notariato boolean not null default true,

    raw_text text,
    raw_html_hash text,
    raw_import jsonb not null default '{}'::jsonb,
    imported_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists notaries_fiscal_code_unique
    on notai.notaries (fiscal_code)
    where fiscal_code is not null and fiscal_code <> '';

create index if not exists notaries_source_slug_idx on notai.notaries (source_slug);
create index if not exists notaries_full_name_idx on notai.notaries (lower(full_name));
create index if not exists notaries_comune_idx on notai.notaries (lower(comune));
create index if not exists notaries_district_idx on notai.notaries (lower(district));
create index if not exists notaries_email_idx on notai.notaries (lower(email));
create index if not exists notaries_raw_import_gin_idx on notai.notaries using gin (raw_import);

create table if not exists notai.notary_enrichments (
    id uuid primary key default gen_random_uuid(),
    notary_id uuid not null references notai.notaries(id) on delete cascade,
    source text not null,
    status text not null default 'pending',
    source_url text,
    payload jsonb not null default '{}'::jsonb,
    error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists notary_enrichments_notary_source_idx
    on notai.notary_enrichments (notary_id, source);

create unique index if not exists notary_enrichments_notary_source_url_unique
    on notai.notary_enrichments (notary_id, source, source_url)
    where source_url is not null;

create table if not exists notai.services_taxonomy (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    name text not null,
    category text,
    description text,
    synonyms text[] not null default '{}'::text[],
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists notai.notary_services (
    notary_id uuid not null references notai.notaries(id) on delete cascade,
    service_id uuid not null references notai.services_taxonomy(id) on delete cascade,
    source text not null,
    confidence numeric(4,3),
    evidence text,
    created_at timestamptz not null default now(),
    primary key (notary_id, service_id, source)
);

insert into notai.services_taxonomy (slug, name, category, synonyms)
values
    ('atto-di-donazione', 'Atto di donazione', 'Famiglia e eredita', array['donazione', 'atto donazione']),
    ('pratica-di-successione', 'Pratica di successione', 'Famiglia e eredita', array['successione', 'successioni', 'dichiarazione di successione']),
    ('testamento', 'Testamento', 'Famiglia e eredita', array['testamenti', 'atto mortis causa', 'mortis causa']),
    ('convenzioni-matrimoniali', 'Convenzioni matrimoniali', 'Famiglia e eredita', array['convenzione matrimoniale', 'regime patrimoniale']),
    ('eredita', 'Eredita', 'Famiglia e eredita', array['eredità', 'eredita', 'ereditario']),
    ('separazione-dei-beni', 'Separazione dei beni', 'Famiglia e eredita', array['separazione beni']),
    ('diritto-di-famiglia', 'Diritto di famiglia', 'Famiglia e eredita', array['famiglia']),
    ('compravendita-immobiliare', 'Compravendita immobiliare', 'Casa', array['trasferimenti immobiliari', 'vendita casa', 'acquisto casa', 'diritto immobiliare']),
    ('mutuo', 'Mutuo', 'Casa', array['mutui', 'atti ipotecari', 'garanzia ipotecaria']),
    ('diritto-societario', 'Diritto societario', 'Impresa', array['societario', 'operazioni straordinarie', 'costituzione societa', 'costituzione società']),
    ('procura', 'Procura', 'Atti notarili', array['procure']),
    ('consulenza-notarile', 'Consulenza notarile', 'Consulenza', array['consulenza', 'consulenze'])
on conflict (slug) do update set
    name = excluded.name,
    category = excluded.category,
    synonyms = excluded.synonyms;

create or replace function notai.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_notaries_updated_at on notai.notaries;
create trigger set_notaries_updated_at
before update on notai.notaries
for each row execute function notai.set_updated_at();

drop trigger if exists set_notary_enrichments_updated_at on notai.notary_enrichments;
create trigger set_notary_enrichments_updated_at
before update on notai.notary_enrichments
for each row execute function notai.set_updated_at();

drop trigger if exists set_services_taxonomy_updated_at on notai.services_taxonomy;
create trigger set_services_taxonomy_updated_at
before update on notai.services_taxonomy
for each row execute function notai.set_updated_at();

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
