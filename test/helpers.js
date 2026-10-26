import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Boots the real app on an ephemeral port with an isolated data dir. */
export async function boot({ env = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-test-'));
  Object.assign(process.env, {
    DATA_DIR: dir,
    SITE_URL: 'http://localhost',
    BACKUP_ENABLED: 'false',
    TG_BOT_TOKEN: '',
    TG_CHAT_ID: '',
    METRIKA_ID: '',
    ...env,
  });
  const { ensureDirs } = await import('../src/config.js');
  ensureDirs();
  const { openDb, setDb } = await import('../src/db.js');
  const db = openDb(path.join(dir, 'test.db'));
  setDb(db);
  const { createApp } = await import('../src/app.js');
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    db,
    dir,
    close: () => new Promise((r) => server.close(r)),
  };
}

export class Client {
  constructor(base) {
    this.base = base;
    this.cookies = new Map();
  }

  async req(method, url, { body, headers = {}, form, json, redirect = 'manual' } = {}) {
    const h = { ...headers };
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    let payload;
    if (form) {
      payload = new URLSearchParams(form).toString();
      h['content-type'] = 'application/x-www-form-urlencoded';
    } else if (json) {
      payload = JSON.stringify(json);
      h['content-type'] = 'application/json';
    } else if (body !== undefined) {
      payload = body;
    }
    const res = await fetch(this.base + url, { method, headers: h, body: payload, redirect });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i);
      const v = pair.slice(i + 1);
      if (/Max-Age=0/i.test(c)) this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
    const text = await res.text();
    return { status: res.status, headers: res.headers, text, location: res.headers.get('location') };
  }

  get(url, o) {
    return this.req('GET', url, o);
  }

  post(url, form, o = {}) {
    return this.req('POST', url, { ...o, form });
  }
}
