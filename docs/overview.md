# System Overview

ChemQuest is a single-server web application that teaches chemistry through a gamified
adventure. It has two faces — a playful **student game** and a clean **teacher console** —
served from the same Node.js process.

## What it does

- **Students** progress along an adventure map of levels grouped into three biomes
  (Meadow → Ember Canyon → Sky Summit). Each level opens a **level board** with three
  activities: start the lesson (storyboard + video + **pre-test**), an **assignments**
  feed, and a teacher-gated **post-test**.
- **Teachers** build levels (storyboard, images, videos, per-difficulty quizzes), create a
  separate post-test, control when each level unlocks, post assignments, review student
  work and private questions, and manage student accounts.
- The whole UI is **bilingual (ไทย / English)** with one accessible switch.

## High-level shape

```
Browser (HTML/CSS/JS)  ──HTTP/JSON──►  Express server (Node.js)  ──►  data/db.json
        │                                      │                      data/uploads/
        │                                      │
   localStorage (JWT + language)         JWT auth + role guard
```

- **No database server** and **no front-end build step** — the app runs with just Node.js.
- State lives in a single JSON document (`data/db.json`); uploaded assignment files live in
  `data/uploads/`.

## Core concepts

| Concept | Meaning |
|---------|---------|
| **Level / Lesson** | One stop on the map: storyboard, pre-test, post-test, access gate. |
| **Storyboard** | Ordered steps — dialogue *lines* (with optional images) and *videos*. |
| **Pre-test** | Quiz taken after the story; passing (≥60%) earns a certificate. |
| **Post-test** | A separate quiz the teacher opens; passing it unlocks the next level. |
| **Access gate** | Per-level teacher control: `auto`, `locked`, or `scheduled`. |
| **Assignment board** | Per-level social feed: posts, files, comments, likes, private questions. |
| **Certificate** | Awarded for passing a level's pre-test. |
| **Points / Leaderboard** | Earned from best pre-test and post-test scores, plus teacher bonus. |

## Progression rules (important)

1. A level is **unlocked** only when **both** are true:
   - the teacher's **access gate** is open (`auto`, or `scheduled` time reached), **and**
   - the **previous level is fully done**.
2. "Fully done" means the previous level's **post-test is passed** — *if it has a post-test*.
   Levels without a post-test fall back to the pre-test, preserving older content.
3. The **pre-test** still grants the certificate, but passing it alone no longer unlocks the
   next level.

See [features.md](features.md) for the full feature catalog and [architecture.md](architecture.md)
for how it is built.
