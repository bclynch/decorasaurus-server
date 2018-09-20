const express = require('express'),
db = require('./db/index'),
router = express.Router(),
puppeteer = require('puppeteer'),
axios = require('axios'),
Hashids = require('hashids');

const hashids = new Hashids();

// Routes
router.get("/", (req, res) => {

  scrapeEventDetails().then((eventsDetails) => {
    const scrapedEvents = eventsDetails.map((eventDetails) => {
      eventDetails.id = hashids.encode(eventDetails.id);
      return eventDetails;
    });
    fetchDBEvents().then(
      (dbEventIds) => {
      compareIds(scrapedEvents, dbEventIds).then(
        (newEvents) => {
          compareArtists(newEvents).then(
            () => {
              checkEventbrite(newEvents).then(
                (newEventsChecked) => {
                  scrapeEventUrls(newEventsChecked).then(
                    (completeEvents) => {
                      fetchDBVenues().then(
                        (dbVenueNames) => {
                          compareVenues(completeEvents, dbVenueNames).then(
                            () => {
                              createEvents(completeEvents).then(
                                () => {
                                  linkArtistToEvent(newEvents).then(
                                    // would be nice to include stats here how many events, artists, venues added
                                    () => res.send(JSON.stringify({ msg: 'Successfully updated DB' })),
                                    err => res.send(JSON.stringify({ err }))
                                  );
                                },
                                err => res.send(JSON.stringify({ err }))
                              );
                            },
                            err => res.send(JSON.stringify({ err }))
                          );
                        },
                        err => res.send(JSON.stringify({ err }))
                      );
                    },
                    err => res.send(JSON.stringify({ err }))
                  );
                },
                err => res.send(JSON.stringify({ err }))
              );
            },
            err => res.send(JSON.stringify({ err }))
          );
        },
        err => res.send(JSON.stringify({ err }))
      );
    },
    err => res.send(JSON.stringify({ err })));
  });
});

