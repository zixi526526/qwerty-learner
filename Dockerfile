FROM node:20-bookworm-slim AS deps

WORKDIR /app

COPY package.json yarn.lock ./
RUN corepack enable \
  && yarn config set registry https://registry.npmjs.org \
  && yarn install --frozen-lockfile --non-interactive --network-timeout 600000

FROM deps AS build

COPY . .
RUN yarn build

# The build toolchain (vite, playwright, eslint, …) has no business in the image that
# ships to the VPS, so production dependencies are resolved separately.
FROM node:20-bookworm-slim AS prod-deps

WORKDIR /app

COPY package.json yarn.lock ./
RUN corepack enable \
  && yarn config set registry https://registry.npmjs.org \
  && yarn install --frozen-lockfile --non-interactive --production --network-timeout 6000

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=4173 \
  QL_DATA_DIR=/app/.data

COPY package.json yarn.lock ./
COPY --from=prod-deps /app/node_modules ./node_modules

COPY --from=build /app/build ./build
COPY public ./public
COPY server ./server

# Run as the unprivileged user the base image already ships.
RUN mkdir -p /app/.data && chown -R node:node /app
USER node

EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.cjs"]
