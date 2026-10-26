import express from 'express';
import { config } from '../config.js';
import { getSettings } from '../settings.js';
import { translator } from '../i18n.js';
import {
  visibleIssues,
  upcomingIssues,
  pastIssues,
  siteStats,
  ratingStats,
  listConferences,
  getConferenceByYear,
  getLecturerBySlug,
  listTeam,
  listNews,
  countNews,
  getIssueBySlug,
  issueIsVisible,
} from '../models.js';
import { renderRich, makeTermContext, plainText, truncate } from '../lib/markup.js';
import { renderMaterial } from '../lib/material.js';
import { readingMinutes } from '../views.js';
import { latestChannelPost } from '../lib/telegram.js';
import { formToken } from '../lib/security.js';
import { formSecret } from './forms.js';
import { isoNow, dateInput } from '../lib/dates.js';
import * as D from '../lib/dates.js';
import { renderRussiaMap } from '../lib/russia.js';
import { PATHS, RU_ONLY, pathFor, patterns } from '../routes-map.js';
import { THEMES, DEFAULT_THEME, THEME_COOKIE, isTheme, themePart, themeAsset } from '../themes.js';
import { parseCookies, setCookie } from '../auth.js';

export const router = express.Router();

/** Both language versions of a page share one handler. */
const both = (key, handler) => router.get(patterns(key), handler);

const nonEmpty = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '');

/** 'Физика (physics)' -> {ru:'Физика', en:'physics'}; the Russian part is the filter key. */
export function splitTag(tag) {
  const m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(String(tag));
  return m ? { key: m[1].trim(), ru: m[1].trim(), en: m[2].trim() } : { key: String(tag), ru: String(tag), en: String(tag) };
}

/* ---------- request context ---------- */

export function publicContext(req, res, next) {
  const lang = req.path === '/en' || req.path.startsWith('/en/') ? 'en' : 'ru';
  const settings = getSettings();
  const switcherOn = settings.theme_switcher !== '0';

  // Theme: ?theme=x (when the switcher is on) sets a cookie; otherwise cookie, then the site default.
  let theme = isTheme(settings.site_theme) ? settings.site_theme : DEFAULT_THEME;
  if (switcherOn) {
    const fromCookie = parseCookies(req.headers.cookie)[THEME_COOKIE];
    if (isTheme(req.query.theme)) {
      theme = req.query.theme;
      setCookie(res, THEME_COOKIE, theme, { maxAgeSec: 365 * 86400, httpOnly: false });
    } else if (isTheme(fromCookie)) {
      theme = fromCookie;
    }
  }
  res.append('Vary', 'Cookie');

  res.locals.lang = lang;
  res.locals.t = translator(lang);
  res.locals.settings = settings;
  res.locals.channelUrl = settings.channel_url || '';
  res.locals.analytics = { metrika: config.metrikaId, umamiSrc: config.umamiSrc, umamiId: config.umamiId };
  res.locals.activeNav = '';
  res.locals.formToken = formToken(formSecret());

  // Content in the current language; falls back to Russian when the English field is empty.
  res.locals.L = (obj, key) => {
    if (!obj) return '';
    if (lang === 'en') {
      const en = obj[`${key}_en`];
      if (nonEmpty(en)) return en;
    }
    const ru = obj[`${key}_ru`] ?? obj[key];
    return ru ?? '';
  };
  // true when the English page falls back to Russian for this field (templates may mark it lang="ru")
  res.locals.isFallback = (obj, key) => lang === 'en' && obj && !nonEmpty(obj[`${key}_en`]);

  res.locals.url = (key, params) => pathFor(key, lang, params);
  res.locals.lp = (p) => (lang === 'en' ? `/en${p === '/' ? '/' : p}` : p);
  res.locals.fx = {
    dl: lang === 'en' ? D.longDateEn : D.longDate,
    dwd: lang === 'en' ? D.weekdayEn : D.weekday,
    dmonth: lang === 'en' ? D.monthYearEn : D.monthYear,
    drange: lang === 'en' ? D.dateRangeEn : D.dateRangeRu,
  };
  res.locals.tagName = (tag) => splitTag(tag)[lang];
  res.locals.tagKey = (tag) => splitTag(tag).key;

  res.locals.navItems = () => {
    const active = res.locals.activeNav;
    return [
      { key: 'archive', nav: 'lectures', label: res.locals.t('nav.lectures') },
      { key: 'schedule', nav: 'schedule', label: res.locals.t('nav.schedule') },
      { key: 'news', nav: 'news', label: res.locals.t('nav.news') },
      { key: 'conference', nav: 'conference', label: res.locals.t('nav.conference') },
      { key: 'about', nav: 'about', label: res.locals.t('nav.about') },
      { key: 'feedback', nav: 'feedback', label: res.locals.t('nav.feedback'), cta: true },
    ].map((n) => ({ ...n, href: pathFor(n.key, lang), active: active === n.nav }));
  };
  res.locals.langSwitch = () => {
    const pg = res.locals.page || {};
    const strip = (u) => (u ? u.replace(config.siteUrl, '') : '');
    return lang === 'ru'
      ? { label: 'EN', hreflang: 'en', href: strip(pg.enUrl) || '/en/', title: res.locals.t('lang.switch_label') }
      : { label: 'RU', hreflang: 'ru', href: strip(pg.ruUrl) || '/', title: res.locals.t('lang.switch_label') };
  };
  res.locals.theme = theme;
  res.locals.themes = THEMES.filter((th) => !th.hidden);
  res.locals.themeSwitcher = switcherOn;
  res.locals.themePart = (part) => themePart(theme, part);
  res.locals.themeCss = themeAsset(theme, 'css');
  res.locals.themeJs = themeAsset(theme, 'js');
  res.locals.themeHref = (id) => {
    const u = new URL(req.originalUrl, 'http://x');
    u.searchParams.set('theme', id);
    return `${u.pathname}${u.search}`;
  };
  res.locals.page = { title: '', description: settings.seo_description };
  next();
}

