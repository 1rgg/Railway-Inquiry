/* =========================================================================
 * api.js - API 客户端
 * 职责：
 *   1. 封装 12306 开放 API 调用（GET）
 *   2. 请求超时控制（默认 10s）
 *   3. 请求失败自动重试 1 次
 *   4. 本地缓存读取（5 分钟有效期内优先命中缓存）
 *   5. 返回字段统一规范化，屏蔽接口字段命名差异
 * 安全：返回数据用于渲染前统一交由 Utils.escapeHtml 转义，防 XSS
 * ========================================================================= */
(function (global) {
    'use strict';

    const { API_BASE, API_ENCODING, REQUEST_TIMEOUT, RETRY_TIMES } = global.CONFIG;
    const { Utils, Cache } = global;

    /**
     * 规范化单条车次数据，统一字段名以便上层使用
     * 兼容接口可能返回的中英文键名
     */
    function normalizeTrain(raw) {
        return {
            trainNumber: Utils.getField(raw, ['车次号', 'trainNumber', 'train'], ''),
            departure: Utils.getField(raw, ['出发地', 'departure', 'from'], ''),
            destination: Utils.getField(raw, ['目的地', 'destination', 'arrival', 'to'], ''),
            departureTime: Utils.getField(raw, ['出发时间', 'departureTime', 'departTime'], ''),
            arrivalTime: Utils.getField(raw, ['到达时间', 'arrivalTime', 'arriveTime'], ''),
            gate: Utils.getField(raw, ['候车室/检票口', 'gate', 'waitingRoom', 'ticketGate'], '--'),
            status: Utils.getField(raw, ['状态', 'status', 'state'], '正点')
        };
    }

    /**
     * 规范化接口返回结构
     */
    function normalizeResponse(data) {
        const trains = Utils.getField(data, ['当前页车次列表', 'trainList', 'list', 'data'], []);
        return {
            station: Utils.getField(data, ['车站', 'station'], ''),
            currentPage: Number(Utils.getField(data, ['当前页码', 'currentPage'], 1)) || 1,
            totalPages: Number(Utils.getField(data, ['总页数', 'totalPages'], 1)) || 1,
            totalTrains: Number(Utils.getField(data, ['总车次', 'totalTrains', 'total'], 0)) || 0,
            pageSize: Number(Utils.getField(data, ['每页条数', 'pageSize'], 10)) || 10,
            trainList: (Array.isArray(trains) ? trains : []).map(normalizeTrain)
        };
    }

    /**
     * 带超时的 fetch 封装
     * 通过 AbortController 在超时后中止请求，避免页面长时间无响应
     */
    function fetchWithTimeout(url, timeout) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        return fetch(url, { signal: controller.signal, mode: 'cors' })
            .then((res) => {
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                return res.json();
            })
            .finally(() => clearTimeout(timer));
    }

    /**
     * 查询单站车次（核心请求方法）
     * 优先读缓存 → 失败重试 1 次 → 返回规范化数据
     * @param {string} station - 车站/城市名称
     * @param {number} [page=1] - 页码
     * @param {object} [opts] - { skipCache: boolean }
     */
    function queryStation(station, page, opts) {
        page = page || 1;
        opts = opts || {};

        // 1. 优先读取本地缓存
        if (!opts.skipCache) {
            const cached = Cache.get(station, page);
            if (cached) {
                return Promise.resolve(cached);
            }
        }

        // 2. 构造请求 URL（修正官方示例 encoding=josn 的拼写错误）
        const params = new URLSearchParams({
            msg: station,
            encoding: API_ENCODING,
            page: String(page)
        });
        const url = `${API_BASE}?${params.toString()}`;

        // 3. 带重试的请求
        let attempts = 0;
        function attempt() {
            attempts++;
            return fetchWithTimeout(url, REQUEST_TIMEOUT).then(normalizeResponse);
        }

        return attempt()
            .catch((err) => {
                // 重试 1 次后仍失败则抛出
                if (attempts <= RETRY_TIMES) {
                    return attempt();
                }
                throw err;
            })
            .then((data) => {
                // 4. 写入缓存
                Cache.set(station, page, data);
                return data;
            });
    }

    /**
     * 并行查询单站多页车次（用于中转查询时一次性获取更多车次）
     * 采用 Promise.all 并行发起，缩短整体等待时长
     */
    function queryStationAllPages(station, maxPages) {
        if (maxPages <= 1) {
            return queryStation(station, 1);
        }
        const tasks = [];
        for (let p = 1; p <= maxPages; p++) {
            tasks.push(queryStation(station, p).catch(() => null));
        }
        return Promise.all(tasks).then((results) => {
            const valid = results.filter(Boolean);
            if (valid.length === 0) {
                throw new Error('查询失败');
            }
            // 合并所有页的车次列表
            const merged = {
                station: valid[0].station,
                currentPage: 1,
                totalPages: valid[0].totalPages,
                totalTrains: valid[0].totalTrains,
                pageSize: valid[0].pageSize,
                trainList: valid.reduce((acc, r) => acc.concat(r.trainList), [])
            };
            return merged;
        });
    }

    global.Api = {
        queryStation,
        queryStationAllPages,
        normalizeTrain,
        normalizeResponse
    };
})(window);
