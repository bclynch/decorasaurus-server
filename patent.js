const express = require('express'),
router = express.Router(),
axios = require('axios'),
puppeteer = require('puppeteer'),
trace = require('./trace'),
path = require('path'),  
fs = require('fs'),
request = require('request').defaults({ encoding: null });

// this is attempting to scrape google patents page for images. will come as jpeg already and not have to download entire pdf
router.post('/fetch', (req, res) => {

  console.log('Requested Patent: ', req.body.patent);

  let scrapePatentImages = async (patentNumber) => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
  
    await page.goto(`https://patents.google.com/patent/${patentNumber}`);
  
    // wait for page to get started
    await page.waitFor(1000);
  
    // wait for images to load
    await page.waitForSelector('.image-carousel');
  
    const result = await page.evaluate(() => {
  
      let data = []; // Create an empty array that will store our data
      const images = document.querySelectorAll('img.image-carousel');

      for (var image of images){
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
  err => res.send(JSON.stringify({ err })));
},
err => console.log(err))

// this is attempting to download patent images from pdfs from USPTO API which seems limited. Will require subsequent processing to extract images and make pngs to trace.

// router.post('/', (req, res) => {

//   console.log(req.body);
//   // search if there is a response to the patent
//   axios.get(`https://developer.uspto.gov/ibd-api/v1/patent/application?documentId=${req.body.patent}&start=0&rows=1`).then(
//     (response) => {
//       const pdfPath = response.data.response.docs[0].pdfPath;
//       console.log(pdfPath);

//       async function downloadPDF(pdfPath) {

//         const url = pdfPath;
//         const filePath = path.resolve(__dirname, 'examples', 'cool.pdf');
      
//         // axios image download with response type "stream"
//         const response = await axios({
//           method: 'GET',
//           url,
//           responseType: 'stream'
//         });
      
//         // pipe the result stream into a file on disc
//         response.data.pipe(fs.createWriteStream(filePath))
      
//         // return a promise and resolve when download finishes
//         return new Promise((resolve, reject) => {
//           response.data.on('end', () => {
//             console.log('finished downloading pdf');
//             resolve()
//           })
      
//           response.data.on('error', () => {
//             reject()
//           })
//         })
      
//       }
      
//       if (pdfPath !== 'NOTAVAILABLE') {
//         downloadPDF(response.data.response.docs[0].pdfPath);
//         res.send({resp: 'You suck'})
//       } else {
//         res.send({resp: 'PDF Not Available'});
//       }
//     }
//   ).catch((err) => console.log(err))
// },
// err => console.log(err))

// tracing patent and returning
router.post('/trace', (req, res) => {
  console.log(req.body.patent);
  request.get(req.body.patent, function (err, response, body) {
    trace.traceImage(body, req.body.color, req.body.background)
      .then(
        svg => res.send({resp: svg}),
        err => console.log(err)
      )
  });
},
err => console.log(err))

module.exports = router;