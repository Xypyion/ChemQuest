/**
 * Seeds the teacher account and a set of sample chemistry levels so the game
 * is playable the moment it boots. Runs automatically on first start (only if
 * the database is empty) and can also be run manually with `npm run seed`.
 *
 * Storyboards are an ordered list of steps. Each step is either a spoken
 * "line" (with an optional image) or a "video" — so the teacher controls
 * exactly where a video appears (mid-story, or right before the quiz).
 *
 * NOTE: the YouTube links below are sample demo videos. The teacher can swap
 * any of them for their own from the Teacher Console at any time.
 */
const crypto = require('crypto');
const db = require('./db');
const game = require('./game');
const { hashPassword } = require('./auth');

/* The first teacher account.
 *
 * These three values are the default login on a brand-new database. They are
 * in the source on purpose, so a fresh clone can be started and signed into
 * with nothing to configure — the school runs this with minimal infrastructure
 * and "install Node, npm start" is a feature.
 *
 * KNOW WHAT THAT MEANS: this repository is public, so this password is public.
 * It is a convenience for getting started, not a secret. Before a real class
 * uses the site, change it — either set TEACHER_EMAIL and TEACHER_PASSWORD in
 * the git-ignored `.env` before the first seed, or run `npm run teacher` at any
 * time, which asks in the terminal and never echoes what you type.
 *
 * The environment always wins over the values below. */
const config = require('./config');

const DEFAULT_TEACHER = {
  name: 'Kru CJ',
  email: 'krucj@skn.ac.th',
  password: 'StoiVenture2026',
};

function teacherAccount() {
  const t = config.teacherSeed();
  return {
    name: t.name || DEFAULT_TEACHER.name,
    email: t.email || DEFAULT_TEACHER.email,
    password: t.password || DEFAULT_TEACHER.password,
    /* true only when this run used the built-in default, so the console can say
       so once rather than every startup pretending it is a secret */
    isDefault: !t.password,
  };
}

// ---- storyboard helpers ----
const line = (mood, text, image) => ({ type: 'line', character: 'Kru CJ', mood, text, image: image || '' });
const video = (url, title) => ({ type: 'video', url, title });
const q = (question, choices, correctIndex, explanation) => ({ id: crypto.randomUUID(), question, choices, correctIndex, explanation });
const svgDataUri = (svg) => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);

// A tiny self-contained illustration used on one storyboard line (no network needed).
const STATES_IMG = svgDataUri(
  `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="160" viewBox="0 0 340 160">
   <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cdeeff"/><stop offset="1" stop-color="#eafff3"/></linearGradient></defs>
   <rect width="340" height="160" rx="18" fill="url(#bg)"/>
   <text x="170" y="30" font-family="sans-serif" font-size="18" font-weight="bold" text-anchor="middle" fill="#2a9d54">States of Matter</text>
   <g text-anchor="middle" font-family="sans-serif">
     <rect x="34" y="58" width="56" height="56" rx="8" fill="#6cc1ff" stroke="#2b8fd6" stroke-width="3"/><text x="62" y="140" font-size="14" fill="#34607a">Solid</text>
     <circle cx="170" cy="86" r="30" fill="#4aa3f0"/><path d="M170 56 q22 26 0 40 q-22 -14 0 -40z" fill="#9fd0ff"/><text x="170" y="140" font-size="14" fill="#34607a">Liquid</text>
     <circle cx="262" cy="74" r="9" fill="#bcd9f7"/><circle cx="288" cy="94" r="7" fill="#bcd9f7"/><circle cx="248" cy="102" r="6" fill="#bcd9f7"/><circle cx="278" cy="66" r="5" fill="#bcd9f7"/><text x="266" y="140" font-size="14" fill="#34607a">Gas</text>
   </g></svg>`
);

