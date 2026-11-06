// localStorage persistence. Every access is guarded: storage can be blocked
// (private windows, site-data settings) and the app must still work.

const KEYS = {
  history: 'sttBench.v2.history',
  samples: 'sttBench.v2.samples',
  prefs: 'sttBench.v2.prefs',
};
const LEGACY = { history: 'ltSttBench.v1', samples: 'ltSttBench.samples.v1' };
const MAX_RUNS = 500;

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

function remove(key) {
  try { localStorage.removeItem(key); } catch { /* storage blocked */ }
}

// ---------- history (clips + runs + votes) ----------

export function loadHistory() {
  const current = read(KEYS.history);
  if (current?.clips && Array.isArray(current.runs)) return current;

  // Earlier version stored Lithuanian-only results under another key.
  const legacy = read(LEGACY.history);
  if (legacy?.clips && Array.isArray(legacy.results)) {
    const migrated = {
      clips: Object.fromEntries(Object.entries(legacy.clips).map(([id, c]) => [id, { lang: 'lt', ...c }])),
      runs: legacy.results.map((r) => ({ lang: 'lt', engineId: r.engine, ...r })),
    };
    write(KEYS.history, migrated);
    return migrated;
  }
  return { clips: {}, runs: [] };
}

/** Saves, dropping clips that no run refers to (except `keepClipIds`). */
export function saveHistory(history, keepClipIds = []) {
  const runs = history.runs.slice(0, MAX_RUNS);
  const used = new Set([...runs.map((r) => r.clipId), ...keepClipIds]);
  const clips = Object.fromEntries(Object.entries(history.clips).filter(([id]) => used.has(id)));
  return write(KEYS.history, { clips, runs });
}

// ---------- phrases ----------

export function loadSamples(lang, defaults) {
  let saved = read(KEYS.samples)?.[lang];
  if (!saved && lang === 'lt') saved = read(LEGACY.samples);
  return defaults.map((d, i) => (Array.isArray(saved) && typeof saved[i] === 'string' ? saved[i] : d));
}

export function saveSamples(lang, samples) {
  const all = read(KEYS.samples) ?? {};
  all[lang] = samples;
  return write(KEYS.samples, all);
}

export function resetSamples(lang) {
  const all = read(KEYS.samples) ?? {};
  delete all[lang];
  write(KEYS.samples, all);
  if (lang === 'lt') remove(LEGACY.samples);
}

// ---------- preferences ----------

export function loadPrefs(defaults) {
  const saved = read(KEYS.prefs);
  if (!saved || typeof saved !== 'object') return structuredClone(defaults);
  return {
    ...defaults,
    ...saved,
    include: { ...defaults.include, ...saved.include },
    phrase: { ...defaults.phrase, ...saved.phrase },
  };
}

export const savePrefs = (prefs) => write(KEYS.prefs, prefs);
