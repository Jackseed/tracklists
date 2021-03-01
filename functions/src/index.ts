const puppeteer = require('puppeteer');
const functions = require('firebase-functions');
const axios = require('axios').default;

// Nouvo nova
const nouvoNovaPlaylistId = '3MRJIbMsOLRn4Hd5w1J5By';
const nouvoNovaFrequence = '79676';

const nova = [
  {
    name: 'Radio Nova',
    playlistId: '5nITYoYcEb2APUjpsXicZD',
    frequence: '910',
  },
  {
    name: 'Nouvo Nova',
    playlistId: '2VYVl952NXzcHm5XzANoBD',
    frequence: '79676',
  },
  {
    name: 'Nova la Nuit',
    playlistId: '2vRlYWuxhtfLt7U4Wrqjti',
    frequence: '916',
  },
  {
    name: 'Nova Classics',
    playlistId: '55pdI0LoiQtzZcTfrjHLk2',
    frequence: '913',
  },
  {
    name: 'Nova Danse',
    playlistId: '2go0Bv3qWnauC70f3UAOUu',
    frequence: '560',
  },
];
console.log(nova[0].name);

const limitTracksToCheck = 10;

/// PUB SUB JOB
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
    await axios({
      url: 'https://us-central1-listy-bcc65.cloudfunctions.net/scrapeNouvoNova',
    }).then(
      (response: any) => {
        console.log(response.status);
      },
      (error: any) => {
        console.log('error: ', error);
      }
    );
  });

/// SCRAPE NOVA

exports.scrapeNova = functions
  .runWith({
    timeoutSeconds: 500,
  })
  .https.onRequest(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    // SCRAPE DATA
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

    await browser.close();

    /// SAVE ON SPOTIFY
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

    let token;

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
      novaPlaylistTotal - limit > 0 ? novaPlaylistTotal - limit : 0;
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
    if (filteredIds.length > 0) {
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
    }

    console.log(trackIds, lastTrackIds, filteredIds);

    return filteredIds;
  });

/// SCRAPE NOUVO NOVA

exports.scrapeNouvoNova = functions
  .runWith({
    timeoutSeconds: 500,
  })
  .https.onRequest(async () => {
    const trackIds = await scrapeNovaTrackIds(nouvoNovaFrequence);

    const headers = await getSpotifyAuthHeaders();

    const playlistLastTrackIds = await getPlaylistLastTrackIds(
      headers,
      nouvoNovaPlaylistId,
      20
    );

    // filter nova trackIds with duplicates
    const filteredIds = trackIds.filter(
      (id) => !playlistLastTrackIds.includes(id)
    );

    // format uris
    const uris = filteredIds.map((id) => `spotify:track:${id}`).reverse();

    await saveTracksToPlaylist(headers, nouvoNovaPlaylistId, uris);

    return filteredIds;
  });

exports.test = functions
  .runWith({
    timeoutSeconds: 500,
  })
  .https.onRequest(async (req: any, res: any) => {
    const radios = [
      {
        name: 'Radio Nova',
        playlistId: '5nITYoYcEb2APUjpsXicZD',
        frequence: '910',
      },
      {
        name: 'Nouvo Nova',
        playlistId: '2VYVl952NXzcHm5XzANoBD',
        frequence: '79676',
      },
      {
        name: 'Nova la Nuit',
        playlistId: '2vRlYWuxhtfLt7U4Wrqjti',
        frequence: '916',
      },
      {
        name: 'Nova Classics',
        playlistId: '55pdI0LoiQtzZcTfrjHLk2',
        frequence: '913',
      },
      {
        name: 'Nova Danse',
        playlistId: '2go0Bv3qWnauC70f3UAOUu',
        frequence: '560',
      },
    ];

    const requestsArray = radios.map((radio) => {
      const request = axios({
        headers: {
          'Content-Type': 'application/json',
        },
        url:
          'https://us-central1-listy-bcc65.cloudfunctions.net/saveNovaOnSpotify',
        data: {
          playlistId: radio.playlistId,
          frequence: radio.frequence,
        },
        method: 'POST',
      });

      return request;
    }); /*
    for (const radio of radios) {
      console.log('saving ', radio.name);
      await axios({
        url:
          'https://us-central1-listy-bcc65.cloudfunctions.net/saveNovaOnSpotify',
        data: {
          playlistId: radio.playlistId,
          frequence: radio.frequence,
        },
      }).then(
        (response: any) => {
          console.log(response.status);
        },
        (error: any) => {
          console.log('error: ', error);
        }
      );
    } */
    await Promise.all(
      requestsArray.map(async (request) => {
        return await request.then(
          (response: any) => {
            console.log(response.status);
          },
          (error: any) => {
            console.log('error: ', error);
          }
        );
      })
    )
      .then(() => {
        res.status(200).send('All good!');
      })
      .catch((err) => res.status(200).send('Something broke!', err));
  });

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
