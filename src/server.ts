import bodyParser from 'body-parser';
import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import fs from 'fs';
import morgan from 'morgan';
import floydRouter from './floyd';
import { init } from './fusion';
import patentRouter from './patent';
import posterRouter from './poster';
import posterizeRouter from './posterize';
import shippoRouter from './shippo';
import stripeRouter from './stripe';
const app = express();
const router = express.Router();
import { postgraphile } from 'postgraphile';
// @ts-ignore
import PostGraphileConnectionFilterPlugin from 'postgraphile-plugin-connection-filter';

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));
app.set('port', process.env.PORT || 5000);
app.use(compression()); // compress all responses
app.use(cors()); // CORS (Cross-Origin Resource Sharing) headers to support Cross-site HTTP requests

/**
 * PostgraphQL
 */
const pgConnection = {
  database: 'decorasaurus',
  host: 'localhost',
  password: process.env.DATABASE_PASSWORD,
  port: 5432,
  user: process.env.DATABASE_USER,
};
const postgraphqlConfig = {
  appendPlugins: [PostGraphileConnectionFilterPlugin],
  graphiql: true,
  graphiqlRoute: '/api/graphiql',
  graphqlRoute: '/api/graphql',
  jwtPgTypeIdentifier: 'decorasaurus.jwt_token',
  jwtSecret: process.env.JWT_SECRET,
};

// choose correct postgraphile depending on env
if (process.env.NODE_ENV === 'production') {
  app.use(postgraphile(`postgresql://${process.env.DATABASE_USER}:${process.env.DATABASE_PASSWORD}@${process.env.DATABASE_ADDRESS}:5432/${process.env.DATABASE_NAME}`, ['decorasaurus', 'decorasaurus_private'], postgraphqlConfig));
} else {
  app.use(postgraphile(pgConnection, ['decorasaurus', 'decorasaurus_private'], postgraphqlConfig));
}

// set up cron job for processing fusion images
// if (process.env.NODE_ENV === 'production') init();
// init();

// set up the logger
const accessLogStream = fs.createWriteStream(__dirname + '/access.log', {flags: 'a'});
app.use(morgan('combined',  { stream: accessLogStream }));

// routes
router.use('/posterize', posterizeRouter);
router.use('/patent', patentRouter);
router.use('/stripe', stripeRouter);
router.use('/poster', posterRouter);
router.use('/shippo', shippoRouter);
router.use('/floyd', floydRouter);

// api mount path
app.use('/api', router);

// Initialize the app.
app.listen(app.get('port'), 'localhost', () => console.log(`You're a designer, Harry. I'm a what? Yes, a designer. Spinning up ${process.env.NODE_ENV === 'production' ? 'production' : 'dev'} on port`, app.get('port')) );
