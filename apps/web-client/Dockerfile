FROM node:22-alpine AS builder

WORKDIR /app

# Copy root workspace configurations
COPY package*.json ./
COPY packages/shared-types ./packages/shared-types
COPY apps/web-client ./apps/web-client

# Install dependencies and build shared-types and web-client
RUN npm install
RUN npm run build -w @sse-showcase/shared-types
RUN npm run build -w web-client

FROM nginx:alpine AS runner

COPY --from=builder /app/apps/web-client/dist/web-client/browser /usr/share/nginx/html
COPY apps/web-client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
