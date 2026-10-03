import { query } from './db';
import {
  SEARCH_RADIUS_STEPS,
  asCoord,
  averageCenter,
  distanceKm,
  geocodeItalianComune,
} from './geo';
import { getSiteUrl } from './site';
import { rankServices, type ServiceSearchTerm } from './service-search';

/** Query generiche che non devono filtrare i cognomi (es. "notai", "studio"). */
const GENERIC_SEARCH_TERMS = new Set([
  'notaio',
  'notai',
  'notaro',
  'notari',
  'studio',
  'studi',
  'studio notarile',
  'studi notarili',
  'cerca',
  'ricerca',
]);

export function isGenericNotaryQuery(raw: string | null | undefined) {
  const value = String(raw || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!value) return true;
  if (GENERIC_SEARCH_TERMS.has(value)) return true;
  // "notaio milano" senza comune separato: troppe generiche
  const parts = value.split(' ').filter(Boolean);
  return parts.length > 0 && parts.every((part) => GENERIC_SEARCH_TERMS.has(part));
}

/** Restituisce il testo utile da usare come filtro cognome/nome, o '' se generico. */
export function meaningfulNotaryQuery(raw: string | null | undefined) {
  return isGenericNotaryQuery(raw) ? '' : String(raw || '').trim();
}

