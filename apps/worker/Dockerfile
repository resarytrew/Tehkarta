FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS build
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --no-frozen-lockfile
RUN pnpm build

FROM base AS prod-deps
COPY package.json pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/ports/package.json packages/ports/package.json
COPY packages/application/package.json packages/application/package.json
COPY packages/identity/package.json packages/identity/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/ai/package.json packages/ai/package.json
RUN pnpm install --prod --filter @tehkarta/worker... --no-frozen-lockfile

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV WORKER_MODE=poll
ENV WORKER_HEALTH_PORT=8080

COPY --from=prod-deps --chown=node:node /app /app
COPY --from=build --chown=node:node /app/apps/worker/dist /app/apps/worker/dist
COPY --from=build --chown=node:node /app/packages/domain/dist /app/packages/domain/dist
COPY --from=build --chown=node:node /app/packages/ports/dist /app/packages/ports/dist
COPY --from=build --chown=node:node /app/packages/application/dist /app/packages/application/dist
COPY --from=build --chown=node:node /app/packages/identity/dist /app/packages/identity/dist
COPY --from=build --chown=node:node /app/packages/database/dist /app/packages/database/dist
COPY --from=build --chown=node:node /app/packages/ai/dist /app/packages/ai/dist

USER node
EXPOSE 8080
CMD ["node", "apps/worker/dist/main.js"]
