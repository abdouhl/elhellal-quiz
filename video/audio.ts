/**
 * Procedural soundtrack for quiz videos: a music bed that follows the video's sections
 * (full beat → stripped-down tension during the countdown → impact and drop on the reveal),
 * plus a separate sound-effects track. Everything is synthesized, so there is nothing to license.
 */
export const SR = 48000;

export interface Timeline {
    qIn: number;
    optsIn: number[];
    cdStart: number;
    cdLen: number;
    reveal: number;
    fact: number;
    cta: number;
    end: number;
}

export type Stereo = [Float32Array, Float32Array];

function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
const buf = (dur: number): Stereo => [new Float32Array(Math.ceil(dur * SR)), new Float32Array(Math.ceil(dur * SR))];

/** Adds a mono voice `fn(t)` into `out` at `at` seconds, panned -1…1. */
function put(out: Stereo, at: number, len: number, fn: (t: number) => number, gain = 1, pan = 0) {
    const s0 = Math.round(at * SR), n = Math.round(len * SR);
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4), gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < n; i++) {
        const j = s0 + i;
        if (j < 0 || j >= out[0].length) continue;
        const v = fn(i / SR);
        out[0][j] += v * gl;
        out[1][j] += v * gr;
    }
}

// ---------- instruments ----------

/** Sine kick: pitch sweeps 155 → 45 Hz. */
const kick = (t: number) => Math.sin(2 * Math.PI * (45 * t + (110 / 28) * (1 - Math.exp(-t * 28)))) * Math.exp(-t * 7) * Math.min(1, t * 2000);

function noiseHit(decay: number, hp: boolean, seed: number) {
    const r = rng(seed);
    let prev = 0, lp = 0;
    return (t: number) => {
        const n = r() * 2 - 1;
        let v: number;
        if (hp) { v = n - prev; prev = n; } else { lp += 0.35 * (n - lp); v = lp; }
        return v * Math.exp(-t * decay);
    };
}

/** Band-limited saw from a handful of harmonics: warm, and cheap enough for pads. */
function saw(f: number, t: number, harmonics = 7) {
    let v = 0;
    for (let h = 1; h <= harmonics; h++) v += Math.sin(2 * Math.PI * f * h * t) / h;
    return v * 0.55;
}

function pluck(f: number, decay = 9) {
    return (t: number) => {
        const bright = Math.exp(-t * 18);
        const v = Math.sin(2 * Math.PI * f * t) + bright * 0.5 * Math.sin(4 * Math.PI * f * t) + bright * 0.25 * Math.sin(6 * Math.PI * f * t);
        return v * Math.exp(-t * decay) * Math.min(1, t * 800);
    };
}

const bell = (f: number, decay: number) => (t: number) =>
    (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 6)) * Math.exp(-t * decay) * Math.min(1, t * 1000);

const tone = (f: number, decay: number) => (t: number) => Math.sin(2 * Math.PI * f * t) * Math.exp(-t * decay) * Math.min(1, t * 600);

// ---------- effects ----------

/** Small Schroeder reverb, used as a send. */
function reverb(inp: Stereo, mix: number): Stereo {
    const out = buf(inp[0].length / SR);
    const combs = [1557, 1617, 1491, 1422], aps = [225, 556];
    for (let ch = 0; ch < 2; ch++) {
        const x = inp[ch], y = out[ch], spread = ch * 23;
        const wet = new Float32Array(x.length);
        for (const c of combs) {
            const d = c + spread, line = new Float32Array(d);
            let k = 0, lp = 0;
            for (let i = 0; i < x.length; i++) {
                const o = line[k];
                lp = o * 0.8 + lp * 0.2;
                line[k] = x[i] + lp * 0.84;
                wet[i] += o * 0.25;
                k = (k + 1) % d;
            }
        }
        for (const a of aps) {
            const line = new Float32Array(a);
            let k = 0;
            for (let i = 0; i < wet.length; i++) {
                const b = line[k], v = -wet[i] + b;
                line[k] = wet[i] + b * 0.5;
                wet[i] = v;
                k = (k + 1) % a;
            }
        }
        for (let i = 0; i < x.length; i++) y[i] = wet[i] * mix;
    }
    return out;
}

/** Ping-pong delay, `time` in seconds. */
function delay(inp: Stereo, time: number, fb: number, mix: number): Stereo {
    const out = buf(inp[0].length / SR), d = Math.round(time * SR);
    for (let i = d; i < inp[0].length; i++) {
        out[0][i] += (inp[1][i - d] + out[1][i - d] * fb) * mix;
        out[1][i] += (inp[0][i - d] + out[0][i - d] * fb) * mix;
    }
    return out;
}

function mixInto(dst: Stereo, src: Stereo, gain = 1) {
    for (let ch = 0; ch < 2; ch++) for (let i = 0; i < dst[ch].length; i++) dst[ch][i] += src[ch][i] * gain;
}

