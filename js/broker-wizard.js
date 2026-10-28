// ==========================================
// وام پی — Broker Panel
// فایل: broker-wizard.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: ویزارد ثبت پرونده توسط کارگزار (نسخه ۱ - ساده)
// ==========================================

(function () {
    'use strict';

    var DRAFT_KEY = 'wamPayBrokerDraft';
    var ROOT_ATTR = 'data-broker-wizard';
    var BROKERS_KEY = 'wamPayBrokers';
    var BANKS = ['ملی','صادرات','تجارت','سپه','کشاورزی','مسکن','رسالت',
                 'پاسارگاد','پارسیان','سامان','ملت','رفاه','مهر ایران','قوامین','شهر'];
    var DURATIONS = [12,24,36,48,60,84,120];
    var PURPOSES = ['خرید کالا','وام ازدواج','وام مسکن','وام خودرو',
                    'وام قرض‌الحسنه','سرمایه در گردش','توسعه کسب‌وکار',
                    'هزینه درمان','هزینه تحصیل','سایر'];

    var STATE = {
        installed: false, root: null, currentStep: 1, totalSteps: 3,
        data: {}, submitting: false, broker: null, listeners: []
    };

    var WizEvents = {
        START: 'bwiz.start', STEP: 'bwiz.step', DRAFT: 'bwiz.draft_saved',
        LOAD: 'bwiz.draft_loaded', SUBMIT: 'bwiz.submit',
        SUCCESS: 'bwiz.success', FAIL: 'bwiz.fail', CANCEL: 'bwiz.cancel'
    };

    function _emit(n, d) {
        if (typeof EventBus !== 'undefined') { try { EventBus.emit(n, d); } catch(e){} }
        for (var i=0;i<STATE.listeners.length;i++) { try { STATE.listeners[i](n,d); } catch(e){} }
    }

    function _esc(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function _fa(n) {
        var s = String(n === null || n === undefined ? 0 : n);
        return s.replace(/[0-9]/g, function(d){ return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _amt(n) {
        if (n === null || n === undefined || n === '') return '—';
        var x = Number(n); if (isNaN(x)) return '—';
        return x.toLocaleString('en-US').replace(/[0-9]/g, function(d){ return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _en(s) {
        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.toEnglishDigits) {
            return WamPersianDate.toEnglishDigits(s);
        }
        return String(s||'').replace(/[۰-۹]/g, function(d){ return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); });
    }

    function _loadBroker() {
        if (typeof Storage === 'undefined') return null;
        var all = Storage.getJSON(BROKERS_KEY, []) || [];
        var u = (typeof WamPermissions !== 'undefined') ? WamPermissions.getCurrentUser() : null;
        if (!u) return null;
        for (var i=0;i<all.length;i++) {
            var b = all[i]; if (!b) continue;
            if (b.userId && b.userId === u.id) return b;
            if (b.mobile && u.mobile &&
                String(b.mobile).replace(/\D/g,'') === String(u.mobile).replace(/\D/g,'')) return b;
        }
        return null;
    }

    function _uid() {
        if (typeof WamPermissions === 'undefined') return null;
        var me = WamPermissions.getCurrentUser();
        return me ? me.id : null;
    }

    // ─── Draft ───
    function saveDraft() {
        if (typeof Storage === 'undefined') return false;
        var ok = Storage.setJSON(DRAFT_KEY, {
            step: STATE.currentStep, data: STATE.data, savedAt: Date.now()
        });
        if (ok) _emit(WizEvents.DRAFT, { step: STATE.currentStep, at: Date.now() });
        return ok;
    }

    function loadDraft() {
        if (typeof Storage === 'undefined') return null;
        var p = Storage.getJSON(DRAFT_KEY, null);
        if (!p || !p.data) return null;
        _emit(WizEvents.LOAD, { step: p.step, savedAt: p.savedAt });
        return p;
    }

    function clearDraft() {
        if (typeof Storage === 'undefined') return false;
        return Storage.remove(DRAFT_KEY);
    }

    function hasDraft() {
        if (typeof Storage === 'undefined') return false;
        var p = Storage.getJSON(DRAFT_KEY, null);
        return !!(p && p.data);
    }

    // ─── Validate ───
    function _validate(step, d) {
        var e = {};
        if (step === 1) {
            if (!d.applicantName || String(d.applicantName).trim().length < 3) e.applicantName = 'نام متقاضی حداقل ۳ کاراکتر';
            if (!d.applicantMobile || !/^09\d{9}$/.test(_en(d.applicantMobile))) e.applicantMobile = 'موبایل ۱۱ رقم با ۰۹';
            if (d.applicantNationalCode && !/^\d{10}$/.test(_en(d.applicantNationalCode))) e.applicantNationalCode = 'کد ملی ۱۰ رقم';
        }
        if (step === 2) {
            if (!d.bank) e.bank = 'بانک الزامی';
            if (!d.loanAmount || Number(_en(d.loanAmount)) < 1000000) e.loanAmount = 'حداقل ۱ میلیون ریال';
            if (!d.loanDuration) e.loanDuration = 'مدت الزامی';
            if (!d.purpose) e.purpose = 'هدف الزامی';
        }
        if (step === 3) {
            if (!d.agreeTerms) e.agreeTerms = 'پذیرش قوانین الزامی';
        }
        return e;
    }

    function _validateAll() {
        var all = {};
        for (var s=1;s<=STATE.totalSteps;s++) {
            var e = _validate(s, STATE.data);
            for (var k in e) if (Object.prototype.hasOwnProperty.call(e,k)) all[k] = e[k];
        }
        return all;
    }

    // ─── Render ───
    function _step1() {
        var d = STATE.data;
        return '<div class="wam-wiz__step" data-step="1">' +
            '<h3>👤 اطلاعات متقاضی</h3>' +
            '<p class="wam-wiz__desc">مشخصات فردی متقاضی وام</p>' +
            '<div class="wam-field"><label>نام و نام خانوادگی *</label>' +
                '<input name="applicantName" value="'+_esc(d.applicantName||'')+'">' +
                '<div class="wam-field__error" data-error="applicantName"></div></div>' +
            '<div class="wam-field"><label>موبایل *</label>' +
                '<input name="applicantMobile" type="tel" maxlength="11" value="'+_esc(d.applicantMobile||'')+'">' +
                '<div class="wam-field__error" data-error="applicantMobile"></div></div>' +
            '<div class="wam-field"><label>کد ملی</label>' +
                '<input name="applicantNationalCode" inputmode="numeric" maxlength="10" value="'+_esc(d.applicantNationalCode||'')+'">' +
                '<div class="wam-field__error" data-error="applicantNationalCode"></div></div>' +
            '<div class="wam-field"><label>تاریخ تولد</label>' +
                '<input name="applicantBirthDate" data-persian-date value="'+_esc(d.applicantBirthDate||'')+'"></div>' +
            '<div class="wam-field"><label>شغل</label>' +
                '<input name="applicantJob" value="'+_esc(d.applicantJob||'')+'"></div>' +
            '<div class="wam-field"><label>درآمد ماهانه (ریال)</label>' +
                '<input name="applicantIncome" inputmode="numeric" value="'+_esc(d.applicantIncome||'')+'"></div>' +
        '</div>';
    }

    function _step2() {
        var d = STATE.data;
        var bankOpts = '<option value="">— انتخاب —</option>';
        for (var i=0;i<BANKS.length;i++) bankOpts += '<option value="'+_esc(BANKS[i])+'"'+(d.bank===BANKS[i]?' selected':'')+'>'+_esc(BANKS[i])+'</option>';
        var durOpts = '<option value="">—</option>';
        for (var j=0;j<DURATIONS.length;j++) durOpts += '<option value="'+DURATIONS[j]+'"'+(String(d.loanDuration)===String(DURATIONS[j])?' selected':'')+'>'+_fa(DURATIONS[j])+' ماه</option>';
        var pOpts = '<option value="">—</option>';
        for (var k=0;k<PURPOSES.length;k++) pOpts += '<option value="'+_esc(PURPOSES[k])+'"'+(d.purpose===PURPOSES[k]?' selected':'')+'>'+_esc(PURPOSES[k])+'</option>';

        return '<div class="wam-wiz__step" data-step="2">' +
            '<h3>💰 اطلاعات وام</h3>' +
            '<p class="wam-wiz__desc">مشخصات وام درخواستی</p>' +
            '<div class="wam-field"><label>بانک *</label>' +
                '<select name="bank">'+bankOpts+'</select>' +
                '<div class="wam-field__error" data-error="bank"></div></div>' +
            '<div class="wam-field"><label>مبلغ وام (ریال) *</label>' +
                '<input name="loanAmount" inputmode="numeric" value="'+_esc(d.loanAmount||'')+'">' +
                '<div class="wam-field__error" data-error="loanAmount"></div></div>' +
            '<div class="wam-field"><label>مدت بازپرداخت *</label>' +
                '<select name="loanDuration">'+durOpts+'</select>' +
                '<div class="wam-field__error" data-error="loanDuration"></div></div>' +
            '<div class="wam-field"><label>هدف وام *</label>' +
                '<select name="purpose">'+pOpts+'</select>' +
                '<div class="wam-field__error" data-error="purpose"></div></div>' +
            '<div class="wam-field"><label>توضیحات</label>' +
                '<textarea name="loanNote" rows="3">'+_esc(d.loanNote||'')+'</textarea></div>' +
        '</div>';
    }

    function _step3() {
        var d = STATE.data;
        return '<div class="wam-wiz__step" data-step="3">' +
            '<h3>✅ بررسی نهایی</h3>' +
            '<p class="wam-wiz__desc">اطلاعات پرونده را بررسی کنید</p>' +
            '<div class="wam-wiz__review">' +
                _rr('متقاضی', d.applicantName) +
                _rr('موبایل', d.applicantMobile) +
                _rr('کد ملی', d.applicantNationalCode || '—') +
                _rr('بانک', d.bank) +
                _rr('مبلغ', d.loanAmount ? _amt(d.loanAmount)+' ریال' : '—') +
                _rr('مدت', d.loanDuration ? _fa(d.loanDuration)+' ماه' : '—') +
                _rr('هدف', d.purpose) +
            '</div>' +
            '<label class="wam-check"><input type="checkbox" name="agreeTerms"'+(d.agreeTerms?' checked':'')+'>' +
                '<span>صحت اطلاعات تأیید می‌شود</span></label>' +
            '<div class="wam-field__error" data-error="agreeTerms"></div>' +
        '</div>';
    }

    function _rr(l, v) {
        return '<div class="wam-review-row"><span>'+_esc(l)+':</span><strong>'+_esc(v||'—')+'</strong></div>';
    }

    function _nav() {
        var first = STATE.currentStep === 1;
        var last = STATE.currentStep === STATE.totalSteps;
        var h = '<div class="wam-wiz__nav">';
        h += '<button type="button" class="wam-btn wam-btn--ghost" data-bwiz="prev"'+(first?' disabled':'')+'>‹ قبلی</button>';
        h += '<div class="wam-wiz__dots">';
        for (var i=1;i<=STATE.totalSteps;i++) {
            h += '<span class="wam-wiz__dot'+(i===STATE.currentStep?' is-active':'')+(i<STATE.currentStep?' is-done':'')+'" data-goto="'+i+'"></span>';
        }
        h += '</div>';
        h += last
            ? '<button type="button" class="wam-btn wam-btn--primary" data-bwiz="submit">ثبت پرونده ✓</button>'
            : '<button type="button" class="wam-btn wam-btn--primary" data-bwiz="next">بعدی ›</button>';
        h += '</div>';
        return h;
    }

    function _progress() {
        var pct = Math.round(((STATE.currentStep - 1) / STATE.totalSteps) * 100);
        return '<div class="wam-wiz__progress"><div class="wam-wiz__progress-bar" style="width:'+pct+'%"></div></div>' +
               '<div class="wam-wiz__progress-label">مرحله '+_fa(STATE.currentStep)+' از '+_fa(STATE.totalSteps)+'</div>';
    }

    function render() {
        if (!STATE.root) return;
        var stepHtml = STATE.currentStep === 1 ? _step1() :
                       STATE.currentStep === 2 ? _step2() : _step3();
        STATE.root.innerHTML =
            '<div class="wam-wiz">' + _progress() +
                '<form class="wam-wiz__form" onsubmit="return false">' +
                    stepHtml + _nav() +
                '</form>' +
            '</div>';
        _bindInputs();
        _bindNav();
        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.bindAll) {
            try { WamPersianDate.bindAll(STATE.root); } catch(e){}
        }
    }

    function _bindInputs() {
        if (!STATE.root) return;
        var els = STATE.root.querySelectorAll('input, select, textarea');
        for (var i=0;i<els.length;i++) {
            els[i].addEventListener('input', _onChange);
            els[i].addEventListener('change', _onChange);
        }
    }

    var _draftTimer = null;
    function _onChange() {
        var name = this.getAttribute('name');
        if (!name) return;
        STATE.data[name] = this.type === 'checkbox' ? !!this.checked : this.value;
        _clearErr(name);
        if (_draftTimer) clearTimeout(_draftTimer);
        _draftTimer = setTimeout(saveDraft, 800);
    }

    function _bindNav() {
        if (!STATE.root) return;
        var btns = STATE.root.querySelectorAll('[data-bwiz]');
        for (var i=0;i<btns.length;i++) btns[i].addEventListener('click', _onNav);
        var dots = STATE.root.querySelectorAll('[data-goto]');
        for (var j=0;j<dots.length;j++) dots[j].addEventListener('click', function(){
            var t = parseInt(this.getAttribute('data-goto'), 10);
            if (!isNaN(t) && t < STATE.currentStep) { STATE.currentStep = t; render(); }
        });
    }

    function _onNav(e) {
        e.preventDefault();
        var a = this.getAttribute('data-bwiz');
        if (a === 'prev') goPrev();
        else if (a === 'next') goNext();
        else if (a === 'submit') submit();
    }

    function goNext() {
        if (STATE.submitting) return false;
        var e = _validate(STATE.currentStep, STATE.data);
        if (Object.keys(e).length > 0) { _showErrs(e); return false; }
        if (STATE.currentStep >= STATE.totalSteps) return false;
        STATE.currentStep++; saveDraft(); render(); _scrollTop();
        _emit(WizEvents.STEP, { step: STATE.currentStep, direction: 'next' });
        return true;
    }

    function goPrev() {
        if (STATE.submitting) return false;
        if (STATE.currentStep <= 1) return false;
        STATE.currentStep--; saveDraft(); render(); _scrollTop();
        _emit(WizEvents.STEP, { step: STATE.currentStep, direction: 'prev' });
        return true;
    }

    function gotoStep(s) {
        if (s < 1 || s > STATE.totalSteps) return false;
        STATE.currentStep = s; render(); return true;
    }

    function _scrollTop() {
        try { STATE.root && STATE.root.scrollIntoView({behavior:'smooth',block:'start'}); }
        catch(e) { try { window.scrollTo({top:0,behavior:'smooth'}); } catch(err){} }
    }

    function _showErrs(errs) {
        _clearErrs();
        for (var k in errs) {
            if (!Object.prototype.hasOwnProperty.call(errs,k)) continue;
            var el = STATE.root.querySelector('[data-error="'+k+'"]');
            if (el) { el.textContent = errs[k]; el.style.display = 'block'; }
            var inp = STATE.root.querySelector('[name="'+k+'"]');
            if (inp) inp.classList.add('wam-input--error');
        }
    }

    function _clearErrs() {
        if (!STATE.root) return;
        var el = STATE.root.querySelectorAll('[data-error]');
        for (var i=0;i<el.length;i++) { el[i].textContent = ''; el[i].style.display = 'none'; }
        var ip = STATE.root.querySelectorAll('.wam-input--error');
        for (var j=0;j<ip.length;j++) ip[j].classList.remove('wam-input--error');
    }

    function _clearErr(n) {
        if (!STATE.root) return;
        var el = STATE.root.querySelector('[data-error="'+n+'"]');
        if (el) { el.textContent = ''; el.style.display = 'none'; }
        var inp = STATE.root.querySelector('[name="'+n+'"]');
        if (inp) inp.classList.remove('wam-input--error');
    }

    // ─── Submit ───
    function submit() {
        if (STATE.submitting) return;
        var errs = _validateAll();
        if (Object.keys(errs).length > 0) {
            for (var s=1;s<=STATE.totalSteps;s++) {
                if (Object.keys(_validate(s, STATE.data)).length > 0) {
                    STATE.currentStep = s; render(); _showErrs(_validate(s, STATE.data)); break;
                }
            }
            if (typeof WamUI !== 'undefined') WamUI.toastError('خطاها را برطرف کنید', 'خطا');
            return false;
        }
        STATE.submitting = true;
        _busy(true);
        _emit(WizEvents.SUBMIT, { at: Date.now() });

        setTimeout(function () {
            var res = _createCase();
            if (!res.ok) {
                STATE.submitting = false; _busy(false);
                _emit(WizEvents.FAIL, res);
                if (typeof WamUI !== 'undefined') WamUI.toastError('خطا: ' + (res.reason||'نامشخص'), 'خطا');
                return;
            }
            clearDraft();
            _emit(WizEvents.SUCCESS, { caseId: res.caseId, at: Date.now() });
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
        if (typeof CaseRepository === 'undefined') return { ok:false, reason:'no_repo' };
        if (!STATE.broker) return { ok:false, reason:'no_broker' };

        var caseId = _genCaseId();
        var d = STATE.data;

        var cd = {
            caseId: caseId,
            brokerId: STATE.broker.id,
            brokerName: STATE.broker.name,
            brokerCode: STATE.broker.brokerCode,
            bank: d.bank,
            loanAmount: Number(_en(d.loanAmount)) || 0,
            loanDuration: Number(d.loanDuration) || 0,
            purpose: d.purpose || null,
            loanNote: d.loanNote || null,
            applicantName: (d.applicantName||'').trim(),
            applicantMobile: _en(d.applicantMobile) || null,
            applicantNationalCode: _en(d.applicantNationalCode) || null,
            applicantBirthDate: d.applicantBirthDate || null,
            applicantJob: d.applicantJob || null,
            applicantMonthlyIncome: Number(_en(d.applicantIncome)) || 0,
            status: 'draft',
            currentStep: 'step_1',
            source: 'broker-wizard'
        };

        var created = CaseRepository.create(cd, { userId: _uid() });
        if (!created) return { ok:false, reason:'create_failed' };

        if (typeof CaseStateMachine !== 'undefined' && CaseStateMachine.startStep) {
            try { CaseStateMachine.startStep(caseId, 'step_1', { userId:_uid(), role:'broker' }); } catch(e){}
        }
        return { ok:true, caseId: caseId, case: created };
    }

    function _genCaseId() {
        var y = new Date().getFullYear() % 100;
        var r = Math.floor(Math.random() * 9999);
        return 'WP-' + y + '-' + ('0000'+r).slice(-4);
    }

    function _busy(b) {
        if (!STATE.root) return;
        var btn = STATE.root.querySelector('[data-bwiz="submit"]');
        if (!btn) return;
        if (b) { btn.disabled = true; btn.setAttribute('data-orig', btn.textContent); btn.textContent = 'در حال ثبت...'; }
        else { btn.disabled = false; var o = btn.getAttribute('data-orig'); if (o) btn.textContent = o; }
    }

    function reset(o) {
        o = o || {};
        STATE.currentStep = 1; STATE.data = {}; STATE.submitting = false;
        if (o.clearDraft !== false) clearDraft();
        render(); _emit(WizEvents.CANCEL, { at: Date.now() });
    }

    // ─── Install ───
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var run = function () {
            var u = (typeof WamPermissions !== 'undefined') ? WamPermissions.getCurrentUser() : null;
            if (!u) { if (typeof WamPayGuard !== 'undefined') WamPayGuard.redirectToLogin('not_logged_in'); return; }
            if (u.role !== 'broker' && u.role !== 'admin' && u.role !== 'super_admin') {
                if (typeof WamPayGuard !== 'undefined') WamPayGuard.redirectToRoleHome(u.role);
                return;
            }

            var root = options.root ||
                       document.querySelector('[' + ROOT_ATTR + ']') ||
                       document.querySelector('.wam-broker-wizard');
            if (!root) { if (options.debug) console.warn('[broker-wizard] root not found'); return; }
            STATE.root = root;

            STATE.broker = _loadBroker();
            if (!STATE.broker) {
                STATE.root.innerHTML = '<div class="wam-empty">اطلاعات کارگزار یافت نشد.</div>';
                return;
            }

            var d = loadDraft();
            if (d && d.data && options.restoreDraft !== false) {
                STATE.data = d.data; STATE.currentStep = d.step || 1;
                if (typeof WamUI !== 'undefined') WamUI.toastInfo('پیش‌نویس بازیابی شد', 'خوش آمدید');
            }

            render(); STATE.installed = true;
            _emit(WizEvents.START, { step: STATE.currentStep, hasDraft: !!d, at: Date.now() });
        };

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
        else run();
    }

    function uninstall() { STATE.root = null; STATE.installed = false; }

    function getStatus() {
        return {
            installed: STATE.installed, currentStep: STATE.currentStep,
            totalSteps: STATE.totalSteps, fields: Object.keys(STATE.data).length,
            submitting: STATE.submitting, hasDraft: hasDraft(),
            brokerId: STATE.broker ? STATE.broker.id : null
        };
    }

    function onChange(cb) {
        if (typeof cb !== 'function') return function(){};
        STATE.listeners.push(cb);
        return function(){ var i = STATE.listeners.indexOf(cb); if (i!==-1) STATE.listeners.splice(i,1); };
    }

    var WamBrokerWizard = {
        EVENTS: WizEvents, BANKS: BANKS, DURATIONS: DURATIONS, PURPOSES: PURPOSES,
        ROOT_ATTR: ROOT_ATTR, DRAFT_KEY: DRAFT_KEY,
        install: install, uninstall: uninstall, render: render, reset: reset,
        goNext: goNext, goPrev: goPrev, gotoStep: gotoStep, submit: submit,
        saveDraft: saveDraft, loadDraft: loadDraft, clearDraft: clearDraft, hasDraft: hasDraft,
        getData: function(){ return JSON.parse(JSON.stringify(STATE.data)); },
        setData: function(d){ STATE.data = d || {}; render(); },
        validateStep: function(s){ return _validate(s, STATE.data); },
        validateAll: _validateAll,
        getStatus: getStatus, onChange: onChange
    };

    window.WamBrokerWizard = WamBrokerWizard;
    window.BrokerWizardEvents = WizEvents;

    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body; if (!b) return;
            if (b.hasAttribute('data-broker-wizard-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-broker-wizard')) install();
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _auto);
        else _auto();
    }

})();