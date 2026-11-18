// SPDX-License-Identifier: GPL-3.0-or-later
//
// Lithuanian number and abbreviation expansion, run before phonemization.
// JavaScript port of skaiciu_pletiklis.py from
// https://huggingface.co/RobertasTa/lt_LT-reginute1-medium (GPL-3.0), which
// documents the reasoning behind every rule; the comments here are shortened.
//
// Case codes: V nominative, G accusative, K genitive, I instrumental; the _f
// suffix marks feminine forms. In compound ordinals only the LAST part takes
// the ordinal ending.
//
// Python's \b and \w are Unicode-aware, JavaScript's are not (even with the u
// flag), so word boundaries are spelled out with \p{…} classes below.

const W = '[\\p{L}\\p{M}\\p{N}_]';
/** Exact equivalent of Python's Unicode \b. */
const B = `(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))`;
const re = (source, flags = 'gu') => new RegExp(source.replaceAll('\\b', B), flags);

/** re.sub with a callback that receives the match (m.index, m.input, m[1]…). */
function sub(text, pattern, fn) {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    out += text.slice(last, m.index) + (typeof fn === 'string' ? fn : fn(m));
    last = m.index + m[0].length;
  }
  return out + text.slice(last);
}

const after = (m) => m.input.slice(m.index + m[0].length);
const before = (m) => m.input.slice(0, m.index);
const lastWordBefore = (m) => (before(m).trimEnd().split(/\s+/).pop() ?? '').toLowerCase();
const isUpper = (c) => c !== c.toLowerCase() && c === c.toUpperCase();
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// --- cardinals --------------------------------------------------------------
const VNT = {
  1: { V: 'vienas', G: 'vieną', K: 'vieno', I: 'vienu', V_f: 'viena', G_f: 'vieną', K_f: 'vienos', I_f: 'viena' },
  2: { V: 'du', G: 'du', K: 'dviejų', I: 'dviem', V_f: 'dvi', G_f: 'dvi', K_f: 'dviejų', I_f: 'dviem' },
  3: { V: 'trys', G: 'tris', K: 'trijų', I: 'trimis', V_f: 'trys', G_f: 'tris', K_f: 'trijų', I_f: 'trimis' },
  4: { V: 'keturi', G: 'keturis', K: 'keturių', I: 'keturiais', V_f: 'keturios', G_f: 'keturias', K_f: 'keturių', I_f: 'keturiomis' },
  5: { V: 'penki', G: 'penkis', K: 'penkių', I: 'penkiais', V_f: 'penkios', G_f: 'penkias', K_f: 'penkių', I_f: 'penkiomis' },
  6: { V: 'šeši', G: 'šešis', K: 'šešių', I: 'šešiais', V_f: 'šešios', G_f: 'šešias', K_f: 'šešių', I_f: 'šešiomis' },
  7: { V: 'septyni', G: 'septynis', K: 'septynių', I: 'septyniais', V_f: 'septynios', G_f: 'septynias', K_f: 'septynių', I_f: 'septyniomis' },
  8: { V: 'aštuoni', G: 'aštuonis', K: 'aštuonių', I: 'aštuoniais', V_f: 'aštuonios', G_f: 'aštuonias', K_f: 'aštuonių', I_f: 'aštuoniomis' },
  9: { V: 'devyni', G: 'devynis', K: 'devynių', I: 'devyniais', V_f: 'devynios', G_f: 'devynias', K_f: 'devynių', I_f: 'devyniomis' },
};

// 11-19 inflect like feminine -a nouns (vienuolika / vienuolikos).
const PALIKT = {};
'vienuo dvy try keturio penkio šešio septynio aštuonio devynio'.split(' ')
  .forEach((stem, i) => { PALIKT[11 + i] = `${stem}lika`; });
const palikt = (n, forma) => (forma === 'K' ? `${PALIKT[n].slice(0, -1)}os` : PALIKT[n]);

const DESIMT = {
  10: 'dešimt', 20: 'dvidešimt', 30: 'trisdešimt', 40: 'keturiasdešimt', 50: 'penkiasdešimt',
  60: 'šešiasdešimt', 70: 'septyniasdešimt', 80: 'aštuoniasdešimt', 90: 'devyniasdešimt',
};
const DESIMT_K = Object.fromEntries(Object.entries(DESIMT).map(([k, v]) => [k, `${v}ies`]));

// "tūkstantis" is an i-stem with a t/č alternation: its singular is spelled out.
const TUKSTANTIS_VNS = { V: 'tūkstantis', G: 'tūkstantį', K: 'tūkstančio', I: 'tūkstančiu' };

