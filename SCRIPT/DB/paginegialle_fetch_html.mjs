#!/usr/bin/env node
import { chromium, devices } from "playwright";
import path from "node:path";
import process from "node:process";

const url = process.argv[2];
if (!url) {
  console.error("Uso: node paginegialle_fetch_html.mjs <url>");
  process.exit(2);
}

const profileDir = process.env.PG_BROWSER_PROFILE || path.join(process.cwd(), "state", "pg-browser-profile");
const pixel = devices["Pixel 7"];

const context = await chromium.launchPersistentContext(profileDir, {
  headless: true,
  ...pixel,
  locale: "it-IT",
  timezoneId: "Europe/Rome",
  userAgent:
    process.env.PG_USER_AGENT ||
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36",
  extraHTTPHeaders: {
    "accept-language": "it-IT,it;q=0.9,en;q=0.8",
    "upgrade-insecure-requests": "1",
    "sec-ch-ua": process.env.PG_SEC_CH_UA || '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
    "sec-ch-ua-mobile": process.env.PG_SEC_CH_UA_MOBILE || "?1",
    "sec-ch-ua-platform": process.env.PG_SEC_CH_UA_PLATFORM || '"Android"',
  },
});

try {
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(Number(process.env.PG_BROWSER_SETTLE_MS || 8000));
  const html = await page.content();
  const low = html.slice(0, 5000).toLowerCase();
  if (
    html.length < 10000 ||
    low.includes("awswaf") ||
    low.includes("challenge-container") ||
    low.includes("verify that you're not a robot")
  ) {
    console.error(`PagineGialle browser fetch non valido per ${url}: ${html.length} byte`);
    process.exit(3);
  }
  process.stdout.write(html);
} finally {
  await context.close();
}
