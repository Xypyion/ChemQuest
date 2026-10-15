/**
 * The demo class: who the students are, and what they write.
 *
 * Everything here is hand-written so the demo looks like a real class, and is
 * the same every time. scripts/demo-fill.js adds a little seeded randomness on
 * top (which MCQs each student gets right, which of two answers they give), so
 * thirty students do not all look alike — but `--reset` always rebuilds the
 * same class.
 *
 * KEEP THIS UP TO DATE: when a feature adds new data, add a few lines here and
 * in demo-fill.js, or the demo stops showing it.
 */

/* ------------------------------------------------------------------ *
 * Logins
 * ------------------------------------------------------------------ */

// Fake accounts on a local copy only. Printed in the terminal by `npm run demo`.
const TEACHER = { name: 'Kru Demo', email: 'teacher@demo.local', password: 'demo-teacher' };
const STUDENT_PASSWORD = 'demo1234';

/* ------------------------------------------------------------------ *
 * Personas
 *
 *   skill   chance of getting a multiple-choice question right
 *   tiers   which written answers they give (see ANSWERS), picked at random
 *   logins  how many times they have signed in
 * ------------------------------------------------------------------ */
const PERSONAS = {
  star:       { skill: 0.95, tiers: ['full'], logins: [5, 7] },
  solid:      { skill: 0.82, tiers: ['full', 'good', 'good'], logins: [3, 5] },
  average:    { skill: 0.66, tiers: ['good', 'partial', 'partial'], logins: [2, 4] },
  struggling: { skill: 0.35, tiers: ['partial', 'wrong', 'wrong'], logins: [1, 3] },
  thai:       { skill: 0.78, tiers: ['th_full', 'th_part'], logins: [3, 4] },   // answers in Thai
  blanks:     { skill: 0.6, tiers: ['blank', 'blank', 'partial'], logins: [2, 3] }, // leaves written answers empty
  rusher:     { skill: 0.4, tiers: ['short'], logins: [6, 9] },               // fast, careless, short answers
  behind:     { skill: 0.62, tiers: ['good', 'partial'], logins: [1, 1] },    // finished Level 1, nothing since
  ghost:      { skill: 0, tiers: ['blank'], logins: [0, 0] },                 // signed up, never came back
};

/*
 * The class. `note` is for whoever reads this file, not shown anywhere.
 * Flags:
 *   failsPost  — fails the Level 1 post-test (one attempt only), so is stuck on Level 1
 *   midStory   — stopped half-way through the Level 2 storyboard
 *   skipsDue   — has not handed in the challenge that was due yesterday
 */
const STUDENTS = [
  { name: 'Ploy Srisuk', persona: 'star', avatar: 's2' },
  { name: 'Nattapong Wongsa', persona: 'star', avatar: 's1' },
  { name: 'Mild Chaiyasit', persona: 'star', avatar: 's5' },
  { name: 'Bank Rattanakorn', persona: 'solid', avatar: 's3' },
  { name: 'Praew Thongdee', persona: 'solid', avatar: 's6' },
  { name: 'Ice Kittisak', persona: 'solid', avatar: 's4' },
  { name: 'Fern Somboon', persona: 'solid', avatar: 's7' },
  { name: 'Tee Anurak', persona: 'solid', avatar: 's8' },
  { name: 'Mook Pattana', persona: 'solid', avatar: 's2' },
  { name: 'Jay Sirichai', persona: 'solid', avatar: 's1', midStory: true },
  { name: 'Pim Jaidee', persona: 'solid', avatar: 's5' },
  { name: 'Boss Charoen', persona: 'average', avatar: 's3' },
  { name: 'Namtan Prasert', persona: 'average', avatar: 's6', skipsDue: true },
  { name: 'Kao Suwan', persona: 'average', avatar: 's4' },
  { name: 'Bew Sakda', persona: 'average', avatar: 's8', midStory: true },
  { name: 'Gift Rungroj', persona: 'average', avatar: 's7' },
  { name: 'Oat Manee', persona: 'average', avatar: 's1', skipsDue: true },
  { name: 'Pang Wichai', persona: 'average', avatar: 's2' },
  { name: 'Fah Boonmee', persona: 'behind', avatar: 's6', note: 'did Level 1, nothing on Level 2' },
  { name: 'Tonkla Saetang', persona: 'struggling', avatar: 's3', failsPost: true, note: 'stuck on Level 1' },
  { name: 'Nok Ruangsri', persona: 'struggling', avatar: 's5', skipsDue: true },
  { name: 'Champ Intara', persona: 'struggling', avatar: 's4', midStory: true },
  { name: 'ณัฐวุฒิ แก้วมณี', persona: 'thai', avatar: 's1' },
  { name: 'ศิริพร ทองคำ', persona: 'thai', avatar: 's7' },
  { name: 'ภูมิ ใจดี', persona: 'thai', avatar: 's8' },
  { name: 'Earth Kongkaew', persona: 'blanks', avatar: 's3' },
  { name: 'Mint Sangthong', persona: 'blanks', avatar: 's6', skipsDue: true },
  { name: 'Ohm Pholsri', persona: 'rusher', avatar: 's4' },
  { name: 'Nine Thammasak', persona: 'rusher', avatar: 's8', skipsDue: true },
  { name: 'Bas Wongchai', persona: 'ghost', avatar: '' },
];