/** One-pole low-pass with a cutoff that can move over time (Hz as a function of seconds). */
function lowpass(x: Stereo, cutoff: (t: number) => number) {
    for (let ch = 0; ch < 2; ch++) {
        let y = 0;
        for (let i = 0; i < x[ch].length; i++) {
            const a = 1 - Math.exp((-2 * Math.PI * cutoff(i / SR)) / SR);
            y += a * (x[ch][i] - y);
            x[ch][i] = y;
        }
    }
}

// ---------- the music bed ----------

const PROGRESSIONS = [
    [0, -4, 3, -2], // i VI III VII
    [0, 5, -4, -5], // i iv VI v
    [0, -4, -2, 3], // i VI VII III
    [0, 3, -2, 5], // i III VII iv
];

export function music(T: Timeline, seed: number, { fade = true } = {}): Stereo {
    const r = rng(seed);
    const bpm = 102 + Math.floor(r() * 16);
    const beat = 60 / bpm, bar = beat * 4;
    const root = 45 + Math.floor(r() * 6); // A2…D3
    const prog = PROGRESSIONS[Math.floor(r() * PROGRESSIONS.length)];
    const arpShape = [[0, 7, 12, 15, 12, 7, 3, 7], [0, 3, 7, 12, 15, 12, 7, 3], [12, 7, 3, 0, 3, 7, 12, 19]][Math.floor(r() * 3)];
    const kickPattern = [[0, 2, 2.75], [0, 1.5, 2], [0, 2, 3.5]][Math.floor(r() * 3)];

    const drums = buf(T.end), bass = buf(T.end), keys = buf(T.end), pad = buf(T.end);
    const duck = new Float32Array(drums[0].length).fill(1);

    // Sections: full groove except during the countdown; the reveal lands on a fresh bar.
    const grooveOn = (t: number) => t < T.cdStart - 0.05 || t >= T.reveal;
    const chordAt = (t: number) => {
        const rel = t < T.reveal ? t : t - T.reveal;
        return prog[Math.floor(rel / bar) % 4];
    };
    const minor = (deg: number) => [0, 3, 7].map((x) => x + deg);

    const grid = (from: number, to: number) => {
        const out: number[] = [];
        for (let t = from; t < to - 1e-6; t += beat / 4) out.push(t);
        return out;
    };
    const steps = [...grid(0, T.cdStart), ...grid(T.reveal, T.end)];
    for (const t of steps) {
        const rel = t < T.reveal ? t : t - T.reveal;
        const step = Math.round(rel / (beat / 4)); // 16th index
        const inBar = (step % 16) / 4; // beats into the bar
        const deg = chordAt(t);
        const intro = t < T.qIn; // lighter hook section
        if (kickPattern.includes(inBar) && !(intro && inBar !== 0)) {
            put(drums, t, 0.45, kick, 0.95);
            // sidechain pump on bass and pads
            for (let i = 0; i < 0.3 * SR; i++) {
                const j = Math.round(t * SR) + i;
                if (j < duck.length) duck[j] = Math.min(duck[j], 0.35 + 0.65 * (i / (0.3 * SR)) ** 0.6);
            }
        }
        if (!intro && (inBar === 1 || inBar === 3)) put(drums, t, 0.3, noiseHit(16, true, step), 0.32, 0.05);
        if (step % 2 === 0 && !intro) put(drums, t, 0.08, noiseHit(inBar % 1 === 0.5 ? 40 : 70, true, step + 99), inBar % 1 === 0.5 ? 0.16 : 0.08, 0.35);
        if (step % 2 === 0 && step % 4 !== 0) {
            const n = root - 12 + deg + (step % 8 === 6 ? 12 : 0);
            put(bass, t, beat * 0.5, (x) => (Math.sin(2 * Math.PI * midi(n) * x) + 0.3 * Math.sin(4 * Math.PI * midi(n) * x)) * Math.exp(-x * 5) * Math.min(1, x * 300), 0.42);
        }
        if (!intro || step % 2 === 0) {
            const n = root + 12 + deg + arpShape[step % 8];
            put(keys, t, 0.5, pluck(midi(n), 8), 0.13, step % 2 ? 0.45 : -0.45);
        }
    }
    // Pads: one chord per bar, soft attack, also carrying the countdown (darker, filtered below).
    for (let t = 0; t < T.end; t += bar) {
        for (const n of minor(chordAt(t))) {
            const f = midi(root + 12 + n);
            put(pad, t, bar + 0.6, (x) => (saw(f * 1.003, x) + saw(f * 0.997, x + 0.1)) * Math.min(1, x / 0.35) * Math.min(1, (bar + 0.6 - x) / 0.5), 0.05);
        }
    }
    // Countdown tension: a sustained low drone rising a semitone per second.
    for (let s = 0; s < T.cdLen; s++) {
        const f = midi(root - 12 + s);
        put(pad, T.cdStart + s, 1.05, (x) => saw(f, x, 5) * Math.min(1, x / 0.05) * Math.min(1, (1.05 - x) / 0.08), 0.1 + s * 0.02);
    }
    lowpass(pad, (t) => (t >= T.cdStart && t < T.reveal ? 400 + 2400 * ((t - T.cdStart) / T.cdLen) ** 2 : 2600));

    for (let ch = 0; ch < 2; ch++)
        for (let i = 0; i < bass[ch].length; i++) {
            bass[ch][i] *= duck[i];
            pad[ch][i] *= 0.4 + 0.6 * duck[i];
        }

    const out = buf(T.end);
    mixInto(out, drums);
    mixInto(out, bass);
    mixInto(out, keys);
    mixInto(out, pad);
    mixInto(out, delay(keys, beat * 0.75, 0.35, 0.35));
    mixInto(out, reverb(keys, 0.5));
    mixInto(out, reverb(pad, 0.6));

    // Fade in, and fade out over the last second (off when sections are chained).
    if (fade) for (let ch = 0; ch < 2; ch++)
        for (let i = 0; i < out[ch].length; i++) {
            const t = i / SR;
            out[ch][i] *= Math.min(1, t / 0.08) * Math.min(1, (T.end - t) / 1.2);
        }
    return out;
}

