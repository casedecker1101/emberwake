// Quests, dialogue, items — original story for Emberwake
import { G } from './game.js';
import { POI } from './world.js';

export const STAGES = {
  q1_talk: { quest: "The Smith's Apprentice", obj: 'Speak with Hollis at the smithy', where: () => npcPos('hollis') },
  q1_chest: { obj: 'Fetch your sword from the chest beside the forge', where: () => G.refs.smithChest.pos },
  q1_return: { obj: 'Return to Hollis', where: () => npcPos('hollis') },
  q2_talk: { quest: 'Wolves at the Fold', obj: 'Find Bree the shepherd at the sheepfold', where: () => npcPos('bree') },
  q2_hunt: { obj: 'Slay wolves in the Thornwood', count: 5, prog: () => kills('wolf'), where: () => POI.thornwood },
  q2_return: { obj: 'Return to Bree', where: () => npcPos('bree') },
  q3_talk: { quest: 'The Lantern-Bearer', obj: 'Meet the stranger at the village well', where: () => npcPos('ossic') },
  q3_stone: { obj: 'Touch the Kindle Stone at the Standing Stones', where: () => G.refs.kindleStone },
  q3_effigy: { obj: 'Burn the straw effigies with Kindling [Q]', count: 3, prog: () => G.state.effigiesBurned, where: () => POI.stones },
  q3_return: { obj: 'Return to Ossic at the well', where: () => npcPos('ossic') },
  q4_camp: { quest: 'Smoke on the East Road', obj: 'Defeat the raiders at the east camp', count: 5, prog: () => G.state.raidersDead.length, where: () => POI.camp },
  q4_chest: { obj: "Search the raider captain's strongbox", where: () => G.refs.campChest.pos },
  q4_return: { obj: 'Bring the sealed letter to Ossic', where: () => npcPos('ossic') },
  q5_travel: { quest: 'The Cold Shrine', obj: 'Journey north to the Shrine of Vael', where: () => POI.shrine },
  q5_boss: { obj: 'Defeat the Cinder Warden', where: () => G.refs.pedestal },
  q5_pedestal: { obj: 'Examine the empty pedestal', where: () => G.refs.pedestal },
  done: { quest: 'Act I Complete', obj: 'The road north awaits…', where: null },
};
export const ORDER = Object.keys(STAGES);
export const stageIdx = (s) => ORDER.indexOf(s);
export const atLeast = (s) => stageIdx(G.state.stage) >= stageIdx(s);
function npcPos(id) { const n = G.npcs.find((n) => n.id === id); return n ? n.pos : null; }
function kills(type) { return (G.state.kills[type] || 0) - (G.state.stageBase[type] || 0); }

export function questTitle(stage = G.state.stage) {
  let t = '';
  for (const k of ORDER) { if (STAGES[k].quest) t = STAGES[k].quest; if (k === stage) break; }
  return t;
}
export function objectiveText() {
  const s = STAGES[G.state.stage];
  if (s.count) return `${s.obj} (${Math.min(s.count, s.prog())}/${s.count})`;
  return s.obj;
}

export function setStage(id, silent = false) {
  const prevQuest = questTitle();
  G.state.stage = id;
  G.state.stageBase = { ...G.state.kills };
  const q = questTitle();
  if (!silent) {
    if (q !== prevQuest) {
      if (!G.state.completed.includes(prevQuest) && prevQuest) G.state.completed.push(prevQuest);
      G.ui.banner(id === 'done' ? 'Act I Complete' : 'New Quest', q);
      G.audio.play('quest');
    } else G.ui.notify('Objective updated: ' + STAGES[id].obj, 'quest');
  }
  G.onStage && G.onStage(id);
  G.save && G.save();
}

export function checkProgress() {
  const s = STAGES[G.state.stage];
  if (s.count && s.prog() >= s.count) {
    const next = ORDER[stageIdx(G.state.stage) + 1];
    setStage(next);
  }
}

