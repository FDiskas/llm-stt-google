// Text-to-speech worker: downloads the voice, then turns text into audio
// pieces off the main thread, so the page stays responsive while it speaks.
//
// In:  { type: 'load', voice }            Out: { type: 'progress', fraction, detail } … { type: 'ready' }
//      { type: 'speak', id, text, opts }        { type: 'piece', id, audio, text, ipa } … { type: 'done', id, stats }
//      { type: 'cancel', id }                   { type: 'error', id?, message }

import { createEspeak, ESPEAK_FILES } from './espeak.js';
import { fetchAll } from './files.js';
import { createVoice } from './piper.js';
import { createExpander } from './lt/expand.js';
import { createPhonemizer, parseDictionary, parseLetters, parseVocatives } from './lt/phonemize.js';
import { createSynth } from './lt/synth.js';

let synth = null;
const cancelled = new Set();
const decode = (buffer) => new TextDecoder().decode(buffer);

async function load(voice) {
  const entries = Object.entries(voice.files);
  const buffers = await fetchAll(entries.map(([, f]) => f), (fraction, loaded, total) => {
    postMessage({ type: 'progress', fraction, detail: `Siunčiama… ${(loaded / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB` });
  });
  const file = Object.fromEntries(entries.map(([key], i) => [key, buffers[i]]));

  postMessage({ type: 'progress', fraction: 'indeterminate', detail: 'Ruošiamas modelis…' });
  const config = JSON.parse(decode(file.config));
  const [espeak, voiceModel] = await Promise.all([
    createEspeak(ESPEAK_FILES.module, file.espeakWasm, voice.espeakVoice),
    createVoice(file.model, config),
  ]);
  const phonemizer = createPhonemizer({
    dictionary: parseDictionary(decode(file.dictionary)),
    letters: parseLetters(decode(file.letters)),
    vocatives: parseVocatives(decode(file.vocatives)),
  }, espeak.phonemizeWords);
  const shortWords = new Set(decode(file.shortWords).split(/\r?\n/).map((l) => l.split('\t')[0].trim()).filter(Boolean));
  synth = createSynth(voiceModel, phonemizer, createExpander({ shortWords }));
  postMessage({ type: 'ready', sampleRate: synth.sampleRate });
}

async function speak(id, text, opts) {
  const started = performance.now();
  let samples = 0;
  for await (const piece of synth.pieces(text, { ...opts, isCancelled: () => cancelled.has(id) })) {
    samples += piece.audio.length;
    // Copy: the model's output may be a view into a larger buffer.
    const audio = piece.audio.slice();
    postMessage({ type: 'piece', id, audio, text: piece.text, ipa: piece.ipa }, [audio.buffer]);
  }
  const seconds = samples / synth.sampleRate;
  const elapsed = (performance.now() - started) / 1000;
  postMessage({ type: 'done', id, cancelled: cancelled.has(id), stats: { seconds, elapsed } });
  cancelled.delete(id);
}

// One ONNX session cannot run twice at once, so loads and texts are queued;
// cancellation is applied immediately and checked between fragments.
let queue = Promise.resolve();

onmessage = ({ data }) => {
  if (data.type === 'cancel') {
    cancelled.add(data.id);
    return;
  }
  const task = data.type === 'load' ? () => load(data.voice) : () => speak(data.id, data.text, data.opts);
  queue = queue.then(task).catch((err) => {
    cancelled.delete(data.id);
    postMessage({ type: 'error', id: data.id, message: err?.message ?? String(err) });
  });
};
