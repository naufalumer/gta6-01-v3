// AZURA BAY — Neon Tide: story and races. Six chained missions (Rico Vane vs the Harbor
// Syndicate) run as a step machine: go, meet, steal, hold, escape, race, ram. A light
// beacon marks the live objective. Street races run 3 laps through 8 gates against
// three AI opponents, with best-lap tracking on the map stats.
import * as THREE from 'three';
import { G, CFG, MISSIONS, clamp, lerp, angLerp, dist2, mulberry, pick } from './config.js';
import { makeCarMesh } from './vehicles.js';
import { SFX } from './audio.js';

let beacon = null, beaconRing = null;
const RACE_GATES = [
  { x: 0, z: -30 }, { x: 90, z: -30 }, { x: 150, z: -30 }, { x: 150, z: 90 },
  { x: 90, z: 90 }, { x: 30, z: 90 }, { x: -30, z: 90 }, { x: -30, z: -30 },
];
let gateMeshes = [], raceState = null;

const MISSION_STEPS = [
  [ // 1 NEON TIDE — meet Lena, then the drop at Sundial Square
    { type: 'goto', x: 0, z: 0, r: 6, text: 'Meet Lena at Sundial Plaza' },
    { type: 'goto', x: 90, z: -90, r: 8, text: 'Reach the drop point in Sundial Square' },
    { type: 'hold', x: 90, z: -90, r: 8, t: 4, text: 'Wait for the drop' },
  ],
  [ // 2 SALT AND SMOKE — street race, 3 laps, 8 gates
    { type: 'race', laps: 3, text: 'Win the Neon Row street race — 3 laps, 8 gates' },
  ],
  [ // 3 THE LONG WAY HOME — steal a car, deliver to the garage
    { type: 'enterCar', text: 'Steal any parked car' },
    { type: 'deliver', x: 150, z: 90, r: 10, text: 'Deliver the car to Tideworks Customs' },
  ],
  [ // 4 THE CANNERY JOB — grab the ledger, escape 3-star heat
    { type: 'goto', x: -210, z: -150, r: 8, text: 'Reach the Old Cannery warehouse' },
    { type: 'hold', x: -210, z: -150, r: 8, t: 6, text: 'Grab the ledger' },
    { type: 'escape', text: 'Escape the 3-star heat — lose the tail' },
  ],
  [ // 5 HOUSE ALWAYS WINS — casino hold, then escape
    { type: 'goto', x: 30, z: -90, r: 8, text: 'Enter the Neon Casino' },
    { type: 'hold', x: 30, z: -90, r: 9, t: 10, text: 'Crack the vault — hold position' },
    { type: 'escape', text: 'Escape the casino heat' },
  ],
  [ // 6 NEON TIDE — ram Kane's convoy, finish at the plaza
    { type: 'chase', hits: 4, text: 'Ram Victor Kane\u2019s convoy car 4 times' },
    { type: 'goto', x: 0, z: 0, r: 8, text: 'Return to Sundial Plaza — finish the job' },
  ],
];
let convoyCar = null;

