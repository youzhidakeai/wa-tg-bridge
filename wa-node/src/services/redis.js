const { createClient } = require('redis');
const config = require('../config');

// Create Redis Pub/Sub Clients (创建 Redis 发布/订阅客户端)
const redisPub = createClient({ url: config.REDIS_URL });
const redisSub = createClient({ url: config.REDIS_URL });

redisPub.on('error', e => console.error(`Redis Pub Error:`, e));
redisSub.on('error', e => console.error(`Redis Sub Error:`, e));

/**
 * Establish Redis connections (建立 Redis 连接)
 */
async function connect() {
    await redisPub.connect();
    await redisSub.connect();
}

/**
 * Safely close Redis connections (安全关闭 Redis 连接)
 */
async function quit() {
    await redisPub.quit();
    await redisSub.quit();
}

module.exports = {
    redisPub,
    redisSub,
    connect,
    quit
};
