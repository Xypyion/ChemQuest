# Feature Catalog

## Language (ไทย / English)

- One accessible toggle (`EN | ไทย`) switches the **entire UI**: menus, buttons, labels,
  placeholders, toasts, difficulty names, and dates.
- The choice persists in `localStorage` and is mirrored onto `<html lang>` for screen
  readers. The **Mali** web font renders Thai glyphs in the same cartoony style.

## Student experience

### Adventure map (dashboard)
- A vertical run of the teacher's levels, in order, on a clean board. The map
  shows **the levels and nothing else** — the terrain bands, hills, rivers,
  bridges, scenery props, trail and finish gate it used to paint were all
  removed, so the only thing carrying meaning on the board is the level itself.
- Each level shows its number, the teacher's own title, and its state:
  **available** (gold), **done** (✓ green) or **locked** (grey + 🔒). Scheduled
  levels show their open time.
- The student's own avatar stands beside the level they are on, tagged
  "You are here".
- Lessons still carry a `terrain` field in the database and the API; nothing
  reads it any more, and the teacher's picker for it was removed with the
  landscape it used to choose.

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
- **Storyboard** narrated by Kru CJ with moods/expressions, optional images, and a YouTube
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

### Coin Battles 🤺
- Stake coins against a classmate and answer questions your teacher wrote.
  Get them right and you **take** the stake off them; get them wrong and you
  **pay** the same number over.
- Three difficulties, each with its own stake and timer — hard is worth more.
- The opponent list shows everyone's balance, and greys out anyone you are on
  cooldown with, anyone with an empty purse, and anything you cannot afford.
- Nobody can be pushed below zero: the win is capped at what the loser holds.
- A battle log records both sides — the raids you made and the ones made on you.

### Duels ✍️ — questions students write themselves
- On the battles page a student can **write their own stoichiometry question**,
  pick one / pick several / type the answer, and set its answer key.
- **Kru CJ checks it before anyone sees it.** He judges four things separately —
  is it stoichiometry, can a classmate solve it from what was written, is the
  answer key actually right, and is it fit for a classroom — and approves only
  when all four hold. A rejection says which one failed and what to change, and
  the student writes it again. An approved question is frozen; editing it sends
  it back for another check.
- Approved, it goes to a classmate, who is the one who **answers** it. They get
  it right and they take the author's stake; they get it wrong, or run the
  timer down, and the author takes theirs.
- **Declining costs nothing.** A student who cannot refuse a duel has been handed
  a way to bully a classmate out of their coins.
- Raids and duels share one daily allowance and one per-opponent cooldown, so a
  duel is not a way around either. At most three unanswered duels out at a time,
  and one per classmate. Unanswered duels expire after 48 hours with no coins
  moved.
- The teacher sees every duel — the question, its key and Kru CJ's verdict — and
  can take one down.

### 🎖️ Badges (student side)
- Earning one is announced on the challenge result screen, above the score,
  with the picture and its name.
- The certificate page carries a **badge shelf**: earned badges in full colour
  with the challenge that won them, and badges still to earn as greyed
  silhouettes showing the name but not the artwork — something to want, without
  spoiling it.

### Rewards

### ⚙️ Settings (per student)

Reached from the account chip at the right of the topbar (the avatar stays
visible on narrow screens, so it is reachable on a phone). Four cards, each
saving independently:

- **Profile summary** — avatar, name, email, difficulty, points, coins,
  certificates earned, and levels finished out of the total.
- **How you appear** — edit the display name (≤ 40 chars) and pick an avatar
  from a 24-emoji set. This is the name and face shown on the leaderboard, in
  Coin Battles and on every feed post, and before this the avatar was fixed
  forever at whatever signup derived from the student's name.
- **Password** — change it with the current password as confirmation. The
  teacher's reset is still there for a forgotten one.
- **Difficulty + this device** — difficulty is shown but **read-only**: it
  selects which question bank a graded quiz draws from, so it stays the
  teacher's. Log out sits here, with a note to use it on shared machines.

