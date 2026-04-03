const { createClient } = require('redis');
const config = require('../config');

// Create Redis Client (创建 Redis 客户端)
const redis = createClient({ url: config.REDIS_URL });

/**
 * Establish Redis connection (建立 Redis 连接)
 */
async function connect() {
    await redis.connect();
}

/**
 * Safely close Redis connection (安全关闭 Redis 连接)
 */
async function quit() {
    await redis.quit();
}

module.exports = {
    redis,
    connect,
    quit
};