/** The group word (hundred/thousand/million) for a count and a case. */
function grupe(vns, dgs, kilm, n, forma) {
  const vienas = n % 10 === 1 && n % 100 !== 11; // 1, 21, 31 … take the singular
  if (vienas && vns === 'tūkstantis') return TUKSTANTIS_VNS[forma] ?? vns;
  if (forma === 'K') return vienas ? vns.slice(0, -2) + (vns.endsWith('as') ? 'o' : 'io') : kilm;
  if (vienas) {
    return {
      V: vns,
      G: vns.endsWith('is') ? `${vns.slice(0, -1)}į` : `${vns.slice(0, -2)}ą`,
      I: `${vns.slice(0, -2)}u`,
    }[forma] ?? vns;
  }
  if (n % 10 === 0 || (n % 100 >= 11 && n % 100 <= 19)) return kilm;
  return { V: dgs, G: `${dgs.slice(0, -2)}us`, I: `${dgs.slice(0, -2)}ais` }[forma] ?? dgs;
}

/** 0 … 999 999 999 as a cardinal in the given case (V/G/K/I) and gender ('' | '_f'). */
export function kiekinis(n, forma = 'V', gimine = '') {
  if (n === 0) return { V: 'nulis', G: 'nulį', K: 'nulio', I: 'nuliu' }[forma];
  if (n < 0) return `minus ${kiekinis(-n, forma, gimine)}`;
  const dalys = [];

  const trejetas = (m, f) => {
    const z = [];
    if (m >= 100) {
      const s = Math.floor(m / 100);
      if (s > 1) z.push(VNT[s][f] ?? VNT[s].V); // the multiplier agrees with the case too
      z.push(grupe('šimtas', 'šimtai', 'šimtų', s, f));
      m %= 100;
    }
    if (m >= 11 && m <= 19) {
      z.push(palikt(m, f));
      m = 0;
    } else if (m >= 10) {
      const d = m - (m % 10);
      // Inside a compound numeral only the last part inflects.
      z.push(f === 'K' && m % 10 === 0 ? DESIMT_K[d] : DESIMT[d]);
      m %= 10;
    }
    if (m) z.push(VNT[m][f + gimine] ?? VNT[m][f]);
    return z;
  };

  const groupForm = ['G', 'I', 'K'].includes(forma) ? forma : 'V';
  if (n >= 1_000_000) {
    const mln = Math.floor(n / 1_000_000);
    if (mln > 1) dalys.push(...trejetas(mln, groupForm));
    dalys.push(grupe('milijonas', 'milijonai', 'milijonų', mln, forma));
    n %= 1_000_000;
  }
  if (n >= 1000) {
    const t = Math.floor(n / 1000);
    if (t > 1) dalys.push(...trejetas(t, groupForm));
    dalys.push(grupe('tūkstantis', 'tūkstančiai', 'tūkstančių', t, forma));
    n %= 1000;
  }
  if (n) dalys.push(...trejetas(n, forma));
  return dalys.join(' ');
}

// --- ordinals ---------------------------------------------------------------
const KELINT_KAM = {
  1: 'pirm', 2: 'antr', 3: 'treči', 4: 'ketvirt', 5: 'penkt', 6: 'šešt', 7: 'septint', 8: 'aštunt', 9: 'devint',
  10: 'dešimt', 20: 'dvidešimt', 30: 'trisdešimt', 40: 'keturiasdešimt', 50: 'penkiasdešimt',
  60: 'šešiasdešimt', 70: 'septyniasdešimt', 80: 'aštuoniasdešimt', 90: 'devyniasdešimt',
};
for (let n = 11; n <= 19; n++) KELINT_KAM[n] = `${PALIKT[n].slice(0, -1)}t`;
const KELINT_GAL = {
  'm V': 'as', 'm G': 'ą', 'm K': 'o', 'm Idgs': 'ais', 'm Vdgs': 'i', 'f V': 'a', 'f G': 'ą', 'f K': 'os', 'm Kdgs': 'ų',
};
const IVARDZ = { 'm V': 'asis', 'm G': 'ąjį', 'f V': 'oji', 'f G': 'ąją', 'f K': 'osios', 'm Idgs': 'aisiais' };

