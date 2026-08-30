/**
 * Storing an uploaded file, on either kind of host.
 *
 * The assignment board has done this since it was written; badges now need the
 * same thing, so the logic lives here instead of being copied. The awkward part
 * it exists to hide:
 *
 *   • On a host with a real disk the bytes go to `data/uploads/` and are served
 *     as `/uploads/<file>` by express.static.
 *   • On a serverless host the filesystem is READ-ONLY, so `fs.writeFileSync`
 *     throws EROFS. There the bytes go into the database (collection `uploads`)
 *     and are served by the `/uploads/db/:id` route in server.js.
 *
 * Which one is in play is decided by the storage backend, not by guessing at
 * the environment — `db.backend` is already the thing that knows.
 * See docs/KNOWN-ISSUE-vercel-persistence.md.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads');

/** Anything that is not a plain filename character, including Thai. */
const SAFE_NAME = /[^\w.\- ()฀-๿]/g;

/**
 * Decode a `data:` URL and store it.
 *
 * @param {object} file          `{ name, data }`, data being a data: URL
 * @param {object} [opts]
 * @param {number} [opts.maxBytes]  size cap, after decoding
 * @param {RegExp} [opts.mimes]     which content types to accept
 * @returns {{id,name,type,size,url}|null} null when it is unusable
 */
function saveDataUrl(file, opts) {
  const options = opts || {};
  const maxBytes = options.maxBytes || 8 * 1024 * 1024;

  const name = ((file && file.name) || 'file').toString().replace(SAFE_NAME, '_').slice(0, 120) || 'file';
  const data = ((file && file.data) || '').toString();

  const m = data.match(/^data:([\w/+.-]+);base64,(.+)$/s);
  if (!m) return null;
  const mime = m[1];
  if (options.mimes && !options.mimes.test(mime)) return null;

  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > maxBytes) return null;

  if (db.backend !== 'file') {
    const id = crypto.randomUUID();
    db.insert('uploads', {
      id, name, type: mime, size: buf.length, b64: m[2], createdAt: new Date().toISOString(),
    });
    return { id, name, type: mime, size: buf.length, url: '/uploads/db/' + id };
  }

  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const fileName = crypto.randomUUID().slice(0, 8) + '__' + name;
  fs.writeFileSync(path.join(UPLOAD_DIR, fileName), buf);
  return {
    id: crypto.randomUUID(), name, type: mime, size: buf.length,
    url: '/uploads/' + encodeURIComponent(fileName),
  };
}

/**
 * Delete a file this module stored, by the url it handed back.
 *
 * Never throws: a file that has already gone is the outcome we wanted anyway,
 * and a failed cleanup must not take down the request that triggered it.
 */
function removeByUrl(url) {
  const u = (url || '').toString();
  if (!u) return;

  if (u.startsWith('/uploads/db/')) {
    db.remove('uploads', u.slice('/uploads/db/'.length));
    return;
  }
  try {
    const fileName = decodeURIComponent(u.split('/').pop() || '');
    if (fileName) fs.unlinkSync(path.join(UPLOAD_DIR, fileName));
  } catch (err) { /* already gone */ }
}

module.exports = { saveDataUrl, removeByUrl, UPLOAD_DIR };
