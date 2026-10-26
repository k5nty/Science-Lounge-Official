// Data access. Public reads go through "visible*" helpers so drafts never leak.
import { getDb, j, nowIso } from './db.js';
import { isPast } from './lib/dates.js';
import { removeMediaFiles } from './lib/images.js';

/* ---------- media ---------- */

export function getMedia(id) {
  if (!id) return null;
  return getDb().prepare('SELECT * FROM media WHERE id = ?').get(id) || null;
}

export function mediaByIds(ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return new Map();
  const rows = getDb().prepare(`SELECT * FROM media WHERE id IN (${list.map(() => '?').join(',')})`).all(...list);
  return new Map(rows.map((r) => [r.id, r]));
}

export function insertMedia(m) {
  const info = getDb()
    .prepare(
      `INSERT INTO media(kind, base, ext, width, height, bytes, widths, orig_name, alt, credit, caption, consent, is_demo)
       VALUES(@kind, @base, @ext, @width, @height, @bytes, @widths, @orig_name, @alt, @credit, @caption, @consent, @is_demo)`,
    )
    .run({
      kind: m.kind,
      base: m.base,
      ext: m.ext || '',
      width: m.width ?? null,
      height: m.height ?? null,
      bytes: m.bytes || 0,
      widths: JSON.stringify(m.widths || []),
      orig_name: m.orig_name || '',
      alt: m.alt || '',
      credit: m.credit || '',
      caption: m.caption || '',
      consent: m.consent || 'pending',
      is_demo: m.is_demo ? 1 : 0,
    });
  return getMedia(info.lastInsertRowid);
}

export function updateMediaMeta(id, meta) {
  const vals = { id };
  const sets = [];
  for (const k of ['alt', 'credit', 'caption']) {
    if (meta[k] !== undefined) {
      sets.push(`${k} = @${k}`);
      vals[k] = String(meta[k]).trim().slice(0, 500);
    }
  }
  if (meta.consent !== undefined && ['pending', 'yes', 'no', 'general'].includes(meta.consent)) {
    sets.push('consent = @consent');
    vals.consent = meta.consent;
  }
  if (!sets.length) return;
  getDb().prepare(`UPDATE media SET ${sets.join(', ')} WHERE id = @id`).run(vals);
}

export async function deleteMedia(id) {
  const m = getMedia(id);
  if (!m) return;
  getDb().prepare('DELETE FROM media WHERE id = ?').run(id);
  await removeMediaFiles(m);
}

/** Everything that may reference a media row. */
export function mediaInUse(id) {
  const db = getDb();
  const refs = [
    ['SELECT 1 FROM lecturers WHERE portrait_id = ?', id],
    ['SELECT 1 FROM issues WHERE cover_id = ? OR slides_id = ? OR autograph_id = ?', id, id, id],
    ['SELECT 1 FROM issue_photos WHERE media_id = ?', id],
    ['SELECT 1 FROM conferences WHERE cover_id = ?', id],
    ['SELECT 1 FROM conference_photos WHERE media_id = ?', id],
    ['SELECT 1 FROM team WHERE photo_id = ?', id],
    ['SELECT 1 FROM news WHERE image_id = ?', id],
    ['SELECT 1 FROM conferences c, json_each(c.posters) je WHERE json_extract(je.value, \'$.media_id\') = ?', id],
  ];
  return refs.some(([sql, ...args]) => db.prepare(sql).get(...args));
}

/** Removes files and rows of media nobody references any more. Returns the number deleted. */
export async function deleteIfOrphan(ids) {
  let n = 0;
  for (const id of [...new Set(ids.filter(Boolean))]) {
    if (getMedia(id) && !mediaInUse(id)) {
      await deleteMedia(id);
      n++;
    }
  }
  return n;
}

/** Housekeeping: uploads that were never attached to anything (older than `graceMinutes`). */
export async function pruneOrphanMedia(graceMinutes = 120) {
  const cutoff = new Date(Date.now() - graceMinutes * 60e3).toISOString();
  const rows = getDb().prepare('SELECT id FROM media WHERE created_at < ?').all(cutoff);
  return deleteIfOrphan(rows.map((r) => r.id));
}

