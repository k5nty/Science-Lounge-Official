// Visual themes. The markup is shared; a theme can restyle everything with CSS
// and replace whole parts (header, footer, home, schedule, archive, lecturers) with its own templates
// in src/views/themes/<id>/<part>.njk.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export const THEMES = [
  { id: 'journal', name: 'Журнал', en: 'Journal', note: 'Научный журнал по ТЗ: бумага, чернила, синий акцент (в духе Arzamas и Tufte)' },
  { id: 'campus', hidden: true, name: 'Университет', en: 'Campus', note: 'Архив лекций вуза: строгая шапка, превью, колонка ближайших (в духе Gresham College)' },
  { id: 'plain', hidden: true, name: 'Текст', en: 'Plain', note: 'Почти без оформления: текстовые списки и тонкие линии (в духе Long Now)' },
  { id: 'events', name: 'Афиша', en: 'Events', note: 'Афиша событий: карточки с фото и кнопкой записи (в духе Royal Institution)' },
  { id: 'press', hidden: true, name: 'Издание', en: 'Press', note: 'Онлайн-журнал: главный материал, колонки, боковая панель (в духе Quanta Magazine)' },
];

export const THEME_IDS = THEMES.map((t) => t.id);
export const DEFAULT_THEME = 'journal';
export const THEME_COOKIE = 'sl_theme';

export const isTheme = (id) => THEME_IDS.includes(id);

const partCache = new Map();
/** 'themes/<id>/<part>.njk' if the theme ships that part, else ''. */
export function themePart(theme, part) {
  const key = `${theme}/${part}`;
  if (config.isProd && partCache.has(key)) return partCache.get(key);
  const rel = `themes/${theme}/${part}.njk`;
  const found = /^[a-z]+$/.test(theme) && fs.existsSync(path.join(config.viewsDir, rel)) ? rel : '';
  partCache.set(key, found);
  return found;
}

export function themeAsset(theme, kind) {
  const rel = kind === 'css' ? `css/themes/${theme}.css` : `js/themes/${theme}.js`;
  return fs.existsSync(path.join(config.publicDir, rel)) ? rel : '';
}
