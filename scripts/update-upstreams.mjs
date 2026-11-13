#!/usr/bin/env node
/**
 * Rebuild local file: dependencies and clear Vite's prebundle cache.
 *
 * Usage:
 *   npm run update:upstreams
 *   npm run update:upstreams -- mgl-web-ime          # one package
 *   npm run update:upstreams -- --dry-run
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const only = args.filter((a) => !a.startsWith('--'));

function resolveFileDep(spec) {
  if (typeof spec !== 'string' || !spec.startsWith('file:')) return null;
  return path.resolve(root, spec.slice('file:'.length));
}

function hasScript(depPkg, name) {
  return Boolean(depPkg?.scripts?.[name]);
}

function run(cmd, cwd, { optional = false } = {}) {
  console.log(`\n> ${cmd}  (in ${path.relative(root, cwd) || '.'})`);
  if (dryRun) return true;
  const r = spawnSync(cmd, { cwd, shell: true, stdio: 'inherit' });
  if (r.status !== 0) {
    if (optional) {
      console.warn(`(skipped — exit ${r.status})`);
      return false;
    }
    process.exit(r.status ?? 1);
  }
  return true;
}

const locals = Object.entries(deps)
  .map(([name, spec]) => ({ name, dir: resolveFileDep(spec) }))
  .filter((d) => d.dir);

const selected = only.length
  ? locals.filter((d) => only.includes(d.name))
  : locals;

if (only.length) {
  const missing = only.filter((n) => !locals.some((d) => d.name === n));
  if (missing.length) {
    console.error(`Unknown file: dependency: ${missing.join(', ')}`);
    console.error(`Available: ${locals.map((d) => d.name).join(', ')}`);
    process.exit(1);
  }
}

if (!selected.length) {
  console.log('No local file: dependencies to update.');
  process.exit(0);
}

console.log(`Updating ${selected.length} local upstream(s)${dryRun ? ' [dry-run]' : ''}:`);
for (const { name, dir } of selected) {
  if (!fs.existsSync(dir)) {
    console.error(`Missing directory for ${name}: ${dir}`);
    process.exit(1);
  }
  const depPkgPath = path.join(dir, 'package.json');
  const depPkg = JSON.parse(fs.readFileSync(depPkgPath, 'utf8'));
  const entry = depPkg.exports?.['.'] || depPkg.module || depPkg.main || '(src)';
  console.log(`  - ${name} → ${path.relative(root, dir)}  [${entry}]`);

  if (hasScript(depPkg, 'build')) {
    run('npm run build', dir);
  } else {
    console.log(`  (no build script — source linked via file:)`);
  }
}

const viteCache = path.join(root, 'node_modules', '.vite');
if (fs.existsSync(viteCache)) {
  console.log(`\n> rm -rf ${path.relative(root, viteCache)}`);
  if (!dryRun) fs.rmSync(viteCache, { recursive: true, force: true });
} else {
  console.log('\n(no Vite cache to clear)');
}

console.log(dryRun ? '\nDry run done.' : '\nUpstreams updated. Restart / refresh `npm run dev` if it is running.');