function normalizeServiceNeedle(raw: string | null | undefined) {
  return String(raw || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sinonimi frequenti digitati in “Cosa cerchi?” → slug tassonomia. */
const SERVICE_QUERY_ALIASES: Record<string, string> = {
  'copia conforme': 'copia-conforme',
  'copia conforme all originale': 'copia-conforme',
  'copia autenticata': 'copia-conforme',
  'autentica di copia': 'autentica-copia',
  'autentica copia': 'autentica-copia',
  'successione': 'successione-ereditaria',
  'successione ereditaria': 'successione-ereditaria',
  'eredita': 'successione-ereditaria',
  'compromesso': 'preliminare-compravendita',
  'compromesso casa': 'preliminare-compravendita',
  'preliminare': 'preliminare-compravendita',
  'rogito': 'compravendita-immobiliare',
  'rogito casa': 'compravendita-immobiliare',
  compravendita: 'compravendita-immobiliare',
  'compravendita immobiliare': 'compravendita-immobiliare',
  'compravendita casa': 'compravendita-immobiliare',
  vendita: 'compravendita-immobiliare',
  'vendita casa': 'compravendita-immobiliare',
  'vendita immobile': 'compravendita-immobiliare',
  // Box / garage (voce tassonomia vendita-box-garage)
  box: 'vendita-box-garage',
  garage: 'vendita-box-garage',
  'vendita box': 'vendita-box-garage',
  'vendita garage': 'vendita-box-garage',
  'vendita box garage': 'vendita-box-garage',
  'acquisto box': 'vendita-box-garage',
  'acquisto garage': 'vendita-box-garage',
  'compravendita box': 'vendita-box-garage',
  'compravendita garage': 'vendita-box-garage',
  'rogito box': 'vendita-box-garage',
  'posto auto': 'vendita-box-garage',
  'acquisto casa': 'acquisto-prima-casa',
  'prima casa': 'acquisto-prima-casa',
  mutuo: 'mutuo',
  'mutuo casa': 'mutuo',
  procura: 'procura',
  testamento: 'testamento',
  donazione: 'donazione',
  srl: 'costituzione-srl',
  'costituzione srl': 'costituzione-srl',
  'aprire srl': 'costituzione-srl',
};

/** Token equivalenti in ricerca pratica (compravendita ≈ vendita ≈ acquisto in contesto atto). */
const SERVICE_TOKEN_SYNONYMS: Record<string, string[]> = {
  compravendita: ['vendita', 'acquisto', 'rogito'],
  vendita: ['compravendita', 'acquisto', 'rogito'],
  acquisto: ['compravendita', 'vendita'],
  rogito: ['compravendita', 'vendita'],
  box: ['garage', 'autorimessa'],
  garage: ['box', 'autorimessa'],
  autorimessa: ['box', 'garage'],
};

const SERVICE_STOP_TOKENS = new Set(['di', 'del', 'della', 'dei', 'delle', 'o', 'e', 'un', 'una', 'per', 'con']);

/** Damerau–Levenshtein: gestisce anche trasposizioni (es. confrome → conforme). */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

function maxServiceTypos(needle: string) {
  const n = needle.length;
  if (n < 5) return 0;
  if (n < 10) return 1;
  if (n < 18) return 2;
  return 3;
}

function maxTokenTypos(token: string) {
  const n = token.length;
  if (n < 5) return 0;
  if (n < 9) return 1;
  return 2;
}

function serviceTokens(raw: string) {
  return normalizeServiceNeedle(raw)
    .split(' ')
    .filter((token) => token.length >= 2 && !SERVICE_STOP_TOKENS.has(token));
}

function tokenMatches(queryToken: string, labelToken: string) {
  if (queryToken === labelToken) return true;
  const synonyms = SERVICE_TOKEN_SYNONYMS[queryToken] || [];
  if (synonyms.includes(labelToken)) return true;
  const reverse = SERVICE_TOKEN_SYNONYMS[labelToken] || [];
  if (reverse.includes(queryToken)) return true;
  const allowed = Math.min(maxTokenTypos(queryToken), maxTokenTypos(labelToken));
  return allowed > 0 && editDistance(queryToken, labelToken) <= allowed;
}

/** Varianti needle con sinonimi token (es. compravendita box → vendita box). */
function needleAliasVariants(needle: string) {
  const tokens = serviceTokens(needle);
  if (!tokens.length) return [needle];
  const variants = new Set<string>([needle, tokens.join(' ')]);
  for (let i = 0; i < tokens.length; i++) {
    const syns = SERVICE_TOKEN_SYNONYMS[tokens[i]];
    if (!syns?.length) continue;
    for (const syn of syns) {
      const next = [...tokens];
      next[i] = syn;
      variants.add(next.join(' '));
    }
  }
  return [...variants];
}

function scoreServiceAgainstNeedle(needle: string, service: {
  slug: string;
  name: string;
  plain_language_name: string | null;
}) {
  const slug = normalizeServiceNeedle(service.slug.replace(/-/g, ' '));
  const name = normalizeServiceNeedle(service.name);
  const plain = normalizeServiceNeedle(service.plain_language_name || '');
  const labels = [slug, name, plain].filter(Boolean);
  let score = 0;

  for (const variant of needleAliasVariants(needle)) {
    if (labels.includes(variant)) score = Math.max(score, 100);
    else if (labels.some((label) => label.startsWith(variant) || variant.startsWith(label))) {
      score = Math.max(score, 85);
    } else if (
      variant.length >= 5 &&
      labels.some((label) => label.includes(variant) || variant.includes(label))
    ) {
      score = Math.max(score, 70);
    }
  }

  const qTokens = serviceTokens(needle);
  if (qTokens.length) {
    const labelTokenSets = labels.map((label) => serviceTokens(label));
    let bestCoverage = 0;
    for (const labelTokens of labelTokenSets) {
      if (!labelTokens.length) continue;
      const matched = qTokens.filter((qt) => labelTokens.some((lt) => tokenMatches(qt, lt))).length;
      const coverage = matched / qTokens.length;
      const specificity = matched / Math.max(labelTokens.length, 1);
      bestCoverage = Math.max(bestCoverage, coverage * 40 + specificity * 20 + matched * 8);
    }
    // Richiede almeno un token significativo matchato; multi-token: tutti o quasi
    const minMatched =
      qTokens.length === 1 ? 1 : qTokens.length >= 3 ? qTokens.length - 1 : qTokens.length;
    const anyFullMatch = labelTokenSets.some((labelTokens) => {
      const matched = qTokens.filter((qt) => labelTokens.some((lt) => tokenMatches(qt, lt))).length;
      return matched >= minMatched;
    });
    if (anyFullMatch) score = Math.max(score, Math.round(55 + bestCoverage));
    else if (bestCoverage >= 28) score = Math.max(score, Math.round(40 + bestCoverage / 2));
  }

  return score;
}

/**
 * Se “Cosa cerchi?” è una pratica notarile nota, restituisce il servizio.
 * Altrimenti null (resta ricerca per nome/cognome).
 * Include sinonimi (compravendita≈vendita), alias box/garage e correttore tipografico.
 */
export async function resolveServiceFromQuery(raw: string | null | undefined) {
  const needle = normalizeServiceNeedle(raw);
  if (!needle || isGenericNotaryQuery(needle)) return null;
  const services = await getAllServices();
  const [best] = rankServices(needle, services, 1);
  return best ? getService(best.service.slug) : null;
}

export async function resolveServicesFromQuery(raw: string | null | undefined, limit = 5) {
  const needle = normalizeServiceNeedle(raw);
  if (!needle || isGenericNotaryQuery(needle)) return [];
  return rankServices(needle, await getAllServices(), limit);
}

export type Service = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  plain_language_name: string | null;
  user_intent: string | null;
  seo_title: string | null;
  seo_description: string | null;
  description?: string | null;
  html_content?: string | null;
  image_url?: string | null;
  content_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  content_generated_at?: string | null;
  service_scope: string | null;
  complexity: string | null;
  remote_possible: boolean | null;
  requires_in_person: boolean | null;
  required_documents: unknown[] | null;
  faqs: Array<{ question?: string; answer?: string }> | null;
  price_min_cents: number | null;
  price_avg_cents: number | null;
  price_max_cents: number | null;
  confidence: string | null;
  canonical_service_id?: string | null;
  record_kind?: 'service' | 'alias' | 'hub';
  is_searchable?: boolean;
  requested_slug?: string;
  requested_record_kind?: 'service' | 'alias' | 'hub';
  requested_is_searchable?: boolean;
  search_terms?: ServiceSearchTerm[];
};

export type Notary = {
  id: string;
  source_slug: string;
  full_name: string;
  comune: string | null;
  district: string | null;
  address: string | null;
  cap: string | null;
  phone: string | null;
  email: string | null;
  pec: string | null;
  website: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  official_reference_url: string | null;
  is_official_notariato: boolean;
  declared_service?: boolean;
  declared_match?: 'exact' | 'related' | null;
  service_match_source?: string | null;
};

export type NotaryGoogleProfile = {
  google_maps_url: string | null;
  google_business_status: string | null;
  google_opening_hours: {
    open_now?: boolean | null;
    weekday_text?: string[];
    periods?: Array<{
      open?: { day?: number; time?: string };
      close?: { day?: number; time?: string };
    }>;
  } | null;
  google_photos: Array<{
    reference?: string;
    width?: number;
    height?: number;
    attributions?: string[];
  }> | null;
  rating_avg: number | null;
  review_count: number;
  sentiment_label: string | null;
  sentiment_score: number | null;
  strengths: string[];
  concerns: string[];
  summary: string | null;
  sentiment_payload: {
    sample_count?: number;
    sample_is_partial?: boolean;
    method?: string;
    expires_at?: string;
  } | null;
};

export type NotaryGoogleReview = {
  source_review_id: string | null;
  author_name: string | null;
  rating: number | null;
  text: string | null;
  published_at: string | null;
  payload: {
    author_url?: string;
    profile_photo_url?: string;
    relative_time_description?: string;
  } | null;
};

export type NotaryService = {
  slug: string;
  name: string;
  plain_language_name: string | null;
  category: string | null;
  price_min_cents: number | null;
  price_avg_cents: number | null;
  price_max_cents: number | null;
  source: string | null;
  confidence: string | null;
};

export async function getTopServices(limit = 18) {
  return query<Service>(
    `
    select st.id, st.slug, st.name, st.category, st.plain_language_name, st.user_intent,
           st.seo_title, st.seo_description, st.service_scope, st.complexity,
           st.remote_possible, st.requires_in_person, st.required_documents, st.faqs,
           spb.price_min_cents, spb.price_avg_cents, spb.price_max_cents, spb.confidence
    from notai.services_taxonomy st
    left join lateral (
      select *
      from notai.service_price_benchmarks b
      where b.service_id = st.id and b.location_scope = 'national'
      order by b.confidence desc nulls last, b.updated_at desc
      limit 1
    ) spb on true
    where st.canonical_service_id is null and st.is_searchable
    order by st.priority asc, st.category nulls last, st.name asc
    limit $1
    `,
    [limit],
  );
}

export async function getService(slug: string) {
  const rows = await query<Service>(
    `
    with requested as (
      select *
      from notai.services_taxonomy
      where slug = $1
      limit 1
    )
    select st.id, st.slug, st.name, st.category, st.plain_language_name, st.user_intent,
           st.seo_title, st.seo_description, st.description, st.html_content, st.image_url, st.content_status,
           st.created_at::text, st.updated_at::text, st.content_generated_at::text,
           st.service_scope, st.complexity,
           st.remote_possible, st.requires_in_person, st.required_documents, st.faqs,
           st.canonical_service_id, st.record_kind, st.is_searchable,
           requested.slug as requested_slug,
           requested.record_kind as requested_record_kind,
           requested.is_searchable as requested_is_searchable,
           spb.price_min_cents, spb.price_avg_cents, spb.price_max_cents, spb.confidence
    from requested
    join notai.services_taxonomy st on st.id = coalesce(requested.canonical_service_id, requested.id)
    left join lateral (
      select *
      from notai.service_price_benchmarks b
      where b.service_id = st.id and b.location_scope = 'national'
      order by b.confidence desc nulls last, b.updated_at desc
      limit 1
    ) spb on true
    limit 1
    `,
    [slug],
  );
  return rows[0] || null;
}

export async function getAllServices() {
  return query<
    Pick<
      Service,
      | 'id'
      | 'slug'
      | 'name'
      | 'plain_language_name'
      | 'category'
      | 'user_intent'
      | 'complexity'
      | 'price_avg_cents'
      | 'search_terms'
    >
  >(
    `
    select st.id, st.slug, st.name, st.plain_language_name, st.category, st.user_intent, st.complexity,
           spb.price_avg_cents,
           coalesce(terms.search_terms, '[]'::jsonb) as search_terms
    from notai.services_taxonomy st
    left join lateral (
      select price_avg_cents
      from notai.service_price_benchmarks b
      where b.service_id = st.id and b.location_scope = 'national'
      order by b.confidence desc nulls last
      limit 1
    ) spb on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'term', sst.term,
          'normalized_term', sst.normalized_term,
          'term_type', sst.term_type,
          'weight', sst.weight
        )
        order by sst.weight desc, sst.term
      ) as search_terms
      from notai.service_search_terms sst
      where sst.service_id = st.id and sst.active
    ) terms on true
    where st.canonical_service_id is null and st.is_searchable
    order by st.priority asc, st.name asc
    `,
  );
}

/** Max notaries selectable in a single quote request. */
export const MAX_QUOTE_NOTARIES = 10;

export async function getNotariesByIds(ids: string[]) {
  const cleanIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, MAX_QUOTE_NOTARIES);
  if (!cleanIds.length) return [] as Notary[];
  return query<Notary>(
    `
    select id, source_slug, full_name, comune, district, address, cap, phone, email, pec, website,
           lat, lng, description, official_reference_url, is_official_notariato
    from notai.notaries
    where status = 'published' and id = any($1::uuid[])
    order by full_name asc
    `,
    [cleanIds],
  );
}

