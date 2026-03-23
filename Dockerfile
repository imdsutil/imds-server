FROM node:25-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod --ignore-scripts

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN addgroup --system --gid 1001 imds && \
    adduser --system --uid 1001 --ingroup imds imds
USER imds

EXPOSE 80

CMD ["node", "src/index.js"]
