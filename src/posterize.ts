import express from 'express';
const router = express.Router();
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage(), fileFilter: imageFilter });
import { posterizeImage } from './trace';

router.post('/', upload.single('image'), (req, res) => {

  posterizeImage(req.file.buffer, 3, req.body.color, req.body.background)
    .then(
      (svg) => res.send({ image: svg }),
      (err) => console.log(err),
    );
  },
  (err) => console.log(err),
);

function imageFilter(req: Request, file: any, cb: any) {
  // accept image only
  if (!file.originalname.match(/\.(jpg|jpeg|png)$/)) {
      return cb(new Error('Only image files are allowed!'), false);
  }
  cb(null, true);
}

export default router;
