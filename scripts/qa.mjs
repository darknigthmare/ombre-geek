import { spawnSync } from 'node:child_process';

const checks = [
  ['--check', 'src/data.js'],
  ['--check', 'src/app.js'],
  ['--check', 'sw.js'],
  ['--check', 'scripts/build-portable.mjs'],
  ['scripts/build-portable.mjs'],
  ['--test', 'tests/ombre-geek.test.mjs']
];

for (const args of checks) {
  const result = spawnSync(process.execPath, args, {stdio:'inherit'});
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('QA statique OMBRE//GEEK 1.1.0 : RÉUSSIE');
