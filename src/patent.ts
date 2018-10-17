import express from 'express';
const router = express.Router();
import { Response } from 'koa';
import puppeteer from 'puppeteer';
import request from 'request';
import { traceImage } from './trace';
const requestFetch = request.defaults({ encoding: null });

// this is attempting to scrape google patents page for images. will come as jpeg already and not have to download entire pdf
router.post('/fetch', (req, res) => {

  console.log('Requested Patent: ', req.body.patent);

  const scrapePatentImages = async (patentNumber: string) => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.goto(`https://patents.google.com/patent/${patentNumber}`);

    // wait for page to get started
    await page.waitFor(1000);

    // wait for images to load
    await page.waitForSelector('.image-carousel');

    const result = await page.evaluate(() => {

      const data = []; // Create an empty array that will store our data
      const images = document.querySelectorAll('img.image-carousel');

      for (const image of images) {
        data.push(image.src);
      }

      // return images.map((image) => image.src);
      return data;
    });

    await browser.close();
    return result;
  };

  scrapePatentImages(req.body.patent).then((imagePaths) => {
    console.log(imagePaths);

    // remove the /thumbnails part of url path to get larger image
    res.send({resp: imagePaths.map((image) => image.split('/thumbnails').join(''))});
  },
  (err) => res.send(JSON.stringify({ err })));
},
(err) => console.log(err));

// tracing patent and returning
router.post('/trace', (req, res) => {
  console.log(req.body.patent);
  requestFetch.get(req.body.patent, (body) => {
    traceImage(body, req.body.color)
      .then(
        (svg) => res.send({resp: svg}),
        (traceErr) => console.log(traceErr),
      );
  });
},
(err) => console.log(err));

export default router;
