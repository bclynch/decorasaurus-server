// import axios from 'axios';
// import { spawn } from 'child_process';
// import cron from 'cron';
// import fs from 'fs';
// const CronJob = cron.CronJob;
// import { createAndUploadPDF } from './poster';
// const db = require('../db/index.js');

// // import request from 'request';
// const request = require('postman-request');

// let jobName: string;
// let endpoint: string;

// export function init() {
//   // // setup job to fire every night to process orders
//   // const job = new CronJob('00 47 16 * * *', () => {
//   //   console.log('Starting to process fusion orders...');

//   //   // first fetch new fusion orders from last day til present
//   //   fetchFusionOrdersToProcess().then(
//   //     (orderItems) => {
//   //       console.log(orderItems);

//   //       // then turn on floydhub server
//   //       turnOnServer().then(
//   //         () => {
//   //           console.log('floyd server on');

//   //           processItemArray(orderItems, processFusionItem).then(
//   //             () => console.log('done!'),
//   //           );
//   //         },
//   //       );
//   //     },
//   //   );
//   // });
//   // job.start();
//   // console.log('Fusion procesing cron job started');

//   // first fetch new fusion orders from last day til present
//   // turnOnServer().then(
//   //   () => {
//   //     console.log('ENDPOINT: ', endpoint);
//   //     const options = { method: 'POST',
//   //       url: endpoint,
//   //       headers:
//   //       { 'Postman-Token': '45c47309-0ef3-43fa-9748-d236cd253fc0',
//   //         'Cache-Control': 'no-cache',
//   //         'Content-Type': 'application/x-www-form-urlencoded',
//   //         'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW',
//   //       },
//   //       formData: {
//   //         checkpoint: 'wave.ckpt',
//   //         file: fs.createReadStream('/Users/bclynch/Desktop/github/decorasaurus-server/temp/posterRaw.jpeg'),
//   //       },
//   //     };

//   //     request.post({url: 'http://service.com/upload', formData}, function optionalCallback(err, httpResponse, body) {
//         // if (err) {
//         //   return console.error('upload failed:', err);
//         // }
//         // console.log('Upload successful!  Server responded with:', body);
//   //     });
//   //   },
//   // );

//   fetchFusionOrdersToProcess().then(
//     (orderItems: Array<{ orderItemId: string, url: string, orientation: string, size: string, fusionType: string }>) => {
//       console.log('Got order items to fuse: ', orderItems);
//       // // then turn on floydhub server
//       if (orderItems.length) {
//         turnOnServer().then(
//           () => {
//             sendToFloydhub(endpoint , 'wreck').then(() => console.log('whelp')); // works (often)
//             // sendToFloydhub(endpoint, 'wave').then( // fails
//             //   () => {
//             //     console.log('whelp');
//             //     turnOffServer().then(
//             //       () => console.log('terminado'),
//             //     );
//             //   },
//             // );
//             // processItemArray(orderItems, processFusionItem).then(
//             //   (pdfs) => {
//             //     console.log('My fusion pdfs: ', pdfs);
//             //     turnOffServer().then(
//             //       () => console.log('done!'),
//             //     );
//             //   },
//             //   (err) => {
//                 // turnOffServer().then(
//                 //   () => console.log(err),
//                 // );
//             //   },
//             // );
//           },
//           (err) => console.log(err),
//         );
//       } else {
//         console.log('Terminating. No fusion posters to process');
//       }
//     },
//   );

//   // sendToFloydhub('https://www.floydlabs.com/serve/GpzEdYCsGAbaS8pYFVaF5D' , 'la_muse').then(() => console.log('whelp'));
// }

// function turnOnServer(): Promise<{ exitCode: number; isLoggedOut: boolean; }> {
//   console.log('turning on floydhub server...');
//   return new Promise((resolve, reject) => {

