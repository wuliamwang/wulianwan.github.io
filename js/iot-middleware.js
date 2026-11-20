/* ==========================================================================
   iot-middleware.js —— 浏览器端物联网中间件（模拟）
   ---------------------------------------------------------------------------
   真实项目中这一层由 MQTT Broker / 规则引擎 / 时序数据库承担。答辩演示环境
   没有真实硬件，这里用一套"发布-订阅 + 设备影子 + 平滑漂移"的模拟中间件
   替代，使页面代码与真实接入方式保持一致：

       设备层(虚拟)  →  中间件(本文件)  →  页面(订阅 telemetry 事件渲染)

   对外 API（页面只依赖这些方法，将来换成 WebSocket/MQTT 时页面无需改动）：
     AgriIoT.on(topic, handler)        订阅：telemetry / irrigation / alarm / device
     AgriIoT.off(topic, handler)       取消订阅
     AgriIoT.start(interval)           启动采集循环（默认 3s）
     AgriIoT.stop()                    暂停采集
     AgriIoT.state                     只读状态快照（字段 / 设备 / 传感器 / 告警）
     AgriIoT.getField(id)              取地块
     AgriIoT.getDevice(id)             取设备
     AgriIoT.setDevice(id, on)         下发设备开关指令
     AgriIoT.toggleDevice(id)          反转设备状态
     AgriIoT.computeDecision(fieldId)  灌溉决策算法：返回建议水量、优先级与理由
     AgriIoT.executeIrrigation(field)  执行灌溉任务（带进度回调）
     AgriIoT.resolveAlarm(id)          处理告警
     AgriIoT.settings / saveSettings() 读写本地设置（localStorage 持久化）
   ========================================================================== */
