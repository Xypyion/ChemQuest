/**
 * The periodic table, as data.
 *
 * WHY THIS IS A FILE AND NOT A DATABASE COLLECTION
 * There are 118 elements and there have been 118 for years. This never changes
 * per school, per class or per teacher, so it does not belong in `db.json` —
 * it belongs in the repo where it can be read, reviewed and corrected. It also
 * means the Lab works with an empty database and with no network.
 *
 * WHY NOT ASK GEMINI FOR IT
 * `src/aiQuestions.js` exists and could write facts all day. It must not do it
 * here, for three reasons:
 *   1. A round of a game cannot wait on a model. The measured round trip is
 *      several seconds; Element Rush is a sixty second game.
 *   2. A class of forty playing ten rounds is four hundred API calls a day,
 *      every day, on a school's free tier.
 *   3. A hallucinated "fact" in a classroom is worse than no fact at all. Every
 *      line below is checkable and was written once, on purpose.
 *
 * WHAT NEEDS A HUMAN EYE
 * The Thai names follow the standard transliterations used in Thai chemistry
 * teaching. The common ones are safe. The synthetic elements at the bottom of
 * the table (Z >= 104) are rarely written in Thai at all and a teacher should
 * check them before anyone is graded on them — nothing here is, today.
 */

/* z, symbol, English, Thai, category, rarity (0 common, 1 uncommon, 2 rare) */
const RAW = [
  [1, 'H', 'Hydrogen', 'ไฮโดรเจน', 'nonmetal', 0],
  [2, 'He', 'Helium', 'ฮีเลียม', 'noble', 0],
  [3, 'Li', 'Lithium', 'ลิเทียม', 'alkali', 0],
  [4, 'Be', 'Beryllium', 'เบริลเลียม', 'alkaline', 1],
  [5, 'B', 'Boron', 'โบรอน', 'metalloid', 1],
  [6, 'C', 'Carbon', 'คาร์บอน', 'nonmetal', 0],
  [7, 'N', 'Nitrogen', 'ไนโตรเจน', 'nonmetal', 0],
  [8, 'O', 'Oxygen', 'ออกซิเจน', 'nonmetal', 0],
  [9, 'F', 'Fluorine', 'ฟลูออรีน', 'halogen', 0],
  [10, 'Ne', 'Neon', 'นีออน', 'noble', 0],
  [11, 'Na', 'Sodium', 'โซเดียม', 'alkali', 0],
  [12, 'Mg', 'Magnesium', 'แมกนีเซียม', 'alkaline', 0],
  [13, 'Al', 'Aluminium', 'อะลูมิเนียม', 'post', 0],
  [14, 'Si', 'Silicon', 'ซิลิคอน', 'metalloid', 0],
  [15, 'P', 'Phosphorus', 'ฟอสฟอรัส', 'nonmetal', 0],
  [16, 'S', 'Sulfur', 'กำมะถัน', 'nonmetal', 0],
  [17, 'Cl', 'Chlorine', 'คลอรีน', 'halogen', 0],
  [18, 'Ar', 'Argon', 'อาร์กอน', 'noble', 0],
  [19, 'K', 'Potassium', 'โพแทสเซียม', 'alkali', 0],
  [20, 'Ca', 'Calcium', 'แคลเซียม', 'alkaline', 0],
  [21, 'Sc', 'Scandium', 'สแกนเดียม', 'transition', 2],
  [22, 'Ti', 'Titanium', 'ไทเทเนียม', 'transition', 0],
  [23, 'V', 'Vanadium', 'วาเนเดียม', 'transition', 1],
  [24, 'Cr', 'Chromium', 'โครเมียม', 'transition', 0],
  [25, 'Mn', 'Manganese', 'แมงกานีส', 'transition', 1],
  [26, 'Fe', 'Iron', 'เหล็ก', 'transition', 0],
  [27, 'Co', 'Cobalt', 'โคบอลต์', 'transition', 1],
  [28, 'Ni', 'Nickel', 'นิกเกิล', 'transition', 0],
  [29, 'Cu', 'Copper', 'ทองแดง', 'transition', 0],
  [30, 'Zn', 'Zinc', 'สังกะสี', 'transition', 0],
  [31, 'Ga', 'Gallium', 'แกลเลียม', 'post', 1],
  [32, 'Ge', 'Germanium', 'เจอร์เมเนียม', 'metalloid', 2],
  [33, 'As', 'Arsenic', 'สารหนู', 'metalloid', 1],
  [34, 'Se', 'Selenium', 'ซีลีเนียม', 'nonmetal', 2],
  [35, 'Br', 'Bromine', 'โบรมีน', 'halogen', 0],
  [36, 'Kr', 'Krypton', 'คริปทอน', 'noble', 1],
  [37, 'Rb', 'Rubidium', 'รูบิเดียม', 'alkali', 2],
  [38, 'Sr', 'Strontium', 'สตรอนเชียม', 'alkaline', 1],
  [39, 'Y', 'Yttrium', 'อิตเทรียม', 'transition', 2],
  [40, 'Zr', 'Zirconium', 'เซอร์โคเนียม', 'transition', 2],
  [41, 'Nb', 'Niobium', 'ไนโอเบียม', 'transition', 2],
  [42, 'Mo', 'Molybdenum', 'โมลิบดีนัม', 'transition', 2],
  [43, 'Tc', 'Technetium', 'เทคนีเชียม', 'transition', 2],
  [44, 'Ru', 'Ruthenium', 'รูทีเนียม', 'transition', 2],
  [45, 'Rh', 'Rhodium', 'โรเดียม', 'transition', 2],
  [46, 'Pd', 'Palladium', 'แพลเลเดียม', 'transition', 2],
  [47, 'Ag', 'Silver', 'เงิน', 'transition', 0],
  [48, 'Cd', 'Cadmium', 'แคดเมียม', 'transition', 2],
  [49, 'In', 'Indium', 'อินเดียม', 'post', 2],
  [50, 'Sn', 'Tin', 'ดีบุก', 'post', 0],
  [51, 'Sb', 'Antimony', 'พลวง', 'metalloid', 2],
  [52, 'Te', 'Tellurium', 'เทลลูเรียม', 'metalloid', 2],
  [53, 'I', 'Iodine', 'ไอโอดีน', 'halogen', 0],
  [54, 'Xe', 'Xenon', 'ซีนอน', 'noble', 1],
  [55, 'Cs', 'Caesium', 'ซีเซียม', 'alkali', 1],
  [56, 'Ba', 'Barium', 'แบเรียม', 'alkaline', 1],
  [57, 'La', 'Lanthanum', 'แลนทานัม', 'lanthanide', 2],
  [58, 'Ce', 'Cerium', 'ซีเรียม', 'lanthanide', 2],
  [59, 'Pr', 'Praseodymium', 'เพรซีโอดิเมียม', 'lanthanide', 2],
  [60, 'Nd', 'Neodymium', 'นีโอดิเมียม', 'lanthanide', 1],
  [61, 'Pm', 'Promethium', 'โพรมีเทียม', 'lanthanide', 2],
  [62, 'Sm', 'Samarium', 'ซาแมเรียม', 'lanthanide', 2],
  [63, 'Eu', 'Europium', 'ยูโรเพียม', 'lanthanide', 2],
  [64, 'Gd', 'Gadolinium', 'แกโดลิเนียม', 'lanthanide', 2],
  [65, 'Tb', 'Terbium', 'เทอร์เบียม', 'lanthanide', 2],
  [66, 'Dy', 'Dysprosium', 'ดิสโพรเซียม', 'lanthanide', 2],
  [67, 'Ho', 'Holmium', 'โฮลเมียม', 'lanthanide', 2],
  [68, 'Er', 'Erbium', 'เออร์เบียม', 'lanthanide', 2],
  [69, 'Tm', 'Thulium', 'ทูเลียม', 'lanthanide', 2],
  [70, 'Yb', 'Ytterbium', 'อิตเทอร์เบียม', 'lanthanide', 2],
  [71, 'Lu', 'Lutetium', 'ลูทีเชียม', 'lanthanide', 2],
  [72, 'Hf', 'Hafnium', 'แฮฟเนียม', 'transition', 2],
  [73, 'Ta', 'Tantalum', 'แทนทาลัม', 'transition', 2],
  [74, 'W', 'Tungsten', 'ทังสเตน', 'transition', 1],
  [75, 'Re', 'Rhenium', 'รีเนียม', 'transition', 2],
  [76, 'Os', 'Osmium', 'ออสเมียม', 'transition', 2],
  [77, 'Ir', 'Iridium', 'อิริเดียม', 'transition', 2],
  [78, 'Pt', 'Platinum', 'แพลทินัม', 'transition', 0],
  [79, 'Au', 'Gold', 'ทองคำ', 'transition', 0],
  [80, 'Hg', 'Mercury', 'ปรอท', 'transition', 0],
  [81, 'Tl', 'Thallium', 'แทลเลียม', 'post', 2],
  [82, 'Pb', 'Lead', 'ตะกั่ว', 'post', 0],
  [83, 'Bi', 'Bismuth', 'บิสมัท', 'post', 1],
  [84, 'Po', 'Polonium', 'พอโลเนียม', 'post', 2],
  [85, 'At', 'Astatine', 'แอสทาทีน', 'halogen', 2],
  [86, 'Rn', 'Radon', 'เรดอน', 'noble', 1],
  [87, 'Fr', 'Francium', 'แฟรนเซียม', 'alkali', 2],
  [88, 'Ra', 'Radium', 'เรเดียม', 'alkaline', 1],
  [89, 'Ac', 'Actinium', 'แอกทิเนียม', 'actinide', 2],
  [90, 'Th', 'Thorium', 'ทอเรียม', 'actinide', 2],
  [91, 'Pa', 'Protactinium', 'โพรแทกทิเนียม', 'actinide', 2],
  [92, 'U', 'Uranium', 'ยูเรเนียม', 'actinide', 1],
  [93, 'Np', 'Neptunium', 'เนปทูเนียม', 'actinide', 2],
  [94, 'Pu', 'Plutonium', 'พลูโทเนียม', 'actinide', 1],
  [95, 'Am', 'Americium', 'อะเมริเซียม', 'actinide', 2],
  [96, 'Cm', 'Curium', 'คูเรียม', 'actinide', 2],
  [97, 'Bk', 'Berkelium', 'เบอร์คีเลียม', 'actinide', 2],
  [98, 'Cf', 'Californium', 'แคลิฟอร์เนียม', 'actinide', 2],
  [99, 'Es', 'Einsteinium', 'ไอน์สไตเนียม', 'actinide', 2],
  [100, 'Fm', 'Fermium', 'เฟอร์เมียม', 'actinide', 2],
  [101, 'Md', 'Mendelevium', 'เมนเดลีเวียม', 'actinide', 2],
  [102, 'No', 'Nobelium', 'โนเบเลียม', 'actinide', 2],
  [103, 'Lr', 'Lawrencium', 'ลอว์เรนเซียม', 'actinide', 2],
  [104, 'Rf', 'Rutherfordium', 'รัทเทอร์ฟอร์เดียม', 'transition', 2],
  [105, 'Db', 'Dubnium', 'ดุบเนียม', 'transition', 2],
  [106, 'Sg', 'Seaborgium', 'ซีบอร์เกียม', 'transition', 2],
  [107, 'Bh', 'Bohrium', 'โบห์เรียม', 'transition', 2],
  [108, 'Hs', 'Hassium', 'ฮัสเซียม', 'transition', 2],
  [109, 'Mt', 'Meitnerium', 'ไมต์เนเรียม', 'transition', 2],
  [110, 'Ds', 'Darmstadtium', 'ดาร์มสตัดเทียม', 'transition', 2],
  [111, 'Rg', 'Roentgenium', 'เรินต์เกเนียม', 'transition', 2],
  [112, 'Cn', 'Copernicium', 'โคเปอร์นิเซียม', 'transition', 2],
  [113, 'Nh', 'Nihonium', 'นิโฮเนียม', 'post', 2],
  [114, 'Fl', 'Flerovium', 'ฟลีโรเวียม', 'post', 2],
  [115, 'Mc', 'Moscovium', 'มอสโกเวียม', 'post', 2],
  [116, 'Lv', 'Livermorium', 'ลิเวอร์มอเรียม', 'post', 2],
  [117, 'Ts', 'Tennessine', 'เทนเนสซีน', 'halogen', 2],
  [118, 'Og', 'Oganesson', 'ออกาเนสซอน', 'noble', 2],
];

