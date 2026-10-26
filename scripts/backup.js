import { ensureDirs } from '../src/config.js';
import { runBackup } from '../src/lib/backup.js';

ensureDirs();
const r = await runBackup();
console.log(`Копия: ${r.dir} (файлы: ${r.media})`);
