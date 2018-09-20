# EDM

## Todos
- Setup schema
  - Skeleton schema up and running. Needs refinements over time
  - Work on data model for region / cities
- Setup scraping edmtrain.
  - Need to scrape genres. So far this looks like best options are http://thedjlist.com/djs/armin-van-buuren/ or http://www.theuntz.com/artists/armin-van-buuren/
  - Creating event we need to check if venue, artist, etc exists and if not create
    - Need to store venue photo on S3
    - Creating artists, but need to scrape rest of the data
      - Discography as well which could be worth snagging + linking to streaming or amazon to buy
      - If there is a Soundcloud link can snag photo from there
  - Need to finish looping through all cities and pulling new event data.
- Will need to find sources for Europe etc eventually
  - http://thedjlist.com/events/
  - Also could use songkick which seems a little more complete. No genre information so would need to cross reference with artists in our db. Foreign cities would need some manual tweaking to get startwd since foreign artists probably not in US much

## Features
- Map view the world over. Would be for a certain date and a user can modify the date to refresh map
- List view for a region on a per day basis
- PWA available with push notifications for followed artists or venues.
- Email alerts on a weekly / semi weekly / monthly basis
- Featured / hot / lifted events up top
- Filter by genre, venue, region, artist
- Tour information for artists + bios and shit. Maybe can scrape from spotify or wikipedia or something.

## Monetization
- Lifted results for venues who want to promote something
- Affiliate links for eventbrite, ticketfly, ticketmaster
- Affiliate links to albums on amazon or something