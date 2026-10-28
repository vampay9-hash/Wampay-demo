// ==========================================
// وام پی — Broker Panel
// فایل: broker-wizard-v2-actions.js
// نسخه: 2.0.0
// تاریخ: 1405/01/15
// کارش: اکشن‌های ویزارد v2 — آپلود مدارک، محاسبات، رویدادها
//        ماژول کمکی برای broker-wizard-v2.js
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var MAX_FILE_MB = 5;
    var MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

    var ALLOWED_MIME = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
        'image/gif', 'application/pdf'
    ];

    // نرخ تقریبی برای محاسبه قسط
    var DEFAULT_RATE = 0.18;   // ۱۸٪ سالانه

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        boundFileInputs: {},   // code → bound
        boundButtons: {},      // action → bound
        lastCalcAt: null,
        lastCalcResult: null,
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var ActionEvents = {
        FILE_SELECTED:   'bwizv2a.file_selected',
        FILE_ADDED:      'bwizv2a.file_added',
        FILE_REMOVED:    'bwizv2a.file_removed',
        FILE_REJECTED:   'bwizv2a.file_rejected',
        FIELD_CHANGED:   'bwizv2a.field_changed',
        CALCULATED:      'bwizv2a.calculated',
        CUSTOM_ACTION:   'bwizv2a.custom_action',
        VALIDATION_HINT: 'bwizv2a.validation_hint'
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

    function _size(bytes) {
        if (!bytes) return '۰';
        if (bytes < 1024) return _fa(bytes) + ' بایت';
        if (bytes < 1024 * 1024) return _fa(Math.round(bytes / 1024)) + ' کیلوبایت';
        return _fa(Math.round(bytes / 1024 / 1024 * 10) / 10) + ' مگابایت';
    }

    function _en(s) {
        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.toEnglishDigits) {
            return WamPersianDate.toEnglishDigits(s);
        }
        return String(s || '').replace(/[۰-۹]/g, function (d) {
            return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
        });
    }

    function _toast(type, msg, title) {
        if (typeof WamUI === 'undefined') return;
        if (type === 'success' && WamUI.toastSuccess) WamUI.toastSuccess(msg, title || 'موفق');
        else if (type === 'error' && WamUI.toastError) WamUI.toastError(msg, title || 'خطا');
        else if (type === 'warning' && WamUI.toastWarning) WamUI.toastWarning(msg, title || 'توجه');
        else if (type === 'info' && WamUI.toastInfo) WamUI.toastInfo(msg, title || 'اطلاع');
    }

    function _getStepsMod() {
        return (typeof WamBrokerWizardV2Steps !== 'undefined')
            ? WamBrokerWizardV2Steps : null;
    }

    function _getDocs() {
        var mod = _getStepsMod();
        if (mod && mod.REQUIRED_DOCS) return mod.REQUIRED_DOCS;
        return [];
    }

    // ─────────────────────────────────────
    // 📎 اعتبارسنجی فایل
    // ─────────────────────────────────────
    function _validateFile(file, docDef) {
        var errors = [];

        if (!file) { errors.push('فایلی انتخاب نشده'); return errors; }

        if (file.size > MAX_FILE_BYTES) {
            errors.push('حجم فایل بیش از ' + _fa(MAX_FILE_MB) + ' مگابایت است (' +
                _size(file.size) + ')');
        }

        if (file.size === 0) {
            errors.push('فایل خالی است');
        }

        var mime = (file.type || '').toLowerCase();
        if (mime && ALLOWED_MIME.indexOf(mime) === -1) {
            // اگر docDef accept مشخص دارد، همان را چک کن
            var accept = docDef && docDef.accept;
            if (accept && accept.indexOf('image/*') !== -1 && mime.indexOf('image/') === 0) {
                // ok
            } else if (accept && accept.indexOf('.pdf') !== -1 && mime === 'application/pdf') {
                // ok
            } else {
                errors.push('فرمت فایل مجاز نیست (فقط تصویر یا PDF)');
            }
        }

        return errors;
    }

    // ─────────────────────────────────────
    // 📤 خواندن فایل به dataURL
    // ─────────────────────────────────────
    function _readAsDataURL(file, callback) {
        if (typeof FileReader === 'undefined') {
            callback(null);
            return;
        }
        var reader = new FileReader();
        reader.onload = function () { callback(reader.result); };
        reader.onerror = function () { callback(null); };
        try {
            reader.readAsDataURL(file);
        } catch (e) {
            callback(null);
        }
    }

    // ─────────────────────────────────────
    // 📎 هندلر آپلود فایل
    // ─────────────────────────────────────
    function _handleFileInput(input, state) {
        if (!input || !input.files || input.files.length === 0) return;

        var code = input.getAttribute('data-doc-input');
        if (!code) return;

        var docDef = null;
        var docs = _getDocs();
        for (var i = 0; i < docs.length; i++) {
            if (docs[i].code === code) { docDef = docs[i]; break; }
        }

        var file = input.files[0];

        // اعتبارسنجی
        var errors = _validateFile(file, docDef);
        if (errors.length > 0) {
            _emit(ActionEvents.FILE_REJECTED, {
                code: code,
                name: file.name,
                errors: errors,
                at: Date.now()
            });
            _toast('error', errors[0], 'فایل نامعتبر');
            // پاک کردن input
            try { input.value = ''; } catch (e) { /* بی‌صدا */ }
            return;
        }

        _emit(ActionEvents.FILE_SELECTED, {
            code: code,
            name: file.name,
            size: file.size,
            mime: file.type,
            at: Date.now()
        });

        // خواندن به dataURL
        _readAsDataURL(file, function (dataURL) {
            // استفاده از API اصلی
            if (typeof WamBrokerWizardV2 === 'undefined' ||
                !WamBrokerWizardV2.addDocument) {
                _toast('error', 'ماژول ویزارد آماده نیست', 'خطا');
                return;
            }

            var res = WamBrokerWizardV2.addDocument({
                type: code,
                name: file.name,
                size: file.size,
                mime: file.type,
                data: dataURL
            });

            if (!res.ok) {
                if (res.reason === 'duplicate') {
                    _toast('warning', 'این فایل قبلاً اضافه شده است', 'تکراری');
                } else {
                    _toast('error', 'خطا در افزودن فایل', 'خطا');
                }
                return;
            }

            _emit(ActionEvents.FILE_ADDED, {
                code: code,
                doc: res.doc,
                at: Date.now()
            });

            _toast('success', 'فایل «' + file.name + '» بارگذاری شد', 'موفق');
        });
    }

    // ─────────────────────────────────────
    // 🗑️ حذف فایل
    // ─────────────────────────────────────
    function _handleRemoveDoc(id) {
        if (!id) return;
        if (typeof WamBrokerWizardV2 === 'undefined' ||
            !WamBrokerWizardV2.removeDocument) return;

        var res = WamBrokerWizardV2.removeDocument(id);
        if (!res.ok) {
            _toast('error', 'خطا در حذف فایل', 'خطا');
            return;
        }

        _emit(ActionEvents.FILE_REMOVED, {
            doc: res.doc,
            at: Date.now()
        });

        _toast('info', 'فایل حذف شد', 'موفق');
    }

    // ─────────────────────────────────────
    // 🔄 پس از رندر — بایند داینامیک
    // ─────────────────────────────────────
    function afterRender(root, state) {
        if (!root) return;

        // ۱. بایند file inputs
        var fileInputs = root.querySelectorAll('[data-doc-input]');
        for (var i = 0; i < fileInputs.length; i++) {
            var input = fileInputs[i];
            var code = input.getAttribute('data-doc-input');
            if (STATE.boundFileInputs[code]) continue;

            (function (inp) {
                inp.addEventListener('change', function () {
                    _handleFileInput(inp, state);
                });
            })(input);

            STATE.boundFileInputs[code] = true;
        }

        // ۲. بایند دکمه‌های حذف مدرک
        var removeBtns = root.querySelectorAll('[data-doc-action="remove"]');
        for (var j = 0; j < removeBtns.length; j++) {
            var btn = removeBtns[j];
            if (btn.dataset.bwizv2Bound) continue;

            (function (b) {
                b.addEventListener('click', function (e) {
                    e.preventDefault();
                    var id = b.getAttribute('data-doc-id');
                    _handleRemoveDoc(id);
                });
            })(btn);

            btn.dataset.bwizv2Bound = '1';
        }

        // ۳. بایند دکمه‌های خاص (copy-from-applicant و ...)
        var customBtns = root.querySelectorAll('[data-bwizv2-custom]');
        for (var k = 0; k < customBtns.length; k++) {
            var cb = customBtns[k];
            if (cb.dataset.bwizv2Bound) continue;

            (function (b) {
                b.addEventListener('click', function (e) {
                    e.preventDefault();
                    var action = b.getAttribute('data-bwizv2-custom');
                    handleAction(action, b, state);
                });
            })(cb);

            cb.dataset.bwizv2Bound = '1';
        }

        // ۴. اگر در مرحله loan هستیم، محاسبه قسط را اجرا کن
        if (state && state.currentStep === 4) {
            _updateInstallmentPreview(root, state);
        }
    }

    // ─────────────────────────────────────
    // 🎯 onFieldChange — واکنش به تغییر فیلدها
    // ─────────────────────────────────────
    function onFieldChange(name, el, state) {
        if (!name) return;

        _emit(ActionEvents.FIELD_CHANGED, {
            name: name,
            value: el ? el.value : null,
            at: Date.now()
        });

        // در مرحله وام (step 4): به‌روزرسانی پیش‌نمایش قسط
        if (state && state.currentStep === 4) {
            if (name === 'loanAmount' || name === 'loanDuration' ||
                name === 'loanRate') {
                _updateInstallmentPreview(state.root, state);
            }
        }

        // اعتبارسنجی فوری کد ملی
        if (name === 'applicantNationalCode' && el && el.value) {
            _validateNationalCodeInline(el);
        }

        // اعتبارسنجی فوری موبایل
        if (name === 'applicantMobile' && el && el.value) {
            _validateMobileInline(el);
        }
    }

    // ─────────────────────────────────────
    // 🧮 اعتبارسنجی inline
    // ─────────────────────────────────────
    function _validateNationalCodeInline(el) {
        var v = _en(el.value).replace(/\D/g, '');
        var errEl = document.querySelector('[data-error="applicantNationalCode"]');
        if (!errEl) return;
        if (v.length !== 10) {
            if (v.length > 0) {
                errEl.textContent = 'کد ملی باید ۱۰ رقم باشد (فعلاً ' + _fa(v.length) + ' رقم)';
                errEl.style.display = 'block';
            } else {
                errEl.textContent = '';
                errEl.style.display = 'none';
            }
        } else {
            errEl.textContent = '';
            errEl.style.display = 'none';
        }
    }

    function _validateMobileInline(el) {
        var v = _en(el.value).replace(/\D/g, '');
        var errEl = document.querySelector('[data-error="applicantMobile"]');
        if (!errEl) return;
        if (v.length > 0 && !/^09/.test(v)) {
            errEl.textContent = 'شماره موبایل باید با ۰۹ شروع شود';
            errEl.style.display = 'block';
        } else if (v.length > 0 && v.length !== 11) {
            errEl.textContent = 'موبایل باید ۱۱ رقم باشد (فعلاً ' + _fa(v.length) + ' رقم)';
            errEl.style.display = 'block';
        } else {
            errEl.textContent = '';
            errEl.style.display = 'none';
        }
    }

    // ─────────────────────────────────────
    // 🧮 محاسبه قسط
    // ─────────────────────────────────────
    function calculateInstallment(amount, durationMonths, annualRate) {
        amount = Number(_en(amount)) || 0;
        durationMonths = Number(durationMonths) || 0;
        annualRate = (annualRate === undefined || annualRate === null || annualRate === '')
            ? DEFAULT_RATE : Number(annualRate);

        if (amount <= 0 || durationMonths <= 0) {
            return { ok: false, reason: 'invalid_input' };
        }

        var monthlyRate = annualRate / 12;
        var monthly;
        if (monthlyRate === 0) {
            monthly = amount / durationMonths;
        } else {
            var pow = Math.pow(1 + monthlyRate, durationMonths);
            monthly = amount * monthlyRate * pow / (pow - 1);
        }

        var total = monthly * durationMonths;
        var interest = total - amount;

        return {
            ok: true,
            monthly: Math.round(monthly),
            total: Math.round(total),
            interest: Math.round(interest),
            amount: amount,
            duration: durationMonths,
            rate: annualRate
        };
    }

    function _updateInstallmentPreview(root, state) {
        if (!root) return;

        var amountEl = root.querySelector('[name="loanAmount"]');
        var durEl = root.querySelector('[name="loanDuration"]');
        var rateEl = root.querySelector('[name="loanRate"]');
        if (!amountEl || !durEl) return;

        var box = root.querySelector('[data-bwizv2="calc-result"]');
        if (!box) return;

        var result = calculateInstallment(
            amountEl.value,
            durEl.value,
            rateEl ? rateEl.value : null
        );

        if (!result.ok) {
            box.innerHTML = '<div class="wam-calc-hint">' +
                '💡 برای مشاهده قسط، مبلغ و مدت را وارد کنید.' +
                '</div>';
            STATE.lastCalcResult = null;
            return;
        }

        STATE.lastCalcResult = result;
        STATE.lastCalcAt = Date.now();

        box.innerHTML =
            '<div class="wam-calc-result">' +
                '<div class="wam-calc-row">' +
                    '<span>قسط ماهانه:</span>' +
                    '<strong>' + _amt(result.monthly) + ' ریال</strong>' +
                '</div>' +
                '<div class="wam-calc-row">' +
                    '<span>مجموع بازپرداخت:</span>' +
                    '<span>' + _amt(result.total) + ' ریال</span>' +
                '</div>' +
                '<div class="wam-calc-row">' +
                    '<span>سود کل:</span>' +
                    '<span>' + _amt(result.interest) + ' ریال</span>' +
                '</div>' +
                '<div class="wam-calc-note">' +
                    '⚠️ این محاسبه تقریبی است و نرخ نهایی توسط بانک تعیین می‌شود.' +
                '</div>' +
            '</div>';

        _emit(ActionEvents.CALCULATED, {
            result: result,
            at: STATE.lastCalcAt
        });
    }

    // ─────────────────────────────────────
    // 🎯 handleAction — اکشن‌های سفارشی
    // ─────────────────────────────────────
    function handleAction(action, el, state) {
        if (!action) return false;

        _emit(ActionEvents.CUSTOM_ACTION, {
            action: action, at: Date.now()
        });

        switch (action) {
            case 'calc-installment':
                _updateInstallmentPreview(state.root, state);
                return true;

            case 'clear-docs':
                _confirmClearDocs(state);
                return true;

            case 'copy-applicant-info':
                _copyApplicantInfo(state);
                return true;

            case 'goto-step-1':
                if (typeof WamBrokerWizardV2 !== 'undefined') {
                    WamBrokerWizardV2.gotoStep(1);
                }
                return true;

            case 'goto-step-4':
                if (typeof WamBrokerWizardV2 !== 'undefined') {
                    WamBrokerWizardV2.gotoStep(4);
                }
                return true;

            case 'save-draft':
                if (typeof WamBrokerWizardV2 !== 'undefined') {
                    var ok = WamBrokerWizardV2.saveDraft();
                    _toast(ok ? 'success' : 'error',
                        ok ? 'پیش‌نویس ذخیره شد' : 'خطا در ذخیره');
                }
                return true;

            case 'view-doc':
                var docId = el ? el.getAttribute('data-doc-id') : null;
                if (docId) _viewDoc(docId, state);
                return true;

            default:
                return false;
        }
    }

    // ─────────────────────────────────────
    // 🗑️ حذف همه مدارک
    // ─────────────────────────────────────
    function _confirmClearDocs(state) {
        var docs = (state && state.uploadedDocs) ? state.uploadedDocs : [];
        if (docs.length === 0) {
            _toast('info', 'مدرکی برای حذف وجود ندارد', 'توجه');
            return;
        }

        var doIt = function () {
            // با استفاده از API اصلی حذف کن
            if (typeof WamBrokerWizardV2 === 'undefined' ||
                !WamBrokerWizardV2.removeDocument) return;

            var ids = [];
            for (var i = 0; i < docs.length; i++) ids.push(docs[i].id);

            for (var j = 0; j < ids.length; j++) {
                try { WamBrokerWizardV2.removeDocument(ids[j]); } catch (e) { /* بی‌صدا */ }
            }
            _toast('info', _fa(docs.length) + ' مدرک حذف شد', 'موفق');
        };

        var msg = 'همه مدارک بارگذاری‌شده حذف شوند؟';
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('حذف همه مدارک', msg, { danger: true })
                .then(function (ok) { if (ok) doIt(); });
        } else if (window.confirm(msg)) {
            doIt();
        }
    }

    // ─────────────────────────────────────
    // 📋 کپی اطلاعات متقاضی (placeholder)
    // ─────────────────────────────────────
    function _copyApplicantInfo(state) {
        // اگر کاربر applicant خاصی انتخاب شده بود، می‌توان اطلاعاتش را کپی کرد
        // در این نسخه فقط یک هشدار می‌دهیم
        _toast('info', 'این قابلیت در نسخه بعدی فعال می‌شود', 'به‌زودی');
    }

    // ─────────────────────────────────────
    // 👁️ نمایش مدرک
    // ─────────────────────────────────────
    function _viewDoc(docId, state) {
        var docs = (state && state.uploadedDocs) ? state.uploadedDocs : [];
        var doc = null;
        for (var i = 0; i < docs.length; i++) {
            if (docs[i].id === docId) { doc = docs[i]; break; }
        }
        if (!doc) return;

        var existing = document.getElementById('wamDocViewModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var body = '';
        if (doc.data && doc.mime && doc.mime.indexOf('image/') === 0) {
            body = '<img src="' + doc.data + '" alt="' + _fa(0) +
                   '" style="max-width:100%;border-radius:8px">';
        } else if (doc.data && doc.mime === 'application/pdf') {
            body = '<iframe src="' + doc.data +
                   '" style="width:100%;height:60vh;border:0;border-radius:8px"></iframe>';
        } else {
            body = '<div class="wam-empty">پیش‌نمایش برای این نوع فایل موجود نیست.</div>';
        }

        var modal = document.createElement('div');
        modal.id = 'wamDocViewModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel wam-modal__panel--wide">' +
                '<header class="wam-modal__head">' +
                    '<h3>📄 ' + _esc(doc.name || 'مدرک') + '</h3>' +
                    '<button type="button" class="wam-modal__close" data-close>×</button>' +
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

    function _esc(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            boundFileInputs: Object.keys(STATE.boundFileInputs).length,
            boundButtons: Object.keys(STATE.boundButtons).length,
            lastCalcAt: STATE.lastCalcAt,
            lastCalcResult: STATE.lastCalcResult,
            defaultRate: DEFAULT_RATE,
            maxFileMB: MAX_FILE_MB
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
    var WamBrokerWizardV2Actions = {
        // ثوابت
        EVENTS: ActionEvents,
        DEFAULT_RATE: DEFAULT_RATE,
        MAX_FILE_MB: MAX_FILE_MB,
        MAX_FILE_BYTES: MAX_FILE_BYTES,
        ALLOWED_MIME: ALLOWED_MIME,

        // چرخه (که هسته صدا می‌زند)
        afterRender: afterRender,
        onFieldChange: onFieldChange,
        handleAction: handleAction,

        // محاسبات
        calculateInstallment: calculateInstallment,

        // ابزارها
        validateFile: _validateFile,
        viewDoc: _viewDoc,

        // گزارش
        getStatus: getStatus,
        onChange: onChange
    };

    window.WamBrokerWizardV2Actions = WamBrokerWizardV2Actions;
    window.BrokerWizardV2ActionsEvents = ActionEvents;

    // لاگ
    try {
        if (typeof console !== 'undefined' && console.log) {
            console.log('%c[broker-wizard-v2-actions] v2.0.0 آماده — اکشن‌ها ثبت شد',
                'color:#105b35');
        }
    } catch (e) { /* بی‌صدا */ }

})();