// Emberwake — main bootstrap & game loop
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { G } from './game.js';
import { buildWorld, setupEnvironment, groundAt, heightAt, POI, inCanopy } from './world.js';
import { FX } from './fx.js';
import { AudioSys } from './audio.js';
import { UI } from './ui.js';
import { Player, Enemy, NPC, updateProjectiles, spawnEffigies, updateEffigies } from './entities.js';
import { STAGES, setStage, checkProgress, atLeast, reward, ENDING, questTitle } from './story.js';
import { angLerp, rand, clamp } from './util.js';
import { makeSheep } from './models.js';
import { loadRigs } from './rig.js';

const SAVE_KEY = 'emberwake_save_v1';
const $ = (id) => document.getElementById(id);

function newState() {
  return {
    stage: 'q1_talk', stageBase: {}, kills: {}, completed: [], effigiesBurned: 0, raidersDead: [], hasLetter: false, bossDead: false,
    chests: {}, tod: 0.3,
    p: { hp: 100, maxHp: 100, mp: 60, maxMp: 60, st: 100, maxSt: 100, level: 1, xp: 0, gold: 10, dmg: 12, armor: 0, potions: 2, tonics: 0,
      hasSword: false, hasKindling: false, owned: {}, pos: [3, 7], yaw: Math.PI },
  };
}

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
$('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2000);
G.renderer = renderer; G.scene = scene; G.camera = camera;

const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.55, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
G.composer = composer;

function resize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  G.fx && G.fx.resize(innerHeight * renderer.getPixelRatio(), camera.fov);
}
addEventListener('resize', resize);

// ---------------------------------------------------------------- loading
function setLoad(p, msg) { $('load-fill').style.width = p * 100 + '%'; $('load-msg').textContent = msg; }
const tick = () => new Promise((r) => setTimeout(r, 16));

async function boot() {
  setLoad(0.05, 'Raising the hills of the Riven Vales…'); await tick();
  G.fx = new FX();
  G.state = newState();
  setLoad(0.2, 'Planting the Thornwood…'); await tick();
  buildWorld();
  setLoad(0.6, 'Lighting the hearths of Millbrook…'); await tick();
  G.env = setupEnvironment();
  G.audio = new AudioSys();
  G.ui = new UI();
  setLoad(0.7, 'Summoning the folk of the vales…');
  await loadRigs((k) => setLoad(0.7 + k * 0.15, 'Summoning the folk of the vales…'));
  G.player = new Player();
  setLoad(0.9, 'Waking the villagers…'); await tick();
  spawnNPCs();
  buildBeacon();
  resize();
  setLoad(1, 'Ready'); await tick();
  $('loading').classList.add('hidden');
  $('title').classList.remove('hidden');
  $('btn-continue').disabled = !localStorage.getItem(SAVE_KEY);
  G.player.place(3, 7);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- world population
function spawnNPCs() {
  const sm = G.refs.smithy;
  const hp = new THREE.Vector3(1.2, 0, 1.25); sm.localToWorld(hp);
  new NPC('hollis', hp.x, hp.z, G.refs.smithyRot + Math.PI);
  new NPC('bree', -30, -16.2, Math.atan2(30, 16));
  new NPC('ossic', 2.4, 2.0, Math.atan2(-2.4, -2.0) + Math.PI);
  new NPC('tamm', -2.3, -21.6, Math.atan2(2.3, 21.6));
  new NPC('pell', -3.5, 5, 2.5);
}
function spawnEnemies() {
  for (const e of [...G.enemies]) e.remove();
  const T = POI.thornwood;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rand(-0.3, 0.3), r = rand(10, 34);
    new Enemy('wolf', T.x + Math.cos(a) * r, T.z + Math.sin(a) * r, { respawn: true, leash: 50 });
  }
  // stray wolves along the north road
  // the restless dead along the pilgrim road north
  for (const [x, z] of [[-20, -140], [-14, -147], [-24, -160], [-8, -168]]) new Enemy('minion', x, z, { respawn: true, leash: 30 });
  const C = POI.camp;
  const raiders = [['raider_0', -5, -2], ['raider_1', 4, 3], ['raider_2', 0, -7], ['raider_3', -6, 7]];
  for (const [id, dx, dz] of raiders) if (!G.state.raidersDead.includes(id)) new Enemy('raider', C.x + dx, C.z + dz, { id, leash: 32 });
  if (!G.state.raidersDead.includes('captain')) new Enemy('captain', C.x + 8, C.z - 3, { id: 'captain', leash: 30 });
  if (G.state.stage === 'q5_boss') spawnBoss();
}
function spawnBoss() {
  if (G.enemies.some((e) => e.def.boss) || G.state.bossDead) return;
  const S = POI.shrine;
  const b = new Enemy('boss', S.x, S.z + 4.5, { id: 'boss', leash: 80 });
  b.yaw = 0; b.def = { ...b.def };
}
G.onBossDeath = () => {
  G.state.bossDead = true;
  for (const e of G.enemies) if (e.type === 'wraith' && e.state !== 'dead') e.hurt(999, e.pos);
  G.ui.banner('Victory', 'The Cinder Warden falls');
  setTimeout(() => setStage('q5_pedestal'), 1500);
};
G.onStage = (id) => {
  const ossic = G.npcs.find((n) => n.id === 'ossic');
  ossic && ossic.setVisible(atLeast('q3_talk'));
  if (id === 'q3_effigy') spawnEffigies();
  if (id === 'q5_boss') spawnBoss();
};

