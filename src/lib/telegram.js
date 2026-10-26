import { config } from '../config.js';

const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const tgEscape = escHtml;
export const telegramEnabled = () => Boolean(config.tgToken && config.tgChatId);

/** Fire-and-forget with retries. Never throws; a failed notification must not break a form. */
export function notifyTelegram(html, { retries = 3 } = {}) {
  if (!telegramEnabled()) return Promise.resolve(false);
  const send = async (attempt) => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${config.tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.tgChatId,
          text: html,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return true;
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt >= retries) {
        console.error('[telegram] giving up:', err.message);
        return false;
      }
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      return send(attempt + 1);
    }
  };
  return send(0);
}

const postCache = { value: null, at: 0, handle: '', inflight: false };

async function refreshChannelPost(handle) {
  if (postCache.inflight) return;
  postCache.inflight = true;
  try {
    const res = await fetch(`https://t.me/s/${handle}`, { signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'Mozilla/5.0 ScienceLoungeBot' } });
    if (res.ok) {
      const html = await res.text();
      const ids = [...html.matchAll(new RegExp(`data-post="${handle}/(\\d+)"`, 'gi'))].map((x) => Number(x[1]));
      if (ids.length) postCache.value = `${handle}/${Math.max(...ids)}`;
    }
  } catch {
    /* network unavailable: keep the previous value */
  } finally {
    postCache.at = Date.now();
    postCache.inflight = false;
  }
}

/**
 * Latest public post id of a channel (t.me/s preview). Never blocks a page render:
 * returns the cached value at once and refreshes it in the background every 30 minutes.
 */
export function latestChannelPost(channelUrl) {
  const m = /t\.me\/(?:s\/)?([A-Za-z0-9_]{4,})/.exec(channelUrl || '');
  if (!m) return null;
  const handle = m[1];
  if (postCache.handle !== handle) {
    postCache.handle = handle;
    postCache.value = null;
    postCache.at = 0;
  }
  if (Date.now() - postCache.at > 30 * 60e3) refreshChannelPost(handle);
  return postCache.value;
}
