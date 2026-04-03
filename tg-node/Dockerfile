FROM node:20-slim

WORKDIR /app

# 仅复制依赖文件
COPY package.json ./
RUN npm install

# 复制业务代码
COPY . .

CMD ["node", "index.js"]
