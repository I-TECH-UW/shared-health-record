  
FROM sandrokeil/typescript:latest AS build

COPY ./src /app/src
COPY ./package.json /app
COPY ./tsconfig.json /app

WORKDIR /app

RUN yarn install

RUN tsc

FROM node:16-slim AS run

RUN mkdir -p /var/log

WORKDIR /app

COPY --from=build /app/dist /app/dist
COPY --from=build /app/package.json /app
COPY --from=build /app/yarn.lock /app
COPY --from=build /app/node_modules /app/node_modules
COPY ./config /app/config

ARG NODE_ENV=docker
ENV NODE_ENV=$NODE_ENV

EXPOSE 3000

ENTRYPOINT [ "node", "dist/app.js" ]
