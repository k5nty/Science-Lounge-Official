// Open Graph cover generated per issue: number, title, lecturer, photo.
// satori (layout -> SVG) + resvg (SVG -> PNG). No system fonts needed.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { config } from '../config.js';

const FONT_DIR = path.join(config.root, 'assets', 'og-fonts');
let fonts;

function loadFonts() {
  if (fonts) return fonts;
  const f = (file, name, weight, style = 'normal') => ({ name, data: fs.readFileSync(path.join(FONT_DIR, file)), weight, style });
  fonts = [
    f('literata-cyrillic-600-normal.woff', 'Literata', 600),
    f('literata-latin-600-normal.woff', 'LiterataLatin', 600),
    f('golos-text-cyrillic-500-normal.woff', 'Golos', 500),
    f('golos-text-latin-500-normal.woff', 'GolosLatin', 500),
    f('golos-text-cyrillic-400-normal.woff', 'Golos', 400),
    f('golos-text-latin-400-normal.woff', 'GolosLatin', 400),
    f('jetbrains-mono-cyrillic-700-normal.woff', 'Mono', 700),
    f('jetbrains-mono-latin-700-normal.woff', 'MonoLatin', 700),
    f('jetbrains-mono-cyrillic-500-normal.woff', 'Mono', 500),
    f('jetbrains-mono-latin-500-normal.woff', 'MonoLatin', 500),
  ];
  return fonts;
}

const C = { paper: '#F6F7F5', paper2: '#ECEEEA', ink: '#16181B', muted: '#5F646C', accent: '#2B33C9' };

const h = (type, style, children) => ({ type, props: { style: { display: 'flex', ...style }, children } });
const text = (value, style) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children: String(value) } });

async function photoDataUri(base, width, height) {
  if (!base) return null;
  const dir = path.join(config.uploadsDir, 'img', base);
  let file;
  try {
    const names = (await fsp.readdir(dir)).filter((n) => n.endsWith('.webp')).sort((a, b) => parseInt(a) - parseInt(b));
    file = names.find((n) => parseInt(n) >= 960) || names[names.length - 1];
  } catch {
    return null;
  }
  if (!file) return null;
  const buf = await sharp(path.join(dir, file)).resize(width, height, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

/**
 * @param {{number?:number, title:string, lecturer?:string, dateLine?:string, kicker?:string, photoBase?:string, brand?:string}} d
 */
export async function renderOg(d) {
  const key = crypto.createHash('sha1').update(JSON.stringify(d)).digest('hex').slice(0, 12);
  const cacheFile = path.join(config.cacheDir, 'og', `${key}.png`);
  try {
    return await fsp.readFile(cacheFile);
  } catch {
    /* not cached */
  }

  const W = 1200;
  const H = 630;
  const photoW = 430;
  const photo = await photoDataUri(d.photoBase, photoW, H);
  const title = d.title.length > 110 ? `${d.title.slice(0, 107)}…` : d.title;
  const titleSize = title.length > 70 ? 42 : title.length > 40 ? 50 : 58;

  const left = h(
    'div',
    { flexDirection: 'column', justifyContent: 'space-between', width: photo ? W - photoW : W, height: H, padding: '52px 60px' },
    [
      h('div', { flexDirection: 'column' }, [
        text(d.brand || 'SCIENCE LOUNGE', { fontFamily: 'Mono, MonoLatin', fontWeight: 500, fontSize: 24, letterSpacing: 5, color: C.muted }),
        d.number != null
          ? text(`№ ${String(d.number).padStart(2, '0')}`, { fontFamily: 'Mono, MonoLatin', fontWeight: 700, fontSize: 176, lineHeight: 1, letterSpacing: -8, color: C.accent, marginTop: 6 })
          : null,
      ].filter(Boolean)),
      h('div', { flexDirection: 'column' }, [
        text(title, { fontFamily: 'Literata, LiterataLatin', fontWeight: 600, fontSize: titleSize, lineHeight: 1.12, color: C.ink, letterSpacing: -1 }),
        d.lecturer ? text(d.lecturer, { fontFamily: 'Golos, GolosLatin', fontWeight: 500, fontSize: 30, color: C.ink, marginTop: 26 }) : null,
        d.dateLine ? text(d.dateLine, { fontFamily: 'Mono, MonoLatin', fontWeight: 500, fontSize: 24, color: C.muted, marginTop: 10 }) : null,
      ].filter(Boolean)),
    ],
  );

  const right = photo
    ? { type: 'img', props: { src: photo, width: photoW, height: H, style: { width: photoW, height: H, objectFit: 'cover' } } }
    : null;

  const tree = h('div', { width: W, height: H, background: C.paper, borderTop: `10px solid ${C.ink}` }, [left, right].filter(Boolean));

  const svg = await satori(tree, { width: W, height: H, fonts: loadFonts() });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
  await fsp.writeFile(cacheFile, png).catch(() => {});
  return png;
}
