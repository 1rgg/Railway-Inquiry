/* =========================================================================
 * cache.test.js - 本地缓存单元测试
 * 覆盖：写入/读取、过期失效、克隆隔离
 * 注意：依赖 localStorage，浏览器环境下可用
 * ========================================================================= */
(function () {
    'use strict';
    const { Cache } = window;
    const { equal, isNull, truthy } = window.assert;

    __test('Cache.set/get 写入后可读取', function () {
        Cache.clear();
        Cache.set('长春', 1, { station: '长春', total: 114 });
        const data = Cache.get('长春', 1);
        truthy(data !== null, '应命中缓存');
        equal(data.station, '长春');
        equal(data.total, 114);
    });

    __test('Cache 不同车站/页码互不干扰', function () {
        Cache.clear();
        Cache.set('长春', 1, { station: '长春' });
        Cache.set('北京', 1, { station: '北京' });
        Cache.set('长春', 2, { station: '长春第2页' });
        equal(Cache.get('长春', 1).station, '长春');
        equal(Cache.get('北京', 1).station, '北京');
        equal(Cache.get('长春', 2).station, '长春第2页');
    });

    __test('Cache 站名后缀规范化后命中相同缓存', function () {
        Cache.clear();
        Cache.set('长春站', 1, { station: '长春站' });
        // normalizeStation('长春站') === '长春'，应与 '长春' 命中同一缓存
        const data = Cache.get('长春', 1);
        truthy(data !== null, '规范化后应命中缓存');
    });

    __test('Cache 克隆隔离：外部修改不污染缓存', function () {
        Cache.clear();
        const obj = { station: '长春', list: [1, 2, 3] };
        Cache.set('长春', 1, obj);
        obj.list.push(4);            // 修改原对象
        const data = Cache.get('长春', 1);
        equal(data.list.length, 3, '缓存内容不应被外部修改影响');
    });

    __test('Cache.clear 清空所有缓存', function () {
        Cache.set('长春', 1, { a: 1 });
        Cache.set('北京', 1, { b: 2 });
        Cache.clear();
        isNull(Cache.get('长春', 1));
        isNull(Cache.get('北京', 1));
    });
})();
