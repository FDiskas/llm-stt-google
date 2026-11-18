// Voice effects with the Web Audio API. One parameter set describes every
// effect; presets are just named parameter sets, and the same graph is used
// for live playback (AudioContext) and for the download (OfflineAudioContext).
//
// Pitch is the playback rate. With keepTempo the voice is synthesized that
// much slower first, so after the rate change only the pitch differs.

export const NEUTRAL_FX = {
  pitch: 1, // playback rate, 0.5–2
  keepTempo: true,
  highpass: 0, // Hz, 0 = off
  lowpass: 0, // Hz, 0 = off
  drive: 0, // distortion 0–1
  robot: 0, // ring modulator frequency, Hz, 0 = off
  echo: 0, // echo mix 0–1
  echoTime: 0.25, // s
  reverb: 0, // reverb mix 0–1
  room: 2, // reverb length, s
  rotate: 0, // 8D: turns per second around the head, 0 = off
  volume: 1,
};

const fx = (patch) => ({ ...NEUTRAL_FX, ...patch });

export const PRESETS = [
  { id: 'none', name: 'Be efekto', fx: fx({}) },
  { id: 'robot', name: 'Robotas', fx: fx({ robot: 55, drive: 0.15, highpass: 150 }) },
  { id: 'chipmunk', name: 'Burundukas', fx: fx({ pitch: 1.6 }) },
  { id: 'deep', name: 'Žemas balsas', fx: fx({ pitch: 0.72 }) },
  { id: 'telephone', name: 'Telefonas', fx: fx({ highpass: 400, lowpass: 3400, drive: 0.35 }) },
  { id: 'radio', name: 'Senas radijas', fx: fx({ highpass: 500, lowpass: 2800, drive: 0.55, reverb: 0.1, room: 0.5 }) },
  { id: '8d', name: '8D', fx: fx({ rotate: 0.15, reverb: 0.2, room: 1.5 }) },
  { id: 'slowed', name: 'Lėtai + aidas', fx: fx({ pitch: 0.85, keepTempo: false, reverb: 0.45, room: 3 }) },
  { id: 'nightcore', name: 'Nightcore', fx: fx({ pitch: 1.25, keepTempo: false }) },
  { id: 'shout', name: 'Šauksmas', fx: fx({ drive: 0.6, highpass: 250, volume: 1.2, echo: 0.15, echoTime: 0.12 }) },
  { id: 'demon', name: 'Demonas', fx: fx({ pitch: 0.62, drive: 0.4, lowpass: 2500, reverb: 0.25, room: 1.5 }) },
  { id: 'ghost', name: 'Vaiduoklis', fx: fx({ pitch: 1.06, highpass: 350, echo: 0.45, echoTime: 0.33, reverb: 0.55, room: 4 }) },
  { id: 'door', name: 'Už durų', fx: fx({ lowpass: 450, reverb: 0.2, room: 0.6, volume: 0.85 }) },
  { id: 'stadium', name: 'Stadionas', fx: fx({ highpass: 120, reverb: 0.5, room: 3.5, echo: 0.3, echoTime: 0.38 }) },
];

export const isNeutral = (p) => Object.keys(NEUTRAL_FX).every((k) => k === 'keepTempo' || p[k] === NEUTRAL_FX[k]);

/** Seconds of sound the effects add after the voice ends (echo and reverb tails). */
export const tailSeconds = (p) => (p.reverb ? p.room : 0) + (p.echo ? p.echoTime * 8 : 0) + 0.1;

function impulseResponse(ctx, seconds) {
  const length = Math.max(1, Math.round(ctx.sampleRate * seconds));
  const ir = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = ir.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  return ir;
}

