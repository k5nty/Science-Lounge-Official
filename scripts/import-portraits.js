// Sets lecturer portraits and founder photos from assets/portraits/, matched by the Russian name.
// Each run adds the photos as new media and points the lecturer at them; the old portrait stays in the media library.
// Usage: npm run content:portraits
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureDirs } from '../src/config.js';
import { getDb } from '../src/db.js';
import { processImage } from '../src/lib/images.js';
import { insertMedia } from '../src/models.js';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'portraits');

export const PORTRAITS = [
  { file: 'ratushny.jpg', name: 'Андрей Ратушный' },
  { file: 'surdin.webp', name: 'Владимир Сурдин' },
  { file: 'zubov.jpg', name: 'Андрей Зубов' },
  { file: 'volodyaev.jpg', name: 'Илья Володяев' },
  { file: 'gorshunov.webp', name: 'Игорь Горшунов' },
  { file: 'namsaraev.jpg', name: 'Зоригто Намсараев' },
];

export const TEAM_PHOTOS = [
  { file: 'kachay.jpg', name: 'Михаил Качай' },
  { file: 'nazarov.png', name: 'Владимир Назаров' },
];

async function attach(dir, list, table, column) {
  const db = getDb();
  const find = db.prepare(`SELECT id FROM ${table} WHERE name_ru = ?`);
  const set = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`);
  const done = [];
  for (const p of list) {
    const row = find.get(p.name);
    const file = path.join(dir, p.file);
    if (!row || !fs.existsSync(file)) continue;
    const img = await processImage(fs.readFileSync(file));
    const media = insertMedia({ kind: 'image', base: img.base, width: img.width, height: img.height, bytes: img.bytes, widths: img.widths, orig_name: p.file, alt: `Портрет: ${p.name}`, consent: 'general' });
    set.run(media.id, row.id);
    done.push(p.name);
  }
  return done;
}

export async function importPortraits(dir = DIR) {
  return [...(await attach(dir, PORTRAITS, 'lecturers', 'portrait_id')), ...(await attach(dir, TEAM_PHOTOS, 'team', 'photo_id'))];
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  ensureDirs();
  const done = await importPortraits();
  console.log(done.length ? `Портреты обновлены: ${done.join(', ')}.` : 'Ни одного портрета не обновлено: нет лекторов с такими именами.');
}
