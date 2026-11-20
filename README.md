# Emberwake — Book One: The Hearthstone Thief

An original third-person action RPG in three.js. It is a coming-of-age epic fantasy: an orphaned smith's apprentice, a mysterious lantern-bearer, a stolen sacred fire, and a cold that should have stayed asleep.

## Run it

It is a static site with no build step. Serve the folder and open it in a desktop browser with a GPU:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Controls

| Key | Action |
|---|---|
| WASD / Mouse | Move / look (click to capture the mouse) |
| Shift / Space | Sprint / jump |
| LMB (or F) | Sword strike; click during a swing to chain a 3-hit combo |
| RMB (or C) | Dodge-roll (brief invulnerability) |
| Q | Kindle bolt (area fireball, costs kindling) |
| E | Talk / interact |
| 1 / 2 | Healing Draught / Ember Tonic |
| Tab · J · M · Esc | Character · Journal · Map · Pause |

## Act I quest line
1. **The Smith's Apprentice**: get your star-iron sword from Hollis's forge.
2. **Wolves at the Fold**: hunt the coal-eyed wolves of the Thornwood for Bree.
3. **The Lantern-Bearer**: meet Ossic, awaken Kindling at the Standing Stones, and burn the effigies.
4. **Smoke on the East Road**: storm the raider camp, defeat Captain Varrek, and find the sealed letter.
5. **The Cold Shrine**: defeat the Cinder Warden, a two-phase boss with telegraphed slams, fire volleys and summoned wraiths.

## Systems
- A 600×600 m procedural world with roads, a lake, a forest, mountains and a wind-animated grass shader.
- A real-time day/night cycle with a custom sky shader, stars, glowing windows and bloom.
- Enemy AI with aggro, leash, telegraphed attacks and knockback; a boss with phases.
- Levels, XP, gold, a shop, potions, armor and upgrades.
- Branching dialogue, a quest tracker, a world beacon, a minimap and a world map.
- Autosave to localStorage.
- Procedural WebAudio for sound effects, wind and an adaptive generative score.

## Code layout
`src/world.js` covers terrain, structures, sky and collision. `src/entities.js` covers the player, enemies, NPCs and projectiles. `src/rig.js` loads the rigged characters and handles animation blending. `src/models.js` holds the procedural wolves, sheep and props. `src/story.js` holds the quests and dialogue. `src/ui.js` is the HUD and menus. `src/fx.js` handles particles. `src/audio.js` is sound. `src/main.js` contains the game loop.

## Credits
- Character models, weapons and animations: **KayKit Adventurers & Skeletons packs** by Kay Lousberg (www.kaylousberg.com), CC0. They have been optimised for this game: all characters share one 41-clip animation library, and the meshes are quantized. The license is at `assets/characters/KAYKIT_LICENSE.txt`.
- The bundled three.js under `vendor/` is MIT-licensed.

## Hosted build
The claude.ai artifact host doesn't serve `.glb` files. `tools/build-web.sh` generates `web/`, which contains each model as an embedded-glTF `.json` file plus a `rig.js` that loads them. Publish those files in place of their originals. Running the game locally needs none of this.
