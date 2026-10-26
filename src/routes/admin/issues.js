import express from 'express';
import QRCode from 'qrcode';
import { config } from '../../config.js';
import {
  allIssues,
  getIssueById,
  saveIssue,
  deleteIssue,
  listLecturers,
  nextIssueNumber,
  uniqueSlug,
  mediaByIds,
  updateMediaMeta,
  photoPublishable,
  ratingStats,
  issueIsVisible,
  deleteIfOrphan,
} from '../../models.js';
import { isSafeVideoUrl } from '../../lib/video.js';
import { issueSlug, slugify } from '../../lib/slug.js';
import { mskToUtcIso, fromLocalInput, isoNow } from '../../lib/dates.js';
import { getDb } from '../../db.js';
import { buildIssueView, issueJsonLd, publicContext } from '../public.js';
import { clean, toList, intOr, checked, idList, ru, ruRich, safeUrl, flash } from './helpers.js';
import { mediaJson } from './media.js';

export const issuesRouter = express.Router();

const STATES = ['draft', 'scheduled', 'published'];
const FLAGS = ['', 'moved', 'cancelled', 'sold_out'];

/** Everything the editor shows about the readiness of an issue. Non-blocking hints. */
export function checklist(issue) {
  const c = [];
  const add = (ok, text) => c.push({ ok, text });
  add(Boolean(issue.title_ru), 'Тема');
  add(issue.lecturers.length > 0, 'Лектор выбран');
  add(issue.announce_ru.length > 0 && issue.announce_ru.length <= 600, 'Описание анонса до 600 знаков');
  if (issue.past) {
    add(Boolean(issue.thought_ru), 'Главная мысль одной фразой');
    add(issue.ideas.length >= 3 && issue.ideas.length <= 7, `Ключевых идей 3–7 (сейчас ${issue.ideas.length})`);
    const quotes = issue.ideas.filter((i) => i.quote).length;
    add(quotes >= 1 && quotes <= 3, `Цитат лектора 1–3 (сейчас ${quotes})`);
    add(issue.qa.length >= 3 && issue.qa.length <= 5, `Вопросов из зала 3–5 (сейчас ${issue.qa.length})`);
    add(Boolean(issue.coverRaw), 'Обложка (лучшее фото)');
    add(issue.photosAll.length >= 6, `Фото в галерее 6–20 (сейчас ${issue.photosAll.length})`);
    add(issue.photosAll.every((p) => p.alt), 'У каждого фото есть описание (alt)');
    add(issue.photosAll.every((p) => p.consent !== 'pending'), 'У каждого фото выбрано согласие');
    add(Boolean(issue.note_author), 'Указан автор конспекта');
    add(issue.checked, 'Конспект проверен лектором');
    add(issue.listeners > 0, 'Внесено число слушателей');
  }
  return c;
}

