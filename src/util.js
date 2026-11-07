export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function formatClock(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const pct = (v) => `${Math.round(v * 1000) / 10} %`;

export function chromeMajorVersion() {
  const brand = navigator.userAgentData?.brands?.find(
    (b) => /Chrom/.test(b.brand) && !/Not/.test(b.brand),
  );
  if (brand) return Number(brand.version);
  const match = navigator.userAgent.match(/Chrome\/(\d+)/);
  return match ? Number(match[1]) : null;
}

let gpuPromise = null;
/** WebGPU capability of this device: 'f16' (shader-f16), 'basic' or null (no WebGPU). */
export function webGpuSupport() {
  gpuPromise ??= (async () => {
    try {
      const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return null;
      return adapter.features.has('shader-f16') ? 'f16' : 'basic';
    } catch {
      return null;
    }
  })();
  return gpuPromise;
}

/** Rejects with `message` if `promise` doesn't settle within `ms`. */
export function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]);
}

/** Short stable tag for a string, e.g. to label a custom prompt. */
export function shortHash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36).slice(0, 5);
}

let toastTimer;
export function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

export async function copyText(text, button) {
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Nukopijuota';
  } catch {
    button.textContent = 'Nepavyko';
  }
  setTimeout(() => { button.textContent = label; }, 1500);
}

/** progress: null (hidden) | 'indeterminate' | number 0..1, rendered into a .bar element. */
export function applyProgress(bar, progress) {
  if (!bar) return;
  bar.hidden = progress == null;
  bar.classList.toggle('indeterminate', progress === 'indeterminate');
  const fill = bar.firstElementChild;
  if (fill) fill.style.width = typeof progress === 'number' ? `${Math.max(2, progress * 100)}%` : '';
}
