const VOLUME = 0.5;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let hiss: AudioBuffer | null = null;
let muted = false;

export function setMuted(value: boolean): void {
  muted = value;
  if (master) master.gain.value = value ? 0 : VOLUME;
}

// Browsers only start an audio context from a user gesture, so every sound has to be the answer to a press.
function output(): { ctx: AudioContext; master: GainNode } | null {
  if (muted) return null;
  if (!ctx || !master) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = VOLUME;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.ratio.value = 8;
    master.connect(limiter).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, master };
}

function envelope(ctx: AudioContext, at: number, gain: number, attack: number, decay: number): GainNode {
  const node = ctx.createGain();
  node.gain.setValueAtTime(0.0001, at);
  node.gain.linearRampToValueAtTime(gain, at + attack);
  node.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  return node;
}

export interface Tone {
  freq: number;
  to?: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  decay: number;
  at?: number;
  tremolo?: number;
}

export function tone(spec: Tone): void {
  const out = output();
  if (!out) return;
  const { ctx, master } = out;
  const at = ctx.currentTime + (spec.at ?? 0);
  const attack = spec.attack ?? 0.004;
  const end = at + attack + spec.decay;

  const osc = ctx.createOscillator();
  osc.type = spec.type ?? 'sine';
  osc.frequency.setValueAtTime(spec.freq, at);
  if (spec.to) osc.frequency.exponentialRampToValueAtTime(spec.to, end);

  const env = envelope(ctx, at, spec.gain ?? 0.2, attack, spec.decay);
  osc.connect(env);

  if (spec.tremolo) {
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    const wobble = ctx.createOscillator();
    wobble.frequency.value = spec.tremolo;
    const shaped = ctx.createGain();
    shaped.gain.value = 0.5;
    wobble.connect(depth).connect(shaped.gain);
    env.connect(shaped).connect(master);
    wobble.start(at);
    wobble.stop(end + 0.05);
  } else {
    env.connect(master);
  }

  osc.start(at);
  osc.stop(end + 0.05);
}

export interface Noise {
  decay: number;
  gain?: number;
  attack?: number;
  at?: number;
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
}

