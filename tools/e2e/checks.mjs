#!/usr/bin/env node
/**
 * End-to-end checks of the app in a headless Chrome, against the local stack
 * with the fake Spotify server. No real account is involved.
 *
 * In two other terminals:
 *   npm run emulators:fake      Firebase emulators + fake Spotify
 *   npm run start:fake          the app on http://127.0.0.1:4200
 * then:
 *   npm run e2e                 (add `-- --screenshots some/dir` to keep screenshots)
 *
 * It wipes the emulators' data. Chrome is driven through the DevTools protocol,
 * so nothing has to be installed besides Chrome itself (CHROME_PATH to override).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const APP = process.env.E2E_APP_URL ?? 'http://127.0.0.1:4200';
const FAKE_SPOTIFY = 'http://127.0.0.1:8888';
const PROJECT = 'demo-tracklists';
const FIRESTORE = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const DEBUG_PORT = 9334;

const args = process.argv.slice(2);
const screenshotDir = args.includes('--screenshots') ? args[args.indexOf('--screenshots') + 1] : null;
if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Chrome ---------------------------------------------------------------------
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  const found = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!found) throw new Error('Chrome not found: set CHROME_PATH to a Chrome or Chromium binary.');
  return found;
}

const profile = mkdtempSync(path.join(tmpdir(), 'tracklists-e2e-'));
const chrome = spawn(
  findChrome(),
  ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-size=1440,900', 'about:blank'],
  { stdio: 'ignore' }
);
const cleanup = () => {
  chrome.kill();
  rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
};

// --- DevTools protocol ------------------------------------------------------------
let socket;
let sequence = 0;
const pending = new Map();
const consoleErrors = [];

async function connect() {
  // A cold Chrome can take a while to open its debugging port.
  for (let attempt = 0; attempt < 240; attempt++) {
    try {
      const target = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
      socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = reject;
      });
      socket.onmessage = (message) => {
        const data = JSON.parse(message.data);
        if (data.id && pending.has(data.id)) {
          pending.get(data.id)(data);
          pending.delete(data.id);
        } else if (data.method === 'Runtime.exceptionThrown') {
          consoleErrors.push(String(data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text).slice(0, 300));
        } else if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
          consoleErrors.push(data.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ').slice(0, 300));
        }
      };
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error('Chrome did not open its debugging port within 60 s');
}

const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++sequence;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });

/** Evaluates an expression in the page (promises are awaited) and returns its value. */
async function page(expression) {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  const failure = response.result?.exceptionDetails;
  if (failure) throw new Error(`page error: ${String(failure.exception?.description ?? failure.text).slice(0, 500)}`);
  return response.result?.result?.value;
}

/** Waits until the expression is truthy in the page; returns how long it took (ms). */
async function waitFor(expression, timeout = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await page(expression).catch(() => false)) return Date.now() - start;
    await sleep(100);
  }
  throw new Error(`timeout waiting for: ${expression}`);
}

const goto = (url) => send('Page.navigate', { url });
const viewport = (width, height, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
async function screenshot(name) {
  if (!screenshotDir) return;
  const response = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(screenshotDir, `${name}.png`), Buffer.from(response.result.data, 'base64'));
}

// --- Helpers evaluated in the page -------------------------------------------------
const HOME = `window.ng.getComponent(document.querySelector('app-homepage'))`;
const TRACK_COUNT = `Number([...document.querySelectorAll('p')].map((p) => p.textContent.trim()).find((text) => /^[\\d,]+ tracks$/.test(text))?.split(' ')[0].replaceAll(',', ''))`;
const button = (icon) => `[...document.querySelectorAll('button')].find((b) => b.querySelector('mat-icon')?.textContent.trim() === '${icon}')`;
const buttonWithText = (text) => `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('${text}'))`;
const lastSnackBar = `[...document.querySelectorAll('.mat-mdc-snack-bar-label')].pop()?.textContent.trim()`;

// --- Fake Spotify and emulators ------------------------------------------------------
const configureSpotify = (config) => fetch(`${FAKE_SPOTIFY}/__config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
const spotify = async () => (await fetch(`${FAKE_SPOTIFY}/__stats`)).json();

// --- Results ------------------------------------------------------------------------
const results = [];
function check(name, passed, info = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${info ? `  — ${info}` : ''}`);
}

