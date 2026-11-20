// Player, enemies, NPCs, projectiles
import * as THREE from 'three';
import { G } from './game.js';
import { groundAt, heightAt, collide, WATER_Y, LIMIT } from './world.js';
import { makeWolf, animWolf, makeEffigy, mat } from './models.js';
import { Rig } from './rig.js';
import { angLerp, angDiff, clamp, rand, randi, ss } from './util.js';
import { checkProgress } from './story.js';

const V = new THREE.Vector3(), TIP = new THREE.Vector3();

export const xpToNext = (l) => 100 + (l - 1) * 90;

// ================================================================ Player
export class Player {
  constructor() {
    this.rig = new Rig('wren');
    this.group = this.rig.root; G.scene.add(this.group);
    this.rig.setWeaponVisible(false); this.atkSerial = 0; this.drinkT = 0;
    this.pos = new THREE.Vector3(); this.vy = 0; this.yaw = Math.PI; this.phase = 0; this.speed = 0;
    this.attack = null; this.roll = null; this.cast = 0; this.castT = -1; this.inv = 0; this.grounded = true;
    this.hurtT = 0; this.combatT = 0; this.regenLock = 0; this.dead = false; this.moveDir = new THREE.Vector3();
    this.radius = 0.42; this.castCd = 0;
  }
  get s() { return G.state.p; }
  place(x, z) { this.pos.set(x, groundAt(x, z), z); this.vy = 0; this.group.position.copy(this.pos); }
  gainXp(n) {
    const s = this.s; s.xp += n; G.ui.notify(`+${n} XP`, 'xp');
    while (s.xp >= xpToNext(s.level)) {
      s.xp -= xpToNext(s.level); s.level++;
      s.maxHp += 15; s.maxMp += 8; s.dmg += 2; s.hp = s.maxHp; s.mp = s.maxMp;
      G.fx.levelUp(this.pos); G.audio.play('level');
      G.ui.banner('Level Up', `You are now level ${s.level}`);
    }
  }
  takeDamage(n, from) {
    if (this.inv > 0 || this.dead || G.mode === 'ending') return false;
    const s = this.s;
    const dmg = Math.max(1, Math.round(n * (1 - s.armor / (s.armor + 25))));
    s.hp -= dmg; this.hurtT = 0.3; this.hitSerial = (this.hitSerial || 0) + 1; this.combatT = 6; this.regenLock = 3; this.inv = 0.35;
    G.ui.floatText(V.copy(this.pos).setY(this.pos.y + 2), '-' + dmg, 'hurt');
    G.ui.hurtFlash(); G.audio.play('hurt'); G.fx.blood(V.copy(this.pos).setY(this.pos.y + 1.2));
    G.shake = Math.max(G.shake, 0.25);
    if (from) { const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1; this.kb = { x: (dx / d) * 6, z: (dz / d) * 6, t: 0.15 }; }
    if (this.attack && Math.random() < 0.5) this.attack = null;
    if (s.hp <= 0) { s.hp = 0; this.die(); }
    return true;
  }
  die() {
    this.dead = true; this.attack = null; this.roll = null;
    G.audio.play('death');
    setTimeout(() => G.ui.showDeath(), 1400);
  }
  respawn() {
    const s = this.s; this.dead = false; s.hp = s.maxHp; s.mp = s.maxMp; s.st = s.maxSt;
    s.gold = Math.floor(s.gold * 0.9);
    this.place(2, 4); this.rig.play('Idle', { fade: 0.01 });
    for (const e of G.enemies) if (e.state !== 'dead') { e.state = 'return'; }
  }
  facingTarget() {
    let best = null, bd = 6;
    for (const e of G.enemies) {
      if (e.state === 'dead') continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 5.5) continue;
      const a = Math.abs(angDiff(this.yaw, Math.atan2(dx, dz)));
      const score = d + a * 2.5;
      if (a < 1.3 && score < bd) { bd = score; best = e; }
    }
    return best;
  }
  update(dt) {
    const s = this.s, I = G.input;
    const canAct = G.mode === 'play' && !this.dead;
    this.inv = Math.max(0, this.inv - dt); this.hurtT = Math.max(0, this.hurtT - dt);
    this.combatT = Math.max(0, this.combatT - dt); this.regenLock = Math.max(0, this.regenLock - dt); this.castCd = Math.max(0, this.castCd - dt);

    if (this.dead) {
      this.rig.play('Death_A', { once: true, fade: 0.1 }); this.rig.update(dt);
      this.group.position.copy(this.pos); return;
    }
    // input → camera-relative direction
    let mx = 0, mz = 0;
    if (canAct) { mx = (I.keys.KeyD ? 1 : 0) - (I.keys.KeyA ? 1 : 0); mz = (I.keys.KeyW ? 1 : 0) - (I.keys.KeyS ? 1 : 0); }
    const cy = G.cam.yaw;
    const fx = -Math.sin(cy), fz = -Math.cos(cy), rx = Math.cos(cy), rz = -Math.sin(cy);
    let dx = fx * mz + rx * mx, dz = fz * mz + rz * mx; const ml = Math.hypot(dx, dz);
    const moving = ml > 0.01; if (moving) { dx /= ml; dz /= ml; }
    this.moveDir.set(dx, 0, dz);
    const sprint = canAct && moving && I.keys.ShiftLeft && s.st > 1 && !this.attack && !this.cast;
    let target = moving ? (sprint ? 9.2 : 5.4) : 0;
    if (this.attack) target *= 0.2;
    if (this.castT >= 0) target *= 0.4;
    this.speed += (target - this.speed) * Math.min(1, dt * (moving ? 10 : 14));

    // actions
    if (canAct) {
      if (I.pressed.roll && !this.roll && s.st >= 20 && this.grounded) {
        const rd = moving ? { x: dx, z: dz } : { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
        this.roll = { t: 0, x: rd.x, z: rd.z }; this.rollSerial = (this.rollSerial || 0) + 1; this.attack = null; this.castT = -1; s.st -= 20; this.inv = 0.42; this.regenLock = 0.6;
        this.yaw = Math.atan2(rd.x, rd.z); G.audio.play('roll');
      }
      if (I.pressed.attack && !this.roll) {
        if (!this.attack) { if (s.st >= 6) this.startAttack(0); else G.ui.notify('Too tired!', 'warn'); }
        else if (this.attack.p > 0.42 && this.attack.combo < 2) this.attack.queued = true;
      }
      if (I.pressed.cast && !this.roll && !this.attack && this.castT < 0) {
        if (!s.hasKindling) G.ui.notify('You have not yet learned Kindling.', 'warn');
        else if (s.mp < 20) G.ui.notify('Not enough kindling.', 'warn');
        else if (this.castCd > 0) {}
        else { this.castT = 0; this.castSerial = (this.castSerial || 0) + 1; s.mp -= 20; this.castCd = 0.8; this.yaw = Math.atan2(-Math.sin(G.cam.yaw), -Math.cos(G.cam.yaw)); G.audio.play('cast'); }
      }
      if (I.pressed.jump && this.grounded && !this.roll && !this.attack) { this.vy = 7.8; this.grounded = false; G.audio.play('jump'); }
      if (I.pressed.potion) this.drink('potion');
      if (I.pressed.tonic) this.drink('tonic');
    }

    // movement integrate
    let vx = dx * this.speed, vz = dz * this.speed;
    if (this.roll) {
      this.roll.t += dt / 0.55; const k = 1 - this.roll.t * 0.5;
      vx = this.roll.x * 11 * k; vz = this.roll.z * 11 * k;
      if (this.roll.t >= 1) this.roll = null;
    }
    if (this.attack) {
      // small forward lunge during strike
      const p = this.attack.p; if (p > 0.28 && p < 0.5) { vx += Math.sin(this.yaw) * 3.5; vz += Math.cos(this.yaw) * 3.5; }
    }
    if (this.kb) { vx += this.kb.x; vz += this.kb.z; this.kb.t -= dt; if (this.kb.t <= 0) this.kb = null; }
    const nx = this.pos.x + vx * dt, nz = this.pos.z + vz * dt;
    const deep = (x, z) => heightAt(x, z) < WATER_Y - 0.9;
    if (!deep(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
    else if (!deep(nx, this.pos.z)) this.pos.x = nx;
    else if (!deep(this.pos.x, nz)) this.pos.z = nz;
    this.pos.x = clamp(this.pos.x, -LIMIT, LIMIT); this.pos.z = clamp(this.pos.z, -LIMIT, LIMIT);
    collide(this.pos, this.radius);
    for (const o of G.npcs) pushApart(this.pos, o.pos, this.radius + 0.4);
    for (const e of G.enemies) if (e.state !== 'dead') pushApart(this.pos, e.pos, this.radius + e.def.radius);

    // vertical
    const ground = groundAt(this.pos.x, this.pos.z);
    this.vy -= 24 * dt; this.pos.y += this.vy * dt;
    if (this.pos.y <= ground) { if (!this.grounded && this.vy < -12) G.shake = Math.max(G.shake, 0.12); this.pos.y = ground; this.vy = 0; this.grounded = true; }
    else if (this.grounded && this.vy <= 0 && this.pos.y - ground < 0.7) { this.pos.y = ground; this.vy = 0; }
    else this.grounded = false;

    // facing
    if (this.attack && this.attack.target && this.attack.target.state !== 'dead') {
      const t = this.attack.target; this.yaw = angLerp(this.yaw, Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z), Math.min(1, dt * 12));
    } else if (moving && !this.roll && this.castT < 0 && !this.attack) this.yaw = angLerp(this.yaw, Math.atan2(dx, dz), Math.min(1, dt * 12));

    // attack progress
    if (this.attack) {
      const a = this.attack; const dur = a.combo === 2 ? 0.62 : 0.5;
      const prev = a.p; a.p += dt / dur;
      if (prev < 0.4 && a.p >= 0.4) this.strike(a);
      if (a.p >= 1) { if (a.queued && s.st >= 6) this.startAttack(a.combo + 1); else this.attack = null; }
    }
    // casting
    if (this.castT >= 0) {
      const prev = this.castT; this.castT += dt;
      if (prev < 0.22 && this.castT >= 0.22) this.launchFireball();
      if (this.castT > 0.5) this.castT = -1;
    }

    // resources
    if (sprint) { s.st = Math.max(0, s.st - 16 * dt); this.regenLock = 0.4; }
    else if (this.regenLock <= 0) s.st = Math.min(s.maxSt, s.st + 30 * dt);
    s.mp = Math.min(s.maxMp, s.mp + (2 + s.level * 0.3) * dt);
    if (this.combatT <= 0) s.hp = Math.min(s.maxHp, s.hp + 1.5 * dt);

    // animation
    this.drinkT = Math.max(0, this.drinkT - dt);
    this.animate(dt);
    this.rig.setWeaponVisible(s.hasSword);
    this.group.position.copy(this.pos); this.group.rotation.y = this.yaw;

    // sword trail
    if (this.attack && this.attack.p > 0.3 && this.attack.p < 0.6 && s.hasSword && this.rig.weaponSegment(V, TIP)) {
      for (let i = 0; i < 4; i++) { const k = Math.random(); G.fx.add.emit(V.x + (TIP.x - V.x) * k, V.y + (TIP.y - V.y) * k, V.z + (TIP.z - V.z) * k, 0, 0, 0, 1.8, 1.8, 2.2, 0.1, 0.2, { drag: 0 }); }
    }
  }
  animate(dt) {
    const r = this.rig, s = this.s;
    if (this.roll) r.play('Dodge_Forward', { once: true, key: 'roll' + this.rollSerial, timeScale: r.dur('Dodge_Forward') / 0.55, fade: 0.08 });
    else if (this.attack) {
      const clips = s.hasSword ? ['1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Chop'] : ['Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Punch_A'];
      const c = clips[this.attack.combo]; const d = this.attack.combo === 2 ? 0.62 : 0.5;
      r.play(c, { once: true, key: 'atk' + this.atkSerial, timeScale: r.dur(c) / d / 1.05, fade: 0.06 });
    } else if (this.castT >= 0) r.play('Spellcast_Shoot', { once: true, key: 'cast' + this.castSerial, timeScale: r.dur('Spellcast_Shoot') / 0.55, fade: 0.08 });
    else if (this.drinkT > 0) r.play('Use_Item', { once: true, key: 'drink' + this.drinkSerial, timeScale: r.dur('Use_Item') / 0.8 });
    else if (!this.grounded && this.vy > -30) r.play('Jump_Idle', { fade: 0.15 });
    else if (this.hurtT > 0.12) r.play('Hit_A', { once: true, key: 'hit' + this.hitSerial, timeScale: 1.6, fade: 0.05 });
    else if (this.speed > 7) r.play('Running_B', { timeScale: this.speed / 8.5 });
    else if (this.speed > 2.6) r.play('Running_A', { timeScale: clamp(this.speed / 5.6, 0.75, 1.4) });
    else if (this.speed > 0.4) r.play('Walking_A', { timeScale: clamp(this.speed / 2.2, 0.6, 1.3) });
    else r.play(this.combatT > 0 && s.hasSword ? 'Idle_Combat' : s.hasSword ? 'Idle' : 'Unarmed_Idle', { fade: 0.25 });
    r.update(dt);
  }
  startAttack(combo) {
    this.s.st -= 6; this.regenLock = 0.5;
    this.attack = { p: 0, combo, hit: new Set(), queued: false, target: this.facingTarget() }; this.atkSerial++;
    G.audio.play('swing');
  }
  strike(a) {
    const s = this.s;
    const base = s.hasSword ? s.dmg : 4;
    const mult = a.combo === 2 ? 1.6 : a.combo === 1 ? 1.15 : 1;
    const reach = a.combo === 1 ? 2.9 : 2.6, arc = a.combo === 1 ? 1.5 : 1.0;
    let any = false;
    for (const e of G.enemies) {
      if (e.state === 'dead' || a.hit.has(e)) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > reach + e.def.radius) continue;
      if (Math.abs(angDiff(this.yaw, Math.atan2(dx, dz))) > arc && d > e.def.radius + 0.6) continue;
      if (Math.abs(e.pos.y - this.pos.y) > 2.5) continue;
      a.hit.add(e); any = true;
      const crit = Math.random() < 0.12;
      const dmg = Math.round(base * mult * rand(0.9, 1.1) * (crit ? 1.8 : 1));
      e.hurt(dmg, this.pos, crit);
    }
    for (const ef of G.effigies) {
      if (ef.burned) continue;
      if (Math.hypot(ef.x - this.pos.x, ef.z - this.pos.z) < 2.6) { G.ui.notify('Straw won\'t yield to steel. Use Kindling [Q].', 'warn'); G.audio.play('hit'); break; }
    }
    if (any) { G.audio.play('hit'); G.shake = Math.max(G.shake, a.combo === 2 ? 0.22 : 0.1); this.combatT = 6; G.hitstop = 0.05; }
  }
  launchFireball() {
    const dir = new THREE.Vector3();
    G.camera.getWorldDirection(dir);
    // aim toward what the camera looks at, from the hand
    const start = new THREE.Vector3(); this.rig.handL.getWorldPosition(start);
    const tgt = this.facingTargetCam();
    if (tgt) dir.copy(tgt.pos).setY(tgt.pos.y + (tgt.def.height || 1) * 0.6).sub(start).normalize();
    else { dir.y = Math.max(dir.y + 0.08, -0.2); dir.normalize(); }
    const s = this.s;
    spawnProjectile({ pos: start, dir, speed: 24, owner: 'player', dmg: 26 + s.level * 5, radius: 0.35, aoe: 3.2, color: 0xff7a2a, life: 2.2 });
  }
  facingTargetCam() {
    let best = null, bs = 1e9; const cy = G.cam.yaw; const fyaw = Math.atan2(-Math.sin(cy), -Math.cos(cy));
    for (const e of G.enemies) {
      if (e.state === 'dead') continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 28) continue;
      const a = Math.abs(angDiff(fyaw, Math.atan2(dx, dz)));
      if (a > 0.3) continue;
      const sc = a * 20 + d; if (sc < bs) { bs = sc; best = e; }
    }
    if (!best) for (const ef of G.effigies) {
      if (ef.burned) continue;
      const dx = ef.x - this.pos.x, dz = ef.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 28) continue; const a = Math.abs(angDiff(fyaw, Math.atan2(dx, dz)));
      if (a < 0.3) { const sc = a * 20 + d; if (sc < bs) { bs = sc; best = { pos: new THREE.Vector3(ef.x, ef.y, ef.z), def: { height: 2.2 } }; } }
    }
    return best;
  }
  drink(kind) {
    const s = this.s;
    if (kind === 'potion') {
      if (s.potions <= 0) return G.ui.notify('No Healing Draughts left.', 'warn');
      if (s.hp >= s.maxHp) return G.ui.notify('Already at full health.', 'warn');
      s.potions--; s.hp = Math.min(s.maxHp, s.hp + 60); G.ui.floatText(V.copy(this.pos).setY(this.pos.y + 2), '+60', 'heal');
      G.fx.burst(V.copy(this.pos).setY(this.pos.y + 1), 30, 0xff5050, 2, 0.15, 0.8, { grav: 2, hdr: 2 });
    } else {
      if (s.tonics <= 0) return G.ui.notify('No Ember Tonics left.', 'warn');
      if (s.mp >= s.maxMp) return G.ui.notify('Kindling already full.', 'warn');
      s.tonics--; s.mp = Math.min(s.maxMp, s.mp + 50); G.ui.floatText(V.copy(this.pos).setY(this.pos.y + 2), '+50', 'mana');
      G.fx.burst(V.copy(this.pos).setY(this.pos.y + 1), 30, 0x50a0ff, 2, 0.15, 0.8, { grav: 2, hdr: 2 });
    }
    G.audio.play('drink'); this.drinkT = 0.8; this.drinkSerial = (this.drinkSerial || 0) + 1;
  }
}

