# Data Model

All state lives in `data/db.json` (or Postgres when `DATABASE_URL` is set).
Collections: `users`, `lessons`, `posts`, `submissions`, `gradebook`,
`challenges`, `challengeCategories`, `challengeSubmissions`, `quests`,
`questSubmissions`. Uploaded files live in `data/uploads/` and are referenced
by URL.

## Quest

```jsonc
{
  "id": "uuid",
  "title": "Monday Warm-up",
  "description": "Three quick questions.",
  "icon": "⚔️",
  "order": 1,
  "reward": 30,              // coins for a perfect score
  "opensAt": null,           // ISO or null = always open
  "closesAt": null,
  "timeLimit": 0,
  "questions": [],           // same shape as challenge questions, but only
                             // mcq | multi | short | table, each with an answer key
  "assign": { "mode": "all", "studentIds": [] },
  "published": false,
  "createdAt": "iso", "updatedAt": "iso"
}
```

## Quest submission

```jsonc
{
  "id": "uuid",
  "questId": "uuid", "questTitle": "…", "questIcon": "⚔️",
  "userId": "uuid", "userName": "…", "userAvatar": "🧑‍🎓",
  "answers": {},             // keyed by question id
  "results": [],             // { questionId, auto, earned, max, correct }
  "earned": 1, "maxPoints": 2,
  "coinsAwarded": 15,        // what was actually paid — makes the payout idempotent
  "createdAt": "iso"
}
```

One submission per `(questId, userId)`: a quest is a single attempt, because it
pays out.

## Battle

One raid: who fought whom, the questions they were actually given, and what it
cost. Written by `POST /api/battles/start` and finished by `.../answer`.

```jsonc
{
  "id": "uuid",
  "attackerId": "uuid", "attackerName": "…", "attackerAvatar": "🦊",
  "defenderId": "uuid", "defenderName": "…", "defenderAvatar": "🐼",
  "difficulty": "easy",          // easy | medium | hard
  "stake": 5,                    // coins at risk on BOTH sides
  "questions": [],               // the drawn set, answer keys included — grading
                                 // must use the questions the student was shown
  "status": "open",              // open | won | lost   (from the attacker's side)
  "late": false,                 // answered after expiresAt = an automatic loss
  "coinsMoved": 5,               // what actually moved, after the balance cap
  "earned": 1, "maxPoints": 1,
  "results": [], "answers": {},  // same shapes as a challenge submission
  "startedAt": "iso",
  "expiresAt": "iso",            // null when that difficulty has no timer
  "resolvedAt": "iso"
}
```

A student may hold only **one** `open` battle: re-opening the page resumes it.

## Battle question bank

One document per question, so a bank holding images stays a small diff for the
Postgres backend. Same shape as a challenge question, plus:

```jsonc
{ "difficulty": "easy", "order": 0, … }
```

Only `mcq | multi | short | table` with a real answer key survive
`battles.normalizeBankQuestion()` — coins move the moment a student answers, so
nothing may wait for marking.

## Battle settings

A single document, `id: "settings"`, in `battleSettings`:

```jsonc
{
  "id": "settings",
  "enabled": true,
  "stakes":     { "easy": 5,  "medium": 15, "hard": 30 },
  "timeLimits": { "easy": 60, "medium": 60, "hard": 90 },   // seconds, 0 = none
  "questionsPerBattle": 1,       // the student must get every one right to win
  "cooldownMinutes": 10,         // before the same opponent can be raided again
  "dailyLimit": 10,              // battles started per student per day, 0 = unlimited
  "updatedAt": "iso"
}
```

## Duel

`duels`. The mirror image of a battle: the **challenger writes the question** and
the **defender answers it**. Written by `POST /api/battles/duels` once Kru CJ has
approved the question, and finished by `.../answer`, `.../decline`, `.../cancel`
or by expiring.

