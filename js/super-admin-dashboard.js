// ==========================================
// وام پی — Admin Panel
// فایل: super-admin-dashboard.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: داشبورد مدیر ارشد — نمای کلی، ادمین‌ها، ابزارها، لاگ
//        🔒 فقط super_admin
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var USERS_KEY     = 'wamPayUsers';
    var BROKERS_KEY   = 'wamPayBrokers';
    var AUDIT_LIMIT   = 15;
    var AUTOREFRESH_MS = 90000;   // ۹۰ ثانیه

    var ROLE_LABELS = {
        super_admin: 'مدیر ارشد',
        admin:       'ادمین کل',
        verifier:    'اعتبارسنج',
        broker:      'کارگزار',
        applicant:   'متقاضی'
    };

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        stats: null,
        elevatedUsers: [],
        recentEvents: [],
        auditPreview: [],
        autoRefreshTimer: null,
        listeners: [],
        lastUpdate: null
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var SuperEvents = {
        READY:     'sadmin.dash.ready',
        UPDATED:   'sadmin.dash.updated',
        REFRESH:   'sadmin.dash.refresh',
        ACTION:    'sadmin.dash.action',
        SHORTCUT:  'sadmin.dash.shortcut'
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
    // 🔒 دسترسی — فقط super_admin
    // ─────────────────────────────────────
    function _isSuperAdmin() {
        if (typeof WamPermissions === 'undefined') return false;
        var me = WamPermissions.getCurrentUser();
        return !!(me && WamPermissions.isSuperAdmin(me));
    }

    function _guardAccess() {
        if (!_isSuperAdmin()) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('فقط مدیر ارشد به این داشبورد دسترسی دارد', 'خطا');
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

    function _formatAmount(n) {
        if (n === null || n === undefined || n === '') return '—';
        var num = Number(n);
        if (isNaN(num)) return '—';
        var f = num.toLocaleString('en-US');
        var fa = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
        return f.replace(/[0-9]/g, function (d) { return fa[+d]; });
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

    // ─────────────────────────────────────
    // 📥 بارگذاری
    // ─────────────────────────────────────
    function _loadUsers() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(USERS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _loadBrokers() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(BROKERS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _loadAllCases() {
        if (typeof CaseRepository === 'undefined') return [];
        try { return CaseRepository.getAll() || []; } catch (e) { return []; }
    }

    // ─────────────────────────────────────
    // 🎭 استخراج کاربران ارشد
    // ─────────────────────────────────────
    function _extractElevated(users) {
        var out = [];
        for (var i = 0; i < users.length; i++) {
            var u = users[i];
            if (!u) continue;
            if (u.role === 'admin' || u.role === 'super_admin' ||
                u.role === 'verifier') {
                out.push(u);
            }
        }
        // مرتب بر اساس lastLogin
        out.sort(function (a, b) {
            var ta = a.lastLogin || a.createdAt || 0;
            var tb = b.lastLogin || b.createdAt || 0;
            return tb - ta;
        });
        return out;
    }

    // ─────────────────────────────────────
    // 📊 محاسبه آمار
    // ─────────────────────────────────────
    function computeStats() {
        var users = _loadUsers();
        var brokers = _loadBrokers();
        var cases = _loadAllCases();

        var byRole = {};
        var totalActive = 0;
        for (var i = 0; i < users.length; i++) {
            var u = users[i];
            if (!u) continue;
            var r = u.role || 'unknown';
            byRole[r] = (byRole[r] || 0) + 1;
            if (u.active !== false && u.status !== 'inactive' &&
                u.status !== 'blocked' && u.status !== 'suspended') {
                totalActive++;
            }
        }

        // آمار پرونده
        var casesByStatus = {};
        var totalAmount = 0;
        var completedAmount = 0;
        for (var j = 0; j < cases.length; j++) {
            var c = cases[j];
            if (!c) continue;
            var st = c.status || 'draft';
            casesByStatus[st] = (casesByStatus[st] || 0) + 1;
            var amt = Number(c.loanAmount) || 0;
            totalAmount += amt;
            if (st === 'completed') completedAmount += amt;
        }

        // آمار کارگزار
        var brokersActive = 0;
        for (var k = 0; k < brokers.length; k++) {
            if (brokers[k] && brokers[k].active !== false) brokersActive++;
        }

        // Storage info
        var storageInfo = null;
        try {
            if (typeof Storage !== 'undefined' && Storage.getInfo) {
                storageInfo = Storage.getInfo();
            }
        } catch (e) { /* بی‌صدا */ }

        return {
            users: {
                total: users.length,
                active: totalActive,
                byRole: byRole,
                superAdmins: byRole['super_admin'] || 0,
                admins: byRole['admin'] || 0,
                verifiers: byRole['verifier'] || 0,
                brokers: byRole['broker'] || 0,
                applicants: byRole['applicant'] || 0
            },
            brokers: {
                total: brokers.length,
                active: brokersActive
            },
            cases: {
                total: cases.length,
                byStatus: casesByStatus,
                completed: casesByStatus['completed'] || 0,
                inProgress: casesByStatus['in_progress'] || 0,
                rejected: casesByStatus['rejected'] || 0,
                totalAmount: totalAmount,
                completedAmount: completedAmount
            },
            system: {
                storage: storageInfo,
                version: (typeof WamPay !== 'undefined' && WamPay.version) || '1.0.0',
                uptime: _getUptime(),
                isReady: (typeof WamPay !== 'undefined' && WamPay.isReady) || false
            },
            computedAt: Date.now()
        };
    }

    function _getUptime() {
        try {
            if (typeof WamPay !== 'undefined' && WamPay.readyAt) {
                return Date.now() - WamPay.readyAt;
            }
        } catch (e) { /* بی‌صدا */ }
        return 0;
    }

    function _formatUptime(ms) {
        if (!ms || ms < 0) return '—';
        var s = Math.floor(ms / 1000);
        var m = Math.floor(s / 60);
        var h = Math.floor(m / 60);
        var d = Math.floor(h / 24);
        if (d > 0) return _formatNumber(d) + ' روز';
        if (h > 0) return _formatNumber(h) + ' ساعت';
        if (m > 0) return _formatNumber(m) + ' دقیقه';
        return _formatNumber(s) + ' ثانیه';
    }

    // ─────────────────────────────────────
    // 📋 رویدادهای اخیر
    // ─────────────────────────────────────
    function _getRecentEvents(limit) {
        limit = limit || AUDIT_LIMIT;
        if (typeof EventBus === 'undefined') return [];
        var events = [];
        try {
            var h = EventBus.getHistory() || [];
            for (var i = h.length - 1; i >= 0 && events.length < limit; i--) {
                var ev = h[i];
                if (!ev || !ev.name) continue;
                events.push({
                    name: ev.name,
                    data: ev.data || {},
                    timestamp: ev.timestamp || 0
                });
            }
        } catch (e) { /* بی‌صدا */ }
        return events;
    }

    function _eventIcon(name) {
        if (!name) return '•';
        if (name.indexOf('setup.') === 0) return '👑';
        if (name.indexOf('login.') === 0) return '🔑';
        if (name.indexOf('case.') === 0) return '📁';
        if (name.indexOf('approval.') === 0) return '✅';
        if (name.indexOf('admin.mgmt.') === 0) return '⚙️';
        if (name.indexOf('admin.users.') === 0) return '👥';
        if (name.indexOf('admin.brokers.') === 0) return '💼';
        if (name.indexOf('admin.cases.') === 0) return '📋';
        if (name.indexOf('sm.') === 0) return '➡️';
        return '•';
    }

    function _eventLabel(name) {
        var map = {
            'setup.success':           'راه‌اندازی مدیر ارشد',
            'login.success':           'ورود موفق',
            'login.fail':              'ورود ناموفق',
            'login.locked':            'قفل حساب',
            'case.created':            'پرونده جدید',
            'case.updated':            'به‌روزرسانی پرونده',
            'case.deleted':            'حذف پرونده',
            'case.completed':          'پرونده تکمیل شد',
            'approval.approved':       'تأیید ادمین',
            'approval.rejected':       'رد ادمین',
            'admin.mgmt.promoted':     'ترفیع کاربر',
            'admin.mgmt.demoted':      'تنزل کاربر',
            'admin.mgmt.suspended':    'تعلیق کاربر',
            'admin.mgmt.reactivated':  'فعال‌سازی کاربر',
            'admin.mgmt.exported':     'خروجی داده',
            'admin.mgmt.imported':     'ورود داده',
            'admin.users.created':     'کاربر جدید',
            'admin.brokers.created':   'کارگزار جدید',
            'admin.cases.status_changed': 'تغییر وضعیت پرونده',
            'sm.case.finished':        'پایان پرونده'
        };
        return map[name] || name;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت آمار
    // ─────────────────────────────────────
    function _renderStatCard(label, value, icon, extra, accent) {
        extra = extra || '';
        accent = accent || '';
        return '' +
            '<div class="wam-stat' + (accent ? ' wam-stat--' + accent : '') + '">' +
                '<div class="wam-stat__icon">' + _escapeHtml(icon) + '</div>' +
                '<div class="wam-stat__body">' +
                    '<div class="wam-stat__value">' + _formatNumber(value) + '</div>' +
                    '<div class="wam-stat__label">' + _escapeHtml(label) + '</div>' +
                    (extra ? '<div class="wam-stat__extra">' + extra + '</div>' : '') +
                '</div>' +
            '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت نقش‌ها
    // ─────────────────────────────────────
    function _renderRolesBreakdown(byRole) {
        var roles = ['super_admin', 'admin', 'verifier', 'broker', 'applicant'];
        var colors = {
            super_admin: 'gold',
            admin: 'green',
            verifier: 'blue',
            broker: 'orange',
            applicant: 'gray'
        };
        var html = '';
        for (var i = 0; i < roles.length; i++) {
            var r = roles[i];
            var count = byRole[r] || 0;
            if (count === 0 && r !== 'super_admin' && r !== 'admin') continue;
            html += '<div class="wam-role-chip wam-role-chip--' +
                    colors[r] + '">' +
                    '<span class="wam-role-chip__count">' +
                    _formatNumber(count) + '</span>' +
                    '<span class="wam-role-chip__label">' +
                    _escapeHtml(ROLE_LABELS[r] || r) + '</span>' +
                    '</div>';
        }
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ادمین‌ها
    // ─────────────────────────────────────
    function _renderElevatedUsers(users) {
        if (!users || users.length === 0) {
            return '<div class="wam-dash__empty">کاربر ارشدی وجود ندارد.</div>';
        }
        var html = '<ul class="wam-elevated-list">';
        var limit = Math.min(users.length, 6);
        for (var i = 0; i < limit; i++) {
            var u = users[i];
            var roleLabel = ROLE_LABELS[u.role] || u.role;
            var st = u.status || (u.active === false ? 'inactive' : 'active');
            html += '<li class="wam-elevated-item">' +
                '<div class="wam-elevated-item__avatar">' +
                    _escapeHtml((u.name || u.username || '؟').charAt(0)) +
                '</div>' +
                '<div class="wam-elevated-item__body">' +
                    '<div class="wam-elevated-item__name">' +
                        _escapeHtml(u.name || u.username) + '</div>' +
                    '<div class="wam-elevated-item__role">' +
                        _escapeHtml(roleLabel) +
                        ' · <span class="wam-elevated-item__status wam-status--' + st + '">' +
                        (st === 'active' ? 'فعال' : st) + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="wam-elevated-item__time">' +
                    _escapeHtml(_relativeTime(u.lastLogin || u.createdAt)) +
                '</div>' +
            '</li>';
        }
        html += '</ul>';
        if (users.length > limit) {
            html += '<div class="wam-more-link">' +
                '<a href="admin-management.html">مشاهده همه (' +
                _formatNumber(users.length) + ')</a></div>';
        }
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ابزارهای سریع
    // ─────────────────────────────────────
    function _renderQuickTools() {
        var tools = [
            { id: 'users',     icon: '👥', label: 'کاربران',        href: 'admin-users.html' },
            { id: 'brokers',   icon: '💼', label: 'کارگزاران',      href: 'admin-brokers.html' },
            { id: 'cases',     icon: '📁', label: 'پرونده‌ها',      href: 'admin-cases.html' },
            { id: 'consults',  icon: '💬', label: 'مشاوره‌ها',      href: 'admin-consultations.html' },
            { id: 'mgmt',      icon: '⚙️', label: 'مدیریت ادمین‌ها', href: 'admin-management.html' },
            { id: 'create',    icon: '➕', label: 'ساخت کاربر',     href: 'admin-create.html' },
            { id: 'export',    icon: '📦', label: 'خروجی کامل',     action: 'export-all' },
            { id: 'debug',     icon: '🛠️', label: 'پنل دیباگ',      action: 'debug' }
        ];
        var html = '<div class="wam-quick-tools">';
        for (var i = 0; i < tools.length; i++) {
            var t = tools[i];
            if (t.href) {
                html += '<a class="wam-quick-tool" href="' + t.href + '">' +
                        '<span class="wam-quick-tool__icon">' + t.icon + '</span>' +
                        '<span class="wam-quick-tool__label">' + _escapeHtml(t.label) + '</span>' +
                        '</a>';
            } else {
                html += '<button class="wam-quick-tool" data-shortcut="' +
                        _escapeHtml(t.action) + '">' +
                        '<span class="wam-quick-tool__icon">' + t.icon + '</span>' +
                        '<span class="wam-quick-tool__label">' + _escapeHtml(t.label) + '</span>' +
                        '</button>';
            }
        }
        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — لاگ رویدادها
    // ─────────────────────────────────────
    function _renderAuditLog(events) {
        if (!events || events.length === 0) {
            return '<div class="wam-dash__empty">رویدادی ثبت نشده است.</div>';
        }
        var html = '<ul class="wam-audit-list">';
        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            html += '<li class="wam-audit-item">' +
                '<span class="wam-audit-item__icon">' +
                    _eventIcon(e.name) + '</span>' +
                '<span class="wam-audit-item__text">' +
                    _escapeHtml(_eventLabel(e.name)) + '</span>' +
                '<span class="wam-audit-item__time">' +
                    _escapeHtml(_relativeTime(e.timestamp)) + '</span>' +
            '</li>';
        }
        html += '</ul>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — وضعیت سیستم
    // ─────────────────────────────────────
    function _renderSystemStatus(sys) {
        var storage = sys.storage || {};
        var percent = storage.percent || 0;
        var pctColor = percent > 80 ? 'red' : (percent > 60 ? 'orange' : 'green');

        return '' +
            '<div class="wam-sys-status">' +
                '<div class="wam-sys-row">' +
                    '<span class="wam-sys-label">وضعیت هسته:</span>' +
                    '<span class="wam-sys-value">' +
                        (sys.isReady ? '✅ آماده' : '⚠️ ناقص') +
                    '</span>' +
                '</div>' +
                '<div class="wam-sys-row">' +
                    '<span class="wam-sys-label">نسخه:</span>' +
                    '<span class="wam-sys-value">' +
                        _escapeHtml(sys.version) + '</span>' +
                '</div>' +
                '<div class="wam-sys-row">' +
                    '<span class="wam-sys-label">زمان اجرا:</span>' +
                    '<span class="wam-sys-value">' +
                        _escapeHtml(_formatUptime(sys.uptime)) + '</span>' +
                '</div>' +
                '<div class="wam-sys-row">' +
                    '<span class="wam-sys-label">حافظه:</span>' +
                    '<span class="wam-sys-value">' +
                        _escapeHtml(storage.sizeKB || '?') + 'KB' +
                        ' (' + _formatNumber(percent) + '%)' +
                    '</span>' +
                '</div>' +
                '<div class="wam-sys-bar">' +
                    '<div class="wam-sys-bar__fill wam-sys-bar__fill--' +
                        pctColor + '" style="width:' + percent + '%"></div>' +
                '</div>' +
            '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;
        var root = STATE.root;

        var stats = STATE.stats || computeStats();
        var elevated = STATE.elevatedUsers || [];
        var events = STATE.auditPreview || [];

        // ۱. کارت‌های بالایی
        var statsBox = root.querySelector('[data-sadmin="stats"]');
        if (statsBox) {
            var html = '';
            html += _renderStatCard('مدیران ارشد', stats.users.superAdmins, '👑', '', 'gold');
            html += _renderStatCard('ادمین‌ها', stats.users.admins, '⚙️', '', 'primary');
            html += _renderStatCard('اعتبارسنج', stats.users.verifiers, '🔍', '', 'info');
            html += _renderStatCard('کارگزاران', stats.brokers.total, '💼',
                'فعال: ' + _formatNumber(stats.brokers.active), 'success');
            html += _renderStatCard('پرونده‌ها', stats.cases.total, '📁',
                'تکمیل: ' + _formatNumber(stats.cases.completed));
            html += _renderStatCard('کل کاربران', stats.users.total, '👥',
                'فعال: ' + _formatNumber(stats.users.active));
            statsBox.innerHTML = html;
        }

        // ۲. تفکیک نقش‌ها
        var rolesBox = root.querySelector('[data-sadmin="roles"]');
        if (rolesBox) {
            rolesBox.innerHTML = _renderRolesBreakdown(stats.users.byRole);
        }

        // ۳. ادمین‌ها
        var elevatedBox = root.querySelector('[data-sadmin="elevated"]');
        if (elevatedBox) {
            elevatedBox.innerHTML = _renderElevatedUsers(elevated);
        }

        // ۴. ابزارهای سریع
        var toolsBox = root.querySelector('[data-sadmin="tools"]');
        if (toolsBox) {
            toolsBox.innerHTML = _renderQuickTools();
            _bindQuickTools(toolsBox);
        }

        // ۵. لاگ رویداد
        var auditBox = root.querySelector('[data-sadmin="audit"]');
        if (auditBox) {
            auditBox.innerHTML = _renderAuditLog(events);
        }

        // ۶. وضعیت سیستم
        var sysBox = root.querySelector('[data-sadmin="system"]');
        if (sysBox) {
            sysBox.innerHTML = _renderSystemStatus(stats.system);
        }

        // ۷. آخرین بروزرسانی
        var updatedEl = root.querySelector('[data-sadmin="updated-at"]');
        if (updatedEl) {
            updatedEl.textContent = 'آخرین بروزرسانی: ' + _relativeTime(Date.now());
        }

        // ۸. تاریخ
        var dateEl = root.querySelector('[data-sadmin="today"]');
        if (dateEl) {
            dateEl.textContent = _jalali(Date.now());
        }

        STATE.lastUpdate = Date.now();
        _emit(SuperEvents.UPDATED, {
            stats: stats,
            elevatedCount: elevated.length,
            at: STATE.lastUpdate
        });
    }

    // ─────────────────────────────────────
    // 🎯 ابزارهای سریع
    // ─────────────────────────────────────
    function _bindQuickTools(box) {
        var btns = box.querySelectorAll('[data-shortcut]');
        for (var i = 0; i < btns.length; i++) {
            if (btns[i].dataset.bound) continue;
            btns[i].addEventListener('click', _handleShortcut);
            btns[i].dataset.bound = '1';
        }
    }

    function _handleShortcut(e) {
        e.preventDefault();
        var action = this.getAttribute('data-shortcut');
        _emit(SuperEvents.SHORTCUT, { action: action, at: Date.now() });
        _emit(SuperEvents.ACTION, { action: action, at: Date.now() });

        if (action === 'export-all') {
            if (typeof WamAdminManagement !== 'undefined' &&
                WamAdminManagement.runTool) {
                WamAdminManagement.runTool('export-all');
            }
        } else if (action === 'debug') {
            if (typeof WamUI !== 'undefined' && WamUI.openDebug) {
                WamUI.openDebug();
            }
        }
    }

    // ─────────────────────────────────────
    // 🔄 بروزرسانی
    // ─────────────────────────────────────
    function refresh(options) {
        options = options || {};
        if (!STATE.root) return false;

        STATE.stats = computeStats();
        STATE.elevatedUsers = _extractElevated(_loadUsers());
        STATE.auditPreview = _getRecentEvents(AUDIT_LIMIT);

        render();

        _emit(SuperEvents.REFRESH, { at: Date.now() });

        if (!options.silent && typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('داشبورد بروزرسانی شد', 'موفق');
        }
        return true;
    }

    // ─────────────────────────────────────
    // ⏱️ بروزرسانی خودکار
    // ─────────────────────────────────────
    function _startAutoRefresh() {
        _stopAutoRefresh();
        STATE.autoRefreshTimer = setInterval(function () {
            try {
                STATE.stats = computeStats();
                STATE.elevatedUsers = _extractElevated(_loadUsers());
                STATE.auditPreview = _getRecentEvents(AUDIT_LIMIT);
                render();
            } catch (e) { /* بی‌صدا */ }
        }, AUTOREFRESH_MS);
    }

    function _stopAutoRefresh() {
        if (STATE.autoRefreshTimer) {
            clearInterval(STATE.autoRefreshTimer);
            STATE.autoRefreshTimer = null;
        }
    }

    // ─────────────────────────────────────
    // 🎯 بایند دکمه‌های هدر
    // ─────────────────────────────────────
    function _bindHeaderActions(root) {
        var refreshBtn = root.querySelector('[data-sadmin-action="refresh"]');
        if (refreshBtn && !refreshBtn.dataset.bound) {
            refreshBtn.addEventListener('click', function (e) {
                e.preventDefault();
                refresh();
            });
            refreshBtn.dataset.bound = '1';
        }

        var exportBtn = root.querySelector('[data-sadmin-action="export"]');
        if (exportBtn && !exportBtn.dataset.bound) {
            exportBtn.addEventListener('click', function (e) {
                e.preventDefault();
                if (typeof WamAdminManagement !== 'undefined' &&
                    WamAdminManagement.runTool) {
                    WamAdminManagement.runTool('export-all');
                }
            });
            exportBtn.dataset.bound = '1';
        }

        var auditBtn = root.querySelector('[data-sadmin-action="audit"]');
        if (auditBtn && !auditBtn.dataset.bound) {
            auditBtn.addEventListener('click', function (e) {
                e.preventDefault();
                if (typeof WamAdminManagement !== 'undefined' &&
                    WamAdminManagement.runTool) {
                    WamAdminManagement.runTool('audit-log');
                }
            });
            auditBtn.dataset.bound = '1';
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
        if (!_guardAccess()) return;

        var run = function () {
            var root = options.root ||
                       document.querySelector('[data-sadmin-root]') ||
                       document.querySelector('.wam-super-dashboard');
            if (!root) {
                if (options.debug) console.warn('[super-admin-dashboard] root پیدا نشد');
                return;
            }

            STATE.root = root;

            // بارگذاری اولیه
            STATE.stats = computeStats();
            STATE.elevatedUsers = _extractElevated(_loadUsers());
            STATE.auditPreview = _getRecentEvents(AUDIT_LIMIT);

            render();

            _bindHeaderActions(root);

            // بروزرسانی خودکار
            if (options.autoRefresh !== false) {
                _startAutoRefresh();
            }

            STATE.installed = true;

            _emit(SuperEvents.READY, {
                stats: STATE.stats,
                at: Date.now()
            });

            if (options.debug) {
                console.log('[super-admin-dashboard] آماده',
                    STATE.stats);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run);
        } else {
            run();
        }
    }

    function uninstall() {
        _stopAutoRefresh();
        STATE.root = null;
        STATE.installed = false;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            isSuperAdmin: _isSuperAdmin(),
            lastUpdate: STATE.lastUpdate,
            autoRefresh: !!STATE.autoRefreshTimer,
            stats: STATE.stats,
            elevatedCount: STATE.elevatedUsers.length,
            eventsCount: STATE.auditPreview.length
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
    var WamSuperDashboard = {
        EVENTS: SuperEvents,
        AUTOREFRESH_MS: AUTOREFRESH_MS,
        AUDIT_LIMIT: AUDIT_LIMIT,
        ROLE_LABELS: ROLE_LABELS,

        install: install,
        uninstall: uninstall,
        refresh: refresh,
        render: render,

        computeStats: computeStats,
        getElevatedUsers: function () { return STATE.elevatedUsers.slice(); },
        getRecentEvents: _getRecentEvents,

        startAutoRefresh: _startAutoRefresh,
        stopAutoRefresh: _stopAutoRefresh,

        formatNumber: _formatNumber,
        formatAmount: _formatAmount,
        relativeTime: _relativeTime,
        formatUptime: _formatUptime,

        isSuperAdmin: _isSuperAdmin,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamSuperDashboard = WamSuperDashboard;
    window.SuperEvents = SuperEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var body = document.body;
            if (!body) return;
            if (body.hasAttribute('data-super-admin-dashboard') ||
                document.querySelector('[data-sadmin-root]') ||
                document.querySelector('.wam-super-dashboard')) {
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