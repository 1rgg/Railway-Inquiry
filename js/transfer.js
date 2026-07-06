/* =========================================================================
 * transfer.js - 中转方案匹配算法
 * 核心业务逻辑：
 *   1. 分别取「出发站→中转城市」与「中转城市→到达站」的直达车次
 *   2. 笛卡尔积组合，筛选：中转到达时间 < 下一段出发时间，且停留≥1 小时
 *   3. 按总行程时长升序排序，优先展示耗时最短方案
 *
 * 说明：API 仅返回「出发时间」，未提供到达时间。
 *   本算法优先使用到达时间（若接口扩展返回）；
 *   若无到达时间，则使用「出发时间 + 估算旅行时长」作为到达时间的近似值，
 *   估算时长可通过 CONFIG.ESTIMATED_LEG_DURATION 调整。
 * ========================================================================= */
(function (global) {
    'use strict';

    const { Utils } = global;
    const MIN_LAYOVER = global.CONFIG.TRANSFER_MIN_LAYOVER;
    const EST_LEG = global.CONFIG.ESTIMATED_LEG_DURATION;

    /**
     * 从车次列表中筛选「目的地」与目标站匹配的直达车次
     * 匹配前对站名做规范化处理（去后缀），提高命中率
     */
    function filterDirectTrains(trainList, targetStation) {
        const target = Utils.normalizeStation(targetStation);
        if (!target) return [];
        return trainList.filter((t) => {
            return Utils.normalizeStation(t.destination) === target;
        });
    }

    /**
     * 取车次的「中转到达时间」：
     *   - 优先使用 arrivalTime（若 API 返回）
     *   - 否则用 departureTime + 估算旅行时长作为近似到达时间（时间戳）
     * @returns {number} 到达时间戳；解析失败返回 NaN
     */
    function getArrivalTs(train) {
        if (train.arrivalTime) {
            const ts = Utils.parseTime(train.arrivalTime);
            if (!isNaN(ts)) return ts;
        }
        const depTs = Utils.parseTime(train.departureTime);
        if (isNaN(depTs)) return NaN;
        return depTs + EST_LEG * 60 * 1000;
    }

    /**
     * 取车次从「中转站出发」的出发时间戳
     * @returns {number} 出发时间戳；解析失败返回 NaN
     */
    function getDepartureTs(train) {
        return Utils.parseTime(train.departureTime);
    }

    /**
     * 中转方案匹配主函数
     * @param {Array} firstLegTrains  - 出发站→中转城市的直达车次
     * @param {Array} secondLegTrains - 中转城市→到达站的直达车次
     * @param {string} transferStation - 中转站名（用于展示）
     * @returns {Array} 中转方案列表，按总行程时长升序
     *
     * 算法复杂度：O(n*m)，n、m 为两段车次数量；
     *   单次 100 条以内数据计算耗时通常 ≤300ms，不阻塞主线程（实际调用方可放 setTimeout）
     */
    function matchTransferPlans(firstLegTrains, secondLegTrains, transferStation) {
        const plans = [];

        for (const first of firstLegTrains) {
            const arriveAtTransfer = getArrivalTs(first);
            if (isNaN(arriveAtTransfer)) continue;

            for (const second of secondLegTrains) {
                const departFromTransfer = getDepartureTs(second);
                if (isNaN(departFromTransfer)) continue;

                // 中转停留时长（分钟）：需≥1 小时
                const layoverMin = Math.round((departFromTransfer - arriveAtTransfer) / 60000);
                if (layoverMin < MIN_LAYOVER) continue;

                // 总行程时长（分钟）：第一段出发 → 第二段到达
                const firstDepart = Utils.parseTime(first.departureTime);
                const secondArrive = getArrivalTs(second);
                let totalMin = NaN;
                if (!isNaN(firstDepart) && !isNaN(secondArrive)) {
                    totalMin = Math.round((secondArrive - firstDepart) / 60000);
                }

                plans.push({
                    firstLeg: first,
                    secondLeg: second,
                    transferStation: transferStation,
                    arriveAtTransferTs: arriveAtTransfer,
                    departFromTransferTs: departFromTransfer,
                    layoverMinutes: layoverMin,
                    totalMinutes: totalMin
                });
            }
        }

        // 按总行程时长升序排序（无法计算的排末尾）
        plans.sort((a, b) => {
            if (isNaN(a.totalMinutes) && isNaN(b.totalMinutes)) return 0;
            if (isNaN(a.totalMinutes)) return 1;
            if (isNaN(b.totalMinutes)) return -1;
            return a.totalMinutes - b.totalMinutes;
        });

        return plans;
    }

    /**
     * 完整中转查询流程：
     *   1. 并行查询两段车站的车次
     *   2. 分别筛出指向中转站 / 终点站的直达车次
     *   3. 匹配并排序
     * @param {object} api - 注入 API 模块（便于测试时 mock）
     * @param {string} fromStation - 出发站
     * @param {string} transferStation - 中转城市
     * @param {string} toStation - 到达站
     * @param {number} maxPages - 每段查询的最大页数
     */
    function findTransferPlans(api, fromStation, transferStation, toStation, maxPages) {
        maxPages = maxPages || 1;

        // 并行发起两段查询，缩短等待时长
        return Promise.all([
            api.queryStationAllPages(fromStation, maxPages),
            api.queryStationAllPages(transferStation, maxPages)
        ]).then(([fromData, transferData]) => {
            // 第一段：出发站出发、目的地 = 中转城市
            const firstLeg = filterDirectTrains(fromData.trainList, transferStation);
            // 第二段：中转城市出发、目的地 = 到达站
            const secondLeg = filterDirectTrains(transferData.trainList, toStation);

            const plans = matchTransferPlans(firstLeg, secondLeg, transferStation);
            return {
                plans: plans,
                firstLegCount: firstLeg.length,
                secondLegCount: secondLeg.length
            };
        });
    }

    global.Transfer = {
        filterDirectTrains,
        matchTransferPlans,
        findTransferPlans,
        getArrivalTs,
        getDepartureTs
    };
})(window);
