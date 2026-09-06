# StoiVenture — start here

You are an AI agent picking up **StoiVenture**, a bilingual (ไทย / English)
chemistry learning game built for **Suankularb Wittayalai Nonthaburi School**
(โรงเรียนสวนกุหลาบวิทยาลัย นนทบุรี).

**It is in use by a real class.** The database on the school machine holds real
students' real work. There is no staging environment and no undo. Read this file
before you touch anything.

This file is written to survive the app changing under it. It states the **rules
and the reasoning**, which are stable, and tells you **how to look up the
facts**, which are not. Where it gives you a command instead of a number, run
the command — the number was going to be wrong by the time you read it.

---

## 1. The ten rules

Break these and you lose student data, break a lesson, or leave a mess for
somebody else.

1. **Port 4000, never 3000.** Port 3000 is permanently occupied on the school
   machine. `npm start` already uses 4000; override only with `PORT`.
2. **Never commit `data/`.** `data/db.json` is the live database with real
   students in it, and `data/uploads/` holds their files. Both are git-ignored
   on purpose. Never `git add -f` them.
3. **Every user-facing string goes through i18n, in BOTH `en` and `th`.** A
   missing Thai key is a bug, not a to-do. §3 has the command that proves parity.
4. **`git fetch` before you start.** More than one person pushes here, and there
   are usually unmerged branches. §3.
5. **Verify before you claim done.** Actually run it, actually click it. Do not
   ask the user to test for you, and do not report success you have not seen.
6. **Keep the dependency list tiny.** Five runtime deps today. "Install Node,
   `npm start`" is a feature for a school with no IT department. No framework,
   no bundler, no build step. This is why `src/config.js` parses `.env` by hand
   instead of pulling in `dotenv`.
7. **Clean up test data.** Test accounts use `@test.local` emails and test
   content is prefixed `[test]`. Remove both when you finish, then check the
   real accounts survived. §7.
8. **The server is the authority, always.** The client greys out illegal actions
   for UX only. Every rule — level locks, one-attempt post-tests, coin stakes,
   quest windows, badge awards, Lab payouts — is re-checked server-side. Never
   move a rule into the browser.
9. **Do not widen the HTML simulation sandbox.** `simFrameHtml()` in
   `public/js/challenge.js` has two modes and only one is dangerous:
   - **HTML mode** — teacher-pasted code in `srcdoc`, `sandbox="allow-scripts
     allow-popups"`, deliberately **no** `allow-same-origin`. Adding it would put
     teacher-pasted script on *our* origin with the student's token.
   - **URL mode** — a third-party page, where `allow-same-origin` is safe because
     the frame's origin is the remote site's, not ours.
10. **Push a branch; the owner merges.** Commit finished, verified work with the
    docs updated in the same commit. Do not push to `main` unless the owner asks
    you to in this conversation.

---

## 2. Run it

Node 18+ (tested on 25). No database server, no build step.

```bash
npm install
npm start          # http://localhost:4000
npm run dev        # same, with --watch
npm run teacher    # change the teacher login on an existing database
```

First run seeds a teacher plus sample lessons. To reset: stop the server, delete
`data/db.json`, start again.

**Do not guess the logins.** The seed default is in `src/seed.js` and the machine
you are on may have a different teacher. Read them:

```bash
node -e "console.log(require('./data/db.json').users.map(u=>u.role+'  '+u.name+'  <'+u.email+'>').join('\n'))"
```

Anything that is not an `@test.local` address is somebody's real account.

---

## 3. Orient yourself before you write code

These commands answer "what is true *today*". Run them; do not trust a number
written in any document, including this one.

```bash
# Where is everyone? What is unmerged?
git fetch origin --prune
git log --oneline origin/main -10
git branch -a --format='%(refname:short)  %(committerdate:relative)'

# What is on this branch that main does not have, and vice versa?
git log --oneline main..HEAD
git log --oneline HEAD..origin/main

# Will my branch still merge?
git merge-tree --write-tree --name-only main <my-branch> | grep CONFLICT
```

