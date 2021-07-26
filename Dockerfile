  
FROM sandrokeil/typescript:latest AS build

COPY ./lib /src/lib
COPY ./package.json /src
COPY ./tsconfig.json /src

WORKDIR /src

RUN yarn
RUN tsc

FROM node:erbium-slim AS run
RUN mkdir -p /var/log

COPY --from=build /src/built /server/built
COPY --from=build /src/package.json /server
COPY --from=build /src/yarn.lock /server
COPY --from=build /src/node_modules /server/node_modules

WORKDIR /server
RUN yarn

ARG NODE_ENV=docker
ENV NODE_ENV=$NODE_ENV

EXPOSE 3000

ENTRYPOINT [ "node", "built/app.js" ]