/**
 * Page metadata. `key`+`params` name the page in routes-map; both language URLs are derived from them,
 * so the RU/EN switch always lands on the same page in the other language.
 */
function seo(res, { key, params, title, description, image, type = 'website', jsonld, noindex = false }) {
  const settings = res.locals.settings;
  const lang = res.locals.lang;
  const site = settings.site_title || 'Science Lounge';
  const tagline = lang === 'en' ? settings.site_tagline_en : settings.site_tagline;
  const fullTitle = title ? `${title} · ${site}` : `${site} · ${tagline || ''}`.replace(/ · $/, '');
  const base = lang === 'en' ? settings.seo_description_en || settings.seo_description : settings.seo_description;
  const ru = key ? pathFor(key, 'ru', params) : '';
  const en = key && !RU_ONLY.has(key) ? pathFor(key, 'en', params) : '';
  const own = lang === 'en' ? en || ru : ru;
  res.locals.page = {
    title: fullTitle,
    description: truncate(description || base, 200),
    canonical: own ? `${config.siteUrl}${own}` : '',
    ruUrl: ru ? `${config.siteUrl}${ru}` : '',
    enUrl: en ? `${config.siteUrl}${en}` : '',
    image: image ? `${config.siteUrl}${image}` : `${config.siteUrl}/og/default.png`,
    type,
    jsonld: jsonld || null,
    noindex,
    lang,
  };
}

/* ---------- view helpers ---------- */

export function statusOf(i) {
  if (i.status_flag === 'cancelled') return 'cancelled';
  if (i.past) return 'past';
  if (i.status_flag === 'moved') return 'moved';
  if (i.status_flag === 'sold_out') return 'sold_out';
  if (i.reg_enabled && i.reg_url) return 'reg_open';
  return 'soon';
}

const isoMsk = (iso) => {
  const d = new Date(Date.parse(iso) + 3 * 3600e3);
  return `${d.toISOString().slice(0, 19)}+03:00`;
};