function pushApart(p, q, m) {
  const dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz);
  if (d < m && d > 1e-4) { p.x = q.x + (dx / d) * m; p.z = q.z + (dz / d) * m; }
}

// ================================================================ Enemies
function cloneMats(obj) {
  const list = [];
  obj.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); list.push(o.material); } });
  return list;
}

export const ENEMY = {
  wolf: { name: 'Thornwood Wolf', hp: 42, dmg: 9, speed: 6.8, aggro: 18, range: 1.9, windup: 0.42, cd: 1.3, radius: 0.6, xp: 25, gold: [0, 3], height: 1.1, kind: 'beast',
    make: () => { const w = makeWolf(Math.random() < 0.5 ? 0x6d6a66 : 0x55524e); return { model: w, group: w.group }; } },
  raider: { name: 'Ashen Raider', hp: 75, dmg: 13, speed: 4.9, aggro: 22, range: 2.0, windup: 0.5, cd: 1.6, radius: 0.5, xp: 45, gold: [5, 12], height: 1.85, kind: 'humanoid', rig: 'raider',
    attacks: ['Dualwield_Melee_Attack_Chop', 'Dualwield_Melee_Attack_Slice'] },
  captain: { name: 'Captain Varrek', hp: 190, dmg: 19, speed: 4.7, aggro: 24, range: 2.4, windup: 0.6, cd: 1.4, radius: 0.6, xp: 130, gold: [30, 40], height: 2.15, kind: 'humanoid', elite: true, rig: 'captain',
    attacks: ['1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Stab'] },
  minion: { name: 'Ashbound Dead', hp: 55, dmg: 11, speed: 4.4, aggro: 18, range: 2.0, windup: 0.55, cd: 1.6, radius: 0.5, xp: 30, gold: [1, 5], height: 1.8, kind: 'humanoid', undead: true, rig: 'minion',
    attacks: ['1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Horizontal'] },
  wraith: { name: 'Ash Wraith', hp: 50, dmg: 11, speed: 5.4, aggro: 40, range: 2.0, windup: 0.5, cd: 1.5, radius: 0.5, xp: 25, gold: [0, 4], height: 1.9, kind: 'humanoid', undead: true, rig: 'wraith',
    attacks: ['1H_Melee_Attack_Chop', '1H_Melee_Attack_Stab'] },
  boss: { name: 'The Cinder Warden', hp: 950, dmg: 24, speed: 4.4, aggro: 30, range: 3.6, windup: 0.75, cd: 1.5, radius: 1.1, xp: 500, gold: [100, 120], height: 3.7, kind: 'humanoid', scale: 2.0, boss: true, undead: true, rig: 'boss',
    attacks: ['2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice'] },
};

