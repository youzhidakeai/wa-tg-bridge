# TG-WA Forwarder: Industrial-Grade Distributed Gateway
> **不仅是转发工具，更是生产级分布式消息中台：支持动态扩容、自愈巡检与账号物理隔离。**
> **More than a tool, a production-grade message gateway: Featuring dynamic scaling, auto-healing, and physical container isolation.**

---

## 🌏 1. 架构设计 / Architecture Design

本项目摒弃了传统的单体进程脚本，采用基于 **Redis 消息总线** 的分布式微服务架构。

(This project moves beyond monolithic scripts, adopting a distributed microservices architecture powered by **Redis Streams**.)

### 🚀 核心优势 / Core Advantages
*   **物理隔离 (Physical Isolation)**: 每个账号运行在独立的容器中，而非简单的 Topic 逻辑区分。一个节点崩溃或被封，绝不波及其他链路。
    (Each account runs in an isolated container. No single point of failure.)
*   **弹性扩容 (Dynamic Scaling)**: 无需修改配置或重启，通过 TG 指令即可像“云服务”一样瞬间弹出新节点。
    (Scale new nodes instantly via TG commands like a cloud service.)
*   **生产级自愈 (Production-Grade Healing)**: `docker-manager` 24/7 监控节点心跳，假死自动重启，确保持续在线。
    (24/7 heartbeat monitoring with auto-restart for zombie nodes.)
*   **高性能路由 (High-Perf Routing)**: 基于 Redis Streams 的异步总线，毫秒级消息路由，支持高并发转发。
    (Asynchronous message bus with millisecond routing latency.)

### 🏗️ 架构逻辑 / System Architecture

```text
==================================================================================
[ USER / ADMIN ] <---- (TG Protocol) ----> [ TELEGRAM GATEWAY (tg-node) ]
==================================================================================
                                           |
                                           |-- index.js (入口: 装配 / Entry: Assembly)
                                           |-- src/bot/ (路由 / Routing)
                                           |-- src/services/ (Redis & Limiter)
                                           |-- src/consumers/ (WA Inbound)
                                           `-- src/utils/ (Auth & Helpers)
                                           v
==================================================================================
                                [ REDIS DATA BUS ]
  (任务队列 / Task Queue)  |  (消息流 / Msg Streams)  |  (状态库 / Status Store)
==================================================================================
         ^                               ^                        ^
         | [1] 部署指令 / Deploy (Ctrl)   | [2] 转发 / Forward (Data) | [3] 状态 / Status
         v                               v                        |
==================================================================================
[ ORCHESTRATOR (docker-manager) ]        [ WHATSAPP WORKERS (wa-node 1..N) ]
==================================================================================
|                                        |
|-- index.js (调度 / Scheduler)          |-- index.js (初始化 / Node Init)
|-- src/docker/ (Deploy & Stats)         |-- src/whatsapp/ (Client & Events)
|-- src/services/ (Redis)                |-- src/consumers/ (TG Outbound)
`-- [ DOCKER ENGINE ] (Lifecycle)        `-- [ WA_SESSIONS ] (Isolation)
==================================================================================
```

### 🛡️ 核心特性 / Key Features
*   **Dynamic Scaling**: 使用 `/deploy` 指令一键扩容。 (One-click scaling via `/deploy`.)
*   **Auto-Healing**: 自动检测假死容器并重启，确保 24/7 在线。 (Auto-detect & restart dead containers.)
*   **Dynamic Proxy**: 支持 Redis 持久化代理与运行时热重载。 (Persistent Redis proxies with runtime hot-reload.)
*   **Resource Auditing**: 部署前自动检查宿主机剩余内存，防止过度扩容导致系统崩溃。 (Automatic memory audit before deployment.)
*   **Storage Isolation**: 自动为每个实例创建独立的 Session 文件夹。 (Automatic creation of independent session folders.)

---

## ⚙️ 2. 环境配置 / Configuration

在项目根目录创建 `.env` 文件：
Create a `.env` file in the root directory:

```env
# Telegram Bot 配置 (Telegram Bot Token)
TG_BOT_TOKEN=your_bot_token_here

# Redis 连接 (强烈建议带密码并限制公网访问)
# Redis Connection (Password protection & limited access recommended)
REDIS_URL=redis://:password@your-ip:6379/0

# 安全阈值: 剩余内存低于此值(MB)将拒绝部署新节点
# Safety Threshold: Deployment rejected if free memory is below this value (MB)
MEM_FREE_THRESHOLD_MB=500

