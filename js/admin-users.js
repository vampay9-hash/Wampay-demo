// ==========================================
// وام پی — Admin Panel
// فایل: admin-users.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: مدیریت کاربران — لیست، جستجو، افزودن، ویرایش، حذف، تغییر نقش
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var USERS_KEY       = 'wamPayUsers';
    var FORM_ID         = 'wamUserForm';
    var ROLE_LABELS     = {
        super_admin: 'مدیر ارشد',
        admin:       'ادمین کل',
        verifier:    'اعتبارسنج',
        broker:      'کارگزار',
        applicant:   'متقاضی'
    };
    var STATUS_LABELS = {
        active:    'فعال',
        inactive:  'غیرفعال',
        blocked:   'مسدود',
        suspended: 'معلق'
    };
    var PAGE_SIZE = 20;

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        users: [],
        filtered: [],
        page: 1,
        query: '',
        roleFilter: '',
        statusFilter: '',
        editingId: null,
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var UserEvents = {
        LOADED:   'admin.users.loaded',
        CREATED:  'admin.users.created',
        UPDATED:  'admin.users.updated',
        DELETED:  'admin.users.deleted',
        TOGGLED:  'admin.users.toggled',
        RESET_PWD:'admin.users.pwd_reset',
        FILTERED: 'admin.users.filtered'
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
        var fa = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
        return s.replace(/[0-9]/g, function (d) { return fa[+d]; });
    }

    function _relativeTime(ts) {
        if (!ts) return '—';
        var diff = Date.now() - ts;
        var sec = Math.floor(diff / 1000);
        if (sec < 60) return 'همین الان';
        var min = Math.floor(sec / 60);
        if (min < 60) return _formatNumber(min) + ' دقیقه پیش';
        var hr = Math.floor(min / 60);
        if (hr < 24) return _formatNumber(hr) + ' ساعت پیش';
        var day = Math.floor(hr / 24);
        if (day < 30) return _formatNumber(day) + ' روز پیش';
        var mon = Math.floor(day / 30);
        if (mon < 12) return _formatNumber(mon) + ' ماه پیش';
        return _formatNumber(Math.floor(mon / 12)) + ' سال پیش';
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

    function _generateId() {
        var rand = Math.random().toString(36).slice(2, 8);
        return 'u_' + Date.now().toString(36) + '_' + rand;
    }

    function _generateTempPassword() {
        var chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
        var out = '';
        for (var i = 0; i < 10; i++) {
            out += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return out;
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری / ذخیره
    // ─────────────────────────────────────
    function _loadUsers() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(USERS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveUsers() {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(USERS_KEY, STATE.users);
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر
    // ─────────────────────────────────────
    function _applyFilters() {
        var q = (STATE.query || '').toLowerCase().trim();
        var rf = STATE.roleFilter;
        var sf = STATE.statusFilter;

        STATE.filtered = STATE.users.filter(function (u) {
            if (!u) return false;
            if (rf && u.role !== rf) return false;
            if (sf) {
                var st = u.status || (u.active === false ? 'inactive' : 'active');
                if (st !== sf) return false;
            }
            if (q) {
                var hay = [
                    u.name, u.username, u.mobile, u.email,
                    u.id, u.adminCode
                ].filter(Boolean).join(' ').toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            return true;
        });

        _emit(UserEvents.FILTERED, {
            count: STATE.filtered.length,
            query: q,
            role: rf,
            status: sf
        });
        return STATE.filtered;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ردیف کاربر
    // ─────────────────────────────────────
    function _roleBadge(role) {
        var label = ROLE_LABELS[role] || role || '—';
        return '<span class="wam-badge wam-badge--role wam-badge--' +
               _escapeHtml(role || 'unknown') + '">' +
               _escapeHtml(label) + '</span>';
    }

    function _statusBadge(u) {
        var st = u.status || (u.active === false ? 'inactive' : 'active');
        var label = STATUS_LABELS[st] || st;
        return '<span class="wam-badge wam-badge--status wam-badge--' +
               _escapeHtml(st) + '">' +
               _escapeHtml(label) + '</span>';
    }

    function _renderRow(u) {
        var canEdit = true;
        if (typeof WamPermissions !== 'undefined') {
            var me = WamPermissions.getCurrentUser();
            canEdit = WamPermissions.canManageUser(me, u);
        }

        var html = '<tr data-user-id="' + _escapeHtml(u.id) + '">';
        html += '<td class="wam-table__name">' +
                _escapeHtml(u.name || '—') + '</td>';
        html += '<td>' + _escapeHtml(u.username || '—') + '</td>';
        html += '<td>' + _escapeHtml(u.mobile || '—') + '</td>';
        html += '<td>' + _roleBadge(u.role) + '</td>';
        html += '<td>' + _statusBadge(u) + '</td>';
        html += '<td>' + _escapeHtml(_relativeTime(u.lastLogin || u.createdAt)) + '</td>';
        html += '<td class="wam-table__actions">';

        if (canEdit) {
            html += '<button type="button" class="wam-btn-icon" ' +
                    'data-action="edit" data-id="' + _escapeHtml(u.id) + '" ' +
                    'title="ویرایش">✏️</button>';

            html += '<button type="button" class="wam-btn-icon" ' +
                    'data-action="toggle" data-id="' + _escapeHtml(u.id) + '" ' +
                    'title="' + ((u.active === false || u.status === 'inactive')
                        ? 'فعال کردن' : 'غیرفعال کردن') + '">' +
                    ((u.active === false || u.status === 'inactive') ? '🟢' : '⏸️') +
                    '</button>';

            html += '<button type="button" class="wam-btn-icon" ' +
                    'data-action="reset-pwd" data-id="' + _escapeHtml(u.id) + '" ' +
                    'title="بازنشانی رمز">🔑</button>';

            html += '<button type="button" class="wam-btn-icon wam-btn-icon--danger" ' +
                    'data-action="delete" data-id="' + _escapeHtml(u.id) + '" ' +
                    'title="حذف">🗑️</button>';
        } else {
            html += '<span class="wam-muted">—</span>';
        }

        html += '</td></tr>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — جدول کامل
    // ─────────────────────────────────────
    function _renderTable() {
        var root = STATE.root;
        if (!root) return;

        var tbody = root.querySelector('[data-users="tbody"]');
        if (!tbody) return;

        var list = STATE.filtered;
        var start = (STATE.page - 1) * PAGE_SIZE;
        var end = Math.min(start + PAGE_SIZE, list.length);
        var pageItems = list.slice(start, end);

        if (pageItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="wam-table__empty">' +
                (STATE.users.length === 0
                    ? 'هیچ کاربری ثبت نشده است.'
                    : 'نتیجه‌ای برای فیلتر فعلی یافت نشد.') +
                '</td></tr>';
        } else {
            var html = '';
            for (var i = 0; i < pageItems.length; i++) {
                html += _renderRow(pageItems[i]);
            }
            tbody.innerHTML = html;
        }

        _renderPagination();
        _updateCounters();
        _bindRowActions();
    }

    function _renderPagination() {
        var root = STATE.root;
        if (!root) return;
        var el = root.querySelector('[data-users="pagination"]');
        if (!el) return;

        var total = STATE.filtered.length;
        var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

        if (pages <= 1) {
            el.innerHTML = '';
            return;
        }

        var html = '<button type="button" data-page="' + (STATE.page - 1) + '" ' +
                   (STATE.page === 1 ? 'disabled' : '') + '>قبلی</button>';
        html += '<span>صفحه ' + _formatNumber(STATE.page) +
                ' از ' + _formatNumber(pages) + '</span>';
        html += '<button type="button" data-page="' + (STATE.page + 1) + '" ' +
                (STATE.page === pages ? 'disabled' : '') + '>بعدی</button>';
        el.innerHTML = html;

        var btns = el.querySelectorAll('[data-page]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function () {
                var p = parseInt(this.getAttribute('data-page'), 10);
                if (!isNaN(p) && p >= 1 && p <= pages) {
                    STATE.page = p;
                    _renderTable();
                }
            });
        }
    }

    function _updateCounters() {
        var root = STATE.root;
        if (!root) return;
        var el = root.querySelector('[data-users="count"]');
        if (el) {
            el.textContent = _formatNumber(STATE.filtered.length) +
                             ' از ' + _formatNumber(STATE.users.length);
        }
    }

    // ─────────────────────────────────────
    // 🎯 رندر — کل صفحه
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;
        _applyFilters();
        _renderTable();
    }

    // ─────────────────────────────────────
    // ➕ افزودن کاربر
    // ─────────────────────────────────────
    function addUser(data, options) {
        options = options || {};
        var result = { ok: false, reason: null, user: null, errors: null };

        // اعتبارسنجی
        var errors = _validateUser(data, null);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        // یونیک بودن
        if (_findByUsername(data.username)) {
            result.reason = 'duplicate_username';
            result.errors = { username: 'این نام کاربری قبلاً ثبت شده است' };
            return result;
        }
        if (_findByMobile(data.mobile)) {
            result.reason = 'duplicate_mobile';
            result.errors = { mobile: 'این شماره موبایل قبلاً ثبت شده است' };
            return result;
        }

        // بررسی مجوز نقشی
        if (typeof WamPermissions !== 'undefined') {
            var me = WamPermissions.getCurrentUser();
            var actorLevel = WamPermissions.ROLE_LEVEL[me.role] || 0;
            var targetLevel = WamPermissions.ROLE_LEVEL[data.role] || 0;
            if (!WamPermissions.isSuperAdmin(me) && targetLevel >= actorLevel) {
                result.reason = 'insufficient_privilege';
                result.errors = { role: 'سطح دسترسی کافی برای ساخت این نقش ندارید' };
                return result;
            }
        }

        var now = Date.now();
        var user = {
            id: _generateId(),
            name: (data.name || '').trim(),
            username: (data.username || '').trim(),
            mobile: String(data.mobile || '').replace(/\D/g, ''),
            email: data.email ? String(data.email).trim() : null,
            password: _hashPassword(data.password),
            role: data.role,
            active: data.active !== false,
            status: data.active === false ? 'inactive' : 'active',
            mustChangePassword: !!data.mustChangePassword,
            createdAt: now,
            createdBy: (function () {
                if (typeof WamPermissions === 'undefined') return null;
                var me = WamPermissions.getCurrentUser();
                return me ? me.id : null;
            })(),
            passwordVersion: 1
        };

        STATE.users.push(user);
        if (!_saveUsers()) {
            STATE.users.pop();
            result.reason = 'storage_error';
            return result;
        }

        result.ok = true;
        result.user = user;

        _emit(UserEvents.CREATED, { user: user, at: now });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('کاربر «' + user.name + '» ساخته شد', 'موفق');
        }

        render();
        return result;
    }

    // ─────────────────────────────────────
    // ✏️ ویرایش
    // ─────────────────────────────────────
    function updateUser(id, patch, options) {
        options = options || {};
        var result = { ok: false, reason: null, user: null, errors: null };

        var user = _findById(id);
        if (!user) { result.reason = 'not_found'; return result; }

        // مجوز
        if (typeof WamPermissions !== 'undefined') {
            var me = WamPermissions.getCurrentUser();
            if (!WamPermissions.canManageUser(me, user)) {
                result.reason = 'insufficient_privilege';
                return result;
            }
        }

        var errors = _validateUser(patch, id);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        if (patch.username && patch.username !== user.username) {
            var dup = _findByUsername(patch.username);
            if (dup && dup.id !== id) {
                result.errors = { username: 'این نام کاربری تکراری است' };
                result.reason = 'duplicate_username';
                return result;
            }
        }
        if (patch.mobile && patch.mobile !== user.mobile) {
            var dup2 = _findByMobile(patch.mobile);
            if (dup2 && dup2.id !== id) {
                result.errors = { mobile: 'این موبایل تکراری است' };
                result.reason = 'duplicate_mobile';
                return result;
            }
        }

        // تغییر نقش — بررسی مجوز
        if (patch.role && patch.role !== user.role &&
            typeof WamPermissions !== 'undefined') {
            var me2 = WamPermissions.getCurrentUser();
            var lvl = WamPermissions.ROLE_LEVEL[patch.role] || 0;
            var myLvl = WamPermissions.ROLE_LEVEL[me2.role] || 0;
            if (!WamPermissions.isSuperAdmin(me2) && lvl >= myLvl) {
                result.reason = 'insufficient_privilege';
                result.errors = { role: 'اجازه تغییر به این نقش را ندارید' };
                return result;
            }
        }

        // اعمال
        var fields = ['name', 'username', 'mobile', 'email', 'role',
                      'mustChangePassword', 'status', 'active'];
        for (var i = 0; i < fields.length; i++) {
            var f = fields[i];
            if (patch[f] !== undefined) {
                user[f] = patch[f];
            }
        }
        if (patch.mobile) user.mobile = String(patch.mobile).replace(/\D/g, '');
        user.updatedAt = Date.now();

        if (!_saveUsers()) {
            result.reason = 'storage_error';
            return result;
        }

        result.ok = true;
        result.user = user;

        _emit(UserEvents.UPDATED, { user: user, at: Date.now() });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('کاربر به‌روزرسانی شد', 'موفق');
        }
        render();
        return result;
    }

    // ─────────────────────────────────────
    // 🗑️ حذف
    // ─────────────────────────────────────
    function deleteUser(id, options) {
        options = options || {};
        var user = _findById(id);
        if (!user) return { ok: false, reason: 'not_found' };

        // جلوگیری از حذف خود
        if (typeof WamPermissions !== 'undefined') {
            var me = WamPermissions.getCurrentUser();
            if (me && me.id === user.id) {
                return { ok: false, reason: 'cannot_delete_self' };
            }
            if (!WamPermissions.canManageUser(me, user)) {
                return { ok: false, reason: 'insufficient_privilege' };
            }
        }

        // حذف
        var idx = -1;
        for (var i = 0; i < STATE.users.length; i++) {
            if (STATE.users[i] && STATE.users[i].id === id) {
                idx = i;
                break;
            }
        }
        if (idx === -1) return { ok: false, reason: 'not_found' };

        var removed = STATE.users.splice(idx, 1)[0];
        if (!_saveUsers()) {
            STATE.users.splice(idx, 0, removed);
            return { ok: false, reason: 'storage_error' };
        }

        _emit(UserEvents.DELETED, { user: removed, at: Date.now() });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('کاربر حذف شد', 'موفق');
        }
        render();
        return { ok: true, user: removed };
    }

    // ─────────────────────────────────────
    // 🔀 تغییر وضعیت
    // ─────────────────────────────────────
    function toggleUser(id) {
        var user = _findById(id);
        if (!user) return { ok: false, reason: 'not_found' };

        if (typeof WamPermissions !== 'undefined') {
            var me = WamPermissions.getCurrentUser();
            if (!WamPermissions.canManageUser(me, user)) {
                return { ok: false, reason: 'insufficient_privilege' };
            }
        }

        var isActive = !(user.active === false || user.status === 'inactive');
        user.active = !isActive;
        user.status = !isActive ? 'active' : 'inactive';
        user.updatedAt = Date.now();

        if (!_saveUsers()) return { ok: false, reason: 'storage_error' };

        _emit(UserEvents.TOGGLED, {
            user: user,
            active: !isActive,
            at: Date.now()
        });

        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess(
                'کاربر ' + (!isActive ? 'فعال' : 'غیرفعال') + ' شد',
                'موفق'
            );
        }
        render();
        return { ok: true, user: user, active: !isActive };
    }

    // ─────────────────────────────────────
    // 🔑 بازنشانی رمز
    // ─────────────────────────────────────
    function resetPassword(id, options) {
        options = options || {};
        var user = _findById(id);
        if (!user) return { ok: false, reason: 'not_found' };

        if (typeof WamPermissions !== 'undefined') {
            var me = WamPermissions.getCurrentUser();
            if (!WamPermissions.canManageUser(me, user)) {
                return { ok: false, reason: 'insufficient_privilege' };
            }
        }

        var tempPwd = options.password || _generateTempPassword();
        user.password = _hashPassword(tempPwd);
        user.mustChangePassword = true;
        user.passwordVersion = (user.passwordVersion || 1) + 1;
        user.passwordResetAt = Date.now();
        user.passwordResetBy = (function () {
            if (typeof WamPermissions === 'undefined') return null;
            var me2 = WamPermissions.getCurrentUser();
            return me2 ? me2.id : null;
        })();

        if (!_saveUsers()) return { ok: false, reason: 'storage_error' };

        _emit(UserEvents.RESET_PWD, {
            user: user,
            tempPassword: tempPwd,
            at: Date.now()
        });

        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess(
                'رمز بازنشانی شد: ' + tempPwd + ' (به کاربر اطلاع دهید)',
                'موفق',
                8000
            );
        }
        render();
        return { ok: true, user: user, tempPassword: tempPwd };
    }

    // ─────────────────────────────────────
    // 🧾 اعتبارسنجی
    // ─────────────────────────────────────
    function _validateUser(data, excludeId) {
        var errors = {};

        if (!data.name || String(data.name).trim().length < 3) {
            errors.name = 'نام حداقل ۳ کاراکتر باشد';
        }
        if (!data.username || String(data.username).trim().length < 3) {
            errors.username = 'نام کاربری حداقل ۳ کاراکتر باشد';
        } else if (!/^[a-zA-Z0-9_\-\.]+$/.test(String(data.username).trim())) {
            errors.username = 'نام کاربری فقط شامل حروف، اعداد، _ - .';
        }
        if (!data.mobile) {
            errors.mobile = 'شماره موبایل الزامی است';
        } else {
            var mob = String(data.mobile).replace(/\D/g, '');
            if (!/^09\d{9}$/.test(mob)) {
                errors.mobile = 'شماره موبایل باید با ۰۹ شروع شود (۱۱ رقم)';
            }
        }
        if (!data.role) {
            errors.role = 'نقش کاربر را انتخاب کنید';
        } else if (!ROLE_LABELS[data.role]) {
            errors.role = 'نقش نامعتبر است';
        }

        // پسورد فقط در حالت افزودن الزامی است
        if (!excludeId) {
            if (!data.password || String(data.password).length < 6) {
                errors.password = 'رمز عبور حداقل ۶ کاراکتر باشد';
            }
        }

        return errors;
    }

    // ─────────────────────────────────────
    // 🔍 پیدا کردن
    // ─────────────────────────────────────
    function _findById(id) {
        for (var i = 0; i < STATE.users.length; i++) {
            if (STATE.users[i] && STATE.users[i].id === id) return STATE.users[i];
        }
        return null;
    }

    function _findByUsername(username) {
        if (!username) return null;
        var u = String(username).toLowerCase().trim();
        for (var i = 0; i < STATE.users.length; i++) {
            var x = STATE.users[i];
            if (x && x.username && String(x.username).toLowerCase() === u) return x;
        }
        return null;
    }

    function _findByMobile(mobile) {
        if (!mobile) return null;
        var m = String(mobile).replace(/\D/g, '');
        for (var i = 0; i < STATE.users.length; i++) {
            var x = STATE.users[i];
            if (x && x.mobile && String(x.mobile).replace(/\D/g, '') === m) return x;
        }
        return null;
    }

    // ─────────────────────────────────────
    // 🖱️ رویدادهای جدول
    // ─────────────────────────────────────
    function _bindRowActions() {
        var root = STATE.root;
        if (!root) return;
        var rows = root.querySelectorAll('tr[data-user-id]');
        for (var i = 0; i < rows.length; i++) {
            var btns = rows[i].querySelectorAll('[data-action]');
            for (var j = 0; j < btns.length; j++) {
                btns[j].addEventListener('click', _handleRowAction);
            }
        }
    }

    function _handleRowAction(e) {
        e.preventDefault();
        var action = this.getAttribute('data-action');
        var id = this.getAttribute('data-id');
        if (!action || !id) return;

        if (action === 'edit') {
            openEditForm(id);
        } else if (action === 'toggle') {
            toggleUser(id);
        } else if (action === 'reset-pwd') {
            _confirmResetPassword(id);
        } else if (action === 'delete') {
            _confirmDelete(id);
        }
    }

    function _confirmDelete(id) {
        var user = _findById(id);
        if (!user) return;

        var title = 'حذف کاربر';
        var msg = 'آیا مطمئن هستید که «' + (user.name || user.username) +
                  '» حذف شود؟ این عملیات قابل بازگشت نیست.';

        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm(title, msg, { danger: true }).then(function (ok) {
                if (ok) deleteUser(id);
            });
        } else if (window.confirm(msg)) {
            deleteUser(id);
        }
    }

    function _confirmResetPassword(id) {
        var user = _findById(id);
        if (!user) return;

        var title = 'بازنشانی رمز عبور';
        var msg = 'رمز جدید برای «' + (user.name || user.username) +
                  '» تولید و نمایش داده شود؟';

        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm(title, msg).then(function (ok) {
                if (ok) resetPassword(id);
            });
        } else if (window.confirm(msg)) {
            resetPassword(id);
        }
    }

    // ─────────────────────────────────────
    // 🎛️ فیلترها
    // ─────────────────────────────────────
    function _bindFilters() {
        var root = STATE.root;
        if (!root) return;

        var searchEl = root.querySelector('[data-users="search"]');
        if (searchEl) {
            searchEl.addEventListener('input', function () {
                STATE.query = this.value;
                STATE.page = 1;
                render();
            });
        }

        var roleEl = root.querySelector('[data-users="filter-role"]');
        if (roleEl) {
            roleEl.addEventListener('change', function () {
                STATE.roleFilter = this.value;
                STATE.page = 1;
                render();
            });
        }

        var statusEl = root.querySelector('[data-users="filter-status"]');
        if (statusEl) {
            statusEl.addEventListener('change', function () {
                STATE.statusFilter = this.value;
                STATE.page = 1;
                render();
            });
        }

        var addBtn = root.querySelector('[data-users-action="add"]');
        if (addBtn) {
            addBtn.addEventListener('click', function (e) {
                e.preventDefault();
                openAddForm();
            });
        }
    }

    // ─────────────────────────────────────
    // 🎯 فرم افزودن/ویرایش (inline modal)
    // ─────────────────────────────────────
    function openAddForm() {
        STATE.editingId = null;
        _openFormModal(null);
    }

    function openEditForm(id) {
        var user = _findById(id);
        if (!user) return;
        STATE.editingId = id;
        _openFormModal(user);
    }

    function _openFormModal(user) {
        // اگر modal موجود است حذف کن
        var existing = document.getElementById('wamUserModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var isEdit = !!user;
        var u = user || {};

        var modal = document.createElement('div');
        modal.id = 'wamUserModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel" role="dialog">' +
                '<header class="wam-modal__head">' +
                    '<h3>' + (isEdit ? 'ویرایش کاربر' : 'افزودن کاربر جدید') + '</h3>' +
                    '<button type="button" class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form id="' + FORM_ID + '" class="wam-modal__body">' +
                    '<div class="wam-field"><label>نام و نام خانوادگی *</label>' +
                        '<input type="text" name="name" value="' +
                        _escapeHtml(u.name || '') + '" required>' +
                        '<div class="wam-field__error" data-error="name"></div></div>' +

                    '<div class="wam-field"><label>نام کاربری *</label>' +
                        '<input type="text" name="username" value="' +
                        _escapeHtml(u.username || '') + '" required>' +
                        '<div class="wam-field__error" data-error="username"></div></div>' +

                    '<div class="wam-field"><label>موبایل *</label>' +
                        '<input type="tel" name="mobile" value="' +
                        _escapeHtml(u.mobile || '') + '" placeholder="09123456789" required>' +
                        '<div class="wam-field__error" data-error="mobile"></div></div>' +

                    '<div class="wam-field"><label>ایمیل (اختیاری)</label>' +
                        '<input type="email" name="email" value="' +
                        _escapeHtml(u.email || '') + '">' +
                        '<div class="wam-field__error" data-error="email"></div></div>' +

                    '<div class="wam-field"><label>نقش *</label>' +
                        '<select name="role" required>' +
                            _renderRoleOptions(u.role) +
                        '</select>' +
                        '<div class="wam-field__error" data-error="role"></div></div>' +

                    (isEdit ? '' :
                        '<div class="wam-field"><label>رمز عبور *</label>' +
                        '<input type="password" name="password" minlength="6" required>' +
                        '<div class="wam-field__error" data-error="password"></div></div>') +

                    '<div class="wam-field wam-field--inline">' +
                        '<label><input type="checkbox" name="active" ' +
                        (u.active === false ? '' : 'checked') + '> فعال</label>' +
                    '</div>' +

                    '<div class="wam-field wam-field--inline">' +
                        '<label><input type="checkbox" name="mustChangePassword" ' +
                        (u.mustChangePassword ? 'checked' : '') + '> ' +
                        'الزام به تغییر رمز در ورود بعدی</label>' +
                    '</div>' +

                    '<div class="wam-field__error wam-field__error--general" ' +
                        'data-error="general"></div>' +

                    '<footer class="wam-modal__footer">' +
                        '<button type="button" class="wam-btn wam-btn--ghost" ' +
                        'data-close>انصراف</button>' +
                        '<button type="submit" class="wam-btn wam-btn--primary">' +
                        (isEdit ? 'ذخیره تغییرات' : 'افزودن') + '</button>' +
                    '</footer>' +
                '</form>' +
            '</div>';

        document.body.appendChild(modal);

        // بایند
        var closeBtns = modal.querySelectorAll('[data-close]');
        for (var i = 0; i < closeBtns.length; i++) {
            closeBtns[i].addEventListener('click', _closeModal);
        }

        var form = modal.querySelector('#' + FORM_ID);
        if (form) {
            form.addEventListener('submit', _handleFormSubmit);
        }

        // فوکوس
        setTimeout(function () {
            var first = form && form.querySelector('input[name="name"]');
            if (first) try { first.focus(); } catch (e) { /* بی‌صدا */ }
        }, 50);
    }

    function _renderRoleOptions(current) {
        var roles = ['admin', 'verifier', 'broker', 'applicant'];
        // فقط super_admin می‌تواند super_admin بسازد
        if (typeof WamPermissions !== 'undefined') {
            var me = WamPermissions.getCurrentUser();
            if (WamPermissions.isSuperAdmin(me)) {
                roles.unshift('super_admin');
            }
        }

        var html = '<option value="">— انتخاب کنید —</option>';
        for (var i = 0; i < roles.length; i++) {
            var r = roles[i];
            html += '<option value="' + r + '"' +
                    (current === r ? ' selected' : '') + '>' +
                    ROLE_LABELS[r] + '</option>';
        }
        return html;
    }

    function _closeModal() {
        var m = document.getElementById('wamUserModal');
        if (m && m.parentNode) m.parentNode.removeChild(m);
        STATE.editingId = null;
    }

    function _handleFormSubmit(e) {
        e.preventDefault();
        var form = e.target;

        var data = {
            name: form.querySelector('[name="name"]').value.trim(),
            username: form.querySelector('[name="username"]').value.trim(),
            mobile: form.querySelector('[name="mobile"]').value.trim(),
            email: form.querySelector('[name="email"]').value.trim(),
            role: form.querySelector('[name="role"]').value,
            active: form.querySelector('[name="active"]').checked,
            mustChangePassword: form.querySelector('[name="mustChangePassword"]').checked
        };

        var pwdEl = form.querySelector('[name="password"]');
        if (pwdEl) data.password = pwdEl.value;

        // پاک کردن خطاها
        _clearFormErrors(form);

        var res;
        if (STATE.editingId) {
            res = updateUser(STATE.editingId, data);
        } else {
            res = addUser(data);
        }

        if (!res.ok) {
            _showFormErrors(form, res.errors || { general: 'خطا: ' + (res.reason || 'ناشناخته') });
            return;
        }

        _closeModal();
    }

    function _clearFormErrors(form) {
        var errs = form.querySelectorAll('[data-error]');
        for (var i = 0; i < errs.length; i++) {
            errs[i].textContent = '';
            errs[i].style.display = 'none';
        }
    }

    function _showFormErrors(form, errors) {
        for (var k in errors) {
            if (!Object.prototype.hasOwnProperty.call(errors, k)) continue;
            var el = form.querySelector('[data-error="' + k + '"]');
            if (el) {
                el.textContent = errors[k];
                el.style.display = 'block';
            }
        }
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        // دسترسی
        if (typeof WamPermissions !== 'undefined') {
            var me = WamPermissions.getCurrentUser();
            if (!me || !WamPermissions.isAdmin(me)) {
                if (typeof WamUI !== 'undefined') {
                    WamUI.toastError('دسترسی ندارید', 'خطا');
                }
                if (typeof WamPayGuard !== 'undefined') {
                    WamPayGuard.redirectToRoleHome(me && me.role);
                }
                return;
            }
        }

        var run = function () {
            var root = options.root ||
                       document.querySelector('[data-users-root]') ||
                       document.querySelector('.wam-users-panel');
            if (!root) {
                if (options.debug) console.warn('[admin-users] root پیدا نشد');
                return;
            }

            STATE.root = root;
            STATE.users = _loadUsers();

            _bindFilters();
            render();

            _emit(UserEvents.LOADED, {
                count: STATE.users.length,
                at: Date.now()
            });

            STATE.installed = true;
            if (options.debug) console.log('[admin-users] آماده، ' + STATE.users.length + ' کاربر');
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run);
        } else {
            run();
        }
    }

    function uninstall() {
        STATE.root = null;
        STATE.installed = false;
        _closeModal();
    }

    function reload() {
        STATE.users = _loadUsers();
        render();
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            total: STATE.users.length,
            filtered: STATE.filtered.length,
            page: STATE.page,
            query: STATE.query,
            roleFilter: STATE.roleFilter,
            statusFilter: STATE.statusFilter
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
    var WamAdminUsers = {
        // ثوابت
        EVENTS: UserEvents,
        ROLE_LABELS: ROLE_LABELS,
        STATUS_LABELS: STATUS_LABELS,
        PAGE_SIZE: PAGE_SIZE,
        FORM_ID: FORM_ID,

        // نصب
        install: install,
        uninstall: uninstall,
        reload: reload,
        render: render,

        // CRUD
        addUser: addUser,
        updateUser: updateUser,
        deleteUser: deleteUser,
        toggleUser: toggleUser,
        resetPassword: resetPassword,

        // فرم
        openAddForm: openAddForm,
        openEditForm: openEditForm,
        closeForm: _closeModal,

        // لیست
        getUsers: function () { return STATE.users.slice(); },
        getFiltered: function () { return STATE.filtered.slice(); },
        findById: _findById,

        // گزارش
        getStatus: getStatus,
        onChange: onChange
    };

    // ثبت جهانی
    window.WamAdminUsers = WamAdminUsers;
    window.UserEvents = UserEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var body = document.body;
            if (!body) return;
            var isPage =
                body.hasAttribute('data-admin-users') ||
                document.querySelector('[data-users-root]') ||
                document.querySelector('.wam-users-panel');
            if (isPage) install();
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _auto);
        } else {
            _auto();
        }
    }

})();