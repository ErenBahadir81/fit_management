# FitFloow admin panel (Next.js 16). Build from the REPO ROOT:
#   docker build -f apps/admin/Dockerfile -t fitfloow-admin .
FROM node:22-slim AS builder

ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/api-client/package.json packages/api-client/
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/mobile/package.json apps/mobile/
RUN pnpm install --frozen-lockfile --filter "@fitfloow/admin..."

COPY packages ./packages
COPY apps/admin ./apps/admin
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @fitfloow/admin build

ENV NODE_ENV=production
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "--filter", "@fitfloow/admin", "start"]
