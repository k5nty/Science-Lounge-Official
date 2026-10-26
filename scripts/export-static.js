// Static snapshot of the site for GitHub Pages (view-only demo: forms are off, the admin is a read-only tour with a throw-away demo user).
// It starts a private copy of the app on a spare port with a temporary copy of the data, crawls it and writes plain files.
//
// Usage: node scripts/export-static.js <outDir> <basePath> <siteUrl> [theme]
//   e.g. node scripts/export-static.js /tmp/out /science-lounge https://user.github.io/science-lounge events
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { hashPassword } from '../src/lib/security.js';

const [, , outArg, baseArg = '', siteUrlArg = '', themeArg = 'events'] = process.argv;
if (!outArg || !siteUrlArg) {
  console.error('Usage: node scripts/export-static.js <outDir> <basePath> <siteUrl> [theme]');
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(outArg);
const BASE = baseArg.replace(/\/+$/, ''); // '' or '/science-lounge'
const SITE = siteUrlArg.replace(/\/+$/, '');
const PORT = 3600 + Math.floor(Math.random() * 300);
const ORIGIN = `http://127.0.0.1:${PORT}`;

/* ---------- private copy of the data, with the public-demo adjustments ---------- */
const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'sl-export-'));
const dataSrc = path.join(root, 'data');
const dataCopy = path.join(tmp, 'data');
await fsp.mkdir(dataCopy, { recursive: true });
const srcDb = new Database(path.join(dataSrc, 'science-lounge.db'), { readonly: true });
await srcDb.backup(path.join(dataCopy, 'science-lounge.db'));
srcDb.close();
await fsp.cp(path.join(dataSrc, 'uploads'), path.join(dataCopy, 'uploads'), { recursive: true });

const db = new Database(path.join(dataCopy, 'science-lounge.db'));
const set = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
set.run('site_theme', JSON.stringify(themeArg));
set.run('theme_switcher', JSON.stringify('0'));
// Private links must not leave the machine: unlisted videos and shared drives.
db.prepare("UPDATE issues SET video_full_url = '' WHERE video_full_url LIKE '%/private/%'").run();
db.prepare("UPDATE issues SET reads = '[]' WHERE reads LIKE '%disk.yandex%'").run();
// One page of news in the snapshot: the pager would point at pages that are not exported.
db.prepare("UPDATE news SET published = 0 WHERE auto = 1 AND id NOT IN (SELECT id FROM news WHERE auto = 1 AND published = 1 ORDER BY published_at DESC LIMIT 12)").run();
db.prepare('DELETE FROM users').run();
// The admin tour is crawled with a throw-away user that exists only in this temporary copy.
const DEMO_EMAIL = 'demo@science-lounge.test';
const demoPass = crypto.randomBytes(12).toString('hex');
db.prepare('INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,?)').run(DEMO_EMAIL, 'Демо', await hashPassword(demoPass), 'admin');
for (const k of ['contact_email', 'operator_email', 'operator_name']) set.run(k, JSON.stringify(''));
db.prepare('DELETE FROM sessions').run();
db.prepare('DELETE FROM feedback').run();
db.close();