let scrapeEventDetails = async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto('https://edmtrain.com');

  // wait for page to get started then modify local storage
  await page.waitFor(1000);
  await page.evaluate(() => {
    // seems you can fetch up to ten locations at a time so need to loop through
    const locationsA = '[{"id":"478","show":true,"fullName":"Asheville, NC","shortName":"ASH·NC"},{"id":"84","show":true,"fullName":"Atlanta, GA","shortName":"ATL·GA"},{"id":"90","show":true,"fullName":"Atlantic City, NJ","shortName":"AC·NJ"},{"id":"78","show":true,"fullName":"Austin, TX","shortName":"AUS·TX"},{"id":"332","show":true,"fullName":"Baltimore, MD","shortName":"BAL·MD"},{"id":"86","show":true,"fullName":"Boston, MA","shortName":"BOS·MA"},{"id":"319","show":true,"fullName":"Buffalo, NY","shortName":"BUF·NY"},{"id":"106","show":true,"fullName":"Calgary, AB","shortName":"CAL·AB"},{"id":"101","show":true,"fullName":"Charlotte, NC","shortName":"CHA·NC"},{"id":"71","show":true,"fullName":"Chicago, IL","shortName":"CHI·IL"}]',
    locationsB = '[{"id":"111","show":true,"fullName":"Cleveland, OH","shortName":"CLE·OH"},{"id":"92","show":true,"fullName":"Columbus, OH","shortName":"COL·OH"},{"id":"93","show":true,"fullName":"Costa Mesa, CA","shortName":"CM·CA"},{"id":"88","show":true,"fullName":"Dallas, TX","shortName":"DAL·TX"},{"id":"76","show":true,"fullName":"Denver, CO","shortName":"DEN·CO"},{"id":"102","show":true,"fullName":"Detroit, MI","shortName":"DET·MI"},{"id":"112","show":true,"fullName":"Edmonton, AB","shortName":"EDM·AB"},{"id":"383","show":true,"fullName":"El Paso, TX","shortName":"EP·TX"},{"id":"533","show":true,"fullName":"Eugene, OR","shortName":"EUG·OR"},{"id":"511","show":true,"fullName":"Grand Rapids, MI","shortName":"GR·MI"}]',
    locationsC = '[{"id":"91","show":true,"fullName":"Houston, TX","shortName":"HOU·TX"},{"id":"417","show":true,"fullName":"Kansas City, MO","shortName":"KC·MO"},{"id":"69","show":true,"fullName":"Las Vegas, NV","shortName":"LV·NV"},{"id":"73","show":true,"fullName":"Los Angeles, CA","shortName":"LA·CA"},{"id":"742","show":true,"fullName":"Madison, WI","shortName":"MAD·WI"},{"id":"87","show":true,"fullName":"Miami, FL","shortName":"MIA·FL"},{"id":"103","show":true,"fullName":"Milwaukee, WI","shortName":"MIL·WI"},{"id":"96","show":true,"fullName":"Minneapolis, MN","shortName":"MIN·MN"},{"id":"89","show":true,"fullName":"Montreal, QC","shortName":"MON·QC"},{"id":"370","show":true,"fullName":"Nashville, TN","shortName":"NAS·TN"}]',
    locationsD = '[{"id":"95","show":true,"fullName":"New Orleans, LA","shortName":"NO·LA"},{"id":"70","show":true,"fullName":"New York City, NY","shortName":"NYC·NY"},{"id":"94","show":true,"fullName":"Orlando, FL","shortName":"ORL·FL"},{"id":"97","show":true,"fullName":"Ottawa, ON","shortName":"OTT·ON"},{"id":"79","show":true,"fullName":"Philadelphia, PA","shortName":"PHI·PA"},{"id":"98","show":true,"fullName":"Phoenix, AZ","shortName":"PHO·AZ"},{"id":"99","show":true,"fullName":"Pittsburgh, PA","shortName":"PIT·PA"},{"id":"85","show":true,"fullName":"Portland, OR","shortName":"POR·OR"},{"id":"104","show":true,"fullName":"Reno, NV","shortName":"RENO·NV"},{"id":"343","show":true,"fullName":"Richmond, VA","shortName":"RIC·VA"}]',
    locationsE = '[{"id":"345","show":true,"fullName":"Sacramento, CA","shortName":"SAC·CA"},{"id":"105","show":true,"fullName":"Saint Louis, MO","shortName":"SL·MO"},{"id":"130","show":true,"fullName":"Salt Lake City, UT","shortName":"SLC·UT"},{"id":"81","show":true,"fullName":"San Diego, CA","shortName":"SD·CA"},{"id":"72","show":true,"fullName":"San Francisco, CA","shortName":"SF·CA"},{"id":"347","show":true,"fullName":"Santa Barbara, CA","shortName":"SB·CA"},{"id":"77","show":true,"fullName":"Seattle, WA","shortName":"SEA·WA"},{"id":"100","show":true,"fullName":"Tampa, FL","shortName":"TAM·FL"},{"id":"74","show":true,"fullName":"Toronto, ON","shortName":"TOR·ON"},{"id":"82","show":true,"fullName":"Vancouver, BC","shortName":"VAN·BC"}]',
    locationsF = '[{"id":"75","show":true,"fullName":"Washington, DC","shortName":"WAS·DC"}]';

    locationTesting = '[{"id":"742","show":true,"fullName":"Madison, WI","shortName":"MAD·WI"}]';

    localStorage.setItem('locationArray', locationTesting);
  });

  // reload to fetch new data based on local storage
  await page.reload();

  // wait for results to load
  await page.waitForSelector('#filterEventsIcon');

  const result = await page.evaluate(() => {
    // return something
    // let x = document.querySelector('.eventContainer').getAttribute('eventid');
    // return { x: +x };

    let data = []; // Create an empty array that will store our data
        const events = document.querySelectorAll('.eventContainer');

        for (var event of events){
            const id = +event.getAttribute('eventid');
            const artists = event.getAttribute('titlestr').split(',');
            const venue = event.getAttribute('venue') + document.querySelector('.eventContainer .eventLocation > span').innerHTML.split('</span>')[1];
            const startTimeFigures = event.getAttribute('sorteddate').split('/');
            const startTime = new Date(+startTimeFigures[0], +startTimeFigures[1], +startTimeFigures[2]).getTime();

            data.push({ id, artists, venue, startTime });
        }

        return data;
  });

  await browser.close();
  return result;
};