function setupInteractables() {
  G.interactables = [
    { pos: G.refs.smithChest.pos, r: 2.4, label: () => (G.state.stage === 'q1_chest' ? 'Open the chest' : null),
      act: () => { openLid(G.refs.smithChest); G.state.p.hasSword = true; G.audio.play('chest'); G.ui.notify('Obtained: Star-iron Sword', 'item'); setStage('q1_return'); } },
    { pos: G.refs.kindleStone, r: 3.2, label: () => (G.state.stage === 'q3_stone' ? 'Touch the Kindle Stone' : null),
      act: () => {
        G.state.p.hasKindling = true; G.state.p.mp = G.state.p.maxMp;
        G.audio.play('kindle'); G.fx.levelUp(G.refs.kindleStone); G.fx.explode(G.refs.kindleStone.clone().setY(G.refs.kindleStone.y + 2), 0x47d6ff, 1.2);
        G.refs.kindleLight.intensity = 40; setTimeout(() => (G.refs.kindleLight.intensity = 8), 1500);
        G.ui.banner('Kindling Awakened', 'Press Q to hurl fire — it draws on your kindling (blue)');
        setStage('q3_effigy', true); G.ui.notify('Objective: ' + STAGES.q3_effigy.obj, 'quest');
      } },
    { pos: G.refs.campChest.pos, r: 2.4, label: () => (G.state.stage === 'q4_chest' ? "Search the strongbox" : null),
      act: () => { openLid(G.refs.campChest); G.state.hasLetter = true; G.audio.play('chest'); G.ui.notify('Obtained: Sealed Letter', 'item'); reward({ gold: 40, potions: 1 }); setStage('q4_return'); } },
    { pos: G.refs.pedestal, r: 3.2, label: () => (G.state.stage === 'q5_pedestal' ? 'Examine the empty pedestal' : null),
      act: () => {
        G.fx.levelUp(G.refs.pedestal.clone().setY(G.refs.pedestal.y + 1)); G.audio.play('kindle');
        G.refs.socketMat.emissive.setHex(0xff8a30); G.refs.socketMat.emissiveIntensity = 6;
        const os = G.npcs.find((n) => n.id === 'ossic');
        const P = G.player.pos; const S = POI.shrine;
        const a = Math.atan2(P.x - S.x, P.z - S.z);
        os.pos.set(S.x + Math.sin(a) * 9, 0, S.z + Math.cos(a) * 9); os.baseYaw = a + Math.PI;
        reward({ xp: 150 });
        setStage('done');
        setTimeout(() => G.ui.showEnding(ENDING), 2500);
      } },
  ];
  for (const n of G.npcs) G.interactables.push({ npc: n, pos: n.pos, r: 3.0, label: () => (n.hidden ? null : 'Talk to ' + n.name), act: () => G.ui.openDialogue(n.id) });
}
function openLid(ch) { ch.opening = true; G.refs.lids = G.refs.lids || []; G.refs.lids.push(ch); }

// objective beacon
let beacon;
function buildBeacon() {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.75, 0.3), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });
  beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 80, 12, 1, true), m);
  scene.add(beacon);
}
G.objectivePos = () => {
  const w = STAGES[G.state.stage].where; if (!w) return null; const p = w(); return p || null;
};

