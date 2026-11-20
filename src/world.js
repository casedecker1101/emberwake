// Terrain, vegetation, structures, sky, collision
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, mulberry32, ss, clamp, lerp } from './util.js';
import { G } from './game.js';
import { mat, mesh, makeChest, makeSheep } from './models.js';

export const WATER_Y = -1.2;
export const HALF = 300;
export const LIMIT = 282;
export const POI = {
  village: { x: 0, z: 0, r: 50, h: 3, name: 'Millbrook' },
  stones: { x: -115, z: 25, r: 22, h: 6, name: 'The Standing Stones' },
  thornwood: { x: 95, z: -95, r: 70, name: 'Thornwood' },
  camp: { x: 165, z: 45, r: 26, h: 4, name: 'Raider Camp' },
  shrine: { x: -15, z: -205, r: 30, h: 12, name: 'Shrine of Vael' },
  lake: { x: -70, z: 120, r: 58, name: 'Mirrormere' },
};
const FLATS = ['village', 'stones', 'camp', 'shrine'].map((k) => POI[k]);
export const ROADS = [
  [[0, 0], [-35, 8], [-75, 14], [-110, 24]],
  [[0, 0], [25, -25], [52, -52], [78, -78]],
  [[0, 0], [45, 15], [95, 32], [150, 44]],
  [[0, 0], [-3, -60], [-10, -120], [-14, -180]],
];

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  const cx = ax + dx * t - px, cz = az + dz * t - pz;
  return Math.sqrt(cx * cx + cz * cz);
}
export function roadDist(x, z) {
  let m = 1e9;
  for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) m = Math.min(m, segDist(x, z, r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]));
  return m;
}

export function heightAt(x, z) {
  const big = fbm(x * 0.0045, z * 0.0045, 5);
  const small = fbm(x * 0.035 + 31.7, z * 0.035 - 12.3, 3);
  let h = 3 + big * 18;
  const rd = roadDist(x, z);
  h += small * 1.4 * ss(2.5, 7, rd);
  const d = Math.max(Math.abs(x), Math.abs(z));
  h += ss(185, 295, d) * (42 + fbm(x * 0.011, z * 0.011, 4) * 38);
  if (h < 1.5) h = 1.5 - (1.5 - h) * 0.22; // keep lowlands mostly dry; real water lives in Mirrormere
  const lk = POI.lake; const ld = Math.hypot(x - lk.x, z - lk.z);
  h = lerp(h, -6 + fbm(x * 0.05, z * 0.05, 2) * 1.5, 1 - ss(10, lk.r, ld));
  for (const f of FLATS) {
    const fd = Math.hypot(x - f.x, z - f.z);
    if (fd < f.r) h = lerp(h, f.h, 1 - ss(f.r * 0.55, f.r, fd));
  }
  return h;
}

// Walkable platforms (stepped discs)
export const platforms = [];
export function groundAt(x, z) {
  let h = heightAt(x, z);
  for (const p of platforms) {
    if (p.top > h && (x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r) h = p.top;
  }
  return h;
}

export function forestAt(x, z) {
  const tw = POI.thornwood;
  const td = Math.hypot(x - tw.x, z - tw.z);
  let f = fbm(x * 0.008 + 7, z * 0.008 - 3, 3) + (1 - ss(15, tw.r + 25, td)) * 0.5;
  f -= (1 - ss(40, 85, Math.hypot(x, z))) * 0.6;
  return f;
}

// ---------------------------------------------------------------- Collision grid
const CELL = 10; const grid = new Map(); let stamp = 0;
const ckey = (i, j) => i * 10007 + j;
function insert(c, rad) {
  const i0 = Math.floor((c.x - rad) / CELL), i1 = Math.floor((c.x + rad) / CELL);
  const j0 = Math.floor((c.z - rad) / CELL), j1 = Math.floor((c.z + rad) / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const k = ckey(i, j); let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(c);
  }
}
export function addCircle(x, z, r) { const c = { b: 0, x, z, r, s: 0 }; insert(c, r); return c; }
export function addBox(x, z, hw, hd, rot = 0) {
  const c = { b: 1, x, z, hw, hd, cos: Math.cos(rot), sin: Math.sin(rot), s: 0 };
  insert(c, Math.hypot(hw, hd)); return c;
}
export function collide(pos, r) {
  stamp++;
  const i0 = Math.floor((pos.x - r) / CELL), i1 = Math.floor((pos.x + r) / CELL);
  const j0 = Math.floor((pos.z - r) / CELL), j1 = Math.floor((pos.z + r) / CELL);
  let hit = false;
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const a = grid.get(ckey(i, j)); if (!a) continue;
    for (const c of a) {
      if (c.s === stamp || c.off) continue; c.s = stamp;
      if (!c.b) {
        const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = r + c.r;
        if (d < m && d > 1e-5) { pos.x = c.x + (dx / d) * m; pos.z = c.z + (dz / d) * m; hit = true; }
      } else {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        let lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
        const qx = clamp(lx, -c.hw, c.hw), qz = clamp(lz, -c.hd, c.hd);
        const ox = lx - qx, oz = lz - qz, d2 = ox * ox + oz * oz;
        if (d2 > 0) {
          if (d2 >= r * r) continue;
          const d = Math.sqrt(d2), push = (r - d) / d; lx += ox * push; lz += oz * push;
        } else {
          const px = c.hw - Math.abs(lx) + r, pz = c.hd - Math.abs(lz) + r;
          if (px < pz) lx += Math.sign(lx || 1) * px; else lz += Math.sign(lz || 1) * pz;
        }
        pos.x = c.x + lx * c.cos + lz * c.sin; pos.z = c.z - lx * c.sin + lz * c.cos; hit = true;
      }
    }
  }
  return hit;
}

// Tree canopy lookup (for camera occlusion)
const tgrid = new Map();
function addTree(x, y, z, s, pine) {
  const k = ckey(Math.floor(x / CELL), Math.floor(z / CELL)); let a = tgrid.get(k); if (!a) { a = []; tgrid.set(k, a); }
  a.push({ x, z, y0: y + 1.4 * s, y1: y + 6 * s, r: (pine ? 1.5 : 2.0) * s });
}
export function inCanopy(x, y, z) {
  const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
  for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) {
    const l = tgrid.get(ckey(a, b)); if (!l) continue;
    for (const t of l) if (y > t.y0 && y < t.y1 && (x - t.x) ** 2 + (z - t.z) ** 2 < t.r * t.r) return true;
  }
  return false;
}

