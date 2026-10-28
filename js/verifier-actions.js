// ==========================================
// وام پی — Verifier Panel
// فایل: verifier-actions.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: اکشن‌های اعتبارسنج — عملیات گروهی، فیلتر پیشرفته، ابزارها
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION = '1.0.0';

    var SORT_OPTIONS = {
        oldest:   'قدیمی‌ترین',
        newest:   'جدیدترین',
        amount:   'بیشترین مبلغ',
        priority: 'اولویت'
    };

    var PRIORITY_LABELS = {
        low:    'کم',
        normal: 'معمولی',
        high:   'بالا',
        urgent: 'فوری'
    };

    var QUICK_FILTERS = {
        all:        'همه',
        urgent:     'فوری (بیش از ۳ روز)',
        today:      'امروز',
        bigAmount:  'مبالغ بالا',
        highPriority: 'اولویت بالا'
    };

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        cases: [],
        filtered: [],
        selectedIds: {},
        filters: {
            query: '',
            bank: '',
            minAmount: '',
            maxAmount: '',
            quick: 'all',
            priority: ''
        },
        sort: 'oldest',
        listeners: [],
        _boundSelectAll: false
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var VActionEvents = {
        LOADED:         'vact.loaded',
        BULK_APPROVE:   'vact.bulk_approve',
        BULK_REJECT:    'vact.bulk_reject',
        BULK_PRIORITY:  'vact.bulk_priority',
        BULK_ASSIGN:    'vact.bulk_assign',
        EXPORTED:       'vact.exported',
        FILTERED:       'vact.filtered',
        SELECTION:      'vact.selection',
        ACTION_FAIL:    'vact.action_fail'
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
    function _fa(n) {
        var s = String(n === null || n === undefined ? 0 : n);
        return s.replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _amt(n) {
        if (n === null || n === undefined || n === '') return '—';
        var x = Number(n);
        if (isNaN(x)) return '—';
        return x.toLocaleString('en-US').replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _en(s) {
        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.toEnglishDigits) {
            return WamPersianDate.toEnglishDigits(s);
        }
        return String(s || '').replace(/[۰-۹]/g, function (d) {
            return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
        });
    }

    function _uid() {
        if (typeof WamPermissions === 'undefined') return null;
        var me = WamPermissions.getCurrentUser();
        return me ? me.id : null;
    }

    function _toast(type, msg, title) {
        if (typeof WamUI === 'undefined') return;
        if (type === 'success' && WamUI.toastSuccess) WamUI.toastSuccess(msg, title || 'موفق');
        else if (type === 'error' && WamUI.toastError) WamUI.toastError(msg, title || 'خطا');
        else if (type === 'warning' && WamUI.toastWarning) WamUI.toastWarning(msg, title || 'توجه');
        else if (type === 'info' && WamUI.toastInfo) WamUI.toastInfo(msg, title || 'اطلاع');
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری پرونده‌ها
    // ─────────────────────────────────────
    function _loadAllCases() {
        if (typeof CaseRepository === 'undefined') return [];
        try {
            var all = CaseRepository.getAll() || [];
            // فقط پرونده‌هایی که در مرحله بررسی هستند
            var q = [];
            for (var i = 0; i < all.length; i++) {
                var c = all[i];
                if (!c) continue;
                var step = c.currentStep || '';
                var st = c.status || 'draft';
                if ((step === 'step_3' || step === 'step_4') &&
                    st !== 'completed' && st !== 'rejected' &&
                    st !== 'cancelled' && st !== 'archived') {
                    q.push(c);
                }
            }
            return q;
        } catch (e) {
            return [];
        }
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر پیشرفته
    // ─────────────────────────────────────
    function _applyFilters() {
        var f = STATE.filters;
        var q = (f.query || '').toLowerCase().trim();
        var minAmt = f.minAmount ? Number(_en(f.minAmount)) : 0;
        var maxAmt = f.maxAmount ? Number(_en(f.maxAmount)) : 0;
        var now = Date.now();
        var todayStart = new Date().setHours(0, 0, 0, 0);
        var threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

        STATE.filtered = STATE.cases.filter(function (c) {
            if (!c) return false;

            // جستجوی متنی
            if (q) {
                var hay = [c.caseId, c.applicantName, c.applicantMobile,
                           c.bank, c.brokerName]
                    .filter(Boolean).join(' ').toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }

            // بانک
            if (f.bank && c.bank !== f.bank) return false;

            // مبالغ
            var amt = Number(c.loanAmount) || 0;
            if (minAmt > 0 && amt < minAmt) return false;
            if (maxAmt > 0 && amt > maxAmt) return false;

            // اولویت (اگر در case ذخیره شده)
            if (f.priority && c.priority !== f.priority) return false;

            // فیلتر سریع
            var created = c.createdAt || c.updatedAt || 0;
            if (f.quick === 'urgent') {
                if (created > threeDaysAgo) return false;
            } else if (f.quick === 'today') {
                if (created < todayStart) return false;
            } else if (f.quick === 'bigAmount') {
                if (amt < 500000000) return false;   // ۵۰ میلیون تومان
            } else if (f.quick === 'highPriority') {
                if (c.priority !== 'high' && c.priority !== 'urgent') return false;
            }

            return true;
        });

        // مرتب‌سازی
        _applySort();

        _emit(VActionEvents.FILTERED, {
            count: STATE.filtered.length, filters: STATE.filters, sort: STATE.sort
        });
        return STATE.filtered;
    }

    function _applySort() {
        var s = STATE.sort;
        STATE.filtered.sort(function (a, b) {
            if (s === 'oldest') {
                return (a.createdAt || 0) - (b.createdAt || 0);
            }
            if (s === 'newest') {
                return (b.createdAt || 0) - (a.createdAt || 0);
            }
            if (s === 'amount') {
                return (Number(b.loanAmount) || 0) - (Number(a.loanAmount) || 0);
            }
            if (s === 'priority') {
                var order = { urgent: 4, high: 3, normal: 2, low: 1 };
                return (order[b.priority] || 0) - (order[a.priority] || 0);
            }
            return 0;
        });
    }

    // ─────────────────────────────────────
    // ☑️ انتخاب
    // ─────────────────────────────────────
    function _getSelectedIds() {
        var ids = [];
        for (var k in STATE.selectedIds) {
            if (Object.prototype.hasOwnProperty.call(STATE.selectedIds, k)) ids.push(k);
        }
        return ids;
    }

    function selectAll() {
        for (var i = 0; i < STATE.filtered.length; i++) {
            STATE.selectedIds[STATE.filtered[i].caseId] = true;
        }
        _emit(VActionEvents.SELECTION, { count: _getSelectedIds().length });
        return _getSelectedIds().length;
    }

    function clearSelection() {
        STATE.selectedIds = {};
        _emit(VActionEvents.SELECTION, { count: 0 });
        return true;
    }

    function toggleSelect(caseId, checked) {
        if (!caseId) return false;
        if (checked === undefined) {
            if (STATE.selectedIds[caseId]) delete STATE.selectedIds[caseId];
            else STATE.selectedIds[caseId] = true;
        } else {
            if (checked) STATE.selectedIds[caseId] = true;
            else delete STATE.selectedIds[caseId];
        }
        _emit(VActionEvents.SELECTION, { count: _getSelectedIds().length });
        return true;
    }

    function getSelectionCount() {
        return _getSelectedIds().length;
    }

    // ─────────────────────────────────────
    // 🎯 عملیات گروهی
    // ─────────────────────────────────────
    function bulkApprove(options) {
        options = options || {};
        var ids = options.ids || _getSelectedIds();
        if (ids.length === 0) return { ok: false, reason: 'no_selection' };

        if (typeof CaseStateMachine === 'undefined') {
            return { ok: false, reason: 'no_state_machine' };
        }

        var me = _uid();
        var success = 0;
        var failed = [];

        for (var i = 0; i < ids.length; i++) {
            var caseId = ids[i];
            var c = _findCase(caseId);
            if (!c) { failed.push({ caseId: caseId, reason: 'not_found' }); continue; }

            try {
                var r = CaseStateMachine.completeStep(
                    caseId,
                    c.currentStep || 'step_4',
                    {
                        userId: me,
                        role: 'verifier',
                        note: options.note || 'تأیید گروهی توسط اعتبارسنج',
                        syncApproval: true
                    }
                );
                if (r && r.ok) success++;
                else failed.push({ caseId: caseId, reason: (r && r.reason) || 'failed' });
            } catch (e) {
                failed.push({ caseId: caseId, reason: 'exception' });
            }
        }

        _emit(VActionEvents.BULK_APPROVE, {
            total: ids.length, success: success, failed: failed.length, at: Date.now()
        });

        if (success > 0) {
            _toast('success', _fa(success) + ' پرونده تأیید شد', 'موفق');
        }
        if (failed.length > 0) {
            _toast('warning', _fa(failed.length) + ' پرونده ناموفق', 'توجه');
        }

        clearSelection();
        reload();
        return { ok: true, success: success, failed: failed };
    }

    function bulkReject(options) {
        options = options || {};
        var ids = options.ids || _getSelectedIds();
        if (ids.length === 0) return { ok: false, reason: 'no_selection' };
        if (!options.note || String(options.note).trim().length < 10) {
            return { ok: false, reason: 'note_required' };
        }

        if (typeof CaseStateMachine === 'undefined') {
            return { ok: false, reason: 'no_state_machine' };
        }

        var me = _uid();
        var success = 0;
        var failed = [];

        for (var i = 0; i < ids.length; i++) {
            var caseId = ids[i];
            var c = _findCase(caseId);
            if (!c) { failed.push({ caseId: caseId, reason: 'not_found' }); continue; }

            try {
                var r = CaseStateMachine.rejectStep(
                    caseId,
                    c.currentStep || 'step_4',
                    {
                        userId: me,
                        role: 'verifier',
                        note: options.note,
                        syncApproval: true
                    }
                );
                if (r && r.ok) success++;
                else failed.push({ caseId: caseId, reason: (r && r.reason) || 'failed' });
            } catch (e) {
                failed.push({ caseId: caseId, reason: 'exception' });
            }
        }

        _emit(VActionEvents.BULK_REJECT, {
            total: ids.length, success: success, failed: failed.length, at: Date.now()
        });

        if (success > 0) {
            _toast('warning', _fa(success) + ' پرونده رد شد', 'توجه');
        }
        if (failed.length > 0) {
            _toast('warning', _fa(failed.length) + ' پرونده ناموفق', 'توجه');
        }

        clearSelection();
        reload();
        return { ok: true, success: success, failed: failed };
    }

    function bulkSetPriority(priority) {
        var ids = _getSelectedIds();
        if (ids.length === 0) return { ok: false, reason: 'no_selection' };
        if (!PRIORITY_LABELS[priority]) return { ok: false, reason: 'invalid_priority' };

        var success = 0;
        for (var i = 0; i < ids.length; i++) {
            if (_setCasePriority(ids[i], priority)) success++;
        }

        _emit(VActionEvents.BULK_PRIORITY, {
            total: ids.length, success: success, priority: priority, at: Date.now()
        });

        if (success > 0) {
            _toast('success', _fa(success) + ' پرونده اولویت‌گذاری شد', 'موفق');
        }
        clearSelection();
        reload();
        return { ok: true, success: success };
    }

    function bulkAssign(assigneeId) {
        var ids = _getSelectedIds();
        if (ids.length === 0) return { ok: false, reason: 'no_selection' };
        if (!assigneeId) return { ok: false, reason: 'no_assignee' };

        var success = 0;
        for (var i = 0; i < ids.length; i++) {
            if (_assignCase(ids[i], assigneeId)) success++;
        }

        _emit(VActionEvents.BULK_ASSIGN, {
            total: ids.length, success: success, assigneeId: assigneeId, at: Date.now()
        });

        if (success > 0) {
            _toast('success', _fa(success) + ' پرونده ارجاع شد', 'موفق');
        }
        clearSelection();
        reload();
        return { ok: true, success: success };
    }

    // ─────────────────────────────────────
    // 🎯 عملیات روی یک پرونده
    // ─────────────────────────────────────
    function _findCase(caseId) {
        for (var i = 0; i < STATE.cases.length; i++) {
            if (STATE.cases[i] && STATE.cases[i].caseId === caseId) {
                return STATE.cases[i];
            }
        }
        return null;
    }

    function _setCasePriority(caseId, priority) {
        if (typeof CaseRepository === 'undefined') return false;
        try {
            var updated = CaseRepository.update(caseId, {
                priority: priority,
                prioritySetAt: Date.now(),
                prioritySetBy: _uid()
            }, { userId: _uid() });
            return !!updated;
        } catch (e) {
            return false;
        }
    }

    function _assignCase(caseId, assigneeId) {
        if (typeof CaseRepository === 'undefined') return false;
        try {
            var updated = CaseRepository.update(caseId, {
                assignedVerifier: assigneeId,
                assignedAt: Date.now(),
                assignedBy: _uid()
            }, { userId: _uid() });
            return !!updated;
        } catch (e) {
            return false;
        }
    }

    // ─────────────────────────────────────
    // 📊 آمار گروهی
    // ─────────────────────────────────────
    function computeBulkStats() {
        var stats = {
            count: STATE.filtered.length,
            totalAmount: 0,
            averageAmount: 0,
            oldestAge: 0,
            urgent: 0
        };

        var now = Date.now();
        var oldest = now;

        for (var i = 0; i < STATE.filtered.length; i++) {
            var c = STATE.filtered[i];
            if (!c) continue;
            var amt = Number(c.loanAmount) || 0;
            stats.totalAmount += amt;

            var age = now - (c.createdAt || now);
            var ageDays = Math.floor(age / (24 * 60 * 60 * 1000));
            if (ageDays > 3) stats.urgent++;
            if ((c.createdAt || now) < oldest) oldest = c.createdAt || now;
        }

        stats.averageAmount = stats.count > 0
            ? Math.round(stats.totalAmount / stats.count) : 0;
        stats.oldestAge = oldest === now
            ? 0 : Math.floor((now - oldest) / (24 * 60 * 60 * 1000));

        return stats;
    }

    // ─────────────────────────────────────
    // 📤 خروجی CSV
    // ─────────────────────────────────────
    function exportFiltered() {
        if (STATE.filtered.length === 0) {
            _toast('warning', 'داده‌ای برای خروجی نیست', 'توجه');
            return { ok: false, reason: 'empty' };
        }

        var headers = ['شناسه', 'متقاضی', 'موبایل', 'بانک', 'مبلغ',
                       'مرحله', 'وضعیت', 'اولویت', 'تاریخ ثبت'];
        var rows = [headers];

        for (var i = 0; i < STATE.filtered.length; i++) {
            var c = STATE.filtered[i];
            rows.push([
                c.caseId || '',
                c.applicantName || '',
                c.applicantMobile || '',
                c.bank || '',
                String(c.loanAmount || 0),
                c.currentStep || '',
                c.status || '',
                c.priority ? PRIORITY_LABELS[c.priority] : '—',
                c.createdAt ? new Date(c.createdAt).toLocaleDateString('fa-IR') : ''
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
            _emit(VActionEvents.EXPORTED, { count: STATE.filtered.length, at: Date.now() });
            return { ok: true, count: STATE.filtered.length };
        }

        var ts = new Date().toISOString().slice(0, 10);
        var filename = 'verifier-queue-' + ts + '.csv';

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

        _emit(VActionEvents.EXPORTED, { count: STATE.filtered.length, at: Date.now() });
        _toast('success', _fa(STATE.filtered.length) + ' مورد خروجی گرفته شد', 'موفق');
        return { ok: true, count: STATE.filtered.length };
    }

    // ─────────────────────────────────────
    // 🔧 فیلترها
    // ─────────────────────────────────────
    function setFilter(key, value) {
        if (!key) return false;
        STATE.filters[key] = value;
        _applyFilters();
        return true;
    }

    function setFilters(patch) {
        if (!patch) return false;
        for (var k in patch) {
            if (Object.prototype.hasOwnProperty.call(patch, k)) {
                STATE.filters[k] = patch[k];
            }
        }
        _applyFilters();
        return true;
    }

    function resetFilters() {
        STATE.filters = {
            query: '',
            bank: '',
            minAmount: '',
            maxAmount: '',
            quick: 'all',
            priority: ''
        };
        _applyFilters();
        return true;
    }

    function setSort(sortKey) {
        if (!SORT_OPTIONS[sortKey]) return false;
        STATE.sort = sortKey;
        _applySort();
        return true;
    }

    // ─────────────────────────────────────
    // 🔄 reload
    // ─────────────────────────────────────
    function reload() {
        STATE.cases = _loadAllCases();
        _applyFilters();
        // پاکسازی انتخاب‌های نامعتبر
        var validIds = {};
        for (var i = 0; i < STATE.cases.length; i++) {
            if (STATE.selectedIds[STATE.cases[i].caseId]) {
                validIds[STATE.cases[i].caseId] = true;
            }
        }
        STATE.selectedIds = validIds;

        _emit(VActionEvents.LOADED, {
            count: STATE.cases.length,
            filtered: STATE.filtered.length,
            at: Date.now()
        });
        return STATE.filtered.length;
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (STATE.installed && !options.force) return;

        STATE.cases = _loadAllCases();
        _applyFilters();
        STATE.installed = true;

        if (options.debug) {
            console.log('[verifier-actions] v' + VERSION + ' آماده — ' +
                STATE.cases.length + ' پرونده، ' +
                STATE.filtered.length + ' نتیجه فیلتر');
        }
    }

    function uninstall() {
        STATE.cases = [];
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
            totalCases: STATE.cases.length,
            filteredCount: STATE.filtered.length,
            selectionCount: _getSelectedIds().length,
            filters: JSON.parse(JSON.stringify(STATE.filters)),
            sort: STATE.sort
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
    var WamVerifierActions = {
        VERSION: VERSION,
        EVENTS: VActionEvents,
        SORT_OPTIONS: SORT_OPTIONS,
        PRIORITY_LABELS: PRIORITY_LABELS,
        QUICK_FILTERS: QUICK_FILTERS,

        install: install,
        uninstall: uninstall,
        reload: reload,

        // فیلتر و مرتب‌سازی
        setFilter: setFilter,
        setFilters: setFilters,
        resetFilters: resetFilters,
        setSort: setSort,
        getFiltered: function () { return STATE.filtered.slice(); },

        // انتخاب
        selectAll: selectAll,
        clearSelection: clearSelection,
        toggleSelect: toggleSelect,
        getSelectedIds: _getSelectedIds,
        getSelectionCount: getSelectionCount,

        // عملیات گروهی
        bulkApprove: bulkApprove,
        bulkReject: bulkReject,
        bulkSetPriority: bulkSetPriority,
        bulkAssign: bulkAssign,

        // عملیات تکی
        setPriority: function (caseId, priority) {
            return _setCasePriority(caseId, priority);
        },
        assign: function (caseId, assigneeId) {
            return _assignCase(caseId, assigneeId);
        },

        // آمار و خروجی
        computeBulkStats: computeBulkStats,
        exportFiltered: exportFiltered,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamVerifierActions = WamVerifierActions;
    window.VerifierActionEvents = VActionEvents;

    // ثبت خودکار
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { install(); });
        } else {
            install();
        }
    }

})();