let enemyId = 0;
export class Enemy {
  constructor(type, x, z, o = {}) {
    this.type = type; this.def = ENEMY[type]; this.id = o.id ?? type + (enemyId++);
    if (this.def.rig) { this.rig = new Rig(this.def.rig); this.group = this.rig.root; this.mats = this.rig.mats; this.m = null; }
    else { const m = this.def.make(); this.m = m.model; this.group = m.group; if (this.def.scale) this.group.scale.setScalar(this.def.scale); this.mats = cloneMats(this.group); }
    G.scene.add(this.group);
    this.pos = new THREE.Vector3(x, groundAt(x, z), z); this.home = { x, z }; this.leash = o.leash ?? 40;
    this.hp = this.def.hp; this.yaw = rand(0, 6.28); this.phase = 0; this.speed = 0;
    this.state = 'idle'; this.t = rand(0, 3); this.cd = 0; this.atk = null; this.hurtT = 0; this.flash = 0; this.deadT = 0;
    this.respawn = o.respawn ?? false; this.wander = { x, z };
    this.bossPhase = 1; this.summoned = false; this.special = 0; this.atkSerial = 0; this.hitSerial = 0;
    if (this.def.boss) this.state = 'dormant';
    if (o.spawn) { this.state = 'spawn'; this.t = 1.6; }
    G.enemies.push(this);
    G.ui.addEnemyBar(this);
  }
  hurt(dmg, from, crit = false, kind = 'melee') {
    if (this.state === 'dead') return;
    this.hp -= dmg; this.flash = 0.15;
    const top = V.copy(this.pos).setY(this.pos.y + this.def.height + 0.3);
    G.ui.floatText(top, (crit ? '✦' : '') + dmg, crit ? 'crit' : 'dmg');
    G.fx.hit(V.copy(this.pos).setY(this.pos.y + this.def.height * 0.6));
    if (this.def.kind === 'beast') G.fx.blood(V);
    this.aggro = true;
    if (this.state === 'idle' || this.state === 'return') this.state = 'chase';
    if (this.state === 'dormant') this.wake();
    if (!this.def.boss && !this.def.elite && (!this.atk || this.atk.p < 0.5)) {
      this.hurtT = 0.28; this.atk = null; this.state = 'chase'; this.hitSerial++;
      const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
      this.kb = { x: (dx / d) * 5, z: (dz / d) * 5, t: 0.14 };
    }
    if (this.hp <= 0) this.die();
  }
  die() {
    this.state = 'dead'; this.hp = 0; this.deadT = 0; this.atk = null;
    const s = G.state;
    s.kills[this.type] = (s.kills[this.type] || 0) + 1;
    if (this.type === 'raider' || this.type === 'captain') { if (!s.raidersDead.includes(this.id)) s.raidersDead.push(this.id); }
    G.player.gainXp(this.def.xp);
    const gold = randi(this.def.gold[0], this.def.gold[1]);
    if (gold) { s.p.gold += gold; G.ui.notify(`+${gold} gold`, 'gold'); G.audio.play('coin'); }
    if (Math.random() < (this.def.boss ? 1 : 0.18)) { s.p.potions++; G.ui.notify('Found a Healing Draught', 'item'); }
    G.fx.burst(V.copy(this.pos).setY(this.pos.y + 1), 25, this.type === 'wraith' || this.def.boss ? 0xff6a20 : 0xbbbbbb, 4, 0.2, 0.8, { hdr: 1.5 });
    if (this.type === 'wraith') G.fx.puff(this.pos, 12, 0x222222, 1.2, 1.5);
    if (this.def.boss) G.onBossDeath && G.onBossDeath(this);
    checkProgress();
  }
  remove() {
    G.scene.remove(this.group); G.ui.removeEnemyBar(this);
    const i = G.enemies.indexOf(this); if (i >= 0) G.enemies.splice(i, 1);
  }
  update(dt) {
    const P = G.player; const d = this.def;
    this.flash = Math.max(0, this.flash - dt); this.hurtT = Math.max(0, this.hurtT - dt); this.cd = Math.max(0, this.cd - dt);
    const fl = this.flash > 0 ? 1 : 0;
    for (const m of this.mats) { if (m.emissive && !m.userData.e0) m.userData.e0 = m.emissive.clone(), m.userData.ei0 = m.emissiveIntensity; if (m.emissive) { if (fl) { m.emissive.setRGB(1, 0.9, 0.8); m.emissiveIntensity = 0.6; } else { m.emissive.copy(m.userData.e0); m.emissiveIntensity = m.userData.ei0; } } }

    if (this.state === 'dead') {
      this.deadT += dt;
      if (d.kind === 'beast') { this.group.rotation.z = Math.min(Math.PI / 2, this.deadT * 6); this.group.position.y = this.pos.y + 0.15 - Math.max(0, this.deadT - 3) * 0.4; }
      else { this.rig.play(d.undead ? 'Death_C_Skeletons' : 'Death_A', { once: true, fade: 0.1 }); this.rig.update(dt); this.group.position.y = this.pos.y - Math.max(0, this.deadT - 4.5) * 0.4; }
      if (this.deadT > 7) {
        this.remove();
        if (this.respawn) setTimeout(() => { if (G.mode !== 'title') { const a = rand(0, 6.28); new Enemy(this.type, this.home.x + Math.cos(a) * 8, this.home.z + Math.sin(a) * 8, { respawn: true, leash: this.leash }); } }, 45000);
      }
      return;
    }
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
    const homeD = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
    const playerOk = !P.dead && G.mode !== 'ending';
    let move = 0, faceTo = null;

    if (this.state === 'dormant') {
      if (playerOk && dist < d.aggro * 0.75) this.wake();
    } else if (this.state === 'awaken' || this.state === 'spawn') {
      this.t -= dt; faceTo = Math.atan2(dx, dz);
      if (this.t <= 0) this.state = 'chase';
    } else if (this.state === 'idle') {
      this.t -= dt;
      const wd = Math.hypot(this.wander.x - this.pos.x, this.wander.z - this.pos.z);
      if (wd > 0.8) { move = 0.35; faceTo = Math.atan2(this.wander.x - this.pos.x, this.wander.z - this.pos.z); }
      if (this.t <= 0) { this.t = rand(3, 7); const a = rand(0, 6.28), r = rand(0, 8); this.wander = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r }; }
      if (playerOk && dist < d.aggro) { this.state = 'chase'; if (this.type === 'wolf') G.audio.play('howl'); if (d.boss) G.audio.play('roar'); }
    } else if (this.state === 'return') {
      move = 0.8; faceTo = Math.atan2(this.home.x - this.pos.x, this.home.z - this.pos.z);
      this.hp = Math.min(d.hp, this.hp + d.hp * 0.3 * dt);
      if (homeD < 2) { this.state = 'idle'; this.hp = d.hp; }
    } else if (this.state === 'chase') {
      if (!playerOk || (homeD > this.leash && !d.boss) || dist > d.aggro * 2.2) { this.state = 'return'; this.atk = null; }
      else {
        faceTo = Math.atan2(dx, dz);
        if (dist > d.range * 0.85) move = 1;
        if (this.hurtT > 0) move = 0;
        if (dist < d.range + 0.3 && this.cd <= 0 && this.hurtT <= 0) this.beginAttack(dist);
        else if (d.boss && this.cd <= 0 && dist > 7 && Math.random() < dt * 1.2) this.beginAttack(dist, 'volley');
      }
    } else if (this.state === 'attack') {
      const a = this.atk; a.p += dt / a.dur;
      if (a.track && a.p < a.strikeAt) faceTo = Math.atan2(dx, dz);
      if (!a.done && a.p >= a.strikeAt) { a.done = true; this.strike(a); }
      if (a.p >= 1) { this.atk = null; this.state = 'chase'; this.cd = d.cd * rand(0.8, 1.3) * (this.bossPhase === 2 ? 0.7 : 1); }
    }
    if (G.player && !['idle', 'return', 'dormant'].includes(this.state)) { P.combatT = Math.max(P.combatT, 4); }

