# Security & Privacy

## Authentication
- Passwords are hashed with **bcrypt** (cost 10) and never stored or returned in plaintext.
  `publicUser()` strips `passwordHash` from every API response.
- Sessions use **JWT** signed with `JWT_SECRET` (30-day expiry). Tokens carry only the user
  id and role.
- Set a strong `JWT_SECRET` in production (see [deployment.md](deployment.md)).

## Authorisation (roles)
- Every API router is guarded: `authMiddleware` requires a valid token, and
  `requireRole('student'|'teacher')` restricts access.
- **Server-side enforcement** of game rules — a student cannot reach a locked level, an
  unopened post-test, a locked storyboard or pre-test (whichever the teacher put second),
  an unpublished challenge, a challenge that is not assigned to them, or a teacher route by
  editing the URL; the server re-checks and returns `403`.
- **Answer keys never reach students.** Pre/post-test questions are stripped by
  `sanitizeQuestion`, and challenge questions by `challenges.sanitizeQuestion` — correct
  indexes, accepted answers, table answer keys and the teacher's marking guide all stay on
  the server.

## Privacy of student data
- **Private questions** ("นักเรียนสงสัยอะไรมั้ย") are only delivered to the teacher and to
  the question's own author. Other students never receive them in API responses.
- Private questions can only be posted on a **teacher assignment post**, not on other
  students' posts.
- The assignment feed exposes only display name, avatar, and role on each post — not email
  or account details.

## File uploads
- Attachments are decoded from base64 and written to `data/uploads/` with a random prefix;
  the original name is sanitised.
- Limits: **6 files per post**, **8 MB per file**. Oversized or malformed uploads are
  rejected.
- Files are served as static content from `/uploads`. Deleting a post removes its files.

## Embedded simulations (challenges)
A **simulation** challenge question runs HTML that a *teacher* wrote, inside the student's
browser. It is isolated on purpose:

- The frame is rendered with `sandbox="allow-scripts allow-popups"` and **deliberately no
  `allow-same-origin`**, so the simulation gets an opaque origin: its scripts cannot read
  the page around it, the JWT in `localStorage`, or any StoiVenture cookie.
- The HTML is stored as data and re-escaped into the `srcdoc` attribute; it is never
  injected into the StoiVenture document itself.
- URL-mode simulations point at a third-party site and are loaded with
  `referrerpolicy="no-referrer"`.
- The snippet is capped at ~400 KB.

**Do not add `allow-same-origin` to that sandbox.** It would give any script a teacher
pastes (or copies from the web) full access to the session of every student who opens the
challenge. The same applies to the preview frame in the teacher console.

## Data residency
- All data stays in the school's own `data/` directory. The only external calls are to load
  web fonts (Google Fonts), to embed teacher-chosen YouTube videos
  (`youtube-nocookie.com`), and — if a teacher builds a URL-mode simulation — to load that
  address. No student data is sent to third parties. A URL simulation does reveal the
  student's IP to whatever site the teacher chose, so prefer well-known sources (e.g. PhET)
  or the HTML mode.

## Recommendations for deployment
1. Set a unique, strong `JWT_SECRET`.
2. Change the default teacher password before going live.
3. Serve over HTTPS via a reverse proxy if reachable beyond the local network.
4. Back up `data/db.json` and `data/uploads/` regularly.
5. Restrict OS-level access to the `data/` directory.

## Known limitations
- The JSON store has no row-level encryption; protect the host filesystem accordingly.
- There is no rate limiting or CAPTCHA on login/signup — add one if the app is public-facing.
- Email addresses are not verified at signup.
