create extension if not exists pgcrypto;
create schema if not exists notai;

alter table notai.notaries
    add column if not exists google_place_id text,
    add column if not exists google_maps_url text,
    add column if not exists google_business_status text,
    add column if not exists google_opening_hours jsonb not null default '{}'::jsonb,
    add column if not exists google_photos jsonb not null default '[]'::jsonb,
    add column if not exists google_checked_at timestamptz;

create unique index if not exists notaries_google_place_id_unique
    on notai.notaries (google_place_id)
    where google_place_id is not null and google_place_id <> '';

create index if not exists notaries_google_checked_idx
    on notai.notaries (google_checked_at nulls first);

comment on column notai.notaries.google_place_id is
    'Identificatore Google Places del match NAP verificato.';
comment on column notai.notaries.google_photos is
    'Riferimenti foto e attribuzioni Google; nessuna chiave API o copia binaria persistita.';

-- Tabelle recensioni/sentiment già previste dal marketplace; mantenute qui
-- per rendere la migrazione Google eseguibile anche in installazioni parziali.
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
    on notai.notary_reviews (
        notary_id,
        source,
        coalesce(source_review_id, ''),
        coalesce(author_name, ''),
        coalesce(published_at, 'epoch'::timestamptz)
    );

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

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'veterinari_app') then
        grant select, insert, update, delete on notai.notary_reviews to veterinari_app;
        grant select, insert, update, delete on notai.notary_review_summaries to veterinari_app;
        grant usage, select, update on all sequences in schema notai to veterinari_app;
    end if;
end;
$$;
