// Map of Russia with a dot for every participating region (matched by name).
import fs from 'node:fs';
import { esc } from './markup.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/russia-map.json', import.meta.url), 'utf8'));

const STOP = new Set(['республика', 'область', 'край', 'автономный', 'автономная', 'округ', 'г', 'город', 'федерации', 'рф', 'обл', 'респ']);
const ALIAS = { хмао: 'ханты мансийский югра', янао: 'ямало ненецкий', нао: 'ненецкий', чао: 'чукотский', еао: 'еврейская', спб: 'санкт петербург', питер: 'санкт петербург', мо: 'московская', ло: 'ленинградская' };

export function norm(name) {
  const tokens = String(name)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[()—–\-.,]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
  return tokens.join(' ');
}

const index = data.regions.map((r) => ({ ...r, key: norm(r.name) }));

export function findRegion(name) {
  let q = norm(name);
  if (!q) return null;
  if (ALIAS[q]) q = ALIAS[q];
  return index.find((r) => r.key === q) || (q.length >= 4 ? index.find((r) => r.key.startsWith(q)) : null) || null;
}

export function renderRussiaMap(regions, { label = 'Регионы-участники на карте России' } = {}) {
  const hits = new Map();
  for (const r of regions || []) {
    const hit = findRegion(r.name || r);
    if (hit) hits.set(hit.name, hit);
  }
  if (!hits.size) return '';
  const dots = [...hits.values()]
    .map((h) => `<circle class="dot" cx="${h.x}" cy="${h.y}" r="7"><title>${esc(h.name)}</title></circle>`)
    .join('');
  return `<svg class="russia-map" viewBox="0 0 ${data.w} ${data.h}" role="img" aria-label="${esc(label)}"><path class="land" d="${data.path}"/>${dots}</svg>`;
}
