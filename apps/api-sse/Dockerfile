FROM node:22-alpine AS builder

WORKDIR /app

# Copy root workspace configurations
COPY package*.json ./
COPY packages/shared-types ./packages/shared-types
COPY apps/api-sse ./apps/api-sse

# Install dependencies and build shared-types and api-sse
RUN npm install
RUN npm run build -w @sse-showcase/shared-types
RUN npm run build -w @sse-showcase/api-sse

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-types/dist ./packages/shared-types/dist
COPY apps/api-sse/package.json ./apps/api-sse/
COPY apps/api-sse/dist ./apps/api-sse/dist

RUN npm install --omit=dev

EXPOSE 3002

CMD ["npm", "run", "start", "-w", "@sse-showcase/api-sse"]
