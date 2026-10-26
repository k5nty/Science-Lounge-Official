import express from 'express';
import { listNews, getNewsById, saveNews, deleteNews, uniqueSlug, mediaByIds, deleteIfOrphan } from '../../models.js';
import { slugify } from '../../lib/slug.js';
import { mskToUtcIso, dateInput, isoNow } from '../../lib/dates.js';
import { clean, ru, intOr, checked, safeUrl, flash } from './helpers.js';
import { mediaJson } from './media.js';
import { refreshNews, lastNewsRun } from '../../lib/news-feed.js';
import { getSettings } from '../../settings.js';

export const newsRouter = express.Router();

function parse(b) {
  return {
    title_ru: ru(b.title_ru, 220),
    title_en: clean(b.title_en, 220),
    summary_ru: ru(b.summary_ru, 700),
    summary_en: clean(b.summary_en, 700),
    source_name: clean(b.source_name, 120),
    source_url: safeUrl(b.source_url),
    published_at: mskToUtcIso(clean(b.date, 10), '12:00'),
    image_id: intOr(b.image_id) || null,
    published: checked(b.published),
    slug_input: slugify(clean(b.slug, 80)),
  };
}

const view = (item, isNew, errors = []) => ({
  item,
  isNew,
  errors,
  dateValue: dateInput(item.published_at) || dateInput(isoNow()),
  image: item.image_id && mediaByIds([item.image_id]).get(item.image_id) ? mediaJson(mediaByIds([item.image_id]).get(item.image_id)) : null,
});

newsRouter.get('/', (req, res) =>
  res.render('admin/news-list', { items: listNews({ publishedOnly: false, limit: 500 }), autoOn: String(getSettings().news_auto) === '1', lastRun: lastNewsRun() }),
);

newsRouter.post('/refresh', async (req, res) => {
  const r = await refreshNews();
  const added = (r.results || []).reduce((a, x) => a + (x.added || 0), 0);
  const failed = (r.results || []).filter((x) => !x.ok).map((x) => x.name);
  flash(res, failed.length ? 'err' : 'ok', r.skipped ? 'Обновление уже идёт.' : `Добавлено новостей: ${added}.${failed.length ? ` Не открылись: ${failed.join(', ')}.` : ''}`);
  res.redirect(303, '/admin/news');
});

newsRouter.get('/new', (req, res) =>
  res.render('admin/news-form', view({ id: null, title_ru: '', title_en: '', summary_ru: '', summary_en: '', source_name: '', source_url: '', published_at: isoNow(), image_id: null, published: 1, slug: '' }, true)),
);

function save(req, res, existing) {
  const d = parse(req.body);
  const errors = [];
  if (!d.title_ru) errors.push('Укажите заголовок.');
  if (!d.published_at) errors.push('Укажите дату.');
  if (req.body.source_url && !d.source_url) errors.push('Ссылка на источник должна начинаться с https://');
  if (errors.length) return res.status(422).render('admin/news-form', view({ ...(existing || {}), ...d, id: existing?.id || null, slug: d.slug_input }, !existing, errors));
  d.slug = uniqueSlug('news', d.slug_input || slugify(d.title_ru) || 'novost', existing?.id || null);
  const id = saveNews(d, existing?.id || null);
  if (existing?.image_id && existing.image_id !== d.image_id) deleteIfOrphan([existing.image_id]).catch(() => {});
  flash(res, 'ok', d.published ? 'Опубликовано.' : 'Сохранено (скрыто с сайта).');
  return res.redirect(303, `/admin/news/${id}`);
}

newsRouter.post('/', (req, res) => save(req, res, null));

newsRouter.get('/:id', (req, res, next) => {
  const item = getNewsById(Number(req.params.id));
  if (!item) return next();
  res.render('admin/news-form', view(item, false));
});

newsRouter.post('/:id', (req, res, next) => {
  const item = getNewsById(Number(req.params.id));
  if (!item) return next();
  return save(req, res, item);
});

newsRouter.post('/:id/delete', (req, res) => {
  const gone = getNewsById(Number(req.params.id));
  deleteNews(Number(req.params.id));
  if (gone?.image_id) deleteIfOrphan([gone.image_id]).catch(() => {});
  flash(res, 'ok', gone?.auto ? 'Новость скрыта.' : 'Новость удалена.');
  res.redirect(303, '/admin/news');
});
