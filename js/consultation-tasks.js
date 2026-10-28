// ==========================================
// وام پی — Shared Modules
// فایل: consultation-tasks.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: مدیریت تسک‌های مشاوره — CRUD + پیگیری + پیشرفت
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION = '1.0.0';
    var ROOT_ATTR = 'data-consultation-tasks-root';
    var TASKS_KEY = 'wamPayConsultationTasks';
    var USERS_KEY = 'wamPayUsers';
    var PAGE_SIZE = 20;

    var STATUS_LABELS = {
        pending:     'در انتظار',
        in_progress: 'در حال انجام',
        completed:   'انجام‌شده',
        cancelled:   'لغو شده'
    };

    var PRIORITY_LABELS = {
        low: 'کم', normal: 'معمولی', high: 'بالا', urgent: 'فوری'
    };

    var PRIORITY_ORDER = { urgent: 4, high: 3, normal: 2, low: 1 };

    var SORT_OPTIONS = {
        newest:   'جدیدترین',
        oldest:   'قدیمی‌ترین',
        priority: 'اولویت',
        dueDate:  'تاریخ سررسید',
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
        tasks: [],
        filtered: [],
        page: 1,
        viewMode: VIEW_MODES.TABLE,
        sort: 'newest',
        scope: 'auto',          // auto | all | mine | overdue
        consultId: null,        // فیلتر روی یک مشاوره خاص
        filters: {
            query: '',
            status: '',
            priority: '',
            assignedTo: '',
            dueFilter: ''       // '' | 'today' | 'week' | 'overdue'
        },
        selectedIds: {},
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var TaskEvents = {
        LOADED:      'task.loaded',
        RENDERED:    'task.rendered',
        CREATED:     'task.created',
        UPDATED:     'task.updated',
        DELETED:     'task.deleted',
        STATUS:      'task.status_changed',
        ASSIGNED:    'task.assigned',
        COMPLETED:   'task.completed',
        OVERDUE:     'task.overdue',
        SELECTION:   'task.selection',
        FILTERED:    'task.filtered',
        EXPORTED:    'task.exported',
        ROW_CLICK:   'task.row_click'
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
        return (prefix || 't') + '_' + Date.now().toString(36) + '_' + r;
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

    function _isOverdue(t) {
        if (!t || !t.dueDate) return false;
        if (t.status === 'completed' || t.status === 'cancelled') return false;
        return t.dueDate < _dayStart();
    }

    function _isDueToday(t) {
        if (!t || !t.dueDate) return false;
        if (t.status === 'completed' || t.status === 'cancelled') return false;
        var today = _dayStart();
        return t.dueDate >= today && t.dueDate <= _dayEnd();
    }

    function _isDueThisWeek(t) {
        if (!t || !t.dueDate) return false;
        if (t.status === 'completed' || t.status === 'cancelled') return false;
        var now = Date.now();
        var week = 7 * 24 * 60 * 60 * 1000;
        return t.dueDate >= now && t.dueDate <= now + week;
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری / ذخیره
    // ─────────────────────────────────────
    function _loadAll() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(TASKS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveAll(list) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(TASKS_KEY, list);
    }

    function _findById(id) {
        for (var i = 0; i < STATE.tasks.length; i++) {
            if (STATE.tasks[i] && STATE.tasks[i].id === id) return STATE.tasks[i];
        }
        return null;
    }

    function _findUsers() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(USERS_KEY, []);
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
    // 🔎 فیلتر بر اساس نقش / scope
    // ─────────────────────────────────────
    function _filterByRole(list) {
        var role = STATE.role;
        var userId = STATE.userId;

        if (role === 'admin' || role === 'super_admin') return list;

        if (role === 'verifier') {
            return list.filter(function (t) {
                if (!t) return false;
                if (!t.assignedTo) return true;
                if (t.assignedTo === userId) return true;
                if (t.createdBy === userId) return true;
                return false;
            });
        }

        if (role === 'broker' || role === 'applicant') {
            return list.filter(function (t) {
                if (!t) return false;
                if (t.assignedTo === userId) return true;
                if (t.createdBy === userId) return true;
                return false;
            });
        }
        return list;
    }

    function _applyScope(list) {
        var scope = STATE.scope;
        if (scope === 'all') return list;
        if (scope === 'mine') {
            return list.filter(function (t) {
                return t && (t.assignedTo === STATE.userId ||
                             t.createdBy === STATE.userId);
            });
        }
        if (scope === 'overdue') {
            return list.filter(function (t) { return _isOverdue(t); });
        }
        return list;
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر پیشرفته
    // ─────────────────────────────────────
    function _applyFilters() {
        var f = STATE.filters;
        var q = (f.query || '').toLowerCase().trim();

        STATE.filtered = STATE.tasks.filter(function (t) {
            if (!t) return false;

            if (STATE.consultId && t.consultationId !== STATE.consultId) {
                return false;
            }
            if (q) {
                var hay = [t.title, t.description, t.consultationId,
                           _findUserName(t.assignedTo)]
                    .filter(Boolean).join(' ').toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            if (f.status && t.status !== f.status) return false;
            if (f.priority && t.priority !== f.priority) return false;
            if (f.assignedTo) {
                if (f.assignedTo === '__unassigned__') {
                    if (t.assignedTo) return false;
                } else if (t.assignedTo !== f.assignedTo) {
                    return false;
                }
            }
            if (f.dueFilter === 'today' && !_isDueToday(t)) return false;
            if (f.dueFilter === 'week' && !_isDueThisWeek(t)) return false;
            if (f.dueFilter === 'overdue' && !_isOverdue(t)) return false;

            return true;
        });

        _applySort();
        _emit(TaskEvents.FILTERED, {
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
            if (s === 'priority') {
                var pa = PRIORITY_ORDER[a.priority] || 0;
                var pb = PRIORITY_ORDER[b.priority] || 0;
                if (pa !== pb) return pb - pa;
                return (a.dueDate || Infinity) - (b.dueDate || Infinity);
            }
            if (s === 'dueDate') {
                var da = a.dueDate || Infinity;
                var db = b.dueDate || Infinity;
                return da - db;
            }
            if (s === 'status') {
                var order = { pending: 1, in_progress: 2, completed: 3, cancelled: 4 };
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
            total: STATE.tasks.length,
            filtered: STATE.filtered.length,
            pending: 0, inProgress: 0, completed: 0, cancelled: 0,
            overdue: 0, dueToday: 0, urgent: 0
        };
        for (var i = 0; i < STATE.tasks.length; i++) {
            var t = STATE.tasks[i];
            if (!t) continue;
            var st = t.status || 'pending';
            if (st === 'pending') s.pending++;
            else if (st === 'in_progress') s.inProgress++;
            else if (st === 'completed') s.completed++;
            else if (st === 'cancelled') s.cancelled++;

            if (_isOverdue(t)) s.overdue++;
            if (_isDueToday(t)) s.dueToday++;
            if (t.priority === 'urgent') s.urgent++;
        }
        return s;
    }

    function computeProgress(consultationId) {
        var total = 0, completed = 0;
        for (var i = 0; i < STATE.tasks.length; i++) {
            var t = STATE.tasks[i];
            if (!t) continue;
            if (consultationId && t.consultationId !== consultationId) continue;
            total++;
            if (t.status === 'completed') completed++;
        }
        return {
            total: total,
            completed: completed,
            percent: total > 0 ? Math.round((completed / total) * 100) : 0
        };
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
        _emit(TaskEvents.SELECTION, { count: _getSelectedIds().length });
        return _getSelectedIds().length;
    }

    function clearSelection() {
        STATE.selectedIds = {};
        _emit(TaskEvents.SELECTION, { count: 0 });
        return true;
    }

    // ─────────────────────────────────────
    // 🎯 CRUD
    // ─────────────────────────────────────
    function create(data, options) {
        options = options || {};
        var result = { ok: false, reason: null, task: null, errors: null };

        var errors = _validate(data);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        var user = _user();
        var now = Date.now();

        var task = {
            id: _genId('task'),
            consultationId: data.consultationId || null,
            title: String(data.title).trim(),
            description: String(data.description || '').trim(),
            status: data.status || 'pending',
            priority: data.priority || 'normal',
            dueDate: data.dueDate ? Number(data.dueDate) : null,
            assignedTo: data.assignedTo || null,
            assignedToName: data.assignedTo
                ? _findUserName(data.assignedTo) : null,
            tags: Array.isArray(data.tags) ? data.tags.slice() : [],
            createdBy: user ? user.id : null,
            createdByName: user ? (user.name || user.username) : null,
            createdAt: now,
            updatedAt: now,
            completedAt: null,
            completedBy: null
        };

        var all = _loadAll();
        all.push(task);
        if (!_saveAll(all)) {
            result.reason = 'storage_error';
            return result;
        }

        STATE.tasks.push(task);
        _emit(TaskEvents.CREATED, { task: task, at: now });

        result.ok = true;
        result.task = task;
        return result;
    }

    function update(id, patch, options) {
        options = options || {};
        var result = { ok: false, reason: null, task: null, errors: null };

        var t = _findById(id);
        if (!t) { result.reason = 'not_found'; return result; }
        if (!canEdit(t)) { result.reason = 'forbidden'; return result; }

        if (patch.title !== undefined &&
            String(patch.title).trim().length < 3) {
            result.reason = 'validation';
            result.errors = { title: 'عنوان حداقل ۳ کاراکتر' };
            return result;
        }

        var allowed = ['title', 'description', 'priority', 'dueDate',
                       'consultationId', 'tags'];
        for (var i = 0; i < allowed.length; i++) {
            var k = allowed[i];
            if (patch[k] !== undefined) t[k] = patch[k];
        }
        if (patch.dueDate !== undefined && patch.dueDate !== null) {
            t.dueDate = Number(patch.dueDate) || null;
        }
        t.updatedAt = Date.now();
        t.updatedBy = _uid();

        if (!_persist(t)) {
            result.reason = 'storage_error';
            return result;
        }

        result.ok = true;
        result.task = t;
        _emit(TaskEvents.UPDATED, { task: t, at: Date.now() });
        return result;
    }

    function remove(id) {
        var t = _findById(id);
        if (!t) return { ok: false, reason: 'not_found' };
        if (!canDelete(t)) return { ok: false, reason: 'forbidden' };

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

        for (var j = STATE.tasks.length - 1; j >= 0; j--) {
            if (STATE.tasks[j].id === id) {
                STATE.tasks.splice(j, 1);
                break;
            }
        }
        delete STATE.selectedIds[id];

        _emit(TaskEvents.DELETED, { task: removed, at: Date.now() });
        return { ok: true, task: removed };
    }

    function changeStatus(id, newStatus, options) {
        options = options || {};
        var t = _findById(id);
        if (!t) return { ok: false, reason: 'not_found' };
        if (!canManageStatus(t)) return { ok: false, reason: 'forbidden' };
        if (!STATUS_LABELS[newStatus]) return { ok: false, reason: 'invalid_status' };

        var prev = t.status;
        t.status = newStatus;
        t.updatedAt = Date.now();
        t.updatedBy = _uid();

        if (newStatus === 'completed') {
            t.completedAt = Date.now();
            t.completedBy = _uid();
            _emit(TaskEvents.COMPLETED, { task: t, at: Date.now() });
        } else {
            t.completedAt = null;
            t.completedBy = null;
        }

        if (!_persist(t)) return { ok: false, reason: 'storage_error' };

        _emit(TaskEvents.STATUS, {
            task: t, from: prev, to: newStatus, at: Date.now()
        });
        return { ok: true, task: t };
    }

    function assignTo(id, assigneeId) {
        var t = _findById(id);
        if (!t) return { ok: false, reason: 'not_found' };
        if (!canAssign(t)) return { ok: false, reason: 'forbidden' };

        t.assignedTo = assigneeId || null;
        t.assignedToName = assigneeId ? _findUserName(assigneeId) : null;
        t.assignedAt = Date.now();
        t.assignedBy = _uid();
        t.updatedAt = Date.now();

        if (!_persist(t)) return { ok: false, reason: 'storage_error' };

        _emit(TaskEvents.ASSIGNED, {
            task: t, assigneeId: assigneeId, at: Date.now()
        });
        return { ok: true, task: t };
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
        if (!found) return false;
        return _saveAll(all);
    }

    // ─────────────────────────────────────
    // 🔒 دسترسی
    // ─────────────────────────────────────
    function canCreate() {
        return STATE.role === 'admin' || STATE.role === 'super_admin' ||
               STATE.role === 'verifier';
    }

    function canEdit(t) {
        if (!t) return false;
        if (STATE.role === 'admin' || STATE.role === 'super_admin') return true;
        if (STATE.role === 'verifier') {
            if (t.createdBy === STATE.userId) return true;
            if (t.assignedTo === STATE.userId) return true;
        }
        return false;
    }

    function canDelete(t) {
        if (!t) return false;
        if (STATE.role === 'admin' || STATE.role === 'super_admin') return true;
        if (t.createdBy === STATE.userId && t.status === 'pending') return true;
        return false;
    }

    function canManageStatus(t) {
        if (!t) return false;
        if (STATE.role === 'admin' || STATE.role === 'super_admin') return true;
        if (STATE.role === 'verifier' &&
            (t.assignedTo === STATE.userId || t.createdBy === STATE.userId)) {
            return true;
        }
        return false;
    }

    function canAssign(t) {
        if (!t) return false;
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
        if (data.description &&
            String(data.description).length > 2000) {
            e.description = 'توضیحات حداکثر ۲۰۰۰ کاراکتر';
        }
        if (!data.consultationId) {
            e.consultationId = 'شناسه مشاوره الزامی است';
        }
        return e;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — آمار
    // ─────────────────────────────────────
    function _renderStats() {
        var s = computeStats();
        return '<div class="wam-tasks__stats">' +
            '<div class="wam-tasks__stat"><span>کل:</span> <strong>' +
                _fa(s.total) + '</strong></div>' +
            '<div class="wam-tasks__stat"><span>در انتظار:</span> <strong>' +
                _fa(s.pending) + '</strong></div>' +
            '<div class="wam-tasks__stat"><span>در انجام:</span> <strong>' +
                _fa(s.inProgress) + '</strong></div>' +
            '<div class="wam-tasks__stat"><span>انجام‌شده:</span> <strong>' +
                _fa(s.completed) + '</strong></div>' +
            '<div class="wam-tasks__stat wam-tasks__stat--overdue">' +
                '<span>عقب‌افتاده:</span> <strong>' +
                _fa(s.overdue) + '</strong></div>' +
            '<div class="wam-tasks__stat wam-tasks__stat--urgent">' +
                '<span>فوری:</span> <strong>' +
                _fa(s.urgent) + '</strong></div>' +
        '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نوار ابزار
    // ─────────────────────────────────────
    function _renderToolbar() {
        var selected = _getSelectedIds().length;

        var html = '<div class="wam-tasks__toolbar">';
        html += '<div class="wam-tasks__filters">';

        html += '<input type="search" data-tasks="search" ' +
                'placeholder="🔍 جستجو..." value="' + _esc(STATE.filters.query) + '">';

        html += '<select data-tasks="filter-status">' +
                '<option value="">همه وضعیت‌ها</option>';
        for (var st in STATUS_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(STATUS_LABELS, st)) continue;
            html += '<option value="' + st + '"' +
                (STATE.filters.status === st ? ' selected' : '') + '>' +
                _esc(STATUS_LABELS[st]) + '</option>';
        }
        html += '</select>';

        html += '<select data-tasks="filter-priority">' +
                '<option value="">همه اولویت‌ها</option>';
        for (var pr in PRIORITY_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(PRIORITY_LABELS, pr)) continue;
            html += '<option value="' + pr + '"' +
                (STATE.filters.priority === pr ? ' selected' : '') + '>' +
                _esc(PRIORITY_LABELS[pr]) + '</option>';
        }
        html += '</select>';

        html += '<select data-tasks="filter-due">' +
                '<option value="">همه</option>' +
                '<option value="today"' +
                (STATE.filters.dueFilter === 'today' ? ' selected' : '') + '>امروز</option>' +
                '<option value="week"' +
                (STATE.filters.dueFilter === 'week' ? ' selected' : '') + '>این هفته</option>' +
                '<option value="overdue"' +
                (STATE.filters.dueFilter === 'overdue' ? ' selected' : '') + '>عقب‌افتاده</option>' +
                '</select>';

        html += '<select data-tasks="sort">';
        for (var sk in SORT_OPTIONS) {
            if (!Object.prototype.hasOwnProperty.call(SORT_OPTIONS, sk)) continue;
            html += '<option value="' + sk + '"' +
                (STATE.sort === sk ? ' selected' : '') + '>' +
                _esc(SORT_OPTIONS[sk]) + '</option>';
        }
        html += '</select>';

        html += '<button class="wam-btn-icon" data-tasks-action="toggle-view" ' +
                'title="حالت نمایش">' +
                (STATE.viewMode === 'table' ? '🃏' : '📋') + '</button>';

        html += '<button class="wam-btn-icon" data-tasks-action="refresh" ' +
                'title="بروزرسانی">🔄</button>';

        if (selected > 0) {
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-tasks-action="clear-selection">لغو</button>';
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-tasks-action="bulk-complete">✅ انجام شد</button>';
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-tasks-action="export-selected">📤 (' +
                    _fa(selected) + ')</button>';
        } else {
            if (canCreate()) {
                html += '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
                        'data-tasks-action="new">➕ تسک جدید</button>';
            }
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-tasks-action="export">📤 CSV</button>';
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
                (STATE.tasks.length === 0
                    ? 'هیچ تسکی وجود ندارد.'
                    : 'نتیجه‌ای برای فیلتر فعلی یافت نشد.') +
                '</div>';
        }

        var html = '<div class="wam-tasks__table-wrap">' +
            '<table class="wam-tasks__table"><thead><tr>';

        html += '<th class="wam-tasks__check">' +
                '<input type="checkbox" data-tasks="select-all"' +
                (_getSelectedIds().length > 0 ? ' checked' : '') + '></th>';
        html += '<th>عنوان</th>';
        html += '<th>مشاوره</th>';
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

    function _renderRow(t) {
        var st = t.status || 'pending';
        var pr = t.priority || 'normal';
        var selected = !!STATE.selectedIds[t.id];
        var overdue = _isOverdue(t);
        var dueToday = _isDueToday(t);

        var rowClass = (selected ? ' is-selected' : '') +
                       (overdue ? ' is-overdue' : '') +
                       (dueToday && !overdue ? ' is-due-today' : '');

        var html = '<tr data-tasks-id="' + _esc(t.id) + '" class="' +
                   rowClass.trim() + '">';

        html += '<td><input type="checkbox" data-tasks="select-row"' +
                (selected ? ' checked' : '') + '></td>';

        html += '<td class="wam-tasks__title">' +
                (overdue ? '⏰ ' : '') +
                _esc(_truncate(t.title, 50)) + '</td>';

        html += '<td>' + _esc(t.consultationId || '—') + '</td>';

        html += '<td><span class="wam-tasks__priority wam-tasks__priority--' +
                _esc(pr) + '">' + _esc(_priorityLabel(pr)) + '</span></td>';

        html += '<td><span class="wam-badge wam-badge--' + _esc(st) + '">' +
                _esc(_statusLabel(st)) + '</span></td>';

        html += '<td>' + _esc(t.assignedToName ||
                _findUserName(t.assignedTo)) + '</td>';

        html += '<td class="wam-tasks__due' +
                (overdue ? ' is-overdue' : '') + '">' +
                _esc(t.dueDate ? _jalali(t.dueDate) : '—') +
                (overdue ? ' ⏰' : '') + '</td>';

        html += '<td class="wam-tasks__actions">';
        html += '<button class="wam-btn-icon" data-tasks-row-action="view" ' +
                'title="مشاهده">👁️</button>';

        if (st !== 'completed' && canManageStatus(t)) {
            html += '<button class="wam-btn-icon" data-tasks-row-action="complete" ' +
                    'title="انجام شد">✅</button>';
        }
        if (canEdit(t)) {
            html += '<button class="wam-btn-icon" data-tasks-row-action="edit" ' +
                    'title="ویرایش">✏️</button>';
        }
        if (canDelete(t)) {
            html += '<button class="wam-btn-icon wam-btn-icon--danger" ' +
                    'data-tasks-row-action="delete" title="حذف">🗑️</button>';
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

        var html = '<div class="wam-tasks__cards">';
        for (var i = 0; i < items.length; i++) {
            html += _renderCard(items[i]);
        }
        html += '</div>';
        return html;
    }

    function _renderCard(t) {
        var st = t.status || 'pending';
        var pr = t.priority || 'normal';
        var selected = !!STATE.selectedIds[t.id];
        var overdue = _isOverdue(t);

        return '<div class="wam-tasks__card' +
            (selected ? ' is-selected' : '') +
            (overdue ? ' is-overdue' : '') +
            '" data-tasks-id="' + _esc(t.id) + '">' +
            '<div class="wam-tasks__card-head">' +
                '<input type="checkbox" data-tasks="select-row"' +
                (selected ? ' checked' : '') + '>' +
                '<span class="wam-badge wam-badge--' + _esc(st) + '">' +
                _esc(_statusLabel(st)) + '</span>' +
                '<span class="wam-tasks__priority wam-tasks__priority--' +
                _esc(pr) + '">' + _esc(_priorityLabel(pr)) + '</span>' +
            '</div>' +
            '<div class="wam-tasks__card-title">' +
                (overdue ? '⏰ ' : '') + _esc(t.title) + '</div>' +
            (t.description ?
                '<div class="wam-tasks__card-desc">' +
                _esc(_truncate(t.description, 100)) + '</div>' : '') +
            '<div class="wam-tasks__card-rows">' +
                '<div><span>مشاوره:</span> ' +
                _esc(t.consultationId || '—') + '</div>' +
                '<div><span>مسئول:</span> ' +
                _esc(t.assignedToName || _findUserName(t.assignedTo)) + '</div>' +
                '<div><span>سررسید:</span> ' +
                _esc(t.dueDate ? _jalali(t.dueDate) : '—') + '</div>' +
            '</div>' +
            '<div class="wam-tasks__card-foot">' +
                '<span>' + _esc(_relTime(t.createdAt)) + '</span>' +
                '<div class="wam-tasks__card-actions">' +
                    (st !== 'completed' && canManageStatus(t) ?
                        '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
                        'data-tasks-row-action="complete">✅</button>' : '') +
                    '<button class="wam-btn wam-btn--sm" ' +
                    'data-tasks-row-action="view">مشاهده</button>' +
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
        var html = '<div class="wam-tasks__pagination">';
        html += '<button data-tasks-page="' + (p - 1) + '"' +
                (p === 1 ? ' disabled' : '') + '>‹</button>';
        var start = Math.max(1, p - 2);
        var end = Math.min(pages, p + 2);
        if (start > 1) {
            html += '<button data-tasks-page="1">' + _fa(1) + '</button>';
            if (start > 2) html += '<span>…</span>';
        }
        for (var i = start; i <= end; i++) {
            html += '<button data-tasks-page="' + i + '"' +
                    (i === p ? ' class="is-active"' : '') + '>' +
                    _fa(i) + '</button>';
        }
        if (end < pages) {
            if (end < pages - 1) html += '<span>…</span>';
            html += '<button data-tasks-page="' + pages + '">' +
                    _fa(pages) + '</button>';
        }
        html += '<button data-tasks-page="' + (p + 1) + '"' +
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
            '<div class="wam-tasks">' +
                _renderStats() +
                _renderToolbar() +
                '<div class="wam-tasks__body">' + body + '</div>' +
                _renderPagination(STATE.filtered.length) +
            '</div>';

        STATE.root.innerHTML = html;
        _bindEvents();

        _emit(TaskEvents.RENDERED, {
            count: STATE.filtered.length, at: Date.now()
        });
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents() {
        if (!STATE.root) return;

        var searchEl = STATE.root.querySelector('[data-tasks="search"]');
        if (searchEl) {
            searchEl.addEventListener('input', function () {
                STATE.filters.query = this.value;
                STATE.page = 1;
                render();
            });
        }

        var statusEl = STATE.root.querySelector('[data-tasks="filter-status"]');
        if (statusEl) {
            statusEl.addEventListener('change', function () {
                STATE.filters.status = this.value;
                STATE.page = 1;
                render();
            });
        }

        var priorityEl = STATE.root.querySelector('[data-tasks="filter-priority"]');
        if (priorityEl) {
            priorityEl.addEventListener('change', function () {
                STATE.filters.priority = this.value;
                STATE.page = 1;
                render();
            });
        }

        var dueEl = STATE.root.querySelector('[data-tasks="filter-due"]');
        if (dueEl) {
            dueEl.addEventListener('change', function () {
                STATE.filters.dueFilter = this.value;
                STATE.page = 1;
                render();
            });
        }

        var sortEl = STATE.root.querySelector('[data-tasks="sort"]');
        if (sortEl) {
            sortEl.addEventListener('change', function () {
                STATE.sort = this.value;
                render();
            });
        }

        var actionBtns = STATE.root.querySelectorAll('[data-tasks-action]');
        for (var i = 0; i < actionBtns.length; i++) {
            if (actionBtns[i].dataset.bound) continue;
            actionBtns[i].addEventListener('click', _handleAction);
            actionBtns[i].dataset.bound = '1';
        }

        var selectAll = STATE.root.querySelector('[data-tasks="select-all"]');
        if (selectAll) selectAll.addEventListener('change', _handleSelectAll);

        var rowChecks = STATE.root.querySelectorAll('[data-tasks="select-row"]');
        for (var j = 0; j < rowChecks.length; j++) {
            rowChecks[j].addEventListener('change', _handleRowSelect);
        }

        var rowBtns = STATE.root.querySelectorAll('[data-tasks-row-action]');
        for (var k = 0; k < rowBtns.length; k++) {
            rowBtns[k].addEventListener('click', _handleRowAction);
        }

        var pageBtns = STATE.root.querySelectorAll('[data-tasks-page]');
        for (var m = 0; m < pageBtns.length; m++) {
            pageBtns[m].addEventListener('click', _handlePageClick);
        }
    }

    function _handleAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-tasks-action');

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
        if (a === 'bulk-complete') { _confirmBulkComplete(); return; }
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
        _emit(TaskEvents.SELECTION, { count: _getSelectedIds().length });
    }

    function _handleRowSelect(e) {
        e.stopPropagation();
        var container = this.closest('[data-tasks-id]');
        if (!container) return;
        var id = container.getAttribute('data-tasks-id');
        if (this.checked) STATE.selectedIds[id] = true;
        else delete STATE.selectedIds[id];
        render();
        _emit(TaskEvents.SELECTION, { count: _getSelectedIds().length });
    }

    function _handleRowAction(e) {
        e.preventDefault();
        e.stopPropagation();
        var action = this.getAttribute('data-tasks-row-action');
        var container = this.closest('[data-tasks-id]');
        if (!container) return;
        var id = container.getAttribute('data-tasks-id');
        if (!id) return;

        if (action === 'view') openDetail(id);
        else if (action === 'edit') openForm(id);
        else if (action === 'complete') _quickComplete(id);
        else if (action === 'delete') _confirmDelete(id);
    }

    function _handlePageClick() {
        var p = parseInt(this.getAttribute('data-tasks-page'), 10);
        if (isNaN(p) || p < 1) return;
        STATE.page = p;
        render();
    }

    function _quickComplete(id) {
        var r = changeStatus(id, 'completed');
        if (r.ok) {
            _toast('success', 'تسک انجام شد ✓', 'موفق');
            reload();
        } else {
            _toast('error', 'خطا در انجام تسک', 'خطا');
        }
    }

    function _confirmBulkComplete() {
        var ids = _getSelectedIds();
        if (ids.length === 0) return;
        var msg = _fa(ids.length) + ' تسک به‌عنوان «انجام‌شده» علامت بزنند؟';
        var doIt = function () {
            var ok = 0;
            for (var i = 0; i < ids.length; i++) {
                var r = changeStatus(ids[i], 'completed');
                if (r.ok) ok++;
            }
            clearSelection();
            _toast('success', _fa(ok) + ' تسک انجام شد', 'موفق');
            reload();
        };
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('انجام گروهی', msg).then(function (ok) {
                if (ok) doIt();
            });
        } else if (window.confirm(msg)) {
            doIt();
        }
    }

    // ─────────────────────────────────────
    // 👁️ نمایش جزئیات
    // ─────────────────────────────────────
    function openDetail(id) {
        var t = _findById(id);
        if (!t) return;

        _emit(TaskEvents.ROW_CLICK, { id: id, action: 'view' });

        var existing = document.getElementById('wamTaskDetailModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var overdue = _isOverdue(t);

        var modal = document.createElement('div');
        modal.id = 'wamTaskDetailModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<div>' +
                        '<h3>📋 ' + _esc(t.title) + '</h3>' +
                        '<span class="wam-badge wam-badge--' + _esc(t.status) + '">' +
                        _esc(_statusLabel(t.status)) + '</span> ' +
                        '<span class="wam-tasks__priority wam-tasks__priority--' +
                        _esc(t.priority) + '">' +
                        _esc(_priorityLabel(t.priority)) + '</span>' +
                    '</div>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<div class="wam-modal__body">' +
                    _detailRow('مشاوره', t.consultationId || '—') +
                    _detailRow('مسئول', t.assignedToName ||
                        _findUserName(t.assignedTo)) +
                    _detailRow('سررسید',
                        (t.dueDate ? _jalali(t.dueDate) : '—') +
                        (overdue ? ' (عقب‌افتاده)' : '')) +
                    _detailRow('ایجادکننده',
                        t.createdByName || _findUserName(t.createdBy)) +
                    _detailRow('تاریخ ایجاد', _jalali(t.createdAt)) +
                    (t.completedAt ?
                        _detailRow('انجام‌شده در', _jalali(t.completedAt)) : '') +
                    (t.description ?
                        '<div class="wam-tasks__detail-desc">' +
                        _esc(t.description).replace(/\n/g, '<br>') +
                        '</div>' : '') +
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

    function _detailRow(label, value) {
        return '<div class="wam-tasks__detail-row">' +
            '<span class="wam-tasks__detail-label">' +
            _esc(label) + ':</span>' +
            '<span class="wam-tasks__detail-value">' +
            _esc(value === null || value === undefined || value === '' ? '—' : value) +
            '</span></div>';
    }

    // ─────────────────────────────────────
    // ➕ فرم
    // ─────────────────────────────────────
    function openForm(id) {
        var editMode = !!id;
        var t = editMode ? _findById(id) : null;
        if (editMode && !t) return;
        if (editMode && !canEdit(t)) {
            _toast('error', 'دسترسی ندارید', 'خطا');
            return;
        }
        if (!editMode && !canCreate()) {
            _toast('error', 'دسترسی ندارید', 'خطا');
            return;
        }

        var existing = document.getElementById('wamTaskFormModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var data = t || {};
        var defaultConsultId = STATE.consultId || data.consultationId || '';

        var prioOpts = '';
        var plist = ['low', 'normal', 'high', 'urgent'];
        for (var i = 0; i < plist.length; i++) {
            prioOpts += '<option value="' + plist[i] + '"' +
                (data.priority === plist[i] ||
                 (!data.priority && plist[i] === 'normal') ? ' selected' : '') + '>' +
                _esc(PRIORITY_LABELS[plist[i]]) + '</option>';
        }

        var statusOpts = '';
        for (var s in STATUS_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(STATUS_LABELS, s)) continue;
            statusOpts += '<option value="' + s + '"' +
                (data.status === s ||
                 (!data.status && s === 'pending') ? ' selected' : '') + '>' +
                _esc(STATUS_LABELS[s]) + '</option>';
        }

        // کاربران قابل انتخاب
        var users = _findUsers().filter(function (u) {
            return u && (u.role === 'admin' || u.role === 'super_admin' ||
                        u.role === 'verifier') && u.active !== false;
        });
        var userOpts = '<option value="">— بدون مسئول —</option>';
        for (var j = 0; j < users.length; j++) {
            userOpts += '<option value="' + _esc(users[j].id) + '"' +
                (data.assignedTo === users[j].id ? ' selected' : '') + '>' +
                _esc(users[j].name || users[j].username) + '</option>';
        }

        var dueVal = data.dueDate ? _jalali(data.dueDate) : '';

        var modal = document.createElement('div');
        modal.id = 'wamTaskFormModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>' + (editMode ? 'ویرایش تسک' : 'تسک جدید') + '</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form class="wam-modal__body">' +
                    '<div class="wam-field"><label>عنوان *</label>' +
                        '<input name="title" value="' +
                        _esc(data.title || '') + '">' +
                        '<div class="wam-field__error" data-error="title"></div></div>' +

                    '<div class="wam-field"><label>مشاوره *</label>' +
                        '<input name="consultationId" value="' +
                        _esc(defaultConsultId) + '" placeholder="CN-XXXX یا شناسه" ' +
                        (STATE.consultId ? 'readonly' : '') + '>' +
                        '<div class="wam-field__error" data-error="consultationId"></div></div>' +

                    '<div class="wam-field"><label>توضیحات</label>' +
                        '<textarea name="description" rows="3">' +
                        _esc(data.description || '') + '</textarea></div>' +

                    '<div class="wam-field-row">' +
                        '<div class="wam-field"><label>اولویت</label>' +
                            '<select name="priority">' + prioOpts + '</select></div>' +
                        '<div class="wam-field"><label>وضعیت</label>' +
                            '<select name="status"' +
                            (editMode ? '' : ' disabled') + '>' +
                            statusOpts + '</select></div>' +
                    '</div>' +

                    '<div class="wam-field-row">' +
                        '<div class="wam-field"><label>مسئول</label>' +
                            '<select name="assignedTo">' + userOpts + '</select></div>' +
                        '<div class="wam-field"><label>سررسید</label>' +
                            '<input name="dueDate" data-persian-date value="' +
                            _esc(dueVal) + '" placeholder="1405/01/15"></div>' +
                    '</div>' +

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

        // Persian datepicker
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
            consultationId: form.querySelector('[name="consultationId"]').value.trim(),
            description: form.querySelector('[name="description"]').value.trim(),
            priority: form.querySelector('[name="priority"]').value,
            assignedTo: form.querySelector('[name="assignedTo"]').value || null,
            dueDate: dueTs
        };

        if (!editMode) {
            var statusEl = form.querySelector('[name="status"]');
            // در حالت ایجاد، همیشه pending
            data.status = 'pending';
        }

        var res = editMode ? update(id, data) : create(data);

        if (!res.ok) {
            _showFormErrors(form, res.errors || { general: 'خطا: ' + res.reason });
            return;
        }

        // اگر ارجاع داده شده و در حالت edit نبود
        if (!editMode && data.assignedTo) {
            assignTo(res.task.id, data.assignedTo);
        }

        var modal = document.getElementById('wamTaskFormModal');
        if (modal && modal.parentNode) modal.parentNode.removeChild(modal);

        _toast('success', editMode ? 'تسک به‌روزرسانی شد' : 'تسک ثبت شد', 'موفق');
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
        var t = _findById(id);
        if (!t) return;
        var msg = 'تسک «' + _truncate(t.title, 40) + '» حذف شود؟';
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
            WamUI.confirm('حذف تسک', msg, { danger: true })
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
            list = STATE.tasks.filter(function (t) {
                return t && options.ids.indexOf(t.id) !== -1;
            });
        } else {
            list = STATE.filtered;
        }

        if (list.length === 0) {
            _toast('warning', 'داده‌ای برای خروجی نیست', 'توجه');
            return { ok: false, reason: 'empty' };
        }

        var headers = ['عنوان', 'مشاوره', 'اولویت', 'وضعیت',
                       'مسئول', 'سررسید', 'تاریخ ایجاد'];
        var rows = [headers];

        for (var i = 0; i < list.length; i++) {
            var t = list[i];
            rows.push([
                t.title || '',
                t.consultationId || '',
                _priorityLabel(t.priority),
                _statusLabel(t.status),
                t.assignedToName || _findUserName(t.assignedTo),
                t.dueDate ? _jalali(t.dueDate) : '',
                _jalali(t.createdAt)
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
            _emit(TaskEvents.EXPORTED, { count: list.length, at: Date.now() });
            return { ok: true, count: list.length };
        }

        var ts = new Date().toISOString().slice(0, 10);
        var filename = 'wampay-tasks-' + ts + '.csv';

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

        _emit(TaskEvents.EXPORTED, { count: list.length, at: Date.now() });
        _toast('success', _fa(list.length) + ' تسک خروجی گرفته شد', 'موفق');
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
            query: '', status: '', priority: '',
            assignedTo: '', dueFilter: ''
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
        if (scope !== 'auto' && scope !== 'all' &&
            scope !== 'mine' && scope !== 'overdue') return false;
        STATE.scope = scope;
        reload();
        return true;
    }

    function setConsultation(consultId) {
        STATE.consultId = consultId || null;
        STATE.page = 1;
        render();
        return true;
    }

    // ─────────────────────────────────────
    // 🔄 reload
    // ─────────────────────────────────────
    function reload() {
        var all = _loadAll();
        STATE.tasks = _applyScope(_filterByRole(all));

        // پاکسازی انتخاب‌های نامعتبر
        var valid = {};
        for (var i = 0; i < STATE.tasks.length; i++) {
            if (STATE.selectedIds[STATE.tasks[i].id]) {
                valid[STATE.tasks[i].id] = true;
            }
        }
        STATE.selectedIds = valid;

        render();

        // بررسی تسک‌های عقب‌افتاده
        var overdue = [];
        for (var j = 0; j < STATE.tasks.length; j++) {
            if (_isOverdue(STATE.tasks[j])) overdue.push(STATE.tasks[j]);
        }
        if (overdue.length > 0) {
            _emit(TaskEvents.OVERDUE, { count: overdue.length, tasks: overdue });
        }

        _emit(TaskEvents.LOADED, {
            count: STATE.tasks.length, role: STATE.role,
            scope: STATE.scope, at: Date.now()
        });
        return STATE.tasks.length;
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
                       document.querySelector('.wam-tasks');
            if (!root) {
                if (options.debug) console.warn('[consultation-tasks] root پیدا نشد');
                return;
            }
            STATE.root = root;

            if (options.scope) STATE.scope = options.scope;
            if (options.viewMode) STATE.viewMode = options.viewMode;
            if (options.consultationId) STATE.consultId = options.consultationId;

            reload();
            STATE.installed = true;

            if (options.debug) {
                console.log('[consultation-tasks] v' + VERSION + ' — ' +
                    STATE.role + '، ' + STATE.tasks.length + ' تسک');
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
        STATE.tasks = [];
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
            consultId: STATE.consultId,
            total: STATE.tasks.length,
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
    var WamConsultationTasks = {
        VERSION: VERSION,
        EVENTS: TaskEvents,
        ROOT_ATTR: ROOT_ATTR,
        TASKS_KEY: TASKS_KEY,
        PAGE_SIZE: PAGE_SIZE,
        STATUS_LABELS: STATUS_LABELS,
        PRIORITY_LABELS: PRIORITY_LABELS,
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

        canCreate: canCreate,
        canEdit: canEdit,
        canDelete: canDelete,
        canManageStatus: canManageStatus,
        canAssign: canAssign,

        setFilter: setFilter,
        setFilters: setFilters,
        resetFilters: resetFilters,
        setSort: setSort,
        setScope: setScope,
        setConsultation: setConsultation,

        setViewMode: function (mode) {
            if (mode !== 'table' && mode !== 'cards') return false;
            STATE.viewMode = mode;
            render();
            return true;
        },

        getTasks: function () { return STATE.tasks.slice(); },
        getFiltered: function () { return STATE.filtered.slice(); },
        computeStats: computeStats,
        computeProgress: computeProgress,

        selectAll: selectAll,
        clearSelection: clearSelection,
        getSelectedIds: _getSelectedIds,

        exportCSV: exportCSV,

        formatStatus: _statusLabel,
        formatPriority: _priorityLabel,
        isOverdue: _isOverdue,
        isDueToday: _isDueToday,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamConsultationTasks = WamConsultationTasks;
    window.ConsultationTaskEvents = TaskEvents;

    // نصب خودکار
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-consultation-tasks-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-tasks')) {
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