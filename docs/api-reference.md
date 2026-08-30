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
| GET | `/api/auth/profile` | any | — | The account plus the summary Settings shows: `{ user, avatars, stats }`. `avatars` is the whitelist the picker offers; `stats` is `{ points, coins, certificates, levelsDone, levelsTotal, joinedAt }`. `levelsDone` is counted with `game.levelDone`, so it agrees with the map. |
| PATCH | `/api/auth/me` | any | `{ name?, avatar? }` | Self-service edit of display name and avatar. `name` is trimmed, must be non-empty and ≤ 40 chars. `avatar` must be one of the strings in `avatars` — it is a whitelist, not a length check, because the value is rendered into the leaderboard, battles and the feed. Any other field in the body is **ignored**: `difficulty`, `points`, `coins` and `role` are not self-settable. |
| POST | `/api/auth/password` | any | `{ currentPassword, newPassword }` | Change your own password. `currentPassword` must verify even though the token already identifies the caller — 30-day tokens on shared school machines. `newPassword` ≥ 6 chars and must differ from the current one. Returns `{ ok, token }` with a fresh token. **Returns 403, not 401, on a wrong current password**: the browser's fetch wrapper treats every 401 as an expired session and logs the user out, so a typo would end the session. Does not invalidate tokens on other devices. |

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
    { "type": "line", "character": "Kru CJ", "mood": "happy", "text": "…", "image": "" },
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

## Daily Quests (student) — `/api/quests`

Teacher-assigned side questions that pay an in-game currency ("coins"). Every
question is auto-marked, so coins are awarded the moment the student submits.

| Method | Path | Role | Notes |
|--------|------|------|-------|
| GET | `/api/quests/wallet` | student | `{ coins, coinsEarned, history[] }`. Declared before `/:id` so the literal path wins. |
| GET | `/api/quests` | student | Quests published **and** assigned to me, as cards with `windowState` and `status`. |
| GET | `/api/quests/:id` | student | The quest to answer, answer keys stripped. 403 before it opens, or once closed if unanswered. |
| POST | `/api/quests/:id/submit` | student | `{ answers }` → grades, pays coins, returns `{ submission, coins }`. |

**Payout:** `round(reward × earned / maxPoints)`.

**One attempt.** A second submit returns `403 { error: 'ALREADY_SUBMITTED' }`,
the same sentinel the challenge player already handles.

**The window is enforced server-side** — unlike a challenge's advisory `dueAt`,
submitting outside `opensAt`/`closesAt` is refused and pays nothing.

## Daily Quests (teacher) — `/api/teacher/quests`

Mounted **before** the generic `/api/teacher` router, or these paths are swallowed.

| Method | Path | Role | Notes |
|--------|------|------|-------|
| GET | `/api/teacher/quests` | teacher | Every quest with its response count. |
| GET | `/api/teacher/quests/item/:id` | teacher | Full quest incl. answer keys (`/item/` avoids colliding with `/:id/responses`). |
| POST | `/api/teacher/quests` | teacher | Create → `201 { quest, dropped }`. |
| PUT | `/api/teacher/quests/:id` | teacher | Update → `{ quest, dropped }`. |
| DELETE | `/api/teacher/quests/:id` | teacher | Deletes its submissions too. |
| POST | `/api/teacher/quests/:id/publish` | teacher | `{ published }`. |
| POST | `/api/teacher/quests/:id/assign` | teacher | `{ mode:'all'\|'some', studentIds[] }`. |
| POST | `/api/teacher/quests/:id/move` | teacher | `{ direction:'up'\|'down' }`. |
| GET | `/api/teacher/quests/:id/responses` | teacher | Read-only: who answered, scores, coins, who is missing, and the answer key. |
| POST | `/api/teacher/quests/coins` | teacher | `{ studentId, delta }` — adjust a balance by hand. The only debit path. |

`dropped` counts questions the server threw away because they had no usable
answer key; the console surfaces it as a warning toast.

## Coin Battles (student) — `/api/battles`

All require a **student** token.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/api/battles/settings` | — | Stakes, time limits, questions per battle, cooldown, daily limit, bank sizes, my balance and `battlesLeft`. |
| GET | `/api/battles/opponents` | — | Classmates: `{ id, name, avatar, coins, attackable, reason, readyAt }`. **No email addresses** — this list goes to every student. |
| GET | `/api/battles/history` | — | My last 30 battles, attacking and defending, with `outcome` already flipped to my side. |
| GET | `/api/battles/open` | — | The battle I walked away from, so the page can resume it. |
| POST | `/api/battles/start` | `{ opponentId, difficulty }` | Draws the questions and puts the stake at risk. Returns them **with answer keys stripped**. |
| POST | `/api/battles/:id/answer` | `{ answers }` | Grades, moves the coins, and returns the outcome plus a review with the correct answers. |

Answer shapes are the challenge/quest shapes — see
[Challenges (student)](#challenges-student--apichallenges).

`POST /start` refuses with a **reason code** the client localises, not a
sentence: `disabled`, `battleInProgress`, `self`, `notAStudent`, `dailyLimit`,
`cooldown` (with `readyAt`), `poor`, `targetBroke`, `noQuestions`.

## Duels (student) — `/api/battles/duels`

All require a **student** token. A duel is the mirror image of a raid: the
challenger **writes** the question and the classmate they send it to is the one
who answers.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/api/battles/duels/check` | `{ question, lang? }` | Kru CJ reads a question the student wrote. On approval the question is **parked as that student's single draft** and `draftId` comes back; on rejection nothing is stored. Costs one `review` call from the daily AI allowance. |
| GET | `/api/battles/duels` | — | My duels both directions (40 newest), my parked draft, `openSent` / `maxOpen`, `aiEnabled`, and what is left of today's allowance. Also sweeps duels past their expiry into `expired`. |
| POST | `/api/battles/duels` | `{ draftId, opponentId, difficulty }` | Sends it. The question comes **from the parked draft, never from this body** — otherwise a client could send one Kru CJ never saw. |
| POST | `/api/battles/duels/:id/open` | — | Defender only. Returns the question with **answer keys stripped** and starts the clock. Idempotent: re-opening returns the same deadline, so refreshing does not buy another minute. |
| POST | `/api/battles/duels/:id/answer` | `{ answers }` | Defender only. Grades, moves the coins, returns the outcome and the correct answer. |
| POST | `/api/battles/duels/:id/decline` | — | Defender only. **Costs nothing** — see the note below. |
| POST | `/api/battles/duels/:id/cancel` | — | Challenger only, while it is still pending. |