export function initMissions() {
  const geo = new THREE.CylinderGeometry(2.2, 2.6, 26, 12, 1, true);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
  beacon = new THREE.Mesh(geo, mat); beacon.visible = false; G.scene.add(beacon);
  const ringGeo = new THREE.RingGeometry(2.4, 3.2, 24);
  beaconRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  beaconRing.rotation.x = -Math.PI / 2; beaconRing.visible = false; G.scene.add(beaconRing);
  const gateGeo = new THREE.TorusGeometry(4.5, 0.28, 8, 22);
  for (const gt of RACE_GATES) {
    const m = new THREE.Mesh(gateGeo, new THREE.MeshBasicMaterial({ color: 0xffb020 }));
    m.position.set(gt.x, 3.2, gt.z);
    m.rotation.y = Math.PI / 2;
    m.visible = false;
    G.scene.add(m); gateMeshes.push(m);
  }
}
function setBeacon(x, z, on) {
  beacon.visible = on; beaconRing.visible = on;
  if (on) { beacon.position.set(x, 13, z); beaconRing.position.set(x, 0.15, z); }
}
export function currentObjective() {
  if (G.missionIdx >= MISSIONS.length) return null;
  const steps = MISSION_STEPS[G.missionIdx];
  const step = steps[G.missionStep];
  return step ? { mission: MISSIONS[G.missionIdx], step } : null;
}
export function startMission(idx) {
  G.missionIdx = idx; G.missionStep = 0; G.missionHold = 0;
  const obj = currentObjective();
  if (obj && obj.step.type === 'race') startRace();
  if (obj && obj.step.type === 'chase') spawnConvoy();
  SFX.mission();
}
function spawnConvoy() {
  if (convoyCar) return;
  const mesh = makeCarMesh('sport', 0x1c2733);
  const car = { mesh, kind: 'sport', speed: 0, heading: 0, isTraffic: false, parked: false, convoy: true, condition: 100, top: 40, hits: 0 };
  mesh.position.set(60, 0, -150); G.scene.add(mesh); G.cars.push(car);
  convoyCar = car;
}
function startRace() {
  const rng = mulberry(G.seed + 77);
  raceState = { lap: 1, gate: 0, lapStart: performance.now(), best: G.stats.bestLap, opponents: [] };
  for (const gt of RACE_GATES) { /* gates visible below */ }
  gateMeshes.forEach((m, i) => { m.visible = true; m.material.color.setHex(i === 0 ? 0xff2e88 : 0xffb020); });
  setBeacon(RACE_GATES[0].x, RACE_GATES[0].z, true);
  const kinds = ['sport', 'coupe', 'sedan'];
  for (let i = 0; i < 3; i++) {
    const mesh = makeCarMesh(kinds[i], [0xc23b2e, 0x2e7fc2, 0xd8a13a][i]);
    const car = { mesh, kind: kinds[i], speed: 0, heading: 0, isTraffic: false, parked: false, race: true, gate: 0, lap: 1, condition: 100, top: 30 + i * 3 };
    mesh.position.set(RACE_GATES[0].x - 4 - i * 3, 0, RACE_GATES[0].z + 6 + i * 4);
    G.scene.add(mesh); G.cars.push(car);
    raceState.opponents.push(car);
  }
}
function endRace(won) {
  for (const m of gateMeshes) m.visible = false;
  for (const o of raceState.opponents) { G.scene.remove(o.mesh); G.cars.splice(G.cars.indexOf(o), 1); }
  const rs = raceState; raceState = null;
  if (won) {
    G.stats.raceWins++;
    completeStep();
  } else {
    G.missionStep = 0; // retry the race
  }
}
function completeStep() {
  G.missionStep++;
  const steps = MISSION_STEPS[G.missionIdx];
  if (G.missionStep >= steps.length) {
    const m = MISSIONS[G.missionIdx];
    G.cash += m.pay; G.rep += m.rep;
    G.missionIdx++; G.missionStep = 0;
    SFX.mission();
    if (G.missionIdx < MISSIONS.length) {
      const obj = currentObjective();
      if (obj.step.type === 'race') startRace();
      if (obj.step.type === 'chase') spawnConvoy();
    }
  }
}
export function updateMissions(dt) {
  const obj = currentObjective();
  if (!obj) { setBeacon(0, 0, false); return; }
  const step = obj.step;
  const p = G.player;
  if (step.type === 'goto' || step.type === 'deliver') {
    setBeacon(step.x, step.z, true);
    const d = dist2(p.x, p.z, step.x, step.z);
    if (d < step.r) completeStep();
  } else if (step.type === 'enterCar') {
    setBeacon(0, 0, false);
    if (G.vehicle) completeStep();
  } else if (step.type === 'hold') {
    setBeacon(step.x, step.z, true);
    const d = dist2(p.x, p.z, step.x, step.z);
    if (d < step.r) {
      G.missionHold += dt;
      if (G.missionHold >= step.t) { G.missionHold = 0; completeStep(); }
    } else G.missionHold = Math.max(0, G.missionHold - dt * 2);
  } else if (step.type === 'escape') {
    setBeacon(0, 0, false);
    if (G.missionIdx === 3 && G.wanted < 3) G.heat = Math.max(55, G.heat); // cannery heat stays hot
    if (G.wanted === 0 && G.heat < 12) completeStep();
  } else if (step.type === 'race') {
    updateRace(dt);
  } else if (step.type === 'chase') {
    if (convoyCar) {
      const m = convoyCar.mesh;
      setBeacon(m.position.x, m.position.z, true);
      // convoy flees along the road grid
      const dx = m.position.x - p.x, dz = m.position.z - p.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      convoyCar.heading = angLerp(convoyCar.heading, Math.atan2(dx, dz), dt * 2);
      convoyCar.speed = lerp(convoyCar.speed, d < 40 ? 34 : 24, dt);
      m.position.x += Math.sin(convoyCar.heading) * convoyCar.speed * dt;
      m.position.z += Math.cos(convoyCar.heading) * convoyCar.speed * dt;
      m.position.x = clamp(m.position.x, -280, 280); m.position.z = clamp(m.position.z, -280, 300);
      m.rotation.y = convoyCar.heading;
      if (G.vehicle) {
        const vd = dist2(G.vehicle.mesh.position.x, G.vehicle.mesh.position.z, m.position.x, m.position.z);
        if (vd < 5.5 && G.vehicle.speed > 12) {
          convoyCar.hits++;
          G.vehicle.speed *= 0.5; SFX.crash(0.8);
          if (convoyCar.hits >= step.hits) {
            G.scene.remove(m); G.cars.splice(G.cars.indexOf(convoyCar), 1); convoyCar = null;
            completeStep();
          }
        }
      }
    }
  }
  // beacon pulse
  if (beacon.visible) {
    const s = 1 + Math.sin(performance.now() / 300) * 0.08;
    beacon.scale.set(s, 1, s);
    beaconRing.scale.set(s, s, 1);
  }
}
function updateRace(dt) {
  if (!raceState) return;
  const p = G.player;
  const car = G.vehicle;
  const px = car ? car.mesh.position.x : p.x;
  const pz = car ? car.mesh.position.z : p.z;
  const gate = RACE_GATES[raceState.gate];
  const d = dist2(px, pz, gate.x, gate.z);
  if (d < 7) {
    raceState.gate++;
    SFX.click();
    if (raceState.gate >= RACE_GATES.length) {
      raceState.gate = 0;
      const lapTime = (performance.now() - raceState.lapStart) / 1000;
      if (!raceState.best || lapTime < raceState.best) { raceState.best = lapTime; G.stats.bestLap = lapTime; }
      raceState.lap++;
      raceState.lapStart = performance.now();
      if (raceState.lap > 3) { endRace(true); return; }
    }
    const next = RACE_GATES[raceState.gate];
    setBeacon(next.x, next.z, true);
    gateMeshes.forEach((m, i) => m.material.color.setHex(i === raceState.gate ? 0xff2e88 : 0xffb020));
  }
  // opponents follow the gates
  for (const o of raceState.opponents) {
    const gt = RACE_GATES[o.gate];
    const dx = gt.x - o.mesh.position.x, dz = gt.z - o.mesh.position.z;
    const dd = Math.sqrt(dx * dx + dz * dz);
    o.heading = angLerp(o.heading, Math.atan2(dx, dz), dt * 2.4);
    o.speed = lerp(o.speed, o.top, dt * 1.1);
    o.mesh.position.x += Math.sin(o.heading) * o.speed * dt;
    o.mesh.position.z += Math.cos(o.heading) * o.speed * dt;
    o.mesh.rotation.y = o.heading;
    if (dd < 7) {
      o.gate++;
      if (o.gate >= RACE_GATES.length) { o.gate = 0; o.lap++; if (o.lap > 3) { endRace(false); return; } }
    }
  }
}
export function raceHudInfo() {
  if (!raceState) return null;
  return { lap: raceState.lap, gate: raceState.gate + 1, total: RACE_GATES.length, best: raceState.best };
}