/** Photos of people may be published only with consent. Portraits/posters are exempt. */
export const photoPublishable = (m) => Boolean(m) && (m.consent === 'yes' || m.consent === 'general');
/** Same rule for portraits, team photos, posters and autographs: consent "no"/"pending" never reaches the public. */
export const publicMedia = (m) => (photoPublishable(m) ? m : null);

/* ---------- lecturers ---------- */

function hydrateLecturer(row, media) {
  if (!row) return null;
  return {
    ...row,
    facts_ru: j.parse(row.facts_ru),
    facts_en: j.parse(row.facts_en),
    links: j.parse(row.links),
    portrait: publicMedia(media.get(row.portrait_id)),
  };
}

export function listLecturers() {
  const rows = getDb().prepare('SELECT * FROM lecturers ORDER BY name_ru COLLATE NOCASE').all();
  const media = mediaByIds(rows.map((r) => r.portrait_id));
  return rows.map((r) => hydrateLecturer(r, media));
}

export function getLecturerBySlug(slug) {
  const row = getDb().prepare('SELECT * FROM lecturers WHERE slug = ?').get(slug);
  return row ? hydrateLecturer(row, mediaByIds([row.portrait_id])) : null;
}

export function getLecturerById(id) {
  const row = getDb().prepare('SELECT * FROM lecturers WHERE id = ?').get(id);
  return row ? hydrateLecturer(row, mediaByIds([row.portrait_id])) : null;
}

export function uniqueSlug(table, base, selfId = null) {
  const db = getDb();
  const root = base || 'item';
  let slug = root;
  let n = 2;
  const q = db.prepare(`SELECT id FROM ${table} WHERE slug = ?`);
  for (;;) {
    const hit = q.get(slug);
    if (!hit || hit.id === selfId) return slug;
    slug = `${root}-${n++}`;
  }
}

export function saveLecturer(data, id = null) {
  const db = getDb();
  const now = nowIso();
  const row = {
    slug: data.slug,
    name_ru: data.name_ru,
    name_en: data.name_en || '',
    portrait_id: data.portrait_id || null,
    role_ru: data.role_ru || '',
    role_en: data.role_en || '',
    org_ru: data.org_ru || '',
    org_en: data.org_en || '',
    area: data.area || '',
    area_en: data.area_en || '',
    bio_ru: data.bio_ru || '',
    bio_en: data.bio_en || '',
    facts_ru: j.str(data.facts_ru),
    facts_en: j.str(data.facts_en),
    links: j.str(data.links),
    updated_at: now,
  };
  if (id) {
    db.prepare(
      `UPDATE lecturers SET slug=@slug,name_ru=@name_ru,name_en=@name_en,portrait_id=@portrait_id,role_ru=@role_ru,role_en=@role_en,
       org_ru=@org_ru,org_en=@org_en,area=@area,area_en=@area_en,bio_ru=@bio_ru,bio_en=@bio_en,facts_ru=@facts_ru,facts_en=@facts_en,
       links=@links,updated_at=@updated_at WHERE id=@id`,
    ).run({ ...row, id });
    return id;
  }
  const info = db
    .prepare(
      `INSERT INTO lecturers(slug,name_ru,name_en,portrait_id,role_ru,role_en,org_ru,org_en,area,area_en,bio_ru,bio_en,facts_ru,facts_en,links,updated_at,is_demo)
       VALUES(@slug,@name_ru,@name_en,@portrait_id,@role_ru,@role_en,@org_ru,@org_en,@area,@area_en,@bio_ru,@bio_en,@facts_ru,@facts_en,@links,@updated_at,@is_demo)`,
    )
    .run({ ...row, is_demo: data.is_demo ? 1 : 0 });
  return Number(info.lastInsertRowid);
}

