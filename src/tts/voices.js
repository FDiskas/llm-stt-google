// Voice catalog. Each voice lists the files its worker needs; sizes (bytes) are
// only used to weight the download progress bar.

import { ESPEAK_FILES } from './espeak.js';

const hub = (repo, revision, file) => `https://huggingface.co/${repo}/resolve/${revision}/${file}`;

const REGINUTE_REPO = 'RobertasTa/lt_LT-reginute1-medium';
const REGINUTE_REVISION = 'c07c92892aca8831b78a20fe4b8cdf7556c1a781';
const reginute = (file) => hub(REGINUTE_REPO, REGINUTE_REVISION, file);

export const VOICES = [
  {
    id: 'lt-reginute',
    name: 'Reginutė',
    language: 'Lietuvių',
    description: 'Piper (VITS) balsas, apmokytas su LIEPA garsynu: viena profesionali aktorė, apie 3 val. įrašų.',
    url: `https://huggingface.co/${REGINUTE_REPO}`,
    license: 'CC-BY-4.0',
    espeakVoice: 'lt',
    lengthScale: 1.3, // the voice's own default, chosen by ear
    files: {
      model: { url: reginute('lt_LT-reginute1-medium.onnx'), size: 63_516_051 },
      config: { url: reginute('lt_LT-reginute1-medium.onnx.json'), size: 5_000 },
      dictionary: { url: reginute('lt_kirciai.tsv'), size: 3_020_751 },
      letters: { url: reginute('lt_raides.tsv'), size: 1_665 },
      vocatives: { url: reginute('lt_kreipiniai.tsv'), size: 1_687 },
      shortWords: { url: reginute('zodziai_trumpi.txt'), size: 237_818 },
      espeakWasm: { url: ESPEAK_FILES.wasm, size: 18_485_010 },
    },
  },
];

export const voiceById = (id) => VOICES.find((v) => v.id === id) ?? VOICES[0];

export const voiceUrls = (voice) => Object.values(voice.files).map((f) => f.url);

export const voiceSizeMb = (voice) => Math.round(Object.values(voice.files).reduce((s, f) => s + f.size, 0) / 1e6);
