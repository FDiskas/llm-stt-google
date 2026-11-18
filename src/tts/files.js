// Downloads with progress, kept in this site's Cache Storage (shared by the
// page and the worker), so every file is fetched only once.

const CACHE_NAME = 'tts-cache';

const openCache = () => caches.open(CACHE_NAME);

export async function isCached(urls) {
  const cache = await openCache();
  const hits = await Promise.all(urls.map((u) => cache.match(u)));
  return hits.every(Boolean);
}

export async function removeCached(urls) {
  const cache = await openCache();
  await Promise.all(urls.map((u) => cache.delete(u)));
}

/** Reads a response body, reporting received bytes. */
async function readWithProgress(response, onBytes) {
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onBytes(received);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return bytes.buffer;
}

/**
 * Fetches `files` ([{ url, size }], size in bytes as an estimate for progress)
 * from the cache or the network. onProgress(fraction, loadedBytes, totalBytes).
 * Returns the ArrayBuffers in the same order.
 */
export async function fetchAll(files, onProgress) {
  const cache = await openCache();
  const total = files.reduce((s, f) => s + f.size, 0);
  let done = 0;
  const out = [];
  for (const { url, size } of files) {
    let response = await cache.match(url);
    let storing = null;
    if (!response) {
      response = await fetch(url);
      if (!response.ok) throw new Error(`Nepavyko atsisiųsti ${url}: HTTP ${response.status}`);
      // Not awaited here: the cache consumes its copy while we read ours with progress.
      storing = cache.put(url, response.clone());
    }
    const buffer = await readWithProgress(response, (bytes) => {
      const loaded = done + Math.min(bytes, size);
      onProgress(loaded / total, loaded, total);
    });
    await storing;
    done += size;
    out.push(buffer);
  }
  onProgress(1, total, total);
  return out;
}