export function deleteLecturer(id) {
  const used = getDb().prepare('SELECT COUNT(*) c FROM issue_lecturers WHERE lecturer_id = ?').get(id).c;
  if (used) return { ok: false, reason: `Лектор указан в выпусках (${used}). Сначала уберите его из выпусков.` };
  getDb().prepare('DELETE FROM lecturers WHERE id = ?').run(id);
  return { ok: true };
}

/* ---------- issues ---------- */

export function issueIsVisible(issue, now = Date.now()) {
  if (issue.publish_state === 'published') return true;
  if (issue.publish_state === 'scheduled' && issue.publish_at && Date.parse(issue.publish_at) <= now) return true;
  return false;
}

function hydrateIssue(row, ctx) {
  const lecturerIds = ctx.lecturersByIssue.get(row.id) || [];
  const lecturers = lecturerIds.map((id) => ctx.lecturers.get(id)).filter(Boolean);
  const photoIds = ctx.photosByIssue.get(row.id) || [];
  const allPhotos = photoIds.map((id) => ctx.media.get(id)).filter(Boolean);
  const cover = ctx.media.get(row.cover_id) || null;
  return {
    ...row,
    ideas: j.parse(row.ideas),
    terms: j.parse(row.terms),
    qa: j.parse(row.qa),
    reads: j.parse(row.reads),
    tags: j.parse(row.tags),
    lecturers,
    lecturer: lecturers[0] || null,
    cover: photoPublishable(cover) ? cover : null,
    coverRaw: cover,
    photos: allPhotos.filter(photoPublishable),
    photosAll: allPhotos,
    slides: row.slides_ok ? ctx.media.get(row.slides_id) || null : null,
    slidesRaw: ctx.media.get(row.slides_id) || null,
    autograph: publicMedia(ctx.media.get(row.autograph_id)),
    past: isPast(row.start_at),
  };
}

function buildContext(rows) {
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const lecturersByIssue = new Map();
  const photosByIssue = new Map();
  const lecturerIds = new Set();
  const mediaIds = new Set();
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    for (const r of db.prepare(`SELECT * FROM issue_lecturers WHERE issue_id IN (${ph}) ORDER BY position`).all(...ids)) {
      if (!lecturersByIssue.has(r.issue_id)) lecturersByIssue.set(r.issue_id, []);
      lecturersByIssue.get(r.issue_id).push(r.lecturer_id);
      lecturerIds.add(r.lecturer_id);
    }
    for (const r of db.prepare(`SELECT * FROM issue_photos WHERE issue_id IN (${ph}) ORDER BY position`).all(...ids)) {
      if (!photosByIssue.has(r.issue_id)) photosByIssue.set(r.issue_id, []);
      photosByIssue.get(r.issue_id).push(r.media_id);
      mediaIds.add(r.media_id);
    }
  }
  for (const r of rows) {
    [r.cover_id, r.slides_id, r.autograph_id].forEach((x) => x && mediaIds.add(x));
  }
  const lecRows = lecturerIds.size
    ? db.prepare(`SELECT * FROM lecturers WHERE id IN (${[...lecturerIds].map(() => '?').join(',')})`).all(...lecturerIds)
    : [];
  lecRows.forEach((l) => l.portrait_id && mediaIds.add(l.portrait_id));
  const media = mediaByIds([...mediaIds]);
  const lecturers = new Map(lecRows.map((l) => [l.id, hydrateLecturer(l, media)]));
  return { lecturersByIssue, photosByIssue, lecturers, media };
}

function loadIssues(rows) {
  const ctx = buildContext(rows);
  return rows.map((r) => hydrateIssue(r, ctx));
}

/** All issues visible to the public, oldest first. */
export function visibleIssues(now = Date.now()) {
  const rows = getDb().prepare('SELECT * FROM issues ORDER BY start_at, number').all().filter((r) => issueIsVisible(r, now));
  return loadIssues(rows);
}

export function allIssues() {
  return loadIssues(getDb().prepare('SELECT * FROM issues ORDER BY number DESC').all());
}

export function getIssueBySlug(slug) {
  const row = getDb().prepare('SELECT * FROM issues WHERE slug = ?').get(slug);
  return row ? loadIssues([row])[0] : null;
}

