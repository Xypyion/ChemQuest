/**
 * Copy the whole StoiVenture database from one Postgres to another — for
 * moving to a new host (Neon → Neon project, Supabase, Aiven, …).
 *
 *   FROM_URL="postgres://…old…" TO_URL="postgres://…new…" node scripts/copy-database.js
 *   … --force   to copy into a database that already has StoiVenture rows
 *
 * Everything in `chemquest_docs` is copied in its original order, pictures and
 * files included, a batch at a time. The source is only read. Afterwards the
 * row counts and a checksum of every row are compared, and it says whether
 * they match. Point DATABASE_URL at the new database only after that.
 *
 * The app sets up the change tracking (rev, tombstones) on the new database
 * itself the first time it starts, exactly as it did on the old one.
 */
const { Pool } = require('pg');

const BATCH = 50;
const force = process.argv.includes('--force');

function pool(url) {
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return new Pool({ connectionString: url, max: 1, ssl: isLocal ? false : { rejectUnauthorized: false } });
}

async function checksum(db) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n,
            coalesce(md5(string_agg(collection || '|' || id || '|' || md5(data::text), ',' ORDER BY collection, id)), '') AS sum
       FROM chemquest_docs`
  );
  return rows[0];
}

async function main() {
  const fromUrl = process.env.FROM_URL;
  const toUrl = process.env.TO_URL;
  if (!fromUrl || !toUrl) {
    console.error('Set FROM_URL (the current database) and TO_URL (the new one).');
    process.exit(1);
  }
  if (fromUrl === toUrl) {
    console.error('FROM_URL and TO_URL are the same database.');
    process.exit(1);
  }
  const src = pool(fromUrl);
  const dst = pool(toUrl);

  try {
    await dst.query(`
      CREATE TABLE IF NOT EXISTS chemquest_docs (
        collection  text        NOT NULL,
        id          text        NOT NULL,
        seq         bigserial   NOT NULL,
        data        jsonb       NOT NULL,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (collection, id)
      )`);
    await dst.query('CREATE INDEX IF NOT EXISTS chemquest_docs_seq_idx ON chemquest_docs (collection, seq)');

    const existing = (await dst.query('SELECT count(*)::int AS n FROM chemquest_docs')).rows[0].n;
    if (existing && !force) {
      console.error(`The new database already has ${existing} StoiVenture rows. Re-run with --force to merge into it.`);
      process.exit(1);
    }

    const total = (await src.query('SELECT count(*)::int AS n FROM chemquest_docs')).rows[0].n;
    console.log(`Copying ${total} rows…`);

    // Page by seq, so the copy keeps insertion order (feeds, gradebook columns).
    let lastSeq = -1;
    let copied = 0;
    for (;;) {
      const { rows } = await src.query(
        'SELECT collection, id, seq, data::text AS data FROM chemquest_docs WHERE seq > $1 ORDER BY seq LIMIT $2',
        [lastSeq, BATCH]
      );
      if (!rows.length) break;
      const client = await dst.connect();
      try {
        await client.query('BEGIN');
        for (const r of rows) {
          await client.query(
            `INSERT INTO chemquest_docs (collection, id, data) VALUES ($1, $2, $3::jsonb)
             ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
            [r.collection, r.id, r.data]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
      lastSeq = Number(rows[rows.length - 1].seq);
      copied += rows.length;
      process.stdout.write(`\r  ${copied} / ${total}`);
    }
    process.stdout.write('\n');

    const a = await checksum(src);
    const b = await checksum(dst);
    if (a.n === b.n && a.sum === b.sum) {
      console.log(`Done. ${b.n} rows, identical in both databases.`);
      console.log('Now set DATABASE_URL (Vercel → Settings → Environment Variables) to the new database and redeploy.');
    } else {
      console.error(`MISMATCH: old has ${a.n} rows, new has ${b.n}. Do not switch over; run it again.`);
      process.exitCode = 1;
    }
  } finally {
    await src.end().catch(() => {});
    await dst.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error('Copy failed:', err.message);
  process.exit(1);
});
