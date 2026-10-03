import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

function secret() {
  return process.env.ADMIN_TOKEN || process.env.AUTH_SECRET || 'notaiogiusto-dev-antispam';
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Sfida antispam semplice (somma) con token firmato. */
export function createMathChallenge(ttlMs = 30 * 60 * 1000) {
  const a = randomInt(2, 9);
  const b = randomInt(1, 9);
  const answer = String(a + b);
  const exp = String(Date.now() + ttlMs);
  const payload = `${answer}.${exp}`;
  return {
    question: `${a} + ${b}`,
    token: `${payload}.${sign(payload)}`,
  };
}

export function verifyMathChallenge(token: string | null | undefined, answerRaw: string | null | undefined) {
  const tokenValue = String(token || '').trim();
  const answer = String(answerRaw || '').trim().replace(/\s+/g, '');
  if (!tokenValue || !answer) return false;
  const parts = tokenValue.split('.');
  if (parts.length !== 3) return false;
  const [expected, exp, sig] = parts;
  const payload = `${expected}.${exp}`;
  if (!safeEqual(sign(payload), sig)) return false;
  if (Number(exp) < Date.now()) return false;
  return expected === answer;
}
