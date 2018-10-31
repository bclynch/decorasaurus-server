import express from 'express';
const router = express.Router();
import multer from 'multer';
import { posterizeImage } from './trace';

const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('cropped'), (req, res) => {

  posterizeImage(req.file.buffer, 3, req.body.color, null)
    .then(
      (svg) => res.send({ image: svg }),
      (err) => console.log(err),
    );
  },
  (err) => console.log(err),
);

export default router;
