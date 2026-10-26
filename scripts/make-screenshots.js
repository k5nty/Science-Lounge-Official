// Captures the screenshots used in docs/KAK-VESTI-SAYT.md from a running dev server.
// Usage: BASE=http://localhost:3100 EMAIL=... PASSWORD=... node scripts/make-screenshots.js
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://localhost:3100';
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.resolve(process.argv[2] || 'docs/screenshots');
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.5 });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

async function shot(name, url, { selector, full = false, clip } = {}) {
  await page.goto(BASE + url, { waitUntil: 'networkidle0' });
  if (selector) {
    await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70);
    }, selector);
    await new Promise((r) => setTimeout(r, 250));
  }
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full, clip });
  console.log(name);
}

await shot('01-login', '/admin/login');
await page.type('#email', EMAIL);
await page.type('#password', PASSWORD);
await Promise.all([page.waitForNavigation(), page.keyboard.press('Enter')]);

await shot('02-dashboard', '/admin');
await shot('03-issues-list', '/admin/issues');
await shot('04-issue-main', '/admin/issues/1');
await shot('05-issue-announce', '/admin/issues/1', { selector: '#s-announce' });
await shot('06-issue-notes', '/admin/issues/1', { selector: '#s-material' });
await shot('07-issue-video', '/admin/issues/1', { selector: '#s-video' });
await shot('08-issue-photos', '/admin/issues/1', { selector: '#s-photos' });
await shot('09-issue-publish', '/admin/issues/1', { selector: '#s-publish' });
await shot('10-issue-preview', '/admin/issues/1/preview');
await shot('11-lecturers', '/admin/lecturers');
await shot('12-lecturer-form', '/admin/lecturers/1');
await shot('13-conference-form', '/admin/conferences/1');
await shot('14-team', '/admin/team');
await shot('15-feedback', '/admin/feedback');
await shot('16-settings', '/admin/settings');
await shot('17-users', '/admin/users');
await shot('18-backups', '/admin/backups');
await shot('19-site-home', '/');
await shot('20-site-schedule', '/raspisanie');
await browser.close();
