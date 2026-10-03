import { escapeHtml, getMailAdminRecipient, sendMail, type MailResult } from './mail';

export type QuoteMailNotary = {
  id: string;
  fullName: string;
  email: string;
};

export type QuoteMailData = {
  quoteId: string;
  requesterEmail: string;
  requesterName: string;
  requesterPhone: string;
  serviceName: string;
  comune: string;
  message: string;
  urgency: string;
  details: Array<{ label: string; value: string }>;
  notaries: QuoteMailNotary[];
};

export type QuoteMailDelivery = {
  kind: 'admin' | 'requester' | 'notary';
  to: string;
  notaryId?: string;
  result: MailResult;
};

function env(name: string) {
  return String(import.meta.env[name] || process.env[name] || '').trim();
}

function textDetails(data: QuoteMailData) {
  return [
    `Riferimento: ${data.quoteId}`,
    `Prestazione: ${data.serviceName}`,
    data.comune ? `Località: ${data.comune}` : '',
    data.requesterName ? `Nome: ${data.requesterName}` : '',
    `Email: ${data.requesterEmail}`,
    data.requesterPhone ? `Telefono: ${data.requesterPhone}` : '',
    data.urgency ? `Tempistiche: ${data.urgency}` : '',
    ...data.details.map((item) => `${item.label}: ${item.value}`),
    data.message ? `Messaggio: ${data.message}` : '',
  ].filter(Boolean);
}

function detailsHtml(data: QuoteMailData) {
  const rows = [
    ['Riferimento', data.quoteId],
    ['Prestazione', data.serviceName],
    ['Località', data.comune],
    ['Nome', data.requesterName],
    ['Email', data.requesterEmail],
    ['Telefono', data.requesterPhone],
    ['Tempistiche', data.urgency],
    ...data.details.map((item) => [item.label, item.value]),
    ['Messaggio', data.message],
  ].filter(([, value]) => value);

  return `
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:20px 0">
      ${rows.map(([label, value]) => `
        <tr>
          <th style="padding:8px 10px;border-bottom:1px solid #e3e8ef;text-align:left;vertical-align:top;color:#46556b">${escapeHtml(label)}</th>
          <td style="padding:8px 10px;border-bottom:1px solid #e3e8ef;color:#101828">${escapeHtml(value)}</td>
        </tr>
      `).join('')}
    </table>
  `;
}

function emailShell(title: string, body: string) {
  return `
    <!doctype html>
    <html lang="it">
      <body style="margin:0;padding:24px;background:#f5f7fa;font-family:Arial,sans-serif;color:#101828">
        <div style="max-width:680px;margin:0 auto;padding:28px;background:#fff;border:1px solid #dfe5ed;border-radius:12px">
          <p style="margin:0 0 8px;color:#1d4a83;font-weight:700">NotaioGiusto.it</p>
          <h1 style="margin:0 0 18px;font-size:26px;line-height:1.2">${escapeHtml(title)}</h1>
          ${body}
          <p style="margin:24px 0 0;color:#667085;font-size:13px;line-height:1.5">
            I dati e le richieste hanno carattere informativo. Il preventivo ufficiale viene emesso dallo studio notarile dopo le verifiche di legge.
          </p>
        </div>
      </body>
    </html>
  `;
}

export async function sendQuoteRequestEmails(data: QuoteMailData): Promise<QuoteMailDelivery[]> {
  const adminTo = getMailAdminRecipient();
  const siteUrl = env('SITE_URL') || 'https://www.notaiogiusto.it';
  const lines = textDetails(data);
  const table = detailsHtml(data);
  const deliveries: Array<Promise<QuoteMailDelivery>> = [];

  deliveries.push(
    sendMail({
      to: adminTo,
      replyTo: data.requesterEmail,
      subject: `Nuovo preventivo: ${data.serviceName}${data.comune ? ` · ${data.comune}` : ''}`,
      text: ['Nuova richiesta di preventivo ricevuta.', '', ...lines].join('\n'),
      html: emailShell('Nuova richiesta di preventivo', `
        <p>È arrivata una nuova richiesta dal sito.</p>
        ${table}
        <p>Notai selezionati: ${data.notaries.length ? escapeHtml(data.notaries.map((item) => item.fullName).join(', ')) : 'nessuno'}</p>
      `),
    }).then((result) => ({ kind: 'admin' as const, to: adminTo, result })),
  );

  deliveries.push(
    sendMail({
      to: data.requesterEmail,
      replyTo: adminTo,
      subject: `Abbiamo ricevuto la tua richiesta per ${data.serviceName}`,
      text: [
        `Ciao${data.requesterName ? ` ${data.requesterName}` : ''},`,
        '',
        'abbiamo ricevuto la tua richiesta di preventivo.',
        ...lines.slice(0, 3),
        '',
        data.notaries.length
          ? `La richiesta è stata indirizzata a ${data.notaries.length} ${data.notaries.length === 1 ? 'studio notarile' : 'studi notarili'}.`
          : 'La richiesta è stata registrata e sarà presa in carico.',
        '',
        `Puoi consultare NotaioGiusto.it: ${siteUrl}`,
      ].join('\n'),
      html: emailShell('Richiesta ricevuta', `
        <p>Ciao${data.requesterName ? ` ${escapeHtml(data.requesterName)}` : ''},</p>
        <p>abbiamo ricevuto la tua richiesta di preventivo per <strong>${escapeHtml(data.serviceName)}</strong>${data.comune ? ` a <strong>${escapeHtml(data.comune)}</strong>` : ''}.</p>
        <p>${data.notaries.length
          ? `La richiesta è stata indirizzata a ${data.notaries.length} ${data.notaries.length === 1 ? 'studio notarile' : 'studi notarili'}.`
          : 'La richiesta è stata registrata e sarà presa in carico.'}</p>
        <p><a href="${escapeHtml(siteUrl)}" style="color:#1d4a83;font-weight:700">Vai a NotaioGiusto.it</a></p>
      `),
    }).then((result) => ({ kind: 'requester' as const, to: data.requesterEmail, result })),
  );

  for (const notary of data.notaries) {
    deliveries.push(
      sendMail({
        to: notary.email,
        replyTo: data.requesterEmail,
        subject: `Richiesta di preventivo: ${data.serviceName}${data.comune ? ` · ${data.comune}` : ''}`,
        text: [
          `Gentile ${notary.fullName},`,
          '',
          'un utente di NotaioGiusto.it ha selezionato il suo studio per una richiesta di preventivo.',
          'Può rispondere direttamente a questa email per contattare il richiedente.',
          '',
          ...lines,
        ].join('\n'),
        html: emailShell('Richiesta di preventivo', `
          <p>Gentile <strong>${escapeHtml(notary.fullName)}</strong>,</p>
          <p>un utente di NotaioGiusto.it ha selezionato il suo studio per una richiesta di preventivo. Può rispondere direttamente a questa email per contattare il richiedente.</p>
          ${table}
        `),
      }).then((result) => ({
        kind: 'notary' as const,
        to: notary.email,
        notaryId: notary.id,
        result,
      })),
    );
  }

  return Promise.all(deliveries);
}
