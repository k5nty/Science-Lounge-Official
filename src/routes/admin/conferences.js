import express from 'express';
import { listConferences, getConferenceById, saveConference, deleteConference, listLecturers, mediaByIds, deleteIfOrphan } from '../../models.js';
import { mskToUtcIso, dateInput } from '../../lib/dates.js';
import { getDb } from '../../db.js';
import { clean, ru, ruRich, linesOf, toList, intOr, checked, idList, flash } from './helpers.js';
import { mediaJson } from './media.js';
import { updateMediaMeta } from '../../models.js';

export const conferencesRouter = express.Router();

/** "10:00 Открытие" per line -> [{time, text}] */
function parseItems(text) {
  return linesOf(text, { max: 300, limit: 40 }).map((line) => {
    const m = /^(\d{1,2}[:.]\d{2})(?:\s*[–—-]\s*\d{1,2}[:.]\d{2})?\s+(.*)$/.exec(line);
    return m ? { time: m[1].replace('.', ':'), text: ru(m[2], 300) } : { time: '', text: ru(line, 300) };
  });
}

function itemsToText(items) {
  return (items || []).map((i) => `${i.time ? `${i.time} ` : ''}${i.text}`).join('\n');
}

function parse(body) {
  const program = toList(body.program)
    .map((d) => ({ title: ru(d?.title, 120), date: clean(d?.date, 40), items: parseItems(d?.items) }))
    .filter((d) => d.title || d.items.length);
  const posters = toList(body.posters)
    .map((p) => ({ media_id: intOr(p?.media_id) || null, title: ru(p?.title, 200), authors: ru(p?.authors, 200) }))
    .filter((p) => p.media_id || p.title);
  return {
    year: intOr(body.year),
    title_ru: ru(body.title_ru, 150) || 'National Letovo Engineers',
    title_en: clean(body.title_en, 150) || 'National Letovo Engineers',
    date_start: mskToUtcIso(clean(body.date_start, 10), '00:00'),
    date_end: mskToUtcIso(clean(body.date_end, 10), '00:00'),
    place_ru: ru(body.place_ru, 200),
    place_en: clean(body.place_en, 200),
    intro_ru: ruRich(body.intro_ru, 4000),
    intro_en: clean(body.intro_en, 4000),
    program,
    regions: linesOf(body.regions, { max: 80, limit: 100 }).map((name) => ({ name: ru(name, 80) })),
    posters,
    results_ru: ruRich(body.results_ru, 4000),
    results_en: clean(body.results_en, 4000),
    cover_id: intOr(body.cover_id) || null,
    published: checked(body.published),
  };
}

function view(conf, isNew, errors = []) {
  const posterMedia = mediaByIds((conf.posters || []).map((p) => p.media_id));
  return {
    conf,
    isNew,
    errors,
    lecturers: listLecturers(),
    juryIds: conf.juryIds || [],
    regionsText: (conf.regions || []).map((r) => r.name || r).join('\n'),
    programView: (conf.program || []).map((d) => ({ ...d, itemsText: itemsToText(d.items) })),
    posterView: (conf.posters || []).map((p) => ({ ...p, media: p.media_id && posterMedia.get(p.media_id) ? mediaJson(posterMedia.get(p.media_id)) : p.media ? mediaJson(p.media) : null })),
    cover: conf.coverRaw ? mediaJson(conf.coverRaw) : null,
    photos: (conf.photosAll || []).map(mediaJson),
    dateStart: dateInput(conf.date_start),
    dateEnd: dateInput(conf.date_end),
  };
}

conferencesRouter.get('/', (req, res) => {
  res.render('admin/conferences-list', { confs: listConferences({ publishedOnly: false }) });
});

conferencesRouter.get('/new', (req, res) => {
  const year = new Date().getFullYear();
  res.render(
    'admin/conference-form',
    view({ id: null, year, title_ru: 'National Letovo Engineers', title_en: 'National Letovo Engineers', program: [], regions: [], posters: [], photosAll: [], juryIds: [], published: 0, intro_ru: '', intro_en: '', results_ru: '', results_en: '', place_ru: '', place_en: '' }, true),
  );
});

function applyPhotoMeta(body) {
  for (const [id, m] of Object.entries(body.photo_meta || {})) {
    if (/^m\d+$/.test(id)) updateMediaMeta(Number(id.slice(1)), { alt: m.alt, credit: m.credit, caption: m.caption, consent: m.consent });
  }
}

function save(req, res, existing) {
  const d = parse(req.body);
  const errors = [];
  if (!d.year || d.year < 2000 || d.year > 2100) errors.push('Укажите год.');
  const clash = getDb().prepare('SELECT id FROM conferences WHERE year = ? AND id != ?').get(d.year, existing?.id || 0);
  if (clash) errors.push(`Конференция ${d.year} года уже есть.`);
  const juryIds = idList(req.body.jury);
  const photoIds = idList(req.body.photos);
  applyPhotoMeta(req.body);
  if (errors.length) {
    return res.status(422).render('admin/conference-form', view({ ...(existing || {}), ...d, id: existing?.id || null, juryIds, photosAll: [...mediaByIds(photoIds).values()] }, !existing, errors));
  }
  let warn = '';
  if (d.published) {
    const ids = [...photoIds, d.cover_id, ...d.posters.map((p) => p.media_id)].filter(Boolean);
    const noAlt = [...mediaByIds(ids).values()].filter((m) => m.kind === 'image' && !m.alt.trim() && photoIds.includes(m.id)).length;
    if (noAlt) {
      d.published = false;
      warn = `Не опубликовано: у ${noAlt} фото нет описания (alt).`;
    }
  }
  const before = existing ? [...existing.photosAll.map((m) => m.id), existing.cover_id, ...existing.posters.map((p) => p.media_id)] : [];
  const id = saveConference(d, juryIds, photoIds, existing?.id || null);
  const after = [...photoIds, d.cover_id, ...d.posters.map((p) => p.media_id)];
  deleteIfOrphan(before.filter((m) => m && !after.includes(m))).catch(() => {});
  if (warn) {
    flash(res, 'warn', `Сохранено. ${warn}`);
    return res.redirect(303, `/admin/conferences/${id}`);
  }
  flash(res, 'ok', d.published ? 'Опубликовано.' : 'Сохранено (скрыто с сайта).');
  return res.redirect(303, `/admin/conferences/${id}`);
}

conferencesRouter.post('/', (req, res) => save(req, res, null));

conferencesRouter.get('/:id', (req, res, next) => {
  const conf = getConferenceById(Number(req.params.id));
  if (!conf) return next();
  res.render('admin/conference-form', view(conf, false));
});

conferencesRouter.post('/:id', (req, res, next) => {
  const conf = getConferenceById(Number(req.params.id));
  if (!conf) return next();
  return save(req, res, conf);
});

conferencesRouter.post('/:id/delete', (req, res) => {
  const gone = getConferenceById(Number(req.params.id));
  deleteConference(Number(req.params.id));
  if (gone) deleteIfOrphan([...gone.photosAll.map((m) => m.id), gone.cover_id, ...gone.posters.map((p) => p.media_id)]).catch(() => {});
  flash(res, 'ok', 'Конференция удалена.');
  res.redirect(303, '/admin/conferences');
});
