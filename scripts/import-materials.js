// Loads the material on the lecture topic from materialy-lektsiy/ into the issues, matched by number.
//   materialy-lektsiy/NN-*.md     -> material_ru of issue № NN
//   materialy-lektsiy/en/NN-*.md  -> material_en of issue № NN
// Safe to run again: it overwrites both fields with what is in the files now.
// Usage: npm run content:materials [-- <folder>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureDirs } from '../src/config.js';
import { getDb } from '../src/db.js';
import { materialBody } from '../src/lib/material.js';

const DEFAULT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'materialy-lektsiy');

function readByNumber(dir) {
  if (!fs.existsSync(dir)) return new Map();
  const map = new Map();
  for (const name of fs.readdirSync(dir).sort()) {
    const m = /^(\d+)-.*\.md$/.exec(name);
    if (m) map.set(Number(m[1]), materialBody(fs.readFileSync(path.join(dir, name), 'utf8')));
  }
  return map;
}

export function importMaterials(dir = DEFAULT_DIR) {
  const db = getDb();
  const ru = readByNumber(dir);
  const en = readByNumber(path.join(dir, 'en'));
  const update = db.prepare('UPDATE issues SET material_ru = @ru, material_en = @en WHERE number = @number');
  const loaded = [];
  db.transaction(() => {
    for (const number of new Set([...ru.keys(), ...en.keys()])) {
      const info = update.run({ number, ru: ru.get(number) || '', en: en.get(number) || '' });
      if (info.changes) loaded.push(number);
    }
  })();
  return loaded.sort((a, b) => a - b);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  ensureDirs();
  const loaded = importMaterials(process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_DIR);
  console.log(loaded.length ? `Материалы загружены в выпуски: ${loaded.map((n) => `№ ${n}`).join(', ')}.` : 'Ни одного материала не загружено: нет файлов или выпусков с такими номерами.');
}
