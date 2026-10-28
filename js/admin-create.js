// ==========================================
// وام پی — Admin Panel
// فایل: admin-create.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: ساخت سریع کاربر جدید توسط ادمین (فرم متمرکز)
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var USERS_KEY    = 'wamPayUsers';
    var BROKERS_KEY  = 'wamPayBrokers';
    var FORM_ID      = 'wamCreateUserForm';

    var ROLE_LABELS = {
        admin:       'ادمین کل',
        verifier:    'اعتبارسنج',
        broker:      'کارگزار',
        applicant:   'متقاضی',
        super_admin: 'مدیر ارشد'
    };

    var ASSIGNABLE_ROLES = ['admin', 'verifier', 'broker', 'applicant'];

    var PWD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

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
    var CreateEvents = {
        START:    'admin.create.start',
        SUBMIT:   'admin.create.submit',
        SUCCESS:  'admin.create.success',
        FAIL:     'admin.create.fail',
        CANCEL:   'admin.create.cancel'
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
    function _escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _formatNumber(n) {
        var s = String(n === null || n === undefined ? 0 : n);
        var fa = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
        return s.replace(/[0-9]/g, function (d) { return fa[+d]; });
    }

    function _generateId() {
        var r = Math.random().toString(36).slice(2, 8);
        return 'u_' + Date.now().toString(36) + '_' + r;
    }

    function _generatePassword(len) {
        len = len || 10;
        var out = '';
        for (var i = 0; i < len; i++) {
            out += PWD_ALPHABET.charAt(Math.floor(Math.random() * PWD_ALPHABET.length));
        }
        return out;
    }

    function _hashPassword(plain) {
        if (typeof WamLogin !== 'undefined' && WamLogin.hash) {
            return WamLogin.hash(plain);
        }
        var h = 5381;
        var str = String(plain || '');
        for (var i = 0; i < str.length; i++) {
            h = ((h << 5) + h) + str.charCodeAt(i);
            h = h & 0xffffffff;
        }
        return 'wh1_' + (h >>> 0).toString(16);
    }

    function _currentUserId() {
        if (typeof WamPermissions === 'undefined') return null;
        var me = WamPermissions.getCurrentUser();
        return me ? me.id : null;
    }

    // ─────────────────────────────────────
    // 🔒 دسترسی
    // ─────────────────────────────────────
    function _canCreate() {
        if (typeof WamPermissions === 'undefined') return false;
        var me = WamPermissions.getCurrentUser();
        if (!me) return false;
        // admin و super_admin می‌توانند کاربر بسازند
        return WamPermissions.isAdmin(me);
    }

    function _canCreateRole(role) {
        if (typeof WamPermissions === 'undefined') return false;
        var me = WamPermissions.getCurrentUser();
        if (!me) return false;

        // فقط super_admin می‌تواند super_admin یا admin بسازد
        if (role === 'super_admin' || role === 'admin') {
            return WamPermissions.isSuperAdmin(me);
        }
        // بقیه نقش‌ها را ادمین هم می‌تواند
        return WamPermissions.isAdmin(me);
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری / ذخیره
    // ─────────────────────────────────────
    function _loadUsers() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(USERS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveUsers(users) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(USERS_KEY, users);
    }

    function _loadBrokers() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(BROKERS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _findByUsername(users, username) {
        if (!username) return null;
        var u = String(username).toLowerCase().trim();
        for (var i = 0; i < users.length; i++) {
            if (users[i] && users[i].username &&
                String(users[i].username).toLowerCase() === u) return users[i];
        }
        return null;
    }

    function _findByMobile(users, mobile) {
        if (!mobile) return null;
        var m = String(mobile).replace(/\D/g, '');
        for (var i = 0; i < users.length; i++) {
            if (users[i] && users[i].mobile &&
                String(users[i].mobile).replace(/\D/g, '') === m) return users[i];
        }
        return null;
    }

    // ─────────────────────────────────────
    // 🧾 اعتبارسنجی
    // ─────────────────────────────────────
    function _validate(data) {
        var errors = {};

        if (!data.name || String(data.name).trim().length < 3) {
            errors.name = 'نام و نام خانوادگی حداقل ۳ کاراکتر باشد';
        } else if (String(data.name).trim().length > 60) {
            errors.name = 'نام حداکثر ۶۰ کاراکتر باشد';
        }

        if (!data.username || String(data.username).trim().length < 3) {
            errors.username = 'نام کاربری حداقل ۳ کاراکتر باشد';
        } else if (!/^[a-zA-Z0-9_\-\.]+$/.test(String(data.username).trim())) {
            errors.username = 'نام کاربری فقط حروف، اعداد، _ - .';
        } else if (String(data.username).trim().length > 30) {
            errors.username = 'نام کاربری حداکثر ۳۰ کاراکتر';
        }

        if (!data.mobile) {
            errors.mobile = 'شماره موبایل الزامی است';
        } else {
            var m = String(data.mobile).replace(/\D/g, '');
            if (!/^09\d{9}$/.test(m)) {
                errors.mobile = 'موبایل باید ۱۱ رقم و با ۰۹ شروع شود';
            }
        }

        if (data.email) {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
                errors.email = 'ایمیل نامعتبر است';
            }
        }

        if (!data.role) {
            errors.role = 'نقش کاربر را انتخاب کنید';
        } else if (ASSIGNABLE_ROLES.indexOf(data.role) === -1 &&
                   data.role !== 'super_admin') {
            errors.role = 'نقش نامعتبر است';
        } else if (!_canCreateRole(data.role)) {
            errors.role = 'اجازه ساخت این نقش را ندارید';
        }

        // اگر رمز دستی داده شده
        if (data.manualPassword) {
            if (!data.password || String(data.password).length < 6) {
                errors.password = 'رمز عبور حداقل ۶ کاراکتر باشد';
            } else if (String(data.password).length > 64) {
                errors.password = 'رمز عبور حداکثر ۶۴ کاراکتر';
            } else if (data.confirm && data.password !== data.confirm) {
                errors.confirm = 'تکرار رمز مطابقت ندارد';
            }
        }

        return errors;
    }

    // ─────────────────────────────────────
    // 🎯 ساخت کاربر
    // ─────────────────────────────────────
    function createUser(data, options) {
        options = options || {};
        var result = { ok: false, reason: null, user: null, errors: null, tempPassword: null };

        // دسترسی
        if (!_canCreate()) {
            result.reason = 'forbidden';
            return result;
        }

        // اعتبارسنجی
        var errors = _validate(data);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        // بارگذاری کاربران فعلی
        var users = _loadUsers();

        // یونیک بودن
        if (_findByUsername(users, data.username)) {
            result.reason = 'duplicate_username';
            result.errors = { username: 'این نام کاربری قبلاً ثبت شده است' };
            return result;
        }
        if (_findByMobile(users, data.mobile)) {
            result.reason = 'duplicate_mobile';
            result.errors = { mobile: 'این موبایل قبلاً ثبت شده است' };
            return result;
        }

        // بررسی نقش
        if (!_canCreateRole(data.role)) {
            result.reason = 'forbidden_role';
            result.errors = { role: 'اجازه ساخت این نقش را ندارید' };
            return result;
        }

        // تعیین رمز
        var tempPassword = null;
        var passwordHash;
        var autoGenerated = false;

        if (data.manualPassword && data.password) {
            passwordHash = _hashPassword(data.password);
        } else {
            tempPassword = _generatePassword(10);
            passwordHash = _hashPassword(tempPassword);
            autoGenerated = true;
        }

        // ساخت کاربر
        var now = Date.now();
        var mobileNorm = String(data.mobile).replace(/\D/g, '');

        var user = {
            id: _generateId(),
            name: String(data.name).trim(),
            username: String(data.username).trim(),
            mobile: mobileNorm,
            email: data.email ? String(data.email).trim() : null,
            nationalCode: data.nationalCode
                ? String(data.nationalCode).trim() : null,
            password: passwordHash,
            role: data.role,
            active: data.active !== false,
            status: data.active === false ? 'inactive' : 'active',
            mustChangePassword: data.mustChangePassword !== false,
            createdAt: now,
            createdBy: _currentUserId(),
            passwordVersion: 1,
            lastLogin: null
        };

        users.push(user);
        if (!_saveUsers(users)) {
            result.reason = 'storage_error';
            return result;
        }

        // اگر کارگزار بود، رکورد کارگزار هم بساز
        if (data.role === 'broker' && options.createBrokerRecord !== false) {
            _createBrokerRecord(user, data);
        }

        result.ok = true;
        result.user = user;
        result.tempPassword = tempPassword;
        result.autoGenerated = autoGenerated;

        _emit(CreateEvents.SUCCESS, {
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role
            },
            tempPassword: tempPassword,
            autoGenerated: autoGenerated,
            at: now
        });

        return result;
    }

    function _createBrokerRecord(user, data) {
        var brokers = _loadBrokers();

        // بررسی تکراری نبودن
        for (var i = 0; i < brokers.length; i++) {
            if (brokers[i] && brokers[i].mobile === user.mobile) return null;
        }

        var codeR = Math.random().toString(36).slice(2, 7).toUpperCase();
        var broker = {
            id: 'br_' + user.id.slice(3),
            brokerCode: 'WP-BR-' + codeR,
            userId: user.id,
            name: user.name,
            mobile: user.mobile,
            email: user.email,
            nationalCode: user.nationalCode || null,
            commissionRate: Number(data.commissionRate) || 0,
            active: user.active,
            status: user.status,
            activeCases: 0,
            createdAt: Date.now(),
            createdBy: _currentUserId(),
            lastActiveAt: null
        };

        brokers.push(broker);
        if (typeof Storage !== 'undefined') {
            Storage.setJSON(BROKERS_KEY, brokers);
        }
        return broker;
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
    // 🎯 هندلر submit
    // ─────────────────────────────────────
    function _handleSubmit(e) {
        if (e) e.preventDefault();
        if (STATE.submitting) return;
        if (!STATE.form) return;

        _clearErrors();

        var form = STATE.form;
        var manualPwd = form.querySelector('[name="manualPassword"]');

        var data = {
            name:    (form.querySelector('[name="name"]') || {}).value || '',
            username: (form.querySelector('[name="username"]') || {}).value || '',
            mobile:  (form.querySelector('[name="mobile"]') || {}).value || '',
            email:   (form.querySelector('[name="email"]') || {}).value || '',
            nationalCode: (form.querySelector('[name="nationalCode"]') || {}).value || '',
            role:    (form.querySelector('[name="role"]') || {}).value || '',
            password: (form.querySelector('[name="password"]') || {}).value || '',
            confirm:  (form.querySelector('[name="confirm"]') || {}).value || '',
            manualPassword: !!(manualPwd && manualPwd.checked),
            mustChangePassword: (function () {
                var el = form.querySelector('[name="mustChangePassword"]');
                return el ? !!el.checked : true;
            })(),
            active: (function () {
                var el = form.querySelector('[name="active"]');
                return el ? !!el.checked : true;
            })(),
            commissionRate: (form.querySelector('[name="commissionRate"]') || {}).value || 0
        };

        data.name = String(data.name).trim();
        data.username = String(data.username).trim();
        data.mobile = String(data.mobile).trim();
        data.email = String(data.email).trim();
        data.nationalCode = String(data.nationalCode).trim();

        _emit(CreateEvents.SUBMIT, {
            username: data.username,
            role: data.role,
            at: Date.now()
        });

        _setBusy(true);

        setTimeout(function () {
            var res = createUser(data);

            if (!res.ok) {
                _setBusy(false);
                _emit(CreateEvents.FAIL, {
                    reason: res.reason,
                    errors: res.errors,
                    at: Date.now()
                });

                if (res.reason === 'forbidden') {
                    if (typeof WamUI !== 'undefined') {
                        WamUI.toastError('دسترسی ندارید', 'خطا');
                    }
                    return;
                }
                if (res.reason === 'storage_error') {
                    if (typeof WamUI !== 'undefined') {
                        WamUI.toastError('خطا در ذخیره‌سازی', 'خطا');
                    }
                    return;
                }
                if (res.errors) _showErrors(res.errors);
                return;
            }

            // ✅ موفق
            STATE.lastCreated = {
                user: res.user,
                tempPassword: res.tempPassword,
                autoGenerated: res.autoGenerated
            };

            _setBusy(false);
            _showSuccessCard(res.user, res.tempPassword, res.autoGenerated);

            if (typeof WamUI !== 'undefined') {
                WamUI.toastSuccess(
                    'کاربر «' + res.user.name + '» ساخته شد',
                    'موفق'
                );
            }

            // پاک کردن فرم
            try { form.reset(); } catch (err) { /* بی‌صدا */ }
        }, 400);
    }

    // ─────────────────────────────────────
    // 🎉 کارت موفقیت
    // ─────────────────────────────────────
    function _showSuccessCard(user, tempPassword, autoGenerated) {
        if (!STATE.root) return;

        var cardBox = STATE.root.querySelector('[data-create="success"]');
        if (!cardBox) return;

        var pwdHtml = '';
        if (autoGenerated && tempPassword) {
            pwdHtml =
                '<div class="wam-create__pwd">' +
                    '<div class="wam-create__pwd-label">🔐 رمز عبور موقت (فقط یکبار نمایش داده می‌شود):</div>' +
                    '<div class="wam-create__pwd-value" data-temp-password>' +
                        _escapeHtml(tempPassword) +
                    '</div>' +
                    '<button type="button" class="wam-btn wam-btn--ghost" data-copy-pwd>' +
                        '📋 کپی رمز' +
                    '</button>' +
                '</div>';
        }

        cardBox.innerHTML =
            '<div class="wam-create__success">' +
                '<div class="wam-create__icon">✅</div>' +
                '<h3>کاربر با موفقیت ساخته شد</h3>' +
                '<div class="wam-create__details">' +
                    '<div><span>نام:</span> <strong>' +
                    _escapeHtml(user.name) + '</strong></div>' +
                    '<div><span>نام کاربری:</span> <code>' +
                    _escapeHtml(user.username) + '</code></div>' +
                    '<div><span>نقش:</span> ' +
                    _escapeHtml(ROLE_LABELS[user.role] || user.role) + '</div>' +
                    '<div><span>موبایل:</span> ' +
                    _escapeHtml(user.mobile) + '</div>' +
                '</div>' +
                pwdHtml +
                '<div class="wam-create__actions">' +
                    '<button type="button" class="wam-btn wam-btn--primary" data-create-again>' +
                        '➕ ساخت کاربر دیگر' +
                    '</button>' +
                    '<button type="button" class="wam-btn wam-btn--ghost" data-goto-users>' +
                        '👥 لیست کاربران' +
                    '</button>' +
                '</div>' +
            '</div>';

        cardBox.style.display = 'block';

        // کپی رمز
        var copyBtn = cardBox.querySelector('[data-copy-pwd]');
        if (copyBtn) {
            copyBtn.addEventListener('click', function () {
                _copyText(tempPassword);
            });
        }

        // دکمه ساخت مجدد
        var againBtn = cardBox.querySelector('[data-create-again]');
        if (againBtn) {
            againBtn.addEventListener('click', function () {
                cardBox.style.display = 'none';
                cardBox.innerHTML = '';
                var nameEl = STATE.form && STATE.form.querySelector('[name="name"]');
                if (nameEl) try { nameEl.focus(); } catch (e) { /* بی‌صدا */ }
            });
        }

        // رفتن به لیست کاربران
        var gotoBtn = cardBox.querySelector('[data-goto-users]');
        if (gotoBtn) {
            gotoBtn.addEventListener('click', function () {
                window.location.href = 'admin-users.html';
            });
        }
    }

    function _copyText(text) {
        if (!text) return;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () {
                    if (typeof WamUI !== 'undefined') {
                        WamUI.toastSuccess('رمز کپی شد', 'موفق');
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
                WamUI.toastSuccess('رمز کپی شد', 'موفق');
            }
        } catch (e) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastWarning('کپی دستی: ' + text, 'توجه', 8000);
            }
        }
    }

    // ─────────────────────────────────────
    // 🎛️ نمایش/مخفی فیلد رمز
    // ─────────────────────────────────────
    function _bindManualPasswordToggle() {
        if (!STATE.form) return;
        var cb = STATE.form.querySelector('[name="manualPassword"]');
        var pwdBox = STATE.form.querySelector('[data-pwd-fields]');
        if (!cb || !pwdBox) return;

        var update = function () {
            pwdBox.style.display = cb.checked ? 'block' : 'none';
        };
        cb.addEventListener('change', update);
        update();
    }

    // ─────────────────────────────────────
    // 🎛️ نمایش/مخفی فیلدهای کارگزار
    // ─────────────────────────────────────
    function _bindRoleChange() {
        if (!STATE.form) return;
        var roleSel = STATE.form.querySelector('[name="role"]');
        var brokerBox = STATE.form.querySelector('[data-broker-fields]');
        if (!roleSel || !brokerBox) return;

        var update = function () {
            brokerBox.style.display = roleSel.value === 'broker' ? 'block' : 'none';
        };
        roleSel.addEventListener('change', update);
        update();
    }

    // ─────────────────────────────────────
    // 🎨 پُر کردن select نقش‌ها
    // ─────────────────────────────────────
    function _fillRoleOptions() {
        if (!STATE.form) return;
        var sel = STATE.form.querySelector('[name="role"]');
        if (!sel) return;

        var me = (typeof WamPermissions !== 'undefined')
            ? WamPermissions.getCurrentUser() : null;
        var isSuper = me && WamPermissions.isSuperAdmin(me);

        var roles = ['applicant', 'broker', 'verifier'];
        if (isSuper) {
            roles = ['admin', 'verifier', 'broker', 'applicant'];
            // super_admin فقط اگر واقعاً لازم است — ولی معمولاً نه
        }

        var html = '<option value="">— انتخاب کنید —</option>';
        for (var i = 0; i < roles.length; i++) {
            var r = roles[i];
            html += '<option value="' + r + '">' +
                    (ROLE_LABELS[r] || r) + '</option>';
        }
        sel.innerHTML = html;
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

        // Enter → submit (به‌جز textarea)
        var inputs = form.querySelectorAll('input');
        for (var i = 0; i < inputs.length; i++) {
            inputs[i].addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    _handleSubmit(e);
                }
            });
            inputs[i].addEventListener('input', function () {
                var name = this.getAttribute('name');
                if (name) _setFieldError(name, '');
            });
        }

        // دکمه انصراف
        var cancelBtn = form.querySelector('[data-cancel]');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function (e) {
                e.preventDefault();
                _emit(CreateEvents.CANCEL, { at: Date.now() });
                try { form.reset(); } catch (err) { /* بی‌صدا */ }
                _clearErrors();
                var nameEl = form.querySelector('[name="name"]');
                if (nameEl) try { nameEl.focus(); } catch (err) { /* بی‌صدا */ }
            });
        }

        // دکمه ساخت رمز تصادفی (اگر manualPassword فعال بود)
        var genBtn = form.querySelector('[data-generate-pwd]');
        if (genBtn) {
            genBtn.addEventListener('click', function (e) {
                e.preventDefault();
                var p = _generatePassword(10);
                var pwdEl = form.querySelector('[name="password"]');
                var confEl = form.querySelector('[name="confirm"]');
                if (pwdEl) pwdEl.value = p;
                if (confEl) confEl.value = p;
                if (typeof WamUI !== 'undefined') {
                    WamUI.toastInfo('رمز تصادفی پر شد', 'موفق');
                }
            });
        }

        _bindManualPasswordToggle();
        _bindRoleChange();
        _fillRoleOptions();

        return true;
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        if (!_canCreate()) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('دسترسی به این بخش ندارید', 'خطا');
            }
            if (typeof WamPayGuard !== 'undefined') {
                var me = (typeof WamPermissions !== 'undefined')
                    ? WamPermissions.getCurrentUser() : null;
                WamPayGuard.redirectToRoleHome(me && me.role);
            }
            return;
        }

        var run = function () {
            var root = options.root ||
                       document.querySelector('[data-create-root]') ||
                       document.querySelector('.wam-create-panel');
            if (!root) {
                if (options.debug) console.warn('[admin-create] root پیدا نشد');
                return;
            }
            STATE.root = root;

            var form = options.form ||
                       document.getElementById(FORM_ID) ||
                       root.querySelector('form[data-create-form]') ||
                       root.querySelector('form#' + FORM_ID);

            if (form) bindForm(form);

            _emit(CreateEvents.START, { at: Date.now() });
            STATE.installed = true;

            if (options.debug) {
                console.log('[admin-create] آماده');
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
            var box = STATE.root.querySelector('[data-create="success"]');
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
            canCreate: _canCreate(),
            lastCreated: STATE.lastCreated ? {
                username: STATE.lastCreated.user.username,
                role: STATE.lastCreated.user.role
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
    var WamAdminCreate = {
        EVENTS: CreateEvents,
        FORM_ID: FORM_ID,
        ROLE_LABELS: ROLE_LABELS,
        ASSIGNABLE_ROLES: ASSIGNABLE_ROLES,

        install: install,
        uninstall: uninstall,
        reset: reset,

        bindForm: bindForm,

        createUser: createUser,

        generatePassword: _generatePassword,
        hashPassword: _hashPassword,

        canCreate: _canCreate,
        canCreateRole: _canCreateRole,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamAdminCreate = WamAdminCreate;
    window.CreateEvents = CreateEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var body = document.body;
            if (!body) return;
            if (body.hasAttribute('data-admin-create') ||
                document.querySelector('[data-create-root]') ||
                document.querySelector('.wam-create-panel')) {
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