/**
 * Where each element sits on the printed table: [row, column], 1-indexed.
 * The lanthanides and actinides go in the two detached rows 9 and 10, which is
 * how every wall chart in every classroom draws them.
 */
function gridPos(z) {
  const P = {
    1: [1, 1], 2: [1, 18],
    3: [2, 1], 4: [2, 2], 5: [2, 13], 6: [2, 14], 7: [2, 15], 8: [2, 16], 9: [2, 17], 10: [2, 18],
    11: [3, 1], 12: [3, 2], 13: [3, 13], 14: [3, 14], 15: [3, 15], 16: [3, 16], 17: [3, 17], 18: [3, 18],
  };
  if (P[z]) return P[z];
  if (z >= 19 && z <= 36) return [4, z - 18];
  if (z >= 37 && z <= 54) return [5, z - 36];
  if (z === 55 || z === 56) return [6, z - 54];
  if (z === 57) return [6, 3];
  if (z >= 58 && z <= 71) return [9, z - 54];        // lanthanides, detached row
  if (z >= 72 && z <= 86) return [6, z - 68];
  if (z === 87 || z === 88) return [7, z - 86];
  if (z === 89) return [7, 3];
  if (z >= 90 && z <= 103) return [10, z - 86];      // actinides, detached row
  if (z >= 104 && z <= 118) return [7, z - 100];
  return [7, 18];
}

