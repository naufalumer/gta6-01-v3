// AZURA BAY — Neon Tide: boot and the one loop. The world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), the renderer paints what is
// there, and the HUD reads the same state. ?shot=chase|street|race|title stages a
// scene for screenshots and sets window.__shotReady. ?seed=N fixes the layout.
import * as THREE from 'three';
import { G, CFG, STEP, districtAt } from './config.js';
import { initAudio, SFX } from './audio.js';
import { buildCity, updateWorld, applyPhase } from './world.js';
import { initParticles, updateParticles, initSkids, updateSkids, spawnTraffic, spawnParked, drivePlayer, updateTraffic, updateHeli, updateJetpack, nearestCar } from './vehicles.js';
import { createPlayer, spawnPeds, updatePeds, updatePlayer } from './people.js';
import { updatePolice, respawnPlayer, spawnPatrolAt, spawnHeliAt } from './police.js';
import { initMissions, updateMissions, startMission, currentObjective } from './missions.js';
import { updateFishing, updateBasketball, updateCasino, updatePickups, saveGame, loadGame, fish, ball, slots, tryBoardHeli } from './activities.js';
import { initHud, updateHud, isPaused } from './hud.js';
import { initInput, endFrameInput } from './input.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const lowfx = params.get('lowfx') === '1'; // test mode: no shadows, pixel ratio 1 (fast software rendering)
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
G.seed = Number.isInteger(seedParam) ? seedParam : 20261124;

