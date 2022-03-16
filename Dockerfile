FROM sandrokeil/typescript:latest AS build

ENV NODE_ENV=development

COPY ./src /app/src
COPY ./package.json /app
COPY ./tsconfig.json /app

WORKDIR /app

RUN yarn install

RUN tsc

# FROM node:16-slim AS run

# COPY --from=build /app/yarn.lock /app
# COPY --from=build /app/package.json /app
# COPY --from=build /app/node_modules /app/node_modules
# COPY --from=build /app/dist /app/dist

# # COPY --from=build /app/yarn.lock /app
# # COPY --from=build /app/node_modules /app/node_modules
# # COPY ./config /app/config

# # WORKDIR /app

# ARG NODE_ENV=docker
# ENV NODE_ENV=$NODE_ENV

# EXPOSE 3000

# ENTRYPOINT [ "node", "dist/app.js" ]
