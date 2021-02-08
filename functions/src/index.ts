const puppeteer = require('puppeteer');
const functions = require('firebase-functions');

exports.scrapeImages = functions
  .runWith({
    timeoutSeconds: 500,
  })
  .https.onRequest(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // easier to stay in GMT+0
    // await page.emulateTimezone('Europe/Brussels');

    await page.goto('https://www.nova.fr/c-etait-quoi-ce-titre/');

    await page.click('[id="didomi-notice-agree-button"]');

    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 0.75,
    });

    await page.screenshot({ path: '2.png' });

    const hours = new Date(Date.now()).getHours();

    let data: string[] = [];

    let k = 0;
    while (k < hours) {
      // await page.select('#telCountryInput', 'my-value');

      // Execute code in the DOM
      const newData = await page.evaluate(async () => {
        // TODO: add click on load more first
        const links = document.querySelectorAll('a');

        const urls = Array.from(links)
          .map((link) => link.href)
          .filter((href) => href.includes('spotify'));

        return urls;
      });

      data = data.concat(newData);

      k++;
      console.log(hours - k);
    }

    await browser.close();

    console.log(data);

    return data;
  });
