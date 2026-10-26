import { config, ensureDirs } from './config.js';
import { getDb } from './db.js';
import { createApp } from './app.js';
import { purgeSessions } from './auth.js';
import { runBackup, scheduleBackups } from './lib/backup.js';
import { scheduleNewsRefresh } from './lib/news-feed.js';
import { pruneOrphanMedia } from './models.js';
import { hashPassword } from './lib/security.js';

ensureDirs();
const db = getDb();

// First start: create the administrator from ADMIN_EMAIL / ADMIN_PASSWORD if there are no users yet.
async function bootstrapAdmin() {
  const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (count > 0) return;
  const { email, password, name } = config.seedAdmin;
  if (!email || !password) {
    console.warn('[setup] Нет пользователей. Создайте администратора: npm run admin:create -- почта "Имя" пароль');
    return;
  }
  db.prepare('INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,?)').run(email.toLowerCase(), name, await hashPassword(password), 'admin');
  console.log(`[setup] Создан администратор ${email}`);
}

await bootstrapAdmin();

const app = createApp();
const server = app.listen(config.port, config.host, () => {
  console.log(`Science Lounge: ${config.siteUrl} (слушаю ${config.host}:${config.port})`);
});

purgeSessions();
setInterval(purgeSessions, 6 * 3600e3).unref();
if (config.backupEnabled) scheduleBackups();
scheduleNewsRefresh();
// Uploads that were never attached to anything are removed after a few hours.
setTimeout(() => pruneOrphanMedia(180).catch(() => {}), 60e3).unref();
setInterval(() => pruneOrphanMedia(180).catch(() => {}), 24 * 3600e3).unref();

function shutdown(signal) {
  console.log(`[${signal}] остановка…`);
  server.close(() => {
    try {
      db.close();
    } catch {
      /* already closed */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { runBackup };