export function getIssueById(id) {
  const row = getDb().prepare('SELECT * FROM issues WHERE id = ?').get(id);
  return row ? loadIssues([row])[0] : null;
}

export function nextIssueNumber() {
  return (getDb().prepare('SELECT MAX(number) m FROM issues').get().m || 0) + 1;
}

export function saveIssue(data, lecturerIds, photoIds, id = null) {
  const db = getDb();
  const now = nowIso();
  const row = {
    number: data.number,
    slug: data.slug,
    title_ru: data.title_ru,
    title_en: data.title_en || '',
    start_at: data.start_at,
    place_ru: data.place_ru || '',
    place_en: data.place_en || '',
    status_flag: data.status_flag || '',
    announce_ru: data.announce_ru || '',
    announce_en: data.announce_en || '',
    thought_ru: data.thought_ru || '',
    thought_en: data.thought_en || '',
    ideas: j.str(data.ideas),
    terms: j.str(data.terms),
    qa: j.str(data.qa),
    video_cut_url: data.video_cut_url || '',
    video_cut_len: data.video_cut_len || '',
    video_full_url: data.video_full_url || '',
    video_full_len: data.video_full_len || '',
    slides_id: data.slides_id || null,
    slides_ok: data.slides_ok ? 1 : 0,
    reads: j.str(data.reads),
    cover_id: data.cover_id || null,
    listeners: Number(data.listeners) || 0,
    note_author: data.note_author || '',
    checked: data.checked ? 1 : 0,
    reg_enabled: data.reg_enabled ? 1 : 0,
    reg_url: data.reg_url || '',
    autograph_id: data.autograph_id || null,
    tags: j.str(data.tags),
    show_rating: data.show_rating ? 1 : 0,
    publish_state: data.publish_state || 'draft',
    publish_at: data.publish_at || null,
    updated_at: now,
  };
  const write = db.transaction(() => {
    let issueId = id;
    if (id) {
      db.prepare(
        `UPDATE issues SET number=@number,slug=@slug,title_ru=@title_ru,title_en=@title_en,start_at=@start_at,place_ru=@place_ru,place_en=@place_en,
         status_flag=@status_flag,announce_ru=@announce_ru,announce_en=@announce_en,thought_ru=@thought_ru,thought_en=@thought_en,ideas=@ideas,
         terms=@terms,qa=@qa,video_cut_url=@video_cut_url,video_cut_len=@video_cut_len,video_full_url=@video_full_url,video_full_len=@video_full_len,
         slides_id=@slides_id,slides_ok=@slides_ok,reads=@reads,cover_id=@cover_id,listeners=@listeners,note_author=@note_author,checked=@checked,reg_enabled=@reg_enabled,
         reg_url=@reg_url,autograph_id=@autograph_id,tags=@tags,show_rating=@show_rating,publish_state=@publish_state,publish_at=@publish_at,
         updated_at=@updated_at WHERE id=@id`,
      ).run({ ...row, id });
    } else {
      const info = db
        .prepare(
          `INSERT INTO issues(number,slug,title_ru,title_en,start_at,place_ru,place_en,status_flag,announce_ru,announce_en,thought_ru,thought_en,ideas,terms,qa,
           video_cut_url,video_cut_len,video_full_url,video_full_len,slides_id,slides_ok,reads,cover_id,listeners,note_author,checked,reg_enabled,reg_url,autograph_id,
           tags,show_rating,publish_state,publish_at,updated_at,is_demo)
           VALUES(@number,@slug,@title_ru,@title_en,@start_at,@place_ru,@place_en,@status_flag,@announce_ru,@announce_en,@thought_ru,@thought_en,@ideas,@terms,@qa,
           @video_cut_url,@video_cut_len,@video_full_url,@video_full_len,@slides_id,@slides_ok,@reads,@cover_id,@listeners,@note_author,@checked,@reg_enabled,@reg_url,@autograph_id,
           @tags,@show_rating,@publish_state,@publish_at,@updated_at,@is_demo)`,
        )
        .run({ ...row, is_demo: data.is_demo ? 1 : 0 });
      issueId = Number(info.lastInsertRowid);
    }
    db.prepare('DELETE FROM issue_lecturers WHERE issue_id = ?').run(issueId);
    lecturerIds.forEach((lid, i) => db.prepare('INSERT INTO issue_lecturers(issue_id,lecturer_id,position) VALUES(?,?,?)').run(issueId, lid, i));
    db.prepare('DELETE FROM issue_photos WHERE issue_id = ?').run(issueId);
    photoIds.forEach((mid, i) => db.prepare('INSERT OR IGNORE INTO issue_photos(issue_id,media_id,position) VALUES(?,?,?)').run(issueId, mid, i));
    return issueId;
  });
  return write();
}

