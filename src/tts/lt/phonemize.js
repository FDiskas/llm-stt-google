// SPDX-License-Identifier: GPL-3.0-or-later
//
// Lithuanian phonemization: eSpeak NG IPA + dictionary-based pitch accent.
// JavaScript port of phonemize_lithuanian.py from
// https://huggingface.co/RobertasTa/lt_LT-reginute1-medium (GPL-3.0).
//
// eSpeak NG gives good Lithuanian phonemes but puts the stress in the wrong
// place in about half of the words and has no pitch accents. This keeps eSpeak
// as the phoneme source (one word at a time) and then:
//  1. replaces ʂ with s (the voice never saw ʂ; ɭ, the soft l, is kept);
//  2. looks the word up in the stress dictionary (word -> vowel group, accent);
//  3. moves the stress mark to that syllable as one of three accents:
//     ˈ acute (tvirtapradė), ˌ circumflex (tvirtagalė), ˋ grave (trumpinė).
// Words missing from the dictionary keep eSpeak's own stress.

const ACUTE = 'ˈ';
const STRESS_MARKS = 'ˈˌˋ';
const IPA_VOWELS = 'aeiouɑɐɔɛɪʊæøɘəɜ';
const LENGTH = 'ː';
const CONSONANT_MODIFIERS = 'ʲʷʰ̩';

const WORD_CLEAN = /[^a-zA-ZąčęėįšųūžĄČĘĖĮŠŲŪŽ0-9]/gu;
const KEEP_PUNCT = '.,!?:;';
export const SENTENCE_SPLIT = /(?<=[.!?…])\s+/u;

const STRIP_FROM = 'ąčęėįšųūžĄČĘĖĮŠŲŪŽ';
const STRIP_TO = 'aceeisuuzACEEISUUZ';
const stripDiacritics = (s) => [...s].map((c) => STRIP_TO[STRIP_FROM.indexOf(c)] ?? c).join('');
const VOCATIVE_OPENERS = [',', ':', '-', '–', '—'];
const VOCATIVE_CLOSERS = [',', '.', '!', '?', '…'];

const dataLines = (text) => text.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));

/** word<TAB>vowel group<TAB>mark[<TAB>IPA vowel group] -> Map(word -> [group, mark]). */
export function parseDictionary(text) {
  const entries = new Map();
  for (const line of dataLines(text)) {
    const parts = line.split('\t');
    if ((parts.length !== 3 && parts.length !== 4) || !parts[2] || !STRESS_MARKS.includes(parts[2])) continue;
    entries.set(parts[0], [Number(parts.length === 4 ? parts[3] : parts[1]), parts[2]]);
  }
  return entries;
}

/** letter<TAB>IPA[<TAB>prefix,prefix] -> Map(letter -> [IPA, prefixes]). */
export function parseLetters(text) {
  const letters = new Map();
  for (const line of dataLines(text)) {
    const parts = line.split('\t');
    if (parts.length < 2 || !parts[1]) continue;
    letters.set(parts[0].toLowerCase(), [parts[1], parts[2] ? parts[2].split(',').filter(Boolean) : []]);
  }
  return letters;
}

/** word[<TAB>note] -> Set of nouns used in direct address, diacritics stripped. */
export function parseVocatives(text) {
  const words = new Set();
  for (const line of dataLines(text)) {
    const word = line.split('\t')[0].trim().toLowerCase();
    if (word) words.add(stripDiacritics(word));
  }
  return words;
}

/** Start index of every vowel group (adjacent vowels + ː form one group). */
function ipaVowelGroups(ipa) {
  const groups = [];
  for (let i = 0; i < ipa.length; i++) {
    if (!IPA_VOWELS.includes(ipa[i])) continue;
    groups.push(i);
    while (i + 1 < ipa.length && (IPA_VOWELS.includes(ipa[i + 1]) || ipa[i + 1] === LENGTH)) i++;
  }
  return groups;
}

/**
 * Removes eSpeak's stress and puts `mark` before the syllable of vowel group
 * `groupIndex` (V-CV, VC-CV; a word-initial cluster belongs to the first syllable).
 */