const canvas = document.getElementById('game');
G.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
G.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
G.renderer.setSize(window.innerWidth, window.innerHeight);
G.scene = new THREE.Scene();
G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
G.camera.position.set(0, 8, -14);
window.addEventListener('resize', () => {
  G.camera.aspect = window.innerWidth / window.innerHeight;
  G.camera.updateProjectionMatrix();
  G.renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- build the world ------------------------------------------------------------
const city = buildCity();
// headlights: two spotlights that follow the player's car at dusk/night
let headL = null, headR = null;
function initHeadlights() {
  headL = new THREE.SpotLight(0xfff2cc, 0, 90, 0.55, 0.6, 1.5);
  headR = new THREE.SpotLight(0xfff2cc, 0, 90, 0.55, 0.6, 1.5);
  G.scene.add(headL, headL.target, headR, headR.target);
}
initHeadlights();
function updateHeadlights() {
  const hr = (G.time / 3600) % 24;
  const dark = hr >= 16 || hr < 6;
  if (!G.vehicle || !dark) { headL.intensity = 0; headR.intensity = 0; return; }
  const car = G.vehicle, m = car.mesh.position;
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const lx = Math.cos(car.heading), lz = -Math.sin(car.heading);
  headL.intensity = 200; headR.intensity = 200; // strong pools of light on the road
  headL.position.set(m.x + fx * 2.2 + lx * 0.7, 1, m.z + fz * 2.2 + lz * 0.7);
  headR.position.set(m.x + fx * 2.2 - lx * 0.7, 1, m.z + fz * 2.2 - lz * 0.7);
  headL.target.position.set(m.x + fx * 28, 0, m.z + fz * 28);
  headR.target.position.set(m.x + fx * 28, 0, m.z + fz * 28);
}
if (lowfx) { G.renderer.shadowMap.enabled = false; G.renderer.setPixelRatio(1); }
createPlayer();
spawnTraffic(26);
spawnParked(18);
spawnPeds(64);
initMissions();
initParticles();
initSkids();
initHud();
initInput();
initAudio();
loadGame(); // resume the save if one exists
if (G.missionIdx < 6) startMission(G.missionIdx);
G.started = false; // title screen until PLAY
applyPhase();

// --- camera ---------------------------------------------------------------------
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const p = G.player;
  let tx, ty, tz, heading;
  if (G.vehicle) { const m = G.vehicle.mesh.position; tx = m.x; ty = 1.2; tz = m.z; heading = G.vehicle.heading; }
  else if (G.heli) { const m = G.heli.mesh.position; tx = m.x; ty = m.y; tz = m.z; heading = G.heli.heading; }
  else { tx = p.x; ty = 1.6; tz = p.z; heading = p.heading; }
  // yaw follows the motion heading unless the player dragged it recently
  // (camera sits BEHIND the motion direction: camYaw = heading, not +PI)
  if (G.camLock) { G.camYaw = G.camLock.yaw; G.camPitch = G.camLock.pitch; }
  else {
    const targetYaw = heading;
    let dy = targetYaw - G.camYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    G.camYaw += dy * Math.min(1, dt * 1.6);
  }
  const dist = (G.camLock && G.camLock.dist) || (G.vehicle ? 11 : G.heli ? 16 : 8.5);
  const h = dist * Math.sin(G.camPitch) + (G.heli ? 4 : 1.5);
  const cx = tx - Math.sin(G.camYaw) * dist * Math.cos(G.camPitch);
  const cz = tz - Math.cos(G.camYaw) * dist * Math.cos(G.camPitch);
  camTarget.set(tx, ty, tz);
  // in shot mode the camera snaps to its staged position on the first frame
  // (the lerp would leave it mid-flight behind the plaza beacon, tinting the shot pink)
  G.camera.position.lerp(new THREE.Vector3(cx, ty + h, cz), shot ? 1 : Math.min(1, dt * 8));
  G.camera.lookAt(camTarget.x, camTarget.y + 1, camTarget.z);
}

// --- step -----------------------------------------------------------------------
let autosaveT = 0;
function step(dt) {
  if (!G.started || G.gameOver) return;
  if (isPaused()) return;
  updateWorld(dt, performance.now() / 1000);
  updatePlayer(dt);
  updateJetpack(dt);
  if (G.vehicle) drivePlayer(dt);
  if (G.heli) updateHeli(dt);
  updateTraffic(dt);
  updatePeds(dt);
  updatePolice(dt);
  if (G.wanted > 0) SFX.sirenWail(dt);
  updateMissions(dt);
  updateFishing(dt);
  updateBasketball(dt);
  updateCasino(dt);
  updatePickups(dt);
  updateParticles(dt);
  updateSkids(dt);
  G.nearestCar = (!G.vehicle && !G.heli) ? nearestCar(4.5) : null;
  G.districtName = districtAt(G.player.x, G.player.z).name;
  autosaveT += dt;
  if (autosaveT > 30) { autosaveT = 0; saveGame(); }
  if (G.gameOver && G.keys['Enter']) { respawnPlayer(); saveGame(); }
  endFrameInput();
}

// --- shot staging ---------------------------------------------------------------
function stageShot(name) {
  G.started = true;
  document.getElementById('title').style.display = 'none';
  if (name === 'chase') {
    G.time = 21 * 3600; applyPhase();
    const car = G.cars.find(c => c.kind === 'sport' && c.parked);
    if (car) {
      car.mesh.position.set(0, 0, -60); car.heading = 0; car.mesh.rotation.y = 0;
      G.player.x = 0; G.player.z = -60;
      G.vehicle = car; car.parked = false; G.player.mesh.visible = false;
      car.speed = 22;
      G.keys['KeyW'] = true; // keep the chase moving through the staged frames
    }
    G.heat = 75; G.wanted = 4;
    // roadblock ahead (visible in the chase frame) + two units chasing from behind
    for (const [rx, rz] of [[0, -25], [6, -38]]) {
      const pc = spawnPatrolAt(rx, rz);
      pc.heading = Math.PI; pc.speed = 0;
    }
    for (let i = 0; i < 2; i++) {
      const pc = spawnPatrolAt(-6 + i * 12, -80 - i * 8);
      pc.heading = 0; pc.speed = 22;
    }
    spawnHeliAt(20, -100);
    G.camPitch = 0.34; // frame the car a touch higher in the shot
    G.camLock = { yaw: 0, pitch: 0.25, dist: 13 }; // pull back so the car sits fully in frame
  } else if (name === 'street') {
    G.time = 12 * 3600; applyPhase(); // noon: sun-soaked street, crowds read best
    G.player.x = 0; G.player.z = 20;
    for (let i = 0; i < 10; i++) { const ped = G.peds[i]; ped.x = (i - 5) * 6; ped.z = 10 + (i % 3) * 8; }
  } else if (name === 'race') {
    G.time = 17.5 * 3600; applyPhase();
    G.missionIdx = 1; G.missionStep = 0; startMission(1);
    const car = G.cars.find(c => c.kind === 'sport' && c.parked);
    if (car) {
      car.mesh.position.set(0, 0, -24); car.heading = 0; car.mesh.rotation.y = 0;
      G.vehicle = car; car.parked = false; G.player.mesh.visible = false; car.speed = 22;
      G.keys['KeyW'] = true; // keep the race car moving through the staged frames
      G.camLock = { yaw: 2.44, pitch: 0.38, dist: 16 }; // front-left 3/4 promo angle
    }
  } else { // title
    G.time = 8 * 3600; applyPhase();
    G.player.x = 0; G.player.z = 60;
    G.started = false;
    document.getElementById('title').style.display = 'flex';
  }
}

// --- frame ----------------------------------------------------------------------
let accumulator = 0, last = performance.now(), painted = 0;
function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  if (shot) {
    while (accumulator >= STEP) { step(STEP); accumulator -= STEP; }
    updateCamera(1 / 60);
    updateHeadlights();
    updateHud(1 / 60);
    G.renderer.render(G.scene, G.camera);
    painted++;
    if (painted >= 2) window.__shotReady = true;
    return;
  }
  while (accumulator >= STEP) { step(STEP); accumulator -= STEP; }
  updateCamera(1 / 60);
  updateHeadlights();
  updateHud(1 / 60);
  G.renderer.render(G.scene, G.camera);
}

// expose a small hook for the playtest tool
window.__azura = { G, CFG, respawnPlayer, saveGame, loadGame, startMission, currentObjective, fish, ball, slots, tryBoardHeli };

if (shot) { stageShot(shot); }
requestAnimationFrame(frame);
