const puppeteer = require('puppeteer');
const functions = require('firebase-functions');
const https = require('https');
const bent = require('bent');

exports.scrapeNova = functions
  .runWith({
    timeoutSeconds: 500,
  })
  .https.onRequest(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // mock CET time
    await page.emulateTimezone('Europe/Brussels');
    // go to Nova
    await page.goto('https://www.nova.fr/c-etait-quoi-ce-titre/');
    // accept cookies
    await page.click('[id="didomi-notice-agree-button"]');
    // get spotify links
    const data = await page.evaluate(async () => {
      const links = document.querySelectorAll('a');
      const urls = Array.from(links)
        .map((link) => link.href)
        .filter((href) => href.includes('spotify'));

      return urls;
    });

    /// SPOTIFY
    // create and go to authentication url
    const scope = ['playlist-modify-public', 'playlist-modify-private'].join(
      '%20'
    );
    const authorizeURL =
      'https://accounts.spotify.com/authorize' +
      '?' +
      'client_id=' +
      functions.config().spotify.clientid +
      '&response_type=' +
      functions.config().spotify.responsetype +
      '&redirect_uri=' +
      functions.config().spotify.redirecturi +
      '&scope=' +
      scope;
    await page.goto(authorizeURL);

    // connect to spotify
    await page.type('[name=username]', functions.config().spotify.email);
    await page.type('[name=password]', functions.config().spotify.password);
    await page.click('#login-button');
    await page.waitForTimeout(3000);

    // get auth token
    const url = page.url();
    const token = url.substring(url.indexOf('=') + 1, url.indexOf('&'));

    // create post request
    const playlistId = '5nITYoYcEb2APUjpsXicZD';
    const uris = data.map((trackUrl: string) => {
      const trackId = trackUrl.substring(trackUrl.indexOf('k') + 2);
      return `spotify:track:${trackId}`;
    });
    console.log('uris: ', uris);
    const req = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      hostname: 'https://api.spotify.com',
      path: `/v1/playlists/${playlistId}/tracks`,
      body: {
        uris: uris,
      },
    };
    const request = https.request(req, (res: any) => {
      console.log('res: ', res);
    });

    const request2 = bent(req);

    console.log('req2 : ', request2);

    console.log('request : ', request);

    await browser.close();

    console.log(data);

    return data;
  });
