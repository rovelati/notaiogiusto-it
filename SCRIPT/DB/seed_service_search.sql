-- Canoniche reversibili: i record legacy restano nel DB ma non sono pubblici.
with mappings(alias_slug, canonical_slug) as (
  values
    ('atto-di-donazione', 'donazione'),
    ('eredita', 'successione-ereditaria'),
    ('pratica-di-successione', 'successione-ereditaria'),
    ('mutuo-ipotecario', 'mutuo'),
    ('procura-generale-speciale', 'procura')
)
update notai.services_taxonomy alias
set canonical_service_id = canonical.id,
    record_kind = 'alias',
    is_searchable = false,
    updated_at = now()
from mappings m
join notai.services_taxonomy canonical on canonical.slug = m.canonical_slug
where alias.slug = m.alias_slug;

update notai.services_taxonomy
set record_kind = 'hub',
    is_searchable = false,
    updated_at = now()
where slug in ('atti-di-famiglia', 'diritto-di-famiglia', 'diritto-societario', 'societa-e-imprese')
  and canonical_service_id is null;

-- Le prestazioni societarie erano state appiattite sulla stessa label.
update notai.services_taxonomy
set plain_language_name = case slug
      when 'cessione-quote' then 'Cessione quote societarie'
      when 'costituzione-spa' then 'Costituzione SPA'
      when 'costituzione-srl' then 'Costituzione SRL'
      when 'fusioni-e-scissioni' then 'Fusioni e scissioni'
      when 'modifiche-statutarie' then 'Modifiche statutarie'
      when 'startup-innovativa' then 'Startup innovativa'
      else plain_language_name
    end,
    updated_at = now()
where slug in (
  'cessione-quote', 'costituzione-spa', 'costituzione-srl',
  'fusioni-e-scissioni', 'modifiche-statutarie', 'startup-innovativa'
);

-- Importa gli array synonyms già presenti, sempre sul servizio canonico.
insert into notai.service_search_terms (
  service_id, term, normalized_term, term_type, weight, source
)
select distinct on (
  coalesce(st.canonical_service_id, st.id),
  notai.normalize_service_search_term(synonym)
)
  coalesce(st.canonical_service_id, st.id),
  synonym,
  notai.normalize_service_search_term(synonym),
  'alias',
  90,
  'legacy_synonyms'
from notai.services_taxonomy st
cross join lateral unnest(st.synonyms) synonym
where nullif(notai.normalize_service_search_term(synonym), '') is not null
order by
  coalesce(st.canonical_service_id, st.id),
  notai.normalize_service_search_term(synonym),
  synonym
on conflict (service_id, term_type, normalized_term)
do update set term = excluded.term, weight = greatest(notai.service_search_terms.weight, excluded.weight),
              active = true, updated_at = now();

-- Anche nome e slug dei record legacy diventano alias del record canonico.
insert into notai.service_search_terms (
  service_id, term, normalized_term, term_type, weight, source
)
select distinct on (canonical_service_id, notai.normalize_service_search_term(term))
  canonical_service_id, term, notai.normalize_service_search_term(term), 'alias', 90, 'canonical_migration'
from notai.services_taxonomy
cross join lateral (
  values (name), (replace(slug, '-', ' ')), (coalesce(plain_language_name, ''))
) legacy(term)
where canonical_service_id is not null
  and nullif(notai.normalize_service_search_term(term), '') is not null
order by canonical_service_id, notai.normalize_service_search_term(term), term
on conflict (service_id, term_type, normalized_term)
do update set weight = greatest(notai.service_search_terms.weight, excluded.weight),
              active = true, updated_at = now();