export async function getPublishedNotarySlugs(limit = 5000) {
  return query<{ source_slug: string; updated_at: string | null }>(
    `
    select source_slug, updated_at::text
    from notai.notaries
    where status = 'published' and coalesce(source_slug, '') <> ''
    order by updated_at desc nulls last, full_name asc
    limit $1
    `,
    [limit],
  );
}

export type QuoteRequestRow = {
  id: string;
  service_slug: string | null;
  service_name: string;
  comune: string | null;
  requester_email: string;
  requester_name: string | null;
  requester_phone: string | null;
  requester_message: string | null;
  case_details: Record<string, unknown> | null;
  status: string;
  source_url: string | null;
  created_at: string;
  recipient_names: string | null;
  recipient_count: string;
};

export async function listQuoteRequests(limit = 100) {
  return query<QuoteRequestRow>(
    `
    select qr.id, qr.service_slug, qr.service_name, qr.comune,
           qr.requester_email, qr.requester_name, qr.requester_phone, qr.requester_message,
           qr.case_details, qr.status, qr.source_url, qr.created_at::text,
           coalesce(string_agg(n.full_name, ', ' order by n.full_name), '') as recipient_names,
           count(qrr.id)::text as recipient_count
    from notai.quote_requests qr
    left join notai.quote_request_recipients qrr on qrr.quote_request_id = qr.id
    left join notai.notaries n on n.id = qrr.notary_id
    group by qr.id
    order by qr.created_at desc
    limit $1
    `,
    [limit],
  );
}

