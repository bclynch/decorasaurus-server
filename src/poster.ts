import aws from 'aws-sdk';
import express from 'express';
const router = express.Router();
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });
// Access key and secret id being pulled from env vars and in my drive as backup
aws.config.update({ region: process.env.AWS_REGION });
const bucketName = process.env.NODE_ENV === 'production' ? 'packonmyback-production' : 'packonmyback-dev';
const photoBucket = process.env.NODE_ENV === 'production' ? new aws.S3({params: {Bucket: 'packonmyback-production'}}) : new aws.S3({params: {Bucket: 'packonmyback-dev'}});

router.post('/process', upload.single('poster'), (req, res) => {

  // create local thumbnail 220 x 330 jpg (will depend on orientation) and send call to Moltin to uplod to file endpoint of product

  // create a pdf for our image and upload to S3 and return with response to be added to custom product field







  // posterizeImage(req.file.buffer, 3, req.body.color, null)
  //   .then(
  //     (svg) => res.send({ image: svg }),
  //     (err) => console.log(err),
  //   );
  },
  (err) => console.log(err),
);

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
