import express from 'express';
import { listLecturers, getLecturerById, saveLecturer, deleteLecturer, uniqueSlug, mediaByIds, deleteIfOrphan } from '../../models.js';
import { slugify } from '../../lib/slug.js';
import { clean, ru, ruRich, linesOf, parseLinks, intOr, flash } from './helpers.js';
import { mediaJson } from './media.js';
import { getDb } from '../../db.js';

export const lecturersRouter = express.Router();

function parse(body) {
  return {
    name_ru: ru(body.name_ru, 150),
    name_en: clean(body.name_en, 150),
    role_ru: ru(body.role_ru, 200),
    role_en: clean(body.role_en, 200),
    org_ru: ru(body.org_ru, 200),
    org_en: clean(body.org_en, 200),
    area: ru(body.area, 60),
    area_en: clean(body.area_en, 60),
    bio_ru: ruRich(body.bio_ru, 2500),
    bio_en: clean(body.bio_en, 2500),
    facts_ru: linesOf(body.facts_ru, { max: 200, limit: 8 }).map((x) => ru(x, 200)),
    facts_en: linesOf(body.facts_en, { max: 200, limit: 8 }),
    links: parseLinks(body.links),
    portrait_id: intOr(body.portrait_id) || null,
    slug_input: slugify(clean(body.slug, 80)),
  };
}

lecturersRouter.get('/', (req, res) => {
  const counts = new Map(getDb().prepare('SELECT lecturer_id, COUNT(*) c FROM issue_lecturers GROUP BY lecturer_id').all().map((r) => [r.lecturer_id, r.c]));
  res.render('admin/lecturers-list', { lecturers: listLecturers(), counts });
});

function formView(lecturer, isNew, errors = []) {
  const media = lecturer.portrait_id ? mediaByIds([lecturer.portrait_id]).get(lecturer.portrait_id) : null;
  const areas = [...new Set(listLecturers().map((l) => l.area).filter(Boolean))];
  return { lecturer, isNew, errors, portrait: media ? mediaJson(media) : null, areas };
}

lecturersRouter.get('/new', (req, res) => {
  res.render('admin/lecturer-form', formView({ id: null, name_ru: '', name_en: '', role_ru: '', role_en: '', org_ru: '', org_en: '', area: '', area_en: '', bio_ru: '', bio_en: '', facts_ru: [], facts_en: [], links: [], slug: '', portrait_id: null }, true));
});

lecturersRouter.post('/', (req, res) => {
  const d = parse(req.body);
  if (!d.name_ru) return res.status(422).render('admin/lecturer-form', formView({ ...d, id: null, slug: d.slug_input }, true, ['Укажите имя лектора.']));
  d.slug = uniqueSlug('lecturers', d.slug_input || slugify(d.name_ru) || 'lektor', null);
  const id = saveLecturer(d, null);
  flash(res, 'ok', 'Лектор добавлен.');
  res.redirect(303, `/admin/lecturers/${id}`);
});

lecturersRouter.get('/:id', (req, res, next) => {
  const lecturer = getLecturerById(Number(req.params.id));
  if (!lecturer) return next();
  res.render('admin/lecturer-form', formView(lecturer, false));
});

lecturersRouter.post('/:id', (req, res, next) => {
  const existing = getLecturerById(Number(req.params.id));
  if (!existing) return next();
  const d = parse(req.body);
  if (!d.name_ru) return res.status(422).render('admin/lecturer-form', formView({ ...existing, ...d, slug: existing.slug }, false, ['Укажите имя лектора.']));
  d.slug = uniqueSlug('lecturers', d.slug_input || existing.slug, existing.id);
  saveLecturer(d, existing.id);
  if (existing.portrait_id && existing.portrait_id !== d.portrait_id) deleteIfOrphan([existing.portrait_id]).catch(() => {});
  flash(res, 'ok', 'Сохранено.');
  res.redirect(303, `/admin/lecturers/${existing.id}`);
});

lecturersRouter.post('/:id/delete', (req, res) => {
  const gone = getLecturerById(Number(req.params.id));
  const r = deleteLecturer(Number(req.params.id));
  if (r.ok && gone?.portrait_id) deleteIfOrphan([gone.portrait_id]).catch(() => {});
  flash(res, r.ok ? 'ok' : 'err', r.ok ? 'Лектор удалён.' : r.reason);
  res.redirect(303, '/admin/lecturers');
});
