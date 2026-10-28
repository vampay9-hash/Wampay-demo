// ==========================================
// وام پی — Admin Panel
// فایل: admin-cases.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: مدیریت پرونده‌ها — لیست، جستجو، فیلتر، تأیید/رد، حذف، خروجی
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var PAGE_SIZE = 20;

    var STATUS_LABELS = {
        draft:        'پیش‌نویس',
        in_progress:  'در جریان',
        pending:      'در انتظار',
        approved:     'تأییدشده',
        completed:    'تکمیل‌شده',
        rejected:     'رد شده',
        cancelled:    'لغو شده',
        archived:     'بایگانی',
        rolledback:   'بازگشت‌خورده'
    };

    var STEP_TITLES = {
        step_1: 'ثبت درخواست',
        step_2: 'بارگذاری مدارک',
        step_3: 'بررسی اولیه',
        step_4: 'اعتبارسنجی',
        step_5: 'تأیید ادمین',
        step_6: 'ارسال به بانک',
        step_7: 'تأیید بانک',
        step_8: 'تنظیم قرارداد',
        step_9: 'پرداخت'
    };

    var BANKS = [
        'ملی', 'صادرات', 'تجارت', 'سپه', 'کشاورزی', 'مسکن',
        'رسالت', 'پاسارگاد', 'پارسیان', 'سامان', 'ملت', 'رفاه'
    ];

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        cases: [],
        filtered: [],
        page: 1,
        query: '',
        statusFilter: '',
        stepFilter: '',
        bankFilter: '',
        selectedIds: {},
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var CaseEvents = {
        LOADED:      'admin.cases.loaded',
        DELETED:     'admin.cases.deleted',
        STATUS_CHG:  'admin.cases.status_changed',
        STEP_ACT:    'admin.cases.step_action',
        BULK_DEL:    'admin.cases.bulk_deleted',
        EXPORTED:    'admin.cases.exported',
        FILTERED:    'admin.cases.filtered'
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

    function _statusLabel(st) {
        return STATUS_LABELS[st] || st || '—';
    }

    function _stepTitle(stepId) {
        return STEP_TITLES[stepId] || stepId || '—';
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری
    // ─────────────────────────────────────
    function _loadCases() {
        if (typeof CaseRepository === 'undefined') return [];
        try {
            var all = CaseRepository.getAll() || [];
            return Array.isArray(all) ? all : [];
        } catch (e) {
            console.error('[admin-cases] خطا در بارگذاری:', e);
            return [];
        }
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر
    // ─────────────────────────────────────
    function _applyFilters() {
        var q = (STATE.query || '').toLowerCase().trim();
        var st = STATE.statusFilter;
        var sp = STATE.stepFilter;
        var bk = STATE.bankFilter;

        STATE.filtered = STATE.cases.filter(function (c) {
            if (!c) return false;
            if (st && (c.status || 'draft') !== st) return false;
            if (sp && (c.currentStep || '') !== sp) return false;
            if (bk && c.bank !== bk) return false;
            if (q) {
                var hay = [
                    c.caseId, c.applicantName, c.applicantMobile,
                    c.bank, c.brokerName, c.nationalCode
                ].filter(Boolean).join(' ').toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            return true;
        });

        // مرتب‌سازی: جدیدترین‌ها بالاتر
        STATE.filtered.sort(function (a, b) {
            var ta = a.updatedAt || a.createdAt || 0;
            var tb = b.updatedAt || b.createdAt || 0;
            return tb - ta;
        });

        _emit(CaseEvents.FILTERED, {
            count: STATE.filtered.length,
            query: q, status: st, step: sp, bank: bk
        });
        return STATE.filtered;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ردیف
    // ─────────────────────────────────────
    function _renderRow(c) {
        var status = c.status || 'draft';
        var step = c.currentStep || '';
        var isChecked = !!STATE.selectedIds[c.caseId];
        var locked = false;
        try {
            if (typeof CaseRepository !== 'undefined' && CaseRepository.isLocked) {
                locked = CaseRepository.isLocked(c.caseId, null);
            }
        } catch (e) { /* بی‌صدا */ }

        var html = '<tr data-case-id="' + _escapeHtml(c.caseId) + '"' +
                   (isChecked ? ' class="is-selected"' : '') + '>';

        html += '<td><input type="checkbox" data-role="select" ' +
                (isChecked ? 'checked' : '') + '></td>';

        html += '<td class="wam-table__id">' +
                (locked ? '🔒 ' : '') +
                '<a href="case-details.html?id=' +
                encodeURIComponent(c.caseId) + '">' +
                _escapeHtml(c.caseId) + '</a></td>';

        html += '<td class="wam-table__name">' +
                _escapeHtml(c.applicantName || '—') + '</td>';

        html += '<td>' + _escapeHtml(c.applicantMobile || '—') + '</td>';

        html += '<td>' + _escapeHtml(c.bank || '—') + '</td>';

        html += '<td>' + _formatAmount(c.loanAmount) + '</td>';

        html += '<td><span class="wam-badge wam-badge--' +
                _escapeHtml(status) + '">' +
                _escapeHtml(_statusLabel(status)) + '</span></td>';

        html += '<td class="wam-table__step">' +
                _escapeHtml(_stepTitle(step)) + '</td>';

        html += '<td>' + _escapeHtml(_relativeTime(c.updatedAt || c.createdAt)) +
                '</td>';

        html += '<td class="wam-table__actions">';
        html += '<button class="wam-btn-icon" data-action="view" ' +
                'title="مشاهده">👁️</button>';
        html += '<button class="wam-btn-icon" data-action="status" ' +
                'title="تغییر وضعیت">🔄</button>';
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
        var tbody = STATE.root.querySelector('[data-cases="tbody"]');
        if (!tbody) return;

        var list = STATE.filtered;
        var start = (STATE.page - 1) * PAGE_SIZE;
        var end = Math.min(start + PAGE_SIZE, list.length);
        var items = list.slice(start, end);

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="wam-table__empty">' +
                (STATE.cases.length === 0
                    ? 'هیچ پرونده‌ای ثبت نشده است.'
                    : 'نتیجه‌ای برای فیلتر فعلی یافت نشد.') +
                '</td></tr>';
        } else {
            var html = '';
            for (var i = 0; i < items.length; i++) {
                html += _renderRow(items[i]);
            }
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
        var el = STATE.root.querySelector('[data-cases="pagination"]');
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

    // ─────────────────────────────────────
    // 📊 خلاصه آمار فیلترشده
    // ─────────────────────────────────────
    function _renderStats() {
        if (!STATE.root) return;
        var el = STATE.root.querySelector('[data-cases="stats"]');
        if (!el) return;

        var total = STATE.filtered.length;
        var totalAmount = 0;
        var completed = 0;
        var rejected = 0;
        var inProgress = 0;

        for (var i = 0; i < STATE.filtered.length; i++) {
            var c = STATE.filtered[i];
            if (!c) continue;
            totalAmount += Number(c.loanAmount) || 0;
            var st = c.status || 'draft';
            if (st === 'completed') completed++;
            else if (st === 'rejected') rejected++;
            else if (st === 'in_progress' || st === 'pending') inProgress++;
        }

        el.innerHTML =
            '<span>نمایش: <strong>' + _formatNumber(total) + '</strong></span>' +
            '<span>در جریان: <strong>' + _formatNumber(inProgress) + '</strong></span>' +
            '<span>تکمیل‌شده: <strong>' + _formatNumber(completed) + '</strong></span>' +
            '<span>رد شده: <strong>' + _formatNumber(rejected) + '</strong></span>' +
            '<span>مجموع مبالغ: <strong>' +
            _formatAmount(totalAmount) + ' ریال</strong></span>';
    }

    // ─────────────────────────────────────
    // ☑️ انتخاب‌ها
    // ─────────────────────────────────────
    function _bindSelectors() {
        if (!STATE.root) return;

        // چک‌باکس ردیف
        var rowChecks = STATE.root.querySelectorAll('tr[data-case-id] [data-role="select"]');
        for (var i = 0; i < rowChecks.length; i++) {
            rowChecks[i].addEventListener('change', function () {
                var tr = this.closest('tr[data-case-id]');
                if (!tr) return;
                var id = tr.getAttribute('data-case-id');
                if (this.checked) STATE.selectedIds[id] = true;
                else delete STATE.selectedIds[id];
                _updateBulkBar();
            });
        }

        // چک‌باکس «انتخاب همه»
        var allCheck = STATE.root.querySelector('[data-cases="select-all"]');
        if (allCheck && !allCheck.dataset.bound) {
            allCheck.addEventListener('change', _toggleSelectAll);
            allCheck.dataset.bound = '1';
        }

        // دکمه‌های bulk
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
            var id = list[i].caseId;
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
        var bar = STATE.root.querySelector('[data-cases="bulk-bar"]');
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
            exportCases({ ids: ids });
        }
    }

    // ─────────────────────────────────────
    // 🖱️ رویدادهای ردیف
    // ─────────────────────────────────────
    function _bindRowActions() {
        if (!STATE.root) return;
        var rows = STATE.root.querySelectorAll('tr[data-case-id]');
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
        var tr = this.closest('tr[data-case-id]');
        if (!tr) return;
        var id = tr.getAttribute('data-case-id');

        if (action === 'view') {
            window.location.href = 'case-details.html?id=' + encodeURIComponent(id);
        } else if (action === 'status') {
            openStatusModal(id);
        } else if (action === 'delete') {
            _confirmDelete(id);
        }
    }

    // ─────────────────────────────────────
    // 🗑️ حذف
    // ─────────────────────────────────────
    function deleteCase(caseId, options) {
        options = options || {};

        if (typeof CaseRepository === 'undefined') {
            return { ok: false, reason: 'no_repo' };
        }

        // فقط super_admin یا admin با مجوز
        if (typeof WamPermissions !== 'undefined') {
            var me = WamPermissions.getCurrentUser();
            if (!me || !WamPermissions.isAdmin(me)) {
                return { ok: false, reason: 'insufficient_privilege' };
            }
        }

        var ok = false;
        try { ok = CaseRepository.delete(caseId); }
        catch (e) { ok = false; }

        if (!ok) return { ok: false, reason: 'storage_error' };

        // حذف از لیست محلی
        for (var i = STATE.cases.length - 1; i >= 0; i--) {
            if (STATE.cases[i] && STATE.cases[i].caseId === caseId) {
                STATE.cases.splice(i, 1);
                break;
            }
        }
        delete STATE.selectedIds[caseId];

        _emit(CaseEvents.DELETED, { caseId: caseId, at: Date.now() });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('پرونده حذف شد', 'موفق');
        }
        render();
        return { ok: true };
    }

    function _confirmDelete(caseId) {
        var title = 'حذف پرونده';
        var msg = 'آیا از حذف پرونده «' + caseId +
                  '» مطمئن هستید؟ این عملیات قابل بازگشت نیست.';
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm(title, msg, { danger: true }).then(function (ok) {
                if (ok) deleteCase(caseId);
            });
        } else if (window.confirm(msg)) {
            deleteCase(caseId);
        }
    }

    function _confirmBulkDelete(ids) {
        var title = 'حذف گروهی';
        var msg = 'حذف ' + ids.length + ' پرونده؟ این عملیات قابل بازگشت نیست.';
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm(title, msg, { danger: true }).then(function (ok) {
                if (ok) bulkDelete(ids);
            });
        } else if (window.confirm(msg)) {
            bulkDelete(ids);
        }
    }

    function bulkDelete(ids) {
        if (!Array.isArray(ids) || ids.length === 0) return { ok: false };
        if (typeof WamPermissions !== 'undefined') {
            var me = WamPermissions.getCurrentUser();
            if (!me || !WamPermissions.isAdmin(me)) {
                return { ok: false, reason: 'insufficient_privilege' };
            }
        }

        var deleted = 0;
        for (var i = 0; i < ids.length; i++) {
            try {
                if (CaseRepository.delete(ids[i])) deleted++;
            } catch (e) { /* بی‌صدا */ }
        }

        // reload
        STATE.cases = _loadCases();
        STATE.selectedIds = {};

        _emit(CaseEvents.BULK_DEL, { count: deleted, ids: ids, at: Date.now() });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess(_formatNumber(deleted) + ' پرونده حذف شد', 'موفق');
        }
        render();
        return { ok: true, deleted: deleted };
    }

    // ─────────────────────────────────────
    // 🔄 تغییر وضعیت
    // ─────────────────────────────────────
    function openStatusModal(caseId) {
        if (typeof CaseRepository === 'undefined') return;
        var c = CaseRepository.get(caseId);
        if (!c) return;

        var existing = document.getElementById('wamCaseStatusModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var curStatus = c.status || 'draft';

        var statusOptions = ['draft', 'in_progress', 'pending', 'approved',
                             'completed', 'rejected', 'cancelled', 'archived'];
        var optsHtml = '';
        for (var i = 0; i < statusOptions.length; i++) {
            var s = statusOptions[i];
            optsHtml += '<option value="' + s + '"' +
                        (s === curStatus ? ' selected' : '') + '>' +
                        _statusLabel(s) + '</option>';
        }

        var modal = document.createElement('div');
        modal.id = 'wamCaseStatusModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>تغییر وضعیت — ' + _escapeHtml(caseId) + '</h3>' +
                    '<button type="button" class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form id="wamCaseStatusForm" class="wam-modal__body">' +
                    '<div class="wam-field"><label>وضعیت جدید</label>' +
                        '<select name="status">' + optsHtml + '</select></div>' +
                    '<div class="wam-field"><label>یادداشت (اختیاری)</label>' +
                        '<textarea name="note" rows="3" placeholder="دلیل تغییر..."></textarea></div>' +
                    '<div class="wam-field__error" data-error="general"></div>' +
                    '<footer class="wam-modal__footer">' +
                        '<button type="button" class="wam-btn wam-btn--ghost" data-close>انصراف</button>' +
                        '<button type="submit" class="wam-btn wam-btn--primary">ذخیره</button>' +
                    '</footer>' +
                '</form>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var k = 0; k < cbs.length; k++) {
            cbs[k].addEventListener('click', _closeModal);
        }

        var form = modal.querySelector('#wamCaseStatusForm');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var newStatus = form.querySelector('[name="status"]').value;
                var note = form.querySelector('[name="note"]').value.trim();

                var res = changeStatus(caseId, newStatus, { note: note });
                if (!res.ok) {
                    var errEl = form.querySelector('[data-error="general"]');
                    if (errEl) {
                        errEl.textContent = 'خطا: ' + (res.reason || 'نامشخص');
                        errEl.style.display = 'block';
                    }
                    return;
                }
                _closeModal();
            });
        }
    }

    function changeStatus(caseId, newStatus, options) {
        options = options || {};
        if (typeof CaseRepository === 'undefined') {
            return { ok: false, reason: 'no_repo' };
        }

        if (typeof WamPermissions !== 'undefined') {
            var me = WamPermissions.getCurrentUser();
            if (!me || !WamPermissions.isAdmin(me)) {
                return { ok: false, reason: 'insufficient_privilege' };
            }
        }

        var patch = {
            status: newStatus,
            updatedAt: Date.now()
        };
        if (options.note) {
            patch.lastStatusNote = options.note;
        }

        var updated = CaseRepository.update(caseId, patch, {
            userId: (function () {
                if (typeof WamPermissions === 'undefined') return null;
                var u = WamPermissions.getCurrentUser();
                return u ? u.id : null;
            })()
        });

        if (!updated) return { ok: false, reason: 'update_failed' };

        // reload محلی
        var idx = -1;
        for (var i = 0; i < STATE.cases.length; i++) {
            if (STATE.cases[i].caseId === caseId) { idx = i; break; }
        }
        if (idx >= 0) STATE.cases[idx] = updated;

        _emit(CaseEvents.STATUS_CHG, {
            caseId: caseId,
            from: options.from,
            to: newStatus,
            note: options.note || null,
            at: Date.now()
        });

        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('وضعیت پرونده به «' +
                _statusLabel(newStatus) + '» تغییر کرد', 'موفق');
        }
        render();
        return { ok: true, case: updated };
    }

    function _closeModal() {
        var m = document.getElementById('wamCaseStatusModal');
        if (m && m.parentNode) m.parentNode.removeChild(m);
    }

    // ─────────────────────────────────────
    // 📤 خروجی CSV
    // ─────────────────────────────────────
    function exportCases(options) {
        options = options || {};
        var list;

        if (Array.isArray(options.ids) && options.ids.length > 0) {
            list = STATE.cases.filter(function (c) {
                return c && options.ids.indexOf(c.caseId) !== -1;
            });
        } else {
            list = STATE.filtered.length > 0 ? STATE.filtered : STATE.cases;
        }

        if (list.length === 0) {
            if (typeof WamUI !== 'undefined') WamUI.toastWarning('داده‌ای برای خروجی نیست', 'توجه');
            return { ok: false, reason: 'empty' };
        }

        var headers = ['شناسه', 'متقاضی', 'موبایل', 'بانک', 'مبلغ',
                       'وضعیت', 'مرحله', 'تاریخ ایجاد', 'آخرین به‌روزرسانی'];
        var rows = [headers];

        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            rows.push([
                c.caseId || '',
                c.applicantName || '',
                c.applicantMobile || '',
                c.bank || '',
                String(c.loanAmount || 0),
                _statusLabel(c.status),
                _stepTitle(c.currentStep),
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

        // BOM برای Excel
        var blob;
        try {
            blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        } catch (e) {
            // fallback
            var url = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
            window.open(url, '_blank');
            _emit(CaseEvents.EXPORTED, { count: list.length, at: Date.now() });
            return { ok: true, count: list.length };
        }

        var ts = new Date().toISOString().slice(0, 10);
        var filename = 'wamPay-cases-' + ts + '.csv';

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

        _emit(CaseEvents.EXPORTED, { count: list.length, at: Date.now() });
        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess(_formatNumber(list.length) + ' پرونده خروجی گرفته شد', 'موفق');
        }
        return { ok: true, count: list.length };
    }

    // ─────────────────────────────────────
    // 🎛️ فیلترها
    // ─────────────────────────────────────
    function _bindFilters() {
        if (!STATE.root) return;

        var searchEl = STATE.root.querySelector('[data-cases="search"]');
        if (searchEl) {
            searchEl.addEventListener('input', function () {
                STATE.query = this.value;
                STATE.page = 1;
                render();
            });
        }

        var stEl = STATE.root.querySelector('[data-cases="filter-status"]');
        if (stEl) {
            stEl.addEventListener('change', function () {
                STATE.statusFilter = this.value;
                STATE.page = 1;
                render();
            });
        }

        var spEl = STATE.root.querySelector('[data-cases="filter-step"]');
        if (spEl) {
            spEl.addEventListener('change', function () {
                STATE.stepFilter = this.value;
                STATE.page = 1;
                render();
            });
        }

        var bkEl = STATE.root.querySelector('[data-cases="filter-bank"]');
        if (bkEl) {
            bkEl.addEventListener('change', function () {
                STATE.bankFilter = this.value;
                STATE.page = 1;
                render();
            });
        }

        var expBtn = STATE.root.querySelector('[data-cases-action="export"]');
        if (expBtn) {
            expBtn.addEventListener('click', function (e) {
                e.preventDefault();
                exportCases();
            });
        }

        var refreshBtn = STATE.root.querySelector('[data-cases-action="refresh"]');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function (e) {
                e.preventDefault();
                reload();
                if (typeof WamUI !== 'undefined') WamUI.toastInfo('بروزرسانی شد', 'موفق');
            });
        }
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;
        _applyFilters();
        _renderTable();
    }

    // ─────────────────────────────────────
    // 🔄 reload
    // ─────────────────────────────────────
    function reload() {
        STATE.cases = _loadCases();
        render();
        _emit(CaseEvents.LOADED, { count: STATE.cases.length, at: Date.now() });
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
                       document.querySelector('[data-cases-root]') ||
                       document.querySelector('.wam-cases-panel');
            if (!root) {
                if (options.debug) console.warn('[admin-cases] root پیدا نشد');
                return;
            }
            STATE.root = root;
            STATE.cases = _loadCases();
            _bindFilters();
            render();
            STATE.installed = true;
            _emit(CaseEvents.LOADED, { count: STATE.cases.length, at: Date.now() });
            if (options.debug) console.log('[admin-cases] آماده، ' +
                STATE.cases.length + ' پرونده');
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
            total: STATE.cases.length,
            filtered: STATE.filtered.length,
            page: STATE.page,
            query: STATE.query,
            statusFilter: STATE.statusFilter,
            stepFilter: STATE.stepFilter,
            bankFilter: STATE.bankFilter,
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
    var WamAdminCases = {
        EVENTS: CaseEvents,
        STATUS_LABELS: STATUS_LABELS,
        STEP_TITLES: STEP_TITLES,
        BANKS: BANKS,
        PAGE_SIZE: PAGE_SIZE,

        install: install,
        uninstall: uninstall,
        reload: reload,
        render: render,

        deleteCase: deleteCase,
        bulkDelete: bulkDelete,
        changeStatus: changeStatus,
        openStatusModal: openStatusModal,
        exportCases: exportCases,

        getCases: function () { return STATE.cases.slice(); },
        getFiltered: function () { return STATE.filtered.slice(); },
        getSelectedIds: _getSelectedIds,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamAdminCases = WamAdminCases;
    window.AdminCaseEvents = CaseEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var body = document.body;
            if (!body) return;
            if (body.hasAttribute('data-admin-cases') ||
                document.querySelector('[data-cases-root]') ||
                document.querySelector('.wam-cases-panel')) {
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