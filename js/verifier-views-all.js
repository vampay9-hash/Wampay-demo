// ==========================================
// وام پی — Verifier Panel
// فایل: verifier-views-all.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: نمای جدول کامل پرونده‌ها + فیلترها + عملیات گروهی
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var ROOT_ATTR = 'data-verifier-views-all';
    var PAGE_SIZE = 15;

    var COLUMNS = [
        { key: 'caseId',        label: 'شناسه',      sortable: true,  width: '110px' },
        { key: 'applicantName', label: 'متقاضی',     sortable: true },
        { key: 'bank',          label: 'بانک',       sortable: true,  width: '90px' },
        { key: 'loanAmount',    label: 'مبلغ',       sortable: true,  width: '120px' },
        { key: 'purpose',       label: 'هدف',        sortable: false },
        { key: 'priority',      label: 'اولویت',     sortable: true,  width: '80px' },
        { key: 'step',          label: 'مرحله',      sortable: false, width: '120px' },
        { key: 'age',           label: 'مدت انتظار', sortable: true,  width: '100px' }
    ];

    var PRIORITY_LABELS = {
        low: 'کم', normal: 'معمولی', high: 'بالا', urgent: 'فوری'
    };

    var STEP_TITLES = {
        step_1: 'ثبت درخواست', step_2: 'بارگذاری مدارک',
        step_3: 'بررسی اولیه', step_4: 'اعتبارسنجی',
        step_5: 'تأیید ادمین', step_6: 'ارسال به بانک',
        step_7: 'تأیید بانک', step_8: 'تنظیم قرارداد',
        step_9: 'پرداخت'
    };

    var BANKS = [
        'ملی', 'صادرات', 'تجارت', 'سپه', 'کشاورزی', 'مسکن',
        'رسالت', 'پاسارگاد', 'پارسیان', 'سامان', 'ملت', 'رفاه',
        'مهر ایران', 'قوامین', 'شهر', 'آینده', 'سینا', 'دی'
    ];

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        cases: [],
        page: 1,
        sortColumn: 'age',
        sortDirection: 'desc',
        selectedIds: {},
        viewMode: 'table',      // table | cards
        listeners: [],
        _boundIds: {}
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var VAllEvents = {
        LOADED:     'vall.loaded',
        RENDERED:   'vall.rendered',
        ROW_CLICK:  'vall.row_click',
        SORT:       'vall.sort',
        PAGE:       'vall.page',
        SELECT:     'vall.select',
        VIEW_MODE:  'vall.view_mode',
        ACTION:     'vall.action'
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
        if (n === null || n === undefined || n === '') return '—';
        var x = Number(n);
        if (isNaN(x)) return '—';
        return x.toLocaleString('en-US').replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _en(s) {
        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.toEnglishDigits) {
            return WamPersianDate.toEnglishDigits(s);
        }
        return String(s || '').replace(/[0-۹]/g, function (d) {
            return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
        });
    }

    function _relTime(ts) {
        if (!ts) return '—';
        var d = Date.now() - ts;
        var s = Math.floor(d / 1000);
        if (s < 60) return 'همین الان';
        var m = Math.floor(s / 60);
        if (m < 60) return _fa(m) + ' دقیقه';
        var h = Math.floor(m / 60);
        if (h < 24) return _fa(h) + ' ساعت';
        var day = Math.floor(h / 24);
        if (day < 30) return _fa(day) + ' روز';
        var mon = Math.floor(day / 30);
        if (mon < 12) return _fa(mon) + ' ماه';
        return _fa(Math.floor(mon / 12)) + ' سال';
    }

    function _ageDays(c) {
        if (!c) return 0;
        var created = c.createdAt || c.updatedAt || Date.now();
        return Math.floor((Date.now() - created) / (24 * 60 * 60 * 1000));
    }

    function _stepTitle(stepId) {
        return STEP_TITLES[stepId] || stepId || '—';
    }

    function _priorityLabel(p) {
        return PRIORITY_LABELS[p] || '—';
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
    function _loadCases() {
        if (typeof CaseRepository === 'undefined') return [];
        try {
            var all = CaseRepository.getAll() || [];
            var list = [];
            for (var i = 0; i < all.length; i++) {
                var c = all[i];
                if (!c) continue;
                var st = c.status || 'draft';
                if (st === 'cancelled' || st === 'archived') continue;
                list.push(c);
            }
            return list;
        } catch (e) {
            return [];
        }
    }

    function _getFiltered() {
        // اگر ماژول Actions لود شده، از آن استفاده کن
        if (typeof WamVerifierActions !== 'undefined' &&
            WamVerifierActions.getFiltered) {
            try {
                var f = WamVerifierActions.getFiltered();
                if (Array.isArray(f) && f.length > 0) {
                    // Aها ممکن است خالی باشد اگر فیلتر نتیجه نداده باشد
                    if (f.length > 0) return f.slice();
                }
            } catch (e) { /* بی‌صدا */ }
        }
        return STATE.cases.slice();
    }

    // ─────────────────────────────────────
    // 🔀 مرتب‌سازی
    // ─────────────────────────────────────
    function _applySort(list) {
        var col = STATE.sortColumn;
        var dir = STATE.sortDirection === 'asc' ? 1 : -1;

        list.sort(function (a, b) {
            var va = _getSortValue(a, col);
            var vb = _getSortValue(b, col);

            if (typeof va === 'number' && typeof vb === 'number') {
                return (va - vb) * dir;
            }
            va = String(va || '').toLowerCase();
            vb = String(vb || '').toLowerCase();
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return 0;
        });
        return list;
    }

    function _getSortValue(c, col) {
        if (!c) return '';
        if (col === 'caseId')        return c.caseId || '';
        if (col === 'applicantName') return c.applicantName || '';
        if (col === 'bank')          return c.bank || '';
        if (col === 'loanAmount')    return Number(c.loanAmount) || 0;
        if (col === 'priority') {
            var order = { low: 1, normal: 2, high: 3, urgent: 4 };
            return order[c.priority] || 0;
        }
        if (col === 'age') {
            // برای age: کمتر = جدیدتر. برای sort desc = قدیمی‌تر بالاتر
            return _ageDays(c);
        }
        return '';
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

    function _syncWithActions() {
        // انتخاب‌ها را با WamVerifierActions همگام کن
        if (typeof WamVerifierActions === 'undefined') return;
        if (!WamVerifierActions.clearSelection) return;

        // از API خودش استفاده کن برای همگام‌سازی
        var ids = _getSelectedIds();
        // به Actions انتقال بده
        if (WamVerifierActions.toggleSelect) {
            // پاک کن اول
            WamVerifierActions.clearSelection();
            for (var i = 0; i < ids.length; i++) {
                WamVerifierActions.toggleSelect(ids[i], true);
            }
        }
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نوار ابزار
    // ─────────────────────────────────────
    function _renderToolbar() {
        var selected = _getSelectedIds().length;

        var html = '<div class="wam-vall-toolbar">';

        // سمت راست — انتخاب‌ها
        html += '<div class="wam-vall-toolbar__left">';
        html += '<div class="wam-vall-toolbar__count">' +
                _fa(STATE.cases.length) + ' پرونده' +
                (selected > 0 ? ' — ' + _fa(selected) + ' انتخاب شده' : '') +
                '</div>';
        html += '</div>';

        // سمت چپ — اقدامات
        html += '<div class="wam-vall-toolbar__right">';

        if (selected > 0) {
            html += '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
                    'data-vall-action="bulk-approve">✅ تأیید گروهی</button>';
            html += '<button class="wam-btn wam-btn--sm wam-btn--danger" ' +
                    'data-vall-action="bulk-reject">❌ رد گروهی</button>';
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-vall-action="clear-selection">لغو</button>';
        } else {
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-vall-action="export">📤 CSV</button>';
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-vall-action="refresh">🔄</button>';
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-vall-action="toggle-view" title="حالت نمایش">' +
                    (STATE.viewMode === 'table' ? '🃏' : '📋') +
                    '</button>';
        }

        html += '</div>';
        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — هدر جدول
    // ─────────────────────────────────────
    function _renderTableHead() {
        var html = '<thead><tr>';

        html += '<th class="wam-vall__check">' +
                '<input type="checkbox" data-vall="select-all"' +
                (_getSelectedIds().length > 0 ? ' checked' : '') + '></th>';

        for (var i = 0; i < COLUMNS.length; i++) {
            var col = COLUMNS[i];
            var sortIcon = '';
            var isCurrent = STATE.sortColumn === col.key;
            if (isCurrent) {
                sortIcon = STATE.sortDirection === 'asc' ? ' ▲' : ' ▼';
            }
            var attrs = col.sortable ? ' data-vall-sort="' + col.key + '"' : '';
            var cls = 'wam-vall__th' + (col.sortable ? ' is-sortable' : '') +
                      (isCurrent ? ' is-active' : '');
            html += '<th class="' + cls + '"' + attrs +
                    (col.width ? ' style="width:' + col.width + '"' : '') + '>' +
                    _esc(col.label) + sortIcon + '</th>';
        }

        html += '<th class="wam-vall__actions">عملیات</th>';
        html += '</tr></thead>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ردیف جدول
    // ─────────────────────────────────────
    function _renderTableRow(c) {
        if (!c) return '';
        var priority = c.priority || 'normal';
        var age = _ageDays(c);
        var isUrgent = age > 3;
        var selected = !!STATE.selectedIds[c.caseId];

        var html = '<tr data-vall-case="' + _esc(c.caseId) + '"' +
                   (selected ? ' class="is-selected"' : '') +
                   (isUrgent ? ' data-urgent="1"' : '') + '>';

        html += '<td><input type="checkbox" data-vall="select-row"' +
                (selected ? ' checked' : '') + '></td>';

        html += '<td class="wam-vall__id"><code>' +
                _esc(c.caseId) + '</code>' +
                (isUrgent ? ' <span class="wam-vall__urgent">⏰</span>' : '') +
                '</td>';

        html += '<td class="wam-vall__name">' +
                _esc(c.applicantName || '—') + '</td>';

        html += '<td>' + _esc(c.bank || '—') + '</td>';

        html += '<td class="wam-vall__amount">' +
                _amt(c.loanAmount) + '</td>';

        html += '<td class="wam-vall__purpose">' +
                _esc(c.purpose || '—') + '</td>';

        html += '<td><span class="wam-vall__priority wam-vall__priority--' +
                _esc(priority) + '">' +
                _esc(_priorityLabel(priority)) + '</span></td>';

        html += '<td class="wam-vall__step">' +
                _esc(_stepTitle(c.currentStep)) + '</td>';

        html += '<td class="wam-vall__age' + (isUrgent ? ' is-urgent' : '') + '">' +
                _fa(age) + ' روز</td>';

        html += '<td class="wam-vall__actions">';
        html += '<button class="wam-btn-icon" data-vall-row-action="view" ' +
                'title="مشاهده">👁️</button>';
        html += '<button class="wam-btn-icon" data-vall-row-action="review" ' +
                'title="بررسی">🔍</button>';
        html += '</td>';

        html += '</tr>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت (view=cards)
    // ─────────────────────────────────────
    function _renderCard(c) {
        if (!c) return '';
        var priority = c.priority || 'normal';
        var age = _ageDays(c);
        var isUrgent = age > 3;
        var selected = !!STATE.selectedIds[c.caseId];

        return '<div class="wam-vall-card' +
               (selected ? ' is-selected' : '') +
               (isUrgent ? ' is-urgent' : '') + '" ' +
               'data-vall-case="' + _esc(c.caseId) + '">' +
               '<div class="wam-vall-card__head">' +
               '<input type="checkbox" data-vall="select-row"' +
               (selected ? ' checked' : '') + '>' +
               '<code>' + _esc(c.caseId) + '</code>' +
               '<span class="wam-vall__priority wam-vall__priority--' +
               _esc(priority) + '">' + _esc(_priorityLabel(priority)) + '</span>' +
               '</div>' +
               '<div class="wam-vall-card__name">' +
               _esc(c.applicantName || '—') + '</div>' +
               '<div class="wam-vall-card__rows">' +
               '<div><span>بانک:</span> ' + _esc(c.bank || '—') + '</div>' +
               '<div><span>مبلغ:</span> ' + _amt(c.loanAmount) + ' ریال</div>' +
               '<div><span>مرحله:</span> ' + _esc(_stepTitle(c.currentStep)) + '</div>' +
               '<div><span>انتظار:</span> ' + _fa(age) + ' روز</div>' +
               '</div>' +
               '<div class="wam-vall-card__foot">' +
               '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
               'data-vall-row-action="review">🔍 بررسی</button>' +
               '</div>' +
               '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — صفحه‌بندی
    // ─────────────────────────────────────
    function _renderPagination(total) {
        var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (pages <= 1) return '';

        var current = STATE.page;
        var html = '<div class="wam-vall__pagination">';

        html += '<button data-vall-page="' + (current - 1) + '"' +
                (current === 1 ? ' disabled' : '') + '>‹ قبلی</button>';

        var start = Math.max(1, current - 2);
        var end = Math.min(pages, current + 2);
        if (start > 1) {
            html += '<button data-vall-page="1">' + _fa(1) + '</button>';
            if (start > 2) html += '<span>…</span>';
        }

        for (var i = start; i <= end; i++) {
            html += '<button data-vall-page="' + i + '"' +
                    (i === current ? ' class="is-active"' : '') + '>' +
                    _fa(i) + '</button>';
        }

        if (end < pages) {
            if (end < pages - 1) html += '<span>…</span>';
            html += '<button data-vall-page="' + pages + '">' +
                    _fa(pages) + '</button>';
        }

        html += '<button data-vall-page="' + (current + 1) + '"' +
                (current === pages ? ' disabled' : '') + '>بعدی ›</button>';
        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;

        var list = _getFiltered();
        _applySort(list);

        var total = list.length;
        var start = (STATE.page - 1) * PAGE_SIZE;
        var end = Math.min(start + PAGE_SIZE, total);
        var pageItems = list.slice(start, end);

        var body = '';

        if (total === 0) {
            body = '<div class="wam-empty">' +
                   '<div class="wam-empty__icon">📭</div>' +
                   '<p>پرونده‌ای برای نمایش نیست.</p>' +
                   '</div>';
        } else if (STATE.viewMode === 'table') {
            body = '<div class="wam-vall__table-wrap">' +
                   '<table class="wam-vall__table">' +
                   _renderTableHead() + '<tbody>';
            for (var i = 0; i < pageItems.length; i++) {
                body += _renderTableRow(pageItems[i]);
            }
            body += '</tbody></table></div>';
        } else {
            body = '<div class="wam-vall__cards">';
            for (var j = 0; j < pageItems.length; j++) {
                body += _renderCard(pageItems[j]);
            }
            body += '</div>';
        }

        var html =
            '<div class="wam-vall">' +
                _renderToolbar() +
                body +
                _renderPagination(total) +
            '</div>';

        STATE.root.innerHTML = html;

        _bindEvents();

        _emit(VAllEvents.RENDERED, {
            total: total,
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

        // دکمه‌های نوار ابزار
        var toolbarBtns = STATE.root.querySelectorAll('[data-vall-action]');
        for (var i = 0; i < toolbarBtns.length; i++) {
            if (toolbarBtns[i].dataset.vallBound) continue;
            toolbarBtns[i].addEventListener('click', _handleToolbarAction);
            toolbarBtns[i].dataset.vallBound = '1';
        }

        // هدر مرتب‌سازی
        var sortTh = STATE.root.querySelectorAll('[data-vall-sort]');
        for (var j = 0; j < sortTh.length; j++) {
            if (sortTh[j].dataset.vallBound) continue;
            sortTh[j].addEventListener('click', _handleSortClick);
            sortTh[j].dataset.vallBound = '1';
        }

        // انتخاب همه
        var selectAll = STATE.root.querySelector('[data-vall="select-all"]');
        if (selectAll && !selectAll.dataset.vallBound) {
            selectAll.addEventListener('change', _handleSelectAll);
            selectAll.dataset.vallBound = '1';
        }

        // چک‌باکس ردیف
        var rowChecks = STATE.root.querySelectorAll('[data-vall="select-row"]');
        for (var k = 0; k < rowChecks.length; k++) {
            if (rowChecks[k].dataset.vallBound) continue;
            rowChecks[k].addEventListener('change', _handleRowSelect);
            rowChecks[k].dataset.vallBound = '1';
        }

        // اکشن‌های ردیف
        var rowActions = STATE.root.querySelectorAll('[data-vall-row-action]');
        for (var m = 0; m < rowActions.length; m++) {
            if (rowActions[m].dataset.vallBound) continue;
            rowActions[m].addEventListener('click', _handleRowAction);
            rowActions[m].dataset.vallBound = '1';
        }

        // صفحه‌بندی
        var pageBtns = STATE.root.querySelectorAll('[data-vall-page]');
        for (var n = 0; n < pageBtns.length; n++) {
            if (pageBtns[n].dataset.vallBound) continue;
            pageBtns[n].addEventListener('click', _handlePageClick);
            pageBtns[n].dataset.vallBound = '1';
        }

        // کلیک روی ردیف
        var rows = STATE.root.querySelectorAll('tr[data-vall-case]');
        for (var r = 0; r < rows.length; r++) {
            if (rows[r].dataset.vallBound) continue;
            rows[r].addEventListener('click', _handleRowClick);
            rows[r].dataset.vallBound = '1';
        }
    }

    function _handleToolbarAction(e) {
        e.preventDefault();
        var action = this.getAttribute('data-vall-action');

        if (action === 'refresh') {
            reload();
            _toast('success', 'بروزرسانی شد', 'موفق');
            return;
        }
        if (action === 'export') {
            if (typeof WamVerifierActions !== 'undefined' &&
                WamVerifierActions.exportFiltered) {
                WamVerifierActions.exportFiltered();
            }
            return;
        }
        if (action === 'toggle-view') {
            STATE.viewMode = STATE.viewMode === 'table' ? 'cards' : 'table';
            render();
            _emit(VAllEvents.VIEW_MODE, { mode: STATE.viewMode });
            return;
        }
        if (action === 'clear-selection') {
            STATE.selectedIds = {};
            render();
            return;
        }
        if (action === 'bulk-approve') {
            _confirmBulkApprove();
            return;
        }
        if (action === 'bulk-reject') {
            _confirmBulkReject();
            return;
        }
    }

    function _handleSortClick(e) {
        e.preventDefault();
        var col = this.getAttribute('data-vall-sort');
        if (!col) return;
        if (STATE.sortColumn === col) {
            STATE.sortDirection = STATE.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            STATE.sortColumn = col;
            STATE.sortDirection = 'asc';
        }
        STATE.page = 1;
        render();
        _emit(VAllEvents.SORT, { column: col, direction: STATE.sortDirection });
    }

    function _handleSelectAll() {
        var checked = this.checked;
        // فقط موارد صفحه جاری
        var list = _getFiltered();
        _applySort(list);
        var start = (STATE.page - 1) * PAGE_SIZE;
        var end = Math.min(start + PAGE_SIZE, list.length);
        for (var i = start; i < end; i++) {
            if (checked) STATE.selectedIds[list[i].caseId] = true;
            else delete STATE.selectedIds[list[i].caseId];
        }
        render();
        _emit(VAllEvents.SELECT, { count: _getSelectedIds().length });
    }

    function _handleRowSelect(e) {
        e.stopPropagation();
        var tr = this.closest('[data-vall-case]');
        if (!tr) return;
        var caseId = tr.getAttribute('data-vall-case');
        if (!caseId) return;
        if (this.checked) STATE.selectedIds[caseId] = true;
        else delete STATE.selectedIds[caseId];
        render();
        _emit(VAllEvents.SELECT, { count: _getSelectedIds().length });
    }

    function _handleRowClick(e) {
        // اگر روی checkbox یا دکمه نیست
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' ||
            e.target.closest('button')) return;

        var caseId = this.getAttribute('data-vall-case');
        if (caseId) _openReview(caseId);
    }

    function _handleRowAction(e) {
        e.preventDefault();
        e.stopPropagation();
        var action = this.getAttribute('data-vall-row-action');
        var tr = this.closest('[data-vall-case]');
        if (!tr) return;
        var caseId = tr.getAttribute('data-vall-case');
        if (!caseId) return;

        if (action === 'view') {
            _openDetails(caseId);
        } else if (action === 'review') {
            _openReview(caseId);
        }
    }

    function _handlePageClick() {
        var p = parseInt(this.getAttribute('data-vall-page'), 10);
        if (isNaN(p) || p < 1) return;
        STATE.page = p;
        render();
        _emit(VAllEvents.PAGE, { page: p });
    }

    // ─────────────────────────────────────
    // 🎯 باز کردن پرونده
    // ─────────────────────────────────────
    function _openReview(caseId) {
        if (!caseId) return;
        _emit(VAllEvents.ROW_CLICK, { caseId: caseId, action: 'review' });
        window.location.href = 'verifier-wizard.html?id=' +
            encodeURIComponent(caseId);
    }

    function _openDetails(caseId) {
        if (!caseId) return;
        _emit(VAllEvents.ROW_CLICK, { caseId: caseId, action: 'view' });

        var c = null;
        for (var i = 0; i < STATE.cases.length; i++) {
            if (STATE.cases[i].caseId === caseId) { c = STATE.cases[i]; break; }
        }
        if (!c) return;

        var existing = document.getElementById('wamVallDetailModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var modal = document.createElement('div');
        modal.id = 'wamVallDetailModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel wam-modal__panel--wide">' +
                '<header class="wam-modal__head">' +
                    '<h3>' + _esc(c.caseId) + '</h3>' +
                    '<button type="button" class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<div class="wam-modal__body">' +
                    _detailRow('متقاضی', c.applicantName) +
                    _detailRow('موبایل', c.applicantMobile) +
                    _detailRow('کد ملی', c.applicantNationalCode) +
                    _detailRow('بانک', c.bank) +
                    _detailRow('مبلغ', _amt(c.loanAmount) + ' ریال') +
                    _detailRow('مدت', c.loanDuration ? _fa(c.loanDuration) + ' ماه' : '—') +
                    _detailRow('هدف', c.purpose) +
                    _detailRow('مرحله', _stepTitle(c.currentStep)) +
                    _detailRow('وضعیت', c.status) +
                    _detailRow('کارگزار', c.brokerName) +
                '</div>' +
                '<footer class="wam-modal__footer">' +
                    '<button type="button" class="wam-btn wam-btn--primary" ' +
                    'data-vall-action="review-from-modal" ' +
                    'data-case-id="' + _esc(c.caseId) + '">🔍 بررسی پرونده</button>' +
                '</footer>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var i = 0; i < cbs.length; i++) {
            cbs[i].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }

        var reviewBtn = modal.querySelector('[data-vall-action="review-from-modal"]');
        if (reviewBtn) {
            reviewBtn.addEventListener('click', function () {
                var id = this.getAttribute('data-case-id');
                if (modal.parentNode) modal.parentNode.removeChild(modal);
                _openReview(id);
            });
        }
    }

    function _detailRow(label, value) {
        return '<div class="wam-vall-detail-row">' +
               '<span class="wam-vall-detail-row__label">' +
               _esc(label) + ':</span>' +
               '<span class="wam-vall-detail-row__value">' +
               _esc(value || '—') + '</span></div>';
    }

    // ─────────────────────────────────────
    // 🎯 عملیات گروهی با تأیید
    // ─────────────────────────────────────
    function _confirmBulkApprove() {
        var ids = _getSelectedIds();
        if (ids.length === 0) return;
        var msg = _fa(ids.length) + ' پرونده به‌صورت گروهی تأیید شوند؟';

        var doIt = function () {
            if (typeof WamVerifierActions === 'undefined' ||
                !WamVerifierActions.bulkApprove) {
                _toast('error', 'ماژول اکشن‌ها یافت نشد', 'خطا');
                return;
            }
            _syncWithActions();
            var r = WamVerifierActions.bulkApprove({
                note: 'تأیید گروهی از جدول'
            });
            if (r && r.ok) {
                STATE.selectedIds = {};
                reload();
            }
        };

        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('تأیید گروهی', msg).then(function (ok) {
                if (ok) doIt();
            });
        } else if (window.confirm(msg)) {
            doIt();
        }
    }

    function _confirmBulkReject() {
        var ids = _getSelectedIds();
        if (ids.length === 0) return;

        var existing = document.getElementById('wamBulkRejectModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var modal = document.createElement('div');
        modal.id = 'wamBulkRejectModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>❌ رد گروهی</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form id="wamBulkRejectForm" class="wam-modal__body">' +
                    '<p>' + _fa(ids.length) + ' پرونده رد خواهند شد. ' +
                    'دلیل رد را وارد کنید:</p>' +
                    '<textarea name="note" rows="4" ' +
                    'placeholder="دلیل (حداقل ۱۰ کاراکتر)..." required></textarea>' +
                    '<div class="wam-field__error" data-error="note"></div>' +
                    '<footer class="wam-modal__footer">' +
                        '<button type="button" class="wam-btn wam-btn--ghost" ' +
                        'data-close>انصراف</button>' +
                        '<button type="submit" class="wam-btn wam-btn--danger">' +
                        'رد گروهی</button>' +
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

        var form = modal.querySelector('#wamBulkRejectForm');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var note = form.querySelector('[name="note"]').value.trim();
                if (note.length < 10) {
                    var errEl = form.querySelector('[data-error="note"]');
                    if (errEl) {
                        errEl.textContent = 'دلیل باید حداقل ۱۰ کاراکتر باشد';
                        errEl.style.display = 'block';
                    }
                    return;
                }

                if (typeof WamVerifierActions === 'undefined' ||
                    !WamVerifierActions.bulkReject) {
                    _toast('error', 'ماژول اکشن‌ها یافت نشد', 'خطا');
                    return;
                }

                _syncWithActions();
                var r = WamVerifierActions.bulkReject({ note: note });
                if (modal.parentNode) modal.parentNode.removeChild(modal);

                if (r && r.ok) {
                    STATE.selectedIds = {};
                    reload();
                }
            });
        }
    }

    // ─────────────────────────────────────
    // 🔄 reload
    // ─────────────────────────────────────
    function reload() {
        STATE.cases = _loadCases();
        STATE.page = 1;

        // پاکسازی انتخاب‌های نامعتبر
        var validIds = {};
        for (var i = 0; i < STATE.cases.length; i++) {
            if (STATE.selectedIds[STATE.cases[i].caseId]) {
                validIds[STATE.cases[i].caseId] = true;
            }
        }
        STATE.selectedIds = validIds;

        render();
        _emit(VAllEvents.LOADED, {
            count: STATE.cases.length, at: Date.now()
        });
        return STATE.cases.length;
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var run = function () {
            var me = (typeof WamPermissions !== 'undefined')
                ? WamPermissions.getCurrentUser() : null;
            if (!me) {
                if (typeof WamPayGuard !== 'undefined') {
                    WamPayGuard.redirectToLogin('not_logged_in');
                }
                return;
            }
            if (me.role !== 'verifier' && me.role !== 'admin' &&
                me.role !== 'super_admin') {
                if (typeof WamPayGuard !== 'undefined') {
                    WamPayGuard.redirectToRoleHome(me.role);
                }
                return;
            }

            var root = options.root ||
                       document.querySelector('[' + ROOT_ATTR + ']') ||
                       document.querySelector('.wam-verifier-views-all');
            if (!root) {
                if (options.debug) console.warn('[verifier-views-all] root پیدا نشد');
                return;
            }
            STATE.root = root;

            STATE.cases = _loadCases();
            render();

            STATE.installed = true;
            _emit(VAllEvents.LOADED, {
                count: STATE.cases.length, at: Date.now()
            });

            if (options.debug) {
                console.log('[verifier-views-all] آماده — ' +
                    STATE.cases.length + ' پرونده');
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
        STATE.cases = [];
        STATE.selectedIds = {};
        STATE._boundIds = {};
        STATE.installed = false;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            total: STATE.cases.length,
            selected: _getSelectedIds().length,
            page: STATE.page,
            pageSize: PAGE_SIZE,
            sortColumn: STATE.sortColumn,
            sortDirection: STATE.sortDirection,
            viewMode: STATE.viewMode
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
    var WamVerifierViewsAll = {
        EVENTS: VAllEvents,
        ROOT_ATTR: ROOT_ATTR,
        PAGE_SIZE: PAGE_SIZE,
        COLUMNS: COLUMNS,

        install: install,
        uninstall: uninstall,
        reload: reload,
        render: render,

        setViewMode: function (mode) {
            if (mode !== 'table' && mode !== 'cards') return false;
            STATE.viewMode = mode;
            render();
            return true;
        },
        getViewMode: function () { return STATE.viewMode; },

        setSort: function (col, dir) {
            if (!col) return false;
            STATE.sortColumn = col;
            if (dir === 'asc' || dir === 'desc') STATE.sortDirection = dir;
            render();
            return true;
        },
        getSort: function () {
            return { column: STATE.sortColumn, direction: STATE.sortDirection };
        },

        gotoPage: function (p) {
            p = parseInt(p, 10);
            if (isNaN(p) || p < 1) return false;
            STATE.page = p;
            render();
            return true;
        },

        selectAll: function () {
            var list = _getFiltered();
            _applySort(list);
            var start = (STATE.page - 1) * PAGE_SIZE;
            var end = Math.min(start + PAGE_SIZE, list.length);
            for (var i = start; i < end; i++) {
                STATE.selectedIds[list[i].caseId] = true;
            }
            render();
            return _getSelectedIds().length;
        },
        clearSelection: function () {
            STATE.selectedIds = {};
            render();
            return true;
        },
        getSelectedIds: _getSelectedIds,

        getCases: function () { return STATE.cases.slice(); },
        getFiltered: function () { return _getFiltered(); },

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamVerifierViewsAll = WamVerifierViewsAll;
    window.VerifierAllEvents = VAllEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-verifier-views-all-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-verifier-views-all')) {
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