/** Compound ordinal: only the LAST part takes the ordinal ending. */
export function kelintinis(n, gimine = 'm', forma = 'V', ivardz = false) {
  if (n <= 0) return kiekinis(n);
  const baze = n - (n % 100);
  let pask = n % 100;
  if (pask === 0) return kiekinis(n) + (forma === 'Idgs' ? '-aisiais' : '');
  let priek = '';
  if (pask > 20 && pask % 10) {
    priek = `${DESIMT[pask - (pask % 10)]} `;
    pask %= 10;
  }
  const gal = (ivardz ? IVARDZ : KELINT_GAL)[`${gimine} ${forma}`] ?? KELINT_GAL['m V'];
  return (baze ? `${kiekinis(baze)} ` : '') + priek + KELINT_KAM[pask] + gal;
}

// --- abbreviations ----------------------------------------------------------
const SANTRUMPOS = [
  [re('\\bproc\\.'), ' procentai'], [re('\\bval\\.(?=\\s|$)'), ' valandos'],
  [re('\\bEur\\b'), ' eurų'], [re('\\bmln\\.'), ' milijonai'],
  [re('\\bkm\\b'), ' kilometrų'], [re('\\bkg\\b'), ' kilogramų'],
  [re('\\bLR\\b'), 'Lietuvos Respublikos'],
];

const RAIDZIU_VARDAI = {
  A: 'a', Ą: 'a nosinė', B: 'bė', C: 'cė', Č: 'čė', D: 'dė', E: 'e', Ę: 'e nosinė', Ė: 'ė', F: 'ef', G: 'gė', H: 'ha',
  I: 'i', Į: 'i nosinė', Y: 'ilgoji i', J: 'jot', K: 'ka', L: 'el', M: 'em', N: 'en', O: 'o', P: 'pė', Q: 'kū',
  R: 'er', S: 'es', Š: 'eš', T: 'tė', U: 'u', Ų: 'u nosinė', Ū: 'ilgoji u', V: 'vė', W: 'dviguba vė', X: 'iks',
  Z: 'zė', Ž: 'žė',
};
// Read as a WORD, not letter by letter.
const SANTRUMPOS_ZODZIU = new Set([
  'NATO', 'UNESCO', 'UNICEF', 'SODRA', 'LIEPA', 'COVID', 'AIDS', 'LED', 'PIN', 'WIFI', 'USB', 'PDF', 'GPS',
  'JAV', 'FIBA', 'NASA', 'DELFI', 'VMI',
]);

const EURAI = ['euras', 'eurai', 'eurų'];
const CENTAI = ['centas', 'centai', 'centų'];
// [singular, plural, genitive plural, gender]
const VIENETAI = {
  km: ['kilometras', 'kilometrai', 'kilometrų', ''],
  cm: ['centimetras', 'centimetrai', 'centimetrų', ''],
  mm: ['milimetras', 'milimetrai', 'milimetrų', ''],
  kg: ['kilogramas', 'kilogramai', 'kilogramų', ''],
  ml: ['mililitras', 'mililitrai', 'mililitrų', ''],
  ha: ['hektaras', 'hektarai', 'hektarų', ''],
  kW: ['kilovatas', 'kilovatai', 'kilovatų', ''],
  Wh: ['vatvalandė', 'vatvalandės', 'vatvalandžių', '_f'],
  kWh: ['kilovatvalandė', 'kilovatvalandės', 'kilovatvalandžių', '_f'],
  proc: ['procentas', 'procentai', 'procentų', ''],
  '°C': ['laipsnis', 'laipsniai', 'laipsnių', ''],
  '°F': ['laipsnis pagal Farenheitą', 'laipsniai pagal Farenheitą', 'laipsnių pagal Farenheitą', ''],
  '°': ['laipsnis', 'laipsniai', 'laipsnių', ''],
  '%': ['procentas', 'procentai', 'procentų', ''],
  hPa: ['hektopaskalis', 'hektopaskaliai', 'hektopaskalių', ''],
  'km/h': ['kilometras per valandą', 'kilometrai per valandą', 'kilometrų per valandą', ''],
  'm/s': ['metras per sekundę', 'metrai per sekundę', 'metrų per sekundę', ''],
  W: ['vatas', 'vatai', 'vatų', ''],
  lx: ['liuksas', 'liuksai', 'liuksų', ''],
  dB: ['decibelas', 'decibelai', 'decibelų', ''],
  ppm: ['milijoninė dalis', 'milijoninės dalys', 'milijoninių dalių', '_f'],
};
const VIENETU_SABLONAS = 'kWh|kW|Wh|W|km/h|km|kg|cm|mm|ml|m/s|hPa|ha|lx|dB|ppm|°C|°F|°|%|proc\\.';
const MATU_ZODZIAI = 'laipsn|procent|kilometr|centimetr|milimetr|metr|kilogram|gram|litr|vat|kilovat|hektopaskal|liuks|decibel';
const MATAS = re(`^\\s*(?:(?:${VIENETU_SABLONAS})(?=\\s|$|[.,;:!?])|${MATU_ZODZIAI})`, 'u');

