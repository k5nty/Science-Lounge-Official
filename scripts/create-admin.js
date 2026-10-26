// Usage: npm run admin:create -- <email> "<Name>" <password> [editor|admin]
import { ensureDirs } from '../src/config.js';
import { getDb } from '../src/db.js';
import { hashPassword } from '../src/lib/security.js';

const [email, name, password, role = 'admin'] = process.argv.slice(2);
if (!email || !password || password.length < 10) {
  console.error('Использование: npm run admin:create -- почта "Имя" пароль [editor|admin]\nПароль не короче 10 знаков.');
  process.exit(1);
}
ensureDirs();
const db = getDb();
const hash = await hashPassword(password);
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
if (existing) {
  db.prepare('UPDATE users SET password_hash = ?, name = ?, role = ?, active = 1 WHERE id = ?').run(hash, name || '', role === 'editor' ? 'editor' : 'admin', existing.id);
  console.log(`Обновлён пользователь ${email}`);
} else {
  db.prepare('INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,?)').run(email.toLowerCase(), name || '', hash, role === 'editor' ? 'editor' : 'admin');
  console.log(`Создан пользователь ${email} (${role === 'editor' ? 'редактор' : 'администратор'})`);
}
