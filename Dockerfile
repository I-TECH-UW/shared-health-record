  
# syntax=docker/dockerfile:1.2

FROM node:16-slim AS build

# TODO: Fix approach using Secrets
# RUN --mount=type=secret,id=npm_token cat /run/secrets/npm_token

ARG NODE_ENV=production

ARG NODE_AUTH_TOKEN

ENV NODE_AUTH_TOKEN=${NODE_AUTH_TOKEN}

WORKDIR /app

COPY ./package.json /app

COPY ./.npmrc /app

COPY ./yarn.lock /app

COPY ./.yarnrc.yml /app

RUN yarn install --ignore-scripts --production=false --network-timeout 1000000

COPY ./src /app/src

COPY ./tsconfig.json /app

RUN yarn tsc --diagnostics

FROM node:16-slim AS run

RUN apt-get update && apt-get install -y wget

RUN mkdir -p /var/log

WORKDIR /app

RUN wget -qO- https://raw.githubusercontent.com/eficode/wait-for/v2.1.3/wait-for

COPY --from=build /app/dist /app/dist
COPY --from=build /app/package.json /app
COPY --from=build /app/yarn.lock /app
COPY --from=build /app/node_modules /app/node_modules
COPY ./config /app/config

ARG NODE_ENV=docker
ENV NODE_ENV=$NODE_ENV

EXPOSE 3000
EXPOSE 3001

ENV FHIR_SERVER_URL="shr-fhir:8000"

CMD sh -c './wait-for ${FHIR_SERVER_URL} -- '

ENTRYPOINT node dist/app.js