with terms(slug, term, term_type, weight) as (
  values
    -- Donazione
    ('donazione', 'donazioni', 'alias', 90),
    ('donazione', 'atto di donazione', 'alias', 90),
    ('donazione', 'fare una donazione', 'alias', 90),
    ('donazione', 'donare', 'boost', 95),
    ('donazione', 'donare casa', 'alias', 90),
    ('donazione', 'donazione casa', 'alias', 90),
    ('donazione', 'donazione immobile', 'alias', 90),
    ('donazione', 'donazione immobiliare', 'alias', 90),
    ('donazione', 'donazione di immobile', 'alias', 90),
    ('donazione', 'donazione appartamento', 'alias', 90),
    ('donazione', 'donazione terreno', 'alias', 90),
    ('donazione', 'donazione denaro', 'alias', 90),
    ('donazione', 'donazione soldi', 'alias', 90),
    ('donazione', 'donazione beni', 'alias', 90),
    ('donazione', 'donazione ai figli', 'alias', 90),
    ('donazione', 'donazione al figlio', 'alias', 90),
    ('donazione', 'donazione tra genitori e figli', 'alias', 90),
    ('donazione', 'donazione tra parenti', 'alias', 90),
    ('donazione', 'donazione tra familiari', 'alias', 90),
    ('donazione', 'donazione tra coniugi', 'alias', 90),
    ('donazione', 'donazione con usufrutto', 'alias', 90),
    ('donazione', 'donazione con riserva di usufrutto', 'alias', 90),
    ('donazione', 'donazione nuda proprietà', 'alias', 90),
    ('donazione', 'passaggio casa ai figli', 'intent', 60),
    ('donazione', 'intestare casa al figlio', 'intent', 60),
    ('donazione', 'intestare casa ai figli', 'intent', 60),
    ('donazione', 'intestare immobile ai figli', 'intent', 60),
    ('donazione', 'trasferire casa gratuitamente', 'intent', 60),
    ('donazione', 'cedere casa gratuitamente', 'intent', 60),
    ('donazione', 'regalare casa a un figlio', 'intent', 60),
    ('donazione', 'anticipare eredità', 'intent', 60),
    ('donazione', 'anticipo eredità', 'intent', 60),
    ('donazione', 'quanto costa donare una casa', 'intent', 60),
    ('donazione', 'quanto costa una donazione dal notaio', 'intent', 60),
    ('donazione', 'notaio per donazione casa', 'intent', 60),
    ('donazione', 'donare casa a mio figlio', 'intent', 60),
    ('donazione', 'dare la casa ai figli mantenendo usufrutto', 'intent', 60),
    ('donazione', 'dare la casa a mio figlio continuando a viverci', 'intent', 60),
    ('donazione', 'passare casa ai figli quando sono ancora vivo', 'intent', 60),
    ('donazione', 'donare nuda proprietà ai figli', 'intent', 60),
    ('donazione', 'tasse donazione casa', 'intent', 60),
    ('donazione', 'costo atto di donazione', 'intent', 60),

    -- Usufrutto e nuda proprietà
    ('usufrutto-e-nuda-proprieta', 'usufrutto', 'boost', 95),
    ('usufrutto-e-nuda-proprieta', 'diritto di usufrutto', 'alias', 90),
    ('usufrutto-e-nuda-proprieta', 'costituzione usufrutto', 'alias', 90),
    ('usufrutto-e-nuda-proprieta', 'riserva di usufrutto', 'alias', 90),
    ('usufrutto-e-nuda-proprieta', 'usufrutto vitalizio', 'alias', 90),
    ('usufrutto-e-nuda-proprieta', 'usufrutto casa', 'alias', 90),
    ('usufrutto-e-nuda-proprieta', 'usufrutto immobile', 'alias', 90),
    ('usufrutto-e-nuda-proprieta', 'cessione usufrutto', 'alias', 90),
    ('usufrutto-e-nuda-proprieta', 'vendita usufrutto', 'alias', 90),
    ('usufrutto-e-nuda-proprieta', 'donazione usufrutto', 'alias', 90),
    ('usufrutto-e-nuda-proprieta', 'nuda proprietà', 'boost', 95),
    ('usufrutto-e-nuda-proprieta', 'nuda proprieta', 'alias', 90),
    ('usufrutto-e-nuda-proprieta', 'vendita nuda proprietà', 'alias', 90),
    ('usufrutto-e-nuda-proprieta', 'acquisto nuda proprietà', 'alias', 90),
    ('usufrutto-e-nuda-proprieta', 'donazione nuda proprietà', 'alias', 90),
    ('usufrutto-e-nuda-proprieta', 'donazione casa mantenendo usufrutto', 'intent', 60),
    ('usufrutto-e-nuda-proprieta', 'dare casa ai figli mantenendo usufrutto', 'intent', 60),
    ('usufrutto-e-nuda-proprieta', 'intestare casa ai figli mantenendo usufrutto', 'intent', 60),
    ('usufrutto-e-nuda-proprieta', 'continuare a vivere nella casa', 'intent', 60),
    ('usufrutto-e-nuda-proprieta', 'continuare a viverci', 'intent', 60),
    ('usufrutto-e-nuda-proprieta', 'nudo proprietario', 'alias', 90),
    ('usufrutto-e-nuda-proprieta', 'usufruttuario', 'alias', 90),
    ('usufrutto-e-nuda-proprieta', 'quanto costa fare usufrutto dal notaio', 'intent', 60),
    ('usufrutto-e-nuda-proprieta', 'notaio per usufrutto', 'intent', 60),
    ('usufrutto-e-nuda-proprieta', 'posso donare la casa mantenendo usufrutto', 'intent', 60),
    ('usufrutto-e-nuda-proprieta', 'vendere nuda proprietà', 'intent', 60),
    ('usufrutto-e-nuda-proprieta', 'rinunciare usufrutto', 'intent', 60),
    ('usufrutto-e-nuda-proprieta', 'rinuncia usufrutto', 'alias', 90),
    ('usufrutto-e-nuda-proprieta', 'togliere usufrutto', 'intent', 60),
    ('usufrutto-e-nuda-proprieta', 'estinzione usufrutto', 'alias', 90),
    ('usufrutto-e-nuda-proprieta', 'cancellazione usufrutto', 'alias', 90),

    -- Immobiliare
    ('compravendita-immobiliare', 'rogito', 'boost', 95),
    ('compravendita-immobiliare', 'rogito notarile', 'alias', 90),
    ('compravendita-immobiliare', 'rogito casa', 'alias', 90),
    ('compravendita-immobiliare', 'atto di compravendita', 'alias', 90),
    ('compravendita-immobiliare', 'compravendita', 'alias', 90),
    ('compravendita-immobiliare', 'acquisto casa', 'alias', 90),
    ('compravendita-immobiliare', 'comprare casa', 'intent', 60),
    ('compravendita-immobiliare', 'vendita casa', 'alias', 90),
    ('compravendita-immobiliare', 'vendere casa', 'intent', 60),
    ('compravendita-immobiliare', 'atto di vendita', 'alias', 90),
    ('compravendita-immobiliare', 'passaggio di proprietà casa', 'alias', 90),
    ('compravendita-immobiliare', 'trasferimento proprietà immobile', 'alias', 90),
    ('preliminare-compravendita', 'compromesso', 'boost', 95),
    ('preliminare-compravendita', 'compromesso casa', 'alias', 90),
    ('preliminare-compravendita', 'preliminare', 'boost', 95),
    ('preliminare-compravendita', 'preliminare di vendita', 'alias', 90),
    ('preliminare-compravendita', 'contratto preliminare', 'alias', 90),
    ('preliminare-compravendita', 'promessa di vendita', 'alias', 90),
    ('trascrizione-preliminare', 'trascrivere preliminare', 'intent', 60),
    ('mutuo', 'mutuo casa', 'alias', 90),
    ('mutuo', 'atto di mutuo', 'alias', 90),
    ('mutuo', 'mutuo ipotecario', 'alias', 90),
    ('mutuo', 'stipula mutuo', 'alias', 90),
    ('mutuo', 'notaio per mutuo', 'intent', 60),
    ('mutuo', 'finanziamento ipotecario', 'alias', 90),
    ('cancellazione-ipoteca', 'cancellare ipoteca', 'alias', 90),
    ('cancellazione-ipoteca', 'togliere ipoteca', 'intent', 60),
    ('cancellazione-ipoteca', 'estinzione ipoteca', 'alias', 90),
    ('cancellazione-ipoteca', 'ipoteca mutuo estinto', 'intent', 60),
    ('costituzione-servitu', 'servitù di passaggio', 'alias', 90),
    ('costituzione-servitu', 'diritto di passaggio', 'intent', 60),
    ('divisione-immobiliare', 'divisione immobile', 'alias', 90),
    ('divisione-immobiliare', 'scioglimento comunione immobiliare', 'alias', 90),
    ('permuta-immobiliare', 'permuta', 'alias', 90),
    ('permuta-immobiliare', 'scambio immobili', 'alias', 90),
    ('vendita-terreno', 'acquisto terreno', 'alias', 90),
    ('vendita-terreno', 'rogito terreno', 'alias', 90),
    ('vendita-box-garage', 'acquisto box', 'alias', 90),
    ('vendita-box-garage', 'vendita garage', 'alias', 90),
    ('vendita-box-garage', 'posto auto', 'alias', 90),

    -- Successioni e famiglia
    ('successione-ereditaria', 'successione', 'boost', 95),
    ('successione-ereditaria', 'successione ereditaria', 'alias', 90),
    ('successione-ereditaria', 'eredità', 'alias', 90),
    ('successione-ereditaria', 'eredita', 'alias', 90),
    ('successione-ereditaria', 'pratica di successione', 'alias', 90),
    ('successione-ereditaria', 'dichiarazione di successione', 'alias', 90),
    ('successione-ereditaria', 'successione dopo decesso', 'intent', 60),
    ('successione-ereditaria', 'ereditare casa', 'intent', 60),
    ('successione-ereditaria', 'successione con immobili', 'alias', 90),
    ('accettazione-eredita', 'accettare eredità', 'intent', 60),
    ('accettazione-eredita', 'accettazione dell eredità', 'alias', 90),
    ('accettazione-eredita', 'trascrizione accettazione eredità', 'alias', 90),
    ('rinuncia-eredita', 'rinunciare all eredità', 'intent', 60),
    ('rinuncia-eredita', 'rifiutare eredità', 'intent', 60),
    ('rinuncia-eredita', 'non accettare eredità', 'intent', 60),
    ('divisione-ereditaria', 'dividere eredità', 'intent', 60),
    ('divisione-ereditaria', 'spartire eredità', 'intent', 60),
    ('divisione-ereditaria', 'divisione tra eredi', 'alias', 90),
    ('testamento', 'fare testamento', 'intent', 60),
    ('testamento', 'scrivere testamento', 'intent', 60),
    ('testamento', 'testamento dal notaio', 'alias', 90),
    ('testamento', 'ultime volontà', 'alias', 90),
    ('testamento', 'lasciare eredità', 'intent', 60),
    ('separazione-dei-beni', 'separazione beni', 'alias', 90),
    ('separazione-dei-beni', 'cambiare da comunione a separazione', 'intent', 60),
    ('patti-convivenza', 'contratto convivenza', 'alias', 90),
    ('patti-convivenza', 'accordo conviventi', 'alias', 90),
    ('fondo-patrimoniale', 'protezione patrimonio familiare', 'intent', 60),
    ('patto-di-famiglia', 'passaggio generazionale', 'alias', 90),
    ('fondo-speciale-disabile', 'dopo di noi', 'alias', 90),
    ('fondo-speciale-disabile', 'legge dopo di noi', 'alias', 90),

    -- Procure, autentiche e atti
    ('procura', 'procura notarile', 'alias', 90),
    ('procura', 'fare una procura', 'intent', 60),
    ('procura', 'delega notarile', 'alias', 90),
    ('procura', 'delega', 'alias', 90),
    ('procura', 'procura speciale', 'alias', 90),
    ('procura', 'procura generale', 'alias', 90),
    ('procura', 'procura a vendere', 'alias', 90),
    ('procura', 'procura a comprare', 'alias', 90),
    ('procura', 'procura per rogito', 'alias', 90),
    ('procura', 'procura dall estero', 'alias', 90),
    ('autenticazione-firme', 'autentica firma', 'alias', 90),
    ('autenticazione-firme', 'autenticare firma', 'intent', 60),
    ('autenticazione-firme', 'firma autenticata', 'alias', 90),
    ('autenticazione-firme', 'firma dal notaio', 'intent', 60),
    ('autentica-copia', 'autentica copia', 'alias', 90),
    ('autentica-copia', 'autenticare documento', 'intent', 60),
    ('copia-conforme', 'copia autenticata', 'alias', 90),
    ('copia-conforme', 'copia conforme all originale', 'alias', 90),
    ('copia-conforme', 'certificare copia', 'intent', 60),
    ('atto-di-riconoscimento-debito', 'ricognizione debito', 'alias', 90),
    ('atto-di-riconoscimento-debito', 'dichiarazione di debito', 'alias', 90),

    -- Società e impresa
    ('costituzione-srl', 'aprire società', 'intent', 60),
    ('costituzione-srl', 'aprire una società', 'intent', 60),
    ('costituzione-srl', 'costituire società', 'alias', 90),
    ('costituzione-srl', 'aprire srl', 'alias', 90),
    ('costituzione-srl', 'creare srl', 'alias', 90),
    ('costituzione-srl', 'fare una srl', 'intent', 60),
    ('costituzione-srl', 'costo srl', 'intent', 60),
    ('costituzione-srl', 'notaio srl', 'intent', 60),
    ('costituzione-spa', 'costituzione spa', 'alias', 90),
    ('costituzione-cooperativa', 'aprire cooperativa', 'intent', 60),
    ('cessione-quote', 'cessione quote', 'boost', 95),
    ('cessione-quote', 'vendita quote', 'alias', 90),
    ('cessione-quote', 'trasferimento quote', 'alias', 90),
    ('cessione-quote', 'cessione quote srl', 'alias', 90),
    ('cessione-quote', 'vendere quote srl', 'intent', 60),
    ('cessione-quote', 'passaggio quote societarie', 'alias', 90),
    ('modifiche-statutarie', 'modifica statuto', 'alias', 90),
    ('modifiche-statutarie', 'modifica statuto srl', 'alias', 90),
    ('modifiche-statutarie', 'cambiare statuto srl', 'intent', 60),
    ('modifiche-statutarie', 'modifica oggetto sociale', 'alias', 90),
    ('aumento-capitale', 'ricapitalizzazione', 'alias', 90),
    ('trasformazione-societaria', 'cambiare tipo di società', 'intent', 60),
    ('liquidazione-societa', 'chiusura società', 'intent', 60),
    ('liquidazione-societa', 'sciogliere società', 'intent', 60),
    ('verbale-assemblea', 'assemblea straordinaria', 'alias', 90),
    ('cessione-azienda', 'vendita azienda', 'alias', 90),
    ('cessione-azienda', 'vendere azienda', 'intent', 60),
    ('cessione-azienda', 'cessione ramo azienda', 'alias', 90),
    ('affitto-azienda', 'affitto d azienda', 'alias', 90),
    ('affitto-azienda', 'affitto ramo d azienda', 'alias', 90)
)
insert into notai.service_search_terms (
  service_id, term, normalized_term, term_type, weight, source
)
select distinct on (st.id, t.term_type, notai.normalize_service_search_term(t.term))
  st.id, t.term, notai.normalize_service_search_term(t.term), t.term_type, t.weight, 'p0_spec_2026'
