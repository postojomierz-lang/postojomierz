// Sound (Web Audio): wind that depends on altitude, forest and weather; the nearest streams and
// waterfall as positional sources; footsteps on the trail; birds in the forest and marmots whistling
// on the alpine meadows. Recordings from Freesound (CC0 / CC BY, see public/sounds/credits.json).
// Browsers only allow audio after a user gesture, so everything starts on the first key or click.

export class Sound {
  constructor({ base, streams, terrain, isForest, isPath }) {
    this.base = base; this.streamPts = streams.samples; this.falls = streams.sprays;
    this.terrain = terrain; this.isForest = isForest; this.isPath = isPath;
    this.enabled = true; this.ctx = null; this.buf = {};
    this.stepAcc = 0; this.nextBird = 4; this.nextMarmot = 20; this.t = 0; this.scanT = 0;
    const start = () => { this.start(); removeEventListener('keydown', start); removeEventListener('pointerdown', start); };
    addEventListener('keydown', start); addEventListener('pointerdown', start);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else if (this.enabled) this.ctx.resume();
    });
  }

  async start() {
    if (this.ctx) return;
    try { await this._start(); } catch (e) { console.warn('sound disabled:', e); }
  }

  async _start() {
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = this.enabled ? 1 : 0;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    const load = async (name) => {
      const r = await fetch(`${this.base}${name}.mp3`);
      return ctx.decodeAudioData(await r.arrayBuffer());
    };
    // sounds.json lists the clips of every group (tools/prepare_sounds.py)
    const groups = await (await fetch(this.base + 'sounds.json')).json();
    await Promise.all(Object.entries(groups).map(async ([k, names]) => { this.buf[k] = await Promise.all(names.map(load)); }));
    for (const k of ['stream', 'waterfall', 'windForest', 'windOpen']) this.buf[k] = this.buf[k][0];
    const g = (k) => (this.buf[k] && this.buf[k].length ? this.buf[k] : null);
    // who sings where: wren and the mixed forest chorus below the tree line, black redstart around
    // the hut and on rocks, alpine chough up on the crags
    this.pools = {
      forest: [g('wren'), g('forest'), g('forest')].filter(Boolean),
      edge: [g('redstart'), g('wren'), g('chough')].filter(Boolean),
      rock: [g('chough'), g('redstart')].filter(Boolean),
    };
    const loop = (buffer, gain = 0) => {
      const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
      const g = ctx.createGain(); g.gain.value = gain;
      src.connect(g); src.start(0, Math.random() * buffer.duration);
      return { src, g };
    };
    // wind: two beds, crossfaded by surroundings
    this.windF = loop(this.buf.windForest); this.windF.g.connect(this.master);
    this.windO = loop(this.buf.windOpen); this.windO.g.connect(this.master);
    // positional water: two stream sources and one waterfall source, moved to the nearest spots
    const panner = (ref, max) => {
      const p = ctx.createPanner();
      Object.assign(p, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: ref, maxDistance: max, rolloffFactor: 1.2 });
      p.connect(this.master);
      return p;
    };
    this.water = [0, 1].map(() => { const s = loop(this.buf.stream); const p = panner(4, 400); s.g.connect(p); return { ...s, p }; });
    this.fall = (() => { const s = loop(this.buf.waterfall); const p = panner(12, 800); s.g.connect(p); return { ...s, p }; })();
    this.stepFilter = ctx.createBiquadFilter(); this.stepFilter.type = 'lowpass'; this.stepFilter.frequency.value = 9000;
    this.stepFilter.connect(this.master);
    // rain: a bed of filtered noise (made here, no file), louder with the rain's strength
    this.noise = this._noise(3);
    const rain = loop(this.noise);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
    rain.g.connect(hp).connect(lp).connect(this.master);
    this.rain = rain;
  }

  // white noise, brownish (a little low-passed) so it does not hiss
  _noise(seconds) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { last = last * 0.55 + (Math.random() * 2 - 1) * 0.45; d[i] = last * 1.6; }
    return b;
  }

  // thunder from a lightning strike `dist` metres away: a crack when close, then a long low rumble,
  // arriving at the speed of sound
  thunder(dist) {
    if (!this.ctx || this.ctx.state !== 'running' || !this.noise) return;
    const ctx = this.ctx, t0 = ctx.currentTime + dist / 343;
    const near = Math.max(0, 1 - dist / 3000), len = 4 + 5 * (1 - near);
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(near > 0.4 ? 2500 : 600, t0);
    lp.frequency.exponentialRampToValueAtTime(110, t0 + 1.2);
    const g = ctx.createGain(), peak = 0.25 + 1.1 * near;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (near > 0.4 ? 0.03 : 0.6));
    // rolling: a few swells while it dies away
    let t = t0 + 0.8;
    for (let k = 0; k < 4 && t < t0 + len - 1; k++) {
      g.gain.exponentialRampToValueAtTime(peak * (0.35 + Math.random() * 0.4) / (1 + k * 0.5), t);
      t += 0.6 + Math.random() * 1.2;
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t0, Math.random() * 2); src.stop(t0 + len + 0.1);
  }

  // a call of a large animal at a position (deer barking when startled, bear growling)
  animal(group, pos) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const b = this.buf[group];
    if (!b || !b.length) return;
    this.play(b[Math.floor(Math.random() * b.length)], { pos, gain: group === 'bear' ? 1.4 : 1.0, ref: 25, rate: 0.95 + Math.random() * 0.1 });
  }

  setEnabled(on) {
    this.enabled = on;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.1);
    if (on) this.ctx.resume();
  }

  // one-shot at a position (x, y, z), or non-positional when pos is null
  play(buffer, { pos = null, gain = 1, rate = 1, dest = null, ref = 20 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = buffer; src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(g);
    if (pos) {
      const p = ctx.createPanner();
      Object.assign(p, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: ref, maxDistance: 2000, rolloffFactor: 1 });
      p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2];
      g.connect(p).connect(this.master);
    } else g.connect(dest || this.master);
    src.start();
  }

  // called every frame: camera, time step, walking speed (m/s along the trail), weather
  update(camera, dt, { walking, speed, weather, fast, wind = 1, rain = 0 }) {
    if (!this.ctx || !this.windF || this.ctx.state !== 'running') return;
    const ctx = this.ctx, now = ctx.currentTime, L = ctx.listener;
    const c = camera.position;
    this.t += dt;
    // listener
    const f = camera.getWorldDirection(this._v || (this._v = camera.position.clone()));
    if (L.positionX) {
      L.positionX.value = c.x; L.positionY.value = c.y; L.positionZ.value = c.z;
      L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(c.x, c.y, c.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }

    // wind: stronger higher up and in bad weather, softened in the forest, with slow gusts
    const ground = this.terrain.height(c.x, c.z);
    const alt = Math.min(1, Math.max(0, (ground - 1400) / 1000));
    const forest = this.isForest(c.x, c.z) ? 1 : 0;
    const wx = Math.min(2.2, 0.7 * wind);
    const gust = 0.7 + 0.3 * Math.sin(this.t * 0.23) * Math.sin(this.t * 0.61 + 1.3);
    this.windF.g.gain.setTargetAtTime(0.1 * forest * wx * gust, now, 0.5);
    this.windO.g.gain.setTargetAtTime((0.05 + 0.35 * alt) * (1 - 0.7 * forest) * wx * gust, now, 0.5);
    if (this.rain) this.rain.g.gain.setTargetAtTime(0.32 * rain * (1 - 0.3 * forest), now, 1.5);

    // water: nearest stream spots (a few times a second)
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.25;
      const P = this.streamPts, best = [[Infinity, -1], [Infinity, -1]];
      for (let i = 0; i < P.length; i += 5) {
        const d = Math.hypot(P[i] - c.x, P[i + 2] - c.z) / (0.6 + P[i + 3] + P[i + 4] * 0.3);
        if (d < best[0][0]) { if (best[0][1] < 0 || Math.abs(i - best[0][1]) > 200) best[1] = best[0]; best[0] = [d, i]; }
        else if (d < best[1][0] && Math.abs(i - best[0][1]) > 200) best[1] = [d, i];
      }
      best.forEach(([d, i], k) => {
        const w = this.water[k];
        if (i < 0) { w.g.gain.setTargetAtTime(0, now, 0.5); return; }
        w.p.positionX.setTargetAtTime(P[i], now, 0.3); w.p.positionY.setTargetAtTime(P[i + 1], now, 0.3); w.p.positionZ.setTargetAtTime(P[i + 2], now, 0.3);
        w.g.gain.setTargetAtTime(0.25 + 0.9 * P[i + 3] * Math.min(1, P[i + 4] / 3), now, 0.5);
      });
      let fb = null, fd = Infinity;
      for (const s of this.falls) { const d = Math.hypot(s.x - c.x, s.z - c.z); if (d < fd) { fd = d; fb = s; } }
      if (fb) {
        this.fall.p.positionX.value = fb.x; this.fall.p.positionY.value = fb.y + 5; this.fall.p.positionZ.value = fb.z;
        this.fall.g.gain.setTargetAtTime(fb.big ? 1.2 : 0.6, now, 0.5);
      }
    }

    // footsteps: one per ~0.75 m of walking, none when the time is sped up
    if (walking && !fast) {
      this.stepAcc += speed * dt;
      if (this.stepAcc > 0.75) {
        this.stepAcc = 0;
        // gravel on the path below the dwarf pine, bare rock above it, grass off the path
        const onPath = this.isPath(c.x, c.z);
        const s = (onPath ? (ground < 1700 ? this.buf.stepsGravel : this.buf.stepsRock) : this.buf.stepsGrass) || this.buf.stepsGravel || [];
        if (s.length) this.play(s[Math.floor(Math.random() * s.length)], { gain: 0.35, rate: 0.92 + Math.random() * 0.16, dest: this.stepFilter });
      }
    } else this.stepAcc = 0.5;

    // birds and marmots at a random spot around the listener
    const around = (r0, r1) => {
      const a = Math.random() * 6.283, r = r0 + Math.random() * (r1 - r0);
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      return [x, this.terrain.height(x, z) + 3, z];
    };
    this.nextBird -= dt;
    if (this.nextBird <= 0) {
      const zone = forest || ground < 1520 ? this.pools.forest : ground < 1750 ? this.pools.edge : this.pools.rock;
      const pool = zone.length ? zone[Math.floor(Math.random() * zone.length)] : null;
      if (pool && !((weather === 'mist' || rain > 0.2) && Math.random() < 0.6)) {
        this.play(pool[Math.floor(Math.random() * pool.length)], { pos: around(12, 45), gain: 0.5, rate: 0.95 + Math.random() * 0.1, ref: 15 });
      }
      this.nextBird = (forest ? 5 : 14) + Math.random() * (forest ? 12 : 25);
    }
    this.nextMarmot -= dt;
    if (this.nextMarmot <= 0) {
      if (ground > 1550 && ground < 2250 && !forest && (this.buf.marmot || []).length) {
        const m = this.buf.marmot || [];
        this.play(m[Math.floor(Math.random() * m.length)], { pos: around(60, 180), gain: 0.9, ref: 40 });
      }
      this.nextMarmot = 25 + Math.random() * 60;
    }
  }
}
