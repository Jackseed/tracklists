#!/usr/bin/env node
/**
 * Fake Spotify (Accounts + Web API) server for local development and tests.
 *
 * It serves a deterministic, arbitrarily large library and reproduces the
 * behaviours of the real API that matter for the import pipeline:
 *  - offset pagination with `total` / `next`
 *  - batch endpoints: order and duplicates preserved, `null` for unknown ids,
 *    400 "Invalid base62 id" when the list contains an empty id
 *  - playlist entries exposing both `track` and `item`, plus `fields` filtering
 *  - removed tracks (`null`), local files and podcast episodes inside playlists
 *  - 429 + `Retry-After` on a rolling 30 s window, random 5xx, expiring tokens
 *
 * Nothing here talks to Spotify. Usage:
 *   node tools/fake-spotify/server.mjs --port 8888 --tracks 20000 --playlists 300 --liked 5000
 */
import http from 'node:http';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const GENRES = [
  'rock', 'indie rock', 'alternative rock', 'art rock', 'classic rock', 'hard rock', 'punk', 'post-punk',
  'metal', 'pop', 'french pop', 'indie pop', 'synthpop', 'dance pop', 'electronic', 'house', 'french house',
  'deep house', 'techno', 'minimal techno', 'ambient', 'downtempo', 'trip hop', 'hip hop', 'rap', 'french rap',
  'trap', 'r&b', 'soul', 'neo soul', 'funk', 'disco', 'jazz', 'cool jazz', 'jazz fusion', 'bebop', 'blues',
  'folk', 'indie folk', 'singer-songwriter', 'country', 'reggae', 'roots reggae', 'dub', 'ska', 'latin',
  'salsa', 'bossa nova', 'afrobeat', 'classical', 'baroque', 'opera', 'soundtrack', 'chanson', 'new wave',
  'shoegaze', 'dream pop', 'grunge', 'emo', 'drum and bass',
];
const MARKETS = Array.from({ length: 170 }, (_, i) => String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + ((i * 7) % 26)));
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Deterministic 22-char base62 id, shaped like a Spotify id. */
function b62(input) {
  const hash = createHash('sha256').update(input).digest();
  let out = '';
  for (let i = 0; i < 22; i++) out += ALPHABET[hash[i] % 62];
  return out;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round3 = (n) => Math.round(n * 1000) / 1000;

/** Builds the whole fake library in memory. Same options => same library. */
export function buildLibrary({ seed = 1, tracks = 3000, playlists = 40, liked = 1000, userId = 'fakeuser', edgeCases = true } = {}) {
  const rand = mulberry32(seed);
  const likedOnly = Math.floor(liked * 0.2);
  const catalogSize = tracks + likedOnly;

  const artistCount = Math.max(5, Math.round(catalogSize / 4));
  const artists = Array.from({ length: artistCount }, (_, i) => {
    const id = b62(`artist:${seed}:${i}`);
    const genreCount = rand() < 0.12 ? 0 : 1 + Math.floor(rand() * 4);
    const genres = [];
    while (genres.length < genreCount) {
      const genre = GENRES[Math.floor(rand() * GENRES.length)];
      if (!genres.includes(genre)) genres.push(genre);
    }
    return {
      id,
      name: `Artist ${i}`,
      genres,
      popularity: Math.floor(rand() * 100),
      followers: { href: null, total: Math.floor(rand() * 1e6) },
      images: [{ url: `https://i.scdn.co/image/fake-artist-${i}`, height: 640, width: 640 }],
      type: 'artist',
      uri: `spotify:artist:${id}`,
      href: `https://api.spotify.com/v1/artists/${id}`,
      external_urls: { spotify: `https://open.spotify.com/artist/${id}` },
    };
  });
  const artistRef = (a) => ({ id: a.id, name: a.name, type: 'artist', uri: a.uri, href: a.href, external_urls: a.external_urls });

  const catalog = [];
  const features = new Map();
  for (let i = 0; i < catalogSize; i++) {
    const id = b62(`track:${seed}:${i}`);
    // Skewed towards a few prolific artists, like a real library.
    const main = artists[Math.floor(Math.pow(rand(), 2) * artistCount)];
    const trackArtists = [artistRef(main)];
    if (rand() < 0.15) trackArtists.push(artistRef(artists[Math.floor(rand() * artistCount)]));
    const year = 1960 + Math.floor(rand() * 66);
    const precision = rand() < 0.1 ? 'year' : 'day';
    const albumId = b62(`album:${seed}:${Math.floor(i / 10)}`);
    catalog.push({
      id,
      name: `Track ${i} ${'la '.repeat(1 + (i % 4)).trim()}`,
      type: 'track',
      uri: `spotify:track:${id}`,
      href: `https://api.spotify.com/v1/tracks/${id}`,
      duration_ms: 120000 + Math.floor(rand() * 240000),
      popularity: Math.floor(rand() * 100),
      explicit: rand() < 0.1,
      is_local: false,
      is_playable: true,
      disc_number: 1,
      track_number: 1 + (i % 12),
      preview_url: null,
      external_ids: { isrc: `FAKE${String(i).padStart(8, '0')}` },
      external_urls: { spotify: `https://open.spotify.com/track/${id}` },
      available_markets: MARKETS,
      artists: trackArtists,
      album: {
        id: albumId,
        name: `Album ${Math.floor(i / 10)}`,
        album_type: 'album',
        type: 'album',
        uri: `spotify:album:${albumId}`,
        href: `https://api.spotify.com/v1/albums/${albumId}`,
        total_tracks: 10,
        release_date: precision === 'year' ? String(year) : `${year}-0${1 + (i % 9)}-1${i % 10}`,
        release_date_precision: precision,
        available_markets: MARKETS,
        external_urls: { spotify: `https://open.spotify.com/album/${albumId}` },
        images: [640, 300, 64].map((size) => ({ url: `https://i.scdn.co/image/fake-${albumId}-${size}`, height: size, width: size })),
        artists: [artistRef(main)],
      },
    });
    // ~1% of tracks have no audio analysis: Spotify answers `null` for those.
    features.set(
      id,
      rand() < 0.01
        ? null
        : {
            id,
            danceability: round3(rand()), energy: round3(rand()), valence: round3(rand()),
            acousticness: round3(rand()), instrumentalness: round3(rand()), liveness: round3(rand()),
            speechiness: round3(rand()), loudness: round3(-30 + rand() * 30), tempo: round3(60 + rand() * 140),
            key: Math.floor(rand() * 12), mode: rand() < 0.6 ? 1 : 0, time_signature: 4,
            duration_ms: 200000, type: 'audio_features', uri: `spotify:track:${id}`,
            track_href: `https://api.spotify.com/v1/tracks/${id}`,
            analysis_url: `https://api.spotify.com/v1/audio-analysis/${id}`,
          }
    );
  }

  // Playlist sizes follow a power law; slices are contiguous so the union covers the catalog.
  const weights = Array.from({ length: playlists }, (_, j) => 1 / Math.pow(j + 1, 0.8));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const owner = { id: userId, display_name: 'Fake User', type: 'user', uri: `spotify:user:${userId}`, href: '', external_urls: {} };
  const playlistList = [];
  let cursor = 0;
  for (let j = 0; j < playlists; j++) {
    const size = j === playlists - 1 ? tracks - cursor : Math.max(1, Math.min(tracks - cursor - (playlists - 1 - j), Math.round((tracks * weights[j]) / weightSum)));
    const own = catalog.slice(cursor, cursor + Math.max(0, size));
    cursor += Math.max(0, size);
    // 10% of each playlist is shared "hits" from the start of the catalog => duplicates across playlists.
    const shared = j === 0 ? [] : catalog.slice(0, Math.floor(own.length * 0.1));
    const entries = own.concat(shared).map((track, k) => ({ added_at: new Date(1.5e12 + (j * 1000 + k) * 6e4).toISOString(), is_local: false, track }));
    if (edgeCases && j === 0) {
      const episodeId = b62(`episode:${seed}`);
      entries.splice(1, 0, { added_at: '2020-01-01T00:00:00Z', is_local: false, track: null });
      entries.splice(3, 0, {
        added_at: '2020-01-01T00:00:00Z', is_local: true,
        track: { id: null, name: 'My local file', type: 'track', uri: 'spotify:local:Me:Album:My+local+file:123', is_local: true, duration_ms: 123000, popularity: 0, artists: [{ id: null, name: 'Me', type: 'artist', uri: null, href: null, external_urls: {} }], album: { id: null, name: 'Album', images: [], release_date: null, release_date_precision: null } },
      });
      entries.splice(5, 0, {
        added_at: '2020-01-01T00:00:00Z', is_local: false,
        track: { id: episodeId, name: 'A podcast episode', type: 'episode', uri: `spotify:episode:${episodeId}`, duration_ms: 1800000, popularity: 0, artists: [{ id: b62('show'), name: 'A show', type: 'show' }], album: { id: b62('show'), name: 'A show', images: [], release_date: '2021-01-01', release_date_precision: 'day' } },
      });
    }
    const id = b62(`playlist:${seed}:${j}`);
    playlistList.push({
      id,
      name: `Playlist ${j}`,
      description: '',
      collaborative: false,
      public: j % 2 === 0,
      snapshot_id: b62(`snapshot:${seed}:${j}`),
      owner,
      images: [{ url: `https://i.scdn.co/image/fake-playlist-${j}`, height: null, width: null }],
      type: 'playlist',
      uri: `spotify:playlist:${id}`,
      external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
      entries,
    });
  }

  const likedEntries = [];
  const seenLiked = new Set();
  for (let k = 0; likedEntries.length < liked - likedOnly && k < tracks * 2; k++) {
    const index = (k * 7) % tracks;
    if (seenLiked.has(index)) continue;
    seenLiked.add(index);
    likedEntries.push({ added_at: new Date(1.6e12 + k * 36e5).toISOString(), track: catalog[index] });
  }
  for (let k = 0; k < likedOnly; k++) likedEntries.push({ added_at: new Date(1.6e12 - k * 36e5).toISOString(), track: catalog[tracks + k] });

  const user = { id: userId, display_name: 'Fake User', email: 'fake.user@example.test', country: 'FR', product: 'premium', type: 'user', uri: `spotify:user:${userId}`, images: [], followers: { href: null, total: 0 }, external_urls: {} };
  return { user, artists, artistsById: new Map(artists.map((a) => [a.id, a])), catalog, tracksById: new Map(catalog.map((t) => [t.id, t])), features, playlists: playlistList, liked: likedEntries };
}

/** What a correct import must end up with (only real tracks: no null, local file or episode). */
export function expectedLibrary(library, { brokenPlaylists = 0 } = {}) {
  const isRealTrack = (t) => !!t && !!t.id && t.type === 'track' && !t.is_local;
  const playlists = library.playlists.map((p, j) => ({
    id: p.id,
    broken: j >= 1 && j <= brokenPlaylists,
    trackIds: p.entries.map((e) => e.track).filter(isRealTrack).map((t) => t.id),
  }));
  const likedIds = library.liked.map((e) => e.track.id);
  const unique = new Set(likedIds);
  for (const p of playlists) if (!p.broken) for (const id of p.trackIds) unique.add(id);
  return { playlists, likedIds, uniqueTrackIds: unique };
}

/** Minimal parser for Spotify's `fields` filter: `a,b(c,d(e))`. */
function parseFields(spec) {
  let pos = 0;
  const parseList = () => {
    const tree = {};
    while (pos < spec.length && spec[pos] !== ')') {
      let name = '';
      while (pos < spec.length && !',()'.includes(spec[pos])) name += spec[pos++];
      name = name.trim();
      if (spec[pos] === '(') {
        pos++;
        tree[name] = parseList();
        pos++; // ')'
      } else if (name) {
        tree[name] = true;
      }
      if (spec[pos] === ',') pos++;
    }
    return tree;
  };
  return parseList();
}
function applyFields(value, tree) {
  if (tree === true || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => applyFields(v, tree));
  const out = {};
  for (const key of Object.keys(tree)) if (key in value) out[key] = applyFields(value[key], tree[key]);
  return out;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Creates the fake server. `options` can be changed at runtime through `fake.options`
 * or `POST /__config`.
 */
export function createFakeSpotify(initial = {}) {
  const options = {
    seed: 1, tracks: 3000, playlists: 40, liked: 1000, userId: 'fakeuser',
    latencyMs: 0, // average simulated latency per API call
    rateLimit: 0, // max API calls per rolling 30 s window (0 = unlimited)
    errorRate: 0, // probability of a random 502 on API calls
    tokenTtlS: 0, // access tokens expire after this many seconds (0 = never)
    brokenPlaylists: 0, // playlists (after the first) whose items answer 404
    legacyEntries: false, // playlist entries only expose `track` (API before February 2026)
    edgeCases: true,
    ...initial,
  };
  const library = buildLibrary(options);
  const stats = { api: 0, accepted: 0, rateLimited: 0, serverErrors: 0, unauthorized: 0, tokenRequests: 0, maxInFlight: 0, byRoute: {}, sinks: [] };
  const windowHits = [];
  const tokens = new Map();
  let tokenCounter = 0;
  let inFlight = 0;
  let origin = '';

  const issueToken = () => {
    const token = `fake-access-${++tokenCounter}-${Date.now()}`;
    tokens.set(token, Date.now());
    return token;
  };
  const send = (res, status, body, headers = {}) => {
    const payload = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Expose-Headers': 'Retry-After',
      ...headers,
    });
    res.end(payload);
  };
  const error = (res, status, message, headers) => send(res, status, { error: { status, message } }, headers);
  const readBody = (req) =>
    new Promise((resolve) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });
  const paging = (url, all, { fields } = {}) => {
    const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? 20), Number(url.searchParams.get('__max') ?? 100)));
    const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0));
    const next = offset + limit < all.length ? new URL(url) : null;
    if (next) next.searchParams.set('offset', String(offset + limit));
    const page = { href: url.href, items: all.slice(offset, offset + limit), limit, next: next ? next.href : null, offset, previous: null, total: all.length };
    return fields ? applyFields(page, parseFields(fields)) : page;
  };
  const playlistView = (p) => {
    const { entries, ...meta } = p;
    const total = entries.length;
    return { ...meta, href: `${origin}/v1/playlists/${p.id}`, tracks: { href: `${origin}/v1/playlists/${p.id}/tracks`, total }, items: { href: `${origin}/v1/playlists/${p.id}/items`, total } };
  };

  async function handleApi(req, res, url, route) {
    stats.api++;
    stats.byRoute[route] = (stats.byRoute[route] ?? 0) + 1;

    if (options.rateLimit > 0) {
      const now = Date.now();
      while (windowHits.length && windowHits[0] <= now - 30000) windowHits.shift();
      if (windowHits.length >= options.rateLimit) {
        stats.rateLimited++;
        const retryAfter = Math.max(1, Math.ceil((windowHits[0] + 30000 - now) / 1000));
        return send(res, 429, { error: { status: 429, message: 'API rate limit exceeded' } }, { 'Retry-After': String(retryAfter) });
      }
      windowHits.push(now);
    }
    stats.accepted++;

    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const issuedAt = tokens.get(token);
    if (issuedAt === undefined) {
      stats.unauthorized++;
      return error(res, 401, 'Invalid access token');
    }
    if (options.tokenTtlS > 0 && Date.now() - issuedAt > options.tokenTtlS * 1000) {
      stats.unauthorized++;
      return error(res, 401, 'The access token expired');
    }

    if (options.latencyMs > 0) await sleep(options.latencyMs * (0.5 + Math.random()));
    if (options.errorRate > 0 && Math.random() < options.errorRate) {
      stats.serverErrors++;
      return send(res, 502, 'Bad gateway', { 'Content-Type': 'text/plain' });
    }

    const path = url.pathname.replace(/^\/v1/, '').replace(/\/$/, '');
    const method = req.method;
    let match;

    if (method === 'GET' && path === '/me') return send(res, 200, library.user);
    if (method === 'GET' && (path === '/me/playlists' || /^\/users\/[^/]+\/playlists$/.test(path))) {
      url.searchParams.set('__max', '50');
      return send(res, 200, paging(url, library.playlists.map(playlistView)));
    }
    if (method === 'GET' && path === '/me/tracks') {
      url.searchParams.set('__max', '50');
      return send(res, 200, paging(url, library.liked));
    }
    if (method === 'GET' && path === '/me/top/tracks') {
      url.searchParams.set('__max', '50');
      return send(res, 200, paging(url, library.catalog.slice(0, 50)));
    }
    if (method === 'GET' && (match = path.match(/^\/playlists\/([^/]+)\/(tracks|items)$/))) {
      const index = library.playlists.findIndex((p) => p.id === match[1]);
      if (index < 0) return error(res, 404, 'Resource not found');
      if (index >= 1 && index <= options.brokenPlaylists) return error(res, 404, 'Resource not found');
      const playlist = library.playlists[index];
      const addedBy = { id: library.user.id, type: 'user', uri: library.user.uri, href: '', external_urls: {} };
      // Like the real API today, every entry carries the item twice: `track` (legacy) and `item`.
      const entries = playlist.entries.map((e) => ({ added_at: e.added_at, added_by: addedBy, is_local: e.is_local, primary_color: null, track: e.track, ...(options.legacyEntries ? {} : { item: e.track }), video_thumbnail: { url: null } }));
      return send(res, 200, paging(url, entries, { fields: url.searchParams.get('fields') }));
    }
    if (method === 'GET' && (match = path.match(/^\/playlists\/([^/]+)$/))) {
      const playlist = library.playlists.find((p) => p.id === match[1]);
      return playlist ? send(res, 200, playlistView(playlist)) : error(res, 404, 'Resource not found');
    }
    if (method === 'GET' && (path === '/audio-features' || path === '/artists' || path === '/tracks')) {
      const raw = url.searchParams.get('ids');
      if (raw === null) return error(res, 400, 'Missing ids');
      const ids = raw.replace(/,$/, '').split(',');
      const max = path === '/audio-features' ? 100 : 50;
      if (ids.length > max) return error(res, 400, 'Too many ids requested');
      if (ids.some((id) => !/^[0-9A-Za-z]{22}$/.test(id))) return error(res, 400, 'Invalid base62 id');
      if (path === '/audio-features') return send(res, 200, { audio_features: ids.map((id) => library.features.get(id) ?? null) });
      if (path === '/artists') return send(res, 200, { artists: ids.map((id) => library.artistsById.get(id) ?? null) });
      return send(res, 200, { tracks: ids.map((id) => library.tracksById.get(id) ?? null) });
    }
    if (method === 'GET' && (match = path.match(/^\/artists\/([^/]+)$/))) {
      const artist = library.artistsById.get(match[1]);
      return artist ? send(res, 200, artist) : error(res, 404, 'Resource not found');
    }
    if (method === 'GET' && path === '/me/player/devices') return send(res, 200, { devices: [] });
    if (method === 'GET' && path === '/me/player') return send(res, 204);
    if ((method === 'PUT' || method === 'POST') && path.startsWith('/me/player')) return send(res, 204);
    if (method === 'POST' && (path === '/me/playlists' || /^\/users\/[^/]+\/playlists$/.test(path))) {
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      const id = b62(`created:${Date.now()}:${Math.random()}`);
      return send(res, 201, { id, name: body.name ?? 'New playlist', type: 'playlist', uri: `spotify:playlist:${id}`, owner: library.user });
    }
    if (method === 'POST' && /^\/playlists\/[^/]+\/(tracks|items)$/.test(path)) {
      await readBody(req);
      return send(res, 201, { snapshot_id: b62(`snapshot:${Date.now()}`) });
    }
    if ((method === 'PUT' || method === 'DELETE') && (path === '/me/tracks' || path === '/me/library')) return send(res, 200, '');
    if (path === '/recommendations') return send(res, 404, '');
    return send(res, 410, { error: { status: 410, message: '' } });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, origin || `http://${req.headers.host}`);
    try {
      if (req.method === 'OPTIONS') return send(res, 204);

      // --- Accounts service -------------------------------------------------
      if (req.method === 'GET' && url.pathname === '/authorize') {
        const redirect = new URL(url.searchParams.get('redirect_uri'));
        redirect.searchParams.set('code', `fake-code-${Date.now()}`);
        const state = url.searchParams.get('state');
        if (state) redirect.searchParams.set('state', state);
        res.writeHead(302, { Location: redirect.href });
        return res.end();
      }
      if (req.method === 'POST' && url.pathname === '/api/token') {
        stats.tokenRequests++;
        const form = new URLSearchParams((await readBody(req)).toString());
        const grant = form.get('grant_type');
        if (!(req.headers.authorization ?? '').startsWith('Basic ')) return send(res, 401, { error: 'invalid_client' });
        if (grant === 'authorization_code') {
          if (!String(form.get('code')).startsWith('fake-code')) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid authorization code' });
          return send(res, 200, { access_token: issueToken(), token_type: 'Bearer', expires_in: options.tokenTtlS || 3600, refresh_token: 'fake-refresh-token', scope: '' });
        }
        if (grant === 'refresh_token') {
          if (form.get('refresh_token') !== 'fake-refresh-token') return send(res, 400, { error: 'invalid_grant', error_description: 'Refresh token revoked' });
          return send(res, 200, { access_token: issueToken(), token_type: 'Bearer', expires_in: options.tokenTtlS || 3600, scope: '' });
        }
        if (grant === 'client_credentials') return send(res, 200, { access_token: issueToken(), token_type: 'Bearer', expires_in: 3600 });
        return send(res, 400, { error: 'unsupported_grant_type' });
      }

      // --- Test helpers -----------------------------------------------------
      if (url.pathname === '/__stats') return send(res, 200, { options, stats });
      if (url.pathname === '/__config' && req.method === 'POST') {
        Object.assign(options, JSON.parse((await readBody(req)).toString() || '{}'));
        return send(res, 200, options);
      }
      if (url.pathname.startsWith('/__sink/')) {
        // Records calls that the legacy pipeline makes to its sibling Cloud Functions.
        const body = await readBody(req);
        stats.sinks.push({ name: url.pathname.slice(8), bytes: body.length, at: Date.now() });
        return send(res, 200, { result: 'ok' });
      }

      // --- Web API ----------------------------------------------------------
      if (url.pathname.startsWith('/v1/')) {
        inFlight++;
        stats.maxInFlight = Math.max(stats.maxInFlight, inFlight);
        const route = `${req.method} ${url.pathname.replace(/^\/v1/, '').replace(/[0-9A-Za-z]{22}/g, ':id').replace(/\/users\/[^/]+/, '/users/:id')}`;
        try {
          return await handleApi(req, res, url, route);
        } finally {
          inFlight--;
        }
      }
      return send(res, 404, { error: 'not_found' });
    } catch (e) {
      return send(res, 500, { error: String(e?.stack ?? e) });
    }
  });

  return {
    server,
    options,
    library,
    stats,
    issueToken,
    get origin() {
      return origin;
    },
    listen(port = 0, host = '127.0.0.1') {
      return new Promise((resolve) =>
        server.listen(port, host, () => {
          origin = `http://${host}:${server.address().port}`;
          resolve(origin);
        })
      );
    },
    /** Forgets the calls of the last 30 s: lets tests fast-forward through a rate-limit pause. */
    resetRateLimitWindow() {
      windowHits.length = 0;
    },
    resetStats() {
      Object.assign(stats, { api: 0, accepted: 0, rateLimited: 0, serverErrors: 0, unauthorized: 0, tokenRequests: 0, maxInFlight: 0, byRoute: {}, sinks: [] });
      windowHits.length = 0;
    },
    close() {
      return new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    },
  };
}

