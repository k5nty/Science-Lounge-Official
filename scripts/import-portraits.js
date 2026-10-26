// Sets lecturer portraits from assets/portraits/, matched by the lecturer's Russian name.
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
];

export async function importPortraits(dir = DIR) {
  const db = getDb();
  const find = db.prepare('SELECT id FROM lecturers WHERE name_ru = ?');
  const set = db.prepare('UPDATE lecturers SET portrait_id = ? WHERE id = ?');
  const done = [];
  for (const p of PORTRAITS) {
    const lecturer = find.get(p.name);
    const file = path.join(dir, p.file);
    if (!lecturer || !fs.existsSync(file)) continue;
    const img = await processImage(fs.readFileSync(file));
    const media = insertMedia({ kind: 'image', base: img.base, width: img.width, height: img.height, bytes: img.bytes, widths: img.widths, orig_name: p.file, alt: `Портрет: ${p.name}`, consent: 'general' });
    set.run(media.id, lecturer.id);
    done.push(p.name);
  }
  return done;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  ensureDirs();
  const done = await importPortraits();
  console.log(done.length ? `Портреты обновлены: ${done.join(', ')}.` : 'Ни одного портрета не обновлено: нет лекторов с такими именами.');
}
