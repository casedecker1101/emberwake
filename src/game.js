// Shared game context
export const G = {
  scene: null, camera: null, renderer: null, composer: null,
  refs: {},
  enemies: [], npcs: [], interactables: [], projectiles: [], effigies: [], sheep: [],
  time: 0, shake: 0,
  mode: 'title', // title | play | dialogue | panel | dead | ending
  ui: null, fx: null, audio: null, env: null, player: null,
  state: null,
  cam: { yaw: 0, pitch: 0.32, dist: 6.5, tx: 0, ty: 0, tz: 0 },
  quality: 'high',
};
