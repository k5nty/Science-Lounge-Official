# Как устроены оформления (темы)

Сайт отдаёт одну и ту же HTML-разметку, а оформление выбирается темой. Пять тем, каждая повторяет узнаваемый тип реального сайта: `journal` (научный журнал по ТЗ), `campus` (архив лекций вуза), `plain` (текстовый минимализм), `events` (афиша событий), `press` (онлайн-журнал). Выбор: `?theme=<id>` запоминается в cookie `sl_theme`; тема по умолчанию задаётся в админке (Настройки → Дизайн сайта). Переключатель внизу слева (`.theme-switch`) нужен для сравнения; его выключают перед запуском.

## Файлы темы `<id>`

| Файл | Зачем |
| --- | --- |
| `public/css/themes/<id>.css` | **обязателен**; грузится после `public/css/site.css` и переопределяет его |
| `public/js/themes/<id>.js` | необязателен; грузится с `defer` после `site.js` |
| `src/views/themes/<id>/header.njk` | необязателен; заменяет шапку целиком |
| `src/views/themes/<id>/footer.njk` | необязателен; заменяет подвал |
| `src/views/themes/<id>/home.njk` | необязателен; заменяет содержимое главной (внутри `<main>`) |
| `src/views/themes/<id>/schedule.njk`, `archive.njk`, `lecturers.njk` | необязательны; заменяют содержимое страниц |

Все остальные страницы (выпуск, лектор, конференция, обратная связь, «О нас», 404, формы) оформляются только CSS-ом по общей разметке.

## Принципы (важнее всех правил ниже)

1. **Это должен быть другой интерфейс, а не другая раскраска.** Меняется всё: шрифты, шапка и её кнопки, расположение элементов, форма кнопок, сетка главной, вид списков и карточек. Если открыть две темы рядом, их нельзя спутать.
2. **Никакого «ИИ-вида».** Запрещено: градиентные заливки и градиентный текст, стеклянные панели (`backdrop-filter`), свечение, размытые цветные пятна, неон, фиолетово-синие схемы, иконки в кружках, эмодзи, декоративные орбиты и частицы, шаблонные «hero с абстракцией». Только то, что делают настоящие редакции и вузы: плоские цвета, линии, типографика, фотографии.
3. **Повторяйте реальный сайт-образец** (указан в задании темы): его сетку, поведение шапки, вид карточек и кнопок, размеры шрифтов, плотность. Скриншоты образцов лежат в `refs/` в папке сессии (путь в задании). Не копируйте логотипы и тексты, копируйте структуру и приёмы.
4. **Минимум текста.** Не придумывайте лозунги, описания разделов и «вступления». Только данные сайта (темы, имена, даты, места) и короткие подписи интерфейса из `t('…')`. Если нужно слово, которого нет в `t()`, пишите прямо в шаблоне двуязычно в одну-две слова: `{{ 'Ближайшие' if lang == 'ru' else 'Upcoming' }}`. Никаких абзацев текста от себя. Подвал короткий: ссылки и название.
5. **Анимации сдержанные и функциональные** (как у образца): hover, раскрытие, плавное появление. Без «эффектных» бегущих и вращающихся элементов, если их нет у образца.

## Правила

1. **Только свои файлы.** Не трогайте `src/*.js`, `src/routes`, `site.css`, `site.js`, чужие темы, `package.json`. Если в общем коде нашли ошибку, опишите её в отчёте.
2. **Нет внешних запросов.** CSP: `default-src 'self'`, скрипты только `'self'`, **никаких инлайн-скриптов и `onclick=`**, шрифты только свои. Инлайн-атрибут `style=""` разрешён, но лучше классы. Картинки: загруженные фото, CSS, инлайн-SVG (простые иконки: поиск, меню, стрелка).
3. **Шрифты** лежат в `public/fonts/themes/` (woff2, все с кириллицей). Объявляйте `@font-face` в CSS темы с путём `/assets/fonts/themes/<файл>`:
   - кириллица: `unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;`
   - латиница: `unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;`
   - переменные по весу (`font-weight: 100 900`): `source-serif-4-{cyrillic,latin}-wght-{normal,italic}.woff2`, `source-sans-3-…`, `eb-garamond-…`, `nunito-sans-…`, `playfair-display-…`, `merriweather-…`, `montserrat-…`;
   - статические: `pt-sans-{cyrillic,latin}-{400,700}-{normal,italic}.woff2`, `fira-sans-{cyrillic,latin}-{400,500,600,700,800}-normal.woff2`.