// --- CLI ---------------------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const arg = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    const env = process.env[`FAKE_SPOTIFY_${name.replace(/-/g, '_').toUpperCase()}`];
    return index >= 0 ? args[index + 1] : env ?? fallback;
  };
  const fake = createFakeSpotify({
    seed: Number(arg('seed', 1)),
    tracks: Number(arg('tracks', 3000)),
    playlists: Number(arg('playlists', 40)),
    liked: Number(arg('liked', 1000)),
    latencyMs: Number(arg('latency', 40)),
    rateLimit: Number(arg('rate-limit', 0)),
    errorRate: Number(arg('error-rate', 0)),
    tokenTtlS: Number(arg('token-ttl', 0)),
    brokenPlaylists: Number(arg('broken-playlists', 0)),
  });
  const origin = await fake.listen(Number(arg('port', 8888)));
  const expected = expectedLibrary(fake.library, fake.options);
  console.log(`Fake Spotify listening on ${origin}`);
  console.log(`  ${fake.library.playlists.length} playlists, ${fake.library.liked.length} liked tracks, ${expected.uniqueTrackIds.size} unique tracks`);
  console.log(`  rate limit: ${fake.options.rateLimit || 'off'} req/30s, latency: ~${fake.options.latencyMs} ms, token ttl: ${fake.options.tokenTtlS || 'never'}`);
  console.log(`  stats: ${origin}/__stats`);
}
