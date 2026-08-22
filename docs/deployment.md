# Deployment & Operations

## Requirements
- [Node.js](https://nodejs.org/) 18 or newer (tested on 25). No database server required.

## Install & run
```bash
cd chemquest
npm install
npm start
# open http://localhost:4000
```
On first start the app seeds the teacher account and 6 sample lessons automatically.

### Change the port
```bash
PORT=8080 npm start         # macOS/Linux
$env:PORT=8080; npm start   # Windows PowerShell
```
> Note: this project defaults to **4000**, not 3000.

## Default teacher account
| Email | Password |
|-------|----------|
| `krucj@gmail.com` | `StoiVenture2026` — public, change it with `npm run teacher` |

Change the password after first login (Students tab → 🔑 only resets *student* passwords;
to change the teacher password, edit the seed or add an account flow). Students self-register
on the welcome page.

## Data & backups
- All state is in **`data/db.json`** — back this file up to preserve accounts, lessons,
  progress, posts, challenges and challenge responses.
- **Watch the file size.** Storyboard images, challenge question images and simulation HTML
  are stored inline in `db.json` (images up to ~900 KB each, simulation snippets up to
  ~400 KB). A level pack full of uploaded pictures will grow the file quickly; if it becomes
  slow, move those images to `data/uploads/` or migrate the store (see
  [HANDOFF.md](HANDOFF.md) §13).
- Uploaded assignment files live in **`data/uploads/`** — back this up too.
- Both are git-ignored, so they are **not** committed to the repository.
- To reset to a clean install: stop the server, delete `data/db.json` (and optionally
  `data/uploads/`), then start again to re-seed.

## Updating from GitHub
```bash
git pull
npm install      # in case dependencies changed
npm start
```
Source: <https://github.com/Xypyion/StoiVenture>

## Production notes
- **Set a JWT secret:** the app uses `JWT_SECRET` from the environment, falling back to a
  development default. For real deployments, set a strong secret:
  ```bash
  JWT_SECRET="a-long-random-string" PORT=8080 npm start
  ```
- **Keep it running:** use a process manager (e.g. `pm2`, `systemd`, or a Windows service)
  so the server restarts on reboot/crash.
- **HTTPS:** put the app behind a reverse proxy (nginx/Caddy) for TLS if exposed beyond the
  local network.
- **Scale:** the JSON store is designed for a single classroom. For many concurrent classes,
  migrate the store in `src/db.js` to a real database.

## Health check
- `GET http://localhost:4000/` should return the welcome page.
- `POST /api/auth/login` with the teacher credentials should return a token.

## Troubleshooting
| Symptom | Likely cause / fix |
|---------|--------------------|
| `EADDRINUSE` on start | Port already in use — set a different `PORT`. |
| Teacher login fails | DB was reset or password changed; re-seed or reset. |
| Thai text shows boxes | The **Mali**/**TH Sarabun** font failed to load — check internet/font availability. |
| Uploaded image not showing | Confirm `data/uploads/` exists and is writable. |
| Video won't embed | Use a standard YouTube link/ID; some videos disable embedding. |
| Every save shows *"Something went wrong on the server."* (but seems to save after a refresh) | You are on a **serverless host with a read-only filesystem** (e.g. Vercel). `db.json` cannot be written. See [KNOWN-ISSUE-vercel-persistence.md](KNOWN-ISSUE-vercel-persistence.md). |
| Saving a level with images fails with a 413 | Serverless request-body cap (~4.5 MB on Vercel) vs. the app's 16 MB limit. Same doc, §4. |

## Storage backends

The app picks its storage automatically from the environment:

| `DATABASE_URL` | Backend | Use for |
|----------------|---------|---------|
| **not set** | `data/db.json` file | local dev, the school machine, any host with a real disk (Render, Railway, a VPS) |
| **set** | Postgres, table `chemquest_docs` | Vercel and other serverless hosts |

The startup banner prints which one is active (`➜ Storage: file` / `postgres`).

### Deploying to a serverless host (Vercel)

Serverless functions have a **read-only filesystem**, so the file backend cannot
work there — `DATABASE_URL` is mandatory.

1. Create a free Postgres database (Neon, Supabase, or Vercel Postgres).
2. Move the existing data across, from the machine holding the real `db.json`:
   ```bash
   DATABASE_URL="postgresql://…" npm run migrate
   ```
3. In Vercel → Settings → Environment Variables, set `DATABASE_URL` **and**
   `JWT_SECRET` for Production and Preview.
4. Redeploy.

`vercel.json` and `api/index.js` in the repo define the deployment; the app is
served entirely by the Express function.

> ⚠️ **If `DATABASE_URL` is missing on a serverless host, every save fails.**
> The server logs a loud warning at boot when it detects this. Full background:
> [KNOWN-ISSUE-vercel-persistence.md](KNOWN-ISSUE-vercel-persistence.md).
