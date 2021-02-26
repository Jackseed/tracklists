const puppeteer = require('puppeteer');
const functions = require('firebase-functions');
const axios = require('axios').default;

export const everyFiveMinuteJob = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    await axios({
      url: 'https://us-central1-listy-bcc65.cloudfunctions.net/scrapeNova',
    }).then(
      (response: any) => {
        console.log(response.status);
      },
      (error: any) => {
        console.log('error: ', error);
      }
    );
  });

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
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    await browser.close();

    // Nova playlist id
    const playlistId = '5n4YjXr8CReTshU81kTIJd';
    // save trackIds
    const trackIds: string[] = [];
    data.map((trackUrl: string) => {
      const trackId = trackUrl.substring(trackUrl.indexOf('k') + 2);
      trackIds.push(trackId);
    });

    // get nova playlist total track number
    let novaPlaylistTotal = 0;
    await axios({
      headers,
      url: `https://api.spotify.com/v1/playlists/${playlistId}`,
    }).then((response: any) => {
      novaPlaylistTotal = response.data.tracks.total;
    });

    // get nova playlist last track ids:
    // variables
    const limit = 20;
    const offset =
      novaPlaylistTotal - limit > 0 ? novaPlaylistTotal - limit > 0 : 0;
    const lastTracks: any[] = [];

    // request
    await axios({
      headers,
      url: `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`,
    }).then(
      (response: any) => {
        lastTracks.push(response.data.items);
      },
      (error: any) => {
        console.log('error: ', error);
      }
    );

    // formatting
    const lastTrackIds = lastTracks.map((track) => {
      return track.map((t: any) => t.track.id);
    })[0];

    // filter nova trackIds
    const filteredIds = trackIds.filter((id) => !lastTrackIds.includes(id));

    // format uris
    const uris = filteredIds.map((id) => `spotify:track:${id}`).reverse();

    // add tracks to playlist
    await axios({
      method: 'POST',
      headers,
      url: `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      data: {
        uris: uris,
      },
    }).then(
      (response: any) => {
        console.log('response status: ', response.status);
      },
      (error: any) => {
        console.log('error: ', error);
      }
    );

    return filteredIds;
  });