//     const child = spawn('cd ../fast-style-transfer && floyd run --env tensorflow-1.5 --data narenst/datasets/neural-style-transfer-pre-trained-models/1:input --mode serve --gpu', [], { shell: true });
//     child.stderr.on('data', (data) => {
//       console.error('STDERR:', `"${data.toString()}"`);
//     });
//     child.stdout.on('data', (data) => {
//       const message = data.toString();
//       console.log('STDOUT:', message);
//       // get ref to job name so we can turn off server when finished with fusions
//       if (message.split(':')[0] === 'URL to job') {
//         jobName = message.split('projects/')[1];
//       }
//       // this is last message from Floyd so it's spun up and we can start sending images over
//       if (message.split(':')[0] === 'URL to service endpoint') {
//         endpoint = message.split('endpoint:')[1].trim();
//         console.log(endpoint);
//       }
//     });
//     child.on('exit', (exitCode) => {
//       if (exitCode === 1) {
//         console.log('failed to turn on server');
//         loginToFloyd().then(
//           () => turnOnServer().then(
//             () => {
//               console.log('floydhub server on');
//               resolve();
//             },
//           ),
//           (err) => reject(err),
//         );
//       } else {
//         console.log('floydhub server on');
//         resolve();
//       }
//     });
//   });
// }

// function turnOffServer(): Promise<void> {
//   console.log('turning off floydhub server...');
//   return new Promise((resolve, reject) => {
//     const child = spawn(`cd ../fast-style-transfer && floyd stop ${jobName}`, [], { shell: true });
//     child.stderr.on('data', (data) => {
//       console.error('STDERR:', data.toString());
//     });
//     child.stdout.on('data', (data) => {
//       const message = data.toString();
//       console.log('STDOUT:', message);
//     });
//     child.on('exit', (exitCode) => {
//       console.log('Child exited with code: ' + exitCode);
//       resolve();
//     });
//   });
// }

// function loginToFloyd() {
//   console.log('logging into floydhub...');
//   return new Promise((resolve, reject) => {
//     const child = spawn(`floyd login --username ${process.env.FLOYD_USERNAME} --password ${process.env.FLOYD_PASSWORD}`, [], { shell: true });
//     child.stderr.on('data', (data) => {
//       console.error('STDERR:', data.toString());
//     });
//     child.stdout.on('data', (data) => {
//       const message = data.toString();
//       console.log('STDOUT:', message);
//     });
//     child.on('exit', (exitCode) => {
//       console.log('Child exited with code: ' + exitCode);
//       if (exitCode === 1) {
//         reject(`Failed Floyd Login with exit code ${exitCode}`);
//       } else {
//         resolve();
//       }
//     });
//   });
// }

// function processFusionItem(item: { orderItemId: string, url: string, orientation: 'Portrait' | 'Landscape', size: 'Small' | 'Medium' | 'Large', fusionType: 'udnie' | 'rain_princess' | 'scream' | 'wave' | 'wreck' | 'la_muse' }) {
//   return new Promise((resolve, reject) => {
//     downloadImage(item.url, './temp/posterRaw.jpeg').then(
//       () => {
//         console.log('downloaded image: ', item.url);
//         sendToFloydhub(item.fusionType).then(
//           () => {
//             console.log('finished fusing image');
//             // might need to resize image depending on how big it is

//             const bitmap = fs.readFileSync('/Users/bclynch/Desktop/github/decorasaurus-server/temp/posterFused.jpg');
//             // convert binary data to base64 encoded string
//             const buffer = `data:image/png;base64,${new Buffer(bitmap).toString('base64')}`;
//             createAndUploadPDF(buffer, item.orientation, item.size).then(
//               (pdf) => {
//                 console.log('created fusion pdf: ', pdf.S3Url);
//                 createProductLink({ orderItemId: item.orderItemId, url: pdf.S3Url }).then(
//                   () => resolve(pdf),
//                 );
//               },
//               (err) => reject(err),
//             );
//           },
//         );
//       },
//     );
//   });
// }

