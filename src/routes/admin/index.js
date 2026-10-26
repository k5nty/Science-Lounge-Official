import express from 'express';
import { config } from '../../config.js';
import { getDb } from '../../db.js';
import { loadSession, requireUser, requireAdmin, csrfGuard, createSession, destroySession, setCookie, COOKIE, loginThrottle } from '../../auth.js';
import { verifyPassword, hashPassword } from '../../lib/security.js';
import { takeFlash } from './helpers.js';
import { assetUrl } from '../../views.js';
import { allIssues, feedbackCounts, upcomingIssues, visibleIssues } from '../../models.js';
import { issuesRouter } from './issues.js';
import { lecturersRouter } from './lecturers.js';
import { conferencesRouter } from './conferences.js';
import { teamRouter } from './team.js';
import { newsRouter } from './news.js';
import { mediaRouter } from './media.js';
import { feedbackRouter } from './feedback.js';
import { settingsRouter } from './settings.js';
import { usersRouter } from './users.js';
import { backupsRouter } from './backups.js';

export const router = express.Router();

router.use((req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  next();
});
router.use(express.urlencoded({ extended: true, limit: '2mb', parameterLimit: 10000 }));
router.use(express.json({ limit: '1mb' }));
router.use(loadSession);
router.use((req, res, next) => {
  res.locals.asset = assetUrl;
  res.locals.adminPath = req.path;
  res.locals.flash = req.method === 'GET' ? takeFlash(req, res) : null;
  res.locals.siteUrl = config.siteUrl;
  next();
});

/* ---------- login ---------- */

const safeNext = (n) => (typeof n === 'string' && /^\/admin(\/|$|\?)/.test(n) ? n : '/admin');

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/admin');
  return res.render('admin/login', { next: safeNext(req.query.next), error: '', email: '' });
});

router.post('/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 200);
  const password = String(req.body.password || '').slice(0, 500);
  const next = safeNext(req.body.next);
  const fail = (status, error) => res.status(status).render('admin/login', { next, error, email });
  if (!loginThrottle(req.ip, email)) return fail(429, 'Слишком много попыток. Подождите 15 минут.');
  const user = getDb().prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email);
  // Always hash-compare so timing does not reveal whether the email exists.
  const ok = user ? await verifyPassword(password, user.password_hash) : (await hashPassword(password), false);
  if (!ok) return fail(401, 'Неверная почта или пароль.');
  const token = createSession(user.id, req.ip);
  setCookie(res, COOKIE, token, { maxAgeSec: config.sessionDays * 86400 });
  return res.redirect(303, next);
});

router.post('/logout', (req, res) => {
  // A forged cross-site logout must not work: require the session CSRF token when a session exists.
  if (req.sessionToken && req.body._csrf !== req.csrf) return res.redirect(303, '/admin');
  destroySession(req.sessionToken);
  setCookie(res, COOKIE, '', { maxAgeSec: 0 });
  res.redirect(303, '/admin/login');
});

/* ---------- everything below needs a session ---------- */

router.use(requireUser);
router.use(csrfGuard);

router.get('/', (req, res) => {
  const issues = allIssues();
  const visible = visibleIssues();
  const next = upcomingIssues(visible)[0] || null;
  res.render('admin/dashboard', {
    next,
    drafts: issues.filter((i) => i.publish_state === 'draft'),
    scheduled: issues.filter((i) => i.publish_state === 'scheduled' && !visible.find((v) => v.id === i.id)),
    counts: feedbackCounts(),
    totalIssues: issues.length,
    published: visible.length,
  });
});

router.use('/issues', issuesRouter);
router.use('/lecturers', lecturersRouter);
router.use('/conferences', conferencesRouter);
router.use('/team', teamRouter);
router.use('/news', newsRouter);
router.use('/media', mediaRouter);
router.use('/feedback', requireAdmin, feedbackRouter);
router.use('/settings', requireAdmin, settingsRouter);
router.use('/users', requireAdmin, usersRouter);
router.use('/backups', requireAdmin, backupsRouter);

router.get('/help', (req, res) => res.render('admin/help', {}));

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  console.error('[admin error]', req.method, req.originalUrl, err);
  if (req.get('accept')?.includes('application/json') || req.xhr || req.is('multipart/form-data')) {
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Ошибка' });
  }
  return res.status(err.status || 500).type('text').send(`Ошибка: ${err.message}`);
});
