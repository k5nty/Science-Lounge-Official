import express from 'express';
import { config } from '../config.js';
import { getSettings } from '../settings.js';
import { visibleIssues, getIssueBySlug, issueIsVisible, listConferences } from '../models.js';
import { vcalendar, issueEvent } from '../lib/ics.js';
import { renderOg } from '../lib/og.js';
import { esc, plainText } from '../lib/markup.js';
import { longDate, longDateEn, shortDate } from '../lib/dates.js';

export const router = express.Router();

const noLabel = (n) => `№ ${String(n).padStart(2, '0')}`;

function icsResponse(res, body, filename) {
  res.set({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `inline; filename="${filename}"`,
    'Cache-Control': 'public, max-age=600',
  });
  res.send(body);
}

router.get('/raspisanie.ics', (req, res) => {
  const issues = visibleIssues();
  const events = issues.map((i) => issueEvent(i, i.lecturers.map((l) => l.name_ru), { numberLabel: noLabel(i.number) }));
  const settings = getSettings();
  icsResponse(res, vcalendar(events, { name: `${settings.site_title}: лекции`, description: settings.site_tagline }), 'science-lounge.ics');
});

router.get('/vypusk/:slug.ics', (req, res, next) => {
  const issue = getIssueBySlug(req.params.slug);
  if (!issue || !issueIsVisible(issue)) return next();
  const ev = issueEvent(issue, issue.lecturers.map((l) => l.name_ru), { numberLabel: noLabel(issue.number) });
  icsResponse(res, vcalendar([ev], { name: `Science Lounge ${noLabel(issue.number)}` }), `science-lounge-${issue.slug}.ics`);
});

router.get('/feed.xml', (req, res) => {
  const settings = getSettings();
  const items = visibleIssues()
    .filter((i) => i.past)
    .sort((a, b) => b.start_at.localeCompare(a.start_at))
    .slice(0, 30);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(settings.site_title)}</title>
<link>${config.siteUrl}/</link>
<description>${esc(settings.seo_description)}</description>
<language>ru</language>
<atom:link href="${config.siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
${items
  .map((i) => {
    const url = `${config.siteUrl}/vypusk/${i.slug}`;
    const lect = i.lecturers.map((l) => l.name_ru).join(', ');
    return `<item>
<title>${esc(`${noLabel(i.number)} ${i.title_ru}`)}</title>
<link>${url}</link>
<guid isPermaLink="true">${url}</guid>
<pubDate>${new Date(i.start_at).toUTCString()}</pubDate>
<description>${esc(`${lect ? `${lect}. ` : ''}${i.thought_ru}`)}</description>
</item>`;
  })
  .join('\n')}
</channel>
</rss>`;
  res.type('application/rss+xml').send(xml);
});

router.get('/sitemap.xml', (req, res) => {
  const base = config.siteUrl;
  const issues = visibleIssues();
  const urls = [];
  const add = (loc, { alt, lastmod } = {}) => urls.push({ loc, alt, lastmod });
  add(`${base}/`, { alt: `${base}/en/` });
  ['/raspisanie', '/vypuski', '/novosti', '/o-nas', '/otzyv', '/politika'].forEach((p) => add(`${base}${p}`));
  const confs = listConferences();
  if (confs.length) add(`${base}/konferentsiya`);
  confs.forEach((c) => add(`${base}/konferentsiya/${c.year}`, { alt: `${base}/en/conference/${c.year}`, lastmod: c.updated_at }));
  issues.forEach((i) => add(`${base}/vypusk/${i.slug}`, { alt: `${base}/en/issues/${i.slug}`, lastmod: i.updated_at }));
  add(`${base}/en/issues`);
  add(`${base}/en/news`);
  add(`${base}/en/about`);
  const body = urls
    .map(
      (u) =>
        `<url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.slice(0, 10)}</lastmod>` : ''}${
          u.alt ? `<xhtml:link rel="alternate" hreflang="en" href="${esc(u.alt)}"/><xhtml:link rel="alternate" hreflang="ru" href="${esc(u.loc)}"/>` : ''
        }</url>`,
    )
    .join('\n');
  res
    .type('application/xml')
    .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${body}\n</urlset>`);
});

router.get('/robots.txt', (req, res) => {
  res
    .type('text/plain')
    .send(`User-agent: *\nDisallow: /admin\nDisallow: /forms/\nDisallow: /otzyv/\nAllow: /\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
});

router.get('/favicon.ico', (req, res) => res.redirect(301, '/assets/img/favicon.svg'));

router.get('/og/default.png', async (req, res, next) => {
  try {
    const s = getSettings();
    const png = await renderOg({ title: s.site_tagline || 'Лекторий школы «Летово»', brand: (s.site_title || 'Science Lounge').toUpperCase() });
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' }).send(png);
  } catch (e) {
    next(e);
  }
});

router.get('/og/:slug.png', async (req, res, next) => {
  try {
    const issue = getIssueBySlug(req.params.slug);
    if (!issue || !issueIsVisible(issue)) return res.redirect(302, '/og/default.png');
    const lecturer = issue.lecturers.map((l) => l.name_ru).join(', ');
    const photo = issue.cover || issue.lecturer?.portrait || null;
    const png = await renderOg({
      number: issue.number,
      title: issue.title_ru,
      lecturer,
      dateLine: `${longDate(issue.start_at)}${issue.place_ru ? ` · ${issue.place_ru}` : ''}`,
      photoBase: photo ? photo.base : '',
    });
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' }).send(png);
  } catch (e) {
    next(e);
  }
});

export { plainText, longDateEn, shortDate };
