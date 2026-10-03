import { slugify, titleCase } from './format';

/** Capoluoghi di provincia prioritari per SEO locale (stile veterinari.org). */
export const CAPOLUOGHI = [
  { name: 'Milano', province: 'MI' },
  { name: 'Roma', province: 'RM' },
  { name: 'Torino', province: 'TO' },
  { name: 'Napoli', province: 'NA' },
  { name: 'Firenze', province: 'FI' },
  { name: 'Bologna', province: 'BO' },
  { name: 'Genova', province: 'GE' },
  { name: 'Venezia', province: 'VE' },
  { name: 'Verona', province: 'VR' },
  { name: 'Padova', province: 'PD' },
  { name: 'Brescia', province: 'BS' },
  { name: 'Bergamo', province: 'BG' },
  { name: 'Varese', province: 'VA' },
  { name: 'Monza', province: 'MB' },
  { name: 'Como', province: 'CO' },
  { name: 'Palermo', province: 'PA' },
  { name: 'Catania', province: 'CT' },
  { name: 'Bari', province: 'BA' },
  { name: 'Bolzano', province: 'BZ' },
  { name: 'Trento', province: 'TN' },
  { name: 'Perugia', province: 'PG' },
  { name: 'Ancona', province: 'AN' },
  { name: 'Pescara', province: 'PE' },
  { name: 'Cagliari', province: 'CA' },
  { name: 'Trieste', province: 'TS' },
  { name: 'Udine', province: 'UD' },
  { name: 'Parma', province: 'PR' },
  { name: 'Modena', province: 'MO' },
  { name: 'Reggio Emilia', province: 'RE' },
  { name: 'Livorno', province: 'LI' },
  { name: 'Pisa', province: 'PI' },
  { name: 'Siena', province: 'SI' },
  { name: 'Salerno', province: 'SA' },
  { name: 'Lecce', province: 'LE' },
  { name: 'Taranto', province: 'TA' },
  { name: 'Reggio Calabria', province: 'RC' },
  { name: 'Messina', province: 'ME' },
  { name: 'Siracusa', province: 'SR' },
  { name: 'Sassari', province: 'SS' },
  { name: 'Aosta', province: 'AO' },
] as const;

export type Capoluogo = (typeof CAPOLUOGHI)[number];

/** 4 macro-aree SEO: hub → categoria → dettaglio servizio. */
export const MACRO_CATEGORIES = [
  {
    slug: 'atti-immobiliari',
    name: 'Atti immobiliari',
    description: 'Compravendite, mutui, donazioni immobiliari e atti legati alla casa.',
  },
  {
    slug: 'famiglia-e-successioni',
    name: 'Famiglia e successioni',
    description: 'Successioni, testamenti, donazioni familiari e atti di famiglia.',
  },
  {
    slug: 'diritto-societario',
    name: 'Diritto societario',
    description: 'Costituzione società, modifiche statutarie, cessioni quote e atti d’impresa.',
  },
  {
    slug: 'consulenza-e-altri-atti',
    name: 'Consulenza e altri atti',
    description: 'Autentiche, procure, copie conformi e altri atti notarili frequenti.',
  },
] as const;

export type MacroCategory = (typeof MACRO_CATEGORIES)[number];

/** Raggruppa categorie tassonomia disordinate nelle 4 macro-aree. */
export const CATEGORY_GROUPS: Record<string, MacroCategory['name']> = {
  'atti immobiliari': 'Atti immobiliari',
  casa: 'Atti immobiliari',
  'diritto di famiglia': 'Famiglia e successioni',
  'famiglia e eredita': 'Famiglia e successioni',
  'famiglia e eredità': 'Famiglia e successioni',
  'diritto societario': 'Diritto societario',
  impresa: 'Diritto societario',
  consulenza: 'Consulenza e altri atti',
  'atti notarili': 'Consulenza e altri atti',
  'altri servizi': 'Consulenza e altri atti',
  'enti e no profit': 'Consulenza e altri atti',
};

export const CATEGORY_ORDER = MACRO_CATEGORIES.map((item) => item.name);

export function macroCategory(raw: string | null | undefined): MacroCategory['name'] {
  const key = (raw || '').trim().toLowerCase();
  return CATEGORY_GROUPS[key] || 'Consulenza e altri atti';
}

