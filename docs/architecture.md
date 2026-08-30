# Architecture

## Technology

- **Runtime:** Node.js (tested on Node 18+; works on 25).
- **Web framework:** Express.
- **Auth:** JSON Web Tokens (`jsonwebtoken`) + password hashing (`bcryptjs`).
- **Storage:** a tiny custom JSON document store (`src/db.js`) writing to `data/db.json`,
  or Postgres when `DATABASE_URL` is set.
- **AI:** `@google/genai` (Gemini), behind two modules — `src/tutor.js` for hints
  and `src/aiQuestions.js` for writing and checking questions. Optional: with no
  `GEMINI_API_KEY` the three AI features switch themselves off and nothing else
  is affected.
- **Front-end:** plain HTML, CSS and vanilla JavaScript — **no build step, no framework.**
- **Assets:** uploaded assignment files saved to `data/uploads/`, served at `/uploads`.

## Process / request flow

```
            ┌──────────────────────── public/ (static) ────────────────────────┐
            │  index, dashboard, level, lesson, inventory, leaderboard, teacher │
            └───────────────────────────────────────────────────────────────────┘
                                   ▲  HTML/CSS/JS
 Browser ──fetch()──► Express (server.js)
                         ├─ /api/auth        → auth.routes.js      (signup, login, me)
                         ├─ /api/lessons     → lessons.routes.js   (play, grade, post-test)
                         ├─ /api/teacher     → teacher.routes.js   (CRUD, gate, students)
                         ├─ /api/posts       → posts.routes.js     (assignment board)
                         ├─ /api/challenges  → challenges.routes.js (student: answer)
                         ├─ /api/teacher/challenges → challenges.routes.js (teacher: build, mark)
                         ├─ /api/quests      → quests.routes.js     (student: answer, wallet)
                         ├─ /api/teacher/quests → quests.routes.js  (teacher: build, assign)
                         ├─ /api/battles     → battles.routes.js    (student: raids AND duels)
                         ├─ /api/teacher/battles → battles.routes.js (teacher: banks, logs)
                         ├─ /api/badges      → badges.routes.js     (student: my shelf)
                         ├─ /api/teacher/badges → badges.routes.js   (teacher: create & attach)
                         ├─ /api/teacher/ai  → ai.routes.js         (teacher: write questions)
                         ├─ /api/tutor       → tutor.routes.js      (student: Kru CJ hints)
                         ├─ /api/leaderboard → leaderboard.routes.js
                         └─ /uploads         → static file attachments
                         │
                         └─ src/db.js  ←→  data/db.json  (atomic write via tmp + rename)
```

Every `/api/*` request (except signup/login) carries `Authorization: Bearer <JWT>`.
`authMiddleware` verifies the token and loads the user; `requireRole('student'|'teacher')`
restricts each router.

## Folder layout

```
chemquest/
├── server.js                 # Express bootstrap: routes, static, seed-on-first-run
├── src/
│   ├── db.js                 # JSON document store (all/find/insert/update/remove/save)
│   ├── auth.js               # hashPassword, verifyPassword, signToken, publicUser, guards
│   ├── game.js               # scoring, pass rule, level completion + gate helpers
│   ├── challenges.js         # challenge model + auto-marking rules (THE grading engine)
│   ├── quests.js             # daily quests: a thin layer on challenges.js
│   ├── battles.js            # coin battles + duels: stakes, limits, coin transfer
│   ├── tutor.js              # Kru CJ the hint tutor — never told the answer
│   ├── aiQuestions.js        # AI question writing + duel-question review — IS told the answer
│   ├── tutorCredit.js        # what a tutor hint costs: free questions, then coins
│   ├── aiLimit.js            # per-person daily cap on AI calls (the API bill, not a game rule)
│   ├── badges.js             # teacher-made badges: the model and the awarding rule
│   ├── uploads.js            # storing an uploaded file on either kind of host
│   ├── config.js             # zero-dependency .env reader; the AI on/off switch
│   ├── seed.js               # teacher account + 6 sample lessons (first run only)
│   └── routes/
│       ├── auth.routes.js
│       ├── lessons.routes.js     # student: map, play, pre-test, post-test, grading
│       ├── teacher.routes.js     # teacher: lesson CRUD, gate, post-test open, students
│       ├── posts.routes.js       # assignment board feed
│       └── leaderboard.routes.js
├── public/                   # front-end (served statically)
│   ├── *.html                # one page per screen
│   ├── css/                  # theme, map, lesson, teacher, feed, pages, character
│   └── js/                   # i18n, icons, api, character (Kru CJ SVG), qrender,
│                             #   page logic, feed, tutor, duel, teacher-* console modules
└── data/                     # runtime state (git-ignored)
    ├── db.json
    └── uploads/
```

## Data store (`src/db.js`)

A zero-dependency in-memory document store, persisted to `data/db.json`:

- Collections: `users`, `lessons`, `posts`, plus a `meta` block.
- `persist()` writes to a temp file then `fs.renameSync` — an **atomic** swap that avoids
  partially written files.
- Suitable for a single classroom's scale; no native modules, so `npm install` always works.

## Authentication & roles (`src/auth.js`)

- `hashPassword` / `verifyPassword` — bcrypt with cost 10.
- `signToken(user)` — JWT carrying `{ id, role }`, 30-day expiry.
- `authMiddleware` — verifies token, attaches the full user to `req.user`.
- `requireRole(role)` — 403s anyone whose role doesn't match.
- `publicUser(user)` — strips `passwordHash` before sending to the client.

## Game logic (`src/game.js`)

Centralised so every route agrees on the rules:

- `computeScore({correct,total,difficulty})` — accuracy × 100 × difficulty multiplier
  (easy 1.0, medium 1.25, hard 1.5).
- `isPass(correct,total)` — ≥ 60%.
- `hasPostTest(lesson)` / `levelDone(lesson, progressEntry)` — completion logic.
- `gateOpen(lesson)` — evaluates the teacher access gate (`auto` / `locked` / `scheduled`).
- `activityState(lesson, progress)` — which of the level's two activities (storyboard /
  pre-test) is open, following the teacher's `flow` order.
- `recalcPoints(user)` — best pre-test + best post-test scores + teacher bonus.

## Front-end

- **No framework.** Each HTML page loads `js/i18n.js` first (so `t()` is available), then
  `js/api.js` (fetch wrapper + session guard), then page-specific scripts.
- **i18n:** `js/i18n.js` holds `en`/`th` dictionaries, a `t(key, vars)` helper, `tDiff()`,
  and `mountLangSwitch()`. The choice is saved in `localStorage.cq_lang` and switching
  reloads the page. `<html lang>` is updated for screen readers.
- **Mascot:** Kru CJ is an original inline SVG (`js/character.js`) — not based on any IP.
  The render helpers are still named `renderRuby` / `setRubyMood` from before the
  rename; eight files call them and renaming buys nothing.
- **Shared feed component:** `js/feed.js` powers the assignment board for both students and
  the teacher console.

## Notable design decisions

- **JSON file over a DB** keeps deployment to "install Node, `npm start`" — ideal for a
  school with minimal infrastructure.
- **Server-enforced rules:** unlock/gate/post-test checks run on the server, not just the
  UI, so locked content can't be reached by editing the URL.
- **Attachments off-JSON:** uploaded files are written to disk and referenced by URL, so the
  JSON store stays small and fast.