**Who wins what.** The defender answers correctly → the defender takes the stake
off the challenger. The defender gets it wrong, or runs the clock down → the
challenger takes the stake off the defender. Declined, cancelled or expired →
nothing moves. `transferCoins` caps every move at what the loser actually holds,
so no balance can go negative.

**Declining is free on purpose.** A student who cannot get out of a duel has
been handed a way to bully a classmate out of their coins, and no amount of
question review fixes that.

**Shared limits.** The daily limit and the per-opponent cooldown count raids and
duels *together*. Counting them separately would make "send a duel" the way to
keep attacking once the raid allowance is spent. On top of that a student may
have at most `MAX_OPEN_DUELS` (3) unanswered duels out at once, and only one
pending against any given classmate.

Reason codes on `POST /duels` are the raid codes plus `tooManyDuels` and
`duelPending`. Other error codes: `DUEL_NOT_CHECKED`, `DUEL_INCOMPLETE`,
`DUEL_EXPIRED`, `DUEL_NOT_OPENED`, `ALREADY_RESOLVED`, `AI_DISABLED`,
`AI_DAILY_LIMIT`, `AI_BUSY`, `AI_FAILED`.

## Coin Battles (teacher) — `/api/teacher/battles`

All require a **teacher** token.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/api/teacher/battles` | — | Settings, per-difficulty bank sizes, and the 40 most recent battles. |
| GET | `/api/teacher/battles/bank/:difficulty` | — | That bank, answer keys included. |
| POST | `/api/teacher/battles/bank/:difficulty` | `{ questions }` | Replaces the bank. Question ids are preserved by the editor, so re-saving is a small diff. Returns `dropped` = how many were thrown away for having no answer key. |
| POST | `/api/teacher/battles/settings` | settings | Stakes, time limits, questions per battle, cooldown, daily limit, on/off. Any field left out keeps its current value. |
| GET | `/api/teacher/battles/log` | — | Every battle, newest first, both names, outcome and coins moved. |
| GET | `/api/teacher/battles/duels` | — | Every duel, **with the question, its answer key and Kru CJ's verdict**. Duels are the only place in StoiVenture where one student's writing is put in front of another, and an AI reviewer is a filter rather than a guardian — the teacher has to be able to read what the class is actually sending. |
| DELETE | `/api/teacher/battles/duels/:id` | — | Take a duel down. A pending one is simply gone; a resolved one keeps the coins where they landed, because unwinding a transfer days later is a worse surprise than the question was. |

## AI question writing (teacher) — `/api/teacher/ai`

All require a **teacher** token. Disabled with `503 AI_DISABLED` when no
`GEMINI_API_KEY` is configured.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/api/teacher/ai/status` | — | `{ enabled, model, maxBatch, types[] }` plus what is left of today's `generate` allowance. |
| POST | `/api/teacher/ai/questions` | `{ target:'battle'\|'quest', difficulty, count, types[], notes?, lang? }` | Writes stoichiometry questions with their answer keys. Returns `{ questions[], dropped }`. |

**It saves nothing.** The questions come back as drafts for the teacher to read
and then save through the ordinary quest or battle-bank endpoints. That keeps
one save path per feature and, more to the point, means no question reaches a
student without the teacher having looked at it.

Everything the model returns is put through the same normalising and
auto-markable checks as a hand-typed question (`challenges.normalizeQuestion` +
`quests.isAutoMarkable`), so anything malformed or unkeyed is dropped here
rather than surfacing later as a quest that cannot pay out. `dropped` says how
many went.

Error codes: `AI_DISABLED`, `AI_DAILY_LIMIT` (our own per-teacher daily cap),
`AI_BUSY` (the model provider's rate limit — routine on a free tier),
`AI_FAILED`, `AI_NOTHING_USABLE`.

## AI tutor (student) — `/api/tutor`

All require a **student** token.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/api/tutor/status` | — | `{ enabled, freeLeft, freePerDay, coins, price, canAsk, nextIsFree }`. |
| POST | `/api/tutor/ask` | `{ challengeId, questionId, message, draft?, history?, lang? }` | Kru CJ helps with one challenge question. Returns `{ reply, refused }` plus the refreshed quota. |

The model is given the question **after `sanitizeQuestion`**, exactly the
projection the student's own browser receives — so it is never told the answer
and cannot leak a key it was never given. This is the opposite of the AI
question routes above, which are given answer keys because producing or
checking one is their whole job.

Paid for out of the Daily Quest coin wallet: 3 free questions a day, then 50
coins each (`src/tutorCredit.js`). A failed or refused reply is refunded.
`402 INSUFFICIENT_COINS` when they cannot pay; `429` when the model provider
rate-limits.

## Leaderboard — `/api/leaderboard`

| Method | Path | Role | Notes |
|--------|------|------|-------|
| GET | `/api/leaderboard` | any | All students ranked by points: `{ leaderboard[], meId, total }`. |
