create extension if not exists unaccent;

alter table notai.services_taxonomy
  add column if not exists canonical_service_id uuid references notai.services_taxonomy(id) on delete restrict,
  add column if not exists record_kind text not null default 'service',
  add column if not exists is_searchable boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'services_taxonomy_record_kind_check'
      and conrelid = 'notai.services_taxonomy'::regclass
  ) then
    alter table notai.services_taxonomy
      add constraint services_taxonomy_record_kind_check
      check (record_kind in ('service', 'alias', 'hub'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'services_taxonomy_canonical_not_self'
      and conrelid = 'notai.services_taxonomy'::regclass
  ) then
    alter table notai.services_taxonomy
      add constraint services_taxonomy_canonical_not_self
      check (canonical_service_id is null or canonical_service_id <> id);
  end if;
end
$$;

create index if not exists services_taxonomy_canonical_idx
  on notai.services_taxonomy (canonical_service_id)
  where canonical_service_id is not null;

create index if not exists services_taxonomy_searchable_idx
  on notai.services_taxonomy (priority, name)
  where is_searchable and canonical_service_id is null;

create or replace function notai.validate_service_canonical_target()
returns trigger
language plpgsql
as $$
declare
  target_canonical_id uuid;
begin
  if new.canonical_service_id is null then
    return new;
  end if;
  select canonical_service_id
  into target_canonical_id
  from notai.services_taxonomy
  where id = new.canonical_service_id;
  if not found then
    raise exception 'Canonical service % does not exist', new.canonical_service_id;
  end if;
  if target_canonical_id is not null then
    raise exception 'Canonical chains are not allowed: target % is itself an alias', new.canonical_service_id;
  end if;
  return new;
end
$$;

drop trigger if exists validate_service_canonical_target on notai.services_taxonomy;
create constraint trigger validate_service_canonical_target
after insert or update of canonical_service_id on notai.services_taxonomy
deferrable initially deferred
for each row execute function notai.validate_service_canonical_target();

create or replace function notai.normalize_service_search_term(value text)
returns text
language sql
immutable
parallel safe
as $$
  select trim(
    regexp_replace(
      regexp_replace(
        lower(
          translate(
            coalesce(value, ''),
            'àáâäãåèéêëìíîïòóôöõùúûüýÿçñ',
            'aaaaaaeeeeiiiiooooouuuuyycn'
          )
        ),
        '[''’`´]',
        ' ',
        'g'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  )
$$;

create table if not exists notai.service_search_terms (
  id bigserial primary key,
  service_id uuid not null references notai.services_taxonomy(id) on delete cascade,
  term text not null,
  normalized_term text not null,
  term_type text not null default 'alias',
  weight integer not null default 90,
  source text not null default 'manual',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (term_type in ('alias', 'intent', 'boost')),
  check (weight between 1 and 100),
  check (normalized_term <> '')
);

create unique index if not exists service_search_terms_unique
  on notai.service_search_terms (service_id, term_type, normalized_term);

create index if not exists service_search_terms_normalized_idx
  on notai.service_search_terms (normalized_term)
  where active;

create table if not exists notai.service_relations (
  service_id uuid not null references notai.services_taxonomy(id) on delete cascade,
  related_service_id uuid not null references notai.services_taxonomy(id) on delete cascade,
  relation_type text not null default 'related',
  weight integer not null default 10,
  created_at timestamptz not null default now(),
  primary key (service_id, related_service_id, relation_type),
  check (service_id <> related_service_id),
  check (relation_type in ('related', 'also_consider', 'specialization')),
  check (weight between 1 and 100)
);

drop trigger if exists set_service_search_terms_updated_at on notai.service_search_terms;
create trigger set_service_search_terms_updated_at
before update on notai.service_search_terms
for each row execute function notai.set_updated_at();

comment on column notai.services_taxonomy.canonical_service_id is
  'Per record alias: servizio canonico pubblico. Il record resta conservato per compatibilita e audit.';
comment on column notai.services_taxonomy.record_kind is
  'service = prestazione canonica, alias = record legacy con redirect, hub = categoria non selezionabile.';
comment on table notai.service_search_terms is
  'Sinonimi, frasi-intento e termini boost usati dalla ricerca interna; non generano URL SEO.';
comment on table notai.service_relations is
  'Relazioni semantiche tra prestazioni canoniche per risultati secondari e cross-link.';
