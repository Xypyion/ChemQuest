# API Reference

Base URL: `http://localhost:4000`. All payloads are JSON.
Authenticated requests send `Authorization: Bearer <JWT>`. A `401` clears the session and
redirects to the login page; a `403` means wrong role or a locked resource.

Roles: **public** (no token), **student**, **teacher**.

---

## Auth — `/api/auth`

| Method | Path | Role | Body | Notes |
|--------|------|------|------|-------|
| POST | `/api/auth/signup` | public | `{ name, email, password, difficulty }` | Creates a **student**. `password` ≥ 6 chars; `difficulty` ∈ easy/medium/hard. Returns `{ token, user }`. |
| POST | `/api/auth/login` | public | `{ email, password }` | Works for students and the teacher. Email is case-insensitive. Returns `{ token, user }`. |
| GET | `/api/auth/me` | any | — | Returns the current `{ user }`. |

---

## Lessons (student) — `/api/lessons`

All require a **student** token.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/api/lessons` | — | The map: every level with `locked`, `lockReason`, `opensAt`, `completed`, `preDone`, `bestScore`, `postTest` summary. |
| GET | `/api/lessons/:id` | — | Full level. Answers stripped, plus `activities` (see below). The storyboard is empty when `storyLocked`; the questions are empty when `preLocked`. `403` if the level is locked. |
| POST | `/api/lessons/:id/story-complete` | — | Marks the storyboard as read (`progress.storyDone`). This is what unlocks the pre-test under `story-first`. `403` `STORY_LOCKED` if the storyboard is not open yet. |
| POST | `/api/lessons/:id/check` | `{ questionIndex, answer }` | Instant feedback for one pre-test question. |
| POST | `/api/lessons/:id/complete` | `{ answers: [...] }` | Grades the pre-test, awards a certificate on first pass, recalculates points. |
| GET | `/api/lessons/:id/posttest` | — | Post-test questions. `403` unless the level is unlocked **and** the post-test is open. |
| POST | `/api/lessons/:id/posttest/check` | `{ questionIndex, answer }` | Instant feedback for one post-test question. |
| POST | `/api/lessons/:id/posttest/complete` | `{ answers: [...] }` | Grades the post-test, adds points (no certificate). Passing unlocks the next level. |
| GET | `/api/lessons/me/certificates` | — | The student's earned certificates. |

**Lock reasons** (`lockReason`): `teacher` (force-locked), `scheduled` (with `opensAt`),
`posttest` (previous post-test not passed), `progress` (previous level not done).

**`activities`** (on `GET /api/lessons/:id`) — the storyboard and the pre-test are
two separate activities and the teacher picks the order:

```jsonc
{ "flow": "story-first",   // story-first | test-first
  "hasStory": true, "hasPre": true,
  "storyDone": false, "preAttempted": false, "prePassed": false,
  "storyLocked": false,    // true → the storyboard is not open yet
  "preLocked": true }      // true → /check and /complete return 403 PRETEST_LOCKED
```

An activity the student already finished never locks again.

---

## Teacher — `/api/teacher`

All require a **teacher** token.

### Lessons

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/api/teacher/lessons` | — | All lessons (full objects, including answers, post-test, gate). |
| GET | `/api/teacher/lessons/:id` | — | One full lesson. |
| POST | `/api/teacher/lessons` | lesson | Create. |
| PUT | `/api/teacher/lessons/:id` | lesson | Update (preserves post-test `open` state and gate). |
| DELETE | `/api/teacher/lessons/:id` | — | Delete. |
| POST | `/api/teacher/lessons/:id/move` | `{ direction: 'up'\|'down' }` | Reorder on the map. |
| POST | `/api/teacher/lessons/:id/posttest-open` | `{ open: bool }` | Open/close the post-test for all students. |
| POST | `/api/teacher/lessons/:id/gate` | `{ mode, openAt? }` | Set access gate. `mode` ∈ `auto`/`locked`/`scheduled`; `openAt` (ISO) required for `scheduled`. |

The lesson body also takes **`flow`** (`story-first` | `test-first`) — which of
the two level activities the student must do first.

**Lesson body shape** (create/update):
```jsonc
{
  "title": "What is Matter?",
  "description": "…",
  "terrain": "plain",            // plain | mountain | snow
  "icon": "🌱",
  "timeLimit": 90,                // pre-test seconds, 0 = none
  "storyboard": [
    { "type": "line", "character": "Ruby", "mood": "happy", "text": "…", "image": "" },
    { "type": "video", "url": "https://youtu.be/…", "title": "…" }
  ],
  "quizzes": {                    // pre-test, per difficulty
    "easy":   [{ "question": "…", "choices": ["…"], "correctIndex": 1, "explanation": "…" }],
    "medium": [ … ],
    "hard":   [ … ]
  },
  "postTest": {                   // separate quiz
    "timeLimit": 45,
    "quizzes": { "easy": [ … ], "medium": [ … ], "hard": [ … ] }
  }
}
```

