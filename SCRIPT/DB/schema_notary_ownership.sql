-- Ownership / claim edit flow (stile veterinari.org)
-- Run on DB: psql $DATABASE_URL -f SCRIPT/DB/schema_notary_ownership.sql

alter table notai.notaries
  add column if not exists owner_email text,
  add column if not exists claimed_at timestamptz,
  add column if not exists profile_status text;

comment on column notai.notaries.owner_email is 'Email del gestore scheda (claim). Una scheda = un owner.';
comment on column notai.notaries.profile_status is 'null | in_revisione | verified | suspended';

create unique index if not exists notaries_owner_email_unique
  on notai.notaries (lower(owner_email))
  where owner_email is not null and coalesce(owner_email, '') <> '';

create index if not exists notaries_owner_email_idx
  on notai.notaries (lower(owner_email))
  where owner_email is not null;