const LESSONS = [
  /* ----------------------------- THE MEADOW ----------------------------- */
  {
    title: 'What is Matter?',
    description: 'Begin your journey on the grassy plains and discover what everything is made of.',
    terrain: 'plain',
    icon: '🌱',
    timeLimit: 90,
    storyboard: [
      line('wave', "Hi explorer! I'm Kru CJ, your chemistry guide! Ready for a colorful adventure?"),
      line('excited', 'Everything around you — your desk, the air, even YOU — is made of MATTER!'),
      line('thinking', 'Matter comes in three main styles: solid, liquid, and gas.'),
      line('happy', 'Ice is a solid 🧊, water is a liquid 💧, and steam is a gas ☁️ — all the same stuff, just dressed differently!', STATES_IMG),
      video('https://www.youtube.com/watch?v=JQ4WduVp9k4', 'States of Matter for Kids'),
      line('cheer', "Now that you've watched the clip, show me what you've learned. Let's go!"),
    ],
    quizzes: {
      easy: [
        q('Which of these is a solid?', ['Steam', 'Ice cube', 'Air', 'Juice'], 1, 'A solid like an ice cube holds its own shape.'),
        q('What are the three main states of matter?', ['Hot, cold, warm', 'Solid, liquid, gas', 'Red, green, blue', 'Big, small, tiny'], 1, 'Solid, liquid and gas are the three classic states.'),
        q('Water that you drink is a…', ['Solid', 'Liquid', 'Gas', 'Light'], 1, 'Liquid water flows and takes the shape of its container.'),
      ],
      medium: [
        q('When ice melts, it turns into…', ['Gas', 'A liquid', 'A solid', 'Plasma'], 1, 'Melting changes a solid into a liquid.'),
        q('Which state has particles that are spread far apart and zoom around freely?', ['Solid', 'Liquid', 'Gas', 'None'], 2, 'In a gas the particles are far apart and move fast.'),
        q('What is it called when a liquid becomes a gas?', ['Freezing', 'Melting', 'Evaporation', 'Sledding'], 2, 'Evaporation turns a liquid into a gas.'),
      ],
      hard: [
        q('Steam condensing on a cold window becomes water. This change is called…', ['Condensation', 'Sublimation', 'Melting', 'Combustion'], 0, 'Condensation is gas turning back into a liquid.'),
        q('Which change goes straight from solid to gas, skipping liquid?', ['Evaporation', 'Sublimation', 'Freezing', 'Melting'], 1, 'Dry ice subliming is a famous example.'),
        q('Particles in a solid mostly…', ['Fly around freely', 'Vibrate in fixed places', 'Disappear', 'Turn into light'], 1, 'Solid particles are locked in place but still vibrate.'),
      ],
    },
  },
  {
    title: 'Tiny Building Blocks',
    description: 'Meet the atom — the teeny-tiny LEGO brick of the whole universe.',
    terrain: 'plain',
    icon: '⚛️',
    timeLimit: 60,
    storyboard: [
      line('happy', 'Great job on the last level! Now zoom in REALLY close with me…'),
      line('excited', 'Everything is built from tiny pieces called ATOMS. They are so small you could fit millions on this dot.'),
      line('thinking', 'An atom has a center called the nucleus, with electrons buzzing around it like little bees.'),
      line('happy', 'When atoms join hands, they make MOLECULES — like two hydrogens hugging one oxygen to make water!'),
      line('cheer', "Quiz time — but first, here's a quick video. Watch, then dive in!"),
      video('https://www.youtube.com/watch?v=xazQRcSCRaY', 'The 2,400-year search for the atom'),
    ],
    quizzes: {
      easy: [
        q('The tiny building block of all matter is the…', ['Atom', 'Apple', 'Atomizer', 'Anchor'], 0, 'Atoms are the basic building blocks of matter.'),
        q('What is the center of an atom called?', ['Shell', 'Nucleus', 'Crust', 'Core-dog'], 1, 'The nucleus sits at the center of the atom.'),
        q('Water is made of hydrogen and…', ['Oxygen', 'Gold', 'Salt', 'Sugar'], 0, 'Water is H₂O — hydrogen and oxygen.'),
      ],
      medium: [
        q('Electrons are found…', ['In the nucleus only', 'Buzzing around the nucleus', 'Outside the universe', 'Inside protons'], 1, 'Electrons move around the nucleus.'),
        q('When two or more atoms join together they form a…', ['Molecule', 'Mountain', 'Magnet', 'Mineral water'], 0, 'Joined atoms make a molecule.'),
        q('The chemical formula H₂O means…', ['2 oxygen, 1 hydrogen', '2 hydrogen, 1 oxygen', '2 helium', 'Hot water only'], 1, 'H₂O = 2 hydrogen atoms + 1 oxygen atom.'),
      ],
      hard: [
        q('Which particle in the nucleus has a positive charge?', ['Electron', 'Proton', 'Neutron', 'Photon'], 1, 'Protons carry a positive charge.'),
        q('A neutral atom has equal numbers of protons and…', ['Neutrons', 'Electrons', 'Molecules', 'Magnets'], 1, 'Equal protons and electrons make an atom neutral.'),
        q('Oxygen gas that we breathe is written as…', ['O', 'O₂', 'OX', '2O₂O'], 1, 'Oxygen gas travels as O₂, a pair of oxygen atoms.'),
      ],
    },
  },
  /* --------------------------- THE EMBER CANYON ------------------------- */
  {
    title: 'The Periodic Table Playground',
    description: 'Climb into the mountains where all the elements live in a giant colorful grid.',
    terrain: 'mountain',
    icon: '🧱',
    timeLimit: 60,
    storyboard: [
      line('wave', 'The air is getting warmer — we are climbing into the Element Canyon!'),
      line('excited', 'Every different kind of atom is an ELEMENT. Scientists lined them all up in the Periodic Table.'),
      video('https://www.youtube.com/watch?v=VgVQKCcfwnU', 'The Periodic Table Song'),
      line('thinking', 'Each element gets a short symbol: H is hydrogen, O is oxygen, Na is sodium, Au is gold!'),
      line('cheer', 'Now climb higher by acing this quiz!'),
    ],
    quizzes: {
      easy: [
        q('A pure substance made of only one kind of atom is called an…', ['Element', 'Elephant', 'Engine', 'Eraser'], 0, 'An element contains only one kind of atom.'),
        q('What is the chemical symbol for oxygen?', ['Ox', 'O', 'Og', 'Oy'], 1, 'Oxygen’s symbol is O.'),
        q('The chart that organizes all the elements is the…', ['Periodic Table', 'Times Table', 'Coffee Table', 'Score Table'], 0, 'The Periodic Table organizes the elements.'),
      ],
      medium: [
        q('The symbol "Na" stands for…', ['Nitrogen', 'Sodium', 'Nickel', 'Neon'], 1, 'Na (from Latin natrium) is sodium.'),
        q('Which element’s symbol is "Au"?', ['Silver', 'Aluminum', 'Gold', 'Argon'], 2, 'Au (aurum) is gold.'),
        q('Hydrogen’s symbol is…', ['He', 'H', 'Hy', 'Ho'], 1, 'Hydrogen is simply H.'),
      ],
      hard: [
        q('Roughly how many naturally occurring elements are there?', ['About 12', 'About 90', 'Exactly 50', 'Over 1000'], 1, 'There are about 90 naturally occurring elements.'),
        q('Elements in the same vertical column (group) tend to…', ['Behave similarly', 'Be totally random', 'All be metals only', 'Be liquids'], 0, 'Groups share similar chemical behavior.'),
        q('The symbol "Fe" represents…', ['Fluorine', 'Iron', 'Francium', 'Fermium'], 1, 'Fe (ferrum) is iron.'),
      ],
    },
  },
  {
    title: 'Mixing & Reactions',
    description: 'High on the mountain, watch substances transform in fizzing chemical reactions.',
    terrain: 'mountain',
    icon: '⚗️',
    timeLimit: 75,
    storyboard: [
      line('excited', 'Whoa, careful — the canyon lab is bubbling! Time to learn about chemical REACTIONS.'),
      video('https://www.youtube.com/watch?v=37pir0ej_SE', 'Chemical Changes (Crash Course Kids)'),
      line('thinking', 'A reaction is when substances change into NEW substances. The starting stuff is reactants; the new stuff is products.'),
      line('happy', 'Mix baking soda and vinegar and… FIZZ! That bubbly gas is a sign a reaction happened.'),
      line('cheer', 'Let’s test your reaction radar!'),
    ],
    quizzes: {
      easy: [
        q('In a reaction, the new substances made are called…', ['Reactants', 'Products', 'Leftovers', 'Snacks'], 1, 'Products are what a reaction makes.'),
        q('Baking soda + vinegar makes lots of…', ['Bubbles (gas)', 'Ice', 'Gold', 'Light'], 0, 'The fizzing bubbles are carbon dioxide gas.'),
        q('A sign that a chemical reaction happened could be…', ['Color change or bubbles', 'Nothing at all', 'The clock ticking', 'A loud song'], 0, 'Color change, bubbles, or heat can signal a reaction.'),
      ],
      medium: [
        q('The substances you start with in a reaction are the…', ['Products', 'Reactants', 'Prizes', 'Particles'], 1, 'Reactants are the starting materials.'),
        q('Burning wood is a chemical reaction because it makes…', ['New substances (ash, gas)', 'Only colder wood', 'A bigger log', 'Nothing new'], 0, 'Burning forms new substances like ash and gases.'),
        q('Which is NOT usually a sign of a chemical reaction?', ['Bubbles forming', 'Heat released', 'Color change', 'Moving the cup'], 3, 'Just moving a cup is a physical action, not a reaction.'),
      ],
      hard: [
        q('In reactions, atoms are never created or destroyed — they are only…', ['Rearranged', 'Deleted', 'Painted', 'Frozen'], 0, 'Conservation of mass: atoms are rearranged, not lost.'),
        q('Rust forming on iron is a reaction between iron and…', ['Oxygen', 'Helium', 'Plastic', 'Sound'], 0, 'Iron reacts with oxygen (and water) to form rust.'),
        q('A reaction that releases heat is described as…', ['Exothermic', 'Endothermic', 'Exoplanet', 'Endless'], 0, 'Exothermic reactions give off heat.'),
      ],
    },
  },
  /* -------------------------- THE SKY SUMMIT --------------------------- */
  {
    title: 'Acids & Bases',
    description: 'Reach the sky summit and explore the sour-and-slippery world of acids and bases.',
    terrain: 'snow',
    icon: '🧪',
    timeLimit: 60,
    storyboard: [
      line('wave', 'Brrr! Sky-summit air! Up here we taste-test science… safely, of course.'),
      line('thinking', 'ACIDS are often sour — like lemon juice and vinegar. BASES feel slippery — like soap.'),
      line('excited', 'We measure them with the pH scale from 0 to 14. Low = acid, 7 = neutral, high = base!'),
      video('https://www.youtube.com/watch?v=V5Mq_cL9Bck', 'Acids, Bases & the pH Scale for Kids'),
      line('cheer', 'Final stretch — show me your pH power!'),
    ],
    quizzes: {
      easy: [
        q('Lemon juice tastes sour, so it is an…', ['Acid', 'Base', 'Metal', 'Gas'], 0, 'Sour foods like lemon are acids.'),
        q('Soap feels slippery, so it is a…', ['Base', 'Acid', 'Salt', 'Snowball'], 0, 'Slippery soap is a base.'),
        q('The scale we use to measure acids and bases is the…', ['pH scale', 'Pie scale', 'Bathroom scale', 'Map scale'], 0, 'The pH scale measures acidity.'),
      ],
      medium: [
        q('On the pH scale, a value of 7 means the substance is…', ['Strong acid', 'Neutral', 'Strong base', 'Frozen'], 1, 'pH 7 is neutral, like pure water.'),
        q('A pH of 2 is a…', ['Strong acid', 'Neutral', 'Weak base', 'Strong base'], 0, 'Low pH numbers are acids.'),
        q('Paper that changes color to test pH is called an…', ['Indicator', 'Investigator', 'Iceberg', 'Index card'], 0, 'Indicators change color with pH.'),
      ],
      hard: [
        q('Which pH value is the MOST basic (alkaline)?', ['1', '7', '13', '4'], 2, 'The higher the pH, the more basic — 13 is very basic.'),
        q('When an acid and a base are mixed in the right amounts they…', ['Neutralize each other', 'Explode always', 'Freeze instantly', 'Turn to gold'], 0, 'Acid + base neutralize to form water and a salt.'),
        q('Stomach acid that helps digest food is mostly…', ['Hydrochloric acid', 'Soap', 'Pure water', 'Sugar'], 0, 'Your stomach uses hydrochloric acid.'),
      ],
    },
  },
  {
    title: 'Chemistry All Around Us',
    description: 'The grand finale at the peak: celebrate how chemistry powers your everyday life!',
    terrain: 'snow',
    icon: '🏆',
    timeLimit: 45,
    storyboard: [
      line('cheer', 'You made it to the very top — what a climb! Look at that view of everything we learned.'),
      line('happy', 'Cooking, cleaning, breathing, even fireworks — chemistry is EVERYWHERE!'),
      video('https://www.youtube.com/watch?v=rTC7w6bKh_4', 'What is Chemistry?'),
      line('excited', 'You now know matter, atoms, elements, reactions, and acids & bases. Real scientist stuff!'),
      line('wave', 'One last quiz to earn your final certificate. Make me proud, explorer!'),
    ],
    quizzes: {
      easy: [
        q('Cooking an egg is an example of chemistry because the egg…', ['Changes into something new', 'Stays exactly the same', 'Becomes a rock', 'Disappears'], 0, 'Heat changes the egg chemically.'),
        q('Which everyday activity uses chemistry?', ['Cooking food', 'None of them', 'Only sleeping', 'Just walking'], 0, 'Cooking, cleaning and more all use chemistry.'),
        q('Fireworks get their bright colors from different…', ['Chemicals (elements)', 'Stickers', 'Songs', 'Shadows'], 0, 'Different elements glow different colors.'),
      ],
      medium: [
        q('Soap helps clean because it can grab onto…', ['Grease and dirt', 'Sunlight', 'Sound', 'Gravity'], 0, 'Soap molecules grab grease so water can wash it away.'),
        q('The air you breathe is mostly which gas?', ['Nitrogen', 'Gold', 'Helium', 'Steam'], 0, 'Air is about 78% nitrogen.'),
        q('Refrigerators keep food fresh by slowing down…', ['Chemical reactions', 'The internet', 'Your homework', 'Music'], 0, 'Cold slows the reactions that spoil food.'),
      ],
      hard: [
        q('Plants make their own food using sunlight in a process called…', ['Photosynthesis', 'Photography', 'Sledding', 'Digestion'], 0, 'Photosynthesis turns sunlight, water and CO₂ into food.'),
        q('Baking a cake makes it rise thanks to a gas called…', ['Carbon dioxide', 'Oxygen only', 'Helium', 'Neon'], 0, 'Baking powder releases carbon dioxide bubbles.'),
        q('Antacid tablets cure a sour stomach by acting as a…', ['Base that neutralizes acid', 'Stronger acid', 'Metal', 'Frozen gas'], 0, 'Antacids are bases that neutralize stomach acid.'),
      ],
    },
  },
];

