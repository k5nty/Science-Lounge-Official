import express from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { getSettings } from '../settings.js';
import { translator } from '../i18n.js';
import { insertFeedback, getIssueById, issueIsVisible } from '../models.js';
import { checkFormToken, rateLimit } from '../lib/security.js';
import { notifyTelegram, tgEscape, telegramEnabled } from '../lib/telegram.js';
import { addDaysIso, isoNow } from '../lib/dates.js';

export const router = express.Router();

let secret;
/** HMAC secret for form tokens: stored in the DB so it survives restarts. */
export function formSecret() {
  if (secret) return secret;
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = '_form_secret'").get();
  if (row) {
    secret = JSON.parse(row.value);
  } else {
    secret = crypto.randomBytes(32).toString('base64url');
    db.prepare("INSERT INTO settings(key,value) VALUES('_form_secret', ?)").run(JSON.stringify(secret));
  }
  return secret;
}
export function resetFormSecret() {
  secret = undefined;
}

const GRADES = ['7', '8', '9', '10', '11'];
const KINDS = ['Хочу выступить с лекцией', 'Партнёр или школа', 'Другое'];

const clean = (v, max) =>
  String(v ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);

function wantsJson(req) {
  return req.xhr || req.get('x-requested-with') === 'fetch' || (req.accepts(['html', 'json']) === 'json');
}

function reply(req, res, { ok, status = ok ? 200 : 400, message, errors, type }) {
  if (wantsJson(req)) return res.status(status).json({ ok, message, errors: errors || {} });
  if (ok) return res.redirect(303, `/spasibo?t=${type === 'photo_removal' ? 'photo' : type}`);
  const ref = req.get('referer') || '';
  const back = ref.startsWith(`${config.siteUrl}/`) ? ref.slice(config.siteUrl.length) : '/otzyv';
  return res.status(status).render('pages/form-error', { message, back });
}

function hasLinks(...values) {
  return values.some((v) => /https?:\/\/|www\./i.test(v || ''));
}

