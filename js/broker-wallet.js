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