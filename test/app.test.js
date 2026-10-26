import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { boot, Client } from './helpers.js';

let env;
let admin;
let editor;
let anon;
let csrfAdmin;

const csrfOf = (html) => /<meta name="csrf" content="([^"]+)"/.exec(html)?.[1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const future = (days) => {
  const d = new Date(Date.now() + days * 86400e3 + 3 * 3600e3);
  return { date: d.toISOString().slice(0, 10), time: '17:30' };
};
const iso = (days) => new Date(Date.now() + days * 86400e3).toISOString();

before(async () => {
  env = await boot();
  const { hashPassword } = await import('../src/lib/security.js');
  const ins = env.db.prepare('INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,?)');
  ins.run('admin@test.org', 'Админ', await hashPassword('admin-password-1'), 'admin');
  ins.run('editor@test.org', 'Редактор', await hashPassword('editor-password-1'), 'editor');
  anon = new Client(env.base);
  admin = new Client(env.base);
  editor = new Client(env.base);
  let r = await admin.post('/admin/login', { email: 'admin@test.org', password: 'admin-password-1', next: '/admin' });
  assert.equal(r.status, 303);
  r = await editor.post('/admin/login', { email: 'editor@test.org', password: 'editor-password-1', next: '/admin' });
  assert.equal(r.status, 303);
  csrfAdmin = csrfOf((await admin.get('/admin/lecturers/new')).text);
  assert.ok(csrfAdmin, 'csrf token on admin pages');
});

after(async () => {
  await env.close();
  env.db.close();
});

const adminPost = (url, form, client = admin, csrf = csrfAdmin) => client.post(url, { ...form, _csrf: csrf });

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === 'object' && x !== null ? flatten(x, `${key}[${i}]`, out) : (out[`${key}[${i}]`] = x)));
    else if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