export function deleteIssue(id) {
  getDb().prepare('DELETE FROM issues WHERE id = ?').run(id);
}

/* ---------- public aggregates ---------- */

export function upcomingIssues(list = visibleIssues()) {
  return list.filter((i) => !i.past && i.status_flag !== 'cancelled').sort((a, b) => a.start_at.localeCompare(b.start_at));
}

export function pastIssues(list = visibleIssues()) {
  return list.filter((i) => i.past && i.status_flag !== 'cancelled').sort((a, b) => b.number - a.number);
}

export function ratingStats() {
  const rows = getDb()
    .prepare("SELECT issue_id, AVG(rating) avg, COUNT(rating) n FROM feedback WHERE type='review' AND rating IS NOT NULL AND issue_id IS NOT NULL GROUP BY issue_id")
    .all();
  return new Map(rows.map((r) => [r.issue_id, { avg: r.avg, n: r.n }]));
}

export function siteStats(settings, issues = visibleIssues()) {
  const past = issues.filter((i) => i.past && i.status_flag !== 'cancelled');
  const listeners = past.reduce((a, i) => a + (i.listeners || 0), 0);
  const conf = latestConference();
  const regionsAuto = conf ? conf.regions.length : 0;
  const pick = (override, auto) => (override && String(override).trim() ? String(override).trim() : auto ? String(auto) : '');
  return {
    lectures: pick(settings.stat_lectures, past.length),
    listeners: pick(settings.stat_listeners, listeners),
    regions: pick(settings.stat_regions, regionsAuto),
  };
}

/* ---------- conferences ---------- */

function hydrateConference(row) {
  if (!row) return null;
  const db = getDb();
  const juryIds = db.prepare('SELECT lecturer_id FROM conference_jury WHERE conference_id = ? ORDER BY position').all(row.id).map((r) => r.lecturer_id);
  const photoIds = db.prepare('SELECT media_id FROM conference_photos WHERE conference_id = ? ORDER BY position').all(row.id).map((r) => r.media_id);
  const posters = j.parse(row.posters);
  const media = mediaByIds([...photoIds, row.cover_id, ...posters.map((p) => p.media_id)]);
  const jury = juryIds.map((id) => getLecturerById(id)).filter(Boolean);
  const cover = media.get(row.cover_id) || null;
  return {
    ...row,
    program: j.parse(row.program),
    regions: j.parse(row.regions),
    posters: posters.map((p) => ({ ...p, media: publicMedia(media.get(p.media_id)), mediaRaw: media.get(p.media_id) || null })),
    jury,
    juryIds,
    cover: photoPublishable(cover) ? cover : null,
    coverRaw: cover,
    photosAll: photoIds.map((id) => media.get(id)).filter(Boolean),
    photos: photoIds.map((id) => media.get(id)).filter(photoPublishable),
  };
}

export function listConferences({ publishedOnly = true } = {}) {
  const rows = getDb()
    .prepare(`SELECT * FROM conferences ${publishedOnly ? 'WHERE published = 1' : ''} ORDER BY year DESC`)
    .all();
  return rows.map(hydrateConference);
}

export function latestConference() {
  return listConferences({ publishedOnly: true })[0] || null;
}

