# Decorasaurus

## Todos
- Make typescript server - check
- 

## Dev
To develop, we run: 

`npm run watch-ts`

and in a separate terminal we run:

`npm run watch-node`

## Digital Ocean Setup
1. Create new project with DO
2. Either create a new SSH key or use existing on account
3. Sign in to account by copying ip address and login to root at `$ ssh root@<ip_address>`
4. Setup user and ssh access and firewall https://www.digitalocean.com/community/tutorials/initial-server-setup-with-ubuntu-16-04
    - Check what your firewall is doing `$ sudo ufw status`
    - Other common commands https://www.digitalocean.com/community/tutorials/ufw-essentials-common-firewall-rules-and-commands
5. Setup domain hostnames + email
    - An A record maps an IPv4 address to a domain name.
    - Point nameservers from registrar to DO https://www.digitalocean.com/community/tutorials/how-to-point-to-digitalocean-nameservers-from-common-domain-registrars#registrar-namecheap 
    - Setup email (using cryto85 for this one)https://www.digitalocean.com/community/tutorials/how-to-set-up-zoho-mail-with-a-custom-domain-managed-by-digitalocean-dns
6. Install nginx
    - https://www.digitalocean.com/community/tutorials/how-to-install-nginx-on-ubuntu-16-04
7. Create server blocks  
   - https://www.digitalocean.com/community/tutorials/how-to-set-up-nginx-server-blocks-virtual-hosts-on-ubuntu-16-04
  - Can copy some of the existing ones more or less


## Next to add
- SSL
- SFTP
- Add node server and setup pm2


## Imagemagick

Had the same issue with Sierra 10.12.5
What I did to get it worked:
- First uninstalled all:
$ brew uninstall imagemagick
- installed imagemagick v6:
$ brew install imagemagick@6 --force
- check if pkgconfig is installed and set permissions:
$ brew install pkgconfig && chmod 755 /usr/local/lib/pkgconfig
- Link:
$ brew link imagemagick@6 --force
- do the path bla brew told me:
$ echo 'export PATH="/usr/local/opt/imagemagick@6/bin:$PATH"' >> ~/.bash_profile

- Finally reinstalling works with no errors...
$ npm install imagemagick-native --save