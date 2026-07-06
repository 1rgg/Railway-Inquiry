/* =========================================================================
 * config.js - 全局配置常量
 * 集中管理 API 地址、分页、缓存、超时等可调参数，便于维护
 * ========================================================================= */
(function (global) {
    'use strict';

    const CONFIG = {
        // 12306 开放 API
        API_BASE: 'https://tmini.net/api/12306',
        API_ENCODING: 'json',
        // 默认查询页码
        DEFAULT_PAGE: 1,
        // 每页条数（与 API 分页能力对齐）
        PAGE_SIZE: 10,
        // 请求超时时间（毫秒）
        REQUEST_TIMEOUT: 10000,
        // 请求失败自动重试次数
        RETRY_TIMES: 1,
        // 查询防抖时长（毫秒）
        DEBOUNCE_DELAY: 300,
        // 本地缓存有效期（毫秒，5 分钟）
        CACHE_TTL: 5 * 60 * 1000,
        // 历史记录最大保存条数
        HISTORY_MAX: 5,
        // 中转最小停留时长（分钟，1 小时）
        TRANSFER_MIN_LAYOVER: 60,
        // 当 API 未返回到达时间时，单段估算旅行时长（分钟）
        ESTIMATED_LEG_DURATION: 120,
        // 热门中转城市
        HOT_CITIES: ['北京', '上海', '广州', '郑州', '武汉', '南京', '西安'],
        // 主题色（与 CSS 变量保持一致）
        THEME_COLOR: '#165DFF'
    };

    global.CONFIG = CONFIG;
})(window);
