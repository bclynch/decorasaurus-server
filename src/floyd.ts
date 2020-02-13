import axios from 'axios';
import { spawn } from 'child_process';
import express from 'express';
const router = express.Router();
import fs from 'fs';
import { Fusion } from '../types/fusion.type';
import { createAndUploadPDF } from './poster';
const db = require('../../db/index.js');

let isActive = false;
let jobName: string;
let endpoint: string;

router.get('/turn-on-server', (req, res) => {
  turnOnServer().then((result) => {
    console.log('RESULT: ', result);
    res.send(JSON.stringify({ jobName, endpoint }));
  });
});

router.get('/turn-off-server', (req, res) => {
  turnOffServer().then(() => res.send(JSON.stringify({ result: `Floyd server ${jobName} turned off` })));
});

router.get('/is-active', (req, res) => {
  res.send(JSON.stringify({ isActive, jobName, endpoint }));
});

router.post('/process-fusion', (req, res) => {
  const fusion: Fusion = req.body.fusion;

  // download the crop url sent from frontend
  // downloadImage(fusion.cropUrl, './temp/posterRaw.jpeg').then(
  //   () => {
  //     console.log('downloaded image: ', fusion.cropUrl);
  //     // might need to resize image depending on how big it is to make more efficient with the processing

  //     sendToFloydhub(fusion.type).then(
  //       () => {
          console.log('finished fusing image');
          const bitmap = fs.readFileSync('/Users/bclynch/Desktop/github/decorasaurus-server/temp/posterFused.jpg');
          // convert binary data to base64 encoded string
          const buffer = `data:image/png;base64,${new Buffer(bitmap).toString('base64')}`;
          createAndUploadPDF(buffer, fusion.orientation, fusion.size).then(
            (pdf) => {
              console.log('created fusion pdf: ', pdf.S3Url);
              createProductLink({ orderItemId: fusion.id, url: pdf.S3Url }).then(
                () => res.send(JSON.stringify({ pdf })),
              );
            },
            (err) => res.send(JSON.stringify({ err })),
          );
  //       },
  //     );
  //   },
  // );
});

function turnOnServer(): Promise<{ jobName: string; endpoint: string; }> {
  console.log('turning on floydhub server...');

  return new Promise((resolve, reject) => {

    const child = spawn('cd ../fast-style-transfer && floyd run --env tensorflow-1.5 --data narenst/datasets/neural-style-transfer-pre-trained-models/1:input --mode serve --gpu', [], { shell: true });
    child.stderr.on('data', (data) => {
      console.error('STDERR:', `"${data.toString()}"`);
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
        console.log(endpoint);
      }
    });
    child.on('exit', (exitCode) => {
      if (exitCode === 1) {
        console.log('failed to turn on server');
        loginToFloyd().then(
          () => turnOnServer().then(
            () => {
              console.log('floydhub server on');
              isActive = true;
              resolve({ jobName, endpoint });
            },
          ),
          (err) => reject(err),
        );
      } else {
        console.log('floydhub server on');
        isActive = true;
        console.log('jobname: ', jobName);
        console.log('endpoint: ', endpoint);
        resolve({ jobName, endpoint });
      }
    });
  });
}

function turnOffServer(): Promise<void> {
  console.log('turning off floydhub server...');
  return new Promise((resolve, reject) => {
    const child = spawn(`cd ../fast-style-transfer && floyd stop ${jobName}`, [], { shell: true });
    child.stderr.on('data', (data) => {
      console.error('STDERR:', data.toString());
    });
    child.stdout.on('data', (data) => {
      const message = data.toString();
      console.log('STDOUT:', message);
    });
    child.on('exit', (exitCode) => {
      console.log('Child exited with code: ' + exitCode);
      isActive = false;
      resolve();
    });
  });
}

function loginToFloyd() {
  console.log('logging into floydhub...');
  return new Promise((resolve, reject) => {
    const child = spawn(`floyd login --username ${process.env.FLOYD_USERNAME} --password ${process.env.FLOYD_PASSWORD}`, [], { shell: true });
    child.stderr.on('data', (data) => {
      console.error('STDERR:', data.toString());
    });
    child.stdout.on('data', (data) => {
      const message = data.toString();
      console.log('STDOUT:', message);
    });
    child.on('exit', (exitCode) => {
      console.log('Child exited with code: ' + exitCode);
      if (exitCode === 1) {
        reject(`Failed Floyd Login with exit code ${exitCode}`);
      } else {
        resolve();
      }
    });
  });
}

function downloadImage(imageUrl: string, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    axios({ url: imageUrl, responseType: 'stream' }).then(
      (resp) => {
        resp.data.pipe( fs.createWriteStream( filePath ) );
        resolve();
      },
    );
  });
}

function sendToFloydhub(painting: 'udnie' | 'rain_princess' | 'scream' | 'wave' | 'wreck' | 'la_muse'): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [];
    args.push('-o ./temp/posterFused.jpg');
    args.push('-F file=@/Users/bclynch/Desktop/github/decorasaurus-server/temp/posterRaw.jpeg'); // this path needs to be setup like this or no dice
    args.push(`-F checkpoint=${painting}.ckpt`);
    args.push(endpoint);
    // max buffer has to be big enough default is 200 kb this is 10000 or 10mb. Increase as required
    // also max buffer isnt in the types file (@types/node/index.d.ts) for some reason. I've added it locally, but maybe turn off?
    // Need to add prop maxBuffer?: number; to interface SpawnOptions
    const abc: any = { shell: true, maxBuffer: 1024 * 10000 };
    const child = spawn('curl', args, { ...abc });
    child.stderr.on('data', (data: any) => {
      console.error('STDERR:', data.toString());
    });
    child.stdout.on('data', (data: any) => {
      const message = data.toString();
      console.log('STDOUT:', message);
    });
    child.on('exit', (exitCode: number) => {
      console.log('Child exited with code: ' + exitCode);
      resolve();
    });
  });
}

function createProductLink(pdf: { orderItemId: string, url: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const sql = `INSERT INTO decorasaurus.product_links (order_item_id, type, url) values ('${pdf.orderItemId}', 'pdf', '${pdf.url}');`;
    db.query(sql, (err: any) => {
      if (err) reject(err);
      resolve();
    });
  });
}

export default router;