// function processItemArray(items: Array<{orderItemId: string, url: string, orientation: string, size: string, fusionType: string}>, fn: any): Promise<void> {
//   const results: Array<{ orderItemId: string, url: string }> = [];
//   return items.reduce((p, item) => {
//       return p.then(() => {
//           return fn(item).then((data: { type: 'pdf', S3Url: string }) => {
//               results.push({ orderItemId: item.orderItemId, url: data.S3Url });
//               return results;
//           });
//       });
//   }, Promise.resolve());
// }

// function sendToFloydhub(endpointer: string, painting: 'udnie' | 'rain_princess' | 'scream' | 'wave' | 'wreck' | 'la_muse'): Promise<void> {
//   return new Promise((resolve, reject) => {
//     const args = [];
//     args.push('-o ./temp/posterFused.jpg');
//     args.push('-F file=@/Users/bclynch/Desktop/github/decorasaurus-server/temp/posterRaw1.jpeg'); // this path needs to be setup like this or no dice
//     args.push(`-F checkpoint=${painting}.ckpt`);
//     args.push(endpointer);
//     // max buffer has to be big enough default is 200 kb this is 10000 or 10mb. Increase as required
//     // also max buffer isnt in the types file (@types/node/index.d.ts) for some reason. I've added it locally, but maybe turn off?
//     // Need to add prop maxBuffer?: number; to interface SpawnOptions
//     const child = spawn('curl', args, { shell: true, maxBuffer: 1024 * 10000 });
//     child.stderr.on('data', (data: any) => {
//       console.error('STDERR:', data.toString());
//     });
//     child.stdout.on('data', (data: any) => {
//       const message = data.toString();
//       console.log('STDOUT:', message);
//     });
//     child.on('exit', (exitCode: number) => {
//       console.log('Child exited with code: ' + exitCode);
//       resolve();
//     });
//   });
// }

// function createProductLink(pdf: { orderItemId: string, url: string }): Promise<void> {
//   return new Promise((resolve, reject) => {
//     const sql = `INSERT INTO decorasaurus.product_links (order_item_id, type, url) values ('${pdf.orderItemId}', 'pdf', '${pdf.url}');`;
//     db.query(sql, (err: any) => {
//       if (err) reject(err);
//       resolve();
//     });
//   });
// }

// function downloadImage(imageUrl: string, filePath: string): Promise<void> {
//   return new Promise((resolve, reject) => {
//     axios({ url: imageUrl, responseType: 'stream' }).then(
//       (resp) => {
//         resp.data.pipe( fs.createWriteStream( filePath ) );
//         resolve();
//       },
//     );
//   });
// }

// function fetchFusionOrdersToProcess(): Promise<Array<{orderItemId: string, url: string}>> {
//   return new Promise((resolve, reject) => {
//     const sql = `
//       SELECT order_item_id, types, urls, orientation, size, fusion_type
//       FROM
//       (SELECT order_item_id,  string_agg(type::character varying, ', ') as types, string_agg(url, ', ') as urls
//       FROM decorasaurus.product_links
//       WHERE order_item_id IS NOT NULL
//       AND created_at > ${Date.now() - 86400000}
//       GROUP BY order_item_id) as abc
//       LEFT OUTER JOIN decorasaurus.order_item
//       ON abc.order_item_id = decorasaurus.order_item.id;
//     `;
//     // const sql = 'SELECT * FROM decorasaurus.order_item;';
//     db.query(sql, (err: any, orders: any) => {
//       if (err) reject(err);
//       // run a foreach on row items then an indexOf on the types arr checking for pdf
//       // if not then add the object to an array for needing to be processed with floydhub
//       const ordersToProcess: Array<{ orderItemId: string, url: string, orientation: string, size: string, fusionType: string }> = [];
//       orders.rows.forEach((row: any) => {
//         if (row.types.split(', ').indexOf('pdf') === -1) {
//           const cropElementIndex = row.types.split(', ').indexOf('crop');
//           if (row.urls.split(', ')[cropElementIndex]) ordersToProcess.push({ orderItemId: row.order_item_id, url: row.urls.split(', ')[cropElementIndex], orientation: row.orientation, size: row.size, fusionType: row.fusion_type  });
//         }
//       });
//       resolve(ordersToProcess);
//     });
//   });
// }
