import type { APIRoute } from 'astro';
import { query } from '../../lib/db';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const notaryId = String(form.get('notary_id') || '').trim();
  const email = String(form.get('email') || '').trim().toLowerCase();
  const name = String(form.get('name') || '').trim();
  const phone = String(form.get('phone') || '').trim();
  const message = String(form.get('message') || '').trim();

  if (!email.includes('@') || !name) {
    return new Response('Dati claim non validi', { status: 400 });
  }

  if (notaryId) {
    await query(
      `
      insert into notai.notary_claims (notary_id, claimant_email, claimant_name, claimant_phone, notes, status)
      values ($1,$2,$3,$4,$5,'pending')
      on conflict do nothing
      `,
      [notaryId, email, name, phone || null, message || null],
    );
  }

  return redirect('/grazie', 303);
};