export async function listQuoteRequestsByEmail(email: string, limit = 50) {
  return query<QuoteRequestRow>(
    `
    select qr.id, qr.service_slug, qr.service_name, qr.comune,
           qr.requester_email, qr.requester_name, qr.requester_phone, qr.requester_message,
           qr.case_details, qr.status, qr.source_url, qr.created_at::text,
           coalesce(string_agg(n.full_name, ', ' order by n.full_name), '') as recipient_names,
           count(qrr.id)::text as recipient_count
    from notai.quote_requests qr
    left join notai.quote_request_recipients qrr on qrr.quote_request_id = qr.id
    left join notai.notaries n on n.id = qrr.notary_id
    where lower(qr.requester_email) = lower($1)
    group by qr.id
    order by qr.created_at desc
    limit $2
    `,
    [email.trim().toLowerCase(), limit],
  );
}

export async function getQuoteRequestForEmail(id: string, email: string) {
  const rows = await query<QuoteRequestRow>(
    `
    select qr.id, qr.service_slug, qr.service_name, qr.comune,
           qr.requester_email, qr.requester_name, qr.requester_phone, qr.requester_message,
           qr.case_details, qr.status, qr.source_url, qr.created_at::text,
           coalesce(string_agg(n.full_name, ', ' order by n.full_name), '') as recipient_names,
           count(qrr.id)::text as recipient_count
    from notai.quote_requests qr
    left join notai.quote_request_recipients qrr on qrr.quote_request_id = qr.id
    left join notai.notaries n on n.id = qrr.notary_id
    where qr.id = $1 and lower(qr.requester_email) = lower($2)
    group by qr.id
    limit 1
    `,
    [id, email.trim().toLowerCase()],
  );
  return rows[0] || null;
}

export type QuoteRecipientRow = {
  notary_id: string | null;
  full_name: string | null;
  source_slug: string | null;
  comune: string | null;
  match_type: string;
  status: string;
};

export async function getQuoteRecipients(quoteRequestId: string) {
  return query<QuoteRecipientRow>(
    `
    select qrr.notary_id, n.full_name, n.source_slug, n.comune, qrr.match_type, qrr.status
    from notai.quote_request_recipients qrr
    left join notai.notaries n on n.id = qrr.notary_id
    where qrr.quote_request_id = $1
    order by n.full_name nulls last
    `,
    [quoteRequestId],
  );
}

/** Servizi tassonomici considerati affini per ranking/match dichiarati. */
const SERVICE_AFFINITY: Record<string, string[]> = {
  'acquisto-casa-con-mutuo': [
    'compravendita-immobiliare',
    'mutuo',
    'mutuo-ipotecario',
    'acquisto-prima-casa',
    'acquisto-seconda-casa',
    'preliminare-compravendita',
  ],
  'acquisto-prima-casa': [
    'compravendita-immobiliare',
    'acquisto-casa-con-mutuo',
    'acquisto-seconda-casa',
    'preliminare-compravendita',
  ],
  'acquisto-seconda-casa': [
    'compravendita-immobiliare',
    'acquisto-casa-con-mutuo',
    'acquisto-prima-casa',
    'preliminare-compravendita',
  ],
  'compravendita-immobiliare': [
    'acquisto-casa-con-mutuo',
    'acquisto-prima-casa',
    'acquisto-seconda-casa',
    'preliminare-compravendita',
    'mutuo',
  ],
  'preliminare-compravendita': [
    'compravendita-immobiliare',
    'acquisto-casa-con-mutuo',
    'acquisto-prima-casa',
  ],
  mutuo: ['mutuo-ipotecario', 'acquisto-casa-con-mutuo', 'compravendita-immobiliare'],
  'mutuo-ipotecario': ['mutuo', 'acquisto-casa-con-mutuo'],
  'pratica-di-successione': ['testamento', 'eredita', 'atto-di-donazione'],
  testamento: ['pratica-di-successione', 'eredita'],
  eredita: ['pratica-di-successione', 'testamento'],
  'atto-di-donazione': ['pratica-di-successione'],
  'diritto-di-famiglia': ['convenzioni-matrimoniali', 'separazione-dei-beni'],
  'convenzioni-matrimoniali': ['diritto-di-famiglia', 'separazione-dei-beni'],
  'separazione-dei-beni': ['diritto-di-famiglia', 'convenzioni-matrimoniali'],
};

async function resolveDeclaredServiceIds(serviceId?: string, serviceSlug?: string) {
  const exactId = (serviceId || '').trim();
  const slug = (serviceSlug || '').trim();
  if (!exactId && !slug) {
    return { exactId: '', allIds: [] as string[] };
  }
  const affinity = slug ? SERVICE_AFFINITY[slug] || [] : [];
  const rows = await query<{ id: string; slug: string }>(
    `
    select distinct canonical.id::text as id, canonical.slug
    from notai.services_taxonomy source
    join notai.services_taxonomy canonical
      on canonical.id = coalesce(source.canonical_service_id, source.id)
    where ($1 <> '' and source.id::text = $1)
       or ($2 <> '' and source.slug = $2)
       or source.slug = any($3::text[])
       or canonical.slug = any($3::text[])
    `,
    [exactId, slug, affinity],
  );
  const exact = rows.find((row) => row.id === exactId || row.slug === slug) || rows[0];
  const resolvedExact = exact?.id || exactId;
  const related = rows.map((row) => row.id).filter((id) => id && id !== resolvedExact);
  const allIds = resolvedExact ? [resolvedExact, ...related] : related;
  return { exactId: resolvedExact, allIds: [...new Set(allIds)] };
}

