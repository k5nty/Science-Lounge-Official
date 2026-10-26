// Automatic science news: reads public RSS feeds and stores the headline, one or two sentences and a link to the source.
// Nothing else is copied: no full text, no pictures.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { getDb, j, nowIso } from '../db.js';
import { getSettings } from '../settings.js';

const PER_SOURCE = 4; // newest items taken from one feed per run
const MAX_AGE_DAYS = 10; // older items are not imported
const KEEP_DAYS = 45; // automatic items older than this are removed
const SUMMARY_MAX = 260;
const SKIP_TITLE = /^(APOD:|Nobel Prize lessons)/; // a picture with no text to quote; teaching material that repeats the prize news

/* ---------- parsing ---------- */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', laquo: '«', raquo: '»', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(cp);
      } catch {
        return '';
      }
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Plain text out of an XML field that holds text, entity-escaped HTML or a CDATA section with HTML. */
function plain(raw) {
  if (!raw) return '';
  let s = /<!\[CDATA\[/.test(raw) ? raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1') : decode(raw);
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ');
  return decode(s).replace(/\s+/g, ' ').trim();
}

const field = (block, name) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? m[1] : '';
};

function linkOf(block) {
  const text = plain(field(block, 'link'));
  if (/^https?:\/\//i.test(text)) return text;
  const atom = /<link\b[^>]*\bhref="([^"]+)"/i.exec(block); // Atom: <link href="…"/>
  return atom ? decode(atom[1]) : '';
}

/** Cuts a summary to a sentence or a word boundary. */
export function shorten(text, max = SUMMARY_MAX) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentence > 100) return cut.slice(0, sentence + 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 60 ? cut.lastIndexOf(' ') : max).replace(/[\s,;:–—-]+$/, '')}…`;
}

/** RSS 2.0 and Atom: returns { title, link, summary, date } for every entry with a title, a link and a valid date. */
export function parseFeed(xml) {
  const out = [];
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  for (const block of blocks) {
    const title = plain(field(block, 'title'));
    const link = linkOf(block);
    const date = new Date(plain(field(block, 'pubDate') || field(block, 'published') || field(block, 'updated') || field(block, 'dc:date')));
    if (!title || SKIP_TITLE.test(title) || !/^https?:\/\//i.test(link) || Number.isNaN(date.getTime())) continue;
    let summary = plain(field(block, 'description') || field(block, 'summary') || field(block, 'content'))
      .replace(/\s*The post .{0,300} appeared first on .{0,100}$/i, '')
      .replace(/\s*\[…\]$/, '…');
    if (summary.toLowerCase().includes(title.toLowerCase()) || title.toLowerCase().startsWith(summary.toLowerCase())) summary = '';
    out.push({ title, link, summary: shorten(summary), date });
  }
  return out;
}

/* ---------- sources ---------- */

const PRIVATE_HOST = /^(localhost|.*\.(local|internal|lan)|\[.*\]|\d{1,3}(\.\d{1,3}){3})$/i;

/** One source per line: `ru|Название|https://адрес-ленты`. Lines starting with # are comments. */
export function parseSources(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const [lang, name, url] = line.split('|').map((x) => x.trim());
    if (!lang || line.trim().startsWith('#') || !['ru', 'en'].includes(lang) || !name || !url) continue;
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' || PRIVATE_HOST.test(u.hostname)) continue;
      out.push({ lang, name: name.slice(0, 60), url: u.href });
    } catch {
      /* skip */
    }
  }
  return out.slice(0, 12);
}

export async function fetchFeed(url, { timeoutMs = 12000, maxBytes = 3_000_000 } = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'ScienceLoungeBot/1.0 (school lecture series website)', accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5' },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (new URL(res.url).protocol !== 'https:') throw new Error('redirect to a non-https address');
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('feed is too large');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const label = /encoding=["']([\w-]+)["']/i.exec(bytes.subarray(0, 200).toString('latin1'))?.[1] || /charset=([\w-]+)/i.exec(res.headers.get('content-type') || '')?.[1] || 'utf-8';
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return bytes.toString('utf8');
  }
}

/* ---------- storage ---------- */

const normalizeUrl = (link) => {
  const u = new URL(link);
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|yclid|from$)/i.test(k)) u.searchParams.delete(k);
  u.hash = '';
  return u.href;
};

function store(source, items, now) {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO news(slug,title_ru,title_en,summary_ru,summary_en,source_name,source_url,published_at,tags,published,updated_at,external_id,auto)
     VALUES(@slug,@title_ru,@title_en,@summary_ru,@summary_en,@source_name,@source_url,@published_at,'[]',1,@updated_at,@external_id,1)`,
  );
  let added = 0;
  for (const it of items) {
    const url = normalizeUrl(it.link);
    const ru = source.lang === 'ru';
    const info = insert.run({
      slug: `a-${crypto.createHash('sha1').update(url).digest('hex').slice(0, 12)}`,
      title_ru: ru ? it.title.slice(0, 220) : '',
      title_en: ru ? '' : it.title.slice(0, 220),
      summary_ru: ru ? it.summary : '',
      summary_en: ru ? '' : it.summary,
      source_name: source.name,
      source_url: url,
      published_at: new Date(Math.min(it.date.getTime(), now)).toISOString(),
      updated_at: nowIso(),
      external_id: url,
    });
    added += info.changes;
  }
  return added;
}

function prune(now) {
  const cutoff = new Date(now - KEEP_DAYS * 86400e3).toISOString();
  return getDb().prepare('DELETE FROM news WHERE auto = 1 AND published_at < ?').run(cutoff).changes;
}

let running = false;

/**
 * Reads every source, stores new items and removes old automatic ones.
 * `fetcher` and `sources` exist for tests; the result is also kept in the settings table for the admin page.
 */
export async function refreshNews({ fetcher = fetchFeed, sources = null, now = Date.now() } = {}) {
  if (running) return { skipped: true, results: [] };
  running = true;
  try {
    const list = sources || parseSources(getSettings().news_sources);
    const results = [];
    for (const src of list) {
      try {
        const oldest = now - MAX_AGE_DAYS * 86400e3;
        const items = parseFeed(await fetcher(src.url))
          .filter((i) => i.date.getTime() >= oldest)
          .sort((a, b) => b.date - a.date)
          .slice(0, PER_SOURCE);
        results.push({ name: src.name, ok: true, found: items.length, added: store(src, items, now) });
      } catch (e) {
        results.push({ name: src.name, ok: false, error: String(e.message || e).slice(0, 120) });
      }
    }
    const removed = prune(now);
    const report = { at: new Date(now).toISOString(), removed, results };
    getDb()
      .prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run('news_last_run', JSON.stringify(report));
    return report;
  } finally {
    running = false;
  }
}

export const lastNewsRun = () => {
  const v = getSettings().news_last_run;
  return v && typeof v === 'object' ? v : j.parse(v, null);
};

/** First run a minute and a half after start, then every three hours. */
export function scheduleNewsRefresh() {
  if (!config.newsAuto) return;
  const run = () => {
    if (String(getSettings().news_auto) !== '1') return;
    refreshNews()
      .then((r) => console.log(`[news] ${r.results.map((x) => `${x.name}: ${x.ok ? `+${x.added}` : `ошибка (${x.error})`}`).join(', ')}`))
      .catch((err) => console.error('[news] failed:', err.message));
  };
  setTimeout(run, 90e3).unref();
  setInterval(run, 3 * 3600e3).unref();
}
