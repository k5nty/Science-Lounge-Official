// One table of page URLs per language. Templates call url('schedule'), never hard-code a path.
// Russian paths follow the brief (SEO); English paths are readable English.
export const PATHS = {
  home: ['/', '/en/'],
  schedule: ['/raspisanie', '/en/schedule'],
  archive: ['/vypuski', '/en/issues'],
  issue: ['/vypusk/:slug', '/en/issues/:slug'],
  lecturers: ['/lektory', '/en/speakers'],
  lecturer: ['/lektory/:slug', '/en/speakers/:slug'],
  conference: ['/konferentsiya', '/en/conference'],
  conferenceYear: ['/konferentsiya/:year', '/en/conference/:year'],
  news: ['/novosti', '/en/news'],
  about: ['/o-nas', '/en/about'],
  feedback: ['/otzyv', '/en/feedback'],
  review: ['/otzyv/:slug', '/otzyv/:slug'],
  privacy: ['/politika', '/politika'],
  photo: ['/udalit-foto', '/udalit-foto'],
  thanks: ['/spasibo', '/spasibo'],
};

export const RU_ONLY = new Set(['review', 'privacy', 'photo', 'thanks']);

export function pathFor(key, lang, params = {}) {
  const pattern = PATHS[key][lang === 'en' ? 1 : 0];
  return pattern.replace(/:(\w+)/g, (_, name) => encodeURIComponent(params[name] ?? ''));
}

/** Express route patterns for both languages (deduplicated). */
export function patterns(key) {
  return [...new Set(PATHS[key])].map((p) => (key === 'conferenceYear' ? p.replace(':year', ':year(\\d{4})') : p));
}
