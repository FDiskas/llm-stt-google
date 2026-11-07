// NVIDIA Parakeet TDT (ONNX) in the browser via parakeet.js / onnxruntime-web.
// Files are downloaded from Hugging Face once and cached by parakeet.js in this
// site's IndexedDB, so unlike Chrome's built-in models the page can delete them.

import { fromHub } from 'parakeet.js';
import { TARGET_RATE } from '../audio.js';
import { webGpuSupport } from '../util.js';

export const supported = typeof indexedDB !== 'undefined' && typeof WebAssembly !== 'undefined';
export const storage = 'IndexedDB';

// parakeet.js cache layout (src/hub.js): database, store and per-file key.
const DB_NAME = 'parakeet-cache-db';
const STORE_NAME = 'file-store';
const REVISION = 'main';
const cacheKey = (repoId, filename) => `hf-${repoId}-${REVISION}--${filename}`;

const QUANT_FILE = { fp16: '.fp16.onnx', int8: '.int8.onnx', fp32: '.onnx' };

/**
 * WebGPU with fp16 weights when the GPU supports shader-f16 (int8 gives wrong
 * results on WebGPU, fp32 is ~2.4 GB); otherwise int8 on CPU (WASM).
 * The decoder always runs on WASM, where int8 is fine.
 */
const RUNTIMES = {
  gpu: { backend: 'webgpu-hybrid', encoderQuant: 'fp16', decoderQuant: 'int8', label: 'WebGPU · fp16', size: '~1,3 GB' },
  cpu: {
    backend: 'wasm', encoderQuant: 'int8', decoderQuant: 'int8', label: 'CPU (WASM) · int8', size: '~0,7 GB',
    note: 'WebGPU su fp16 nepasiekiamas, todėl veiks per procesorių (lėčiau).',
  },
};

export async function pickRuntime() {
  return (await webGpuSupport()) === 'f16' ? RUNTIMES.gpu : RUNTIMES.cpu;
}

export const filesFor = (runtime) => [
  `encoder-model${QUANT_FILE[runtime.encoderQuant]}`,
  `decoder_joint-model${QUANT_FILE[runtime.decoderQuant]}`,
  'vocab.txt',
];

function openCache() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openCache();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const result = fn(tx.objectStore(STORE_NAME));
      tx.oncomplete = () => resolve(result.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** True when every file of this runtime is already in the IndexedDB cache. */
export async function isCached(repoId, runtime) {
  const keys = await withStore('readonly', (store) => store.getAllKeys());
  const have = new Set(keys);
  return filesFor(runtime).every((f) => have.has(cacheKey(repoId, f)));
}

/** Deletes every cached file of this repo (all quantizations). */
export function removeCached(repoId) {
  const prefix = `hf-${repoId}-`;
  return withStore('readwrite', (store) => store.delete(IDBKeyRange.bound(prefix, `${prefix}￿`)));
}

/** Downloads (or reads from cache) and compiles the model. onProgress(fraction | null, detail). */
export async function load(repoId, runtime, onProgress) {
  const files = filesFor(runtime);
  return fromHub(repoId, {
    backend: runtime.backend,
    encoderQuant: runtime.encoderQuant,
    decoderQuant: runtime.decoderQuant,
    revision: REVISION,
    progress: ({ loaded, total, file }) => {
      const n = files.indexOf(file) + 1;
      onProgress(loaded / total, `Siunčiamas ${file} (${n}/${files.length})… ${(loaded / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB`);
    },
  });
}

/** Releases the ONNX sessions (GPU/WASM memory). The cached files stay. */
export async function release(model) {
  await Promise.allSettled([model?.encoderSession?.release?.(), model?.joinerSession?.release?.()]);
}

/** Transcribes a 16 kHz mono AudioBuffer. Long clips are windowed by parakeet.js. */
export async function transcribe(model, buffer) {
  if (buffer.sampleRate !== TARGET_RATE) throw new Error(`Parakeet reikia ${TARGET_RATE} Hz garso, gauta ${buffer.sampleRate} Hz.`);
  const result = await model.transcribeLongAudio(buffer.getChannelData(0), TARGET_RATE);
  return (result.text ?? '').trim();
}
