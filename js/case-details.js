// ==========================================
// وام پی — Shared Modules
// فایل: case-details.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: نمایش کامل جزئیات پرونده با تب‌های نقش‌محور
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION   = '1.0.0';
    var ROOT_ATTR = 'data-case-details-root';

    var TABS = {
        SUMMARY:    'summary',
        APPLICANT:  'applicant',
        FINANCIAL:  'financial',
        DOCUMENTS:  'documents',
        STEPS:      'steps',
        APPROVALS:  'approvals',
        NOTES:      'notes',
        LOG:        'log'
    };

    var TAB_LABELS = {
        summary:    { icon: '📋', title: 'خلاصه' },
        applicant:  { icon: '👤', title: 'متقاضی' },
        financial:  { icon: '💰', title: 'مالی' },
        documents:  { icon: '📎', title: 'مدارک' },
        steps:      { icon: '🔢', title: 'مراحل' },
        approvals:  { icon: '✅', title: 'تأییدها' },
        notes:      { icon: '📝', title: 'یادداشت‌ها' },
        log:        { icon: '📜', title: 'لاگ' }
    };

    var STATUS_LABELS = {
        draft: 'پیش‌نویس', in_progress: 'در جریان', pending: 'در انتظار',
        approved: 'تأییدشده', completed: 'تکمیل‌شده', rejected: 'رد شده',
        cancelled: 'لغو شده', archived: 'بایگانی', rolledback: 'بازگشت‌خورده'
    };

    var STEP_TITLES = {
        step_1: 'ثبت درخواست', step_2: 'بارگذاری مدارک',
        step_3: 'بررسی اولیه', step_4: 'اعتبارسنجی',
        step_5: 'تأیید ادمین', step_6: 'ارسال به بانک',
        step_7: 'تأیید بانک', step_8: 'تنظیم قرارداد',
        step_9: 'پرداخت'
    };

    var PRIORITY_LABELS = {
        low: 'کم', normal: 'معمولی', high: 'بالا', urgent: 'فوری'
    };

    var ROLE_LABELS = {
        super_admin: 'مدیر ارشد', admin: 'ادمین کل',
        verifier: 'اعتبارسنج', broker: 'کارگزار', applicant: 'متقاضی'
    };

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        caseId: null,
        caseData: null,
        activeTab: TABS.SUMMARY,
        role: null,
        userId: null,
        listeners: [],
        _boundTabs: {}
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var DetailEvents = {
        LOADED:       'cdetail.loaded',
        TAB_CHANGE:   'cdetail.tab_change',
        RENDERED:     'cdetail.rendered',
        ACTION:       'cdetail.action',
        NOT_FOUND:    'cdetail.not_found',
        ACCESS_DENIED:'cdetail.access_denied'
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
    function _stepTitle(s) { return STEP_TITLES[s] || s || '—'; }
    function _priorityLabel(p) { return PRIORITY_LABELS[p] || '—'; }
    function _roleLabel(r) { return ROLE_LABELS[r] || r || '—'; }

    function _user() {
        if (typeof WamPermissions === 'undefined') return null;
        return WamPermissions.getCurrentUser();
    }

    // ─────────────────────────────────────
    // 🌐 URL
    // ─────────────────────────────────────
    function _getCaseIdFromUrl() {
        try {
            var params = new URLSearchParams(window.location.search);
            return params.get('id') || params.get('caseId');
        } catch (e) {
            return null;
        }
    }

    // ─────────────────────────────────────
    // 🔒 دسترسی
    // ─────────────────────────────────────
    function canAccess(caseData, user) {
        if (!caseData || !user) return false;
        var role = user.role;

        if (role === 'super_admin' || role === 'admin') return true;

        if (role === 'verifier') {
            var step = caseData.currentStep || '';
            if (step === 'step_3' || step === 'step_4') return true;
            // بررسی‌شده‌های من
            return _isVerifiedBy(caseData, user.id);
        }

        if (role === 'broker') {
            return _brokerMatches(caseData, user);
        }

        if (role === 'applicant') {
            return _applicantMatches(caseData, user);
        }

        return false;
    }

    function _isVerifiedBy(c, userId) {
        if (!c || !userId) return false;
        var appr = c.adminApprovals || {};
        for (var k in appr) {
            if (Object.prototype.hasOwnProperty.call(appr, k)) {
                var a = appr[k];
                if (a && a.approvedBy === userId) return true;
            }
        }
        if (c.steps) {
            for (var sid in c.steps) {
                if (Object.prototype.hasOwnProperty.call(c.steps, sid)) {
                    var s = c.steps[sid];
                    if (s && (s.completedBy === userId || s.startedBy === userId)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function _brokerMatches(c, user) {
        if (!c || !user) return false;
        if (c.brokerId && c.brokerId === user.id) return true;
        if (c.brokerName && user.name && c.brokerName === user.name) return true;
        if (typeof Storage !== 'undefined') {
            try {
                var brokers = Storage.getJSON('wamPayBrokers', []) || [];
                for (var i = 0; i < brokers.length; i++) {
                    var b = brokers[i];
                    if (!b) continue;
                    if (b.userId === user.id && b.id === c.brokerId) return true;
                    if (b.brokerCode && c.brokerCode === b.brokerCode) return true;
                }
            } catch (e) { /* بی‌صدا */ }
        }
        return false;
    }

    function _applicantMatches(c, user) {
        if (!c || !user) return false;
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
    }

    // ─────────────────────────────────────
    // 🎯 تب‌های مجاز بر اساس نقش
    // ─────────────────────────────────────
    function getAllowedTabs(role) {
        var common = ['summary', 'steps', 'approvals', 'log'];

        if (role === 'super_admin' || role === 'admin') {
            return ['summary', 'applicant', 'financial', 'documents',
                    'steps', 'approvals', 'notes', 'log'];
        }
        if (role === 'verifier') {
            return ['summary', 'applicant', 'financial', 'documents',
                    'steps', 'notes', 'log'];
        }
        if (role === 'broker') {
            return ['summary', 'applicant', 'financial', 'documents',
                    'steps', 'notes', 'log'];
        }
        if (role === 'applicant') {
            return ['summary', 'steps', 'approvals', 'log'];
        }
        return common;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — هدر
    // ─────────────────────────────────────
    function _renderHeader() {
        var c = STATE.caseData;
        var st = c.status || 'draft';
        var pr = c.priority || 'normal';

        return '<header class="wam-cd__header">' +
            '<div class="wam-cd__head-left">' +
                '<a href="javascript:history.back()" class="wam-btn-icon" ' +
                'title="بازگشت">‹</a>' +
                '<div>' +
                    '<div class="wam-cd__title">' +
                        '<code>' + _esc(c.caseId) + '</code> ' +
                        '<span class="wam-badge wam-badge--' + _esc(st) + '">' +
                        _esc(_statusLabel(st)) + '</span>' +
                    '</div>' +
                    '<div class="wam-cd__subtitle">' +
                        _esc(c.applicantName || '—') +
                        ' · ' + _esc(c.bank || '—') +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="wam-cd__head-right">' +
                '<button class="wam-btn-icon" data-cd-action="refresh" ' +
                'title="بروزرسانی">🔄</button>' +
                '<button class="wam-btn-icon" data-cd-action="print" ' +
                'title="چاپ">🖨️</button>' +
            '</div>' +
        '</header>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت خلاصه
    // ─────────────────────────────────────
    function _renderSummaryCard() {
        var c = STATE.caseData;
        var st = c.status || 'draft';
        var progress = Math.round((_stepIndex(c.currentStep) / 9) * 100);

        var html = '<section class="wam-cd__card">';
        html += '<div class="wam-cd__card-head">' +
                '<h3>📊 خلاصه پرونده</h3></div>';

        html += '<div class="wam-cd__grid">';
        html += _infoRow('شناسه', c.caseId);
        html += _infoRow('وضعیت', _statusLabel(st));
        html += _infoRow('مرحله جاری', _stepTitle(c.currentStep));
        html += _infoRow('اولویت', _priorityLabel(c.priority));
        html += _infoRow('بانک', c.bank);
        html += _infoRow('مبلغ درخواستی', _amt(c.loanAmount) + ' ریال');
        html += _infoRow('مدت بازپرداخت', c.loanDuration ? _fa(c.loanDuration) + ' ماه' : '—');
        html += _infoRow('هدف وام', c.purpose);
        html += _infoRow('تاریخ ثبت', _jalali(c.createdAt));
        html += _infoRow('آخرین تغییر', _relativeSafe(c.updatedAt));
        html += '</div>';

        html += '<div class="wam-cd__progress">' +
                '<div class="wam-cd__progress-label">پیشرفت: ' +
                _fa(progress) + '٪</div>' +
                '<div class="wam-cd__progress-bar">' +
                '<div class="wam-cd__progress-fill" style="width:' +
                progress + '%"></div></div>' +
                '</div>';

        html += '</section>';
        return html;
    }

    function _relativeSafe(ts) {
        if (!ts) return '—';
        return _relTime(ts) + ' (' + _jalali(ts) + ')';
    }

    function _infoRow(label, value) {
        return '<div class="wam-cd__info-row">' +
            '<span class="wam-cd__info-label">' + _esc(label) + ':</span>' +
            '<span class="wam-cd__info-value">' +
            _esc(value === null || value === undefined || value === '' ? '—' : value) +
            '</span></div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — تب خلاصه
    // ─────────────────────────────────────
    function _renderSummaryTab() {
        var html = _renderSummaryCard();

        // هشدار فوری
        var age = _ageDays(STATE.caseData);
        if (age > 3 && STATE.caseData.status !== 'completed') {
            html += '<div class="wam-cd__alert wam-cd__alert--warning">' +
                    '⏰ این پرونده ' + _fa(age) + ' روز در سیستم است. ' +
                    'لطفاً بررسی را تسریع کنید.' +
                    '</div>';
        }

        return html;
    }

    function _ageDays(c) {
        if (!c) return 0;
        var created = c.createdAt || c.updatedAt || Date.now();
        return Math.floor((Date.now() - created) / (24 * 60 * 60 * 1000));
    }

    function _stepIndex(stepId) {
        var order = ['step_1','step_2','step_3','step_4','step_5',
                     'step_6','step_7','step_8','step_9'];
        var i = order.indexOf(stepId);
        return i === -1 ? 0 : i + 1;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — تب متقاضی
    // ─────────────────────────────────────
    function _renderApplicantTab() {
        var c = STATE.caseData;
        var html = '<section class="wam-cd__card">';
        html += '<div class="wam-cd__card-head"><h3>👤 اطلاعات متقاضی</h3></div>';
        html += '<div class="wam-cd__grid">';
        html += _infoRow('نام و نام خانوادگی', c.applicantName);
        html += _infoRow('کد ملی', c.applicantNationalCode);
        html += _infoRow('شماره شناسنامه', c.applicantIdNumber);
        html += _infoRow('موبایل', c.applicantMobile);
        html += _infoRow('تلفن ثابت', c.applicantPhone);
        html += _infoRow('ایمیل', c.applicantEmail);
        html += _infoRow('تاریخ تولد', c.applicantBirthDate);
        html += _infoRow('محل تولد', c.applicantBirthPlace);
        html += _infoRow('جنسیت', c.applicantGender === 'male' ? 'مرد' :
                                  c.applicantGender === 'female' ? 'زن' : '—');
        html += _infoRow('وضعیت تأهل', c.applicantMaritalStatus === 'single' ? 'مجرد' :
                                        c.applicantMaritalStatus === 'married' ? 'متأهل' : '—');
        html += _infoRow('تحصیلات', c.applicantEducation);
        html += _infoRow('شغل', c.applicantJob);
        html += '</div></section>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — تب مالی
    // ─────────────────────────────────────
    function _renderFinancialTab() {
        var c = STATE.caseData;
        var html = '<section class="wam-cd__card">';
        html += '<div class="wam-cd__card-head"><h3>💰 اطلاعات مالی</h3></div>';
        html += '<div class="wam-cd__grid">';
        html += _infoRow('شغل', c.applicantJob);
        html += _infoRow('سابقه کار', c.workExperience ? _fa(c.workExperience) + ' سال' : '—');
        html += _infoRow('محل کار', c.employerName);
        html += _infoRow('درآمد ماهانه', c.monthlyIncome ? _amt(c.monthlyIncome) + ' ریال' : '—');
        html += _infoRow('درآمد جانبی', c.otherIncome ? _amt(c.otherIncome) + ' ریال' : '—');
        html += _infoRow('اقساط جاری', c.existingInstallments ? _amt(c.existingInstallments) + ' ریال' : '—');
        html += _infoRow('شماره حساب', c.bankAccount);
        html += _infoRow('شبا', c.iban);
        html += _infoRow('مبلغ درخواستی', c.loanAmount ? _amt(c.loanAmount) + ' ریال' : '—');
        html += _infoRow('مدت بازپرداخت', c.loanDuration ? _fa(c.loanDuration) + ' ماه' : '—');
        html += _infoRow('هدف وام', c.purpose);
        html += _infoRow('نوع وثیقه', c.collateralType);
        html += _infoRow('مبلغ وثیقه', c.collateralAmount ? _amt(c.collateralAmount) + ' ریال' : '—');
        html += '</div>';

        if (c.loanNote) {
            html += '<div class="wam-cd__note">' +
                    '<strong>توضیحات وام:</strong><br>' +
                    _esc(c.loanNote) + '</div>';
        }
        if (c.collateralDesc) {
            html += '<div class="wam-cd__note">' +
                    '<strong>شرح وثیقه:</strong><br>' +
                    _esc(c.collateralDesc) + '</div>';
        }

        html += '</section>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — تب مدارک
    // ─────────────────────────────────────
    function _renderDocumentsTab() {
        var c = STATE.caseData;
        var docs = c.documents || [];
        var html = '<section class="wam-cd__card">';
        html += '<div class="wam-cd__card-head"><h3>📎 مدارک بارگذاری‌شده</h3></div>';

        if (docs.length === 0) {
            html += '<div class="wam-empty">مدرکی بارگذاری نشده است.</div>';
        } else {
            html += '<ul class="wam-cd__docs">';
            for (var i = 0; i < docs.length; i++) {
                var d = docs[i];
                if (!d) continue;
                html += '<li class="wam-cd__doc-item">' +
                    '<div class="wam-cd__doc-icon">📄</div>' +
                    '<div class="wam-cd__doc-body">' +
                        '<div class="wam-cd__doc-name">' +
                        _esc(d.name || d.type || 'مدرک') + '</div>' +
                        '<div class="wam-cd__doc-meta">' +
                        _esc(_size(d.size)) +
                        ' · ' + _esc(_relTime(d.uploadedAt)) +
                        '</div>' +
                    '</div>' +
                    '<button class="wam-btn-icon" data-cd-action="view-doc" ' +
                    'data-doc-id="' + _esc(d.id) + '" title="مشاهده">👁️</button>' +
                '</li>';
            }
            html += '</ul>';
        }
        html += '</section>';
        return html;
    }

    function _size(bytes) {
        if (!bytes) return '—';
        if (bytes < 1024) return _fa(bytes) + ' بایت';
        if (bytes < 1024 * 1024) return _fa(Math.round(bytes / 1024)) + ' KB';
        return _fa(Math.round(bytes / 1024 / 1024 * 10) / 10) + ' MB';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — تب مراحل
    // ─────────────────────────────────────
    function _renderStepsTab() {
        var c = STATE.caseData;
        var steps = c.steps || {};
        var order = ['step_1','step_2','step_3','step_4','step_5',
                     'step_6','step_7','step_8','step_9'];

        var html = '<section class="wam-cd__card">';
        html += '<div class="wam-cd__card-head"><h3>🔢 مراحل پرونده</h3></div>';
        html += '<div class="wam-cd__steps">';

        for (var i = 0; i < order.length; i++) {
            var id = order[i];
            var s = steps[id] || {};
            var st = s.status || 'pending';
            var isCurrent = (c.currentStep === id);
            var statusIcon = st === 'completed' ? '✅' :
                             st === 'in_progress' ? '▶️' :
                             st === 'rejected' ? '❌' :
                             st === 'pending' ? '⏳' : '•';

            html += '<div class="wam-cd__step' +
                (isCurrent ? ' is-current' : '') +
                ' is-' + _esc(st) + '">' +
                '<div class="wam-cd__step-icon">' + statusIcon + '</div>' +
                '<div class="wam-cd__step-body">' +
                    '<div class="wam-cd__step-title">' +
                    _esc(_stepTitle(id)) + '</div>' +
                    '<div class="wam-cd__step-meta">' +
                        'وضعیت: ' + _esc(_statusLabel(st)) +
                        (s.completedAt ? ' · ' + _esc(_jalali(s.completedAt)) : '') +
                    '</div>' +
                    (s.rejectNote ?
                        '<div class="wam-cd__step-note">' +
                        '⚠️ ' + _esc(s.rejectNote) + '</div>' : '') +
                '</div>' +
                '</div>';
        }

        html += '</div></section>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — تب تأییدها
    // ─────────────────────────────────────
    function _renderApprovalsTab() {
        var c = STATE.caseData;
        var approvals = c.adminApprovals || {};
        var order = ['step_1','step_2','step_3','step_4','step_5',
                     'step_6','step_7','step_8','step_9'];

        var html = '<section class="wam-cd__card">';
        html += '<div class="wam-cd__card-head"><h3>✅ تأییدهای ادمین</h3></div>';
        html += '<div class="wam-cd__approvals">';

        var any = false;
        for (var i = 0; i < order.length; i++) {
            var key = order[i];
            var a = approvals[key];
            if (!a || a.status === 'pending' || !a.status) continue;
            any = true;

            var statusIcon = a.status === 'approved' ? '✅' :
                             a.status === 'rejected' ? '❌' :
                             a.status === 'revision' ? '🔄' : '•';

            html += '<div class="wam-cd__approval is-' + _esc(a.status) + '">' +
                '<div class="wam-cd__approval-icon">' + statusIcon + '</div>' +
                '<div class="wam-cd__approval-body">' +
                    '<div class="wam-cd__approval-title">' +
                    _esc(_stepTitle(key)) + '</div>' +
                    '<div class="wam-cd__approval-meta">' +
                    (a.approvedBy ? 'توسط: ' + _esc(a.approvedBy) : '') +
                    (a.approvedAt ? ' · ' + _esc(_relTime(a.approvedAt)) : '') +
                    '</div>' +
                    (a.note ?
                        '<div class="wam-cd__approval-note">' +
                        _esc(a.note) + '</div>' : '') +
                '</div>' +
            '</div>';
        }

        if (!any) {
            html += '<div class="wam-empty">هنوز تأییدی ثبت نشده است.</div>';
        }

        html += '</div></section>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — تب یادداشت‌ها
    // ─────────────────────────────────────
    function _renderNotesTab() {
        var notes = [];
        if (typeof WamVerifierStorage !== 'undefined' &&
            WamVerifierStorage.getNotes) {
            try { notes = WamVerifierStorage.getNotes(STATE.caseId); }
            catch (e) { /* بی‌صدا */ }
        }

        var html = '<section class="wam-cd__card">';
        html += '<div class="wam-cd__card-head"><h3>📝 یادداشت‌ها</h3></div>';

        if (notes.length === 0) {
            html += '<div class="wam-empty">یادداشتی ثبت نشده است.</div>';
        } else {
            html += '<ul class="wam-cd__notes">';
            for (var i = notes.length - 1; i >= 0; i--) {
                var n = notes[i];
                html += '<li class="wam-cd__note-item is-' +
                    _esc(n.category || 'general') + '">' +
                    '<div class="wam-cd__note-text">' + _esc(n.text) + '</div>' +
                    '<div class="wam-cd__note-meta">' +
                        _esc(n.authorName || '—') +
                        ' · ' + _esc(_relTime(n.createdAt)) +
                    '</div></li>';
            }
            html += '</ul>';
        }

        html += '</section>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — تب لاگ
    // ─────────────────────────────────────
    function _renderLogTab() {
        var c = STATE.caseData;
        var transitions = c.transitions || [];

        var html = '<section class="wam-cd__card">';
        html += '<div class="wam-cd__card-head"><h3>📜 لاگ رویدادها</h3></div>';

        if (transitions.length === 0) {
            html += '<div class="wam-empty">رویدادی ثبت نشده است.</div>';
        } else {
            html += '<ul class="wam-cd__log">';
            for (var i = transitions.length - 1; i >= 0; i--) {
                var t = transitions[i];
                html += '<li class="wam-cd__log-item">' +
                    '<div class="wam-cd__log-icon">' +
                    _logIcon(t.action) + '</div>' +
                    '<div class="wam-cd__log-body">' +
                        '<div class="wam-cd__log-title">' +
                        _esc(_logLabel(t.action)) + '</div>' +
                        '<div class="wam-cd__log-meta">' +
                        (t.stepId ? _esc(_stepTitle(t.stepId)) + ' · ' : '') +
                        _esc(_relTime(t.at)) +
                        (t.note ? ' · ' + _esc(t.note) : '') +
                        '</div>' +
                    '</div></li>';
            }
            html += '</ul>';
        }

        html += '</section>';
        return html;
    }

    function _logIcon(action) {
        if (!action) return '•';
        if (action === 'start') return '▶️';
        if (action === 'complete') return '✅';
        if (action === 'reject') return '❌';
        if (action === 'revise') return '🔄';
        if (action === 'reset') return '↩️';
        return '•';
    }

    function _logLabel(action) {
        var map = {
            start: 'شروع مرحله', complete: 'تکمیل مرحله',
            reject: 'رد مرحله', revise: 'درخواست اصلاح',
            reset: 'ریست پرونده', next: 'رفتن به مرحله بعد',
            prev: 'بازگشت به مرحله قبل'
        };
        return map[action] || action || 'رویداد';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — تب جاری
    // ─────────────────────────────────────
    function _renderCurrentTab() {
        if (STATE.activeTab === TABS.SUMMARY)   return _renderSummaryTab();
        if (STATE.activeTab === TABS.APPLICANT) return _renderApplicantTab();
        if (STATE.activeTab === TABS.FINANCIAL) return _renderFinancialTab();
        if (STATE.activeTab === TABS.DOCUMENTS) return _renderDocumentsTab();
        if (STATE.activeTab === TABS.STEPS)     return _renderStepsTab();
        if (STATE.activeTab === TABS.APPROVALS) return _renderApprovalsTab();
        if (STATE.activeTab === TABS.NOTES)     return _renderNotesTab();
        if (STATE.activeTab === TABS.LOG)       return _renderLogTab();
        return '<div class="wam-empty">تب نامعتبر.</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نوار تب
    // ─────────────────────────────────────
    function _renderTabBar() {
        var allowed = getAllowedTabs(STATE.role);
        var html = '<nav class="wam-cd__tabs" role="tablist">';
        for (var i = 0; i < allowed.length; i++) {
            var key = allowed[i];
            var label = TAB_LABELS[key] || { icon: '•', title: key };
            html += '<button type="button" role="tab" ' +
                'class="wam-cd__tab' +
                (STATE.activeTab === key ? ' is-active' : '') + '" ' +
                'data-cd-tab="' + key + '">' +
                '<span>' + label.icon + '</span> ' +
                '<span>' + _esc(label.title) + '</span>' +
                '</button>';
        }
        html += '</nav>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;

        if (!STATE.caseData) {
            STATE.root.innerHTML = '<div class="wam-empty">' +
                'پرونده یافت نشد.</div>';
            return;
        }

        var html =
            '<div class="wam-cd">' +
                _renderHeader() +
                _renderTabBar() +
                '<main class="wam-cd__body">' +
                    _renderCurrentTab() +
                '</main>' +
            '</div>';

        STATE.root.innerHTML = html;
        _bindEvents();

        _emit(DetailEvents.RENDERED, {
            caseId: STATE.caseId,
            tab: STATE.activeTab,
            at: Date.now()
        });
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents() {
        if (!STATE.root) return;

        var tabs = STATE.root.querySelectorAll('[data-cd-tab]');
        for (var i = 0; i < tabs.length; i++) {
            if (tabs[i].dataset.cdBound) continue;
            tabs[i].addEventListener('click', _handleTabClick);
            tabs[i].dataset.cdBound = '1';
        }

        var actions = STATE.root.querySelectorAll('[data-cd-action]');
        for (var j = 0; j < actions.length; j++) {
            if (actions[j].dataset.cdBound) continue;
            actions[j].addEventListener('click', _handleAction);
            actions[j].dataset.cdBound = '1';
        }
    }

    function _handleTabClick(e) {
        e.preventDefault();
        var tab = this.getAttribute('data-cd-tab');
        if (!tab || tab === STATE.activeTab) return;
        STATE.activeTab = tab;
        render();
        _emit(DetailEvents.TAB_CHANGE, { tab: tab, at: Date.now() });
    }

    function _handleAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-cd-action');

        if (a === 'refresh') {
            reload();
            if (typeof WamUI !== 'undefined') {
                WamUI.toastSuccess('بروزرسانی شد', 'موفق');
            }
            return;
        }
        if (a === 'print') {
            try { window.print(); } catch (err) { /* بی‌صدا */ }
            return;
        }
        if (a === 'view-doc') {
            var docId = this.getAttribute('data-doc-id');
            _viewDoc(docId);
            return;
        }

        _emit(DetailEvents.ACTION, { action: a, at: Date.now() });
    }

    function _viewDoc(docId) {
        var docs = (STATE.caseData && STATE.caseData.documents) || [];
        var doc = null;
        for (var i = 0; i < docs.length; i++) {
            if (docs[i] && docs[i].id === docId) { doc = docs[i]; break; }
        }
        if (!doc) return;

        var existing = document.getElementById('wamCDocModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var body = '';
        if (doc.data && doc.mime && doc.mime.indexOf('image/') === 0) {
            body = '<img src="' + doc.data + '" style="max-width:100%;border-radius:8px">';
        } else if (doc.data && doc.mime === 'application/pdf') {
            body = '<iframe src="' + doc.data +
                   '" style="width:100%;height:60vh;border:0"></iframe>';
        } else {
            body = '<div class="wam-empty">پیش‌نمایش موجود نیست.</div>';
        }

        var modal = document.createElement('div');
        modal.id = 'wamCDocModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel wam-modal__panel--wide">' +
                '<header class="wam-modal__head">' +
                    '<h3>' + _esc(doc.name || 'مدرک') + '</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<div class="wam-modal__body">' + body + '</div>' +
            '</div>';

        document.body.appendChild(modal);
        var cbs = modal.querySelectorAll('[data-close]');
        for (var k = 0; k < cbs.length; k++) {
            cbs[k].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }
    }

    // ─────────────────────────────────────
    // 🎯 باز کردن پرونده
    // ─────────────────────────────────────
    function open(caseId) {
        if (!caseId) return false;

        STATE.caseId = caseId;

        if (typeof CaseRepository === 'undefined') {
            _emit(DetailEvents.NOT_FOUND, { caseId: caseId });
            return false;
        }

        var c = null;
        try { c = CaseRepository.get(caseId); }
        catch (e) { c = null; }

        if (!c) {
            _emit(DetailEvents.NOT_FOUND, { caseId: caseId });
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('پرونده یافت نشد', 'خطا');
            }
            return false;
        }

        STATE.caseData = c;

        var user = _user();
        STATE.userId = user ? user.id : null;
        STATE.role = user ? user.role : null;

        if (!canAccess(c, user)) {
            _emit(DetailEvents.ACCESS_DENIED, { caseId: caseId });
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('دسترسی به این پرونده مجاز نیست', 'خطا');
            }
            if (typeof WamPayGuard !== 'undefined') {
                WamPayGuard.redirectToRoleHome(STATE.role);
            }
            return false;
        }

        // تعیین تب اولیه مجاز
        var allowed = getAllowedTabs(STATE.role);
        if (allowed.indexOf(STATE.activeTab) === -1) {
            STATE.activeTab = allowed[0] || TABS.SUMMARY;
        }

        render();
        _emit(DetailEvents.LOADED, {
            caseId: caseId, role: STATE.role, at: Date.now()
        });
        return true;
    }

    function reload() {
        if (!STATE.caseId) return false;
        if (typeof CaseRepository === 'undefined') return false;

        var c = null;
        try { c = CaseRepository.get(STATE.caseId); }
        catch (e) { c = null; }

        if (!c) return false;
        STATE.caseData = c;
        render();
        return true;
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
                       document.querySelector('.wam-case-details');
            if (!root) {
                if (options.debug) console.warn('[case-details] root پیدا نشد');
                return;
            }
            STATE.root = root;

            var caseId = options.caseId || _getCaseIdFromUrl();
            if (!caseId) {
                STATE.root.innerHTML = '<div class="wam-empty">' +
                    'شناسه پرونده در URL یافت نشد.</div>';
                return;
            }

            var ok = open(caseId);
            if (!ok) {
                STATE.root.innerHTML = '<div class="wam-empty">' +
                    'خطا در بارگذاری پرونده.</div>';
                return;
            }

            STATE.installed = true;

            if (options.debug) {
                console.log('[case-details] v' + VERSION + ' — ' +
                    caseId + ' (' + STATE.role + ')');
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
        STATE.caseData = null;
        STATE.caseId = null;
        STATE.installed = false;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            version: VERSION,
            installed: STATE.installed,
            caseId: STATE.caseId,
            role: STATE.role,
            activeTab: STATE.activeTab,
            hasCase: !!STATE.caseData,
            allowedTabs: getAllowedTabs(STATE.role)
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
    var WamCaseDetails = {
        VERSION: VERSION,
        EVENTS: DetailEvents,
        ROOT_ATTR: ROOT_ATTR,
        TABS: TABS,
        TAB_LABELS: TAB_LABELS,

        install: install,
        uninstall: uninstall,
        open: open,
        reload: reload,
        render: render,

        setTab: function (tab) {
            if (!TAB_LABELS[tab]) return false;
            var allowed = getAllowedTabs(STATE.role);
            if (allowed.indexOf(tab) === -1) return false;
            STATE.activeTab = tab;
            render();
            return true;
        },
        getActiveTab: function () { return STATE.activeTab; },
        getAllowedTabs: getAllowedTabs,

        canAccess: canAccess,

        getCaseData: function () { return STATE.caseData; },
        getCaseId: function () { return STATE.caseId; },

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamCaseDetails = WamCaseDetails;
    window.CaseDetailsEvents = DetailEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-case-details-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-case-details')) {
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