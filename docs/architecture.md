# Architecture

## Technology

- **Runtime:** Node.js (tested on Node 18+; works on 25).
- **Web framework:** Express.
- **Auth:** JSON Web Tokens (`jsonwebtoken`) + password hashing (`bcryptjs`).
- **Storage:** a tiny custom JSON document store (`src/db.js`) writing to `data/db.json`.
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
│   └── js/                   # i18n, api, character (Ruby SVG), props, page logic, feed
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
- `recalcPoints(user)` — best pre-test + best post-test scores + teacher bonus.

## Front-end

- **No framework.** Each HTML page loads `js/i18n.js` first (so `t()` is available), then
  `js/api.js` (fetch wrapper + session guard), then page-specific scripts.
- **i18n:** `js/i18n.js` holds `en`/`th` dictionaries, a `t(key, vars)` helper, `tDiff()`,
  and `mountLangSwitch()`. The choice is saved in `localStorage.cq_lang` and switching
  reloads the page. `<html lang>` is updated for screen readers.
- **Mascot:** Ruby is an original inline SVG (`js/character.js`) — not based on any IP.
- **Shared feed component:** `js/feed.js` powers the assignment board for both students and
  the teacher console.

## Notable design decisions

- **JSON file over a DB** keeps deployment to "install Node, `npm start`" — ideal for a
  school with minimal infrastructure.
- **Server-enforced rules:** unlock/gate/post-test checks run on the server, not just the
  UI, so locked content can't be reached by editing the URL.
- **Attachments off-JSON:** uploaded files are written to disk and referenced by URL, so the
  JSON store stays small and fast.
