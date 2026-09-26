// Tiny synthesized sound effects (no audio files). Distant sounds are quieter; rapid repeats are throttled.
export class Sounds {
  constructor() { this.enabled = true; this.ctx = null; this.last = {}; this.listener = null; this.noiseBuf = null; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
  }
  play(kind, pos) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const gap = { shot: 45, mg: 70, flak: 90, boom: 60, bigboom: 90, topple: 60, rocket: 80, cannon: 80, throw: 80 }[kind] || 50;
    const t = performance.now();
    if (this.last[kind] && t - this.last[kind] < gap) return;
    this.last[kind] = t;
    let vol = 1;
    if (pos && this.listener) { const d = this.listener.distanceTo(pos); vol = Math.max(0.12, Math.min(1, 26 / (d + 6))); }
    const c = this.ctx, now = c.currentTime;
    const noise = (dur, freq, q, v, type = 'bandpass') => {
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.setValueAtTime(v * vol, now); g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
      s.connect(f).connect(g).connect(this.master); s.start(now, Math.random() * 0.5); s.stop(now + dur);
    };
    const tone = (f0, f1, dur, v, type = 'sine') => {
      const o = c.createOscillator(), g = c.createGain(); o.type = type;
      o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(f1, now + dur);
      g.gain.setValueAtTime(v * vol, now); g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
      o.connect(g).connect(this.master); o.start(now); o.stop(now + dur);
    };
    switch (kind) {
      case 'shot': noise(0.09, 2200, 0.9, 0.35); break;
      case 'mg': noise(0.06, 1700, 1.1, 0.28); break;
      case 'flak': noise(0.18, 600, 0.8, 0.5); break;
      case 'cannon': noise(0.35, 300, 0.7, 0.9, 'lowpass'); tone(110, 45, 0.3, 0.3); break;
      case 'rocket': noise(0.5, 900, 0.5, 0.35); break;
      case 'throw': tone(500, 300, 0.1, 0.05, 'triangle'); break;
      case 'boom': noise(0.5, 220, 0.6, 0.9, 'lowpass'); tone(90, 35, 0.35, 0.25); break;
      case 'bigboom': noise(1.0, 160, 0.5, 1.3, 'lowpass'); tone(70, 28, 0.7, 0.4); break;
      case 'topple': tone(900 + Math.random() * 300, 380, 0.08, 0.06, 'triangle'); break;
      case 'place': tone(620, 880, 0.06, 0.08, 'triangle'); break;
      case 'error': tone(220, 160, 0.12, 0.08, 'square'); break;
      case 'start': tone(330, 660, 0.25, 0.12, 'triangle'); break;
    }
  }
}