export function getConferenceByYear(year) {
  return hydrateConference(getDb().prepare('SELECT * FROM conferences WHERE year = ?').get(year));
}

export function getConferenceById(id) {
  return hydrateConference(getDb().prepare('SELECT * FROM conferences WHERE id = ?').get(id));
}

export function saveConference(data, juryIds, photoIds, id = null) {
  const db = getDb();
  const row = {
    year: data.year,
    title_ru: data.title_ru || 'National Letovo Engineers',
    title_en: data.title_en || 'National Letovo Engineers',
    date_start: data.date_start || null,
    date_end: data.date_end || null,
    place_ru: data.place_ru || '',
    place_en: data.place_en || '',
    intro_ru: data.intro_ru || '',
    intro_en: data.intro_en || '',
    program: j.str(data.program),
    regions: j.str(data.regions),
    posters: j.str(data.posters),
    results_ru: data.results_ru || '',
    results_en: data.results_en || '',
    cover_id: data.cover_id || null,
    published: data.published ? 1 : 0,
    updated_at: nowIso(),
  };
  return db.transaction(() => {
    let cid = id;
    if (id) {
      db.prepare(
        `UPDATE conferences SET year=@year,title_ru=@title_ru,title_en=@title_en,date_start=@date_start,date_end=@date_end,place_ru=@place_ru,place_en=@place_en,
         intro_ru=@intro_ru,intro_en=@intro_en,program=@program,regions=@regions,posters=@posters,results_ru=@results_ru,results_en=@results_en,
         cover_id=@cover_id,published=@published,updated_at=@updated_at WHERE id=@id`,
      ).run({ ...row, id });
    } else {
      const info = db
        .prepare(
          `INSERT INTO conferences(year,title_ru,title_en,date_start,date_end,place_ru,place_en,intro_ru,intro_en,program,regions,posters,results_ru,results_en,cover_id,published,updated_at,is_demo)
           VALUES(@year,@title_ru,@title_en,@date_start,@date_end,@place_ru,@place_en,@intro_ru,@intro_en,@program,@regions,@posters,@results_ru,@results_en,@cover_id,@published,@updated_at,@is_demo)`,
        )
        .run({ ...row, is_demo: data.is_demo ? 1 : 0 });
      cid = Number(info.lastInsertRowid);
    }
    db.prepare('DELETE FROM conference_jury WHERE conference_id = ?').run(cid);
    juryIds.forEach((lid, i) => db.prepare('INSERT OR IGNORE INTO conference_jury(conference_id,lecturer_id,position) VALUES(?,?,?)').run(cid, lid, i));
    db.prepare('DELETE FROM conference_photos WHERE conference_id = ?').run(cid);
    photoIds.forEach((mid, i) => db.prepare('INSERT OR IGNORE INTO conference_photos(conference_id,media_id,position) VALUES(?,?,?)').run(cid, mid, i));
    return cid;
  })();
}

export function deleteConference(id) {
  getDb().prepare('DELETE FROM conferences WHERE id = ?').run(id);
}

/* ---------- team ---------- */

export function listTeam({ activeOnly = true } = {}) {
  const rows = getDb()
    .prepare(`SELECT * FROM team ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY kind = 'helper', position, id`)
    .all();
  const media = mediaByIds(rows.map((r) => r.photo_id));
  return rows.map((r) => ({ ...r, links: j.parse(r.links), photo: publicMedia(media.get(r.photo_id)), photoRaw: media.get(r.photo_id) || null }));
}

export function getTeamMember(id) {
  return listTeam({ activeOnly: false }).find((m) => m.id === Number(id)) || null;
}

