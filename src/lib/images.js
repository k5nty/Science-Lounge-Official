// Upload processing: auto-rotate, strip EXIF (incl. GPS), resize, WebP + AVIF variants.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { config } from '../config.js';

sharp.cache(false);

export const IMAGE_WIDTHS = [480, 960, 1600, 2400];
const MAX_PIXELS = 100e6;

export const newBase = () => crypto.randomBytes(9).toString('base64url');

export class UploadError extends Error {}

export async function processImage(buffer) {
  let meta;
  try {
    meta = await sharp(buffer, { failOn: 'none', limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new UploadError('Файл не похож на изображение (нужны JPG, PNG, WebP, HEIC или AVIF).');
  }
  if (!meta.width || !meta.height) throw new UploadError('Не удалось прочитать размеры изображения.');

  // orientation 5-8 means width/height are swapped after auto-rotate
  const swapped = meta.orientation && meta.orientation >= 5;
  const srcW = swapped ? meta.height : meta.width;
  const srcH = swapped ? meta.width : meta.height;
  if (srcW < 200 || srcH < 120) throw new UploadError('Изображение слишком маленькое (меньше 200×120).');

  const widths = IMAGE_WIDTHS.filter((w) => w < srcW);
  const top = Math.min(srcW, IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]);
  if (!widths.includes(top)) widths.push(top);
  widths.sort((a, b) => a - b);

  const base = newBase();
  const dir = path.join(config.uploadsDir, 'img', base);
  await fsp.mkdir(dir, { recursive: true });

  try {
    for (const w of widths) {
      const pipe = () =>
        sharp(buffer, { failOn: 'none', limitInputPixels: MAX_PIXELS }).rotate().resize({ width: w, withoutEnlargement: true });
      await pipe()
        .webp({ quality: 78, effort: 4 })
        .toFile(path.join(dir, `${w}.webp`));
      await pipe()
        .avif({ quality: 52, effort: 2 })
        .toFile(path.join(dir, `${w}.avif`));
    }
  } catch (err) {
    await fsp.rm(dir, { recursive: true, force: true });
    throw new UploadError(`Не удалось обработать изображение: ${err.message}`);
  }

  return {
    base,
    width: top,
    height: Math.round((srcH / srcW) * top),
    widths,
    bytes: buffer.length,
  };
}

export function imageDir(base) {
  return path.join(config.uploadsDir, 'img', base);
}

export async function removeMediaFiles(media) {
  if (media.kind === 'image') {
    await fsp.rm(imageDir(media.base), { recursive: true, force: true });
  } else {
    await fsp.rm(path.join(config.uploadsDir, 'files', `${media.base}${media.ext}`), { force: true });
  }
}

const FILE_RULES = {
  pdf: { ext: '.pdf', max: 40 * 1024 * 1024, magic: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  mp4: { ext: '.mp4', max: 250 * 1024 * 1024, magic: (b) => b.subarray(4, 8).toString('latin1') === 'ftyp' },
  webm: { ext: '.webm', max: 250 * 1024 * 1024, magic: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
};

export const MAX_IMAGE_BYTES = 40 * 1024 * 1024;

/** Moves an already-uploaded temp file into the public files folder after checking type and size. */
export async function storeFileFromPath(tmpPath, originalName, kind) {
  const rule = FILE_RULES[kind];
  if (!rule) throw new UploadError('Неподдерживаемый тип файла.');
  const { size } = await fsp.stat(tmpPath);
  if (size > rule.max) throw new UploadError(`Файл больше ${Math.round(rule.max / 1048576)} МБ.`);
  const fh = await fsp.open(tmpPath, 'r');
  const head = Buffer.alloc(16);
  try {
    await fh.read(head, 0, 16, 0);
  } finally {
    await fh.close();
  }
  if (!rule.magic(head)) throw new UploadError(`Файл не похож на ${rule.ext.slice(1).toUpperCase()}.`);
  const base = newBase();
  const dest = path.join(config.uploadsDir, 'files', `${base}${rule.ext}`);
  try {
    await fsp.rename(tmpPath, dest);
  } catch {
    await fsp.copyFile(tmpPath, dest);
    await fsp.rm(tmpPath, { force: true });
  }
  return { base, ext: rule.ext, bytes: size, kind: kind === 'pdf' ? 'pdf' : 'video', orig: originalName };
}

export function fileUrl(media) {
  return `/media/files/${media.base}${media.ext}`;
}

export function hasFile(p) {
  return fs.existsSync(p);
}
