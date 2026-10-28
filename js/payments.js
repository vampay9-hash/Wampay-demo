// ==========================================
// وام پی — Shared Modules
// فایل: payments.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: مدیریت پرداخت‌های وام — اقساط، تأیید، receipt
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION   = '1.0.0';
    var ROOT_ATTR = 'data-payments-root';
    var PAYMENTS_KEY = 'wamPayPayments';
    var PAGE_SIZE = 20;

    var STATUS_LABELS = {
        pending:   'در انتظار',
        confirmed: 'تأیید شده',
        rejected:  'رد شده',
        refunded:  'بازگشت‌خورده',
        cancelled: 'لغو شده'
    };

    var METHODS = {
        CASH:        'cash',
        TRANSFER:    'transfer',
        AUTO_DEBIT:  'auto_debit',
        CARD:        'card',
        CHECK:       'check'
    };

    var METHOD_LABELS = {
        cash:       'نقدی',
        transfer:   'انتقال بانکی',
        auto_debit: 'کسر خودکار',
        card:       'کارت به کارت',
        check:      'چک'
    };

    var TYPE_LABELS = {
        installment: 'قسط',
        deposit:     'واریز',
        penalty:     'جریمه',
        fee:         'کارمزد',
        other:       'سایر'
    };

    var TYPE_ICONS = {
        installment: '💳',
        deposit:     '💰',
        penalty:     '⚠️',
        fee:         '📋',
        other:       '•'
    };

    var SORT_OPTIONS = {
        newest: 'جدیدترین',
        oldest: 'قدیمی‌ترین',
        amount: 'بیشترین مبلغ'
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
        payments: [],
        filtered: [],
        page: 1,
        viewMode: VIEW_MODES.TABLE,
        sort: 'newest',
        scope: 'auto',
        filters: {
            query: '',
            status: '',
            method: '',
            type: ''
        },
        selectedIds: {},
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var PaymentEvents = {
        LOADED:      'payment.loaded',
        RENDERED:    'payment.rendered',
        CREATED:     'payment.created',
        UPDATED:     'payment.updated',
        DELETED:     'payment.deleted',
        CONFIRMED:   'payment.confirmed',
        REJECTED:    'payment.rejected',
        REFUNDED:    'payment.refunded',
        CANCELLED:   'payment.cancelled',
        RECEIPT_VIEWED:'payment.receipt_viewed',
        SELECTION:   'payment.selection',
        FILTERED:    'payment.filtered',
        EXPORTED:    'payment.exported',
        ROW_CLICK:   'payment.row_click'
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
                if (j) return WamPersianDate.format(j.jy, j.jm, j.jd, 'YYYY/MM/DD HH:mm');
            }
        } catch (e) { /* بی‌صدا */ }
        return new Date(ts).toLocaleString('fa-IR');
    }

    function _statusLabel(s) { return STATUS_LABELS[s] || s || '—'; }
    function _methodLabel(m) { return METHOD_LABELS[m] || m || '—'; }
    function _typeLabel(t) { return TYPE_LABELS[t] || t || '—'; }

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
        return (prefix || 'pay') + '_' + Date.now().toString(36) + '_' + r;
    }

    function _genReceipt() {
        var r = Math.random().toString(36).slice(2, 8).toUpperCase();
        return 'WP-PY-' + r;
    }

    function _toast(type, msg, title) {
        if (typeof WamUI === 'undefined') return;
        if (type === 'success' && WamUI.toastSuccess) WamUI.toastSuccess(msg, title || 'موفق');
        else if (type === 'error' && WamUI.toastError) WamUI.toastError(msg, title || 'خطا');
        else if (type === 'warning' && WamUI.toastWarning) WamUI.toastWarning(msg, title || 'توجه');
        else if (type === 'info' && WamUI.toastInfo) WamUI.toastInfo(msg, title || 'اطلاع');
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری / ذخیره
    // ─────────────────────────────────────
    function _loadAll() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(PAYMENTS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveAll(list) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(PAYMENTS_KEY, list);
    }

    function _findById(id) {
        for (var i = 0; i < STATE.payments.length; i++) {
            if (STATE.payments[i] && STATE.payments[i].id === id) {
                return STATE.payments[i];
            }
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
        if (!found) all.push(updated);
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
            return list.filter(function (p) {
                if (!p) return false;
                if (p.brokerId === userId) return true;
                if (p.createdBy === userId) return true;
                return false;
            });
        }

        if (role === 'applicant') {
            return list.filter(function (p) {
                if (!p) return false;
                if (p.applicantUserId === userId) return true;
                if (p.createdBy === userId) return true;
                return false;
            });
        }

        return list;
    }

    function _applyScope(list) {
        var scope = STATE.scope;
        if (scope === 'all') return list;
        if (scope === 'mine') {
            return list.filter(function (p) {
                return p && (p.createdBy === STATE.userId ||
                             p.brokerId === STATE.userId ||
                             p.applicantUserId === STATE.userId);
            });
        }
        if (scope === 'pending') {
            return list.filter(function (p) {
                return p && p.status === 'pending';
            });
        }
        return list;
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر پیشرفته
    // ─────────────────────────────────────
    function _applyFilters() {
        var f = STATE.filters;
        var q = (f.query || '').toLowerCase().trim();

        STATE.filtered = STATE.payments.filter(function (p) {
            if (!p) return false;

            if (q) {
                var hay = [p.receiptNumber, p.loanId, p.caseId,
                           p.applicantName, p.applicantMobile, p.ref]
                    .filter(Boolean).join(' ').toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            if (f.status && p.status !== f.status) return false;
            if (f.method && p.method !== f.method) return false;
            if (f.type && p.type !== f.type) return false;

            return true;
        });

        _applySort();
        _emit(PaymentEvents.FILTERED, {
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
                return (Number(b.amount) || 0) - (Number(a.amount) || 0);
            }
            return 0;
        });
    }

    // ─────────────────────────────────────
    // 📊 آمار
    // ─────────────────────────────────────
    function computeStats() {
        var s = {
            total: STATE.payments.length,
            filtered: STATE.filtered.length,
            pending: 0, confirmed: 0, rejected: 0,
            refunded: 0, cancelled: 0,
            totalConfirmed: 0,
            totalPending: 0
        };
        for (var i = 0; i < STATE.payments.length; i++) {
            var p = STATE.payments[i];
            if (!p) continue;
            var st = p.status || 'pending';
            if (st === 'pending') {
                s.pending++;
                s.totalPending += Number(p.amount) || 0;
            } else if (st === 'confirmed') {
                s.confirmed++;
                s.totalConfirmed += Number(p.amount) || 0;
            } else if (st === 'rejected') s.rejected++;
            else if (st === 'refunded') s.refunded++;
            else if (st === 'cancelled') s.cancelled++;
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
        _emit(PaymentEvents.SELECTION, { count: _getSelectedIds().length });
        return _getSelectedIds().length;
    }

    function clearSelection() {
        STATE.selectedIds = {};
        _emit(PaymentEvents.SELECTION, { count: 0 });
        return true;
    }

    // ─────────────────────────────────────
    // 🎯 CRUD
    // ─────────────────────────────────────
    function create(data, options) {
        options = options || {};
        var result = { ok: false, reason: null, payment: null, errors: null };

        var errors = _validate(data);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        var user = _user();
        var now = Date.now();

        var payment = {
            id: _genId('payment'),
            receiptNumber: _genReceipt(),
            type: data.type || 'installment',
            method: data.method || 'cash',

            loanId: data.loanId || null,
            caseId: data.caseId || null,
            installmentNumber: data.installmentNumber || null,

            amount: Number(_en(data.amount)) || 0,

            applicantName: data.applicantName || null,
            applicantMobile: data.applicantMobile
                ? _en(data.applicantMobile).replace(/\D/g, '') : null,
            applicantUserId: data.applicantUserId || null,

            brokerId: data.brokerId || null,
            brokerName: data.brokerName || null,

            ref: data.ref || null,
            note: data.note || null,

            status: 'pending',
            confirmedAt: null,
            confirmedBy: null,
            rejectedAt: null,
            rejectedBy: null,
            rejectReason: null,

            createdBy: user ? user.id : null,
            createdByName: user ? (user.name || user.username) : null,
            createdAt: now,
            updatedAt: now
        };

        var all = _loadAll();
        all.push(payment);
        if (!_saveAll(all)) {
            result.reason = 'storage_error';
            return result;
        }

        STATE.payments.push(payment);
        _emit(PaymentEvents.CREATED, { payment: payment, at: now });

        result.ok = true;
        result.payment = payment;
        return result;
    }

    function update(id, patch, options) {
        options = options || {};
        var result = { ok: false, reason: null, payment: null, errors: null };

        var p = _findById(id);
        if (!p) { result.reason = 'not_found'; return result; }
        if (!canEdit(p)) { result.reason = 'forbidden'; return result; }
        if (p.status === 'confirmed' && !canManage()) {
            return { ok: false, reason: 'already_confirmed' };
        }

        var allowed = ['type', 'method', 'ref', 'note',
                       'loanId', 'caseId', 'installmentNumber',
                       'applicantName', 'applicantMobile', 'brokerName'];
        for (var i = 0; i < allowed.length; i++) {
            var k = allowed[i];
            if (patch[k] !== undefined) p[k] = patch[k];
        }
        if (patch.amount !== undefined) {
            p.amount = Number(_en(patch.amount)) || 0;
        }
        if (patch.applicantMobile) {
            p.applicantMobile = _en(patch.applicantMobile).replace(/\D/g, '');
        }

        p.updatedAt = Date.now();
        p.updatedBy = _uid();

        if (!_persist(p)) {
            result.reason = 'storage_error';
            return result;
        }

        result.ok = true;
        result.payment = p;
        _emit(PaymentEvents.UPDATED, { payment: p, at: Date.now() });
        return result;
    }

    function remove(id) {
        var p = _findById(id);
        if (!p) return { ok: false, reason: 'not_found' };
        if (!canDelete(p)) return { ok: false, reason: 'forbidden' };

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

        for (var j = STATE.payments.length - 1; j >= 0; j--) {
            if (STATE.payments[j].id === id) {
                STATE.payments.splice(j, 1);
                break;
            }
        }
        delete STATE.selectedIds[id];

        _emit(PaymentEvents.DELETED, { payment: removed, at: Date.now() });
        return { ok: true, payment: removed };
    }

    // ─────────────────────────────────────
    // ✅ تأیید
    // ─────────────────────────────────────
    function confirm(id, options) {
        options = options || {};
        var p = _findById(id);
        if (!p) return { ok: false, reason: 'not_found' };
        if (!canConfirm(p)) return { ok: false, reason: 'forbidden' };
        if (p.status !== 'pending') {
            return { ok: false, reason: 'not_pending' };
        }

        p.status = 'confirmed';
        p.confirmedAt = Date.now();
        p.confirmedBy = _uid();
        p.confirmedByName = _user() ? (_user().name || _user().username) : null;
        p.updatedAt = Date.now();

        if (!_persist(p)) return { ok: false, reason: 'storage_error' };

        // اگر از نوع قسط بود، ثبت در loan-register
        if (p.type === 'installment' && p.loanId &&
            typeof WamLoanRegister !== 'undefined' &&
            WamLoanRegister.registerPayment) {
            try {
                WamLoanRegister.registerPayment(p.loanId, {
                    amount: p.amount,
                    method: p.method,
                    ref: p.receiptNumber,
                    note: 'پرداخت از payments.js — ' + p.receiptNumber,
                    at: p.confirmedAt
                });
            } catch (e) { /* بی‌صدا */ }
        }

        // اگر پورسانت کارگزار بود، واریز به کیف پول
        if (p.type === 'deposit' && p.brokerId &&
            typeof WamWallet !== 'undefined' &&
            WamWallet.addTransaction) {
            // این مورد باید صریح در patch مشخص شود
        }

        _emit(PaymentEvents.CONFIRMED, {
            paymentId: id, amount: p.amount
        });
        return { ok: true, payment: p };
    }

    // ─────────────────────────────────────
    // ❌ رد
    // ─────────────────────────────────────
    function reject(id, reason) {
        var p = _findById(id);
        if (!p) return { ok: false, reason: 'not_found' };
        if (!canConfirm(p)) return { ok: false, reason: 'forbidden' };
        if (p.status !== 'pending') {
            return { ok: false, reason: 'not_pending' };
        }
        if (!reason || String(reason).trim().length < 3) {
            return { ok: false, reason: 'reason_required' };
        }

        p.status = 'rejected';
        p.rejectedAt = Date.now();
        p.rejectedBy = _uid();
        p.rejectedByName = _user() ? (_user().name || _user().username) : null;
        p.rejectReason = String(reason).trim();
        p.updatedAt = Date.now();

        if (!_persist(p)) return { ok: false, reason: 'storage_error' };

        _emit(PaymentEvents.REJECTED, {
            paymentId: id, reason: reason
        });
        return { ok: true, payment: p };
    }

    // ─────────────────────────────────────
    // ↩️ بازگشت
    // ─────────────────────────────────────
    function refund(id, reason) {
        var p = _findById(id);
        if (!p) return { ok: false, reason: 'not_found' };
        if (!canManage()) return { ok: false, reason: 'forbidden' };
        if (p.status !== 'confirmed') {
            return { ok: false, reason: 'not_confirmed' };
        }

        p.status = 'refunded';
        p.refundedAt = Date.now();
        p.refundedBy = _uid();
        p.refundReason = reason || null;
        p.updatedAt = Date.now();

        if (!_persist(p)) return { ok: false, reason: 'storage_error' };

        _emit(PaymentEvents.REFUNDED, {
            paymentId: id, amount: p.amount, reason: reason
        });
        return { ok: true, payment: p };
    }

    // ─────────────────────────────────────
    // 🚫 لغو
    // ─────────────────────────────────────
    function cancel(id, reason) {
        var p = _findById(id);
        if (!p) return { ok: false, reason: 'not_found' };
        if (!canEdit(p)) return { ok: false, reason: 'forbidden' };
        if (p.status === 'confirmed') {
            return { ok: false, reason: 'already_confirmed' };
        }

        p.status = 'cancelled';
        p.cancelledAt = Date.now();
        p.cancelledBy = _uid();
        p.cancelReason = reason || null;
        p.updatedAt = Date.now();

        if (!_persist(p)) return { ok: false, reason: 'storage_error' };

        _emit(PaymentEvents.CANCELLED, { paymentId: id, reason: reason });
        return { ok: true, payment: p };
    }

    // ─────────────────────────────────────
    // 🔒 دسترسی
    // ─────────────────────────────────────
    function canManage() {
        return STATE.role === 'admin' || STATE.role === 'super_admin';
    }

    function canCreate() {
        return STATE.role === 'admin' || STATE.role === 'super_admin' ||
               STATE.role === 'broker' || STATE.role === 'applicant';
    }

    function canEdit(p) {
        if (!p) return false;
        if (canManage()) return true;
        if (p.createdBy === STATE.userId && p.status === 'pending') return true;
        if (STATE.role === 'broker' && p.brokerId === STATE.userId &&
            p.status === 'pending') return true;
        return false;
    }

    function canDelete(p) {
        if (!p) return false;
        if (canManage()) return true;
        if (p.createdBy === STATE.userId && p.status === 'pending') return true;
        return false;
    }

    function canConfirm(p) {
        if (!p) return false;
        return canManage();
    }

    function canViewReceipt(p) {
        if (!p) return false;
        if (canManage()) return true;
        if (p.createdBy === STATE.userId) return true;
        if (p.brokerId === STATE.userId) return true;
        if (p.applicantUserId === STATE.userId) return true;
        return false;
    }

    // ─────────────────────────────────────
    // 🧾 اعتبارسنجی
    // ─────────────────────────────────────
    function _validate(data) {
        var e = {};
        if (!data.amount || Number(_en(data.amount)) <= 0) {
            e.amount = 'مبلغ باید مثبت باشد';
        }
        if (!data.method || !METHOD_LABELS[data.method]) {
            e.method = 'روش پرداخت نامعتبر';
        }
        if (!data.type || !TYPE_LABELS[data.type]) {
            e.type = 'نوع پرداخت نامعتبر';
        }
        return e;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — آمار
    // ─────────────────────────────────────
    function _renderStats() {
        var s = computeStats();
        return '<div class="wam-payments__stats">' +
            '<div class="wam-payments__stat"><span>کل:</span> <strong>' +
                _fa(s.total) + '</strong></div>' +
            '<div class="wam-payments__stat wam-payments__stat--warning">' +
                '<span>در انتظار:</span> <strong>' +
                _fa(s.pending) + '</strong></div>' +
            '<div class="wam-payments__stat wam-payments__stat--success">' +
                '<span>تأییدشده:</span> <strong>' +
                _fa(s.confirmed) + '</strong></div>' +
            '<div class="wam-payments__stat wam-payments__stat--danger">' +
                '<span>رد شده:</span> <strong>' +
                _fa(s.rejected) + '</strong></div>' +
            '<div class="wam-payments__stat">' +
                '<span>مبلغ تأییدشده:</span> <strong>' +
                _amt(s.totalConfirmed) + '</strong></div>' +
        '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نوار ابزار
    // ─────────────────────────────────────
    function _renderToolbar() {
        var selected = _getSelectedIds().length;

        var html = '<div class="wam-payments__toolbar">';
        html += '<div class="wam-payments__filters">';
        html += '<input type="search" data-payments="search" ' +
                'placeholder="🔍 جستجو..." value="' +
                _esc(STATE.filters.query) + '">';

        html += '<select data-payments="filter-status">' +
                '<option value="">همه وضعیت‌ها</option>';
        for (var st in STATUS_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(STATUS_LABELS, st)) continue;
            html += '<option value="' + st + '"' +
                (STATE.filters.status === st ? ' selected' : '') + '>' +
                _esc(STATUS_LABELS[st]) + '</option>';
        }
        html += '</select>';

        html += '<select data-payments="filter-method">' +
                '<option value="">همه روش‌ها</option>';
        for (var m in METHOD_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(METHOD_LABELS, m)) continue;
            html += '<option value="' + m + '"' +
                (STATE.filters.method === m ? ' selected' : '') + '>' +
                _esc(METHOD_LABELS[m]) + '</option>';
        }
        html += '</select>';

        html += '<select data-payments="filter-type">' +
                '<option value="">همه انواع</option>';
        for (var t in TYPE_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(TYPE_LABELS, t)) continue;
            html += '<option value="' + t + '"' +
                (STATE.filters.type === t ? ' selected' : '') + '>' +
                _esc(TYPE_LABELS[t]) + '</option>';
        }
        html += '</select>';

        html += '<select data-payments="sort">';
        for (var sk in SORT_OPTIONS) {
            if (!Object.prototype.hasOwnProperty.call(SORT_OPTIONS, sk)) continue;
            html += '<option value="' + sk + '"' +
                (STATE.sort === sk ? ' selected' : '') + '>' +
                _esc(SORT_OPTIONS[sk]) + '</option>';
        }
        html += '</select>';

        html += '<button class="wam-btn-icon" data-payments-action="toggle-view" ' +
                'title="حالت نمایش">' +
                (STATE.viewMode === 'table' ? '🃏' : '📋') + '</button>';

        html += '<button class="wam-btn-icon" data-payments-action="refresh" ' +
                'title="بروزرسانی">🔄</button>';

        if (selected > 0) {
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-payments-action="clear-selection">لغو</button>';
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-payments-action="export-selected">📤 (' +
                    _fa(selected) + ')</button>';
        } else {
            if (canCreate()) {
                html += '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
                        'data-payments-action="new">➕ پرداخت جدید</button>';
            }
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-payments-action="export">📤 CSV</button>';
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
                (STATE.payments.length === 0
                    ? 'هیچ پرداختی ثبت نشده است.'
                    : 'نتیجه‌ای برای فیلتر فعلی یافت نشد.') +
                '</div>';
        }

        var html = '<div class="wam-payments__table-wrap">' +
            '<table class="wam-payments__table"><thead><tr>';

        html += '<th class="wam-payments__check">' +
                '<input type="checkbox" data-payments="select-all"' +
                (_getSelectedIds().length > 0 ? ' checked' : '') + '></th>';
        html += '<th>کد رسید</th>';
        html += '<th>نوع</th>';
        html += '<th>مبلغ</th>';
        html += '<th>روش</th>';
        html += '<th>متقاضی</th>';
        html += '<th>وضعیت</th>';
        html += '<th>تاریخ</th>';
        html += '<th>عملیات</th>';

        html += '</tr></thead><tbody>';

        for (var i = 0; i < items.length; i++) {
            html += _renderRow(items[i]);
        }

        html += '</tbody></table></div>';
        return html;
    }

    function _renderRow(p) {
        var st = p.status || 'pending';
        var selected = !!STATE.selectedIds[p.id];

        var html = '<tr data-payments-id="' + _esc(p.id) + '"' +
                   (selected ? ' class="is-selected"' : '') + '>';

        html += '<td><input type="checkbox" data-payments="select-row"' +
                (selected ? ' checked' : '') + '></td>';

        html += '<td><code>' + _esc(p.receiptNumber) + '</code></td>';
        html += '<td>' + _esc(_typeLabel(p.type)) + '</td>';
        html += '<td>' + _amt(p.amount) + '</td>';
        html += '<td>' + _esc(_methodLabel(p.method)) + '</td>';
        html += '<td>' + _esc(p.applicantName || '—') + '</td>';
        html += '<td><span class="wam-badge wam-badge--' + _esc(st) + '">' +
                _esc(_statusLabel(st)) + '</span></td>';
        html += '<td>' + _esc(_relTime(p.createdAt)) + '</td>';

        html += '<td class="wam-payments__actions">';
        html += '<button class="wam-btn-icon" data-payments-row-action="view" ' +
                'title="مشاهده">👁️</button>';
        if (st === 'confirmed' && canViewReceipt(p)) {
            html += '<button class="wam-btn-icon" ' +
                    'data-payments-row-action="receipt" ' +
                    'title="رسید">🧾</button>';
        }
        if (st === 'pending' && canConfirm(p)) {
            html += '<button class="wam-btn-icon" ' +
                    'data-payments-row-action="confirm" ' +
                    'title="تأیید">✅</button>';
            html += '<button class="wam-btn-icon wam-btn-icon--danger" ' +
                    'data-payments-row-action="reject" ' +
                    'title="رد">❌</button>';
        }
        if (canEdit(p)) {
            html += '<button class="wam-btn-icon" ' +
                    'data-payments-row-action="edit" title="ویرایش">✏️</button>';
        }
        if (canDelete(p)) {
            html += '<button class="wam-btn-icon wam-btn-icon--danger" ' +
                    'data-payments-row-action="delete" title="حذف">🗑️</button>';
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

        var html = '<div class="wam-payments__cards">';
        for (var i = 0; i < items.length; i++) {
            html += _renderCard(items[i]);
        }
        html += '</div>';
        return html;
    }

    function _renderCard(p) {
        var st = p.status || 'pending';
        var selected = !!STATE.selectedIds[p.id];

        return '<div class="wam-payments__card' +
            (selected ? ' is-selected' : '') +
            '" data-payments-id="' + _esc(p.id) + '">' +
            '<div class="wam-payments__card-head">' +
                '<input type="checkbox" data-payments="select-row"' +
                (selected ? ' checked' : '') + '>' +
                '<code>' + _esc(p.receiptNumber) + '</code>' +
                '<span class="wam-badge wam-badge--' + _esc(st) + '">' +
                _esc(_statusLabel(st)) + '</span>' +
            '</div>' +
            '<div class="wam-payments__card-amount">' +
                _amt(p.amount) + ' ریال' +
            '</div>' +
            '<div class="wam-payments__card-rows">' +
                '<div><span>نوع:</span> ' + _esc(_typeLabel(p.type)) + '</div>' +
                '<div><span>روش:</span> ' + _esc(_methodLabel(p.method)) + '</div>' +
                '<div><span>متقاضی:</span> ' + _esc(p.applicantName || '—') + '</div>' +
            '</div>' +
            '<div class="wam-payments__card-foot">' +
                '<span>' + _esc(_relTime(p.createdAt)) + '</span>' +
                '<div class="wam-payments__card-actions">' +
                    (st === 'pending' && canConfirm(p) ?
                        '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
                        'data-payments-row-action="confirm">✅</button>' : '') +
                    '<button class="wam-btn wam-btn--sm" ' +
                    'data-payments-row-action="view">مشاهده</button>' +
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
        var html = '<div class="wam-payments__pagination">';
        html += '<button data-payments-page="' + (p - 1) + '"' +
                (p === 1 ? ' disabled' : '') + '>‹</button>';
        var start = Math.max(1, p - 2);
        var end = Math.min(pages, p + 2);
        if (start > 1) {
            html += '<button data-payments-page="1">' + _fa(1) + '</button>';
            if (start > 2) html += '<span>…</span>';
        }
        for (var i = start; i <= end; i++) {
            html += '<button data-payments-page="' + i + '"' +
                    (i === p ? ' class="is-active"' : '') + '>' +
                    _fa(i) + '</button>';
        }
        if (end < pages) {
            if (end < pages - 1) html += '<span>…</span>';
            html += '<button data-payments-page="' + pages + '">' +
                    _fa(pages) + '</button>';
        }
        html += '<button data-payments-page="' + (p + 1) + '"' +
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
            '<div class="wam-payments">' +
                _renderStats() +
                _renderToolbar() +
                '<div class="wam-payments__body">' + body + '</div>' +
                _renderPagination(STATE.filtered.length) +
            '</div>';

        STATE.root.innerHTML = html;
        _bindEvents();

        _emit(PaymentEvents.RENDERED, {
            count: STATE.filtered.length, at: Date.now()
        });
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents() {
        if (!STATE.root) return;

        var searchEl = STATE.root.querySelector('[data-payments="search"]');
        if (searchEl) {
            searchEl.addEventListener('input', function () {
                STATE.filters.query = this.value;
                STATE.page = 1;
                render();
            });
        }

        var stEl = STATE.root.querySelector('[data-payments="filter-status"]');
        if (stEl) {
            stEl.addEventListener('change', function () {
                STATE.filters.status = this.value;
                STATE.page = 1;
                render();
            });
        }

        var mEl = STATE.root.querySelector('[data-payments="filter-method"]');
        if (mEl) {
            mEl.addEventListener('change', function () {
                STATE.filters.method = this.value;
                STATE.page = 1;
                render();
            });
        }

        var tEl = STATE.root.querySelector('[data-payments="filter-type"]');
        if (tEl) {
            tEl.addEventListener('change', function () {
                STATE.filters.type = this.value;
                STATE.page = 1;
                render();
            });
        }

        var sortEl = STATE.root.querySelector('[data-payments="sort"]');
        if (sortEl) {
            sortEl.addEventListener('change', function () {
                STATE.sort = this.value;
                render();
            });
        }

        var actionBtns = STATE.root.querySelectorAll('[data-payments-action]');
        for (var i = 0; i < actionBtns.length; i++) {
            if (actionBtns[i].dataset.bound) continue;
            actionBtns[i].addEventListener('click', _handleAction);
            actionBtns[i].dataset.bound = '1';
        }

        var selectAll = STATE.root.querySelector('[data-payments="select-all"]');
        if (selectAll) selectAll.addEventListener('change', _handleSelectAll);

        var rowChecks = STATE.root.querySelectorAll('[data-payments="select-row"]');
        for (var j = 0; j < rowChecks.length; j++) {
            rowChecks[j].addEventListener('change', _handleRowSelect);
        }

        var rowBtns = STATE.root.querySelectorAll('[data-payments-row-action]');
        for (var k = 0; k < rowBtns.length; k++) {
            rowBtns[k].addEventListener('click', _handleRowAction);
        }

        var pageBtns = STATE.root.querySelectorAll('[data-payments-page]');
        for (var m2 = 0; m2 < pageBtns.length; m2++) {
            pageBtns[m2].addEventListener('click', _handlePageClick);
        }
    }

    function _handleAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-payments-action');

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
        _emit(PaymentEvents.SELECTION, { count: _getSelectedIds().length });
    }

    function _handleRowSelect(e) {
        e.stopPropagation();
        var container = this.closest('[data-payments-id]');
        if (!container) return;
        var id = container.getAttribute('data-payments-id');
        if (this.checked) STATE.selectedIds[id] = true;
        else delete STATE.selectedIds[id];
        render();
        _emit(PaymentEvents.SELECTION, { count: _getSelectedIds().length });
    }

    function _handleRowAction(e) {
        e.preventDefault();
        e.stopPropagation();
        var action = this.getAttribute('data-payments-row-action');
        var container = this.closest('[data-payments-id]');
        if (!container) return;
        var id = container.getAttribute('data-payments-id');
        if (!id) return;

        if (action === 'view') openDetail(id);
        else if (action === 'edit') openForm(id);
        else if (action === 'confirm') _quickConfirm(id);
        else if (action === 'reject') _promptReject(id);
        else if (action === 'receipt') openReceipt(id);
        else if (action === 'delete') _confirmDelete(id);
    }

    function _handlePageClick() {
        var p = parseInt(this.getAttribute('data-payments-page'), 10);
        if (isNaN(p) || p < 1) return;
        STATE.page = p;
        render();
    }

    function _quickConfirm(id) {
        var r = confirm(id);
        if (r.ok) {
            _toast('success', 'پرداخت تأیید شد', 'موفق');
            reload();
        } else {
            _toast('error', 'خطا در تأیید', 'خطا');
        }
    }

    function _promptReject(id) {
        var reason = prompt('دلیل رد:', '');
        if (reason === null) return;
        var r = reject(id, reason);
        if (r.ok) {
            _toast('success', 'پرداخت رد شد', 'موفق');
            reload();
        } else {
            var msg = r.reason === 'reason_required'
                ? 'ذکر دلیل الزامی است'
                : 'خطا در رد';
            _toast('error', msg, 'خطا');
        }
    }

    // ─────────────────────────────────────
    // 👁️ نمایش جزئیات
    // ─────────────────────────────────────
    function openDetail(id) {
        var p = _findById(id);
        if (!p) return;

        _emit(PaymentEvents.ROW_CLICK, { id: id, action: 'view' });

        var existing = document.getElementById('wamPaymentDetailModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var modal = document.createElement('div');
        modal.id = 'wamPaymentDetailModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<div>' +
                        '<code>' + _esc(p.receiptNumber) + '</code> ' +
                        '<span class="wam-badge wam-badge--' +
                        _esc(p.status) + '">' +
                        _esc(_statusLabel(p.status)) + '</span>' +
                    '</div>' +
                    '<button type="button" class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<div class="wam-modal__body">' +
                    '<div class="wam-payments__detail-amount">' +
                        _amt(p.amount) + ' ریال' +
                    '</div>' +
                    '<div class="wam-payments__detail-grid">' +
                        _detailRow('نوع', _typeLabel(p.type)) +
                        _detailRow('روش', _methodLabel(p.method)) +
                        _detailRow('متقاضی', p.applicantName || '—') +
                        _detailRow('موبایل', p.applicantMobile || '—') +
                        _detailRow('کارگزار', p.brokerName || '—') +
                        _detailRow('شماره پیگیری', p.ref || '—') +
                        _detailRow('شناسه وام', p.loanId || '—') +
                        _detailRow('قسمت', p.installmentNumber ?
                            _fa(p.installmentNumber) : '—') +
                        _detailRow('تاریخ ثبت', _jalali(p.createdAt)) +
                        (p.confirmedAt ?
                            _detailRow('تأیید در', _jalali(p.confirmedAt)) : '') +
                        (p.confirmedByName ?
                            _detailRow('تأییدکننده', p.confirmedByName) : '') +
                        (p.rejectReason ?
                            _detailRow('دلیل رد', p.rejectReason) : '') +
                    '</div>' +
                    (p.note ?
                        '<div class="wam-payments__note">' +
                        _esc(p.note) + '</div>' : '') +
                '</div>' +
                '<footer class="wam-modal__footer">' +
                    (p.status === 'confirmed' && canViewReceipt(p) ?
                        '<button type="button" class="wam-btn wam-btn--primary" ' +
                        'data-payments-action="open-receipt" ' +
                        'data-id="' + _esc(id) + '">🧾 نمایش رسید</button>' : '') +
                    (p.status === 'pending' && canConfirm(p) ?
                        '<button type="button" class="wam-btn wam-btn--primary" ' +
                        'data-payments-action="modal-confirm" ' +
                        'data-id="' + _esc(id) + '">✅ تأیید</button>' : '') +
                    (p.status === 'pending' && canConfirm(p) ?
                        '<button type="button" class="wam-btn wam-btn--ghost ' +
                        'wam-btn--danger" data-payments-action="modal-reject" ' +
                        'data-id="' + _esc(id) + '">❌ رد</button>' : '') +
                    (p.status === 'confirmed' && canManage() ?
                        '<button type="button" class="wam-btn wam-btn--ghost" ' +
                        'data-payments-action="modal-refund" ' +
                        'data-id="' + _esc(id) + '">↩️ بازگشت</button>' : '') +
                    '<button type="button" class="wam-btn wam-btn--ghost" ' +
                    'data-close>بستن</button>' +
                '</footer>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var i = 0; i < cbs.length; i++) {
            cbs[i].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }

        var modalBtns = modal.querySelectorAll('[data-payments-action]');
        for (var j = 0; j < modalBtns.length; j++) {
            modalBtns[j].addEventListener('click', _handleModalAction);
        }
    }

    function _detailRow(label, value) {
        return '<div class="wam-payments__detail-row">' +
            '<span class="wam-payments__detail-label">' +
            _esc(label) + ':</span>' +
            '<span class="wam-payments__detail-value">' +
            _esc(value === null || value === undefined || value === '' ? '—' : value) +
            '</span></div>';
    }

    function _handleModalAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-payments-action');
        var id = this.getAttribute('data-id');

        if (a === 'open-receipt') {
            _closeModal();
            openReceipt(id);
            return;
        }
        if (a === 'modal-confirm') {
            var r = confirm(id);
            if (r.ok) {
                _toast('success', 'تأیید شد', 'موفق');
                _closeModal();
                reload();
            }
            return;
        }
        if (a === 'modal-reject') {
            var reason = prompt('دلیل رد:', '');
            if (reason === null) return;
            var r2 = reject(id, reason);
            if (r2.ok) {
                _toast('success', 'رد شد', 'موفق');
                _closeModal();
                reload();
            }
            return;
        }
        if (a === 'modal-refund') {
            var reason2 = prompt('دلیل بازگشت:', '');
            if (reason2 === null) return;
            var r3 = refund(id, reason2);
            if (r3.ok) {
                _toast('success', 'بازگشت انجام شد', 'موفق');
                _closeModal();
                reload();
            }
            return;
        }
    }

    function _closeModal() {
        var ids = ['wamPaymentDetailModal', 'wamPaymentFormModal', 'wamPaymentReceiptModal'];
        for (var i = 0; i < ids.length; i++) {
            var m = document.getElementById(ids[i]);
            if (m && m.parentNode) m.parentNode.removeChild(m);
        }
    }

    // ─────────────────────────────────────
    // 🧾 نمایش رسید
    // ─────────────────────────────────────
    function openReceipt(id) {
        var p = _findById(id);
        if (!p) return;
        if (!canViewReceipt(p)) {
            _toast('error', 'دسترسی ندارید', 'خطا');
            return;
        }

        _emit(PaymentEvents.RECEIPT_VIEWED, { paymentId: id });

        var existing = document.getElementById('wamPaymentReceiptModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var modal = document.createElement('div');
        modal.id = 'wamPaymentReceiptModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel wam-modal__panel--wide">' +
                '<header class="wam-modal__head">' +
                    '<h3>🧾 رسید پرداخت</h3>' +
                    '<button type="button" class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<div class="wam-modal__body">' +
                    '<div class="wam-receipt">' +
                        '<div class="wam-receipt__header">' +
                            '<div class="wam-receipt__brand">' +
                                '<strong>وام پی</strong>' +
                                '<small>مسیر هوشمند تأمین مالی</small>' +
                            '</div>' +
                            '<div class="wam-receipt__number">' +
                                'شماره رسید: <code>' +
                                _esc(p.receiptNumber) + '</code>' +
                            '</div>' +
                        '</div>' +

                        '<table class="wam-receipt__table">' +
                            '<tr><td>مبلغ</td><td><strong>' +
                                _amt(p.amount) + ' ریال</strong></td></tr>' +
                            '<tr><td>نوع پرداخت</td><td>' +
                                _esc(_typeLabel(p.type)) + '</td></tr>' +
                            '<tr><td>روش پرداخت</td><td>' +
                                _esc(_methodLabel(p.method)) + '</td></tr>' +
                            '<tr><td>متقاضی</td><td>' +
                                _esc(p.applicantName || '—') + '</td></tr>' +
                            '<tr><td>کارگزار</td><td>' +
                                _esc(p.brokerName || '—') + '</td></tr>' +
                            '<tr><td>تاریخ پرداخت</td><td>' +
                                _esc(_jalali(p.confirmedAt || p.createdAt)) + '</td></tr>' +
                            '<tr><td>وضعیت</td><td>' +
                                _esc(_statusLabel(p.status)) + '</td></tr>' +
                            (p.note ?
                                '<tr><td>توضیحات</td><td>' +
                                _esc(p.note) + '</td></tr>' : '') +
                        '</table>' +

                        '<div class="wam-receipt__footer">' +
                            'این رسید به‌صورت خودکار توسط سیستم وام پی صادر شده است.' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<footer class="wam-modal__footer">' +
                    '<button type="button" class="wam-btn wam-btn--primary" ' +
                    'data-payments-action="print-receipt" data-id="' +
                    _esc(id) + '">🖨️ چاپ رسید</button>' +
                    '<button type="button" class="wam-btn wam-btn--ghost" ' +
                    'data-close>بستن</button>' +
                '</footer>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var i = 0; i < cbs.length; i++) {
            cbs[i].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }

        var printBtn = modal.querySelector('[data-payments-action="print-receipt"]');
        if (printBtn) {
            printBtn.addEventListener('click', function () {
                _printReceipt(id);
            });
        }
    }

    function _printReceipt(id) {
        var p = _findById(id);
        if (!p) return;

        try {
            var win = window.open('', '_blank');
            if (!win) {
                _toast('warning', 'پاپ‌آپ مسدود شد', 'توجه');
                return;
            }
            var html = '<!DOCTYPE html><html lang="fa" dir="rtl">' +
                '<head><meta charset="UTF-8"><title>رسید ' +
                _esc(p.receiptNumber) + '</title>' +
                '<style>' +
                'body{font-family:Tahoma,sans-serif;padding:30px;line-height:1.8}' +
                'table{width:100%;border-collapse:collapse;margin:16px 0}' +
                'td{border:1px solid #ccc;padding:10px;text-align:right}' +
                '.brand{text-align:center;border-bottom:2px solid #0b3b23;padding-bottom:12px;margin-bottom:20px}' +
                '.brand h1{color:#0b3b23;margin:0}' +
                '</style></head><body>' +
                '<div class="brand"><h1>وام پی</h1>' +
                '<p>مسیر هوشمند تأمین مالی</p>' +
                '<h2>رسید پرداخت</h2></div>' +
                '<p>شماره رسید: <strong>' + _esc(p.receiptNumber) + '</strong></p>' +
                '<table>' +
                '<tr><td>مبلغ</td><td><strong>' + _amt(p.amount) + ' ریال</strong></td></tr>' +
                '<tr><td>نوع</td><td>' + _esc(_typeLabel(p.type)) + '</td></tr>' +
                '<tr><td>روش</td><td>' + _esc(_methodLabel(p.method)) + '</td></tr>' +
                '<tr><td>متقاضی</td><td>' + _esc(p.applicantName || '—') + '</td></tr>' +
                '<tr><td>تاریخ</td><td>' + _esc(_jalali(p.confirmedAt || p.createdAt)) + '</td></tr>' +
                '<tr><td>وضعیت</td><td>' + _esc(_statusLabel(p.status)) + '</td></tr>' +
                '</table>' +
                '</body></html>';
            win.document.write(html);
            win.document.close();
            setTimeout(function () {
                try { win.print(); } catch (e) { /* بی‌صدا */ }
            }, 400);
        } catch (e) { /* بی‌صدا */ }
    }

    // ─────────────────────────────────────
    // ➕ فرم ایجاد/ویرایش
    // ─────────────────────────────────────
    function openForm(id) {
        var editMode = !!id;
        var p = editMode ? _findById(id) : null;
        if (editMode && !p) return;
        if (editMode && !canEdit(p)) {
            _toast('error', 'دسترسی ندارید', 'خطا');
            return;
        }
        if (!editMode && !canCreate()) {
            _toast('error', 'دسترسی ندارید', 'خطا');
            return;
        }

        var existing = document.getElementById('wamPaymentFormModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var d = p || {};

        var typeOpts = '';
        for (var t in TYPE_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(TYPE_LABELS, t)) continue;
            typeOpts += '<option value="' + t + '"' +
                (d.type === t || (!d.type && t === 'installment') ? ' selected' : '') + '>' +
                _esc(TYPE_LABELS[t]) + '</option>';
        }

        var methodOpts = '';
        for (var m in METHOD_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(METHOD_LABELS, m)) continue;
            methodOpts += '<option value="' + m + '"' +
                (d.method === m || (!d.method && m === 'cash') ? ' selected' : '') + '>' +
                _esc(METHOD_LABELS[m]) + '</option>';
        }

        var modal = document.createElement('div');
        modal.id = 'wamPaymentFormModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>' + (editMode ? 'ویرایش پرداخت' : 'پرداخت جدید') + '</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form class="wam-modal__body">' +

                    '<div class="wam-field"><label>نوع پرداخت *</label>' +
                        '<select name="type">' + typeOpts + '</select>' +
                        '<div class="wam-field__error" data-error="type"></div></div>' +

                    '<div class="wam-field"><label>مبلغ (ریال) *</label>' +
                        '<input name="amount" inputmode="numeric" value="' +
                        _esc(String(d.amount || '')) + '" required>' +
                        '<div class="wam-field__error" data-error="amount"></div></div>' +

                    '<div class="wam-field"><label>روش پرداخت *</label>' +
                        '<select name="method">' + methodOpts + '</select>' +
                        '<div class="wam-field__error" data-error="method"></div></div>' +

                    '<div class="wam-field"><label>نام متقاضی</label>' +
                        '<input name="applicantName" value="' +
                        _esc(d.applicantName || '') + '"></div>' +

                    '<div class="wam-field"><label>موبایل متقاضی</label>' +
                        '<input name="applicantMobile" type="tel" value="' +
                        _esc(d.applicantMobile || '') + '"></div>' +

                    '<div class="wam-field"><label>شناسه وام</label>' +
                        '<input name="loanId" value="' +
                        _esc(d.loanId || '') + '"></div>' +

                    '<div class="wam-field"><label>شماره پیگیری</label>' +
                        '<input name="ref" value="' +
                        _esc(d.ref || '') + '"></div>' +

                    '<div class="wam-field"><label>یادداشت</label>' +
                        '<textarea name="note" rows="2">' +
                        _esc(d.note || '') + '</textarea></div>' +

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
            type: form.querySelector('[name="type"]').value,
            amount: form.querySelector('[name="amount"]').value.trim(),
            method: form.querySelector('[name="method"]').value,
            applicantName: form.querySelector('[name="applicantName"]').value.trim(),
            applicantMobile: form.querySelector('[name="applicantMobile"]').value.trim(),
            loanId: form.querySelector('[name="loanId"]').value.trim(),
            ref: form.querySelector('[name="ref"]').value.trim(),
            note: form.querySelector('[name="note"]').value.trim()
        };

        var res = editMode ? update(id, data) : create(data);

        if (!res.ok) {
            _showFormErrors(form, res.errors || { general: 'خطا: ' + res.reason });
            return;
        }

        var modal = document.getElementById('wamPaymentFormModal');
        if (modal && modal.parentNode) modal.parentNode.removeChild(modal);

        _toast('success', editMode ? 'پرداخت به‌روزرسانی شد' : 'پرداخت ثبت شد', 'موفق');
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
        var p = _findById(id);
        if (!p) return;
        var msg = 'پرداخت «' + p.receiptNumber + '» حذف شود؟';
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
            WamUI.confirm('حذف پرداخت', msg, { danger: true })
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
            list = STATE.payments.filter(function (p) {
                return p && options.ids.indexOf(p.id) !== -1;
            });
        } else {
            list = STATE.filtered;
        }

        if (list.length === 0) {
            _toast('warning', 'داده‌ای برای خروجی نیست', 'توجه');
            return { ok: false, reason: 'empty' };
        }

        var headers = ['کد رسید', 'نوع', 'مبلغ', 'روش', 'متقاضی',
                       'شناسه وام', 'وضعیت', 'تاریخ ثبت', 'تاریخ تأیید'];
        var rows = [headers];

        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            rows.push([
                p.receiptNumber || '',
                _typeLabel(p.type),
                String(p.amount || 0),
                _methodLabel(p.method),
                p.applicantName || '',
                p.loanId || '',
                _statusLabel(p.status),
                _jalali(p.createdAt),
                p.confirmedAt ? _jalali(p.confirmedAt) : ''
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
            _emit(PaymentEvents.EXPORTED, { count: list.length });
            return { ok: true, count: list.length };
        }

        var ts = new Date().toISOString().slice(0, 10);
        var filename = 'wampay-payments-' + ts + '.csv';

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

        _emit(PaymentEvents.EXPORTED, { count: list.length });
        _toast('success', _fa(list.length) + ' پرداخت خروجی گرفته شد', 'موفق');
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

    function resetFilters() {
        STATE.filters = { query: '', status: '', method: '', type: '' };
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
            scope !== 'mine' && scope !== 'pending') return false;
        STATE.scope = scope;
        reload();
        return true;
    }

    // ─────────────────────────────────────
    // 🔄 reload
    // ─────────────────────────────────────
    function reload() {
        var all = _loadAll();
        STATE.payments = _applyScope(_filterByRole(all));

        var valid = {};
        for (var i = 0; i < STATE.payments.length; i++) {
            if (STATE.selectedIds[STATE.payments[i].id]) {
                valid[STATE.payments[i].id] = true;
            }
        }
        STATE.selectedIds = valid;

        render();
        _emit(PaymentEvents.LOADED, {
            count: STATE.payments.length, role: STATE.role,
            scope: STATE.scope, at: Date.now()
        });
        return STATE.payments.length;
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
                       document.querySelector('.wam-payments');
            if (!root) {
                if (options.debug) console.warn('[payments] root پیدا نشد');
                return;
            }
            STATE.root = root;

            if (options.scope) STATE.scope = options.scope;
            if (options.viewMode) STATE.viewMode = options.viewMode;

            reload();
            STATE.installed = true;

            if (options.debug) {
                console.log('[payments] v' + VERSION + ' — ' +
                    STATE.role + '، ' + STATE.payments.length + ' پرداخت');
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
        STATE.payments = [];
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
            total: STATE.payments.length,
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
    var WamPayments = {
        VERSION: VERSION,
        EVENTS: PaymentEvents,
        ROOT_ATTR: ROOT_ATTR,
        PAYMENTS_KEY: PAYMENTS_KEY,
        PAGE_SIZE: PAGE_SIZE,
        STATUS_LABELS: STATUS_LABELS,
        METHODS: METHODS,
        METHOD_LABELS: METHOD_LABELS,
        TYPE_LABELS: TYPE_LABELS,
        SORT_OPTIONS: SORT_OPTIONS,
        VIEW_MODES: VIEW_MODES,

        install: install,
        uninstall: uninstall,
        reload: reload,
        render: render,

        create: create,
        update: update,
        remove: remove,

        confirm: confirm,
        reject: reject,
        refund: refund,
        cancel: cancel,

        openForm: openForm,
        openDetail: openDetail,
        openReceipt: openReceipt,

        canManage: canManage,
        canCreate: canCreate,
        canEdit: canEdit,
        canDelete: canDelete,
        canConfirm: canConfirm,
        canViewReceipt: canViewReceipt,

        setFilter: setFilter,
        resetFilters: resetFilters,
        setSort: setSort,
        setScope: setScope,

        setViewMode: function (mode) {
            if (mode !== 'table' && mode !== 'cards') return false;
            STATE.viewMode = mode;
            render();
            return true;
        },

        getPayments: function () { return STATE.payments.slice(); },
        getFiltered: function () { return STATE.filtered.slice(); },
        findById: _findById,

        computeStats: computeStats,

        selectAll: selectAll,
        clearSelection: clearSelection,
        getSelectedIds: _getSelectedIds,

        exportCSV: exportCSV,

        formatStatus: _statusLabel,
        formatMethod: _methodLabel,
        formatType: _typeLabel,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamPayments = WamPayments;
    window.PaymentEvents = PaymentEvents;

    // نصب خودکار
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-payments-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-payments')) {
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