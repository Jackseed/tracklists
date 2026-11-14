#!/usr/bin/env node
/**
 * Makes the Angular service worker ignore requests to Sentry.
 *
 * Without it the worker intercepts Sentry's error reports; when they are
 * blocked (ad blockers) the failure surfaces as a service-worker error, which
 * is itself reported. Run after a production build:
 *   node tools/patch-ngsw.mjs [dist/listy/browser/ngsw-worker.js]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2] ?? 'dist/listy/browser/ngsw-worker.js';
const IGNORED_HOSTS = ['sentry'];
const marker = '/* tracklists: bypass */';
const pattern = /(\bonFetch\(event\)\s*\{\s*const req = event\.request;)/;

const source = readFileSync(file, 'utf8');
if (source.includes(marker)) {
  console.log(`${file}: already patched`);
} else {
  if (!pattern.test(source)) {
    console.error(`${file}: could not find the onFetch handler. The service worker changed: update tools/patch-ngsw.mjs.`);
    process.exit(1);
  }
  const bypass = `$1 ${marker} if (${JSON.stringify(IGNORED_HOSTS)}.some((host) => req.url.toLowerCase().includes(host))) { return; }`;
  writeFileSync(file, source.replace(pattern, bypass));
  console.log(`${file}: patched (ignoring ${IGNORED_HOSTS.join(', ')})`);
}
