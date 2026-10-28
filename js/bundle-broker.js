/* ==========================================
 * WAM PAY — 💼 Broker Bundle
 * ==========================================
 * 
 * Bundle خودکار
 * تعداد فایل: 10
 * تاریخ تولید: 2026-09-22T18:53:12.961Z
 * 
 * این فایل به صورت خودکار از چند فایل جداگانه
 * ادغام شده است. تغییرات مستقیم در این فایل
 * با اجرای بعدی Builder پاک می‌شوند.
 * ========================================== */




/* ==========================================
 * FROM: js/broker-wallet.js
 * ========================================== */


// ==========================================
// وام پی — Broker Panel
// فایل: broker-wallet.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: کیف پول کارگزار — موجودی، تراکنش‌ها، برداشت، گزارش
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var WALLETS_KEY  = 'wamPayWallets';
    var BROKERS_KEY  = 'wamPayBrokers';
    var PAGE_SIZE    = 15;
    var MIN_WITHDRAW = 500000;    // حداقل برداشت (ریال)
    var IBAN_REGEX   = /^IR\d{24}$/;

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

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        form: null,
        broker: null,
        wallet: null,
        transactions: [],
        filtered: [],
        page: 1,
        query: '',
        typeFilter: '',
        submitting: false,
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var WalletEvents = {
        LOADED:       'broker.wallet.loaded',
        WITHDRAW_REQ: 'broker.wallet.withdraw_requested',
        DEPOSIT_REQ:  'broker.wallet.deposit_requested',
        TX_ADDED:     'broker.wallet.tx_added',
        FILTERED:     'broker.wallet.filtered',
        ERROR:        'broker.wallet.error'
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
        if (n === null || n === undefined || n === '') return '۰';
        var num = Number(n);
        if (isNaN(num)) return '۰';
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

    function _toEnglish(str) {
        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.toEnglishDigits) {
            return WamPersianDate.toEnglishDigits(str);
        }
        return String(str || '').replace(/[۰-۹]/g, function (d) {
            return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
        });
    }

    function _currentUserId() {
        if (typeof WamPermissions === 'undefined') return null;
        var me = WamPermissions.getCurrentUser();
        return me ? me.id : null;
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری
    // ─────────────────────────────────────
    function _loadAllWallets() {
        if (typeof Storage === 'undefined') return {};
        return Storage.getJSON(WALLETS_KEY, {}) || {};
    }

    function _saveAllWallets(wallets) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(WALLETS_KEY, wallets);
    }

    function _loadBroker() {
        if (typeof Storage === 'undefined') return null;
        var brokers = Storage.getJSON(BROKERS_KEY, []) || [];
        var user = (typeof WamPermissions !== 'undefined')
            ? WamPermissions.getCurrentUser() : null;
        if (!user) return null;

        for (var i = 0; i < brokers.length; i++) {
            var b = brokers[i];
            if (!b) continue;
            if (b.userId && b.userId === user.id) return b;
            if (b.mobile && user.mobile &&
                String(b.mobile).replace(/\D/g, '') ===
                String(user.mobile).replace(/\D/g, '')) return b;
        }
        return null;
    }

    function _ensureWallet(broker) {
        if (!broker) return null;
        var wallets = _loadAllWallets();
        if (!wallets[broker.id]) {
            wallets[broker.id] = {
                brokerId: broker.id,
                balance: 0,
                totalEarned: 0,
                totalWithdrawn: 0,
                totalDeposited: 0,
                transactions: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            _saveAllWallets(wallets);
        }
        return wallets[broker.id];
    }

    function _persistWallet(wallet) {
        if (!wallet || !wallet.brokerId) return false;
        var wallets = _loadAllWallets();
        wallet.updatedAt = Date.now();
        wallets[wallet.brokerId] = wallet;
        return _saveAllWallets(wallets);
    }

    // ─────────────────────────────────────
    // 📊 آمار
    // ─────────────────────────────────────
    function computeStats() {
        var w = STATE.wallet || {};
        var stats = {
            balance: Number(w.balance) || 0,
            totalEarned: Number(w.totalEarned) || 0,
            totalWithdrawn: Number(w.totalWithdrawn) || 0,
            totalDeposited: Number(w.totalDeposited) || 0,
            txCount: (w.transactions || []).length
        };

        // آمار این ماه
        var now = new Date();
        var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        var monthEarned = 0;
        var monthWithdrawn = 0;
        var txs = w.transactions || [];
        for (var i = 0; i < txs.length; i++) {
            var t = txs[i];
            if (!t || t.at < monthStart) continue;
            if (t.type === 'commission') monthEarned += Number(t.amount) || 0;
            if (t.type === 'withdraw') monthWithdrawn += Number(t.amount) || 0;
        }
        stats.monthEarned = monthEarned;
        stats.monthWithdrawn = monthWithdrawn;

        return stats;
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر تراکنش‌ها
    // ─────────────────────────────────────
    function _applyFilters() {
        var q = (STATE.query || '').toLowerCase().trim();
        var tf = STATE.typeFilter;

        STATE.filtered = STATE.transactions.filter(function (t) {
            if (!t) return false;
            if (tf && t.type !== tf) return false;
            if (q) {
                var hay = [t.type, t.note, t.ref, t.amount]
                    .filter(Boolean).join(' ').toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            return true;
        });

        // مرتب‌سازی: جدیدترین‌ها
        STATE.filtered.sort(function (a, b) {
            return (b.at || 0) - (a.at || 0);
        });

        _emit(WalletEvents.FILTERED, {
            count: STATE.filtered.length,
            at: Date.now()
        });
        return STATE.filtered;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت موجودی
    // ─────────────────────────────────────
    function _renderBalanceCard() {
        var s = computeStats();
        return '' +
            '<div class="wam-wallet-balance">' +
                '<div class="wam-wallet-balance__label">💰 موجودی قابل برداشت</div>' +
                '<div class="wam-wallet-balance__amount">' +
                    _formatAmount(s.balance) + ' <small>ریال</small>' +
                '</div>' +
                '<div class="wam-wallet-balance__actions">' +
                    '<button class="wam-btn wam-btn--primary" ' +
                    'data-wallet-action="withdraw">' +
                    '⬆️ درخواست برداشت' +
                    '</button>' +
                    '<button class="wam-btn wam-btn--ghost" ' +
                    'data-wallet-action="refresh">' +
                    '🔄 بروزرسانی' +
                    '</button>' +
                '</div>' +
            '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت‌های آمار
    // ─────────────────────────────────────
    function _renderStatsCards() {
        var s = computeStats();
        var html = '<div class="wam-wallet-stats-grid">';
        html += _statCard('کل درآمد', s.totalEarned, '💰', 'success');
        html += _statCard('کل برداشت', s.totalWithdrawn, '⬆️', 'warning');
        html += _statCard('این ماه', s.monthEarned, '📅', 'info');
        html += _statCard('تعداد تراکنش', s.txCount, '📊');
        html += '</div>';
        return html;
    }

    function _statCard(label, value, icon, accent) {
        accent = accent || '';
        return '<div class="wam-stat' +
               (accent ? ' wam-stat--' + accent : '') + '">' +
               '<div class="wam-stat__icon">' + icon + '</div>' +
               '<div class="wam-stat__body">' +
               '<div class="wam-stat__value">' + _formatAmount(value) + '</div>' +
               '<div class="wam-stat__label">' + _escapeHtml(label) + '</div>' +
               '</div></div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ردیف تراکنش
    // ─────────────────────────────────────
    function _renderTxRow(t) {
        var type = t.type || 'adjust';
        var label = TX_LABELS[type] || type;
        var icon = TX_ICONS[type] || '•';
        var isDebit = (type === 'withdraw' || type === 'penalty');
        var amountClass = isDebit ? 'wam-danger' : 'wam-success';
        var sign = isDebit ? '−' : '+';

        return '<div class="wam-tx-row" data-tx-id="' +
               _escapeHtml(t.id || '') + '">' +
               '<div class="wam-tx-row__icon">' + icon + '</div>' +
               '<div class="wam-tx-row__body">' +
                   '<div class="wam-tx-row__label">' + _escapeHtml(label) + '</div>' +
                   '<div class="wam-tx-row__meta">' +
                       (t.ref ? '<code>' + _escapeHtml(t.ref) + '</code> · ' : '') +
                       _escapeHtml(_jalali(t.at)) +
                   '</div>' +
                   (t.note ? '<div class="wam-tx-row__note">' +
                    _escapeHtml(t.note) + '</div>' : '') +
               '</div>' +
               '<div class="wam-tx-row__amount ' + amountClass + '">' +
                   sign + ' ' + _formatAmount(t.amount) +
               '</div>' +
               '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — لیست تراکنش‌ها
    // ─────────────────────────────────────
    function _renderTxList() {
        if (!STATE.root) return;
        var box = STATE.root.querySelector('[data-wallet="tx-list"]');
        if (!box) return;

        var list = STATE.filtered;
        var start = (STATE.page - 1) * PAGE_SIZE;
        var end = Math.min(start + PAGE_SIZE, list.length);
        var items = list.slice(start, end);

        if (items.length === 0) {
            box.innerHTML = '<div class="wam-empty">' +
                (STATE.transactions.length === 0
                    ? 'هنوز تراکنشی ثبت نشده است.'
                    : 'نتیجه‌ای برای فیلتر فعلی یافت نشد.') +
                '</div>';
            return;
        }

        var html = '<div class="wam-tx-list">';
        for (var i = 0; i < items.length; i++) {
            html += _renderTxRow(items[i]);
        }
        html += '</div>';

        // صفحه‌بندی
        var totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
        if (totalPages > 1) {
            html += '<div class="wam-pagination">';
            html += '<button ' + (STATE.page === 1 ? 'disabled' : '') +
                    ' data-wallet-page="' + (STATE.page - 1) + '">‹</button>';
            html += '<span>صفحه ' + _formatNumber(STATE.page) +
                    ' از ' + _formatNumber(totalPages) + '</span>';
            html += '<button ' + (STATE.page === totalPages ? 'disabled' : '') +
                    ' data-wallet-page="' + (STATE.page + 1) + '">›</button>';
            html += '</div>';
        }

        box.innerHTML = html;

        // بایند
        var pageBtns = box.querySelectorAll('[data-wallet-page]');
        for (var j = 0; j < pageBtns.length; j++) {
            pageBtns[j].addEventListener('click', function () {
                var p = parseInt(this.getAttribute('data-wallet-page'), 10);
                if (!isNaN(p) && p >= 1 && p <= totalPages) {
                    STATE.page = p;
                    _renderTxList();
                }
            });
        }
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;

        _applyFilters();

        var balanceBox = STATE.root.querySelector('[data-wallet="balance"]');
        if (balanceBox) balanceBox.innerHTML = _renderBalanceCard();

        var statsBox = STATE.root.querySelector('[data-wallet="stats"]');
        if (statsBox) statsBox.innerHTML = _renderStatsCards();

        _renderTxList();
        _bindActions();

        // آخرین بروزرسانی
        var updEl = STATE.root.querySelector('[data-wallet="updated-at"]');
        if (updEl) {
            updEl.textContent = 'آخرین بروزرسانی: ' + _relativeTime(Date.now());
        }
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindActions() {
        if (!STATE.root) return;

        var btns = STATE.root.querySelectorAll('[data-wallet-action]');
        for (var i = 0; i < btns.length; i++) {
            if (btns[i].dataset.bound) continue;
            btns[i].addEventListener('click', _handleAction);
            btns[i].dataset.bound = '1';
        }

        var searchEl = STATE.root.querySelector('[data-wallet="search"]');
        if (searchEl && !searchEl.dataset.bound) {
            searchEl.addEventListener('input', function () {
                STATE.query = this.value;
                STATE.page = 1;
                _renderTxList();
            });
            searchEl.dataset.bound = '1';
        }

        var typeEl = STATE.root.querySelector('[data-wallet="filter-type"]');
        if (typeEl && !typeEl.dataset.bound) {
            typeEl.addEventListener('change', function () {
                STATE.typeFilter = this.value;
                STATE.page = 1;
                _applyFilters();
                _renderTxList();
            });
            typeEl.dataset.bound = '1';
        }
    }

    function _handleAction(e) {
        e.preventDefault();
        var action = this.getAttribute('data-wallet-action');

        if (action === 'refresh') {
            reload();
            if (typeof WamUI !== 'undefined') {
                WamUI.toastSuccess('بروزرسانی شد', 'موفق');
            }
            return;
        }
        if (action === 'withdraw') {
            openWithdrawModal();
            return;
        }
        if (action === 'deposit') {
            openDepositInfo();
            return;
        }
    }

    // ─────────────────────────────────────
    // 💸 درخواست برداشت
    // ─────────────────────────────────────
    function requestWithdraw(data) {
        var result = { ok: false, reason: null, tx: null, errors: null };

        var w = STATE.wallet;
        if (!w) {
            result.reason = 'no_wallet';
            return result;
        }

        var errors = _validateWithdraw(data);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        var amount = Number(_toEnglish(data.amount));
        if (amount > w.balance) {
            result.reason = 'insufficient';
            result.errors = { amount: 'موجودی کافی نیست' };
            return result;
        }

        var tx = {
            id: 'tx_' + Date.now().toString(36) + '_' +
                Math.random().toString(36).slice(2, 6),
            type: 'withdraw',
            amount: amount,
            at: Date.now(),
            by: _currentUserId(),
            note: data.note || null,
            ref: 'WTH-' + Math.floor(Math.random() * 999999),
            status: 'pending',
            iban: data.iban || null
        };

        // ثبت به‌عنوان pending — موجودی تا تأیید کم نمی‌شود
        if (!Array.isArray(w.transactions)) w.transactions = [];
        w.transactions.push(tx);
        w.pendingWithdraw = (w.pendingWithdraw || 0) + amount;

        if (!_persistWallet(w)) {
            result.reason = 'storage_error';
            return result;
        }

        STATE.wallet = w;
        STATE.transactions = w.transactions;

        result.ok = true;
        result.tx = tx;

        _emit(WalletEvents.WITHDRAW_REQ, {
            tx: tx,
            broker: STATE.broker,
            at: Date.now()
        });

        render();
        return result;
    }

    function _validateWithdraw(data) {
        var errors = {};
        if (!data.amount || String(data.amount).trim() === '') {
            errors.amount = 'مبلغ را وارد کنید';
        } else {
            var a = Number(_toEnglish(data.amount));
            if (isNaN(a) || a <= 0) {
                errors.amount = 'مبلغ نامعتبر است';
            } else if (a < MIN_WITHDRAW) {
                errors.amount = 'حداقل مبلغ برداشت ' +
                    _formatAmount(MIN_WITHDRAW) + ' ریال است';
            }
        }
        if (data.iban && !IBAN_REGEX.test(_toEnglish(data.iban).replace(/\s/g, ''))) {
            errors.iban = 'شماره شبا معتبر نیست (IR + ۲۴ رقم)';
        }
        return errors;
    }

    function openWithdrawModal() {
        if (!STATE.wallet) return;

        var existing = document.getElementById('wamWithdrawModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var w = STATE.wallet;
        var b = STATE.broker || {};
        var maxAmount = w.balance;

        var modal = document.createElement('div');
        modal.id = 'wamWithdrawModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>💸 درخواست برداشت</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form id="wamWithdrawForm" class="wam-modal__body">' +
                    '<div class="wam-withdraw-info">' +
                        '<div><span>موجودی:</span> <strong>' +
                        _formatAmount(maxAmount) + ' ریال</strong></div>' +
                        '<div><span>حداقل:</span> ' +
                        _formatAmount(MIN_WITHDRAW) + ' ریال</div>' +
                    '</div>' +

                    '<div class="wam-field"><label>مبلغ برداشت (ریال) *</label>' +
                        '<input name="amount" inputmode="numeric" ' +
                        'placeholder="مثال: 5000000">' +
                        '<div class="wam-field__error" data-error="amount"></div></div>' +

                    '<div class="wam-field"><label>شماره شبا (اختیاری)</label>' +
                        '<input name="iban" value="' +
                        _escapeHtml(b.iban || '') + '" placeholder="IR...">' +
                        '<div class="wam-field__error" data-error="iban"></div></div>' +

                    '<div class="wam-field"><label>توضیح (اختیاری)</label>' +
                        '<textarea name="note" rows="2"></textarea></div>' +

                    '<div class="wam-field__error" data-error="general"></div>' +

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

        var form = modal.querySelector('#wamWithdrawForm');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                _clearFormErrors(form);

                var data = {
                    amount: form.querySelector('[name="amount"]').value,
                    iban: form.querySelector('[name="iban"]').value,
                    note: form.querySelector('[name="note"]').value.trim()
                };

                var res = requestWithdraw(data);

                if (!res.ok) {
                    _showFormErrors(form,
                        res.errors || { general: 'خطا: ' + res.reason });
                    return;
                }

                if (typeof WamUI !== 'undefined') {
                    WamUI.toastSuccess(
                        'درخواست برداشت ثبت شد (در انتظار تأیید ادمین)',
                        'موفق'
                    );
                }
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }
    }

    // ─────────────────────────────────────
    // 📥 اطلاعات واریز
    // ─────────────────────────────────────
    function openDepositInfo() {
        var existing = document.getElementById('wamDepositModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var b = STATE.broker || {};
        var modal = document.createElement('div');
        modal.id = 'wamDepositModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>📥 اطلاعات واریز</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<div class="wam-modal__body">' +
                    '<p>برای واریز به حساب وام پی، از اطلاعات زیر استفاده کنید:</p>' +
                    '<div class="wam-deposit-info">' +
                        '<div><span>بانک:</span> <strong>بانک ملت</strong></div>' +
                        '<div><span>شماره حساب:</span> <code>1234567890</code></div>' +
                        '<div><span>شبا:</span> <code>IR123456789012345678901234</code></div>' +
                        '<div><span>به نام:</span> وام پی</div>' +
                    '</div>' +
                    (b.brokerCode ?
                        '<p class="wam-text-muted">' +
                        'در توضیحات واریز، کد کارگزار خود را ذکر کنید: ' +
                        '<code>' + _escapeHtml(b.brokerCode) + '</code></p>' :
                        '') +
                    '<p class="wam-text-muted">' +
                    'پس از واریز، لطفاً فیش را برای پشتیبانی ارسال کنید.</p>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var i = 0; i < cbs.length; i++) {
            cbs[i].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }
    }

    // ─────────────────────────────────────
    // 🎯 افزودن تراکنش (داخلی — برای ادمین/سیستم)
    // ─────────────────────────────────────
    function addTransaction(txData) {
        if (!txData || !txData.type || !txData.amount) {
            return { ok: false, reason: 'invalid' };
        }

        var w = STATE.wallet;
        if (!w) return { ok: false, reason: 'no_wallet' };

        var amount = Number(txData.amount) || 0;
        var tx = {
            id: 'tx_' + Date.now().toString(36) + '_' +
                Math.random().toString(36).slice(2, 6),
            type: txData.type,
            amount: amount,
            at: txData.at || Date.now(),
            by: txData.by || _currentUserId(),
            note: txData.note || null,
            ref: txData.ref || null
        };

        if (!Array.isArray(w.transactions)) w.transactions = [];
        w.transactions.push(tx);

        // آپدیت موجودی
        if (tx.type === 'deposit') {
            w.balance += amount;
            w.totalDeposited = (w.totalDeposited || 0) + amount;
        } else if (tx.type === 'commission') {
            w.balance += amount;
            w.totalEarned = (w.totalEarned || 0) + amount;
        } else if (tx.type === 'withdraw') {
            w.balance -= amount;
            w.totalWithdrawn = (w.totalWithdrawn || 0) + amount;
        } else if (tx.type === 'refund') {
            w.balance += amount;
        } else if (tx.type === 'penalty') {
            w.balance -= amount;
        } else if (tx.type === 'adjust') {
            w.balance += amount;   // amount می‌تواند منفی باشد
        }

        if (!_persistWallet(w)) {
            return { ok: false, reason: 'storage_error' };
        }

        STATE.wallet = w;
        STATE.transactions = w.transactions;

        _emit(WalletEvents.TX_ADDED, { tx: tx, wallet: w, at: Date.now() });
        render();

        return { ok: true, tx: tx, wallet: w };
    }

    // ─────────────────────────────────────
    // 🎨 فرم خطاها
    // ─────────────────────────────────────
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
    // 🔄 بروزرسانی
    // ─────────────────────────────────────
    function reload() {
        STATE.wallet = _ensureWallet(STATE.broker);
        STATE.transactions = STATE.wallet ? (STATE.wallet.transactions || []) : [];
        render();
        _emit(WalletEvents.LOADED, {
            broker: STATE.broker ? STATE.broker.id : null,
            balance: STATE.wallet ? STATE.wallet.balance : 0,
            txCount: STATE.transactions.length,
            at: Date.now()
        });
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        // دسترسی
        var user = (typeof WamPermissions !== 'undefined')
            ? WamPermissions.getCurrentUser() : null;
        if (!user) {
            if (typeof WamPayGuard !== 'undefined') {
                WamPayGuard.redirectToLogin('not_logged_in');
            }
            return;
        }
        if (user.role !== 'broker' && user.role !== 'admin' &&
            user.role !== 'super_admin') {
            if (typeof WamPayGuard !== 'undefined') {
                WamPayGuard.redirectToRoleHome(user.role);
            }
            return;
        }

        var run = function () {
            var root = options.root ||
                       document.querySelector('[data-wallet-root]') ||
                       document.querySelector('.wam-broker-wallet');
            if (!root) {
                if (options.debug) console.warn('[broker-wallet] root پیدا نشد');
                return;
            }
            STATE.root = root;

            STATE.broker = _loadBroker();
            if (!STATE.broker) {
                if (typeof WamUI !== 'undefined') {
                    WamUI.toastWarning(
                        'اطلاعات کارگزار یافت نشد. با پشتیبانی تماس بگیرید.',
                        'توجه'
                    );
                }
                return;
            }

            STATE.wallet = _ensureWallet(STATE.broker);
            STATE.transactions = STATE.wallet.transactions || [];

            render();
            STATE.installed = true;

            _emit(WalletEvents.LOADED, {
                broker: STATE.broker.id,
                balance: STATE.wallet.balance,
                txCount: STATE.transactions.length,
                at: Date.now()
            });

            if (options.debug) {
                console.log('[broker-wallet] آماده، موجودی: ' +
                    STATE.wallet.balance);
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
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            brokerId: STATE.broker ? STATE.broker.id : null,
            balance: STATE.wallet ? STATE.wallet.balance : 0,
            txCount: STATE.transactions.length,
            filteredCount: STATE.filtered.length,
            page: STATE.page,
            query: STATE.query,
            typeFilter: STATE.typeFilter
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
    var WamBrokerWallet = {
        EVENTS: WalletEvents,
        TX_LABELS: TX_LABELS,
        TX_ICONS: TX_ICONS,
        PAGE_SIZE: PAGE_SIZE,
        MIN_WITHDRAW: MIN_WITHDRAW,

        install: install,
        uninstall: uninstall,
        reload: reload,
        render: render,

        computeStats: computeStats,
        getWallet: function () { return STATE.wallet; },
        getTransactions: function () { return STATE.transactions.slice(); },
        getFiltered: function () { return STATE.filtered.slice(); },
        getCurrentBroker: function () { return STATE.broker; },

        requestWithdraw: requestWithdraw,
        addTransaction: addTransaction,

        openWithdrawModal: openWithdrawModal,
        openDepositInfo: openDepositInfo,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamBrokerWallet = WamBrokerWallet;
    window.WalletEvents = WalletEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var body = document.body;
            if (!body) return;
            if (body.hasAttribute('data-broker-wallet-page') ||
                document.querySelector('[data-wallet-root]') ||
                document.querySelector('.wam-broker-wallet')) {
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




/* ==========================================
 * FROM: js/broker-profile.js
 * ========================================== */


// ==========================================
// وام پی — Broker Panel
// فایل: broker-profile.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: پروفایل کارگزار — نمایش، ویرایش، تغییر رمز
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var BROKERS_KEY = 'wamPayBrokers';
    var USERS_KEY   = 'wamPayUsers';
    var FORM_ID     = 'wamBrokerProfileForm';
    var PWD_FORM_ID = 'wamBrokerPwdForm';

    var IBAN_REGEX  = /^IR\d{24}$/;
    var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var MIN_PWD     = 6;

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        form: null,
        pwdForm: null,
        broker: null,
        currentUser: null,
        editing: false,
        submitting: false,
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var ProfileEvents = {
        LOADED:       'broker.profile.loaded',
        UPDATED:      'broker.profile.updated',
        PWD_CHANGED:  'broker.profile.pwd_changed',
        EDIT_START:   'broker.profile.edit_start',
        EDIT_CANCEL:  'broker.profile.edit_cancel',
        FAIL:         'broker.profile.fail'
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

    function _toEnglish(str) {
        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.toEnglishDigits) {
            return WamPersianDate.toEnglishDigits(str);
        }
        return String(str || '').replace(/[۰-۹]/g, function (d) {
            return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
        });
    }

    function _hashPassword(plain) {
        if (typeof WamLogin !== 'undefined' && WamLogin.hash) {
            return WamLogin.hash(plain);
        }
        var h = 5381;
        var str = String(plain || '');
        for (var i = 0; i < str.length; i++) {
            h = ((h << 5) + h) + str.charCodeAt(i);
            h = h & 0xffffffff;
        }
        return 'wh1_' + (h >>> 0).toString(16);
    }

    function _verifyPassword(plain, stored) {
        if (!plain || !stored) return false;
        return _hashPassword(plain) === stored || stored === plain;
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری / ذخیره
    // ─────────────────────────────────────
    function _loadBrokers() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(BROKERS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveBrokers(brokers) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(BROKERS_KEY, brokers);
    }

    function _loadUsers() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(USERS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveUsers(users) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(USERS_KEY, users);
    }

    function _loadCurrentBroker() {
        if (typeof WamPermissions === 'undefined') return null;
        var user = WamPermissions.getCurrentUser();
        if (!user) return null;
        STATE.currentUser = user;

        var brokers = _loadBrokers();
        for (var i = 0; i < brokers.length; i++) {
            var b = brokers[i];
            if (!b) continue;
            if (b.userId && b.userId === user.id) return b;
            if (b.mobile && user.mobile &&
                String(b.mobile).replace(/\D/g, '') ===
                String(user.mobile).replace(/\D/g, '')) return b;
        }
        return null;
    }

    // ─────────────────────────────────────
    // 🧾 اعتبارسنجی
    // ─────────────────────────────────────
    function _validateProfile(data) {
        var errors = {};

        if (!data.name || String(data.name).trim().length < 3) {
            errors.name = 'نام و نام خانوادگی حداقل ۳ کاراکتر باشد';
        } else if (String(data.name).trim().length > 60) {
            errors.name = 'نام حداکثر ۶۰ کاراکتر باشد';
        }

        if (!data.mobile) {
            errors.mobile = 'موبایل الزامی است';
        } else {
            var m = _toEnglish(data.mobile).replace(/\D/g, '');
            if (!/^09\d{9}$/.test(m)) {
                errors.mobile = 'موبایل باید ۱۱ رقم و با ۰۹ شروع شود';
            }
        }

        if (data.email && !EMAIL_REGEX.test(String(data.email).trim())) {
            errors.email = 'ایمیل نامعتبر است';
        }

        if (data.nationalCode) {
            var c = _toEnglish(data.nationalCode).replace(/\D/g, '');
            if (c && !/^\d{10}$/.test(c)) {
                errors.nationalCode = 'کد ملی باید ۱۰ رقم باشد';
            }
        }

        if (data.iban) {
            var ib = _toEnglish(data.iban).replace(/\s/g, '').toUpperCase();
            if (ib && !IBAN_REGEX.test(ib)) {
                errors.iban = 'شبا باید با IR شروع و ۲۴ رقم داشته باشد';
            }
        }

        return errors;
    }

    function _validatePassword(data) {
        var errors = {};
        if (!data.current || data.current.length === 0) {
            errors.current = 'رمز فعلی را وارد کنید';
        }
        if (!data.newPwd || String(data.newPwd).length < MIN_PWD) {
            errors.newPwd = 'رمز جدید حداقل ' + MIN_PWD + ' کاراکتر باشد';
        } else if (String(data.newPwd).length > 64) {
            errors.newPwd = 'رمز جدید حداکثر ۶۴ کاراکتر';
        }
        if (data.current && data.newPwd && data.current === data.newPwd) {
            errors.newPwd = 'رمز جدید باید با رمز فعلی متفاوت باشد';
        }
        if (!data.confirm) {
            errors.confirm = 'تکرار رمز را وارد کنید';
        } else if (data.newPwd !== data.confirm) {
            errors.confirm = 'تکرار رمز مطابقت ندارد';
        }
        return errors;
    }

    // ─────────────────────────────────────
    // 🎯 به‌روزرسانی پروفایل
    // ─────────────────────────────────────
    function updateProfile(data, options) {
        options = options || {};
        var result = { ok: false, reason: null, broker: null, errors: null };

        if (!STATE.broker) {
            result.reason = 'no_broker';
            return result;
        }

        var errors = _validateProfile(data);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        // بررسی تکراری بودن موبایل
        var brokers = _loadBrokers();
        var newMobile = _toEnglish(data.mobile).replace(/\D/g, '');
        for (var i = 0; i < brokers.length; i++) {
            var b = brokers[i];
            if (!b || b.id === STATE.broker.id) continue;
            if (b.mobile && String(b.mobile).replace(/\D/g, '') === newMobile) {
                result.reason = 'duplicate_mobile';
                result.errors = { mobile: 'این موبایل قبلاً ثبت شده است' };
                return result;
            }
        }

        // به‌روزرسانی
        var prevMobile = STATE.broker.mobile;
        var now = Date.now();

        var patch = {
            name: String(data.name).trim(),
            mobile: newMobile,
            email: data.email ? String(data.email).trim() : null,
            nationalCode: data.nationalCode
                ? _toEnglish(data.nationalCode).replace(/\D/g, '') : null,
            bankAccount: data.bankAccount ? String(data.bankAccount).trim() : null,
            iban: data.iban
                ? _toEnglish(data.iban).replace(/\s/g, '').toUpperCase() : null,
            address: data.address ? String(data.address).trim() : null,
            notes: data.notes ? String(data.notes).trim() : null,
            updatedAt: now
        };

        // اعمال روی broker
        for (var key in patch) {
            if (Object.prototype.hasOwnProperty.call(patch, key)) {
                STATE.broker[key] = patch[key];
            }
        }

        if (!_saveBrokers(brokers)) {
            result.reason = 'storage_error';
            return result;
        }

        // به‌روزرسانی کاربر متناظر
        _syncUserProfile(newMobile, prevMobile, data);

        // به‌روزرسانی کاربر جاری در session
        if (typeof WamPermissions !== 'undefined') {
            var u = WamPermissions.getCurrentUser();
            if (u) {
                u.name = String(data.name).trim();
                u.mobile = newMobile;
                u.email = patch.email;
                WamPermissions.setCurrentUser(u);
            }
        }

        result.ok = true;
        result.broker = STATE.broker;

        _emit(ProfileEvents.UPDATED, {
            broker: {
                id: STATE.broker.id,
                brokerCode: STATE.broker.brokerCode,
                name: STATE.broker.name
            },
            at: now
        });

        return result;
    }

    function _syncUserProfile(newMobile, prevMobile, data) {
        var users = _loadUsers();
        var user = STATE.currentUser;
        if (!user) return;

        for (var i = 0; i < users.length; i++) {
            var u = users[i];
            if (!u) continue;
            if (u.id === user.id ||
                (prevMobile && u.mobile &&
                 String(u.mobile).replace(/\D/g, '') ===
                 String(prevMobile).replace(/\D/g, ''))) {
                u.name = String(data.name).trim();
                u.mobile = newMobile;
                u.email = data.email ? String(data.email).trim() : null;
                u.updatedAt = Date.now();
                _saveUsers(users);
                return;
            }
        }
    }

    // ─────────────────────────────────────
    // 🔑 تغییر رمز عبور
    // ─────────────────────────────────────
    function changePassword(data) {
        var result = { ok: false, reason: null, errors: null };

        if (!STATE.currentUser) {
            result.reason = 'not_logged_in';
            return result;
        }

        var errors = _validatePassword(data);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        // یافتن کاربر کامل
        var users = _loadUsers();
        var foundIdx = -1;
        for (var i = 0; i < users.length; i++) {
            if (users[i] && users[i].id === STATE.currentUser.id) {
                foundIdx = i;
                break;
            }
        }
        if (foundIdx === -1) {
            result.reason = 'user_not_found';
            return result;
        }

        var user = users[foundIdx];
        if (!_verifyPassword(data.current, user.password)) {
            result.reason = 'wrong_current';
            result.errors = { current: 'رمز فعلی اشتباه است' };
            return result;
        }

        user.password = _hashPassword(data.newPwd);
        user.passwordVersion = (user.passwordVersion || 1) + 1;
        user.passwordChangedAt = Date.now();
        user.mustChangePassword = false;

        if (!_saveUsers(users)) {
            result.reason = 'storage_error';
            return result;
        }

        result.ok = true;
        _emit(ProfileEvents.PWD_CHANGED, {
            userId: user.id,
            at: Date.now()
        });
        return result;
    }

    // ─────────────────────────────────────
    // 🎨 نمایش خطاها
    // ─────────────────────────────────────
    function _setFieldError(form, field, message) {
        if (!form) return;
        var el = form.querySelector('[data-error="' + field + '"]');
        if (el) {
            el.textContent = message || '';
            el.style.display = message ? 'block' : 'none';
        }
        var input = form.querySelector('[name="' + field + '"]');
        if (input) {
            if (message) input.classList.add('wam-input--error');
            else input.classList.remove('wam-input--error');
        }
    }

    function _clearErrors(form) {
        if (!form) return;
        var errs = form.querySelectorAll('[data-error]');
        for (var i = 0; i < errs.length; i++) {
            errs[i].textContent = '';
            errs[i].style.display = 'none';
        }
        var inputs = form.querySelectorAll('.wam-input--error');
        for (var j = 0; j < inputs.length; j++) {
            inputs[j].classList.remove('wam-input--error');
        }
    }

    function _showErrors(form, errors) {
        _clearErrors(form);
        if (!errors) return;
        for (var k in errors) {
            if (Object.prototype.hasOwnProperty.call(errors, k)) {
                _setFieldError(form, k, errors[k]);
            }
        }
    }

    // ─────────────────────────────────────
    // 🎨 رندر فرم پروفایل
    // ─────────────────────────────────────
    function _renderProfileForm() {
        var b = STATE.broker || {};
        var disabled = STATE.editing ? '' : ' disabled';

        return '' +
            '<form id="' + FORM_ID + '" class="wam-profile-form">' +
                '<div class="wam-field"><label>نام و نام خانوادگی *</label>' +
                    '<input name="name" value="' + _escapeHtml(b.name || '') +
                    '"' + disabled + '>' +
                    '<div class="wam-field__error" data-error="name"></div></div>' +

                '<div class="wam-field"><label>کد کارگزار</label>' +
                    '<input value="' + _escapeHtml(b.brokerCode || '—') +
                    '" readonly disabled></div>' +

                '<div class="wam-field"><label>موبایل *</label>' +
                    '<input name="mobile" type="tel" value="' +
                    _escapeHtml(b.mobile || '') + '"' + disabled + '>' +
                    '<div class="wam-field__error" data-error="mobile"></div></div>' +

                '<div class="wam-field"><label>ایمیل</label>' +
                    '<input name="email" type="email" value="' +
                    _escapeHtml(b.email || '') + '"' + disabled + '>' +
                    '<div class="wam-field__error" data-error="email"></div></div>' +

                '<div class="wam-field"><label>کد ملی</label>' +
                    '<input name="nationalCode" inputmode="numeric" maxlength="10" ' +
                    'value="' + _escapeHtml(b.nationalCode || '') + '"' + disabled + '>' +
                    '<div class="wam-field__error" data-error="nationalCode"></div></div>' +

                '<div class="wam-field"><label>درصد پورسانت</label>' +
                    '<input value="' + _escapeHtml(String(b.commissionRate || 0)) +
                    '٪" readonly disabled></div>' +

                '<div class="wam-field"><label>شماره حساب</label>' +
                    '<input name="bankAccount" value="' +
                    _escapeHtml(b.bankAccount || '') + '"' + disabled + '></div>' +

                '<div class="wam-field"><label>شبا</label>' +
                    '<input name="iban" value="' + _escapeHtml(b.iban || '') +
                    '" placeholder="IR..."' + disabled + '>' +
                    '<div class="wam-field__error" data-error="iban"></div></div>' +

                '<div class="wam-field"><label>آدرس</label>' +
                    '<textarea name="address" rows="2"' + disabled + '>' +
                    _escapeHtml(b.address || '') + '</textarea></div>' +

                '<div class="wam-field"><label>یادداشت (اختیاری)</label>' +
                    '<textarea name="notes" rows="2"' + disabled + '>' +
                    _escapeHtml(b.notes || '') + '</textarea></div>' +

                '<div class="wam-field__error" data-error="general"></div>' +
            '</form>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر فرم رمز
    // ─────────────────────────────────────
    function _renderPasswordForm() {
        return '' +
            '<form id="' + PWD_FORM_ID + '" class="wam-profile-form">' +
                '<div class="wam-field"><label>رمز فعلی *</label>' +
                    '<input name="current" type="password" autocomplete="current-password">' +
                    '<div class="wam-field__error" data-error="current"></div></div>' +

                '<div class="wam-field"><label>رمز جدید *</label>' +
                    '<input name="newPwd" type="password" autocomplete="new-password">' +
                    '<div class="wam-field__error" data-error="newPwd"></div></div>' +

                '<div class="wam-field"><label>تکرار رمز جدید *</label>' +
                    '<input name="confirm" type="password" autocomplete="new-password">' +
                    '<div class="wam-field__error" data-error="confirm"></div></div>' +

                '<div class="wam-field__error" data-error="general"></div>' +

                '<button type="submit" class="wam-btn wam-btn--primary">' +
                    'تغییر رمز عبور</button>' +
            '</form>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر کامل
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;

        var b = STATE.broker;
        if (!b) {
            STATE.root.innerHTML =
                '<div class="wam-empty">اطلاعات کارگزار یافت نشد.</div>';
            return;
        }

        var html =
            '<div class="wam-broker-profile">' +
                '<section class="wam-broker-section">' +
                    '<header class="wam-broker-section__head">' +
                        '<h3>👤 پروفایل من</h3>' +
                        '<div class="wam-profile-actions">' +
                            (STATE.editing
                                ? '<button class="wam-btn wam-btn--ghost" ' +
                                  'data-profile-action="cancel">انصراف</button>' +
                                  '<button class="wam-btn wam-btn--primary" ' +
                                  'data-profile-action="save">💾 ذخیره</button>'
                                : '<button class="wam-btn wam-btn--primary" ' +
                                  'data-profile-action="edit">✏️ ویرایش</button>') +
                        '</div>' +
                    '</header>' +
                    '<div class="wam-profile-meta">' +
                        '<div><span>عضویت:</span> ' + _escapeHtml(_jalali(b.createdAt)) + '</div>' +
                        '<div><span>آخرین به‌روزرسانی:</span> ' +
                        _escapeHtml(_relativeTime(b.updatedAt || b.createdAt)) + '</div>' +
                    '</div>' +
                    _renderProfileForm() +
                '</section>' +

                '<section class="wam-broker-section">' +
                    '<h3>🔑 تغییر رمز عبور</h3>' +
                    _renderPasswordForm() +
                '</section>' +
            '</div>';

        STATE.root.innerHTML = html;

        STATE.form = STATE.root.querySelector('#' + FORM_ID);
        STATE.pwdForm = STATE.root.querySelector('#' + PWD_FORM_ID);

        _bindActions();
        _bindProfileForm();
        _bindPasswordForm();
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindActions() {
        if (!STATE.root) return;
        var btns = STATE.root.querySelectorAll('[data-profile-action]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', _handleAction);
        }
    }

    function _handleAction(e) {
        e.preventDefault();
        var action = this.getAttribute('data-profile-action');

        if (action === 'edit') {
            STATE.editing = true;
            render();
            _emit(ProfileEvents.EDIT_START, { at: Date.now() });
            return;
        }
        if (action === 'cancel') {
            STATE.editing = false;
            render();
            _emit(ProfileEvents.EDIT_CANCEL, { at: Date.now() });
            return;
        }
        if (action === 'save') {
            _submitProfile();
            return;
        }
    }

    function _submitProfile() {
        if (!STATE.form) return;
        _clearErrors(STATE.form);

        var form = STATE.form;
        var data = {
            name: form.querySelector('[name="name"]').value.trim(),
            mobile: form.querySelector('[name="mobile"]').value.trim(),
            email: form.querySelector('[name="email"]').value.trim(),
            nationalCode: form.querySelector('[name="nationalCode"]').value.trim(),
            bankAccount: form.querySelector('[name="bankAccount"]').value.trim(),
            iban: form.querySelector('[name="iban"]').value.trim(),
            address: form.querySelector('[name="address"]').value.trim(),
            notes: form.querySelector('[name="notes"]').value.trim()
        };

        var res = updateProfile(data);

        if (!res.ok) {
            _showErrors(form, res.errors || { general: 'خطا: ' + res.reason });
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('خطا در ذخیره', 'خطا');
            }
            return;
        }

        STATE.editing = false;
        render();

        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('پروفایل با موفقیت ذخیره شد', 'موفق');
        }
    }

    function _bindProfileForm() {
        if (!STATE.form) return;
        // Enter روی input → save (فقط در حالت ویرایش)
        var inputs = STATE.form.querySelectorAll('input');
        for (var i = 0; i < inputs.length; i++) {
            inputs[i].addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey && STATE.editing) {
                    e.preventDefault();
                    _submitProfile();
                }
            });
            inputs[i].addEventListener('input', function () {
                var name = this.getAttribute('name');
                if (name) _setFieldError(STATE.form, name, '');
            });
        }
    }

    function _bindPasswordForm() {
        if (!STATE.pwdForm) return;
        STATE.pwdForm.addEventListener('submit', function (e) {
            e.preventDefault();
            _submitPassword();
        });
    }

    function _submitPassword() {
        if (!STATE.pwdForm) return;
        _clearErrors(STATE.pwdForm);

        var form = STATE.pwdForm;
        var data = {
            current: form.querySelector('[name="current"]').value,
            newPwd: form.querySelector('[name="newPwd"]').value,
            confirm: form.querySelector('[name="confirm"]').value
        };

        var res = changePassword(data);

        if (!res.ok) {
            _showErrors(form, res.errors || { general: 'خطا: ' + res.reason });
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('خطا در تغییر رمز', 'خطا');
            }
            return;
        }

        // پاک کردن فرم
        form.reset();
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('رمز عبور با موفقیت تغییر کرد', 'موفق');
        }
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var user = (typeof WamPermissions !== 'undefined')
            ? WamPermissions.getCurrentUser() : null;
        if (!user) {
            if (typeof WamPayGuard !== 'undefined') {
                WamPayGuard.redirectToLogin('not_logged_in');
            }
            return;
        }
        if (user.role !== 'broker' && user.role !== 'admin' &&
            user.role !== 'super_admin') {
            if (typeof WamPayGuard !== 'undefined') {
                WamPayGuard.redirectToRoleHome(user.role);
            }
            return;
        }

        var run = function () {
            var root = options.root ||
                       document.querySelector('[data-profile-root]') ||
                       document.querySelector('.wam-broker-profile-page');
            if (!root) {
                if (options.debug) console.warn('[broker-profile] root پیدا نشد');
                return;
            }
            STATE.root = root;

            STATE.broker = _loadCurrentBroker();
            if (!STATE.broker) {
                STATE.root.innerHTML =
                    '<div class="wam-empty">' +
                    'اطلاعات کارگزار یافت نشد. با پشتیبانی تماس بگیرید.' +
                    '</div>';
                return;
            }

            render();
            STATE.installed = true;

            _emit(ProfileEvents.LOADED, {
                broker: {
                    id: STATE.broker.id,
                    brokerCode: STATE.broker.brokerCode
                },
                at: Date.now()
            });

            if (options.debug) {
                console.log('[broker-profile] آماده: ' +
                    STATE.broker.brokerCode);
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
        STATE.form = null;
        STATE.pwdForm = null;
        STATE.installed = false;
        STATE.editing = false;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            hasBroker: !!STATE.broker,
            editing: STATE.editing,
            submitting: STATE.submitting,
            brokerId: STATE.broker ? STATE.broker.id : null,
            brokerCode: STATE.broker ? STATE.broker.brokerCode : null
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
    var WamBrokerProfile = {
        EVENTS: ProfileEvents,
        FORM_ID: FORM_ID,
        PWD_FORM_ID: PWD_FORM_ID,
        MIN_PWD: MIN_PWD,

        install: install,
        uninstall: uninstall,
        render: render,

        updateProfile: updateProfile,
        changePassword: changePassword,

        getCurrentBroker: function () { return STATE.broker; },
        isEditing: function () { return STATE.editing; },
        startEdit: function () {
            STATE.editing = true;
            render();
        },
        cancelEdit: function () {
            STATE.editing = false;
            render();
        },

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamBrokerProfile = WamBrokerProfile;
    window.ProfileEvents = ProfileEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var body = document.body;
            if (!body) return;
            if (body.hasAttribute('data-broker-profile-page') ||
                document.querySelector('[data-profile-root]') ||
                document.querySelector('.wam-broker-profile-page')) {
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




/* ==========================================
 * FROM: js/broker-support.js
 * ========================================== */


// ==========================================
// وام پی — Broker Panel
// فایل: broker-support.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: پشتیبانی کارگزار — تیکت، FAQ، راه‌های ارتباطی
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var TICKETS_KEY  = 'wamPaySupportTickets';
    var BROKERS_KEY  = 'wamPayBrokers';
    var PAGE_SIZE    = 10;

    var TICKET_STATUS = {
        open:        'باز',
        in_progress: 'در حال بررسی',
        answered:    'پاسخ داده‌شده',
        closed:      'بسته‌شده'
    };

    var TICKET_PRIORITY = {
        low:    'کم',
        normal: 'معمولی',
        high:   'بالا',
        urgent: 'فوری'
    };

    var CATEGORIES = [
        'مشکل فنی', 'سوال در مورد وام', 'مشکل کیف پول',
        'مشکل پرونده', 'درخواست جدید', 'انتقاد و پیشنهاد', 'سایر'
    ];

    var FAQ_ITEMS = [
        {
            q: 'چطور می‌توانم پرونده جدید ثبت کنم؟',
            a: 'از منوی «پرونده‌ها» یا دکمه «پرونده جدید» در داشبورد، ویزارد ثبت را باز کنید و مراحل را تکمیل کنید.'
        },
        {
            q: 'پورسانت من چه زمانی واریز می‌شود؟',
            a: 'پس از تکمیل موفق پرونده و پرداخت وام، پورسانت به‌صورت خودکار به کیف پول شما واریز می‌شود.'
        },
        {
            q: 'چگونه از کیف پول برداشت کنم؟',
            a: 'از بخش کیف پول، دکمه «درخواست برداشت» را بزنید. حداقل مبلغ برداشت ۵۰۰٬۰۰۰ ریال است و پس از تأیید ادمین واریز می‌شود.'
        },
        {
            q: 'پرونده‌ای که ثبت کردم در چه وضعیتی است؟',
            a: 'در داشبورد یا بخش پرونده‌ها، وضعیت و مرحله جاری هر پرونده را می‌بینید. با کلیک روی «جزئیات» می‌توانید روند را دنبال کنید.'
        },
        {
            q: 'چگونه اطلاعات پروفایلم را ویرایش کنم؟',
            a: 'از منوی «پروفایل»، دکمه «ویرایش» را بزنید، تغییرات را اعمال و ذخیره کنید.'
        },
        {
            q: 'اگر رمزم را فراموش کردم چه کنم؟',
            a: 'از بخش پروفایل > تغییر رمز عبور می‌توانید رمز را تغییر دهید. اگر دسترسی ندارید با پشتیبانی تماس بگیرید.'
        }
    ];

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        form: null,
        broker: null,
        tickets: [],
        filtered: [],
        page: 1,
        statusFilter: '',
        submitting: false,
        activeTab: 'new',       // 'new' | 'list' | 'faq' | 'contact'
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var SupportEvents = {
        LOADED:        'broker.support.loaded',
        TICKET_CREATED:'broker.support.ticket_created',
        TICKET_CLOSED: 'broker.support.ticket_closed',
        TAB_CHANGE:    'broker.support.tab_change',
        FILTERED:      'broker.support.filtered',
        FAIL:          'broker.support.fail'
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

    function _generateTicketCode() {
        var r = Math.random().toString(36).slice(2, 6).toUpperCase();
        return 'TK-' + r;
    }

    function _generateId() {
        var r = Math.random().toString(36).slice(2, 8);
        return 't_' + Date.now().toString(36) + '_' + r;
    }

    function _currentUserId() {
        if (typeof WamPermissions === 'undefined') return null;
        var me = WamPermissions.getCurrentUser();
        return me ? me.id : null;
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری / ذخیره
    // ─────────────────────────────────────
    function _loadAllTickets() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(TICKETS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveAllTickets(tickets) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(TICKETS_KEY, tickets);
    }

    function _loadBroker() {
        if (typeof Storage === 'undefined') return null;
        var brokers = Storage.getJSON(BROKERS_KEY, []) || [];
        var user = (typeof WamPermissions !== 'undefined')
            ? WamPermissions.getCurrentUser() : null;
        if (!user) return null;

        for (var i = 0; i < brokers.length; i++) {
            var b = brokers[i];
            if (!b) continue;
            if (b.userId && b.userId === user.id) return b;
            if (b.mobile && user.mobile &&
                String(b.mobile).replace(/\D/g, '') ===
                String(user.mobile).replace(/\D/g, '')) return b;
        }
        return null;
    }

    function _loadMyTickets() {
        if (!STATE.broker) return [];
        var all = _loadAllTickets();
        var mine = [];
        for (var i = 0; i < all.length; i++) {
            var t = all[i];
            if (!t) continue;
            if (t.brokerId === STATE.broker.id) mine.push(t);
        }
        mine.sort(function (a, b) {
            return (b.updatedAt || b.createdAt || 0) -
                   (a.updatedAt || a.createdAt || 0);
        });
        return mine;
    }

    // ─────────────────────────────────────
    // 🧾 اعتبارسنجی
    // ─────────────────────────────────────
    function _validateTicket(data) {
        var errors = {};
        if (!data.subject || String(data.subject).trim().length < 3) {
            errors.subject = 'موضوع حداقل ۳ کاراکتر باشد';
        } else if (String(data.subject).trim().length > 120) {
            errors.subject = 'موضوع حداکثر ۱۲۰ کاراکتر';
        }
        if (!data.category) {
            errors.category = 'دسته‌بندی را انتخاب کنید';
        }
        if (!data.message || String(data.message).trim().length < 10) {
            errors.message = 'متن پیام حداقل ۱۰ کاراکتر باشد';
        } else if (String(data.message).trim().length > 2000) {
            errors.message = 'متن پیام حداکثر ۲۰۰۰ کاراکتر';
        }
        return errors;
    }

    // ─────────────────────────────────────
    // 🎯 ایجاد تیکت
    // ─────────────────────────────────────
    function createTicket(data, options) {
        options = options || {};
        var result = { ok: false, reason: null, ticket: null, errors: null };

        if (!STATE.broker) {
            result.reason = 'no_broker';
            return result;
        }

        var errors = _validateTicket(data);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        var now = Date.now();
        var ticket = {
            id: _generateId(),
            code: _generateTicketCode(),
            brokerId: STATE.broker.id,
            brokerName: STATE.broker.name,
            brokerCode: STATE.broker.brokerCode,
            subject: String(data.subject).trim(),
            category: data.category,
            message: String(data.message).trim(),
            priority: data.priority || 'normal',
            status: 'open',
            createdBy: _currentUserId(),
            createdAt: now,
            updatedAt: now,
            replies: []
        };

        var all = _loadAllTickets();
        all.push(ticket);
        if (!_saveAllTickets(all)) {
            result.reason = 'storage_error';
            return result;
        }

        STATE.tickets = _loadMyTickets();
        STATE.filtered = STATE.tickets.slice();

        result.ok = true;
        result.ticket = ticket;

        _emit(SupportEvents.TICKET_CREATED, {
            ticket: {
                id: ticket.id,
                code: ticket.code,
                subject: ticket.subject,
                category: ticket.category,
                priority: ticket.priority
            },
            at: now
        });

        return result;
    }

    // ─────────────────────────────────────
    // 🔒 بستن تیکت
    // ─────────────────────────────────────
    function closeTicket(id) {
        var all = _loadAllTickets();
        for (var i = 0; i < all.length; i++) {
            var t = all[i];
            if (!t || t.id !== id) continue;
            if (t.brokerId !== STATE.broker.id) return { ok: false, reason: 'forbidden' };
            if (t.status === 'closed') return { ok: false, reason: 'already_closed' };

            t.status = 'closed';
            t.closedAt = Date.now();
            t.updatedAt = Date.now();

            if (!_saveAllTickets(all)) {
                return { ok: false, reason: 'storage_error' };
            }

            STATE.tickets = _loadMyTickets();
            STATE.filtered = STATE.tickets.slice();

            _emit(SupportEvents.TICKET_CLOSED, {
                ticketId: id, code: t.code, at: Date.now()
            });

            return { ok: true, ticket: t };
        }
        return { ok: false, reason: 'not_found' };
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر تیکت‌ها
    // ─────────────────────────────────────
    function _applyFilters() {
        var st = STATE.statusFilter;
        STATE.filtered = STATE.tickets.filter(function (t) {
            if (!t) return false;
            if (st && t.status !== st) return false;
            return true;
        });
        _emit(SupportEvents.FILTERED, {
            count: STATE.filtered.length, status: st
        });
        return STATE.filtered;
    }

    // ─────────────────────────────────────
    // 📊 آمار
    // ─────────────────────────────────────
    function computeStats() {
        var stats = { total: 0, open: 0, inProgress: 0, answered: 0, closed: 0 };
        for (var i = 0; i < STATE.tickets.length; i++) {
            var t = STATE.tickets[i];
            if (!t) continue;
            stats.total++;
            var st = t.status || 'open';
            if (st === 'open') stats.open++;
            else if (st === 'in_progress') stats.inProgress++;
            else if (st === 'answered') stats.answered++;
            else if (st === 'closed') stats.closed++;
        }
        return stats;
    }

    // ─────────────────────────────────────
    // 🎨 رندر تب‌ها
    // ─────────────────────────────────────
    function _renderTabs() {
        var tabs = [
            { id: 'new',     icon: '➕', label: 'تیکت جدید' },
            { id: 'list',    icon: '📋', label: 'تیکت‌های من' },
            { id: 'faq',     icon: '❓', label: 'سوالات متداول' },
            { id: 'contact', icon: '📞', label: 'تماس با ما' }
        ];
        var html = '<div class="wam-support-tabs" role="tablist">';
        for (var i = 0; i < tabs.length; i++) {
            var t = tabs[i];
            html += '<button type="button" role="tab" ' +
                    'class="wam-support-tab' +
                    (STATE.activeTab === t.id ? ' is-active' : '') + '" ' +
                    'data-support-tab="' + t.id + '">' +
                    '<span>' + t.icon + '</span> ' + _escapeHtml(t.label) +
                    '</button>';
        }
        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — تب تیکت جدید
    // ─────────────────────────────────────
    function _renderNewTab() {
        var catOpts = '<option value="">— انتخاب دسته —</option>';
        for (var i = 0; i < CATEGORIES.length; i++) {
            catOpts += '<option value="' + _escapeHtml(CATEGORIES[i]) + '">' +
                       _escapeHtml(CATEGORIES[i]) + '</option>';
        }

        return '' +
            '<section class="wam-support-section">' +
                '<h3>➕ ثبت تیکت جدید</h3>' +
                '<p class="wam-text-muted">' +
                'مشکل یا سوال خود را با جزئیات بنویسید. در اولین فرصت پاسخ داده می‌شود.' +
                '</p>' +
                '<form id="wamSupportTicketForm" class="wam-support-form">' +
                    '<div class="wam-field"><label>موضوع *</label>' +
                        '<input name="subject" placeholder="خلاصه‌ای از مشکل">' +
                        '<div class="wam-field__error" data-error="subject"></div></div>' +

                    '<div class="wam-field"><label>دسته‌بندی *</label>' +
                        '<select name="category">' + catOpts + '</select>' +
                        '<div class="wam-field__error" data-error="category"></div></div>' +

                    '<div class="wam-field"><label>اولویت</label>' +
                        '<select name="priority">' +
                            '<option value="low">کم</option>' +
                            '<option value="normal" selected>معمولی</option>' +
                            '<option value="high">بالا</option>' +
                            '<option value="urgent">فوری</option>' +
                        '</select></div>' +

                    '<div class="wam-field"><label>متن پیام *</label>' +
                        '<textarea name="message" rows="6" ' +
                        'placeholder="توضیحات کامل..."></textarea>' +
                        '<div class="wam-field__error" data-error="message"></div></div>' +

                    '<div class="wam-field__error" data-error="general"></div>' +

                    '<div class="wam-form-actions">' +
                        '<button type="submit" class="wam-btn wam-btn--primary">' +
                            '📤 ارسال تیکت</button>' +
                    '</div>' +
                '</form>' +
            '</section>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — تب لیست
    // ─────────────────────────────────────
    function _renderListTab() {
        var s = computeStats();

        var html = '<section class="wam-support-section">';
        html += '<header class="wam-support-section__head">' +
                '<h3>📋 تیکت‌های من</h3>' +
                '<select data-support-filter="status">' +
                '<option value="">همه (' + _formatNumber(s.total) + ')</option>' +
                '<option value="open">باز (' + _formatNumber(s.open) + ')</option>' +
                '<option value="in_progress">در بررسی (' + _formatNumber(s.inProgress) + ')</option>' +
                '<option value="answered">پاسخ‌داده (' + _formatNumber(s.answered) + ')</option>' +
                '<option value="closed">بسته (' + _formatNumber(s.closed) + ')</option>' +
                '</select></header>';

        if (STATE.filtered.length === 0) {
            html += '<div class="wam-empty">' +
                    (STATE.tickets.length === 0
                        ? 'هنوز تیکتی ثبت نکرده‌اید.'
                        : 'تیکتی با این فیلتر یافت نشد.') +
                    '</div>';
        } else {
            var list = STATE.filtered;
            var start = (STATE.page - 1) * PAGE_SIZE;
            var end = Math.min(start + PAGE_SIZE, list.length);
            var items = list.slice(start, end);

            for (var i = 0; i < items.length; i++) {
                html += _ticketCard(items[i]);
            }

            var totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
            if (totalPages > 1) {
                html += '<div class="wam-pagination">' +
                        '<button data-support-page="' + (STATE.page - 1) + '"' +
                        (STATE.page === 1 ? ' disabled' : '') + '>‹</button>' +
                        '<span>صفحه ' + _formatNumber(STATE.page) +
                        ' از ' + _formatNumber(totalPages) + '</span>' +
                        '<button data-support-page="' + (STATE.page + 1) + '"' +
                        (STATE.page === totalPages ? ' disabled' : '') + '>›</button>' +
                        '</div>';
            }
        }
        html += '</section>';
        return html;
    }

    function _ticketCard(t) {
        var st = t.status || 'open';
        var stLabel = TICKET_STATUS[st] || st;
        var prLabel = TICKET_PRIORITY[t.priority || 'normal'];

        return '<div class="wam-ticket-card" data-ticket-id="' +
               _escapeHtml(t.id) + '">' +
               '<div class="wam-ticket-card__head">' +
                   '<code>' + _escapeHtml(t.code) + '</code>' +
                   '<span class="wam-badge wam-badge--' + _escapeHtml(st) + '">' +
                   _escapeHtml(stLabel) + '</span>' +
               '</div>' +
               '<div class="wam-ticket-card__subject">' +
               _escapeHtml(t.subject) + '</div>' +
               '<div class="wam-ticket-card__meta">' +
                   '<span>🗂️ ' + _escapeHtml(t.category) + '</span>' +
                   '<span>⚡ ' + _escapeHtml(prLabel) + '</span>' +
                   '<span>📅 ' + _escapeHtml(_relativeTime(t.createdAt)) + '</span>' +
                   (t.replies && t.replies.length > 0
                       ? '<span>💬 ' + _formatNumber(t.replies.length) + ' پاسخ</span>'
                       : '') +
               '</div>' +
               '<div class="wam-ticket-card__actions">' +
                   '<button class="wam-btn wam-btn--sm" ' +
                   'data-ticket-action="view" data-ticket-id="' +
                   _escapeHtml(t.id) + '">👁️ مشاهده</button>' +
                   (st !== 'closed'
                       ? '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                         'data-ticket-action="close" data-ticket-id="' +
                         _escapeHtml(t.id) + '">🔒 بستن</button>'
                       : '') +
               '</div></div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — تب FAQ
    // ─────────────────────────────────────
    function _renderFaqTab() {
        var html = '<section class="wam-support-section">' +
                   '<h3>❓ سوالات متداول</h3>';
        for (var i = 0; i < FAQ_ITEMS.length; i++) {
            var item = FAQ_ITEMS[i];
            html += '<details class="wam-faq-item">' +
                    '<summary>' + _escapeHtml(item.q) + '</summary>' +
                    '<div class="wam-faq-item__answer">' +
                    _escapeHtml(item.a) + '</div></details>';
        }
        html += '</section>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — تب تماس
    // ─────────────────────────────────────
    function _renderContactTab() {
        var b = STATE.broker || {};
        return '' +
            '<section class="wam-support-section">' +
                '<h3>📞 راه‌های ارتباطی</h3>' +
                '<div class="wam-contact-grid">' +
                    '<div class="wam-contact-card">' +
                        '<div class="wam-contact-card__icon">📱</div>' +
                        '<div class="wam-contact-card__title">تلفن پشتیبانی</div>' +
                        '<div class="wam-contact-card__value">' +
                        '<a href="tel:+982112345678">۰۲۱-۱۲۳۴۵۶۷۸</a></div>' +
                        '<div class="wam-contact-card__note">شنبه تا پنج‌شنبه ۹ تا ۱۸</div>' +
                    '</div>' +
                    '<div class="wam-contact-card">' +
                        '<div class="wam-contact-card__icon">✉️</div>' +
                        '<div class="wam-contact-card__title">ایمیل</div>' +
                        '<div class="wam-contact-card__value">' +
                        '<a href="mailto:support@wampay.ir">support@wampay.ir</a></div>' +
                        '<div class="wam-contact-card__note">پاسخ حداکثر تا ۲۴ ساعت</div>' +
                    '</div>' +
                    '<div class="wam-contact-card">' +
                        '<div class="wam-contact-card__icon">💬</div>' +
                        '<div class="wam-contact-card__title">گفتگوی آنلاین</div>' +
                        '<div class="wam-contact-card__value">' +
                        '<a href="broker-chat.html">ورود به چت</a></div>' +
                        '<div class="wam-contact-card__note">پاسخ فوری در ساعات کاری</div>' +
                    '</div>' +
                '</div>' +
                (b.brokerCode ?
                    '<div class="wam-contact-note">' +
                    'در تماس‌ها، کد کارگزار خود را ذکر کنید: ' +
                    '<code>' + _escapeHtml(b.brokerCode) + '</code>' +
                    '</div>' : '') +
            '</section>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function _renderCurrentTab() {
        if (STATE.activeTab === 'new')     return _renderNewTab();
        if (STATE.activeTab === 'list')    return _renderListTab();
        if (STATE.activeTab === 'faq')     return _renderFaqTab();
        if (STATE.activeTab === 'contact') return _renderContactTab();
        return '';
    }

    function render() {
        if (!STATE.root) return;

        _applyFilters();

        var html =
            '<div class="wam-broker-support">' +
                _renderTabs() +
                '<div class="wam-support-body">' +
                    _renderCurrentTab() +
                '</div>' +
            '</div>';

        STATE.root.innerHTML = html;
        _bindTabEvents();
        _bindCurrentForm();
        _bindFilters();
        _bindTicketActions();
    }

    // ─────────────────────────────────────
    // 🖱️ بایند
    // ─────────────────────────────────────
    function _bindTabEvents() {
        if (!STATE.root) return;
        var tabs = STATE.root.querySelectorAll('[data-support-tab]');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].addEventListener('click', _handleTabClick);
        }
    }

    function _handleTabClick(e) {
        e.preventDefault();
        var tab = this.getAttribute('data-support-tab');
        if (!tab || tab === STATE.activeTab) return;
        STATE.activeTab = tab;
        render();
        _emit(SupportEvents.TAB_CHANGE, { tab: tab, at: Date.now() });
    }

    function _bindCurrentForm() {
        if (!STATE.root) return;
        var form = STATE.root.querySelector('#wamSupportTicketForm');
        if (form) {
            STATE.form = form;
            form.addEventListener('submit', _handleSubmit);
            var inputs = form.querySelectorAll('input, select, textarea');
            for (var i = 0; i < inputs.length; i++) {
                inputs[i].addEventListener('input', function () {
                    var name = this.getAttribute('name');
                    if (name) _setFieldError(name, '');
                });
            }
        }
    }

    function _handleSubmit(e) {
        e.preventDefault();
        if (STATE.submitting) return;
        if (!STATE.form) return;

        _clearErrors();

        var form = STATE.form;
        var data = {
            subject: form.querySelector('[name="subject"]').value.trim(),
            category: form.querySelector('[name="category"]').value,
            message: form.querySelector('[name="message"]').value.trim(),
            priority: form.querySelector('[name="priority"]').value
        };

        STATE.submitting = true;
        _setBusy(true);

        setTimeout(function () {
            var res = createTicket(data);

            STATE.submitting = false;
            _setBusy(false);

            if (!res.ok) {
                _showErrors(res.errors || { general: 'خطا: ' + res.reason });
                _emit(SupportEvents.FAIL, { reason: res.reason });
                return;
            }

            if (typeof WamUI !== 'undefined') {
                WamUI.toastSuccess(
                    'تیکت با کد ' + res.ticket.code + ' ثبت شد',
                    'موفق'
                );
            }

            // پاک کردن فرم و رفتن به لیست
            if (form) try { form.reset(); } catch (err) { /* بی‌صدا */ }
            STATE.activeTab = 'list';
            render();
        }, 350);
    }

    function _bindFilters() {
        if (!STATE.root) return;
        var sel = STATE.root.querySelector('[data-support-filter="status"]');
        if (sel) {
            sel.value = STATE.statusFilter;
            sel.addEventListener('change', function () {
                STATE.statusFilter = this.value;
                STATE.page = 1;
                _applyFilters();
                render();
            });
        }

        var pageBtns = STATE.root.querySelectorAll('[data-support-page]');
        for (var i = 0; i < pageBtns.length; i++) {
            pageBtns[i].addEventListener('click', function () {
                var p = parseInt(this.getAttribute('data-support-page'), 10);
                if (isNaN(p) || p < 1) return;
                STATE.page = p;
                render();
            });
        }
    }

    function _bindTicketActions() {
        if (!STATE.root) return;
        var btns = STATE.root.querySelectorAll('[data-ticket-action]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', _handleTicketAction);
        }
    }

    function _handleTicketAction(e) {
        e.preventDefault();
        var action = this.getAttribute('data-ticket-action');
        var id = this.getAttribute('data-ticket-id');
        if (!id) return;

        if (action === 'view') {
            openTicketDetail(id);
        } else if (action === 'close') {
            _confirmClose(id);
        }
    }

    function _confirmClose(id) {
        var t = _findById(id);
        if (!t) return;
        var msg = 'تیکت «' + t.code + '» بسته شود؟';
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('بستن تیکت', msg, { danger: true }).then(function (ok) {
                if (ok) {
                    var res = closeTicket(id);
                    if (res.ok) {
                        if (typeof WamUI !== 'undefined') {
                            WamUI.toastSuccess('تیکت بسته شد', 'موفق');
                        }
                        render();
                    }
                }
            });
        } else if (window.confirm(msg)) {
            closeTicket(id);
            render();
        }
    }

    function _findById(id) {
        for (var i = 0; i < STATE.tickets.length; i++) {
            if (STATE.tickets[i] && STATE.tickets[i].id === id) return STATE.tickets[i];
        }
        return null;
    }

    // ─────────────────────────────────────
    // 👁️ نمایش جزئیات
    // ─────────────────────────────────────
    function openTicketDetail(id) {
        var t = _findById(id);
        if (!t) return;

        var existing = document.getElementById('wamTicketDetailModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var repliesHtml = '';
        if (Array.isArray(t.replies) && t.replies.length > 0) {
            repliesHtml = '<ul class="wam-ticket-replies">';
            for (var i = 0; i < t.replies.length; i++) {
                var r = t.replies[i];
                repliesHtml += '<li class="wam-ticket-reply">' +
                    '<div class="wam-ticket-reply__body">' +
                    _escapeHtml(r.text) + '</div>' +
                    '<div class="wam-ticket-reply__meta">' +
                    _escapeHtml(r.byName || 'پشتیبانی') + ' — ' +
                    _escapeHtml(_relativeTime(r.at)) + '</div></li>';
            }
            repliesHtml += '</ul>';
        } else {
            repliesHtml = '<div class="wam-empty wam-empty--sm">' +
                          'هنوز پاسخی داده نشده.</div>';
        }

        var st = t.status || 'open';
        var modal = document.createElement('div');
        modal.id = 'wamTicketDetailModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel wam-modal__panel--wide">' +
                '<header class="wam-modal__head">' +
                    '<div>' +
                        '<code>' + _escapeHtml(t.code) + '</code> ' +
                        '<span class="wam-badge wam-badge--' + _escapeHtml(st) + '">' +
                        _escapeHtml(TICKET_STATUS[st] || st) + '</span>' +
                    '</div>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<div class="wam-modal__body">' +
                    '<h3>' + _escapeHtml(t.subject) + '</h3>' +
                    '<div class="wam-ticket-detail-meta">' +
                        '<span>🗂️ ' + _escapeHtml(t.category) + '</span>' +
                        '<span>⚡ ' +
                        _escapeHtml(TICKET_PRIORITY[t.priority] || t.priority) + '</span>' +
                        '<span>📅 ' + _escapeHtml(_jalali(t.createdAt)) + '</span>' +
                    '</div>' +
                    '<div class="wam-ticket-detail-message">' +
                    _escapeHtml(t.message) + '</div>' +
                    '<h4>💬 پاسخ‌ها</h4>' +
                    repliesHtml +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var k = 0; k < cbs.length; k++) {
            cbs[k].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }
    }

    // ─────────────────────────────────────
    // 🎨 خطاها
    // ─────────────────────────────────────
    function _setFieldError(field, message) {
        if (!STATE.form) return;
        var el = STATE.form.querySelector('[data-error="' + field + '"]');
        if (el) {
            el.textContent = message || '';
            el.style.display = message ? 'block' : 'none';
        }
        var input = STATE.form.querySelector('[name="' + field + '"]');
        if (input) {
            if (message) input.classList.add('wam-input--error');
            else input.classList.remove('wam-input--error');
        }
    }

    function _clearErrors() {
        if (!STATE.form) return;
        var errs = STATE.form.querySelectorAll('[data-error]');
        for (var i = 0; i < errs.length; i++) {
            errs[i].textContent = '';
            errs[i].style.display = 'none';
        }
        var inputs = STATE.form.querySelectorAll('.wam-input--error');
        for (var j = 0; j < inputs.length; j++) {
            inputs[j].classList.remove('wam-input--error');
        }
    }

    function _showErrors(errors) {
        _clearErrors();
        if (!errors) return;
        for (var k in errors) {
            if (Object.prototype.hasOwnProperty.call(errors, k)) {
                _setFieldError(k, errors[k]);
            }
        }
    }

    function _setBusy(busy) {
        if (!STATE.form) return;
        var btn = STATE.form.querySelector('[type="submit"]');
        if (!btn) return;
        if (busy) {
            btn.disabled = true;
            btn.setAttribute('data-original-text', btn.textContent);
            btn.textContent = 'در حال ارسال...';
        } else {
            btn.disabled = false;
            var orig = btn.getAttribute('data-original-text');
            if (orig) btn.textContent = orig;
        }
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var user = (typeof WamPermissions !== 'undefined')
            ? WamPermissions.getCurrentUser() : null;
        if (!user) {
            if (typeof WamPayGuard !== 'undefined') {
                WamPayGuard.redirectToLogin('not_logged_in');
            }
            return;
        }
        if (user.role !== 'broker' && user.role !== 'admin' &&
            user.role !== 'super_admin') {
            if (typeof WamPayGuard !== 'undefined') {
                WamPayGuard.redirectToRoleHome(user.role);
            }
            return;
        }

        var run = function () {
            var root = options.root ||
                       document.querySelector('[data-support-root]') ||
                       document.querySelector('.wam-broker-support-page');
            if (!root) {
                if (options.debug) console.warn('[broker-support] root پیدا نشد');
                return;
            }
            STATE.root = root;
            STATE.broker = _loadBroker();

            if (!STATE.broker) {
                STATE.root.innerHTML =
                    '<div class="wam-empty">اطلاعات کارگزار یافت نشد.</div>';
                return;
            }

            STATE.tickets = _loadMyTickets();
            STATE.filtered = STATE.tickets.slice();

            render();
            STATE.installed = true;

            _emit(SupportEvents.LOADED, {
                broker: STATE.broker.id,
                ticketsCount: STATE.tickets.length,
                at: Date.now()
            });

            if (options.debug) {
                console.log('[broker-support] آماده، ' +
                    STATE.tickets.length + ' تیکت');
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
        STATE.form = null;
        STATE.installed = false;
    }

    function reload() {
        STATE.tickets = _loadMyTickets();
        STATE.filtered = STATE.tickets.slice();
        render();
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            brokerId: STATE.broker ? STATE.broker.id : null,
            activeTab: STATE.activeTab,
            ticketsCount: STATE.tickets.length,
            filteredCount: STATE.filtered.length,
            submitting: STATE.submitting,
            page: STATE.page,
            statusFilter: STATE.statusFilter
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
    var WamBrokerSupport = {
        EVENTS: SupportEvents,
        TICKET_STATUS: TICKET_STATUS,
        TICKET_PRIORITY: TICKET_PRIORITY,
        CATEGORIES: CATEGORIES,
        FAQ_ITEMS: FAQ_ITEMS,
        PAGE_SIZE: PAGE_SIZE,

        install: install,
        uninstall: uninstall,
        reload: reload,
        render: render,

        createTicket: createTicket,
        closeTicket: closeTicket,
        openTicketDetail: openTicketDetail,

        setTab: function (tab) {
            if (['new', 'list', 'faq', 'contact'].indexOf(tab) === -1) return false;
            STATE.activeTab = tab;
            render();
            return true;
        },
        getActiveTab: function () { return STATE.activeTab; },

        computeStats: computeStats,
        getMyTickets: function () { return STATE.tickets.slice(); },
        getFiltered: function () { return STATE.filtered.slice(); },

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamBrokerSupport = WamBrokerSupport;
    window.SupportEvents = SupportEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var body = document.body;
            if (!body) return;
            if (body.hasAttribute('data-broker-support-page') ||
                document.querySelector('[data-support-root]') ||
                document.querySelector('.wam-broker-support-page')) {
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




/* ==========================================
 * FROM: js/broker-chat.js
 * ========================================== */


// ==========================================
// وام پی — Broker Panel
// فایل: broker-chat.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: گفتگوی آنلاین کارگزار — گفتگو با ادمین/پشتیبانی
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var CHATS_KEY   = 'wamPayChats';
    var USERS_KEY   = 'wamPayUsers';
    var BROKERS_KEY = 'wamPayBrokers';

    var MAX_MSG_LEN = 1000;
    var POLL_MS     = 8000;    // نظرسنجی برای پیام‌های جدید (شبیه‌سازی real-time)

    var CHAT_STATUS = {
        open:    'فعال',
        closed:  'بسته‌شده',
        pending: 'در انتظار'
    };

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        broker: null,
        currentUser: null,
        chats: [],
        activeChatId: null,
        activeChat: null,
        submitting: false,
        pollTimer: null,
        listeners: [],
        lastCount: 0
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var ChatEvents = {
        LOADED:       'broker.chat.loaded',
        CHAT_SELECTED:'broker.chat.selected',
        MSG_SENT:     'broker.chat.message_sent',
        MSG_RECEIVED: 'broker.chat.message_received',
        CHAT_CREATED: 'broker.chat.created',
        CHAT_CLOSED:  'broker.chat.closed',
        UPDATED:      'broker.chat.updated',
        FAIL:         'broker.chat.fail'
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

    function _formatTime(ts) {
        if (!ts) return '';
        try {
            var d = new Date(ts);
            var h = ('0' + d.getHours()).slice(-2);
            var m = ('0' + d.getMinutes()).slice(-2);
            var fa = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
            return (h + ':' + m).replace(/[0-9]/g, function (ch) { return fa[+ch]; });
        } catch (e) {
            return '';
        }
    }

    function _generateId(prefix) {
        var r = Math.random().toString(36).slice(2, 8);
        return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + r;
    }

    function _generateChatCode() {
        var r = Math.random().toString(36).slice(2, 6).toUpperCase();
        return 'CH-' + r;
    }

    function _currentUserId() {
        if (typeof WamPermissions === 'undefined') return null;
        var me = WamPermissions.getCurrentUser();
        return me ? me.id : null;
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری / ذخیره
    // ─────────────────────────────────────
    function _loadAllChats() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(CHATS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveAllChats(chats) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(CHATS_KEY, chats);
    }

    function _loadBroker() {
        if (typeof Storage === 'undefined') return null;
        var brokers = Storage.getJSON(BROKERS_KEY, []) || [];
        var user = (typeof WamPermissions !== 'undefined')
            ? WamPermissions.getCurrentUser() : null;
        if (!user) return null;

        for (var i = 0; i < brokers.length; i++) {
            var b = brokers[i];
            if (!b) continue;
            if (b.userId && b.userId === user.id) return b;
            if (b.mobile && user.mobile &&
                String(b.mobile).replace(/\D/g, '') ===
                String(user.mobile).replace(/\D/g, '')) return b;
        }
        return null;
    }

    function _loadAdmins() {
        if (typeof Storage === 'undefined') return [];
        var users = Storage.getJSON(USERS_KEY, []) || [];
        var admins = [];
        for (var i = 0; i < users.length; i++) {
            var u = users[i];
            if (!u) continue;
            if ((u.role === 'admin' || u.role === 'super_admin') &&
                u.active !== false) {
                admins.push({
                    id: u.id,
                    name: u.name || u.username,
                    role: u.role
                });
            }
        }
        return admins;
    }

    // ─────────────────────────────────────
    // 📊 آمار چت‌ها
    // ─────────────────────────────────────
    function computeStats() {
        var stats = { total: 0, open: 0, closed: 0, unread: 0, totalMessages: 0 };
        for (var i = 0; i < STATE.chats.length; i++) {
            var c = STATE.chats[i];
            if (!c) continue;
            stats.total++;
            if (c.status === 'closed') stats.closed++;
            else stats.open++;
            if (Array.isArray(c.messages)) {
                stats.totalMessages += c.messages.length;
                for (var j = 0; j < c.messages.length; j++) {
                    var m = c.messages[j];
                    if (m && !m.readByBroker && m.from !== 'broker') {
                        stats.unread++;
                    }
                }
            }
        }
        return stats;
    }

    // ─────────────────────────────────────
    // 🎯 ایجاد چت جدید
    // ─────────────────────────────────────
    function createChat(options) {
        options = options || {};
        var result = { ok: false, reason: null, chat: null };

        if (!STATE.broker) {
            result.reason = 'no_broker';
            return result;
        }

        // اگر چت باز وجود دارد، همان را برگردان
        for (var i = 0; i < STATE.chats.length; i++) {
            if (STATE.chats[i].status !== 'closed') {
                result.ok = true;
                result.chat = STATE.chats[i];
                result.reason = 'existing';
                return result;
            }
        }

        var now = Date.now();
        var admins = _loadAdmins();
        var assignedAdmin = options.adminId || (admins[0] ? admins[0].id : null);

        var chat = {
            id: _generateId('chat'),
            code: _generateChatCode(),
            brokerId: STATE.broker.id,
            brokerName: STATE.broker.name,
            brokerCode: STATE.broker.brokerCode,
            subject: options.subject || 'گفتگو با پشتیبانی',
            assignedAdminId: assignedAdmin,
            status: 'open',
            createdAt: now,
            updatedAt: now,
            messages: [
                {
                    id: _generateId('msg'),
                    from: 'system',
                    fromName: 'سیستم',
                    text: 'گفتگو آغاز شد. پیام خود را بنویسید.',
                    at: now,
                    readByBroker: true
                }
            ]
        };

        var all = _loadAllChats();
        all.push(chat);
        if (!_saveAllChats(all)) {
            result.reason = 'storage_error';
            return result;
        }

        STATE.chats = _loadMyChats();

        result.ok = true;
        result.chat = chat;

        _emit(ChatEvents.CHAT_CREATED, {
            chatId: chat.id, code: chat.code, at: now
        });

        return result;
    }

    function _loadMyChats() {
        if (!STATE.broker) return [];
        var all = _loadAllChats();
        var mine = [];
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (!c) continue;
            if (c.brokerId === STATE.broker.id) mine.push(c);
        }
        mine.sort(function (a, b) {
            return (b.updatedAt || b.createdAt || 0) -
                   (a.updatedAt || a.createdAt || 0);
        });
        return mine;
    }

    // ─────────────────────────────────────
    // 📨 ارسال پیام
    // ─────────────────────────────────────
    function sendMessage(chatId, text) {
        var result = { ok: false, reason: null, message: null };

        if (!text || String(text).trim().length === 0) {
            result.reason = 'empty';
            return result;
        }
        if (String(text).length > MAX_MSG_LEN) {
            result.reason = 'too_long';
            return result;
        }

        var all = _loadAllChats();
        var chat = null;
        var idx = -1;
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].id === chatId) {
                chat = all[i];
                idx = i;
                break;
            }
        }
        if (!chat) { result.reason = 'not_found'; return result; }
        if (chat.brokerId !== STATE.broker.id) {
            result.reason = 'forbidden'; return result;
        }
        if (chat.status === 'closed') {
            result.reason = 'closed'; return result;
        }

        var now = Date.now();
        var msg = {
            id: _generateId('msg'),
            from: 'broker',
            fromId: STATE.currentUser ? STATE.currentUser.id : null,
            fromName: STATE.broker.name || 'کارگزار',
            text: String(text).trim(),
            at: now,
            readByBroker: true,
            readByAdmin: false
        };

        if (!Array.isArray(chat.messages)) chat.messages = [];
        chat.messages.push(msg);
        chat.updatedAt = now;

        if (!_saveAllChats(all)) {
            result.reason = 'storage_error';
            return result;
        }

        STATE.chats = _loadMyChats();
        if (STATE.activeChatId === chatId) {
            STATE.activeChat = chat;
        }

        result.ok = true;
        result.message = msg;

        _emit(ChatEvents.MSG_SENT, {
            chatId: chatId, messageId: msg.id, at: now
        });
        _emit(ChatEvents.UPDATED, { chatId: chatId, at: now });

        return result;
    }

    // ─────────────────────────────────────
    // 🔒 بستن چت
    // ─────────────────────────────────────
    function closeChat(chatId) {
        var all = _loadAllChats();
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (!c || c.id !== chatId) continue;
            if (c.brokerId !== STATE.broker.id) return { ok: false, reason: 'forbidden' };
            if (c.status === 'closed') return { ok: false, reason: 'already_closed' };

            c.status = 'closed';
            c.closedAt = Date.now();
            c.updatedAt = Date.now();

            if (!Array.isArray(c.messages)) c.messages = [];
            c.messages.push({
                id: _generateId('msg'),
                from: 'system',
                fromName: 'سیستم',
                text: 'گفتگو توسط کارگزار بسته شد.',
                at: Date.now(),
                readByBroker: true
            });

            if (!_saveAllChats(all)) return { ok: false, reason: 'storage_error' };

            STATE.chats = _loadMyChats();
            if (STATE.activeChatId === chatId) {
                STATE.activeChat = c;
            }

            _emit(ChatEvents.CHAT_CLOSED, { chatId: chatId, at: Date.now() });
            return { ok: true, chat: c };
        }
        return { ok: false, reason: 'not_found' };
    }

    // ─────────────────────────────────────
    // ✅ علامت‌گذاری خوانده‌شده
    // ─────────────────────────────────────
    function markAsRead(chatId) {
        var all = _loadAllChats();
        var changed = false;
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (!c || c.id !== chatId) continue;
            if (!Array.isArray(c.messages)) continue;
            for (var j = 0; j < c.messages.length; j++) {
                var m = c.messages[j];
                if (m && !m.readByBroker && m.from !== 'broker') {
                    m.readByBroker = true;
                    changed = true;
                }
            }
            if (changed) {
                if (!_saveAllChats(all)) return false;
                STATE.chats = _loadMyChats();
                if (STATE.activeChatId === chatId) STATE.activeChat = c;
                _emit(ChatEvents.UPDATED, { chatId: chatId, at: Date.now() });
            }
            return changed;
        }
        return false;
    }

    // ─────────────────────────────────────
    // 📊 پیام‌های خوانده‌نشده
    // ─────────────────────────────────────
    function _unreadCount(chat) {
        if (!chat || !Array.isArray(chat.messages)) return 0;
        var n = 0;
        for (var i = 0; i < chat.messages.length; i++) {
            var m = chat.messages[i];
            if (m && !m.readByBroker && m.from !== 'broker') n++;
        }
        return n;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — لیست چت‌ها
    // ─────────────────────────────────────
    function _renderChatList() {
        if (STATE.chats.length === 0) {
            return '<div class="wam-empty">هنوز گفتگویی ندارید.</div>';
        }
        var html = '<ul class="wam-chat-list">';
        for (var i = 0; i < STATE.chats.length; i++) {
            var c = STATE.chats[i];
            var unread = _unreadCount(c);
            var last = (c.messages && c.messages.length > 0)
                ? c.messages[c.messages.length - 1] : null;
            var st = c.status || 'open';
            html += '<li class="wam-chat-item' +
                    (STATE.activeChatId === c.id ? ' is-active' : '') +
                    (unread > 0 ? ' has-unread' : '') + '" ' +
                    'data-chat-id="' + _escapeHtml(c.id) + '">' +
                    '<div class="wam-chat-item__head">' +
                        '<code>' + _escapeHtml(c.code) + '</code>' +
                        '<span class="wam-chat-item__status wam-chat-item__status--' +
                        _escapeHtml(st) + '">' +
                        _escapeHtml(CHAT_STATUS[st] || st) + '</span>' +
                    '</div>' +
                    '<div class="wam-chat-item__subject">' +
                        _escapeHtml(c.subject || '—') + '</div>' +
                    '<div class="wam-chat-item__preview">' +
                        (last ? _escapeHtml(String(last.text).slice(0, 60)) : '—') +
                    '</div>' +
                    '<div class="wam-chat-item__foot">' +
                        '<span>' + _escapeHtml(_relativeTime(c.updatedAt)) + '</span>' +
                        (unread > 0
                            ? '<span class="wam-chat-item__badge">' +
                              _formatNumber(unread) + '</span>'
                            : '') +
                    '</div></li>';
        }
        html += '</ul>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — پنجره گفتگو
    // ─────────────────────────────────────
    function _renderChatWindow() {
        var c = STATE.activeChat;
        if (!c) {
            return '<div class="wam-chat-window__empty">' +
                   '<div class="wam-empty">یک گفتگو را انتخاب کنید یا گفتگوی جدید بسازید.</div>' +
                   '</div>';
        }

        var st = c.status || 'open';
        var isClosed = st === 'closed';
        var messages = Array.isArray(c.messages) ? c.messages : [];

        var html = '<div class="wam-chat-window">';

        // هدر
        html += '<header class="wam-chat-window__head">' +
                '<div>' +
                    '<code>' + _escapeHtml(c.code) + '</code> ' +
                    '<strong>' + _escapeHtml(c.subject || '—') + '</strong>' +
                '</div>' +
                '<span class="wam-chat-item__status wam-chat-item__status--' +
                _escapeHtml(st) + '">' +
                _escapeHtml(CHAT_STATUS[st] || st) + '</span>' +
                (isClosed ? '' :
                    '<button class="wam-btn-icon" data-chat-action="close" ' +
                    'title="بستن گفتگو">🔒</button>') +
                '</header>';

        // پیام‌ها
        html += '<div class="wam-chat-window__messages" data-chat="messages">';
        for (var i = 0; i < messages.length; i++) {
            html += _renderMessage(messages[i]);
        }
        html += '</div>';

        // ارسال
        if (isClosed) {
            html += '<div class="wam-chat-window__closed">' +
                    'این گفتگو بسته شده است.</div>';
        } else {
            html += '<form class="wam-chat-window__composer" ' +
                    'data-chat="form" onsubmit="return false">' +
                    '<textarea name="message" rows="2" ' +
                    'placeholder="پیام خود را بنویسید..." ' +
                    'maxlength="' + MAX_MSG_LEN + '"></textarea>' +
                    '<button type="submit" class="wam-btn wam-btn--primary" ' +
                    'data-chat-action="send">📤</button>' +
                    '</form>';
        }

        html += '</div>';
        return html;
    }

    function _renderMessage(m) {
        if (!m) return '';
        var from = m.from || 'system';
        var cls = 'wam-chat-msg wam-chat-msg--' + from;
        var isSystem = from === 'system';

        if (isSystem) {
            return '<div class="wam-chat-msg wam-chat-msg--system">' +
                   '<div class="wam-chat-msg__text">' +
                   _escapeHtml(m.text) + '</div>' +
                   '<div class="wam-chat-msg__time">' +
                   _escapeHtml(_formatTime(m.at)) + '</div></div>';
        }

        return '<div class="' + cls + '">' +
               '<div class="wam-chat-msg__bubble">' +
                   '<div class="wam-chat-msg__name">' +
                   _escapeHtml(m.fromName || '') + '</div>' +
                   '<div class="wam-chat-msg__text">' +
                   _escapeHtml(m.text) + '</div>' +
                   '<div class="wam-chat-msg__time">' +
                   _escapeHtml(_formatTime(m.at)) +
                   (m.from === 'broker' && m.readByAdmin ? ' ✓✓' : '') +
                   '</div>' +
               '</div></div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;

        var html =
            '<div class="wam-broker-chat">' +
                '<aside class="wam-chat-sidebar">' +
                    '<header class="wam-chat-sidebar__head">' +
                        '<h3>💬 گفتگوها</h3>' +
                        '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
                        'data-chat-action="new">➕ جدید</button>' +
                    '</header>' +
                    '<div class="wam-chat-sidebar__list">' +
                        _renderChatList() +
                    '</div>' +
                '</aside>' +
                '<main class="wam-chat-main">' +
                    _renderChatWindow() +
                '</main>' +
            '</div>';

        STATE.root.innerHTML = html;
        _bindEvents();

        // اسکرول به آخرین پیام
        _scrollToBottom();
    }

    function _scrollToBottom() {
        var box = STATE.root && STATE.root.querySelector('[data-chat="messages"]');
        if (box) {
            try { box.scrollTop = box.scrollHeight; } catch (e) { /* بی‌صدا */ }
        }
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents() {
        if (!STATE.root) return;

        // آیتم‌های لیست
        var items = STATE.root.querySelectorAll('[data-chat-id]');
        for (var i = 0; i < items.length; i++) {
            items[i].addEventListener('click', _handleChatClick);
        }

        // اکشن‌ها
        var btns = STATE.root.querySelectorAll('[data-chat-action]');
        for (var j = 0; j < btns.length; j++) {
            btns[j].addEventListener('click', _handleAction);
        }

        // فرم
        var form = STATE.root.querySelector('[data-chat="form"]');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                _handleSend();
            });
            var ta = form.querySelector('textarea');
            if (ta) {
                ta.addEventListener('keydown', function (e) {
                    // Ctrl+Enter برای ارسال
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        _handleSend();
                    }
                });
            }
        }
    }

    function _handleChatClick(e) {
        e.preventDefault();
        var id = this.getAttribute('data-chat-id');
        if (!id) return;
        selectChat(id);
    }

    function _handleAction(e) {
        e.preventDefault();
        var action = this.getAttribute('data-chat-action');
        if (action === 'new') { _handleNewChat(); return; }
        if (action === 'send') { _handleSend(); return; }
        if (action === 'close') { _confirmClose(); return; }
    }

    function _handleNewChat() {
        // اگر چت باز داریم، همان را انتخاب کن
        var r = createChat();
        if (!r.ok) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('خطا در ایجاد گفتگو', 'خطا');
            }
            return;
        }
        STATE.chats = _loadMyChats();
        selectChat(r.chat.id);
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess(
                r.reason === 'existing'
                    ? 'گفتگوی باز انتخاب شد'
                    : 'گفتگوی جدید ساخته شد',
                'موفق'
            );
        }
    }

    function _handleSend() {
        if (!STATE.activeChatId) return;
        if (STATE.submitting) return;

        var form = STATE.root && STATE.root.querySelector('[data-chat="form"]');
        if (!form) return;
        var ta = form.querySelector('textarea');
        if (!ta) return;

        var text = ta.value;
        if (!text || text.trim().length === 0) return;

        STATE.submitting = true;
        var r = sendMessage(STATE.activeChatId, text);
        STATE.submitting = false;

        if (!r.ok) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError(
                    'خطا در ارسال: ' + (r.reason || 'نامشخص'),
                    'خطا'
                );
            }
            return;
        }

        ta.value = '';
        render();
    }

    function _confirmClose() {
        if (!STATE.activeChatId) return;
        var chat = STATE.activeChat;
        var msg = 'این گفتگو بسته شود؟ پس از بستن امکان ارسال پیام جدید نیست.';
        var doClose = function () {
            var r = closeChat(STATE.activeChatId);
            if (r.ok) {
                if (typeof WamUI !== 'undefined') {
                    WamUI.toastSuccess('گفتگو بسته شد', 'موفق');
                }
                render();
            }
        };
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('بستن گفتگو', msg, { danger: true }).then(function (ok) {
                if (ok) doClose();
            });
        } else if (window.confirm(msg)) {
            doClose();
        }
    }

    // ─────────────────────────────────────
    // 🎯 انتخاب چت
    // ─────────────────────────────────────
    function selectChat(chatId) {
        if (!chatId) return false;
        var found = null;
        for (var i = 0; i < STATE.chats.length; i++) {
            if (STATE.chats[i].id === chatId) { found = STATE.chats[i]; break; }
        }
        if (!found) return false;

        STATE.activeChatId = chatId;
        STATE.activeChat = found;
        markAsRead(chatId);
        render();

        _emit(ChatEvents.CHAT_SELECTED, {
            chatId: chatId, code: found.code, at: Date.now()
        });
        return true;
    }

    // ─────────────────────────────────────
    // 🔄 بروزرسانی
    // ─────────────────────────────────────
    function reload() {
        STATE.chats = _loadMyChats();
        if (STATE.activeChatId) {
            var found = null;
            for (var i = 0; i < STATE.chats.length; i++) {
                if (STATE.chats[i].id === STATE.activeChatId) {
                    found = STATE.chats[i];
                    break;
                }
            }
            STATE.activeChat = found;
        }
        render();
        _emit(ChatEvents.LOADED, {
            count: STATE.chats.length, at: Date.now()
        });
    }

    // ─────────────────────────────────────
    // 🔁 نظرسنجی خودکار
    // ─────────────────────────────────────
    function _startPolling() {
        _stopPolling();
        STATE.pollTimer = setInterval(function () {
            try {
                var before = STATE.chats.length;
                var oldUnread = computeStats().unread;
                STATE.chats = _loadMyChats();
                var afterUnread = computeStats().unread;

                // بررسی تغییرات
                if (STATE.activeChatId) {
                    var found = null;
                    for (var i = 0; i < STATE.chats.length; i++) {
                        if (STATE.chats[i].id === STATE.activeChatId) {
                            found = STATE.chats[i]; break;
                        }
                    }
                    if (found) STATE.activeChat = found;
                }

                if (afterUnread > oldUnread) {
                    _emit(ChatEvents.MSG_RECEIVED, {
                        unread: afterUnread, at: Date.now()
                    });
                }
                if (before !== STATE.chats.length || afterUnread !== oldUnread) {
                    render();
                }
            } catch (e) { /* بی‌صدا */ }
        }, POLL_MS);
    }

    function _stopPolling() {
        if (STATE.pollTimer) {
            clearInterval(STATE.pollTimer);
            STATE.pollTimer = null;
        }
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var user = (typeof WamPermissions !== 'undefined')
            ? WamPermissions.getCurrentUser() : null;
        if (!user) {
            if (typeof WamPayGuard !== 'undefined') {
                WamPayGuard.redirectToLogin('not_logged_in');
            }
            return;
        }
        if (user.role !== 'broker' && user.role !== 'admin' &&
            user.role !== 'super_admin') {
            if (typeof WamPayGuard !== 'undefined') {
                WamPayGuard.redirectToRoleHome(user.role);
            }
            return;
        }

        var run = function () {
            var root = options.root ||
                       document.querySelector('[data-chat-root]') ||
                       document.querySelector('.wam-broker-chat-page');
            if (!root) {
                if (options.debug) console.warn('[broker-chat] root پیدا نشد');
                return;
            }
            STATE.root = root;
            STATE.currentUser = user;
            STATE.broker = _loadBroker();

            if (!STATE.broker) {
                STATE.root.innerHTML =
                    '<div class="wam-empty">اطلاعات کارگزار یافت نشد.</div>';
                return;
            }

            STATE.chats = _loadMyChats();

            // انتخاب اولین چت اگر موجود
            if (STATE.chats.length > 0 && !STATE.activeChatId) {
                STATE.activeChatId = STATE.chats[0].id;
                STATE.activeChat = STATE.chats[0];
                markAsRead(STATE.activeChatId);
            }

            render();

            // نظرسنجی خودکار
            if (options.polling !== false) {
                _startPolling();
            }

            STATE.installed = true;

            _emit(ChatEvents.LOADED, {
                count: STATE.chats.length,
                unread: computeStats().unread,
                at: Date.now()
            });

            if (options.debug) {
                console.log('[broker-chat] آماده، ' +
                    STATE.chats.length + ' گفتگو');
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run);
        } else {
            run();
        }
    }

    function uninstall() {
        _stopPolling();
        STATE.root = null;
        STATE.installed = false;
        STATE.activeChatId = null;
        STATE.activeChat = null;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            brokerId: STATE.broker ? STATE.broker.id : null,
            chatsCount: STATE.chats.length,
            activeChatId: STATE.activeChatId,
            activeChatMessages: STATE.activeChat && STATE.activeChat.messages
                ? STATE.activeChat.messages.length : 0,
            unread: computeStats().unread,
            polling: !!STATE.pollTimer
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
    var WamBrokerChat = {
        EVENTS: ChatEvents,
        CHAT_STATUS: CHAT_STATUS,
        MAX_MSG_LEN: MAX_MSG_LEN,
        POLL_MS: POLL_MS,

        install: install,
        uninstall: uninstall,
        reload: reload,
        render: render,

        createChat: createChat,
        selectChat: selectChat,
        sendMessage: sendMessage,
        closeChat: closeChat,
        markAsRead: markAsRead,

        computeStats: computeStats,
        getMyChats: function () { return STATE.chats.slice(); },
        getActiveChat: function () { return STATE.activeChat; },

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamBrokerChat = WamBrokerChat;
    window.ChatEvents = ChatEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var body = document.body;
            if (!body) return;
            if (body.hasAttribute('data-broker-chat-page') ||
                document.querySelector('[data-chat-root]') ||
                document.querySelector('.wam-broker-chat-page')) {
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




/* ==========================================
 * FROM: js/broker-notifications.js
 * ========================================== */


// ==========================================
// وام پی — Broker Panel
// فایل: broker-notifications.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: اعلان‌های کارگزار — لیست، علامت‌گذاری، فیلتر، badge
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var NOTIFS_KEY  = 'wamPayBrokerNotifs';
    var CHATS_KEY   = 'wamPayChats';
    var BROKERS_KEY = 'wamPayBrokers';
    var PAGE_SIZE   = 20;

    var TYPE_LABELS = {
        case:    'پرونده',
        wallet:  'کیف پول',
        chat:    'گفتگو',
        support: 'پشتیبانی',
        system:  'سیستم',
        profile: 'پروفایل'
    };

    var TYPE_ICONS = {
        case:    '📁',
        wallet:  '💰',
        chat:    '💬',
        support: '🎧',
        system:  '🔔',
        profile: '👤'
    };

    var PRIORITY_LEVELS = {
        low:    { label: 'کم',    order: 1 },
        normal: { label: 'معمولی', order: 2 },
        high:   { label: 'بالا',  order: 3 },
        urgent: { label: 'فوری',  order: 4 }
    };

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        broker: null,
        notifications: [],
        filtered: [],
        page: 1,
        typeFilter: '',
        unreadOnly: false,
        listeners: [],
        lastCount: 0
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var NotifEvents = {
        LOADED:      'broker.notifs.loaded',
        ADDED:       'broker.notifs.added',
        READ:        'broker.notifs.read',
        READ_ALL:    'broker.notifs.read_all',
        DELETED:     'broker.notifs.deleted',
        CLEARED:     'broker.notifs.cleared',
        FILTERED:    'broker.notifs.filtered',
        BADGE_CHANGE:'broker.notifs.badge_change'
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

    function _generateId() {
        var r = Math.random().toString(36).slice(2, 8);
        return 'n_' + Date.now().toString(36) + '_' + r;
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری / ذخیره
    // ─────────────────────────────────────
    function _loadAll() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(NOTIFS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveAll(list) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(NOTIFS_KEY, list);
    }

    function _loadBroker() {
        if (typeof Storage === 'undefined') return null;
        var brokers = Storage.getJSON(BROKERS_KEY, []) || [];
        var user = (typeof WamPermissions !== 'undefined')
            ? WamPermissions.getCurrentUser() : null;
        if (!user) return null;

        for (var i = 0; i < brokers.length; i++) {
            var b = brokers[i];
            if (!b) continue;
            if (b.userId && b.userId === user.id) return b;
            if (b.mobile && user.mobile &&
                String(b.mobile).replace(/\D/g, '') ===
                String(user.mobile).replace(/\D/g, '')) return b;
        }
        return null;
    }

    function _loadMy() {
        if (!STATE.broker) return [];
        var all = _loadAll();
        var mine = [];
        for (var i = 0; i < all.length; i++) {
            var n = all[i];
            if (!n) continue;
            if (n.brokerId === STATE.broker.id) mine.push(n);
        }
        mine.sort(function (a, b) {
            if (!!a.read !== !!b.read) return a.read ? 1 : -1;
            var pa = (PRIORITY_LEVELS[a.priority] || {}).order || 2;
            var pb = (PRIORITY_LEVELS[b.priority] || {}).order || 2;
            if (pa !== pb) return pb - pa;
            return (b.createdAt || 0) - (a.createdAt || 0);
        });
        return mine;
    }

    // ─────────────────────────────────────
    // 📊 آمار
    // ─────────────────────────────────────
    function computeStats() {
        var stats = {
            total: STATE.notifications.length,
            unread: 0,
            byType: { case: 0, wallet: 0, chat: 0, support: 0, system: 0, profile: 0 }
        };
        for (var i = 0; i < STATE.notifications.length; i++) {
            var n = STATE.notifications[i];
            if (!n) continue;
            if (!n.read) stats.unread++;
            var t = n.type || 'system';
            if (stats.byType[t] !== undefined) stats.byType[t]++;
        }
        return stats;
    }

    // ─────────────────────────────────────
    // ➕ افزودن اعلان (معمولاً از رویدادها)
    // ─────────────────────────────────────
    function addNotification(data) {
        if (!data || !data.text) return { ok: false, reason: 'invalid' };
        if (!STATE.broker) return { ok: false, reason: 'no_broker' };

        var notif = {
            id: _generateId(),
            brokerId: STATE.broker.id,
            type: data.type || 'system',
            priority: data.priority || 'normal',
            title: data.title || (TYPE_LABELS[data.type] || 'اعلان'),
            text: String(data.text).trim(),
            link: data.link || null,
            meta: data.meta || null,
            read: false,
            createdAt: data.createdAt || Date.now()
        };

        var all = _loadAll();
        all.push(notif);
        if (!_saveAll(all)) {
            return { ok: false, reason: 'storage_error' };
        }

        STATE.notifications = _loadMy();
        _emit(NotifEvents.ADDED, {
            notification: {
                id: notif.id,
                type: notif.type,
                text: notif.text
            },
            at: Date.now()
        });
        _updateBadge();

        return { ok: true, notification: notif };
    }

    // ─────────────────────────────────────
    // ✅ خواندن
    // ─────────────────────────────────────
    function markAsRead(id) {
        var all = _loadAll();
        for (var i = 0; i < all.length; i++) {
            var n = all[i];
            if (!n || n.id !== id) continue;
            if (n.brokerId !== STATE.broker.id) return false;
            if (n.read) return true;
            n.read = true;
            n.readAt = Date.now();
            if (!_saveAll(all)) return false;
            STATE.notifications = _loadMy();
            _emit(NotifEvents.READ, { id: id, at: Date.now() });
            _updateBadge();
            return true;
        }
        return false;
    }

    function markAllAsRead() {
        var all = _loadAll();
        var count = 0;
        for (var i = 0; i < all.length; i++) {
            var n = all[i];
            if (!n || n.brokerId !== STATE.broker.id) continue;
            if (n.read) continue;
            n.read = true;
            n.readAt = Date.now();
            count++;
        }
        if (count === 0) return { ok: true, count: 0 };
        if (!_saveAll(all)) return { ok: false, reason: 'storage_error' };

        STATE.notifications = _loadMy();
        _emit(NotifEvents.READ_ALL, { count: count, at: Date.now() });
        _updateBadge();
        return { ok: true, count: count };
    }

    // ─────────────────────────────────────
    // 🗑️ حذف
    // ─────────────────────────────────────
    function deleteNotification(id) {
        var all = _loadAll();
        var idx = -1;
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].id === id) { idx = i; break; }
        }
        if (idx === -1) return { ok: false, reason: 'not_found' };
        if (all[idx].brokerId !== STATE.broker.id) {
            return { ok: false, reason: 'forbidden' };
        }

        var removed = all.splice(idx, 1)[0];
        if (!_saveAll(all)) {
            all.splice(idx, 0, removed);
            return { ok: false, reason: 'storage_error' };
        }

        STATE.notifications = _loadMy();
        _emit(NotifEvents.DELETED, { id: id, at: Date.now() });
        _updateBadge();
        return { ok: true };
    }

    function clearAll() {
        var all = _loadAll();
        var remaining = [];
        var count = 0;
        for (var i = 0; i < all.length; i++) {
            var n = all[i];
            if (n && n.brokerId === STATE.broker.id) {
                count++;
                continue;
            }
            remaining.push(n);
        }
        if (count === 0) return { ok: true, count: 0 };
        if (!_saveAll(remaining)) return { ok: false, reason: 'storage_error' };

        STATE.notifications = _loadMy();
        _emit(NotifEvents.CLEARED, { count: count, at: Date.now() });
        _updateBadge();
        return { ok: true, count: count };
    }

    function clearRead() {
        var all = _loadAll();
        var remaining = [];
        var count = 0;
        for (var i = 0; i < all.length; i++) {
            var n = all[i];
            if (n && n.brokerId === STATE.broker.id && n.read) {
                count++;
                continue;
            }
            remaining.push(n);
        }
        if (count === 0) return { ok: true, count: 0 };
        if (!_saveAll(remaining)) return { ok: false, reason: 'storage_error' };

        STATE.notifications = _loadMy();
        _emit(NotifEvents.CLEARED, { count: count, onlyRead: true, at: Date.now() });
        _updateBadge();
        return { ok: true, count: count };
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر
    // ─────────────────────────────────────
    function _applyFilters() {
        var tf = STATE.typeFilter;
        var unreadOnly = STATE.unreadOnly;

        STATE.filtered = STATE.notifications.filter(function (n) {
            if (!n) return false;
            if (tf && n.type !== tf) return false;
            if (unreadOnly && n.read) return false;
            return true;
        });

        _emit(NotifEvents.FILTERED, {
            count: STATE.filtered.length,
            type: tf,
            unreadOnly: unreadOnly
        });
        return STATE.filtered;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ردیف اعلان
    // ─────────────────────────────────────
    function _renderRow(n) {
        var type = n.type || 'system';
        var icon = TYPE_ICONS[type] || '🔔';
        var typeLabel = TYPE_LABELS[type] || type;
        var priority = PRIORITY_LEVELS[n.priority] || PRIORITY_LEVELS.normal;
        var isRead = !!n.read;
        var priorityClass = (n.priority && n.priority !== 'normal')
            ? ' wam-notif--priority-' + n.priority : '';

        var html = '<li class="wam-notif' +
            (isRead ? ' wam-notif--read' : ' wam-notif--unread') +
            priorityClass + '" data-notif-id="' + _escapeHtml(n.id) + '">';

        html += '<div class="wam-notif__icon">' + icon + '</div>';

        html += '<div class="wam-notif__body">';
        html += '<div class="wam-notif__head">';
        html += '<span class="wam-notif__title">' +
                _escapeHtml(n.title || typeLabel) + '</span>';
        if (!isRead) {
            html += '<span class="wam-notif__dot"></span>';
        }
        html += '<span class="wam-notif__time">' +
                _escapeHtml(_relativeTime(n.createdAt)) + '</span>';
        html += '</div>';
        html += '<div class="wam-notif__text">' +
                _escapeHtml(n.text) + '</div>';

        if (n.link) {
            html += '<a class="wam-notif__link" href="' +
                    _escapeHtml(n.link) + '">مشاهده ›</a>';
        }
        html += '</div>';

        html += '<div class="wam-notif__actions">';
        if (!isRead) {
            html += '<button class="wam-btn-icon" ' +
                    'data-notif-action="read" title="خوانده شد">✓</button>';
        }
        html += '<button class="wam-btn-icon wam-btn-icon--danger" ' +
                'data-notif-action="delete" title="حذف">🗑️</button>';
        html += '</div>';

        html += '</li>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — لیست اعلان‌ها
    // ─────────────────────────────────────
    function _renderList() {
        if (!STATE.root) return;
        var box = STATE.root.querySelector('[data-notif="list"]');
        if (!box) return;

        var list = STATE.filtered;
        var start = (STATE.page - 1) * PAGE_SIZE;
        var end = Math.min(start + PAGE_SIZE, list.length);
        var items = list.slice(start, end);

        if (items.length === 0) {
            box.innerHTML = '<div class="wam-empty">' +
                (STATE.notifications.length === 0
                    ? 'اعلانی ندارید.'
                    : 'نتیجه‌ای برای فیلتر فعلی نیست.') +
                '</div>';
            _renderPagination(0);
            return;
        }

        var html = '<ul class="wam-notif-list">';
        for (var i = 0; i < items.length; i++) {
            html += _renderRow(items[i]);
        }
        html += '</ul>';
        box.innerHTML = html;

        _renderPagination(list.length);
        _bindRowActions(box);
    }

    function _renderPagination(total) {
        if (!STATE.root) return;
        var el = STATE.root.querySelector('[data-notif="pagination"]');
        if (!el) return;

        var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (pages <= 1) { el.innerHTML = ''; return; }

        var html = '<button data-notif-page="' + (STATE.page - 1) + '"' +
                   (STATE.page === 1 ? ' disabled' : '') + '>‹ قبلی</button>';
        html += '<span>صفحه ' + _formatNumber(STATE.page) + ' از ' +
                _formatNumber(pages) + '</span>';
        html += '<button data-notif-page="' + (STATE.page + 1) + '"' +
                (STATE.page === pages ? ' disabled' : '') + '>بعدی ›</button>';
        el.innerHTML = html;

        var btns = el.querySelectorAll('[data-notif-page]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function () {
                var p = parseInt(this.getAttribute('data-notif-page'), 10);
                if (isNaN(p) || p < 1 || p > pages) return;
                STATE.page = p;
                _renderList();
            });
        }
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نوار بالایی
    // ─────────────────────────────────────
    function _renderHeader() {
        var s = computeStats();
        return '' +
            '<header class="wam-notif-header">' +
                '<div class="wam-notif-header__title">' +
                    '<h3>🔔 اعلان‌ها</h3>' +
                    (s.unread > 0
                        ? '<span class="wam-notif-header__badge">' +
                          _formatNumber(s.unread) + '</span>'
                        : '') +
                '</div>' +
                '<div class="wam-notif-header__actions">' +
                    '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-notif-action="read-all" ' +
                    (s.unread === 0 ? 'disabled' : '') + '>' +
                    '✓ خواندن همه</button>' +
                    '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-notif-action="clear-read" ' +
                    'title="حذف خوانده‌شده‌ها">🧹</button>' +
                    '<button class="wam-btn wam-btn--sm wam-btn--ghost ' +
                    'wam-btn--danger" data-notif-action="clear-all" ' +
                    'title="حذف همه">🗑️</button>' +
                '</div>' +
            '</header>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نوار فیلترها
    // ─────────────────────────────────────
    function _renderFilters() {
        var s = computeStats();
        var opts = '<option value="">همه (' +
                   _formatNumber(s.total) + ')</option>';
        var types = ['case', 'wallet', 'chat', 'support', 'system', 'profile'];
        for (var i = 0; i < types.length; i++) {
            var t = types[i];
            opts += '<option value="' + t + '">' +
                    TYPE_ICONS[t] + ' ' + TYPE_LABELS[t] +
                    ' (' + _formatNumber(s.byType[t] || 0) + ')</option>';
        }

        return '' +
            '<div class="wam-notif-filters">' +
                '<select data-notif="filter-type">' + opts + '</select>' +
                '<label class="wam-check-inline">' +
                    '<input type="checkbox" data-notif="unread-only">' +
                    '<span>فقط خوانده‌نشده‌ها</span>' +
                '</label>' +
            '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;

        _applyFilters();

        var html =
            '<div class="wam-broker-notifs">' +
                _renderHeader() +
                _renderFilters() +
                '<div data-notif="list"></div>' +
                '<div class="wam-pagination" data-notif="pagination"></div>' +
            '</div>';

        STATE.root.innerHTML = html;

        // تنظیم مقادیر فیلتر
        var typeSel = STATE.root.querySelector('[data-notif="filter-type"]');
        if (typeSel) typeSel.value = STATE.typeFilter;
        var unreadCb = STATE.root.querySelector('[data-notif="unread-only"]');
        if (unreadCb) unreadCb.checked = STATE.unreadOnly;

        _renderList();
        _bindActions();
        _updateBadge();
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindActions() {
        if (!STATE.root) return;

        var btns = STATE.root.querySelectorAll('[data-notif-action]');
        for (var i = 0; i < btns.length; i++) {
            if (btns[i].dataset.bound) continue;
            btns[i].addEventListener('click', _handleAction);
            btns[i].dataset.bound = '1';
        }

        var typeSel = STATE.root.querySelector('[data-notif="filter-type"]');
        if (typeSel && !typeSel.dataset.bound) {
            typeSel.addEventListener('change', function () {
                STATE.typeFilter = this.value;
                STATE.page = 1;
                render();
            });
            typeSel.dataset.bound = '1';
        }

        var unreadCb = STATE.root.querySelector('[data-notif="unread-only"]');
        if (unreadCb && !unreadCb.dataset.bound) {
            unreadCb.addEventListener('change', function () {
                STATE.unreadOnly = this.checked;
                STATE.page = 1;
                render();
            });
            unreadCb.dataset.bound = '1';
        }
    }

    function _bindRowActions(box) {
        var btns = box.querySelectorAll('[data-notif-action]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', _handleRowAction);
        }
    }

    function _handleAction(e) {
        e.preventDefault();
        var action = this.getAttribute('data-notif-action');

        if (action === 'read-all') {
            markAllAsRead();
            render();
            if (typeof WamUI !== 'undefined') {
                WamUI.toastSuccess('همه اعلان‌ها خوانده شد', 'موفق');
            }
            return;
        }
        if (action === 'clear-read') {
            _confirmClear(true);
            return;
        }
        if (action === 'clear-all') {
            _confirmClear(false);
            return;
        }
    }

    function _handleRowAction(e) {
        e.preventDefault();
        var action = this.getAttribute('data-notif-action');
        var li = this.closest('[data-notif-id]');
        if (!li) return;
        var id = li.getAttribute('data-notif-id');

        if (action === 'read') {
            markAsRead(id);
            render();
            return;
        }
        if (action === 'delete') {
            deleteNotification(id);
            render();
            return;
        }
    }

    function _confirmClear(onlyRead) {
        var msg = onlyRead
            ? 'همه اعلان‌های خوانده‌شده حذف شوند؟'
            : 'همه اعلان‌ها حذف شوند؟';
        var doIt = function () {
            var r = onlyRead ? clearRead() : clearAll();
            if (r.ok) {
                if (typeof WamUI !== 'undefined') {
                    WamUI.toastSuccess(
                        _formatNumber(r.count) + ' اعلان حذف شد',
                        'موفق'
                    );
                }
                render();
            }
        };
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('حذف اعلان‌ها', msg, { danger: true })
                .then(function (ok) { if (ok) doIt(); });
        } else if (window.confirm(msg)) {
            doIt();
        }
    }

    // ─────────────────────────────────────
    // 🔢 badge
    // ─────────────────────────────────────
    function _updateBadge() {
        var s = computeStats();
        var badges = document.querySelectorAll('[data-notif-badge]');
        for (var i = 0; i < badges.length; i++) {
            if (s.unread > 0) {
                badges[i].textContent = _formatNumber(s.unread);
                badges[i].style.display = '';
            } else {
                badges[i].style.display = 'none';
            }
        }
        if (STATE.lastCount !== s.unread) {
            _emit(NotifEvents.BADGE_CHANGE, {
                unread: s.unread, at: Date.now()
            });
            STATE.lastCount = s.unread;
        }
    }

    function getUnreadCount() {
        return computeStats().unread;
    }

    // ─────────────────────────────────────
    // 🎯 اتصال به رویدادهای سیستم (خودکار)
    // ─────────────────────────────────────
    function _hookSystemEvents() {
        if (typeof EventBus === 'undefined') return;

        // پرونده‌ها
        EventBus.on('case.created', function (d) {
            _autoAdd(d, {
                type: 'case',
                title: 'پرونده جدید',
                text: 'پرونده ' + (d.caseId || '') + ' ثبت شد.'
            });
        });
        EventBus.on('case.completed', function (d) {
            _autoAdd(d, {
                type: 'case',
                title: 'پرونده تکمیل شد',
                text: 'پرونده ' + (d.caseId || '') + ' به پایان رسید.',
                priority: 'high'
            });
        });
        EventBus.on('case.step.rejected', function (d) {
            _autoAdd(d, {
                type: 'case',
                title: 'رد در مرحله',
                text: 'یک مرحله از پرونده ' + (d.caseId || '') + ' رد شد.',
                priority: 'high'
            });
        });

        // اعلان‌ها
        EventBus.on('notif.added', function (d) {
            if (!d || !d.caseId) return;
            _autoAdd(d, {
                type: 'system',
                title: 'اعلان جدید',
                text: d.text || 'اعلان جدیدی دریافت شد.'
            });
        });

        // پیام چت
        EventBus.on('chat.message.sent', function (d) {
            if (!d || d.from === 'broker') return;
            _autoAdd(d, {
                type: 'chat',
                title: 'پیام جدید',
                text: 'پیام جدیدی در گفتگو دریافت شد.'
            });
        });
    }

    function _autoAdd(eventData, template) {
        if (!STATE.broker) return;   // فقط اگر در پنل کارگزار هستیم
        if (!eventData) return;

        // فقط اگر مربوط به کارگزار جاری است
        if (eventData.brokerId && eventData.brokerId !== STATE.broker.id) return;
        if (eventData.caseId) {
            // بررسی که پرونده مربوط به این کارگزار است
            var myCase = false;
            if (typeof CaseRepository !== 'undefined') {
                try {
                    var c = CaseRepository.get(eventData.caseId);
                    if (c && c.brokerId === STATE.broker.id) myCase = true;
                } catch (e) { /* بی‌صدا */ }
            }
            if (!myCase) return;
        }

        addNotification({
            type: template.type,
            title: template.title,
            text: template.text,
            priority: template.priority || 'normal',
            link: eventData.caseId
                ? 'case-details.html?id=' + encodeURIComponent(eventData.caseId)
                : null
        });
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var user = (typeof WamPermissions !== 'undefined')
            ? WamPermissions.getCurrentUser() : null;
        if (!user) {
            if (typeof WamPayGuard !== 'undefined') {
                WamPayGuard.redirectToLogin('not_logged_in');
            }
            return;
        }
        if (user.role !== 'broker' && user.role !== 'admin' &&
            user.role !== 'super_admin') {
            if (typeof WamPayGuard !== 'undefined') {
                WamPayGuard.redirectToRoleHome(user.role);
            }
            return;
        }

        var run = function () {
            STATE.broker = _loadBroker();
            if (!STATE.broker) {
                if (options.debug) console.warn('[broker-notifications] no broker');
                return;
            }

            STATE.notifications = _loadMy();

            // صفحه اختصاصی؟
            var root = options.root ||
                       document.querySelector('[data-notif-root]') ||
                       document.querySelector('.wam-broker-notifs-page');

            if (root) {
                STATE.root = root;
                render();
            } else {
                // فقط badge‌ها را آپدیت کن
                _updateBadge();
            }

            _hookSystemEvents();
            STATE.installed = true;

            _emit(NotifEvents.LOADED, {
                count: STATE.notifications.length,
                unread: computeStats().unread,
                at: Date.now()
            });

            if (options.debug) {
                console.log('[broker-notifications] آماده، ' +
                    STATE.notifications.length + ' اعلان، ' +
                    computeStats().unread + ' خوانده‌نشده');
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
    }

    function reload() {
        STATE.notifications = _loadMy();
        if (STATE.root) render();
        else _updateBadge();
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            brokerId: STATE.broker ? STATE.broker.id : null,
            total: STATE.notifications.length,
            filtered: STATE.filtered.length,
            unread: computeStats().unread,
            page: STATE.page,
            typeFilter: STATE.typeFilter,
            unreadOnly: STATE.unreadOnly
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
    var WamBrokerNotifications = {
        EVENTS: NotifEvents,
        TYPE_LABELS: TYPE_LABELS,
        TYPE_ICONS: TYPE_ICONS,
        PRIORITY_LEVELS: PRIORITY_LEVELS,
        PAGE_SIZE: PAGE_SIZE,

        install: install,
        uninstall: uninstall,
        reload: reload,
        render: render,

        addNotification: addNotification,
        markAsRead: markAsRead,
        markAllAsRead: markAllAsRead,
        deleteNotification: deleteNotification,
        clearAll: clearAll,
        clearRead: clearRead,

        computeStats: computeStats,
        getUnreadCount: getUnreadCount,
        getMyNotifications: function () { return STATE.notifications.slice(); },
        getFiltered: function () { return STATE.filtered.slice(); },

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamBrokerNotifications = WamBrokerNotifications;
    window.NotifEvents = NotifEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var body = document.body;
            if (!body) return;
            if (body.hasAttribute('data-broker-notifs-page') ||
                document.querySelector('[data-notif-root]') ||
                document.querySelector('.wam-broker-notifs-page')) {
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




/* ==========================================
 * FROM: js/broker-wizard.js
 * ========================================== */


// ==========================================
// وام پی — Broker Panel
// فایل: broker-wizard.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: ویزارد ثبت پرونده توسط کارگزار (نسخه ۱ - ساده)
// ==========================================

(function () {
    'use strict';

    var DRAFT_KEY = 'wamPayBrokerDraft';
    var ROOT_ATTR = 'data-broker-wizard';
    var BROKERS_KEY = 'wamPayBrokers';
    var BANKS = ['ملی','صادرات','تجارت','سپه','کشاورزی','مسکن','رسالت',
                 'پاسارگاد','پارسیان','سامان','ملت','رفاه','مهر ایران','قوامین','شهر'];
    var DURATIONS = [12,24,36,48,60,84,120];
    var PURPOSES = ['خرید کالا','وام ازدواج','وام مسکن','وام خودرو',
                    'وام قرض‌الحسنه','سرمایه در گردش','توسعه کسب‌وکار',
                    'هزینه درمان','هزینه تحصیل','سایر'];

    var STATE = {
        installed: false, root: null, currentStep: 1, totalSteps: 3,
        data: {}, submitting: false, broker: null, listeners: []
    };

    var WizEvents = {
        START: 'bwiz.start', STEP: 'bwiz.step', DRAFT: 'bwiz.draft_saved',
        LOAD: 'bwiz.draft_loaded', SUBMIT: 'bwiz.submit',
        SUCCESS: 'bwiz.success', FAIL: 'bwiz.fail', CANCEL: 'bwiz.cancel'
    };

    function _emit(n, d) {
        if (typeof EventBus !== 'undefined') { try { EventBus.emit(n, d); } catch(e){} }
        for (var i=0;i<STATE.listeners.length;i++) { try { STATE.listeners[i](n,d); } catch(e){} }
    }

    function _esc(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function _fa(n) {
        var s = String(n === null || n === undefined ? 0 : n);
        return s.replace(/[0-9]/g, function(d){ return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _amt(n) {
        if (n === null || n === undefined || n === '') return '—';
        var x = Number(n); if (isNaN(x)) return '—';
        return x.toLocaleString('en-US').replace(/[0-9]/g, function(d){ return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _en(s) {
        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.toEnglishDigits) {
            return WamPersianDate.toEnglishDigits(s);
        }
        return String(s||'').replace(/[۰-۹]/g, function(d){ return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); });
    }

    function _loadBroker() {
        if (typeof Storage === 'undefined') return null;
        var all = Storage.getJSON(BROKERS_KEY, []) || [];
        var u = (typeof WamPermissions !== 'undefined') ? WamPermissions.getCurrentUser() : null;
        if (!u) return null;
        for (var i=0;i<all.length;i++) {
            var b = all[i]; if (!b) continue;
            if (b.userId && b.userId === u.id) return b;
            if (b.mobile && u.mobile &&
                String(b.mobile).replace(/\D/g,'') === String(u.mobile).replace(/\D/g,'')) return b;
        }
        return null;
    }

    function _uid() {
        if (typeof WamPermissions === 'undefined') return null;
        var me = WamPermissions.getCurrentUser();
        return me ? me.id : null;
    }

    // ─── Draft ───
    function saveDraft() {
        if (typeof Storage === 'undefined') return false;
        var ok = Storage.setJSON(DRAFT_KEY, {
            step: STATE.currentStep, data: STATE.data, savedAt: Date.now()
        });
        if (ok) _emit(WizEvents.DRAFT, { step: STATE.currentStep, at: Date.now() });
        return ok;
    }

    function loadDraft() {
        if (typeof Storage === 'undefined') return null;
        var p = Storage.getJSON(DRAFT_KEY, null);
        if (!p || !p.data) return null;
        _emit(WizEvents.LOAD, { step: p.step, savedAt: p.savedAt });
        return p;
    }

    function clearDraft() {
        if (typeof Storage === 'undefined') return false;
        return Storage.remove(DRAFT_KEY);
    }

    function hasDraft() {
        if (typeof Storage === 'undefined') return false;
        var p = Storage.getJSON(DRAFT_KEY, null);
        return !!(p && p.data);
    }

    // ─── Validate ───
    function _validate(step, d) {
        var e = {};
        if (step === 1) {
            if (!d.applicantName || String(d.applicantName).trim().length < 3) e.applicantName = 'نام متقاضی حداقل ۳ کاراکتر';
            if (!d.applicantMobile || !/^09\d{9}$/.test(_en(d.applicantMobile))) e.applicantMobile = 'موبایل ۱۱ رقم با ۰۹';
            if (d.applicantNationalCode && !/^\d{10}$/.test(_en(d.applicantNationalCode))) e.applicantNationalCode = 'کد ملی ۱۰ رقم';
        }
        if (step === 2) {
            if (!d.bank) e.bank = 'بانک الزامی';
            if (!d.loanAmount || Number(_en(d.loanAmount)) < 1000000) e.loanAmount = 'حداقل ۱ میلیون ریال';
            if (!d.loanDuration) e.loanDuration = 'مدت الزامی';
            if (!d.purpose) e.purpose = 'هدف الزامی';
        }
        if (step === 3) {
            if (!d.agreeTerms) e.agreeTerms = 'پذیرش قوانین الزامی';
        }
        return e;
    }

    function _validateAll() {
        var all = {};
        for (var s=1;s<=STATE.totalSteps;s++) {
            var e = _validate(s, STATE.data);
            for (var k in e) if (Object.prototype.hasOwnProperty.call(e,k)) all[k] = e[k];
        }
        return all;
    }

    // ─── Render ───
    function _step1() {
        var d = STATE.data;
        return '<div class="wam-wiz__step" data-step="1">' +
            '<h3>👤 اطلاعات متقاضی</h3>' +
            '<p class="wam-wiz__desc">مشخصات فردی متقاضی وام</p>' +
            '<div class="wam-field"><label>نام و نام خانوادگی *</label>' +
                '<input name="applicantName" value="'+_esc(d.applicantName||'')+'">' +
                '<div class="wam-field__error" data-error="applicantName"></div></div>' +
            '<div class="wam-field"><label>موبایل *</label>' +
                '<input name="applicantMobile" type="tel" maxlength="11" value="'+_esc(d.applicantMobile||'')+'">' +
                '<div class="wam-field__error" data-error="applicantMobile"></div></div>' +
            '<div class="wam-field"><label>کد ملی</label>' +
                '<input name="applicantNationalCode" inputmode="numeric" maxlength="10" value="'+_esc(d.applicantNationalCode||'')+'">' +
                '<div class="wam-field__error" data-error="applicantNationalCode"></div></div>' +
            '<div class="wam-field"><label>تاریخ تولد</label>' +
                '<input name="applicantBirthDate" data-persian-date value="'+_esc(d.applicantBirthDate||'')+'"></div>' +
            '<div class="wam-field"><label>شغل</label>' +
                '<input name="applicantJob" value="'+_esc(d.applicantJob||'')+'"></div>' +
            '<div class="wam-field"><label>درآمد ماهانه (ریال)</label>' +
                '<input name="applicantIncome" inputmode="numeric" value="'+_esc(d.applicantIncome||'')+'"></div>' +
        '</div>';
    }

    function _step2() {
        var d = STATE.data;
        var bankOpts = '<option value="">— انتخاب —</option>';
        for (var i=0;i<BANKS.length;i++) bankOpts += '<option value="'+_esc(BANKS[i])+'"'+(d.bank===BANKS[i]?' selected':'')+'>'+_esc(BANKS[i])+'</option>';
        var durOpts = '<option value="">—</option>';
        for (var j=0;j<DURATIONS.length;j++) durOpts += '<option value="'+DURATIONS[j]+'"'+(String(d.loanDuration)===String(DURATIONS[j])?' selected':'')+'>'+_fa(DURATIONS[j])+' ماه</option>';
        var pOpts = '<option value="">—</option>';
        for (var k=0;k<PURPOSES.length;k++) pOpts += '<option value="'+_esc(PURPOSES[k])+'"'+(d.purpose===PURPOSES[k]?' selected':'')+'>'+_esc(PURPOSES[k])+'</option>';

        return '<div class="wam-wiz__step" data-step="2">' +
            '<h3>💰 اطلاعات وام</h3>' +
            '<p class="wam-wiz__desc">مشخصات وام درخواستی</p>' +
            '<div class="wam-field"><label>بانک *</label>' +
                '<select name="bank">'+bankOpts+'</select>' +
                '<div class="wam-field__error" data-error="bank"></div></div>' +
            '<div class="wam-field"><label>مبلغ وام (ریال) *</label>' +
                '<input name="loanAmount" inputmode="numeric" value="'+_esc(d.loanAmount||'')+'">' +
                '<div class="wam-field__error" data-error="loanAmount"></div></div>' +
            '<div class="wam-field"><label>مدت بازپرداخت *</label>' +
                '<select name="loanDuration">'+durOpts+'</select>' +
                '<div class="wam-field__error" data-error="loanDuration"></div></div>' +
            '<div class="wam-field"><label>هدف وام *</label>' +
                '<select name="purpose">'+pOpts+'</select>' +
                '<div class="wam-field__error" data-error="purpose"></div></div>' +
            '<div class="wam-field"><label>توضیحات</label>' +
                '<textarea name="loanNote" rows="3">'+_esc(d.loanNote||'')+'</textarea></div>' +
        '</div>';
    }

    function _step3() {
        var d = STATE.data;
        return '<div class="wam-wiz__step" data-step="3">' +
            '<h3>✅ بررسی نهایی</h3>' +
            '<p class="wam-wiz__desc">اطلاعات پرونده را بررسی کنید</p>' +
            '<div class="wam-wiz__review">' +
                _rr('متقاضی', d.applicantName) +
                _rr('موبایل', d.applicantMobile) +
                _rr('کد ملی', d.applicantNationalCode || '—') +
                _rr('بانک', d.bank) +
                _rr('مبلغ', d.loanAmount ? _amt(d.loanAmount)+' ریال' : '—') +
                _rr('مدت', d.loanDuration ? _fa(d.loanDuration)+' ماه' : '—') +
                _rr('هدف', d.purpose) +
            '</div>' +
            '<label class="wam-check"><input type="checkbox" name="agreeTerms"'+(d.agreeTerms?' checked':'')+'>' +
                '<span>صحت اطلاعات تأیید می‌شود</span></label>' +
            '<div class="wam-field__error" data-error="agreeTerms"></div>' +
        '</div>';
    }

    function _rr(l, v) {
        return '<div class="wam-review-row"><span>'+_esc(l)+':</span><strong>'+_esc(v||'—')+'</strong></div>';
    }

    function _nav() {
        var first = STATE.currentStep === 1;
        var last = STATE.currentStep === STATE.totalSteps;
        var h = '<div class="wam-wiz__nav">';
        h += '<button type="button" class="wam-btn wam-btn--ghost" data-bwiz="prev"'+(first?' disabled':'')+'>‹ قبلی</button>';
        h += '<div class="wam-wiz__dots">';
        for (var i=1;i<=STATE.totalSteps;i++) {
            h += '<span class="wam-wiz__dot'+(i===STATE.currentStep?' is-active':'')+(i<STATE.currentStep?' is-done':'')+'" data-goto="'+i+'"></span>';
        }
        h += '</div>';
        h += last
            ? '<button type="button" class="wam-btn wam-btn--primary" data-bwiz="submit">ثبت پرونده ✓</button>'
            : '<button type="button" class="wam-btn wam-btn--primary" data-bwiz="next">بعدی ›</button>';
        h += '</div>';
        return h;
    }

    function _progress() {
        var pct = Math.round(((STATE.currentStep - 1) / STATE.totalSteps) * 100);
        return '<div class="wam-wiz__progress"><div class="wam-wiz__progress-bar" style="width:'+pct+'%"></div></div>' +
               '<div class="wam-wiz__progress-label">مرحله '+_fa(STATE.currentStep)+' از '+_fa(STATE.totalSteps)+'</div>';
    }

    function render() {
        if (!STATE.root) return;
        var stepHtml = STATE.currentStep === 1 ? _step1() :
                       STATE.currentStep === 2 ? _step2() : _step3();
        STATE.root.innerHTML =
            '<div class="wam-wiz">' + _progress() +
                '<form class="wam-wiz__form" onsubmit="return false">' +
                    stepHtml + _nav() +
                '</form>' +
            '</div>';
        _bindInputs();
        _bindNav();
        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.bindAll) {
            try { WamPersianDate.bindAll(STATE.root); } catch(e){}
        }
    }

    function _bindInputs() {
        if (!STATE.root) return;
        var els = STATE.root.querySelectorAll('input, select, textarea');
        for (var i=0;i<els.length;i++) {
            els[i].addEventListener('input', _onChange);
            els[i].addEventListener('change', _onChange);
        }
    }

    var _draftTimer = null;
    function _onChange() {
        var name = this.getAttribute('name');
        if (!name) return;
        STATE.data[name] = this.type === 'checkbox' ? !!this.checked : this.value;
        _clearErr(name);
        if (_draftTimer) clearTimeout(_draftTimer);
        _draftTimer = setTimeout(saveDraft, 800);
    }

    function _bindNav() {
        if (!STATE.root) return;
        var btns = STATE.root.querySelectorAll('[data-bwiz]');
        for (var i=0;i<btns.length;i++) btns[i].addEventListener('click', _onNav);
        var dots = STATE.root.querySelectorAll('[data-goto]');
        for (var j=0;j<dots.length;j++) dots[j].addEventListener('click', function(){
            var t = parseInt(this.getAttribute('data-goto'), 10);
            if (!isNaN(t) && t < STATE.currentStep) { STATE.currentStep = t; render(); }
        });
    }

    function _onNav(e) {
        e.preventDefault();
        var a = this.getAttribute('data-bwiz');
        if (a === 'prev') goPrev();
        else if (a === 'next') goNext();
        else if (a === 'submit') submit();
    }

    function goNext() {
        if (STATE.submitting) return false;
        var e = _validate(STATE.currentStep, STATE.data);
        if (Object.keys(e).length > 0) { _showErrs(e); return false; }
        if (STATE.currentStep >= STATE.totalSteps) return false;
        STATE.currentStep++; saveDraft(); render(); _scrollTop();
        _emit(WizEvents.STEP, { step: STATE.currentStep, direction: 'next' });
        return true;
    }

    function goPrev() {
        if (STATE.submitting) return false;
        if (STATE.currentStep <= 1) return false;
        STATE.currentStep--; saveDraft(); render(); _scrollTop();
        _emit(WizEvents.STEP, { step: STATE.currentStep, direction: 'prev' });
        return true;
    }

    function gotoStep(s) {
        if (s < 1 || s > STATE.totalSteps) return false;
        STATE.currentStep = s; render(); return true;
    }

    function _scrollTop() {
        try { STATE.root && STATE.root.scrollIntoView({behavior:'smooth',block:'start'}); }
        catch(e) { try { window.scrollTo({top:0,behavior:'smooth'}); } catch(err){} }
    }

    function _showErrs(errs) {
        _clearErrs();
        for (var k in errs) {
            if (!Object.prototype.hasOwnProperty.call(errs,k)) continue;
            var el = STATE.root.querySelector('[data-error="'+k+'"]');
            if (el) { el.textContent = errs[k]; el.style.display = 'block'; }
            var inp = STATE.root.querySelector('[name="'+k+'"]');
            if (inp) inp.classList.add('wam-input--error');
        }
    }

    function _clearErrs() {
        if (!STATE.root) return;
        var el = STATE.root.querySelectorAll('[data-error]');
        for (var i=0;i<el.length;i++) { el[i].textContent = ''; el[i].style.display = 'none'; }
        var ip = STATE.root.querySelectorAll('.wam-input--error');
        for (var j=0;j<ip.length;j++) ip[j].classList.remove('wam-input--error');
    }

    function _clearErr(n) {
        if (!STATE.root) return;
        var el = STATE.root.querySelector('[data-error="'+n+'"]');
        if (el) { el.textContent = ''; el.style.display = 'none'; }
        var inp = STATE.root.querySelector('[name="'+n+'"]');
        if (inp) inp.classList.remove('wam-input--error');
    }

    // ─── Submit ───
    function submit() {
        if (STATE.submitting) return;
        var errs = _validateAll();
        if (Object.keys(errs).length > 0) {
            for (var s=1;s<=STATE.totalSteps;s++) {
                if (Object.keys(_validate(s, STATE.data)).length > 0) {
                    STATE.currentStep = s; render(); _showErrs(_validate(s, STATE.data)); break;
                }
            }
            if (typeof WamUI !== 'undefined') WamUI.toastError('خطاها را برطرف کنید', 'خطا');
            return false;
        }
        STATE.submitting = true;
        _busy(true);
        _emit(WizEvents.SUBMIT, { at: Date.now() });

        setTimeout(function () {
            var res = _createCase();
            if (!res.ok) {
                STATE.submitting = false; _busy(false);
                _emit(WizEvents.FAIL, res);
                if (typeof WamUI !== 'undefined') WamUI.toastError('خطا: ' + (res.reason||'نامشخص'), 'خطا');
                return;
            }
            clearDraft();
            _emit(WizEvents.SUCCESS, { caseId: res.caseId, at: Date.now() });
            if (typeof WamUI !== 'undefined') {
                WamUI.toastSuccess('پرونده ' + res.caseId + ' ثبت شد', 'موفق');
                if (WamUI.loader) WamUI.loader.show('وام پی', 'در حال انتقال...');
            }
            setTimeout(function () {
                window.location.href = 'case-details.html?id=' + encodeURIComponent(res.caseId);
            }, 900);
        }, 500);
    }

    function _createCase() {
        if (typeof CaseRepository === 'undefined') return { ok:false, reason:'no_repo' };
        if (!STATE.broker) return { ok:false, reason:'no_broker' };

        var caseId = _genCaseId();
        var d = STATE.data;

        var cd = {
            caseId: caseId,
            brokerId: STATE.broker.id,
            brokerName: STATE.broker.name,
            brokerCode: STATE.broker.brokerCode,
            bank: d.bank,
            loanAmount: Number(_en(d.loanAmount)) || 0,
            loanDuration: Number(d.loanDuration) || 0,
            purpose: d.purpose || null,
            loanNote: d.loanNote || null,
            applicantName: (d.applicantName||'').trim(),
            applicantMobile: _en(d.applicantMobile) || null,
            applicantNationalCode: _en(d.applicantNationalCode) || null,
            applicantBirthDate: d.applicantBirthDate || null,
            applicantJob: d.applicantJob || null,
            applicantMonthlyIncome: Number(_en(d.applicantIncome)) || 0,
            status: 'draft',
            currentStep: 'step_1',
            source: 'broker-wizard'
        };

        var created = CaseRepository.create(cd, { userId: _uid() });
        if (!created) return { ok:false, reason:'create_failed' };

        if (typeof CaseStateMachine !== 'undefined' && CaseStateMachine.startStep) {
            try { CaseStateMachine.startStep(caseId, 'step_1', { userId:_uid(), role:'broker' }); } catch(e){}
        }
        return { ok:true, caseId: caseId, case: created };
    }

    function _genCaseId() {
        var y = new Date().getFullYear() % 100;
        var r = Math.floor(Math.random() * 9999);
        return 'WP-' + y + '-' + ('0000'+r).slice(-4);
    }

    function _busy(b) {
        if (!STATE.root) return;
        var btn = STATE.root.querySelector('[data-bwiz="submit"]');
        if (!btn) return;
        if (b) { btn.disabled = true; btn.setAttribute('data-orig', btn.textContent); btn.textContent = 'در حال ثبت...'; }
        else { btn.disabled = false; var o = btn.getAttribute('data-orig'); if (o) btn.textContent = o; }
    }

    function reset(o) {
        o = o || {};
        STATE.currentStep = 1; STATE.data = {}; STATE.submitting = false;
        if (o.clearDraft !== false) clearDraft();
        render(); _emit(WizEvents.CANCEL, { at: Date.now() });
    }

    // ─── Install ───
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var run = function () {
            var u = (typeof WamPermissions !== 'undefined') ? WamPermissions.getCurrentUser() : null;
            if (!u) { if (typeof WamPayGuard !== 'undefined') WamPayGuard.redirectToLogin('not_logged_in'); return; }
            if (u.role !== 'broker' && u.role !== 'admin' && u.role !== 'super_admin') {
                if (typeof WamPayGuard !== 'undefined') WamPayGuard.redirectToRoleHome(u.role);
                return;
            }

            var root = options.root ||
                       document.querySelector('[' + ROOT_ATTR + ']') ||
                       document.querySelector('.wam-broker-wizard');
            if (!root) { if (options.debug) console.warn('[broker-wizard] root not found'); return; }
            STATE.root = root;

            STATE.broker = _loadBroker();
            if (!STATE.broker) {
                STATE.root.innerHTML = '<div class="wam-empty">اطلاعات کارگزار یافت نشد.</div>';
                return;
            }

            var d = loadDraft();
            if (d && d.data && options.restoreDraft !== false) {
                STATE.data = d.data; STATE.currentStep = d.step || 1;
                if (typeof WamUI !== 'undefined') WamUI.toastInfo('پیش‌نویس بازیابی شد', 'خوش آمدید');
            }

            render(); STATE.installed = true;
            _emit(WizEvents.START, { step: STATE.currentStep, hasDraft: !!d, at: Date.now() });
        };

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
        else run();
    }

    function uninstall() { STATE.root = null; STATE.installed = false; }

    function getStatus() {
        return {
            installed: STATE.installed, currentStep: STATE.currentStep,
            totalSteps: STATE.totalSteps, fields: Object.keys(STATE.data).length,
            submitting: STATE.submitting, hasDraft: hasDraft(),
            brokerId: STATE.broker ? STATE.broker.id : null
        };
    }

    function onChange(cb) {
        if (typeof cb !== 'function') return function(){};
        STATE.listeners.push(cb);
        return function(){ var i = STATE.listeners.indexOf(cb); if (i!==-1) STATE.listeners.splice(i,1); };
    }

    var WamBrokerWizard = {
        EVENTS: WizEvents, BANKS: BANKS, DURATIONS: DURATIONS, PURPOSES: PURPOSES,
        ROOT_ATTR: ROOT_ATTR, DRAFT_KEY: DRAFT_KEY,
        install: install, uninstall: uninstall, render: render, reset: reset,
        goNext: goNext, goPrev: goPrev, gotoStep: gotoStep, submit: submit,
        saveDraft: saveDraft, loadDraft: loadDraft, clearDraft: clearDraft, hasDraft: hasDraft,
        getData: function(){ return JSON.parse(JSON.stringify(STATE.data)); },
        setData: function(d){ STATE.data = d || {}; render(); },
        validateStep: function(s){ return _validate(s, STATE.data); },
        validateAll: _validateAll,
        getStatus: getStatus, onChange: onChange
    };

    window.WamBrokerWizard = WamBrokerWizard;
    window.BrokerWizardEvents = WizEvents;

    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body; if (!b) return;
            if (b.hasAttribute('data-broker-wizard-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-broker-wizard')) install();
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _auto);
        else _auto();
    }

})();




/* ==========================================
 * FROM: js/broker-wizard-v2-actions.js
 * ========================================== */


// ==========================================
// وام پی — Broker Panel
// فایل: broker-wizard-v2-actions.js
// نسخه: 2.0.0
// تاریخ: 1405/01/15
// کارش: اکشن‌های ویزارد v2 — آپلود مدارک، محاسبات، رویدادها
//        ماژول کمکی برای broker-wizard-v2.js
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var MAX_FILE_MB = 5;
    var MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

    var ALLOWED_MIME = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
        'image/gif', 'application/pdf'
    ];

    // نرخ تقریبی برای محاسبه قسط
    var DEFAULT_RATE = 0.18;   // ۱۸٪ سالانه

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        boundFileInputs: {},   // code → bound
        boundButtons: {},      // action → bound
        lastCalcAt: null,
        lastCalcResult: null,
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var ActionEvents = {
        FILE_SELECTED:   'bwizv2a.file_selected',
        FILE_ADDED:      'bwizv2a.file_added',
        FILE_REMOVED:    'bwizv2a.file_removed',
        FILE_REJECTED:   'bwizv2a.file_rejected',
        FIELD_CHANGED:   'bwizv2a.field_changed',
        CALCULATED:      'bwizv2a.calculated',
        CUSTOM_ACTION:   'bwizv2a.custom_action',
        VALIDATION_HINT: 'bwizv2a.validation_hint'
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

    function _size(bytes) {
        if (!bytes) return '۰';
        if (bytes < 1024) return _fa(bytes) + ' بایت';
        if (bytes < 1024 * 1024) return _fa(Math.round(bytes / 1024)) + ' کیلوبایت';
        return _fa(Math.round(bytes / 1024 / 1024 * 10) / 10) + ' مگابایت';
    }

    function _en(s) {
        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.toEnglishDigits) {
            return WamPersianDate.toEnglishDigits(s);
        }
        return String(s || '').replace(/[۰-۹]/g, function (d) {
            return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
        });
    }

    function _toast(type, msg, title) {
        if (typeof WamUI === 'undefined') return;
        if (type === 'success' && WamUI.toastSuccess) WamUI.toastSuccess(msg, title || 'موفق');
        else if (type === 'error' && WamUI.toastError) WamUI.toastError(msg, title || 'خطا');
        else if (type === 'warning' && WamUI.toastWarning) WamUI.toastWarning(msg, title || 'توجه');
        else if (type === 'info' && WamUI.toastInfo) WamUI.toastInfo(msg, title || 'اطلاع');
    }

    function _getStepsMod() {
        return (typeof WamBrokerWizardV2Steps !== 'undefined')
            ? WamBrokerWizardV2Steps : null;
    }

    function _getDocs() {
        var mod = _getStepsMod();
        if (mod && mod.REQUIRED_DOCS) return mod.REQUIRED_DOCS;
        return [];
    }

    // ─────────────────────────────────────
    // 📎 اعتبارسنجی فایل
    // ─────────────────────────────────────
    function _validateFile(file, docDef) {
        var errors = [];

        if (!file) { errors.push('فایلی انتخاب نشده'); return errors; }

        if (file.size > MAX_FILE_BYTES) {
            errors.push('حجم فایل بیش از ' + _fa(MAX_FILE_MB) + ' مگابایت است (' +
                _size(file.size) + ')');
        }

        if (file.size === 0) {
            errors.push('فایل خالی است');
        }

        var mime = (file.type || '').toLowerCase();
        if (mime && ALLOWED_MIME.indexOf(mime) === -1) {
            // اگر docDef accept مشخص دارد، همان را چک کن
            var accept = docDef && docDef.accept;
            if (accept && accept.indexOf('image/*') !== -1 && mime.indexOf('image/') === 0) {
                // ok
            } else if (accept && accept.indexOf('.pdf') !== -1 && mime === 'application/pdf') {
                // ok
            } else {
                errors.push('فرمت فایل مجاز نیست (فقط تصویر یا PDF)');
            }
        }

        return errors;
    }

    // ─────────────────────────────────────
    // 📤 خواندن فایل به dataURL
    // ─────────────────────────────────────
    function _readAsDataURL(file, callback) {
        if (typeof FileReader === 'undefined') {
            callback(null);
            return;
        }
        var reader = new FileReader();
        reader.onload = function () { callback(reader.result); };
        reader.onerror = function () { callback(null); };
        try {
            reader.readAsDataURL(file);
        } catch (e) {
            callback(null);
        }
    }

    // ─────────────────────────────────────
    // 📎 هندلر آپلود فایل
    // ─────────────────────────────────────
    function _handleFileInput(input, state) {
        if (!input || !input.files || input.files.length === 0) return;

        var code = input.getAttribute('data-doc-input');
        if (!code) return;

        var docDef = null;
        var docs = _getDocs();
        for (var i = 0; i < docs.length; i++) {
            if (docs[i].code === code) { docDef = docs[i]; break; }
        }

        var file = input.files[0];

        // اعتبارسنجی
        var errors = _validateFile(file, docDef);
        if (errors.length > 0) {
            _emit(ActionEvents.FILE_REJECTED, {
                code: code,
                name: file.name,
                errors: errors,
                at: Date.now()
            });
            _toast('error', errors[0], 'فایل نامعتبر');
            // پاک کردن input
            try { input.value = ''; } catch (e) { /* بی‌صدا */ }
            return;
        }

        _emit(ActionEvents.FILE_SELECTED, {
            code: code,
            name: file.name,
            size: file.size,
            mime: file.type,
            at: Date.now()
        });

        // خواندن به dataURL
        _readAsDataURL(file, function (dataURL) {
            // استفاده از API اصلی
            if (typeof WamBrokerWizardV2 === 'undefined' ||
                !WamBrokerWizardV2.addDocument) {
                _toast('error', 'ماژول ویزارد آماده نیست', 'خطا');
                return;
            }

            var res = WamBrokerWizardV2.addDocument({
                type: code,
                name: file.name,
                size: file.size,
                mime: file.type,
                data: dataURL
            });

            if (!res.ok) {
                if (res.reason === 'duplicate') {
                    _toast('warning', 'این فایل قبلاً اضافه شده است', 'تکراری');
                } else {
                    _toast('error', 'خطا در افزودن فایل', 'خطا');
                }
                return;
            }

            _emit(ActionEvents.FILE_ADDED, {
                code: code,
                doc: res.doc,
                at: Date.now()
            });

            _toast('success', 'فایل «' + file.name + '» بارگذاری شد', 'موفق');
        });
    }

    // ─────────────────────────────────────
    // 🗑️ حذف فایل
    // ─────────────────────────────────────
    function _handleRemoveDoc(id) {
        if (!id) return;
        if (typeof WamBrokerWizardV2 === 'undefined' ||
            !WamBrokerWizardV2.removeDocument) return;

        var res = WamBrokerWizardV2.removeDocument(id);
        if (!res.ok) {
            _toast('error', 'خطا در حذف فایل', 'خطا');
            return;
        }

        _emit(ActionEvents.FILE_REMOVED, {
            doc: res.doc,
            at: Date.now()
        });

        _toast('info', 'فایل حذف شد', 'موفق');
    }

    // ─────────────────────────────────────
    // 🔄 پس از رندر — بایند داینامیک
    // ─────────────────────────────────────
    function afterRender(root, state) {
        if (!root) return;

        // ۱. بایند file inputs
        var fileInputs = root.querySelectorAll('[data-doc-input]');
        for (var i = 0; i < fileInputs.length; i++) {
            var input = fileInputs[i];
            var code = input.getAttribute('data-doc-input');
            if (STATE.boundFileInputs[code]) continue;

            (function (inp) {
                inp.addEventListener('change', function () {
                    _handleFileInput(inp, state);
                });
            })(input);

            STATE.boundFileInputs[code] = true;
        }

        // ۲. بایند دکمه‌های حذف مدرک
        var removeBtns = root.querySelectorAll('[data-doc-action="remove"]');
        for (var j = 0; j < removeBtns.length; j++) {
            var btn = removeBtns[j];
            if (btn.dataset.bwizv2Bound) continue;

            (function (b) {
                b.addEventListener('click', function (e) {
                    e.preventDefault();
                    var id = b.getAttribute('data-doc-id');
                    _handleRemoveDoc(id);
                });
            })(btn);

            btn.dataset.bwizv2Bound = '1';
        }

        // ۳. بایند دکمه‌های خاص (copy-from-applicant و ...)
        var customBtns = root.querySelectorAll('[data-bwizv2-custom]');
        for (var k = 0; k < customBtns.length; k++) {
            var cb = customBtns[k];
            if (cb.dataset.bwizv2Bound) continue;

            (function (b) {
                b.addEventListener('click', function (e) {
                    e.preventDefault();
                    var action = b.getAttribute('data-bwizv2-custom');
                    handleAction(action, b, state);
                });
            })(cb);

            cb.dataset.bwizv2Bound = '1';
        }

        // ۴. اگر در مرحله loan هستیم، محاسبه قسط را اجرا کن
        if (state && state.currentStep === 4) {
            _updateInstallmentPreview(root, state);
        }
    }

    // ─────────────────────────────────────
    // 🎯 onFieldChange — واکنش به تغییر فیلدها
    // ─────────────────────────────────────
    function onFieldChange(name, el, state) {
        if (!name) return;

        _emit(ActionEvents.FIELD_CHANGED, {
            name: name,
            value: el ? el.value : null,
            at: Date.now()
        });

        // در مرحله وام (step 4): به‌روزرسانی پیش‌نمایش قسط
        if (state && state.currentStep === 4) {
            if (name === 'loanAmount' || name === 'loanDuration' ||
                name === 'loanRate') {
                _updateInstallmentPreview(state.root, state);
            }
        }

        // اعتبارسنجی فوری کد ملی
        if (name === 'applicantNationalCode' && el && el.value) {
            _validateNationalCodeInline(el);
        }

        // اعتبارسنجی فوری موبایل
        if (name === 'applicantMobile' && el && el.value) {
            _validateMobileInline(el);
        }
    }

    // ─────────────────────────────────────
    // 🧮 اعتبارسنجی inline
    // ─────────────────────────────────────
    function _validateNationalCodeInline(el) {
        var v = _en(el.value).replace(/\D/g, '');
        var errEl = document.querySelector('[data-error="applicantNationalCode"]');
        if (!errEl) return;
        if (v.length !== 10) {
            if (v.length > 0) {
                errEl.textContent = 'کد ملی باید ۱۰ رقم باشد (فعلاً ' + _fa(v.length) + ' رقم)';
                errEl.style.display = 'block';
            } else {
                errEl.textContent = '';
                errEl.style.display = 'none';
            }
        } else {
            errEl.textContent = '';
            errEl.style.display = 'none';
        }
    }

    function _validateMobileInline(el) {
        var v = _en(el.value).replace(/\D/g, '');
        var errEl = document.querySelector('[data-error="applicantMobile"]');
        if (!errEl) return;
        if (v.length > 0 && !/^09/.test(v)) {
            errEl.textContent = 'شماره موبایل باید با ۰۹ شروع شود';
            errEl.style.display = 'block';
        } else if (v.length > 0 && v.length !== 11) {
            errEl.textContent = 'موبایل باید ۱۱ رقم باشد (فعلاً ' + _fa(v.length) + ' رقم)';
            errEl.style.display = 'block';
        } else {
            errEl.textContent = '';
            errEl.style.display = 'none';
        }
    }

    // ─────────────────────────────────────
    // 🧮 محاسبه قسط
    // ─────────────────────────────────────
    function calculateInstallment(amount, durationMonths, annualRate) {
        amount = Number(_en(amount)) || 0;
        durationMonths = Number(durationMonths) || 0;
        annualRate = (annualRate === undefined || annualRate === null || annualRate === '')
            ? DEFAULT_RATE : Number(annualRate);

        if (amount <= 0 || durationMonths <= 0) {
            return { ok: false, reason: 'invalid_input' };
        }

        var monthlyRate = annualRate / 12;
        var monthly;
        if (monthlyRate === 0) {
            monthly = amount / durationMonths;
        } else {
            var pow = Math.pow(1 + monthlyRate, durationMonths);
            monthly = amount * monthlyRate * pow / (pow - 1);
        }

        var total = monthly * durationMonths;
        var interest = total - amount;

        return {
            ok: true,
            monthly: Math.round(monthly),
            total: Math.round(total),
            interest: Math.round(interest),
            amount: amount,
            duration: durationMonths,
            rate: annualRate
        };
    }

    function _updateInstallmentPreview(root, state) {
        if (!root) return;

        var amountEl = root.querySelector('[name="loanAmount"]');
        var durEl = root.querySelector('[name="loanDuration"]');
        var rateEl = root.querySelector('[name="loanRate"]');
        if (!amountEl || !durEl) return;

        var box = root.querySelector('[data-bwizv2="calc-result"]');
        if (!box) return;

        var result = calculateInstallment(
            amountEl.value,
            durEl.value,
            rateEl ? rateEl.value : null
        );

        if (!result.ok) {
            box.innerHTML = '<div class="wam-calc-hint">' +
                '💡 برای مشاهده قسط، مبلغ و مدت را وارد کنید.' +
                '</div>';
            STATE.lastCalcResult = null;
            return;
        }

        STATE.lastCalcResult = result;
        STATE.lastCalcAt = Date.now();

        box.innerHTML =
            '<div class="wam-calc-result">' +
                '<div class="wam-calc-row">' +
                    '<span>قسط ماهانه:</span>' +
                    '<strong>' + _amt(result.monthly) + ' ریال</strong>' +
                '</div>' +
                '<div class="wam-calc-row">' +
                    '<span>مجموع بازپرداخت:</span>' +
                    '<span>' + _amt(result.total) + ' ریال</span>' +
                '</div>' +
                '<div class="wam-calc-row">' +
                    '<span>سود کل:</span>' +
                    '<span>' + _amt(result.interest) + ' ریال</span>' +
                '</div>' +
                '<div class="wam-calc-note">' +
                    '⚠️ این محاسبه تقریبی است و نرخ نهایی توسط بانک تعیین می‌شود.' +
                '</div>' +
            '</div>';

        _emit(ActionEvents.CALCULATED, {
            result: result,
            at: STATE.lastCalcAt
        });
    }

    // ─────────────────────────────────────
    // 🎯 handleAction — اکشن‌های سفارشی
    // ─────────────────────────────────────
    function handleAction(action, el, state) {
        if (!action) return false;

        _emit(ActionEvents.CUSTOM_ACTION, {
            action: action, at: Date.now()
        });

        switch (action) {
            case 'calc-installment':
                _updateInstallmentPreview(state.root, state);
                return true;

            case 'clear-docs':
                _confirmClearDocs(state);
                return true;

            case 'copy-applicant-info':
                _copyApplicantInfo(state);
                return true;

            case 'goto-step-1':
                if (typeof WamBrokerWizardV2 !== 'undefined') {
                    WamBrokerWizardV2.gotoStep(1);
                }
                return true;

            case 'goto-step-4':
                if (typeof WamBrokerWizardV2 !== 'undefined') {
                    WamBrokerWizardV2.gotoStep(4);
                }
                return true;

            case 'save-draft':
                if (typeof WamBrokerWizardV2 !== 'undefined') {
                    var ok = WamBrokerWizardV2.saveDraft();
                    _toast(ok ? 'success' : 'error',
                        ok ? 'پیش‌نویس ذخیره شد' : 'خطا در ذخیره');
                }
                return true;

            case 'view-doc':
                var docId = el ? el.getAttribute('data-doc-id') : null;
                if (docId) _viewDoc(docId, state);
                return true;

            default:
                return false;
        }
    }

    // ─────────────────────────────────────
    // 🗑️ حذف همه مدارک
    // ─────────────────────────────────────
    function _confirmClearDocs(state) {
        var docs = (state && state.uploadedDocs) ? state.uploadedDocs : [];
        if (docs.length === 0) {
            _toast('info', 'مدرکی برای حذف وجود ندارد', 'توجه');
            return;
        }

        var doIt = function () {
            // با استفاده از API اصلی حذف کن
            if (typeof WamBrokerWizardV2 === 'undefined' ||
                !WamBrokerWizardV2.removeDocument) return;

            var ids = [];
            for (var i = 0; i < docs.length; i++) ids.push(docs[i].id);

            for (var j = 0; j < ids.length; j++) {
                try { WamBrokerWizardV2.removeDocument(ids[j]); } catch (e) { /* بی‌صدا */ }
            }
            _toast('info', _fa(docs.length) + ' مدرک حذف شد', 'موفق');
        };

        var msg = 'همه مدارک بارگذاری‌شده حذف شوند؟';
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('حذف همه مدارک', msg, { danger: true })
                .then(function (ok) { if (ok) doIt(); });
        } else if (window.confirm(msg)) {
            doIt();
        }
    }

    // ─────────────────────────────────────
    // 📋 کپی اطلاعات متقاضی (placeholder)
    // ─────────────────────────────────────
    function _copyApplicantInfo(state) {
        // اگر کاربر applicant خاصی انتخاب شده بود، می‌توان اطلاعاتش را کپی کرد
        // در این نسخه فقط یک هشدار می‌دهیم
        _toast('info', 'این قابلیت در نسخه بعدی فعال می‌شود', 'به‌زودی');
    }

    // ─────────────────────────────────────
    // 👁️ نمایش مدرک
    // ─────────────────────────────────────
    function _viewDoc(docId, state) {
        var docs = (state && state.uploadedDocs) ? state.uploadedDocs : [];
        var doc = null;
        for (var i = 0; i < docs.length; i++) {
            if (docs[i].id === docId) { doc = docs[i]; break; }
        }
        if (!doc) return;

        var existing = document.getElementById('wamDocViewModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var body = '';
        if (doc.data && doc.mime && doc.mime.indexOf('image/') === 0) {
            body = '<img src="' + doc.data + '" alt="' + _fa(0) +
                   '" style="max-width:100%;border-radius:8px">';
        } else if (doc.data && doc.mime === 'application/pdf') {
            body = '<iframe src="' + doc.data +
                   '" style="width:100%;height:60vh;border:0;border-radius:8px"></iframe>';
        } else {
            body = '<div class="wam-empty">پیش‌نمایش برای این نوع فایل موجود نیست.</div>';
        }

        var modal = document.createElement('div');
        modal.id = 'wamDocViewModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel wam-modal__panel--wide">' +
                '<header class="wam-modal__head">' +
                    '<h3>📄 ' + _esc(doc.name || 'مدرک') + '</h3>' +
                    '<button type="button" class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<div class="wam-modal__body">' + body + '</div>' +
            '</div>';

        document.body.appendChild(modal);
        var cbs = modal.querySelectorAll('[data-close]');
        for (var k = 0; k < cbs.length; k++) {
            cbs[k].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }
    }

    function _esc(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            boundFileInputs: Object.keys(STATE.boundFileInputs).length,
            boundButtons: Object.keys(STATE.boundButtons).length,
            lastCalcAt: STATE.lastCalcAt,
            lastCalcResult: STATE.lastCalcResult,
            defaultRate: DEFAULT_RATE,
            maxFileMB: MAX_FILE_MB
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
    var WamBrokerWizardV2Actions = {
        // ثوابت
        EVENTS: ActionEvents,
        DEFAULT_RATE: DEFAULT_RATE,
        MAX_FILE_MB: MAX_FILE_MB,
        MAX_FILE_BYTES: MAX_FILE_BYTES,
        ALLOWED_MIME: ALLOWED_MIME,

        // چرخه (که هسته صدا می‌زند)
        afterRender: afterRender,
        onFieldChange: onFieldChange,
        handleAction: handleAction,

        // محاسبات
        calculateInstallment: calculateInstallment,

        // ابزارها
        validateFile: _validateFile,
        viewDoc: _viewDoc,

        // گزارش
        getStatus: getStatus,
        onChange: onChange
    };

    window.WamBrokerWizardV2Actions = WamBrokerWizardV2Actions;
    window.BrokerWizardV2ActionsEvents = ActionEvents;

    // لاگ
    try {
        if (typeof console !== 'undefined' && console.log) {
            console.log('%c[broker-wizard-v2-actions] v2.0.0 آماده — اکشن‌ها ثبت شد',
                'color:#105b35');
        }
    } catch (e) { /* بی‌صدا */ }

})();




/* ==========================================
 * FROM: js/broker-wizard-v2-steps.js
 * ========================================== */


// ==========================================
// وام پی — Broker Panel
// فایل: broker-wizard-v2-steps.js
// نسخه: 2.0.0
// تاریخ: 1405/01/15
// کارش: رندرکننده مراحل ویزارد پیشرفته (۶ مرحله)
//        ماژول کمکی برای broker-wizard-v2.js
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var BANKS = [
        'ملی', 'صادرات', 'تجارت', 'سپه', 'کشاورزی', 'مسکن',
        'رسالت', 'پاسارگاد', 'پارسیان', 'سامان', 'ملت', 'رفاه',
        'مهر ایران', 'قوامین', 'شهر', 'آینده', 'سینا', 'دی'
    ];

    var JOB_OPTIONS = [
        'کارمند دولتی', 'کارمند خصوصی', 'آزاد', 'بازنشسته',
        'دانشجو', 'خانه‌دار', 'کشاورز', 'پزشک', 'وکیل',
        'فروشنده', 'معلم', 'استاد', 'مهندس', 'سایر'
    ];

    var GENDER_OPTIONS = [
        { v: 'male',   l: 'مرد' },
        { v: 'female', l: 'زن' }
    ];

    var MARITAL_OPTIONS = [
        { v: 'single',  l: 'مجرد' },
        { v: 'married', l: 'متأهل' }
    ];

    var EDUCATION_OPTIONS = [
        { v: 'below_diploma', l: 'زیر دیپلم' },
        { v: 'diploma',       l: 'دیپلم' },
        { v: 'associate',     l: 'کاردانی' },
        { v: 'bachelor',      l: 'کارشناسی' },
        { v: 'master',        l: 'کارشناسی ارشد' },
        { v: 'phd',           l: 'دکتری' }
    ];

    var PURPOSE_OPTIONS = [
        'خرید کالا', 'وام ازدواج', 'وام مسکن', 'وام خودرو',
        'وام قرض‌الحسنه', 'سرمایه در گردش', 'توسعه کسب‌وکار',
        'هزینه درمان', 'هزینه تحصیل', 'سایر'
    ];

    var COLLATERAL_OPTIONS = [
        { v: '',             l: '— انتخاب —' },
        { v: 'none',         l: 'بدون وثیقه (ضامن)' },
        { v: 'salary',       l: 'گواهی کسر از حقوق' },
        { v: 'property',     l: 'وثیقه ملکی' },
        { v: 'vehicle',      l: 'وثیقه خودرو' },
        { v: 'deposit',      l: 'سپرده بانکی' },
        { v: 'other',        l: 'سایر' }
    ];

    var DURATIONS = [12, 24, 36, 48, 60, 84, 120, 180];

    // ⚠️ فایل‌ها
    var REQUIRED_DOCS = [
        { code: 'national-card',    title: 'کارت ملی',        required: true,  accept: 'image/*,.pdf' },
        { code: 'id-card',          title: 'شناسنامه',        required: false, accept: 'image/*,.pdf' },
        { code: 'payslip',          title: 'فیش حقوقی',       required: true,  accept: 'image/*,.pdf' },
        { code: 'bank-statement',   title: 'گردش حساب',       required: false, accept: 'image/*,.pdf' },
        { code: 'employment-cert',  title: 'گواهی اشتغال',    required: true,  accept: 'image/*,.pdf' },
        { code: 'other-doc',        title: 'مدارک تکمیلی',    required: false, accept: 'image/*,.pdf' }
    ];

    var MAX_FILE_MB = 5;

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

    function _size(bytes) {
        if (!bytes) return '۰';
        if (bytes < 1024) return _fa(bytes) + ' بایت';
        if (bytes < 1024 * 1024) return _fa(Math.round(bytes / 1024)) + ' کیلوبایت';
        return _fa(Math.round(bytes / 1024 / 1024 * 10) / 10) + ' مگابایت';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — بخش‌بندی
    // ─────────────────────────────────────
    function _section(title, icon, body, desc) {
        return '<fieldset class="wam-wizv2__section">' +
            '<legend class="wam-wizv2__section-title">' +
                (icon ? '<span>' + icon + '</span> ' : '') +
                _esc(title) +
            '</legend>' +
            (desc ? '<p class="wam-wizv2__section-desc">' + _esc(desc) + '</p>' : '') +
            '<div class="wam-wizv2__section-body">' + body + '</div>' +
        '</fieldset>';
    }

    function _field(label, name, value, options) {
        options = options || {};
        var required = options.required ? ' *' : '';
        var placeholder = options.placeholder || '';
        var type = options.type || 'text';
        var attrs = options.attrs || '';
        var maxlength = options.maxlength ? ' maxlength="' + options.maxlength + '"' : '';
        var inputmode = options.inputmode ? ' inputmode="' + options.inputmode + '"' : '';

        return '<div class="wam-field">' +
            '<label>' + _esc(label) + required + '</label>' +
            '<input type="' + type + '" name="' + _esc(name) + '" ' +
                'value="' + _esc(value || '') + '" ' +
                'placeholder="' + _esc(placeholder) + '"' +
                maxlength + inputmode + ' ' + attrs + '>' +
            '<div class="wam-field__error" data-error="' + _esc(name) + '"></div>' +
        '</div>';
    }

    function _select(label, name, value, options, required) {
        var html = '<option value="">— انتخاب کنید —</option>';
        for (var i = 0; i < options.length; i++) {
            var o = options[i];
            var v = typeof o === 'string' ? o : o.v;
            var l = typeof o === 'string' ? o : o.l;
            html += '<option value="' + _esc(v) + '"' +
                    (String(value) === String(v) ? ' selected' : '') + '>' +
                    _esc(l) + '</option>';
        }
        return '<div class="wam-field">' +
            '<label>' + _esc(label) + (required ? ' *' : '') + '</label>' +
            '<select name="' + _esc(name) + '">' + html + '</select>' +
            '<div class="wam-field__error" data-error="' + _esc(name) + '"></div>' +
        '</div>';
    }

    function _textarea(label, name, value, rows) {
        rows = rows || 3;
        return '<div class="wam-field">' +
            '<label>' + _esc(label) + '</label>' +
            '<textarea name="' + _esc(name) + '" rows="' + rows + '">' +
                _esc(value || '') +
            '</textarea>' +
            '<div class="wam-field__error" data-error="' + _esc(name) + '"></div>' +
        '</div>';
    }

    function _checkbox(name, label, checked) {
        return '<label class="wam-check">' +
            '<input type="checkbox" name="' + _esc(name) + '"' +
            (checked ? ' checked' : '') + '>' +
            '<span>' + _esc(label) + '</span>' +
        '</label>';
    }

    function _row2(a, b) {
        return '<div class="wam-wizv2__row wam-wizv2__row--2">' +
            '<div>' + a + '</div><div>' + b + '</div>' +
        '</div>';
    }

    // ─────────────────────────────────────
    // 📝 مرحله ۱: اطلاعات متقاضی
    // ─────────────────────────────────────
    function renderApplicant(data, state) {
        data = data || {};
        var html = '';

        html += '<h3 class="wam-wizv2__title">👤 اطلاعات متقاضی</h3>';
        html += '<p class="wam-wizv2__desc">' +
                'اطلاعات پایه متقاضی وام را با دقت وارد کنید.' +
                '</p>';

        // نام و موبایل
        html += _row2(
            _field('نام و نام خانوادگی', 'applicantName', data.applicantName, {
                required: true,
                placeholder: 'مثال: علی رضایی'
            }),
            _field('شماره موبایل', 'applicantMobile', data.applicantMobile, {
                required: true,
                type: 'tel',
                maxlength: 11,
                inputmode: 'numeric',
                placeholder: '09123456789'
            })
        );

        // ایمیل و تلفن ثابت
        html += _row2(
            _field('ایمیل (اختیاری)', 'applicantEmail', data.applicantEmail, {
                type: 'email',
                placeholder: 'name@example.com'
            }),
            _field('تلفن ثابت (اختیاری)', 'applicantPhone', data.applicantPhone, {
                type: 'tel',
                inputmode: 'numeric',
                placeholder: '02112345678'
            })
        );

        return _section('اطلاعات پایه', '', html);
    }

    // ─────────────────────────────────────
    // 🆔 مرحله ۲: تأیید هویت
    // ─────────────────────────────────────
    function renderIdentity(data, state) {
        data = data || {};
        var html = '';

        html += '<h3 class="wam-wizv2__title">🆔 تأیید هویت</h3>';
        html += '<p class="wam-wizv2__desc">' +
                'اطلاعات هویتی متقاضی برای احراز هویت.' +
                '</p>';

        // کد ملی و شماره شناسنامه
        html += _row2(
            _field('کد ملی', 'applicantNationalCode', data.applicantNationalCode, {
                required: true,
                maxlength: 10,
                inputmode: 'numeric',
                placeholder: '۱۰ رقم'
            }),
            _field('شماره شناسنامه', 'applicantIdNumber', data.applicantIdNumber, {
                maxlength: 12,
                inputmode: 'numeric',
                placeholder: 'مثال: 12345'
            })
        );

        // تاریخ تولد و محل تولد
        html += _row2(
            _field('تاریخ تولد', 'applicantBirthDate', data.applicantBirthDate, {
                required: true,
                placeholder: '1370/01/01',
                attrs: 'data-persian-date'
            }),
            _field('محل تولد', 'applicantBirthPlace', data.applicantBirthPlace, {
                placeholder: 'شهر محل تولد'
            })
        );

        // جنسیت و وضعیت تأهل
        html += _row2(
            _select('جنسیت', 'applicantGender', data.applicantGender,
                    GENDER_OPTIONS, true),
            _select('وضعیت تأهل', 'applicantMaritalStatus',
                    data.applicantMaritalStatus, MARITAL_OPTIONS)
        );

        // تحصیلات و تعداد فرزند
        html += _row2(
            _select('مدرک تحصیلی', 'applicantEducation',
                    data.applicantEducation, EDUCATION_OPTIONS),
            _field('تعداد فرزند', 'applicantChildren', data.applicantChildren, {
                type: 'number',
                inputmode: 'numeric',
                placeholder: '0'
            })
        );

        return _section('اطلاعات هویتی', '', html);
    }

    // ─────────────────────────────────────
    // 💰 مرحله ۳: اطلاعات مالی
    // ─────────────────────────────────────
    function renderFinancial(data, state) {
        data = data || {};
        var html = '';

        html += '<h3 class="wam-wizv2__title">💰 اطلاعات مالی و شغلی</h3>';
        html += '<p class="wam-wizv2__desc">' +
                'وضعیت شغلی و توان مالی متقاضی.' +
                '</p>';

        // شغل و سابقه کار
        html += _row2(
            _select('شغل', 'applicantJob', data.applicantJob,
                    JOB_OPTIONS, true),
            _field('سابقه کار (سال)', 'workExperience', data.workExperience, {
                type: 'number',
                inputmode: 'numeric',
                placeholder: '0'
            })
        );

        // نام محل کار
        html += _field('نام محل کار', 'employerName', data.employerName, {
            placeholder: 'نام شرکت / سازمان / کسب‌وکار'
        });

        // درآمد ماهانه و درآمد جانبی
        html += _row2(
            _field('درآمد ماهانه (ریال)', 'monthlyIncome', data.monthlyIncome, {
                required: true,
                inputmode: 'numeric',
                placeholder: 'مثال: 150000000'
            }),
            _field('درآمد جانبی (ریال)', 'otherIncome', data.otherIncome, {
                inputmode: 'numeric',
                placeholder: '0'
            })
        );

        // بدهی / اقساط جاری
        html += _row2(
            _field('مجموع اقساط جاری (ریال)', 'existingInstallments',
                    data.existingInstallments, {
                inputmode: 'numeric',
                placeholder: '0'
            }),
            _field('شماره حساب بانکی', 'bankAccount', data.bankAccount, {
                inputmode: 'numeric',
                placeholder: 'شماره حساب یا کارت'
            })
        );

        // یادداشت
        html += _textarea('توضیحات مالی (اختیاری)',
                'financialNote', data.financialNote, 3);

        return _section('اطلاعات مالی', '', html);
    }

    // ─────────────────────────────────────
    // 🏦 مرحله ۴: مشخصات وام
    // ─────────────────────────────────────
    function renderLoan(data, state) {
        data = data || {};
        var html = '';

        html += '<h3 class="wam-wizv2__title">🏦 مشخصات وام</h3>';
        html += '<p class="wam-wizv2__desc">' +
                'جزئیات وام درخواستی و شرایط.' +
                '</p>';

        // بانک و مبلغ
        html += _row2(
            _select('بانک درخواستی', 'bank', data.bank, BANKS, true),
            _field('مبلغ وام (ریال)', 'loanAmount', data.loanAmount, {
                required: true,
                inputmode: 'numeric',
                placeholder: 'مثال: 500000000'
            })
        );

        // مدت و هدف
        var durOpts = [];
        for (var i = 0; i < DURATIONS.length; i++) {
            durOpts.push({ v: DURATIONS[i], l: _fa(DURATIONS[i]) + ' ماه' });
        }
        html += _row2(
            _select('مدت بازپرداخت', 'loanDuration', data.loanDuration,
                    durOpts, true),
            _select('هدف وام', 'purpose', data.purpose,
                    PURPOSE_OPTIONS, true)
        );

        // نوع وثیقه و شرح
        html += _row2(
            _select('نوع وثیقه', 'collateralType', data.collateralType,
                    COLLATERAL_OPTIONS),
            _field('مبلغ وثیقه (ریال)', 'collateralAmount', data.collateralAmount, {
                inputmode: 'numeric',
                placeholder: '0'
            })
        );

        html += _textarea('شرح وثیقه', 'collateralDesc',
                data.collateralDesc, 2);

        // توضیحات کلی وام
        html += _textarea('توضیحات وام (اختیاری)', 'loanNote',
                data.loanNote, 3);

        return _section('مشخصات وام', '', html);
    }

    // ─────────────────────────────────────
    // 📎 مرحله ۵: مدارک
    // ─────────────────────────────────────
    function renderDocuments(data, state) {
        var html = '';

        html += '<h3 class="wam-wizv2__title">📎 بارگذاری مدارک</h3>';
        html += '<p class="wam-wizv2__desc">' +
                'مدارک مورد نیاز را بارگذاری کنید. حداکثر حجم هر فایل: ' +
                _fa(MAX_FILE_MB) + ' مگابایت.' +
                '</p>';

        var uploaded = (state && state.uploadedDocs) ? state.uploadedDocs : [];

        html += '<div class="wam-wizv2__docs">';

        for (var i = 0; i < REQUIRED_DOCS.length; i++) {
            var doc = REQUIRED_DOCS[i];
            var found = null;
            for (var j = 0; j < uploaded.length; j++) {
                if (uploaded[j].type === doc.code) { found = uploaded[j]; break; }
            }

            html += '<div class="wam-doc-item' + (found ? ' is-uploaded' : '') + '" ' +
                    'data-doc-code="' + _esc(doc.code) + '">';

            html += '<div class="wam-doc-item__head">';
            html += '<div class="wam-doc-item__title">' +
                    _esc(doc.title) +
                    (doc.required ? ' <span class="wam-required">*</span>' : '') +
                    '</div>';
            html += '<div class="wam-doc-item__status">';
            if (found) {
                html += '<span class="wam-badge wam-badge--completed">✓ بارگذاری شد</span>';
            } else {
                html += '<span class="wam-badge wam-badge--pending">بارگذاری نشده</span>';
            }
            html += '</div></div>';

            if (found) {
                html += '<div class="wam-doc-item__file">';
                html += '<div class="wam-doc-item__file-name">📄 ' +
                        _esc(found.name) + '</div>';
                html += '<div class="wam-doc-item__file-size">' +
                        _size(found.size) + '</div>';
                html += '<button type="button" class="wam-btn-icon wam-btn-icon--danger" ' +
                        'data-doc-action="remove" data-doc-id="' + _esc(found.id) + '" ' +
                        'title="حذف">🗑️</button>';
                html += '</div>';
            } else {
                html += '<div class="wam-doc-item__upload">';
                html += '<input type="file" id="doc_' + _esc(doc.code) + '" ' +
                        'data-doc-input="' + _esc(doc.code) + '" ' +
                        'accept="' + _esc(doc.accept) + '" style="display:none">';
                html += '<label for="doc_' + _esc(doc.code) + '" class="wam-btn wam-btn--sm wam-btn--ghost">' +
                        '📤 انتخاب فایل</label>';
                html += '</div>';
            }

            html += '</div>';
        }

        html += '</div>';

        html += '<div class="wam-wizv2__docs-note">';
        html += '⚠️ فایل‌های بارگذاری‌شده فقط برای بررسی اولیه است. ' +
                'در صورت نیاز به‌صورت حضوری نیز بررسی می‌شود.';
        html += '</div>';

        return _section('مدارک مورد نیاز', '', html);
    }

    // ─────────────────────────────────────
    // ✅ مرحله ۶: بررسی نهایی
    // ─────────────────────────────────────
    function renderReview(data, state) {
        data = data || {};
        var html = '';

        html += '<h3 class="wam-wizv2__title">✅ بررسی نهایی</h3>';
        html += '<p class="wam-wizv2__desc">' +
                'اطلاعات زیر را با دقت بررسی کنید. پس از ثبت، امکان ویرایش ندارید.' +
                '</p>';

        // اطلاعات متقاضی
        html += _reviewSection('👤 اطلاعات متقاضی', [
            ['نام و نام خانوادگی', data.applicantName],
            ['موبایل', data.applicantMobile],
            ['ایمیل', data.applicantEmail || '—'],
            ['تلفن ثابت', data.applicantPhone || '—']
        ]);

        // اطلاعات هویتی
        html += _reviewSection('🆔 اطلاعات هویتی', [
            ['کد ملی', data.applicantNationalCode],
            ['شماره شناسنامه', data.applicantIdNumber || '—'],
            ['تاریخ تولد', data.applicantBirthDate],
            ['محل تولد', data.applicantBirthPlace || '—'],
            ['جنسیت', _labelOf(data.applicantGender, GENDER_OPTIONS)],
            ['وضعیت تأهل', _labelOf(data.applicantMaritalStatus, MARITAL_OPTIONS)],
            ['تحصیلات', _labelOf(data.applicantEducation, EDUCATION_OPTIONS)],
            ['تعداد فرزند', data.applicantChildren || '—']
        ]);

        // اطلاعات مالی
        html += _reviewSection('💰 اطلاعات مالی', [
            ['شغل', data.applicantJob || '—'],
            ['سابقه کار', data.workExperience ? _fa(data.workExperience) + ' سال' : '—'],
            ['درآمد ماهانه', data.monthlyIncome ? _amt(data.monthlyIncome) + ' ریال' : '—'],
            ['درآمد جانبی', data.otherIncome ? _amt(data.otherIncome) + ' ریال' : '—'],
            ['اقساط جاری', data.existingInstallments ? _amt(data.existingInstallments) + ' ریال' : '—']
        ]);

        // مشخصات وام
        html += _reviewSection('🏦 مشخصات وام', [
            ['بانک', data.bank],
            ['مبلغ وام', data.loanAmount ? _amt(data.loanAmount) + ' ریال' : '—'],
            ['مدت بازپرداخت', data.loanDuration ? _fa(data.loanDuration) + ' ماه' : '—'],
            ['هدف وام', data.purpose || '—'],
            ['نوع وثیقه', _labelOf(data.collateralType, COLLATERAL_OPTIONS)],
            ['مبلغ وثیقه', data.collateralAmount ? _amt(data.collateralAmount) + ' ریال' : '—']
        ]);

        // مدارک
        var docs = (state && state.uploadedDocs) ? state.uploadedDocs : [];
        var docsRows = [];
        for (var i = 0; i < REQUIRED_DOCS.length; i++) {
            var d = REQUIRED_DOCS[i];
            var found = false;
            for (var j = 0; j < docs.length; j++) {
                if (docs[j].type === d.code) { found = true; break; }
            }
            docsRows.push([
                d.title,
                found ? '✓ بارگذاری شده' : (d.required ? '⚠️ الزامی' : '—')
            ]);
        }
        html += _reviewSection('📎 مدارک', docsRows);

        // چک‌باکس‌های تأیید
        html += '<div class="wam-wizv2__agreements">';
        html += _checkbox('agreeTerms',
            'قوانین و مقررات وام پی را مطالعه کرده و می‌پذیرم',
            data.agreeTerms);
        html += '<div class="wam-field__error" data-error="agreeTerms"></div>';
        html += _checkbox('agreeTruth',
            'صحت تمام اطلاعات وارد‌شده را تأیید می‌کنم',
            data.agreeTruth);
        html += '<div class="wam-field__error" data-error="agreeTruth"></div>';
        html += '</div>';

        return html;
    }

    function _reviewSection(title, rows) {
        var html = '<div class="wam-wizv2__review-section">';
        html += '<h4 class="wam-wizv2__review-title">' + _esc(title) + '</h4>';
        html += '<div class="wam-wizv2__review-rows">';
        for (var i = 0; i < rows.length; i++) {
            var label = rows[i][0];
            var value = rows[i][1];
            html += '<div class="wam-review-row">' +
                    '<span class="wam-review-row__label">' + _esc(label) + ':</span>' +
                    '<span class="wam-review-row__value">' +
                    _esc(value || '—') + '</span></div>';
        }
        html += '</div></div>';
        return html;
    }

    function _labelOf(value, options) {
        if (!value) return '—';
        for (var i = 0; i < options.length; i++) {
            var o = options[i];
            var v = typeof o === 'string' ? o : o.v;
            var l = typeof o === 'string' ? o : o.l;
            if (String(v) === String(value)) return l;
        }
        return value;
    }

    // ─────────────────────────────────────
    // 🎯 رجیستری رندرکننده‌ها
    // ─────────────────────────────────────
    var RENDERERS = {
        applicant:  renderApplicant,
        identity:   renderIdentity,
        financial:  renderFinancial,
        loan:       renderLoan,
        documents:  renderDocuments,
        review:     renderReview
    };

    function getRenderer(key) {
        return RENDERERS[key] || null;
    }

    function renderStep(key, data, state) {
        var fn = RENDERERS[key];
        if (typeof fn !== 'function') {
            return '<div class="wam-empty">رندرکننده مرحله «' +
                   _esc(key) + '» یافت نشد.</div>';
        }
        try {
            return fn(data, state);
        } catch (err) {
            console.error('[bwizv2-steps] خطا در رندر ' + key + ':', err);
            return '<div class="wam-empty">خطا در رندر مرحله.</div>';
        }
    }

    // ─────────────────────────────────────
    // 📋 لیست مدارک
    // ─────────────────────────────────────
    function getRequiredDocs() {
        return REQUIRED_DOCS.slice();
    }

    function getDocByCode(code) {
        for (var i = 0; i < REQUIRED_DOCS.length; i++) {
            if (REQUIRED_DOCS[i].code === code) return REQUIRED_DOCS[i];
        }
        return null;
    }

    // ─────────────────────────────────────
    // 🌐 API جهانی
    // ─────────────────────────────────────
    var WamBrokerWizardV2Steps = {
        // ثوابت
        BANKS: BANKS,
        JOB_OPTIONS: JOB_OPTIONS,
        GENDER_OPTIONS: GENDER_OPTIONS,
        MARITAL_OPTIONS: MARITAL_OPTIONS,
        EDUCATION_OPTIONS: EDUCATION_OPTIONS,
        PURPOSE_OPTIONS: PURPOSE_OPTIONS,
        COLLATERAL_OPTIONS: COLLATERAL_OPTIONS,
        DURATIONS: DURATIONS,
        REQUIRED_DOCS: REQUIRED_DOCS,
        MAX_FILE_MB: MAX_FILE_MB,

        // رندرکننده‌ها
        renderStep: renderStep,
        getRenderer: getRenderer,

        // رندر مستقیم هر مرحله
        renderApplicant: renderApplicant,
        renderIdentity: renderIdentity,
        renderFinancial: renderFinancial,
        renderLoan: renderLoan,
        renderDocuments: renderDocuments,
        renderReview: renderReview,

        // ابزارها
        getRequiredDocs: getRequiredDocs,
        getDocByCode: getDocByCode
    };

    window.WamBrokerWizardV2Steps = WamBrokerWizardV2Steps;

    // لاگ ثبت موفق
    try {
        if (typeof console !== 'undefined' && console.log) {
            console.log('%c[broker-wizard-v2-steps] v2.0.0 آماده — ۶ رندرکننده ثبت شد',
                'color:#105b35');
        }
    } catch (e) { /* بی‌صدا */ }

})();




/* ==========================================
 * FROM: js/broker-wizard-v2.js
 * ========================================== */


// ==========================================
// وام پی — Broker Panel
// فایل: broker-wizard-v2.js
// نسخه: 2.0.0
// تاریخ: 1405/01/15
// کارش: ویزارد پیشرفته ثبت پرونده کارگزار — هسته اصلی (Controller)
//        با پشتیبانی از Steps و Actions جداگانه
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION      = '2.0.0';
    var DRAFT_KEY    = 'wamPayBrokerDraftV2';
    var ROOT_ATTR    = 'data-broker-wizard-v2';
    var BROKERS_KEY  = 'wamPayBrokers';
    var DRAFT_TTL    = 7 * 24 * 60 * 60 * 1000;   // ۷ روز

    // تعریف مراحل پیشرفته (۶ مرحله)
    var STEPS_DEF = [
        { id: 1, key: 'applicant',    title: 'اطلاعات متقاضی',    icon: '👤', required: true },
        { id: 2, key: 'identity',     title: 'تأیید هویت',        icon: '🆔', required: true },
        { id: 3, key: 'financial',    title: 'اطلاعات مالی',      icon: '💰', required: true },
        { id: 4, key: 'loan',         title: 'مشخصات وام',        icon: '🏦', required: true },
        { id: 5, key: 'documents',    title: 'مدارک',             icon: '📎', required: false },
        { id: 6, key: 'review',       title: 'بررسی نهایی',       icon: '✅', required: true }
    ];

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        currentStep: 1,
        totalSteps: STEPS_DEF.length,
        stepsDef: STEPS_DEF,
        data: {},
        uploadedDocs: [],
        visitingLog: [],
        broker: null,
        submitting: false,
        listeners: [],
        _draftTimer: null,
        lastSavedAt: null,
        restoredFromDraft: false
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var V2Events = {
        START:      'bwizv2.start',
        STEP:       'bwizv2.step',
        DRAFT:      'bwizv2.draft_saved',
        LOAD:       'bwizv2.draft_loaded',
        DRAFT_CLEAR:'bwizv2.draft_cleared',
        SUBMIT:     'bwizv2.submit',
        SUCCESS:    'bwizv2.success',
        FAIL:       'bwizv2.fail',
        CANCEL:     'bwizv2.cancel',
        VALIDATE:   'bwizv2.validate',
        DOC_ADDED:  'bwizv2.doc_added',
        DOC_REMOVED:'bwizv2.doc_removed'
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
        var x = Number(n); if (isNaN(x)) return '—';
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

    function _uid() {
        if (typeof WamPermissions === 'undefined') return null;
        var me = WamPermissions.getCurrentUser();
        return me ? me.id : null;
    }

    function _loadBroker() {
        if (typeof Storage === 'undefined') return null;
        var all = Storage.getJSON(BROKERS_KEY, []) || [];
        var u = (typeof WamPermissions !== 'undefined') ? WamPermissions.getCurrentUser() : null;
        if (!u) return null;
        for (var i = 0; i < all.length; i++) {
            var b = all[i]; if (!b) continue;
            if (b.userId && b.userId === u.id) return b;
            if (b.mobile && u.mobile &&
                String(b.mobile).replace(/\D/g, '') === String(u.mobile).replace(/\D/g, '')) return b;
        }
        return null;
    }

    function _genCaseId() {
        var y = new Date().getFullYear() % 100;
        var r = Math.floor(Math.random() * 9999);
        return 'WP-' + y + '-' + ('0000' + r).slice(-4);
    }

    // ─────────────────────────────────────
    // 🎯 رجیستری ماژول‌ها (Steps و Actions)
    // ─────────────────────────────────────
    // این توابع در فایل‌های brother با نام WamBrokerWizardV2Steps
    // و WamBrokerWizardV2Actions ثبت می‌شوند.
    function _getSteps() {
        return (typeof WamBrokerWizardV2Steps !== 'undefined') ? WamBrokerWizardV2Steps : null;
    }

    function _getActions() {
        return (typeof WamBrokerWizardV2Actions !== 'undefined') ? WamBrokerWizardV2Actions : null;
    }

    // ─────────────────────────────────────
    // 📥 Draft
    // ─────────────────────────────────────
    function saveDraft() {
        if (typeof Storage === 'undefined') return false;
        var payload = {
            version: VERSION,
            step: STATE.currentStep,
            data: STATE.data,
            docs: STATE.uploadedDocs,
            savedAt: Date.now()
        };
        var ok = Storage.setJSON(DRAFT_KEY, payload);
        if (ok) {
            STATE.lastSavedAt = Date.now();
            _emit(V2Events.DRAFT, { step: STATE.currentStep, at: STATE.lastSavedAt });
        }
        return ok;
    }

    function loadDraft() {
        if (typeof Storage === 'undefined') return null;
        var p = Storage.getJSON(DRAFT_KEY, null);
        if (!p || !p.data) return null;
        // بررسی TTL
        if (p.savedAt && (Date.now() - p.savedAt) > DRAFT_TTL) {
            clearDraft();
            return null;
        }
        return p;
    }

    function clearDraft() {
        if (typeof Storage === 'undefined') return false;
        var ok = Storage.remove(DRAFT_KEY);
        if (ok) _emit(V2Events.DRAFT_CLEAR, { at: Date.now() });
        return ok;
    }

    function hasDraft() {
        if (typeof Storage === 'undefined') return false;
        var p = Storage.getJSON(DRAFT_KEY, null);
        if (!p || !p.data) return false;
        if (p.savedAt && (Date.now() - p.savedAt) > DRAFT_TTL) return false;
        return true;
    }

    function _scheduleSave() {
        if (STATE._draftTimer) clearTimeout(STATE._draftTimer);
        STATE._draftTimer = setTimeout(function () {
            saveDraft();
        }, 900);
    }

    // ─────────────────────────────────────
    // 🧾 اعتبارسنجی (کلی)
    // ─────────────────────────────────────
    function validateStep(step, data) {
        data = data || STATE.data;
        var e = {};

        if (step === 1) {
            if (!data.applicantName || String(data.applicantName).trim().length < 3)
                e.applicantName = 'نام حداقل ۳ کاراکتر باشد';
            if (!data.applicantMobile || !/^09\d{9}$/.test(_en(data.applicantMobile)))
                e.applicantMobile = 'موبایل ۱۱ رقم و با ۰۹';
            if (data.applicantEmail &&
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.applicantEmail))
                e.applicantEmail = 'ایمیل نامعتبر';
        } else if (step === 2) {
            if (!data.applicantNationalCode ||
                !/^\d{10}$/.test(_en(data.applicantNationalCode)))
                e.applicantNationalCode = 'کد ملی ۱۰ رقم';
            if (!data.applicantBirthDate)
                e.applicantBirthDate = 'تاریخ تولد الزامی';
            if (!data.applicantGender)
                e.applicantGender = 'جنسیت الزامی';
            if (data.applicantIdNumber && String(data.applicantIdNumber).length < 5)
                e.applicantIdNumber = 'شماره شناسنامه نامعتبر';
        } else if (step === 3) {
            if (!data.applicantJob)
                e.applicantJob = 'شغل الزامی';
            if (!data.monthlyIncome || Number(_en(data.monthlyIncome)) <= 0)
                e.monthlyIncome = 'درآمد ماهانه الزامی';
            if (data.otherIncome && Number(_en(data.otherIncome)) < 0)
                e.otherIncome = 'درآمد نامعتبر';
        } else if (step === 4) {
            if (!data.bank) e.bank = 'بانک الزامی';
            if (!data.loanAmount || Number(_en(data.loanAmount)) < 1000000)
                e.loanAmount = 'حداقل ۱ میلیون ریال';
            if (!data.loanDuration) e.loanDuration = 'مدت الزامی';
            if (!data.purpose) e.purpose = 'هدف الزامی';
            if (data.collateralType && !data.collateralDesc)
                e.collateralDesc = 'توضیح وثیقه الزامی';
        } else if (step === 5) {
            // مدارک اختیاری — ولی اگر مدرک الزامی تعریف شده بود
            if (data.requiredDocs && data.requiredDocs.length > 0) {
                for (var i = 0; i < data.requiredDocs.length; i++) {
                    var code = data.requiredDocs[i];
                    var found = false;
                    for (var j = 0; j < STATE.uploadedDocs.length; j++) {
                        if (STATE.uploadedDocs[j].type === code) { found = true; break; }
                    }
                    if (!found) e.docs = 'مدارک الزامی بارگذاری نشده';
                }
            }
        } else if (step === 6) {
            if (!data.agreeTerms) e.agreeTerms = 'پذیرش قوانین الزامی';
            if (!data.agreeTruth) e.agreeTruth = 'تأیید صحت اطلاعات الزامی';
        }

        return e;
    }

    function validateAll(data) {
        data = data || STATE.data;
        var all = {};
        for (var s = 1; s <= STATE.totalSteps; s++) {
            var e = validateStep(s, data);
            for (var k in e) if (Object.prototype.hasOwnProperty.call(e, k)) all[k] = e[k];
        }
        return all;
    }

    function isStepComplete(step) {
        return Object.keys(validateStep(step)).length === 0;
    }

    // ─────────────────────────────────────
    // 📊 پیشرفت
    // ─────────────────────────────────────
    function computeProgress() {
        var done = 0;
        for (var s = 1; s <= STATE.totalSteps; s++) {
            if (isStepComplete(s)) done++;
        }
        return {
            done: done,
            total: STATE.totalSteps,
            percent: Math.round((done / STATE.totalSteps) * 100),
            currentStep: STATE.currentStep
        };
    }

    // ─────────────────────────────────────
    // 🎨 رندر — Progress + Tabs
    // ─────────────────────────────────────
    function _renderProgress() {
        var p = computeProgress();
        return '<div class="wam-wizv2__progress">' +
               '<div class="wam-wizv2__progress-bar"><div class="wam-wizv2__progress-fill" ' +
               'style="width:' + p.percent + '%"></div></div>' +
               '<div class="wam-wizv2__progress-label">' +
               _fa(p.done) + ' از ' + _fa(p.total) + ' مرحله تکمیل' +
               ' (' + _fa(p.percent) + '٪)</div>' +
               '</div>';
    }

    function _renderStepper() {
        var html = '<div class="wam-wizv2__stepper">';
        for (var i = 0; i < STATE.stepsDef.length; i++) {
            var s = STATE.stepsDef[i];
            var isDone = isStepComplete(s.id);
            var isCurrent = s.id === STATE.currentStep;
            var visited = STATE.visitingLog.indexOf(s.id) !== -1;
            html += '<div class="wam-wizv2__step' +
                (isCurrent ? ' is-current' : '') +
                (isDone ? ' is-done' : '') +
                (visited ? ' is-visited' : '') + '" ' +
                'data-wizv2-step="' + s.id + '" ' +
                'title="' + _esc(s.title) + '">' +
                '<div class="wam-wizv2__step-icon">' + s.icon + '</div>' +
                '<div class="wam-wizv2__step-title">' + _esc(s.title) + '</div>' +
                '</div>';
            if (i < STATE.stepsDef.length - 1) {
                html += '<div class="wam-wizv2__connector' +
                    (isDone ? ' is-done' : '') + '"></div>';
            }
        }
        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — محتوای مرحله
    // ─────────────────────────────────────
    function _renderCurrentStep() {
        var stepsMod = _getSteps();
        if (!stepsMod) {
            return '<div class="wam-empty">' +
                   'ماژول گام‌ها بارگذاری نشده (broker-wizard-v2-steps.js)</div>';
        }

        var stepDef = STATE.stepsDef[STATE.currentStep - 1];
        if (!stepDef) return '<div class="wam-empty">مرحله نامعتبر.</div>';

        // اگر steps یک تابع renderStep داشته باشد
        if (typeof stepsMod.renderStep === 'function') {
            try {
                return stepsMod.renderStep(stepDef.key, STATE.data, STATE);
            } catch (err) {
                console.error('[broker-wizard-v2] renderStep error:', err);
                return '<div class="wam-empty">خطا در رندر مرحله.</div>';
            }
        }

        // fallback: از getRenderer استفاده کن
        if (typeof stepsMod.getRenderer === 'function') {
            var renderer = stepsMod.getRenderer(stepDef.key);
            if (typeof renderer === 'function') {
                try { return renderer(STATE.data, STATE); }
                catch (err) { return '<div class="wam-empty">خطا در رندر.</div>'; }
            }
        }

        return '<div class="wam-empty">رندرکننده مرحله یافت نشد.</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ناوبری
    // ─────────────────────────────────────
    function _renderNav() {
        var first = STATE.currentStep === 1;
        var last = STATE.currentStep === STATE.totalSteps;

        var html = '<div class="wam-wizv2__nav">';
        html += '<button type="button" class="wam-btn wam-btn--ghost" ' +
                'data-wizv2-action="prev"' + (first ? ' disabled' : '') + '>' +
                '‹ قبلی</button>';

        html += '<div class="wam-wizv2__nav-center">' +
                '<span class="wam-wizv2__step-number">' +
                'مرحله ' + _fa(STATE.currentStep) + ' از ' + _fa(STATE.totalSteps) +
                '</span>' +
                '<button type="button" class="wam-btn wam-btn--ghost wam-btn--sm" ' +
                'data-wizv2-action="save-draft" title="ذخیره پیش‌نویس">💾</button>' +
                '</div>';

        if (last) {
            html += '<button type="button" class="wam-btn wam-btn--primary" ' +
                    'data-wizv2-action="submit">ثبت نهایی ✓</button>';
        } else {
            html += '<button type="button" class="wam-btn wam-btn--primary" ' +
                    'data-wizv2-action="next">بعدی ›</button>';
        }

        html += '</div>';

        // وضعیت draft
        if (STATE.lastSavedAt) {
            html += '<div class="wam-wizv2__draft-info">' +
                    '💾 ذخیره خودکار فعال — آخرین ذخیره: ' +
                    _esc(_relTime(STATE.lastSavedAt)) +
                    '</div>';
        }

        return html;
    }

    function _relTime(ts) {
        if (!ts) return '—';
        var d = Date.now() - ts;
        var s = Math.floor(d / 1000);
        if (s < 60) return 'همین الان';
        var m = Math.floor(s / 60);
        if (m < 60) return _fa(m) + ' دقیقه پیش';
        return _fa(Math.floor(m / 60)) + ' ساعت پیش';
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;

        var html =
            '<div class="wam-wizv2">' +
                _renderProgress() +
                _renderStepper() +
                '<div class="wam-wizv2__body" data-wizv2="body">' +
                    '<form class="wam-wizv2__form" onsubmit="return false">' +
                        _renderCurrentStep() +
                        _renderNav() +
                    '</form>' +
                '</div>' +
            '</div>';

        STATE.root.innerHTML = html;

        _bindInputs();
        _bindNav();
        _bindStepper();

        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.bindAll) {
            try { WamPersianDate.bindAll(STATE.root); } catch (e) { /* بی‌صدا */ }
        }

        // اطلاع به ماژول Actions
        var actionsMod = _getActions();
        if (actionsMod && typeof actionsMod.afterRender === 'function') {
            try { actionsMod.afterRender(STATE.root, STATE); } catch (e) { /* بی‌صدا */ }
        }
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindInputs() {
        if (!STATE.root) return;
        var els = STATE.root.querySelectorAll('input[name], select[name], textarea[name]');
        for (var i = 0; i < els.length; i++) {
            els[i].addEventListener('input', _onFieldChange);
            els[i].addEventListener('change', _onFieldChange);
        }
    }

    function _onFieldChange() {
        var name = this.getAttribute('name');
        if (!name) return;
        if (this.type === 'checkbox') {
            STATE.data[name] = !!this.checked;
        } else if (this.type === 'file') {
            // فایل‌ها را actions مدیریت می‌کند
        } else {
            STATE.data[name] = this.value;
        }
        _clearFieldError(name);
        _scheduleSave();

        // اطلاع به Actions
        var actionsMod = _getActions();
        if (actionsMod && typeof actionsMod.onFieldChange === 'function') {
            try { actionsMod.onFieldChange(name, this, STATE); } catch (e) { /* بی‌صدا */ }
        }
    }

    function _bindNav() {
        if (!STATE.root) return;
        var btns = STATE.root.querySelectorAll('[data-wizv2-action]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', _handleNavAction);
        }
    }

    function _bindStepper() {
        if (!STATE.root) return;
        var steps = STATE.root.querySelectorAll('[data-wizv2-step]');
        for (var i = 0; i < steps.length; i++) {
            steps[i].addEventListener('click', function () {
                var s = parseInt(this.getAttribute('data-wizv2-step'), 10);
                if (isNaN(s)) return;
                _tryGoToStep(s);
            });
        }
    }

    function _handleNavAction(e) {
        e.preventDefault();
        var action = this.getAttribute('data-wizv2-action');

        if (action === 'prev')        goPrev();
        else if (action === 'next')   goNext();
        else if (action === 'submit') submit();
        else if (action === 'save-draft') {
            var ok = saveDraft();
            if (typeof WamUI !== 'undefined') {
                if (ok) WamUI.toastSuccess('پیش‌نویس ذخیره شد', 'موفق');
                else WamUI.toastError('خطا در ذخیره پیش‌نویس', 'خطا');
            }
        } else {
            // شاید Actions مسئول این action باشد
            var actionsMod = _getActions();
            if (actionsMod && typeof actionsMod.handleAction === 'function') {
                try {
                    var handled = actionsMod.handleAction(action, this, STATE);
                    if (handled !== false) return;
                } catch (err) { /* بی‌صدا */ }
            }
        }
    }

    // ─────────────────────────────────────
    // 🎯 ناوبری
    // ─────────────────────────────────────
    function goNext() {
        if (STATE.submitting) return false;
        var errors = validateStep(STATE.currentStep);
        if (Object.keys(errors).length > 0) {
            _emit(V2Events.VALIDATE, { step: STATE.currentStep, errors: errors });
            _showErrors(errors);
            return false;
        }
        if (STATE.currentStep >= STATE.totalSteps) return false;

        STATE.currentStep++;
        _trackVisit(STATE.currentStep);
        saveDraft();
        render();
        _scrollTop();
        _emit(V2Events.STEP, { step: STATE.currentStep, direction: 'next' });
        return true;
    }

    function goPrev() {
        if (STATE.submitting) return false;
        if (STATE.currentStep <= 1) return false;
        STATE.currentStep--;
        saveDraft();
        render();
        _scrollTop();
        _emit(V2Events.STEP, { step: STATE.currentStep, direction: 'prev' });
        return true;
    }

    function gotoStep(step, force) {
        if (step < 1 || step > STATE.totalSteps) return false;
        if (step === STATE.currentStep) return true;

        // اگر جلوتر می‌رویم، اعتبارسنجی
        if (step > STATE.currentStep && !force) {
            for (var s = STATE.currentStep; s < step; s++) {
                var e = validateStep(s);
                if (Object.keys(e).length > 0) {
                    _emit(V2Events.VALIDATE, { step: s, errors: e, blocked: true });
                    _showErrors(e);
                    if (typeof WamUI !== 'undefined') {
                        WamUI.toastWarning('ابتدا مراحل قبلی را کامل کنید', 'توجه');
                    }
                    return false;
                }
            }
        }

        STATE.currentStep = step;
        _trackVisit(step);
        saveDraft();
        render();
        _scrollTop();
        _emit(V2Events.STEP, { step: step, direction: 'jump' });
        return true;
    }

    function _tryGoToStep(s) {
        // فقط اگر کامل است یا عقب می‌رویم
        if (s <= STATE.currentStep) {
            gotoStep(s);
        } else {
            gotoStep(s);
        }
    }

    function _trackVisit(step) {
        if (STATE.visitingLog.indexOf(step) === -1) {
            STATE.visitingLog.push(step);
        }
    }

    function _scrollTop() {
        try {
            if (STATE.root && STATE.root.scrollIntoView) {
                STATE.root.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } catch (e) {
            try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (err) { /* بی‌صدا */ }
        }
    }

    // ─────────────────────────────────────
    // 🎨 خطاها
    // ─────────────────────────────────────
    function _showErrors(errors) {
        _clearErrors();
        for (var k in errors) {
            if (!Object.prototype.hasOwnProperty.call(errors, k)) continue;
            var el = STATE.root.querySelector('[data-error="' + k + '"]');
            if (el) { el.textContent = errors[k]; el.style.display = 'block'; }
            var inp = STATE.root.querySelector('[name="' + k + '"]');
            if (inp) inp.classList.add('wam-input--error');
        }
        // اسکرول به اولین خطا
        var firstErr = STATE.root.querySelector('.wam-input--error');
        if (firstErr && firstErr.focus) {
            try { firstErr.focus(); } catch (e) { /* بی‌صدا */ }
        }
    }

    function _clearErrors() {
        if (!STATE.root) return;
        var el = STATE.root.querySelectorAll('[data-error]');
        for (var i = 0; i < el.length; i++) {
            el[i].textContent = '';
            el[i].style.display = 'none';
        }
        var ip = STATE.root.querySelectorAll('.wam-input--error');
        for (var j = 0; j < ip.length; j++) ip[j].classList.remove('wam-input--error');
    }

    function _clearFieldError(name) {
        if (!STATE.root) return;
        var el = STATE.root.querySelector('[data-error="' + name + '"]');
        if (el) { el.textContent = ''; el.style.display = 'none'; }
        var inp = STATE.root.querySelector('[name="' + name + '"]');
        if (inp) inp.classList.remove('wam-input--error');
    }

    // ─────────────────────────────────────
    // 📎 مدیریت مدارک (کمک به Steps)
    // ─────────────────────────────────────
    function addDocument(doc) {
        if (!doc || !doc.type) return { ok: false, reason: 'invalid' };

        // بررسی تکراری
        for (var i = 0; i < STATE.uploadedDocs.length; i++) {
            if (STATE.uploadedDocs[i].type === doc.type &&
                STATE.uploadedDocs[i].name === doc.name) {
                return { ok: false, reason: 'duplicate' };
            }
        }

        var item = {
            id: 'doc_' + Date.now().toString(36) + '_' +
                Math.random().toString(36).slice(2, 6),
            type: doc.type,
            name: doc.name || doc.type,
            size: doc.size || 0,
            mime: doc.mime || null,
            data: doc.data || null,    // dataURL در صورت نیاز
            uploadedAt: Date.now()
        };

        STATE.uploadedDocs.push(item);
        _scheduleSave();
        _emit(V2Events.DOC_ADDED, { doc: item, count: STATE.uploadedDocs.length });
        return { ok: true, doc: item };
    }

    function removeDocument(id) {
        for (var i = STATE.uploadedDocs.length - 1; i >= 0; i--) {
            if (STATE.uploadedDocs[i].id === id) {
                var removed = STATE.uploadedDocs.splice(i, 1)[0];
                _scheduleSave();
                _emit(V2Events.DOC_REMOVED, { doc: removed, count: STATE.uploadedDocs.length });
                return { ok: true, doc: removed };
            }
        }
        return { ok: false, reason: 'not_found' };
    }

    function getDocuments() {
        return STATE.uploadedDocs.slice();
    }

    // ─────────────────────────────────────
    // ✅ ارسال نهایی
    // ─────────────────────────────────────
    function submit() {
        if (STATE.submitting) return;

        var errors = validateAll();
        if (Object.keys(errors).length > 0) {
            // پرش به اولین مرحله دارای خطا
            for (var s = 1; s <= STATE.totalSteps; s++) {
                var se = validateStep(s);
                if (Object.keys(se).length > 0) {
                    STATE.currentStep = s;
                    render();
                    _showErrors(se);
                    break;
                }
            }
            _emit(V2Events.VALIDATE, { errors: errors, blocked: true });
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('لطفاً خطاها را برطرف کنید', 'خطا');
            }
            return false;
        }

        STATE.submitting = true;
        _setBusy(true);
        _emit(V2Events.SUBMIT, { at: Date.now() });

        setTimeout(function () {
            var res = _createCase();
            if (!res.ok) {
                STATE.submitting = false;
                _setBusy(false);
                _emit(V2Events.FAIL, res);
                if (typeof WamUI !== 'undefined') {
                    WamUI.toastError('خطا در ثبت: ' + (res.reason || 'نامشخص'), 'خطا');
                }
                return;
            }

            clearDraft();
            _emit(V2Events.SUCCESS, { caseId: res.caseId, at: Date.now() });

            if (typeof WamUI !== 'undefined') {
                WamUI.toastSuccess('پرونده ' + res.caseId + ' ثبت شد', 'موفق');
                if (WamUI.loader) WamUI.loader.show('وام پی', 'در حال انتقال...');
            }

            setTimeout(function () {
                window.location.href = 'case-details.html?id=' + encodeURIComponent(res.caseId);
            }, 900);
        }, 500);
    }

    function _createCase() {
        if (typeof CaseRepository === 'undefined') return { ok: false, reason: 'no_repo' };
        if (!STATE.broker) return { ok: false, reason: 'no_broker' };

        var caseId = _genCaseId();
        var d = STATE.data;

        var caseData = {
            caseId: caseId,
            brokerId: STATE.broker.id,
            brokerName: STATE.broker.name,
            brokerCode: STATE.broker.brokerCode,
            bank: d.bank,
            loanAmount: Number(_en(d.loanAmount)) || 0,
            loanDuration: Number(d.loanDuration) || 0,
            purpose: d.purpose || null,
            loanNote: d.loanNote || null,
            collateralType: d.collateralType || null,
            collateralDesc: d.collateralDesc || null,

            applicantName: (d.applicantName || '').trim(),
            applicantMobile: _en(d.applicantMobile) || null,
            applicantNationalCode: _en(d.applicantNationalCode) || null,
            applicantBirthDate: d.applicantBirthDate || null,
            applicantGender: d.applicantGender || null,
            applicantIdNumber: d.applicantIdNumber || null,
            applicantJob: d.applicantJob || null,
            applicantIncome: Number(_en(d.monthlyIncome)) || 0,
            applicantOtherIncome: Number(_en(d.otherIncome)) || 0,
            applicantEmail: d.applicantEmail || null,
            applicantAddress: d.applicantAddress || null,

            documents: STATE.uploadedDocs.slice(),

            status: 'draft',
            currentStep: 'step_1',
            source: 'broker-wizard-v2',
            wizardVersion: VERSION
        };

        var created = CaseRepository.create(caseData, { userId: _uid() });
        if (!created) return { ok: false, reason: 'create_failed' };

        if (typeof CaseStateMachine !== 'undefined' && CaseStateMachine.startStep) {
            try {
                CaseStateMachine.startStep(caseId, 'step_1', {
                    userId: _uid(),
                    role: 'broker'
                });
            } catch (e) { /* بی‌صدا */ }
        }

        return { ok: true, caseId: caseId, case: created };
    }

    function _setBusy(b) {
        if (!STATE.root) return;
        var btn = STATE.root.querySelector('[data-wizv2-action="submit"]');
        if (!btn) return;
        if (b) {
            btn.disabled = true;
            btn.setAttribute('data-orig', btn.textContent);
            btn.textContent = 'در حال ثبت...';
        } else {
            btn.disabled = false;
            var o = btn.getAttribute('data-orig');
            if (o) btn.textContent = o;
        }
    }

    // ─────────────────────────────────────
    // 🔄 Reset
    // ─────────────────────────────────────
    function reset(options) {
        options = options || {};
        STATE.currentStep = 1;
        STATE.data = {};
        STATE.uploadedDocs = [];
        STATE.visitingLog = [1];
        STATE.submitting = false;
        STATE.lastSavedAt = null;
        if (options.clearDraft !== false) clearDraft();
        render();
        _emit(V2Events.CANCEL, { at: Date.now() });
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var run = function () {
            var u = (typeof WamPermissions !== 'undefined') ? WamPermissions.getCurrentUser() : null;
            if (!u) {
                if (typeof WamPayGuard !== 'undefined') WamPayGuard.redirectToLogin('not_logged_in');
                return;
            }
            if (u.role !== 'broker' && u.role !== 'admin' && u.role !== 'super_admin') {
                if (typeof WamPayGuard !== 'undefined') WamPayGuard.redirectToRoleHome(u.role);
                return;
            }

            var root = options.root ||
                       document.querySelector('[' + ROOT_ATTR + ']') ||
                       document.querySelector('.wam-broker-wizard-v2');
            if (!root) {
                if (options.debug) console.warn('[broker-wizard-v2] root پیدا نشد');
                return;
            }
            STATE.root = root;

            STATE.broker = _loadBroker();
            if (!STATE.broker) {
                STATE.root.innerHTML =
                    '<div class="wam-empty">اطلاعات کارگزار یافت نشد. با پشتیبانی تماس بگیرید.</div>';
                return;
            }

            // بازیابی draft
            var d = loadDraft();
            if (d && d.data && options.restoreDraft !== false) {
                STATE.data = d.data || {};
                STATE.uploadedDocs = d.docs || [];
                STATE.currentStep = Math.min(d.step || 1, STATE.totalSteps);
                STATE.lastSavedAt = d.savedAt || null;
                STATE.restoredFromDraft = true;
                if (typeof WamUI !== 'undefined') {
                    WamUI.toastInfo('پیش‌نویس قبلی بازیابی شد', 'خوش آمدید');
                }
                _emit(V2Events.LOAD, { step: STATE.currentStep, savedAt: d.savedAt });
            } else {
                STATE.visitingLog = [1];
            }

            render();
            STATE.installed = true;

            _emit(V2Events.START, {
                version: VERSION,
                step: STATE.currentStep,
                hasDraft: !!d,
                at: Date.now()
            });

            if (options.debug) {
                console.log('[broker-wizard-v2] آماده، نسخه ' + VERSION +
                    '، مرحله ' + STATE.currentStep);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run);
        } else {
            run();
        }
    }

    function uninstall() {
        if (STATE._draftTimer) {
            clearTimeout(STATE._draftTimer);
            STATE._draftTimer = null;
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
            version: VERSION,
            currentStep: STATE.currentStep,
            totalSteps: STATE.totalSteps,
            stepKey: STATE.stepsDef[STATE.currentStep - 1]
                ? STATE.stepsDef[STATE.currentStep - 1].key : null,
            dataFields: Object.keys(STATE.data).length,
            docsCount: STATE.uploadedDocs.length,
            submitting: STATE.submitting,
            hasDraft: hasDraft(),
            lastSavedAt: STATE.lastSavedAt,
            restoredFromDraft: STATE.restoredFromDraft,
            progress: computeProgress(),
            brokerId: STATE.broker ? STATE.broker.id : null
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
    var WamBrokerWizardV2 = {
        // ثوابت
        EVENTS: V2Events,
        VERSION: VERSION,
        STEPS_DEF: STEPS_DEF,
        ROOT_ATTR: ROOT_ATTR,
        DRAFT_KEY: DRAFT_KEY,
        DRAFT_TTL: DRAFT_TTL,

        // نصب/چرخه
        install: install,
        uninstall: uninstall,
        render: render,
        reset: reset,

        // ناوبری
        goNext: goNext,
        goPrev: goPrev,
        gotoStep: gotoStep,
        submit: submit,

        // Draft
        saveDraft: saveDraft,
        loadDraft: loadDraft,
        clearDraft: clearDraft,
        hasDraft: hasDraft,

        // اعتبارسنجی
        validateStep: validateStep,
        validateAll: validateAll,
        isStepComplete: isStepComplete,
        computeProgress: computeProgress,

        // مدارک
        addDocument: addDocument,
        removeDocument: removeDocument,
        getDocuments: getDocuments,

        // داده
        getData: function () { return JSON.parse(JSON.stringify(STATE.data)); },
        setData: function (d) { STATE.data = d || {}; render(); },
        getState: function () { return STATE; },

        // گزارش
        getStatus: getStatus,
        onChange: onChange
    };

    window.WamBrokerWizardV2 = WamBrokerWizardV2;
    window.BrokerWizardV2Events = V2Events;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-broker-wizard-v2-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-broker-wizard-v2')) {
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




/* ==========================================
 * FROM: js/broker-app.js
 * ========================================== */







/* ==========================================
 * END OF BUNDLE
 * ========================================== */