const puppeteer = require('puppeteer');
const functions = require('firebase-functions');

exports.scrapeImages = functions
  .runWith({
    timeoutSeconds: 500,
  })
  .https.onRequest(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // mock CET
    await page.emulateTimezone('Europe/Brussels');
    // go to Nova
    await page.goto('https://www.nova.fr/c-etait-quoi-ce-titre/');
    // accept cookies
    await page.click('[id="didomi-notice-agree-button"]');
    // get spotify links
    const data = await page.evaluate(async () => {
      // TODO: add click on load more first
      const links = document.querySelectorAll('a');
      const urls = Array.from(links)
        .map((link) => link.href)
        .filter((href) => href.includes('spotify'));

      return urls;
    });

    await browser.close();

    console.log(data);

    return data;
  });