function issueSearchText(i) {
  return [
    i.title_ru,
    i.thought_ru,
    i.announce_ru,
    ...i.lecturers.map((l) => l.name_ru),
    ...i.tags,
    ...i.ideas.flatMap((x) => [x.h, plainText(x.body), x.quote]),
    ...i.qa.flatMap((x) => [x.q, x.a]),
  ]
    .filter(Boolean)
    .join(' ');
}

/* ---------- pages (RU and EN share these handlers) ---------- */

both('home', (req, res) => {
  const lang = res.locals.lang;
  const L = res.locals.L;
  const all = visibleIssues();
  const next = upcomingIssues(all)[0] || null;
  const past = pastIssues(all);
  const lead = next || past[0] || null;
  const settings = res.locals.settings;
  const post = settings.tg_post || (settings.channel_url ? latestChannelPost(settings.channel_url) : null);
  seo(res, {
    key: 'home',
    title: '',
    description: lead ? `${L(lead, 'title')}. ${lead.lecturer ? L(lead.lecturer, 'name') : ''}`.trim() : undefined,
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: settings.site_title,
      url: config.siteUrl,
      description: lang === 'en' ? settings.seo_description_en : settings.seo_description,
      ...(settings.channel_url ? { sameAs: [settings.channel_url] } : {}),
    },
  });
  res.locals.activeNav = 'home';
  res.render('pages/home', {
    lead,
    isNext: Boolean(next),
    leadStatus: lead ? statusOf(lead) : '',
    latest: past.filter((i) => !lead || i.id !== lead.id || !next).slice(0, 3),
    upcomingList: all.filter((i) => !i.past && i.status_flag !== 'cancelled').sort((a, b) => a.start_at.localeCompare(b.start_at)).slice(0, 4),
    stats: siteStats(settings, all),
    tgPost: post,
    newsList: listNews({ limit: 3, lang: res.locals.lang }),
    leadHtml: lead ? renderRich(next ? L(lead, 'announce') : L(lead, 'thought') || L(lead, 'announce')) : '',
    hasMath: Boolean(lead && /\$[^$\n]+\$/.test(lead.announce_ru)),
  });
});

both('schedule', (req, res) => {
  const lang = res.locals.lang;
  const all = visibleIssues();
  const upcoming = all.filter((i) => !i.past).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const past = pastIssues(all);
  seo(res, {
    key: 'schedule',
    title: res.locals.t('sched.h'),
    description: lang === 'en' ? 'Science Lounge schedule: dates, topics, speakers.' : 'Расписание лекций Science Lounge: даты, темы, лекторы.',
  });
  res.locals.activeNav = 'schedule';
  res.render('pages/schedule', {
    upcoming,
    past,
    statusOf,
    webcal: `webcal://${new URL(config.siteUrl).host}/raspisanie.ics`,
  });
});

both('archive', (req, res) => {
  const lang = res.locals.lang;
  const all = visibleIssues();
  const past = pastIssues(all);
  const tag = String(req.query.tag || '').trim();
  const q = String(req.query.q || '').trim().toLowerCase();
  const tags = [...new Set(past.flatMap((i) => i.tags.map((x) => splitTag(x).key)))].sort((a, b) => a.localeCompare(b, lang));
  let list = past;
  if (tag) list = list.filter((i) => i.tags.some((x) => splitTag(x).key === tag));
  if (q) list = list.filter((i) => issueSearchText(i).toLowerCase().includes(q));
  seo(res, {
    key: 'archive',
    title: res.locals.t('archive.h'),
    description: lang === 'en' ? 'Science Lounge archive: write-ups, photos and recordings.' : 'Архив лекций Science Lounge: конспекты, фото и записи.',
    noindex: Boolean(q),
  });
  res.locals.activeNav = 'lectures';
  const tagFull = new Map(past.flatMap((i) => i.tags).map((x) => [splitTag(x).key, x]));
  res.render('pages/archive', {
    issues: list,
    totalCount: past.length,
    tags,
    tagFull,
    tag,
    q: String(req.query.q || ''),
    listeners: past.reduce((a, i) => a + (i.listeners || 0), 0),
  });
});

