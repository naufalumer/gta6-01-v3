// AZURA BAY — Neon Tide: people. Every human is built from rounded parts only —
// a capsule torso, a sphere head, cylinder arms and legs, real proportions, smooth
// shading, varied heights, skin tones, hair and outfits. No box torsos, no box heads,
// no box limbs. Pedestrians walk, cross, chat, flee; the player walks, aims, fires.
import * as THREE from 'three';
import { G, CFG, clamp, lerp, angLerp, dist2, mulberry, pick } from './config.js';
import { SFX } from './audio.js';

const SKINS = [0xe8b98a, 0xc98d5f, 0x8a5a35, 0xf0c8a0, 0x6e4426, 0xd8a06a];
const SHIRTS = [0xff2e88, 0x22d3ee, 0xffb020, 0x37e08b, 0xf2f5ff, 0x3aa7ff, 0xb78cff, 0xff6a3d, 0x2e7fc2, 0x8a5a35, 0xffd23f, 0xffffff, 0xff8ab5]; // hi-vis yellow + white added: peds read at dusk/night
const PANTS = [0x22262f, 0x3a4a6a, 0x5a4a3a, 0x2c3242, 0x6a3a4a];
const HAIRS = [0x14100c, 0x3a2410, 0x6a6a6a, 0xd8b13a, 0x8a2a2a];

export function makePersonMesh(opts = {}) {
  const rng = opts.rng || Math.random;
  const h = opts.height || (1.62 + rng() * 0.24);
  const skin = opts.skin || pick(rng, SKINS);
  const shirt = opts.shirt || pick(rng, SHIRTS);
  const pants = opts.pants || pick(rng, PANTS);
  const hair = opts.hair || pick(rng, HAIRS);
  const g = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.75 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.8 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.85 });
  // torso: rounded capsule, slightly tapered by scaling
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 6, 12), shirtMat);
  torso.position.y = h * 0.62; torso.scale.set(1.15, 1, 0.8); torso.castShadow = true; g.add(torso);
  // head: sphere + hair cap + nose hint
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), skinMat);
  head.position.y = h * 0.92; head.castShadow = true; g.add(head);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, 1.5), hairMat);
  hairCap.position.y = h * 0.95; g.add(hairCap);
  if (opts.longHair) {
    const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.28, 4, 8), hairMat);
    back.position.set(0, h * 0.82, -0.16); g.add(back);
  }
  // arms: cylinders pivoted at the shoulder
  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.3, h * 0.78, 0);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.56, 8), shirtMat);
    arm.position.y = -0.28; arm.castShadow = true; pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), skinMat);
    hand.position.y = -0.58; pivot.add(hand);
    g.add(pivot); arms.push(pivot);
  }
  // legs: cylinders pivoted at the hip
  const legs = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.12, h * 0.42, 0);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.075, 0.42, 8), pantsMat);
    leg.position.y = -0.21; leg.castShadow = true; pivot.add(leg);
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.4 }));
    shoe.scale.set(1, 0.6, 1.7); shoe.position.set(0, -0.42, 0.05); pivot.add(shoe);
    g.add(pivot); legs.push(pivot);
  }
  g.userData = { height: h, arms, legs, walkPhase: rng() * 6 };
  return g;
}

