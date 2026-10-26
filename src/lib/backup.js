// Daily backup: consistent SQLite snapshot + uploads archive. Keeps N days (default 30).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { getDb } from '../db.js';

const run = promisify(execFile);

const stampOf = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');

export async function runBackup() {
  const dir = path.join(config.backupsDir, stampOf());
  await fsp.mkdir(dir, { recursive: true });
  // better-sqlite3 online backup: safe while the site is running.
  await getDb().backup(path.join(dir, 'science-lounge.db'));
  let media = 'skipped';
  if (fs.existsSync(config.uploadsDir)) {
    try {
      await run('tar', ['-czf', path.join(dir, 'uploads.tar.gz'), '-C', path.dirname(config.uploadsDir), path.basename(config.uploadsDir)]);
      media = 'ok';
    } catch (err) {
      media = `failed: ${err.message}`;
    }
  }
  await prune();
  return { dir, media };
}

export async function prune(now = Date.now()) {
  let entries = [];
  try {
    entries = await fsp.readdir(config.backupsDir, { withFileTypes: true });
  } catch {
    return;
  }
  const limit = config.backupKeepDays * 86400e3;
  for (const e of entries) {
    if (!e.isDirectory() || !/^\d{8}-\d{6}Z$/.test(e.name)) continue;
    const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})Z$/.exec(e.name);
    const ts = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    if (now - ts > limit) await fsp.rm(path.join(config.backupsDir, e.name), { recursive: true, force: true });
  }
}

/** Once a day at 03:30 server time, plus a catch-up shortly after start when there is no recent backup. */
export function scheduleBackups() {
  const safe = () =>
    runBackup()
      .then((r) => console.log(`[backup] ${r.dir} (media: ${r.media})`))
      .catch((err) => console.error('[backup] failed:', err.message));

  const lastBackupAge = () => {
    try {
      const names = fs.readdirSync(config.backupsDir).filter((n) => /^\d{8}-\d{6}Z$/.test(n)).sort();
      if (!names.length) return Infinity;
      const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})Z$/.exec(names[names.length - 1]);
      return Date.now() - Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    } catch {
      return Infinity;
    }
  };
  if (lastBackupAge() > 24 * 3600e3) setTimeout(safe, 30e3).unref();

  const scheduleNext = () => {
    const next = new Date();
    next.setHours(3, 30, 0, 0);
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
    setTimeout(async () => {
      await safe();
      scheduleNext();
    }, next.getTime() - Date.now()).unref();
  };
  scheduleNext();
}
