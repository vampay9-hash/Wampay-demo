// ==========================================
// وام پی — Auth & UI Base
// فایل: change-password.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: تغییر رمز عبور کاربر لاگین‌شده + اجبار به تغییر
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var USERS_KEY        = 'wamPayUsers';
    var SESSION_KEY      = 'wamPaySession';
    var TOKEN_KEY        = 'wamPayToken';
    var FORM_ID          = 'wamChangePasswordForm';
    var LOGIN_PAGE       = 'login.html';
    var MIN_LENGTH       = 6;
    var MAX_LENGTH       = 64;

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        form: null,
        submitting: false,
        user: null,
        forced: false,       // آیا تغییر اجباری است؟
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var ChangePwdEvents = {
        START:    'changepwd.start',
        SUBMIT:   'changepwd.submit',
        SUCCESS:  'changepwd.success',
        FAIL:     'changepwd.fail',
        FORCED:   'changepwd.forced',
        CANCEL:   'changepwd.cancel'
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

    function _findCurrentUser() {
        // از WamPermissions اگر هست
        var sessionUser = null;
        if (typeof WamPermissions !== 'undefined') {
            sessionUser = WamPermissions.getCurrentUser();
        }
        if (!sessionUser && typeof Storage !== 'undefined') {
            sessionUser = Storage.getJSON(SESSION_KEY, null);
        }
        if (!sessionUser) return null;

        var id = sessionUser.id || sessionUser.username;
        if (!id) return null;

        var users = _loadUsers();
        for (var i = 0; i < users.length; i++) {
            var u = users[i];
            if (!u) continue;
            if (u.id === id) return u;
            if (u.username && sessionUser.username &&
                u.username === sessionUser.username) return u;
        }
        return null;
    }

    function _hashPassword(plain) {
        if (typeof WamLogin !== 'undefined' && WamLogin.hash) {
            return WamLogin.hash(plain);
        }
        // fallback ساده
        var h = 5381;
        var str = String(plain || '');
        for (var i = 0; i < str.length; i++) {
            h = ((h << 5) + h) + str.charCodeAt(i);
            h = h & 0xffffffff;
        }
        return 'wh1_' + (h >>> 0).toString(16);
    }

    function _verifyPassword(plain, stored) {
        if (!plain || !stored) return false;
        if (_hashPassword(plain) === stored) return true;
        // پشتیبانی از مهاجرت
        if (stored === plain) return true;
        return false;
    }

    // ─────────────────────────────────────
    // 🧾 اعتبارسنجی
    // ─────────────────────────────────────
    function _validate(data) {
        var errors = {};

        if (!data.current || data.current.length === 0) {
            errors.current = 'رمز عبور فعلی را وارد کنید';
        }

        if (!data.newPwd || data.newPwd.length < MIN_LENGTH) {
            errors.newPwd = 'رمز جدید حداقل ' + MIN_LENGTH + ' کاراکتر باشد';
        } else if (data.newPwd.length > MAX_LENGTH) {
            errors.newPwd = 'رمز جدید حداکثر ' + MAX_LENGTH + ' کاراکتر باشد';
        }

        if (data.current && data.newPwd && data.current === data.newPwd) {
            errors.newPwd = 'رمز جدید باید با رمز فعلی متفاوت باشد';
        }

        if (!data.confirm) {
            errors.confirm = 'تکرار رمز جدید را وارد کنید';
        } else if (data.newPwd !== data.confirm) {
            errors.confirm = 'تکرار رمز جدید مطابقت ندارد';
        }

        // بررسی قدرت رمز (اختیاری، سبک)
        if (data.newPwd && data.newPwd.length >= MIN_LENGTH) {
            var strength = _checkStrength(data.newPwd);
            if (strength.score < 2) {
                errors.newPwd = errors.newPwd ||
                    'رمز باید شامل حرف و عدد باشد';
            }
        }

        return errors;
    }

    function _checkStrength(pwd) {
        var score = 0;
        if (!pwd) return { score: 0, label: '—' };
        if (pwd.length >= 8) score++;
        if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
        else if (/[a-zA-Z]/.test(pwd)) score++;
        if (/\d/.test(pwd)) score++;
        if (/[^a-zA-Z0-9]/.test(pwd)) score++;

        var label = 'ضعیف';
        if (score >= 4) label = 'قوی';
        else if (score >= 3) label = 'خوب';
        else if (score >= 2) label = 'متوسط';

        return { score: score, label: label };
    }

    // ─────────────────────────────────────
    // 🎨 نمایش خطا/وضعیت
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

    function _showErrors(errors) {
        _clearErrors();
        if (!errors) return;
        for (var k in errors) {
            if (Object.prototype.hasOwnProperty.call(errors, k)) {
                _setFieldError(k, errors[k]);
            }
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
            btn.textContent = 'در حال تغییر...';
            btn.classList.add('wam-btn--busy');
        } else {
            btn.disabled = false;
            var orig = btn.getAttribute('data-original-text');
            if (orig) btn.textContent = orig;
            btn.classList.remove('wam-btn--busy');
        }
    }

    // ─────────────────────────────────────
    // 📊 نمایش قدرت رمز
    // ─────────────────────────────────────
    function _updateStrength(input) {
        if (!input || !STATE.form) return;
        var bar = STATE.form.querySelector('[data-strength-bar]');
        var label = STATE.form.querySelector('[data-strength-label]');
        if (!bar && !label) return;

        var s = _checkStrength(input.value);
        var pct = Math.min(100, Math.round((s.score / 5) * 100));

        if (bar) {
            bar.style.width = pct + '%';
            bar.setAttribute('data-score', String(s.score));
            bar.classList.remove('strength-0', 'strength-1', 'strength-2',
                                 'strength-3', 'strength-4', 'strength-5');
            bar.classList.add('strength-' + s.score);
        }
        if (label) {
            label.textContent = input.value ? s.label : '';
        }
    }

    // ─────────────────────────────────────
    // 🎯 تغییر رمز عبور
    // ─────────────────────────────────────
    function changePassword(data, options) {
        options = options || {};
        var result = { ok: false, reason: null, errors: null };

        // ۱. کاربر
        var user = STATE.user || _findCurrentUser();
        if (!user) {
            result.reason = 'not_logged_in';
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('ابتدا وارد شوید', 'خطا');
            }
            return result;
        }

        // ۲. اعتبارسنجی
        var errors = _validate(data);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            _emit(ChangePwdEvents.FAIL, { reason: 'validation', errors: errors });
            return result;
        }

        // ۳. بررسی رمز فعلی
        var stored = user.password || user.passwordHash || '';
        if (!_verifyPassword(data.current, stored)) {
            result.reason = 'wrong_current';
            result.errors = { current: 'رمز عبور فعلی اشتباه است' };
            _emit(ChangePwdEvents.FAIL, { reason: 'wrong_current' });
            return result;
        }

        // ۴. هش رمز جدید
        var newHash = _hashPassword(data.newPwd);

        // ۵. به‌روزرسانی کاربر در wamPayUsers
        var users = _loadUsers();
        var found = false;
        for (var i = 0; i < users.length; i++) {
            var u = users[i];
            if (!u) continue;
            if (u.id === user.id || (u.username && u.username === user.username)) {
                users[i].password = newHash;
                users[i].passwordChangedAt = Date.now();
                users[i].mustChangePassword = false;
                users[i].passwordVersion = (u.passwordVersion || 1) + 1;
                found = true;
                break;
            }
        }

        if (!found) {
            result.reason = 'user_not_found';
            return result;
        }

        if (!_saveUsers(users)) {
            result.reason = 'storage_error';
            _emit(ChangePwdEvents.FAIL, { reason: 'storage_error' });
            return result;
        }

        // ۶. به‌روزرسانی STATE.user
        STATE.user = null;

        // ۷. رویداد موفقیت
        result.ok = true;
        _emit(ChangePwdEvents.SUCCESS, {
            userId: user.id,
            username: user.username,
            forced: STATE.forced,
            at: Date.now()
        });

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

        var curEl     = STATE.form.querySelector('[name="current"], [name="currentPassword"], [name="oldPassword"]');
        var newEl     = STATE.form.querySelector('[name="newPwd"], [name="newPassword"], [name="password"]');
        var confirmEl = STATE.form.querySelector('[name="confirm"], [name="confirmPassword"]');

        var data = {
            current:  curEl     ? curEl.value     : '',
            newPwd:   newEl     ? newEl.value     : '',
            confirm:  confirmEl ? confirmEl.value : ''
        };

        _emit(ChangePwdEvents.SUBMIT, { at: Date.now() });

        _setBusy(true);

        setTimeout(function () {
            var res = changePassword(data, { forced: STATE.forced });

            if (!res.ok) {
                _setBusy(false);

                if (res.reason === 'not_logged_in') {
                    if (typeof WamUI !== 'undefined') {
                        WamUI.toastError('لطفاً دوباره وارد شوید', 'خطا');
                    }
                    setTimeout(function () {
                        if (window.location) window.location.replace(LOGIN_PAGE);
                    }, 1200);
                    return;
                }
                if (res.reason === 'storage_error') {
                    if (typeof WamUI !== 'undefined') {
                        WamUI.toastError('خطا در ذخیره‌سازی', 'خطا');
                    }
                    return;
                }
                if (res.errors) _showErrors(res.errors);

                // focus روی فیلد خطادار
                var firstErr = Object.keys(res.errors || {})[0];
                if (firstErr) {
                    var input = STATE.form.querySelector('[name="' + firstErr + '"]');
                    if (input) try { input.focus(); input.select(); } catch (err) { /* بی‌صدا */ }
                }
                return;
            }

            // موفقیت
            if (typeof WamUI !== 'undefined') {
                WamUI.toastSuccess('رمز عبور با موفقیت تغییر کرد', 'موفق');
            }

            // اگر اجباری بود → به خانه نقش
            if (STATE.forced) {
                if (typeof WamUI !== 'undefined') {
                    WamUI.loader.show('وام پی', 'در حال انتقال...');
                }
                setTimeout(function () {
                    if (typeof WamPayGuard !== 'undefined') {
                        var u = WamPermissions.getCurrentUser();
                        var home = u && WamPayGuard.getRoleHome(u.role);
                        window.location.replace(home || LOGIN_PAGE);
                    } else {
                        window.location.replace(LOGIN_PAGE);
                    }
                }, 700);
                return;
            }

            // در غیر این صورت → فرم را خالی کن، دکمه را برگردان
            _setBusy(false);
            if (STATE.form) {
                STATE.form.reset();
                _updateStrength(STATE.form.querySelector('[name="newPwd"], [name="newPassword"]'));
            }

            // رویداد انصراف برای مسیر خروج اختیاری
            setTimeout(function () {
                if (options_wantsBack()) {
                    // کاربر می‌تواند با کلیک بازگردد
                }
            }, 100);
        }, 400);
    }

    function options_wantsBack() { return false; }

    // ─────────────────────────────────────
    // 🚪 انصراف (اگر اجباری نبود)
    // ─────────────────────────────────────
    function cancel() {
        if (STATE.forced) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastWarning('تغییر رمز اجباری است و قابل انصراف نیست', 'توجه');
            }
            return false;
        }
        _emit(ChangePwdEvents.CANCEL, { at: Date.now() });
        if (typeof WamPayGuard !== 'undefined') {
            var u = WamPermissions.getCurrentUser();
            var home = u && WamPayGuard.getRoleHome(u.role);
            if (home) {
                window.location.replace(home);
                return true;
            }
        }
        return false;
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
            // پاک کردن خطای فیلد هنگام تایپ
            inputs[i].addEventListener('input', function () {
                var name = this.getAttribute('name');
                if (name) _setFieldError(name, '');
            });
        }

        // نمایش قدرت رمز جدید
        var newPwd = form.querySelector('[name="newPwd"], [name="newPassword"], [name="password"]');
        if (newPwd) {
            newPwd.addEventListener('input', function () {
                _updateStrength(newPwd);
            });
        }

        // دکمه انصراف
        var cancelBtn = form.querySelector('[data-cancel]');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function (e) {
                e.preventDefault();
                cancel();
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

        // ۱. کاربر لاگین است؟
        STATE.user = _findCurrentUser();
        if (!STATE.user) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('برای تغییر رمز ابتدا وارد شوید', 'خطا');
            }
            if (!options.noRedirect) {
                setTimeout(function () {
                    if (window.location) {
                        window.location.replace(LOGIN_PAGE + '?next=change-password.html');
                    }
                }, 900);
            }
            return;
        }

        // ۲. تغییر اجباری؟
        STATE.forced = !!STATE.user.mustChangePassword;

        var run = function () {
            var form = options.form ||
                       document.getElementById(FORM_ID) ||
                       document.querySelector('form[data-change-password-form]') ||
                       document.querySelector('form#change-password-form') ||
                       document.querySelector('form#password-form');

            if (!form) {
                if (options.debug) {
                    console.warn('[change-password] فرمی پیدا نشد');
                }
                return;
            }

            bindForm(form);

            // اگر اجبار است، به کاربر اطلاع بده و دکمه انصراف را مخفی کن
            if (STATE.forced) {
                _emit(ChangePwdEvents.FORCED, {
                    userId: STATE.user.id,
                    username: STATE.user.username
                });
                var cancelBtn = form.querySelector('[data-cancel]');
                if (cancelBtn) cancelBtn.style.display = 'none';
                var warnEl = document.querySelector('[data-forced-warning]');
                if (warnEl) warnEl.style.display = 'block';
                if (typeof WamUI !== 'undefined') {
                    WamUI.toastWarning(
                        'برای ادامه باید رمز عبور خود را تغییر دهید',
                        'تغییر اجباری رمز'
                    );
                }
            }

            _emit(ChangePwdEvents.START, {
                userId: STATE.user.id,
                username: STATE.user.username,
                forced: STATE.forced,
                at: Date.now()
            });

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
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            submitting: STATE.submitting,
            forced: STATE.forced,
            user: STATE.user ? {
                id: STATE.user.id,
                username: STATE.user.username,
                role: STATE.user.role
            } : null
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
    var WamChangePassword = {
        // ثوابت
        EVENTS: ChangePwdEvents,
        FORM_ID: FORM_ID,
        USERS_KEY: USERS_KEY,
        SESSION_KEY: SESSION_KEY,
        MIN_LENGTH: MIN_LENGTH,
        MAX_LENGTH: MAX_LENGTH,

        // نصب
        install: install,
        uninstall: uninstall,

        // فرم
        bindForm: bindForm,

        // عملیات
        change: changePassword,
        cancel: cancel,

        // بررسی
        getStrength: _checkStrength,
        verify: _verifyPassword,
        hash: _hashPassword,

        // کاربر جاری
        getCurrentUser: function () { return STATE.user; },
        isForced: function () { return STATE.forced; },

        // گزارش
        getStatus: getStatus,
        onChange: onChange
    };

    // ثبت جهانی
    window.WamChangePassword = WamChangePassword;
    window.ChangePwdEvents = ChangePwdEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var runAuto = function () {
            var body = document.body;
            if (!body) return;

            var isPage = body.hasAttribute('data-change-password-page') ||
                         document.getElementById(FORM_ID) ||
                         document.querySelector('form[data-change-password-form]');

            if (isPage) install();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', runAuto);
        } else {
            runAuto();
        }
    }

})();