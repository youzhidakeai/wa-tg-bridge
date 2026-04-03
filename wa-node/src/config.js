const CONSTANTS = require('../constants');

// Load environment variables (加载环境变量)
const REDIS_URL = process.env.REDIS_URL;
const SESSION_ROOT = process.env.SESSION_ROOT || '/wa_sessions';

if (!REDIS_URL) {
    console.error(`Fatal: REDIS_URL environment variable must be provided.`);
    process.exit(1);
}

module.exports = {
    REDIS_URL,
    SESSION_ROOT
};
