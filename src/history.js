// Run history, clips (reference texts) and votes. An observable store for React:
// subscribe() + getVersion() plug into useSyncExternalStore.

import * as store from './store.js';
import { score } from './metrics.js';
import { uid } from './util.js';

let data = store.loadHistory();
let version = 0;
let saved = true;
const listeners = new Set();
const pinnedClips = new Set();

function commit() {
  saved = store.saveHistory(data, [...pinnedClips]);
  version++;
  listeners.forEach((l) => l());
}

export const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getVersion = () => version;
export const isSaved = () => saved;

export function createClip({ lang, reference, duration, label }) {
  const id = uid();
  data.clips[id] = { id, lang, reference, duration, label, createdAt: Date.now() };
  pinnedClips.add(id);
  commit();
  return id;
}

export const getClip = (id) => data.clips[id];

export function setReference(clipId, text) {
  const clip = data.clips[clipId];
  if (!clip) return;
  clip.reference = text;
  commit();
}

/** run: { lang, clipId, batchId, engineId, engine, kind, config, text, error, timing, seconds, audioSec } */
export function addRun(run) {
  data.runs.unshift({ id: uid(), at: Date.now(), vote: 0, ...run });
  commit();
}

export function vote(id, value) {
  const run = data.runs.find((r) => r.id === id);
  if (!run) return;
  run.vote = run.vote === value ? 0 : value;
  commit();
}

export function removeRun(id) {
  data.runs = data.runs.filter((r) => r.id !== id);
  commit();
}

export function resetVotes() {
  data.runs.forEach((r) => { r.vote = 0; });
  commit();
}

export function clearAll() {
  data = { clips: Object.fromEntries([...pinnedClips].filter((id) => data.clips[id]).map((id) => [id, data.clips[id]])), runs: [] };
  commit();
}

export const runsFor = (lang) => data.runs.filter((r) => r.lang === lang);

export function latestBatch(lang) {
  const first = data.runs.find((r) => r.lang === lang && r.batchId);
  if (!first) return null;
  return {
    batchId: first.batchId,
    clip: data.clips[first.clipId],
    runs: data.runs.filter((r) => r.batchId === first.batchId),
  };
}

export function scoreOf(run) {
  const reference = data.clips[run.clipId]?.reference?.trim();
  return reference && run.text ? score(reference, run.text) : null;
}

/**
 * Groups runs of one language by engine (and optionally configuration).
 * Sorted by net votes, then lowest average WER.
 */
export function aggregate(lang, { byConfig = false } = {}) {
  const groups = new Map();
  for (const r of runsFor(lang)) {
    const key = byConfig ? `${r.engineId}\u0000${r.config}` : r.engineId;
    const g = groups.get(key) ?? {
      key, engineId: r.engineId, engine: r.engine, kind: r.kind, config: r.config,
      runs: 0, up: 0, down: 0, scored: 0, wer: 0, cer: 0, werNoDiacritics: 0,
    };
    g.runs++;
    if (r.vote > 0) g.up++;
    if (r.vote < 0) g.down++;
    const s = scoreOf(r);
    if (s) {
      g.scored++;
      g.wer += s.wer;
      g.cer += s.cer;
      g.werNoDiacritics += s.werNoDiacritics;
    }
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      net: g.up - g.down,
      avgWer: g.scored ? g.wer / g.scored : null,
      avgCer: g.scored ? g.cer / g.scored : null,
      avgWerNoDiacritics: g.scored ? g.werNoDiacritics / g.scored : null,
    }))
    .sort((a, b) => b.net - a.net || (a.avgWer ?? Infinity) - (b.avgWer ?? Infinity));
}
