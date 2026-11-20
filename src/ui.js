// HUD, menus, dialogue, minimap
import * as THREE from 'three';
import { G } from './game.js';
import { HALF, POI, buildMapImage } from './world.js';
import { STAGES, questTitle, objectiveText, SHOP, DIALOGUE } from './story.js';
import { xpToNext } from './entities.js';

const $ = (id) => document.getElementById(id);
const V = new THREE.Vector3();

export class UI {
  constructor() {
    this.floats = []; this.bars = new Map(); this.tags = new Map();
    this.mapImg = buildMapImage(300);
    this.mm = $('minimap').getContext('2d');
    this.dlg = null; this.panel = null;
    this.bannerQ = []; this.bannerT = 0;
  }
  // ---------------------------------------------------------- notifications
  notify(text, cls = '') {
    const el = document.createElement('div'); el.className = 'note ' + cls; el.textContent = text;
    $('notes').prepend(el);
    setTimeout(() => el.classList.add('out'), 2800); setTimeout(() => el.remove(), 3400);
    while ($('notes').children.length > 6) $('notes').lastChild.remove();
  }
  banner(title, sub) { this.bannerQ.push([title, sub]); if (this.bannerT <= 0) this.nextBanner(); }
  nextBanner() {
    const b = this.bannerQ.shift(); if (!b) return;
    $('banner-title').textContent = b[0]; $('banner-sub').textContent = b[1];
    const el = $('banner'); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    this.bannerT = 3.2;
  }
  floatText(pos, text, cls) {
    const el = document.createElement('div'); el.className = 'float ' + cls; el.textContent = text; $('floats').appendChild(el);
    this.floats.push({ el, pos: pos.clone(), t: 0, dx: (Math.random() - 0.5) * 30 });
  }
  hurtFlash() { const el = $('hurt'); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }

  // ---------------------------------------------------------- world-space labels
  addEnemyBar(e) {
    const el = document.createElement('div'); el.className = 'ebar' + (e.def.elite ? ' elite' : '');
    el.innerHTML = `<div class="ename">${e.def.name}</div><div class="etrack"><div class="efill"></div></div>`;
    $('worldui').appendChild(el); this.bars.set(e, { el, fill: el.querySelector('.efill') });
  }
  removeEnemyBar(e) { const b = this.bars.get(e); if (b) { b.el.remove(); this.bars.delete(e); } }
  addNpcTag(n) {
    const el = document.createElement('div'); el.className = 'ntag';
    el.innerHTML = `<div class="nmark"></div><div class="nname">${n.def.name}</div><div class="ntitle">${n.def.title}</div>`;
    $('worldui').appendChild(el); this.tags.set(n, { el, mark: el.querySelector('.nmark') });
  }
  project(pos) {
    V.copy(pos).project(G.camera);
    if (V.z > 1) return null;
    return { x: (V.x * 0.5 + 0.5) * innerWidth, y: (-V.y * 0.5 + 0.5) * innerHeight };
  }

  // ---------------------------------------------------------- dialogue
  openDialogue(npcId) {
    const tree = DIALOGUE[npcId](); this.dlg = { tree, node: 'start' };
    G.setMode('dialogue'); $('dialogue').classList.remove('hidden');
    this.showNode();
  }
  showNode() {
    const n = this.dlg.tree[this.dlg.node];
    $('dlg-who').textContent = n.who;
    const txt = $('dlg-text'); txt.textContent = '';
    this.dlg.full = n.text; this.dlg.typed = 0; this.dlg.typing = true;
    const ch = $('dlg-choices'); ch.innerHTML = ''; ch.classList.add('wait');
    n.choices.forEach((c, i) => {
      const b = document.createElement('button'); b.className = 'choice'; b.innerHTML = `<span class="k">${i + 1}</span> ${c.t}`;
      b.onclick = () => this.choose(i); ch.appendChild(b);
    });
  }
  typeTick(dt) {
    const d = this.dlg; if (!d || !d.typing) return;
    d.typed += dt * 70; const n = Math.floor(d.typed);
    $('dlg-text').textContent = d.full.slice(0, n);
    if (n >= d.full.length) { d.typing = false; $('dlg-choices').classList.remove('wait'); }
  }
  skipType() { if (this.dlg && this.dlg.typing) { this.dlg.typed = 1e9; this.typeTick(0); return true; } return false; }
  choose(i) {
    if (!this.dlg) return;
    if (this.skipType()) return;
    const n = this.dlg.tree[this.dlg.node]; const c = n.choices[i]; if (!c) return;
    G.audio.play('ui');
    if (c.next) { this.dlg.node = c.next; this.showNode(); }
    else { this.closeDialogue(); }
    if (c.act) c.act();
  }
  closeDialogue() {
    this.dlg = null; $('dialogue').classList.add('hidden');
    if (G.mode === 'dialogue') G.setMode('play');
  }