function parseIssueBody(body, existing) {
  const b = body;
  const d = {};
  d.title_ru = ru(b.title_ru, 200);
  d.title_en = clean(b.title_en, 200);
  d.place_ru = ru(b.place_ru, 200);
  d.place_en = clean(b.place_en, 200);
  d.status_flag = FLAGS.includes(b.status_flag) ? b.status_flag : '';
  d.announce_ru = ruRich(b.announce_ru, 1500);
  d.announce_en = clean(b.announce_en, 1500);
  d.thought_ru = ru(b.thought_ru, 500);
  d.thought_en = clean(b.thought_en, 500);
  d.ideas = toList(b.ideas)
    .map((x) => ({ h: ru(x?.h, 200), body: ruRich(x?.body, 6000), quote: ru(x?.quote, 400), quote_by: ru(x?.quote_by, 120) }))
    .filter((x) => x.h || x.body);
  d.terms = toList(b.terms)
    .map((x) => ({ term: ru(x?.term, 120), match: clean(x?.match, 200), def: ru(x?.def, 400) }))
    .filter((x) => x.term && x.def);
  d.qa = toList(b.qa)
    .map((x) => ({ q: ru(x?.q, 400), a: ruRich(x?.a, 2000) }))
    .filter((x) => x.q);
  d.reads = toList(b.reads)
    .map((x) => ({ title: ru(x?.title, 300), url: safeUrl(x?.url) }))
    .filter((x) => x.title);
  d.video_cut_url = isSafeVideoUrl(clean(b.video_cut_url, 500)) ? clean(b.video_cut_url, 500) : '';
  d.video_cut_len = clean(b.video_cut_len, 12);
  d.video_full_url = isSafeVideoUrl(clean(b.video_full_url, 500)) ? clean(b.video_full_url, 500) : '';
  d.video_full_len = clean(b.video_full_len, 12);
  d.slides_id = intOr(b.slides_id) || null;
  d.slides_ok = checked(b.slides_ok);
  d.cover_id = intOr(b.cover_id) || null;
  d.autograph_id = intOr(b.autograph_id) || null;
  d.listeners = Math.max(0, intOr(b.listeners));
  d.note_author = clean(b.note_author, 200);
  d.material_ru = clean(b.material_ru, 40000);
  d.material_en = clean(b.material_en, 40000);
  d.checked = checked(b.checked);
  d.reg_enabled = checked(b.reg_enabled);
  d.reg_url = safeUrl(b.reg_url);
  d.show_rating = checked(b.show_rating);
  d.tags = clean(b.tags, 300)
    .split(/[,\n]/)
    .map((t) => clean(t, 40))
    .filter(Boolean)
    .slice(0, 8);
  d.publish_state = STATES.includes(b.publish_state) ? b.publish_state : 'draft';
  d.publish_at = fromLocalInput(b.publish_at);
  d.start_at = mskToUtcIso(clean(b.date, 10), clean(b.time, 5));
  d.number = intOr(b.number, existing?.number || nextIssueNumber());
  d._video_raw = [clean(b.video_cut_url, 500), clean(b.video_full_url, 500)];
  d.slug_input = slugify(clean(b.slug, 80));
  return d;
}

function applyPhotoMeta(body) {
  const meta = body.photo_meta || {};
  for (const [id, m] of Object.entries(meta)) {
    if (!/^m\d+$/.test(id)) continue;
    updateMediaMeta(Number(id.slice(1)), { alt: m.alt, credit: m.credit, caption: m.caption, consent: m.consent });
  }
}

function formContext(issue) {
  const lecturers = listLecturers();
  const photoMedia = issue ? [...issue.photosAll] : [];
  if (issue?.coverRaw && !photoMedia.find((p) => p.id === issue.coverRaw.id)) photoMedia.unshift(issue.coverRaw);
  return {
    lecturers,
    flags: FLAGS,
    media: {
      cover: issue?.coverRaw ? mediaJson(issue.coverRaw) : null,
      slides: issue?.slidesRaw ? mediaJson(issue.slidesRaw) : null,
      autograph: issue?.autograph ? mediaJson(issue.autograph) : null,
      photos: photoMedia.map(mediaJson),
    },
    selectedLecturers: issue ? issue.lecturers.map((l) => l.id) : [],
    checklist: issue ? checklist(issue) : [],
  };
}

/** Same view data for a form that failed validation: what the user had posted, not an empty form. */
function formContextFromPost(d, lecturerIds, photoIds) {
  const mm = mediaByIds([...photoIds, d.cover_id, d.slides_id, d.autograph_id]);
  const J = (id) => (id && mm.get(id) ? mediaJson(mm.get(id)) : null);
  return {
    lecturers: listLecturers(),
    flags: FLAGS,
    media: {
      cover: J(d.cover_id),
      slides: J(d.slides_id),
      autograph: J(d.autograph_id),
      photos: photoIds.map(J).filter(Boolean),
    },
    selectedLecturers: lecturerIds,
    checklist: [],
  };
}

