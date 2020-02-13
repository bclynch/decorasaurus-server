import express from 'express';
const router = express.Router();
import dotenv from 'dotenv';
dotenv.config();
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPESECRET, { apiVersion: '2019-12-03' });

router.post('/create-customer', (req, res) => {

  // Figure when we create a customer will always have whatever their card is already so include
  stripe.customers.create({email: req.body.email, source: req.body.token})
    .then(
      (data) => res.send({ data }),
      (err) => console.log(err),
    );
});

router.post('/fetch-customer', (req, res) => {

  stripe.customers.list({email: req.body.email})
    .then(
      (data) => res.send({ data }),
      (err) => console.log(err),
    );
});

router.post('/delete-card', (req, res) => {

  stripe.customers.deleteSource(
    req.body.customerId,
    req.body.cardId,
  ).then(
    (data) => res.send({ data }),
    (err) => console.log(err),
  );
});

router.post('/change-default-card', (req, res) => {

  stripe.customers.update(
    req.body.customerId,
    { default_source: req.body.sourceId },
  ).then(
    (data) => res.send({ data }),
    (err) => console.log(err),
  );
});

export default router;