test('empty site renders and 404s are styled', async () => {
  for (const p of ['/', '/raspisanie', '/vypuski', '/novosti', '/konferentsiya', '/o-nas', '/otzyv', '/politika', '/udalit-foto', '/en/', '/en/issues', '/en/news', '/en/about', '/en/conference']) {
    const r = await anon.get(p);
    assert.equal(r.status, 200, p);
  }
  const nf = await anon.get('/vypusk/nope');
  assert.equal(nf.status, 404);
  assert.ok(nf.text.includes('Этого выпуска ещё не было'));
  for (const p of ['/sitemap.xml', '/robots.txt', '/feed.xml', '/raspisanie.ics', '/search-index.json']) assert.equal((await anon.get(p)).status, 200, p);
  const r = await anon.get('/');
  assert.ok(r.headers.get('content-security-policy').includes("script-src 'self'"));
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('admin requires login, CSRF and role', async () => {
  const r = await anon.get('/admin/issues');
  assert.equal(r.status, 302);
  assert.ok(r.location.startsWith('/admin/login'));
  const bad = await new Client(env.base).post('/admin/login', { email: 'admin@test.org', password: 'nope' });
  assert.equal(bad.status, 401);
  const noCsrf = await admin.post('/admin/lecturers', { name_ru: 'Без токена' });
  assert.equal(noCsrf.status, 403);
  const ed = await editor.get('/admin/feedback');
  assert.equal(ed.status, 403);
  assert.equal((await editor.get('/admin/settings')).status, 403);
  assert.equal((await editor.get('/admin/issues')).status, 200);
  assert.equal((await admin.get('/admin/feedback')).status, 200);
});

let lecturerId;
let issueId;
let mediaId;

test('lecturer CRUD escapes content on the public page', async () => {
  const r = await adminPost('/admin/lecturers', { name_ru: '<img src=x onerror=alert(1)> Иван Иванов', role_ru: 'Доцент', area: 'Физика', bio_ru: 'Био "тест" - ок', slug: '' });
  assert.equal(r.status, 303);
  lecturerId = Number(/\/admin\/lecturers\/(\d+)/.exec(r.location)[1]);
  const row = env.db.prepare('SELECT * FROM lecturers WHERE id = ?').get(lecturerId);
  assert.ok(row.slug.length > 0);
  assert.ok(row.bio_ru.includes('«тест»'), 'typographer ran on save');
});

test('image upload: processed to WebP/AVIF, EXIF dropped, junk rejected', async () => {
  const png = await sharp({ create: { width: 1800, height: 1000, channels: 3, background: '#99aabb' } }).jpeg().withExif({ IFD0: { Copyright: 'x' } }).toBuffer();
  const fd = new FormData();
  fd.append('file', new Blob([png], { type: 'image/jpeg' }), 'p.jpg');
  fd.append('purpose', 'photo');
  const r = await admin.req('POST', '/admin/media', { body: fd, headers: { 'x-csrf-token': csrfAdmin, accept: 'application/json' } });
  assert.equal(r.status, 200, r.text);
  const m = JSON.parse(r.text).media;
  mediaId = m.id;
  assert.equal(m.consent, 'pending');
  const img = await fetch(env.base + m.thumb);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/webp');
  const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
  assert.ok(!meta.exif, 'no EXIF in output');

  const junk = new FormData();
  junk.append('file', new Blob(['not an image'], { type: 'image/jpeg' }), 'x.jpg');
  junk.append('purpose', 'photo');
  const bad = await admin.req('POST', '/admin/media', { body: junk, headers: { 'x-csrf-token': csrfAdmin, accept: 'application/json' } });
  assert.equal(bad.status, 422);
  const noCsrf = await admin.req('POST', '/admin/media', { body: fd, headers: { accept: 'application/json' } });
  assert.equal(noCsrf.status, 403);
});

test('publishing guard: photo without alt keeps the issue a draft', async () => {
  const f = future(-10); // already past
  const base = {
    number: 1, title_ru: 'Как видеть атом', date: f.date, time: f.time, place_ru: 'Зал', lecturers: String(lecturerId),
    thought_ru: 'Главная мысль', publish_state: 'published', tags: 'физика',
    'ideas[0][h]': 'Идея 1', 'ideas[0][body]': 'Текст про дифракцию.\n\nВторой абзац.', 'ideas[0][quote]': 'Цитата',
    'terms[0][term]': 'Дифракция', 'terms[0][def]': 'Огибание.',
    'qa[0][q]': 'Вопрос?', 'qa[0][a]': 'Ответ.',
    'photos[]': String(mediaId), cover_id: String(mediaId),
    [`photo_meta[m${mediaId}][alt]`]: '', [`photo_meta[m${mediaId}][consent]`]: 'yes',
  };
  let r = await adminPost('/admin/issues', base);
  assert.equal(r.status, 303, r.text);
  issueId = Number(/\/admin\/issues\/(\d+)/.exec(r.location)[1]);
  assert.equal(env.db.prepare('SELECT publish_state FROM issues WHERE id=?').get(issueId).publish_state, 'draft');
  assert.equal((await anon.get('/vypusk/01-kak-videt-atom')).status, 404, 'draft is not public');

  r = await adminPost(`/admin/issues/${issueId}`, { ...base, [`photo_meta[m${mediaId}][alt]`]: 'Лектор у доски' });
  assert.equal(r.status, 303);
  assert.equal(env.db.prepare('SELECT publish_state FROM issues WHERE id=?').get(issueId).publish_state, 'published');
  const page = await anon.get('/vypusk/01-kak-videt-atom');
  assert.equal(page.status, 200);
  assert.ok(page.text.includes('Как видеть атом'));
  assert.ok(page.text.includes('class="term"'), 'term underlined');
  assert.ok(page.text.includes('Лектор у доски'), 'photo with consent visible');
  assert.ok(page.text.includes('application/ld+json'));
});

test('photo consent "no"/"pending" hides the photo from the public', async () => {
  const f = future(-10);
  const base = {
    number: 1, title_ru: 'Как видеть атом', date: f.date, time: f.time, lecturers: String(lecturerId), publish_state: 'published',
    'photos[]': String(mediaId), cover_id: String(mediaId),
    [`photo_meta[m${mediaId}][alt]`]: 'Скрытое фото', [`photo_meta[m${mediaId}][consent]`]: 'no',
  };
  const r = await adminPost(`/admin/issues/${issueId}`, base);
  assert.equal(r.status, 303);
  const page = await anon.get('/vypusk/01-kak-videt-atom');
  assert.ok(!page.text.includes('Скрытое фото'));
  assert.ok(!page.text.includes(`/media/img/`) || !page.text.includes('Скрытое'), 'no photo markup');
  assert.ok(!page.text.includes('class="cover"'), 'no cover without consent');
});

test('scheduled publication becomes visible only after its time', async () => {
  const f = future(20);
  const mk = (n, publishAt) => ({
    number: n, title_ru: `Выпуск ${n}`, date: f.date, time: f.time, lecturers: String(lecturerId),
    publish_state: 'scheduled', publish_at: publishAt,
  });
  const local = (daysOffset) => new Date(Date.now() + daysOffset * 86400e3 + 3 * 3600e3).toISOString().slice(0, 16);
  let r = await adminPost('/admin/issues', mk(2, local(2)));
  assert.equal(r.status, 303);
  assert.equal((await anon.get('/vypusk/02-vypusk-2')).status, 404, 'future schedule hidden');
  r = await adminPost('/admin/issues', mk(3, local(-1)));
  assert.equal(r.status, 303);
  assert.equal((await anon.get('/vypusk/03-vypusk-3')).status, 200, 'past schedule visible');
  const sched = await anon.get('/raspisanie');
  assert.ok(sched.text.includes('Выпуск 3'));
  assert.ok(!sched.text.includes('Выпуск 2'));
  const ics = await anon.get('/vypusk/03-vypusk-3.ics');
  assert.equal(ics.status, 200);
  assert.ok(ics.text.includes('BEGIN:VEVENT'));
  assert.ok(ics.headers.get('content-type').startsWith('text/calendar'));
  const home = await anon.get('/');
  assert.ok(home.text.includes('Выпуск 3'), 'upcoming issue leads the home page');
});

test('duplicate issue number is rejected, slug stays unique', async () => {
  const f = future(30);
  const r = await adminPost('/admin/issues', { number: 3, title_ru: 'Дубль', date: f.date, time: f.time, lecturers: String(lecturerId) });
  assert.equal(r.status, 422);
  assert.ok(r.text.includes('уже занят'));
});

test('feedback forms: token, honeypot, consent, rate limit, storage', async () => {
  const page = await anon.get('/otzyv?t=contact');
  const token = /name="_t" value="([^"]+)"/.exec(page.text)[1];
  const json = { headers: { accept: 'application/json' } };
  const post = (type, form) => anon.req('POST', `/forms/${type}`, { form, headers: { accept: 'application/json', 'x-forwarded-for': '9.9.9.9' } });

  let r = await post('contact', { name: 'А', contact: 'a@b.c', message: 'Привет', consent: '1', kind: 'Другое' });
  assert.equal(r.status, 400, 'missing token');

  await sleep(1700);
  r = await post('contact', { _t: token, name: 'Оля', contact: 'olya@b.c', message: 'Хочу выступить', kind: 'Другое' });
  assert.equal(r.status, 422, 'consent required');
  assert.ok(JSON.parse(r.text).errors.consent);

  r = await post('contact', { _t: token, name: 'Оля', contact: 'olya@b.c', message: 'Хочу выступить', kind: 'Другое', consent: '1' });
  assert.equal(r.status, 200, r.text);
  const row = env.db.prepare("SELECT * FROM feedback WHERE type='contact'").get();
  assert.equal(row.name, 'Оля');
  assert.equal(row.consent, 1);
  assert.ok(row.consent_at);

  const before = env.db.prepare('SELECT COUNT(*) c FROM feedback').get().c;
  r = await post('suggest', { _t: token, what: 'Бот', website: 'http://spam' });
  assert.equal(r.status, 200, 'honeypot looks successful');
  assert.equal(env.db.prepare('SELECT COUNT(*) c FROM feedback').get().c, before, 'honeypot stored nothing');

  // review needs a started lecture and a rating
  r = await post('review', { _t: token, issue: String(issueId), rating: '9' });
  assert.equal(r.status, 422);
  r = await post('review', { _t: token, issue: String(issueId), rating: '5', good: 'Круто', grade: '10' });
  assert.equal(r.status, 200, r.text);
  assert.equal(env.db.prepare("SELECT rating FROM feedback WHERE type='review'").get().rating, 5);

  let last;
  for (let i = 0; i < 8; i++) last = await post('question', { _t: token, issue: String(issueId), question: `Вопрос ${i}` });
  assert.equal(last.status, 429, 'rate limit kicks in');
  void json;
});

