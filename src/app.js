import path from 'node:path';
import express from 'express';
import compression from 'compression';
import { config } from './config.js';
import { createViews } from './views.js';
import { publicContext, router as publicRouter } from './routes/public.js';
import { router as feedsRouter } from './routes/feeds.js';
import { router as formsRouter } from './routes/forms.js';
import { router as adminRouter } from './routes/admin/index.js';
import { visibleIssues, upcomingIssues } from './models.js';
import { getDb } from './db.js';
import { hasAdminSession } from './auth.js';

function cspValue() {
  const script = ["'self'", 'https://telegram.org'];
  const connect = ["'self'"];
  if (config.metrikaId) {
    script.push('https://mc.yandex.ru');
    connect.push('https://mc.yandex.ru', 'https://mc.yandex.com');
  }
  if (config.umamiSrc) {
    try {
      const origin = new URL(config.umamiSrc).origin;
      script.push(origin);
      connect.push(origin);
    } catch {
      /* ignore bad URL */
    }
  }
  return [
    "default-src 'self'",
    `script-src ${script.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://mc.yandex.ru https://t.me https://*.telegram.org https://*.userapi.com https://i.ytimg.com",
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "media-src 'self'",
    "frame-src 'self' https://vk.com https://vkvideo.ru https://rutube.ru https://www.youtube-nocookie.com https://www.youtube.com https://t.me https://telegram.org https://*.telegram.org",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  createViews(app);

  const csp = cspValue();
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
      'X-Frame-Options': 'SAMEORIGIN',
    });
    if (config.isHttps) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  app.use(compression({ threshold: 1024 }));

  // Fingerprinted assets (?v=hash) are immutable.
  app.use('/assets', (req, res, next) => {
    if (req.query.v) res.set('Cache-Control', 'public, max-age=31536000, immutable');
    next();
  });
  // Fonts never change under the same file name.
  app.use('/assets/fonts', express.static(path.join(config.publicDir, 'fonts'), { maxAge: '365d', immutable: true, index: false }));
  app.use('/assets', express.static(config.publicDir, { maxAge: '1h', index: false }));
  app.use('/vendor/katex', express.static(path.join(config.root, 'node_modules', 'katex', 'dist'), { maxAge: '30d', index: false }));
  // Uploaded files: gone from the DB or marked "no consent" means gone from the web, even for direct links.
  app.use('/media', (req, res, next) => {
    const parts = req.path.split('/').filter(Boolean);
    let base = '';
    if (parts[0] === 'img' && parts.length === 3) base = parts[1];
    else if (parts[0] === 'files' && parts.length === 2) base = parts[1].replace(/\.[a-z0-9]+$/i, '');
    if (!base) return res.status(404).type('text').send('Not found');
    const row = getDb().prepare('SELECT consent FROM media WHERE base = ?').get(base);
    if (!row || (row.consent === 'no' && !hasAdminSession(req))) return res.status(404).type('text').send('Not found');
    return next();
  });
  app.use(
    '/media',
    express.static(config.uploadsDir, {
      maxAge: '1d',
      index: false,
      fallthrough: false,
      setHeaders(res, file) {
        if (file.endsWith('.avif')) res.setHeader('Content-Type', 'image/avif');
      },
    }),
  );

  app.get('/healthz', (req, res) => {
    try {
      getDb().prepare('SELECT 1').get();
      res.type('text').send('ok');
    } catch {
      res.status(503).type('text').send('db');
    }
  });

  // Admin has its own body parsing, sessions and CSRF.
  app.use('/admin', adminRouter);

  // Forms parse their own body (small limits).
  app.use(publicContext);
  app.use(formsRouter);
  app.use(feedsRouter);
  app.use(publicRouter);

  // 404
  app.use((req, res) => {
    const next = upcomingIssues(visibleIssues())[0] || null;
    res.status(404).render('pages/404', { next, page: { ...res.locals.page, title: `404 · ${res.locals.settings.site_title}`, noindex: true } });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && (err.status === 404 || err.code === 'ENOENT')) {
      return res.status(404).type('text').send('Not found');
    }
    // Malformed or oversized request bodies are the client's problem, not a server error.
    const clientStatus = err && (err.status || err.statusCode);
    if (clientStatus >= 400 && clientStatus < 500) {
      if (res.headersSent) return undefined;
      if (req.accepts(['html', 'json']) === 'json') return res.status(clientStatus).json({ ok: false, message: 'Некорректный запрос.' });
      return res.status(clientStatus).type('text').send('Bad request');
    }
    console.error('[error]', req.method, req.originalUrl, err);
    if (res.headersSent) return undefined;
    const page = { title: `Ошибка · ${res.locals.settings?.site_title || 'Science Lounge'}`, noindex: true, description: '' };
    if (!res.locals.t) {
      res.status(500).type('text').send('Server error');
      return undefined;
    }
    return res.status(500).render('pages/error', { page });
  });

  return app;
}