function checkEventbrite(newEvents) {
  return new Promise((resolve, reject) => {
    let checkedEvents = [];
    let requestPromises = [];

    for (let i = 0; i < newEvents.length; i++) {
      requestPromises.push(axios.get(`https://edmtrain.com/get-event-detail?id=${hashids.decode(newEvents[i].id)[0]}`).catch(err => reject(err)));
    }
    axios.all(requestPromises).then(axios.spread((...args) => {
      for (let i = 0; i < args.length; i++) {
        // if data then it's eventbrite and we can populate some extra fields
        let object = JSON.parse(args[i].data.data);
        if (object) {
          // if there's a change add the pertinent new data
          let moddedEvent = {...newEvents[i]};
          moddedEvent.ticketProviderId = object.id;
          moddedEvent.name = object.name.text.replace(/\'/g, '\'\''); //Escapes single quotes for SQL
          moddedEvent.description = object.description.html.replace(/\'/g, '\'\''); //Escapes single quotes for SQL
          moddedEvent.startTime = new Date(object.start.local).getTime();
          moddedEvent.endTime = new Date(object.end.local).getTime();
          checkedEvents.push(moddedEvent);
        } else {
          // if no change just push the same event back into arr
          checkedEvents.push(newEvents[i]);
        }
      }
      resolve(checkedEvents);
    })).catch(err => reject(err));
  });
};

function compareIds(scrapedEvents, dbEventIds) {
  return new Promise((resolve, reject) => {
    let newEvents = [];
    // Check scraped ids vs db ids to see which need to be added
    scrapedEvents.forEach((scrapedEvent) => {
      if (dbEventIds.indexOf(scrapedEvent.id) === -1) {
        // doesn't exist so create event
        // pass scraped event obj into an arr and then send all sql in one call
        newEvents.push(scrapedEvent);
      }
    });
    resolve(newEvents);
  });
}

function compareVenues(newEvents, dbVenueNames) {
  return new Promise((resolve, reject) => {
    let newVenues = [];
    // Check scraped ids vs db ids to see which need to be added
    newEvents.forEach((newEvent) => {
      if (dbVenueNames.indexOf(newEvent.venue) === -1 && newVenues.indexOf(newEvent.venue) === -1) {
        // doesn't exist so create venue
        // pass scraped venue obj into an arr and then send all sql in one call
        newVenues.push(newEvent.venue);
      }
    });

    fetchVenueInformation(newVenues).then(
      (completedVenues) => {
        createVenues(completedVenues).then(
          (msg) => {
            console.log(msg);
            resolve();
          },
          (err) => reject(err)
        );
      },
      (err) => reject(err)
    )
  });
}

function compareArtists(newEvents) {
  return new Promise((resolve, reject) => {
    fetchDBArtists().then(
      (dbArtists) => {
        let newArtists = [];
        // Check new event vs db artists to see which need to be added
        newEvents.forEach((newEvent) => {
          newEvent.artists.forEach((artist) => {
            if (dbArtists.indexOf(artist) === -1 && newArtists.indexOf(artist) === -1) {
              // doesn't exist so create artist
              newArtists.push(artist);
            }
          });
        });

        scrapeArtistDetails(newArtists).then(
          (completeArtistArr) => {
            createArtists(completeArtistArr).then(
              (msg) => {
                console.log(msg);
                resolve();
              },
              (err) => reject(err)
            );
          },
          (err) => reject(err)
        )
      },
      (err) => reject(err)
    )
  });
}

function fetchDBEvents() {
  return new Promise((resolve, reject) => {
    // fetch ids of events from present into future and create array
    const sql = 'SELECT id FROM edm.event;';

    db.query(sql, (err, data) => {
      if (err) reject(err);
      if (data) resolve(data.rows.map((row) => row.id));
    });
  });
}

function fetchDBVenues() {
  return new Promise((resolve, reject) => {
    // fetch names of venues
    const sql = 'SELECT name FROM edm.venue;';

    db.query(sql, (err, data) => {
      if (err) reject(err);
      if (data) resolve(data.rows.map((row) => row.name));
    });
  });
}

function fetchDBArtists() {
  return new Promise((resolve, reject) => {
    // fetch names of artists
    const sql = 'SELECT name FROM edm.artist;';

    db.query(sql, (err, data) => {
      if (err) reject(err);
      if (data) resolve(data.rows.map((row) => row.name));
    });
  });
}

