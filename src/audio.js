// Procedural audio: sfx, ambience and a generative score
export class AudioSys {
  constructor() { this.ctx = null; this.combat = 0; this.musicOn = true; }
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.22; this.music.connect(this.master);
    // shared reverb-ish delay
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = 0.32;
    const fb = ctx.createGain(); fb.gain.value = 0.35; const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 1800;
    this.delay.connect(dl); dl.connect(fb); fb.connect(this.delay); dl.connect(this.music);
    const len = ctx.sampleRate * 2; const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    // wind ambience
    const wn = ctx.createBufferSource(); wn.buffer = buf; wn.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 400; wf.Q.value = 0.6;
    const wg = ctx.createGain(); wg.gain.value = 0.05;
    wn.connect(wf); wf.connect(wg); wg.connect(this.master); wn.start();
    this.windF = wf; this.windG = wg;
    // pad bus
    this.padF = ctx.createBiquadFilter(); this.padF.type = 'lowpass'; this.padF.frequency.value = 900; this.padF.connect(this.music); this.padF.connect(this.delay);
    this.nextBar = ctx.currentTime + 0.2; this.bar = 0; this.beat = 0; this.nextBeat = ctx.currentTime + 0.2;
    setInterval(() => this.schedule(), 100);
  }
  note(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  schedule() {
    const ctx = this.ctx; if (!ctx || !this.musicOn) return;
    // A minor progression: Am F C G | Am Em F E
    const prog = [[57, 60, 64], [53, 57, 60], [48, 55, 64], [55, 59, 62], [57, 60, 64], [52, 55, 59], [53, 57, 60], [52, 56, 59]];
    const scale = [69, 72, 74, 76, 79, 81, 84];
    const BAR = 4.8;
    while (this.nextBar < ctx.currentTime + 0.5) {
      const ch = prog[this.bar % prog.length]; const t = this.nextBar;
      for (const m of ch) this.pad(this.note(m), t, BAR + 0.6);
      this.pad(this.note(ch[0] - 12), t, BAR + 0.6, 0.6);
      // sparse melody
      for (let i = 0; i < 4; i++) {
        if (Math.random() < 0.45) {
          const n = scale[Math.floor(Math.random() * scale.length)] - (Math.random() < 0.3 ? 12 : 0);
          this.pluck(this.note(n), t + i * (BAR / 4) + (Math.random() < 0.3 ? BAR / 8 : 0));
        }
      }
      this.nextBar += BAR; this.bar++;
    }
    while (this.nextBeat < ctx.currentTime + 0.5) {
      if (this.combat > 0.1) this.drum(this.nextBeat, this.beat % 2 === 0 ? 1 : 0.5);
      this.nextBeat += 0.6; this.beat++;
    }
    const target = 700 + this.combat * 1400;
    this.padF.frequency.setTargetAtTime(target, ctx.currentTime, 1.5);
  }
  pad(f, t, dur, vol = 1) {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06 * vol, t + 1.4); g.gain.setValueAtTime(0.06 * vol, t + dur - 1.4); g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(this.padF);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      o.connect(g); o.start(t); o.stop(t + dur + 0.1);
    }
  }
  pluck(f, t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    o.connect(g); g.connect(this.music); g.connect(this.delay); o.start(t); o.stop(t + 1.7);
  }
  drum(t, v) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5 * v * Math.min(1, this.combat), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); g.connect(this.music); o.start(t); o.stop(t + 0.4);
  }
  noise(dur, type, f0, f1, vol, q = 1, t0 = 0) {
    const ctx = this.ctx; const t = ctx.currentTime + t0;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 1;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone(f0, f1, dur, type, vol, t0 = 0) {
    const ctx = this.ctx; const t = ctx.currentTime + t0;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'swing': this.noise(0.22, 'bandpass', 2400, 500, 0.35, 2); break;
      case 'hit': this.noise(0.15, 'lowpass', 2500, 200, 0.6); this.tone(160, 60, 0.18, 'sine', 0.5); break;
      case 'clang': this.tone(1200, 900, 0.4, 'triangle', 0.15); this.noise(0.1, 'highpass', 3000, 2000, 0.3); break;
      case 'hurt': this.tone(220, 90, 0.25, 'sawtooth', 0.18); this.noise(0.2, 'lowpass', 1200, 200, 0.4); break;
      case 'cast': this.noise(0.5, 'bandpass', 300, 2400, 0.4, 3); this.tone(300, 900, 0.4, 'sine', 0.12); break;
      case 'boom': this.noise(0.9, 'lowpass', 1600, 60, 0.9); this.tone(90, 30, 0.7, 'sine', 0.7); break;
      case 'roll': this.noise(0.3, 'lowpass', 900, 200, 0.25); break;
      case 'jump': this.noise(0.12, 'lowpass', 700, 200, 0.15); break;
      case 'pickup': this.tone(660, 660, 0.12, 'triangle', 0.15); this.tone(990, 990, 0.2, 'triangle', 0.15, 0.08); break;
      case 'coin': this.tone(1320, 1320, 0.08, 'square', 0.06); this.tone(1760, 1760, 0.15, 'square', 0.06, 0.06); break;
      case 'quest': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.6, 'triangle', 0.14, i * 0.12)); break;
      case 'level': [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, f, 0.8, 'triangle', 0.13, i * 0.09)); break;
      case 'ui': this.tone(500, 500, 0.06, 'triangle', 0.08); break;
      case 'chest': this.noise(0.5, 'bandpass', 300, 150, 0.3, 4); this.tone(200, 150, 0.4, 'square', 0.03); break;
      case 'howl': this.tone(400, 640, 0.6, 'sine', 0.12); this.tone(640, 380, 0.9, 'sine', 0.12, 0.6); break;
      case 'roar': this.noise(1.4, 'lowpass', 500, 80, 0.8, 2); this.tone(70, 40, 1.4, 'sawtooth', 0.25); break;
      case 'drink': this.noise(0.4, 'bandpass', 600, 900, 0.2, 6); this.tone(500, 800, 0.3, 'sine', 0.08, 0.2); break;
      case 'kindle': [220, 330, 440, 660].forEach((f, i) => this.tone(f, f * 1.01, 2.5, 'sine', 0.12, i * 0.25)); this.noise(2.5, 'bandpass', 200, 3000, 0.25, 2); break;
      case 'death': this.tone(300, 60, 1.6, 'sawtooth', 0.2); break;
    }
  }
  setWind(k) { if (this.ctx) { this.windG.gain.setTargetAtTime(0.03 + k * 0.08, this.ctx.currentTime, 1); } }
}
