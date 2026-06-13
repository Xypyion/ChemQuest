# ChemQuest — Documentation / เอกสารประกอบระบบ

ChemQuest is a colorful, bilingual (ไทย / English) chemistry learning game built for
**Suankularb Wittayalai Nonthaburi School (โรงเรียนสวนกุหลาบวิทยาลัย นนทบุรี)**.
Students climb an adventure map through three biomes, learn from storyboards narrated by
the mascot **Ruby**, take pre-tests and teacher-gated post-tests, submit assignments on a
class feed, and earn certificates and leaderboard points. Teachers get a full console to
build levels, control access, and manage students.

This folder contains the project's documentation.

## 📑 Index

| Document | Audience | Language |
|----------|----------|----------|
| [ExecutiveSummary-TH.docx](ExecutiveSummary-TH.docx) | School executives / ผู้บริหาร | ไทย (formal) |
| [executive-summary-th.md](executive-summary-th.md) | Reading mirror of the .docx | ไทย |
| [overview.md](overview.md) | Everyone | English |
| [architecture.md](architecture.md) | Developers | English |
| [features.md](features.md) | Product / teachers / developers | English |
| [api-reference.md](api-reference.md) | Developers | English |
| [data-model.md](data-model.md) | Developers | English |
| [deployment.md](deployment.md) | IT / operators | English |
| [security-privacy.md](security-privacy.md) | IT / administrators | English |
| [teacher-guide-th.md](teacher-guide-th.md) | Teachers / คุณครู | ไทย |
| [student-guide-th.md](student-guide-th.md) | Students / นักเรียน | ไทย |

## 🚀 Quick facts

- **Stack:** Node.js + Express, plain HTML/CSS/JS front-end (no build step), JSON file storage.
- **Port:** `http://localhost:4000`.
- **Default teacher account:** `Shinozuke67@skn.ac.th` / `12345678`.
- **Source code:** <https://github.com/Xypyion/ChemQuest>

To run it:

```bash
cd chemquest
npm install
npm start
# open http://localhost:4000
```
