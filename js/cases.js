// ==========================================
// وام پی — Shared Modules
// فایل: cases.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: ماژول مشترک مدیریت پرونده‌ها — لیست، فیلتر، نمای نقش‌محور
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION   = '1.0.0';
    var ROOT_ATTR = 'data-cases-root';
    var PAGE_SIZE = 20;

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
        step_1: 'ثبت درخواست', step_2: 'بارگذاری مدارک',
        step_3: 'بررسی اولیه', step_4: 'اعتبارسنجی',
        step_5: 'تأیید ادمین', step_6: 'ارسال به بانک',
        step_7: 'تأیید بانک', step_8: 'تنظیم قرارداد',
        step_9: 'پرداخت'
    };

    var PRIORITY_LABELS = {
        low: 'کم', normal: 'معمولی', high: 'بالا', urgent: 'فوری'
    };

    var SORT_OPTIONS = {
        newest:   'جدیدترین',
        oldest:   'قدیمی‌ترین',
        amount:   'بیشترین مبلغ',
        priority: 'اولویت',
        progress: 'پیشرفت'
    };

    var VIEW_MODES = { TABLE: 'table', CARDS: 'cards' };

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        context: null,           // نقش / user context
        root: null,
        role: null,              // current user role
        userId: null,
        cases: [],
        filtered: [],
        page: 1,
        viewMode: VIEW_MODES.TABLE,
        sort: 'newest',
        filters: {
            query: '',
            status: '',
            bank: '',
            step: '',
            minAmount: '',
            maxAmount: '',
            fromDate: '',
            toDate: ''
        },
        selectedIds: {},
        scope: 'auto',           // auto | all | mine | queue
        listeners: [],
        _boundIds: {}
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var CaseEvents = {
        LOADED:     'shared.cases.loaded',
        RENDERED:   'shared.cases.rendered',
        FILTERED:   'shared.cases.filtered',
        SORTED:     'shared.cases.sorted',
        PAGE:       'shared.cases.page',
        SELECT:     'shared.cases.select',
        VIEW_MODE:  'shared.cases.view_mode',
        ROW_CLICK:  'shared.cases.row_click',
        ACTION:     'shared.cases.action',
        STATS:      'shared.cases.stats'
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

    function _en(s) {
        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.toEnglishDigits) {
            return WamPersianDate.toEnglishDigits(s);
        }
        return String(s || '').replace(/[۰-۹]/g, function (d) {
            return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
        });
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
        var mon = Math.floor(day / 30);
        if (mon < 12) return _fa(mon) + ' ماه پیش';
        return _fa(Math.floor(mon / 12)) + ' سال پیش';
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

    function _statusLabel(st) { return STATUS_LABELS[st] || st || '—'; }
    function _stepTitle(sid) { return STEP_TITLES[sid] || sid || '—'; }
    function _priorityLabel(p) { return PRIORITY_LABELS[p] || '—'; }

    function _stepIndex(stepId) {
        var order = ['step_1','step_2','step_3','step_4','step_5',
                     'step_6','step_7','step_8','step_9'];
        var i = order.indexOf(stepId);
        return i === -1 ? 0 : i + 1;
    }

    function _role() {
        if (typeof WamPermissions === 'undefined') return null;
        var u = WamPermissions.getCurrentUser();
        return u ? u.role : null;
    }

    function _user() {
        if (typeof WamPermissions === 'undefined') return null;
        return WamPermissions.getCurrentUser();
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری پرونده‌ها بر اساس نقش
    // ─────────────────────────────────────
    function _loadAllCases() {
        if (typeof CaseRepository === 'undefined') return [];
        try { return CaseRepository.getAll() || []; }
        catch (e) { return []; }
    }

    function _filterByRole(cases, scope) {
        var role = _role();
        var user = _user();
        if (!user) return [];

        // Super Admin و Admin: همه چیز
        if (role === 'super_admin' || role === 'admin') {
            if (scope === 'queue') {
                return cases.filter(_isInQueue);
            }
            return cases;
        }

        // Verifier: صف + موارد بررسی‌شده
        if (role === 'verifier') {
            if (scope === 'queue') {
                return cases.filter(_isInQueue);
            }
            if (scope === 'mine') {
                return cases.filter(function (c) { return _isVerifiedBy(c, user.id); });
            }
            // auto: صف + بررسی‌شده
            return cases.filter(function (c) {
                return _isInQueue(c) || _isVerifiedBy(c, user.id);
            });
        }

        // Broker: پرونده‌های خودش
        if (role === 'broker') {
            return cases.filter(function (c) {
                if (!c) return false;
                if (c.brokerId && user.id) {
                    // brokerId همان userId نیست، باید با brokers بررسی شود
                }
                if (c.brokerId) {
                    // تطبیق با mobile یا name
                    return _brokerMatches(c, user);
                }
                if (c.brokerName && user.name) {
                    return c.brokerName === user.name;
                }
                return false;
            });
        }

        // Applicant: پرونده‌های خودش
        if (role === 'applicant') {
            return cases.filter(function (c) {
                if (!c) return false;
                if (c.applicantMobile && user.mobile) {
                    if (String(c.applicantMobile).replace(/\D/g, '') ===
                        String(user.mobile).replace(/\D/g, '')) return true;
                }
                if (c.applicantUserId && c.applicantUserId === user.id) return true;
                if (c.applicantNationalCode && user.nationalCode) {
                    if (String(c.applicantNationalCode).replace(/\D/g, '') ===
                        String(user.nationalCode).replace(/\D/g, '')) return true;
                }
                return false;
            });
        }

        return cases;
    }

    function _brokerMatches(c, user) {
        if (!c || !user) return false;
        if (c.brokerId && c.brokerId === user.id) return true;
        // بررسی از طریق BROKERS_KEY
        if (typeof Storage !== 'undefined') {
            try {
                var brokers = Storage.getJSON('wamPayBrokers', []) || [];
                for (var i = 0; i < brokers.length; i++) {
                    var b = brokers[i];
                    if (!b) continue;
                    if (b.userId === user.id && b.id === c.brokerId) return true;
                    if (b.brokerCode && c.brokerCode === b.brokerCode) return true;
                }
            } catch (e) { /* بی‌صدا */ }
        }
        if (c.brokerName && user.name && c.brokerName === user.name) return true;
        return false;
    }

    function _isInQueue(c) {
        if (!c) return false;
        var step = c.currentStep || '';
        var st = c.status || 'draft';
        return (step === 'step_3' || step === 'step_4') &&
               st !== 'completed' && st !== 'rejected' &&
               st !== 'cancelled' && st !== 'archived';
    }

    function _isVerifiedBy(c, userId) {
        if (!c || !userId) return false;
        var appr = c.adminApprovals || {};
        for (var k in appr) {
            if (Object.prototype.hasOwnProperty.call(appr, k)) {
                var a = appr[k];
                if (a && a.approvedBy === userId) return true;
            }
        }
        if (c.steps) {
            for (var sid in c.steps) {
                if (Object.prototype.hasOwnProperty.call(c.steps, sid)) {
                    var s = c.steps[sid];
                    if (s && (s.completedBy === userId || s.startedBy === userId)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر
    // ─────────────────────────────────────
    function _applyFilters() {
        var f = STATE.filters;
        var q = (f.query || '').toLowerCase().trim();
        var minAmt = f.minAmount ? Number(_en(f.minAmount)) : 0;
        var maxAmt = f.maxAmount ? Number(_en(f.maxAmount)) : 0;
        var fromTs = f.fromDate ? _parseJalali(f.fromDate) : 0;
        var toTs = f.toDate ? _parseJalali(f.toDate) : 0;

        STATE.filtered = STATE.cases.filter(function (c) {
            if (!c) return false;

            if (q) {
                var hay = [c.caseId, c.applicantName, c.applicantMobile,
                           c.bank, c.brokerName, c.applicantNationalCode]
                    .filter(Boolean).join(' ').toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            if (f.status && (c.status || 'draft') !== f.status) return false;
            if (f.bank && c.bank !== f.bank) return false;
            if (f.step && c.currentStep !== f.step) return false;

            var amt = Number(c.loanAmount) || 0;
            if (minAmt > 0 && amt < minAmt) return false;
            if (maxAmt > 0 && amt > maxAmt) return false;

            var created = c.createdAt || 0;
            if (fromTs && created < fromTs) return false;
            if (toTs && created > toTs + 86400000) return false;

            return true;
        });

        _applySort();
        _emit(CaseEvents.FILTERED, {
            count: STATE.filtered.length, filters: f
        });
        return STATE.filtered;
    }

    function _parseJalali(str) {
        if (!str) return 0;
        try {
            if (typeof WamPersianDate !== 'undefined' && WamPersianDate.parse) {
                var p = WamPersianDate.parse(str, 'YYYY/MM/DD');
                if (p) {
                    var d = WamPersianDate.jalaliToDate(p.jy, p.jm, p.jd);
                    if (d) return d.getTime();
                }
            }
        } catch (e) { /* بی‌صدا */ }
        return 0;
    }

    // ─────────────────────────────────────
    // 🔀 مرتب‌سازی
    // ─────────────────────────────────────
    function _applySort() {
        var s = STATE.sort;
        STATE.filtered.sort(function (a, b) {
            if (s === 'newest') {
                return (b.updatedAt || b.createdAt || 0) -
                       (a.updatedAt || a.createdAt || 0);
            }
            if (s === 'oldest') {
                return (a.createdAt || 0) - (b.createdAt || 0);
            }
            if (s === 'amount') {
                return (Number(b.loanAmount) || 0) - (Number(a.loanAmount) || 0);
            }
            if (s === 'priority') {
                var order = { urgent: 4, high: 3, normal: 2, low: 1 };
                return (order[b.priority] || 0) - (order[a.priority] || 0);
            }
            if (s === 'progress') {
                return _stepIndex(b.currentStep) - _stepIndex(a.currentStep);
            }
            return 0;
        });
    }

    // ─────────────────────────────────────
    // 📊 آمار
    // ─────────────────────────────────────
    function computeStats() {
        var stats = {
            total: STATE.cases.length,
            filtered: STATE.filtered.length,
            byStatus: {},
            byStep: {},
            byBank: {},
            inProgress: 0,
            completed: 0,
            rejected: 0,
            pending: 0,
            totalAmount: 0,
            approvedAmount: 0
        };

        for (var i = 0; i < STATE.cases.length; i++) {
            var c = STATE.cases[i];
            if (!c) continue;
            var st = c.status || 'draft';
            stats.byStatus[st] = (stats.byStatus[st] || 0) + 1;

            var step = c.currentStep || 'unknown';
            stats.byStep[step] = (stats.byStep[step] || 0) + 1;

            var bank = c.bank || 'unknown';
            stats.byBank[bank] = (stats.byBank[bank] || 0) + 1;

            if (st === 'completed') stats.completed++;
            else if (st === 'rejected') stats.rejected++;
            else if (st === 'pending') stats.pending++;
            else if (st === 'in_progress') stats.inProgress++;

            var amt = Number(c.loanAmount) || 0;
            stats.totalAmount += amt;
            if (st === 'completed' || st === 'approved') {
                stats.approvedAmount += amt;
            }
        }

        _emit(CaseEvents.STATS, { stats: stats });
        return stats;
    }

    // ─────────────────────────────────────
    // ☑️ انتخاب
    // ─────────────────────────────────────
    function _getSelectedIds() {
        var ids = [];
        for (var k in STATE.selectedIds) {
            if (Object.prototype.hasOwnProperty.call(STATE.selectedIds, k)) {
                ids.push(k);
            }
        }
        return ids;
    }

    function selectAll() {
        for (var i = 0; i < STATE.filtered.length; i++) {
            STATE.selectedIds[STATE.filtered[i].caseId] = true;
        }
        _emit(CaseEvents.SELECT, { count: _getSelectedIds().length });
        return _getSelectedIds().length;
    }

    function clearSelection() {
        STATE.selectedIds = {};
        _emit(CaseEvents.SELECT, { count: 0 });
        return true;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت آمار
    // ─────────────────────────────────────
    function _renderStatsBar() {
        var s = computeStats();
        return '<div class="wam-cases__stats">' +
            '<div class="wam-cases__stat"><span>کل:</span> <strong>' +
                _fa(s.total) + '</strong></div>' +
            '<div class="wam-cases__stat"><span>در جریان:</span> <strong>' +
                _fa(s.inProgress) + '</strong></div>' +
            '<div class="wam-cases__stat"><span>تکمیل:</span> <strong>' +
                _fa(s.completed) + '</strong></div>' +
            '<div class="wam-cases__stat"><span>رد:</span> <strong>' +
                _fa(s.rejected) + '</strong></div>' +
            '<div class="wam-cases__stat"><span>مجموع مبالغ:</span> <strong>' +
                _amt(s.totalAmount) + ' ریال</strong></div>' +
        '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نوار ابزار
    // ─────────────────────────────────────
    function _renderToolbar() {
        var selected = _getSelectedIds().length;

        var html = '<div class="wam-cases__toolbar">';

        // فیلترها
        html += '<div class="wam-cases__filters">';
        html += '<input type="search" data-cases="search" ' +
                'placeholder="🔍 جستجو..." value="' + _esc(STATE.filters.query) + '">';

        html += '<select data-cases="filter-status">' +
                '<option value="">همه وضعیت‌ها</option>';
        for (var st in STATUS_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(STATUS_LABELS, st)) continue;
            html += '<option value="' + st + '"' +
                    (STATE.filters.status === st ? ' selected' : '') + '>' +
                    _esc(STATUS_LABELS[st]) + '</option>';
        }
        html += '</select>';

        html += '<select data-cases="filter-step">' +
                '<option value="">همه مراحل</option>';
        for (var stepId in STEP_TITLES) {
            if (!Object.prototype.hasOwnProperty.call(STEP_TITLES, stepId)) continue;
            html += '<option value="' + stepId + '"' +
                    (STATE.filters.step === stepId ? ' selected' : '') + '>' +
                    _esc(STEP_TITLES[stepId]) + '</option>';
        }
        html += '</select>';

        html += '<select data-cases="sort">';
        for (var sk in SORT_OPTIONS) {
            if (!Object.prototype.hasOwnProperty.call(SORT_OPTIONS, sk)) continue;
            html += '<option value="' + sk + '"' +
                    (STATE.sort === sk ? ' selected' : '') + '>' +
                    _esc(SORT_OPTIONS[sk]) + '</option>';
        }
        html += '</select>';

        html += '<button class="wam-btn-icon" data-cases-action="toggle-view" ' +
                'title="حالت نمایش">' +
                (STATE.viewMode === 'table' ? '🃏' : '📋') + '</button>';

        html += '<button class="wam-btn-icon" data-cases-action="refresh" ' +
                'title="بروزرسانی">🔄</button>';

        if (selected > 0) {
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-cases-action="clear-selection">لغو انتخاب</button>';
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-cases-action="export-selected">📤 (' +
                    _fa(selected) + ')</button>';
        } else {
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-cases-action="export">📤 CSV</button>';
        }

        html += '</div>';
        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — جدول
    // ─────────────────────────────────────
    function _renderTable() {
        var list = STATE.filtered;
        var start = (STATE.page - 1) * PAGE_SIZE;
        var end = Math.min(start + PAGE_SIZE, list.length);
        var items = list.slice(start, end);

        if (items.length === 0) {
            return '<div class="wam-empty">' +
                (STATE.cases.length === 0
                    ? 'هیچ پرونده‌ای وجود ندارد.'
                    : 'نتیجه‌ای برای فیلتر فعلی یافت نشد.') +
                '</div>';
        }

        var html = '<div class="wam-cases__table-wrap">' +
            '<table class="wam-cases__table"><thead><tr>';

        html += '<th class="wam-cases__check">' +
                '<input type="checkbox" data-cases="select-all"' +
                (_getSelectedIds().length > 0 ? ' checked' : '') + '></th>';
        html += '<th>شناسه</th>';
        html += '<th>متقاضی</th>';
        html += '<th>بانک</th>';
        html += '<th>مبلغ</th>';
        html += '<th>وضعیت</th>';
        html += '<th>مرحله</th>';
        html += '<th>آخرین تغییر</th>';
        html += '<th>عملیات</th>';

        html += '</tr></thead><tbody>';

        for (var i = 0; i < items.length; i++) {
            html += _renderRow(items[i]);
        }

        html += '</tbody></table></div>';
        return html;
    }

    function _renderRow(c) {
        var st = c.status || 'draft';
        var selected = !!STATE.selectedIds[c.caseId];
        var progress = Math.round((_stepIndex(c.currentStep) / 9) * 100);

        var html = '<tr data-cases-id="' + _esc(c.caseId) + '"' +
                   (selected ? ' class="is-selected"' : '') + '>';

        html += '<td><input type="checkbox" data-cases="select-row"' +
                (selected ? ' checked' : '') + '></td>';

        html += '<td><code>' + _esc(c.caseId) + '</code></td>';
        html += '<td>' + _esc(c.applicantName || '—') + '</td>';
        html += '<td>' + _esc(c.bank || '—') + '</td>';
        html += '<td>' + _amt(c.loanAmount) + '</td>';
        html += '<td><span class="wam-badge wam-badge--' + _esc(st) + '">' +
                _esc(_statusLabel(st)) + '</span></td>';

        html += '<td class="wam-cases__step-cell">' +
                '<div class="wam-cases__progress-mini">' +
                '<div class="wam-cases__progress-fill" style="width:' +
                progress + '%"></div></div>' +
                '<span>' + _esc(_stepTitle(c.currentStep)) + '</span></td>';

        html += '<td>' + _esc(_relTime(c.updatedAt || c.createdAt)) + '</td>';

        html += '<td class="wam-cases__actions">' +
                '<button class="wam-btn-icon" data-cases-row-action="view" ' +
                'title="مشاهده">👁️</button>' +
                '</td>';

        html += '</tr>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت
    // ─────────────────────────────────────
    function _renderCards() {
        var list = STATE.filtered;
        var start = (STATE.page - 1) * PAGE_SIZE;
        var end = Math.min(start + PAGE_SIZE, list.length);
        var items = list.slice(start, end);

        if (items.length === 0) {
            return '<div class="wam-empty">نتیجه‌ای یافت نشد.</div>';
        }

        var html = '<div class="wam-cases__cards">';
        for (var i = 0; i < items.length; i++) {
            html += _renderCard(items[i]);
        }
        html += '</div>';
        return html;
    }

    function _renderCard(c) {
        var st = c.status || 'draft';
        var selected = !!STATE.selectedIds[c.caseId];
        var progress = Math.round((_stepIndex(c.currentStep) / 9) * 100);

        return '<div class="wam-cases__card' +
            (selected ? ' is-selected' : '') + '" data-cases-id="' +
            _esc(c.caseId) + '">' +
            '<div class="wam-cases__card-head">' +
                '<input type="checkbox" data-cases="select-row"' +
                (selected ? ' checked' : '') + '>' +
                '<code>' + _esc(c.caseId) + '</code>' +
                '<span class="wam-badge wam-badge--' + _esc(st) + '">' +
                _esc(_statusLabel(st)) + '</span>' +
            '</div>' +
            '<div class="wam-cases__card-name">' +
                _esc(c.applicantName || '—') + '</div>' +
            '<div class="wam-cases__card-rows">' +
                '<div><span>بانک:</span> ' + _esc(c.bank || '—') + '</div>' +
                '<div><span>مبلغ:</span> ' + _amt(c.loanAmount) + ' ریال</div>' +
                '<div><span>مرحله:</span> ' + _esc(_stepTitle(c.currentStep)) + '</div>' +
            '</div>' +
            '<div class="wam-cases__card-progress">' +
                '<div class="wam-cases__progress-fill" style="width:' +
                progress + '%"></div></div>' +
            '<div class="wam-cases__card-foot">' +
                '<span>' + _esc(_relTime(c.updatedAt || c.createdAt)) + '</span>' +
                '<button class="wam-btn wam-btn--sm" ' +
                'data-cases-row-action="view">مشاهده</button>' +
            '</div></div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — صفحه‌بندی
    // ─────────────────────────────────────
    function _renderPagination(total) {
        var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (pages <= 1) return '';

        var p = STATE.page;
        var html = '<div class="wam-cases__pagination">';

        html += '<button data-cases-page="' + (p - 1) + '"' +
                (p === 1 ? ' disabled' : '') + '>‹</button>';

        var start = Math.max(1, p - 2);
        var end = Math.min(pages, p + 2);

        if (start > 1) {
            html += '<button data-cases-page="1">' + _fa(1) + '</button>';
            if (start > 2) html += '<span>…</span>';
        }

        for (var i = start; i <= end; i++) {
            html += '<button data-cases-page="' + i + '"' +
                    (i === p ? ' class="is-active"' : '') + '>' +
                    _fa(i) + '</button>';
        }

        if (end < pages) {
            if (end < pages - 1) html += '<span>…</span>';
            html += '<button data-cases-page="' + pages + '">' +
                    _fa(pages) + '</button>';
        }

        html += '<button data-cases-page="' + (p + 1) + '"' +
                (p === pages ? ' disabled' : '') + '>›</button>';
        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;

        _applyFilters();

        var body;
        if (STATE.viewMode === VIEW_MODES.TABLE) {
            body = _renderTable();
        } else {
            body = _renderCards();
        }

        var html =
            '<div class="wam-cases">' +
                _renderStatsBar() +
                _renderToolbar() +
                '<div class="wam-cases__body">' + body + '</div>' +
                _renderPagination(STATE.filtered.length) +
            '</div>';

        STATE.root.innerHTML = html;
        _bindEvents();

        _emit(CaseEvents.RENDERED, {
            count: STATE.filtered.length,
            page: STATE.page,
            viewMode: STATE.viewMode,
            at: Date.now()
        });
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents() {
        if (!STATE.root) return;

        // فیلترها
        var searchEl = STATE.root.querySelector('[data-cases="search"]');
        if (searchEl) {
            searchEl.addEventListener('input', function () {
                STATE.filters.query = this.value;
                STATE.page = 1;
                render();
            });
        }

        var statusEl = STATE.root.querySelector('[data-cases="filter-status"]');
        if (statusEl) {
            statusEl.addEventListener('change', function () {
                STATE.filters.status = this.value;
                STATE.page = 1;
                render();
            });
        }

        var stepEl = STATE.root.querySelector('[data-cases="filter-step"]');
        if (stepEl) {
            stepEl.addEventListener('change', function () {
                STATE.filters.step = this.value;
                STATE.page = 1;
                render();
            });
        }

        var sortEl = STATE.root.querySelector('[data-cases="sort"]');
        if (sortEl) {
            sortEl.addEventListener('change', function () {
                STATE.sort = this.value;
                render();
                _emit(CaseEvents.SORTED, { sort: STATE.sort });
            });
        }

        // اکشن‌ها
        var actionBtns = STATE.root.querySelectorAll('[data-cases-action]');
        for (var i = 0; i < actionBtns.length; i++) {
            if (actionBtns[i].dataset.bound) continue;
            actionBtns[i].addEventListener('click', _handleAction);
            actionBtns[i].dataset.bound = '1';
        }

        // select-all
        var selectAll = STATE.root.querySelector('[data-cases="select-all"]');
        if (selectAll) {
            selectAll.addEventListener('change', _handleSelectAll);
        }

        // row select
        var rowChecks = STATE.root.querySelectorAll('[data-cases="select-row"]');
        for (var j = 0; j < rowChecks.length; j++) {
            rowChecks[j].addEventListener('change', _handleRowSelect);
        }

        // row action
        var rowBtns = STATE.root.querySelectorAll('[data-cases-row-action]');
        for (var k = 0; k < rowBtns.length; k++) {
            rowBtns[k].addEventListener('click', _handleRowAction);
        }

        // pagination
        var pageBtns = STATE.root.querySelectorAll('[data-cases-page]');
        for (var m = 0; m < pageBtns.length; m++) {
            pageBtns[m].addEventListener('click', _handlePageClick);
        }
    }

    function _handleAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-cases-action');
        if (a === 'refresh') {
            reload();
            _toast('success', 'بروزرسانی شد', 'موفق');
            return;
        }
        if (a === 'toggle-view') {
            STATE.viewMode = STATE.viewMode === 'table' ? 'cards' : 'table';
            render();
            _emit(CaseEvents.VIEW_MODE, { mode: STATE.viewMode });
            return;
        }
        if (a === 'export') {
            exportCSV({ all: true });
            return;
        }
        if (a === 'export-selected') {
            exportCSV({ ids: _getSelectedIds() });
            return;
        }
        if (a === 'clear-selection') {
            clearSelection();
            render();
            return;
        }
        _emit(CaseEvents.ACTION, { action: a, at: Date.now() });
    }

    function _handleSelectAll() {
        var checked = this.checked;
        var list = STATE.filtered;
        var start = (STATE.page - 1) * PAGE_SIZE;
        var end = Math.min(start + PAGE_SIZE, list.length);
        for (var i = start; i < end; i++) {
            if (checked) STATE.selectedIds[list[i].caseId] = true;
            else delete STATE.selectedIds[list[i].caseId];
        }
        render();
        _emit(CaseEvents.SELECT, { count: _getSelectedIds().length });
    }

    function _handleRowSelect(e) {
        e.stopPropagation();
        var container = this.closest('[data-cases-id]');
        if (!container) return;
        var caseId = container.getAttribute('data-cases-id');
        if (!caseId) return;
        if (this.checked) STATE.selectedIds[caseId] = true;
        else delete STATE.selectedIds[caseId];
        render();
        _emit(CaseEvents.SELECT, { count: _getSelectedIds().length });
    }

    function _handleRowAction(e) {
        e.preventDefault();
        e.stopPropagation();
        var action = this.getAttribute('data-cases-row-action');
        var container = this.closest('[data-cases-id]');
        if (!container) return;
        var caseId = container.getAttribute('data-cases-id');

        if (action === 'view') {
            _emit(CaseEvents.ROW_CLICK, { caseId: caseId, action: 'view' });
            _openDetails(caseId);
        }
    }

    function _handlePageClick() {
        var p = parseInt(this.getAttribute('data-cases-page'), 10);
        if (isNaN(p) || p < 1) return;
        STATE.page = p;
        render();
        _emit(CaseEvents.PAGE, { page: p });
    }

    // ─────────────────────────────────────
    // 📂 باز کردن جزئیات
    // ─────────────────────────────────────
    function _openDetails(caseId) {
        // هدایت به صفحه جزئیات در صورت وجود
        if (typeof window !== 'undefined' && window.location) {
            // اگر در صفحه dashboard هستیم، به case-details برویم
            // اگر ماژول case-details لود شده، از modal استفاده کنیم
        }
        // اینجا فقط به case-details.html هدایت می‌کنیم
        window.location.href = 'case-details.html?id=' + encodeURIComponent(caseId);
    }

    // ─────────────────────────────────────
    // 📤 خروجی CSV
    // ─────────────────────────────────────
    function exportCSV(options) {
        options = options || {};
        var list;

        if (options.ids && options.ids.length > 0) {
            list = STATE.cases.filter(function (c) {
                return c && options.ids.indexOf(c.caseId) !== -1;
            });
        } else {
            list = STATE.filtered;
        }

        if (list.length === 0) {
            _toast('warning', 'داده‌ای برای خروجی نیست', 'توجه');
            return { ok: false, reason: 'empty' };
        }

        var headers = ['شناسه', 'متقاضی', 'موبایل', 'بانک', 'مبلغ',
                       'وضعیت', 'مرحله', 'تاریخ ثبت'];
        var rows = [headers];

        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            rows.push([
                c.caseId || '',
                c.applicantName || '',
                c.applicantMobile || '',
                c.bank || '',
                String(c.loanAmount || 0),
                _statusLabel(c.status),
                _stepTitle(c.currentStep),
                _jalali(c.createdAt)
            ]);
        }

        var csv = rows.map(function (row) {
            return row.map(function (cell) {
                var s = String(cell === null || cell === undefined ? '' : cell);
                if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 ||
                    s.indexOf('\n') !== -1) {
                    s = '"' + s.replace(/"/g, '""') + '"';
                }
                return s;
            }).join(',');
        }).join('\n');

        var blob;
        try {
            blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        } catch (e) {
            window.open('data:text/csv;charset=utf-8,' + encodeURIComponent(csv), '_blank');
            return { ok: true, count: list.length };
        }

        var ts = new Date().toISOString().slice(0, 10);
        var filename = 'wampay-cases-' + ts + '.csv';

        if (navigator.msSaveBlob) {
            navigator.msSaveBlob(blob, filename);
        } else {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
                document.body.removeChild(a);
                URL.revokeObjectURL(a.href);
            }, 200);
        }

        _toast('success', _fa(list.length) + ' مورد خروجی گرفته شد', 'موفق');
        return { ok: true, count: list.length };
    }

    function _toast(type, msg, title) {
        if (typeof WamUI === 'undefined') return;
        if (type === 'success' && WamUI.toastSuccess) WamUI.toastSuccess(msg, title || 'موفق');
        else if (type === 'error' && WamUI.toastError) WamUI.toastError(msg, title || 'خطا');
        else if (type === 'warning' && WamUI.toastWarning) WamUI.toastWarning(msg, title || 'توجه');
        else if (type === 'info' && WamUI.toastInfo) WamUI.toastInfo(msg, title || 'اطلاع');
    }

    // ─────────────────────────────────────
    // 🔧 فیلترها
    // ─────────────────────────────────────
    function setFilter(key, value) {
        if (!key) return false;
        STATE.filters[key] = value;
        STATE.page = 1;
        render();
        return true;
    }

    function setFilters(patch) {
        if (!patch) return false;
        for (var k in patch) {
            if (Object.prototype.hasOwnProperty.call(patch, k)) {
                STATE.filters[k] = patch[k];
            }
        }
        STATE.page = 1;
        render();
        return true;
    }

    function resetFilters() {
        STATE.filters = {
            query: '', status: '', bank: '', step: '',
            minAmount: '', maxAmount: '', fromDate: '', toDate: ''
        };
        STATE.page = 1;
        render();
        return true;
    }

    function setSort(key) {
        if (!SORT_OPTIONS[key]) return false;
        STATE.sort = key;
        render();
        return true;
    }

    function setScope(scope) {
        if (scope !== 'auto' && scope !== 'all' && scope !== 'mine' && scope !== 'queue') {
            return false;
        }
        STATE.scope = scope;
        reload();
        return true;
    }

    // ─────────────────────────────────────
    // 🔄 reload
    // ─────────────────────────────────────
    function reload() {
        var all = _loadAllCases();
        STATE.cases = _filterByRole(all, STATE.scope);

        // پاکسازی انتخاب‌های نامعتبر
        var valid = {};
        for (var i = 0; i < STATE.cases.length; i++) {
            if (STATE.selectedIds[STATE.cases[i].caseId]) {
                valid[STATE.cases[i].caseId] = true;
            }
        }
        STATE.selectedIds = valid;

        render();
        _emit(CaseEvents.LOADED, {
            count: STATE.cases.length,
            role: _role(),
            scope: STATE.scope,
            at: Date.now()
        });
        return STATE.cases.length;
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var run = function () {
            var user = _user();
            if (!user) {
                if (typeof WamPayGuard !== 'undefined') {
                    WamPayGuard.redirectToLogin('not_logged_in');
                }
                return;
            }

            STATE.userId = user.id;
            STATE.role = user.role;

            var root = options.root ||
                       document.querySelector('[' + ROOT_ATTR + ']') ||
                       document.querySelector('.wam-cases-shared');
            if (!root) {
                if (options.debug) console.warn('[cases] root پیدا نشد');
                return;
            }
            STATE.root = root;

            // scope
            if (options.scope) STATE.scope = options.scope;
            if (options.viewMode) STATE.viewMode = options.viewMode;
            if (options.pageSize) PAGE_SIZE = options.pageSize;

            STATE.cases = _filterByRole(_loadAllCases(), STATE.scope);
            render();

            STATE.installed = true;
            _emit(CaseEvents.LOADED, {
                count: STATE.cases.length, role: STATE.role,
                scope: STATE.scope, at: Date.now()
            });

            if (options.debug) {
                console.log('[cases] v' + VERSION + ' — نقش: ' +
                    STATE.role + '، ' + STATE.cases.length + ' پرونده');
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
        STATE.cases = [];
        STATE.filtered = [];
        STATE.selectedIds = {};
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
            scope: STATE.scope,
            totalCases: STATE.cases.length,
            filteredCount: STATE.filtered.length,
            selectedCount: _getSelectedIds().length,
            page: STATE.page,
            pageSize: PAGE_SIZE,
            viewMode: STATE.viewMode,
            sort: STATE.sort,
            filters: JSON.parse(JSON.stringify(STATE.filters))
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
    var WamCases = {
        VERSION: VERSION,
        EVENTS: CaseEvents,
        ROOT_ATTR: ROOT_ATTR,
        PAGE_SIZE: PAGE_SIZE,
        STATUS_LABELS: STATUS_LABELS,
        STEP_TITLES: STEP_TITLES,
        PRIORITY_LABELS: PRIORITY_LABELS,
        SORT_OPTIONS: SORT_OPTIONS,
        VIEW_MODES: VIEW_MODES,

        install: install,
        uninstall: uninstall,
        reload: reload,
        render: render,

        // فیلتر
        setFilter: setFilter,
        setFilters: setFilters,
        resetFilters: resetFilters,
        setSort: setSort,
        setScope: setScope,

        // نمایش
        setViewMode: function (mode) {
            if (mode !== 'table' && mode !== 'cards') return false;
            STATE.viewMode = mode;
            render();
            return true;
        },

        // داده
        getCases: function () { return STATE.cases.slice(); },
        getFiltered: function () { return STATE.filtered.slice(); },
        computeStats: computeStats,

        // انتخاب
        selectAll: selectAll,
        clearSelection: clearSelection,
        getSelectedIds: _getSelectedIds,

        // خروجی
        exportCSV: exportCSV,

        // ابزار
        formatStatus: _statusLabel,
        formatStep: _stepTitle,
        formatPriority: _priorityLabel,
        formatAmount: _amt,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamCases = WamCases;
    window.SharedCaseEvents = CaseEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-cases-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-cases-shared')) {
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