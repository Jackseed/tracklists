const puppeteer = require('puppeteer');
const functions = require('firebase-functions');
const axios = require('axios').default;

const nova = [
  {
    name: 'Radio Nova',
    playlistId: '2kd7wreZ51xM9KrkF3xPox',
    frequence: '910',
  },
  {
    name: 'Nouvo Nova',
    playlistId: '4fxqATQXbmXjHUPlHLk54g',
    frequence: '79676',
  },
  {
    name: 'Nova la Nuit',
    playlistId: '1uXG44v8EbFgaR724jXqLC',
    frequence: '916',
  },
  {
    name: 'Nova Classics',
    playlistId: '5k08QyqqhyZuybx2MicjIZ',
    frequence: '913',
  },
  {
    name: 'Nova Danse',
    playlistId: '1YiJ3XNPAfVAA3FGBejpRd',
    frequence: '560',
  },
];
const limitTracksToCheck = 10;

/// PUB SUB JOB
export const saveNovaEveryFiveMinutes = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (req: any, res: any) => {
    // create a request per radio
    const requestsArray = nova.map((radio) => {
      const request = axios({
        headers: {
          'Content-Type': 'application/json',
        },
        url: 'https://us-central1-listy-prod.cloudfunctions.net/saveNovaOnSpotify',
        data: {
          playlistId: radio.playlistId,
          frequence: radio.frequence,
        },
        method: 'POST',
      });

      return request;
    });
    // send requests
    await Promise.all(
      requestsArray.map(async (request) => {
        return await request
          .then((response: any) => {
            console.log('promises well sent');
          })
          .catch((err: any) => console.log('Something broke!', err));
      })
    )
      .then(() => {
        console.log('All good!');
      })
      .catch((err) => console.log('something went wrong.. ', err));
  });

////////////////// SAVE NOVA SONGS ON SPOTIFY //////////////////
exports.saveNovaOnSpotify = functions
  .runWith({
    timeoutSeconds: 500,
  })
  .https.onRequest(async (req: any, res: any) => {
    const trackIds = await scrapeNovaTrackIds(req.body.frequence);

    const headers = await getSpotifyAuthHeaders();

    const playlistLastTrackIds = await getPlaylistLastTrackIds(
      headers,
      req.body.playlistId,
      limitTracksToCheck
    );

    // filter nova trackIds with duplicates
    const filteredIds = trackIds.filter(
      (id) => !playlistLastTrackIds.includes(id)
    );

    // format uris
    const uris = filteredIds.map((id) => `spotify:track:${id}`).reverse();

    const response = await saveTracksToPlaylist(
      headers,
      req.body.playlistId,
      uris
    );

    res.end(response);
  });

/////////////////////// SCRAPE NOVA ///////////////////////
async function scrapeNovaTrackIds(radioValue: string): Promise<string[]> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  // mock CET time
  await page.emulateTimezone('Europe/Brussels');

  // go to Nova
  await page.goto('https://www.nova.fr/c-etait-quoi-ce-titre/');
  // accept cookies
  await page.click('[id="didomi-notice-agree-button"]');
  // select nouvo nova radio
  await page.select('#radio', radioValue);

  // save the form
  await page.evaluate(() => {
    const element: HTMLElement | null = document.querySelector(
      '#js-mobile-program-filter > a'
    );
    element?.click();
  });

  // wait for page to load
  await page.waitForTimeout(2000);

  // get spotify links
  const data = await page.evaluate(async () => {
    const links = document.querySelectorAll('a');
    const urls = Array.from(links)
      .map((link) => link.href)
      .filter((href) => href.includes('spotify'));

    return urls;
  });

  await browser.close();

  // save trackIds
  const trackIds: string[] = [];
  data.map((trackUrl: string) => {
    const trackId = trackUrl.substring(trackUrl.indexOf('k') + 2);
    trackIds.push(trackId);
  });

  return trackIds;
}