function driveCurve(amount) {
  const k = amount * 60;
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

/** Wet/dry mix of `node`'s output into a new gain node. */
function mix(ctx, dry, wet, amount) {
  const out = ctx.createGain();
  const dryGain = new GainNode(ctx, { gain: 1 - amount * 0.5 });
  const wetGain = new GainNode(ctx, { gain: amount });
  dry.connect(dryGain).connect(out);
  wet.connect(wetGain).connect(out);
  return out;
}

/**
 * Builds the effect graph after `input` and returns its last node. Oscillators
 * are started at `startAt`; returns { output, stop() }.
 */
export function buildChain(ctx, input, p, startAt = 0) {
  const oscillators = [];
  let node = input;
  const then = (next) => { node = node.connect(next); };

  if (p.highpass) then(new BiquadFilterNode(ctx, { type: 'highpass', frequency: p.highpass, Q: 0.7 }));
  if (p.lowpass) then(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: p.lowpass, Q: 0.7 }));
  if (p.drive) {
    then(new WaveShaperNode(ctx, { curve: driveCurve(p.drive), oversample: '4x' }));
    then(new GainNode(ctx, { gain: 1 - p.drive * 0.45 }));
  }
  if (p.robot) {
    const ring = new GainNode(ctx, { gain: 0 });
    const osc = new OscillatorNode(ctx, { frequency: p.robot });
    osc.connect(ring.gain);
    oscillators.push(osc);
    then(ring);
    then(new GainNode(ctx, { gain: 1.6 }));
  }
  if (p.echo) {
    const delay = new DelayNode(ctx, { delayTime: p.echoTime, maxDelayTime: 2 });
    const feedback = new GainNode(ctx, { gain: Math.min(0.75, p.echo) });
    node.connect(delay);
    delay.connect(feedback).connect(delay);
    node = mix(ctx, node, delay, p.echo);
  }
  if (p.reverb) {
    const convolver = new ConvolverNode(ctx, { buffer: impulseResponse(ctx, p.room) });
    node.connect(convolver);
    node = mix(ctx, node, convolver, p.reverb);
  }
  if (p.rotate) {
    const panner = new StereoPannerNode(ctx);
    const osc = new OscillatorNode(ctx, { frequency: p.rotate });
    osc.connect(panner.pan);
    oscillators.push(osc);
    then(panner);
  }
  then(new GainNode(ctx, { gain: p.volume }));
  // A limiter keeps loud presets from clipping; the plain voice stays below it.
  then(new DynamicsCompressorNode(ctx, { threshold: -2, knee: 0, ratio: 20, attack: 0.003, release: 0.1 }));

  oscillators.forEach((o) => o.start(startAt));
  return { output: node, stop: () => oscillators.forEach((o) => { try { o.stop(); } catch { /* not started */ } }) };
}

/** Renders mono `samples` through the effects into a stereo AudioBuffer. */
export async function renderOffline(samples, sampleRate, p) {
  const rate = 44100;
  const seconds = samples.length / sampleRate / p.pitch + tailSeconds(p);
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
  const buffer = ctx.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(samples, 0);
  const source = new AudioBufferSourceNode(ctx, { buffer, playbackRate: p.pitch });
  const input = ctx.createGain();
  source.connect(input);
  buildChain(ctx, input, p).output.connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}

/**
 * Plays audio pieces as they arrive, through the effects, gaplessly.
 * onEnd() fires when everything pushed so far has been played and finish() was called.
 */
export class StreamPlayer {
  constructor(p, onEnd) {
    this.p = p;
    this.onEnd = onEnd;
    this.ctx = new AudioContext();
    this.input = this.ctx.createGain();
    this.chain = buildChain(this.ctx, this.input, p, this.ctx.currentTime);
    this.chain.output.connect(this.ctx.destination);
    this.nextTime = 0;
    this.pending = 0;
    this.finished = false;
  }

  push(samples, sampleRate) {
    const { ctx } = this;
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = new AudioBufferSourceNode(ctx, { buffer, playbackRate: this.p.pitch });
    source.connect(this.input);
    const at = Math.max(this.nextTime, ctx.currentTime + 0.05);
    source.start(at);
    this.nextTime = at + buffer.duration / this.p.pitch;
    this.pending++;
    source.onended = () => {
      this.pending--;
      this.#maybeEnd();
    };
  }

  /** No more pieces will come. */
  finish() {
    this.finished = true;
    this.#maybeEnd();
  }

  #maybeEnd() {
    if (!this.finished || this.pending || this.closed) return;
    // Let echo and reverb ring out before closing.
    setTimeout(() => {
      if (this.closed) return;
      this.stop();
      this.onEnd?.();
    }, tailSeconds(this.p) * 1000);
  }

  stop() {
    if (this.closed) return;
    this.closed = true;
    this.chain.stop();
    this.ctx.close();
  }
}
