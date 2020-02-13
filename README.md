# Decorasaurus Server

## Todos
- ~~Make typescript server~~
- Finish up gzip / cache settings
- Upload node server and test prod works 
  - Need to setup env vars and probably imagemagick
- Turn on colorspace conversion
- ~~Create dev / prod env with Moltin and S3 with decorasaurus email~~
- Fusion / Floyd integration
    - ~~Get curl statement in child spawn working~~
    - ~~Finish flow~~
    - ~~Add login check~~
    - Failing out of memory with 2mb photo on postman, but works with 600kb photo. Maybe cap at 1mb?
    - Node request not working...
    - Curl does work usually from terminal. This whole thing is a bit finicky though... Might have to do manually for a bit until I can get it sorted... 
    - Running sendToFloyd fn on its own will work for a image fine (worked with 600kb img), but not when queued up with other commands for some reason (usually).
- Cloudflare integration
- Setup postmark email

## Dev
To develop, we run: 

`npm run watch-ts`

and in a separate terminal we run:

`npm run watch-node`

## Explore API
Use http://localhost:5000/api/graphiql to enter the graphiql editor

## Floyd Work
- Guide https://docs.floydhub.com/examples/style_transfer/
- For the front end we can use JS to mock it quickly while we use floyd for when user actually orders  - check
- Batch new fusion orders and process once a day in the night probably
    - Node scheduling https://github.com/kelektiv/node-cron or https://www.npmjs.com/package/node-schedule
- Turn on server programatically and then off when finished processing - check
- Will need to see if we can send a bunch of images at a time to flask server or just one. In any case create an image in Node and send over to our endpoint.
    - Process the image first probably degrading it a bit if too high res? Make the correct size too based on their order. Need to test this.
- Recieve image(s) back from flask and make into a pdf with that processing and patch the order with the S3 url for the custom pdf url field
- Performance
    - Input file 4.9 mb 4032 × 3024
    - Output 3.2 mb 4032 × 3024
    - Time spent 50 seconds @ $1.20 / h = $.72

## Digital Ocean Login
`$ ssh decorasaurus_admin@206.189.164.53`

## Digital Ocean Setup
1. Create new project with DO
2. Either create a new SSH key or use existing on account
3. Sign in to account by copying ip address and login to root at `$ ssh root@<ip_address>`
4. Setup user and ssh access and firewall https://www.digitalocean.com/community/tutorials/initial-server-setup-with-ubuntu-18-04
    - Check what your firewall is doing `$ sudo ufw status`
    - Other common commands 
      - https://www.digitalocean.com/community/tutorials/ufw-essentials-common-firewall-rules-and-commands
5. Setup domain hostnames + email
    - An A record maps an IPv4 address to a domain name.
    - Point nameservers from registrar to DO  
      - https://www.digitalocean.com/community/tutorials/how-to-point-to-digitalocean-nameservers-from-common-domain-registrars#registrar-namecheap 
    - Setup email (using cryto85 for this one) 
      - https://www.digitalocean.com/community/tutorials/how-to-set-up-zoho-mail-with-a-custom-domain-managed-by-digitalocean-dns
6. Install nginx / server blocks
    - https://www.digitalocean.com/community/tutorials/how-to-install-nginx-on-ubuntu-18-04
    - Can copy some of the existing ones more or less
7. Setup SSL 
    - https://www.digitalocean.com/community/tutorials/how-to-secure-nginx-with-let-s-encrypt-on-ubuntu-18-04
8. Setup HTTP2
    - https://www.digitalocean.com/community/tutorials/how-to-set-up-nginx-with-http-2-support-on-ubuntu-18-04
9. Setup gzip and browser cache
      - https://www.digitalocean.com/community/tutorials/how-to-increase-pagespeed-score-by-changing-your-nginx-configuration-on-ubuntu-16-04#step-3-%E2%80%94-configuring-browser-caching
      - https://jakearchibald.com/2016/caching-best-practices/
10. Setup SFTP Cyberduck
    - Go to bookmarks tab and on bottom right add new
    - Make sure its SFTP connection and add relevant server ip address, username, and ssh key
11. Setup Node App and PM2
    - https://www.digitalocean.com/community/tutorials/how-to-set-up-a-node-js-application-for-production-on-ubuntu-18-04
12. Updating Node Application
    - POMB has it in /home/bclynch (for whatever reason)
13. Updating Front End Application
    - Create produciton dist folder with `$ ng build --prod`
    - Dump generated dist folder in root /var/www/decorasaurus.com/frontend/dist


## ENV Variables

- Used to pass in secret information from the server into Node application
- Use .env file to maintain your vars
    - Syntax: MYAPIKEY=ndsvn2g8dnsb9hsg
    - Env vars are always all capital letters + underscores
    - This can be used in Node with process.env.MYAPIKEY variable
    - Always put .env in gitignore
- Check out your existing variables with printenv command in bash
- AWS automatically pulls env vars https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-environment.html
