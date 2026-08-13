import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const PROFILE_DIR = process.env.PG_BROWSER_PROFILE || path.join(SCRIPT_DIR, 'state', 'pg-browser-profile');
const TARGET_URL = process.env.PG_PREFLIGHT_URL || 'https://www.paginegialle.it/ricerca/notai/Milano';
const ENV_PATH = process.env.PG_ENV_PATH || path.join(SCRIPT_DIR, '.env');
const HEADLESS = process.env.PG_HEADLESS !== '0';
const TIMEOUT_MS = Number(process.env.PG_TIMEOUT_MS || 90000);
const WAIT_AFTER_LOAD_MS = Number(process.env.PG_WAIT_AFTER_LOAD_MS || 12000);

const androidUa = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36';

function upsertEnvValue(filePath, key, value) {
  let lines = [];
  if (fs.existsSync(filePath)) {
    lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  }
  const encoded = `${key}=${value}`;
  let found = false;
  lines = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return encoded;
    }
    return line;
  });
  if (!found) lines.push(encoded);
  fs.writeFileSync(filePath, lines.filter((line, idx, arr) => line || idx < arr.length - 1).join('\n') + '\n', { mode: 0o600 });
}

function cookieHeader(cookies) {
  return cookies
    .filter((cookie) => cookie.domain.includes('paginegialle.it'))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

async function main() {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: HEADLESS,
    userAgent: androidUa,
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    extraHTTPHeaders: {
      'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
      'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      'upgrade-insecure-requests': '1'
    }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT_MS);
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
  await page.waitForTimeout(WAIT_AFTER_LOAD_MS);

  const html = await page.content();
  const lowered = html.slice(0, 5000).toLowerCase();
  const waf = lowered.includes('awswaf') || lowered.includes('challenge-container') || lowered.includes("verify that you're not a robot");
  const title = await page.title().catch(() => '');
  const cookies = await context.cookies('https://www.paginegialle.it');
  const header = cookieHeader(cookies);

  await context.close();

  if (waf || html.length < 10000 || !header) {
    console.error(JSON.stringify({
      ok: false,
      reason: waf ? 'waf_challenge' : 'invalid_html_or_empty_cookie',
      title,
      htmlLength: html.length,
      cookieCount: cookies.length
    }, null, 2));
    process.exit(3);
  }

  upsertEnvValue(ENV_PATH, 'PG_COOKIE', header);
  upsertEnvValue(ENV_PATH, 'PG_USER_AGENT', androidUa);
  upsertEnvValue(ENV_PATH, 'PG_SEC_CH_UA', '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"');
  upsertEnvValue(ENV_PATH, 'PG_SEC_CH_UA_MOBILE', '?1');
  upsertEnvValue(ENV_PATH, 'PG_SEC_CH_UA_PLATFORM', '"Android"');

  console.log(JSON.stringify({
    ok: true,
    targetUrl: TARGET_URL,
    title,
    htmlLength: html.length,
    cookieCount: cookies.length,
    envPath: ENV_PATH
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