```jsonc
{
  "id": "uuid",
  "challengerId": "uuid", "challengerName": "Ploy", "challengerAvatar": "🦊",
  "defenderId": "uuid",   "defenderName": "Nat",    "defenderAvatar": "🐼",
  "difficulty": "easy",          // only sets the stake — a duel brings its own question
  "stake": 5,                    // coins at risk on BOTH sides
  "question": { /* a full challenge question, ANSWER KEY INCLUDED */ },
  "review": {                    // what Kru CJ said, kept for the teacher
    "ok": true, "onTopic": true, "solvable": true,
    "keyCorrect": true, "appropriate": true,
    "feedback": "…", "subtopic": "mole ratio"
  },
  "status": "pending",           // pending | answered | declined | cancelled | expired
  "defenderWon": null,           // true = the defender answered it correctly
  "late": false,                 // they ran the clock down, which counts as wrong
  "coinsMoved": 0,               // what actually moved, after the balance cap
  "answer": { "<questionId>": 0 },
  "results": [ /* as challenges.gradeSubmission */ ],
  "createdAt": "ISO",
  "expiresAt": "ISO",            // 48 hours; unanswered after that, nothing moves
  "openedAt": null,              // when the defender first read it — starts the clock
  "answerBy": null,              // openedAt + the difficulty's time limit
  "resolvedAt": null
}
```

The question lives **on the duel**, key and all, for the same reason a battle
stores its drawn questions: grading must use what was actually sent, not
whatever the author has since edited. It is stripped by
`challenges.sanitizeQuestion()` on the way to the defender.

`status` is not the outcome. Who won is `defenderWon`: true and the defender
takes the stake off the challenger, false and the challenger takes it off the
defender. `declined`, `cancelled` and `expired` move nothing at all.

## Duel draft

`duelDrafts`. One row per student, at most — a question Kru CJ has approved that
has not been sent yet.

```jsonc
{
  "id": "uuid",
  "userId": "uuid",
  "question": { /* normalised, answer key included */ },
  "review":   { /* as above */ },
  "createdAt": "ISO"
}
```

It exists so that checking a question and then sending it does not pay the model
twice for the same review — `POST /duels` takes its question from here and
never from the request body, which is also what stops a client sending a
question Kru CJ never saw. A new check replaces the student's previous draft and
sending deletes it, so the collection can never grow past one row per person.

## Coins on the user

`user.coins` (spendable balance) and `user.coinsEarned` (lifetime total) are
added lazily, like `user.grades`. Quests, battles and duels all credit them.
Losing a battle or a duel, and paying for a tutor hint, are the paths that debit
`coins` without a teacher doing it by hand; a transfer never takes a balance
below zero (`battles.transferCoins` caps it at what the loser holds). They are deliberately **outside**
`game.recalcPoints()`, which rebuilds `points` from quiz scores and would wipe
anything folded into it. `publicUser()` strips only `passwordHash`, so both
fields reach the client with no change to `auth.js`.

## AI usage on the user

`user.aiUsage` is added lazily, like `user.tutor`:

```jsonc
{ "day": "2026-08-28", "generate": 4, "review": 2 }   // Bangkok day key
```

A per-person daily counter for AI calls, reset when the school day rolls over
(`src/aiLimit.js`). `generate` counts teacher question batches, `review` counts
students having a duel question checked.

This is **not** a game currency. `user.tutor` / `src/tutorCredit.js` prices a
tutor hint in free questions and then coins, because asking for a hint is a move
inside the game. Generating a bank and getting a question checked are tools, and
the thing being rationed is the API bill on a free Gemini tier — so they are a
plain counter with no coins involved.

## User

