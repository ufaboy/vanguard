import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const damageUi = process.argv.includes('--damage-ui');
const damage = process.argv.includes('--damage') || damageUi;
const mountains = process.argv.includes('--mountains');
const sand = process.argv.includes('--sand');
const ice = process.argv.includes('--ice');
const water = process.argv.includes('--water') || ice;
const hangar = process.argv.includes('--hangar');
const home = process.argv.includes('--home');
const hero = process.argv.includes('--hero');
const mobile = process.argv.includes('--mobile');
const output = path.join(root, damage ? 'artifacts/component-damage' : mountains ? 'artifacts/mountain-smoke' : sand ? 'artifacts/sand-smoke' : ice ? 'artifacts/ice-smoke' : water ? 'artifacts/water-smoke' : hero ? 'artifacts/home-art' : home ? 'artifacts/home-smoke' : hangar ? 'artifacts/hangar-smoke' : 'artifacts/brick-benchmark');
await mkdir(output, { recursive: true });
let finish;
const completed = new Promise(resolve => { finish = resolve; });
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const value = JSON.parse(body);
      if (url.pathname === '/__screenshot') {
        await writeFile(path.join(output, `damaged${process.argv.includes('--software') ? '-software' : ''}.png`), Buffer.from(value.image.split(',')[1], 'base64'));
      } else if (url.pathname === '/__results') finish(value);
      else console.log(body);
      res.end('OK');
      return;
    }
    if (url.pathname === '/__damage-ui.html') {
      res.setHeader('Content-Type', 'text/html');
      res.end((await readFile('public/campaign.html', 'utf8')).replace('./src/main.js', '/__damage-ui.js')); return;
    }
    if (url.pathname === '/__damage.html') {
      res.setHeader('Content-Type', 'text/html');
      res.end((await readFile('scripts/brick-benchmark.html', 'utf8')).replace('/__brick-benchmark.js', '/__damage.js')); return;
    }
    if (url.pathname === '/__home-smoke.html' || url.pathname === '/__hangar-smoke.html') {
      res.setHeader('Content-Type', 'text/html');
      const template = home ? 'public/index.html' : 'public/hangar.html';
      res.end((await readFile(template, 'utf8')).replace('</body>', `<script type="module" src="/${home ? '__home-smoke.js' : '__hangar-smoke.js'}"></script></body>`));
      return;
    }
    if (url.pathname === '/__mountains.html') {
      res.setHeader('Content-Type', 'text/html');
      res.end((await readFile('scripts/brick-benchmark.html', 'utf8')).replace('/__brick-benchmark.js', '/__mountains.js')); return;
    }
    if (url.pathname === '/__sand.html') {
      res.setHeader('Content-Type', 'text/html');
      res.end((await readFile('scripts/brick-benchmark.html', 'utf8')).replace('/__brick-benchmark.js', '/__sand.js')); return;
    }
    if (url.pathname === '/__water.html') {
      res.setHeader('Content-Type', 'text/html');
      res.end((await readFile('scripts/brick-benchmark.html', 'utf8')).replace('/__brick-benchmark.js', '/__water.js')); return;
    }
    if (url.pathname === '/__hero.html') {
      res.setHeader('Content-Type', 'text/html');
      res.end((await readFile('scripts/brick-benchmark.html', 'utf8')).replace('/__brick-benchmark.js', '/__hero.js')); return;
    }
    const special = { '/__damage-ui.js': 'scripts/component-damage-ui-smoke.js', '/__damage.js': 'scripts/component-damage-smoke.js', '/__mountains.js': 'scripts/mountain-smoke.js', '/__sand.js': 'scripts/sand-smoke.js', '/__water.js': 'scripts/water-smoke.js', '/__hero.js': 'scripts/home-art.js', '/__home-smoke.js': 'scripts/home-smoke.js', '/__brick-benchmark.html': 'scripts/brick-benchmark.html', '/__brick-benchmark.js': 'scripts/brick-benchmark.js', '/__hangar-smoke.js': 'scripts/hangar-smoke.js' };
    const file = path.resolve(root, special[url.pathname] || `public${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(root + path.sep)) throw Error('Invalid path');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch (error) { res.statusCode = 404; res.end(error.message); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/${damageUi ? '__damage-ui.html' : damage ? '__damage.html' : mountains ? '__mountains.html' : sand ? '__sand.html' : water ? '__water.html' : hero ? '__hero.html' : home ? '__home-smoke.html' : hangar ? '__hangar-smoke.html' : '__brick-benchmark.html'}${ice ? '?surface=ice' : ''}`;
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const args = ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  `--user-data-dir=${path.join(output, `chrome-profile-${process.pid}`)}`, '--window-size=1280,900', mobile ? 'about:blank' : url];
if (process.argv.includes('--software')) args.unshift('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
const child = spawn(chrome, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let devtools;
let emulationSocket;
let errors = '';
child.stderr.on('data', bytes => {
  errors = (errors + bytes).slice(-8000);
  const match = bytes.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
  if (match && !devtools) {
    devtools = match[1];
    if (mobile) (async () => {
      const pages = await (await fetch(`http://127.0.0.1:${new URL(devtools).port}/json/list`)).json();
      const socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
      emulationSocket = socket;
      await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
      socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.id === 1) socket.send(JSON.stringify({ id: 2, method: 'Page.navigate', params: { url } }));
      });
      socket.send(JSON.stringify({ id: 1, method: 'Emulation.setDeviceMetricsOverride', params: { width: 390, height: 844, deviceScaleFactor: 1, mobile: false } }));
    })().catch(error => finish({ error: error.stack }));
  }
});
child.on('error', error => finish({ error: error.message }));
child.on('exit', code => { if (!devtools) finish({ error: `Chrome exited before DevTools was ready (${code}). ${errors}` }); });
const timeout = setTimeout(() => finish({ error: 'Benchmark timed out after 240 seconds' }), 240000);
try {
  const result = await completed;
  clearTimeout(timeout);
  const suffix = mobile ? '-mobile' : process.argv.includes('--software') ? '-software' : '';
  await writeFile(path.join(output, `results${suffix}.json`), JSON.stringify(result, null, 2));
  if (devtools && !sand && !mountains) {
    const port = new URL(devtools).port;
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(page => page.url === url);
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    const response = new Promise(resolve => socket.addEventListener('message', event => {
      const message = JSON.parse(event.data); if (message.id === 1) resolve(message);
    }));
    socket.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } }));
    const shot = await response;
    if (shot.result) await writeFile(path.join(output, `${home ? 'home' : hangar ? 'hangar' : 'mission-01'}${suffix}.png`), Buffer.from(shot.result.data, 'base64'));
    socket.close();
  }
  console.log(JSON.stringify(result));
  if (result.error) process.exitCode = 1;
} finally {
  emulationSocket?.close();
  clearTimeout(timeout);
  child.kill();
  server.close();
}
