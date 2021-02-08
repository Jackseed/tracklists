const functions = require('firebase-functions');
const playwright = require('playwright');

exports.scrapeImages = functions
  .runWith({
    timeoutSeconds: 500,
  })
  .https.onRequest(async (res: any) => {
    // Randomly select a browser
    // You can also specify a single browser that you prefer
    for (const browserType of ['chromium', 'firefox', 'webkit']) {
      console.log(browserType); // To know the chosen one 😁
      const browser = await playwright[browserType].launch();
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto('https://www.nova.fr/c-etait-quoi-ce-titre/');
      // Login form
      // set a delay to wait for page to completely load all contents
      await page.waitForTimeout(9000);
      // You can also take screenshots of pages
      await page.screenshot({
        path: `ig-sign-in.png`,
      });
      // Execute code in the DOM
      const data = await page.evaluate(() => {
        const images = document.querySelectorAll('img');
        const urls = Array.from(images).map((v) => v.src);
        return urls;
      });
      await browser.close();
      console.log(data);
      // Return the data in form of json
      return;
    }
  });
