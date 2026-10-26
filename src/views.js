import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import nunjucks from 'nunjucks';
import { config } from './config.js';
import * as D from './lib/dates.js';
import { esc, renderRich, plainText } from './lib/markup.js';
import { videoEmbed } from './lib/video.js';

const assetHash = new Map();
export function assetUrl(rel) {
  if (!assetHash.has(rel)) {
    let v = '0';
    try {
      const buf = fs.readFileSync(path.join(config.publicDir, rel));
      v = crypto.createHash('md5').update(buf).digest('hex').slice(0, 8);
    } catch {
      /* missing asset */
    }
    if (config.isProd) assetHash.set(rel, v);
    else return `/assets/${rel}?v=${v}`;
  }
  return `/assets/${rel}?v=${assetHash.get(rel)}`;
}

/** <picture> with AVIF + WebP srcset. `sizes` tells the browser the rendered width. */
export function picture(m, opts = {}) {
  if (!m || m.kind !== 'image') return '';
  const widths = typeof m.widths === 'string' ? JSON.parse(m.widths || '[]') : m.widths || [];
  if (!widths.length) return '';
  const srcset = (ext) => widths.map((w) => `/media/img/${m.base}/${w}.${ext} ${w}w`).join(', ');
  const preferred = opts.src || 960;
  const def = widths.find((w) => w >= preferred) || widths[widths.length - 1];
  const alt = opts.alt !== undefined ? opts.alt : m.alt || '';
  const sizes = opts.sizes || '100vw';
  const cls = opts.cls ? ` class="${esc(opts.cls)}"` : '';
  const loading = opts.eager ? 'eager' : 'lazy';
  const prio = opts.eager ? ' fetchpriority="high"' : '';
  const dims = m.width && m.height ? ` width="${m.width}" height="${m.height}"` : '';
  const full = widths[widths.length - 1];
  const data = opts.lightbox ? ` data-full="/media/img/${m.base}/${full}.webp"` : '';
  return new nunjucks.runtime.SafeString(
    `<picture><source type="image/avif" srcset="${srcset('avif')}" sizes="${esc(sizes)}">` +
      `<source type="image/webp" srcset="${srcset('webp')}" sizes="${esc(sizes)}">` +
      `<img src="/media/img/${m.base}/${def}.webp"${dims} alt="${esc(alt)}"${cls} loading="${loading}" decoding="async"${prio}${data}></picture>`,
  );
}

export function readingMinutes(issue) {
  const chars =
    (issue.ideas || []).reduce((a, x) => a + plainText(x.body || '').length + (x.h || '').length, 0) +
    (issue.qa || []).reduce((a, x) => a + (x.q || '').length + (x.a || '').length, 0);
  return Math.max(1, Math.round(chars / 1100));
}

export function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0].toUpperCase())
    .join('');
}

export function createViews(app) {
  const env = nunjucks.configure(config.viewsDir, {
    autoescape: true,
    express: app,
    noCache: !config.isProd,
    watch: false,
  });
  app.set('view engine', 'njk');

  const safe = (html) => new nunjucks.runtime.SafeString(html);

  env.addGlobal('picture', picture);
  env.addGlobal('asset', assetUrl);
  env.addGlobal('initials', initials);
  env.addGlobal('pad2', (n) => String(n).padStart(2, '0'));
  env.addGlobal('issueNo', (n) => `№\u00A0${String(n).padStart(2, '0')}`);
  env.addGlobal('rich', (text, state) => safe(renderRich(text, state)));
  env.addGlobal('fileUrl', (m) => (m ? `/media/files/${m.base}${m.ext}` : ''));
  env.addGlobal('readingMinutes', readingMinutes);
  env.addGlobal('siteUrl', config.siteUrl);
  env.addGlobal('videoEmbed', videoEmbed);

  env.addGlobal('dLong', D.longDate);
  env.addGlobal('dLongEn', D.longDateEn);
  env.addGlobal('dShort', D.shortDate);
  env.addGlobal('dTime', D.timeOf);
  env.addGlobal('dWd', D.weekday);
  env.addGlobal('dWdLong', D.weekdayLong);
  env.addGlobal('dWdEn', D.weekdayEn);
  env.addGlobal('dMonthYear', D.monthYear);
  env.addGlobal('dMonthYearEn', D.monthYearEn);
  env.addGlobal('dMonthKey', D.monthKey);
  env.addGlobal('dRange', D.dateRangeRu);
  env.addGlobal('dRangeEn', D.dateRangeEn);
  env.addGlobal('dLocalInput', D.toLocalInput);
  env.addGlobal('dDateInput', D.dateInput);
  env.addGlobal('dIso', (iso) => iso);

  env.addFilter('jsonld', (value) => safe(JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')));
  env.addFilter('json', (value) => safe(JSON.stringify(value ?? null).replace(/</g, '\\u003c')));
  env.addFilter('plain', (v) => plainText(v));
  env.addFilter('fromjson', (v) => (typeof v === 'string' ? JSON.parse(v || '[]') : v));
  env.addFilter('map_names', (list, lang) => (list || []).map((l) => (lang === 'en' && l.name_en ? l.name_en : l.name_ru)).join(', '));
  env.addFilter('nl2br', (v) => safe(esc(v).replace(/\n/g, '<br>')));
  env.addFilter('lines', (v) => String(v || '').split('\n'));
  env.addFilter('join_nl', (arr) => (Array.isArray(arr) ? arr.join('\n') : ''));
  env.addFilter('fmt', (v, ...args) => String(v).replace(/%s/g, () => args.shift()));
  env.addFilter('hostname', (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return u;
    }
  });
  env.addFilter('bytes', (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`));
  return env;
}