/** Photos (gallery + cover) that would go public without a description. */
function missingAlt(photoIds, coverId) {
  return [...mediaByIds([...photoIds, coverId]).values()].filter((m) => m.kind === 'image' && !m.alt.trim()).length;
}

issuesRouter.get('/', (req, res) => {
  const stats = ratingStats();
  const issues = allIssues();
  res.render('admin/issues-list', {
    issues,
    ratings: stats,
    visible: Object.fromEntries(issues.map((i) => [i.id, issueIsVisible(i)])),
  });
});

issuesRouter.get('/new', (req, res) => {
  const blank = {
    id: null,
    number: nextIssueNumber(),
    slug: '',
    title_ru: '',
    title_en: '',
    start_at: null,
    place_ru: 'Школа «Летово»',
    place_en: '',
    status_flag: '',
    announce_ru: '',
    announce_en: '',
    thought_ru: '',
    thought_en: '',
    ideas: [{ h: '', body: '', quote: '', quote_by: '' }],
    terms: [],
    qa: [],
    reads: [],
    tags: [],
    video_cut_url: '',
    video_cut_len: '',
    video_full_url: '',
    video_full_len: '',
    listeners: 0,
    note_author: '',
    material_ru: '',
    material_en: '',
    checked: 0,
    reg_enabled: 0,
    reg_url: '',
    show_rating: 0,
    publish_state: 'draft',
    publish_at: null,
    lecturers: [],
    photosAll: [],
    past: false,
  };
  res.render('admin/issue-form', { issue: blank, isNew: true, ...formContext(null), errors: [], nowIso: new Date().toISOString() });
});

issuesRouter.post('/', (req, res) => saveHandler(req, res, null));

issuesRouter.get('/:id', (req, res, next) => {
  const issue = getIssueById(Number(req.params.id));
  if (!issue) return next();
  res.render('admin/issue-form', { issue, isNew: false, ...formContext(issue), errors: [], nowIso: new Date().toISOString() });
});

issuesRouter.post('/:id', (req, res, next) => {
  const issue = getIssueById(Number(req.params.id));
  if (!issue) return next();
  return saveHandler(req, res, issue);
});

function saveHandler(req, res, existing) {
  const d = parseIssueBody(req.body, existing);
  const errors = [];
  if (!d.title_ru) errors.push('Укажите тему.');
  if (!d.start_at) errors.push('Укажите корректные дату и время начала.');
  if (d.number < 1) errors.push('Номер выпуска должен быть не меньше 1.');
  if (d.announce_ru.length > 600) errors.push(`Описание анонса длиннее 600 знаков (сейчас ${d.announce_ru.length}). Сократите.`);
  if (d._video_raw.some((u, i) => u && !(i === 0 ? d.video_cut_url : d.video_full_url))) errors.push('Ссылка на видео должна начинаться с https:// (VK Видео, Rutube, YouTube) или быть загруженным файлом.');
  const lecturerIds = idList(req.body.lecturers);
  if (!lecturerIds.length) errors.push('Выберите хотя бы одного лектора.');
  const db = getDb();
  const clash = db.prepare('SELECT id FROM issues WHERE number = ? AND id != ?').get(d.number, existing?.id || 0);
  if (clash) errors.push(`Номер ${d.number} уже занят другим выпуском.`);

  const photoIds = idList(req.body.photos);
  applyPhotoMeta(req.body);

  if (errors.length) {
    const draftIssue = {
      ...(existing || {}),
      ...d,
      id: existing?.id || null,
      slug: d.slug_input,
      lecturers: listLecturers().filter((l) => lecturerIds.includes(l.id)),
      photosAll: [...mediaByIds(photoIds).values()],
      past: false,
    };
    return res.status(422).render('admin/issue-form', {
      issue: draftIssue,
      isNew: !existing,
      ...formContextFromPost(d, lecturerIds, photoIds),
      errors,
      nowIso: new Date().toISOString(),
    });
  }

  const slug = uniqueSlug('issues', d.slug_input || issueSlug(d.number, d.title_ru), existing?.id || null);
  d.slug = slug;

  // Publishing guard: every published photo needs alt text and a consent decision (brief, 5.3 / 9).
  const warnings = [];
  if (d.publish_state !== 'draft') {
    const noAlt = missingAlt(photoIds, d.cover_id);
    if (noAlt) {
      d.publish_state = 'draft';
      warnings.push(`Не опубликовано: у ${noAlt} фото нет описания (alt). Заполните и опубликуйте снова.`);
    }
    if (d.publish_state === 'scheduled' && !d.publish_at) {
      d.publish_state = 'draft';
      warnings.push('Для публикации по расписанию укажите дату и время.');
    }
  }

  const before = existing ? [...existing.photosAll.map((m) => m.id), existing.cover_id, existing.slides_id, existing.autograph_id] : [];
  const id = saveIssue(d, lecturerIds, photoIds, existing?.id || null);
  // Photos taken out of the issue are deleted with their files unless something else still uses them.
  deleteIfOrphan(before.filter((m) => m && ![...photoIds, d.cover_id, d.slides_id, d.autograph_id].includes(m))).catch((e) => console.error('[media cleanup]', e.message));
  const issue = getIssueById(id);
  const hidden = issue.photosAll.filter((p) => !photoPublishable(p)).length;
  if (hidden) warnings.push(`Фото без согласия (${hidden}) на сайте не показываются.`);
  if (warnings.length) flash(res, 'warn', `Сохранено. ${warnings.join(' ')}`);
  else flash(res, 'ok', d.publish_state === 'published' ? 'Опубликовано.' : d.publish_state === 'scheduled' ? 'Запланировано.' : 'Черновик сохранён.');
  const to = req.body._action === 'preview' ? `/admin/issues/${id}/preview` : `/admin/issues/${id}`;
  return res.redirect(303, to);
}

