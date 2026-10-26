// Russian typographer applied on the server when content is saved.
// Idempotent: typo(typo(x)) === typo(x).

const NBSP = ' ';

const SHORT_WORDS = [
  'в', 'во', 'к', 'ко', 'с', 'со', 'у', 'о', 'об', 'обо', 'от', 'до', 'по', 'за', 'на', 'из', 'изо',
  'без', 'над', 'под', 'при', 'про', 'для', 'через', 'между', 'не', 'ни', 'и', 'а', 'но', 'да', 'или',
];
const SHORT_RE = new RegExp(`(?<![\\p{L}\\p{N}])(${SHORT_WORDS.join('|')})[ \\t]+(?=[^\\s])`, 'giu');
const PARTICLE_RE = /[ \t]+(ли|бы|же|ж)(?![\p{L}\p{N}])/giu;

const UNITS = [
  'кг', 'г', 'мг', 'т', 'км', 'м', 'дм', 'см', 'мм', 'мкм', 'нм', 'л', 'мл', 'с', 'мс', 'мин', 'ч', 'сек',
  '%', '°C', '°', 'К', 'Гц', 'кГц', 'МГц', 'ГГц', 'В', 'А', 'Вт', 'кВт', 'Дж', 'Па', 'эВ', 'Кл', 'Гб', 'МБ', 'ГБ',
  'руб\\.', '₽', 'г\\.', 'гг\\.', 'тыс\\.', 'млн', 'млрд', 'шт\\.', 'лет', 'год', 'года', 'мин\\.', 'сек\\.',
  'человек', 'слушателей', 'минут', 'часов', 'дней', 'лекций', 'лекции', 'лекция',
];
const UNIT_RE = new RegExp(`(\\d)[ \\t]+(${UNITS.join('|')})(?![\\p{L}\\p{N}])`, 'gu');

export function typo(input) {
  if (input == null) return '';
  let s = String(input).replace(/\r\n?/g, '\n');
  if (!s.trim()) return '';

  // Spaces: collapse runs of spaces/tabs, trim line ends. NBSP is kept (idempotency).
  s = s.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').trim();

  s = quotes(s);

  // Dashes and ellipsis.
  s = s.replace(/(^|\n)[-–]\s+/g, '$1— ');
  s = s.replace(/[  ]+(?:--|–|-|—)[  ]+/g, `${NBSP}— `);
  s = s.replace(/\.{3}|…/g, '…');

  // Non-breaking spaces. Run twice so chains like «и в тот» are handled.
  for (let i = 0; i < 2; i++) {
    s = s.replace(SHORT_RE, `$1${NBSP}`);
  }
  s = s.replace(PARTICLE_RE, `${NBSP}$1`);
  s = s.replace(UNIT_RE, `$1${NBSP}$2`);
  s = s.replace(/(№|§)[ \t]*(?=\d)/g, `$1${NBSP}`);
  s = s.replace(/([А-ЯЁ])\.[ \t]*([А-ЯЁ])\.[ \t]*(?=[А-ЯЁ][а-яё])/g, `$1.${NBSP}$2.${NBSP}`);
  s = s.replace(/(?<=\p{L}\.)[ \t]+(?=[А-ЯЁ]\.)/gu, NBSP);

  return s;
}

function quotes(s) {
  let depth = 0;
  let out = '';
  const chars = [...s];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (!/["„“”«»]/.test(ch)) {
      out += ch;
      continue;
    }
    const prev = chars[i - 1];
    const opening = ch === '«' || ch === '„' ? true : ch === '»' || ch === '“' ? false : null;
    const isOpen =
      opening !== null
        ? opening
        : prev === undefined || /[\s(\[{—–\-«„]/.test(prev) || prev === ' ';
    if (isOpen) {
      out += depth === 0 ? '«' : '„';
      depth++;
    } else {
      depth = Math.max(0, depth - 1);
      out += depth === 0 ? '»' : '“';
    }
  }
  return out;
}

/** Apply typo() to every string leaf of a JSON-like value. */
export function typoDeep(value) {
  if (typeof value === 'string') return typo(value);
  if (Array.isArray(value)) return value.map(typoDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typoDeep(v)]));
  }
  return value;
}

/** typo() for rich text: formulas, link targets and bare URLs are left untouched. */
export function typoRich(input) {
  if (input == null) return '';
  const keep = [];
  const protectedText = String(input).replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\]\([^)\s]*\)|https?:\/\/\S+/g, (m) => {
    keep.push(m);
    return `\u0001${keep.length - 1}\u0001`;
  });
  return typo(protectedText).replace(/\u0001(\d+)\u0001/g, (_, i) => keep[+i]);
}
