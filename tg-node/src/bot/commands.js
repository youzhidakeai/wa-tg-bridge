const QRCode = require('qrcode');
const CONSTANTS = require('../constants');
const { redisPub } = require('../services/redis');
const { dispatchToNode, checkPermission } = require('../utils/helpers');

/**
 * Register all Bot commands (注册所有 Bot 指令)
 */
module.exports = function registerCommands(tgBot) {
    
    // Help menu (帮助菜单)
    tgBot.command('help', async (ctx) => {
        let msg = '📖 *可用指令说明 / Available Commands*\n\n';
        msg += '🛠️ *系统管理 / System Management*\n';
        msg += '• `/deploy [name] [proxies]` - 部署新节点 / Deploy a new node\n';
        msg += '• `/stop [instance]` - 停止并下线节点 / Stop and remove a node\n';
        msg += '• `/dashboard` - 系统状态看板 / System dashboard\n';
        msg += '• `/status` - 在线心跳检查 / Online heartbeats check\n';
        msg += '• `/login [instance]` - 获取登录二维码 / Get WA login QR code\n';
        msg += '• `/reconnect [instance]` - 强制重连节点 / Force node reconnection\n';
        msg += '• `/set_proxy [instance] [url]` - 更新代理 / Update node proxy\n\n';
        
        msg += '🔗 *绑定与转发 / Binding & Forwarding*\n';
        msg += '• `/cid` - 查看当前群组绑定 / View current group binding\n';
        msg += '• `/allwa [instance]` - 拉取所有 WA 群组 / Fetch all WA groups\n';
        msg += '• `/bind [instance] [WA_ID]` - 建立群组绑定 / Bind TG to WA group\n';
        msg += '• `/rebind [instance] [WA_ID]` - 重新绑定群组 / Rebind TG to WA group\n';
        msg += '• `/fs [text]` - 转发消息 (或媒体标题) / Forward message (or media caption)\n';
        msg += '• `/delete` (或 `/sc`) - 撤回消息 / Delete/Recall message\n\n';
        
        msg += '💡 *提示 / Tips*: 部署与管理指令建议私聊使用。 / Admin commands are recommended for private chat.';
        ctx.replyWithMarkdown(msg);
    });

    // Deploy node (部署节点)
    tgBot.command('deploy', async (ctx) => {
        if (ctx.chat.type !== 'private') {
            return ctx.reply('⚠️ 安全警告：部署指令涉及系统核心权限，禁止在群组中使用，请私聊机器人操作。');
        }
        if (!(await checkPermission(ctx))) return ctx.reply('⚠️ 权限不足');

        const args = ctx.message.text.split(' ');
        const customName = args[1] !== 'auto' ? args[1] : null;
        const proxies = args[2] ? args[2].split(',') : [];

        const task = {
            action: 'DEPLOY_NODE',
            customName: customName || null,
            proxies: proxies,
            tgChatId: String(ctx.chat.id),
            timestamp: Date.now()
        };

        try {
            await redisPub.lPush('docker_manager_tasks', JSON.stringify(task));
            let msg = '🚀 部署任务已提交给系统管理员...';
            if (proxies.length > 0) msg += `\n🌐 已录入 ${proxies.length} 个代理。`;
            ctx.reply(msg);
        } catch (err) {
            ctx.reply(`❌ 提交任务失败: ${err.message}`);
        }
    });

    // Dashboard (看板)
    tgBot.command('dashboard', async (ctx) => {
        if (!(await checkPermission(ctx))) return ctx.reply('⚠️ 权限不足');
        try {
            const hostStatsRaw = await redisPub.get(CONSTANTS.KEYS.HOST_STATS);
            const hostStats = hostStatsRaw ? JSON.parse(hostStatsRaw) : null;
            const now = Math.floor(Date.now() / 1000);
            const activeNodes = await redisPub.zRangeByScore(CONSTANTS.KEYS.WA_HEARTBEATS, now - 120, '+inf');

            let msg = '📈 *系统监控看板 / Dashboard*\n\n';
            if (hostStats) {
                msg += `🖥️ *宿主机状态*\n├ 内存: \`${hostStats.memUsage}%\` (${hostStats.freeMemMB}MB Free)\n└ 负载: \`${hostStats.load}\` (1min Avg)\n\n`;
            }
            msg += `🤖 *节点运行详情* (${activeNodes.length} Online)\n`;
            for (const instanceId of activeNodes) {
                const info = await redisPub.get(`${CONSTANTS.KEYS.WA_STATUS_PREFIX}${instanceId}`) || '初始化中';
                const count = await redisPub.get(`${CONSTANTS.KEYS.MSG_COUNT_PREFIX}${instanceId}`) || '0';
                const startTime = await redisPub.get(`${CONSTANTS.KEYS.START_TIME_PREFIX}${instanceId}`);
                let uptime = '未知';
                if (startTime) {
                    const diff = Math.floor((Date.now() - parseInt(startTime)) / 1000);
                    const h = Math.floor(diff / 3600);
                    const m = Math.floor((diff % 3600) / 60);
                    uptime = `${h}h ${m}m`;
                }
                msg += `\n🔸 \`${instanceId}\`\n   👤 ${info}\n   📩 转发量: \`${count}\` | ⏱️ 运行: \`${uptime}\`\n`;
            }
            if (activeNodes.length === 0) msg += `_(当前无在线节点)_\n`;
            ctx.replyWithMarkdown(msg);
        } catch (err) {
            ctx.reply('❌ 生成看板失败: ' + err.message);
        }
    });

    // Manual login QR request (手动请求登录二维码)
    tgBot.command('login', async (ctx) => {
        if (!(await checkPermission(ctx))) return ctx.reply('⚠️ 权限不足');
        const instance = ctx.message.text.split(' ')[1];
        if (!instance) return ctx.reply('⚠️ 用法: /login <实例名>');

        const cachedQR = await redisPub.get(`${CONSTANTS.KEYS.QR_CACHE_PREFIX}${instance}`);
        if (!cachedQR) return ctx.reply(`⚠️ 节点 \`${instance}\` 当前无待扫二维码。`, { parse_mode: 'Markdown' });

        try {
            const buf = await QRCode.toBuffer(cachedQR, { errorCorrectionLevel: 'H', margin: 4, width: 400 });
            await ctx.replyWithPhoto({ source: buf }, { caption: `📱 节点 \`${instance}\` 登录二维码\n*(有效期约 20 秒)*`, parse_mode: 'Markdown' });
        } catch (err) {
            ctx.reply('❌ 生成二维码失败: ' + err.message);
        }
    });

    // Force node reconnection (强制节点重连)
    tgBot.command('reconnect', async (ctx) => {
        if (!(await checkPermission(ctx))) return ctx.reply('⚠️ 权限不足');
        const instance = ctx.message.text.split(' ')[1];
        if (!instance) return ctx.reply('⚠️ 用法: /reconnect <实例名>');
        try {
            await dispatchToNode(instance, CONSTANTS.ACTIONS.REINITIALIZE, {});
            ctx.reply(`🔄 已向节点 \`${instance}\` 发送重连指令，稍后会推送新二维码。`, { parse_mode: 'Markdown' });
        } catch (err) {
            ctx.reply('❌ 发送重连指令失败: ' + err.message);
        }
    });

    // Update node proxy (更新节点代理)
    tgBot.command('set_proxy', async (ctx) => {
        if (!(await checkPermission(ctx))) return ctx.reply('⚠️ 权限不足');
        const args = ctx.message.text.split(' ');
        const instance = args[1];
        const proxyUrl = args[2];
        if (!instance) return ctx.reply('⚠️ 用法: /set_proxy <实例名> <代理URL>');
        try {
            await dispatchToNode(instance, CONSTANTS.ACTIONS.UPDATE_PROXY, { proxyUrl });
            ctx.reply(`🔄 已向节点 \`${instance}\` 发送代理更新指令，节点将重新初始化...`, { parse_mode: 'Markdown' });
        } catch (err) {
            ctx.reply('❌ 发送指令失败: ' + err.message);
        }
    });

    // Check all online nodes (查看所有在线节点)
    tgBot.command('status', async (ctx) => {
        if (!(await checkPermission(ctx))) return ctx.reply('⚠️ 权限不足');
        const now = Math.floor(Date.now() / 1000);
        const activeNodes = await redisPub.zRangeByScore(CONSTANTS.KEYS.WA_HEARTBEATS, now - 15, '+inf');
        if (!activeNodes.length) return ctx.reply('📭 当前没有任何在线节点');
        let msg = '📊 *各在线节点状态*\n\n';
        for (const instanceName of activeNodes) {
            const info = await redisPub.get(`${CONSTANTS.KEYS.WA_STATUS_PREFIX}${instanceName}`) || '未登录/初始化中';
            msg += `🖥️ \`${instanceName}\`\n👤 ${info}\n\n`;
        }
        ctx.replyWithMarkdown(msg);
    });

    // List WA groups (获取 WA 群组列表)
    tgBot.command('allwa', async (ctx) => {
        if (!(await checkPermission(ctx))) return ctx.reply('⚠️ 权限不足');
        const instance = ctx.message.text.split(' ')[1];
        if (!instance) return ctx.reply('⚠️ 用法: /allwa <实例名>');
        await ctx.reply(`🔍 正在向节点 \`${instance}\` 拉取群组列表...`, { parse_mode: 'Markdown' });
        await dispatchToNode(instance, CONSTANTS.ACTIONS.GET_GROUPS, { tgChatId: String(ctx.chat.id) });
    });

    // Bind TG Group to WA Group (建立群组绑定)
    tgBot.command('bind', async (ctx) => {
        if (!(await checkPermission(ctx))) return ctx.reply('⚠️ 权限不足');
        const parts = ctx.message.text.split(' ');
        const instance = parts[1];
        const waId = parts[2];
        const tgId = String(ctx.chat.id);
        if (!instance || !waId) return ctx.reply('⚠️ 用法: /bind <实例名> <WA群ID>');
        try {
            await redisPub.hSet(CONSTANTS.KEYS.WA2TG, waId, tgId);
            await redisPub.hSet(CONSTANTS.KEYS.TG2WA, tgId, waId);
            await redisPub.hSet(CONSTANTS.KEYS.WA2INSTANCE, waId, instance);
            await redisPub.hSet(CONSTANTS.KEYS.TG2INSTANCE, tgId, instance);
            ctx.reply(`✅ 绑定成功！\n🖥️ 节点: \`${instance}\`\n📲 WA: \`${waId}\`\n💬 TG: \`${tgId}\``, { parse_mode: 'Markdown' });
        } catch (e) {
            ctx.reply('❌ 写入 Redis 失败: ' + e.message);
        }
    });

    // Rebind TG Group to WA Group (重新建立绑定，清理冲突)
    tgBot.command('rebind', async (ctx) => {
        if (!(await checkPermission(ctx))) return ctx.reply('⚠️ 权限不足');
        const parts = ctx.message.text.split(' ');
        const instance = parts[1];
        const newWaId = parts[2];
        const currentTgId = String(ctx.chat.id);
        if (!instance || !newWaId) return ctx.reply('⚠️ 用法: /rebind <实例名> <WA群ID>');
        try {
            await ctx.reply('🔄 清理旧路由中...');
            const oldWaId = await redisPub.hGet(CONSTANTS.KEYS.TG2WA, currentTgId);
            if (oldWaId) {
                await redisPub.hDel(CONSTANTS.KEYS.WA2TG, oldWaId);
                await redisPub.hDel(CONSTANTS.KEYS.WA2INSTANCE, oldWaId);
            }
            const oldTgId = await redisPub.hGet(CONSTANTS.KEYS.WA2TG, newWaId);
            if (oldTgId) {
                await redisPub.hDel(CONSTANTS.KEYS.TG2WA, oldTgId);
                await redisPub.hDel(CONSTANTS.KEYS.TG2INSTANCE, oldTgId);
            }
            await redisPub.hSet(CONSTANTS.KEYS.WA2TG, newWaId, currentTgId);
            await redisPub.hSet(CONSTANTS.KEYS.TG2WA, currentTgId, newWaId);
            await redisPub.hSet(CONSTANTS.KEYS.WA2INSTANCE, newWaId, instance);
            await redisPub.hSet(CONSTANTS.KEYS.TG2INSTANCE, currentTgId, instance);
            let msg = `✅ *重新绑定成功！*\n\n🖥️ 节点: \`${instance}\`\n📲 WA: \`${newWaId}\``;
            if (oldWaId) msg += `\n\n*(已清理旧绑定: \`${oldWaId}\`)*`;
            ctx.replyWithMarkdown(msg);
        } catch (e) {
            ctx.reply('❌ 重新绑定失败: ' + e.message);
        }
    });

    // Recall/Delete forwarded message (撤回已转发消息)
    tgBot.command(['delete', 'sc'], async (ctx) => {
        if (!(await checkPermission(ctx))) return ctx.reply('⚠️ 权限不足');
        const reply = ctx.message.reply_to_message;
        if (!reply) return ctx.reply('⚠️ 请引用回复你想撤回的消息');
        const tgId = String(ctx.chat.id);
        const tgMsgId = reply.message_id;
        const msgKey = `${CONSTANTS.KEYS.TG2WA_MSG_PREFIX}${tgId}:${tgMsgId}`;
        const waMsgId = await redisPub.get(msgKey);
        if (!waMsgId) return ctx.reply('⚠️ 找不到该消息的撤回记录');
        const { instance } = await require('../utils/helpers').getBindingForTgChat(tgId);
        if (!instance) return ctx.reply('⚠️ 无法识别该群组的节点实例');
        await dispatchToNode(instance, CONSTANTS.ACTIONS.DELETE_MESSAGE, { waMsgId, tgChatId: tgId, tgMsgId: tgMsgId });
    });

    // Stop and remove node (停止并下线节点)
    tgBot.command('stop', async (ctx) => {
        if (!(await checkPermission(ctx))) return ctx.reply('⚠️ 权限不足');
        const instance = ctx.message.text.split(' ')[1];
        if (!instance) return ctx.reply('⚠️ 用法: /stop <实例名>');

        const task = {
            action: 'STOP_NODE',
            instanceName: instance,
            tgChatId: String(ctx.chat.id),
            timestamp: Date.now()
        };

        try {
            await redisPub.lPush('docker_manager_tasks', JSON.stringify(task));
            ctx.reply(`🛑 停止任务已提交：正在尝试下线节点 \`${instance}\`...`, { parse_mode: 'Markdown' });
        } catch (err) {
            ctx.reply(`❌ 提交任务失败: ${err.message}`);
        }
    });

    // Check Chat ID information (查看群组 ID 信息)
    tgBot.command('cid', async (ctx) => {
        if (!(await checkPermission(ctx))) return ctx.reply('⚠️ 权限不足');
        const tgId = String(ctx.chat.id);
        const { waId, instance } = await require('../utils/helpers').getBindingForTgChat(tgId);
        let msg = `🪪 *当前群组信息*\n\n📌 *TG 群 ID:*\n\`${tgId}\`\n`;
        msg += waId ? `\n🔗 *WA 群 ID:*\n\`${waId}\`` : '\n⚠️ *WA 群:* 尚未绑定';
        msg += instance ? `\n\n🖥️ *节点实例:*\n\`${instance}\`` : '';
        ctx.replyWithMarkdown(msg);
    });
};
