-- Contenuti editoriali editabili per pagine /quanto-costa/[servizio]
alter table notai.services_taxonomy
  add column if not exists html_content text,
  add column if not exists image_url text,
  add column if not exists content_status text not null default 'draft',
  add column if not exists content_generated_at timestamptz,
  add column if not exists content_updated_by text;

comment on column notai.services_taxonomy.html_content is 'HTML editoriale lungo stile veterinari.org (editabile)';
comment on column notai.services_taxonomy.image_url is 'Immagine hero della prestazione (path pubblico o URL)';
comment on column notai.services_taxonomy.content_status is 'draft | generated | reviewed | published';