window.AgriIoT = (function () {
    "use strict";

    var seed = window.AGRI_SEED;
    var STORAGE_KEY = "agri.settings.v1";
    var ALARM_KEY = "agri.alarms.v1";

    /* 深拷贝，避免页面直接改动中间件内部状态 */
    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function nowTime() {
        var d = new Date();
        function pad(n) { return n < 10 ? "0" + n : String(n); }
        return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    }

    /* ----------------------------------------------------------------------
       1. 内部状态：启动时从种子数据深拷贝一份"实时库"
       ---------------------------------------------------------------------- */
    var state = {
        fields: clone(seed.fields),
        devices: clone(seed.devices),
        sensors: clone(seed.sensors),
        alarms: clone(seed.alarms),
        plans: clone(seed.plans),
        weather: clone(seed.weather),
        history: clone(seed.history),
        logs: clone(seed.logs),
        platform: clone(seed.platform),
        stream: clone(seed.streamSeed),
        irrigation: null,          // 正在执行的灌溉任务
        settings: {
            theme: "light",
            sidebar: "expanded",
            refresh: 3,
            autoIrrigation: true,
            soilLow: 45,
            soilHigh: 72,
            co2High: 1200,
            singleLimit: 30,
            et0Weight: 1,
            notifySms: true,
            notifyApp: true,
            notifyMail: false
        }
    };

    /* 记录健康度基准值：采集循环围绕它做小幅漂移，保证与页面初值一致 */
    state.fields.forEach(function (field) {
        field.healthBase = field.health;
    });

    /* 恢复本地设置 */
    try {
        var saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
        if (saved && typeof saved === "object") {
            Object.keys(saved).forEach(function (key) {
                if (Object.prototype.hasOwnProperty.call(state.settings, key)) {
                    state.settings[key] = saved[key];
                }
            });
        }
        var savedAlarms = JSON.parse(window.localStorage.getItem(ALARM_KEY) || "null");
        if (savedAlarms && typeof savedAlarms === "object") {
            state.alarms.forEach(function (alarm) {
                if (savedAlarms[alarm.id]) alarm.status = savedAlarms[alarm.id];
            });
        }
    } catch (error) {
        /* 隐私模式下 localStorage 不可用时静默降级 */
    }

    /* ----------------------------------------------------------------------
       2. 极简发布-订阅
       ---------------------------------------------------------------------- */
    var listeners = {};

    function on(topic, handler) {
        (listeners[topic] || (listeners[topic] = [])).push(handler);
        return function () { off(topic, handler); };
    }

    function off(topic, handler) {
        var list = listeners[topic];
        if (!list) return;
        var index = list.indexOf(handler);
        if (index > -1) list.splice(index, 1);
    }

    function emit(topic, payload) {
        (listeners[topic] || []).slice().forEach(function (handler) {
            try { handler(payload); } catch (error) { console.warn("[AgriIoT] 订阅者异常：", topic, error); }
        });
        /* 同时派发 DOM 事件，便于不引用本对象的页面脚本监听 */
        document.dispatchEvent(new CustomEvent("agri:" + topic, { detail: payload }));
    }

    /* ----------------------------------------------------------------------
       3. 查询与设备控制
       ---------------------------------------------------------------------- */
    function getField(id) {
        for (var i = 0; i < state.fields.length; i++) {
            if (state.fields[i].id === id) return state.fields[i];
        }
        return null;
    }

    function getDevice(id) {
        for (var i = 0; i < state.devices.length; i++) {
            if (state.devices[i].id === id) return state.devices[i];
        }
        return null;
    }

    function setDevice(id, nextOn, options) {
        var device = getDevice(id);
        if (!device) return null;
        if (!device.online) {
            emit("device:denied", { device: clone(device), reason: "设备离线，指令已进入待下发队列" });
            return null;
        }
        device.on = Boolean(nextOn);
        device.runtime = device.on ? "0h01m" : device.runtime;
        device.flow = device.on && device.category === "irrigation" ? Number((device.power * 8.4).toFixed(1)) : 0;

        /* 开关联动：水泵与阀门、风机与窗户等保持业务一致 */
        if (!(options && options.silent)) {
            state.logs.unshift({
                time: nowTime().slice(0, 5),
                text: (device.on ? "已开启" : "已关闭") + " <b>" + device.name + "</b>，指令经 MQTT 下行至设备",
                tag: "控制",
                tone: device.on ? "ok" : "muted"
            });
            if (state.logs.length > 12) state.logs.pop();
            emit("device", { device: clone(device) });
            emit("log", state.logs[0]);
        }
        return clone(device);
    }

    function toggleDevice(id) {
        var device = getDevice(id);
        if (!device) return null;
        return setDevice(id, !device.on);
    }

    /* ----------------------------------------------------------------------
       4. 灌溉决策算法
       ----------------------------------------------------------------------
       简化版水量平衡模型：
         缺水量 V = (目标含水率 − 当前含水率) × 面积 × 单位系数(0.15)
         再按 24h 降雨概率、蒸散量 ET₀、作物系数修正，得到建议灌溉量。
       ---------------------------------------------------------------------- */
    var CROP_FACTOR = { "番茄": 1.06, "黄瓜": 1.0, "小麦": 0.82, "草莓": 0.9 };

    function computeDecision(fieldId) {
        var field = getField(fieldId);
        if (!field) return null;

        var deficit = Math.max(0, field.targetMoisture - field.soilMoisture);
        var cropFactor = CROP_FACTOR[field.crop] || 1;
        var base = deficit * field.area * 0.15 * cropFactor;
        var rain = state.weather.rainProb;
        var rainCut = rain >= 60 ? 0.4 : rain >= 30 ? 0.15 : 0;
        var et0 = state.weather.et0 * state.settings.et0Weight;
        var etAdd = et0 * field.area * 0.06;

        var volume = Math.max(0, base * (1 - rainCut) + etAdd * (deficit > 3 ? 1 : 0.4));
        volume = Number(volume.toFixed(1));

        var need = deficit > 0.5;
        var urgency = deficit >= 12 ? "high" : deficit >= 5 ? "medium" : "low";
        var score = clamp(Math.round(100 - deficit * 2.6 - (urgency === "high" ? 8 : 0)), 18, 99);
        var duration = Math.max(8, Math.round(volume / 0.28));

        var reasons = [
            {
                tone: need ? "warn" : "ok",
                text: "当前土壤含水率 <b>" + field.soilMoisture.toFixed(1) + "%</b>，目标值 <b>" + field.targetMoisture + "%</b>，" +
                    (need ? "缺口 <b>" + deficit.toFixed(1) + "%</b>" : "已满足作物需求")
            },
            {
                tone: rain >= 30 ? "warn" : "ok",
                text: "未来 24h 降雨概率 <b>" + rain + "%</b>，按 <b>" + Math.round(rainCut * 100) + "%</b> 折减灌溉量"
            },
            {
                tone: "ok",
                text: "参考蒸散量 ET₀ <b>" + et0.toFixed(1) + " mm</b>，作物系数 <b>" +
                    cropFactor.toFixed(2) + "</b>（" + field.crop + "）"
            },
            {
                tone: field.waterToday > field.waterPlan ? "warn" : "ok",
                text: "今日已用水 <b>" + field.waterToday.toFixed(1) + " m³</b> / 计划 <b>" +
                    field.waterPlan.toFixed(1) + " m³</b>"
            }
        ];

        return {
            fieldId: field.id,
            fieldName: field.name,
            need: need,
            deficit: Number(deficit.toFixed(1)),
            volume: volume,
            duration: duration,
            urgency: urgency,
            score: score,
            rainCut: rainCut,
            reasons: reasons,
            status: urgency === "high" ? "建议立即灌溉" : need ? "建议今日灌溉" : "暂不需要灌溉"
        };
    }

    /* ----------------------------------------------------------------------
       5. 执行灌溉：模拟一次 8 秒的异步任务，页面可订阅进度
       ---------------------------------------------------------------------- */
    function executeIrrigation(fieldId, options) {
        var field = getField(fieldId);
        if (!field) return null;
        if (state.irrigation) {
            emit("irrigation:busy", { fieldId: fieldId });
            return null;
        }

        var decision = computeDecision(fieldId);
        var volume = (options && options.volume) || decision.volume;
        var task = {
            id: "RUN-" + Date.now(),
            fieldId: fieldId,
            fieldName: field.name,
            volume: volume,
            progress: 0,
            startedAt: Date.now(),
            duration: (options && options.duration) || 8000
        };
        state.irrigation = task;

        /* 打开对应水泵与阀门 */
        state.devices.forEach(function (device) {
            if (device.field === fieldId && device.category === "irrigation") {
                setDevice(device.id, true, { silent: true });
            }
        });

        emit("irrigation:start", clone(task));

        var stepMs = 200;
        var timer = setInterval(function () {
            task.progress = clamp(task.progress + (stepMs / task.duration) * 100, 0, 100);
            emit("irrigation:progress", { task: clone(task) });

            if (task.progress >= 100) {
                clearInterval(timer);
                var applied = Number(volume.toFixed(1));
                field.soilMoisture = clamp(field.soilMoisture + (field.targetMoisture - field.soilMoisture) * 0.86, 0, 100);
                field.soilMoisture = Number(field.soilMoisture.toFixed(1));
                field.waterToday = Number((field.waterToday + applied).toFixed(1));

                state.devices.forEach(function (device) {
                    if (device.field === fieldId && device.category === "irrigation") {
                        setDevice(device.id, false, { silent: true });
                    }
                });

                state.plans.forEach(function (plan) {
                    if (plan.field === fieldId && plan.status === "pending") plan.status = "done";
                });

                state.logs.unshift({
                    time: nowTime().slice(0, 5),
                    text: "<b>" + field.name + "</b> 灌溉完成，实际用水 <b>" + applied + " m³</b>",
                    tag: "灌溉",
                    tone: "water"
                });

                state.irrigation = null;
                emit("irrigation:done", { task: clone(task), field: clone(field) });
                emit("device");
                emit("log", state.logs[0]);
            }
        }, stepMs);

        return clone(task);
    }

    /* ----------------------------------------------------------------------
       6. 告警
       ---------------------------------------------------------------------- */
    function resolveAlarm(id) {
        for (var i = 0; i < state.alarms.length; i++) {
            if (state.alarms[i].id === id) {
                state.alarms[i].status = "resolved";
                var map = {};
                state.alarms.forEach(function (alarm) { map[alarm.id] = alarm.status; });
                try { window.localStorage.setItem(ALARM_KEY, JSON.stringify(map)); } catch (error) {}
                emit("alarm:resolved", clone(state.alarms[i]));
                emit("alarm");
                return clone(state.alarms[i]);
            }
        }
        return null;
    }

    function openAlarms() {
        return state.alarms.filter(function (alarm) { return alarm.status === "open"; });
    }

    /* ----------------------------------------------------------------------
       7. 采集循环：每 3 秒推进一次"实时数据"
       ---------------------------------------------------------------------- */
    var timer = null;
    var tickCount = 0;

    function drift(value, range, min, max, step) {
        var delta = (Math.random() - 0.5) * step;
        return Number(clamp(value + delta, min, max).toFixed(range));
    }

    function tick() {
        tickCount += 1;

        state.fields.forEach(function (field) {
            field.soilMoisture = drift(field.soilMoisture, 1, 30, 88, 0.5);
            field.soilTemp = drift(field.soilTemp, 1, 8, 32, 0.3);
            field.airTemp = drift(field.airTemp, 1, 8, 38, 0.5);
            field.airHumidity = drift(field.airHumidity, 0, 30, 98, 1);
            field.light = Math.round(clamp(field.light + (Math.random() - 0.5) * 1600, 0, 62000));
            field.co2 = Math.round(clamp(field.co2 + (Math.random() - 0.5) * 60, 380, 1600));
            /* 健康度围绕基准值小幅波动（±3），过高或过低会被拉回基准 */
            var pull = (field.healthBase - field.health) * 0.25;
            field.health = Math.round(clamp(
                field.health + pull + (Math.random() - 0.5) * 1.6,
                field.healthBase - 3,
                field.healthBase + 3
            ));
        });

        /* 同步传感器读数 */
        state.sensors.forEach(function (sensor) {
            var field = getField(sensor.field);
            if (!field) return;
            if (field[sensor.metric] != null) {
                sensor.value = field[sensor.metric];
            }
            if (sensor.status !== "warn" && sensor.status !== "danger") {
                sensor.status = "normal";
            }
            sensor.lastSeen = (Math.floor(Math.random() * 20) + 2) + " 秒前";
            if (Math.random() < 0.18) {
                sensor.battery = clamp(sensor.battery - 1, 6, 100);
            }
        });

        /* 追加一条实时数据流 */
        var sample = state.sensors[Math.floor(Math.random() * state.sensors.length)];
        state.stream.unshift({
            time: nowTime(),
            tag: sample.id,
            value: String(sample.value),
            unit: sample.unit,
            warn: sample.status !== "normal"
        });
        if (state.stream.length > 26) state.stream.pop();

        /* 平台指标轻微抖动 */
        state.platform.gatewayTps = clamp(state.platform.gatewayTps + (Math.random() < 0.5 ? -1 : 1), 18, 46);
        state.platform.responseMs = clamp(state.platform.responseMs + Math.round((Math.random() - 0.5) * 12), 86, 210);

        emit("telemetry", {
            fields: clone(state.fields),
            sensors: clone(state.sensors),
            stream: state.stream.slice(0, 6),
            tick: tickCount,
            at: nowTime()
        });
    }

    function start(intervalSeconds) {
        stop();
        var seconds = intervalSeconds || state.settings.refresh || 3;
        timer = setInterval(tick, Math.max(1.5, seconds) * 1000);
        return timer;
    }

    function stop() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    function isRunning() {
        return Boolean(timer);
    }

    /* ----------------------------------------------------------------------
       8. 设置持久化
       ---------------------------------------------------------------------- */
    function saveSettings(patch) {
        Object.keys(patch || {}).forEach(function (key) {
            state.settings[key] = patch[key];
        });
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings)); } catch (error) {}
        emit("settings", clone(state.settings));
        return clone(state.settings);
    }

    /* ----------------------------------------------------------------------
       9. 汇总指标（供页面 KPI 使用）
       ---------------------------------------------------------------------- */
    function summary() {
        var online = state.devices.filter(function (d) { return d.online; }).length;
        var running = state.devices.filter(function (d) { return d.on && d.online; }).length;
        var avgSoil = state.fields.reduce(function (sum, f) { return sum + f.soilMoisture; }, 0) / state.fields.length;
        var water = state.fields.reduce(function (sum, f) { return sum + f.waterToday; }, 0);
        var health = Math.round(state.fields.reduce(function (sum, f) { return sum + f.health; }, 0) / state.fields.length);

        return {
            online: online,
            total: state.devices.length,
            running: running,
            avgSoil: Number(avgSoil.toFixed(1)),
            water: Number(water.toFixed(1)),
            health: health,
            openAlarms: openAlarms().length,
            tps: state.platform.gatewayTps,
            responseMs: state.platform.responseMs
        };
    }

    /* 启动前先把平台指标与设备状态对齐，避免侧栏显示不一致 */
    state.platform.onlineDevices = state.devices.filter(function (d) { return d.online; }).length;
    state.platform.totalDevices = state.devices.length;
    state.platform.activeAlarms = openAlarms().length;

    return {
        /* 只读快照 */
        get state() { return state; },
        get settings() { return state.settings; },

        on: on,
        off: off,
        emit: emit,

        start: start,
        stop: stop,
        isRunning: isRunning,
        tick: tick,
        summary: summary,

        getField: getField,
        getDevice: getDevice,
        setDevice: setDevice,
        toggleDevice: toggleDevice,

        computeDecision: computeDecision,
        executeIrrigation: executeIrrigation,

        resolveAlarm: resolveAlarm,
        openAlarms: openAlarms,

        saveSettings: saveSettings,
        clone: clone
    };
})();
