// ==========================================
// وام پی — Auth & UI Base
// فایل: setup-admin.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: راه‌اندازی اولین کاربر (Super Admin) در اولین اجرا
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var USERS_KEY       = 'wamPayUsers';
    var SETUP_FLAG_KEY  = 'wamPaySetupDone';
    var FORM_ID         = 'wamSetupForm';
    var LOGIN_PAGE      = 'login.html';
    var ADMIN_DASHBOARD = 'super-admin-dashboard.html';

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        form: null,
        submitting: false,
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var SetupEvents = {
        START:      'setup.start',
        SUBMIT:     'setup.submit',
        SUCCESS:    'setup.success',
        FAIL:       'setup.fail',
        ALREADY:    'setup.already',
        NOT_ALLOWED:'setup.not_allowed'
    };

    function _emit(name, data) {
        if (typeof EventBus !== 'undefined') {
            try { EventBus.emit(name, data); } catch (e) { /* بی‌صدا */ }
        }
        for (var i = 0; i < STATE.listeners.length; i++) {
            try { STATE.listeners[i](name, data); } catch (e) { /* بی‌صدا */ }
        }
    }

    // ─────────────────────────────────────
    // 🔍 کمکی‌ها
    // ─────────────────────────────────────
    function _loadUsers() {
        if (typeof Storage === 'undefined') return [];
        var list = Storage.getJSON(USERS_KEY, []);
        return Array.isArray(list) ? list : [];
    }

    function _saveUsers(users) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(USERS_KEY, users);
    }

    function _isSetupDone() {
        if (typeof Storage === 'undefined') return false;
        return Storage.get(SETUP_FLAG_KEY, '0') === '1';
    }

    function _markSetupDone() {
        if (typeof Storage === 'undefined') return false;
        return Storage.set(SETUP_FLAG_KEY, '1');
    }

    function _hasAnyUser() {
        return _loadUsers().length > 0;
    }

    // ─────────────────────────────────────
    // 🆔 ساخت شناسه کاربر
    // ─────────────────────────────────────
    function _generateUserId() {
        var rand = Math.random().toString(36).slice(2, 8);
        return 'u_' + Date.now().toString(36) + '_' + rand;
    }

    function _generateAdminCode() {
        var rand = Math.random().toString(36).slice(2, 8).toUpperCase();
        return 'WP-SA-' + rand;
    }

    // ─────────────────────────────────────
    // 🧾 اعتبارسنجی فرم
    // ─────────────────────────────────────
    function _validateForm(data) {
        var errors = {};

        if (!data.name || data.name.trim().length < 3) {
            errors.name = 'نام و نام خانوادگی حداقل ۳ کاراکتر باشد';
        } else if (data.name.trim().length > 60) {
            errors.name = 'نام حداکثر ۶۰ کاراکتر باشد';
        }

        if (!data.username || data.username.trim().length < 3) {
            errors.username = 'نام کاربری حداقل ۳ کاراکتر باشد';
        } else if (data.username.trim().length > 30) {
            errors.username = 'نام کاربری حداکثر ۳۰ کاراکتر باشد';
        } else if (!/^[a-zA-Z0-9_\-\.]+$/.test(data.username.trim())) {
            errors.username = 'نام کاربری فقط شامل حروف، اعداد و _ - . باشد';
        }

        if (!data.mobile) {
            errors.mobile = 'شماره موبایل الزامی است';
        } else {
            var mob = String(data.mobile).replace(/\D/g, '');
            if (!/^09\d{9}$/.test(mob)) {
                errors.mobile = 'شماره موبایل باید با ۰۹ شروع و ۱۱ رقم باشد';
            }
        }

        if (!data.password || data.password.length < 6) {
            errors.password = 'رمز عبور حداقل ۶ کاراکتر باشد';
        } else if (data.password.length > 64) {
            errors.password = 'رمز عبور حداکثر ۶۴ کاراکتر باشد';
        }

        if (!data.confirm || data.confirm !== data.password) {
            errors.confirm = 'تکرار رمز عبور مطابقت ندارد';
        }

        return errors;
    }

    // ─────────────────────────────────────
    // 🎨 نمایش خطاها
    // ─────────────────────────────────────
    function _setFieldError(field, message) {
        if (!STATE.form) return;
        var el = STATE.form.querySelector('[data-error="' + field + '"]');
        if (el) {
            el.textContent = message || '';
            el.style.display = message ? 'block' : 'none';
        }
        var input = STATE.form.querySelector('[name="' + field + '"]');
        if (input) {
            if (message) input.classList.add('wam-input--error');
            else input.classList.remove('wam-input--error');
        }
    }

    function _showErrors(errors) {
        _clearErrors();
        if (!errors) return;
        for (var k in errors) {
            if (Object.prototype.hasOwnProperty.call(errors, k)) {
                _setFieldError(k, errors[k]);
            }
        }
    }

    function _clearErrors() {
        if (!STATE.form) return;
        var errs = STATE.form.querySelectorAll('[data-error]');
        for (var i = 0; i < errs.length; i++) {
            errs[i].textContent = '';
            errs[i].style.display = 'none';
        }
        var inputs = STATE.form.querySelectorAll('.wam-input--error');
        for (var j = 0; j < inputs.length; j++) {
            inputs[j].classList.remove('wam-input--error');
        }
    }

    function _setBusy(busy) {
        STATE.submitting = !!busy;
        if (!STATE.form) return;
        var btn = STATE.form.querySelector('[type="submit"]');
        if (!btn) return;
        if (busy) {
            btn.disabled = true;
            btn.setAttribute('data-original-text', btn.textContent);
            btn.textContent = 'در حال ساخت...';
            btn.classList.add('wam-btn--busy');
        } else {
            btn.disabled = false;
            var orig = btn.getAttribute('data-original-text');
            if (orig) btn.textContent = orig;
            btn.classList.remove('wam-btn--busy');
        }
    }

    // ─────────────────────────────────────
    // 🎯 ساخت کاربر Super Admin
    // ─────────────────────────────────────
    function createSuperAdmin(data, options) {
        options = options || {};
        var result = { ok: false, reason: null, user: null, errors: null };

        // ۱. بررسی امکان راه‌اندازی
        if (!options.force && _hasAnyUser()) {
            result.reason = 'already_setup';
            _emit(SetupEvents.ALREADY, { at: Date.now() });
            return result;
        }

        // ۲. اعتبارسنجی
        var errors = _validateForm(data);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            _emit(SetupEvents.FAIL, { reason: 'validation', errors: errors });
            return result;
        }

        // ۳. ساخت کاربر
        var now = Date.now();
        var passwordHash;
        if (typeof WamLogin !== 'undefined' && WamLogin.hash) {
            passwordHash = WamLogin.hash(data.password);
        } else {
            // fallback ساده
            var h = 5381;
            for (var i = 0; i < data.password.length; i++) {
                h = ((h << 5) + h) + data.password.charCodeAt(i);
                h = h & 0xffffffff;
            }
            passwordHash = 'wh1_' + (h >>> 0).toString(16);
        }

        var mobileNorm = String(data.mobile).replace(/\D/g, '');

        var user = {
            id: _generateUserId(),
            username: data.username.trim(),
            name: data.name.trim(),
            mobile: mobileNorm,
            email: data.email ? String(data.email).trim() : null,
            password: passwordHash,
            role: 'super_admin',
            adminCode: _generateAdminCode(),
            active: true,
            status: 'active',
            createdAt: now,
            createdBy: 'setup',
            lastLogin: null,
            meta: {
                setupAt: now,
                ip: null,
                userAgent: (typeof navigator !== 'undefined' && navigator.userAgent)
                    ? navigator.userAgent.slice(0, 120) : null
            }
        };

        // ۴. ذخیره در users
        var users = _loadUsers();
        users.push(user);
        if (!_saveUsers(users)) {
            result.reason = 'storage_error';
            _emit(SetupEvents.FAIL, { reason: 'storage_error' });
            return result;
        }

        // ۵. علامت‌گذاری راه‌اندازی
        _markSetupDone();

        // ۶. رویداد موفقیت
        result.ok = true;
        result.user = {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            adminCode: user.adminCode
        };

        _emit(SetupEvents.SUCCESS, {
            user: result.user,
            at: now
        });

        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess(
                'حساب مدیر ارشد ساخته شد. اکنون وارد شوید.',
                'راه‌اندازی موفق'
            );
        }

        return result;
    }

    // ─────────────────────────────────────
    // 🎯 هندلر submit
    // ─────────────────────────────────────
    function _handleSubmit(e) {
        if (e) e.preventDefault();
        if (STATE.submitting) return;

        _clearErrors();
        if (!STATE.form) return;

        var nameEl    = STATE.form.querySelector('[name="name"]');
        var userEl    = STATE.form.querySelector('[name="username"]');
        var mobileEl  = STATE.form.querySelector('[name="mobile"]');
        var emailEl   = STATE.form.querySelector('[name="email"]');
        var pwdEl     = STATE.form.querySelector('[name="password"]');
        var confirmEl = STATE.form.querySelector('[name="confirm"]');

        var data = {
            name:     nameEl    ? nameEl.value.trim()    : '',
            username: userEl    ? userEl.value.trim()    : '',
            mobile:   mobileEl  ? mobileEl.value.trim()  : '',
            email:    emailEl   ? emailEl.value.trim()   : '',
            password: pwdEl     ? pwdEl.value            : '',
            confirm:  confirmEl ? confirmEl.value        : ''
        };

        _emit(SetupEvents.SUBMIT, { username: data.username });

        _setBusy(true);

        setTimeout(function () {
            var res = createSuperAdmin(data);

            if (!res.ok) {
                _setBusy(false);

                if (res.reason === 'already_setup') {
                    if (typeof WamUI !== 'undefined') {
                        WamUI.toastWarning(
                            'قبلاً راه‌اندازی انجام شده است. به صفحه ورود می‌روید...',
                            'راه‌اندازی تکراری'
                        );
                    }
                    setTimeout(function () {
                        if (window.location) {
                            window.location.replace(LOGIN_PAGE);
                        }
                    }, 1500);
                    return;
                }
                if (res.reason === 'storage_error') {
                    if (typeof WamUI !== 'undefined') {
                        WamUI.toastError(
                            'خطا در ذخیره‌سازی. فضای مرورگر را بررسی کنید.',
                            'خطای ذخیره‌سازی'
                        );
                    }
                    return;
                }
                if (res.errors) {
                    _showErrors(res.errors);
                }
                return;
            }

            // موفقیت — ریدایرکت به login
            if (typeof WamUI !== 'undefined') {
                WamUI.loader.show('وام پی', 'در حال انتقال به صفحه ورود...');
            }

            setTimeout(function () {
                if (window.location) {
                    window.location.replace(LOGIN_PAGE + '?setup=done');
                }
            }, 700);
        }, 400);
    }

    // ─────────────────────────────────────
    // 📌 بایند فرم
    // ─────────────────────────────────────
    function bindForm(form) {
        if (!form) return false;
        if (STATE.form === form) return true;
        if (STATE.form) {
            try { STATE.form.removeEventListener('submit', _handleSubmit); } catch (e) { /* بی‌صدا */ }
        }
        STATE.form = form;
        form.addEventListener('submit', _handleSubmit);

        // Enter → submit
        var inputs = form.querySelectorAll('input');
        for (var i = 0; i < inputs.length; i++) {
            inputs[i].addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    _handleSubmit(e);
                }
            });
            // پاک کردن خطای هر فیلد هنگام تایپ
            inputs[i].addEventListener('input', function () {
                var name = this.getAttribute('name');
                if (name) _setFieldError(name, '');
            });
        }

        return true;
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var run = function () {
            // ۱. اگر قبلاً راه‌اندازی شده → برو login
            if (_hasAnyUser() || _isSetupDone()) {
                _emit(SetupEvents.ALREADY, { at: Date.now() });

                if (!options.noRedirect) {
                    if (typeof WamUI !== 'undefined') {
                        WamUI.toastInfo(
                            'قبلاً راه‌اندازی انجام شده است. در حال انتقال به ورود...',
                            'راه‌اندازی انجام شده'
                        );
                    }
                    setTimeout(function () {
                        if (window.location) {
                            window.location.replace(LOGIN_PAGE);
                        }
                    }, 900);
                }
                return;
            }

            // ۲. یافتن فرم
            var form = options.form ||
                       document.getElementById(FORM_ID) ||
                       document.querySelector('form[data-setup-form]') ||
                       document.querySelector('form#setup-form') ||
                       document.querySelector('form#setup-admin-form');

            if (!form) {
                // اگر فرمی در صفحه نیست، ولی صفحه setup-admin است، هشدار بده
                if (options.debug) {
                    console.warn('[setup-admin] فرمی پیدا نشد. آیا data-setup-form دارد؟');
                }
                return;
            }

            bindForm(form);

            _emit(SetupEvents.START, { at: Date.now() });

            STATE.installed = true;
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run);
        } else {
            run();
        }
    }

    function uninstall() {
        if (STATE.form) {
            try { STATE.form.removeEventListener('submit', _handleSubmit); } catch (e) { /* بی‌صدا */ }
        }
        STATE.form = null;
        STATE.installed = false;
    }

    // ─────────────────────────────────────
    // 🔄 ریست راه‌اندازی (خطرناک — فقط دیباگ)
    // ─────────────────────────────────────
    function resetSetup(options) {
        options = options || {};
        if (!options.confirm) return false;
        if (typeof Storage === 'undefined') return false;
        Storage.remove(SETUP_FLAG_KEY);
        return true;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        var users = _loadUsers();
        return {
            installed: STATE.installed,
            submitting: STATE.submitting,
            hasAnyUser: users.length > 0,
            usersCount: users.length,
            setupDone: _isSetupDone(),
            canSetup: !_hasAnyUser() && !_isSetupDone()
        };
    }

    function onChange(cb) {
        if (typeof cb !== 'function') return function () {};
        STATE.listeners.push(cb);
        return function () {
            var idx = STATE.listeners.indexOf(cb);
            if (idx !== -1) STATE.listeners.splice(idx, 1);
        };
    }

    // ─────────────────────────────────────
    // 🌐 API جهانی
    // ─────────────────────────────────────
    var WamSetupAdmin = {
        // ثوابت
        EVENTS: SetupEvents,
        FORM_ID: FORM_ID,
        USERS_KEY: USERS_KEY,
        SETUP_FLAG_KEY: SETUP_FLAG_KEY,
        LOGIN_PAGE: LOGIN_PAGE,

        // نصب
        install: install,
        uninstall: uninstall,

        // فرم
        bindForm: bindForm,

        // ساخت مدیر
        createSuperAdmin: createSuperAdmin,

        // بررسی
        hasAnyUser: _hasAnyUser,
        isSetupDone: _isSetupDone,

        // ریست
        resetSetup: resetSetup,

        // گزارش
        getStatus: getStatus,
        onChange: onChange
    };

    // ثبت جهانی
    window.WamSetupAdmin = WamSetupAdmin;
    window.SetupEvents = SetupEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        // فقط روی صفحه setup-admin نصب کن (اگر data-setup-form یا form#setup دارد)
        var isSetupPage = false;
        try {
            if (document.body) {
                if (document.body.hasAttribute('data-setup-page') ||
                    document.querySelector('form[data-setup-form]') ||
                    document.getElementById(FORM_ID)) {
                    isSetupPage = true;
                }
            }
        } catch (e) { /* بی‌صدا */ }

        if (isSetupPage) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function () { install(); });
            } else {
                install();
            }
        } else {
            // در صفحه setup-admin، منتظر DOM بمان
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function () {
                    if (document.body && (
                        document.body.hasAttribute('data-setup-page') ||
                        document.querySelector('form[data-setup-form]') ||
                        document.getElementById(FORM_ID)
                    )) {
                        install();
                    }
                });
            }
        }
    }

})();