// 16-bit PCM WAV encoding.

/** @param {Float32Array[]} channels  one array per channel, equal lengths */
export function encodeWav(channels, sampleRate) {
  const frames = channels[0].length;
  const blockAlign = channels.length * 2;
  const view = new DataView(new ArrayBuffer(44 + frames * blockAlign));
  const text = (offset, s) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));

  text(0, 'RIFF');
  view.setUint32(4, 36 + frames * blockAlign, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * blockAlign, true);

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (const channel of channels) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

/** Drops trailing samples quieter than `db` (effect tails that have died out). */
export function trimTail(channels, sampleRate, db = -60) {
  const threshold = 10 ** (db / 20);
  let end = channels[0].length;
  while (end > 0 && channels.every((c) => Math.abs(c[end - 1]) < threshold)) end--;
  const keep = Math.min(channels[0].length, end + Math.round(sampleRate * 0.05));
  return channels.map((c) => c.subarray(0, keep));
}
