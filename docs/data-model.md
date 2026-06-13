# Data Model

All state lives in `data/db.json` with three collections: `users`, `lessons`, `posts`.
Uploaded files live in `data/uploads/` and are referenced by URL.

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

  "storyboard": [                    // ordered steps
    { "type": "line", "character": "Ruby", "mood": "happy",
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

### Storyboard step types
- **line** — Ruby dialogue: `character`, `mood` (happy/excited/thinking/wave/cheer/sad),
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
User 1───* progress  *───1 Lesson           (a student's results per level)
User 1───* certificates                      (one per passed level pre-test)
Lesson 1───* Post  (by lessonId)             (the level's assignment feed)
Post  *───1 User (author)                    (denormalised author snapshot)
```

## Reset / seed

- Deleting `data/db.json` resets everything; on next start `src/seed.js` recreates the
  teacher account and 6 sample lessons.
- Seeded teacher: `shinozuke67@skn.ac.th` / `12345678`.
