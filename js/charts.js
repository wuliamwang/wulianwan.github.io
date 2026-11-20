/* ==========================================================================
   charts.js —— 图表工厂
   ---------------------------------------------------------------------------
   统一封装 Highcharts：主题色取自 CSS 变量，因此深浅色切换后重建图表即可
   自动适配；同时提供轻量 SVG 迷你折线（KPI 卡内的 sparkline）。
   ========================================================================== */
window.AgriCharts = (function () {
    "use strict";

    var registry = [];
    var hasHighcharts = typeof window.Highcharts !== "undefined";

    /* 读取当前主题下的设计令牌，供图表配色使用 */
    function tokens() {
        var style = getComputedStyle(document.documentElement);
        function read(name, fallback) {
            var value = style.getPropertyValue(name);
            return value && value.trim() ? value.trim() : fallback;
        }
        return {
            brand: read("--brand", "#14835a"),
            mint: read("--mint", "#2ecf8f"),
            water: read("--water", "#2b8fd0"),
            gold: read("--gold", "#dd9a2b"),
            soil: read("--soil", "#a9743f"),
            danger: read("--danger", "#d8483f"),
            warn: read("--warn", "#cf7a1c"),
            info: read("--info", "#3a76c9"),
            ink: read("--ink", "#0d2a1e"),
            ink2: read("--ink-2", "#34513f"),
            muted: read("--muted", "#6c8779"),
            muted2: read("--muted-2", "#93a89c"),
            line: read("--line", "#e3ece7"),
            lineSoft: read("--line-soft", "#eff5f1"),
            surface: read("--surface", "#ffffff"),
            surface2: read("--surface-2", "#f7faf8"),
            font: read("--font-sans", "sans-serif")
        };
    }

    /* 统一的动效时长：尊重"减少动效"偏好 */
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var animDuration = reduceMotion ? 0 : 900;

    /** 图表公共配置 */
    function base() {
        var c = tokens();
        return {
            chart: {
                backgroundColor: "transparent",
                style: { fontFamily: c.font },
                spacing: [14, 6, 6, 6],
                animation: { duration: animDuration },
                plotBorderWidth: 0
            },
            colors: [c.brand, c.water, c.gold, c.soil, "#7c8ff0", "#e07a8a"],
            title: { text: null },
            subtitle: { text: null },
            credits: { enabled: false },
            legend: {
                align: "left",
                verticalAlign: "top",
                y: -2,
                symbolRadius: 3,
                symbolWidth: 8,
                symbolHeight: 8,
                itemDistance: 16,
                itemStyle: { color: c.muted, fontWeight: "500", fontSize: "11px" },
                itemHoverStyle: { color: c.ink }
            },
            tooltip: {
                backgroundColor: "rgba(7, 32, 23, 0.95)",
                borderWidth: 0,
                borderRadius: 10,
                padding: 10,
                shadow: false,
                style: { color: "#ffffff", fontSize: "11.5px", textOutline: "none" },
                useHTML: false
            },
            xAxis: {
                lineColor: c.line,
                tickColor: "transparent",
                tickLength: 0,
                gridLineWidth: 0,
                labels: { style: { color: c.muted, fontSize: "10.5px" }, y: 20 }
            },
            yAxis: {
                title: { text: null },
                gridLineColor: c.lineSoft,
                gridLineDashStyle: "Dash",
                gridLineWidth: 1,
                labels: { style: { color: c.muted, fontSize: "10.5px" }, x: -4 },
                minPadding: 0.06,
                maxPadding: 0.12
            },
            plotOptions: {
                series: {
                    animation: { duration: animDuration },
                    states: { hover: { lineWidthPlus: 0 } },
                    marker: { enabled: false, radius: 3.4, states: { hover: { enabled: true, radius: 4 } } },
                    linecap: "round"
                },
                line: { lineWidth: 2.2 },
                spline: { lineWidth: 2.4 },
                area: {
                    lineWidth: 2.2,
                    fillOpacity: 0.16,
                    threshold: null,
                    marker: { enabled: false }
                },
                column: { borderRadius: 4, borderWidth: 0, maxPointWidth: 26 },
                pie: { borderWidth: 0, dataLabels: { enabled: false } }
            },
            lang: { noData: "暂无数据", thousandsSep: "," },
            accessibility: { enabled: false }
        };
    }

    /** Highcharts 配置合并（递归覆盖数组时直接替换） */
    function merge(target, source) {
        if (hasHighcharts && window.Highcharts && window.Highcharts.merge) {
            return window.Highcharts.merge(target, source);
        }
        var output = {};
        Object.keys(target).forEach(function (key) { output[key] = target[key]; });
        Object.keys(source || {}).forEach(function (key) {
            var value = source[key];
            var isPlain = value && typeof value === "object" && !Array.isArray(value);
            if (isPlain && output[key] && typeof output[key] === "object" && !Array.isArray(output[key])) {
                output[key] = merge(output[key], value);
            } else {
                output[key] = value;
            }
        });
        return output;
    }

    /**
     * 创建并登记图表。
     * @param {string|Element} target 容器 id 或元素
     * @param {Function} factory 返回 Highcharts 配置的函数（主题切换时会重新调用）
     */
    function create(target, factory) {
        var element = typeof target === "string" ? document.getElementById(target) : target;
        if (!element) {
            console.warn("[AgriCharts] 容器不存在：", target);
            return null;
        }
        if (!hasHighcharts) {
            element.innerHTML = '<div class="empty"><div class="empty__title">图表库未加载</div><div class="empty__text">请确认 js/highcharts.js 存在</div></div>';
            return null;
        }
        var chart = window.Highcharts.chart(element, factory());
        registry.push({ element: element, id: element.id, factory: factory, chart: chart });
        return chart;
    }

    /** 按容器 id 取图表实例（重新渲染后仍然有效） */
    function get(id) {
        for (var i = 0; i < registry.length; i++) {
            if (registry[i].id === id) return registry[i].chart;
        }
        return null;
    }

    /** 销毁指定容器上的旧图表并重建（切换指标 / 时间范围时使用） */
    function replace(target, factory) {
        var id = typeof target === "string" ? target : target.id;
        for (var i = registry.length - 1; i >= 0; i--) {
            if (registry[i].id === id) {
                try { registry[i].chart.destroy(); } catch (error) {}
                registry.splice(i, 1);
            }
        }
        return create(target, factory);
    }

    /** 主题切换后重建全部图表，让坐标轴、网格线与文字颜色跟随主题 */
    function rebuild() {
        registry.forEach(function (item) {
            if (!item.element || !document.body.contains(item.element)) return;
            if (item.chart) {
                try { item.chart.destroy(); } catch (error) {}
            }
            try {
                item.chart = window.Highcharts.chart(item.element, item.factory());
            } catch (error) {
                console.warn("[AgriCharts] 重建失败：", item.id, error);
            }
        });
    }

    function resizeAll() {
        registry.forEach(function (item) {
            if (item.chart) {
                try { item.chart.reflow(); } catch (error) {}
            }
        });
    }

    /* ----------------------------------------------------------------------
       常用图表快捷方法
       ---------------------------------------------------------------------- */

    /** 面积图（可多序列） */
    function area(target, config) {
        var c = tokens();
        return create(target, function () {
            var series = config.series.map(function (item, index) {
                var color = item.color || (index === 0 ? c.brand : c.water);
                return {
                    name: item.name,
                    data: item.data,
                    color: color,
                    fillColor: {
                        linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
                        stops: [
                            [0, hexToRgba(color, 0.28)],
                            [1, hexToRgba(color, 0.01)]
                        ]
                    },
                    type: item.type || "area"
                };
            });
            return merge(base(), {
                chart: { type: "area", height: config.height || 250 },
                legend: { enabled: config.legend !== false },
                xAxis: { categories: config.categories, tickInterval: config.tickInterval || 4 },
                yAxis: {
                    labels: { format: "{value}" + (config.unit || "") },
                    min: config.min,
                    max: config.max
                },
                tooltip: { valueSuffix: " " + (config.unit || ""), shared: true },
                plotOptions: { area: { marker: { enabled: false } } },
                series: series
            });
        });
    }

    /** 柱状图 */
    function column(target, config) {
        var c = tokens();
        return create(target, function () {
            return merge(base(), {
                chart: { type: "column", height: config.height || 250 },
                legend: { enabled: Boolean(config.legend) },
                xAxis: { categories: config.categories },
                yAxis: {
                    labels: { format: "{value}" + (config.unit || "") },
                    max: config.max
                },
                tooltip: { valueSuffix: " " + (config.unit || ""), shared: true },
                plotOptions: {
                    column: {
                        borderRadius: 5,
                        colorByPoint: Boolean(config.colorByPoint),
                        colors: config.colors
                    }
                },
                series: config.series.map(function (item, index) {
                    return {
                        name: item.name,
                        data: item.data,
                        color: item.color || (index === 0 ? c.brand : c.water),
                        yAxis: item.yAxis || 0
                    };
                })
            });
        });
    }

    /** 柱 + 折线组合图 */
    function combo(target, config) {
        var c = tokens();
        return create(target, function () {
            var series = config.series.map(function (item, index) {
                var isLine = item.type === "spline" || item.type === "line";
                return {
                    name: item.name,
                    type: isLine ? "spline" : "column",
                    data: item.data,
                    color: item.color || (isLine ? c.gold : c.water),
                    yAxis: item.yAxis || 0,
                    zIndex: isLine ? 3 : 1,
                    marker: { enabled: isLine, radius: 3 },
                    lineWidth: isLine ? 2.4 : 0,
                    borderRadius: isLine ? 0 : 5,
                    dashStyle: item.dash ? "ShortDash" : undefined
                };
            });
            return merge(base(), {
                chart: { height: config.height || 280 },
                xAxis: { categories: config.categories, crosshair: { width: 1, color: c.line } },
                yAxis: [
                    { title: { text: null }, labels: { format: "{value}" + (config.unit || "") } },
                    {
                        title: { text: null },
                        opposite: true,
                        gridLineWidth: 0,
                        labels: { format: "{value}" + (config.unit2 || "") }
                    }
                ],
                tooltip: { shared: true, valueSuffix: "" },
                series: series
            });
        });
    }

    /** 环形图 */
    function donut(target, config) {
        var c = tokens();
        return create(target, function () {
            return merge(base(), {
                chart: { type: "pie", height: config.height || 260 },
                legend: { enabled: config.legend !== false, align: "center", verticalAlign: "bottom", y: 0 },
                tooltip: { pointFormat: "<b>{point.y} " + (config.unit || "") + "</b>（{point.percentage:.1f}%）" },
                plotOptions: {
                    pie: {
                        innerSize: config.innerSize || "62%",
                        size: config.size || "72%",
                        allowPointSelect: true,
                        cursor: "pointer",
                        borderWidth: 3,
                        borderColor: c.surface,
                        dataLabels: { enabled: false },
                        showInLegend: true,
                        animation: { duration: animDuration }
                    }
                },
                series: [{
                    name: config.name || "占比",
                    colorByPoint: true,
                    colors: config.colors || [c.brand, c.water, c.gold, c.soil, c.mint],
                    data: config.data
                }]
            });
        });
    }

    /** 横向条形图 */
    function bar(target, config) {
        var c = tokens();
        return create(target, function () {
            return merge(base(), {
                chart: { type: "bar", height: config.height || 220 },
                legend: { enabled: false },
                xAxis: {
                    categories: config.categories,
                    lineWidth: 0,
                    labels: { style: { color: c.muted, fontSize: "10.5px" } }
                },
                yAxis: {
                    title: { text: null },
                    gridLineWidth: 0,
                    labels: { enabled: false }
                },
                tooltip: { valueSuffix: " " + (config.unit || "") },
                plotOptions: { bar: { borderRadius: 4, maxPointWidth: 16, colorByPoint: true, colors: config.colors } },
                series: [{ name: config.name || "", data: config.data }]
            });
        });
    }

    /* ----------------------------------------------------------------------
       颜色工具
       ---------------------------------------------------------------------- */
    function hexToRgba(hex, alpha) {
        if (!hex) return "rgba(20,131,90," + alpha + ")";
        var value = hex.trim();
        if (value.indexOf("rgb") === 0) {
            return value.replace("rgb(", "rgba(").replace(")", ", " + alpha + ")");
        }
        if (value.charAt(0) === "#") {
            var hexValue = value.slice(1);
            if (hexValue.length === 3) {
                hexValue = hexValue[0] + hexValue[0] + hexValue[1] + hexValue[1] + hexValue[2] + hexValue[2];
            }
            var num = parseInt(hexValue, 16);
            return "rgba(" + ((num >> 16) & 255) + "," + ((num >> 8) & 255) + "," + (num & 255) + "," + alpha + ")";
        }
        return value;
    }

    var sparkSeq = 0;

    /**
     * 迷你折线（纯 SVG，不依赖图表库，适合 KPI 卡高频刷新）
     * @param {Element|string} target 容器
     * @param {number[]} data 数据
     * @param {Object} options { color, height, filled, animate }
     */
    function sparkline(target, data, options) {
        var element = typeof target === "string" ? document.getElementById(target) : target;
        if (!element || !data || data.length < 2) return;

        var opts = options || {};
        var color = opts.color || tokens().brand;
        var width = 100;
        var height = opts.height || 34;
        var pad = 3;
        var min = Math.min.apply(null, data);
        var max = Math.max.apply(null, data);
        var span = max - min || 1;

        var points = data.map(function (value, index) {
            return {
                x: (index / (data.length - 1)) * width,
                y: height - pad - ((value - min) / span) * (height - pad * 2)
            };
        });

        /* 用二次贝塞尔把折线平滑成曲线 */
        var path = "M " + points[0].x.toFixed(2) + "," + points[0].y.toFixed(2);
        for (var i = 1; i < points.length; i++) {
            var prev = points[i - 1];
            var curr = points[i];
            var midX = (prev.x + curr.x) / 2;
            var midY = (prev.y + curr.y) / 2;
            path += " Q " + prev.x.toFixed(2) + "," + prev.y.toFixed(2) + " " + midX.toFixed(2) + "," + midY.toFixed(2);
        }
        var last = points[points.length - 1];
        path += " L " + last.x.toFixed(2) + "," + last.y.toFixed(2);

        var gradientId = "sparkGrad" + (++sparkSeq);
        var areaPath = path + " L " + width + "," + height + " L 0," + height + " Z";
        var fill = opts.filled === false ? "" :
            '<defs><linearGradient id="' + gradientId + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.26"/>' +
            '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
            '<path class="spark-area" d="' + areaPath + '" fill="url(#' + gradientId + ')"/>';

        element.innerHTML =
            '<svg viewBox="0 0 ' + width + " " + height + '" preserveAspectRatio="none" aria-hidden="true">' +
            fill +
            '<path class="spark-line" d="' + path + '" stroke="' + color + '"/>' +
            '<circle class="spark-dot" cx="' + last.x.toFixed(2) + '" cy="' + last.y.toFixed(2) + '" fill="' + color + '"/>' +
            "</svg>";
    }

    return {
        tokens: tokens,
        base: base,
        merge: merge,
        create: create,
        get: get,
        replace: replace,
        rebuild: rebuild,
        resizeAll: resizeAll,
        area: area,
        column: column,
        combo: combo,
        donut: donut,
        bar: bar,
        sparkline: sparkline,
        hexToRgba: hexToRgba,
        get registry() { return registry; }
    };
})();
