// Fills an empty database with clearly-marked sample content so the site can be seen populated.
// Everything created here has is_demo = 1; `npm run seed:clear` removes it.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { ensureDirs } from '../src/config.js';
import { getDb } from '../src/db.js';
import { processImage } from '../src/lib/images.js';
import { insertMedia, saveLecturer, saveIssue, saveConference, saveTeamMember, insertFeedback } from '../src/models.js';
import { slugify, issueSlug } from '../src/lib/slug.js';
import { mskToUtcIso } from '../src/lib/dates.js';
import { typo } from '../src/lib/typo.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(here, 'demo-data.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(here, 'demo-data-en.json'), 'utf8'));
const tagWithEn = (t) => (en.tags[t] ? `${t} (${en.tags[t]})` : t);
ensureDirs();
const db = getDb();

if (db.prepare('SELECT COUNT(*) c FROM issues').get().c > 0 && !process.argv.includes('--force')) {
  console.error('В базе уже есть выпуски. Демо-данные не добавлены (флаг --force добавит поверх).');
  process.exit(1);
}

const PALETTE = ['#C9CCD1', '#B9BEC6', '#A9B0BC', '#D8DAD5', '#9AA3B5', '#BFC4B8'];
async function fakePhoto(seed, { w = 2000, h = 1200 } = {}) {
  const bg = PALETTE[seed % PALETTE.length];
  let shapes = '';
  for (let i = 0; i < 9; i++) {
    const x = ((seed * 37 + i * 211) % w);
    const y = ((seed * 53 + i * 127) % h);
    const r = 60 + ((seed + i * 31) % 160);
    shapes += `<circle cx="${x}" cy="${y}" r="${r}" fill="${i % 2 ? '#16181B' : '#2B33C9'}" opacity="${0.08 + (i % 4) * 0.05}"/>`;
  }
  shapes += `<rect x="${w * 0.12}" y="${h * 0.2}" width="${w * 0.5}" height="${h * 0.6}" fill="#16181B" opacity="0.1"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${bg}"/>${shapes}</svg>`;
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
  return buf;
}

async function demoMedia(seed, meta = {}, size) {
  const img = await processImage(await fakePhoto(seed, size));
  return insertMedia({
    kind: 'image',
    base: img.base,
    width: img.width,
    height: img.height,
    bytes: img.bytes,
    widths: img.widths,
    orig_name: `demo-${seed}.jpg`,
    consent: 'general',
    is_demo: 1,
    ...meta,
  });
}

const lecturerIds = {};
let n = 0;
for (const [key, l] of Object.entries(data.lecturers)) {
  const portrait = await demoMedia(++n * 7, { alt: `Портрет: ${l.name}`, consent: 'general' }, { w: 1200, h: 1500 });
  lecturerIds[key] = saveLecturer(
    {
      slug: slugify(l.name),
      name_ru: l.name,
      name_en: en.lecturers[key].name,
      role_en: en.lecturers[key].role.split(',')[0],
      org_en: en.lecturers[key].role.split(',').slice(1).join(',').trim(),
      area_en: en.lecturers[key].area,
      bio_en: en.lecturers[key].bio,
      facts_en: en.lecturers[key].facts,
      portrait_id: portrait.id,
      role_ru: typo(l.role.split(',')[0]),
      org_ru: typo(l.role.split(',').slice(1).join(',').trim()),
      area: l.area,
      bio_ru: typo(l.bio),
      facts_ru: l.facts.map(typo),
      links: [],
      is_demo: true,
    },
    null,
  );
}

const stripMarkup = (s) => s.replace(/\[\[([^|\]]+)\|[a-z]+\]\]/g, '$1');

// The sample dates were written for one fixed day. Shift them by whole weeks (weekdays stay the same) so that the last
// two issues, which have no write-up, are always still ahead.
const firstUpcoming = data.issues.find((x) => !x.ideas);
const weekMs = 7 * 86400e3;
const shiftWeeks = firstUpcoming ? Math.max(0, Math.ceil((Date.now() + 3 * 86400e3 - Date.parse(`${firstUpcoming.start.slice(0, 10)}T00:00:00Z`)) / weekMs)) : 0;
const shiftDate = (day) => new Date(Date.parse(`${day}T00:00:00Z`) + shiftWeeks * weekMs).toISOString().slice(0, 10);

