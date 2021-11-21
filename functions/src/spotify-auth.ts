import functions = require('firebase-functions');
import { Tokens } from './data';
import { createFirebaseAccount } from './firestore-write';
const axios = require('axios').default;
const admin = require('firebase-admin');

//--------------------------------
//    Requests Spotify token    //
//--------------------------------
// Gets either an access or refresh Spotify token.
export async function getSpotifyToken(data: any): Promise<Tokens> {
  const secret = Buffer.from(
    `${functions.config().spotify.clientid}:${
      functions.config().spotify.clientsecret
    }`
  ).toString('base64');

  const params = new URLSearchParams();
  // Parameters change whether it's an access or a refresh token.
  if (data.tokenType === 'access') {
    params.append('grant_type', 'authorization_code');
    params.append('code', data.code);
    params.append('redirect_uri', functions.config().spotify.redirecturi);
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
  let custom_auth_token = '';
  let userId = data.userId ? data.userId : '';

  // Requests token to Spotify.
  await axios
    .post('https://accounts.spotify.com/api/token', params, config)
    .then(
      (response: any) => {
        token = response.data.access_token;
        if (data.tokenType === 'access') {
          refresh_token = response.data.refresh_token;
        }
      },
      (error: any) => {
        console.log('error: ', error);
      }
    );
 
  // Refresh token means first connexion.
  if (refresh_token) {
    // Create a user based on Spotify user info.
    await axios
      .get('https://api.spotify.com/v1/me', {
        headers: { Authorization: 'Bearer ' + token },
      })
      .then(async (response: any) => {
        const uid = response.data.id;
        const displayName = response.data.display_name;
        const email = response.data.email;
        userId = uid;

        custom_auth_token = await createFirebaseAccount(
          uid,
          displayName,
          email
        );
      })
      .catch((error: any) => console.log(error.response.data));
  }

  // Saves tokens on Firestore.
  await axios({
    headers: {
      'Content-Type': 'application/json',
    },
    url: functions.config().spotify.savetokenfunction,
    data: {
      token,
      refreshToken: refresh_token,
      tokenType: data.tokenType,
      userId,
    },
    method: 'POST',
  }).catch((err: any) => console.log('error: ', err));
  return { token, refresh_token, custom_auth_token };
}

//--------------------------------
//   Saves token to Firestore  //
//--------------------------------
// Saves Spotify access or refresh token to Firestore 'user' document.
export async function saveToken(req: any, res: any) {
  const accessToken = req.body.token;
  if (accessToken) {
    let tokens: { access: string; addedTime: Object; refresh?: string } = {
      access: accessToken,
      addedTime: admin.firestore.FieldValue.serverTimestamp(),
    };
    // Adds refresh token only when requesting an access token for the first time.
    if (req.body.tokenType === 'access')
      tokens = { ...tokens, refresh: req.body.refreshToken };

    await admin.firestore().collection('users').doc(req.body.userId).set(
      {
        tokens,
      },
      { merge: true }
    );

    res.json({ result: `Access token successfully added: ${accessToken}.` });
  } else {
    res.json({ result: `Empty token.` });
  }
}