### Students

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/api/teacher/students` | — | Roster with points, difficulty, certificates, levels completed. |
| PUT | `/api/teacher/students/:id` | `{ name?, difficulty?, points? }` | Edit; `points` sets an absolute ranking via a bonus adjustment. |
| POST | `/api/teacher/students/:id/password` | `{ password }` | Reset password (≥ 6 chars). |
| DELETE | `/api/teacher/students/:id` | — | Delete the account. |

---

## Assignment board — `/api/posts`

Both roles. A teacher's post is flagged `isAssignment: true` and pinned to the top.

| Method | Path | Role | Body | Notes |
|--------|------|------|------|-------|
| GET | `/api/posts/lesson/:lessonId` | any | — | Feed for a level. Private questions are filtered: teacher sees all, a student sees only their own. |
| POST | `/api/posts/lesson/:lessonId` | any | `{ text, attachments?[] }` | Create a post. Attachments: `{ name, type, data }` (base64 data URL); ≤ 6 files, ≤ 8 MB each, saved to `/uploads`. |
| POST | `/api/posts/:id/comment` | any | `{ text }` | Add a comment. |
| DELETE | `/api/posts/:id/comment/:cid` | author/teacher | — | Delete a comment. |
| POST | `/api/posts/:id/like` | any | — | Toggle like. |
| POST | `/api/posts/:id/question` | student | `{ text }` | Private question to the teacher. **Only allowed on a teacher assignment post** (else `403`). |
| DELETE | `/api/posts/:id` | author/teacher | — | Delete the post (also removes its files). |

---

## Challenges (student) — `/api/challenges`

All require a **student** token. A challenge is only reachable when it is
published **and** assigned to the caller.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/api/challenges/lesson/:lessonId` | — | The challenges assigned to me on this level, plus the category list. Each card carries `status` (`todo`/`submitted`/`graded`), `earned`, `maxPoints`, `dueAt`. |
| GET | `/api/challenges/:id` | — | The challenge to answer. Answer keys are stripped. Returns `mySubmission` when one exists and `locked: true` when it was handed in and retakes are off. |
| POST | `/api/challenges/:id/submit` | `{ answers }` | Hand in. Auto-markable questions are scored immediately; anything else waits for the teacher. `403 ALREADY_SUBMITTED` on a second attempt without `allowRetake`. |
| GET | `/api/challenges/:id/result` | — | My marked result (score, per-question outcome, teacher feedback). |

**Answer shapes** (keyed by question id; simulation sub-questions use their own ids):
`mcq` → number · `multi` → number[] · `short`/`written` → string ·
`table` → `{ "<row>_<col>": "text" }`.

## Challenges (teacher) — `/api/teacher/challenges`

All require a **teacher** token.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/api/teacher/challenges` | — | Every challenge (summaries), the categories, and `pending` = responses waiting to be marked. |
| GET | `/api/teacher/challenges/item/:id` | — | One challenge in full, **with** answer keys, for the editor. |
| POST | `/api/teacher/challenges` | challenge | Create. `lessonId` must name a real level. |
| PUT | `/api/teacher/challenges/:id` | challenge | Update. |
| DELETE | `/api/teacher/challenges/:id` | — | Delete the challenge **and its responses**. |
| POST | `/api/teacher/challenges/:id/publish` | `{ published }` | Show/hide it for students. |
| POST | `/api/teacher/challenges/:id/assign` | `{ mode, studentIds? }` | `mode` ∈ `all`/`some`. |
| POST | `/api/teacher/challenges/:id/move` | `{ direction }` | Reorder (`up`/`down`). |
| POST | `/api/teacher/challenges/categories` | `{ categories:[{id?,name,icon}] }` | Bulk save (add / rename / reorder / delete). Challenges in a deleted category become uncategorised. |
| GET | `/api/teacher/challenges/:id/responses` | — | The whole class set — see the shape below. |
| POST | `/api/teacher/challenges/responses/:sid/grade` | `{ scores:{qid:n}, feedback? }` | Award the manual parts and finalise the score. |

**Responses payload.** The question list is sent once, then every student's answer
to **every** question — not only the ones still waiting for a mark:

```jsonc
{
  "challenge": {
    "id": "…", "title": "…", "icon": "🧩", "maxPoints": 21,
    "questions": [{                  // flattened: a simulation contributes its sub-questions
      "id": "…", "type": "mcq", "question": "…", "points": 2,
      "guide": "…",                  // the teacher's private marking note
      "expected": "a compound",      // the correct answer as text ('' for paragraphs)
      "simTitle": "",                // the simulation this question sits under, if any
      "choices": ["…"],              // mcq / multi
      "table": { "columns": [], "rows": [] }   // table, with answer keys
    }]
  },
  "assignedCount": 12,
  "missing": [{ "id": "…", "name": "…", "email": "…", "avatar": "🧑‍🎓" }],
  "responses": [{
    "id": "…", "userId": "…", "userName": "…", "userEmail": "…", "userAvatar": "🧑‍🎓",
    "status": "pending", "autoEarned": 11, "earned": null, "maxPoints": 21,
    "feedback": "", "createdAt": "ISO", "gradedAt": null,
    "answers": [{                    // same order as challenge.questions
      "questionId": "…",
      "raw": 0,                      // as the student sent it (number | number[] | string | {cell:value})
      "text": "a compound",          // readable — table cells read "Solid / Shape: fixed"
      "answered": true,
      "auto": true,                  // false = only the teacher can mark it
      "correct": true,               // null when not machine-markable
      "earned": 2,                   // null while a manual part is unmarked
      "max": 2,
      "awarded": null,               // what the teacher gave a manual part
      "needsMark": false
    }]
  }]
}
```

Question **images are not included** — they can be megabytes of data-URI and the
teacher wrote the question themselves. The CSV export in the teacher console is
built in the browser from this payload, so no token ever appears in a URL.

`POST /api/teacher/gradebook/import` also accepts `{ challengeId }` to create a
gradebook column filled with each student's challenge points.

## Leaderboard — `/api/leaderboard`

| Method | Path | Role | Notes |
|--------|------|------|-------|
| GET | `/api/leaderboard` | any | All students ranked by points: `{ leaderboard[], meId, total }`. |
