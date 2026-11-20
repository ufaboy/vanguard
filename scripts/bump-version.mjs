/** Increments the patch (default) or minor (--minor) version in package.json. */
import fs from 'node:fs';
import path from 'node:path';

const isMinor = process.argv.includes('--minor');
const root = process.cwd();
const pkgPath = path.join(root, 'package.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const parts = String(pkg.version || '0.0.0').split('.').map((n) => Number.parseInt(n, 10));
if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
  throw new Error(`Invalid semver in package.json: ${pkg.version}`);
}

const prevVersion = pkg.version;
const nextVersion = isMinor
  ? `${parts[0]}.${parts[1] + 1}.0`
  : `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
pkg.version = nextVersion;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

console.log(`Version bumped: ${prevVersion} -> ${nextVersion}`);

