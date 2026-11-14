import { convertToParamMap } from '@angular/router';
import { appLoginUrl, isAppLoginReturn, isNativeApp } from './native';

describe('native app login', () => {
  it('is not the app in a browser', () => {
    expect(isNativeApp).toBe(false);
  });

  it('recognises the return of a login started from the app', () => {
    expect(isAppLoginReturn(convertToParamMap({ code: 'abc', state: 'app-123' }))).toBe(true);
    expect(isAppLoginReturn(convertToParamMap({ code: 'abc' }))).toBe(false);
    expect(isAppLoginReturn(convertToParamMap({ code: 'abc', state: 'other' }))).toBe(false);
  });

  it('forwards only what Spotify sent to the app', () => {
    const url = appLoginUrl(convertToParamMap({ code: 'a b', state: 'app-1', utm_source: 'x' }));
    expect(url).toBe('tracklists://login?code=a+b&state=app-1');
    expect(appLoginUrl(convertToParamMap({ error: 'access_denied', state: 'app-1' }))).toBe('tracklists://login?error=access_denied&state=app-1');
  });
});
