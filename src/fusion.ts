import axios from 'axios';
import { exec, spawn } from 'child_process';
import cron from 'cron';
// @ts-ignore
import curl from 'node-libcurl';
const Curl = curl.Curl;
import FormData from 'form-data';
import fs from 'fs';
import http from 'https';
import path from 'path';
import request from 'request';
const CronJob = cron.CronJob;
import { fetchFusionOrders } from './moltin';

let jobName: string;
let endpoint: string;

export function init() {
  // setup job to fire every night to process orders
  const job = new CronJob('00 47 16 * * *', () => {
    console.log('Starting to process fusion orders...');
    // first fetch new fusion orders from last day til present
    // figuring out custom fields for order item
    fetchFusionOrders().then(
      (orders) => {
        console.log(orders);

        // then filter out any that have the relevant custom field populated already

        // then turn on floydhub server
        // turnOnServer().then(
        //   () => turnOffServer(jobName),
        // );

        // then go one by one and fetch the img from S3 and send cropped image to floydhub for processing
        // downloadImage('https://packonmyback-dev.s3.us-west-1.amazonaws.com/poster-pdf-1542388439974.pdf', './temp/fusion.pdf').then(
        //   () => console.log('finished downloading'),
        // );

        // when received back from floydhub remove temp + process image into pdf and all then send to S3
        // fs.unlinkSync('./temp/fusion.pdf');

        // patch the moltin order with the S3 URL

        // once completed turn off server
      },
      (err) => console.log(err),
    );
  });
  // job.start();
  console.log('Fusion procesing cron job started');

  // const file = fs.readFileSync(path.resolve(__dirname, '../temp/posterRaw.jpeg'));
  // console.log(file);

  // const readStream = fs.createReadStream(path.resolve(__dirname, '../temp/posterRaw.jpeg'));
  // readStream.pipe(process.stdout);

  turnOnServer().then(
    () => {
      console.log('floyd server on');
      // downloadImage('https://packonmyback-dev.s3.us-west-1.amazonaws.com/poster-thumbnail-1542388439993.jpeg', './temp/posterRaw.jpeg').then(
      //   () => {
          // console.log('finished downloading image');
      abc();
          // sendToFloydhub('./temp/posterFused.jpg', './temp/posterRaw.jpeg', 'scream').then(
          //   () => {
          //     // fs.unlinkSync('./temp/posterRaw.jpeg');
          //     // turnOffServer(jobName).then(
          //     //   () => console.log('finished processing fusion posters'),
          //     // );
          //   },
          // );
        // },
      // );
    },
  );
}

export function turnOnServer(): Promise<void> {
  return new Promise((resolve, reject) => {

    const child = spawn('cd ../fast-style-transfer && floyd run --env tensorflow-1.5 --data narenst/datasets/neural-style-transfer-pre-trained-models/1:input --mode serve', [], { shell: true });
    child.stderr.on('data', (data) => {
      console.error('STDERR:', data.toString());
    });
    child.stdout.on('data', (data) => {
      const message = data.toString();
      console.log('STDOUT:', message);
      // get ref to job name so we can turn off server when finished with fusions
      if (message.split(':')[0] === 'URL to job') {
        jobName = message.split('projects/')[1];
      }
      // this is last message from Floyd so it's spun up and we can start sending images over
      if (message.split(':')[0] === 'URL to service endpoint') {
        endpoint = message.split('endpoint:')[1].trim();
        console.log(endpoint)
      }
    });
    child.on('exit', (exitCode) => {
      console.log('Child exited with code: ' + exitCode);
      resolve();
    });
  });
}

export function turnOffServer(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(`cd ../fast-style-transfer && floyd stop ${name}`, [], { shell: true });
    child.stderr.on('data', (data) => {
      console.error('STDERR:', data.toString());
    });
    child.stdout.on('data', (data) => {
      const message = data.toString();
      console.log('STDOUT:', message);
    });
    child.on('exit', (exitCode) => {
      console.log('Child exited with code: ' + exitCode);
      resolve();
    });
  });
}

function sendToFloydhub(outputPath: string, inputPath: string, painting: 'udnie' | 'rain_princess' | 'scream' | 'wave' | 'wreck' | 'la_muse'): Promise<void> {
  return new Promise((resolve, reject) => {
    // const child = spawn(`curl -o "${outputPath}" -F "file=@${inputPath}" -F "checkpoint=${painting}.ckpt" ${endpoint}`, [], { shell: true });
    const child = spawn(`curl -o "./temp/posterFused.jpg" -F "file=@./temp/posterRaw.jpeg" -F "checkpoint=wave.ckpt" ${endpoint}`, [], { shell: true });
    child.stderr.on('data', (data) => {
      console.error('STDERR:', data.toString());
    });
    child.stdout.on('data', (data) => {
      const message = data.toString();
      console.log('STDOUT:', message);
    });
    child.on('exit', (exitCode) => {
      console.log('Child exited with code: ' + exitCode);
      resolve();
    });
  });
}

