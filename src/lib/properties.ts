import { query } from './db';

export const PROPERTY_USE_CASES = [
  { id: '730', label: '730 / dichiarazione redditi' },
  { id: 'imu_tari', label: 'IMU / TARI' },
  { id: 'acquisto_vendita', label: 'Compravendita' },
  { id: 'mutuo', label: 'Mutuo / ipoteca' },
  { id: 'successione', label: 'Successione' },
  { id: 'donazione', label: 'Donazione' },
  { id: 'locazione', label: 'Locazione' },
  { id: 'altro', label: 'Altre pratiche' },
] as const;

export const CATASTO_RECOVERY_LINKS = [
  {
    title: 'Area riservata Agenzia delle Entrate',
    url: 'https://www.agenziaentrate.gov.it/portale/area-riservata',
    note: 'Accesso con SPID, CIE o CNS per i servizi online del contribuente.',
  },
  {
    title: 'Fabbricati e terreni (servizi AdE)',
    url: 'https://www.agenziaentrate.gov.it/portale/web/guest/schede/fabbricatiterreni',
    note: 'Sezione ufficiale per visure, consultazioni e adempimenti sugli immobili.',
  },
  {
    title: 'Visura catastale – informazioni',
    url: 'https://www.agenziaentrate.gov.it/portale/web/guest/schede/fabbricatiterreni/visura-catastale/infogen-visura-catastale',
    note: 'Guida alla richiesta/consultazione della visura catastale.',
  },
  {
    title: 'Consultazione banche dati Sister',
    url: 'https://www.agenziaentrate.gov.it/portale/schede/fabbricatiterreni/banche-dati-sister/scheda-informativa-banche-dati-sister',
    note: 'Canale telematico (spesso per professionisti/convenzionati). Non è un accesso automatico da NotaioGiusto.',
  },
] as const;

export type ClientProperty = {
  id: string;
  owner_email: string;
  nickname: string;
  address: string | null;
  comune: string | null;
  province: string | null;
  cap: string | null;
  foglio: string | null;
  particella: string | null;
  subalterno: string | null;
  sezione: string | null;
  categoria_catastale: string | null;
  rendita_catastale: string | null;
  quota_possesso: string | null;
  titolo_provenienza: string | null;
  notes: string | null;
  data_source: string;
  usable_for: string[] | null;
  shareable: boolean;
  status: string;
  created_at: string;
  updated_at: string;
};

function normalizeUseCases(values: string[]) {
  const allowed = new Set(PROPERTY_USE_CASES.map((item) => item.id));
  return [...new Set(values.map((value) => value.trim()).filter((value) => allowed.has(value)))];
}

export async function listClientProperties(email: string) {
  return query<ClientProperty>(
    `
    select id, owner_email, nickname, address, comune, province, cap,
           foglio, particella, subalterno, sezione, categoria_catastale,
           rendita_catastale::text, quota_possesso, titolo_provenienza, notes,
           data_source, usable_for, shareable, status,
           created_at::text, updated_at::text
    from notai.client_properties
    where lower(owner_email) = lower($1) and status = 'active'
    order by updated_at desc, nickname asc
    `,
    [email.trim().toLowerCase()],
  );
}

export async function listShareableClientProperties(email: string) {
  return query<ClientProperty>(
    `
    select id, owner_email, nickname, address, comune, province, cap,
           foglio, particella, subalterno, sezione, categoria_catastale,
           rendita_catastale::text, quota_possesso, titolo_provenienza, notes,
           data_source, usable_for, shareable, status,
           created_at::text, updated_at::text
    from notai.client_properties
    where lower(owner_email) = lower($1)
      and status = 'active'
      and shareable = true
    order by nickname asc
    `,
    [email.trim().toLowerCase()],
  );
}

export async function getClientProperty(id: string, email: string) {
  const rows = await query<ClientProperty>(
    `
    select id, owner_email, nickname, address, comune, province, cap,
           foglio, particella, subalterno, sezione, categoria_catastale,
           rendita_catastale::text, quota_possesso, titolo_provenienza, notes,
           data_source, usable_for, shareable, status,
           created_at::text, updated_at::text
    from notai.client_properties
    where id = $1 and lower(owner_email) = lower($2) and status = 'active'
    limit 1
    `,
    [id, email.trim().toLowerCase()],
  );
  return rows[0] || null;
}

export type PropertyInput = {
  nickname: string;
  address?: string;
  comune?: string;
  province?: string;
  cap?: string;
  foglio?: string;
  particella?: string;
  subalterno?: string;
  sezione?: string;
  categoria_catastale?: string;
  rendita_catastale?: string;
  quota_possesso?: string;
  titolo_provenienza?: string;
  notes?: string;
  usable_for?: string[];
  shareable?: boolean;
};

