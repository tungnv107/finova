FROM node:22-bookworm-slim AS build
WORKDIR /app
# NEXT_PUBLIC_* values are inlined into the browser bundle during next build.
# This is a public origin, never a credential.
ARG NEXT_PUBLIC_APP_URL=http://localhost:3002
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build

# Exclude the Prisma CLI, test runners and build tools from the runtime image.
FROM build AS production-deps
# Better Auth and Prisma Client declare optional CLI/test peer packages.
# Ignore peer installation when pruning the runtime tree, while retaining direct runtime dependencies.
RUN npm prune --omit=dev --omit=peer --legacy-peer-deps

FROM node:22-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3002
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/generated ./generated
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3002/login').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "run", "start", "--", "-p", "3002"]
