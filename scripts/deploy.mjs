/** Runs Cloudflare Pages deploy while loading per-project `.env` variables if present. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const vars = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) vars[key] = val;
  }
  return vars;
}

const isPreview = process.argv.includes('--preview');
const env = { ...process.env, ...loadDotEnv(path.resolve(process.cwd(), '.env')) };
const args = [
  'wrangler',
  'pages',
  'deploy',
  'public',
  '--project-name=iron-vanguard',
  ...(isPreview ? [] : ['--branch=main']),
  '--commit-dirty=true',
];

const res = spawnSync('npx', args, { stdio: 'inherit', shell: true, env });
process.exit(res.status ?? 1);

