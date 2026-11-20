/* ==========================================================================
   地块与作物 · 页面逻辑
   地图选地块 → 右侧档案联动；作物生长周期甘特与档案表
   ========================================================================== */
(function ($) {
    "use strict";

    var IoT = window.AgriIoT;
    var selected = "A";

    var STAGES = ["定植", "开花", "坐果", "采收"];
    var YIELD = { A: 48.6, B: 32.4, C: 26.8, D: 9.2 };

    /* ----------------------------------------------------------------------
       档案详情
       ---------------------------------------------------------------------- */
    function renderDetail() {
        var field = IoT.getField(selected);
        if (!field) return;
        var decision = IoT.computeDecision(selected);

        document.getElementById("detailName").textContent = field.name;
        document.getElementById("detailMeta").textContent =
            field.area + " 亩 · " + field.variety + " · " + field.stage;

        var health = document.getElementById("detailHealth");
        health.className = "pill " + (field.health >= 80 ? "pill--ok" : field.health >= 65 ? "pill--gold" : "pill--danger");
        health.innerHTML = '<i class="pill__dot"></i>健康度 ' + field.health;

        document.getElementById("detailStages").innerHTML = ["定植", "开花", "结果", "采收"].map(function (label, index) {
            var cls = index < field.stageIndex ? "is-done" : index === field.stageIndex ? "is-current" : "";
            return '<span class="stage ' + cls + '">' + label + "</span>";
        }).join("");

        document.getElementById("detailGrid").innerHTML =
            '<div class="farm-cell"><span>土壤含水率</span><b>' + field.soilMoisture.toFixed(1) + '<small>%</small></b></div>' +
            '<div class="farm-cell"><span>空气温度</span><b>' + field.airTemp.toFixed(1) + '<small>°C</small></b></div>' +
            '<div class="farm-cell"><span>预计产量</span><b>' + (YIELD[field.id] || 0) + '<small>吨</small></b></div>' +
            '<div class="farm-cell"><span>今日用水</span><b>' + field.waterToday.toFixed(1) + '<small>m³</small></b></div>';

        document.getElementById("detailNote").textContent = decision.need
            ? field.stage + "需保持土壤含水率 " + (field.targetMoisture - 5) + "–" + (field.targetMoisture + 5) +
              "%，当前 " + field.soilMoisture.toFixed(1) + "%，建议补灌约 " + Math.min(30, decision.volume) + " m³。"
            : field.stage + "土壤含水率 " + field.soilMoisture.toFixed(1) + "% 处于适宜区间，无需灌溉，按 10 分钟频率跟踪即可。";

        /* 地图高亮 */
        document.querySelectorAll(".field-map .patch").forEach(function (patch) {
            patch.classList.toggle("is-active", patch.getAttribute("data-field") === selected);
        });
        document.querySelectorAll("[data-field-card]").forEach(function (card) {
            card.style.borderColor = card.getAttribute("data-field-card") === selected ? "var(--brand)" : "";
        });
    }

    /* ----------------------------------------------------------------------
       作物档案表与甘特
       ---------------------------------------------------------------------- */
    function renderCrop() {
        document.getElementById("cropBody").innerHTML = IoT.state.fields.map(function (field) {
            return "<tr>" +
                '<td class="strong">' + field.code + " · " + field.crop + "</td>" +
                "<td>" + field.variety + "</td>" +
                '<td class="cell-nowrap">' + field.plantedAt + "</td>" +
                '<td class="cell-nowrap">' + field.harvestAt + "</td>" +
                '<td class="num strong">' + (YIELD[field.id] || 0) + " 吨</td>" +
                "</tr>";
        }).join("");

        /* 甘特：用定植 → 采收的时间跨度换算百分比 */
        var start = new Date("2026-08-02").getTime();
        var end = new Date("2027-06-30").getTime();
        var total = end - start;

        document.getElementById("gantt").innerHTML = IoT.state.fields.map(function (field) {
            var from = (new Date(field.plantedAt).getTime() - start) / total * 100;
            var width = Math.min(100 - from, (new Date(field.harvestAt).getTime() - new Date(field.plantedAt).getTime()) / total * 100);
            var progress = from + width * (field.stageIndex / 4);
            var today = (Date.now() - start) / total * 100;

            return '<div class="gantt__row">' +
                '<span class="gantt__name">' + field.code + " " + field.crop + "</span>" +
                '<div class="gantt__track">' +
                '<span class="gantt__bar" style="left:' + from.toFixed(2) + "%;width:" + width.toFixed(2) + '%">' +
                field.stage + "</span>" +
                '<span class="gantt__marker" style="left:' + today.toFixed(2) + '%"></span>' +
                "</div>" +
                "</div>";
        }).join("");
    }

    /* ----------------------------------------------------------------------
       初始化
       ---------------------------------------------------------------------- */
    function init() {
        renderDetail();
        renderCrop();

        document.querySelectorAll(".field-map .patch").forEach(function (patch) {
            function choose() {
                selected = patch.getAttribute("data-field");
                renderDetail();
            }
            patch.addEventListener("click", choose);
            patch.addEventListener("keydown", function (event) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    choose();
                }
            });
        });

        document.querySelectorAll("[data-field-card]").forEach(function (card) {
            card.addEventListener("click", function () {
                selected = card.getAttribute("data-field-card");
                renderDetail();
                document.getElementById("detailName").scrollIntoView({ behavior: "smooth", block: "center" });
            });
        });

        document.getElementById("exportFarm").addEventListener("click", function () {
            var rows = [["地块", "作物", "品种", "面积(亩)", "定植", "预计采收", "预计产量(吨)", "健康度"]];
            IoT.state.fields.forEach(function (field) {
                rows.push([field.code, field.crop, field.variety, field.area, field.plantedAt, field.harvestAt, YIELD[field.id] || 0, field.health]);
            });
            var csv = rows.map(function (row) {
                return row.map(function (cell) { return '"' + String(cell) + '"'; }).join(",");
            }).join("\r\n");
            var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
            var url = URL.createObjectURL(blob);
            var link = document.createElement("a");
            link.href = url;
            link.download = "地块作物档案.csv";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.setTimeout(function () { URL.revokeObjectURL(url); }, 800);
            window.AgriUI.toast("档案已导出", "共 " + IoT.state.fields.length + " 个地块", "ok");
        });

        document.getElementById("fieldConfirm").addEventListener("click", function () {
            var name = document.getElementById("newFieldName").value.trim();
            var crop = document.getElementById("newFieldCrop").value.trim();
            var area = parseFloat(document.getElementById("newFieldArea").value);

            if (!name || !crop) {
                window.AgriUI.toast("信息不完整", "请填写地块名称与作物", "warn");
                return;
            }

            var id = String.fromCharCode(69 + IoT.state.fields.length - 4);
            IoT.state.fields.push({
                id: id,
                code: id + " 区",
                name: name,
                crop: crop,
                variety: "待补充",
                stage: "苗期",
                stageIndex: 0,
                area: area || 5,
                plants: 0,
                plantedAt: new Date().toISOString().slice(0, 10),
                harvestAt: "2027-05-01",
                soilMoisture: 62,
                targetMoisture: 68,
                soilTemp: 18,
                soilEc: 1.4,
                soilPh: 6.6,
                airTemp: 22,
                airHumidity: 68,
                light: 18000,
                co2: 560,
                windSpeed: 0.8,
                leafWetness: 20,
                color: "#7cc7f0",
                health: 86,
                sensors: 0,
                waterToday: 0,
                waterPlan: 0
            });

            selected = id;
            renderDetail();
            renderCrop();
            $("#fieldModal").modal("hide");
            window.AgriUI.toast("地块已创建", name + " · " + area + " 亩 · 已继承默认阈值", "ok");
        });

        IoT.on("telemetry", function () {
            renderDetail();
        });
    }

    $(init);
})(jQuery);
