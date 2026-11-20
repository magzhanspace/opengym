#!/usr/bin/env node
/* Does api/shared/ still load under plain node?
 *
 * The shared code is imported by two runtimes: the server under bare node, and the app under
 * Vite. Vite forgives things node does not (`?raw`, `import.meta.glob`, JSON without an import
 * attribute), so a change made with the frontend in mind can leave vitest green and kill the
 * server at startup. Run by bare `node` on purpose: being outside vitest IS the check.
 */
import { readdirSync } from 'node:fs';

const SHARED = new URL('../shared/', import.meta.url);
const files = readdirSync(SHARED).filter(f => f.endsWith('.js')).sort();

let failed = 0;
for (const m of files) {
  try {
    await import(new URL(m, SHARED));
    console.log(`  ok    shared/${m}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL  shared/${m} — ${e.message}`);
  }
}

if (failed) {
  console.error(`\n${failed} module(s) do not load under plain node — the api would not start.`);
  process.exit(1);
}
console.log('\napi/shared loads under plain node.');