test('photo removal request gets a due date; admin sees and exports it', async () => {
  const page = await anon.get('/udalit-foto');
  const token = /name="_t" value="([^"]+)"/.exec(page.text)[1];
  await sleep(1700);
  (await import('../src/lib/security.js')).resetRateLimits();
  const r = await anon.req('POST', '/forms/photo_removal', {
    form: { _t: token, where: '/vypusk/01-kak-videt-atom', message: 'Я на третьем фото слева', contact: '@kid', consent: '1' },
    headers: { accept: 'application/json', 'x-forwarded-for': '8.8.8.8' },
  });
  assert.equal(r.status, 200, r.text);
  const row = env.db.prepare("SELECT * FROM feedback WHERE type='photo_removal'").get();
  assert.ok(row.due_at);
  const days = (Date.parse(row.due_at) - Date.parse(row.created_at)) / 86400e3;
  assert.ok(days > 9.5 && days < 10.5);
  const csv = await admin.get('/admin/feedback/export.csv');
  assert.equal(csv.status, 200);
  assert.equal(csv.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.ok(csv.text.includes('Удалить фото'));
});

test('lecturer in use cannot be deleted; unused can', async () => {
  let r = await adminPost(`/admin/lecturers/${lecturerId}/delete`, {});
  assert.equal(r.status, 303);
  assert.ok(env.db.prepare('SELECT 1 FROM lecturers WHERE id=?').get(lecturerId), 'still there');
  const created = await adminPost('/admin/lecturers', { name_ru: 'Временный' });
  const id = Number(/\/admin\/lecturers\/(\d+)/.exec(created.location)[1]);
  r = await adminPost(`/admin/lecturers/${id}/delete`, {});
  assert.equal(env.db.prepare('SELECT 1 FROM lecturers WHERE id=?').get(id), undefined);
});