    // move
    const spd = d.speed * move * (this.bossPhase === 2 ? 1.2 : 1);
    if (faceTo != null) this.yaw = angLerp(this.yaw, faceTo, Math.min(1, dt * (this.state === 'attack' ? 6 : 8)));
    this.speed += (spd - this.speed) * Math.min(1, dt * 8);
    let vx = Math.sin(this.yaw) * this.speed, vz = Math.cos(this.yaw) * this.speed;
    if (this.atk && this.type === 'wolf' && this.atk.p > 0.4 && this.atk.p < 0.65) { vx += Math.sin(this.yaw) * 7; vz += Math.cos(this.yaw) * 7; }
    if (this.kb) { vx += this.kb.x; vz += this.kb.z; this.kb.t -= dt; if (this.kb.t <= 0) this.kb = null; }
    const nx = this.pos.x + vx * dt, nz = this.pos.z + vz * dt;
    if (heightAt(nx, nz) > WATER_Y - 0.5) { this.pos.x = nx; this.pos.z = nz; }
    collide(this.pos, d.radius);
    for (const o of G.enemies) if (o !== this && o.state !== 'dead') pushApart(this.pos, o.pos, d.radius + o.def.radius);
    if (playerOk && !P.roll) pushApart(this.pos, P.pos, d.radius + P.radius);
    this.pos.y = groundAt(this.pos.x, this.pos.z);

