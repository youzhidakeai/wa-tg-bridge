# 使用带 Chromium 依赖的 Node 镜像，puppeteer 需要它
FROM node:20-slim

# 安装 puppeteer / Chromium 所需的系统依赖
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 告诉 puppeteer 不要自己下载 Chromium，用系统装好的
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存层加速重建
COPY package.json ./
RUN npm install

# 再复制业务代码
COPY . .

CMD ["node", "index.js"]
