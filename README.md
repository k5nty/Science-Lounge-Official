# Science Lounge

Сайт-архив и афиша лектория школы «Летово»: пронумерованные выпуски-лекции, расписание, новости науки, конференция National Letovo Engineers, обратная связь и админка для учеников. Сделано по ТЗ «сайт Science Lounge» (10 октября 2026).

- **Публичный сайт**: серверный рендер, работает без JavaScript, телефон — основной экран. Двуязычный (RU/EN), пять оформлений на выбор (`docs/THEMES.md`).
- **Админка** `/admin`: выпуски, лекторы, новости, конференции, команда, обращения, настройки, пользователи, копии. Роли «редактор» и «администратор».
- **Бэкенд**: Node.js 22, Express, SQLite (один файл), sharp для фото, Telegram-бот для уведомлений.
- **Без внешних SaaS**: шрифты, KaTeX и карта лежат на сервере. Данные остаются в России, если сервер там.

Пошаговая установка для тех, кто получил архив с кодом: [УСТАНОВКА.md](УСТАНОВКА.md).

## Быстрый старт (локально)

```bash
npm install
cp .env.example .env              # поправьте SITE_URL для разработки: http://localhost:3000
npm run admin:create -- me@school.ru "Моё имя" "длинный-пароль-10+"
npm run seed:demo                 # необязательно: образцы выпусков, чтобы увидеть сайт заполненным
npm start                         # http://localhost:3000   админка: /admin
```

Удалить демо-данные: `npm run seed:clear`. Тесты: `npm test`.

## Что где

| Путь | Назначение |
| --- | --- |
| `src/` | сервер: маршруты, модели, шаблоны, библиотеки |
| `public/` | CSS, JS, шрифты (self-host) |
| `data/` | база, фото, кэш, копии (создаётся сама, не в git) |
| `docs/KAK-VESTI-SAYT.md` | инструкция для учеников со скриншотами |
| `docs/THEMES.md`, `docs/THEME-CONTRACT.md` | пять оформлений и как сделать шестое |
| `docs/DEPLOY.md` | выкладка на сервер, домен, HTTPS, копии |
| `docs/ARCHITECTURE.md` | устройство проекта и решения |
| `docs/ACCEPTANCE.md` | проверка по критериям приёмки из ТЗ |
| `docs/soglasie-lektora.html` | шаблон согласия лектора (печать или PDF) |
| `materialy-lektsiy/` | материалы по темам лекций (RU и EN) и шаблон письма лекторам |
| `deploy/` | Caddy, nginx, systemd |

## Команды

| Команда | Что делает |
| --- | --- |
| `npm start` | запуск сайта |
| `npm run dev` | запуск с перезагрузкой при правках |
| `npm test` | модульные и интеграционные тесты |
| `npm run admin:create -- почта "Имя" пароль [editor\|admin]` | создать или обновить пользователя |
| `npm run seed:demo` / `seed:clear` | добавить / убрать демо-данные |
| `npm run backup` | копия базы и фото сейчас |
| `npm run content:materials` | загрузить материалы по темам лекций из `materialy-lektsiy/` в выпуски |
| `npm run content:portraits` | поставить портреты лекторов и фото основателей из `assets/portraits/` |

## Лицензии зависимостей

Шрифты Literata, Golos Text, JetBrains Mono — SIL Open Font License. KaTeX, Express, sharp, better-sqlite3, nunjucks, satori — MIT/Apache-2.0.
