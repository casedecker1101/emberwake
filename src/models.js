// Procedural low-poly models: humanoids, beasts, props, weapons
import * as THREE from 'three';
import { ss, lerp } from './util.js';

const cache = new Map();
export function mat(color, o = {}) {
  const k = color + '|' + JSON.stringify(o);
  let m = cache.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o }); cache.set(k, m); }
  return m;
}
export function mesh(geo, m, x = 0, y = 0, z = 0, cast = true) {
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y, z);
  me.castShadow = cast; me.receiveShadow = true;
  return me;
}
const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 10);
const sph = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// ---------------------------------------------------------------- Humanoid
export function makeHumanoid(o = {}) {
  const c = { skin: 0xd9a77f, hair: 0x3b2416, tunic: 0x3d6b8c, pants: 0x4f3f2c, boots: 0x2b1d12, belt: 0x24160c, sleeve: null, gloves: null, ...o };
  const group = new THREE.Group();
  const root = new THREE.Group(); group.add(root);
  const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips);
  const pelvis = mesh(sph(0.19), mat(c.pants)); pelvis.scale.set(1.05, 0.6, 0.75); hips.add(pelvis);
  const torso = new THREE.Group(); torso.position.y = 0.06; hips.add(torso);
  const chest = mesh(cap(0.19, 0.26), mat(c.tunic), 0, 0.3, 0); chest.scale.set(1.08, 1, 0.68); torso.add(chest);
  const belt = mesh(new THREE.CylinderGeometry(0.205, 0.21, 0.07, 14), mat(c.belt), 0, 0.06, 0); belt.scale.z = 0.72; torso.add(belt);
  torso.add(mesh(box(0.06, 0.05, 0.02), mat(0xc9a24a, { metalness: 0.8, roughness: 0.3 }), 0, 0.06, 0.152));
  if (c.robe) {
    const robe = mesh(new THREE.CylinderGeometry(0.21, 0.42, 0.92, 14, 1, true), mat(c.robe, { side: THREE.DoubleSide }), 0, -0.43, 0);
    robe.scale.z = 0.82; hips.add(robe);
  } else {
    const skirt = mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.26, 14), mat(c.tunic), 0, -0.06, 0); skirt.scale.z = 0.76; hips.add(skirt);
  }
  if (c.pauldrons) {
    for (const s of [1, -1]) {
      const p = mesh(sph(0.13, 10, 8), mat(c.pauldrons, { metalness: 0.6, roughness: 0.45 }), s * 0.27, 0.53, 0); p.scale.set(1.1, 0.8, 1.1); torso.add(p);
      if (c.spikes) { const sp = mesh(new THREE.ConeGeometry(0.05, 0.22, 5), mat(c.spikes, { metalness: 0.5 }), s * 0.3, 0.68, 0); sp.rotation.z = -s * 0.4; torso.add(sp); }
    }
  }
  const neck = new THREE.Group(); neck.position.y = 0.62; torso.add(neck);
  neck.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), mat(c.skin)));
  const head = new THREE.Group(); head.position.y = 0.05; neck.add(head);
  const skull = mesh(sph(0.15, 16, 12), mat(c.skin), 0, 0.14, 0); skull.scale.set(0.92, 1.1, 1); head.add(skull);
  const nose = mesh(new THREE.ConeGeometry(0.024, 0.06, 4), mat(c.skin), 0, 0.12, 0.15); nose.rotation.x = Math.PI / 2; head.add(nose);
  const eyeMat = c.eyeGlow ? mat(c.eyeGlow, { emissive: c.eyeGlow, emissiveIntensity: 4 }) : mat(0x1a1410);
  const eyes = [];
  for (const s of [1, -1]) { const e = mesh(sph(0.022, 6, 5), eyeMat, s * 0.052, 0.16, 0.128, false); head.add(e); eyes.push(e); }
  if (c.hair !== null && !c.helm) {
    const hair = mesh(new THREE.SphereGeometry(0.162, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), mat(c.hair), 0, 0.155, -0.012);
    hair.scale.set(0.96, 1.12, 1.05); head.add(hair);
    head.add(mesh(box(0.25, c.longHair ? 0.34 : 0.16, 0.08), mat(c.hair), 0, c.longHair ? 0.02 : 0.1, -0.11));
  }
  if (c.beard) {
    const b = mesh(sph(0.11, 10, 8), mat(c.beard), 0, 0.05, 0.075); b.scale.set(1, c.longBeard ? 1.7 : 1.1, 0.7); if (c.longBeard) b.position.y = 0.0; head.add(b);
  }
  if (c.hood) {
    const hood = mesh(new THREE.SphereGeometry(0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), mat(c.hood, { side: THREE.DoubleSide }), 0, 0.15, -0.025);
    hood.scale.set(1.0, 1.15, 1.1); head.add(hood);
    const tail = mesh(new THREE.ConeGeometry(0.12, 0.3, 8), mat(c.hood), 0, 0.12, -0.18); tail.rotation.x = -2.2; head.add(tail);
  }
  if (c.helm) {
    const hm = mat(c.helm, { metalness: 0.7, roughness: 0.4 });
    const helm = mesh(new THREE.SphereGeometry(0.172, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hm, 0, 0.15, 0); helm.scale.set(1, 1.12, 1.05); head.add(helm);
    head.add(mesh(box(0.035, 0.12, 0.03), hm, 0, 0.13, 0.165));
    if (c.crown) for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const sp = mesh(new THREE.ConeGeometry(0.03, 0.16, 4), mat(c.crown, { emissive: c.crown, emissiveIntensity: 1.5 }), Math.sin(a) * 0.14, 0.33, Math.cos(a) * 0.14); head.add(sp);
    }
  }
  function arm(side) {
    const sh = new THREE.Group(); sh.position.set(side * 0.27, 0.5, 0); sh.rotation.order = 'YXZ'; torso.add(sh);
    sh.add(mesh(sph(0.085, 10, 8), mat(c.tunic)));
    sh.add(mesh(cap(0.062, 0.2), mat(c.tunic), 0, -0.15, 0));
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    el.add(mesh(cap(0.055, 0.19), mat(c.sleeve ?? c.skin), 0, -0.13, 0));
    const hand = new THREE.Group(); hand.position.y = -0.27; el.add(hand);
    hand.add(mesh(sph(0.06, 8, 6), mat(c.gloves ?? c.skin)));
    return { sh, el, hand };
  }
  const armL = arm(1), armR = arm(-1);
  function leg(side) {
    const hp = new THREE.Group(); hp.position.set(side * 0.1, -0.04, 0); hips.add(hp);
    hp.add(mesh(cap(0.078, 0.26), mat(c.pants), 0, -0.2, 0));
    const kn = new THREE.Group(); kn.position.y = -0.42; hp.add(kn);
    kn.add(mesh(cap(0.068, 0.24), mat(c.pants), 0, -0.18, 0));
    kn.add(mesh(box(0.14, 0.14, 0.25), mat(c.boots), 0, -0.39, 0.035));
    return { hp, kn };
  }
  const legL = leg(1), legR = leg(-1);
  let cape = null;
  if (c.cape) {
    const cg = new THREE.PlaneGeometry(0.48, 1.0, 1, 4); cg.translate(0, -0.5, 0);
    cape = new THREE.Mesh(cg, mat(c.cape, { side: THREE.DoubleSide })); cape.position.set(0, 0.56, -0.15); cape.castShadow = true; torso.add(cape);
  }
  let core = null;
  if (c.core) {
    core = mesh(sph(0.09, 10, 8), mat(c.core, { emissive: c.core, emissiveIntensity: 5 }), 0, 0.32, 0.12, false); torso.add(core);
  }
  return { group, root, hips, torso, chest, neck, head, armL, armR, legL, legR, cape, eyes, core };
}

