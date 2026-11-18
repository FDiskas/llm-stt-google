// Piper (VITS) voice inference with onnxruntime-web on the CPU (WASM).
// A medium Piper voice is small (~63 MB), so WebGPU would not pay off.

import * as ort from 'onnxruntime-web/wasm';

const ORT_VERSION = '1.31.0-dev.20260914-8d85527a0'; // keep equal to package.json
ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
// Threads need cross-origin isolation, which GitHub Pages cannot enable.
ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

const PAD = '_';
const BOS = '^';
const EOS = '$';

/**
 * @param {ArrayBuffer} modelBytes  the .onnx file
 * @param {object} config  the .onnx.json file (phoneme_id_map, audio.sample_rate, inference)
 */
export async function createVoice(modelBytes, config) {
  const session = await ort.InferenceSession.create(new Uint8Array(modelBytes), {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  const idMap = config.phoneme_id_map;
  const sampleRate = config.audio.sample_rate;
  const { noise_scale: noiseScale = 0.667, noise_w: noiseW = 0.8 } = config.inference ?? {};

  /** Piper's phonemes_to_ids: BOS, then every phoneme followed by PAD, then EOS. */
  function toIds(phonemes) {
    const ids = [...idMap[BOS], ...idMap[PAD]];
    for (const p of phonemes) {
      const id = idMap[p];
      if (!id) continue; // unknown symbol: Piper skips it too
      ids.push(...id, ...idMap[PAD]);
    }
    ids.push(...idMap[EOS]);
    return ids;
  }

  /** Phonemes (single code points, NFD) -> mono Float32Array at `sampleRate`. */
  async function synthesize(phonemes, lengthScale) {
    const ids = toIds(phonemes);
    const feeds = {
      input: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor('float32', Float32Array.from([noiseScale, lengthScale, noiseW]), [3]),
    };
    const result = await session.run(feeds);
    const audio = result[session.outputNames[0]].data;
    Object.values(feeds).forEach((t) => t.dispose?.());
    return audio;
  }

  return { sampleRate, synthesize, release: () => session.release() };
}