/** Stable ids for the seeded rows — see the note in seedIfEmpty(). */
const SEED_TEACHER_ID = '00000000-0000-4000-8000-00000000c0de';
const seedLessonId = (i) => `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`;

function seedIfEmpty() {
  const hasTeacher = db.find('users', (u) => u.role === 'teacher');
  if (hasTeacher) return false;

  console.log('[seed] First run detected — creating teacher account and sample levels…');
  const teacher = teacherAccount();

  db.insert('users', {
    // Deterministic ids: on a serverless host two cold instances can seed an
    // empty database at the same time. Fixed ids make the writes collide on the
    // same rows instead of creating duplicate teachers and duplicate levels.
    id: SEED_TEACHER_ID,
    role: 'teacher',
    name: teacher.name,
    email: teacher.email,
    passwordHash: hashPassword(teacher.password),
    createdAt: new Date().toISOString(),
  });

  LESSONS.forEach((lesson, i) => {
    db.insert('lessons', {
      id: seedLessonId(i),
      order: i + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timeLimit: 0,
      // Post-test starts empty and locked; the teacher builds and opens it.
      postTest: { open: false, timeLimit: 0, quizzes: { easy: [], medium: [], hard: [] } },
      // Access gate: 'auto' follows normal progression; teacher may lock/schedule.
      gate: { mode: 'auto', openAt: null },
      // Example peer/teacher rating criteria for student works (teacher can edit).
      ratingCriteria: [
        { id: crypto.randomUUID(), label: 'ความถูกต้องของเนื้อหา' },
        { id: crypto.randomUUID(), label: 'ความคิดสร้างสรรค์' },
        { id: crypto.randomUUID(), label: 'ความเรียบร้อยสวยงาม' },
      ],
      ...lesson,
    });
  });

  /* Show the login, and say plainly when it is the built-in default. A password
     the operator configured is theirs already; echoing it only puts it in a
     terminal log. */
  console.log('');
  console.log(`[seed] Teacher account created  (${LESSONS.length} levels)`);
  console.log(`         email     ${teacher.email}`);
  if (teacher.isDefault) {
    console.log(`         password  ${teacher.password}`);
    console.log('');
    console.log('[seed] That is the built-in default and it is public. Change it before a');
    console.log('[seed] real class uses the site:  npm run teacher');
  }
  console.log('');
  return true;
}

if (require.main === module) {
  // Load first (Postgres cannot be read synchronously) and flush before exiting,
  // or the seed would be lost.
  db.ready()
    .then(async () => {
      const created = seedIfEmpty();
      if (!created) console.log('[seed] A teacher already exists — nothing to do.');
      await db.flush();
      await db.close();
      process.exit(0);
    })
    .catch((err) => {
      console.error('[seed] Failed:', err.message);
      process.exit(1);
    });
}

module.exports = { seedIfEmpty, LESSONS, teacherAccount };