const child = spawn('node', ['src/server.js'], {
  cwd: root,
  env: { ...process.env, DATA_DIR: dataCopy, PORT: String(PORT), HOST: '127.0.0.1', SITE_URL: SITE, BACKUP_ENABLED: 'false', NEWS_AUTO: 'false', ADMIN_EMAIL: '', ADMIN_PASSWORD: '', METRIKA_ID: '', TG_BOT_TOKEN: '', TG_CHAT_ID: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let ready = false;
child.stdout.on('data', (d) => {
  if (String(d).includes('слушаю')) ready = true;
});
for (let i = 0; i < 60 && !ready; i++) await new Promise((r) => setTimeout(r, 250));
if (!ready) {
  child.kill();
  console.error('Сервер экспорта не запустился');
  process.exit(1);
}

/* ---------- crawl ---------- */
const seen = new Set();
const queue = ['/', '/en/', '/vypuski', '/raspisanie', '/novosti', '/konferentsiya', '/o-nas', '/otzyv', '/politika', '/udalit-foto', '/en/issues', '/en/schedule', '/en/news', '/en/about', '/en/feedback', '/en/conference', '/search-index.json', '/feed.xml', '/sitemap.xml', '/raspisanie.ics', '/og/default.png', '/assets/img/favicon.svg'];
const skip = (p) => /^\/admin\/(logout|media)(\/|$)/.test(p) || /^\/admin\/backups\/[^/]+\/[^/]+/.test(p) || /\.csv$/.test(p) || p.startsWith('/forms') || p.startsWith('/healthz') || p.startsWith('/vendor/katex/fonts');
const written = [];
let adminPhase = false;
let adminCookie = '';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const siteRe = new RegExp(`${esc(SITE)}(/[^"'\\s)<>]*)`, 'g');

function enqueue(raw) {
  if (!raw) return;
  let p = raw.trim();
  if (p.startsWith(SITE)) p = p.slice(SITE.length) || '/';
  if (!p.startsWith('/') || p.startsWith('//')) return;
  p = p.split('#')[0].split('?')[0];
  if (!p || skip(p)) return;
  if (adminPhase && p.startsWith('/media/') && !seen.has(p)) return; // photos shown only in the admin (consent not public) stay out
  try {
    p = decodeURI(p);
  } catch {
    /* keep */
  }
  if (!seen.has(p)) {
    seen.add(p);
    queue.push(p);
  }
}
queue.forEach((p) => seen.add(p));

function discover(html) {
  for (const m of html.matchAll(/(?:href|src|data-full|data-src|poster)="([^"]+)"/g)) enqueue(m[1]);
  for (const m of html.matchAll(/srcset="([^"]+)"/g)) for (const part of m[1].split(',')) enqueue(part.trim().split(/\s+/)[0]);
  for (const m of html.matchAll(siteRe)) enqueue(m[1]);
}
function discoverCss(css) {
  for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) enqueue(m[1]);
}

const prefix = (u) => (u.startsWith('/') && !u.startsWith('//') ? `${BASE}${u}` : u);

function rewriteHtml(html) {
  let h = html;
  h = h.replace(/\b(href|src|action|data-full|data-src|poster)="(\/(?!\/)[^"]*)"/g, (_, a, u) => `${a}="${prefix(u)}"`);
  h = h.replace(/srcset="([^"]+)"/g, (_, v) => `srcset="${v.split(',').map((x) => { const [u, ...rest] = x.trim().split(/\s+/); return [prefix(u), ...rest].join(' '); }).join(', ')}"`);
  h = h.replace(/(<meta name="csrf" content=")[^"]*/g, '$1demo').replace(/(name="_csrf" value=")[^"]*/g, '$1demo');
  // a prototype must not be indexed as the official site
  h = h.replace('</head>', '<meta name="robots" content="noindex, nofollow"></head>');
  h = h.replace(/<meta name="robots" content="noindex, follow">/g, '');
  h = h.replace('</body>', `<script src="${BASE}/demo.js" defer></script></body>`);
  return h;
}
const rewriteCss = (css) => css.replace(/url\(\s*(["']?)(\/(?!\/)[^"')]+)\1\s*\)/g, (_, q, u) => `url(${q}${prefix(u)}${q})`);
const rewriteJs = (js) => js.replace(/(['"])\/(search-index\.json|assets\/[^'"]*|media\/[^'"]*)\1/g, (_, q, u) => `${q}${BASE}/${u}${q}`);

function fileFor(p, type) {
  if (/\.[a-z0-9]{2,5}$/i.test(p)) return path.join(OUT, p);
  return path.join(OUT, p.replace(/\/+$/, ''), 'index.html');
}

await fsp.rm(OUT, { recursive: true, force: true });
await fsp.mkdir(OUT, { recursive: true });

async function write(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, data);
  written.push(file);
}

async function drain() {
while (queue.length) {
  const p = queue.shift();
  let res;
  try {
    const asAdmin = adminPhase && p.startsWith('/admin') && p !== '/admin/login';
    res = await fetch(ORIGIN + encodeURI(p), { redirect: 'manual', headers: { accept: '*/*', ...(asAdmin ? { cookie: adminCookie } : {}) } });
  } catch (e) {
    console.warn('fetch failed', p, e.message);
    continue;
  }
  const type = res.headers.get('content-type') || '';
  if (res.status >= 300 && res.status < 400) {
    const loc = (res.headers.get('location') || '').replace(ORIGIN, '');
    enqueue(loc);
    await write(fileFor(p), `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${prefix(loc)}"><link rel="canonical" href="${SITE}${loc}"><meta name="robots" content="noindex"><a href="${prefix(loc)}">→</a>`);
    continue;
  }
  if (res.status !== 200) {
    console.warn(res.status, p);
    continue;
  }
  if (type.includes('text/html')) {
    const html = await res.text();
    discover(html);
    await write(fileFor(p), rewriteHtml(html));
  } else if (type.includes('text/css')) {
    const css = await res.text();
    discoverCss(css);
    await write(fileFor(p), rewriteCss(css));
  } else if (type.includes('javascript')) {
    await write(fileFor(p), rewriteJs(await res.text()));
  } else {
    await write(fileFor(p), Buffer.from(await res.arrayBuffer()));
  }
}
}
await drain();

/* admin tour: log in with the throw-away user, crawl the admin pages; photos only if the public site shows them too */
const login = await fetch(`${ORIGIN}/admin/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: DEMO_EMAIL, password: demoPass, next: '/admin' }) });
adminCookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).filter((c) => c.startsWith('sl_sid=') && c.length > 8).join('; ');
if (!adminCookie) {
  child.kill();
  console.error('Вход демо-пользователя не удался');
  process.exit(1);
}
adminPhase = true;
for (const a of ['/admin/login', '/admin/', '/admin/help']) {
  seen.add(a);
  queue.push(a);
}
await drain();

// 404 page, demo helpers
const nf = await fetch(`${ORIGIN}/no-such-page`);
await write(path.join(OUT, '404.html'), rewriteHtml(await nf.text()));
await write(path.join(OUT, '.nojekyll'), '');
await write(path.join(OUT, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
await write(path.join(OUT, 'demo.js'), (await fsp.readFile(path.join(root, 'scripts', 'static-demo.js'), 'utf8')).replaceAll('__BASE__', BASE));

child.kill();
await fsp.rm(tmp, { recursive: true, force: true });
const bytes = (await Promise.all(written.map((f) => fsp.stat(f)))).reduce((a, s) => a + s.size, 0);
console.log(`Экспорт: ${written.length} файлов, ${(bytes / 1048576).toFixed(1)} МБ -> ${OUT}`);