4. **Без JS всё читается.** Анимации появления прячут контент только если `<html>` имеет класс `has-js`, который ставит JS темы.
5. **`prefers-reduced-motion: reduce`** выключает анимации и переходы темы.
6. **Доступность.** Контраст текста не ниже WCAG AA (4.5:1, крупный 3:1), видимый `:focus-visible`, цели нажатия на телефоне не меньше 40 px, `aria-current` на активном пункте меню.
7. **Адаптив**: от 360 до 1920 px, без горизонтальной прокрутки (`document.documentElement.scrollWidth <= innerWidth`). Телефон — главный экран: у образцов на телефоне другая шапка (значки поиска и меню), делайте так же; меню на телефоне открывается без JS (`<details>`) или через небольшой JS темы.
8. **Не ломать скрипты сайта** (`site.js`): сохраняйте атрибуты и id, перечисленные ниже.
9. Весь текст интерфейса уже в шаблонах (`t('ключ')`), содержимое — `L(объект, 'поле')`. Сайт двуязычный: свои шаблоны пишите для обоих языков теми же функциями.

## Что получает шаблон

Глобально в любом шаблоне: `lang` (`'ru'`/`'en'`), `t(key, vars)`, `L(obj, 'field')` (поле на текущем языке с запасным русским), `url('home'|'schedule'|'archive'|'lecturers'|'conference'|'about'|'feedback', {…})`, `url('issue', {slug})`, `url('lecturer', {slug})`, `fx.dl(iso)` (длинная дата), `fx.dwd(iso)` (день недели), `fx.dmonth(iso)` (месяц и год), `dShort(iso)` (`12.11`), `dTime(iso)` (`17:30`), `pad2(n)`, `issueNo(n)` (`№ 05`), `picture(media, {sizes, src, alt, eager, cls})` (AVIF+WebP), `initials(name)`, `rich(text)`, `settings`, `channelUrl`, `theme`, `navItems()` (массив `{href,label,active,cta}`), `langSwitch()` (`{href,label,hreflang,title}`), `tagName(tag)`.

Импорт общих макросов: `{% import "partials/macros.njk" as m with context %}` даёт `m.portrait(lecturer, {color, eager, sizes, src})`, `m.issueCard(issue)`, `m.statusLabel(status)`; `{% import "partials/forms.njk" as f with context %}` даёт `f.suggestInline()`.

**home.njk**: `lead` (выпуск или `null`), `isNext` (true, если это предстоящая лекция), `leadStatus`, `leadHtml` (безопасный HTML анонса или главной мысли), `latest` (до 3 прошедших), `upcomingList` (до 4 ближайших), `lecturers` (лекторы), `stats` (`{lectures, listeners, lecturers, regions}`, значения-строки, могут быть пустыми), `tgPost`. У выпуска: `number`, `slug`, `title_ru/en`, `thought_*`, `announce_*`, `place_*`, `start_at` (ISO UTC), `lecturer`, `lecturers`, `cover` (media или `null`), `tags`, `past`, `status_flag`, `reg_enabled`, `reg_url`, `listeners`. У лектора: `slug`, `name_*`, `role_*`, `org_*`, `area`, `portrait` (media или `null`).

**schedule.njk**: `upcoming`, `past`, `statusOf(issue)` (`soon|reg_open|sold_out|moved|cancelled|past`), `webcal`. **archive.njk**: `issues`, `tags`, `tagFull`, `tag`, `q`, `totalCount`, `listeners`. **lecturers.njk**: `lecturers`, `areas`, `area`, `areaOf(l)`, `issuesBy` (Map id→выпуски), `total`.

