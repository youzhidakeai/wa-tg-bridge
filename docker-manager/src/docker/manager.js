const { exec } = require('child_process');
const util = require('util');
const os = require('os');
const execPromise = util.promisify(exec);
const config = require('../config');
const { redis } = require('../services/redis');
const CONSTANTS = require('../../constants');

/**
 * Send execution feedback to TG Gateway via wa_inbound stream
 * 通过 wa_inbound 消息流向 TG 网关发送执行结果反馈
 */
async function notifyResult(task, message) {
    console.log(`[Result] Task: ${task.action}, Info: ${message}`);
    const payload = {
        instance: 'system-manager',
        type: 'deploy_result',
        targetTgId: task.tgChatId,
        body: message
    };
    try {
        await redis.xAdd(CONSTANTS.STREAMS.WA_INBOUND, '*', { data: JSON.stringify(payload) });
    } catch (err) {
        console.error('[Error] Failed to send feedback:', err);
    }
}

/**
 * Report host resource stats to Redis (Memory, Load)
 * 向 Redis 上报宿主机资源统计信息（内存、负载）
 */
async function reportHostStats() {
    const freeMem = os.freemem() / 1024 / 1024;
    const totalMem = os.totalmem() / 1024 / 1024;
    const stats = {
        freeMemMB: freeMem.toFixed(2),
        totalMemMB: totalMem.toFixed(2),
        memUsage: ((1 - freeMem / totalMem) * 100).toFixed(2),
        load: os.loadavg()[0].toFixed(2),
        updatedAt: Date.now()
    };
    try {
        await redis.set(CONSTANTS.KEYS.HOST_STATS, JSON.stringify(stats));
    } catch (e) { /* ignore */ }
}

/**
 * Auto-healing: Scan for inactive nodes and restart containers
 * 自动愈合：扫描不活跃节点并重启容器
 */
async function autoHealing() {
    try {
        const now = Math.floor(Date.now() / 1000);
        // Find nodes with no heartbeat for 120 seconds (查找 120 秒无心跳的节点)
        const deadNodes = await redis.zRangeByScore(CONSTANTS.KEYS.WA_HEARTBEATS, 1, now - 120);
        
        for (const instanceId of deadNodes) {
            // Get actual container name (获取实际容器全名)
            const { stdout } = await execPromise(`docker ps --filter "name=${instanceId}" --format "{{.Names}}"`);
            const actualName = stdout.trim().split('\n')[0];
            
            if (actualName) {
                console.log(`[Healing] Auto-restarting zombie node: ${actualName}`);
                await execPromise(`docker restart ${actualName}`);
                // Update heartbeat to prevent repeat triggers (更新心跳以防重复触发)
                await redis.zAdd(CONSTANTS.KEYS.WA_HEARTBEATS, { score: now, value: instanceId });
            }
        }
    } catch (e) {
        console.error('Auto-healing error:', e);
    }
}

// Index for round-robin proxy assignment (用于代理轮询分配的索引)
let proxyIndex = 0;

/**
 * Deploy a new WA Node container
 * 部署一个新的 WA 节点容器
 */
async function deployNode(task) {
    const freeMemMB = os.freemem() / 1024 / 1024;
    
    // Safety check: Avoid OOM (安全检查：防止内存溢出)
    if (freeMemMB < config.MEM_FREE_THRESHOLD_MB) {
        await notifyResult(task, `❌ 部署拦截：剩余内存 (${freeMemMB.toFixed(0)}MB) 低于安全阈值。`);
        return;
    }

    let proxyEnv = '';
    if (task.proxies && task.proxies.length > 0) {
        // Round-robin selection (轮询选择代理)
        const selectedProxy = task.proxies[proxyIndex % task.proxies.length];
        proxyEnv = `-e PROXY=${selectedProxy}`;
        proxyIndex++;
    }

    try {
        if (task.customName) {
            // Deployment with custom name (带自定义名称部署)
            const safeName = task.customName.replace(/[^a-zA-Z0-9-]/g, '');
            const fullContainerName = `${config.PROJECT_NAME}_${safeName}`;
            await execPromise(`docker compose -f ${config.COMPOSE_FILE} run -d --name ${fullContainerName} -e INSTANCE_NAME=${safeName} ${proxyEnv} wa-node`);
        } else {
            // Standard scale deployment (标准扩容部署)
            const { stdout } = await execPromise(`docker ps -a --filter "name=${config.PROJECT_NAME}-wa-node" --format "{{.ID}}"`);
            const currentCount = stdout.trim().split('\n').filter(Boolean).length;
            await execPromise(`docker compose -f ${config.COMPOSE_FILE} up -d --scale wa-node=${currentCount + 1}`);
        }
        await notifyResult(task, `✅ 部署成功。${proxyEnv ? ' (已分配代理)' : ''}`);
    } catch (err) {
        console.error('[Deploy Error]', err);
        await notifyResult(task, `❌ 部署失败: ${err.message}`);
    }
}

/**
 * Stop and cleanup a WA Node
 * 停止并清理 WA 节点
 */
async function stopNode(task) {
    const instanceName = task.instanceName;
    try {
        // Find container name (获取容器名称)
        const { stdout } = await execPromise(`docker ps -a --filter "name=${instanceName}" --format "{{.Names}}"`);
        const actualName = stdout.trim().split('\n')[0];

        if (!actualName) {
            await notifyResult(task, `❌ 停止失败：未找到名为 \`${instanceName}\` 的活跃容器。`);
            return;
        }

        // Force remove container (强制删除容器)
        console.log(`[Manager] Stopping and removing container: ${actualName}`);
        await execPromise(`docker rm -f ${actualName}`);

        // Cleanup Redis keys associated with this instance (清理与此实例相关的 Redis 键)
        const pipeline = redis.multi();
        pipeline.zRem(CONSTANTS.KEYS.WA_HEARTBEATS, instanceName);
        pipeline.del(`${CONSTANTS.KEYS.WA_STATUS_PREFIX}${instanceName}`);
        pipeline.del(`${CONSTANTS.KEYS.QR_CACHE_PREFIX}${instanceName}`);
        pipeline.del(`${CONSTANTS.KEYS.MSG_COUNT_PREFIX}${instanceName}`);
        pipeline.del(`${CONSTANTS.KEYS.START_TIME_PREFIX}${instanceName}`);
        await pipeline.exec();

        await notifyResult(task, `✅ 节点 \`${instanceName}\` 已成功下线并移除。`);
    } catch (err) {
        console.error('[Stop Error]', err);
        await notifyResult(task, `❌ 停止指令执行异常: ${err.message}`);
    }
}

module.exports = {
    reportHostStats,
    autoHealing,
    deployNode,
    stopNode
};