// ---------------------------------------------------------------- Terrain
function buildTerrain() {
  const SEG = 260;
  const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const cols = new Float32Array(pos.count * 3);
  const C = (h) => new THREE.Color(h);
  const cGrass = C(0x4b7a2c), cGrass2 = C(0x7a9a3e), cDry = C(0x9c9150), cDirt = C(0x7a5b3a), cRock = C(0x6f6a62),
    cSnow = C(0xe8edf2), cSand = C(0xbfae7f), cForest = C(0x35532a), cMud = C(0x4a4a3a), cPlaza = C(0x8c7458), cStone = C(0x8a8580);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i), ny = nrm.getY(i);
    const n1 = fbm(x * 0.02, z * 0.02, 2) * 0.5 + 0.5;
    col.copy(cGrass).lerp(cGrass2, ss(0.3, 0.8, n1));
    col.lerp(cDry, ss(0.55, 0.85, fbm(x * 0.008 + 100, z * 0.008, 2) * 0.5 + 0.5) * 0.55);
    col.lerp(cForest, ss(0.1, 0.5, forestAt(x, z)) * 0.8);
    const rd = roadDist(x, z);
    col.lerp(cDirt, (1 - ss(1.6, 3.6, rd)) * 0.92);
    const vd = Math.hypot(x, z);
    col.lerp(cPlaza, (1 - ss(7, 11, vd)) * 0.9);
    const cd = Math.hypot(x - POI.camp.x, z - POI.camp.z);
    col.lerp(cMud, (1 - ss(10, 17, cd)) * 0.8);
    const sd = Math.hypot(x - POI.shrine.x, z - POI.shrine.z);
    col.lerp(cStone, (1 - ss(15, 22, sd)) * 0.7);
    const std = Math.hypot(x - POI.stones.x, z - POI.stones.z);
    col.lerp(cDry, (1 - ss(6, 14, std)) * 0.4);
    col.lerp(cSand, 1 - ss(WATER_Y + 0.2, WATER_Y + 1.4, h));
    col.lerp(cRock, ss(0.86, 0.68, ny));
    col.lerp(cRock, ss(28, 40, h) * 0.8);
    col.lerp(cSnow, ss(52, 62, h + fbm(x * 0.05, z * 0.05, 2) * 6) * ss(0.6, 0.8, ny));
    const v = 0.92 + fbm(x * 0.3, z * 0.3, 2) * 0.16;
    cols[i * 3] = col.r * v; cols[i * 3 + 1] = col.g * v; cols[i * 3 + 2] = col.b * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const terrain = new THREE.Mesh(geo, m);
  terrain.receiveShadow = true;
  G.scene.add(terrain);

  // water
  const wg = new THREE.PlaneGeometry(HALF * 2, HALF * 2, 1, 1); wg.rotateX(-Math.PI / 2);
  const wm = new THREE.MeshStandardMaterial({ color: 0x2c5f7c, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.82 });
  wm.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = G.refs.timeU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; varying vec3 vWP;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float w1 = sin(vWP.x*0.35 + uTime*1.3) * cos(vWP.z*0.31 - uTime*1.1);
        float w2 = sin(vWP.x*1.1 - vWP.z*0.9 + uTime*2.3) * 0.5;
        normal = normalize(normal + vec3(w1*0.12 + w2*0.06, 0.0, w2*0.1 - w1*0.08));`);
  };
  const water = new THREE.Mesh(wg, wm); water.position.y = WATER_Y; water.receiveShadow = true;
  G.scene.add(water);
  return terrain;
}

// ---------------------------------------------------------------- Vegetation
function buildVegetation() {
  const rng = mulberry32(77);
  const pineFol = mergeGeometries([
    new THREE.ConeGeometry(1.6, 2.6, 7).translate(0, 2.6, 0),
    new THREE.ConeGeometry(1.25, 2.2, 7).translate(0, 3.9, 0),
    new THREE.ConeGeometry(0.85, 1.8, 7).translate(0, 5.0, 0),
  ]);
  const pineTrunk = new THREE.CylinderGeometry(0.14, 0.26, 2.2, 6).translate(0, 1.1, 0);
  const oakFol = mergeGeometries([
    new THREE.IcosahedronGeometry(1.7, 1).translate(0, 4.0, 0),
    new THREE.IcosahedronGeometry(1.3, 1).translate(1.1, 3.5, 0.3),
    new THREE.IcosahedronGeometry(1.2, 1).translate(-0.9, 3.7, -0.5),
    new THREE.IcosahedronGeometry(1.1, 1).translate(0.2, 4.9, -0.2),
  ]);
  const oakTrunk = new THREE.CylinderGeometry(0.22, 0.38, 3.2, 7).translate(0, 1.6, 0);
  const trunkMat = mat(0x4a3324);
  const folMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  const pines = [], oaks = [];
  const tryPlace = (x, z, forced = false) => {
    const h = heightAt(x, z);
    if (h < WATER_Y + 0.8 || h > 40) return false;
    if (roadDist(x, z) < 4.5) return false;
    for (const f of FLATS) if (Math.hypot(x - f.x, z - f.z) < f.r * 0.8 + 3) return false;
    if (!forced) {
      const p = ss(0.02, 0.5, forestAt(x, z)) * 0.55 + 0.012;
      if (rng() > p) return false;
    }
    const s = 0.75 + rng() * 0.75;
    const tw = Math.hypot(x - POI.thornwood.x, z - POI.thornwood.z) < POI.thornwood.r + 10;
    const isPine = tw ? rng() < 0.75 : rng() < 0.45;
    (isPine ? pines : oaks).push({ x, y: h - 0.2, z, s, r: rng() * Math.PI * 2 });
    addCircle(x, z, 0.45 * s); addTree(x, h, z, s, isPine);
    return true;
  };
  for (let n = 0; n < 16000 && pines.length + oaks.length < 2600; n++) {
    tryPlace((rng() * 2 - 1) * (LIMIT + 10), (rng() * 2 - 1) * (LIMIT + 10));
  }
  // a few shade trees in the village outskirts
  for (const [x, z] of [[-30, 20], [32, -30], [-40, -6], [38, 14], [-14, 38], [22, 40]]) {
    const h = heightAt(x, z); oaks.push({ x, y: h - 0.2, z, s: 1.1, r: rng() * 6 }); addCircle(x, z, 0.5);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const build = (list, trunkG, folG, tints) => {
    const tr = new THREE.InstancedMesh(trunkG, trunkMat, list.length);
    const fo = new THREE.InstancedMesh(folG, folMat, list.length);
    const c = new THREE.Color();
    list.forEach((t, i) => {
      e.set((rng() - 0.5) * 0.08, t.r, (rng() - 0.5) * 0.08); q.setFromEuler(e);
      sc.set(t.s, t.s * (0.9 + rng() * 0.3), t.s); p.set(t.x, t.y, t.z);
      m4.compose(p, q, sc); tr.setMatrixAt(i, m4); fo.setMatrixAt(i, m4);
      c.setHex(tints[Math.floor(rng() * tints.length)]).multiplyScalar(0.85 + rng() * 0.3); fo.setColorAt(i, c);
    });
    for (const im of [tr, fo]) { im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); G.scene.add(im); }
  };
  build(pines, pineTrunk, pineFol, [0x2f5a32, 0x274d2b, 0x3a6438, 0x2a5236]);
  build(oaks, oakTrunk, oakFol, [0x4f7d32, 0x5e8a36, 0x6b8f3a, 0x8a8a3a, 0xa0782e]);

  // rocks
  const rockG = new THREE.DodecahedronGeometry(1, 0);
  const rocks = [];
  for (let n = 0; n < 3000 && rocks.length < 520; n++) {
    const x = (rng() * 2 - 1) * LIMIT, z = (rng() * 2 - 1) * LIMIT;
    const h = heightAt(x, z);
    if (h < WATER_Y - 0.5 || roadDist(x, z) < 4) continue;
    let bad = false; for (const f of FLATS) if (Math.hypot(x - f.x, z - f.z) < f.r * 0.7) bad = true; if (bad) continue;
    const s = 0.3 + rng() ** 2 * 2.2;
    rocks.push({ x, y: h - s * 0.35, z, s });
    if (s > 0.9) addCircle(x, z, s * 0.8);
  }
  const rim = new THREE.InstancedMesh(rockG, mat(0x7a756d, { flatShading: true, roughness: 0.95 }), rocks.length);
  const c = new THREE.Color();
  rocks.forEach((r, i) => {
    e.set(rng() * 3, rng() * 3, rng() * 3); q.setFromEuler(e); sc.set(r.s * (0.8 + rng() * 0.5), r.s * (0.6 + rng() * 0.4), r.s * (0.8 + rng() * 0.5));
    p.set(r.x, r.y, r.z); m4.compose(p, q, sc); rim.setMatrixAt(i, m4);
    c.setHSL(0.08, 0.06 + rng() * 0.06, 0.38 + rng() * 0.14); rim.setColorAt(i, c);
  });
  rim.castShadow = true; rim.receiveShadow = true; G.scene.add(rim);

  // grass (wind-animated instanced tufts)
  const blades = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng(), hgt = 0.35 + rng() * 0.3, w = 0.05, lean = 0.12;
    const g = new THREE.BufferGeometry();
    const bx = Math.cos(a), bz = Math.sin(a);
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      -w * bz, 0, w * bx, w * bz, 0, -w * bx, bx * lean, hgt, bz * lean,
    ], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    blades.push(g);
  }
  const tuft = mergeGeometries(blades);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide });
  grassMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = G.refs.timeU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float wv = sin(uTime*1.8 + ip.x*0.25 + ip.z*0.18) + 0.5*sin(uTime*3.1 + ip.x*0.7);
          transformed.x += wv * 0.09 * position.y * 2.0;
          transformed.z += wv * 0.05 * position.y * 2.0;
        #endif`);
  };
  const GRASS_N = 70000;
  const grass = new THREE.InstancedMesh(tuft, grassMat, GRASS_N);
  let gi = 0;
  for (let n = 0; n < GRASS_N * 3 && gi < GRASS_N; n++) {
    const R = n < GRASS_N * 1.2 ? 110 : 240;
    const x = (rng() * 2 - 1) * R, z = (rng() * 2 - 1) * R;
    const h = heightAt(x, z);
    if (h < WATER_Y + 0.6 || h > 26 || roadDist(x, z) < 2.6 || Math.hypot(x, z) < 11) continue;
    if (Math.hypot(x - POI.camp.x, z - POI.camp.z) < 15 || Math.hypot(x - POI.shrine.x, z - POI.shrine.z) < 17) continue;
    const s = 0.7 + rng() * 0.9;
    e.set(0, rng() * 6.28, 0); q.setFromEuler(e); sc.set(s, s * (0.8 + rng() * 0.6), s); p.set(x, h - 0.03, z);
    m4.compose(p, q, sc); grass.setMatrixAt(gi, m4);
    const n1 = fbm(x * 0.02, z * 0.02, 2) * 0.5 + 0.5;
    c.setHex(0x5c8a34).lerp(new THREE.Color(0x9aa64a), ss(0.4, 0.9, n1) * 0.7).multiplyScalar(0.75 + rng() * 0.4);
    grass.setColorAt(gi, c); gi++;
  }
  grass.count = gi; grass.receiveShadow = true; grass.computeBoundingSphere();
  G.scene.add(grass); G.refs.grass = grass; G.refs.grassMax = gi;

  // wildflowers
  const fg = new THREE.IcosahedronGeometry(0.07, 0);
  const FL = 4000; const fl = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), FL);
  const fcols = [0xf2e15a, 0xf4f1ea, 0xb889e0, 0xe86a5a, 0x7fb6f0];
  let fi = 0;
  for (let n = 0; n < FL * 4 && fi < FL; n++) {
    const x = (rng() * 2 - 1) * 200, z = (rng() * 2 - 1) * 200; const h = heightAt(x, z);
    if (h < WATER_Y + 0.8 || h > 22 || roadDist(x, z) < 3 || forestAt(x, z) > 0.2 || Math.hypot(x, z) < 12) continue;
    if (fbm(x * 0.03 + 9, z * 0.03, 2) < 0.1) continue;
    m4.makeTranslation(x, h + 0.25 + rng() * 0.15, z); fl.setMatrixAt(fi, m4);
    c.setHex(fcols[Math.floor(rng() * fcols.length)]); fl.setColorAt(fi, c); fi++;
  }
  fl.count = fi; G.scene.add(fl);
}

