import express from 'express';
const router = express.Router();
import dotenv from 'dotenv';
dotenv.config();
// @ts-ignore
import Shippo from 'shippo';
const shippo = Shippo(process.env.SHIPPO_TOKEN);

router.post('/create-label', (req, res) => {

  const shipment = {
    address_from: req.body.addressFrom,
    address_to: req.body.addressTo,
    parcels: req.body.parcels,
  };

  shippo.transaction.create({
    carrier_account: 'e7ec797fae424fd9ac46ea4d1234f919',
    servicelevel_token: 'usps_priority',
    shipment,
  }, (err: any, label: any) => {
    if (err) res.send({ label: err });
    res.send({ label });
  });
});

router.post('/validate-address', (req, res) => {

  shippo.address.create(req.body.address, (err: any, address: any) => {
      // asynchronously called
      if (err) res.send({ address: err });
      res.send({ address });
  });
});

// For USPS refund, Shippo will automatically reimburse you for any unused labels 30 days after it’s creation.
router.post('/create-refund', (req, res) => {
  console.log('TRANSACTION ID: ', req.body.transactionId);

  shippo.refund.create({
    async: false,
    transaction: req.body.transactionId,
  }, (err: any, refund: any) => {
    if (err) res.send({ refund: err });
    res.send({ refund });
  });
});

router.post('/track', (req, res) => {

  shippo.track.get_status(req.body.carrier, req.body.trackingNumber)
    .then((status: any) => {
      res.send({ status });
    }, (err: any) => {
      res.send({ status: err });
    });
});

export default router;
