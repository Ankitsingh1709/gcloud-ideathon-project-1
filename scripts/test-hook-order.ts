/**
 * Hooks must run on every render, or not at all.
 *
 * A hook placed below an early `return` runs only on the renders that get
 * past it, so the hook count changes between renders and React tears the tree
 * down with error #310 — at runtime, in the browser, on the signed-in path
 * only. `tsc` cannot see it and the API test suite never renders anything,
 * so it shipped to production once. This is the cheapest check that catches it.
 *
 * Deliberately conservative: it only looks at top-level hooks (two-space
 * indent) and top-level `if` blocks that return. Anything nested inside a
 * handler or callback is ignored rather than guessed at.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const HOOK = /^ {2}(?:const\s+.*=\s*)?use[A-Z]\w*\(/;
const GUARD = /^ {2}if\s*\(/;
const GUARD_RETURNS = /^ {4}return/m;

function tsxFilesIn(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsxFilesIn(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}

let failures = 0;
let checked = 0;

for (const file of tsxFilesIn('src')) {
  const lines = readFileSync(file, 'utf8').split('\n');

  const hooks: number[] = [];
  const guards: number[] = [];

  lines.forEach((line, i) => {
    if (HOOK.test(line)) hooks.push(i + 1);
    // Only an `if` whose body actually returns can skip the code below it.
    if (GUARD.test(line) && GUARD_RETURNS.test(lines.slice(i, i + 13).join('\n'))) {
      guards.push(i + 1);
    }
  });

  if (hooks.length === 0) continue;
  checked++;

  const firstGuard = guards.length ? Math.min(...guards) : null;
  const stranded = firstGuard === null ? [] : hooks.filter(h => h > firstGuard);

  if (stranded.length) {
    console.log(`❌ FAILURE: ${file} calls a hook at line ${stranded.join(', ')} after the early return guarded at line ${firstGuard}`);
    failures++;
  } else {
    console.log(`✅ SUCCESS: ${file} calls every hook before any early return`);
  }
}

console.log('===========================================================');
console.log(`📊 HOOK ORDER: ${checked - failures} passed, ${failures} failed.`);
if (failures > 0) process.exit(1);