// Lecturers have no pages of their own any more: one talk = one speaker, and the talk page shows the speaker.
both('lecturers', (req, res) => res.redirect(301, pathFor('archive', res.locals.lang)));

both('lecturer', (req, res) => {
  const lecturer = getLecturerBySlug(req.params.slug);
  const latest = lecturer ? visibleIssues().filter((i) => i.lecturers.some((l) => l.id === lecturer.id)).sort((a, b) => b.number - a.number)[0] : null;
  res.redirect(301, latest ? pathFor('issue', res.locals.lang, { slug: latest.slug }) : pathFor('archive', res.locals.lang));
});

const NEWS_PER_PAGE = 18; // divisible by 2 and 3: full rows in every grid

both('news', (req, res) => {
  const lang = res.locals.lang;
  seo(res, {
    key: 'news',
    title: res.locals.t('news.h'),
    description: lang === 'en' ? 'News from the world of science.' : 'Новости из мира науки.',
  });
  res.locals.activeNav = 'news';
  const total = countNews({ lang });
  const pageCount = Math.max(1, Math.ceil(total / NEWS_PER_PAGE));
  const pageNo = Math.min(pageCount, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
  res.render('pages/news', { newsList: listNews({ lang, limit: NEWS_PER_PAGE, offset: (pageNo - 1) * NEWS_PER_PAGE }), pageNo, pageCount });
});

both('conference', (req, res) => {
  const confs = listConferences();
  if (confs.length) return res.redirect(302, pathFor('conferenceYear', res.locals.lang, { year: confs[0].year }));
  seo(res, { key: 'conference', title: res.locals.t('conf.h') });
  res.locals.activeNav = 'conference';
  return res.render('pages/conference', { conf: null, confs: [] });
});

both('conferenceYear', (req, res, next) => {
  const lang = res.locals.lang;
  const L = res.locals.L;
  const conf = getConferenceByYear(Number(req.params.year));
  if (!conf || !conf.published) return next();
  const confs = listConferences();
  const title = L(conf, 'title');
  seo(res, {
    key: 'conferenceYear',
    params: { year: conf.year },
    title: `${title}, ${conf.year}`,
    description: truncate(L(conf, 'intro') || (lang === 'en' ? `${title} ${conf.year}: programme, jury, posters, results.` : `Конференция ${title} ${conf.year}: программа, жюри, постеры, итоги.`), 180),
    image: conf.cover ? `/media/img/${conf.cover.base}/960.webp` : undefined,
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: `${title} ${conf.year}`,
      ...(conf.date_start ? { startDate: dateInput(conf.date_start) } : {}),
      ...(conf.date_end ? { endDate: dateInput(conf.date_end) } : {}),
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: L(conf, 'place') || 'Letovo School, Moscow' },
    },
  });
  res.locals.activeNav = 'conference';
  res.render('pages/conference', {
    conf,
    confs,
    intro: renderRich(L(conf, 'intro')),
    results: renderRich(L(conf, 'results')),
    mapSvg: renderRussiaMap(conf.regions, { label: lang === 'en' ? 'Participating regions on the map of Russia' : 'Регионы-участники на карте России' }),
  });
});

both('about', (req, res) => {
  const lang = res.locals.lang;
  const settings = res.locals.settings;
  const all = visibleIssues();
  const pick = (k) => (lang === 'en' && nonEmpty(settings[`${k}_en`]) ? settings[`${k}_en`] : settings[`${k}_ru`]);
  seo(res, { key: 'about', title: res.locals.t('about.h'), description: truncate(plainText(pick('about_story')) || undefined, 180) || undefined });
  res.locals.activeNav = 'about';
  const team = listTeam();
  const aboutPost = settings.tg_post || (settings.channel_url ? latestChannelPost(settings.channel_url) : null);
  res.render('pages/about', {
    tgPost: aboutPost,
    story: renderRich(pick('about_story')),
    thanks: renderRich(pick('about_thanks')),
    speak: renderRich(pick('speak_text')),
    founders: team.filter((m) => m.kind === 'founder'),
    helpers: team.filter((m) => m.kind === 'helper'),
    stats: siteStats(settings, all),
  });
});

