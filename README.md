# 🧪 ChemQuest — A Chemistry Learning Adventure

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
- 🏠 **Level board** — tapping a level opens a game-themed board with three choices:
  **Start the Level**, the **Assignments** feed, and the **Post-test** (locked until the
  teacher opens it).
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
- 🧾 **Post-test** — a separate test the teacher opens when the class is ready; earns
  points (no certificate).
- 🎖️ **Certificates** — earn one for every level you pass; collect them in your inventory.
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
- 📒 **Assignment board** — post the assignment for any level, and see **every student post,
  file, comment, and private question** in one place.
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
3. **Start the Level** → read Ruby's story → watch the video → answer the pre-test.
4. Score 60%+ to pass, earn a certificate, and unlock the next level.
5. Visit the **Assignments** tab to post your work and chat with classmates.
6. When your teacher opens the **Post-test**, take it for bonus points.
7. Climb the leaderboard!

---

## 🗂️ Project structure
```
chemquest/
├── server.js              # Express server (API + serves the front-end)
├── package.json
├── data/
│   ├── db.json            # auto-created JSON database (users + lessons + posts)
│   └── uploads/           # assignment file attachments (auto-created)
├── src/
│   ├── db.js              # tiny JSON document store
│   ├── auth.js            # JWT + password hashing + role middleware
│   ├── game.js            # scoring & points rules
│   ├── seed.js            # teacher account + sample levels
│   └── routes/
│       ├── auth.routes.js
│       ├── lessons.routes.js     # student: play & grade pre-test + post-test
│       ├── teacher.routes.js     # teacher: lesson CRUD, post-test gate, password reset
│       ├── posts.routes.js       # assignment board: posts, files, comments, questions
│       └── leaderboard.routes.js
└── public/                # front-end (no build step needed)
    ├── index.html         # welcome / login / signup
    ├── dashboard.html     # adventure map
    ├── level.html         # level board hub (start / assignments / post-test)
    ├── lesson.html        # storyboard + video + quiz player (pre & post modes)
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