// ---------------------------------------------------------------- input
const I = { keys: {}, pressed: {}, locked: false };
G.input = I;
const canvas = renderer.domElement;
addEventListener('keydown', (e) => {
  if (e.repeat && !['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) return;
  I.keys[e.code] = true;
  if (['Tab', 'Space'].includes(e.code)) e.preventDefault();
  if (G.mode === 'title') return;
  if (G.mode === 'dialogue') {
    if (/^Digit[1-4]$/.test(e.code)) G.ui.choose(+e.code.slice(5) - 1);
    else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { if (!G.ui.skipType()) { const ch = document.querySelectorAll('#dlg-choices .choice'); if (ch.length === 1) G.ui.choose(0); } }
    else if (e.code === 'Escape') G.ui.closeDialogue();
    return;
  }
  if (G.mode === 'panel') {
    if (e.code === 'Escape' || (e.code === 'Tab' && G.ui.panel === 'inventory') || (e.code === 'KeyI' && G.ui.panel === 'inventory') || (e.code === 'KeyJ' && G.ui.panel === 'journal') || (e.code === 'KeyM' && G.ui.panel === 'worldmap')) G.ui.closePanel();
    else if (e.code === 'Tab' || e.code === 'KeyI') G.ui.openPanel('inventory');
    else if (e.code === 'KeyJ') G.ui.openPanel('journal');
    else if (e.code === 'KeyM') G.ui.openPanel('worldmap');
    return;
  }
  if (G.mode !== 'play') return;
  switch (e.code) {
    case 'Space': I.pressed.jump = true; break;
    case 'KeyQ': I.pressed.cast = true; break;
    case 'KeyE': I.pressed.interact = true; break;
    case 'KeyF': I.pressed.attack = true; break;
    case 'KeyC': case 'AltLeft': I.pressed.roll = true; e.preventDefault(); break;
    case 'Digit1': I.pressed.potion = true; break;
    case 'Digit2': I.pressed.tonic = true; break;
    case 'Tab': case 'KeyI': G.ui.openPanel('inventory'); break;
    case 'KeyJ': G.ui.openPanel('journal'); break;
    case 'KeyM': G.ui.openPanel('worldmap'); break;
    case 'Escape': G.ui.openPanel('pause'); break;
  }
});
addEventListener('keyup', (e) => { I.keys[e.code] = false; });
addEventListener('blur', () => { I.keys = {}; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (G.mode !== 'play') return;
  if (!I.locked) { lock(); if (!I.lockSupported) {} else return; }
  if (e.button === 0) I.pressed.attack = true;
  if (e.button === 2) I.pressed.roll = true;
});
addEventListener('mousemove', (e) => {
  if (G.mode !== 'play' && G.mode !== 'dead') return;
  if (I.locked || I.drag) {
    G.cam.yaw -= e.movementX * 0.0024; G.cam.pitch = clamp(G.cam.pitch + e.movementY * 0.0022, -0.35, 1.25);
  }
});
canvas.addEventListener('wheel', (e) => { G.cam.dist = clamp(G.cam.dist + Math.sign(e.deltaY) * 0.6, 2.8, 13); }, { passive: true });
I.lockSupported = 'requestPointerLock' in canvas;
function lock() { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (_) {} }
document.addEventListener('pointerlockchange', () => {
  I.locked = document.pointerLockElement === canvas;
  $('clickhint').classList.toggle('hidden', I.locked || G.mode !== 'play');
  if (!I.locked && G.mode === 'play' && !G.suppressPause) G.ui.openPanel('pause');
});
G.setMode = (m) => {
  G.mode = m;
  if (m === 'play') { lock(); $('clickhint').classList.toggle('hidden', I.locked); }
  else { G.suppressPause = true; if (document.pointerLockElement) document.exitPointerLock(); setTimeout(() => (G.suppressPause = false), 50); $('clickhint').classList.add('hidden'); }
  $('hud').classList.toggle('dim', m === 'dialogue');
};

// ---------------------------------------------------------------- save / load
G.save = () => {
  if (!G.state || G.mode === 'title') return;
  const P = G.player; G.state.p.pos = [P.pos.x, P.pos.z]; G.state.p.yaw = P.yaw;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.state)); } catch (_) {}
};
function startGame(load) {
  G.audio.init();
  if (load) {
    try { G.state = Object.assign(newState(), JSON.parse(localStorage.getItem(SAVE_KEY))); } catch (_) { G.state = newState(); }
  } else G.state = newState();
  const s = G.state;
  G.player.place(s.p.pos[0], s.p.pos[1]); G.player.yaw = s.p.yaw; G.player.dead = false;
  G.cam.yaw = s.p.yaw + Math.PI; G.cam.pitch = 0.3;
  spawnEnemies();
  setupInteractables();
  G.onStage(s.stage);
  if (s.stage === 'q3_effigy') spawnEffigies();
  for (const [ch, after] of [[G.refs.smithChest, 'q1_chest'], [G.refs.campChest, 'q4_chest']]) { ch.lid.rotation.x = atLeast(after) && s.stage !== after ? -1.7 : 0; }
  $('title').classList.add('hidden'); $('hud').classList.remove('hidden');
  G.setMode('play');
  if (!load) {
    G.ui.banner('Millbrook', 'The Riven Vales — the last morning of summer');
    setTimeout(() => G.ui.banner('New Quest', questTitle()), 3700);
  } else G.ui.banner('Welcome back', questTitle());
}
$('btn-new').onclick = () => startGame(false);
$('btn-continue').onclick = () => startGame(true);
$('btn-controls').onclick = () => $('controls-pop').classList.toggle('hidden');
$('btn-resume').onclick = () => G.ui.closePanel();
$('btn-save').onclick = () => { G.save(); G.ui.notify('Game saved', 'quest'); };
$('btn-quality').onclick = () => setQuality(G.quality === 'high' ? 'low' : 'high');
$('btn-music').onclick = () => { G.audio.musicOn = !G.audio.musicOn; if (G.audio.music) G.audio.music.gain.value = G.audio.musicOn ? 0.22 : 0; $('btn-music').textContent = 'Music: ' + (G.audio.musicOn ? 'On' : 'Off'); };
$('btn-quit').onclick = () => { G.save(); location.reload(); };
$('btn-respawn').onclick = () => { G.ui.hideDeath(); G.player.respawn(); G.setMode('play'); };
$('ending-btn').onclick = () => { $('ending').classList.add('hidden'); G.setMode('play'); G.ui.notify('You may continue exploring the vales.', 'quest'); };
$('clickhint').onclick = () => lock();
for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => G.ui.closePanel();

