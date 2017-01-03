#!/bin/bash

DIR=$(dirname $0)

(
  date
  cd $DIR && node main.js 2>&1 
  echo
  echo
) >> $DIR/log.txt
