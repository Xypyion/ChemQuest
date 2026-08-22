# ✅ FIXED — "Something went wrong on the server." on Vercel

> **Status:** Diagnosed **and fixed in code** on 2026-08-21. The storage layer now
> supports Postgres, which is what a serverless host needs.
>
> ### ⚠️ One manual step is still required before the live site works
>
> The code is ready, but it needs a database to talk to. **Nothing will work
> until you create a Postgres database and set `DATABASE_URL` on Vercel** —
> see [§7 Finishing the deployment](#7-finishing-the-deployment).
>
> Deployment under test: <https://chem-quest-navy.vercel.app/>

Sections 1–6 are the original diagnosis, kept as the record of *why* the fix
looks the way it does. Section 7 onward is what was changed and what you must
still do.

---

## 1. The symptom (what the users report)

- Log in / sign up, and **every "Save" action** in the app pops up the red toast
  **"Something went wrong on the server."**
- **But after refreshing the page, the change appears to have been saved.**
- Some time later, the change is **gone again**, and the level map looks empty.

That last part is the important one, and it is why this is more serious than an
annoying popup: **the data is not actually being saved at all.**

---

## 2. TL;DR root cause

StoiVenture stores all state in a **file** (`data/db.json`) via `src/db.js`.

**Vercel serverless functions run on a read-only filesystem** (only `/tmp` is
writable, and even that is per-instance and temporary). So:

1. A route mutates the **in-memory** copy of the database — this succeeds.
2. `db.persist()` then tries `fs.writeFileSync(...)` → throws **`EROFS: read-only
   file system`**.
3. That exception escapes the route, Express's error handler in
   [`server.js:36`](../server.js) catches it and returns
   `500 {"error":"Something went wrong on the server."}`.
4. The browser shows the toast.
5. **The refresh reads the same warm function instance's memory**, which *does*
   contain the change → "it saved after all".
6. When Vercel recycles that instance (idle timeout, new deploy, scaling to a
   second instance), the memory is gone and everything **resets to the seed**.

Look at the order of operations in [`src/db.js`](../src/db.js) — the mutation
always happens *before* the write, which is exactly why the change survives the
refresh but the request still 500s:

```js
insert(collection, doc) {
  db.all(collection).push(doc);   // <- succeeds, in memory
  persist();                      // <- throws EROFS on Vercel
  return doc;
}
```

**This is an architecture/hosting mismatch, not a bug in the friend's UI
redesign.** The JSON-file store was designed for one long-lived Node process on
a school machine (see [architecture.md](architecture.md) and
[HANDOFF.md](HANDOFF.md) §13). Vercel does not provide that.

---

## 3. Evidence (how this was confirmed)

All of the following was run against the live site.

### 3a. Reads work, writes 500

```
GET  /api/nope         -> 404 {"error":"Unknown API route."}        <- Express is alive
GET  /api/leaderboard  -> 401 {"error":"You need to log in first."} <- reads fine
POST /api/auth/signup  -> 500 {"error":"Something went wrong on the server."}
```

### 3b. The failed write still took effect (the "refresh fixes it" symptom)

The signup above returned **500**. Immediately afterwards, logging in with that
exact account **succeeded three times in a row** and returned a valid JWT — the
user existed. The write "failed" and yet the data was there.

The same was demonstrated in reverse with a delete:

```
DELETE /api/teacher/students/<id>  -> 500 "Something went wrong on the server."
GET    /api/teacher/students       -> {"students":[]}   <- the delete DID happen
```

That is the reported symptom reproduced exactly, on demand.

### 3c. The smoking gun — the seed is half-finished on Vercel

`seedIfEmpty()` in [`src/seed.js:237`](../src/seed.js) does exactly this:

```js
db.insert('users', { role: 'teacher', ... });                   // 1. teacher
LESSONS.forEach((lesson, i) => db.insert('lessons', { ... }));  // 2. six levels
```

On the live site, as teacher:

```
POST /api/auth/login  (Shinozuke67@skn.ac.th)  -> 200, token issued  <- teacher EXISTS
GET  /api/teacher/lessons                      -> {"lessons":[]}     <- ZERO levels
```

The teacher exists but **not one of the six levels does**. The only code between
those two statements is the `persist()` inside the first `db.insert`. It threw,
the exception escaped `seedIfEmpty()`, and the lesson loop never ran.

**This is conclusive.** It also means the production site currently has **no
lesson content at all**.

### 3d. The same code works perfectly off Vercel

A clean copy of `main` was run locally in an isolated directory:

```
[seed] First run detected — creating teacher account and sample levels...
[seed] Done. Teacher: shinozuke67@skn.ac.th / 12345678  (6 levels created)
POST /api/auth/signup -> 200, token issued
data/db.json -> written, 39315 bytes
```

Same commit, same code. 6 levels, signup 200, file written. **The code is fine;
the hosting environment is not.**

---

## 4. Second, separate problem — Vercel's 4.5 MB request body limit

`server.js` is configured for large uploads:

```js
app.use(express.json({ limit: '16mb' }));   // storyboards embed base64 images
```

Vercel caps a function's request body at about **4.5 MB** and rejects it *before*
Express ever sees it:

```
POST /api/auth/login  with a ~5 MB body
  -> 413  "Request Entity Too Large  FUNCTION_PAYLOAD_TOO_LARGE"   (plain text, not JSON)
```

Consequences, and both will bite the teacher console:

1. Saving a level with a few embedded storyboard images (docs say up to ~900 KB
   each) or a simulation question (~400 KB) can exceed 4.5 MB and **fail hard**,
   no matter how issue #1 is fixed.
2. The 413 body is **plain text, not JSON**. The front-end wrapper
   ([`public/js/api.js:29`](../public/js/api.js)) does
   `await res.json().catch(() => ({}))`, so `json.error` is `undefined` and the
   user sees the generic **"Something went wrong."** — nearly identical to issue
   #1, which makes the two easy to confuse while debugging.

> **Do not assume every "went wrong" toast is issue #1.** Check the HTTP status:
> **500** = the persistence bug, **413** = payload too large.

---

## 5. Which branch is actually deployed

Vercel is building **`main`**, *not* `ui-redesign`.

Verified by fetching `js/props.js` from the live site: it returns 111 lines
(the `main` version). That file **does not exist** on `ui-redesign`, and the
live `js/api.js` still contains `addClouds()`, which `ui-redesign` removed.

So: **the friend's redesign (`6776b9b Redesign the student UI on one design
system`) is not live.** It is a front-end-only change (CSS/HTML/JS + i18n) and it
is **not** the cause of this bug — the bug reproduces on `main`.

Also note: **there is no `vercel.json` and no `api/` directory in either
branch.** The Vercel project is configured entirely through its dashboard, so
the deployment setup is **not reproducible from the repo**. Whoever fixes this
should commit the deployment config.

---

## 6. Why `data/db.json` is empty on Vercel in the first place

`.gitignore` excludes `data/db.json` (correctly — it holds real student data).
Vercel deploys from git, so **the deployment has no database file at all**.
Every cold start begins from nothing, re-seeds into memory, and throws.

This means the real classroom data (Jerry, Jenny, Google, `sorry@skn.ac.th` —
see [HANDOFF.md](HANDOFF.md) §10) **only exists in `data/db.json` on the school
machine.** Back that file up before doing any migration work.

---

## 7. Finishing the deployment

### 7a. What was changed in the code (already done)

The store was moved off the filesystem. `src/db.js` now has **two backends**,
chosen automatically:

| `DATABASE_URL` | Backend | Used for |
|----------------|---------|----------|
| not set | `file` → `data/db.json` | local development, the school machine, any host with a real disk. **Behaviour is unchanged.** |
| set | `postgres` → table `chemquest_docs` | Vercel and any other serverless host |

Design notes, so the next person understands the shape:

- **The route code did not change.** Reads stay synchronous (`db.all`,
  `db.find`, `db.findById`…) because the whole database is still held in memory.
  Only the *persistence* moved. This avoided rewriting every route as `async`.
- **One row per document** (`collection`, `id`, `data jsonb`, `seq`), so a save
  writes only the documents that actually changed, not the whole database.
  Insertion order is preserved via `seq` (the feed and gradebook columns rely
  on it).
- **The response now waits for the durable write.** `server.js` wraps `res.json`
  on POST/PUT/PATCH/DELETE and `await`s `db.flush()` before replying. This is
  what kills the original symptom: the client can no longer be told "saved"
  before the data is actually saved — and, just as importantly, a real failure
  is now reported honestly instead of appearing to work after a refresh.
- **Each request re-reads the database** when on Postgres, because several
  serverless instances each keep their own in-memory copy and would otherwise
  serve stale data.
- **Seeding is idempotent.** The seeded teacher and levels use fixed ids, so two
  cold instances racing to seed an empty database converge on the same rows
  instead of creating duplicates.
- **Attachments** (`posts.routes.js`) also used to hit the read-only disk. On
  the Postgres backend they are stored in the database and served from
  `/uploads/db/<id>`; on a disk-backed host they still go to `data/uploads/`.
- **`vercel.json` + `api/index.js`** were added so the deployment is
  reproducible from the repo (§5). `server.js` now exports the Express app and
  only calls `listen()` when run directly.
- **Clearer errors.** A read-only disk, an unreachable database, an oversized
  upload and malformed JSON now produce distinct messages instead of one
  catch-all. `public/js/api.js` also handles non-JSON error bodies, so a
  platform-level 413/504 no longer collapses into "Something went wrong."

### 7b. ⚠️ What you still have to do by hand

The code cannot create a database or set secrets for you.

**1. Create a free Postgres database.** Any provider works — [Neon](https://neon.tech),
[Supabase](https://supabase.com), or Vercel's own Postgres integration. Copy the
connection string; it looks like:

```
postgresql://user:password@host.neon.tech/dbname?sslmode=require
```

**2. Move the existing data into it.** Run this on the machine that has the real
`data/db.json` (back that file up first):

```bash
DATABASE_URL="postgresql://…" npm run migrate
```

It prints how many documents landed in each collection. It refuses to run
against a database that already has rows unless you add `--force`.

**3. Set the environment variables in Vercel** (Project → Settings →
Environment Variables), for Production *and* Preview:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | the connection string from step 1 |
| `JWT_SECRET` | a long random string — **do not skip this**, it currently falls back to a development default |

**4. Redeploy**, then run the checks in §7c.

> **If `DATABASE_URL` is missing, the app falls back to the file backend and the
> original bug comes straight back.** The server logs a loud warning at boot when
> it detects a serverless host with no `DATABASE_URL` — check the Vercel function
> logs if saves still fail.

### 7c. How to verify it is actually fixed

```bash
curl -s -w "\nstatus=%{http_code}\n" -X POST https://chem-quest-navy.vercel.app/api/auth/signup -H "Content-Type: application/json" -d '{"name":"Probe","email":"probe@test.local","password":"12345678","difficulty":"easy"}'
```

- [ ] That returns **201**, not 500.
- [ ] `GET /api/teacher/lessons` (with a teacher token) returns the real levels,
      not `[]`.
- [ ] Save a lesson in the teacher console — **no error toast**.
- [ ] **Wait 15+ minutes, then reload and confirm the change is still there.**
      This is the step that actually proves it; an immediate refresh proves
      nothing, because that was the very illusion the old bug created.
- [ ] Delete the `probe@test.local` account afterwards (HANDOFF.md §12).

### 7d. Still worth doing (not blocking)

1. **The 4.5 MB payload limit (§4) is not fixed.** Storyboard and challenge
   images are still stored inline as base64. A save with several large images
   can still exceed Vercel's cap. The fix is to move images to real file storage
   (Vercel Blob / S3 / Cloudinary) and keep only URLs in the database — the same
   change already recommended in [deployment.md](deployment.md) and HANDOFF.md §13.
2. **Attachments in Postgres are a stopgap.** It works and needs no extra
   service, but base64 blobs in the database will bloat it. Same fix as above.
3. **Concurrent edits are last-write-wins per document.** Two teachers editing
   the same lesson at the same moment: the later save wins. Fine at classroom
   scale; add optimistic locking (a version column) if that ever matters.
4. **No automated test suite is committed.** The change was verified with a
   26-check API smoke test run against both backends; consider committing
   something like it as `npm test`.

### 7e. How this was tested

Both backends were exercised end-to-end before this was written:

- A **26-check API smoke test** (auth, lesson CRUD, gate, rating criteria,
  gradebook incl. column deletion, challenges, posts, attachments, comments,
  likes, student map, leaderboard, certificates, deletions) passed **26/26 on
  the file backend and 26/26 on a real Postgres**.
- Postgres was a real engine (PGlite over the Postgres wire protocol), not a mock.
- **Durability across a restart** was confirmed: data written in Postgres mode
  survived a full process restart, with `data/db.json` moved out of the way so
  the file backend could not be the source.
- **Seeding an empty Postgres** produced the teacher **and all 6 levels** — the
  exact thing that failed on Vercel — and a restart did **not** duplicate them.
- **Failure is honest:** with the database killed, a save returns **503 "your
  change was NOT saved"** rather than reporting success.
- The file backend was confirmed unchanged for the school machine, attachments
  included.

## 8. Quick reference — reproducing it yourself

```bash
curl -s -w "\nstatus=%{http_code}\n" -X POST https://chem-quest-navy.vercel.app/api/auth/signup -H "Content-Type: application/json" -d '{"name":"Probe","email":"probe@test.local","password":"12345678","difficulty":"easy"}'
```

That should return **500**. Then log in with the very same account — it works,
despite the 500 above:

```bash
curl -s -X POST https://chem-quest-navy.vercel.app/api/auth/login -H "Content-Type: application/json" -d '{"email":"probe@test.local","password":"12345678"}'
```

Per HANDOFF.md §12, test accounts use `@test.local` — clean them up afterwards.
(On Vercel they disappear on the next cold start anyway.)

---

## 9. Files involved

| File | Role in this bug |
|------|------------------|
| [`src/db.js`](../src/db.js) | `persist()` — the `fs.writeFileSync` that throws. **The seam to replace.** |
| [`server.js`](../server.js) | Error handler producing the exact toast text; `express.json({limit:'16mb'})`. |
| [`src/seed.js`](../src/seed.js) | `seedIfEmpty()` — dies after the teacher insert, leaving 0 lessons. |
| [`public/js/api.js`](../public/js/api.js) | Surfaces `json.error`; falls back to the generic message on non-JSON bodies. |

---

*Diagnosed and fixed 2026-08-21. The fault was reproduced against the live
deployment, and the fix was verified against both storage backends — but the
live site stays broken until `DATABASE_URL` is set on Vercel (§7b).*