export async function searchNotaries({
  comune,
  q,
  serviceId,
  serviceSlug,
  limit = 12,
}: {
  comune?: string;
  q?: string;
  serviceId?: string;
  serviceSlug?: string;
  limit?: number;
}) {
  const searchTerm = (q || '').trim();
  const cityTerm = (comune || '').replace(/-/g, ' ').trim();
  const search = `%${searchTerm}%`;
  const city = `%${cityTerm}%`;
  const { exactId, allIds } = await resolveDeclaredServiceIds(serviceId, serviceSlug);
  return query<Notary>(
    `
    select n.id, n.source_slug, n.full_name, n.comune, n.district, n.address, n.cap, n.phone, n.email, n.pec, n.website,
           n.lat, n.lng, n.description, n.official_reference_url, n.is_official_notariato,
           (ns.notary_id is not null) as declared_service,
           ns.match_kind as declared_match,
           ns.source as service_match_source
    from notai.notaries n
    left join lateral (
      select ns.notary_id, ns.source,
             case when ns.service_id::text = $5 then 'exact' else 'related' end as match_kind
      from notai.notary_services ns
      where ns.notary_id = n.id
        and cardinality($6::uuid[]) > 0
        and ns.service_id = any($6::uuid[])
      order by
        case when ns.service_id::text = $5 then 0 else 1 end,
        ns.confidence desc nulls last
      limit 1
    ) ns on true
    where n.status = 'published'
      and ($1 = '%%' or n.full_name ilike $1 or coalesce(n.comune, '') ilike $1 or coalesce(n.address, '') ilike $1)
      and ($2 = '%%' or coalesce(n.comune, '') ilike $2 or coalesce(n.district, '') ilike $2)
    order by
      case when ns.match_kind = 'exact' then 0 when ns.match_kind = 'related' then 1 else 2 end,
      case when $4 = '' then 0 when lower(coalesce(n.comune, '')) = lower($4) then 0 else 1 end,
      case when $4 = '' then 0 when coalesce(n.comune, '') ilike $2 then 0 else 1 end,
      case when n.lat is not null and n.lng is not null then 0 else 1 end,
      n.full_name asc
    limit $3
    `,
    [search, city, limit, cityTerm, exactId, allIds],
  );
}

export type RankedNotary = Notary & {
  distance_km?: number | null;
  rating_avg?: number | null;
  review_count?: number | null;
  services_count?: number | null;
  relevance_score?: number;
};

export const LISTING_PAGE_SIZE = 10;
export const LISTING_CANDIDATE_CAP = 400;

type NearbyRow = RankedNotary;

const NOTARY_LIST_SELECT = `
  n.id, n.source_slug, n.full_name, n.comune, n.district, n.address, n.cap, n.phone, n.email, n.pec, n.website,
  n.lat, n.lng, n.description, n.official_reference_url, n.is_official_notariato,
  coalesce(svc.services_count, 0)::int as services_count,
  rev.rating_avg,
  coalesce(rev.review_count, 0)::int as review_count
`;

const NOTARY_LIST_JOINS = `
  left join lateral (
    select count(*)::int as services_count
    from notai.notary_services ns
    where ns.notary_id = n.id
  ) svc on true
  left join lateral (
    select s.rating_avg, s.review_count
    from notai.notary_review_summaries s
    where s.notary_id = n.id
    order by s.review_count desc nulls last, s.rating_avg desc nulls last
    limit 1
  ) rev on true
`;

function relevanceScore(
  row: NearbyRow,
  center: { lat: number; lng: number } | null,
  nearPoint: { lat: number; lng: number } | null,
) {
  const reviews = Number(row.review_count || 0);
  const rating = Number(row.rating_avg || 0);
  const reviewPart = reviews > 0 ? rating * Math.log10(1 + reviews) * 12 : 0;
  const servicesPart = Number(row.services_count || 0) * 6;
  const lat = asCoord(row.lat);
  const lng = asCoord(row.lng);
  const ref = nearPoint || center;
  let distancePart = 0;
  let dist: number | null = typeof row.distance_km === 'number' ? row.distance_km : null;
  if (dist == null && ref && lat != null && lng != null) {
    dist = distanceKm(ref, { lat, lng });
  }
  if (dist == null) distancePart = -20;
  else distancePart = Math.max(0, 45 - dist);
  return reviewPart + servicesPart + distancePart;
}

function sortByRelevance(
  rows: NearbyRow[],
  center: { lat: number; lng: number } | null,
  nearPoint: { lat: number; lng: number } | null,
) {
  return [...rows]
    .map((row) => {
      const lat = asCoord(row.lat);
      const lng = asCoord(row.lng);
      const ref = nearPoint || center;
      const dist =
        typeof row.distance_km === 'number'
          ? row.distance_km
          : ref && lat != null && lng != null
            ? distanceKm(ref, { lat, lng })
            : null;
      return {
        ...row,
        distance_km: dist,
        relevance_score: relevanceScore({ ...row, distance_km: dist }, center, nearPoint),
      };
    })
    .sort((a, b) => {
      const sa = a.relevance_score || 0;
      const sb = b.relevance_score || 0;
      if (sa !== sb) return sb - sa;
      const da = a.distance_km == null ? Number.POSITIVE_INFINITY : a.distance_km;
      const db = b.distance_km == null ? Number.POSITIVE_INFINITY : b.distance_km;
      if (da !== db) return da - db;
      return a.full_name.localeCompare(b.full_name, 'it');
    });
}