function createEvents(events) {
  return new Promise((resolve, reject) => {
    let sql = 'BEGIN; ';

    events.forEach((event) => {
      sql += `INSERT INTO edm.event(id, venue, name, description, type, start_date, end_date, ticketProviderId, ticketProviderUrl) VALUES ('${event.id}', '${event.venue}', ${event.name ? "'" + event.name + "'" : "'" + event.artists.join(', ') + "'"}, ${event.description ? "'" + event.description + "'" : null}, ${event.type ? "'" + event.type + "'" : null}, ${event.startTime}, ${event.endTime ? event.endTime : null}, ${event.ticketProviderId ? "'" + event.ticketProviderId + "'" : null}, ${event.ticketProviderUrl ? "'" + event.ticketProviderUrl + "'" : null}); `;
    });

    sql += 'COMMIT;'

    db.query(sql, (err, data) => {
      if (err) reject(err);
      if (data) {
        console.log(`Added ${events.length} events to the database`);
        resolve();
      }
    });
  });
}

function createVenues(venues) {
  return new Promise((resolve, reject) => {
    let sql = 'BEGIN; ';

    venues.forEach((venue) => {
      sql += `INSERT INTO edm.venue(name, description, lat, lon, city, address, photo, logo) VALUES ('${venue.name}', ${venue.description ? "'" + venue.description + "'" : null}, ${venue.lat ? venue.lat : null}, ${venue.lon ? venue.lon : null}, null, ${venue.address ? "'" + venue.address + "'" : null}, ${venue.photo ? "'" + venue.photo + "'" : null}, null); `;
    });

    sql += 'COMMIT;'

    db.query(sql, (err, data) => {
      if (err) reject(err);
      if (data) resolve(`Added ${venues.length} venues to the database`);
    });
  });
}

function createArtists(artists) {
  return new Promise((resolve, reject) => {
    let sql = 'BEGIN; ';

    artists.forEach((artist) => {
      sql += `INSERT INTO edm.artist(name, description, photo, twitter_username, twitter_url, facebook_username, facebook_url, instagram_username, instagram_url, soundcloud_username, soundcloud_url, youtube_username, youtube_url, spotify_url, homepage) VALUES ('${artist.name}', ${artist.bio ? "'" + artist.bio + "'" : null}, null, ${artist.twitterUsername ? "'" + artist.twitterUsername + "'" : null}, ${artist.twitterUrl ? "'" + artist.twitterUrl + "'" : null}, ${artist.facebookUsername ? "'" + artist.facebookUsername + "'" : null}, ${artist.facebookUrl ? "'" + artist.facebookUrl + "'" : null}, ${artist.instagramUsername ? "'" + artist.instagramUsername + "'" : null}, ${artist.instagramUrl ? "'" + artist.instagramUrl + "'" : null}, ${artist.soundcloudUsername ? "'" + artist.soundcloudUsername + "'" : null}, ${artist.soundcloudUrl ? "'" + artist.soundcloudUrl + "'" : null}, ${artist.youtubeUsername ? "'" + artist.youtubeUsername + "'" : null}, ${artist.youtubeUrl ? "'" + artist.youtubeUrl + "'" : null}, ${artist.spotifyUrl ? "'" + artist.spotifyUrl + "'" : null}, ${artist.homepage ? "'" + artist.homepage + "'" : null}); `;
    });

    sql += 'COMMIT;'

    db.query(sql, (err, data) => {
      if (err) reject(err);
      if (data) resolve(`Added ${artists.length} artists to the database`);
    });
  });
}

function linkArtistToEvent(events) {
  return new Promise((resolve, reject) => {
    let linksAdded = 0;
    let sql = 'BEGIN; ';

    events.forEach((event) => {
      event.artists.forEach((artist) => {
        sql += `INSERT INTO edm.artist_to_event(artist_id, event_id) VALUES ('${artist.replace(/\'/g, '\'\'')}', '${event.id}'); `;
        linksAdded += 1;
      });
    });

    sql += 'COMMIT;'

    db.query(sql, (err, data) => {
      if (err) reject(err);
      if (data) {
        console.log(`Added ${linksAdded} artist / event links to the database`);
        resolve();
      };
    });
  });
}

