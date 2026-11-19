import { rmSync, existsSync } from 'node:fs';

const dirs = ['dist', '.state', '.chrome-profile'];
const removed = [];

for (const d of dirs) {
  if (existsSync(d)) {
    rmSync(d, { recursive: true, force: true });
    removed.push(d);
  }
}

console.log('reset: removed ' + (removed.length ? removed.join(', ') : '(nothing)'));
