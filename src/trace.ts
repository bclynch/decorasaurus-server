// @ts-ignore
import potrace from 'potrace';

export function posterizeImage(buffer: Buffer, steps: number, color: string, background: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log('Starting Tracing');
    potrace.posterize(buffer, { steps, color }, (err: Error, svg: string) => {
      if (err) reject(err);

      svg = scaleSVG(svg);

      console.log('finished tracing');
      resolve(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
    });
  });
}

export function traceImage(buffer: Buffer, color: string): Promise<string> {
  return new Promise((resolve, reject) => {
      console.log('Starting Tracing');
      potrace.trace(buffer, { color }, (err: Error, svg: string) => {
      if (err) reject(err);

      svg = scaleSVG(svg);

      console.log('finished tracing');
      resolve(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
    });
  });
}

function scaleSVG(svg: string): string {
  // scaling up the size of the svg here so when we crop it doesn't deteriorate too bad
  // Width can be up to 8100px for 300 DPI at large size landscape level

  const svgWidth = +svg.match(/"(.*?)"/g)[1].replace(/"/g, '');
  console.log(svgWidth);
  const svgHeight = +svg.match(/"(.*?)"/g)[2].replace(/"/g, '');
  console.log(svgHeight);

  const multiplier = svgWidth < 8100 ? (8100 / svgWidth) : 1;
  console.log(multiplier);
  const resizedWidth = svgWidth * multiplier;
  const resizedHeight = svgHeight * multiplier;

  svg = svg.replace(`width="${svgWidth}"`, `width="${resizedWidth}"`);
  svg = svg.replace(`height="${svgHeight}"`, `height="${resizedHeight}"`);

  return svg;
}
