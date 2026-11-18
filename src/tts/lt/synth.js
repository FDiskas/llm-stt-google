// SPDX-License-Identifier: GPL-3.0-or-later
//
// The synthesis recipe for the Reginutė voice. JavaScript port of
// synth_reginute.py from https://huggingface.co/RobertasTa/lt_LT-reginute1-medium
// (GPL-3.0), where every constant is explained by the listening tests and
// measurements behind it. In short:
//  1. clean the text, expand numbers and abbreviations;
//  2. split at . ! ? : ; – - and, unless the comma pause is 0, at commas too
//     (the model's own comma pause is barely audible);
//  3. phonemize each fragment and synthesize it WITHOUT peak normalization
//     (normalizing clips this voice);
//  4. level the speaking rate per fragment (the model speeds up on long
//     fragments and drags short ones), trim the model's own silence and insert
//     measured pauses instead.

const QUOTES = /[„“”"«»]/gu;
const BREAKS = /([.!?:;–-])/u;
const BREAKS_WITH_COMMA = /([.,!?:;–-])/u;

const MS_PER_PHONEME = 36.9; // × length scale = target ms per phoneme (medium/long fragments)
const MS_PER_PHONEME_SHORT = 50.9; // the same for short fragments, which the speaker says slower
const SHORT_PHONEMES = 15;
const LEVEL_TOLERANCE = 0.06;
const LEVEL_TRIES = 2;
const ABBREVIATION_SLOWDOWN = 1.15;

const PAUSE = { '.': 0.45, '!': 0.45, '?': 0.45, ':': 0.2, ';': 0.2, '–': 0.25, '-': 0.1 };
export const DEFAULT_COMMA_PAUSE = 0.25;
const LINE_PAUSE = 0.15;
const END_PAUSE = 0.7;

export function cleanText(t) {
  return t
    .replace(QUOTES, ' ')
    .replace(/\(\s*\.\.\.\s*\)/gu, ' ')
    .replace(/[()[\]]/gu, ' ')
    .replaceAll('…', '.')
    .replace(/\.{2,}/gu, '.')
    .replace(/([.,:;!?])\s*(?=[.,:;!?])/gu, '')
    .replace(/[ \t]+/gu, ' ');
}

/** A line -> [[fragment text, the break mark after it]]. */
export function fragments(line, splitCommas) {
  const parts = line.split(splitCommas ? BREAKS_WITH_COMMA : BREAKS);
  const out = [];
  for (let i = 0; i < parts.length; i += 2) {
    const text = parts[i].trim();
    const mark = parts[i + 1] ?? '';
    if (text || mark) out.push([text, mark]);
  }
  return out;
}

const dbOf = (x) => 20 * Math.log10(x + 1e-12);

function windowRmsDb(a, win) {
  const n = Math.floor(a.length / win);
  const out = new Float32Array(n);
  for (let w = 0; w < n; w++) {
    let sum = 0;
    for (let i = w * win; i < (w + 1) * win; i++) sum += a[i] * a[i];
    out[w] = dbOf(Math.sqrt(sum / win));
  }
  return out;
}

/**
 * Trims the model's own silence. The start uses a much lower threshold
 * (-70 dB, 30 ms margin) because consonants like "R" rise slowly out of it.
 */
export function trimSilence(a, sampleRate, endDb = -45, startDb = -70, startMargin = 3) {
  const win = Math.floor(sampleRate * 0.01);
  const rms = windowRmsDb(a, win);
  if (!rms.length) return a;
  const loud = [];
  rms.forEach((v, i) => { if (v > endDb) loud.push(i); });
  if (!loud.length) return a;
  const firstAudible = rms.findIndex((v) => v > startDb);
  const start = Math.max(0, (firstAudible >= 0 ? firstAudible : loud[0]) - startMargin);
  const end = Math.min(rms.length, loud[loud.length - 1] + 2);
  return a.subarray(start * win, end * win);
}

function maxAbs(a) {
  let peak = 0;
  for (const v of a) peak = Math.max(peak, Math.abs(v));
  return peak;
}
const peakDb = (a) => dbOf(maxAbs(a));

const median = (xs) => {
  const s = [...xs].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Letters are spoken flatter: raise an abbreviation's peak to the nearby words' (≤ +4 dB, ≤ -1 dBFS). */
function levelAbbreviation(a, wordPeaks) {
  if (!wordPeaks.length) return a;
  const diff = median(wordPeaks) - peakDb(a);
  if (diff <= 0.3) return a;
  const gain = Math.min(10 ** (Math.min(diff, 4) / 20), 0.89 / (maxAbs(a) || 1));
  return a.map((v) => v * gain);
}

/**
 * @param {object} voice  from piper.js createVoice
 * @param {object} phonemizer  from phonemize.js createPhonemizer
 * @param {(text: string) => string} expand  number/abbreviation expander
 */
export function createSynth(voice, phonemizer, expand) {
  const { sampleRate } = voice;
  const silence = (s) => new Float32Array(Math.round(sampleRate * s));

  async function render(phonemes, lengthScale) {
    return trimSilence(await voice.synthesize(phonemes, lengthScale), sampleRate);
  }

  async function fragment(text, { lengthScale, levelRate, abbreviation }) {
    const ipa = await phonemizer.phonemizeSentence(text);
    if (!ipa) return null;
    const phonemes = [...ipa.normalize('NFD')];
    // An abbreviation is short, but letters must not be rushed: slow it down instead of levelling.
    if (abbreviation) return { ipa, audio: await render(phonemes, lengthScale * ABBREVIATION_SLOWDOWN) };

    let scale = lengthScale;
    let audio = await render(phonemes, scale);
    if (levelRate) {
      const target = (phonemes.length < SHORT_PHONEMES ? MS_PER_PHONEME_SHORT : MS_PER_PHONEME) * lengthScale;
      for (let i = 0; i < LEVEL_TRIES && audio.length; i++) {
        const ms = (1000 * audio.length) / sampleRate / phonemes.length;
        if (Math.abs(ms - target) < target * LEVEL_TOLERANCE) break;
        // The original clamps to 0.6–2.0 around its default 1.30; here the bounds
        // follow the requested scale, which speed and pitch effects move.
        scale = Math.max(lengthScale * 0.46, Math.min(lengthScale * 1.54, (scale * target) / ms));
        audio = await render(phonemes, scale);
      }
    }
    return { ipa, audio };
  }

  /**
   * Yields { audio, text?, ipa? } pieces in playback order (speech and pauses),
   * so playback can start before the whole text is done.
   * @param {{ lengthScale: number, levelRate: boolean, commaPause?: number, isCancelled?: () => boolean }} opts
   *   commaPause: seconds of silence at a comma; 0 leaves the comma to the model.
   */
  async function* pieces(text, opts) {
    const commaPause = opts.commaPause ?? DEFAULT_COMMA_PAUSE;
    const pauses = { ...PAUSE, ',': commaPause };
    const expanded = expand(cleanText(text));
    let wordPeaks = [];
    for (const line of expanded.split(/\r?\n/)) {
      const parts = fragments(line, commaPause > 0);
      for (let i = 0; i < parts.length; i++) {
        if (opts.isCancelled?.()) return;
        const [frag, mark] = parts[i];
        const abbreviation = (i > 0 && parts[i - 1][1] === '-') || mark === '-';
        if (frag) {
          const result = await fragment(frag, { ...opts, abbreviation });
          if (result?.audio.length) {
            let { audio } = result;
            if (abbreviation) audio = levelAbbreviation(audio, wordPeaks);
            else wordPeaks = [...wordPeaks, peakDb(audio)].slice(-6);
            yield { audio, text: frag, ipa: result.ipa };
          }
        }
        if (mark) yield { audio: silence(pauses[mark] ?? commaPause) };
      }
      yield { audio: silence(LINE_PAUSE) };
    }
    yield { audio: silence(END_PAUSE) };
  }

  return { sampleRate, pieces };
}