function paginate<T>(rows: T[], pageSize: number, page: number) {
  const safePage = Math.max(1, page);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(safePage, totalPages);
  const offset = (currentPage - 1) * pageSize;
  return {
    items: rows.slice(offset, offset + pageSize),
    total,
    totalPages,
    page: currentPage,
    pageSize,
  };
}

/** Ricerca locale SEO: ranking (recensioni + servizi + vicinanza) e paginazione. */
export async function searchNotariesForLocation({
  comune,
  limit = LISTING_PAGE_SIZE,
  page = 1,
  minLocal = 8,
  radiusKm = null,
  nearLat = null,
  nearLng = null,
}: {
  comune: string;
  limit?: number;
  page?: number;
  minLocal?: number;
  radiusKm?: number | null;
  nearLat?: number | null;
  nearLng?: number | null;
}) {
  const cityTerm = comune.replace(/-/g, ' ').trim();
  const nearPoint =
    nearLat != null && nearLng != null && Number.isFinite(nearLat) && Number.isFinite(nearLng)
      ? { lat: nearLat, lng: nearLng }
      : null;

  if (!cityTerm) {
    return {
      notaries: [] as RankedNotary[],
      scope: 'empty' as const,
      exactCityCount: 0,
      radiusKm: null as number | null,
      center: null as { lat: number; lng: number } | null,
      total: 0,
      totalPages: 1,
      page: 1,
      pageSize: limit,
    };
  }

  const exact = await query<NearbyRow>(
    `
    select ${NOTARY_LIST_SELECT}, null::float8 as distance_km
    from notai.notaries n
    ${NOTARY_LIST_JOINS}
    where n.status = 'published' and lower(coalesce(n.comune, '')) = lower($1)
    order by n.full_name asc
    limit $2
    `,
    [cityTerm, LISTING_CANDIDATE_CAP],
  );

  const exactCenter = averageCenter(
    exact
      .map((row) => ({ lat: asCoord(row.lat), lng: asCoord(row.lng) }))
      .filter((point): point is { lat: number; lng: number } => point.lat != null && point.lng != null),
  );
  const center = exactCenter || (await geocodeItalianComune(cityTerm));

  const finish = (
    rows: NearbyRow[],
    scope: 'comune' | 'raggio' | 'distretto',
    usedRadius: number | null,
  ) => {
    const ranked = sortByRelevance(rows, center, nearPoint);
    const paged = paginate(ranked, limit, page);
    return {
      notaries: paged.items,
      scope,
      exactCityCount: exact.length,
      radiusKm: usedRadius,
      center,
      total: paged.total,
      totalPages: paged.totalPages,
      page: paged.page,
      pageSize: paged.pageSize,
    };
  };

  if (!radiusKm && exact.length >= minLocal) {
    return finish(exact, 'comune', null);
  }

  if (!center) {
    const districtRows = await query<NearbyRow>(
      `
      select ${NOTARY_LIST_SELECT}, null::float8 as distance_km
      from notai.notaries n
      ${NOTARY_LIST_JOINS}
      where n.status = 'published'
        and (
          lower(coalesce(n.comune, '')) = lower($1)
          or coalesce(n.district, '') ilike '%' || $1 || '%'
        )
      order by
        case when lower(coalesce(n.comune, '')) = lower($1) then 0 else 1 end,
        n.full_name asc
      limit $2
      `,
      [cityTerm, LISTING_CANDIDATE_CAP],
    );
    return finish(
      districtRows,
      districtRows.length > exact.length ? 'distretto' : 'comune',
      null,
    );
  }

  const steps = radiusKm ? [radiusKm] : [...SEARCH_RADIUS_STEPS];
  let chosen: NearbyRow[] = exact;
  let usedRadius: number | null = null;

  for (const radius of steps) {
    const nearby = await query<NearbyRow>(
      `
      select ${NOTARY_LIST_SELECT},
             (6371 * acos(least(1::float8, greatest(-1::float8,
               cos(radians($1)) * cos(radians(n.lat)) * cos(radians(n.lng) - radians($2))
               + sin(radians($1)) * sin(radians(n.lat))
             )))) as distance_km
      from notai.notaries n
      ${NOTARY_LIST_JOINS}
      where n.status = 'published'
        and n.lat is not null and n.lng is not null
        and (6371 * acos(least(1::float8, greatest(-1::float8,
               cos(radians($1)) * cos(radians(n.lat)) * cos(radians(n.lng) - radians($2))
               + sin(radians($1)) * sin(radians(n.lat))
             )))) <= $3
      order by distance_km asc nulls last
      limit $4
      `,
      [center.lat, center.lng, radius, LISTING_CANDIDATE_CAP],
    );

    const byId = new Map<string, NearbyRow>();
    for (const row of exact) byId.set(row.id, { ...row, distance_km: 0 });
    for (const row of nearby) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
    chosen = [...byId.values()];
    usedRadius = radius;
    const enough =
      radiusKm != null
        ? true
        : exact.length === 0
          ? chosen.length > 0
          : chosen.length >= Math.max(minLocal, 12);
    if (enough || radius === steps[steps.length - 1]) break;
  }

  const scope =
    exact.length > 0 && chosen.every((row) => (row.comune || '').toLowerCase() === cityTerm.toLowerCase())
      ? ('comune' as const)
      : ('raggio' as const);

  return finish(chosen, scope, usedRadius);
}

