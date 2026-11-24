// AZURA BAY — Neon Tide: side activities. Real fishing at Pier 9 (cast, wait, bite,
// reel with a moving catch bar), playable basketball at Seaglass Court (charged
// shots, 60-second challenge), a slot machine at the Neon Casino, a garage that
// sells upgrades and weapons with prices, a gun shop, and the localStorage save.
import { G, CFG, clamp, lerp, dist2 } from './config.js';
import { SFX } from './audio.js';
import { makeHeliMesh } from './vehicles.js';

// --- fishing ------------------------------------------------------------------
export const fish = { state: 'idle', castT: 0, biteT: 0, reel: 0, reelTarget: 0, fishName: '', caught: 0 };
const FISH = [['Bay Snapper', 40], ['Neon Eel', 90], ['Harbor King', 220], ['Rusty Boot', 5], ['Golden Koi', 400]];
export function updateFishing(dt) {
  const p = G.player;
  const near = dist2(p.x, p.z, 0, 318) < 14 && !G.vehicle;
  if (fish.state === 'idle' && near && G.pressed['KeyE']) {
    fish.state = 'waiting'; fish.castT = 0; fish.biteT = 2 + Math.random() * 5;
    G.dialog = { name: 'FISHING', text: 'Line cast... wait for the tug.', t: 3 };
    SFX.click();
  } else if (fish.state === 'waiting') {
    fish.castT += dt;
    if (fish.castT > fish.biteT) { fish.state = 'bite'; fish.reel = 0.3; G.dialog = { name: 'FISHING', text: 'A BITE! Hold E and keep the bar in the green!', t: 4 }; SFX.mission(); }
  } else if (fish.state === 'bite') {
    fish.reelTarget = 0.3 + Math.random() * 0.7;
    if (G.keys['KeyE']) fish.reel = clamp(fish.reel + dt * 0.5, 0, 1);
    else fish.reel = clamp(fish.reel - dt * 0.35, 0, 1);
    if (Math.abs(fish.reel - fish.reelTarget) < 0.12) fish.reel = clamp(fish.reel + dt * 0.25, 0, 1);
    if (fish.reel >= 0.98) {
      const [name, val] = FISH[Math.floor(Math.random() * FISH.length)];
      fish.fishName = name; fish.caught++;
      G.cash += val;
      G.dialog = { name: 'FISHING', text: `Caught a ${name}! Sold for $${val}.`, t: 4 };
      SFX.mission(); fish.state = 'idle';
    } else if (fish.reel <= 0.02 && fish.castT > 6) {
      G.dialog = { name: 'FISHING', text: 'It got away...', t: 3 };
      fish.state = 'idle';
    }
    fish.castT += dt;
  }
  return fish.state !== 'idle';
}
// --- basketball ---------------------------------------------------------------
export const ball = { state: 'idle', score: 0, timer: 0, charge: 0, made: 0, tries: 0 };
export function updateBasketball(dt) {
  const p = G.player;
  const near = dist2(p.x, p.z, -60, 238) < 12 && !G.vehicle;
  if (ball.state === 'idle' && near && G.pressed['KeyE']) {
    ball.state = 'playing'; ball.score = 0; ball.timer = 60; ball.made = 0; ball.tries = 0;
    G.dialog = { name: 'SEAGLASS COURT', text: '60-second challenge! Hold SPACE to charge, release to shoot.', t: 4 };
    SFX.click();
  } else if (ball.state === 'playing') {
    ball.timer -= dt;
    if (G.keys['Space']) ball.charge = clamp(ball.charge + dt * 1.4, 0, 1);
    else if (ball.charge > 0) {
      ball.tries++;
      const d = dist2(p.x, p.z, -60, 247);
      const need = clamp(0.35 + d / 60, 0.3, 0.95);
      const hit = Math.abs(ball.charge - need) < 0.18;
      if (hit) { ball.made++; ball.score += 2; G.cash += 20; SFX.mission(); G.dialog = { name: 'SEAGLASS COURT', text: `Swish! +$20. Score ${ball.score}.`, t: 2 }; }
      else { SFX.click(); }
      ball.charge = 0;
    }
    if (ball.timer <= 0) {
      ball.state = 'idle';
      G.dialog = { name: 'SEAGLASS COURT', text: `Time! You made ${ball.made} of ${ball.tries} shots.`, t: 4 };
      SFX.mission();
    }
  }
  return ball.state === 'playing';
}
// --- casino -------------------------------------------------------------------
export const slots = { state: 'idle', reels: ['7', '7', '7'], spinning: 0, result: '' };
export function updateCasino(dt) {
  const p = G.player;
  const near = dist2(p.x, p.z, 30, -90) < 12 && !G.vehicle;
  if (near && G.pressed['KeyE'] && G.cash >= 50 && slots.state === 'idle') {
    G.cash -= 50;
    slots.state = 'spin'; slots.spinning = 1.4;
    SFX.click();
  } else if (slots.state === 'spin') {
    slots.spinning -= dt;
    if (Math.random() < dt * 20) slots.reels = slots.reels.map(() => ['7', 'BAR', '★', '◆', '◆'][Math.floor(Math.random() * 5)]);
    if (slots.spinning <= 0) {
      slots.state = 'idle';
      const [a, b, c] = slots.reels;
      if (a === b && b === c) { G.cash += 500; slots.result = 'JACKPOT! +$500'; SFX.mission(); }
      else if (a === b || b === c || a === c) { G.cash += 120; slots.result = 'Two match! +$120'; SFX.mission(); }
      else { slots.result = 'No luck — spin again ($50)'; SFX.click(); }
      G.dialog = { name: 'NEON CASINO', text: `${a} ${b} ${c} — ${slots.result}`, t: 4 };
    }
  }
  return slots.state === 'spin';
}
// --- garage / gun shop ---------------------------------------------------------
export const SHOP = {
  garage: [
    { id: 'tune1', name: 'STAGE 1 TUNE +8%', price: 800, desc: 'Engine tune, +8% top speed on any car you drive.' },
    { id: 'tune2', name: 'STAGE 2 TUNE +14%', price: 2400, desc: 'Race tune, +14% top speed. Needs Stage 1.' },
    { id: 'nitro', name: 'NITRO KIT', price: 1500, desc: 'Shift for a nitro boost. Refills over time.' },
    { id: 'respray', name: 'RESPRAY $400', price: 400, desc: 'Fresh paint for the car you are driving.' },
    { id: 'repair', name: 'FULL REPAIR $250', price: 250, desc: 'Restore your current car to 100% condition.' },
  ],
  gunshop: [
    { id: 'smg', name: 'SMG — $900', price: 900, desc: 'Fast fire, 32-round mag. Ammo included.' },
    { id: 'shotgun', name: 'SHOTGUN — $1,200', price: 1200, desc: 'Close range, huge damage, 6 shells.' },
    { id: 'ammo', name: 'AMMO BOX — $150', price: 150, desc: 'Refills every weapon you own.' },
    { id: 'armor', name: 'BODY ARMOR — $300', price: 300, desc: '+50 armor. Absorbs damage first.' },
  ],
};
export function shopNear() {
  const p = G.player;
  if (dist2(p.x, p.z, 150, 90) < 12) return 'garage';
  if (dist2(p.x, p.z, -90, 30) < 12) return 'gunshop';
  return null;
}
export function buyItem(shop, idx) {
  const item = SHOP[shop][idx];
  if (!item || G.cash < item.price) return false;
  if (item.id === 'tune2' && !G.upgrades.tune1) return false;
  if ((item.id === 'tune1' && G.upgrades.tune1) || (item.id === 'nitro' && G.upgrades.nitro)) return false;
  G.cash -= item.price;
  if (item.id === 'tune1') G.upgrades.tune1 = true;
  else if (item.id === 'tune2') G.upgrades.tune2 = true;
  else if (item.id === 'nitro') G.upgrades.nitro = true;
  else if (item.id === 'repair' && G.vehicle) G.vehicle.condition = 100;
  else if (item.id === 'respray' && G.vehicle) { /* paint stays, condition polish */ G.vehicle.condition = Math.min(100, G.vehicle.condition + 10); }
  else if (item.id === 'smg') { G.weapons[1].reserve += 128; G.weaponIdx = 1; }
  else if (item.id === 'shotgun') { G.weapons[2].reserve += 24; G.weaponIdx = 2; }
  else if (item.id === 'ammo') { G.weapons.forEach(w => w.reserve += 60); }
  else if (item.id === 'armor') G.armor = Math.min(100, G.armor + 50);
  SFX.mission();
  return true;
}
// --- jetpack / heli pickups -----------------------------------------------------
export function tryBoardHeli() {
  const p = G.player;
  if (G.heli || G.vehicle) return false;
  for (const hp of [{ x: 240, z: 240 }, { x: -240, z: -240 }]) {
    if (dist2(p.x, p.z, hp.x, hp.z) < 8) {
      G.heli = { mesh: null, heading: 0, noLandUntil: Date.now() + 1500 }; // landing locked briefly: the same F press must not board AND land
      G.heli.mesh = makeHeliMesh(false);
      G.heli.mesh.position.set(hp.x, 2, hp.z);
      G.scene.add(G.heli.mesh);
      p.mesh.visible = false;
      G.dialog = { name: 'HELICOPTER', text: 'Airborne! SPACE climbs, C descends, WASD flies, F to land.', t: 4 };
      SFX.mission();
      return true;
    }
  }
  return false;
}
export function updatePickups(dt) {
  const p = G.player;
  // jetpack on the plaza roof edge
  if (!p.jetpack && dist2(p.x, p.z, 12, 12) < 3) {
    p.jetpack = true; p.jetpackFuel = 100;
    G.dialog = { name: 'JETPACK', text: 'Jetpack acquired! Hold SPACE to fly. Fuel refills on the ground.', t: 4 };
    SFX.mission();
  }
  // heli at helipads (also boarded synchronously from the F key handler)
  if (!G.heli && !G.vehicle && G.pressed['KeyF']) tryBoardHeli();
  if (G.heli && G.pressed['KeyF'] && G.heli.mesh.position.y < 4 && Date.now() > (G.heli.noLandUntil || 0)) {
    const hp = G.heli.mesh.position;
    G.scene.remove(G.heli.mesh); G.heli = null;
    p.mesh.visible = true;
    p.x = hp.x; p.z = hp.z;
    p.mesh.position.set(p.x, 0, p.z);
  }
}
// --- save / load ---------------------------------------------------------------
const SAVE_KEY = 'azura-bay-save-v1';
export function saveGame() {
  const p = G.player;
  const data = {
    cash: G.cash, rep: G.rep, respect: G.respect, health: G.health, armor: G.armor,
    missionIdx: G.missionIdx, missionStep: G.missionStep,
    upgrades: G.upgrades, weapons: G.weapons, weaponIdx: G.weaponIdx,
    stats: G.stats, day: G.day, time: G.time, x: p.x, z: p.z, jetpack: p.jetpack,
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
}
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    G.cash = d.cash; G.rep = d.rep; G.respect = d.respect; G.health = d.health; G.armor = d.armor;
    G.missionIdx = d.missionIdx; G.missionStep = d.missionStep;
    Object.assign(G.upgrades, d.upgrades); G.weapons = d.weapons; G.weaponIdx = d.weaponIdx;
    Object.assign(G.stats, d.stats); G.day = d.day; G.time = d.time;
    G.player.x = d.x; G.player.z = d.z;
    G.player.mesh.position.set(d.x, 0, d.z);
    G.player.jetpack = !!d.jetpack;
    return true;
  } catch (e) { return false; }
}
