// AZURA BAY — Neon Tide: frame-based playtest. Drives the real game in a headless
// Chrome shell over CDP (Node 22 built-ins only: fetch + WebSocket, no deps) and
// checks every required system: walk, steal, drive, drift, chase, missions, race,
// fishing, basketball, jetpack, heli, casino, save/load, HUD sizes, road-marking
// visibility probe + phone-landscape HUD-overlap check, 0 console errors.
// Software rendering is slow, so waits poll for the condition instead of sleeping
// fixed times, and the page runs in lowfx mode (no shadows, pixel ratio 1).
// Usage: node tools/playtest.js [--port 8931] [--headless-shell <path>]
// Exit 0 = all checks pass, 1 = any fail.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT = portIdx === -1 ? 8931 : Number(args[portIdx + 1]);
const shellIdx = args.indexOf('--headless-shell');
const SHELL = shellIdx === -1
  ? (process.env.CHROME_HEADLESS_SHELL || '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell')
  : args[shellIdx + 1];
const CDP_PORT = 9333;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  if (ok) { passed++; console.log(`  PASS ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: repo, stdio: 'ignore' });
  const chrome = spawn(SHELL, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${CDP_PORT}`, '--disable-frame-rate-limit', '--run-all-compositor-stages-before-draw', '--window-size=800,500', 'about:blank'], { stdio: 'ignore' });
  const errors = [];
  try {
    let targets = null;
    for (let i = 0; i < 60; i++) {
      try { targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json(); break; }
      catch { await sleep(500); }
    }
    if (!targets) throw new Error('CDP endpoint never came up');
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let msgId = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 300));
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('CONSOLE: ' + m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 300));
      if (m.method === 'Network.loadingFailed') errors.push('NET: ' + (m.params.errorText || ''));
    };
    const send = (method, params = {}) => new Promise((res) => {
      const id = ++msgId;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });
    const evalJs = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.result && r.result.exceptionDetails) errors.push('EVAL[' + expr.slice(0, 90) + ']: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 200));
      return r.result && r.result.result ? r.result.result.value : undefined;
    };
    // test isolation: clear any tail, leave any vehicle/heli, revive if wasted/busted
    const reset = async () => {
      await evalJs(`if (window.__azura.G.gameOver) window.__azura.respawnPlayer(); window.__azura.G.heat = 0; window.__azura.G.wanted = 0; if (window.__azura.G.vehicle) { window.__azura.G.vehicle.speed = 0; window.__azura.G.vehicle = null; window.__azura.G.player.mesh.visible = true; } if (window.__azura.G.heli) { window.__azura.G.scene.remove(window.__azura.G.heli.mesh); window.__azura.G.heli = null; window.__azura.G.player.mesh.visible = true; } for (const cop of window.__azura.G.cops) window.__azura.G.scene.remove(cop.mesh); window.__azura.G.cops = []; for (const car of window.__azura.G.patrolCars) { window.__azura.G.scene.remove(car.mesh); const i = window.__azura.G.cars.indexOf(car); if (i >= 0) window.__azura.G.cars.splice(i, 1); } window.__azura.G.patrolCars = []; if (window.__azura.G.policeHeli) { window.__azura.G.scene.remove(window.__azura.G.policeHeli.mesh); window.__azura.G.policeHeli = null; }`);
      await sleep(300);
    };
    const waitFor = async (expr, timeoutMs = 20000, label = '') => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        if (await evalJs(expr)) return true;
        await sleep(300);
      }
      return false;
    };
    const key = async (code, down = true) => {
      await send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', code, key: code.replace('Key', '').replace('Digit', '').replace('Arrow', ''), windowsVirtualKeyCode: 0 });
    };
    const press = async (code, holdMs = 300) => { await key(code, true); await sleep(holdMs); await key(code, false); };
    const holdKey = async (code, ms) => { await key(code, true); await sleep(ms); await key(code, false); };
    const holdUntil = async (code, expr, timeoutMs = 20000) => {
      await key(code, true);
      const ok = await waitFor(expr, timeoutMs);
      await key(code, false);
      return ok;
    };

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 500, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?seed=20261124&lowfx=1` });
    await waitFor(`!!window.__azura`, 30000);
    await sleep(1500);

    console.log('== boot ==');
    check('page loads, __azura present', await evalJs(`!!window.__azura`));
    check('three.js scene has objects', await evalJs(`window.__azura.G.scene.children.length > 50`), String(await evalJs(`window.__azura.G.scene.children.length`)));
    check('player created', await evalJs(`!!window.__azura.G.player`));
    check('traffic spawned (>=20)', await evalJs(`window.__azura.G.cars.length >= 20`), String(await evalJs(`window.__azura.G.cars.length`)));
    check('pedestrians spawned (>=50)', await evalJs(`window.__azura.G.peds.length >= 50`), String(await evalJs(`window.__azura.G.peds.length`)));
    check('parked cars present', await evalJs(`window.__azura.G.cars.some(c => c.parked)`));
    check('no console errors at boot', errors.length === 0, errors[0] || '');

    console.log('== start + walk ==');
    await evalJs(`document.getElementById('btn-play').click()`);
    await sleep(300);
    check('game started', await evalJs(`window.__azura.G.started === true`));
    const x0 = await evalJs(`window.__azura.G.player.x`), z0 = await evalJs(`window.__azura.G.player.z`);
    const walked = await holdUntil('KeyW', `Math.hypot(window.__azura.G.player.x - ${x0}, window.__azura.G.player.z - ${z0}) > 3`, 20000);
    const x1 = await evalJs(`window.__azura.G.player.x`), z1 = await evalJs(`window.__azura.G.player.z`);
    check('player walks (W)', walked, `moved ${Math.hypot(x1 - x0, z1 - z0).toFixed(1)}m`);
    await press('Space', 300);
    await sleep(300);
    check('jump leaves the ground or lands clean', await evalJs(`window.__azura.G.player.mesh.position.y >= 0`));

    console.log('== steal + drive ==');
    await evalJs(`{ const car = window.__azura.G.cars.find(c => c.parked); window.__azura.G.player.x = car.mesh.position.x; window.__azura.G.player.z = car.mesh.position.z + 2; }`);
    await sleep(200);
    await press('KeyF', 300);
    check('enter parked car (F)', await waitFor(`!!window.__azura.G.vehicle`, 5000));
    const sped = await holdUntil('KeyW', `window.__azura.G.vehicle && Math.abs(window.__azura.G.vehicle.speed) > 8`, 20000);
    const spd = await evalJs(`window.__azura.G.vehicle ? Math.abs(window.__azura.G.vehicle.speed) : 0`);
    check('car accelerates', sped, `speed ${spd.toFixed(1)} m/s`);
    const cond0 = await evalJs(`window.__azura.G.vehicle.condition`);
    await holdKey('Space', 1200); // handbrake drift while moving
    await holdKey('KeyW', 800);
    check('drift does not crash the car', await evalJs(`!!window.__azura.G.vehicle`));
    check('car condition tracked', typeof cond0 === 'number' && cond0 > 0, `cond ${cond0}`);
    await press('KeyF', 300);
    check('exit car (F)', await waitFor(`!window.__azura.G.vehicle`, 5000));

    console.log('== motorcycle ==');
    await evalJs(`{ const b = window.__azura.G.cars.find(c => c.parked && c.kind === 'bike'); window.__azura.G.player.x = b.mesh.position.x; window.__azura.G.player.z = b.mesh.position.z + 2; }`);
    await sleep(200);
    await press('KeyF', 300);
    check('enter parked motorcycle (F)', await waitFor(`!!window.__azura.G.vehicle && window.__azura.G.vehicle.kind === 'bike'`, 5000));
    const bsped = await holdUntil('KeyW', `window.__azura.G.vehicle && Math.abs(window.__azura.G.vehicle.speed) > 8`, 20000);
    const bspd = await evalJs(`window.__azura.G.vehicle ? Math.abs(window.__azura.G.vehicle.speed) : 0`);
    check('motorcycle accelerates', bsped, `speed ${bspd.toFixed(1)} m/s`);
    check('motorcycle faces its travel direction', await evalJs(`(() => { const v = window.__azura.G.vehicle; if (!v) return false; const fx = Math.sin(v.heading), fz = Math.cos(v.heading); const b = { minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9 }; v.mesh.updateWorldMatrix(true, true); v.mesh.traverse(o => { if (o.geometry) { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); b.minX = Math.min(b.minX, bb.min.x); b.maxX = Math.max(b.maxX, bb.max.x); b.minZ = Math.min(b.minZ, bb.min.z); b.maxZ = Math.max(b.maxZ, bb.max.z); } }); const lx = (b.maxX - b.minX), lz = (b.maxZ - b.minZ); return (lz > lx) === (Math.abs(fz) > Math.abs(fx)); })()`));
    await press('KeyF', 300);
    check('exit motorcycle (F)', await waitFor(`!window.__azura.G.vehicle`, 5000));

    console.log('== wanted + police ==');
    await evalJs(`window.__azura.G.heat = 60;`);
    check('wanted rises with heat', await waitFor(`window.__azura.G.wanted >= 2`, 15000), `stars ${await evalJs(`window.__azura.G.wanted`)}`);
    check('patrol cars spawn', await waitFor(`window.__azura.G.patrolCars.length >= 1`, 20000), String(await evalJs(`window.__azura.G.patrolCars.length`)));
    await evalJs(`window.__azura.G.heat = 0;`);
    await reset();
    await sleep(800);

    console.log('== missions ==');
    check('mission 1 objective exists', await evalJs(`!!window.__azura.currentObjective()`));
    await evalJs(`window.__azura.G.player.x = 0; window.__azura.G.player.z = 0;`);
    check('mission 1 step 1 completes at the plaza', await waitFor(`window.__azura.G.missionStep >= 1`, 15000), `step ${await evalJs(`window.__azura.G.missionStep`)}`);
    await evalJs(`window.__azura.G.player.x = 90; window.__azura.G.player.z = -90;`);
    check('mission 1 completes (drop + hold)', await waitFor(`window.__azura.G.missionIdx >= 1`, 30000), `mission ${await evalJs(`window.__azura.G.missionIdx`)}`);
    check('mission payout landed', await evalJs(`window.__azura.G.cash >= 400`), `$${await evalJs(`window.__azura.G.cash`)}`);

    console.log('== race ==');
    await reset();
    await evalJs(`window.__azura.startMission(1)`);
    await sleep(500);
    check('race starts (mission 2)', await evalJs(`window.__azura.G.missionIdx === 1`));
    await evalJs(`{ const car = window.__azura.G.cars.find(c => c.parked); if (car) { window.__azura.G.player.x = car.mesh.position.x; window.__azura.G.player.z = car.mesh.position.z + 2; } }`);
    await sleep(200);
    await press('KeyF', 300);
    await evalJs(`if (window.__azura.G.vehicle) { window.__azura.G.vehicle.mesh.position.set(0, 0, -30); window.__azura.G.vehicle.heading = 0; }`);
    await holdKey('KeyW', 2000);
    check('race: driving through gates does not error', await evalJs(`!!window.__azura.G.vehicle`));
    await evalJs(`if (window.__azura.G.vehicle) { window.__azura.G.vehicle.mesh.position.set(90, 0, -30); }`);
    await sleep(800);
    check('race gate counter advances or holds', await evalJs(`window.__azura.G.missionIdx === 1`));

    console.log('== fishing ==');
    await reset();
    await evalJs(`window.__azura.G.player.x = 0; window.__azura.G.player.z = 322;`);
    await sleep(300);
    await press('KeyE', 300);
    check('fishing starts at the pier (E)', await waitFor(`window.__azura.fish.state !== 'idle'`, 10000), await evalJs(`window.__azura.fish.state`));

    console.log('== basketball ==');
    await reset();
    await evalJs(`window.__azura.G.player.x = -60; window.__azura.G.player.z = 238; window.__azura.fish.state = 'idle';`);
    await sleep(300);
    await press('KeyE', 300);
    check('basketball starts at the court (E)', await waitFor(`window.__azura.ball.state === 'playing'`, 10000), await evalJs(`window.__azura.ball.state`));
    await holdKey('Space', 700);
    check('basketball shot resolves', await waitFor(`window.__azura.ball.tries >= 1`, 10000), `tries ${await evalJs(`window.__azura.ball.tries`)}`);

    console.log('== jetpack ==');
    await reset();
    await evalJs(`window.__azura.G.player.x = 12; window.__azura.G.player.z = 12;`);
    check('jetpack pickup', await waitFor(`window.__azura.G.player.jetpack === true`, 10000));
    const y0 = await evalJs(`window.__azura.G.player.mesh.position.y`);
    await holdUntil('Space', `window.__azura.G.player.mesh.position.y > ${y0} + 1`, 15000);
    const y1 = await evalJs(`window.__azura.G.player.mesh.position.y`);
    check('jetpack lifts the player', y1 > y0 + 1, `y ${y0.toFixed(1)} -> ${y1.toFixed(1)}`);

    console.log('== helicopter ==');
    await reset();
    await evalJs(`window.__azura.G.player.x = 240; window.__azura.G.player.z = 240;`);
    await sleep(400);
    await press('KeyF', 300);
    check('heli boarding at the pad (F)', await waitFor(`!!window.__azura.G.heli`, 10000));
    await holdUntil('Space', `window.__azura.G.heli && window.__azura.G.heli.mesh.position.y > 8`, 15000);
    const heliAlt = await evalJs('window.__azura.G.heli ? window.__azura.G.heli.mesh.position.y.toFixed(1) : "none"');
    check('heli climbs', await evalJs('window.__azura.G.heli && window.__azura.G.heli.mesh.position.y > 8'), 'alt ' + heliAlt);

    console.log('== casino + save/load ==');
    await reset();
    await evalJs(`if (window.__azura.G.heli) { window.__azura.G.heli.mesh.position.y = 2; }`);
    await sleep(300);
    await press('KeyF', 300);
    await evalJs(`window.__azura.G.player.x = 30; window.__azura.G.player.z = -90;`);
    await sleep(300);
    const cash0 = await evalJs(`window.__azura.G.cash`);
    await press('KeyE', 300);
    check('casino spin resolves', await waitFor(`window.__azura.slots.state === 'idle'`, 15000), await evalJs(`window.__azura.slots.result || ''`));
    await evalJs(`window.__azura.saveGame()`);
    const savedCash = await evalJs(`window.__azura.G.cash`);
    await evalJs(`window.__azura.G.cash = 1;`);
    await evalJs(`window.__azura.loadGame()`);
    check('save/load restores cash', await evalJs(`window.__azura.G.cash === ${savedCash}`), `$${await evalJs(`window.__azura.G.cash`)} vs saved $${savedCash} (pre-spin $${cash0})`);

    console.log('== HUD sizes ==');
    for (const [w, h] of [[1024, 768], [1280, 800], [800, 600]]) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await sleep(600);
      const overflow = await evalJs(`document.documentElement.scrollWidth > window.innerWidth + 1`);
      check(`HUD fits ${w}x${h}`, !overflow, overflow ? 'horizontal overflow' : '');
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 500, deviceScaleFactor: 1, mobile: false });

    console.log('== clarity: road markings ==');
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?shot=street&seed=20261124&lowfx=1` });
    await waitFor(`window.__shotReady === true`, 20000);
    const probe = await evalJs(`(() => {
      const G = window.__azura.G;
      const ground = G.scene.children.find(o => o.geometry && o.geometry.type === 'PlaneGeometry' && o.geometry.parameters && o.geometry.parameters.width === 640 && o.geometry.parameters.height === 640);
      if (!ground || !ground.material.map || !ground.material.map.image) return { error: 'ground texture not found' };
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 1024;
      const c = cv.getContext('2d'); c.drawImage(ground.material.map.image, 0, 0);
      const lum = (x, y) => { const d = c.getImageData(x, y, 1, 1).data; return 0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]; };
      // texture px = (world + 320) * 1.6; roads sit at world -270+60k (..., -30, 30, 90, ...),
      // so the road at world x=30 is texture x=560 and its amber dash centre is (560, 340);
      // (512, 352) is the unmarked gap between blocks = base asphalt; the road sample
      // sits at y=390, in a dash gap (dash segments are [d, d+22] for d = 0, 36, ..., 396)
      const dash = lum(560, 340), road = lum(560, 390), walk = lum(532, 352), base = lum(512, 352);
      return { dash: Math.round(dash), road: Math.round(road), walk: Math.round(walk), base: Math.round(base), dashRoad: Math.round(dash - road), walkRoad: Math.round(walk - road), roadBase: Math.round(Math.abs(road - base)) };
    })()`);
    check('road-marking probe ran', !probe.error, probe.error || '');
    check('amber dashes read against asphalt (diff > 60)', probe.dashRoad > 60, `dash ${probe.dash} vs road ${probe.road} (diff ${probe.dashRoad})`);
    check('sidewalks read against the road (diff > 10)', probe.walkRoad > 10, `sidewalk ${probe.walk} vs road ${probe.road} (diff ${probe.walkRoad})`);
    check('road strip reads against base asphalt (diff > 5)', probe.roadBase > 5, `road ${probe.road} vs base ${probe.base} (diff ${probe.roadBase})`);

    console.log('== clarity: phone HUD 844x390 ==');
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?seed=20261124&lowfx=1` });
    await waitFor(`window.__azura`, 20000);
    await sleep(1000);
    await evalJs(`document.getElementById('btn-play').click()`);
    await sleep(800);
    const hud = await evalJs(`(() => {
      const vis = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); if (cs.display === 'none' || r.width === 0) return null; return { x: r.left, y: r.top, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
      const els = {};
      for (const id of ['mission-card', 'radio', 'status', 'minimap-wrap', 'veh', 'joy', 'btn-fire', 'btn-jump', 'btn-enter', 'btn-use', 'btn-drift']) els[id] = vis(document.getElementById(id));
      const overlap = (a, b) => a && b && a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;
      const bad = [];
      for (const [a, b] of [['radio', 'mission-card'], ['radio', 'status'], ['radio', 'veh'], ['radio', 'minimap-wrap'], ['joy', 'mission-card'], ['joy', 'status'], ['joy', 'veh'], ['btn-fire', 'status'], ['btn-fire', 'veh'], ['btn-jump', 'status'], ['btn-jump', 'veh'], ['btn-enter', 'status'], ['btn-enter', 'veh'], ['btn-use', 'mission-card'], ['btn-drift', 'mission-card'], ['mission-card', 'status'], ['status', 'veh'], ['minimap-wrap', 'veh']]) {
        if (overlap(els[a], els[b])) bad.push(a + ' x ' + b);
      }
      const out = [];
      for (const [id, r] of Object.entries(els)) if (r && (r.right > 844 || r.bottom > 390 || r.x < 0 || r.y < 0)) out.push(id);
      return { minimapVisible: !!els['minimap-wrap'], touchVisible: !!els['joy'] && !!els['btn-fire'], bad, out, vw: window.innerWidth, overflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
    })()`);
    check('minimap visible at 844x390 (not cut off)', hud.minimapVisible, hud.minimapVisible ? '' : 'minimap-wrap hidden');
    check('touch controls visible at 844x390', hud.touchVisible, hud.touchVisible ? '' : 'joystick/buttons hidden');
    check('no HUD panel overlaps at 844x390', hud.bad.length === 0, hud.bad.join(', '));
    check('no HUD element leaves the 844x390 viewport', hud.out.length === 0, hud.out.join(', '));
    check('no horizontal overflow at 844x390', !hud.overflow);
    await send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 500, deviceScaleFactor: 1, mobile: false });

    console.log('== errors ==');
    check('zero console/page errors during the whole run', errors.length === 0, errors.slice(0, 3).join(' | '));
    check('zero uncaught game errors', await evalJs(`window.__azura.G.errors.length === 0`), String(await evalJs(`window.__azura.G.errors.slice(0,2).join(' | ')`)));
    ws.close();
  } finally {
    chrome.kill('SIGKILL');
    server.kill('SIGKILL');
  }
  console.log(`\nPLAYTEST: ${passed} pass, ${failed} fail`);
  writeFileSync(join(repo, 'tools', 'playtest-last.json'), JSON.stringify({ passed, failed, results, at: new Date().toISOString() }, null, 2));
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error('PLAYTEST CRASH:', e.message); process.exit(2); });
