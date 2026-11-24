// AZURA BAY — Neon Tide: vehicles. Cars are built from extruded side-profile shapes
// (sloped hood, glass cabin, trunk, bumpers, arched wheels) — never boxes. Traffic
// follows the road grid, the player drives with arcade physics, drift makes smoke,
// skid marks and a cash bonus. Motorcycle, helicopter and jetpack included.
import * as THREE from 'three';
import { G, CFG, clamp, lerp, angLerp, angDiff, dist2, mulberry, pick } from './config.js';
import { SFX } from './audio.js';

const CAR_KINDS = {
  sedan: { len: 4.4, w: 1.9, top: 40, accel: 24, name: 'Vireo GT' },
  coupe: { len: 4.2, w: 1.85, top: 46, accel: 28, name: 'Sundial S' },
  suv: { len: 4.7, w: 2.0, top: 36, accel: 20, name: 'Palm Runner' },
  truck: { len: 5.6, w: 2.1, top: 32, accel: 16, name: 'Harbor Hauler' },
  taxi: { len: 4.4, w: 1.9, top: 38, accel: 22, name: 'Sunline Cab' },
  van: { len: 5.0, w: 2.0, top: 34, accel: 18, name: 'Bay Van' },
  sport: { len: 4.3, w: 1.95, top: 52, accel: 32, name: 'Neon Comet' },
  police: { len: 4.5, w: 1.95, top: 44, accel: 27, name: 'ABPD Interceptor' },
};
const CAR_COLORS = [0xc23b2e, 0x2e7fc2, 0x3fae5f, 0xd8a13a, 0x7a4fc2, 0xe8e8e8, 0x22262f, 0xff6a3d, 0x2ec8d8];

// side profile of a real car: nose, hood slope, windshield, roof, rear glass, trunk
function bodyShape(kind) {
  const s = new THREE.Shape();
  const L = CAR_KINDS[kind].len;
  const k = L / 4.4;
  s.moveTo(0.02, 0.32);
  s.lineTo(0.12 * k, 0.52); s.lineTo(0.85 * k, 0.74); // nose + hood
  s.lineTo(1.45 * k, 0.86); s.lineTo(1.72 * k, 1.28); // windshield
  s.lineTo(2.85 * k, 1.3); s.lineTo(3.25 * k, 0.88); // roof + rear glass
  s.lineTo(4.15 * k, 0.8); s.lineTo(4.38 * k, 0.55); // trunk + tail
  s.lineTo(4.38 * k, 0.32); s.lineTo(0.02, 0.32);
  return s;
}
function glassShape(kind) {
  const s = new THREE.Shape();
  const k = CAR_KINDS[kind].len / 4.4;
  s.moveTo(1.5 * k, 0.88); s.lineTo(1.78 * k, 1.24); s.lineTo(2.8 * k, 1.26); s.lineTo(3.18 * k, 0.88);
  s.lineTo(1.5 * k, 0.88);
  return s;
}
const glassMat = new THREE.MeshStandardMaterial({ color: 0x0e1a26, roughness: 0.12, metalness: 0.85 });
const tireMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95 });
const hubMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.25, metalness: 0.9 });
const lightMatF = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffedb0, emissiveIntensity: 0.9 });
const lightMatR = new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xff2222, emissiveIntensity: 0.7 });