    // animate
    this.phase += this.speed * dt * (d.kind === 'beast' ? 2.2 : 1.75) / (d.scale || 1);
    const look = 0;
    if (d.kind === 'beast') {
      animWolf(this.m, { move: this.speed / 4, phase: this.phase, t: G.time, attack: this.atk ? { p: this.atk.p } : null, growl: this.state === 'chase' && dist < 6, hurt: this.hurtT / 0.28, look });
    } else {
      this.animateRig(dt, dist);
      if (d.boss && Math.random() < 0.4) G.fx.fire(V.copy(this.pos).setY(this.pos.y + rand(1, 3.5)).add(new THREE.Vector3(rand(-0.6, 0.6), 0, rand(-0.6, 0.6))), 0.5);
      if (this.type === 'wraith' && Math.random() < 0.3) G.fx.puff(V.copy(this.pos).setY(this.pos.y + 0.4), 1, 0x1a1a1a, 0.6, 1.2, { alpha: 0.35, rise: 0.3 });
    }
    this.group.position.copy(this.pos); this.group.rotation.y = this.yaw;

    // boss phase change
    if (d.boss && this.bossPhase === 1 && this.hp < d.hp * 0.5) {
      this.bossPhase = 2; G.ui.banner('The Warden Burns Hotter', 'Ash Wraiths answer its call');
      G.audio.play('roar'); G.shake = 0.6;
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; new Enemy('wraith', this.pos.x + Math.cos(a) * 6, this.pos.z + Math.sin(a) * 6, { leash: 60, spawn: true }); }
    }
  }
  wake() {
    this.state = 'awaken'; this.t = this.rig ? this.rig.dur('Skeletons_Awaken_Standing') * 0.8 : 1; G.audio.play('roar'); G.shake = 0.4;
  }
  animateRig(dt, dist) {
    const r = this.rig, d = this.def, a = this.atk;
    if (this.state === 'dormant') r.play('Skeleton_Inactive_Standing_Pose', { fade: 0 });
    else if (this.state === 'awaken') r.play('Skeletons_Awaken_Standing', { once: true, timeScale: 1.25 });
    else if (this.state === 'spawn') r.play('Spawn_Ground_Skeletons', { once: true, timeScale: r.dur('Spawn_Ground_Skeletons') / 1.6 });
    else if (a) {
      const clip = a.kind === 'slam' ? '1H_Melee_Attack_Jump_Chop' : a.kind === 'volley' ? 'Spellcast_Summon' : d.attacks[this.atkSerial % d.attacks.length];
      // line the clip's impact frame (~45% in) up with the gameplay strike moment
      const ts = (r.dur(clip) * 0.45) / (a.dur * a.strikeAt);
      r.play(clip, { once: true, key: 'atk' + this.atkSerial, timeScale: ts, fade: 0.08 });
    } else if (this.hurtT > 0) r.play('Hit_B', { once: true, key: 'hit' + this.hitSerial, timeScale: 1.5, fade: 0.05 });
    else if (this.speed > 2.5) r.play('Running_A', { timeScale: clamp(this.speed / 5.2 / (d.scale || 1), 0.6, 1.4) });
    else if (this.speed > 0.3) r.play('Walking_A', { timeScale: clamp(this.speed / 2 / (d.scale || 1), 0.5, 1.4) });
    else r.play(this.state === 'chase' ? (d.undead ? 'Idle_Combat' : '2H_Melee_Idle') : 'Idle', { fade: 0.3 });
    r.update(dt);
  }
  beginAttack(dist, forced) {
    const d = this.def;
    let kind = forced || 'melee';
    if (d.boss && !forced) {
      const r = Math.random();
      kind = r < 0.35 ? 'slam' : 'melee';
      if (dist > d.range) kind = 'slam';
    }
    const combo = d.kind === 'humanoid' ? (Math.random() < 0.5 ? 0 : 1) : 0;
    const dur = kind === 'slam' ? 1.9 : kind === 'volley' ? 1.4 : d.windup + 0.7;
    const strikeAt = kind === 'slam' ? 0.55 : kind === 'volley' ? 0.45 : d.windup / dur + 0.06;
    this.atk = { p: 0, dur, strikeAt, kind, combo, done: false, track: kind !== 'slam' }; this.atkSerial++;
    this.state = 'attack';
    if (kind === 'slam') {
      const p = this.pos.clone(); G.fx.telegraph(p, 5.5, dur * strikeAt, null);
    }
    if (this.type === 'wolf') G.audio.play('howl');
  }
  strike(a) {
    const P = G.player, d = this.def;
    const dmg = d.dmg * (this.bossPhase === 2 ? 1.2 : 1);
    if (a.kind === 'slam') {
      G.fx.explode(V.copy(this.pos).setY(this.pos.y + 0.3), 0xff6a20, 1.4); G.audio.play('boom');
      for (let i = 0; i < 24; i++) { const ang = (i / 24) * Math.PI * 2; G.fx.fire(V.copy(this.pos).add(new THREE.Vector3(Math.cos(ang) * 4.5, 0.2, Math.sin(ang) * 4.5)), 1.2); }
      if (P.pos.distanceTo(this.pos) < 5.5 + P.radius && Math.abs(P.pos.y - this.pos.y) < 2) P.takeDamage(dmg * 1.4, this.pos);
      return;
    }
    if (a.kind === 'volley') {
      const start = V.copy(this.pos).setY(this.pos.y + 3.2);
      const n = this.bossPhase === 2 ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const target = P.pos.clone().setY(P.pos.y + 1); const dir = target.sub(start).normalize();
        const spread = (i - (n - 1) / 2) * 0.18; const c = Math.cos(spread), s = Math.sin(spread);
        const ndir = new THREE.Vector3(dir.x * c + dir.z * s, dir.y, -dir.x * s + dir.z * c).normalize();
        spawnProjectile({ pos: start.clone(), dir: ndir, speed: 15, owner: 'enemy', dmg: dmg * 0.6, radius: 0.5, color: 0xff5a10, life: 3 });
      }
      G.audio.play('cast'); return;
    }
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
    if (dist < d.range + P.radius + 0.4 && Math.abs(angDiff(this.yaw, Math.atan2(dx, dz))) < 1.2 && Math.abs(P.pos.y - this.pos.y) < 2) {
      if (P.takeDamage(dmg, this.pos)) G.audio.play('hit');
    }
    if (this.type !== 'wolf') G.audio.play('swing');
  }
}

