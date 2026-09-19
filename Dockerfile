# 桌游联赛瑞士制配对 —— 单镜像构建与运行
# 依赖安装与前端构建均在镜像构建阶段完成，容器启动即提供静态服务。

FROM node:20-alpine

WORKDIR /app

# 先拷贝依赖清单，利用 Docker 层缓存
COPY package.json package-lock.json* ./
RUN npm ci

# 拷贝源码并执行生产构建（tsc 类型检查 + vite build）
COPY . .
RUN npm run build

EXPOSE 8080

# 启动：vite preview 托管 dist/，监听 0.0.0.0:8080
CMD ["npm", "run", "preview"]