# Docker 项目名称 (用于容器命名隔离)
# Docker Project Name (Used for container naming isolation)
COMPOSE_PROJECT_NAME=tgwaforward
```

---

## 🚀 3. 快速启动 / Quick Start

1.  **启动核心服务 / Start Core Services**:
    ```bash
    # 首次启动或代码重构后请务必带上 --build
    # Always use --build for the first start or after refactoring
    docker compose up -d --build tg-node docker-manager
    ```

2.  **设置管理员 / Set Admin**:
    将您的 Telegram ID（可向 @userinfobot 获取）添加到 Redis：
    (Add your Telegram ID to Redis via redis-cli):
    ```bash
    redis-cli SET admin_ids "12345678,87654321"
    ```

3.  **动态部署节点 / Deploy Nodes**:
    向机器人发送 `/deploy` 即可启动第一个 WA 转发节点。
    (Send `/deploy` to the bot to launch the first WA node.)

---

## 🎮 4. 指令说明 / Commands

### 🛠️ 系统管理 (管理员专用) / System Management (Admin Only)
*   `/help` - 显示所有可用指令的交互式帮助菜单。
    (Show an interactive help menu for all available commands.)
*   `/deploy [name] [proxies]` - 申请部署新节点。`proxies` 支持逗号分隔的 URL 列表，实现轮询分配。
    (Request a new node. `proxies` supports comma-separated URLs for round-robin assignment.)
*   `/stop [instance]` - 停止并移除指定的节点容器，并彻底清理 Redis 状态及心跳记录。
    (Stop and remove a specific node container, and clean up Redis state and heartbeats.)
*   `/dashboard` - 实时看板：查看宿主机负载、在线节点详情、转发量统计、运行耗时。
    (Real-time dashboard: host load, node details, message stats, and uptime.)
*   `/status` - 快速检查所有在线节点的心跳上报状态。
    (Quick check for heartbeats of all online nodes.)
*   `/login [instance]` - 获取指定节点的 WhatsApp 登录二维码（20秒有效期）。
    (Get WA login QR code for a specific node, 20s expiry.)
*   `/reconnect [instance]` - 远程指令：强制指定节点重新初始化并推送新二维码。
    (Remote command: Force node reinitialization and push a new QR code.)
*   `/set_proxy [instance] [url]` - 运行时更新指定节点的代理设置并立即重连。
    (Update proxy settings for a specific node at runtime.)

### 🔗 群组绑定与转发 / Group Binding & Forwarding
*   `/cid` - 查看当前 TG 群组的 ID 以及当前绑定的 WA 信息。
    (View current TG Group ID and its bound WA info.)
*   `/allwa [instance]` - 拉取并列出账号的所有 WhatsApp 群组 ID。
    (Fetch and list all WA Group IDs for the node's account.)
*   `/bind [instance] [WA_ID]` - 将当前 TG 群组与指定 WA 群组建立永久绑定。
    (Permanently bind the current TG group to a WA group.)
*   `/rebind [instance] [WA_ID]` - 强制重新绑定（会自动清理冲突绑定）。
    (Force rebind and clean up conflicting bindings.)
*   `/fs [text/caption]` - **核心转发指令 / Core Forwarding**:
    *   发送文本 / Text: `/fs Hello World`
    *   发送媒体 / Media: 在发送媒体时将 `/fs [文字]` 作为标题 (Use `/fs [text]` as caption when sending media.)
*   `/delete` (或 `/sc`) - **引用撤回 / Message Deletion**:
    *   在 TG 中引用回复已转发的消息并发送 `/delete`，即可同步撤回 WA 端消息。
    *   (Reply to a forwarded message with `/delete` to sync deletion to WhatsApp.)

---

## ⚠️ 5. 风险预警 / Security & Risks

### 🔒 安全风险 / Security Risks
*   **Redis Protection**: 务必配置强密码，不要将 Redis 暴露在公网。
    (Always use a strong password; never expose Redis to the public internet.)
*   **Docker Socket**: 虽然已通过管理员模式隔离，但 `docker-manager` 容器仍具备高权限，请保护好您的服务器。
    (Although isolated via manager mode, the `docker-manager` container remains highly privileged.)

### 📈 业务风险 / Business Risks
*   **WhatsApp Ban**: 建议为大量节点配置不同的 Proxy IP。
    (It is recommended to use different Proxy IPs for multiple nodes to avoid bans.)
*   **OOM (Out of Memory)**: 合理设置 `MEM_FREE_THRESHOLD_MB`，防止 Puppeteer 消耗完所有物理内存。
    (Set `MEM_FREE_THRESHOLD_MB` properly to prevent Puppeteer from consuming all physical memory.)

---

## 🛠️ 6. 开发与维护 / Maintenance

*   **容灾逻辑 / Disaster Recovery**: `docker-manager` 每分钟扫描心跳。若节点 2 分钟无上报，将自动重启容器。
    (`docker-manager` scans heartbeats every minute. Containers are auto-restarted if silent for 2 mins.)
*   **监控数据 / Monitoring**: 每 10 秒由 `docker-manager` 更新一次宿主机 CPU 与内存快照至 Redis。
    (Host CPU and memory snapshots are updated to Redis by `docker-manager` every 10s.)
*   **日志监控 / Log Monitoring**:
    ```bash
    # 监控部署任务与自愈 (Monitor deployment and healing)
    docker logs -f docker-manager 
    # 监控机器人与消息转发 (Monitor bot and forwarding)
    docker logs -f tg-node       
    ```

---

## 📂 7. 项目目录结构 / Project Structure

本项目遵循关注点分离原则，逻辑高度模块化：
(The project follows the Separation of Concerns (SoC) principle and is highly modular):

```text
.
├── tg-node/                # Telegram 网关服务 (TG Gateway)
│   ├── index.js            # 入口：启动 Bot 与 Stream 消费 (Entry: Bot & Stream)
│   └── src/
│       ├── bot/            # 指令逻辑与消息转发 (Commands & Forwarding)
│       ├── consumers/      # Redis Stream (wa_inbound) 消费者 (Consumer)
│       ├── services/       # Redis 客户端、限流器 (Redis & Limiter)
│       └── utils/          # 权限检查、绑定查询助手 (Helpers)
├── wa-node/                # WhatsApp 执行节点 (WA Worker)
│   ├── index.js            # 入口：节点身份注册 (Entry: Identity Reg)
│   └── src/
│       ├── whatsapp/       # WA 客户端事件与会话 (WA Client & Session)
│       ├── consumers/      # Redis Stream (tg_outbound) 消费者 (Consumer)
│       └── services/       # Redis 连接管理 (Redis Management)
├── docker-manager/         # 系统编排与监控中心 (Orchestrator)
│   ├── index.js            # 入口：任务调度主循环 (Entry: Task Loop)
│   └── src/
│       ├── docker/         # Docker 执行、状态采集、自愈 (Docker & Healing)
│       └── services/       # Redis 连接管理 (Redis Management)
└── constants.js            # 全局常量 (Global Constants)
```
