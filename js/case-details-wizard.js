// ==========================================
// وام پی — Shared Modules
// فایل: case-details-wizard.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: ویزارد ویرایش جزئیات پرونده با دسترسی نقش‌محور
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION   = '1.0.0';
    var ROOT_ATTR = 'data-cdwiz-root';
    var DRAFT_KEY = 'wamPayCaseEditDraft';

    var STEP_DEFS = [
        { id: 1, key: 'applicant',  title: 'اطلاعات متقاضی',  icon: '👤' },
        { id: 2, key: 'identity',   title: 'اطلاعات هویتی',   icon: '🆔' },
        { id: 3, key: 'financial',  title: 'اطلاعات مالی',    icon: '💰' },
        { id: 4, key: 'loan',       title: 'مشخصات وام',      icon: '🏦' },
        { id: 5, key: 'address',    title: 'آدرس و تماس',     icon: '📍' },
        { id: 6, key: 'review',     title: 'بازبینی نهایی',   icon: '✅' }
    ];

    // کدام نقش‌ها به کدام فیلدها دسترسی ویرایش دارند
    var FIELD_PERMISSIONS = {
        // اطلاعات متقاضی
        applicantName:       ['admin', 'super_admin', 'broker', 'applicant'],
        applicantMobile:     ['admin', 'super_admin', 'broker', 'applicant'],
        applicantEmail:      ['admin', 'super_admin', 'broker', 'applicant'],
        applicantPhone:      ['admin', 'super_admin', 'broker', 'applicant'],
        // هویتی
        applicantNationalCode: ['admin', 'super_admin', 'broker'],
        applicantIdNumber:     ['admin', 'super_admin', 'broker'],
        applicantBirthDate:    ['admin', 'super_admin', 'broker'],
        applicantBirthPlace:   ['admin', 'super_admin', 'broker'],
        applicantGender:       ['admin', 'super_admin', 'broker'],
        applicantMaritalStatus:['admin', 'super_admin', 'broker'],
        applicantEducation:    ['admin', 'super_admin', 'broker'],
        // مالی
        applicantJob:          ['admin', 'super_admin', 'broker', 'verifier'],
        employerName:          ['admin', 'super_admin', 'broker'],
        workExperience:        ['admin', 'super_admin', 'broker'],
        monthlyIncome:         ['admin', 'super_admin', 'broker', 'verifier'],
        otherIncome:           ['admin', 'super_admin', 'broker'],
        existingInstallments:  ['admin', 'super_admin', 'broker', 'verifier'],
        bankAccount:           ['admin', 'super_admin', 'broker'],
        iban:                  ['admin', 'super_admin', 'broker'],
        // وام
        bank:                  ['admin', 'super_admin', 'broker'],
        loanAmount:            ['admin', 'super_admin', 'broker'],
        loanDuration:          ['admin', 'super_admin', 'broker'],
        purpose:               ['admin', 'super_admin', 'broker'],
        collateralType:        ['admin', 'super_admin', 'broker'],
        collateralAmount:      ['admin', 'super_admin', 'broker'],
        collateralDesc:        ['admin', 'super_admin', 'broker', 'verifier'],
        loanNote:              ['admin', 'super_admin', 'broker', 'verifier'],
        // آدرس
        province:              ['admin', 'super_admin', 'broker', 'applicant'],
        city:                  ['admin', 'super_admin', 'broker', 'applicant'],
        address:               ['admin', 'super_admin', 'broker', 'applicant'],
        postalCode:            ['admin', 'super_admin', 'broker', 'applicant']
    };

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        mode: 'modal',      // 'modal' | 'inline'
        modalEl: null,
        caseId: null,
        caseData: null,
        draft: {},
        changedFields: {},
        currentStep: 1,
        totalSteps: STEP_DEFS.length,
        role: null,
        userId: null,
        submitting: false,
        listeners: [],
        _autoSaveTimer: null
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var CDWizEvents = {
        OPEN:        'cdwiz.open',
        CLOSE:       'cdwiz.close',
        STEP_CHANGE: 'cdwiz.step',
        DRAFT_SAVED: 'cdwiz.draft_saved',
        SUBMIT:      'cdwiz.submit',
        SUCCESS:     'cdwiz.success',
        FAIL:        'cdwiz.fail',
        FIELD_CHANGE:'cdwiz.field_change'
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

    function _uid() {
        if (typeof WamPermissions === 'undefined') return null;
        var me = WamPermissions.getCurrentUser();
        return me ? me.id : null;
    }

    function _user() {
        if (typeof WamPermissions === 'undefined') return null;
        return WamPermissions.getCurrentUser();
    }

    function _toast(type, msg, title) {
        if (typeof WamUI === 'undefined') return;
        if (type === 'success' && WamUI.toastSuccess) WamUI.toastSuccess(msg, title || 'موفق');
        else if (type === 'error' && WamUI.toastError) WamUI.toastError(msg, title || 'خطا');
        else if (type === 'warning' && WamUI.toastWarning) WamUI.toastWarning(msg, title || 'توجه');
        else if (type === 'info' && WamUI.toastInfo) WamUI.toastInfo(msg, title || 'اطلاع');
    }

    // ─────────────────────────────────────
    // 🔒 دسترسی فیلد
    // ─────────────────────────────────────
    function canEditField(fieldName) {
        var allowed = FIELD_PERMISSIONS[fieldName];
        if (!allowed) return false;
        return allowed.indexOf(STATE.role) !== -1;
    }

    function _hasAnyEditableField(stepKey) {
        var fields = _getStepFields(stepKey);
        for (var i = 0; i < fields.length; i++) {
            if (canEditField(fields[i].name)) return true;
        }
        return false;
    }

    function _getStepFields(stepKey) {
        if (stepKey === 'applicant') {
            return [
                { name: 'applicantName',   label: 'نام و نام خانوادگی', type: 'text' },
                { name: 'applicantMobile', label: 'موبایل', type: 'tel' },
                { name: 'applicantEmail',  label: 'ایمیل', type: 'email' },
                { name: 'applicantPhone',  label: 'تلفن ثابت', type: 'tel' }
            ];
        }
        if (stepKey === 'identity') {
            return [
                { name: 'applicantNationalCode', label: 'کد ملی', type: 'text', maxlength: 10 },
                { name: 'applicantIdNumber',     label: 'شماره شناسنامه', type: 'text' },
                { name: 'applicantBirthDate',    label: 'تاریخ تولد', type: 'text', persianDate: true },
                { name: 'applicantBirthPlace',   label: 'محل تولد', type: 'text' },
                { name: 'applicantGender',       label: 'جنسیت', type: 'select',
                  options: [{ v: 'male', l: 'مرد' }, { v: 'female', l: 'زن' }] },
                { name: 'applicantMaritalStatus', label: 'وضعیت تأهل', type: 'select',
                  options: [{ v: 'single', l: 'مجرد' }, { v: 'married', l: 'متأهل' }] },
                { name: 'applicantEducation',    label: 'تحصیلات', type: 'text' }
            ];
        }
        if (stepKey === 'financial') {
            return [
                { name: 'applicantJob',        label: 'شغل', type: 'text' },
                { name: 'employerName',        label: 'محل کار', type: 'text' },
                { name: 'workExperience',      label: 'سابقه کار (سال)', type: 'number' },
                { name: 'monthlyIncome',       label: 'درآمد ماهانه', type: 'number' },
                { name: 'otherIncome',         label: 'درآمد جانبی', type: 'number' },
                { name: 'existingInstallments',label: 'اقساط جاری', type: 'number' },
                { name: 'bankAccount',         label: 'شماره حساب', type: 'text' },
                { name: 'iban',                label: 'شبا', type: 'text' }
            ];
        }
        if (stepKey === 'loan') {
            return [
                { name: 'bank',              label: 'بانک', type: 'text' },
                { name: 'loanAmount',        label: 'مبلغ وام', type: 'number' },
                { name: 'loanDuration',      label: 'مدت بازپرداخت (ماه)', type: 'number' },
                { name: 'purpose',           label: 'هدف وام', type: 'text' },
                { name: 'collateralType',    label: 'نوع وثیقه', type: 'text' },
                { name: 'collateralAmount',  label: 'مبلغ وثیقه', type: 'number' },
                { name: 'collateralDesc',    label: 'شرح وثیقه', type: 'textarea' },
                { name: 'loanNote',          label: 'یادداشت وام', type: 'textarea' }
            ];
        }
        if (stepKey === 'address') {
            return [
                { name: 'province',   label: 'استان', type: 'text' },
                { name: 'city',       label: 'شهر', type: 'text' },
                { name: 'address',    label: 'آدرس کامل', type: 'textarea' },
                { name: 'postalCode', label: 'کد پستی', type: 'text', maxlength: 10 }
            ];
        }
        return [];
    }

    // ─────────────────────────────────────
    // 🧾 اعتبارسنجی
    // ─────────────────────────────────────
    function _validateStep(stepKey, data) {
        var errors = {};
        if (stepKey === 'applicant') {
            if (canEditField('applicantName') &&
                (!data.applicantName || String(data.applicantName).trim().length < 3)) {
                errors.applicantName = 'نام حداقل ۳ کاراکتر';
            }
            if (canEditField('applicantMobile') && data.applicantMobile) {
                var m = _en(data.applicantMobile).replace(/\D/g, '');
                if (m && !/^09\d{9}$/.test(m)) {
                    errors.applicantMobile = 'موبایل ۱۱ رقم و با ۰۹';
                }
            }
            if (canEditField('applicantEmail') && data.applicantEmail) {
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.applicantEmail)) {
                    errors.applicantEmail = 'ایمیل نامعتبر';
                }
            }
        }
        if (stepKey === 'identity') {
            if (canEditField('applicantNationalCode') && data.applicantNationalCode) {
                var c = _en(data.applicantNationalCode).replace(/\D/g, '');
                if (!/^\d{10}$/.test(c)) errors.applicantNationalCode = 'کد ملی ۱۰ رقم';
            }
        }
        if (stepKey === 'financial') {
            if (canEditField('monthlyIncome') && data.monthlyIncome) {
                var inc = Number(_en(data.monthlyIncome));
                if (inc < 0 || isNaN(inc)) errors.monthlyIncome = 'درآمد نامعتبر';
            }
        }
        if (stepKey === 'loan') {
            if (canEditField('loanAmount') && data.loanAmount) {
                var amt = Number(_en(data.loanAmount));
                if (amt < 1000000) errors.loanAmount = 'حداقل ۱ میلیون ریال';
            }
        }
        if (stepKey === 'address') {
            if (canEditField('postalCode') && data.postalCode) {
                var pc = _en(data.postalCode).replace(/\D/g, '');
                if (pc && !/^\d{10}$/.test(pc)) errors.postalCode = 'کد پستی ۱۰ رقم';
            }
        }
        return errors;
    }

    function _validateAll() {
        var all = {};
        for (var i = 0; i < STEP_DEFS.length; i++) {
            var e = _validateStep(STEP_DEFS[i].key, STATE.draft);
            for (var k in e) {
                if (Object.prototype.hasOwnProperty.call(e, k)) all[k] = e[k];
            }
        }
        return all;
    }

    // ─────────────────────────────────────
    // 💾 Draft
    // ─────────────────────────────────────
    function _saveDraft() {
        if (typeof Storage === 'undefined') return false;
        var key = DRAFT_KEY + ':' + STATE.caseId;
        var payload = {
            caseId: STATE.caseId,
            step: STATE.currentStep,
            draft: STATE.draft,
            changed: STATE.changedFields,
            savedAt: Date.now(),
            authorId: STATE.userId
        };
        var ok = Storage.setJSON(key, payload);
        if (ok) {
            _emit(CDWizEvents.DRAFT_SAVED, {
                caseId: STATE.caseId,
                changedCount: Object.keys(STATE.changedFields).length
            });
        }
        return ok;
    }

    function _loadDraft() {
        if (typeof Storage === 'undefined') return null;
        var key = DRAFT_KEY + ':' + STATE.caseId;
        var p = Storage.getJSON(key, null);
        if (!p || !p.draft) return null;
        // اگر مربوط به user دیگری است، رد کن
        if (p.authorId && p.authorId !== STATE.userId) return null;
        return p;
    }

    function _clearDraft() {
        if (typeof Storage === 'undefined') return false;
        var key = DRAFT_KEY + ':' + STATE.caseId;
        return Storage.remove(key);
    }

    function _scheduleAutoSave() {
        if (STATE._autoSaveTimer) clearTimeout(STATE._autoSaveTimer);
        STATE._autoSaveTimer = setTimeout(function () {
            _saveDraft();
        }, 900);
    }

    // ─────────────────────────────────────
    // 🔄 مقدار اولیه draft از caseData
    // ─────────────────────────────────────
    function _initDraftFromCase() {
        var c = STATE.caseData || {};
        var d = {};
        var allFields = [];
        for (var i = 0; i < STEP_DEFS.length; i++) {
            allFields = allFields.concat(_getStepFields(STEP_DEFS[i].key));
        }
        for (var j = 0; j < allFields.length; j++) {
            var f = allFields[j];
            d[f.name] = c[f.name] !== undefined && c[f.name] !== null ? c[f.name] : '';
        }
        return d;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — هدر
    // ─────────────────────────────────────
    function _renderHeader() {
        var changedCount = Object.keys(STATE.changedFields).length;
        return '<header class="wam-cdwiz__header">' +
            '<div class="wam-cdwiz__head-left">' +
                '<span class="wam-cdwiz__title">✏️ ویرایش پرونده</span>' +
                '<code>' + _esc(STATE.caseId) + '</code>' +
            '</div>' +
            '<div class="wam-cdwiz__head-right">' +
                (changedCount > 0 ?
                    '<span class="wam-cdwiz__changed-badge">' +
                    _fa(changedCount) + ' تغییر</span>' : '') +
                '<button class="wam-modal__close" data-cdwiz-action="close">×</button>' +
            '</div>' +
        '</header>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — Stepper
    // ─────────────────────────────────────
    function _renderStepper() {
        var html = '<div class="wam-cdwiz__stepper">';
        for (var i = 0; i < STEP_DEFS.length; i++) {
            var s = STEP_DEFS[i];
            var hasEditable = _hasAnyEditableField(s.key);
            var isCurrent = s.id === STATE.currentStep;
            var visited = s.id < STATE.currentStep;

            html += '<div class="wam-cdwiz__step' +
                (isCurrent ? ' is-current' : '') +
                (visited ? ' is-visited' : '') +
                (!hasEditable ? ' is-readonly' : '') + '" ' +
                'data-cdwiz-step="' + s.id + '" ' +
                'title="' + _esc(s.title) +
                (!hasEditable ? ' (فقط خواندنی)' : '') + '">' +
                '<div class="wam-cdwiz__step-icon">' + s.icon + '</div>' +
                '<div class="wam-cdwiz__step-title">' + _esc(s.title) + '</div>' +
                '</div>';

            if (i < STEP_DEFS.length - 1) {
                html += '<div class="wam-cdwiz__connector' +
                    (visited ? ' is-visited' : '') + '"></div>';
            }
        }
        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — فیلد
    // ─────────────────────────────────────
    function _renderField(f) {
        var editable = canEditField(f.name);
        var value = STATE.draft[f.name];
        if (value === undefined || value === null) value = '';
        var disabled = editable ? '' : ' disabled readonly';
        var changed = !!STATE.changedFields[f.name];
        var changedMark = changed ? ' data-changed="1"' : '';

        var html = '<div class="wam-field' +
            (!editable ? ' is-readonly' : '') +
            (changed ? ' is-changed' : '') + '">';
        html += '<label>' + _esc(f.label) +
            (!editable ? ' <span class="wam-cdwiz__lock">🔒</span>' : '') +
            '</label>';

        if (f.type === 'textarea') {
            html += '<textarea name="' + _esc(f.name) + '" rows="3"' +
                disabled + changedMark + '>' + _esc(value) + '</textarea>';
        } else if (f.type === 'select') {
            html += '<select name="' + _esc(f.name) + '"' + disabled + changedMark + '>';
            html += '<option value="">— انتخاب —</option>';
            for (var i = 0; i < f.options.length; i++) {
                var o = f.options[i];
                html += '<option value="' + _esc(o.v) + '"' +
                    (String(value) === String(o.v) ? ' selected' : '') + '>' +
                    _esc(o.l) + '</option>';
            }
            html += '</select>';
        } else {
            var attrs = '';
            if (f.maxlength) attrs += ' maxlength="' + f.maxlength + '"';
            if (f.persianDate) attrs += ' data-persian-date';
            html += '<input type="' + _esc(f.type) + '" name="' + _esc(f.name) + '" ' +
                'value="' + _esc(value) + '"' + disabled + attrs + changedMark + '>';
        }

        html += '<div class="wam-field__error" data-error="' + _esc(f.name) + '"></div>';
        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — مرحله جاری
    // ─────────────────────────────────────
    function _renderStep() {
        var stepDef = STEP_DEFS[STATE.currentStep - 1];
        if (!stepDef) return '<div class="wam-empty">مرحله نامعتبر.</div>';

        if (stepDef.key === 'review') return _renderReview();

        var fields = _getStepFields(stepDef.key);
        var html = '<div class="wam-cdwiz__step-body">' +
            '<h3>' + stepDef.icon + ' ' + _esc(stepDef.title) + '</h3>';

        if (!_hasAnyEditableField(stepDef.key)) {
            html += '<div class="wam-cdwiz__readonly-note">' +
                '🔒 شما اجازه ویرایش این بخش را ندارید. فقط می‌توانید مشاهده کنید.' +
                '</div>';
        }

        for (var i = 0; i < fields.length; i++) {
            html += _renderField(fields[i]);
        }

        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — بازبینی
    // ─────────────────────────────────────
    function _renderReview() {
        var changes = STATE.changedFields;
        var keys = Object.keys(changes);

        var html = '<div class="wam-cdwiz__step-body">' +
            '<h3>✅ بازبینی تغییرات</h3>';

        if (keys.length === 0) {
            html += '<div class="wam-empty">هیچ تغییری اعمال نشده است.</div>';
            return html;
        }

        html += '<p class="wam-cdwiz__review-desc">' +
            'تغییرات زیر پس از تأیید ثبت می‌شوند:</p>';

        html += '<div class="wam-cdwiz__changes">';
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var oldVal = STATE.caseData[key] !== undefined ? STATE.caseData[key] : '—';
            var newVal = STATE.draft[key];
            if (oldVal === newVal) continue;

            html += '<div class="wam-cdwiz__change-row">' +
                '<div class="wam-cdwiz__change-field">' +
                _esc(_labelOf(key)) + '</div>' +
                '<div class="wam-cdwiz__change-values">' +
                '<span class="wam-cdwiz__old">' +
                _esc(oldVal === '' || oldVal === null ? '—' : oldVal) + '</span>' +
                '<span class="wam-cdwiz__arrow">→</span>' +
                '<span class="wam-cdwiz__new">' +
                _esc(newVal === '' || newVal === null ? '—' : newVal) + '</span>' +
                '</div></div>';
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    function _labelOf(name) {
        var allFields = [];
        for (var i = 0; i < STEP_DEFS.length; i++) {
            allFields = allFields.concat(_getStepFields(STEP_DEFS[i].key));
        }
        for (var j = 0; j < allFields.length; j++) {
            if (allFields[j].name === name) return allFields[j].label;
        }
        return name;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ناوبری
    // ─────────────────────────────────────
    function _renderNav() {
        var first = STATE.currentStep === 1;
        var last = STATE.currentStep === STATE.totalSteps;
        var changedCount = Object.keys(STATE.changedFields).length;

        var html = '<div class="wam-cdwiz__nav">';
        html += '<button type="button" class="wam-btn wam-btn--ghost" ' +
                'data-cdwiz-action="prev"' + (first ? ' disabled' : '') + '>' +
                '‹ قبلی</button>';

        html += '<div class="wam-cdwiz__nav-center">' +
                '<span class="wam-cdwiz__step-num">' +
                'مرحله ' + _fa(STATE.currentStep) + '/' +
                _fa(STATE.totalSteps) + '</span>' +
                '</div>';

        if (last) {
            html += '<button type="button" class="wam-btn wam-btn--primary" ' +
                    'data-cdwiz-action="submit"' +
                    (changedCount === 0 ? ' disabled' : '') + '>' +
                    '💾 ثبت تغییرات (' + _fa(changedCount) + ')</button>';
        } else {
            html += '<button type="button" class="wam-btn wam-btn--primary" ' +
                    'data-cdwiz-action="next">بعدی ›</button>';
        }

        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.modalEl) return;
        var content = STATE.modalEl.querySelector('[data-cdwiz="content"]');
        if (!content) return;

        var html =
            _renderHeader() +
            _renderStepper() +
            '<div class="wam-cdwiz__body" data-cdwiz="body">' +
                _renderStep() +
            '</div>' +
            _renderNav();

        // در حالت modal، content شامل فقط بدنه است
        // در حالت inline، همه چیز در root
        content.innerHTML =
            _renderStepper() +
            '<div class="wam-cdwiz__body">' +
                _renderStep() +
            '</div>' +
            _renderNav();

        _bindEvents(content);
        _applyPersianDate(content);
    }

    function _applyPersianDate(root) {
        if (typeof WamPersianDate === 'undefined') return;
        if (!WamPersianDate.bindAll) return;
        try { WamPersianDate.bindAll(root); } catch (e) { /* بی‌صدا */ }
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents(root) {
        if (!root) return;

        // اکشن‌ها
        var btns = root.querySelectorAll('[data-cdwiz-action]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', _handleAction);
        }

        // Stepper
        var steps = root.querySelectorAll('[data-cdwiz-step]');
        for (var j = 0; j < steps.length; j++) {
            steps[j].addEventListener('click', _handleStepClick);
        }

        // Inputs
        var inputs = root.querySelectorAll('input[name], select[name], textarea[name]');
        for (var k = 0; k < inputs.length; k++) {
            inputs[k].addEventListener('input', _handleFieldChange);
            inputs[k].addEventListener('change', _handleFieldChange);
        }
    }

    function _handleAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-cdwiz-action');

        if (a === 'close') { close(); return; }
        if (a === 'prev') { goPrev(); return; }
        if (a === 'next') { goNext(); return; }
        if (a === 'submit') { submit(); return; }
    }

    function _handleStepClick() {
        var s = parseInt(this.getAttribute('data-cdwiz-step'), 10);
        if (isNaN(s)) return;
        if (s <= STATE.currentStep) {
            STATE.currentStep = s;
            render();
        } else {
            goToStep(s);
        }
    }

    function _handleFieldChange() {
        var name = this.getAttribute('name');
        if (!name) return;
        if (!canEditField(name)) return;

        var val = this.value;
        STATE.draft[name] = val;

        // تشخیص تغییر
        var original = STATE.caseData[name];
        if (original === undefined || original === null) original = '';
        if (String(val) !== String(original)) {
            STATE.changedFields[name] = val;
        } else {
            delete STATE.changedFields[name];
        }

        _clearFieldError(name);
        _scheduleAutoSave();

        _emit(CDWizEvents.FIELD_CHANGE, {
            field: name,
            changed: !!STATE.changedFields[name]
        });
    }

    // ─────────────────────────────────────
    // 🎯 ناوبری
    // ─────────────────────────────────────
    function goNext() {
        if (STATE.submitting) return false;

        var stepKey = STEP_DEFS[STATE.currentStep - 1].key;
        var errors = _validateStep(stepKey, STATE.draft);
        if (Object.keys(errors).length > 0) {
            _showErrors(errors);
            _toast('error', 'لطفاً خطاها را برطرف کنید', 'خطا');
            return false;
        }
        if (STATE.currentStep >= STATE.totalSteps) return false;

        STATE.currentStep++;
        _saveDraft();
        render();
        _emit(CDWizEvents.STEP_CHANGE, { step: STATE.currentStep });
        return true;
    }

    function goPrev() {
        if (STATE.submitting) return false;
        if (STATE.currentStep <= 1) return false;
        STATE.currentStep--;
        _saveDraft();
        render();
        _emit(CDWizEvents.STEP_CHANGE, { step: STATE.currentStep });
        return true;
    }

    function goToStep(s) {
        if (s < 1 || s > STATE.totalSteps) return false;
        if (s > STATE.currentStep) {
            // اعتبارسنجی مراحل بین
            for (var i = STATE.currentStep; i < s; i++) {
                var errs = _validateStep(STEP_DEFS[i - 1].key, STATE.draft);
                if (Object.keys(errs).length > 0) {
                    STATE.currentStep = i;
                    render();
                    _showErrors(errs);
                    return false;
                }
            }
        }
        STATE.currentStep = s;
        render();
        return true;
    }

    // ─────────────────────────────────────
    // 🎨 خطاها
    // ─────────────────────────────────────
    function _showErrors(errors) {
        for (var k in errors) {
            if (!Object.prototype.hasOwnProperty.call(errors, k)) continue;
            var el = STATE.modalEl.querySelector('[data-error="' + k + '"]');
            if (el) {
                el.textContent = errors[k];
                el.style.display = 'block';
            }
            var input = STATE.modalEl.querySelector('[name="' + k + '"]');
            if (input) input.classList.add('wam-input--error');
        }
    }

    function _clearFieldError(name) {
        if (!STATE.modalEl) return;
        var el = STATE.modalEl.querySelector('[data-error="' + name + '"]');
        if (el) { el.textContent = ''; el.style.display = 'none'; }
        var input = STATE.modalEl.querySelector('[name="' + name + '"]');
        if (input) input.classList.remove('wam-input--error');
    }

    function _clearAllErrors() {
        if (!STATE.modalEl) return;
        var errs = STATE.modalEl.querySelectorAll('[data-error]');
        for (var i = 0; i < errs.length; i++) {
            errs[i].textContent = '';
            errs[i].style.display = 'none';
        }
        var inputs = STATE.modalEl.querySelectorAll('.wam-input--error');
        for (var j = 0; j < inputs.length; j++) {
            inputs[j].classList.remove('wam-input--error');
        }
    }

    // ─────────────────────────────────────
    // 💾 ارسال نهایی
    // ─────────────────────────────────────
    function submit() {
        if (STATE.submitting) return false;
        if (Object.keys(STATE.changedFields).length === 0) {
            _toast('info', 'هیچ تغییری برای ثبت وجود ندارد', 'توجه');
            return false;
        }

        // اعتبارسنجی کامل
        var errors = _validateAll();
        if (Object.keys(errors).length > 0) {
            for (var s = 1; s <= STATE.totalSteps; s++) {
                var se = _validateStep(STEP_DEFS[s - 1].key, STATE.draft);
                if (Object.keys(se).length > 0) {
                    STATE.currentStep = s;
                    render();
                    _showErrors(se);
                    break;
                }
            }
            _toast('error', 'خطاها را برطرف کنید', 'خطا');
            return false;
        }

        // بررسی قفل پرونده
        if (typeof CaseRepository !== 'undefined' && CaseRepository.isLocked) {
            if (CaseRepository.isLocked(STATE.caseId, STATE.userId)) {
                _toast('warning', 'پرونده توسط کاربر دیگری قفل است', 'توجه');
                return false;
            }
        }

        STATE.submitting = true;
        _setBusy(true);
        _emit(CDWizEvents.SUBMIT, {
            caseId: STATE.caseId,
            changedCount: Object.keys(STATE.changedFields).length
        });

        setTimeout(function () {
            var res = _applyChanges();
            if (!res.ok) {
                STATE.submitting = false;
                _setBusy(false);
                _emit(CDWizEvents.FAIL, res);
                _toast('error', 'خطا در ثبت: ' + (res.reason || 'نامشخص'), 'خطا');
                return;
            }

            _clearDraft();

            _emit(CDWizEvents.SUCCESS, {
                caseId: STATE.caseId,
                changedCount: Object.keys(STATE.changedFields).length
            });

            if (typeof WamUI !== 'undefined') {
                WamUI.toastSuccess(
                    _fa(Object.keys(STATE.changedFields).length) +
                    ' تغییر با موفقیت ثبت شد',
                    'موفق'
                );
            }

            close({ saved: true });
        }, 400);
    }

    function _applyChanges() {
        if (typeof CaseRepository === 'undefined') {
            return { ok: false, reason: 'no_repo' };
        }

        var patch = {};
        var changed = STATE.changedFields;
        var count = 0;
        for (var k in changed) {
            if (!Object.prototype.hasOwnProperty.call(changed, k)) continue;
            var val = changed[k];

            // نرمال‌سازی
            if (k === 'applicantMobile' || k === 'postalCode' ||
                k === 'applicantNationalCode' || k === 'bankAccount') {
                val = _en(val).replace(/\D/g, '');
            }
            if (k === 'monthlyIncome' || k === 'otherIncome' ||
                k === 'existingInstallments' || k === 'loanAmount' ||
                k === 'loanDuration' || k === 'collateralAmount' ||
                k === 'workExperience') {
                val = Number(_en(val)) || 0;
            }
            if (k === 'iban') {
                val = _en(val).replace(/\s/g, '').toUpperCase();
            }

            patch[k] = val;
            count++;
        }

        if (count === 0) return { ok: false, reason: 'no_changes' };

        patch.lastEditedAt = Date.now();
        patch.lastEditedBy = STATE.userId;
        patch.lastEditedByName = (function () {
            var u = _user();
            return u ? (u.name || u.username) : null;
        })();

        var updated = CaseRepository.update(STATE.caseId, patch, {
            userId: STATE.userId
        });

        if (!updated) return { ok: false, reason: 'update_failed' };

        return { ok: true, case: updated, count: count };
    }

    function _setBusy(b) {
        if (!STATE.modalEl) return;
        var btn = STATE.modalEl.querySelector('[data-cdwiz-action="submit"]');
        if (!btn) return;
        if (b) {
            btn.disabled = true;
            btn.setAttribute('data-orig', btn.textContent);
            btn.textContent = 'در حال ثبت...';
        } else {
            btn.disabled = false;
            var o = btn.getAttribute('data-orig');
            if (o) btn.textContent = o;
        }
    }

    // ─────────────────────────────────────
    // 🎯 باز کردن
    // ─────────────────────────────────────
    function open(caseId, options) {
        options = options || {};
        if (!caseId) return false;

        var user = _user();
        if (!user) {
            _toast('error', 'ابتدا وارد شوید', 'خطا');
            return false;
        }
        STATE.userId = user.id;
        STATE.role = user.role;

        if (typeof CaseRepository === 'undefined') return false;
        var c = null;
        try { c = CaseRepository.get(caseId); }
        catch (e) { c = null; }

        if (!c) {
            _toast('error', 'پرونده یافت نشد', 'خطا');
            return false;
        }

        STATE.caseId = caseId;
        STATE.caseData = c;
        STATE.currentStep = 1;
        STATE.changedFields = {};
        STATE.draft = _initDraftFromCase();

        // بازیابی draft
        var saved = _loadDraft();
        if (saved && saved.draft && options.restoreDraft !== false) {
            STATE.draft = Object.assign({}, STATE.draft, saved.draft);
            STATE.currentStep = saved.step || 1;
            STATE.changedFields = saved.changed || {};
            _toast('info', 'پیش‌نویس قبلی بازیابی شد', 'خوش آمدید');
        }

        _createModal(options);

        render();
        _emit(CDWizEvents.OPEN, { caseId: caseId, at: Date.now() });
        return true;
    }

    function _createModal(options) {
        // حذف modal قدیمی
        if (STATE.modalEl && STATE.modalEl.parentNode) {
            STATE.modalEl.parentNode.removeChild(STATE.modalEl);
        }

        var modal = document.createElement('div');
        modal.className = 'wam-modal wam-cdwiz-modal';
        modal.id = 'wamCDWizModal';

        var wide = options.wide !== false;
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-cdwiz-action="close"></div>' +
            '<div class="wam-modal__panel' + (wide ? ' wam-modal__panel--wide' : '') +
            '">' +
                _renderHeader() +
                '<div class="wam-modal__body" data-cdwiz="content"></div>' +
            '</div>';

        document.body.appendChild(modal);
        STATE.modalEl = modal;

        // بایند close روی overlay
        var overlay = modal.querySelector('[data-cdwiz-action="close"]');
        if (overlay) {
            overlay.addEventListener('click', function () { close(); });
        }
        var closeBtn = modal.querySelector('[data-cdwiz-action="close"]');
        if (closeBtn && closeBtn !== overlay) {
            closeBtn.addEventListener('click', function () { close(); });
        }

        // ESC
        document.addEventListener('keydown', _escHandler);
    }

    function _escHandler(e) {
        if (e.key === 'Escape') {
            close();
        }
    }

    // ─────────────────────────────────────
    // 🚪 بستن
    // ─────────────────────────────────────
    function close(options) {
        options = options || {};
        var changedCount = Object.keys(STATE.changedFields).length;

        // اگر تغییرات ذخیره‌نشده دارد و user نخواسته مستقیم ببنده، هشدار بده
        if (changedCount > 0 && !options.saved && !options.force) {
            var doIt = function () {
                _saveDraft();
                _doClose();
            };
            var msg = 'تغییرات ذخیره‌نشده دارید. پیش‌نویس ذخیره و بسته شود؟';
            if (typeof WamUI !== 'undefined' && WamUI.confirm) {
                WamUI.confirm('بستن', msg).then(function (ok) {
                    if (ok) doIt();
                });
            } else if (window.confirm(msg)) {
                doIt();
            }
            return false;
        }

        _doClose();
        return true;
    }

    function _doClose() {
        if (STATE._autoSaveTimer) clearTimeout(STATE._autoSaveTimer);
        document.removeEventListener('keydown', _escHandler);

        if (STATE.modalEl && STATE.modalEl.parentNode) {
            STATE.modalEl.parentNode.removeChild(STATE.modalEl);
        }
        STATE.modalEl = null;

        _emit(CDWizEvents.CLOSE, {
            caseId: STATE.caseId,
            at: Date.now()
        });
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (STATE.installed && !options.force) return;
        STATE.installed = true;

        if (options.debug) {
            console.log('[case-details-wizard] v' + VERSION + ' آماده');
        }
    }

    function uninstall() {
        _doClose();
        STATE.installed = false;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            version: VERSION,
            installed: STATE.installed,
            isOpen: !!STATE.modalEl,
            caseId: STATE.caseId,
            role: STATE.role,
            currentStep: STATE.currentStep,
            totalSteps: STATE.totalSteps,
            changedCount: Object.keys(STATE.changedFields).length,
            submitting: STATE.submitting
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
    var WamCaseDetailsWizard = {
        VERSION: VERSION,
        EVENTS: CDWizEvents,
        ROOT_ATTR: ROOT_ATTR,
        DRAFT_KEY: DRAFT_KEY,
        STEP_DEFS: STEP_DEFS,
        FIELD_PERMISSIONS: FIELD_PERMISSIONS,

        install: install,
        uninstall: uninstall,
        open: open,
        close: close,
        render: render,

        goNext: goNext,
        goPrev: goPrev,
        goToStep: goToStep,
        submit: submit,

        canEditField: canEditField,
        getChangedFields: function () {
            return JSON.parse(JSON.stringify(STATE.changedFields));
        },
        getDraft: function () {
            return JSON.parse(JSON.stringify(STATE.draft));
        },
        resetChanges: function () {
            STATE.changedFields = {};
            STATE.draft = _initDraftFromCase();
            render();
            return true;
        },

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamCaseDetailsWizard = WamCaseDetailsWizard;
    window.CaseDetailsWizardEvents = CDWizEvents;

    // ثبت خودکار
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { install(); });
        } else {
            install();
        }
    }

})();