/** Digits after the decimal comma, as people read them (leading zeros spoken). */
function trupmena(tr, gimine = '') {
  if (tr.length > 3) return [...tr].map((c) => kiekinis(Number(c), 'V', gimine)).join(' ');
  const likutis = tr.replace(/^0+/, '');
  const zodziai = Array(tr.length - likutis.length).fill('nulis');
  if (likutis) zodziai.push(kiekinis(Number(likutis), 'V', gimine));
  return zodziai.join(' ');
}

/** The last number actually spoken after the comma: what the unit agrees with. */
const trupmenosPaskutinis = (tr) => (tr.length > 3 ? Number(tr.at(-1)) : Number(tr));

function skaicForma(n, [one, few, many]) {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return one;
  if (d10 === 0 || (d100 >= 11 && d100 <= 19)) return many;
  return few;
}

const EL_PASTAS = {
  paštas: 'elektroninis', paštu: 'elektroniniu', pašto: 'elektroninio', paštą: 'elektroninį',
  pašte: 'elektroniniame', paštai: 'elektroniniai', paštus: 'elektroninius', paštų: 'elektroninių',
  paštais: 'elektroniniais', paštams: 'elektroniniams',
};

const MOT_ZODZIAI = '(valand|dien|minut|savait|sekund|viet|klas|kart(?!ą))';
const MENESIAI = 'sausio|vasario|kovo|balandžio|gegužės|birželio|liepos|rugpjūčio|rugsėjo|spalio|lapkričio|gruodžio';
const GAL_VEIKSMAZODZIAI = '(kainuoja|kainavo|moka|mokėjo|sumokėjo|gavo|gaus|turi|turėjo|siekia|siekė|sudaro|sudarė|'
  + 'uždirba|uždirbo|skyrė|skirs|prarado|laimėjo|surinko)';
const NUO_IKI = ['nuo', 'iki', 'ligi'];
const UPPER_START = /^\s+[A-ZĄČĘĖĮŠŲŪŽ]/u;
const EURO_AFTER = re('^\\s*(?:Eur\\b|eur|€)', 'u');

/**
 * Creates the expander. `shortWords` is a Set of ordinary lower-case words
 * (zodziai_trumpi.txt): capitalised words found there are not spelled out.
 */
