const puppeteer = require('puppeteer');
const functions = require('firebase-functions');

exports.scrapeImages = functions
  .runWith({
    timeoutSeconds: 500,
  })
  .https.onRequest(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.emulateTimezone('Europe/Brussels');

    await page.goto('https://www.nova.fr/c-etait-quoi-ce-titre/');
    // accept cookies
    await page.click('[id="didomi-notice-agree-button"]');
    // set viewPort width
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 0.75,
    });

    await page.screenshot({ path: '1.png' });

    const hours = new Date(Date.now()).getHours();

    let data: string[] = [];
    // TEST
    // change date
    await page.type('input[name="programDate"]', `07/02/2021`);

    const result = await page.evaluate(() => {
      const elements: NodeListOf<HTMLElement> = document.getElementsByName(
        'programDate'
      );
      const input2 = elements[0] as HTMLInputElement;
      return input2.value;
    });
    console.log('result: ', result);

    // save the form
    await page.evaluate(() => {
      const element: HTMLElement | null = document.querySelector(
        '#js-mobile-program-filter > a'
      );
      element?.click();
    });

    await page.screenshot({ path: 'test.png' });

    let k = 0;
    while (k < hours) {
      // change date
      await page.type('input[name="programDate"]', `08/02/2021`);

      const result2 = await page.evaluate(() => {
        const elements: NodeListOf<HTMLElement> = document.getElementsByName(
          'programDate'
        );
        const input2 = elements[0] as HTMLInputElement;
        return input2.value;
      });
      console.log('result 2: ', result2);
      // change the hour on form
      await page.select(
        'body > div.wrap > div.content > main > div.filter_bar.js-sticky.d-lg-block.d-none > div > div > div > div > div:nth-child(4) > label > select',
        hours > 10 ? `${hours - k}` : `0${hours - k}`
      );
      await page.screenshot({ path: '2.png' });
      // save the form
      await page.evaluate(() => {
        const element: HTMLElement | null = document.querySelector(
          '#js-mobile-program-filter > a'
        );
        element?.click();
      });

      await page.screenshot({ path: '3.png' });

      // get spotify links
      const newData = await page.evaluate(async () => {
        // TODO: add click on load more first
        const links = document.querySelectorAll('a');
        const urls = Array.from(links)
          .map((link) => link.href)
          .filter((href) => href.includes('spotify'));

        return urls;
      });

      /*       await page.evaluate(() => {
        const element: HTMLElement | null = document.querySelector(
          '#js-mobile-program-filter > a'
        );
        element?.click();
      }); */

      await page.screenshot({ path: '4.png' });

      data = data.concat(newData);

      k++;
      console.log(hours - k);
    }

    await browser.close();

    console.log(data);

    return data;
  });
