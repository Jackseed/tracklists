import functions = require('firebase-functions');
const axios = require('axios').default;

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
    if (accessToken) {
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
    } else {
      res.json({ result: `Empty token.` });
    }
  });
