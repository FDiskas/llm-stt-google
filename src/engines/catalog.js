// The engines the wizard compares. Each one reads the current language and
// preferences through getCtx(), so it always follows the user's choices.

import { ModelController } from './model.js';
import * as WS from './webSpeech.js';
import * as PA from './promptApi.js';
import * as PK from './parakeet.js';
import { shortHash } from '../util.js';

const finalize = (ms) => (ms != null ? ` + ${(ms / 1000).toFixed(1)} s` : '');

function webSpeechLocal(getCtx) {
  const ctrl = new ModelController();
  let seq = 0;
  let poll = null;
  const options = () => {
    const { language, prefs } = getCtx();
    return { lang: language.bcp47, quality: prefs.quality, processLocally: true };
  };

  const engine = {
    id: 'ws-local',
    name: 'Chrome kalbos atpažinimas',
    kind: 'device',
    description: 'Chrome integruotas kalbos atpažinimas, veikiantis be interneto. Kiekvienai kalbai reikia atskiro kalbos paketo.',
    ctrl,
    isUsable: (s) => s.status === 'ready',
    configLabel: () => `${options().lang} · ${options().quality}`,
    languageNote: () => null,

    async refresh() {
      if (!WS.onDeviceApi) {
        ctrl.update({ status: 'unsupported', progress: null, detail: 'Šioje naršyklėje nėra įrenginyje veikiančio atpažinimo (reikia Chrome 139+).' });
        return;
      }
      if (ctrl.getSnapshot().busy) return; // an install is in progress and reports its own status
      const mine = ++seq;
      ctrl.update({ status: 'checking', progress: null, detail: '' });
      const status = await WS.availability(options());
      if (mine !== seq) return; // language changed meanwhile
      const { language } = getCtx();
      const map = {
        available: ['ready', 'Kalbos paketas įdiegtas.'],
        downloadable: ['downloadable', 'Reikia atsisiųsti kalbos paketą.'],
        downloading: ['downloading', 'Chrome siunčia kalbos paketą…'],
        unavailable: ['unsupported', `Chrome neturi ${language.gen} kalbos paketo įrenginyje.`],
      };
      const [next, detail] = map[status] ?? ['error', `Nežinoma būsena: ${status}`];
      ctrl.update({ status: next, detail, progress: next === 'downloading' ? 'indeterminate' : null });
      if (next === 'downloading' && !poll && !ctrl.getSnapshot().busy) {
        poll = setInterval(async () => {
          const now = await WS.availability(options()).catch(() => 'error');
          if (now !== 'downloading') {
            clearInterval(poll);
            poll = null;
            ctrl.act(() => engine.refresh());
          }
        }, 2000);
      }
    },

    async download() {
      const t0 = performance.now();
      const detail = () => `Siunčiamas kalbos paketas… ${Math.round((performance.now() - t0) / 1000)} s (Chrome nerodo procentų)`;
      ctrl.update({ busy: true, status: 'downloading', progress: 'indeterminate', detail: detail() });
      const tick = setInterval(() => ctrl.update({ detail: detail() }), 1000);
      let ok;
      try {
        ok = await WS.install(options());
      } finally {
        clearInterval(tick);
        ctrl.update({ busy: false, progress: null });
      }
      await engine.refresh();
      if (!ok) ctrl.update({ status: 'error', detail: 'Nepavyko įdiegti kalbos paketo.' });
    },

    async run(buffer, { onUpdate }) {
      const r = await WS.transcribeBuffer(buffer, { ...options(), onUpdate });
      return { text: r.text, error: r.error, timing: `realiu laiku${finalize(r.endLatencyMs)}`, seconds: null };
    },
  };
  return engine;
}

