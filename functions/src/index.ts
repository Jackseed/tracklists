const puppeteer = require('puppeteer');
const functions = require('firebase-functions');

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
    const scope = ['playlist-modify-public', 'playlist-modify-private'].join(
      '%20'
    );
    // authentication url
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

    console.log(authorizeURL);

    await page.goto(authorizeURL);

    await page.type('[name=username]', functions.config().spotify.email);

    await page.type('[name=password]', functions.config().spotify.password);

    await page.screenshot({ path: '1.png' });

    await page.click('#login-button');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '4.png' });

    await browser.close();

    console.log(data);

    return data;
  });
