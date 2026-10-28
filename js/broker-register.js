// ==========================================
// وام پی — Broker Panel
// فایل: broker-register.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: ثبت‌نام کارگزار — self-service (در انتظار تأیید ادمین)
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var USERS_KEY   = 'wamPayUsers';
    var BROKERS_KEY = 'wamPayBrokers';
    var FORM_ID     = 'wamBrokerRegisterForm';
    var LOGIN_URL   = 'login.html';
    var MIN_PWD     = 6;

    var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var IBAN_REGEX  = /^IR\d{24}$/;

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        form: null,
        submitting: false,
        lastCreated: null,
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var RegEvents = {
        START:      'broker.reg.start',
        SUBMIT:     'broker.reg.submit',
        SUCCESS:    'broker.reg.success',
        FAIL:       'broker.reg.fail',
        DUPLICATE:  'broker.reg.duplicate',
        CANCEL:     'broker.reg.cancel'
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
    function _esc(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _fa(n) {
        var s = String(n === null || n === undefined ? 0 : n);
        return s.replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _en(s) {
        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.toEnglishDigits) {
            return WamPersianDate.toEnglishDigits(s);
        }
        return String(s || '').replace(/[۰-۹]/g, function (d) {
            return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
        });
    }

    function _generateId(prefix) {
        var r = Math.random().toString(36).slice(2, 8);
        return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + r;
    }

    function _generateBrokerCode() {
        var r = Math.random().toString(36).slice(2, 7).toUpperCase();
        return 'WP-BR-' + r;
    }

    function _hashPassword(pwd) {
        if (typeof WamLogin !== 'undefined' && WamLogin.hash) {
            return WamLogin.hash(pwd);
        }
        var h = 5381;
        var str = String(pwd || '');
        for (var i = 0; i < str.length; i++) {
            h = ((h << 5) + h) + str.charCodeAt(i);
            h = h & 0xffffffff;
        }
        return 'wh1_' + (h >>> 0).toString(16);
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری / ذخیره
    // ─────────────────────────────────────
    function _loadUsers() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(USERS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveUsers(list) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(USERS_KEY, list);
    }

    function _loadBrokers() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(BROKERS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveBrokers(list) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(BROKERS_KEY, list);
    }

    function _findUserByUsername(list, username) {
        if (!username) return null;
        var u = String(username).toLowerCase().trim();
        for (var i = 0; i < list.length; i++) {
            if (list[i] && list[i].username &&
                String(list[i].username).toLowerCase() === u) return list[i];
        }
        return null;
    }

    function _findUserByMobile(list, mobile) {
        if (!mobile) return null;
        var m = String(mobile).replace(/\D/g, '');
        for (var i = 0; i < list.length; i++) {
            if (list[i] && list[i].mobile &&
                String(list[i].mobile).replace(/\D/g, '') === m) return list[i];
        }
        return null;
    }

    function _findBrokerByMobile(list, mobile) {
        if (!mobile) return null;
        var m = String(mobile).replace(/\D/g, '');
        for (var i = 0; i < list.length; i++) {
            if (list[i] && list[i].mobile &&
                String(list[i].mobile).replace(/\D/g, '') === m) return list[i];
        }
        return null;
    }

    function _findBrokerByNationalCode(list, code) {
        if (!code) return null;
        var c = String(code).replace(/\D/g, '');
        for (var i = 0; i < list.length; i++) {
            if (list[i] && list[i].nationalCode &&
                String(list[i].nationalCode).replace(/\D/g, '') === c) return list[i];
        }
        return null;
    }

    // ─────────────────────────────────────
    // 🧾 اعتبارسنجی
    // ─────────────────────────────────────
    function _validate(data) {
        var errors = {};

        // نام و نام خانوادگی
        if (!data.name || String(data.name).trim().length < 3) {
            errors.name = 'نام و نام خانوادگی حداقل ۳ کاراکتر باشد';
        } else if (String(data.name).trim().length > 60) {
            errors.name = 'نام حداکثر ۶۰ کاراکتر باشد';
        }

        // نام کاربری
        if (!data.username || String(data.username).trim().length < 3) {
            errors.username = 'نام کاربری حداقل ۳ کاراکتر باشد';
        } else if (!/^[a-zA-Z0-9_\-\.]+$/.test(String(data.username).trim())) {
            errors.username = 'نام کاربری فقط حروف، اعداد، _ - .';
        } else if (String(data.username).trim().length > 30) {
            errors.username = 'نام کاربری حداکثر ۳۰ کاراکتر';
        }

        // موبایل
        if (!data.mobile) {
            errors.mobile = 'موبایل الزامی است';
        } else {
            var m = _en(data.mobile).replace(/\D/g, '');
            if (!/^09\d{9}$/.test(m)) {
                errors.mobile = 'موبایل باید ۱۱ رقم و با ۰۹ شروع شود';
            }
        }

        // کد ملی
        if (!data.nationalCode) {
            errors.nationalCode = 'کد ملی الزامی است';
        } else {
            var c = _en(data.nationalCode).replace(/\D/g, '');
            if (!/^\d{10}$/.test(c)) {
                errors.nationalCode = 'کد ملی باید ۱۰ رقم باشد';
            }
        }

        // ایمیل
        if (data.email && !EMAIL_REGEX.test(String(data.email).trim())) {
            errors.email = 'ایمیل نامعتبر است';
        }

        // شبا (اختیاری ولی اگر داده شده معتبر باشد)
        if (data.iban) {
            var ib = _en(data.iban).replace(/\s/g, '').toUpperCase();
            if (ib && !IBAN_REGEX.test(ib)) {
                errors.iban = 'شبا باید با IR شروع و ۲۴ رقم داشته باشد';
            }
        }

        // کد معرف (اختیاری)
        if (data.referralCode) {
            var rc = String(data.referralCode).trim().toUpperCase();
            if (rc && !/^WP-BR-[A-Z0-9]{5}$/.test(rc)) {
                errors.referralCode = 'کد معرف نامعتبر است';
            }
        }

        // رمز عبور
        if (!data.password || String(data.password).length < MIN_PWD) {
            errors.password = 'رمز عبور حداقل ' + MIN_PWD + ' کاراکتر باشد';
        } else if (String(data.password).length > 64) {
            errors.password = 'رمز عبور حداکثر ۶۴ کاراکتر';
        }

        // تکرار رمز
        if (!data.confirm) {
            errors.confirm = 'تکرار رمز عبور الزامی است';
        } else if (data.password !== data.confirm) {
            errors.confirm = 'تکرار رمز مطابقت ندارد';
        }

        // پذیرش قوانین
        if (!data.agreeTerms) {
            errors.agreeTerms = 'پذیرش قوانین الزامی است';
        }

        return errors;
    }

    // ─────────────────────────────────────
    // 🎯 ثبت‌نام
    // ─────────────────────────────────────
    function register(data, options) {
        options = options || {};
        var result = { ok: false, reason: null, broker: null, user: null, errors: null };

        // اعتبارسنجی
        var errors = _validate(data);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        var users = _loadUsers();
        var brokers = _loadBrokers();

        var mobileNorm = _en(data.mobile).replace(/\D/g, '');
        var ncNorm = _en(data.nationalCode).replace(/\D/g, '');

        // بررسی تکراری بودن نام کاربری
        if (_findUserByUsername(users, data.username)) {
            result.reason = 'duplicate_username';
            result.errors = { username: 'این نام کاربری قبلاً ثبت شده است' };
            return result;
        }

        // بررسی تکراری بودن موبایل کاربر
        if (_findUserByMobile(users, mobileNorm)) {
            result.reason = 'duplicate_mobile';
            result.errors = { mobile: 'این موبایل قبلاً در سیستم ثبت شده است' };
            return result;
        }

        // بررسی تکراری بودن موبایل کارگزار
        if (_findBrokerByMobile(brokers, mobileNorm)) {
            result.reason = 'duplicate_broker_mobile';
            result.errors = { mobile: 'این موبایل قبلاً به عنوان کارگزار ثبت شده است' };
            return result;
        }

        // بررسی تکراری بودن کد ملی
        if (_findBrokerByNationalCode(brokers, ncNorm)) {
            result.reason = 'duplicate_national_code';
            result.errors = { nationalCode: 'این کد ملی قبلاً ثبت شده است' };
            return result;
        }

        // بررسی کد معرف (اختیاری)
        var referredBy = null;
        if (data.referralCode) {
            var rc = String(data.referralCode).trim().toUpperCase();
            for (var i = 0; i < brokers.length; i++) {
                if (brokers[i] && brokers[i].brokerCode === rc) {
                    referredBy = brokers[i].id;
                    break;
                }
            }
            if (!referredBy) {
                result.reason = 'invalid_referral';
                result.errors = { referralCode: 'کد معرف یافت نشد' };
                return result;
            }
        }

        var now = Date.now();
        var brokerId = _generateId('br');
        var brokerCode = _generateBrokerCode();

        // ۱. ساخت کاربر (pending)
        var user = {
            id: _generateId('u'),
            name: String(data.name).trim(),
            username: String(data.username).trim(),
            mobile: mobileNorm,
            email: data.email ? String(data.email).trim() : null,
            nationalCode: ncNorm,
            password: _hashPassword(data.password),
            role: 'broker',
            brokerId: brokerId,
            active: false,                        // ⚠️ غیرفعال تا تأیید ادمین
            status: 'pending',
            mustChangePassword: false,
            createdAt: now,
            createdBy: 'self-register',
            passwordVersion: 1,
            lastLogin: null,
            source: 'broker-register'
        };

        users.push(user);
        if (!_saveUsers(users)) {
            result.reason = 'storage_error';
            return result;
        }

        // ۲. ساخت کارگزار (pending)
        var broker = {
            id: brokerId,
            brokerCode: brokerCode,
            userId: user.id,
            name: user.name,
            mobile: mobileNorm,
            email: user.email,
            nationalCode: ncNorm,
            address: data.address ? String(data.address).trim() : null,
            city: data.city ? String(data.city).trim() : null,
            province: data.province ? String(data.province).trim() : null,
            bankAccount: data.bankAccount ? String(data.bankAccount).trim() : null,
            iban: data.iban ? _en(data.iban).replace(/\s/g, '').toUpperCase() : null,
            workExperience: data.workExperience || null,
            referralCode: data.referralCode || null,
            referredBy: referredBy,
            commissionRate: 0,
            notes: data.notes ? String(data.notes).trim() : null,
            active: false,                        // ⚠️ غیرفعال تا تأیید ادمین
            status: 'pending',
            activeCases: 0,
            createdAt: now,
            createdBy: 'self-register',
            lastActiveAt: null,
            approvalStatus: 'pending',
            approvalRequestedAt: now
        };

        brokers.push(broker);
        if (!_saveBrokers(brokers)) {
            // rollback
            users.pop();
            _saveUsers(users);
            result.reason = 'storage_error';
            return result;
        }

        result.ok = true;
        result.broker = broker;
        result.user = {
            id: user.id,
            username: user.username,
            name: user.name,
            role: 'broker',
            status: 'pending'
        };

        _emit(RegEvents.SUCCESS, {
            broker: {
                id: broker.id,
                brokerCode: broker.brokerCode,
                name: broker.name
            },
            user: {
                id: user.id,
                username: user.username
            },
            at: now
        });

        return result;
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
            btn.setAttribute('data-orig', btn.textContent);
            btn.textContent = 'در حال ارسال...';
        } else {
            btn.disabled = false;
            var o = btn.getAttribute('data-orig');
            if (o) btn.textContent = o;
        }
    }

    // ─────────────────────────────────────
    // 🎉 کارت موفقیت
    // ─────────────────────────────────────
    function _showSuccessCard(root, broker, user) {
        if (!root) return;

        var box = root.querySelector('[data-reg="success"]') || root;
        box.innerHTML =
            '<div class="wam-reg-success">' +
                '<div class="wam-reg-success__icon">✅</div>' +
                '<h3>ثبت‌نام شما با موفقیت ارسال شد</h3>' +
                '<p>درخواست شما در انتظار <strong>تأیید ادمین</strong> است. ' +
                'پس از تأیید، می‌توانید با اطلاعات زیر وارد شوید:</p>' +
                '<div class="wam-reg-success__details">' +
                    '<div><span>نام کاربری:</span> <code>' +
                    _esc(user.username) + '</code></div>' +
                    '<div><span>کد کارگزار:</span> <code>' +
                    _esc(broker.brokerCode) + '</code></div>' +
                    '<div><span>وضعیت:</span> ' +
                    '<span class="wam-badge wam-badge--pending">' +
                    'در انتظار تأیید</span></div>' +
                '</div>' +
                '<div class="wam-reg-success__note">' +
                    '⚠️ لطفاً کد کارگزار خود را نزد خود نگه دارید. ' +
                    'پس از تأیید ادمین، می‌توانید وارد پنل کارگزار شوید.' +
                '</div>' +
                '<div class="wam-reg-success__actions">' +
                    '<a class="wam-btn wam-btn--primary" href="' +
                    LOGIN_URL + '">ورود به حساب</a>' +
                    '<button type="button" class="wam-btn wam-btn--ghost" ' +
                    'data-reg-action="copy-code">📋 کپی کد کارگزار</button>' +
                '</div>' +
            '</div>';

        // بایند کپی
        var copyBtn = box.querySelector('[data-reg-action="copy-code"]');
        if (copyBtn) {
            copyBtn.addEventListener('click', function () {
                _copyText(broker.brokerCode);
            });
        }
    }

    function _copyText(text) {
        if (!text) return;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () {
                    if (typeof WamUI !== 'undefined') {
                        WamUI.toastSuccess('کد کپی شد', 'موفق');
                    }
                });
                return;
            }
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            if (typeof WamUI !== 'undefined') {
                WamUI.toastSuccess('کد کپی شد', 'موفق');
            }
        } catch (e) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastWarning('کپی دستی: ' + text, 'توجه', 8000);
            }
        }
    }

    // ─────────────────────────────────────
    // 🎯 هندلر submit
    // ─────────────────────────────────────
    function _handleSubmit(e) {
        if (e) e.preventDefault();
        if (STATE.submitting) return;
        if (!STATE.form) return;

        _clearErrors();

        var form = STATE.form;
        var data = {
            name:         (form.querySelector('[name="name"]') || {}).value || '',
            username:     (form.querySelector('[name="username"]') || {}).value || '',
            mobile:       (form.querySelector('[name="mobile"]') || {}).value || '',
            nationalCode: (form.querySelector('[name="nationalCode"]') || {}).value || '',
            email:        (form.querySelector('[name="email"]') || {}).value || '',
            province:     (form.querySelector('[name="province"]') || {}).value || '',
            city:         (form.querySelector('[name="city"]') || {}).value || '',
            address:      (form.querySelector('[name="address"]') || {}).value || '',
            bankAccount:  (form.querySelector('[name="bankAccount"]') || {}).value || '',
            iban:         (form.querySelector('[name="iban"]') || {}).value || '',
            workExperience: (form.querySelector('[name="workExperience"]') || {}).value || '',
            referralCode: (form.querySelector('[name="referralCode"]') || {}).value || '',
            notes:        (form.querySelector('[name="notes"]') || {}).value || '',
            password:     (form.querySelector('[name="password"]') || {}).value || '',
            confirm:      (form.querySelector('[name="confirm"]') || {}).value || '',
            agreeTerms:   !!(form.querySelector('[name="agreeTerms"]') || {}).checked
        };

        _emit(RegEvents.SUBMIT, { username: data.username, at: Date.now() });

        _setBusy(true);

        setTimeout(function () {
            var res = register(data);

            if (!res.ok) {
                _setBusy(false);
                _emit(RegEvents.FAIL, {
                    reason: res.reason,
                    errors: res.errors,
                    at: Date.now()
                });

                if (res.reason === 'storage_error') {
                    if (typeof WamUI !== 'undefined') {
                        WamUI.toastError('خطا در ذخیره‌سازی', 'خطا');
                    }
                    return;
                }
                if (res.reason === 'duplicate_mobile' ||
                    res.reason === 'duplicate_broker_mobile') {
                    _emit(RegEvents.DUPLICATE, { reason: res.reason });
                }
                if (res.errors) _showErrors(res.errors);

                if (typeof WamUI !== 'undefined') {
                    WamUI.toastError('لطفاً خطاها را برطرف کنید', 'خطا');
                }
                return;
            }

            // ✅ موفق
            STATE.lastCreated = {
                broker: res.broker,
                user: res.user
            };

            if (typeof WamUI !== 'undefined') {
                WamUI.toastSuccess(
                    'ثبت‌نام ارسال شد. در انتظار تأیید ادمین.',
                    'موفق'
                );
            }

            _showSuccessCard(STATE.root, res.broker, res.user);
        }, 400);
    }

    // ─────────────────────────────────────
    // 📌 بایند فرم
    // ─────────────────────────────────────
    function bindForm(form) {
        if (!form) return false;
        if (STATE.form === form) return true;
        if (STATE.form) {
            try { STATE.form.removeEventListener('submit', _handleSubmit); }
            catch (e) { /* بی‌صدا */ }
        }
        STATE.form = form;
        form.addEventListener('submit', _handleSubmit);

        var inputs = form.querySelectorAll('input, select, textarea');
        for (var i = 0; i < inputs.length; i++) {
            // Enter
            if (inputs[i].tagName !== 'TEXTAREA') {
                inputs[i].addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        _handleSubmit(e);
                    }
                });
            }
            // پاک کردن خطا
            inputs[i].addEventListener('input', function () {
                var n = this.getAttribute('name');
                if (n) _setFieldError(n, '');
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

        // کاربر نباید لاگین باشد (ثبت‌نام فقط برای مهمان‌ها)
        var me = (typeof WamPermissions !== 'undefined')
            ? WamPermissions.getCurrentUser() : null;
        if (me && me.role && options.allowLoggedIn !== true) {
            // اگر لاگین است، به پنل خودش برود
            if (typeof WamPayGuard !== 'undefined' && !options.noRedirect) {
                var home = WamPayGuard.getRoleHome(me.role);
                if (home) {
                    window.location.replace(home);
                    return;
                }
            }
        }

        var run = function () {
            var root = options.root ||
                       document.querySelector('[data-broker-register-root]') ||
                       document.querySelector('.wam-broker-register-page');
            if (root) STATE.root = root;

            var form = options.form ||
                       document.getElementById(FORM_ID) ||
                       document.querySelector('form[data-broker-register-form]') ||
                       document.querySelector('form#broker-register-form');

            if (form) bindForm(form);

            STATE.installed = true;
            _emit(RegEvents.START, { at: Date.now() });

            if (options.debug) {
                console.log('[broker-register] آماده');
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run);
        } else {
            run();
        }
    }

    function uninstall() {
        if (STATE.form) {
            try { STATE.form.removeEventListener('submit', _handleSubmit); }
            catch (e) { /* بی‌صدا */ }
        }
        STATE.form = null;
        STATE.root = null;
        STATE.installed = false;
    }

    function reset() {
        if (STATE.form) {
            try { STATE.form.reset(); } catch (e) { /* بی‌صدا */ }
        }
        _clearErrors();
        if (STATE.root) {
            var box = STATE.root.querySelector('[data-reg="success"]');
            if (box) { box.innerHTML = ''; box.style.display = 'none'; }
        }
        STATE.lastCreated = null;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            submitting: STATE.submitting,
            hasForm: !!STATE.form,
            lastCreated: STATE.lastCreated ? {
                brokerCode: STATE.lastCreated.broker.brokerCode,
                username: STATE.lastCreated.user.username
            } : null
        };
    }

    function onChange(cb) {
        if (typeof cb !== 'function') return function () {};
        STATE.listeners.push(cb);
        return function () {
            var i = STATE.listeners.indexOf(cb);
            if (i !== -1) STATE.listeners.splice(i, 1);
        };
    }

    // ─────────────────────────────────────
    // 🌐 API جهانی
    // ─────────────────────────────────────
    var WamBrokerRegister = {
        EVENTS: RegEvents,
        FORM_ID: FORM_ID,
        USERS_KEY: USERS_KEY,
        BROKERS_KEY: BROKERS_KEY,
        LOGIN_URL: LOGIN_URL,
        MIN_PWD: MIN_PWD,

        install: install,
        uninstall: uninstall,
        bindForm: bindForm,
        reset: reset,

        register: register,
        validate: _validate,

        loadUsers: _loadUsers,
        loadBrokers: _loadBrokers,

        generateBrokerCode: _generateBrokerCode,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamBrokerRegister = WamBrokerRegister;
    window.BrokerRegisterEvents = RegEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var body = document.body;
            if (!body) return;
            if (body.hasAttribute('data-broker-register-page') ||
                document.querySelector('[data-broker-register-root]') ||
                document.querySelector('.wam-broker-register-page') ||
                document.getElementById(FORM_ID) ||
                document.querySelector('form[data-broker-register-form]')) {
                install();
            }
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _auto);
        } else {
            _auto();
        }
    }

})();