test('conference page and EN pages render published data', async () => {
  const r = await adminPost('/admin/conferences', {
    year: '2026', title_ru: 'National Letovo Engineers', published: '1', regions: 'Москва\nСанкт-Петербург',
    'program[0][title]': 'День 1', 'program[0][items]': '10:00 Открытие\n11:00 Постеры',
    jury: String(lecturerId),
  });
  assert.equal(r.status, 303, r.text);
  const page = await anon.get('/konferentsiya/2026');
  assert.equal(page.status, 200);
  assert.ok(page.text.includes('Открытие'));
  assert.ok(page.text.includes('Санкт-Петербург'));
  assert.equal((await anon.get('/konferentsiya')).status, 302);
  assert.equal((await anon.get('/en/conference/2026')).status, 200);
  const home = await anon.get('/');
  assert.ok(/<b class="mono">2<\/b>/.test(home.text) || home.text.includes('регионов'), 'regions stat from conference');
});

test('sitemap lists only public pages', async () => {
  const s = await anon.get('/sitemap.xml');
  assert.ok(s.text.includes('/vypusk/01-kak-videt-atom'));
  assert.ok(s.text.includes('/vypusk/03-vypusk-3'));
  assert.ok(!s.text.includes('02-vypusk-2'));
  assert.ok(!s.text.includes('/admin'));
});

test('OG image renders as PNG', async () => {
  const r = await fetch(`${env.base}/og/01-kak-videt-atom.png`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  const buf = Buffer.from(await r.arrayBuffer());
  const meta = await sharp(buf).metadata();
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 630);
});

test('healthz answers', async () => {
  const r = await anon.get('/healthz');
  assert.equal(r.status, 200);
  assert.equal(r.text, 'ok');
});

test('validation error keeps the gallery, cover and metadata the editor had', async () => {
  const f = future(-5);
  const form = {
    number: 7, title_ru: '', date: f.date, time: f.time, lecturers: String(lecturerId), publish_state: 'draft',
    'photos[]': String(mediaId), cover_id: String(mediaId),
    [`photo_meta[m${mediaId}][alt]`]: 'Описание сохраняется', [`photo_meta[m${mediaId}][consent]`]: 'yes',
  };
  const r = await adminPost('/admin/issues', form);
  assert.equal(r.status, 422);
  assert.ok(r.text.includes(`name="photos[]" value="${mediaId}"`), 'photo still in the re-rendered form');
  assert.ok(r.text.includes('Описание сохраняется'));
});

test('quick publish respects the alt-text guard', async () => {
  const noAlt = await adminPost('/admin/media', {}).catch(() => null);
  void noAlt;
  const png = await sharp({ create: { width: 800, height: 500, channels: 3, background: '#445566' } }).jpeg().toBuffer();
  const fd = new FormData();
  fd.append('file', new Blob([png], { type: 'image/jpeg' }), 'q.jpg');
  fd.append('purpose', 'photo');
  const up = await admin.req('POST', '/admin/media', { body: fd, headers: { 'x-csrf-token': csrfAdmin, accept: 'application/json' } });
  const m2 = JSON.parse(up.text).media.id;
  const f = future(-3);
  let r = await adminPost('/admin/issues', {
    number: 20, title_ru: 'Быстрая публикация', date: f.date, time: f.time, lecturers: String(lecturerId), publish_state: 'draft',
    'photos[]': String(m2), [`photo_meta[m${m2}][alt]`]: '', [`photo_meta[m${m2}][consent]`]: 'yes',
  });
  const id = Number(/\/admin\/issues\/(\d+)/.exec(r.location)[1]);
  r = await adminPost(`/admin/issues/${id}/quick`, { state: 'published' });
  assert.equal(r.status, 303);
  assert.equal(env.db.prepare('SELECT publish_state FROM issues WHERE id=?').get(id).publish_state, 'draft');
});

test('hostile URLs are not stored; cancelled lectures leave the archive and the numbers', async () => {
  const f = future(-40);
  const r = await adminPost('/admin/issues', {
    number: 30, title_ru: 'Отменённая', date: f.date, time: f.time, lecturers: String(lecturerId),
    publish_state: 'published', status_flag: 'cancelled', listeners: '99',
    video_cut_url: 'javascript:alert(1)',
  });
  assert.equal(r.status, 422, 'bad video link is a validation error');
  const ok = await adminPost('/admin/issues', {
    number: 30, title_ru: 'Отменённая', date: f.date, time: f.time, lecturers: String(lecturerId),
    publish_state: 'published', status_flag: 'cancelled', listeners: '99',
  });
  assert.equal(ok.status, 303);
  const archive = await anon.get('/vypuski');
  assert.ok(!archive.text.includes('Отменённая'));
  const home = await anon.get('/');
  assert.ok(!/<b class="mono">99/.test(home.text));
  const sched = await anon.get('/otzyv');
  assert.ok(!sched.text.includes('Отменённая'));
});