export function getMacroByName(name: string | null | undefined) {
  const normalized = macroCategory(name);
  return MACRO_CATEGORIES.find((item) => item.name === normalized) || MACRO_CATEGORIES[3];
}

export function getMacroBySlug(slug: string) {
  return MACRO_CATEGORIES.find((item) => item.slug === slug) || null;
}

export function macroCategoryPath(raw: string | null | undefined) {
  return `/quanto-costa/categoria/${getMacroByName(raw).slug}`;
}

export function toLocationSlug(name: string, province: string) {
  return `${slugify(name)}-${province.toLowerCase()}`;
}

export function provinceSlug(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .slice(0, 2);
}

export function cityNameFromSlug(slug = '') {
  return titleCase(slug.replaceAll('-', ' '));
}

/** URL SEO stile veterinari.org: /notai/bg/bergamo */
export function canonicalNotaiCityPath(city: string, province?: string | null) {
  const cap = findCapoluogo(city);
  const prov = String(province || cap?.province || '')
    .trim()
    .toLowerCase();
  const citySlug = slugify(cap?.name || city);
  if (!prov || !citySlug) {
    const comune = (cap?.name || city || '').trim();
    return comune ? `/notai?comune=${encodeURIComponent(comune)}` : '/notai';
  }
  return `/notai/${prov}/${citySlug}`;
}

export function parseLocationSlug(slug = '') {
  const parts = slug.split('-').filter(Boolean);
  if (parts.length < 2) {
    return {
      slug,
      comune: titleCase(slug.replaceAll('-', ' ')),
      province: '',
      label: titleCase(slug.replaceAll('-', ' ')),
    };
  }
  const province = (parts.at(-1) || '').toUpperCase();
  const comune = titleCase(parts.slice(0, -1).join(' '));
  return {
    slug,
    comune,
    province,
    label: province ? `${comune} (${province})` : comune,
  };
}

export function findCapoluogo(nameOrSlug: string) {
  const normalized = slugify(nameOrSlug);
  return CAPOLUOGHI.find(
    (item) =>
      slugify(item.name) === normalized ||
      toLocationSlug(item.name, item.province) === normalized ||
      item.province.toLowerCase() === normalized,
  );
}

/** Province vicine (capoluoghi) per footer SEO listing — cluster regionali. */
const NEARBY_PROVINCES: Record<string, string[]> = {
  MI: ['MB', 'VA', 'CO', 'BG', 'PV', 'LO'],
  MB: ['MI', 'CO', 'LC', 'BG', 'VA'],
  VA: ['MI', 'CO', 'MB'],
  CO: ['MI', 'VA', 'LC', 'MB'],
  BG: ['MI', 'BS', 'LC', 'MB'],
  BS: ['BG', 'MN', 'VR'],
  TO: ['CN', 'AL', 'NO', 'VC'],
  GE: ['SV', 'SP', 'AL'],
  BO: ['MO', 'FE', 'RA', 'PR'],
  MO: ['BO', 'RE', 'PR'],
  RE: ['MO', 'PR', 'MN'],
  PR: ['RE', 'MO', 'PC'],
  FI: ['PI', 'PO', 'SI', 'AR'],
  PI: ['FI', 'LI', 'LU'],
  SI: ['FI', 'AR', 'GR'],
  VE: ['PD', 'TV', 'RO'],
  PD: ['VE', 'VI', 'TV', 'RO'],
  VR: ['VI', 'PD', 'BS', 'MN'],
  TS: ['UD', 'GO'],
  UD: ['TS', 'PN'],
  RM: ['LT', 'FR', 'VT', 'RI'],
  NA: ['SA', 'CE', 'AV'],
  SA: ['NA', 'AV'],
  BA: ['TA', 'BT', 'BR'],
  PA: ['TP', 'AG', 'CT'],
  CT: ['SR', 'ME', 'RG', 'PA'],
  CA: ['SS', 'OR', 'NU'],
};

