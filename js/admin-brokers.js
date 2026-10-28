// ==========================================
// وام پی — Admin Panel
// فایل: admin-brokers.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: مدیریت کارگزاران — لیست، افزودن، ویرایش، کیف پول، فعال/غیرفعال
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var BROKERS_KEY   = 'wamPayBrokers';
    var USERS_KEY     = 'wamPayUsers';
    var WALLETS_KEY   = 'wamPayWallets';
    var FORM_ID       = 'wamBrokerForm';
    var PAGE_SIZE     = 20;

    var STATUS_LABELS = {
        active:    'فعال',
        inactive:  'غیرفعال',
        pending:   'در انتظار تأیید',
        blocked:   'مسدود'
    };

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        brokers: [],
        filtered: [],
        page: 1,
        query: '',
        statusFilter: '',
        editingId: null,
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var BrokerEvents = {
        LOADED:   'admin.brokers.loaded',
        CREATED:  'admin.brokers.created',
        UPDATED:  'admin.brokers.updated',
        DELETED:  'admin.brokers.deleted',
        TOGGLED:  'admin.brokers.toggled',
        WALLET:   'admin.brokers.wallet_opened'
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

    function _generateId() {
        var r = Math.random().toString(36).slice(2, 8);
        return 'br_' + Date.now().toString(36) + '_' + r;
    }

    function _generateBrokerCode() {
        var r = Math.random().toString(36).slice(2, 7).toUpperCase();
        return 'WP-BR-' + r;
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری / ذخیره
    // ─────────────────────────────────────
    function _loadBrokers() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(BROKERS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveBrokers() {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(BROKERS_KEY, STATE.brokers);
    }

    function _loadUsers() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(USERS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _loadWallets() {
        if (typeof Storage === 'undefined') return {};
        return Storage.getJSON(WALLETS_KEY, {}) || {};
    }

    function _getBrokerWallet(brokerId) {
        var all = _loadWallets();
        return all[brokerId] || { balance: 0, totalEarned: 0, totalWithdrawn: 0, transactions: [] };
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر
    // ─────────────────────────────────────
    function _applyFilters() {
        var q = (STATE.query || '').toLowerCase().trim();
        var sf = STATE.statusFilter;

        STATE.filtered = STATE.brokers.filter(function (b) {
            if (!b) return false;
            if (sf) {
                var st = b.status || (b.active === false ? 'inactive' : 'active');
                if (st !== sf) return false;
            }
            if (q) {
                var hay = [
                    b.name, b.brokerCode, b.mobile, b.email,
                    b.id, b.nationalCode
                ].filter(Boolean).join(' ').toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            return true;
        });

        return STATE.filtered;
    }

    // ─────────────────────────────────────
    // 🎨 رندر
    // ─────────────────────────────────────
    function _renderRow(b) {
        var wallet = _getBrokerWallet(b.id);
        var st = b.status || (b.active === false ? 'inactive' : 'active');
        var stLabel = STATUS_LABELS[st] || st;

        var html = '<tr data-broker-id="' + _escapeHtml(b.id) + '">';
        html += '<td class="wam-table__name">' + _escapeHtml(b.name || '—') + '</td>';
        html += '<td><code>' + _escapeHtml(b.brokerCode || '—') + '</code></td>';
        html += '<td>' + _escapeHtml(b.mobile || '—') + '</td>';
        html += '<td>' + _formatNumber(b.activeCases || 0) + '</td>';
        html += '<td>' + _formatAmount(wallet.balance) + '</td>';
        html += '<td><span class="wam-badge wam-badge--' + _escapeHtml(st) + '">' +
                _escapeHtml(stLabel) + '</span></td>';
        html += '<td>' + _escapeHtml(_relativeTime(b.lastActiveAt || b.createdAt)) + '</td>';
        html += '<td class="wam-table__actions">';
        html += '<button class="wam-btn-icon" data-action="edit" data-id="' +
                _escapeHtml(b.id) + '" title="ویرایش">✏️</button>';
        html += '<button class="wam-btn-icon" data-action="wallet" data-id="' +
                _escapeHtml(b.id) + '" title="کیف پول">💰</button>';
        html += '<button class="wam-btn-icon" data-action="toggle" data-id="' +
                _escapeHtml(b.id) + '" title="فعال/غیرفعال">' +
                (st === 'inactive' ? '🟢' : '⏸️') + '</button>';
        html += '<button class="wam-btn-icon wam-btn-icon--danger" ' +
                'data-action="delete" data-id="' + _escapeHtml(b.id) +
                '" title="حذف">🗑️</button>';
        html += '</td></tr>';
        return html;
    }

    function _renderTable() {
        if (!STATE.root) return;
        var tbody = STATE.root.querySelector('[data-brokers="tbody"]');
        if (!tbody) return;

        var list = STATE.filtered;
        var start = (STATE.page - 1) * PAGE_SIZE;
        var end = Math.min(start + PAGE_SIZE, list.length);
        var items = list.slice(start, end);

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="wam-table__empty">' +
                (STATE.brokers.length === 0
                    ? 'هیچ کارگزاری ثبت نشده است.'
                    : 'نتیجه‌ای یافت نشد.') + '</td></tr>';
        } else {
            var html = '';
            for (var i = 0; i < items.length; i++) html += _renderRow(items[i]);
            tbody.innerHTML = html;
        }

        _renderPagination();
        _updateCounters();
        _bindRowActions();
    }

    function _renderPagination() {
        if (!STATE.root) return;
        var el = STATE.root.querySelector('[data-brokers="pagination"]');
        if (!el) return;

        var total = STATE.filtered.length;
        var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (pages <= 1) { el.innerHTML = ''; return; }

        var html = '<button data-page="' + (STATE.page - 1) + '"' +
                   (STATE.page === 1 ? ' disabled' : '') + '>قبلی</button>';
        html += '<span>صفحه ' + _formatNumber(STATE.page) + ' از ' +
                _formatNumber(pages) + '</span>';
        html += '<button data-page="' + (STATE.page + 1) + '"' +
                (STATE.page === pages ? ' disabled' : '') + '>بعدی</button>';
        el.innerHTML = html;

        var btns = el.querySelectorAll('[data-page]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function () {
                var p = parseInt(this.getAttribute('data-page'), 10);
                if (!isNaN(p) && p >= 1 && p <= pages) {
                    STATE.page = p;
                    _renderTable();
                }
            });
        }
    }

    function _updateCounters() {
        if (!STATE.root) return;
        var el = STATE.root.querySelector('[data-brokers="count"]');
        if (el) {
            el.textContent = _formatNumber(STATE.filtered.length) + ' از ' +
                             _formatNumber(STATE.brokers.length);
        }
    }

    function render() {
        if (!STATE.root) return;
        _applyFilters();
        _renderTable();
    }

    // ─────────────────────────────────────
    // ➕ افزودن کارگزار
    // ─────────────────────────────────────
    function addBroker(data, options) {
        options = options || {};
        var result = { ok: false, reason: null, broker: null, errors: null };

        // اعتبارسنجی
        var errors = _validate(data);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        // بررسی تکراری
        if (_findByMobile(data.mobile)) {
            result.errors = { mobile: 'این موبایل قبلاً ثبت شده است' };
            result.reason = 'duplicate';
            return result;
        }

        var now = Date.now();
        var me = (typeof WamPermissions !== 'undefined')
            ? WamPermissions.getCurrentUser() : null;

        var broker = {
            id: _generateId(),
            brokerCode: _generateBrokerCode(),
            name: (data.name || '').trim(),
            mobile: String(data.mobile || '').replace(/\D/g, ''),
            email: data.email ? String(data.email).trim() : null,
            nationalCode: data.nationalCode || null,
            commissionRate: Number(data.commissionRate) || 0,   // درصد
            bankAccount: data.bankAccount || null,
            iban: data.iban || null,
            address: data.address || null,
            notes: data.notes || null,
            active: data.active !== false,
            status: data.active === false ? 'inactive' : 'active',
            activeCases: 0,
            createdAt: now,
            createdBy: me ? me.id : null,
            lastActiveAt: null
        };

        STATE.brokers.push(broker);
        if (!_saveBrokers()) {
            STATE.brokers.pop();
            result.reason = 'storage_error';
            return result;
        }

        // ساخت کاربر متناظر (اختیاری)
        if (options.createUser !== false) {
            _createBrokerUser(broker, data);
        }

        result.ok = true;
        result.broker = broker;
        _emit(BrokerEvents.CREATED, { broker: broker, at: now });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('کارگزار «' + broker.name + '» ساخته شد', 'موفق');
        }
        render();
        return result;
    }

    function _createBrokerUser(broker, data) {
        var users = _loadUsers();
        var username = 'br_' + String(broker.mobile).slice(-6);
        // یکتا بودن
        var uniq = username, n = 1;
        while (users.some(function (u) { return u && u.username === uniq; })) {
            uniq = username + '_' + (++n);
        }

        var pwd = data.password || ('br' + String(broker.mobile).slice(-6));
        var hashed;
        if (typeof WamLogin !== 'undefined' && WamLogin.hash) {
            hashed = WamLogin.hash(pwd);
        } else {
            var h = 5381;
            for (var i = 0; i < pwd.length; i++) {
                h = ((h << 5) + h) + pwd.charCodeAt(i);
                h = h & 0xffffffff;
            }
            hashed = 'wh1_' + (h >>> 0).toString(16);
        }

        var me = (typeof WamPermissions !== 'undefined')
            ? WamPermissions.getCurrentUser() : null;

        users.push({
            id: 'u_' + broker.id.slice(3),
            name: broker.name,
            username: uniq,
            mobile: broker.mobile,
            email: broker.email,
            password: hashed,
            role: 'broker',
            brokerId: broker.id,
            active: broker.active,
            status: broker.status,
            mustChangePassword: true,
            createdAt: Date.now(),
            createdBy: me ? me.id : null,
            passwordVersion: 1
        });

        if (typeof Storage !== 'undefined') {
            Storage.setJSON(USERS_KEY, users);
        }
    }

    // ─────────────────────────────────────
    // ✏️ ویرایش
    // ─────────────────────────────────────
    function updateBroker(id, patch) {
        var result = { ok: false, reason: null, broker: null, errors: null };
        var broker = _findById(id);
        if (!broker) { result.reason = 'not_found'; return result; }

        var errors = _validate(patch, id);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        if (patch.mobile && patch.mobile !== broker.mobile) {
            var dup = _findByMobile(patch.mobile);
            if (dup && dup.id !== id) {
                result.errors = { mobile: 'این موبایل تکراری است' };
                result.reason = 'duplicate';
                return result;
            }
        }

        var fields = ['name', 'mobile', 'email', 'nationalCode', 'commissionRate',
                      'bankAccount', 'iban', 'address', 'notes', 'status', 'active'];
        for (var i = 0; i < fields.length; i++) {
            var f = fields[i];
            if (patch[f] !== undefined) broker[f] = patch[f];
        }
        if (patch.mobile) broker.mobile = String(patch.mobile).replace(/\D/g, '');
        broker.updatedAt = Date.now();

        if (!_saveBrokers()) { result.reason = 'storage_error'; return result; }

        result.ok = true;
        result.broker = broker;
        _emit(BrokerEvents.UPDATED, { broker: broker, at: Date.now() });
        if (typeof WamUI !== 'undefined') WamUI.toastSuccess('کارگزار به‌روزرسانی شد', 'موفق');
        render();
        return result;
    }

    // ─────────────────────────────────────
    // 🗑️ حذف
    // ─────────────────────────────────────
    function deleteBroker(id) {
        var broker = _findById(id);
        if (!broker) return { ok: false, reason: 'not_found' };

        var idx = -1;
        for (var i = 0; i < STATE.brokers.length; i++) {
            if (STATE.brokers[i] && STATE.brokers[i].id === id) { idx = i; break; }
        }
        if (idx === -1) return { ok: false, reason: 'not_found' };

        var removed = STATE.brokers.splice(idx, 1)[0];
        if (!_saveBrokers()) {
            STATE.brokers.splice(idx, 0, removed);
            return { ok: false, reason: 'storage_error' };
        }

        _emit(BrokerEvents.DELETED, { broker: removed, at: Date.now() });
        if (typeof WamUI !== 'undefined') WamUI.toastSuccess('کارگزار حذف شد', 'موفق');
        render();
        return { ok: true, broker: removed };
    }

    // ─────────────────────────────────────
    // 🔀 تغییر وضعیت
    // ─────────────────────────────────────
    function toggleBroker(id) {
        var broker = _findById(id);
        if (!broker) return { ok: false, reason: 'not_found' };

        var isActive = !(broker.active === false || broker.status === 'inactive');
        broker.active = !isActive;
        broker.status = !isActive ? 'active' : 'inactive';
        broker.updatedAt = Date.now();

        if (!_saveBrokers()) return { ok: false, reason: 'storage_error' };

        _emit(BrokerEvents.TOGGLED, { broker: broker, active: !isActive, at: Date.now() });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('کارگزار ' + (!isActive ? 'فعال' : 'غیرفعال') + ' شد', 'موفق');
        }
        render();
        return { ok: true, broker: broker, active: !isActive };
    }

    // ─────────────────────────────────────
    // 💰 کیف پول
    // ─────────────────────────────────────
    function openWallet(id) {
        var broker = _findById(id);
        if (!broker) return;

        var wallet = _getBrokerWallet(id);

        var existing = document.getElementById('wamWalletModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var modal = document.createElement('div');
        modal.id = 'wamWalletModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel" role="dialog">' +
                '<header class="wam-modal__head">' +
                    '<h3>💰 کیف پول — ' + _escapeHtml(broker.name) + '</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<div class="wam-modal__body">' +
                    '<div class="wam-wallet-summary">' +
                        '<div><span>موجودی:</span> <strong>' +
                        _formatAmount(wallet.balance) + ' ریال</strong></div>' +
                        '<div><span>کل درآمد:</span> ' +
                        _formatAmount(wallet.totalEarned) + ' ریال</div>' +
                        '<div><span>کل برداشت:</span> ' +
                        _formatAmount(wallet.totalWithdrawn) + ' ریال</div>' +
                    '</div>' +
                    '<h4>آخرین تراکنش‌ها</h4>' +
                    '<div class="wam-wallet-tx">' + _renderWalletTx(wallet.transactions) + '</div>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);

        var closeBtns = modal.querySelectorAll('[data-close]');
        for (var i = 0; i < closeBtns.length; i++) {
            closeBtns[i].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }

        _emit(BrokerEvents.WALLET, { broker: broker, wallet: wallet, at: Date.now() });
    }

    function _renderWalletTx(txs) {
        if (!txs || txs.length === 0) {
            return '<div class="wam-muted">تراکنشی ثبت نشده است.</div>';
        }
        var html = '<ul>';
        var list = txs.slice(-10).reverse();
        for (var i = 0; i < list.length; i++) {
            var t = list[i];
            var kind = t.type === 'withdraw' ? 'برداشت'
                     : t.type === 'deposit' ? 'واریز'
                     : t.type === 'commission' ? 'پورسانت' : t.type;
            html += '<li><span>' + _escapeHtml(kind) + '</span>' +
                    '<span>' + _formatAmount(t.amount) + '</span>' +
                    '<span>' + _escapeHtml(_relativeTime(t.at)) + '</span></li>';
        }
        html += '</ul>';
        return html;
    }

    // ─────────────────────────────────────
    // 🧾 اعتبارسنجی
    // ─────────────────────────────────────
    function _validate(data, excludeId) {
        var errors = {};
        if (!data.name || String(data.name).trim().length < 3) {
            errors.name = 'نام حداقل ۳ کاراکتر باشد';
        }
        if (!data.mobile) {
            errors.mobile = 'موبایل الزامی است';
        } else {
            var m = String(data.mobile).replace(/\D/g, '');
            if (!/^09\d{9}$/.test(m)) errors.mobile = 'موبایل باید ۱۱ رقم و با ۰۹ شروع شود';
        }
        if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
            errors.email = 'ایمیل نامعتبر است';
        }
        if (data.nationalCode && !/^\d{10}$/.test(String(data.nationalCode))) {
            errors.nationalCode = 'کد ملی باید ۱۰ رقم باشد';
        }
        if (data.commissionRate !== undefined && data.commissionRate !== '' &&
            data.commissionRate !== null) {
            var cr = Number(data.commissionRate);
            if (isNaN(cr) || cr < 0 || cr > 100) {
                errors.commissionRate = 'درصد پورسانت باید بین ۰ تا ۱۰۰ باشد';
            }
        }
        return errors;
    }

    // ─────────────────────────────────────
    // 🔍 پیدا کردن
    // ─────────────────────────────────────
    function _findById(id) {
        for (var i = 0; i < STATE.brokers.length; i++) {
            if (STATE.brokers[i] && STATE.brokers[i].id === id) return STATE.brokers[i];
        }
        return null;
    }

    function _findByMobile(mobile) {
        if (!mobile) return null;
        var m = String(mobile).replace(/\D/g, '');
        for (var i = 0; i < STATE.brokers.length; i++) {
            var b = STATE.brokers[i];
            if (b && b.mobile && String(b.mobile).replace(/\D/g, '') === m) return b;
        }
        return null;
    }

    // ─────────────────────────────────────
    // 🖱️ رویدادها
    // ─────────────────────────────────────
    function _bindRowActions() {
        if (!STATE.root) return;
        var rows = STATE.root.querySelectorAll('tr[data-broker-id]');
        for (var i = 0; i < rows.length; i++) {
            var btns = rows[i].querySelectorAll('[data-action]');
            for (var j = 0; j < btns.length; j++) {
                btns[j].addEventListener('click', _handleRowAction);
            }
        }
    }

    function _handleRowAction(e) {
        e.preventDefault();
        var action = this.getAttribute('data-action');
        var id = this.getAttribute('data-id');
        if (!action || !id) return;

        if (action === 'edit') openEditForm(id);
        else if (action === 'wallet') openWallet(id);
        else if (action === 'toggle') toggleBroker(id);
        else if (action === 'delete') _confirmDelete(id);
    }

    function _confirmDelete(id) {
        var b = _findById(id);
        if (!b) return;
        var msg = 'کارگزار «' + (b.name || '') + '» حذف شود؟';
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('حذف کارگزار', msg, { danger: true }).then(function (ok) {
                if (ok) deleteBroker(id);
            });
        } else if (window.confirm(msg)) {
            deleteBroker(id);
        }
    }

    // ─────────────────────────────────────
    // 🎛️ فیلترها
    // ─────────────────────────────────────
    function _bindFilters() {
        if (!STATE.root) return;
        var s = STATE.root.querySelector('[data-brokers="search"]');
        if (s) s.addEventListener('input', function () {
            STATE.query = this.value; STATE.page = 1; render();
        });
        var st = STATE.root.querySelector('[data-brokers="filter-status"]');
        if (st) st.addEventListener('change', function () {
            STATE.statusFilter = this.value; STATE.page = 1; render();
        });
        var addBtn = STATE.root.querySelector('[data-brokers-action="add"]');
        if (addBtn) addBtn.addEventListener('click', function (e) {
            e.preventDefault(); openAddForm();
        });
    }

    // ─────────────────────────────────────
    // 🎯 فرم modal
    // ─────────────────────────────────────
    function openAddForm() {
        STATE.editingId = null;
        _openFormModal(null);
    }

    function openEditForm(id) {
        var b = _findById(id);
        if (!b) return;
        STATE.editingId = id;
        _openFormModal(b);
    }

    function _openFormModal(broker) {
        var existing = document.getElementById('wamBrokerModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var isEdit = !!broker;
        var b = broker || {};

        var modal = document.createElement('div');
        modal.id = 'wamBrokerModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>' + (isEdit ? 'ویرایش کارگزار' : 'افزودن کارگزار جدید') + '</h3>' +
                    '<button type="button" class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form id="' + FORM_ID + '" class="wam-modal__body">' +
                    '<div class="wam-field"><label>نام و نام خانوادگی *</label>' +
                        '<input name="name" value="' + _escapeHtml(b.name || '') + '" required>' +
                        '<div class="wam-field__error" data-error="name"></div></div>' +

                    '<div class="wam-field"><label>موبایل *</label>' +
                        '<input name="mobile" type="tel" value="' + _escapeHtml(b.mobile || '') +
                        '" placeholder="09123456789" required>' +
                        '<div class="wam-field__error" data-error="mobile"></div></div>' +

                    '<div class="wam-field"><label>کد ملی</label>' +
                        '<input name="nationalCode" value="' + _escapeHtml(b.nationalCode || '') +
                        '" placeholder="۱۰ رقم">' +
                        '<div class="wam-field__error" data-error="nationalCode"></div></div>' +

                    '<div class="wam-field"><label>ایمیل</label>' +
                        '<input name="email" type="email" value="' + _escapeHtml(b.email || '') + '">' +
                        '<div class="wam-field__error" data-error="email"></div></div>' +

                    '<div class="wam-field"><label>درصد پورسانت</label>' +
                        '<input name="commissionRate" type="number" min="0" max="100" step="0.5" ' +
                        'value="' + _escapeHtml(b.commissionRate || 0) + '">' +
                        '<div class="wam-field__error" data-error="commissionRate"></div></div>' +

                    '<div class="wam-field"><label>شماره حساب</label>' +
                        '<input name="bankAccount" value="' + _escapeHtml(b.bankAccount || '') + '"></div>' +

                    '<div class="wam-field"><label>شبا</label>' +
                        '<input name="iban" value="' + _escapeHtml(b.iban || '') + '" placeholder="IR..."></div>' +

                    '<div class="wam-field"><label>آدرس</label>' +
                        '<textarea name="address" rows="2">' + _escapeHtml(b.address || '') + '</textarea></div>' +

                    '<div class="wam-field"><label>یادداشت</label>' +
                        '<textarea name="notes" rows="2">' + _escapeHtml(b.notes || '') + '</textarea></div>' +

                    '<div class="wam-field wam-field--inline">' +
                        '<label><input type="checkbox" name="active" ' +
                        (b.active === false ? '' : 'checked') + '> فعال</label>' +
                    '</div>' +

                    (isEdit ? '' :
                        '<div class="wam-field wam-field--inline">' +
                        '<label><input type="checkbox" name="createUser" checked> ' +
                        'ساخت کاربر ورود برای کارگزار</label></div>') +

                    '<div class="wam-field__error" data-error="general"></div>' +
                    '<footer class="wam-modal__footer">' +
                        '<button type="button" class="wam-btn wam-btn--ghost" data-close>انصراف</button>' +
                        '<button type="submit" class="wam-btn wam-btn--primary">' +
                        (isEdit ? 'ذخیره' : 'افزودن') + '</button>' +
                    '</footer>' +
                '</form>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var i = 0; i < cbs.length; i++) cbs[i].addEventListener('click', _closeModal);

        var form = modal.querySelector('#' + FORM_ID);
        if (form) form.addEventListener('submit', _handleFormSubmit);
    }

    function _closeModal() {
        var m = document.getElementById('wamBrokerModal');
        if (m && m.parentNode) m.parentNode.removeChild(m);
        STATE.editingId = null;
    }

    function _handleFormSubmit(e) {
        e.preventDefault();
        var form = e.target;
        var data = {
            name: form.querySelector('[name="name"]').value.trim(),
            mobile: form.querySelector('[name="mobile"]').value.trim(),
            nationalCode: form.querySelector('[name="nationalCode"]').value.trim(),
            email: form.querySelector('[name="email"]').value.trim(),
            commissionRate: form.querySelector('[name="commissionRate"]').value,
            bankAccount: form.querySelector('[name="bankAccount"]').value.trim(),
            iban: form.querySelector('[name="iban"]').value.trim(),
            address: form.querySelector('[name="address"]').value.trim(),
            notes: form.querySelector('[name="notes"]').value.trim(),
            active: form.querySelector('[name="active"]').checked
        };

        var createUserEl = form.querySelector('[name="createUser"]');
        var createUser = createUserEl ? createUserEl.checked : false;

        _clearFormErrors(form);

        var res;
        if (STATE.editingId) {
            res = updateBroker(STATE.editingId, data);
        } else {
            res = addBroker(data, { createUser: createUser });
        }

        if (!res.ok) {
            _showFormErrors(form, res.errors || { general: 'خطا: ' + res.reason });
            return;
        }

        _closeModal();
    }

    function _clearFormErrors(form) {
        var els = form.querySelectorAll('[data-error]');
        for (var i = 0; i < els.length; i++) {
            els[i].textContent = '';
            els[i].style.display = 'none';
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
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        if (typeof WamPermissions !== 'undefined') {
            var me = WamPermissions.getCurrentUser();
            if (!me || !WamPermissions.isAdmin(me)) {
                if (typeof WamUI !== 'undefined') WamUI.toastError('دسترسی ندارید', 'خطا');
                if (typeof WamPayGuard !== 'undefined') WamPayGuard.redirectToRoleHome(me && me.role);
                return;
            }
        }

        var run = function () {
            var root = options.root ||
                       document.querySelector('[data-brokers-root]') ||
                       document.querySelector('.wam-brokers-panel');
            if (!root) {
                if (options.debug) console.warn('[admin-brokers] root پیدا نشد');
                return;
            }
            STATE.root = root;
            STATE.brokers = _loadBrokers();
            _bindFilters();
            render();
            _emit(BrokerEvents.LOADED, { count: STATE.brokers.length, at: Date.now() });
            STATE.installed = true;
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
        _closeModal();
    }

    function reload() {
        STATE.brokers = _loadBrokers();
        render();
    }

    function getStatus() {
        return {
            installed: STATE.installed,
            total: STATE.brokers.length,
            filtered: STATE.filtered.length,
            page: STATE.page,
            query: STATE.query,
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
    var WamAdminBrokers = {
        EVENTS: BrokerEvents,
        STATUS_LABELS: STATUS_LABELS,
        PAGE_SIZE: PAGE_SIZE,
        FORM_ID: FORM_ID,

        install: install,
        uninstall: uninstall,
        reload: reload,
        render: render,

        addBroker: addBroker,
        updateBroker: updateBroker,
        deleteBroker: deleteBroker,
        toggleBroker: toggleBroker,
        openWallet: openWallet,

        openAddForm: openAddForm,
        openEditForm: openEditForm,
        closeForm: _closeModal,

        getBrokers: function () { return STATE.brokers.slice(); },
        getFiltered: function () { return STATE.filtered.slice(); },
        findById: _findById,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamAdminBrokers = WamAdminBrokers;
    window.BrokerEvents = BrokerEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var body = document.body;
            if (!body) return;
            if (body.hasAttribute('data-admin-brokers') ||
                document.querySelector('[data-brokers-root]') ||
                document.querySelector('.wam-brokers-panel')) {
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