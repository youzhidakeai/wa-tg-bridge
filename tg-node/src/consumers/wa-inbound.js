const QRCode = require('qrcode');
const config = require('../config');
const CONSTANTS = require('../constants');
const { redisPub, redisSub } = require('../services/redis');
const { safeSend } = require('../services/limiter');
const { alertAdmins } = require('../utils/helpers');

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
 * Process incoming packets from WA nodes
 * 处理来自 WA 节点的进入数据包
 */
async function handleWaPacket(tgBot, packet) {
    switch (packet.type) {
        case 'qr': {
            // Cache QR code for manual login queries (缓存二维码供手动查询)
            await redisPub.set(`${CONSTANTS.KEYS.QR_CACHE_PREFIX}${packet.instance}`, packet.qr, { EX: CONSTANTS.EXPIRY.QR_CACHE });
            
            // Generate optimized QR buffer for TG (为 TG 生成优化的二维码 Buffer)
            const buf = await QRCode.toBuffer(packet.qr, {
                errorCorrectionLevel: 'L',
                margin: 4,
                width: 600,
                color: { dark: '#000000', light: '#FFFFFF' }
            });
            
            const adminStr = await redisPub.get(CONSTANTS.KEYS.ADMIN_IDS);
            if (!adminStr) break;
            
            // Notify all admins (通知所有管理员)
            for (const id of adminStr.split(',').map(s => s.trim())) {
                await safeSend(id, () => tgBot.telegram.sendPhoto(id, { source: buf }, { 
                    caption: `📱 节点 \`${packet.instance}\` 需要扫码登录\n发送 /reconnect ${packet.instance} 可触发重连`, 
                    parse_mode: 'Markdown' 
                })).catch(() => {});
            }
            break;
        }

        case 'ready': {
            // Clear QR cache on successful login (登录成功，清除二维码缓存)
            await redisPub.del(`${CONSTANTS.KEYS.QR_CACHE_PREFIX}${packet.instance}`);
            await alertAdmins(tgBot, `✅ 节点 \`${packet.instance}\` 登录成功\n👤 账号: \`${packet.accountInfo}\``);
            break;
        }

        case 'disconnected': {
            await alertAdmins(tgBot, `🚨 *WhatsApp 掉线报警*\n\n🖥️ 节点: \`${packet.instance}\`\n👤 账号: \`${packet.accountInfo}\`\n📉 原因: ${packet.reason}\n\n👉 发送 /reconnect ${packet.instance} 触发自动重连`);
            break;
        }

        case 'deploy_result': {
            // Feedback deployment progress to user (向用户反馈部署进度)
            await safeSend(packet.targetTgId, () => tgBot.telegram.sendMessage(packet.targetTgId, packet.body, { parse_mode: 'Markdown' })).catch(() => {});
            break;
        }

        case 'message': {
            // Forward WA message to TG (将 WA 消息转发到 TG)
            const caption = `👤 [${packet.sender}]:\n${packet.body || ''}`;
            if (packet.mediaBase64) {
                const buf = Buffer.from(packet.mediaBase64, 'base64');
                const mime = packet.mediaMimeType || '';
                if (mime.startsWith('image/')) {
                    await safeSend(packet.targetTgId, () => tgBot.telegram.sendPhoto(packet.targetTgId, { source: buf }, { caption }));
                } else if (mime.startsWith('video/')) {
                    await safeSend(packet.targetTgId, () => tgBot.telegram.sendVideo(packet.targetTgId, { source: buf }, { caption }));
                } else if (mime.startsWith('audio/')) {
                    await safeSend(packet.targetTgId, () => tgBot.telegram.sendAudio(packet.targetTgId, { source: buf }, { caption }));
                } else {
                    await safeSend(packet.targetTgId, () => tgBot.telegram.sendDocument(packet.targetTgId, { source: buf, filename: packet.mediaFilename || 'file' }, { caption }));
                }
            } else {
                await safeSend(packet.targetTgId, () => tgBot.telegram.sendMessage(packet.targetTgId, caption));
            }
            break;
        }

        case 'send_ack': {
            // Process message delivery acknowledgment (处理消息发送回执)
            if (packet.success && packet.tgChatId && packet.tgMsgId) {
                const msgKey = `${CONSTANTS.KEYS.TG2WA_MSG_PREFIX}${packet.tgChatId}:${packet.tgMsgId}`;
                if (packet.waMsgId) {
                    // Store mapping for potential deletion (存储映射用于后续撤回)
                    await redisPub.set(msgKey, packet.waMsgId, { EX: CONSTANTS.EXPIRY.MSG_MAPPING });
                } else if (packet.text === CONSTANTS.MESSAGES.DELETE_SUCCESS) {
                    // Cleanup mapping after successful deletion (撤回成功，清理映射)
                    await redisPub.del(msgKey);
                }
            }
            const text = packet.text || (packet.success ? '✅ 发送成功' : `❌ 发送失败: ${packet.error || '未知错误'}`);
            await safeSend(packet.tgChatId, () => tgBot.telegram.sendMessage(packet.tgChatId, text)).catch(() => {});
            break;
        }

        case 'groups_list': {
            // Display WhatsApp groups list (展示 WhatsApp 群组列表)
            let msg = `📋 *节点 \`${packet.instance}\` 的 WA 群组*\n\n`;
            packet.groups.forEach((g, i) => { msg += `${i + 1}. *${g.name}*\n   \`${g.id}\`\n\n`; });
            await safeSend(packet.tgChatId, () => tgBot.telegram.sendMessage(packet.tgChatId, msg, { parse_mode: 'Markdown' }));
            break;
        }
    }
}

/**
 * Main loop for consuming WA inbound messages
 * 消费 WA 进入消息的主循环
 */
async function startConsuming(tgBot) {
    const STREAM = CONSTANTS.STREAMS.WA_INBOUND;
    const GROUP = CONSTANTS.GROUPS.TG_GATEWAY;
    const NAME = config.GATEWAY_ID;

    await ensureConsumerGroup(STREAM, GROUP);
    console.log(`[Gateway] 🎧 开始消费 Stream: ${STREAM} (Consumer: ${NAME})`);

    while (true) {
        try {
            const results = await redisSub.xReadGroup(GROUP, NAME, [{ key: STREAM, id: '>' }], { COUNT: 20, BLOCK: 2000 });
            if (!results) continue;
            for (const { messages } of results) {
                for (const { id, message } of messages) {
                    try {
                        const packet = JSON.parse(message.data);
                        await handleWaPacket(tgBot, packet);
                        await redisSub.xAck(STREAM, GROUP, id);
                    } catch (err) {
                        console.error('[Gateway] Handle wa_inbound Error:', err);
                    }
                }
            }
        } catch (err) {
            console.error('[Gateway] Stream Loop Error:', err);
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

module.exports = {
    startConsuming
};
