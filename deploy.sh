#!/usr/bin/env sh

# abort on errors
set -e

# build
npm run build

# copy files to www
mkdir -p www
cp -a ./dist/. ./www
cp -a ./examples/. ./www
find ./www -name "*.d.ts" -type f -delete
find ./www -name "*.js.map" -type f -delete
find ./www -empty -type d -delete

# navigate into the build output directory
cd www

# push to gh-pages branch
git init
git add -A
git commit -m 'deploy github pages'
git push -f git@github.com:jaames/pd-usb master:gh-pages

cd -