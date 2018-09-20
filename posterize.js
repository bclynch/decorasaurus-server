const potrace = require('potrace'),
express = require('express'),
router = express.Router(),
multer = require('multer'),
upload = multer({ storage: multer.memoryStorage(), fileFilter: imageFilter }),
sharp = require('sharp'),
fs = require('fs');

router.post('/', upload.single('image'), (req, res) => {

  // going to mod image size first so this is faster
  // sharp(req.file.buffer)
  // .clone()
  // .toFormat('jpeg', { quality: 80 })
  // .toBuffer()
  // .then(
  //   buffer => {
    console.log('Starting to posterize...');
      potrace.posterize(req.file.buffer, { steps: 3, color: req.body.color, background: req.body.background }, function(err, svg) {
        if (err) throw err;
      
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

        res.send({ image: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` });
        // fs.writeFileSync('./examples/output.svg', svg);
        console.log('finished');
      });
    },
    err => console.log(err)
  )
// });

function imageFilter(req, file, cb) {
  // accept image only
  if (!file.originalname.match(/\.(jpg|jpeg|png)$/)) {
      return cb(new Error('Only image files are allowed!'), false);
  }
  cb(null, true);
};

module.exports = router;