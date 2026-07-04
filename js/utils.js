/* =========================================================================
 * utils.js - 通用工具函数
 * 包含：防抖、HTML 转义、时间解析/格式化、字段兼容取值等纯函数
 * 无副作用，便于单元测试
 * ========================================================================= */
(function (global) {
    'use strict';

    const Utils = {
        /**
         * 防抖函数：延迟执行，在指定时间内重复触发会重置计时
         * @param {Function} fn - 待执行函数
         * @param {number} delay - 延迟毫秒
         * @returns {Function} 防抖后的函数（带 cancel 方法）
         */
        debounce(fn, delay) {
            let timer = null;
            function debounced(...args) {
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => {
                    fn.apply(this, args);
                    timer = null;
                }, delay);
            }
            debounced.cancel = () => {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
            };
            return debounced;
        },

        /**
         * HTML 转义：防止 XSS，所有来自接口/用户的文本在插入 DOM 前必须转义
         */
        escapeHtml(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },

        /**
         * 兼容取值：从对象中按候选键名列表取首个非空值
         * 用于应对接口字段命名可能存在的差异
         */
        getField(obj, keys, fallback) {
            if (!obj) return fallback;
            for (const k of keys) {
                if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
                    return obj[k];
                }
            }
            return fallback;
        },

        /**
         * 规范化车站名称：去除首尾空白与常见后缀（站/车站/东站 等）
         * 用于直达/中转匹配时提高命中率
         */
        normalizeStation(name) {
            if (!name) return '';
            return String(name)
                .trim()
                .replace(/(火车站|车站|高铁站|南站|北站|东站|西站|站)$/, '');
        },

        /**
         * 解析时间字符串为时间戳（毫秒）
         * 支持 "2026-07-04 08:57:00" 与 "08:57:00" 两种格式
         */
        parseTime(timeStr) {
            if (!timeStr) return NaN;
            const s = String(timeStr).trim();
            // 含日期的完整格式
            if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) {
                return new Date(s.replace(' ', 'T')).getTime();
            }
            // 仅时间格式（补当日日期）
            if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) {
                const today = new Date();
                const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                return new Date(`${dateStr}T${s}`).getTime();
            }
            const parsed = Date.parse(s);
            return isNaN(parsed) ? NaN : parsed;
        },

        /**
         * 格式化出发时间：仅保留 HH:mm 部分，便于阅读
         */
        formatTime(timeStr) {
            if (!timeStr) return '--';
            const ts = Utils.parseTime(timeStr);
            if (isNaN(ts)) return Utils.escapeHtml(timeStr);
            const d = new Date(ts);
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        },

        /**
         * 计算两个时间点之间的时长（分钟）
         * @returns {number} 分钟数；若解析失败返回 NaN
         */
        diffMinutes(start, end) {
            const s = Utils.parseTime(start);
            const e = Utils.parseTime(end);
            if (isNaN(s) || isNaN(e)) return NaN;
            return Math.round((e - s) / 60000);
        },

        /**
         * 将分钟数格式化为 "X小时Y分钟" 文本
         */
        formatDuration(minutes) {
            if (isNaN(minutes) || minutes < 0) return '--';
            const h = Math.floor(minutes / 60);
            const m = minutes % 60;
            if (h === 0) return `${m}分钟`;
            if (m === 0) return `${h}小时`;
            return `${h}小时${m}分钟`;
        },

        /**
         * 根据「候车室/检票口」字段值返回展示文本
         * 规则：字段为 "--" 或空时展示「暂无信息」
         */
        formatGate(value) {
            if (!value || value === '--' || value === '—') return '暂无信息';
            return value;
        },

        /**
         * 根据运行状态返回对应的 CSS 类名
         */
        statusClass(status) {
            if (!status) return 'status-normal';
            const s = String(status);
            if (s.includes('晚点')) return 'status-late';
            if (s.includes('停')) return 'status-stopped';
            if (s.includes('检票')) return 'status-checking';
            return 'status-normal';
        },

        /**
         * 轻量深拷贝（用于缓存数据隔离）
         */
        clone(obj) {
            if (obj === null || typeof obj !== 'object') return obj;
            return JSON.parse(JSON.stringify(obj));
        }
    };

    global.Utils = Utils;
})(window);
