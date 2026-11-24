// AZURA BAY — Neon Tide: all sound is synthesized live with WebAudio.
// No audio files, no human voices: engine hum, sirens, impacts, UI blips and
// three original hip-hop stations built from a small step sequencer.
import { G, RADIO, clamp } from './config.js';

let ctx = null, master = null, musicGain = null, sfxGain = null;
let engineOsc = null, engineGain = null, engineFilter = null;
let sirenOsc = null, sirenOsc2 = null, sirenGain = null, sirenOn = false;
let seqTimer = null, step = 0, nextStepTime = 0;
let started = false;

function ensureCtx() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.34; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.5; sfxGain.connect(master);
    // engine: two detuned saws through a lowpass, pitch follows speed
    engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
    const engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'sawtooth'; engineOsc2.frequency.value = 58;
    engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 420;
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    engineOsc.connect(engineFilter); engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain); engineGain.connect(sfxGain);
    engineOsc.start(); engineOsc2.start();
    // siren: alternating two-tone triangle pair
    sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 660;
    sirenOsc2 = ctx.createOscillator(); sirenOsc2.type = 'triangle'; sirenOsc2.frequency.value = 880;
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain); sirenOsc2.connect(sirenGain); sirenGain.connect(sfxGain);
    sirenOsc.start(); sirenOsc2.start();
    return true;
  } catch (e) { return false; }
}

function blip(freq, dur, type, vol, when = 0, slideTo = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur + 0.02);
}
function noiseBurst(dur, vol, filterFreq, when = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol || 0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(sfxGain); src.start(t);
}

export const SFX = {
  init() { if (ensureCtx()) started = true; return started; },
  get ready() { return started; },
  click() { blip(660, 0.07, 'square', 0.12); },
  cash() { blip(880, 0.09, 'sine', 0.2); blip(1320, 0.14, 'sine', 0.18, 0.07); },
  crash(v = 1) { noiseBurst(0.25, 0.35 * v, 900); blip(90, 0.2, 'sine', 0.3 * v, 0, 45); },
  gunshot() { noiseBurst(0.12, 0.4, 3200); blip(160, 0.08, 'square', 0.2, 0, 60); },
  reload() { blip(300, 0.05, 'square', 0.14); blip(420, 0.05, 'square', 0.14, 0.09); },
  horn() { blip(370, 0.35, 'sawtooth', 0.16); blip(466, 0.35, 'sawtooth', 0.12); },
  brake() { noiseBurst(0.3, 0.12, 5200); },
  pickup() { blip(523, 0.1, 'sine', 0.2); blip(784, 0.16, 'sine', 0.2, 0.08); },
  mission() { [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.16, 'triangle', 0.2, i * 0.09)); },
  fail() { blip(220, 0.3, 'sawtooth', 0.18, 0, 110); },
  splash() { noiseBurst(0.4, 0.25, 900); },
  swish() { noiseBurst(0.18, 0.2, 2400); },
  score() { blip(1047, 0.12, 'sine', 0.22); blip(1319, 0.2, 'sine', 0.2, 0.1); },
  reel() { blip(1200, 0.05, 'sine', 0.1); },
  radioSwitch() { blip(440, 0.06, 'square', 0.12); blip(587, 0.08, 'square', 0.12, 0.06); },
  setEngine(speed01, on) {
    if (!ctx || !engineGain) return;
    const t = ctx.currentTime;
    engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.075 : 0, t, 0.12);
    engineOsc.frequency.setTargetAtTime(52 + speed01 * 165, t, 0.08);
    engineFilter.frequency.setTargetAtTime(320 + speed01 * 1600, t, 0.1);
  },
  setSiren(on) {
    if (!ctx || !sirenGain) return;
    sirenOn = on;
    sirenGain.gain.setTargetAtTime(on ? 0.05 : 0, ctx.currentTime, 0.2);
    if (on) { sirenOsc.frequency.setValueAtTime(660, ctx.currentTime); sirenOsc2.frequency.setValueAtTime(880, ctx.currentTime); }
  },
  sirenWail(dt) {
    if (!ctx || !sirenOn) return;
    const t = ctx.currentTime;
    const ph = (t * 0.9) % 1;
    sirenOsc.frequency.setValueAtTime(ph < 0.5 ? 700 : 950, t);
    sirenOsc2.frequency.setValueAtTime(ph < 0.5 ? 950 : 700, t);
  },
  nextStation() {
    if (!ensureCtx()) return;
    G.radioIdx = (G.radioIdx + 1) % RADIO.length;
    G.station = G.radioIdx; G.trackIdx = 0;
    G.stationName = radioStationName(); G.radioOn = true;
    radioTick();
    SFX.radioSwitch();
  },
  siren(v = 1) {
    if (!ctx) return;
    this.setSiren(true);
    clearTimeout(sirenOffTimer);
    sirenOffTimer = setTimeout(() => this.setSiren(false), Math.max(300, v * 1500));
  },
};
let sirenOffTimer = null;
export function initAudio() {
  if (SFX.init()) {
    G.radioOn = true; G.station = G.radioIdx; G.stationName = radioStationName();
    radioTick();
    return true;
  }
  return false;
}

