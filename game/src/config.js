// AZURA BAY — Neon Tide: shared constants, world data and mutable game state.
// Every module imports G (the live state) and CFG (the static tuning) from here,
// so the game has one source of truth and no circular imports.
export const CFG = {
  cityHalf: 300, roadStep: 60, roadW: 14,
  walkSpeed: 7, runSpeed: 11, carTop: 42, carAccel: 26, carBrake: 40, carTurn: 1.9,
  nitroBoost: 1.55, driftBonus: 25,
  dayLength: 240, // seconds per full day cycle
  startCash: 250,
};
// --- helpers ---------------------------------------------------------------
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;
export const STEP = 1 / 60; // fixed simulation step
export const angLerp = (a, b, t) => { let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; };
export const angDiff = (a, b) => { let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return d; };
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); };
export const fmt$ = n => '$' + Math.round(n).toLocaleString('en-US');
export const fmtMoney = fmt$;
export const fmtTime = s => { const h = Math.floor(s / 3600) % 24, m = Math.floor((s % 3600) / 60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };
export function mulberry(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
// --- districts ---------------------------------------------------------------
export const DISTRICTS = [
  { name: 'SEAGLASS BEACH', cx: 0, cz: 250, r: 90, color: 0x2ec8d8, desc: 'White sand, Pier 9, Seaglass Court' },
  { name: 'SUNDIAL SQUARE', cx: 0, cz: 0, r: 110, color: 0xff2e88, desc: 'Downtown, Neon Row, the casino strip' },
  { name: 'SALTFLATS PORT', cx: 250, cz: 0, r: 95, color: 0xffb020, desc: 'Container port, cranes, warehouses' },
  { name: 'PALM HEIGHTS', cx: 0, cz: -250, r: 90, color: 0x37e08b, desc: 'Hillside villas, quiet streets' },
  { name: 'OLD CANNERY', cx: -250, cz: 0, r: 95, color: 0xb78cff, desc: 'Warehouses, the old cannery, back alleys' },
];
export function districtAt(x, z) {
  let best = DISTRICTS[1], bd = 1e9;
  for (const d of DISTRICTS) { const dd = dist2(x, z, d.cx, d.cz); if (dd < bd) { bd = dd; best = d; } }
  return best;
}
// --- people ------------------------------------------------------------------
export const CREW = [
  { name: 'Lena', role: 'Planner', color: '#ff2e88', initial: 'L' },
  { name: 'Tank', role: 'Muscle', color: '#3aa7ff', initial: 'T' },
  { name: 'Mira', role: 'Hacker / Driver', color: '#37e08b', initial: 'M' },
];
export const RESPECT_TITLES = ['ROOKIE', 'HUSTLER', 'STREET KING', 'BAY LEGEND', 'KING OF THE BAY'];
export const WEAPONS = [
  { name: 'PISTOL', dmg: 34, rate: 0.28, mag: 12, reserve: 48, range: 55, price: 0, ammoPrice: 25 },
  { name: 'SMG', dmg: 18, rate: 0.09, mag: 32, reserve: 128, range: 48, price: 1200, ammoPrice: 60 },
  { name: 'SHOTGUN', dmg: 90, rate: 0.85, mag: 6, reserve: 24, range: 26, price: 1800, ammoPrice: 45 },
];
export const UPGRADES = [
  { id: 'repair', name: 'FULL REPAIR', desc: 'Restore the car to perfect condition.', price: 250 },
  { id: 'respray', name: 'RESPRAY — NEON PEARL', desc: 'A fresh coat that turns heads on Neon Row.', price: 400 },
  { id: 'tune1', name: 'STAGE 1 TUNE +8% TOP SPEED', desc: 'Intake and exhaust work. Noticeably quicker.', price: 900 },
  { id: 'tune2', name: 'STAGE 2 TUNE +14% TOP SPEED', desc: 'Turbo, cams, remap. The full treatment.', price: 2200, needs: 'tune1' },
  { id: 'armor', name: 'ARMOUR PLATING', desc: 'Steel plates. Bullets and bumps hurt less.', price: 3600 },
  { id: 'nitro', name: 'NITRO KIT', desc: 'Hold Shift for a burst of speed.', price: 1500 },
  { id: 'smg', name: 'SMG', desc: 'Rapid fire, 32-round magazine.', price: 1200 },
  { id: 'shotgun', name: 'SHOTGUN', desc: 'Huge close-range damage.', price: 1800 },
  { id: 'vest', name: 'BODY ARMOUR', desc: '+50 armor. Absorbs damage before your health.', price: 500 },
  { id: 'ammo', name: 'AMMO RESTOCK', desc: 'Refill every weapon to full reserve.', price: 150 },
];
// --- missions ----------------------------------------------------------------
export const MISSIONS = [
  { id: 0, title: 'NEON TIDE', sub: 'Mission 1 of 6 — Rico is back', obj: 'Meet Lena at Sundial Plaza, then make the drop.', pay: 400, rep: 1 },
  { id: 1, title: 'SALT AND SMOKE', sub: 'Mission 2 of 6 — Street race', obj: 'Win the 3-lap race through 8 gates. Beat all 3 rivals.', pay: 1200, rep: 2 },
  { id: 2, title: 'THE LONG WAY HOME', sub: 'Mission 3 of 6 — A clean car', obj: 'Steal any parked car and deliver it to Tideworks Customs.', pay: 700, rep: 1 },
  { id: 3, title: 'THE CANNERY JOB', sub: 'Mission 4 of 6 — Hit Kane where it hurts', obj: 'Grab the ledger in Old Cannery and escape the 3-star heat.', pay: 2000, rep: 2 },
  { id: 4, title: 'HOUSE ALWAYS WINS', sub: 'Mission 5 of 6 — The casino vault', obj: 'Crack the Neon Casino vault, then escape the heat.', pay: 3000, rep: 2 },
  { id: 5, title: 'NEON TIDE', sub: 'Mission 6 of 6 — End it on the street', obj: 'Ram Victor Kane\u2019s convoy car, then return to the plaza.', pay: 5000, rep: 3 },
];
export const FISH = [
  { name: 'Bay Sardine', w: [0.2, 0.6], price: 12 }, { name: 'Neon Mackerel', w: [0.5, 1.4], price: 30 },
  { name: 'Golden Snapper', w: [1.2, 3.1], price: 85 }, { name: 'Ghost Eel', w: [2.0, 4.5], price: 160 },
];
export const RADIO = [
  { name: 'NEON FM', tracks: ['Midnight Cruise — Tide & Co.', 'Pink Horizon — VELVET RAY', 'Bay Lights — DJ Marlowe'] },
  { name: 'TIDE 104', tracks: ['Lowrider Anthem — Big Sal', 'Harbor Nights — The Currents', 'Sunset Run — KAIRO'] },
  { name: 'VOLT RADIO', tracks: ['Neon Static — PULSEWAVE', 'After Dark — NOVA REY', 'City of Glass — Marlow & Fenn'] },
];
// --- mutable live state --------------------------------------------------------
export const G = {
  scene: null, camera: null, renderer: null, clock: null,
  started: false, paused: false, over: false, mode: 'title', // title|play|pause|busted|wasted|map|shop
  time: 8 * 3600, day: 1, // game clock seconds
  cash: CFG.startCash, respect: 1, respectPts: 0,
  health: 100, armor: 0, wanted: 0, heat: 0, inSight: false, coolTimer: 0,
  player: null, vehicle: null, // vehicle = car object when driving
  cars: [], peds: [], cops: [], roadblocks: [], heli: null,
  colliders: [], // {x0,z0,x1,z1}
  keys: {}, pressed: {}, mouseDX: 0, mouseDY: 0, firing: false,
  weapons: [{ name: 'Pistol', mag: 12, reserve: 60 }, { name: 'SMG', mag: 32, reserve: 128 }, { name: 'Shotgun', mag: 6, reserve: 24 }],
  weaponIdx: 0,
  missionIdx: 0, missionStep: 0, missionHold: 0, missionState: 'idle', missionTimer: 0, missionProg: 0, missionTarget: null,
  race: null, courier: null, packages: [], packagesFound: 0,
  stats: { carsStolen: 0, starsLost: 0, knockouts: 0, raceWins: 0, bestLap: 0, kmDriven: 0, jobsDone: 0, fishCaught: 0, fishSold: 0, baskets: 0, casinoWon: 0 },
  weaponIdx: 0, owned: {}, upgrades: {}, rep: 0, patrolCars: [], policeHeli: null, gameOver: null,
  dialog: null, districtName: 'SUNDIAL SQUARE', nearestCar: null,
  radioOn: false, station: 0, stationName: '—',
  fish: null, hoops: null, casino: null,
  errors: [], fps: 60, frame: 0,
  camYaw: 0, camPitch: 0.38, camDist: 9, camLock: null,
  audio: null, radioIdx: 0, trackIdx: 0, chaseMusic: false,
  shot: null, seed: 1, ready: false,
  dialogTimer: 0, toastTimer: 0,
  touch: { x: 0, y: 0 },
  nitro: 100,
};
export function logError(where, err) { G.errors.push(where + ': ' + (err && err.message ? err.message : String(err))); if (G.errors.length > 40) G.errors.shift(); }