/* ------------------------------------------------------------------ *
 * Written answers, by question and tier.
 * Each tier has one or two versions; a student is given one of them.
 * ------------------------------------------------------------------ */
const ANSWERS = {
  /* Level 1 storyboard */
  solidGas: {
    full: [
      'In a solid the particles are packed close together and can only vibrate in place, so it keeps its shape. In a gas the particles are far apart and move freely and fast, so the gas spreads out to fill its whole container.',
      'Solid: particles very close together, they just vibrate, so it has a fixed shape. Gas: particles far apart, moving freely in every direction, so a gas fills any container it is in.',
    ],
    good: [
      'A solid has a fixed shape because its particles are close together. Gas particles are far apart and move around a lot.',
      'Particles in a solid are tightly packed and vibrate. In a gas they are spread far apart and move freely.',
    ],
    partial: ['A solid is hard and a gas is like air.', "Solids keep their shape but gases don't."],
    wrong: ['A gas is a solid that got really hot.', 'Gas particles are bigger than solid particles so a gas takes up more space.'],
    short: ['solid hard gas air', 'gas moves'],
    th_full: [
      'ของแข็งอนุภาคอยู่ชิดกันมากและสั่นอยู่กับที่ จึงมีรูปร่างคงที่ ส่วนแก๊สอนุภาคอยู่ห่างกันและเคลื่อนที่อย่างอิสระ จึงฟุ้งกระจายเต็มภาชนะ',
      'อนุภาคของของแข็งเรียงชิดกันและสั่นได้อย่างเดียว แต่อนุภาคของแก๊สอยู่ห่างกันมากและเคลื่อนที่เร็ว แก๊สจึงไม่มีรูปร่างแน่นอน',
    ],
    th_part: ['ของแข็งแข็ง แก๊สลอยได้', 'แก๊สอนุภาคอยู่ห่างกัน'],
  },

  /* Level 1 pre-test (written, 3 points) */
  iceMelts: {
    full: [
      'The heat gives the particles more energy, so they vibrate faster and faster. Then they break free of their fixed positions and can slide past each other, so the ice becomes liquid water.',
      'Particles gain energy from the warm air. They vibrate more until they break out of their fixed places. Now they can move past each other, which is a liquid.',
    ],
    good: [
      'The particles get energy from the heat and vibrate faster until they can move around, so it turns into water.',
      'Heat makes the particles move faster and they are not stuck in place any more.',
    ],
    partial: ['The ice gets hot and turns into water.', 'The particles move faster.'],
    wrong: ['The particles melt and get smaller.', 'The cold goes out of the ice so it becomes water.'],
    short: ['it melts', 'becomes water'],
    th_full: [
      'อนุภาคได้รับพลังงานจากความร้อน จึงสั่นเร็วขึ้นจนหลุดออกจากตำแหน่งเดิม แล้วเคลื่อนที่ผ่านกันได้ น้ำแข็งจึงกลายเป็นของเหลว',
      'ความร้อนทำให้อนุภาคมีพลังงานมากขึ้น สั่นแรงขึ้น และเคลื่อนที่ไปมาได้ จึงเป็นน้ำ',
    ],
    th_part: ['น้ำแข็งละลายเพราะร้อน', 'อนุภาคเคลื่อนที่เร็วขึ้น'],
  },

  /* Level 1 post-test (written, 2 points) */
  perfume: {
    full: [
      'The perfume evaporates into a gas. The gas particles move all the time and spread out through the air until some reach your nose.',
      'Perfume is a liquid that evaporates. Its particles become a gas and move randomly, spreading out across the room.',
    ],
    good: ['The perfume turns into a gas and the particles spread out in the air.', 'The particles of perfume move through the air to you.'],
    partial: ['Because the smell is strong.', 'The perfume goes into the air.'],
    wrong: ['The air pushes the smell to you like wind.', 'Perfume particles are very big so you can smell them.'],
    short: ['smell spreads', 'air'],
    th_full: [
      'น้ำหอมระเหยกลายเป็นแก๊ส อนุภาคของแก๊สเคลื่อนที่และแพร่กระจายไปในอากาศจนถึงจมูกเรา',
      'น้ำหอมระเหย อนุภาคเคลื่อนที่ไปทั่วห้อง',
    ],
    th_part: ['เพราะกลิ่นแรง', 'น้ำหอมลอยไปในอากาศ'],
  },

  /* Level 2 storyboard (whiteboard offered) */
  insideAtom: {
    full: [
      'There is a tiny nucleus in the centre with protons and neutrons in it, and electrons move around the nucleus in shells.',
      'In the middle is the nucleus (protons + neutrons). Electrons move around it in energy levels.',
    ],
    good: ['A nucleus with protons and neutrons, and electrons around it.', 'Protons and neutrons in the middle, electrons go around them.'],
    partial: ['Electrons and protons.', 'There is a nucleus in the middle.'],
    wrong: ['Atoms are made of molecules.', 'Inside an atom there are tiny cells.'],
    short: ['electrons', 'small stuff'],
    th_full: ['ตรงกลางเป็นนิวเคลียสที่มีโปรตอนและนิวตรอน และมีอิเล็กตรอนเคลื่อนที่รอบนิวเคลียส'],
    th_part: ['มีอิเล็กตรอน', 'มีนิวเคลียสอยู่ตรงกลาง'],
  },

  /* Level 2 storyboard */
  waterTwo: {
    full: [
      'It means there are 2 hydrogen atoms joined to 1 oxygen atom in each molecule of water.',
      'The 2 shows two hydrogen atoms. There is only one oxygen atom because there is no number after the O.',
    ],
    good: ['2 hydrogen atoms and 1 oxygen atom.', 'There are two hydrogen atoms in one water molecule.'],
    partial: ['There are 2 hydrogens.', 'It means two of something.'],
    wrong: ['It means there are 2 waters.', 'It means 2 oxygen atoms.'],
    short: ['2 H', 'two'],
    th_full: ['ในน้ำหนึ่งโมเลกุลมีไฮโดรเจน 2 อะตอม และออกซิเจน 1 อะตอม'],
    th_part: ['มีไฮโดรเจนสองตัว'],
  },

  /* Level 2 pre-test (written, 3 points) — waiting for the teacher */
  threeParticles: {
    full: [
      'Proton: positive charge (+1). Electron: negative charge (-1). Neutron: no charge, it is neutral.',
      'Protons are positive, electrons are negative and neutrons have no charge.',
    ],
    good: ['Proton is positive, electron is negative, neutron is neutral.', 'Proton +, electron -, neutron 0'],
    partial: ['Proton, neutron, electron.', 'Proton is positive and electron is negative.'],
    wrong: ['Proton negative, electron positive, neutron positive.', 'Atom, molecule, element.'],
    short: ['p n e', 'proton electron'],
    th_full: ['โปรตอนมีประจุบวก อิเล็กตรอนมีประจุลบ นิวตรอนไม่มีประจุ'],
    th_part: ['โปรตอน นิวตรอน อิเล็กตรอน', 'โปรตอนบวก อิเล็กตรอนลบ'],
  },

  /* Level 2 pre-test (written, 2 points) — waiting for the teacher */
  neutral: {
    full: [
      'Because it has the same number of protons and electrons, so the positive and negative charges cancel out.',
      'The number of protons equals the number of electrons. +1 and -1 cancel, so the total charge is zero.',
    ],
    good: ['Protons and electrons are the same number.', 'The positive and negative charges cancel out.'],
    partial: ['Because of the neutrons.', 'It has positive and negative.'],
    wrong: ['Because neutrons make it neutral.', 'Atoms have no charge inside.'],
    short: ['balanced', 'same'],
    th_full: ['เพราะจำนวนโปรตอนเท่ากับจำนวนอิเล็กตรอน ประจุบวกและประจุลบจึงหักล้างกันพอดี'],
    th_part: ['เพราะมีนิวตรอน', 'ประจุบวกกับลบเท่ากัน'],
  },

  /* Level 2 written challenge (4 points, Kru CJ may suggest marks) */
  massNucleus: {
    full: [
      'The protons and neutrons are in the nucleus, and they are much heavier than electrons. Electrons have almost no mass (about 1/1840 of a proton), so nearly all the mass is in the nucleus.',
      'Protons and neutrons are heavy and both are in the nucleus. Electrons are very light, almost no mass, so they hardly add anything.',
    ],
    good: ['Protons and neutrons are heavy and they are in the nucleus. Electrons are light.', 'Because electrons have almost no mass and the heavy particles are in the middle.'],
    partial: ['Because the nucleus is in the middle.', 'Protons are heavy.'],
    wrong: ['Because the nucleus is the biggest part of the atom.', 'Electrons are heavier but they move so you cannot weigh them.'],
    short: ['heavy', 'nucleus big'],
    th_full: ['โปรตอนและนิวตรอนอยู่ในนิวเคลียสและมีมวลมากกว่าอิเล็กตรอนมาก อิเล็กตรอนแทบไม่มีมวล มวลเกือบทั้งหมดจึงอยู่ที่นิวเคลียส'],
    th_part: ['เพราะนิวเคลียสใหญ่', 'โปรตอนหนัก'],
  },

  /* Level 2 written challenge (2 points, whiteboard) */
  massNumber: {
    full: ['Mass number = protons + neutrons = 6 + 6 = 12', 'mass number = 6 protons + 6 neutrons = 12'],
    good: ['6 + 6 = 12', '12, because protons + neutrons'],
    partial: ['12', 'It is 12'],
    wrong: ['6 + 6 + 6 = 18 (protons + neutrons + electrons)', '6'],
    short: ['12', '18'],
    th_full: ['เลขมวล = โปรตอน + นิวตรอน = 6 + 6 = 12'],
    th_part: ['12'],
  },
};