export function spawnPeds(n) {
  const rng = mulberry(G.seed + 31);
  for (let i = 0; i < n; i++) {
    const mesh = makePersonMesh({ rng, longHair: rng() < 0.4 });
    const gx = (Math.floor(rng() * 10) - 5) * 60 + (rng() - 0.5) * 34;
    const gz = (Math.floor(rng() * 10) - 5) * 60 + (rng() - 0.5) * 34;
    const ped = {
      mesh, x: gx, z: gz, heading: rng() * Math.PI * 2, speed: 1 + rng() * 1.4,
      state: 'walk', target: null, wait: rng() * 4, chat: null, flee: 0,
    };
    mesh.position.set(gx, 0, gz); mesh.rotation.y = ped.heading;
    G.scene.add(mesh); G.peds.push(ped);
    retargetPed(ped, rng);
  }
}
function retargetPed(ped, rng) {
  const r = rng || Math.random;
  const gx = Math.round(ped.x / 60) * 60, gz = Math.round(ped.z / 60) * 60;
  const dirs = [[60, 0], [-60, 0], [0, 60], [0, -60], [0, 0]];
  const d = dirs[Math.floor(r() * dirs.length)];
  ped.target = { x: clamp(gx + d[0] + (r() - 0.5) * 20, -280, 280), z: clamp(gz + d[1] + (r() - 0.5) * 20, -280, 300) };
}
export function updatePeds(dt) {
  const px = G.player ? G.player.x : 0, pz = G.player ? G.player.z : 0;
  const danger = G.wanted >= 3 || G.player.firing;
  for (const ped of G.peds) {
    const m = ped.mesh;
    if (ped.wait > 0) { ped.wait -= dt; }
    else {
      if (danger && dist2(ped.x, ped.z, px, pz) < 40) ped.flee = 2.5;
      if (ped.flee > 0) {
        ped.flee -= dt;
        const a = Math.atan2(ped.x - px, ped.z - pz);
        ped.heading = angLerp(ped.heading, a, dt * 5);
        ped.x += Math.sin(ped.heading) * 4.5 * dt; ped.z += Math.cos(ped.heading) * 4.5 * dt;
      } else {
        const dx = ped.target.x - ped.x, dz = ped.target.z - ped.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < 2) { retargetPed(ped); if (Math.random() < 0.3) ped.wait = 2 + Math.random() * 5; }
        else {
          ped.heading = angLerp(ped.heading, Math.atan2(dx, dz), dt * 3);
          ped.x += Math.sin(ped.heading) * ped.speed * dt;
          ped.z += Math.cos(ped.heading) * ped.speed * dt;
        }
      }
    }
    // walk cycle: arms and legs swing opposite
    const u = ped.mesh.userData;
    const moving = ped.wait <= 0;
    const swing = moving ? Math.sin(u.walkPhase) * 0.55 : 0;
    u.walkPhase += dt * (moving ? 7 : 0);
    u.arms[0].rotation.x = swing; u.arms[1].rotation.x = -swing;
    u.legs[0].rotation.x = -swing; u.legs[1].rotation.x = swing;
    m.position.set(ped.x, 0, ped.z);
    m.rotation.y = ped.heading;
  }
}
// --- player -------------------------------------------------------------------
export function createPlayer() {
  const mesh = makePersonMesh({ height: 1.8, skin: 0xe8b98a, shirt: 0x22262f, pants: 0x3a4a6a, hair: 0x14100c });
  // Rico's look: black tee, diamond studs, watch on the left wrist
  const stud = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.1 }));
  stud.position.set(0.19, 1.66, 0); mesh.add(stud);
  const watch = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 6, 12), new THREE.MeshStandardMaterial({ color: 0x1a2a4a, metalness: 0.8, roughness: 0.3 }));
  watch.rotation.x = Math.PI / 2; watch.position.set(-0.3, 0.62, 0); mesh.add(watch);
  const player = {
    mesh, x: 0, z: 30, heading: 0, vy: 0, grounded: true,
    jetpack: false, jetpackFuel: 100, firing: false, fireTimer: 0, reloadTimer: 0,
  };
  mesh.position.set(0, 0, 30);
  G.scene.add(mesh);
  G.player = player;
  return player;
}
function collidePlayer(nx, nz) {
  for (const c of G.colliders) {
    const cx = clamp(nx, c.x0, c.x1), cz = clamp(nz, c.z0, c.z1);
    const dx = nx - cx, dz = nz - cz, d2 = dx * dx + dz * dz;
    if (d2 < 0.64) {
      const d = Math.sqrt(d2) || 0.001;
      return { x: cx + (dx / d) * 0.8, z: cz + (dz / d) * 0.8 };
    }
  }
  return null;
}
export function updatePlayer(dt) {
  const p = G.player, k = G.keys;
  if (G.vehicle || G.heli) return;
  let ix = 0, iz = 0;
  if (k['KeyW'] || k['ArrowUp']) iz -= 1;
  if (k['KeyS'] || k['ArrowDown']) iz += 1;
  if (k['KeyA'] || k['ArrowLeft']) ix -= 1;
  if (k['KeyD'] || k['ArrowRight']) ix += 1;
  ix += G.touch.x; iz += G.touch.y;
  const mag = Math.hypot(ix, iz) || 1;
  ix /= mag; iz /= mag;
  const running = k['ShiftLeft'] || k['ShiftRight'];
  const speed = (running ? CFG.runSpeed : CFG.walkSpeed) * (ix || iz ? 1 : 0);
  // camera-relative movement
  const cy = G.camYaw;
  const wx = (ix * Math.cos(cy) - iz * Math.sin(cy)) * speed * dt;
  const wz = (ix * Math.sin(cy) + iz * Math.cos(cy)) * speed * dt;
  let nx = clamp(p.x + wx, -295, 300), nz = clamp(p.z + wz, -295, 325); // z to 325: the pier end
  const hit = collidePlayer(nx, nz);
  if (hit) { nx = hit.x; nz = hit.z; }
  p.x = nx; p.z = nz;
  if (ix || iz) p.heading = angLerp(p.heading, Math.atan2(wx, wz), dt * 10);
  // jump + gravity (the jetpack also lifts off from the ground)
  if ((k['Space'] || G.touch.jump) && p.grounded && !p.jetpack) { p.vy = 8; p.grounded = false; }
  if (p.jetpack && (k['Space'] || G.touch.jump) && p.jetpackFuel > 0) p.grounded = false;
  if (!p.grounded) {
    p.vy -= 22 * dt;
    p.mesh.position.y += p.vy * dt;
    if (p.mesh.position.y <= 0) { p.mesh.position.y = 0; p.vy = 0; p.grounded = true; }
  }
  // walk cycle
  const u = p.mesh.userData;
  const moving = !!(ix || iz);
  const swing = moving ? Math.sin(u.walkPhase) * 0.6 : 0;
  u.walkPhase += dt * (moving ? (running ? 11 : 8) : 0);
  u.arms[0].rotation.x = swing; u.arms[1].rotation.x = -swing;
  u.legs[0].rotation.x = -swing; u.legs[1].rotation.x = swing;
  p.mesh.position.x = p.x; p.mesh.position.z = p.z;
  p.mesh.rotation.y = p.heading;
  // firing
  p.firing = G.firing;
  if (p.reloadTimer > 0) p.reloadTimer -= dt;
  if (p.firing && p.reloadTimer <= 0) {
    p.fireTimer -= dt;
    if (p.fireTimer <= 0) fireWeapon();
  }
}
export function fireWeapon() {
  const p = G.player;
  const w = G.weapons[G.weaponIdx];
  const wd = [ { dmg: 34, rate: 0.28, mag: 12, range: 55 }, { dmg: 18, rate: 0.09, mag: 32, range: 48 }, { dmg: 90, rate: 0.85, mag: 6, range: 26 } ][G.weaponIdx];
  if (w.mag <= 0) { reloadWeapon(); return; }
  w.mag -= 1;
  p.fireTimer = wd.rate;
  SFX.gunshot();
  G.heat = Math.min(100, G.heat + 3);
  // raycast against peds and cops in the aim cone
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  let best = null, bd = wd.range;
  const targets = [];
  for (const ped of G.peds) targets.push({ x: ped.x, z: ped.z, obj: ped, kind: 'ped' });
  for (const cop of G.cops) targets.push({ x: cop.mesh.position.x, z: cop.mesh.position.z, obj: cop, kind: 'cop' });
  for (const t of targets) {
    const dx = t.x - p.x, dz = t.z - p.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d > wd.range) continue;
    const dot = (dx * fx + dz * fz) / (d || 1);
    if (dot > 0.93 && d < bd) { bd = d; best = t; }
  }
  if (best) {
    if (best.kind === 'ped') {
      best.obj.flee = 5;
      G.stats.knockouts++;
      G.heat = Math.min(100, G.heat + 15);
    } else {
      best.obj.hp -= wd.dmg;
      if (best.obj.hp <= 0) { best.obj.down = true; G.stats.knockouts++; G.heat = Math.min(100, G.heat + 20); }
    }
  }
}
export function reloadWeapon() {
  const p = G.player;
  const w = G.weapons[G.weaponIdx];
  const def = [12, 32, 6][G.weaponIdx];
  if (w.reserve <= 0 || w.mag === def || p.reloadTimer > 0) return;
  p.reloadTimer = 1.1;
  SFX.reload();
  const need = def - w.mag, take = Math.min(need, w.reserve);
  setTimeout(() => { w.mag += take; w.reserve -= take; }, 1100);
}
