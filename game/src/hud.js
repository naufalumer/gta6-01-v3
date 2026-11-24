// AZURA BAY — Neon Tide: the interface. A dense, tidy HUD (wanted stars, cash, respect,
// patrol list, minimap, speedometer, health/armor, mission tracker, radio, dialog),
// plus the full map screen with named districts and lifetime stats, shops, pause,
// busted/wasted screens and the title screen. All DOM, updated from game state.
import { G, CFG, DISTRICTS, MISSIONS, RADIO, fmtTime, fmtMoney, clamp, dist2 } from './config.js';
import { currentObjective, raceHudInfo } from './missions.js';
import { SHOP, buyItem, fish, ball, slots } from './activities.js';
import { saveGame } from './activities.js';

const $ = (id) => document.getElementById(id);
let mapOpen = false, shopOpen = null, paused = false;
const RESPECT_TITLES = ['Nobody', 'Street Kid', 'Hustler', 'Wheelman', 'Made', 'Bay Legend'];

function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }
export function respectLevel() { return clamp(Math.floor(G.rep / 2), 0, 5); }

export function initHud() {
  $('btn-resume').onclick = () => { paused = false; $('pause').style.display = 'none'; };
  $('btn-save').onclick = () => { saveGame(); $('btn-save').textContent = 'SAVED ✓'; setTimeout(() => $('btn-save').textContent = 'SAVE GAME', 1200); };
  $('btn-restart').onclick = () => location.reload();
  $('btn-quit').onclick = () => { paused = false; $('pause').style.display = 'none'; showTitle(true); };
  $('btn-close-map').onclick = () => { mapOpen = false; $('map').style.display = 'none'; };
  $('btn-close-shop').onclick = () => { shopOpen = null; $('shop').style.display = 'none'; };
  $('btn-play').onclick = () => { $('title').style.display = 'none'; G.started = true; };
  $('btn-how').onclick = () => { $('howto').style.display = $('howto').style.display === 'none' ? 'block' : 'none'; };
  $('btn-how-close').onclick = () => { $('howto').style.display = 'none'; };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-buy]');
    if (el && shopOpen) {
      const ok = buyItem(shopOpen, parseInt(el.dataset.buy, 10));
      el.style.opacity = ok ? '1' : '0.5';
      renderShop(shopOpen);
      updateHud(0);
    }
  });
}
export function showTitle(show) { $('title').style.display = show ? 'flex' : 'none'; if (show) G.started = false; }
export function isPaused() { return paused || mapOpen || shopOpen || !G.started || !!G.gameOver; }
export function togglePause() { if (G.started && !mapOpen && !shopOpen) { paused = !paused; $('pause').style.display = paused ? 'flex' : 'none'; } }
export function toggleMap() {
  if (!G.started || shopOpen) return;
  mapOpen = !mapOpen;
  $('map').style.display = mapOpen ? 'flex' : 'none';
  if (mapOpen) renderMap();
}
export function openShop(kind) {
  shopOpen = kind;
  $('shop').style.display = 'flex';
  renderShop(kind);
}
export function renderShop(kind) {
  $('shop-title').textContent = kind === 'garage' ? 'TIDEWORKS CUSTOMS — GARAGE' : 'DOCKSIDE ARMS — GUN SHOP';
  $('shop-cash').textContent = fmtMoney(G.cash);
  const list = SHOP[kind].map((it, i) => {
    const owned = (it.id === 'tune1' && G.upgrades.tune1) || (it.id === 'tune2' && G.upgrades.tune2) || (it.id === 'nitro' && G.upgrades.nitro);
    const afford = G.cash >= it.price && !owned;
    return `<div class="shop-item${afford ? '' : ' dim'}"><div><b>${it.name}</b><span>${it.desc}</span></div><button data-buy="${i}" ${afford ? '' : 'disabled'}>${owned ? 'OWNED' : 'BUY $' + it.price}</button></div>`;
  }).join('');
  $('shop-list').innerHTML = list;
}
function renderMap() {
  const rl = respectLevel();
  $('map-stats').innerHTML = `
    <div class="map-row"><b>RESPECT</b><span>Lv ${rl} — ${RESPECT_TITLES[rl]}</span></div>
    <div class="map-row"><b>CASH</b><span>${fmtMoney(G.cash)}</span></div>
    <div class="map-row"><b>MISSIONS</b><span>${Math.min(G.missionIdx, 6)} / 6 complete</span></div>
    <div class="map-row"><b>CARS STOLEN</b><span>${G.stats.carsStolen}</span></div>
    <div class="map-row"><b>RACE WINS</b><span>${G.stats.raceWins}</span></div>
    <div class="map-row"><b>BEST LAP</b><span>${G.stats.bestLap ? G.stats.bestLap.toFixed(1) + 's' : '—'}</span></div>
    <div class="map-row"><b>KNOCKOUTS</b><span>${G.stats.knockouts}</span></div>
    <div class="map-row"><b>KM DRIVEN</b><span>${G.stats.kmDriven.toFixed(1)}</span></div>
    <div class="map-row"><b>DAY</b><span>${G.day} — ${fmtTime(G.time)}</span></div>`;
  drawMapCanvas($('map-canvas'));
}
function drawMapCanvas(cv) {
  const c = cv.getContext('2d'), W = cv.width, H = cv.height;
  const sx = (x) => (x + 320) / 640 * W, sz = (z) => (z + 320) / 640 * H;
  c.fillStyle = '#10141f'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#e8d5a2'; c.fillRect(sx(-320), sz(210), W, H - sz(210));
  c.fillStyle = '#1d6f8e'; c.fillRect(sx(-320), sz(320), W, 20);
  c.strokeStyle = '#3a3f4a'; c.lineWidth = 5;
  for (let g = -270; g <= 270; g += 60) {
    c.beginPath(); c.moveTo(sx(g), 0); c.lineTo(sx(g), H); c.stroke();
    c.beginPath(); c.moveTo(0, sz(g)); c.lineTo(W, sz(g)); c.stroke();
  }
  c.font = 'bold 11px Inter, Arial'; c.textAlign = 'center';
  for (const d of DISTRICTS) { c.fillStyle = d.color; c.fillText(d.name, sx(d.x), sz(d.z)); }
  const obj = currentObjective();
  if (obj && obj.step.x !== undefined) {
    c.fillStyle = '#ff2e88'; c.beginPath(); c.arc(sx(obj.step.x), sz(obj.step.z), 7, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 10px Arial'; c.fillText('◆', sx(obj.step.x), sz(obj.step.z) + 3);
  }
  for (const cop of G.cops) { if (cop.down) continue; c.fillStyle = '#2266ff'; c.fillRect(sx(cop.x) - 2, sz(cop.z) - 2, 4, 4); }
  for (const car of G.patrolCars) { c.fillStyle = '#ff2222'; c.fillRect(sx(car.mesh.position.x) - 3, sz(car.mesh.position.z) - 3, 6, 6); }
  c.fillStyle = '#37e08b'; c.beginPath(); c.arc(sx(G.player.x), sz(G.player.z), 6, 0, 7); c.fill();
  c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke();
}
export function updateHud(dt) {
  // top-left: mission card
  const obj = currentObjective();
  const mc = $('mission-card');
  if (obj) {
    const m = obj.mission;
    let extra = '';
    if (obj.step.type === 'hold' && G.missionHold > 0) extra = ` — ${Math.ceil(obj.step.t - G.missionHold)}s`;
    if (obj.step.type === 'race') { const r = raceHudInfo(); if (r) extra = ` — LAP ${r.lap}/3 · GATE ${r.gate}/${r.total}${r.best ? ' · BEST ' + r.best.toFixed(1) + 's' : ''}`; }
    if (obj.step.type === 'chase') extra = '';
    mc.innerHTML = `<b>${m.title}</b><span>Mission ${m.id + 1} of 6 — ${obj.step.text}${extra}</span>`;
    mc.style.display = 'block';
  } else {
    mc.innerHTML = `<b>NEON TIDE — COMPLETE</b><span>All six missions done. The bay is yours, Rico.</span>`;
    mc.style.display = 'block';
  }
  // top-right: clock, cash, wanted, respect, patrol list
  $('clock').textContent = fmtTime(G.time);
  $('cash').textContent = fmtMoney(G.cash);
  $('wanted').textContent = stars(G.wanted);
  $('wanted').className = 'wanted' + (G.wanted >= 3 ? ' hot' : '');
  const rl = respectLevel();
  $('respect').textContent = `Lv ${rl} ${RESPECT_TITLES[rl]}`;
  const near = G.patrolCars.slice(0, 4).map((c) => {
    const d = Math.round(Math.sqrt((c.mesh.position.x - G.player.x) ** 2 + (c.mesh.position.z - G.player.z) ** 2));
    const t = G.wanted >= 4 ? 'PIT' : G.wanted >= 3 ? 'ROADBLOCK' : d < 20 ? 'RAMMING' : 'PURSUE';
    return `<div>ABPD-${G.patrolCars.indexOf(c) + 1} · ${d}m · ${t}</div>`;
  }).join('');
  $('patrol').innerHTML = (G.wanted > 0 ? (near || '<div>Units en route…</div>') : '') + (G.policeHeli ? '<div>AIR-1 · overhead · SPOTLIGHT</div>' : '');
  $('insight').textContent = G.inSight ? 'IN SIGHT' : (G.wanted > 0 ? 'HIDDEN' : '');
  // bottom-left: minimap + district
  drawMapCanvas($('minimap'));
  $('district').textContent = G.districtName || 'SUNDIAL SQUARE';
  // bottom-right: weapon / car / speed
  const w = G.weapons[G.weaponIdx];
  $('weapon').textContent = `${w.name}  ${w.mag} / ${w.reserve}`;
  const car = G.vehicle;
  if (car) {
    $('carname').textContent = car.mesh.userData.def.name.toUpperCase();
    $('speed').textContent = Math.round(Math.abs(car.speed) * 3.6);
    $('cond').textContent = `COND ${Math.round(car.condition)}%`;
    $('nitrobar').style.width = G.nitro + '%';
    $('nitro').style.display = G.upgrades.nitro ? 'block' : 'none';
  } else if (G.heli) {
    $('carname').textContent = 'BAY HELI';
    $('speed').textContent = Math.round(Math.abs(G.heli.mesh.position.y));
    $('cond').textContent = `ALT ${Math.round(G.heli.mesh.position.y)}m`;
    $('nitro').style.display = 'none';
  } else {
    $('carname').textContent = 'ON FOOT';
    $('speed').textContent = '0';
    $('cond').textContent = G.player.jetpack ? `JETPACK ${Math.round(G.player.jetpackFuel)}%` : '';
    $('nitro').style.display = 'none';
  }
  $('healthbar').style.width = G.health + '%';
  $('armorbar').style.width = G.armor + '%';
  // radio
  $('radio').textContent = G.radioOn ? `♪ ${RADIO[G.station].name} — ${G.stationName}` : 'RADIO OFF — press Q';
  // dialog
  const dg = $('dialog');
  if (G.dialog && G.dialog.t > 0) {
    dg.style.display = 'block';
    $('dialog-name').textContent = G.dialog.name;
    $('dialog-text').textContent = G.dialog.text;
    G.dialog.t -= dt;
  } else dg.style.display = 'none';
  // activity bars
  const act = $('activity');
  if (fish.state === 'bite') {
    act.style.display = 'block';
    act.innerHTML = `<b>FISHING — keep the marker in the green!</b><div class="bar"><div class="bar-fill" style="width:${fish.reel * 100}%"></div><div class="bar-target" style="left:${fish.reelTarget * 100}%"></div></div>`;
  } else if (ball.state === 'playing') {
    act.style.display = 'block';
    act.innerHTML = `<b>BASKETBALL — ${Math.ceil(ball.timer)}s · SCORE ${ball.score} · made ${ball.made}/${ball.tries}</b><div class="bar"><div class="bar-fill" style="width:${ball.charge * 100}%"></div></div><span>hold SPACE to charge, release to shoot</span>`;
  } else if (slots.state === 'spin') {
    act.style.display = 'block';
    act.innerHTML = `<b>SLOTS</b><div class="slots">${slots.reels.join(' ')}</div>`;
  } else act.style.display = 'none';
  // interact prompt
  const pr = $('prompt');
  let prompt = '';
  if (!G.vehicle && !G.heli) {
    const nc = G.nearestCar;
    if (nc) prompt = 'F — STEAL ' + nc.mesh.userData.def.name.toUpperCase();
    else if (fish.state === 'idle' && dist2(G.player.x, G.player.z, 0, 318) < 14) prompt = 'E — CAST LINE (fishing)';
    else if (ball.state === 'idle' && dist2(G.player.x, G.player.z, -60, 238) < 12) prompt = 'E — PLAY BASKETBALL (60s challenge)';
    else if (dist2(G.player.x, G.player.z, 30, -90) < 12) prompt = 'E — PLAY SLOTS ($50)';
    else if (dist2(G.player.x, G.player.z, 150, 90) < 12) prompt = 'E — TIDEWORKS CUSTOMS (garage)';
    else if (dist2(G.player.x, G.player.z, -90, 30) < 12) prompt = 'E — DOCKSIDE ARMS (gun shop)';
    else if (dist2(G.player.x, G.player.z, 240, 240) < 8 || dist2(G.player.x, G.player.z, -240, -240) < 8) prompt = 'F — FLY HELICOPTER';
    else if (dist2(G.player.x, G.player.z, 12, 12) < 3 && !G.player.jetpack) prompt = 'WALK HERE — JETPACK PICKUP';
  } else if (G.vehicle) prompt = 'F — EXIT VEHICLE · SHIFT — NITRO · SPACE — DRIFT';
  else if (G.heli) prompt = 'SPACE — CLIMB · C — DESCEND · F — LAND';
  pr.textContent = prompt;
  pr.style.display = prompt ? 'block' : 'none';
  // busted / wasted
  const go = $('gameover');
  if (G.gameOver) {
    go.style.display = 'flex';
    $('go-title').textContent = G.gameOver === 'busted' ? 'BUSTED' : 'WASTED';
    $('go-sub').textContent = G.gameOver === 'busted' ? 'The ABPD caught you. -$250 bail.' : 'Rico is down. The bay keeps moving. -$250 hospital bill.';
  } else go.style.display = 'none';
}
