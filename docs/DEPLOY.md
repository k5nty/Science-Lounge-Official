# Выкладка на сервер

Рекомендация из ТЗ: российский облачный провайдер (Timeweb Cloud, Selectel, Yandex Cloud), чтобы персональные данные хранились в России (152-ФЗ). Подходит самый дешёвый VPS: 1 vCPU, 1–2 ГБ памяти, 20 ГБ диска.

## 0. Что нужно

- VPS с Ubuntu 22.04/24.04 и белым IP.
- Домен. Купите на организатора или школу, не на разработчика. В DNS добавьте запись `A` на IP сервера.
- Доступы к хостингу и домену оформлены на организаторов/школу.

## 1. Вариант А: Docker (рекомендуется)

```bash
# на сервере
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
git clone <репозиторий> /opt/science-lounge && cd /opt/science-lounge
cp .env.example .env
nano .env
```

В `.env` заполните:

```
SITE_URL=https://sciencelounge.example
SITE_DOMAIN=sciencelounge.example
ADMIN_EMAIL=вы@школа.ру
ADMIN_PASSWORD=длинный-пароль-10+знаков
TG_BOT_TOKEN=...      # от @BotFather
TG_CHAT_ID=...        # чат, куда бот шлёт обращения
```

```bash
docker compose up -d --build
docker compose logs -f app        # должно появиться: Science Lounge: https://… 
```

Caddy сам получит сертификат Let's Encrypt, как только DNS начнёт указывать на сервер. Откройте `https://ваш-домен/admin`.

После первого входа удалите `ADMIN_PASSWORD` из `.env` и перезапустите: `docker compose up -d`.

**Обновление:**

```bash
git pull && docker compose up -d --build
```

Данные (база, фото, копии) лежат в томе `sl-data` и переживают обновления.

## 2. Вариант Б: без Docker

```bash
sudo apt install -y nodejs npm   # нужен Node 22+: https://nodejs.org или nvm
sudo useradd -r -m sciencelounge
sudo git clone <репозиторий> /opt/science-lounge && cd /opt/science-lounge
sudo cp .env.example .env && sudo nano .env
sudo npm ci --omit=dev
sudo chown -R sciencelounge:sciencelounge /opt/science-lounge
sudo cp deploy/science-lounge.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now science-lounge
```

Дальше поставьте nginx (`deploy/nginx.conf`) и `certbot --nginx`, либо Caddy.

## 3. Telegram-бот

1. В Telegram откройте @BotFather → `/newbot` → получите токен.
2. Создайте чат организаторов, добавьте бота.
3. Узнайте `chat_id`: напишите боту в чат любое сообщение и откройте `https://api.telegram.org/bot<TOKEN>/getUpdates`, найдите `"chat":{"id":...}` (у групп число с минусом).
4. Впишите оба значения в `.env`, перезапустите. В админке «Настройки» нажмите «Отправить проверочное сообщение».

## 4. Аналитика

- **Яндекс Метрика**: впишите `METRIKA_ID`. Счётчик грузится только после согласия в cookie-баннере. Цели для настройки в Метрике (JavaScript-события): `calendar`, `review`, `channel`, `video`, `register`.
- **Umami** на своём сервере: `UMAMI_SRC`, `UMAMI_ID`. Без cookie, баннер не показывается.

## 5. Копии

- Сайт сам делает копию раз в сутки около 03:30 в `data/backups/` и хранит 30 дней (`BACKUP_KEEP_DAYS`).
- Скачать копию можно в админке, раздел «Копии». Раз в месяц сохраняйте копию вне сервера.
- Вручную: `docker compose exec app node scripts/backup.js` или `npm run backup`.
- Восстановление: остановите сайт, подставьте `science-lounge.db` в `data/`, распакуйте `uploads.tar.gz` в `data/`, запустите.

## 6. Перед запуском

- [ ] Политика обработки данных проверена юристом школы; в настройках заполнен оператор.
- [ ] Согласие на использование названия и логотипа «Летово» получено у администрации.
- [ ] Домен и хостинг оформлены не на разработчика.
- [ ] Удалены демо-данные (`npm run seed:clear`) и тестовый пароль администратора.
- [ ] `SITE_URL` начинается с `https://`.
- [ ] Бот Telegram присылает проверочное сообщение.
- [ ] Первый выпуск создан и открывается на телефоне.

## 7. Обслуживание (раз в квартал)

1. Сделайте копию (раздел «Копии» в админке).
2. На сервере: `git pull`, затем `npm audit --omit=dev` и `npm outdated`.
3. Обновите зависимости (`npm update`), прогоните `npm test`, пересоберите: `docker compose up -d --build`.
4. Обновите ОС: `sudo apt update && sudo apt upgrade`.
5. Проверьте, что сертификат продлевается (Caddy делает это сам, certbot — по таймеру).
6. Откройте сайт на телефоне: главная, ближайшая лекция, форма отзыва.

Известное замечание аудита: зависимость `satori` тянет `fflate`, у которой есть уязвимость в разборе повреждённых ZIP-архивов. Сайт не разбирает ZIP, обложки генерируются только из данных админки, поэтому риска нет; обновляйте `satori` при выходе исправленной версии.