function geminiNano(getCtx) {
  const ctrl = new ModelController();
  let seq = 0;
  let session = null;
  let sessionLang = null;
  let loading = null;
  const language = () => getCtx().language;
  const prompt = () => getCtx().prefs.prompt?.trim() || PA.defaultPrompt(language());

  const drop = () => {
    session?.destroy();
    session = null;
    sessionLang = null;
  };

  const ensureSession = () => {
    if (session && sessionLang === language().code) return Promise.resolve(session);
    drop();
    loading ??= (async () => {
      const onDisk = ctrl.getSnapshot().status === 'ready';
      ctrl.update({
        busy: true,
        status: onDisk ? 'ready' : 'downloading',
        progress: 'indeterminate',
        detail: onDisk ? 'Įkeliama į atmintį…' : 'Pradedamas siuntimas…',
      });
      try {
        const lang = language();
        const created = await PA.createSession(lang, (loaded) => {
          if (onDisk || loaded >= 1) {
            ctrl.update({ progress: 'indeterminate', detail: onDisk ? 'Įkeliama į atmintį…' : 'Atsisiųsta. Įkeliama į atmintį…' });
          } else {
            ctrl.update({ progress: loaded, detail: `Siunčiamas modelis… ${(loaded * 100).toFixed(1)} %` });
          }
        });
        session = created;
        sessionLang = lang.code;
        ctrl.update({ busy: false, status: 'loaded', progress: null, detail: 'Modelis atsisiųstas ir įkeltas į atmintį.' });
        return created;
      } finally {
        loading = null;
        if (ctrl.getSnapshot().busy) ctrl.update({ busy: false, progress: null });
      }
    })();
    return loading;
  };

  const engine = {
    id: 'nano',
    name: 'Gemini Nano',
    kind: 'device',
    size: '~4 GB',
    description: 'Chrome integruotas DI modelis. Gauna įrašą su instrukcija jį pažodžiui perrašyti.',
    ctrl,
    isUsable: (s) => s.status === 'ready' || s.status === 'loaded',
    get loaded() { return !!session; },
    configLabel: () => {
      const { prefs } = getCtx();
      return [
        PA.isOfficial(language().code) ? `kalba ${language().code}` : 'deklaruota kaip en',
        prefs.chunkSec ? `${prefs.chunkSec} s dalys` : 'visas įrašas',
        prefs.prompt?.trim() ? `instrukcija #${shortHash(prefs.prompt.trim())}` : '',
      ].filter(Boolean).join(' · ');
    },
    languageNote: () => (PA.isOfficial(language().code)
      ? null
      : `Gemini Nano oficialiai palaiko tik anglų, vokiečių, ispanų, prancūzų ir japonų kalbas. ${language().name} bus bandoma per instrukciją, todėl rezultatai gali būti prasti.`),

    async refresh() {
      if (!PA.supported) {
        ctrl.update({ status: 'unsupported', progress: null, detail: 'Šioje naršyklėje nėra Prompt API (LanguageModel). Reikia stalinio Chrome 138+.' });
        return;
      }
      if (ctrl.getSnapshot().busy) return;
      if (session && sessionLang !== language().code) drop();
      const mine = ++seq;
      ctrl.update({ status: 'checking', progress: null, detail: '' });
      const status = await PA.availability(language());
      if (mine !== seq) return;
      if (session) {
        ctrl.update({ status: 'loaded', detail: 'Modelis atsisiųstas ir įkeltas į atmintį.' });
        return;
      }
      const map = {
        available: ['ready', 'Modelis atsisiųstas.'],
        downloadable: ['downloadable', 'Modelis dar neatsisiųstas (~4 GB).'],
        downloading: ['downloading', 'Chrome siunčia modelį fone. Spausk „Sekti progresą“.'],
        unavailable: ['unsupported', 'Šis įrenginys nepalaiko Gemini Nano su garso įvestimi (reikia GPU su daugiau nei 4 GB VRAM).'],
      };
      const [next, detail] = map[status] ?? ['error', `Nežinoma būsena: ${status}`];
      ctrl.update({ status: next, detail });
    },

    download: () => ensureSession(),

    async unload() {
      drop();
      await engine.refresh();
    },

    async run(buffer, { onUpdate, signal }) {
      const base = await ensureSession();
      const t0 = performance.now();
      const text = await PA.transcribe(base, language(), buffer, {
        prompt: prompt(),
        chunkSec: getCtx().prefs.chunkSec,
        signal,
        onUpdate: (t) => onUpdate(t, ''),
      });
      const seconds = (performance.now() - t0) / 1000;
      return { text, error: null, timing: `${seconds.toFixed(1)} s`, seconds };
    },
  };
  return engine;
}

function webSpeechCloud(getCtx) {
  const ctrl = new ModelController();
  const lang = () => getCtx().language.bcp47;
  return {
    id: 'ws-cloud',
    name: 'Google debesis',
    kind: 'cloud',
    description: 'Tas pats Chrome atpažinimas, bet vykdomas Google serveriuose. Garsas siunčiamas į Google, todėl naudok jį palyginimui.',
    ctrl,
    isUsable: (s) => s.status === 'cloud',
    configLabel: () => lang(),
    languageNote: () => null,
    async refresh() {
      ctrl.update(WS.supported
        ? { status: 'cloud', progress: null, detail: 'Atsisiųsti nereikia, bet reikia interneto.' }
        : { status: 'unsupported', progress: null, detail: 'Šioje naršyklėje nėra SpeechRecognition.' });
    },
    async run(buffer, { onUpdate }) {
      const r = await WS.transcribeBuffer(buffer, { lang: lang(), processLocally: false, onUpdate });
      return { text: r.text, error: r.error, timing: `realiu laiku${finalize(r.endLatencyMs)}`, seconds: null };
    },
  };
}

