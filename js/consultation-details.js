// ==========================================
// وام پی — Shared Modules
// فایل: consultation-details.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: نمایش کامل یک مشاوره — پاسخ‌دهی، تغییر وضعیت، ارجاع
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION = '1.0.0';
    var ROOT_ATTR = 'data-consultation-details-root';
    var CONSULT_KEY = 'wamPayConsultations';
    var USERS_KEY = 'wamPayUsers';

    var STATUS_LABELS = {
        pending:     'در انتظار',
        in_progress: 'در حال بررسی',
        completed:   'تکمیل‌شده',
        closed:      'بسته‌شده',
        cancelled:   'لغو شده'
    };

    var PRIORITY_LABELS = {
        low: 'کم', normal: 'معمولی', high: 'بالا', urgent: 'فوری'
    };

    var MAX_REPLY_LEN = 1000;
    var MIN_REPLY_LEN = 2;

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        mode: 'modal',          // 'modal' | 'inline'
        root: null,
        modalEl: null,
        consultId: null,
        consult: null,
        role: null,
        userId: null,
        submitting: false,
        listeners: [],
        _escHandler: null
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var CDEvents = {
        LOADED:       'cdetail.loaded',
        NOT_FOUND:    'cdetail.not_found',
        ACCESS_DENIED:'cdetail.access_denied',
        REPLY_ADDED:  'cdetail.reply_added',
        NOTE_ADDED:   'cdetail.note_added',
        STATUS_CHANGE:'cdetail.status_change',
        ASSIGNED:     'cdetail.assigned',
        EDITED:       'cdetail.edited',
        DELETED:      'cdetail.deleted',
        RENDERED:     'cdetail.rendered',
        ACTION:       'cdetail.action'
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
    function _priorityLabel(p) { return PRIORITY_LABELS[p] || p || '—'; }

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
        return (prefix || 'r') + '_' + Date.now().toString(36) + '_' + r;
    }

    function _toast(type, msg, title) {
        if (typeof WamUI === 'undefined') return;
        if (type === 'success' && WamUI.toastSuccess) WamUI.toastSuccess(msg, title || 'موفق');
        else if (type === 'error' && WamUI.toastError) WamUI.toastError(msg, title || 'خطا');
        else if (type === 'warning' && WamUI.toastWarning) WamUI.toastWarning(msg, title || 'توجه');
        else if (type === 'info' && WamUI.toastInfo) WamUI.toastInfo(msg, title || 'اطلاع');
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری
    // ─────────────────────────────────────
    function _loadAll() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(CONSULT_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveAll(list) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(CONSULT_KEY, list);
    }

    function _findById(id) {
        var all = _loadAll();
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].id === id) return all[i];
        }
        return null;
    }

    function _findUsers() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(USERS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _findUserName(userId) {
        if (!userId) return '—';
        var users = _findUsers();
        for (var i = 0; i < users.length; i++) {
            if (users[i] && users[i].id === userId) {
                return users[i].name || users[i].username || userId;
            }
        }
        return userId;
    }

    // ─────────────────────────────────────
    // 🔒 دسترسی
    // ─────────────────────────────────────
    function canAccess(c) {
        if (!c || !STATE.userId) return false;

        if (STATE.role === 'admin' || STATE.role === 'super_admin') return true;

        if (STATE.role === 'verifier') {
            if (!c.assignedTo || c.assignedTo === STATE.userId) return true;
            return false;
        }

        if (STATE.role === 'broker') {
            if (c.brokerId && c.brokerId === STATE.userId) return true;
            if (c.createdBy && c.createdBy === STATE.userId) return true;
            if (c.brokerName && _user() && c.brokerName === _user().name) return true;
            return false;
        }

        if (STATE.role === 'applicant') {
            if (c.createdBy === STATE.userId) return true;
            if (c.applicantUserId === STATE.userId) return true;
            if (c.applicantMobile && _user() && _user().mobile) {
                if (String(c.applicantMobile).replace(/\D/g, '') ===
                    String(_user().mobile).replace(/\D/g, '')) return true;
            }
            return false;
        }

        return false;
    }

    function canReply(c) {
        if (!c) return false;
        if (c.status === 'closed' || c.status === 'cancelled') return false;
        return canAccess(c);
    }

    function canChangeStatus(c) {
        if (!c) return false;
        if (STATE.role === 'admin' || STATE.role === 'super_admin') return true;
        if (STATE.role === 'verifier' &&
            (!c.assignedTo || c.assignedTo === STATE.userId)) return true;
        return false;
    }

    function canAssign(c) {
        if (!c) return false;
        return STATE.role === 'admin' || STATE.role === 'super_admin';
    }

    function canEdit(c) {
        if (!c) return false;
        if (STATE.role === 'admin' || STATE.role === 'super_admin') return true;
        if (c.createdBy === STATE.userId && c.status === 'pending') return true;
        return false;
    }

    function canDelete(c) {
        if (!c) return false;
        if (STATE.role === 'admin' || STATE.role === 'super_admin') return true;
        if (c.createdBy === STATE.userId && c.status === 'pending') return true;
        return false;
    }

    // ─────────────────────────────────────
    // ✍️ عملیات — پاسخ
    // ─────────────────────────────────────
    function addReply(text) {
        var result = { ok: false, reason: null, reply: null };

        if (!STATE.consult) return { ok: false, reason: 'no_consult' };
        if (!canReply(STATE.consult)) {
            return { ok: false, reason: 'forbidden' };
        }
        if (!text || String(text).trim().length < MIN_REPLY_LEN) {
            return { ok: false, reason: 'too_short' };
        }
        if (String(text).length > MAX_REPLY_LEN) {
            return { ok: false, reason: 'too_long' };
        }

        var user = _user();
        var reply = {
            id: _genId('reply'),
            text: String(text).trim(),
            by: STATE.userId,
            byName: user ? (user.name || user.username) : 'کاربر',
            byRole: STATE.role,
            at: Date.now()
        };

        var c = STATE.consult;
        if (!Array.isArray(c.replies)) c.replies = [];
        c.replies.push(reply);
        c.updatedAt = Date.now();
        c.updatedBy = STATE.userId;

        if (!_persist(c)) {
            return { ok: false, reason: 'storage_error' };
        }

        result.ok = true;
        result.reply = reply;

        _emit(CDEvents.REPLY_ADDED, {
            consultId: STATE.consultId,
            reply: reply,
            at: Date.now()
        });

        return result;
    }

    // ─────────────────────────────────────
    // ✍️ عملیات — یادداشت داخلی
    // ─────────────────────────────────────
    function addNote(text) {
        var result = { ok: false, reason: null, note: null };

        if (!STATE.consult) return { ok: false, reason: 'no_consult' };
        if (STATE.role !== 'admin' && STATE.role !== 'super_admin' &&
            STATE.role !== 'verifier') {
            return { ok: false, reason: 'forbidden' };
        }
        if (!text || String(text).trim().length < 2) {
            return { ok: false, reason: 'too_short' };
        }

        var user = _user();
        var note = {
            id: _genId('note'),
            text: String(text).trim(),
            by: STATE.userId,
            byName: user ? (user.name || user.username) : 'کاربر',
            at: Date.now()
        };

        var c = STATE.consult;
        if (!Array.isArray(c.notes)) c.notes = [];
        c.notes.push(note);
        c.updatedAt = Date.now();
        c.updatedBy = STATE.userId;

        if (!_persist(c)) {
            return { ok: false, reason: 'storage_error' };
        }

        result.ok = true;
        result.note = note;

        _emit(CDEvents.NOTE_ADDED, {
            consultId: STATE.consultId,
            note: note,
            at: Date.now()
        });

        return result;
    }

    // ─────────────────────────────────────
    // 🎯 عملیات — تغییر وضعیت
    // ─────────────────────────────────────
    function changeStatus(newStatus, options) {
        options = options || {};
        var result = { ok: false, reason: null };

        if (!STATE.consult) return { ok: false, reason: 'no_consult' };
        if (!canChangeStatus(STATE.consult)) {
            return { ok: false, reason: 'forbidden' };
        }
        if (!STATUS_LABELS[newStatus]) {
            return { ok: false, reason: 'invalid_status' };
        }

        var prev = STATE.consult.status;
        STATE.consult.status = newStatus;
        STATE.consult.updatedAt = Date.now();
        STATE.consult.updatedBy = STATE.userId;

        if (options.note) {
            if (!Array.isArray(STATE.consult.notes)) STATE.consult.notes = [];
            STATE.consult.notes.push({
                id: _genId('note'),
                text: 'تغییر وضعیت از «' + _statusLabel(prev) + '» به «' +
                      _statusLabel(newStatus) + '»: ' + options.note,
                by: STATE.userId,
                byName: _user() ? (_user().name || _user().username) : 'کاربر',
                at: Date.now(),
                isStatusNote: true
            });
        }

        if (!_persist(STATE.consult)) {
            return { ok: false, reason: 'storage_error' };
        }

        result.ok = true;
        _emit(CDEvents.STATUS_CHANGE, {
            consultId: STATE.consultId,
            from: prev,
            to: newStatus,
            at: Date.now()
        });
        return result;
    }

    // ─────────────────────────────────────
    // 🎯 عملیات — ارجاع
    // ─────────────────────────────────────
    function assign(assigneeId) {
        var result = { ok: false, reason: null };

        if (!STATE.consult) return { ok: false, reason: 'no_consult' };
        if (!canAssign(STATE.consult)) {
            return { ok: false, reason: 'forbidden' };
        }

        STATE.consult.assignedTo = assigneeId || null;
        STATE.consult.assignedAt = Date.now();
        STATE.consult.assignedBy = STATE.userId;
        STATE.consult.updatedAt = Date.now();

        if (!_persist(STATE.consult)) {
            return { ok: false, reason: 'storage_error' };
        }

        result.ok = true;
        _emit(CDEvents.ASSIGNED, {
            consultId: STATE.consultId,
            assigneeId: assigneeId,
            at: Date.now()
        });
        return result;
    }

    // ─────────────────────────────────────
    // 🎯 ذخیره‌سازی
    // ─────────────────────────────────────
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
    // 🎨 رندر — هدر
    // ─────────────────────────────────────
    function _renderHeader() {
        var c = STATE.consult;
        var st = c.status || 'pending';
        var pr = c.priority || 'normal';

        return '<header class="wam-cnd__header">' +
            '<div class="wam-cnd__head-left">' +
                '<button type="button" class="wam-btn-icon" ' +
                'data-cnd-action="close" title="بستن">×</button>' +
                '<div>' +
                    '<div class="wam-cnd__title">' +
                        '<code>' + _esc(c.code) + '</code> ' +
                        '<span class="wam-badge wam-badge--' + _esc(st) + '">' +
                        _esc(_statusLabel(st)) + '</span> ' +
                        '<span class="wam-cons__priority wam-cons__priority--' +
                        _esc(pr) + '">' + _esc(_priorityLabel(pr)) + '</span>' +
                    '</div>' +
                    '<div class="wam-cnd__subtitle">' +
                        _esc(c.subject || '—') +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="wam-cnd__head-right">' +
                (canEdit(c) ?
                    '<button class="wam-btn-icon" data-cnd-action="edit" ' +
                    'title="ویرایش">✏️</button>' : '') +
                (canDelete(c) ?
                    '<button class="wam-btn-icon wam-btn-icon--danger" ' +
                    'data-cnd-action="delete" title="حذف">🗑️</button>' : '') +
            '</div>' +
        '</header>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — اطلاعات اصلی
    // ─────────────────────────────────────
    function _renderInfo() {
        var c = STATE.consult;
        return '<section class="wam-cnd__card">' +
            '<h3 class="wam-cnd__card-title">📋 اطلاعات مشاوره</h3>' +
            '<div class="wam-cnd__info-grid">' +
                _infoRow('کد', c.code) +
                _infoRow('موضوع', c.subject) +
                _infoRow('اولویت', _priorityLabel(c.priority)) +
                _infoRow('وضعیت', _statusLabel(c.status)) +
                _infoRow('متقاضی', c.applicantName || '—') +
                _infoRow('موبایل', c.applicantMobile || '—') +
                _infoRow('کارگزار', c.brokerName || '—') +
                _infoRow('پرونده مرتبط', c.caseId || '—') +
                _infoRow('ارجاع به', _findUserName(c.assignedTo)) +
                _infoRow('ایجادکننده', c.createdByName || _findUserName(c.createdBy)) +
                _infoRow('تاریخ ایجاد', _jalali(c.createdAt)) +
                _infoRow('آخرین تغییر', _jalali(c.updatedAt)) +
            '</div>' +
        '</section>';
    }

    function _infoRow(label, value) {
        return '<div class="wam-cnd__info-row">' +
            '<span class="wam-cnd__info-label">' + _esc(label) + ':</span>' +
            '<span class="wam-cnd__info-value">' +
            _esc(value === null || value === undefined || value === '' ? '—' : value) +
            '</span></div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — متن اصلی
    // ─────────────────────────────────────
    function _renderDescription() {
        var c = STATE.consult;
        if (!c.description) return '';
        return '<section class="wam-cnd__card">' +
            '<h3 class="wam-cnd__card-title">📝 توضیحات</h3>' +
            '<div class="wam-cnd__description">' +
                _esc(c.description).replace(/\n/g, '<br>') +
            '</div>' +
        '</section>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — پاسخ‌ها
    // ─────────────────────────────────────
    function _renderReplies() {
        var c = STATE.consult;
        var replies = Array.isArray(c.replies) ? c.replies : [];

        var html = '<section class="wam-cnd__card">';
        html += '<h3 class="wam-cnd__card-title">💬 پاسخ‌ها (' +
                _fa(replies.length) + ')</h3>';

        if (replies.length === 0) {
            html += '<div class="wam-empty wam-empty--sm">' +
                    'هنوز پاسخی داده نشده.</div>';
        } else {
            html += '<ul class="wam-cnd__replies">';
            for (var i = 0; i < replies.length; i++) {
                var r = replies[i];
                var isMe = r.by === STATE.userId;
                var isAdmin = r.byRole === 'admin' || r.byRole === 'super_admin';
                var isVerifier = r.byRole === 'verifier';
                var cls = isAdmin ? 'is-admin' :
                          isVerifier ? 'is-verifier' :
                          isMe ? 'is-me' : 'is-other';

                html += '<li class="wam-cnd__reply ' + cls + '">' +
                    '<div class="wam-cnd__reply-head">' +
                        '<span class="wam-cnd__reply-name">' +
                        _esc(r.byName || 'کاربر') + '</span>' +
                        '<span class="wam-cnd__reply-role">' +
                        _esc(_roleLabel(r.byRole)) + '</span>' +
                        '<span class="wam-cnd__reply-time">' +
                        _esc(_relTime(r.at)) + '</span>' +
                    '</div>' +
                    '<div class="wam-cnd__reply-text">' +
                    _esc(r.text).replace(/\n/g, '<br>') + '</div>' +
                '</li>';
            }
            html += '</ul>';
        }

        html += '</section>';
        return html;
    }

    function _roleLabel(r) {
        var m = {
            super_admin: 'مدیر ارشد', admin: 'ادمین',
            verifier: 'اعتبارسنج', broker: 'کارگزار', applicant: 'متقاضی'
        };
        return m[r] || r || '';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — یادداشت‌های داخلی
    // ─────────────────────────────────────
    function _renderNotes() {
        var c = STATE.consult;
        var notes = Array.isArray(c.notes) ? c.notes : [];

        if (notes.length === 0) return '';

        var html = '<section class="wam-cnd__card">';
        html += '<h3 class="wam-cnd__card-title">📌 یادداشت‌های داخلی</h3>';
        html += '<ul class="wam-cnd__notes">';
        for (var i = 0; i < notes.length; i++) {
            var n = notes[i];
            html += '<li class="wam-cnd__note' +
                (n.isStatusNote ? ' is-status' : '') + '">' +
                '<div class="wam-cnd__note-text">' +
                _esc(n.text).replace(/\n/g, '<br>') + '</div>' +
                '<div class="wam-cnd__note-meta">' +
                _esc(n.byName || 'کاربر') + ' · ' +
                _esc(_relTime(n.at)) + '</div></li>';
        }
        html += '</ul></section>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نوار اقدامات
    // ─────────────────────────────────────
    function _renderActionsBar() {
        var c = STATE.consult;
        var html = '<div class="wam-cnd__actions-bar">';

        // تغییر وضعیت
        if (canChangeStatus(c) && c.status !== 'closed' && c.status !== 'cancelled') {
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-cnd-action="status">🔄 تغییر وضعیت</button>';
        }

        // ارجاع
        if (canAssign(c) && c.status !== 'closed' && c.status !== 'cancelled') {
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-cnd-action="assign">👤 ارجاع</button>';
        }

        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — فرم پاسخ
    // ─────────────────────────────────────
    function _renderReplyForm() {
        var c = STATE.consult;
        if (!canReply(c)) {
            var msg = 'این مشاوره بسته یا لغو شده است. امکان پاسخ‌دهی وجود ندارد.';
            if (!canAccess(c)) msg = 'شما دسترسی به این مشاوره ندارید.';
            return '<div class="wam-cnd__closed-note">' +
                   _esc(msg) + '</div>';
        }

        var canNote = STATE.role === 'admin' || STATE.role === 'super_admin' ||
                      STATE.role === 'verifier';

        var html = '<div class="wam-cnd__reply-form">';
        html += '<textarea name="replyText" rows="3" maxlength="' +
                MAX_REPLY_LEN + '" placeholder="پاسخ خود را بنویسید..."></textarea>';
        html += '<div class="wam-cnd__reply-form-foot">';
        html += '<span class="wam-cnd__reply-count" data-cnd="char-count">' +
                '۰/' + _fa(MAX_REPLY_LEN) + '</span>';
        html += '<div class="wam-cnd__reply-form-actions">';
        if (canNote) {
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-cnd-action="send-note" title="ثبت به عنوان یادداشت داخلی">' +
                    '📌 یادداشت</button>';
        }
        html += '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
                'data-cnd-action="send-reply">📤 ارسال پاسخ</button>';
        html += '</div></div></div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        var container = STATE.mode === 'modal'
            ? (STATE.modalEl ? STATE.modalEl.querySelector('[data-cnd="content"]') : null)
            : STATE.root;
        if (!container) return;

        if (!STATE.consult) {
            container.innerHTML = '<div class="wam-empty">' +
                'مشاوره یافت نشد.</div>';
            return;
        }

        var html =
            _renderActionsBar() +
            _renderInfo() +
            _renderDescription() +
            _renderReplies() +
            _renderNotes() +
            _renderReplyForm();

        container.innerHTML = html;
        _bindEvents(container);

        _emit(CDEvents.RENDERED, {
            consultId: STATE.consultId,
            at: Date.now()
        });
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents(root) {
        if (!root) return;

        var actionBtns = root.querySelectorAll('[data-cnd-action]');
        for (var i = 0; i < actionBtns.length; i++) {
            if (actionBtns[i].dataset.bound) continue;
            actionBtns[i].addEventListener('click', _handleAction);
            actionBtns[i].dataset.bound = '1';
        }

        var textarea = root.querySelector('[name="replyText"]');
        if (textarea && !textarea.dataset.bound) {
            textarea.dataset.bound = '1';
            textarea.addEventListener('input', function () {
                var countEl = root.querySelector('[data-cnd="char-count"]');
                if (countEl) {
                    countEl.textContent = _fa(this.value.length) + '/' +
                                          _fa(MAX_REPLY_LEN);
                }
            });
            textarea.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    _handleSendReply();
                }
            });
        }
    }

    function _handleAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-cnd-action');

        if (a === 'close')      { close(); return; }
        if (a === 'edit')       { _emit(CDEvents.ACTION, { action: 'edit' }); _openEdit(); return; }
        if (a === 'delete')     { _confirmDelete(); return; }
        if (a === 'status')     { _openStatusModal(); return; }
        if (a === 'assign')     { _openAssignModal(); return; }
        if (a === 'send-reply') { _handleSendReply(); return; }
        if (a === 'send-note')  { _handleSendNote(); return; }
    }

    function _handleSendReply() {
        if (STATE.submitting) return;
        var textarea = _getTextarea();
        if (!textarea) return;
        var text = textarea.value;

        STATE.submitting = true;
        var res = addReply(text);
        STATE.submitting = false;

        if (!res.ok) {
            var msg = res.reason === 'too_short' ? 'متن کوتاه است' :
                      res.reason === 'too_long' ? 'متن طولانی است' :
                      res.reason === 'forbidden' ? 'دسترسی ندارید' :
                      'خطا در ارسال';
            _toast('error', msg, 'خطا');
            return;
        }

        textarea.value = '';
        _toast('success', 'پاسخ ارسال شد', 'موفق');
        render();
    }

    function _handleSendNote() {
        if (STATE.submitting) return;
        var textarea = _getTextarea();
        if (!textarea) return;
        var text = textarea.value;

        STATE.submitting = true;
        var res = addNote(text);
        STATE.submitting = false;

        if (!res.ok) {
            _toast('error', 'خطا در ثبت یادداشت', 'خطا');
            return;
        }

        textarea.value = '';
        _toast('success', 'یادداشت ثبت شد', 'موفق');
        render();
    }

    function _getTextarea() {
        var container = STATE.mode === 'modal'
            ? (STATE.modalEl ? STATE.modalEl.querySelector('[data-cnd="content"]') : null)
            : STATE.root;
        if (!container) return null;
        return container.querySelector('[name="replyText"]');
    }

    // ─────────────────────────────────────
    // 🎯 modals
    // ─────────────────────────────────────
    function _openStatusModal() {
        var c = STATE.consult;
        if (!canChangeStatus(c)) return;

        var existing = document.getElementById('wamCNDStatusModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var opts = '';
        for (var s in STATUS_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(STATUS_LABELS, s)) continue;
            opts += '<option value="' + s + '"' +
                (c.status === s ? ' selected' : '') + '>' +
                _esc(STATUS_LABELS[s]) + '</option>';
        }

        var modal = document.createElement('div');
        modal.id = 'wamCNDStatusModal';
        modal.className = 'wam-modal';
        modal.style.zIndex = '10001';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>🔄 تغییر وضعیت</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form class="wam-modal__body">' +
                    '<div class="wam-field"><label>وضعیت جدید</label>' +
                        '<select name="status">' + opts + '</select></div>' +
                    '<div class="wam-field"><label>یادداشت (اختیاری)</label>' +
                        '<textarea name="note" rows="3"></textarea></div>' +
                    '<footer class="wam-modal__footer">' +
                        '<button type="button" class="wam-btn wam-btn--ghost" ' +
                        'data-close>انصراف</button>' +
                        '<button type="submit" class="wam-btn wam-btn--primary">' +
                        'ذخیره</button>' +
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
            var st = form.querySelector('[name="status"]').value;
            var note = form.querySelector('[name="note"]').value.trim();
            var r = changeStatus(st, { note: note });
            if (r.ok) {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
                _toast('success', 'وضعیت تغییر کرد', 'موفق');
                render();
            } else {
                _toast('error', 'خطا در تغییر وضعیت', 'خطا');
            }
        });
    }

    function _openAssignModal() {
        var c = STATE.consult;
        if (!canAssign(c)) return;

        var existing = document.getElementById('wamCNDAssignModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var users = _findUsers();
        var opts = '<option value="">— بدون ارجاع —</option>';
        for (var i = 0; i < users.length; i++) {
            var u = users[i];
            if (!u) continue;
            if (u.role !== 'admin' && u.role !== 'super_admin' &&
                u.role !== 'verifier') continue;
            if (u.active === false) continue;

            var label = (u.name || u.username) +
                ' (' + (u.role === 'verifier' ? 'اعتبارسنج' : 'ادمین') + ')';
            opts += '<option value="' + _esc(u.id) + '"' +
                (c.assignedTo === u.id ? ' selected' : '') + '>' +
                _esc(label) + '</option>';
        }

        var modal = document.createElement('div');
        modal.id = 'wamCNDAssignModal';
        modal.className = 'wam-modal';
        modal.style.zIndex = '10001';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>👤 ارجاع مشاوره</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form class="wam-modal__body">' +
                    '<div class="wam-field"><label>ارجاع به</label>' +
                        '<select name="assignee">' + opts + '</select></div>' +
                    '<footer class="wam-modal__footer">' +
                        '<button type="button" class="wam-btn wam-btn--ghost" ' +
                        'data-close>انصراف</button>' +
                        '<button type="submit" class="wam-btn wam-btn--primary">' +
                        'ذخیره</button>' +
                    '</footer>' +
                '</form>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var j = 0; j < cbs.length; j++) {
            cbs[j].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }

        var form = modal.querySelector('form');
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var uid = form.querySelector('[name="assignee"]').value;
            var r = assign(uid || null);
            if (r.ok) {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
                _toast('success', 'ارجاع انجام شد', 'موفق');
                render();
            } else {
                _toast('error', 'خطا در ارجاع', 'خطا');
            }
        });
    }

    function _openEdit() {
        var c = STATE.consult;
        if (!canEdit(c)) {
            _toast('error', 'دسترسی ندارید', 'خطا');
            return;
        }

        // اگر ماژول consultations لود شده، از آن استفاده کن
        if (typeof WamConsultations !== 'undefined' &&
            WamConsultations.openForm) {
            close({ silent: true });
            WamConsultations.openForm(c.id);
            return;
        }

        _toast('info', 'ماژول ویرایش در دسترس نیست', 'توجه');
    }

    function _confirmDelete() {
        var c = STATE.consult;
        if (!canDelete(c)) return;

        var msg = 'مشاوره «' + (c.title || c.code) + '» حذف شود؟';
        var doIt = function () {
            var all = _loadAll();
            var idx = -1;
            for (var i = 0; i < all.length; i++) {
                if (all[i] && all[i].id === c.id) { idx = i; break; }
            }
            if (idx === -1) return;
            var removed = all.splice(idx, 1)[0];
            if (!_saveAll(all)) {
                _toast('error', 'خطا در حذف', 'خطا');
                return;
            }
            _emit(CDEvents.DELETED, { consultId: c.id, at: Date.now() });
            _toast('success', 'مشاوره حذف شد', 'موفق');
            close({ silent: true, deleted: true });
        };

        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('حذف مشاوره', msg, { danger: true })
                .then(function (ok) { if (ok) doIt(); });
        } else if (window.confirm(msg)) {
            doIt();
        }
    }

    // ─────────────────────────────────────
    // 🚪 باز کردن / بستن
    // ─────────────────────────────────────
    function open(consultId, options) {
        options = options || {};
        if (!consultId) return false;

        var user = _user();
        if (!user) {
            _toast('error', 'ابتدا وارد شوید', 'خطا');
            return false;
        }
        STATE.userId = user.id;
        STATE.role = user.role;

        var c = _findById(consultId);
        if (!c) {
            _emit(CDEvents.NOT_FOUND, { consultId: consultId });
            _toast('error', 'مشاوره یافت نشد', 'خطا');
            return false;
        }

        if (!canAccess(c)) {
            _emit(CDEvents.ACCESS_DENIED, { consultId: consultId });
            _toast('error', 'دسترسی مجاز نیست', 'خطا');
            return false;
        }

        STATE.consultId = consultId;
        STATE.consult = c;
        STATE.mode = options.mode || 'modal';

        if (STATE.mode === 'modal') {
            _createModal(options);
        } else {
            STATE.root = options.root ||
                        document.querySelector('[' + ROOT_ATTR + ']');
            if (!STATE.root) return false;
        }

        render();

        _emit(CDEvents.LOADED, {
            consultId: consultId,
            role: STATE.role,
            at: Date.now()
        });
        return true;
    }

    function _createModal(options) {
        if (STATE.modalEl && STATE.modalEl.parentNode) {
            STATE.modalEl.parentNode.removeChild(STATE.modalEl);
        }

        var modal = document.createElement('div');
        modal.id = 'wamConsultDetailModal';
        modal.className = 'wam-modal';
        modal.style.zIndex = '9999';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel wam-modal__panel--wide">' +
                _renderHeader() +
                '<div class="wam-modal__body" data-cnd="content"></div>' +
            '</div>';

        document.body.appendChild(modal);
        STATE.modalEl = modal;

        var cbs = modal.querySelectorAll('[data-close]');
        for (var i = 0; i < cbs.length; i++) {
            cbs[i].addEventListener('click', function () { close(); });
        }

        // بایند close button داخلی هدر (دکمه ×)
        var headerClose = modal.querySelector('[data-cnd-action="close"]');
        if (headerClose) {
            headerClose.addEventListener('click', function () { close(); });
        }

        STATE._escHandler = function (e) {
            if (e.key === 'Escape') close();
        };
        document.addEventListener('keydown', STATE._escHandler);
    }

    function close(options) {
        options = options || {};

        if (STATE._escHandler) {
            document.removeEventListener('keydown', STATE._escHandler);
            STATE._escHandler = null;
        }

        if (STATE.modalEl && STATE.modalEl.parentNode) {
            STATE.modalEl.parentNode.removeChild(STATE.modalEl);
        }
        STATE.modalEl = null;

        // اعلام به بیرون
        if (typeof EventBus !== 'undefined' && options.deleted) {
            EventBus.emit('shared.consult.deleted', {
                consultId: STATE.consultId, at: Date.now()
            });
        }

        STATE.consult = null;
        STATE.consultId = null;

        if (!options.silent && typeof WamUI !== 'undefined') {
            // هیچ توستی نشان نده
        }
    }

    function reload() {
        if (!STATE.consultId) return false;
        var c = _findById(STATE.consultId);
        if (!c) { close({ silent: true }); return false; }
        STATE.consult = c;
        render();
        return true;
    }

    // ─────────────────────────────────────
    // 🌐 URL
    // ─────────────────────────────────────
    function _getConsultIdFromUrl() {
        try {
            var params = new URLSearchParams(window.location.search);
            return params.get('id') || params.get('consultId');
        } catch (e) {
            return null;
        }
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        STATE.installed = true;

        // حالت inline
        if (options.mode === 'inline') {
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
                STATE.mode = 'inline';
                STATE.root = options.root ||
                             document.querySelector('[' + ROOT_ATTR + ']') ||
                             document.querySelector('.wam-consultation-details');
                if (!STATE.root) return;
                var cid = options.consultId || _getConsultIdFromUrl();
                if (!cid) {
                    STATE.root.innerHTML = '<div class="wam-empty">' +
                        'شناسه مشاوره داده نشده است.</div>';
                    return;
                }
                open(cid, { mode: 'inline', root: STATE.root });
            };
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', run);
            } else {
                run();
            }
        }

        if (options.debug) {
            console.log('[consultation-details] v' + VERSION + ' آماده');
        }
    }

    function uninstall() {
        close({ silent: true });
        STATE.installed = false;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            version: VERSION,
            installed: STATE.installed,
            isOpen: !!STATE.modalEl || (!!STATE.root && !!STATE.consult),
            mode: STATE.mode,
            consultId: STATE.consultId,
            role: STATE.role,
            hasConsult: !!STATE.consult,
            replyCount: STATE.consult && STATE.consult.replies
                ? STATE.consult.replies.length : 0,
            noteCount: STATE.consult && STATE.consult.notes
                ? STATE.consult.notes.length : 0
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
    var WamConsultationDetails = {
        VERSION: VERSION,
        EVENTS: CDEvents,
        ROOT_ATTR: ROOT_ATTR,
        CONSULT_KEY: CONSULT_KEY,
        STATUS_LABELS: STATUS_LABELS,
        PRIORITY_LABELS: PRIORITY_LABELS,
        MAX_REPLY_LEN: MAX_REPLY_LEN,

        install: install,
        uninstall: uninstall,
        open: open,
        close: close,
        reload: reload,
        render: render,

        addReply: addReply,
        addNote: addNote,
        changeStatus: changeStatus,
        assign: assign,

        canAccess: canAccess,
        canReply: canReply,
        canChangeStatus: canChangeStatus,
        canAssign: canAssign,
        canEdit: canEdit,
        canDelete: canDelete,

        getConsult: function () { return STATE.consult; },
        getConsultId: function () { return STATE.consultId; },

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamConsultationDetails = WamConsultationDetails;
    window.ConsultationDetailsEvents = CDEvents;

    // نصب خودکار در حالت inline
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var body = document.body;
            if (!body) return;
            if (body.hasAttribute('data-consultation-details-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-consultation-details')) {
                install({ mode: 'inline' });
            }
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _auto);
        } else {
            _auto();
        }
    }

})();