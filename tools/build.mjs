/**
 * 智慧农业云平台 · 静态页面构建脚本
 * ---------------------------------------------------------------------------
 * 目的：把「全站壳层（侧边栏 / 顶栏 / 图标库 / 页脚）」与「页面主体」拼装成
 *       可直接双击打开的静态 HTML，避免 9 个页面重复维护导航与图标。
 *
 * 用法：node tools/build.mjs
 * 输入：tools/partials/*.html、tools/pages/*.html（首行含 JSON 元信息）
 * 输出：项目根目录下的 *.html
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const PARTIALS = join(HERE, "partials");
const PAGES = join(HERE, "pages");

/* --------------------------------------------------------------------------
   1. 导航配置：分组 + 菜单项（新增页面只需在 here 增加一项）
   -------------------------------------------------------------------------- */
const NAV_GROUPS = [
    {
        label: "运营中心",
        items: [
            { id: "index", href: "index.html", icon: "i-dashboard", text: "数据驾驶舱" },
            { id: "monitor", href: "monitor.html", icon: "i-monitor", text: "环境监测", badge: "LIVE" },
            { id: "irrigation", href: "irrigation.html", icon: "i-irrigation", text: "智能灌溉" },
            { id: "devices", href: "devices.html", icon: "i-device", text: "设备控制" }
        ]
    },
    {
        label: "数据与洞察",
        items: [
            { id: "analysis", href: "analysis.html", icon: "i-analysis", text: "数据分析" },
            { id: "alarms", href: "alarms.html", icon: "i-alarm", text: "告警中心", badge: "2", badgeType: "warn" },
            { id: "farm", href: "farm.html", icon: "i-farm", text: "地块与作物" }
        ]
    },
    {
        label: "系统",
        items: [
            { id: "settings", href: "settings.html", icon: "i-settings", text: "系统设置" }
        ]
    }
];

const CRUMB_ROOTS = {
    index: "总览",
    monitor: "运营",
    irrigation: "运营",
    devices: "运营",
    analysis: "洞察",
    alarms: "洞察",
    farm: "洞察",
    settings: "系统"
};

/* --------------------------------------------------------------------------
   2. 读取模板片段
   -------------------------------------------------------------------------- */
const read = (name) => readFileSync(join(PARTIALS, name), "utf8");
const shell = read("shell.html");
const shellAuth = read("shell-auth.html");
const sprite = read("sprite.html");

/* --------------------------------------------------------------------------
   3. 渲染导航与面包屑
   -------------------------------------------------------------------------- */
function renderNav(activeId) {
    return NAV_GROUPS.map((group) => {
        const items = group.items
            .map((item) => {
                const isActive = item.id === activeId;
                let badge = "";
                if (item.badge) {
                    const cls = item.badgeType === "warn" ? " nav-item__badge--warn" : item.badge === "LIVE" ? " nav-item__badge--live" : "";
                    badge = `<span class="nav-item__badge${cls}"${item.id === "alarms" ? ' id="navAlarmBadge"' : ""}>${item.badge}</span>`;
                }
                return [
                    `            <a class="nav-item${isActive ? " is-active" : ""}" href="${item.href}" data-nav="${item.id}"${isActive ? ' aria-current="page"' : ""}>`,
                    `                <svg class="icon" aria-hidden="true"><use href="#${item.icon}"></use></svg>`,
                    `                <span class="nav-item__text">${item.text}</span>`,
                    badge ? `                ${badge}` : null,
                    `            </a>`
                ].filter(Boolean).join("\n");
            })
            .join("\n");
        return [
            `        <p class="nav__label">${group.label}</p>`,
            `        <div class="nav__group">`,
            items,
            `        </div>`
        ].join("\n");
    }).join("\n");
}

function renderCrumb(navId, title) {
    if (navId === "index") {
        return `                <li class="is-current" aria-current="page">${title}</li>`;
    }
    const root = CRUMB_ROOTS[navId] || "";
    return [
        `                <li><a href="index.html">${root}</a></li>`,
        `                <li class="is-current" aria-current="page">${title}</li>`
    ].join("\n");
}

/* --------------------------------------------------------------------------
   4. 解析页面元信息并拼装
   -------------------------------------------------------------------------- */
const META_RE = /^<!--@([\s\S]*?)@-->\s*/;

function buildPage(file) {
    const raw = readFileSync(join(PAGES, file), "utf8");
    const match = raw.match(META_RE);
    if (!match) throw new Error(`${file} 缺少 <!--@{...}@--> 元信息块`);

    const meta = JSON.parse(match[1]);
    const content = raw.slice(match[0].length);

    const name = basename(file, ".html");
    const libs = meta.lib || [];
    const extraHead = [];
    const extraJs = [];

    if (libs.includes("slider")) {
        extraHead.push('    <link href="css/jquery.nstSlider.css" rel="stylesheet">');
        extraJs.push('<script src="js/jquery.nstSlider.min.js"></script>');
    }
    if (libs.includes("highcharts")) {
        extraJs.push('<script src="js/highcharts.js"></script>');
    }

    const pageScript = join(ROOT, "js", "pages", `${name}.js`);
    const pageJs = existsSync(pageScript)
        ? `<script src="js/pages/${name}.js"></script>`
        : "";

    /* 登录页使用独立的「无侧边栏」壳层 */
    const layout = meta.layout === "auth" ? shellAuth : shell;

    let html = layout
        .replace("{{SPRITE}}", sprite)
        .replace("{{TITLE}}", meta.title)
        .replace("{{DESC}}", meta.desc || meta.title)
        .replace("{{BODY_CLASS}}", meta.class || "")
        .replace("{{EXTRA_HEAD}}", extraHead.join("\n"))
        .replace("{{EXTRA_JS}}", extraJs.join("\n"))
        .replace("{{PAGE_JS}}", pageJs)
        .replace("{{CONTENT}}", content.replace(/\s+$/, ""));

    if (layout === shell) {
        html = html
            .replace("{{NAV}}", renderNav(meta.nav))
            .replace("{{CRUMB}}", renderCrumb(meta.nav, meta.crumb || meta.title));
    }

    writeFileSync(join(ROOT, `${name}.html`), html, "utf8");
    return { name, title: meta.title, size: html.length };
}

const files = readdirSync(PAGES).filter((f) => f.endsWith(".html")).sort();
const results = files.map(buildPage);

console.log("✔ 构建完成，共 " + results.length + " 个页面：");
for (const r of results) {
    console.log(`  - ${r.name}.html  ${r.title}  (${(r.size / 1024).toFixed(1)} KB)`);
}
