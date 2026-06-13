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
  unopened post-test, or a teacher route by editing the URL; the server re-checks and
  returns `403`.

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

## Data residency
- All data stays in the school's own `data/` directory. The only external calls are to load
  web fonts (Google Fonts) and to embed teacher-chosen YouTube videos
  (`youtube-nocookie.com`). No student data is sent to third parties.

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
