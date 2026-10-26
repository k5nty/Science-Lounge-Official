// Removes everything created by seed-demo.js (rows flagged is_demo and their files).
import { ensureDirs } from '../src/config.js';
import { getDb } from '../src/db.js';
import { removeMediaFiles } from '../src/lib/images.js';

ensureDirs();
const db = getDb();
const media = db.prepare('SELECT * FROM media WHERE is_demo = 1').all();
db.transaction(() => {
  for (const t of ['feedback', 'issues', 'conferences', 'team', 'lecturers', 'news']) db.prepare(`DELETE FROM ${t} WHERE is_demo = 1`).run();
  db.prepare('DELETE FROM media WHERE is_demo = 1').run();
})();
for (const m of media) await removeMediaFiles(m);
console.log(`Демо-данные удалены (медиафайлов: ${media.length}).`);