/* Whiteboard working that goes with some answers (lines of block text). */
const BOARDS = {
  massNumber: {
    good: ['P = 6', 'N = 6', 'A = P + N', 'A = 6 + 6 = 12'],
    wrong: ['P = 6  N = 6  E = 6', 'A = 6 + 6 + 6', 'A = 18'],
  },
};

/* ------------------------------------------------------------------ *
 * What the teacher has built
 * ------------------------------------------------------------------ */

/* Storyboard question steps, inserted into the seeded levels. */
const STORY_QUESTIONS = {
  level1: [
    {
      after: 3, key: 'solidGas',
      question: 'In your own words: what is the difference between a solid and a gas?',
      expected: 'Particles in a solid are packed close together and only vibrate in place\nParticles in a gas are far apart and move freely\nA solid keeps its shape\nA gas spreads out to fill its container',
      aiNote: 'This is a first check. Do not worry about perfect wording.',
    },
  ],
  level2: [
    {
      after: 2, key: 'insideAtom', whiteboard: true,
      question: 'What do you think is inside an atom? Draw it on the whiteboard if you like.',
      expected: 'A nucleus in the centre made of protons and neutrons\nElectrons moving around the nucleus',
    },
    {
      after: 4, key: 'waterTwo',
      question: 'Water is H₂O. What does the small 2 tell you?',
      expected: 'There are 2 hydrogen atoms in one water molecule\nThere is 1 oxygen atom',
    },
  ],
};

