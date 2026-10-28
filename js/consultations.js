// ==========================================
// وام پی — Shared Modules
// فایل: consultations.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: ماژول مشترک مدیریت مشاوره‌ها — نقش‌محور
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION   = '1.0.0';
    var ROOT_ATTR = 'data-consultations-root';
    var CONSULT_KEY = 'wamPayConsultations';
    var PAGE_SIZE = 15;

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

    var PRIORITY_ORDER = { urgent: 4, high: 3, normal: 2, low: 1 };

    var SUBJECTS = [
        'مشاوره وام', 'مشاوره مدارک', 'مشاوره اعتبارسنجی',
        'مشاوره قرارداد', 'مشاوره پرداخت', 'سایر'
    ];

    var SORT_OPTIONS = {
        newest:   'جدیدترین',
        oldest:   'قدیمی‌ترین',
        priority: 'اولویت',
        status:   'وضعیت'
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
        consultations: [],
        filtered: [],
        page: 1,
        viewMode: VIEW_MODES.TABLE,
        sort: 'newest',
        scope: 'auto',
        filters: {
            query: '',
            status: '',
            priority: '',
            subject: '',
            assignedTo: ''
        },
        selectedIds: {},
        listeners: [],
        _boundIds: {}
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var CEvents = {
        LOADED:      'shared.consult.loaded',
        RENDERED:    'shared.consult.rendered',
        CREATED:     'shared.consult.created',
        UPDATED:     'shared.consult.updated',
        DELETED:     'shared.consult.deleted',
        STATUS:      'shared.consult.status_changed',
        ASSIGNED:    'shared.consult.assigned',
        EXPORTED:    'shared.consult.exported',
        FILTERED:    'shared.consult.filtered',
        SELECTION:   'shared.consult.selection',
        ROW_CLICK:   'shared.consult.row_click'
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
        return (prefix || 'c') + '_' + Date.now().toString(36) + '_' + r;
    }

    function _genCode() {
        var r = Math.random().toString(36).slice(2, 6).toUpperCase();
        return 'WP-CN-' + r;
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
        for (var i = 0; i < STATE.consultations.length; i++) {
            if (STATE.consultations[i] && STATE.consultations[i].id === id) {
                return STATE.consultations[i];
            }
        }
        return null;
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر بر اساس نقش
    // ─────────────────────────────────────
    function _filterByRole(list, scope) {
        var role = STATE.role;
        var user = _user();
        if (!user) return [];

        // admin / super_admin / verifier: همه
        if (role === 'super_admin' || role === 'admin') {
            return list;
        }
        if (role === 'verifier') {
            // verifier: موارد ارجاع‌شده به خودش + بدون ارجاع
            if (scope === 'mine') {
                return list.filter(function (c) {
                    return c.assignedTo === user.id;
                });
            }
            return list.filter(function (c) {
                return !c.assignedTo || c.assignedTo === user.id;
            });
        }

        // broker: موارد خودش
        if (role === 'broker') {
            return list.filter(function (c) {
                if (!c) return false;
                if (c.brokerId && user.id && c.brokerId === user.id) return true;
                if (c.brokerName && user.name && c.brokerName === user.name) return true;
                if (c.brokerId && _brokerUserIdMatches(c.brokerId, user.id)) return true;
                return false;
            });
        }

        // applicant: موارد خودش
        if (role === 'applicant') {
            return list.filter(function (c) {
                if (!c) return false;
                if (c.applicantUserId && c.applicantUserId === user.id) return true;
                if (c.applicantMobile && user.mobile) {
                    if (String(c.applicantMobile).replace(/\D/g, '') ===
                        String(user.mobile).replace(/\D/g, '')) return true;
                }
                if (c.applicantNationalCode && user.nationalCode) {
                    if (String(c.applicantNationalCode).replace(/\D/g, '') ===
                        String(user.nationalCode).replace(/\D/g, '')) return true;
                }
                return false;
            });
        }

        return list;
    }

    function _brokerUserIdMatches(brokerId, userId) {
        if (!brokerId || !userId) return false;
        if (typeof Storage === 'undefined') return false;
        try {
            var brokers = Storage.getJSON('wamPayBrokers', []) || [];
            for (var i = 0; i < brokers.length; i++) {
                var b = brokers[i];
                if (b && b.id === brokerId && b.userId === userId) return true;
            }
        } catch (e) { /* بی‌صدا */ }
        return false;
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر پیشرفته
    // ─────────────────────────────────────
    function _applyFilters() {
        var f = STATE.filters;
        var q = (f.query || '').toLowerCase().trim();

        STATE.filtered = STATE.consultations.filter(function (c) {
            if (!c) return false;

            if (q) {
                var hay = [c.code, c.title, c.applicantName, c.applicantMobile,
                           c.brokerName, c.subject, c.description]
                    .filter(Boolean).join(' ').toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            if (f.status && c.status !== f.status) return false;
            if (f.priority && c.priority !== f.priority) return false;
            if (f.subject && c.subject !== f.subject) return false;
            if (f.assignedTo) {
                if (f.assignedTo === '__unassigned__') {
                    if (c.assignedTo) return false;
                } else if (c.assignedTo !== f.assignedTo) {
                    return false;
                }
            }
            return true;
        });

        _applySort();
        _emit(CEvents.FILTERED, {
            count: STATE.filtered.length, filters: f
        });
        return STATE.filtered;
    }

    function _applySort() {
        var s = STATE.sort;
        STATE.filtered.sort(function (a, b) {
            if (s === 'newest') {
                return (b.updatedAt || b.createdAt || 0) -
                       (a.updatedAt || a.createdAt || 0);
            }
            if (s === 'oldest') {
                return (a.createdAt || 0) - (b.createdAt || 0);
            }
            if (s === 'priority') {
                var pa = PRIORITY_ORDER[a.priority] || 0;
                var pb = PRIORITY_ORDER[b.priority] || 0;
                if (pa !== pb) return pb - pa;
                return (b.createdAt || 0) - (a.createdAt || 0);
            }
            if (s === 'status') {
                var order = { pending: 1, in_progress: 2, completed: 3,
                              closed: 4, cancelled: 5 };
                return (order[a.status] || 0) - (order[b.status] || 0);
            }
            return 0;
        });
    }

    // ─────────────────────────────────────
    // 📊 آمار
    // ─────────────────────────────────────
    function computeStats() {
        var s = {
            total: STATE.consultations.length,
            filtered: STATE.filtered.length,
            pending: 0, inProgress: 0, completed: 0, closed: 0,
            urgent: 0, bySubject: {}
        };
        for (var i = 0; i < STATE.consultations.length; i++) {
            var c = STATE.consultations[i];
            if (!c) continue;
            var st = c.status || 'pending';
            if (st === 'pending') s.pending++;
            else if (st === 'in_progress') s.inProgress++;
            else if (st === 'completed') s.completed++;
            else if (st === 'closed') s.closed++;
            if (c.priority === 'urgent') s.urgent++;

            var subj = c.subject || 'سایر';
            s.bySubject[subj] = (s.bySubject[subj] || 0) + 1;
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
        _emit(CEvents.SELECTION, { count: _getSelectedIds().length });
        return _getSelectedIds().length;
    }

    function clearSelection() {
        STATE.selectedIds = {};
        _emit(CEvents.SELECTION, { count: 0 });
        return true;
    }

    // ─────────────────────────────────────
    // 🎯 CRUD
    // ─────────────────────────────────────
    function create(data, options) {
        options = options || {};
        var result = { ok: false, reason: null, consult: null, errors: null };

        var errors = _validate(data);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        var user = _user();
        var now = Date.now();

        var consult = {
            id: _genId('cn'),
            code: _genCode(),
            title: String(data.title).trim(),
            subject: data.subject || 'سایر',
            description: String(data.description || '').trim(),
            applicantName: data.applicantName || null,
            applicantMobile: data.applicantMobile
                ? _en(data.applicantMobile).replace(/\D/g, '') : null,
            applicantUserId: data.applicantUserId || null,
            brokerName: data.brokerName || null,
            brokerId: data.brokerId || null,
            caseId: data.caseId || null,
            priority: data.priority || 'normal',
            status: 'pending',
            assignedTo: null,
            notes: [],
            replies: [],
            createdBy: user ? user.id : null,
            createdByName: user ? (user.name || user.username) : null,
            createdAt: now,
            updatedAt: now
        };

        var all = _loadAll();
        all.push(consult);
        if (!_saveAll(all)) {
            result.reason = 'storage_error';
            return result;
        }

        STATE.consultations.push(consult);
        _emit(CEvents.CREATED, { consult: consult, at: now });

        result.ok = true;
        result.consult = consult;
        return result;
    }

    function update(id, patch, options) {
        options = options || {};
        var result = { ok: false, reason: null, consult: null, errors: null };

        var c = _findById(id);
        if (!c) { result.reason = 'not_found'; return result; }

        if (!canEdit(c)) {
            result.reason = 'forbidden';
            return result;
        }

        if (patch.title !== undefined && String(patch.title).trim().length < 3) {
            result.reason = 'validation';
            result.errors = { title: 'عنوان حداقل ۳ کاراکتر' };
            return result;
        }

        var allowed = ['title', 'subject', 'description', 'priority',
                       'applicantName', 'applicantMobile', 'brokerName',
                       'caseId'];
        for (var i = 0; i < allowed.length; i++) {
            var k = allowed[i];
            if (patch[k] !== undefined) c[k] = patch[k];
        }
        if (patch.applicantMobile) {
            c.applicantMobile = _en(patch.applicantMobile).replace(/\D/g, '');
        }

        c.updatedAt = Date.now();
        c.updatedBy = _uid();

        var all = _loadAll();
        var found = false;
        for (var j = 0; j < all.length; j++) {
            if (all[j] && all[j].id === id) {
                all[j] = c;
                found = true;
                break;
            }
        }
        if (!found) { result.reason = 'not_found'; return result; }
        if (!_saveAll(all)) { result.reason = 'storage_error'; return result; }

        result.ok = true;
        result.consult = c;
        _emit(CEvents.UPDATED, { consult: c, at: Date.now() });
        return result;
    }

    function remove(id) {
        var c = _findById(id);
        if (!c) return { ok: false, reason: 'not_found' };
        if (!canDelete(c)) return { ok: false, reason: 'forbidden' };

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

        for (var j = 0; j < STATE.consultations.length; j++) {
            if (STATE.consultations[j].id === id) {
                STATE.consultations.splice(j, 1);
                break;
            }
        }

        delete STATE.selectedIds[id];
        _emit(CEvents.DELETED, { consult: removed, at: Date.now() });
        return { ok: true, consult: removed };
    }

    function changeStatus(id, newStatus, options) {
        options = options || {};
        var c = _findById(id);
        if (!c) return { ok: false, reason: 'not_found' };
        if (!canManageStatus(c)) return { ok: false, reason: 'forbidden' };
        if (!STATUS_LABELS[newStatus]) return { ok: false, reason: 'invalid_status' };

        var prev = c.status;
        c.status = newStatus;
        c.updatedAt = Date.now();
        c.updatedBy = _uid();

        if (options.note) {
            if (!Array.isArray(c.notes)) c.notes = [];
            c.notes.push({
                text: 'وضعیت از «' + _statusLabel(prev) + '» به «' +
                      _statusLabel(newStatus) + '»: ' + options.note,
                by: _uid(),
                at: Date.now()
            });
        }

        var all = _loadAll();
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].id === id) { all[i] = c; break; }
        }
        if (!_saveAll(all)) return { ok: false, reason: 'storage_error' };

        _emit(CEvents.STATUS, { consult: c, from: prev, to: newStatus, at: Date.now() });
        return { ok: true, consult: c };
    }

    function assignTo(id, assigneeId) {
        var c = _findById(id);
        if (!c) return { ok: false, reason: 'not_found' };
        if (!canManageStatus(c)) return { ok: false, reason: 'forbidden' };

        c.assignedTo = assigneeId || null;
        c.assignedAt = Date.now();
        c.assignedBy = _uid();
        c.updatedAt = Date.now();

        var all = _loadAll();
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].id === id) { all[i] = c; break; }
        }
        if (!_saveAll(all)) return { ok: false, reason: 'storage_error' };

        _emit(CEvents.ASSIGNED, { consult: c, assignedTo: assigneeId, at: Date.now() });
        return { ok: true, consult: c };
    }

    // ─────────────────────────────────────
    // 🔒 دسترسی
    // ─────────────────────────────────────
    function canCreate() {
        return STATE.role === 'admin' || STATE.role === 'super_admin' ||
               STATE.role === 'broker' || STATE.role === 'applicant' ||
               STATE.role === 'verifier';
    }

    function canEdit(c) {
        if (!c) return false;
        if (STATE.role === 'admin' || STATE.role === 'super_admin') return true;
        if (STATE.role === 'verifier' &&
            (c.assignedTo === STATE.userId || !c.assignedTo)) return true;
        if (STATE.role === 'broker' && c.createdBy === STATE.userId) return true;
        if (STATE.role === 'applicant' && c.createdBy === STATE.userId &&
            c.status === 'pending') return true;
        return false;
    }

    function canDelete(c) {
        if (!c) return false;
        if (STATE.role === 'admin' || STATE.role === 'super_admin') return true;
        if (c.createdBy === STATE.userId && c.status === 'pending') return true;
        return false;
    }

    function canManageStatus(c) {
        if (!c) return false;
        if (STATE.role === 'admin' || STATE.role === 'super_admin') return true;
        if (STATE.role === 'verifier' &&
            (c.assignedTo === STATE.userId || !c.assignedTo)) return true;
        return false;
    }

    // ─────────────────────────────────────
    // 🧾 اعتبارسنجی
    // ─────────────────────────────────────
    function _validate(data) {
        var e = {};
        if (!data.title || String(data.title).trim().length < 3) {
            e.title = 'عنوان حداقل ۳ کاراکتر';
        } else if (String(data.title).trim().length > 120) {
            e.title = 'عنوان حداکثر ۱۲۰ کاراکتر';
        }
        if (!data.subject) e.subject = 'موضوع الزامی';
        if (!data.description || String(data.description).trim().length < 10) {
            e.description = 'توضیحات حداقل ۱۰ کاراکتر';
        } else if (String(data.description).trim().length > 2000) {
            e.description = 'توضیحات حداکثر ۲۰۰۰ کاراکتر';
        }
        if (data.applicantMobile) {
            var m = _en(data.applicantMobile).replace(/\D/g, '');
            if (m && !/^09\d{9}$/.test(m)) e.applicantMobile = 'موبایل نامعتبر';
        }
        return e;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — هدر آماری
    // ─────────────────────────────────────
    function _renderStats() {
        var s = computeStats();
        return '<div class="wam-cons__stats">' +
            '<div class="wam-cons__stat"><span>کل:</span> <strong>' +
                _fa(s.total) + '</strong></div>' +
            '<div class="wam-cons__stat"><span>در انتظار:</span> <strong>' +
                _fa(s.pending) + '</strong></div>' +
            '<div class="wam-cons__stat"><span>در بررسی:</span> <strong>' +
                _fa(s.inProgress) + '</strong></div>' +
            '<div class="wam-cons__stat"><span>تکمیل:</span> <strong>' +
                _fa(s.completed) + '</strong></div>' +
            '<div class="wam-cons__stat wam-cons__stat--urgent">' +
                '<span>فوری:</span> <strong>' + _fa(s.urgent) + '</strong></div>' +
        '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نوار ابزار
    // ─────────────────────────────────────
    function _renderToolbar() {
        var selected = _getSelectedIds().length;

        var html = '<div class="wam-cons__toolbar">';

        html += '<div class="wam-cons__filters">';
        html += '<input type="search" data-cons="search" ' +
                'placeholder="🔍 جستجو..." value="' + _esc(STATE.filters.query) + '">';

        html += '<select data-cons="filter-status">' +
                '<option value="">همه وضعیت‌ها</option>';
        for (var st in STATUS_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(STATUS_LABELS, st)) continue;
            html += '<option value="' + st + '"' +
                    (STATE.filters.status === st ? ' selected' : '') + '>' +
                    _esc(STATUS_LABELS[st]) + '</option>';
        }
        html += '</select>';

        html += '<select data-cons="filter-priority">' +
                '<option value="">همه اولویت‌ها</option>';
        for (var pr in PRIORITY_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(PRIORITY_LABELS, pr)) continue;
            html += '<option value="' + pr + '"' +
                    (STATE.filters.priority === pr ? ' selected' : '') + '>' +
                    _esc(PRIORITY_LABELS[pr]) + '</option>';
        }
        html += '</select>';

        html += '<select data-cons="sort">';
        for (var sk in SORT_OPTIONS) {
            if (!Object.prototype.hasOwnProperty.call(SORT_OPTIONS, sk)) continue;
            html += '<option value="' + sk + '"' +
                    (STATE.sort === sk ? ' selected' : '') + '>' +
                    _esc(SORT_OPTIONS[sk]) + '</option>';
        }
        html += '</select>';

        html += '<button class="wam-btn-icon" data-cons-action="toggle-view" ' +
                'title="حالت نمایش">' +
                (STATE.viewMode === 'table' ? '🃏' : '📋') + '</button>';

        html += '<button class="wam-btn-icon" data-cons-action="refresh" ' +
                'title="بروزرسانی">🔄</button>';

        if (selected > 0) {
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-cons-action="clear-selection">لغو</button>';
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-cons-action="export-selected">📤 (' +
                    _fa(selected) + ')</button>';
        } else {
            if (canCreate()) {
                html += '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
                        'data-cons-action="new">➕ مشاوره جدید</button>';
            }
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-cons-action="export">📤 CSV</button>';
        }

        html += '</div>';
        html += '</div>';
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
                (STATE.consultations.length === 0
                    ? 'هیچ مشاوره‌ای وجود ندارد.'
                    : 'نتیجه‌ای برای فیلتر فعلی یافت نشد.') +
                '</div>';
        }

        var html = '<div class="wam-cons__table-wrap">' +
            '<table class="wam-cons__table"><thead><tr>';

        html += '<th class="wam-cons__check">' +
                '<input type="checkbox" data-cons="select-all"' +
                (_getSelectedIds().length > 0 ? ' checked' : '') + '></th>';
        html += '<th>کد</th>';
        html += '<th>عنوان</th>';
        html += '<th>موضوع</th>';
        html += '<th>اولویت</th>';
        html += '<th>وضعیت</th>';
        html += '<th>ارجاع به</th>';
        html += '<th>آخرین تغییر</th>';
        html += '<th>عملیات</th>';

        html += '</tr></thead><tbody>';

        for (var i = 0; i < items.length; i++) {
            html += _renderRow(items[i]);
        }

        html += '</tbody></table></div>';
        return html;
    }

    function _renderRow(c) {
        var st = c.status || 'pending';
        var pr = c.priority || 'normal';
        var selected = !!STATE.selectedIds[c.id];

        var html = '<tr data-cons-id="' + _esc(c.id) + '"' +
                   (selected ? ' class="is-selected"' : '') + '>';

        html += '<td><input type="checkbox" data-cons="select-row"' +
                (selected ? ' checked' : '') + '></td>';

        html += '<td><code>' + _esc(c.code) + '</code></td>';
        html += '<td class="wam-cons__title-cell">' +
                _esc(_truncate(c.title, 40)) + '</td>';
        html += '<td>' + _esc(c.subject || '—') + '</td>';
        html += '<td><span class="wam-cons__priority wam-cons__priority--' +
                _esc(pr) + '">' + _esc(_priorityLabel(pr)) + '</span></td>';
        html += '<td><span class="wam-badge wam-badge--' + _esc(st) + '">' +
                _esc(_statusLabel(st)) + '</span></td>';
        html += '<td>' + _esc(_assigneeName(c.assignedTo)) + '</td>';
        html += '<td>' + _esc(_relTime(c.updatedAt || c.createdAt)) + '</td>';

        html += '<td class="wam-cons__actions">' +
                '<button class="wam-btn-icon" data-cons-row-action="view" ' +
                'title="مشاهده">👁️</button>';

        if (canEdit(c)) {
            html += '<button class="wam-btn-icon" data-cons-row-action="edit" ' +
                    'title="ویرایش">✏️</button>';
        }
        if (canManageStatus(c)) {
            html += '<button class="wam-btn-icon" data-cons-row-action="status" ' +
                    'title="تغییر وضعیت">🔄</button>';
        }
        if (canDelete(c)) {
            html += '<button class="wam-btn-icon wam-btn-icon--danger" ' +
                    'data-cons-row-action="delete" title="حذف">🗑️</button>';
        }
        html += '</td>';

        html += '</tr>';
        return html;
    }

    function _truncate(s, n) {
        s = String(s || '');
        return s.length > n ? s.slice(0, n - 1) + '…' : s;
    }

    function _assigneeName(id) {
        if (!id) return '—';
        if (typeof Storage === 'undefined') return id;
        try {
            var users = Storage.getJSON('wamPayUsers', []) || [];
            for (var i = 0; i < users.length; i++) {
                if (users[i] && users[i].id === id) {
                    return users[i].name || users[i].username || id;
                }
            }
        } catch (e) { /* بی‌صدا */ }
        return id;
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

        var html = '<div class="wam-cons__cards">';
        for (var i = 0; i < items.length; i++) {
            html += _renderCard(items[i]);
        }
        html += '</div>';
        return html;
    }

    function _renderCard(c) {
        var st = c.status || 'pending';
        var pr = c.priority || 'normal';
        var selected = !!STATE.selectedIds[c.id];

        return '<div class="wam-cons__card' +
            (selected ? ' is-selected' : '') + '" data-cons-id="' + _esc(c.id) + '">' +
            '<div class="wam-cons__card-head">' +
                '<input type="checkbox" data-cons="select-row"' +
                (selected ? ' checked' : '') + '>' +
                '<code>' + _esc(c.code) + '</code>' +
                '<span class="wam-badge wam-badge--' + _esc(st) + '">' +
                _esc(_statusLabel(st)) + '</span>' +
            '</div>' +
            '<div class="wam-cons__card-title">' +
                _esc(c.title) + '</div>' +
            '<div class="wam-cons__card-rows">' +
                '<div><span>موضوع:</span> ' + _esc(c.subject || '—') + '</div>' +
                '<div><span>اولویت:</span> ' +
                '<span class="wam-cons__priority wam-cons__priority--' +
                _esc(pr) + '">' + _esc(_priorityLabel(pr)) + '</span></div>' +
                '<div><span>ارجاع:</span> ' +
                _esc(_assigneeName(c.assignedTo)) + '</div>' +
            '</div>' +
            '<div class="wam-cons__card-foot">' +
                '<span>' + _esc(_relTime(c.updatedAt || c.createdAt)) + '</span>' +
                '<button class="wam-btn wam-btn--sm" ' +
                'data-cons-row-action="view">مشاهده</button>' +
            '</div></div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — صفحه‌بندی
    // ─────────────────────────────────────
    function _renderPagination(total) {
        var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (pages <= 1) return '';

        var p = STATE.page;
        var html = '<div class="wam-cons__pagination">';
        html += '<button data-cons-page="' + (p - 1) + '"' +
                (p === 1 ? ' disabled' : '') + '>‹</button>';

        var start = Math.max(1, p - 2);
        var end = Math.min(pages, p + 2);
        if (start > 1) {
            html += '<button data-cons-page="1">' + _fa(1) + '</button>';
            if (start > 2) html += '<span>…</span>';
        }
        for (var i = start; i <= end; i++) {
            html += '<button data-cons-page="' + i + '"' +
                    (i === p ? ' class="is-active"' : '') + '>' +
                    _fa(i) + '</button>';
        }
        if (end < pages) {
            if (end < pages - 1) html += '<span>…</span>';
            html += '<button data-cons-page="' + pages + '">' +
                    _fa(pages) + '</button>';
        }
        html += '<button data-cons-page="' + (p + 1) + '"' +
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
        if (STATE.viewMode === VIEW_MODES.TABLE) {
            body = _renderTable();
        } else {
            body = _renderCards();
        }

        var html =
            '<div class="wam-cons">' +
                _renderStats() +
                _renderToolbar() +
                '<div class="wam-cons__body">' + body + '</div>' +
                _renderPagination(STATE.filtered.length) +
            '</div>';

        STATE.root.innerHTML = html;
        _bindEvents();

        _emit(CEvents.RENDERED, {
            count: STATE.filtered.length,
            page: STATE.page,
            viewMode: STATE.viewMode,
            at: Date.now()
        });
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents() {
        if (!STATE.root) return;

        var searchEl = STATE.root.querySelector('[data-cons="search"]');
        if (searchEl) {
            searchEl.addEventListener('input', function () {
                STATE.filters.query = this.value;
                STATE.page = 1;
                render();
            });
        }

        var statusEl = STATE.root.querySelector('[data-cons="filter-status"]');
        if (statusEl) {
            statusEl.addEventListener('change', function () {
                STATE.filters.status = this.value;
                STATE.page = 1;
                render();
            });
        }

        var priorityEl = STATE.root.querySelector('[data-cons="filter-priority"]');
        if (priorityEl) {
            priorityEl.addEventListener('change', function () {
                STATE.filters.priority = this.value;
                STATE.page = 1;
                render();
            });
        }

        var sortEl = STATE.root.querySelector('[data-cons="sort"]');
        if (sortEl) {
            sortEl.addEventListener('change', function () {
                STATE.sort = this.value;
                render();
            });
        }

        var actionBtns = STATE.root.querySelectorAll('[data-cons-action]');
        for (var i = 0; i < actionBtns.length; i++) {
            if (actionBtns[i].dataset.bound) continue;
            actionBtns[i].addEventListener('click', _handleAction);
            actionBtns[i].dataset.bound = '1';
        }

        var selectAll = STATE.root.querySelector('[data-cons="select-all"]');
        if (selectAll) selectAll.addEventListener('change', _handleSelectAll);

        var rowChecks = STATE.root.querySelectorAll('[data-cons="select-row"]');
        for (var j = 0; j < rowChecks.length; j++) {
            rowChecks[j].addEventListener('change', _handleRowSelect);
        }

        var rowBtns = STATE.root.querySelectorAll('[data-cons-row-action]');
        for (var k = 0; k < rowBtns.length; k++) {
            rowBtns[k].addEventListener('click', _handleRowAction);
        }

        var pageBtns = STATE.root.querySelectorAll('[data-cons-page]');
        for (var m = 0; m < pageBtns.length; m++) {
            pageBtns[m].addEventListener('click', _handlePageClick);
        }
    }

    function _handleAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-cons-action');

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
        _emit(CEvents.SELECTION, { count: _getSelectedIds().length });
    }

    function _handleRowSelect(e) {
        e.stopPropagation();
        var container = this.closest('[data-cons-id]');
        if (!container) return;
        var id = container.getAttribute('data-cons-id');
        if (this.checked) STATE.selectedIds[id] = true;
        else delete STATE.selectedIds[id];
        render();
        _emit(CEvents.SELECTION, { count: _getSelectedIds().length });
    }

    function _handleRowAction(e) {
        e.preventDefault();
        e.stopPropagation();
        var action = this.getAttribute('data-cons-row-action');
        var container = this.closest('[data-cons-id]');
        if (!container) return;
        var id = container.getAttribute('data-cons-id');
        if (!id) return;

        if (action === 'view') openDetail(id);
        else if (action === 'edit') openForm(id);
        else if (action === 'status') openStatusModal(id);
        else if (action === 'delete') _confirmDelete(id);
    }

    function _handlePageClick() {
        var p = parseInt(this.getAttribute('data-cons-page'), 10);
        if (isNaN(p) || p < 1) return;
        STATE.page = p;
        render();
    }

    // ─────────────────────────────────────
    // 👁️ نمایش جزئیات (modal)
    // ─────────────────────────────────────
    function openDetail(id) {
        var c = _findById(id);
        if (!c) return;

        _emit(CEvents.ROW_CLICK, { id: id, action: 'view' });

        var existing = document.getElementById('wamConsDetailModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var repliesHtml = '';
        if (Array.isArray(c.replies) && c.replies.length > 0) {
            repliesHtml = '<ul class="wam-cons__replies">';
            for (var i = 0; i < c.replies.length; i++) {
                var r = c.replies[i];
                repliesHtml += '<li class="wam-cons__reply">' +
                    '<div class="wam-cons__reply-body">' +
                    _esc(r.text) + '</div>' +
                    '<div class="wam-cons__reply-meta">' +
                    _esc(r.byName || '—') + ' · ' +
                    _esc(_relTime(r.at)) + '</div></li>';
            }
            repliesHtml += '</ul>';
        } else {
            repliesHtml = '<div class="wam-empty wam-empty--sm">' +
                          'هنوز پاسخی داده نشده.</div>';
        }

        var modal = document.createElement('div');
        modal.id = 'wamConsDetailModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel wam-modal__panel--wide">' +
                '<header class="wam-modal__head">' +
                    '<div>' +
                        '<code>' + _esc(c.code) + '</code> ' +
                        '<span class="wam-badge wam-badge--' +
                        _esc(c.status || 'pending') + '">' +
                        _esc(_statusLabel(c.status)) + '</span>' +
                    '</div>' +
                    '<button type="button" class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<div class="wam-modal__body">' +
                    '<h3>' + _esc(c.title) + '</h3>' +
                    '<div class="wam-cons__detail-meta">' +
                        '<span>🗂️ ' + _esc(c.subject || '—') + '</span>' +
                        '<span>⚡ ' + _esc(_priorityLabel(c.priority)) + '</span>' +
                        '<span>👤 ' + _esc(_assigneeName(c.assignedTo)) + '</span>' +
                        '<span>📅 ' + _esc(_jalali(c.createdAt)) + '</span>' +
                    '</div>' +
                    '<div class="wam-cons__detail-body">' +
                    _esc(c.description) + '</div>' +
                    '<h4>💬 پاسخ‌ها</h4>' +
                    repliesHtml +
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

    // ─────────────────────────────────────
    // ➕ فرم افزودن/ویرایش
    // ─────────────────────────────────────
    function openForm(id) {
        var editMode = !!id;
        var c = editMode ? _findById(id) : null;
        if (editMode && !c) return;
        if (editMode && !canEdit(c)) {
            _toast('error', 'دسترسی به ویرایش ندارید', 'خطا');
            return;
        }
        if (!editMode && !canCreate()) {
            _toast('error', 'دسترسی به ایجاد ندارید', 'خطا');
            return;
        }

        var existing = document.getElementById('wamConsFormModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var data = c || {};

        var subjOpts = '<option value="">— انتخاب —</option>';
        for (var i = 0; i < SUBJECTS.length; i++) {
            subjOpts += '<option value="' + _esc(SUBJECTS[i]) + '"' +
                (data.subject === SUBJECTS[i] ? ' selected' : '') + '>' +
                _esc(SUBJECTS[i]) + '</option>';
        }

        var prioOpts = '';
        var plist = ['low', 'normal', 'high', 'urgent'];
        for (var j = 0; j < plist.length; j++) {
            prioOpts += '<option value="' + plist[j] + '"' +
                (data.priority === plist[j] ||
                 (!data.priority && plist[j] === 'normal') ? ' selected' : '') + '>' +
                _esc(PRIORITY_LABELS[plist[j]]) + '</option>';
        }

        var modal = document.createElement('div');
        modal.id = 'wamConsFormModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>' + (editMode ? 'ویرایش مشاوره' : 'مشاوره جدید') + '</h3>' +
                    '<button type="button" class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form id="wamConsForm" class="wam-modal__body">' +
                    '<div class="wam-field"><label>عنوان *</label>' +
                        '<input name="title" value="' + _esc(data.title || '') + '">' +
                        '<div class="wam-field__error" data-error="title"></div></div>' +
                    '<div class="wam-field"><label>موضوع *</label>' +
                        '<select name="subject">' + subjOpts + '</select>' +
                        '<div class="wam-field__error" data-error="subject"></div></div>' +
                    '<div class="wam-field"><label>اولویت</label>' +
                        '<select name="priority">' + prioOpts + '</select></div>' +
                    '<div class="wam-field"><label>نام متقاضی (اختیاری)</label>' +
                        '<input name="applicantName" value="' +
                        _esc(data.applicantName || '') + '"></div>' +
                    '<div class="wam-field"><label>موبایل متقاضی (اختیاری)</label>' +
                        '<input name="applicantMobile" type="tel" value="' +
                        _esc(data.applicantMobile || '') + '"></div>' +
                    '<div class="wam-field"><label>توضیحات *</label>' +
                        '<textarea name="description" rows="5">' +
                        _esc(data.description || '') + '</textarea>' +
                        '<div class="wam-field__error" data-error="description"></div></div>' +
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
        for (var k = 0; k < cbs.length; k++) {
            cbs[k].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }

        var form = modal.querySelector('#wamConsForm');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                _handleFormSubmit(form, editMode, id);
            });
        }
    }

    function _handleFormSubmit(form, editMode, id) {
        _clearFormErrors(form);

        var data = {
            title: form.querySelector('[name="title"]').value.trim(),
            subject: form.querySelector('[name="subject"]').value,
            priority: form.querySelector('[name="priority"]').value,
            applicantName: form.querySelector('[name="applicantName"]').value.trim(),
            applicantMobile: form.querySelector('[name="applicantMobile"]').value.trim(),
            description: form.querySelector('[name="description"]').value.trim()
        };

        var res = editMode ? update(id, data) : create(data);

        if (!res.ok) {
            _showFormErrors(form, res.errors || { general: 'خطا: ' + res.reason });
            return;
        }

        var modal = document.getElementById('wamConsFormModal');
        if (modal && modal.parentNode) modal.parentNode.removeChild(modal);

        _toast('success', editMode ? 'مشاوره به‌روزرسانی شد' : 'مشاوره ثبت شد', 'موفق');
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
    // 🔄 تغییر وضعیت
    // ─────────────────────────────────────
    function openStatusModal(id) {
        var c = _findById(id);
        if (!c) return;
        if (!canManageStatus(c)) {
            _toast('error', 'دسترسی ندارید', 'خطا');
            return;
        }

        var existing = document.getElementById('wamConsStatusModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var opts = '';
        for (var s in STATUS_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(STATUS_LABELS, s)) continue;
            opts += '<option value="' + s + '"' +
                (c.status === s ? ' selected' : '') + '>' +
                _esc(STATUS_LABELS[s]) + '</option>';
        }

        var modal = document.createElement('div');
        modal.id = 'wamConsStatusModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>🔄 تغییر وضعیت</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form id="wamConsStatusForm" class="wam-modal__body">' +
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

        var form = modal.querySelector('#wamConsStatusForm');
        if (form) {
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
                    _toast('error', 'خطا در تغییر وضعیت', 'خطا');
                }
            });
        }
    }

    function _confirmDelete(id) {
        var c = _findById(id);
        if (!c) return;
        var msg = 'مشاوره «' + (c.title || c.code) + '» حذف شود؟';
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
            WamUI.confirm('حذف مشاوره', msg, { danger: true })
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
            list = STATE.consultations.filter(function (c) {
                return c && options.ids.indexOf(c.id) !== -1;
            });
        } else {
            list = STATE.filtered;
        }

        if (list.length === 0) {
            _toast('warning', 'داده‌ای برای خروجی نیست', 'توجه');
            return { ok: false, reason: 'empty' };
        }

        var headers = ['کد', 'عنوان', 'موضوع', 'اولویت', 'وضعیت',
                       'ارجاع به', 'متقاضی', 'موبایل', 'تاریخ ایجاد'];
        var rows = [headers];

        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            rows.push([
                c.code || '',
                c.title || '',
                c.subject || '',
                _priorityLabel(c.priority),
                _statusLabel(c.status),
                _assigneeName(c.assignedTo),
                c.applicantName || '',
                c.applicantMobile || '',
                _jalali(c.createdAt)
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
            _emit(CEvents.EXPORTED, { count: list.length, at: Date.now() });
            return { ok: true, count: list.length };
        }

        var ts = new Date().toISOString().slice(0, 10);
        var filename = 'wampay-consultations-' + ts + '.csv';

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

        _emit(CEvents.EXPORTED, { count: list.length, at: Date.now() });
        _toast('success', _fa(list.length) + ' مورد خروجی گرفته شد', 'موفق');
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
        STATE.filters = {
            query: '', status: '', priority: '', subject: '', assignedTo: ''
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
        if (scope !== 'auto' && scope !== 'all' && scope !== 'mine') return false;
        STATE.scope = scope;
        reload();
        return true;
    }

    // ─────────────────────────────────────
    // 🔄 reload
    // ─────────────────────────────────────
    function reload() {
        var all = _loadAll();
        STATE.consultations = _filterByRole(all, STATE.scope);

        // پاکسازی انتخاب‌های نامعتبر
        var valid = {};
        for (var i = 0; i < STATE.consultations.length; i++) {
            if (STATE.selectedIds[STATE.consultations[i].id]) {
                valid[STATE.consultations[i].id] = true;
            }
        }
        STATE.selectedIds = valid;

        render();
        _emit(CEvents.LOADED, {
            count: STATE.consultations.length,
            role: STATE.role,
            scope: STATE.scope,
            at: Date.now()
        });
        return STATE.consultations.length;
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
                       document.querySelector('.wam-consultations');
            if (!root) {
                if (options.debug) console.warn('[consultations] root پیدا نشد');
                return;
            }
            STATE.root = root;

            if (options.scope) STATE.scope = options.scope;
            if (options.viewMode) STATE.viewMode = options.viewMode;

            STATE.consultations = _filterByRole(_loadAll(), STATE.scope);
            render();

            STATE.installed = true;

            _emit(CEvents.LOADED, {
                count: STATE.consultations.length,
                role: STATE.role,
                at: Date.now()
            });

            if (options.debug) {
                console.log('[consultations] v' + VERSION + ' — ' +
                    STATE.role + '، ' + STATE.consultations.length + ' مشاوره');
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
        STATE.consultations = [];
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
            total: STATE.consultations.length,
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
    var WamConsultations = {
        VERSION: VERSION,
        EVENTS: CEvents,
        ROOT_ATTR: ROOT_ATTR,
        CONSULT_KEY: CONSULT_KEY,
        PAGE_SIZE: PAGE_SIZE,
        STATUS_LABELS: STATUS_LABELS,
        PRIORITY_LABELS: PRIORITY_LABELS,
        SUBJECTS: SUBJECTS,
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

        openForm: openForm,
        openDetail: openDetail,
        openStatusModal: openStatusModal,

        canCreate: canCreate,
        canEdit: canEdit,
        canDelete: canDelete,
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

        getConsultations: function () { return STATE.consultations.slice(); },
        getFiltered: function () { return STATE.filtered.slice(); },
        computeStats: computeStats,

        selectAll: selectAll,
        clearSelection: clearSelection,
        getSelectedIds: _getSelectedIds,

        exportCSV: exportCSV,

        formatStatus: _statusLabel,
        formatPriority: _priorityLabel,
        assigneeName: _assigneeName,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamConsultations = WamConsultations;
    window.ConsultationEvents = CEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-consultations-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-consultations')) {
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