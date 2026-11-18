// eSpeak NG (GPL-3.0) compiled to WebAssembly, used only as a text -> IPA
// phonemizer. The npm "espeak-ng" build is the espeak-ng command line program,
// so every call instantiates the module and runs main(); the compiled
// WebAssembly.Module is reused, which keeps a call around 35 ms.

const VERSION = '1.0.2';
const BASE = `https://cdn.jsdelivr.net/npm/espeak-ng@${VERSION}/dist`;
export const ESPEAK_FILES = { module: `${BASE}/espeak-ng.js`, wasm: `${BASE}/espeak-ng.wasm` };

// Joining words with ", " makes each one its own clause, so eSpeak phonemizes
// them exactly as it would one at a time (checked on a sample of words);
// plain spaces would let it change unstressed monosyllables.
const SEPARATOR = ', ';
const BATCH = 150;

/**
 * @param {string} moduleUrl  URL of espeak-ng.js (an ES module)
 * @param {ArrayBuffer} wasmBytes  contents of espeak-ng.wasm
 * @param {string} voice  eSpeak voice, e.g. "lt"
 */
export async function createEspeak(moduleUrl, wasmBytes, voice) {
  const { default: factory } = await import(/* @vite-ignore */ moduleUrl);
  const compiled = await WebAssembly.compile(wasmBytes);

  async function run(text) {
    const instance = await factory({
      // "-b 1" (UTF-8 input) must be two arguments: "-b=1" is ignored and "ž" turns into "aʒ".
      arguments: ['--phonout', 'out', '-q', '-b', '1', '--ipa', '-v', voice, text],
      instantiateWasm: (imports, done) => {
        WebAssembly.instantiate(compiled, imports).then((inst) => done(inst, compiled));
        return {};
      },
      print: () => {},
      printErr: () => {},
    });
    return instance.FS.readFile('out', { encoding: 'utf8' });
  }

  // eSpeak marks a switch to another language as "(en)…(lt)"; drop the markers.
  const tokens = (ipa) => ipa.replace(/\([^)]*\)/g, ' ').split(/[\s,]+/).filter(Boolean);

  /** IPA for each word (letters and digits only, no spaces). */
  async function phonemizeWords(words) {
    const out = [];
    for (let i = 0; i < words.length; i += BATCH) {
      const batch = words.slice(i, i + BATCH);
      const result = tokens(await run(batch.join(SEPARATOR)));
      if (result.length === batch.length) {
        out.push(...result);
        continue;
      }
      // A word eSpeak split or merged (e.g. digits): fall back to one call per word.
      for (const word of batch) out.push(tokens(await run(word)).join(' '));
    }
    return out;
  }

  return { phonemizeWords };
}
