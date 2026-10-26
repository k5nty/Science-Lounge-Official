import express from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';
import { runBackup } from '../../lib/backup.js';
import { flash } from './helpers.js';

export const backupsRouter = express.Router();

async function listBackups() {
  let names = [];
  try {
    names = (await fsp.readdir(config.backupsDir)).filter((n) => /^\d{8}-\d{6}Z$/.test(n)).sort().reverse();
  } catch {
    /* empty */
  }
  const out = [];
  for (const n of names) {
    const dir = path.join(config.backupsDir, n);
    const size = async (f) => {
      try {
        return (await fsp.stat(path.join(dir, f))).size;
      } catch {
        return 0;
      }
    };
    out.push({ name: n, db: await size('science-lounge.db'), media: await size('uploads.tar.gz') });
  }
  return out;
}

backupsRouter.get('/', async (req, res) => {
  res.render('admin/backups', { backups: await listBackups(), keepDays: config.backupKeepDays });
});

backupsRouter.post('/', async (req, res) => {
  try {
    await runBackup();
    flash(res, 'ok', 'Копия создана.');
  } catch (e) {
    flash(res, 'err', `Не удалось создать копию: ${e.message}`);
  }
  res.redirect(303, '/admin/backups');
});

backupsRouter.get('/:name/:file', (req, res, next) => {
  const { name, file } = req.params;
  if (!/^\d{8}-\d{6}Z$/.test(name) || !['science-lounge.db', 'uploads.tar.gz'].includes(file)) return next();
  const p = path.join(config.backupsDir, name, file);
  if (!fs.existsSync(p)) return next();
  return res.download(p, `${name}-${file}`);
});