  // ---------------------------------------------------------- panels
  openPanel(name) {
    if (this.panel === name) return this.closePanel();
    this.panel = name; G.setMode('panel');
    for (const p of ['inventory', 'journal', 'worldmap', 'shop', 'pause']) $(p).classList.toggle('hidden', p !== name);
    $('panels').classList.remove('hidden');
    if (name === 'inventory') this.renderInventory();
    if (name === 'journal') this.renderJournal();
    if (name === 'worldmap') this.renderWorldMap();
    if (name === 'shop') this.renderShop();
    G.audio.play('ui');
  }
  closePanel() {
    this.panel = null; $('panels').classList.add('hidden');
    if (G.mode === 'panel') G.setMode('play');
  }
  openShop() { setTimeout(() => this.openPanel('shop'), 0); }
  renderInventory() {
    const p = G.state.p;
    $('inv-stats').innerHTML = `
      <div class="row"><span>Level</span><b>${p.level}</b></div>
      <div class="row"><span>Experience</span><b>${Math.floor(p.xp)} / ${xpToNext(p.level)}</b></div>
      <div class="row"><span>Health</span><b>${Math.ceil(p.hp)} / ${p.maxHp}</b></div>
      <div class="row"><span>Kindling</span><b>${Math.floor(p.mp)} / ${p.maxMp}</b></div>
      <div class="row"><span>Weapon damage</span><b>${p.hasSword ? p.dmg : '—'}</b></div>
      <div class="row"><span>Kindle bolt</span><b>${p.hasKindling ? 26 + p.level * 5 : 'Not learned'}</b></div>
      <div class="row"><span>Armor</span><b>${p.armor}</b></div>
      <div class="row"><span>Gold</span><b class="gold">${p.gold}</b></div>`;
    const items = [];
    if (p.hasSword) items.push(['⚔', 'Star-iron Sword', 'Forged by Hollis from iron found with you as a babe.']);
    if (p.owned.edge) items.push(['✧', 'Tempered Edge', 'Your blade holds a keener edge. (+6 dmg)']);
    if (p.owned.jerkin) items.push(['⛨', 'Riveted Jerkin', 'Boiled leather and iron rivets. (+6 armor)']);
    if (p.owned.charm) items.push(['✺', 'Ember Charm', 'Warm to the touch. (+25 kindling)']);
    items.push(['⚗', `Healing Draught ×${p.potions}`, 'Restores 60 health. Press 1.']);
    items.push(['⚱', `Ember Tonic ×${p.tonics}`, 'Restores 50 kindling. Press 2.']);
    if (G.state.hasLetter) items.push(['✉', 'Sealed Letter', 'Ash-grey wax. The mark of the Ashen Choir.']);
    $('inv-items').innerHTML = items.map(([i, n, d]) => `<div class="item"><div class="icon">${i}</div><div><b>${n}</b><small>${d}</small></div></div>`).join('');
  }
  renderJournal() {
    const s = G.state;
    $('journal-body').innerHTML = `<h3>${questTitle()}</h3><p class="obj">◆ ${objectiveText()}</p>` +
      (s.completed.length ? `<h4>Completed</h4>` + s.completed.map((q) => `<p class="done">✓ ${q}</p>`).join('') : '') +
      `<h4>Lore</h4><p class="lore">The Hearthstone, a shard of the first fire, was set in the Shrine of Vael by the Seven Wardens. While it burned, the vales stayed green and the Ashen King slept beneath the Gloamreach. Three nights ago, it went dark.</p>`;
  }
  renderWorldMap() {
    const cv = $('bigmap'); const ctx = cv.getContext('2d'); const S = cv.width;
    ctx.drawImage(this.mapImg, 0, 0, S, S);
    const toMap = (x, z) => [((x + HALF) / (HALF * 2)) * S, ((z + HALF) / (HALF * 2)) * S];
    ctx.font = '600 15px Cinzel, Georgia, serif'; ctx.textAlign = 'center';
    for (const k of ['village', 'stones', 'thornwood', 'camp', 'shrine', 'lake']) {
      const p = POI[k]; const [x, y] = toMap(p.x, p.z);
      ctx.fillStyle = 'rgba(20,14,8,0.6)'; ctx.fillText(p.name, x + 1, y - 9); ctx.fillStyle = '#f3e3c0'; ctx.fillText(p.name, x, y - 10);
      ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fillStyle = '#f3e3c0'; ctx.fill();
    }
    const w = G.objectivePos();
    if (w) { const [x, y] = toMap(w.x, w.z); this.drawStar(ctx, x, y, 9); }
    const P = G.player; const [px, py] = toMap(P.pos.x, P.pos.z);
    this.drawArrow(ctx, px, py, P.yaw, 10);
  }
  renderShop() {
    const p = G.state.p;
    $('shop-gold').textContent = p.gold;
    $('shop-list').innerHTML = '';
    for (const it of SHOP) {
      const owned = it.once && p.owned[it.id];
      const row = document.createElement('div'); row.className = 'shoprow' + (owned ? ' owned' : '');
      row.innerHTML = `<div><b>${it.name}</b><small>${it.desc}</small></div><button ${owned || p.gold < it.price ? 'disabled' : ''}>${owned ? 'Owned' : it.price + 'g'}</button>`;
      row.querySelector('button').onclick = () => {
        if (p.gold < it.price || owned) return;
        p.gold -= it.price; it.buy(p); if (it.once) p.owned[it.id] = true;
        G.audio.play('coin'); this.notify('Purchased ' + it.name, 'item'); this.renderShop(); G.save();
      };
      $('shop-list').appendChild(row);
    }
  }
  showDeath() { G.setMode('dead'); $('death').classList.remove('hidden'); }
  hideDeath() { $('death').classList.add('hidden'); }
  showEnding(paras) {
    G.setMode('ending'); const el = $('ending'); el.classList.remove('hidden');
    const body = $('ending-text'); body.innerHTML = '';
    paras.forEach((t, i) => { const p = document.createElement('p'); p.textContent = t; p.style.animationDelay = (i * 2.4 + 0.5) + 's'; body.appendChild(p); });
    $('ending-btn').style.animationDelay = (paras.length * 2.4 + 1) + 's';
  }

