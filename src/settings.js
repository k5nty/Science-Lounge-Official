// Site settings: definition list drives both defaults and the admin form.
import { getDb, j } from './db.js';

export const DEFAULT_NEWS_SOURCES = [
  'ru|Элементы|https://elementy.ru/rss/news',
  'ru|N+1|https://nplus1.ru/rss',
  'ru|Naked Science|https://naked-science.ru/feed',
  'ru|Научная Россия|https://scientificrussia.ru/rss',
  'en|ScienceDaily|https://www.sciencedaily.com/rss/top/science.xml',
  'en|Phys.org|https://phys.org/rss-feed/',
  'en|NASA|https://www.nasa.gov/feed/',
  'en|Nobel Prize|https://www.nobelprize.org/feed/',
].join('\n');

export const SETTINGS_SCHEMA = [
  {
    group: 'Основное',
    items: [
      { key: 'site_title', label: 'Название сайта', type: 'text', default: 'Science Lounge' },
      { key: 'site_tagline', label: 'Подпись под названием', type: 'text', default: 'Лекторий школы «Летово»', hint: 'Видна в шапке сайта.' },
      { key: 'seo_description', label: 'Описание для поисковиков и Telegram', type: 'textarea', rows: 3, default: 'Лекторий школы «Летово»: анонсы лекций учёных, конспекты, фото и записи.', hint: 'До 160 знаков.' },
      { key: 'seo_description_en', label: 'То же по-английски', type: 'textarea', rows: 2, default: 'Lecture series at Letovo School: announcements of talks by researchers, write-ups, photos and recordings.' },
      { key: 'site_tagline_en', label: 'Подпись под названием по-английски', type: 'text', default: 'Lecture series at Letovo School' },
      { key: 'channel_url', label: 'Telegram-канал (ссылка)', type: 'url', default: '', hint: 'Например https://t.me/название_канала. Пока пусто, ссылка на канал на сайте не показывается.' },
      { key: 'tg_post', label: 'Последний пост для виджета (необязательно)', type: 'text', default: '', hint: 'Вид «канал/123». Если пусто, сайт сам берёт последний пост из публичной ленты канала.' },
      { key: 'contact_email', label: 'Почта проекта', type: 'email', default: '' },
    ],
  },
  {
    group: 'Дизайн сайта',
    hint: 'Два оформления на выбор: «Журнал» (по ТЗ) и «Афиша». Посетители видят выбранное здесь. Переключатель внизу слева нужен для показа вариантов; перед запуском выключите его.',
    items: [
      { key: 'site_theme', label: 'Оформление по умолчанию', type: 'select', default: 'journal', options: [['journal', 'Журнал (по ТЗ)'], ['events', 'Афиша']] },
      { key: 'theme_switcher', label: 'Показывать переключатель оформлений', type: 'select', default: '1', options: [['1', 'да'], ['0', 'нет']] },
    ],
  },
  {
    group: 'Цифры на главной',
    hint: 'Оставьте пустым, чтобы цифра считалась из базы. Впишите значение (например «300+»), чтобы показать его вместо расчёта.',
    items: [
      { key: 'stat_lectures', label: 'Лекций', type: 'text', default: '' },
      { key: 'stat_listeners', label: 'Слушателей', type: 'text', default: '', hint: 'Пока в выпусках не внесено число слушателей, впишите общее число здесь.' },
      { key: 'stat_regions', label: 'Регионов на конференции', type: 'text', default: '' },
    ],
  },
  {
    group: 'О нас',
    items: [
      { key: 'about_story_ru', label: 'История проекта (RU)', type: 'textarea', rows: 8, default: '', hint: '3–4 абзаца, абзацы разделяйте пустой строкой. Пока пусто, показывается короткий текст из ТЗ.' },
      { key: 'about_story_en', label: 'История проекта (EN)', type: 'textarea', rows: 6, default: '' },
      { key: 'about_thanks_ru', label: 'Благодарности (RU)', type: 'textarea', rows: 3, default: '', hint: 'Школе, лекторам, помощникам.' },
      { key: 'about_thanks_en', label: 'Благодарности (EN)', type: 'textarea', rows: 3, default: '' },
      { key: 'speak_text_ru', label: 'Блок «Хотите выступить?» (RU)', type: 'textarea', rows: 4, default: 'Наши слушатели — школьники 14–18 лет. Формат лекции: 45–60 минут и вопросы из зала.', hint: 'Что за аудитория, формат, что вы берёте на себя.' },
      { key: 'speak_text_en', label: 'Блок «Хотите выступить?» (EN)', type: 'textarea', rows: 4, default: 'Our audience is school students aged 14–18. A talk runs 45–60 minutes plus questions from the audience.' },
    ],
  },
  {
    group: 'Новости науки',
    hint: 'Раз в три часа сайт сам читает открытые ленты (RSS) и добавляет заголовок, одно-два предложения и ссылку на источник. Картинки и полные тексты не копируются. Лишнюю новость скройте или удалите в разделе «Новости».',
    items: [
      { key: 'news_auto', label: 'Подбирать новости автоматически', type: 'select', default: '1', options: [['1', 'да'], ['0', 'нет']] },
      { key: 'news_sources', label: 'Источники', type: 'textarea', rows: 7, default: DEFAULT_NEWS_SOURCES, hint: 'По одному на строке: язык|название|адрес ленты (только https). Язык ru или en: русские новости видны на русском сайте, английские на английском. Строка с # в начале отключает источник.' },
    ],
  },
  {
    group: 'Персональные данные (152-ФЗ)',
    hint: 'Эти данные подставляются в политику обработки персональных данных. Кто оператор — школа или организаторы — решите вместе со школой до запуска.',
    items: [
      { key: 'operator_name', label: 'Оператор персональных данных', type: 'text', default: '', hint: 'Полное наименование.' },
      { key: 'operator_email', label: 'Почта по вопросам персональных данных', type: 'email', default: '' },
      { key: 'photo_removal_days', label: 'Срок удаления фото по запросу, дней', type: 'text', default: '10' },
    ],
  },
];

const DEFAULTS = Object.fromEntries(SETTINGS_SCHEMA.flatMap((g) => g.items.map((i) => [i.key, i.default])));

export function getSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULTS };
  for (const r of rows) out[r.key] = j.parse(r.value, '');
  return out;
}

export function saveSettings(values) {
  const db = getDb();
  const up = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  db.transaction(() => {
    for (const [key, value] of Object.entries(values)) {
      if (key in DEFAULTS) up.run(key, JSON.stringify(String(value ?? '').trim()));
    }
  })();
}
