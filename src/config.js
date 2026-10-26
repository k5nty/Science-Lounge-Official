import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// .env is optional: in Docker the variables come from the environment.
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  /* no .env file */
}

const env = process.env;
const bool = (v, d = false) => (v == null || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));
const num = (v, d) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

const port = num(env.PORT, 3000);
const siteUrl = (env.SITE_URL || `http://localhost:${port}`).replace(/\/+$/, '');
const dataDir = path.resolve(root, env.DATA_DIR || 'data');

export const config = {
  root,
  port,
  host: env.HOST || '127.0.0.1',
  siteUrl,
  isHttps: siteUrl.startsWith('https://'),
  // 'true' = one reverse proxy in front (Caddy/nginx); a number = that many hops; unset = none.
  trustProxy: /^\d+$/.test(env.TRUST_PROXY || '') ? Number(env.TRUST_PROXY) : bool(env.TRUST_PROXY, false) ? 1 : false,
  isProd: env.NODE_ENV === 'production',

  dataDir,
  dbPath: path.join(dataDir, 'science-lounge.db'),
  uploadsDir: path.join(dataDir, 'uploads'),
  cacheDir: path.join(dataDir, 'cache'),
  backupsDir: path.resolve(root, env.BACKUP_DIR || path.join(dataDir, 'backups')),
  backupKeepDays: num(env.BACKUP_KEEP_DAYS, 30),
  backupEnabled: bool(env.BACKUP_ENABLED, true),
  newsAuto: bool(env.NEWS_AUTO, true),

  publicDir: path.join(root, 'public'),
  viewsDir: path.join(root, 'src', 'views'),

  // Telegram bot: new feedback is pushed to organizers.
  tgToken: env.TG_BOT_TOKEN || '',
  tgChatId: env.TG_CHAT_ID || '',

  // Analytics (both optional). Yandex Metrika loads only after cookie consent.
  metrikaId: env.METRIKA_ID || '',
  umamiSrc: env.UMAMI_SRC || '',
  umamiId: env.UMAMI_ID || '',

  sessionDays: num(env.SESSION_DAYS, 14),
  lectureMinutes: num(env.LECTURE_MINUTES, 90),
  pastAfterHours: 3,

  seedAdmin: {
    email: env.ADMIN_EMAIL || '',
    password: env.ADMIN_PASSWORD || '',
    name: env.ADMIN_NAME || 'Администратор',
  },
};

export function ensureDirs() {
  for (const dir of [
    config.dataDir,
    config.uploadsDir,
    path.join(config.uploadsDir, 'img'),
    path.join(config.uploadsDir, 'files'),
    config.cacheDir,
    path.join(config.cacheDir, 'og'),
    config.backupsDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
