/* ==========================================================================
   登录页 · 页面逻辑
   登录方式切换 / 表单校验 / 密码显隐 / 模拟登录跳转
   ========================================================================== */
(function ($) {
    "use strict";

    var activeTab = "account";

    function showError(message) {
        var box = document.getElementById("loginError");
        document.getElementById("loginErrorText").textContent = message;
        box.classList.add("is-show");
    }

    function clearError() {
        document.getElementById("loginError").classList.remove("is-show");
    }

    function switchTab(tab) {
        activeTab = tab;
        document.querySelectorAll(".auth-tab").forEach(function (button) {
            var active = button.getAttribute("data-tab") === tab;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-selected", active ? "true" : "false");
        });
        document.getElementById("accountFields").hidden = tab !== "account";
        document.getElementById("phoneFields").hidden = tab !== "phone";
        clearError();
    }

    function validate() {
        if (activeTab === "account") {
            var username = document.getElementById("username").value.trim();
            var password = document.getElementById("password").value.trim();
            if (!username) {
                showError("请输入用户名");
                return false;
            }
            if (!password) {
                showError("请输入密码");
                return false;
            }
            if (password.length < 4) {
                showError("密码长度至少 4 位");
                return false;
            }
            return true;
        }

        var phone = document.getElementById("phone").value.trim();
        var code = document.getElementById("code").value.trim();
        if (!/^1\d{10}$/.test(phone)) {
            showError("请输入 11 位手机号");
            return false;
        }
        if (!/^\d{4,6}$/.test(code)) {
            showError("请输入 4–6 位验证码");
            return false;
        }
        if (code !== "123456" && code.length !== 6) {
            showError("演示环境验证码为 123456");
            return false;
        }
        return true;
    }

    function init() {
        document.querySelectorAll(".auth-tab").forEach(function (button) {
            button.addEventListener("click", function () {
                switchTab(button.getAttribute("data-tab"));
            });
        });

        document.getElementById("togglePassword").addEventListener("click", function () {
            var input = document.getElementById("password");
            var visible = input.type === "text";
            input.type = visible ? "password" : "text";
            this.setAttribute("aria-label", visible ? "显示密码" : "隐藏密码");
            this.classList.toggle("is-active", !visible);
        });

        var countdown = 0;
        document.getElementById("sendCode").addEventListener("click", function () {
            if (countdown > 0) return;
            var phone = document.getElementById("phone").value.trim();
            if (!/^1\d{10}$/.test(phone)) {
                showError("请先输入正确的手机号");
                return;
            }
            clearError();
            var self = this;
            countdown = 60;
            self.textContent = countdown + " s";
            var timer = window.setInterval(function () {
                countdown -= 1;
                if (countdown <= 0) {
                    window.clearInterval(timer);
                    self.textContent = "获取验证码";
                } else {
                    self.textContent = countdown + " s";
                }
            }, 1000);
            window.AgriUI.toast("验证码已发送", "演示环境验证码固定为 123456", "info", 4200);
        });

        document.getElementById("loginForm").addEventListener("submit", function (event) {
            event.preventDefault();
            clearError();
            if (!validate()) return;

            var button = document.getElementById("loginSubmit");
            button.classList.add("is-loading");
            button.querySelector(".label").textContent = "正在验证…";

            window.setTimeout(function () {
                window.AgriUI.toast("登录成功", "正在进入智慧农业工作台…", "ok", 1800);
                window.setTimeout(function () {
                    window.location.href = "index.html";
                }, 620);
            }, 900);
        });

        /* 输入时清除错误提示 */
        document.querySelectorAll(".auth-form .input").forEach(function (input) {
            input.addEventListener("input", clearError);
        });

        /* 演示环境：直接回车即可进入 */
        document.getElementById("username").focus();
    }

    $(init);
})(jQuery);
