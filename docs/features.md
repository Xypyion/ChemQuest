# Feature Catalog

## Language (ไทย / English)

- One accessible toggle (`EN | ไทย`) switches the **entire UI**: menus, buttons, labels,
  placeholders, toasts, difficulty names, and dates.
- The choice persists in `localStorage` and is mirrored onto `<html lang>` for screen
  readers. The **Mali** web font renders Thai glyphs in the same cartoony style.

## Student experience

### Adventure map (dashboard)
- A vertical journey through three biomes — **Meadow → Ember Canyon → Sky Summit** — with
  rivers, bridges, props, and a 3D-style Ruby model standing on every level.
- Each node shows its state: **available** (Ruby waving "Tap to play"), **done** (✓ + best
  score), or **locked** (silhouette + 🔒). Scheduled levels show their open time.

### Level board (hub)
Tapping a level opens a game-themed board with tabs **🏠 Board · 📒 Assignments ·
🧩 Challenges**. The board menu lists every activity of the level:
1. **Storyboard** — dialogue + images + inline video, on its own.
2. **Pre-test** — the questions, on their own.
3. **Assignments** — the class feed for that level.
4. **Challenges** — the challenges the teacher assigned to this student.
5. **Post-test** — locked until the teacher opens it.

The storyboard and the pre-test swap places according to the order the teacher
chose for the level; whichever comes second stays locked (🔒) until the first is
finished.

### Lessons & quizzes
- **Storyboard** narrated by Ruby with moods/expressions, optional images, and a YouTube
  video the teacher can place anywhere in the sequence.
- **Pre-test:** instant per-question feedback with explanations; questions match the
  student's chosen difficulty. Passing (≥60%) earns a **certificate**.
- **Timed quizzes:** when the teacher sets a timer it counts down on screen; on timeout the
  latest answers are saved and graded automatically.
- **Post-test:** a separate quiz the teacher opens; earns points (no certificate) and, when
  passed, unlocks the next level.

### Assignment board (per level)
- Facebook-group-style feed. Students post text plus **attachments** — images (inline
  preview), PDFs, or any file (up to 6 files, 8 MB each).
- **Like** and **comment** on classmates' posts.
- **Private question to the teacher** ("นักเรียนสงสัยอะไรมั้ย") appears **only on the
  teacher's assignment post** and is visible **only to the teacher**.

### Challenges 🧩
- Grouped under the teacher's categories, each card showing its points, due date
  and state (not started / handed in / marked).
- Questions can be **multiple choice**, **choose-many**, **short answer**,
  **paragraph**, **fill in the table**, or a **simulation** — an interactive
  embed the student plays with, answering the questions printed underneath it.
- Any question may carry an **image**, and the whole challenge may be timed.
- Answers the machine can mark are scored the moment the work is handed in; the
  rest show as "waiting for your teacher" until they are marked, and the teacher
  can attach a written comment to the score.

### Rewards
- **Certificates** collected in a personal inventory.
- **Leaderboard** with a top-3 podium; highlights the highest and lowest scorers.

## Teacher console

### Level builder
- Title, emoji icon, terrain/biome, description.
- **Order of activities:** choose whether students meet the **storyboard first**
  (then the pre-test) or the **pre-test first** (then the storyboard) — useful for
  measuring what the class already knows before teaching it. The second activity
  is locked, server-side, until the first one is done.
- **Storyboard editor:** ordered list of dialogue lines (character + mood + text + optional
  image by URL or upload) and videos, reorderable with ↑ ↓.
- **Pre-test builder:** questions, answer choices, correct answer, explanation — a separate
  set for **each difficulty** (easy / medium / hard).
- **Post-test builder:** a second question set, built the same way, kept locked until opened.
- **Timers:** independent time limits for the pre-test and the post-test.

### Access control
- **Post-test open/close** per level (one click, applies to all students).
- **Per-level access gate:**
  - **Auto** — normal progression (unlock after the previous level's post-test is passed).
  - **Locked** — force the level shut even when the student qualifies.
  - **Scheduled** — pick a date & time; the level opens automatically then.

### Assignment management
- Post the assignment for any level.
- Review **every** student post, attachment, comment, and **private question** in one place.

### Challenges 🧩
- **Categories** the teacher defines and reuses across levels.
- A challenge belongs to one level board and is **published** and **assigned**
  either to the whole class or to hand-picked students.
- **Question builder** with six types: multiple choice, choose-many, short answer
  (with a list of accepted answers), paragraph, fill-in-the-table (any cell can be
  a fixed label or a blank with an answer key), and **simulation** — paste the HTML
  of an interactive model (or a URL) and add the questions that go underneath it.
  Every question takes an image, its own points, and a private marking guide.
- **Responses**: auto-marked answers arrive already scored; the teacher awards the
  written parts, adds optional feedback, and can see who has not handed in.
- Challenge scores can be imported into the **gradebook** as a column.

### Student management
- View roster with difficulty, levels completed, certificates, and points.
- Rename, change difficulty, adjust ranking (points), **reset password**, or delete accounts.

### Reorder levels
- Move any level earlier/later on the map.

## Scoring summary

| Item | Rule |
|------|------|
| Pass threshold | ≥ 60% correct |
| Score | `round(accuracy × 100 × difficultyMultiplier)` |
| Difficulty multiplier | easy ×1.0, medium ×1.25, hard ×1.5 |
| Points total | best pre-test + best post-test (per level) + teacher bonus |
| Certificate | granted on first pre-test pass of a level |
| Next level unlock | previous level's post-test passed **and** access gate open |
| Challenge score | auto-marked points + teacher-awarded points, out of the challenge total (kept out of the leaderboard; import into the gradebook to use it) |
