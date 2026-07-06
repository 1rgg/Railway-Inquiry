/* =========================================================================
 * api.test.js - API 客户端单元测试
 * 覆盖：响应规范化、字段兼容、车次字段映射、空数据处理
 * 网络请求部分通过 mock fetch 测试重试逻辑
 * ========================================================================= */
(function () {
    'use strict';
    const { Api } = window;
    const { equal, truthy, deepEqual } = window.assert;

    /* ---- normalizeResponse：接口字段规范化 ---- */
    __test('normalizeResponse 正确映射中文键名', function () {
        const raw = {
            '车站': '长春',
            '当前页码': 1,
            '总页数': 12,
            '总车次': 114,
            '每页条数': 10,
            '当前页车次列表': [
                {
                    '车次号': 'C1011',
                    '出发地': '长春',
                    '目的地': '延吉西',
                    '出发时间': '2026-07-04 08:57:00',
                    '候车室/检票口': '高架层候车厅/16A检票口',
                    '状态': '停止检票'
                }
            ]
        };
        const data = Api.normalizeResponse(raw);
        equal(data.station, '长春');
        equal(data.currentPage, 1);
        equal(data.totalPages, 12);
        equal(data.totalTrains, 114);
        equal(data.pageSize, 10);
        equal(data.trainList.length, 1);
        equal(data.trainList[0].trainNumber, 'C1011');
        equal(data.trainList[0].departure, '长春');
        equal(data.trainList[0].destination, '延吉西');
        equal(data.trainList[0].gate, '高架层候车厅/16A检票口');
        equal(data.trainList[0].status, '停止检票');
    });

    __test('normalizeResponse 兼容英文字段名', function () {
        const raw = {
            station: '北京',
            currentPage: 2,
            totalPages: 5,
            totalTrains: 50,
            pageSize: 10,
            trainList: [
                { trainNumber: 'G1', departure: '北京', destination: '上海', departureTime: '08:00:00', gate: 'A1', status: '正点' }
            ]
        };
        const data = Api.normalizeResponse(raw);
        equal(data.station, '北京');
        equal(data.currentPage, 2);
        equal(data.trainList[0].trainNumber, 'G1');
    });

    __test('normalizeResponse 车次列表缺失时返回空数组', function () {
        const data = Api.normalizeResponse({ station: '长春' });
        equal(data.station, '长春');
        equal(data.currentPage, 1, '缺省页码为 1');
        equal(data.totalPages, 1, '缺省总页数为 1');
        equal(data.totalTrains, 0);
        equal(Array.isArray(data.trainList), true);
        equal(data.trainList.length, 0);
    });

    __test('normalizeResponse 候车室为 -- 时原样保留（展示层负责转换）', function () {
        const raw = {
            '当前页车次列表': [
                { '车次号': 'K490', '候车室/检票口': '--', '状态': '正点' }
            ]
        };
        const data = Api.normalizeResponse(raw);
        equal(data.trainList[0].gate, '--');
    });

    /* ---- normalizeTrain：单条车次规范化 ---- */
    __test('normalizeTrain 缺失字段使用缺省值', function () {
        const train = Api.normalizeTrain({ '车次号': 'G1' });
        equal(train.trainNumber, 'G1');
        equal(train.departure, '');
        equal(train.destination, '');
        equal(train.gate, '--', '检票口缺省为 --');
        equal(train.status, '正点', '状态缺省为 正点');
    });

    __test('normalizeTrain 非数字页码容错', function () {
        const data = Api.normalizeResponse({
            '当前页码': 'abc',
            '总页数': null,
            '总车次': undefined
        });
        equal(data.currentPage, 1, '非法页码回退为 1');
        equal(data.totalPages, 1);
        equal(data.totalTrains, 0);
    });

    /* ---- queryStation：缓存命中优先（mock fetch 验证不发起请求） ---- */
    __test('queryStation 命中缓存时不调用 fetch', function () {
        const originalFetch = window.fetch;
        let called = 0;
        window.fetch = function () { called++; return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); };

        // 预置缓存
        window.Cache.clear();
        window.Cache.set('测试站', 1, { station: '测试站', currentPage: 1, totalPages: 1, totalTrains: 1, pageSize: 10, trainList: [] });

        return Api.queryStation('测试站', 1).then(function (data) {
            equal(called, 0, '命中缓存时不应调用 fetch');
            equal(data.station, '测试站');
            window.fetch = originalFetch;
            window.Cache.clear();
        });
    });

    __test('queryStation 失败重试 1 次后抛出', function () {
        const originalFetch = window.fetch;
        let attempts = 0;
        window.fetch = function () {
            attempts++;
            return Promise.reject(new Error('network error'));
        };
        window.Cache.clear();

        return Api.queryStation('重试站', 1).then(
            function () { throw new Error('应抛出错误'); },
            function (err) {
                equal(attempts, 2, '应重试 1 次（共 2 次尝试）');
                window.fetch = originalFetch;
            }
        );
    });

    __test('queryStation 首次成功则不重试', function () {
        const originalFetch = window.fetch;
        let attempts = 0;
        window.fetch = function () {
            attempts++;
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ '车站': '成功站' }) });
        };
        window.Cache.clear();

        return Api.queryStation('成功站', 1).then(function (data) {
            equal(attempts, 1, '成功时仅调用 1 次');
            equal(data.station, '成功站');
            window.fetch = originalFetch;
            window.Cache.clear();
        });
    });
})();
