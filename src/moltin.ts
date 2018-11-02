import express from 'express';
const router = express.Router();
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();
import { gateway as MoltinGateway } from '@moltin/sdk';

const Moltin = MoltinGateway({
  client_id: process.env.MOLTINCLIENTID,
  client_secret: process.env.MOLTINCLIENTSECRET,
});

// create customer
router.post('/create-customer', (req, res) => {

  Moltin.Customers.Create({
    email: req.body.email,
    name: req.body.name,
    password: req.body.password,
  }).then(
    (customer) => res.send({ customer: customer.data }),
    (err) => res.send({err}),
  );
});

// login customer and fetch token
router.post('/login-customer', (req, res) => {
  Moltin.Customers.Token(req.body.email, req.body.password).then(
    (token) => res.send({ token: token.data }),
    (err) => res.send({err}),
  );
});

export default router;
