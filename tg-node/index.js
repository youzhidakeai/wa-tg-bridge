const { Telegraf } = require('telegraf');
const config = require('./src/config');
const redis = require('./src/services/redis');
const registerCommands = require('./src/bot/commands');
const registerMessageHandlers = require('./src/bot/messages');
const { startConsuming } = require('./src/consumers/wa-inbound');

// Initialize Telegram Bot (初始化 Telegram 机器人)
const tgBot = new Telegraf(config.TG_BOT_TOKEN);

(async () => {
    try {
        // Connect to Redis (连接 Redis)
        await redis.connect();
        
        // Register Commands and Message Handlers (注册指令与消息处理器)
        registerCommands(tgBot);
        registerMessageHandlers(tgBot);
        
        // Start Redis Stream Consumption in background (后台启动 Stream 消费)
        startConsuming(tgBot);
        
        // Launch the Bot (启动 Bot)
        tgBot.launch();
        console.log('🚀 [TG Gateway] 启动成功 / Startup Successful (Modular)');
    } catch (err) {
        console.error('Fatal start error:', err);
        process.exit(1);
    }
})();

// Graceful Shutdown Handler (优雅停机处理)
const shutdown = async (signal) => {
    console.log(`Received ${signal}. Shutting down...`);
    await redis.quit();
    tgBot.stop(signal);
    process.exit(0);
};

process.once('SIGINT',  () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
