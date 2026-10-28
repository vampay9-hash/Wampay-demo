// ==========================================
// وام پی — Shared Modules
// فایل: loan-register.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: دفتر ثبت وام‌های فعال — اقساط، پرداخت‌ها، وضعیت
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION   = '1.0.0';
    var ROOT_ATTR = 'data-loan-register-root';
    var LOANS_KEY = 'wamPayLoans';
    var USERS_KEY = 'wamPayUsers';
    var PAGE_SIZE = 20;

    var STATUS_LABELS = {
        active:    'فعال',
        settled:   'تسویه‌شده',
        overdue:   'معوق',
        defaulted: 'نکول',
        cancelled: 'لغو شده'
    };

    var SORT_OPTIONS = {
        newest:    'جدیدترین',
        oldest:    'قدیمی‌ترین',
        amount:    'بیشترین مبلغ',
        remaining: 'بیشترین مانده',
        dueDate:   'نزدیک‌ترین سررسید'
    };

    var VIEW_MODES = { TABLE: 'table', CARDS: 'cards' };

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        role: null,
        userId: null,
        loans: [],
        filtered: [],
        page: 1,
        viewMode: VIEW_MODES.TABLE,
        sort: 'newest',
        scope: 'auto',      // auto | all | mine | overdue
        filters: {
            query: '',
            status: '',
            bank: ''
        },
        selectedIds: {},
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var LoanEvents = {
        LOADED:       'loan.loaded',
        RENDERED:     'loan.rendered',
        CREATED:      'loan.created',
        UPDATED:      'loan.updated',
        DELETED:      'loan.deleted',
        PAYMENT:      'loan.payment_registered',
        SETTLED:      'loan.settled',
        DEFAULTED:    'loan.defaulted',
        SELECTION:    'loan.selection',
        FILTERED:     'loan.filtered',
        EXPORTED:     'loan.exported',
        ROW_CLICK:    'loan.row_click'
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

    function _statusLabel(s) { return STATUS_LABELS[s] || s || '—'; }

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
        return (prefix || 'ln') + '_' + Date.now().toString(36) + '_' + r;
    }

    function _genLoanCode() {
        var r = Math.random().toString(36).slice(2, 6).toUpperCase();
        return 'WP-LN-' + r;
    }

    function _toast(type, msg, title) {
        if (typeof WamUI === 'undefined') return;
        if (type === 'success' && WamUI.toastSuccess) WamUI.toastSuccess(msg, title || 'موفق');
        else if (type === 'error' && WamUI.toastError) WamUI.toastError(msg, title || 'خطا');
        else if (type === 'warning' && WamUI.toastWarning) WamUI.toastWarning(msg, title || 'توجه');
        else if (type === 'info' && WamUI.toastInfo) WamUI.toastInfo(msg, title || 'اطلاع');
    }

    function _dayStart(ts) {
        var d = new Date(ts || Date.now());
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری / ذخیره
    // ─────────────────────────────────────
    function _loadAll() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(LOANS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveAll(list) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(LOANS_KEY, list);
    }

    function _findById(id) {
        for (var i = 0; i < STATE.loans.length; i++) {
            if (STATE.loans[i] && STATE.loans[i].id === id) return STATE.loans[i];
        }
        return null;
    }

    function _persist(updated) {
        var all = _loadAll();
        var found = false;
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].id === updated.id) {
                all[i] = updated;
                found = true;
                break;
            }
        }
        if (!found) return false;
        return _saveAll(all);
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر نقش‌محور
    // ─────────────────────────────────────
    function _filterByRole(list) {
        var role = STATE.role;
        var userId = STATE.userId;

        if (role === 'admin' || role === 'super_admin' || role === 'verifier') {
            return list;
        }

        if (role === 'broker') {
            return list.filter(function (l) {
                if (!l) return false;
                if (l.brokerId === userId) return true;
                if (l.createdBy === userId) return true;
                return false;
            });
        }

        if (role === 'applicant') {
            return list.filter(function (l) {
                if (!l) return false;
                if (l.applicantUserId === userId) return true;
                if (l.createdBy === userId) return true;
                return false;
            });
        }

        return list;
    }

    function _applyScope(list) {
        var scope = STATE.scope;
        if (scope === 'all') return list;
        if (scope === 'mine') {
            return list.filter(function (l) {
                return l && (l.createdBy === STATE.userId ||
                             l.brokerId === STATE.userId ||
                             l.applicantUserId === STATE.userId);
            });
        }
        if (scope === 'overdue') {
            return list.filter(function (l) {
                return l && (l.status === 'overdue' || l.status === 'defaulted');
            });
        }
        return list;
    }

    // ─────────────────────────────────────
    // 🧮 محاسبات وام
    // ─────────────────────────────────────
    function computeRemaining(loan) {
        if (!loan) return 0;
        var paid = 0;
        if (Array.isArray(loan.payments)) {
            for (var i = 0; i < loan.payments.length; i++) {
                paid += Number(loan.payments[i].amount) || 0;
            }
        }
        return Math.max(0, (Number(loan.totalPayable) || 0) - paid);
    }

    function computePaidAmount(loan) {
        if (!loan || !Array.isArray(loan.payments)) return 0;
        var paid = 0;
        for (var i = 0; i < loan.payments.length; i++) {
            paid += Number(loan.payments[i].amount) || 0;
        }
        return paid;
    }

    function computeProgress(loan) {
        if (!loan) return { paid: 0, total: 0, percent: 0 };
        var total = Number(loan.totalPayable) || 0;
        var paid = computePaidAmount(loan);
        return {
            paid: paid,
            total: total,
            percent: total > 0 ? Math.round((paid / total) * 100) : 0
        };
    }

    function computeInstallments(loan) {
        if (!loan) return { paid: 0, total: 0, remaining: 0 };
        var total = Number(loan.installmentCount) || 0;
        var paid = Array.isArray(loan.payments) ? loan.payments.length : 0;
        return {
            paid: paid,
            total: total,
            remaining: Math.max(0, total - paid)
        };
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر پیشرفته
    // ─────────────────────────────────────
    function _applyFilters() {
        var f = STATE.filters;
        var q = (f.query || '').toLowerCase().trim();

        STATE.filtered = STATE.loans.filter(function (l) {
            if (!l) return false;

            if (q) {
                var hay = [l.loanCode, l.caseId, l.applicantName,
                           l.applicantMobile, l.bank, l.brokerName]
                    .filter(Boolean).join(' ').toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            if (f.status && l.status !== f.status) return false;
            if (f.bank && l.bank !== f.bank) return false;

            return true;
        });

        _applySort();
        _emit(LoanEvents.FILTERED, {
            count: STATE.filtered.length, filters: f
        });
        return STATE.filtered;
    }

    function _applySort() {
        var s = STATE.sort;
        STATE.filtered.sort(function (a, b) {
            if (s === 'newest') {
                return (b.createdAt || 0) - (a.createdAt || 0);
            }
            if (s === 'oldest') {
                return (a.createdAt || 0) - (b.createdAt || 0);
            }
            if (s === 'amount') {
                return (Number(b.principal) || 0) - (Number(a.principal) || 0);
            }
            if (s === 'remaining') {
                return computeRemaining(b) - computeRemaining(a);
            }
            if (s === 'dueDate') {
                return (a.nextDueDate || Infinity) - (b.nextDueDate || Infinity);
            }
            return 0;
        });
    }

    // ─────────────────────────────────────
    // 📊 آمار
    // ─────────────────────────────────────
    function computeStats() {
        var s = {
            total: STATE.loans.length,
            filtered: STATE.filtered.length,
            active: 0, settled: 0, overdue: 0, defaulted: 0, cancelled: 0,
            totalPrincipal: 0,
            totalRemaining: 0,
            totalPaid: 0
        };
        for (var i = 0; i < STATE.loans.length; i++) {
            var l = STATE.loans[i];
            if (!l) continue;
            var st = l.status || 'active';
            if (st === 'active') s.active++;
            else if (st === 'settled') s.settled++;
            else if (st === 'overdue') s.overdue++;
            else if (st === 'defaulted') s.defaulted++;
            else if (st === 'cancelled') s.cancelled++;

            s.totalPrincipal += Number(l.principal) || 0;
            s.totalRemaining += computeRemaining(l);
            s.totalPaid += computePaidAmount(l);
        }
        return s;
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
            STATE.selectedIds[STATE.filtered[i].id] = true;
        }
        _emit(LoanEvents.SELECTION, { count: _getSelectedIds().length });
        return _getSelectedIds().length;
    }

    function clearSelection() {
        STATE.selectedIds = {};
        _emit(LoanEvents.SELECTION, { count: 0 });
        return true;
    }

    // ─────────────────────────────────────
    // 🎯 CRUD
    // ─────────────────────────────────────
    function create(data, options) {
        options = options || {};
        var result = { ok: false, reason: null, loan: null, errors: null };

        var errors = _validate(data);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        var user = _user();
        var now = Date.now();

        var loan = {
            id: _genId('loan'),
            loanCode: _genLoanCode(),
            caseId: data.caseId || null,
            bank: String(data.bank).trim(),
            principal: Number(_en(data.principal)) || 0,
            rate: Number(data.rate) || 0,
            installmentCount: Number(data.installmentCount) || 0,
            installmentAmount: Number(_en(data.installmentAmount)) || 0,
            totalPayable: Number(_en(data.totalPayable)) ||
                          (Number(data.installmentAmount) || 0) *
                          (Number(data.installmentCount) || 0),
            startDate: data.startDate || now,
            nextDueDate: data.nextDueDate || null,
            firstDueDate: data.firstDueDate || null,

            applicantName: data.applicantName || null,
            applicantMobile: data.applicantMobile
                ? _en(data.applicantMobile).replace(/\D/g, '') : null,
            applicantUserId: data.applicantUserId || null,
            applicantNationalCode: data.applicantNationalCode
                ? _en(data.applicantNationalCode).replace(/\D/g, '') : null,

            brokerId: data.brokerId || null,
            brokerName: data.brokerName || null,
            brokerCode: data.brokerCode || null,

            status: 'active',
            payments: [],
            notes: [],
            collateralType: data.collateralType || null,
            contractNumber: data.contractNumber || null,

            createdBy: user ? user.id : null,
            createdByName: user ? (user.name || user.username) : null,
            createdAt: now,
            updatedAt: now
        };

        var all = _loadAll();
        all.push(loan);
        if (!_saveAll(all)) {
            result.reason = 'storage_error';
            return result;
        }

        STATE.loans.push(loan);
        _emit(LoanEvents.CREATED, { loan: loan, at: now });

        result.ok = true;
        result.loan = loan;
        return result;
    }

    function update(id, patch, options) {
        options = options || {};
        var result = { ok: false, reason: null, loan: null, errors: null };

        var l = _findById(id);
        if (!l) { result.reason = 'not_found'; return result; }
        if (!canEdit(l)) { result.reason = 'forbidden'; return result; }

        var allowed = ['bank', 'rate', 'installmentCount',
                       'installmentAmount', 'totalPayable',
                       'nextDueDate', 'firstDueDate', 'contractNumber',
                       'collateralType', 'applicantName', 'applicantMobile'];
        for (var i = 0; i < allowed.length; i++) {
            var k = allowed[i];
            if (patch[k] !== undefined) l[k] = patch[k];
        }
        if (patch.principal !== undefined) {
            l.principal = Number(_en(patch.principal)) || 0;
        }
        if (patch.applicantMobile) {
            l.applicantMobile = _en(patch.applicantMobile).replace(/\D/g, '');
        }
        l.updatedAt = Date.now();
        l.updatedBy = _uid();

        if (!_persist(l)) {
            result.reason = 'storage_error';
            return result;
        }

        result.ok = true;
        result.loan = l;
        _emit(LoanEvents.UPDATED, { loan: l, at: Date.now() });
        return result;
    }

    function remove(id) {
        var l = _findById(id);
        if (!l) return { ok: false, reason: 'not_found' };
        if (!canDelete(l)) return { ok: false, reason: 'forbidden' };

        var all = _loadAll();
        var idx = -1;
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].id === id) { idx = i; break; }
        }
        if (idx === -1) return { ok: false, reason: 'not_found' };

        var removed = all.splice(idx, 1)[0];
        if (!_saveAll(all)) {
            all.splice(idx, 0, removed);
            return { ok: false, reason: 'storage_error' };
        }

        for (var j = STATE.loans.length - 1; j >= 0; j--) {
            if (STATE.loans[j].id === id) {
                STATE.loans.splice(j, 1);
                break;
            }
        }
        delete STATE.selectedIds[id];

        _emit(LoanEvents.DELETED, { loan: removed, at: Date.now() });
        return { ok: true, loan: removed };
    }

    // ─────────────────────────────────────
    // 💰 ثبت پرداخت
    // ─────────────────────────────────────
    function registerPayment(id, data, options) {
        options = options || {};
        var result = { ok: false, reason: null, payment: null };

        var l = _findById(id);
        if (!l) return { ok: false, reason: 'not_found' };
        if (!canRegisterPayment(l)) return { ok: false, reason: 'forbidden' };
        if (l.status === 'settled' || l.status === 'cancelled') {
            return { ok: false, reason: 'closed' };
        }

        var amount = Number(_en(data.amount)) || 0;
        if (amount <= 0) return { ok: false, reason: 'invalid_amount' };

        var payment = {
            id: _genId('pay'),
            amount: amount,
            at: data.at || Date.now(),
            method: data.method || 'cash',   // cash | transfer | auto
            ref: data.ref || null,
            note: data.note || null,
            by: _uid(),
            byName: _user() ? (_user().name || _user().username) : null
        };

        if (!Array.isArray(l.payments)) l.payments = [];
        l.payments.push(payment);
        l.updatedAt = Date.now();
        l.updatedBy = _uid();

        // بررسی تسویه
        var paid = computePaidAmount(l);
        var total = Number(l.totalPayable) || 0;
        if (total > 0 && paid >= total) {
            l.status = 'settled';
            l.settledAt = Date.now();
            l.settledBy = _uid();
            _emit(LoanEvents.SETTLED, { loan: l, at: Date.now() });
        } else if (l.status === 'overdue') {
            // بررسی اینکه آیا اکنون در سررسید نیست
            if (l.nextDueDate && l.nextDueDate >= _dayStart()) {
                l.status = 'active';
            }
        }

        if (!_persist(l)) return { ok: false, reason: 'storage_error' };

        result.ok = true;
        result.payment = payment;
        _emit(LoanEvents.PAYMENT, {
            loanId: id,
            payment: payment,
            loan: l
        });
        return result;
    }

    // ─────────────────────────────────────
    // ✅ تسویه دستی
    // ─────────────────────────────────────
    function markSettled(id, options) {
        options = options || {};
        var l = _findById(id);
        if (!l) return { ok: false, reason: 'not_found' };
        if (!canManageStatus(l)) return { ok: false, reason: 'forbidden' };
        if (l.status === 'settled') return { ok: false, reason: 'already' };

        l.status = 'settled';
        l.settledAt = Date.now();
        l.settledBy = _uid();
        l.updatedAt = Date.now();

        if (options.note) {
            if (!Array.isArray(l.notes)) l.notes = [];
            l.notes.push({
                id: _genId('note'),
                text: 'تسویه دستی: ' + options.note,
                by: _uid(),
                at: Date.now()
            });
        }

        if (!_persist(l)) return { ok: false, reason: 'storage_error' };

        _emit(LoanEvents.SETTLED, { loan: l, manual: true, at: Date.now() });
        return { ok: true, loan: l };
    }

    // ─────────────────────────────────────
    // ⚠️ نکول
    // ─────────────────────────────────────
    function markDefaulted(id, options) {
        options = options || {};
        var l = _findById(id);
        if (!l) return { ok: false, reason: 'not_found' };
        if (!canManageStatus(l)) return { ok: false, reason: 'forbidden' };

        l.status = 'defaulted';
        l.defaultedAt = Date.now();
        l.defaultedBy = _uid();
        l.updatedAt = Date.now();

        if (options.note) {
            if (!Array.isArray(l.notes)) l.notes = [];
            l.notes.push({
                id: _genId('note'),
                text: 'نکول: ' + options.note,
                by: _uid(),
                at: Date.now()
            });
        }

        if (!_persist(l)) return { ok: false, reason: 'storage_error' };

        _emit(LoanEvents.DEFAULTED, { loan: l, at: Date.now() });
        return { ok: true, loan: l };
    }

    // ─────────────────────────────────────
    // 🔒 دسترسی
    // ─────────────────────────────────────
    function canCreate() {
        return STATE.role === 'admin' || STATE.role === 'super_admin';
    }

    function canEdit(l) {
        if (!l) return false;
        if (STATE.role === 'admin' || STATE.role === 'super_admin') return true;
        return false;
    }

    function canDelete(l) {
        if (!l) return false;
        return STATE.role === 'admin' || STATE.role === 'super_admin';
    }

    function canRegisterPayment(l) {
        if (!l) return false;
        if (STATE.role === 'admin' || STATE.role === 'super_admin') return true;
        if (STATE.role === 'broker' &&
            (l.brokerId === STATE.userId || l.createdBy === STATE.userId)) {
            return true;
        }
        return false;
    }

    function canManageStatus(l) {
        if (!l) return false;
        return STATE.role === 'admin' || STATE.role === 'super_admin';
    }

    // ─────────────────────────────────────
    // 🧾 اعتبارسنجی
    // ─────────────────────────────────────
    function _validate(data) {
        var e = {};
        if (!data.bank || String(data.bank).trim().length < 2) {
            e.bank = 'بانک الزامی';
        }
        if (!data.principal || Number(_en(data.principal)) <= 0) {
            e.principal = 'مبلغ وام الزامی';
        }
        if (!data.installmentCount ||
            Number(data.installmentCount) <= 0) {
            e.installmentCount = 'تعداد اقساط الزامی';
        }
        if (!data.installmentAmount ||
            Number(_en(data.installmentAmount)) <= 0) {
            e.installmentAmount = 'مبلغ قسط الزامی';
        }
        return e;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت آمار
    // ─────────────────────────────────────
    function _renderStats() {
        var s = computeStats();
        return '<div class="wam-loans__stats">' +
            '<div class="wam-loans__stat"><span>کل:</span> <strong>' +
                _fa(s.total) + '</strong></div>' +
            '<div class="wam-loans__stat"><span>فعال:</span> <strong>' +
                _fa(s.active) + '</strong></div>' +
            '<div class="wam-loans__stat"><span>تسویه:</span> <strong>' +
                _fa(s.settled) + '</strong></div>' +
            '<div class="wam-loans__stat wam-loans__stat--warning">' +
                '<span>معوق:</span> <strong>' + _fa(s.overdue) + '</strong></div>' +
            '<div class="wam-loans__stat wam-loans__stat--danger">' +
                '<span>نکول:</span> <strong>' + _fa(s.defaulted) + '</strong></div>' +
            '<div class="wam-loans__stat wam-loans__stat--info">' +
                '<span>مانده کل:</span> <strong>' +
                _amt(s.totalRemaining) + '</strong></div>' +
        '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نوار ابزار
    // ─────────────────────────────────────
    function _renderToolbar() {
        var selected = _getSelectedIds().length;

        var html = '<div class="wam-loans__toolbar">';
        html += '<div class="wam-loans__filters">';

        html += '<input type="search" data-loans="search" ' +
                'placeholder="🔍 جستجو..." value="' +
                _esc(STATE.filters.query) + '">';

        html += '<select data-loans="filter-status">' +
                '<option value="">همه وضعیت‌ها</option>';
        for (var st in STATUS_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(STATUS_LABELS, st)) continue;
            html += '<option value="' + st + '"' +
                (STATE.filters.status === st ? ' selected' : '') + '>' +
                _esc(STATUS_LABELS[st]) + '</option>';
        }
        html += '</select>';

        html += '<select data-loans="sort">';
        for (var sk in SORT_OPTIONS) {
            if (!Object.prototype.hasOwnProperty.call(SORT_OPTIONS, sk)) continue;
            html += '<option value="' + sk + '"' +
                (STATE.sort === sk ? ' selected' : '') + '>' +
                _esc(SORT_OPTIONS[sk]) + '</option>';
        }
        html += '</select>';

        html += '<button class="wam-btn-icon" data-loans-action="toggle-view" ' +
                'title="حالت نمایش">' +
                (STATE.viewMode === 'table' ? '🃏' : '📋') + '</button>';

        html += '<button class="wam-btn-icon" data-loans-action="refresh" ' +
                'title="بروزرسانی">🔄</button>';

        if (selected > 0) {
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-loans-action="clear-selection">لغو</button>';
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-loans-action="export-selected">📤 (' +
                    _fa(selected) + ')</button>';
        } else {
            if (canCreate()) {
                html += '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
                        'data-loans-action="new">➕ وام جدید</button>';
            }
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-loans-action="export">📤 CSV</button>';
        }

        html += '</div></div>';
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
                (STATE.loans.length === 0
                    ? 'هیچ وامی ثبت نشده است.'
                    : 'نتیجه‌ای برای فیلتر فعلی یافت نشد.') +
                '</div>';
        }

        var html = '<div class="wam-loans__table-wrap">' +
            '<table class="wam-loans__table"><thead><tr>';

        html += '<th class="wam-loans__check">' +
                '<input type="checkbox" data-loans="select-all"' +
                (_getSelectedIds().length > 0 ? ' checked' : '') + '></th>';
        html += '<th>کد</th>';
        html += '<th>متقاضی</th>';
        html += '<th>بانک</th>';
        html += '<th>مبلغ</th>';
        html += '<th>اقساط</th>';
        html += '<th>مانده</th>';
        html += '<th>وضعیت</th>';
        html += '<th>سررسید بعدی</th>';
        html += '<th>عملیات</th>';

        html += '</tr></thead><tbody>';

        for (var i = 0; i < items.length; i++) {
            html += _renderRow(items[i]);
        }

        html += '</tbody></table></div>';
        return html;
    }

    function _renderRow(l) {
        var st = l.status || 'active';
        var selected = !!STATE.selectedIds[l.id];
        var progress = computeProgress(l);
        var installments = computeInstallments(l);
        var overdue = l.status === 'overdue' || l.status === 'defaulted';

        var rowClass = (selected ? ' is-selected' : '') +
                       (overdue ? ' is-overdue' : '');

        var html = '<tr data-loans-id="' + _esc(l.id) + '" class="' +
                   rowClass.trim() + '">';

        html += '<td><input type="checkbox" data-loans="select-row"' +
                (selected ? ' checked' : '') + '></td>';

        html += '<td><code>' + _esc(l.loanCode) + '</code></td>';
        html += '<td>' + _esc(l.applicantName || '—') + '</td>';
        html += '<td>' + _esc(l.bank || '—') + '</td>';
        html += '<td>' + _amt(l.principal) + '</td>';
        html += '<td>' + _fa(installments.paid) + '/' +
                _fa(installments.total) + '</td>';
        html += '<td class="wam-loans__remaining">' +
                _amt(computeRemaining(l)) + '</td>';
        html += '<td><span class="wam-badge wam-badge--' + _esc(st) + '">' +
                _esc(_statusLabel(st)) + '</span></td>';
        html += '<td>' + _esc(l.nextDueDate ? _jalali(l.nextDueDate) : '—') +
                '</td>';

        html += '<td class="wam-loans__actions">';
        html += '<button class="wam-btn-icon" data-loans-row-action="view" ' +
                'title="مشاهده">👁️</button>';
        if (canRegisterPayment(l) && st !== 'settled' && st !== 'cancelled') {
            html += '<button class="wam-btn-icon" ' +
                    'data-loans-row-action="payment" ' +
                    'title="ثبت پرداخت">💰</button>';
        }
        if (canEdit(l)) {
            html += '<button class="wam-btn-icon" ' +
                    'data-loans-row-action="edit" ' +
                    'title="ویرایش">✏️</button>';
        }
        if (canDelete(l)) {
            html += '<button class="wam-btn-icon wam-btn-icon--danger" ' +
                    'data-loans-row-action="delete" ' +
                    'title="حذف">🗑️</button>';
        }
        html += '</td>';

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

        var html = '<div class="wam-loans__cards">';
        for (var i = 0; i < items.length; i++) {
            html += _renderCard(items[i]);
        }
        html += '</div>';
        return html;
    }

    function _renderCard(l) {
        var st = l.status || 'active';
        var selected = !!STATE.selectedIds[l.id];
        var progress = computeProgress(l);
        var installments = computeInstallments(l);
        var overdue = l.status === 'overdue' || l.status === 'defaulted';

        return '<div class="wam-loans__card' +
            (selected ? ' is-selected' : '') +
            (overdue ? ' is-overdue' : '') +
            '" data-loans-id="' + _esc(l.id) + '">' +
            '<div class="wam-loans__card-head">' +
                '<input type="checkbox" data-loans="select-row"' +
                (selected ? ' checked' : '') + '>' +
                '<code>' + _esc(l.loanCode) + '</code>' +
                '<span class="wam-badge wam-badge--' + _esc(st) + '">' +
                _esc(_statusLabel(st)) + '</span>' +
            '</div>' +
            '<div class="wam-loans__card-name">' +
                _esc(l.applicantName || '—') + '</div>' +
            '<div class="wam-loans__card-rows">' +
                '<div><span>بانک:</span> ' + _esc(l.bank || '—') + '</div>' +
                '<div><span>مبلغ:</span> ' + _amt(l.principal) + ' ریال</div>' +
                '<div><span>اقساط:</span> ' + _fa(installments.paid) + '/' +
                    _fa(installments.total) + '</div>' +
                '<div><span>مانده:</span> ' + _amt(computeRemaining(l)) +
                    ' ریال</div>' +
            '</div>' +
            '<div class="wam-loans__card-progress">' +
                '<div class="wam-loans__progress-fill" style="width:' +
                progress.percent + '%"></div>' +
                '<span class="wam-loans__progress-label">' +
                _fa(progress.percent) + '٪</span>' +
            '</div>' +
            '<div class="wam-loans__card-foot">' +
                '<span>' + _esc(l.nextDueDate
                    ? 'سررسید: ' + _jalali(l.nextDueDate)
                    : _relTime(l.createdAt)) + '</span>' +
                '<div class="wam-loans__card-actions">' +
                    (canRegisterPayment(l) && st !== 'settled' ?
                        '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
                        'data-loans-row-action="payment">💰</button>' : '') +
                    '<button class="wam-btn wam-btn--sm" ' +
                    'data-loans-row-action="view">مشاهده</button>' +
                '</div>' +
            '</div></div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — صفحه‌بندی
    // ─────────────────────────────────────
    function _renderPagination(total) {
        var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (pages <= 1) return '';

        var p = STATE.page;
        var html = '<div class="wam-loans__pagination">';
        html += '<button data-loans-page="' + (p - 1) + '"' +
                (p === 1 ? ' disabled' : '') + '>‹</button>';
        var start = Math.max(1, p - 2);
        var end = Math.min(pages, p + 2);
        if (start > 1) {
            html += '<button data-loans-page="1">' + _fa(1) + '</button>';
            if (start > 2) html += '<span>…</span>';
        }
        for (var i = start; i <= end; i++) {
            html += '<button data-loans-page="' + i + '"' +
                    (i === p ? ' class="is-active"' : '') + '>' +
                    _fa(i) + '</button>';
        }
        if (end < pages) {
            if (end < pages - 1) html += '<span>…</span>';
            html += '<button data-loans-page="' + pages + '">' +
                    _fa(pages) + '</button>';
        }
        html += '<button data-loans-page="' + (p + 1) + '"' +
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
        if (STATE.viewMode === VIEW_MODES.TABLE) body = _renderTable();
        else body = _renderCards();

        var html =
            '<div class="wam-loans">' +
                _renderStats() +
                _renderToolbar() +
                '<div class="wam-loans__body">' + body + '</div>' +
                _renderPagination(STATE.filtered.length) +
            '</div>';

        STATE.root.innerHTML = html;
        _bindEvents();

        _emit(LoanEvents.RENDERED, {
            count: STATE.filtered.length, at: Date.now()
        });
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents() {
        if (!STATE.root) return;

        var searchEl = STATE.root.querySelector('[data-loans="search"]');
        if (searchEl) {
            searchEl.addEventListener('input', function () {
                STATE.filters.query = this.value;
                STATE.page = 1;
                render();
            });
        }

        var statusEl = STATE.root.querySelector('[data-loans="filter-status"]');
        if (statusEl) {
            statusEl.addEventListener('change', function () {
                STATE.filters.status = this.value;
                STATE.page = 1;
                render();
            });
        }

        var sortEl = STATE.root.querySelector('[data-loans="sort"]');
        if (sortEl) {
            sortEl.addEventListener('change', function () {
                STATE.sort = this.value;
                render();
            });
        }

        var actionBtns = STATE.root.querySelectorAll('[data-loans-action]');
        for (var i = 0; i < actionBtns.length; i++) {
            if (actionBtns[i].dataset.bound) continue;
            actionBtns[i].addEventListener('click', _handleAction);
            actionBtns[i].dataset.bound = '1';
        }

        var selectAll = STATE.root.querySelector('[data-loans="select-all"]');
        if (selectAll) selectAll.addEventListener('change', _handleSelectAll);

        var rowChecks = STATE.root.querySelectorAll('[data-loans="select-row"]');
        for (var j = 0; j < rowChecks.length; j++) {
            rowChecks[j].addEventListener('change', _handleRowSelect);
        }

        var rowBtns = STATE.root.querySelectorAll('[data-loans-row-action]');
        for (var k = 0; k < rowBtns.length; k++) {
            rowBtns[k].addEventListener('click', _handleRowAction);
        }

        var pageBtns = STATE.root.querySelectorAll('[data-loans-page]');
        for (var m = 0; m < pageBtns.length; m++) {
            pageBtns[m].addEventListener('click', _handlePageClick);
        }
    }

    function _handleAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-loans-action');

        if (a === 'refresh') { reload(); _toast('success', 'بروزرسانی شد', 'موفق'); return; }
        if (a === 'toggle-view') {
            STATE.viewMode = STATE.viewMode === 'table' ? 'cards' : 'table';
            render();
            return;
        }
        if (a === 'export') { exportCSV({ all: true }); return; }
        if (a === 'export-selected') { exportCSV({ ids: _getSelectedIds() }); return; }
        if (a === 'clear-selection') { clearSelection(); render(); return; }
        if (a === 'new') { openForm(null); return; }
    }

    function _handleSelectAll() {
        var checked = this.checked;
        var list = STATE.filtered;
        var start = (STATE.page - 1) * PAGE_SIZE;
        var end = Math.min(start + PAGE_SIZE, list.length);
        for (var i = start; i < end; i++) {
            if (checked) STATE.selectedIds[list[i].id] = true;
            else delete STATE.selectedIds[list[i].id];
        }
        render();
        _emit(LoanEvents.SELECTION, { count: _getSelectedIds().length });
    }

    function _handleRowSelect(e) {
        e.stopPropagation();
        var container = this.closest('[data-loans-id]');
        if (!container) return;
        var id = container.getAttribute('data-loans-id');
        if (this.checked) STATE.selectedIds[id] = true;
        else delete STATE.selectedIds[id];
        render();
        _emit(LoanEvents.SELECTION, { count: _getSelectedIds().length });
    }

    function _handleRowAction(e) {
        e.preventDefault();
        e.stopPropagation();
        var action = this.getAttribute('data-loans-row-action');
        var container = this.closest('[data-loans-id]');
        if (!container) return;
        var id = container.getAttribute('data-loans-id');
        if (!id) return;

        if (action === 'view') openDetail(id);
        else if (action === 'edit') openForm(id);
        else if (action === 'payment') openPaymentModal(id);
        else if (action === 'delete') _confirmDelete(id);
    }

    function _handlePageClick() {
        var p = parseInt(this.getAttribute('data-loans-page'), 10);
        if (isNaN(p) || p < 1) return;
        STATE.page = p;
        render();
    }

    // ─────────────────────────────────────
    // 👁️ نمایش جزئیات
    // ─────────────────────────────────────
    function openDetail(id) {
        var l = _findById(id);
        if (!l) return;

        _emit(LoanEvents.ROW_CLICK, { id: id, action: 'view' });

        var existing = document.getElementById('wamLoanDetailModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var progress = computeProgress(l);
        var installments = computeInstallments(l);
        var payments = Array.isArray(l.payments) ? l.payments : [];

        var paymentsHtml = '';
        if (payments.length > 0) {
            paymentsHtml = '<ul class="wam-loans__payments">';
            for (var i = payments.length - 1; i >= 0; i--) {
                var p = payments[i];
                paymentsHtml += '<li class="wam-loans__payment-row">' +
                    '<div class="wam-loans__payment-amount">' +
                    _amt(p.amount) + ' ریال</div>' +
                    '<div class="wam-loans__payment-meta">' +
                    _esc(p.byName || '—') + ' · ' +
                    _esc(_jalali(p.at)) +
                    (p.ref ? ' · ' + _esc(p.ref) : '') +
                    '</div></li>';
            }
            paymentsHtml += '</ul>';
        } else {
            paymentsHtml = '<div class="wam-empty wam-empty--sm">' +
                          'پرداختی ثبت نشده است.</div>';
        }

        var modal = document.createElement('div');
        modal.id = 'wamLoanDetailModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel wam-modal__panel--wide">' +
                '<header class="wam-modal__head">' +
                    '<div>' +
                        '<code>' + _esc(l.loanCode) + '</code> ' +
                        '<span class="wam-badge wam-badge--' +
                        _esc(l.status) + '">' +
                        _esc(_statusLabel(l.status)) + '</span>' +
                    '</div>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<div class="wam-modal__body">' +
                    '<div class="wam-loans__detail-grid">' +
                        _detailRow('متقاضی', l.applicantName || '—') +
                        _detailRow('موبایل', l.applicantMobile || '—') +
                        _detailRow('بانک', l.bank) +
                        _detailRow('کد پرونده', l.caseId || '—') +
                        _detailRow('کارگزار', l.brokerName || '—') +
                        _detailRow('مبلغ اصل', _amt(l.principal) + ' ریال') +
                        _detailRow('نرخ سود', l.rate ? _fa(l.rate) + '٪' : '—') +
                        _detailRow('تعداد اقساط', _fa(l.installmentCount)) +
                        _detailRow('مبلغ قسط',
                            _amt(l.installmentAmount) + ' ریال') +
                        _detailRow('مجموع پرداختی',
                            _amt(l.totalPayable) + ' ریال') +
                        _detailRow('شماره قرارداد', l.contractNumber || '—') +
                        _detailRow('شروع', _jalali(l.startDate)) +
                        _detailRow('سررسید بعدی',
                            l.nextDueDate ? _jalali(l.nextDueDate) : '—') +
                    '</div>' +

                    '<div class="wam-loans__progress-block">' +
                        '<div class="wam-loans__progress-label">' +
                        'پرداخت‌شده: ' + _amt(progress.paid) + ' / ' +
                        _amt(progress.total) + ' ریال ' +
                        '(' + _fa(progress.percent) + '٪)' +
                        '</div>' +
                        '<div class="wam-loans__progress-bar">' +
                            '<div class="wam-loans__progress-fill" ' +
                            'style="width:' + progress.percent + '%"></div>' +
                        '</div>' +
                        '<div class="wam-loans__progress-meta">' +
                        _fa(installments.paid) + ' از ' +
                        _fa(installments.total) + ' قسط' +
                        '</div>' +
                    '</div>' +

                    '<h4 class="wam-loans__section-title">💰 پرداخت‌ها (' +
                    _fa(payments.length) + ')</h4>' +
                    paymentsHtml +

                    (l.notes && l.notes.length > 0 ?
                        '<h4 class="wam-loans__section-title">' +
                        '📝 یادداشت‌ها</h4>' +
                        _renderNotes(l) : '') +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var j = 0; j < cbs.length; j++) {
            cbs[j].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }
    }

    function _detailRow(label, value) {
        return '<div class="wam-loans__detail-row">' +
            '<span class="wam-loans__detail-label">' +
            _esc(label) + ':</span>' +
            '<span class="wam-loans__detail-value">' +
            _esc(value === null || value === undefined || value === '' ? '—' : value) +
            '</span></div>';
    }

    function _renderNotes(l) {
        var html = '<ul class="wam-loans__notes">';
        for (var i = 0; i < l.notes.length; i++) {
            var n = l.notes[i];
            html += '<li class="wam-loans__note">' +
                '<div>' + _esc(n.text) + '</div>' +
                '<small>' + _esc(n.byName || n.by || '—') +
                ' · ' + _esc(_relTime(n.at)) + '</small>' +
            '</li>';
        }
        html += '</ul>';
        return html;
    }

    // ─────────────────────────────────────
    // 💰 modal ثبت پرداخت
    // ─────────────────────────────────────
    function openPaymentModal(id) {
        var l = _findById(id);
        if (!l) return;
        if (!canRegisterPayment(l)) {
            _toast('error', 'دسترسی ندارید', 'خطا');
            return;
        }

        var existing = document.getElementById('wamLoanPaymentModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var remaining = computeRemaining(l);

        var modal = document.createElement('div');
        modal.id = 'wamLoanPaymentModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>💰 ثبت پرداخت</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form class="wam-modal__body">' +
                    '<div class="wam-loans__payment-info">' +
                        '<div><span>کد وام:</span> <code>' +
                        _esc(l.loanCode) + '</code></div>' +
                        '<div><span>مانده:</span> <strong>' +
                        _amt(remaining) + ' ریال</strong></div>' +
                        '<div><span>قسط:</span> ' +
                        _amt(l.installmentAmount) + ' ریال</div>' +
                    '</div>' +

                    '<div class="wam-field"><label>مبلغ پرداختی (ریال) *</label>' +
                        '<input name="amount" inputmode="numeric" ' +
                        'value="' + _esc(String(l.installmentAmount || '')) + '" ' +
                        'placeholder="مثال: 5000000">' +
                        '<div class="wam-field__error" data-error="amount"></div>' +
                    '</div>' +

                    '<div class="wam-field"><label>روش پرداخت</label>' +
                        '<select name="method">' +
                            '<option value="cash">نقدی</option>' +
                            '<option value="transfer">انتقال بانکی</option>' +
                            '<option value="auto">کسر خودکار</option>' +
                        '</select>' +
                    '</div>' +

                    '<div class="wam-field"><label>شماره پیگیری (اختیاری)</label>' +
                        '<input name="ref" placeholder="شماره رسید">' +
                    '</div>' +

                    '<div class="wam-field"><label>یادداشت</label>' +
                        '<textarea name="note" rows="2"></textarea>' +
                    '</div>' +

                    '<footer class="wam-modal__footer">' +
                        '<button type="button" class="wam-btn wam-btn--ghost" ' +
                        'data-close>انصراف</button>' +
                        '<button type="submit" class="wam-btn wam-btn--primary">' +
                        'ثبت پرداخت</button>' +
                    '</footer>' +
                '</form>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var i = 0; i < cbs.length; i++) {
            cbs[i].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }

        var form = modal.querySelector('form');
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var data = {
                amount: form.querySelector('[name="amount"]').value,
                method: form.querySelector('[name="method"]').value,
                ref: form.querySelector('[name="ref"]').value.trim() || null,
                note: form.querySelector('[name="note"]').value.trim() || null
            };

            var r = registerPayment(id, data);
            if (!r.ok) {
                var err = form.querySelector('[data-error="amount"]');
                if (err) {
                    err.textContent = r.reason === 'invalid_amount'
                        ? 'مبلغ نامعتبر' : 'خطا';
                    err.style.display = 'block';
                }
                return;
            }

            if (modal.parentNode) modal.parentNode.removeChild(modal);
            _toast('success', 'پرداخت ثبت شد', 'موفق');
            reload();
        });
    }

    // ─────────────────────────────────────
    // ➕ فرم ایجاد/ویرایش
    // ─────────────────────────────────────
    function openForm(id) {
        var editMode = !!id;
        var l = editMode ? _findById(id) : null;
        if (editMode && !l) return;
        if (editMode && !canEdit(l)) {
            _toast('error', 'دسترسی ندارید', 'خطا');
            return;
        }
        if (!editMode && !canCreate()) {
            _toast('error', 'دسترسی ندارید', 'خطا');
            return;
        }

        var existing = document.getElementById('wamLoanFormModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var d = l || {};

        var modal = document.createElement('div');
        modal.id = 'wamLoanFormModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>' + (editMode ? 'ویرایش وام' : 'ثبت وام جدید') + '</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form class="wam-modal__body">' +
                    '<div class="wam-field"><label>بانک *</label>' +
                        '<input name="bank" value="' +
                        _esc(d.bank || '') + '">' +
                        '<div class="wam-field__error" data-error="bank"></div></div>' +

                    '<div class="wam-field"><label>نام متقاضی *</label>' +
                        '<input name="applicantName" value="' +
                        _esc(d.applicantName || '') + '">' +
                        '<div class="wam-field__error" data-error="applicantName"></div></div>' +

                    '<div class="wam-field"><label>موبایل متقاضی</label>' +
                        '<input name="applicantMobile" type="tel" value="' +
                        _esc(d.applicantMobile || '') + '"></div>' +

                    '<div class="wam-field"><label>مبلغ اصل وام (ریال) *</label>' +
                        '<input name="principal" inputmode="numeric" value="' +
                        _esc(String(d.principal || '')) + '">' +
                        '<div class="wam-field__error" data-error="principal"></div></div>' +

                    '<div class="wam-field"><label>نرخ سود (%)</label>' +
                        '<input name="rate" type="number" step="0.1" value="' +
                        _esc(String(d.rate || 18)) + '"></div>' +

                    '<div class="wam-field"><label>تعداد اقساط *</label>' +
                        '<input name="installmentCount" type="number" min="1" value="' +
                        _esc(String(d.installmentCount || 12)) + '">' +
                        '<div class="wam-field__error" data-error="installmentCount"></div></div>' +

                    '<div class="wam-field"><label>مبلغ هر قسط (ریال) *</label>' +
                        '<input name="installmentAmount" inputmode="numeric" value="' +
                        _esc(String(d.installmentAmount || '')) + '">' +
                        '<div class="wam-field__error" data-error="installmentAmount"></div></div>' +

                    '<div class="wam-field"><label>شماره قرارداد</label>' +
                        '<input name="contractNumber" value="' +
                        _esc(d.contractNumber || '') + '"></div>' +

                    '<div class="wam-field"><label>شماره پرونده مرتبط</label>' +
                        '<input name="caseId" value="' +
                        _esc(d.caseId || '') + '" placeholder="WP-XXXX"></div>' +

                    '<div class="wam-field__error" data-error="general"></div>' +
                    '<footer class="wam-modal__footer">' +
                        '<button type="button" class="wam-btn wam-btn--ghost" ' +
                        'data-close>انصراف</button>' +
                        '<button type="submit" class="wam-btn wam-btn--primary">' +
                        (editMode ? 'ذخیره' : 'ثبت') + '</button>' +
                    '</footer>' +
                '</form>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var i = 0; i < cbs.length; i++) {
            cbs[i].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }

        var form = modal.querySelector('form');
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            _handleFormSubmit(form, editMode, id);
        });
    }

    function _handleFormSubmit(form, editMode, id) {
        _clearFormErrors(form);

        var data = {
            bank: form.querySelector('[name="bank"]').value.trim(),
            applicantName: form.querySelector('[name="applicantName"]').value.trim(),
            applicantMobile: form.querySelector('[name="applicantMobile"]').value.trim(),
            principal: form.querySelector('[name="principal"]').value.trim(),
            rate: Number(form.querySelector('[name="rate"]').value) || 0,
            installmentCount: Number(form.querySelector('[name="installmentCount"]').value) || 0,
            installmentAmount: form.querySelector('[name="installmentAmount"]').value.trim(),
            contractNumber: form.querySelector('[name="contractNumber"]').value.trim(),
            caseId: form.querySelector('[name="caseId"]').value.trim()
        };

        var res = editMode ? update(id, data) : create(data);

        if (!res.ok) {
            _showFormErrors(form, res.errors || { general: 'خطا: ' + res.reason });
            return;
        }

        var modal = document.getElementById('wamLoanFormModal');
        if (modal && modal.parentNode) modal.parentNode.removeChild(modal);

        _toast('success', editMode ? 'وام به‌روزرسانی شد' : 'وام ثبت شد', 'موفق');
        reload();
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
            if (el) { el.textContent = errors[k]; el.style.display = 'block'; }
        }
    }

    // ─────────────────────────────────────
    // 🗑️ حذف
    // ─────────────────────────────────────
    function _confirmDelete(id) {
        var l = _findById(id);
        if (!l) return;
        var msg = 'وام «' + l.loanCode + '» حذف شود؟';
        var doIt = function () {
            var r = remove(id);
            if (r.ok) {
                _toast('success', 'حذف شد', 'موفق');
                reload();
            } else {
                _toast('error', 'خطا در حذف', 'خطا');
            }
        };
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('حذف وام', msg, { danger: true })
                .then(function (ok) { if (ok) doIt(); });
        } else if (window.confirm(msg)) {
            doIt();
        }
    }

    // ─────────────────────────────────────
    // 📤 خروجی CSV
    // ─────────────────────────────────────
    function exportCSV(options) {
        options = options || {};
        var list;
        if (options.ids && options.ids.length > 0) {
            list = STATE.loans.filter(function (l) {
                return l && options.ids.indexOf(l.id) !== -1;
            });
        } else {
            list = STATE.filtered;
        }

        if (list.length === 0) {
            _toast('warning', 'داده‌ای برای خروجی نیست', 'توجه');
            return { ok: false, reason: 'empty' };
        }

        var headers = ['کد وام', 'متقاضی', 'موبایل', 'بانک',
                       'مبلغ اصل', 'تعداد اقساط', 'مبلغ قسط',
                       'پرداختی', 'مانده', 'وضعیت',
                       'سررسید بعدی', 'تاریخ ثبت'];
        var rows = [headers];

        for (var i = 0; i < list.length; i++) {
            var l = list[i];
            var paid = computePaidAmount(l);
            var rem = computeRemaining(l);
            rows.push([
                l.loanCode || '',
                l.applicantName || '',
                l.applicantMobile || '',
                l.bank || '',
                String(l.principal || 0),
                String(l.installmentCount || 0),
                String(l.installmentAmount || 0),
                String(Math.round(paid)),
                String(Math.round(rem)),
                _statusLabel(l.status),
                l.nextDueDate ? _jalali(l.nextDueDate) : '',
                _jalali(l.createdAt)
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
            _emit(LoanEvents.EXPORTED, { count: list.length, at: Date.now() });
            return { ok: true, count: list.length };
        }

        var ts = new Date().toISOString().slice(0, 10);
        var filename = 'wampay-loans-' + ts + '.csv';

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

        _emit(LoanEvents.EXPORTED, { count: list.length, at: Date.now() });
        _toast('success', _fa(list.length) + ' وام خروجی گرفته شد', 'موفق');
        return { ok: true, count: list.length };
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
        STATE.filters = { query: '', status: '', bank: '' };
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
        if (scope !== 'auto' && scope !== 'all' &&
            scope !== 'mine' && scope !== 'overdue') return false;
        STATE.scope = scope;
        reload();
        return true;
    }

    // ─────────────────────────────────────
    // 🔄 reload
    // ─────────────────────────────────────
    function reload() {
        var all = _loadAll();
        STATE.loans = _applyScope(_filterByRole(all));

        // بررسی معوق‌ها
        var now = Date.now();
        var overdueCount = 0;
        for (var i = 0; i < STATE.loans.length; i++) {
            var l = STATE.loans[i];
            if (l.status === 'active' && l.nextDueDate &&
                l.nextDueDate < _dayStart()) {
                l.status = 'overdue';
                _persist(l);
                overdueCount++;
            }
        }

        // پاکسازی انتخاب‌های نامعتبر
        var valid = {};
        for (var j = 0; j < STATE.loans.length; j++) {
            if (STATE.selectedIds[STATE.loans[j].id]) {
                valid[STATE.loans[j].id] = true;
            }
        }
        STATE.selectedIds = valid;

        render();

        _emit(LoanEvents.LOADED, {
            count: STATE.loans.length, role: STATE.role,
            scope: STATE.scope, overdue: overdueCount, at: Date.now()
        });
        return STATE.loans.length;
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
                       document.querySelector('.wam-loans');
            if (!root) {
                if (options.debug) console.warn('[loan-register] root پیدا نشد');
                return;
            }
            STATE.root = root;

            if (options.scope) STATE.scope = options.scope;
            if (options.viewMode) STATE.viewMode = options.viewMode;

            reload();
            STATE.installed = true;

            if (options.debug) {
                console.log('[loan-register] v' + VERSION + ' — ' +
                    STATE.role + '، ' + STATE.loans.length + ' وام');
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
        STATE.loans = [];
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
            total: STATE.loans.length,
            filtered: STATE.filtered.length,
            selected: _getSelectedIds().length,
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
    var WamLoanRegister = {
        VERSION: VERSION,
        EVENTS: LoanEvents,
        ROOT_ATTR: ROOT_ATTR,
        LOANS_KEY: LOANS_KEY,
        PAGE_SIZE: PAGE_SIZE,
        STATUS_LABELS: STATUS_LABELS,
        SORT_OPTIONS: SORT_OPTIONS,
        VIEW_MODES: VIEW_MODES,

        install: install,
        uninstall: uninstall,
        reload: reload,
        render: render,

        create: create,
        update: update,
        remove: remove,
        registerPayment: registerPayment,
        markSettled: markSettled,
        markDefaulted: markDefaulted,

        openForm: openForm,
        openDetail: openDetail,
        openPaymentModal: openPaymentModal,

        canCreate: canCreate,
        canEdit: canEdit,
        canDelete: canDelete,
        canRegisterPayment: canRegisterPayment,
        canManageStatus: canManageStatus,

        setFilter: setFilter,
        setFilters: setFilters,
        resetFilters: resetFilters,
        setSort: setSort,
        setScope: setScope,

        setViewMode: function (mode) {
            if (mode !== 'table' && mode !== 'cards') return false;
            STATE.viewMode = mode;
            render();
            return true;
        },

        getLoans: function () { return STATE.loans.slice(); },
        getFiltered: function () { return STATE.filtered.slice(); },
        findById: _findById,

        computeStats: computeStats,
        computePaidAmount: computePaidAmount,
        computeRemaining: computeRemaining,
        computeProgress: computeProgress,
        computeInstallments: computeInstallments,

        selectAll: selectAll,
        clearSelection: clearSelection,
        getSelectedIds: _getSelectedIds,

        exportCSV: exportCSV,

        formatStatus: _statusLabel,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamLoanRegister = WamLoanRegister;
    window.LoanEvents = LoanEvents;

    // نصب خودکار
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-loan-register-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-loans')) {
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