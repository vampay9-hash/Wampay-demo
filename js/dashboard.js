// ==========================================
// وام پی — Shared Modules
// فایل: dashboard.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: داشبورد عمومی مشترک — کارت‌های آماری نقش‌محور + ویجت‌ها
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION = '1.0.0';
    var ROOT_ATTR = 'data-dashboard-root';
    var PREFERENCES_KEY = 'wamPayDashboardPrefs';

    var WIDGET_TYPES = {
        STATS:        'stats',
        RECENT_CASES: 'recent_cases',
        RECENT_PAYMENTS: 'recent_payments',
        NOTIFICATIONS: 'notifications',
        QUICK_ACTIONS: 'quick_actions',
        CHART:        'chart',
        TASKS:        'tasks',
        WALLET:       'wallet'
    };

    var WIDGET_LABELS = {
        stats:             '📊 آمار',
        recent_cases:      '📁 آخرین پرونده‌ها',
        recent_payments:   '💳 آخرین پرداخت‌ها',
        notifications:     '🔔 اعلان‌ها',
        quick_actions:     '⚡ اقدامات سریع',
        chart:             '📈 نمودار',
        tasks:             '✅ تسک‌ها',
        wallet:            '💼 کیف پول'
    };

    // چیدمان پیش‌فرض هر نقش
    var ROLE_LAYOUTS = {
        super_admin: ['stats', 'chart', 'recent_cases', 'recent_payments', 'quick_actions', 'notifications'],
        admin:       ['stats', 'chart', 'recent_cases', 'recent_payments', 'quick_actions', 'notifications'],
        verifier:    ['stats', 'tasks', 'recent_cases', 'notifications', 'quick_actions'],
        broker:      ['stats', 'wallet', 'recent_cases', 'recent_payments', 'quick_actions', 'notifications'],
        applicant:   ['stats', 'recent_cases', 'notifications', 'quick_actions']
    };

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        role: null,
        userId: null,
        layout: [],
        widgetData: {},
        prefs: {},
        autoRefreshTimer: null,
        autoRefreshMs: 60000,
        lastUpdateAt: null,
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var DashEvents = {
        READY:        'dash.ready',
        RENDERED:     'dash.rendered',
        REFRESHED:    'dash.refreshed',
        LAYOUT_CHANGED:'dash.layout_changed',
        PREF_SAVED:   'dash.pref_saved',
        WIDGET_CLICK: 'dash.widget_clicked'
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

    function _amt(n) {
        if (n === null || n === undefined || n === '') return '۰';
        var x = Number(n);
        if (isNaN(x)) return '۰';
        var f = Math.round(x).toLocaleString('en-US');
        return f.replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _relTime(ts) {
        if (!ts) return '—';
        var d = Date.now() - ts;
        var s = Math.floor(d / 1000);
        if (s < 60) return 'همین الان';
        var m = Math.floor(s / 60);
        if (m < 60) return _fa(m) + ' دقیقه پیش';
        var h = Math.floor(m / 60);
        if (h < 24) return _fa(h) + ' ساعت پیش';
        var day = Math.floor(h / 24);
        if (day < 30) return _fa(day) + ' روز پیش';
        return _fa(Math.floor(day / 30)) + ' ماه پیش';
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

    function _uid() {
        if (typeof WamPermissions === 'undefined') return null;
        var me = WamPermissions.getCurrentUser();
        return me ? me.id : null;
    }

    function _user() {
        if (typeof WamPermissions === 'undefined') return null;
        return WamPermissions.getCurrentUser();
    }

    function _toast(type, msg, title) {
        if (typeof WamUI === 'undefined') return;
        if (type === 'success' && WamUI.toastSuccess) WamUI.toastSuccess(msg, title || 'موفق');
        else if (type === 'error' && WamUI.toastError) WamUI.toastError(msg, title || 'خطا');
        else if (type === 'warning' && WamUI.toastWarning) WamUI.toastWarning(msg, title || 'توجه');
        else if (type === 'info' && WamUI.toastInfo) WamUI.toastInfo(msg, title || 'اطلاع');
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری داده
    // ─────────────────────────────────────
    function _loadCases() {
        if (typeof CaseRepository === 'undefined') return [];
        try { return CaseRepository.getAll() || []; }
        catch (e) { return []; }
    }

    function _loadPayments() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON('wamPayPayments', []);
        return Array.isArray(arr) ? arr : [];
    }

    function _loadLoans() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON('wamPayLoans', []);
        return Array.isArray(arr) ? arr : [];
    }

    function _loadTasks() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON('wamPayConsultationTasks', []);
        return Array.isArray(arr) ? arr : [];
    }

    function _loadNotifications() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON('wamPayBrokerNotifs', []);
        return Array.isArray(arr) ? arr : [];
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر بر اساس نقش
    // ─────────────────────────────────────
    function _myCaseFilter(c) {
        if (!c) return false;
        var role = STATE.role;
        var u = _user();
        if (!u) return false;

        if (role === 'admin' || role === 'super_admin') return true;

        if (role === 'broker') {
            if (c.brokerId && c.brokerId === u.id) return true;
            if (c.brokerName && u.name && c.brokerName === u.name) return true;
            return false;
        }

        if (role === 'applicant') {
            if (c.applicantUserId === u.id) return true;
            if (c.applicantMobile && u.mobile) {
                if (String(c.applicantMobile).replace(/\D/g, '') ===
                    String(u.mobile).replace(/\D/g, '')) return true;
            }
            return false;
        }

        if (role === 'verifier') {
            var step = c.currentStep || '';
            if (step === 'step_3' || step === 'step_4') return true;
            // بررسی‌شده‌های من
            var appr = c.adminApprovals || {};
            for (var k in appr) {
                if (Object.prototype.hasOwnProperty.call(appr, k)) {
                    if (appr[k] && appr[k].approvedBy === u.id) return true;
                }
            }
            return false;
        }

        return false;
    }

    function _myPayments() {
        var all = _loadPayments();
        var u = _user();
        if (!u) return [];
        if (STATE.role === 'admin' || STATE.role === 'super_admin') return all;

        return all.filter(function (p) {
            if (!p) return false;
            if (p.createdBy === u.id) return true;
            if (p.brokerId === u.id) return true;
            if (p.applicantUserId === u.id) return true;
            return false;
        });
    }

    // ─────────────────────────────────────
    // 🧮 آماری
    // ─────────────────────────────────────
    function _computeStats() {
        var cases = _loadCases().filter(_myCaseFilter);
        var payments = _myPayments();
        var loans = _loadLoans();
        var role = STATE.role;
        var stats = {};

        // پرونده‌ها
        var caseInProgress = 0;
        var caseCompleted = 0;
        var caseAmount = 0;
        for (var i = 0; i < cases.length; i++) {
            var c = cases[i];
            if (!c) continue;
            var st = c.status || 'draft';
            if (st === 'in_progress' || st === 'pending') caseInProgress++;
            else if (st === 'completed') caseCompleted++;
            caseAmount += Number(c.loanAmount) || 0;
        }
        stats.cases = {
            total: cases.length,
            inProgress: caseInProgress,
            completed: caseCompleted,
            totalAmount: caseAmount
        };

        // پرداخت‌ها
        var paid = 0;
        var pending = 0;
        for (var j = 0; j < payments.length; j++) {
            var p = payments[j];
            if (!p) continue;
            if (p.status === 'confirmed') paid += Number(p.amount) || 0;
            else if (p.status === 'pending') pending += Number(p.amount) || 0;
        }
        stats.payments = {
            total: payments.length,
            confirmedAmount: paid,
            pendingAmount: pending
        };

        // وام‌ها
        if (role === 'broker' || role === 'admin' || role === 'super_admin') {
            var activeLoans = 0;
            var totalRemaining = 0;
            for (var k = 0; k < loans.length; k++) {
                var l = loans[k];
                if (!l) continue;
                if (l.status === 'active' || l.status === 'overdue') activeLoans++;
                if (typeof WamLoanRegister !== 'undefined' &&
                    WamLoanRegister.computeRemaining) {
                    try {
                        totalRemaining += WamLoanRegister.computeRemaining(l) || 0;
                    } catch (e) { /* بی‌صدا */ }
                }
            }
            stats.loans = {
                total: loans.length,
                active: activeLoans,
                remaining: totalRemaining
            };
        }

        // تسک‌ها
        if (role === 'verifier' || role === 'admin' || role === 'super_admin') {
            var tasks = _loadTasks();
            var myTasks = tasks.filter(function (t) {
                if (!t) return false;
                if (role === 'admin' || role === 'super_admin') return true;
                return t.assignedTo === STATE.userId || t.createdBy === STATE.userId;
            });
            var pendingT = 0;
            var todayT = 0;
            var now = Date.now();
            var today = new Date().setHours(0, 0, 0, 0);
            for (var m = 0; m < myTasks.length; m++) {
                var t = myTasks[m];
                if (!t) continue;
                if (t.status === 'pending' || t.status === 'in_progress') {
                    pendingT++;
                    if (t.dueDate && t.dueDate >= today && t.dueDate < now + 86400000) {
                        todayT++;
                    }
                }
            }
            stats.tasks = {
                total: myTasks.length,
                pending: pendingT,
                dueToday: todayT
            };
        }

        // اعلان‌ها
        var notifs = _loadNotifications();
        var unread = 0;
        for (var n = 0; n < notifs.length; n++) {
            if (notifs[n] && !notifs[n].read) unread++;
        }
        stats.notifications = { unread: unread };

        return stats;
    }

    // ─────────────────────────────────────
    // 📊 آمار نقش‌محور برای کارت‌ها
    // ─────────────────────────────────────
    function _statsCardsForRole() {
        var s = _computeStats();
        var role = STATE.role;
        var cards = [];

        if (role === 'super_admin' || role === 'admin') {
            cards.push({ label: 'کل پرونده‌ها', value: s.cases.total, icon: '📁', accent: 'primary' });
            cards.push({ label: 'در جریان', value: s.cases.inProgress, icon: '⏳', accent: 'warning' });
            cards.push({ label: 'پرداخت تأییدشده', value: s.payments.confirmedAmount, icon: '💰', accent: 'success', amount: true });
            cards.push({ label: 'اعلان‌های نخوانده', value: s.notifications.unread, icon: '🔔', accent: 'info' });
        } else if (role === 'verifier') {
            cards.push({ label: 'صف بررسی', value: s.cases.inProgress, icon: '📋', accent: 'warning' });
            cards.push({ label: 'بررسی‌شده‌ها', value: s.cases.completed, icon: '✅', accent: 'success' });
            cards.push({ label: 'تسک‌های من', value: s.tasks ? s.tasks.pending : 0, icon: '📝', accent: 'primary' });
            cards.push({ label: 'امروز', value: s.tasks ? s.tasks.dueToday : 0, icon: '📅', accent: 'danger' });
        } else if (role === 'broker') {
            cards.push({ label: 'پرونده‌های من', value: s.cases.total, icon: '📁', accent: 'primary' });
            cards.push({ label: 'در جریان', value: s.cases.inProgress, icon: '⏳', accent: 'warning' });
            cards.push({ label: 'وام‌های فعال', value: s.loans ? s.loans.active : 0, icon: '📝', accent: 'success' });
            cards.push({ label: 'پورسانت‌ها', value: s.payments.confirmedAmount, icon: '💰', accent: 'success', amount: true });
        } else if (role === 'applicant') {
            cards.push({ label: 'درخواست‌های من', value: s.cases.total, icon: '📁', accent: 'primary' });
            cards.push({ label: 'در جریان', value: s.cases.inProgress, icon: '⏳', accent: 'warning' });
            cards.push({ label: 'تکمیل‌شده', value: s.cases.completed, icon: '✅', accent: 'success' });
            cards.push({ label: 'اعلان‌ها', value: s.notifications.unread, icon: '🔔', accent: 'info' });
        }

        return cards;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ویجت آمار
    // ─────────────────────────────────────
    function _renderStatsWidget() {
        var cards = _statsCardsForRole();
        var html = '<div class="wam-dash__stats">';
        for (var i = 0; i < cards.length; i++) {
            var c = cards[i];
            var value = c.amount ? _amt(c.value) : _fa(c.value);
            html += '<div class="wam-dash__stat-card wam-dash__stat-card--' +
                (c.accent || 'primary') + '">' +
                '<div class="wam-dash__stat-icon">' + c.icon + '</div>' +
                '<div class="wam-dash__stat-body">' +
                '<div class="wam-dash__stat-value">' + value +
                (c.amount ? ' <small>ریال</small>' : '') + '</div>' +
                '<div class="wam-dash__stat-label">' + _esc(c.label) + '</div>' +
                '</div></div>';
        }
        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ویجت آخرین پرونده‌ها
    // ─────────────────────────────────────
    function _renderRecentCasesWidget() {
        var cases = _loadCases().filter(_myCaseFilter);
        cases.sort(function (a, b) {
            return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
        });

        var limit = Math.min(5, cases.length);
        var html = '<div class="wam-dash__widget wam-dash__widget--cases">' +
            '<div class="wam-dash__widget-head">' +
            '<h3>📁 آخرین پرونده‌ها</h3>' +
            '<a class="wam-dash__widget-link" href="cases.html">همه ›</a>' +
            '</div>';

        if (limit === 0) {
            html += '<div class="wam-empty wam-empty--sm">' +
                'هیچ پرونده‌ای وجود ندارد.</div>';
        } else {
            html += '<ul class="wam-dash__list">';
            for (var i = 0; i < limit; i++) {
                var c = cases[i];
                var st = c.status || 'draft';
                html += '<li class="wam-dash__list-item" ' +
                    'data-dash-row="case" data-id="' + _esc(c.caseId) + '">' +
                    '<div class="wam-dash__list-main">' +
                    '<code>' + _esc(c.caseId) + '</code> ' +
                    '<span class="wam-badge wam-badge--' + _esc(st) + '">' +
                    _esc(_statusLabel(st)) + '</span>' +
                    '</div>' +
                    '<div class="wam-dash__list-sub">' +
                    _esc(c.applicantName || '—') + ' · ' +
                    _amt(c.loanAmount) + ' ریال' +
                    '</div>' +
                    '<div class="wam-dash__list-time">' +
                    _esc(_relTime(c.updatedAt || c.createdAt)) + '</div>' +
                    '</li>';
            }
            html += '</ul>';
        }

        html += '</div>';
        return html;
    }

    function _statusLabel(st) {
        var m = {
            draft: 'پیش‌نویس', in_progress: 'در جریان', pending: 'در انتظار',
            approved: 'تأییدشده', completed: 'تکمیل‌شده', rejected: 'رد شده',
            cancelled: 'لغو شده', archived: 'بایگانی', rolledback: 'بازگشت'
        };
        return m[st] || st || '—';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ویجت آخرین پرداخت‌ها
    // ─────────────────────────────────────
    function _renderRecentPaymentsWidget() {
        var payments = _myPayments();
        payments.sort(function (a, b) {
            return (b.createdAt || 0) - (a.createdAt || 0);
        });

        var limit = Math.min(5, payments.length);
        var html = '<div class="wam-dash__widget wam-dash__widget--payments">' +
            '<div class="wam-dash__widget-head">' +
            '<h3>💳 آخرین پرداخت‌ها</h3>' +
            '<a class="wam-dash__widget-link" href="payments.html">همه ›</a>' +
            '</div>';

        if (limit === 0) {
            html += '<div class="wam-empty wam-empty--sm">' +
                'هیچ پرداختی وجود ندارد.</div>';
        } else {
            html += '<ul class="wam-dash__list">';
            for (var i = 0; i < limit; i++) {
                var p = payments[i];
                var st = p.status || 'pending';
                html += '<li class="wam-dash__list-item" ' +
                    'data-dash-row="payment" data-id="' + _esc(p.id) + '">' +
                    '<div class="wam-dash__list-main">' +
                    '<code>' + _esc(p.receiptNumber) + '</code> ' +
                    '<span class="wam-badge wam-badge--' + _esc(st) + '">' +
                    _esc(_statusLabel(st)) + '</span>' +
                    '</div>' +
                    '<div class="wam-dash__list-sub">' +
                    _amt(p.amount) + ' ریال' +
                    (p.applicantName ? ' · ' + _esc(p.applicantName) : '') +
                    '</div>' +
                    '<div class="wam-dash__list-time">' +
                    _esc(_relTime(p.createdAt)) + '</div>' +
                    '</li>';
            }
            html += '</ul>';
        }

        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ویجت اعلان‌ها
    // ─────────────────────────────────────
    function _renderNotificationsWidget() {
        var all = _loadNotifications();
        var mine = [];
        var u = _user();
        for (var i = 0; i < all.length; i++) {
            var n = all[i];
            if (!n) continue;
            if (STATE.role === 'admin' || STATE.role === 'super_admin') {
                mine.push(n);
            } else if (n.brokerId && n.brokerId === u.id) {
                mine.push(n);
            }
        }
        mine.sort(function (a, b) {
            return (b.createdAt || 0) - (a.createdAt || 0);
        });

        var limit = Math.min(5, mine.length);
        var html = '<div class="wam-dash__widget wam-dash__widget--notifs">' +
            '<div class="wam-dash__widget-head">' +
            '<h3>🔔 اعلان‌ها</h3>' +
            '<a class="wam-dash__widget-link" href="broker-notifications.html">همه ›</a>' +
            '</div>';

        if (limit === 0) {
            html += '<div class="wam-empty wam-empty--sm">' +
                'اعلانی نیست.</div>';
        } else {
            html += '<ul class="wam-dash__list">';
            for (var j = 0; j < limit; j++) {
                var item = mine[j];
                html += '<li class="wam-dash__list-item' +
                    (item.read ? '' : ' is-unread') + '">' +
                    '<div class="wam-dash__list-main">' +
                    _esc(item.title || 'اعلان') + '</div>' +
                    '<div class="wam-dash__list-sub">' +
                    _esc(item.text || '') + '</div>' +
                    '<div class="wam-dash__list-time">' +
                    _esc(_relTime(item.createdAt)) + '</div>' +
                    '</li>';
            }
            html += '</ul>';
        }

        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ویجت اقدامات سریع
    // ─────────────────────────────────────
    function _renderQuickActionsWidget() {
        var role = STATE.role;
        var actions = [];

        if (role === 'admin' || role === 'super_admin') {
            actions = [
                { icon: '➕', label: 'کاربر جدید', href: 'admin-create.html' },
                { icon: '📁', label: 'پرونده‌ها', href: 'admin-cases.html' },
                { icon: '💼', label: 'کارگزاران', href: 'admin-brokers.html' },
                { icon: '📊', label: 'گزارش‌ها', href: 'financial-reports-v2.html' }
            ];
        } else if (role === 'broker') {
            actions = [
                { icon: '➕', label: 'پرونده جدید', href: 'broker-wizard-v2.html' },
                { icon: '💰', label: 'کیف پول', href: 'wallet.html' },
                { icon: '👤', label: 'پروفایل', href: 'broker-profile.html' },
                { icon: '🎧', label: 'پشتیبانی', href: 'broker-support.html' }
            ];
        } else if (role === 'verifier') {
            actions = [
                { icon: '📋', label: 'صف بررسی', href: 'verifier-views-all.html' },
                { icon: '✅', label: 'تسک‌ها', href: 'consultation-tasks.html' },
                { icon: '💬', label: 'مشاوره‌ها', href: 'consultations.html' }
            ];
        } else if (role === 'applicant') {
            actions = [
                { icon: '➕', label: 'درخواست جدید', href: 'applicant-wizard.html' },
                { icon: '📁', label: 'پرونده‌های من', href: 'applicant.html' }
            ];
        }

        var html = '<div class="wam-dash__widget wam-dash__widget--actions">' +
            '<div class="wam-dash__widget-head">' +
            '<h3>⚡ اقدامات سریع</h3></div>';

        html += '<div class="wam-dash__quick-grid">';
        for (var i = 0; i < actions.length; i++) {
            var a = actions[i];
            html += '<a class="wam-dash__quick" href="' + _esc(a.href) + '">' +
                '<span class="wam-dash__quick-icon">' + a.icon + '</span>' +
                '<span class="wam-dash__quick-label">' + _esc(a.label) + '</span>' +
                '</a>';
        }
        html += '</div></div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ویجت نمودار ساده
    // ─────────────────────────────────────
    function _renderChartWidget() {
        var cases = _loadCases().filter(_myCaseFilter);
        var byStatus = {};
        for (var i = 0; i < cases.length; i++) {
            var c = cases[i];
            if (!c) continue;
            var st = c.status || 'draft';
            byStatus[st] = (byStatus[st] || 0) + 1;
        }

        var max = 0;
        for (var k in byStatus) {
            if (Object.prototype.hasOwnProperty.call(byStatus, k)) {
                if (byStatus[k] > max) max = byStatus[k];
            }
        }
        if (max === 0) max = 1;

        var colors = {
            draft: '#95a5a6', in_progress: '#e67e22', pending: '#f39c12',
            approved: '#27ae60', completed: '#105b35', rejected: '#c0392b',
            cancelled: '#7f8c8d', archived: '#95a5a6'
        };

        var html = '<div class="wam-dash__widget wam-dash__widget--chart">' +
            '<div class="wam-dash__widget-head">' +
            '<h3>📈 توزیع وضعیت پرونده‌ها</h3></div>';

        if (Object.keys(byStatus).length === 0) {
            html += '<div class="wam-empty wam-empty--sm">' +
                'داده‌ای برای نمایش نیست.</div>';
        } else {
            html += '<div class="wam-dash__chart">';
            for (var st2 in byStatus) {
                if (!Object.prototype.hasOwnProperty.call(byStatus, st2)) continue;
                var pct = (byStatus[st2] / max) * 100;
                html += '<div class="wam-dash__chart-row">' +
                    '<div class="wam-dash__chart-label">' +
                    _esc(_statusLabel(st2)) + '</div>' +
                    '<div class="wam-dash__chart-bar-wrap">' +
                    '<div class="wam-dash__chart-bar" style="width:' +
                    pct + '%;background:' + (colors[st2] || '#105b35') + '"></div>' +
                    '</div>' +
                    '<div class="wam-dash__chart-value">' +
                    _fa(byStatus[st2]) + '</div>' +
                    '</div>';
            }
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ویجت تسک‌ها
    // ─────────────────────────────────────
    function _renderTasksWidget() {
        var tasks = _loadTasks();
        var mine = tasks.filter(function (t) {
            if (!t) return false;
            if (STATE.role === 'admin' || STATE.role === 'super_admin') return true;
            return t.assignedTo === STATE.userId || t.createdBy === STATE.userId;
        });
        mine = mine.filter(function (t) {
            return t.status === 'pending' || t.status === 'in_progress';
        });

        var today = new Date().setHours(0, 0, 0, 0);
        mine.sort(function (a, b) {
            var da = a.dueDate || Infinity;
            var db = b.dueDate || Infinity;
            return da - db;
        });

        var limit = Math.min(5, mine.length);
        var html = '<div class="wam-dash__widget wam-dash__widget--tasks">' +
            '<div class="wam-dash__widget-head">' +
            '<h3>✅ تسک‌های من</h3>' +
            '<a class="wam-dash__widget-link" href="consultation-tasks.html">همه ›</a>' +
            '</div>';

        if (limit === 0) {
            html += '<div class="wam-empty wam-empty--sm">' +
                'تسکی نیست 🎉</div>';
        } else {
            html += '<ul class="wam-dash__list">';
            for (var i = 0; i < limit; i++) {
                var t = mine[i];
                var overdue = t.dueDate && t.dueDate < today;
                html += '<li class="wam-dash__list-item' +
                    (overdue ? ' is-overdue' : '') + '">' +
                    '<div class="wam-dash__list-main">' +
                    (overdue ? '⏰ ' : '') + _esc(t.title) + '</div>' +
                    (t.dueDate ?
                        '<div class="wam-dash__list-time">' +
                        'سررسید: ' + _esc(_jalali(t.dueDate)) + '</div>' : '') +
                    '</li>';
            }
            html += '</ul>';
        }

        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ویجت کیف پول
    // ─────────────────────────────────────
    function _renderWalletWidget() {
        if (typeof Storage === 'undefined') return '';
        var wallets = Storage.getJSON('wamPayWallets', {}) || {};
        var u = _user();
        var myWallet = null;

        if (u) {
            if (STATE.role === 'broker') {
                var brokers = Storage.getJSON('wamPayBrokers', []) || [];
                for (var i = 0; i < brokers.length; i++) {
                    if (brokers[i] && brokers[i].userId === u.id) {
                        myWallet = wallets[brokers[i].id];
                        break;
                    }
                }
            } else {
                myWallet = wallets[u.id];
            }
        }

        var balance = myWallet ? (Number(myWallet.balance) || 0) : 0;
        var pending = myWallet ? (Number(myWallet.pendingWithdraw) || 0) : 0;

        return '<div class="wam-dash__widget wam-dash__widget--wallet">' +
            '<div class="wam-dash__widget-head">' +
            '<h3>💼 کیف پول</h3>' +
            '<a class="wam-dash__widget-link" href="wallet.html">جزئیات ›</a>' +
            '</div>' +
            '<div class="wam-dash__wallet-card">' +
            '<div class="wam-dash__wallet-label">موجودی قابل برداشت</div>' +
            '<div class="wam-dash__wallet-value">' + _amt(balance) +
            ' <small>ریال</small></div>' +
            (pending > 0 ?
                '<div class="wam-dash__wallet-pending">قفل: ' +
                _amt(pending) + ' ریال</div>' : '') +
            '</div></div>';
    }

    // ─────────────────────────────────────
    // 🎯 رندر ویجت
    // ─────────────────────────────────────
    function _renderWidget(type) {
        if (type === WIDGET_TYPES.STATS)            return _renderStatsWidget();
        if (type === WIDGET_TYPES.RECENT_CASES)     return _renderRecentCasesWidget();
        if (type === WIDGET_TYPES.RECENT_PAYMENTS)  return _renderRecentPaymentsWidget();
        if (type === WIDGET_TYPES.NOTIFICATIONS)    return _renderNotificationsWidget();
        if (type === WIDGET_TYPES.QUICK_ACTIONS)    return _renderQuickActionsWidget();
        if (type === WIDGET_TYPES.CHART)            return _renderChartWidget();
        if (type === WIDGET_TYPES.TASKS)            return _renderTasksWidget();
        if (type === WIDGET_TYPES.WALLET)           return _renderWalletWidget();
        return '';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — هدر
    // ─────────────────────────────────────
    function _renderHeader() {
        var u = _user() || {};
        var roleLabels = {
            super_admin: 'مدیر ارشد', admin: 'ادمین کل',
            verifier: 'اعتبارسنج', broker: 'کارگزار', applicant: 'متقاضی'
        };

        return '<div class="wam-dash__header">' +
            '<div class="wam-dash__hello">' +
            'سلام <strong>' + _esc(u.name || u.username || 'کاربر') +
            '</strong> 👋' +
            '</div>' +
            '<div class="wam-dash__meta">' +
            '<span class="wam-dash__role">' +
            _esc(roleLabels[STATE.role] || STATE.role) + '</span>' +
            '<span class="wam-dash__updated">' +
            'آخرین بروزرسانی: ' + _esc(_relTime(STATE.lastUpdateAt)) +
            '</span>' +
            '<button class="wam-btn-icon" data-dash-action="refresh" ' +
            'title="بروزرسانی">🔄</button>' +
            '</div></div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;

        var html = '<div class="wam-dash">' +
            _renderHeader() +
            '<div class="wam-dash__grid">';

        for (var i = 0; i < STATE.layout.length; i++) {
            var w = STATE.layout[i];
            html += '<div class="wam-dash__grid-item wam-dash__grid-item--' +
                _esc(w) + '">' + _renderWidget(w) + '</div>';
        }

        html += '</div></div>';

        STATE.root.innerHTML = html;
        _bindEvents();

        STATE.lastUpdateAt = Date.now();
        _emit(DashEvents.RENDERED, { at: STATE.lastUpdateAt });
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents() {
        if (!STATE.root) return;

        var btns = STATE.root.querySelectorAll('[data-dash-action]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', _handleAction);
        }

        var rows = STATE.root.querySelectorAll('[data-dash-row]');
        for (var j = 0; j < rows.length; j++) {
            rows[j].addEventListener('click', _handleRowClick);
        }
    }

    function _handleAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-dash-action');
        if (a === 'refresh') {
            refresh();
            _toast('success', 'بروزرسانی شد', 'موفق');
        }
    }

    function _handleRowClick() {
        var kind = this.getAttribute('data-dash-row');
        var id = this.getAttribute('data-id');
        _emit(DashEvents.WIDGET_CLICK, { kind: kind, id: id });
        if (kind === 'case' && id) {
            window.location.href = 'case-details.html?id=' + encodeURIComponent(id);
        } else if (kind === 'payment' && id) {
            if (typeof WamPayments !== 'undefined' && WamPayments.openDetail) {
                WamPayments.openDetail(id);
            }
        }
    }

    // ─────────────────────────────────────
    // 💾 Preferences
    // ─────────────────────────────────────
    function _loadPrefs() {
        if (typeof Storage === 'undefined') return {};
        var all = Storage.getJSON(PREFERENCES_KEY, {}) || {};
        var uid = _uid();
        if (!uid) return {};
        return all[uid] || {};
    }

    function _savePrefs(prefs) {
        if (typeof Storage === 'undefined') return false;
        var all = Storage.getJSON(PREFERENCES_KEY, {}) || {};
        var uid = _uid();
        if (!uid) return false;
        all[uid] = prefs;
        return Storage.setJSON(PREFERENCES_KEY, all);
    }

    function setLayout(widgets) {
        if (!Array.isArray(widgets) || widgets.length === 0) return false;
        var valid = [];
        for (var i = 0; i < widgets.length; i++) {
            if (WIDGET_LABELS[widgets[i]]) valid.push(widgets[i]);
        }
        STATE.layout = valid;
        STATE.prefs.layout = valid.slice();
        _savePrefs(STATE.prefs);
        _emit(DashEvents.LAYOUT_CHANGED, { layout: valid });
        render();
        return true;
    }

    function resetLayout() {
        STATE.layout = (ROLE_LAYOUTS[STATE.role] || ROLE_LAYOUTS.applicant).slice();
        STATE.prefs.layout = null;
        _savePrefs(STATE.prefs);
        render();
        return true;
    }

    // ─────────────────────────────────────
    // 🔄 بروزرسانی
    // ─────────────────────────────────────
    function refresh(options) {
        options = options || {};
        render();
        _emit(DashEvents.REFRESHED, { at: Date.now() });
        if (!options.silent && typeof WamUI !== 'undefined') {
            // توست فقط در حالت دستی
        }
        return true;
    }

    function _startAutoRefresh(ms) {
        _stopAutoRefresh();
        STATE.autoRefreshMs = ms || STATE.autoRefreshMs;
        STATE.autoRefreshTimer = setInterval(function () {
            try { refresh({ silent: true }); }
            catch (e) { /* بی‌صدا */ }
        }, STATE.autoRefreshMs);
    }

    function _stopAutoRefresh() {
        if (STATE.autoRefreshTimer) {
            clearInterval(STATE.autoRefreshTimer);
            STATE.autoRefreshTimer = null;
        }
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var run = function () {
            var u = _user();
            if (!u) {
                if (typeof WamPayGuard !== 'undefined') {
                    WamPayGuard.redirectToLogin('not_logged_in');
                }
                return;
            }
            STATE.userId = u.id;
            STATE.role = u.role;

            var root = options.root ||
                       document.querySelector('[' + ROOT_ATTR + ']') ||
                       document.querySelector('.wam-dashboard');
            if (!root) {
                if (options.debug) console.warn('[dashboard] root پیدا نشد');
                return;
            }
            STATE.root = root;

            STATE.prefs = _loadPrefs();
            if (STATE.prefs && Array.isArray(STATE.prefs.layout) &&
                STATE.prefs.layout.length > 0) {
                STATE.layout = STATE.prefs.layout.slice();
            } else if (options.layout && Array.isArray(options.layout)) {
                STATE.layout = options.layout.slice();
            } else {
                STATE.layout = (ROLE_LAYOUTS[STATE.role] ||
                    ROLE_LAYOUTS.applicant).slice();
            }

            render();

            if (options.autoRefresh !== false) {
                _startAutoRefresh(options.autoRefreshMs || 60000);
            }

            STATE.installed = true;

            _emit(DashEvents.READY, {
                role: STATE.role,
                layout: STATE.layout,
                at: Date.now()
            });

            if (options.debug) {
                console.log('[dashboard] v' + VERSION + ' — نقش: ' +
                    STATE.role + '، ' + STATE.layout.length + ' ویجت');
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
            version: VERSION,
            installed: STATE.installed,
            role: STATE.role,
            layout: STATE.layout.slice(),
            autoRefresh: !!STATE.autoRefreshTimer,
            lastUpdateAt: STATE.lastUpdateAt,
            widgetsCount: STATE.layout.length
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
    var WamDashboard = {
        VERSION: VERSION,
        EVENTS: DashEvents,
        ROOT_ATTR: ROOT_ATTR,
        PREFERENCES_KEY: PREFERENCES_KEY,
        WIDGET_TYPES: WIDGET_TYPES,
        WIDGET_LABELS: WIDGET_LABELS,
        ROLE_LAYOUTS: ROLE_LAYOUTS,

        install: install,
        uninstall: uninstall,
        render: render,
        refresh: refresh,

        setLayout: setLayout,
        resetLayout: resetLayout,

        startAutoRefresh: _startAutoRefresh,
        stopAutoRefresh: _stopAutoRefresh,

        computeStats: _computeStats,

        getLayout: function () { return STATE.layout.slice(); },

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamDashboard = WamDashboard;
    window.SharedDashEvents = DashEvents;

    // نصب خودکار
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-dashboard-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-dashboard')) {
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