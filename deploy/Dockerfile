# Demo deploy image for dungeon-hub (portfolio).
# Fat single image: full pnpm workspace installed. Runs api via tsx (domain is
# consumed as TS source) and web via `next start`. Not optimized for size —
# intended for a low-traffic portfolio demo, not production.
FROM node:22-bookworm

# pnpm via corepack (version pinned by root package.json "packageManager")
RUN corepack enable
WORKDIR /app

# Install workspace deps (dev deps included — tsx for api runtime, build tooling for web)
COPY . .
RUN pnpm install --frozen-lockfile

# NEXT_PUBLIC_* must be present at build time (Next.js inlines them).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm --filter @dungeon-hub/web build

EXPOSE 3001 4000
# Service command is provided by docker-compose (api: tsx, web: next start).
