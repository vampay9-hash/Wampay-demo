// ==========================================
// وام پی — Shared Modules
// فایل: wallet.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: کیف پول مشترک — موجودی، تراکنش‌ها، برداشت، گزارش
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION      = '1.0.0';
    var ROOT_ATTR    = 'data-wallet-root';
    var WALLETS_KEY  = 'wamPayWallets';
    var REQUESTS_KEY = 'wamPayWithdrawRequests';
    var PAGE_SIZE    = 20;

    var TX_TYPES = {
        DEPOSIT:    'deposit',      // واریز
        WITHDRAW:   'withdraw',     // برداشت
        COMMISSION: 'commission',   // پورسانت
        REFUND:     'refund',       // بازگشت وجه
        PENALTY:    'penalty',      // جریمه
        ADJUST:     'adjust'        // تعدیل
    };

    var TX_LABELS = {
        deposit:    'واریز',
        withdraw:   'برداشت',
        commission: 'پورسانت',
        refund:     'بازگشت وجه',
        penalty:    'جریمه',
        adjust:     'تعدیل'
    };

    var TX_ICONS = {
        deposit:    '⬇️',
        withdraw:   '⬆️',
        commission: '💰',
        refund:     '↩️',
        penalty:    '⚠️',
        adjust:     '🔧'
    };

    var TX_SIGNS = {
        deposit:    '+',
        withdraw:   '−',
        commission: '+',
        refund:     '+',
        penalty:    '−',
        adjust:     '±'
    };

    var REQUEST_STATUS = {
        pending:   'در انتظار',
        approved:  'تأییدشده',
        rejected:  'رد شده',
        paid:      'پرداخت شده',
        cancelled: 'لغو شده'
    };

    var MIN_WITHDRAW = 500000;   // حداقل ۵۰۰٬۰۰۰ ریال
    var IBAN_REGEX   = /^IR\d{24}$/;

    var SORT_OPTIONS = {
        newest: 'جدیدترین',
        oldest: 'قدیمی‌ترین',
        amount: 'بیشترین مبلغ'
    };

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        role: null,
        userId: null,
        ownerId: null,          // مالک کیف پول (brokerId یا userId)
        ownerType: 'broker',    // 'broker' | 'user'
        wallet: null,
        transactions: [],
        filtered: [],
        requests: [],
        page: 1,
        sort: 'newest',
        filters: {
            query: '',
            type: ''
        },
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var WalletEvents = {
        LOADED:           'wallet.loaded',
        RENDERED:         'wallet.rendered',
        TX_ADDED:         'wallet.tx_added',
        DEPOSIT:          'wallet.deposit',
        WITHDRAW_REQUEST: 'wallet.withdraw_request',
        REQUEST_APPROVED: 'wallet.request_approved',
        REQUEST_REJECTED: 'wallet.request_rejected',
        REQUEST_PAID:     'wallet.request_paid',
        REQUEST_CANCELLED:'wallet.request_cancelled',
        BALANCE_CHANGED:  'wallet.balance_changed',
        EXPORTED:         'wallet.exported',
        FILTERED:         'wallet.filtered'
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
        return (prefix || 'tx') + '_' + Date.now().toString(36) + '_' + r;
    }

    function _toast(type, msg, title) {
        if (typeof WamUI === 'undefined') return;
        if (type === 'success' && WamUI.toastSuccess) WamUI.toastSuccess(msg, title || 'موفق');
        else if (type === 'error' && WamUI.toastError) WamUI.toastError(msg, title || 'خطا');
        else if (type === 'warning' && WamUI.toastWarning) WamUI.toastWarning(msg, title || 'توجه');
        else if (type === 'info' && WamUI.toastInfo) WamUI.toastInfo(msg, title || 'اطلاع');
    }

    // ─────────────────────────────────────
    // 💾 بارگذاری / ذخیره
    // ─────────────────────────────────────
    function _loadAllWallets() {
        if (typeof Storage === 'undefined') return {};
        return Storage.getJSON(WALLETS_KEY, {}) || {};
    }

    function _saveAllWallets(all) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(WALLETS_KEY, all);
    }

    function _loadRequests() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(REQUESTS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveRequests(list) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(REQUESTS_KEY, list);
    }

    function _ensureWallet(ownerId, ownerType) {
        if (!ownerId) return null;
        var all = _loadAllWallets();
        if (!all[ownerId]) {
            all[ownerId] = {
                ownerId: ownerId,
                ownerType: ownerType || 'broker',
                balance: 0,
                totalEarned: 0,
                totalWithdrawn: 0,
                totalDeposited: 0,
                pendingWithdraw: 0,
                transactions: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            _saveAllWallets(all);
        }
        return all[ownerId];
    }

    function _persistWallet(wallet) {
        if (!wallet || !wallet.ownerId) return false;
        var all = _loadAllWallets();
        wallet.updatedAt = Date.now();
        all[wallet.ownerId] = wallet;
        return _saveAllWallets(all);
    }

    // ─────────────────────────────────────
    // 🎯 حل مالکیت کیف پول
    // ─────────────────────────────────────
    function _resolveOwner() {
        var user = _user();
        if (!user) return null;

        // اگر admin/super_admin با ownerId مشخص
        if ((user.role === 'admin' || user.role === 'super_admin') &&
            STATE.ownerId) {
            return { ownerId: STATE.ownerId, ownerType: 'broker' };
        }

        // broker → brokerId خودش
        if (user.role === 'broker') {
            var brokerId = _findBrokerIdByUser(user);
            return {
                ownerId: brokerId || user.id,
                ownerType: 'broker'
            };
        }

        // applicant → userId
        return {
            ownerId: user.id,
            ownerType: 'user'
        };
    }

    function _findBrokerIdByUser(user) {
        if (!user) return null;
        if (typeof Storage === 'undefined') return null;
        try {
            var brokers = Storage.getJSON('wamPayBrokers', []) || [];
            for (var i = 0; i < brokers.length; i++) {
                var b = brokers[i];
                if (!b) continue;
                if (b.userId && b.userId === user.id) return b.id;
                if (b.mobile && user.mobile &&
                    String(b.mobile).replace(/\D/g, '') ===
                    String(user.mobile).replace(/\D/g, '')) return b.id;
            }
        } catch (e) { /* بی‌صدا */ }
        return null;
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری
    // ─────────────────────────────────────
    function _loadWallet() {
        var owner = _resolveOwner();
        if (!owner) return null;
        STATE.ownerId = owner.ownerId;
        STATE.ownerType = owner.ownerType;
        STATE.wallet = _ensureWallet(owner.ownerId, owner.ownerType);
        STATE.transactions = STATE.wallet
            ? (STATE.wallet.transactions || []).slice() : [];
        return STATE.wallet;
    }

    function _loadMyRequests() {
        var all = _loadRequests();
        var mine = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].ownerId === STATE.ownerId) {
                mine.push(all[i]);
            }
        }
        mine.sort(function (a, b) {
            return (b.createdAt || 0) - (a.createdAt || 0);
        });
        return mine;
    }

    // ─────────────────────────────────────
    // 🎯 افزودن تراکنش (هسته)
    // ─────────────────────────────────────
    function addTransaction(data, options) {
        options = options || {};
        var result = { ok: false, reason: null, tx: null };

        if (!STATE.wallet) {
            return { ok: false, reason: 'no_wallet' };
        }
        if (!data || !data.type || !TX_LABELS[data.type]) {
            return { ok: false, reason: 'invalid_type' };
        }

        var amount = Number(_en(data.amount)) || 0;
        if (amount === 0 && data.type !== 'adjust') {
            return { ok: false, reason: 'invalid_amount' };
        }

        // بررسی موجودی کافی برای برداشت
        if (data.type === 'withdraw' && amount > 0 &&
            STATE.wallet.balance < amount && !options.force) {
            return { ok: false, reason: 'insufficient_balance' };
        }

        var user = _user();
        var tx = {
            id: _genId('tx'),
            type: data.type,
            amount: amount,
            at: data.at || Date.now(),
            by: user ? user.id : null,
            byName: user ? (user.name || user.username) : null,
            note: data.note || null,
            ref: data.ref || null,
            meta: data.meta || null
        };

        if (!Array.isArray(STATE.wallet.transactions)) {
            STATE.wallet.transactions = [];
        }
        STATE.wallet.transactions.push(tx);

        // اعمال روی موجودی
        var prevBalance = STATE.wallet.balance;
        if (data.type === 'deposit') {
            STATE.wallet.balance += amount;
            STATE.wallet.totalDeposited = (STATE.wallet.totalDeposited || 0) + amount;
        } else if (data.type === 'commission') {
            STATE.wallet.balance += amount;
            STATE.wallet.totalEarned = (STATE.wallet.totalEarned || 0) + amount;
        } else if (data.type === 'withdraw') {
            STATE.wallet.balance -= amount;
            STATE.wallet.totalWithdrawn = (STATE.wallet.totalWithdrawn || 0) + amount;
        } else if (data.type === 'refund') {
            STATE.wallet.balance += amount;
        } else if (data.type === 'penalty') {
            STATE.wallet.balance -= Math.abs(amount);
        } else if (data.type === 'adjust') {
            STATE.wallet.balance += amount;   // amount می‌تواند منفی باشد
        }

        if (!_persistWallet(STATE.wallet)) {
            return { ok: false, reason: 'storage_error' };
        }

        STATE.transactions = STATE.wallet.transactions.slice();

        _emit(WalletEvents.TX_ADDED, {
            tx: tx,
            ownerId: STATE.ownerId,
            prevBalance: prevBalance,
            newBalance: STATE.wallet.balance
        });
        _emit(WalletEvents.BALANCE_CHANGED, {
            ownerId: STATE.ownerId,
            balance: STATE.wallet.balance
        });

        result.ok = true;
        result.tx = tx;
        return result;
    }

    // ─────────────────────────────────────
    // 💰 واریز
    // ─────────────────────────────────────
    function deposit(amount, options) {
        options = options || {};
        var r = addTransaction({
            type: 'deposit',
            amount: amount,
            note: options.note || 'واریز',
            ref: options.ref || null
        });
        if (r.ok) {
            _emit(WalletEvents.DEPOSIT, {
                tx: r.tx, amount: amount
            });
        }
        return r;
    }

    // ─────────────────────────────────────
    // 💸 درخواست برداشت
    // ─────────────────────────────────────
    function requestWithdraw(amount, options) {
        options = options || {};
        var result = { ok: false, reason: null, request: null, errors: null };

        if (!STATE.wallet) return { ok: false, reason: 'no_wallet' };

        var amt = Number(_en(amount)) || 0;
        if (amt < MIN_WITHDRAW) {
            return {
                ok: false,
                reason: 'below_minimum',
                errors: { amount: 'حداقل مبلغ برداشت ' +
                          _amt(MIN_WITHDRAW) + ' ریال' }
            };
        }
        if (amt > STATE.wallet.balance) {
            return {
                ok: false,
                reason: 'insufficient_balance',
                errors: { amount: 'موجودی کافی نیست' }
            };
        }

        var iban = options.iban ? _en(options.iban).replace(/\s/g, '').toUpperCase() : null;
        if (iban && !IBAN_REGEX.test(iban)) {
            return {
                ok: false,
                reason: 'invalid_iban',
                errors: { iban: 'شبا نامعتبر (IR + ۲۴ رقم)' }
            };
        }

        var user = _user();
        var request = {
            id: _genId('req'),
            ownerId: STATE.ownerId,
            ownerType: STATE.ownerType,
            ownerName: user ? (user.name || user.username) : null,
            amount: amt,
            iban: iban,
            note: options.note || null,
            status: 'pending',
            createdAt: Date.now(),
            createdBy: user ? user.id : null,
            history: [
                { action: 'created', by: user ? user.id : null, at: Date.now() }
            ]
        };

        var all = _loadRequests();
        all.push(request);
        if (!_saveRequests(all)) {
            return { ok: false, reason: 'storage_error' };
        }

        STATE.requests = _loadMyRequests();

        // قفل موقت موجودی
        STATE.wallet.pendingWithdraw =
            (STATE.wallet.pendingWithdraw || 0) + amt;
        _persistWallet(STATE.wallet);

        _emit(WalletEvents.WITHDRAW_REQUEST, {
            request: request, amount: amt
        });

        result.ok = true;
        result.request = request;
        return result;
    }

    function cancelRequest(requestId) {
        var all = _loadRequests();
        var idx = -1;
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].id === requestId) { idx = i; break; }
        }
        if (idx === -1) return { ok: false, reason: 'not_found' };

        var req = all[idx];
        if (req.ownerId !== STATE.ownerId) {
            return { ok: false, reason: 'forbidden' };
        }
        if (req.status !== 'pending') {
            return { ok: false, reason: 'not_pending' };
        }

        req.status = 'cancelled';
        req.cancelledAt = Date.now();
        req.cancelledBy = _uid();
        if (!Array.isArray(req.history)) req.history = [];
        req.history.push({
            action: 'cancelled', by: _uid(), at: Date.now()
        });

        if (!_saveRequests(all)) {
            all.splice(idx, 1);
            return { ok: false, reason: 'storage_error' };
        }

        // آزادسازی موجودی قفل‌شده
        if (STATE.wallet) {
            STATE.wallet.pendingWithdraw = Math.max(
                0, (STATE.wallet.pendingWithdraw || 0) - req.amount
            );
            _persistWallet(STATE.wallet);
        }

        STATE.requests = _loadMyRequests();
        _emit(WalletEvents.REQUEST_CANCELLED, { requestId: requestId });
        return { ok: true, request: req };
    }

    function approveRequest(requestId) {
        if (STATE.role !== 'admin' && STATE.role !== 'super_admin') {
            return { ok: false, reason: 'forbidden' };
        }
        var all = _loadRequests();
        var idx = -1;
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].id === requestId) { idx = i; break; }
        }
        if (idx === -1) return { ok: false, reason: 'not_found' };

        var req = all[idx];
        if (req.status !== 'pending') {
            return { ok: false, reason: 'not_pending' };
        }

        req.status = 'approved';
        req.approvedAt = Date.now();
        req.approvedBy = _uid();
        if (!Array.isArray(req.history)) req.history = [];
        req.history.push({
            action: 'approved', by: _uid(), at: Date.now()
        });

        if (!_saveRequests(all)) return { ok: false, reason: 'storage_error' };

        _emit(WalletEvents.REQUEST_APPROVED, { requestId: requestId });
        return { ok: true, request: req };
    }

    function rejectRequest(requestId, reason) {
        if (STATE.role !== 'admin' && STATE.role !== 'super_admin') {
            return { ok: false, reason: 'forbidden' };
        }
        var all = _loadRequests();
        var idx = -1;
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].id === requestId) { idx = i; break; }
        }
        if (idx === -1) return { ok: false, reason: 'not_found' };

        var req = all[idx];
        if (req.status !== 'pending' && req.status !== 'approved') {
            return { ok: false, reason: 'invalid_status' };
        }

        req.status = 'rejected';
        req.rejectedAt = Date.now();
        req.rejectedBy = _uid();
        req.rejectReason = reason || null;
        if (!Array.isArray(req.history)) req.history = [];
        req.history.push({
            action: 'rejected', by: _uid(), at: Date.now(), note: reason
        });

        if (!_saveRequests(all)) return { ok: false, reason: 'storage_error' };

        // آزادسازی موجودی قفل‌شده
        var ownerWallet = _loadAllWallets()[req.ownerId];
        if (ownerWallet) {
            ownerWallet.pendingWithdraw = Math.max(
                0, (ownerWallet.pendingWithdraw || 0) - req.amount
            );
            _saveAllWallets(_loadAllWallets());
            var all2 = _loadAllWallets();
            all2[req.ownerId] = ownerWallet;
            _saveAllWallets(all2);
        }

        _emit(WalletEvents.REQUEST_REJECTED, {
            requestId: requestId, reason: reason
        });
        return { ok: true, request: req };
    }

    function markRequestPaid(requestId) {
        if (STATE.role !== 'admin' && STATE.role !== 'super_admin') {
            return { ok: false, reason: 'forbidden' };
        }
        var all = _loadRequests();
        var idx = -1;
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].id === requestId) { idx = i; break; }
        }
        if (idx === -1) return { ok: false, reason: 'not_found' };

        var req = all[idx];
        if (req.status !== 'approved') {
            return { ok: false, reason: 'not_approved' };
        }

        req.status = 'paid';
        req.paidAt = Date.now();
        req.paidBy = _uid();
        if (!Array.isArray(req.history)) req.history = [];
        req.history.push({
            action: 'paid', by: _uid(), at: Date.now()
        });

        if (!_saveRequests(all)) return { ok: false, reason: 'storage_error' };

        // کم کردن موجودی و ثبت تراکنش
        var allW = _loadAllWallets();
        var w = allW[req.ownerId];
        if (w) {
            w.balance = Math.max(0, w.balance - req.amount);
            w.totalWithdrawn = (w.totalWithdrawn || 0) + req.amount;
            w.pendingWithdraw = Math.max(
                0, (w.pendingWithdraw || 0) - req.amount
            );
            if (!Array.isArray(w.transactions)) w.transactions = [];
            w.transactions.push({
                id: _genId('tx'),
                type: 'withdraw',
                amount: req.amount,
                at: Date.now(),
                by: _uid(),
                note: 'پرداخت درخواست ' + req.id,
                ref: req.id
            });
            allW[req.ownerId] = w;
            _saveAllWallets(allW);
        }

        _emit(WalletEvents.REQUEST_PAID, { requestId: requestId });
        return { ok: true, request: req };
    }

    // ─────────────────────────────────────
    // 📊 آمار
    // ─────────────────────────────────────
    function computeStats() {
        var w = STATE.wallet || {};
        var stats = {
            balance: Number(w.balance) || 0,
            pendingWithdraw: Number(w.pendingWithdraw) || 0,
            available: Math.max(0, (Number(w.balance) || 0) -
                                   (Number(w.pendingWithdraw) || 0)),
            totalEarned: Number(w.totalEarned) || 0,
            totalWithdrawn: Number(w.totalWithdrawn) || 0,
            totalDeposited: Number(w.totalDeposited) || 0,
            txCount: (w.transactions || []).length
        };

        // آمار این ماه
        var now = new Date();
        var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        var monthIn = 0;
        var monthOut = 0;
        var txs = w.transactions || [];
        for (var i = 0; i < txs.length; i++) {
            var t = txs[i];
            if (!t || t.at < monthStart) continue;
            var ty = t.type;
            if (ty === 'deposit' || ty === 'commission' || ty === 'refund') {
                monthIn += Number(t.amount) || 0;
            } else if (ty === 'withdraw' || ty === 'penalty') {
                monthOut += Number(t.amount) || 0;
            }
        }
        stats.monthIn = monthIn;
        stats.monthOut = monthOut;

        return stats;
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر
    // ─────────────────────────────────────
    function _applyFilters() {
        var f = STATE.filters;
        var q = (f.query || '').toLowerCase().trim();

        STATE.filtered = STATE.transactions.filter(function (t) {
            if (!t) return false;
            if (f.type && t.type !== f.type) return false;
            if (q) {
                var hay = [t.type, t.note, t.ref, TX_LABELS[t.type]]
                    .filter(Boolean).join(' ').toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            return true;
        });

        _applySort();
        _emit(WalletEvents.FILTERED, {
            count: STATE.filtered.length, filters: f
        });
        return STATE.filtered;
    }

    function _applySort() {
        var s = STATE.sort;
        STATE.filtered.sort(function (a, b) {
            if (s === 'newest') {
                return (b.at || 0) - (a.at || 0);
            }
            if (s === 'oldest') {
                return (a.at || 0) - (b.at || 0);
            }
            if (s === 'amount') {
                return (Number(b.amount) || 0) - (Number(a.amount) || 0);
            }
            return 0;
        });
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت موجودی
    // ─────────────────────────────────────
    function _renderBalanceCard() {
        var s = computeStats();

        return '<div class="wam-wallet__balance">' +
            '<div class="wam-wallet__balance-main">' +
                '<div class="wam-wallet__balance-label">' +
                '💰 موجودی قابل برداشت</div>' +
                '<div class="wam-wallet__balance-value">' +
                _amt(s.available) + ' <small>ریال</small></div>' +
            '</div>' +
            (s.pendingWithdraw > 0 ?
                '<div class="wam-wallet__balance-pending">' +
                'قفل‌شده (در انتظار): ' + _amt(s.pendingWithdraw) + ' ریال' +
                '</div>' : '') +
            '<div class="wam-wallet__balance-actions">' +
                (STATE.role === 'admin' || STATE.role === 'super_admin' ?
                    '<button class="wam-btn wam-btn--primary" ' +
                    'data-wallet-action="deposit">⬇️ واریز</button>' : '') +
                (s.available >= MIN_WITHDRAW ?
                    '<button class="wam-btn wam-btn--ghost" ' +
                    'data-wallet-action="withdraw">⬆️ درخواست برداشت</button>' : '') +
                '<button class="wam-btn wam-btn--ghost" ' +
                'data-wallet-action="refresh">🔄</button>' +
            '</div>' +
        '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت‌های آمار
    // ─────────────────────────────────────
    function _renderStatCards() {
        var s = computeStats();
        return '<div class="wam-wallet__stats-grid">' +
            _statCard('کل درآمد', s.totalEarned, '💰', 'success') +
            _statCard('کل برداشت', s.totalWithdrawn, '⬆️', 'warning') +
            _statCard('این ماه (ورودی)', s.monthIn, '📅', 'info') +
            _statCard('این ماه (خروجی)', s.monthOut, '📉', '') +
        '</div>';
    }

    function _statCard(label, value, icon, accent) {
        accent = accent || '';
        return '<div class="wam-stat' +
               (accent ? ' wam-stat--' + accent : '') + '">' +
               '<div class="wam-stat__icon">' + icon + '</div>' +
               '<div class="wam-stat__body">' +
               '<div class="wam-stat__value">' + _amt(value) + '</div>' +
               '<div class="wam-stat__label">' + _esc(label) + '</div>' +
               '</div></div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ردیف تراکنش
    // ─────────────────────────────────────
    function _renderTxRow(t) {
        if (!t) return '';
        var type = t.type || 'adjust';
        var label = TX_LABELS[type] || type;
        var icon = TX_ICONS[type] || '•';
        var sign = TX_SIGNS[type] || '';
        var isOut = (type === 'withdraw' || type === 'penalty');
        var amountClass = isOut ? 'wam-danger' : 'wam-success';

        return '<li class="wam-wallet__tx" data-tx-id="' +
               _esc(t.id) + '">' +
               '<div class="wam-wallet__tx-icon">' + icon + '</div>' +
               '<div class="wam-wallet__tx-body">' +
                   '<div class="wam-wallet__tx-label">' +
                   _esc(label) + '</div>' +
                   '<div class="wam-wallet__tx-meta">' +
                       _esc(_jalali(t.at)) +
                       (t.byName ? ' · ' + _esc(t.byName) : '') +
                   '</div>' +
                   (t.note ? '<div class="wam-wallet__tx-note">' +
                    _esc(t.note) + '</div>' : '') +
               '</div>' +
               '<div class="wam-wallet__tx-amount ' + amountClass + '">' +
                   sign + ' ' + _amt(t.amount) +
               '</div>' +
               '</li>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — لیست تراکنش‌ها
    // ─────────────────────────────────────
    function _renderTransactionsList() {
        var list = STATE.filtered;
        if (list.length === 0) {
            return '<div class="wam-empty">' +
                (STATE.transactions.length === 0
                    ? 'هنوز تراکنشی ثبت نشده است.'
                    : 'نتیجه‌ای برای فیلتر فعلی یافت نشد.') +
                '</div>';
        }

        var start = (STATE.page - 1) * PAGE_SIZE;
        var end = Math.min(start + PAGE_SIZE, list.length);
        var items = list.slice(start, end);

        var html = '<ul class="wam-wallet__tx-list">';
        for (var i = 0; i < items.length; i++) {
            html += _renderTxRow(items[i]);
        }
        html += '</ul>';

        // صفحه‌بندی
        var pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
        if (pages > 1) {
            html += '<div class="wam-wallet__pagination">';
            html += '<button ' + (STATE.page === 1 ? 'disabled' : '') +
                    ' data-wallet-page="' + (STATE.page - 1) + '">‹</button>';
            html += '<span>صفحه ' + _fa(STATE.page) + ' از ' +
                    _fa(pages) + '</span>';
            html += '<button ' + (STATE.page === pages ? 'disabled' : '') +
                    ' data-wallet-page="' + (STATE.page + 1) + '">›</button>';
            html += '</div>';
        }

        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — درخواست‌های برداشت
    // ─────────────────────────────────────
    function _renderRequestsSection() {
        if (STATE.requests.length === 0) return '';

        var html = '<section class="wam-wallet__section">' +
                   '<h3>💸 درخواست‌های برداشت</h3>';
        html += '<ul class="wam-wallet__requests">';

        for (var i = 0; i < STATE.requests.length; i++) {
            var r = STATE.requests[i];
            var stLabel = REQUEST_STATUS[r.status] || r.status;

            html += '<li class="wam-wallet__request is-' + _esc(r.status) + '">' +
                '<div class="wam-wallet__request-head">' +
                    '<span class="wam-badge wam-badge--' + _esc(r.status) + '">' +
                    _esc(stLabel) + '</span>' +
                    '<span class="wam-wallet__request-time">' +
                    _esc(_relTime(r.createdAt)) + '</span>' +
                '</div>' +
                '<div class="wam-wallet__request-body">' +
                    '<div class="wam-wallet__request-amount">' +
                    _amt(r.amount) + ' ریال</div>' +
                    (r.iban ?
                        '<div class="wam-wallet__request-iban">' +
                        _esc(r.iban) + '</div>' : '') +
                '</div>';

            if (r.status === 'pending' && r.ownerId === STATE.ownerId) {
                html += '<div class="wam-wallet__request-actions">' +
                    '<button class="wam-btn wam-btn--sm wam-btn--ghost ' +
                    'wam-btn--danger" data-wallet-action="cancel-request" ' +
                    'data-id="' + _esc(r.id) + '">لغو</button>' +
                    '</div>';
            }

            if ((r.status === 'pending' || r.status === 'approved') &&
                (STATE.role === 'admin' || STATE.role === 'super_admin')) {
                html += '<div class="wam-wallet__request-actions">';
                if (r.status === 'pending') {
                    html += '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
                            'data-wallet-action="approve-request" data-id="' +
                            _esc(r.id) + '">تأیید</button>';
                }
                if (r.status === 'approved') {
                    html += '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
                            'data-wallet-action="mark-paid" data-id="' +
                            _esc(r.id) + '">پرداخت شد</button>';
                }
                html += '<button class="wam-btn wam-btn--sm wam-btn--ghost ' +
                        'wam-btn--danger" data-wallet-action="reject-request" ' +
                        'data-id="' + _esc(r.id) + '">رد</button>';
                html += '</div>';
            }

            html += '</li>';
        }
        html += '</ul></section>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;

        if (!STATE.wallet) {
            STATE.root.innerHTML = '<div class="wam-empty">' +
                'کیف پول یافت نشد.</div>';
            return;
        }

        _applyFilters();

        var html = '<div class="wam-wallet">' +
            _renderBalanceCard() +
            _renderStatCards() +

            '<section class="wam-wallet__section">' +
                '<header class="wam-wallet__section-head">' +
                    '<h3>📜 تراکنش‌ها</h3>' +
                    '<div class="wam-wallet__filters">' +
                        '<input type="search" data-wallet="search" ' +
                        'placeholder="جستجو..." value="' +
                        _esc(STATE.filters.query) + '">' +
                        '<select data-wallet="filter-type">' +
                        '<option value="">همه انواع</option>' +
                        '<option value="deposit">واریز</option>' +
                        '<option value="withdraw">برداشت</option>' +
                        '<option value="commission">پورسانت</option>' +
                        '<option value="refund">بازگشت</option>' +
                        '<option value="penalty">جریمه</option>' +
                        '<option value="adjust">تعدیل</option>' +
                        '</select>' +
                        '<button class="wam-btn-icon" ' +
                        'data-wallet-action="export">📤</button>' +
                    '</div>' +
                '</header>' +
                _renderTransactionsList() +
            '</section>' +

            _renderRequestsSection() +
        '</div>';

        STATE.root.innerHTML = html;
        _bindEvents();

        _emit(WalletEvents.RENDERED, { at: Date.now() });
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents() {
        if (!STATE.root) return;

        var actionBtns = STATE.root.querySelectorAll('[data-wallet-action]');
        for (var i = 0; i < actionBtns.length; i++) {
            if (actionBtns[i].dataset.bound) continue;
            actionBtns[i].addEventListener('click', _handleAction);
            actionBtns[i].dataset.bound = '1';
        }

        var searchEl = STATE.root.querySelector('[data-wallet="search"]');
        if (searchEl && !searchEl.dataset.bound) {
            searchEl.addEventListener('input', function () {
                STATE.filters.query = this.value;
                STATE.page = 1;
                render();
            });
            searchEl.dataset.bound = '1';
        }

        var typeEl = STATE.root.querySelector('[data-wallet="filter-type"]');
        if (typeEl && !typeEl.dataset.bound) {
            typeEl.addEventListener('change', function () {
                STATE.filters.type = this.value;
                STATE.page = 1;
                render();
            });
            typeEl.dataset.bound = '1';
        }

        var pageBtns = STATE.root.querySelectorAll('[data-wallet-page]');
        for (var j = 0; j < pageBtns.length; j++) {
            if (pageBtns[j].dataset.bound) continue;
            pageBtns[j].addEventListener('click', function () {
                var p = parseInt(this.getAttribute('data-wallet-page'), 10);
                if (!isNaN(p) && p >= 1) {
                    STATE.page = p;
                    render();
                }
            });
            pageBtns[j].dataset.bound = '1';
        }
    }

    function _handleAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-wallet-action');
        var id = this.getAttribute('data-id');

        if (a === 'refresh') { reload(); _toast('success', 'بروزرسانی شد', 'موفق'); return; }
        if (a === 'export') { exportCSV(); return; }
        if (a === 'deposit') { openDepositModal(); return; }
        if (a === 'withdraw') { openWithdrawModal(); return; }
        if (a === 'cancel-request') { _handleCancelRequest(id); return; }
        if (a === 'approve-request') { _handleApproveRequest(id); return; }
        if (a === 'reject-request') { _handleRejectRequest(id); return; }
        if (a === 'mark-paid') { _handleMarkPaid(id); return; }
    }

    function _handleCancelRequest(id) {
        var r = cancelRequest(id);
        if (r.ok) {
            _toast('success', 'درخواست لغو شد', 'موفق');
            reload();
        } else {
            _toast('error', 'خطا در لغو', 'خطا');
        }
    }

    function _handleApproveRequest(id) {
        var r = approveRequest(id);
        if (r.ok) {
            _toast('success', 'درخواست تأیید شد', 'موفق');
            reload();
        } else {
            _toast('error', 'خطا در تأیید', 'خطا');
        }
    }

    function _handleRejectRequest(id) {
        var reason = prompt('دلیل رد:', '');
        if (reason === null) return;
        var r = rejectRequest(id, reason);
        if (r.ok) {
            _toast('success', 'درخواست رد شد', 'موفق');
            reload();
        } else {
            _toast('error', 'خطا در رد', 'خطا');
        }
    }

    function _handleMarkPaid(id) {
        var r = markRequestPaid(id);
        if (r.ok) {
            _toast('success', 'پرداخت ثبت شد', 'موفق');
            reload();
        } else {
            _toast('error', 'خطا', 'خطا');
        }
    }

    // ─────────────────────────────────────
    // 💰 modal واریز
    // ─────────────────────────────────────
    function openDepositModal() {
        if (STATE.role !== 'admin' && STATE.role !== 'super_admin') {
            _toast('error', 'دسترسی ندارید', 'خطا');
            return;
        }

        var existing = document.getElementById('wamWalletDepositModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var modal = document.createElement('div');
        modal.id = 'wamWalletDepositModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>⬇️ واریز به کیف پول</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form class="wam-modal__body">' +
                    '<div class="wam-field"><label>مبلغ (ریال) *</label>' +
                        '<input name="amount" inputmode="numeric" required>' +
                        '<div class="wam-field__error" data-error="amount"></div></div>' +
                    '<div class="wam-field"><label>شماره پیگیری</label>' +
                        '<input name="ref" placeholder="اختیاری"></div>' +
                    '<div class="wam-field"><label>یادداشت</label>' +
                        '<textarea name="note" rows="2"></textarea></div>' +
                    '<footer class="wam-modal__footer">' +
                        '<button type="button" class="wam-btn wam-btn--ghost" ' +
                        'data-close>انصراف</button>' +
                        '<button type="submit" class="wam-btn wam-btn--primary">' +
                        'ثبت</button>' +
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
            var amount = form.querySelector('[name="amount"]').value;
            var ref = form.querySelector('[name="ref"]').value.trim() || null;
            var note = form.querySelector('[name="note"]').value.trim() || null;

            var r = deposit(amount, { ref: ref, note: note });
            if (r.ok) {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
                _toast('success', 'واریز ثبت شد', 'موفق');
                reload();
            } else {
                var err = form.querySelector('[data-error="amount"]');
                if (err) { err.textContent = 'مبلغ نامعتبر'; err.style.display = 'block'; }
            }
        });
    }

    // ─────────────────────────────────────
    // 💸 modal درخواست برداشت
    // ─────────────────────────────────────
    function openWithdrawModal() {
        var s = computeStats();
        if (s.available < MIN_WITHDRAW) {
            _toast('warning',
                'حداقل موجودی برای برداشت ' + _amt(MIN_WITHDRAW) + ' ریال است',
                'توجه');
            return;
        }

        var existing = document.getElementById('wamWalletWithdrawModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var modal = document.createElement('div');
        modal.id = 'wamWalletWithdrawModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>⬆️ درخواست برداشت</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form class="wam-modal__body">' +
                    '<div class="wam-wallet__withdraw-info">' +
                        '<div><span>موجودی قابل برداشت:</span> <strong>' +
                        _amt(s.available) + ' ریال</strong></div>' +
                        '<div><span>حداقل:</span> ' +
                        _amt(MIN_WITHDRAW) + ' ریال</div>' +
                    '</div>' +
                    '<div class="wam-field"><label>مبلغ برداشت (ریال) *</label>' +
                        '<input name="amount" inputmode="numeric" required>' +
                        '<div class="wam-field__error" data-error="amount"></div></div>' +
                    '<div class="wam-field"><label>شماره شبا (اختیاری)</label>' +
                        '<input name="iban" placeholder="IR...">' +
                        '<div class="wam-field__error" data-error="iban"></div></div>' +
                    '<div class="wam-field"><label>یادداشت</label>' +
                        '<textarea name="note" rows="2"></textarea></div>' +
                    '<footer class="wam-modal__footer">' +
                        '<button type="button" class="wam-btn wam-btn--ghost" ' +
                        'data-close>انصراف</button>' +
                        '<button type="submit" class="wam-btn wam-btn--primary">' +
                        'ارسال درخواست</button>' +
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
                iban: form.querySelector('[name="iban"]').value.trim(),
                note: form.querySelector('[name="note"]').value.trim()
            };

            var r = requestWithdraw(data.amount, {
                iban: data.iban, note: data.note
            });

            if (r.ok) {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
                _toast('success',
                    'درخواست برداشت ثبت شد (در انتظار تأیید)',
                    'موفق');
                reload();
            } else if (r.errors) {
                for (var k in r.errors) {
                    if (!Object.prototype.hasOwnProperty.call(r.errors, k)) continue;
                    var el = form.querySelector('[data-error="' + k + '"]');
                    if (el) { el.textContent = r.errors[k]; el.style.display = 'block'; }
                }
            }
        });
    }

    // ─────────────────────────────────────
    // 📤 خروجی CSV
    // ─────────────────────────────────────
    function exportCSV() {
        var list = STATE.filtered.length > 0
            ? STATE.filtered : STATE.transactions;

        if (list.length === 0) {
            _toast('warning', 'تراکنشی برای خروجی نیست', 'توجه');
            return { ok: false, reason: 'empty' };
        }

        var headers = ['تاریخ', 'نوع', 'مبلغ', 'توضیحات', 'شناسه'];
        var rows = [headers];
        for (var i = 0; i < list.length; i++) {
            var t = list[i];
            rows.push([
                _jalali(t.at),
                TX_LABELS[t.type] || t.type,
                String(t.amount || 0),
                t.note || '',
                t.id || ''
            ]);
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
            return { ok: true, count: list.length };
        }

        var ts = new Date().toISOString().slice(0, 10);
        var filename = 'wampay-wallet-' + ts + '.csv';

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

        _emit(WalletEvents.EXPORTED, { count: list.length });
        _toast('success', _fa(list.length) + ' تراکنش خروجی گرفته شد', 'موفق');
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
        STATE.filters = { query: '', type: '' };
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

    function setOwner(ownerId, ownerType) {
        STATE.ownerId = ownerId;
        STATE.ownerType = ownerType || 'broker';
        reload();
        return true;
    }

    // ─────────────────────────────────────
    // 🔄 reload
    // ─────────────────────────────────────
    function reload() {
        _loadWallet();
        STATE.requests = _loadMyRequests();
        STATE.page = 1;
        render();
        _emit(WalletEvents.LOADED, {
            ownerId: STATE.ownerId,
            balance: STATE.wallet ? STATE.wallet.balance : 0,
            txCount: STATE.transactions.length,
            requestCount: STATE.requests.length,
            at: Date.now()
        });
        return STATE.transactions.length;
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

            if (options.ownerId) STATE.ownerId = options.ownerId;
            if (options.ownerType) STATE.ownerType = options.ownerType;

            var root = options.root ||
                       document.querySelector('[' + ROOT_ATTR + ']') ||
                       document.querySelector('.wam-wallet');
            if (!root) {
                if (options.debug) console.warn('[wallet] root پیدا نشد');
                return;
            }
            STATE.root = root;

            reload();
            STATE.installed = true;

            if (options.debug) {
                console.log('[wallet] v' + VERSION + ' — ' +
                    STATE.role + '، ownerId: ' + STATE.ownerId);
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
        STATE.installed = false;
        STATE.wallet = null;
        STATE.transactions = [];
        STATE.filtered = [];
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            version: VERSION,
            installed: STATE.installed,
            role: STATE.role,
            ownerId: STATE.ownerId,
            ownerType: STATE.ownerType,
            hasWallet: !!STATE.wallet,
            balance: STATE.wallet ? STATE.wallet.balance : 0,
            txCount: STATE.transactions.length,
            filteredCount: STATE.filtered.length,
            requestCount: STATE.requests.length,
            page: STATE.page,
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
    var WamWallet = {
        VERSION: VERSION,
        EVENTS: WalletEvents,
        ROOT_ATTR: ROOT_ATTR,
        WALLETS_KEY: WALLETS_KEY,
        REQUESTS_KEY: REQUESTS_KEY,
        PAGE_SIZE: PAGE_SIZE,
        MIN_WITHDRAW: MIN_WITHDRAW,
        TX_TYPES: TX_TYPES,
        TX_LABELS: TX_LABELS,
        REQUEST_STATUS: REQUEST_STATUS,
        SORT_OPTIONS: SORT_OPTIONS,

        install: install,
        uninstall: uninstall,
        reload: reload,
        render: render,

        // تراکنش
        addTransaction: addTransaction,
        deposit: deposit,

        // برداشت
        requestWithdraw: requestWithdraw,
        cancelRequest: cancelRequest,
        approveRequest: approveRequest,
        rejectRequest: rejectRequest,
        markRequestPaid: markRequestPaid,

        // UI
        openDepositModal: openDepositModal,
        openWithdrawModal: openWithdrawModal,

        // فیلتر
        setFilter: setFilter,
        resetFilters: resetFilters,
        setSort: setSort,
        setOwner: setOwner,

        // داده
        getWallet: function () { return STATE.wallet; },
        getTransactions: function () { return STATE.transactions.slice(); },
        getFiltered: function () { return STATE.filtered.slice(); },
        getRequests: function () { return STATE.requests.slice(); },
        computeStats: computeStats,

        // خروجی
        exportCSV: exportCSV,

        // کمکی
        formatAmount: _amt,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamWallet = WamWallet;
    window.WalletSharedEvents = WalletEvents;

    // نصب خودکار
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-wallet-shared-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-wallet-shared')) {
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