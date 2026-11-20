/* ==========================================================================
   环境监测 · 页面逻辑
   指标卡切换 / 多指标趋势 / 实时数据流 / 传感器台账筛选与详情
   ========================================================================== */
(function ($) {
    "use strict";

    var IoT = window.AgriIoT;
    var Charts = window.AgriCharts;

    /* ----------------------------------------------------------------------
       指标元数据
       ---------------------------------------------------------------------- */
    var METRICS = {
        soilMoisture: { label: "土壤含水率", unit: "%", digits: 1, range: [60, 75], icon: "i-water", tone: "ok" },
        soilTemp: { label: "土壤温度", unit: "°C", digits: 1, range: [15, 22], icon: "i-thermometer", tone: "gold" },
        airTemp: { label: "空气温度", unit: "°C", digits: 1, range: [22, 28], icon: "i-thermometer", tone: "gold" },
        airHumidity: { label: "空气湿度", unit: "%", digits: 0, range: [60, 80], icon: "i-droplet", tone: "water" },
        light: { label: "光照强度", unit: "lx", digits: 0, range: [15000, 32000], icon: "i-sun", tone: "gold" },
        co2: { label: "CO₂ 浓度", unit: "ppm", digits: 0, range: [400, 900], icon: "i-cloud", tone: "brand" }
    };

    var FIELD_COLOR = { A: "brand", B: "water", C: "gold", D: "soil" };

    var currentMetric = "soilMoisture";
    var currentField = "all";
    var currentRange = "24h";
    var statusFilter = "all";

    /* ----------------------------------------------------------------------
       工具
       ---------------------------------------------------------------------- */
    function fmt(value, digits) {
        return Number(value).toFixed(digits == null ? 1 : digits).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    function fields() {
        return IoT.state.fields;
    }

    function valueOf(metric, fieldId) {
        if (fieldId === "all") {
            var sum = fields().reduce(function (total, field) { return total + field[metric]; }, 0);
            return sum / fields().length;
        }
        var field = IoT.getField(fieldId);
        return field ? field[metric] : 0;
    }

    /* 指标是否处于适宜区间 */
    function toneOf(metric, value) {
        var range = METRICS[metric].range;
        if (metric === "light") return value >= range[0] ? "ok" : "warn";
        if (value < range[0]) return "low";
        if (value > range[1]) return "high";
        return "ok";
    }

    function toneText(tone) {
        return tone === "ok" ? "适宜" : tone === "low" ? "偏低" : "偏高";
    }

    function toneClass(tone) {
        return tone === "ok" ? "pill--ok" : "pill--warn";
    }

    /* ----------------------------------------------------------------------
       历史序列：以种子曲线为底，平移到当前读数
       ---------------------------------------------------------------------- */
    function synthetic(base, amplitude, noise) {
        var list = [];
        for (var i = 0; i < 24; i++) {
            var wave = Math.sin(((i - 5) / 24) * Math.PI * 2) * amplitude;
            list.push(Number((base + wave + Math.sin(i * 1.7) * noise).toFixed(2)));
        }
        return list;
    }

    function baseSeries(metric) {
        var history = IoT.state.history;
        if (metric === "soilMoisture") return history.soilA.slice();
        if (metric === "airTemp") return history.airTemp.slice();
        if (metric === "airHumidity") return history.humidity.slice();
        if (metric === "light") return history.light.slice();
        if (metric === "soilTemp") return synthetic(18.4, 1.6, 0.3);
        if (metric === "co2") return synthetic(620, 60, 18);
        return history.soilA.slice();
    }

    /** 把曲线尾部平移到当前值，形成"看起来连续"的实时序列 */
    function seriesFor(metric, fieldId, range) {
        var base = baseSeries(metric);
        var target = valueOf(metric, fieldId);
        var offset = target - base[base.length - 1];
        var series = base.map(function (value, index) {
            return value + offset * (index / (base.length - 1));
        });

        if (range === "7d") {
            var weekly = [];
            for (var i = 0; i < 7; i++) {
                var slice = series.slice(i * 3, i * 3 + 4);
                weekly.push(slice.reduce(function (a, b) { return a + b; }, 0) / slice.length);
            }
            weekly[6] = target;
            return weekly;
        }

        series[series.length - 1] = target;
        return series;
    }

    function categoriesFor(range) {
        return range === "7d" ? IoT.state.history.weekLabels : IoT.state.history.labels;
    }

    /* ----------------------------------------------------------------------
       1. 指标卡
       ---------------------------------------------------------------------- */
    function renderCards() {
        Object.keys(METRICS).forEach(function (metric) {
            var config = METRICS[metric];
            var value = valueOf(metric, currentField);
            var tone = toneOf(metric, value);

            var valueEl = document.querySelector('[data-value="' + metric + '"]');
            if (valueEl) {
                valueEl.innerHTML = fmt(value, config.digits) + "<small>" + config.unit + "</small>";
            }

            var pill = document.querySelector('[data-tone="' + metric + '"]');
            if (pill) {
                pill.className = "pill " + toneClass(tone);
                pill.innerHTML = '<i class="pill__dot"></i>' + toneText(tone);
            }

            var spark = document.querySelector('[data-spark="' + metric + '"]');
            if (spark) {
                Charts.sparkline(spark, seriesFor(metric, currentField, "24h"), {
                    color: Charts.tokens()[config.tone === "brand" ? "brand" : config.tone === "water" ? "water" : config.tone === "gold" ? "gold" : "brand"]
                });
            }
        });
    }

    /* ----------------------------------------------------------------------
       2. 趋势图
       ---------------------------------------------------------------------- */
    function buildTrend() {
        var config = METRICS[currentMetric];
        var colors = Charts.tokens();
        var color = currentMetric === "airHumidity" ? colors.water
            : currentMetric === "co2" ? colors.brand
                : currentMetric === "light" ? colors.gold
                    : currentMetric === "soilMoisture" ? colors.brand : colors.gold;

        var actual = seriesFor(currentMetric, currentField, currentRange);
        var average = seriesFor(currentMetric, "all", currentRange);

        var compareSeries;
        if (currentField === "all") {
            compareSeries = fields().map(function (field) {
                return {
                    name: field.code + " · " + field.crop,
                    data: seriesFor(currentMetric, field.id, currentRange),
                    color: colors[FIELD_COLOR[field.id]] || colors.brand,
                    lineWidth: 2.2,
                    marker: { enabled: false }
                };
            });
        } else {
            compareSeries = [{
                name: currentField + " 区",
                data: actual,
                color: color,
                zIndex: 3,
                lineWidth: 2.8
            }, {
                name: "全园平均",
                data: average,
                color: colors.muted2,
                dashStyle: "ShortDash",
                lineWidth: 1.8,
                marker: { enabled: false },
                zIndex: 2
            }];
        }

        document.getElementById("trendTitle").textContent =
            config.label + (currentRange === "7d" ? " · 近 7 天" : " · 近 24 小时");
        document.getElementById("trendSub").textContent = currentField === "all"
            ? "4 个地块的曲线叠加对比，浅色带为适宜区间"
            : IoT.getField(currentField).name + " 对比全园平均值，浅色带为适宜区间";

        Charts.replace("metricTrend", function () {
            return Charts.merge(Charts.base(), {
                chart: { type: "spline", height: 380 },
                legend: { align: "right", verticalAlign: "top", y: -4 },
                xAxis: {
                    categories: categoriesFor(currentRange),
                    tickInterval: currentRange === "7d" ? 1 : 4
                },
                yAxis: {
                    labels: {
                        format: currentMetric === "light" ? "{value}" : "{value}" + config.unit
                    },
                    plotBands: [{
                        from: config.range[0],
                        to: config.range[1],
                        color: "rgba(46, 207, 143, 0.08)",
                        label: {
                            text: "适宜区间",
                            align: "right",
                            x: -6,
                            y: 14,
                            style: { color: colors.muted2, fontSize: "10px" }
                        }
                    }]
                },
                tooltip: { shared: true, valueSuffix: " " + config.unit },
                plotOptions: {
                    spline: { lineWidth: 2.6, marker: { enabled: true, radius: 2.4, states: { hover: { enabled: true } } } }
                },
                series: compareSeries
            });
        });
    }

    /* ----------------------------------------------------------------------
       3. 实时数据流
       ---------------------------------------------------------------------- */
    function renderStream() {
        var host = document.getElementById("streamList");
        if (!host) return;

        host.innerHTML = IoT.state.stream.map(function (row) {
            return '<div class="stream__row' + (row.warn ? " is-warn" : "") + '">' +
                '<span class="stream__time">' + row.time + "</span>" +
                '<span class="stream__tag">' + row.tag + "</span>" +
                '<span class="stream__val">' + row.value + "</span>" +
                '<span class="stream__unit">' + row.unit + "</span>" +
                "</div>";
        }).join("");
    }

    /* ----------------------------------------------------------------------
       4. 传感器台账
       ---------------------------------------------------------------------- */
    function signalBars(count) {
        var bars = "";
        for (var i = 1; i <= 4; i++) {
            bars += "<i" + (i <= count ? ' class="on"' : "") + "></i>";
        }
        return '<span class="signal-bars' + (count <= 2 ? " is-weak" : "") + '">' + bars + "</span>";
    }

    function renderTable() {
        var body = document.getElementById("sensorBody");
        if (!body) return;

        var keyword = (document.getElementById("sensorSearch").value || "").trim().toUpperCase();
        var rows = IoT.state.sensors.filter(function (sensor) {
            var abnormal = sensor.status !== "normal" || sensor.battery < 45;
            if (statusFilter === "normal" && abnormal) return false;
            if (statusFilter === "abnormal" && !abnormal) return false;
            if (!keyword) return true;
            return (sensor.id + sensor.name + sensor.field + sensor.type).toUpperCase().indexOf(keyword) > -1;
        });

        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="8"><div class="empty">' +
                '<svg class="icon" aria-hidden="true"><use href="#i-search"></use></svg>' +
                '<div class="empty__title">没有匹配的传感器</div>' +
                '<div class="empty__text">换个编号或地块试试</div></div></td></tr>';
            return;
        }

        body.innerHTML = rows.map(function (sensor) {
            var config = METRICS[sensor.metric] || { digits: 1, unit: "" };
            return "<tr>" +
                '<td class="strong">' + sensor.id + "</td>" +
                "<td>" + sensor.type + "</td>" +
                '<td><span class="tag">' + sensor.field + " 区</span></td>" +
                '<td class="num strong">' + fmt(sensor.value, config.digits) + " " + config.unit + "</td>" +
                '<td class="' + (sensor.battery < 45 ? "tone-danger" : "") + '">' + sensor.battery + "%</td>" +
                "<td>" + signalBars(sensor.signal) + "</td>" +
                '<td class="cell-nowrap">' + sensor.lastSeen + "</td>" +
                '<td class="cell-actions">' +
                '<button class="icon-link" data-sensor="' + sensor.id + '" aria-label="查看 ' + sensor.id + ' 详情">' +
                '<svg class="icon" aria-hidden="true"><use href="#i-eye"></use></svg></button>' +
                "</td>" +
                "</tr>";
        }).join("");
    }

    function openSensor(id) {
        var sensor = IoT.state.sensors.filter(function (item) { return item.id === id; })[0];
        if (!sensor) return;

        var config = METRICS[sensor.metric] || { label: sensor.type, unit: "", digits: 1, range: [0, 100] };

        $("#sensorModalTitle").text("传感器详情 · " + sensor.id);
        $("#sensorModalName").text(sensor.name);
        $("#sensorModalType").text(sensor.type + " · " + sensor.field + " 区");
        $("#sensorModalValue").text(fmt(sensor.value, config.digits) + " " + config.unit);
        $("#sensorModalBattery").text(sensor.battery + "%");
        $("#sensorModalSignal").text(sensor.signal + " / 4");
        $("#sensorModal").data("sensor-id", sensor.id).modal("show");

        var colors = Charts.tokens();
        Charts.replace("sensorChart", function () {
            return Charts.merge(Charts.base(), {
                chart: { type: "area", height: 180, margin: [12, 8, 26, 34] },
                legend: { enabled: false },
                xAxis: { categories: IoT.state.history.labels, tickInterval: 6 },
                yAxis: {
                    labels: { format: "{value}" + config.unit },
                    plotBands: [{
                        from: config.range[0],
                        to: config.range[1],
                        color: "rgba(46, 207, 143, 0.10)"
                    }]
                },
                tooltip: { valueSuffix: " " + config.unit },
                series: [{
                    name: sensor.name,
                    data: seriesFor(sensor.metric, sensor.field, "24h"),
                    color: colors.brand,
                    fillColor: {
                        linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
                        stops: [[0, Charts.hexToRgba(colors.brand, 0.3)], [1, Charts.hexToRgba(colors.brand, 0.02)]]
                    }
                }]
            });
        });
    }

    /* ----------------------------------------------------------------------
       5. CSV 导出
       ---------------------------------------------------------------------- */
    function downloadCSV(filename, rows) {
        var csv = rows.map(function (row) {
            return row.map(function (cell) {
                return '"' + String(cell).replace(/"/g, '""') + '"';
            }).join(",");
        }).join("\r\n");

        var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 800);
    }

    function exportSensors() {
        var rows = [["编号", "名称", "类型", "地块", "读数", "单位", "电量%", "信号", "最近上报"]];
        IoT.state.sensors.forEach(function (sensor) {
            var config = METRICS[sensor.metric] || { digits: 1, unit: "" };
            rows.push([sensor.id, sensor.name, sensor.type, sensor.field, fmt(sensor.value, config.digits), config.unit, sensor.battery, sensor.signal, sensor.lastSeen]);
        });
        downloadCSV("传感器台账_" + new Date().toISOString().slice(0, 10) + ".csv", rows);
        window.AgriUI.toast("已导出 CSV", "共 " + IoT.state.sensors.length + " 条传感器记录", "ok");
    }

    /* ----------------------------------------------------------------------
       6. 初始化
       ---------------------------------------------------------------------- */
    function init() {
        renderCards();
        buildTrend();
        renderStream();
        renderTable();

        /* 地块切换 */
        document.querySelectorAll("#fieldSwitch .segmented__btn").forEach(function (button) {
            button.addEventListener("click", function () {
                currentField = button.getAttribute("data-field");
                document.querySelectorAll("#fieldSwitch .segmented__btn").forEach(function (item) {
                    item.classList.toggle("is-active", item === button);
                });
                renderCards();
                buildTrend();
            });
        });

        /* 指标卡 → 趋势图 */
        document.querySelectorAll("[data-metric-card]").forEach(function (card) {
            function select() {
                currentMetric = card.getAttribute("data-metric-card");
                document.querySelectorAll("[data-metric-card]").forEach(function (item) {
                    item.classList.toggle("is-active", item === card);
                });
                buildTrend();
            }
            card.addEventListener("click", select);
            card.addEventListener("keydown", function (event) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    select();
                }
            });
        });

        /* 时间范围 */
        document.querySelectorAll("#rangeSwitch .segmented__btn").forEach(function (button) {
            button.addEventListener("click", function () {
                currentRange = button.getAttribute("data-range");
                document.querySelectorAll("#rangeSwitch .segmented__btn").forEach(function (item) {
                    item.classList.toggle("is-active", item === button);
                });
                buildTrend();
            });
        });

        /* 搜索与状态筛选 */
        document.getElementById("sensorSearch").addEventListener("input", renderTable);
        document.querySelectorAll("#sensorFilter .segmented__btn").forEach(function (button) {
            button.addEventListener("click", function () {
                statusFilter = button.getAttribute("data-status");
                document.querySelectorAll("#sensorFilter .segmented__btn").forEach(function (item) {
                    item.classList.toggle("is-active", item === button);
                });
                renderTable();
            });
        });

        /* 表格行 → 弹窗 */
        document.getElementById("sensorBody").addEventListener("click", function (event) {
            var trigger = event.target.closest("[data-sensor]");
            if (trigger) openSensor(trigger.getAttribute("data-sensor"));
        });

        document.getElementById("exportSensors").addEventListener("click", exportSensors);
        document.getElementById("sensorExport").addEventListener("click", function () {
            var id = $("#sensorModal").data("sensor-id");
            var sensor = IoT.state.sensors.filter(function (item) { return item.id === id; })[0];
            if (!sensor) return;
            var rows = [["时间", "指标", "数值", "单位"],
                ...IoT.state.history.labels.map(function (label, index) {
                    var series = seriesFor(sensor.metric, sensor.field, "24h");
                    return [label, sensor.name, series[index].toFixed(1), (METRICS[sensor.metric] || {}).unit || ""];
                })];
            downloadCSV(sensor.id + "_24h.csv", rows);
            window.AgriUI.toast("已导出单点数据", sensor.id + " 近 24 小时序列", "ok");
        });

        /* 实时推送 */
        IoT.on("telemetry", function () {
            renderCards();
            renderStream();
            /* 表格每 3 次刷新一次，避免频繁重排 */
            if (Math.random() < 0.4) renderTable();
        });

        document.addEventListener("agri:refresh", function () {
            renderCards();
            buildTrend();
            renderTable();
            window.AgriUI.toast("监测数据已刷新", "已重新拉取 12 路传感器最新值", "ok");
        });

        document.addEventListener("agri:theme", function () {
            renderCards();
            renderStream();
        });
    }

    $(init);
})(jQuery);
