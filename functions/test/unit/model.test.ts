import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { genreDocId, isSpotifyId, isValidDocId, skipReason, toAudioFeatures, toStoredTrack } from '../../src/library/model';

describe('library model', () => {
  it('classifies playlist entries', () => {
    const track = { id: '11dFghVXANMlKmJXsNCbNl', type: 'track' };
    assert.equal(skipReason({ item: track }), null);
    assert.equal(skipReason({ track }), null);
    assert.equal(skipReason({ item: null }), 'removed');
    assert.equal(skipReason({}), 'removed');
    assert.equal(skipReason({ is_local: true, item: { id: null, type: 'track' } }), 'local');
    assert.equal(skipReason({ item: { id: 'abc', type: 'episode' } }), 'episode');
    assert.equal(skipReason({ item: { id: null, type: 'track' } }), 'invalid');
    assert.equal(skipReason({ item: { id: 'a/b', type: 'track' } }), 'invalid');
  });

  it('normalises a raw track, tolerating missing fields', () => {
    const stored = toStoredTrack({ id: 'x', name: 'Song', popularity: 0, album: { release_date: '1999-05-01', images: null }, artists: [{ id: null, name: 'Someone' }] }, undefined);
    assert.equal(stored.popularity, 0, 'a popularity of 0 is a real value');
    assert.equal(stored.album.release_year, 1999);
    assert.deepEqual(stored.album.images, []);
    assert.deepEqual(stored.artists, [{ id: '', name: 'Someone', images: [] }]);
    assert.equal(stored.added_at, '');
    assert.equal(stored.uri, 'spotify:track:x');
    assert.equal(toStoredTrack({ id: 'y' }, null).album.release_year, null);
  });

  it('keeps only numeric audio features', () => {
    assert.deepEqual(toAudioFeatures({ id: 'x', tempo: 120.5, energy: 0, key: undefined }), { tempo: 120.5, energy: 0 });
  });

  it('validates ids', () => {
    assert.ok(isSpotifyId('11dFghVXANMlKmJXsNCbNl'));
    assert.ok(!isSpotifyId(''));
    assert.ok(!isSpotifyId(null));
    assert.ok(!isSpotifyId('spotify:local:x'));
    assert.ok(isValidDocId('josé.dupont_42'));
    assert.ok(!isValidDocId(''));
    assert.ok(!isValidDocId('..'));
    assert.ok(!isValidDocId('__name__'));
    assert.equal(genreDocId('pop/rock'), 'pop-rock');
  });
});