function setQuality(q) {
  G.quality = q;
  const hi = q === 'high';
  renderer.setPixelRatio(hi ? Math.min(devicePixelRatio, 1.5) : 0.85);
  G.env.sun.castShadow = hi;
  G.refs.grass.count = hi ? G.refs.grassMax : Math.floor(G.refs.grassMax * 0.35);
  bloom.enabled = hi;
  resize();
  $('btn-quality').textContent = 'Graphics: ' + (hi ? 'High' : 'Low');
}

// ---------------------------------------------------------------- per-frame systems
const clock = new THREE.Timer();
let saveT = 0;
const tmpV = new THREE.Vector3();

function updateCamera(dt) {
  const P = G.player, c = G.cam;
  const tx = P.pos.x, ty = P.pos.y + 1.6, tz = P.pos.z;
  const k = Math.min(1, dt * 12);
  c.tx += (tx - c.tx) * k; c.ty += (ty - c.ty) * Math.min(1, dt * 8); c.tz += (tz - c.tz) * k;
  const cp = Math.cos(c.pitch);
  // over-the-shoulder offset
  const rx = Math.cos(c.yaw) * 0.45, rz = -Math.sin(c.yaw) * 0.45;
  let dist = c.dist;
  for (let t = 1.6; t <= c.dist; t += 0.4) {
    if (inCanopy(c.tx + Math.sin(c.yaw) * cp * t + rx, c.ty + Math.sin(c.pitch) * t, c.tz + Math.cos(c.yaw) * cp * t + rz)) { dist = Math.max(1.6, t - 0.4); break; }
  }
  c.curDist = c.curDist == null ? dist : (dist < c.curDist ? dist : c.curDist + (dist - c.curDist) * Math.min(1, dt * 3));
  let x = c.tx + Math.sin(c.yaw) * cp * c.curDist + rx, y = c.ty + Math.sin(c.pitch) * c.curDist, z = c.tz + Math.cos(c.yaw) * cp * c.curDist + rz;
  const g = groundAt(x, z) + 0.5; if (y < g) y = g;
  camera.position.set(x, y, z);
  if (G.shake > 0) { camera.position.x += (Math.random() - 0.5) * G.shake; camera.position.y += (Math.random() - 0.5) * G.shake; G.shake = Math.max(0, G.shake - dt * 1.6); }
  camera.lookAt(c.tx + rx, c.ty, c.tz + rz);
}
function titleCamera(t) {
  const a = t * 0.04;
  camera.position.set(Math.sin(a) * 38, 16 + Math.sin(t * 0.1) * 2, Math.cos(a) * 38);
  camera.lookAt(0, 4, 0);
}
function updateSheep(dt) {
  const f = G.refs.fold;
  for (const s of G.sheep) {
    s.wait -= dt;
    const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz);
    let sp = 0;
    if (d > 0.3) { sp = 0.8; s.yaw = angLerp(s.yaw, Math.atan2(dx, dz), dt * 3); s.x += Math.sin(s.yaw) * sp * dt; s.z += Math.cos(s.yaw) * sp * dt; }
    else if (s.wait <= 0) { s.tx = f.x + rand(-f.hw, f.hw); s.tz = f.z + rand(-f.hd, f.hd); s.wait = rand(3, 9); }
    s.phase += sp * dt * 8;
    s.m.legs.forEach((l, i) => (l.rotation.x = Math.sin(s.phase + (i % 2) * Math.PI) * 0.5 * (sp > 0 ? 1 : 0)));
    s.m.head.rotation.x = sp > 0 ? 0 : 0.5 + Math.sin(G.time + s.tx) * 0.1;
    s.m.group.position.set(s.x, heightAt(s.x, s.z), s.z); s.m.group.rotation.y = s.yaw;
  }
}
function updateInteract() {
  const P = G.player; let best = null, bd = 1e9;
  if (G.mode === 'play' && !P.dead) for (const it of G.interactables) {
    const lbl = it.label(); if (!lbl) continue;
    const d = Math.hypot(it.pos.x - P.pos.x, it.pos.z - P.pos.z);
    if (d < it.r && d < bd) { bd = d; best = { it, lbl }; }
  }
  G.interactPrompt = best ? best.lbl : null;
  if (best && I.pressed.interact) { G.audio.play('ui'); best.it.act(); }
}
function updateTriggers() {
  const s = G.state, P = G.player;
  if (s.stage === 'q5_travel' && Math.hypot(P.pos.x - POI.shrine.x, P.pos.z - POI.shrine.z) < 30) {
    setStage('q5_boss');
    G.ui.banner('The Shrine of Vael', 'Something stirs among the broken columns');
  }
  // region names
  let region = 'The Riven Vales';
  for (const k of ['village', 'stones', 'thornwood', 'camp', 'shrine', 'lake']) { const p = POI[k]; if (Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < p.r + 8) { region = p.name; break; } }
  if (region !== G.region) { G.region = region; $('region').textContent = region; $('region').classList.remove('show'); void $('region').offsetWidth; $('region').classList.add('show'); }
  checkProgress();
}

