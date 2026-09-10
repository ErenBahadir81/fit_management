# FitFloow API (Fastify). Build from the REPO ROOT (needs the workspace + lockfile):
#   docker build -f apps/api/Dockerfile -t fitfloow-api .
FROM node:22-slim

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /repo

# Manifests first so `pnpm install` is cached until a package.json actually changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/api-client/package.json packages/api-client/
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/mobile/package.json apps/mobile/
RUN pnpm install --frozen-lockfile --filter "@fitfloow/api..."

COPY packages ./packages
COPY apps/api ./apps/api

ENV PORT=4000 HOST=0.0.0.0 UPLOAD_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown -R node /data
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "--filter", "@fitfloow/api", "start"]
