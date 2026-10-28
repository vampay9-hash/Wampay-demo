// ==========================================
// وام پی — Admin Panel
// فایل: admin-consultations.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: مدیریت مشاوره‌ها — لیست، افزودن، ویرایش، تغییر وضعیت، ارجاع
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var CONSULT_KEY = 'wamPayConsultations';
    var USERS_KEY   = 'wamPayUsers';
    var FORM_ID     = 'wamConsultForm';
    var PAGE_SIZE   = 20;

    var STATUS_LABELS = {
        pending:     'در انتظار',
        in_progress: 'در حال بررسی',
        completed:   'تکمیل‌شده',
        closed:      'بسته‌شده',
        cancelled:   'لغو شده'
    };

    var PRIORITY_LABELS = {
        low:    'کم',
        normal: 'معمولی',
        high:   'بالا',
        urgent: 'فوری'
    };

    var PRIORITY_ORDER = { urgent: 4, high: 3, normal: 2, low: 1 };

    var SUBJECTS = [
        'مشاوره وام', 'مشاوره مدارک', 'مشاوره اعتبارسنجی',
        'مشاوره قرارداد', 'مشاوره پرداخت', 'سایر'
    ];

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        consultations: [],
        filtered: [],
        users: [],
        page: 1,
        query: '',
        statusFilter: '',
        priorityFilter: '',
        assigneeFilter: '',
        selectedIds: {},
        editingId: null,
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var ConsultEvents = {
        LOADED:   'admin.consult.loaded',
        CREATED:  'admin.consult.created',
        UPDATED:  'admin.consult.updated',
        DELETED:  'admin.consult.deleted',
        STATUS:   'admin.consult.status_changed',
        ASSIGNED: 'admin.consult.assigned',
        EXPORTED: 'admin.consult.exported',
        FILTERED: 'admin.consult.filtered'
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
        return 'cn_' + Date.now().toString(36) + '_' + r;
    }

    function _generateCode() {
        var r = Math.random().toString(36).slice(2, 6).toUpperCase();
        return 'WP-CN-' + r;
    }

    function _statusLabel(st) { return STATUS_LABELS[st] || st || '—'; }
    function _priorityLabel(p) { return PRIORITY_LABELS[p] || p || '—'; }

    // ─────────────────────────────────────
    // 📥 بارگذاری / ذخیره
    // ─────────────────────────────────────
    function _loadConsultations() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(CONSULT_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveConsultations() {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(CONSULT_KEY, STATE.consultations);
    }

    function _loadUsers() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(USERS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر
    // ─────────────────────────────────────
    function _applyFilters() {
        var q = (STATE.query || '').toLowerCase().trim();
        var st = STATE.statusFilter;
        var pr = STATE.priorityFilter;
        var as = STATE.assigneeFilter;

        STATE.filtered = STATE.consultations.filter(function (c) {
            if (!c) return false;
            if (st && c.status !== st) return false;
            if (pr && c.priority !== pr) return false;
            if (as) {
                if (as === '__unassigned__') {
                    if (c.assignedTo) return false;
                } else if (c.assignedTo !== as) {
                    return false;
                }
            }
            if (q) {
                var hay = [
                    c.code, c.title, c.applicantName, c.applicantMobile,
                    c.brokerName, c.subject, c.description
                ].filter(Boolean).join(' ').toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            return true;
        });

        // مرتب‌سازی: اولویت، سپس زمان
        STATE.filtered.sort(function (a, b) {
            var pa = PRIORITY_ORDER[a.priority] || 0;
            var pb = PRIORITY_ORDER[b.priority] || 0;
            if (pa !== pb) return pb - pa;
            var ta = a.updatedAt || a.createdAt || 0;
            var tb = b.updatedAt || b.createdAt || 0;
            return tb - ta;
        });

        _emit(ConsultEvents.FILTERED, {
            count: STATE.filtered.length,
            query: q, status: st, priority: pr, assignee: as
        });
        return STATE.filtered;
    }

    // ─────────────────────────────────────
    // 👤 پیدا کردن نام کاربر
    // ─────────────────────────────────────
    function _getUserName(userId) {
        if (!userId) return '—';
        for (var i = 0; i < STATE.users.length; i++) {
            var u = STATE.users[i];
            if (u && u.id === userId) return u.name || u.username || '—';
        }
        return userId;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ردیف
    // ─────────────────────────────────────
    function _renderRow(c) {
        var status = c.status || 'pending';
        var priority = c.priority || 'normal';
        var isChecked = !!STATE.selectedIds[c.id];

        var html = '<tr data-consult-id="' + _escapeHtml(c.id) + '"' +
                   (isChecked ? ' class="is-selected"' : '') + '>';

        html += '<td><input type="checkbox" data-role="select" ' +
                (isChecked ? 'checked' : '') + '></td>';

        html += '<td class="wam-table__id"><code>' +
                _escapeHtml(c.code || c.id) + '</code></td>';

        html += '<td class="wam-table__name">' +
                _escapeHtml(c.title || '—') + '</td>';

        html += '<td>' + _escapeHtml(c.applicantName || '—') + '</td>';

        html += '<td>' + _escapeHtml(c.subject || '—') + '</td>';

        html += '<td><span class="wam-badge wam-badge--priority-' +
                _escapeHtml(priority) + '">' +
                _escapeHtml(_priorityLabel(priority)) + '</span></td>';

        html += '<td><span class="wam-badge wam-badge--' +
                _escapeHtml(status) + '">' +
                _escapeHtml(_statusLabel(status)) + '</span></td>';

        html += '<td>' + _escapeHtml(_getUserName(c.assignedTo)) + '</td>';

        html += '<td>' + _escapeHtml(_relativeTime(c.updatedAt || c.createdAt)) +
                '</td>';

        html += '<td class="wam-table__actions">';
        html += '<button class="wam-btn-icon" data-action="view" ' +
                'title="مشاهده">👁️</button>';
        html += '<button class="wam-btn-icon" data-action="edit" ' +
                'title="ویرایش">✏️</button>';
        html += '<button class="wam-btn-icon" data-action="status" ' +
                'title="تغییر وضعیت">🔄</button>';
        html += '<button class="wam-btn-icon" data-action="assign" ' +
                'title="ارجاع">👤</button>';
        html += '<button class="wam-btn-icon wam-btn-icon--danger" ' +
                'data-action="delete" title="حذف">🗑️</button>';
        html += '</td>';

        html += '</tr>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — جدول
    // ─────────────────────────────────────
    function _renderTable() {
        if (!STATE.root) return;
        var tbody = STATE.root.querySelector('[data-consult="tbody"]');
        if (!tbody) return;

        var list = STATE.filtered;
        var start = (STATE.page - 1) * PAGE_SIZE;
        var end = Math.min(start + PAGE_SIZE, list.length);
        var items = list.slice(start, end);

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="wam-table__empty">' +
                (STATE.consultations.length === 0
                    ? 'هیچ مشاوره‌ای ثبت نشده است.'
                    : 'نتیجه‌ای برای فیلتر فعلی یافت نشد.') +
                '</td></tr>';
        } else {
            var html = '';
            for (var i = 0; i < items.length; i++) html += _renderRow(items[i]);
            tbody.innerHTML = html;
        }

        _renderPagination();
        _renderStats();
        _updateBulkBar();
        _bindRowActions();
        _bindSelectors();
    }

    function _renderPagination() {
        if (!STATE.root) return;
        var el = STATE.root.querySelector('[data-consult="pagination"]');
        if (!el) return;

        var total = STATE.filtered.length;
        var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (pages <= 1) { el.innerHTML = ''; return; }

        var html = '<button data-page="' + (STATE.page - 1) + '"' +
                   (STATE.page === 1 ? ' disabled' : '') + '>‹ قبلی</button>';
        html += '<span>صفحه ' + _formatNumber(STATE.page) +
                ' از ' + _formatNumber(pages) + '</span>';
        html += '<button data-page="' + (STATE.page + 1) + '"' +
                (STATE.page === pages ? ' disabled' : '') + '>بعدی ›</button>';
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

    function _renderStats() {
        if (!STATE.root) return;
        var el = STATE.root.querySelector('[data-consult="stats"]');
        if (!el) return;

        var total = STATE.filtered.length;
        var pending = 0, progress = 0, done = 0, urgent = 0;

        for (var i = 0; i < STATE.filtered.length; i++) {
            var c = STATE.filtered[i];
            if (!c) continue;
            var st = c.status || 'pending';
            if (st === 'pending') pending++;
            else if (st === 'in_progress') progress++;
            else if (st === 'completed' || st === 'closed') done++;
            if (c.priority === 'urgent') urgent++;
        }

        el.innerHTML =
            '<span>نمایش: <strong>' + _formatNumber(total) + '</strong></span>' +
            '<span>در انتظار: <strong>' + _formatNumber(pending) + '</strong></span>' +
            '<span>در بررسی: <strong>' + _formatNumber(progress) + '</strong></span>' +
            '<span>پایان‌یافته: <strong>' + _formatNumber(done) + '</strong></span>' +
            '<span>فوری: <strong>' + _formatNumber(urgent) + '</strong></span>';
    }

    // ─────────────────────────────────────
    // ☑️ انتخاب‌ها
    // ─────────────────────────────────────
    function _bindSelectors() {
        if (!STATE.root) return;

        var rowChecks = STATE.root.querySelectorAll('tr[data-consult-id] [data-role="select"]');
        for (var i = 0; i < rowChecks.length; i++) {
            rowChecks[i].addEventListener('change', function () {
                var tr = this.closest('tr[data-consult-id]');
                if (!tr) return;
                var id = tr.getAttribute('data-consult-id');
                if (this.checked) STATE.selectedIds[id] = true;
                else delete STATE.selectedIds[id];
                _updateBulkBar();
            });
        }

        var allCheck = STATE.root.querySelector('[data-consult="select-all"]');
        if (allCheck && !allCheck.dataset.bound) {
            allCheck.addEventListener('change', _toggleSelectAll);
            allCheck.dataset.bound = '1';
        }

        var bulkBtns = STATE.root.querySelectorAll('[data-bulk-action]');
        for (var j = 0; j < bulkBtns.length; j++) {
            var b = bulkBtns[j];
            if (b.dataset.bound) continue;
            b.addEventListener('click', _handleBulkAction);
            b.dataset.bound = '1';
        }
    }

    function _toggleSelectAll() {
        var checked = this.checked;
        var list = STATE.filtered;
        var start = (STATE.page - 1) * PAGE_SIZE;
        var end = Math.min(start + PAGE_SIZE, list.length);
        for (var i = start; i < end; i++) {
            var id = list[i].id;
            if (checked) STATE.selectedIds[id] = true;
            else delete STATE.selectedIds[id];
        }
        _renderTable();
    }

    function _getSelectedIds() {
        var ids = [];
        for (var k in STATE.selectedIds) {
            if (Object.prototype.hasOwnProperty.call(STATE.selectedIds, k)) {
                ids.push(k);
            }
        }
        return ids;
    }

    function _updateBulkBar() {
        if (!STATE.root) return;
        var bar = STATE.root.querySelector('[data-consult="bulk-bar"]');
        if (!bar) return;
        var n = _getSelectedIds().length;
        bar.style.display = n > 0 ? 'flex' : 'none';
        var counter = bar.querySelector('[data-bulk-count]');
        if (counter) counter.textContent = _formatNumber(n) + ' انتخاب شده';
    }

    function _handleBulkAction(e) {
        e.preventDefault();
        var action = this.getAttribute('data-bulk-action');
        var ids = _getSelectedIds();
        if (ids.length === 0) return;

        if (action === 'clear') {
            STATE.selectedIds = {};
            _renderTable();
            return;
        }
        if (action === 'delete') {
            _confirmBulkDelete(ids);
        } else if (action === 'export') {
            exportConsultations({ ids: ids });
        }
    }

    // ─────────────────────────────────────
    // 🖱️ رویدادهای ردیف
    // ─────────────────────────────────────
    function _bindRowActions() {
        if (!STATE.root) return;
        var rows = STATE.root.querySelectorAll('tr[data-consult-id]');
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
        var tr = this.closest('tr[data-consult-id]');
        if (!tr) return;
        var id = tr.getAttribute('data-consult-id');

        if (action === 'view') openDetail(id);
        else if (action === 'edit') openEditForm(id);
        else if (action === 'status') openStatusModal(id);
        else if (action === 'assign') openAssignModal(id);
        else if (action === 'delete') _confirmDelete(id);
    }

    // ─────────────────────────────────────
    // ➕ افزودن
    // ─────────────────────────────────────
    function addConsultation(data, options) {
        options = options || {};
        var result = { ok: false, reason: null, consult: null, errors: null };

        var errors = _validate(data);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        var now = Date.now();
        var me = (typeof WamPermissions !== 'undefined')
            ? WamPermissions.getCurrentUser() : null;

        var consult = {
            id: _generateId(),
            code: _generateCode(),
            title: (data.title || '').trim(),
            subject: data.subject || 'سایر',
            description: (data.description || '').trim(),
            applicantName: data.applicantName || null,
            applicantMobile: data.applicantMobile
                ? String(data.applicantMobile).replace(/\D/g, '') : null,
            brokerName: data.brokerName || null,
            caseId: data.caseId || null,
            priority: data.priority || 'normal',
            status: data.status || 'pending',
            assignedTo: data.assignedTo || null,
            notes: [],
            createdAt: now,
            createdBy: me ? me.id : null,
            updatedAt: now
        };

        STATE.consultations.push(consult);
        if (!_saveConsultations()) {
            STATE.consultations.pop();
            result.reason = 'storage_error';
            return result;
        }

        result.ok = true;
        result.consult = consult;
        _emit(ConsultEvents.CREATED, { consult: consult, at: now });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('مشاوره «' + consult.title + '» ثبت شد', 'موفق');
        }
        render();
        return result;
    }

    // ─────────────────────────────────────
    // ✏️ ویرایش
    // ─────────────────────────────────────
    function updateConsultation(id, patch) {
        var result = { ok: false, reason: null, consult: null, errors: null };
        var c = _findById(id);
        if (!c) { result.reason = 'not_found'; return result; }

        var errors = _validate(patch, id);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        var fields = ['title', 'subject', 'description', 'applicantName',
                      'applicantMobile', 'brokerName', 'caseId',
                      'priority', 'status', 'assignedTo'];
        for (var i = 0; i < fields.length; i++) {
            var f = fields[i];
            if (patch[f] !== undefined) c[f] = patch[f];
        }
        if (patch.applicantMobile) {
            c.applicantMobile = String(patch.applicantMobile).replace(/\D/g, '');
        }
        c.updatedAt = Date.now();

        if (!_saveConsultations()) { result.reason = 'storage_error'; return result; }

        result.ok = true;
        result.consult = c;
        _emit(ConsultEvents.UPDATED, { consult: c, at: Date.now() });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('مشاوره به‌روزرسانی شد', 'موفق');
        }
        render();
        return result;
    }

    // ─────────────────────────────────────
    // 🗑️ حذف
    // ─────────────────────────────────────
    function deleteConsultation(id) {
        var c = _findById(id);
        if (!c) return { ok: false, reason: 'not_found' };

        var idx = -1;
        for (var i = 0; i < STATE.consultations.length; i++) {
            if (STATE.consultations[i] && STATE.consultations[i].id === id) {
                idx = i; break;
            }
        }
        if (idx === -1) return { ok: false, reason: 'not_found' };

        var removed = STATE.consultations.splice(idx, 1)[0];
        if (!_saveConsultations()) {
            STATE.consultations.splice(idx, 0, removed);
            return { ok: false, reason: 'storage_error' };
        }

        delete STATE.selectedIds[id];
        _emit(ConsultEvents.DELETED, { consult: removed, at: Date.now() });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('مشاوره حذف شد', 'موفق');
        }
        render();
        return { ok: true, consult: removed };
    }

    function bulkDelete(ids) {
        if (!Array.isArray(ids) || ids.length === 0) return { ok: false };
        var deleted = 0;
        for (var i = ids.length - 1; i >= 0; i--) {
            var r = deleteConsultation(ids[i]);
            if (r.ok) deleted++;
        }
        STATE.selectedIds = {};
        render();
        return { ok: true, deleted: deleted };
    }

    function _confirmDelete(id) {
        var c = _findById(id);
        if (!c) return;
        var msg = 'مشاوره «' + (c.title || c.code) + '» حذف شود؟';
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('حذف مشاوره', msg, { danger: true }).then(function (ok) {
                if (ok) deleteConsultation(id);
            });
        } else if (window.confirm(msg)) {
            deleteConsultation(id);
        }
    }

    function _confirmBulkDelete(ids) {
        var msg = 'حذف ' + ids.length + ' مشاوره؟';
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('حذف گروهی', msg, { danger: true }).then(function (ok) {
                if (ok) bulkDelete(ids);
            });
        } else if (window.confirm(msg)) {
            bulkDelete(ids);
        }
    }

    // ─────────────────────────────────────
    // 🔄 تغییر وضعیت
    // ─────────────────────────────────────
    function changeStatus(id, newStatus, options) {
        options = options || {};
        var c = _findById(id);
        if (!c) return { ok: false, reason: 'not_found' };

        var prev = c.status;
        c.status = newStatus;
        c.updatedAt = Date.now();
        if (options.note) {
            if (!Array.isArray(c.notes)) c.notes = [];
            c.notes.push({
                text: 'تغییر وضعیت از «' + _statusLabel(prev) +
                      '» به «' + _statusLabel(newStatus) + '»: ' + options.note,
                by: (function () {
                    if (typeof WamPermissions === 'undefined') return null;
                    var me = WamPermissions.getCurrentUser();
                    return me ? me.id : null;
                })(),
                at: Date.now()
            });
        }

        if (!_saveConsultations()) return { ok: false, reason: 'storage_error' };

        _emit(ConsultEvents.STATUS, {
            consult: c, from: prev, to: newStatus, at: Date.now()
        });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('وضعیت به «' + _statusLabel(newStatus) +
                '» تغییر کرد', 'موفق');
        }
        render();
        return { ok: true, consult: c };
    }

    function openStatusModal(id) {
        var c = _findById(id);
        if (!c) return;

        var existing = document.getElementById('wamConsultStatusModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var statuses = ['pending', 'in_progress', 'completed', 'closed', 'cancelled'];
        var opts = '';
        for (var i = 0; i < statuses.length; i++) {
            var s = statuses[i];
            opts += '<option value="' + s + '"' +
                    (s === c.status ? ' selected' : '') + '>' +
                    _statusLabel(s) + '</option>';
        }

        var modal = document.createElement('div');
        modal.id = 'wamConsultStatusModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>تغییر وضعیت — ' + _escapeHtml(c.code || id) + '</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form id="wamConsultStatusForm" class="wam-modal__body">' +
                    '<div class="wam-field"><label>وضعیت جدید</label>' +
                        '<select name="status">' + opts + '</select></div>' +
                    '<div class="wam-field"><label>یادداشت (اختیاری)</label>' +
                        '<textarea name="note" rows="3"></textarea></div>' +
                    '<footer class="wam-modal__footer">' +
                        '<button type="button" class="wam-btn wam-btn--ghost" data-close>انصراف</button>' +
                        '<button type="submit" class="wam-btn wam-btn--primary">ذخیره</button>' +
                    '</footer>' +
                '</form>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var k = 0; k < cbs.length; k++) cbs[k].addEventListener('click', _closeModal);

        var form = modal.querySelector('#wamConsultStatusForm');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var st = form.querySelector('[name="status"]').value;
                var note = form.querySelector('[name="note"]').value.trim();
                changeStatus(id, st, { note: note });
                _closeModal();
            });
        }
    }

    // ─────────────────────────────────────
    // 👤 ارجاع
    // ─────────────────────────────────────
    function assignTo(id, userId) {
        var c = _findById(id);
        if (!c) return { ok: false, reason: 'not_found' };

        c.assignedTo = userId || null;
        c.updatedAt = Date.now();
        if (!_saveConsultations()) return { ok: false, reason: 'storage_error' };

        _emit(ConsultEvents.ASSIGNED, {
            consult: c, assignedTo: userId, at: Date.now()
        });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('ارجاع انجام شد', 'موفق');
        }
        render();
        return { ok: true, consult: c };
    }

    function openAssignModal(id) {
        var c = _findById(id);
        if (!c) return;

        var existing = document.getElementById('wamConsultAssignModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        // کاربران واجد شرایط: admin, super_admin, verifier
        var eligible = STATE.users.filter(function (u) {
            if (!u) return false;
            if (u.role !== 'admin' && u.role !== 'super_admin' &&
                u.role !== 'verifier') return false;
            if (u.active === false) return false;
            return true;
        });

        var opts = '<option value="">— بدون ارجاع —</option>';
        for (var i = 0; i < eligible.length; i++) {
            var u = eligible[i];
            opts += '<option value="' + _escapeHtml(u.id) + '"' +
                    (c.assignedTo === u.id ? ' selected' : '') + '>' +
                    _escapeHtml((u.name || u.username) +
                        ' (' + (u.role === 'verifier' ? 'اعتبارسنج' : 'ادمین') + ')') +
                    '</option>';
        }

        var modal = document.createElement('div');
        modal.id = 'wamConsultAssignModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>ارجاع مشاوره — ' + _escapeHtml(c.code || id) + '</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form id="wamConsultAssignForm" class="wam-modal__body">' +
                    '<div class="wam-field"><label>ارجاع به</label>' +
                        '<select name="assignee">' + opts + '</select></div>' +
                    '<footer class="wam-modal__footer">' +
                        '<button type="button" class="wam-btn wam-btn--ghost" data-close>انصراف</button>' +
                        '<button type="submit" class="wam-btn wam-btn--primary">ذخیره</button>' +
                    '</footer>' +
                '</form>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var k = 0; k < cbs.length; k++) cbs[k].addEventListener('click', _closeModal);

        var form = modal.querySelector('#wamConsultAssignForm');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var uid = form.querySelector('[name="assignee"]').value;
                assignTo(id, uid || null);
                _closeModal();
            });
        }
    }

    // ─────────────────────────────────────
    // 👁️ نمایش جزئیات
    // ─────────────────────────────────────
    function openDetail(id) {
        var c = _findById(id);
        if (!c) return;

        var existing = document.getElementById('wamConsultDetailModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var notesHtml = '';
        if (Array.isArray(c.notes) && c.notes.length > 0) {
            notesHtml = '<ul class="wam-consult-notes">';
            for (var i = c.notes.length - 1; i >= 0; i--) {
                var n = c.notes[i];
                notesHtml += '<li>' +
                    '<div>' + _escapeHtml(n.text || '') + '</div>' +
                    '<small>' + _escapeHtml(_getUserName(n.by)) + ' — ' +
                    _escapeHtml(_relativeTime(n.at)) + '</small></li>';
            }
            notesHtml += '</ul>';
        } else {
            notesHtml = '<div class="wam-muted">یادداشتی ثبت نشده.</div>';
        }

        var modal = document.createElement('div');
        modal.id = 'wamConsultDetailModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>' + _escapeHtml(c.title || '') + '</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<div class="wam-modal__body">' +
                    '<div class="wam-consult-meta">' +
                        '<div><span>کد:</span> <code>' +
                        _escapeHtml(c.code || '—') + '</code></div>' +
                        '<div><span>موضوع:</span> ' +
                        _escapeHtml(c.subject || '—') + '</div>' +
                        '<div><span>متقاضی:</span> ' +
                        _escapeHtml(c.applicantName || '—') + '</div>' +
                        '<div><span>موبایل:</span> ' +
                        _escapeHtml(c.applicantMobile || '—') + '</div>' +
                        '<div><span>کارگزار:</span> ' +
                        _escapeHtml(c.brokerName || '—') + '</div>' +
                        '<div><span>اولویت:</span> ' +
                        _escapeHtml(_priorityLabel(c.priority)) + '</div>' +
                        '<div><span>وضعیت:</span> ' +
                        _escapeHtml(_statusLabel(c.status)) + '</div>' +
                        '<div><span>ارجاع به:</span> ' +
                        _escapeHtml(_getUserName(c.assignedTo)) + '</div>' +
                        '<div><span>ایجاد:</span> ' +
                        _escapeHtml(_jalali(c.createdAt)) + '</div>' +
                    '</div>' +
                    '<h4>توضیحات</h4>' +
                    '<p>' + _escapeHtml(c.description || '—') + '</p>' +
                    '<h4>یادداشت‌ها</h4>' +
                    notesHtml +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);
        var cbs = modal.querySelectorAll('[data-close]');
        for (var k = 0; k < cbs.length; k++) cbs[k].addEventListener('click', _closeModal);
    }

    // ─────────────────────────────────────
    // 🎯 فرم modal
    // ─────────────────────────────────────
    function openAddForm() {
        STATE.editingId = null;
        _openFormModal(null);
    }

    function openEditForm(id) {
        var c = _findById(id);
        if (!c) return;
        STATE.editingId = id;
        _openFormModal(c);
    }

    function _openFormModal(consult) {
        var existing = document.getElementById('wamConsultModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var isEdit = !!consult;
        var c = consult || {};

        var subjectOpts = '';
        for (var i = 0; i < SUBJECTS.length; i++) {
            subjectOpts += '<option value="' + SUBJECTS[i] + '"' +
                (c.subject === SUBJECTS[i] ? ' selected' : '') + '>' +
                SUBJECTS[i] + '</option>';
        }

        var priorityOpts = '';
        var plist = ['low', 'normal', 'high', 'urgent'];
        for (var j = 0; j < plist.length; j++) {
            priorityOpts += '<option value="' + plist[j] + '"' +
                (c.priority === plist[j] ? ' selected' : '') +
                (plist[j] === 'normal' && !c.priority ? ' selected' : '') + '>' +
                _priorityLabel(plist[j]) + '</option>';
        }

        var modal = document.createElement('div');
        modal.id = 'wamConsultModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>' + (isEdit ? 'ویرایش مشاوره' : 'مشاوره جدید') + '</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form id="' + FORM_ID + '" class="wam-modal__body">' +
                    '<div class="wam-field"><label>عنوان *</label>' +
                        '<input name="title" value="' +
                        _escapeHtml(c.title || '') + '" required>' +
                        '<div class="wam-field__error" data-error="title"></div></div>' +

                    '<div class="wam-field"><label>موضوع</label>' +
                        '<select name="subject">' + subjectOpts + '</select></div>' +

                    '<div class="wam-field"><label>متقاضی</label>' +
                        '<input name="applicantName" value="' +
                        _escapeHtml(c.applicantName || '') + '"></div>' +

                    '<div class="wam-field"><label>موبایل متقاضی</label>' +
                        '<input name="applicantMobile" type="tel" value="' +
                        _escapeHtml(c.applicantMobile || '') + '" placeholder="09123456789">' +
                        '<div class="wam-field__error" data-error="applicantMobile"></div></div>' +

                    '<div class="wam-field"><label>کارگزار</label>' +
                        '<input name="brokerName" value="' +
                        _escapeHtml(c.brokerName || '') + '"></div>' +

                    '<div class="wam-field"><label>شناسه پرونده (اختیاری)</label>' +
                        '<input name="caseId" value="' +
                        _escapeHtml(c.caseId || '') + '" placeholder="WP-001"></div>' +

                    '<div class="wam-field"><label>اولویت</label>' +
                        '<select name="priority">' + priorityOpts + '</select></div>' +

                    '<div class="wam-field"><label>توضیحات *</label>' +
                        '<textarea name="description" rows="4" required>' +
                        _escapeHtml(c.description || '') + '</textarea>' +
                        '<div class="wam-field__error" data-error="description"></div></div>' +

                    '<div class="wam-field__error" data-error="general"></div>' +
                    '<footer class="wam-modal__footer">' +
                        '<button type="button" class="wam-btn wam-btn--ghost" data-close>انصراف</button>' +
                        '<button type="submit" class="wam-btn wam-btn--primary">' +
                        (isEdit ? 'ذخیره' : 'ثبت') + '</button>' +
                    '</footer>' +
                '</form>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var k = 0; k < cbs.length; k++) cbs[k].addEventListener('click', _closeModal);

        var form = modal.querySelector('#' + FORM_ID);
        if (form) form.addEventListener('submit', _handleFormSubmit);
    }

    function _handleFormSubmit(e) {
        e.preventDefault();
        var form = e.target;
        var data = {
            title: form.querySelector('[name="title"]').value.trim(),
            subject: form.querySelector('[name="subject"]').value,
            applicantName: form.querySelector('[name="applicantName"]').value.trim(),
            applicantMobile: form.querySelector('[name="applicantMobile"]').value.trim(),
            brokerName: form.querySelector('[name="brokerName"]').value.trim(),
            caseId: form.querySelector('[name="caseId"]').value.trim(),
            priority: form.querySelector('[name="priority"]').value,
            description: form.querySelector('[name="description"]').value.trim()
        };

        _clearFormErrors(form);

        var res;
        if (STATE.editingId) res = updateConsultation(STATE.editingId, data);
        else res = addConsultation(data);

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

    function _closeModal() {
        var ids = ['wamConsultModal', 'wamConsultStatusModal',
                   'wamConsultAssignModal', 'wamConsultDetailModal'];
        for (var i = 0; i < ids.length; i++) {
            var m = document.getElementById(ids[i]);
            if (m && m.parentNode) m.parentNode.removeChild(m);
        }
        STATE.editingId = null;
    }

    // ─────────────────────────────────────
    // 🧾 اعتبارسنجی
    // ─────────────────────────────────────
    function _validate(data, excludeId) {
        var errors = {};
        if (!data.title || String(data.title).trim().length < 3) {
            errors.title = 'عنوان حداقل ۳ کاراکتر باشد';
        }
        if (!data.description || String(data.description).trim().length < 5) {
            errors.description = 'توضیحات حداقل ۵ کاراکتر باشد';
        }
        if (data.applicantMobile) {
            var m = String(data.applicantMobile).replace(/\D/g, '');
            if (m && !/^09\d{9}$/.test(m)) {
                errors.applicantMobile = 'موبایل نامعتبر است';
            }
        }
        return errors;
    }

    // ─────────────────────────────────────
    // 🔍 پیدا کردن
    // ─────────────────────────────────────
    function _findById(id) {
        for (var i = 0; i < STATE.consultations.length; i++) {
            if (STATE.consultations[i] && STATE.consultations[i].id === id) {
                return STATE.consultations[i];
            }
        }
        return null;
    }

    // ─────────────────────────────────────
    // 📤 خروجی CSV
    // ─────────────────────────────────────
    function exportConsultations(options) {
        options = options || {};
        var list;
        if (Array.isArray(options.ids) && options.ids.length > 0) {
            list = STATE.consultations.filter(function (c) {
                return c && options.ids.indexOf(c.id) !== -1;
            });
        } else {
            list = STATE.filtered.length > 0 ? STATE.filtered : STATE.consultations;
        }

        if (list.length === 0) {
            if (typeof WamUI !== 'undefined') WamUI.toastWarning('داده‌ای نیست', 'توجه');
            return { ok: false, reason: 'empty' };
        }

        var headers = ['کد', 'عنوان', 'موضوع', 'متقاضی', 'موبایل',
                       'کارگزار', 'اولویت', 'وضعیت', 'ارجاع به',
                       'تاریخ ایجاد', 'آخرین به‌روزرسانی'];
        var rows = [headers];

        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            rows.push([
                c.code || '',
                c.title || '',
                c.subject || '',
                c.applicantName || '',
                c.applicantMobile || '',
                c.brokerName || '',
                _priorityLabel(c.priority),
                _statusLabel(c.status),
                _getUserName(c.assignedTo),
                _jalali(c.createdAt),
                _jalali(c.updatedAt)
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
            _emit(ConsultEvents.EXPORTED, { count: list.length, at: Date.now() });
            return { ok: true, count: list.length };
        }

        var ts = new Date().toISOString().slice(0, 10);
        var filename = 'wamPay-consultations-' + ts + '.csv';

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

        _emit(ConsultEvents.EXPORTED, { count: list.length, at: Date.now() });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess(_formatNumber(list.length) + ' مشاوره خروجی گرفته شد', 'موفق');
        }
        return { ok: true, count: list.length };
    }

    // ─────────────────────────────────────
    // 🎛️ فیلترها
    // ─────────────────────────────────────
    function _bindFilters() {
        if (!STATE.root) return;

        var s = STATE.root.querySelector('[data-consult="search"]');
        if (s) s.addEventListener('input', function () {
            STATE.query = this.value; STATE.page = 1; render();
        });

        var st = STATE.root.querySelector('[data-consult="filter-status"]');
        if (st) st.addEventListener('change', function () {
            STATE.statusFilter = this.value; STATE.page = 1; render();
        });

        var pr = STATE.root.querySelector('[data-consult="filter-priority"]');
        if (pr) pr.addEventListener('change', function () {
            STATE.priorityFilter = this.value; STATE.page = 1; render();
        });

        var as = STATE.root.querySelector('[data-consult="filter-assignee"]');
        if (as) {
            _fillAssigneeFilter(as);
            as.addEventListener('change', function () {
                STATE.assigneeFilter = this.value; STATE.page = 1; render();
            });
        }

        var addBtn = STATE.root.querySelector('[data-consult-action="add"]');
        if (addBtn) addBtn.addEventListener('click', function (e) {
            e.preventDefault(); openAddForm();
        });

        var expBtn = STATE.root.querySelector('[data-consult-action="export"]');
        if (expBtn) expBtn.addEventListener('click', function (e) {
            e.preventDefault(); exportConsultations();
        });

        var refBtn = STATE.root.querySelector('[data-consult-action="refresh"]');
        if (refBtn) refBtn.addEventListener('click', function (e) {
            e.preventDefault(); reload();
        });
    }

    function _fillAssigneeFilter(selectEl) {
        var eligible = STATE.users.filter(function (u) {
            if (!u) return false;
            return u.role === 'admin' || u.role === 'super_admin' ||
                   u.role === 'verifier';
        });
        var html = '<option value="">همه</option>' +
                   '<option value="__unassigned__">بدون ارجاع</option>';
        for (var i = 0; i < eligible.length; i++) {
            var u = eligible[i];
            html += '<option value="' + _escapeHtml(u.id) + '">' +
                    _escapeHtml(u.name || u.username) + '</option>';
        }
        selectEl.innerHTML = html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;
        _applyFilters();
        _renderTable();
    }

    function reload() {
        STATE.consultations = _loadConsultations();
        STATE.users = _loadUsers();
        render();
        _emit(ConsultEvents.LOADED, {
            count: STATE.consultations.length, at: Date.now()
        });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastInfo('بروزرسانی شد', 'موفق');
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
                       document.querySelector('[data-consult-root]') ||
                       document.querySelector('.wam-consultations-panel');
            if (!root) {
                if (options.debug) console.warn('[admin-consultations] root پیدا نشد');
                return;
            }
            STATE.root = root;
            STATE.consultations = _loadConsultations();
            STATE.users = _loadUsers();

            _bindFilters();
            render();

            STATE.installed = true;
            _emit(ConsultEvents.LOADED, {
                count: STATE.consultations.length, at: Date.now()
            });
            if (options.debug) console.log('[admin-consultations] آماده، ' +
                STATE.consultations.length + ' مشاوره');
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

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            total: STATE.consultations.length,
            filtered: STATE.filtered.length,
            page: STATE.page,
            query: STATE.query,
            statusFilter: STATE.statusFilter,
            priorityFilter: STATE.priorityFilter,
            assigneeFilter: STATE.assigneeFilter,
            selected: _getSelectedIds().length
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
    var WamAdminConsultations = {
        EVENTS: ConsultEvents,
        STATUS_LABELS: STATUS_LABELS,
        PRIORITY_LABELS: PRIORITY_LABELS,
        SUBJECTS: SUBJECTS,
        PAGE_SIZE: PAGE_SIZE,
        FORM_ID: FORM_ID,

        install: install,
        uninstall: uninstall,
        reload: reload,
        render: render,

        addConsultation: addConsultation,
        updateConsultation: updateConsultation,
        deleteConsultation: deleteConsultation,
        bulkDelete: bulkDelete,
        changeStatus: changeStatus,
        assignTo: assignTo,
        exportConsultations: exportConsultations,

        openAddForm: openAddForm,
        openEditForm: openEditForm,
        openStatusModal: openStatusModal,
        openAssignModal: openAssignModal,
        openDetail: openDetail,
        closeForm: _closeModal,

        getConsultations: function () { return STATE.consultations.slice(); },
        getFiltered: function () { return STATE.filtered.slice(); },
        findById: _findById,
        getSelectedIds: _getSelectedIds,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamAdminConsultations = WamAdminConsultations;
    window.ConsultEvents = ConsultEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var body = document.body;
            if (!body) return;
            if (body.hasAttribute('data-admin-consultations') ||
                document.querySelector('[data-consult-root]') ||
                document.querySelector('.wam-consultations-panel')) {
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