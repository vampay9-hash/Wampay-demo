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