create extension if not exists pgcrypto;
create schema if not exists notai;

-- Fascicolo immobili del cliente (MVP: ownership per email sessione area clienti)
create table if not exists notai.client_properties (
    id uuid primary key default gen_random_uuid(),
    owner_email text not null,
    nickname text not null,
    address text,
    comune text,
    province text,
    cap text,
    foglio text,
    particella text,
    subalterno text,
    sezione text,
    categoria_catastale text,
    rendita_catastale numeric(12,2),
    quota_possesso text,
    titolo_provenienza text,
    notes text,
    data_source text not null default 'manual',
    usable_for text[] not null default '{}',
    shareable boolean not null default true,
    status text not null default 'active',
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists client_properties_owner_idx
    on notai.client_properties (lower(owner_email), status, updated_at desc);

create index if not exists client_properties_usable_for_idx
    on notai.client_properties using gin (usable_for);

-- Nota: nessun FK su quote_requests se il ruolo app non ha privilegio REFERENCES.
create table if not exists notai.quote_request_properties (
    id uuid primary key default gen_random_uuid(),
    quote_request_id uuid not null,
    property_id uuid not null references notai.client_properties(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (quote_request_id, property_id)
);

create index if not exists quote_request_properties_request_idx
    on notai.quote_request_properties (quote_request_id);

drop trigger if exists set_client_properties_updated_at on notai.client_properties;
create trigger set_client_properties_updated_at
before update on notai.client_properties
for each row execute function notai.set_updated_at();
