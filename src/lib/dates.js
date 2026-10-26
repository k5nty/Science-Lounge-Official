// All site times are Moscow time (UTC+3, no DST since 2014). Stored as UTC ISO strings.
import { config } from '../config.js';

const MSK_OFFSET_MS = 3 * 3600e3;

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const WD_LONG = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n) => String(n).padStart(2, '0');

/** Wall-clock parts in Moscow for a UTC ISO string / Date / ms. */
export function msk(value) {
  const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  const d = new Date(ms + MSK_OFFSET_MS);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    mi: d.getUTCMinutes(),
    wd: d.getUTCDay(),
    ms,
  };
}

/** '2026-11-12' + '17:30' (Moscow) -> '2026-11-12T14:30:00Z' */
export function mskToUtcIso(dateStr, timeStr = '00:00') {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr || '').trim());
  if (!m || !t) return null;
  const [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], +t[1], +t[2]];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  // reject 2026-02-31, 25:99 and friends instead of rolling over
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d || h > 23 || mi > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi) - MSK_OFFSET_MS;
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** datetime-local value ('2026-11-12T17:30') from UTC ISO. */
export function toLocalInput(iso) {
  if (!iso) return '';
  const p = msk(iso);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

export function fromLocalInput(value) {
  const [d, t] = String(value || '').split('T');
  return mskToUtcIso(d, t);
}

export function dateInput(iso) {
  return iso ? toLocalInput(iso).slice(0, 10) : '';
}

export const longDate = (iso) => {
  const p = msk(iso);
  return `${p.d} ${MONTHS_GEN[p.m - 1]} ${p.y}`;
};
export const longDateEn = (iso) => {
  const p = msk(iso);
  return `${p.d} ${MONTHS_EN[p.m - 1]} ${p.y}`;
};
export const shortDate = (iso) => {
  const p = msk(iso);
  return `${pad(p.d)}.${pad(p.m)}`;
};
export const timeOf = (iso) => {
  const p = msk(iso);
  return `${pad(p.h)}:${pad(p.mi)}`;
};
export const weekday = (iso) => WD_SHORT[msk(iso).wd];
export const weekdayLong = (iso) => WD_LONG[msk(iso).wd];
export const weekdayEn = (iso) => WD_EN[msk(iso).wd];
export const monthYear = (iso) => {
  const p = msk(iso);
  return `${MONTHS_NOM[p.m - 1]} ${p.y}`;
};
export const monthKey = (iso) => {
  const p = msk(iso);
  return `${p.y}-${pad(p.m)}`;
};
export const monthYearEn = (iso) => {
  const p = msk(iso);
  return `${MONTHS_EN[p.m - 1]} ${p.y}`;
};

/** A lecture becomes "past" N hours after its start. */
export function isPast(startIso, now = Date.now()) {
  return now > Date.parse(startIso) + config.pastAfterHours * 3600e3;
}

export function dateRangeRu(startIso, endIso) {
  if (!startIso) return '';
  const a = msk(startIso);
  if (!endIso || endIso === startIso) return longDate(startIso);
  const b = msk(endIso);
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS_GEN[a.m - 1]} ${a.y}`;
  if (a.y === b.y) return `${a.d} ${MONTHS_GEN[a.m - 1]} – ${b.d} ${MONTHS_GEN[b.m - 1]} ${a.y}`;
  return `${longDate(startIso)} – ${longDate(endIso)}`;
}

export function dateRangeEn(startIso, endIso) {
  if (!startIso) return '';
  const a = msk(startIso);
  if (!endIso || endIso === startIso) return longDateEn(startIso);
  const b = msk(endIso);
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS_EN[a.m - 1]} ${a.y}`;
  return `${longDateEn(startIso)} – ${longDateEn(endIso)}`;
}

export const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
export const addDaysIso = (iso, days) => new Date(Date.parse(iso) + days * 86400e3).toISOString().replace(/\.\d{3}Z$/, 'Z');
