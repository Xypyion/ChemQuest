# ChemQuest — Developer Handoff

> **Read this first.** It is the single entry point for a developer taking over
> **ChemQuest**, a chemistry learning game built for **Suankularb Wittayalai
> Nonthaburi School (โรงเรียนสวนกุหลาบวิทยาลัย นนทบุรี)**. Deeper references live
> alongside this file in `docs/` — see [§14](#14-where-to-read-more).

---

> ✅ **RECENTLY FIXED — READ FIRST:** every save on the Vercel deployment used to
> return *"Something went wrong on the server."* while appearing to save after a
> refresh. Cause: a serverless read-only filesystem vs. the `data/db.json` store.
> **`src/db.js` now supports Postgres** (selected automatically when
> `DATABASE_URL` is set; the file backend is unchanged for the school machine).
>
> ⚠️ **The live site stays broken until someone creates a Postgres database and
> sets `DATABASE_URL` + `JWT_SECRET` in Vercel.** Steps:
> **[KNOWN-ISSUE-vercel-persistence.md §7b](KNOWN-ISSUE-vercel-persistence.md#7-finishing-the-deployment)**.

---

## 0. ⚠️ Mandatory rules (do not skip)

1. **Push to GitHub every time a job is finished.** When a unit of work is done
   **and verified**, commit with a clear message and `git push origin main`.
   Do not leave finished work sitting only on the local machine. Repo:
   <https://github.com/Xypyion/ChemQuest>.
2. **The app runs on port 4000, never 3000.** Port 3000 is permanently occupied
   by an unrelated process on the school's machine. The default is already 4000
   in `server.js`; override only with the `PORT` env var.
3. **`git fetch` before you start.** This repo has more than one contributor.
   Check for new branches/commits and integrate them before doing new work.
4. **Never commit `data/`.** `data/db.json` (the live database) and
   `data/uploads/` (assignment files) are git-ignored on purpose — they hold real
   student data. Committing them would leak data and cause merge pain.
5. **Verify before you claim done.** Run the app, exercise the change in the
   browser (or via the API), and confirm it works. Don't ask the user to test.
6. **Keep it bilingual.** Every user-facing string must go through the i18n
   system (`t('key')`) with both `en` and `th` entries. No hard-coded UI text.

---

## 1. What ChemQuest is

A colorful, cartoony, **bilingual (ไทย / English)** web game that teaches
chemistry. Students climb an adventure map through three biomes, learn from
storyboards narrated by the mascot **Ruby**, take pre-tests and teacher-gated
post-tests, submit work on a class feed, rate each other's work, and earn
certificates and leaderboard points. Teachers get a separate console to build
levels, control access, grade written answers, keep a gradebook, and manage
students.

Two audiences, one server:
- **Student game** — playful, animated (`public/*.html` + `js/`).
- **Teacher console** — clean dashboard UI (`public/teacher.html` + `js/teacher.js`).

---

## 2. Current state (as of the latest commit)

**Status: working, tested, in active use.** Everything below is implemented and
verified end-to-end.

Implemented features:
- Sign up / log in (JWT), difficulty choice (easy/medium/hard).
- Adventure map with 3 biomes, 3D-style Ruby models, props, rivers/bridges.
- **Level board hub** (`level.html`): tabs 🏠 Board · 📒 Assignments · 🧩 Challenges;
  the board menu lists Storyboard · Pre-test · Assignments · Challenges · Post-test.
- **Storyboards**: dialogue lines (moods, optional images) + inline YouTube video
  placed anywhere in the sequence. Played on their own (`lesson.html?mode=story`).
- **Pre-test**: instant feedback, explanations, per-difficulty questions; passing
  (≥60%) earns a **certificate**. Played on its own (`lesson.html?mode=pre`).
- **Activity order** (`lesson.flow`): the storyboard and the pre-test are two
  separate activities and the teacher picks which comes first —
  `story-first` (default) or `test-first`. The second one stays locked, and the
  server refuses it, until the first is finished.
- **Challenges**: a teacher-built section of the level board (see below).
- **Post-test**: separate quiz, **teacher-gated** (open/close), **one attempt
  only**, **points-based**, supports **multiple-choice + written** questions.
- **Written-answer grading**: written questions go to a teacher **"Writing
  Grading"** queue (badge = notification); teacher awards a **numeric score
  (0..question points)**; MCQ stays auto-graded; the attempt finalizes on grade.
- **Timed quizzes** (per-level seconds; auto-submit latest answers on timeout).
- **Assignment board** per level: posts with file attachments (image preview /
  PDF / any file), likes, comments, and **private student→teacher questions**
  (only on the teacher's assignment post).
- **Challenges** per level (the tab right under Assignments): teacher-built
  worksheets sorted into **categories** and **assigned** to everyone or to picked
  students. A challenge holds any mix of question types — **multiple choice ·
  choose-many · short answer · paragraph · fill-in-the-table · simulation** —
  each with optional **image** and its own points. A **simulation** question
  embeds teacher-authored HTML (or a URL) in a **sandboxed iframe** with its own
  sub-questions underneath. Auto-markable answers are scored on submit; the rest
  land in the challenge's **Responses** list for the teacher to mark, with
  optional written feedback. The Responses list shows **every student's answer to
  every question** (not just the score) — including what they picked, their filled
  table redrawn as a grid, and the correct answer next to anything wrong — and
  exports the class set to **CSV** (built client-side, UTF-8 BOM for Excel).
  Scores can be imported into the gradebook.
- **Peer + teacher rating**: teacher-defined **rating criteria** per level;
  students rate each other's works 1–5 stars per criterion; teacher rates too.
- **Gradebook**: spreadsheet-style grid (rows = students, columns = grade items)
  with editable cells, totals, and import of pre/post-test scores.
- **Leaderboard** (podium + full ranking), **certificate inventory**.
- **Teacher console**: lesson CRUD + storyboard builder, per-difficulty quiz
  builder (MCQ + written, per-question points), post-test open/close, per-level
  **access gate** (auto / locked / scheduled), assignment board view, writing
  grading, gradebook, student management incl. **password reset**, and a
  read-only "Play as student" preview.
- **Access gate & progression**: a level unlocks only when the teacher's gate is
  open **and** the previous level is "done" (its post-test passed, if it has one).
- **i18n**: full Thai/English switch on every page.

Known **non**-features / limitations: no email verification, no rate limiting on
auth, single-classroom scale (JSON file store), no automated test suite in the
repo (tests are written ad-hoc during development — see [§12](#12-testing)).

---

## 3. Quick start

Requirements: **Node.js 18+** (tested on 25). No database server, no build step.

```bash
cd chemquest
npm install
npm start            # serves http://localhost:4000
# npm run dev        # same, with --watch auto-restart
# npm run seed       # (re)seed teacher + sample lessons if the DB is empty
```

On first run the app auto-creates the teacher account and 6 sample lessons.

**Default teacher login:** `Shinozuke67@skn.ac.th` / `12345678`
(email is case-insensitive). Students self-register on the welcome page.

To reset everything: stop the server, delete `data/db.json` (and optionally
`data/uploads/`), start again → it re-seeds.

---

## 4. Tech stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js (CommonJS) |
| Server | Express 4 |
| Auth | `jsonwebtoken` (JWT) + `bcryptjs` (password hashing) |
| Storage | Custom document store → `data/db.json` (atomic writes), **or Postgres when `DATABASE_URL` is set** |
| Uploads | Files written to `data/uploads/`, served at `/uploads` |
| Front-end | Plain HTML + CSS + vanilla JS — **no framework, no bundler** |
| Fonts | Google Fonts (Fredoka + **Mali** for Thai glyphs) |

Four runtime dependencies (`express`, `jsonwebtoken`, `bcryptjs`, `pg`). Keep it
that way unless there's a strong reason — the "just `npm install` and run" story
is a feature for a school with minimal infrastructure.

---

## 5. Repository structure

```
chemquest/
├── server.js                 # Express bootstrap: routes, static, db bootstrap; exports the app
├── vercel.json               # serverless deployment config (routes everything to api/index.js)
├── api/index.js              # serverless entrypoint — imports the exported Express app
├── scripts/
│   └── migrate-to-postgres.js  # one-off: data/db.json -> Postgres  (npm run migrate)
├── package.json              # scripts: start / dev / seed / migrate
├── .gitignore                # ignores node_modules, data/db.json(.tmp), data/uploads/, .env
├── README.md                 # player-facing readme
├── data/                     # RUNTIME STATE — git-ignored, do not commit
│   ├── db.json               # the whole database (users, lessons, posts, submissions, gradebook)
│   └── uploads/              # assignment file attachments
├── src/
│   ├── db.js                 # document store (all/find/insert/update/remove/save)
│   │                         #   backends: data/db.json  OR  Postgres (DATABASE_URL)
│   ├── auth.js               # hashPassword, verifyPassword, signToken, publicUser, authMiddleware, requireRole
│   ├── game.js               # scoring, pass rule, level-completion, access gate + activity order
│   ├── challenges.js         # challenge model: normalising, sanitising, auto-marking
│   ├── grading.js            # finalizeAttempt() — applies a graded attempt to progress (MCQ+written points)
│   ├── seed.js               # teacher account + 6 sample lessons (first run only)
│   └── routes/
│       ├── auth.routes.js         # signup, login, me
│       ├── lessons.routes.js      # student: map, play, pre-test, post-test, grading submit
│       ├── teacher.routes.js      # teacher: lesson CRUD, gate, criteria, post-test open,
│       │                          #          students, password reset, writing grading, gradebook
│       ├── posts.routes.js        # assignment board: posts, files, comments, likes, questions, ratings
│       ├── challenges.routes.js   # challenges: student router + teacher router (CRUD, assign, mark)
│       └── leaderboard.routes.js  # ranked students
└── public/                   # front-end (served statically; no build)
    ├── index.html            # welcome / login / signup
    ├── challenge.html        # challenge player (student)
    ├── dashboard.html        # adventure map
    ├── level.html            # level board hub (start / assignments / post-test)
    ├── lesson.html           # storyboard + quiz player (mode=pre | mode=post)
    ├── inventory.html        # certificate collection
    ├── leaderboard.html
    ├── teacher.html          # teacher console shell
    ├── css/                  # theme, map, lesson, teacher, feed, pages, character
    └── js/
        ├── i18n.js           # en/th dictionaries, t(), tDiff(), fmtWhen(), mountLangSwitch()  [load FIRST]
        ├── api.js            # fetch wrapper (API.get/post/put/del), session guard, toast, confetti, helpers
        ├── character.js      # Ruby mascot (original inline SVG) + hats/moods
        ├── props.js          # decorative SVG props for the map
        ├── welcome.js, dashboard.js, board.js, lesson.js, inventory.js, leaderboard.js
        ├── challenge.js      # challenge player (all question types + sandboxed simulation)
        ├── teacher-challenges.js  # teacher console: the 🧩 Challenges section
        └── teacher.js        # the rest of the teacher console (single file)
```

---

## 6. Architecture & request flow

```
Browser (HTML/CSS/JS)                Express (server.js)                 data/db.json
  localStorage: cq_token, cq_user      ├─ /api/auth        auth.routes         (users)
  localStorage: cq_lang (en|th)        ├─ /api/lessons     lessons.routes      (lessons, submissions)
        │                              ├─ /api/teacher     teacher.routes      (lessons, users, gradebook)
        │  fetch() + Bearer <JWT>      ├─ /api/posts       posts.routes        (posts)
        └──────────────────────────►   ├─ /api/leaderboard leaderboard.routes
                                       ├─ /uploads         static file attachments  → data/uploads/
                                       └─ static           public/*
```

- Every `/api/*` call except signup/login carries `Authorization: Bearer <JWT>`.
- `authMiddleware` verifies the token and loads the full user onto `req.user`;
  `requireRole('student'|'teacher')` restricts each router.
- **Game rules are enforced server-side** — a student cannot reach a locked level,
  an unopened/already-taken post-test, or a teacher route by editing the URL. The
  client mirrors these rules for UX, but the server is authoritative.
- The JSON store persists atomically: write to `db.json.tmp`, then `rename`.

---

## 7. Data model

Collections in `data/db.json`: **`users`, `lessons`, `posts`, `submissions`,
`gradebook`, `challenges`, `challengeCategories`, `challengeSubmissions`**. Full field-by-field detail is in
[`data-model.md`](data-model.md); the essentials:

- **user**: `{ id, role:'student'|'teacher', name, email(lowercased),
  passwordHash, difficulty, avatar, progress{}, certificates[], earnedPoints,
  bonusPoints, points, grades{colId:score} }`
  - `progress[lessonId] = { attempts, bestScore, passed (pre-test), storyDone,
    post:{ attempts, bestScore, passed, awaitingGrading }, ... }`
- **lesson**: `{ id, order, title, description, terrain:'plain'|'mountain'|'snow',
  icon, timeLimit, flow:'story-first'|'test-first', storyboard[],
  quizzes{easy,medium,hard}, postTest{ open, timeLimit, quizzes{} },
  gate{ mode:'auto'|'locked'|'scheduled', openAt }, ratingCriteria[{id,label}] }`
  - **storyboard step**: `{type:'line', character, mood, text, image}` or
    `{type:'video', url, title}`.
  - **question**: `{id, type:'mcq'|'written', question, points, explanation,
    choices?, correctIndex?}`.
- **post** (assignment board): `{ id, lessonId, author{id,name,avatar,role},
  isAssignment, text, attachments[], likes[], comments[], questions[] (private),
  ratings[{raterId,raterRole,scores{critId:1..5}}] }`.
- **submission** (writing-grading queue): `{ id, userId, lessonId, mode:'pre'|'post',
  mcqCorrect, mcqTotal, mcqPoints, maxPoints, written[{questionId, answer, points,
  awarded}], status:'pending'|'graded' }`.
- **gradebook**: array of columns `{ id, name, max, order }`; a student's scores
  live on `user.grades[columnId]`.
- **challenge**: `{ id, lessonId, categoryId, title, description, icon, order,
  published, allowRetake, timeLimit, dueAt, assign{ mode:'all'|'some', studentIds[] },
  questions[] }`; a **question** is `{ id, type:'mcq'|'multi'|'short'|'written'|
  'table'|'simulation', question, image, points, explanation, … }` plus per-type
  fields (`choices`/`correctIndex`, `correctIndexes`, `accepted`, `table`,
  `sim`+`sub[]`).
- **challengeCategory**: `{ id, name, icon, order }` (global, reused across levels).
- **challengeSubmission**: `{ id, challengeId, userId, answers{}, results[],
  autoEarned, manual[{questionId,points,awarded}], earned, maxPoints,
  status:'pending'|'graded', feedback }`.

---

## 8. Key business rules

- **Progression / unlock** (`game.js` + `lessons.routes.js unlockInfo`): a level is
  open only when **(a)** the teacher gate is open (`auto`, or `scheduled` time
  reached; `locked` = shut) **and (b)** the previous level is "done" — meaning its
  **post-test passed** when it has one, otherwise its pre-test passed.
- **Activity order** (`game.activityState`): when a level has **both** a
  storyboard and a pre-test, the one the teacher put second is locked until the
  first is done (`progress.storyDone` / `progress.attempts`). An activity the
  student already finished never re-locks, even if the teacher flips the order.
- **Certificate**: awarded on the first pre-test pass of a level.
- **Challenges**: a student sees a challenge only when it is `published` **and**
  assigned to them. One attempt unless `allowRetake` (then a new submission
  replaces the old one). Auto-marking: MCQ / choose-many are all-or-nothing;
  a short answer needs a matching `accepted` entry (trimmed, case-insensitive
  unless `caseSensitive`); a table is marked pro-rata **only if every blank cell
  has an answer key**, otherwise the teacher marks it. Paragraphs are always
  teacher-marked. Challenge points are **separate from the leaderboard** — import
  them into the gradebook if you want them to count.
- **Post-test: one attempt only.** Once submitted, the server blocks re-open and
  re-submit (`openPostTest` returns `ALREADY_SUBMITTED`); the board shows a
  non-clickable "done"/"awaiting grading" state.
- **Scoring** (`game.js`): `computeScore = round(ratio × 100 × difficultyMult)`,
  where `ratio = earnedPoints / totalPoints` and difficulty multipliers are
  easy 1.0 / medium 1.25 / hard 1.5. Pass = ratio ≥ 0.6.
- **Points**: every question has `points` (default 1). A correct MCQ earns its
  points; a written answer is teacher-graded 0..points. Because the default is 1,
  older content behaves exactly as a "correct-count / total" quiz.
- **Written questions** put the attempt into `awaitingGrading`; `grading.js
  finalizeAttempt(user, lesson, mode, earned, max)` finalizes score/pass/points/
  certificate once the teacher grades.
- **Leaderboard points** (`recalcPoints`): best pre-test + best post-test score per
  level + teacher bonus adjustment.
- **Ratings** apply only to student posts (never a teacher assignment post) and
  never to your own post.
- **Private questions** are visible only to the teacher and the asking student.

---

## 9. Front-end conventions

- **No build step.** Edit files under `public/` and reload. Each HTML page loads
  `js/i18n.js` **first** (so `t()` exists), then `js/api.js`, then page scripts.
- **i18n** (`js/i18n.js`): `t(key, vars)` with `{placeholder}` substitution;
  `tDiff(difficulty)`, `fmtWhen(iso)`. Static HTML uses `data-i18n` /
  `data-i18n-ph` attributes. Language is stored in `localStorage.cq_lang`;
  switching **reloads** the page. Add every new string to **both** `en` and `th`.
- **Session** (`js/api.js`): `cq_token` + `cq_user` in localStorage;
  `guard('student'|'teacher')` redirects if wrong role; a 401 clears the session.
- **Shared feed** (`js/feed.js`) powers the assignment board for both the student
  board and the teacher console (`Feed.mount(el, lessonId, {teacher})`).
- **Teacher console** is one big file (`js/teacher.js`) with a `view` switch
  (lessons / editor / board / grading / gradebook / students / preview).
- **Mascot** "Ruby" is an **original inline SVG** in `js/character.js` — not based
  on any existing IP. Keep it that way.

---

## 10. Accounts, config & environment

- **Teacher (seeded):** `Shinozuke67@skn.ac.th` / `12345678`. Change the password
  for production. (The 🔑 reset in the console resets *student* passwords.)
- **Env vars:** `PORT` (default 4000), `JWT_SECRET` (set a strong value in
  production — it falls back to a dev default otherwise), `DATABASE_URL`
  (unset = JSON file store; set = Postgres — **required on serverless hosts**),
  `JSON_LIMIT` (default `16mb`).
- **Real student accounts currently in the DB:** Jerry, Jenny, Google,
  `sorry@skn.ac.th` (do not delete during testing).
- **Preview launch config** for the in-editor browser lives at the workspace root:
  `../.claude/launch.json` (runs `node chemquest/server.js`).

---

## 11. Git & collaboration workflow

- **Remote:** <https://github.com/Xypyion/ChemQuest>, branch **`main`**.
  Commit identity `user.name = Xypyion`; auth via Git Credential Manager (browser
  popup on first push).
- **Multiple contributors.** Always `git fetch` first and check for their
  branches/commits (`git log --oneline origin/main..origin/<branch>`). Their
  branches tend to fork from `main` HEAD, so merges are usually fast-forward.
  Merge/integrate cleanly, then continue.
- **Commit finished, verified work** with a descriptive message, then **push**
  (mandatory rule #1). Prefer new commits over amending.
- **CRLF warnings** ("LF will be replaced by CRLF") on Windows are harmless.
- **Do not commit** `data/`, `node_modules/`, or throwaway test scripts.

---

## 12. Testing

There is **no committed automated test suite**. The working pattern is:

1. Write a throwaway Node script (e.g. `test-xyz.js`) that hits the API with
   `fetch` and asserts, run it with `node test-xyz.js`, then **delete it**.
2. For UI, run the app and drive it in a browser (or DevTools console) — check the
   rendered DOM and the console for errors.
3. **Test accounts use `@test.local` emails.** Always clean them up afterward: a
   small `cleanup-test-data.js` (written, run, then self-deleted) removes
   `@test.local` users plus their posts, ratings, submissions, and (if touched)
   resets gates / closes post-tests / clears test gradebook columns. Verify the
   real students (Jerry/Jenny/Google/sorry) remain.

If you add a permanent test suite, wire it into `package.json` and document it
here.

---

## 13. Gotchas & known issues

- **Port 4000, not 3000** (rule #2). Changing to 3000 will `EADDRINUSE`.
- **Editing `data/db.json` directly** while the server is running is unsafe — the
  in-memory copy will overwrite your file on the next mutation. Stop the server,
  edit, restart.
- **Live YouTube iframes** hang some headless screenshot tools; verify the video
  step via DOM inspection instead of screenshots.
- **Simulation HTML is teacher-authored code.** It is rendered with
  `sandbox="allow-scripts allow-popups"` and **no** `allow-same-origin`, so it
  runs in an opaque origin and cannot touch the session, the token or the page.
  Keep it that way — dropping the sandbox would hand any teacher-pasted script
  full access to student sessions.
- **Data lives in `data/`** and is git-ignored, so a fresh `git clone` starts with
  an empty DB that re-seeds on first `npm start`. Back up `data/db.json` and
  `data/uploads/` to preserve real classroom data.
- **JSON store = single-classroom scale.** For many concurrent classes, migrate
  `src/db.js` to a real database (its small API — `all/find/insert/update/
  remove/save` — is the seam to swap).
- **Security to harden before public exposure:** set `JWT_SECRET`, add HTTPS via a
  reverse proxy, consider rate limiting / CAPTCHA on auth, and change the default
  teacher password. See [`security-privacy.md`](security-privacy.md).

---

## 14. Where to read more

Other docs in this folder:

| File | What |
|------|------|
| 🔴 [KNOWN-ISSUE-vercel-persistence.md](KNOWN-ISSUE-vercel-persistence.md) | **Open bug: saves fail on Vercel — diagnosis + fix plan** |
| [overview.md](overview.md) | Plain-language system overview |
| [architecture.md](architecture.md) | Deeper architecture & module notes |
| [features.md](features.md) | Full feature catalog |
| [api-reference.md](api-reference.md) | Every API endpoint, method, body, role |
| [data-model.md](data-model.md) | Field-by-field data shapes |
| [deployment.md](deployment.md) | Install, env vars, backups, production notes |
| [security-privacy.md](security-privacy.md) | Auth, roles, privacy, hardening |
| [teacher-guide-th.md](teacher-guide-th.md) | คู่มือครู (teacher user guide, Thai) |
| [student-guide-th.md](student-guide-th.md) | คู่มือนักเรียน (student guide, Thai) |
| [executive-summary-th.md](executive-summary-th.md) / `ExecutiveSummary-TH.docx` | บทสรุปผู้บริหาร (for school leadership) |

> ⚠️ Some of the reference docs above were written before the newest features
> (points-based post-test, written grading, one-attempt rule, rating criteria,
> gradebook). This HANDOFF is the most up-to-date summary; when a reference doc
> disagrees with the code, **trust the code** and update the doc.

---

## 15. Suggested next steps (optional)

Not committed to, just ideas surfaced during development:
- Reflect gradebook totals as `%` and allow weighting per column.
- Export the gradebook to CSV.
- Optional pre-test-before-post-test enforcement (currently the teacher controls
  timing via the post-test open gate).
- A committed automated test suite (`npm test`).
- Migrate the store to SQLite/Postgres if scaling beyond one classroom.

---

*Welcome aboard — and remember rule #1: push to GitHub every time a job is done.* 🚀