function fetchVenueInformation(venues) {
  return new Promise((resolve, reject) => {
    venuePromiseArr = [];
    completedVenueArr = [];

    venues.forEach((venue) => {
      let promise = new Promise((resolve, reject) => {
        //formatting venue and city names
        const venueName = venue.split('-')[0].trim().split(' ').join('+');
        const city = '+' + venue.split('-')[1].trim().split(',')[0].split(' ').join('+');
        axios.get(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${venueName}${city}&key=${process.env.GOOGLE_PLACES_API}`).then(
          (response) => {
            const data = response.data.results[0];
            if (data) {
              // fetch photo
              // returns an image so would need to turn around and add to S3 which I don't feel like doing at this second
              // const maxPhotoWidth = 400;
              // axios.get(`https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxPhotoWidth}&photoreference=${data.photos[0].photo_reference}&key=${process.env.GOOGLE_PLACES_API}`).then(
              //   (response) => {
              //     console.log(response);
              //     resolve();
              //   }
              // ).catch((err) => reject(err))
              completedVenueArr.push({ name: venue, description: null, lat: data.geometry.location.lat, lon: data.geometry.location.lng, city: city.split('+').slice(1).join(' '), address: data.formatted_address, photo: null })
            } else {
              completedVenueArr.push({ name: venue, description: null, lat: null, lon: null, city: city.split('+').slice(1).join(' '), address: null, photo: null })
            }
            resolve();
          }
        ).catch((err) => reject(err))
      });
      venuePromiseArr.push(promise);
    });
    Promise.all(venuePromiseArr)
      .then(() => resolve(completedVenueArr))
      .catch((err) => reject(err))
  });
}

let scrapeArtistDetails = async (artists) => {
  let artistArr = [];
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // disabling network timeouts so the whole thing doesn't crash
  await page.goto('https://musicbrainz.org/', { timeout: 0 });
  // wait for page to get started
  await page.waitForSelector('.search-container');

  for (let artist of artists) {
    // enter artist and submit to navigate to their page
    page.type('#headerid-query', artist);
    await page.waitFor(50); 
    page.click('.search-container button[type="submit"]');
    await page.waitForNavigation();

    // click on first result in table (could be wrong of course, but not much you can do)
    if (await page.$('.tbl tbody a') !== null) {
      page.click('.tbl tbody a');
    } else {
      artistArr.push({ name: artist, bio: null, twitterUsername: null, twitterUrl: null, facebookUsername: null, facebookUrl: null, instagramUsername: null, instagramUrl: null, soundcloudUsername: null, soundcloudUrl: null, youtubeUsername: null, youtubeUrl: null, spotifyUrl: null, homepage: null });
      continue;
    }
    await page.waitForNavigation();

    await page.waitForSelector('.artistheader');
    const artistObj = await page.evaluate((artist) => {
      let artistData = { name: artist.replace(/\'/g, '\'\'') };

      // grab wiki bio
      artistData.bio = document.querySelector('.wikipedia-extract-body') ? document.querySelector('.wikipedia-extract-body').innerHTML.replace(/\'/g, '\'\'') : null;

      // grab artist links
      artistData.homepage = document.querySelector('.external_links .home-favicon a') ? document.querySelector('.external_links .home-favicon a').getAttribute('href') : null;
      artistData.twitterUrl = document.querySelector('.external_links .twitter-favicon a') ? document.querySelector('.external_links .twitter-favicon a').getAttribute('href') : null;
      artistData.twitterUsername = document.querySelector('.external_links .twitter-favicon a') ? document.querySelector('.external_links .twitter-favicon a').innerHTML : null;
      artistData.instagramUrl = document.querySelector('.external_links .instagram-favicon a') ? document.querySelector('.external_links .instagram-favicon a').getAttribute('href') : null;
      artistData.instagramUsername = document.querySelector('.external_links .instagram-favicon a') ? document.querySelector('.external_links .instagram-favicon a').innerHTML : null;
      artistData.youtubeUrl = document.querySelector('.external_links .youtube-favicon a') ? document.querySelector('.external_links .youtube-favicon a').getAttribute('href') : null;
      artistData.youtubeUsername = document.querySelector('.external_links .youtube-favicon a') ? document.querySelector('.external_links .youtube-favicon a').innerHTML : null;
      artistData.facebookUrl = document.querySelector('.external_links .facebook-favicon a') ? document.querySelector('.external_links .facebook-favicon a').getAttribute('href') : null;
      artistData.facebookUsername = document.querySelector('.external_links .facebook-favicon a') ? document.querySelector('.external_links .facebook-favicon a').innerHTML : null;
      artistData.soundcloudUrl = document.querySelector('.external_links .soundcloud-favicon a') ? document.querySelector('.external_links .soundcloud-favicon a').getAttribute('href') : null;
      artistData.soundcloudUsername = document.querySelector('.external_links .soundcloud-favicon a') ? document.querySelector('.external_links .soundcloud-favicon a').innerHTML : null;
      artistData.spotifyUrl = document.querySelector('.external_links .spotify-favicon a') ? document.querySelector('.external_links .spotify-favicon a').getAttribute('href') : null;

      return artistData
    }, artist);
    artistArr.push(artistObj);
  }

  await browser.close();
  return artistArr;
};

let scrapeEventUrls = async (events) => {
  let eventsCopy = [...events];
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  for (let i = 0; i < events.length; i++) {
    page.goto(`https://edmtrain.com/california?event=${hashids.decode(events[i].id)[0]}&tickets`);
    // long wait but it often redirects a few times and the context is lost and will throw err if trie to continue too soon
    await page.waitFor(7000); 
    const url = await page.evaluate(() => {
      return window.location.href;
    });
    // stripping affiliate params
    eventsCopy[i].ticketProviderUrl = url.split('?')[0];
    // check event type
    if (url.indexOf('ticketfly') !== -1) {
      eventsCopy[i].type = 'ticketfly'
    } else if (url.indexOf('eventbrite') !== -1) {
      eventsCopy[i].type = 'eventbrite';
    } else if (url.indexOf('ticketmaster') !== -1) {
      eventsCopy[i].type = 'ticketmaster';
    } else {
      eventsCopy[i].type = null;
    }
  }

  await browser.close();
  return eventsCopy;
}

// 1000 EB calls per hour
// function fetchEventbriteData(events) {
//   return new Promise((resolve, reject) => {
//     eventCompleteArr = [];
//     eventPromiseArr = [];

//     events.forEach((event, i) => {
//       if (event.ticketProviderId) {
//         eventPromiseArr.push({ promise: axios.get(`https://www.eventbriteapi.com/v3/events/${event.ticketProviderId}/?token=${process.env.EVENTBRITE_API}`).catch(err => reject(err)), i });
//       } else {
//         let eventCopy = {...event};
//         eventCopy.ticketProviderUrl = null;
//         eventCompleteArr.push(eventCopy);
//       }
//     });
//     axios.all(eventPromiseArr.map((event) => event.promise)).then(axios.spread((...args) => {
//       for (let i = 0; i < args.length; i++) {

//         let moddedEvent = {...events[eventPromiseArr[i].i]};
//         moddedEvent.ticketProviderUrl = args[i].data.url;

//         eventCompleteArr.push(moddedEvent);
//       }
//       resolve(eventCompleteArr);
//     })).catch(err => reject(err));
//   });
// }

// Might need to batch this as musicbrainz limits requests to 50/sec no api key otherwise
// function fetchArtistInformation(artists) {
//   return new Promise((resolve, reject) => {
//     batchCount = 0;
//     artistIdPromiseArr = [];
//     artistDataPromiseArr = [];
//     artistIdArr = [];
//     completeArtistArr = [];

//     // fetch musicbrainz ids for the artist
//     artists.forEach((artist) => {
//       let promise = new Promise((resolve, reject) => {
//         // formatting artist
//         const artistNameFormatted = artist.trim().split(' ').join('+');
//         axios.get(`https://musicbrainz.org/ws/2/artist/?query=${artistNameFormatted}&limit=1&fmt=json`).then(
//           (response) => {
//             const artistInfo = response;
//             console.log(artistInfo.artists);
//             if (artistInfo.artists.length) {
//               artistIdArr.push({ artist, musicbrainzId: artistInfo.artists[0].id })
//             } else {
//               artistIdArr.push({ artist, musicbrainzId: null })
//             }
//             resolve();
//           }
//         ).catch((err) => reject(err))
//       });
//       artistIdPromiseArr.push(promise);
//     });
//     batchPromiseRequests(artistIdPromiseArr)
//       .then(() => {
//         console.log('ARTIST ID ARR: ', artistIdArr);
//         // fetch musicbrainz info on artist
//         artistIdArr.forEach((artist) => {
//           let promise = new Promise((resolve, reject) => {
//             if (artist.musicbrainzId) {
//               axios.get(`http://musicbrainz.org/ws/2/artist/${artist.musicbrainzId}?inc=url-rels&fmt=json`).then(
//                 (response) => {
//                   const artistInfo = response;
//                   if (artistInfo.relations) {
//                     let artistData = { name: artist.artist, twitterUsername: null, twitterUrl: null, facebookUsername: null, facebookUrl: null, instagramUsername: null, instagramUrl: null, soundcloudUsername: null, soundcloudUrl: null, youtubeUsername: null, youtubeUrl: null, spotifyUrl: null, homepage: null };

//                     artistInfo.relations.forEach((relation) => {
//                       // check ea of the relations for what type it is
//                       if (relation.type === 'official homepage') artistData.homepage = relation.url.resource;
//                       if (relation.url.resource.indexOf('facebook') !== -1) {
//                         artistData.facebookUrl = relation.url.resource;
//                         artistData.facebookUsername = relation.url.resource.split('/').slice(-1)[0];
//                       }
//                       if (relation.url.resource.indexOf('instagram') !== -1) {
//                         artistData.instagramUrl = relation.url.resource;
//                         artistData.instagramUsername = relation.url.resource.split('/').slice(-2)[0];
//                       }
//                       if (relation.url.resource.indexOf('youtube') !== -1) {
//                         artistData.youtubeUrl = relation.url.resource;
//                         artistData.youtubeUsername = relation.url.resource.split('/').slice(-1)[0];
//                       }
//                       if (relation.url.resource.indexOf('soundcloud') !== -1) {
//                         artistData.soundcloudUrl = relation.url.resource;
//                         artistData.soundcloudUsername = relation.url.resource.split('/').slice(-1)[0];
//                       }
//                       if (relation.url.resource.indexOf('twitter') !== -1) {
//                         artistData.twitterUrl = relation.url.resource;
//                         artistData.twitterUsername = relation.url.resource.split('/').slice(-1)[0];
//                       }
//                       if (relation.url.resource.indexOf('spotify') !== -1) artistData.spotifyUrl = relation.url.resource;
//                     });

//                     completeArtistArr.push(artistData);
//                   } else {
//                     completeArtistArr.push({ name: artist.artist, twitterUsername: null, twitterUrl: null, facebookUsername: null, facebookUrl: null, instagramUsername: null, instagramUrl: null, soundcloudUsername: null, soundcloudUrl: null, youtubeUsername: null, youtubeUrl: null, spotifyUrl: null, homepage: null });
//                   }
//                   resolve();
//                 }
//               ).catch((err) => reject(err)) 
//             } else {
//               completeArtistArr.push({ name: artist.artist, twitterUsername: null, twitterUrl: null, facebookUsername: null, facebookUrl: null, instagramUsername: null, instagramUrl: null, soundcloudUsername: null, soundcloudUrl: null, youtubeUsername: null, youtubeUrl: null, spotifyUrl: null, homepage: null });
//             }
//           });
//           artistDataPromiseArr.push(promise);
//         });

//         batchPromiseRequests(artistDataPromiseArr)
//           .then(() => {
//             resolve(completeArtistArr)
//           })
//           .catch((err) => reject(err));
//       })
//       .catch((err) => reject(err));

//       function batchPromiseRequests(promiseArr) {
//         return new Promise((resolve, reject) => {
//           const batchSize = 1;
//           console.log('Batch: ', batchCount / batchSize);
//           Promise.all(promiseArr.slice(batchCount, batchCount + batchSize))
//             .then(() => {
//               setTimeout(() => {
//                 batchCount = batchCount + batchSize;
//                 if (batchIdCount > artists.length) {
//                   batchCount = 0;
//                   resolve();
//                 } else {
//                   batchPromiseRequests(promiseArr).then(
//                     () => resolve()
//                     .catch((err) => reject(err))
//                   );
//                 }
//               }, 1000);
//             })
//             .catch((err) => reject(err));
//         });
//       }
//   });
// }

module.exports = router;