export function reward({ xp = 0, gold = 0, potions = 0, tonics = 0 }) {
  const p = G.state.p;
  if (gold) { p.gold += gold; G.ui.notify(`+${gold} gold`, 'gold'); G.audio.play('coin'); }
  if (potions) { p.potions += potions; G.ui.notify(`+${potions} Healing Draught`, 'item'); }
  if (tonics) { p.tonics += tonics; G.ui.notify(`+${tonics} Ember Tonic`, 'item'); }
  if (xp) G.player.gainXp(xp);
}

export const SHOP = [
  { id: 'potion', name: 'Healing Draught', desc: 'Restores 60 health. [1]', price: 15, buy: (p) => { p.potions++; } },
  { id: 'tonic', name: 'Ember Tonic', desc: 'Restores 50 kindling. [2]', price: 20, buy: (p) => { p.tonics++; } },
  { id: 'edge', name: 'Tempered Edge', desc: 'Hollis re-hones your blade. +6 weapon damage.', price: 60, once: true, buy: (p) => { p.dmg += 6; } },
  { id: 'jerkin', name: 'Riveted Jerkin', desc: 'Boiled leather and iron rivets. +6 armor.', price: 50, once: true, buy: (p) => { p.armor += 6; } },
  { id: 'charm', name: 'Ember Charm', desc: 'A warm coal set in brass. +25 max kindling.', price: 80, once: true, buy: (p) => { p.maxMp += 25; p.mp += 25; } },
];

// ------------------------------------------------------------- Dialogue
// Node: { who, text, choices: [{ t, next, act }] }. next: node id or null to close.
const st = () => G.state.stage;

