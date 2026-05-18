# syntax=docker/dockerfile:1
# LiveKit Cloud agent image — see https://docs.livekit.io/deploy/agents/builds.md
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim AS base

RUN apt-get update -qq && apt-get install --no-install-recommends -y ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN npm run build \
  && node dist/agent.js download-files \
  && npm prune --omit=dev

FROM base
ARG UID=10001
RUN adduser \
  --disabled-password \
  --gecos "" \
  --home "/app" \
  --shell "/sbin/nologin" \
  --uid "${UID}" \
  appuser

WORKDIR /app
COPY --from=build --chown=appuser:appuser /app /app

USER appuser
ENV NODE_ENV=production

CMD ["node", "dist/agent.js", "start"]
