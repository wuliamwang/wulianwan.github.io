/* ==========================================================================
   数据分析 · 页面逻辑
   用水/地温组合图、用水构成环形图、墒情热力图、地块排行与 CSV 导出
   ========================================================================== */
(function ($) {
    "use strict";

    var IoT = window.AgriIoT;
    var Charts = window.AgriCharts;

    var currentRange = "week";

    /* 不同统计范围的模拟数据 */
    var RANGES = {
        week: {
            labels: ["11/14", "11/15", "11/16", "11/17", "11/18", "11/19", "今日"],
            water: [28.4, 33.6, 41.2, 36.8, 44.6, 38.2, 42.3],
            temp: [17.2, 18.4, 16.8, 17.6, 18.2, 17.4, 18.1],
            title: "近 7 天 · 柱状为日用水量，折线为日均 10cm 地温"
        },
        month: {
            labels: ["第 1 周", "第 2 周", "第 3 周", "第 4 周"],
            water: [246.4, 268.2, 231.6, 254.8],
            temp: [18.6, 19.2, 17.8, 18.4],
            title: "近 4 周 · 按周汇总用水量与地温"
        },
        season: {
            labels: ["8 月", "9 月", "10 月", "11 月"],
            water: [862.4, 794.6, 688.2, 236.8],
            temp: [26.8, 22.4, 16.2, 12.6],
            title: "本季 · 按月汇总（8 月定植期用水最高）"
        }
    };

    var FIELD_COLORS = { A: "#2ecf8f", B: "#5ad6a8", C: "#d9c46a", D: "#ef8b78" };

    /* ----------------------------------------------------------------------
       1. 用水量 + 地温组合图
       ---------------------------------------------------------------------- */
    function buildCombo() {
        var data = RANGES[currentRange];
        var colors = Charts.tokens();
        document.getElementById("comboSub").textContent = data.title;

        Charts.replace("waterTempChart", function () {
            return Charts.merge(Charts.base(), {
                chart: { height: 320 },
                legend: { align: "right", verticalAlign: "top", y: -4 },
                xAxis: { categories: data.labels, crosshair: { width: 1, color: colors.line } },
                yAxis: [
                    {
                        title: { text: null },
                        labels: { format: "{value} m³" },
                        min: 0
                    },
                    {
                        title: { text: null },
                        opposite: true,
                        gridLineWidth: 0,
                        labels: { format: "{value}°C" },
                        min: 10,
                        max: 32
                    }
                ],
                tooltip: { shared: true },
                plotOptions: {
                    column: {
                        borderRadius: 5,
                        maxPointWidth: 34,
                        color: {
                            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
                            stops: [
                                [0, Charts.hexToRgba(colors.water, 0.95)],
                                [1, Charts.hexToRgba(colors.water, 0.55)]
                            ]
                        }
                    }
                },
                series: [
                    { name: "用水量", type: "column", data: data.water, yAxis: 0, tooltip: { valueSuffix: " m³" } },
                    {
                        name: "日均地温",
                        type: "spline",
                        data: data.temp,
                        yAxis: 1,
                        color: colors.gold,
                        lineWidth: 2.6,
                        marker: { enabled: true, radius: 3.4 },
                        tooltip: { valueSuffix: " °C" }
                    }
                ]
            });
        });
    }

    /* ----------------------------------------------------------------------
       2. 用水构成环形图
       ---------------------------------------------------------------------- */
    function waterByField() {
        return IoT.state.fields.map(function (field) {
            return {
                name: field.code + " · " + field.crop,
                y: Number((field.waterToday * 7 + field.area * 2.4).toFixed(1)),
                color: FIELD_COLORS[field.id]
            };
        });
    }

    function buildDonut() {
        var data = waterByField();
        var total = data.reduce(function (sum, item) { return sum + item.y; }, 0);

        Charts.replace("shareChart", function () {
            return Charts.merge(Charts.base(), {
                chart: { type: "pie", height: 236, margin: [0, 0, 0, 0] },
                title: {
                    text: total.toFixed(0) + " m³",
                    align: "center",
                    verticalAlign: "middle",
                    y: -4,
                    style: { fontSize: "20px", fontWeight: "700", color: Charts.tokens().ink }
                },
                subtitle: {
                    text: "近 7 天用水",
                    align: "center",
                    verticalAlign: "middle",
                    y: 16,
                    style: { fontSize: "10.5px", color: Charts.tokens().muted }
                },
                legend: { enabled: false },
                tooltip: { pointFormat: "<b>{point.y} m³</b>（{point.percentage:.1f}%）" },
                plotOptions: {
                    pie: {
                        innerSize: "66%",
                        size: "96%",
                        borderWidth: 3,
                        borderColor: Charts.tokens().surface,
                        dataLabels: { enabled: false },
                        showInLegend: false
                    }
                },
                series: [{ name: "用水量", colorByPoint: true, data: data }]
            });
        });

        document.getElementById("shareLegend").innerHTML = data.map(function (item) {
            var percent = (item.y / total * 100).toFixed(1);
            return '<span class="legend__item"><i class="legend__swatch" style="background:' + item.color + '"></i>' +
                item.name + " " + percent + "%</span>";
        }).join("");
    }

    /* ----------------------------------------------------------------------
       3. 墒情热力图
       ---------------------------------------------------------------------- */
    function buildHeatmap() {
        var rows = IoT.state.fields;
        var matrix = window.AGRI_SEED.heatmap.rows;
        var days = matrix[0].length;

        var labels = [];
        for (var d = 0; d < days; d++) {
            if (d % 2 === 0) {
                var date = new Date();
                date.setDate(date.getDate() - (days - 1 - d));
                labels.push((date.getMonth() + 1) + "/" + date.getDate());
            } else {
                labels.push("");
            }
        }

        var cells = "";
        matrix.forEach(function (series, rowIndex) {
            series.forEach(function (value, colIndex) {
                var level = value >= 70 ? 5 : value >= 65 ? 4 : value >= 60 ? 3 : value >= 55 ? 2 : value >= 50 ? 1 : 0;
                cells += '<div class="heatmap__cell lv' + level + '" title="' +
                    rows[rowIndex].code + " · " + labels[colIndex] + " · " + value.toFixed(1) + '%"></div>';
            });
        });

        document.getElementById("heatmap").innerHTML = cells;
        document.getElementById("heatmapAxis").innerHTML = labels.map(function (label) {
            return "<span>" + label + "</span>";
        }).join("");
    }

    /* ----------------------------------------------------------------------
       4. 地块用水排行
       ---------------------------------------------------------------------- */
    function buildRank() {
        var list = IoT.state.fields.map(function (field) {
            return {
                id: field.id,
                name: field.code + " · " + field.crop,
                water: field.waterToday * 7 + field.area * 2.4,
                area: field.area
            };
        }).sort(function (a, b) { return b.water - a.water; });

        var max = list[0].water;

        document.getElementById("waterRank").innerHTML = list.map(function (item, index) {
            return '<div class="rank__row">' +
                '<span class="rank__no">' + (index + 1) + "</span>" +
                '<div class="rank__cell">' +
                '<div class="rank__name">' + item.name + "</div>" +
                '<div class="rank__bar"><span style="width:' + (item.water / max * 100).toFixed(0) + '%"></span></div>' +
                "</div>" +
                '<span class="rank__value">' + item.water.toFixed(1) + "<small> m³</small></span>" +
                "</div>";
        }).join("");
    }

    /* ----------------------------------------------------------------------
       5. 明细表
       ---------------------------------------------------------------------- */
    function detailRows() {
        var labels = window.AGRI_SEED.history.weekLabels;
        var water = window.AGRI_SEED.history.weekWater;
        var jobs = ["A 区滴灌 + B 区微喷", "C 区喷灌 + A 区滴灌", "A 区滴灌", "B 区微喷", "C 区喷灌 + D 区水肥", "A 区滴灌 + D 区水肥", "A 区晨间滴灌"];

        return labels.map(function (label, index) {
            var count = 2 + (index % 3);
            var moisture = 58 + (index * 1.4) % 9;
            var saved = 22 + (index * 1.7) % 8;
            return {
                date: label,
                water: water[index],
                count: count,
                moisture: Number(moisture.toFixed(1)),
                saved: Number(saved.toFixed(1)),
                job: jobs[index] || "常规灌溉",
                status: index === 6 ? "进行中" : "已完成"
            };
        });
    }

    function buildTable() {
        var body = document.getElementById("detailBody");
        var rows = detailRows();

        body.innerHTML = rows.map(function (row) {
            var pill = row.status === "进行中" ? "pill--water" : "pill--ok";
            return "<tr>" +
                '<td class="strong">' + row.date + "</td>" +
                '<td class="num strong">' + row.water.toFixed(1) + " m³</td>" +
                '<td class="num">' + row.count + " 次</td>" +
                '<td class="num">' + row.moisture.toFixed(1) + " %</td>" +
                '<td class="num tone-green">' + row.saved.toFixed(1) + " %</td>" +
                "<td>" + row.job + "</td>" +
                '<td><span class="pill ' + pill + '">' + row.status + "</span></td>" +
                "</tr>";
        }).join("");
    }

    /* ----------------------------------------------------------------------
       6. 导出
       ---------------------------------------------------------------------- */
    function downloadCSV(filename, rows) {
        var csv = rows.map(function (row) {
            return row.map(function (cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(",");
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

    function exportTable() {
        var rows = [["日期", "用水量(m³)", "灌溉次数", "平均含水率(%)", "节水率(%)", "主要作业", "状态"]];
        detailRows().forEach(function (row) {
            rows.push([row.date, row.water.toFixed(1), row.count, row.moisture.toFixed(1), row.saved.toFixed(1), row.job, row.status]);
        });
        downloadCSV("灌溉明细_" + new Date().toISOString().slice(0, 10) + ".csv", rows);
        window.AgriUI.toast("已导出灌溉明细", "共 " + (rows.length - 1) + " 天记录", "ok");
    }

    function exportReport() {
        var rows = [["指标", "数值", "单位"],
            ["统计范围", RANGES[currentRange].labels[0] + " 至 " + RANGES[currentRange].labels[RANGES[currentRange].labels.length - 1], ""],
            ["累计灌溉用水", "246.4", "m³"],
            ["平均节水率", "28.4", "%"],
            ["单位产量耗水", "12.6", "m³/t"],
            ["灌溉次数", "42", "次"]];
        RANGES[currentRange].labels.forEach(function (label, index) {
            rows.push([label, RANGES[currentRange].water[index].toFixed(1), "m³"]);
        });
        downloadCSV("数据分析报告_" + new Date().toISOString().slice(0, 10) + ".csv", rows);
        window.AgriUI.toast("报告已导出", "包含汇总指标与逐日用水序列", "ok");
    }

    /* ----------------------------------------------------------------------
       7. 初始化
       ---------------------------------------------------------------------- */
    function init() {
        buildCombo();
        buildDonut();
        buildHeatmap();
        buildRank();
        buildTable();

        document.querySelectorAll("#rangeSwitch .segmented__btn").forEach(function (button) {
            button.addEventListener("click", function () {
                currentRange = button.getAttribute("data-range");
                document.querySelectorAll("#rangeSwitch .segmented__btn").forEach(function (item) {
                    item.classList.toggle("is-active", item === button);
                });
                buildCombo();
            });
        });

        document.getElementById("exportTable").addEventListener("click", exportTable);
        document.getElementById("exportReport").addEventListener("click", exportReport);

        document.addEventListener("agri:refresh", function () {
            buildCombo();
            buildDonut();
            buildRank();
            buildHeatmap();
            window.AgriUI.toast("分析数据已刷新", "已重新汇总最新灌溉记录", "ok");
        });

        document.addEventListener("agri:theme", function () {
            buildHeatmap();
        });
    }

    $(init);
})(jQuery);
