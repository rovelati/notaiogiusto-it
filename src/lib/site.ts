export function getSiteUrl() {
  const raw = import.meta.env.SITE_URL || process.env.SITE_URL || 'https://www.notaiogiusto.it';
  return String(raw).replace(/\/+$/, '');
}

export function absoluteUrl(pathname = '/') {
  if (/^https?:\/\//i.test(pathname)) return pathname;
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${getSiteUrl()}${path}`;
}

export function shouldNoindexSearch(url: URL) {
  return shouldNoindexListingUrl(url);
}

/**
 * Listing pubblici indexabili solo su URL “puliti”.
 * Qualsiasi query (?page, ?raggio, ?q, utm, …) → noindex,nofollow.
 */
export function shouldNoindexListingUrl(url: URL) {
  if ([...url.searchParams.keys()].length > 0) return true;
  return false;
}

export const siteConfig = {
  name: 'NotaioGiusto.it',
  legalName: 'NotaioGiusto.it',
  tagline: 'Notai, costi e preventivi',
  publicEmail: 'redazione@notaiogiusto.it',
  url: getSiteUrl(),
} as const;

