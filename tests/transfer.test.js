/* =========================================================================
 * transfer.test.js - 中转方案匹配算法单元测试（核心业务逻辑）
 * 覆盖：直达筛选、到达时间估算、中转停留约束、总时长排序
 * 使用伪造车次数据，不依赖网络
 * ========================================================================= */
(function () {
    'use strict';
    const { Transfer, Utils } = window;
    const { equal, truthy, falsy } = window.assert;

    // 构造伪造车次数据
    function makeTrain(num, from, to, depTime, arrTime) {
        return {
            trainNumber: num,
            departure: from,
            destination: to,
            departureTime: depTime,
            arrivalTime: arrTime || '',
            gate: '候车厅/1A检票口',
            status: '正点'
        };
    }

    /* ---- filterDirectTrains：按目的地筛选直达车次 ---- */
    __test('filterDirectTrains 筛选目的地匹配的车次', function () {
        const trains = [
            makeTrain('G1', '北京', '上海', '08:00:00'),
            makeTrain('G2', '北京', '天津', '09:00:00'),
            makeTrain('G3', '北京', '上海虹桥', '10:00:00'),
            makeTrain('G4', '北京', '南京', '11:00:00')
        ];
        // 规范化后「上海虹桥」应匹配「上海」前缀？注意：规范化只去后缀，不模糊前缀
        const result = Transfer.filterDirectTrains(trains, '上海');
        // 「上海」规范化仍为「上海」，「上海虹桥」规范化为「上海虹桥」，不匹配
        truthy(result.length === 1, '仅精确匹配（规范化后）上海的车次');
        equal(result[0].trainNumber, 'G1');
    });

    __test('filterDirectTrains 站名后缀兼容匹配', function () {
        const trains = [
            makeTrain('G1', '北京', '上海站', '08:00:00'),
            makeTrain('G2', '北京', '上海虹桥', '09:00:00')
        ];
        const result = Transfer.filterDirectTrains(trains, '上海');
        equal(result.length, 1, '上海站 规范化后为 上海，应匹配');
        equal(result[0].trainNumber, 'G1');
    });

    __test('filterDirectTrains 空目标返回空数组', function () {
        const trains = [makeTrain('G1', '北京', '上海', '08:00:00')];
        equal(Transfer.filterDirectTrains(trains, '').length, 0);
        equal(Transfer.filterDirectTrains(trains, null).length, 0);
    });

    /* ---- getArrivalTs：到达时间优先级 ---- */
    __test('getArrivalTs 优先使用 arrivalTime', function () {
        const train = makeTrain('G1', '北京', '上海', '2026-07-04 08:00:00', '2026-07-04 12:00:00');
        const ts = Transfer.getArrivalTs(train);
        equal(new Date(ts).getHours(), 12);
        equal(new Date(ts).getMinutes(), 0);
    });

    __test('getArrivalTs 无 arrivalTime 时用出发时间+估算时长', function () {
        const train = makeTrain('G1', '北京', '上海', '2026-07-04 08:00:00');
        const ts = Transfer.getArrivalTs(train);
        const expected = Utils.parseTime('2026-07-04 08:00:00') + 120 * 60 * 1000;
        equal(ts, expected);
        equal(new Date(ts).getHours(), 10, '8 点出发 +2 小时 = 10 点');
    });

    /* ---- matchTransferPlans：核心匹配与排序 ---- */
    __test('matchTransferPlans 仅保留停留≥1小时的组合', function () {
        // 第一段：北京→郑州，8:00 出发，10:00 到达郑州
        const firstLeg = [
            makeTrain('G1', '北京', '郑州', '2026-07-04 08:00:00', '2026-07-04 10:00:00')
        ];
        // 第二段：郑州→武汉，分别给出停留不足 1h / 恰好 1h / 充足 3h
        const secondLeg = [
            makeTrain('G2', '郑州', '武汉', '2026-07-04 10:30:00', '2026-07-04 12:00:00'), // 停留 30 分钟，应排除
            makeTrain('G3', '郑州', '武汉', '2026-07-04 11:00:00', '2026-07-04 13:00:00'), // 停留 1 小时，应保留
            makeTrain('G4', '郑州', '武汉', '2026-07-04 13:00:00', '2026-07-04 15:00:00')  // 停留 3 小时，应保留
        ];
        const plans = Transfer.matchTransferPlans(firstLeg, secondLeg, '郑州');
        equal(plans.length, 2, '应仅保留停留≥1小时的 2 个方案');
        // 验证排除了 30 分钟停留的方案
        const nums = plans.map(p => p.secondLeg.trainNumber).sort();
        truthy(nums.indexOf('G2') === -1, '停留 30 分钟的 G2 应被排除');
    });

    __test('matchTransferPlans 按总行程时长升序排序', function () {
        const firstLeg = [
            makeTrain('G1', '北京', '郑州', '2026-07-04 08:00:00', '2026-07-04 10:00:00')
        ];
        const secondLeg = [
            makeTrain('G2', '郑州', '武汉', '2026-07-04 13:00:00', '2026-07-04 15:00:00'), // 总 7 小时
            makeTrain('G3', '郑州', '武汉', '2026-07-04 11:00:00', '2026-07-04 13:00:00')  // 总 5 小时
        ];
        const plans = Transfer.matchTransferPlans(firstLeg, secondLeg, '郑州');
        equal(plans.length, 2);
        equal(plans[0].secondLeg.trainNumber, 'G3', '总时长更短的 G3 应排首位');
        equal(plans[1].secondLeg.trainNumber, 'G2');
        truthy(plans[0].totalMinutes <= plans[1].totalMinutes, '应升序排列');
    });

    __test('matchTransferPlans 计算中转停留时长', function () {
        const firstLeg = [
            makeTrain('G1', '北京', '郑州', '2026-07-04 08:00:00', '2026-07-04 10:00:00')
        ];
        const secondLeg = [
            makeTrain('G2', '郑州', '武汉', '2026-07-04 12:00:00', '2026-07-04 14:00:00')
        ];
        const plans = Transfer.matchTransferPlans(firstLeg, secondLeg, '郑州');
        equal(plans.length, 1);
        equal(plans[0].layoverMinutes, 120, '停留 10:00→12:00 = 120 分钟');
        equal(plans[0].totalMinutes, 360, '总行程 08:00→14:00 = 360 分钟');
    });

    __test('matchTransferPlans 无可衔接方案返回空数组', function () {
        const firstLeg = [
            makeTrain('G1', '北京', '郑州', '2026-07-04 08:00:00', '2026-07-04 10:00:00')
        ];
        const secondLeg = [
            makeTrain('G2', '郑州', '武汉', '2026-07-04 10:20:00', '2026-07-04 12:00:00') // 停留不足 1 小时
        ];
        const plans = Transfer.matchTransferPlans(firstLeg, secondLeg, '郑州');
        equal(plans.length, 0);
    });

    __test('matchTransferPlans 空输入返回空数组', function () {
        equal(Transfer.matchTransferPlans([], [], '郑州').length, 0);
    });

    /* ---- findTransferPlans：集成流程（使用 mock API） ---- */
    __test('findTransferPlans 串联两段查询并匹配', function () {
        const mockApi = {
            queryStationAllPages: function (station) {
                if (station === '北京') {
                    return Promise.resolve({
                        station: '北京', currentPage: 1, totalPages: 1, totalTrains: 1, pageSize: 10,
                        trainList: [makeTrain('G1', '北京', '郑州', '2026-07-04 08:00:00', '2026-07-04 10:00:00')]
                    });
                }
                if (station === '郑州') {
                    return Promise.resolve({
                        station: '郑州', currentPage: 1, totalPages: 1, totalTrains: 1, pageSize: 10,
                        trainList: [makeTrain('G2', '郑州', '武汉', '2026-07-04 12:00:00', '2026-07-04 14:00:00')]
                    });
                }
                return Promise.resolve({ trainList: [] });
            }
        };

        return Transfer.findTransferPlans(mockApi, '北京', '郑州', '武汉', 1).then(function (result) {
            equal(result.plans.length, 1, '应匹配出 1 个中转方案');
            equal(result.firstLegCount, 1);
            equal(result.secondLegCount, 1);
            equal(result.plans[0].firstLeg.trainNumber, 'G1');
            equal(result.plans[0].secondLeg.trainNumber, 'G2');
        });
    });

    __test('findTransferPlans 两段均无直达时返回空方案', function () {
        const mockApi = {
            queryStationAllPages: function () {
                return Promise.resolve({ trainList: [makeTrain('G1', '北京', '沈阳', '08:00:00')] });
            }
        };
        return Transfer.findTransferPlans(mockApi, '北京', '郑州', '武汉', 1).then(function (result) {
            equal(result.plans.length, 0);
        });
    });
})();
