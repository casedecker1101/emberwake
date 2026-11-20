// Particles, lights, telegraphs
import * as THREE from 'three';
import { G } from './game.js';
import { rand } from './util.js';

class Particles {
  constructor(max, blending) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.grow = new Float32Array(max); this.a0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('pcolor', this.aCol); g.setAttribute('psize', this.aSize); g.setAttribute('palpha', this.aAlpha);
    g.setDrawRange(0, 0);
    this.uScale = { value: 600 };
    const m = new THREE.ShaderMaterial({
      uniforms: { uScale: this.uScale },
      vertexShader: `attribute vec3 pcolor; attribute float psize; attribute float palpha; uniform float uScale;
        varying vec3 vC; varying float vA;
        void main(){ vC = pcolor; vA = palpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = psize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = smoothstep(0.5, 0.05, d) * vA;
          if (a < 0.003) discard; gl_FragColor = vec4(vC, a); }`,
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false;
    this.geo = g;
    G.scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, r, gC, b, size, life, o = {}) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = gC; this.col[i * 3 + 2] = b;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life;
    this.grav[i] = o.grav ?? 0; this.drag[i] = o.drag ?? 1; this.grow[i] = o.grow ?? 0; this.a0[i] = o.alpha ?? 1;
    this.alpha[i] = this.a0[i];
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const l = --this.n;
        if (i !== l) {
          for (let k = 0; k < 3; k++) { this.pos[i * 3 + k] = this.pos[l * 3 + k]; this.vel[i * 3 + k] = this.vel[l * 3 + k]; this.col[i * 3 + k] = this.col[l * 3 + k]; }
          this.size[i] = this.size[l]; this.life[i] = this.life[l]; this.maxLife[i] = this.maxLife[l];
          this.grav[i] = this.grav[l]; this.drag[i] = this.drag[l]; this.grow[i] = this.grow[l]; this.a0[i] = this.a0[l];
        }
        i--; continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] *= d; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = this.a0[i] * Math.min(1, t * 2.5) * Math.min(1, (1 - t) * 8 + 0.2);
    }
    this.geo.setDrawRange(0, this.n);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true;
  }
}

