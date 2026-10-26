// Schema migrations. Append new entries only; never edit shipped ones.
// Applied in order, version is kept in PRAGMA user_version.

export const migrations = [
  /* 1: initial schema */
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('editor','admin')),
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    last_login    TEXT
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf       TEXT NOT NULL,
    ip         TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE media (
    id         INTEGER PRIMARY KEY,
    kind       TEXT NOT NULL CHECK (kind IN ('image','pdf','video')),
    base       TEXT NOT NULL UNIQUE,
    ext        TEXT NOT NULL DEFAULT '',
    width      INTEGER,
    height     INTEGER,
    bytes      INTEGER NOT NULL DEFAULT 0,
    widths     TEXT NOT NULL DEFAULT '[]',
    orig_name  TEXT NOT NULL DEFAULT '',
    alt        TEXT NOT NULL DEFAULT '',
    credit     TEXT NOT NULL DEFAULT '',
    caption    TEXT NOT NULL DEFAULT '',
    consent    TEXT NOT NULL DEFAULT 'pending' CHECK (consent IN ('pending','yes','no','general')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    is_demo    INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE lecturers (
    id          INTEGER PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    name_ru     TEXT NOT NULL,
    name_en     TEXT NOT NULL DEFAULT '',
    portrait_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
    role_ru     TEXT NOT NULL DEFAULT '',
    role_en     TEXT NOT NULL DEFAULT '',
    org_ru      TEXT NOT NULL DEFAULT '',
    org_en      TEXT NOT NULL DEFAULT '',
    area        TEXT NOT NULL DEFAULT '',
    area_en     TEXT NOT NULL DEFAULT '',
    bio_ru      TEXT NOT NULL DEFAULT '',
    bio_en      TEXT NOT NULL DEFAULT '',
    facts_ru    TEXT NOT NULL DEFAULT '[]',
    facts_en    TEXT NOT NULL DEFAULT '[]',
    links       TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    is_demo     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE issues (
    id             INTEGER PRIMARY KEY,
    number         INTEGER NOT NULL UNIQUE,
    slug           TEXT NOT NULL UNIQUE,
    title_ru       TEXT NOT NULL,
    title_en       TEXT NOT NULL DEFAULT '',
    start_at       TEXT NOT NULL,
    place_ru       TEXT NOT NULL DEFAULT '',
    place_en       TEXT NOT NULL DEFAULT '',
    status_flag    TEXT NOT NULL DEFAULT '' CHECK (status_flag IN ('','moved','cancelled','sold_out')),
    announce_ru    TEXT NOT NULL DEFAULT '',
    announce_en    TEXT NOT NULL DEFAULT '',
    thought_ru     TEXT NOT NULL DEFAULT '',
    thought_en     TEXT NOT NULL DEFAULT '',
    ideas          TEXT NOT NULL DEFAULT '[]',
    terms          TEXT NOT NULL DEFAULT '[]',
    qa             TEXT NOT NULL DEFAULT '[]',
    video_cut_url  TEXT NOT NULL DEFAULT '',
    video_cut_len  TEXT NOT NULL DEFAULT '',
    video_full_url TEXT NOT NULL DEFAULT '',
    video_full_len TEXT NOT NULL DEFAULT '',
    slides_id      INTEGER REFERENCES media(id) ON DELETE SET NULL,
    reads          TEXT NOT NULL DEFAULT '[]',
    cover_id       INTEGER REFERENCES media(id) ON DELETE SET NULL,
    listeners      INTEGER NOT NULL DEFAULT 0,
    note_author    TEXT NOT NULL DEFAULT '',
    checked        INTEGER NOT NULL DEFAULT 0,
    reg_enabled    INTEGER NOT NULL DEFAULT 0,
    reg_url        TEXT NOT NULL DEFAULT '',
    autograph_id   INTEGER REFERENCES media(id) ON DELETE SET NULL,
    tags           TEXT NOT NULL DEFAULT '[]',
    show_rating    INTEGER NOT NULL DEFAULT 0,
    publish_state  TEXT NOT NULL DEFAULT 'draft' CHECK (publish_state IN ('draft','scheduled','published')),
    publish_at     TEXT,
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    is_demo        INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX issues_start ON issues(start_at);

  CREATE TABLE issue_lecturers (
    issue_id    INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    lecturer_id INTEGER NOT NULL REFERENCES lecturers(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (issue_id, lecturer_id)
  );

  CREATE TABLE issue_photos (
    issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (issue_id, media_id)
  );

  CREATE TABLE conferences (
    id          INTEGER PRIMARY KEY,
    year        INTEGER NOT NULL UNIQUE,
    title_ru    TEXT NOT NULL DEFAULT 'National Letovo Engineers',
    title_en    TEXT NOT NULL DEFAULT 'National Letovo Engineers',
    date_start  TEXT,
    date_end    TEXT,
    place_ru    TEXT NOT NULL DEFAULT '',
    place_en    TEXT NOT NULL DEFAULT '',
    intro_ru    TEXT NOT NULL DEFAULT '',
    intro_en    TEXT NOT NULL DEFAULT '',
    program     TEXT NOT NULL DEFAULT '[]',
    regions     TEXT NOT NULL DEFAULT '[]',
    posters     TEXT NOT NULL DEFAULT '[]',
    results_ru  TEXT NOT NULL DEFAULT '',
    results_en  TEXT NOT NULL DEFAULT '',
    cover_id    INTEGER REFERENCES media(id) ON DELETE SET NULL,
    published   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    is_demo     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE conference_jury (
    conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
    lecturer_id   INTEGER NOT NULL REFERENCES lecturers(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (conference_id, lecturer_id)
  );

  CREATE TABLE conference_photos (
    conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
    media_id      INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (conference_id, media_id)
  );

  CREATE TABLE team (
    id        INTEGER PRIMARY KEY,
    kind      TEXT NOT NULL DEFAULT 'founder' CHECK (kind IN ('founder','helper')),
    name_ru   TEXT NOT NULL,
    name_en   TEXT NOT NULL DEFAULT '',
    role_ru   TEXT NOT NULL DEFAULT '',
    role_en   TEXT NOT NULL DEFAULT '',
    photo_id  INTEGER REFERENCES media(id) ON DELETE SET NULL,
    bio_ru    TEXT NOT NULL DEFAULT '',
    bio_en    TEXT NOT NULL DEFAULT '',
    links     TEXT NOT NULL DEFAULT '[]',
    position  INTEGER NOT NULL DEFAULT 0,
    alumni    INTEGER NOT NULL DEFAULT 0,
    active    INTEGER NOT NULL DEFAULT 1,
    is_demo   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE feedback (
    id          INTEGER PRIMARY KEY,
    type        TEXT NOT NULL CHECK (type IN ('review','question','suggest','contact','photo_removal')),
    issue_id    INTEGER REFERENCES issues(id) ON DELETE SET NULL,
    rating      INTEGER,
    good        TEXT NOT NULL DEFAULT '',
    better      TEXT NOT NULL DEFAULT '',
    next_topic  TEXT NOT NULL DEFAULT '',
    grade       TEXT NOT NULL DEFAULT '',
    question    TEXT NOT NULL DEFAULT '',
    what        TEXT NOT NULL DEFAULT '',
    why         TEXT NOT NULL DEFAULT '',
    name        TEXT NOT NULL DEFAULT '',
    contact     TEXT NOT NULL DEFAULT '',
    message     TEXT NOT NULL DEFAULT '',
    kind        TEXT NOT NULL DEFAULT '',
    page_url    TEXT NOT NULL DEFAULT '',
    consent     INTEGER NOT NULL DEFAULT 0,
    consent_at  TEXT,
    consent_ip  TEXT,
    status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','closed')),
    note        TEXT NOT NULL DEFAULT '',
    due_at      TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    is_demo     INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX feedback_type ON feedback(type, status);
  CREATE INDEX feedback_issue ON feedback(issue_id);
  `,

  /* 2: lecturer permission to publish slides */
  `ALTER TABLE issues ADD COLUMN slides_ok INTEGER NOT NULL DEFAULT 0;`,

  /* 3: science news (short items with a link to the source) */
  `
  CREATE TABLE news (
    id           INTEGER PRIMARY KEY,
    slug         TEXT NOT NULL UNIQUE,
    title_ru     TEXT NOT NULL,
    title_en     TEXT NOT NULL DEFAULT '',
    summary_ru   TEXT NOT NULL DEFAULT '',
    summary_en   TEXT NOT NULL DEFAULT '',
    source_name  TEXT NOT NULL DEFAULT '',
    source_url   TEXT NOT NULL DEFAULT '',
    published_at TEXT NOT NULL,
    tags         TEXT NOT NULL DEFAULT '[]',
    image_id     INTEGER REFERENCES media(id) ON DELETE SET NULL,
    published    INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    is_demo      INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX news_date ON news(published_at);
  `,

  /* 4: news that arrive from public RSS feeds (auto = 1) are told apart and never imported twice */
  `
  ALTER TABLE news ADD COLUMN external_id TEXT;
  ALTER TABLE news ADD COLUMN auto INTEGER NOT NULL DEFAULT 0;
  CREATE UNIQUE INDEX news_external ON news(external_id) WHERE external_id IS NOT NULL;
  `,

  /* 5: material on the lecture topic (a popular-science retelling, Markdown), shown under the issue in RU and EN */
  `
  ALTER TABLE issues ADD COLUMN material_ru TEXT NOT NULL DEFAULT '';
  ALTER TABLE issues ADD COLUMN material_en TEXT NOT NULL DEFAULT '';
  `,
];
