FROM node:22-alpine AS builder

WORKDIR /app

# Copy root workspace configurations
COPY package*.json ./
COPY packages/shared-types ./packages/shared-types
COPY apps/web-admin ./apps/web-admin

# Install dependencies and build shared-types and web-admin
RUN npm install
RUN npm run build -w @sse-showcase/shared-types
RUN npm run build -w web-admin

FROM nginx:alpine AS runner

COPY --from=builder /app/apps/web-admin/dist/web-admin/browser /usr/share/nginx/html
COPY apps/web-admin/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