// ---------------------------------------------------------------- Structures
const W = {};
function initMats() {
  W.plaster = mat(0xd8cbb0); W.wood = mat(0x4b321f); W.darkWood = mat(0x352215); W.stone = mat(0x8b867e, { flatShading: true });
  W.thatch = mat(0x9a7a43, { roughness: 1 }); W.slate = mat(0x4d5361, { roughness: 0.7 }); W.door = mat(0x5a3a22);
  W.iron = mat(0x3c3c40, { metalness: 0.7, roughness: 0.45 });
  W.window = new THREE.MeshStandardMaterial({ color: 0x2a1d10, emissive: 0xffa848, emissiveIntensity: 0.15, roughness: 0.6 });
  W.lamp = new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xffb050, emissiveIntensity: 0.2 });
  W.rune = new THREE.MeshStandardMaterial({ color: 0x113344, emissive: 0x47d6ff, emissiveIntensity: 3, side: THREE.DoubleSide });
  G.refs.windowMat = W.window; G.refs.lampMat = W.lamp; G.refs.runeMat = W.rune;
}
function B(w, h, d, m, x, y, z, parent, ry = 0) {
  const me = mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z); me.rotation.y = ry; parent.add(me); return me;
}
function Cy(rt, rb, h, seg, m, x, y, z, parent) { const me = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z); parent.add(me); return me; }

