import { spawn } from 'child_process';
import express from 'express';
const router = express.Router();
import fs from 'fs';

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

export default router;
