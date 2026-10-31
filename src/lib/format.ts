export function euro(cents?: number | null) {
  if (!cents) return 'su preventivo';
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function titleCase(value = '') {
  return value
    .toLowerCase()
    .split(/([\s-]+)/)
    .map((part) => (/^[a-zàèéìòù]/i.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join('');
}

export function locationToLabel(slug = '') {
  const parts = slug.split('-');
  if (parts.length < 2) return titleCase(slug.replaceAll('-', ' '));
  const province = parts.at(-1)?.toUpperCase();
  const comune = titleCase(parts.slice(0, -1).join(' '));
  return `${comune}, ${province}`;
}

export function slugify(value = '') {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function phoneDigits(value = '') {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0039')) digits = digits.slice(4);
  else if (digits.startsWith('39') && digits.length > 10) digits = digits.slice(2);
  return digits;
}

/** Separa numeri multipli senza spezzare il formato italiano 02/1234567. */
export function parseItalianPhones(value = '') {
  const text = String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return [] as string[];
  const chunks = text.split(
    /\s*(?:[,;|]|\r?\n)\s*|(?<=\d)\s+(?=(?:\+?39\s*)?(?:0\d{1,4}\s*[/.-]|3\d{2}\b))/,
  );
  const result: string[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const cleaned = chunk.trim();
    const digits = phoneDigits(cleaned);
    if (digits.length < 6 || digits.length > 11 || seen.has(digits)) continue;
    seen.add(digits);
    result.push(cleaned);
  }
  return result;
}

export function internationalPhone(value = '') {
  const digits = phoneDigits(value);
  return digits ? `+39${digits}` : '';
}

export function schemaTelephone(value = '') {
  const first = parseItalianPhones(value)[0] || value;
  return internationalPhone(first) || undefined;
}

export function telHref(value = '') {
  const intl = internationalPhone(value);
  return intl ? `tel:${intl}` : '';
}