const ELEMENTS = RAW.map(([z, sym, en, th, cat, rarity]) => {
  const [row, col] = gridPos(z);
  return { z, sym, en, th, cat, rarity, row, col };
});

const BY_SYMBOL = new Map(ELEMENTS.map((e) => [e.sym, e]));
const BY_Z = new Map(ELEMENTS.map((e) => [e.z, e]));

/**
 * Facts and clues, for the elements a school student has any reason to meet.
 *
 * `fact` is what the collection card shows when you find the element.
 * `clues` drive Guess the Element and are ordered HARDEST FIRST — clue 1 should
 * be solvable but not obvious, clue 3 should give it away. Guessing early pays
 * more, so an easy first clue would make the game pay out for nothing.
 *
 * Everything here is a checkable statement. Nothing is a "fun-sounding" claim.
 */
const LORE = {
  H: {
    fact: { en: 'About three quarters of all ordinary matter in the universe is hydrogen. It is also the lightest thing there is.',
            th: 'สสารธรรมดาในเอกภพราวสามในสี่เป็นไฮโดรเจน และยังเป็นธาตุที่เบาที่สุดด้วย' },
    clues: [
      { en: 'I am the most common element in the universe.', th: 'ฉันเป็นธาตุที่พบมากที่สุดในเอกภพ' },
      { en: 'Stars burn me for fuel.', th: 'ดาวฤกษ์ใช้ฉันเป็นเชื้อเพลิง' },
      { en: 'I am the first element on the table, atomic number 1.', th: 'ฉันคือธาตุแรกในตาราง เลขอะตอม 1' },
    ],
  },
  He: {
    fact: { en: 'Helium was found in the Sun before anyone found it on Earth. Astronomers saw it in sunlight in 1868; it was not isolated here for another 27 years.',
            th: 'ฮีเลียมถูกพบในดวงอาทิตย์ก่อนที่จะพบบนโลก นักดาราศาสตร์เห็นมันในแสงอาทิตย์เมื่อ ค.ศ. 1868 และอีก 27 ปีจึงแยกได้บนโลก' },
    clues: [
      { en: 'I was discovered in the Sun before I was found on Earth.', th: 'ฉันถูกค้นพบในดวงอาทิตย์ก่อนถูกพบบนโลก' },
      { en: 'I will not react with anything, and I am the second lightest element.', th: 'ฉันไม่ทำปฏิกิริยากับอะไรเลย และเบาเป็นอันดับสอง' },
      { en: 'People put me in balloons.', th: 'คนเอาฉันไปใส่ลูกโป่ง' },
    ],
  },
  Li: {
    fact: { en: 'Lithium is the lightest metal — light enough to float on water, though it reacts with the water while it floats.',
            th: 'ลิเทียมเป็นโลหะที่เบาที่สุด เบาพอจะลอยน้ำได้ แม้จะทำปฏิกิริยากับน้ำไปด้วยขณะลอย' },
    clues: [
      { en: 'I am the lightest metal of all.', th: 'ฉันคือโลหะที่เบาที่สุด' },
      { en: 'I float on water and react with it at the same time.', th: 'ฉันลอยน้ำและทำปฏิกิริยากับน้ำไปพร้อมกัน' },
      { en: 'Your phone battery is named after me.', th: 'แบตเตอรี่ในโทรศัพท์ของคุณตั้งชื่อตามฉัน' },
    ],
  },
  C: {
    fact: { en: 'Diamond and graphite are both pure carbon. The only difference is how the atoms are joined — which is why one cuts glass and the other writes on paper.',
            th: 'เพชรและแกรไฟต์ต่างก็เป็นคาร์บอนบริสุทธิ์ ต่างกันแค่การจัดเรียงอะตอม จึงทำให้อย่างหนึ่งตัดกระจกได้ อีกอย่างใช้เขียนกระดาษ' },
    clues: [
      { en: 'Every living thing on Earth is built around me.', th: 'สิ่งมีชีวิตทุกชนิดบนโลกสร้างขึ้นรอบตัวฉัน' },
      { en: 'I can be the hardest natural material, or soft enough to write with.', th: 'ฉันเป็นได้ทั้งวัสดุธรรมชาติที่แข็งที่สุด และอ่อนพอจะใช้เขียนได้' },
      { en: 'Diamond and pencil lead are both me.', th: 'เพชรและไส้ดินสอต่างก็เป็นฉัน' },
    ],
  },
  N: {
    fact: { en: 'Nitrogen is 78% of the air you are breathing right now, and almost none of it does anything — it just goes back out again.',
            th: 'ไนโตรเจนคิดเป็น 78% ของอากาศที่คุณกำลังหายใจอยู่ และเกือบทั้งหมดไม่ทำอะไรเลย หายใจเข้าไปแล้วก็ออกมา' },
    clues: [
      { en: 'I am most of the air, but your body ignores me.', th: 'ฉันคืออากาศส่วนใหญ่ แต่ร่างกายคุณไม่สนใจฉันเลย' },
      { en: 'In liquid form I am cold enough to freeze a flower solid.', th: 'ในรูปของเหลว ฉันเย็นพอจะทำให้ดอกไม้แข็งได้ทันที' },
      { en: 'I make up 78% of the atmosphere.', th: 'ฉันคิดเป็น 78% ของบรรยากาศ' },
    ],
  },
  O: {
    fact: { en: 'There was almost no oxygen in Earth’s air until bacteria started making it. To them it was toxic waste.',
            th: 'อากาศของโลกแทบไม่มีออกซิเจนเลย จนกระทั่งแบคทีเรียเริ่มผลิตมันขึ้นมา สำหรับพวกมัน ออกซิเจนคือของเสียที่เป็นพิษ' },
    clues: [
      { en: 'I was poisonous waste made by bacteria before anything breathed me.', th: 'ฉันเคยเป็นของเสียมีพิษที่แบคทีเรียสร้าง ก่อนที่จะมีสิ่งใดหายใจเอาฉันเข้าไป' },
      { en: 'Fire cannot happen without me.', th: 'ไฟเกิดขึ้นไม่ได้ถ้าไม่มีฉัน' },
      { en: 'You are breathing me in right now.', th: 'ตอนนี้คุณกำลังหายใจเอาฉันเข้าไป' },
    ],
  },
  F: {
    fact: { en: 'Fluorine is the most reactive element there is. It will burn water, glass and even some things people call fireproof.',
            th: 'ฟลูออรีนเป็นธาตุที่ว่องไวต่อปฏิกิริยาที่สุด มันเผาไหม้ได้ทั้งน้ำ แก้ว และแม้แต่บางอย่างที่คนเรียกว่าทนไฟ' },
    clues: [
      { en: 'I am the most reactive element on the whole table.', th: 'ฉันว่องไวต่อปฏิกิริยาที่สุดในตารางทั้งหมด' },
      { en: 'I can set fire to things that are supposed to be fireproof.', th: 'ฉันจุดไฟสิ่งที่ควรจะทนไฟได้' },
      { en: 'I am in your toothpaste.', th: 'ฉันอยู่ในยาสีฟันของคุณ' },
    ],
  },
  Ne: {
    fact: { en: 'Neon glows orange-red when electricity runs through it. Every other colour in a "neon" sign is a different gas.',
            th: 'นีออนเรืองแสงสีส้มแดงเมื่อกระแสไฟฟ้าผ่าน สีอื่นทั้งหมดในป้าย "นีออน" คือแก๊สชนิดอื่น' },
    clues: [
      { en: 'I glow one colour and one colour only: orange-red.', th: 'ฉันเรืองแสงได้สีเดียวเท่านั้น คือสีส้มแดง' },
      { en: 'Signs are named after me even when I am not in them.', th: 'ป้ายไฟตั้งชื่อตามฉัน แม้ในป้ายนั้นจะไม่มีฉันอยู่' },
      { en: 'My name is on every bright sign in Bangkok.', th: 'ชื่อของฉันอยู่บนป้ายไฟสว่างทุกป้ายในกรุงเทพฯ' },
    ],
  },
  Na: {
    fact: { en: 'Sodium is a soft metal you can cut with a knife, and it catches fire in water. Half of table salt is made of it.',
            th: 'โซเดียมเป็นโลหะอ่อนที่ใช้มีดตัดได้ และติดไฟเมื่อโดนน้ำ เกลือแกงครึ่งหนึ่งทำมาจากมัน' },
    clues: [
      { en: 'I am a metal soft enough to cut with a butter knife.', th: 'ฉันเป็นโลหะที่อ่อนพอจะใช้มีดทาเนยตัดได้' },
      { en: 'Drop me in water and I catch fire.', th: 'โยนฉันลงน้ำแล้วฉันจะติดไฟ' },
      { en: 'I am half of the salt on your table.', th: 'ฉันคือครึ่งหนึ่งของเกลือบนโต๊ะอาหาร' },
    ],
  },
  Mg: {
    fact: { en: 'Burning magnesium is so bright it can damage your eyes. Old camera flashes worked by setting it on fire.',
            th: 'แมกนีเซียมที่กำลังลุกไหม้สว่างมากจนทำร้ายดวงตาได้ แฟลชกล้องรุ่นเก่าทำงานด้วยการจุดไฟมัน' },
    clues: [
      { en: 'When I burn I am too bright to look at safely.', th: 'เวลาฉันลุกไหม้ ฉันสว่างเกินกว่าจะมองได้อย่างปลอดภัย' },
      { en: 'Old cameras used me as a flash.', th: 'กล้องรุ่นเก่าใช้ฉันเป็นแฟลช' },
      { en: 'I sit right under sodium, and plants need me to be green.', th: 'ฉันอยู่ใต้โซเดียมพอดี และพืชต้องการฉันเพื่อให้มีสีเขียว' },
    ],
  },
  Al: {
    fact: { en: 'Aluminium was once more valuable than gold. Napoleon III kept aluminium cutlery for his most important guests and gave everyone else silver.',
            th: 'อะลูมิเนียมเคยมีค่ามากกว่าทองคำ จักรพรรดินโปเลียนที่ 3 เก็บช้อนส้อมอะลูมิเนียมไว้ให้แขกคนสำคัญที่สุด ส่วนคนอื่นได้ของเงิน' },
    clues: [
      { en: 'I was once worth more than gold.', th: 'ฉันเคยมีค่ามากกว่าทองคำ' },
      { en: 'An emperor served his best guests with cutlery made of me.', th: 'จักรพรรดิใช้ช้อนส้อมที่ทำจากฉันเสิร์ฟแขกคนสำคัญที่สุด' },
      { en: 'Today you wrap food in me and throw me away.', th: 'ทุกวันนี้คุณใช้ฉันห่ออาหารแล้วก็ทิ้ง' },
    ],
  },
  Si: {
    fact: { en: 'Sand, glass and computer chips are all mostly silicon. It is the second most common element in the Earth’s crust.',
            th: 'ทราย แก้ว และชิปคอมพิวเตอร์ ล้วนเป็นซิลิคอนเป็นส่วนใหญ่ มันเป็นธาตุที่พบมากเป็นอันดับสองในเปลือกโลก' },
    clues: [
      { en: 'A famous valley in California is named after me.', th: 'หุบเขาชื่อดังในแคลิฟอร์เนียตั้งชื่อตามฉัน' },
      { en: 'Sand and glass are both mostly me.', th: 'ทรายและแก้วต่างก็เป็นฉันเป็นส่วนใหญ่' },
      { en: 'Every computer chip is made of me.', th: 'ชิปคอมพิวเตอร์ทุกตัวทำจากฉัน' },
    ],
  },
  P: {
    fact: { en: 'Phosphorus was discovered by boiling down urine looking for gold. It glowed in the dark instead.',
            th: 'ฟอสฟอรัสถูกค้นพบโดยการต้มปัสสาวะเพื่อหาทองคำ แต่กลับได้สิ่งที่เรืองแสงในความมืดแทน' },
    clues: [
      { en: 'I was discovered by someone boiling urine, hoping for gold.', th: 'ฉันถูกค้นพบโดยคนที่ต้มปัสสาวะเพราะหวังจะได้ทองคำ' },
      { en: 'One form of me glows faintly in the dark.', th: 'ฉันรูปหนึ่งเรืองแสงจาง ๆ ในความมืด' },
      { en: 'I am on the striking strip of a matchbox.', th: 'ฉันอยู่บนแถบขูดของกล่องไม้ขีด' },
    ],
  },
  S: {
    fact: { en: 'Sulfur itself has almost no smell. The rotten-egg stink people blame it for comes from hydrogen sulfide, one of its compounds.',
            th: 'กำมะถันแท้ ๆ แทบไม่มีกลิ่น กลิ่นไข่เน่าที่คนโทษว่าเป็นมันมาจากไฮโดรเจนซัลไฟด์ ซึ่งเป็นสารประกอบของมัน' },
    clues: [
      { en: 'People blame me for a smell that is really my compound, not me.', th: 'คนโทษฉันเรื่องกลิ่น ทั้งที่จริงเป็นสารประกอบของฉัน ไม่ใช่ฉัน' },
      { en: 'I am the yellow crust around a volcano.', th: 'ฉันคือคราบสีเหลืองรอบ ๆ ภูเขาไฟ' },
      { en: 'Rotten eggs are said to smell of me.', th: 'คนบอกว่าไข่เน่ามีกลิ่นของฉัน' },
    ],
  },
  Cl: {
    fact: { en: 'Chlorine is a poisonous green gas, yet joined to sodium it becomes the salt you eat every day.',
            th: 'คลอรีนเป็นแก๊สสีเขียวที่เป็นพิษ แต่เมื่อรวมกับโซเดียมกลับกลายเป็นเกลือที่คุณกินทุกวัน' },
    clues: [
      { en: 'On my own I am a poisonous green gas.', th: 'ตัวฉันเองเป็นแก๊สสีเขียวที่เป็นพิษ' },
      { en: 'Joined to a metal, I become something you eat every day.', th: 'พอรวมกับโลหะ ฉันกลายเป็นของที่คุณกินทุกวัน' },
      { en: 'I am what makes swimming pools smell like swimming pools.', th: 'ฉันคือสิ่งที่ทำให้สระว่ายน้ำมีกลิ่นแบบสระว่ายน้ำ' },
    ],
  },
  K: {
    fact: { en: 'Every banana is slightly radioactive, because a small fraction of the potassium in it is potassium-40.',
            th: 'กล้วยทุกลูกมีกัมมันตรังสีเล็กน้อย เพราะโพแทสเซียมส่วนหนึ่งในนั้นคือโพแทสเซียม-40' },
    clues: [
      { en: 'I make bananas very slightly radioactive.', th: 'ฉันทำให้กล้วยมีกัมมันตรังสีเล็กน้อยมาก' },
      { en: 'My symbol does not match my English name at all.', th: 'สัญลักษณ์ของฉันไม่ตรงกับชื่อภาษาอังกฤษเลย' },
      { en: 'My symbol is K, from the Latin kalium.', th: 'สัญลักษณ์ของฉันคือ K มาจากภาษาละติน kalium' },
    ],
  },
  Ca: {
    fact: { en: 'Almost all the calcium in your body is locked in your bones and teeth — about a kilogram of it.',
            th: 'แคลเซียมเกือบทั้งหมดในร่างกายคุณถูกเก็บไว้ในกระดูกและฟัน ประมาณหนึ่งกิโลกรัม' },
    clues: [
      { en: 'You are carrying about a kilogram of me right now.', th: 'ตอนนี้คุณพกฉันอยู่ประมาณหนึ่งกิโลกรัม' },
      { en: 'Chalk, marble and seashells are all built from me.', th: 'ชอล์ก หินอ่อน และเปลือกหอย ล้วนสร้างจากฉัน' },
      { en: 'Milk is supposed to give you me, for your bones.', th: 'นมควรให้ฉันแก่คุณ เพื่อกระดูก' },
    ],
  },
  Ti: {
    fact: { en: 'Titanium is as strong as steel but far lighter, and seawater does not corrode it. It is used for aircraft and for bone implants.',
            th: 'ไทเทเนียมแข็งแรงเท่าเหล็กกล้าแต่เบากว่ามาก และน้ำทะเลกัดกร่อนมันไม่ได้ จึงใช้ทำเครื่องบินและรากฟันเทียม' },
    clues: [
      { en: 'Surgeons put me inside people because the body does not reject me.', th: 'ศัลยแพทย์ใส่ฉันเข้าไปในร่างกายเพราะร่างกายไม่ต่อต้านฉัน' },
      { en: 'I am as strong as steel and much lighter.', th: 'ฉันแข็งแรงเท่าเหล็กกล้าและเบากว่ามาก' },
      { en: 'Aeroplanes and expensive spectacle frames are made of me.', th: 'เครื่องบินและกรอบแว่นราคาแพงทำจากฉัน' },
    ],
  },
  Fe: {
    fact: { en: 'The iron in your blood was made inside a dying star. Every atom of it is older than the Sun.',
            th: 'เหล็กในเลือดของคุณถูกสร้างขึ้นในดาวฤกษ์ที่กำลังจะดับ ทุกอะตอมของมันเก่าแก่กว่าดวงอาทิตย์' },
    clues: [
      { en: 'The core of this planet is mostly me.', th: 'แก่นของดาวเคราะห์ดวงนี้เป็นฉันเป็นส่วนใหญ่' },
      { en: 'I am why blood is red.', th: 'ฉันคือเหตุผลที่เลือดมีสีแดง' },
      { en: 'I rust, and my symbol is Fe.', th: 'ฉันเป็นสนิม และสัญลักษณ์ของฉันคือ Fe' },
    ],
  },
  Cu: {
    fact: { en: 'Copper kills bacteria on contact. Hospitals fit copper door handles for exactly that reason.',
            th: 'ทองแดงฆ่าแบคทีเรียเมื่อสัมผัส โรงพยาบาลติดตั้งมือจับประตูทองแดงด้วยเหตุผลนี้พอดี' },
    clues: [
      { en: 'Bacteria die when they land on me.', th: 'แบคทีเรียตายเมื่อมาเกาะบนตัวฉัน' },
      { en: 'I start out shiny and turn green over the years.', th: 'ตอนแรกฉันเป็นมันวาว แล้วเปลี่ยนเป็นสีเขียวเมื่อเวลาผ่านไป' },
      { en: 'Electrical wires are made of me.', th: 'สายไฟทำจากฉัน' },
    ],
  },
  Zn: {
    fact: { en: 'Zinc is what "galvanised" means: a thin zinc coat that corrodes instead of the steel underneath it.',
            th: 'สังกะสีคือความหมายของคำว่า "ชุบกัลวาไนซ์" คือเคลือบสังกะสีบาง ๆ ให้ผุกร่อนแทนเหล็กที่อยู่ข้างใต้' },
    clues: [
      { en: 'I am a metal that sacrifices myself to protect another one.', th: 'ฉันเป็นโลหะที่ยอมสละตัวเองเพื่อปกป้องโลหะอีกชนิด' },
      { en: 'Roofs in Thailand are often coated with me.', th: 'หลังคาในประเทศไทยมักเคลือบด้วยฉัน' },
      { en: 'Galvanised steel is steel covered in me.', th: 'เหล็กชุบกัลวาไนซ์คือเหล็กที่เคลือบด้วยฉัน' },
    ],
  },
  Br: {
    fact: { en: 'Bromine is one of only two elements that are liquid at room temperature, and the only non-metal among them.',
            th: 'โบรมีนเป็นหนึ่งในสองธาตุเท่านั้นที่เป็นของเหลวที่อุณหภูมิห้อง และเป็นอโลหะเพียงชนิดเดียวในสองชนิดนั้น' },
    clues: [
      { en: 'I am a liquid at room temperature, and I am not a metal.', th: 'ฉันเป็นของเหลวที่อุณหภูมิห้อง และฉันไม่ใช่โลหะ' },
      { en: 'I am a dark red-brown liquid that gives off choking fumes.', th: 'ฉันเป็นของเหลวสีน้ำตาลแดงเข้มที่ให้ไอระเหยที่สำลัก' },
      { en: 'My name comes from the Greek for "stench".', th: 'ชื่อของฉันมาจากภาษากรีกที่แปลว่า "เหม็น"' },
    ],
  },
  I: {
    fact: { en: 'Iodine turns straight from solid to purple vapour without melting. Thai table salt has it added to prevent thyroid disease.',
            th: 'ไอโอดีนเปลี่ยนจากของแข็งเป็นไอสีม่วงโดยไม่ผ่านการหลอมเหลว เกลือแกงไทยเติมไอโอดีนเพื่อป้องกันโรคไทรอยด์' },
    clues: [
      { en: 'I skip being a liquid — I go straight from solid to purple vapour.', th: 'ฉันข้ามสถานะของเหลว เปลี่ยนจากของแข็งเป็นไอสีม่วงเลย' },
      { en: 'I am added to Thai table salt by law, for people’s health.', th: 'กฎหมายกำหนดให้เติมฉันในเกลือแกงไทย เพื่อสุขภาพของคนไทย' },
      { en: 'The brown liquid a nurse paints on a cut is me.', th: 'ของเหลวสีน้ำตาลที่พยาบาลทาแผลคือฉัน' },
    ],
  },
  Cs: {
    fact: { en: 'The second is defined by caesium: one second is 9,192,631,770 vibrations of a caesium atom. Every clock in the world agrees with it.',
            th: 'หนึ่งวินาทีนิยามด้วยซีเซียม คือการสั่น 9,192,631,770 ครั้งของอะตอมซีเซียม นาฬิกาทุกเรือนในโลกอ้างอิงตามนี้' },
    clues: [
      { en: 'Time itself is measured against me.', th: 'เวลาถูกวัดโดยอ้างอิงจากฉัน' },
      { en: 'I explode violently in water, worse than sodium.', th: 'ฉันระเบิดรุนแรงในน้ำ แรงกว่าโซเดียม' },
      { en: 'Atomic clocks are built around me.', th: 'นาฬิกาอะตอมสร้างขึ้นรอบตัวฉัน' },
    ],
  },
  W: {
    fact: { en: 'Tungsten has the highest melting point of any metal — 3,422 °C. Old light bulbs used it because nothing else survived being that hot.',
            th: 'ทังสเตนมีจุดหลอมเหลวสูงที่สุดในบรรดาโลหะ คือ 3,422 องศาเซลเซียส หลอดไฟรุ่นเก่าใช้มันเพราะไม่มีอะไรอื่นทนความร้อนขนาดนั้นได้' },
    clues: [
      { en: 'Nothing metal survives heat better than I do.', th: 'ไม่มีโลหะใดทนความร้อนได้ดีกว่าฉัน' },
      { en: 'My melting point is over 3,400 °C.', th: 'จุดหลอมเหลวของฉันสูงกว่า 3,400 องศาเซลเซียส' },
      { en: 'I was the glowing wire in old light bulbs.', th: 'ฉันคือไส้ที่เรืองแสงในหลอดไฟรุ่นเก่า' },
    ],
  },
  Pt: {
    fact: { en: 'Platinum is rare enough that all of it ever mined would fit in an average living room.',
            th: 'แพลทินัมหายากมากจนถ้าเอาที่ขุดได้ทั้งหมดในประวัติศาสตร์มารวมกัน ก็ใส่ในห้องนั่งเล่นขนาดปกติได้' },
    clues: [
      { en: 'Every gram ever mined would fit inside one room.', th: 'ทุกกรัมที่เคยขุดได้ใส่รวมในห้องเดียวได้' },
      { en: 'I sit in car exhausts, cleaning the fumes.', th: 'ฉันอยู่ในท่อไอเสียรถยนต์ คอยทำความสะอาดไอเสีย' },
      { en: 'I am a silvery precious metal worth more than gold by weight.', th: 'ฉันเป็นโลหะมีค่าสีเงินที่มีราคาต่อน้ำหนักสูงกว่าทองคำ' },
    ],
  },
  Au: {
    fact: { en: 'Gold is so unreactive it survives thousands of years buried. Nearly all the gold ever mined is still somewhere in circulation.',
            th: 'ทองคำไม่ทำปฏิกิริยาจนอยู่ใต้ดินได้หลายพันปีโดยไม่เสียหาย ทองคำเกือบทั้งหมดที่เคยขุดได้ยังคงหมุนเวียนอยู่ที่ไหนสักแห่ง' },
    clues: [
      { en: 'I do not tarnish, rust or react. I just wait.', th: 'ฉันไม่หมอง ไม่เป็นสนิม ไม่ทำปฏิกิริยา ฉันแค่รอ' },
      { en: 'Almost every gram of me ever dug up still exists.', th: 'เกือบทุกกรัมของฉันที่เคยถูกขุดขึ้นมายังคงอยู่' },
      { en: 'My symbol is Au, and temples are covered in me.', th: 'สัญลักษณ์ของฉันคือ Au และวัดวาอารามปิดด้วยฉัน' },
    ],
  },
  Hg: {
    fact: { en: 'Mercury is the only metal that is liquid at room temperature. It used to go inside thermometers until people realised how poisonous it is.',
            th: 'ปรอทเป็นโลหะชนิดเดียวที่เป็นของเหลวที่อุณหภูมิห้อง เคยถูกใส่ในเทอร์โมมิเตอร์จนกระทั่งคนรู้ว่ามันเป็นพิษแค่ไหน' },
    clues: [
      { en: 'I am a metal, but I am liquid at room temperature.', th: 'ฉันเป็นโลหะ แต่ฉันเป็นของเหลวที่อุณหภูมิห้อง' },
      { en: 'I used to sit inside thermometers.', th: 'ฉันเคยอยู่ในเทอร์โมมิเตอร์' },
      { en: 'I am named after a planet, and my symbol is Hg.', th: 'ฉันตั้งชื่อตามดาวเคราะห์ และสัญลักษณ์ของฉันคือ Hg' },
    ],
  },
  Pb: {
    fact: { en: 'The Romans sweetened wine with lead and plumbed their cities with it. The word "plumbing" comes from its Latin name, plumbum.',
            th: 'ชาวโรมันใช้ตะกั่วทำให้ไวน์หวานและใช้เดินท่อประปาทั้งเมือง คำว่า plumbing มาจากชื่อละตินของมันคือ plumbum' },
    clues: [
      { en: 'The English word for pipework comes from my Latin name.', th: 'คำภาษาอังกฤษที่แปลว่างานท่อมาจากชื่อละตินของฉัน' },
      { en: 'The Romans used me for pipes and, unwisely, in their wine.', th: 'ชาวโรมันใช้ฉันทำท่อ และใส่ในไวน์อย่างไม่ฉลาด' },
      { en: 'I am a soft, heavy, poisonous metal with symbol Pb.', th: 'ฉันเป็นโลหะอ่อน หนัก มีพิษ สัญลักษณ์ Pb' },
    ],
  },
  Bi: {
    fact: { en: 'Bismuth grows into square rainbow-coloured crystals, and it is the heaviest element that is not meaningfully radioactive.',
            th: 'บิสมัทเติบโตเป็นผลึกทรงเหลี่ยมสีรุ้ง และเป็นธาตุที่หนักที่สุดที่ไม่มีกัมมันตรังสีอย่างมีนัยสำคัญ' },
    clues: [
      { en: 'I grow into square, rainbow-coloured crystals.', th: 'ฉันเติบโตเป็นผลึกทรงเหลี่ยมสีรุ้ง' },
      { en: 'I am the heaviest element you could safely hold.', th: 'ฉันเป็นธาตุที่หนักที่สุดที่คุณถือได้อย่างปลอดภัย' },
      { en: 'I am in the pink medicine people take for upset stomachs.', th: 'ฉันอยู่ในยาสีชมพูที่คนกินแก้ปวดท้อง' },
    ],
  },
  U: {
    fact: { en: 'Uranium is naturally radioactive and was used to colour glass a glowing yellow-green long before anyone knew what radioactivity was.',
            th: 'ยูเรเนียมมีกัมมันตรังสีตามธรรมชาติ และเคยถูกใช้แต่งสีแก้วให้เป็นสีเหลืองอมเขียวเรืองแสง นานก่อนที่ใครจะรู้ว่ากัมมันตรังสีคืออะไร' },
    clues: [
      { en: 'People made drinking glasses out of me before they knew I was dangerous.', th: 'คนทำแก้วน้ำจากฉันก่อนที่จะรู้ว่าฉันอันตราย' },
      { en: 'I glow yellow-green under ultraviolet light.', th: 'ฉันเรืองแสงสีเหลืองอมเขียวใต้แสงอัลตราไวโอเลต' },
      { en: 'Nuclear power stations run on me.', th: 'โรงไฟฟ้านิวเคลียร์ทำงานด้วยฉัน' },
    ],
  },
  Ag: {
    fact: { en: 'Silver conducts electricity better than any other element — better even than copper. It is only too expensive to wire a house with.',
            th: 'เงินนำไฟฟ้าได้ดีกว่าธาตุอื่นใด ดีกว่าทองแดงเสียอีก เพียงแต่แพงเกินกว่าจะเอามาเดินสายไฟทั้งบ้าน' },
    clues: [
      { en: 'I conduct electricity better than anything else on the table.', th: 'ฉันนำไฟฟ้าได้ดีกว่าทุกอย่างในตาราง' },
      { en: 'I am too expensive to use for house wiring, so copper gets the job.', th: 'ฉันแพงเกินกว่าจะใช้เดินสายไฟในบ้าน ทองแดงจึงได้งานนี้ไป' },
      { en: 'I am a precious metal that tarnishes black, symbol Ag.', th: 'ฉันเป็นโลหะมีค่าที่หมองเป็นสีดำ สัญลักษณ์ Ag' },
    ],
  },
  Sn: {
    fact: { en: 'Thailand was one of the world’s great tin producers, and Phuket grew rich on tin mining long before tourism arrived.',
            th: 'ประเทศไทยเคยเป็นผู้ผลิตดีบุกรายใหญ่ของโลก และภูเก็ตร่ำรวยจากเหมืองดีบุกมานานก่อนที่การท่องเที่ยวจะมาถึง' },
    clues: [
      { en: 'Phuket was built on mining me, long before tourists came.', th: 'ภูเก็ตสร้างขึ้นจากการทำเหมืองฉัน นานก่อนที่นักท่องเที่ยวจะมา' },
      { en: 'Mix me with copper and you get bronze.', th: 'ผสมฉันกับทองแดงแล้วจะได้บรอนซ์' },
      { en: '"Tin" cans are actually steel with a thin layer of me.', th: 'กระป๋อง "ดีบุก" จริง ๆ คือเหล็กเคลือบฉันบาง ๆ' },
    ],
  },
  Ar: {
    fact: { en: 'Argon fills the gap in double-glazed windows and sits inside light bulbs, because it refuses to react with anything.',
            th: 'อาร์กอนถูกอัดในช่องว่างของกระจกสองชั้นและอยู่ในหลอดไฟ เพราะมันไม่ยอมทำปฏิกิริยากับอะไรเลย' },
    clues: [
      { en: 'I am used precisely because I do nothing at all.', th: 'ฉันถูกใช้เพราะฉันไม่ทำอะไรเลยนี่แหละ' },
      { en: 'I fill the gap inside double-glazed windows.', th: 'ฉันอยู่ในช่องว่างของกระจกสองชั้น' },
      { en: 'I am the third most common gas in the air, after nitrogen and oxygen.', th: 'ฉันเป็นแก๊สที่พบมากเป็นอันดับสามในอากาศ รองจากไนโตรเจนและออกซิเจน' },
    ],
  },
  Cr: {
    fact: { en: 'Chromium is what makes stainless steel stainless, and what makes rubies red and emeralds green.',
            th: 'โครเมียมคือสิ่งที่ทำให้สเตนเลสไม่เป็นสนิม และทำให้ทับทิมเป็นสีแดงกับมรกตเป็นสีเขียว' },
    clues: [
      { en: 'I make one gem red and another green, depending on what I sit in.', th: 'ฉันทำให้อัญมณีหนึ่งเป็นสีแดง อีกอย่างเป็นสีเขียว ขึ้นกับว่าฉันอยู่ในอะไร' },
      { en: 'Stainless steel is stainless because of me.', th: 'สเตนเลสไม่เป็นสนิมเพราะฉัน' },
      { en: 'Shiny car bumpers are plated with me.', th: 'กันชนรถที่เงาวับชุบด้วยฉัน' },
    ],
  },
  Ra: {
    fact: { en: 'Radium was painted onto watch dials so they would glow. The women who painted them were told to lick their brushes to a point.',
            th: 'เรเดียมถูกทาบนหน้าปัดนาฬิกาเพื่อให้เรืองแสง ผู้หญิงที่ทาถูกบอกให้เลียพู่กันเพื่อทำให้ปลายแหลม' },
    clues: [
      { en: 'I was painted on watch faces to make them glow in the dark.', th: 'ฉันถูกทาบนหน้าปัดนาฬิกาให้เรืองแสงในความมืด' },
      { en: 'Marie Curie discovered me, and I eventually killed her.', th: 'มารี กูรี ค้นพบฉัน และในที่สุดฉันก็คร่าชีวิตเธอ' },
      { en: 'I am a highly radioactive metal, symbol Ra.', th: 'ฉันเป็นโลหะกัมมันตรังสีสูง สัญลักษณ์ Ra' },
    ],
  },
  Kr: {
    fact: { en: 'Krypton is a real element in the air around you, discovered in 1898 — thirty years before the comic book planet was invented.',
            th: 'คริปทอนเป็นธาตุจริงในอากาศรอบตัวคุณ ค้นพบเมื่อ ค.ศ. 1898 สามสิบปีก่อนที่ดาวเคราะห์ในหนังสือการ์ตูนจะถูกคิดขึ้น' },
    clues: [
      { en: 'A comic book stole my name for a planet.', th: 'หนังสือการ์ตูนขโมยชื่อฉันไปตั้งเป็นชื่อดาวเคราะห์' },
      { en: 'I am a noble gas, and there is a little of me in every breath.', th: 'ฉันเป็นแก๊สเฉื่อย และมีฉันเล็กน้อยในทุกลมหายใจ' },
      { en: 'Superman is supposedly weakened by a green rock named after me.', th: 'ว่ากันว่าซูเปอร์แมนอ่อนแรงเพราะหินสีเขียวที่ตั้งชื่อตามฉัน' },
    ],
  },
  Ga: {
    fact: { en: 'Gallium melts at 29.8 °C, which means a lump of it will melt in your hand on a hot Bangkok afternoon.',
            th: 'แกลเลียมหลอมเหลวที่ 29.8 องศาเซลเซียส แปลว่าก้อนของมันจะละลายในมือคุณได้ในบ่ายที่ร้อนของกรุงเทพฯ' },
    clues: [
      { en: 'I melt in your hand.', th: 'ฉันละลายในมือคุณ' },
      { en: 'My melting point is below body temperature but above room temperature.', th: 'จุดหลอมเหลวของฉันต่ำกว่าอุณหภูมิร่างกาย แต่สูงกว่าอุณหภูมิห้อง' },
      { en: 'I am a soft silvery metal used in blue LEDs.', th: 'ฉันเป็นโลหะอ่อนสีเงินที่ใช้ใน LED สีน้ำเงิน' },
    ],
  },
  As: {
    fact: { en: 'Arsenic was the poison of choice for centuries because it has no taste and no smell, and its symptoms look like ordinary illness.',
            th: 'สารหนูเป็นยาพิษยอดนิยมมานานหลายศตวรรษ เพราะไม่มีรสและไม่มีกลิ่น และอาการของมันเหมือนการเจ็บป่วยทั่วไป' },
    clues: [
      { en: 'I was called "inheritance powder" because of what people used me for.', th: 'ฉันถูกเรียกว่า "ผงมรดก" เพราะสิ่งที่คนใช้ฉันทำ' },
      { en: 'I have no taste and no smell, which is what made me so dangerous.', th: 'ฉันไม่มีรสและไม่มีกลิ่น ซึ่งเป็นสิ่งที่ทำให้ฉันอันตรายมาก' },
      { en: 'I am a famous poison, symbol As.', th: 'ฉันเป็นยาพิษที่มีชื่อเสียง สัญลักษณ์ As' },
    ],
  },
  Ne_placeholder: null,
};
delete LORE.Ne_placeholder;