export function saveTeamMember(data, id = null) {
  const db = getDb();
  const row = {
    kind: data.kind === 'helper' ? 'helper' : 'founder',
    name_ru: data.name_ru,
    name_en: data.name_en || '',
    role_ru: data.role_ru || '',
    role_en: data.role_en || '',
    photo_id: data.photo_id || null,
    bio_ru: data.bio_ru || '',
    bio_en: data.bio_en || '',
    links: j.str(data.links),
    position: Number(data.position) || 0,
    alumni: data.alumni ? 1 : 0,
    active: data.active === false || data.active === 0 ? 0 : 1,
  };
  if (id) {
    db.prepare(
      `UPDATE team SET kind=@kind,name_ru=@name_ru,name_en=@name_en,role_ru=@role_ru,role_en=@role_en,photo_id=@photo_id,bio_ru=@bio_ru,bio_en=@bio_en,
       links=@links,position=@position,alumni=@alumni,active=@active WHERE id=@id`,
    ).run({ ...row, id });
    return id;
  }
  const info = db
    .prepare(
      `INSERT INTO team(kind,name_ru,name_en,role_ru,role_en,photo_id,bio_ru,bio_en,links,position,alumni,active,is_demo)
       VALUES(@kind,@name_ru,@name_en,@role_ru,@role_en,@photo_id,@bio_ru,@bio_en,@links,@position,@alumni,@active,@is_demo)`,
    )
    .run({ ...row, is_demo: data.is_demo ? 1 : 0 });
  return Number(info.lastInsertRowid);
}

export function deleteTeamMember(id) {
  getDb().prepare('DELETE FROM team WHERE id = ?').run(id);
}

/* ---------- feedback ---------- */

export function insertFeedback(f) {
  const info = getDb()
    .prepare(
      `INSERT INTO feedback(type,issue_id,rating,good,better,next_topic,grade,question,what,why,name,contact,message,kind,page_url,consent,consent_at,consent_ip,due_at,is_demo)
       VALUES(@type,@issue_id,@rating,@good,@better,@next_topic,@grade,@question,@what,@why,@name,@contact,@message,@kind,@page_url,@consent,@consent_at,@consent_ip,@due_at,@is_demo)`,
    )
    .run({
      type: f.type,
      issue_id: f.issue_id || null,
      rating: f.rating ?? null,
      good: f.good || '',
      better: f.better || '',
      next_topic: f.next_topic || '',
      grade: f.grade || '',
      question: f.question || '',
      what: f.what || '',
      why: f.why || '',
      name: f.name || '',
      contact: f.contact || '',
      message: f.message || '',
      kind: f.kind || '',
      page_url: f.page_url || '',
      consent: f.consent ? 1 : 0,
      consent_at: f.consent ? nowIso() : null,
      consent_ip: f.consent ? f.consent_ip || '' : null,
      due_at: f.due_at || null,
      is_demo: f.is_demo ? 1 : 0,
    });
  return Number(info.lastInsertRowid);
}

export function listFeedback({ type = '', status = '', issueId = 0, limit = 500 } = {}) {
  const where = [];
  const args = [];
  if (type) {
    where.push('f.type = ?');
    args.push(type);
  }
  if (status) {
    where.push('f.status = ?');
    args.push(status);
  }
  if (issueId) {
    where.push('f.issue_id = ?');
    args.push(issueId);
  }
  return getDb()
    .prepare(
      `SELECT f.*, i.number AS issue_number, i.title_ru AS issue_title FROM feedback f
       LEFT JOIN issues i ON i.id = f.issue_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY f.id DESC LIMIT ?`,
    )
    .all(...args, limit);
}

export function getFeedback(id) {
  return getDb().prepare('SELECT f.*, i.number AS issue_number, i.title_ru AS issue_title FROM feedback f LEFT JOIN issues i ON i.id=f.issue_id WHERE f.id = ?').get(id);
}

export function updateFeedback(id, { status, note }) {
  const sets = [];
  const vals = { id };
  if (status && ['new', 'in_progress', 'closed'].includes(status)) {
    sets.push('status=@status');
    vals.status = status;
  }
  if (note !== undefined) {
    sets.push('note=@note');
    vals.note = String(note).slice(0, 2000);
  }
  if (sets.length) getDb().prepare(`UPDATE feedback SET ${sets.join(',')} WHERE id=@id`).run(vals);
}

export function deleteFeedback(id) {
  getDb().prepare('DELETE FROM feedback WHERE id = ?').run(id);
}