```jsonc
{
  "id": "uuid",
  "role": "student",                 // "student" | "teacher"
  "name": "Somchai",
  "email": "somchai@skn.ac.th",      // stored lowercase; login is case-insensitive
  "passwordHash": "$2a$10$…",        // bcrypt; never sent to the client
  "difficulty": "easy",              // easy | medium | hard (students)
  "avatar": "🦊",
  "progress": {                      // keyed by lesson id
    "<lessonId>": {
      "attempts": 2,
      "lastScore": 80, "bestScore": 100, "bestCorrect": 3, "total": 3,
      "passed": true,                // pre-test passed
      "storyDone": true,             // the storyboard was read to the end
      "storyCompletedAt": "ISO",
      "completedAt": "ISO",
      "post": {                      // post-test progress (optional)
        "attempts": 1, "lastScore": 100, "bestScore": 100,
        "bestCorrect": 2, "total": 2, "passed": true, "completedAt": "ISO"
      }
    }
  },
  "certificates": [
    { "id": "…", "lessonId": "…", "title": "…", "icon": "🧪",
      "score": 100, "difficulty": "easy", "dateEarned": "ISO" }
  ],
  "earnedPoints": 200,               // sum of best pre + best post scores
  "bonusPoints": 0,                  // teacher ranking adjustment
  "points": 200,                     // earnedPoints + bonusPoints
  "createdAt": "ISO"
}
```

## Lesson

```jsonc
{
  "id": "uuid",
  "order": 1,                        // position on the map
  "title": "What is Matter?",
  "description": "…",
  "terrain": "plain",                // plain | mountain | snow  (biome)
  "icon": "🌱",
  "timeLimit": 90,                   // pre-test seconds, 0 = no timer
  "flow": "story-first",             // story-first | test-first — which activity
                                     // the student must do first; the other one
                                     // stays locked until it is finished

  "storyboard": [                    // ordered steps
    { "type": "line", "character": "Kru CJ", "mood": "happy",
      "text": "…", "image": "" },    // image: URL or inline data-URI ("" = none)
    { "type": "video", "url": "https://youtu.be/…", "title": "…" }
  ],

  "quizzes": {                       // PRE-test, per difficulty
    "easy":   [{ "id": "uuid", "question": "…",
                 "choices": ["…","…"], "correctIndex": 1, "explanation": "…" }],
    "medium": [ … ],
    "hard":   [ … ]
  },

  "postTest": {                      // POST-test (separate, teacher-gated)
    "open": false,                   // students may take it only when true
    "timeLimit": 45,
    "quizzes": { "easy": [ … ], "medium": [ … ], "hard": [ … ] }
  },

  "gate": {                          // teacher access control
    "mode": "auto",                  // auto | locked | scheduled
    "openAt": null                   // ISO datetime when mode = scheduled
  },

  "createdAt": "ISO",
  "updatedAt": "ISO"
}
```

## Challenge

A teacher-built worksheet shown in the 🧩 Challenges tab of a level board.

```jsonc
{
  "id": "uuid",
  "lessonId": "uuid",                // which level board it appears on
  "categoryId": "uuid",              // → challengeCategories ("" = uncategorised)
  "title": "Build a balanced equation",
  "description": "…",                // instructions for the student
  "icon": "🧩",
  "order": 3,
  "published": true,                 // students only ever see published ones
  "allowRetake": false,              // false = one attempt only
  "timeLimit": 0,                    // seconds, 0 = no timer
  "dueAt": null,                     // ISO or null
  "assign": { "mode": "all", "studentIds": [] },   // "some" + ids to hand-pick
  "questions": [ … ],
  "createdAt": "ISO", "updatedAt": "ISO"
}
```

### Challenge question types

Every question has `{ id, type, question, image, points, explanation }`.
`image` is a URL or an inline data-URI; `explanation` is the marking guide and is
never sent to students.

```jsonc
// mcq — one correct choice
{ "type": "mcq", "choices": ["…"], "correctIndex": 1 }

// multi — several correct choices (all-or-nothing)
{ "type": "multi", "choices": ["…"], "correctIndexes": [0, 2] }

// short — typed answer, auto-marked against the accepted list
{ "type": "short", "accepted": ["water", "H2O"], "caseSensitive": false }
//   accepted: [] → the teacher marks it by hand

// written — a paragraph; always teacher-marked
{ "type": "written" }

// table — fill in the blanks
{ "type": "table", "table": {
    "columns": ["State", "Shape"],
    "rows": [{ "cells": [
      { "text": "Solid", "blank": false, "answer": "" },
      { "text": "",      "blank": true,  "answer": "fixed" }
    ]}] } }
//   every blank has an answer → marked pro-rata; any blank without → teacher marks

// simulation — embedded HTML (or a URL) plus its own sub-questions
{ "type": "simulation", "points": 0,
  "sim": { "mode": "html", "html": "<canvas …><script>…<\/script>", "url": "", "height": 420 },
  "sub": [ /* any of the types above — simulations cannot nest */ ] }
```

