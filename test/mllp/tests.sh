#!/bin/bash

hostname="shr"
port=3001

for hl7File in messages/*
do
  echo "Testing $hl7File"
  lines=""

  while IFS='' read -r LINE || [ -n "${LINE}" ]; do
      LINE=`echo $LINE | sed -e 's/^[[:space:]]*//'`
      echo "processing line: ${LINE}"
      lines="${lines}${LINE}\x0d"
  done < $hl7File

  msg="\x0b${lines}\x1c\x0d"

  echo $hostname
  echo $msg

  echo -ne $msg | socat - TCP:$hostname:$port
done