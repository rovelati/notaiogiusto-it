-- Account clienti: email+password e/o Google (niente magic link)
-- Run: psql $DATABASE_URL -f SCRIPT/DB/schema_client_accounts.sql

create extension if not exists pgcrypto;

create table if not exists notai.client_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text,
  google_sub text,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create unique index if not exists client_accounts_email_unique
  on notai.client_accounts (lower(email));

create unique index if not exists client_accounts_google_sub_unique
  on notai.client_accounts (google_sub)
  where google_sub is not null;

comment on table notai.client_accounts is 'Credenziali area clienti (email+password e/o Google). Sessione cookie su email.';
