const MAP = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function translit(text) {
  return [...String(text ?? '').toLowerCase()].map((c) => (c in MAP ? MAP[c] : c)).join('');
}

export function slugify(text, { max = 60 } = {}) {
  const s = translit(text)
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/-[^-]*$/, '') || s.slice(0, max);
}

export function issueSlug(number, title) {
  const base = slugify(title, { max: 48 });
  const n = String(number).padStart(2, '0');
  return base ? `${n}-${base}` : n;
}
