/* =========================================================================
 * app.js - 主控制器
 * 职责：
 *   1. 绑定选项卡 / 查询按钮 / 分页 / 历史记录等交互
 *   2. 调度 API 与中转匹配，并驱动 UI 渲染
 *   3. 输入校验、加载状态、防抖、错误处理
 *   4. 维护当前查询上下文（模式、参数、页码）以支持分页切换
 * ========================================================================= */
(function (global) {
    'use strict';

    const { CONFIG, Utils, Cache, Api, Transfer, UI } = global;
    const HISTORY_KEY = 'rt_history';

    // 当前查询上下文
    const state = {
        mode: 'single',        // single | direct | transfer
        params: {},             // 当前查询参数
        page: 1,                // 当前页码
        loading: false          // 是否加载中（防重复提交）
    };

    // 防抖后的查询函数（300ms），避免连续触发产生无效请求
    const debouncedQuery = Utils.debounce(() => runQuery(), CONFIG.DEBOUNCE_DELAY);

    /* -------------------- DOM 引用 -------------------- */
    const els = {
        tabs: document.querySelectorAll('.tab'),
        forms: document.querySelectorAll('.form-row'),
        quickCities: document.getElementById('quickCities'),
        historySection: document.getElementById('historySection'),
        historyList: document.getElementById('historyList'),
        clearHistory: document.getElementById('clearHistory'),
        toast: document.getElementById('toast'),
        placeholder: document.getElementById('placeholder'),
        loader: document.getElementById('loader'),
        errorBox: document.getElementById('errorBox'),
        resultContent: document.getElementById('resultContent'),
        pagination: document.getElementById('pagination'),
        totalPages: document.getElementById('totalPages'),
        pageJump: document.getElementById('pageJump'),
        prevBtn: document.querySelector('.page-btn[data-page="prev"]'),
        nextBtn: document.querySelector('.page-btn[data-page="next"]')
    };

    /* -------------------- 通用视图控制 -------------------- */

    /** 轻量提示 toast（自动消失） */
    function showToast(msg) {
        els.toast.textContent = msg;
        els.toast.hidden = false;
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => { els.toast.hidden = true; }, 2500);
    }

    /** 切换加载状态：禁用按钮、显示动画 */
    function setLoading(loading) {
        state.loading = loading;
        els.loader.hidden = !loading;
        // 加载中或有内容/错误时隐藏占位提示
        if (loading) {
            els.placeholder.hidden = true;
        }
        // 防重复提交
        document.querySelectorAll('.btn-primary').forEach((b) => { b.disabled = loading; });
    }

    /** 展示错误提示 */
    function showError(msg) {
        els.resultContent.innerHTML = '';
        els.pagination.hidden = true;
        els.placeholder.hidden = true;
        els.errorBox.hidden = false;
        els.errorBox.textContent = msg;
    }

    /** 重置结果区到初始占位态 */
    function resetResult() {
        els.resultContent.innerHTML = '';
        els.errorBox.hidden = true;
        els.pagination.hidden = true;
        els.placeholder.hidden = false;
    }

    /* -------------------- 选项卡切换 -------------------- */
    function switchMode(mode) {
        state.mode = mode;
        els.tabs.forEach((tab) => {
            const active = tab.dataset.mode === mode;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', active);
        });
        els.forms.forEach((row) => {
            row.hidden = row.dataset.form !== mode;
        });
        els.quickCities.hidden = mode !== 'transfer';
        resetResult();
    }

    /* -------------------- 输入校验 -------------------- */
    function readForm(mode) {
        if (mode === 'single') {
            return { station: document.getElementById('singleStation').value.trim() };
        }
        if (mode === 'direct') {
            return {
                from: document.getElementById('departStation').value.trim(),
                to: document.getElementById('arriveStation').value.trim()
            };
        }
        return {
            from: document.getElementById('transferFrom').value.trim(),
            transfer: document.getElementById('transferCity').value.trim(),
            to: document.getElementById('transferTo').value.trim()
        };
    }

    function validate(mode, params) {
        if (mode === 'single') {
            if (!params.station) { showToast('请输入车站名称'); return false; }
        } else if (mode === 'direct') {
            if (!params.from || !params.to) { showToast('请输入出发站与到达站'); return false; }
        } else {
            if (!params.from || !params.transfer || !params.to) {
                showToast('请输入出发站、中转城市与到达站'); return false;
            }
            if (Utils.normalizeStation(params.from) === Utils.normalizeStation(params.to)) {
                showToast('出发站与到达站不能相同'); return false;
            }
        }
        return true;
    }

    /* -------------------- 历史记录管理 -------------------- */
    function loadHistory() {
        try {
            return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
        } catch (e) { return []; }
    }

    function saveHistory(mode, params) {
        let history = loadHistory();
        const key = `${mode}:${JSON.stringify(params)}`;
        history = history.filter((h) => `${h.mode}:${JSON.stringify(h.params)}` !== key);
        history.unshift({ mode, params, time: Date.now(), key });
        if (history.length > CONFIG.HISTORY_MAX) {
            history = history.slice(0, CONFIG.HISTORY_MAX);
        }
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (e) {}
        renderHistory();
    }

    function renderHistory() {
        const history = loadHistory();
        if (history.length === 0) {
            els.historySection.hidden = true;
            return;
        }
        els.historySection.hidden = false;
        const esc = Utils.escapeHtml;
        const labels = { single: '单站', direct: '直达', transfer: '中转' };
        els.historyList.innerHTML = history.map((h) => {
            let text = '';
            if (h.mode === 'single') text = h.params.station;
            else if (h.mode === 'direct') text = `${h.params.from} → ${h.params.to}`;
            else text = `${h.params.from} → ${h.params.transfer} → ${h.params.to}`;
            return `<button type="button" class="history-item" data-key="${esc(h.key)}">${esc(labels[h.mode])}：${esc(text)}</button>`;
        }).join('');
    }

    function restoreHistory(key) {
        const history = loadHistory();
        const item = history.find((h) => h.key === key);
        if (!item) return;
        // 回填表单并切换模式
        switchMode(item.mode);
        if (item.mode === 'single') {
            document.getElementById('singleStation').value = item.params.station;
        } else if (item.mode === 'direct') {
            document.getElementById('departStation').value = item.params.from;
            document.getElementById('arriveStation').value = item.params.to;
        } else {
            document.getElementById('transferFrom').value = item.params.from;
            document.getElementById('transferCity').value = item.params.transfer;
            document.getElementById('transferTo').value = item.params.to;
        }
        executeQuery(item.mode, item.params);
    }

    function clearHistory() {
        try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
        renderHistory();
    }

    /* -------------------- 分页渲染 -------------------- */
    function renderPagination(currentPage, totalPages) {
        state.page = currentPage;
        els.totalPages.textContent = totalPages;
        els.pageJump.value = currentPage;
        els.prevBtn.disabled = currentPage <= 1;
        els.nextBtn.disabled = currentPage >= totalPages;
        els.pagination.hidden = false;
    }

    /* -------------------- 查询执行 -------------------- */

    /** 直接执行查询（历史回填 / 分页跳转时跳过防抖） */
    function executeQuery(mode, params, page) {
        state.mode = mode;
        state.params = params;
        state.page = page || 1;
        runQuery();
    }

    /** 真正的查询分发：根据模式调用对应逻辑 */
    function runQuery() {
        const mode = state.mode;
        const params = state.params;
        const page = state.page;
        setLoading(true);

        let promise;
        if (mode === 'single') {
            promise = querySingle(params.station, page);
        } else if (mode === 'direct') {
            promise = queryDirect(params.from, params.to, page);
        } else {
            promise = queryTransfer(params.from, params.transfer, params.to);
        }

        promise
            .catch((err) => {
                // 网络异常 / 超时统一友好提示，保留用户输入
                const msg = isTimeoutErr(err) ? '请求超时，请稍后重试' : '网络异常，请稍后重试';
                showError(msg);
            })
            .finally(() => setLoading(false));

        // 首次查询时记录历史（非分页跳转）
        if (page === 1) {
            saveHistory(mode, params);
        }
    }

    function isTimeoutErr(err) {
        return err && (err.name === 'AbortError' || /timeout/i.test(err.message || ''));
    }

    /* ---- 单站查询 ---- */
    function querySingle(station, page) {
        return Api.queryStation(station, page).then((data) => {
            els.placeholder.hidden = true;
            els.errorBox.hidden = true;
            const html = UI.renderSummary(data) + UI.renderTrainTable(data.trainList);
            UI.renderHTML(els.resultContent, html);
            renderPagination(data.currentPage, data.totalPages);
            return data;
        });
    }

    /* ---- 直达查询 ---- */
    function queryDirect(from, to, page) {
        // 取出发站第 page 页，筛选目的地 = 到达站
        return Api.queryStation(from, page).then((data) => {
            const direct = Transfer.filterDirectTrains(data.trainList, to);
            els.placeholder.hidden = true;
            els.errorBox.hidden = true;

            let html = UI.renderDirectSummary(from, to, direct.length);
            if (direct.length === 0) {
                // 无直达时引导中转查询
                html += UI.renderNoResult('暂无直达车次，可尝试中转方案', '切换到中转查询');
                els.pagination.hidden = true;
            } else {
                html += UI.renderTrainTable(direct);
                // 直达查询复用分页（基于出发站总页数）
                renderPagination(data.currentPage, data.totalPages);
            }
            UI.renderHTML(els.resultContent, html);
            return data;
        });
    }

    /* ---- 中转查询（两段并行，不阻塞主线程：用 setTimeout 让出渲染） ---- */
    function queryTransfer(from, transferCity, to) {
        // 使用 setTimeout(0) 将计算放到任务队列尾，避免阻塞加载动画首帧
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                Transfer.findTransferPlans(Api, from, transferCity, to, 1)
                    .then((result) => {
                        els.placeholder.hidden = true;
                        els.errorBox.hidden = true;
                        els.pagination.hidden = true;
                        const html = UI.renderTransferList(result.plans);
                        UI.renderHTML(els.resultContent, html);
                        resolve(result);
                    })
                    .catch(reject);
            }, 0);
        });
    }

    /* -------------------- 事件绑定 -------------------- */
    function bindEvents() {
        // 选项卡切换
        els.tabs.forEach((tab) => {
            tab.addEventListener('click', () => switchMode(tab.dataset.mode));
        });

        // 查询按钮
        document.querySelector('[data-action="query-single"]').addEventListener('click', () => {
            state.params = readForm('single');
            state.page = 1;
            if (!validate('single', state.params)) return;
            debouncedQuery();
        });
        document.querySelector('[data-action="query-direct"]').addEventListener('click', () => {
            state.params = readForm('direct');
            state.page = 1;
            if (!validate('direct', state.params)) return;
            debouncedQuery();
        });
        document.querySelector('[data-action="query-transfer"]').addEventListener('click', () => {
            state.params = readForm('transfer');
            state.page = 1;
            if (!validate('transfer', state.params)) return;
            debouncedQuery();
        });

        // 回车触发查询
        const enterHandler = (e) => {
            if (e.key === 'Enter') {
                const form = e.target.closest('.form-row');
                if (!form) return;
                const mode = form.dataset.form;
                state.mode = mode;
                state.params = readForm(mode);
                state.page = 1;
                if (!validate(mode, state.params)) return;
                debouncedQuery();
            }
        };
        document.getElementById('singleStation').addEventListener('keydown', enterHandler);
        document.getElementById('departStation').addEventListener('keydown', enterHandler);
        document.getElementById('arriveStation').addEventListener('keydown', enterHandler);
        document.getElementById('transferFrom').addEventListener('keydown', enterHandler);
        document.getElementById('transferCity').addEventListener('keydown', enterHandler);
        document.getElementById('transferTo').addEventListener('keydown', enterHandler);

        // 热门中转城市快捷选择
        els.quickCities.addEventListener('click', (e) => {
            const chip = e.target.closest('.city-chip');
            if (!chip) return;
            document.getElementById('transferCity').value = chip.dataset.city;
        });

        // 历史记录点击复现
        els.historyList.addEventListener('click', (e) => {
            const item = e.target.closest('.history-item');
            if (item) restoreHistory(item.dataset.key);
        });
        els.clearHistory.addEventListener('click', clearHistory);

        // 分页：上一页 / 下一页
        els.prevBtn.addEventListener('click', () => {
            if (state.page > 1) executeQuery(state.mode, state.params, state.page - 1);
        });
        els.nextBtn.addEventListener('click', () => {
            executeQuery(state.mode, state.params, state.page + 1);
        });

        // 页码跳转
        els.pageJump.addEventListener('change', () => {
            const total = parseInt(els.totalPages.textContent, 10) || 1;
            let target = parseInt(els.pageJump.value, 10);
            if (isNaN(target) || target < 1) target = 1;
            if (target > total) target = total;
            els.pageJump.value = target;
            if (target !== state.page) executeQuery(state.mode, state.params, target);
        });

        // 无直达时点击「切换到中转查询」引导链接（事件委托）
        els.resultContent.addEventListener('click', (e) => {
            const link = e.target.closest('[data-action="go-transfer"]');
            if (!link) return;
            switchMode('transfer');
            // 回填出发/到达站（若当前为直达查询）
            if (state.mode === 'direct' || (state.params && state.params.from)) {
                document.getElementById('transferFrom').value = state.params.from || '';
                document.getElementById('transferTo').value = state.params.to || '';
            }
        });
    }

    /* -------------------- 初始化 -------------------- */
    function init() {
        bindEvents();
        renderHistory();
        switchMode('direct');  // 页面默认展示直达查询入口
    }

    document.addEventListener('DOMContentLoaded', init);

    // 导出（便于测试与扩展）
    global.App = { state, executeQuery, switchMode, validate, readForm };
})(window);