The simulation frame is sandboxed with `allow-scripts allow-popups` and **no**
`allow-same-origin`, so teacher-authored code runs in an opaque origin.

## Challenge category

```jsonc
{ "id": "uuid", "name": "Lab simulations", "icon": "🧪", "order": 0 }
```

## Challenge submission

```jsonc
{
  "id": "uuid", "challengeId": "uuid", "lessonId": "uuid",
  "userId": "uuid", "userName": "…", "userAvatar": "🧑‍🎓",
  "answers": { "<questionId>": 0 | [0,2] | "text" | { "0_1": "fixed" } },
  "results": [{ "questionId": "…", "auto": true, "earned": 2, "max": 2, "correct": true }],
  "autoEarned": 11,                  // machine-marked points
  "manual": [{ "questionId": "…", "question": "…", "type": "written",
               "points": 5, "guide": "…", "answer": "…", "awarded": 4 }],
  "earned": 15,                      // null until every manual part is marked
  "maxPoints": 21,
  "status": "graded",                // pending | graded
  "feedback": "Nice explanation!",
  "createdAt": "ISO", "gradedAt": "ISO"
}
```

Table answers are keyed `"<rowIndex>_<columnIndex>"`, matching the blank cells.

### Storyboard step types
- **line** — Kru CJ dialogue: `character`, `mood` (happy/excited/thinking/wave/cheer/sad),
  Steps authored before the mascot was renamed still hold `"Ruby"`; `character.js`
  maps that to the current name at render time rather than rewriting the database.
  `text`, optional `image`.
- **video** — `url` (any YouTube link/ID) and `title`.

## Post (assignment board)

```jsonc
{
  "id": "uuid",
  "lessonId": "uuid",
  "author": { "id": "…", "name": "…", "avatar": "🐼", "role": "student" },
  "isAssignment": true,              // true when authored by a teacher (pinned)
  "text": "…",
  "attachments": [
    { "id": "…", "name": "homework.pdf", "type": "application/pdf",
      "size": 12345, "url": "/uploads/ab12cd34__homework.pdf" }
  ],
  "likes": ["userId", …],            // user ids
  "comments": [
    { "id": "…", "author": { … }, "text": "…", "at": "ISO" }
  ],
  "questions": [                     // PRIVATE student→teacher questions
    { "id": "…", "author": { … }, "text": "…", "at": "ISO" }
  ],
  "createdAt": "ISO"
}
```

**Privacy:** `questions` are only ever sent to the teacher or to the question's own author —
never to other students. They are only allowed on a teacher assignment post.

## Relationships

```
User 1───* progress  *───1 Lesson             (a student's results per level)
User 1───* certificates                        (one per passed level pre-test)
Lesson 1───* Post  (by lessonId)               (the level's assignment feed)
Post  *───1 User (author)                      (denormalised author snapshot)
Lesson 1───* Challenge (by lessonId)           (the level's challenges tab)
Challenge *───1 ChallengeCategory              (teacher-defined grouping)
Challenge 1───* ChallengeSubmission *───1 User (one per student, unless retaken)
```

## Reset / seed

- Deleting `data/db.json` resets everything; on next start `src/seed.js` recreates the
  teacher account and 6 sample lessons.
- Seeded teacher: `krucj@gmail.com` / `StoiVenture2026`. `TEACHER_EMAIL` /
  `TEACHER_PASSWORD` in `.env` override it; `npm run teacher` changes it later.
