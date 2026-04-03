const path = require('path');
const fs = require('fs-extra');
const redis = require('./src/services/redis');
const config = require('./src/config');
const CONSTANTS = require('./constants');
const { startClient, stopHeartbeat } = require('./src/whatsapp/client');
const { startConsuming } = require('./src/consumers/tg-outbound');

(async () => {
    try {
        // Connect to Redis (连接 Redis)
        await redis.connect();

        // Resolve Instance Identity (确定实例身份)
        let instanceId = '';
        if (process.env.INSTANCE_NAME) {
            instanceId = process.env.INSTANCE_NAME;
        } else {
            // Auto-increment ID if not specified (未指定时通过自增获取 ID)
            const nodeId = await redis.redisPub.incr(CONSTANTS.KEYS.WA_NODES_COUNTER);
            instanceId = `wa-node-${nodeId}`;
        }
        console.log(`🚀 [${instanceId}] WA 节点启动中 / WA Node Starting... (Modular)`);

        // Initialize Session directory (初始化会话目录)
        const sessionPath = path.join(config.SESSION_ROOT, instanceId);
        await fs.ensureDir(sessionPath);

        // Start command stream consumption (启动指令流消费)
        startConsuming(instanceId);
        
        // Initialize WhatsApp Client (初始化 WA 客户端)
        await startClient(instanceId);
    } catch (err) {
        console.error('Fatal start error:', err);
        process.exit(1);
    }
})();

/**
 * Graceful Shutdown Handler (优雅停机处理器)
 */
const gracefulShutdown = async () => {
    console.log('Shutting down...');
    stopHeartbeat();
    await redis.quit();
    process.exit(0);
};

process.on('SIGINT',  gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
