import { config } from './config.js';
import { getDb, nowIso } from './db.js';
import { sha256, randomToken, safeEqual, rateLimit } from './lib/security.js';

export const COOKIE = 'sl_sid';

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        out[k] = part.slice(i + 1).trim();
      }
    }
  }
  return out;
}

export function setCookie(res, name, value, { maxAgeSec, httpOnly = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (httpOnly) parts.push('HttpOnly');
  if (config.isHttps) parts.push('Secure');
  if (maxAgeSec != null) parts.push(`Max-Age=${maxAgeSec}`);
  res.append('Set-Cookie', parts.join('; '));
}

export function createSession(userId, ip) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const expires = new Date(Date.now() + config.sessionDays * 86400e3).toISOString();
  getDb().prepare('INSERT INTO sessions(token_hash,user_id,csrf,ip,expires_at) VALUES(?,?,?,?,?)').run(sha256(token), userId, csrf, ip || '', expires);
  getDb().prepare('UPDATE users SET last_login = ? WHERE id = ?').run(nowIso(), userId);
  return token;
}

export function destroySession(token) {
  if (token) getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function purgeSessions() {
  getDb().prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso());
}

/** Loads req.user / req.csrf from the cookie. Does not reject. */
export function loadSession(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  req.user = null;
  if (token) {
    const row = getDb()
      .prepare(
        `SELECT s.csrf, s.expires_at, u.id, u.email, u.name, u.role, u.active FROM sessions s
         JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
      )
      .get(sha256(token));
    if (row && row.active && row.expires_at > nowIso()) {
      req.user = { id: row.id, email: row.email, name: row.name, role: row.role };
      req.csrf = row.csrf;
      req.sessionToken = token;
    }
  }
  res.locals.user = req.user;
  res.locals.csrf = req.csrf || '';
  next();
}

/** True when the request carries a live admin session (used to let editors see photos marked "no"). */
export function hasAdminSession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return false;
  const row = getDb()
    .prepare('SELECT 1 FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1')
    .get(sha256(token), nowIso());
  return Boolean(row);
}

export function requireUser(req, res, next) {
  if (req.user) return next();
  if (req.method === 'GET') {
    const target = encodeURIComponent(req.originalUrl);
    return res.redirect(`/admin/login?next=${target}`);
  }
  return res.status(401).json({ ok: false, message: 'Войдите заново.' });
}

export function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).render('admin/forbidden', { layout: 'admin' });
}

/** Mutating admin requests must carry the session CSRF token (form field or header). */
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = (req.body && req.body._csrf) || req.headers['x-csrf-token'] || req.query._csrf;
  if (req.csrf && sent && safeEqual(sent, req.csrf)) return next();
  return res.status(403).type('text').send('Сессия устарела. Вернитесь назад, обновите страницу и повторите.');
}

export function loginThrottle(ip, email) {
  return rateLimit(`login:${ip}`, 20, 15 * 60e3) && rateLimit(`login-user:${String(email).toLowerCase()}:${ip}`, 8, 15 * 60e3);
}
