const CONSTANTS = require('../constants');
const { redisPub } = require('../services/redis');
const { safeSend } = require('../services/limiter');

/**
 * Push a task to a specific WA node via Redis Stream
 * 通过 Redis Stream 向指定 WA 节点推送任务
 */
async function dispatchToNode(instance, action, payload = {}) {
    const data = JSON.stringify({ instance, action, ...payload });
    await redisPub.xAdd(`${CONSTANTS.STREAMS.TG_OUTBOUND_PREFIX}${instance}`, '*', { data });
}

/**
 * Send alert message to all administrators
 * 向所有管理员发送警报消息
 */
async function alertAdmins(tgBot, text) {
    const adminStr = await redisPub.get(CONSTANTS.KEYS.ADMIN_IDS);
    if (!adminStr) return;
    for (const id of adminStr.split(',').map(s => s.trim())) {
        await safeSend(id, () =>
            tgBot.telegram.sendMessage(id, text, { parse_mode: 'Markdown' })
        ).catch(() => {});
    }
}

/**
 * Verify if the user has administrator permissions
 * 校验用户是否具备管理员权限
 */
async function checkPermission(ctx) {
    try {
        const adminStr = await redisPub.get(CONSTANTS.KEYS.ADMIN_IDS);
        if (!adminStr) return false;
        const allowed = adminStr.split(',').map(s => s.trim()).includes(String(ctx.from.id));
        if (!allowed) console.log(`[Gateway] Permission Denied: TG ID ${ctx.from.id}`);
        return allowed;
    } catch {
        return false;
    }
}

/**
 * Get WA binding information for a TG chat
 * 获取 TG 聊天的 WA 绑定信息
 */
async function getBindingForTgChat(tgId) {
    const waId     = await redisPub.hGet(CONSTANTS.KEYS.TG2WA,       String(tgId));
    const instance = await redisPub.hGet(CONSTANTS.KEYS.TG2INSTANCE, String(tgId));
    return { waId, instance };
}

/**
 * Extract content after /fs command
 * 提取 /fs 指令后的内容
 */
function extractFsContent(text) {
    if (!text) return null;
    const trimmed = text.trim();
    if (!trimmed.startsWith('/fs')) return null;
    return trimmed.substring(3).trim();
}

module.exports = {
    dispatchToNode,
    alertAdmins,
    checkPermission,
    getBindingForTgChat,
    extractFsContent
};
