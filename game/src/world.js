// AZURA BAY — Neon Tide: the city itself. A canvas-textured ground (roads, markings,
// sidewalks, beach), buildings with lit-window facades, neon shopfronts, the pier,
// the container port, palms and props — plus the full day cycle with cinematic light.
import * as THREE from 'three';
import { G, CFG, DISTRICTS, districtAt, mulberry, pick, clamp, lerp } from './config.js';

let sun, hemi, moon, stars, water, neonMats = [], lampMats = [], winMats = [];
let phaseName = 'morning';

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function textTex(text, color, bg, font) {
  return canvasTex(512, 128, (c) => {
    c.fillStyle = bg || 'rgba(8,8,16,0.92)'; c.fillRect(0, 0, 512, 128);
    c.font = font || 'bold 64px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = color; c.shadowBlur = 26; c.fillStyle = color;
    c.fillText(text, 256, 66);
  });
}
function windowTex(litRatio, tint) {
  return canvasTex(128, 256, (c) => {
    c.fillStyle = '#20242e'; c.fillRect(0, 0, 128, 256);
    const rng = mulberry(7);
    for (let y = 8; y < 248; y += 22) for (let x = 8; x < 120; x += 18) {
      const lit = rng() < litRatio;
      c.fillStyle = lit ? tint : '#12151d';
      c.fillRect(x, y, 12, 14);
      if (lit) { c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x, y, 12, 4); }
    }
  });
}
function groundTexture() {
  const S = 1024, half = CFG.cityHalf + 20, scale = S / (half * 2);
  return canvasTex(S, S, (c) => {
    c.fillStyle = '#2b2f3a'; c.fillRect(0, 0, S, S); // asphalt base
    const rng = mulberry(99);
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(255,255,255,${rng() * 0.03})`; c.fillRect(rng() * S, rng() * S, 3, 3); }
    // blocks: concrete with sidewalk edge
    for (let bx = -270; bx <= 270; bx += 60) for (let bz = -270; bz <= 270; bz += 60) {
      const px = (bx - 23 + half) * scale, pz = (bz - 23 + half) * scale, pw = 46 * scale;
      c.fillStyle = '#3a3f4a'; c.fillRect(px, pz, pw, pw);
      c.strokeStyle = '#4a505e'; c.lineWidth = 3; c.strokeRect(px + 4, pz + 4, pw - 8, pw - 8);
    }
    // beach + water at the south edge (z > 210)
    const beachY = (210 + half) * scale;
    const grad = c.createLinearGradient(0, beachY, 0, S);
    grad.addColorStop(0, '#e8d5a2'); grad.addColorStop(0.45, '#e2c98f'); grad.addColorStop(1, '#1d6f8e');
    c.fillStyle = grad; c.fillRect(0, beachY, S, S - beachY);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 40; i++) c.fillRect(rng() * S, beachY + 30 + rng() * (S - beachY - 40), 26, 3);
    // roads: darker strips + dashed centre lines
    c.fillStyle = '#23262f';
    for (let g = -270; g <= 270; g += 60) {
      const p = (g - 7 + half) * scale, w = 14 * scale;
      c.fillRect(p, 0, w, S); c.fillRect(0, p, S, w);
    }
    c.fillStyle = '#d8b13a';
    for (let g = -270; g <= 270; g += 60) {
      const p = (g + half) * scale;
      for (let d = 0; d < S; d += 34) { c.fillRect(p - 2, d, 4, 18); c.fillRect(d, p - 2, 18, 4); }
    }
    // crosswalks
    c.fillStyle = 'rgba(255,255,255,0.55)';
    for (let gx = -270; gx <= 270; gx += 60) for (let gz = -270; gz <= 270; gz += 60) {
      const px = (gx - 7 + half) * scale, pz = (gz - 7 + half) * scale;
      for (let i = 0; i < 5; i++) { c.fillRect(px + i * 6, pz - 12, 3, 24); c.fillRect(px - 12, pz + i * 6, 24, 3); }
    }
  });
}

const PHASES = [
  { name: 'morning', t0: 6, t1: 10, sun: 0xffe3b0, sunI: 2.4, hemiSky: 0x9fc8ff, hemiGnd: 0x8a7a5a, hemiI: 0.75, sky: 0x9fc6ee, fog: 0xa8c4e0, neon: 0.25, exp: 1.05 },
  { name: 'noon', t0: 10, t1: 16, sun: 0xfff3d6, sunI: 3.1, hemiSky: 0xbfe0ff, hemiGnd: 0x9a8a6a, hemiI: 0.9, sky: 0x7fb8f0, fog: 0x9cc0e8, neon: 0.15, exp: 1.08 },
  { name: 'dusk', t0: 16, t1: 20, sun: 0xff9a5c, sunI: 2.2, hemiSky: 0xf0a8a0, hemiGnd: 0x6a5560, hemiI: 0.85, sky: 0xff8fa8, fog: 0xc08a90, neon: 0.9, exp: 1.22 },
  { name: 'night', t0: 20, t1: 30, sun: 0x8fb0ff, sunI: 0.7, hemiSky: 0x4a5a8a, hemiGnd: 0x2a2830, hemiI: 0.75, sky: 0x0b1026, fog: 0x1c2640, neon: 1.6, exp: 1.3 },
];
function phaseFor(hour) {
  for (const p of PHASES) if (hour >= p.t0 && hour < p.t1) return p;
  return PHASES[3];
}

export function buildCity() {
  const scene = G.scene;
  const rng = mulberry(G.seed);
  neonMats = []; lampMats = []; winMats = [];
  // renderer tone
  G.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  G.renderer.toneMappingExposure = 1.08;
  G.renderer.shadowMap.enabled = true;
  G.renderer.shadowMap.type = THREE.PCFShadowMap;
  scene.background = new THREE.Color(0x7fb8f0);
  scene.fog = new THREE.Fog(0x9cc0e8, 240, 780);
  sun = new THREE.DirectionalLight(0xfff3d6, 3.0);
  sun.position.set(120, 180, 60); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -320; sun.shadow.camera.right = 320;
  sun.shadow.camera.top = 320; sun.shadow.camera.bottom = -320;
  sun.shadow.camera.far = 700; sun.shadow.bias = -0.0004;
  scene.add(sun); scene.add(sun.target);
  hemi = new THREE.HemisphereLight(0xbfe0ff, 0x9a8a6a, 0.9); scene.add(hemi);
  moon = new THREE.DirectionalLight(0x8fb0ff, 0); moon.position.set(-140, 160, -80); scene.add(moon);
  // stars
  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 700; i++) { const a = rng() * Math.PI * 2, e = rng() * 1.2 + 0.15, r = 520; sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, transparent: true, opacity: 0 }));
  scene.add(stars);
  // ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(640, 640), new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.94, metalness: 0.02 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  // water south of the beach
  water = new THREE.Mesh(new THREE.PlaneGeometry(640, 90), new THREE.MeshStandardMaterial({ color: 0x1d7f9e, roughness: 0.25, metalness: 0.35, transparent: true, opacity: 0.92 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.12, 345); scene.add(water);
  // window materials (shared, emissive at night)
  const winTexA = windowTex(0.55, '#ffd98a'), winTexB = windowTex(0.4, '#9fd8ff'), winTexC = windowTex(0.7, '#ffb0d8');
  const winMatsBase = [winTexA, winTexB, winTexC].map(t => new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.12, roughness: 0.35, metalness: 0.25 }));
  winMats = winMatsBase;
  const wallCols = [0x8a7f72, 0x6e7f92, 0x9a8a7a, 0x7a6a8a, 0x5f7285, 0xb08a6a, 0x74604f];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  function addBuilding(x, z, w, d, h, district) {
    const wall = new THREE.MeshStandardMaterial({ color: pick(rng, wallCols), roughness: 0.82, metalness: 0.08 });
    const b = new THREE.Mesh(boxGeo, wall);
    b.scale.set(w, h, d); b.position.set(x, h / 2, z);
    b.castShadow = true; b.receiveShadow = true; scene.add(b);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, h * 0.92), pick(rng, winMatsBase));
    win.position.set(x, h / 2, z + d / 2 + 0.06); scene.add(win);
    const win2 = win.clone(); win2.rotation.y = Math.PI; win2.position.set(x, h / 2, z - d / 2 - 0.06); scene.add(win2);
    // rooftop detail: AC box + water tank
    const ac = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x9aa2ad, roughness: 0.6, metalness: 0.5 }));
    ac.scale.set(2.4, 1.1, 2.4); ac.position.set(x + w * 0.2, h + 0.55, z); ac.castShadow = true; scene.add(ac);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.6, 10), new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.7 }));
    tank.position.set(x - w * 0.25, h + 1.3, z - d * 0.2); tank.castShadow = true; scene.add(tank);
    G.colliders.push({ x0: x - w / 2 - 0.5, z0: z - d / 2 - 0.5, x1: x + w / 2 + 0.5, z1: z + d / 2 + 0.5 });
    return b;
  }
  // city blocks
  for (let bx = -270; bx <= 270; bx += 60) for (let bz = -270; bz <= 270; bz += 60) {
    const cx = bx, cz = bz;
    if (cz > 200) continue; // beach
    if (cx > 210 && cz > -60 && cz < 60) continue; // port yard handled below
    if (Math.abs(cx) < 40 && Math.abs(cz) < 40) continue; // central plaza
    const d = districtAt(cx, cz);
    const n = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const ox = (rng() - 0.5) * 20, oz = (rng() - 0.5) * 20;
      let h = 10 + rng() * 16;
      if (d.name === 'SUNDIAL SQUARE') h = 22 + rng() * 42;
      else if (d.name === 'PALM HEIGHTS') h = 8 + rng() * 10;
      else if (d.name === 'OLD CANNERY') h = 10 + rng() * 12;
      addBuilding(cx + ox, cz + oz, 14 + rng() * 16, 14 + rng() * 16, h, d);
    }
  }
  // downtown neon shopfronts
  const signs = [['NEON', '#ff2e88'], ['CASINO', '#ffb020'], ['HOTEL AZURA', '#22d3ee'], ['TACOS 24H', '#ff6a3d'], ['BAR LUNA', '#b78cff'], ['PIER 9', '#2ec8d8']];
  for (let i = 0; i < signs.length; i++) {
    const [txt, col] = signs[i];
    const mat = new THREE.MeshBasicMaterial({ map: textTex(txt, col), transparent: true });
    neonMats.push(mat);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), mat);
    const a = (i / signs.length) * Math.PI * 2;
    s.position.set(Math.sin(a) * 52, 9 + (i % 3) * 7, Math.cos(a) * 52);
    s.lookAt(0, s.position.y, 0); scene.add(s);
  }
  // streetlights
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c3242, roughness: 0.5, metalness: 0.7 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffdf80, emissiveIntensity: 0.15 });
  lampMats.push(lampMat);
  for (let gx = -270; gx <= 270; gx += 60) for (let gz = -270; gz <= 270; gz += 60) {
    if (gz > 200) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 7, 6), poleMat);
    pole.position.set(gx + 8, 3.5, gz + 8); scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lampMat);
    lamp.position.set(gx + 8, 7.1, gz + 8); scene.add(lamp);
  }
  // palm trees along the beach road
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2fae5f, roughness: 0.8 });
  for (let x = -270; x <= 270; x += 30) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 7), trunkMat);
    trunk.position.set(x, 3.5, 196); trunk.rotation.z = (rng() - 0.5) * 0.14; trunk.castShadow = true; scene.add(trunk);
    for (let f = 0; f < 6; f++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5, 4), leafMat);
      const a = (f / 6) * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 1.8, 7.6, 196 + Math.sin(a) * 1.8);
      leaf.rotation.set(Math.sin(a) * 1.1, 0, Math.cos(a) * 1.1 - 0.5); scene.add(leaf);
    }
  }
  // pier at Seaglass Beach
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 0.85 });
  for (let z = 220; z <= 320; z += 6) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 5.4), wood);
    plank.position.set(0, 1.2, z); plank.receiveShadow = true; scene.add(plank);
  }
  for (const px of [-4.6, 4.6]) for (let z = 220; z <= 320; z += 20) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.6, 6), wood);
    post.position.set(px, 0.6, z); scene.add(post);
  }
  const pierEnd = new THREE.Mesh(new THREE.BoxGeometry(22, 0.6, 14), wood);
  pierEnd.position.set(0, 1.2, 326); scene.add(pierEnd);
  // port: container stacks + cranes
  const contCols = [0xc23b2e, 0x2e7fc2, 0x3fae5f, 0xd8a13a, 0x7a4fc2];
  for (let i = 0; i < 26; i++) {
    const col = new THREE.MeshStandardMaterial({ color: pick(rng, contCols), roughness: 0.55, metalness: 0.35 });
    const cbox = new THREE.Mesh(boxGeo, col);
    const w = 12, h = 2.6, d = 2.6;
    const x = 222 + rng() * 60, z = -50 + rng() * 100, y = 1.3 + Math.floor(rng() * 3) * 2.7;
    cbox.scale.set(w, h, d); cbox.position.set(x, y, z); cbox.rotation.y = (rng() < 0.5 ? 0 : Math.PI / 2);
    cbox.castShadow = true; cbox.receiveShadow = true; scene.add(cbox);
    if (y < 2) G.colliders.push({ x0: x - 6.5, z0: z - 6.5, x1: x + 6.5, z1: z + 6.5 });
  }
  for (const cx of [235, 268]) {
    const craneMat = new THREE.MeshStandardMaterial({ color: 0xd8a13a, roughness: 0.5, metalness: 0.5 });
    const leg1 = new THREE.Mesh(boxGeo, craneMat); leg1.scale.set(2, 26, 2); leg1.position.set(cx, 13, -30); scene.add(leg1);
    const leg2 = leg1.clone(); leg2.position.set(cx, 13, 30); scene.add(leg2);
    const beam = new THREE.Mesh(boxGeo, craneMat); beam.scale.set(3, 2, 70); beam.position.set(cx, 26, 0); scene.add(beam);
    const cab = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x222a38, roughness: 0.4, metalness: 0.4 }));
    cab.scale.set(5, 4, 5); cab.position.set(cx, 22, 0); scene.add(cab);
  }
  // basketball court at Seaglass Beach
  const court = new THREE.Mesh(new THREE.PlaneGeometry(28, 16), new THREE.MeshStandardMaterial({ color: 0x2e6fc2, roughness: 0.85 }));
  court.rotation.x = -Math.PI / 2; court.position.set(-60, 0.06, 238); court.receiveShadow = true; scene.add(court);
  const hoopPole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 4, 6), poleMat);
  hoopPole.position.set(-60, 2, 247); scene.add(hoopPole);
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 0.15), new THREE.MeshStandardMaterial({ color: 0xf2f5ff, roughness: 0.4 }));
  board.position.set(-60, 3.8, 247); scene.add(board);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 8, 20), new THREE.MeshStandardMaterial({ color: 0xff6a3d, metalness: 0.6, roughness: 0.4 }));
  rim.rotation.x = Math.PI / 2; rim.position.set(-60, 3.5, 246.2); scene.add(rim);
  // helipads
  for (const [hx, hz] of [[240, 240], [-240, -240]]) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.5, 24), new THREE.MeshStandardMaterial({ color: 0x2c3242, roughness: 0.8 }));
    pad.position.set(hx, 0.25, hz); pad.receiveShadow = true; scene.add(pad);
    const ring = new THREE.Mesh(new THREE.RingGeometry(6.5, 7.5, 24), new THREE.MeshBasicMaterial({ color: 0xffb020, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(hx, 0.52, hz); scene.add(ring);
  }
  // central plaza fountain
  const fBase = new THREE.Mesh(new THREE.CylinderGeometry(8, 9, 1.2, 20), new THREE.MeshStandardMaterial({ color: 0x9aa2ad, roughness: 0.4, metalness: 0.3 }));
  fBase.position.set(0, 0.6, 0); scene.add(fBase);
  const fWater = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.4, 20), new THREE.MeshStandardMaterial({ color: 0x2ec8d8, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.85 }));
  fWater.position.set(0, 1.1, 0); scene.add(fWater);
  applyPhase();
  return {
    spots: {
      pier: { x: 0, z: 322 }, court: { x: -60, z: 238 }, garage: { x: 150, z: 90 },
      gunshop: { x: -90, z: 30 }, casino: { x: 30, z: -90 }, helipads: [{ x: 240, z: 240 }, { x: -240, z: -240 }],
      plaza: { x: 0, z: 0 }, beach: { x: 0, z: 250 },
    },
  };
}
export function applyPhase() {
  const hour = (G.time / 3600) % 24;
  const p = phaseFor(hour);
  phaseName = p.name;
  const dayFrac = clamp(((hour - 6) / 14), 0, 1);
  const sunAngle = Math.PI * (0.08 + dayFrac * 0.84);
  const isNight = p.name === 'night';
  sun.position.set(Math.cos(sunAngle) * 220, Math.sin(sunAngle) * 190 + 20, 80);
  sun.color.setHex(p.sun); sun.intensity = p.sunI;
  sun.visible = !isNight;
  moon.intensity = isNight ? 0.85 : 0;
  hemi.color.setHex(p.hemiSky); hemi.groundColor.setHex(p.hemiGnd); hemi.intensity = p.hemiI;
  G.scene.background.setHex(p.sky);
  G.scene.fog.color.setHex(p.fog);
  G.renderer.toneMappingExposure = p.exp;
  stars.material.opacity = isNight ? 0.9 : p.name === 'dusk' ? 0.25 : 0;
  for (const m of winMats) m.emissiveIntensity = isNight ? 1.5 : p.name === 'dusk' ? 0.9 : 0.12;
  for (const m of neonMats) m.opacity = p.name === 'night' ? 1 : p.name === 'dusk' ? 0.95 : 0.55;
  for (const m of lampMats) m.emissiveIntensity = isNight ? 2.2 : p.name === 'dusk' ? 1.2 : 0.15;
}
export function updateWorld(dt, t) {
  // water shimmer + neon flicker
  if (water) { water.position.y = 0.12 + Math.sin(t * 0.7) * 0.06; }
  if (neonMats.length > 2 && Math.sin(t * 7.3) > 0.96) neonMats[2].opacity = 0.4;
  else if (neonMats.length > 2) neonMats[2].opacity = phaseName === 'night' ? 1 : 0.55;
  // advance the game clock; switch phase when the hour crosses a boundary
  const prev = phaseName;
  G.time += dt * (86400 / CFG.dayLength);
  if (G.time >= 86400) { G.time -= 86400; G.day += 1; }
  applyPhase();
  return prev !== phaseName;
}
export function currentPhase() { return phaseName; }