export class FX {
  constructor() {
    this.add = new Particles(5000, THREE.AdditiveBlending);
    this.smoke = new Particles(2500, THREE.NormalBlending);
    this.flashes = [];
    for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xff8840, 0, 16, 1.6); G.scene.add(l); this.flashes.push({ l, t: 0, max: 1, i0: 0 }); }
    this.telegraphs = [];
    this.acc = 0;
  }
  resize(h, fov) { const s = h / (2 * Math.tan((fov * Math.PI) / 360)); this.add.uScale.value = s; this.smoke.uScale.value = s; }
  flash(pos, color = 0xff8840, intensity = 40, dur = 0.35) {
    const f = this.flashes.reduce((a, b) => (a.t < b.t ? a : b));
    f.l.position.copy(pos); f.l.color.setHex(color); f.i0 = intensity; f.t = dur; f.max = dur;
  }
  burst(p, n, color, speed = 4, size = 0.3, life = 0.6, o = {}) {
    const c = new THREE.Color(color).multiplyScalar(o.hdr ?? 2);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(rand(-1, 1)), s = speed * rand(0.3, 1);
      this.add.emit(p.x, p.y, p.z, Math.sin(ph) * Math.cos(th) * s, Math.abs(Math.cos(ph)) * s * (o.up ?? 1), Math.sin(ph) * Math.sin(th) * s,
        c.r, c.g, c.b, size * rand(0.6, 1.3), life * rand(0.6, 1.2), { grav: o.grav ?? -6, drag: o.drag ?? 2 });
    }
  }
  puff(p, n, color = 0x777777, size = 1, life = 1.6, o = {}) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      this.smoke.emit(p.x + rand(-0.3, 0.3), p.y + rand(-0.1, 0.3), p.z + rand(-0.3, 0.3), rand(-1, 1) * (o.spread ?? 0.6), rand(0.5, 1.4) * (o.rise ?? 1), rand(-1, 1) * (o.spread ?? 0.6),
        c.r, c.g, c.b, size * rand(0.6, 1.2), life * rand(0.7, 1.3), { grav: 0.3, drag: 0.8, grow: size * 0.9, alpha: o.alpha ?? 0.45 });
    }
  }
  fire(p, strength = 1, color = [1, 0.45, 0.12]) {
    const k = 3.2;
    this.add.emit(p.x + rand(-0.35, 0.35) * strength, p.y, p.z + rand(-0.35, 0.35) * strength, rand(-0.2, 0.2), rand(1.2, 2.4) * strength, rand(-0.2, 0.2),
      color[0] * k, color[1] * k, color[2] * k, rand(0.35, 0.7) * strength, rand(0.4, 0.8), { grav: 0.5, drag: 1.2, grow: -0.5 });
    if (Math.random() < 0.15) this.add.emit(p.x, p.y + 0.3, p.z, rand(-0.5, 0.5), rand(2, 4), rand(-0.5, 0.5), 4, 1.8, 0.4, 0.06, rand(1, 2), { grav: 0.2, drag: 0.5 });
  }
  hit(p, color = 0xffe0a0) { this.burst(p, 14, color, 6, 0.14, 0.35, { grav: -12, hdr: 3 }); }
  blood(p) { this.burst(p, 10, 0x8a1010, 4, 0.12, 0.5, { grav: -14, hdr: 1 }); }
  levelUp(p) {
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(0.4, 1.2);
      this.add.emit(p.x + Math.cos(a) * r, p.y + rand(0, 0.5), p.z + Math.sin(a) * r, 0, rand(2, 6), 0, 3.5, 2.6, 0.8, rand(0.1, 0.25), rand(0.8, 1.6), { grav: 0, drag: 0.5 });
    }
    this.flash(p.clone().setY(p.y + 1.5), 0xffd27a, 40, 0.8);
  }
  explode(p, color = 0xff7a2a, scale = 1) {
    this.burst(p, 50 * scale, color, 9 * scale, 0.35, 0.6, { grav: -4, hdr: 3 });
    this.burst(p, 20, 0xffe0a0, 4, 0.5, 0.25, { hdr: 4, grav: 0 });
    this.puff(p, 10 * scale, 0x3a3430, 1.4 * scale, 1.6, { spread: 2, alpha: 0.5 });
    this.flash(p, color, 70 * scale, 0.4);
    G.shake = Math.max(G.shake, 0.35 * scale);
  }
  telegraph(pos, radius, dur, onEnd, color = 0xff3a1a) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.94, radius, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = fill.rotation.x = -Math.PI / 2;
    g.add(ring, fill); g.position.copy(pos); g.position.y += 0.12; G.scene.add(g);
    this.telegraphs.push({ g, fill, t: 0, dur, onEnd });
  }
  ambient(dt) {
    // chimney smoke, fires, shrine motes
    this.acc += dt;
    const R = G.refs;
    if (this.acc > 0.06) {
      this.acc = 0;
      for (const c of R.chimneys) this.smoke.emit(c.x + rand(-0.2, 0.2), c.y, c.z + rand(-0.2, 0.2), rand(0.2, 0.6), rand(0.8, 1.3), rand(-0.2, 0.2), 0.55, 0.55, 0.58, 0.5, rand(3, 5), { grav: 0.05, drag: 0.3, grow: 0.7, alpha: 0.28 });
      if (R.pedestal && G.player) {
        const p = R.pedestal;
        this.add.emit(p.x + rand(-9, 9), p.y + rand(0, 0.5), p.z + rand(-9, 9), 0, rand(0.3, 1), 0, 0.5, 0.8, 1.6, 0.12, rand(2, 4), { grav: 0, drag: 0.1 });
      }
    }
    if (R.forgePos) this.fire(R.forgePos, 0.6);
    if (R.campFire) { this.fire(R.campFire, 1.1); this.fire(R.campFire, 1.1); }
    if (R.kindleStone && Math.random() < 0.3) {
      const k = R.kindleStone; const a = Math.random() * 6.28;
      this.add.emit(k.x + Math.cos(a) * 1.2, k.y + rand(0.3, 2.4), k.z + Math.sin(a) * 1.2, 0, rand(0.3, 0.8), 0, 0.6, 2.2, 3.2, 0.1, rand(1, 2), { grav: 0, drag: 0.2 });
    }
    const flick = 0.85 + Math.sin(G.time * 13) * 0.08 + Math.sin(G.time * 31) * 0.07;
    if (R.forgeLight) R.forgeLight.intensity = 25 * flick;
    if (R.campLight) R.campLight.intensity = 30 * flick;
  }
  update(dt) {
    this.ambient(dt);
    this.add.update(dt); this.smoke.update(dt);
    for (const f of this.flashes) { if (f.t > 0) { f.t -= dt; f.l.intensity = f.i0 * Math.max(0, f.t / f.max); } else f.l.intensity = 0; }
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i]; t.t += dt; const k = Math.min(1, t.t / t.dur);
      t.fill.scale.setScalar(Math.max(0.01, k)); t.fill.material.opacity = 0.15 + 0.3 * k;
      if (t.t >= t.dur) { G.scene.remove(t.g); t.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); this.telegraphs.splice(i, 1); t.onEnd && t.onEnd(); }
    }
  }
}