both('feedback', (req, res) => {
  const all = visibleIssues();
  const type = ['review', 'question', 'suggest', 'contact'].includes(req.query.t) ? req.query.t : 'review';
  const pastList = pastIssues(all);
  const upList = all.filter((i) => !i.past && i.status_flag !== 'cancelled').sort((a, b) => a.start_at.localeCompare(b.start_at));
  seo(res, { key: 'feedback', title: res.locals.t('fb.h') });
  res.locals.activeNav = 'feedback';
  res.render('pages/feedback', {
    type,
    pastList,
    upList,
    pick: Number(req.query.v) || 0,
  });
});

// Short mobile page behind the QR code on the last slide.
both('review', (req, res, next) => {
  const issue = getIssueBySlug(req.params.slug);
  if (!issue || !issueIsVisible(issue)) return next();
  seo(res, { key: 'review', params: { slug: issue.slug }, title: `${res.locals.t('fb.review')} ${issue.title_ru}`, noindex: true });
  res.locals.activeNav = 'feedback';
  res.render('pages/review', { issue, started: Date.now() >= Date.parse(issue.start_at) });
});

both('privacy', (req, res) => {
  seo(res, { key: 'privacy', title: 'Политика обработки персональных данных' });
  res.render('pages/privacy', {});
});

both('photo', (req, res) => {
  seo(res, { key: 'photo', title: res.locals.t('photo.h'), noindex: true });
  res.render('pages/photo-removal', { where: String(req.query.u || '').slice(0, 300) });
});

both('thanks', (req, res) => {
  const type = ['review', 'question', 'suggest', 'contact', 'photo'].includes(req.query.t) ? req.query.t : '';
  seo(res, { key: 'thanks', title: res.locals.t('thanks.h'), noindex: true });
  res.render('pages/thanks', { type });
});

/* ---------- issue page ---------- */

export function buildIssueView(issue, res) {
  const settings = res.locals.settings;
  const lang = res.locals.lang;
  const all = visibleIssues();
  const byNumber = [...all].sort((a, b) => a.number - b.number);
  const idx = byNumber.findIndex((i) => i.id === issue.id);
  const prev = idx > 0 ? byNumber[idx - 1] : null;
  const next = idx >= 0 && idx < byNumber.length - 1 ? byNumber[idx + 1] : null;
  const similar = pastIssues(all)
    .filter((i) => i.id !== issue.id && i.tags.some((tg) => issue.tags.includes(tg)))
    .slice(0, 3);

  const state = { terms: makeTermContext(issue.terms, 't'), math: false };
  const notes = issue.ideas.map((x) => ({ h: x.h, html: renderRich(x.body, state), quote: x.quote || '', quote_by: x.quote_by || '' }));
  const qa = issue.qa.map((x) => ({ q: x.q, a: renderRich(x.a, { terms: [], math: false }), q_raw: x.q }));
  qa.forEach((x, i) => {
    const probe = { terms: [], math: false };
    renderRich(issue.qa[i].a, probe);
    if (probe.math) state.math = true;
  });
  const announceState = { terms: [], math: false };
  const announceHtml = renderRich(issue.announce_ru, announceState);
  if (announceState.math) state.math = true;

  const rating = ratingStats().get(issue.id) || null;
  const video = {
    cut: issue.video_cut_url ? { url: issue.video_cut_url, len: issue.video_cut_len } : null,
    full: issue.video_full_url ? { url: issue.video_full_url, len: issue.video_full_len } : null,
  };
  return {
    prev,
    next,
    similar,
    notes,
    qa,
    announceHtml,
    materialHtml: renderMaterial(issue.material_ru),
    hasMath: state.math,
    glossary: issue.terms.filter((x) => x.term && x.def),
    readMin: readingMinutes(issue),
    video,
    rating: issue.show_rating && rating && rating.n >= 1 ? rating : null,
    status: statusOf(issue),
    lang,
    channelUrl: settings.channel_url,
  };
}

