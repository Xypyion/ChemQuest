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
| GET | `/api/lessons/:id` | — | Full level to play (pre-test). Answers stripped. `403` if the level is locked. |
| POST | `/api/lessons/:id/check` | `{ questionIndex, answer }` | Instant feedback for one pre-test question. |
| POST | `/api/lessons/:id/complete` | `{ answers: [...] }` | Grades the pre-test, awards a certificate on first pass, recalculates points. |
| GET | `/api/lessons/:id/posttest` | — | Post-test questions. `403` unless the level is unlocked **and** the post-test is open. |
| POST | `/api/lessons/:id/posttest/check` | `{ questionIndex, answer }` | Instant feedback for one post-test question. |
| POST | `/api/lessons/:id/posttest/complete` | `{ answers: [...] }` | Grades the post-test, adds points (no certificate). Passing unlocks the next level. |
| GET | `/api/lessons/me/certificates` | — | The student's earned certificates. |

**Lock reasons** (`lockReason`): `teacher` (force-locked), `scheduled` (with `opensAt`),
`posttest` (previous post-test not passed), `progress` (previous level not done).

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

## Leaderboard — `/api/leaderboard`

| Method | Path | Role | Notes |
|--------|------|------|-------|
| GET | `/api/leaderboard` | any | All students ranked by points: `{ leaderboard[], meId, total }`. |