// --- radio: 3 stations, 16-step hip-hop patterns, all synthesized ------------
const BPM = 92, STEP_DUR = 60 / BPM / 4;
const KICK = [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];
const HAT = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0];
const BASSLINES = [
  [0, 0, 3, 0, 5, 0, 3, 0, 0, 0, 7, 0, 5, 3, 0, 0],
  [0, 0, 0, 5, 0, 3, 0, 0, 7, 0, 5, 0, 3, 0, 2, 0],
  [5, 0, 0, 3, 0, 0, 5, 0, 0, 7, 0, 5, 3, 0, 0, 2],
];
const ROOTS = [55, 49, 61.7]; // A1, G1, B1
const SCALES = [[0, 3, 5, 7, 10], [0, 2, 3, 7, 9], [0, 3, 5, 6, 10]];

function drumHit(kind, t, vol) {
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'hat' ? 0.05 : 0.22));
  g.connect(musicGain);
  if (kind === 'kick') {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    o.connect(g); o.start(t); o.stop(t + 0.2);
  } else if (kind === 'snare') {
    const len = Math.floor(ctx.sampleRate * 0.16); const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900;
    s.connect(f); f.connect(g); s.start(t);
  } else {
    const len = Math.floor(ctx.sampleRate * 0.04); const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 8000;
    s.connect(f); f.connect(g); s.start(t);
  }
}
function noteAt(freq, t, dur, type, vol) {
  const o = ctx.createOscillator(); o.type = type || 'triangle';
  o.frequency.setValueAtTime(freq, t);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + dur + 0.02);
}
function scheduleStep(s, t) {
  const st = G.radioIdx, chase = G.chaseMusic;
  if (KICK[s]) drumHit('kick', t, chase ? 0.5 : 0.4);
  if (SNARE[s]) drumHit('snare', t, chase ? 0.34 : 0.26);
  if (HAT[s]) drumHit('hat', t, 0.12);
  const b = BASSLINES[st][s];
  if (b) noteAt(ROOTS[st] * Math.pow(2, b / 12), t, STEP_DUR * 1.8, 'sawtooth', 0.16);
  if (s % 4 === 0) {
    const deg = SCALES[st][(s / 4 + G.trackIdx) % SCALES[st].length];
    noteAt(ROOTS[st] * 4 * Math.pow(2, deg / 12), t, STEP_DUR * 3, 'sine', 0.07);
  }
}
export function radioTick() {
  if (!ctx || !started) return;
  if (!seqTimer) {
    nextStepTime = ctx.currentTime + 0.06; step = 0;
    seqTimer = setInterval(() => {
      while (nextStepTime < ctx.currentTime + 0.18) {
        scheduleStep(step, nextStepTime);
        nextStepTime += STEP_DUR * (G.chaseMusic ? 0.82 : 1);
        step = (step + 1) % 16;
        if (step === 0 && Math.random() < 0.3) { G.trackIdx = (G.trackIdx + 1) % 3; G.stationName = radioStationName(); }
      }
    }, 40);
  }
}
export function radioNext() {
  G.radioIdx = (G.radioIdx + 1) % RADIO.length;
  G.trackIdx = 0;
  SFX.radioSwitch();
}
export function radioStationName() { return RADIO[G.radioIdx].name + ' — ' + RADIO[G.radioIdx].tracks[G.trackIdx]; }
export function setChaseMusic(on) { G.chaseMusic = on; if (musicGain) musicGain.gain.setTargetAtTime(on ? 0.46 : 0.34, ctx.currentTime, 0.4); }
