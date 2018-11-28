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

export function fetchFusionOrders(): Promise<any> {
  // filtering by the date prior to today since script run once a day and looking for all orders since then
  const d = new Date();
  // need to check if first day of year. If so set to last year
  const year = d.getMonth() === 0 && d.getDate() === 1 ? d.getFullYear() - 1 : d.getFullYear();
  // need to check if first day of the month. If so set to last month
  const month = d.getDate() === 1 ? (d.getMonth() === 0 ? 12 : d.getMonth()) : d.getMonth() + 1;
  // Need to check if first day of the month. If so need to make last day of the prior month
  const day = d.getDate() === 1 ? (d.getMonth() === 0 ? 31 : daysInMonth(d.getMonth(), d.getFullYear())) : d.getDate() - 1;
  // syntax required by Moltin
  const dayBeforeDate = `${year}-${month}-${day}`;
  console.log(dayBeforeDate);
  return Moltin.Orders.Filter({ lt: { created_at: dayBeforeDate } }).With('items').All();
}

// export function fetchOrderItems(orderId: string): Promise<any> {
//   return Moltin.Orders.Items(orderId).then(
//     (items) => {
//       console.log(items);
//     });
// }

function daysInMonth(month: number, year: number) {
  return new Date(year, month, 0).getDate();
}

export default router;