const mcq = (question, choices, correctIndex, explanation) => ({ type: 'mcq', question, choices, correctIndex, explanation: explanation || '' });
const written = (key, question, points, guide, extra) => ({ type: 'written', key, question, points, explanation: guide, ...(extra || {}) });

const TESTS = {
  level1: {
    preWritten: [
      written('iceMelts', 'Ice melts on a warm day. Explain what happens to the particles.', 3,
        'The particles gain energy from the heat\nThey vibrate faster and break free of their fixed positions\nThey can slide past each other, so the ice becomes a liquid'),
    ],
    post: [
      mcq('Which state of matter has a fixed shape?', ['Solid', 'Liquid', 'Gas', 'All of them'], 0),
      mcq('When water vapour touches a cold window it becomes…', ['Ice', 'Liquid water', 'Steam', 'Air'], 1, 'Condensation.'),
      mcq('Which particles move the fastest?', ['Particles in a solid', 'Particles in a liquid', 'Particles in a gas', 'They all move the same'], 2),
      mcq('Dry ice turning straight into gas is called…', ['Melting', 'Boiling', 'Sublimation', 'Freezing'], 2),
      mcq('A liquid takes the shape of…', ['Nothing', 'Its container', 'A cube', 'The air'], 1),
      written('perfume', 'Why can you smell perfume from across the room? Use the word "particles".', 2,
        'The perfume evaporates into a gas\nThe gas particles move and spread out through the air'),
    ],
  },
  level2: {
    preWritten: [
      written('threeParticles', 'Name the three particles in an atom and give the charge of each.', 3,
        'Proton: positive charge\nElectron: negative charge\nNeutron: no charge'),
      written('neutral', 'Why is an atom neutral overall?', 2,
        'It has the same number of protons and electrons\nThe positive and negative charges cancel out'),
    ],
    post: [
      mcq('Which particle has a negative charge?', ['Proton', 'Neutron', 'Electron', 'Nucleus'], 2),
      mcq('The mass number of an atom is…', ['Protons + electrons', 'Protons + neutrons', 'Neutrons only', 'Electrons only'], 1),
      mcq('An oxygen atom has 8 protons. How many electrons does a neutral oxygen atom have?', ['6', '8', '16', '0'], 1),
      mcq('Which is the smallest?', ['Atom', 'Molecule', 'Electron', 'Grain of sand'], 2),
      written('isotopes', 'Carbon-12 and carbon-14 are isotopes. What is the same about them, and what is different?', 2,
        'Same number of protons\nDifferent number of neutrons'),
    ],
  },
};

