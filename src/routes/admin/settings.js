import express from 'express';
import { SETTINGS_SCHEMA, getSettings, saveSettings } from '../../settings.js';
import { typo } from '../../lib/typo.js';
import { clean, flash, safeUrl } from './helpers.js';
import { config } from '../../config.js';
import { telegramEnabled, notifyTelegram } from '../../lib/telegram.js';

export const settingsRouter = express.Router();

settingsRouter.get('/', (req, res) => {
  res.render('admin/settings', {
    schema: SETTINGS_SCHEMA,
    values: getSettings(),
    env: { telegram: telegramEnabled(), metrika: Boolean(config.metrikaId), umami: Boolean(config.umamiSrc), siteUrl: config.siteUrl },
  });
});

settingsRouter.post('/', (req, res) => {
  const out = {};
  for (const g of SETTINGS_SCHEMA) {
    for (const item of g.items) {
      let v = clean(req.body[item.key], item.type === 'textarea' ? 6000 : 500);
      if (item.type === 'select') v = item.options.some((o) => o[0] === v) ? v : item.default;
      if (item.type === 'url' || item.key === 'channel_url') v = safeUrl(v);
      if (item.key.endsWith('_ru') || item.key === 'site_tagline') v = typo(v);
      out[item.key] = v;
    }
  }
  saveSettings(out);
  flash(res, 'ok', 'Настройки сохранены.');
  res.redirect(303, '/admin/settings');
});

settingsRouter.post('/test-telegram', async (req, res) => {
  if (!telegramEnabled()) {
    flash(res, 'err', 'Бот не настроен: задайте TG_BOT_TOKEN и TG_CHAT_ID в .env и перезапустите сайт.');
  } else {
    const ok = await notifyTelegram('Проверка связи: бот Science Lounge работает.', { retries: 0 });
    flash(res, ok ? 'ok' : 'err', ok ? 'Сообщение отправлено в Telegram.' : 'Telegram не принял сообщение. Проверьте токен и chat_id.');
  }
  res.redirect(303, '/admin/settings');
});
