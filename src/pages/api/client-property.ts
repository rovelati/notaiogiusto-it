import type { APIRoute } from 'astro';
import { getClientEmail } from '../../lib/client-auth';
import {
  archiveClientProperty,
  createClientProperty,
  updateClientProperty,
  type PropertyInput,
} from '../../lib/properties';

export const prerender = false;

function readInput(form: FormData): PropertyInput {
  return {
    nickname: String(form.get('nickname') || ''),
    address: String(form.get('address') || ''),
    comune: String(form.get('comune') || ''),
    province: String(form.get('province') || ''),
    cap: String(form.get('cap') || ''),
    foglio: String(form.get('foglio') || ''),
    particella: String(form.get('particella') || ''),
    subalterno: String(form.get('subalterno') || ''),
    sezione: String(form.get('sezione') || ''),
    categoria_catastale: String(form.get('categoria_catastale') || ''),
    rendita_catastale: String(form.get('rendita_catastale') || ''),
    quota_possesso: String(form.get('quota_possesso') || ''),
    titolo_provenienza: String(form.get('titolo_provenienza') || ''),
    notes: String(form.get('notes') || ''),
    usable_for: form.getAll('usable_for').map((value) => String(value)),
    shareable: String(form.get('shareable') || '0') === '1',
  };
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const email = getClientEmail(cookies);
  if (!email) return redirect('/area-clienti/accedi');

  const form = await request.formData();
  const action = String(form.get('action') || 'create');
  const id = String(form.get('id') || '').trim();
  const input = readInput(form);

  if (action === 'archive' && id) {
    await archiveClientProperty(id, email);
    return redirect('/area-clienti/immobili');
  }

  if (!input.nickname.trim()) {
    return new Response('Nome immobile obbligatorio', { status: 400 });
  }

  if (action === 'update' && id) {
    const updated = await updateClientProperty(id, email, input);
    if (!updated) return new Response('Immobile non trovato', { status: 404 });
    return redirect(`/area-clienti/immobili/${updated}`);
  }

  const created = await createClientProperty(email, input);
  if (!created) return new Response('Errore salvataggio', { status: 500 });
  return redirect(`/area-clienti/immobili/${created}`);
};