## Разметка общих страниц (для CSS)

- Каркас: `body > .skip, header.mast > .wrap > (.brand, .mast-tools), .nav-row > nav.main > a(.cta)(aria-current), main#main.wrap, footer.site > .wrap, .cookie, .theme-switch`.
- Заголовки страниц: `.sec-head` (`h1.page-title|h2` + `.label`/ссылка), `.label` (мелкая моно-подпись), `.mono`, `.muted`, `.btn(.primary)`, `.actions`, `.chips > .chip[aria-current|aria-pressed]`, `.status(.soon|.reg_open|.sold_out|.moved|.cancelled|.past)`.
- Главная по умолчанию: `section.lead-issue > (div > .status, .issue-no, h1, .when, .lead-text, .actions) + a.lead-side(.portrait, .who)`, `.facts > div > b + .label`, `.cards > a.card(.card-photo, .top(.n,.label), h3, .thought, .by)`, `.strip > a.sp(.portrait, b, small)`, `form.fb`, `.tg-post`.
- Расписание: `.sub-bar`, `.sched-month(h3)`, `a.row(.d(small), .no, span(.t,.meta), .st)`, `details.past-box#past-box > summary`.
- Архив: `.tools(form[role=search] input#arch-q, .chips#arch-tags)`, `.cards#arch-list > div[data-slug][data-tags]` (с `display:contents`), `p#arch-none`.
- Лекторы: `.lect-grid > a.sp`; страница лектора: `.lect(.portrait, div(h1,.prose,.facts-list,.links-line))`.
- Выпуск: `.cover > .cover-photo + .plaque(.issue-no,h1) + .cover-cap` или `header.issue-head(.issue-no,h1)`, `.byline`, `.thesis[data-label]`, `.grid12 > .main-col(.speakers > a.speaker-box) + .rail`, `.idea(.txt(h3 span, p), aside > blockquote.pull)`, `.term > .term-def`, `.glossary`, `.block > h2`, `.qa > .qa-item(i,.q,.a)`, `.videos > .vid(.vid-frame[data-embed], .play)`, `.gallery > a[data-lightbox]`, `.materials`, `.autograph`, `.check`, `.neighbors`, `.cal-line`, `.banner`. Формы: `form.fb > .field(label,input), .rate(input+label), .consent, .hp (скрытое поле-ловушка, не показывать!), .out`.
- Конференция: `.days > .day`, `.jury > a.sp`, `.russia-map(.land,.dot)`, `.regions`, `.posters > .poster`. «О нас»: `.two`, `.founders > .founder(.portrait,b,.role,p)`.

Сохраняйте для `site.js`: `#past-box`, `#arch-q`, `#arch-list`, `#arch-tags`, `[data-slug]`, `[data-tags]`, `#arch-none`, `[data-lightbox]`, `[data-embed]`, `[data-tg-post]`, `[data-goal]`, `[data-form]`, `.out`, `.hp`, `.term`, `#cookie`, `[data-share]`, `[data-print]`, `#notes`.

## Проверка

Запустите свой экземпляр на своём порту с копией демо-базы и снимите экраны headless-Chrome (puppeteer-core уже стоит): десктоп 1440 и телефон 390, тема включается ссылкой `/?theme=<id>` (cookie запоминается). Обязательные страницы: `/`, `/vypuski`, `/vypusk/01-kak-uvidet-atom-esli-ego-nelzya-uvidet` (материал), `/vypusk/06-materialy-kotorye-chinyat-sebya-sami` (анонс), `/raspisanie`, `/lektory`, `/lektory/andrey-belov`, `/konferentsiya/2026`, `/o-nas`, `/otzyv`, `/otzyv/01-kak-uvidet-atom-esli-ego-nelzya-uvidet`, `/en/`, `/en/issues`, `/no-such-page` (404). Проверьте: нет горизонтальной прокрутки, нет ошибок в консоли и нарушений CSP, анимации плавные, текст читается.
