#/bin/bash

# Note that crontab runs /srv/fitmarket/pipeline/run.sh every day at noon.

set -e

if [ $(hostname) != "vagrbin-dev" ]; then
  echo "Run this on vagrbin-dev";
  exit 1;
fi

root=$(dirname $0)/..
target=/srv/fitmarket

if diff $root/common/init_db.sql $target/common/init_db.sql; then
  echo
else
  echo sql schema is different! update the database first!
  echo see common/init_db.js
  exit 1
fi

cp -r $root/{server,pipeline,common,node_modules} \
  $target

mkdir -p $target/data/
cp $root/deploy/config.override.xfer.js $target/data/config.override.js

