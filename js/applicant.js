// ==========================================
// وام پی — Applicant Panel
// فایل: applicant.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: داشبورد متقاضی — لیست پرونده‌ها، پیگیری، آمار
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var WIZARD_URL = 'applicant-wizard.html';
    var DETAIL_URL = 'case-details.html';
    var AUTOREFRESH_MS = 120000;   // ۲ دقیقه

    var STATUS_LABELS = {
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

    var STEP_TITLES = {
        step_1: 'ثبت درخواست',
        step_2: 'بارگذاری مدارک',
        step_3: 'بررسی اولیه',
        step_4: 'اعتبارسنجی',
        step_5: 'تأیید ادمین',
        step_6: 'ارسال به بانک',
        step_7: 'تأیید بانک',
        step_8: 'تنظیم قرارداد',
        step_9: 'پرداخت'
    };

    var STEP_ORDER = ['step_1', 'step_2', 'step_3', 'step_4', 'step_5',
                      'step_6', 'step_7', 'step_8', 'step_9'];

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        cases: [],
        filtered: [],
        notifications: [],
        currentUser: null,
        filterStatus: '',
        searchQuery: '',
        autoRefreshTimer: null,
        listeners: [],
        lastUpdate: null
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var ApplicantEvents = {
        READY:      'applicant.ready',
        UPDATED:    'applicant.updated',
        REFRESH:    'applicant.refresh',
        ACTION:     'applicant.action',
        NOTIF_READ: 'applicant.notif.read'
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

    function _statusLabel(st) {
        return STATUS_LABELS[st] || st || '—';
    }

    function _stepTitle(stepId) {
        return STEP_TITLES[stepId] || stepId || '—';
    }

    function _stepIndex(stepId) {
        var idx = STEP_ORDER.indexOf(stepId);
        return idx === -1 ? 0 : idx + 1;
    }

    // ─────────────────────────────────────
    // 👤 کاربر جاری
    // ─────────────────────────────────────
    function _getCurrentUser() {
        if (typeof WamPermissions === 'undefined') return null;
        return WamPermissions.getCurrentUser();
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری پرونده‌های کاربر
    // ─────────────────────────────────────
    function _loadMyCases() {
        if (!STATE.currentUser) return [];
        if (typeof CaseRepository === 'undefined') return [];

        var myId = STATE.currentUser.id;
        var myUsername = STATE.currentUser.username;
        var myMobile = STATE.currentUser.mobile;
        var myNationalCode = STATE.currentUser.nationalCode;

        try {
            var all = CaseRepository.getAll() || [];
            var mine = [];
            for (var i = 0; i < all.length; i++) {
                var c = all[i];
                if (!c) continue;
                // تطبیق بر اساس userId، mobile، یا nationalCode
                if (c.applicantUserId && c.applicantUserId === myId) {
                    mine.push(c);
                } else if (myMobile && c.applicantMobile &&
                           String(c.applicantMobile).replace(/\D/g, '') ===
                           String(myMobile).replace(/\D/g, '')) {
                    mine.push(c);
                } else if (myNationalCode && c.applicantNationalCode &&
                           String(c.applicantNationalCode).replace(/\D/g, '') ===
                           String(myNationalCode).replace(/\D/g, '')) {
                    mine.push(c);
                }
            }
            // مرتب‌سازی بر اساس آخرین تغییر
            mine.sort(function (a, b) {
                return (b.updatedAt || b.createdAt || 0) -
                       (a.updatedAt || a.createdAt || 0);
            });
            return mine;
        } catch (e) {
            console.error('[applicant] خطا در بارگذاری پرونده‌ها:', e);
            return [];
        }
    }

    // ─────────────────────────────────────
    // 📊 آمار پرونده‌ها
    // ─────────────────────────────────────
    function computeStats() {
        var stats = {
            total: STATE.cases.length,
            inProgress: 0,
            completed: 0,
            rejected: 0,
            draft: 0,
            totalAmount: 0,
            totalApprovedAmount: 0
        };
        for (var i = 0; i < STATE.cases.length; i++) {
            var c = STATE.cases[i];
            if (!c) continue;
            var st = c.status || 'draft';
            if (st === 'in_progress' || st === 'pending') stats.inProgress++;
            else if (st === 'completed') stats.completed++;
            else if (st === 'rejected') stats.rejected++;
            else if (st === 'draft') stats.draft++;
            var amt = Number(c.loanAmount) || 0;
            stats.totalAmount += amt;
            if (st === 'completed' || st === 'approved') {
                stats.totalApprovedAmount += amt;
            }
        }
        return stats;
    }

    // ─────────────────────────────────────
    // 🔔 اعلان‌ها
    // ─────────────────────────────────────
    function _loadNotifications() {
        var notifs = [];
        if (typeof EventBus === 'undefined') return notifs;
        try {
            var h = EventBus.getHistory() || [];
            var myCaseIds = {};
            for (var i = 0; i < STATE.cases.length; i++) {
                myCaseIds[STATE.cases[i].caseId] = true;
            }
            for (var j = h.length - 1; j >= 0 && notifs.length < 10; j--) {
                var ev = h[j];
                if (!ev || !ev.name) continue;
                if (ev.name.indexOf('case.') !== 0 &&
                    ev.name.indexOf('sm.') !== 0 &&
                    ev.name.indexOf('approval.') !== 0) continue;
                // فقط رویدادهای مربوط به پرونده‌های من
                if (ev.data && ev.data.caseId && myCaseIds[ev.data.caseId]) {
                    notifs.push({
                        name: ev.name,
                        data: ev.data,
                        timestamp: ev.timestamp || 0
                    });
                }
            }
        } catch (e) { /* بی‌صدا */ }
        return notifs;
    }

    function _notifIcon(name) {
        if (!name) return '•';
        if (name.indexOf('case.created') === 0) return '📝';
        if (name.indexOf('case.completed') === 0) return '🎉';
        if (name.indexOf('case.step.approved') === 0) return '✅';
        if (name.indexOf('case.step.rejected') === 0) return '❌';
        if (name.indexOf('approval.approved') === 0) return '👍';
        if (name.indexOf('approval.rejected') === 0) return '⛔';
        if (name.indexOf('sm.step.started') === 0) return '▶️';
        if (name.indexOf('sm.step.completed') === 0) return '✓';
        if (name.indexOf('sm.case.finished') === 0) return '🏁';
        return '🔔';
    }

    function _notifLabel(name) {
        var map = {
            'case.created':          'پرونده شما ثبت شد',
            'case.updated':          'پرونده به‌روزرسانی شد',
            'case.completed':        'پرونده تکمیل شد',
            'case.step.approved':    'یک مرحله تأیید شد',
            'case.step.rejected':    'یک مرحله رد شد',
            'approval.approved':     'تأیید ادمین ثبت شد',
            'approval.rejected':     'رد ادمین ثبت شد',
            'approval.revision':     'درخواست اصلاح',
            'sm.step.started':       'شروع مرحله جدید',
            'sm.step.completed':     'مرحله تکمیل شد',
            'sm.case.finished':      'پرونده به پایان رسید'
        };
        return map[name] || name;
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر
    // ─────────────────────────────────────
    function _applyFilter() {
        var st = STATE.filterStatus;
        var q = (STATE.searchQuery || '').toLowerCase().trim();

        STATE.filtered = STATE.cases.filter(function (c) {
            if (!c) return false;
            if (st && (c.status || 'draft') !== st) return false;
            if (q) {
                var hay = [c.caseId, c.bank, c.purpose]
                    .filter(Boolean).join(' ').toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            return true;
        });
        return STATE.filtered;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت آمار
    // ─────────────────────────────────────
    function _renderStatCard(label, value, icon, accent) {
        accent = accent || '';
        return '' +
            '<div class="wam-stat' + (accent ? ' wam-stat--' + accent : '') + '">' +
                '<div class="wam-stat__icon">' + icon + '</div>' +
                '<div class="wam-stat__body">' +
                    '<div class="wam-stat__value">' + _formatNumber(value) + '</div>' +
                    '<div class="wam-stat__label">' + _escapeHtml(label) + '</div>' +
                '</div>' +
            '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت پرونده
    // ─────────────────────────────────────
    function _renderCaseCard(c) {
        var status = c.status || 'draft';
        var currentStep = c.currentStep || 'step_1';
        var stepNum = _stepIndex(currentStep);
        var progress = Math.round((stepNum / 9) * 100);

        var html = '<div class="wam-case-card" data-case-id="' +
                   _escapeHtml(c.caseId) + '">';

        // هدر
        html += '<div class="wam-case-card__head">';
        html += '<div class="wam-case-card__id"><code>' +
                _escapeHtml(c.caseId) + '</code></div>';
        html += '<div class="wam-badge wam-badge--' + _escapeHtml(status) + '">' +
                _escapeHtml(_statusLabel(status)) + '</div>';
        html += '</div>';

        // بدنه
        html += '<div class="wam-case-card__body">';
        html += '<div class="wam-case-card__row">' +
                '<span>بانک:</span> <strong>' +
                _escapeHtml(c.bank || '—') + '</strong></div>';
        html += '<div class="wam-case-card__row">' +
                '<span>مبلغ درخواستی:</span> <strong>' +
                _formatAmount(c.loanAmount) + ' ریال</strong></div>';
        html += '<div class="wam-case-card__row">' +
                '<span>هدف:</span> <strong>' +
                _escapeHtml(c.purpose || '—') + '</strong></div>';
        html += '</div>';

        // پیشرفت
        html += '<div class="wam-case-card__progress">';
        html += '<div class="wam-case-card__step-label">' +
                'مرحله ' + _formatNumber(stepNum) + ' از ۹ — ' +
                _escapeHtml(_stepTitle(currentStep)) + '</div>';
        html += '<div class="wam-progress-bar">' +
                '<div class="wam-progress-bar__fill" style="width:' +
                progress + '%"></div></div>';
        html += '</div>';

        // فوتر
        html += '<div class="wam-case-card__foot">';
        html += '<div class="wam-case-card__time">' +
                'آخرین تغییر: ' +
                _escapeHtml(_relativeTime(c.updatedAt || c.createdAt)) +
                '</div>';
        html += '<button class="wam-btn wam-btn--primary wam-btn--sm" ' +
                'data-action="view" data-case-id="' +
                _escapeHtml(c.caseId) + '">مشاهده جزئیات</button>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — لیست پرونده‌ها
    // ─────────────────────────────────────
    function _renderCasesList() {
        if (!STATE.root) return;
        var container = STATE.root.querySelector('[data-app="cases"]');
        if (!container) return;

        var list = STATE.filtered;

        if (list.length === 0) {
            var msg = STATE.cases.length === 0
                ? 'هنوز درخواستی ثبت نکرده‌اید.'
                : 'نتیجه‌ای برای فیلتر فعلی یافت نشد.';
            var btn = STATE.cases.length === 0
                ? '<a href="' + WIZARD_URL + '" class="wam-btn wam-btn--primary">' +
                  '➕ ثبت درخواست جدید</a>'
                : '';
            container.innerHTML =
                '<div class="wam-app-empty">' +
                    '<div class="wam-app-empty__icon">📁</div>' +
                    '<p>' + _escapeHtml(msg) + '</p>' +
                    btn +
                '</div>';
            return;
        }

        var html = '<div class="wam-cases-grid">';
        for (var i = 0; i < list.length; i++) {
            html += _renderCaseCard(list[i]);
        }
        html += '</div>';
        container.innerHTML = html;

        _bindCaseActions(container);
    }

    // ─────────────────────────────────────
    // 🎨 رندر — اعلان‌ها
    // ─────────────────────────────────────
    function _renderNotifications() {
        if (!STATE.root) return;
        var box = STATE.root.querySelector('[data-app="notifications"]');
        if (!box) return;

        var list = STATE.notifications;
        if (list.length === 0) {
            box.innerHTML = '<div class="wam-app-empty wam-app-empty--sm">' +
                '<p>اعلان جدیدی ندارید.</p></div>';
            return;
        }

        var html = '<ul class="wam-notif-list">';
        for (var i = 0; i < list.length; i++) {
            var n = list[i];
            html += '<li class="wam-notif-item">' +
                '<span class="wam-notif-item__icon">' +
                    _notifIcon(n.name) + '</span>' +
                '<div class="wam-notif-item__body">' +
                    '<div class="wam-notif-item__text">' +
                        _escapeHtml(_notifLabel(n.name)) + '</div>' +
                    '<div class="wam-notif-item__meta">' +
                        (n.data && n.data.caseId ?
                            '<code>' + _escapeHtml(n.data.caseId) + '</code> · ' : '') +
                        _escapeHtml(_relativeTime(n.timestamp)) +
                    '</div>' +
                '</div>' +
            '</li>';
        }
        html += '</ul>';
        box.innerHTML = html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — آمار
    // ─────────────────────────────────────
    function _renderStats() {
        if (!STATE.root) return;
        var box = STATE.root.querySelector('[data-app="stats"]');
        if (!box) return;

        var s = computeStats();
        var html = '';
        html += _renderStatCard('کل درخواست‌ها', s.total, '📋');
        html += _renderStatCard('در جریان', s.inProgress, '⏳', 'warning');
        html += _renderStatCard('تکمیل‌شده', s.completed, '✅', 'success');
        html += _renderStatCard('رد شده', s.rejected, '❌', 'danger');
        box.innerHTML = html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — خلاصه مبلغ
    // ─────────────────────────────────────
    function _renderAmountSummary() {
        if (!STATE.root) return;
        var box = STATE.root.querySelector('[data-app="amount-summary"]');
        if (!box) return;

        var s = computeStats();
        box.innerHTML =
            '<div class="wam-amount-summary">' +
                '<div class="wam-amount-summary__row">' +
                    '<span>مجموع درخواست‌ها:</span>' +
                    '<strong>' + _formatAmount(s.totalAmount) + ' ریال</strong>' +
                '</div>' +
                '<div class="wam-amount-summary__row">' +
                    '<span>مجموع تأییدشده:</span>' +
                    '<strong class="wam-success">' +
                    _formatAmount(s.totalApprovedAmount) + ' ریال</strong>' +
                '</div>' +
            '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — آخرین بروزرسانی
    // ─────────────────────────────────────
    function _renderFooter() {
        if (!STATE.root) return;
        var el = STATE.root.querySelector('[data-app="updated-at"]');
        if (el) {
            el.textContent = 'آخرین بروزرسانی: ' + _relativeTime(Date.now());
        }
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;
        _applyFilter();
        _renderStats();
        _renderAmountSummary();
        _renderCasesList();
        _renderNotifications();
        _renderFooter();

        STATE.lastUpdate = Date.now();
        _emit(ApplicantEvents.UPDATED, {
            stats: computeStats(),
            casesCount: STATE.cases.length,
            at: STATE.lastUpdate
        });
    }

    // ─────────────────────────────────────
    // 🔄 بروزرسانی
    // ─────────────────────────────────────
    function refresh(options) {
        options = options || {};
        if (!STATE.root) return false;

        STATE.currentUser = _getCurrentUser();
        if (!STATE.currentUser) {
            if (typeof WamPayGuard !== 'undefined') {
                WamPayGuard.redirectToLogin('not_logged_in');
            }
            return false;
        }

        STATE.cases = _loadMyCases();
        STATE.notifications = _loadNotifications();
        render();
        _emit(ApplicantEvents.REFRESH, { at: Date.now() });

        if (!options.silent && typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('بروزرسانی شد', 'موفق');
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
                STATE.cases = _loadMyCases();
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
    // 🖱️ رویدادها
    // ─────────────────────────────────────
    function _bindCaseActions(container) {
        var btns = container.querySelectorAll('[data-action="view"]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function (e) {
                e.preventDefault();
                var id = this.getAttribute('data-case-id');
                _emit(ApplicantEvents.ACTION, {
                    action: 'view_case', caseId: id, at: Date.now()
                });
                if (id) {
                    window.location.href = DETAIL_URL + '?id=' +
                        encodeURIComponent(id);
                }
            });
        }
    }

    function _bindFilters() {
        if (!STATE.root) return;

        var searchEl = STATE.root.querySelector('[data-app="search"]');
        if (searchEl) {
            searchEl.addEventListener('input', function () {
                STATE.searchQuery = this.value;
                render();
            });
        }

        var statusEl = STATE.root.querySelector('[data-app="filter-status"]');
        if (statusEl) {
            statusEl.addEventListener('change', function () {
                STATE.filterStatus = this.value;
                render();
            });
        }

        var refreshBtn = STATE.root.querySelector('[data-app-action="refresh"]');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function (e) {
                e.preventDefault();
                refresh();
            });
        }

        var newBtn = STATE.root.querySelector('[data-app-action="new"]');
        if (newBtn) {
            newBtn.addEventListener('click', function (e) {
                e.preventDefault();
                window.location.href = WIZARD_URL;
            });
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
            // بررسی ورود
            STATE.currentUser = _getCurrentUser();
            if (!STATE.currentUser) {
                if (typeof WamPayGuard !== 'undefined') {
                    WamPayGuard.redirectToLogin('not_logged_in');
                }
                return;
            }

            // فقط applicant (یا admin در حالت debug)
            var role = STATE.currentUser.role;
            if (role !== 'applicant' && role !== 'admin' && role !== 'super_admin') {
                if (typeof WamUI !== 'undefined') {
                    WamUI.toastError('دسترسی به این صفحه مجاز نیست', 'خطا');
                }
                if (typeof WamPayGuard !== 'undefined') {
                    WamPayGuard.redirectToRoleHome(role);
                }
                return;
            }

            var root = options.root ||
                       document.querySelector('[data-app-root]') ||
                       document.querySelector('.wam-applicant-panel') ||
                       document.querySelector('main');
            if (!root) {
                if (options.debug) console.warn('[applicant] root پیدا نشد');
                return;
            }

            STATE.root = root;

            // بارگذاری اولیه
            STATE.cases = _loadMyCases();
            STATE.notifications = _loadNotifications();

            _bindFilters();
            render();

            if (options.autoRefresh !== false) {
                _startAutoRefresh();
            }

            STATE.installed = true;
            _emit(ApplicantEvents.READY, {
                user: {
                    id: STATE.currentUser.id,
                    username: STATE.currentUser.username
                },
                casesCount: STATE.cases.length,
                at: Date.now()
            });

            if (options.debug) {
                console.log('[applicant] آماده، ' + STATE.cases.length + ' پرونده');
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
            casesCount: STATE.cases.length,
            filteredCount: STATE.filtered.length,
            notifCount: STATE.notifications.length,
            autoRefresh: !!STATE.autoRefreshTimer,
            lastUpdate: STATE.lastUpdate
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
    var WamApplicant = {
        EVENTS: ApplicantEvents,
        STATUS_LABELS: STATUS_LABELS,
        STEP_TITLES: STEP_TITLES,
        WIZARD_URL: WIZARD_URL,
        DETAIL_URL: DETAIL_URL,
        AUTOREFRESH_MS: AUTOREFRESH_MS,

        install: install,
        uninstall: uninstall,
        refresh: refresh,
        render: render,

        computeStats: computeStats,
        getMyCases: function () { return STATE.cases.slice(); },
        getFiltered: function () { return STATE.filtered.slice(); },
        getNotifications: function () { return STATE.notifications.slice(); },

        startAutoRefresh: _startAutoRefresh,
        stopAutoRefresh: _stopAutoRefresh,

        getCurrentUser: _getCurrentUser,
        getStatus: getStatus,
        onChange: onChange
    };

    window.WamApplicant = WamApplicant;
    window.ApplicantEvents = ApplicantEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var body = document.body;
            if (!body) return;
            if (body.hasAttribute('data-applicant-page') ||
                document.querySelector('[data-app-root]') ||
                document.querySelector('.wam-applicant-panel')) {
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