```bash
# i18n parity — rule 3. Must print 0 missing on both sides.
node -e "
const s=require('fs').readFileSync('public/js/i18n.js','utf8');const c=s.indexOf('  th: {');
const en=[...s.slice(0,c).matchAll(/^\s{4}'([^']+)':/gm)].map(m=>m[1]);
const th=[...s.slice(c).matchAll(/^\s{4}'([^']+)':/gm)].map(m=>m[1]);
const se=new Set(en),st=new Set(th);
console.log('en',en.length,'th',th.length);
console.log('missing th:',en.filter(k=>!st.has(k)));
console.log('missing en:',th.filter(k=>!se.has(k)));"

# Every t('key') used in JS that does not exist. (Prefix-only hits like
# 'dash.state.' are built at runtime and are fine.)
node -e "
const fs=require('fs');const s=fs.readFileSync('public/js/i18n.js','utf8');
const en=new Set([...s.slice(0,s.indexOf('  th: {')).matchAll(/^\s{4}'([^']+)':/gm)].map(m=>m[1]));
for(const f of fs.readdirSync('public/js').filter(f=>f.endsWith('.js')&&f!=='i18n.js'))
  for(const m of fs.readFileSync('public/js/'+f,'utf8').matchAll(/\bt\(\s*'([^']+)'/g))
    if(!en.has(m[1])) console.log(f,'->',m[1]);"
```

```bash
# The shape of the app, from the app rather than from prose.
ls src src/routes public/js public/*.html
node -pe "Object.keys(require('./package.json').dependencies).join(', ')"
grep -n "app.use('/api" server.js          # every mounted router
```

---

## 4. Shape of the thing

Two audiences, one Express server, **no framework anywhere**.

```
Browser (plain HTML/CSS/JS)          Express (server.js)          storage
  localStorage: cq_token, cq_user      /api/auth                    file: data/db.json
  localStorage: cq_lang (en|th)        /api/lessons                   — atomic tmp+rename
        │                              /api/challenges              OR
        │  fetch() + Bearer <JWT>      /api/quests  /api/battles    postgres: one row per
        └───────────────────────────►  /api/lab     /api/tutor        document, selected
                                       /api/posts                     automatically when
                                       /api/teacher/*                 DATABASE_URL is set
                                       static public/*
```

- **`src/db.js`** keeps the whole database **in memory**, so every read in route
  code is synchronous. Mutations (`insert/update/remove/save`) change memory and
  mark it dirty; the durable write happens in `flush()`.
- **`server.js` awaits `flush()` before replying to any mutating request.** This
  is not decoration — it is the fix for saves that returned 500 while appearing
  to work after a refresh. Do not "optimise" it away.
- Auth is a JWT in `localStorage`; `authMiddleware` loads the user onto
  `req.user` and `requireRole()` gates each router.

### Modules to understand before you touch anything

| File | Why it matters |
|---|---|
| `src/challenges.js` | **The question engine.** Normalising, sanitising, and `gradeQuestion` — the one place answers are marked. Quests, battles, duels and the Lab are layers on top. |
| `public/js/qrender.js` | **Shared** question markup + answer collection for the challenge, quest, battle and duel players. Its output must keep matching `gradeQuestion` (index for mcq, index array for multi, `{"row_col": value}` for table). Change it and test every player. |
| `src/db.js` | The storage seam. Its small API is what you swap to change backends. |
| `src/game.js` | Scoring, pass rule, level unlock, activity order. |
| `src/uploads.js` | Storing an uploaded file on **either** kind of host — disk, or the `uploads` collection when the filesystem is read-only. Use it; do not re-implement it. |
| `public/js/api.js` | fetch wrapper, session guard, `chem()`/`toSubscript()`, `mountNav()`, toasts. |

Every page loads `icons.js`, then **`i18n.js` before `api.js`** (so `t()` exists),
then page scripts. Order matters.

---

## 5. The features, and the rules inside them

Run `grep -n "app.use('/api" server.js` for the current list. What follows is
what each one *means*.

