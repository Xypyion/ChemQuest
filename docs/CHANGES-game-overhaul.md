# Game overhaul — what changed

Three features, each on its own branch, plus one branch with all three together.
Nothing is on `main`. Every existing function was kept; see **What did not change**.

| Branch | What it holds |
|---|---|
| `feat/arena-ui` | 1. The Valorant-style lobby look |
| `feat/badges-profile` | 2. Certificates → Badges, plus a social-media style profile page |
| `feat/game-sound` | 3. Sound effects and music |
| `test/game-overhaul` | All three merged together, the one to try first |

To try a branch on the school machine:

```bash
git fetch origin
git checkout test/game-overhaul
npm install
npm start
```

Then open http://localhost:4000.

---

## 1. Valorant-style UI (`feat/arena-ui`)

**Colours are unchanged.** The game's own palette is kept: brand pink and blue, sky blue, sun yellow, grape, grass green, orange, on the same sky gradient. What changed is the shapes, type and layout, so it reads like a tactical game lobby.

### Everywhere on the student side
- **HUD top bar.** A dark bar with a pink line under it.
  - Tabs are uppercase labels, and the current tab gets a pink underline.
  - Coins and points are slanted read-outs.
  - From 1280px wide it fits on one row; before, it wrapped to two rows below 1580px.
- **Sharp shapes.** Buttons and clickable cards have cut corners and a light sweep on hover. Panels have pink corner brackets. Inputs and tags are squared off.
- **Type.** Big condensed uppercase titles (*Bebas Neue*). HUD labels and buttons use *Chakra Petch*, which also has Thai. Thai titles fall back to Chakra Petch, so vowel marks are never clipped.
- **Background.** A faint tactical grid and two diagonal light slabs in pink and blue over the sky gradient. The cartoon clouds are hidden.
- **Phones.** The bottom tab bar is a dark HUD strip, and the current tab is a pink slanted chip.

### The map page is now a lobby
- **Left menu**, like a game's main menu: big words with diamond bullets.
  - **PLAY** jumps straight to the level you are on.
  - The other entries are Quests, Battle, Lab, Badges, Leaderboard and Settings.
- **Centre:** the same map. Level markers are now **hexagons**, and the level you are on has a pulsing pink halo.
- **Right column:**
  - **Current mission:** the level you are on, with a PLAY button.
  - **Missions,** each with a progress bar: clear every level, collect badges, and finish today's quests.
  - **Your rank:** your place out of all players, and your points.
- On tablets the left menu hides (the top bar has the same links) and the panels sit above the map. On phones only the mission card sits above the map.

### Other pages
Level board, lesson and quiz, challenge, quests, battle, leaderboard (angular podium and rows), badge shelf, settings and the login card all use the same sharp style. The Lab keeps its own dark theme and gets the new top bar.

### Files
- **New:** `public/css/arena.css`, the whole skin, loaded last.
- **Edited:**
  - `dashboard.html` and `js/dashboard.js` (the lobby)
  - every student page's `<head>` (fonts and stylesheet)
  - `js/i18n.js` (lobby text in English and Thai)
- **Not loaded by the teacher console.** Deleting the one `<link>` line on a page brings the old look back.

---

## 2. Badges and profiles (`feat/badges-profile`)

### Certificates are now Badges
- Every place a student or teacher reads "Certificate(s)" now says **Badge(s)**: the nav, the result screen, the collection page, the leaderboard, Settings, the teacher's Students table and Student Logs.
- In Thai it is **แบดจ์**, not "เหรียญตรา", so it never gets mixed up with **เหรียญ** (coins).
- **Same data underneath.** A badge is the same record as before (`user.certificates`, `/api/lessons/me/certificates`), so nothing that awards, counts or exports them changed. Students keep every certificate they already earned, now shown as badges.

### Badges have a look
- Each badge is a **hexagon emblem** with the level's icon in the middle and the level number on a tag.
- The rim colour shows how well it was earned:
  - **Gold** 90%+
  - **Silver** 75%+
  - **Bronze** (pass)
- Earned badges shine every few seconds. Badges not yet earned show as blue (available) or grey (locked).
- Passing a level now shows **"Badge unlocked!"** with the emblem popping in.

### Player profile (social-media style)
`profile.html?id=<player>`, or `profile.html` for your own:
- A **cover banner** in the brand colours, with the player's rank in the corner.
- A **big avatar**, name, rank and joined date.
- A **count row:** Points · Badges · Levels · Coins.
- **Latest badge** highlight.
- Two **tabs:**
  - **Badges:** the badge showcase. On your own profile it also shows the silhouettes still to earn.
  - **Posts:** their assignment-board posts, with image thumbnails, likes and comments counts, and the level each was posted on.