const zero = (o) => o.set(0, 0, 0);
export function animHumanoid(h, s) {
  const k = Math.min(s.move || 0, 1.5);
  const ph = s.phase || 0, t = s.t || 0;
  // reset
  zero(h.armL.sh.rotation); zero(h.armR.sh.rotation); zero(h.armL.el.rotation); zero(h.armR.el.rotation);
  zero(h.armL.hand.rotation); zero(h.armR.hand.rotation); zero(h.torso.rotation); zero(h.hips.rotation);
  h.hips.position.y = 0.92; h.root.position.set(0, 0, 0);

  const sw = Math.sin(ph) * 0.7 * Math.min(k, 1.2);
  h.legL.hp.rotation.x = -sw; h.legR.hp.rotation.x = sw;
  h.legL.kn.rotation.x = 0.05 + Math.max(0, Math.cos(ph)) * 1.0 * k;
  h.legR.kn.rotation.x = 0.05 + Math.max(0, -Math.cos(ph)) * 1.0 * k;
  h.armL.sh.rotation.x = sw * 0.8; h.armR.sh.rotation.x = -sw * 0.8;
  h.armL.sh.rotation.z = 0.1; h.armR.sh.rotation.z = -0.1;
  h.armL.el.rotation.x = -0.15 - 0.35 * k; h.armR.el.rotation.x = -0.15 - 0.35 * k;
  h.root.position.y = Math.abs(Math.cos(ph)) * 0.05 * k;
  h.torso.rotation.x = 0.04 + 0.08 * k;
  h.torso.rotation.y = Math.sin(ph) * 0.07 * k;
  h.chest.scale.y = 1 + Math.sin(t * 2.1) * 0.018;
  h.head.rotation.y = s.look || 0;
  h.head.rotation.x = s.lookDown || 0;
  if (h.cape) h.cape.rotation.x = 0.08 + k * 0.32 + Math.sin(t * 3.1) * 0.04;
  if (s.idleArms === 'staff') { h.armL.sh.rotation.x = -0.35; h.armL.el.rotation.x = -0.9; }
  if (s.hold && k < 0.3) { h.armR.sh.rotation.x = -0.2; h.armR.el.rotation.x = -0.6; }

  if (s.air) {
    h.legL.hp.rotation.x = -0.6; h.legR.hp.rotation.x = 0.15; h.legL.kn.rotation.x = 1.0; h.legR.kn.rotation.x = 0.6;
    h.armL.sh.rotation.z = 0.5; h.armR.sh.rotation.z = -0.5;
  }
  if (s.attack) {
    const p = s.attack.p, cb = s.attack.combo;
    const wind = ss(0, 0.32, p), strike = ss(0.3, 0.5, p), rec = ss(0.62, 1, p);
    if (cb === 1) {
      h.armR.sh.rotation.x = lerp(-1.5 * Math.min(1, wind * 3), -0.2, rec);
      h.armR.sh.rotation.y = lerp(lerp(0, -1.3, wind), 1.1, strike) * (1 - rec);
      h.armR.hand.rotation.x = 1.5 * (1 - rec);
      h.armR.el.rotation.x = -0.25;
      h.torso.rotation.y = lerp(lerp(0, -0.55, wind), 0.65, strike) * (1 - rec);
    } else {
      const big = cb === 2 ? 1.15 : 1;
      h.armR.sh.rotation.x = lerp(lerp(lerp(0, -2.75 * big, wind), 0.55, strike), -0.2, rec);
      h.armR.sh.rotation.z = -0.25;
      h.armR.el.rotation.x = -0.35;
      h.torso.rotation.y = lerp(lerp(0, 0.35 * big, wind), -0.4 * big, strike) * (1 - rec);
      h.torso.rotation.x += lerp(0, 0.28 * big, strike) * (1 - rec);
      if (cb === 2) h.root.position.y += Math.sin(Math.min(1, p / 0.45) * Math.PI) * 0.25;
      h.armL.sh.rotation.x = -0.5 * wind * (1 - rec);
    }
    h.legL.hp.rotation.x += -0.3 * strike * (1 - rec); h.legR.hp.rotation.x += 0.25 * strike * (1 - rec);
  }
  if (s.cast > 0) {
    const c = s.cast;
    h.armL.sh.rotation.x = -1.55 * c; h.armL.sh.rotation.y = -0.25 * c; h.armL.el.rotation.x = -0.1;
    h.torso.rotation.y += 0.3 * c;
    if (s.castBoth) { h.armR.sh.rotation.x = -1.55 * c; h.armR.sh.rotation.y = 0.25 * c; }
  }
  if (s.slam > 0) {
    const c = s.slam;
    h.armL.sh.rotation.x = -2.9 * c; h.armR.sh.rotation.x = -2.9 * c; h.torso.rotation.x = -0.25 * c;
  }
  if (s.roll != null) {
    const p = s.roll, sn = Math.sin(p * Math.PI);
    h.hips.rotation.x = p * Math.PI * 2;
    h.hips.position.y = 0.92 - sn * 0.45;
    h.legL.hp.rotation.x = h.legR.hp.rotation.x = -1.4 * sn;
    h.legL.kn.rotation.x = h.legR.kn.rotation.x = 2.0 * sn;
    h.armL.sh.rotation.x = h.armR.sh.rotation.x = -1.2 * sn;
  }
  if (s.hurt > 0) { h.torso.rotation.x -= 0.35 * s.hurt; h.head.rotation.x -= 0.3 * s.hurt; }
}

