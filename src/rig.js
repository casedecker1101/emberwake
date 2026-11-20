// Rigged character models (KayKit Adventurers + Skeletons, CC0 by Kay Lousberg)
// One shared animation library drives every model — they all use the same 41-bone rig.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const MODELS = ['Rogue', 'Rogue_Hooded', 'Mage', 'Barbarian', 'Knight', 'Skeleton_Warrior', 'Skeleton_Mage', 'Skeleton_Minion'];
const PROPS = ['Skeleton_Blade', 'Skeleton_Staff', 'Skeleton_Axe'];
const LIB = {}, PROP = {}; export const CLIPS = {};
// Model file extension. The web build serves the same GLB bytes as .bin (GLTFLoader sniffs the header).
export const EXT = '.glb';
const BASE = 0.86; // KayKit characters are ~2.1 units tall; scale to ~1.8 m

export async function loadRigs(onProgress = () => {}) {
  const loader = new GLTFLoader();
  const jobs = [
    ...MODELS.map((m) => ['m', m, `assets/characters/${m}${EXT}`]),
    ...PROPS.map((p) => ['p', p, `assets/props/${p}${EXT}`]),
    ['a', 'anim', `assets/characters/animations${EXT}`],
  ];
  let done = 0;
  await Promise.all(jobs.map(async ([kind, name, url]) => {
    const g = await loader.loadAsync(url);
    if (kind === 'm') LIB[name] = g.scene;
    else if (kind === 'p') PROP[name] = g.scene;
    else for (const c of g.animations) CLIPS[c.name] = c;
    onProgress(++done / jobs.length);
  }));
}

// Body parts stay; everything else (weapons, shields, hats, capes) is an accessory toggled per character.
const BODY = /(ArmLeft|ArmRight|Body|Head|LegLeft|LegRight|Eyes|Jaw|Skull)/;
const isBody = (n) => BODY.test(n);

export const CAST = {
  wren: { model: 'Rogue', show: ['Rogue_Cape'], borrow: [['Knight', '1H_Sword', 'R']], tint: 0xfff4ea },
  hollis: { model: 'Barbarian', show: ['1H_Axe', 'Barbarian_Cape'], scale: 1.06, tint: 0xf0dcc8 },
  ossic: { model: 'Mage', show: ['Mage_Hat', '2H_Staff', 'Mage_Cape'], tint: 0xc8d4ff },
  bree: { model: 'Mage', show: [], tint: 0xb8d89a, scale: 0.95 },
  tamm: { model: 'Mage', show: ['Mage_Cape'], tint: 0xd8a8c0, scale: 0.92 },
  pell: { model: 'Rogue', show: [], scale: 0.64, tint: 0xffd8b0 },
  raider: { model: 'Rogue_Hooded', show: ['Knife', 'Knife_Offhand', 'Rogue_Cape'], tint: 0xe09a88 },
  captain: { model: 'Knight', show: ['Knight_Helmet', '1H_Sword', 'Spike_Shield', 'Knight_Cape'], tint: 0x8c8c9c, scale: 1.12 },
  minion: { model: 'Skeleton_Minion', show: [], prop: ['Skeleton_Axe', 'R'], tint: 0xd8d0c0 },
  wraith: { model: 'Skeleton_Mage', show: ['Skeleton_Mage_Hat'], prop: ['Skeleton_Staff', 'R'], tint: 0x8a8480, emissive: [0xff4a10, 0.06] },
  boss: { model: 'Skeleton_Warrior', show: ['Skeleton_Warrior_Helmet', 'Skeleton_Warrior_Cloak'], prop: ['Skeleton_Blade', 'R'], tint: 0x6e625a, emissive: [0xff3a00, 0.07], scale: 2.0 },
};

