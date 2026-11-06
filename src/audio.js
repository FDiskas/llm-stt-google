// Audio capture and buffer helpers. All clips are normalised to 16 kHz mono,
// which is what speech models expect and keeps prompt payloads small.

export const TARGET_RATE = 16000;

export class Recorder {
  get active() {
    return this.mediaRecorder?.state === 'recording';
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream);
    this.mediaRecorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.mediaRecorder.start();
  }

  stop() {
    return new Promise((resolve) => {
      this.mediaRecorder.onstop = () => {
        this.stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(this.chunks, { type: this.mediaRecorder.mimeType }));
      };
      this.mediaRecorder.stop();
    });
  }
}

/** Calls onLevel(0..1) every animation frame with the stream's loudness. Returns a stop function. */
export function createLevelMeter(stream, onLevel) {
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let frame;
  const tick = () => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const v of samples) sum += v * v;
    onLevel(Math.min(1, Math.sqrt(sum / samples.length) * 5));
    frame = requestAnimationFrame(tick);
  };
  tick();
  return () => {
    cancelAnimationFrame(frame);
    ctx.close();
  };
}

export function makeBuffer(samples, sampleRate = TARGET_RATE) {
  const buffer = new AudioBuffer({ length: Math.max(1, samples.length), numberOfChannels: 1, sampleRate });
  buffer.copyToChannel(samples, 0);
  return buffer;
}

/** Decode any browser-playable audio/video blob into a 16 kHz mono AudioBuffer. */
export async function decodeAudio(blob) {
  // decodeAudioData resamples to the context's sample rate.
  const ctx = new OfflineAudioContext(1, 1, TARGET_RATE);
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  const mono = new Float32Array(decoded.length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const channel = decoded.getChannelData(c);
    for (let i = 0; i < channel.length; i++) mono[i] += channel[i] / decoded.numberOfChannels;
  }
  return makeBuffer(mono, decoded.sampleRate);
}

export function padWithSilence(buffer, seconds) {
  const out = new Float32Array(buffer.length + Math.round(seconds * buffer.sampleRate));
  out.set(buffer.getChannelData(0));
  return makeBuffer(out, buffer.sampleRate);
}

/**
 * Split a buffer into chunks of roughly `targetSec`, cutting at the quietest
 * 30 ms window within ±`searchSec` of each boundary so words are not split.
 */
export function splitAtSilence(buffer, targetSec, searchSec = 3) {
  const data = buffer.getChannelData(0);
  const rate = buffer.sampleRate;
  const target = Math.max(5, targetSec) * rate;
  const search = Math.min(searchSec * rate, target / 2);
  const win = Math.round(0.03 * rate);
  const step = Math.max(1, win >> 1);
  const chunks = [];
  let start = 0;

  while (data.length - start > target * 1.25) {
    const ideal = start + target;
    let best = ideal;
    let bestEnergy = Infinity;
    const end = Math.min(data.length - win, ideal + search);
    for (let p = ideal - search; p < end; p += step) {
      let energy = 0;
      for (let i = p; i < p + win; i++) energy += data[i] * data[i];
      if (energy < bestEnergy) { bestEnergy = energy; best = p; }
    }
    chunks.push(makeBuffer(data.slice(start, best), rate));
    start = best;
  }
  chunks.push(makeBuffer(data.slice(start), rate));
  return chunks;
}
