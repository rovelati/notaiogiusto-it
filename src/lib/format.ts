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
