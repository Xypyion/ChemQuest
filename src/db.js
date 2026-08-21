/**
 * ChemQuest document store.
 *
 * Keeps the whole database in memory (so every read stays synchronous and the
 * route code reads exactly as it always has) and persists it to one of two
 * backends:
 *
 *   • **file**     — `data/db.json`, atomic tmp+rename. The default, used for
 *                    local development and any host with a real disk.
 *   • **postgres** — one row per document in `chemquest_docs`. Selected
 *                    automatically when `DATABASE_URL` is set.
 *
 * Why Postgres: serverless hosts (Vercel, Netlify Functions, Lambda) give the
 * function a **read-only filesystem**, so `fs.writeFileSync` throws `EROFS`.
 * Every save then returned a 500 while the in-memory copy kept the change —
 * which looked like "it saved after a refresh" and then silently reset when the
 * instance recycled. See docs/KNOWN-ISSUE-vercel-persistence.md.
 *
 * The mutating helpers (insert/update/remove/save) stay **synchronous**: they
 * change memory and mark the store dirty. The actual durable write happens in
 * `flush()`, which `server.js` awaits *before* sending a response — so the
 * client never sees a success it did not get.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DATA = { users: [], lessons: [], meta: { version: 1 } };

/** `meta` is a plain object, not a collection; it gets its own pseudo-collection. */
const META_COLLECTION = '__meta__';
const META_ID = 'meta';
const KEY_SEP = '|';

let data = null;
/** key -> the exact JSON we last persisted, so flush() only writes what changed. */
let snapshot = new Map();
let dirty = false;
let loaded = false;
let loadPromise = null;
/** Serialises load/flush so two concurrent requests can't interleave them. */
let queue = Promise.resolve();

const docKey = (collection, id) => collection + KEY_SEP + id;

/* ------------------------------------------------------------------ *
 * Backends
 * ------------------------------------------------------------------ */

function makeFileBackend() {
  return {
    name: 'file',
    supportsSyncLoad: true,
    async init() {},
    loadSync() {
      if (!fs.existsSync(DB_FILE)) return null;
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(raw || '{}');
    },
    async load() {
      return this.loadSync();
    },
    /** The file backend rewrites the whole document; `ops` is not needed. */
    async write() {
      writeFileSync();
    },
    writeSync() {
      writeFileSync();
    },
    async close() {},
  };
}

