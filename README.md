# 🧪 StoiVenture — A Chemistry Learning Adventure

A colorful, cartoony web game that teaches chemistry through an adventure map.
Students climb from the grassy **plains** → rocky **mountains** → snowy **summit**,
guided by **Ruby**, a friendly red mascot who tells a story, shows a video, and
quizzes them at every level. Pass a level to earn a **certificate** and climb the
**leaderboard**. Teachers get a completely separate console to build levels and
manage students.

Built for **Suankularb Wittayalai Nonthaburi School**.

---

## ✨ Features

### 🌐 Thai / English
- The **entire UI** switches between **English and ไทย** with one accessible toggle
  (top-right on most pages, in the sidebar of the Teacher Console). Your choice is
  remembered, and the page `lang` attribute updates for screen readers.

### For Students
- 🔐 **Sign up & log in** — pick a difficulty (Easy / Medium / Hard) when joining.
- 🗺️ **Adventure map** — a winding journey through three illustrated biomes
  (**Meadow → Ember Canyon → Sky Summit**) with rivers, bridges and props, and a
  little 3D-style character model standing on every level. Levels unlock one at a time.
- 🏠 **Level board** — tapping a level opens a game-themed board with tabs
  **🏠 Board · 📒 Assignments · 🧩 Challenges** and a menu of everything the level holds:
  the **Storyboard**, the **Pre-test**, the **Assignments** feed, your **Challenges**,
  and the **Post-test** (locked until the teacher opens it). Your teacher decides whether
  the storyboard or the pre-test comes first — the other one waits its turn.
- 🔴 **Ruby the guide** — an animated mascot who narrates each storyboard, reacts to
  your answers, and cheers you on. Storyboards can include **pictures/diagrams** and a
  **video dropped in wherever the teacher placed it**.
- 🎬 **Embedded videos** — watch a short YouTube clip right inside the story.
- ⏱️ **Timed quizzes** — when a teacher sets a timer it counts down on screen; if it runs
  out, your latest answers are saved and scored automatically.
- ❓ **Pre-test** — instant feedback per question, with explanations. Questions match
  the difficulty you chose; pass to earn a certificate.
- 📒 **Assignments feed** — a Facebook-group-style board per level. Post your work with
  **image / PDF / any-file attachments** (images preview inline), **like** and **comment**
  on classmates' posts, and quietly ask the teacher a private question
  ("นักเรียนสงสัยอะไรมั้ย") that only they can see.
- 🧩 **Challenges** — extra worksheets your teacher assigns you, sorted into categories.
  They can ask you to pick an answer, tick several, type a short answer, write a paragraph,
  **fill in a table**, or play with an **interactive simulation** and answer the questions
  underneath it. You get your score the moment you hand in — apart from the parts your
  teacher marks by hand, which come back with their comments.
- 🧾 **Post-test** — a separate test the teacher opens when the class is ready; earns
  points (no certificate).
- 🤺 **Coin Battles** — stake your coins against a classmate and answer your teacher's
  questions. Win and you take their coins; lose and you pay up. Easy, medium and hard
  each put a different amount on the line.
- 🎖️ **Certificates** — earn one for every level you pass; collect them in your inventory.
- ⚙️ **Settings** — your own page, reached from your avatar in the top bar. Change
  your **display name**, pick a new **avatar** from 24 characters, **change your
  password**, see your points, coins, certificates and how many levels you have
  finished — and log out. Your difficulty is shown here too, but only your
  teacher can change it.
- 🏆 **Leaderboard** — see who has the highest (and lowest) points, with a podium for the top 3.

### For Teachers (separate console UI)
- 📚 **Build levels** — title, icon, terrain zone (which biome it appears in), description.
- 📖 **Storyboard editor** — an **ordered list of steps**: dialogue lines (with mood/expression)
  and videos, freely **reordered with ↑ ↓**. Drop a video before any line, or last so it plays
  right before the quiz.
- 🖼️ **Images in stories** — add a picture to any line by **URL or upload from your computer**.
- 🎬 **Add YouTube videos** — paste any YouTube link or ID as a storyboard step.
- ⏱️ **Quiz timer** — set a per-level time limit (seconds) for the pre-test and the post-test
  independently. It starts when the student begins; on timeout their latest answers are saved.
- ❓ **Pre-test builder** — write questions, add/remove answer choices, mark the correct one,
  and add explanations. **Different questions for each difficulty (Easy / Medium / Hard).**
- 🧾 **Post-test builder** — a **separate** question set built the same way, kept **locked** until
  you press **Open post-test** (from the level list or inside the editor). Open or close it for
  the whole class with one click.
- 🔀 **Order of activities** — choose whether students meet the **storyboard first** or the
  **pre-test first** on each level. The second activity stays locked until the first is done.
