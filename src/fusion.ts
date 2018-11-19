import { spawn } from 'child_process';

export function turnOnServer(): Promise<{ jobName: string, endpoint: string }> {
  return new Promise((resolve, reject) => {
    let jobName: string;

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
        const endpoint = message.split('endpoint:')[1].trim();
        resolve({ jobName, endpoint });
      }
    });
    child.on('exit', (exitCode) => {
      console.log('Child exited with code: ' + exitCode);
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