function placeAccent(ipa, groupIndex, mark) {
  const clean = [...ipa].filter((c) => !STRESS_MARKS.includes(c)).join('');
  const groups = ipaVowelGroups(clean);
  if (groupIndex == null || groupIndex >= groups.length) return ipa;
  let i = groups[groupIndex] - 1;
  while (i >= 0 && CONSONANT_MODIFIERS.includes(clean[i])) i--;
  if (i >= 0 && !IPA_VOWELS.includes(clean[i]) && !(` ${LENGTH}`).includes(clean[i])) i--; // one consonant
  let boundary = i + 1;
  let j = i;
  while (j >= 0 && !IPA_VOWELS.includes(clean[j]) && clean[j] !== ' ') j--;
  if (j < 0 || clean[j] === ' ') boundary = j + 1; // word start
  return clean.slice(0, boundary) + mark + clean.slice(boundary);
}

/** Vocative: accent the first syllable and lengthen a short vowel (mama -> ˈmaːːma). */
function vocativeAccent(ipa) {
  const accented = placeAccent(ipa, 0, ACUTE);
  const groups = ipaVowelGroups(accented);
  if (!groups.length) return accented;
  const start = groups[0];
  let end = start;
  while (end + 1 < accented.length && (IPA_VOWELS.includes(accented[end + 1]) || accented[end + 1] === LENGTH)) end++;
  if (end !== start) return accented; // diphthong or already long
  return accented.slice(0, end + 1) + LENGTH + LENGTH + accented.slice(end + 1);
}

/**
 * @param {object} data  { dictionary, letters, vocatives } from the parse* functions
 * @param {(words: string[]) => Promise<string[]>} espeakWords  IPA for each word
 */
export function createPhonemizer({ dictionary, letters, vocatives }, espeakWords) {
  const cache = new Map();

  async function ensureEspeak(words) {
    const missing = [...new Set(words.filter((w) => w && !cache.has(w)))];
    if (!missing.length) return;
    const ipa = await espeakWords(missing);
    missing.forEach((w, i) => cache.set(w, ipa[i].replaceAll('ʂ', 's')));
  }

  function letterIpa(word, nextWord) {
    const entry = letters.get(word.toLowerCase());
    if (!entry) return null;
    const [ipa, prefixes] = entry;
    return prefixes.some((p) => nextWord.toLowerCase().startsWith(p)) ? null : ipa;
  }

  function isVocative(words, tokens, i) {
    if (!vocatives.size || !vocatives.has(stripDiacritics(words[i].toLowerCase()))) return false;
    const opened = i === 0 || VOCATIVE_OPENERS.some((c) => tokens[i - 1].trimEnd().endsWith(c));
    const closed = i === tokens.length - 1 || VOCATIVE_CLOSERS.some((c) => tokens[i].trimEnd().endsWith(c));
    return opened && closed;
  }

  function phonemizeWord(word) {
    const ipa = cache.get(word);
    const entry = dictionary.get(word.toLowerCase());
    if (entry) return placeAccent(ipa, entry[0], entry[1]);
    // Unknown word: keep eSpeak's stress; a monosyllable without one gets it before the vowel.
    if ([...ipa].some((c) => STRESS_MARKS.includes(c))) return ipa;
    const groups = ipaVowelGroups(ipa);
    return groups.length ? ipa.slice(0, groups[0]) + ACUTE + ipa.slice(groups[0]) : ipa;
  }

  /** One sentence or fragment -> IPA string with pitch accents and kept punctuation. */
  async function phonemizeSentence(sentence) {
    const tokens = sentence.split(/\s+/).filter(Boolean);
    const words = tokens.map((t) => t.replace(WORD_CLEAN, ''));
    await ensureEspeak(words);
    const pieces = [];
    tokens.forEach((token, i) => {
      const word = words[i];
      const punct = [...token].filter((c) => KEEP_PUNCT.includes(c)).join('');
      if (!word) {
        if (punct && pieces.length) pieces[pieces.length - 1] += punct;
        return;
      }
      const override = letterIpa(word, words[i + 1] ?? '');
      let ipa = override ?? phonemizeWord(word);
      if (override == null && isVocative(words, tokens, i)) ipa = vocativeAccent(ipa);
      pieces.push(ipa + punct);
    });
    return pieces.join(' ');
  }

  return { phonemizeSentence };
}
