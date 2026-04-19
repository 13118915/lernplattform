// ========================================================================
//  db.js — SQLite im Browser via sql.js + IndexedDB Persistenz
// ========================================================================

const DB_NAME = 'lernplattform';
const DB_STORE = 'sqlitedb';
const DB_KEY = 'main';

let _db = null;
let _SQL = null;
let _saveTimeout = null;

// ---------- IndexedDB Helpers ----------

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadFromIDB() {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(DB_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function saveToIDB(data) {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(data, DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Schema ----------

const SCHEMA = `
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  color_soft TEXT,
  icon TEXT,
  version INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  methode TEXT
);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  color_soft TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS merkwissen (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id TEXT NOT NULL REFERENCES topics(id),
  heading TEXT,
  tip TEXT,
  items TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id),
  question TEXT NOT NULL,
  options TEXT NOT NULL,
  correct_index INTEGER NOT NULL,
  explanation TEXT,
  fill_prompt TEXT,
  fill_answer TEXT,
  fill_hint TEXT,
  fill_accept TEXT,
  fill_case_sensitive INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS card_stats (
  question_id TEXT PRIMARY KEY REFERENCES questions(id),
  seen INTEGER DEFAULT 0,
  correct INTEGER DEFAULT 0,
  wrong INTEGER DEFAULT 0,
  confident_wrong INTEGER DEFAULT 0,
  last_seen INTEGER DEFAULT 0,
  mc_seen INTEGER DEFAULT 0,
  mc_correct INTEGER DEFAULT 0,
  fill_seen INTEGER DEFAULT 0,
  fill_correct INTEGER DEFAULT 0,
  stability REAL DEFAULT 0,
  difficulty REAL DEFAULT 0,
  due INTEGER DEFAULT 0,
  reps INTEGER DEFAULT 0,
  lapses INTEGER DEFAULT 0,
  state TEXT DEFAULT 'new',
  last_review INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id TEXT REFERENCES subjects(id),
  mode TEXT NOT NULL,
  sub_mode TEXT,
  topic_id TEXT,
  score INTEGER,
  total INTEGER,
  timestamp INTEGER DEFAULT (strftime('%s','now') * 1000)
);
`;

// ---------- Init ----------

export async function initDB() {
  // Load sql.js WASM
  _SQL = await initSqlJs({
    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.11.0/${file}`
  });

  // Try to load existing DB from IndexedDB
  const saved = await loadFromIDB();
  if (saved) {
    _db = new _SQL.Database(new Uint8Array(saved));
  } else {
    _db = new _SQL.Database();
  }

  // Ensure schema exists
  _db.run(SCHEMA);
  persist();
  return _db;
}

// ---------- Persistence ----------

export function persist() {
  if (!_db) return;
  // Debounce: save at most every 500ms
  if (_saveTimeout) clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(async () => {
    const data = _db.export();
    await saveToIDB(data.buffer);
  }, 500);
}

export function persistNow() {
  if (!_db) return Promise.resolve();
  if (_saveTimeout) clearTimeout(_saveTimeout);
  const data = _db.export();
  return saveToIDB(data.buffer);
}

// ---------- Query Helpers ----------

export function run(sql, params = []) {
  _db.run(sql, params);
  persist();
}

export function get(sql, params = []) {
  const stmt = _db.prepare(sql);
  stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

export function all(sql, params = []) {
  const stmt = _db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

export function exec(sql) {
  _db.exec(sql);
  persist();
}

// ---------- Subject Loading ----------

export function loadSubjectData(data) {
  // Check if subject already exists with same version
  const existing = get('SELECT version FROM subjects WHERE id = ?', [data.id]);
  if (existing && existing.version >= data.version) return false;

  // Migration: add methode column if upgrading from an older schema
  try { _db.run('ALTER TABLE subjects ADD COLUMN methode TEXT'); } catch (e) { /* column already exists */ }

  // Upsert subject
  run(`INSERT OR REPLACE INTO subjects (id, name, description, color, color_soft, icon, version, sort_order, methode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.id, data.name, data.description || '', data.color || '', data.colorSoft || '',
     data.icon || '', data.version || 1, data.sortOrder || 0, data.methode || null]);

  // Load topics and questions
  let topicIdx = 0;
  for (const topic of data.topics) {
    const topicId = data.id + '_' + topic.id;

    run(`INSERT OR REPLACE INTO topics (id, subject_id, name, description, color, color_soft, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [topicId, data.id, topic.name, topic.desc || '', topic.color || data.color || '',
       topic.colorSoft || data.colorSoft || '', topicIdx]);

    // Merkwissen — delete old, insert new
    run('DELETE FROM merkwissen WHERE topic_id = ?', [topicId]);
    if (topic.merkwissen) {
      topic.merkwissen.forEach((mw, i) => {
        run(`INSERT INTO merkwissen (topic_id, heading, tip, items, sort_order)
             VALUES (?, ?, ?, ?, ?)`,
          [topicId, mw.h || null, mw.tip || null, mw.items ? JSON.stringify(mw.items) : null, i]);
      });
    }

    // Questions — delete old, insert new (preserves card_stats via question_id)
    run('DELETE FROM questions WHERE topic_id = ?', [topicId]);
    topic.questions.forEach((q, i) => {
      const qId = topicId + '_' + i;
      run(`INSERT INTO questions (id, topic_id, question, options, correct_index, explanation,
           fill_prompt, fill_answer, fill_hint, fill_accept, fill_case_sensitive)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [qId, topicId, q.q, JSON.stringify(q.opts), q.correct, q.exp || '',
         q.fill ? q.fill.prompt : null, q.fill ? q.fill.answer : null,
         q.fill ? (q.fill.hint || null) : null,
         q.fill && q.fill.accept ? JSON.stringify(q.fill.accept) : null,
         q.fill && q.fill.caseSensitive ? 1 : 0]);
    });

    topicIdx++;
  }

  persist();
  return true;
}

// ---------- Card Stats ----------

export function ensureCardStats(questionId) {
  const exists = get('SELECT question_id FROM card_stats WHERE question_id = ?', [questionId]);
  if (!exists) {
    run(`INSERT INTO card_stats (question_id) VALUES (?)`, [questionId]);
  }
}

export function getCardStats(questionId) {
  ensureCardStats(questionId);
  return get('SELECT * FROM card_stats WHERE question_id = ?', [questionId]);
}

export function updateCardStats(questionId, updates) {
  ensureCardStats(questionId);
  const keys = Object.keys(updates);
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const vals = keys.map(k => updates[k]);
  vals.push(questionId);
  run(`UPDATE card_stats SET ${sets} WHERE question_id = ?`, vals);
}

// ---------- Migration from localStorage ----------

export function migrateFromLocalStorage() {
  const STATS_KEY = 'deutschApp3';
  const raw = localStorage.getItem(STATS_KEY);
  if (!raw) return false;

  try {
    const stats = JSON.parse(raw);
    let migrated = 0;

    for (const [qId, s] of Object.entries(stats)) {
      // Map old IDs to new format: 'komma_0' → 'deutsch_komma_0'
      const newId = qId.startsWith('deutsch_') ? qId : 'deutsch_' + qId;

      // Check if question exists
      const q = get('SELECT id FROM questions WHERE id = ?', [newId]);
      if (!q) continue;

      ensureCardStats(newId);
      updateCardStats(newId, {
        seen: s.seen || 0,
        correct: s.correct || 0,
        wrong: s.wrong || 0,
        confident_wrong: s.confidentWrong || 0,
        last_seen: s.lastSeen || 0,
        mc_seen: s.formats?.mc?.seen || 0,
        mc_correct: s.formats?.mc?.correct || 0,
        fill_seen: s.formats?.fill?.seen || 0,
        fill_correct: s.formats?.fill?.correct || 0,
        stability: s.stability || 0,
        difficulty: s.difficulty || 0,
        due: s.due || 0,
        reps: s.reps || 0,
        lapses: s.lapses || 0,
        state: s.state || 'new',
        last_review: s.lastReview || s.lastSeen || 0
      });
      migrated++;
    }

    // Remove old localStorage data after successful migration
    localStorage.removeItem(STATS_KEY);
    console.log(`Migrated ${migrated} card stats from localStorage to SQLite`);
    persist();
    return true;
  } catch (e) {
    console.error('Migration failed:', e);
    return false;
  }
}

// ---------- Export for backup ----------

export async function exportDB() {
  if (!_db) return null;
  return _db.export();
}
