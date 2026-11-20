/* ==========================================================================
   数据驾驶舱 · 页面逻辑
   KPI 迷你趋势 / 地块地图交互 / 墒情趋势图表 / 实时告警与灌溉建议渲染
   ========================================================================== */
(function ($) {
    "use strict";

    var IoT = window.AgriIoT;
    var Charts = window.AgriCharts;

    var mapMetric = "soilMoisture";
    var activeField = "A";
    var currentRange = "24h";

    /* ----------------------------------------------------------------------
       工具
       ---------------------------------------------------------------------- */
    function fmt(value, digits) {
        return Number(value).toFixed(digits == null ? 1 : digits).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    function fieldOf(id) {
        return IoT.getField(id);
    }

    /* 固定种子的伪随机，保证 30 天序列每次一致 */
    function seeded(seed) {
        var state = seed;
        return function () {
            state = (state * 1664525 + 1013904223) % 4294967296;
            return state / 4294967296;
        };
    }

    /* ----------------------------------------------------------------------
       1. KPI 迷你折线
       ---------------------------------------------------------------------- */
    function drawSparks() {
        var history = IoT.state.history;
        var colors = Charts.tokens();

        /* 今日用水按小时累加，得到一条上升曲线 */
        var cumulative = [];
        history.water.reduce(function (sum, value) {
            var next = sum + value;
            cumulative.push(next);
            return next;
        }, 0);

        Charts.sparkline("sparkSoil", history.soilA, { color: colors.brand });
        Charts.sparkline("sparkTemp", history.airTemp, { color: colors.gold });
        Charts.sparkline("sparkLight", history.light, { color: colors.gold });
        Charts.sparkline("sparkWater", cumulative, { color: colors.water });
    }

    /* ----------------------------------------------------------------------
       2. 土壤含水率趋势图
       ---------------------------------------------------------------------- */
    function rangeData(range) {
        var history = IoT.state.history;

        if (range === "24h") {
            return {
                categories: history.labels,
                a: history.soilA,
                c: history.soilC,
                tick: 4
            };
        }

        if (range === "7d") {
            return {
                categories: history.weekLabels,
                a: [63.2, 64.1, 62.8, 63.6, 64.2, 62.9, fieldOf("A").soilMoisture],
                c: [46.4, 45.8, 45.1, 43.9, 42.8, 41.9, fieldOf("C").soilMoisture],
                tick: 1
            };
        }

        /* 近 30 天：用固定种子生成平滑序列，最后一天对齐实时值 */
        var random = seeded(20261120);
        var labels = [];
        var seriesA = [];
        var seriesC = [];
        var baseA = 66;
        var baseC = 50;
        for (var i = 0; i < 30; i++) {
            var day = new Date();
            day.setDate(day.getDate() - (29 - i));
            labels.push((day.getMonth() + 1) + "/" + day.getDate());
            baseA += (random() - 0.55) * 1.5;
            baseC += (random() - 0.6) * 1.6;
            seriesA.push(Number(Math.max(50, Math.min(76, baseA)).toFixed(1)));
            seriesC.push(Number(Math.max(32, Math.min(60, baseC)).toFixed(1)));
        }
        seriesA[29] = fieldOf("A").soilMoisture;
        seriesC[29] = fieldOf("C").soilMoisture;

        return { categories: labels, a: seriesA, c: seriesC, tick: 5 };
    }

    function buildTrendChart() {
        var colors = Charts.tokens();

        Charts.create("trendChart", function () {
            var data = rangeData(currentRange);
            return Charts.merge(Charts.base(), {
                chart: { type: "area", height: 320 },
                colors: [colors.brand, colors.water],
                legend: {
                    enabled: true,
                    align: "right",
                    verticalAlign: "top",
                    y: -4,
                    symbolRadius: 3
                },
                xAxis: {
                    categories: data.categories,
                    tickInterval: data.tick
                },
                yAxis: {
                    min: 30,
                    max: 80,
                    tickPositions: [30, 40, 50, 60, 70, 80],
                    startOnTick: false,
                    endOnTick: false,
                    labels: { format: "{value}%" },
                    plotBands: [{
                        from: 58,
                        to: 76,
                        color: "rgba(46, 207, 143, 0.07)",
                        label: {
                            text: "适宜区间",
                            style: { color: colors.muted2, fontSize: "10px" },
                            align: "right",
                            x: -6,
                            y: 12
                        }
                    }]
                },
                tooltip: { shared: true, valueSuffix: " %" },
                plotOptions: {
                    area: { fillOpacity: 1, lineWidth: 2.4, marker: { enabled: false } }
                },
                series: [
                    {
                        name: "A 区 · 番茄温室",
                        data: data.a,
                        color: colors.brand,
                        fillColor: {
                            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
                            stops: [[0, Charts.hexToRgba(colors.brand, 0.26)], [1, Charts.hexToRgba(colors.brand, 0.01)]]
                        }
                    },
                    {
                        name: "C 区 · 露天小麦",
                        data: data.c,
                        color: colors.water,
                        fillColor: {
                            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
                            stops: [[0, Charts.hexToRgba(colors.water, 0.22)], [1, Charts.hexToRgba(colors.water, 0.01)]]
                        }
                    }
                ]
            });
        });
    }

    /* ----------------------------------------------------------------------
       3. 地块地图
       ---------------------------------------------------------------------- */
    var MAP_METRICS = {
        soilMoisture: {
            unit: "%",
            format: function (value) { return value.toFixed(1) + "%"; },
            scale: function (value) {
                if (value >= 60) return { fill: "rgba(46,207,143,0.20)", stroke: "rgba(46,207,143,0.55)" };
                if (value >= 45) return { fill: "rgba(221,154,43,0.18)", stroke: "rgba(221,154,43,0.50)" };
                return { fill: "rgba(216,72,63,0.16)", stroke: "rgba(216,72,63,0.50)" };
            }
        },
        airTemp: {
            unit: "°C",
            format: function (value) { return value.toFixed(1) + "°C"; },
            scale: function (value) {
                if (value >= 26) return { fill: "rgba(232,169,60,0.20)", stroke: "rgba(232,169,60,0.52)" };
                if (value >= 20) return { fill: "rgba(46,207,143,0.20)", stroke: "rgba(46,207,143,0.55)" };
                return { fill: "rgba(43,143,208,0.18)", stroke: "rgba(43,143,208,0.50)" };
            }
        },
        light: {
            unit: "lx",
            format: function (value) { return (value / 1000).toFixed(1) + "k"; },
            scale: function (value) {
                if (value >= 25000) return { fill: "rgba(232,169,60,0.20)", stroke: "rgba(232,169,60,0.52)" };
                if (value >= 15000) return { fill: "rgba(46,207,143,0.20)", stroke: "rgba(46,207,143,0.55)" };
                return { fill: "rgba(43,143,208,0.18)", stroke: "rgba(43,143,208,0.50)" };
            }
        }
    };

    function paintMap() {
        var metric = MAP_METRICS[mapMetric];

        document.querySelectorAll(".field-map .patch").forEach(function (group) {
            var field = fieldOf(group.getAttribute("data-field"));
            if (!field) return;
            var value = field[mapMetric];
            var color = metric.scale(value);
            var shape = group.querySelector(".patch__shape");
            var label = group.querySelector("[data-value]");
            if (shape) {
                shape.setAttribute("fill", color.fill);
                shape.setAttribute("stroke", color.stroke);
            }
            if (label) {
                label.textContent = field.code.charAt(0) + " " + metric.format(value);
            }
            group.classList.toggle("is-active", field.id === activeField);
        });
    }

    function updateDetail(fieldId) {
        var field = fieldOf(fieldId);
        if (!field) return;
        var detail = document.getElementById("mapDetail");
        if (!detail) return;

        var decision = IoT.computeDecision(field.id);

        document.getElementById("mapName").textContent = field.name;
        document.getElementById("mapSub").textContent =
            field.area + " 亩 · " + field.stage + " · " + field.sensors + " 路传感器";
        document.getElementById("mapSwatch").style.background = field.color;
        document.getElementById("mapSoil").innerHTML =
            field.soilMoisture.toFixed(1) + "<small>%</small>";
        document.getElementById("mapAir").innerHTML =
            field.airTemp.toFixed(1) + "<small>°C</small>";
        document.getElementById("mapLight").innerHTML =
            fmt(field.light, 0) + "<small>lx</small>";
        document.getElementById("mapAdvice").innerHTML = decision.need
            ? decision.volume + "<small>m³</small>"
            : "0<small>m³</small>";
    }

    function bindMap() {
        document.querySelectorAll(".field-map .patch").forEach(function (group) {
            var id = group.getAttribute("data-field");

            group.addEventListener("mouseenter", function () { updateDetail(id); });
            group.addEventListener("focus", function () { updateDetail(id); });
            group.addEventListener("click", function () {
                activeField = id;
                paintMap();
                updateDetail(id);
            });
            group.addEventListener("keydown", function (event) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    activeField = id;
                    paintMap();
                    updateDetail(id);
                }
            });
        });

        document.querySelectorAll("[data-metric]").forEach(function (button) {
            button.addEventListener("click", function () {
                mapMetric = button.getAttribute("data-metric");
                document.querySelectorAll("#mapMetric .segmented__btn").forEach(function (item) {
                    item.classList.toggle("is-active", item === button);
                });
                paintMap();
            });
        });
    }

    /* ----------------------------------------------------------------------
       4. 实时告警与灌溉建议
       ---------------------------------------------------------------------- */
    function renderAlarms() {
        var host = document.getElementById("dashAlarms");
        if (!host) return;

        var levelOrder = { danger: 0, warn: 1, info: 2 };
        var list = IoT.state.alarms.slice().sort(function (a, b) {
            if (a.status !== b.status) return a.status === "open" ? -1 : 1;
            return (levelOrder[a.level] != null ? levelOrder[a.level] : 9) -
                (levelOrder[b.level] != null ? levelOrder[b.level] : 9);
        }).slice(0, 5);

        var icons = { danger: "i-alert", warn: "i-cloud", info: "i-lamp" };

        host.innerHTML = list.map(function (alarm) {
            var tone = alarm.level === "danger" ? " is-danger" : alarm.level === "info" ? " is-info" : "";
            if (alarm.status === "resolved") tone = " is-ok";
            return '' +
                '<div class="feed__item">' +
                '<span class="feed__icon' + tone + '"><svg class="icon" aria-hidden="true"><use href="#' +
                (alarm.status === "resolved" ? "i-check-circle" : icons[alarm.level] || "i-alert") + '"></use></svg></span>' +
                '<div class="feed__body">' +
                '<div class="feed__title">' + alarm.title + '</div>' +
                '<p class="feed__text">' + alarm.text + '</p>' +
                "</div>" +
                '<span class="feed__time">' + alarm.time + "</span>" +
                "</div>";
        }).join("");
    }

    function renderAdvice() {
        var host = document.getElementById("dashAdvice");
        if (!host) return;

        var decisions = IoT.state.fields.map(function (field) {
            return IoT.computeDecision(field.id);
        }).sort(function (a, b) { return b.deficit - a.deficit; }).slice(0, 3);

        host.innerHTML = decisions.map(function (item) {
            var icon = item.need ? "i-droplet" : "i-check-circle";
            var text = item.need
                ? "含水率 " + item.deficit.toFixed(1) + "% 缺口 · 建议 " + item.duration + " 分钟"
                : "含水率已高于目标值 · 无需灌溉";
            return '' +
                '<div class="advice">' +
                '<span class="advice__icon"><svg class="icon" aria-hidden="true"><use href="#' + icon + '"></use></svg></span>' +
                '<div class="advice__body">' +
                '<div class="advice__title">' + item.fieldName + "</div>" +
                '<p class="advice__text">' + text + "</p>" +
                "</div>" +
                '<div class="advice__value">' + (item.need ? item.volume : 0) + "<small>m³</small></div>" +
                "</div>";
        }).join("");
    }

    /* ----------------------------------------------------------------------
       5. 实时刷新：环、地图、KPI
       ---------------------------------------------------------------------- */
    var CATEGORY_LABEL = {
        irrigation: "灌溉设备",
        climate: "环境调控",
        sensor: "监测传感器",
        security: "安防设备"
    };

    function renderOnlineGrid() {
        var host = document.getElementById("onlineGrid");
        if (!host) return;

        var devices = IoT.state.devices;
        var order = ["irrigation", "climate", "sensor", "security"];

        host.innerHTML = order.map(function (category) {
            var list = devices.filter(function (device) { return device.category === category; });
            var online = list.filter(function (device) { return device.online; }).length;
            return '<div class="online-cell"><span class="online-cell__num">' + online +
                "<small>/" + list.length + '</small></span><span class="online-cell__label">' +
                (CATEGORY_LABEL[category] || category) + "</span></div>";
        }).join("");

        var rate = document.getElementById("onlineRate");
        if (rate) {
            var onlineCount = devices.filter(function (device) { return device.online; }).length;
            rate.textContent = (onlineCount / devices.length * 100).toFixed(1) + "%";
        }
    }

    function syncHero(summary) {
        var ring = document.getElementById("healthRing");
        if (ring) {
            ring.style.setProperty("--p", summary.health);
            var valueEl = ring.querySelector(".ring__num span");
            if (valueEl) valueEl.textContent = summary.health;
        }

        var onlineEl = document.getElementById("heroOnline");
        if (onlineEl) onlineEl.textContent = summary.online;

        var latencyEl = document.getElementById("heroLatency");
        if (latencyEl) latencyEl.textContent = summary.responseMs;

        var sourceTps = document.getElementById("sourceTps");
        if (sourceTps) sourceTps.textContent = summary.tps;

        var sourceLatency = document.getElementById("sourceLatency");
        if (sourceLatency) sourceLatency.textContent = summary.responseMs;

        /* 土壤含水率 KPI 随采集漂移，用轻量动画提示"数据在跳" */
        var soilValue = document.querySelector(".dash-kpis .kpi__value span[data-count]");
        if (soilValue) {
            soilValue.textContent = summary.avgSoil.toFixed(1);
        }

        paintMap();
        updateDetail(activeField);
    }

    function bindLive() {
        IoT.on("telemetry", function () {
            syncHero(IoT.summary());
        });
        IoT.on("alarm", function () {
            renderAlarms();
        });
        IoT.on("device", function () {
            renderOnlineGrid();
        });
    }

    /* ----------------------------------------------------------------------
       6. 初始化
       ---------------------------------------------------------------------- */
    function init() {
        drawSparks();
        buildTrendChart();
        paintMap();
        updateDetail(activeField);
        bindMap();
        renderAlarms();
        renderAdvice();
        renderOnlineGrid();
        bindLive();
        syncHero(IoT.summary());

        /* 时间范围切换：重建趋势图 */
        document.querySelectorAll("#dashRange .segmented__btn").forEach(function (button) {
            button.addEventListener("click", function () {
                currentRange = button.getAttribute("data-range");
                document.querySelectorAll("#dashRange .segmented__btn").forEach(function (item) {
                    item.classList.toggle("is-active", item === button);
                });
                Charts.rebuild();
            });
        });

        /* 刷新按钮：重新取值 */
        document.addEventListener("agri:refresh", function () {
            drawSparks();
            Charts.rebuild();
            paintMap();
            updateDetail(activeField);
            renderAdvice();
        });

        /* 主题切换后迷你折线需要重绘（Highcharts 由 app.js 负责重建） */
        document.addEventListener("agri:theme", function () {
            drawSparks();
        });
    }

    $(init);
})(jQuery);
