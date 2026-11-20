/* ==========================================================================
   系统设置 · 页面逻辑
   面板切换 / 主题选择 / 阈值与通知配置保存到 localStorage
   ========================================================================== */
(function ($) {
    "use strict";

    var IoT = window.AgriIoT;

    var DEFAULTS = {
        theme: "light",
        refresh: 3,
        soilLow: 45,
        soilHigh: 72,
        co2High: 1200,
        singleLimit: 30,
        autoIrrigation: true,
        notifySms: true,
        notifyApp: true,
        notifyMail: false,
        sidebar: "expanded"
    };

    /* ----------------------------------------------------------------------
       面板切换
       ---------------------------------------------------------------------- */
    function showPanel(name) {
        document.querySelectorAll(".settings-panel").forEach(function (panel) {
            panel.classList.toggle("is-active", panel.getAttribute("data-panel") === name);
        });
        document.querySelectorAll(".settings-nav__item").forEach(function (item) {
            item.classList.toggle("is-active", item.getAttribute("data-panel") === name);
        });
    }

    /* ----------------------------------------------------------------------
       读取 / 回填
       ---------------------------------------------------------------------- */
    function fill() {
        var settings = IoT.settings;

        document.getElementById("refreshSelect").value = String(settings.refresh || 3);
        document.getElementById("soilLowInput").value = settings.soilLow;
        document.getElementById("soilHighInput").value = settings.soilHigh;
        document.getElementById("co2Input").value = settings.co2High;
        document.getElementById("singleLimitInput").value = settings.singleLimit || 30;
        document.getElementById("autoIrrigationSwitch").checked = Boolean(settings.autoIrrigation);
        document.getElementById("smsSwitch").checked = Boolean(settings.notifySms);
        document.getElementById("appSwitch").checked = Boolean(settings.notifyApp);
        document.getElementById("mailSwitch").checked = Boolean(settings.notifyMail);

        var collapsed = document.getElementById("app") && document.getElementById("app").classList.contains("is-collapsed");
        document.getElementById("collapseSwitch").checked = collapsed;

        document.querySelectorAll("[data-theme-option]").forEach(function (button) {
            button.classList.toggle("is-active", button.getAttribute("data-theme-option") === window.AgriUI.currentTheme());
        });

        var renderEl = document.getElementById("aboutRender");
        var footEl = document.getElementById("footRender");
        if (renderEl && footEl) renderEl.textContent = footEl.textContent + " ms";
    }

    /* ----------------------------------------------------------------------
       保存
       ---------------------------------------------------------------------- */
    function save(label) {
        var low = parseInt(document.getElementById("soilLowInput").value, 10);
        var high = parseInt(document.getElementById("soilHighInput").value, 10);

        if (isNaN(low) || isNaN(high) || low >= high) {
            window.AgriUI.toast("阈值不合法", "下限必须小于上限，请重新填写", "warn");
            showPanel("threshold");
            return;
        }

        IoT.saveSettings({
            soilLow: low,
            soilHigh: high,
            co2High: parseInt(document.getElementById("co2Input").value, 10) || 1200,
            singleLimit: parseInt(document.getElementById("singleLimitInput").value, 10) || 30,
            autoIrrigation: document.getElementById("autoIrrigationSwitch").checked,
            notifySms: document.getElementById("smsSwitch").checked,
            notifyApp: document.getElementById("appSwitch").checked,
            notifyMail: document.getElementById("mailSwitch").checked
        });

        window.AgriUI.toast(label + "已保存", "配置已写入本地存储，刷新后依然生效", "ok");
    }

    /* ----------------------------------------------------------------------
       初始化
       ---------------------------------------------------------------------- */
    function init() {
        fill();

        document.querySelectorAll(".settings-nav__item").forEach(function (item) {
            item.addEventListener("click", function () {
                showPanel(item.getAttribute("data-panel"));
            });
        });

        /* 主题 */
        document.querySelectorAll("[data-theme-option]").forEach(function (button) {
            button.addEventListener("click", function () {
                var theme = button.getAttribute("data-theme-option");
                window.AgriUI.applyTheme(theme);
                document.querySelectorAll("[data-theme-option]").forEach(function (item) {
                    item.classList.toggle("is-active", item === button);
                });
                window.AgriUI.toast("主题已切换", theme === "dark" ? "深色模式 · 适合夜间值守" : "浅色模式 · 适合白天与投影", "info");
            });
        });

        /* 刷新频率 */
        document.getElementById("refreshSelect").addEventListener("change", function () {
            IoT.saveSettings({ refresh: parseInt(this.value, 10) });
            IoT.start(parseInt(this.value, 10));
            window.AgriUI.toast("刷新频率已调整", "每 " + this.value + " 秒采集一次数据", "ok");
        });

        /* 侧边栏默认收起 */
        document.getElementById("collapseSwitch").addEventListener("change", function () {
            var app = document.getElementById("app");
            var next = !this.checked;
            if (next === app.classList.contains("is-collapsed")) return;
            document.getElementById("sidebarToggle").click();
            window.AgriUI.toast(this.checked ? "已收起侧边栏" : "已展开侧边栏", "该偏好会被记住", "info");
        });

        /* 保存按钮 */
        document.querySelectorAll("[data-save]").forEach(function (button) {
            button.addEventListener("click", function () {
                save(button.getAttribute("data-save"));
            });
        });

        /* 恢复默认 */
        document.getElementById("resetSettings").addEventListener("click", function () {
            IoT.saveSettings(DEFAULTS);
            window.AgriUI.applyTheme(DEFAULTS.theme);
            IoT.start(DEFAULTS.refresh);
            fill();
            window.AgriUI.toast("已恢复默认设置", "阈值、通知与外观均回到初始状态", "ok");
        });

        window.setTimeout(fill, 120);
    }

    $(init);
})(jQuery);
