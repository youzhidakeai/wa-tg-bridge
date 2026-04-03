const redis = require('./src/services/redis');
const { reportHostStats, autoHealing, deployNode, stopNode } = require('./src/docker/manager');

async function main() {
    try {
        // Connect to Redis (连接 Redis)
        await redis.connect();
        console.log('🛡️ Docker Manager Security Guard is fully operational. (Modular)');

        // Periodic reporting and healing (定时上报与自愈)
        setInterval(reportHostStats, 10000); // 10s
        setInterval(autoHealing, 60000);   // 60s

        // Task processing loop (任务处理循环)
        while (true) {
            try {
                // Blocking pop from task list (阻塞式获取任务列表)
                const result = await redis.redis.brPop('docker_manager_tasks', 0);
                if (!result) continue;
                
                const task = JSON.parse(result.element);
                
                // Route task by action (根据动作分发任务)
                if (task.action === 'DEPLOY_NODE') {
                    await deployNode(task);
                } else if (task.action === 'STOP_NODE') {
                    await stopNode(task);
                }
            } catch (err) {
                console.error('[Runtime Error]', err);
            }
        }
    } catch (err) {
        console.error('Fatal start error:', err);
        process.exit(1);
    }
}

main();