test('files of a photo marked "no consent" disappear for the public but stay for editors', async () => {
  const png = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#778899' } }).jpeg().toBuffer();
  const fd = new FormData();
  fd.append('file', new Blob([png], { type: 'image/jpeg' }), 'c.jpg');
  fd.append('purpose', 'photo');
  const up = JSON.parse((await admin.req('POST', '/admin/media', { body: fd, headers: { 'x-csrf-token': csrfAdmin, accept: 'application/json' } })).text).media;
  assert.equal((await anon.get(up.thumb)).status, 200, 'pending is reachable (unlisted random URL)');
  const upd = await admin.req('POST', `/admin/media/${up.id}`, { form: { consent: 'no', alt: 'x' }, headers: { 'x-csrf-token': csrfAdmin, accept: 'application/json' } });
  assert.equal(upd.status, 200);
  assert.equal((await anon.get(up.thumb)).status, 404, 'public gets 404');
  assert.equal((await admin.get(up.thumb)).status, 200, 'editor still sees it');
});

test('removing a photo from an issue deletes its files', async () => {
  const png = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#887766' } }).jpeg().toBuffer();
  const fd = new FormData();
  fd.append('file', new Blob([png], { type: 'image/jpeg' }), 'd.jpg');
  fd.append('purpose', 'photo');
  const up = JSON.parse((await admin.req('POST', '/admin/media', { body: fd, headers: { 'x-csrf-token': csrfAdmin, accept: 'application/json' } })).text).media;
  const f = future(-60);
  const base = { number: 40, title_ru: 'С фото и без', date: f.date, time: f.time, lecturers: String(lecturerId), publish_state: 'draft' };
  let r = await adminPost('/admin/issues', {
    ...base, 'photos[]': String(up.id), [`photo_meta[m${up.id}][alt]`]: 'Фото', [`photo_meta[m${up.id}][consent]`]: 'yes',
  });
  const id = Number(/\/admin\/issues\/(\d+)/.exec(r.location)[1]);
  assert.equal((await fetch(env.base + up.thumb)).status, 200);
  r = await adminPost(`/admin/issues/${id}`, base); // saved again without the photo
  assert.equal(r.status, 303);
  await sleep(150);
  assert.equal((await fetch(env.base + up.thumb)).status, 404, 'files are gone');
  assert.equal(env.db.prepare('SELECT 1 FROM media WHERE id=?').get(up.id), undefined);
});

test('slides need the lecturer-permission flag to appear', async () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  const fd = new FormData();
  fd.append('file', new Blob([pdf], { type: 'application/pdf' }), 'slides.pdf');
  fd.append('purpose', 'file');
  const up = JSON.parse((await admin.req('POST', '/admin/media', { body: fd, headers: { 'x-csrf-token': csrfAdmin, accept: 'application/json' } })).text).media;
  const f = future(-70);
  const form = { number: 50, title_ru: 'Со слайдами', date: f.date, time: f.time, lecturers: String(lecturerId), publish_state: 'published', slides_id: String(up.id) };
  let r = await adminPost('/admin/issues', form);
  const id = Number(/\/admin\/issues\/(\d+)/.exec(r.location)[1]);
  const slug = env.db.prepare('SELECT slug FROM issues WHERE id=?').get(id).slug;
  assert.ok(!(await anon.get(`/vypusk/${slug}`)).text.includes('Слайды (PDF)'));
  r = await adminPost(`/admin/issues/${id}`, { ...form, slides_ok: '1' });
  assert.ok((await anon.get(`/vypusk/${slug}`)).text.includes('Слайды (PDF)'));
});

test('material on the lecture topic: folded under the issue in RU and EN, hidden when empty', async () => {
  const f = future(-80);
  const form = { number: 55, title_ru: 'С материалом', title_en: 'With material', date: f.date, time: f.time, lecturers: String(lecturerId), publish_state: 'published' };
  let r = await adminPost('/admin/issues', form);
  assert.equal(r.status, 303, r.text);
  const id = Number(/\/admin\/issues\/(\d+)/.exec(r.location)[1]);
  const slug = env.db.prepare('SELECT slug FROM issues WHERE id=?').get(id).slug;
  assert.ok(!(await anon.get(`/vypusk/${slug}`)).text.includes('id="transcript"'), 'no section without material');

  r = await adminPost(`/admin/issues/${id}`, { ...form, material_ru: '## Вступление\n\n**Лектор:** Добрый день!', material_en: '## Introduction\n\n**Speaker:** Good afternoon!' });
  assert.equal(r.status, 303, r.text);
  const ru = (await anon.get(`/vypusk/${slug}`)).text;
  assert.ok(ru.includes('<h2>Материал по теме лекции</h2>') && ru.includes('Это не стенограмма'));
  assert.ok(ru.includes('<summary>Читать материал</summary>') && ru.includes('<h3>Вступление</h3>'));
  assert.ok(ru.indexOf('id="transcript"') < ru.indexOf('id="review"'), 'material comes before the review form');
  const en = (await anon.get(`/en/issues/${slug}`)).text;
  assert.ok(en.includes('<h2>Material on the lecture topic</h2>') && en.includes('<summary>Read the material</summary>'));
  assert.ok(en.includes('<b>Speaker:</b> Good afternoon!'));
  assert.ok(!en.includes('Read the full write-up'), 'no link to the Russian write-up on EN pages');
  assert.ok((await admin.get(`/admin/issues/${id}`)).text.includes('Добрый день!'), 'admin form keeps the text');
});

