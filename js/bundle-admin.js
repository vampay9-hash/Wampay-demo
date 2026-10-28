/* ==========================================
 * WAM PAY — ⚙️ Admin Bundle
 * ==========================================
 * 
 * Bundle خودکار
 * تعداد فایل: 1
 * تاریخ تولید: 2026-09-22T18:54:24.892Z
 * 
 * این فایل به صورت خودکار از چند فایل جداگانه
 * ادغام شده است. تغییرات مستقیم در این فایل
 * با اجرای بعدی Builder پاک می‌شوند.
 * ========================================== */




/* ==========================================
 * FROM: js/admin-dashboard.js
 * ========================================== */


// ==========================================
// وام پی — Admin Panel
// فایل: admin-dashboard.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: داشبورد ادمین — آمار، آخرین پرونده‌ها، فعالیت‌ها
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var USERS_KEY        = 'wamPayUsers';
    var BROKERS_KEY      = 'wamPayBrokers';
    var CONSULT_KEY      = 'wamPayConsultations';
    var AUTOREFRESH_MS   = 60000;   // ۶۰ ثانیه

    var CLASS_LOADING    = 'wam-dash--loading';
    var CLASS_READY      = 'wam-dash--ready';
    var CLASS_EMPTY      = 'wam-dash__empty';

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        stats: null,
        recentCases: [],
        recentActivity: [],
        autoRefreshTimer: null,
        listeners: [],
        lastUpdate: null
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var DashEvents = {
        READY:     'dash.ready',
        UPDATED:   'dash.updated',
        REFRESH:   'dash.refresh',
        ACTION:    'dash.action'
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
    // 🔍 ابزارهای کمکی
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
        if (n === null || n === undefined) return '۰';
        var s = String(n);
        var fa = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
        s = s.replace(/[0-9]/g, function (d) { return fa[+d]; });
        // جداکننده هزارگان
        return s.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
    }

    function _formatAmount(n) {
        if (n === null || n === undefined || n === '') return '—';
        var num = Number(n);
        if (isNaN(num)) return '—';
        var formatted = num.toLocaleString('en-US');
        var fa = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
        return formatted.replace(/[0-9]/g, function (d) { return fa[+d]; });
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

    function _jalaliDate(ts) {
        if (!ts) return '—';
        try {
            if (typeof WamPersianDate !== 'undefined') {
                var d = new Date(ts);
                var j = WamPersianDate.dateToJalali(d);
                if (j) {
                    return WamPersianDate.format(j.jy, j.jm, j.jd, 'YYYY/MM/DD');
                }
            }
        } catch (e) { /* بی‌صدا */ }
        var date = new Date(ts);
        return date.toLocaleDateString('fa-IR');
    }

    // ─────────────────────────────────────
    // 👥 بارگذاری داده‌ها
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

    function _loadConsultations() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(CONSULT_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _loadAllCases() {
        if (typeof CaseRepository === 'undefined') return [];
        try { return CaseRepository.getAll() || []; } catch (e) { return []; }
    }

    // ─────────────────────────────────────
    // 📊 محاسبه آمار
    // ─────────────────────────────────────
    function computeStats() {
        var users = _loadUsers();
        var brokers = _loadBrokers();
        var consultations = _loadConsultations();
        var cases = _loadAllCases();

        var usersActive = 0;
        var usersByRole = {};
        for (var i = 0; i < users.length; i++) {
            var u = users[i];
            if (!u) continue;
            if (u.active !== false && u.status !== 'inactive' &&
                u.status !== 'blocked' && u.status !== 'suspended') {
                usersActive++;
            }
            var r = u.role || 'unknown';
            usersByRole[r] = (usersByRole[r] || 0) + 1;
        }

        // آمار پرونده‌ها
        var casesByStatus = {};
        var casesByStep = {};
        var totalLoanAmount = 0;
        var completedAmount = 0;

        for (var j = 0; j < cases.length; j++) {
            var c = cases[j];
            if (!c) continue;

            var st = c.status || 'draft';
            casesByStatus[st] = (casesByStatus[st] || 0) + 1;

            var currentStep = c.currentStep || 'unknown';
            casesByStep[currentStep] = (casesByStep[currentStep] || 0) + 1;

            var amount = Number(c.loanAmount) || 0;
            totalLoanAmount += amount;
            if (st === 'completed') completedAmount += amount;
        }

        // آمار مشاوره‌ها
        var consultPending = 0;
        var consultDone = 0;
        for (var k = 0; k < consultations.length; k++) {
            var cc = consultations[k];
            if (!cc) continue;
            if (cc.status === 'completed' || cc.status === 'closed') consultDone++;
            else consultPending++;
        }

        // آمار کارگزاران
        var brokersActive = 0;
        for (var m = 0; m < brokers.length; m++) {
            if (brokers[m] && brokers[m].active !== false) brokersActive++;
        }

        var stats = {
            users: {
                total: users.length,
                active: usersActive,
                inactive: users.length - usersActive,
                byRole: usersByRole
            },
            brokers: {
                total: brokers.length,
                active: brokersActive
            },
            cases: {
                total: cases.length,
                byStatus: casesByStatus,
                byStep: casesByStep,
                completed: casesByStatus['completed'] || 0,
                inProgress: casesByStatus['in_progress'] || 0,
                rejected: casesByStatus['rejected'] || 0,
                draft: casesByStatus['draft'] || 0,
                totalAmount: totalLoanAmount,
                completedAmount: completedAmount
            },
            consultations: {
                total: consultations.length,
                pending: consultPending,
                done: consultDone
            },
            computedAt: Date.now()
        };

        return stats;
    }

    // ─────────────────────────────────────
    // 📋 آخرین پرونده‌ها
    // ─────────────────────────────────────
    function _getRecentCases(limit) {
        limit = limit || 10;
        var cases = _loadAllCases();
        if (cases.length === 0) return [];

        // مرتب‌سازی بر اساس آخرین به‌روزرسانی
        cases.sort(function (a, b) {
            var ta = (a && (a.updatedAt || a.createdAt)) || 0;
            var tb = (b && (b.updatedAt || b.createdAt)) || 0;
            return tb - ta;
        });

        var out = [];
        for (var i = 0; i < Math.min(limit, cases.length); i++) {
            var c = cases[i];
            if (!c) continue;
            out.push({
                caseId: c.caseId || c.id,
                applicantName: c.applicantName || '—',
                bank: c.bank || '—',
                loanAmount: c.loanAmount || 0,
                status: c.status || 'draft',
                currentStep: c.currentStep || '—',
                updatedAt: c.updatedAt || c.createdAt || null
            });
        }
        return out;
    }

    // ─────────────────────────────────────
    // ⚡ آخرین فعالیت‌ها
    // ─────────────────────────────────────
    function _getRecentActivity(limit) {
        limit = limit || 15;
        var events = [];
        if (typeof EventBus === 'undefined') return [];
        try {
            var history = EventBus.getHistory() || [];
            for (var i = history.length - 1; i >= 0 && events.length < limit; i--) {
                var ev = history[i];
                if (!ev || !ev.name) continue;
                if (ev.name.indexOf('case.') !== 0 &&
                    ev.name.indexOf('approval.') !== 0 &&
                    ev.name.indexOf('sm.') !== 0) continue;
                events.push({
                    name: ev.name,
                    data: ev.data || {},
                    timestamp: ev.timestamp || 0
                });
            }
        } catch (e) { /* بی‌صدا */ }
        return events;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت آمار
    // ─────────────────────────────────────
    function _renderStatCard(label, value, icon, extra) {
        extra = extra || '';
        return '' +
            '<div class="wam-stat">' +
                '<div class="wam-stat__icon">' + _escapeHtml(icon) + '</div>' +
                '<div class="wam-stat__body">' +
                    '<div class="wam-stat__value">' + _formatNumber(value) + '</div>' +
                    '<div class="wam-stat__label">' + _escapeHtml(label) + '</div>' +
                    (extra ? '<div class="wam-stat__extra">' + extra + '</div>' : '') +
                '</div>' +
            '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — جدول پرونده‌ها
    // ─────────────────────────────────────
    function _renderRecentCases(cases) {
        if (!cases || cases.length === 0) {
            return '<div class="' + CLASS_EMPTY + '">هیچ پرونده‌ای یافت نشد.</div>';
        }

        var html = '<div class="wam-table-wrap"><table class="wam-table">';
        html += '<thead><tr>';
        html += '<th>شناسه</th>';
        html += '<th>متقاضی</th>';
        html += '<th>بانک</th>';
        html += '<th>مبلغ</th>';
        html += '<th>وضعیت</th>';
        html += '<th>آخرین تغییر</th>';
        html += '</tr></thead><tbody>';

        for (var i = 0; i < cases.length; i++) {
            var c = cases[i];
            html += '<tr data-case-id="' + _escapeHtml(c.caseId) + '">';
            html += '<td><a href="case-details.html?id=' + encodeURIComponent(c.caseId) + '">' +
                    _escapeHtml(c.caseId) + '</a></td>';
            html += '<td>' + _escapeHtml(c.applicantName) + '</td>';
            html += '<td>' + _escapeHtml(c.bank) + '</td>';
            html += '<td>' + _formatAmount(c.loanAmount) + '</td>';
            html += '<td><span class="wam-badge wam-badge--' + _escapeHtml(c.status) + '">' +
                    _escapeHtml(_statusLabel(c.status)) + '</span></td>';
            html += '<td>' + _escapeHtml(_relativeTime(c.updatedAt)) + '</td>';
            html += '</tr>';
        }

        html += '</tbody></table></div>';
        return html;
    }

    function _statusLabel(status) {
        var map = {
            draft:        'پیش‌نویس',
            in_progress:  'در جریان',
            pending:      'در انتظار',
            approved:     'تأییدشده',
            completed:    'تکمیل‌شده',
            rejected:     'رد شده',
            cancelled:    'لغو شده',
            archived:     'بایگانی',
            rolledback:   'بازگشت‌خورده'
        };
        return map[status] || status || '—';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — فعالیت‌ها
    // ─────────────────────────────────────
    function _renderActivity(events) {
        if (!events || events.length === 0) {
            return '<div class="' + CLASS_EMPTY + '">فعالیتی ثبت نشده است.</div>';
        }
        var html = '<ul class="wam-activity">';
        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            html += '<li class="wam-activity__item">';
            html += '<span class="wam-activity__icon">' + _eventIcon(e.name) + '</span>';
            html += '<span class="wam-activity__text">' + _escapeHtml(_eventLabel(e.name)) + '</span>';
            html += '<span class="wam-activity__time">' + _escapeHtml(_relativeTime(e.timestamp)) + '</span>';
            html += '</li>';
        }
        html += '</ul>';
        return html;
    }

    function _eventIcon(name) {
        if (!name) return '•';
        if (name.indexOf('case.created') === 0) return '📝';
        if (name.indexOf('case.completed') === 0) return '✅';
        if (name.indexOf('case.step.approved') === 0) return '👍';
        if (name.indexOf('case.step.rejected') === 0) return '❌';
        if (name.indexOf('approval.approved') === 0) return '✅';
        if (name.indexOf('approval.rejected') === 0) return '⛔';
        if (name.indexOf('sm.step') === 0) return '➡️';
        if (name.indexOf('sm.case.finished') === 0) return '🎉';
        return '•';
    }

    function _eventLabel(name) {
        var map = {
            'case.created':          'پرونده جدید ساخته شد',
            'case.updated':          'پرونده به‌روزرسانی شد',
            'case.deleted':          'پرونده حذف شد',
            'case.completed':        'پرونده تکمیل شد',
            'case.step.approved':    'مرحله‌ای تأیید شد',
            'case.step.rejected':    'مرحله‌ای رد شد',
            'approval.approved':     'تأیید ادمین ثبت شد',
            'approval.rejected':     'رد ادمین ثبت شد',
            'approval.revision':     'درخواست اصلاح',
            'sm.step.started':       'شروع یک مرحله',
            'sm.step.completed':     'تکمیل یک مرحله',
            'sm.step.rejected':      'رد یک مرحله',
            'sm.case.finished':      'پرونده به پایان رسید'
        };
        return map[name] || name;
    }

    // ─────────────────────────────────────
    // 🎨 رندر کامل
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;
        var root = STATE.root;

        var stats = STATE.stats || computeStats();
        var recentCases = STATE.recentCases || _getRecentCases(8);
        var recentActivity = STATE.recentActivity || _getRecentActivity(10);

        // ۱. کارت‌های آمار
        var statsGrid = root.querySelector('[data-dash="stats"]');
        if (statsGrid) {
            var html = '';
            html += _renderStatCard('کل کاربران', stats.users.total, '👥',
                'فعال: ' + _formatNumber(stats.users.active));
            html += _renderStatCard('کارگزاران', stats.brokers.total, '💼',
                'فعال: ' + _formatNumber(stats.brokers.active));
            html += _renderStatCard('کل پرونده‌ها', stats.cases.total, '📁',
                'در جریان: ' + _formatNumber(stats.cases.inProgress));
            html += _renderStatCard('تکمیل‌شده', stats.cases.completed, '✅',
                'رد شده: ' + _formatNumber(stats.cases.rejected));
            html += _renderStatCard('مشاوره‌ها', stats.consultations.total, '💬',
                'در انتظار: ' + _formatNumber(stats.consultations.pending));
            html += _renderStatCard('مجموع مبالغ', 0, '💰',
                _formatAmount(stats.cases.totalAmount) + ' ریال');
            statsGrid.innerHTML = html;
        }

        // ۲. جدول پرونده‌ها
        var casesBox = root.querySelector('[data-dash="recent-cases"]');
        if (casesBox) {
            casesBox.innerHTML = _renderRecentCases(recentCases);
        }

        // ۳. فعالیت‌ها
        var activityBox = root.querySelector('[data-dash="activity"]');
        if (activityBox) {
            activityBox.innerHTML = _renderActivity(recentActivity);
        }

        // ۴. آخرین بروزرسانی
        var updatedEl = root.querySelector('[data-dash="updated-at"]');
        if (updatedEl) {
            updatedEl.textContent = 'آخرین بروزرسانی: ' + _relativeTime(Date.now());
        }

        // ۵. پیام خالی
        var emptyEl = root.querySelector('[data-dash="empty"]');
        if (emptyEl) {
            emptyEl.style.display = (stats.cases.total === 0 && stats.users.total === 0) ? 'block' : 'none';
        }

        STATE.lastUpdate = Date.now();
        _emit(DashEvents.UPDATED, {
            stats: stats,
            recentCases: recentCases,
            recentActivity: recentActivity,
            at: STATE.lastUpdate
        });
    }

    // ─────────────────────────────────────
    // 🔄 بروزرسانی
    // ─────────────────────────────────────
    function refresh(options) {
        options = options || {};
        if (!STATE.root) return false;
        if (!options.silent) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastInfo('در حال بروزرسانی...', 'داشبورد');
            }
        }
        STATE.stats = computeStats();
        STATE.recentCases = _getRecentCases(8);
        STATE.recentActivity = _getRecentActivity(10);
        render();
        _emit(DashEvents.REFRESH, { at: Date.now() });
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
                STATE.recentCases = _getRecentCases(8);
                STATE.recentActivity = _getRecentActivity(10);
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
    // 🎯 بایند دکمه‌ها
    // ─────────────────────────────────────
    function _bindButtons(root) {
        // دکمه بروزرسانی
        var refreshBtn = root.querySelector('[data-dash-action="refresh"]');
        if (refreshBtn && !refreshBtn.dataset.wamBound) {
            refreshBtn.addEventListener('click', function (e) {
                e.preventDefault();
                refresh();
            });
            refreshBtn.dataset.wamBound = '1';
        }

        // دکمه‌های میان‌بر (بر اساس data-dash-action)
        var actionBtns = root.querySelectorAll('[data-dash-action]');
        for (var i = 0; i < actionBtns.length; i++) {
            var btn = actionBtns[i];
            if (btn.dataset.wamBound) continue;
            btn.addEventListener('click', function (e) {
                var action = this.getAttribute('data-dash-action');
                if (action === 'refresh') return; // قبلاً بایند شده
                _emit(DashEvents.ACTION, { action: action, at: Date.now() });
            });
            btn.dataset.wamBound = '1';
        }
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        // ۱. دسترسی — فقط admin / super_admin
        if (typeof WamPermissions !== 'undefined') {
            var user = WamPermissions.getCurrentUser();
            if (!user || !WamPermissions.isAdmin(user)) {
                if (typeof WamUI !== 'undefined') {
                    WamUI.toastError('دسترسی به این صفحه مجاز نیست', 'خطا');
                }
                if (typeof WamPayGuard !== 'undefined') {
                    WamPayGuard.redirectToRoleHome(user && user.role);
                }
                return;
            }
        }

        var run = function () {
            // ریشه داشبورد
            var root = options.root ||
                       document.querySelector('[data-dash="admin"]') ||
                       document.querySelector('.wam-admin-dashboard') ||
                       document.querySelector('main');

            if (!root) {
                if (options.debug) console.warn('[admin-dashboard] root element پیدا نشد');
                return;
            }

            STATE.root = root;
            root.classList.add(CLASS_LOADING);

            // بارگذاری اولیه
            STATE.stats = computeStats();
            STATE.recentCases = _getRecentCases(8);
            STATE.recentActivity = _getRecentActivity(10);

            render();

            root.classList.remove(CLASS_LOADING);
            root.classList.add(CLASS_READY);

            // بایند دکمه‌ها
            _bindButtons(root);

            // بروزرسانی خودکار
            if (options.autoRefresh !== false) {
                _startAutoRefresh();
            }

            // رویداد
            _emit(DashEvents.READY, {
                stats: STATE.stats,
                at: Date.now()
            });

            STATE.installed = true;

            if (options.debug) {
                console.log('[admin-dashboard] آماده شد',
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
        if (STATE.root) {
            STATE.root.classList.remove(CLASS_LOADING, CLASS_READY);
        }
        STATE.root = null;
        STATE.installed = false;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            lastUpdate: STATE.lastUpdate,
            autoRefresh: !!STATE.autoRefreshTimer,
            stats: STATE.stats,
            recentCasesCount: STATE.recentCases.length,
            recentActivityCount: STATE.recentActivity.length
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
    var WamAdminDashboard = {
        // ثوابت
        EVENTS: DashEvents,
        AUTOREFRESH_MS: AUTOREFRESH_MS,

        // نصب
        install: install,
        uninstall: uninstall,

        // عملیات
        refresh: refresh,
        render: render,
        computeStats: computeStats,
        getRecentCases: _getRecentCases,
        getRecentActivity: _getRecentActivity,

        // بروزرسانی خودکار
        startAutoRefresh: _startAutoRefresh,
        stopAutoRefresh: _stopAutoRefresh,

        // کمکی
        formatNumber: _formatNumber,
        formatAmount: _formatAmount,
        relativeTime: _relativeTime,

        // گزارش
        getStatus: getStatus,
        onChange: onChange
    };

    // ثبت جهانی
    window.WamAdminDashboard = WamAdminDashboard;
    window.DashEvents = DashEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _autoRun = function () {
            var body = document.body;
            if (!body) return;

            // فقط در صفحات ادمین با data-dash یا کلاس مربوطه
            var isAdminDash =
                body.hasAttribute('data-admin-dashboard') ||
                body.hasAttribute('data-dash-page') ||
                document.querySelector('[data-dash="admin"]') ||
                document.querySelector('.wam-admin-dashboard');

            if (isAdminDash) {
                install();
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _autoRun);
        } else {
            _autoRun();
        }
    }

})();




/* ==========================================
 * END OF BUNDLE
 * ========================================== */