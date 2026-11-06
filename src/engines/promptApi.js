// Prompt API (LanguageModel / Gemini Nano) with audio input, prompted to transcribe.
// Chrome rejects sessions that declare languages outside OFFICIAL_LANGS, so other
// languages are declared as English and requested through the instruction.

import { splitAtSilence } from '../audio.js';
import { withTimeout } from '../util.js';

export const supported = 'LanguageModel' in globalThis;
export const OFFICIAL_LANGS = ['en', 'de', 'es', 'fr', 'ja'];
export const isOfficial = (code) => OFFICIAL_LANGS.includes(code);

export function sessionOptions(language) {
  const output = isOfficial(language.code) ? language.code : 'en';
  return {
    expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'audio' }],
    expectedOutputs: [{ type: 'text', languages: [output] }],
  };
}

export const defaultPrompt = (language) =>
  `Transcribe this audio verbatim. The speech is in ${language.english}. ` +
  `Output only the transcription in ${language.english}, with correct spelling, punctuation and diacritics. ` +
  'Do not translate, summarize, explain or add anything else.';

export function availability(language) {
  return withTimeout(
    LanguageModel.availability(sessionOptions(language)),
    20000,
    'Chrome neatsakė per 20 s (LanguageModel.availability).',
  );
}

/** Triggers the model download if needed, so call it from a user action. */
export function createSession(language, onProgress) {
  return LanguageModel.create({
    ...sessionOptions(language),
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => onProgress?.(e.loaded));
    },
  });
}

function cleanup(text) {
  return text
    .replace(/```[a-z]*\n?|```/gi, '')
    .replace(/^\s*(here is|here's|transcription|transkripcija)[^:\n]*:\s*/i, '')
    .replace(/^["„“«]+|["“”»]+$/g, '')
    .trim();
}

/**
 * Transcribes an AudioBuffer. Long clips are split at silences and every chunk
 * gets a fresh clone of the base session, so earlier chunks don't fill the context.
 */
export async function transcribe(baseSession, language, buffer, { prompt, chunkSec, signal, onUpdate }) {
  const chunks = chunkSec > 0 ? splitAtSilence(buffer, chunkSec) : [buffer];
  const parts = [];

  for (const chunk of chunks) {
    const session = typeof baseSession.clone === 'function'
      ? await baseSession.clone({ signal })
      : await LanguageModel.create({ ...sessionOptions(language), signal });
    try {
      let text = '';
      const stream = session.promptStreaming([{
        role: 'user',
        content: [
          { type: 'text', value: prompt },
          { type: 'audio', value: chunk },
        ],
      }], { signal });
      for await (const piece of stream) {
        text += piece;
        onUpdate?.([...parts, text].join(' '));
      }
      parts.push(cleanup(text));
    } finally {
      session.destroy();
    }
  }
  return parts.filter(Boolean).join(' ');
}
