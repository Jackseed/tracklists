import { genresOf } from './genre.service';

describe('genresOf', () => {
  it('groups track ids by genre', () => {
    const genres = genresOf([
      { id: 'a', genres: ['rock', 'pop'] },
      { id: 'b', genres: ['rock'] },
      { id: 'c', genres: [] },
      { id: 'd' },
    ]);
    expect(genres).toEqual([
      { id: 'rock', trackIds: ['a', 'b'] },
      { id: 'pop', trackIds: ['a'] },
    ]);
  });

  it('returns nothing without tracks', () => {
    expect(genresOf([])).toEqual([]);
  });
});