async function run() {
  const fakeOptions = (await spotify().catch(() => null))?.options;
  if (!fakeOptions) throw new Error(`The fake Spotify server is not running on ${FAKE_SPOTIFY}: start \`npm run emulators:fake\`.`);
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  await configureSpotify({ errorRate: 0 });
  const expectedPlaylists = fakeOptions.playlists + 1; // + "Liked tracks"
  // The first call to a function after the emulators start can take tens of seconds.
  const functionsUrl = `http://127.0.0.1:5001/${PROJECT}/europe-west1`;
  await fetch(`${functionsUrl}/spotifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: {} }) }).catch(() => {
    throw new Error('The functions emulator is not running: start `npm run emulators:fake`.');
  });

  await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await viewport(1440, 900);

  // --- Landing and login ----------------------------------------------------------
  await goto(`${APP}/`);
  await waitFor(`!!document.querySelector('app-landing')`);
  await sleep(600);
  await screenshot('01-landing');

  await goto(`${APP}/login?error=access_denied`);
  await waitFor(`!!document.querySelector('#login-error')`);
  check('login: a refusal on Spotify is explained', (await page(`document.querySelector('#login-error').textContent`)).includes('did not grant access'));

  await goto(`${APP}/login?code=not-a-valid-code`);
  await waitFor(`!!document.querySelector('#login-error')`, 20_000);
  const loginError = await page(`document.querySelector('#login-error').textContent.trim()`);
  const loginReset = await page(`!document.querySelector('#login-button').disabled && location.search === ''`);
  check('login: an invalid code shows an error and re-enables the button', loginReset && loginError === 'This Spotify login link is no longer valid. Please log in again.', loginError);
  await screenshot('02-login-error');

  await page(`document.querySelector('#login-button').click()`);
  await waitFor(`location.pathname === '/home' && !!${buttonWithText('Load music')}`, 40_000);
  check('login: a new user lands on the "load music" screen', true);
  await screenshot('03-empty');

  // --- First import ----------------------------------------------------------------
  await page(`${buttonWithText('Load music')}.click()`);
  await waitFor(`!!document.querySelector('#progress-bar [role=progressbar]')`);
  // Wait for the first counts (the very first call to the function can be slow in the emulator).
  await waitFor(`/\\d/.test(document.querySelector('#loading-status')?.textContent ?? '')`, 120_000).catch(() => 0);
  await sleep(1000);
  await screenshot('04-importing');
  const progress = await page(`({ status: document.querySelector('#loading-status')?.textContent.trim().replace(/\\s+/g, ' '), percent: document.querySelector('#progress-bar [role=progressbar]')?.getAttribute('aria-valuenow') })`);
  check('import: phase, counts and a determinate progress bar are shown', /\d/.test(progress.status ?? '') && Number(progress.percent) >= 1, JSON.stringify(progress));
  const importMs = await waitFor(`!!document.querySelector('app-playlist-list')`, 900_000);
  const library = await page(`({ tracks: ${HOME}.trackQuery.getCount(), playlists: ${HOME}.playlistQuery.getCount(), imported: ${HOME}.authQuery.getActive().import.stats.tracks, seconds: ${HOME}.authQuery.getActive().import.stats.durationSeconds })`);
  check(
    'import: the whole library is on screen',
    library.tracks === library.imported && library.tracks >= fakeOptions.tracks && library.playlists === expectedPlaylists,
    `${library.tracks} tracks, ${library.playlists} playlists; import ${library.seconds}s, on screen ${Math.round(importMs / 100) / 10}s after the progress bar appeared`
  );
  await sleep(500);
  await screenshot('05-main');

  // --- Selecting and filtering -----------------------------------------------------
  await page(`document.querySelectorAll('app-playlist-view input')[1].click()`);
  await waitFor(`${TRACK_COUNT} > 0`);
  await waitFor(`document.querySelectorAll('app-track-view').length >= 15`);
  await sleep(400);
  await screenshot('06-playlist-selected');
  const selection = await page(`({ count: ${TRACK_COUNT}, expected: ${HOME}.playlistQuery.getAll()[1].trackIds.length, rows: document.querySelectorAll('app-track-view').length })`);
  check('tracks: selecting a playlist lists its tracks', selection.count === selection.expected && selection.rows >= 15, JSON.stringify(selection));

  await page(`document.querySelector('.track-list').scrollTo(0, 99999)`);
  await sleep(600);
  check('tracks: scrolling loads more rows', (await page(`document.querySelectorAll('app-track-view').length`)) > selection.rows);

  const selectAllMs = await page(`(async () => {
    const before = ${TRACK_COUNT};
    const start = performance.now();
    document.querySelector('mat-slide-toggle button').click();
    while (${TRACK_COUNT} === before) await new Promise((resolve) => setTimeout(resolve, 10));
    return Math.round(performance.now() - start);
  })()`);
  check('tracks: "select all" shows the whole library', (await page(TRACK_COUNT)) === library.tracks, `${selectAllMs} ms`);

  // Wide screens show the filters in their own column; narrower ones behind a Filters tab.
  await page(`[...document.querySelectorAll('.mat-mdc-tab')].find((tab) => tab.textContent.includes('Filters'))?.click()`);
  await waitFor(`document.querySelectorAll('app-filter-view').length === 9`);
  check('filters: always on screen next to the tracks (wide screen)', await page(`!!document.querySelector('.filters-col app-filter-panel') && !document.querySelector('.side mat-tab-group')`));
  await sleep(700);
  const genre = await page(`(() => {
    const list = window.ng.getComponent(document.querySelector('app-genre-list'));
    const genres = list.query.getAll().sort((a, b) => b.trackIds.length - a.trackIds.length);
    list.service.addActive(genres[0].id);
    return { count: genres.length, id: genres[0].id, tracks: genres[0].trackIds.length };
  })()`);
  await waitFor(`${TRACK_COUNT} === ${genre.tracks}`, 5000).catch(() => 0);
  check('filters: a genre keeps only its tracks', (await page(TRACK_COUNT)) === genre.tracks, `${genre.count} genres, "${genre.id}" -> ${genre.tracks} tracks`);
  await sleep(300);
  await screenshot('07-filters-genre');

  const range = await page(`(async () => {
    window.ng.getComponent(document.querySelector('app-filter-view')).onChange([0.5, 0.9]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const expected = ${HOME}.trackQuery.getAll().filter((t) => (t.genres || []).includes(${JSON.stringify(genre.id)}) && typeof t.energy === 'number' && t.energy >= 0.5 && t.energy <= 0.9).length;
    return { shown: ${TRACK_COUNT}, expected };
  })()`);
  check('filters: a range combines with the genre', range.shown === range.expected, JSON.stringify(range));

  await page(`(() => {
    window.ng.getComponent(document.querySelector('app-filter-view')).onChange([0, 1]);
    window.ng.getComponent(document.querySelector('app-genre-list')).service.removeActive(${JSON.stringify(genre.id)});
  })()`);
  await waitFor(`${TRACK_COUNT} === ${library.tracks}`, 5000).catch(() => 0);
  check('filters: clearing them brings every track back, also those without audio features', (await page(TRACK_COUNT)) === library.tracks);

  // --- Likes, saving a playlist ------------------------------------------------------
  const like = await page(`(async () => {
    const row = [...document.querySelectorAll('app-track-view')].find((r) => !!r.querySelector('button[aria-label=Like]'));
    const id = window.ng.getComponent(row).track.id;
    const liked = () => ${HOME}.playlistQuery.getAll().find((p) => p.type === 'likedTracks').trackIds.includes(id);
    const rowOf = () => [...document.querySelectorAll('app-track-view')].find((r) => window.ng.getComponent(r).track.id === id);
    row.querySelector('button').click();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const afterLike = liked();
    rowOf().querySelector('button').click();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return { afterLike, afterUnlike: liked() };
  })()`);
  check('likes: like then unlike are saved (Spotify and Firestore rules)', like.afterLike === true && like.afterUnlike === false, JSON.stringify(like));

  const before = (await spotify()).stats.byRoute;
  await page(`${button('save')}.click()`);
  await waitFor(`!!document.querySelector('mat-dialog-container input')`);
  await sleep(300);
  await screenshot('08-save-dialog');
  await page(`(() => { const input = document.querySelector('mat-dialog-container input'); input.value = 'My tracklist'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(200);
  await page(`[...document.querySelectorAll('mat-dialog-container button')].find((b) => b.textContent.trim() === 'Save').click()`);
  await waitFor(`[...document.querySelectorAll('.mat-mdc-snack-bar-label')].some((e) => e.textContent.includes('Playlist saved'))`, 120_000);
  const after = (await spotify()).stats.byRoute;
  const created = (after['POST /me/playlists'] ?? 0) - (before['POST /me/playlists'] ?? 0);
  const batches = (after['POST /playlists/:id/items'] ?? 0) - (before['POST /playlists/:id/items'] ?? 0);
  check('playlist: saving the tracklist creates it on Spotify, 100 tracks per request', created === 1 && batches === Math.ceil(library.tracks / 100), `${created} playlist, ${batches} requests`);

  // --- Spotify goes down in the middle of a reload -------------------------------------
  await page(`${button('refresh')}.click()`);
  await waitFor(`!!document.querySelector('#progress-bar [role=progressbar]')`);
  await sleep(3000);
  await configureSpotify({ errorRate: 1 });
  const downAt = Date.now();
  await waitFor(`${HOME}.authQuery.getActive().import.status === 'error'`, 180_000);
  const failedAfter = Math.round((Date.now() - downAt) / 1000);
  await sleep(800);
  const failure = await page(`({ code: ${HOME}.authQuery.getActive().import.error.code, main: !!document.querySelector('app-playlist-list'), tracks: ${HOME}.trackQuery.getCount(), message: ${lastSnackBar} })`);
  check(
    'failed reload: reported, library kept on screen, user told',
    failure.code === 'spotify-unavailable' && failure.main && failure.tracks === library.tracks && /Spotify did not answer/.test(failure.message ?? ''),
    `${failedAfter}s after Spotify went down — ${JSON.stringify(failure)}`
  );
  await screenshot('09-reload-failed');
  await configureSpotify({ errorRate: 0 });
  const stillLinked = await page(`(async () => (await ${HOME}.trackService.repository.fetchUserTracks(${HOME}.authQuery.getActiveId())).length)()`);
  check('failed reload: nothing was unlinked in Firestore', stillLinked === library.tracks, `${stillLinked} tracks`);

  // --- An import that dies without a word (crashed function) ---------------------------
  const uid = await page(`${HOME}.authQuery.getActiveId()`);
  const longAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const deadImport = { status: { stringValue: 'running' }, runId: { stringValue: 'dead-run' }, phase: { stringValue: 'tracks' }, percent: { integerValue: 30 }, done: { integerValue: 900 }, total: { integerValue: 3000 }, startedAt: { timestampValue: longAgo }, updatedAt: { timestampValue: longAgo } };
  await fetch(`${FIRESTORE}/users/${uid}?updateMask.fieldPaths=import`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { import: { mapValue: { fields: deadImport } } } }),
  });
  await waitFor(`!!document.querySelector('#progress-bar [role=progressbar]')`, 10_000);
  const stalledAt = Date.now();
  await waitFor(`!!document.querySelector('app-playlist-list')`, 120_000);
  await sleep(500);
  const stalledMessage = await page(lastSnackBar);
  check('dead import: detected from the missing heartbeat, library back on screen', /interrupted/.test(stalledMessage ?? ''), `after ${Math.round((Date.now() - stalledAt) / 1000)}s — "${stalledMessage}"`);

  await page(`${button('refresh')}.click()`);
  await waitFor(`${HOME}.authQuery.getActive().import.runId !== 'dead-run' && ${HOME}.authQuery.getActive().import.status === 'done'`, 900_000);
  await waitFor(`!!document.querySelector('app-playlist-list')`, 60_000);
  check('dead import: a new import takes over and completes', (await page(`${HOME}.trackQuery.getCount()`)) === library.tracks);

  // --- Mobile ---------------------------------------------------------------------------
  await viewport(390, 844, true);
  await goto(`${APP}/home`);
  await waitFor(`!!document.querySelector('mat-tab-group')`, 30_000);
  await sleep(1200);
  await screenshot('10-mobile-tracks');
  await page(`document.querySelectorAll('.mat-mdc-tab')[1].click()`);
  await sleep(1200);
  await screenshot('11-mobile-playlists');
  await page(`document.querySelector('mat-slide-toggle button').click()`);
  await sleep(500);
  await page(`document.querySelectorAll('.mat-mdc-tab')[0].click()`);
  await sleep(1200);
  await screenshot('12-mobile-tracks-selected');
  const mobile = await page(`({ tabs: document.querySelectorAll('.mat-mdc-tab').length, rows: document.querySelectorAll('app-track-view').length, fab: !!document.querySelector('.filters-fab') })`);
  check('mobile: tracks and playlists tabs, tracks listed, Filters button', mobile.tabs === 2 && mobile.rows > 0 && mobile.fab, JSON.stringify(mobile));
  await page(`document.querySelector('.filters-fab').click()`);
  await sleep(800);
  await screenshot('13-mobile-filters');
  const sheet = await page(`(() => {
    const sheet = document.querySelector('.sheet');
    const box = sheet.getBoundingClientRect();
    return { open: sheet.classList.contains('open'), onScreen: box.top < innerHeight && box.bottom <= innerHeight + 1, sliders: sheet.querySelectorAll('app-filter-view').length };
  })()`);
  await page(`[...document.querySelectorAll('.sheet button')].find((b) => b.textContent.includes('Show')).click()`);
  await sleep(600);
  const closed = await page(`!document.querySelector('.sheet').classList.contains('open')`);
  check('mobile: the Filters button opens the sheet, "Show N tracks" closes it', sheet.open && sheet.onScreen && sheet.sliders === 9 && closed, JSON.stringify({ ...sheet, closed }));
  await viewport(1440, 900);

  // --- Coming back, signing out ------------------------------------------------------------
  await goto(`${APP}/home`);
  const cachedMs = await waitFor(`!!document.querySelector('app-playlist-list')`, 30_000);
  const cached = await page(`({ tracks: ${HOME}.trackQuery.getCount(), trackReads: performance.getEntriesByType('resource').filter((r) => /Firestore\\/(RunQuery|BatchGet)/.test(r.name)).length })`);
  check('coming back: the library comes from the browser cache, no track is read from Firestore', cached.tracks === library.tracks && cached.trackReads === 0, `main screen after ${cachedMs} ms`);

  // Browser back button to the login page, as right after a login: the login page sends a signed-in
  // user back home, and the library must still load (the session used to stay stopped).
  await page(`history.replaceState(history.state, '', '/login'); history.pushState(history.state, '', '/home'); history.back()`);
  await waitFor(`location.pathname === '/login'`, 5_000).catch(() => undefined);
  await waitFor(`location.pathname === '/home'`, 10_000);
  await sleep(1500);
  const back = await page(`({ list: !!document.querySelector('app-playlist-list'), loading: document.body.textContent.includes('Loading your tracks') })`);
  check('back to the login page while signed in: home again, library on screen', back.list && !back.loading, JSON.stringify(back));

  await page(`${button('power_settings_new')}.click()`);
  await waitFor(`!!document.querySelector('app-landing')`, 15_000);
  await sleep(500);
  const cacheKeys = await page(`new Promise((resolve) => {
    const request = indexedDB.open('Tracklists');
    request.onerror = () => resolve('error');
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('tracklists-storage')) return resolve('');
      const keys = db.transaction('tracklists-storage').objectStore('tracklists-storage').getAllKeys();
      keys.onsuccess = () => resolve(keys.result.join(','));
    };
  })`);
  check('sign out: back to the landing page, cached library erased', cacheKeys === '', cacheKeys ? `left in cache: ${cacheKeys}` : '');
  await goto(`${APP}/home`);
  await waitFor(`!!document.querySelector('app-landing')`, 15_000);
  check('sign out: the app is not reachable any more', true);

  // Album covers of the fake library do not exist; the invalid login code logs its failure.
  const unexpected = consoleErrors.filter((error) => !/i\.scdn\.co|Failed to load resource|ERR_|favicon|\[Login\] Spotify login failed/.test(error));
  check('no unexpected error in the browser console', unexpected.length === 0, unexpected.slice(0, 4).join(' || '));
}

let exitCode = 0;
try {
  await run();
  const failed = results.filter((result) => !result.passed).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  exitCode = failed ? 1 : 0;
} catch (error) {
  console.error(`\nStopped: ${error.message}`);
  exitCode = 1;
} finally {
  socket?.close();
  cleanup();
}
process.exit(exitCode);