// ================================================================ Projectiles
export function spawnProjectile(o) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(o.radius * 0.8, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(o.color).multiplyScalar(4) }));
  g.add(core);
  const light = new THREE.PointLight(o.color, 12, 9, 1.8); g.add(light);
  g.position.copy(o.pos); G.scene.add(g);
  G.projectiles.push({ ...o, g, vel: o.dir.clone().multiplyScalar(o.speed), age: 0 });
}
export function updateProjectiles(dt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i]; p.age += dt;
    p.g.position.addScaledVector(p.vel, dt);
    const pos = p.g.position;
    const c = new THREE.Color(p.color);
    for (let k = 0; k < 3; k++) G.fx.add.emit(pos.x + rand(-0.1, 0.1), pos.y + rand(-0.1, 0.1), pos.z + rand(-0.1, 0.1), rand(-0.5, 0.5), rand(0, 1), rand(-0.5, 0.5), c.r * 3, c.g * 3, c.b * 3, p.radius * rand(1.2, 2), 0.35, { grow: -1 });
    let hit = false;
    if (pos.y < groundAt(pos.x, pos.z) + 0.1 || p.age > p.life) hit = true;
    if (p.owner === 'player') {
      for (const e of G.enemies) {
        if (e.state === 'dead') continue;
        const dy = pos.y - (e.pos.y + e.def.height * 0.5);
        if (Math.hypot(pos.x - e.pos.x, pos.z - e.pos.z) < e.def.radius + p.radius + 0.2 && Math.abs(dy) < e.def.height * 0.6 + 0.3) { hit = true; break; }
      }
      for (const ef of G.effigies) if (!ef.burned && Math.hypot(pos.x - ef.x, pos.z - ef.z) < 0.9 && pos.y < ef.y + 2.5) hit = true;
    } else {
      const P = G.player;
      if (Math.hypot(pos.x - P.pos.x, pos.z - P.pos.z) < P.radius + p.radius && pos.y > P.pos.y && pos.y < P.pos.y + 2.2) {
        hit = true; P.takeDamage(p.dmg, pos);
      }
    }
    if (hit) {
      G.fx.explode(pos.clone(), p.color, p.owner === 'player' ? 0.8 : 0.5); G.audio.play('boom');
      if (p.owner === 'player') {
        for (const e of G.enemies) {
          if (e.state === 'dead') continue;
          const d = Math.hypot(pos.x - e.pos.x, pos.z - e.pos.z);
          if (d < p.aoe + e.def.radius && Math.abs(pos.y - e.pos.y) < 3.5) e.hurt(Math.round(p.dmg * (1 - (d / (p.aoe + e.def.radius)) * 0.4)), pos, false, 'fire');
        }
        for (const ef of G.effigies) if (!ef.burned && Math.hypot(pos.x - ef.x, pos.z - ef.z) < p.aoe) burnEffigy(ef);
      }
      G.scene.remove(p.g); p.g.children[0].geometry.dispose(); p.g.children[0].material.dispose();
      G.projectiles.splice(i, 1);
    }
  }
}

