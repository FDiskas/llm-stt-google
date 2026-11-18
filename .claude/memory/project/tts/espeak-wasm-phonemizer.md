---
name: espeak-wasm-phonemizer
description: Which eSpeak NG WASM build works for Lithuanian IPA in the browser, and the traps found choosing it
keywords: [tts, espeak, phonemizer, wasm, lithuanian, piper, reginute, worker, bun]
updated: 2026-11-18
---

### Rule / Fact
The TTS page phonemizes with the npm `espeak-ng@1.0.2` CLI build (WASM, all languages embedded, 18.5 MB), loaded from jsDelivr: the JS via a direct `import(url)`, the `.wasm` compiled once and passed through `instantiateWasm`. Each call re-instantiates the module (~35 ms); words are batched joined by ", ".

### Why
- `phonemizer` (xenova, used by kokoro-js) supports English only; rejected.
- `@echogarden/espeak-ng-emscripten` (24 MB data) only exposes IPA through synthesis events; more work, rejected.
- The `espeak-ng` build exports no `callMain`, so one instance cannot be reused; instantiation is cheap when the compiled module is reused.
- Joining words with ", " gave output identical to one call per word on a sample; plain spaces changed unstressed monosyllables (`ir` lost its stress mark).

### How to apply
- Pass `-b`, `1` as two arguments; `-b=1` is ignored and `ž` comes out as `aʒ`.
- Do not import espeak-ng.js from a blob URL: it computes the wasm path with `new URL('espeak-ng.wasm', import.meta.url)`, which throws on blob: bases.
- Bun's HTML bundler does not follow `new Worker(new URL(...))`; the worker is a separate build entry (`tts-worker.js`) and a dev-server route.
- Running the voice author's Python reference code was refused by the permission classifier; the JS port of `skaiciu_pletiklis.py` was checked by reading its output, not by diffing against Python.