export function feedbackCounts() {
  const rows = getDb().prepare("SELECT type, status, COUNT(*) n FROM feedback GROUP BY type, status").all();
  const out = { new: 0, photoNew: 0, total: 0 };
  for (const r of rows) {
    out.total += r.n;
    if (r.status === 'new') out.new += r.n;
    if (r.type === 'photo_removal' && r.status !== 'closed') out.photoNew += r.n;
  }
  return out;
}

/* ---------- users ---------- */

export function listUsers() {
  return getDb().prepare('SELECT id,email,name,role,active,created_at,last_login FROM users ORDER BY id').all();
}

/* ---------- news ---------- */

function hydrateNews(row, media) {
  return { ...row, tags: j.parse(row.tags), image: publicMedia(media.get(row.image_id)), imageRaw: media.get(row.image_id) || null };
}

// Automatic items exist in one language only and are shown on that language's pages; hand-made ones fall back to Russian.
function newsWhere({ publishedOnly, lang }) {
  const cond = [];
  if (publishedOnly) cond.push('published = 1');
  if (lang === 'en') cond.push("(auto = 0 OR title_en != '')");
  if (lang === 'ru') cond.push("(auto = 0 OR title_ru != '')");
  return cond.length ? `WHERE ${cond.join(' AND ')}` : '';
}

export function countNews({ publishedOnly = true, lang = '' } = {}) {
  return getDb().prepare(`SELECT COUNT(*) c FROM news ${newsWhere({ publishedOnly, lang })}`).get().c;
}

export function listNews({ publishedOnly = true, limit = 200, offset = 0, lang = '' } = {}) {
  const rows = getDb()
    .prepare(`SELECT * FROM news ${newsWhere({ publishedOnly, lang })} ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(limit, offset);
  const media = mediaByIds(rows.map((r) => r.image_id));
  return rows.map((r) => hydrateNews(r, media));
}

export function getNewsById(id) {
  const row = getDb().prepare('SELECT * FROM news WHERE id = ?').get(id);
  return row ? hydrateNews(row, mediaByIds([row.image_id])) : null;
}

export function saveNews(data, id = null) {
  const db = getDb();
  const row = {
    slug: data.slug,
    title_ru: data.title_ru,
    title_en: data.title_en || '',
    summary_ru: data.summary_ru || '',
    summary_en: data.summary_en || '',
    source_name: data.source_name || '',
    source_url: data.source_url || '',
    published_at: data.published_at,
    tags: j.str(data.tags),
    image_id: data.image_id || null,
    published: data.published === false || data.published === 0 ? 0 : 1,
    updated_at: nowIso(),
  };
  if (id) {
    db.prepare(
      `UPDATE news SET slug=@slug,title_ru=@title_ru,title_en=@title_en,summary_ru=@summary_ru,summary_en=@summary_en,source_name=@source_name,
       source_url=@source_url,published_at=@published_at,tags=@tags,image_id=@image_id,published=@published,updated_at=@updated_at,auto=0 WHERE id=@id`,
    ).run({ ...row, id });
    return id;
  }
  const info = db
    .prepare(
      `INSERT INTO news(slug,title_ru,title_en,summary_ru,summary_en,source_name,source_url,published_at,tags,image_id,published,updated_at,is_demo)
       VALUES(@slug,@title_ru,@title_en,@summary_ru,@summary_en,@source_name,@source_url,@published_at,@tags,@image_id,@published,@updated_at,@is_demo)`,
    )
    .run({ ...row, is_demo: data.is_demo ? 1 : 0 });
  return Number(info.lastInsertRowid);
}

// An automatic item is only hidden: deleting the row would let the next feed run bring it back.
export function deleteNews(id) {
  const db = getDb();
  const row = db.prepare('SELECT auto FROM news WHERE id = ?').get(id);
  if (row?.auto) db.prepare('UPDATE news SET published = 0, updated_at = ? WHERE id = ?').run(nowIso(), id);
  else db.prepare('DELETE FROM news WHERE id = ?').run(id);
}
