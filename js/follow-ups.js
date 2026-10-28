// ==========================================
// وام پی — Shared Modules
// فایل: follow-ups.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: پیگیری‌ها — تماس، یادآوری، یادداشت، وضعیت
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION = '1.0.0';
    var ROOT_ATTR = 'data-followups-root';
    var FOLLOWUPS_KEY = 'wamPayFollowUps';
    var PAGE_SIZE = 20;

    var STATUS_LABELS = {
        pending:    'در انتظار',
        contacted:  'تماس گرفته شد',
        no_answer:  'پاسخ نداد',
        agreed:     'توافق شد',
        rejected:   'رد شد',
        completed:  'تکمیل‌شده',
        cancelled:  'لغو شده'
    };

    var CHANNELS = {
        phone:    'تماس تلفنی',
        sms:      'پیامک',
        email:    'ایمیل',
        chat:     'گفتگو',
        in_person:'حضوری'
    };

    var CHANNEL_ICONS = {
        phone:    '📞',
        sms:      '💬',
        email:    '✉️',
        chat:     '💭',
        in_person:'🤝'
    };

    var PRIORITIES = {
        low:    'کم',
        normal: 'معمولی',
        high:   'بالا',
        urgent: 'فوری'
    };

    var PRIORITY_ORDER = { urgent: 4, high: 3, normal: 2, low: 1 };

    var SORT_OPTIONS = {
        newest:   'جدیدترین',
        oldest:   'قدیمی‌ترین',
        dueDate:  'نزدیک‌ترین سررسید',
        priority: 'اولویت'
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
        followUps: [],
        filtered: [],
        page: 1,
        viewMode: VIEW_MODES.TABLE,
        sort: 'dueDate',
        scope: 'auto',        // auto | all | mine | pending | overdue
        filters: {
            query: '',
            status: '',
            priority: '',
            channel: '',
            dueFilter: ''      // '' | 'today' | 'week' | 'overdue'
        },
        selectedIds: {},
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var FollowUpEvents = {
        LOADED:       'followup.loaded',
        RENDERED:     'followup.rendered',
        CREATED:      'followup.created',
        UPDATED:      'followup.updated',
        DELETED:      'followup.deleted',
        STATUS:       'followup.status_changed',
        ASSIGNED:     'followup.assigned',
        REMINDER_DUE: 'followup.reminder_due',
        SELECTION:    'followup.selection',
        FILTERED:     'followup.filtered',
        EXPORTED:     'followup.exported',
        ROW_CLICK:    'followup.row_click'
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
    function _channelLabel(c) { return CHANNELS[c] || c || '—'; }
    function _priorityLabel(p) { return PRIORITIES[p] || p || '—'; }

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
        return (prefix || 'fu') + '_' + Date.now().toString(36) + '_' + r;
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

    function _dayEnd(ts) {
        var d = new Date(ts || Date.now());
        d.setHours(23, 59, 59, 999);
        return d.getTime();
    }

    function _isOverdue(f) {
        if (!f || !f.dueDate) return false;
        if (f.status === 'completed' || f.status === 'cancelled') return false;
        return f.dueDate < _dayStart();
    }

    function _isDueToday(f) {
        if (!f || !f.dueDate) return false;
        if (f.status === 'completed' || f.status === 'cancelled') return false;
        var today = _dayStart();
        return f.dueDate >= today && f.dueDate <= _dayEnd();
    }

    function _isDueThisWeek(f) {
        if (!f || !f.dueDate) return false;
        if (f.status === 'completed' || f.status === 'cancelled') return false;
        var now = Date.now();
        return f.dueDate >= now && f.dueDate <= now + 7 * 24 * 60 * 60 * 1000;
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری / ذخیره
    // ─────────────────────────────────────
    function _loadAll() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(FOLLOWUPS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveAll(list) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(FOLLOWUPS_KEY, list);
    }

    function _findById(id) {
        for (var i = 0; i < STATE.followUps.length; i++) {
            if (STATE.followUps[i] && STATE.followUps[i].id === id) {
                return STATE.followUps[i];
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

    function _findUsers() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON('wamPayUsers', []);
        return Array.isArray(arr) ? arr : [];
    }

    function _findUserName(id) {
        if (!id) return '—';
        var users = _findUsers();
        for (var i = 0; i < users.length; i++) {
            if (users[i] && users[i].id === id) {
                return users[i].name || users[i].username || id;
            }
        }
        return id;
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر نقش‌محور
    // ─────────────────────────────────────
    function _filterByRole(list) {
        var role = STATE.role;
        var userId = STATE.userId;

        if (role === 'admin' || role === 'super_admin') return list;

        if (role === 'verifier') {
            return list.filter(function (f) {
                if (!f) return false;
                if (!f.assignedTo) return true;
                if (f.assignedTo === userId) return true;
                if (f.createdBy === userId) return true;
                return false;
            });
        }

        if (role === 'broker' || role === 'applicant') {
            return list.filter(function (f) {
                if (!f) return false;
                if (f.assignedTo === userId) return true;
                if (f.createdBy === userId) return true;
                if (f.brokerId === userId) return true;
                if (f.applicantUserId === userId) return true;
                return false;
            });
        }
        return list;
    }

    function _applyScope(list) {
        var scope = STATE.scope;
        if (scope === 'all') return list;
        if (scope === 'mine') {
            return list.filter(function (f) {
                return f && (f.assignedTo === STATE.userId ||
                             f.createdBy === STATE.userId);
            });
        }
        if (scope === 'pending') {
            return list.filter(function (f) {
                return f && (f.status === 'pending' || f.status === 'contacted' ||
                             f.status === 'no_answer');
            });
        }
        if (scope === 'overdue') {
            return list.filter(function (f) { return _isOverdue(f); });
        }
        return list;
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر پیشرفته
    // ─────────────────────────────────────
    function _applyFilters() {
        var f = STATE.filters;
        var q = (f.query || '').toLowerCase().trim();

        STATE.filtered = STATE.followUps.filter(function (fu) {
            if (!fu) return false;

            if (q) {
                var hay = [fu.title, fu.description, fu.applicantName,
                           fu.applicantMobile, fu.caseId,
                           _findUserName(fu.assignedTo)]
                    .filter(Boolean).join(' ').toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            if (f.status && fu.status !== f.status) return false;
            if (f.priority && fu.priority !== f.priority) return false;
            if (f.channel && fu.channel !== f.channel) return false;
            if (f.dueFilter === 'today' && !_isDueToday(fu)) return false;
            if (f.dueFilter === 'week' && !_isDueThisWeek(fu)) return false;
            if (f.dueFilter === 'overdue' && !_isOverdue(fu)) return false;

            return true;
        });

        _applySort();
        _emit(FollowUpEvents.FILTERED, {
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
            if (s === 'dueDate') {
                var da = a.dueDate || Infinity;
                var db = b.dueDate || Infinity;
                return da - db;
            }
            if (s === 'priority') {
                var pa = PRIORITY_ORDER[a.priority] || 0;
                var pb = PRIORITY_ORDER[b.priority] || 0;
                return pb - pa;
            }
            return 0;
        });
    }

    // ─────────────────────────────────────
    // 📊 آمار
    // ─────────────────────────────────────
    function computeStats() {
        var s = {
            total: STATE.followUps.length,
            filtered: STATE.filtered.length,
            pending: 0, contacted: 0, no_answer: 0,
            agreed: 0, rejected: 0, completed: 0, cancelled: 0,
            overdue: 0, dueToday: 0, urgent: 0
        };
        for (var i = 0; i < STATE.followUps.length; i++) {
            var f = STATE.followUps[i];
            if (!f) continue;
            var st = f.status || 'pending';
            if (s[st] !== undefined) s[st]++;
            if (_isOverdue(f)) s.overdue++;
            if (_isDueToday(f)) s.dueToday++;
            if (f.priority === 'urgent') s.urgent++;
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
        _emit(FollowUpEvents.SELECTION, { count: _getSelectedIds().length });
        return _getSelectedIds().length;
    }

    function clearSelection() {
        STATE.selectedIds = {};
        _emit(FollowUpEvents.SELECTION, { count: 0 });
        return true;
    }

    // ─────────────────────────────────────
    // 🎯 CRUD
    // ─────────────────────────────────────
    function create(data, options) {
        options = options || {};
        var result = { ok: false, reason: null, followUp: null, errors: null };

        var errors = _validate(data);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        var user = _user();
        var now = Date.now();

        var fu = {
            id: _genId('fu'),
            title: String(data.title).trim(),
            description: data.description ? String(data.description).trim() : null,
            channel: data.channel || 'phone',
            priority: data.priority || 'normal',
            status: 'pending',
            dueDate: data.dueDate ? Number(data.dueDate) : null,

            applicantName: data.applicantName || null,
            applicantMobile: data.applicantMobile
                ? _en(data.applicantMobile).replace(/\D/g, '') : null,
            applicantUserId: data.applicantUserId || null,
            caseId: data.caseId || null,
            loanId: data.loanId || null,
            brokerId: data.brokerId || null,
            brokerName: data.brokerName || null,

            assignedTo: data.assignedTo || null,
            assignedToName: data.assignedTo ? _findUserName(data.assignedTo) : null,

            history: [],           // تاریخچه اقدامات
            notes: [],

            createdBy: user ? user.id : null,
            createdByName: user ? (user.name || user.username) : null,
            createdAt: now,
            updatedAt: now
        };

        var all = _loadAll();
        all.push(fu);
        if (!_saveAll(all)) {
            result.reason = 'storage_error';
            return result;
        }

        STATE.followUps.push(fu);
        _emit(FollowUpEvents.CREATED, { followUp: fu, at: now });

        result.ok = true;
        result.followUp = fu;
        return result;
    }

    function update(id, patch, options) {
        options = options || {};
        var result = { ok: false, reason: null, followUp: null, errors: null };

        var fu = _findById(id);
        if (!fu) { result.reason = 'not_found'; return result; }
        if (!canEdit(fu)) { result.reason = 'forbidden'; return result; }

        if (patch.title !== undefined &&
            String(patch.title).trim().length < 3) {
            result.reason = 'validation';
            result.errors = { title: 'عنوان حداقل ۳ کاراکتر' };
            return result;
        }

        var allowed = ['title', 'description', 'channel', 'priority',
                       'dueDate', 'applicantName', 'applicantMobile',
                       'caseId', 'loanId', 'brokerName'];
        for (var i = 0; i < allowed.length; i++) {
            var k = allowed[i];
            if (patch[k] !== undefined) fu[k] = patch[k];
        }
        if (patch.applicantMobile) {
            fu.applicantMobile = _en(patch.applicantMobile).replace(/\D/g, '');
        }
        fu.updatedAt = Date.now();
        fu.updatedBy = _uid();

        if (!_persist(fu)) {
            result.reason = 'storage_error';
            return result;
        }

        result.ok = true;
        result.followUp = fu;
        _emit(FollowUpEvents.UPDATED, { followUp: fu, at: Date.now() });
        return result;
    }

    function remove(id) {
        var fu = _findById(id);
        if (!fu) return { ok: false, reason: 'not_found' };
        if (!canDelete(fu)) return { ok: false, reason: 'forbidden' };

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

        for (var j = STATE.followUps.length - 1; j >= 0; j--) {
            if (STATE.followUps[j].id === id) {
                STATE.followUps.splice(j, 1);
                break;
            }
        }
        delete STATE.selectedIds[id];

        _emit(FollowUpEvents.DELETED, { followUp: removed, at: Date.now() });
        return { ok: true, followUp: removed };
    }

    // ─────────────────────────────────────
    // 🔄 تغییر وضعیت
    // ─────────────────────────────────────
    function changeStatus(id, newStatus, options) {
        options = options || {};
        var fu = _findById(id);
        if (!fu) return { ok: false, reason: 'not_found' };
        if (!canManageStatus(fu)) return { ok: false, reason: 'forbidden' };
        if (!STATUS_LABELS[newStatus]) return { ok: false, reason: 'invalid_status' };

        var prev = fu.status;
        fu.status = newStatus;
        fu.updatedAt = Date.now();
        fu.updatedBy = _uid();

        // لاگ در history
        if (!Array.isArray(fu.history)) fu.history = [];
        fu.history.push({
            action: 'status_change',
            from: prev,
            to: newStatus,
            note: options.note || null,
            by: _uid(),
            byName: _user() ? (_user().name || _user().username) : null,
            at: Date.now()
        });

        // اگر completed شد، completedAt
        if (newStatus === 'completed') {
            fu.completedAt = Date.now();
            fu.completedBy = _uid();
        } else {
            fu.completedAt = null;
            fu.completedBy = null;
        }

        if (!_persist(fu)) return { ok: false, reason: 'storage_error' };

        _emit(FollowUpEvents.STATUS, {
            followUpId: id, from: prev, to: newStatus, at: Date.now()
        });
        return { ok: true, followUp: fu };
    }

    // ─────────────────────────────────────
    // 🎯 ارجاع
    // ─────────────────────────────────────
    function assignTo(id, assigneeId) {
        var fu = _findById(id);
        if (!fu) return { ok: false, reason: 'not_found' };
        if (!canAssign(fu)) return { ok: false, reason: 'forbidden' };

        fu.assignedTo = assigneeId || null;
        fu.assignedToName = assigneeId ? _findUserName(assigneeId) : null;
        fu.assignedAt = Date.now();
        fu.assignedBy = _uid();
        fu.updatedAt = Date.now();

        if (!Array.isArray(fu.history)) fu.history = [];
        fu.history.push({
            action: 'assigned',
            to: assigneeId,
            by: _uid(),
            at: Date.now()
        });

        if (!_persist(fu)) return { ok: false, reason: 'storage_error' };

        _emit(FollowUpEvents.ASSIGNED, {
            followUpId: id, assigneeId: assigneeId, at: Date.now()
        });
        return { ok: true, followUp: fu };
    }

    // ─────────────────────────────────────
    // 📝 افزودن یادداشت به تاریخچه
    // ─────────────────────────────────────
    function addNote(id, text) {
        var fu = _findById(id);
        if (!fu) return { ok: false, reason: 'not_found' };
        if (!canEdit(fu)) return { ok: false, reason: 'forbidden' };
        if (!text || String(text).trim().length < 2) {
            return { ok: false, reason: 'too_short' };
        }

        if (!Array.isArray(fu.notes)) fu.notes = [];
        var note = {
            id: _genId('note'),
            text: String(text).trim(),
            by: _uid(),
            byName: _user() ? (_user().name || _user().username) : null,
            at: Date.now()
        };
        fu.notes.push(note);
        fu.updatedAt = Date.now();

        if (!_persist(fu)) return { ok: false, reason: 'storage_error' };
        return { ok: true, note: note, followUp: fu };
    }

    // ─────────────────────────────────────
    // ⏰ بررسی یادآوری‌ها
    // ─────────────────────────────────────
    function checkReminders() {
        var due = [];
        for (var i = 0; i < STATE.followUps.length; i++) {
            var f = STATE.followUps[i];
            if (!f) continue;
            if (_isOverdue(f) || _isDueToday(f)) {
                due.push(f);
            }
        }
        if (due.length > 0) {
            _emit(FollowUpEvents.REMINDER_DUE, { count: due.length, items: due });
            if (typeof WamUI !== 'undefined') {
                WamUI.toastWarning(
                    _fa(due.length) + ' پیگیری نیاز به اقدام دارد',
                    'یادآوری'
                );
            }
        }
        return due;
    }

    // ─────────────────────────────────────
    // 🔒 دسترسی
    // ─────────────────────────────────────
    function canCreate() {
        return !!STATE.role;
    }

    function canEdit(fu) {
        if (!fu) return false;
        if (STATE.role === 'admin' || STATE.role === 'super_admin') return true;
        if (fu.createdBy === STATE.userId) return true;
        if (fu.assignedTo === STATE.userId) return true;
        return false;
    }

    function canDelete(fu) {
        if (!fu) return false;
        if (STATE.role === 'admin' || STATE.role === 'super_admin') return true;
        if (fu.createdBy === STATE.userId && fu.status === 'pending') return true;
        return false;
    }

    function canManageStatus(fu) {
        if (!fu) return false;
        if (STATE.role === 'admin' || STATE.role === 'super_admin') return true;
        if (fu.assignedTo === STATE.userId || fu.createdBy === STATE.userId) return true;
        return false;
    }

    function canAssign(fu) {
        if (!fu) return false;
        return STATE.role === 'admin' || STATE.role === 'super_admin';
    }

    // ─────────────────────────────────────
    // 🧾 اعتبارسنجی
    // ─────────────────────────────────────
    function _validate(data) {
        var e = {};
        if (!data.title || String(data.title).trim().length < 3) {
            e.title = 'عنوان حداقل ۳ کاراکتر';
        } else if (String(data.title).trim().length > 200) {
            e.title = 'عنوان حداکثر ۲۰۰ کاراکتر';
        }
        if (data.description && String(data.description).length > 2000) {
            e.description = 'توضیحات حداکثر ۲۰۰۰ کاراکتر';
        }
        return e;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت آمار
    // ─────────────────────────────────────
    function _renderStats() {
        var s = computeStats();
        return '<div class="wam-fu__stats">' +
            '<div class="wam-fu__stat"><span>کل:</span> <strong>' +
                _fa(s.total) + '</strong></div>' +
            '<div class="wam-fu__stat wam-fu__stat--warning">' +
                '<span>در انتظار:</span> <strong>' + _fa(s.pending) + '</strong></div>' +
            '<div class="wam-fu__stat wam-fu__stat--info">' +
                '<span>تماس گرفته:</span> <strong>' + _fa(s.contacted) + '</strong></div>' +
            '<div class="wam-fu__stat wam-fu__stat--success">' +
                '<span>توافق:</span> <strong>' + _fa(s.agreed) + '</strong></div>' +
            '<div class="wam-fu__stat wam-fu__stat--danger">' +
                '<span>عقب‌افتاده:</span> <strong>' + _fa(s.overdue) + '</strong></div>' +
            '<div class="wam-fu__stat wam-fu__stat--danger">' +
                '<span>فوری:</span> <strong>' + _fa(s.urgent) + '</strong></div>' +
        '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نوار ابزار
    // ─────────────────────────────────────
    function _renderToolbar() {
        var selected = _getSelectedIds().length;

        var html = '<div class="wam-fu__toolbar">';
        html += '<div class="wam-fu__filters">';
        html += '<input type="search" data-fu="search" ' +
                'placeholder="🔍 جستجو..." value="' +
                _esc(STATE.filters.query) + '">';

        html += '<select data-fu="filter-status">' +
                '<option value="">همه وضعیت‌ها</option>';
        for (var st in STATUS_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(STATUS_LABELS, st)) continue;
            html += '<option value="' + st + '"' +
                (STATE.filters.status === st ? ' selected' : '') + '>' +
                _esc(STATUS_LABELS[st]) + '</option>';
        }
        html += '</select>';

        html += '<select data-fu="filter-priority">' +
                '<option value="">همه اولویت‌ها</option>';
        for (var pr in PRIORITIES) {
            if (!Object.prototype.hasOwnProperty.call(PRIORITIES, pr)) continue;
            html += '<option value="' + pr + '"' +
                (STATE.filters.priority === pr ? ' selected' : '') + '>' +
                _esc(PRIORITIES[pr]) + '</option>';
        }
        html += '</select>';

        html += '<select data-fu="filter-due">' +
                '<option value="">همه</option>' +
                '<option value="today"' +
                (STATE.filters.dueFilter === 'today' ? ' selected' : '') + '>امروز</option>' +
                '<option value="week"' +
                (STATE.filters.dueFilter === 'week' ? ' selected' : '') + '>این هفته</option>' +
                '<option value="overdue"' +
                (STATE.filters.dueFilter === 'overdue' ? ' selected' : '') + '>عقب‌افتاده</option>' +
                '</select>';

        html += '<select data-fu="sort">';
        for (var sk in SORT_OPTIONS) {
            if (!Object.prototype.hasOwnProperty.call(SORT_OPTIONS, sk)) continue;
            html += '<option value="' + sk + '"' +
                (STATE.sort === sk ? ' selected' : '') + '>' +
                _esc(SORT_OPTIONS[sk]) + '</option>';
        }
        html += '</select>';

        html += '<button class="wam-btn-icon" data-fu-action="toggle-view" ' +
                'title="حالت نمایش">' +
                (STATE.viewMode === 'table' ? '🃏' : '📋') + '</button>';

        html += '<button class="wam-btn-icon" data-fu-action="refresh" ' +
                'title="بروزرسانی">🔄</button>';

        if (selected > 0) {
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-fu-action="clear-selection">لغو</button>';
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-fu-action="export-selected">📤 (' +
                    _fa(selected) + ')</button>';
        } else {
            if (canCreate()) {
                html += '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
                        'data-fu-action="new">➕ پیگیری جدید</button>';
            }
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-fu-action="export">📤 CSV</button>';
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
                (STATE.followUps.length === 0
                    ? 'هیچ پیگیری‌ای ثبت نشده است.'
                    : 'نتیجه‌ای برای فیلتر فعلی یافت نشد.') +
                '</div>';
        }

        var html = '<div class="wam-fu__table-wrap">' +
            '<table class="wam-fu__table"><thead><tr>';

        html += '<th class="wam-fu__check">' +
                '<input type="checkbox" data-fu="select-all"' +
                (_getSelectedIds().length > 0 ? ' checked' : '') + '></th>';
        html += '<th>عنوان</th>';
        html += '<th>متقاضی</th>';
        html += '<th>کانال</th>';
        html += '<th>اولویت</th>';
        html += '<th>وضعیت</th>';
        html += '<th>مسئول</th>';
        html += '<th>سررسید</th>';
        html += '<th>عملیات</th>';

        html += '</tr></thead><tbody>';

        for (var i = 0; i < items.length; i++) {
            html += _renderRow(items[i]);
        }

        html += '</tbody></table></div>';
        return html;
    }

    function _renderRow(f) {
        var st = f.status || 'pending';
        var pr = f.priority || 'normal';
        var selected = !!STATE.selectedIds[f.id];
        var overdue = _isOverdue(f);
        var dueToday = _isDueToday(f);

        var rowClass = (selected ? ' is-selected' : '') +
                       (overdue ? ' is-overdue' : '') +
                       (dueToday && !overdue ? ' is-due-today' : '');

        var html = '<tr data-fu-id="' + _esc(f.id) + '" class="' +
                   rowClass.trim() + '">';

        html += '<td><input type="checkbox" data-fu="select-row"' +
                (selected ? ' checked' : '') + '></td>';

        html += '<td class="wam-fu__title">' +
                (overdue ? '⏰ ' : '') +
                _esc(_truncate(f.title, 50)) + '</td>';

        html += '<td>' + _esc(f.applicantName || '—') + '</td>';
        html += '<td>' + (CHANNEL_ICONS[f.channel] || '') + ' ' +
                _esc(_channelLabel(f.channel)) + '</td>';
        html += '<td><span class="wam-fu__priority wam-fu__priority--' +
                _esc(pr) + '">' + _esc(_priorityLabel(pr)) + '</span></td>';
        html += '<td><span class="wam-badge wam-badge--' + _esc(st) + '">' +
                _esc(_statusLabel(st)) + '</span></td>';
        html += '<td>' + _esc(f.assignedToName ||
                _findUserName(f.assignedTo)) + '</td>';
        html += '<td class="wam-fu__due' + (overdue ? ' is-overdue' : '') + '">' +
                _esc(f.dueDate ? _jalali(f.dueDate) : '—') +
                (overdue ? ' ⏰' : '') + '</td>';

        html += '<td class="wam-fu__actions">';
        html += '<button class="wam-btn-icon" data-fu-row-action="view" ' +
                'title="مشاهده">👁️</button>';
        if (canManageStatus(f) &&
            st !== 'completed' && st !== 'cancelled') {
            html += '<button class="wam-btn-icon" ' +
                    'data-fu-row-action="status" ' +
                    'title="تغییر وضعیت">🔄</button>';
        }
        if (canEdit(f)) {
            html += '<button class="wam-btn-icon" ' +
                    'data-fu-row-action="edit" title="ویرایش">✏️</button>';
        }
        if (canDelete(f)) {
            html += '<button class="wam-btn-icon wam-btn-icon--danger" ' +
                    'data-fu-row-action="delete" title="حذف">🗑️</button>';
        }
        html += '</td>';

        html += '</tr>';
        return html;
    }

    function _truncate(s, n) {
        s = String(s || '');
        return s.length > n ? s.slice(0, n - 1) + '…' : s;
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

        var html = '<div class="wam-fu__cards">';
        for (var i = 0; i < items.length; i++) {
            html += _renderCard(items[i]);
        }
        html += '</div>';
        return html;
    }

    function _renderCard(f) {
        var st = f.status || 'pending';
        var pr = f.priority || 'normal';
        var selected = !!STATE.selectedIds[f.id];
        var overdue = _isOverdue(f);
        var dueToday = _isDueToday(f);

        return '<div class="wam-fu__card' +
            (selected ? ' is-selected' : '') +
            (overdue ? ' is-overdue' : '') +
            (dueToday && !overdue ? ' is-due-today' : '') +
            '" data-fu-id="' + _esc(f.id) + '">' +
            '<div class="wam-fu__card-head">' +
                '<input type="checkbox" data-fu="select-row"' +
                (selected ? ' checked' : '') + '>' +
                '<span class="wam-badge wam-badge--' + _esc(st) + '">' +
                _esc(_statusLabel(st)) + '</span>' +
                '<span class="wam-fu__priority wam-fu__priority--' +
                _esc(pr) + '">' + _esc(_priorityLabel(pr)) + '</span>' +
            '</div>' +
            '<div class="wam-fu__card-title">' +
                (overdue ? '⏰ ' : '') + _esc(f.title) + '</div>' +
            '<div class="wam-fu__card-rows">' +
                '<div><span>کانال:</span> ' +
                (CHANNEL_ICONS[f.channel] || '') + ' ' +
                _esc(_channelLabel(f.channel)) + '</div>' +
                '<div><span>متقاضی:</span> ' +
                _esc(f.applicantName || '—') + '</div>' +
                '<div><span>مسئول:</span> ' +
                _esc(f.assignedToName || _findUserName(f.assignedTo)) + '</div>' +
                '<div><span>سررسید:</span> ' +
                _esc(f.dueDate ? _jalali(f.dueDate) : '—') + '</div>' +
            '</div>' +
            '<div class="wam-fu__card-foot">' +
                '<span>' + _esc(_relTime(f.createdAt)) + '</span>' +
                '<div class="wam-fu__card-actions">' +
                    (canManageStatus(f) && st !== 'completed' ?
                        '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
                        'data-fu-row-action="status">🔄</button>' : '') +
                    '<button class="wam-btn wam-btn--sm" ' +
                    'data-fu-row-action="view">مشاهده</button>' +
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
        var html = '<div class="wam-fu__pagination">';
        html += '<button data-fu-page="' + (p - 1) + '"' +
                (p === 1 ? ' disabled' : '') + '>‹</button>';
        var start = Math.max(1, p - 2);
        var end = Math.min(pages, p + 2);
        if (start > 1) {
            html += '<button data-fu-page="1">' + _fa(1) + '</button>';
            if (start > 2) html += '<span>…</span>';
        }
        for (var i = start; i <= end; i++) {
            html += '<button data-fu-page="' + i + '"' +
                    (i === p ? ' class="is-active"' : '') + '>' +
                    _fa(i) + '</button>';
        }
        if (end < pages) {
            if (end < pages - 1) html += '<span>…</span>';
            html += '<button data-fu-page="' + pages + '">' +
                    _fa(pages) + '</button>';
        }
        html += '<button data-fu-page="' + (p + 1) + '"' +
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
            '<div class="wam-fu">' +
                _renderStats() +
                _renderToolbar() +
                '<div class="wam-fu__body">' + body + '</div>' +
                _renderPagination(STATE.filtered.length) +
            '</div>';

        STATE.root.innerHTML = html;
        _bindEvents();

        _emit(FollowUpEvents.RENDERED, {
            count: STATE.filtered.length, at: Date.now()
        });
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents() {
        if (!STATE.root) return;

        var searchEl = STATE.root.querySelector('[data-fu="search"]');
        if (searchEl) {
            searchEl.addEventListener('input', function () {
                STATE.filters.query = this.value;
                STATE.page = 1;
                render();
            });
        }

        var stEl = STATE.root.querySelector('[data-fu="filter-status"]');
        if (stEl) {
            stEl.addEventListener('change', function () {
                STATE.filters.status = this.value;
                STATE.page = 1;
                render();
            });
        }

        var prEl = STATE.root.querySelector('[data-fu="filter-priority"]');
        if (prEl) {
            prEl.addEventListener('change', function () {
                STATE.filters.priority = this.value;
                STATE.page = 1;
                render();
            });
        }

        var dueEl = STATE.root.querySelector('[data-fu="filter-due"]');
        if (dueEl) {
            dueEl.addEventListener('change', function () {
                STATE.filters.dueFilter = this.value;
                STATE.page = 1;
                render();
            });
        }

        var sortEl = STATE.root.querySelector('[data-fu="sort"]');
        if (sortEl) {
            sortEl.addEventListener('change', function () {
                STATE.sort = this.value;
                render();
            });
        }

        var btns = STATE.root.querySelectorAll('[data-fu-action]');
        for (var i = 0; i < btns.length; i++) {
            if (btns[i].dataset.bound) continue;
            btns[i].addEventListener('click', _handleAction);
            btns[i].dataset.bound = '1';
        }

        var selectAll = STATE.root.querySelector('[data-fu="select-all"]');
        if (selectAll) selectAll.addEventListener('change', _handleSelectAll);

        var rowChecks = STATE.root.querySelectorAll('[data-fu="select-row"]');
        for (var j = 0; j < rowChecks.length; j++) {
            rowChecks[j].addEventListener('change', _handleRowSelect);
        }

        var rowBtns = STATE.root.querySelectorAll('[data-fu-row-action]');
        for (var k = 0; k < rowBtns.length; k++) {
            rowBtns[k].addEventListener('click', _handleRowAction);
        }

        var pageBtns = STATE.root.querySelectorAll('[data-fu-page]');
        for (var m = 0; m < pageBtns.length; m++) {
            pageBtns[m].addEventListener('click', _handlePageClick);
        }
    }

    function _handleAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-fu-action');

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
        _emit(FollowUpEvents.SELECTION, { count: _getSelectedIds().length });
    }

    function _handleRowSelect(e) {
        e.stopPropagation();
        var container = this.closest('[data-fu-id]');
        if (!container) return;
        var id = container.getAttribute('data-fu-id');
        if (this.checked) STATE.selectedIds[id] = true;
        else delete STATE.selectedIds[id];
        render();
        _emit(FollowUpEvents.SELECTION, { count: _getSelectedIds().length });
    }

    function _handleRowAction(e) {
        e.preventDefault();
        e.stopPropagation();
        var action = this.getAttribute('data-fu-row-action');
        var container = this.closest('[data-fu-id]');
        if (!container) return;
        var id = container.getAttribute('data-fu-id');
        if (!id) return;

        if (action === 'view') openDetail(id);
        else if (action === 'edit') openForm(id);
        else if (action === 'status') openStatusModal(id);
        else if (action === 'delete') _confirmDelete(id);
    }

    function _handlePageClick() {
        var p = parseInt(this.getAttribute('data-fu-page'), 10);
        if (isNaN(p) || p < 1) return;
        STATE.page = p;
        render();
    }

    // ─────────────────────────────────────
    // 👁️ نمایش جزئیات
    // ─────────────────────────────────────
    function openDetail(id) {
        var f = _findById(id);
        if (!f) return;

        _emit(FollowUpEvents.ROW_CLICK, { id: id, action: 'view' });

        var existing = document.getElementById('wamFuDetailModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var historyHtml = '';
        if (Array.isArray(f.history) && f.history.length > 0) {
            historyHtml = '<ul class="wam-fu__history">';
            for (var i = f.history.length - 1; i >= 0; i--) {
                var h = f.history[i];
                var label = h.action === 'status_change'
                    ? 'تغییر وضعیت از «' + _statusLabel(h.from) +
                      '» به «' + _statusLabel(h.to) + '»'
                    : h.action === 'assigned'
                        ? 'ارجاع به ' + _findUserName(h.to)
                        : h.action;
                historyHtml += '<li class="wam-fu__history-item">' +
                    '<div>' + _esc(label) + '</div>' +
                    '<small>' + _esc(h.byName || _findUserName(h.by)) +
                    ' · ' + _esc(_relTime(h.at)) +
                    (h.note ? ' · ' + _esc(h.note) : '') + '</small></li>';
            }
            historyHtml += '</ul>';
        } else {
            historyHtml = '<div class="wam-empty wam-empty--sm">' +
                          'تاریخچه‌ای ثبت نشده.</div>';
        }

        var notesHtml = '';
        if (Array.isArray(f.notes) && f.notes.length > 0) {
            notesHtml = '<ul class="wam-fu__notes">';
            for (var j = f.notes.length - 1; j >= 0; j--) {
                var n = f.notes[j];
                notesHtml += '<li class="wam-fu__note">' +
                    '<div>' + _esc(n.text) + '</div>' +
                    '<small>' + _esc(n.byName || _findUserName(n.by)) +
                    ' · ' + _esc(_relTime(n.at)) + '</small></li>';
            }
            notesHtml += '</ul>';
        } else {
            notesHtml = '<div class="wam-empty wam-empty--sm">' +
                        'یادداشتی ثبت نشده.</div>';
        }

        var modal = document.createElement('div');
        modal.id = 'wamFuDetailModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel wam-modal__panel--wide">' +
                '<header class="wam-modal__head">' +
                    '<div>' +
                        '<span class="wam-badge wam-badge--' +
                        _esc(f.status) + '">' +
                        _esc(_statusLabel(f.status)) + '</span> ' +
                        '<span class="wam-fu__priority wam-fu__priority--' +
                        _esc(f.priority) + '">' +
                        _esc(_priorityLabel(f.priority)) + '</span>' +
                    '</div>' +
                    '<button type="button" class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<div class="wam-modal__body">' +
                    '<h3>' + _esc(f.title) + '</h3>' +
                    '<div class="wam-fu__detail-grid">' +
                        _detailRow('کانال', (CHANNEL_ICONS[f.channel] || '') +
                            ' ' + _channelLabel(f.channel)) +
                        _detailRow('متقاضی', f.applicantName || '—') +
                        _detailRow('موبایل', f.applicantMobile || '—') +
                        _detailRow('شناسه پرونده', f.caseId || '—') +
                        _detailRow('مسئول', f.assignedToName ||
                            _findUserName(f.assignedTo)) +
                        _detailRow('سررسید',
                            f.dueDate ? _jalali(f.dueDate) : '—') +
                        _detailRow('تاریخ ایجاد', _jalali(f.createdAt)) +
                    '</div>' +
                    (f.description ?
                        '<div class="wam-fu__desc">' +
                        _esc(f.description).replace(/\n/g, '<br>') +
                        '</div>' : '') +
                    '<h4 class="wam-fu__section-title">📝 یادداشت‌ها</h4>' +
                    notesHtml +
                    '<form data-fu="add-note-form" class="wam-fu__note-form">' +
                    '<textarea name="note" rows="2" placeholder="یادداشت..."></textarea>' +
                    '<button type="submit" class="wam-btn wam-btn--sm ' +
                    'wam-btn--primary">افزودن</button></form>' +
                    '<h4 class="wam-fu__section-title">📜 تاریخچه</h4>' +
                    historyHtml +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var k = 0; k < cbs.length; k++) {
            cbs[k].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }

        var form = modal.querySelector('[data-fu="add-note-form"]');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var ta = form.querySelector('[name="note"]');
                var text = ta.value.trim();
                if (text.length < 2) return;
                var r = addNote(id, text);
                if (r.ok) {
                    if (modal.parentNode) modal.parentNode.removeChild(modal);
                    openDetail(id);
                    _toast('success', 'یادداشت ثبت شد', 'موفق');
                }
            });
        }
    }

    function _detailRow(label, value) {
        return '<div class="wam-fu__detail-row">' +
            '<span class="wam-fu__detail-label">' +
            _esc(label) + ':</span>' +
            '<span class="wam-fu__detail-value">' +
            _esc(value === null || value === undefined || value === '' ? '—' : value) +
            '</span></div>';
    }

    // ─────────────────────────────────────
    // 🔄 تغییر وضعیت modal
    // ─────────────────────────────────────
    function openStatusModal(id) {
        var f = _findById(id);
        if (!f) return;
        if (!canManageStatus(f)) return;

        var existing = document.getElementById('wamFuStatusModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var opts = '';
        for (var s in STATUS_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(STATUS_LABELS, s)) continue;
            opts += '<option value="' + s + '"' +
                (f.status === s ? ' selected' : '') + '>' +
                _esc(STATUS_LABELS[s]) + '</option>';
        }

        var modal = document.createElement('div');
        modal.id = 'wamFuStatusModal';
        modal.className = 'wam-modal';
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
                        '<textarea name="note" rows="2"></textarea></div>' +
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
            var r = changeStatus(id, st, { note: note });
            if (r.ok) {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
                _toast('success', 'وضعیت تغییر کرد', 'موفق');
                reload();
            } else {
                _toast('error', 'خطا', 'خطا');
            }
        });
    }

    // ─────────────────────────────────────
    // ➕ فرم ایجاد/ویرایش
    // ─────────────────────────────────────
    function openForm(id) {
        var editMode = !!id;
        var f = editMode ? _findById(id) : null;
        if (editMode && !f) return;
        if (editMode && !canEdit(f)) {
            _toast('error', 'دسترسی ندارید', 'خطا');
            return;
        }
        if (!editMode && !canCreate()) {
            _toast('error', 'دسترسی ندارید', 'خطا');
            return;
        }

        var existing = document.getElementById('wamFuFormModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var d = f || {};

        var channelOpts = '';
        for (var c in CHANNELS) {
            if (!Object.prototype.hasOwnProperty.call(CHANNELS, c)) continue;
            channelOpts += '<option value="' + c + '"' +
                (d.channel === c || (!d.channel && c === 'phone') ? ' selected' : '') + '>' +
                _esc(CHANNELS[c]) + '</option>';
        }

        var priorityOpts = '';
        for (var p in PRIORITIES) {
            if (!Object.prototype.hasOwnProperty.call(PRIORITIES, p)) continue;
            priorityOpts += '<option value="' + p + '"' +
                (d.priority === p || (!d.priority && p === 'normal') ? ' selected' : '') + '>' +
                _esc(PRIORITIES[p]) + '</option>';
        }

        var users = _findUsers().filter(function (u) {
            return u && (u.role === 'admin' || u.role === 'super_admin' ||
                        u.role === 'verifier' || u.role === 'broker') &&
                   u.active !== false;
        });
        var userOpts = '<option value="">— بدون مسئول —</option>';
        for (var j = 0; j < users.length; j++) {
            userOpts += '<option value="' + _esc(users[j].id) + '"' +
                (d.assignedTo === users[j].id ? ' selected' : '') + '>' +
                _esc(users[j].name || users[j].username) + '</option>';
        }

        var dueVal = d.dueDate ? _jalali(d.dueDate) : '';

        var modal = document.createElement('div');
        modal.id = 'wamFuFormModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>' + (editMode ? 'ویرایش پیگیری' : 'پیگیری جدید') + '</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form class="wam-modal__body">' +

                    '<div class="wam-field"><label>عنوان *</label>' +
                        '<input name="title" value="' +
                        _esc(d.title || '') + '">' +
                        '<div class="wam-field__error" data-error="title"></div></div>' +

                    '<div class="wam-field"><label>توضیحات</label>' +
                        '<textarea name="description" rows="3">' +
                        _esc(d.description || '') + '</textarea></div>' +

                    '<div class="wam-field-row">' +
                        '<div class="wam-field"><label>کانال</label>' +
                            '<select name="channel">' + channelOpts + '</select></div>' +
                        '<div class="wam-field"><label>اولویت</label>' +
                            '<select name="priority">' + priorityOpts + '</select></div>' +
                    '</div>' +

                    '<div class="wam-field"><label>نام متقاضی</label>' +
                        '<input name="applicantName" value="' +
                        _esc(d.applicantName || '') + '"></div>' +

                    '<div class="wam-field"><label>موبایل متقاضی</label>' +
                        '<input name="applicantMobile" type="tel" value="' +
                        _esc(d.applicantMobile || '') + '"></div>' +

                    '<div class="wam-field-row">' +
                        '<div class="wam-field"><label>شناسه پرونده</label>' +
                            '<input name="caseId" value="' +
                            _esc(d.caseId || '') + '"></div>' +
                        '<div class="wam-field"><label>سررسید</label>' +
                            '<input name="dueDate" data-persian-date value="' +
                            _esc(dueVal) + '" placeholder="1405/01/15"></div>' +
                    '</div>' +

                    '<div class="wam-field"><label>ارجاع به</label>' +
                        '<select name="assignedTo">' + userOpts + '</select></div>' +

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

        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.bindAll) {
            try { WamPersianDate.bindAll(modal); } catch (e) { /* بی‌صدا */ }
        }

        var cbs = modal.querySelectorAll('[data-close]');
        for (var k = 0; k < cbs.length; k++) {
            cbs[k].addEventListener('click', function () {
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

        var dueInput = form.querySelector('[name="dueDate"]');
        var dueTs = null;
        if (dueInput && dueInput.value.trim()) {
            try {
                var p = WamPersianDate && WamPersianDate.parse
                    ? WamPersianDate.parse(dueInput.value, 'YYYY/MM/DD') : null;
                if (p) {
                    var d = WamPersianDate.jalaliToDate(p.jy, p.jm, p.jd);
                    if (d) dueTs = d.getTime();
                }
            } catch (e) { /* بی‌صدا */ }
        }

        var data = {
            title: form.querySelector('[name="title"]').value.trim(),
            description: form.querySelector('[name="description"]').value.trim(),
            channel: form.querySelector('[name="channel"]').value,
            priority: form.querySelector('[name="priority"]').value,
            applicantName: form.querySelector('[name="applicantName"]').value.trim(),
            applicantMobile: form.querySelector('[name="applicantMobile"]').value.trim(),
            caseId: form.querySelector('[name="caseId"]').value.trim(),
            dueDate: dueTs,
            assignedTo: form.querySelector('[name="assignedTo"]').value || null
        };

        var res = editMode ? update(id, data) : create(data);

        if (!res.ok) {
            _showFormErrors(form, res.errors || { general: 'خطا: ' + res.reason });
            return;
        }

        // اگر ارجاع داده شده بود در حالت create
        if (!editMode && data.assignedTo) {
            assignTo(res.followUp.id, data.assignedTo);
        }

        var modal = document.getElementById('wamFuFormModal');
        if (modal && modal.parentNode) modal.parentNode.removeChild(modal);

        _toast('success',
            editMode ? 'پیگیری به‌روزرسانی شد' : 'پیگیری ثبت شد',
            'موفق');
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
        var f = _findById(id);
        if (!f) return;
        var msg = 'پیگیری «' + _truncate(f.title, 40) + '» حذف شود؟';
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
            WamUI.confirm('حذف پیگیری', msg, { danger: true })
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
            list = STATE.followUps.filter(function (f) {
                return f && options.ids.indexOf(f.id) !== -1;
            });
        } else {
            list = STATE.filtered;
        }

        if (list.length === 0) {
            _toast('warning', 'داده‌ای برای خروجی نیست', 'توجه');
            return { ok: false, reason: 'empty' };
        }

        var headers = ['عنوان', 'کانال', 'اولویت', 'وضعیت',
                       'متقاضی', 'موبایل', 'مسئول', 'سررسید', 'تاریخ ثبت'];
        var rows = [headers];
        for (var i = 0; i < list.length; i++) {
            var f = list[i];
            rows.push([
                f.title || '',
                _channelLabel(f.channel),
                _priorityLabel(f.priority),
                _statusLabel(f.status),
                f.applicantName || '',
                f.applicantMobile || '',
                f.assignedToName || _findUserName(f.assignedTo),
                f.dueDate ? _jalali(f.dueDate) : '',
                _jalali(f.createdAt)
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
            _emit(FollowUpEvents.EXPORTED, { count: list.length });
            return { ok: true, count: list.length };
        }

        var ts = new Date().toISOString().slice(0, 10);
        var filename = 'wampay-followups-' + ts + '.csv';

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

        _emit(FollowUpEvents.EXPORTED, { count: list.length });
        _toast('success', _fa(list.length) + ' پیگیری خروجی گرفته شد', 'موفق');
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
        STATE.filters = {
            query: '', status: '', priority: '',
            channel: '', dueFilter: ''
        };
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
        if (scope !== 'auto' && scope !== 'all' && scope !== 'mine' &&
            scope !== 'pending' && scope !== 'overdue') return false;
        STATE.scope = scope;
        reload();
        return true;
    }

    // ─────────────────────────────────────
    // 🔄 reload
    // ─────────────────────────────────────
    function reload() {
        var all = _loadAll();
        STATE.followUps = _applyScope(_filterByRole(all));

        var valid = {};
        for (var i = 0; i < STATE.followUps.length; i++) {
            if (STATE.selectedIds[STATE.followUps[i].id]) {
                valid[STATE.followUps[i].id] = true;
            }
        }
        STATE.selectedIds = valid;

        render();
        _emit(FollowUpEvents.LOADED, {
            count: STATE.followUps.length, role: STATE.role,
            scope: STATE.scope, at: Date.now()
        });
        return STATE.followUps.length;
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
                       document.querySelector('.wam-fu');
            if (!root) {
                if (options.debug) console.warn('[follow-ups] root پیدا نشد');
                return;
            }
            STATE.root = root;

            if (options.scope) STATE.scope = options.scope;
            if (options.viewMode) STATE.viewMode = options.viewMode;

            reload();

            // بررسی یادآوری‌ها (تاخیر کوچک)
            if (options.checkReminders !== false) {
                setTimeout(function () {
                    try { checkReminders(); } catch (e) { /* بی‌صدا */ }
                }, 800);
            }

            STATE.installed = true;

            if (options.debug) {
                console.log('[follow-ups] v' + VERSION + ' — ' +
                    STATE.role + '، ' + STATE.followUps.length + ' پیگیری');
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
        STATE.followUps = [];
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
            total: STATE.followUps.length,
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
    var WamFollowUps = {
        VERSION: VERSION,
        EVENTS: FollowUpEvents,
        ROOT_ATTR: ROOT_ATTR,
        FOLLOWUPS_KEY: FOLLOWUPS_KEY,
        PAGE_SIZE: PAGE_SIZE,
        STATUS_LABELS: STATUS_LABELS,
        CHANNELS: CHANNELS,
        PRIORITIES: PRIORITIES,
        SORT_OPTIONS: SORT_OPTIONS,
        VIEW_MODES: VIEW_MODES,

        install: install,
        uninstall: uninstall,
        reload: reload,
        render: render,

        create: create,
        update: update,
        remove: remove,
        changeStatus: changeStatus,
        assignTo: assignTo,
        addNote: addNote,

        openForm: openForm,
        openDetail: openDetail,
        openStatusModal: openStatusModal,

        canCreate: canCreate,
        canEdit: canEdit,
        canDelete: canDelete,
        canManageStatus: canManageStatus,
        canAssign: canAssign,

        checkReminders: checkReminders,

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

        getFollowUps: function () { return STATE.followUps.slice(); },
        getFiltered: function () { return STATE.filtered.slice(); },
        findById: _findById,

        computeStats: computeStats,
        isOverdue: _isOverdue,
        isDueToday: _isDueToday,

        selectAll: selectAll,
        clearSelection: clearSelection,
        getSelectedIds: _getSelectedIds,

        exportCSV: exportCSV,

        formatStatus: _statusLabel,
        formatChannel: _channelLabel,
        formatPriority: _priorityLabel,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamFollowUps = WamFollowUps;
    window.FollowUpEvents = FollowUpEvents;

    // نصب خودکار
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-followups-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-fu')) {
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