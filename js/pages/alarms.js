/* ==========================================================================
   告警中心 · 页面逻辑
   告警列表渲染 / 状态筛选 / 一键处置 / 趋势图
   ========================================================================== */
(function ($) {
    "use strict";

    var IoT = window.AgriIoT;
    var Charts = window.AgriCharts;

    var filter = "all";
    var keyword = "";

    var LEVEL = {
        danger: { text: "高危", cls: "pill--danger", icon: "i-alert" },
        warn: { text: "警告", cls: "pill--warn", icon: "i-cloud" },
        info: { text: "提示", cls: "pill--info", icon: "i-lamp" }
    };

    var ORDER = { danger: 0, warn: 1, info: 2 };

    /* ----------------------------------------------------------------------
       列表
       ---------------------------------------------------------------------- */
    function visibleAlarms() {
        return IoT.state.alarms.filter(function (alarm) {
            if (filter === "open" && alarm.status !== "open") return false;
            if (filter === "resolved" && alarm.status !== "resolved") return false;
            if (keyword) {
                var text = (alarm.title + alarm.text + alarm.field + alarm.source + alarm.rule).toUpperCase();
                if (text.indexOf(keyword) === -1) return false;
            }
            return true;
        }).sort(function (a, b) {
            if (a.status !== b.status) return a.status === "open" ? -1 : 1;
            return ORDER[a.level] - ORDER[b.level];
        });
    }

    function renderList() {
        var host = document.getElementById("alarmList");
        var list = visibleAlarms();

        if (!list.length) {
            host.innerHTML = '<div class="empty">' +
                '<svg class="icon" aria-hidden="true"><use href="#i-check-circle"></use></svg>' +
                '<div class="empty__title">没有符合条件的告警</div>' +
                '<div class="empty__text">系统当前运行平稳</div></div>';
        } else {
            host.innerHTML = list.map(function (alarm) {
                var meta = LEVEL[alarm.level] || LEVEL.info;
                var resolved = alarm.status === "resolved";
                var classes = ["alarm-item"];
                if (alarm.level === "danger") classes.push("is-danger");
                if (alarm.level === "info") classes.push("is-info");
                if (resolved) classes.push("is-resolved");

                return '<article class="' + classes.join(" ") + '" data-id="' + alarm.id + '">' +
                    '<span class="alarm-item__icon"><svg class="icon" aria-hidden="true"><use href="#' +
                    (resolved ? "i-check-circle" : meta.icon) + '"></use></svg></span>' +
                    '<div class="alarm-item__body">' +
                    '<div class="alarm-item__head">' +
                    '<span class="alarm-item__title">' + alarm.title + "</span>" +
                    '<span class="pill ' + meta.cls + '">' + meta.text + "</span>" +
                    (resolved ? '<span class="pill pill--muted">已恢复</span>' : "") +
                    "</div>" +
                    '<p class="alarm-item__text">' + alarm.text + "</p>" +
                    '<div class="alarm-item__meta">' +
                    "<span>" + alarm.time + "</span>" +
                    "<span>来源 " + alarm.source + "</span>" +
                    "<span>" + alarm.field + " 区</span>" +
                    "<span>规则：" + alarm.rule + "</span>" +
                    "</div>" +
                    "</div>" +
                    '<div class="alarm-item__actions">' +
                    (resolved ? "" : '<button type="button" class="btn-agri btn-soft btn-sm" data-resolve="' + alarm.id + '">处理</button>') +
                    '<button type="button" class="icon-link" data-detail="' + alarm.id + '" aria-label="查看详情">' +
                    '<svg class="icon" aria-hidden="true"><use href="#i-eye"></use></svg></button>' +
                    "</div>" +
                    "</article>";
            }).join("");
        }

        var open = IoT.openAlarms().length;
        document.getElementById("alarmSub").textContent = "共 " + IoT.state.alarms.length + " 条 · " + open + " 条待处理";
    }

    function updateStats() {
        var open = IoT.openAlarms().length;
        var resolved = IoT.state.alarms.filter(function (alarm) { return alarm.status === "resolved"; }).length;
        var numbers = document.querySelectorAll(".alarm-summary .alarm-stat__num span");
        if (numbers.length >= 4) {
            numbers[0].textContent = open;
            numbers[1].textContent = 0;
            numbers[2].textContent = resolved;
            numbers[3].textContent = IoT.state.alarms.length + 1;
        }

        /* 侧栏与顶栏的红点同步 */
        var dot = document.getElementById("notifyDot");
        if (dot) dot.textContent = open ? String(open) : "";
    }

    /* ----------------------------------------------------------------------
       处置
       ---------------------------------------------------------------------- */
    function resolve(id, silent) {
        var alarm = IoT.resolveAlarm(id);
        if (!alarm) return;

        renderList();
        updateStats();

        if (!silent) {
            window.AgriUI.toast("告警已处理", alarm.title + "，处置记录已归档", "ok");
        }
        if ($("#alarmModal").hasClass("in")) {
            $("#alarmModal").modal("hide");
        }
    }

    /* ----------------------------------------------------------------------
       详情
       ---------------------------------------------------------------------- */
    function openDetail(id) {
        var alarm = IoT.state.alarms.filter(function (item) { return item.id === id; })[0];
        if (!alarm) return;

        var meta = LEVEL[alarm.level] || LEVEL.info;
        $("#alarmModalTitle").text("告警详情 · " + alarm.id);
        $("#alarmModalName").text(alarm.title);
        $("#alarmModalMeta").text(alarm.field + " 区 · " + alarm.source + " · " + alarm.time);
        $("#alarmModalText").text(alarm.text);
        $("#alarmModalIcon svg use").attr("href", "#" + (alarm.status === "resolved" ? "i-check-circle" : meta.icon));
        $("#alarmModalResolve")
            .data("id", alarm.id)
            .prop("disabled", alarm.status === "resolved")
            .toggleClass("is-disabled", alarm.status === "resolved");

        var steps = [
            { time: alarm.time, title: "规则命中", text: "阈值「" + alarm.rule + "」被触发，生成告警工单。" },
            { time: alarm.time, title: "通知已推送", text: "已通过短信与 App 推送至值班人员，等待确认。" }
        ];
        if (alarm.status === "resolved") {
            steps.push({ time: "稍后", title: "处置完成", text: "值班人员确认现场情况并完成处置，告警关闭。" });
        } else {
            steps.push({ time: "待处理", title: "等待处置", text: "建议 2 小时内到现场核实，处置后点击「标记已处理」。", muted: true });
        }

        $("#alarmTimeline").html(steps.map(function (step) {
            return '<div class="timeline__item' + (step.muted ? " is-muted" : "") + '">' +
                '<div class="timeline__time">' + step.time + "</div>" +
                '<div class="timeline__title">' + step.title + "</div>" +
                '<div class="timeline__text">' + step.text + "</div>" +
                "</div>";
        }).join(""));

        $("#alarmModal").modal("show");
    }

    /* ----------------------------------------------------------------------
       趋势图
       ---------------------------------------------------------------------- */
    function buildChart() {
        var labels = ["11/14", "11/15", "11/16", "11/17", "11/18", "11/19", "今日"];
        var colors = Charts.tokens();

        Charts.replace("alarmChart", function () {
            return Charts.merge(Charts.base(), {
                chart: { type: "column", height: 170, margin: [10, 6, 24, 28] },
                legend: { enabled: false },
                xAxis: { categories: labels, labels: { style: { color: colors.muted, fontSize: "9.5px" } } },
                yAxis: {
                    allowDecimals: false,
                    labels: { style: { color: colors.muted, fontSize: "9.5px" } },
                    gridLineColor: colors.lineSoft
                },
                tooltip: { shared: true, valueSuffix: " 条" },
                plotOptions: {
                    column: { stacking: "normal", borderRadius: 3, maxPointWidth: 32, borderWidth: 0 }
                },
                series: [
                    { name: "高危", data: [1, 0, 2, 0, 1, 1, 2], color: colors.danger },
                    { name: "警告", data: [2, 3, 1, 2, 1, 2, 2], color: colors.warn },
                    { name: "提示", data: [1, 1, 2, 1, 3, 1, 2], color: colors.info }
                ]
            });
        });
    }

    /* ----------------------------------------------------------------------
       初始化
       ---------------------------------------------------------------------- */
    function init() {
        renderList();
        updateStats();
        buildChart();

        document.getElementById("alarmList").addEventListener("click", function (event) {
            var resolveBtn = event.target.closest("[data-resolve]");
            if (resolveBtn) {
                resolve(resolveBtn.getAttribute("data-resolve"));
                return;
            }
            var detailBtn = event.target.closest("[data-detail]");
            if (detailBtn) openDetail(detailBtn.getAttribute("data-detail"));
        });

        document.querySelectorAll("#alarmFilter .segmented__btn").forEach(function (button) {
            button.addEventListener("click", function () {
                filter = button.getAttribute("data-filter");
                document.querySelectorAll("#alarmFilter .segmented__btn").forEach(function (item) {
                    item.classList.toggle("is-active", item === button);
                });
                renderList();
            });
        });

        document.getElementById("alarmSearch").addEventListener("input", function () {
            keyword = this.value.trim().toUpperCase();
            renderList();
        });

        document.getElementById("markAll").addEventListener("click", function () {
            var open = IoT.openAlarms();
            if (!open.length) {
                window.AgriUI.toast("暂无待处理告警", "所有告警均已归档", "info");
                return;
            }
            open.forEach(function (alarm) { IoT.resolveAlarm(alarm.id); });
            renderList();
            updateStats();
            window.AgriUI.toast("批量处理完成", "已归档 " + open.length + " 条告警", "ok");
        });

        $("#alarmModalResolve").on("click", function () {
            var id = $(this).data("id");
            if (id) resolve(id);
        });

        document.addEventListener("agri:refresh", function () {
            renderList();
            updateStats();
            buildChart();
            window.AgriUI.toast("告警数据已刷新", "已同步最新规则命中记录", "ok");
        });
    }

    $(init);
})(jQuery);