function placeGroup(g, x, z, rot = 0, y = null) {
  g.position.set(x, y ?? groundAt(x, z), z); g.rotation.y = rot; G.scene.add(g); g.updateMatrixWorld(true); return g;
}
function minGround(x, z, rx, rz) {
  let m = 1e9;
  for (const [a, b] of [[-rx, -rz], [rx, -rz], [-rx, rz], [rx, rz], [0, 0]]) m = Math.min(m, heightAt(x + a, z + b));
  return m;
}

function makeHouse(x, z, w, d, wallH, opts = {}) {
  const rot = opts.rot ?? Math.atan2(-x, -z);
  const g = new THREE.Group();
  const base = minGround(x, z, Math.max(w, d) / 2, Math.max(w, d) / 2);
  B(w + 0.3, 1.4, d + 0.3, W.stone, 0, -0.1, 0, g);
  B(w, wallH, d, opts.wall ?? W.plaster, 0, 0.6 + wallH / 2, 0, g);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(0.24, wallH, 0.24, W.wood, (sx * w) / 2, 0.6 + wallH / 2, (sz * d) / 2, g);
  for (const sz of [-1, 1]) { B(w + 0.1, 0.18, 0.12, W.wood, 0, 0.6 + wallH * 0.52, (sz * (d + 0.08)) / 2, g); B(w + 0.1, 0.2, 0.14, W.wood, 0, 0.6 + wallH - 0.1, (sz * (d + 0.1)) / 2, g); }
  for (const sx of [-1, 1]) { B(0.12, 0.18, d + 0.1, W.wood, (sx * (w + 0.08)) / 2, 0.6 + wallH * 0.52, 0, g); }
  // diagonal braces
  for (const sx of [-1, 1]) { const br = B(0.1, wallH * 0.62, 0.1, W.wood, sx * w * 0.32, 0.6 + wallH * 0.27, d / 2 + 0.06, g); br.rotation.z = sx * 0.6; }
  B(1.1, 1.95, 0.14, W.door, 0, 0.6 + 0.97, d / 2 + 0.03, g);
  B(1.3, 0.12, 0.2, W.wood, 0, 0.6 + 2.0, d / 2 + 0.06, g);
  for (const sx of [-1, 1]) {
    B(0.75, 0.65, 0.1, W.window, sx * w * 0.3, 0.6 + wallH * 0.75, d / 2 + 0.03, g);
    B(0.1, 0.65, d * 0.35, W.window, (sx * (w + 0.04)) / 2, 0.6 + wallH * 0.62, 0, g);
    B(0.85, 0.08, 0.16, W.wood, sx * w * 0.3, 0.6 + wallH * 0.75 - 0.36, d / 2 + 0.07, g);
  }
  const rh = w * 0.48, ov = 0.55;
  const shape = new THREE.Shape(); shape.moveTo(-w / 2 - ov, 0); shape.lineTo(w / 2 + ov, 0); shape.lineTo(0, rh); shape.closePath();
  const rg = new THREE.ExtrudeGeometry(shape, { depth: d + 0.9, bevelEnabled: false }); rg.translate(0, 0, -(d + 0.9) / 2);
  const roof = mesh(rg, opts.roof ?? W.thatch, 0, 0.6 + wallH - 0.05, 0); g.add(roof);
  // ridge
  B(0.25, 0.2, d + 1.0, W.darkWood, 0, 0.6 + wallH + rh - 0.05, 0, g);
  const ch = B(0.6, 2.4, 0.6, W.stone, w * 0.24, 0.6 + wallH + rh * 0.55, -d * 0.18, g);
  placeGroup(g, x, z, rot, base);
  addBox(x, z, w / 2 + 0.2, d / 2 + 0.2, rot);
  const top = new THREE.Vector3(0, 1.25, 0); ch.localToWorld(top);
  G.refs.chimneys.push(top);
  return g;
}

function fenceLine(pts, gaps = []) {
  const post = new THREE.CylinderGeometry(0.07, 0.08, 1.2, 5);
  const g = new THREE.Group();
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 2.2);
    for (let i = 0; i < n; i++) {
      if (gaps.includes(s + ':' + i)) continue;
      const t0 = i / n, t1 = (i + 1) / n;
      const x0 = lerp(ax, bx, t0), z0 = lerp(az, bz, t0), x1 = lerp(ax, bx, t1), z1 = lerp(az, bz, t1);
      const y0 = heightAt(x0, z0), y1 = heightAt(x1, z1);
      g.add(mesh(post, W.wood, x0, y0 + 0.55, z0));
      const len = Math.hypot(x1 - x0, z1 - z0, y1 - y0);
      for (const hh of [0.4, 0.85]) {
        const r = mesh(new THREE.BoxGeometry(0.06, 0.09, len), W.wood, (x0 + x1) / 2, (y0 + y1) / 2 + hh, (z0 + z1) / 2);
        r.lookAt(x1, y1 + hh, z1); g.add(r);
      }
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      addBox(mx, mz, 0.15, Math.hypot(x1 - x0, z1 - z0) / 2, Math.atan2(x1 - x0, z1 - z0));
    }
    const [ex, ez] = pts[s + 1]; g.add(mesh(post, W.wood, ex, heightAt(ex, ez) + 0.55, ez));
  }
  G.scene.add(g);
}