from terms t
join notai.services_taxonomy st on st.slug = t.slug
where st.canonical_service_id is null
  and nullif(notai.normalize_service_search_term(t.term), '') is not null
order by
  st.id,
  t.term_type,
  notai.normalize_service_search_term(t.term),
  t.weight desc,
  t.term
on conflict (service_id, term_type, normalized_term)
do update set term = excluded.term, weight = excluded.weight, source = excluded.source,
              active = true, updated_at = now();

with relations(source_slug, target_slug, relation_type, weight) as (
  values
    ('donazione', 'usufrutto-e-nuda-proprieta', 'also_consider', 18),
    ('donazione', 'successione-ereditaria', 'related', 10),
    ('donazione', 'testamento', 'related', 10),
    ('donazione', 'divisione-ereditaria', 'related', 10),
    ('donazione', 'patto-di-famiglia', 'related', 10),
    ('usufrutto-e-nuda-proprieta', 'donazione', 'also_consider', 18),
    ('successione-ereditaria', 'accettazione-eredita', 'specialization', 12),
    ('successione-ereditaria', 'rinuncia-eredita', 'specialization', 12),
    ('successione-ereditaria', 'divisione-ereditaria', 'specialization', 12),
    ('successione-ereditaria', 'testamento', 'related', 10),
    ('compravendita-immobiliare', 'acquisto-prima-casa', 'specialization', 12),
    ('compravendita-immobiliare', 'acquisto-seconda-casa', 'specialization', 12),
    ('compravendita-immobiliare', 'acquisto-casa-con-mutuo', 'specialization', 12),
    ('preliminare-compravendita', 'trascrizione-preliminare', 'also_consider', 14),
    ('mutuo', 'acquisto-casa-con-mutuo', 'related', 10),
    ('costituzione-srl', 'cessione-quote', 'related', 10),
    ('costituzione-srl', 'modifiche-statutarie', 'related', 10)
)
insert into notai.service_relations (service_id, related_service_id, relation_type, weight)
select source.id, target.id, r.relation_type, r.weight
from relations r
join notai.services_taxonomy source on source.slug = r.source_slug
join notai.services_taxonomy target on target.slug = r.target_slug
on conflict (service_id, related_service_id, relation_type)
do update set weight = excluded.weight;