/** Vicino a me: ordinamento per distanza dalla posizione utente. */
export async function searchNotariesNearMe({
  lat,
  lng,
  radiusKm = 30,
  limit = LISTING_PAGE_SIZE,
  page = 1,
}: {
  lat: number;
  lng: number;
  radiusKm?: number;
  limit?: number;
  page?: number;
}) {
  const rows = await query<NearbyRow>(
    `
    select ${NOTARY_LIST_SELECT},
           (6371 * acos(least(1::float8, greatest(-1::float8,
             cos(radians($1)) * cos(radians(n.lat)) * cos(radians(n.lng) - radians($2))
             + sin(radians($1)) * sin(radians(n.lat))
           )))) as distance_km
    from notai.notaries n
    ${NOTARY_LIST_JOINS}
    where n.status = 'published'
      and n.lat is not null and n.lng is not null
      and (6371 * acos(least(1::float8, greatest(-1::float8,
             cos(radians($1)) * cos(radians(n.lat)) * cos(radians(n.lng) - radians($2))
             + sin(radians($1)) * sin(radians(n.lat))
           )))) <= $3
    order by distance_km asc nulls last
    limit $4
    `,
    [lat, lng, radiusKm, LISTING_CANDIDATE_CAP],
  );

  const center = { lat, lng };
  const ranked = sortByRelevance(rows, center, center);
  const paged = paginate(ranked, limit, page);
  return {
    notaries: paged.items,
    scope: 'raggio' as const,
    exactCityCount: 0,
    radiusKm,
    center,
    total: paged.total,
    totalPages: paged.totalPages,
    page: paged.page,
    pageSize: paged.pageSize,
  };
}

export function buildNotariesItemListJsonLd({
  notaries,
  page,
  pageSize,
  listName,
  listUrl,
}: {
  notaries: Array<
    Pick<
      RankedNotary,
      | 'full_name'
      | 'source_slug'
      | 'address'
      | 'comune'
      | 'cap'
      | 'phone'
      | 'lat'
      | 'lng'
    >
  >;
  page: number;
  pageSize: number;
  listName: string;
  listUrl: string;
}) {
  const base = getSiteUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    url: listUrl.startsWith('http') ? listUrl : `${base}${listUrl}`,
    numberOfItems: notaries.length,
    itemListElement: notaries.map((notary, index) => {
      const lat = asCoord(notary.lat);
      const lng = asCoord(notary.lng);
      const item: Record<string, unknown> = {
        '@type': ['LegalService', 'LocalBusiness'],
        name: notary.full_name,
        url: `${base}/notai/${notary.source_slug}`,
        telephone: notary.phone || undefined,
        address: {
          '@type': 'PostalAddress',
          streetAddress: notary.address || undefined,
          addressLocality: notary.comune || undefined,
          postalCode: notary.cap || undefined,
          addressCountry: 'IT',
        },
      };
      if (lat != null && lng != null) {
        item.geo = {
          '@type': 'GeoCoordinates',
          latitude: lat,
          longitude: lng,
        };
      }
      return {
        '@type': 'ListItem',
        position: (page - 1) * pageSize + index + 1,
        item,
      };
    }),
  };
}

export async function getRelatedServices(slug: string, limit = 6) {
  const service = await getService(slug);
  if (!service) return [] as Service[];
  return query<Service>(
    `
    select st.id, st.slug, st.name, st.category, st.plain_language_name, st.user_intent,
           st.seo_title, st.seo_description, st.service_scope, st.complexity,
           st.remote_possible, st.requires_in_person, st.required_documents, st.faqs,
           spb.price_min_cents, spb.price_avg_cents, spb.price_max_cents, spb.confidence
    from notai.services_taxonomy st
    left join notai.service_relations sr
      on sr.service_id = $1::uuid and sr.related_service_id = st.id
    left join lateral (
      select *
      from notai.service_price_benchmarks b
      where b.service_id = st.id and b.location_scope = 'national'
      order by b.confidence desc nulls last, b.updated_at desc
      limit 1
    ) spb on true
    where st.id <> $1::uuid
      and st.canonical_service_id is null
      and st.is_searchable
      and (
        sr.related_service_id is not null
        or coalesce(st.category, '') = coalesce($2, '')
        or ($2 is null and st.category is null)
      )
    order by
      case when sr.related_service_id is not null then 0 else 1 end,
      sr.weight desc nulls last,
      st.priority asc,
      st.name asc
    limit $3
    `,
    [service.id, service.category, limit],
  );
}

export async function getNotary(slug: string) {
  const rows = await query<Notary>(
    `
    select id, source_slug, full_name, comune, district, address, cap, phone, email, pec, website,
           lat, lng, description, official_reference_url, is_official_notariato
    from notai.notaries
    where source_slug = $1 and status = 'published'
    limit 1
    `,
    [slug],
  );
  return rows[0] || null;
}

