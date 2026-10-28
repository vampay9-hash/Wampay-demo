// ==========================================
// وام پی — Shared Modules
// فایل: advanced-reports.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: گزارش‌های پیشرفته — Pivot، گروه‌بندی چندسطحی، قالب‌ها
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION = '1.0.0';
    var ROOT_ATTR = 'data-adv-reports-root';
    var TEMPLATES_KEY = 'wamPayAdvReportsTemplates';

    var DATA_SOURCES = {
        CASES:       'cases',
        PAYMENTS:    'payments',
        LOANS:       'loans',
        CONTRACTS:   'contracts',
        CONSULT:     'consultations',
        WALLET_TX:   'wallet_transactions'
    };

    var SOURCE_LABELS = {
        cases:               'پرونده‌ها',
        payments:            'پرداخت‌ها',
        loans:               'وام‌ها',
        contracts:           'قراردادها',
        consultations:       'مشاوره‌ها',
        wallet_transactions: 'تراکنش‌های کیف پول'
    };

    var AGG_TYPES = {
        COUNT:    'count',
        SUM:      'sum',
        AVG:      'avg',
        MIN:      'min',
        MAX:      'max'
    };

    var AGG_LABELS = {
        count: 'تعداد',
        sum:   'مجموع',
        avg:   'میانگین',
        min:   'کمترین',
        max:   'بیشترین'
    };

    // ستون‌های قابل استفاده بر اساس منبع داده
    var FIELDS = {
        cases: [
            { key: 'caseId',        label: 'شناسه' },
            { key: 'bank',          label: 'بانک' },
            { key: 'status',        label: 'وضعیت' },
            { key: 'currentStep',   label: 'مرحله' },
            { key: 'priority',      label: 'اولویت' },
            { key: 'brokerName',    label: 'کارگزار' },
            { key: 'applicantName', label: 'متقاضی' },
            { key: 'loanAmount',    label: 'مبلغ', numeric: true },
            { key: 'createdAt',     label: 'تاریخ ثبت', date: true }
        ],
        payments: [
            { key: 'receiptNumber',  label: 'کد رسید' },
            { key: 'type',           label: 'نوع' },
            { key: 'status',         label: 'وضعیت' },
            { key: 'method',         label: 'روش' },
            { key: 'applicantName',  label: 'متقاضی' },
            { key: 'brokerName',     label: 'کارگزار' },
            { key: 'amount',         label: 'مبلغ', numeric: true },
            { key: 'createdAt',      label: 'تاریخ ثبت', date: true }
        ],
        loans: [
            { key: 'loanCode',      label: 'کد وام' },
            { key: 'bank',          label: 'بانک' },
            { key: 'status',        label: 'وضعیت' },
            { key: 'applicantName', label: 'متقاضی' },
            { key: 'principal',     label: 'مبلغ اصل', numeric: true },
            { key: 'createdAt',     label: 'تاریخ ثبت', date: true }
        ],
        contracts: [
            { key: 'contractNumber', label: 'شماره قرارداد' },
            { key: 'type',           label: 'نوع' },
            { key: 'status',         label: 'وضعیت' },
            { key: 'applicantName',  label: 'متقاضی' },
            { key: 'bank',           label: 'بانک' },
            { key: 'loanAmount',     label: 'مبلغ', numeric: true },
            { key: 'createdAt',      label: 'تاریخ ثبت', date: true }
        ],
        consultations: [
            { key: 'code',        label: 'کد' },
            { key: 'subject',     label: 'موضوع' },
            { key: 'status',      label: 'وضعیت' },
            { key: 'priority',    label: 'اولویت' },
            { key: 'brokerName',  label: 'کارگزار' },
            { key: 'createdAt',   label: 'تاریخ ثبت', date: true }
        ],
        wallet_transactions: [
            { key: 'type',   label: 'نوع' },
            { key: 'amount', label: 'مبلغ', numeric: true },
            { key: 'at',     label: 'تاریخ', date: true }
        ]
    };

    var PIVOT_TEMPLATES = [
        {
            id: 'tpl_payments_by_method',
            name: 'پرداخت‌ها به تفکیک روش',
            source: 'payments',
            rows: ['method'],
            cols: [],
            agg: { field: 'amount', type: 'sum' }
        },
        {
            id: 'tpl_cases_by_bank_status',
            name: 'پرونده‌ها بر اساس بانک و وضعیت',
            source: 'cases',
            rows: ['bank'],
            cols: ['status'],
            agg: { field: 'caseId', type: 'count' }
        },
        {
            id: 'tpl_contracts_by_status',
            name: 'قراردادها بر اساس وضعیت',
            source: 'contracts',
            rows: ['status'],
            cols: [],
            agg: { field: 'loanAmount', type: 'sum' }
        },
        {
            id: 'tpl_consult_by_priority',
            name: 'مشاوره‌ها بر اساس اولویت',
            source: 'consultations',
            rows: ['priority'],
            cols: ['status'],
            agg: { field: 'code', type: 'count' }
        }
    ];

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        role: null,
        userId: null,
        activeTab: 'builder',    // builder | templates | result | saved
        config: {
            source: 'payments',
            rows: [],
            cols: [],
            agg: { field: 'amount', type: 'sum' },
            filters: [],
            sort: { by: '', dir: 'desc' },
            limit: 0
        },
        result: null,
        templates: [],
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var AdvReportEvents = {
        READY:           'advrep.ready',
        RENDERED:        'advrep.rendered',
        GENERATED:       'advrep.generated',
        CONFIG_CHANGED:  'advrep.config_changed',
        TAB_CHANGED:     'advrep.tab_changed',
        TEMPLATE_LOADED: 'advrep.template_loaded',
        TEMPLATE_SAVED:  'advrep.template_saved',
        TEMPLATE_DELETED:'advrep.template_deleted',
        EXPORTED:        'advrep.exported'
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

    function _amt(n) {
        if (n === null || n === undefined || n === '') return '۰';
        var x = Number(n);
        if (isNaN(x)) return '۰';
        var f = Math.round(x).toLocaleString('en-US');
        return f.replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
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
        return (prefix || 'adv') + '_' + Date.now().toString(36) + '_' + r;
    }

    function _toast(type, msg, title) {
        if (typeof WamUI === 'undefined') return;
        if (type === 'success' && WamUI.toastSuccess) WamUI.toastSuccess(msg, title || 'موفق');
        else if (type === 'error' && WamUI.toastError) WamUI.toastError(msg, title || 'خطا');
        else if (type === 'warning' && WamUI.toastWarning) WamUI.toastWarning(msg, title || 'توجه');
        else if (type === 'info' && WamUI.toastInfo) WamUI.toastInfo(msg, title || 'اطلاع');
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری داده
    // ─────────────────────────────────────
    function _loadData(source) {
        if (typeof Storage === 'undefined') return [];

        if (source === 'cases') {
            if (typeof CaseRepository === 'undefined') return [];
            try { return CaseRepository.getAll() || []; }
            catch (e) { return []; }
        }
        if (source === 'payments') {
            var p = Storage.getJSON('wamPayPayments', []);
            return Array.isArray(p) ? p : [];
        }
        if (source === 'loans') {
            var l = Storage.getJSON('wamPayLoans', []);
            return Array.isArray(l) ? l : [];
        }
        if (source === 'contracts') {
            var c = Storage.getJSON('wamPayContracts', []);
            return Array.isArray(c) ? c : [];
        }
        if (source === 'consultations') {
            var s = Storage.getJSON('wamPayConsultations', []);
            return Array.isArray(s) ? s : [];
        }
        if (source === 'wallet_transactions') {
            var wallets = Storage.getJSON('wamPayWallets', {}) || {};
            var all = [];
            for (var k in wallets) {
                if (!Object.prototype.hasOwnProperty.call(wallets, k)) continue;
                var w = wallets[k];
                if (!w || !Array.isArray(w.transactions)) continue;
                for (var i = 0; i < w.transactions.length; i++) {
                    var tx = w.transactions[i];
                    if (tx) {
                        tx.ownerId = k;
                        all.push(tx);
                    }
                }
            }
            return all;
        }
        return [];
    }

    // ─────────────────────────────────────
    // 🧮 Pivot
    // ─────────────────────────────────────
    function generatePivot(config, options) {
        options = options || {};
        config = config || STATE.config;

        var source = config.source || 'payments';
        var data = _loadData(source);

        // فیلتر
        var filtered = _applyFilters(data, config.filters);

        // گروه‌بندی سطر
        var rowKeys = config.rows && config.rows.length > 0 ? config.rows : ['__total__'];
        var colKeys = config.cols && config.cols.length > 0 ? config.cols : ['__total__'];

        // ساخت درخت pivot
        var pivot = _buildPivot(filtered, rowKeys, colKeys, config.agg);

        // مرتب‌سازی
        if (config.sort && config.sort.by) {
            pivot.rows.sort(function (a, b) {
                var va = a.totals[config.sort.by] || 0;
                var vb = b.totals[config.sort.by] || 0;
                return config.sort.dir === 'desc' ? (vb - va) : (va - vb);
            });
        }

        // محدودیت
        if (config.limit && config.limit > 0) {
            pivot.rows = pivot.rows.slice(0, config.limit);
        }

        var result = {
            config: JSON.parse(JSON.stringify(config)),
            source: source,
            rowKeys: rowKeys,
            colKeys: colKeys,
            rowLabels: rowKeys.map(function (k) { return _fieldLabel(source, k); }),
            colLabels: colKeys.map(function (k) { return _fieldLabel(source, k); }),
            pivot: pivot,
            rawCount: data.length,
            filteredCount: filtered.length,
            generatedAt: Date.now()
        };

        STATE.result = result;
        _emit(AdvReportEvents.GENERATED, {
            source: source,
            rowCount: pivot.rows.length,
            at: result.generatedAt
        });
        return result;
    }

    function _applyFilters(data, filters) {
        if (!Array.isArray(filters) || filters.length === 0) return data.slice();
        return data.filter(function (row) {
            if (!row) return false;
            for (var i = 0; i < filters.length; i++) {
                var f = filters[i];
                if (!f || !f.field || f.value === undefined || f.value === '') continue;
                var v = row[f.field];
                var op = f.op || 'eq';
                if (!_matchFilter(v, op, f.value)) return false;
            }
            return true;
        });
    }

    function _matchFilter(v, op, target) {
        var vs = v === null || v === undefined ? '' : String(v);
        var ts = String(target);

        if (op === 'eq')  return vs === ts;
        if (op === 'ne')  return vs !== ts;
        if (op === 'contains') return vs.indexOf(ts) !== -1;
        if (op === 'gt')  return Number(v) > Number(target);
        if (op === 'gte') return Number(v) >= Number(target);
        if (op === 'lt')  return Number(v) < Number(target);
        if (op === 'lte') return Number(v) <= Number(target);
        return true;
    }

    function _buildPivot(data, rowKeys, colKeys, agg) {
        var aggType = (agg && agg.type) || 'count';
        var aggField = (agg && agg.field) || '__id__';

        var root = {};
        var colSet = {};

        for (var i = 0; i < data.length; i++) {
            var row = data[i];
            if (!row) continue;

            var rKey = _keyOf(row, rowKeys);
            var cKey = _keyOf(row, colKeys);
            colSet[cKey] = true;

            if (!root[rKey]) {
                root[rKey] = {
                    rowParts: _valuesOf(row, rowKeys),
                    cells: {}
                };
            }
            if (!root[rKey].cells[cKey]) {
                root[rKey].cells[cKey] = { values: [] };
            }
            var val = aggField === '__id__' ? 1 : row[aggField];
            root[rKey].cells[cKey].values.push(val);
        }

        // ساخت نتیجه
        var colKeysArr = Object.keys(colSet).sort();
        var rowKeysArr = Object.keys(root).sort();

        var rows = [];
        var grandTotals = {};
        var colTotals = {};
        var grandTotal = { values: [] };

        for (var ri = 0; ri < rowKeysArr.length; ri++) {
            var rKey = rowKeysArr[ri];
            var rEntry = root[rKey];
            var rowTotals = {};
            var rowValues = [];
            var rowAgg = {};

            for (var ci = 0; ci < colKeysArr.length; ci++) {
                var cKey = colKeysArr[ci];
                var cell = rEntry.cells[cKey];
                var cellAgg = cell ? _aggregate(cell.values, aggType) : 0;
                rowAgg[cKey] = cellAgg;
                if (cell) rowValues = rowValues.concat(cell.values);

                if (!colTotals[cKey]) colTotals[cKey] = { values: [] };
                if (cell) colTotals[cKey].values = colTotals[cKey].values.concat(cell.values);
            }

            var rowTotal = _aggregate(rowValues, aggType);
            grandTotal.values = grandTotal.values.concat(rowValues);

            rows.push({
                rowKey: rKey,
                rowParts: rEntry.rowParts,
                cells: rowAgg,
                total: rowTotal
            });
        }

        // محاسبه col totals و grand total
        var colTotalsArr = {};
        for (var k = 0; k < colKeysArr.length; k++) {
            colTotalsArr[colKeysArr[k]] = _aggregate(colTotals[colKeysArr[k]].values, aggType);
        }
        var grandTotalVal = _aggregate(grandTotal.values, aggType);

        return {
            colKeys: colKeysArr,
            rows: rows,
            colTotals: colTotalsArr,
            grandTotal: grandTotalVal,
            aggType: aggType,
            aggField: aggField
        };
    }

    function _keyOf(row, keys) {
        var parts = [];
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (k === '__total__') continue;
            var v = row[k];
            parts.push(v === null || v === undefined ? '—' : String(v));
        }
        return parts.length > 0 ? parts.join(' | ') : '__total__';
    }

    function _valuesOf(row, keys) {
        var parts = [];
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (k === '__total__') continue;
            var v = row[k];
            parts.push(v === null || v === undefined ? '—' : String(v));
        }
        return parts.length > 0 ? parts : ['—'];
    }

    function _aggregate(values, type) {
        if (!values || values.length === 0) return 0;
        if (type === 'count') return values.length;

        var nums = [];
        for (var i = 0; i < values.length; i++) {
            var n = Number(values[i]);
            if (!isNaN(n)) nums.push(n);
        }
        if (nums.length === 0) return 0;

        var sum = 0;
        var min = nums[0];
        var max = nums[0];
        for (var j = 0; j < nums.length; j++) {
            sum += nums[j];
            if (nums[j] < min) min = nums[j];
            if (nums[j] > max) max = nums[j];
        }

        if (type === 'sum') return sum;
        if (type === 'avg') return sum / nums.length;
        if (type === 'min') return min;
        if (type === 'max') return max;
        return 0;
    }

    function _fieldLabel(source, field) {
        if (field === '__total__') return 'کل';
        var list = FIELDS[source] || [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].key === field) return list[i].label;
        }
        return field;
    }

    function _fieldMeta(source, field) {
        var list = FIELDS[source] || [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].key === field) return list[i];
        }
        return null;
    }

    // ─────────────────────────────────────
    // 📤 خروجی CSV
    // ─────────────────────────────────────
    function exportCSV() {
        var r = STATE.result;
        if (!r || !r.pivot) {
            _toast('warning', 'ابتدا گزارش تولید کنید', 'توجه');
            return { ok: false };
        }

        var p = r.pivot;
        var headers = r.rowLabels.slice();
        for (var i = 0; i < p.colKeys.length; i++) {
            headers.push('ستون ' + (i + 1));
        }
        headers.push('جمع کل');

        var rows = [headers];
        for (var ri = 0; ri < p.rows.length; ri++) {
            var row = p.rows[ri];
            var line = row.rowParts.slice();
            for (var ci = 0; ci < p.colKeys.length; ci++) {
                line.push(p.rows[ri].cells[p.colKeys[ci]] || 0);
            }
            line.push(row.total);
            rows.push(line);
        }

        // جمع کل
        var footer = ['جمع کل'];
        for (var fi = 1; fi < r.rowLabels.length; fi++) footer.push('');
        for (var ci2 = 0; ci2 < p.colKeys.length; ci2++) {
            footer.push(p.colTotals[p.colKeys[ci2]] || 0);
        }
        footer.push(p.grandTotal);
        rows.push(footer);

        var csv = rows.map(function (row) {
            return row.map(function (cell) {
                var s = String(cell === null || cell === undefined ? '' : cell);
                if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1) {
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
            _emit(AdvReportEvents.EXPORTED, { at: Date.now() });
            return { ok: true };
        }

        var ts = new Date().toISOString().slice(0, 10);
        var filename = 'wampay-adv-report-' + r.source + '-' + ts + '.csv';

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

        _emit(AdvReportEvents.EXPORTED, { at: Date.now() });
        _toast('success', 'خروجی CSV آماده شد', 'موفق');
        return { ok: true };
    }

    // ─────────────────────────────────────
    // 💾 قالب‌ها
    // ─────────────────────────────────────
    function _loadTemplates() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(TEMPLATES_KEY, []);
        if (!Array.isArray(arr) || arr.length === 0) {
            var defaults = JSON.parse(JSON.stringify(PIVOT_TEMPLATES));
            Storage.setJSON(TEMPLATES_KEY, defaults);
            return defaults;
        }
        return arr;
    }

    function _saveTemplates(list) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(TEMPLATES_KEY, list);
    }

    function saveTemplate(name, config) {
        if (!name || String(name).trim().length < 2) {
            return { ok: false, reason: 'no_name' };
        }
        config = config || STATE.config;

        var user = _user();
        var tpl = {
            id: _genId('tpl'),
            name: String(name).trim(),
            source: config.source,
            rows: config.rows.slice(),
            cols: config.cols.slice(),
            agg: JSON.parse(JSON.stringify(config.agg)),
            filters: JSON.parse(JSON.stringify(config.filters || [])),
            sort: JSON.parse(JSON.stringify(config.sort || {})),
            limit: config.limit || 0,
            createdBy: user ? user.id : null,
            createdByName: user ? (user.name || user.username) : null,
            createdAt: Date.now()
        };

        var all = _loadTemplates();
        all.push(tpl);
        if (all.length > 50) all = all.slice(-50);

        if (!_saveTemplates(all)) {
            return { ok: false, reason: 'storage_error' };
        }

        STATE.templates = all;
        _emit(AdvReportEvents.TEMPLATE_SAVED, { template: tpl });
        return { ok: true, template: tpl };
    }

    function loadTemplate(id) {
        var all = _loadTemplates();
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].id === id) {
                var t = all[i];
                STATE.config = {
                    source: t.source,
                    rows: (t.rows || []).slice(),
                    cols: (t.cols || []).slice(),
                    agg: JSON.parse(JSON.stringify(t.agg)),
                    filters: JSON.parse(JSON.stringify(t.filters || [])),
                    sort: JSON.parse(JSON.stringify(t.sort || {})),
                    limit: t.limit || 0
                };
                _emit(AdvReportEvents.TEMPLATE_LOADED, { template: t });
                return { ok: true, template: t };
            }
        }
        return { ok: false, reason: 'not_found' };
    }

    function deleteTemplate(id) {
        var all = _loadTemplates();
        var idx = -1;
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].id === id) { idx = i; break; }
        }
        if (idx === -1) return { ok: false, reason: 'not_found' };

        var removed = all.splice(idx, 1)[0];
        if (!_saveTemplates(all)) {
            all.splice(idx, 0, removed);
            return { ok: false, reason: 'storage_error' };
        }

        STATE.templates = all;
        _emit(AdvReportEvents.TEMPLATE_DELETED, { templateId: id });
        return { ok: true };
    }

    function getTemplates() {
        return _loadTemplates();
    }

    // ─────────────────────────────────────
    // 🎯 تغییر config
    // ─────────────────────────────────────
    function setConfig(patch) {
        if (!patch) return false;
        for (var k in patch) {
            if (Object.prototype.hasOwnProperty.call(patch, k)) {
                STATE.config[k] = patch[k];
            }
        }
        _emit(AdvReportEvents.CONFIG_CHANGED, { config: STATE.config });
        return true;
    }

    function addRowField(field) {
        if (!field) return false;
        if (STATE.config.rows.indexOf(field) !== -1) return false;
        STATE.config.rows.push(field);
        return true;
    }

    function removeRowField(field) {
        var i = STATE.config.rows.indexOf(field);
        if (i === -1) return false;
        STATE.config.rows.splice(i, 1);
        return true;
    }

    function addColField(field) {
        if (!field) return false;
        if (STATE.config.cols.indexOf(field) !== -1) return false;
        STATE.config.cols.push(field);
        return true;
    }

    function removeColField(field) {
        var i = STATE.config.cols.indexOf(field);
        if (i === -1) return false;
        STATE.config.cols.splice(i, 1);
        return true;
    }

    // ─────────────────────────────────────
    // 🔒 دسترسی
    // ─────────────────────────────────────
    function canAccess() {
        return STATE.role === 'admin' || STATE.role === 'super_admin' ||
               STATE.role === 'verifier';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — تب‌ها
    // ─────────────────────────────────────
    function _renderTabs() {
        var tabs = [
            { id: 'builder',   label: '🧱 سازنده' },
            { id: 'templates', label: '📋 قالب‌ها' },
            { id: 'result',    label: '📊 نتیجه' },
            { id: 'saved',     label: '💾 قالب‌های من' }
        ];

        var html = '<div class="wam-advrep__tabs">';
        for (var i = 0; i < tabs.length; i++) {
            html += '<button type="button" class="wam-advrep__tab' +
                (STATE.activeTab === tabs[i].id ? ' is-active' : '') + '" ' +
                'data-advrep-tab="' + tabs[i].id + '">' +
                tabs[i].label + '</button>';
        }
        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — سازنده
    // ─────────────────────────────────────
    function _renderBuilder() {
        var c = STATE.config;
        var fields = FIELDS[c.source] || [];

        var html = '<div class="wam-advrep__builder">';

        // منبع داده
        html += '<div class="wam-advrep__group">' +
            '<label>منبع داده</label>' +
            '<select data-advrep="source">';
        for (var s in SOURCE_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(SOURCE_LABELS, s)) continue;
            html += '<option value="' + s + '"' +
                (c.source === s ? ' selected' : '') + '>' +
                _esc(SOURCE_LABELS[s]) + '</option>';
        }
        html += '</select></div>';

        // گروه‌بندی سطر
        html += '<div class="wam-advrep__group">' +
            '<label>گروه‌بندی سطر (Rows)</label>';
        html += '<div class="wam-advrep__chips">';
        for (var i = 0; i < c.rows.length; i++) {
            html += '<span class="wam-advrep__chip">' +
                _esc(_fieldLabel(c.source, c.rows[i])) +
                ' <button type="button" data-advrep-action="rm-row" ' +
                'data-field="' + _esc(c.rows[i]) + '">×</button></span>';
        }
        html += '</div>';
        html += '<select data-advrep="add-row">' +
            '<option value="">+ افزودن فیلد...</option>';
        for (var j = 0; j < fields.length; j++) {
            if (c.rows.indexOf(fields[j].key) !== -1) continue;
            html += '<option value="' + _esc(fields[j].key) + '">' +
                _esc(fields[j].label) + '</option>';
        }
        html += '</select></div>';

        // گروه‌بندی ستون
        html += '<div class="wam-advrep__group">' +
            '<label>گروه‌بندی ستون (Cols)</label>';
        html += '<div class="wam-advrep__chips">';
        for (var k = 0; k < c.cols.length; k++) {
            html += '<span class="wam-advrep__chip">' +
                _esc(_fieldLabel(c.source, c.cols[k])) +
                ' <button type="button" data-advrep-action="rm-col" ' +
                'data-field="' + _esc(c.cols[k]) + '">×</button></span>';
        }
        html += '</div>';
        html += '<select data-advrep="add-col">' +
            '<option value="">+ افزودن فیلد...</option>';
        for (var m = 0; m < fields.length; m++) {
            if (c.cols.indexOf(fields[m].key) !== -1) continue;
            html += '<option value="' + _esc(fields[m].key) + '">' +
                _esc(fields[m].label) + '</option>';
        }
        html += '</select></div>';

        // محاسبه
        html += '<div class="wam-advrep__group">' +
            '<label>مقدار محاسبه</label>' +
            '<div class="wam-advrep__row">';
        html += '<select data-advrep="agg-type">';
        for (var a in AGG_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(AGG_LABELS, a)) continue;
            html += '<option value="' + a + '"' +
                (c.agg.type === a ? ' selected' : '') + '>' +
                _esc(AGG_LABELS[a]) + '</option>';
        }
        html += '</select>';
        html += '<select data-advrep="agg-field">';
        html += '<option value="__id__">—</option>';
        for (var n = 0; n < fields.length; n++) {
            html += '<option value="' + _esc(fields[n].key) + '"' +
                (c.agg.field === fields[n].key ? ' selected' : '') + '>' +
                _esc(fields[n].label) + '</option>';
        }
        html += '</select></div></div>';

        // فیلتر
        html += '<div class="wam-advrep__group">' +
            '<label>فیلترها</label>';
        if (!Array.isArray(c.filters)) c.filters = [];
        for (var fi = 0; fi < c.filters.length; fi++) {
            var f = c.filters[fi];
            html += '<div class="wam-advrep__filter-row">' +
                '<span>' + _esc(f.field) + ' ' + _esc(f.op) + ' ' +
                _esc(f.value) + '</span>' +
                '<button type="button" data-advrep-action="rm-filter" ' +
                'data-idx="' + fi + '">×</button></div>';
        }
        html += '</div>';

        // دکمه‌های اقدام
        html += '<div class="wam-advrep__actions">' +
            '<button type="button" class="wam-btn wam-btn--primary" ' +
            'data-advrep-action="generate">🔄 تولید گزارش</button>' +
            '<button type="button" class="wam-btn wam-btn--ghost" ' +
            'data-advrep-action="reset-config">↩️ ریست</button>' +
            '<button type="button" class="wam-btn wam-btn--ghost" ' +
            'data-advrep-action="save-template">💾 ذخیره قالب</button>' +
            '</div>';

        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — قالب‌ها
    // ─────────────────────────────────────
    function _renderTemplates() {
        var list = getTemplates();
        var html = '<div class="wam-advrep__templates">';

        if (list.length === 0) {
            html += '<div class="wam-empty">قالبی موجود نیست.</div>';
        } else {
            html += '<ul class="wam-advrep__template-list">';
            for (var i = 0; i < list.length; i++) {
                var t = list[i];
                html += '<li class="wam-advrep__template" ' +
                    'data-tpl-id="' + _esc(t.id) + '">' +
                    '<div class="wam-advrep__template-info">' +
                    '<div class="wam-advrep__template-name">' +
                    _esc(t.name) + '</div>' +
                    '<div class="wam-advrep__template-meta">' +
                    _esc(SOURCE_LABELS[t.source] || t.source) + ' · ' +
                    _esc(AGG_LABELS[t.agg && t.agg.type] || '') +
                    '</div></div>' +
                    '<div class="wam-advrep__template-actions">' +
                    '<button class="wam-btn wam-btn--sm" ' +
                    'data-advrep-action="load-tpl" data-id="' +
                    _esc(t.id) + '">بارگذاری</button>' +
                    '<button class="wam-btn-icon wam-btn-icon--danger" ' +
                    'data-advrep-action="delete-tpl" data-id="' +
                    _esc(t.id) + '">🗑️</button>' +
                    '</div></li>';
            }
            html += '</ul>';
        }
        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نتیجه
    // ─────────────────────────────────────
    function _renderResult() {
        var r = STATE.result;
        if (!r || !r.pivot) {
            return '<div class="wam-empty">' +
                'ابتدا از تب «سازنده» گزارش تولید کنید.</div>';
        }

        var p = r.pivot;

        var html = '<div class="wam-advrep__result">';

        // هدر
        html += '<div class="wam-advrep__result-header">' +
            '<span>منبع: <strong>' +
            _esc(SOURCE_LABELS[r.source] || r.source) + '</strong></span>' +
            '<span>رکوردهای فیلترشده: <strong>' +
            _fa(r.filteredCount) + '</strong> از ' +
            _fa(r.rawCount) + '</span>' +
            '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
            'data-advrep-action="export">📤 CSV</button>' +
            '</div>';

        // جدول Pivot
        html += '<div class="wam-advrep__pivot-wrap">' +
            '<table class="wam-advrep__pivot"><thead><tr>';

        for (var li = 0; li < r.rowLabels.length; li++) {
            html += '<th>' + _esc(r.rowLabels[li]) + '</th>';
        }
        for (var ci = 0; ci < p.colKeys.length; ci++) {
            html += '<th>' + _esc(p.colKeys[ci] === '__total__'
                ? 'کل'
                : p.colKeys[ci]) + '</th>';
        }
        html += '<th class="wam-advrep__total-col">جمع</th>';
        html += '</tr></thead><tbody>';

        for (var ri = 0; ri < p.rows.length; ri++) {
            var row = p.rows[ri];
            html += '<tr>';
            for (var pi = 0; pi < row.rowParts.length; pi++) {
                html += '<td>' + _esc(row.rowParts[pi]) + '</td>';
            }
            for (var cj = 0; cj < p.colKeys.length; cj++) {
                html += '<td class="wam-advrep__num">' +
                    _amt(row.cells[p.colKeys[cj]] || 0) + '</td>';
            }
            html += '<td class="wam-advrep__num wam-advrep__total-col">' +
                _amt(row.total) + '</td>';
            html += '</tr>';
        }

        // جمع کل
        html += '<tr class="wam-advrep__footer-row">';
        html += '<td colspan="' + r.rowLabels.length + '">جمع کل</td>';
        for (var ck = 0; ck < p.colKeys.length; ck++) {
            html += '<td class="wam-advrep__num">' +
                _amt(p.colTotals[p.colKeys[ck]] || 0) + '</td>';
        }
        html += '<td class="wam-advrep__num wam-advrep__total-col">' +
            _amt(p.grandTotal) + '</td>';
        html += '</tr>';

        html += '</tbody></table></div>';
        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — قالب‌های من
    // ─────────────────────────────────────
    function _renderSaved() {
        var list = getTemplates();
        if (list.length === 0) {
            return '<div class="wam-empty">هنوز قالبی ذخیره نکرده‌اید.</div>';
        }
        return '<div class="wam-advrep__saved">' +
            '<p>تعداد قالب‌ها: <strong>' + _fa(list.length) + '</strong></p>' +
            '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;

        var body = '';
        if (STATE.activeTab === 'builder')   body = _renderBuilder();
        else if (STATE.activeTab === 'templates') body = _renderTemplates();
        else if (STATE.activeTab === 'result')    body = _renderResult();
        else if (STATE.activeTab === 'saved')     body = _renderSaved();

        var html = '<div class="wam-advrep">' +
            '<div class="wam-advrep__header">' +
            '<h3>📈 گزارش‌های پیشرفته</h3>' +
            '<p class="wam-advrep__desc">' +
            'Pivot، گروه‌بندی چندسطحی، فیلتر پیشرفته</p>' +
            '</div>' +
            _renderTabs() +
            '<div class="wam-advrep__body">' + body + '</div>' +
            '</div>';

        STATE.root.innerHTML = html;
        _bindEvents();

        _emit(AdvReportEvents.RENDERED, { tab: STATE.activeTab });
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents() {
        if (!STATE.root) return;

        // تب‌ها
        var tabs = STATE.root.querySelectorAll('[data-advrep-tab]');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].addEventListener('click', function () {
                STATE.activeTab = this.getAttribute('data-advrep-tab');
                _emit(AdvReportEvents.TAB_CHANGED, { tab: STATE.activeTab });
                render();
            });
        }

        // اکشن‌ها
        var btns = STATE.root.querySelectorAll('[data-advrep-action]');
        for (var j = 0; j < btns.length; j++) {
            btns[j].addEventListener('click', _handleAction);
        }

        // select‌ها
        var sourceEl = STATE.root.querySelector('[data-advrep="source"]');
        if (sourceEl) {
            sourceEl.addEventListener('change', function () {
                STATE.config.source = this.value;
                STATE.config.rows = [];
                STATE.config.cols = [];
                var fields = FIELDS[this.value] || [];
                STATE.config.agg = {
                    field: fields.length > 0 ? fields[0].key : '__id__',
                    type: 'count'
                };
                render();
            });
        }

        var addRowEl = STATE.root.querySelector('[data-advrep="add-row"]');
        if (addRowEl) {
            addRowEl.addEventListener('change', function () {
                if (this.value) {
                    addRowField(this.value);
                    render();
                }
            });
        }

        var addColEl = STATE.root.querySelector('[data-advrep="add-col"]');
        if (addColEl) {
            addColEl.addEventListener('change', function () {
                if (this.value) {
                    addColField(this.value);
                    render();
                }
            });
        }

        var aggTypeEl = STATE.root.querySelector('[data-advrep="agg-type"]');
        if (aggTypeEl) {
            aggTypeEl.addEventListener('change', function () {
                STATE.config.agg.type = this.value;
            });
        }

        var aggFieldEl = STATE.root.querySelector('[data-advrep="agg-field"]');
        if (aggFieldEl) {
            aggFieldEl.addEventListener('change', function () {
                STATE.config.agg.field = this.value;
            });
        }
    }

    function _handleAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-advrep-action');
        var field = this.getAttribute('data-field');
        var id = this.getAttribute('data-id');
        var idx = this.getAttribute('data-idx');

        if (a === 'rm-row') { removeRowField(field); render(); return; }
        if (a === 'rm-col') { removeColField(field); render(); return; }
        if (a === 'generate') {
            generatePivot(STATE.config);
            STATE.activeTab = 'result';
            render();
            _toast('success', 'گزارش تولید شد', 'موفق');
            return;
        }
        if (a === 'reset-config') {
            STATE.config = {
                source: 'payments',
                rows: [],
                cols: [],
                agg: { field: 'amount', type: 'sum' },
                filters: [],
                sort: { by: '', dir: 'desc' },
                limit: 0
            };
            render();
            return;
        }
        if (a === 'save-template') {
            var name = prompt('نام قالب:', '');
            if (!name) return;
            var r = saveTemplate(name, STATE.config);
            if (r.ok) {
                render();
                _toast('success', 'قالب ذخیره شد', 'موفق');
            } else {
                _toast('error', 'خطا', 'خطا');
            }
            return;
        }
        if (a === 'load-tpl') {
            var r2 = loadTemplate(id);
            if (r2.ok) {
                STATE.activeTab = 'builder';
                render();
                _toast('success', 'قالب بارگذاری شد', 'موفق');
            }
            return;
        }
        if (a === 'delete-tpl') {
            var r3 = deleteTemplate(id);
            if (r3.ok) {
                render();
                _toast('success', 'قالب حذف شد', 'موفق');
            }
            return;
        }
        if (a === 'rm-filter') {
            STATE.config.filters.splice(parseInt(idx, 10), 1);
            render();
            return;
        }
        if (a === 'export') {
            exportCSV();
            return;
        }
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
            if (!canAccess()) {
                if (typeof WamPayGuard !== 'undefined') {
                    WamPayGuard.redirectToRoleHome(user.role);
                }
                return;
            }
            STATE.userId = user.id;
            STATE.role = user.role;

            var root = options.root ||
                       document.querySelector('[' + ROOT_ATTR + ']') ||
                       document.querySelector('.wam-advrep');
            if (!root) {
                if (options.debug) console.warn('[advanced-reports] root پیدا نشد');
                return;
            }
            STATE.root = root;

            if (options.source) STATE.config.source = options.source;
            if (options.templateId) loadTemplate(options.templateId);

            STATE.templates = _loadTemplates();
            render();

            STATE.installed = true;
            _emit(AdvReportEvents.READY, {
                version: VERSION, role: STATE.role
            });

            if (options.debug) {
                console.log('[advanced-reports] v' + VERSION + ' آماده');
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
        STATE.result = null;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            version: VERSION,
            installed: STATE.installed,
            role: STATE.role,
            activeTab: STATE.activeTab,
            source: STATE.config.source,
            hasResult: !!STATE.result,
            templatesCount: getTemplates().length
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
    var WamAdvancedReports = {
        VERSION: VERSION,
        EVENTS: AdvReportEvents,
        ROOT_ATTR: ROOT_ATTR,
        TEMPLATES_KEY: TEMPLATES_KEY,
        DATA_SOURCES: DATA_SOURCES,
        SOURCE_LABELS: SOURCE_LABELS,
        AGG_TYPES: AGG_TYPES,
        AGG_LABELS: AGG_LABELS,
        FIELDS: FIELDS,
        PIVOT_TEMPLATES: PIVOT_TEMPLATES,

        install: install,
        uninstall: uninstall,
        render: render,

        generatePivot: generatePivot,
        setConfig: setConfig,
        addRowField: addRowField,
        removeRowField: removeRowField,
        addColField: addColField,
        removeColField: removeColField,

        saveTemplate: saveTemplate,
        loadTemplate: loadTemplate,
        deleteTemplate: deleteTemplate,
        getTemplates: getTemplates,

        exportCSV: exportCSV,

        setActiveTab: function (tab) {
            if (['builder', 'templates', 'result', 'saved'].indexOf(tab) === -1) return false;
            STATE.activeTab = tab;
            render();
            return true;
        },
        getActiveTab: function () { return STATE.activeTab; },

        getResult: function () { return STATE.result; },
        getConfig: function () { return JSON.parse(JSON.stringify(STATE.config)); },

        canAccess: canAccess,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamAdvancedReports = WamAdvancedReports;
    window.AdvReportEvents = AdvReportEvents;

    // نصب خودکار
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-adv-reports-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-advrep')) {
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