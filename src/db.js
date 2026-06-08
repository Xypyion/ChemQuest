/**
 * Tiny zero-dependency JSON document store.
 * Keeps everything in memory and writes atomically to data/db.json on each
 * mutation. Perfectly adequate for a single classroom's worth of students,
 * and it avoids any native build steps so `npm install` always "just works".
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DATA = { users: [], lessons: [], meta: { version: 1 } };

let data = null;

function ensureLoaded() {
  if (data) return;
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      data = JSON.parse(raw || '{}');
    } else {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      data = JSON.parse(JSON.stringify(DEFAULT_DATA));
      persist();
    }
  } catch (err) {
    console.error('[db] Failed to load db.json, starting fresh:', err.message);
    data = JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
  data.users = data.users || [];
  data.lessons = data.lessons || [];
  data.meta = data.meta || { version: 1 };
}

function persist() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

const db = {
  /** Return the raw array for a collection (live reference). */
  all(collection) {
    ensureLoaded();
    return data[collection] || (data[collection] = []);
  },

  find(collection, predicate) {
    return db.all(collection).find(predicate);
  },

  filter(collection, predicate) {
    return db.all(collection).filter(predicate);
  },

  findById(collection, id) {
    return db.all(collection).find((d) => d.id === id);
  },

  insert(collection, doc) {
    db.all(collection).push(doc);
    persist();
    return doc;
  },

  /** Apply a shallow patch to a document by id and persist. */
  update(collection, id, patch) {
    const doc = db.findById(collection, id);
    if (!doc) return null;
    Object.assign(doc, patch);
    persist();
    return doc;
  },

  remove(collection, id) {
    const arr = db.all(collection);
    const idx = arr.findIndex((d) => d.id === id);
    if (idx === -1) return false;
    arr.splice(idx, 1);
    persist();
    return true;
  },

  /** Persist after mutating documents directly via references. */
  save() {
    persist();
  },
};

module.exports = db;