router.post('/forms/:type', express.urlencoded({ extended: false, limit: '64kb' }), express.json({ limit: '64kb' }), (req, res) => {
  const type = req.params.type;
  const valid = ['review', 'question', 'suggest', 'contact', 'photo_removal'];
  const lang = req.body.lang === 'en' ? 'en' : 'ru';
  const t = translator(lang);
  if (!valid.includes(type)) return res.status(404).json({ ok: false, message: 'Unknown form' });

  // Anti-spam without a captcha: honeypot, signed time token, rate limit.
  if (clean(req.body.website, 100)) return reply(req, res, { ok: true, message: t('fb.sent'), type });
  if (!checkFormToken(formSecret(), req.body._t, { minMs: 1500 })) {
    return reply(req, res, { ok: false, status: 400, message: t('fb.err'), type });
  }
  const ip = req.ip || '';
  if (!rateLimit(`form:${ip}`, 8, 10 * 60e3) || !rateLimit(`form:${type}:${ip}`, type === 'contact' ? 3 : 5, 10 * 60e3)) {
    return reply(req, res, { ok: false, status: 429, message: t('fb.err_rate'), type });
  }

  const b = req.body;
  const errors = {};
  const rec = { type, consent_ip: ip };
  const settings = getSettings();
  let issue = null;

  if (type === 'review' || type === 'question') {
    issue = getIssueById(Number(b.issue));
    if (!issue || !issueIsVisible(issue)) errors.issue = t('fb.err_required');
    else rec.issue_id = issue.id;
  }

  if (type === 'review') {
    const rating = Number(b.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.rating = t('fb.err_rating');
    rec.rating = rating;
    rec.good = clean(b.good, 1500);
    rec.better = clean(b.better, 1500);
    rec.next_topic = clean(b.next, 300);
    rec.grade = GRADES.includes(String(b.grade)) ? String(b.grade) : '';
    if (issue && Date.now() < Date.parse(issue.start_at)) errors.issue = t('fb.review_closed');
  }

  if (type === 'question') {
    rec.question = clean(b.question, 1500);
    rec.name = clean(b.name, 120);
    if (!rec.question) errors.question = t('fb.err_required');
  }

  if (type === 'suggest') {
    rec.what = clean(b.what, 300);
    rec.why = clean(b.why, 1500);
    rec.contact = clean(b.contact, 200);
    if (!rec.what) errors.what = t('fb.err_required');
    if (rec.contact) {
      rec.consent = Boolean(b.consent);
      if (!rec.consent) errors.consent = t('fb.err_consent');
    }
  }

  if (type === 'contact') {
    rec.kind = KINDS.includes(b.kind) ? b.kind : KINDS[2];
    rec.name = clean(b.name, 120);
    rec.contact = clean(b.contact, 200);
    rec.message = clean(b.message, 3000);
    rec.consent = Boolean(b.consent);
    if (!rec.name || !rec.contact || !rec.message) errors.message = t('fb.err_required');
    if (!rec.consent) errors.consent = t('fb.err_consent');
    if (rec.message && hasLinks(rec.message) && (rec.message.match(/https?:\/\//g) || []).length > 2) errors.message = t('fb.err');
  }

  if (type === 'photo_removal') {
    rec.page_url = clean(b.where, 300);
    rec.message = clean(b.message, 2000);
    rec.contact = clean(b.contact, 200);
    rec.consent = Boolean(b.consent);
    if (!rec.page_url || !rec.message || !rec.contact) errors.message = t('fb.err_required');
    if (!rec.consent) errors.consent = t('fb.err_consent');
    const days = Number(settings.photo_removal_days) || 10;
    rec.due_at = addDaysIso(isoNow(), days);
  }

  if (Object.keys(errors).length) {
    return reply(req, res, { ok: false, status: 422, message: Object.values(errors)[0], errors, type });
  }

  const id = insertFeedback(rec);
  notify(type, rec, issue, id);

  const days = Number(settings.photo_removal_days) || 10;
  const ok = {
    review: t('fb.sent_review'),
    question: t('fb.sent_question'),
    suggest: t('fb.sent_suggest'),
    contact: t('fb.sent_contact'),
    photo_removal: t('fb.sent_photo', { days }),
  }[type];
  return reply(req, res, { ok: true, message: ok, type });
});

const TYPE_LABEL = { review: 'Отзыв', question: 'Вопрос лектору', suggest: 'Предложение', contact: 'Сообщение', photo_removal: 'Удаление фото' };

function notify(type, rec, issue, id) {
  if (!telegramEnabled()) return;
  const lines = [`<b>${TYPE_LABEL[type]}</b>${issue ? ` · № ${String(issue.number).padStart(2, '0')} ${tgEscape(issue.title_ru)}` : ''}`];
  if (type === 'review') {
    lines.push(`Оценка: ${rec.rating}/5${rec.grade ? `, ${rec.grade} класс` : ''}`);
    if (rec.good) lines.push(`Запомнилось: ${tgEscape(rec.good)}`);
    if (rec.better) lines.push(`Улучшить: ${tgEscape(rec.better)}`);
    if (rec.next_topic) lines.push(`Хотят: ${tgEscape(rec.next_topic)}`);
  } else if (type === 'question') {
    lines.push(tgEscape(rec.question));
    if (rec.name) lines.push(`— ${tgEscape(rec.name)}`);
  } else if (type === 'suggest') {
    lines.push(tgEscape(rec.what));
    if (rec.why) lines.push(tgEscape(rec.why));
    if (rec.contact) lines.push(`Контакт: ${tgEscape(rec.contact)}`);
  } else if (type === 'contact') {
    lines.push(`${tgEscape(rec.kind)} · ${tgEscape(rec.name)} · ${tgEscape(rec.contact)}`);
    lines.push(tgEscape(rec.message));
  } else if (type === 'photo_removal') {
    lines.push(`Где: ${tgEscape(rec.page_url)}`);
    lines.push(tgEscape(rec.message));
    lines.push(`Контакт: ${tgEscape(rec.contact)}`);
    lines.push(`Срок: ${rec.due_at.slice(0, 10)}`);
  }
  lines.push(`${config.siteUrl}/admin/feedback/${id}`);
  notifyTelegram(lines.join('\n'));
}