// ================================================================ Effigies
export function spawnEffigies() {
  for (const ef of G.effigies) G.scene.remove(ef.g);
  G.effigies.length = 0;
  G.refs.effigySpots.forEach((s, i) => {
    const g = makeEffigy(); const y = groundAt(s.x, s.z); g.position.set(s.x, y, s.z); g.rotation.y = Math.atan2(G.refs.kindleStone.x - s.x, G.refs.kindleStone.z - s.z); G.scene.add(g);
    G.effigies.push({ g, x: s.x, y, z: s.z, burned: i < G.state.effigiesBurned, burnT: 0 });
    if (i < G.state.effigiesBurned) g.visible = false;
  });
}
function burnEffigy(ef) {
  ef.burned = true; ef.burnT = 3.5;
  G.state.effigiesBurned++;
  G.ui.notify(`Effigy burned (${G.state.effigiesBurned}/3)`, 'quest');
  checkProgress();
}
export function updateEffigies(dt) {
  for (const ef of G.effigies) {
    if (ef.burned && ef.burnT > 0) {
      ef.burnT -= dt;
      for (let i = 0; i < 3; i++) G.fx.fire(V.set(ef.x + rand(-0.3, 0.3), ef.y + rand(0.5, 2), ef.z + rand(-0.3, 0.3)), 1);
      if (Math.random() < 0.3) G.fx.puff(V.set(ef.x, ef.y + 2.2, ef.z), 1, 0x333333, 0.8, 2);
      ef.g.traverse((o) => { if (o.isMesh) { o.material = mat(0x1a1410); } });
      ef.g.scale.y = Math.max(0.2, ef.burnT / 3.5);
      if (ef.burnT <= 0) ef.g.visible = false;
    }
  }
}