export async function createClientProperty(email: string, input: PropertyInput) {
  const usableFor = normalizeUseCases(input.usable_for || []);
  const rendita = input.rendita_catastale?.trim() ? Number(input.rendita_catastale.replace(',', '.')) : null;
  const rows = await query<{ id: string }>(
    `
    insert into notai.client_properties (
      owner_email, nickname, address, comune, province, cap,
      foglio, particella, subalterno, sezione, categoria_catastale,
      rendita_catastale, quota_possesso, titolo_provenienza, notes,
      data_source, usable_for, shareable
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'manual',$16,$17)
    returning id
    `,
    [
      email.trim().toLowerCase(),
      input.nickname.trim(),
      input.address?.trim() || null,
      input.comune?.trim() || null,
      input.province?.trim() || null,
      input.cap?.trim() || null,
      input.foglio?.trim() || null,
      input.particella?.trim() || null,
      input.subalterno?.trim() || null,
      input.sezione?.trim() || null,
      input.categoria_catastale?.trim() || null,
      Number.isFinite(rendita as number) ? rendita : null,
      input.quota_possesso?.trim() || null,
      input.titolo_provenienza?.trim() || null,
      input.notes?.trim() || null,
      usableFor,
      input.shareable !== false,
    ],
  );
  return rows[0]?.id || null;
}

export async function updateClientProperty(id: string, email: string, input: PropertyInput) {
  const usableFor = normalizeUseCases(input.usable_for || []);
  const rendita = input.rendita_catastale?.trim() ? Number(input.rendita_catastale.replace(',', '.')) : null;
  const rows = await query<{ id: string }>(
    `
    update notai.client_properties
    set nickname = $3,
        address = $4,
        comune = $5,
        province = $6,
        cap = $7,
        foglio = $8,
        particella = $9,
        subalterno = $10,
        sezione = $11,
        categoria_catastale = $12,
        rendita_catastale = $13,
        quota_possesso = $14,
        titolo_provenienza = $15,
        notes = $16,
        usable_for = $17,
        shareable = $18,
        updated_at = now()
    where id = $1 and lower(owner_email) = lower($2) and status = 'active'
    returning id
    `,
    [
      id,
      email.trim().toLowerCase(),
      input.nickname.trim(),
      input.address?.trim() || null,
      input.comune?.trim() || null,
      input.province?.trim() || null,
      input.cap?.trim() || null,
      input.foglio?.trim() || null,
      input.particella?.trim() || null,
      input.subalterno?.trim() || null,
      input.sezione?.trim() || null,
      input.categoria_catastale?.trim() || null,
      Number.isFinite(rendita as number) ? rendita : null,
      input.quota_possesso?.trim() || null,
      input.titolo_provenienza?.trim() || null,
      input.notes?.trim() || null,
      usableFor,
      input.shareable !== false,
    ],
  );
  return rows[0]?.id || null;
}

export async function archiveClientProperty(id: string, email: string) {
  const rows = await query<{ id: string }>(
    `
    update notai.client_properties
    set status = 'archived', updated_at = now()
    where id = $1 and lower(owner_email) = lower($2) and status = 'active'
    returning id
    `,
    [id, email.trim().toLowerCase()],
  );
  return Boolean(rows[0]?.id);
}

export async function getPropertiesByIdsForEmail(ids: string[], email: string) {
  const cleanIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!cleanIds.length) return [] as ClientProperty[];
  return query<ClientProperty>(
    `
    select id, owner_email, nickname, address, comune, province, cap,
           foglio, particella, subalterno, sezione, categoria_catastale,
           rendita_catastale::text, quota_possesso, titolo_provenienza, notes,
           data_source, usable_for, shareable, status,
           created_at::text, updated_at::text
    from notai.client_properties
    where lower(owner_email) = lower($1)
      and status = 'active'
      and shareable = true
      and id = any($2::uuid[])
    order by nickname asc
    `,
    [email.trim().toLowerCase(), cleanIds],
  );
}

export async function linkPropertiesToQuoteRequest(quoteRequestId: string, propertyIds: string[]) {
  for (const propertyId of propertyIds.slice(0, 10)) {
    await query(
      `
      insert into notai.quote_request_properties (quote_request_id, property_id)
      values ($1, $2)
      on conflict do nothing
      `,
      [quoteRequestId, propertyId],
    );
  }
}

export async function listPropertiesForQuoteRequest(quoteRequestId: string) {
  return query<ClientProperty>(
    `
    select p.id, p.owner_email, p.nickname, p.address, p.comune, p.province, p.cap,
           p.foglio, p.particella, p.subalterno, p.sezione, p.categoria_catastale,
           p.rendita_catastale::text, p.quota_possesso, p.titolo_provenienza, p.notes,
           p.data_source, p.usable_for, p.shareable, p.status,
           p.created_at::text, p.updated_at::text
    from notai.quote_request_properties qrp
    join notai.client_properties p on p.id = qrp.property_id
    where qrp.quote_request_id = $1
    order by p.nickname asc
    `,
    [quoteRequestId],
  );
}

export function cadastralSummary(property: ClientProperty) {
  const parts = [
    property.foglio ? `Fg. ${property.foglio}` : null,
    property.particella ? `Part. ${property.particella}` : null,
    property.subalterno ? `Sub. ${property.subalterno}` : null,
    property.sezione ? `Sez. ${property.sezione}` : null,
    property.categoria_catastale ? `Cat. ${property.categoria_catastale}` : null,
  ].filter(Boolean);
  return parts.join(' · ') || 'Dati catastali da completare';
}
