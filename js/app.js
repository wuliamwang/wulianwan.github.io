/* ==========================================================================
   app.js —— 全站壳层交互
   主题切换 / 侧栏折叠 / 实时时钟 / 数字滚动 / 进场动效 / 提示条 / 页面转场
   ========================================================================== */
(function (window, document) {
    "use strict";


    var AgriIoT = window.AgriIoT;
    var AgriCharts = window.AgriCharts;
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var startTime = performance.now();

    var THEME_KEY = "agri.theme.v1";
    var SIDEBAR_KEY = "agri.sidebar.v1";

    /* ----------------------------------------------------------------------
       工具方法
       ---------------------------------------------------------------------- */
    function pad(value) {
        return value < 10 ? "0" + value : String(value);
    }

    function formatNumber(value, decimals) {
        var digits = decimals == null ? 0 : decimals;
        var fixed = Number(value).toFixed(digits);
        var parts = fixed.split(".");
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return parts.join(".");
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function store(key, value) {
        try { window.localStorage.setItem(key, value); } catch (error) {}
    }

    function read(key) {
        try { return window.localStorage.getItem(key); } catch (error) { return null; }
    }

    /* ----------------------------------------------------------------------
       1. 主题：浅色 / 深色，跟随系统默认
       ---------------------------------------------------------------------- */
    var themeToggle = document.getElementById("themeToggle");

    function currentTheme() {
        return document.documentElement.getAttribute("data-theme") || "light";
    }

    function applyTheme(theme, options) {
        document.documentElement.setAttribute("data-theme", theme);
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute("content", theme === "dark" ? "#04130f" : "#08281d");
        if (themeToggle) themeToggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
        if (!(options && options.silent)) store(THEME_KEY, theme);

        /* CSS 变量更新后重建 Highcharts，坐标轴与文字颜色才能同步 */
        if (AgriCharts && !(options && options.noCharts)) {
            window.requestAnimationFrame(function () {
                AgriCharts.rebuild();
                document.dispatchEvent(new CustomEvent("agri:theme", { detail: { theme: theme } }));
            });
        }
    }

    function initTheme() {
        var saved = read(THEME_KEY);
        var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
        /* 支持 ?theme=light|dark 固定主题：答辩截图时可控 */
        var forced = "";
        try { forced = new URLSearchParams(window.location.search).get("theme") || ""; } catch (error) {}
        var theme = (forced === "light" || forced === "dark")
            ? forced
            : (saved || (prefersDark ? "dark" : "light"));
        /* 主题参数会一并写入本地存储，保证跳转其它页面后仍保持同一主题 */
        applyTheme(theme, { noCharts: true });

        if (themeToggle) {
            themeToggle.addEventListener("click", function () {
                var next = currentTheme() === "dark" ? "light" : "dark";
                applyTheme(next);
            });
        }
    }

    /* ----------------------------------------------------------------------
       2. 侧边栏：桌面折叠 / 移动端抽屉
       ---------------------------------------------------------------------- */
    function initSidebar() {
        var app = document.getElementById("app");
        var toggle = document.getElementById("sidebarToggle");
        var mask = document.getElementById("sidebarMask");
        var mobileMenu = document.getElementById("mobileMenu");
        if (!app) return;

        if (read(SIDEBAR_KEY) === "collapsed") {
            app.classList.add("is-collapsed");
            if (toggle) toggle.setAttribute("aria-expanded", "false");
        }

        function collapse(next) {
            app.classList.toggle("is-collapsed", next);
            if (toggle) toggle.setAttribute("aria-expanded", next ? "false" : "true");
            store(SIDEBAR_KEY, next ? "collapsed" : "expanded");
            /* 栅格宽度变化后让图表重新计算尺寸 */
            window.setTimeout(function () {
                if (AgriCharts) AgriCharts.resizeAll();
            }, 460);
        }

        if (toggle) {
            toggle.addEventListener("click", function () {
                collapse(!app.classList.contains("is-collapsed"));
            });
        }

        function openNav(open) {
            app.classList.toggle("is-nav-open", open);
            if (mask) mask.hidden = !open;
            document.body.style.overflow = open ? "hidden" : "";
        }

        if (mobileMenu) {
            mobileMenu.addEventListener("click", function () { openNav(true); });
        }
        if (mask) {
            mask.addEventListener("click", function () { openNav(false); });
        }
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && app.classList.contains("is-nav-open")) {
                openNav(false);
            }
        });
        window.addEventListener("resize", function () {
            if (window.innerWidth > 900 && app.classList.contains("is-nav-open")) {
                openNav(false);
            }
        });
    }

    /* ----------------------------------------------------------------------
       3. 实时时钟
       ---------------------------------------------------------------------- */
    function initClock() {
        var timeEl = document.getElementById("clockTime");
        var dateEl = document.getElementById("clockDate");
        var rootEl = document.getElementById("headerClock");
        if (!timeEl) return;

        var weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

        function update() {
            var now = new Date();
            timeEl.textContent = pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds());
            if (dateEl) {
                dateEl.textContent =
                    now.getFullYear() + "/" + pad(now.getMonth() + 1) + "/" + pad(now.getDate()) +
                    " " + weekdays[now.getDay()];
            }
            if (rootEl) rootEl.setAttribute("datetime", now.toISOString());
        }

        update();
        window.setInterval(update, 1000);
    }

    /* ----------------------------------------------------------------------
       4. 提示条
       ---------------------------------------------------------------------- */
    var toastHost = null;

    function toast(title, text, type, duration) {
        if (!toastHost) toastHost = document.getElementById("toastHost");
        if (!toastHost) return;

        var variant = type || "ok";
        var iconMap = {
            ok: "i-check-circle",
            warn: "i-alert",
            danger: "i-alert",
            info: "i-bell"
        };

        var node = document.createElement("div");
        node.className = "toast" + (variant === "ok" ? "" : " toast--" + variant);
        node.setAttribute("role", "status");
        node.innerHTML =
            '<span class="toast__icon"><svg class="icon" aria-hidden="true"><use href="#' +
            (iconMap[variant] || iconMap.ok) + '"></use></svg></span>' +
            '<div class="toast__body"><div class="toast__title"></div><div class="toast__text"></div></div>' +
            '<button class="toast__close" type="button" aria-label="关闭提示">' +
            '<svg class="icon" aria-hidden="true"><use href="#i-close"></use></svg></button>';

        node.querySelector(".toast__title").textContent = title || "操作成功";
        node.querySelector(".toast__text").textContent = text || "";
        if (!text) node.querySelector(".toast__text").remove();

        toastHost.appendChild(node);

        var timer = window.setTimeout(close, duration || 3600);

        function close() {
            window.clearTimeout(timer);
            node.classList.add("is-out");
            window.setTimeout(function () {
                if (node.parentNode) node.parentNode.removeChild(node);
            }, 340);
        }

        node.querySelector(".toast__close").addEventListener("click", close);
        node.addEventListener("mouseenter", function () { window.clearTimeout(timer); });
        node.addEventListener("mouseleave", function () { timer = window.setTimeout(close, 1400); });
    }

    /* ----------------------------------------------------------------------
       5. 数字滚动
       ---------------------------------------------------------------------- */
    function countUp(element) {
        var target = parseFloat(element.getAttribute("data-count"));
        if (isNaN(target)) return;
        var decimals = parseInt(element.getAttribute("data-decimals") || "0", 10);
        var duration = reduceMotion ? 0 : parseInt(element.getAttribute("data-duration") || "1100", 10);
        var begin = performance.now();
        var from = parseFloat(element.getAttribute("data-from") || "0");

        if (duration === 0) {
            element.textContent = formatNumber(target, decimals);
            return;
        }

        function frame(now) {
            var progress = clamp((now - begin) / duration, 0, 1);
            /* easeOutExpo，前段快后段慢，读数更有"落定感" */
            var eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            var value = from + (target - from) * eased;
            element.textContent = formatNumber(value, decimals);
            if (progress < 1) {
                window.requestAnimationFrame(frame);
            } else {
                element.textContent = formatNumber(target, decimals);
                element.classList.add("num-pop");
                window.setTimeout(function () { element.classList.remove("num-pop"); }, 520);
            }
        }

        window.requestAnimationFrame(frame);
    }

    function initCountUp(scope) {
        var root = scope || document;
        var elements = root.querySelectorAll("[data-count]:not([data-counted])");
        if (!elements.length) return;

        if (!("IntersectionObserver" in window)) {
            Array.prototype.forEach.call(elements, function (el) {
                el.setAttribute("data-counted", "1");
                countUp(el);
            });
            return;
        }

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.setAttribute("data-counted", "1");
                countUp(entry.target);
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.25 });

        Array.prototype.forEach.call(elements, function (el) { observer.observe(el); });
    }

    /* ----------------------------------------------------------------------
       6. 进场动效：首屏错峰，滚动进入
       ---------------------------------------------------------------------- */
    function initReveal() {
        var items = document.querySelectorAll(".reveal");
        if (!items.length) return;

        var isFirst = true;
        var index = 0;

        if (!("IntersectionObserver" in window) || reduceMotion) {
            Array.prototype.forEach.call(items, function (el) { el.classList.add("is-in"); });
            return;
        }

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("is-in");
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.06, rootMargin: "0px 0px -40px 0px" });

        Array.prototype.forEach.call(items, function (el) {
            /* 首屏元素自带 delay，滚动进入的元素清掉 delay 免得延迟太久 */
            if (isFirst && index < 14) {
                el.style.setProperty("--delay", (index * 0.055).toFixed(3) + "s");
            } else {
                el.style.removeProperty("--delay");
            }
            index += 1;
            if (el.getBoundingClientRect().top > window.innerHeight) isFirst = false;
            observer.observe(el);
        });
    }

    /* ----------------------------------------------------------------------
       7. 卡片鼠标跟随高光
       ---------------------------------------------------------------------- */
    function initSpotlight() {
        if (reduceMotion) return;
        document.addEventListener("mousemove", function (event) {
            var card = event.target.closest ? event.target.closest(".card--spot") : null;
            if (!card) return;
            var rect = card.getBoundingClientRect();
            card.style.setProperty("--mx", (event.clientX - rect.left) + "px");
            card.style.setProperty("--my", (event.clientY - rect.top) + "px");
        });
    }

    /* ----------------------------------------------------------------------
       8. 按钮水波纹
       ---------------------------------------------------------------------- */
    function initRipple() {
        if (reduceMotion) return;
        document.addEventListener("click", function (event) {
            var button = event.target.closest ? event.target.closest(".btn-agri, .btn-ghost, .btn-soft, .auth-submit") : null;
            if (!button) return;
            var rect = button.getBoundingClientRect();
            var size = Math.max(rect.width, rect.height);
            var ripple = document.createElement("span");
            ripple.className = "ripple";
            ripple.style.width = ripple.style.height = size + "px";
            ripple.style.left = (event.clientX - rect.left - size / 2) + "px";
            ripple.style.top = (event.clientY - rect.top - size / 2) + "px";
            button.appendChild(ripple);
            window.setTimeout(function () {
                if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
            }, 640);
        });
    }

    /* ----------------------------------------------------------------------
       9. 页面转场：内部链接淡出遮罩
       ---------------------------------------------------------------------- */
    function initPageTransition() {
        var veil = document.getElementById("pageVeil");
        if (!veil) return;

        /* 进入页面：遮罩淡出 */
        window.setTimeout(function () { veil.classList.remove("is-active"); }, 30);

        if (reduceMotion) return;

        document.addEventListener("click", function (event) {
            var link = event.target.closest ? event.target.closest("a") : null;
            if (!link) return;
            var href = link.getAttribute("href");
            if (!href || href.charAt(0) === "#" || link.target === "_blank") return;
            if (link.hasAttribute("data-no-transition")) return;
            if (!/\.html(\?.*)?$/.test(href)) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;

            event.preventDefault();
            veil.classList.add("is-active");
            window.setTimeout(function () { window.location.href = href; }, 190);
        });
    }

    /* ----------------------------------------------------------------------
       10. 数据链路：启动中间件、同步状态徽标
       ---------------------------------------------------------------------- */
    function initDataLink() {
        if (!AgriIoT) return;

        var liveChip = document.getElementById("liveChip");
        var notifyDot = document.getElementById("notifyDot");
        var navBadge = document.getElementById("navAlarmBadge");
        var tpsEl = document.getElementById("gatewayTps");
        var onlineEl = document.getElementById("gatewayOnline");
        var totalEl = document.getElementById("gatewayTotal");
        var barEl = document.getElementById("gatewayBar");
        var paused = false;

        function syncBadges() {
            var open = AgriIoT.openAlarms().length;
            if (notifyDot) notifyDot.textContent = open ? String(open) : "";
            if (navBadge) navBadge.textContent = open ? String(open) : "";
            var summary = AgriIoT.summary();
            if (onlineEl) onlineEl.textContent = summary.online;
            if (totalEl) totalEl.textContent = summary.total;
            if (barEl) barEl.style.width = Math.round((summary.online / summary.total) * 100) + "%";
            if (tpsEl) tpsEl.textContent = summary.tps;
        }

        syncBadges();

        AgriIoT.on("telemetry", syncBadges);
        AgriIoT.on("alarm", syncBadges);
        AgriIoT.on("device", syncBadges);

        if (liveChip) {
            liveChip.addEventListener("click", function () {
                paused = !paused;
                if (paused) {
                    AgriIoT.stop();
                    liveChip.classList.add("is-paused");
                    liveChip.querySelector(".live-chip__text").textContent = "已暂停";
                    toast("已暂停实时刷新", "点击右上角状态可恢复数据推送", "info", 2600);
                } else {
                    AgriIoT.start(AgriIoT.settings.refresh);
                    liveChip.classList.remove("is-paused");
                    liveChip.querySelector(".live-chip__text").textContent = "实时同步";
                    toast("已恢复实时刷新", "边缘网关数据正在持续上行", "ok", 2200);
                }
            });
        }

        AgriIoT.start(AgriIoT.settings.refresh);
    }

    /* ----------------------------------------------------------------------
       11. 刷新按钮：通用骨架过渡
       ---------------------------------------------------------------------- */
    function initRefresh() {
        document.addEventListener("click", function (event) {
            var trigger = event.target.closest ? event.target.closest("[data-refresh]") : null;
            if (!trigger) return;
            var icon = trigger.querySelector(".icon");
            if (icon) icon.classList.add("spin");
            trigger.setAttribute("aria-busy", "true");

            var targetSelector = trigger.getAttribute("data-refresh");
            var target = targetSelector ? document.querySelector(targetSelector) : null;
            if (target) target.classList.add("is-refreshing");

            window.setTimeout(function () {
                if (icon) icon.classList.remove("spin");
                trigger.removeAttribute("aria-busy");
                if (target) target.classList.remove("is-refreshing");
                document.dispatchEvent(new CustomEvent("agri:refresh", { detail: { trigger: trigger } }));
                toast("数据已刷新", "最新采集值已同步至当前页面", "ok", 2000);
            }, 760);
        });
    }

    /* ----------------------------------------------------------------------
       12. 键盘快捷键
       ---------------------------------------------------------------------- */
    function initShortcuts() {
        document.addEventListener("keydown", function (event) {
            var tag = (event.target.tagName || "").toLowerCase();
            if (tag === "input" || tag === "textarea" || tag === "select") return;
            if (event.key === "t" || event.key === "T") {
                applyTheme(currentTheme() === "dark" ? "light" : "dark");
            }
            if (event.key === "/") {
                var search = document.querySelector(".search-box .input");
                if (search) {
                    event.preventDefault();
                    search.focus();
                }
            }
        });
    }

    /* ----------------------------------------------------------------------
       13. 启动
       ---------------------------------------------------------------------- */
    function boot() {
        initSidebar();
        initClock();
        initReveal();
        initCountUp(document);
        initSpotlight();
        initRipple();
        initPageTransition();
        initDataLink();
        initRefresh();
        initShortcuts();

        /* 页脚渲染耗时，答辩时可以现场演示"首屏 < 200ms" */
        var footEl = document.getElementById("footRender");
        if (footEl) {
            window.setTimeout(function () {
                footEl.textContent = Math.round(performance.now() - startTime);
            }, 60);
        }

        /* 页面隐藏时停止定时器，回来再启动，避免后台空转 */
        document.addEventListener("visibilitychange", function () {
            if (!AgriIoT) return;
            var liveChip = document.getElementById("liveChip");
            if (document.hidden) {
                AgriIoT.stop();
            } else if (!liveChip || !liveChip.classList.contains("is-paused")) {
                AgriIoT.start(AgriIoT.settings.refresh);
            }
        });

        document.dispatchEvent(new CustomEvent("agri:ready"));
    }

    /* 主题先于页面脚本生效：图表创建时读到的就是正确配色 */
    initTheme();

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }

    /* 对外暴露少量工具方法，页面脚本复用 */
    window.AgriUI = {
        toast: toast,
        countUp: initCountUp,
        formatNumber: formatNumber,
        applyTheme: applyTheme,
        currentTheme: currentTheme,
        pad: pad,
        clamp: clamp
    };
})(window, document);