  // ---------------------------------------------------------- drawing helpers
  drawArrow(ctx, x, y, yaw, s) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI - yaw);
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.65, s * 0.7); ctx.lineTo(0, s * 0.35); ctx.lineTo(-s * 0.65, s * 0.7); ctx.closePath();
    ctx.fillStyle = '#fff4d6'; ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 2; ctx.fill(); ctx.stroke(); ctx.restore();
  }
  drawStar(ctx, x, y, r) {
    ctx.save(); ctx.translate(x, y); ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = '#ffcc4a'; ctx.strokeStyle = '#3a2208'; ctx.lineWidth = 2; ctx.fill(); ctx.stroke(); ctx.restore();
  }

  // ---------------------------------------------------------- per-frame
  update(dt) {
    const p = G.state.p, P = G.player;
    $('hp-fill').style.width = (p.hp / p.maxHp) * 100 + '%'; $('hp-txt').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    $('mp-fill').style.width = (p.mp / p.maxMp) * 100 + '%'; $('mp-txt').textContent = `${Math.floor(p.mp)} / ${p.maxMp}`;
    $('st-fill').style.width = (p.st / p.maxSt) * 100 + '%';
    $('xp-fill').style.width = (p.xp / xpToNext(p.level)) * 100 + '%';
    $('lvl').textContent = p.level; $('gold').textContent = p.gold;
    $('cnt-potion').textContent = p.potions; $('cnt-tonic').textContent = p.tonics;
    $('slot-cast').classList.toggle('locked', !p.hasKindling || p.mp < 20);
    $('slot-attack').classList.toggle('locked', !p.hasSword);
    $('cd-cast').style.height = (P.castCd / 0.8) * 100 + '%';
    $('lowhp').style.opacity = p.hp / p.maxHp < 0.3 ? 0.6 + Math.sin(G.time * 6) * 0.25 : 0;
    $('q-title').textContent = questTitle(); $('q-obj').textContent = objectiveText();

    // banner
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) { $('banner').classList.remove('show'); setTimeout(() => this.nextBanner(), 400); } }
    this.typeTick(dt);

    // floats
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]; f.t += dt; const s = this.project(f.pos);
      if (!s || f.t > 1.1) { f.el.remove(); this.floats.splice(i, 1); continue; }
      f.el.style.transform = `translate(${s.x + f.dx * f.t}px, ${s.y - f.t * 60}px) translate(-50%,-50%) scale(${1 + Math.max(0, 0.3 - f.t) * 2})`;
      f.el.style.opacity = Math.min(1, (1.1 - f.t) * 3);
    }
    // enemy bars
    let boss = null;
    for (const [e, b] of this.bars) {
      if (e.def.boss) { boss = e; b.el.style.display = 'none'; continue; }
      const show = e.state !== 'dead' && (e.hp < e.def.hp || e.state === 'chase' || e.state === 'attack') && e.pos.distanceTo(P.pos) < 35;
      const s = show && this.project(V.copy(e.pos).setY(e.pos.y + e.def.height + 0.55));
      if (!s) { b.el.style.display = 'none'; continue; }
      b.el.style.display = 'block'; b.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%,-100%)`;
      b.fill.style.width = (e.hp / e.def.hp) * 100 + '%';
    }
    $('bossbar').classList.toggle('hidden', !(boss && boss.state !== 'dead' && boss.state !== 'idle'));
    if (boss) { $('boss-fill').style.width = (boss.hp / boss.def.hp) * 100 + '%'; }
    // npc tags
    const ip = G.interactPrompt;
    for (const [n, t] of this.tags) {
      const d = n.pos.distanceTo(P.pos);
      const s = !n.hidden && d < 22 && this.project(V.copy(n.pos).setY(n.pos.y + 2.2 * (n.def.scale || 1) + 0.2));
      if (!s) { t.el.style.display = 'none'; continue; }
      t.el.style.display = 'block'; t.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%,-100%)`;
      t.el.style.opacity = d < 12 ? 1 : (22 - d) / 10;
      const w = STAGES[G.state.stage].where; const isObj = w && w() === n.pos;
      t.mark.textContent = isObj ? '!' : ''; t.mark.classList.toggle('on', isObj);
    }
    $('prompt').classList.toggle('hidden', !ip);
    if (ip) $('prompt-text').textContent = ip;
    this.drawMinimap();
  }
  drawMinimap() {
    const ctx = this.mm, S = 180, P = G.player; const zoom = 2.2; // px per world unit… map image is 0.5 px/unit
    const scale = (300 / (HALF * 2)) * zoom; // map px per world unit * zoom
    ctx.save(); ctx.clearRect(0, 0, S, S);
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, 7); ctx.clip();
    ctx.fillStyle = '#1a2a30'; ctx.fillRect(0, 0, S, S);
    const mx = ((P.pos.x + HALF) / (HALF * 2)) * 300, mz = ((P.pos.z + HALF) / (HALF * 2)) * 300;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mapImg, mx - S / 2 / zoom, mz - S / 2 / zoom, S / zoom, S / zoom, 0, 0, S, S);
    const toMM = (x, z) => [S / 2 + (x - P.pos.x) * scale, S / 2 + (z - P.pos.z) * scale];
    for (const e of G.enemies) {
      if (e.state === 'dead') continue; const [x, y] = toMM(e.pos.x, e.pos.z);
      ctx.beginPath(); ctx.arc(x, y, e.def.boss ? 5 : 3, 0, 7); ctx.fillStyle = e.def.boss ? '#ff6a20' : '#e04040'; ctx.fill();
    }
    for (const n of G.npcs) {
      if (n.hidden) continue; const [x, y] = toMM(n.pos.x, n.pos.z);
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fillStyle = '#ffd36a'; ctx.fill(); ctx.strokeStyle = '#3a2208'; ctx.stroke();
    }
    const w = G.objectivePos();
    if (w) {
      let [x, y] = toMM(w.x, w.z); const dx = x - S / 2, dy = y - S / 2, d = Math.hypot(dx, dy), lim = S / 2 - 12;
      if (d > lim) { x = S / 2 + (dx / d) * lim; y = S / 2 + (dy / d) * lim; }
      this.drawStar(ctx, x, y, 7);
    }
    this.drawArrow(ctx, S / 2, S / 2, P.yaw, 8);
    ctx.restore();
    // camera direction compass
    const cy = G.cam.yaw; const cv = Math.atan2(-Math.sin(cy), -Math.cos(cy));
    $('compass').style.transform = `rotate(${(Math.PI - cv) * 57.3 + 180}deg)`;
  }
}