function prop(kind, x, z, rot = 0) {
  const g = new THREE.Group();
  if (kind === 'barrel') {
    Cy(0.38, 0.33, 0.95, 10, mat(0x6e4a2a), 0, 0.47, 0, g);
    for (const y of [0.18, 0.76]) Cy(0.39, 0.39, 0.06, 10, W.iron, 0, y, 0, g);
    addCircle(x, z, 0.45);
  } else if (kind === 'crate') {
    B(0.9, 0.9, 0.9, mat(0x8a6a40), 0, 0.45, 0, g);
    B(0.95, 0.1, 0.95, W.wood, 0, 0.88, 0, g);
    addBox(x, z, 0.5, 0.5, rot);
  } else if (kind === 'hay') {
    const h = mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 12), mat(0xc9a75a, { roughness: 1 }), 0, 0.7, 0); h.rotation.z = Math.PI / 2; g.add(h);
    addCircle(x, z, 0.8);
  } else if (kind === 'lamp') {
    Cy(0.07, 0.09, 2.6, 6, W.darkWood, 0, 1.3, 0, g);
    B(0.6, 0.07, 0.07, W.darkWood, 0.25, 2.5, 0, g);
    B(0.22, 0.3, 0.22, W.lamp, 0.5, 2.28, 0, g);
    addCircle(x, z, 0.2);
  } else if (kind === 'cart') {
    B(1.4, 0.15, 2.4, mat(0x7a5530), 0, 0.75, 0, g);
    for (const sx of [-1, 1]) B(0.08, 0.4, 2.4, mat(0x7a5530), sx * 0.7, 1.0, 0, g);
    for (const sx of [-1, 1]) { const wh = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 12), W.darkWood, sx * 0.8, 0.5, -0.4); wh.rotation.z = Math.PI / 2; g.add(wh); }
    const sh = B(0.08, 0.08, 1.6, W.wood, 0, 0.6, 1.9, g); sh.rotation.x = 0.3;
    addBox(x, z, 0.8, 1.3, rot);
  }
  placeGroup(g, x, z, rot);
  return g;
}

function buildVillage() {
  const V = POI.village;
  // houses ring
  const houses = [
    [-18, -13, 6, 7, 2.8, {}], [-23, 7, 5.5, 6.5, 2.6, { roof: W.slate }], [-11, 22, 6, 7, 2.8, {}],
    [11, 23, 5.5, 6, 2.6, { roof: W.slate }], [25, 6, 6, 7.5, 3.0, {}], [-3, -27, 9, 8, 3.4, { roof: W.slate }],
    [-30, -2, 5, 5.5, 2.4, {}], [3, 34, 5, 5.5, 2.4, {}],
  ];
  for (const [x, z, w, d, h, o] of houses) makeHouse(x, z, w, d, h, o);

  // well
  const well = new THREE.Group();
  const ring = mesh(new THREE.CylinderGeometry(1.2, 1.3, 0.9, 14, 1, true), W.stone, 0, 0.45, 0); ring.material = mat(0x8b867e, { flatShading: true, side: THREE.DoubleSide }); well.add(ring);
  Cy(1.32, 1.32, 0.12, 14, W.stone, 0, 0.9, 0, well);
  Cy(1.15, 1.15, 0.05, 14, mat(0x1d3a48, { roughness: 0.1, metalness: 0.4 }), 0, 0.3, 0, well);
  for (const sx of [-1, 1]) B(0.14, 2.1, 0.14, W.wood, sx * 1.05, 1.5, 0, well);
  const wr = new THREE.Shape(); wr.moveTo(-1.6, 0); wr.lineTo(1.6, 0); wr.lineTo(0, 0.9); wr.closePath();
  const wrg = new THREE.ExtrudeGeometry(wr, { depth: 2.0, bevelEnabled: false }); wrg.translate(0, 0, -1);
  well.add(mesh(wrg, W.thatch, 0, 2.5, 0));
  const axle = mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.1, 8), W.wood, 0, 2.0, 0); axle.rotation.z = Math.PI / 2; well.add(axle);
  Cy(0.18, 0.15, 0.28, 8, mat(0x6e4a2a), 0, 1.45, 0, well);
  placeGroup(well, 0, 0, 0.3);
  addCircle(0, 0, 1.45);
  G.refs.wellPos = new THREE.Vector3(0, groundAt(0, 0), 0);

  // smithy (open forge shed)
  const sx = 16, sz = -11, srot = Math.atan2(-sx, -sz);
  const sm = new THREE.Group();
  B(7.6, 0.25, 6.2, W.stone, 0, 0.0, 0, sm);
  for (const px of [-3.5, 3.5]) for (const pz of [-2.8, 2.8]) B(0.3, 3.6, 0.3, W.wood, px, 1.8, pz, sm);
  const rf = B(8.4, 0.2, 7.2, W.slate, 0, 3.75, 0, sm); rf.rotation.x = -0.12;
  B(7.4, 2.2, 0.3, W.stone, 0, 1.1, -2.85, sm); // back wall
  // forge
  const forge = new THREE.Group(); forge.position.set(-1.6, 0, -1.8); sm.add(forge);
  B(2.4, 1.1, 1.6, W.stone, 0, 0.55, 0, forge);
  B(1.8, 0.12, 1.1, new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff5a10, emissiveIntensity: 3.2 }), 0, 1.12, 0, forge);
  const fch = B(1.2, 4.8, 1.0, W.stone, 0, 2.4, -0.4, forge);
  B(0.9, 0.8, 0.9, W.stone, 0, 4.9, -0.4, forge);
  // anvil
  const anv = new THREE.Group(); anv.position.set(1.2, 0, 0.3); sm.add(anv);
  B(0.4, 0.6, 0.4, W.darkWood, 0, 0.3, 0, anv);
  B(0.35, 0.25, 0.9, W.iron, 0, 0.72, 0, anv);
  const horn = mesh(new THREE.ConeGeometry(0.12, 0.4, 6), W.iron, 0, 0.75, 0.6); horn.rotation.x = Math.PI / 2; anv.add(horn);
  // quench barrel, tools rack
  Cy(0.4, 0.38, 0.8, 10, mat(0x6e4a2a), 2.6, 0.4, -1.8, sm);
  Cy(0.36, 0.36, 0.02, 10, mat(0x1d3a48, { roughness: 0.1 }), 2.6, 0.79, -1.8, sm);
  placeGroup(sm, sx, sz, srot);
  G.refs.smithy = sm; G.refs.smithyRot = srot;
  addBox(sx, sz, 3.8, 0.3, srot); // back wall approx (local z -2.85 handled below)
  {
    const wp = new THREE.Vector3(0, 0, -2.85); sm.localToWorld(wp); addBox(wp.x, wp.z, 3.8, 0.25, srot);
    const fp = new THREE.Vector3(-1.6, 0, -1.8); sm.localToWorld(fp); addBox(fp.x, fp.z, 1.25, 0.85, srot);
    const ap = new THREE.Vector3(1.2, 0, 0.3); sm.localToWorld(ap); addCircle(ap.x, ap.z, 0.4);
  }
  const forgeTop = new THREE.Vector3(-1.6, 1.3, -1.8); sm.localToWorld(forgeTop);
  G.refs.forgePos = forgeTop;
  const smoke = new THREE.Vector3(-1.6, 5.4, -2.2); sm.localToWorld(smoke); G.refs.chimneys.push(smoke);
  const fl = new THREE.PointLight(0xff7a2a, 25, 14, 1.6); fl.position.copy(forgeTop).add(new THREE.Vector3(0, 0.8, 0)); G.scene.add(fl); G.refs.forgeLight = fl;
  // smith's chest (behind the shed, on the outside)
  const chestP = new THREE.Vector3(3.0, 0, 1.6); sm.localToWorld(chestP);
  const ch = makeChest(); placeGroup(ch.group, chestP.x, chestP.z, srot + Math.PI * 0.5);
  addBox(chestP.x, chestP.z, 0.55, 0.35, srot + Math.PI * 0.5);
  G.refs.smithChest = { pos: new THREE.Vector3(chestP.x, groundAt(chestP.x, chestP.z), chestP.z), lid: ch.lid };

  // sheepfold
  const fx = -32, fz = -24;
  fenceLine([[fx - 7, fz - 6], [fx + 7, fz - 6], [fx + 7, fz + 6], [fx - 7, fz + 6], [fx - 7, fz - 6]], ['2:2', '2:3']);
  G.refs.fold = { x: fx, z: fz, hw: 6, hd: 5 };
  for (let i = 0; i < 7; i++) {
    const s = makeSheep(); const x = fx + (Math.random() - 0.5) * 10, z = fz + (Math.random() - 0.5) * 8;
    s.group.position.set(x, heightAt(x, z), z); s.group.rotation.y = Math.random() * 6; G.scene.add(s.group);
    G.sheep.push({ m: s, x, z, yaw: s.group.rotation.y, tx: x, tz: z, wait: Math.random() * 4, phase: 0 });
  }
  // fields (crop rows)
  const cropG = new THREE.ConeGeometry(0.22, 0.7, 5); const crops = [];
  for (let r = 0; r < 9; r++) for (let i = 0; i < 18; i++) crops.push([30 + r * 1.4, 18 + i * 1.0]);
  for (let r = 0; r < 8; r++) for (let i = 0; i < 16; i++) crops.push([-38 + r * 1.4, 24 + i * 1.0]);
  const cim = new THREE.InstancedMesh(cropG, mat(0x7d9a35, { flatShading: true }), crops.length);
  const m4 = new THREE.Matrix4();
  crops.forEach(([x, z], i) => { m4.makeTranslation(x, heightAt(x, z) + 0.3, z); cim.setMatrixAt(i, m4); });
  cim.castShadow = true; G.scene.add(cim);
  fenceLine([[28.5, 16.5], [42.5, 16.5], [42.5, 36.5]]);

  // props
  prop('cart', 8, -6, 0.4); prop('barrel', 20.5, -4, 0); prop('barrel', 21.3, -4.8, 0); prop('crate', 6, 9, 0.3); prop('crate', 6.8, 10.1, 0.9);
  prop('hay', -26, -14, 0.4); prop('hay', -24.5, -15.8, 1.2); prop('barrel', -8, 13, 0); prop('crate', -16, -4, 0.2);
  for (const [x, z] of [[6, -4], [-6, 5], [5, 15], [-12, -8], [12, 4], [-5, -16], [16, 12], [-18, 14]]) prop('lamp', x, z, Math.atan2(-x, -z) + Math.PI / 2);
  // notice board
  const nb = new THREE.Group(); for (const s of [-1, 1]) B(0.12, 2.2, 0.12, W.wood, s * 0.8, 1.1, 0, nb);
  B(1.8, 1.1, 0.08, mat(0x7a5a38), 0, 1.5, 0, nb); B(0.5, 0.6, 0.02, mat(0xe8dcc0), -0.4, 1.5, 0.06, nb); B(0.4, 0.45, 0.02, mat(0xe8dcc0), 0.35, 1.6, 0.06, nb);
  placeGroup(nb, 7, -1, -0.8); addBox(7, -1, 0.9, 0.2, -0.8);

  G.refs.villageLight = new THREE.PointLight(0xffb060, 0, 22, 1.5);
  G.refs.villageLight.position.set(0, groundAt(0, 0) + 4, 0); G.scene.add(G.refs.villageLight);
}

