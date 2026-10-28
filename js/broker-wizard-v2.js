// ==========================================
// وام پی — Broker Panel
// فایل: broker-wizard-v2.js
// نسخه: 2.0.0
// تاریخ: 1405/01/15
// کارش: ویزارد پیشرفته ثبت پرونده کارگزار — هسته اصلی (Controller)
//        با پشتیبانی از Steps و Actions جداگانه
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION      = '2.0.0';
    var DRAFT_KEY    = 'wamPayBrokerDraftV2';
    var ROOT_ATTR    = 'data-broker-wizard-v2';
    var BROKERS_KEY  = 'wamPayBrokers';
    var DRAFT_TTL    = 7 * 24 * 60 * 60 * 1000;   // ۷ روز

    // تعریف مراحل پیشرفته (۶ مرحله)
    var STEPS_DEF = [
        { id: 1, key: 'applicant',    title: 'اطلاعات متقاضی',    icon: '👤', required: true },
        { id: 2, key: 'identity',     title: 'تأیید هویت',        icon: '🆔', required: true },
        { id: 3, key: 'financial',    title: 'اطلاعات مالی',      icon: '💰', required: true },
        { id: 4, key: 'loan',         title: 'مشخصات وام',        icon: '🏦', required: true },
        { id: 5, key: 'documents',    title: 'مدارک',             icon: '📎', required: false },
        { id: 6, key: 'review',       title: 'بررسی نهایی',       icon: '✅', required: true }
    ];

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        currentStep: 1,
        totalSteps: STEPS_DEF.length,
        stepsDef: STEPS_DEF,
        data: {},
        uploadedDocs: [],
        visitingLog: [],
        broker: null,
        submitting: false,
        listeners: [],
        _draftTimer: null,
        lastSavedAt: null,
        restoredFromDraft: false
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var V2Events = {
        START:      'bwizv2.start',
        STEP:       'bwizv2.step',
        DRAFT:      'bwizv2.draft_saved',
        LOAD:       'bwizv2.draft_loaded',
        DRAFT_CLEAR:'bwizv2.draft_cleared',
        SUBMIT:     'bwizv2.submit',
        SUCCESS:    'bwizv2.success',
        FAIL:       'bwizv2.fail',
        CANCEL:     'bwizv2.cancel',
        VALIDATE:   'bwizv2.validate',
        DOC_ADDED:  'bwizv2.doc_added',
        DOC_REMOVED:'bwizv2.doc_removed'
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
        var x = Number(n); if (isNaN(x)) return '—';
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

    function _loadBroker() {
        if (typeof Storage === 'undefined') return null;
        var all = Storage.getJSON(BROKERS_KEY, []) || [];
        var u = (typeof WamPermissions !== 'undefined') ? WamPermissions.getCurrentUser() : null;
        if (!u) return null;
        for (var i = 0; i < all.length; i++) {
            var b = all[i]; if (!b) continue;
            if (b.userId && b.userId === u.id) return b;
            if (b.mobile && u.mobile &&
                String(b.mobile).replace(/\D/g, '') === String(u.mobile).replace(/\D/g, '')) return b;
        }
        return null;
    }

    function _genCaseId() {
        var y = new Date().getFullYear() % 100;
        var r = Math.floor(Math.random() * 9999);
        return 'WP-' + y + '-' + ('0000' + r).slice(-4);
    }

    // ─────────────────────────────────────
    // 🎯 رجیستری ماژول‌ها (Steps و Actions)
    // ─────────────────────────────────────
    // این توابع در فایل‌های brother با نام WamBrokerWizardV2Steps
    // و WamBrokerWizardV2Actions ثبت می‌شوند.
    function _getSteps() {
        return (typeof WamBrokerWizardV2Steps !== 'undefined') ? WamBrokerWizardV2Steps : null;
    }

    function _getActions() {
        return (typeof WamBrokerWizardV2Actions !== 'undefined') ? WamBrokerWizardV2Actions : null;
    }

    // ─────────────────────────────────────
    // 📥 Draft
    // ─────────────────────────────────────
    function saveDraft() {
        if (typeof Storage === 'undefined') return false;
        var payload = {
            version: VERSION,
            step: STATE.currentStep,
            data: STATE.data,
            docs: STATE.uploadedDocs,
            savedAt: Date.now()
        };
        var ok = Storage.setJSON(DRAFT_KEY, payload);
        if (ok) {
            STATE.lastSavedAt = Date.now();
            _emit(V2Events.DRAFT, { step: STATE.currentStep, at: STATE.lastSavedAt });
        }
        return ok;
    }

    function loadDraft() {
        if (typeof Storage === 'undefined') return null;
        var p = Storage.getJSON(DRAFT_KEY, null);
        if (!p || !p.data) return null;
        // بررسی TTL
        if (p.savedAt && (Date.now() - p.savedAt) > DRAFT_TTL) {
            clearDraft();
            return null;
        }
        return p;
    }

    function clearDraft() {
        if (typeof Storage === 'undefined') return false;
        var ok = Storage.remove(DRAFT_KEY);
        if (ok) _emit(V2Events.DRAFT_CLEAR, { at: Date.now() });
        return ok;
    }

    function hasDraft() {
        if (typeof Storage === 'undefined') return false;
        var p = Storage.getJSON(DRAFT_KEY, null);
        if (!p || !p.data) return false;
        if (p.savedAt && (Date.now() - p.savedAt) > DRAFT_TTL) return false;
        return true;
    }

    function _scheduleSave() {
        if (STATE._draftTimer) clearTimeout(STATE._draftTimer);
        STATE._draftTimer = setTimeout(function () {
            saveDraft();
        }, 900);
    }

    // ─────────────────────────────────────
    // 🧾 اعتبارسنجی (کلی)
    // ─────────────────────────────────────
    function validateStep(step, data) {
        data = data || STATE.data;
        var e = {};

        if (step === 1) {
            if (!data.applicantName || String(data.applicantName).trim().length < 3)
                e.applicantName = 'نام حداقل ۳ کاراکتر باشد';
            if (!data.applicantMobile || !/^09\d{9}$/.test(_en(data.applicantMobile)))
                e.applicantMobile = 'موبایل ۱۱ رقم و با ۰۹';
            if (data.applicantEmail &&
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.applicantEmail))
                e.applicantEmail = 'ایمیل نامعتبر';
        } else if (step === 2) {
            if (!data.applicantNationalCode ||
                !/^\d{10}$/.test(_en(data.applicantNationalCode)))
                e.applicantNationalCode = 'کد ملی ۱۰ رقم';
            if (!data.applicantBirthDate)
                e.applicantBirthDate = 'تاریخ تولد الزامی';
            if (!data.applicantGender)
                e.applicantGender = 'جنسیت الزامی';
            if (data.applicantIdNumber && String(data.applicantIdNumber).length < 5)
                e.applicantIdNumber = 'شماره شناسنامه نامعتبر';
        } else if (step === 3) {
            if (!data.applicantJob)
                e.applicantJob = 'شغل الزامی';
            if (!data.monthlyIncome || Number(_en(data.monthlyIncome)) <= 0)
                e.monthlyIncome = 'درآمد ماهانه الزامی';
            if (data.otherIncome && Number(_en(data.otherIncome)) < 0)
                e.otherIncome = 'درآمد نامعتبر';
        } else if (step === 4) {
            if (!data.bank) e.bank = 'بانک الزامی';
            if (!data.loanAmount || Number(_en(data.loanAmount)) < 1000000)
                e.loanAmount = 'حداقل ۱ میلیون ریال';
            if (!data.loanDuration) e.loanDuration = 'مدت الزامی';
            if (!data.purpose) e.purpose = 'هدف الزامی';
            if (data.collateralType && !data.collateralDesc)
                e.collateralDesc = 'توضیح وثیقه الزامی';
        } else if (step === 5) {
            // مدارک اختیاری — ولی اگر مدرک الزامی تعریف شده بود
            if (data.requiredDocs && data.requiredDocs.length > 0) {
                for (var i = 0; i < data.requiredDocs.length; i++) {
                    var code = data.requiredDocs[i];
                    var found = false;
                    for (var j = 0; j < STATE.uploadedDocs.length; j++) {
                        if (STATE.uploadedDocs[j].type === code) { found = true; break; }
                    }
                    if (!found) e.docs = 'مدارک الزامی بارگذاری نشده';
                }
            }
        } else if (step === 6) {
            if (!data.agreeTerms) e.agreeTerms = 'پذیرش قوانین الزامی';
            if (!data.agreeTruth) e.agreeTruth = 'تأیید صحت اطلاعات الزامی';
        }

        return e;
    }

    function validateAll(data) {
        data = data || STATE.data;
        var all = {};
        for (var s = 1; s <= STATE.totalSteps; s++) {
            var e = validateStep(s, data);
            for (var k in e) if (Object.prototype.hasOwnProperty.call(e, k)) all[k] = e[k];
        }
        return all;
    }

    function isStepComplete(step) {
        return Object.keys(validateStep(step)).length === 0;
    }

    // ─────────────────────────────────────
    // 📊 پیشرفت
    // ─────────────────────────────────────
    function computeProgress() {
        var done = 0;
        for (var s = 1; s <= STATE.totalSteps; s++) {
            if (isStepComplete(s)) done++;
        }
        return {
            done: done,
            total: STATE.totalSteps,
            percent: Math.round((done / STATE.totalSteps) * 100),
            currentStep: STATE.currentStep
        };
    }

    // ─────────────────────────────────────
    // 🎨 رندر — Progress + Tabs
    // ─────────────────────────────────────
    function _renderProgress() {
        var p = computeProgress();
        return '<div class="wam-wizv2__progress">' +
               '<div class="wam-wizv2__progress-bar"><div class="wam-wizv2__progress-fill" ' +
               'style="width:' + p.percent + '%"></div></div>' +
               '<div class="wam-wizv2__progress-label">' +
               _fa(p.done) + ' از ' + _fa(p.total) + ' مرحله تکمیل' +
               ' (' + _fa(p.percent) + '٪)</div>' +
               '</div>';
    }

    function _renderStepper() {
        var html = '<div class="wam-wizv2__stepper">';
        for (var i = 0; i < STATE.stepsDef.length; i++) {
            var s = STATE.stepsDef[i];
            var isDone = isStepComplete(s.id);
            var isCurrent = s.id === STATE.currentStep;
            var visited = STATE.visitingLog.indexOf(s.id) !== -1;
            html += '<div class="wam-wizv2__step' +
                (isCurrent ? ' is-current' : '') +
                (isDone ? ' is-done' : '') +
                (visited ? ' is-visited' : '') + '" ' +
                'data-wizv2-step="' + s.id + '" ' +
                'title="' + _esc(s.title) + '">' +
                '<div class="wam-wizv2__step-icon">' + s.icon + '</div>' +
                '<div class="wam-wizv2__step-title">' + _esc(s.title) + '</div>' +
                '</div>';
            if (i < STATE.stepsDef.length - 1) {
                html += '<div class="wam-wizv2__connector' +
                    (isDone ? ' is-done' : '') + '"></div>';
            }
        }
        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — محتوای مرحله
    // ─────────────────────────────────────
    function _renderCurrentStep() {
        var stepsMod = _getSteps();
        if (!stepsMod) {
            return '<div class="wam-empty">' +
                   'ماژول گام‌ها بارگذاری نشده (broker-wizard-v2-steps.js)</div>';
        }

        var stepDef = STATE.stepsDef[STATE.currentStep - 1];
        if (!stepDef) return '<div class="wam-empty">مرحله نامعتبر.</div>';

        // اگر steps یک تابع renderStep داشته باشد
        if (typeof stepsMod.renderStep === 'function') {
            try {
                return stepsMod.renderStep(stepDef.key, STATE.data, STATE);
            } catch (err) {
                console.error('[broker-wizard-v2] renderStep error:', err);
                return '<div class="wam-empty">خطا در رندر مرحله.</div>';
            }
        }

        // fallback: از getRenderer استفاده کن
        if (typeof stepsMod.getRenderer === 'function') {
            var renderer = stepsMod.getRenderer(stepDef.key);
            if (typeof renderer === 'function') {
                try { return renderer(STATE.data, STATE); }
                catch (err) { return '<div class="wam-empty">خطا در رندر.</div>'; }
            }
        }

        return '<div class="wam-empty">رندرکننده مرحله یافت نشد.</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ناوبری
    // ─────────────────────────────────────
    function _renderNav() {
        var first = STATE.currentStep === 1;
        var last = STATE.currentStep === STATE.totalSteps;

        var html = '<div class="wam-wizv2__nav">';
        html += '<button type="button" class="wam-btn wam-btn--ghost" ' +
                'data-wizv2-action="prev"' + (first ? ' disabled' : '') + '>' +
                '‹ قبلی</button>';

        html += '<div class="wam-wizv2__nav-center">' +
                '<span class="wam-wizv2__step-number">' +
                'مرحله ' + _fa(STATE.currentStep) + ' از ' + _fa(STATE.totalSteps) +
                '</span>' +
                '<button type="button" class="wam-btn wam-btn--ghost wam-btn--sm" ' +
                'data-wizv2-action="save-draft" title="ذخیره پیش‌نویس">💾</button>' +
                '</div>';

        if (last) {
            html += '<button type="button" class="wam-btn wam-btn--primary" ' +
                    'data-wizv2-action="submit">ثبت نهایی ✓</button>';
        } else {
            html += '<button type="button" class="wam-btn wam-btn--primary" ' +
                    'data-wizv2-action="next">بعدی ›</button>';
        }

        html += '</div>';

        // وضعیت draft
        if (STATE.lastSavedAt) {
            html += '<div class="wam-wizv2__draft-info">' +
                    '💾 ذخیره خودکار فعال — آخرین ذخیره: ' +
                    _esc(_relTime(STATE.lastSavedAt)) +
                    '</div>';
        }

        return html;
    }

    function _relTime(ts) {
        if (!ts) return '—';
        var d = Date.now() - ts;
        var s = Math.floor(d / 1000);
        if (s < 60) return 'همین الان';
        var m = Math.floor(s / 60);
        if (m < 60) return _fa(m) + ' دقیقه پیش';
        return _fa(Math.floor(m / 60)) + ' ساعت پیش';
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;

        var html =
            '<div class="wam-wizv2">' +
                _renderProgress() +
                _renderStepper() +
                '<div class="wam-wizv2__body" data-wizv2="body">' +
                    '<form class="wam-wizv2__form" onsubmit="return false">' +
                        _renderCurrentStep() +
                        _renderNav() +
                    '</form>' +
                '</div>' +
            '</div>';

        STATE.root.innerHTML = html;

        _bindInputs();
        _bindNav();
        _bindStepper();

        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.bindAll) {
            try { WamPersianDate.bindAll(STATE.root); } catch (e) { /* بی‌صدا */ }
        }

        // اطلاع به ماژول Actions
        var actionsMod = _getActions();
        if (actionsMod && typeof actionsMod.afterRender === 'function') {
            try { actionsMod.afterRender(STATE.root, STATE); } catch (e) { /* بی‌صدا */ }
        }
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindInputs() {
        if (!STATE.root) return;
        var els = STATE.root.querySelectorAll('input[name], select[name], textarea[name]');
        for (var i = 0; i < els.length; i++) {
            els[i].addEventListener('input', _onFieldChange);
            els[i].addEventListener('change', _onFieldChange);
        }
    }

    function _onFieldChange() {
        var name = this.getAttribute('name');
        if (!name) return;
        if (this.type === 'checkbox') {
            STATE.data[name] = !!this.checked;
        } else if (this.type === 'file') {
            // فایل‌ها را actions مدیریت می‌کند
        } else {
            STATE.data[name] = this.value;
        }
        _clearFieldError(name);
        _scheduleSave();

        // اطلاع به Actions
        var actionsMod = _getActions();
        if (actionsMod && typeof actionsMod.onFieldChange === 'function') {
            try { actionsMod.onFieldChange(name, this, STATE); } catch (e) { /* بی‌صدا */ }
        }
    }

    function _bindNav() {
        if (!STATE.root) return;
        var btns = STATE.root.querySelectorAll('[data-wizv2-action]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', _handleNavAction);
        }
    }

    function _bindStepper() {
        if (!STATE.root) return;
        var steps = STATE.root.querySelectorAll('[data-wizv2-step]');
        for (var i = 0; i < steps.length; i++) {
            steps[i].addEventListener('click', function () {
                var s = parseInt(this.getAttribute('data-wizv2-step'), 10);
                if (isNaN(s)) return;
                _tryGoToStep(s);
            });
        }
    }

    function _handleNavAction(e) {
        e.preventDefault();
        var action = this.getAttribute('data-wizv2-action');

        if (action === 'prev')        goPrev();
        else if (action === 'next')   goNext();
        else if (action === 'submit') submit();
        else if (action === 'save-draft') {
            var ok = saveDraft();
            if (typeof WamUI !== 'undefined') {
                if (ok) WamUI.toastSuccess('پیش‌نویس ذخیره شد', 'موفق');
                else WamUI.toastError('خطا در ذخیره پیش‌نویس', 'خطا');
            }
        } else {
            // شاید Actions مسئول این action باشد
            var actionsMod = _getActions();
            if (actionsMod && typeof actionsMod.handleAction === 'function') {
                try {
                    var handled = actionsMod.handleAction(action, this, STATE);
                    if (handled !== false) return;
                } catch (err) { /* بی‌صدا */ }
            }
        }
    }

    // ─────────────────────────────────────
    // 🎯 ناوبری
    // ─────────────────────────────────────
    function goNext() {
        if (STATE.submitting) return false;
        var errors = validateStep(STATE.currentStep);
        if (Object.keys(errors).length > 0) {
            _emit(V2Events.VALIDATE, { step: STATE.currentStep, errors: errors });
            _showErrors(errors);
            return false;
        }
        if (STATE.currentStep >= STATE.totalSteps) return false;

        STATE.currentStep++;
        _trackVisit(STATE.currentStep);
        saveDraft();
        render();
        _scrollTop();
        _emit(V2Events.STEP, { step: STATE.currentStep, direction: 'next' });
        return true;
    }

    function goPrev() {
        if (STATE.submitting) return false;
        if (STATE.currentStep <= 1) return false;
        STATE.currentStep--;
        saveDraft();
        render();
        _scrollTop();
        _emit(V2Events.STEP, { step: STATE.currentStep, direction: 'prev' });
        return true;
    }

    function gotoStep(step, force) {
        if (step < 1 || step > STATE.totalSteps) return false;
        if (step === STATE.currentStep) return true;

        // اگر جلوتر می‌رویم، اعتبارسنجی
        if (step > STATE.currentStep && !force) {
            for (var s = STATE.currentStep; s < step; s++) {
                var e = validateStep(s);
                if (Object.keys(e).length > 0) {
                    _emit(V2Events.VALIDATE, { step: s, errors: e, blocked: true });
                    _showErrors(e);
                    if (typeof WamUI !== 'undefined') {
                        WamUI.toastWarning('ابتدا مراحل قبلی را کامل کنید', 'توجه');
                    }
                    return false;
                }
            }
        }

        STATE.currentStep = step;
        _trackVisit(step);
        saveDraft();
        render();
        _scrollTop();
        _emit(V2Events.STEP, { step: step, direction: 'jump' });
        return true;
    }

    function _tryGoToStep(s) {
        // فقط اگر کامل است یا عقب می‌رویم
        if (s <= STATE.currentStep) {
            gotoStep(s);
        } else {
            gotoStep(s);
        }
    }

    function _trackVisit(step) {
        if (STATE.visitingLog.indexOf(step) === -1) {
            STATE.visitingLog.push(step);
        }
    }

    function _scrollTop() {
        try {
            if (STATE.root && STATE.root.scrollIntoView) {
                STATE.root.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } catch (e) {
            try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (err) { /* بی‌صدا */ }
        }
    }

    // ─────────────────────────────────────
    // 🎨 خطاها
    // ─────────────────────────────────────
    function _showErrors(errors) {
        _clearErrors();
        for (var k in errors) {
            if (!Object.prototype.hasOwnProperty.call(errors, k)) continue;
            var el = STATE.root.querySelector('[data-error="' + k + '"]');
            if (el) { el.textContent = errors[k]; el.style.display = 'block'; }
            var inp = STATE.root.querySelector('[name="' + k + '"]');
            if (inp) inp.classList.add('wam-input--error');
        }
        // اسکرول به اولین خطا
        var firstErr = STATE.root.querySelector('.wam-input--error');
        if (firstErr && firstErr.focus) {
            try { firstErr.focus(); } catch (e) { /* بی‌صدا */ }
        }
    }

    function _clearErrors() {
        if (!STATE.root) return;
        var el = STATE.root.querySelectorAll('[data-error]');
        for (var i = 0; i < el.length; i++) {
            el[i].textContent = '';
            el[i].style.display = 'none';
        }
        var ip = STATE.root.querySelectorAll('.wam-input--error');
        for (var j = 0; j < ip.length; j++) ip[j].classList.remove('wam-input--error');
    }

    function _clearFieldError(name) {
        if (!STATE.root) return;
        var el = STATE.root.querySelector('[data-error="' + name + '"]');
        if (el) { el.textContent = ''; el.style.display = 'none'; }
        var inp = STATE.root.querySelector('[name="' + name + '"]');
        if (inp) inp.classList.remove('wam-input--error');
    }

    // ─────────────────────────────────────
    // 📎 مدیریت مدارک (کمک به Steps)
    // ─────────────────────────────────────
    function addDocument(doc) {
        if (!doc || !doc.type) return { ok: false, reason: 'invalid' };

        // بررسی تکراری
        for (var i = 0; i < STATE.uploadedDocs.length; i++) {
            if (STATE.uploadedDocs[i].type === doc.type &&
                STATE.uploadedDocs[i].name === doc.name) {
                return { ok: false, reason: 'duplicate' };
            }
        }

        var item = {
            id: 'doc_' + Date.now().toString(36) + '_' +
                Math.random().toString(36).slice(2, 6),
            type: doc.type,
            name: doc.name || doc.type,
            size: doc.size || 0,
            mime: doc.mime || null,
            data: doc.data || null,    // dataURL در صورت نیاز
            uploadedAt: Date.now()
        };

        STATE.uploadedDocs.push(item);
        _scheduleSave();
        _emit(V2Events.DOC_ADDED, { doc: item, count: STATE.uploadedDocs.length });
        return { ok: true, doc: item };
    }

    function removeDocument(id) {
        for (var i = STATE.uploadedDocs.length - 1; i >= 0; i--) {
            if (STATE.uploadedDocs[i].id === id) {
                var removed = STATE.uploadedDocs.splice(i, 1)[0];
                _scheduleSave();
                _emit(V2Events.DOC_REMOVED, { doc: removed, count: STATE.uploadedDocs.length });
                return { ok: true, doc: removed };
            }
        }
        return { ok: false, reason: 'not_found' };
    }

    function getDocuments() {
        return STATE.uploadedDocs.slice();
    }

    // ─────────────────────────────────────
    // ✅ ارسال نهایی
    // ─────────────────────────────────────
    function submit() {
        if (STATE.submitting) return;

        var errors = validateAll();
        if (Object.keys(errors).length > 0) {
            // پرش به اولین مرحله دارای خطا
            for (var s = 1; s <= STATE.totalSteps; s++) {
                var se = validateStep(s);
                if (Object.keys(se).length > 0) {
                    STATE.currentStep = s;
                    render();
                    _showErrors(se);
                    break;
                }
            }
            _emit(V2Events.VALIDATE, { errors: errors, blocked: true });
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('لطفاً خطاها را برطرف کنید', 'خطا');
            }
            return false;
        }

        STATE.submitting = true;
        _setBusy(true);
        _emit(V2Events.SUBMIT, { at: Date.now() });

        setTimeout(function () {
            var res = _createCase();
            if (!res.ok) {
                STATE.submitting = false;
                _setBusy(false);
                _emit(V2Events.FAIL, res);
                if (typeof WamUI !== 'undefined') {
                    WamUI.toastError('خطا در ثبت: ' + (res.reason || 'نامشخص'), 'خطا');
                }
                return;
            }

            clearDraft();
            _emit(V2Events.SUCCESS, { caseId: res.caseId, at: Date.now() });

            if (typeof WamUI !== 'undefined') {
                WamUI.toastSuccess('پرونده ' + res.caseId + ' ثبت شد', 'موفق');
                if (WamUI.loader) WamUI.loader.show('وام پی', 'در حال انتقال...');
            }

            setTimeout(function () {
                window.location.href = 'case-details.html?id=' + encodeURIComponent(res.caseId);
            }, 900);
        }, 500);
    }

    function _createCase() {
        if (typeof CaseRepository === 'undefined') return { ok: false, reason: 'no_repo' };
        if (!STATE.broker) return { ok: false, reason: 'no_broker' };

        var caseId = _genCaseId();
        var d = STATE.data;

        var caseData = {
            caseId: caseId,
            brokerId: STATE.broker.id,
            brokerName: STATE.broker.name,
            brokerCode: STATE.broker.brokerCode,
            bank: d.bank,
            loanAmount: Number(_en(d.loanAmount)) || 0,
            loanDuration: Number(d.loanDuration) || 0,
            purpose: d.purpose || null,
            loanNote: d.loanNote || null,
            collateralType: d.collateralType || null,
            collateralDesc: d.collateralDesc || null,

            applicantName: (d.applicantName || '').trim(),
            applicantMobile: _en(d.applicantMobile) || null,
            applicantNationalCode: _en(d.applicantNationalCode) || null,
            applicantBirthDate: d.applicantBirthDate || null,
            applicantGender: d.applicantGender || null,
            applicantIdNumber: d.applicantIdNumber || null,
            applicantJob: d.applicantJob || null,
            applicantIncome: Number(_en(d.monthlyIncome)) || 0,
            applicantOtherIncome: Number(_en(d.otherIncome)) || 0,
            applicantEmail: d.applicantEmail || null,
            applicantAddress: d.applicantAddress || null,

            documents: STATE.uploadedDocs.slice(),

            status: 'draft',
            currentStep: 'step_1',
            source: 'broker-wizard-v2',
            wizardVersion: VERSION
        };

        var created = CaseRepository.create(caseData, { userId: _uid() });
        if (!created) return { ok: false, reason: 'create_failed' };

        if (typeof CaseStateMachine !== 'undefined' && CaseStateMachine.startStep) {
            try {
                CaseStateMachine.startStep(caseId, 'step_1', {
                    userId: _uid(),
                    role: 'broker'
                });
            } catch (e) { /* بی‌صدا */ }
        }

        return { ok: true, caseId: caseId, case: created };
    }

    function _setBusy(b) {
        if (!STATE.root) return;
        var btn = STATE.root.querySelector('[data-wizv2-action="submit"]');
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
    // 🔄 Reset
    // ─────────────────────────────────────
    function reset(options) {
        options = options || {};
        STATE.currentStep = 1;
        STATE.data = {};
        STATE.uploadedDocs = [];
        STATE.visitingLog = [1];
        STATE.submitting = false;
        STATE.lastSavedAt = null;
        if (options.clearDraft !== false) clearDraft();
        render();
        _emit(V2Events.CANCEL, { at: Date.now() });
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var run = function () {
            var u = (typeof WamPermissions !== 'undefined') ? WamPermissions.getCurrentUser() : null;
            if (!u) {
                if (typeof WamPayGuard !== 'undefined') WamPayGuard.redirectToLogin('not_logged_in');
                return;
            }
            if (u.role !== 'broker' && u.role !== 'admin' && u.role !== 'super_admin') {
                if (typeof WamPayGuard !== 'undefined') WamPayGuard.redirectToRoleHome(u.role);
                return;
            }

            var root = options.root ||
                       document.querySelector('[' + ROOT_ATTR + ']') ||
                       document.querySelector('.wam-broker-wizard-v2');
            if (!root) {
                if (options.debug) console.warn('[broker-wizard-v2] root پیدا نشد');
                return;
            }
            STATE.root = root;

            STATE.broker = _loadBroker();
            if (!STATE.broker) {
                STATE.root.innerHTML =
                    '<div class="wam-empty">اطلاعات کارگزار یافت نشد. با پشتیبانی تماس بگیرید.</div>';
                return;
            }

            // بازیابی draft
            var d = loadDraft();
            if (d && d.data && options.restoreDraft !== false) {
                STATE.data = d.data || {};
                STATE.uploadedDocs = d.docs || [];
                STATE.currentStep = Math.min(d.step || 1, STATE.totalSteps);
                STATE.lastSavedAt = d.savedAt || null;
                STATE.restoredFromDraft = true;
                if (typeof WamUI !== 'undefined') {
                    WamUI.toastInfo('پیش‌نویس قبلی بازیابی شد', 'خوش آمدید');
                }
                _emit(V2Events.LOAD, { step: STATE.currentStep, savedAt: d.savedAt });
            } else {
                STATE.visitingLog = [1];
            }

            render();
            STATE.installed = true;

            _emit(V2Events.START, {
                version: VERSION,
                step: STATE.currentStep,
                hasDraft: !!d,
                at: Date.now()
            });

            if (options.debug) {
                console.log('[broker-wizard-v2] آماده، نسخه ' + VERSION +
                    '، مرحله ' + STATE.currentStep);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run);
        } else {
            run();
        }
    }

    function uninstall() {
        if (STATE._draftTimer) {
            clearTimeout(STATE._draftTimer);
            STATE._draftTimer = null;
        }
        STATE.root = null;
        STATE.installed = false;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            version: VERSION,
            currentStep: STATE.currentStep,
            totalSteps: STATE.totalSteps,
            stepKey: STATE.stepsDef[STATE.currentStep - 1]
                ? STATE.stepsDef[STATE.currentStep - 1].key : null,
            dataFields: Object.keys(STATE.data).length,
            docsCount: STATE.uploadedDocs.length,
            submitting: STATE.submitting,
            hasDraft: hasDraft(),
            lastSavedAt: STATE.lastSavedAt,
            restoredFromDraft: STATE.restoredFromDraft,
            progress: computeProgress(),
            brokerId: STATE.broker ? STATE.broker.id : null
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
    var WamBrokerWizardV2 = {
        // ثوابت
        EVENTS: V2Events,
        VERSION: VERSION,
        STEPS_DEF: STEPS_DEF,
        ROOT_ATTR: ROOT_ATTR,
        DRAFT_KEY: DRAFT_KEY,
        DRAFT_TTL: DRAFT_TTL,

        // نصب/چرخه
        install: install,
        uninstall: uninstall,
        render: render,
        reset: reset,

        // ناوبری
        goNext: goNext,
        goPrev: goPrev,
        gotoStep: gotoStep,
        submit: submit,

        // Draft
        saveDraft: saveDraft,
        loadDraft: loadDraft,
        clearDraft: clearDraft,
        hasDraft: hasDraft,

        // اعتبارسنجی
        validateStep: validateStep,
        validateAll: validateAll,
        isStepComplete: isStepComplete,
        computeProgress: computeProgress,

        // مدارک
        addDocument: addDocument,
        removeDocument: removeDocument,
        getDocuments: getDocuments,

        // داده
        getData: function () { return JSON.parse(JSON.stringify(STATE.data)); },
        setData: function (d) { STATE.data = d || {}; render(); },
        getState: function () { return STATE; },

        // گزارش
        getStatus: getStatus,
        onChange: onChange
    };

    window.WamBrokerWizardV2 = WamBrokerWizardV2;
    window.BrokerWizardV2Events = V2Events;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-broker-wizard-v2-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-broker-wizard-v2')) {
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