  
FROM node:erbium-slim

RUN mkdir -p /var/log


COPY ./built /src/server/built
COPY ./config /src/server/config
COPY ./gui /src/gui
COPY ./package.json /src/server
COPY ./tsconfig.json /src/server

WORKDIR /src/server
RUN yarn

ARG NODE_ENV=shr
ENV NODE_ENV=$NODE_ENV

EXPOSE 3000
CMD ["node", "built/app.js"]