function buildStones() {
  const S = POI.stones; const rng = mulberry32(9);
  const sm = mat(0x77736c, { flatShading: true });
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2, r = 10;
    const x = S.x + Math.cos(a) * r, z = S.z + Math.sin(a) * r;
    const h = 3.6 + rng() * 1.8;
    const st = mesh(new THREE.BoxGeometry(1.3, h, 0.85, 1, 3, 1), sm, x, heightAt(x, z) + h / 2 - 0.3, z);
    st.rotation.set((rng() - 0.5) * 0.12, -a + Math.PI / 2, (rng() - 0.5) * 0.12); G.scene.add(st);
    addCircle(x, z, 0.85);
    if (i % 3 === 0) { // lintel
      const a2 = ((i + 1) / 11) * Math.PI * 2;
      const x2 = S.x + Math.cos(a2) * r, z2 = S.z + Math.sin(a2) * r;
      const lt = mesh(new THREE.BoxGeometry(1.0, 0.7, Math.hypot(x2 - x, z2 - z) + 1.2), sm, (x + x2) / 2, heightAt(x, z) + h - 0.1, (z + z2) / 2);
      lt.lookAt(x2, lt.position.y, z2); G.scene.add(lt);
    }
  }
  // Kindle Stone
  const ks = new THREE.Group();
  const core = mesh(new THREE.CylinderGeometry(0.7, 1.0, 2.6, 6), sm, 0, 1.2, 0); ks.add(core);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const rp = mesh(new THREE.PlaneGeometry(0.35, 1.2), W.rune, Math.sin(a) * 0.86, 1.3, Math.cos(a) * 0.86, false);
    rp.rotation.y = a; rp.rotation.x = -0.1; ks.add(rp);
  }
  placeGroup(ks, S.x, S.z, 0);
  addCircle(S.x, S.z, 1.1);
  const kl = new THREE.PointLight(0x47d6ff, 8, 14, 1.6); kl.position.set(S.x, heightAt(S.x, S.z) + 2.5, S.z); G.scene.add(kl);
  G.refs.kindleStone = new THREE.Vector3(S.x, heightAt(S.x, S.z), S.z); G.refs.kindleLight = kl;
  G.refs.effigySpots = [0.6, 2.4, 4.4].map((a) => ({ x: S.x + Math.cos(a) * 16, z: S.z + Math.sin(a) * 16 }));
}