const CATEGORIES = [{ name: 'Practice' }, { name: 'Homework' }];

/* Challenges. `level` is 1 or 2; `due` is days from now (negative = past). */
const CHALLENGES = [
  {
    level: 1, category: 'Practice', title: 'Matter Sort', description: 'Quick practice on the three states of matter.', due: -3,
    questions: [
      { type: 'mcq', question: 'Which of these is a liquid at room temperature?', choices: ['Iron', 'Milk', 'Oxygen', 'Salt'], correctIndex: 1, points: 1 },
      { type: 'multi', question: 'Tick every example of a gas.', choices: ['Steam', 'Oxygen', 'Butter', 'Carbon dioxide'], correctIndexes: [0, 1, 3], points: 2 },
      { type: 'short', question: 'What is it called when a liquid turns into a gas?', accepted: ['evaporation', 'boiling', 'การระเหย', 'ระเหย'], points: 1 },
      {
        type: 'table', question: 'Fill in the table: does each state have a fixed shape and a fixed volume? (yes / no)', points: 3,
        table: {
          columns: ['State', 'Fixed shape?', 'Fixed volume?'],
          rows: [
            { cells: [{ text: 'Solid' }, { blank: true, answer: 'yes' }, { blank: true, answer: 'yes' }] },
            { cells: [{ text: 'Liquid' }, { blank: true, answer: 'no' }, { blank: true, answer: 'yes' }] },
            { cells: [{ text: 'Gas' }, { blank: true, answer: 'no' }, { blank: true, answer: 'no' }] },
          ],
        },
      },
    ],
  },
  {
    level: 2, category: 'Homework', title: 'Atom Check', description: 'Due yesterday. Five minutes, all auto-marked.', due: -1,
    questions: [
      { type: 'mcq', question: 'Which particle has no charge?', choices: ['Proton', 'Electron', 'Neutron', 'Ion'], correctIndex: 2, points: 1 },
      { type: 'mcq', question: 'What is the centre of an atom called?', choices: ['Shell', 'Nucleus', 'Core', 'Cell'], correctIndex: 1, points: 1 },
      { type: 'short', question: 'Carbon has atomic number 6. How many protons does it have?', accepted: ['6', 'six'], points: 1 },
    ],
  },
  {
    level: 2, category: 'Homework', title: 'Explain the Atom', description: 'Written answers. Show your working on the whiteboard for question 3.', due: 3,
    questions: [
      { type: 'mcq', question: 'Where is almost all the mass of an atom?', choices: ['In the electrons', 'In the nucleus', 'Spread evenly', 'In the empty space'], correctIndex: 1, points: 1 },
      {
        type: 'written', key: 'massNucleus', question: 'Why is almost all the mass of an atom in its nucleus?', points: 4, aiMark: true,
        rubric: 'Protons and neutrons are in the nucleus\nProtons and neutrons are much heavier than electrons\nElectrons have almost no mass',
        aiNote: 'Accept Thai or English. Give part marks.',
      },
      {
        type: 'written', key: 'massNumber', question: 'Carbon has 6 protons and 6 neutrons. Work out its mass number. Show your working.', points: 2, aiMark: true, whiteboard: true,
        rubric: 'Mass number = protons + neutrons\n6 + 6 = 12',
      },
    ],
  },
  {
    level: 2, category: 'Practice', title: 'Isotopes (draft)', description: 'Not published yet.', draft: true,
    questions: [{ type: 'mcq', question: 'Isotopes of an element have a different number of…', choices: ['Protons', 'Neutrons', 'Electrons', 'Atoms'], correctIndex: 1, points: 1 }],
  },
];