// ---------------------------------------------------------------- Weapons & props
export function makeSword(o = {}) {
  const g = new THREE.Group();
  const L = o.len ?? 0.85, W = o.width ?? 0.065;
  const steel = mat(o.blade ?? 0xcfd6dc, { metalness: 0.85, roughness: 0.28, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 0 });
  g.add(mesh(box(W, L, 0.02), steel, 0, 0.16 + L / 2, 0));
  const tip = mesh(new THREE.ConeGeometry(W * 0.71, 0.14, 4), steel, 0, 0.16 + L + 0.07, 0); tip.rotation.y = Math.PI / 4; tip.scale.z = 0.3; g.add(tip);
  g.add(mesh(box(0.3 * (W / 0.065), 0.045, 0.07), mat(o.guard ?? 0x9c7a3c, { metalness: 0.7, roughness: 0.35 }), 0, 0.14, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8), mat(0x3a2414), 0, 0.02, 0));
  g.add(mesh(sph(0.04, 8, 6), mat(o.guard ?? 0x9c7a3c, { metalness: 0.7, roughness: 0.35 }), 0, -0.1, 0));
  g.rotation.x = Math.PI / 2;
  return g;
}
export function makeAxe() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.85, 7), mat(0x5a3d22), 0, 0.3, 0));
  const head = mesh(box(0.03, 0.22, 0.26), mat(0x8a8f96, { metalness: 0.8, roughness: 0.4 }), 0, 0.62, 0.1); g.add(head);
  g.rotation.x = Math.PI / 2;
  return g;
}
export function makeStaff() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.95, 7), mat(0x4a3220), 0, 0.25, 0));
  g.add(mesh(box(0.04, 0.25, 0.04), mat(0x4a3220), 0, 1.25, 0.06));
  const lantern = new THREE.Group(); lantern.position.set(0, 1.08, 0.16); g.add(lantern);
  lantern.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.04, 6), mat(0x2b2b2b, { metalness: 0.7 }), 0, 0.1, 0));
  lantern.add(mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.04, 6), mat(0x2b2b2b, { metalness: 0.7 }), 0, -0.1, 0));
  lantern.add(mesh(sph(0.065, 10, 8), mat(0xffc066, { emissive: 0xffb040, emissiveIntensity: 6 }), 0, 0, 0, false));
  return g;
}