/////////////////////// HEADERS ///////////////////////
async function getSpotifyAuthHeaders(): Promise<Object> {
  // refresh access token
  const secret = Buffer.from(
    `${functions.config().spotify.clientid}:${
      functions.config().spotify.clientsecret
    }`
  ).toString('base64');

  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', functions.config().spotify.refreshtoken);

  const config = {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${secret}`,
    },
  };

  let token = '';

  await axios
    .post('https://accounts.spotify.com/api/token', params, config)
    .then(
      (response: any) => {
        token = response.data.access_token;
      },
      (error: any) => {
        console.log('error: ', error);
      }
    );

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  return headers;
}

/////////////////////// GET PLAYLIST LAST TRACK IDS ///////////////////////
async function getPlaylistLastTrackIds(
  headers: Object,
  playlistId: string,
  limit: number
): Promise<string[]> {
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
  const offset = novaPlaylistTotal - limit > 0 ? novaPlaylistTotal - limit : 0;
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

  return lastTrackIds;
}

/////////////////////// SAVE TRACKS TO SPOTIFY ///////////////////////
async function saveTracksToPlaylist(
  headers: Object,
  playlistId: string,
  uris: string[]
): Promise<string> {
  let res = '';
  // add tracks to playlist
  if (uris.length > 0) {
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
        res = `response status: ${response.status}`;
      },
      (error: any) => {
        console.log('error: ', error);
        res = `error: ${error}`;
      }
    );
  }
  return res;
}

////////////////// REQUEST SPOTIFY REFRESH OR ACCESS TOKENS //////////////////
exports.getSpotifyToken = functions
  .runWith({
    timeoutSeconds: 500,
  })
  .https.onCall(async (data: any, context: any) => {
    const secret = Buffer.from(
      `${functions.config().spotify.clientid}:${
        functions.config().spotify.clientsecret
      }`
    ).toString('base64');

    const params = new URLSearchParams();
    // same function for either getting an access & refresh tokens (through code, tokenType access) or an access token through refresh token
    if (data.tokenType === 'access') {
      params.append('grant_type', 'authorization_code');
      params.append('code', data.code);
      params.append('redirect_uri', 'https://tracklists.io/home');
    } else {
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', data.refreshToken);
    }

    const config = {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${secret}`,
      },
    };

    let token = '';
    let refresh_token = '';

    await axios
      .post('https://accounts.spotify.com/api/token', params, config)
      .then(
        (response: any) => {
          token = response.data.access_token;
          if (data.tokenType === 'access') {
            refresh_token = response.data.refresh_token;
            console.log(refresh_token);
          }
        },
        (error: any) => {
          console.log('error: ', error);
        }
      );

    // save tokens on db
    await axios({
      headers: {
        'Content-Type': 'application/json',
      },
      url: 'https://us-central1-listy-prod.cloudfunctions.net/saveToken',
      data: {
        token,
        refreshToken: refresh_token,
        tokenType: data.tokenType,
        userId: data.userId,
      },
      method: 'POST',
    }).catch((err: any) => console.log('error: ', err));

    return { token, refresh_token };
  });

const admin = require('firebase-admin');
admin.initializeApp();

exports.saveToken = functions
  .runWith({
    timeoutSeconds: 60,
  })
  .https.onRequest(async (req: any, res: any) => {
    const accessToken = req.body.token;
    let tokens: { access: string; addedTime: Object; refresh?: string } = {
      access: accessToken,
      addedTime: admin.firestore.FieldValue.serverTimestamp(),
    };
    // add refresh token only when requesting an access token for the first time
    if (req.body.tokenType === 'access')
      tokens = { ...tokens, refresh: req.body.refreshToken };

    await admin.firestore().collection('users').doc(req.body.userId).set(
      {
        tokens,
      },
      { merge: true }
    );

    res.json({ result: `Access token successfully added: ${accessToken}.` });
  });