export function noise(spec: Noise): void {
  const out = output();
  if (!out) return;
  const { ctx, master } = out;
  if (!hiss) {
    hiss = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = hiss.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const at = ctx.currentTime + (spec.at ?? 0);
  const attack = spec.attack ?? 0.003;
  const end = at + attack + spec.decay;

  const src = ctx.createBufferSource();
  src.buffer = hiss;
  src.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = spec.filter ?? 'bandpass';
  filter.frequency.setValueAtTime(spec.freq ?? 1200, at);
  if (spec.to) filter.frequency.exponentialRampToValueAtTime(spec.to, end);
  filter.Q.value = spec.q ?? 1;

  src.connect(filter).connect(envelope(ctx, at, spec.gain ?? 0.2, attack, spec.decay)).connect(master);
  src.start(at, Math.random() * 0.5);
  src.stop(end + 0.05);
}

export const sfx = {
  bell(at = 0): void {
    noise({ at, decay: 0.012, gain: 0.25, filter: 'highpass', freq: 3000 });
    tone({ at, freq: 2093, decay: 1.7, gain: 0.2 });
    tone({ at, freq: 4186 * 1.004, decay: 0.9, gain: 0.07 });
    tone({ at, freq: 5640, decay: 0.5, gain: 0.05 });
    tone({ at, freq: 8372 * 1.01, decay: 0.25, gain: 0.03 });
  },

  key(at = 0): void {
    noise({ at, decay: 0.022, gain: 0.16, filter: 'bandpass', freq: 2400 + Math.random() * 900, q: 1.4 });
    tone({ at, freq: 150, to: 90, decay: 0.03, gain: 0.07, type: 'triangle' });
  },

  beep(freq = 880, at = 0, length = 0.09): void {
    tone({ at, freq, decay: length, attack: 0.002, gain: 0.07, type: 'square' });
  },

  drawer(at = 0, gain = 1): void {
    noise({ at, attack: 0.12, decay: 0.3, gain: 0.1 * gain, filter: 'bandpass', freq: 520, to: 880, q: 1.2 });
    tone({ at: at + 0.4, freq: 110, to: 70, decay: 0.07, gain: 0.14 * gain, type: 'triangle' });
  },

  shut(at = 0, gain = 1): void {
    noise({ at, decay: 0.05, gain: 0.14 * gain, filter: 'lowpass', freq: 900 });
    tone({ at, freq: 95, to: 60, decay: 0.09, gain: 0.18 * gain, type: 'triangle' });
  },

  rattle(at = 0): void {
    for (const [dt, gain] of [[0, 1], [0.11, 0.7], [0.2, 0.85], [0.36, 0.5]]) {
      noise({ at: at + dt, decay: 0.035, gain: 0.2 * gain, filter: 'bandpass', freq: 1700, q: 2.5 });
      tone({ at: at + dt, freq: 240, to: 150, decay: 0.06, gain: 0.16 * gain, type: 'square' });
    }
  },

  clunk(at = 0): void {
    noise({ at, decay: 0.03, gain: 0.2, filter: 'lowpass', freq: 1400 });
    tone({ at, freq: 130, to: 62, decay: 0.12, gain: 0.3, type: 'triangle' });
  },

  click(at = 0): void {
    noise({ at, decay: 0.012, gain: 0.18, filter: 'highpass', freq: 2200 });
  },

  flap(at = 0): void {
    noise({ at, decay: 0.018, gain: 0.13, filter: 'bandpass', freq: 3200, q: 0.8 });
    tone({ at, freq: 420, to: 260, decay: 0.02, gain: 0.05, type: 'triangle' });
  },

  alarm(rounds = 3, at = 0): void {
    for (let i = 0; i < rounds; i++) {
      tone({ at: at + i * 0.44, freq: 880, decay: 0.2, attack: 0.01, gain: 0.07, type: 'square' });
      tone({ at: at + i * 0.44 + 0.22, freq: 660, decay: 0.2, attack: 0.01, gain: 0.07, type: 'square' });
    }
  },

  buzzer(at = 0): void {
    tone({ at, freq: 118, decay: 0.5, attack: 0.01, gain: 0.12, type: 'sawtooth' });
    tone({ at, freq: 121, decay: 0.5, attack: 0.01, gain: 0.1, type: 'square' });
  },

  chime(at = 0): void {
    tone({ at, freq: 1318.5, decay: 0.5, gain: 0.12 });
    tone({ at: at + 0.13, freq: 1760, decay: 0.8, gain: 0.12 });
  },

  growl(at = 0): void {
    tone({ at, freq: 74, to: 62, attack: 0.08, decay: 0.9, gain: 0.3, type: 'sawtooth', tremolo: 31 });
    noise({ at, attack: 0.08, decay: 0.8, gain: 0.07, filter: 'bandpass', freq: 420, q: 0.7 });
  },

  bark(at = 0): void {
    tone({ at, freq: 310, to: 150, attack: 0.008, decay: 0.13, gain: 0.3, type: 'sawtooth' });
    noise({ at, decay: 0.11, gain: 0.16, filter: 'bandpass', freq: 950, to: 520, q: 0.9 });
  },

  whine(at = 0): void {
    tone({ at, freq: 620, to: 930, attack: 0.05, decay: 0.24, gain: 0.07, type: 'triangle' });
    tone({ at: at + 0.3, freq: 700, to: 1080, attack: 0.05, decay: 0.3, gain: 0.06, type: 'triangle' });
  },

  whir(length = 1.6, at = 0): void {
    noise({ at, attack: 0.05, decay: length, gain: 0.07, filter: 'bandpass', freq: 1500, to: 240, q: 3 });
  },

  chain(at = 0): void {
    for (let i = 0; i < 4; i++) {
      noise({ at: at + i * 0.028, decay: 0.03, gain: 0.13, filter: 'bandpass', freq: 3100 + i * 380, q: 5 });
    }
  },
};
