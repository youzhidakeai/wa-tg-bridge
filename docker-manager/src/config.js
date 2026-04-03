const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MEM_FREE_THRESHOLD_MB = parseInt(process.env.MEM_FREE_THRESHOLD_MB || '300');
const COMPOSE_FILE = process.env.COMPOSE_FILE || '../docker-compose.yml';
const PROJECT_NAME = process.env.COMPOSE_PROJECT_NAME || 'tgwaforward';

module.exports = {
    REDIS_URL,
    MEM_FREE_THRESHOLD_MB,
    COMPOSE_FILE,
    PROJECT_NAME
};