export async function getNotaryGoogleProfile(notaryId: string) {
  if (!notaryId) return null;
  const rows = await query<NotaryGoogleProfile>(
    `
    select n.google_maps_url,
           n.google_business_status,
           n.google_opening_hours,
           n.google_photos,
           s.rating_avg::float8 as rating_avg,
           coalesce(s.review_count, 0)::int as review_count,
           s.sentiment_label,
           s.sentiment_score::float8 as sentiment_score,
           coalesce(s.strengths, '[]'::jsonb) as strengths,
           coalesce(s.concerns, '[]'::jsonb) as concerns,
           s.summary,
           s.payload as sentiment_payload
    from notai.notaries n
    left join notai.notary_review_summaries s
      on s.notary_id = n.id and s.source = 'google_places'
    where n.id = $1::uuid and n.status = 'published'
    limit 1
    `,
    [notaryId],
  );
  return rows[0] || null;
}

export async function getNotaryGoogleReviews(notaryId: string, limit = 3) {
  if (!notaryId) return [] as NotaryGoogleReview[];
  return query<NotaryGoogleReview>(
    `
    select source_review_id, author_name, rating::float8 as rating, text,
           published_at::text, payload
    from notai.notary_reviews
    where notary_id = $1::uuid
      and source = 'google_places'
      and nullif(trim(text), '') is not null
    order by published_at desc nulls last, updated_at desc
    limit $2
    `,
    [notaryId, Math.min(5, Math.max(1, limit))],
  );
}

export async function getNotaryById(id: string) {
  if (!id) return null;
  const rows = await query<Notary>(
    `
    select id, source_slug, full_name, comune, district, address, cap, phone, email, pec, website,
           lat, lng, description, official_reference_url, is_official_notariato
    from notai.notaries
    where id = $1::uuid and status = 'published'
    limit 1
    `,
    [id],
  );
  return rows[0] || null;
}

/** Notai vicini per scheda SEO: distanza geo se disponibile, altrimenti stesso comune/distretto. */
export async function getNearbyNotaries({
  notaryId,
  comune,
  district,
  lat,
  lng,
  limit = 6,
}: {
  notaryId: string;
  comune?: string | null;
  district?: string | null;
  lat?: number | null;
  lng?: number | null;
  limit?: number;
}) {
  type Nearby = Notary & { distance_km?: number | null };

  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    const geo = await query<Nearby>(
      `
      select n.id, n.source_slug, n.full_name, n.comune, n.district, n.address, n.cap, n.phone, n.email, n.pec, n.website,
             n.lat, n.lng, n.description, n.official_reference_url, n.is_official_notariato,
             (6371 * acos(least(1::float8, greatest(-1::float8,
               cos(radians($2)) * cos(radians(n.lat)) * cos(radians(n.lng) - radians($3))
               + sin(radians($2)) * sin(radians(n.lat))
             )))) as distance_km
      from notai.notaries n
      where n.status = 'published'
        and n.id::text <> $1
        and n.lat is not null and n.lng is not null
      order by distance_km asc nulls last, n.full_name asc
      limit $4
      `,
      [notaryId, lat, lng, limit],
    );
    if (geo.length) return geo;
  }

  const city = (comune || '').trim();
  if (city) {
    const sameCity = await query<Nearby>(
      `
      select id, source_slug, full_name, comune, district, address, cap, phone, email, pec, website,
             lat, lng, description, official_reference_url, is_official_notariato,
             null::float8 as distance_km
      from notai.notaries
      where status = 'published'
        and id::text <> $1
        and lower(coalesce(comune, '')) = lower($2)
      order by
        case when lat is not null and lng is not null then 0 else 1 end,
        full_name asc
      limit $3
      `,
      [notaryId, city, limit],
    );
    if (sameCity.length) return sameCity;
  }

  const dist = (district || '').trim();
  if (dist) {
    return query<Nearby>(
      `
      select id, source_slug, full_name, comune, district, address, cap, phone, email, pec, website,
             lat, lng, description, official_reference_url, is_official_notariato,
             null::float8 as distance_km
      from notai.notaries
      where status = 'published'
        and id::text <> $1
        and coalesce(district, '') ilike $2
      order by
        case when lat is not null and lng is not null then 0 else 1 end,
        full_name asc
      limit $3
      `,
      [notaryId, `%${dist}%`, limit],
    );
  }

  return [] as Nearby[];
}

export async function getNotaryServices(notaryId: string, limit = 10) {
  return query<NotaryService>(
    `
    with resolved as (
      select distinct on (canonical.id)
             canonical.slug, canonical.name, canonical.plain_language_name, canonical.category,
             canonical.priority,
             b.price_min_cents, b.price_avg_cents, b.price_max_cents,
             ns.source, ns.confidence
      from notai.notary_services ns
      join notai.services_taxonomy source on source.id = ns.service_id
      join notai.services_taxonomy canonical
        on canonical.id = coalesce(source.canonical_service_id, source.id)
      left join lateral (
        select price_min_cents, price_avg_cents, price_max_cents
        from notai.service_price_benchmarks
        where service_id = canonical.id and location_scope = 'national'
        order by confidence desc nulls last, updated_at desc
        limit 1
      ) b on true
      where ns.notary_id = $1 and canonical.is_searchable
      order by canonical.id, ns.confidence desc nulls last
    )
    select slug, name, plain_language_name, category,
           price_min_cents, price_avg_cents, price_max_cents, source, confidence
    from resolved
    order by confidence desc nulls last, priority asc, name asc
    limit $2
    `,
    [notaryId, limit],
  );
}

export async function getStats() {
  const rows = await query<{ notaries: string; services: string; prices: string }>(
    `
    select
      (select count(*) from notai.notaries where status = 'published') as notaries,
      (select count(*) from notai.services_taxonomy) as services,
      (select count(*) from notai.service_price_benchmarks) as prices
    `,
  );
  return rows[0];
}