**Levels.** Map → level board → storyboard, pre-test, assignments, challenges,
post-test. A level unlocks when the teacher's gate is open (`auto` / `locked` /
`scheduled`) **and** the previous level is done. Storyboard and pre-test are two
activities; `lesson.flow` decides the order and the second stays locked until the
first is finished — but an activity already completed never re-locks.
Score = `round(ratio × 100 × difficultyMultiplier)`, easy 1.0 / medium 1.25 /
hard 1.5. Pass = 60%. **Post-test: one attempt, ever** — the server refuses a
re-open. Certificate on the first pre-test pass.

**Challenges.** Teacher-built worksheets per level, in categories, assigned to
everyone or to picked students. Six question types: mcq, choose-many, short,
paragraph, fill-in-the-table, and **simulation** (teacher HTML in a sandboxed
iframe with its own sub-questions — rule 9). Auto-markable answers score on
submit; the rest queue for the teacher, who sees every student's answer to every
question and can export the class set to CSV.

**Daily Quests + coins.** Short teacher-assigned questions that pay **coins**.
Auto-markable types only — coins land on submit, so nothing may wait for marking.
Payout is `round(reward × earned / maxPoints)`, one attempt, and the open/close
window is enforced **server-side** (unlike a challenge's advisory `dueAt`).

**Coin Battles.** Two ways to stake coins, sharing one set of limits:
- A **raid** — the attacker answers questions from the teacher's bank and takes
  the stake off a classmate, or hands the same number over. The opponent is
  passive.
- A **duel** — the challenger *writes* the question, Kru CJ checks it, and the
  classmate they send it to is the one who answers. Declining costs nothing, on
  purpose: a student who cannot refuse has been handed a way to bully a
  classmate out of their coins.

`battles.canAttack()` / `canDuel()` are the gates. Raids and duels share one
daily allowance and one per-opponent cooldown, so a duel is not a way around
either. Drawn questions are stored **on the battle document**, so abandoning a
hard draw is a loss, not a free re-roll. `transferCoins()` caps the move at what
the loser holds — no balance can go negative.

**The Lab.** Small chemistry games that pay coins and drop elements into a
periodic-table collection. The server picks and stores every round and strips the
answer before sending it. There is a **daily coin ceiling** because the Lab
*mints* currency — uncapped, it would make quests pointless and the tutor free.
Elements keep dropping after the ceiling, so there is still a reason to play.
`src/elements.js` and `src/labFacts.js` are checked-in data, deliberately not
model-generated — read their headers for why.

**Badges.** A picture the teacher uploads, attached to a challenge; students earn
it by finishing that challenge. *(At the time of writing this lives on an
unmerged branch — check `git branch -a`.)*

**Chemistry formulas — two halves, easy to confuse.**
- `chem(text)` — **display**. Escapes, then wraps formula digits in `<sub>`. Use
  it instead of `escapeHtml()` wherever chemistry is shown.
- `toSubscript(text)` — **input values**, real ₂ characters; `unsubscript()`
  reverses it.
- Both share one element table, so `M4`, `Level 2` and `COVID19` are left alone.
- `public/js/chemkey.js` is the on-screen key bar that lets a student actually
  type ₂. It auto-attaches by CSS selector — give a chemistry field one of the
  classes it already looks for rather than wiring it up by hand.
- **Marking folds ₂ → 2**, so `H2O` and `H₂O` are the same answer. Any new
  comparison must go through `norm()` in `src/challenges.js`.

**Coins are not points.** `game.recalcPoints()` rebuilds `user.points` from quiz
scores on every award path, so anything you fold into `points` gets wiped. Coins
live on `user.coins` / `user.coinsEarned`, the element collection on
`user.elements`, all deliberately outside it. The leaderboard ranks on `points`.

---

## 6. The AI features — read this before touching a prompt

Several things talk to Gemini. They are **not** interchangeable, and the
difference is a safety property, not a style choice.

| File | Is it given the answer? | Why |
|---|---|---|
| `src/tutor.js` | **No, never** | It helps a student who is trying to work one out. It is handed `sanitizeQuestion()` output — the same projection the browser gets — so it cannot leak a key it was never given. |
| `src/aiQuestions.js` | **Yes** | Producing an answer key, or checking a student's own key, *is* the job. Nothing it sees is secret from the person who asked. |
| `src/aiMarking.js` | **Yes, and this is the risky one** | It must see the teacher's expected answer to compare against it. Its own header explains the three containments — read them before changing a prompt. |

Rules that hold across all of them:

- **One model name, one place.** `config.aiModel()`, overridable with
  `GEMINI_MODEL`. Moving to a different model is an `.env` edit, not a hunt
  through source files.
- **Thinking level is negotiated, not assumed.** Bigger models accept
  `thinking_level`; Lite ones often do not, and which is which changes with each
  release. `config.thinkingFor()` asks, notices a 400 that names it, remembers,
  and carries on without. Never hardcode it again.
- **Thinking spends the output budget.** A reply that ran out of tokens comes
  back empty or cut off mid-JSON. If you see `AI_EMPTY` / `AI_BAD_JSON`, raise
  `max_output_tokens` before you blame the prompt.
- **Daily caps are the API bill, not a game rule.** `src/aiLimit.js` is a plain
  per-person counter. The tutor's coin price (`src/tutorCredit.js`) is the game
  rule, and they are deliberately separate. `0` means **unlimited** — never ship
  that to a class on a free tier.
- **Take payment before the `await`.** `db.js` has no transactions, so a check
  after an await lets two concurrent requests both pass it.
- **Refund when the student got nothing.** Every failure path gives the call or
  the coins back.
- **Say which failure it was.** `aiQuestions.failureOf()` maps a thrown error to
  `AI_BUSY` (provider rate limit) / `AI_BAD_KEY` (401/403) / `AI_FAILED`.
  Collapsing everything into one message makes a misconfigured deployment
  undiagnosable.
- **Without `GEMINI_API_KEY` every AI feature switches itself off** and the rest
  of the app is unaffected. Keep it that way.

---

## 7. How to work here

**There is no committed test suite and `npm test` does not exist.** The pattern
that works:

1. Write a throwaway Node script that hits the API with `fetch` and asserts.
   Run it, then delete it — do not commit it.
2. For UI, run the app and drive it in a browser. Check the rendered DOM and the
   console. You can drive the real controls from the console — click the real
   button, push a real `File` through the real `<input type=file>` — rather than
   calling internal functions, which proves less.
3. **Test in both languages.** Switching `localStorage.cq_lang` to `th` and
   reloading catches missing keys that parity checks miss.

**Cleaning up (rule 7).** Test accounts use `@test.local`. Give test content a
`[test]` prefix in its name/title so it can be found again — badges, challenges
and quests are not keyed to a user and will otherwise survive an account purge
and pollute your next run. Then prove you left nothing behind:

```bash
# Compare the live database against a known-good copy, collection by collection.
node -e "
const fs=require('fs');
const a=JSON.parse(fs.readFileSync('<pristine>/data/db.json','utf8'));
const b=JSON.parse(fs.readFileSync('data/db.json','utf8'));
for(const k of new Set([...Object.keys(a),...Object.keys(b)])){
  const x=Array.isArray(a[k])?a[k].length:null, y=Array.isArray(b[k])?b[k].length:null;
  if(x===null&&y===0) continue;           // a new empty collection is fine
  if(x!==y) console.log('DIFFERS',k,x,'->',y);
}"
```

Uploaded files leak too: a badge or attachment written during a test leaves a
file in `data/uploads/` even after its document is gone. Delete only files that
are both unreferenced by the database **and** absent from the known-good copy.

**Finishing.** Commit with the docs updated in the same commit, push a branch,
and tell the owner what you did **and what you did not verify**. If something is
untested, say so in the commit message — a claim you cannot back is worse than
a gap you named.

---

## 8. Things that will bite you

- **Editing `data/db.json` while the server runs** — the in-memory copy
  overwrites your file on the next mutation. Stop, edit, restart.
- **db.json grows.** Storyboard images, challenge question images and simulation
  HTML are stored inline. A picture-heavy level pack bloats it fast. Anything
  new that stores bytes should go through `src/uploads.js`, which keeps the
  document small and serves the file by URL.
- **Teacher editors repaint their whole pane** on any structural change. They
  read `.value` back into a draft first (`syncDraft`). Anything that changes a
  field programmatically must dispatch an `input` event, or the edit is silently
  lost.
- **`API.call()` treats every 401 as a dead session** — it clears the token and
  redirects to `/`. A wrong-password check must return **403**, not 401, or you
  log the user out for a typo.
- **Never spread an options object over your own answer.** A response like
  `{ ok: <verdict>, ...quotaStatus }` silently loses the verdict when the quota
  object also has an `ok`. This shipped once and made a rejected question look
  approved. Give the two fields different names.
- **Coin transfers are not atomic across serverless instances.** Two battles
  against the same defender on two instances can each read the balance before
  either flushes. Nobody goes negative, but the pair can over-deduct.
  Single-process (`npm start`) is unaffected. A proper fix needs a conditional
  UPDATE rather than the whole-document diff `db.js` does today.
- **Deleting a student leaves their history behind**, so teacher logs can name an
  account that no longer exists.
- **`AVATARS` in `auth.routes.js` is append-only.** The first twelve are what
  existing accounts already store; reordering breaks those avatars.
- **Changing a password does not end other sessions** — tokens carry only `id`
  and `role`. Fixing that needs a token version on the user record.
- **Live YouTube iframes** hang some headless screenshot tools. Verify a video
  step by inspecting the DOM instead.

---

## 9. Deployment

Two modes from one codebase:

- **`npm start`** — long-lived Node process (school machine, Render, Railway).
  Uses the file backend.
- **Serverless** — `api/index.js` imports the exported Express app; `vercel.json`
  routes everything there. Nothing calls `listen()`.

**Serverless hosts have a read-only filesystem**, so the file backend cannot work
there. `src/db.js` selects Postgres automatically when `DATABASE_URL` is set.

Things that have actually gone wrong on Vercel, in the order they are worth
checking:

1. **`.env` is git-ignored and therefore never deployed.** Every variable has to
   be set again in the host's dashboard, for Production *and* Preview.
2. **Changing a variable does not affect deployments that already exist.** You
   must redeploy. A preview built before a key was fixed keeps using the old one
   and 401s while production works — the same variable, different result.
3. **Function timeouts kill slow AI calls.** A Gemini call that thinks first can
   take tens of seconds against a default cut-off of 10. `vercel.json` sets
   `maxDuration`; if it still bites, ask for fewer questions or set
   `GEMINI_THINKING=low`.
4. **Read the function log.** Every model call logs how long it took and every
   failure logs the provider's HTTP status. That line is the diagnosis.
5. Request bodies are capped around 4.5 MB, well under `JSON_LIMIT` — a big image
   upload is rejected before Express sees it.

`.env.example` documents every variable. `docs/KNOWN-ISSUE-vercel-persistence.md`
has the long version.

---

## 10. Where to read more, and how much to believe it

| File | What |
|---|---|
| `docs/HANDOFF.md` | The long-form tour |
| `docs/api-reference.md` | Every endpoint, method, body, role |
| `docs/data-model.md` | Field-by-field data shapes |
| `docs/features.md` | Full feature catalogue |
| `docs/architecture.md` · `docs/deployment.md` · `docs/security-privacy.md` | Deeper notes |
| `docs/KNOWN-ISSUE-vercel-persistence.md` | The deployment blocker, with fix steps |
| `docs/teacher-guide-th.md` · `docs/student-guide-th.md` | คู่มือผู้ใช้ (Thai) |

**Where a doc and the code disagree, the code is right.** These documents have
drifted before — a renamed mascot, a stale file tree, a wrong repo URL, a list of
students who had left, a dependency count that was one short. Every one of those
was a *fact asserted in prose* that nobody updated when the code moved.

So: **fix drift as you touch it**, and when you write documentation, prefer a
command that derives the answer over a number that will be wrong next month.
That is the reason §3 of this file exists in the form it does.

The source files themselves are the most reliable documentation here. The
important ones open with a header explaining not just what they do but *why they
are built that way* — `src/aiMarking.js`, `src/elements.js`, `src/lab.js`,
`src/battles.js` and `src/db.js` are worth reading in full before you change
them. Keep that habit: when you add a file, explain the decision, not the syntax.

---

## 11. One last thing

This is a school project used by real students, and it is somebody's actual
class. When you are unsure whether a change is safe, **check the data first and
ask second** — not ship and find out.