function frame() {
  requestAnimationFrame(frame);
  clock.update(); const dt = Math.min(0.05, clock.getDelta());
  G.time += dt; G.refs.timeU.value = G.time;
  const P = G.player;

  if (G.mode === 'title') {
    titleCamera(G.time); beacon.visible = false;
    G.state.tod = 0.3 + Math.sin(G.time * 0.02) * 0.02;
    for (const n of G.npcs) n.update(dt);
    updateSheep(dt);
    G.fx.update(dt);
  } else {
    let gdt = dt;
    if (G.hitstop > 0) { G.hitstop -= dt; gdt = dt * 0.15; }
    const sim = G.mode === 'play' || G.mode === 'dead' || G.mode === 'ending';
    if (sim) {
      P.update(gdt);
      for (const e of [...G.enemies]) e.update(gdt);
      updateProjectiles(gdt);
      updateEffigies(gdt);
      G.state.tod = (G.state.tod + gdt / 720) % 1;
      updateInteract();
      updateTriggers();
    }
    for (const n of G.npcs) n.update(dt);
    updateSheep(dt);
    G.fx.update(gdt);
    if (G.refs.lids) for (const ch of G.refs.lids) ch.lid.rotation.x += (-1.7 - ch.lid.rotation.x) * Math.min(1, dt * 4);
    // combat music intensity
    const engaged = G.enemies.some((e) => e.state === 'chase' || e.state === 'attack');
    G.audio.combat += ((engaged ? 1 : 0) - G.audio.combat) * Math.min(1, dt * 0.8);
    // beacon
    const w = G.objectivePos();
    if (w && Math.hypot(w.x - P.pos.x, w.z - P.pos.z) > 14) { beacon.visible = true; beacon.position.set(w.x, groundAt(w.x, w.z) + 40, w.z); beacon.material.opacity = 0.12 + Math.sin(G.time * 2) * 0.04; }
    else beacon.visible = false;
    updateCamera(dt);
    G.ui.update(dt);
    saveT += dt; if (saveT > 30 && G.mode === 'play') { saveT = 0; G.save(); }
  }
  G.env.update(G.state.tod, G.mode === 'title' ? new THREE.Vector3(0, 0, 0) : P.pos, camera.position);
  G.audio.setWind && G.audio.setWind(clamp((P.pos.y - 5) / 30, 0, 1));
  composer.render();
  I.pressed = {};
}

window.G = G; // debug hook
boot();
