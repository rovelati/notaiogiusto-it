import nodemailer from 'nodemailer';

export type MailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
};

export type MailResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

function env(name: string) {
  return String(import.meta.env[name] || process.env[name] || '').trim();
}

function smtpConfig() {
  return {
    host: env('SMTP_HOST') || 'smtp-relay.brevo.com',
    port: Number(env('SMTP_PORT') || '587'),
    secure: env('SMTP_SECURE').toLowerCase() === 'true',
    user: env('SMTP_USER') || env('BREVO_SMTP_LOGIN'),
    pass: env('SMTP_PASS') || env('BREVO_SMTP_KEY'),
  };
}

export function isMailConfigured() {
  const config = smtpConfig();
  return Boolean(config.host && config.port && config.user && config.pass);
}

function createTransport() {
  const config = smtpConfig();
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

export function getMailAdminRecipient() {
  return env('MAIL_ADMIN_TO') || 'preventivi@notaiogiusto.it';
}

export async function verifyMailConnection(): Promise<MailResult> {
  if (!isMailConfigured()) {
    return { success: false, error: 'SMTP Brevo non configurato.' };
  }

  try {
    await createTransport().verify();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Connessione SMTP Brevo non riuscita.' };
  }
}

export async function sendMail(payload: MailPayload): Promise<MailResult> {
  if (!isMailConfigured()) {
    return { success: false, error: 'SMTP Brevo non configurato.' };
  }

  try {
    const info = await createTransport().sendMail({
      from: payload.from || env('MAIL_FROM') || 'NotaioGiusto Preventivi <preventivi@notaiogiusto.it>',
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      replyTo: payload.replyTo,
    });
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Invio email non riuscito.' };
  }
}

export function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