/** Elements that have written clues — the pool Guess the Element draws from. */
const GUESSABLE = ELEMENTS.filter((e) => LORE[e.sym] && LORE[e.sym].clues.length >= 3);

/** Elements that have a written fact — used for collection cards. */
const WITH_FACT = ELEMENTS.filter((e) => LORE[e.sym] && LORE[e.sym].fact);

/**
 * A card for the collection screen. Elements without written lore still get a
 * card, built from what we know for certain: where they sit and what they are.
 * A short true sentence beats an invented "fun" one.
 */
function card(z, lang) {
  const e = BY_Z.get(z);
  if (!e) return null;
  const l = lang === 'th' ? 'th' : 'en';
  const lore = LORE[e.sym];
  const CAT = {
    en: { alkali: 'an alkali metal', alkaline: 'an alkaline earth metal', transition: 'a transition metal',
          post: 'a post-transition metal', metalloid: 'a metalloid', nonmetal: 'a non-metal',
          halogen: 'a halogen', noble: 'a noble gas', lanthanide: 'a lanthanide', actinide: 'an actinide' },
    th: { alkali: 'โลหะแอลคาไล', alkaline: 'โลหะแอลคาไลน์เอิร์ท', transition: 'โลหะแทรนซิชัน',
          post: 'โลหะหลังแทรนซิชัน', metalloid: 'กึ่งโลหะ', nonmetal: 'อโลหะ',
          halogen: 'ธาตุหมู่แฮโลเจน', noble: 'แก๊สเฉื่อย', lanthanide: 'แลนทาไนด์', actinide: 'แอกทิไนด์' },
  };
  const fallback = l === 'th'
    ? `${e.th} เป็น${CAT.th[e.cat]} เลขอะตอม ${e.z}`
    : `${e.en} is ${CAT.en[e.cat]}, atomic number ${e.z}.`;
  return {
    z: e.z, sym: e.sym, name: l === 'th' ? e.th : e.en, cat: e.cat, rarity: e.rarity,
    row: e.row, col: e.col,
    fact: lore && lore.fact ? lore.fact[l] : fallback,
  };
}

/** The whole table, for rendering. Never includes facts — those come with `card`. */
function table() {
  return ELEMENTS.map((e) => ({ z: e.z, sym: e.sym, en: e.en, th: e.th, cat: e.cat, rarity: e.rarity, row: e.row, col: e.col }));
}

module.exports = {
  ELEMENTS, LORE, GUESSABLE, WITH_FACT, BY_SYMBOL, BY_Z,
  COUNT: ELEMENTS.length,
  card, table,
};
