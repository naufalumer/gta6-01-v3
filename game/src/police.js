// AZURA BAY — Neon Tide: law enforcement. A five-star wanted ladder that escalates
// from foot cops to patrol cars, roadblocks, a helicopter and PIT manoeuvres; heat
// cools when the player stays out of sight, and losing the tail drops the stars.
import * as THREE from 'three';
import { G, CFG, clamp, lerp, angLerp, dist2, mulberry, pick } from './config.js';
import { makeCarMesh, makeHeliMesh } from './vehicles.js';
import { makePersonMesh } from './people.js';
import { SFX } from './audio.js';

const STAR_RULES = [
  null,
  { cops: 2, cars: 0, desc: 'Foot patrol' },
  { cops: 3, cars: 2, desc: 'Patrol cars' },
  { cops: 4, cars: 3, desc: 'Roadblocks' },
  { cops: 4, cars: 4, desc: 'Helicopter + PIT' },
  { cops: 6, cars: 5, desc: 'Maximum response' },
];
let sirenTimer = 0, copTimer = 0, carTimer = 0;

function wantedFromHeat() {
  if (G.heat < 12) return 0;
  if (G.heat < 30) return 1;
  if (G.heat < 50) return 2;
  if (G.heat < 70) return 3;
  if (G.heat < 90) return 4;
  return 5;
}
function spawnCop(x, z) {
  const mesh = makePersonMesh({ height: 1.82, skin: 0xc98d5f, shirt: 0x1c2733, pants: 0x1c2733, hair: 0x14100c });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.09, 10), new THREE.MeshStandardMaterial({ color: 0x10151f, roughness: 0.5 }));
  cap.position.y = 1.74; mesh.add(cap);
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.035, 8), new THREE.MeshStandardMaterial({ color: 0xffb020, metalness: 0.9, roughness: 0.2 }));
  badge.position.set(0.1, 1.24, 0.27); mesh.add(badge);
  const cop = { mesh, x, z, heading: 0, hp: 100, down: false, speed: 3.4 };
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  G.cops.push(cop);
  return cop;
}
function spawnPatrolCar(x, z) {
  const mesh = makeCarMesh('police', 0xf2f4f6);
  const car = { mesh, kind: 'police', speed: 0, heading: 0, isTraffic: false, parked: false, police: true, condition: 100, top: 44, ramTimer: 0 };
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  G.cars.push(car);
  G.patrolCars.push(car);
  return car;
}
function spawnPoliceHeli() {
  if (G.policeHeli) return;
  const mesh = makeHeliMesh(true);
  mesh.position.set(G.player.x + 60, 45, G.player.z + 60);
  G.scene.add(mesh);
  G.policeHeli = { mesh, heading: 0, searchT: 0 };
}
export function spawnPatrolAt(x, z) { return spawnPatrolCar(x, z); }
export function spawnHeliAt(x, z) { spawnPoliceHeli(); if (G.policeHeli) G.policeHeli.mesh.position.set(x, 45, z); return G.policeHeli; }
export function updatePolice(dt) {
  G.wanted = wantedFromHeat();
  const p = G.player;
  // heat cools when the player is out of sight and slow
  const anyNear = G.cops.some(c => !c.down && dist2(c.x, c.z, p.x, p.z) < 45) ||
    G.patrolCars.some(c => dist2(c.mesh.position.x, c.mesh.position.z, p.x, p.z) < 60);
  G.inSight = anyNear;
  if (!anyNear && G.heat > 0) {
    G.coolTimer += dt;
    if (G.coolTimer > 2) G.heat = Math.max(0, G.heat - dt * (G.wanted === 0 ? 8 : 2.5));
  } else G.coolTimer = 0;
  const rules = STAR_RULES[G.wanted] || { cops: 0, cars: 0 };
  // spawn to strength on a steady timer (deterministic escalation, not a dice roll)
  copTimer -= dt; carTimer -= dt;
  const liveCops = G.cops.filter(c => !c.down).length;
  if (liveCops < rules.cops && copTimer <= 0) {
    const a = Math.random() * Math.PI * 2;
    spawnCop(p.x + Math.sin(a) * 30, p.z + Math.cos(a) * 30);
    copTimer = 1.2;
  }
  if (G.patrolCars.length < rules.cars && carTimer <= 0) {
    const a = Math.random() * Math.PI * 2;
    spawnPatrolCar(p.x + Math.sin(a) * 40, p.z + Math.cos(a) * 40);
    carTimer = 2;
  }
  if (G.wanted >= 4 && !G.policeHeli) spawnPoliceHeli();
  if (G.wanted < 4 && G.policeHeli) { G.scene.remove(G.policeHeli.mesh); G.policeHeli = null; }
  // foot cops chase
  for (const cop of G.cops) {
    if (cop.down) continue;
    const d = dist2(cop.x, cop.z, p.x, p.z);
    if (d > 220) { G.scene.remove(cop.mesh); cop.down = true; continue; }
    if (d < 60) {
      cop.heading = angLerp(cop.heading, Math.atan2(p.x - cop.x, p.z - cop.z), dt * 4);
      const sp = G.vehicle ? cop.speed * 1.2 : cop.speed;
      cop.x += Math.sin(cop.heading) * sp * dt;
      cop.z += Math.cos(cop.heading) * sp * dt;
      if (d < 1.6 && !G.vehicle) {
        G.health = Math.max(0, G.health - dt * 12);
        G.heat = Math.min(100, G.heat + dt * 4);
        if (Math.random() < dt * 2) SFX.crash(0.3);
      }
    }
    const u = cop.mesh.userData;
    const swing = Math.sin(u.walkPhase) * 0.5;
    u.walkPhase += dt * 8;
    u.arms[0].rotation.x = swing; u.arms[1].rotation.x = -swing;
    u.legs[0].rotation.x = -swing; u.legs[1].rotation.x = swing;
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.heading;
  }
  G.cops = G.cops.filter(c => !(c.down && dist2(c.x, c.z, p.x, p.z) > 220));
  // patrol cars: pursue, PIT, roadblock at 3+
  for (const car of G.patrolCars) {
    const m = car.mesh;
    const dx = p.x - m.position.x, dz = p.z - m.position.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 260) { G.scene.remove(m); G.cars.splice(G.cars.indexOf(car), 1); G.patrolCars.splice(G.patrolCars.indexOf(car), 1); continue; }
    const wantH = Math.atan2(dx, dz);
    car.heading = angLerp(car.heading, wantH, dt * 2.6);
    let target = 26;
    if (G.wanted >= 3 && d < 45) target = 30; // roadblock approach speed
    if (G.vehicle && d < 12) { // PIT: swing alongside and push
      car.ramTimer += dt;
      if (car.ramTimer > 1.2) {
        car.ramTimer = 0;
        G.vehicle.speed *= 0.55;
        G.vehicle.mesh.rotation.z = 0.12;
        SFX.crash(0.7);
        G.vehicle.condition = Math.max(0, G.vehicle.condition - 6);
        G.heat = Math.min(100, G.heat + 5);
      }
    }
    car.speed = lerp(car.speed, target, dt * 1.4);
    m.position.x += Math.sin(car.heading) * car.speed * dt;
    m.position.z += Math.cos(car.heading) * car.speed * dt;
    m.position.x = clamp(m.position.x, -295, 295); m.position.z = clamp(m.position.z, -295, 305);
    m.rotation.y = car.heading;
    // light bar flash
    const lb = m.userData.lightBar;
    if (lb) {
      const on = Math.floor(G.time * 6 + (car === G.patrolCars[0] ? 0 : 1)) % 2 === 0;
      lb.red.emissiveIntensity = on ? 3 : 0.2;
      lb.blue.emissiveIntensity = on ? 0.2 : 3;
    }
    if (d < 9 && G.vehicle) {
      G.vehicle.speed *= (1 - dt * 0.4);
      if (Math.random() < dt * 0.5) SFX.crash(0.4);
    }
  }
  // police heli: circles above, keeps the spotlight on the player
  if (G.policeHeli) {
    const h = G.policeHeli;
    h.searchT += dt;
    const a = h.searchT * 0.25;
    h.mesh.position.x = p.x + Math.sin(a) * 38;
    h.mesh.position.z = p.z + Math.cos(a) * 38;
    h.mesh.position.y = 42 + Math.sin(h.searchT * 0.8) * 3;
    h.mesh.userData.rotor.rotation.y += dt * 26;
    h.mesh.rotation.y = Math.atan2(p.x - h.mesh.position.x, p.z - h.mesh.position.z);
    G.heat = Math.min(100, G.heat + dt * 1.2);
    if (Math.random() < dt * 3) SFX.siren(0.25);
  }
  // sirens
  sirenTimer -= dt;
  if (G.wanted > 0 && sirenTimer <= 0 && G.patrolCars.length > 0) {
    SFX.siren(0.5);
    sirenTimer = 3.2;
  }
  // busted / wasted
  if (G.health <= 0) busted('wasted');
  else if (G.wanted > 0 && !G.vehicle && G.cops.some(c => !c.down && dist2(c.x, c.z, p.x, p.z) < 1.4)) busted('busted');
}
function busted(kind) {
  if (G.gameOver) return;
  G.gameOver = kind;
  G.heat = 0; G.wanted = 0;
  SFX.siren(1);
}
export function respawnPlayer() {
  const p = G.player;
  p.x = 0; p.z = 30; p.mesh.position.set(0, 0, 30); p.mesh.position.y = 0;
  G.health = 100; G.armor = 0; G.gameOver = null;
  G.cash = Math.max(0, G.cash - 250);
  for (const cop of G.cops) G.scene.remove(cop.mesh);
  G.cops = [];
  for (const car of G.patrolCars) { G.scene.remove(car.mesh); G.cars.splice(G.cars.indexOf(car), 1); }
  G.patrolCars = [];
  if (G.policeHeli) { G.scene.remove(G.policeHeli.mesh); G.policeHeli = null; }
  if (G.vehicle) { G.vehicle = null; p.mesh.visible = true; }
}
