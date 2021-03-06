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

if [ -f $root/pipeline/log.txt ]; then
  echo $root/pipeline/log.txt exists, delete it first.
  exit 1
fi

echo running service fitmarket stop..
sudo service fitmarket stop

cp -r $root/{server,pipeline,common,node_modules} \
  $target

mkdir -p $target/data/
cp $root/deploy/config.override.xfer.js $target/data/config.override.js

# Wait to avoid addr in use error
sleep 1
sudo service fitmarket start