export function makeChest() {
  const g = new THREE.Group();
  const wood = mat(0x6b4423), iron = mat(0x3a3a3e, { metalness: 0.7, roughness: 0.4 });
  g.add(mesh(box(1.0, 0.55, 0.62), wood, 0, 0.275, 0));
  for (const x of [-0.34, 0.34]) g.add(mesh(box(0.07, 0.57, 0.64), iron, x, 0.275, 0));
  const lid = new THREE.Group(); lid.position.set(0, 0.55, -0.31); g.add(lid);
  const lm = mesh(new THREE.CylinderGeometry(0.31, 0.31, 1.0, 12, 1, false, 0, Math.PI), wood, 0, 0, 0.31); lm.rotation.z = Math.PI / 2; lid.add(lm);
  const lb = mesh(new THREE.CylinderGeometry(0.325, 0.325, 0.07, 12, 1, false, 0, Math.PI), iron, -0.34, 0, 0.31); lb.rotation.z = Math.PI / 2; lid.add(lb);
  const lb2 = lb.clone(); lb2.position.x = 0.34; lid.add(lb2);
  g.add(mesh(box(0.12, 0.14, 0.04), mat(0xc9a24a, { metalness: 0.8, roughness: 0.3 }), 0, 0.5, 0.32));
  return { group: g, lid };
}

export function makeEffigy() {
  const g = new THREE.Group();
  const wood = mat(0x5a3d22), straw = mat(0xc9a75a), burlap = mat(0xa08660);
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.2, 6), wood, 0, 1.1, 0));
  const bar = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), wood, 0, 1.55, 0); bar.rotation.z = Math.PI / 2; g.add(bar);
  const body = mesh(new THREE.CylinderGeometry(0.25, 0.32, 0.9, 8), straw, 0, 1.2, 0); g.add(body);
  g.add(mesh(sph(0.2, 10, 8), burlap, 0, 1.95, 0));
  for (const s of [1, -1]) g.add(mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.5, 6), straw, s * 0.5, 1.55, 0).rotateZ(Math.PI / 2));
  return g;
}

