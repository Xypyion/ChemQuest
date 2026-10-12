/**
 * npm run demo — a full fake class on this computer.
 *
 *   npm run demo                 start the demo copy, fill it the first time, open the browser
 *   npm run demo -- --reset      wipe the demo data and fill it again
 *   npm run demo -- --no-open    do not open a browser (for scripts and agents)
 *   npm run demo -- --verbose    show every API request in the log
 *
 * What it runs: the normal server, on port 4100, with
 *   DATA_DIR=data-demo   its own data folder — real data in data/ is never touched
 *   AI_FAKE=1            a canned Kru CJ (src/aiFake.js): no key, no cost
 *   DEMO=1               /demo-login signs the browser in as the demo teacher
 * and no DATABASE_URL, so it can never reach the live Postgres database.
 *
 * The class comes from scripts/demo-class.js and is put in through the real
 * API by scripts/demo-fill.js. Stop it with Ctrl+C.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const C = require('./demo-class');
const { fill } = require('./demo-fill');

const ROOT = path.join(__dirname, '..');
const DEMO_DIR = path.join(ROOT, 'data-demo');
const FILLED = path.join(DEMO_DIR, '.filled');   // written only after a fill finishes
const PORT = Number(process.env.DEMO_PORT) || 4100;
const BASE = `http://127.0.0.1:${PORT}`;

const args = new Set(process.argv.slice(2));
const reset = args.has('--reset');
const open = !args.has('--no-open');
const verbose = args.has('--verbose');

const say = (msg) => console.log(`[demo] ${msg}`);

async function up() {
  try {
    const res = await fetch(`${BASE}/api/auth/me`);
    return res.status === 401; // the API answered: the server is up
  } catch {
    return false;
  }
}

async function waitUntilUp(child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode != null) throw new Error('The demo server stopped while starting. See the messages above.');
    if (await up()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`The demo server did not answer on port ${PORT} within 20 seconds.`);
}

function openBrowser(url) {
  const [cmd, cmdArgs] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]];
  spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).unref();
}

/** Pass the server's output through, minus the one-line-per-request log. */
function pipe(stream, out) {
  let rest = '';
  stream.on('data', (buf) => {
    const lines = (rest + buf.toString()).split(/\r?\n/);
    rest = lines.pop();
    lines.forEach((line) => {
      if (!verbose && /\s(GET|POST|PUT|PATCH|DELETE) \/api\//.test(line)) return;
      out.write(line + '\n');
    });
  });
}

async function main() {
  if (await up()) {
    say(`Something is already running on port ${PORT}.`);
    say('If it is the demo, just open http://localhost:' + PORT + '/demo-login');
    say('To start again (or to --reset), stop it first: Ctrl+C in its window.');
    process.exit(1);
  }

  // A fill that stopped half-way leaves no .filled marker: start that one clean too.
  const fresh = reset || !fs.existsSync(FILLED);
  if (fresh && fs.existsSync(DEMO_DIR)) {
    say(reset ? 'Wiping data-demo/ (--reset)…' : 'data-demo/ was never fully filled. Starting it clean…');
    fs.rmSync(DEMO_DIR, { recursive: true, force: true });
  }

  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: 'data-demo',
    AI_FAKE: '1',
    DEMO: '1',
    // Blank, not unset: config.js never lets .env override a variable that
    // exists, so these stay empty even if .env sets them.
    DATABASE_URL: '',
    GEMINI_API_KEY: '',
    TUTOR_UNLIMITED: '',
    // The demo teacher, created by the normal seed on the empty data folder.
    TEACHER_NAME: C.TEACHER.name,
    TEACHER_EMAIL: C.TEACHER.email,
    TEACHER_PASSWORD: C.TEACHER.password,
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  const stop = () => { if (child.exitCode == null) child.kill(); };
  process.on('SIGINT', () => { stop(); process.exit(0); });
  process.on('SIGTERM', () => { stop(); process.exit(0); });
  process.on('exit', stop);
  child.on('exit', (code) => {
    if (code) say(`The demo server stopped (exit code ${code}).`);
    process.exit(code || 0);
  });

  await waitUntilUp(child);

  if (fresh) {
    say('Filling the demo class (about a minute)…');
    const t0 = Date.now();
    try {
      await fill(BASE, console.log);
    } catch (err) {
      say('The fill stopped: ' + err.message);
      say('The server is still running with what was filled so far. Fix the cause, then run again (it starts clean).');
      return;
    }
    fs.writeFileSync(FILLED, new Date().toISOString() + '\n');
    say(`Filled in ${Math.round((Date.now() - t0) / 1000)} s.`);
  } else {
    say('Using the existing demo data. (npm run demo -- --reset to start over.)');
  }

  const url = `http://localhost:${PORT}/demo-login`;
  console.log('');
  say(`Demo is running:  ${url}   (opens the teacher console, already signed in)`);
  say(`Teacher login:    ${C.TEACHER.email} / ${C.TEACHER.password}`);
  say(`Any student:      their email (see Students tab) / ${C.STUDENT_PASSWORD}`);
  say('Kru CJ is FAKE here: canned answers, no real AI. Data lives in data-demo/.');
  say('Stop: Ctrl+C');
  console.log('');
  if (open) openBrowser(url);
}

main().catch((err) => {
  console.error('[demo]', err.message);
  process.exit(1);
});
