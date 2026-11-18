// Page-side handle to the TTS worker. Load state is exposed through a
// ModelController, the same observable the speech-to-text engines use.

import { ModelController } from '../engines/model.js';
import { isCached, removeCached } from './files.js';
import { voiceUrls } from './voices.js';

export function createTtsClient(voice) {
  const ctrl = new ModelController();
  let worker = null;
  let nextId = 1;
  let sampleRate = null;
  const jobs = new Map(); // id -> { onPiece, resolve, reject }
  let loading = null; // { resolve, reject }

  function onMessage({ data }) {
    const job = jobs.get(data.id);
    switch (data.type) {
      case 'progress':
        ctrl.update({ status: 'downloading', progress: data.fraction, detail: data.detail });
        break;
      case 'ready':
        sampleRate = data.sampleRate;
        ctrl.update({ status: 'loaded', progress: null, detail: '', busy: false });
        loading?.resolve();
        loading = null;
        break;
      case 'piece':
        job?.onPiece(data);
        break;
      case 'done':
        jobs.delete(data.id);
        job?.resolve({ ...data.stats, cancelled: data.cancelled });
        break;
      case 'error':
        if (job) {
          jobs.delete(data.id);
          job.reject(new Error(data.message));
        } else {
          loading?.reject(new Error(data.message));
          loading = null;
        }
        break;
      default:
    }
  }

  function ensureWorker() {
    if (worker) return worker;
    // Built as its own entry point (see package.json and server.js), next to the page.
    worker = new Worker(new URL('tts-worker.js', document.baseURI), { type: 'module' });
    worker.onmessage = onMessage;
    worker.onerror = (e) => {
      e.preventDefault();
      ctrl.update({ status: 'error', busy: false, progress: null, detail: e.message || 'Worker klaida' });
      loading?.reject(new Error(e.message));
      loading = null;
    };
    return worker;
  }

  async function refresh() {
    if (ctrl.getSnapshot().status === 'loaded' || loading) return;
    ctrl.update({ status: 'checking' });
    ctrl.update({ status: (await isCached(voiceUrls(voice))) ? 'ready' : 'downloadable' });
  }

  /** Downloads (or reads from cache) and prepares the voice. */
  function load() {
    if (sampleRate) return Promise.resolve();
    if (loading) return loading.promise;
    ctrl.update({ busy: true, status: 'downloading', progress: 0, detail: '' });
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    loading = { promise, resolve, reject };
    ensureWorker().postMessage({ type: 'load', voice });
    return promise.catch((err) => {
      ctrl.update({ status: 'error', busy: false, progress: null, detail: err.message });
      throw err;
    });
  }

  /**
   * Speaks `text`; onPiece({ audio, text, ipa }) gets each piece as soon as it
   * is ready. Returns { done: Promise<stats>, cancel() }.
   */
  function speak(text, opts, onPiece) {
    const id = nextId++;
    const done = new Promise((resolve, reject) => jobs.set(id, { onPiece, resolve, reject }));
    worker.postMessage({ type: 'speak', id, text, opts });
    return { done, cancel: () => worker.postMessage({ type: 'cancel', id }) };
  }

  /** Stops the worker (frees its memory) and deletes the downloaded files. */
  async function remove() {
    worker?.terminate();
    worker = null;
    sampleRate = null;
    jobs.clear();
    await removeCached(voiceUrls(voice));
    ctrl.update({ status: 'downloadable', progress: null, detail: '', busy: false });
  }

  return {
    ctrl,
    voice,
    get sampleRate() { return sampleRate; },
    refresh: () => ctrl.act(refresh),
    load,
    speak,
    remove: () => ctrl.act(remove),
  };
}
