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

    await page.screenshot({ path: '1.png' });

    const hours = new Date(Date.now()).getHours();

    let data: string[] = [];
    console.log('coucou');
    let k = 0;
    while (k < hours) {
      // change the hour on form
      await page.select(
        'body > div.wrap > div.content > main > div.filter_bar.js-sticky.d-lg-block.d-none > div > div > div > div > div:nth-child(4) > label > select',
        hours > 10 ? `${hours - 1}` : `0${hours - 1}`
      );
      await page.screenshot({ path: '2.png' });

      await page.evaluate(() => {
        const element: HTMLElement | null = document.querySelector(
          '#js-mobile-program-filter > a'
        );
        element?.click();
      });

      await page.screenshot({ path: '3.png' });

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
