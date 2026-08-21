/**
 * One-off migration: data/db.json  ->  Postgres.
 *
 *   DATABASE_URL="postgres://…" node scripts/migrate-to-postgres.js
 *   DATABASE_URL="postgres://…" node scripts/migrate-to-postgres.js --force
 *
 * Reads the JSON file directly (it does NOT go through src/db.js, so it works
 * regardless of which backend that module would pick) and writes one row per
 * document into `chemquest_docs`.
 *
 * Safe to re-run: rows are upserted by (collection, id). It refuses to run
 * against a database that already has rows unless you pass --force, so you
 * can't quietly overwrite live classroom data.
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'db.json');
const META_COLLECTION = '__meta__';
const force = process.argv.includes('--force');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Set DATABASE_URL first, e.g.\n  DATABASE_URL="postgres://user:pass@host/db" node scripts/migrate-to-postgres.js');
    process.exit(1);
  }
  if (!fs.existsSync(DB_FILE)) {
    console.error(`No database file at ${DB_FILE}. Nothing to migrate.`);
    process.exit(1);
  }

  const source = JSON.parse(fs.readFileSync(DB_FILE, 'utf8') || '{}');

  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new Pool({
    connectionString: url,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

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
  await pool.query(
    'CREATE INDEX IF NOT EXISTS chemquest_docs_seq_idx ON chemquest_docs (collection, seq)'
  );

  const { rows: existing } = await pool.query('SELECT count(*)::int AS n FROM chemquest_docs');
  if (existing[0].n > 0 && !force) {
    console.error(
      `Refusing to run: chemquest_docs already holds ${existing[0].n} rows.\n` +
        'Re-run with --force if you really mean to merge/overwrite them.'
    );
    await pool.end();
    process.exit(1);
  }

  // Flatten the JSON document into (collection, id, data) rows.
  const rows = [];
  const skipped = [];
  for (const [collection, value] of Object.entries(source)) {
    if (collection === 'meta') {
      rows.push([META_COLLECTION, 'meta', JSON.stringify(value)]);
      continue;
    }
    if (!Array.isArray(value)) {
      skipped.push(`${collection} (not an array)`);
      continue;
    }
    for (const doc of value) {
      if (!doc || doc.id === undefined || doc.id === null) {
        skipped.push(`${collection} (a document with no id)`);
        continue;
      }
      rows.push([collection, String(doc.id), JSON.stringify(doc)]);
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [collection, id, json] of rows) {
      await client.query(
        `INSERT INTO chemquest_docs (collection, id, data)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [collection, id, json]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Report what landed, so you can eyeball it against the source file.
  const { rows: counts } = await pool.query(
    'SELECT collection, count(*)::int AS n FROM chemquest_docs GROUP BY collection ORDER BY collection'
  );
  console.log(`\nMigrated ${rows.length} documents from ${DB_FILE}:`);
  for (const c of counts) console.log(`  ${c.collection.padEnd(24)} ${c.n}`);
  if (skipped.length) console.log('\nSkipped:', [...new Set(skipped)].join(', '));
  console.log('\nDone. Set the same DATABASE_URL on the server and restart it.\n');

  await pool.end();
}

main().catch((err) => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