- On your own profile, an **Edit profile** button goes to Settings.

**How you get there:**
- Tap any name on the **leaderboard** (rows and podium).
- Tap any student's name or avatar on a **level's assignment board** (posts and comments).
- **Settings** and the **badge collection** have "View my profile".
- The teacher console does not link names (it has no student pages to send a teacher to).

### Privacy
The new API `GET /api/users/:id/profile` (any signed-in user) returns only what classmates can already see elsewhere: name, avatar, points, rank, coins, levels done, badges and board posts.

It **never** returns:
- email
- password hash
- per-question progress
- grades
- private questions to the teacher
- Student Logs

Asking for a teacher's id or an unknown id gives 404; asking without signing in gives 401.

### Files
- **New:** `src/routes/users.routes.js`, `public/profile.html`, `public/js/profile.js`, `public/js/badges.js`, `public/css/badges.css`.
- **Edited:**
  - `server.js` (one route line)
  - `inventory.*`, `lesson.*`, `leaderboard.*`, `level.html`
  - `js/feed.js` (name links)
  - `js/settings.js`
  - `js/i18n.js` (renamed text and new text, English and Thai)

---

## 3. Sound effects and music (`feat/game-sound`)

Everything is **made in the browser** with the Web Audio API: no audio files, nothing to download or license.

### Effects
| When | Sound |
|---|---|
| Pressing any button or link | short click (a whoosh when it leaves the page) |
| Hovering the big game controls (mouse only) | very soft tick |
| Right answer (quiz, lab) | bright rising sting |
| Wrong answer | low buzz |
| Coins won (quests, battle, duel, lab) | coin chime |
| Passing a level, any confetti moment | fanfare |
| Badge unlocked | sparkle and chord |
| Failing a quiz, losing a battle | short descending jingle |
| Last 10 seconds of a timed quiz | tick every second |
| Notices (green / red / plain) | success / error / ping |

### Music
- **Lobby track** (calm loop) on the map, quests, lab, badges, leaderboard, profile, settings, level board and login.
- **Battle track** (faster, with a beat) in the battle arena.
- **No music in lessons or challenges**, so students can think. Effects still play there.
- Browsers block sound until the person interacts, so music starts on the **first tap or click on each page**, then loops. It pauses while the tab is hidden.

### Controls
- A **speaker button** in the top bar mutes and unmutes everything. On phones it is in the **More** sheet; on the login page it floats bottom-left.
- **Settings → Sound:** switches for effects and music, a volume slider and a test-sound button.
- Saved per browser (`localStorage` key `cq_sound`). Defaults: effects on, music on, volume 60%.

### Files
- **New:** `public/js/sound.js`, loaded right after `api.js` on student pages.
- **Edited:** one-line `window.sfx && sfx(...)` calls in `lesson.js`, `battle.js`, `duel.js`, `quests.js` and `lab.js`, plus the Sound card in `settings.js` and text in `i18n.js`.
- `toast()` and `confetti()` are wrapped, so every existing notice and celebration makes a sound without touching its call site.

---

## What did not change

- **Server rules:** scoring, the 60% pass mark, level unlocking, activity order, post-test gating, coins, battles, quests and the Lab are untouched. The only server change is one new read-only route.
- **Database:** no field was renamed or added.
- **Teacher console:** same look and same functions. It only shows the word "Badges" now.
- **Sound safety:** without audio support, the site is silent and nothing errors.

## How it was tested

All of this was run locally on a fresh database with `@test.local` students:

- **Sign-up and login:**
  - the login form, as a test student
- **Student pages:**
  - the map lobby, level board and storyboard
  - the pre-test played to a pass, ending on "Badge unlocked!"
  - a challenge handed in and auto-marked
  - a daily quest (+20 coins)
  - battle, lab, the badge shelf, the leaderboard
  - profiles: someone else's, your own, and the Posts tab
  - Settings: the sound switches and volume
- **Teacher console:**
  - the level list, the Students table and an assignment board
- **Every page:**
  - English and Thai, desktop and phone width, no console errors, no sideways scrolling
- **Checks on the code:**
  - both languages have the same 1378 text keys
  - every changed file passes a syntax check
  - the profile API was tested for privacy, 404s and 401s
- **Sound:**
  - all 13 effects and both music tracks were measured producing audio

**Not checked:**
- **The Vercel deployment.** It still needs Postgres configured (see `KNOWN-ISSUE-vercel-persistence.md`).
- **Real phones and tablets.** Testing used browser emulation.
- **How the music sounds through speakers.** I could only measure that audio is produced. Please listen and say if it should be quieter or different.

`README.md` and `docs/features.md` were not updated yet. Once you pick which branches to keep, the docs can be updated to match.
