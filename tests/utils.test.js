/* =========================================================================
 * utils.test.js - 工具函数单元测试
 * 覆盖：防抖、HTML 转义、时间解析/格式化、站点规范化、状态分类
 * ========================================================================= */
(function () {
    'use strict';
    const { Utils } = window;
    const { equal, truthy, falsy, isNull, approx } = window.assert;

    // HTML 转义：防止 XSS 的关键防线
    __test('escapeHtml 转义特殊字符', function () {
        equal(Utils.escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
        equal(Utils.escapeHtml('"quoted"'), '&quot;quoted&quot;');
        equal(Utils.escapeHtml("a'b"), 'a&#39;b');
        equal(Utils.escapeHtml('a&b'), 'a&amp;b');
    });

    __test('escapeHtml 处理空值', function () {
        equal(Utils.escapeHtml(null), '');
        equal(Utils.escapeHtml(undefined), '');
        equal(Utils.escapeHtml(0), '0');
    });

    // 站点规范化：匹配时去除后缀以提高命中率
    __test('normalizeStation 去除常见后缀', function () {
        equal(Utils.normalizeStation('长春站'), '长春');
        equal(Utils.normalizeStation('北京北站'), '北京北');
        equal(Utils.normalizeStation('上海虹桥火车站'), '上海虹桥');
        equal(Utils.normalizeStation('广州东站'), '广州东');
        equal(Utils.normalizeStation('  长春 '), '长春');
    });

    __test('normalizeStation 空值返回空串', function () {
        equal(Utils.normalizeStation(''), '');
        equal(Utils.normalizeStation(null), '');
    });

    // 时间解析
    __test('parseTime 解析完整日期时间', function () {
        const ts = Utils.parseTime('2026-07-04 08:57:00');
        truthy(!isNaN(ts), '应解析为有效时间戳');
        const d = new Date(ts);
        equal(d.getFullYear(), 2026);
        equal(d.getMonth(), 6);     // 7 月，从 0 开始
        equal(d.getDate(), 4);
        equal(d.getHours(), 8);
        equal(d.getMinutes(), 57);
    });

    __test('parseTime 解析仅时间格式补当日', function () {
        const ts = Utils.parseTime('08:57:00');
        truthy(!isNaN(ts), '应解析为有效时间戳');
        equal(new Date(ts).getHours(), 8);
        equal(new Date(ts).getMinutes(), 57);
    });

    __test('parseTime 非法时间返回 NaN', function () {
        truthy(isNaN(Utils.parseTime('')), '空串应返回 NaN');
        truthy(isNaN(Utils.parseTime(null)), 'null 应返回 NaN');
        truthy(isNaN(Utils.parseTime('abc')), '非法字符串应返回 NaN');
    });

    // 时长计算与格式化
    __test('formatDuration 格式化分钟为可读文本', function () {
        equal(Utils.formatDuration(60), '1小时');
        equal(Utils.formatDuration(90), '1小时30分钟');
        equal(Utils.formatDuration(30), '30分钟');
        equal(Utils.formatDuration(125), '2小时5分钟');
        equal(Utils.formatDuration(0), '0分钟');
    });

    __test('formatDuration 非法值返回占位符', function () {
        equal(Utils.formatDuration(NaN), '--');
        equal(Utils.formatDuration(-5), '--');
    });

    __test('diffMinutes 计算两时间点分钟差', function () {
        const m = Utils.diffMinutes('2026-07-04 08:00:00', '2026-07-04 10:30:00');
        equal(m, 150);
    });

    // 检票口字段格式化
    __test('formatGate 字段为 -- 时展示暂无信息', function () {
        equal(Utils.formatGate('--'), '暂无信息');
        equal(Utils.formatGate('—'), '暂无信息');
        equal(Utils.formatGate(''), '暂无信息');
        equal(Utils.formatGate('高架层候车厅/16A检票口'), '高架层候车厅/16A检票口');
    });

    // 状态分类
    __test('statusClass 根据状态文本返回 CSS 类', function () {
        equal(Utils.statusClass('正点'), 'status-normal');
        equal(Utils.statusClass('晚点7分'), 'status-late');
        equal(Utils.statusClass('停止检票'), 'status-stopped');
        equal(Utils.statusClass('正在检票'), 'status-checking');
        equal(Utils.statusClass(''), 'status-normal');
    });

    // 深拷贝
    __test('clone 深拷贝对象互不影响', function () {
        const src = { a: 1, b: { c: 2 } };
        const copy = Utils.clone(src);
        copy.b.c = 99;
        equal(src.b.c, 2, '原对象不应被修改');
    });

    // 防抖（返回 Promise 以适配异步测试运行器）
    __test('debounce 延迟执行并合并多次调用', function () {
        return new Promise(function (resolve, reject) {
            let count = 0;
            const fn = Utils.debounce(function () { count++; }, 50);
            fn();
            fn();
            try {
                equal(count, 0, '防抖期内未执行');
            } catch (e) { reject(e); return; }
            setTimeout(function () {
                try {
                    equal(count, 1, '应只执行一次');
                    resolve();
                } catch (e) { reject(e); }
            }, 90);
        });
    });

    __test('debounce.cancel 取消待执行调用', function () {
        return new Promise(function (resolve, reject) {
            let count = 0;
            const fn = Utils.debounce(function () { count++; }, 50);
            fn();
            fn.cancel();
            setTimeout(function () {
                try {
                    equal(count, 0, '取消后不应执行');
                    resolve();
                } catch (e) { reject(e); }
            }, 90);
        });
    });
})();
