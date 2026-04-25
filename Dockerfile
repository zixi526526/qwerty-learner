FROM node:20-bookworm-slim AS deps

WORKDIR /app

COPY package.json yarn.lock ./
RUN corepack enable \
  && yarn config set registry https://registry.npmjs.org \
  && yarn install --frozen-lockfile --non-interactive --network-timeout 600000

FROM deps AS build

COPY . .
RUN yarn build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=4173 \
  QL_DATA_DIR=/app/.data

COPY package.json yarn.lock ./
COPY --from=deps /app/node_modules ./node_modules

COPY --from=build /app/build ./build
COPY public ./public
COPY server ./server

EXPOSE 4173

CMD ["yarn", "start"]
