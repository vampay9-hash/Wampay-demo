// ==========================================
// وام پی — Broker Panel
// فایل: broker-profile.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: پروفایل کارگزار — نمایش، ویرایش، تغییر رمز
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var BROKERS_KEY = 'wamPayBrokers';
    var USERS_KEY   = 'wamPayUsers';
    var FORM_ID     = 'wamBrokerProfileForm';
    var PWD_FORM_ID = 'wamBrokerPwdForm';

    var IBAN_REGEX  = /^IR\d{24}$/;
    var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var MIN_PWD     = 6;

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        form: null,
        pwdForm: null,
        broker: null,
        currentUser: null,
        editing: false,
        submitting: false,
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var ProfileEvents = {
        LOADED:       'broker.profile.loaded',
        UPDATED:      'broker.profile.updated',
        PWD_CHANGED:  'broker.profile.pwd_changed',
        EDIT_START:   'broker.profile.edit_start',
        EDIT_CANCEL:  'broker.profile.edit_cancel',
        FAIL:         'broker.profile.fail'
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

    function _relativeTime(ts) {
        if (!ts) return '—';
        var d = Date.now() - ts;
        var s = Math.floor(d / 1000);
        if (s < 60) return 'همین الان';
        var m = Math.floor(s / 60);
        if (m < 60) return _formatNumber(m) + ' دقیقه پیش';
        var h = Math.floor(m / 60);
        if (h < 24) return _formatNumber(h) + ' ساعت پیش';
        var day = Math.floor(h / 24);
        if (day < 30) return _formatNumber(day) + ' روز پیش';
        return _formatNumber(Math.floor(day / 30)) + ' ماه پیش';
    }

    function _jalali(ts) {
        if (!ts) return '—';
        try {
            if (typeof WamPersianDate !== 'undefined') {
                var d = new Date(ts);
                var j = WamPersianDate.dateToJalali(d);
                if (j) return WamPersianDate.format(j.jy, j.jm, j.jd, 'YYYY/MM/DD');
            }
        } catch (e) { /* بی‌صدا */ }
        return new Date(ts).toLocaleDateString('fa-IR');
    }

    function _toEnglish(str) {
        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.toEnglishDigits) {
            return WamPersianDate.toEnglishDigits(str);
        }
        return String(str || '').replace(/[۰-۹]/g, function (d) {
            return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
        });
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

    function _verifyPassword(plain, stored) {
        if (!plain || !stored) return false;
        return _hashPassword(plain) === stored || stored === plain;
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری / ذخیره
    // ─────────────────────────────────────
    function _loadBrokers() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(BROKERS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveBrokers(brokers) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(BROKERS_KEY, brokers);
    }

    function _loadUsers() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(USERS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveUsers(users) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(USERS_KEY, users);
    }

    function _loadCurrentBroker() {
        if (typeof WamPermissions === 'undefined') return null;
        var user = WamPermissions.getCurrentUser();
        if (!user) return null;
        STATE.currentUser = user;

        var brokers = _loadBrokers();
        for (var i = 0; i < brokers.length; i++) {
            var b = brokers[i];
            if (!b) continue;
            if (b.userId && b.userId === user.id) return b;
            if (b.mobile && user.mobile &&
                String(b.mobile).replace(/\D/g, '') ===
                String(user.mobile).replace(/\D/g, '')) return b;
        }
        return null;
    }

    // ─────────────────────────────────────
    // 🧾 اعتبارسنجی
    // ─────────────────────────────────────
    function _validateProfile(data) {
        var errors = {};

        if (!data.name || String(data.name).trim().length < 3) {
            errors.name = 'نام و نام خانوادگی حداقل ۳ کاراکتر باشد';
        } else if (String(data.name).trim().length > 60) {
            errors.name = 'نام حداکثر ۶۰ کاراکتر باشد';
        }

        if (!data.mobile) {
            errors.mobile = 'موبایل الزامی است';
        } else {
            var m = _toEnglish(data.mobile).replace(/\D/g, '');
            if (!/^09\d{9}$/.test(m)) {
                errors.mobile = 'موبایل باید ۱۱ رقم و با ۰۹ شروع شود';
            }
        }

        if (data.email && !EMAIL_REGEX.test(String(data.email).trim())) {
            errors.email = 'ایمیل نامعتبر است';
        }

        if (data.nationalCode) {
            var c = _toEnglish(data.nationalCode).replace(/\D/g, '');
            if (c && !/^\d{10}$/.test(c)) {
                errors.nationalCode = 'کد ملی باید ۱۰ رقم باشد';
            }
        }

        if (data.iban) {
            var ib = _toEnglish(data.iban).replace(/\s/g, '').toUpperCase();
            if (ib && !IBAN_REGEX.test(ib)) {
                errors.iban = 'شبا باید با IR شروع و ۲۴ رقم داشته باشد';
            }
        }

        return errors;
    }

    function _validatePassword(data) {
        var errors = {};
        if (!data.current || data.current.length === 0) {
            errors.current = 'رمز فعلی را وارد کنید';
        }
        if (!data.newPwd || String(data.newPwd).length < MIN_PWD) {
            errors.newPwd = 'رمز جدید حداقل ' + MIN_PWD + ' کاراکتر باشد';
        } else if (String(data.newPwd).length > 64) {
            errors.newPwd = 'رمز جدید حداکثر ۶۴ کاراکتر';
        }
        if (data.current && data.newPwd && data.current === data.newPwd) {
            errors.newPwd = 'رمز جدید باید با رمز فعلی متفاوت باشد';
        }
        if (!data.confirm) {
            errors.confirm = 'تکرار رمز را وارد کنید';
        } else if (data.newPwd !== data.confirm) {
            errors.confirm = 'تکرار رمز مطابقت ندارد';
        }
        return errors;
    }

    // ─────────────────────────────────────
    // 🎯 به‌روزرسانی پروفایل
    // ─────────────────────────────────────
    function updateProfile(data, options) {
        options = options || {};
        var result = { ok: false, reason: null, broker: null, errors: null };

        if (!STATE.broker) {
            result.reason = 'no_broker';
            return result;
        }

        var errors = _validateProfile(data);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        // بررسی تکراری بودن موبایل
        var brokers = _loadBrokers();
        var newMobile = _toEnglish(data.mobile).replace(/\D/g, '');
        for (var i = 0; i < brokers.length; i++) {
            var b = brokers[i];
            if (!b || b.id === STATE.broker.id) continue;
            if (b.mobile && String(b.mobile).replace(/\D/g, '') === newMobile) {
                result.reason = 'duplicate_mobile';
                result.errors = { mobile: 'این موبایل قبلاً ثبت شده است' };
                return result;
            }
        }

        // به‌روزرسانی
        var prevMobile = STATE.broker.mobile;
        var now = Date.now();

        var patch = {
            name: String(data.name).trim(),
            mobile: newMobile,
            email: data.email ? String(data.email).trim() : null,
            nationalCode: data.nationalCode
                ? _toEnglish(data.nationalCode).replace(/\D/g, '') : null,
            bankAccount: data.bankAccount ? String(data.bankAccount).trim() : null,
            iban: data.iban
                ? _toEnglish(data.iban).replace(/\s/g, '').toUpperCase() : null,
            address: data.address ? String(data.address).trim() : null,
            notes: data.notes ? String(data.notes).trim() : null,
            updatedAt: now
        };

        // اعمال روی broker
        for (var key in patch) {
            if (Object.prototype.hasOwnProperty.call(patch, key)) {
                STATE.broker[key] = patch[key];
            }
        }

        if (!_saveBrokers(brokers)) {
            result.reason = 'storage_error';
            return result;
        }

        // به‌روزرسانی کاربر متناظر
        _syncUserProfile(newMobile, prevMobile, data);

        // به‌روزرسانی کاربر جاری در session
        if (typeof WamPermissions !== 'undefined') {
            var u = WamPermissions.getCurrentUser();
            if (u) {
                u.name = String(data.name).trim();
                u.mobile = newMobile;
                u.email = patch.email;
                WamPermissions.setCurrentUser(u);
            }
        }

        result.ok = true;
        result.broker = STATE.broker;

        _emit(ProfileEvents.UPDATED, {
            broker: {
                id: STATE.broker.id,
                brokerCode: STATE.broker.brokerCode,
                name: STATE.broker.name
            },
            at: now
        });

        return result;
    }

    function _syncUserProfile(newMobile, prevMobile, data) {
        var users = _loadUsers();
        var user = STATE.currentUser;
        if (!user) return;

        for (var i = 0; i < users.length; i++) {
            var u = users[i];
            if (!u) continue;
            if (u.id === user.id ||
                (prevMobile && u.mobile &&
                 String(u.mobile).replace(/\D/g, '') ===
                 String(prevMobile).replace(/\D/g, ''))) {
                u.name = String(data.name).trim();
                u.mobile = newMobile;
                u.email = data.email ? String(data.email).trim() : null;
                u.updatedAt = Date.now();
                _saveUsers(users);
                return;
            }
        }
    }

    // ─────────────────────────────────────
    // 🔑 تغییر رمز عبور
    // ─────────────────────────────────────
    function changePassword(data) {
        var result = { ok: false, reason: null, errors: null };

        if (!STATE.currentUser) {
            result.reason = 'not_logged_in';
            return result;
        }

        var errors = _validatePassword(data);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        // یافتن کاربر کامل
        var users = _loadUsers();
        var foundIdx = -1;
        for (var i = 0; i < users.length; i++) {
            if (users[i] && users[i].id === STATE.currentUser.id) {
                foundIdx = i;
                break;
            }
        }
        if (foundIdx === -1) {
            result.reason = 'user_not_found';
            return result;
        }

        var user = users[foundIdx];
        if (!_verifyPassword(data.current, user.password)) {
            result.reason = 'wrong_current';
            result.errors = { current: 'رمز فعلی اشتباه است' };
            return result;
        }

        user.password = _hashPassword(data.newPwd);
        user.passwordVersion = (user.passwordVersion || 1) + 1;
        user.passwordChangedAt = Date.now();
        user.mustChangePassword = false;

        if (!_saveUsers(users)) {
            result.reason = 'storage_error';
            return result;
        }

        result.ok = true;
        _emit(ProfileEvents.PWD_CHANGED, {
            userId: user.id,
            at: Date.now()
        });
        return result;
    }

    // ─────────────────────────────────────
    // 🎨 نمایش خطاها
    // ─────────────────────────────────────
    function _setFieldError(form, field, message) {
        if (!form) return;
        var el = form.querySelector('[data-error="' + field + '"]');
        if (el) {
            el.textContent = message || '';
            el.style.display = message ? 'block' : 'none';
        }
        var input = form.querySelector('[name="' + field + '"]');
        if (input) {
            if (message) input.classList.add('wam-input--error');
            else input.classList.remove('wam-input--error');
        }
    }

    function _clearErrors(form) {
        if (!form) return;
        var errs = form.querySelectorAll('[data-error]');
        for (var i = 0; i < errs.length; i++) {
            errs[i].textContent = '';
            errs[i].style.display = 'none';
        }
        var inputs = form.querySelectorAll('.wam-input--error');
        for (var j = 0; j < inputs.length; j++) {
            inputs[j].classList.remove('wam-input--error');
        }
    }

    function _showErrors(form, errors) {
        _clearErrors(form);
        if (!errors) return;
        for (var k in errors) {
            if (Object.prototype.hasOwnProperty.call(errors, k)) {
                _setFieldError(form, k, errors[k]);
            }
        }
    }

    // ─────────────────────────────────────
    // 🎨 رندر فرم پروفایل
    // ─────────────────────────────────────
    function _renderProfileForm() {
        var b = STATE.broker || {};
        var disabled = STATE.editing ? '' : ' disabled';

        return '' +
            '<form id="' + FORM_ID + '" class="wam-profile-form">' +
                '<div class="wam-field"><label>نام و نام خانوادگی *</label>' +
                    '<input name="name" value="' + _escapeHtml(b.name || '') +
                    '"' + disabled + '>' +
                    '<div class="wam-field__error" data-error="name"></div></div>' +

                '<div class="wam-field"><label>کد کارگزار</label>' +
                    '<input value="' + _escapeHtml(b.brokerCode || '—') +
                    '" readonly disabled></div>' +

                '<div class="wam-field"><label>موبایل *</label>' +
                    '<input name="mobile" type="tel" value="' +
                    _escapeHtml(b.mobile || '') + '"' + disabled + '>' +
                    '<div class="wam-field__error" data-error="mobile"></div></div>' +

                '<div class="wam-field"><label>ایمیل</label>' +
                    '<input name="email" type="email" value="' +
                    _escapeHtml(b.email || '') + '"' + disabled + '>' +
                    '<div class="wam-field__error" data-error="email"></div></div>' +

                '<div class="wam-field"><label>کد ملی</label>' +
                    '<input name="nationalCode" inputmode="numeric" maxlength="10" ' +
                    'value="' + _escapeHtml(b.nationalCode || '') + '"' + disabled + '>' +
                    '<div class="wam-field__error" data-error="nationalCode"></div></div>' +

                '<div class="wam-field"><label>درصد پورسانت</label>' +
                    '<input value="' + _escapeHtml(String(b.commissionRate || 0)) +
                    '٪" readonly disabled></div>' +

                '<div class="wam-field"><label>شماره حساب</label>' +
                    '<input name="bankAccount" value="' +
                    _escapeHtml(b.bankAccount || '') + '"' + disabled + '></div>' +

                '<div class="wam-field"><label>شبا</label>' +
                    '<input name="iban" value="' + _escapeHtml(b.iban || '') +
                    '" placeholder="IR..."' + disabled + '>' +
                    '<div class="wam-field__error" data-error="iban"></div></div>' +

                '<div class="wam-field"><label>آدرس</label>' +
                    '<textarea name="address" rows="2"' + disabled + '>' +
                    _escapeHtml(b.address || '') + '</textarea></div>' +

                '<div class="wam-field"><label>یادداشت (اختیاری)</label>' +
                    '<textarea name="notes" rows="2"' + disabled + '>' +
                    _escapeHtml(b.notes || '') + '</textarea></div>' +

                '<div class="wam-field__error" data-error="general"></div>' +
            '</form>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر فرم رمز
    // ─────────────────────────────────────
    function _renderPasswordForm() {
        return '' +
            '<form id="' + PWD_FORM_ID + '" class="wam-profile-form">' +
                '<div class="wam-field"><label>رمز فعلی *</label>' +
                    '<input name="current" type="password" autocomplete="current-password">' +
                    '<div class="wam-field__error" data-error="current"></div></div>' +

                '<div class="wam-field"><label>رمز جدید *</label>' +
                    '<input name="newPwd" type="password" autocomplete="new-password">' +
                    '<div class="wam-field__error" data-error="newPwd"></div></div>' +

                '<div class="wam-field"><label>تکرار رمز جدید *</label>' +
                    '<input name="confirm" type="password" autocomplete="new-password">' +
                    '<div class="wam-field__error" data-error="confirm"></div></div>' +

                '<div class="wam-field__error" data-error="general"></div>' +

                '<button type="submit" class="wam-btn wam-btn--primary">' +
                    'تغییر رمز عبور</button>' +
            '</form>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر کامل
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;

        var b = STATE.broker;
        if (!b) {
            STATE.root.innerHTML =
                '<div class="wam-empty">اطلاعات کارگزار یافت نشد.</div>';
            return;
        }

        var html =
            '<div class="wam-broker-profile">' +
                '<section class="wam-broker-section">' +
                    '<header class="wam-broker-section__head">' +
                        '<h3>👤 پروفایل من</h3>' +
                        '<div class="wam-profile-actions">' +
                            (STATE.editing
                                ? '<button class="wam-btn wam-btn--ghost" ' +
                                  'data-profile-action="cancel">انصراف</button>' +
                                  '<button class="wam-btn wam-btn--primary" ' +
                                  'data-profile-action="save">💾 ذخیره</button>'
                                : '<button class="wam-btn wam-btn--primary" ' +
                                  'data-profile-action="edit">✏️ ویرایش</button>') +
                        '</div>' +
                    '</header>' +
                    '<div class="wam-profile-meta">' +
                        '<div><span>عضویت:</span> ' + _escapeHtml(_jalali(b.createdAt)) + '</div>' +
                        '<div><span>آخرین به‌روزرسانی:</span> ' +
                        _escapeHtml(_relativeTime(b.updatedAt || b.createdAt)) + '</div>' +
                    '</div>' +
                    _renderProfileForm() +
                '</section>' +

                '<section class="wam-broker-section">' +
                    '<h3>🔑 تغییر رمز عبور</h3>' +
                    _renderPasswordForm() +
                '</section>' +
            '</div>';

        STATE.root.innerHTML = html;

        STATE.form = STATE.root.querySelector('#' + FORM_ID);
        STATE.pwdForm = STATE.root.querySelector('#' + PWD_FORM_ID);

        _bindActions();
        _bindProfileForm();
        _bindPasswordForm();
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindActions() {
        if (!STATE.root) return;
        var btns = STATE.root.querySelectorAll('[data-profile-action]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', _handleAction);
        }
    }

    function _handleAction(e) {
        e.preventDefault();
        var action = this.getAttribute('data-profile-action');

        if (action === 'edit') {
            STATE.editing = true;
            render();
            _emit(ProfileEvents.EDIT_START, { at: Date.now() });
            return;
        }
        if (action === 'cancel') {
            STATE.editing = false;
            render();
            _emit(ProfileEvents.EDIT_CANCEL, { at: Date.now() });
            return;
        }
        if (action === 'save') {
            _submitProfile();
            return;
        }
    }

    function _submitProfile() {
        if (!STATE.form) return;
        _clearErrors(STATE.form);

        var form = STATE.form;
        var data = {
            name: form.querySelector('[name="name"]').value.trim(),
            mobile: form.querySelector('[name="mobile"]').value.trim(),
            email: form.querySelector('[name="email"]').value.trim(),
            nationalCode: form.querySelector('[name="nationalCode"]').value.trim(),
            bankAccount: form.querySelector('[name="bankAccount"]').value.trim(),
            iban: form.querySelector('[name="iban"]').value.trim(),
            address: form.querySelector('[name="address"]').value.trim(),
            notes: form.querySelector('[name="notes"]').value.trim()
        };

        var res = updateProfile(data);

        if (!res.ok) {
            _showErrors(form, res.errors || { general: 'خطا: ' + res.reason });
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('خطا در ذخیره', 'خطا');
            }
            return;
        }

        STATE.editing = false;
        render();

        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('پروفایل با موفقیت ذخیره شد', 'موفق');
        }
    }

    function _bindProfileForm() {
        if (!STATE.form) return;
        // Enter روی input → save (فقط در حالت ویرایش)
        var inputs = STATE.form.querySelectorAll('input');
        for (var i = 0; i < inputs.length; i++) {
            inputs[i].addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey && STATE.editing) {
                    e.preventDefault();
                    _submitProfile();
                }
            });
            inputs[i].addEventListener('input', function () {
                var name = this.getAttribute('name');
                if (name) _setFieldError(STATE.form, name, '');
            });
        }
    }

    function _bindPasswordForm() {
        if (!STATE.pwdForm) return;
        STATE.pwdForm.addEventListener('submit', function (e) {
            e.preventDefault();
            _submitPassword();
        });
    }

    function _submitPassword() {
        if (!STATE.pwdForm) return;
        _clearErrors(STATE.pwdForm);

        var form = STATE.pwdForm;
        var data = {
            current: form.querySelector('[name="current"]').value,
            newPwd: form.querySelector('[name="newPwd"]').value,
            confirm: form.querySelector('[name="confirm"]').value
        };

        var res = changePassword(data);

        if (!res.ok) {
            _showErrors(form, res.errors || { general: 'خطا: ' + res.reason });
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('خطا در تغییر رمز', 'خطا');
            }
            return;
        }

        // پاک کردن فرم
        form.reset();
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('رمز عبور با موفقیت تغییر کرد', 'موفق');
        }
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var user = (typeof WamPermissions !== 'undefined')
            ? WamPermissions.getCurrentUser() : null;
        if (!user) {
            if (typeof WamPayGuard !== 'undefined') {
                WamPayGuard.redirectToLogin('not_logged_in');
            }
            return;
        }
        if (user.role !== 'broker' && user.role !== 'admin' &&
            user.role !== 'super_admin') {
            if (typeof WamPayGuard !== 'undefined') {
                WamPayGuard.redirectToRoleHome(user.role);
            }
            return;
        }

        var run = function () {
            var root = options.root ||
                       document.querySelector('[data-profile-root]') ||
                       document.querySelector('.wam-broker-profile-page');
            if (!root) {
                if (options.debug) console.warn('[broker-profile] root پیدا نشد');
                return;
            }
            STATE.root = root;

            STATE.broker = _loadCurrentBroker();
            if (!STATE.broker) {
                STATE.root.innerHTML =
                    '<div class="wam-empty">' +
                    'اطلاعات کارگزار یافت نشد. با پشتیبانی تماس بگیرید.' +
                    '</div>';
                return;
            }

            render();
            STATE.installed = true;

            _emit(ProfileEvents.LOADED, {
                broker: {
                    id: STATE.broker.id,
                    brokerCode: STATE.broker.brokerCode
                },
                at: Date.now()
            });

            if (options.debug) {
                console.log('[broker-profile] آماده: ' +
                    STATE.broker.brokerCode);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run);
        } else {
            run();
        }
    }

    function uninstall() {
        STATE.root = null;
        STATE.form = null;
        STATE.pwdForm = null;
        STATE.installed = false;
        STATE.editing = false;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            hasBroker: !!STATE.broker,
            editing: STATE.editing,
            submitting: STATE.submitting,
            brokerId: STATE.broker ? STATE.broker.id : null,
            brokerCode: STATE.broker ? STATE.broker.brokerCode : null
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
    var WamBrokerProfile = {
        EVENTS: ProfileEvents,
        FORM_ID: FORM_ID,
        PWD_FORM_ID: PWD_FORM_ID,
        MIN_PWD: MIN_PWD,

        install: install,
        uninstall: uninstall,
        render: render,

        updateProfile: updateProfile,
        changePassword: changePassword,

        getCurrentBroker: function () { return STATE.broker; },
        isEditing: function () { return STATE.editing; },
        startEdit: function () {
            STATE.editing = true;
            render();
        },
        cancelEdit: function () {
            STATE.editing = false;
            render();
        },

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamBrokerProfile = WamBrokerProfile;
    window.ProfileEvents = ProfileEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var body = document.body;
            if (!body) return;
            if (body.hasAttribute('data-broker-profile-page') ||
                document.querySelector('[data-profile-root]') ||
                document.querySelector('.wam-broker-profile-page')) {
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