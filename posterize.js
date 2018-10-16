const express = require('express'),
router = express.Router(),
multer = require('multer'),
upload = multer({ storage: multer.memoryStorage(), fileFilter: imageFilter }),
sharp = require('sharp'),
fs = require('fs'),
trace = require('./trace');

router.post('/', upload.single('image'), (req, res) => {

  trace.posterizeImage(req.file.buffer, 3, req.body.color, req.body.background)
    .then(
      svg => res.send({ image: svg }),
      err => console.log(err)
    );
  },
  err => console.log(err)
)

function imageFilter(req, file, cb) {
  // accept image only
  if (!file.originalname.match(/\.(jpg|jpeg|png)$/)) {
      return cb(new Error('Only image files are allowed!'), false);
  }
  cb(null, true);
};

module.exports = router;