// ================================================================ NPCs
export const NPC_DEFS = {
  hollis: { name: 'Hollis', title: 'Blacksmith', scale: 1.06 },
  bree: { name: 'Bree', title: 'Shepherd', scale: 0.95 },
  ossic: { name: 'Ossic', title: 'The Lantern-Bearer', scale: 1.0 },
  tamm: { name: 'Elder Tamm', title: 'Village Elder', scale: 0.92 },
  pell: { name: 'Pell', title: 'Curious Child', scale: 0.64 },
};
export class NPC {
  constructor(id, x, z, yaw = 0) {
    const d = NPC_DEFS[id]; this.id = id; this.def = d; this.name = d.name;
    this.rig = new Rig(id); this.group = this.rig.root; G.scene.add(this.group);
    if (id === 'ossic' && this.rig.weapon) {
      // a lantern hung from the top of the staff
      const lan = new THREE.Group(); lan.position.copy(this.rig.tip); this.rig.weapon.add(lan);
      const k = 1 / (0.86 * this.rig.weapon.getWorldScale(new THREE.Vector3()).x || 1);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.07 * k, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffc066, emissive: 0xffb040, emissiveIntensity: 6 }));
      lan.add(glow);
      this.lantern = new THREE.PointLight(0xffb040, 6, 8, 1.8); lan.add(this.lantern);
    }
    this.pos = new THREE.Vector3(x, groundAt(x, z), z); this.yaw = yaw; this.baseYaw = yaw; this.hidden = false; this.cheerT = rand(4, 10);
    this.group.position.copy(this.pos); this.group.rotation.y = yaw;
    this.rig.play('Idle', { at: Math.random() });
    G.npcs.push(this);
    G.ui.addNpcTag(this);
  }
  setVisible(v) { this.hidden = !v; this.group.visible = v; }
  update(dt) {
    if (this.hidden) return;
    const P = G.player; const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    const talking = G.ui.dlg && G.mode === 'dialogue' && d < 5;
    const want = d < 6 ? Math.atan2(dx, dz) : this.baseYaw;
    this.yaw = angLerp(this.yaw, want, Math.min(1, dt * 3));
    this.pos.y = groundAt(this.pos.x, this.pos.z);
    const r = this.rig;
    if (this.id === 'hollis' && d > 6) {
      // working the anvil; sparks fly on each blow
      const a = r.play('1H_Melee_Attack_Chop', { timeScale: 0.8 });
      const ph = a.time / a.getClip().duration;
      if (this._ph !== undefined && this._ph < 0.42 && ph >= 0.42) {
        const hp = new THREE.Vector3(); (r.weaponSegment(hp, TIP) ? TIP : r.handR.getWorldPosition(TIP));
        G.fx.burst(TIP, 10, 0xffa040, 3, 0.06, 0.4, { grav: -10, hdr: 4 });
        if (d < 25) G.audio.play('clang');
      }
      this._ph = ph;
    } else if (this.id === 'pell' && d < 7 && !talking) {
      this.cheerT -= dt;
      if (this.cheerT <= 0) { this.cheerT = rand(6, 12); this.cheering = r.dur('Cheer'); }
      if (this.cheering > 0) { this.cheering -= dt; r.play('Cheer', { once: true }); } else r.play('Idle');
    } else if (talking) { if (!this._talked) { this._talked = true; r.play('Interact', { once: true, key: 'talk' + G.time }); } }
    else { this._talked = false; r.play('Idle', { fade: 0.3 }); }
    r.update(dt);
    this.group.position.copy(this.pos); this.group.rotation.y = this.yaw;
  }
}
