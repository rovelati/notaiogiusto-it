export type ServiceSearchTerm = {
  term: string;
  normalized_term?: string;
  term_type: 'alias' | 'intent' | 'boost';
  weight?: number;
};

export type SearchableService = {
  id: string;
  slug: string;
  name: string;
  plain_language_name: string | null;
  search_terms?: ServiceSearchTerm[] | null;
};

export type ServiceSearchResult<T extends SearchableService = SearchableService> = {
  service: T;
  score: number;
  matchedBy: 'canonical' | 'alias' | 'intent' | 'token' | 'fuzzy';
  matchedTerm: string;
};

const STOP_WORDS = new Set([
  'a', 'al', 'alla', 'alle', 'ai', 'agli', 'da', 'dal', 'dalla', 'di', 'del', 'della',
  'dei', 'delle', 'e', 'il', 'la', 'le', 'lo', 'i', 'gli', 'in', 'l', 'mio', 'mia',
  'miei', 'mie', 'un', 'una', 'uno', 'per', 'con', 'ma', 'che', 'come', 'quanto',
  'costa', 'vorrei', 'voglio', 'posso', 'ancora',
]);

const TOKEN_GROUPS = [
  ['donare', 'donazione', 'regalare', 'dare', 'cedere', 'trasferire'],
  ['figlio', 'figli', 'familiare', 'familiari'],
  ['casa', 'immobile', 'appartamento'],
  ['vivere', 'viverci', 'abitare'],
  ['vendere', 'vendita', 'cessione'],
  ['comprare', 'acquisto'],
  ['eredita', 'ereditaria', 'successione'],
  ['societa', 'societaria', 'aziendale'],
];

const TOKEN_EQUIVALENTS = new Map<string, Set<string>>();
for (const group of TOKEN_GROUPS) {
  for (const token of group) TOKEN_EQUIVALENTS.set(token, new Set(group));
}

export function normalizeServiceQuery(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`´]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

function maxTypos(token: string) {
  if (token.length < 5) return 0;
  if (token.length < 9) return 1;
  return 2;
}

function tokenMatches(left: string, right: string) {
  if (left === right) return true;
  if (TOKEN_EQUIVALENTS.get(left)?.has(right)) return true;
  const allowed = Math.min(maxTypos(left), maxTypos(right));
  return allowed > 0 && editDistance(left, right) <= allowed;
}

function tokens(value: string) {
  return normalizeServiceQuery(value)
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function tokenSimilarity(query: string, candidate: string) {
  const queryTokens = tokens(query);
  const candidateTokens = tokens(candidate);
  if (!queryTokens.length || !candidateTokens.length) return 0;
  const matchedQuery = queryTokens.filter((queryToken) =>
    candidateTokens.some((candidateToken) => tokenMatches(queryToken, candidateToken)),
  ).length;
  const matchedCandidate = candidateTokens.filter((candidateToken) =>
    queryTokens.some((queryToken) => tokenMatches(queryToken, candidateToken)),
  ).length;
  const queryCoverage = matchedQuery / queryTokens.length;
  const candidateCoverage = matchedCandidate / candidateTokens.length;
  return queryCoverage * 0.55 + candidateCoverage * 0.45;
}

function fuzzyScore(query: string, candidate: string) {
  if (query.includes(' ') || candidate.includes(' ')) return 0;
  const allowed = Math.min(maxTypos(query), maxTypos(candidate));
  if (!allowed) return 0;
  const distance = editDistance(query, candidate);
  return distance > 0 && distance <= allowed ? 30 - distance : 0;
}

function scoreCandidate(
  query: string,
  candidate: string,
  kind: 'canonical' | 'alias' | 'intent',
) {
  const normalized = normalizeServiceQuery(candidate);
  if (!normalized) return 0;
  if (normalized === query) return kind === 'canonical' ? 100 : kind === 'alias' ? 90 : 69;
  if (normalized.startsWith(query) || query.startsWith(normalized)) {
    return kind === 'canonical' ? 80 : kind === 'alias' ? 70 : 65;
  }
  const similarity = tokenSimilarity(query, normalized);
  const minSimilarity = kind === 'intent' ? 0.42 : 0.5;
  if (similarity >= minSimilarity) {
    const base = kind === 'intent' ? 50 : 40;
    return base + Math.round(Math.min(9, similarity * 9));
  }
  return fuzzyScore(query, normalized);
}

export function rankServices<T extends SearchableService>(
  rawQuery: string | null | undefined,
  services: T[],
  limit = 5,
): ServiceSearchResult<T>[] {
  const query = normalizeServiceQuery(rawQuery);
  if (!query) return [];

  return services
    .map((service) => {
      const canonicalLabels = [
        service.name,
        service.plain_language_name || '',
        service.slug.replace(/-/g, ' '),
      ];
      let best: Omit<ServiceSearchResult<T>, 'service'> = {
        score: 0,
        matchedBy: 'fuzzy',
        matchedTerm: '',
      };

      for (const label of canonicalLabels) {
        const score = scoreCandidate(query, label, 'canonical');
        if (score > best.score) {
          best = {
            score,
            matchedBy: score >= 80 ? 'canonical' : score >= 40 ? 'token' : 'fuzzy',
            matchedTerm: label,
          };
        }
      }

      for (const term of service.search_terms || []) {
        const kind = term.term_type === 'intent' ? 'intent' : 'alias';
        const score = scoreCandidate(query, term.normalized_term || term.term, kind);
        if (score > best.score) {
          best = {
            score,
            matchedBy: kind === 'intent' ? 'intent' : score >= 70 ? 'alias' : score >= 40 ? 'token' : 'fuzzy',
            matchedTerm: term.term,
          };
        }
      }

      return { service, ...best };
    })
    .filter((result) => result.score >= 20)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.service.name.localeCompare(right.service.name, 'it'),
    )
    .slice(0, Math.max(1, limit));
}
