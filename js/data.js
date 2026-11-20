/* ==========================================================================
   data.js —— 演示数据种子
   ---------------------------------------------------------------------------
   为了答辩演示可复现，全部"采集数据"都由固定随机种子生成：刷新页面数值稳定，
   但每次进入页面又有轻微的实时变化（由 iot-middleware.js 的平滑漂移产生）。
   ========================================================================== */
window.AGRI_SEED = (function () {
    "use strict";

    /* 可复现随机数：mulberry32，同一 seed 每次生成同一串数据 */
    function createRandom(seed) {
        var state = seed >>> 0;
        return function () {
            state = (state + 0x6d2b79f5) >>> 0;
            var t = Math.imul(state ^ (state >>> 15), 1 | state);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    var random = createRandom(20261120);

    /** 在 [min, max] 之间取值，保留 digits 位小数 */
    function between(min, max, digits) {
        var value = min + random() * (max - min);
        return Number(value.toFixed(digits == null ? 1 : digits));
    }

    /**
     * 生成一条 24 小时曲线：正弦波动 + 噪声 + 尾部上翘，
     * 用于土壤湿度、气温、光照等指标的历史趋势。
     */
    function daySeries(base, amplitude, noise, rise, points) {
        var list = [];
        var total = points || 24;
        for (var i = 0; i < total; i++) {
            var wave = Math.sin(((i - 6) / total) * Math.PI * 2) * amplitude;
            var trend = (i / total) * (rise || 0);
            list.push(Number((base + wave + trend + (random() - 0.5) * noise).toFixed(1)));
        }
        return list;
    }

    /** 生成 24 个小时标签，最后一格为当前小时 */
    function hourLabels(points) {
        var labels = [];
        var now = new Date();
        var total = points || 24;
        for (var i = total - 1; i >= 0; i--) {
            var hour = (now.getHours() - i + 24) % 24;
            labels.push((hour < 10 ? "0" + hour : hour) + ":00");
        }
        return labels;
    }

    /* ----------------------------------------------------------------------
       地块档案：4 个典型设施/露天地块
       ---------------------------------------------------------------------- */
    var fields = [
        {
            id: "A",
            code: "A 区",
            name: "A 区 · 番茄温室",
            crop: "番茄",
            variety: "普罗旺斯",
            stage: "结果期",
            stageIndex: 3,
            area: 12.6,
            plants: 8600,
            plantedAt: "2026-08-18",
            harvestAt: "2026-12-20",
            soilMoisture: 61.4,
            targetMoisture: 68,
            soilTemp: 18.6,
            soilEc: 1.82,
            soilPh: 6.5,
            airTemp: 24.2,
            airHumidity: 66,
            light: 21800,
            co2: 620,
            windSpeed: 1.2,
            leafWetness: 12,
            color: "#2ecf8f",
            tone: "#e6f5ee",
            health: 92,
            sensors: 4,
            waterToday: 12.4,
            waterPlan: 14.2
        },
        {
            id: "B",
            code: "B 区",
            name: "B 区 · 黄瓜大棚",
            crop: "黄瓜",
            variety: "津优 35",
            stage: "采收期",
            stageIndex: 4,
            area: 9.8,
            plants: 6200,
            plantedAt: "2026-08-02",
            harvestAt: "2026-11-28",
            soilMoisture: 72.8,
            targetMoisture: 66,
            soilTemp: 19.4,
            soilEc: 2.05,
            soilPh: 6.2,
            airTemp: 26.6,
            airHumidity: 78,
            light: 16500,
            co2: 1280,
            windSpeed: 0.8,
            leafWetness: 34,
            color: "#5ad6a8",
            tone: "#e9f8f1",
            health: 78,
            sensors: 3,
            waterToday: 6.8,
            waterPlan: 7.5
        },
        {
            id: "C",
            code: "C 区",
            name: "C 区 · 露天小麦",
            crop: "小麦",
            variety: "济麦 22",
            stage: "分蘖期",
            stageIndex: 1,
            area: 46.2,
            plants: 0,
            plantedAt: "2026-10-08",
            harvestAt: "2027-06-12",
            soilMoisture: 41.2,
            targetMoisture: 58,
            soilTemp: 14.8,
            soilEc: 1.24,
            soilPh: 7.1,
            airTemp: 16.4,
            airHumidity: 47,
            light: 32600,
            co2: 412,
            windSpeed: 3.1,
            leafWetness: 8,
            color: "#d9c46a",
            tone: "#faf6e4",
            health: 64,
            sensors: 3,
            waterToday: 0,
            waterPlan: 18.6
        },
        {
            id: "D",
            code: "D 区",
            name: "D 区 · 草莓高架",
            crop: "草莓",
            variety: "红颜",
            stage: "开花期",
            stageIndex: 2,
            area: 6.4,
            plants: 4800,
            plantedAt: "2026-09-15",
            harvestAt: "2027-01-20",
            soilMoisture: 66.2,
            targetMoisture: 64,
            soilTemp: 17.2,
            soilEc: 1.56,
            soilPh: 6.0,
            airTemp: 22.8,
            airHumidity: 71,
            light: 19200,
            co2: 580,
            windSpeed: 0.6,
            leafWetness: 26,
            color: "#ef8b78",
            tone: "#fdeeea",
            health: 88,
            sensors: 2,
            waterToday: 3.1,
            waterPlan: 4.2
        }
    ];

    /* ----------------------------------------------------------------------
       设备清单
       ---------------------------------------------------------------------- */
    var devices = [
        { id: "pump-1", name: "1 号灌溉泵", category: "irrigation", type: "离心水泵", field: "A", icon: "i-pump", on: true, online: true, power: 1.1, runtime: "2h18m", flow: 18.4, signal: 4, battery: 100 },
        { id: "pump-2", name: "2 号灌溉泵", category: "irrigation", type: "潜水泵", field: "C", icon: "i-pump", on: false, online: true, power: 2.2, runtime: "0h00m", flow: 0, signal: 3, battery: 100 },
        { id: "valve-a1", name: "A 区滴灌阀", category: "irrigation", type: "电磁阀 DN50", field: "A", icon: "i-valve", on: true, online: true, power: 0.04, runtime: "2h18m", flow: 6.2, signal: 4, battery: 92 },
        { id: "valve-b1", name: "B 区微喷阀", category: "irrigation", type: "电磁阀 DN40", field: "B", icon: "i-valve", on: false, online: true, power: 0.04, runtime: "1h06m", flow: 0, signal: 4, battery: 88 },
        { id: "valve-c1", name: "C 区喷灌阀", category: "irrigation", type: "电磁阀 DN80", field: "C", icon: "i-valve", on: false, online: true, power: 0.06, runtime: "0h00m", flow: 0, signal: 3, battery: 76 },
        { id: "fert-1", name: "水肥一体机", category: "irrigation", type: "EC/pH 配肥", field: "A", icon: "i-droplet", on: true, online: true, power: 0.75, runtime: "1h40m", flow: 0, signal: 4, battery: 100 },
        { id: "fan-b1", name: "B 区环流风机", category: "climate", type: "轴流风机 1.5kW", field: "B", icon: "i-fan", on: true, online: true, power: 1.5, runtime: "4h02m", flow: 0, signal: 4, battery: 100 },
        { id: "fan-a1", name: "A 区通风窗", category: "climate", type: "顶开窗 3×12m", field: "A", icon: "i-fan", on: false, online: true, power: 0.25, runtime: "0h52m", flow: 0, signal: 4, battery: 100 },
        { id: "curtain-a1", name: "A 区遮阳卷帘", category: "climate", type: "外遮阳 60%", field: "A", icon: "i-cloud", on: false, online: true, power: 0.55, runtime: "0h18m", flow: 0, signal: 4, battery: 100 },
        { id: "lamp-a1", name: "A 区补光灯", category: "climate", type: "LED 植物灯 240W", field: "A", icon: "i-lamp", on: false, online: true, power: 0.24, runtime: "6h12m", flow: 0, signal: 4, battery: 100 },
        { id: "lamp-b1", name: "B 区补光灯", category: "climate", type: "LED 植物灯 240W", field: "B", icon: "i-lamp", on: true, online: true, power: 0.24, runtime: "3h35m", flow: 0, signal: 4, battery: 100 },
        { id: "cam-a1", name: "A 区高清球机", category: "security", type: "400 万像素 PTZ", field: "A", icon: "i-camera", on: true, online: true, power: 0.02, runtime: "24h00m", flow: 0, signal: 4, battery: 100 },
        { id: "station-1", name: "园区气象站", category: "sensor", type: "六要素自动站", field: "C", icon: "i-cloud-sun", on: true, online: true, power: 0.01, runtime: "24h00m", flow: 0, signal: 4, battery: 87 },
        { id: "sensor-c1", name: "C 区墒情仪", category: "sensor", type: "三层管式墒情", field: "C", icon: "i-database", on: true, online: true, power: 0.01, runtime: "24h00m", flow: 0, signal: 2, battery: 41 },
        { id: "pest-1", name: "虫情测报灯", category: "security", type: "光控自动测报", field: "C", icon: "i-bug", on: false, online: false, power: 0.03, runtime: "0h00m", flow: 0, signal: 0, battery: 12 },
        { id: "sensor-d1", name: "D 区基质温湿度", category: "sensor", type: "插入式三合一", field: "D", icon: "i-thermometer", on: true, online: true, power: 0.01, runtime: "24h00m", flow: 0, signal: 3, battery: 68 }
    ];

    /* ----------------------------------------------------------------------
       传感器明细（环境监测页表格）
       ---------------------------------------------------------------------- */
    var sensors = [
        { id: "SN-A01", name: "A 区土壤墒情", type: "土壤温湿度", field: "A", metric: "soilMoisture", value: 61.4, unit: "%", battery: 86, signal: 4, status: "normal", lastSeen: "8 秒前" },
        { id: "SN-A02", name: "A 区空气温湿度", type: "空气温湿度", field: "A", metric: "airTemp", value: 24.2, unit: "°C", battery: 74, signal: 4, status: "normal", lastSeen: "6 秒前" },
        { id: "SN-A03", name: "A 区光照度", type: "光照度", field: "A", metric: "light", value: 21800, unit: "lx", battery: 92, signal: 4, status: "normal", lastSeen: "9 秒前" },
        { id: "SN-A04", name: "A 区 CO₂ 浓度", type: "二氧化碳", field: "A", metric: "co2", value: 620, unit: "ppm", battery: 63, signal: 3, status: "normal", lastSeen: "12 秒前" },
        { id: "SN-B01", name: "B 区土壤墒情", type: "土壤温湿度", field: "B", metric: "soilMoisture", value: 72.8, unit: "%", battery: 58, signal: 4, status: "normal", lastSeen: "7 秒前" },
        { id: "SN-B02", name: "B 区空气温湿度", type: "空气温湿度", field: "B", metric: "airTemp", value: 26.6, unit: "°C", battery: 81, signal: 4, status: "normal", lastSeen: "5 秒前" },
        { id: "SN-B03", name: "B 区 CO₂ 浓度", type: "二氧化碳", field: "B", metric: "co2", value: 1280, unit: "ppm", battery: 47, signal: 3, status: "warn", lastSeen: "11 秒前" },
        { id: "SN-C01", name: "C 区土壤墒情", type: "土壤温湿度", field: "C", metric: "soilMoisture", value: 41.2, unit: "%", battery: 41, signal: 2, status: "danger", lastSeen: "26 秒前" },
        { id: "SN-C02", name: "C 区风速风向", type: "风速风向", field: "C", metric: "windSpeed", value: 3.1, unit: "m/s", battery: 87, signal: 4, status: "normal", lastSeen: "4 秒前" },
        { id: "SN-C03", name: "C 区光照度", type: "光照度", field: "C", metric: "light", value: 32600, unit: "lx", battery: 90, signal: 4, status: "normal", lastSeen: "8 秒前" },
        { id: "SN-D01", name: "D 区基质温度", type: "基质温度", field: "D", metric: "soilTemp", value: 17.2, unit: "°C", battery: 68, signal: 3, status: "normal", lastSeen: "10 秒前" },
        { id: "SN-D02", name: "D 区叶面湿度", type: "叶面湿度", field: "D", metric: "leafWetness", value: 26, unit: "%", battery: 55, signal: 3, status: "normal", lastSeen: "13 秒前" }
    ];

    /* ----------------------------------------------------------------------
       告警 / 事件
       ---------------------------------------------------------------------- */
    var alarms = [
        {
            id: "AL-20261120-01",
            level: "danger",
            icon: "i-alert",
            title: "土壤含水率低于下限",
            text: "C 区露天小麦 0–20cm 土壤含水率降至 41.2%，低于设定下限 45%，已持续 34 分钟。",
            field: "C",
            source: "SN-C01",
            time: "08:49",
            status: "open",
            rule: "土壤湿度 < 45%"
        },
        {
            id: "AL-20261120-02",
            level: "warn",
            icon: "i-cloud",
            title: "CO₂ 浓度偏高",
            text: "B 区黄瓜大棚 CO₂ 浓度 1280ppm，超过适宜上限 1200ppm，建议开启环流风机。",
            field: "B",
            source: "SN-B03",
            time: "08:36",
            status: "open",
            rule: "CO₂ > 1200ppm"
        },
        {
            id: "AL-20261120-03",
            level: "warn",
            icon: "i-pump",
            title: "水泵电流波动异常",
            text: "2 号灌溉泵启动瞬间电流 9.8A，超出额定值 18%，请检查叶轮是否堵塞。",
            field: "C",
            source: "pump-2",
            time: "08:12",
            status: "open",
            rule: "电流偏差 > 15%"
        },
        {
            id: "AL-20261120-04",
            level: "info",
            icon: "i-lamp",
            title: "补光时长超出建议值",
            text: "A 区补光灯今日累计运行 6.2 小时，超过番茄结果期建议时长 5 小时。",
            field: "A",
            source: "lamp-a1",
            time: "07:58",
            status: "resolved",
            rule: "补光 > 5h/日"
        },
        {
            id: "AL-20261119-07",
            level: "info",
            icon: "i-signal",
            title: "传感器通信短暂中断",
            text: "园区气象站 05:22–05:25 数据上行中断 3 分钟，网络恢复后已自动补传。",
            field: "C",
            source: "station-1",
            time: "05:25",
            status: "resolved",
            rule: "心跳超时 > 60s"
        }
    ];

    /* ----------------------------------------------------------------------
       灌溉计划
       ---------------------------------------------------------------------- */
    var plans = [
        { id: "IP-01", time: "06:30", field: "A", name: "A 区番茄 · 晨间滴灌", volume: 12.4, duration: 42, mode: "自动", status: "done" },
        { id: "IP-02", time: "09:00", field: "B", name: "B 区黄瓜 · 微喷补水", volume: 6.8, duration: 26, mode: "自动", status: "done" },
        { id: "IP-03", time: "15:30", field: "C", name: "C 区小麦 · 喷灌补墒", volume: 18.6, duration: 78, mode: "自动", status: "pending" },
        { id: "IP-04", time: "明日 06:00", field: "D", name: "D 区草莓 · 水肥一体", volume: 4.2, duration: 18, mode: "手动", status: "plan" }
    ];

    /* ----------------------------------------------------------------------
       气象数据
       ---------------------------------------------------------------------- */
    var weather = {
        station: "寿光 · 国家农业科技园区",
        temp: 18.4,
        desc: "多云转晴",
        humidity: 52,
        wind: 2.4,
        windDir: "东北风",
        pressure: 1012,
        rainProb: 10,
        et0: 3.2,
        sunrise: "06:42",
        sunset: "17:08",
        forecast: [
            { day: "今天", icon: "i-cloud-sun", high: 21, low: 9, rain: 10, tone: "" },
            { day: "周六", icon: "i-sun", high: 22, low: 10, rain: 0, tone: "" },
            { day: "周日", icon: "i-cloud", high: 19, low: 11, rain: 20, tone: "is-cloud" },
            { day: "周一", icon: "i-cloud-rain", high: 16, low: 11, rain: 65, tone: "is-rain" },
            { day: "周二", icon: "i-cloud", high: 17, low: 9, rain: 30, tone: "is-cloud" },
            { day: "周三", icon: "i-sun", high: 23, low: 10, rain: 0, tone: "" },
            { day: "周四", icon: "i-sun", high: 24, low: 12, rain: 5, tone: "" }
        ]
    };

    /* ----------------------------------------------------------------------
       历史序列
       ---------------------------------------------------------------------- */
    var history = {
        labels: hourLabels(24),
        soilA: daySeries(64, 4.2, 2.2, -3.6, 24),
        soilC: daySeries(47, 3.4, 1.8, -5.8, 24),
        airTemp: daySeries(18.6, 5.4, 1.4, 5.2, 24),
        light: [0, 0, 0, 0, 0, 120, 1800, 6200, 12400, 18600, 23800, 26400, 28200, 26800, 23200, 17800, 11200, 4200, 900, 0, 0, 0, 0, 0],
        humidity: daySeries(70, 8.4, 3.2, -12, 24),
        water: [0, 0, 0, 0, 0, 0, 0.2, 0.4, 2.6, 3.2, 1.4, 0.2, 0, 0, 0.4, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        weekLabels: ["11/14", "11/15", "11/16", "11/17", "11/18", "11/19", "今日"],
        weekWater: [28.4, 33.6, 41.2, 36.8, 44.6, 38.2, 42.3],
        weekTemp: [17.2, 18.4, 16.8, 17.6, 18.2, 17.4, 18.1]
    };

    /* 近 14 天土壤湿度热力图（行=地块，列=日期） */
    function heatmapRows() {
        var rows = [];
        for (var f = 0; f < 4; f++) {
            rows.push(daySeries(58 + f * 3, 6, 3.4, 0, 14).map(function (v) {
                return Math.max(30, Math.min(82, v));
            }));
        }
        return rows;
    }

    /* 当日 0–23 时土壤湿度散点，用于热力图 */
    var heatmap = {
        labels: (function () {
            var list = [];
            for (var i = 0; i < 24; i++) list.push(i % 4 === 0 ? String(i) : "");
            return list;
        })(),
        fields: ["A", "B", "C", "D"],
        rows: heatmapRows()
    };

    /* 操作日志 */
    var logs = [
        { time: "08:52", text: "C 区土壤含水率低于阈值，已向值班人员推送 <b>短信 + App</b> 告警", tag: "告警", tone: "danger" },
        { time: "08:44", text: "B 区环流风机依据 <b>CO₂ 联控策略</b> 自动开启", tag: "自动", tone: "ok" },
        { time: "08:16", text: "A 区番茄晨间滴灌完成，实际用水 <b>12.6 m³</b>，节水率 18%", tag: "灌溉", tone: "water" },
        { time: "07:58", text: "A 区补光灯达到日运行上限，已自动熔断", tag: "自动", tone: "warn" },
        { time: "07:30", text: "网关完成 16 台设备心跳巡检，全部在线", tag: "巡检", tone: "ok" }
    ];

    /* 实时数据流初始行 */
    var streamSeed = [
        { time: "08:52:14", tag: "SN-A01", value: "61.4", unit: "%", warn: false },
        { time: "08:52:12", tag: "SN-C01", value: "41.2", unit: "%", warn: true },
        { time: "08:52:09", tag: "SN-A02", value: "24.2", unit: "°C", warn: false },
        { time: "08:52:07", tag: "SN-B03", value: "1280", unit: "ppm", warn: true },
        { time: "08:52:05", tag: "SN-C02", value: "3.1", unit: "m/s", warn: false },
        { time: "08:52:03", tag: "SN-A03", value: "21800", unit: "lx", warn: false },
        { time: "08:52:01", tag: "SN-B01", value: "72.8", unit: "%", warn: false },
        { time: "08:51:58", tag: "SN-D01", value: "17.2", unit: "°C", warn: false },
        { time: "08:51:56", tag: "SN-A04", value: "620", unit: "ppm", warn: false },
        { time: "08:51:54", tag: "SN-C03", value: "32600", unit: "lx", warn: false },
        { time: "08:51:51", tag: "SN-B02", value: "26.6", unit: "°C", warn: false },
        { time: "08:51:49", tag: "SN-D02", value: "26", unit: "%", warn: false },
        { time: "08:51:47", tag: "SN-A01", value: "61.3", unit: "%", warn: false },
        { time: "08:51:44", tag: "SN-C01", value: "41.4", unit: "%", warn: true },
        { time: "08:51:42", tag: "SN-B01", value: "72.6", unit: "%", warn: false }
    ];

    /* 系统健康度 / 平台指标 */
    var platform = {
        health: 92,
        onlineDevices: 14,
        totalDevices: 16,
        todayIrrigation: 3,
        waterSaved: 28.4,
        waterSavedRate: 28.4,
        activeAlarms: 3,
        dataPoints: 284620,
        uptime: "99.96%",
        gatewayTps: 28,
        responseMs: 128
    };

    return {
        fields: fields,
        devices: devices,
        sensors: sensors,
        alarms: alarms,
        plans: plans,
        weather: weather,
        history: history,
        heatmap: heatmap,
        logs: logs,
        streamSeed: streamSeed,
        platform: platform,
        random: createRandom(8848)
    };
})();
