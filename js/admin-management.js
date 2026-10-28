// ==========================================
// وام پی — Admin Panel
// فایل: admin-management.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: مدیریت ادمین‌ها — ترفیع/تنزل، مجوزها، ابزارهای حساس
//        ⚠️ فقط super_admin
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var USERS_KEY = 'wamPayUsers';
    var PAGE_SIZE = 20;

    var ELEVATED_ROLES = ['admin', 'super_admin', 'verifier'];

    var ROLE_LABELS = {
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

    // ابزارهای حساس قابل اجرا توسط super_admin
    var SENSITIVE_TOOLS = [
        {
            id: 'export-all',
            title: 'خروجی کامل داده‌ها',
            description: 'تمام داده‌های سیستم به‌صورت JSON',
            icon: '📦'
        },
        {
            id: 'import-data',
            title: 'ورود داده‌ها',
            description: 'بازیابی از فایل JSON',
            icon: '📥'
        },
        {
            id: 'rebuild-indexes',
            title: 'بازسازی ایندکس‌ها',
            description: 'محاسبه مجدد آمار و ایندکس',
            icon: '🔧'
        },
        {
            id: 'audit-log',
            title: 'لاگ رویدادها',
            description: 'نمایش آخرین رویدادهای سیستم',
            icon: '📋'
        },
        {
            id: 'clean-tokens',
            title: 'پاکسازی توکن‌ها',
            description: 'حذف توکن‌ها و sessionهای منقضی',
            icon: '🧹'
        },
        {
            id: 'danger-zone',
            title: 'منطقه خطر',
            description: 'عملیات بازگشت‌ناپذیر',
            icon: '⚠️'
        }
    ];

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        allUsers: [],
        elevatedUsers: [],
        filtered: [],
        page: 1,
        query: '',
        roleFilter: '',
        statusFilter: '',
        selectedIds: {},
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var MgmtEvents = {
        LOADED:      'admin.mgmt.loaded',
        PROMOTED:    'admin.mgmt.promoted',
        DEMOTED:     'admin.mgmt.demoted',
        SUSPENDED:   'admin.mgmt.suspended',
        REACTIVATED: 'admin.mgmt.reactivated',
        TOOL_RUN:    'admin.mgmt.tool_run',
        TOOL_DONE:   'admin.mgmt.tool_done',
        TOOL_FAIL:   'admin.mgmt.tool_fail',
        EXPORTED:    'admin.mgmt.exported',
        IMPORTED:    'admin.mgmt.imported'
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
    // 🔒 بررسی دسترسی — فقط super_admin
    // ─────────────────────────────────────
    function _isSuperAdmin() {
        if (typeof WamPermissions === 'undefined') return false;
        var me = WamPermissions.getCurrentUser();
        return !!(me && WamPermissions.isSuperAdmin(me));
    }

    function _guardAccess() {
        if (!_isSuperAdmin()) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('فقط مدیر ارشد به این بخش دسترسی دارد', 'خطا');
            }
            if (typeof WamPayGuard !== 'undefined') {
                var me = (typeof WamPermissions !== 'undefined')
                    ? WamPermissions.getCurrentUser() : null;
                WamPayGuard.redirectToRoleHome(me && me.role);
            }
            return false;
        }
        return true;
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

    function _currentUserId() {
        if (typeof WamPermissions === 'undefined') return null;
        var me = WamPermissions.getCurrentUser();
        return me ? me.id : null;
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
        return Storage.setJSON(USERS_KEY, STATE.allUsers);
    }

    function _extractElevated(users) {
        var out = [];
        for (var i = 0; i < users.length; i++) {
            var u = users[i];
            if (!u) continue;
            if (ELEVATED_ROLES.indexOf(u.role) !== -1) out.push(u);
        }
        return out;
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر
    // ─────────────────────────────────────
    function _applyFilters() {
        var q = (STATE.query || '').toLowerCase().trim();
        var rf = STATE.roleFilter;
        var sf = STATE.statusFilter;

        STATE.filtered = STATE.elevatedUsers.filter(function (u) {
            if (!u) return false;
            if (rf && u.role !== rf) return false;
            if (sf) {
                var st = u.status || (u.active === false ? 'inactive' : 'active');
                if (st !== sf) return false;
            }
            if (q) {
                var hay = [u.name, u.username, u.mobile, u.email, u.id]
                    .filter(Boolean).join(' ').toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            return true;
        });
        return STATE.filtered;
    }

    // ─────────────────────────────────────
    // 🔢 آمار
    // ─────────────────────────────────────
    function computeStats() {
        var byRole = { admin: 0, super_admin: 0, verifier: 0 };
        var active = 0;
        var suspended = 0;

        for (var i = 0; i < STATE.elevatedUsers.length; i++) {
            var u = STATE.elevatedUsers[i];
            if (!u) continue;
            var r = u.role;
            if (byRole[r] !== undefined) byRole[r]++;
            var st = u.status || (u.active === false ? 'inactive' : 'active');
            if (st === 'active') active++;
            else if (st === 'suspended' || st === 'blocked') suspended++;
        }

        return {
            total: STATE.elevatedUsers.length,
            active: active,
            suspended: suspended,
            byRole: byRole,
            allUsers: STATE.allUsers.length
        };
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ردیف
    // ─────────────────────────────────────
    function _renderRow(u) {
        var st = u.status || (u.active === false ? 'inactive' : 'active');
        var stLabel = STATUS_LABELS[st] || st;
        var roleLabel = ROLE_LABELS[u.role] || u.role;
        var isMe = _currentUserId() === u.id;
        var isSuper = u.role === 'super_admin';

        var html = '<tr data-user-id="' + _escapeHtml(u.id) + '"' +
                   (isMe ? ' class="is-me"' : '') + '>';

        html += '<td class="wam-table__name">' +
                _escapeHtml(u.name || '—') +
                (isMe ? ' <span class="wam-badge wam-badge--me">شما</span>' : '') +
                '</td>';

        html += '<td>' + _escapeHtml(u.username || '—') + '</td>';
        html += '<td>' + _escapeHtml(u.mobile || '—') + '</td>';

        html += '<td><span class="wam-badge wam-badge--role wam-badge--' +
                _escapeHtml(u.role) + '">' + _escapeHtml(roleLabel) +
                '</span></td>';

        html += '<td><span class="wam-badge wam-badge--' + _escapeHtml(st) +
                '">' + _escapeHtml(stLabel) + '</span></td>';

        html += '<td>' + _escapeHtml(_relativeTime(u.lastLogin || u.createdAt)) +
                '</td>';

        html += '<td class="wam-table__actions">';

        // ترفیع/تنزل
        if (!isMe) {
            if (u.role === 'admin') {
                html += '<button class="wam-btn-icon" data-action="promote" ' +
                        'title="ترفیع به مدیر ارشد">⬆️</button>';
            } else if (u.role === 'super_admin' && _countSuperAdmins() > 1) {
                html += '<button class="wam-btn-icon" data-action="demote" ' +
                        'title="تنزل به ادمین">⬇️</button>';
            } else if (u.role === 'verifier') {
                html += '<button class="wam-btn-icon" data-action="promote" ' +
                        'title="ترفیع به ادمین">⬆️</button>';
            }
        }

        // معلق/فعال (نه خودم، نه super دیگر)
        if (!isMe && !(isSuper && _countSuperAdmins() <= 1)) {
            if (st === 'active') {
                html += '<button class="wam-btn-icon" data-action="suspend" ' +
                        'title="معلق کردن">⏸️</button>';
            } else {
                html += '<button class="wam-btn-icon" data-action="reactivate" ' +
                        'title="فعال کردن">🟢</button>';
            }
        }

        // حذف (نه خودم، نه super دیگر)
        if (!isMe && !(isSuper && _countSuperAdmins() <= 1)) {
            html += '<button class="wam-btn-icon wam-btn-icon--danger" ' +
                    'data-action="remove" title="حذف از دسترسی">🗑️</button>';
        }

        if (isMe) {
            html += '<span class="wam-muted">—</span>';
        }

        html += '</td></tr>';
        return html;
    }

    function _countSuperAdmins() {
        var n = 0;
        for (var i = 0; i < STATE.elevatedUsers.length; i++) {
            if (STATE.elevatedUsers[i] && STATE.elevatedUsers[i].role === 'super_admin') n++;
        }
        return n;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — جدول
    // ─────────────────────────────────────
    function _renderTable() {
        if (!STATE.root) return;
        var tbody = STATE.root.querySelector('[data-mgmt="tbody"]');
        if (!tbody) return;

        var list = STATE.filtered;
        var start = (STATE.page - 1) * PAGE_SIZE;
        var end = Math.min(start + PAGE_SIZE, list.length);
        var items = list.slice(start, end);

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="wam-table__empty">' +
                (STATE.elevatedUsers.length === 0
                    ? 'هیچ کاربر ارشدی وجود ندارد.'
                    : 'نتیجه‌ای برای فیلتر فعلی یافت نشد.') +
                '</td></tr>';
        } else {
            var html = '';
            for (var i = 0; i < items.length; i++) html += _renderRow(items[i]);
            tbody.innerHTML = html;
        }

        _renderPagination();
        _renderStatsBox();
        _bindRowActions();
    }

    function _renderPagination() {
        if (!STATE.root) return;
        var el = STATE.root.querySelector('[data-mgmt="pagination"]');
        if (!el) return;

        var total = STATE.filtered.length;
        var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (pages <= 1) { el.innerHTML = ''; return; }

        var html = '<button data-page="' + (STATE.page - 1) + '"' +
                   (STATE.page === 1 ? ' disabled' : '') + '>‹ قبلی</button>';
        html += '<span>صفحه ' + _formatNumber(STATE.page) +
                ' از ' + _formatNumber(pages) + '</span>';
        html += '<button data-page="' + (STATE.page + 1) + '"' +
                (STATE.page === pages ? ' disabled' : '') + '>بعدی ›</button>';
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

    function _renderStatsBox() {
        if (!STATE.root) return;
        var el = STATE.root.querySelector('[data-mgmt="stats"]');
        if (!el) return;
        var s = computeStats();
        el.innerHTML =
            '<span>کل ارشد: <strong>' + _formatNumber(s.total) + '</strong></span>' +
            '<span>فعال: <strong>' + _formatNumber(s.active) + '</strong></span>' +
            '<span>معلق: <strong>' + _formatNumber(s.suspended) + '</strong></span>' +
            '<span>مدیر ارشد: <strong>' + _formatNumber(s.byRole.super_admin) + '</strong></span>' +
            '<span>ادمین: <strong>' + _formatNumber(s.byRole.admin) + '</strong></span>' +
            '<span>اعتبارسنج: <strong>' + _formatNumber(s.byRole.verifier) + '</strong></span>';
    }

    // ─────────────────────────────────────
    // 🖱️ رویدادهای ردیف
    // ─────────────────────────────────────
    function _bindRowActions() {
        if (!STATE.root) return;
        var rows = STATE.root.querySelectorAll('tr[data-user-id]');
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
        var tr = this.closest('tr[data-user-id]');
        if (!tr) return;
        var id = tr.getAttribute('data-user-id');

        if (action === 'promote')    _confirmPromote(id);
        else if (action === 'demote')    _confirmDemote(id);
        else if (action === 'suspend')   _confirmSuspend(id);
        else if (action === 'reactivate') reactivateUser(id);
        else if (action === 'remove')    _confirmRemove(id);
    }

    // ─────────────────────────────────────
    // ⬆️ ترفیع
    // ─────────────────────────────────────
    function promoteUser(id) {
        if (!_isSuperAdmin()) return { ok: false, reason: 'forbidden' };
        var u = _findById(id);
        if (!u) return { ok: false, reason: 'not_found' };

        var nextRole = null;
        if (u.role === 'verifier') nextRole = 'admin';
        else if (u.role === 'admin') nextRole = 'super_admin';
        else return { ok: false, reason: 'not_promotable' };

        var prev = u.role;
        u.role = nextRole;
        u.updatedAt = Date.now();
        u.roleChangedAt = Date.now();
        u.roleChangedBy = _currentUserId();

        if (!_saveUsers()) {
            u.role = prev;
            return { ok: false, reason: 'storage_error' };
        }

        _emit(MgmtEvents.PROMOTED, {
            user: u, from: prev, to: nextRole, at: Date.now()
        });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess(
                '«' + (u.name || u.username) + '» به ' +
                (ROLE_LABELS[nextRole] || nextRole) + ' ترفیع یافت',
                'موفق'
            );
        }
        reload();
        return { ok: true, user: u, from: prev, to: nextRole };
    }

    function _confirmPromote(id) {
        var u = _findById(id);
        if (!u) return;
        var targetRole = u.role === 'admin' ? 'super_admin' :
                         u.role === 'verifier' ? 'admin' : null;
        if (!targetRole) return;

        var msg = '«' + (u.name || u.username) + '» به «' +
                  (ROLE_LABELS[targetRole] || targetRole) + '» ترفیع یابد؟';
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('ترفیع نقش', msg).then(function (ok) {
                if (ok) promoteUser(id);
            });
        } else if (window.confirm(msg)) {
            promoteUser(id);
        }
    }

    // ─────────────────────────────────────
    // ⬇️ تنزل
    // ─────────────────────────────────────
    function demoteUser(id) {
        if (!_isSuperAdmin()) return { ok: false, reason: 'forbidden' };
        var u = _findById(id);
        if (!u) return { ok: false, reason: 'not_found' };
        if (u.role !== 'super_admin') return { ok: false, reason: 'not_demotable' };

        if (_countSuperAdmins() <= 1) {
            return { ok: false, reason: 'last_super_admin' };
        }

        var prev = u.role;
        u.role = 'admin';
        u.updatedAt = Date.now();
        u.roleChangedAt = Date.now();
        u.roleChangedBy = _currentUserId();

        if (!_saveUsers()) { u.role = prev; return { ok: false, reason: 'storage_error' }; }

        _emit(MgmtEvents.DEMOTED, {
            user: u, from: prev, to: 'admin', at: Date.now()
        });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('«' + (u.name || u.username) + '» به ادمین تنزل یافت', 'موفق');
        }
        reload();
        return { ok: true, user: u };
    }

    function _confirmDemote(id) {
        var u = _findById(id);
        if (!u) return;
        var msg = '«' + (u.name || u.username) + '» به ادمین تنزل یابد؟';
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('تنزل نقش', msg, { danger: true }).then(function (ok) {
                if (ok) demoteUser(id);
            });
        } else if (window.confirm(msg)) {
            demoteUser(id);
        }
    }

    // ─────────────────────────────────────
    // ⏸️ تعلیق / فعال‌سازی
    // ─────────────────────────────────────
    function suspendUser(id, options) {
        options = options || {};
        if (!_isSuperAdmin()) return { ok: false, reason: 'forbidden' };
        var u = _findById(id);
        if (!u) return { ok: false, reason: 'not_found' };

        if (_currentUserId() === id) return { ok: false, reason: 'cannot_suspend_self' };
        if (u.role === 'super_admin' && _countSuperAdmins() <= 1) {
            return { ok: false, reason: 'last_super_admin' };
        }

        u.active = false;
        u.status = 'suspended';
        u.suspendedAt = Date.now();
        u.suspendedBy = _currentUserId();
        u.suspendReason = options.reason || null;
        u.updatedAt = Date.now();

        if (!_saveUsers()) return { ok: false, reason: 'storage_error' };

        _emit(MgmtEvents.SUSPENDED, {
            user: u, reason: options.reason || null, at: Date.now()
        });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastWarning('«' + (u.name || u.username) + '» معلق شد', 'موفق');
        }
        reload();
        return { ok: true, user: u };
    }

    function reactivateUser(id) {
        if (!_isSuperAdmin()) return { ok: false, reason: 'forbidden' };
        var u = _findById(id);
        if (!u) return { ok: false, reason: 'not_found' };

        u.active = true;
        u.status = 'active';
        u.reactivatedAt = Date.now();
        u.reactivatedBy = _currentUserId();
        u.updatedAt = Date.now();

        if (!_saveUsers()) return { ok: false, reason: 'storage_error' };

        _emit(MgmtEvents.REACTIVATED, { user: u, at: Date.now() });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('«' + (u.name || u.username) + '» فعال شد', 'موفق');
        }
        reload();
        return { ok: true, user: u };
    }

    function _confirmSuspend(id) {
        var u = _findById(id);
        if (!u) return;
        var msg = '«' + (u.name || u.username) + '» معلق شود؟';
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('تعلیق دسترسی', msg, { danger: true }).then(function (ok) {
                if (ok) suspendUser(id);
            });
        } else if (window.confirm(msg)) {
            suspendUser(id);
        }
    }

    // ─────────────────────────────────────
    // 🗑️ حذف (فقط حذف نقش ارشد — کاربر باقی می‌ماند)
    // ─────────────────────────────────────
    function removeElevated(id) {
        if (!_isSuperAdmin()) return { ok: false, reason: 'forbidden' };
        var u = _findById(id);
        if (!u) return { ok: false, reason: 'not_found' };

        if (_currentUserId() === id) return { ok: false, reason: 'cannot_remove_self' };
        if (u.role === 'super_admin' && _countSuperAdmins() <= 1) {
            return { ok: false, reason: 'last_super_admin' };
        }

        // تبدیل به applicant (پایین‌ترین سطح)
        u.role = 'applicant';
        u.updatedAt = Date.now();
        u.roleChangedAt = Date.now();
        u.roleChangedBy = _currentUserId();
        u.roleChangeNote = 'حذف از دسترسی ارشد توسط super_admin';

        if (!_saveUsers()) return { ok: false, reason: 'storage_error' };

        _emit(MgmtEvents.DEMOTED, {
            user: u, from: 'elevated', to: 'applicant', at: Date.now()
        });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastWarning('دسترسی «' + (u.name || u.username) + '» حذف شد', 'توجه');
        }
        reload();
        return { ok: true, user: u };
    }

    function _confirmRemove(id) {
        var u = _findById(id);
        if (!u) return;
        var msg = 'دسترسی ارشد «' + (u.name || u.username) +
                  '» حذف شود؟ (کاربر به نقش «متقاضی» تبدیل می‌شود)';
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('حذف دسترسی ارشد', msg, { danger: true }).then(function (ok) {
                if (ok) removeElevated(id);
            });
        } else if (window.confirm(msg)) {
            removeElevated(id);
        }
    }

    // ─────────────────────────────────────
    // 📥 پیدا کردن
    // ─────────────────────────────────────
    function _findById(id) {
        for (var i = 0; i < STATE.elevatedUsers.length; i++) {
            if (STATE.elevatedUsers[i] && STATE.elevatedUsers[i].id === id) {
                return STATE.elevatedUsers[i];
            }
        }
        return null;
    }

    // ─────────────────────────────────────
    // 🛠️ ابزارهای حساس
    // ─────────────────────────────────────
    function runTool(toolId, options) {
        options = options || {};
        if (!_isSuperAdmin()) return { ok: false, reason: 'forbidden' };

        _emit(MgmtEvents.TOOL_RUN, { tool: toolId, at: Date.now() });

        try {
            var res;
            switch (toolId) {
                case 'export-all':    res = _toolExportAll(); break;
                case 'import-data':   res = _toolImportData(); break;
                case 'rebuild-indexes': res = _toolRebuildIndexes(); break;
                case 'audit-log':     res = _toolAuditLog(); break;
                case 'clean-tokens':  res = _toolCleanTokens(); break;
                case 'danger-zone':   res = _toolDangerZone(); break;
                default: return { ok: false, reason: 'unknown_tool' };
            }

            _emit(MgmtEvents.TOOL_DONE, { tool: toolId, result: res, at: Date.now() });
            return res;
        } catch (err) {
            console.error('[admin-management] خطا در ابزار:', err);
            _emit(MgmtEvents.TOOL_FAIL, { tool: toolId, error: String(err), at: Date.now() });
            return { ok: false, reason: 'exception', error: String(err) };
        }
    }

    function _toolExportAll() {
        if (typeof Storage === 'undefined') return { ok: false };

        var data = {};
        var keys = Storage.keys('wamPay');
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            data[k] = Storage.getJSON(k, Storage.get(k, null));
        }

        var payload = {
            version: '1.0',
            exportedAt: Date.now(),
            exportedBy: _currentUserId(),
            data: data
        };

        var json = JSON.stringify(payload, null, 2);
        var blob;
        try {
            blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        } catch (e) {
            window.open('data:application/json;charset=utf-8,' + encodeURIComponent(json), '_blank');
            _emit(MgmtEvents.EXPORTED, { size: json.length, at: Date.now() });
            return { ok: true, size: json.length };
        }

        var ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        var filename = 'wamPay-backup-' + ts + '.json';

        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        }, 200);

        _emit(MgmtEvents.EXPORTED, { size: json.length, at: Date.now() });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('خروجی کامل داده‌ها آماده شد', 'موفق');
        }
        return { ok: true, size: json.length, keys: keys.length };
    }

    function _toolImportData() {
        // ایجاد input file و منتظر انتخاب
        return new Promise(function (resolve) {
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';

            input.addEventListener('change', function () {
                var file = input.files && input.files[0];
                if (!file) { resolve({ ok: false, reason: 'no_file' }); return; }

                var reader = new FileReader();
                reader.onload = function () {
                    try {
                        var payload = JSON.parse(reader.result);
                        if (!payload || !payload.data) {
                            resolve({ ok: false, reason: 'invalid_format' });
                            return;
                        }

                        var count = 0;
                        for (var k in payload.data) {
                            if (!Object.prototype.hasOwnProperty.call(payload.data, k)) continue;
                            var v = payload.data[k];
                            if (typeof v === 'string') Storage.set(k, v);
                            else Storage.setJSON(k, v);
                            count++;
                        }

                        if (typeof WamUI !== 'undefined') {
                            WamUI.toastSuccess(_formatNumber(count) +
                                ' کلید بازیابی شد', 'موفق');
                        }
                        _emit(MgmtEvents.IMPORTED, {
                            count: count, at: Date.now()
                        });
                        reload();
                        resolve({ ok: true, count: count });
                    } catch (err) {
                        resolve({ ok: false, reason: 'parse_error', error: String(err) });
                    }
                };
                reader.onerror = function () {
                    resolve({ ok: false, reason: 'read_error' });
                };
                reader.readAsText(file);
            });

            input.click();
        });
    }

    function _toolRebuildIndexes() {
        // شمارش مجدد پرونده‌ها بر اساس وضعیت‌ها + به‌روزرسانی آمار کاربران
        var stats = { cases: 0, byStatus: {}, users: 0 };

        if (typeof CaseRepository !== 'undefined') {
            var all = CaseRepository.getAll() || [];
            stats.cases = all.length;
            for (var i = 0; i < all.length; i++) {
                var c = all[i];
                if (!c) continue;
                var st = c.status || 'draft';
                stats.byStatus[st] = (stats.byStatus[st] || 0) + 1;
            }
        }

        var users = _loadUsers();
        stats.users = users.length;

        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('ایندکس‌ها بازسازی شد', 'موفق');
        }
        return { ok: true, stats: stats };
    }

    function _toolAuditLog() {
        var events = [];
        if (typeof EventBus !== 'undefined') {
            try {
                var h = EventBus.getHistory() || [];
                events = h.slice(-100).reverse();
            } catch (e) { /* بی‌صدا */ }
        }

        // نمایش در modal
        var existing = document.getElementById('wamAuditModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var rows = '';
        for (var i = 0; i < events.length; i++) {
            var ev = events[i];
            rows += '<tr>' +
                '<td>' + _escapeHtml(_relativeTime(ev.timestamp)) + '</td>' +
                '<td><code>' + _escapeHtml(ev.name || '') + '</code></td>' +
                '<td>' + _escapeHtml(JSON.stringify(ev.data || {}).slice(0, 120)) +
                '</td></tr>';
        }
        if (!rows) rows = '<tr><td colspan="3">رویدادی ثبت نشده</td></tr>';

        var modal = document.createElement('div');
        modal.id = 'wamAuditModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel wam-modal__panel--wide">' +
                '<header class="wam-modal__head">' +
                    '<h3>📋 لاگ رویدادها (۱۰۰ مورد آخر)</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<div class="wam-modal__body">' +
                    '<table class="wam-table">' +
                        '<thead><tr><th>زمان</th><th>رویداد</th><th>داده</th></tr></thead>' +
                        '<tbody>' + rows + '</tbody>' +
                    '</table>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);
        var cbs = modal.querySelectorAll('[data-close]');
        for (var k = 0; k < cbs.length; k++) {
            cbs[k].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }

        return { ok: true, count: events.length };
    }

    function _toolCleanTokens() {
        if (typeof Storage === 'undefined') return { ok: false };

        var cleaned = 0;
        var tokenRaw = Storage.getJSON('wamPayToken', null);
        if (tokenRaw && tokenRaw.expiresAt && tokenRaw.expiresAt < Date.now()) {
            Storage.remove('wamPayToken');
            cleaned++;
        }

        var remember = Storage.get('wamPayRemember', null);
        if (remember !== '1') {
            // sessionهای قدیمی را نگه‌دار
        }

        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess(_formatNumber(cleaned) + ' توکن منقضی پاک شد', 'موفق');
        }
        return { ok: true, cleaned: cleaned };
    }

    function _toolDangerZone() {
        var existing = document.getElementById('wamDangerModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var modal = document.createElement('div');
        modal.id = 'wamDangerModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel wam-modal__panel--danger">' +
                '<header class="wam-modal__head">' +
                    '<h3>⚠️ منطقه خطر</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<div class="wam-modal__body">' +
                    '<p class="wam-danger-note">' +
                    'عملیات زیر <strong>بازگشت‌ناپذیر</strong> هستند. با احتیاط عمل کنید.</p>' +

                    '<div class="wam-danger-item">' +
                        '<div><strong>حذف کش پرونده‌ها (V1)</strong>' +
                        '<small>فقط کلید wamPayCases</small></div>' +
                        '<button class="wam-btn wam-btn--danger" data-danger="cases-v1">اجرا</button>' +
                    '</div>' +

                    '<div class="wam-danger-item">' +
                        '<div><strong>پاکسازی توست‌ها و لاگ‌های UI</strong>' +
                        '<small>کش WamUI</small></div>' +
                        '<button class="wam-btn wam-btn--danger" data-danger="ui">اجرا</button>' +
                    '</div>' +

                    '<div class="wam-danger-item">' +
                        '<div><strong>پاک کردن کل localStorage</strong>' +
                        '<small>تمام داده‌های وام پی</small></div>' +
                        '<button class="wam-btn wam-btn--danger" data-danger="all">حذف همه</button>' +
                    '</div>' +

                '</div>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var i = 0; i < cbs.length; i++) {
            cbs[i].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }

        var dangerBtns = modal.querySelectorAll('[data-danger]');
        for (var j = 0; j < dangerBtns.length; j++) {
            dangerBtns[j].addEventListener('click', function () {
                var kind = this.getAttribute('data-danger');
                _runDanger(kind, modal);
            });
        }

        return { ok: true };
    }

    function _runDanger(kind, modal) {
        var msg;
        if (kind === 'cases-v1') {
            msg = 'حذف کش پرونده‌های قدیمی؟ این کار بازگشت‌ناپذیر است.';
        } else if (kind === 'ui') {
            msg = 'پاکسازی کش UI؟';
        } else if (kind === 'all') {
            msg = '⚠️ پاک کردن کل localStorage؟ تمام داده‌ها حذف می‌شوند!';
        }

        var doIt = function () {
            if (typeof Storage === 'undefined') return;
            if (kind === 'cases-v1') {
                Storage.remove('wamPayCases');
            } else if (kind === 'ui') {
                Storage.remove('wamUI');
            } else if (kind === 'all') {
                Storage.clearAll();
            }

            if (typeof WamUI !== 'undefined') {
                WamUI.toastWarning('عملیات منطقه خطر اجرا شد', 'توجه');
            }
            if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
        };

        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('منطقه خطر', msg, { danger: true }).then(function (ok) {
                if (ok) doIt();
            });
        } else if (window.confirm(msg)) {
            doIt();
        }
    }

    // ─────────────────────────────────────
    // 🎛️ فیلترها
    // ─────────────────────────────────────
    function _bindFilters() {
        if (!STATE.root) return;

        var s = STATE.root.querySelector('[data-mgmt="search"]');
        if (s) s.addEventListener('input', function () {
            STATE.query = this.value; STATE.page = 1; render();
        });

        var rf = STATE.root.querySelector('[data-mgmt="filter-role"]');
        if (rf) rf.addEventListener('change', function () {
            STATE.roleFilter = this.value; STATE.page = 1; render();
        });

        var sf = STATE.root.querySelector('[data-mgmt="filter-status"]');
        if (sf) sf.addEventListener('change', function () {
            STATE.statusFilter = this.value; STATE.page = 1; render();
        });

        var refBtn = STATE.root.querySelector('[data-mgmt-action="refresh"]');
        if (refBtn) refBtn.addEventListener('click', function (e) {
            e.preventDefault(); reload();
        });
    }

    // ─────────────────────────────────────
    // 🛠️ رندر ابزارها
    // ─────────────────────────────────────
    function _renderTools() {
        if (!STATE.root) return;
        var box = STATE.root.querySelector('[data-mgmt="tools"]');
        if (!box) return;

        var html = '';
        for (var i = 0; i < SENSITIVE_TOOLS.length; i++) {
            var t = SENSITIVE_TOOLS[i];
            html += '<div class="wam-tool-card" data-tool="' + t.id + '">' +
                    '<div class="wam-tool-card__icon">' + t.icon + '</div>' +
                    '<div class="wam-tool-card__body">' +
                        '<div class="wam-tool-card__title">' + _escapeHtml(t.title) + '</div>' +
                        '<div class="wam-tool-card__desc">' + _escapeHtml(t.description) + '</div>' +
                    '</div>' +
                    '<button class="wam-btn wam-btn--ghost" data-tool-run="' + t.id + '">اجرا</button>' +
                    '</div>';
        }
        box.innerHTML = html;

        var btns = box.querySelectorAll('[data-tool-run]');
        for (var j = 0; j < btns.length; j++) {
            btns[j].addEventListener('click', function () {
                var toolId = this.getAttribute('data-tool-run');
                var r = runTool(toolId);
                if (r && typeof r.then === 'function') {
                    // promise (import-data)
                }
            });
        }
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;
        _applyFilters();
        _renderTable();
        _renderTools();
    }

    function reload() {
        STATE.allUsers = _loadUsers();
        STATE.elevatedUsers = _extractElevated(STATE.allUsers);
        render();
        _emit(MgmtEvents.LOADED, {
            count: STATE.elevatedUsers.length,
            totalUsers: STATE.allUsers.length,
            at: Date.now()
        });
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        if (!_guardAccess()) return;

        var run = function () {
            var root = options.root ||
                       document.querySelector('[data-mgmt-root]') ||
                       document.querySelector('.wam-mgmt-panel');
            if (!root) {
                if (options.debug) console.warn('[admin-management] root پیدا نشد');
                return;
            }
            STATE.root = root;
            STATE.allUsers = _loadUsers();
            STATE.elevatedUsers = _extractElevated(STATE.allUsers);

            _bindFilters();
            render();

            STATE.installed = true;
            _emit(MgmtEvents.LOADED, {
                count: STATE.elevatedUsers.length,
                at: Date.now()
            });
            if (options.debug) console.log('[admin-management] آماده، ' +
                STATE.elevatedUsers.length + ' ارشد');
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
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            total: STATE.elevatedUsers.length,
            filtered: STATE.filtered.length,
            page: STATE.page,
            query: STATE.query,
            roleFilter: STATE.roleFilter,
            statusFilter: STATE.statusFilter,
            isSuperAdmin: _isSuperAdmin(),
            superAdminsCount: _countSuperAdmins()
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
    var WamAdminManagement = {
        EVENTS: MgmtEvents,
        ROLE_LABELS: ROLE_LABELS,
        STATUS_LABELS: STATUS_LABELS,
        ELEVATED_ROLES: ELEVATED_ROLES,
        SENSITIVE_TOOLS: SENSITIVE_TOOLS,
        PAGE_SIZE: PAGE_SIZE,

        install: install,
        uninstall: uninstall,
        reload: reload,
        render: render,

        promoteUser: promoteUser,
        demoteUser: demoteUser,
        suspendUser: suspendUser,
        reactivateUser: reactivateUser,
        removeElevated: removeElevated,

        runTool: runTool,

        getElevatedUsers: function () { return STATE.elevatedUsers.slice(); },
        getFiltered: function () { return STATE.filtered.slice(); },
        findById: _findById,
        computeStats: computeStats,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamAdminManagement = WamAdminManagement;
    window.MgmtEvents = MgmtEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var body = document.body;
            if (!body) return;
            if (body.hasAttribute('data-admin-management') ||
                document.querySelector('[data-mgmt-root]') ||
                document.querySelector('.wam-mgmt-panel')) {
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