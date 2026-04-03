const { MessageMedia } = require('whatsapp-web.js');
const CONSTANTS = require('../constants');
const { redisPub, redisSub } = require('../services/redis');
const { startClient, getWaClient, notifyGateway } = require('../whatsapp/client');

/**
 * Ensure the Redis Consumer Group exists
 * 确保 Redis 消费者组存在
 */
async function ensureConsumerGroup(stream, group) {
    try {
        await redisSub.xGroupCreate(stream, group, '0', { MKSTREAM: true });
    } catch (e) {
        if (!e.message.includes('BUSYGROUP')) throw e;
    }
}

/**
 * Execute commands received from TG Gateway
 * 执行从 TG 网关收到的指令
 */
async function handleCommand(packet, instanceId) {
    const waClient = getWaClient();
    switch (packet.action) {
        case CONSTANTS.ACTIONS.UPDATE_PROXY:
            // Update proxy in Redis and restart client (在 Redis 中更新代理并重启客户端)
            if (packet.proxyUrl) await redisPub.set(`${CONSTANTS.KEYS.PROXY_PREFIX}${instanceId}`, packet.proxyUrl);
            else await redisPub.del(`${CONSTANTS.KEYS.PROXY_PREFIX}${instanceId}`);
            await startClient(instanceId);
            break;

        case CONSTANTS.ACTIONS.REINITIALIZE:
            // Force re-initialize client (强制重新初始化客户端)
            await startClient(instanceId);
            break;

        case CONSTANTS.ACTIONS.SEND_MESSAGE:
            // Forward TG message to WA (将 TG 消息转发到 WA)
            try {
                const msg = await waClient.sendMessage(packet.waId, packet.text);
                await notifyGateway('send_ack', { tgChatId: packet.tgChatId, tgMsgId: packet.tgMsgId, waMsgId: msg.id._serialized, success: true });
            } catch (err) {
                await notifyGateway('send_ack', { tgChatId: packet.tgChatId, tgMsgId: packet.tgMsgId, success: false, error: err.message });
            }
            break;

        case CONSTANTS.ACTIONS.SEND_MEDIA:
            // Send media file from TG to WA (从 TG 向 WA 发送媒体文件)
            try {
                const media = await MessageMedia.fromUrl(packet.mediaUrl, { unsafeMime: true });
                if (packet.mimetype) media.mimetype = packet.mimetype;
                const msg = await waClient.sendMessage(packet.waId, media, { caption: packet.caption || '' });
                await notifyGateway('send_ack', { tgChatId: packet.tgChatId, tgMsgId: packet.tgMsgId, waMsgId: msg.id._serialized, success: true });
            } catch (err) {
                await notifyGateway('send_ack', { tgChatId: packet.tgChatId, tgMsgId: packet.tgMsgId, success: false, error: err.message });
            }
            break;

        case CONSTANTS.ACTIONS.DELETE_MESSAGE:
            // Recall/Delete message on WA (在 WA 端撤回/删除消息)
            try {
                const msg = await waClient.getMessageById(packet.waMsgId);
                if (msg) {
                    await msg.delete(true);
                    await notifyGateway('send_ack', { tgChatId: packet.tgChatId, tgMsgId: packet.tgMsgId, success: true, text: CONSTANTS.MESSAGES.DELETE_SUCCESS });
                } else {
                    await notifyGateway('send_ack', { tgChatId: packet.tgChatId, success: false, error: '找不到消息 / Message not found' });
                }
            } catch (err) {
                await notifyGateway('send_ack', { tgChatId: packet.tgChatId, success: false, error: err.message });
            }
            break;

        case CONSTANTS.ACTIONS.GET_GROUPS:
            // Fetch WA group list (拉取 WA 群组列表)
            const chats = await waClient.getChats();
            const groups = chats.filter(c => c.isGroup).map(c => ({ name: c.name, id: c.id._serialized }));
            await notifyGateway('groups_list', { tgChatId: packet.tgChatId, groups });
            break;
    }
}

/**
 * Main loop for consuming TG outbound commands via Redis Stream
 * 通过 Redis Stream 消费 TG 发出的指令的主循环
 */
async function startConsuming(instanceId) {
    const STREAM = `${CONSTANTS.STREAMS.TG_OUTBOUND_PREFIX}${instanceId}`;
    const GROUP = CONSTANTS.GROUPS.WA_WORKERS;
    await ensureConsumerGroup(STREAM, GROUP);
    console.log(`[${instanceId}] 🎧 开始消费 Stream / Start Consuming: ${STREAM}`);

    while (true) {
        try {
            // Consumer Name is the Instance ID (消费者名称即为实例 ID)
            const results = await redisSub.xReadGroup(GROUP, instanceId, [{ key: STREAM, id: '>' }], { COUNT: 10, BLOCK: 2000 });
            if (!results) continue;
            for (const { messages } of results) {
                for (const { id, message } of messages) {
                    try {
                        const packet = JSON.parse(message.data);
                        if (packet.instance === instanceId) await handleCommand(packet, instanceId);
                        await redisSub.xAck(STREAM, GROUP, id);
                    } catch (err) { console.error(`[${instanceId}] Handle Command Error:`, err); }
                }
            }
        } catch (err) {
            console.error(`[${instanceId}] Stream Consumption Loop Error:`, err);
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

module.exports = {
    startConsuming
};
