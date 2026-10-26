import express from 'express';
import { listFeedback, getFeedback, updateFeedback, deleteFeedback, allIssues, ratingStats } from '../../models.js';
import { toCsv } from '../../lib/csv.js';
import { intOr, flash } from './helpers.js';

export const feedbackRouter = express.Router();

const TYPES = { review: 'Отзыв', question: 'Вопрос лектору', suggest: 'Предложение', contact: 'Связаться', photo_removal: 'Удалить фото' };
const STATUSES = { new: 'новое', in_progress: 'в работе', closed: 'закрыто' };

function filters(req) {
  return {
    type: TYPES[req.query.type] ? req.query.type : '',
    status: STATUSES[req.query.status] ? req.query.status : '',
    issueId: intOr(req.query.issue),
  };
}

feedbackRouter.get('/', (req, res) => {
  const f = filters(req);
  const rows = listFeedback(f);
  const stats = ratingStats();
  const issues = allIssues();
  res.render('admin/feedback-list', {
    rows,
    f,
    TYPES,
    STATUSES,
    issues,
    ratingRows: issues.filter((i) => stats.has(i.id)).map((i) => ({ issue: i, ...stats.get(i.id) })),
    now: new Date().toISOString(),
  });
});

feedbackRouter.get('/export.csv', (req, res) => {
  const rows = listFeedback({ ...filters(req), limit: 100000 });
  const csv = toCsv(rows, [
    { title: 'Дата (UTC)', get: (r) => r.created_at },
    { title: 'Тип', get: (r) => TYPES[r.type] },
    { title: 'Статус', get: (r) => STATUSES[r.status] },
    { title: 'Выпуск', get: (r) => (r.issue_number ? `№ ${r.issue_number} ${r.issue_title}` : '') },
    { title: 'Оценка', key: 'rating' },
    { title: 'Класс', key: 'grade' },
    { title: 'Что запомнилось', key: 'good' },
    { title: 'Что улучшить', key: 'better' },
    { title: 'Хотят следующую', key: 'next_topic' },
    { title: 'Вопрос', key: 'question' },
    { title: 'Предложение', key: 'what' },
    { title: 'Почему', key: 'why' },
    { title: 'Имя', key: 'name' },
    { title: 'Контакт', key: 'contact' },
    { title: 'Сообщение', key: 'message' },
    { title: 'Кто', key: 'kind' },
    { title: 'Страница', key: 'page_url' },
    { title: 'Согласие', get: (r) => (r.consent ? 'да' : 'нет') },
    { title: 'Согласие: дата (UTC)', key: 'consent_at' },
    { title: 'Согласие: IP', key: 'consent_ip' },
    { title: 'Срок', key: 'due_at' },
    { title: 'Заметка', key: 'note' },
  ]);
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="obrasheniya.csv"' }).send(csv);
});

feedbackRouter.get('/:id', (req, res, next) => {
  const row = getFeedback(Number(req.params.id));
  if (!row) return next();
  res.render('admin/feedback-detail', { row, TYPES, STATUSES });
});

feedbackRouter.post('/:id', (req, res) => {
  updateFeedback(Number(req.params.id), { status: req.body.status, note: req.body.note });
  flash(res, 'ok', 'Сохранено.');
  res.redirect(303, req.body.back && req.body.back.startsWith('/admin/feedback') ? req.body.back : `/admin/feedback/${req.params.id}`);
});

feedbackRouter.post('/:id/delete', (req, res) => {
  deleteFeedback(Number(req.params.id));
  flash(res, 'ok', 'Обращение удалено.');
  res.redirect(303, '/admin/feedback');
});
