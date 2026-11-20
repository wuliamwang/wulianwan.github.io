/* ==========================================================================
   智能灌溉 · 页面逻辑
   决策结论 / 阈值双滑块（nstSlider）/ 计划编排 / 手动执行与进度回传
   ========================================================================== */
(function ($) {
    "use strict";

    var IoT = window.AgriIoT;

    var selected = "C";
    var running = false;

    /* ----------------------------------------------------------------------
       工具
       ---------------------------------------------------------------------- */
    function currentField() {
        return IoT.getField(selected);
    }

    function settings() {
        return IoT.state.settings;
    }

    /* 阈值触发：含水率低于下限即进入待灌溉队列 */
    function needByThreshold(field) {
        return field.soilMoisture < settings().soilLow;
    }

    function urgencyOf(field) {
        var deficit = field.targetMoisture - field.soilMoisture;
        if (deficit >= 12) return { key: "high", text: "紧迫", cls: "pill--danger" };
        if (deficit >= 4) return { key: "mid", text: "关注", cls: "pill--warn" };
        return { key: "low", text: "正常", cls: "pill--ok" };
    }

    /* 紧迫度评分：缺口越大、降雨越少分数越高 */
    function urgencyScore(field) {
        var deficit = Math.max(0, field.targetMoisture - field.soilMoisture);
        var rainBonus = IoT.state.weather.rainProb < 30 ? 8 : 0;
        return Math.max(6, Math.min(98, Math.round(deficit * 4.2 + rainBonus)));
    }

    /* ----------------------------------------------------------------------
       1. 决策结论与仪表
       ---------------------------------------------------------------------- */
    function renderHero() {
        var field = currentField();
        var decision = IoT.computeDecision(selected);
        var score = urgencyScore(field);

        var titleEl = document.getElementById("decisionTitle");
        titleEl.innerHTML = field.name + "<em>" + (decision.need ? decision.status : "暂不需要灌溉") + "</em>";

        var rounds = Math.max(1, Math.ceil(decision.volume / 30));
        var rainText = decision.rainCut > 0
            ? "未来 24 小时降雨概率 " + IoT.state.weather.rainProb + "%，灌溉量按 " +
              Math.round(decision.rainCut * 100) + "% 折减"
            : "未来 24 小时降雨概率仅 " + IoT.state.weather.rainProb + "%，无有效降雨";

        document.getElementById("decisionDesc").textContent = decision.need
            ? "土壤含水率 " + field.soilMoisture.toFixed(1) + "%，与目标值 " + field.targetMoisture +
              "% 相差 " + decision.deficit + " 个百分点；" + rainText +
              "，建议合计灌溉 " + decision.volume + " m³" +
              (rounds > 1 ? "（分 " + rounds + " 轮，单轮不超过 30 m³）" : "") +
              "，预计总耗时 " + decision.duration + " 分钟。"
            : "土壤含水率 " + field.soilMoisture.toFixed(1) + "%，已达到目标值 " + field.targetMoisture +
              "%，本轮不安排灌溉，继续按 10 分钟频率跟踪墒情变化。";

        document.getElementById("decisionVolume").innerHTML = decision.volume + "<small>m³</small>";
        document.getElementById("decisionDuration").innerHTML = decision.duration + "<small>分钟</small>";
        document.getElementById("decisionDeficit").innerHTML = decision.deficit + "<small>%</small>";

        var gauge = document.getElementById("decisionGauge");
        gauge.style.setProperty("--p", score);
        document.getElementById("gaugeValue").textContent = score;
    }

    /* ----------------------------------------------------------------------
       2. 决策明细表
       ---------------------------------------------------------------------- */
    function renderTable() {
        var body = document.getElementById("decisionBody");
        if (!body) return;

        body.innerHTML = IoT.state.fields.map(function (field) {
            var decision = IoT.computeDecision(field.id);
            var urgency = urgencyOf(field);

            return "<tr>" +
                '<td class="strong">' + field.code + " · " + field.crop + "</td>" +
                "<td>" + field.crop + " · " + field.stage + "</td>" +
                '<td class="num">' + field.soilMoisture.toFixed(1) + " %</td>" +
                '<td class="num">' + field.targetMoisture + " %</td>" +
                '<td class="num">' + decision.deficit + "</td>" +
                '<td class="num strong">' + (decision.need ? decision.volume : 0) + " m³</td>" +
                '<td><span class="pill ' + urgency.cls + '"><i class="pill__dot"></i>' + urgency.text + "</span></td>" +
                '<td class="cell-actions">' +
                '<button class="icon-link" data-run="' + field.id + '" aria-label="执行 ' + field.code + ' 灌溉">' +
                '<svg class="icon" aria-hidden="true"><use href="#i-play"></use></svg></button>' +
                "</td>" +
                "</tr>";
        }).join("");
    }

    /* ----------------------------------------------------------------------
       3. 灌溉计划
       ---------------------------------------------------------------------- */
    function statusMeta(status) {
        if (status === "done") return { text: "已完成", cls: "pill--ok" };
        if (status === "pending") return { text: "待执行", cls: "pill--warn" };
        return { text: "计划中", cls: "pill--muted" };
    }

    function renderPlans() {
        var host = document.getElementById("planList");
        if (!host) return;

        host.innerHTML = IoT.state.plans.map(function (plan) {
            var meta = statusMeta(plan.status);
            var field = IoT.getField(plan.field);
            return '<div class="plan">' +
                '<div class="plan__time">' + plan.time.replace("明日 ", "") + "<small>" + (plan.time.indexOf("明日") > -1 ? "明日" : "今日") + "</small></div>" +
                '<div class="plan__body">' +
                '<div class="plan__name">' + plan.name + "</div>" +
                '<div class="plan__meta">' + plan.mode + " · " + plan.duration + " 分钟 · " + (field ? field.code : plan.field) + " 区</div>" +
                "</div>" +
                '<div class="plan__amount">' + plan.volume + "<small>m³</small></div>" +
                '<span class="pill ' + meta.cls + '">' + meta.text + "</span>" +
                "</div>";
        }).join("");

        var done = IoT.state.plans.filter(function (plan) { return plan.status === "done"; }).length;
        document.getElementById("planSummary").textContent =
            IoT.state.plans.length + " 项 · 已完成 " + done;
    }

    /* ----------------------------------------------------------------------
       4. 执行面板
       ---------------------------------------------------------------------- */
    function singleLimit() {
        return Number(settings().singleLimit) || 30;
    }

    function recommendedVolume() {
        var decision = IoT.computeDecision(selected);
        /* 单次不超过 30 m³，超出部分由计划拆分为多轮 */
        return Math.max(1, Math.min(singleLimit(), decision.volume));
    }

    function renderExec() {
        document.querySelectorAll("#execTargets .exec__chip").forEach(function (chip) {
            chip.classList.toggle("is-active", chip.getAttribute("data-field") === selected);
        });

        if (!running) {
            var volumeInput = document.getElementById("volumeRange");
            var value = recommendedVolume();
            volumeInput.value = Math.min(120, value);
            updateVolumeUI();
        }
    }

    function updateVolumeUI() {
        var value = parseFloat(document.getElementById("volumeRange").value);
        var duration = Math.max(6, Math.round(value / 0.28));
        document.getElementById("execVolume").textContent = value.toFixed(1) + " m³";
        document.getElementById("execDuration").textContent = duration + " 分钟" + (value >= singleLimit() ? "（已达单次上限）" : "");

        var percent = (value / 120) * 100;
        var range = document.getElementById("volumeRange");
        range.style.background = "linear-gradient(90deg, var(--brand) 0%, var(--brand) " + percent + "%, var(--surface-3) " + percent + "%, var(--surface-3) 100%)";

        if (!running) {
            document.getElementById("irrigatingTitle").textContent = "待执行 · " + currentField().name;
            document.getElementById("irrigatingText").textContent = "开阀后将实时回传流量与累计水量";
            document.getElementById("irrigatingPill").className = "pill pill--muted";
            document.getElementById("irrigatingPill").textContent = "就绪";
        }
    }

    function startIrrigation(volume) {
        if (running) {
            window.AgriUI.toast("任务执行中", "请等待当前灌溉批次结束", "warn");
            return;
        }

        var task = IoT.executeIrrigation(selected, { volume: volume, duration: 7600 });
        if (!task) return;

        running = true;
        document.getElementById("execBtn").classList.add("is-disabled");
        document.getElementById("irrigating").classList.add("is-running");
        document.getElementById("irrigatingPill").className = "pill pill--water";
        document.getElementById("irrigatingPill").textContent = "灌溉中";
        window.AgriUI.toast("灌溉指令已下发", currentField().name + " · 目标 " + volume.toFixed(1) + " m³", "ok");
    }

    /* ----------------------------------------------------------------------
       5. 阈值滑块
       ---------------------------------------------------------------------- */
    function bindSlider() {
        var low = settings().soilLow;
        var high = settings().soilHigh;

        var $slider = $("#moistureSlider");
        $slider.attr("data-cur_min", low).attr("data-cur_max", high);

        function refresh(lowValue, highValue) {
            settings().soilLow = Math.round(lowValue);
            settings().soilHigh = Math.round(highValue);

            document.getElementById("thresholdText").textContent =
                settings().soilLow + " – " + settings().soilHigh;
            document.getElementById("autoLowTip").textContent = settings().soilLow + "%";
            document.getElementById("autoHighTip").textContent = settings().soilHigh + "%";

            var triggers = IoT.state.fields.filter(needByThreshold).length;
            document.getElementById("triggerCount").innerHTML = triggers + "<small>个</small>";

            /* 标签跟随握柄：把百分比换算成像素 */
            var width = $("#moistureSlider").width() || 0;
            var min = 30;
            var max = 90;
            var leftPx = ((settings().soilLow - min) / (max - min)) * width;
            var rightPx = ((settings().soilHigh - min) / (max - min)) * width;
            $("#sliderLeftLabel").text(settings().soilLow).css("left", leftPx + "px");
            $("#sliderRightLabel").text(settings().soilHigh).css("left", rightPx + "px");
            document.getElementById("savedEstimate").innerHTML =
                Math.max(8, Math.round((92 - settings().soilHigh) * 0.9 + 6)) + "<small>%</small>";

            renderTable();
        }

        refresh(low, high);

        $slider.nstSlider({
            left_grip_selector: "#sliderLeft",
            right_grip_selector: "#sliderRight",
            value_bar_selector: "#sliderBar",
            value_changed_callback: function (cause, leftValue, rightValue) {
                refresh(leftValue, rightValue);
                if (cause === "init") return;
                IoT.saveSettings({
                    soilLow: Math.round(leftValue),
                    soilHigh: Math.round(rightValue)
                });
            }
        });
    }

    /* ----------------------------------------------------------------------
       6. 初始化
       ---------------------------------------------------------------------- */
    function init() {
        renderHero();
        renderTable();
        renderPlans();
        renderExec();
        bindSlider();

        /* 地块切换（决策卡 + 执行面板联动） */
        document.querySelectorAll("#execTargets .exec__chip").forEach(function (chip) {
            chip.addEventListener("click", function () {
                if (running) return;
                selected = chip.getAttribute("data-field");
                renderExec();
                renderHero();
            });
        });

        /* 水量滑杆 */
        document.getElementById("volumeRange").addEventListener("input", updateVolumeUI);

        /* 执行按钮 */
        document.getElementById("execBtn").addEventListener("click", function () {
            startIrrigation(parseFloat(document.getElementById("volumeRange").value));
        });

        /* 决策卡"立即执行建议" */
        document.getElementById("quickIrrigate").addEventListener("click", function () {
            startIrrigation(recommendedVolume());
        });

        /* 表格行内执行 */
        document.getElementById("decisionBody").addEventListener("click", function (event) {
            var trigger = event.target.closest("[data-run]");
            if (!trigger) return;
            selected = trigger.getAttribute("data-run");
            renderExec();
            renderHero();
            window.AgriUI.toast("已切换执行地块", currentField().name, "info", 2200);
        });

        /* 自动灌溉开关 */
        document.getElementById("autoSwitch").addEventListener("change", function () {
            var on = this.checked;
            IoT.saveSettings({ autoIrrigation: on });
            var pill = document.getElementById("execMode");
            pill.className = on ? "pill pill--ok" : "pill pill--water";
            pill.innerHTML = '<i class="pill__dot"></i>' + (on ? "自动模式" : "手动模式");
            window.AgriUI.toast(
                on ? "自动灌溉已开启" : "已切换为手动",
                on ? "低于阈值时将自动开阀，单次上限 30 m³" : "所有灌溉需人工确认后执行",
                on ? "ok" : "warn"
            );
        });
        document.getElementById("autoSwitch").checked = Boolean(settings().autoIrrigation);

        /* 重新计算 */
        document.getElementById("recalcBtn").addEventListener("click", function () {
            var icon = this.querySelector(".icon");
            icon.classList.add("spin");
            window.setTimeout(function () {
                icon.classList.remove("spin");
                renderHero();
                renderTable();
                renderPlans();
                window.AgriUI.toast("决策已重算", "已结合最新墒情与降雨预报更新建议", "ok");
            }, 700);
        });

        /* 新增计划 */
        document.getElementById("planConfirm").addEventListener("click", function () {
            var fieldId = document.getElementById("planField").value;
            var time = document.getElementById("planTime").value || "15:30";
            var volume = parseFloat(document.getElementById("planVolume").value);

            if (!volume || volume < 1) {
                window.AgriUI.toast("水量不合法", "请输入 1–120 m³ 之间的水量", "warn");
                return;
            }

            var field = IoT.getField(fieldId);
            IoT.state.plans.unshift({
                id: "IP-" + Date.now(),
                time: time,
                field: fieldId,
                name: field.code + " · " + field.crop + " · 新增计划",
                volume: Number(volume.toFixed(1)),
                duration: Math.max(8, Math.round(volume / 0.28)),
                mode: settings().autoIrrigation ? "自动" : "手动",
                status: "pending"
            });

            renderPlans();
            $("#planModal").modal("hide");
            window.AgriUI.toast("计划已保存", field.name + " · " + time + " · " + volume.toFixed(1) + " m³", "ok");
        });

        /* 灌溉进度与完成回传 */
        IoT.on("irrigation:progress", function (payload) {
            var percent = Math.round(payload.task.progress);
            document.getElementById("irrigatingBar").style.width = percent + "%";
            document.getElementById("irrigatingTitle").textContent = "灌溉中 · " + payload.task.fieldName;
            document.getElementById("irrigatingText").textContent =
                "已完成 " + percent + "% · 累计 " + (payload.task.volume * percent / 100).toFixed(1) + " / " + payload.task.volume + " m³";
        });

        IoT.on("irrigation:done", function (payload) {
            running = false;
            document.getElementById("execBtn").classList.remove("is-disabled");
            document.getElementById("irrigating").classList.remove("is-running");
            document.getElementById("irrigatingBar").style.width = "100%";
            document.getElementById("irrigatingPill").className = "pill pill--ok";
            document.getElementById("irrigatingPill").textContent = "已完成";
            document.getElementById("irrigatingTitle").textContent = "灌溉完成 · " + payload.task.fieldName;
            document.getElementById("irrigatingText").textContent =
                "本次用水 " + payload.task.volume + " m³，土壤含水率已回升至 " + payload.field.soilMoisture + "%";

            renderPlans();
            renderTable();
            renderHero();

            window.setTimeout(function () {
                document.getElementById("irrigatingBar").style.width = "0%";
                renderExec();
            }, 2600);

            window.AgriUI.toast("灌溉任务完成", payload.task.fieldName + " 已补水 " + payload.task.volume + " m³", "ok", 4200);
        });

        /* 实时刷新：决策卡随墒情变化 */
        IoT.on("telemetry", function () {
            if (!running) {
                renderHero();
            }
        });

        document.addEventListener("agri:refresh", function () {
            renderHero();
            renderTable();
            renderPlans();
            renderExec();
        });
    }

    $(init);
})(jQuery);
