-- Account notai: email+password e/o Google (niente token email)
-- Run: psql $DATABASE_URL -f SCRIPT/DB/schema_notary_accounts.sql

create extension if not exists pgcrypto;

create table if not exists notai.notary_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text,
  google_sub text,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table notai.notary_accounts alter column password_hash drop not null;
alter table notai.notary_accounts add column if not exists google_sub text;

create unique index if not exists notary_accounts_email_unique
  on notai.notary_accounts (lower(email));

create unique index if not exists notary_accounts_google_sub_unique
  on notai.notary_accounts (google_sub)
  where google_sub is not null;

comment on table notai.notary_accounts is 'Credenziali area notai (email+password e/o Google). Sessione cookie su email.';
