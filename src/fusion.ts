import axios from 'axios';
import { exec, spawn } from 'child_process';
import cron from 'cron';
import FormData from 'form-data';
import fs from 'fs';
import http from 'https';
import path from 'path';
import request from 'request';
const CronJob = cron.CronJob;
import { createAndUploadPDF } from './poster';
const db = require('../db/index.js');

let jobName: string;
let endpoint: string;

export function init() {
  // // setup job to fire every night to process orders
  // const job = new CronJob('00 47 16 * * *', () => {
  //   console.log('Starting to process fusion orders...');

  //   // first fetch new fusion orders from last day til present
  //   fetchFusionOrdersToProcess().then(
  //     (orderItems) => {
  //       console.log(orderItems);

  //       // then turn on floydhub server
  //       turnOnServer().then(
  //         () => {
  //           console.log('floyd server on');

  //           processItemArray(orderItems, processFusionItem).then(
  //             () => console.log('done!'),
  //           );
  //         },
  //       );
  //     },
  //   );
  // });
  // job.start();
  // console.log('Fusion procesing cron job started');

  // first fetch new fusion orders from last day til present
  fetchFusionOrdersToProcess().then(
    (orderItems) => {
      console.log(orderItems);

      // then turn on floydhub server
      turnOnServer().then(
        () => {
          console.log('floyd server on');

          processItemArray(orderItems, processFusionItem).then(
            () => console.log('done!'),
          );
        },
      );
    },
  );
}

function turnOnServer(): Promise<void> {
  return new Promise((resolve, reject) => {

    const child = spawn('cd ../fast-style-transfer && floyd run --env tensorflow-1.5 --data narenst/datasets/neural-style-transfer-pre-trained-models/1:input --mode serve', [], { shell: true });
    child.stderr.on('data', (data) => {
      console.error('STDERR:', data.toString());

      // it's possible to get logged out if this is the case need to catch it here
      if (data.toString() === 'Error: Authentication failed. Retry by invoking floyd login.') {

        // command to be run is `floyd login --username bclynch --password Bear2013!`
      }
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
      console.log('Child exited with code: ' + exitCode);
      resolve();
    });
  });
}

function turnOffServer(name: string): Promise<void> {
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

function processFusionItem(item: { orderId: string, url: string }) {
  return new Promise((resolve, reject) => {
    downloadImage(item.url, './temp/posterRaw.jpeg').then(
      () => {
        sendToFloydhub('./temp/posterFused.jpg', './temp/posterRaw.jpeg', 'scream').then(
          () => {
            // might need to resize image depending on how big it is

            const bitmap = fs.readFileSync('/Users/bclynch/Desktop/github/poster-server/temp/posterFused.jpg');
            // convert binary data to base64 encoded string
            const buffer = new Buffer(bitmap).toString('base64');
            createAndUploadPDF(buffer, 'Portrait', 'Medium').then(
              (pdf) => {
                createProductLink({ orderId: item.orderId, url: pdf.S3Url }).then(
                  () => resolve(pdf),
                );
              },
            );
          },
        );
      },
    );
  });
}

function processItemArray(items: Array<{orderId: string, url: string}>, fn: any) {
  const results: Array<{ orderId: string, url: string }> = [];
  return items.reduce((p, item) => {
      return p.then(() => {
          return fn(item).then((data: { type: 'thumbnail' | 'pdf' | 'crop', S3Url: string }) => {
              results.push({ orderId: item.orderId, url: data.S3Url });
              return results;
          });
      });
  }, Promise.resolve());
}

function sendToFloydhub(outputPath: string, inputPath: string, painting: 'udnie' | 'rain_princess' | 'scream' | 'wave' | 'wreck' | 'la_muse'): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [];
    args.push('-o ./temp/posterFused.jpg');
    args.push('-F file=@/Users/bclynch/Desktop/github/poster-server/temp/posterRaw.jpeg'); // this path needs to be setup like this or no dice
    args.push('-F checkpoint=rain_princess.ckpt');
    args.push(endpoint);
    // max buffer has to be big enough default is 200 kb this is 500. Increase as required
    // also max buffer isnt in the types file (@types/node/index.d.ts) for some reason. I've added it locally, but maybe turn off?
    // Need to add prop maxBuffer?: number; to interface SpawnOptions
    const child = spawn('curl', args, { shell: true, maxBuffer: 1024 * 500 });
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

function createProductLink(pdf: { orderId: string, url: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const sql = `INSERT INTO decorasaurus.product_links (order_item_id, type, url) values ('${pdf.orderId}', 'pdf', '${pdf.url}');`;
    db.query(sql, (err: any) => {
      if (err) reject(err);
      resolve();
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

function fetchFusionOrdersToProcess(): Promise<any> {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT order_item_id, types, urls, orientation, size, fusion_type
      FROM
      (SELECT order_item_id,  string_agg(type::character varying, ', ') as types, string_agg(url, ', ') as urls
      FROM decorasaurus.product_links
      WHERE order_item_id IS NOT NULL
      AND created_at > ${Date.now() - 86400000}
      GROUP BY order_item_id) as abc
      LEFT OUTER JOIN decorasaurus.order_item
      ON abc.order_item_id = decorasaurus.order_item.id;
    `;
    db.query(sql, (err: any, orders: any) => {
      if (err) reject(err);
      // run a foreach on row items then an indexOf on the types arr checking for pdf
      // if not then add the object to an array for needing to be processed with floydhub
      const ordersToProcess: Array<{orderId: string, url: string}> = [];
      orders.rows.forEach((row: {order_item_id: string, types: string, urls: string}) => {
        if (row.types.split(', ').indexOf('pdf') === -1) {
          const cropElementIndex = row.types.split(', ').indexOf('crop');
          ordersToProcess.push({ orderId: row.order_item_id, url: row.urls.split(', ')[cropElementIndex] });
        }
      });
      resolve(ordersToProcess);
    });
  });
}
