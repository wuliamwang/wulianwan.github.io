/* ==========================================================================
   设备控制 · 页面逻辑
   设备网格渲染 / 分类与状态筛选 / 场景联动 / 详情弹窗与运行曲线
   ========================================================================== */
(function ($) {
    "use strict";

    var IoT = window.AgriIoT;
    var Charts = window.AgriCharts;

    var category = "all";
    var stateFilter = "all";
    var keyword = "";
    var activeScene = null;

    /* 场景 → 设备动作 */
    var SCENES = {
        seedling: {
            name: "育苗模式",
            on: ["lamp-a1", "fan-b1", "fert-1"],
            off: ["curtain-a1", "lamp-b1"],
            tip: "补光灯、环流风机与水肥一体机已启动"
        },
        sunny: {
            name: "晴天通风",
            on: ["fan-a1", "fan-b1", "curtain-a1"],
            off: ["lamp-a1", "lamp-b1"],
            tip: "顶窗与环流风机已开启，遮阳帘放下"
        },
        night: {
            name: "夜间保温",
            on: [],
            off: ["fan-a1", "lamp-a1", "lamp-b1", "curtain-a1"],
            tip: "通风窗已关闭，补光灯已停止"
        },
        rain: {
            name: "雨天防涝",
            on: [],
            off: ["pump-1", "pump-2", "valve-a1", "valve-b1", "valve-c1", "fert-1"],
            tip: "全部灌溉设备已关闭，当日计划暂停"
        }
    };

    var CATEGORY_NAME = {
        irrigation: "灌溉",
        climate: "环境调控",
        sensor: "监测",
        security: "安防"
    };

    /* ----------------------------------------------------------------------
       渲染
       ---------------------------------------------------------------------- */
    function isSpin(device) {
        return ["i-pump", "i-fan"].indexOf(device.icon) > -1;
    }

    function stateText(device) {
        if (!device.online) return "离线";
        return device.on ? "运行中" : "已停止";
    }

    function cardHTML(device) {
        var classes = ["card", "device", "card--spot"];
        if (device.on) classes.push("is-on");
        if (!device.online) classes.push("is-offline");

        var statusCls = device.online ? (device.on ? "is-on" : "") : "is-offline";

        return '<article class="' + classes.join(" ") + '" data-id="' + device.id + '" tabindex="0">' +
            '<div class="device__head">' +
            '<span class="device__icon"><svg class="icon" aria-hidden="true"><use href="#' + device.icon + '"></use></svg></span>' +
            '<div class="device__titles">' +
            '<div class="device__name">' + device.name + "</div>" +
            '<div class="device__type">' + device.type + " · " + device.field + " 区</div>" +
            "</div>" +
            '<span class="device__status ' + statusCls + '">' + stateText(device) + "</span>" +
            "</div>" +
            '<div class="device__visual"><svg class="icon' + (isSpin(device) ? " icon--spin" : "") +
            '" aria-hidden="true"><use href="#' + device.icon + '"></use></svg></div>' +
            '<div class="device__meta">' +
            "<span><svg class=\"icon\" aria-hidden=\"true\"><use href=\"#i-bolt\"></use></svg>" + device.power.toFixed(2) + " kW</span>" +
            "<span><svg class=\"icon\" aria-hidden=\"true\"><use href=\"#i-clock\"></use></svg>" + device.runtime + "</span>" +
            "<span><svg class=\"icon\" aria-hidden=\"true\"><use href=\"#i-signal\"></use></svg>信号 " + device.signal + "</span>" +
            "</div>" +
            '<div class="device__foot">' +
            '<span class="device__state">' + (device.online ? (device.on ? "点击开关可停止" : "点击开关可启动") : "设备离线，指令排队中") + "</span>" +
            '<label class="switch" title="开关设备">' +
            '<input type="checkbox" data-toggle="' + device.id + '"' + (device.on ? " checked" : "") +
            (device.online ? "" : " disabled") + ">" +
            '<span class="switch__track"></span>' +
            "</label>" +
            "</div>" +
            "</article>";
    }

    function filteredDevices() {
        return IoT.state.devices.filter(function (device) {
            if (category !== "all" && device.category !== category) return false;
            if (stateFilter === "on" && !device.on) return false;
            if (stateFilter === "off" && device.on) return false;
            if (keyword) {
                var text = (device.name + device.type + device.field).toUpperCase();
                if (text.indexOf(keyword) === -1) return false;
            }
            return true;
        });
    }

    function renderGrid() {
        var grid = document.getElementById("deviceGrid");
        var list = filteredDevices();

        if (!list.length) {
            grid.innerHTML = '<div class="card device-empty"><div class="empty">' +
                '<svg class="icon" aria-hidden="true"><use href="#i-search"></use></svg>' +
                '<div class="empty__title">没有匹配的设备</div>' +
                '<div class="empty__text">调整分类或清空搜索词再试</div></div></div>';
            return;
        }

        /* 按分类顺序排列，视觉上更整齐 */
        var order = { irrigation: 0, climate: 1, sensor: 2, security: 3 };
        list.sort(function (a, b) {
            return (order[a.category] - order[b.category]) || a.name.localeCompare(b.name, "zh");
        });

        grid.innerHTML = list.map(cardHTML).join("");
    }

    function updateHeader() {
        var devices = IoT.state.devices;
        var online = devices.filter(function (device) { return device.online; }).length;
        var chip = document.getElementById("onlineChip");
        chip.className = "pill " + (online === devices.length ? "pill--ok" : "pill--warn");
        chip.innerHTML = '<i class="pill__dot"></i>' + online + " / " + devices.length + " 在线";
    }

    /* ----------------------------------------------------------------------
       单卡状态更新（避免整表重排）
       ---------------------------------------------------------------------- */
    function refreshCard(device) {
        var card = document.querySelector('.device[data-id="' + device.id + '"]');
        if (!card) return;

        card.classList.toggle("is-on", device.on);
        card.classList.toggle("is-offline", !device.online);

        var status = card.querySelector(".device__status");
        if (status) {
            status.className = "device__status " + (device.online ? (device.on ? "is-on" : "") : "is-offline");
            status.textContent = stateText(device);
        }

        var stateLabel = card.querySelector(".device__state");
        if (stateLabel) {
            stateLabel.textContent = device.online
                ? (device.on ? "点击开关可停止" : "点击开关可启动")
                : "设备离线，指令排队中";
        }

        var input = card.querySelector("[data-toggle]");
        if (input) input.checked = device.on;
    }

    /* ----------------------------------------------------------------------
       设备详情
       ---------------------------------------------------------------------- */
    function openDetail(id) {
        var device = IoT.getDevice(id);
        if (!device) return;

        $("#deviceModal").data("device-id", id);
        $("#deviceModalTitle").text("设备详情 · " + device.name);
        $("#deviceModalName").text(device.name);
        $("#deviceModalType").text(device.type + " · " + device.field + " 区 · " + CATEGORY_NAME[device.category]);
        $("#deviceModalPower").text(device.power.toFixed(2) + " kW");
        $("#deviceModalRuntime").text(device.runtime);
        $("#deviceModalSignal").text(device.signal + " / 4");

        var statusEl = $("#deviceModalStatus");
        statusEl.removeClass("pill--ok pill--warn pill--muted");
        statusEl.addClass(device.online ? (device.on ? "pill--ok" : "pill--muted") : "pill--warn");
        statusEl.text(device.online ? (device.on ? "运行中" : "已停止") : "离线待下发");

        $("#deviceModalIcon use").attr("href", "#" + device.icon);
        $("#deviceModalSwitch").prop("checked", device.on).prop("disabled", !device.online);

        /* 近 24 小时运行时长：设备运行过的时段才有点 */
        var data = [];
        for (var i = 0; i < 24; i++) {
            var active = (i >= 6 && i <= 19) && (i % 3 !== 0);
            data.push(active ? Math.round(28 + (device.id.length * (i + 3)) % 36) : 0);
        }

        var colors = Charts.tokens();
        Charts.replace("deviceChart", function () {
            return Charts.merge(Charts.base(), {
                chart: { type: "column", height: 160, margin: [8, 8, 24, 34] },
                legend: { enabled: false },
                xAxis: {
                    categories: IoT.state.history.labels,
                    tickInterval: 6,
                    labels: { style: { color: colors.muted, fontSize: "9.5px" } }
                },
                yAxis: { labels: { format: "{value}m" }, max: 70 },
                tooltip: { valueSuffix: " 分钟" },
                plotOptions: { column: { borderRadius: 2, color: colors.brand, maxPointWidth: 9 } },
                series: [{ name: "运行时长", data: data }]
            });
        });

        $("#deviceModal").modal("show");
    }

    /* ----------------------------------------------------------------------
       场景联动
       ---------------------------------------------------------------------- */
    function applyScene(key) {
        var scene = SCENES[key];
        if (!scene) return;

        scene.on.forEach(function (id) {
            var device = IoT.getDevice(id);
            if (device && device.online) IoT.setDevice(id, true, { silent: true });
        });
        scene.off.forEach(function (id) {
            var device = IoT.getDevice(id);
            if (device && device.online) IoT.setDevice(id, false, { silent: true });
        });

        activeScene = key;
        document.querySelectorAll("#sceneGrid .scene").forEach(function (button) {
            button.classList.toggle("is-active", button.getAttribute("data-scene") === key);
        });
        document.getElementById("sceneChip").textContent = "当前：" + scene.name;

        renderGrid();
        IoT.emit("log", {
            time: new Date().toTimeString().slice(0, 5),
            text: "执行场景 <b>" + scene.name + "</b>，" + scene.tip,
            tag: "场景",
            tone: "ok"
        });
        window.AgriUI.toast("场景已执行 · " + scene.name, scene.tip, "ok", 3800);
    }

    /* ----------------------------------------------------------------------
       初始化
       ---------------------------------------------------------------------- */
    function init() {
        renderGrid();
        updateHeader();

        /* 设备网格：开关与详情 */
        var grid = document.getElementById("deviceGrid");

        grid.addEventListener("click", function (event) {
            var toggle = event.target.closest("[data-toggle]");
            if (toggle) {
                var id = toggle.getAttribute("data-toggle");
                var device = IoT.getDevice(id);
                if (!device) return;
                if (!device.online) {
                    window.AgriUI.toast("设备离线", device.name + " 当前不可控制，指令已进入队列", "warn");
                    toggle.checked = device.on;
                    return;
                }
                var next = toggle.checked;
                var result = IoT.setDevice(id, next);
                if (result) {
                    refreshCard(result);
                    updateHeader();
                    window.AgriUI.toast(
                        device.name + (next ? " 已启动" : " 已停止"),
                        next ? "指令已下发，设备回执正常" : "已关闭并记录到农事日志",
                        next ? "ok" : "info",
                        2600
                    );
                }
                return;
            }

            var card = event.target.closest(".device");
            if (card) openDetail(card.getAttribute("data-id"));
        });

        grid.addEventListener("keydown", function (event) {
            var card = event.target.closest(".device");
            if (!card) return;
            if (event.key === "Enter" && event.target === card) openDetail(card.getAttribute("data-id"));
        });

        /* 详情弹窗内的开关 */
        $("#deviceModalSwitch").on("change", function () {
            var id = $("#deviceModal").data("device-id");
            var next = this.checked;
            var result = IoT.setDevice(id, next);
            if (result) {
                refreshCard(result);
                updateHeader();
                $("#deviceModalStatus")
                    .removeClass("pill--ok pill--muted")
                    .addClass(next ? "pill--ok" : "pill--muted")
                    .text(next ? "运行中" : "已停止");
            }
        });

        $("#deviceRestart").on("click", function () {
            var id = $("#deviceModal").data("device-id");
            var device = IoT.getDevice(id);
            var icon = this.querySelector(".icon");
            icon.classList.add("spin");
            var self = this;
            window.setTimeout(function () {
                icon.classList.remove("spin");
                window.AgriUI.toast("重启指令已执行", device.name + " 已重新接入网关", "ok");
                self.blur();
            }, 1200);
        });

        /* 分类 / 状态 / 搜索 */
        document.querySelectorAll("#categoryFilter .segmented__btn").forEach(function (button) {
            button.addEventListener("click", function () {
                category = button.getAttribute("data-cat");
                document.querySelectorAll("#categoryFilter .segmented__btn").forEach(function (item) {
                    item.classList.toggle("is-active", item === button);
                });
                renderGrid();
            });
        });

        document.querySelectorAll("#stateFilter .segmented__btn").forEach(function (button) {
            button.addEventListener("click", function () {
                stateFilter = button.getAttribute("data-state");
                document.querySelectorAll("#stateFilter .segmented__btn").forEach(function (item) {
                    item.classList.toggle("is-active", item === button);
                });
                renderGrid();
            });
        });

        document.getElementById("deviceSearch").addEventListener("input", function () {
            keyword = this.value.trim().toUpperCase();
            renderGrid();
        });

        /* 场景 */
        document.querySelectorAll("#sceneGrid .scene").forEach(function (button) {
            button.addEventListener("click", function () {
                applyScene(button.getAttribute("data-scene"));
            });
        });

        /* 刷新 */
        document.addEventListener("agri:refresh", function () {
            renderGrid();
            updateHeader();
            window.AgriUI.toast("设备状态已刷新", "已重新同步 16 台设备影子", "ok");
        });
    }

    $(init);
})(jQuery);
