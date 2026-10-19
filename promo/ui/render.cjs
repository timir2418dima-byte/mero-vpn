// Renders index.html frame by frame through headless Edge (Chrome DevTools Protocol), no npm deps.
// Usage: node render.js <url> <outDir> [fps=30] [duration=15] [onlyTimes=comma,list]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const [url, outDir, fpsArg, durArg, only] = process.argv.slice(2);
const FPS = +(fpsArg || 30), DUR = +(durArg || 15), PORT = 9334, SIZE = 1440;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mero-edge-'));
  const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${SIZE},${SIZE}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page'); } catch { await sleep(200); }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map(); const waiters = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) waiters.filter(w => w.method === m.method).forEach(w => { w.resolve(m); waiters.splice(waiters.indexOf(w), 1); });
  });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const once = method => new Promise(resolve => waiters.push({ method, resolve }));

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: SIZE, height: SIZE, deviceScaleFactor: 1, mobile: false });
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url });
  await loaded;
  await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true });

  const times = only ? only.split(',').map(Number) : Array.from({ length: Math.round(FPS * DUR) }, (_, f) => f / FPS);
  const t0 = Date.now();
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const r = await send('Runtime.evaluate', { expression: `render(${t}); 1`, returnByValue: true });
    if (r.result?.exceptionDetails) { console.error('render error at', t, JSON.stringify(r.result.exceptionDetails).slice(0, 400)); break; }
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 94, clip: { x: 0, y: 0, width: SIZE, height: SIZE, scale: 1 } });
    const name = only ? `t_${t.toFixed(2)}.jpg` : `f${String(i).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(outDir, name), Buffer.from(shot.result.data, 'base64'));
    if (!only && i % 60 === 0) console.log(`frame ${i}/${times.length}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  ws.close(); edge.kill();
  console.log(`done: ${times.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
