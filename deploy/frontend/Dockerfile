# Build the single supported frontend from the Vben monorepo.
FROM node:22-alpine AS builder

RUN corepack enable
ENV NODE_OPTIONS=--max-old-space-size=8192
ENV CI=true

WORKDIR /app

COPY 安全看板vben/package.json 安全看板vben/pnpm-lock.yaml 安全看板vben/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY 安全看板vben/ ./
RUN pnpm run build:naive

FROM nginx:alpine

COPY --from=builder /app/apps/web-naive/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