/** A Parakeet TDT ONNX model from Hugging Face, run with parakeet.js (WebGPU or WASM). */
function parakeet(getCtx, { id, name, repoId, description, onlyLang }) {
  const ctrl = new ModelController();
  let runtime = null;
  let model = null;
  let loading = null;

  const ensureModel = () => {
    if (model) return Promise.resolve(model);
    loading ??= (async () => {
      runtime ??= await PK.pickRuntime();
      const cached = ctrl.getSnapshot().status === 'ready';
      ctrl.update({
        busy: true,
        status: cached ? 'ready' : 'downloading',
        progress: 'indeterminate',
        detail: cached ? 'Modelis įkeliamas iš talpyklos ir kompiliuojamas…' : 'Pradedamas siuntimas…',
      });
      try {
        const loaded = await PK.load(repoId, runtime, (fraction, detail) => {
          ctrl.update(fraction >= 1
            ? { progress: 'indeterminate', detail: 'Atsisiųsta. Modelis įkeliamas ir kompiliuojamas…' }
            : { progress: fraction, detail });
        });
        model = loaded;
        ctrl.update({ busy: false, status: 'loaded', progress: null, detail: `Modelis įkeltas į atmintį (${runtime.label}).` });
        return loaded;
      } finally {
        loading = null;
        if (ctrl.getSnapshot().busy) ctrl.update({ busy: false, progress: null });
      }
    })();
    return loading;
  };

  const engine = {
    id,
    name,
    kind: 'device',
    repoId,
    description,
    ctrl,
    isUsable: (s) => s.status === 'ready' || s.status === 'loaded',
    get size() { return runtime?.size; },
    get loaded() { return !!model; },
    configLabel: () => runtime?.label ?? '',
    languageNote: () => {
      const { language } = getCtx();
      return onlyLang && language.code !== onlyLang
        ? `Šis modelis apmokytas tik ${onlyLang === 'lt' ? 'lietuvių' : onlyLang} kalbai, todėl su ${language.gen} kalba rezultatai bus prasti.`
        : null;
    },

    async refresh() {
      if (!PK.supported) {
        ctrl.update({ status: 'unsupported', progress: null, detail: 'Šioje naršyklėje nėra WebAssembly arba IndexedDB.' });
        return;
      }
      if (ctrl.getSnapshot().busy) return;
      if (model) {
        ctrl.update({ status: 'loaded', detail: `Modelis įkeltas į atmintį (${runtime.label}).` });
        return;
      }
      ctrl.update({ status: 'checking', progress: null, detail: '' });
      runtime ??= await PK.pickRuntime();
      const cpuNote = runtime.backend === 'wasm' ? ' WebGPU su fp16 nepasiekiamas, todėl veiks per procesorių (lėčiau).' : '';
      ctrl.update(await PK.isCached(repoId, runtime)
        ? { status: 'ready', detail: `Modelis atsisiųstas (${runtime.label}).${cpuNote}` }
        : { status: 'downloadable', detail: `Modelis dar neatsisiųstas (${runtime.size}, ${runtime.label}).${cpuNote}` });
    },

    download: () => ensureModel(),

    async unload() {
      const current = model;
      model = null;
      await PK.release(current);
      await engine.refresh();
    },

    /** Removes the cached files from IndexedDB. */
    async remove() {
      await engine.unload();
      await PK.removeCached(repoId);
      await engine.refresh();
    },

    async run(buffer, { onUpdate, signal }) {
      const m = await ensureModel();
      signal?.throwIfAborted();
      const t0 = performance.now();
      const text = await PK.transcribe(m, buffer);
      const seconds = (performance.now() - t0) / 1000;
      onUpdate(text, '');
      return { text, error: null, timing: `${seconds.toFixed(1)} s`, seconds };
    },
  };
  return engine;
}

export function createEngines(getCtx) {
  return [
    geminiNano(getCtx),
    webSpeechLocal(getCtx),
    parakeet(getCtx, {
      id: 'parakeet-v3',
      name: 'Parakeet TDT 0.6B v3',
      repoId: 'ysdede/parakeet-tdt-0.6b-v3-onnx',
      description: 'Atviras NVIDIA kalbos atpažinimo modelis (25 Europos kalbos), veikiantis naršyklėje per WebGPU. Kalbą nustato pats, jos nurodyti negalima.',
    }),
    parakeet(getCtx, {
      id: 'parakeet-v3-lt',
      name: 'Parakeet TDT 0.6B v3 LT (Noctra)',
      repoId: 'fdiskas/parakeet-tdt-0.6b-v3-lt-onnx',
      onlyLang: 'lt',
      description: 'Tas pats Parakeet, Noctra Labs papildomai apmokytas lietuvių kalbai (LIEPA-3). Skirtas tik lietuvių kalbai, rašo mažosiomis raidėmis ir be skyrybos.',
    }),
    webSpeechCloud(getCtx),
  ];
}