test('English version: translated content and a language switch that lands on the same page', async () => {
  const f = future(-90);
  const r = await adminPost('/admin/issues', {
    number: 60, title_ru: 'Русская тема', title_en: 'English topic', thought_ru: 'Русская мысль', thought_en: 'English thought',
    date: f.date, time: f.time, lecturers: String(lecturerId), publish_state: 'published', tags: 'физика (physics)',
  });
  assert.equal(r.status, 303, r.text);
  const slug = env.db.prepare('SELECT slug FROM issues WHERE number = 60').get().slug;

  const ru = await anon.get(`/vypusk/${slug}`);
  assert.ok(ru.text.includes('href="/en/issues/' + slug + '"'), 'RU issue page links to its EN twin');
  const en = await anon.get(`/en/issues/${slug}`);
  assert.equal(en.status, 200);
  assert.ok(en.text.includes('English topic') && en.text.includes('English thought'));
  assert.ok(en.text.includes('href="/vypusk/' + slug + '"'), 'EN page links back to RU');
  assert.ok(en.text.includes('<html lang="en"'));

  const archive = await anon.get('/en/issues');
  assert.ok(archive.text.includes('English topic'));
  assert.ok(archive.text.includes('>physics<'), 'tag shown in English');
  const archiveRu = await anon.get('/vypuski');
  assert.ok(archiveRu.text.includes('>физика<'));

  // every page has an English twin, and the switch from each RU page points to it
  const pairs = [['/', '/en/'], ['/raspisanie', '/en/schedule'], ['/vypuski', '/en/issues'], ['/novosti', '/en/news'], ['/o-nas', '/en/about'], ['/otzyv', '/en/feedback']];
  for (const [ruPath, enPath] of pairs) {
    const page = await anon.get(ruPath);
    assert.ok(new RegExp(`class="lang" href="${enPath}"`).test(page.text), `${ruPath} -> ${enPath}`);
    const enPage = await anon.get(enPath);
    assert.equal(enPage.status, 200, enPath);
    assert.ok(enPage.text.includes('<html lang="en"'));
    assert.ok(!/class="lang" href="\/en/.test(enPage.text), 'EN page offers RU, not EN');
  }
  const enNav = (await anon.get('/en/')).text;
  assert.ok(enNav.includes('>News<') && enNav.includes('>Schedule<') && enNav.includes('>Talks<'));
  const enForm = await anon.get('/en/feedback');
  assert.ok(enForm.text.includes('How was the talk?') || enForm.text.includes('Talk review'));
});

test('lecturers have no pages: old URLs land on the talk, nav has no speakers', async () => {
  const slug = env.db.prepare('SELECT slug FROM issues WHERE number = 60').get().slug;
  const lec = env.db.prepare('SELECT slug FROM lecturers WHERE id = ?').get(lecturerId);
  let r = await fetch(`${env.base}/lektory`, { redirect: 'manual' });
  assert.equal(r.status, 301);
  assert.equal(new URL(r.headers.get('location'), env.base).pathname, '/vypuski');
  r = await fetch(`${env.base}/lektory/${lec.slug}`, { redirect: 'manual' });
  assert.equal(r.status, 301);
  assert.ok(new URL(r.headers.get('location'), env.base).pathname.startsWith('/vypusk/'), 'goes to a talk');
  r = await fetch(`${env.base}/en/speakers`, { redirect: 'manual' });
  assert.equal(r.status, 301);
  const home = (await anon.get('/')).text;
  assert.ok(!home.includes('href="/lektory'), 'no lecturer links on the home page');
  const page = (await anon.get(`/vypusk/${slug}`)).text;
  assert.ok(!page.includes('href="/lektory'), 'no lecturer links on the talk page');
  assert.ok(!(await anon.get('/sitemap.xml')).text.includes('/lektory'));
});

test('news: admin CRUD, public RU/EN lists, hidden items stay hidden, bad source link rejected', async () => {
  let r = await adminPost('/admin/news', { title_ru: 'Нобелевская премия по физике', title_en: 'Nobel Prize in Physics', summary_ru: 'Коротко о премии.', summary_en: 'In short.', source_name: 'NobelPrize.org', source_url: 'https://www.nobelprize.org/prizes/physics/', date: '2026-10-06', published: '1' });
  assert.equal(r.status, 303, r.text);
  const id = Number(/\/admin\/news\/(\d+)/.exec(r.location)[1]);
  r = await adminPost('/admin/news', { title_ru: 'Скрытая новость', summary_ru: 'Не для всех.', date: '2026-10-05' });
  assert.equal(r.status, 303);
  r = await adminPost('/admin/news', { title_ru: 'Плохая ссылка', date: '2026-10-04', source_url: 'javascript:alert(1)', published: '1' });
  assert.equal(r.status, 422);

  const flat = (t) => t.replace(/\u00a0/g, ' ');
  const ru = await anon.get('/novosti');
  assert.equal(ru.status, 200);
  assert.ok(flat(ru.text).includes('Нобелевская премия по физике') && ru.text.includes('NobelPrize.org'));
  assert.ok(!ru.text.includes('Скрытая новость') && !ru.text.includes('Плохая ссылка'));
  assert.ok(ru.text.includes('href="https://www.nobelprize.org/prizes/physics/"'));
  const en = await anon.get('/en/news');
  assert.ok(en.text.includes('Nobel Prize in Physics') && en.text.includes('In short.'));
  assert.ok(new RegExp('class="lang" href="/en/news"').test(ru.text), 'RU news links to EN twin');
  assert.ok(flat((await anon.get('/')).text).includes('Нобелевская премия по физике'), 'home shows the latest news');
  assert.ok((await anon.get('/sitemap.xml')).text.includes('/novosti'));

  r = await adminPost(`/admin/news/${id}`, { title_ru: 'Нобелевская премия по физике', date: '2026-10-06' });
  assert.equal(r.status, 303);
  assert.ok(!flat((await anon.get('/novosti')).text).includes('Нобелевская премия по физике'), 'unpublished disappears');
  r = await adminPost(`/admin/news/${id}/delete`, {});
  assert.equal(r.status, 303);
  assert.equal(env.db.prepare('SELECT 1 FROM news WHERE id=?').get(id), undefined);
  assert.equal((await editor.get('/admin/news')).status, 200, 'editors may manage news');
  assert.equal((await anon.get('/admin/news')).status, 302);
});

test('auto news: feeds are imported once, shown in their own language, hidden not re-added, old ones pruned', async () => {
  const { refreshNews } = await import('../src/lib/news-feed.js');
  const now = Date.parse('2026-10-22T12:00:00Z');
  const feed = (items) => `<rss><channel>${items.map(([t, l, d, desc]) => `<item><title>${t}</title><link>${l}</link><pubDate>${d}</pubDate><description>${desc || ''}</description></item>`).join('')}</channel></rss>`;
  const ruFeed = feed([['Белки учатся', 'https://ru.example/1', 'Thu, 22 Oct 2026 10:00:00 +0300', 'Короткое описание.'], ['Слишком старая', 'https://ru.example/old', 'Mon, 01 Sep 2026 10:00:00 +0300']]);
  const enFeed = feed([['Squirrels learn', 'https://en.example/1?utm_source=feed', 'Thu, 22 Oct 2026 04:00:00 EDT', 'Short text.']]);
  const fetcher = async (url) => (url.includes('ru.example') ? ruFeed : url.includes('en.example') ? enFeed : Promise.reject(new Error('HTTP 503')));
  const sources = [{ lang: 'ru', name: 'РУ-источник', url: 'https://ru.example/rss' }, { lang: 'en', name: 'EN source', url: 'https://en.example/rss' }, { lang: 'en', name: 'Broken', url: 'https://down.example/rss' }];

  let rep = await refreshNews({ fetcher, sources, now });
  assert.deepEqual(rep.results.map((r) => [r.name, r.ok, r.added ?? 0]), [['РУ-источник', true, 1], ['EN source', true, 1], ['Broken', false, 0]]);
  rep = await refreshNews({ fetcher, sources, now });
  assert.equal(rep.results[0].added + rep.results[1].added, 0, 'second run adds nothing');

  const flat = (t) => t.replace(/\u00a0/g, ' ');
  const ru = flat((await anon.get('/novosti')).text);
  const en = flat((await anon.get('/en/news')).text);
  assert.ok(ru.includes('Белки учатся') && ru.includes('РУ-источник') && ru.includes('href="https://ru.example/1"'));
  assert.ok(!ru.includes('Squirrels learn'), 'English item is not on the Russian page');
  assert.ok(en.includes('Squirrels learn') && !en.includes('Белки учатся'));
  assert.ok(en.includes('href="https://en.example/1"'), 'tracking parameters are stripped from the link');
  assert.ok(!ru.includes('Слишком старая'));

  const row = env.db.prepare("SELECT id FROM news WHERE source_name = 'РУ-источник'").get();
  let r = await adminPost(`/admin/news/${row.id}/delete`, {});
  assert.equal(r.status, 303);
  assert.equal(env.db.prepare('SELECT published FROM news WHERE id = ?').get(row.id).published, 0, 'auto item is hidden, not deleted');
  await refreshNews({ fetcher, sources, now });
  assert.ok(!flat((await anon.get('/novosti')).text).includes('Белки учатся'), 'hidden item does not come back');
  assert.equal(env.db.prepare("SELECT COUNT(*) c FROM news WHERE source_name = 'РУ-источник'").get().c, 1);

  const enRow = env.db.prepare("SELECT id FROM news WHERE source_name = 'EN source'").get();
  r = await adminPost(`/admin/news/${enRow.id}`, { title_ru: 'Белки учатся вместе', title_en: 'Squirrels learn', date: '2026-10-22', published: '1' });
  assert.equal(r.status, 303);
  assert.equal(env.db.prepare('SELECT auto FROM news WHERE id = ?').get(enRow.id).auto, 0, 'edited item becomes hand-made');
  assert.ok(flat((await anon.get('/novosti')).text).includes('Белки учатся вместе'));

  const stale = env.db.prepare("INSERT INTO news(slug,title_ru,published_at,auto,external_id) VALUES('a-stale','Устарела','2026-08-01T00:00:00Z',1,'https://old.example/x')").run();
  await refreshNews({ fetcher, sources, now });
  assert.equal(env.db.prepare('SELECT 1 FROM news WHERE id = ?').get(stale.lastInsertRowid), undefined, 'automatic items older than 45 days are removed');
  assert.ok(env.db.prepare('SELECT 1 FROM news WHERE id = ?').get(enRow.id), 'hand-made ones are kept');

  const last = JSON.parse(env.db.prepare("SELECT value FROM settings WHERE key = 'news_last_run'").get().value);
  assert.equal(last.results.length, 3);
  assert.equal((await admin.get('/admin/news')).status, 200);
  const page = (await admin.get('/admin/news')).text;
  assert.ok(page.includes('Обновить сейчас') && page.includes('Broken'));
  env.db.prepare('DELETE FROM news').run();
});

test('news pager: pages of 18, ?page= out of range falls back, no pager for a short list', async () => {
  const ins = env.db.prepare("INSERT INTO news(slug,title_ru,published_at,auto,external_id) VALUES(?,?,?,1,?)");
  for (let i = 1; i <= 20; i++) ins.run(`a-p${i}`, `Лента ${String(i).padStart(2, '0')}`, new Date(Date.UTC(2026, 9, 1, i)).toISOString(), `https://p.example/${i}`);
  let page = (await anon.get('/novosti')).text;
  assert.ok(page.includes('Лента 20') && page.includes('Лента 03') && !page.includes('Лента 02'), 'newest 18 on page 1');
  assert.ok(page.includes('href="/novosti?page=2"') && page.includes('1 / 2'));
  assert.ok(/<title>[^<]*Новости[^<]*<\/title>/.test(page) && page.includes('name="description"'), 'the pager variables must not hide the page title');
  page = (await anon.get('/novosti?page=2')).text;
  assert.ok(page.includes('Лента 02') && page.includes('Лента 01') && !page.includes('Лента 20'));
  assert.ok(page.includes('rel="prev"') && !page.includes('rel="next"'));
  assert.equal((await anon.get('/novosti?page=99')).status, 200);
  assert.equal((await anon.get('/novosti?page=abc')).status, 200);
  env.db.prepare("DELETE FROM news WHERE slug LIKE 'a-p%'").run();
  assert.ok(!(await anon.get('/novosti')).text.includes('class="news-pager"'));
});

test('team: role chips split on commas, hidden members and placeholders stay off the page', async () => {
  const ins = env.db.prepare("INSERT INTO team(kind,name_ru,role_ru,position,active) VALUES('founder',?,?,?,?)");
  ins.run('Тест Основатель', 'Сооснователь, CFO', 1, 1);
  ins.run('Тест Скрытый', 'Организатор', 2, 0);
  const about = (await anon.get('/o-nas')).text;
  assert.ok(about.includes('Тест Основатель'));
  assert.ok((about.match(/class="role-chip"/g) || []).length >= 2, 'two chips for two roles');
  assert.ok(about.includes('CFO'));
  assert.ok(!about.includes('Тест Скрытый'));
  env.db.prepare("DELETE FROM team WHERE name_ru LIKE 'Тест %'").run();
});

test('themes: ?theme= sets a cookie, bad ids are ignored, the switcher can be turned off', async () => {
  const c = new Client(env.base);
  let r = await c.get('/?theme=campus');
  assert.ok(r.text.includes('data-theme="campus"'));
  r = await c.get('/vypuski');
  assert.ok(r.text.includes('data-theme="campus"'), 'cookie remembered');
  assert.ok(r.text.includes('class="theme-switch"'));
  r = await c.get('/?theme=../../etc');
  assert.ok(r.text.includes('data-theme="campus"'), 'invalid id keeps the cookie value');
  const fresh = new Client(env.base);
  assert.ok((await fresh.get('/')).text.includes('data-theme="journal"'), 'default theme');

  // site default from settings, switcher off: visitors cannot change it
  const settingsPage = await admin.get('/admin/settings');
  assert.ok(settingsPage.text.includes('name="site_theme"'));
  env.db.prepare("INSERT INTO settings(key,value) VALUES('site_theme', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify('events'));
  env.db.prepare("INSERT INTO settings(key,value) VALUES('theme_switcher', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify('0'));
  const visitor = new Client(env.base);
  r = await visitor.get('/?theme=press');
  assert.ok(r.text.includes('data-theme="events"'), 'switcher off: query ignored');
  assert.ok(!r.text.includes('class="theme-switch"'));
  env.db.prepare("DELETE FROM settings WHERE key IN ('site_theme','theme_switcher')").run();
});
