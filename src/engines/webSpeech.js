// Web Speech API: on-device (processLocally = true) or cloud recognition.
// Clips are fed via SpeechRecognition.start(MediaStreamTrack) (Chrome 135+),
// so the recognizer hears exactly the same audio as the other engines.

import { padWithSilence } from '../audio.js';
import { withTimeout } from '../util.js';

const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;

export const supported = !!SR;
export const onDeviceApi = !!(SR && typeof SR.available === 'function');

const ERRORS = {
  'language-not-supported': 'Ši kalba nepalaikoma (įrenginyje: kalbos paketas neįdiegtas arba jo nėra).',
  'network': 'Tinklo klaida. Debesies atpažinimui reikia interneto.',
  'not-allowed': 'Neleista naudoti mikrofono.',
  'service-not-allowed': 'Kalbos atpažinimo paslauga šiame kontekste neleidžiama.',
  'audio-capture': 'Nepavyko gauti garso.',
};

function describe(error) {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  return ERRORS[error.error] ?? `${error.error}${error.message ? `: ${error.message}` : ''}`;
}

/** 'available' | 'downloadable' | 'downloading' | 'unavailable' */
export async function availability({ lang, quality, processLocally = true }) {
  const options = { langs: [lang], processLocally };
  if (quality) options.quality = quality;
  return withTimeout(SR.available(options), 10000, 'Chrome neatsakė per 10 s (SpeechRecognition.available).');
}

/** Resolves true when the on-device language pack is installed. */
export async function install({ lang, quality }) {
  if (typeof SR?.install !== 'function') {
    throw new Error('Ši naršyklė neturi SpeechRecognition.install().');
  }
  const options = { langs: [lang], processLocally: true };
  if (quality) options.quality = quality;
  return SR.install(options);
}

function createRecognizer({ lang, processLocally }) {
  const rec = new SR();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  if ('processLocally' in rec) {
    rec.processLocally = !!processLocally;
  } else if (processLocally) {
    throw new Error('Ši naršyklė neturi SpeechRecognition.processLocally (reikia Chrome 139+).');
  }
  return rec;
}

function collect(results) {
  const finals = [];
  const interims = [];
  for (const result of results) {
    const text = result[0]?.transcript?.trim();
    if (!text) continue;
    (result.isFinal ? finals : interims).push(text);
  }
  return { final: finals.join(' '), interim: interims.join(' ') };
}

/**
 * Runs recognition until stop() is called, restarting automatically if Chrome
 * ends a session on its own (e.g. after a pause).
 * Returns { stop(), done: Promise<{ text, error, endLatencyMs }> }.
 */
function run(options, track) {
  const segments = [];
  let current = { final: '', interim: '' };
  let stopped = false;
  let stopAt = 0;
  let fatal = null;
  let rec = null;
  let resolve;
  const done = new Promise((r) => { resolve = r; });
  const text = () => [...segments, current.final].filter(Boolean).join(' ');

  const finish = () => resolve({
    text: text(),
    error: describe(fatal),
    endLatencyMs: stopAt ? performance.now() - stopAt : null,
  });

  const startOne = () => {
    rec = createRecognizer(options);
    rec.onstart = () => options.onStart?.();
    rec.onresult = (e) => {
      current = collect(e.results);
      options.onUpdate?.(text(), current.interim);
    };
    rec.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') fatal = e;
    };
    rec.onend = () => {
      segments.push(current.final || current.interim);
      current = { final: '', interim: '' };
      if (!stopped && !fatal) {
        try { startOne(); return; } catch (err) { fatal = err; }
      }
      finish();
    };
    if (track) rec.start(track); else rec.start();
  };

  try {
    startOne();
  } catch (err) {
    fatal = err;
    finish();
  }

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      stopAt = performance.now();
      rec?.stop();
    },
    done,
  };
}

/**
 * Plays an AudioBuffer into the recognizer through a MediaStreamTrack (silently)
 * and returns { text, error, endLatencyMs } once it is fully processed.
 */
export async function transcribeBuffer(buffer, options) {
  const padded = padWithSilence(buffer, 1.0);
  const ctx = new AudioContext();
  await ctx.resume();
  const source = ctx.createBufferSource();
  source.buffer = padded;
  const destination = ctx.createMediaStreamDestination();
  source.connect(destination);
  const track = destination.stream.getAudioTracks()[0];

  let played = false;
  const session = run({
    ...options,
    onStart: () => {
      if (played) return;
      played = true;
      source.start();
    },
  }, track);
  source.onended = () => session.stop();

  const watchdog = setTimeout(() => { if (!played) session.stop(); }, 8000);
  try {
    const result = await session.done;
    if (!played && !result.error) result.error = 'Atpažinimas nepasileido.';
    return result;
  } finally {
    clearTimeout(watchdog);
    try { source.stop(); } catch { /* already stopped */ }
    track.stop();
    ctx.close();
  }
}
