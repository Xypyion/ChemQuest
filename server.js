/**
 * ChemQuest — a colorful chemistry learning adventure.
 * Express server: JSON API + static cartoony front-end.
 */
const path = require('path');
const express = require('express');
const { seedIfEmpty } = require('./src/seed');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json({ limit: '16mb' })); // generous: storyboards may embed uploaded images

// Tiny request log so the teacher can see activity in the console.
app.use((req, res, next) => {
  if (req.url.startsWith('/api')) {
    console.log(`${new Date().toLocaleTimeString()}  ${req.method} ${req.url}`);
  }
  next();
});

// ---- API ----
app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/lessons', require('./src/routes/lessons.routes'));
app.use('/api/teacher', require('./src/routes/teacher.routes'));
app.use('/api/leaderboard', require('./src/routes/leaderboard.routes'));
app.use('/api/posts', require('./src/routes/posts.routes'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route.' }));

// Surface unexpected errors as JSON instead of HTML stack traces.
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

// ---- Front-end (static cartoony pages) ----
app.use(express.static(path.join(__dirname, 'public')));
// Assignment attachments uploaded to the board.
app.use('/uploads', express.static(path.join(__dirname, 'data', 'uploads')));

// Seed the teacher + sample levels on first run, then start listening.
seedIfEmpty();
app.listen(PORT, () => {
  console.log('\n  🧪  ChemQuest is live!');
  console.log(`  ➜  Open  http://localhost:${PORT}  in your browser\n`);
});