export function makeCarMesh(kind, color) {
  const def = CAR_KINDS[kind];
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.55 });
  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape(kind), { depth: def.w - 0.24, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
  bodyGeo.translate(0, 0, -(def.w - 0.24) / 2);
  const body = new THREE.Mesh(bodyGeo, kind === 'police' ? new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.3, metalness: 0.5 }) : paint);
  body.castShadow = true; g.add(body);
  const glassGeo = new THREE.ExtrudeGeometry(glassShape(kind), { depth: def.w - 0.5, bevelEnabled: false });
  glassGeo.translate(0, 0, -(def.w - 0.5) / 2);
  const glass = new THREE.Mesh(glassGeo, glassMat); g.add(glass);
  // bumpers
  const bumpMat = new THREE.MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.5, metalness: 0.4 });
  for (const bx of [0.08, def.len - 0.08]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, def.w - 0.1), bumpMat);
    b.position.set(bx, 0.32, 0); g.add(b);
  }
  // wheels with arches: tire + hubcap + dark arch ring
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 18);
  wheelGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.28, 12);
  hubGeo.rotateX(Math.PI / 2);
  const archGeo = new THREE.TorusGeometry(0.44, 0.06, 6, 14, Math.PI);
  const wheels = [];
  for (const [wx, wz] of [[0.95, def.w / 2 - 0.08], [0.95, -def.w / 2 + 0.08], [def.len - 0.95, def.w / 2 - 0.08], [def.len - 0.95, -def.w / 2 + 0.08]]) {
    const w = new THREE.Mesh(wheelGeo, tireMat); w.position.set(wx, 0.36, wz); w.castShadow = true; g.add(w);
    const h = new THREE.Mesh(hubGeo, hubMat); h.position.set(wx, 0.36, wz); g.add(h);
    const a = new THREE.Mesh(archGeo, new THREE.MeshStandardMaterial({ color: 0x11131a, roughness: 0.9 }));
    a.position.set(wx, 0.36, wz); a.rotation.y = 0; g.add(a);
    wheels.push(w);
  }
  // headlights + taillights
  for (const wz of [-def.w / 2 + 0.18, def.w / 2 - 0.18]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.34), lightMatF); hl.position.set(0.06, 0.58, wz); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.34), lightMatR); tl.position.set(def.len - 0.06, 0.58, wz); g.add(tl);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.9), new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xffb020, emissiveIntensity: 0.8 }));
    sign.position.set(2.3, 1.42, 0); g.add(sign);
  }
  let lightBar = null;
  if (kind === 'police') {
    // black hood / trunk / door panels over the white body
    const black = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.35, metalness: 0.5 });
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.05, def.w - 0.3), black); hood.position.set(0.55, 0.78, 0); hood.rotation.z = 0.12; g.add(hood);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, def.w - 0.3), black); trunk.position.set(3.9, 0.82, 0); g.add(trunk);
    const bar = new THREE.Group();
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 1.3), black); bar.add(barBase);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.55), new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0xff0000, emissiveIntensity: 2 }));
    red.position.z = -0.32; bar.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.55), new THREE.MeshStandardMaterial({ color: 0x0033cc, emissive: 0x2266ff, emissiveIntensity: 2 }));
    blue.position.z = 0.32; bar.add(blue);
    bar.position.set(2.3, 1.44, 0); g.add(bar);
    lightBar = { red: red.material, blue: blue.material };
  }
  g.userData = { kind, wheels, lightBar, def };
  // the profile's nose sits at local -X, but the game drives toward (sin h, cos h):
  // wrap the parts in an inner group turned 90 deg so the nose faces local +Z
  const inner = new THREE.Group();
  while (g.children.length) inner.add(g.children[0]);
  inner.rotation.y = Math.PI / 2;
  g.add(inner);
  return g;
}
export function makeBikeMesh() {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.3, metalness: 0.6 });
  const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 4, 10), paint);
  tank.rotation.z = Math.PI / 2; tank.position.set(0, 0.85, 0); tank.castShadow = true; g.add(tank);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.34), new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 }));
  seat.position.set(-0.62, 0.92, 0); g.add(seat);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.14, 16); wheelGeo.rotateX(Math.PI / 2);
  for (const wx of [0.75, -0.75]) { const w = new THREE.Mesh(wheelGeo, tireMat); w.position.set(wx, 0.36, 0); g.add(w); }
  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), hubMat);
  fork.position.set(0.72, 0.75, 0); fork.rotation.z = 0.5; g.add(fork);
  const hl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), lightMatF); hl.position.set(0.95, 0.85, 0); g.add(hl);
  g.userData = { kind: 'bike', def: { len: 2.2, w: 0.8, top: 48, accel: 34, name: 'Neon Rider' } };
  // the fork/headlight sit at local +X: turn the inner group so the nose faces +Z
  const inner = new THREE.Group();
  while (g.children.length) inner.add(g.children[0]);
  inner.rotation.y = -Math.PI / 2;
  g.add(inner);
  return g;
}
export function makeHeliMesh(police = false) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: police ? 0x1c2733 : 0xd8a13a, roughness: 0.35, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 2.4, 6, 12), paint);
  body.rotation.z = Math.PI / 2; body.castShadow = true; g.add(body);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 8, 0, Math.PI * 2, 0, 1.1), glassMat);
  glass.position.set(1.9, 0.25, 0); glass.rotation.z = -Math.PI / 2; g.add(glass);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 3.4, 8), paint);
  tail.rotation.z = Math.PI / 2; tail.position.set(-2.9, 0.35, 0); g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.7), paint); fin.position.set(-4.4, 0.8, 0); g.add(fin);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 6), hubMat); mast.position.set(0.2, 1.35, 0); g.add(mast);
  const rotor = new THREE.Group();
  const bladeGeo = new THREE.BoxGeometry(7.6, 0.06, 0.34);
  const b1 = new THREE.Mesh(bladeGeo, hubMat); rotor.add(b1);
  const b2 = new THREE.Mesh(bladeGeo, hubMat); b2.rotation.y = Math.PI / 2; rotor.add(b2);
  rotor.position.set(0.2, 1.72, 0); g.add(rotor);
  const skidMat = new THREE.MeshStandardMaterial({ color: 0x22262f, metalness: 0.7, roughness: 0.4 });
  for (const wz of [-0.9, 0.9]) { const s = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.12), skidMat); s.position.set(0, -1.05, wz); g.add(s); }
  g.userData = { kind: 'heli', rotor, def: { len: 5, w: 2.4, top: 30, accel: 14, name: police ? 'ABPD Air-1' : 'Bay Heli' } };
  // the glass nose sits at local +X: turn the inner group so the nose faces +Z
  const inner = new THREE.Group();
  while (g.children.length) inner.add(g.children[0]);
  inner.rotation.y = -Math.PI / 2;
  g.add(inner);
  return g;
}
// --- particles: smoke, exhaust, drift, jetpack flame -------------------------
let pGeo, pPts, pData = [];
export function initParticles() {
  const N = 260;
  pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
  const mat = new THREE.PointsMaterial({ color: 0xcfd4dd, size: 1.6, transparent: true, opacity: 0.55, depthWrite: false });
  pPts = new THREE.Points(pGeo, mat); pPts.frustumCulled = false; G.scene.add(pPts);
  for (let i = 0; i < N; i++) pData.push({ life: 0, x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, max: 1 });
}
function spawnPuff(x, y, z, vx, vy, vz, life) {
  for (const p of pData) {
    if (p.life > 0) continue;
    p.life = life; p.max = life; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    return;
  }
}
export function updateParticles(dt) {
  const arr = pGeo.attributes.position.array;
  for (let i = 0; i < pData.length; i++) {
    const p = pData[i];
    if (p.life > 0) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy += 0.6 * dt;
      arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
    } else { arr[i * 3 + 1] = -50; }
  }
  pGeo.attributes.position.needsUpdate = true;
}
// --- skid marks ---------------------------------------------------------------
let skidPool = [], skidIdx = 0;
export function initSkids() {
  const mat = new THREE.MeshBasicMaterial({ color: 0x0a0c10, transparent: true, opacity: 0.55, depthWrite: false });
  for (let i = 0; i < 90; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.6), mat.clone());
    m.rotation.x = -Math.PI / 2; m.position.y = -40; m.userData.life = 0;
    G.scene.add(m); skidPool.push(m);
  }
}
function addSkid(x, z, yaw) {
  const m = skidPool[skidIdx]; skidIdx = (skidIdx + 1) % skidPool.length;
  m.position.set(x, 0.07, z); m.rotation.z = -yaw; m.userData.life = 9; m.material.opacity = 0.55;
}
export function updateSkids(dt) {
  for (const m of skidPool) {
    if (m.userData.life > 0) { m.userData.life -= dt; m.material.opacity = Math.max(0, m.userData.life / 9) * 0.55; if (m.userData.life <= 0) m.position.y = -40; }
  }
}
// --- spawning -----------------------------------------------------------------
export function spawnTraffic(n) {
  const rng = mulberry(G.seed + 11);
  const kinds = ['sedan', 'coupe', 'suv', 'taxi', 'van', 'truck', 'sport'];
  for (let i = 0; i < n; i++) {
    const kind = pick(rng, kinds);
    const mesh = makeCarMesh(kind, pick(rng, CAR_COLORS));
    const gx = (Math.floor(rng() * 10) - 5) * 60, gz = (Math.floor(rng() * 10) - 5) * 60;
    const car = { mesh, kind, speed: 0, heading: rng() * Math.PI * 2, target: null, wait: 0, top: CAR_KINDS[kind].top * 0.32, isTraffic: true, condition: 100 };
    mesh.position.set(gx, 0, gz); mesh.rotation.y = car.heading;
    G.scene.add(mesh); G.cars.push(car);
    retarget(car, rng);
  }
}
function retarget(car, rng) {
  const gx = Math.round(car.mesh.position.x / 60) * 60, gz = Math.round(car.mesh.position.z / 60) * 60;
  const dirs = [[60, 0], [-60, 0], [0, 60], [0, -60]];
  const d = pick(rng || Math.random, dirs);
  car.target = { x: clamp(gx + d[0], -270, 270), z: clamp(gz + d[1], -270, 270) };
}
export function spawnParked(n) {
  const rng = mulberry(G.seed + 23);
  const kinds = ['sedan', 'coupe', 'suv', 'taxi', 'van', 'sport', 'bike', 'bike'];
  let placed = 0, guard = 0;
  while (placed < n && guard++ < 400) {
    const gx = (Math.floor(rng() * 10) - 5) * 60 + (rng() < 0.5 ? 10 : -10);
    const gz = (Math.floor(rng() * 10) - 5) * 60 + (rng() - 0.5) * 30;
    if (Math.abs(gx) < 30 && Math.abs(gz) < 30) continue;
    if (gz > 200 || gx > 210) continue;
    const kind = pick(rng, kinds);
    const mesh = kind === 'bike' ? makeBikeMesh() : makeCarMesh(kind, pick(rng, CAR_COLORS));
    const car = { mesh, kind, speed: 0, heading: (rng() < 0.5 ? 0 : Math.PI / 2) + (rng() < 0.5 ? 0 : Math.PI), parked: true, condition: 70 + rng() * 30, top: mesh.userData.def.top, isTraffic: false };
    mesh.position.set(gx, 0, gz); mesh.rotation.y = car.heading;
    G.scene.add(mesh); G.cars.push(car); placed++;
  }
}
// --- collision ----------------------------------------------------------------
function collideCircle(x, z, r) {
  for (const c of G.colliders) {
    const nx = clamp(x, c.x0, c.x1), nz = clamp(z, c.z0, c.z1);
    const dx = x - nx, dz = z - nz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.001;
      return { pushX: (dx / d) * (r - d), pushZ: (dz / d) * (r - d), hit: true };
    }
  }
  return { hit: false };
}
// --- player driving -----------------------------------------------------------
export function enterVehicle(car) {
  G.vehicle = car; car.parked = false; car.isTraffic = false;
  G.player.mesh.visible = false;
  G.stats.carsStolen++;
  G.heat = Math.min(100, G.heat + 25);
  SFX.click();
}
export function exitVehicle() {
  if (!G.vehicle) return;
  const v = G.vehicle; G.vehicle = null;
  const p = G.player;
  p.mesh.visible = true;
  const bx = v.mesh.position.x - Math.sin(v.heading) * 2.4, bz = v.mesh.position.z - Math.cos(v.heading) * 2.4;
  p.x = bx; p.z = bz; p.mesh.position.set(bx, 0, bz);
  v.speed = 0;
}
export function drivePlayer(dt) {
  const v = G.vehicle; if (!v) return;
  const k = G.keys;
  const def = v.mesh.userData.def;
  const tune = (G.upgrades.tune2 ? 1.14 : G.upgrades.tune1 ? 1.08 : 1);
  const top = def.top * tune;
  let target = 0;
  if (k['KeyW'] || k['ArrowUp'] || G.touch.y < -0.3) target = top;
  if (k['KeyS'] || k['ArrowDown'] || G.touch.y > 0.3) target = -12;
  const nitro = (k['ShiftLeft'] || k['ShiftRight']) && G.upgrades.nitro && G.nitro > 0 && target > 0;
  if (nitro) { target *= CFG.nitroBoost; G.nitro = Math.max(0, G.nitro - dt * 30); }
  else G.nitro = Math.min(100, G.nitro + dt * 8);
  const drifting = (k['Space'] || G.touch.drift) && Math.abs(v.speed) > 8;
  const accelRate = target > v.speed ? def.accel : CFG.carBrake;
  v.speed = lerp(v.speed, target, clamp(accelRate * dt / Math.max(1, Math.abs(target - v.speed) + 1) * 2.2, 0, 1));
  if (Math.abs(v.speed) < 0.4 && target === 0) v.speed = 0;
  const steerIn = (k['KeyA'] || k['ArrowLeft'] || G.touch.x < -0.3 ? 1 : 0) - (k['KeyD'] || k['ArrowRight'] || G.touch.x > 0.3 ? 1 : 0);
  const steerAmt = steerIn * CFG.carTurn * clamp(Math.abs(v.speed) / 14, 0, 1) * (v.speed >= 0 ? 1 : -1) * (drifting ? 1.7 : 1);
  v.heading += steerAmt * dt * (drifting ? 1.35 : 1);
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  let nx = v.mesh.position.x + fx * v.speed * dt;
  let nz = v.mesh.position.z + fz * v.speed * dt;
  nx = clamp(nx, -295, 295); nz = clamp(nz, -295, 305);
  const col = collideCircle(nx, nz, 2.2);
  if (col.hit) {
    nx += col.pushX; nz += col.pushZ;
    if (Math.abs(v.speed) > 12) { SFX.crash(clamp(Math.abs(v.speed) / 40, 0.3, 1)); v.condition = Math.max(0, v.condition - 4); G.heat = Math.min(100, G.heat + 4); }
    v.speed *= 0.45;
  }
  // car-vs-car soft push
  for (const o of G.cars) {
    if (o === v || o.parked) continue;
    const d = dist2(nx, nz, o.mesh.position.x, o.mesh.position.z);
    if (d < 4.4 && d > 0.01) {
      const push = (4.4 - d) * 0.5, ux = (nx - o.mesh.position.x) / d, uz = (nz - o.mesh.position.z) / d;
      nx += ux * push; nz += uz * push; v.speed *= 0.7;
      if (Math.abs(v.speed) > 15) { SFX.crash(0.5); v.condition = Math.max(0, v.condition - 2); }
    }
  }
  v.mesh.position.x = nx; v.mesh.position.z = nz;
  v.mesh.rotation.y = v.heading;
  v.mesh.rotation.z = drifting ? steerIn * 0.1 : 0;
  // wheels spin + steer visual
  for (const w of v.mesh.userData.wheels || []) w.rotation.y = 0;
  // smoke + skid + bonus while drifting
  if (drifting) {
    const bx = nx - fx * 2, bz = nz - fz * 2;
    spawnPuff(bx, 0.5, bz, (Math.random() - 0.5) * 2, 1.2, (Math.random() - 0.5) * 2, 1.1);
    spawnPuff(bx, 0.4, bz, 0, 0.8, 0, 0.9);
    addSkid(bx - 0.8, bz, v.heading); addSkid(bx + 0.8, bz, v.heading);
    if (Math.random() < dt * 2) { G.cash += CFG.driftBonus; G.stats.kmDriven += 0; }
    if (Math.random() < dt * 6) SFX.brake();
  } else if (Math.abs(v.speed) > 4 && Math.random() < dt * 8) {
    spawnPuff(nx - fx * 2.2, 0.4, nz - fz * 2.2, 0, 0.7, 0, 0.6);
  }
  G.stats.kmDriven += Math.abs(v.speed) * dt / 1000;
  SFX.setEngine(clamp(Math.abs(v.speed) / 45, 0, 1), true);
  // wanted for speeding past police is handled in police.js
}
export function updateTraffic(dt) {
  for (const car of G.cars) {
    if (!car.isTraffic) continue;
    const m = car.mesh;
    const pd = dist2(m.position.x, m.position.z, G.player.mesh.position.x, G.player.mesh.position.z);
    if (car.wait > 0) { car.wait -= dt; car.speed = lerp(car.speed, 0, dt * 4); }
    else {
      const dx = car.target.x - m.position.x, dz = car.target.z - m.position.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const wantH = Math.atan2(dx, dz);
      car.heading = angLerp(car.heading, wantH, clamp(dt * 2.2, 0, 1));
      const slow = pd < 14 ? 0.25 : 1;
      car.speed = lerp(car.speed, car.top * slow, dt * 1.2);
      if (d < 3) { retarget(car); if (Math.random() < 0.25) car.wait = 1 + Math.random() * 2; }
    }
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    let nx = m.position.x + fx * car.speed * dt, nz = m.position.z + fz * car.speed * dt;
    const col = collideCircle(nx, nz, 2.2);
    if (col.hit) { nx += col.pushX; nz += col.pushZ; car.heading += 0.6; }
    m.position.x = clamp(nx, -295, 295); m.position.z = clamp(nz, -295, 305);
    m.rotation.y = car.heading;
    if (Math.random() < dt * 0.4) spawnPuff(nx - fx * 2, 0.4, nz - fz * 2, 0, 0.6, 0, 0.5);
  }
}
// --- helicopter + jetpack -----------------------------------------------------
export function updateHeli(dt) {
  const h = G.heli; if (!h) return;
  const k = G.keys;
  const m = h.mesh;
  m.userData.rotor.rotation.y += dt * 22;
  let vy = 0;
  if (k['Space']) vy = 9;
  if (k['KeyC']) vy = -7;
  let mx = 0, mz = 0;
  if (k['KeyW']) mz += 1; if (k['KeyS']) mz -= 1;
  if (k['KeyA']) mx -= 1; if (k['KeyD']) mx += 1;
  h.heading += (k['KeyQ'] ? -1 : 0 + (k['KeyE'] ? 1 : 0)) * dt * 1.2;
  const fx = Math.sin(h.heading), fz = Math.cos(h.heading);
  m.position.x = clamp(m.position.x + (fx * mz + fz * mx) * 16 * dt, -295, 295);
  m.position.z = clamp(m.position.z + (fz * mz - fx * mx) * 16 * dt, -295, 305);
  m.position.y = clamp(m.position.y + vy * dt, 2, 120);
  m.rotation.y = h.heading; m.rotation.z = -mx * 0.12; m.rotation.x = mz * 0.08;
  if (Math.random() < dt * 20) spawnPuff(m.position.x, m.position.y - 1, m.position.z, 0, -2, 0, 0.4);
}
export function updateJetpack(dt) {
  const p = G.player;
  if (!p.jetpack || p.jetpackFuel <= 0) return;
  const k = G.keys;
  if (k['Space'] || G.touch.jump) {
    p.jetpackFuel -= dt * 22;
    p.vy += 34 * dt;
    spawnPuff(p.x, p.y + 0.4, p.z, (Math.random() - 0.5), -3, (Math.random() - 0.5), 0.35);
    if (Math.random() < dt * 8) SFX.reel();
  } else p.jetpackFuel = Math.min(100, p.jetpackFuel + dt * 10);
}
export function nearestCar(maxD) {
  let best = null, bd = maxD;
  for (const car of G.cars) {
    if (car.isTraffic && car.speed > 2) continue;
    const d = dist2(G.player.x, G.player.z, car.mesh.position.x, car.mesh.position.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}
