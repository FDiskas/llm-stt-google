// Whisper (ONNX) in the browser via transformers.js / onnxruntime-web.
// Same interface as parakeet.js, so catalog.js drives both the same way.
// Files are cached by transformers.js in this site's Cache Storage, keyed by URL.

import { TARGET_RATE, splitAtSilence } from '../audio.js';
import { webGpuSupport } from '../util.js';

export const supported = typeof caches !== 'undefined' && typeof WebAssembly !== 'undefined';
export const storage = 'Cache Storage';

const CACHE_NAME = 'transformers-cache'; // transformers.js env.cacheKey
const HUB = 'https://huggingface.co';
const fileUrl = (repoId, file) => `${HUB}/${repoId}/resolve/main/${file}`;

// Whisper sees at most 30 s at once; longer clips are cut at pauses (the
// Lithuanian fine-tunes advise this over transformers.js chunk_length_s).
const CHUNK_SEC = 25;

/**
 * WebGPU with an fp16 encoder when the GPU supports shader-f16, 4-bit weights on
 * WebGPU otherwise, and 4-bit on CPU (WASM) without WebGPU (slow for large models).
 * The decoder is always 4-bit: it runs once per token, so its size sets the speed.
 */
const RUNTIMES = {
  gpu: { id: 'gpu', device: 'webgpu', encoder: 'fp16', label: 'WebGPU · fp16 + q4' },
  gpuQ4: {
    id: 'gpuQ4', device: 'webgpu', encoder: 'q4', label: 'WebGPU · q4',
    note: 'GPU nepalaiko fp16, todėl ir encoderis bus 4 bitų (šiek tiek mažesnis tikslumas).',
  },
  cpu: {
    id: 'cpu', device: 'wasm', encoder: 'q4', label: 'CPU (WASM) · q4',
    note: 'WebGPU nepasiekiamas, todėl veiks per procesorių (labai lėtai).',
  },
};

export async function pickRuntime() {
  return { f16: RUNTIMES.gpu, basic: RUNTIMES.gpuQ4 }[await webGpuSupport()] ?? RUNTIMES.cpu;
}

const filesFor = (runtime) => [
  'config.json',
  'tokenizer.json',
  `onnx/encoder_model_${runtime.encoder}.onnx`,
  'onnx/decoder_model_merged_q4.onnx',
];

let libPromise = null;
/** transformers.js is large, so it is loaded only when a Whisper model is used. */
function lib() {
  libPromise ??= import('@huggingface/transformers').then((t) => {
    t.env.allowLocalModels = false; // never probe this site for /models/...
    return t;
  });
  return libPromise;
}

async function openCache() {
  return caches.open(CACHE_NAME);
}

/** True when every file of this runtime is already in Cache Storage. */
export async function isCached(repoId, runtime) {
  const cache = await openCache();
  const hits = await Promise.all(filesFor(runtime).map((f) => cache.match(fileUrl(repoId, f))));
  return hits.every(Boolean);
}

/** Deletes every cached file of this repo (all quantizations). */
export async function removeCached(repoId) {
  const cache = await openCache();
  const prefix = `${HUB}/${repoId}/`;
  const keys = await cache.keys();
  await Promise.all(keys.filter((r) => r.url.startsWith(prefix)).map((r) => cache.delete(r)));
}

/** Downloads (or reads from cache) and compiles the model. onProgress(fraction, detail). */
export async function load(repoId, runtime, onProgress) {
  const { pipeline } = await lib();
  try {
    return await pipeline('automatic-speech-recognition', repoId, {
      device: runtime.device,
      dtype: { encoder_model: runtime.encoder, decoder_model_merged: 'q4' },
      progress_callback: (p) => {
        if (p.status !== 'progress_total' || !p.total) return;
        onProgress(p.loaded / p.total, `Siunčiami modelio failai… ${(p.loaded / 1e6).toFixed(0)} / ${(p.total / 1e6).toFixed(0)} MB`);
      },
    });
  } catch (err) {
    // Hugging Face answers 401 for repos that don't exist (or are private).
    if (/Unauthorized|Could not locate|404/.test(err?.message ?? '')) {
      throw new Error(`Hugging Face repozitorijos ${repoId} nėra arba ji privati. Modelio failai dar neįkelti.`);
    }
    throw err;
  }
}

/** Releases the ONNX sessions (GPU/WASM memory). The cached files stay. */
export async function release(asr) {
  await asr?.dispose?.();
}

/** Transcribes a 16 kHz mono AudioBuffer in the given language. */
export async function transcribe(asr, buffer, { language }) {
  if (buffer.sampleRate !== TARGET_RATE) throw new Error(`Whisper reikia ${TARGET_RATE} Hz garso, gauta ${buffer.sampleRate} Hz.`);
  const chunks = buffer.duration > 30 ? splitAtSilence(buffer, CHUNK_SEC) : [buffer];
  const parts = [];
  for (const chunk of chunks) {
    const out = await asr(chunk.getChannelData(0), {
      language: language.english.toLowerCase(),
      task: 'transcribe',
    });
    parts.push((out.text ?? '').trim());
  }
  return parts.filter(Boolean).join(' ');
}
