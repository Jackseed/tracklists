import { SecToMinPipe } from './sec-to-min.pipe';

describe('SecToMinPipe', () => {
  const pipe = new SecToMinPipe();

  it('formats seconds as m:ss', () => {
    expect(pipe.transform(0)).toBe('0:00');
    expect(pipe.transform(5)).toBe('0:05');
    expect(pipe.transform(65)).toBe('1:05');
    expect(pipe.transform(600)).toBe('10:00');
  });
});