- 🧩 **Challenges** — build worksheets for any level board, sort them into your own
  **categories**, and assign them to the whole class or to picked students. Six question
  types (multiple choice · choose many · short answer · paragraph · **fill in the table** ·
  **simulation**), an image on any question, and your own points per question. A simulation
  takes the **HTML of an interactive model** (or a URL) and shows its questions underneath.
  Machine-markable answers arrive already scored; you award the rest and add feedback.
- 📥 **Read every answer** — the Responses list shows what each student actually answered,
  question by question, with their filled tables redrawn as a grid and the correct answer
  beside anything they got wrong. One click exports the whole class set to **CSV**.
- 📒 **Assignment board** — post the assignment for any level, and see **every student post,
  file, comment, and private question** in one place.
- 🤺 **Coin Battles** — set the stake, timer, cooldown and daily limit, then fill three
  question banks (easy / medium / hard). Students raid each other for coins by answering
  them, and the battle log shows every fight.
- 🔑 **Reset a student's password** — set a fresh password for any student from the Students tab.
- 🔀 **Reorder levels** on the map.
- 👩‍🎓 **Manage students** — rename, change difficulty, update ranking (points), or delete accounts.

---

## 🚀 Getting Started

### Requirements
- [Node.js](https://nodejs.org/) 18 or newer (tested on Node 25).

### Install & run
```bash
cd chemquest
npm install
npm start
```
Then open **http://localhost:4000** in your browser.

> The first time it runs, the app automatically creates the teacher account and
> 6 sample chemistry levels. To change the port: `PORT=8080 npm start`.

### 👩‍🏫 Teacher login
| Email | Password |
|-------|----------|
| `Shinozuke67@skn.ac.th` | `12345678` |

Log in on the welcome page — teachers are taken straight to the **Teacher Console**.
Students sign up for their own accounts.

---

## 🎮 How to play (student)
1. Sign up and choose a difficulty.
2. On the map, click the glowing **PLAY** level to open its **board**.
3. Do the activities in the order your teacher set — **📖 Storyboard** and **❓ Pre-test**
   are two separate steps, and the second one unlocks when the first is finished.
4. Score 60%+ on the pre-test to pass and earn a certificate.
5. Visit the **📒 Assignments** tab to post your work and chat with classmates.
6. Check the **🧩 Challenges** tab for the worksheets your teacher assigned you.
7. When your teacher opens the **Post-test**, take it to unlock the next level.
8. Climb the leaderboard!

---

## 🗂️ Project structure
```
chemquest/
├── server.js              # Express server (API + serves the front-end)
├── package.json
├── data/
│   ├── db.json            # auto-created JSON database (users, lessons, posts, challenges)
│   └── uploads/           # assignment file attachments (auto-created)
├── src/
│   ├── db.js              # tiny JSON document store
│   ├── auth.js            # JWT + password hashing + role middleware
│   ├── game.js            # scoring, points & activity-order rules
│   ├── challenges.js      # challenge model + auto-marking
│   ├── seed.js            # teacher account + sample levels
│   └── routes/
│       ├── auth.routes.js
│       ├── lessons.routes.js     # student: play & grade pre-test + post-test
│       ├── teacher.routes.js     # teacher: lesson CRUD, post-test gate, password reset
│       ├── posts.routes.js       # assignment board: posts, files, comments, questions
│       ├── challenges.routes.js  # challenges: student answering + teacher building/marking
│       └── leaderboard.routes.js
└── public/                # front-end (no build step needed)
    ├── index.html         # welcome / login / signup
    ├── dashboard.html     # adventure map
    ├── level.html         # level board hub (story / pre-test / assignments / challenges / post-test)
    ├── lesson.html        # storyboard + quiz player (story, pre & post modes)
    ├── challenge.html     # challenge player (all question types + simulations)
    ├── inventory.html     # certificate collection
    ├── leaderboard.html
    ├── teacher.html       # teacher console
    ├── css/               # theme, map, lesson, teacher, feed styles
    └── js/                # page logic, i18n (en/th), Ruby mascot (SVG), feed
```

## 🛠️ Tech
- **Backend:** Node.js + Express, JSON file storage (no database server to install).
- **Auth:** JWT (stored in the browser), passwords hashed with bcrypt.
- **Frontend:** plain HTML/CSS/JavaScript — no build tools, fully cartoony, with an
  original SVG mascot and CSS animations.

## 📝 Notes
- **Data** lives in `data/db.json`. Delete it to reset everything; the sample content
  re-seeds on the next start.
- **Sample videos** are real kid-friendly YouTube clips (TED-Ed, Crash Course Kids,
  AsapSCIENCE, etc.). Swap any of them from the Teacher Console.
- The mascot "Ruby" is an **original character** designed for this project.

---
Made with ❤️ for curious young chemists.
