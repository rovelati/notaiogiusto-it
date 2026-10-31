begin;

do $$
begin
  if exists (
    select 1
    from notai.notaries
    where nullif(trim(source_slug), '') is not null
    group by lower(source_slug)
    having count(*) > 1
  ) then
    raise exception 'Normalizzazione annullata: esistono source_slug duplicati senza distinzione maiuscole/minuscole';
  end if;
end
$$;

create table if not exists notai.notary_slug_case_backup_20261011 as
select id, source_slug
from notai.notaries
where source_slug is not null
  and source_slug <> lower(source_slug);

update notai.notaries
set source_slug = lower(source_slug)
where source_slug is not null
  and source_slug <> lower(source_slug);

commit;
