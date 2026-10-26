import express from 'express';
import { listTeam, getTeamMember, saveTeamMember, deleteTeamMember, mediaByIds, deleteIfOrphan } from '../../models.js';
import { clean, ru, parseLinks, intOr, checked, flash } from './helpers.js';
import { mediaJson } from './media.js';

export const teamRouter = express.Router();

function parse(b) {
  return {
    kind: b.kind === 'helper' ? 'helper' : 'founder',
    name_ru: ru(b.name_ru, 150),
    name_en: clean(b.name_en, 150),
    role_ru: ru(b.role_ru, 150),
    role_en: clean(b.role_en, 150),
    bio_ru: ru(b.bio_ru, 800),
    bio_en: clean(b.bio_en, 800),
    links: parseLinks(b.links),
    photo_id: intOr(b.photo_id) || null,
    position: intOr(b.position),
    alumni: checked(b.alumni),
    active: checked(b.active),
  };
}

const view = (member, isNew, errors = []) => ({
  member,
  isNew,
  errors,
  photo: member.photo_id && mediaByIds([member.photo_id]).get(member.photo_id) ? mediaJson(mediaByIds([member.photo_id]).get(member.photo_id)) : null,
});

teamRouter.get('/', (req, res) => res.render('admin/team-list', { members: listTeam({ activeOnly: false }) }));

teamRouter.get('/new', (req, res) =>
  res.render('admin/team-form', view({ id: null, kind: 'founder', name_ru: '', name_en: '', role_ru: '', role_en: '', bio_ru: '', bio_en: '', links: [], photo_id: null, position: 0, alumni: 0, active: 1 }, true)),
);

teamRouter.post('/', (req, res) => {
  const d = parse(req.body);
  if (!d.name_ru) return res.status(422).render('admin/team-form', view({ ...d, id: null }, true, ['Укажите имя.']));
  const id = saveTeamMember(d, null);
  flash(res, 'ok', 'Добавлено.');
  res.redirect(303, `/admin/team/${id}`);
});

teamRouter.get('/:id', (req, res, next) => {
  const m = getTeamMember(req.params.id);
  if (!m) return next();
  res.render('admin/team-form', view(m, false));
});

teamRouter.post('/:id', (req, res, next) => {
  const m = getTeamMember(req.params.id);
  if (!m) return next();
  const d = parse(req.body);
  if (!d.name_ru) return res.status(422).render('admin/team-form', view({ ...m, ...d }, false, ['Укажите имя.']));
  saveTeamMember(d, m.id);
  if (m.photo_id && m.photo_id !== d.photo_id) deleteIfOrphan([m.photo_id]).catch(() => {});
  flash(res, 'ok', 'Сохранено.');
  res.redirect(303, `/admin/team/${m.id}`);
});

teamRouter.post('/:id/delete', (req, res) => {
  const gone = getTeamMember(req.params.id);
  deleteTeamMember(Number(req.params.id));
  if (gone?.photo_id) deleteIfOrphan([gone.photo_id]).catch(() => {});
  flash(res, 'ok', 'Удалено.');
  res.redirect(303, '/admin/team');
});