function abc() {
  // const fuckingCurl = new Curl();

  // const data = [
  //   {
  //     name: 'checkpoint',
  //     contents: 'wave.ckpt',
  //   },
  //   {
  //     name: 'file',
  //     file: imageFilename,
  //     type: 'image/jpeg',
  //   },
  // ];
  // // fuckingCurl.setOpt('URL', 'www.google.com');
  // fuckingCurl.setOpt('URL', endpoint);
  // fuckingCurl.setOpt(Curl.option.HTTPPOST, data);

  // fuckingCurl.on('end', (statusCode, body, headers) => {

  //     console.info(statusCode);
  //     console.info('---');
  //     console.info(body.length);
  //     console.info('---');

  //     fuckingCurl.close();
  // });

  // fuckingCurl.on('error', fuckingCurl.close.bind(fuckingCurl));
  // fuckingCurl.perform();

    // const args = ` -o "./temp/posterFused.jpg" -F "file=@./temp/posterRaw.jpeg" -F "checkpoint=wave.ckpt" ${endpoint}`;

    // exec('curl ' + args, (error, stdout, stderr) => {
    //   console.log('stdout: ' + stdout);
    //   console.log('stderr: ' + stderr);
    //   if (error !== null) {
    //     console.log('exec error: ' + error);
    //   }
    // });

    // console.log('ENDPOINT: ', endpoint);
    // const formData = {
    //   checkpoint: 'wave.ckpt',
    //   my_file: fs.readFileSync(path.resolve(__dirname, '../temp/posterRaw.jpeg')),
    // };
    // request.post({ url: endpoint, formData }, function optionalCallback(err, httpResponse, body) {
    //   if (err) {
    //     return console.error('upload failed:', err);
    //   }
    //   console.log('Upload successful!  Server responded with:', body);
    //   // console.log(body);
    // });

    // console.log('ENDPOINT: ', endpoint);
    // console.log(fs.createReadStream('/Users/bclynch/Desktop/github/poster-server/temp/posterRaw.jpeg'));

    // // const form = new FormData();
    // // form.append('checkpoint', 'wave.ckpt');
    // // form.append('file', fs.createReadStream('/Users/bclynch/Desktop/github/poster-server/temp/posterRaw.jpeg'));
    // const options = {
    //   method: 'POST',
    //   url: endpoint,
    //   headers:
    //   { 'Postman-Token': '8a485d6b-9451-4c6a-87ac-d28b29e3b34a',
    //     'Cache-Control': 'no-cache',
    //     'Content-Type': 'application/x-www-form-urlencoded',
    //     'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW' },
    //   formData:
    //   { checkpoint: 'scream.ckpt',
    //     file:
    //       { value: 'fs.createReadStream("/Users/bclynch/Desktop/github/poster-server/temp/posterRaw.jpeg")',
    //         options:
    //         { filename: '/Users/bclynch/Desktop/github/poster-server/temp/posterRaw.jpeg',
    //           contentType: null } } } };

    // console.log(options);

    // request(options, (error, response, body) => {
    //   if (error) throw new Error(error);

    //   console.log(response);
    //   console.log('BODY RESP: ', body);
    // });

    const form = new FormData();
    form.append('checkpoint', 'wave.ckpt');
    // form.append('file', fs.createReadStream('/Users/bclynch/Desktop/github/poster-server/temp/posterRaw.jpeg'));
    form.append('file', fs.createReadStream(path.resolve(__dirname, '../temp/posterRaw.jpeg')), { filename: 'posterRaw.jpeg' });

    axios.post(endpoint, form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).then((result) => {
      // Handle result…
      console.log(result);
    },
    (err) => console.log(err));

    // const options = {
    //   'method': 'POST',
    //   'hostname': [
    //     'www',
    //     'floydlabs',
    //     'com',
    //   ],
    //   'path': [
    //     'serve',
    //     'uiPBsY25vUJJW9MsUX2R6X',
    //   ],
    //   'headers': {
    //     'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW',
    //     'Content-Type': 'application/x-www-form-urlencoded',
    //     'Cache-Control': 'no-cache',
    //     'Postman-Token': 'cf504d23-0d7b-4c32-9348-25a722a095a7',
    //   },
    // };

    // const req = http.request(options, (res) => {
    //   let chunks = [];

    //   res.on('data', function (chunk) {
    //     chunks.push(chunk);
    //   });

    //   res.on('end', function () {
    //     const body = Buffer.concat(chunks);
    //     console.log(body.toString());
    //   });
    // });

    // req.write("------WebKitFormBoundary7MA4YWxkTrZu0gW\r\nContent-Disposition: form-data; name=\"checkpoint\"\r\n\r\nscream.ckpt\r\n------WebKitFormBoundary7MA4YWxkTrZu0gW\r\nContent-Disposition: form-data; name=\"file\"; filename=\"posterRaw.jpeg\"\r\nContent-Type: image/jpeg\r\n\r\n\r\n------WebKitFormBoundary7MA4YWxkTrZu0gW--");
    // req.end();
}

function downloadImage(imageUrl: string, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    axios({ url: imageUrl, responseType: 'stream' }).then(
      (resp) => {
        resp.data.pipe( fs.createWriteStream( path ) );
        resolve();
      },
    );
  });
}
