const potrace = require('potrace');

exports.posterizeImage = (buffer, steps, color, background) => {
  return new Promise((resolve, reject) => {
    potrace.posterize(buffer, { steps, color, background }, (err, svg) => {
      if (err) reject(err);

      console.log('Starting Tracing');
    
      // scaling up the size of the svg here so when we crop it doesn't deteriorate too bad
      // Need to play with what we need the min size for these to be and programatically decide on resized height / width
      // for now lets pretend we want the width at 4000px
    
      const svgWidth = +svg.match(/"(.*?)"/g)[1].replace(/"/g, "");
      console.log(svgWidth);
      const svgHeight = +svg.match(/"(.*?)"/g)[2].replace(/"/g, "");
      console.log(svgHeight);
    
      const multiplier = svgWidth < 4000 ? (4000 / svgWidth) : 1;
      console.log(multiplier);
      const resizedWidth = svgWidth * multiplier;
      const resizedHeight = svgHeight * multiplier;
    
      svg = svg.replace(`width="${svgWidth}"`, `width="${resizedWidth}"`);
      svg = svg.replace(`height="${svgHeight}"`, `height="${resizedHeight}"`);

      console.log('finished tracing');
      resolve(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
    });
  });
}

exports.traceImage = (buffer, color) => {
  return new Promise((resolve, reject) => {
      potrace.trace(buffer, { color }, (err, svg) => {
      if (err) reject(err);

      console.log('Starting Tracing');
    
      // scaling up the size of the svg here so when we crop it doesn't deteriorate too bad
      // Need to play with what we need the min size for these to be and programatically decide on resized height / width
      // for now lets pretend we want the width at 4000px
    
      const svgWidth = +svg.match(/"(.*?)"/g)[1].replace(/"/g, "");
      console.log(svgWidth);
      const svgHeight = +svg.match(/"(.*?)"/g)[2].replace(/"/g, "");
      console.log(svgHeight);
    
      const multiplier = svgWidth < 4000 ? (4000 / svgWidth) : 1;
      console.log(multiplier);
      const resizedWidth = svgWidth * multiplier;
      const resizedHeight = svgHeight * multiplier;
    
      svg = svg.replace(`width="${svgWidth}"`, `width="${resizedWidth}"`);
      svg = svg.replace(`height="${svgHeight}"`, `height="${resizedHeight}"`);

      console.log('finished tracing');
      resolve(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
    });
  });
}