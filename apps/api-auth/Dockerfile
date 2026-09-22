FROM node:22-alpine AS builder

WORKDIR /app

# Copy root workspace configurations
COPY package*.json ./
COPY packages/shared-types ./packages/shared-types
COPY apps/api-auth ./apps/api-auth

# Install dependencies and build shared-types and api-auth
RUN npm install
RUN npm run build -w @sse-showcase/shared-types
RUN npm run build -w @sse-showcase/api-auth

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-types/dist ./packages/shared-types/dist
COPY apps/api-auth/package.json ./apps/api-auth/
COPY apps/api-auth/dist ./apps/api-auth/dist

RUN npm install --omit=dev

EXPOSE 3001

CMD ["npm", "run", "start", "-w", "@sse-showcase/api-auth"]