function buildCamp() {
  const C = POI.camp; const rng = mulberry32(3);
  const stakeG = new THREE.CylinderGeometry(0.18, 0.22, 3.4, 6), tipG = new THREE.ConeGeometry(0.2, 0.5, 6);
  const sw = mat(0x5a3f26);
  const R = 15;
  for (let i = 0; i < 80; i++) {
    const a = (i / 80) * Math.PI * 2;
    if (Math.abs(((a - Math.PI + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.24) continue; // west gate
    const x = C.x + Math.cos(a) * R, z = C.z + Math.sin(a) * R, y = heightAt(x, z);
    const tilt = (rng() - 0.5) * 0.1, hh = 3 + rng() * 0.8;
    const s = mesh(stakeG, sw, x, y + hh / 2 - 0.3, z); s.scale.y = hh / 3.4; s.rotation.z = tilt; G.scene.add(s);
    G.scene.add(mesh(tipG, sw, x, y + hh - 0.05, z));
    addCircle(x, z, 0.4);
  }
  const tentCols = [0x6d4a35, 0x5e4c3c, 0x7a3a2a, 0x4e4a40];
  const tents = [[8, -6, 2.6], [-2, -9, 2.3], [6, 7, 2.3], [-7, 6, 2.0], [10, 1, 2.0]];
  tents.forEach(([dx, dz, r], i) => {
    const x = C.x + dx, z = C.z + dz;
    const t = mesh(new THREE.ConeGeometry(r, r * 1.35, 7, 1, true), mat(tentCols[i % 4], { side: THREE.DoubleSide, flatShading: true }), x, heightAt(x, z) + r * 0.67, z);
    G.scene.add(t);
    G.scene.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, r * 1.6, 5), W.darkWood, x, heightAt(x, z) + r * 0.8, z));
    addCircle(x, z, r * 0.85);
  });
  // campfire
  const fx = C.x - 1, fz = C.z + 0.5, fy = heightAt(fx, fz);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; G.scene.add(mesh(new THREE.DodecahedronGeometry(0.28, 0), W.stone, fx + Math.cos(a) * 1.0, fy + 0.1, fz + Math.sin(a) * 1.0)); }
  for (let i = 0; i < 4; i++) { const l = mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.3, 6), W.darkWood, fx, fy + 0.2, fz); l.rotation.set(Math.PI / 2 - 0.3, (i * Math.PI) / 2, 0); G.scene.add(l); }
  addCircle(fx, fz, 1.1);
  const cl = new THREE.PointLight(0xff8a3a, 30, 18, 1.6); cl.position.set(fx, fy + 1.5, fz); G.scene.add(cl);
  G.refs.campFire = new THREE.Vector3(fx, fy + 0.3, fz); G.refs.campLight = cl;
  // banner of the Ashen Choir
  const bx = C.x + 3, bz = C.z - 2;
  G.scene.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 5, 6), W.darkWood, bx, heightAt(bx, bz) + 2.5, bz));
  const ban = mesh(new THREE.PlaneGeometry(1.2, 2.0), mat(0x3a3836, { side: THREE.DoubleSide }), bx + 0.62, heightAt(bx, bz) + 3.8, bz); G.scene.add(ban);
  const sig = mesh(new THREE.RingGeometry(0.2, 0.32, 16), mat(0xd04a20, { emissive: 0xff4a10, emissiveIntensity: 1.2, side: THREE.DoubleSide }), bx + 0.62, heightAt(bx, bz) + 4.0, bz + 0.01, false); G.scene.add(sig);
  G.refs.banner = ban;
  addCircle(bx, bz, 0.2);
  for (const [dx, dz] of [[-4, -4], [-5, -3], [4, 9], [12, -4]]) prop(rng() < 0.5 ? 'crate' : 'barrel', C.x + dx, C.z + dz, rng() * 3);
  const chx = C.x + 10.5, chz = C.z - 9;
  const ch = makeChest(); placeGroup(ch.group, chx, chz, -2.3); addBox(chx, chz, 0.55, 0.35, -2.3);
  G.refs.campChest = { pos: new THREE.Vector3(chx, heightAt(chx, chz), chz), lid: ch.lid };
}

function buildShrine() {
  const S = POI.shrine; const base = heightAt(S.x, S.z);
  const sm = mat(0x9a958c, { flatShading: true }), dark = mat(0x6e6a64, { flatShading: true });
  const steps = [[16, 0.7], [13, 1.4], [10.8, 2.1]];
  for (const [r, top] of steps) {
    const c = mesh(new THREE.CylinderGeometry(r, r + 0.3, 2.5, 20), sm, S.x, base + top - 1.25, S.z); G.scene.add(c);
    platforms.push({ x: S.x, z: S.z, r, top: base + top });
  }
  const topY = base + 2.1;
  G.refs.shrineTop = topY;
  const rng = mulberry32(11);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, x = S.x + Math.cos(a) * 9.4, z = S.z + Math.sin(a) * 9.4;
    const broken = i % 4 === 1 || i === 6;
    const h = broken ? 1.5 + rng() * 2 : 6.5;
    const col = mesh(new THREE.CylinderGeometry(0.55, 0.62, h, 10), sm, x, topY + h / 2, z); G.scene.add(col);
    G.scene.add(mesh(new THREE.BoxGeometry(1.5, 0.4, 1.5), dark, x, topY + 0.2, z));
    if (!broken) G.scene.add(mesh(new THREE.BoxGeometry(1.5, 0.45, 1.5), dark, x, topY + h + 0.2, z));
    else { const rub = mesh(new THREE.DodecahedronGeometry(0.6, 0), dark, x + Math.cos(a) * 1.8, topY + 0.3, z + Math.sin(a) * 1.8); G.scene.add(rub); }
    addCircle(x, z, 0.8);
  }
  // pedestal
  const pd = new THREE.Group();
  pd.add(mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.5, 8), dark, 0, 0.25, 0));
  pd.add(mesh(new THREE.CylinderGeometry(0.5, 0.75, 1.2, 8), sm, 0, 1.1, 0));
  pd.add(mesh(new THREE.CylinderGeometry(0.85, 0.6, 0.3, 8), dark, 0, 1.85, 0));
  const socket = mesh(new THREE.TorusGeometry(0.35, 0.08, 6, 16), new THREE.MeshStandardMaterial({ color: 0x223344, emissive: 0x6ab8ff, emissiveIntensity: 0.6 }), 0, 2.05, 0);
  socket.rotation.x = Math.PI / 2; pd.add(socket);
  placeGroup(pd, S.x, S.z, 0, topY);
  addCircle(S.x, S.z, 1.2);
  G.refs.pedestal = new THREE.Vector3(S.x, topY, S.z); G.refs.socketMat = socket.material;
  const sl = new THREE.PointLight(0x7ab0ff, 10, 26, 1.5); sl.position.set(S.x, topY + 4, S.z); G.scene.add(sl); G.refs.shrineLight = sl;
  // braziers
  for (const a of [0.8, 2.35, 3.9, 5.5]) {
    const x = S.x + Math.cos(a) * 6.5, z = S.z + Math.sin(a) * 6.5;
    G.scene.add(mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.3, 6), W.iron, x, topY + 0.65, z));
    G.scene.add(mesh(new THREE.CylinderGeometry(0.45, 0.25, 0.35, 8), W.iron, x, topY + 1.4, z));
    addCircle(x, z, 0.35);
  }
}

