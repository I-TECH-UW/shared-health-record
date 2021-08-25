  
FROM node:16-slim AS build

ENV NODE_ENV=development

WORKDIR /app

COPY ./package.json /app

RUN yarn install --production=false

COPY ./src /app/src
COPY ./tsconfig.json /app

RUN yarn tsc --diagnostics

FROM node:16-slim AS run

RUN mkdir -p /var/log

WORKDIR /app

COPY --from=build /app/dist /app/dist
COPY --from=build /app/package.json /app
COPY --from=build /app/yarn.lock /app
COPY --from=build /app/node_modules /app/node_modules
COPY ./config /app/config

RUN chmod u+x -R docker

ARG NODE_ENV=docker
ENV NODE_ENV=$NODE_ENV

EXPOSE 3000

ENTRYPOINT [ "node", "dist/app.js" ]
