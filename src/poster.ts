import aws from 'aws-sdk';
import express from 'express';
const router = express.Router();
import multer from 'multer';
import pdfMake from 'pdfmake/build/pdfmake';
import sharp from 'sharp';
import util from 'util';

const upload = multer({ storage: multer.memoryStorage(), limits: { fieldSize: 25 * 1024 * 1024 } });
// Access key and secret id being pulled from env vars and in my drive as backup
aws.config.update({ region: process.env.AWS_REGION });
const bucketName = process.env.NODE_ENV === 'production' ? 'packonmyback-production' : 'packonmyback-dev';
const photoBucket = process.env.NODE_ENV === 'production' ? new aws.S3({params: {Bucket: 'packonmyback-production'}}) : new aws.S3({params: {Bucket: 'packonmyback-dev'}});

router.post('/process', upload.single('poster'), (req, res) => {

  const S3LinksArr: Array<{ type: 'thumbnail' | 'pdf', S3Url: string }> = [];

  // create local thumbnail 220 x 330 jpg (will depend on orientation) and upload to S3 and return with response to be added to custom product field
  const thumbnailPromise: any = new Promise((resolve, reject) => {
    resizeAndUploadImage(req.body.poster, [{ width: 250 }], 80, 'jpeg', 'thumbnail').then((data) => {
      console.log('Processed img link arr: ', data);

      S3LinksArr.push(data);
      resolve(); // resolve for resize img promise
    });
  });
  // create a pdf for our image and upload to S3 and return with response to be added to custom product field
  const pdfPromise: any = new Promise((resolve, reject) => {
    createAndUploadPDF(req.body.poster).then((data) => {
      console.log('Processed img link arr: ', data);

      S3LinksArr.push(data);
      resolve(); // resolve for pdf promise
    });
  });

  Promise.all([thumbnailPromise, pdfPromise]).then(() => {
    console.log('promise all complete');
    res.send(JSON.stringify(S3LinksArr));
  });
},
(err) => console.log(err));

///////////////////////////////////////////////////////
/////////////////// Resizing
///////////////////////////////////////////////////////

// Take in img file, what sizes we would like, and the quality of img
function resizeAndUploadImage(file: string, sizes: Array<{ width: number }>, quality: number, type: 'png' | 'jpeg' | 'webp', name?: string): Promise <{ type: 'thumbnail' | 'pdf', S3Url: string }> {
  const posterImg = Buffer.from(file.split('data:image/png;base64,')[1], 'base64');

  return new Promise((resolveFn) => { // promise for the overall resize img function
    const promiseArr: Array<{ type: 'thumbnail' | 'pdf', S3Url: string }> = [];
    let returnData: { type: 'thumbnail' | 'pdf', S3Url: string };

    sizes.forEach((size) => {
      const promise: any = new Promise((resolve, reject) => { // promise for each size of the image
        sharp(posterImg)
          .clone()
          .resize(size.width)
          .toFormat(type, { quality })
          .toBuffer()
          .then(
            (buffer) => {
              // might be nice for a more descriptive name eventually
              const key = `poster-${name}-${Date.now()}.${type}`;
              uploadToS3(buffer, key, (err: Error, data: any) => {
                if (err) {
                  console.error(err);
                  reject(err);
                }
                returnData = {type: 'thumbnail', S3Url: data.Location};
                resolve();
              });
            },
            (err) => console.log('Sharp Err: ', err),
          );
      });
      promiseArr.push(promise);
    });

    Promise.all(promiseArr).then(() => {
      console.log('resize img promise all complete');
      resolveFn(returnData); // resolve for resize img fn promise
    });
  });
}

///////////////////////////////////////////////////////
/////////////////// PDF Processing
///////////////////////////////////////////////////////

function createAndUploadPDF(image: string): Promise <{ type: 'thumbnail' | 'pdf', S3Url: string }> {
  return new Promise((resolve) => {
    const docDefinition = {
      content: [
        {
          height: 792.00,
          image,
          width: 612.00,
        },
      ],
      pageMargins: [0, 0, 0, 0],
      pageSize: 'LETTER', // pageSize: { width: 612.00, height: 792.00},
    };

    const pdfDocGenerator = pdfMake.createPdf(docDefinition);
    (pdfDocGenerator as any).getBase64((pdf: any) => {
      // console.log('Is buffer: ', util.isBuffer(buffer));
      // console.log(pdf);
      const posterImg = Buffer.from(pdf, 'base64');
      // might be nice for a more descriptive name eventually
      const key = `poster-pdf-${Date.now()}.pdf`;
      uploadToS3(posterImg, key, (err: Error, data: any) => {
        if (err) {
          console.error('S3 upload err: ', err);
        }
        resolve({ type: 'pdf', S3Url: data.Location });
      });
    });
  });
}

///////////////////////////////////////////////////////
/////////////////// Save To S3
///////////////////////////////////////////////////////

function uploadToS3(buffer: Buffer, destFileName: string, callback: any) {
  return new Promise((resolve, reject) => {
    photoBucket
      .upload({
          ACL: 'public-read',
          Body: buffer,
          Bucket: bucketName,
          ContentType: 'application/octet-stream', // force download if it's accessed as a top location
          Key: destFileName, // file name
      })
      // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3/ManagedUpload.html#httpUploadProgress-event
      // .on('httpUploadProgress', function(evt) { console.log(evt); })
      // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3/ManagedUpload.html#send-property
      .send(callback);
    });
}

export default router;
