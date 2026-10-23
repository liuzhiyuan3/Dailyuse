FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
# npm ci 严格按 lockfile 安装，避免「本地能跑、镜像里依赖漂了」
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl tzdata
ENV TZ=Asia/Shanghai \
    NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package*.json ./

# 不用 root 跑应用，缩小镜像逃逸后的爆炸半径
RUN chown -R node:node /app
USER node

EXPOSE 3000

# 容器自身探活，失败由编排层决定是否重启
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 启动前先应用迁移，再起服务
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
