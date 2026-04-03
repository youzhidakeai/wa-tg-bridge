const { message } = require('telegraf/filters');
const CONSTANTS = require('../constants');
const { checkPermission, getBindingForTgChat, extractFsContent, dispatchToNode } = require('../utils/helpers');

/**
 * Register all message handlers for the Bot
 * 为 Bot 注册所有消息处理器
 */
module.exports = function registerMessageHandlers(tgBot) {
    
    // Text message handler (Requires /fs prefix)
    // 文本消息处理器（必须以 /fs 开头）
    tgBot.on(message('text'), async (ctx) => {
        const content = extractFsContent(ctx.message.text);
        if (content === null) return;
        
        if (!(await checkPermission(ctx))) return ctx.reply('⚠️ 权限不足');
        
        const tgId = String(ctx.chat.id);
        const { waId, instance } = await getBindingForTgChat(tgId);
        
        if (!waId || !instance) return ctx.reply('⚠️ 当前群未绑定 WA 群，请先使用 /bind');
        if (!content) return ctx.reply('⚠️ 请在 /fs 后面加上要发送的内容');
        
        await dispatchToNode(instance, CONSTANTS.ACTIONS.SEND_MESSAGE, { 
            waId, 
            text: content, 
            tgChatId: tgId, 
            tgMsgId: ctx.message.message_id 
        });
    });

    /**
     * Common media forwarding logic (Unified handler for Photos, Videos, Docs, etc.)
     * 通用媒体转发逻辑（图片、视频、文档等的统一处理器）
     */
    const handleMedia = async (ctx, type) => {
        const caption = extractFsContent(ctx.message.caption);
        if (caption === null) return; // Ignore if no /fs command (没有 /fs 指令则忽略)
        
        if (!(await checkPermission(ctx))) return ctx.reply('⚠️ 权限不足');
        
        const tgId = String(ctx.chat.id);
        const { waId, instance } = await getBindingForTgChat(tgId);
        
        if (!waId || !instance) return ctx.reply('⚠️ 当前群未绑定 WA 群，请先使用 /bind');

        try {
            let mediaObj = ctx.message[type];
            if (Array.isArray(mediaObj)) mediaObj = mediaObj.at(-1); // photo is an array (photo 是数组)
            
            // Limit file size to 20MB for performance (出于性能考虑限制文件大小为 20MB)
            if (mediaObj.file_size > 20 * 1024 * 1024) return ctx.reply('⚠️ 当前文件太大，请手动发送。');
            
            const fileId = mediaObj.file_id;
            const fileUrl = await ctx.telegram.getFileLink(fileId);
            
            // Determine Mimetype (确定媒体类型)
            let mimetype = mediaObj.mime_type || (type === 'photo' ? 'image/jpeg' : (type === 'video' ? 'video/mp4' : 'application/octet-stream'));
            if (type === 'voice') mimetype = mediaObj.mime_type || 'audio/ogg';
            if (type === 'audio') mimetype = mediaObj.mime_type || 'audio/mpeg';

            await dispatchToNode(instance, CONSTANTS.ACTIONS.SEND_MEDIA, {
                waId,
                mediaUrl: fileUrl.href,
                mimetype,
                caption,
                tgChatId: tgId,
                tgMsgId: ctx.message.message_id
            });
        } catch (err) {
            ctx.reply(`❌ ${type} 转发失败: ` + err.message);
        }
    };

    // Attach listeners for all media types (为所有媒体类型挂载监听器)
    tgBot.on(message('photo'),     ctx => handleMedia(ctx, 'photo'));
    tgBot.on(message('video'),     ctx => handleMedia(ctx, 'video'));
    tgBot.on(message('document'),  ctx => handleMedia(ctx, 'document'));
    tgBot.on(message('voice'),     ctx => handleMedia(ctx, 'voice'));
    tgBot.on(message('audio'),     ctx => handleMedia(ctx, 'audio'));
    tgBot.on(message('animation'), ctx => handleMedia(ctx, 'animation'));
};
