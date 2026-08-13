export function getSiteUrl() {
  const raw = import.meta.env.SITE_URL || process.env.SITE_URL || 'https://www.notaiogiusto.it';
  return String(raw).replace(/\/+$/, '');
}

export function absoluteUrl(pathname = '/') {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${getSiteUrl()}${path}`;
}

export function shouldNoindexSearch(url: URL) {
  const uselessKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref', 'page'];
  const page = Number(url.searchParams.get('page') || '1');
  if (page > 1) return true;
  return uselessKeys.some((key) => url.searchParams.has(key));
}
