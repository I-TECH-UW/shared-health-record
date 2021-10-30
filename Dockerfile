  
FROM node:16-slim AS build

ENV NODE_ENV=development

WORKDIR /app

COPY ./package.json /app

RUN yarn install --production=false

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

CMD sh -c './wait-for shr=-fhir:8080 -- '
ENTRYPOINT node dist/app.js
