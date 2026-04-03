const Bottleneck = require('bottleneck');

/**
 * Global Limiter: Max 25 messages/sec for TG API
 * 全局限流器：TG API 每秒最多 25 条消息
 */
const globalLimiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: 40 // 1000ms / 25 = 40ms
});

/**
 * Cache for per-chat limiters (每个聊天的独立限流器缓存)
 */
const chatLimiters = new Map();

/**
 * Get or create a limiter for a specific chat (1 msg/sec limit)
 * 获取或为指定聊天创建限流器（每秒 1 条限制）
 */
function getChatLimiter(chatId) {
    if (!chatLimiters.has(chatId)) {
        chatLimiters.set(chatId, new Bottleneck({
            maxConcurrent: 1,
            minTime: 1000 // 1 msg per sec per group (同一个群每秒 1 条)
        }));
    }
    return chatLimiters.get(chatId);
}

/**
 * Unified sending entry: Pass through chat limiter, then global limiter
 * 统一发送入口：先通过聊天限流，再通过全局限流
 */
async function safeSend(chatId, sendFn) {
    const chatLimiter = getChatLimiter(String(chatId));
    return chatLimiter.schedule(() =>
        globalLimiter.schedule(sendFn)
    );
}

module.exports = {
    safeSend
};
