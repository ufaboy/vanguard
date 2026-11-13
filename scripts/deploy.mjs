/** Runs Cloudflare Pages deploy while loading per-project `.env` variables if present. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const EXCLUDED_FROM_DEPLOY = new Set(['codex.html']);

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
const publicDir = path.resolve(process.cwd(), 'public');

function runCheck(cmd, args, label) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: true, env });
  if (res.status !== 0) {
    console.error(`Deploy aborted: ${label} failed.`);
    process.exit(res.status ?? 1);
  }
}

if (!isPreview) {
  const gitStatus = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8', env });
  if (gitStatus.status !== 0 || gitStatus.stdout.trim().length > 0) {
    console.error('Deploy aborted: working tree must be clean before deploying to production.');
    process.exit(1);
  }
}

runCheck('npm', ['run', 'lint'], 'lint');
runCheck('npm', ['test'], 'tests');

const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'battle-tank-deploy-'));

let exitCode = 1;
try {
  fs.cpSync(publicDir, stagingDir, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(publicDir, src).replace(/\\/g, '/');
      return !EXCLUDED_FROM_DEPLOY.has(rel);
    },
  });

  const args = [
    'wrangler',
    'pages',
    'deploy',
    stagingDir,
    '--project-name=battle-tank',
    ...(isPreview ? ['--commit-dirty=true'] : ['--branch=main']),
  ];

  const res = spawnSync('npx', args, { stdio: 'inherit', shell: true, env });
  exitCode = res.status ?? 1;
} finally {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}

process.exit(exitCode);

