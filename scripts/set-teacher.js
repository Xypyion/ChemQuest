#!/usr/bin/env node
/**
 * Set up the teacher account — `npm run teacher`.
 *
 * WHY THIS EXISTS
 * The teacher login used to be three literals in src/seed.js, in a repository
 * anyone can read. Anybody who found the repo had the login for every
 * deployment that had ever run the seed. The credentials now come from the
 * environment, and this is how a human sets them.
 *
 * WHY IT IS INTERACTIVE
 * So the password is typed by the person who owns it, straight into their own
 * terminal. It is never a command-line argument (those land in shell history
 * and in `ps`), never printed back, and never written anywhere except as a
 * bcrypt hash. Nobody else — including whoever is helping with the code — ever
 * sees it.
 *
 * WHAT IT DOES
 *   - creates the teacher if the database has none
 *   - otherwise updates the existing teacher's name, email and password
 *   - leaves every level, student and submission exactly where it is
 *
 * Run it with the server STOPPED. src/db.js keeps the whole store in memory and
 * writes it back on the next change, so a running server would overwrite this.
 */
const readline = require('readline');
const db = require('../src/db');
const { hashPassword } = require('../src/auth');

const MIN_PASSWORD = 8;

/* ---------- prompting ---------- */

function ask(rl, question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    if (!hidden) return rl.question(question, (a) => resolve(a.trim()));

    /* readline echoes what it is given. For a password we take over the write
       and print nothing at all — not even asterisks, which leak the length. */
    const onWrite = rl._writeToOutput;
    let armed = false;
    rl._writeToOutput = function (chunk) {
      if (armed) return;                       // swallow the typed characters
      onWrite.call(rl, chunk);
    };
    rl.question(question, (a) => {
      rl._writeToOutput = onWrite;
      rl.output.write('\n');
      resolve(a);
    });
    armed = true;
  });
}

/* ---------- validation ---------- */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function complain(password) {
  if (password.length < MIN_PASSWORD) return `at least ${MIN_PASSWORD} characters`;
  if (/^\d+$/.test(password)) return 'not only digits';
  if (/^(.)\1*$/.test(password)) return 'not the same character repeated';
  return null;
}

/* ---------- the script ---------- */

async function main() {
  /* `npm run teacher -- --default` applies the built-in login from src/seed.js
     to a database that already has a teacher. Seeding cannot do this: it bails
     out the moment it finds one, which is right — it must never overwrite a
     real deployment's account. But it leaves anyone who seeded before the
     default changed stuck on the old credentials with no way forward short of
     deleting their database. No password is typed, so this path needs no
     terminal. */
  if (process.argv.includes('--default')) return applyDefault();

  if (!process.stdin.isTTY) {
    console.error('This asks for a password, so it must be run in a terminal.');
    console.error('Set TEACHER_EMAIL and TEACHER_PASSWORD in .env for an unattended setup.');
    process.exit(1);
  }

  await db.ready();
  const existing = db.find('users', (u) => u.role === 'teacher');

  console.log('');
  console.log(existing
    ? `Updating the teacher account (currently ${existing.email}).`
    : 'No teacher account yet — creating one.');
  console.log('Nothing is echoed while you type the password.');
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    /* ---- email ---- */
    let email = '';
    while (!email) {
      const suggested = existing ? existing.email : '';
      const answer = await ask(rl, `Email${suggested ? ` [${suggested}]` : ''}: `);
      email = (answer || suggested).trim().toLowerCase();
      if (!EMAIL.test(email)) { console.log('  That does not look like an email address.'); email = ''; continue; }
      const clash = db.find('users', (u) => u.email.toLowerCase() === email && (!existing || u.id !== existing.id));
      if (clash) { console.log('  Another account already uses that address.'); email = ''; }
    }

    /* ---- display name ---- */
    const suggestedName = existing ? existing.name : 'Teacher';
    const name = (await ask(rl, `Display name [${suggestedName}]: `) || suggestedName).trim();

    /* ---- password ---- */
    let password = '';
    while (!password) {
      const first = await ask(rl, 'New password: ', { hidden: true });
      const problem = complain(first);
      if (problem) { console.log(`  The password must be ${problem}.`); continue; }
      const again = await ask(rl, 'Type it again: ', { hidden: true });
      if (first !== again) { console.log('  Those did not match.'); continue; }
      password = first;
    }

    /* ---- write ---- */
    const passwordHash = hashPassword(password);
    if (existing) {
      existing.email = email;
      existing.name = name;
      existing.passwordHash = passwordHash;
      db.save();
    } else {
      db.insert('users', {
        id: 'u_teacher_' + Date.now().toString(36),
        role: 'teacher',
        name,
        email,
        passwordHash,
        createdAt: new Date().toISOString(),
      });
    }
    await db.flush();

    console.log('');
    console.log(`Done. Sign in as ${email}.`);
    console.log('The password was not written to this terminal, to .env, or to the repo.');
    console.log('');
  } finally {
    rl.close();
    await db.close();
  }
}

/** Point the teacher account at the built-in default login. */
async function applyDefault() {
  const { teacherAccount } = require('../src/seed');
  const t = teacherAccount();

  await db.ready();
  const existing = db.find('users', (u) => u.role === 'teacher');
  const clash = db.find('users', (u) => u.email.toLowerCase() === t.email
    && (!existing || u.id !== existing.id));
  if (clash) {
    console.error(`Another account already uses ${t.email}. Run without --default to pick a different address.`);
    await db.close();
    process.exit(1);
  }

  if (existing) {
    console.log(`Updating ${existing.email} -> ${t.email}`);
    existing.email = t.email;
    existing.name = t.name;
    existing.passwordHash = hashPassword(t.password);
    db.save();
  } else {
    db.insert('users', {
      id: 'u_teacher_' + Date.now().toString(36),
      role: 'teacher',
      name: t.name,
      email: t.email,
      passwordHash: hashPassword(t.password),
      createdAt: new Date().toISOString(),
    });
    console.log('Created the teacher account.');
  }
  await db.flush();
  await db.close();

  console.log('');
  console.log(`  email     ${t.email}`);
  console.log(`  password  ${t.password}`);
  console.log('');
  console.log('Levels, students and submissions are untouched.');
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