// ---------------------------------------------------------------- Beasts
export function makeWolf(col = 0x6d6a66) {
  const group = new THREE.Group(); const root = new THREE.Group(); group.add(root);
  const fur = mat(col), dark = mat(0x2b2826);
  const body = mesh(cap(0.27, 0.75), fur, 0, 0.78, 0); body.rotation.x = Math.PI / 2; body.scale.set(0.85, 1, 0.95); root.add(body);
  const ruff = mesh(sph(0.33), fur, 0, 0.86, 0.36); ruff.scale.set(0.85, 0.95, 0.9); root.add(ruff);
  const neck = new THREE.Group(); neck.position.set(0, 0.97, 0.6); root.add(neck);
  const head = new THREE.Group(); neck.add(head);
  const sk = mesh(sph(0.19), fur, 0, 0.03, 0.05); sk.scale.set(0.95, 0.88, 1.05); head.add(sk);
  head.add(mesh(box(0.13, 0.11, 0.27), fur, 0, -0.03, 0.26));
  head.add(mesh(sph(0.036, 6, 5), mat(0x111111), 0, 0.0, 0.4));
  const jaw = new THREE.Group(); jaw.position.set(0, -0.07, 0.1); head.add(jaw);
  jaw.add(mesh(box(0.11, 0.04, 0.24), dark, 0, -0.01, 0.14));
  for (const s of [1, -1]) {
    const ear = mesh(new THREE.ConeGeometry(0.06, 0.15, 4), fur, s * 0.09, 0.2, -0.01); ear.rotation.z = -s * 0.2; head.add(ear);
    head.add(mesh(sph(0.03, 6, 5), mat(0xffa020, { emissive: 0xff7a00, emissiveIntensity: 4 }), s * 0.08, 0.07, 0.18, false));
  }
  const legs = [[0.15, 0.34], [-0.15, 0.34], [0.15, -0.36], [-0.15, -0.36]].map(([x, z]) => {
    const g = new THREE.Group(); g.position.set(x, 0.68, z); root.add(g);
    g.add(mesh(cap(0.065, 0.42), fur, 0, -0.3, 0));
    g.add(mesh(sph(0.07, 6, 5), dark, 0, -0.62, 0.03));
    return g;
  });
  const tail = new THREE.Group(); tail.position.set(0, 0.88, -0.52); tail.rotation.x = 1.0; root.add(tail);
  tail.add(mesh(cap(0.075, 0.42), fur, 0, -0.24, 0));
  return { group, root, neck, head, jaw, legs, tail };
}
export function animWolf(w, s) {
  const k = Math.min(s.move || 0, 1.6), ph = s.phase || 0;
  const a = Math.sin(ph) * 0.75 * Math.min(k, 1.2);
  w.legs[0].rotation.x = a; w.legs[3].rotation.x = a; w.legs[1].rotation.x = -a; w.legs[2].rotation.x = -a;
  w.root.position.set(0, Math.abs(Math.cos(ph)) * 0.06 * k, 0);
  w.root.rotation.set(0, 0, 0);
  w.tail.rotation.z = Math.sin(s.t * (k > 0.1 ? 10 : 3)) * 0.35;
  w.tail.rotation.x = 1.0 + k * 0.3;
  w.neck.rotation.x = Math.sin(s.t * 1.3) * 0.05 + (s.growl ? 0.25 : 0);
  w.neck.rotation.y = s.look || 0;
  w.jaw.rotation.x = s.growl ? 0.2 + Math.sin(s.t * 20) * 0.05 : 0.04;
  if (s.attack) {
    const p = s.attack.p;
    const l = Math.sin(Math.min(1, p) * Math.PI);
    w.root.position.z = ss(0.35, 0.6, p) * (1 - ss(0.7, 1, p)) * 0.9;
    w.root.position.y += l * 0.25;
    w.root.rotation.x = -l * 0.25;
    w.neck.rotation.x = 0.35 * l;
    w.jaw.rotation.x = 0.6 * l;
  }
  if (s.hurt > 0) w.root.rotation.x = 0.2 * s.hurt;
}

export function makeSheep() {
  const group = new THREE.Group();
  const wool = mat(0xece6da), face = mat(0x2b2622);
  const b = mesh(new THREE.IcosahedronGeometry(0.45, 1), wool, 0, 0.75, 0); b.scale.set(0.9, 0.8, 1.25); group.add(b);
  const head = new THREE.Group(); head.position.set(0, 0.92, 0.55); group.add(head);
  const hd = mesh(sph(0.15, 8, 6), face, 0, 0, 0.06); hd.scale.set(0.8, 0.9, 1.3); head.add(hd);
  head.add(mesh(new THREE.IcosahedronGeometry(0.13, 0), wool, 0, 0.1, -0.02));
  for (const s of [1, -1]) { const e = mesh(box(0.14, 0.04, 0.06), face, s * 0.12, 0.03, 0); e.rotation.z = s * 0.4; head.add(e); }
  const legs = [[0.17, 0.3], [-0.17, 0.3], [0.17, -0.3], [-0.17, -0.3]].map(([x, z]) => {
    const g = new THREE.Group(); g.position.set(x, 0.48, z); group.add(g);
    g.add(mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.48, 6), face, 0, -0.24, 0));
    return g;
  });
  return { group, head, legs };
}
