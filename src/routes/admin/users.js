import express from 'express';
import { getDb } from '../../db.js';
import { hashPassword } from '../../lib/security.js';
import { listUsers } from '../../models.js';
import { clean, intOr, flash } from './helpers.js';

export const usersRouter = express.Router();

const validPassword = (p) => typeof p === 'string' && p.length >= 10;

usersRouter.get('/', (req, res) => res.render('admin/users', { users: listUsers(), errors: [] }));

usersRouter.post('/', async (req, res) => {
  const email = clean(req.body.email, 200).toLowerCase();
  const name = clean(req.body.name, 120);
  const role = req.body.role === 'admin' ? 'admin' : 'editor';
  const password = String(req.body.password || '');
  const errors = [];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('Некорректная почта.');
  if (!validPassword(password)) errors.push('Пароль: не короче 10 знаков.');
  if (getDb().prepare('SELECT 1 FROM users WHERE email = ?').get(email)) errors.push('Пользователь с такой почтой уже есть.');
  if (errors.length) return res.status(422).render('admin/users', { users: listUsers(), errors });
  getDb().prepare('INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,?)').run(email, name, await hashPassword(password), role);
  flash(res, 'ok', `Пользователь ${email} добавлен.`);
  return res.redirect(303, '/admin/users');
});

usersRouter.post('/:id', async (req, res) => {
  const id = intOr(req.params.id);
  const db = getDb();
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) return res.redirect(303, '/admin/users');
  const admins = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin' AND active = 1").get().c;
  const lastAdmin = u.role === 'admin' && u.active && admins <= 1;

  if (req.body.action === 'password') {
    if (!validPassword(String(req.body.password || ''))) {
      flash(res, 'err', 'Пароль: не короче 10 знаков.');
    } else {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(String(req.body.password)), id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      flash(res, 'ok', 'Пароль изменён, все сессии пользователя завершены.');
    }
  } else if (req.body.action === 'role') {
    const role = req.body.role === 'admin' ? 'admin' : 'editor';
    if (lastAdmin && role !== 'admin') flash(res, 'err', 'Нельзя снять права у последнего администратора.');
    else {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
      flash(res, 'ok', 'Роль изменена.');
    }
  } else if (req.body.action === 'toggle') {
    if (lastAdmin || u.id === req.user.id) flash(res, 'err', 'Нельзя отключить себя или последнего администратора.');
    else {
      db.prepare('UPDATE users SET active = ? WHERE id = ?').run(u.active ? 0 : 1, id);
      if (u.active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      flash(res, 'ok', u.active ? 'Пользователь отключён.' : 'Пользователь включён.');
    }
  }
  return res.redirect(303, '/admin/users');
});
