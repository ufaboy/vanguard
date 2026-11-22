/**
 * Runs one browser smoke test or benchmark in headless Chrome: `node scripts/browser-smoke.mjs <mode> [--software] [--mobile]`.
 * The page script reports through POST /__results (and optionally /__screenshot); output lands in artifacts/<mode output>/.
 * Set CHROME_PATH when Chrome is not at its default install location.
 */
import http from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ensureSite } from './site.mjs';

/**
 * Each mode: the page script it runs, its artifacts folder, and the page that hosts it. `site` pages come from the built
 * dist/site (`replace` swaps that script for the smoke script, otherwise the smoke script is appended); the rest use
 * smoke-canvas.html. `shot` names the final page screenshot (false skips it).
 */
const MISSION_1 = '?mission=campaign-01';
const MODES = {
  bricks: { script: 'brick-benchmark.js', output: 'brick-benchmark' },
  damage: { script: 'component-damage-smoke.js', output: 'component-damage' },
  'damage-ui': { script: 'component-damage-ui-smoke.js', output: 'component-damage', site: 'battlefield.html', replace: './src/main.js', query: MISSION_1 },
  mountains: { script: 'mountain-smoke.js', output: 'mountain-smoke', shot: false },
  sand: { script: 'sand-smoke.js', output: 'sand-smoke', shot: false },
  water: { script: 'water-smoke.js', output: 'water-smoke' },
  ice: { script: 'water-smoke.js', output: 'ice-smoke', query: '?surface=ice' },
  hero: { script: 'home-art.js', output: 'home-art' },
  home: { script: 'home-smoke.js', output: 'home-smoke', site: 'index.html', shot: 'home' },
  garage: { script: 'garage-smoke.js', output: 'garage-smoke', site: 'battlefield.html', replace: './src/main.js', query: MISSION_1, shot: 'garage' },
};

const modeName = process.argv[2];
const mode = MODES[modeName];
if (!mode) {
  console.error(`Usage: node scripts/browser-smoke.mjs <${Object.keys(MODES).join('|')}> [--software] [--mobile]`);
  process.exit(1);
}
const software = process.argv.includes('--software');
const mobile = process.argv.includes('--mobile');
const suffix = mobile ? '-mobile' : software ? '-software' : '';

const root = process.cwd();
const scriptsDir = path.join(root, 'scripts');
const output = path.join(root, 'artifacts', mode.output);
await mkdir(output, { recursive: true });

/** Ends the run at once when the smoke script fails to load or throws outside its own try/catch. */
const ERROR_GUARD = `<script>
addEventListener('error', event => {
  const error = event.error?.stack || event.message || \`Failed to load \${event.target?.src || 'resource'}\`;
  if (event.error || event.target?.src?.endsWith('/__smoke.js')) fetch('/__results', { method: 'POST', body: JSON.stringify({ error }) });
}, true);
</script>`;

async function pageHtml() {
  if (!mode.site) return (await readFile(path.join(scriptsDir, 'smoke-canvas.html'), 'utf8')).replace('<script', `${ERROR_GUARD}<script`);
  const html = await readFile(path.join(ensureSite(), mode.site), 'utf8');
  if (mode.replace && !html.includes(mode.replace)) throw Error(`${mode.site} no longer loads ${mode.replace}; update the ${modeName} mode`);
  return mode.replace
    ? html.replace('<head>', `<head>${ERROR_GUARD}`).replace(mode.replace, '/__smoke.js')
    : html.replace('</body>', `${ERROR_GUARD}<script type="module" src="/__smoke.js"></script></body>`);
}

let page;
try {
  page = await pageHtml();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

/**
 * Site modes serve the built dist/site (pages + a copy of public/) and resolve extensionless page links
 * (`/campaign` -> campaign.html) like Cloudflare Pages; canvas modes serve public/ directly.
 */
const staticRoot = mode.site ? ensureSite() : path.join(root, 'public');
function staticFile(pathname) {
  const file = path.resolve(staticRoot, `.${decodeURIComponent(pathname)}`);
  if (pathname.endsWith('/')) return path.join(file, 'index.html');
  return mode.site && !path.extname(file) && existsSync(`${file}.html`) ? `${file}.html` : file;
}

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
        await writeFile(path.join(output, `canvas${suffix}.png`), Buffer.from(value.image.split(',')[1], 'base64'));
      } else if (url.pathname === '/__results') finish(value);
      else console.log(body);
      res.end('OK');
      return;
    }
    if (url.pathname === '/__smoke.html') {
      res.setHeader('Content-Type', 'text/html');
      res.end(page);
      return;
    }
    const file = url.pathname === '/__smoke.js' ? path.join(scriptsDir, mode.script) : staticFile(url.pathname);
    if (!file.startsWith(root + path.sep)) throw Error('Invalid path');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch (error) { res.statusCode = 404; res.end(error.message); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/__smoke.html${mode.query || ''}`;

const defaultChrome = {
  win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
}[process.platform] || 'google-chrome';
const chrome = process.env.CHROME_PATH || defaultChrome;
const args = ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  `--user-data-dir=${path.join(output, `chrome-profile-${process.pid}`)}`, '--window-size=1280,900', mobile ? 'about:blank' : url];
if (software) args.unshift('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
const child = spawn(chrome, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });

/** Opens a DevTools socket to the first page target matching `predicate`. */
async function openPage(devtools, predicate) {
  const pages = await (await fetch(`http://127.0.0.1:${new URL(devtools).port}/json/list`)).json();
  const socket = new WebSocket(pages.find(predicate).webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  return socket;
}

let devtools;
let emulationSocket;
let errors = '';
child.stderr.on('data', bytes => {
  errors = (errors + bytes).slice(-8000);
  const match = bytes.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
  if (!match || devtools) return;
  devtools = match[1];
  if (!mobile) return;
  (async () => {
    const socket = emulationSocket = await openPage(devtools, page => page.type === 'page');
    socket.addEventListener('message', event => {
      if (JSON.parse(event.data).id === 1) socket.send(JSON.stringify({ id: 2, method: 'Page.navigate', params: { url } }));
    });
    socket.send(JSON.stringify({ id: 1, method: 'Emulation.setDeviceMetricsOverride', params: { width: 390, height: 844, deviceScaleFactor: 1, mobile: false } }));
  })().catch(error => finish({ error: error.stack }));
});
child.on('error', error => finish({ error: error.message }));
child.on('exit', code => { if (!devtools) finish({ error: `Chrome exited before DevTools was ready (${code}). ${errors}` }); });
const timeout = setTimeout(() => finish({ error: `${modeName} timed out after 240 seconds` }), 240000);

try {
  const result = await completed;
  clearTimeout(timeout);
  await writeFile(path.join(output, `results${suffix}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (result.error) process.exitCode = 1;
  if (devtools && mode.shot !== false) {
    try {
      // The page may rewrite its own URL (battlefield routing), so take the only page tab.
      const socket = await openPage(devtools, page => page.type === 'page');
      const response = new Promise(resolve => socket.addEventListener('message', event => {
        const message = JSON.parse(event.data); if (message.id === 1) resolve(message);
      }));
      socket.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } }));
      const shot = await response;
      if (shot.result) await writeFile(path.join(output, `${mode.shot || 'page'}${suffix}.png`), Buffer.from(shot.result.data, 'base64'));
      socket.close();
    } catch (error) {
      console.error(`Screenshot skipped: ${error.message}`);
    }
  }
} finally {
  emulationSocket?.close();
  clearTimeout(timeout);
  child.kill();
  server.close();
}
