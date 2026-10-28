// ==========================================
// وام پی — Shared Modules
// فایل: financial-reports-v2.js
// نسخه: 2.0.0
// تاریخ: 1405/01/15
// کارش: گزارش‌های مالی نسل ۲ — تحلیل، نمودار، مقایسه دوره‌ای
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION   = '2.0.0';
    var ROOT_ATTR = 'data-fin-reports-root';
    var SNAPSHOTS_KEY = 'wamPayFinReportsSnapshots';

    var PERIOD_TYPES = {
        TODAY:      'today',
        YESTERDAY:  'yesterday',
        THIS_WEEK:  'this_week',
        LAST_WEEK:  'last_week',
        THIS_MONTH: 'this_month',
        LAST_MONTH: 'last_month',
        THIS_YEAR:  'this_year',
        LAST_YEAR:  'last_year',
        CUSTOM:     'custom'
    };

    var PERIOD_LABELS = {
        today:      'امروز',
        yesterday:  'دیروز',
        this_week:  'این هفته',
        last_week:  'هفته گذشته',
        this_month: 'این ماه',
        last_month: 'ماه گذشته',
        this_year:  'امسال',
        last_year:  'سال گذشته',
        custom:     'دلخواه'
    };

    var REPORT_TYPES = {
        OVERVIEW:      'overview',
        PAYMENTS:      'payments',
        LOANS:         'loans',
        WALLET:        'wallet',
        COMMISSIONS:   'commissions',
        CONTRACTS:     'contracts',
        COMPARISON:    'comparison'
    };

    var REPORT_LABELS = {
        overview:    '📊 نمای کلی',
        payments:    '💳 پرداخت‌ها',
        loans:       '📝 وام‌ها',
        wallet:      '💼 کیف پول',
        commissions: '💰 پورسانت',
        contracts:   '📋 قراردادها',
        comparison:  '⚖️ مقایسه دوره‌ای'
    };

    var CHART_COLORS = [
        '#105b35', '#d4a62a', '#3498db', '#e67e22',
        '#9b59b6', '#1abc9c', '#e74c3c', '#95a5a6'
    ];

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        role: null,
        userId: null,
        reportType: 'overview',
        periodType: 'this_month',
        customRange: { from: null, to: null },
        range: { from: null, to: null },
        data: null,          // داده گزارش فعلی
        prevData: null,      // داده دوره قبل (برای مقایسه)
        snapshots: [],
        loading: false,
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var ReportEvents = {
        READY:           'finreport.ready',
        RENDERED:        'finreport.rendered',
        GENERATED:       'finreport.generated',
        PERIOD_CHANGED:  'finreport.period_changed',
        REPORT_CHANGED:  'finreport.report_changed',
        SNAPSHOT_SAVED:  'finreport.snapshot_saved',
        SNAPSHOT_LOADED: 'finreport.snapshot_loaded',
        SNAPSHOT_DELETED:'finreport.snapshot_deleted',
        EXPORTED:        'finreport.exported',
        REFRESHED:       'finreport.refreshed'
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
        var sign = x < 0 ? '−' : '';
        x = Math.abs(x);
        var f = Math.round(x).toLocaleString('en-US');
        return sign + f.replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _pct(n) {
        if (n === null || n === undefined) return '—';
        var x = Number(n);
        if (isNaN(x)) return '—';
        return _fa(Math.round(x * 10) / 10) + '٪';
    }

    function _en(s) {
        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.toEnglishDigits) {
            return WamPersianDate.toEnglishDigits(s);
        }
        return String(s || '').replace(/[۰-۹]/g, function (d) {
            return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
        });
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

    function _jalaliFull(ts) {
        if (!ts) return '—';
        try {
            if (typeof WamPersianDate !== 'undefined') {
                var d = new Date(ts);
                var j = WamPersianDate.dateToJalali(d);
                if (j) return WamPersianDate.format(j.jy, j.jm, j.jd, 'YYYY/MM/DD HH:mm');
            }
        } catch (e) { /* بی‌صدا */ }
        return new Date(ts).toLocaleString('fa-IR');
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

    function _genId(prefix) {
        var r = Math.random().toString(36).slice(2, 8);
        return (prefix || 'snap') + '_' + Date.now().toString(36) + '_' + r;
    }

    function _toast(type, msg, title) {
        if (typeof WamUI === 'undefined') return;
        if (type === 'success' && WamUI.toastSuccess) WamUI.toastSuccess(msg, title || 'موفق');
        else if (type === 'error' && WamUI.toastError) WamUI.toastError(msg, title || 'خطا');
        else if (type === 'warning' && WamUI.toastWarning) WamUI.toastWarning(msg, title || 'توجه');
        else if (type === 'info' && WamUI.toastInfo) WamUI.toastInfo(msg, title || 'اطلاع');
    }

    // ─────────────────────────────────────
    // 🎯 محاسبه بازه (range)
    // ─────────────────────────────────────
    function _dayStart(ts) {
        var d = new Date(ts || Date.now());
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }

    function _dayEnd(ts) {
        var d = new Date(ts || Date.now());
        d.setHours(23, 59, 59, 999);
        return d.getTime();
    }

    function _computeRange(periodType, custom) {
        var now = Date.now();
        var today = _dayStart(now);
        var range = { from: today, to: _dayEnd(now) };

        if (periodType === 'today') {
            range = { from: today, to: _dayEnd(now) };
        } else if (periodType === 'yesterday') {
            var y = today - 24 * 60 * 60 * 1000;
            range = { from: y, to: y + 24 * 60 * 60 * 1000 - 1 };
        } else if (periodType === 'this_week') {
            // شنبه = شروع هفته
            var d = new Date();
            var day = d.getDay(); // 0=Sun..6=Sat
            var sinceSat = (day + 1) % 7; // Sat=0
            var start = today - sinceSat * 24 * 60 * 60 * 1000;
            range = { from: start, to: _dayEnd(now) };
        } else if (periodType === 'last_week') {
            var dw = new Date();
            var dayw = dw.getDay();
            var sinceSat2 = (dayw + 1) % 7;
            var startOfThis = today - sinceSat2 * 24 * 60 * 60 * 1000;
            var startLast = startOfThis - 7 * 24 * 60 * 60 * 1000;
            range = { from: startLast, to: startOfThis - 1 };
        } else if (periodType === 'this_month') {
            try {
                if (typeof WamPersianDate !== 'undefined') {
                    var todayJ = WamPersianDate.todayJalali();
                    var firstDay = WamPersianDate.jalaliToDate(todayJ.jy, todayJ.jm, 1);
                    range = { from: _dayStart(firstDay.getTime()), to: _dayEnd(now) };
                }
            } catch (e) { /* بی‌صدا */ }
        } else if (periodType === 'last_month') {
            try {
                if (typeof WamPersianDate !== 'undefined') {
                    var tj = WamPersianDate.todayJalali();
                    var lm = tj.jm - 1;
                    var ly = tj.jy;
                    if (lm < 1) { lm = 12; ly = ly - 1; }
                    var firstLM = WamPersianDate.jalaliToDate(ly, lm, 1);
                    var daysLM = WamPersianDate.daysInMonth(ly, lm);
                    var lastLM = WamPersianDate.jalaliToDate(ly, lm, daysLM);
                    range = {
                        from: _dayStart(firstLM.getTime()),
                        to: _dayEnd(lastLM.getTime())
                    };
                }
            } catch (e) { /* بی‌صدا */ }
        } else if (periodType === 'this_year') {
            try {
                if (typeof WamPersianDate !== 'undefined') {
                    var tjy = WamPersianDate.todayJalali();
                    var firstY = WamPersianDate.jalaliToDate(tjy.jy, 1, 1);
                    range = { from: _dayStart(firstY.getTime()), to: _dayEnd(now) };
                }
            } catch (e) { /* بی‌صدا */ }
        } else if (periodType === 'last_year') {
            try {
                if (typeof WamPersianDate !== 'undefined') {
                    var tjy2 = WamPersianDate.todayJalali();
                    var ly2 = tjy2.jy - 1;
                    var firstY2 = WamPersianDate.jalaliToDate(ly2, 1, 1);
                    var lastDay = WamPersianDate.isLeapYear(ly2) ? 30 : 29;
                    var lastY2 = WamPersianDate.jalaliToDate(ly2, 12, lastDay);
                    range = {
                        from: _dayStart(firstY2.getTime()),
                        to: _dayEnd(lastY2.getTime())
                    };
                }
            } catch (e) { /* بی‌صدا */ }
        } else if (periodType === 'custom' && custom) {
            range = {
                from: custom.from ? _dayStart(custom.from) : today,
                to: custom.to ? _dayEnd(custom.to) : _dayEnd(now)
            };
        }

        return range;
    }

    function _prevRange(range) {
        var dur = range.to - range.from;
        return {
            from: range.from - dur - 1,
            to: range.to - dur - 1
        };
    }

    function _inRange(ts, range) {
        if (!ts || !range) return false;
        return ts >= range.from && ts <= range.to;
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری داده‌ها از ماژول‌ها
    // ─────────────────────────────────────
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

    function _loadWallets() {
        if (typeof Storage === 'undefined') return {};
        return Storage.getJSON('wamPayWallets', {}) || {};
    }

    function _loadContracts() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON('wamPayContracts', []);
        return Array.isArray(arr) ? arr : [];
    }

    function _loadCases() {
        if (typeof CaseRepository === 'undefined') return [];
        try { return CaseRepository.getAll() || []; }
        catch (e) { return []; }
    }

    // ─────────────────────────────────────
    // 🧮 محاسبه گزارش
    // ─────────────────────────────────────
    function _computeReport(type, range) {
        var report = {
            type: type,
            range: { from: range.from, to: range.to },
            generatedAt: Date.now(),
            payments: null,
            loans: null,
            wallet: null,
            commissions: null,
            contracts: null,
            overview: null
        };

        if (type === 'payments' || type === 'overview') {
            report.payments = _computePayments(range);
        }
        if (type === 'loans' || type === 'overview') {
            report.loans = _computeLoans(range);
        }
        if (type === 'wallet' || type === 'overview') {
            report.wallet = _computeWallet(range);
        }
        if (type === 'commissions' || type === 'overview') {
            report.commissions = _computeCommissions(range);
        }
        if (type === 'contracts' || type === 'overview') {
            report.contracts = _computeContracts(range);
        }
        if (type === 'overview') {
            report.overview = _computeOverview(report);
        }

        return report;
    }

    // ─── Payments ───
    function _computePayments(range) {
        var all = _loadPayments();
        var filtered = [];
        var total = 0;
        var confirmed = 0;
        var pending = 0;
        var rejected = 0;
        var byMethod = {};
        var byType = {};

        for (var i = 0; i < all.length; i++) {
            var p = all[i];
            if (!p || !_inRange(p.createdAt, range)) continue;
            filtered.push(p);

            var amt = Number(p.amount) || 0;
            total += amt;
            var st = p.status || 'pending';
            if (st === 'confirmed') confirmed += amt;
            else if (st === 'pending') pending += amt;
            else if (st === 'rejected') rejected += amt;

            var m = p.method || 'unknown';
            byMethod[m] = (byMethod[m] || 0) + amt;

            var t = p.type || 'other';
            byType[t] = (byType[t] || 0) + amt;
        }

        return {
            count: filtered.length,
            totalAmount: total,
            confirmedAmount: confirmed,
            pendingAmount: pending,
            rejectedAmount: rejected,
            byMethod: byMethod,
            byType: byType,
            items: filtered
        };
    }

    // ─── Loans ───
    function _computeLoans(range) {
        var all = _loadLoans();
        var created = [];
        var totalPrincipal = 0;
        var totalRemaining = 0;
        var totalPaid = 0;

        for (var i = 0; i < all.length; i++) {
            var l = all[i];
            if (!l) continue;
            if (!_inRange(l.createdAt, range)) continue;
            created.push(l);

            totalPrincipal += Number(l.principal) || 0;
            if (typeof WamLoanRegister !== 'undefined') {
                try {
                    totalRemaining += WamLoanRegister.computeRemaining(l) || 0;
                    totalPaid += WamLoanRegister.computePaidAmount(l) || 0;
                } catch (e) { /* بی‌صدا */ }
            }
        }

        return {
            count: created.length,
            totalPrincipal: totalPrincipal,
            totalRemaining: totalRemaining,
            totalPaid: totalPaid,
            items: created
        };
    }

    // ─── Wallet ───
    function _computeWallet(range) {
        var all = _loadWallets();
        var totalBalance = 0;
        var totalEarned = 0;
        var totalWithdrawn = 0;
        var totalDeposited = 0;
        var txCount = 0;
        var inRange = 0;
        var outRange = 0;
        var owners = 0;

        for (var key in all) {
            if (!Object.prototype.hasOwnProperty.call(all, key)) continue;
            var w = all[key];
            if (!w) continue;
            owners++;

            totalBalance += Number(w.balance) || 0;
            totalEarned += Number(w.totalEarned) || 0;
            totalWithdrawn += Number(w.totalWithdrawn) || 0;
            totalDeposited += Number(w.totalDeposited) || 0;

            var txs = Array.isArray(w.transactions) ? w.transactions : [];
            for (var i = 0; i < txs.length; i++) {
                var tx = txs[i];
                if (!tx) continue;
                txCount++;
                if (_inRange(tx.at, range)) {
                    var ty = tx.type;
                    if (ty === 'deposit' || ty === 'commission' || ty === 'refund') {
                        inRange += Number(tx.amount) || 0;
                    } else if (ty === 'withdraw' || ty === 'penalty') {
                        outRange += Number(tx.amount) || 0;
                    }
                }
            }
        }

        return {
            ownerCount: owners,
            totalBalance: totalBalance,
            totalEarned: totalEarned,
            totalWithdrawn: totalWithdrawn,
            totalDeposited: totalDeposited,
            txCount: txCount,
            inflow: inRange,
            outflow: outRange,
            netFlow: inRange - outRange
        };
    }

    // ─── Commissions ───
    function _computeCommissions(range) {
        var payments = _loadPayments();
        var total = 0;
        var count = 0;
        var byBroker = {};

        for (var i = 0; i < payments.length; i++) {
            var p = payments[i];
            if (!p) continue;
            if (p.type !== 'deposit') continue;   // پورسانت = deposit به کیف پول
            if (p.status !== 'confirmed') continue;
            if (!_inRange(p.confirmedAt || p.createdAt, range)) continue;

            var amt = Number(p.amount) || 0;
            total += amt;
            count++;

            var bid = p.brokerId || 'unknown';
            if (!byBroker[bid]) {
                byBroker[bid] = { brokerId: bid, brokerName: p.brokerName, total: 0, count: 0 };
            }
            byBroker[bid].total += amt;
            byBroker[bid].count++;
        }

        // اگر WamPricing در دسترس بود، محاسبه‌ی alternative
        var pricingTotal = 0;
        if (typeof WamPricing !== 'undefined' && WamPricing.calculateBatch) {
            // ثبت نشده — فقط برای مقایسه
        }

        return {
            count: count,
            totalAmount: total,
            byBroker: byBroker,
            pricingTotal: pricingTotal
        };
    }

    // ─── Contracts ───
    function _computeContracts(range) {
        var all = _loadContracts();
        var created = [];
        var totalAmount = 0;
        var signed = 0;
        var finalized = 0;

        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (!c) continue;
            if (!_inRange(c.createdAt, range)) continue;
            created.push(c);
            totalAmount += Number(c.loanAmount) || 0;
            if (c.status === 'signed') signed++;
            else if (c.status === 'finalized') finalized++;
        }

        return {
            count: created.length,
            totalAmount: totalAmount,
            signedCount: signed,
            finalizedCount: finalized,
            items: created
        };
    }

    // ─── Overview ───
    function _computeOverview(report) {
        var ov = {
            totalPayments: 0,
            totalLoans: 0,
            totalWallet: 0,
            totalContracts: 0,
            healthScore: 0
        };

        if (report.payments) {
            ov.totalPayments = report.payments.confirmedAmount || 0;
        }
        if (report.loans) {
            ov.totalLoans = report.loans.totalPrincipal || 0;
        }
        if (report.wallet) {
            ov.totalWallet = report.wallet.totalBalance || 0;
        }
        if (report.contracts) {
            ov.totalContracts = report.contracts.totalAmount || 0;
        }

        // امتیاز سلامت مالی (0-100)
        var score = 0;
        var items = 0;
        if (report.payments && report.payments.count > 0) {
            var ratio = report.payments.confirmedAmount /
                Math.max(1, report.payments.totalAmount);
            score += ratio * 100;
            items++;
        }
        if (report.loans && report.loans.totalPrincipal > 0) {
            var ratio2 = report.loans.totalPaid /
                Math.max(1, report.loans.totalPrincipal);
            score += Math.min(100, ratio2 * 100);
            items++;
        }
        if (report.contracts && report.contracts.count > 0) {
            var ratio3 = (report.contracts.finalizedCount +
                report.contracts.signedCount) /
                Math.max(1, report.contracts.count);
            score += ratio3 * 100;
            items++;
        }

        ov.healthScore = items > 0 ? Math.round(score / items) : 0;
        return ov;
    }

    // ─────────────────────────────────────
    // 📊 مقایسه دوره‌ای
    // ─────────────────────────────────────
    function _computeComparison(current, prev) {
        var result = {
            current: current,
            previous: prev,
            diffs: {}
        };

        if (current && current.overview) {
            var cv = current.overview;
            var pv = (prev && prev.overview) ? prev.overview : {
                totalPayments: 0, totalLoans: 0,
                totalWallet: 0, totalContracts: 0, healthScore: 0
            };

            result.diffs = {
                payments: _diffPercent(cv.totalPayments, pv.totalPayments),
                loans: _diffPercent(cv.totalLoans, pv.totalLoans),
                wallet: _diffPercent(cv.totalWallet, pv.totalWallet),
                contracts: _diffPercent(cv.totalContracts, pv.totalContracts),
                health: cv.healthScore - pv.healthScore
            };
        }

        return result;
    }

    function _diffPercent(current, prev) {
        if (prev === 0 && current === 0) return 0;
        if (prev === 0) return 100;
        return ((current - prev) / prev) * 100;
    }

    // ─────────────────────────────────────
    // 🎯 تولید گزارش
    // ─────────────────────────────────────
    function generate(options) {
        options = options || {};
        STATE.loading = true;

        if (options.reportType) STATE.reportType = options.reportType;
        if (options.periodType) {
            STATE.periodType = options.periodType;
            STATE.range = _computeRange(STATE.periodType, STATE.customRange);
        } else if (!STATE.range.from) {
            STATE.range = _computeRange(STATE.periodType, STATE.customRange);
        }

        var type = STATE.reportType;
        STATE.data = _computeReport(type, STATE.range);

        // اگر مقایسه‌ای، دوره‌ی قبل رو هم بگیر
        if (type === 'comparison' || options.withComparison) {
            var prevRange = _prevRange(STATE.range);
            STATE.prevData = _computeReport('overview', prevRange);
        }

        STATE.loading = false;

        _emit(ReportEvents.GENERATED, {
            type: type,
            range: STATE.range,
            at: Date.now()
        });

        return STATE.data;
    }

    // ─────────────────────────────────────
    // 💾 Snapshots
    // ─────────────────────────────────────
    function _loadSnapshots() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(SNAPSHOTS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveSnapshots(list) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(SNAPSHOTS_KEY, list);
    }

    function saveSnapshot(name) {
        if (!STATE.data) {
            return { ok: false, reason: 'no_data' };
        }
        if (!name || String(name).trim().length < 2) {
            return { ok: false, reason: 'no_name' };
        }

        var user = _user();
        var snap = {
            id: _genId('snap'),
            name: String(name).trim(),
            type: STATE.reportType,
            period: STATE.periodType,
            range: JSON.parse(JSON.stringify(STATE.range)),
            data: JSON.parse(JSON.stringify(STATE.data)),
            createdBy: user ? user.id : null,
            createdByName: user ? (user.name || user.username) : null,
            createdAt: Date.now()
        };

        var all = _loadSnapshots();
        all.push(snap);
        // حداکثر ۵۰ snapshot
        if (all.length > 50) all = all.slice(-50);

        if (!_saveSnapshots(all)) {
            return { ok: false, reason: 'storage_error' };
        }

        STATE.snapshots = all;
        _emit(ReportEvents.SNAPSHOT_SAVED, { snapshot: snap });
        return { ok: true, snapshot: snap };
    }

    function loadSnapshot(id) {
        var all = _loadSnapshots();
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].id === id) {
                STATE.data = all[i].data;
                STATE.reportType = all[i].type;
                STATE.periodType = all[i].period;
                STATE.range = all[i].range;
                _emit(ReportEvents.SNAPSHOT_LOADED, { snapshot: all[i] });
                return { ok: true, snapshot: all[i] };
            }
        }
        return { ok: false, reason: 'not_found' };
    }

    function deleteSnapshot(id) {
        var all = _loadSnapshots();
        var idx = -1;
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].id === id) { idx = i; break; }
        }
        if (idx === -1) return { ok: false, reason: 'not_found' };

        var removed = all.splice(idx, 1)[0];
        if (!_saveSnapshots(all)) {
            all.splice(idx, 0, removed);
            return { ok: false, reason: 'storage_error' };
        }

        STATE.snapshots = all;
        _emit(ReportEvents.SNAPSHOT_DELETED, { snapshotId: id });
        return { ok: true };
    }

    function getSnapshots() {
        return _loadSnapshots();
    }

    // ─────────────────────────────────────
    // 📤 خروجی CSV
    // ─────────────────────────────────────
    function exportCSV() {
        var d = STATE.data;
        if (!d) {
            _toast('warning', 'ابتدا گزارش بگیرید', 'توجه');
            return { ok: false, reason: 'no_data' };
        }

        var rows = [];
        rows.push(['گزارش مالی وام پی']);
        rows.push(['نوع گزارش:', REPORT_LABELS[STATE.reportType] || STATE.reportType]);
        rows.push(['بازه:', _jalali(d.range.from) + ' تا ' + _jalali(d.range.to)]);
        rows.push(['تاریخ تولید:', _jalaliFull(d.generatedAt)]);
        rows.push([]);

        if (d.overview) {
            rows.push(['— نمای کلی —']);
            rows.push(['کل پرداخت‌های تأییدشده', d.overview.totalPayments]);
            rows.push(['کل وام‌های صادرشده', d.overview.totalLoans]);
            rows.push(['موجودی کل کیف پول‌ها', d.overview.totalWallet]);
            rows.push(['کل قراردادها', d.overview.totalContracts]);
            rows.push(['امتیاز سلامت', d.overview.healthScore]);
            rows.push([]);
        }
        if (d.payments) {
            rows.push(['— پرداخت‌ها —']);
            rows.push(['تعداد', d.payments.count]);
            rows.push(['کل', d.payments.totalAmount]);
            rows.push(['تأییدشده', d.payments.confirmedAmount]);
            rows.push(['در انتظار', d.payments.pendingAmount]);
            rows.push(['رد شده', d.payments.rejectedAmount]);
            rows.push([]);
        }
        if (d.loans) {
            rows.push(['— وام‌ها —']);
            rows.push(['تعداد', d.loans.count]);
            rows.push(['کل اصل', d.loans.totalPrincipal]);
            rows.push(['پرداخت‌شده', d.loans.totalPaid]);
            rows.push(['مانده', d.loans.totalRemaining]);
            rows.push([]);
        }
        if (d.wallet) {
            rows.push(['— کیف پول —']);
            rows.push(['موجودی کل', d.wallet.totalBalance]);
            rows.push(['واریز در بازه', d.wallet.inflow]);
            rows.push(['برداشت در بازه', d.wallet.outflow]);
            rows.push(['جریان خالص', d.wallet.netFlow]);
            rows.push([]);
        }
        if (d.contracts) {
            rows.push(['— قراردادها —']);
            rows.push(['تعداد', d.contracts.count]);
            rows.push(['کل مبلغ', d.contracts.totalAmount]);
            rows.push(['امضا شده', d.contracts.signedCount]);
            rows.push(['نهایی', d.contracts.finalizedCount]);
            rows.push([]);
        }

        var csv = rows.map(function (row) {
            return row.map(function (cell) {
                var s = String(cell === null || cell === undefined ? '' : cell);
                if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1) {
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
            _emit(ReportEvents.EXPORTED, { at: Date.now() });
            return { ok: true };
        }

        var ts = new Date().toISOString().slice(0, 10);
        var filename = 'wampay-report-' + STATE.reportType + '-' + ts + '.csv';

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

        _emit(ReportEvents.EXPORTED, { at: Date.now() });
        _toast('success', 'خروجی CSV آماده شد', 'موفق');
        return { ok: true };
    }

    // ─────────────────────────────────────
    // 📊 نمودار میله‌ای CSS
    // ─────────────────────────────────────
    function _renderBarChart(data, labels, colors) {
        if (!data || data.length === 0) return '';
        var max = 0;
        for (var i = 0; i < data.length; i++) {
            if (data[i] > max) max = data[i];
        }
        if (max === 0) max = 1;

        var html = '<div class="wam-fr__chart">';
        for (var j = 0; j < data.length; j++) {
            var pct = (data[j] / max) * 100;
            var color = colors && colors[j] ? colors[j] : CHART_COLORS[j % CHART_COLORS.length];
            html += '<div class="wam-fr__chart-row">' +
                '<div class="wam-fr__chart-label">' + _esc(labels[j]) + '</div>' +
                '<div class="wam-fr__chart-bar-wrap">' +
                '<div class="wam-fr__chart-bar" style="width:' + pct +
                '%;background:' + color + '"></div>' +
                '</div>' +
                '<div class="wam-fr__chart-value">' + _amt(data[j]) + '</div>' +
                '</div>';
        }
        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نوار ابزار
    // ─────────────────────────────────────
    function _renderToolbar() {
        var html = '<div class="wam-fr__toolbar">';

        // انتخاب نوع گزارش
        html += '<div class="wam-fr__tabs">';
        for (var rt in REPORT_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(REPORT_LABELS, rt)) continue;
            html += '<button type="button" class="wam-fr__tab' +
                (STATE.reportType === rt ? ' is-active' : '') + '" ' +
                'data-fr-action="set-report" data-report="' + rt + '">' +
                REPORT_LABELS[rt] + '</button>';
        }
        html += '</div>';

        // انتخاب بازه
        html += '<div class="wam-fr__filters">';
        html += '<label>بازه:</label>';
        html += '<select data-fr="period">';
        for (var pt in PERIOD_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(PERIOD_LABELS, pt)) continue;
            html += '<option value="' + pt + '"' +
                (STATE.periodType === pt ? ' selected' : '') + '>' +
                PERIOD_LABELS[pt] + '</option>';
        }
        html += '</select>';

        if (STATE.periodType === 'custom') {
            html += '<input type="text" data-fr="from" data-persian-date ' +
                    'placeholder="از تاریخ" value="' +
                    (STATE.customRange.from ?
                        _jalali(STATE.customRange.from) : '') + '">';
            html += '<input type="text" data-fr="to" data-persian-date ' +
                    'placeholder="تا تاریخ" value="' +
                    (STATE.customRange.to ?
                        _jalali(STATE.customRange.to) : '') + '">';
        }

        html += '<button type="button" class="wam-btn wam-btn--sm wam-btn--primary" ' +
                'data-fr-action="generate">🔄 تولید گزارش</button>';
        html += '<button type="button" class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                'data-fr-action="export">📤 CSV</button>';
        html += '<button type="button" class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                'data-fr-action="save-snapshot">💾 ذخیره</button>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — هدر بازه
    // ─────────────────────────────────────
    function _renderRangeHeader() {
        if (!STATE.range.from) return '';
        return '<div class="wam-fr__range-header">' +
            '<span>📅 از <strong>' + _esc(_jalali(STATE.range.from)) + '</strong></span>' +
            '<span>تا <strong>' + _esc(_jalali(STATE.range.to)) + '</strong></span>' +
            '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نمای کلی
    // ─────────────────────────────────────
    function _renderOverview() {
        var d = STATE.data;
        if (!d || !d.overview) return '';

        var ov = d.overview;
        var html = '<div class="wam-fr__summary">' +
            _summaryCard('💳 پرداخت‌های تأییدشده', ov.totalPayments, 'success') +
            _summaryCard('📝 وام‌های صادرشده', ov.totalLoans, 'primary') +
            _summaryCard('💼 موجودی کیف پول‌ها', ov.totalWallet, 'info') +
            _summaryCard('📋 کل قراردادها', ov.totalContracts, 'warning') +
            '</div>';

        // امتیاز سلامت
        var scoreColor = ov.healthScore >= 75 ? 'success' :
                         ov.healthScore >= 50 ? 'warning' : 'danger';
        html += '<div class="wam-fr__health">' +
            '<div class="wam-fr__health-label">امتیاز سلامت مالی</div>' +
            '<div class="wam-fr__health-value wam-' + scoreColor + '">' +
            _fa(ov.healthScore) + ' / ۱۰۰</div>' +
            '<div class="wam-fr__health-bar">' +
            '<div class="wam-fr__health-fill" style="width:' +
            ov.healthScore + '%"></div></div>' +
            '</div>';

        // کارت‌های خلاصه فرعی
        if (d.payments) {
            html += '<section class="wam-fr__section">' +
                '<h3>💳 پرداخت‌ها</h3>' +
                _kv('تعداد', _fa(d.payments.count)) +
                _kv('کل', _amt(d.payments.totalAmount) + ' ریال') +
                _kv('تأییدشده', _amt(d.payments.confirmedAmount) + ' ریال') +
                _kv('در انتظار', _amt(d.payments.pendingAmount) + ' ریال') +
                '</section>';
        }
        if (d.loans) {
            html += '<section class="wam-fr__section">' +
                '<h3>📝 وام‌ها</h3>' +
                _kv('تعداد', _fa(d.loans.count)) +
                _kv('کل اصل', _amt(d.loans.totalPrincipal) + ' ریال') +
                _kv('پرداخت‌شده', _amt(d.loans.totalPaid) + ' ریال') +
                _kv('مانده', _amt(d.loans.totalRemaining) + ' ریال') +
                '</section>';
        }
        if (d.wallet) {
            html += '<section class="wam-fr__section">' +
                '<h3>💼 کیف پول</h3>' +
                _kv('موجودی کل', _amt(d.wallet.totalBalance) + ' ریال') +
                _kv('واریز در بازه', _amt(d.wallet.inflow) + ' ریال') +
                _kv('برداشت در بازه', _amt(d.wallet.outflow) + ' ریال') +
                _kv('جریان خالص', _amt(d.wallet.netFlow) + ' ریال') +
                '</section>';
        }

        return html;
    }

    function _summaryCard(label, value, accent) {
        return '<div class="wam-fr__summary-card wam-fr__summary-card--' +
            accent + '">' +
            '<div class="wam-fr__summary-label">' + _esc(label) + '</div>' +
            '<div class="wam-fr__summary-value">' + _amt(value) + '</div>' +
            '</div>';
    }

    function _kv(key, value) {
        return '<div class="wam-fr__kv">' +
            '<span class="wam-fr__kv-key">' + _esc(key) + ':</span>' +
            '<span class="wam-fr__kv-value">' + _esc(value) + '</span>' +
            '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — پرداخت‌ها
    // ─────────────────────────────────────
    function _renderPayments() {
        var d = STATE.data;
        if (!d || !d.payments) return '';
        var p = d.payments;

        var html = '<div class="wam-fr__summary">' +
            _summaryCard('تعداد پرداخت', p.count, 'primary') +
            _summaryCard('کل مبلغ', p.totalAmount, 'info') +
            _summaryCard('تأییدشده', p.confirmedAmount, 'success') +
            _summaryCard('در انتظار', p.pendingAmount, 'warning') +
            '</div>';

        // نمودار روش‌ها
        var methodKeys = Object.keys(p.byMethod);
        if (methodKeys.length > 0) {
            var mData = [];
            var mLabels = [];
            for (var i = 0; i < methodKeys.length; i++) {
                mLabels.push((typeof WamPayments !== 'undefined' &&
                    WamPayments.formatMethod)
                    ? WamPayments.formatMethod(methodKeys[i])
                    : methodKeys[i]);
                mData.push(p.byMethod[methodKeys[i]]);
            }
            html += '<section class="wam-fr__section">' +
                '<h3>به تفکیک روش پرداخت</h3>' +
                _renderBarChart(mData, mLabels) +
                '</section>';
        }

        // نمودار انواع
        var typeKeys = Object.keys(p.byType);
        if (typeKeys.length > 0) {
            var tData = [];
            var tLabels = [];
            for (var j = 0; j < typeKeys.length; j++) {
                tLabels.push((typeof WamPayments !== 'undefined' &&
                    WamPayments.formatType)
                    ? WamPayments.formatType(typeKeys[j])
                    : typeKeys[j]);
                tData.push(p.byType[typeKeys[j]]);
            }
            html += '<section class="wam-fr__section">' +
                '<h3>به تفکیک نوع پرداخت</h3>' +
                _renderBarChart(tData, tLabels) +
                '</section>';
        }

        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — وام‌ها
    // ─────────────────────────────────────
    function _renderLoans() {
        var d = STATE.data;
        if (!d || !d.loans) return '';
        var l = d.loans;

        var html = '<div class="wam-fr__summary">' +
            _summaryCard('تعداد وام', l.count, 'primary') +
            _summaryCard('کل اصل', l.totalPrincipal, 'info') +
            _summaryCard('پرداخت‌شده', l.totalPaid, 'success') +
            _summaryCard('مانده', l.totalRemaining, 'warning') +
            '</div>';

        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کیف پول
    // ─────────────────────────────────────
    function _renderWallet() {
        var d = STATE.data;
        if (!d || !d.wallet) return '';
        var w = d.wallet;

        var html = '<div class="wam-fr__summary">' +
            _summaryCard('تعداد مالکان', w.ownerCount, 'primary') +
            _summaryCard('موجودی کل', w.totalBalance, 'info') +
            _summaryCard('واریز بازه', w.inflow, 'success') +
            _summaryCard('برداشت بازه', w.outflow, 'warning') +
            '</div>';

        // نمودار ورودی/خروجی
        var data = [w.inflow, w.outflow, Math.abs(w.netFlow)];
        var labels = ['واریز', 'برداشت', 'جریان خالص'];
        html += '<section class="wam-fr__section">' +
            '<h3>جریان نقدی</h3>' +
            _renderBarChart(data, labels) +
            '</section>';

        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — پورسانت‌ها
    // ─────────────────────────────────────
    function _renderCommissions() {
        var d = STATE.data;
        if (!d || !d.commissions) return '';
        var c = d.commissions;

        var html = '<div class="wam-fr__summary">' +
            _summaryCard('تعداد', c.count, 'primary') +
            _summaryCard('کل پورسانت', c.totalAmount, 'success') +
            '</div>';

        // جدول کارگزاران
        var byBroker = c.byBroker || {};
        var keys = Object.keys(byBroker);
        if (keys.length > 0) {
            html += '<section class="wam-fr__section">' +
                '<h3>به تفکیک کارگزار</h3>' +
                '<table class="wam-fr__table">' +
                '<thead><tr><th>کارگزار</th><th>تعداد</th><th>مبلغ</th></tr></thead>' +
                '<tbody>';
            for (var i = 0; i < keys.length; i++) {
                var b = byBroker[keys[i]];
                html += '<tr>' +
                    '<td>' + _esc(b.brokerName || b.brokerId) + '</td>' +
                    '<td>' + _fa(b.count) + '</td>' +
                    '<td>' + _amt(b.total) + ' ریال</td>' +
                    '</tr>';
            }
            html += '</tbody></table></section>';
        }

        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — قراردادها
    // ─────────────────────────────────────
    function _renderContracts() {
        var d = STATE.data;
        if (!d || !d.contracts) return '';
        var c = d.contracts;

        return '<div class="wam-fr__summary">' +
            _summaryCard('تعداد', c.count, 'primary') +
            _summaryCard('کل مبلغ', c.totalAmount, 'info') +
            _summaryCard('امضا شده', c.signedCount, 'success') +
            _summaryCard('نهایی', c.finalizedCount, 'success') +
            '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — مقایسه
    // ─────────────────────────────────────
    function _renderComparison() {
        var comp = _computeComparison(STATE.data, STATE.prevData);
        var diffs = comp.diffs;

        var html = '<div class="wam-fr__comparison">';
        html += _comparisonRow('پرداخت‌ها', diffs.payments);
        html += _comparisonRow('وام‌ها', diffs.loans);
        html += _comparisonRow('کیف پول', diffs.wallet);
        html += _comparisonRow('قراردادها', diffs.contracts);
        html += _comparisonRow('امتیاز سلامت', diffs.health, true);
        html += '</div>';
        return html;
    }

    function _comparisonRow(label, diff, isScore) {
        var cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
        var arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '■';
        var display = isScore
            ? (diff > 0 ? '+' + _fa(diff) : _fa(diff))
            : _pct(diff);
        return '<div class="wam-fr__comp-row is-' + cls + '">' +
            '<span class="wam-fr__comp-label">' + _esc(label) + '</span>' +
            '<span class="wam-fr__comp-value">' + arrow + ' ' +
            _esc(display) + '</span></div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — Snapshots
    // ─────────────────────────────────────
    function _renderSnapshots() {
        var snaps = getSnapshots();
        if (snaps.length === 0) return '';

        var html = '<section class="wam-fr__section">' +
            '<h3>💾 گزارش‌های ذخیره‌شده</h3>' +
            '<ul class="wam-fr__snapshots">';

        for (var i = snaps.length - 1; i >= 0; i--) {
            var s = snaps[i];
            html += '<li class="wam-fr__snapshot" data-snap-id="' +
                _esc(s.id) + '">' +
                '<div class="wam-fr__snapshot-info">' +
                '<div class="wam-fr__snapshot-name">' + _esc(s.name) + '</div>' +
                '<div class="wam-fr__snapshot-meta">' +
                _esc(REPORT_LABELS[s.type] || s.type) + ' · ' +
                _esc(_jalali(s.createdAt)) +
                '</div></div>' +
                '<div class="wam-fr__snapshot-actions">' +
                '<button class="wam-btn wam-btn--sm" ' +
                'data-fr-action="load-snap" data-id="' + _esc(s.id) +
                '">بازیابی</button>' +
                '<button class="wam-btn-icon wam-btn-icon--danger" ' +
                'data-fr-action="delete-snap" data-id="' + _esc(s.id) +
                '">🗑️</button>' +
                '</div></li>';
        }

        html += '</ul></section>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function _renderBody() {
        if (!STATE.data) {
            return '<div class="wam-empty">' +
                'برای مشاهده گزارش، دکمه «تولید گزارش» را بزنید.</div>';
        }

        var type = STATE.reportType;
        if (type === 'overview')      return _renderOverview();
        if (type === 'payments')      return _renderPayments();
        if (type === 'loans')         return _renderLoans();
        if (type === 'wallet')        return _renderWallet();
        if (type === 'commissions')   return _renderCommissions();
        if (type === 'contracts')     return _renderContracts();
        if (type === 'comparison')    return _renderComparison();
        return '';
    }

    function render() {
        if (!STATE.root) return;

        var html = '<div class="wam-fr">' +
            '<div class="wam-fr__header">' +
            '<h3>📊 گزارش‌های مالی</h3>' +
            '<p class="wam-fr__desc">' +
            'تحلیل جامع مالی وام پی</p>' +
            '</div>' +
            _renderToolbar() +
            _renderRangeHeader() +
            '<div class="wam-fr__body">' + _renderBody() + '</div>' +
            _renderSnapshots() +
            '</div>';

        STATE.root.innerHTML = html;
        _bindEvents();

        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.bindAll) {
            try { WamPersianDate.bindAll(STATE.root); } catch (e) { /* بی‌صدا */ }
        }

        _emit(ReportEvents.RENDERED, { at: Date.now() });
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents() {
        if (!STATE.root) return;

        var btns = STATE.root.querySelectorAll('[data-fr-action]');
        for (var i = 0; i < btns.length; i++) {
            if (btns[i].dataset.bound) continue;
            btns[i].addEventListener('click', _handleAction);
            btns[i].dataset.bound = '1';
        }

        var periodEl = STATE.root.querySelector('[data-fr="period"]');
        if (periodEl) {
            periodEl.addEventListener('change', function () {
                STATE.periodType = this.value;
                STATE.range = _computeRange(STATE.periodType, STATE.customRange);
                render();
                _emit(ReportEvents.PERIOD_CHANGED, { period: STATE.periodType });
            });
        }

        var fromEl = STATE.root.querySelector('[data-fr="from"]');
        if (fromEl) {
            fromEl.addEventListener('change', function () {
                var v = _en(this.value).trim();
                STATE.customRange.from = v ? _parseJalali(v) : null;
            });
        }
        var toEl = STATE.root.querySelector('[data-fr="to"]');
        if (toEl) {
            toEl.addEventListener('change', function () {
                var v = _en(this.value).trim();
                STATE.customRange.to = v ? _parseJalali(v) : null;
            });
        }
    }

    function _parseJalali(str) {
        try {
            if (typeof WamPersianDate !== 'undefined' && WamPersianDate.parse) {
                var p = WamPersianDate.parse(str, 'YYYY/MM/DD');
                if (p) {
                    var d = WamPersianDate.jalaliToDate(p.jy, p.jm, p.jd);
                    if (d) return d.getTime();
                }
            }
        } catch (e) { /* بی‌صدا */ }
        return null;
    }

    function _handleAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-fr-action');
        var id = this.getAttribute('data-id');
        var rpt = this.getAttribute('data-report');

        if (a === 'set-report') {
            STATE.reportType = rpt;
            generate({ reportType: rpt });
            render();
            _emit(ReportEvents.REPORT_CHANGED, { type: rpt });
            return;
        }
        if (a === 'generate') {
            generate({});
            render();
            _toast('success', 'گزارش تولید شد', 'موفق');
            return;
        }
        if (a === 'export') {
            exportCSV();
            return;
        }
        if (a === 'save-snapshot') {
            _promptSaveSnapshot();
            return;
        }
        if (a === 'load-snap') {
            var r = loadSnapshot(id);
            if (r.ok) {
                render();
                _toast('success', 'بازیابی شد', 'موفق');
            }
            return;
        }
        if (a === 'delete-snap') {
            _confirmDeleteSnapshot(id);
            return;
        }
    }

    function _promptSaveSnapshot() {
        if (!STATE.data) {
            _toast('warning', 'ابتدا گزارش بگیرید', 'توجه');
            return;
        }
        var name = prompt('نام گزارش:',
            'گزارش ' + (REPORT_LABELS[STATE.reportType] || STATE.reportType));
        if (!name) return;
        var r = saveSnapshot(name);
        if (r.ok) {
            render();
            _toast('success', 'ذخیره شد', 'موفق');
        } else {
            _toast('error', 'خطا در ذخیره', 'خطا');
        }
    }

    function _confirmDeleteSnapshot(id) {
        var msg = 'این گزارش حذف شود؟';
        var doIt = function () {
            var r = deleteSnapshot(id);
            if (r.ok) {
                render();
                _toast('success', 'حذف شد', 'موفق');
            }
        };
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('حذف گزارش', msg, { danger: true })
                .then(function (ok) { if (ok) doIt(); });
        } else if (window.confirm(msg)) {
            doIt();
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
                       document.querySelector('.wam-fr');
            if (!root) {
                if (options.debug) console.warn('[financial-reports-v2] root پیدا نشد');
                return;
            }
            STATE.root = root;

            if (options.reportType) STATE.reportType = options.reportType;
            if (options.periodType) STATE.periodType = options.periodType;

            STATE.range = _computeRange(STATE.periodType, STATE.customRange);
            STATE.snapshots = _loadSnapshots();

            generate({});
            render();

            STATE.installed = true;

            _emit(ReportEvents.READY, {
                type: STATE.reportType,
                period: STATE.periodType
            });

            if (options.debug) {
                console.log('[financial-reports-v2] v' + VERSION + ' آماده');
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
        STATE.data = null;
        STATE.installed = false;
    }

    function setReportType(type) {
        if (!REPORT_LABELS[type]) return false;
        STATE.reportType = type;
        generate({ reportType: type });
        render();
        return true;
    }

    function setPeriod(period) {
        if (!PERIOD_LABELS[period]) return false;
        STATE.periodType = period;
        STATE.range = _computeRange(period, STATE.customRange);
        generate({});
        render();
        return true;
    }

    function setCustomRange(fromTs, toTs) {
        STATE.periodType = 'custom';
        STATE.customRange = { from: fromTs, to: toTs };
        STATE.range = _computeRange('custom', STATE.customRange);
        generate({});
        render();
        return true;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            version: VERSION,
            installed: STATE.installed,
            role: STATE.role,
            reportType: STATE.reportType,
            periodType: STATE.periodType,
            hasData: !!STATE.data,
            snapshotsCount: getSnapshots().length,
            range: STATE.range
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
    var WamFinancialReportsV2 = {
        VERSION: VERSION,
        EVENTS: ReportEvents,
        ROOT_ATTR: ROOT_ATTR,
        SNAPSHOTS_KEY: SNAPSHOTS_KEY,
        PERIOD_TYPES: PERIOD_TYPES,
        PERIOD_LABELS: PERIOD_LABELS,
        REPORT_TYPES: REPORT_TYPES,
        REPORT_LABELS: REPORT_LABELS,

        install: install,
        uninstall: uninstall,
        render: render,
        generate: generate,

        setReportType: setReportType,
        setPeriod: setPeriod,
        setCustomRange: setCustomRange,

        saveSnapshot: saveSnapshot,
        loadSnapshot: loadSnapshot,
        deleteSnapshot: deleteSnapshot,
        getSnapshots: getSnapshots,

        exportCSV: exportCSV,

        getData: function () { return STATE.data; },
        getPrevData: function () { return STATE.prevData; },
        getRange: function () { return STATE.range; },

        computeReport: _computeReport,
        computeRange: _computeRange,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamFinancialReportsV2 = WamFinancialReportsV2;
    window.FinReportEvents = ReportEvents;

    // نصب خودکار
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-fin-reports-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-fr')) {
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