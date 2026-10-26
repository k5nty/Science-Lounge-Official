# Science Lounge

Статический сайт лектория Science Lounge школы «Летово»: анонсы лекций, конспекты, расписание, конференция и новости науки. Есть русская и английская версии.

Сайт публикуется через GitHub Pages: https://k5nty.github.io/Science-Lounge-Official/

## Структура

- `index.html`, `en/index.html` — главная (на ней показываются три последние новости)
- `novosti/`, `en/news/` — все новости науки
- `vypuski/`, `vypusk/*`, `en/issues/*` — лекции
- `raspisanie/`, `raspisanie.ics` — расписание и календарь
- `assets/` — стили, скрипты, шрифты; `media/`, `og/` — изображения

Все ссылки начинаются с `/Science-Lounge-Official/`, поэтому репозиторий должен называться `science-lounge`.

## Как добавить новость

Скопируйте блок `<article class="news-item">…</article>` в начало `<div class="news-list">` в файлах `novosti/index.html` (русский) и `en/news/index.html` (английский). На главных страницах (`index.html`, `en/index.html`) держите три последние новости.

## Публикация

Settings → Pages → Source: «Deploy from a branch», ветка `main`, папка `/ (root)`.
