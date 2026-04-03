module.exports = {
    // Redis Streams (消息流名称)
    STREAMS: {
        WA_INBOUND: 'wa_inbound',
        TG_OUTBOUND_PREFIX: 'tg_outbound_',
    },

    // Consumer Groups (消费者组)
    GROUPS: {
        TG_GATEWAY: 'tg_gateway',
        WA_WORKERS: 'wa_workers',
    },

    // Default IDs (默认标识符)
    DEFAULTS: {
        GATEWAY_ID: 'tg-node-1',
    },

    // Redis Keys and Prefixes (Redis 键名与前缀)
    KEYS: {
        ADMIN_IDS: 'admin_ids',
        QR_CACHE_PREFIX: 'qr_cache_',
        WA_STATUS_PREFIX: 'wa_status_',
        TG2WA: 'tg2wa',
        TG2INSTANCE: 'tg2instance',
        WA2TG: 'wa2tg',
        WA2INSTANCE: 'wa2instance',
        TG2WA_MSG_PREFIX: 'tg2wa_msg:',
        WA_NODES_COUNTER: 'wa_nodes_counter',
        WA_HEARTBEATS: 'wa:heartbeats',
        MSG_COUNT_PREFIX: 'wa_msg_count:',
        START_TIME_PREFIX: 'wa_start_time:',
        HOST_STATS: 'host_stats',
        PROXY_PREFIX: 'wa_proxy:',
    },

    // Expiry times (seconds) (过期时间 - 秒)
    EXPIRY: {
        QR_CACHE: 60,
        MSG_MAPPING: 604800, // 7 days (7天)
    },

    // Actions (指令动作类型)
    ACTIONS: {
        SEND_MESSAGE: 'send_message',
        SEND_MEDIA: 'send_media',
        DELETE_MESSAGE: 'delete_message',
        GET_GROUPS: 'get_groups',
        REINITIALIZE: 'reinitialize',
        UPDATE_PROXY: 'update_proxy',
        STOP_NODE: 'stop_node',
    },

    // Messages (系统消息文本)
    MESSAGES: {
        DELETE_SUCCESS: '🗑️ 消息已在 WhatsApp 撤回',
    }
};
