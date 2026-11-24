// AZURA BAY — Neon Tide: dossier screenshots. Loads each staged scene (?shot=) in a
// headless Chrome shell over CDP (Node 22 built-ins only) and captures 4 JPEGs into
// screenshots/: 1-chase, 2-street, 3-race, 4-title. Each must stay under 256 KiB —
// the quality drops if a shot is too big. Usage: node tools/shots.js
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const PORT = 8932;
const SHELL = process.env.CHROME_HEADLESS_SHELL || '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const CDP_PORT = 9334;
const SHOTS = [
  { name: 'chase', file: '1-chase.jpg', w: 1280, h: 800 },
  { name: 'street', file: '2-street.jpg', w: 1280, h: 800 },
  { name: 'race', file: '3-race.jpg', w: 1280, h: 800 },
  { name: 'title', file: '4-title.jpg', w: 1280, h: 800 },
];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  mkdirSync(join(repo, 'screenshots'), { recursive: true });
  const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: repo, stdio: 'ignore' });
  const chrome = spawn(SHELL, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${CDP_PORT}`, '--disable-frame-rate-limit', '--run-all-compositor-stages-before-draw', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
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
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params = {}) => new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
    const evalJs = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      return r.result && r.result.result ? r.result.result.value : undefined;
    };
    await send('Runtime.enable');
    await send('Page.enable');
    for (const shot of SHOTS) {
      await send('Emulation.setDeviceMetricsOverride', { width: shot.w, height: shot.h, deviceScaleFactor: 1, mobile: false });
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?shot=${shot.name}&seed=20261124` });
      let ready = false;
      for (let i = 0; i < 40; i++) { await sleep(500); if (await evalJs(`window.__shotReady === true`)) { ready = true; break; } }
      if (!ready) { console.log(`  WARN ${shot.name}: __shotReady never set, capturing anyway`); }
      await sleep(1200); // let the frame settle
      let quality = 82;
      for (let attempt = 0; attempt < 3; attempt++) {
        const cap = await send('Page.captureScreenshot', { format: 'jpeg', quality });
        const buf = Buffer.from(cap.result.data, 'base64');
        writeFileSync(join(repo, 'screenshots', shot.file), buf);
        const size = statSync(join(repo, 'screenshots', shot.file)).size;
        console.log(`  ${shot.file}: ${size} B (quality ${quality})${size <= 262144 ? '' : ' — TOO BIG, retrying'}`);
        if (size <= 262144) break;
        quality -= 18;
      }
    }
    ws.close();
  } finally {
    chrome.kill('SIGKILL');
    server.kill('SIGKILL');
  }
  console.log('SHOTS DONE');
}
main().catch((e) => { console.error('SHOTS CRASH:', e.message); process.exit(2); });
