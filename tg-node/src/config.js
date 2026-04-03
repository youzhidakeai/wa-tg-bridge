const CONSTANTS = require('../constants');

// Load and validate environment variables (加载并校验环境变量)
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const REDIS_URL    = process.env.REDIS_URL;
const GATEWAY_ID   = process.env.GATEWAY_ID || CONSTANTS.DEFAULTS.GATEWAY_ID;

if (!TG_BOT_TOKEN || !REDIS_URL) {
    console.error('[Gateway] Fatal: TG_BOT_TOKEN and REDIS_URL environment variables must be provided.');
    process.exit(1);
}

module.exports = {
    TG_BOT_TOKEN,
    REDIS_URL,
    GATEWAY_ID
};
