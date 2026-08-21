/**
 * ChemQuest — a colorful chemistry learning adventure.
 * Express server: JSON API + static cartoony front-end.
 *
 * Runs two ways:
 *   • `npm start`  — long-lived Node process (school machine, Render, Railway…).
 *   • Serverless   — `api/index.js` imports the exported app (Vercel). In that
 *     mode nothing calls `listen()`; the platform invokes the handler instead.
 */
const path = require('path');
const express = require('express');
const db = require('./src/db');
const { seedIfEmpty } = require('./src/seed');

const app = express();
const PORT = process.env.PORT || 4000;

// Generous: storyboards may embed uploaded images.
// NOTE: serverless hosts cap the request body well below this (Vercel ~4.5 MB)
// and reject it before Express sees it — see docs/KNOWN-ISSUE-vercel-persistence.md §4.
app.use(express.json({ limit: process.env.JSON_LIMIT || '16mb' }));

// Tiny request log so the teacher can see activity in the console.
app.use((req, res, next) => {
  if (req.url.startsWith('/api')) {
    console.log(`${new Date().toLocaleTimeString()}  ${req.method} ${req.url}`);
  }
  next();
});

/* ------------------------------------------------------------------ *
 * Database bootstrap
 *
 * Every /api request:
 *   1. makes sure the database is loaded (and, on Postgres, re-read — several
 *      serverless instances each keep their own in-memory copy),
 *   2. seeds on a genuinely empty database,
 *   3. for mutating requests, wraps res.json so the durable write completes
 *      *before* the client is told the save succeeded.
 *
 * Step 3 is the actual fix for "Something went wrong on the server.": the old
 * code mutated memory, failed to write, and returned 500 — while the change
 * lingered in memory just long enough to look saved after a refresh.
 * ------------------------------------------------------------------ */
let seedChecked = false;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

app.use('/api', async (req, res, next) => {
  try {
    if (db.backend === 'postgres') await db.refresh();
    else await db.ready();

    if (!seedChecked) {
      if (seedIfEmpty()) await db.flush();
      seedChecked = true;
    }
  } catch (err) {
    return next(err);
  }

  if (MUTATING.has(req.method)) {
    const send = res.json.bind(res);
    res.jsonRaw = send; // the error handler must not re-enter the flush
    res.json = (body) => {
      db.flush().then(() => send(body), next);
      return res;
    };
  }
  next();
});

// ---- API ----
app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/lessons', require('./src/routes/lessons.routes'));
const challengeRoutes = require('./src/routes/challenges.routes');
app.use('/api/challenges', challengeRoutes.studentRouter);          // students answer challenges
app.use('/api/teacher/challenges', challengeRoutes.teacherRouter);  // teacher builds & grades them
const questRoutes = require('./src/routes/quests.routes');
app.use('/api/quests', questRoutes.studentRouter);                  // students answer daily quests
app.use('/api/teacher/quests', questRoutes.teacherRouter);          // teacher builds & assigns them
app.use('/api/teacher', require('./src/routes/teacher.routes'));
app.use('/api/leaderboard', require('./src/routes/leaderboard.routes'));
app.use('/api/posts', require('./src/routes/posts.routes'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route.' }));

// Surface unexpected errors as JSON instead of HTML stack traces.
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return next(err);

  const send = (status, body) => {
    res.status(status);
    (res.jsonRaw || res.json.bind(res))(body);
  };

  // Body bigger than the configured limit, or malformed JSON.
  if (err.type === 'entity.too.large') {
    return send(413, {
      error: 'That upload is too large. Try smaller images, or fewer of them in one save.',
    });
  }
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return send(400, { error: 'The request was not valid JSON.' });
  }
  // Anything thrown by the storage layer: say so, rather than a blank shrug.
  if (err.code === 'EROFS' || err.code === 'EACCES' || err.code === 'ENOSPC') {
    return send(500, {
      error: 'The server could not save your change to disk. Please tell the administrator.',
    });
  }
  // Database unreachable / refused / auth failure. Postgres SQLSTATEs are
  // 5 characters (08xxx connection, 28xxx auth, 53xxx resources, 57xxx
  // operator intervention, 3Dxxx missing database); the rest are socket errors.
  const NETWORK_CODES = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'EAI_AGAIN'];
  const code = String(err.code || '');
  const isDbDown =
    NETWORK_CODES.includes(code) ||
    /^(08|28|3D|53|57)\d{3}$/.test(code) ||
    /Connection terminated|timeout exceeded when trying to connect/i.test(err.message || '');
  if (isDbDown) {
    return send(503, {
      error: MUTATING.has(req.method)
        ? 'The server could not reach the database, so your change was NOT saved. Please try again.'
        : 'The server could not reach the database. Please try again in a moment.',
    });
  }
  send(500, { error: 'Something went wrong on the server.' });
});

// ---- Front-end (static cartoony pages) ----
app.use(express.static(path.join(__dirname, 'public')));

// Assignment attachments that live in the database (serverless hosts have no
// writable disk, so posts.routes.js stores the bytes instead of a file).
app.get('/uploads/db/:id', async (req, res, next) => {
  try {
    if (db.backend === 'postgres') await db.refresh();
    else await db.ready();
    const file = db.findById('uploads', req.params.id);
    if (!file) return res.status(404).send('Not found');
    res.setHeader('Content-Type', file.type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name || 'file')}"`);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(file.b64, 'base64'));
  } catch (err) {
    next(err);
  }
});

// Assignment attachments uploaded to the board (disk-backed hosts).
app.use('/uploads', express.static(path.join(__dirname, 'data', 'uploads')));

// ---- Standalone mode ----
// Only when run directly (`node server.js`). Under serverless the platform owns
// the lifecycle, so we must not bind a port.
if (require.main === module) {
  db.ready()
    .then(async () => {
      if (seedIfEmpty()) await db.flush();
      seedChecked = true;
      app.listen(PORT, () => {
        console.log('\n  🧪  ChemQuest is live!');
        console.log(`  ➜  Open  http://localhost:${PORT}  in your browser`);
        console.log(`  ➜  Storage: ${db.backend}\n`);
      });
    })
    .catch((err) => {
      console.error('[startup] Could not open the database:', err.message);
      process.exit(1);
    });
}

module.exports = app;