export function issueJsonLd(issue, view) {
  const url = `${config.siteUrl}/vypusk/${issue.slug}`;
  const lecturers = issue.lecturers.map((l) => ({ '@type': 'Person', name: l.name_ru }));
  const image = `${config.siteUrl}/og/${issue.slug}.png`;
  if (!issue.past) {
    return {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: `${issue.title_ru}`,
      startDate: isoMsk(issue.start_at),
      endDate: isoMsk(new Date(Date.parse(issue.start_at) + config.lectureMinutes * 60e3).toISOString()),
      eventStatus:
        issue.status_flag === 'cancelled'
          ? 'https://schema.org/EventCancelled'
          : issue.status_flag === 'moved'
            ? 'https://schema.org/EventRescheduled'
            : 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: issue.place_ru || 'Школа «Летово»', address: 'Москва' },
      performer: lecturers,
      description: truncate(plainText(issue.announce_ru) || issue.thought_ru, 300),
      image: [image],
      url,
      organizer: { '@type': 'Organization', name: 'Science Lounge' },
      isAccessibleForFree: true,
    };
  }
  const graph = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: issue.title_ru,
      description: issue.thought_ru,
      datePublished: isoMsk(issue.start_at),
      dateModified: issue.updated_at,
      author: { '@type': 'Organization', name: 'Science Lounge' },
      about: lecturers,
      image: [image],
      mainEntityOfPage: url,
      inLanguage: 'ru',
    },
  ];
  const v = view.video.cut || view.video.full;
  if (v) {
    graph.push({
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: issue.title_ru,
      description: issue.thought_ru || issue.title_ru,
      thumbnailUrl: [image],
      uploadDate: isoMsk(issue.start_at),
      ...(/^https?:/.test(v.url) ? { embedUrl: v.url } : { contentUrl: `${config.siteUrl}${v.url}` }),
    });
  }
  return graph;
}

both('issue', (req, res, next) => {
  const lang = res.locals.lang;
  const L = res.locals.L;
  const issue = getIssueBySlug(req.params.slug);
  if (!issue || !issueIsVisible(issue)) return next();
  const no = `№ ${String(issue.number).padStart(2, '0')}`;
  if (lang === 'en') {
    // English: a card (topic, key idea, speaker, date) and, when there is one, the material on the lecture topic.
    seo(res, {
      key: 'issue',
      params: { slug: issue.slug },
      title: `${no} ${L(issue, 'title')}`,
      description: (issue.past ? L(issue, 'thought') : plainText(L(issue, 'announce'))) || L(issue, 'title'),
      image: `/og/${issue.slug}.png`,
      type: 'article',
    });
    res.locals.activeNav = 'lectures';
    return res.render('pages/en-issue', { issue, status: statusOf(issue), materialHtml: renderMaterial(issue.material_en) });
  }
  const view = buildIssueView(issue, res);
  seo(res, {
    key: 'issue',
    params: { slug: issue.slug },
    title: `${no} ${issue.title_ru}`,
    description: issue.past ? issue.thought_ru : plainText(issue.announce_ru) || issue.title_ru,
    image: `/og/${issue.slug}.png`,
    type: 'article',
    jsonld: issueJsonLd(issue, view),
  });
  res.locals.activeNav = 'lectures';
  return res.render('pages/issue', { issue, v: view, preview: false, hasMath: view.hasMath });
});

/* ---------- data for client-side search ---------- */

router.get('/search-index.json', (req, res) => {
  const list = pastIssues(visibleIssues()).map((i) => ({
    s: i.slug,
    t: i.title_ru,
    x: issueSearchText(i).toLowerCase(),
  }));
  res.set('Cache-Control', 'public, max-age=300');
  res.json(list);
});

export { isoNow };