/** Prestazioni SEO ad alto intento (locali in sitemap = CAPOLUOGHI/extra × queste). */
export const SEO_SERVICE_LINKS = [
  { slug: 'acquisto-prima-casa', label: 'Acquisto prima casa' },
  { slug: 'acquisto-casa-con-mutuo', label: 'Acquisto con mutuo' },
  { slug: 'preliminare-compravendita', label: 'Compromesso casa' },
  { slug: 'compravendita-immobiliare', label: 'Compravendita / rogito' },
  { slug: 'mutuo', label: 'Mutuo' },
  { slug: 'successione-ereditaria', label: 'Successione' },
  { slug: 'testamento', label: 'Testamento' },
  { slug: 'costituzione-srl', label: 'Costituzione SRL' },
  { slug: 'procura', label: 'Procura notarile' },
  { slug: 'donazione', label: 'Donazione' },
  { slug: 'copia-conforme', label: 'Copia conforme' },
  { slug: 'autentica-copia', label: 'Autentica di copia' },
  { slug: 'vendita-box-garage', label: 'Vendita box / garage' },
] as const;

/**
 * Città extra in sitemap listing/locali (non solo capoluoghi).
 * Partenza Lombardia da signal SEOZoom (satelliti Milano).
 */
export const SEO_EXTRA_CITIES = [
  { name: 'Legnano', province: 'MI' },
  { name: 'Sesto San Giovanni', province: 'MI' },
  { name: 'Rozzano', province: 'MI' },
] as const;

/** Capoluoghi + satelliti prioritari per sitemap città e locali capped. */
export const SEO_LISTING_CITIES = [...CAPOLUOGHI, ...SEO_EXTRA_CITIES];

export function nearbyCapoluoghi(provinceOrCity: string, limit = 6): Capoluogo[] {
  const raw = String(provinceOrCity || '').trim();
  if (!raw) return [];
  const cap = findCapoluogo(raw);
  // Solo sigla provincia (2 lettere) o capoluogo noto: evita "Vergiate" → "VE" → Padova
  const asCode = raw.toUpperCase();
  const prov = cap?.province || (asCode.length === 2 ? asCode : '');
  if (!prov) return [];
  const codes = NEARBY_PROVINCES[prov] || [];
  const fromMap = codes
    .map((code) => CAPOLUOGHI.find((item) => item.province === code))
    .filter((item): item is Capoluogo => Boolean(item));
  if (fromMap.length) return fromMap.slice(0, limit);
  return CAPOLUOGHI.filter((item) => item.province !== prov).slice(0, limit);
}

export function listingSeoLinks({
  comune,
  province,
  limitCities = 6,
  limitServices = 8,
}: {
  comune?: string | null;
  province?: string | null;
  limitCities?: number;
  limitServices?: number;
}) {
  const current = findCapoluogo(comune || '') || findCapoluogo(province || '');
  const provCode = String(current?.province || province || '')
    .trim()
    .toUpperCase();
  const nearby = nearbyCapoluoghi(provCode || comune || '', limitCities);
  const cityLinks = [
    ...(provCode
      ? [
          {
            label: `Notai in provincia di ${current?.name || provCode}`,
            href: `/notai/provincia/${provCode.toLowerCase()}`,
            description: `Tutti i comuni con studi in provincia ${provCode}`,
          },
        ]
      : []),
    ...nearby.map((city) => ({
      label: `Notai a ${city.name}`,
      href: canonicalNotaiCityPath(city.name, city.province),
      description: `Studi notarili in provincia di ${city.province}`,
    })),
  ];

  const locationSlug = current
    ? toLocationSlug(current.name, current.province)
    : comune && province
      ? toLocationSlug(comune, province)
      : '';

  const serviceLinks = locationSlug
    ? SEO_SERVICE_LINKS.slice(0, limitServices).map((service) => ({
        label: `${service.label} a ${current?.name || comune}`,
        href: `/quanto-costa/${locationSlug}/${service.slug}/notai`,
        description: `Preventivo e notai per ${service.label.toLowerCase()}`,
      }))
    : SEO_SERVICE_LINKS.slice(0, Math.min(4, limitServices)).map((service) => ({
        label: service.label,
        href: `/quanto-costa/${service.slug}`,
        description: 'Costo indicativo e guida alla pratica',
      }));

  return { cityLinks, serviceLinks, current };
}