/* Daily Quests. `opens` / `closes` are days from now. `closeAfter` closes it once the class has answered. */
const QUESTS = [
  {
    title: 'Monday Warm-up', reward: 30, closes: 3, answeredBy: 0.75,
    questions: [
      { type: 'mcq', question: 'Which is a gas at room temperature?', choices: ['Iron', 'Oxygen', 'Salt', 'Sugar'], correctIndex: 1, points: 1 },
      { type: 'short', question: 'What do we call a gas turning into a liquid?', accepted: ['condensation', 'การควบแน่น', 'ควบแน่น'], points: 1 },
      { type: 'multi', question: 'Which are states of matter?', choices: ['Solid', 'Liquid', 'Gas', 'Heat'], correctIndexes: [0, 1, 2], points: 1 },
    ],
  },
  {
    title: 'Atom Speed Round', reward: 50, closes: 1, answeredBy: 0.6, closeAfter: true,
    questions: [
      { type: 'mcq', question: 'What charge does a proton have?', choices: ['Positive', 'Negative', 'None', 'It changes'], correctIndex: 0, points: 1 },
      { type: 'short', question: 'What is the chemical symbol for oxygen?', accepted: ['O'], caseSensitive: true, points: 1 },
      { type: 'mcq', question: 'Where are the electrons?', choices: ['In the nucleus', 'Around the nucleus', 'Inside protons', 'Nowhere'], correctIndex: 1, points: 1 },
    ],
  },
  {
    title: 'Mole Mini-Quest', reward: 40, opens: 1, closes: 4, answeredBy: 0,
    questions: [
      { type: 'short', question: 'How many moles are in 18 g of water? (M = 18 g/mol)', accepted: ['1', '1 mol'], points: 1 },
      { type: 'mcq', question: 'One mole of anything contains about…', choices: ['100 particles', '6.02 × 10²³ particles', '1 000 000 particles', '12 particles'], correctIndex: 1, points: 1 },
    ],
  },
];

