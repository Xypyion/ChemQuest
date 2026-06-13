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
| `Shinozuke67@skn.ac.th` | `12345678` |

Change the password after first login (Students tab → 🔑 only resets *student* passwords;
to change the teacher password, edit the seed or add an account flow). Students self-register
on the welcome page.

## Data & backups
- All state is in **`data/db.json`** — back this file up to preserve accounts, lessons,
  progress, and posts.
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
Source: <https://github.com/Xypyion/ChemQuest>

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
