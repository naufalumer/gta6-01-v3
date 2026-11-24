// AZURA BAY — Neon Tide: controls. Keyboard + mouse look + touch joystick. F enters
// and exits vehicles, E interacts, Q switches the radio, M opens the map, Esc pauses,
// 1/2/3 swap weapons, R reloads. The camera is a third-person chase cam with mouse
// orbit; touch drag orbits it too.
import { G } from './config.js';
import { nearestCar, enterVehicle, exitVehicle } from './vehicles.js';
import { reloadWeapon } from './people.js';
import { toggleMap, togglePause, openShop } from './hud.js';
import { shopNear, tryBoardHeli } from './activities.js';
import { SFX } from './audio.js';

export function initInput() {
  window.addEventListener('keydown', (e) => {
    SFX.init(); // resume the audio context on the first user gesture
    if (e.repeat) return;
    G.keys[e.code] = true; G.pressed[e.code] = true;
    if (e.code === 'KeyM') toggleMap();
    if (e.code === 'Escape') togglePause();
    if (e.code === 'KeyQ') SFX.nextStation();
    if (e.code === 'Digit1') G.weaponIdx = 0;
    if (e.code === 'Digit2' && G.weapons[1].reserve > 0) G.weaponIdx = 1;
    if (e.code === 'Digit3' && G.weapons[2].reserve > 0) G.weaponIdx = 2;
    if (e.code === 'KeyR') reloadWeapon();
    if (e.code === 'KeyF') handleEnterExit();
    if (e.code === 'KeyE') handleInteract();
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });
  window.addEventListener('blur', () => { G.keys = {}; });
  // mouse look: drag to orbit, click to fire
  let dragging = false, lx = 0, ly = 0;
  const cv = G.renderer.domElement;
  cv.addEventListener('mousedown', (e) => { SFX.init(); dragging = true; lx = e.clientX; ly = e.clientY; G.firing = true; });
  window.addEventListener('mouseup', () => { dragging = false; G.firing = false; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    G.camYaw += (e.clientX - lx) * 0.004; // drag right: view turns right
    G.camPitch = Math.max(0.08, Math.min(0.9, G.camPitch + (e.clientY - ly) * 0.003));
    lx = e.clientX; ly = e.clientY;
  });
  // touch: left joystick + buttons
  const joy = document.getElementById('joy'), stick = document.getElementById('stick');
  let joyId = null, joyCx = 0, joyCy = 0;
  const joyStart = (e) => {
    const t = e.changedTouches[0];
    joyId = t.identifier;
    const r = joy.getBoundingClientRect();
    joyCx = r.left + r.width / 2; joyCy = r.top + r.height / 2;
  };
  const joyMove = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      let dx = (t.clientX - joyCx) / 45, dy = (t.clientY - joyCy) / 45;
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      G.touch.x = dx; G.touch.y = dy;
      stick.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
    }
    e.preventDefault();
  };
  const joyEnd = (e) => {
    for (const t of e.changedTouches) if (t.identifier === joyId) { joyId = null; G.touch.x = 0; G.touch.y = 0; stick.style.transform = 'translate(0,0)'; }
  };
  joy.addEventListener('touchstart', joyStart, { passive: false });
  joy.addEventListener('touchmove', joyMove, { passive: false });
  joy.addEventListener('touchend', joyEnd);
  const bindBtn = (id, down, up) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); down(); }, { passive: false });
    if (up) el.addEventListener('touchend', (e) => { e.preventDefault(); up(); }, { passive: false });
  };
  bindBtn('btn-fire', () => { G.firing = true; }, () => { G.firing = false; });
  bindBtn('btn-jump', () => { G.touch.jump = true; }, () => { G.touch.jump = false; });
  bindBtn('btn-enter', () => handleEnterExit());
  bindBtn('btn-use', () => handleInteract());
  bindBtn('btn-drift', () => { G.touch.drift = true; }, () => { G.touch.drift = false; });
  // show touch controls on touch devices
  if ('ontouchstart' in window) document.getElementById('touch').style.display = 'block';
  // drag on the right half of the screen orbits the camera on touch
  let camId = null, cx0 = 0, cy0 = 0;
  cv.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (t.clientX > window.innerWidth / 2 && camId === null) { camId = t.identifier; cx0 = t.clientX; cy0 = t.clientY; }
    }
  }, { passive: true });
  cv.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === camId) {
        G.camYaw -= (t.clientX - cx0) * 0.006;
        G.camPitch = Math.max(0.08, Math.min(0.9, G.camPitch + (t.clientY - cy0) * 0.004));
        cx0 = t.clientX; cy0 = t.clientY;
      }
    }
  }, { passive: true });
  cv.addEventListener('touchend', (e) => { for (const t of e.changedTouches) if (t.identifier === camId) camId = null; });
}
function handleEnterExit() {
  if (!G.started || G.gameOver) return;
  if (G.heli) return; // landing with F is handled in activities when low
  if (G.vehicle) { exitVehicle(); return; }
  if (tryBoardHeli()) return; // a helipad beats a nearby parked car
  const car = nearestCar(4.5);
  if (car) enterVehicle(car);
}
function handleInteract() {
  if (!G.started || G.gameOver) return;
  if (G.vehicle || G.heli) return;
  const shop = shopNear();
  if (shop) { openShop(shop); return; }
  // fishing / basketball / casino are driven by E in activities.js via G.pressed
}
export function endFrameInput() { G.pressed = {}; }
