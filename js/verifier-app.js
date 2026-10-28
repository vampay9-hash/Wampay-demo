// ==========================================
// وام پی — Verifier Panel
// فایل: verifier-app.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: پنل اصلی اعتبارسنج — SPA با نمای داینامیک
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var AUTOREFRESH_MS = 120000;

    var VIEWS = {
        DASHBOARD:    'dashboard',
        QUEUE:        'queue',        // صف بررسی
        MY_VERIFIED:  'verified',     // تأییدشده‌های من
        NOTIFS:       'notifications',
        PROFILE:      'profile',
        SYNC:         'sync'
    };

    var VIEW_TITLES = {
        dashboard:     'داشبورد',
        queue:         'صف بررسی',
        verified:      'بررسی‌شده‌ها',
        notifications: 'اعلان‌ها',
        profile:       'پروفایل',
        sync:          'همگام‌سازی'
    };

    var STATUS_LABELS = {
        draft:        'پیش‌نویس',
        in_progress:  'در جریان',
        pending:      'در انتظار',
        approved:     'تأییدشده',
        completed:    'تکمیل‌شده',
        rejected:     'رد شده',
        cancelled:    'لغو شده',
        archived:     'بایگانی'
    };

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        currentView: VIEWS.DASHBOARD,
        currentUser: null,
        cases: [],
        queue: [],
        verified: [],
        notifications: [],
        autoRefreshTimer: null,
        listeners: [],
        lastUpdate: null
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var VEvents = {
        READY:       'verifier.ready',
        VIEW_CHANGE: 'verifier.view.change',
        UPDATED:     'verifier.updated',
        REFRESH:     'verifier.refresh',
        ACTION:      'verifier.action'
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
        if (n === null || n === undefined || n === '') return '—';
        var x = Number(n);
        if (isNaN(x)) return '—';
        return x.toLocaleString('en-US').replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
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

    function _statusLabel(st) {
        return STATUS_LABELS[st] || st || '—';
    }

    // ─────────────────────────────────────
    // 👤 کاربر جاری
    // ─────────────────────────────────────
    function _getCurrentUser() {
        if (typeof WamPermissions === 'undefined') return null;
        return WamPermissions.getCurrentUser();
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری پرونده‌ها
    // ─────────────────────────────────────
    function _loadAllCases() {
        if (typeof CaseRepository === 'undefined') return [];
        try { return CaseRepository.getAll() || []; }
        catch (e) { return []; }
    }

    function _loadQueue() {
        // پرونده‌هایی که در مرحله بررسی اولیه یا اعتبارسنجی هستند
        var all = _loadAllCases();
        var q = [];
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (!c) continue;
            var step = c.currentStep || '';
            var st = c.status || 'draft';
            if ((step === 'step_3' || step === 'step_4') &&
                st !== 'completed' && st !== 'rejected' &&
                st !== 'cancelled' && st !== 'archived') {
                q.push(c);
            }
        }
        q.sort(function (a, b) {
            return (a.updatedAt || a.createdAt || 0) -
                   (b.updatedAt || b.createdAt || 0);  // قدیمی‌ترها بالاتر
        });
        return q;
    }

    function _loadMyVerified() {
        var all = _loadAllCases();
        var me = STATE.currentUser ? STATE.currentUser.id : null;
        if (!me) return [];
        var v = [];
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (!c) continue;
            var approvals = c.adminApprovals || {};
            // بررسی که آیا این verifier در هر کدام از تأییدهاست
            for (var k in approvals) {
                if (!Object.prototype.hasOwnProperty.call(approvals, k)) continue;
                var a = approvals[k];
                if (a && a.approvedBy === me) { v.push(c); break; }
            }
            // یا در تاریخچه steps
            if (c.steps) {
                for (var sid in c.steps) {
                    if (!Object.prototype.hasOwnProperty.call(c.steps, sid)) continue;
                    var s = c.steps[sid];
                    if (s && (s.completedBy === me || s.startedBy === me)) {
                        if (v.indexOf(c) === -1) v.push(c);
                        break;
                    }
                }
            }
        }
        v.sort(function (a, b) {
            return (b.updatedAt || b.createdAt || 0) -
                   (a.updatedAt || a.createdAt || 0);
        });
        return v;
    }

    function _loadNotifications() {
        var notifs = [];
        if (typeof EventBus === 'undefined') return notifs;
        try {
            var h = EventBus.getHistory() || [];
            var myCaseIds = {};
            for (var i = 0; i < STATE.cases.length; i++) {
                myCaseIds[STATE.cases[i].caseId] = true;
            }
            for (var j = h.length - 1; j >= 0 && notifs.length < 12; j--) {
                var ev = h[j];
                if (!ev || !ev.name) continue;
                if (ev.name.indexOf('case.') === 0 ||
                    ev.name.indexOf('sm.') === 0 ||
                    ev.name.indexOf('approval.') === 0) {
                    if (ev.data && ev.data.caseId &&
                        (STATE.queue.indexOf(ev.data.caseId) !== -1 ||
                         STATE.verified.indexOf(ev.data.caseId) !== -1)) {
                        notifs.push({
                            name: ev.name,
                            data: ev.data,
                            timestamp: ev.timestamp || 0
                        });
                    }
                }
            }
        } catch (e) { /* بی‌صدا */ }
        return notifs;
    }

    // ─────────────────────────────────────
    // 📊 آمار
    // ─────────────────────────────────────
    function computeStats() {
        var stats = {
            queue: STATE.queue.length,
            verified: STATE.verified.length,
            pending: 0,
            urgent: 0,
            totalAmount: 0
        };

        // صف
        for (var i = 0; i < STATE.queue.length; i++) {
            var c = STATE.queue[i];
            if (!c) continue;
            var h = Date.now() - (c.createdAt || c.updatedAt || 0);
            if (h > 3 * 24 * 60 * 60 * 1000) stats.urgent++;
            var step = c.currentStep || '';
            if (step === 'step_3') stats.pending++;
        }

        // مبلغ کل
        var all = STATE.queue.concat(STATE.verified);
        var seen = {};
        for (var j = 0; j < all.length; j++) {
            var c2 = all[j];
            if (!c2 || seen[c2.caseId]) continue;
            seen[c2.caseId] = true;
            stats.totalAmount += Number(c2.loanAmount) || 0;
        }

        return stats;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت آمار
    // ─────────────────────────────────────
    function _statCard(label, value, icon, accent) {
        accent = accent || '';
        return '<div class="wam-stat' + (accent ? ' wam-stat--' + accent : '') + '">' +
               '<div class="wam-stat__icon">' + icon + '</div>' +
               '<div class="wam-stat__body">' +
                   '<div class="wam-stat__value">' + _fa(value) + '</div>' +
                   '<div class="wam-stat__label">' + _esc(label) + '</div>' +
               '</div></div>';
    }

    // ─────────────────────────────────────
    // 🎨 ردیف پرونده
    // ─────────────────────────────────────
    function _caseRow(c, withAction) {
        var st = c.status || 'draft';
        var waiting = c.createdAt ? Date.now() - c.createdAt : 0;
        var isUrgent = waiting > 3 * 24 * 60 * 60 * 1000;

        var html = '<div class="wam-vcase-row' +
            (isUrgent ? ' is-urgent' : '') + '" data-case-id="' +
            _esc(c.caseId) + '">';

        html += '<div class="wam-vcase-row__head">';
        html += '<code>' + _esc(c.caseId) + '</code> ';
        html += '<span class="wam-badge wam-badge--' + _esc(st) + '">' +
                _esc(_statusLabel(st)) + '</span>';
        if (isUrgent) {
            html += ' <span class="wam-badge wam-badge--urgent">⏰ فوری</span>';
        }
        html += '</div>';

        html += '<div class="wam-vcase-row__body">';
        html += '<div class="wam-vcase-row__line"><span>متقاضی:</span> <strong>' +
                _esc(c.applicantName || '—') + '</strong></div>';
        html += '<div class="wam-vcase-row__line"><span>بانک:</span> ' +
                _esc(c.bank || '—') + '</div>';
        html += '<div class="wam-vcase-row__line"><span>مبلغ:</span> ' +
                _amt(c.loanAmount) + ' ریال</div>';
        html += '<div class="wam-vcase-row__line"><span>مرحله:</span> ' +
                _esc(c.currentStep || '—') + '</div>';
        html += '</div>';

        html += '<div class="wam-vcase-row__foot">';
        html += '<span class="wam-vcase-row__time">' +
                _esc(_relTime(c.updatedAt || c.createdAt)) + '</span>';
        if (withAction !== false) {
            html += '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
                    'data-vcase-action="review" data-case-id="' +
                    _esc(c.caseId) + '">🔍 بررسی</button>';
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نمای داشبورد
    // ─────────────────────────────────────
    function _renderDashboard() {
        var s = computeStats();
        var html = '';

        html += '<div class="wam-verifier-stats">';
        html += _statCard('در صف بررسی', s.queue, '📋', 'warning');
        html += _statCard('بررسی‌شده', s.verified, '✅', 'success');
        html += _statCard('فوری', s.urgent, '⏰', 'danger');
        html += _statCard('مبلغ کل', 0, '💰');
        html += '</div>';

        html += '<div class="wam-verifier-amounts">';
        html += '<div class="wam-verifier-amounts__row">' +
                '<span>مجموع مبالغ در انتظار بررسی:</span>' +
                '<strong>' + _amt(s.totalAmount) + ' ریال</strong></div>';
        html += '</div>';

        // آخرین پرونده‌های صف
        html += '<section class="wam-verifier-section">';
        html += '<header class="wam-verifier-section__head">' +
                '<h3>📋 در انتظار بررسی</h3>' +
                '<button class="wam-btn wam-btn--sm" data-vverifier-view="' +
                VIEWS.QUEUE + '">مشاهده همه</button></header>';
        if (STATE.queue.length === 0) {
            html += '<div class="wam-empty">هیچ پرونده‌ای در صف نیست. 🎉</div>';
        } else {
            html += '<div class="wam-verifier-list">';
            for (var i = 0; i < Math.min(5, STATE.queue.length); i++) {
                html += _caseRow(STATE.queue[i]);
            }
            html += '</div>';
        }
        html += '</section>';

        // ابزارهای سریع
        html += '<section class="wam-verifier-section">';
        html += '<h3>⚡ اقدامات سریع</h3>';
        html += '<div class="wam-verifier-quick">';
        html += '<button class="wam-verifier-quick__item" ' +
                'data-vverifier-view="' + VIEWS.QUEUE + '">' +
                '<span>📋</span><span>صف بررسی</span></button>';
        html += '<button class="wam-verifier-quick__item" ' +
                'data-vverifier-view="' + VIEWS.MY_VERIFIED + '">' +
                '<span>✅</span><span>بررسی‌شده‌ها</span></button>';
        html += '<button class="wam-verifier-quick__item" ' +
                'data-vverifier-view="' + VIEWS.SYNC + '">' +
                '<span>🔄</span><span>همگام‌سازی</span></button>';
        html += '<button class="wam-verifier-quick__item" ' +
                'data-vverifier-view="' + VIEWS.NOTIFS + '">' +
                '<span>🔔</span><span>اعلان‌ها</span></button>';
        html += '</div>';
        html += '</section>';

        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — صف بررسی
    // ─────────────────────────────────────
    function _renderQueue() {
        var html = '<section class="wam-verifier-section">';
        html += '<header class="wam-verifier-section__head">' +
                '<h3>📋 صف بررسی</h3>' +
                '<button class="wam-btn wam-btn--sm" ' +
                'data-vverifier-action="refresh">🔄</button></header>';

        if (STATE.queue.length === 0) {
            html += '<div class="wam-empty">صف بررسی خالی است. 🎉</div>';
        } else {
            html += '<div class="wam-verifier-list">';
            for (var i = 0; i < STATE.queue.length; i++) {
                html += _caseRow(STATE.queue[i]);
            }
            html += '</div>';
        }
        html += '</section>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — بررسی‌شده‌ها
    // ─────────────────────────────────────
    function _renderVerified() {
        var html = '<section class="wam-verifier-section">';
        html += '<h3>✅ بررسی‌شده‌های من</h3>';
        if (STATE.verified.length === 0) {
            html += '<div class="wam-empty">هنوز پرونده‌ای را بررسی نکرده‌اید.</div>';
        } else {
            html += '<div class="wam-verifier-list">';
            for (var i = 0; i < STATE.verified.length; i++) {
                html += _caseRow(STATE.verified[i], false);
            }
            html += '</div>';
        }
        html += '</section>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — اعلان‌ها
    // ─────────────────────────────────────
    function _renderNotifs() {
        var html = '<section class="wam-verifier-section"><h3>🔔 اعلان‌ها</h3>';
        if (STATE.notifications.length === 0) {
            html += '<div class="wam-empty">اعلانی نیست.</div>';
        } else {
            html += '<ul class="wam-notif-list">';
            for (var i = 0; i < STATE.notifications.length; i++) {
                var n = STATE.notifications[i];
                html += '<li class="wam-notif-item">' +
                    '<div class="wam-notif-item__body">' +
                    '<div class="wam-notif-item__text">' +
                    _esc(n.name) + '</div>' +
                    '<div class="wam-notif-item__meta">' +
                    (n.data && n.data.caseId ?
                        '<code>' + _esc(n.data.caseId) + '</code> · ' : '') +
                    _esc(_relTime(n.timestamp)) + '</div></div></li>';
            }
            html += '</ul>';
        }
        html += '</section>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — پروفایل
    // ─────────────────────────────────────
    function _renderProfile() {
        var u = STATE.currentUser || {};
        return '<section class="wam-verifier-section"><h3>👤 پروفایل</h3>' +
            '<div class="wam-profile-info">' +
            _prow('نام', u.name || '—') +
            _prow('نام کاربری', u.username || '—') +
            _prow('موبایل', u.mobile || '—') +
            _prow('نقش', 'اعتبارسنج') +
            '</div>' +
            '<div class="wam-profile-actions">' +
            '<a class="wam-btn wam-btn--primary" ' +
            'href="change-password.html">تغییر رمز عبور</a></div>' +
            '</section>';
    }

    function _prow(l, v) {
        return '<div class="wam-profile-row"><span class="wam-profile-row__label">' +
               _esc(l) + ':</span><span class="wam-profile-row__value">' +
               _esc(v) + '</span></div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — همگام‌سازی
    // ─────────────────────────────────────
    function _renderSync() {
        return '<section class="wam-verifier-section"><h3>🔄 همگام‌سازی</h3>' +
            '<p class="wam-text-muted">وضعیت همگام‌سازی داده‌ها:</p>' +
            '<div class="wam-sync-info">' +
            '<div class="wam-sync-info__row"><span>آخرین بروزرسانی:</span>' +
            '<strong>' + _esc(_relTime(STATE.lastUpdate)) + '</strong></div>' +
            '<div class="wam-sync-info__row"><span>صف بررسی:</span>' +
            '<strong>' + _fa(STATE.queue.length) + ' مورد</strong></div>' +
            '<div class="wam-sync-info__row"><span>بررسی‌شده:</span>' +
            '<strong>' + _fa(STATE.verified.length) + ' مورد</strong></div>' +
            '</div>' +
            '<div class="wam-verifier-quick">' +
            '<button class="wam-btn wam-btn--primary" ' +
            'data-vverifier-action="refresh">🔄 همگام‌سازی الان</button>' +
            '</div></section>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ناوبری
    // ─────────────────────────────────────
    function _renderNav() {
        var items = [
            { id: VIEWS.DASHBOARD,   icon: '🏠', label: 'داشبورد' },
            { id: VIEWS.QUEUE,       icon: '📋', label: 'صف بررسی' },
            { id: VIEWS.MY_VERIFIED, icon: '✅', label: 'بررسی‌شده‌ها' },
            { id: VIEWS.NOTIFS,      icon: '🔔', label: 'اعلان‌ها' },
            { id: VIEWS.SYNC,        icon: '🔄', label: 'همگام‌سازی' },
            { id: VIEWS.PROFILE,     icon: '👤', label: 'پروفایل' }
        ];
        var html = '<nav class="wam-verifier-nav" role="tablist">';
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            html += '<button type="button" role="tab" ' +
                    'class="wam-verifier-nav__item' +
                    (STATE.currentView === it.id ? ' is-active' : '') + '" ' +
                    'data-vverifier-view="' + it.id + '">' +
                    '<span class="wam-verifier-nav__icon">' + it.icon + '</span>' +
                    '<span class="wam-verifier-nav__label">' +
                    _esc(it.label) + '</span></button>';
        }
        html += '</nav>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — هدر
    // ─────────────────────────────────────
    function _renderHeader() {
        var u = STATE.currentUser || {};
        return '<header class="wam-verifier-header">' +
            '<div class="wam-verifier-header__left">' +
                '<div class="wam-verifier-header__avatar">' +
                    _esc((u.name || 'ا').charAt(0)) + '</div>' +
                '<div class="wam-verifier-header__info">' +
                    '<div class="wam-verifier-header__name">' +
                    _esc(u.name || 'اعتبارسنج') + '</div>' +
                    '<div class="wam-verifier-header__role">' +
                    '🔍 اعتبارسنج</div></div></div>' +
            '<div class="wam-verifier-header__right">' +
                '<button class="wam-btn-icon" data-vverifier-action="refresh" ' +
                'title="بروزرسانی">🔄</button>' +
                '<button class="wam-btn-icon" data-vverifier-action="logout" ' +
                'title="خروج">🚪</button>' +
            '</div></header>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نمای جاری
    // ─────────────────────────────────────
    function _renderCurrentView() {
        if (STATE.currentView === VIEWS.DASHBOARD)   return _renderDashboard();
        if (STATE.currentView === VIEWS.QUEUE)       return _renderQueue();
        if (STATE.currentView === VIEWS.MY_VERIFIED) return _renderVerified();
        if (STATE.currentView === VIEWS.NOTIFS)      return _renderNotifs();
        if (STATE.currentView === VIEWS.PROFILE)     return _renderProfile();
        if (STATE.currentView === VIEWS.SYNC)        return _renderSync();
        return '<div class="wam-empty">نمای نامعتبر.</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;
        STATE.root.innerHTML =
            '<div class="wam-verifier-app">' +
                _renderHeader() +
                '<main class="wam-verifier-main" data-vverifier="content">' +
                    _renderCurrentView() +
                '</main>' +
                _renderNav() +
            '</div>';
        _bindEvents();
        STATE.lastUpdate = Date.now();
        _emit(VEvents.UPDATED, {
            view: STATE.currentView, at: STATE.lastUpdate
        });
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents() {
        if (!STATE.root) return;

        var views = STATE.root.querySelectorAll('[data-vverifier-view]');
        for (var i = 0; i < views.length; i++) {
            views[i].addEventListener('click', _handleViewClick);
        }

        var actions = STATE.root.querySelectorAll('[data-vverifier-action]');
        for (var j = 0; j < actions.length; j++) {
            actions[j].addEventListener('click', _handleAction);
        }

        var caseActions = STATE.root.querySelectorAll('[data-vcase-action]');
        for (var k = 0; k < caseActions.length; k++) {
            caseActions[k].addEventListener('click', _handleCaseAction);
        }
    }

    function _handleViewClick(e) {
        e.preventDefault();
        var v = this.getAttribute('data-vverifier-view');
        if (!v || !VIEW_TITLES[v]) return;
        if (STATE.currentView === v) return;
        navigate(v);
    }

    function _handleAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-vverifier-action');
        if (a === 'logout') {
            if (typeof WamPayGuard !== 'undefined') WamPayGuard.logout();
            else if (typeof WamLogin !== 'undefined') WamLogin.logout();
            return;
        }
        if (a === 'refresh') { refresh(); return; }
        _emit(VEvents.ACTION, { action: a, at: Date.now() });
    }

    function _handleCaseAction(e) {
        e.preventDefault();
        var action = this.getAttribute('data-vcase-action');
        var id = this.getAttribute('data-case-id');
        if (!id) return;
        if (action === 'review') {
            // هدایت به صفحه جزئیات پرونده
            window.location.href = 'case-details.html?id=' +
                encodeURIComponent(id);
        }
    }

    // ─────────────────────────────────────
    // 🎯 ناوبری
    // ─────────────────────────────────────
    function navigate(view) {
        if (!VIEW_TITLES[view]) return false;
        if (STATE.currentView === view) return false;
        STATE.currentView = view;
        try {
            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, '', '#' + view);
            } else {
                window.location.hash = view;
            }
        } catch (e) { /* بی‌صدا */ }
        render();
        _emit(VEvents.VIEW_CHANGE, { view: view, at: Date.now() });
        return true;
    }

    // ─────────────────────────────────────
    // 🔄 بروزرسانی
    // ─────────────────────────────────────
    function refresh(options) {
        options = options || {};
        if (!STATE.root) return false;
        STATE.cases = _loadAllCases();
        STATE.queue = _loadQueue();
        STATE.verified = _loadMyVerified();
        STATE.notifications = _loadNotifications();
        render();
        _emit(VEvents.REFRESH, { at: Date.now() });
        if (!options.silent && typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('بروزرسانی شد', 'موفق');
        }
        return true;
    }

    function _startAutoRefresh() {
        _stopAutoRefresh();
        STATE.autoRefreshTimer = setInterval(function () {
            try {
                STATE.cases = _loadAllCases();
                STATE.queue = _loadQueue();
                STATE.verified = _loadMyVerified();
                STATE.notifications = _loadNotifications();
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
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var run = function () {
            STATE.currentUser = _getCurrentUser();
            if (!STATE.currentUser) {
                if (typeof WamPayGuard !== 'undefined') {
                    WamPayGuard.redirectToLogin('not_logged_in');
                }
                return;
            }
            var role = STATE.currentUser.role;
            if (role !== 'verifier' && role !== 'admin' && role !== 'super_admin') {
                if (typeof WamPayGuard !== 'undefined') {
                    WamPayGuard.redirectToRoleHome(role);
                }
                return;
            }

            var root = options.root ||
                       document.querySelector('[data-verifier-app]') ||
                       document.querySelector('.wam-verifier-panel') ||
                       document.querySelector('main');
            if (!root) {
                if (options.debug) console.warn('[verifier-app] root پیدا نشد');
                return;
            }
            STATE.root = root;

            // تعیین view از hash
            var hash = (typeof window !== 'undefined' && window.location.hash)
                ? window.location.hash.replace(/^#/, '') : '';
            if (hash && VIEW_TITLES[hash]) STATE.currentView = hash;

            // بارگذاری
            STATE.cases = _loadAllCases();
            STATE.queue = _loadQueue();
            STATE.verified = _loadMyVerified();
            STATE.notifications = _loadNotifications();

            render();

            if (options.autoRefresh !== false) _startAutoRefresh();

            STATE.installed = true;
            _emit(VEvents.READY, {
                user: { id: STATE.currentUser.id, username: STATE.currentUser.username },
                queueCount: STATE.queue.length,
                at: Date.now()
            });

            if (options.debug) {
                console.log('[verifier-app] آماده — ' + STATE.queue.length + ' در صف');
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
            user: STATE.currentUser ? {
                id: STATE.currentUser.id,
                username: STATE.currentUser.username,
                role: STATE.currentUser.role
            } : null,
            currentView: STATE.currentView,
            queueCount: STATE.queue.length,
            verifiedCount: STATE.verified.length,
            autoRefresh: !!STATE.autoRefreshTimer,
            lastUpdate: STATE.lastUpdate
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
    var WamVerifierApp = {
        EVENTS: VEvents,
        VIEWS: VIEWS,
        VIEW_TITLES: VIEW_TITLES,
        STATUS_LABELS: STATUS_LABELS,
        AUTOREFRESH_MS: AUTOREFRESH_MS,

        install: install,
        uninstall: uninstall,
        refresh: refresh,
        render: render,

        navigate: navigate,
        getCurrentView: function () { return STATE.currentView; },

        computeStats: computeStats,
        getQueue: function () { return STATE.queue.slice(); },
        getVerified: function () { return STATE.verified.slice(); },
        getNotifications: function () { return STATE.notifications.slice(); },

        getCurrentUser: _getCurrentUser,
        startAutoRefresh: _startAutoRefresh,
        stopAutoRefresh: _stopAutoRefresh,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamVerifierApp = WamVerifierApp;
    window.VerifierEvents = VEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-verifier-page') ||
                document.querySelector('[data-verifier-app]') ||
                document.querySelector('.wam-verifier-panel')) {
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