const { Client, LocalAuth } = require('whatsapp-web.js');
const config = require('../config');
const CONSTANTS = require('../constants');
const { redisPub } = require('../services/redis');

let waClient = null;
let heartbeatTimer = null;
let instanceId = '';

/**
 * Notify the TG Gateway via wa_inbound stream
 * 通过 wa_inbound 消息流通知 TG 网关
 */
async function notifyGateway(type, payload) {
    const data = JSON.stringify({ instance: instanceId, type, ...payload });
    await redisPub.xAdd(CONSTANTS.STREAMS.WA_INBOUND, '*', { data });
}

/**
 * Start node heartbeat reporting (Update Redis ZSET every 5s)
 * 启动节点心跳上报（每 5 秒更新一次 Redis ZSET）
 */
function startHeartbeat() {
    const update = async () => {
        try {
            const timestamp = Math.floor(Date.now() / 1000);
            await redisPub.zAdd(CONSTANTS.KEYS.WA_HEARTBEATS, { score: timestamp, value: instanceId });
        } catch (err) {
            console.error(`[${instanceId}] Heartbeat failed:`, err.message);
        }
    };
    update();
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(update, 5000);
}

/**
 * Stop heartbeat reporting (停止心跳上报)
 */
function stopHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
}

/**
 * Setup WhatsApp client event listeners
 * 设置 WhatsApp 客户端事件监听器
 */
function setupWaEvents() {
    // QR Code generated (收到新二维码)
    waClient.on('qr', async qr => {
        console.log(`[${instanceId}] 📱 QR Code Received`);
        await notifyGateway('qr', { qr });
    });

    // Client logged in and ready (登录成功并就绪)
    waClient.on('ready', async () => {
        const { pushname, wid } = waClient.info;
        const accountInfo = `${pushname} (${wid.user})`;
        
        // Store account status and start heartbeat (记录账号状态并开启心跳)
        await redisPub.set(`${CONSTANTS.KEYS.WA_STATUS_PREFIX}${instanceId}`, accountInfo);
        console.log(`[${instanceId}] ✅ Login Successful: ${accountInfo}`);
        
        await notifyGateway('ready', { accountInfo });
        startHeartbeat();
    });

    // Client disconnected (连接断开)
    waClient.on('disconnected', async reason => {
        const accountInfo = await redisPub.get(`${CONSTANTS.KEYS.WA_STATUS_PREFIX}${instanceId}`) || 'Unknown';
        console.error(`[${instanceId}] ❌ Disconnected: ${reason}`);
        await notifyGateway('disconnected', { accountInfo, reason });
        stopHeartbeat();
    });

    // Incoming WA message (收到 WA 消息)
    waClient.on('message', async msg => {
        try {
            // Check if sender is bound to a TG group (检查发送者是否绑定了 TG 群组)
            const targetTgId = await redisPub.hGet(CONSTANTS.KEYS.WA2TG, msg.from);
            if (!targetTgId) return;

            const contact = await msg.getContact();
            const sender = contact.pushname || contact.number;
            const payload = { targetTgId, sender, body: msg.body, msgType: msg.type, waGroupId: msg.from };

            // Handle Media Content (处理媒体内容)
            if (msg.hasMedia) {
                try {
                    const media = await msg.downloadMedia();
                    if (media && media.data) {
                        // Size check for Base64 data (检查 Base64 数据大小)
                        const sizeInBytes = media.data.length * 0.75;
                        if (sizeInBytes > 20 * 1024 * 1024) {
                            await notifyGateway('message', { targetTgId, sender, body: '⚠️ WA 群有收到过大文件，请登录远程手动检查。' });
                            return;
                        }
                        payload.mediaBase64 = media.data;
                        payload.mediaMimeType = media.mimetype;
                        payload.mediaFilename = media.filename || '';
                    }
                } catch (dlErr) { console.error(`[${instanceId}] Media download failed:`, dlErr); }
            }
            
            // Forward message to Gateway (将消息转发至网关)
            await notifyGateway('message', payload);
            await redisPub.incr(`${CONSTANTS.KEYS.MSG_COUNT_PREFIX}${instanceId}`);
        } catch (err) { console.error(`[${instanceId}] Handle WA Message Error:`, err); }
    });
}

/**
 * Initialize or re-initialize the WA Client
 * 初始化或重新初始化 WA 客户端
 */
async function startClient(id) {
    instanceId = id;
    stopHeartbeat();
    
    // Cleanup old client instance (清理旧客户端实例)
    if (waClient) {
        try { await waClient.destroy(); } catch (e) {}
    }

    // Resolve Proxy configuration (确定代理配置)
    let proxyUrl = await redisPub.get(`${CONSTANTS.KEYS.PROXY_PREFIX}${instanceId}`);
    if (!proxyUrl && process.env.PROXY) proxyUrl = process.env.PROXY;

    const puppeteerArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
    if (proxyUrl) {
        console.log(`[${instanceId}] Using Proxy: ${proxyUrl}`);
        puppeteerArgs.push(`--proxy-server=${proxyUrl}`);
    }

    // Create new WA Client with LocalAuth (创建带本地验证的 WA 客户端)
    waClient = new Client({
        authStrategy: new LocalAuth({ clientId: instanceId, dataPath: config.SESSION_ROOT }),
        puppeteer: { args: puppeteerArgs }
    });

    setupWaEvents();
    waClient.initialize();
}

module.exports = {
    startClient,
    stopHeartbeat,
    getWaClient: () => waClient,
    notifyGateway
};