function tipOf(obj) {
  // farthest point of a weapon along its longest axis, in the weapon's local space
  const box = new THREE.Box3();
  obj.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox); } });
  const s = box.getSize(new THREE.Vector3());
  const ax = s.x > s.y ? (s.x > s.z ? 'x' : 'z') : s.y > s.z ? 'y' : 'z';
  const t = new THREE.Vector3(); t[ax] = Math.abs(box.max[ax]) > Math.abs(box.min[ax]) ? box.max[ax] : box.min[ax];
  return t;
}

export class Rig {
  constructor(key, over = {}) {
    const c = { ...CAST[key], ...over };
    this.cfg = c;
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(LIB[c.model]);
    this.model.scale.setScalar(BASE * (c.scale || 1));
    this.root.add(this.model);
    this.mats = [];
    const tint = c.tint != null ? new THREE.Color(c.tint) : null;
    this.model.traverse((o) => {
      if (o.isMesh) {
        const name = o.name, pname = o.parent ? o.parent.name : '';
        if (!isBody(name) && !isBody(pname) && !c.show.includes(name) && !c.show.includes(pname)) o.visible = false;
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        o.material = o.material.clone();
        if (tint) o.material.color.multiply(tint);
        if (c.emissive) { o.material.emissive.setHex(c.emissive[0]); o.material.emissiveIntensity = c.emissive[1]; }
        this.mats.push(o.material);
      }
    });
    this.handR = this.model.getObjectByName('handslotr');
    this.handL = this.model.getObjectByName('handslotl');
    this.weapon = null;
    for (const [from, node, side] of c.borrow || []) {
      const w = LIB[from].getObjectByName(node).clone(true);
      w.traverse((o) => { if (o.isMesh) { o.visible = true; o.castShadow = true; o.material = o.material.clone(); this.mats.push(o.material); } });
      (side === 'R' ? this.handR : this.handL).add(w); this.weapon = w;
    }
    if (c.prop) {
      const w = PROP[c.prop[0]].clone(true);
      w.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); if (tint) o.material.color.multiply(tint); if (c.emissive) { o.material.emissive.setHex(c.emissive[0]); o.material.emissiveIntensity = c.emissive[1] * 3; } this.mats.push(o.material); } });
      (c.prop[1] === 'R' ? this.handR : this.handL).add(w); this.weapon = w;
    }
    if (!this.weapon) {
      for (const n of c.show) { const o = this.model.getObjectByName(n); if (o && (o.parent === this.handR || o.parent === this.handL)) { this.weapon = o; break; } }
    }
    this.tip = this.weapon ? tipOf(this.weapon) : null;
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {}; this.current = null; this.curKey = null;
  }
  setWeaponVisible(v) { if (this.weapon) this.weapon.visible = v; }
  dur(name) { return CLIPS[name] ? CLIPS[name].duration : 1; }
  action(name) {
    if (!this.actions[name]) { const clip = CLIPS[name]; if (!clip) return null; this.actions[name] = this.mixer.clipAction(clip); }
    return this.actions[name];
  }
  // Plays `name`. A new `key` (default: the clip name) restarts it; same key just updates speed.
  play(name, o = {}) {
    const key = o.key ?? name;
    const a = this.action(name); if (!a) return null;
    if (this.curKey === key && this.current === a) { if (o.timeScale) a.timeScale = o.timeScale; return a; }
    const fade = o.fade ?? 0.18;
    a.reset();
    a.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = !!o.once;
    a.timeScale = o.timeScale ?? 1;
    a.enabled = true; a.setEffectiveWeight(1);
    if (o.at) a.time = o.at * a.getClip().duration;
    a.play();
    if (this.current && this.current !== a) { this.current.fadeOut(fade); a.fadeIn(fade); }
    else if (this.current === a) a.fadeIn(0.05);
    this.current = a; this.curKey = key;
    return a;
  }
  progress() { return this.current ? this.current.time / this.current.getClip().duration : 0; }
  update(dt) { this.mixer.update(dt); }
  weaponSegment(a, b) {
    if (!this.weapon) return false;
    this.weapon.getWorldPosition(a); b.copy(this.tip); this.weapon.localToWorld(b); return true;
  }
}
