/* =========================================================================
 * cache.js - 本地短期缓存管理
 * 用于缓存相同车站、相同页码的查询结果，有效期 5 分钟
 * 降低网络请求频次，提升弱网环境下的响应速度
 * ========================================================================= */
(function (global) {
    'use strict';

    const CACHE_PREFIX = 'rt_cache_';
    const TTL = global.CONFIG.CACHE_TTL;

    const Cache = {
        /**
         * 生成缓存键（含时间戳前缀，便于隔离）
         */
        _key(station, page) {
            const n = global.Utils.normalizeStation(station);
            return `${CACHE_PREFIX}${encodeURIComponent(n)}_p${page || 1}`;
        },

        /**
         * 读取缓存：过期则返回 null 并清理
         */
        get(station, page) {
            try {
                const raw = localStorage.getItem(this._key(station, page));
                if (!raw) return null;
                const data = JSON.parse(raw);
                if (Date.now() - data.ts > TTL) {
                    localStorage.removeItem(this._key(station, page));
                    return null;
                }
                return global.Utils.clone(data.value);
            } catch (e) {
                return null;
            }
        },

        /**
         * 写入缓存（带克隆，避免外部修改污染缓存）
         */
        set(station, page, value) {
            try {
                localStorage.setItem(
                    this._key(station, page),
                    JSON.stringify({ ts: Date.now(), value: global.Utils.clone(value) })
                );
            } catch (e) {
                // 存储满或被禁用时静默失败，不影响主流程
            }
        },

        /**
         * 清除全部缓存项
         */
        clear() {
            try {
                const keys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    if (localStorage.key(i).indexOf(CACHE_PREFIX) === 0) {
                        keys.push(localStorage.key(i));
                    }
                }
                keys.forEach((k) => localStorage.removeItem(k));
            } catch (e) {
                // 忽略
            }
        }
    };

    global.Cache = Cache;
})(window);
