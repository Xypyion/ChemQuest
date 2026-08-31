/**
 * The True or Weird bank.
 *
 * Half of these are true. Half are inventions, written to sound exactly as
 * plausible as the true ones — that is the whole game. A false statement that
 * is obviously silly teaches nothing and is not funny twice.
 *
 * EVERY ENTRY CARRIES `why`, AND IT IS SHOWN EITHER WAY.
 * A student who guesses wrong learns the real answer immediately, and a student
 * who guesses right finds out *why* they were right. Without that this is a
 * coin flip; with it, it is the only part of the Lab that teaches by surprise.
 *
 * NOT GENERATED. See the note at the top of src/elements.js — a hallucinated
 * "true" fact in a classroom is worse than having no game at all. Each line
 * here was written once and can be checked.
 */

/* true?, statement (en/th), why (en/th) */
const FACTS = [
  {
    ok: true,
    en: 'Helium was discovered in the Sun before anyone found it on Earth.',
    th: 'ฮีเลียมถูกค้นพบในดวงอาทิตย์ก่อนที่จะมีใครพบมันบนโลก',
    whyEn: 'True. Astronomers spotted an unknown line in sunlight in 1868. Nobody isolated helium on Earth for another 27 years.',
    whyTh: 'จริง นักดาราศาสตร์เห็นเส้นสเปกตรัมที่ไม่รู้จักในแสงอาทิตย์เมื่อ ค.ศ. 1868 และอีก 27 ปีจึงแยกฮีเลียมได้บนโลก',
  },
  {
    ok: true,
    en: 'A banana is slightly radioactive.',
    th: 'กล้วยมีกัมมันตรังสีเล็กน้อย',
    whyEn: 'True. Bananas are rich in potassium, and a small fraction of natural potassium is potassium-40, which is radioactive. The dose is harmless.',
    whyTh: 'จริง กล้วยมีโพแทสเซียมสูง และโพแทสเซียมธรรมชาติส่วนหนึ่งคือโพแทสเซียม-40 ซึ่งมีกัมมันตรังสี ปริมาณนี้ไม่เป็นอันตราย',
  },
  {
    ok: false,
    en: 'Glass is a liquid, which is why old church windows are thicker at the bottom.',
    th: 'แก้วเป็นของเหลว จึงเป็นเหตุผลที่กระจกโบสถ์เก่ามีส่วนล่างหนากว่า',
    whyEn: 'Weird. This one gets repeated everywhere, but it is false. Glass is an amorphous solid. Old windows are uneven because of how they were made, not because they flowed.',
    whyTh: 'มั่ว เรื่องนี้ถูกเล่าต่อกันไปทั่ว แต่ไม่จริง แก้วเป็นของแข็งอสัณฐาน กระจกเก่าหนาไม่เท่ากันเพราะวิธีการผลิต ไม่ใช่เพราะมันไหล',
  },
  {
    ok: true,
    en: 'Aluminium was once more expensive than gold.',
    th: 'อะลูมิเนียมเคยมีราคาแพงกว่าทองคำ',
    whyEn: 'True. Before a cheap smelting process existed it was extremely hard to extract. Napoleon III reserved aluminium cutlery for his most honoured guests.',
    whyTh: 'จริง ก่อนจะมีกระบวนการถลุงราคาถูก มันสกัดยากมาก จักรพรรดินโปเลียนที่ 3 สงวนช้อนส้อมอะลูมิเนียมไว้ให้แขกที่มีเกียรติที่สุด',
  },
  {
    ok: false,
    en: 'Diamonds are made from compressed coal.',
    th: 'เพชรเกิดจากถ่านหินที่ถูกอัดแน่น',
    whyEn: 'Weird. Both are carbon, but almost no natural diamond comes from coal. Diamonds form far deeper than coal ever gets, and most are older than land plants.',
    whyTh: 'มั่ว ทั้งคู่เป็นคาร์บอน แต่เพชรธรรมชาติแทบไม่มีที่มาจากถ่านหิน เพชรก่อตัวลึกกว่าที่ถ่านหินจะไปถึง และส่วนใหญ่เก่าแก่กว่าพืชบก',
  },
  {
    ok: true,
    en: 'There are only two elements that are liquid at room temperature.',
    th: 'มีเพียงสองธาตุเท่านั้นที่เป็นของเหลวที่อุณหภูมิห้อง',
    whyEn: 'True — mercury and bromine. A few others, such as gallium and caesium, melt only slightly above room temperature.',
    whyTh: 'จริง คือปรอทและโบรมีน ส่วนอีกไม่กี่ธาตุ เช่น แกลเลียมและซีเซียม หลอมเหลวที่อุณหภูมิสูงกว่าห้องเพียงเล็กน้อย',
  },
  {
    ok: true,
    en: 'The iron in your blood was made inside a dying star.',
    th: 'เหล็กในเลือดของคุณถูกสร้างขึ้นในดาวฤกษ์ที่กำลังจะดับ',
    whyEn: 'True. Elements heavier than helium were forged in stars. Every iron atom in you is older than the Sun.',
    whyTh: 'จริง ธาตุที่หนักกว่าฮีเลียมถูกสร้างในดาวฤกษ์ อะตอมเหล็กทุกอะตอมในตัวคุณเก่าแก่กว่าดวงอาทิตย์',
  },
  {
    ok: false,
    en: 'Water conducts electricity because water molecules carry charge.',
    th: 'น้ำนำไฟฟ้าได้เพราะโมเลกุลของน้ำมีประจุ',
    whyEn: 'Weird. Pure water is a very poor conductor. Tap water conducts because of the dissolved ions in it, not because of the water itself.',
    whyTh: 'มั่ว น้ำบริสุทธิ์นำไฟฟ้าได้แย่มาก น้ำประปานำไฟฟ้าเพราะไอออนที่ละลายอยู่ ไม่ใช่เพราะตัวน้ำเอง',
  },
  {
    ok: true,
    en: 'Chlorine is a poisonous green gas, but joined to sodium it becomes table salt.',
    th: 'คลอรีนเป็นแก๊สสีเขียวที่มีพิษ แต่เมื่อรวมกับโซเดียมกลับกลายเป็นเกลือแกง',
    whyEn: 'True, and it is one of the best demonstrations in chemistry: a violent metal plus a poisonous gas makes something you eat every day.',
    whyTh: 'จริง และเป็นตัวอย่างที่ดีที่สุดอย่างหนึ่งในวิชาเคมี โลหะที่รุนแรงบวกแก๊สมีพิษ กลายเป็นของที่คุณกินทุกวัน',
  },
  {
    ok: false,
    en: 'Adding salt to water makes it boil faster.',
    th: 'การใส่เกลือลงในน้ำทำให้น้ำเดือดเร็วขึ้น',
    whyEn: 'Weird. Salt raises the boiling point, so salted water must get hotter before it boils. The effect is tiny in a kitchen either way.',
    whyTh: 'มั่ว เกลือทำให้จุดเดือดสูงขึ้น น้ำเกลือจึงต้องร้อนกว่าเดิมจึงจะเดือด แต่ผลในครัวน้อยมากอยู่ดี',
  },
  {
    ok: true,
    en: 'Tungsten does not melt until 3,422 °C — higher than any other metal.',
    th: 'ทังสเตนไม่หลอมเหลวจนกว่าจะถึง 3,422 องศาเซลเซียส สูงกว่าโลหะอื่นทั้งหมด',
    whyEn: 'True, and that is exactly why old light bulbs used a tungsten filament. Nothing else stayed solid while glowing white hot.',
    whyTh: 'จริง และนั่นคือเหตุผลที่หลอดไฟรุ่นเก่าใช้ไส้ทังสเตน ไม่มีอะไรอื่นคงสภาพของแข็งได้ขณะเรืองแสงร้อนขาว',
  },
  {
    ok: false,
    en: 'Oxygen is flammable, which is why it makes fires burn.',
    th: 'ออกซิเจนติดไฟได้ จึงทำให้ไฟลุกไหม้',
    whyEn: 'Weird. Oxygen does not burn — it is what other things burn *in*. It is an oxidiser, not a fuel. A subtle difference that matters a lot in a lab.',
    whyTh: 'มั่ว ออกซิเจนไม่ติดไฟ แต่เป็นสิ่งที่ของอื่นเผาไหม้ "ใน" มัน มันเป็นตัวออกซิไดซ์ ไม่ใช่เชื้อเพลิง ความต่างเล็กน้อยนี้สำคัญมากในห้องแล็บ',
  },
  {
    ok: true,
    en: 'The second is defined by counting vibrations of a caesium atom.',
    th: 'หนึ่งวินาทีนิยามด้วยการนับการสั่นของอะตอมซีเซียม',
    whyEn: 'True. One second is exactly 9,192,631,770 of them. Every clock in the world is ultimately checked against caesium.',
    whyTh: 'จริง หนึ่งวินาทีคือ 9,192,631,770 ครั้งพอดี นาฬิกาทุกเรือนในโลกท้ายที่สุดเทียบกับซีเซียม',
  },
  {
    ok: false,
    en: 'Lightning turns sand into diamonds.',
    th: 'ฟ้าผ่าเปลี่ยนทรายให้กลายเป็นเพชร',
    whyEn: 'Weird. Lightning does fuse sand — into hollow glass tubes called fulgurites. Sand is silicon dioxide; diamond is carbon. Different element entirely.',
    whyTh: 'มั่ว ฟ้าผ่าหลอมทรายจริง แต่ได้ท่อแก้วกลวงที่เรียกว่าฟุลกูไรต์ ทรายคือซิลิคอนไดออกไซด์ ส่วนเพชรคือคาร์บอน คนละธาตุกันเลย',
  },
  {
    ok: true,
    en: 'Copper door handles kill bacteria that land on them.',
    th: 'มือจับประตูทองแดงฆ่าแบคทีเรียที่มาเกาะ',
    whyEn: 'True. Copper surfaces are genuinely antimicrobial, and some hospitals fit copper handles for that reason.',
    whyTh: 'จริง พื้นผิวทองแดงต้านจุลชีพได้จริง และโรงพยาบาลบางแห่งติดตั้งมือจับทองแดงด้วยเหตุผลนี้',
  },
  {
    ok: false,
    en: 'Stainless steel does not rust because it contains no iron.',
    th: 'สเตนเลสไม่เป็นสนิมเพราะไม่มีเหล็กอยู่เลย',
    whyEn: 'Weird. Stainless steel is mostly iron. It resists rust because chromium in it forms a thin invisible oxide layer that seals the surface.',
    whyTh: 'มั่ว สเตนเลสเป็นเหล็กเป็นส่วนใหญ่ มันทนสนิมเพราะโครเมียมในนั้นสร้างชั้นออกไซด์บาง ๆ ที่มองไม่เห็นมาปิดผิว',
  },
  {
    ok: true,
    en: 'Phosphorus was discovered by boiling down urine in search of gold.',
    th: 'ฟอสฟอรัสถูกค้นพบจากการต้มปัสสาวะเพื่อค้นหาทองคำ',
    whyEn: 'True. Hennig Brand boiled roughly 5,500 litres of it in 1669. He did not find gold; he found something that glowed.',
    whyTh: 'จริง เฮนนิก บรันด์ ต้มปัสสาวะราว 5,500 ลิตรเมื่อ ค.ศ. 1669 เขาไม่พบทองคำ แต่พบสิ่งที่เรืองแสง',
  },
  {
    ok: false,
    en: 'Helium is the second most common element on Earth.',
    th: 'ฮีเลียมเป็นธาตุที่พบมากเป็นอันดับสองบนโลก',
    whyEn: 'Weird. It is the second most common in the universe, but on Earth it is scarce — it is so light it escapes the atmosphere completely.',
    whyTh: 'มั่ว มันพบมากเป็นอันดับสองในเอกภพ แต่บนโลกกลับหายาก เพราะเบามากจนหลุดออกจากบรรยากาศไปหมด',
  },
  {
    ok: true,
    en: 'Gallium will melt in your hand.',
    th: 'แกลเลียมละลายได้ในมือของคุณ',
    whyEn: 'True. Gallium melts at 29.8 °C, below body temperature. In Bangkok it will sometimes melt without your help.',
    whyTh: 'จริง แกลเลียมหลอมเหลวที่ 29.8 องศาเซลเซียส ต่ำกว่าอุณหภูมิร่างกาย ในกรุงเทพฯ บางทีมันละลายเองโดยไม่ต้องช่วย',
  },
  {
    ok: false,
    en: 'The pH scale stops at 0 and 14.',
    th: 'สเกล pH หยุดอยู่ที่ 0 และ 14',
    whyEn: 'Weird. Those are the usual range for dilute solutions in water, but pH can go below 0 and above 14 in concentrated acids and bases.',
    whyTh: 'มั่ว นั่นคือช่วงปกติของสารละลายเจือจางในน้ำ แต่ pH ต่ำกว่า 0 และสูงกว่า 14 ได้ในกรดและเบสเข้มข้น',
  },
  {
    ok: true,
    en: 'Bismuth grows into square, rainbow-coloured crystals.',
    th: 'บิสมัทเติบโตเป็นผลึกทรงเหลี่ยมสีรุ้ง',
    whyEn: 'True. The stair-stepped shape comes from how it crystallises; the colours are a thin oxide layer splitting the light.',
    whyTh: 'จริง รูปทรงขั้นบันไดมาจากวิธีการตกผลึก ส่วนสีมาจากชั้นออกไซด์บาง ๆ ที่แยกแสง',
  },
  {
    ok: false,
    en: 'Heavy water is called heavy because extra oxygen has been dissolved in it.',
    th: 'น้ำมวลหนักถูกเรียกว่าหนักเพราะมีออกซิเจนละลายอยู่มากกว่าปกติ',
    whyEn: 'Weird. Heavy water is heavy because its hydrogen is deuterium — hydrogen with an extra neutron. The oxygen is unchanged.',
    whyTh: 'มั่ว น้ำมวลหนักหนักเพราะไฮโดรเจนในนั้นคือดิวทีเรียม ซึ่งเป็นไฮโดรเจนที่มีนิวตรอนเพิ่มมา ส่วนออกซิเจนเหมือนเดิม',
  },
  {
    ok: true,
    en: 'Thailand was once one of the biggest tin producers in the world.',
    th: 'ประเทศไทยเคยเป็นผู้ผลิตดีบุกรายใหญ่ที่สุดแห่งหนึ่งของโลก',
    whyEn: 'True. Phuket and the southern provinces were built on tin mining, generations before tourism arrived.',
    whyTh: 'จริง ภูเก็ตและจังหวัดภาคใต้เติบโตขึ้นจากเหมืองดีบุก หลายชั่วอายุคนก่อนที่การท่องเที่ยวจะมาถึง',
  },
  {
    ok: false,
    en: 'Metals expand when heated because their atoms get bigger.',
    th: 'โลหะขยายตัวเมื่อได้รับความร้อนเพราะอะตอมของมันใหญ่ขึ้น',
    whyEn: 'Weird. The atoms stay the same size. They vibrate harder and sit further apart on average, so the whole piece grows.',
    whyTh: 'มั่ว อะตอมมีขนาดเท่าเดิม แต่สั่นแรงขึ้นและอยู่ห่างกันมากขึ้นโดยเฉลี่ย ชิ้นงานทั้งชิ้นจึงขยายตัว',
  },
  {
    ok: true,
    en: 'Fluorine will set fire to things that are supposed to be fireproof.',
    th: 'ฟลูออรีนจุดไฟสิ่งที่ควรจะทนไฟได้',
    whyEn: 'True. It is the most reactive element there is, and it will attack glass, water and asbestos.',
    whyTh: 'จริง มันเป็นธาตุที่ว่องไวต่อปฏิกิริยาที่สุด และสามารถทำปฏิกิริยากับแก้ว น้ำ และแร่ใยหินได้',
  },
  {
    ok: false,
    en: 'Rust makes iron lighter because material flakes away.',
    th: 'สนิมทำให้เหล็กเบาลงเพราะเนื้อวัสดุหลุดร่อนออกไป',
    whyEn: 'Weird. Rusting adds oxygen to the iron, so a rusted piece that keeps all its flakes actually weighs more than it started.',
    whyTh: 'มั่ว การเกิดสนิมคือการเติมออกซิเจนเข้าไปในเหล็ก ชิ้นเหล็กที่เป็นสนิมและเก็บสะเก็ดไว้ครบจะหนักกว่าตอนเริ่มต้น',
  },
  {
    ok: true,
    en: 'Silver conducts electricity better than copper does.',
    th: 'เงินนำไฟฟ้าได้ดีกว่าทองแดง',
    whyEn: 'True. Silver is the best conductor of any element. Copper is used for wiring only because it is far cheaper.',
    whyTh: 'จริง เงินนำไฟฟ้าได้ดีที่สุดในบรรดาธาตุทั้งหมด ที่ใช้ทองแดงเดินสายไฟก็เพราะมันถูกกว่ามาก',
  },
  {
    ok: false,
    en: 'Noble gases are called noble because they were once only used by royalty.',
    th: 'แก๊สเฉื่อยถูกเรียกว่า noble เพราะเคยใช้เฉพาะในหมู่ราชวงศ์',
    whyEn: 'Weird. "Noble" here means aloof — they refuse to react with other elements, the way noble metals like gold refuse to corrode.',
    whyTh: 'มั่ว คำว่า noble ในที่นี้หมายถึงการวางตัวห่าง คือไม่ยอมทำปฏิกิริยากับธาตุอื่น เหมือนโลหะมีตระกูลอย่างทองคำที่ไม่ยอมผุกร่อน',
  },
  {
    ok: true,
    en: 'Radium was painted onto watch dials, and the painters were told to lick their brushes.',
    th: 'เรเดียมถูกทาบนหน้าปัดนาฬิกา และคนทาถูกบอกให้เลียพู่กัน',
    whyEn: 'True, and it poisoned them. The "Radium Girls" case changed workplace safety law in several countries.',
    whyTh: 'จริง และมันทำให้พวกเธอได้รับพิษ คดี "Radium Girls" เปลี่ยนกฎหมายความปลอดภัยในที่ทำงานของหลายประเทศ',
  },
  {
    ok: false,
    en: 'A catalyst speeds up a reaction by being used up faster than the reactants.',
    th: 'ตัวเร่งปฏิกิริยาทำให้ปฏิกิริยาเร็วขึ้นโดยถูกใช้หมดเร็วกว่าสารตั้งต้น',
    whyEn: 'Weird. A catalyst is not consumed at all. It lowers the activation energy and comes out of the reaction unchanged.',
    whyTh: 'มั่ว ตัวเร่งปฏิกิริยาไม่ถูกใช้หมดเลย มันลดพลังงานก่อกัมมันต์และออกมาจากปฏิกิริยาโดยไม่เปลี่ยนแปลง',
  },
];

module.exports = { FACTS, COUNT: FACTS.length };