function writeFileSync() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function makePgBackend(connectionString) {
  const { Pool } = require('pg');

  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  const pool = new Pool({
    connectionString,
    // Serverless instances are short-lived and numerous; keep the footprint small.
    max: Number(process.env.PGPOOL_MAX || 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    // Managed Postgres (Neon, Supabase, Vercel) requires TLS but uses certs the
    // default trust store doesn't carry.
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  pool.on('error', (err) => console.error('[db] idle pg client error:', err.message));

  let initialised = false;

  return {
    name: 'postgres',
    supportsSyncLoad: false,

    async init() {
      if (initialised) return;
      await pool.query(`
        CREATE TABLE IF NOT EXISTS chemquest_docs (
          collection  text        NOT NULL,
          id          text        NOT NULL,
          seq         bigserial   NOT NULL,
          data        jsonb       NOT NULL,
          updated_at  timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (collection, id)
        )
      `);
      // Insertion order is meaningful (feed order, gradebook columns, lesson list).
      await pool.query(
        'CREATE INDEX IF NOT EXISTS chemquest_docs_seq_idx ON chemquest_docs (collection, seq)'
      );
      initialised = true;
    },

    async load() {
      await this.init();
      const { rows } = await pool.query(
        'SELECT collection, id, data FROM chemquest_docs ORDER BY collection, seq'
      );
      if (!rows.length) return null;
      const out = {};
      for (const row of rows) {
        if (row.collection === META_COLLECTION) {
          out.meta = row.data;
          continue;
        }
        if (!out[row.collection]) out[row.collection] = [];
        out[row.collection].push(row.data);
      }
      return out;
    },

    async write(ops) {
      await this.init();
      if (!ops.upserts.length && !ops.deletes.length) return;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const op of ops.upserts) {
          await client.query(
            `INSERT INTO chemquest_docs (collection, id, data)
             VALUES ($1, $2, $3::jsonb)
             ON CONFLICT (collection, id)
             DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
            [op.collection, op.id, op.json]
          );
        }
        for (const op of ops.deletes) {
          await client.query('DELETE FROM chemquest_docs WHERE collection = $1 AND id = $2', [
            op.collection,
            op.id,
          ]);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },

    async close() {
      await pool.end().catch(() => {});
    },
  };
}

const backend = process.env.DATABASE_URL
  ? makePgBackend(process.env.DATABASE_URL)
  : makeFileBackend();

// A serverless host has no writable disk, so the file backend cannot work there.
// Say so loudly at boot rather than letting every save fail with a 500.
if (backend.name === 'file' && (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY)) {
  console.error(
    '\n[db] ⚠️  Running on a serverless host with no DATABASE_URL set.\n' +
      '[db] This host has a READ-ONLY filesystem, so data/db.json cannot be written\n' +
      '[db] and every save will fail. Set DATABASE_URL to a Postgres connection string.\n' +
      '[db] See docs/KNOWN-ISSUE-vercel-persistence.md\n'
  );
}

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

function blankData() {
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function normalise(target) {
  target.users = target.users || [];
  target.lessons = target.lessons || [];
  target.meta = target.meta || { version: 1 };
  return target;
}

/**
 * Copy a freshly loaded document into the live `data` object **in place**, so
 * any array reference handed out by `all()` stays valid across a refresh.
 */
function adopt(incoming) {
  const next = normalise(incoming || blankData());
  if (!data) {
    data = next;
  } else {
    for (const key of Object.keys(data)) {
      if (key in next) continue;
      if (Array.isArray(data[key])) data[key].length = 0;
      else delete data[key];
    }
    for (const [key, value] of Object.entries(next)) {
      if (Array.isArray(value)) {
        if (!Array.isArray(data[key])) data[key] = [];
        const arr = data[key];
        arr.length = 0;
        for (const item of value) arr.push(item);
      } else {
        data[key] = value;
      }
    }
  }
  rebuildSnapshot();
  dirty = false;
  loaded = true;
}

/** Record what is currently persisted, so flush() can diff against it. */
function rebuildSnapshot() {
  snapshot = new Map();
  for (const [collection, value] of Object.entries(data)) {
    if (collection === 'meta') {
      snapshot.set(docKey(META_COLLECTION, META_ID), JSON.stringify(value));
      continue;
    }
    if (!Array.isArray(value)) continue;
    for (const doc of value) {
      if (!doc || doc.id === undefined || doc.id === null) continue;
      snapshot.set(docKey(collection, doc.id), JSON.stringify(doc));
    }
  }
}

/** Synchronous lazy load — only possible on the file backend. */
function ensureLoaded() {
  if (loaded) return;
  if (!backend.supportsSyncLoad) {
    throw new Error(
      '[db] The database has not been loaded yet. Call `await db.ready()` before touching the store ' +
        '(server.js does this for every /api request).'
    );
  }
  try {
    const found = backend.loadSync();
    if (found) {
      adopt(found);
    } else {
      adopt(blankData());
      dirty = true;
      backend.writeSync();
      rebuildSnapshot();
      dirty = false;
    }
  } catch (err) {
    console.error('[db] Failed to load db.json, starting fresh:', err.message);
    adopt(blankData());
  }
}

/** Run `fn` after any in-flight load/flush, so the two never interleave. */
function serialise(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => {},
    () => {}
  );
  return run;
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

/** Diff live memory against the last persisted snapshot. */
function collectOps() {
  const upserts = [];
  const deletes = [];
  const seen = new Set();

  for (const [collection, value] of Object.entries(data)) {
    if (collection === 'meta') {
      const key = docKey(META_COLLECTION, META_ID);
      const json = JSON.stringify(value);
      seen.add(key);
      if (snapshot.get(key) !== json) {
        upserts.push({ key, collection: META_COLLECTION, id: META_ID, json });
      }
      continue;
    }
    if (!Array.isArray(value)) continue;
    for (const doc of value) {
      if (!doc || doc.id === undefined || doc.id === null) continue;
      const id = String(doc.id);
      const key = docKey(collection, id);
      const json = JSON.stringify(doc);
      seen.add(key);
      if (snapshot.get(key) !== json) upserts.push({ key, collection, id, json });
    }
  }

  for (const key of snapshot.keys()) {
    if (seen.has(key)) continue;
    const idx = key.indexOf(KEY_SEP);
    deletes.push({ key, collection: key.slice(0, idx), id: key.slice(idx + 1) });
  }

  return { upserts, deletes };
}

async function flushNow() {
  if (!loaded || !dirty) return;
  const ops = collectOps();
  if (!ops.upserts.length && !ops.deletes.length) {
    dirty = false;
    return;
  }
  await backend.write(ops);
  for (const op of ops.upserts) snapshot.set(op.key, op.json);
  for (const op of ops.deletes) snapshot.delete(op.key);
  dirty = false;
}

/**
 * Mark the store dirty. On the file backend we also write straight away, which
 * keeps `npm run seed` and any standalone script behaving exactly as before.
 */
function persist() {
  dirty = true;
  if (backend.supportsSyncLoad) {
    backend.writeSync();
    rebuildSnapshot();
    dirty = false;
  }
}

/* ------------------------------------------------------------------ *
 * Public API — unchanged from the original file store
 * ------------------------------------------------------------------ */

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

  /* ---------------- lifecycle (used by server.js / scripts) ---------------- */

  /** Which backend is in use: 'file' or 'postgres'. */
  backend: backend.name,

  /** Load the database once. Safe to call repeatedly. */
  ready() {
    if (loaded) return Promise.resolve();
    if (!loadPromise) {
      loadPromise = serialise(async () => {
        if (loaded) return;
        adopt(await backend.load());
      }).catch((err) => {
        loadPromise = null;
        throw err;
      });
    }
    return loadPromise;
  },

  /**
   * Re-read the database from the backend. Needed on serverless hosts, where
   * several instances each hold their own copy in memory and would otherwise
   * serve stale data.
   */
  refresh() {
    return serialise(async () => {
      adopt(await backend.load());
    });
  },

  /** Write every pending change durably. Awaited before each API response. */
  flush() {
    return serialise(flushNow);
  },

  /** True when there are unsaved changes in memory. */
  isDirty() {
    return dirty;
  },

  close() {
    return backend.close();
  },
};

module.exports = db;
