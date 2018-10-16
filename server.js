const express = require('express'),
bodyParser = require('body-parser'),
compression = require('compression'),
cors = require('cors'),
fs = require('fs'),
morgan = require('morgan'),
app = express(),
router = express.Router(),
{ postgraphile } = require("postgraphile"),
PostGraphileConnectionFilterPlugin = require('postgraphile-plugin-connection-filter');
require('dotenv').config();

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));
app.set('port', process.env.PORT || 5000);
app.use(compression()); // compress all responses
app.use(cors()); // CORS (Cross-Origin Resource Sharing) headers to support Cross-site HTTP requests

/**
 * PostgraphQL
 */
const pgConnection = {
  host: 'localhost',
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: 'edm',
  port: 5432
};
const postgraphqlConfig = {
  graphiql: true,
  graphqlRoute: '/api/graphql',
  graphiqlRoute: '/api/graphiql',
  appendPlugins: [PostGraphileConnectionFilterPlugin],
  jwtSecret: process.env.JWT_SECRET,
  jwtPgTypeIdentifier: 'edm.jwt_token'
};

// choose correct postgraphile depending on env
// if (process.env.NODE_ENV === 'production') {
//   app.use(postgraphile(`postgresql://${process.env.DATABASE_USER}:${process.env.DATABASE_PASSWORD}@${process.env.DATABASE_ADDRESS}:5432/${process.env.DATABASE_NAME}`, ['edm','edm_private'], postgraphqlConfig));
// } else {
//   app.use(postgraphile(pgConnection, ['poster','poster_private'], postgraphqlConfig));
// }

//set up the logger
var accessLogStream = fs.createWriteStream(__dirname + '/access.log', {flags: 'a'})
app.use(morgan('combined',  { "stream": accessLogStream }));

//routes
// router.use('/analytics', require('./analytics'));
// router.use('/mailing', require('./emails'));
router.use('/posterize', require('./posterize'));
router.use('/patent', require('./patent'));

// const potrace = require('potrace');

// // potrace.trace('./examples/example4.jpg', { color: 'blue' }, (err, svg) => {
// //   if (err) throw err;
// //   fs.writeFileSync('./examples/output.svg', svg);
// // });

// potrace.posterize('./examples/example.jpeg', { steps: 3, color: 'purple', background: 'white' }, function(err, svg) {
//   if (err) throw err;

//   // scaling up the size of the svg here so when we crop it doesn't deteriorate too bad
//   // Need to play with what we need the min size for these to be and programatically decide on resized height / width
//   // for now lets pretend we want the width at 4000px

//   const svgWidth = +svg.match(/"(.*?)"/g)[1].replace(/"/g, "");
//   const svgHeight = +svg.match(/"(.*?)"/g)[2].replace(/"/g, "");

//   const multiplier = svgWidth < 4000 ? (4000 / svgWidth) : 1;
//   const resizedWidth = svgWidth * multiplier;
//   const resizedHeight = svgHeight * multiplier;

//   svg = svg.replace(`width="${svgWidth}"`, `width="${resizedWidth}"`);
//   svg = svg.replace(`height="${svgHeight}"`, `height="${resizedHeight}"`);

//   fs.writeFileSync('./examples/output.svg', svg);
//   console.log('finished');
// });

// api mount path
app.use('/api', router); 

// Initialize the app.
app.listen(app.get('port'), 'localhost', () => console.log(`You're a designer, Harry. I'm a what? Yes, a designer. Spinning up ${process.env.NODE_ENV === 'production' ? 'production' : 'dev'} on port`, app.get('port')) );