/* Coin Battle question banks. */
const BATTLE_BANKS = {
  easy: [
    { type: 'mcq', question: 'Which particle is found outside the nucleus?', choices: ['Proton', 'Neutron', 'Electron'], correctIndex: 2 },
    { type: 'short', question: 'What is the symbol for hydrogen?', accepted: ['H'] },
    { type: 'mcq', question: 'Ice is water in which state?', choices: ['Solid', 'Liquid', 'Gas'], correctIndex: 0 },
  ],
  medium: [
    { type: 'mcq', question: 'How many atoms are in one molecule of H₂O?', choices: ['2', '3', '4', '1'], correctIndex: 1 },
    { type: 'short', question: 'Sodium has 11 protons and 12 neutrons. What is its mass number?', accepted: ['23'] },
    { type: 'multi', question: 'Which have a charge?', choices: ['Proton', 'Neutron', 'Electron'], correctIndexes: [0, 2] },
  ],
  hard: [
    { type: 'short', question: 'How many moles are in 36 g of water? (M = 18 g/mol)', accepted: ['2', '2 mol'] },
    { type: 'mcq', question: 'In 2H₂ + O₂ → 2H₂O, how many moles of O₂ react with 4 mol of H₂?', choices: ['1', '2', '4', '8'], correctIndex: 1 },
  ],
};

/* Duel questions students write (checked by the demo Kru CJ before sending). */
const DUEL_QUESTIONS = [
  { type: 'short', question: 'How many grams are in 2 mol of carbon? (C = 12 g/mol)', accepted: ['24', '24 g'] },
  { type: 'mcq', question: 'What is the molar mass of O₂? (O = 16)', choices: ['16 g/mol', '32 g/mol', '8 g/mol'], correctIndex: 1 },
  { type: 'short', question: 'น้ำ 9 กรัม มีกี่โมล (M = 18 g/mol)', accepted: ['0.5', '0.5 mol'] },
];

/* The assignment board. */
const ASSIGNMENTS = {
  level1: {
    title: 'States of matter poster',
    text: 'Make a small poster that shows a solid, a liquid and a gas. Draw the particles for each one. Post a photo or a picture here.',
    criteria: ['Correct science', 'Clear labels', 'Creativity'],
    handIns: [
      'My poster: ice, water and steam. I drew the particles close together for ice and far apart for steam.',
      'Here is my poster! Solid = rock, liquid = juice, gas = balloon air.',
      'โปสเตอร์ของผม วาดอนุภาคของแข็ง ของเหลว และแก๊ส',
      'I used three jars to show the three states.',
      'My poster (sorry the photo is a bit dark).',
    ],
  },
  level2: {
    title: 'Build an atom model',
    text: 'Draw or build a model of a carbon atom. Show the protons, neutrons and electrons, and label the charges.',
    criteria: ['Right particles in the right place', 'Labels and charges', 'Neat and easy to read'],
    handIns: [
      'My carbon atom: 6 protons and 6 neutrons in the middle, 6 electrons on two shells (2 and 4).',
      'I made it with clay at home and took a picture.',
      'อะตอมคาร์บอนของหนู มีอิเล็กตรอน 6 ตัว',
      'Carbon atom model. The red ball is the nucleus.',
      'Here is mine, I hope the labels are big enough.',
    ],
  },
};

const COMMENTS = ['Nice colours!', 'สวยมาก', 'I think the electrons should be further out.', 'เหมือนของเราเลย', 'How did you draw the shells?', 'Good idea using jars!'];

const CLASS_POSTS = [
  { level: 2, text: 'Does anyone know when the Level 2 post-test opens?' },
  { level: 1, text: 'Fun fact: dry ice goes straight from solid to gas. That is called sublimation!' },
  { level: 2, text: 'ใครเข้าใจเรื่องนิวตรอนบ้าง อธิบายหน่อยได้ไหม' },
];

const PRIVATE_QUESTIONS = [
  { level: 2, text: 'Kru, can I build the model with clay instead of drawing it?' },
  { level: 2, text: 'ครูคะ ต้องใส่นิวตรอนด้วยไหมคะ' },
];

const TUTOR_QUESTIONS = ['I do not understand where to start.', 'Is the mass in the electrons?', 'ทำไมนิวเคลียสหนัก', 'Do I add the electrons too?'];

module.exports = {
  TEACHER, STUDENT_PASSWORD, PERSONAS, STUDENTS, ANSWERS, BOARDS,
  STORY_QUESTIONS, TESTS, CATEGORIES, CHALLENGES, QUESTS, BATTLE_BANKS, DUEL_QUESTIONS,
  ASSIGNMENTS, COMMENTS, CLASS_POSTS, PRIVATE_QUESTIONS, TUTOR_QUESTIONS,
};
