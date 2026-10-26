import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, n, saltB64, keyB64] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(keyB64, 'base64url');
  const key = await scrypt(password, salt, expected.length, { N: Number(n), r: 8, p: 1 });
  return crypto.timingSafeEqual(key, expected);
}

export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Sliding-window limiter in memory (single process). */
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, hits] of buckets) {
    const fresh = hits.filter((t) => now - t < 3600e3);
    if (fresh.length) buckets.set(k, fresh);
    else buckets.delete(k);
  }
}, 600e3).unref();

export function resetRateLimits() {
  buckets.clear();
}

/** Signed form timestamp: lets the server drop instant bot submissions without a captcha. */
export function formToken(secret, now = Date.now()) {
  const ts = String(now);
  const sig = crypto.createHmac('sha256', secret).update(ts).digest('base64url').slice(0, 22);
  return `${ts}.${sig}`;
}

export function checkFormToken(secret, token, { minMs = 2000, maxMs = 24 * 3600e3 } = {}) {
  const [ts, sig] = String(token || '').split('.');
  if (!ts || !sig) return false;
  const expect = crypto.createHmac('sha256', secret).update(ts).digest('base64url').slice(0, 22);
  if (!safeEqual(sig, expect)) return false;
  const age = Date.now() - Number(ts);
  return age >= minMs && age <= maxMs;
}
