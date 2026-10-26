// Removes ALL content (issues, lecturers, conferences, team, feedback, media). Users and settings stay.
import { ensureDirs } from '../src/config.js';
import { getDb } from '../src/db.js';
import { removeMediaFiles } from '../src/lib/images.js';

ensureDirs();
const db = getDb();
const media = db.prepare('SELECT * FROM media').all();
db.transaction(() => {
  for (const t of ['feedback', 'issues', 'conferences', 'team', 'lecturers', 'news', 'media']) db.prepare(`DELETE FROM ${t}`).run();
})();
for (const m of media) await removeMediaFiles(m);
console.log(`Контент удалён (медиафайлов: ${media.length}).`);
