FROM node:20-slim

# 安装 Docker CLI 
RUN apt-get update && apt-get install -y docker.io --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .

CMD ["node", "index.js"]