- **Certificates** collected in a personal inventory.
- **Leaderboard** with a top-3 podium; highlights the highest and lowest scorers.

### ⚔️ Daily Quests

- A page of its own (`quests.html`), reached from the topbar on every student page.
- Short **side questions the teacher assigns**, each worth a **coin reward**.
- Marked instantly, so the coins arrive the moment the quest is handed in.
  Partial credit pays the same share of the reward.
- **One try per quest**, and the teacher decides when it opens and closes.
- A **wallet** shows the balance and the recent rewards that built it.
- There is **no shop yet** — the balance is the reward. Teachers can adjust a
  balance by hand if they need to.

## Teacher console

### Level builder
- Title, emoji icon, description.
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
- **Responses**: the teacher reads the **whole class set** — every question, every
  student's actual answer, not just the score. Multiple-choice shows what they picked,
  a filled table is redrawn as a grid with right/wrong cells, and the correct answer is
  shown beside anything they got wrong. Auto-marked answers arrive already scored; the
  teacher awards the written parts, adds optional feedback, and sees who has not handed in.
- **⬇ Download CSV** — the class set as a spreadsheet: one row per student, one column
  per question plus its points, and a row for every student who never handed in. Written
  with a UTF-8 byte-order mark so Excel opens Thai answers correctly.
- Challenge scores can be imported into the **gradebook** as a column.

### Coin Battles 🤺
- **Battle rules**: coins at stake and a time limit for each difficulty, how many
  questions a battle draws, the cooldown before the same student can be raided
  again, a daily cap per student, and a switch that closes the arena entirely.
- **Three question banks** — easy, medium, hard. Each battle draws at random from
  the bank for the difficulty the student picked, so no two battles are alike.
  Auto-marked types only (choice · choose-many · short answer · fill-in-the-table);
  anything without an answer key is refused, and the teacher is told how many.
- **Battle log**: who fought whom, at what difficulty, who won, and how many
  coins changed hands.
- **Duel log**: every question a student wrote for a classmate, its answer key,
  and what Kru CJ said about it — with a way to take one down.

### 🎖️ Badges
- Make a badge by **uploading a picture** and giving it a name (and an optional
  description). PNG, JPG, GIF, WEBP or SVG, up to 512 KB.
- In the challenge editor, a **Badge reward** picker chooses which badge — if
  any — finishing that challenge earns. "No badge" is the default, and is how a
  teacher says this challenge has no reward.
- Every student who **finishes** the challenge earns it, whatever they scored.
  It arrives the moment they hand in, not when the teacher finishes marking.
- A student holds any badge once. Retaking, or finishing a second challenge that
  gives the same badge, awards nothing further.
- **Who has it** lists every holder, which challenge they earned it from, and
  when.
- A badge students have already earned **cannot be deleted** — that would take
  it off their shelf. Detach it from the challenge instead, which stops it being
  given out without erasing anyone's.

### ✨ AI question writing
In both the **Daily Quests** editor and each **Coin Battles** bank, a
"✨ Write with AI" button asks Kru CJ for a batch of stoichiometry questions.

- Choose how many, how hard, and which types; add a free-text steer
  ("limiting reagent only", "use everyday substances") if you want one.
- He writes the question, the choices, the answer key **and the worked
  solution**, so the arithmetic can be checked at a glance before it is kept.
- The questions the bank already holds are sent along as "do not write these
  again", so a second batch is not the first one reworded.
- **Nothing is saved.** Untick what you do not want, add the rest to the editor
  you are already in, and press your normal Save. No question reaches a student
  without a teacher having read it.
- Everything the model writes is put through the same checks as a hand-typed
  question; anything unkeyed or malformed is dropped, and you are told how many.
- Stoichiometry only — that is the whole scope of the battle arena, and quests
  draw on the same skills.

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
| Quest coins | `round(reward × earned ÷ quest total)`, paid once on submit (kept out of the leaderboard — coins are meant to be spent) |
