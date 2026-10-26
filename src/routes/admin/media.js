import express from 'express';
import fsp from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { config } from '../../config.js';
import { processImage, storeFileFromPath, UploadError, MAX_IMAGE_BYTES } from '../../lib/images.js';
import { insertMedia, getMedia, updateMediaMeta, deleteMedia } from '../../models.js';
import { clean } from './helpers.js';

export const mediaRouter = express.Router();

// Uploads go to disk first: a 250 MB video must not sit in memory next to a 40 MB photo being re-encoded.
const TMP = path.join(config.cacheDir, 'tmp');
const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      fsp.mkdir(TMP, { recursive: true }).then(() => cb(null, TMP), cb);
    },
  }),
  limits: { fileSize: 250 * 1024 * 1024, files: 1, fields: 20 },
});

// Purpose decides defaults: photos of people need an explicit consent decision, portraits do not.
const AUTO_CONSENT = new Set(['portrait', 'team', 'autograph', 'poster', 'file']);

export function mediaJson(m) {
  const widths = JSON.parse(m.widths || '[]');
  return {
    id: m.id,
    kind: m.kind,
    base: m.base,
    ext: m.ext,
    width: m.width,
    height: m.height,
    bytes: m.bytes,
    alt: m.alt,
    credit: m.credit,
    caption: m.caption,
    consent: m.consent,
    orig_name: m.orig_name,
    thumb: m.kind === 'image' ? `/media/img/${m.base}/${widths[0]}.webp` : '',
    url: m.kind === 'image' ? `/media/img/${m.base}/${widths[widths.length - 1]}.webp` : `/media/files/${m.base}${m.ext}`,
  };
}

mediaRouter.post('/', (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ ok: false, message: err.code === 'LIMIT_FILE_SIZE' ? 'Файл слишком большой.' : err.message });
    if (!req.file) return res.status(400).json({ ok: false, message: 'Файл не получен.' });
    const tmpPath = req.file.path;
    try {
      const purpose = clean(req.body.purpose, 20) || 'photo';
      const consent = AUTO_CONSENT.has(purpose) ? 'general' : 'pending';
      const orig = clean(req.file.originalname, 200);
      let media;
      if (purpose === 'file' || purpose === 'video') {
        const lower = orig.toLowerCase();
        const kind = lower.endsWith('.pdf') ? 'pdf' : lower.endsWith('.webm') ? 'webm' : lower.endsWith('.mp4') ? 'mp4' : '';
        if (!kind) throw new UploadError('Нужен файл PDF, MP4 или WebM.');
        const stored = await storeFileFromPath(tmpPath, orig, kind);
        media = insertMedia({ kind: stored.kind, base: stored.base, ext: stored.ext, bytes: stored.bytes, orig_name: orig, consent: 'general' });
      } else {
        if (req.file.size > MAX_IMAGE_BYTES) throw new UploadError('Фото больше 40 МБ. Уменьшите его перед загрузкой.');
        const img = await processImage(await fsp.readFile(tmpPath));
        media = insertMedia({
          kind: 'image',
          base: img.base,
          width: img.width,
          height: img.height,
          bytes: img.bytes,
          widths: img.widths,
          orig_name: orig,
          consent,
        });
      }
      return res.json({ ok: true, media: mediaJson(media) });
    } catch (e) {
      if (e instanceof UploadError) return res.status(422).json({ ok: false, message: e.message });
      return next(e);
    } finally {
      fsp.rm(tmpPath, { force: true }).catch(() => {});
    }
  });
});

mediaRouter.post('/:id', (req, res) => {
  const m = getMedia(Number(req.params.id));
  if (!m) return res.status(404).json({ ok: false });
  updateMediaMeta(m.id, {
    alt: req.body.alt,
    credit: req.body.credit,
    caption: req.body.caption,
    consent: req.body.consent,
  });
  return res.json({ ok: true, media: mediaJson(getMedia(m.id)) });
});

mediaRouter.post('/:id/delete', async (req, res) => {
  await deleteMedia(Number(req.params.id));
  res.json({ ok: true });
});
