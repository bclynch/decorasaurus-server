# Decorasaurus

## Todos
- Make typescript server - check
- 

## Dev
To develop, we run: 

`npm run watch-ts`

and in a separate terminal we run:

`npm run watch-node`

## Features

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