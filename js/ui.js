/* =========================================================================
 * ui.js - UI 渲染模块
 * 职责：将规范化数据渲染为 DOM（车次表格 / 中转卡片 / 统计 / 分页）
 * 安全：所有动态文本均经 Utils.escapeHtml 转义后再拼接，防 XSS
 * 性能：渲染采用一次性 innerHTML 拼接后批量插入，避免逐条 DOM 操作引发重排
 * ========================================================================= */
(function (global) {
    'use strict';

    const { Utils } = global;

    const UI = {
        /**
         * 渲染单条车次的表格行（<tr>）
         * data-label 属性供移动端卡片样式通过伪元素显示字段名
         */
        renderTrainRow(train) {
            const esc = Utils.escapeHtml;
            const num = esc(train.trainNumber);
            const from = esc(train.departure);
            const to = esc(train.destination);
            const time = Utils.formatTime(train.departureTime);
            const gate = esc(Utils.formatGate(train.gate));
            const status = esc(train.status);
            const statusCls = Utils.statusClass(train.status);

            return `<tr>
                <td data-label="车次号"><span class="train-number">${num}</span></td>
                <td data-label="始发站">${from}</td>
                <td data-label="终到站">${to}</td>
                <td data-label="出发时间">${time}</td>
                <td data-label="检票口">${gate}</td>
                <td data-label="状态"><span class="status-badge ${statusCls}">${status}</span></td>
            </tr>`;
        },

        /**
         * 渲染车次列表表格（桌面端表格 / 移动端自动转为卡片）
         */
        renderTrainTable(trains) {
            if (!trains || trains.length === 0) {
                return UI.renderNoResult('暂无符合条件的车次');
            }
            const rows = trains.map(UI.renderTrainRow).join('');
            return `<table class="train-table">
                <thead>
                    <tr>
                        <th>车次号</th>
                        <th>始发站</th>
                        <th>终到站</th>
                        <th>出发时间</th>
                        <th>检票口</th>
                        <th>状态</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;
        },

        /**
         * 渲染顶部统计栏（车站名 / 总车次 / 总页数）
         */
        renderSummary(data) {
            const esc = Utils.escapeHtml;
            const station = esc(data.station);
            return `<div class="result-summary">
                <span class="summary-text">
                    查询车站：<span class="summary-station">${station}</span>
                    · 共 <strong>${data.totalTrains}</strong> 趟车次
                    · 共 ${data.totalPages} 页
                </span>
            </div>`;
        },

        /**
         * 渲染直达查询统计栏
         */
        renderDirectSummary(fromStation, toStation, count) {
            const esc = Utils.escapeHtml;
            return `<div class="result-summary">
                <span class="summary-text">
                    <span class="summary-station">${esc(fromStation)}</span>
                    → <span class="summary-station">${esc(toStation)}</span>
                    · 直达车次 <strong>${count}</strong> 趟
                </span>
            </div>`;
        },

        /**
         * 渲染单条中转方案的分段信息
         */
        renderTransferSegment(label, train) {
            const esc = Utils.escapeHtml;
            const num = esc(train.trainNumber);
            const from = esc(train.departure);
            const to = esc(train.destination);
            const depTime = Utils.formatTime(train.departureTime);
            const arrTime = train.arrivalTime ? Utils.formatTime(train.arrivalTime) : '--';
            const gate = esc(Utils.formatGate(train.gate));
            const status = esc(train.status);
            const statusCls = Utils.statusClass(train.status);

            return `<div class="transfer-segment">
                <div class="transfer-segment-title">${esc(label)}</div>
                <table class="train-table">
                    <tbody>
                        <tr>
                            <td data-label="车次号"><span class="train-number">${num}</span></td>
                            <td data-label="出发地">${from}</td>
                            <td data-label="到达地">${to}</td>
                            <td data-label="出发">${depTime}</td>
                            <td data-label="到达">${arrTime}</td>
                            <td data-label="检票口">${gate}</td>
                            <td data-label="状态"><span class="status-badge ${statusCls}">${status}</span></td>
                        </tr>
                    </tbody>
                </table>
            </div>`;
        },

        /**
         * 渲染中转方案卡片
         */
        renderTransferCard(plan) {
            const esc = Utils.escapeHtml;
            const totalText = isNaN(plan.totalMinutes) ? '--' : Utils.formatDuration(plan.totalMinutes);
            const layoverText = Utils.formatDuration(plan.layoverMinutes);
            const transfer = esc(plan.transferStation);

            const first = UI.renderTransferSegment('第一段：出发 → 中转', plan.firstLeg);
            const second = UI.renderTransferSegment('第二段：中转 → 到达', plan.secondLeg);

            return `<div class="transfer-card">
                <div class="transfer-card-header">
                    <span>总行程耗时：<strong>${totalText}</strong></span>
                    <span>中转站：${transfer} · 停留 ${layoverText}</span>
                </div>
                ${first}
                <div class="transfer-layover">中转停留 ${layoverText}（${transfer}）</div>
                ${second}
            </div>`;
        },

        /**
         * 渲染中转方案列表
         */
        renderTransferList(plans) {
            if (!plans || plans.length === 0) {
                return UI.renderNoResult(
                    '未找到合适的中转方案，可尝试更换中转城市',
                    '切换到中转查询'
                );
            }
            return `<div class="result-summary">
                <span class="summary-text">共匹配 <strong>${plans.length}</strong> 个中转方案（按总耗时升序）</span>
            </div>` + plans.map(UI.renderTransferCard).join('');
        },

        /**
         * 渲染无结果占位
         * @param {string} text - 提示文案
         * @param {string} [linkText] - 可选的引导链接文案
         */
        renderNoResult(text, linkText) {
            const esc = Utils.escapeHtml;
            const link = linkText
                ? ` <a data-action="go-transfer">${esc(linkText)}</a>`
                : '';
            return `<div class="no-result">
                <svg class="placeholder-icon" viewBox="0 0 24 24" width="56" height="56" aria-hidden="true">
                    <path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14Z"/>
                </svg>
                <p class="no-result-text">${esc(text)}${link}</p>
            </div>`;
        },

        /**
         * 批量渲染：将 HTML 写入目标容器
         * 一次性插入，避免逐条操作触发重排
         */
        renderHTML(container, html) {
            if (!container) return;
            container.innerHTML = html;
        }
    };

    global.UI = UI;
})(window);
