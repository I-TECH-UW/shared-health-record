#! /usr/bin/env bash

docker run -it --rm -v ${PWD}:/usr/src/app -w /usr/src/app node:18-slim /bin/bash 