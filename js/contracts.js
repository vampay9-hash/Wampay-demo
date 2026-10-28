// ==========================================
// وام پی — Shared Modules
// فایل: contracts.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: مدیریت قراردادهای وام — تولید، امضا، اسکن، چاپ
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION   = '1.0.0';
    var ROOT_ATTR = 'data-contracts-root';
    var CONTRACTS_KEY = 'wamPayContracts';
    var PAGE_SIZE = 20;

    var STATUS_LABELS = {
        draft:       'پیش‌نویس',
        pending:     'در انتظار امضا',
        signed:      'امضا شده',
        finalized:   'نهایی‌شده',
        cancelled:   'لغو شده',
        expired:     'منقضی'
    };

    var CONTRACT_TYPES = {
        LOAN:        'loan',
        GUARANTEE:   'guarantee',
        PROMISSORY:  'promissory',
        COLLATERAL:  'collateral'
    };

    var CONTRACT_TYPE_LABELS = {
        loan:        'قرارداد وام',
        guarantee:   'قرارداد ضمانت',
        promissory:  'سفته',
        collateral:  'قرارداد وثیقه'
    };

    var SIGNATURE_STATUS = {
        none:        'امضا نشده',
        applicant:   'امضای متقاضی',
        broker:      'امضای کارگزار',
        admin:       'امضای ادمین',
        both:        'امضای همه'
    };

    var SORT_OPTIONS = {
        newest: 'جدیدترین',
        oldest: 'قدیمی‌ترین',
        amount: 'بیشترین مبلغ',
        status: 'وضعیت'
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
        contracts: [],
        filtered: [],
        page: 1,
        viewMode: VIEW_MODES.TABLE,
        sort: 'newest',
        scope: 'auto',
        filters: {
            query: '',
            status: '',
            type: '',
            bank: ''
        },
        selectedIds: {},
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var ContractEvents = {
        LOADED:      'contract.loaded',
        RENDERED:    'contract.rendered',
        CREATED:     'contract.created',
        UPDATED:     'contract.updated',
        DELETED:     'contract.deleted',
        SIGNED:      'contract.signed',
        FINALIZED:   'contract.finalized',
        CANCELLED:   'contract.cancelled',
        SCAN_UPLOADED:'contract.scan_uploaded',
        PRINTED:     'contract.printed',
        SELECTION:   'contract.selection',
        FILTERED:    'contract.filtered',
        EXPORTED:    'contract.exported',
        ROW_CLICK:   'contract.row_click'
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
    function _typeLabel(t) { return CONTRACT_TYPE_LABELS[t] || t || '—'; }

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
        return (prefix || 'ct') + '_' + Date.now().toString(36) + '_' + r;
    }

    function _genContractNumber() {
        var y = new Date().getFullYear() % 100;
        var r = Math.floor(Math.random() * 99999);
        return 'WP-CT-' + y + '-' + ('00000' + r).slice(-5);
    }

    function _toast(type, msg, title) {
        if (typeof WamUI === 'undefined') return;
        if (type === 'success' && WamUI.toastSuccess) WamUI.toastSuccess(msg, title || 'موفق');
        else if (type === 'error' && WamUI.toastError) WamUI.toastError(msg, title || 'خطا');
        else if (type === 'warning' && WamUI.toastWarning) WamUI.toastWarning(msg, title || 'توجه');
        else if (type === 'info' && WamUI.toastInfo) WamUI.toastInfo(msg, title || 'اطلاع');
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری / ذخیره
    // ─────────────────────────────────────
    function _loadAll() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(CONTRACTS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveAll(list) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(CONTRACTS_KEY, list);
    }

    function _findById(id) {
        for (var i = 0; i < STATE.contracts.length; i++) {
            if (STATE.contracts[i] && STATE.contracts[i].id === id) {
                return STATE.contracts[i];
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

    // ─────────────────────────────────────
    // 🔎 فیلتر نقش‌محور
    // ─────────────────────────────────────
    function _filterByRole(list) {
        var role = STATE.role;
        var userId = STATE.userId;

        if (role === 'admin' || role === 'super_admin' || role === 'verifier') {
            return list;
        }

        if (role === 'broker') {
            return list.filter(function (c) {
                if (!c) return false;
                if (c.brokerId === userId) return true;
                if (c.createdBy === userId) return true;
                return false;
            });
        }

        if (role === 'applicant') {
            return list.filter(function (c) {
                if (!c) return false;
                if (c.applicantUserId === userId) return true;
                if (c.applicantMobile && _user() && _user().mobile) {
                    if (String(c.applicantMobile).replace(/\D/g, '') ===
                        String(_user().mobile).replace(/\D/g, '')) return true;
                }
                return false;
            });
        }

        return list;
    }

    function _applyScope(list) {
        var scope = STATE.scope;
        if (scope === 'all') return list;
        if (scope === 'mine') {
            return list.filter(function (c) {
                return c && (c.createdBy === STATE.userId ||
                             c.brokerId === STATE.userId ||
                             c.applicantUserId === STATE.userId);
            });
        }
        if (scope === 'pending') {
            return list.filter(function (c) {
                return c && (c.status === 'pending' || c.status === 'draft');
            });
        }
        return list;
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر پیشرفته
    // ─────────────────────────────────────
    function _applyFilters() {
        var f = STATE.filters;
        var q = (f.query || '').toLowerCase().trim();

        STATE.filtered = STATE.contracts.filter(function (c) {
            if (!c) return false;

            if (q) {
                var hay = [c.contractNumber, c.caseId, c.applicantName,
                           c.applicantMobile, c.bank, c.brokerName]
                    .filter(Boolean).join(' ').toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            if (f.status && c.status !== f.status) return false;
            if (f.type && c.type !== f.type) return false;
            if (f.bank && c.bank !== f.bank) return false;

            return true;
        });

        _applySort();
        _emit(ContractEvents.FILTERED, {
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
            if (s === 'amount') {
                return (Number(b.loanAmount) || 0) - (Number(a.loanAmount) || 0);
            }
            if (s === 'status') {
                var order = { draft: 1, pending: 2, signed: 3,
                              finalized: 4, cancelled: 5, expired: 6 };
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
            total: STATE.contracts.length,
            filtered: STATE.filtered.length,
            draft: 0, pending: 0, signed: 0,
            finalized: 0, cancelled: 0, expired: 0,
            totalAmount: 0
        };
        for (var i = 0; i < STATE.contracts.length; i++) {
            var c = STATE.contracts[i];
            if (!c) continue;
            var st = c.status || 'draft';
            if (st === 'draft') s.draft++;
            else if (st === 'pending') s.pending++;
            else if (st === 'signed') s.signed++;
            else if (st === 'finalized') s.finalized++;
            else if (st === 'cancelled') s.cancelled++;
            else if (st === 'expired') s.expired++;

            s.totalAmount += Number(c.loanAmount) || 0;
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
        _emit(ContractEvents.SELECTION, { count: _getSelectedIds().length });
        return _getSelectedIds().length;
    }

    function clearSelection() {
        STATE.selectedIds = {};
        _emit(ContractEvents.SELECTION, { count: 0 });
        return true;
    }

    // ─────────────────────────────────────
    // 🎯 CRUD
    // ─────────────────────────────────────
    function create(data, options) {
        options = options || {};
        var result = { ok: false, reason: null, contract: null, errors: null };

        var errors = _validate(data);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        var user = _user();
        var now = Date.now();

        var contract = {
            id: _genId('contract'),
            contractNumber: _genContractNumber(),
            type: data.type || 'loan',
            caseId: data.caseId || null,
            loanId: data.loanId || null,

            bank: data.bank || null,
            loanAmount: Number(_en(data.loanAmount)) || 0,
            loanDuration: Number(data.loanDuration) || 0,
            rate: Number(data.rate) || 0,

            applicantName: data.applicantName || null,
            applicantMobile: data.applicantMobile
                ? _en(data.applicantMobile).replace(/\D/g, '') : null,
            applicantUserId: data.applicantUserId || null,
            applicantNationalCode: data.applicantNationalCode
                ? _en(data.applicantNationalCode).replace(/\D/g, '') : null,

            brokerId: data.brokerId || null,
            brokerName: data.brokerName || null,
            brokerCode: data.brokerCode || null,

            guarantorName: data.guarantorName || null,
            guarantorMobile: data.guarantorMobile
                ? _en(data.guarantorMobile).replace(/\D/g, '') : null,
            collateralType: data.collateralType || null,
            collateralDesc: data.collateralDesc || null,

            status: 'draft',
            signatures: {
                applicant: { signed: false, at: null, by: null },
                broker:    { signed: false, at: null, by: null },
                admin:     { signed: false, at: null, by: null }
            },
            scans: [],           // فایل‌های اسکن‌شده
            notes: [],
            content: data.content || null,   // متن قرارداد

            createdBy: user ? user.id : null,
            createdByName: user ? (user.name || user.username) : null,
            createdAt: now,
            updatedAt: now
        };

        var all = _loadAll();
        all.push(contract);
        if (!_saveAll(all)) {
            result.reason = 'storage_error';
            return result;
        }

        STATE.contracts.push(contract);
        _emit(ContractEvents.CREATED, { contract: contract, at: now });

        result.ok = true;
        result.contract = contract;
        return result;
    }

    function update(id, patch, options) {
        options = options || {};
        var result = { ok: false, reason: null, contract: null, errors: null };

        var c = _findById(id);
        if (!c) { result.reason = 'not_found'; return result; }
        if (!canEdit(c)) { result.reason = 'forbidden'; return result; }

        var allowed = ['bank', 'loanAmount', 'loanDuration', 'rate',
                       'applicantName', 'applicantMobile', 'brokerName',
                       'guarantorName', 'guarantorMobile',
                       'collateralType', 'collateralDesc',
                       'content', 'caseId', 'loanId'];
        for (var i = 0; i < allowed.length; i++) {
            var k = allowed[i];
            if (patch[k] !== undefined) c[k] = patch[k];
        }
        if (patch.loanAmount !== undefined) {
            c.loanAmount = Number(_en(patch.loanAmount)) || 0;
        }
        if (patch.applicantMobile) {
            c.applicantMobile = _en(patch.applicantMobile).replace(/\D/g, '');
        }

        c.updatedAt = Date.now();
        c.updatedBy = _uid();

        if (!_persist(c)) {
            result.reason = 'storage_error';
            return result;
        }

        result.ok = true;
        result.contract = c;
        _emit(ContractEvents.UPDATED, { contract: c, at: Date.now() });
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

        for (var j = STATE.contracts.length - 1; j >= 0; j--) {
            if (STATE.contracts[j].id === id) {
                STATE.contracts.splice(j, 1);
                break;
            }
        }
        delete STATE.selectedIds[id];

        _emit(ContractEvents.DELETED, { contract: removed, at: Date.now() });
        return { ok: true, contract: removed };
    }

    // ─────────────────────────────────────
    // ✍️ امضا
    // ─────────────────────────────────────
    function sign(id, role) {
        var c = _findById(id);
        if (!c) return { ok: false, reason: 'not_found' };

        var which = role || STATE.role;
        if (which === 'super_admin') which = 'admin';
        if (!c.signatures || !c.signatures[which]) {
            return { ok: false, reason: 'invalid_role' };
        }
        if (c.signatures[which].signed) {
            return { ok: false, reason: 'already_signed' };
        }
        if (c.status === 'cancelled' || c.status === 'expired') {
            return { ok: false, reason: 'closed' };
        }

        c.signatures[which] = {
            signed: true,
            at: Date.now(),
            by: _uid(),
            byName: _user() ? (_user().name || _user().username) : null
        };

        // بررسی همه امضاها
        var allSigned = true;
        for (var k in c.signatures) {
            if (Object.prototype.hasOwnProperty.call(c.signatures, k)) {
                if (!c.signatures[k].signed) { allSigned = false; break; }
            }
        }
        if (allSigned) {
            c.status = 'signed';
            c.signedAt = Date.now();
        } else if (c.status === 'draft') {
            c.status = 'pending';
        }

        c.updatedAt = Date.now();

        if (!_persist(c)) return { ok: false, reason: 'storage_error' };

        _emit(ContractEvents.SIGNED, {
            contractId: id, role: which, allSigned: allSigned
        });
        return { ok: true, contract: c };
    }

    function finalize(id) {
        var c = _findById(id);
        if (!c) return { ok: false, reason: 'not_found' };
        if (!canFinalize(c)) return { ok: false, reason: 'forbidden' };
        if (c.status !== 'signed') {
            return { ok: false, reason: 'not_signed' };
        }

        c.status = 'finalized';
        c.finalizedAt = Date.now();
        c.finalizedBy = _uid();
        c.updatedAt = Date.now();

        if (!_persist(c)) return { ok: false, reason: 'storage_error' };

        _emit(ContractEvents.FINALIZED, { contractId: id });
        return { ok: true, contract: c };
    }

    function cancel(id, reason) {
        var c = _findById(id);
        if (!c) return { ok: false, reason: 'not_found' };
        if (!canCancel(c)) return { ok: false, reason: 'forbidden' };
        if (c.status === 'finalized') {
            return { ok: false, reason: 'already_finalized' };
        }

        c.status = 'cancelled';
        c.cancelledAt = Date.now();
        c.cancelledBy = _uid();
        c.cancelReason = reason || null;
        c.updatedAt = Date.now();

        if (!_persist(c)) return { ok: false, reason: 'storage_error' };

        _emit(ContractEvents.CANCELLED, { contractId: id, reason: reason });
        return { ok: true, contract: c };
    }

    // ─────────────────────────────────────
    // 📎 اسکن
    // ─────────────────────────────────────
    function uploadScan(id, file) {
        var c = _findById(id);
        if (!c) return { ok: false, reason: 'not_found' };
        if (!canEdit(c)) return { ok: false, reason: 'forbidden' };
        if (!file || !file.name) return { ok: false, reason: 'no_file' };

        // بررسی حجم (حداکثر ۵ مگابایت)
        if (file.size > 5 * 1024 * 1024) {
            return { ok: false, reason: 'too_large' };
        }

        var scan = {
            id: _genId('scan'),
            name: file.name,
            size: file.size,
            mime: file.type || null,
            data: null,         // dataURL پر می‌شود با readAsDataURL
            uploadedAt: Date.now(),
            uploadedBy: _uid(),
            uploadedByName: _user() ? (_user().name || _user().username) : null
        };

        if (!Array.isArray(c.scans)) c.scans = [];
        c.scans.push(scan);
        c.updatedAt = Date.now();

        if (!_persist(c)) return { ok: false, reason: 'storage_error' };

        _emit(ContractEvents.SCAN_UPLOADED, {
            contractId: id, scan: scan
        });
        return { ok: true, scan: scan, contract: c };
    }

    function removeScan(id, scanId) {
        var c = _findById(id);
        if (!c) return { ok: false, reason: 'not_found' };
        if (!canEdit(c)) return { ok: false, reason: 'forbidden' };
        if (!Array.isArray(c.scans)) return { ok: false, reason: 'not_found' };

        for (var i = c.scans.length - 1; i >= 0; i--) {
            if (c.scans[i] && c.scans[i].id === scanId) {
                var removed = c.scans.splice(i, 1)[0];
                c.updatedAt = Date.now();
                if (!_persist(c)) return { ok: false, reason: 'storage_error' };
                return { ok: true, scan: removed };
            }
        }
        return { ok: false, reason: 'not_found' };
    }

    // ─────────────────────────────────────
    // 🖨️ چاپ
    // ─────────────────────────────────────
    function print(id) {
        var c = _findById(id);
        if (!c) return { ok: false, reason: 'not_found' };

        _emit(ContractEvents.PRINTED, { contractId: id });

        try {
            var win = window.open('', '_blank');
            if (!win) {
                _toast('warning', 'پاپ‌آپ مسدود شد', 'توجه');
                return { ok: false, reason: 'popup_blocked' };
            }
            win.document.write(_buildPrintableHTML(c));
            win.document.close();
            setTimeout(function () {
                try { win.print(); } catch (e) { /* بی‌صدا */ }
            }, 400);
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: 'print_error' };
        }
    }

    function _buildPrintableHTML(c) {
        var html = '<!DOCTYPE html><html lang="fa" dir="rtl">' +
            '<head><meta charset="UTF-8">' +
            '<title>قرارداد ' + _esc(c.contractNumber) + '</title>' +
            '<style>' +
            'body{font-family:Tahoma,sans-serif;padding:30px;line-height:1.8}' +
            '.header{text-align:center;border-bottom:2px solid #0b3b23;padding-bottom:12px;margin-bottom:20px}' +
            '.header h1{color:#0b3b23;margin:0 0 6px}' +
            'table{width:100%;border-collapse:collapse;margin:16px 0}' +
            'td,th{border:1px solid #ccc;padding:8px;text-align:right}' +
            '.signatures{margin-top:40px;display:flex;gap:20px;justify-content:space-between}' +
            '.signature-box{border:1px dashed #999;padding:20px 30px;text-align:center;min-width:150px}' +
            '</style></head><body>';

        html += '<div class="header">' +
                '<h1>وام پی</h1>' +
                '<p>مسیر هوشمند تأمین مالی</p>' +
                '<h2>قرارداد ' + _esc(_typeLabel(c.type)) + '</h2>' +
                '<p>شماره قرارداد: <strong>' + _esc(c.contractNumber) + '</strong></p>' +
                '</div>';

        html += '<table>';
        html += '<tr><th>متقاضی</th><td>' + _esc(c.applicantName || '—') + '</td></tr>';
        html += '<tr><th>کد ملی</th><td>' + _esc(c.applicantNationalCode || '—') + '</td></tr>';
        html += '<tr><th>موبایل</th><td>' + _esc(c.applicantMobile || '—') + '</td></tr>';
        html += '<tr><th>بانک</th><td>' + _esc(c.bank || '—') + '</td></tr>';
        html += '<tr><th>مبلغ وام</th><td>' + _amt(c.loanAmount) + ' ریال</td></tr>';
        html += '<tr><th>مدت بازپرداخت</th><td>' + _fa(c.loanDuration) + ' ماه</td></tr>';
        html += '<tr><th>نرخ سود</th><td>' + _fa(c.rate) + '٪</td></tr>';
        html += '<tr><th>کارگزار</th><td>' + _esc(c.brokerName || '—') + '</td></tr>';
        html += '<tr><th>ضامن</th><td>' + _esc(c.guarantorName || '—') + '</td></tr>';
        html += '<tr><th>وثیقه</th><td>' + _esc(c.collateralType || '—') + '</td></tr>';
        html += '</table>';

        if (c.content) {
            html += '<div style="margin-top:20px;padding:12px;background:#f4f6f3;border-radius:8px">' +
                    _esc(c.content).replace(/\n/g, '<br>') + '</div>';
        }

        html += '<div class="signatures">' +
            '<div class="signature-box">امضای متقاضی<br><br><br>' +
            (c.signatures && c.signatures.applicant && c.signatures.applicant.signed
                ? '✓ امضا شده' : '') + '</div>' +
            '<div class="signature-box">امضای کارگزار<br><br><br>' +
            (c.signatures && c.signatures.broker && c.signatures.broker.signed
                ? '✓ امضا شده' : '') + '</div>' +
            '<div class="signature-box">مهر و امضای وام پی<br><br><br>' +
            (c.signatures && c.signatures.admin && c.signatures.admin.signed
                ? '✓ امضا شده' : '') + '</div>' +
        '</div>';

        html += '</body></html>';
        return html;
    }

    // ─────────────────────────────────────
    // 🔒 دسترسی
    // ─────────────────────────────────────
    function canCreate() {
        return STATE.role === 'admin' || STATE.role === 'super_admin' ||
               STATE.role === 'broker';
    }

    function canEdit(c) {
        if (!c) return false;
        if (STATE.role === 'admin' || STATE.role === 'super_admin') return true;
        if (STATE.role === 'broker' && c.brokerId === STATE.userId) return true;
        if (c.createdBy === STATE.userId && c.status === 'draft') return true;
        return false;
    }

    function canDelete(c) {
        if (!c) return false;
        if (STATE.role === 'admin' || STATE.role === 'super_admin') return true;
        if (c.createdBy === STATE.userId && c.status === 'draft') return true;
        return false;
    }

    function canSign(c, role) {
        if (!c) return false;
        if (c.status === 'cancelled' || c.status === 'expired') return false;
        var which = role || STATE.role;
        if (which === 'super_admin') which = 'admin';
        if (!c.signatures || !c.signatures[which]) return false;
        if (c.signatures[which].signed) return false;
        // بررسی مطابقت نقش با امضاکننده
        if (which === 'applicant') {
            return STATE.role === 'applicant' ||
                   STATE.role === 'admin' || STATE.role === 'super_admin';
        }
        if (which === 'broker') {
            return STATE.role === 'broker' ||
                   STATE.role === 'admin' || STATE.role === 'super_admin';
        }
        if (which === 'admin') {
            return STATE.role === 'admin' || STATE.role === 'super_admin';
        }
        return false;
    }

    function canFinalize(c) {
        if (!c) return false;
        if (STATE.role !== 'admin' && STATE.role !== 'super_admin') return false;
        if (c.status !== 'signed') return false;
        return true;
    }

    function canCancel(c) {
        if (!c) return false;
        return STATE.role === 'admin' || STATE.role === 'super_admin';
    }

    // ─────────────────────────────────────
    // 🧾 اعتبارسنجی
    // ─────────────────────────────────────
    function _validate(data) {
        var e = {};
        if (!data.type || !CONTRACT_TYPE_LABELS[data.type]) {
            e.type = 'نوع قرارداد الزامی';
        }
        if (!data.applicantName || String(data.applicantName).trim().length < 3) {
            e.applicantName = 'نام متقاضی الزامی';
        }
        if (!data.loanAmount || Number(_en(data.loanAmount)) <= 0) {
            e.loanAmount = 'مبلغ وام الزامی';
        }
        return e;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت آمار
    // ─────────────────────────────────────
    function _renderStats() {
        var s = computeStats();
        return '<div class="wam-contracts__stats">' +
            '<div class="wam-contracts__stat"><span>کل:</span> <strong>' +
                _fa(s.total) + '</strong></div>' +
            '<div class="wam-contracts__stat"><span>پیش‌نویس:</span> <strong>' +
                _fa(s.draft) + '</strong></div>' +
            '<div class="wam-contracts__stat wam-contracts__stat--warning">' +
                '<span>در انتظار:</span> <strong>' +
                _fa(s.pending) + '</strong></div>' +
            '<div class="wam-contracts__stat"><span>امضا شده:</span> <strong>' +
                _fa(s.signed) + '</strong></div>' +
            '<div class="wam-contracts__stat wam-contracts__stat--success">' +
                '<span>نهایی:</span> <strong>' +
                _fa(s.finalized) + '</strong></div>' +
            '<div class="wam-contracts__stat wam-contracts__stat--info">' +
                '<span>مجموع مبالغ:</span> <strong>' +
                _amt(s.totalAmount) + '</strong></div>' +
        '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نوار ابزار
    // ─────────────────────────────────────
    function _renderToolbar() {
        var selected = _getSelectedIds().length;

        var html = '<div class="wam-contracts__toolbar">';
        html += '<div class="wam-contracts__filters">';
        html += '<input type="search" data-contracts="search" ' +
                'placeholder="🔍 جستجو..." value="' +
                _esc(STATE.filters.query) + '">';

        html += '<select data-contracts="filter-status">' +
                '<option value="">همه وضعیت‌ها</option>';
        for (var st in STATUS_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(STATUS_LABELS, st)) continue;
            html += '<option value="' + st + '"' +
                (STATE.filters.status === st ? ' selected' : '') + '>' +
                _esc(STATUS_LABELS[st]) + '</option>';
        }
        html += '</select>';

        html += '<select data-contracts="filter-type">' +
                '<option value="">همه انواع</option>';
        for (var t in CONTRACT_TYPE_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(CONTRACT_TYPE_LABELS, t)) continue;
            html += '<option value="' + t + '"' +
                (STATE.filters.type === t ? ' selected' : '') + '>' +
                _esc(CONTRACT_TYPE_LABELS[t]) + '</option>';
        }
        html += '</select>';

        html += '<select data-contracts="sort">';
        for (var sk in SORT_OPTIONS) {
            if (!Object.prototype.hasOwnProperty.call(SORT_OPTIONS, sk)) continue;
            html += '<option value="' + sk + '"' +
                (STATE.sort === sk ? ' selected' : '') + '>' +
                _esc(SORT_OPTIONS[sk]) + '</option>';
        }
        html += '</select>';

        html += '<button class="wam-btn-icon" data-contracts-action="toggle-view" ' +
                'title="حالت نمایش">' +
                (STATE.viewMode === 'table' ? '🃏' : '📋') + '</button>';

        html += '<button class="wam-btn-icon" data-contracts-action="refresh" ' +
                'title="بروزرسانی">🔄</button>';

        if (selected > 0) {
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-contracts-action="clear-selection">لغو</button>';
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-contracts-action="export-selected">📤 (' +
                    _fa(selected) + ')</button>';
        } else {
            if (canCreate()) {
                html += '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
                        'data-contracts-action="new">➕ قرارداد جدید</button>';
            }
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-contracts-action="export">📤 CSV</button>';
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
                (STATE.contracts.length === 0
                    ? 'هیچ قراردادی ثبت نشده است.'
                    : 'نتیجه‌ای برای فیلتر فعلی یافت نشد.') +
                '</div>';
        }

        var html = '<div class="wam-contracts__table-wrap">' +
            '<table class="wam-contracts__table"><thead><tr>';

        html += '<th class="wam-contracts__check">' +
                '<input type="checkbox" data-contracts="select-all"' +
                (_getSelectedIds().length > 0 ? ' checked' : '') + '></th>';
        html += '<th>شماره</th>';
        html += '<th>متقاضی</th>';
        html += '<th>نوع</th>';
        html += '<th>مبلغ</th>';
        html += '<th>امضاها</th>';
        html += '<th>وضعیت</th>';
        html += '<th>عملیات</th>';

        html += '</tr></thead><tbody>';

        for (var i = 0; i < items.length; i++) {
            html += _renderRow(items[i]);
        }

        html += '</tbody></table></div>';
        return html;
    }

    function _renderRow(c) {
        var st = c.status || 'draft';
        var selected = !!STATE.selectedIds[c.id];
        var sigs = _countSignatures(c);

        var html = '<tr data-contracts-id="' + _esc(c.id) + '"' +
                   (selected ? ' class="is-selected"' : '') + '>';

        html += '<td><input type="checkbox" data-contracts="select-row"' +
                (selected ? ' checked' : '') + '></td>';

        html += '<td><code>' + _esc(c.contractNumber) + '</code></td>';
        html += '<td>' + _esc(c.applicantName || '—') + '</td>';
        html += '<td>' + _esc(_typeLabel(c.type)) + '</td>';
        html += '<td>' + _amt(c.loanAmount) + '</td>';
        html += '<td><span class="wam-contracts__sigs">' +
                _fa(sigs.signed) + '/' + _fa(sigs.total) + '</span></td>';
        html += '<td><span class="wam-badge wam-badge--' + _esc(st) + '">' +
                _esc(_statusLabel(st)) + '</span></td>';

        html += '<td class="wam-contracts__actions">';
        html += '<button class="wam-btn-icon" data-contracts-row-action="view" ' +
                'title="مشاهده">👁️</button>';
        if (canEdit(c)) {
            html += '<button class="wam-btn-icon" data-contracts-row-action="edit" ' +
                    'title="ویرایش">✏️</button>';
        }
        html += '<button class="wam-btn-icon" data-contracts-row-action="print" ' +
                'title="چاپ">🖨️</button>';
        if (canDelete(c)) {
            html += '<button class="wam-btn-icon wam-btn-icon--danger" ' +
                    'data-contracts-row-action="delete" title="حذف">🗑️</button>';
        }
        html += '</td>';

        html += '</tr>';
        return html;
    }

    function _countSignatures(c) {
        if (!c || !c.signatures) return { signed: 0, total: 3 };
        var total = 0;
        var signed = 0;
        for (var k in c.signatures) {
            if (Object.prototype.hasOwnProperty.call(c.signatures, k)) {
                total++;
                if (c.signatures[k].signed) signed++;
            }
        }
        return { signed: signed, total: total };
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

        var html = '<div class="wam-contracts__cards">';
        for (var i = 0; i < items.length; i++) {
            html += _renderCard(items[i]);
        }
        html += '</div>';
        return html;
    }

    function _renderCard(c) {
        var st = c.status || 'draft';
        var selected = !!STATE.selectedIds[c.id];
        var sigs = _countSignatures(c);

        return '<div class="wam-contracts__card' +
            (selected ? ' is-selected' : '') +
            '" data-contracts-id="' + _esc(c.id) + '">' +
            '<div class="wam-contracts__card-head">' +
                '<input type="checkbox" data-contracts="select-row"' +
                (selected ? ' checked' : '') + '>' +
                '<code>' + _esc(c.contractNumber) + '</code>' +
                '<span class="wam-badge wam-badge--' + _esc(st) + '">' +
                _esc(_statusLabel(st)) + '</span>' +
            '</div>' +
            '<div class="wam-contracts__card-name">' +
                _esc(c.applicantName || '—') + '</div>' +
            '<div class="wam-contracts__card-rows">' +
                '<div><span>نوع:</span> ' + _esc(_typeLabel(c.type)) + '</div>' +
                '<div><span>مبلغ:</span> ' + _amt(c.loanAmount) + ' ریال</div>' +
                '<div><span>امضاها:</span> ' + _fa(sigs.signed) + '/' +
                    _fa(sigs.total) + '</div>' +
            '</div>' +
            '<div class="wam-contracts__card-foot">' +
                '<span>' + _esc(_relTime(c.createdAt)) + '</span>' +
                '<div class="wam-contracts__card-actions">' +
                    '<button class="wam-btn wam-btn--sm" ' +
                    'data-contracts-row-action="print">🖨️</button>' +
                    '<button class="wam-btn wam-btn--sm" ' +
                    'data-contracts-row-action="view">مشاهده</button>' +
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
        var html = '<div class="wam-contracts__pagination">';
        html += '<button data-contracts-page="' + (p - 1) + '"' +
                (p === 1 ? ' disabled' : '') + '>‹</button>';
        var start = Math.max(1, p - 2);
        var end = Math.min(pages, p + 2);
        if (start > 1) {
            html += '<button data-contracts-page="1">' + _fa(1) + '</button>';
            if (start > 2) html += '<span>…</span>';
        }
        for (var i = start; i <= end; i++) {
            html += '<button data-contracts-page="' + i + '"' +
                    (i === p ? ' class="is-active"' : '') + '>' +
                    _fa(i) + '</button>';
        }
        if (end < pages) {
            if (end < pages - 1) html += '<span>…</span>';
            html += '<button data-contracts-page="' + pages + '">' +
                    _fa(pages) + '</button>';
        }
        html += '<button data-contracts-page="' + (p + 1) + '"' +
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
            '<div class="wam-contracts">' +
                _renderStats() +
                _renderToolbar() +
                '<div class="wam-contracts__body">' + body + '</div>' +
                _renderPagination(STATE.filtered.length) +
            '</div>';

        STATE.root.innerHTML = html;
        _bindEvents();

        _emit(ContractEvents.RENDERED, {
            count: STATE.filtered.length, at: Date.now()
        });
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents() {
        if (!STATE.root) return;

        var searchEl = STATE.root.querySelector('[data-contracts="search"]');
        if (searchEl) {
            searchEl.addEventListener('input', function () {
                STATE.filters.query = this.value;
                STATE.page = 1;
                render();
            });
        }

        var statusEl = STATE.root.querySelector('[data-contracts="filter-status"]');
        if (statusEl) {
            statusEl.addEventListener('change', function () {
                STATE.filters.status = this.value;
                STATE.page = 1;
                render();
            });
        }

        var typeEl = STATE.root.querySelector('[data-contracts="filter-type"]');
        if (typeEl) {
            typeEl.addEventListener('change', function () {
                STATE.filters.type = this.value;
                STATE.page = 1;
                render();
            });
        }

        var sortEl = STATE.root.querySelector('[data-contracts="sort"]');
        if (sortEl) {
            sortEl.addEventListener('change', function () {
                STATE.sort = this.value;
                render();
            });
        }

        var actionBtns = STATE.root.querySelectorAll('[data-contracts-action]');
        for (var i = 0; i < actionBtns.length; i++) {
            if (actionBtns[i].dataset.bound) continue;
            actionBtns[i].addEventListener('click', _handleAction);
            actionBtns[i].dataset.bound = '1';
        }

        var selectAll = STATE.root.querySelector('[data-contracts="select-all"]');
        if (selectAll) selectAll.addEventListener('change', _handleSelectAll);

        var rowChecks = STATE.root.querySelectorAll('[data-contracts="select-row"]');
        for (var j = 0; j < rowChecks.length; j++) {
            rowChecks[j].addEventListener('change', _handleRowSelect);
        }

        var rowBtns = STATE.root.querySelectorAll('[data-contracts-row-action]');
        for (var k = 0; k < rowBtns.length; k++) {
            rowBtns[k].addEventListener('click', _handleRowAction);
        }

        var pageBtns = STATE.root.querySelectorAll('[data-contracts-page]');
        for (var m = 0; m < pageBtns.length; m++) {
            pageBtns[m].addEventListener('click', _handlePageClick);
        }
    }

    function _handleAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-contracts-action');

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
        _emit(ContractEvents.SELECTION, { count: _getSelectedIds().length });
    }

    function _handleRowSelect(e) {
        e.stopPropagation();
        var container = this.closest('[data-contracts-id]');
        if (!container) return;
        var id = container.getAttribute('data-contracts-id');
        if (this.checked) STATE.selectedIds[id] = true;
        else delete STATE.selectedIds[id];
        render();
        _emit(ContractEvents.SELECTION, { count: _getSelectedIds().length });
    }

    function _handleRowAction(e) {
        e.preventDefault();
        e.stopPropagation();
        var action = this.getAttribute('data-contracts-row-action');
        var container = this.closest('[data-contracts-id]');
        if (!container) return;
        var id = container.getAttribute('data-contracts-id');
        if (!id) return;

        if (action === 'view') openDetail(id);
        else if (action === 'edit') openForm(id);
        else if (action === 'print') { print(id); }
        else if (action === 'delete') _confirmDelete(id);
    }

    function _handlePageClick() {
        var p = parseInt(this.getAttribute('data-contracts-page'), 10);
        if (isNaN(p) || p < 1) return;
        STATE.page = p;
        render();
    }

    // ─────────────────────────────────────
    // 👁️ نمایش جزئیات
    // ─────────────────────────────────────
    function openDetail(id) {
        var c = _findById(id);
        if (!c) return;

        _emit(ContractEvents.ROW_CLICK, { id: id, action: 'view' });

        var existing = document.getElementById('wamContractDetailModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var sigs = c.signatures || {};
        var scans = c.scans || [];

        var scansHtml = '';
        if (scans.length > 0) {
            scansHtml = '<ul class="wam-contracts__scans">';
            for (var i = 0; i < scans.length; i++) {
                var s = scans[i];
                scansHtml += '<li class="wam-contracts__scan">' +
                    '<span>📄 ' + _esc(s.name) + '</span>' +
                    '<span class="wam-contracts__scan-size">' +
                    _fa(Math.round(s.size / 1024)) + ' KB</span>' +
                    (canEdit(c) ?
                        '<button class="wam-btn-icon wam-btn-icon--danger" ' +
                        'data-contracts-action="remove-scan" ' +
                        'data-contract="' + _esc(id) + '" ' +
                        'data-scan="' + _esc(s.id) + '">🗑️</button>' : '') +
                '</li>';
            }
            scansHtml += '</ul>';
        } else {
            scansHtml = '<div class="wam-empty wam-empty--sm">' +
                        'اسکنی بارگذاری نشده.</div>';
        }

        var sigsHtml = '';
        var roles = [
            { key: 'applicant', label: 'متقاضی' },
            { key: 'broker',    label: 'کارگزار' },
            { key: 'admin',     label: 'ادمین' }
        ];
        for (var j = 0; j < roles.length; j++) {
            var r = roles[j];
            var sig = sigs[r.key] || { signed: false };
            sigsHtml += '<div class="wam-contracts__sig-row' +
                (sig.signed ? ' is-signed' : '') + '">' +
                '<span class="wam-contracts__sig-role">' + r.label + '</span>' +
                '<span class="wam-contracts__sig-status">' +
                (sig.signed ? '✓ امضا شده ' + _esc(_relTime(sig.at)) +
                    (sig.byName ? ' توسط ' + _esc(sig.byName) : '')
                 : 'امضا نشده') + '</span>' +
                (canSign(c, r.key) ?
                    '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
                    'data-contracts-action="sign" ' +
                    'data-contract="' + _esc(id) + '" ' +
                    'data-role="' + r.key + '">✍️ امضا</button>' : '') +
            '</div>';
        }

        var modal = document.createElement('div');
        modal.id = 'wamContractDetailModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel wam-modal__panel--wide">' +
                '<header class="wam-modal__head">' +
                    '<div>' +
                        '<code>' + _esc(c.contractNumber) + '</code> ' +
                        '<span class="wam-badge wam-badge--' +
                        _esc(c.status) + '">' +
                        _esc(_statusLabel(c.status)) + '</span>' +
                    '</div>' +
                    '<button type="button" class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<div class="wam-modal__body">' +
                    '<div class="wam-contracts__detail-grid">' +
                        _detailRow('نوع', _typeLabel(c.type)) +
                        _detailRow('متقاضی', c.applicantName || '—') +
                        _detailRow('موبایل', c.applicantMobile || '—') +
                        _detailRow('کد ملی', c.applicantNationalCode || '—') +
                        _detailRow('بانک', c.bank || '—') +
                        _detailRow('مبلغ وام', _amt(c.loanAmount) + ' ریال') +
                        _detailRow('مدت', c.loanDuration ? _fa(c.loanDuration) + ' ماه' : '—') +
                        _detailRow('نرخ سود', c.rate ? _fa(c.rate) + '٪' : '—') +
                        _detailRow('کارگزار', c.brokerName || '—') +
                        _detailRow('ضامن', c.guarantorName || '—') +
                        _detailRow('وثیقه', c.collateralType || '—') +
                        _detailRow('تاریخ ایجاد', _jalali(c.createdAt)) +
                    '</div>' +

                    (c.content ?
                        '<div class="wam-contracts__content-block">' +
                        '<h4>📄 متن قرارداد</h4>' +
                        '<div class="wam-contracts__content">' +
                        _esc(c.content).replace(/\n/g, '<br>') +
                        '</div></div>' : '') +

                    '<h4 class="wam-contracts__section-title">✍️ امضاها</h4>' +
                    '<div class="wam-contracts__signatures">' + sigsHtml + '</div>' +

                    '<h4 class="wam-contracts__section-title">📎 اسکن‌ها (' +
                    _fa(scans.length) + ')</h4>' +
                    '<div class="wam-contracts__scans-wrap">' +
                    scansHtml +
                    (canEdit(c) ?
                        '<label class="wam-btn wam-btn--sm wam-btn--ghost">' +
                        '📤 بارگذاری اسکن' +
                        '<input type="file" data-contracts-upload="' +
                        _esc(id) + '" style="display:none" ' +
                        'accept="image/*,application/pdf"></label>' : '') +
                    '</div>' +
                '</div>' +
                '<footer class="wam-modal__footer wam-modal__footer--space">' +
                    (canFinalize(c) ?
                        '<button type="button" class="wam-btn wam-btn--primary" ' +
                        'data-contracts-action="finalize" ' +
                        'data-contract="' + _esc(id) + '">✅ نهایی‌سازی</button>' : '') +
                    (canCancel(c) && c.status !== 'finalized' &&
                     c.status !== 'cancelled' ?
                        '<button type="button" class="wam-btn wam-btn--ghost ' +
                        'wam-btn--danger" data-contracts-action="cancel" ' +
                        'data-contract="' + _esc(id) + '">❌ لغو</button>' : '') +
                    '<button type="button" class="wam-btn wam-btn--ghost" ' +
                    'data-contracts-action="print" data-contract="' +
                    _esc(id) + '">🖨️ چاپ</button>' +
                    '<button type="button" class="wam-btn wam-btn--ghost" ' +
                    'data-close>بستن</button>' +
                '</footer>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var k = 0; k < cbs.length; k++) {
            cbs[k].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }

        // بایند اکشن‌های modal
        var modalBtns = modal.querySelectorAll('[data-contracts-action]');
        for (var n = 0; n < modalBtns.length; n++) {
            modalBtns[n].addEventListener('click', _handleModalAction);
        }

        // فایل اسکن
        var upload = modal.querySelector('[data-contracts-upload]');
        if (upload) {
            upload.addEventListener('change', function () {
                var cid = this.getAttribute('data-contracts-upload');
                if (this.files && this.files[0]) {
                    _handleScanUpload(cid, this.files[0]);
                }
            });
        }
    }

    function _handleModalAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-contracts-action');
        var cid = this.getAttribute('data-contract');
        var role = this.getAttribute('data-role');
        var scanId = this.getAttribute('data-scan');

        if (a === 'sign') {
            var r = sign(cid, role);
            if (r.ok) {
                _toast('success', 'امضا ثبت شد', 'موفق');
                _closeModal();
                reload();
            } else {
                _toast('error', 'خطا در امضا', 'خطا');
            }
            return;
        }
        if (a === 'finalize') {
            var r2 = finalize(cid);
            if (r2.ok) {
                _toast('success', 'قرارداد نهایی شد', 'موفق');
                _closeModal();
                reload();
            } else {
                _toast('error', 'خطا', 'خطا');
            }
            return;
        }
        if (a === 'cancel') {
            var reason = prompt('دلیل لغو:', '');
            if (reason === null) return;
            var r3 = cancel(cid, reason);
            if (r3.ok) {
                _toast('success', 'قرارداد لغو شد', 'موفق');
                _closeModal();
                reload();
            } else {
                _toast('error', 'خطا', 'خطا');
            }
            return;
        }
        if (a === 'print') {
            print(cid);
            return;
        }
        if (a === 'remove-scan') {
            var r4 = removeScan(cid, scanId);
            if (r4.ok) {
                _toast('success', 'اسکن حذف شد', 'موفق');
                _closeModal();
                openDetail(cid);
            }
            return;
        }
    }

    function _closeModal() {
        var m = document.getElementById('wamContractDetailModal');
        if (m && m.parentNode) m.parentNode.removeChild(m);
    }

    function _detailRow(label, value) {
        return '<div class="wam-contracts__detail-row">' +
            '<span class="wam-contracts__detail-label">' +
            _esc(label) + ':</span>' +
            '<span class="wam-contracts__detail-value">' +
            _esc(value === null || value === undefined || value === '' ? '—' : value) +
            '</span></div>';
    }

    // ─────────────────────────────────────
    // 📤 بارگذاری اسکن
    // ─────────────────────────────────────
    function _handleScanUpload(contractId, file) {
        var r = uploadScan(contractId, file);
        if (r.ok) {
            // خواندن dataURL
            if (typeof FileReader !== 'undefined') {
                var reader = new FileReader();
                reader.onload = function () {
                    var c = _findById(contractId);
                    if (c && Array.isArray(c.scans)) {
                        for (var i = 0; i < c.scans.length; i++) {
                            if (c.scans[i].id === r.scan.id) {
                                c.scans[i].data = reader.result;
                                _persist(c);
                                break;
                            }
                        }
                    }
                };
                try { reader.readAsDataURL(file); } catch (e) { /* بی‌صدا */ }
            }
            _toast('success', 'اسکن بارگذاری شد', 'موفق');
            _closeModal();
            openDetail(contractId);
        } else {
            var msg = r.reason === 'too_large'
                ? 'حجم فایل بیش از ۵ مگابایت'
                : 'خطا در بارگذاری';
            _toast('error', msg, 'خطا');
        }
    }

    // ─────────────────────────────────────
    // ➕ فرم ایجاد/ویرایش
    // ─────────────────────────────────────
    function openForm(id) {
        var editMode = !!id;
        var c = editMode ? _findById(id) : null;
        if (editMode && !c) return;
        if (editMode && !canEdit(c)) {
            _toast('error', 'دسترسی ندارید', 'خطا');
            return;
        }
        if (!editMode && !canCreate()) {
            _toast('error', 'دسترسی ندارید', 'خطا');
            return;
        }

        var existing = document.getElementById('wamContractFormModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var d = c || {};

        var typeOpts = '';
        for (var t in CONTRACT_TYPE_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(CONTRACT_TYPE_LABELS, t)) continue;
            typeOpts += '<option value="' + t + '"' +
                (d.type === t || (!d.type && t === 'loan') ? ' selected' : '') + '>' +
                _esc(CONTRACT_TYPE_LABELS[t]) + '</option>';
        }

        var modal = document.createElement('div');
        modal.id = 'wamContractFormModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>' + (editMode ? 'ویرایش قرارداد' : 'قرارداد جدید') + '</h3>' +
                    '<button type="button" class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form class="wam-modal__body">' +
                    '<div class="wam-field"><label>نوع قرارداد *</label>' +
                        '<select name="type">' + typeOpts + '</select>' +
                        '<div class="wam-field__error" data-error="type"></div></div>' +

                    '<div class="wam-field"><label>نام متقاضی *</label>' +
                        '<input name="applicantName" value="' +
                        _esc(d.applicantName || '') + '">' +
                        '<div class="wam-field__error" data-error="applicantName"></div></div>' +

                    '<div class="wam-field"><label>موبایل متقاضی</label>' +
                        '<input name="applicantMobile" type="tel" value="' +
                        _esc(d.applicantMobile || '') + '"></div>' +

                    '<div class="wam-field"><label>کد ملی متقاضی</label>' +
                        '<input name="applicantNationalCode" value="' +
                        _esc(d.applicantNationalCode || '') + '" maxlength="10"></div>' +

                    '<div class="wam-field"><label>بانک</label>' +
                        '<input name="bank" value="' +
                        _esc(d.bank || '') + '"></div>' +

                    '<div class="wam-field"><label>مبلغ وام (ریال) *</label>' +
                        '<input name="loanAmount" inputmode="numeric" value="' +
                        _esc(String(d.loanAmount || '')) + '">' +
                        '<div class="wam-field__error" data-error="loanAmount"></div></div>' +

                    '<div class="wam-field"><label>مدت (ماه)</label>' +
                        '<input name="loanDuration" type="number" min="1" value="' +
                        _esc(String(d.loanDuration || '')) + '"></div>' +

                    '<div class="wam-field"><label>نرخ سود (٪)</label>' +
                        '<input name="rate" type="number" step="0.1" value="' +
                        _esc(String(d.rate || '')) + '"></div>' +

                    '<div class="wam-field"><label>نام کارگزار</label>' +
                        '<input name="brokerName" value="' +
                        _esc(d.brokerName || '') + '"></div>' +

                    '<div class="wam-field"><label>نام ضامن</label>' +
                        '<input name="guarantorName" value="' +
                        _esc(d.guarantorName || '') + '"></div>' +

                    '<div class="wam-field"><label>نوع وثیقه</label>' +
                        '<input name="collateralType" value="' +
                        _esc(d.collateralType || '') + '"></div>' +

                    '<div class="wam-field"><label>توضیحات وثیقه</label>' +
                        '<textarea name="collateralDesc" rows="2">' +
                        _esc(d.collateralDesc || '') + '</textarea></div>' +

                    '<div class="wam-field"><label>متن قرارداد (اختیاری)</label>' +
                        '<textarea name="content" rows="5">' +
                        _esc(d.content || '') + '</textarea></div>' +

                    '<div class="wam-field"><label>شماره پرونده مرتبط</label>' +
                        '<input name="caseId" value="' +
                        _esc(d.caseId || '') + '" placeholder="WP-XXXX"></div>' +

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
        for (var i = 0; i < cbs.length; i++) {
            cbs[i].addEventListener('click', function () {
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

        var data = {
            type: form.querySelector('[name="type"]').value,
            applicantName: form.querySelector('[name="applicantName"]').value.trim(),
            applicantMobile: form.querySelector('[name="applicantMobile"]').value.trim(),
            applicantNationalCode: form.querySelector('[name="applicantNationalCode"]').value.trim(),
            bank: form.querySelector('[name="bank"]').value.trim(),
            loanAmount: form.querySelector('[name="loanAmount"]').value.trim(),
            loanDuration: Number(form.querySelector('[name="loanDuration"]').value) || 0,
            rate: Number(form.querySelector('[name="rate"]').value) || 0,
            brokerName: form.querySelector('[name="brokerName"]').value.trim(),
            guarantorName: form.querySelector('[name="guarantorName"]').value.trim(),
            collateralType: form.querySelector('[name="collateralType"]').value.trim(),
            collateralDesc: form.querySelector('[name="collateralDesc"]').value.trim(),
            content: form.querySelector('[name="content"]').value.trim(),
            caseId: form.querySelector('[name="caseId"]').value.trim()
        };

        var res = editMode ? update(id, data) : create(data);

        if (!res.ok) {
            _showFormErrors(form, res.errors || { general: 'خطا: ' + res.reason });
            return;
        }

        var modal = document.getElementById('wamContractFormModal');
        if (modal && modal.parentNode) modal.parentNode.removeChild(modal);

        _toast('success', editMode ? 'قرارداد به‌روزرسانی شد' : 'قرارداد ثبت شد', 'موفق');
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
        var c = _findById(id);
        if (!c) return;
        var msg = 'قرارداد «' + c.contractNumber + '» حذف شود؟';
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
            WamUI.confirm('حذف قرارداد', msg, { danger: true })
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
            list = STATE.contracts.filter(function (c) {
                return c && options.ids.indexOf(c.id) !== -1;
            });
        } else {
            list = STATE.filtered;
        }

        if (list.length === 0) {
            _toast('warning', 'داده‌ای برای خروجی نیست', 'توجه');
            return { ok: false, reason: 'empty' };
        }

        var headers = ['شماره قرارداد', 'نوع', 'متقاضی', 'موبایل',
                       'بانک', 'مبلغ', 'مدت', 'وضعیت', 'تاریخ ایجاد'];
        var rows = [headers];

        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            rows.push([
                c.contractNumber || '',
                _typeLabel(c.type),
                c.applicantName || '',
                c.applicantMobile || '',
                c.bank || '',
                String(c.loanAmount || 0),
                String(c.loanDuration || 0),
                _statusLabel(c.status),
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
            _emit(ContractEvents.EXPORTED, { count: list.length });
            return { ok: true, count: list.length };
        }

        var ts = new Date().toISOString().slice(0, 10);
        var filename = 'wampay-contracts-' + ts + '.csv';

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

        _emit(ContractEvents.EXPORTED, { count: list.length });
        _toast('success', _fa(list.length) + ' قرارداد خروجی گرفته شد', 'موفق');
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
        STATE.filters = { query: '', status: '', type: '', bank: '' };
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
            scope !== 'mine' && scope !== 'pending') return false;
        STATE.scope = scope;
        reload();
        return true;
    }

    // ─────────────────────────────────────
    // 🔄 reload
    // ─────────────────────────────────────
    function reload() {
        var all = _loadAll();
        STATE.contracts = _applyScope(_filterByRole(all));

        var valid = {};
        for (var i = 0; i < STATE.contracts.length; i++) {
            if (STATE.selectedIds[STATE.contracts[i].id]) {
                valid[STATE.contracts[i].id] = true;
            }
        }
        STATE.selectedIds = valid;

        render();
        _emit(ContractEvents.LOADED, {
            count: STATE.contracts.length, role: STATE.role,
            scope: STATE.scope, at: Date.now()
        });
        return STATE.contracts.length;
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
                       document.querySelector('.wam-contracts');
            if (!root) {
                if (options.debug) console.warn('[contracts] root پیدا نشد');
                return;
            }
            STATE.root = root;

            if (options.scope) STATE.scope = options.scope;
            if (options.viewMode) STATE.viewMode = options.viewMode;

            reload();
            STATE.installed = true;

            if (options.debug) {
                console.log('[contracts] v' + VERSION + ' — ' +
                    STATE.role + '، ' + STATE.contracts.length + ' قرارداد');
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
        STATE.contracts = [];
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
            total: STATE.contracts.length,
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
    var WamContracts = {
        VERSION: VERSION,
        EVENTS: ContractEvents,
        ROOT_ATTR: ROOT_ATTR,
        CONTRACTS_KEY: CONTRACTS_KEY,
        PAGE_SIZE: PAGE_SIZE,
        STATUS_LABELS: STATUS_LABELS,
        CONTRACT_TYPES: CONTRACT_TYPES,
        CONTRACT_TYPE_LABELS: CONTRACT_TYPE_LABELS,
        SIGNATURE_STATUS: SIGNATURE_STATUS,
        SORT_OPTIONS: SORT_OPTIONS,
        VIEW_MODES: VIEW_MODES,

        install: install,
        uninstall: uninstall,
        reload: reload,
        render: render,

        create: create,
        update: update,
        remove: remove,

        sign: sign,
        finalize: finalize,
        cancel: cancel,

        uploadScan: uploadScan,
        removeScan: removeScan,
        print: print,

        openForm: openForm,
        openDetail: openDetail,

        canCreate: canCreate,
        canEdit: canEdit,
        canDelete: canDelete,
        canSign: canSign,
        canFinalize: canFinalize,
        canCancel: canCancel,

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

        getContracts: function () { return STATE.contracts.slice(); },
        getFiltered: function () { return STATE.filtered.slice(); },
        findById: _findById,

        computeStats: computeStats,
        countSignatures: _countSignatures,

        selectAll: selectAll,
        clearSelection: clearSelection,
        getSelectedIds: _getSelectedIds,

        exportCSV: exportCSV,

        formatStatus: _statusLabel,
        formatType: _typeLabel,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamContracts = WamContracts;
    window.ContractEvents = ContractEvents;

    // نصب خودکار
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-contracts-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-contracts')) {
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