issuesRouter.post('/:id/delete', (req, res) => {
  deleteIssue(Number(req.params.id));
  flash(res, 'ok', 'Выпуск удалён.');
  res.redirect(303, '/admin/issues');
});

issuesRouter.post('/:id/quick', (req, res) => {
  const issue = getIssueById(Number(req.params.id));
  if (!issue) return res.redirect(303, '/admin/issues');
  const state = STATES.includes(req.body.state) ? req.body.state : null;
  if (state && state !== 'draft' && missingAlt(issue.photosAll.map((m) => m.id), issue.cover_id)) {
    flash(res, 'err', 'Нельзя опубликовать: у части фото нет описания (alt). Откройте выпуск и заполните.');
  } else if (state) {
    getDb().prepare('UPDATE issues SET publish_state = ?, updated_at = ? WHERE id = ?').run(state, isoNow(), issue.id);
    flash(res, 'ok', state === 'published' ? 'Опубликовано.' : 'Снято с публикации.');
  }
  res.redirect(303, '/admin/issues');
});

// Preview renders the real public template, including drafts.
issuesRouter.get('/:id/preview', (req, res, next) => {
  const issue = getIssueById(Number(req.params.id));
  if (!issue) return next();
  publicContext(req, res, () => {});
  res.locals.analytics = {};
  res.locals.activeNav = 'lectures';
  res.locals.themeSwitcher = false;
  const view = buildIssueView(issue, res);
  res.locals.page = {
    title: `Предпросмотр · ${issue.title_ru}`,
    description: '',
    noindex: true,
    image: '',
    jsonld: null,
  };
  void issueJsonLd;
  res.render('pages/issue', { issue, v: view, preview: true, hasMath: view.hasMath });
});

issuesRouter.get('/:id/qr.png', async (req, res, next) => {
  const issue = getIssueById(Number(req.params.id));
  if (!issue) return next();
  const url = `${config.siteUrl}/otzyv/${issue.slug}`;
  const png = await QRCode.toBuffer(url, { type: 'png', width: 1024, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#16181B', light: '#FFFFFF' } });
  res.set({ 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="otzyv-${issue.slug}-qr.png"` }).send(png);
});