export function createExpander({ shortWords = new Set() } = {}) {
  const raidem = (m) => {
    const s = m[0];
    if (SANTRUMPOS_ZODZIU.has(s)) return s;
    if (s.length >= 4 && shortWords.has(s.toLowerCase())) return s;
    // Letters joined by spaces, hyphens only on the outside: the synthesizer
    // treats the hyphen-fenced fragment as an abbreviation and slows it down.
    return ` - ${[...s].map((c) => RAIDZIU_VARDAI[c] ?? c).join(' ')} - `;
  };

  return function isplesk(t) {
    // "el. paštu" -> "elektroniniu paštu" (the adjective agrees with the noun).
    t = sub(t, re('\\b([Ee]l)\\.\\s*(pašt[a-ząčęėįšųūž]*)'), (m) => {
      const zodis = EL_PASTAS[m[2].toLowerCase()] ?? 'elektroninis';
      return `${isUpper(m[1][0]) ? capitalize(zodis) : zodis} ${m[2]}`;
    });
    // A minus glued to the start of a number (not ranges or dates).
    t = sub(t, re(`(?<![\\p{L}\\p{M}\\p{N}_.,])[-−–](?=\\d)`), 'minus ');
    // Numbers written with a point: thousands groups, clock times or decimals.
    const matas = (po) => MATAS.test(po);
    t = sub(t, re('(?<![\\p{L}\\p{M}\\p{N}_.,])\\d{1,3}(?:\\.\\d{3})+(?![.,]?\\d)'),
      (m) => (matas(after(m)) ? m[0] : m[0].replaceAll('.', '')));
    t = sub(t, re('(?<![\\p{L}\\p{M}\\p{N}_.,])(\\d+)\\.(\\d+)(?![.,]?\\d)'), (m) => {
      const [, a, b] = m;
      const po = after(m);
      if (!matas(po) && b.length === 2 && Number(a) <= 23 && Number(b) <= 59 && !EURO_AFTER.test(po)) {
        return `${a}:${b}`;
      }
      return `${a},${b}`;
    });
    // Units, agreeing with the last number actually spoken.
    t = sub(t, re(`\\b(\\d{1,9})(?:,(\\d+))?\\s*(${VIENETU_SABLONAS})(?=\\s|$|[.,;:!?])`), (m) => {
      const [, sk, tr, vnt] = m;
      const n = tr ? trupmenosPaskutinis(tr) : Number(sk);
      const [one, few, many, gim] = VIENETAI[vnt.replace(/\.+$/, '')];
      const skaic = tr
        ? `${kiekinis(Number(sk), 'V', gim)} kablelis ${trupmena(tr, gim)}`
        : kiekinis(Number(sk), 'V', gim);
      const liko = after(m);
      // "proc." at the end of a sentence also ends the sentence.
      const galas = vnt.endsWith('.') && (!liko.trim() || UPPER_START.test(liko)) ? '.' : '';
      return `${skaic} ${skaicForma(n, [one, few, many])}${galas}`;
    });
    // "1,3 mln." / "405,4 tūkst." - a decimal multiplier.
    t = sub(t, re('\\b(\\d{1,3}),(\\d+)\\s*(mln|tūkst)\\.'), (m) => {
      const formos = m[3] === 'mln' ? ['milijonas', 'milijonai', 'milijonų'] : ['tūkstantis', 'tūkstančiai', 'tūkstančių'];
      return `${kiekinis(Number(m[1]))} kablelis ${trupmena(m[2])} ${skaicForma(trupmenosPaskutinis(m[2]), formos)}`;
    });
    // "5 mln." and "5 tūkst." become real numbers, so the case can be chosen below.
    t = sub(t, re('\\b(\\d{1,3})\\s*mln\\.'), (m) => String(Number(m[1]) * 1_000_000));
    t = sub(t, re('\\b(\\d{1,3})\\s*tūkst\\.'), (m) => String(Number(m[1]) * 1000));
    for (const [pattern, word] of SANTRUMPOS) t = sub(t, pattern, word);
    // 2-5 capitals in a row -> letter names.
    t = sub(t, re('\\b[A-ZĄČĘĖĮŠŲŪŽ]{2,5}\\b'), raidem);
    // Hyphen cleanup.
    t = sub(t, /(?:\s*-\s*){2,}/gu, ' - ');
    t = sub(t, /\s*-\s*(?=[.,:;!?])/gu, '');
    t = sub(t, /\s*-\s*$/gmu, '');
    t = sub(t, /^\s*-\s*/gmu, '');
    // Prices: "9,99 Eur" -> euros and cents.
    t = sub(t, re('\\b(\\d+),(\\d{1,2})\\s*(?:Eur\\b|eurų|eurai|euro|euru|€)'), (m) => {
      const e = Number(m[1]);
      const c = Number(m[2]);
      const kilm = NUO_IKI.includes(lastWordBefore(m));
      const f = kilm ? 'K' : 'V';
      const dalys = [kiekinis(e, f), kilm ? EURAI[2] : skaicForma(e, EURAI)];
      if (c) dalys.push(kiekinis(c, f), kilm ? CENTAI[2] : skaicForma(c, CENTAI));
      return dalys.join(' ');
    });
    // Decimal comma.
    t = sub(t, re('\\b(\\d+),(\\d+)\\b'), (m) => `${kiekinis(Number(m[1]))} kablelis ${trupmena(m[2])}`);
    // Clock times; after nuo/iki/ligi the genitive.
    t = sub(t, re('\\b(\\d{1,2}):(\\d{2})\\b'), (m) => {
      const h = Number(m[1]);
      const mi = Number(m[2]);
      const kilm = NUO_IKI.includes(lastWordBefore(m));
      if (mi === 0) return kilm ? `${kelintinis(h, 'f', 'K')} valandos` : `${kelintinis(h, 'f', 'G')} valandą`;
      const val = kilm ? kiekinis(h, 'K') : kiekinis(h);
      return `${val} ${mi > 9 ? kiekinis(mi) : `nulis ${kiekinis(mi)}`}`;
    });
    // Dates: "2026 m. spalio 24 d."
    t = sub(t, re(`\\b(?:(1\\d{3}|2\\d{3})\\s*m\\.\\s+)?(${MENESIAI})(?:\\s+(\\d{1,2})\\s*d\\.)?`), (m) => {
      if (!(m[1] || m[3])) return m[0];
      const dalys = [];
      if (m[1]) dalys.push(`${kelintinis(Number(m[1]), 'm', 'Kdgs')} metų`);
      dalys.push(m[2]);
      if (m[3]) {
        const d = Number(m[3]);
        const liko = after(m);
        if (NUO_IKI.includes(lastWordBefore(m))) dalys.push(`${kelintinis(d, 'f', 'K', true)} dienos`);
        else if (!liko.replace(/^[ .,!?]+|[ .,!?]+$/g, '') && !before(m).trim()) dalys.push(`${kelintinis(d, 'f', 'V', true)} diena`);
        else dalys.push(`${kelintinis(d, 'f', 'G', true)} dieną`);
        if (!liko.trim() || UPPER_START.test(liko)) dalys[dalys.length - 1] += '.';
      }
      return dalys.join(' ');
    });
    // Years: ordinal in the instrumental / genitive.
    t = sub(t, re('\\b(1\\d{3}|2\\d{3})\\s*(m\\.|metais)\\b'), (m) => `${kelintinis(Number(m[1]), 'm', 'Idgs')} metais`);
    t = sub(t, re('\\b(1\\d{3}|2\\d{3})\\s*metų\\b'), (m) => `${kelintinis(Number(m[1]), 'm', 'Kdgs')} metų`);
    t = sub(t, re('\\b(1\\d{3}|2\\d{3})-(ai|ų|į)?[a-zų]*\\b'), (m) => kelintinis(Number(m[1]), 'm', 'Idgs', true));
    // Feminine accusative ordinal: "15 valandą/vietą/klasę".
    t = sub(t, re(`\\b(\\d{1,3})\\s+(${MOT_ZODZIAI}[ąę])`), (m) => `${kelintinis(Number(m[1]), 'f', 'G')} ${m[2]}`);
    // Masculine accusative ordinal: "23 kartą".
    t = sub(t, re('\\b(\\d{1,3})\\s+(kartą|numerį|aukštą|etapą|turą|sezoną|puslapį)\\b'),
      (m) => `${kelintinis(Number(m[1]), 'm', 'G')} ${m[2]}`);
    // Feminine cardinals: "2 valandas" -> "dvi valandas".
    t = sub(t, re(`\\b(\\d{1,4})\\s+(${MOT_ZODZIAI}(as|os|es|ių|ę))`), (m) => {
      const forma = /(as|es|ę)$/u.test(m[2]) ? 'G' : 'V';
      return `${kiekinis(Number(m[1]), forma, '_f')} ${m[2]}`;
    });
    // Accusative after a verb that governs it: "kainuoja 25 eurus".
    t = sub(t, re(`${GAL_VEIKSMAZODZIAI}\\s+(\\d{1,9})\\b`), (m) => `${m[1]} ${kiekinis(Number(m[2]), 'G')}`);
    // Masculine accusative before a noun: "3 mėnesius".
    t = sub(t, re('\\b(\\d{1,9})\\s+([a-ząčęėįšųūž]+(?:us|į|ą))\\b'), (m) => `${kiekinis(Number(m[1]), 'G')} ${m[2]}`);
    // Prepositions that always take the genitive.
    t = sub(t, re('\\b(nuo|iki|ligi|be|dėl|iš|tarp|virš|šalia|arti)\\s+(\\d{1,9})\\b'),
      (m) => `${m[1]} ${kiekinis(Number(m[2]), 'K')}`);
    // Feminine nouns in the nominative after a number: "2 minutės", "21 minutė".
    t = sub(t, re('(?<![\\p{L}\\p{M}\\p{N}_-])(\\d{1,9})(\\s+)(?!(?:yra|tada|kada|visada|niekada|kažkada)\\b)'
      + '([a-ząčęėįšųūž]+(?:a|ė|os|ės))\\b'), (m) => {
      const n = Number(m[1]);
      const zodis = m[3];
      const d10 = n % 10;
      const d100 = n % 100;
      if (d10 === 0 || (d100 >= 11 && d100 <= 19)) return m[0];
      if ((d10 === 1) !== /[aė]$/u.test(zodis)) return m[0];
      return kiekinis(n, 'V', '_f') + m[2] + zodis;
    });
    // Anything left over: a plain nominative cardinal.
    t = sub(t, re('\\b\\d{1,9}\\b'), (m) => kiekinis(Number(m[0])));
    return t.replace(/\s{2,}/gu, ' ');
  };
}
