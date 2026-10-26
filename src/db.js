import Database from 'better-sqlite3';
import { config, ensureDirs } from './config.js';
import { migrations } from './migrations.js';

let db;

export function openDb(file = config.dbPath) {
  if (file !== ':memory:') ensureDirs();
  const conn = new Database(file);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  conn.pragma('busy_timeout = 5000');
  migrate(conn);
  return conn;
}

function migrate(conn) {
  const current = conn.pragma('user_version', { simple: true });
  for (let v = current; v < migrations.length; v++) {
    conn.transaction(() => {
      conn.exec(migrations[v]);
      conn.pragma(`user_version = ${v + 1}`);
    })();
  }
}

export function getDb() {
  if (!db) db = openDb();
  return db;
}

/** Replace the shared connection (tests use an in-memory DB). */
export function setDb(conn) {
  db = conn;
}

export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

export const j = {
  parse(text, fallback = []) {
    if (text == null || text === '') return fallback;
    try {
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  },
  str: (value) => JSON.stringify(value ?? []),
};