let p = 100;
for (const i of data.issues) {
  const start = mskToUtcIso(shiftDate(i.start.slice(0, 10)), i.start.slice(11, 16));
  const past = Date.parse(start) + 3 * 3600e3 < Date.now();
  const photoIds = [];
  let coverId = null;
  if (past) {
    for (let k = 0; k < Math.min(i.photos || 6, 8); k++) {
      const m = await demoMedia(++p, {
        alt: `Демо-фото ${k + 1}: ${i.title}`,
        credit: 'Демо',
        consent: 'general',
      });
      photoIds.push(m.id);
      if (k === 0) coverId = m.id;
    }
  }
  const terms = Object.values(i.terms || {}).map(([term, def]) => ({ term: typo(term), match: '', def: typo(def) }));
  const row = {
    number: i.n,
    slug: issueSlug(i.n, i.title),
    title_ru: typo(i.title),
    title_en: en.issues[i.n].title,
    start_at: start,
    place_ru: typo(i.place),
    place_en: en.place,
    announce_ru: typo(i.announce),
    announce_en: en.issues[i.n].announce,
    thought_ru: past ? typo(i.thought) : '',
    thought_en: past ? en.issues[i.n].thought : '',
    ideas: past
      ? i.ideas.map((x) => ({
          h: typo(x.h),
          body: x.p.map((t) => typo(stripMarkup(t))).join('\n\n'),
          quote: x.aside ? typo(x.aside.q) : '',
          quote_by: x.aside ? x.aside.by : '',
        }))
      : [],
    terms: past ? terms : [],
    qa: past ? (i.qa || []).map(([q, a]) => ({ q: typo(q), a: typo(a) })) : [],
    video_cut_url: past && i.video ? 'https://vkvideo.ru/video-1_1' : '',
    video_cut_len: past && i.video ? i.video.cut : '',
    video_full_url: past && i.full ? 'https://rutube.ru/video/0123456789abcdef0123456789abcdef/' : '',
    video_full_len: past && i.full ? i.full : '',
    reads: past ? (i.read || []).map((t) => ({ title: typo(t), url: '' })) : [],
    cover_id: coverId,
    listeners: past ? i.listeners || 0 : 0,
    note_author: past ? 'команда Science Lounge' : '',
    checked: past && i.checked,
    reg_enabled: !past,
    reg_url: !past ? 'https://example.org/register' : '',
    tags: i.tags.map(tagWithEn),
    show_rating: past,
    publish_state: 'published',
    is_demo: true,
  };
  const id = saveIssue(row, [lecturerIds[i.lect]], photoIds, null);
  if (past && i.autograph) {
    const sig = await demoMedia(++p, { alt: 'Автограф лектора (демо)' }, { w: 1400, h: 500 });
    db.prepare('UPDATE issues SET autograph_id = ? WHERE id = ?').run(sig.id, id);
  }
  if (past) {
    for (const [rating, good] of [[5, 'Про иглу и ток — очень наглядно.'], [4, 'Хотелось больше про устройство установки.'], [5, 'Лучшее, что было в этом семестре.']]) {
      insertFeedback({ type: 'review', issue_id: id, rating, good, grade: '10', is_demo: true });
    }
  }
}

// Conference
const cover = await demoMedia(900, { alt: 'Демо: зал конференции', consent: 'general', credit: 'Демо' });
const confPhotos = [];
for (let k = 0; k < 4; k++) confPhotos.push((await demoMedia(910 + k, { alt: `Демо-фото конференции ${k + 1}`, consent: 'general', credit: 'Демо' })).id);
const posters = [];
for (let k = 0; k < 3; k++) {
  const m = await demoMedia(930 + k, { alt: `Демо-постер ${k + 1}`, consent: 'general' }, { w: 1200, h: 1600 });
  posters.push({ media_id: m.id, title: `Демо-постер ${k + 1}`, authors: 'Авторы — образец' });
}
saveConference(
  {
    year: 2026,
    title_ru: 'National Letovo Engineers',
    title_en: 'National Letovo Engineers',
    place_ru: 'Школа «Летово»',
    place_en: en.conference.place,
    intro_en: en.conference.intro,
    intro_ru: typo('Трёхдневная конференция. Постерные доклады школьников из шести регионов России, жюри — профессора вузов. Текст образец: замените реальным в админке.'),
    program: [
      { title: 'День 1', date: '', items: [{ time: '10:00', text: 'Открытие (образец)' }, { time: '11:00', text: 'Постерная сессия' }] },
      { title: 'День 2', date: '', items: [{ time: '10:00', text: 'Доклады (образец)' }] },
      { title: 'День 3', date: '', items: [{ time: '12:00', text: 'Награждение (образец)' }] },
    ],
    regions: ['Москва', 'Санкт-Петербург', 'Республика Татарстан', 'Свердловская область', 'Новосибирская область', 'Краснодарский край'].map((name) => ({ name })),
    posters,
    cover_id: cover.id,
    published: true,
    is_demo: true,
  },
  [lecturerIds.belov, lecturerIds.lebedeva],
  confPhotos,
  null,
);

// Team
const founderPhoto = await demoMedia(970, { alt: 'Портрет (демо)', consent: 'general' }, { w: 900, h: 1100 });
saveTeamMember({ kind: 'founder', name_ru: 'Владимир Назаров', name_en: en.team['Владимир Назаров'].name, role_en: en.team['Владимир Назаров'].role, role_ru: 'Сооснователь', photo_id: founderPhoto.id, position: 1, is_demo: true }, null);
saveTeamMember({ kind: 'founder', name_ru: 'Второй сооснователь', name_en: en.team['Второй сооснователь'].name, role_en: en.team['Второй сооснователь'].role, bio_en: en.team['Второй сооснователь'].bio, role_ru: 'Сооснователь', bio_ru: 'Имя, фото и пара строк о себе добавляются в админке.', position: 2, is_demo: true }, null);

console.log('Демо-данные добавлены. Удалить: npm run seed:clear');