// ---------------------------------------------------------------- Sky & lighting
export function setupEnvironment() {
  const scene = G.scene;
  const skyU = {
    top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color(0x0b0d10) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color(1, 0.9, 0.7) }, night: { value: 0 },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 top, horizon, bottom, sunDir, sunColor; uniform float night; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = d.y;
        vec3 col = mix(horizon, top, pow(smoothstep(0.0, 1.0, h), 0.55));
        col = mix(col, bottom, smoothstep(0.0, -0.3, h));
        float sd = max(dot(d, sunDir), 0.0);
        col += sunColor * (pow(sd, 1200.0) * 40.0 + pow(sd, 18.0) * 0.4 + pow(sd, 4.0) * 0.12) * (1.0 - night);
        float md = max(dot(d, -sunDir), 0.0);
        col += vec3(0.75, 0.82, 1.0) * (pow(md, 2500.0) * 8.0 + pow(md, 40.0) * 0.05) * night;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

  const sg = new THREE.BufferGeometry(); const sp = []; const rng = mulberry32(5);
  for (let i = 0; i < 2600; i++) {
    const u = rng() * 2 - 1, th = rng() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    const y = Math.abs(u); sp.push(Math.cos(th) * r * 1400, y * 1400, Math.sin(th) * r * 1400);
  }
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(sg, starMat); stars.frustumCulled = false; scene.add(stars);

  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a5a32, 1.0); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 3.0);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
  scene.add(sun); scene.add(sun.target);
  scene.fog = new THREE.FogExp2(0xbcd0e6, 0.0042);

  const cDayTop = new THREE.Color(0x3c74c4), cDayHor = new THREE.Color(0xb7d2ea);
  const cDuskTop = new THREE.Color(0x2c3c70), cDuskHor = new THREE.Color(0xf28a4a);
  const cNightTop = new THREE.Color(0x03050d), cNightHor = new THREE.Color(0x0f1b33);
  const tmpTop = new THREE.Color(), tmpHor = new THREE.Color();
  const dir = new THREE.Vector3();
  const env = {
    sky, stars, hemi, sun, dayK: 1,
    update(tod, center, camPos) {
      const a = (tod - 0.25) * Math.PI * 2;
      dir.set(Math.cos(a) * 0.85, Math.sin(a), 0.42).normalize();
      const elev = dir.y;
      const dayK = ss(-0.14, 0.22, elev);
      const duskK = Math.max(0, 1 - Math.abs(elev - 0.02) / 0.22);
      this.dayK = dayK;
      tmpTop.copy(cNightTop).lerp(cDayTop, dayK).lerp(cDuskTop, duskK * 0.5);
      tmpHor.copy(cNightHor).lerp(cDayHor, dayK).lerp(cDuskHor, duskK * 0.75);
      skyU.top.value.copy(tmpTop); skyU.horizon.value.copy(tmpHor); skyU.sunDir.value.copy(dir);
      skyU.night.value = 1 - ss(-0.25, 0.0, elev);
      skyU.sunColor.value.setRGB(1, 0.75 + 0.2 * ss(0, 0.4, elev), 0.5 + 0.4 * ss(0, 0.4, elev));
      scene.fog.color.copy(tmpHor);
      starMat.opacity = 1 - ss(-0.2, 0.05, elev);
      sky.position.copy(camPos); stars.position.copy(camPos);
      const isDay = elev > -0.02;
      const ld = isDay ? dir : dir.clone().negate();
      sun.position.copy(center).addScaledVector(ld, 150); sun.target.position.copy(center);
      if (isDay) { sun.intensity = 3.2 * ss(-0.02, 0.18, elev); sun.color.setRGB(1, 0.72 + 0.25 * ss(0, 0.35, elev), 0.5 + 0.42 * ss(0, 0.35, elev)); }
      else { sun.intensity = 0.55 * ss(0.0, 0.2, -elev); sun.color.setHex(0x8fa8ff); }
      hemi.intensity = 0.35 + 0.75 * dayK;
      hemi.color.setRGB(0.45 + 0.4 * dayK, 0.52 + 0.38 * dayK, 0.8 + 0.2 * dayK);
      hemi.groundColor.setRGB(0.12 + 0.18 * dayK, 0.13 + 0.2 * dayK, 0.12 + 0.08 * dayK);
      const nightGlow = 1 - dayK;
      W.window.emissiveIntensity = 0.15 + nightGlow * 2.6;
      W.lamp.emissiveIntensity = 0.2 + nightGlow * 4;
      if (G.refs.villageLight) G.refs.villageLight.intensity = nightGlow * 30;
    },
  };
  return env;
}

export function buildWorld() {
  G.refs.chimneys = [];
  G.refs.timeU = { value: 0 };
  initMats();
  buildTerrain();
  buildVillage();
  buildStones();
  buildCamp();
  buildShrine();
  buildVegetation();
}

// Map image for minimap / world map
export function buildMapImage(size = 300) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d'); const img = ctx.createImageData(size, size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = (i / size) * HALF * 2 - HALF, z = (j / size) * HALF * 2 - HALF;
    const h = heightAt(x, z), hx = heightAt(x + 2, z);
    let r, g, b;
    if (h < WATER_Y) { const d = clamp((WATER_Y - h) / 5, 0, 1); r = 40 - d * 15; g = 85 - d * 25; b = 110 - d * 20; }
    else if (h > 50) { r = 220; g = 224; b = 228; }
    else if (h > 26) { r = 120; g = 114; b = 104; }
    else {
      const f = ss(0.05, 0.5, forestAt(x, z));
      r = lerp(110, 52, f); g = lerp(140, 84, f); b = lerp(70, 44, f);
    }
    const shade = clamp(1 + (hx - h) * 0.12, 0.6, 1.3);
    if (roadDist(x, z) < 2.6) { r = 150; g = 120; b = 82; }
    const k = (j * size + i) * 4; img.data[k] = r * shade; img.data[k + 1] = g * shade; img.data[k + 2] = b * shade; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
