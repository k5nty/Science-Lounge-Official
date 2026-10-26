// Small helpers shared by admin routes: body parsing, flash messages, validation utilities.
import { parseCookies, setCookie } from '../../auth.js';
import { typo, typoRich } from '../../lib/typo.js';

export const clean = (v, max = 5000) =>
  String(v ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);

/** qs may give us array, object with numeric keys, or a single value. */
export function toList(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') {
    return Object.keys(value)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => value[k]);
  }
  return [value];
}

export const intOr = (v, d = 0) => {
  const n = Number.parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : d;
};
export const checked = (v) => v === '1' || v === 'on' || v === 'true' || v === true;
export const idList = (v) => toList(v).map((x) => intOr(x)).filter((x) => x > 0);

export function linesOf(text, { max = 500, limit = 50 } = {}) {
  return String(text ?? '')
    .split(/\n/)
    .map((s) => clean(s, max))
    .filter(Boolean)
    .slice(0, limit);
}

export function parseLinks(value) {
  return toList(value)
    .map((l) => ({ label: clean(l?.label, 80), url: safeUrl(l?.url) }))
    .filter((l) => l.url);
}

export function safeUrl(u) {
  const s = clean(u, 500);
  if (!s) return '';
  if (/^(https?:\/\/|mailto:|tg:)/i.test(s)) return s;
  if (/^(t\.me|vk\.com|www\.)/i.test(s)) return `https://${s}`;
  if (/^\/(?!\/)/.test(s)) return s;
  return '';
}

export const ru = (s, max) => typo(clean(s, max));
export const ruRich = (s, max) => typoRich(clean(s, max));

export function flash(res, kind, message) {
  setCookie(res, 'sl_flash', JSON.stringify({ k: kind, m: message }), { maxAgeSec: 60 });
}

export function takeFlash(req, res) {
  const raw = parseCookies(req.headers.cookie).sl_flash;
  if (!raw) return null;
  setCookie(res, 'sl_flash', '', { maxAgeSec: 0 });
  try {
    const v = JSON.parse(raw);
    return { kind: v.k === 'err' ? 'err' : v.k === 'warn' ? 'warn' : 'ok', message: String(v.m).slice(0, 600) };
  } catch {
    return null;
  }
}
