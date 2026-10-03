import { getPool, query } from './db';

export type OwnedNotary = {
  id: string;
  source_slug: string;
  full_name: string;
  comune: string | null;
  address: string | null;
  cap: string | null;
  phone: string | null;
  email: string | null;
  pec: string | null;
  website: string | null;
  description: string | null;
  owner_email: string | null;
  claimed_at: string | null;
  profile_status: string | null;
  claim_status: string | null;
};

export async function getNotaryOwnedByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const rows = await query<OwnedNotary>(
    `
    select n.id, n.source_slug, n.full_name, n.comune, n.address, n.cap, n.phone, n.email, n.pec,
           n.website, n.description, n.owner_email, n.claimed_at::text, n.profile_status,
           c.status as claim_status
    from notai.notaries n
    left join lateral (
      select status
      from notai.notary_claims
      where notary_id = n.id and lower(claimant_email) = lower(n.owner_email)
      order by
        case status when 'approved' then 0 when 'pending' then 1 else 2 end,
        created_at desc
      limit 1
    ) c on true
    where lower(coalesce(n.owner_email, '')) = $1
    limit 1
    `,
    [normalized],
  );
  return rows[0] || null;
}

export async function searchClaimableNotaries(term: string, limit = 12) {
  const needle = term.trim();
  if (needle.length < 2) return [] as Array<{
    id: string;
    source_slug: string;
    full_name: string;
    comune: string | null;
    address: string | null;
    owner_email: string | null;
  }>;
  return query(
    `
    select id, source_slug, full_name, comune, address, owner_email
    from notai.notaries
    where status = 'published'
      and (
        full_name ilike '%' || $1 || '%'
        or coalesce(comune, '') ilike '%' || $1 || '%'
      )
    order by
      case when owner_email is null then 0 else 1 end,
      case when lower(full_name) = lower($1) then 0 else 1 end,
      full_name asc
    limit $2
    `,
    [needle, limit],
  );
}

export async function getClaimableNotaryById(id: string) {
  const rows = await query<{
    id: string;
    source_slug: string;
    full_name: string;
    comune: string | null;
    address: string | null;
    phone: string | null;
    owner_email: string | null;
  }>(
    `
    select id, source_slug, full_name, comune, address, phone, owner_email
    from notai.notaries
    where id = $1::uuid and status = 'published'
    limit 1
    `,
    [id],
  );
  return rows[0] || null;
}

/** Claim atomico stile veterinari: assegna owner subito, claim pending fino ad approve admin. */
export async function claimNotarySecure(input: {
  notaryId: string;
  email: string;
  name: string;
  phone?: string;
  role?: string;
  message?: string;
}) {
  const email = input.email.trim().toLowerCase();
  const notaryId = input.notaryId.trim();
  if (!email.includes('@') || !notaryId) {
    return { ok: false as const, error: 'invalid_input' };
  }

  const existingOwner = await getNotaryOwnedByEmail(email);
  if (existingOwner && existingOwner.id !== notaryId) {
    return { ok: false as const, error: 'already_has_notary' };
  }

  const target = await getClaimableNotaryById(notaryId);
  if (!target) return { ok: false as const, error: 'notary_not_found' };
  if (target.owner_email && target.owner_email.toLowerCase() !== email) {
    return { ok: false as const, error: 'already_claimed' };
  }

  const notes = [
    input.role ? `Ruolo: ${input.role}` : null,
    input.message || null,
  ]
    .filter(Boolean)
    .join('\n');

  const payload = JSON.stringify({
    role: input.role || null,
    source: 'claim_start',
  });

  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query(
      `
      update notai.notaries
      set owner_email = $2,
          profile_status = coalesce(nullif(profile_status, ''), 'in_revisione'),
          updated_at = now()
      where id = $1::uuid
        and (owner_email is null or lower(owner_email) = $2)
      `,
      [notaryId, email],
    );

    const existingClaim = await client.query<{ id: string; status: string }>(
      `
      select id, status
      from notai.notary_claims
      where notary_id = $1::uuid and lower(claimant_email) = $2
        and status in ('pending', 'approved')
      order by created_at desc
      limit 1
      `,
      [notaryId, email],
    );

    if (existingClaim.rows[0]) {
      await client.query(
        `
        update notai.notary_claims
        set claimant_name = $2,
            claimant_phone = $3,
            notes = $4,
            payload = $5::jsonb,
            status = 'pending',
            approved_at = null,
            rejected_at = null,
            updated_at = now()
        where id = $1::uuid
        `,
        [existingClaim.rows[0].id, input.name.trim(), input.phone?.trim() || null, notes || null, payload],
      );
    } else {
      await client.query(
        `
        insert into notai.notary_claims (
          notary_id, claimant_email, claimant_name, claimant_phone, notes, status, payload
        )
        values ($1::uuid, $2, $3, $4, $5, 'pending', $6::jsonb)
        `,
        [notaryId, email, input.name.trim(), input.phone?.trim() || null, notes || null, payload],
      );
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  return { ok: true as const, notaryId, slug: target.source_slug };
}

/** Normalizza URL sito: aggiunge https:// se manca lo schema. */
export function normalizeWebsiteUrl(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  return `https://${raw.replace(/^\/+/, '')}`;
}

export async function updateOwnedNotaryProfile(
  email: string,
  input: {
    phone?: string;
    emailPublic?: string;
    pec?: string;
    website?: string;
    address?: string;
    cap?: string;
    description?: string;
  },
) {
  const owned = await getNotaryOwnedByEmail(email);
  if (!owned) return { ok: false as const, error: 'not_owner' };

  const rows = await query<{ id: string }>(
    `
    update notai.notaries
    set phone = $2,
        email = $3,
        pec = $4,
        website = $5,
        address = $6,
        cap = $7,
        description = $8,
        profile_status = case
          when profile_status = 'verified' then 'verified'
          else 'in_revisione'
        end,
        updated_at = now()
    where id = $1::uuid and lower(coalesce(owner_email, '')) = lower($9)
    returning id
    `,
    [
      owned.id,
      input.phone?.trim() || null,
      input.emailPublic?.trim() || null,
      input.pec?.trim() || null,
      normalizeWebsiteUrl(input.website),
      input.address?.trim() || null,
      input.cap?.trim() || null,
      input.description?.trim() || null,
      email.trim().toLowerCase(),
    ],
  );
  return rows[0]?.id ? { ok: true as const, id: rows[0].id } : { ok: false as const, error: 'update_failed' };
}
