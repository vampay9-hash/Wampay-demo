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