export const DIALOGUE = {
  hollis() {
    const s = st();
    if (s === 'q1_talk') return {
      start: { who: 'Hollis', text: "There you are, Wren. Sun's been up an hour and that forge won't stoke itself.", choices: [{ t: 'Sorry. I had the dream again.', next: 'dream' }, { t: "What's the rush?", next: 'wolves' }] },
      dream: { who: 'Hollis', text: "The fire and the voice? Hmph. Dreams are for folk who sleep past dawn.", choices: [{ t: '…', next: 'wolves' }] },
      wolves: { who: 'Hollis', text: "Bree says the wolves came down out of the Thornwood again last night. Took two ewes right through the fence. They've never been this bold.", choices: [{ t: 'Want me to help her?', next: 'sword' }] },
      sword: { who: 'Hollis', text: "I do. And you'll not go empty-handed. The blade you've been sharpening all summer — the one I never let you swing? It's in the chest beside the forge. Go and get it.", choices: [{ t: 'My own sword? Truly?', next: null, act: () => setStage('q1_chest') }] },
    };
    if (s === 'q1_chest') return { start: { who: 'Hollis', text: 'The chest beside the forge. Go on, it won\'t bite.', choices: [{ t: 'Going.', next: null }] } };
    if (s === 'q1_return') return {
      start: { who: 'Hollis', text: "Sits well in the hand, doesn't it? It ought to. I forged it from the iron that was found with you.", choices: [{ t: 'Found with me?', next: 'found' }] },
      found: { who: 'Hollis', text: "Sixteen years back the miller fished a basket out of the mill-race. A babe, a lump of star-iron, and a cloak stitched with a lantern. I always meant to tell you. Never found the right morning.", choices: [{ t: 'Why tell me now?', next: 'why' }] },
      why: { who: 'Hollis', text: "Because the wolves have fire in their eyes, and the old folk are muttering about the cold coming early. Go help Bree. We'll talk more after.", choices: [{ t: "I'll go.", next: null, act: () => { G.state.p.hasSword = true; reward({ xp: 60 }); setStage('q2_talk'); } }] },
    };
    return {
      start: { who: 'Hollis', text: G.state.p.hasKindling ? "Ossic's got you playing with fire, eh? Mind the thatch." : "Need something? I've draughts on the shelf and steel on the anvil.", choices: [{ t: "Let's trade.", next: null, act: () => G.ui.openShop() }, { t: 'Tell me about the lantern cloak.', next: 'cloak' }, { t: 'Farewell.', next: null }] },
      cloak: { who: 'Hollis', text: "Deep blue wool, finer than anything in the vales. The lantern on it was stitched in thread that still glows faint when the fire's low. I keep it in my trunk. When you're ready, it's yours.", choices: [{ t: 'Thank you, Hollis.', next: null }] },
    };
  },
  bree() {
    const s = st();
    if (s === 'q2_talk') return {
      start: { who: 'Bree', text: "Wren! Thank the hearth. Look at that fence — snapped like kindling. Those weren't ordinary wolves. Their eyes glowed like coals in a grate.", choices: [{ t: "Hollis sent me. I'll hunt them.", next: 'hunt' }] },
      hunt: { who: 'Bree', text: "They den in the Thornwood, northeast along the old road. Thin the pack — five should send the rest running. And Wren… step to the side when they lunge. Roll, if you have to.", choices: [{ t: 'Right mouse to roll. Got it.', next: null, act: () => setStage('q2_hunt') }] },
    };
    if (s === 'q2_hunt') return { start: { who: 'Bree', text: 'The Thornwood is northeast. Follow the road past the old marker stones.', choices: [{ t: 'On my way.', next: null }] } };
    if (s === 'q2_return') return {
      start: { who: 'Bree', text: "You're back, and in one piece! The flock's been quiet since midday. Here — it's not much, but take it.", choices: [{ t: 'Thank you, Bree.', next: 'stranger' }] },
      stranger: { who: 'Bree', text: "Oh — and there's a stranger at the well. Old fellow with a lantern on a stick. He asked after you by name, Wren. Not 'the smith's foundling'. Your name.", choices: [{ t: "I'll go see him.", next: null, act: () => { reward({ xp: 120, gold: 30, potions: 2 }); setStage('q3_talk'); } }] },
    };
    return { start: { who: 'Bree', text: "The flock's settled, thanks to you. Even the old ram's stopped sulking.", choices: [{ t: 'Glad to hear it.', next: null }] } };
  },
  ossic() {
    const s = st();
    if (s === 'q3_talk') return {
      start: { who: 'Ossic', text: "So. You're the one the fire has been muttering about. Taller than I expected. Less singed.", choices: [{ t: 'Who are you?', next: 'who' }] },
      who: { who: 'Ossic', text: "Ossic. Some call me the Lantern-Bearer, which is a grand title for an old man who mostly carries a lantern. I mapped these vales before your village had a name.", choices: [{ t: 'Why were you asking for me?', next: 'stone' }] },
      stone: { who: 'Ossic', text: "Three nights ago the Hearthstone went dark. It sat in the Shrine of Vael for nine hundred years, and while it burned, something cold slept beneath the Gloamreach. Now the stone is gone — carried off.", choices: [{ t: 'What does that have to do with me?', next: 'spark' }] },
      spark: { who: 'Ossic', text: "You dream of fire and a voice. The wolves' eyes burn. And you were found wrapped in a Warden's cloak. There's a spark in you, child. Go to the Standing Stones west of here. Lay your hand on the Kindle Stone and see what answers.", choices: [{ t: "And if nothing answers?", next: 'nothing' }] },
      nothing: { who: 'Ossic', text: "Then I'm a foolish old man and you've had a pleasant walk. Go on.", choices: [{ t: "I'll go.", next: null, act: () => setStage('q3_stone') }] },
    };
    if (s === 'q3_stone' || s === 'q3_effigy') return { start: { who: 'Ossic', text: s === 'q3_stone' ? 'The Standing Stones lie west along the road. The tall one in the middle — you\'ll feel it before you see it.' : 'Kindling draws from you. Watch the blue bar; when it is empty, so are you. Burn those straw men.', choices: [{ t: 'Understood.', next: null }] } };
    if (s === 'q3_return') return {
      start: { who: 'Ossic', text: "I saw the light from here. Kindling — the Wardens' old craft. Fire called by will and breath. You'll get better at it. Most people do, eventually, and the ones who don't stop needing eyebrows.", choices: [{ t: 'What now?', next: 'raiders' }] },
      raiders: { who: 'Ossic', text: "Smoke on the east road. Raiders — but raiders never wander this deep into the vales unless someone's paying them. Go east to their camp. Find out who holds their purse strings.", choices: [{ t: "I'll find out.", next: null, act: () => { reward({ xp: 100, tonics: 2 }); setStage('q4_camp'); } }] },
    };
    if (s === 'q4_camp' || s === 'q4_chest') return { start: { who: 'Ossic', text: 'East, along the road. Mind the captain — that sort fights dirty.', choices: [{ t: 'Right.', next: null }] } };
    if (s === 'q4_return') return {
      start: { who: 'Ossic', text: "A sealed letter? Let me see… Ash-grey wax. The mark of the Ashen Choir. I'd hoped never to see that seal again.", choices: [{ t: 'What does it say?', next: 'read' }] },
      read: { who: 'Ossic', text: "\"To the Cantor Mordrith. The vale ward is broken. The Warden of Cinders keeps the shrine until the Choir arrives. Find the foundling with the lantern mark, and bring them north alive.\"", choices: [{ t: "…They're looking for me.", next: 'north' }] },
      north: { who: 'Ossic', text: "They are. Which means we must move first. North to the Shrine of Vael. Whatever stands guard there now, it isn't the keeper I knew. Be ready, Wren.", choices: [{ t: 'To the shrine.', next: null, act: () => { reward({ xp: 200, gold: 60 }); setStage('q5_travel'); } }] },
    };
    if (s === 'q5_travel' || s === 'q5_boss' || s === 'q5_pedestal') return { start: { who: 'Ossic', text: 'North, along the old pilgrim road. I will follow when my knees permit.', choices: [{ t: 'See you there.', next: null }] } };
    return { start: { who: 'Ossic', text: 'Rest while you can. The Gloamreach does not grow warmer for waiting.', choices: [{ t: 'Farewell.', next: null }] } };
  },
  tamm() {
    return {
      start: { who: 'Elder Tamm', text: 'Ah, young Wren. Come to hear an old woman ramble?', choices: [{ t: 'Tell me of the Wardens.', next: 'wardens' }, { t: 'What is the Ashen King?', next: 'king' }, { t: 'Another time.', next: null }] },
      wardens: { who: 'Elder Tamm', text: "Seven of them, long ago, when the world was colder. They carried a shard of the first fire down from the high places and set it in Vael's shrine. Where it burned, the vales stayed green. The Wardens are gone now. Mostly.", choices: [{ t: 'Mostly?', next: 'mostly' }] },
      mostly: { who: 'Elder Tamm', text: 'My grandmother swore one came through Millbrook once, carrying a lantern that never needed oil. Make of that what you will.', choices: [{ t: 'Thank you, Elder.', next: null }] },
      king: { who: 'Elder Tamm', text: "A tale to frighten children. A king who wanted the world quiet, and found the coldest kind of quiet there is. They say he sleeps beneath the Gloamreach, and dreams of snow.", choices: [{ t: 'Cheerful.', next: null }] },
    };
  },
  pell() {
    const tips = [
      "Did you know you can roll? Right mouse! Hollis says I'm too young to learn swords, so I practise rolling.",
      'Hit the same wolf three times quickly and the last swing hits extra hard. I saw it in a dream. Probably.',
      'If you\'re hurt, drink a draught. Press 1! Ossic\'s tonics are on 2, but they taste like burnt toast.',
      'Press M for the map, J for your journal. Everyone knows that.',
      'At night the windows glow. Mum says it\'s so the wolves know we\'re awake.',
    ];
    const t = tips[Math.floor(Math.random() * tips.length)];
    return { start: { who: 'Pell', text: t, choices: [{ t: 'Thanks, Pell.', next: null }] } };
  },
};

export const ENDING = [
  'The pedestal is cold. Where the Hearthstone sat for nine hundred years there is only a ring of frost, and the faint print of a hand that was not human.',
  'But as your fingers brush the socket, a last ember leaps from the stone into your palm. For a heartbeat you see it: a black fortress in the snow, a choir singing without breath, and something vast stirring beneath the ice.',
  'Behind you, the slow tap of a staff on stone. Ossic stands at the top of the steps, his lantern burning brighter than you have ever seen it.',
  '"So," he says. "It has chosen. Then we go north, Wren — to the Gloamreach, and whatever waits there."',
];