// ---------- sound effects ----------

function whoosh(out: Stereo, at: number, len: number, gain: number, seed: number, rising = false) {
    const r = rng(seed);
    let yl = 0, yr = 0;
    const s0 = Math.round(at * SR);
    for (let i = 0; i < len * SR; i++) {
        const j = s0 + i;
        if (j < 0 || j >= out[0].length) continue;
        const p = i / (len * SR);
        const cut = rising ? 0.01 + 0.3 * p * p : 0.02 + 0.28 * Math.sin(Math.PI * p);
        yl += cut * (r() * 2 - 1 - yl);
        yr += cut * (r() * 2 - 1 - yr);
        const env = rising ? p ** 2.2 : Math.sin(Math.PI * p) ** 1.5;
        const pan = Math.sin(Math.PI * p * 2) * 0.5;
        out[0][j] += gain * yl * env * 3 * (1 - pan);
        out[1][j] += gain * yr * env * 3 * (1 + pan);
    }
}

export function sfx(T: Timeline, seed: number): Stereo {
    const out = buf(T.end);
    const dry = buf(T.end);
    whoosh(out, 0.05, 0.55, 0.35, seed);
    put(out, 0.3, 1.2, kick, 0.7); // hook hit
    whoosh(out, T.qIn - 0.3, 0.55, 0.3, seed + 1);
    T.optsIn.forEach((a, i) => put(dry, a + 0.06, 0.25, bell(700 + i * 140, 22), 0.16, (i % 2 ? 1 : -1) * 0.3));
    // Countdown: clock ticks, heartbeat, and a riser into the reveal.
    for (let s = 0; s < T.cdLen; s++) {
        const at = T.cdStart + s, last = s === T.cdLen - 1;
        put(out, at, 0.06, noiseHit(90, true, s + 7), 0.5);
        put(out, at, 0.05, tone(last ? 1900 : 1500, 70), 0.22);
        put(out, at, 0.4, kick, 0.55);
        put(out, at + 0.22, 0.4, kick, 0.35);
        if (s >= T.cdLen - 2) put(out, at + 0.5, 0.05, tone(1500, 70), 0.18);
    }
    whoosh(out, T.reveal - 1.6, 1.6, 0.4, seed + 2, true);
    // Reveal: impact + bright major chime.
    put(out, T.reveal, 1.6, (t) => Math.sin(2 * Math.PI * (30 * t + (50 / 6) * (1 - Math.exp(-t * 6)))) * Math.exp(-t * 3), 0.9);
    put(out, T.reveal, 1.8, noiseHit(3.5, true, seed + 3), 0.22);
    [72, 76, 79, 84].forEach((n, i) => put(dry, T.reveal + 0.02 + i * 0.07, 1.8, bell(midi(n), 3.2), 0.13, (i - 1.5) * 0.3));
    whoosh(out, T.fact - 0.1, 0.45, 0.2, seed + 4);
    whoosh(out, T.cta - 0.25, 0.6, 0.35, seed + 5);
    [67, 72, 76, 79, 84].forEach((n, i) => put(dry, T.cta + 0.25 + i * 0.08, 2, bell(midi(n), 2.4), 0.09, (i - 2) * 0.25));
    mixInto(out, dry);
    mixInto(out, reverb(dry, 0.45));
    return out;
}

export function wav(x: Stereo): Uint8Array {
    const n = x[0].length, b = Buffer.alloc(44 + n * 4);
    b.write("RIFF", 0); b.writeUInt32LE(36 + n * 4, 4); b.write("WAVEfmt ", 8);
    b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
    b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34);
    b.write("data", 36); b.writeUInt32LE(n * 4, 40);
    for (let i = 0; i < n; i++)
        for (let ch = 0; ch < 2; ch++) b.writeInt16LE(Math.round(Math.tanh(x[ch][i] * 0.9) * 32000), 44 + i * 4 + ch * 2);
    return b;
}
