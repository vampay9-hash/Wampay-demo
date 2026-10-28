// ==========================================
// وام پی — Broker Panel
// فایل: broker-wizard-v2-steps.js
// نسخه: 2.0.0
// تاریخ: 1405/01/15
// کارش: رندرکننده مراحل ویزارد پیشرفته (۶ مرحله)
//        ماژول کمکی برای broker-wizard-v2.js
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var BANKS = [
        'ملی', 'صادرات', 'تجارت', 'سپه', 'کشاورزی', 'مسکن',
        'رسالت', 'پاسارگاد', 'پارسیان', 'سامان', 'ملت', 'رفاه',
        'مهر ایران', 'قوامین', 'شهر', 'آینده', 'سینا', 'دی'
    ];

    var JOB_OPTIONS = [
        'کارمند دولتی', 'کارمند خصوصی', 'آزاد', 'بازنشسته',
        'دانشجو', 'خانه‌دار', 'کشاورز', 'پزشک', 'وکیل',
        'فروشنده', 'معلم', 'استاد', 'مهندس', 'سایر'
    ];

    var GENDER_OPTIONS = [
        { v: 'male',   l: 'مرد' },
        { v: 'female', l: 'زن' }
    ];

    var MARITAL_OPTIONS = [
        { v: 'single',  l: 'مجرد' },
        { v: 'married', l: 'متأهل' }
    ];

    var EDUCATION_OPTIONS = [
        { v: 'below_diploma', l: 'زیر دیپلم' },
        { v: 'diploma',       l: 'دیپلم' },
        { v: 'associate',     l: 'کاردانی' },
        { v: 'bachelor',      l: 'کارشناسی' },
        { v: 'master',        l: 'کارشناسی ارشد' },
        { v: 'phd',           l: 'دکتری' }
    ];

    var PURPOSE_OPTIONS = [
        'خرید کالا', 'وام ازدواج', 'وام مسکن', 'وام خودرو',
        'وام قرض‌الحسنه', 'سرمایه در گردش', 'توسعه کسب‌وکار',
        'هزینه درمان', 'هزینه تحصیل', 'سایر'
    ];

    var COLLATERAL_OPTIONS = [
        { v: '',             l: '— انتخاب —' },
        { v: 'none',         l: 'بدون وثیقه (ضامن)' },
        { v: 'salary',       l: 'گواهی کسر از حقوق' },
        { v: 'property',     l: 'وثیقه ملکی' },
        { v: 'vehicle',      l: 'وثیقه خودرو' },
        { v: 'deposit',      l: 'سپرده بانکی' },
        { v: 'other',        l: 'سایر' }
    ];

    var DURATIONS = [12, 24, 36, 48, 60, 84, 120, 180];

    // ⚠️ فایل‌ها
    var REQUIRED_DOCS = [
        { code: 'national-card',    title: 'کارت ملی',        required: true,  accept: 'image/*,.pdf' },
        { code: 'id-card',          title: 'شناسنامه',        required: false, accept: 'image/*,.pdf' },
        { code: 'payslip',          title: 'فیش حقوقی',       required: true,  accept: 'image/*,.pdf' },
        { code: 'bank-statement',   title: 'گردش حساب',       required: false, accept: 'image/*,.pdf' },
        { code: 'employment-cert',  title: 'گواهی اشتغال',    required: true,  accept: 'image/*,.pdf' },
        { code: 'other-doc',        title: 'مدارک تکمیلی',    required: false, accept: 'image/*,.pdf' }
    ];

    var MAX_FILE_MB = 5;

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

    function _size(bytes) {
        if (!bytes) return '۰';
        if (bytes < 1024) return _fa(bytes) + ' بایت';
        if (bytes < 1024 * 1024) return _fa(Math.round(bytes / 1024)) + ' کیلوبایت';
        return _fa(Math.round(bytes / 1024 / 1024 * 10) / 10) + ' مگابایت';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — بخش‌بندی
    // ─────────────────────────────────────
    function _section(title, icon, body, desc) {
        return '<fieldset class="wam-wizv2__section">' +
            '<legend class="wam-wizv2__section-title">' +
                (icon ? '<span>' + icon + '</span> ' : '') +
                _esc(title) +
            '</legend>' +
            (desc ? '<p class="wam-wizv2__section-desc">' + _esc(desc) + '</p>' : '') +
            '<div class="wam-wizv2__section-body">' + body + '</div>' +
        '</fieldset>';
    }

    function _field(label, name, value, options) {
        options = options || {};
        var required = options.required ? ' *' : '';
        var placeholder = options.placeholder || '';
        var type = options.type || 'text';
        var attrs = options.attrs || '';
        var maxlength = options.maxlength ? ' maxlength="' + options.maxlength + '"' : '';
        var inputmode = options.inputmode ? ' inputmode="' + options.inputmode + '"' : '';

        return '<div class="wam-field">' +
            '<label>' + _esc(label) + required + '</label>' +
            '<input type="' + type + '" name="' + _esc(name) + '" ' +
                'value="' + _esc(value || '') + '" ' +
                'placeholder="' + _esc(placeholder) + '"' +
                maxlength + inputmode + ' ' + attrs + '>' +
            '<div class="wam-field__error" data-error="' + _esc(name) + '"></div>' +
        '</div>';
    }

    function _select(label, name, value, options, required) {
        var html = '<option value="">— انتخاب کنید —</option>';
        for (var i = 0; i < options.length; i++) {
            var o = options[i];
            var v = typeof o === 'string' ? o : o.v;
            var l = typeof o === 'string' ? o : o.l;
            html += '<option value="' + _esc(v) + '"' +
                    (String(value) === String(v) ? ' selected' : '') + '>' +
                    _esc(l) + '</option>';
        }
        return '<div class="wam-field">' +
            '<label>' + _esc(label) + (required ? ' *' : '') + '</label>' +
            '<select name="' + _esc(name) + '">' + html + '</select>' +
            '<div class="wam-field__error" data-error="' + _esc(name) + '"></div>' +
        '</div>';
    }

    function _textarea(label, name, value, rows) {
        rows = rows || 3;
        return '<div class="wam-field">' +
            '<label>' + _esc(label) + '</label>' +
            '<textarea name="' + _esc(name) + '" rows="' + rows + '">' +
                _esc(value || '') +
            '</textarea>' +
            '<div class="wam-field__error" data-error="' + _esc(name) + '"></div>' +
        '</div>';
    }

    function _checkbox(name, label, checked) {
        return '<label class="wam-check">' +
            '<input type="checkbox" name="' + _esc(name) + '"' +
            (checked ? ' checked' : '') + '>' +
            '<span>' + _esc(label) + '</span>' +
        '</label>';
    }

    function _row2(a, b) {
        return '<div class="wam-wizv2__row wam-wizv2__row--2">' +
            '<div>' + a + '</div><div>' + b + '</div>' +
        '</div>';
    }

    // ─────────────────────────────────────
    // 📝 مرحله ۱: اطلاعات متقاضی
    // ─────────────────────────────────────
    function renderApplicant(data, state) {
        data = data || {};
        var html = '';

        html += '<h3 class="wam-wizv2__title">👤 اطلاعات متقاضی</h3>';
        html += '<p class="wam-wizv2__desc">' +
                'اطلاعات پایه متقاضی وام را با دقت وارد کنید.' +
                '</p>';

        // نام و موبایل
        html += _row2(
            _field('نام و نام خانوادگی', 'applicantName', data.applicantName, {
                required: true,
                placeholder: 'مثال: علی رضایی'
            }),
            _field('شماره موبایل', 'applicantMobile', data.applicantMobile, {
                required: true,
                type: 'tel',
                maxlength: 11,
                inputmode: 'numeric',
                placeholder: '09123456789'
            })
        );

        // ایمیل و تلفن ثابت
        html += _row2(
            _field('ایمیل (اختیاری)', 'applicantEmail', data.applicantEmail, {
                type: 'email',
                placeholder: 'name@example.com'
            }),
            _field('تلفن ثابت (اختیاری)', 'applicantPhone', data.applicantPhone, {
                type: 'tel',
                inputmode: 'numeric',
                placeholder: '02112345678'
            })
        );

        return _section('اطلاعات پایه', '', html);
    }

    // ─────────────────────────────────────
    // 🆔 مرحله ۲: تأیید هویت
    // ─────────────────────────────────────
    function renderIdentity(data, state) {
        data = data || {};
        var html = '';

        html += '<h3 class="wam-wizv2__title">🆔 تأیید هویت</h3>';
        html += '<p class="wam-wizv2__desc">' +
                'اطلاعات هویتی متقاضی برای احراز هویت.' +
                '</p>';

        // کد ملی و شماره شناسنامه
        html += _row2(
            _field('کد ملی', 'applicantNationalCode', data.applicantNationalCode, {
                required: true,
                maxlength: 10,
                inputmode: 'numeric',
                placeholder: '۱۰ رقم'
            }),
            _field('شماره شناسنامه', 'applicantIdNumber', data.applicantIdNumber, {
                maxlength: 12,
                inputmode: 'numeric',
                placeholder: 'مثال: 12345'
            })
        );

        // تاریخ تولد و محل تولد
        html += _row2(
            _field('تاریخ تولد', 'applicantBirthDate', data.applicantBirthDate, {
                required: true,
                placeholder: '1370/01/01',
                attrs: 'data-persian-date'
            }),
            _field('محل تولد', 'applicantBirthPlace', data.applicantBirthPlace, {
                placeholder: 'شهر محل تولد'
            })
        );

        // جنسیت و وضعیت تأهل
        html += _row2(
            _select('جنسیت', 'applicantGender', data.applicantGender,
                    GENDER_OPTIONS, true),
            _select('وضعیت تأهل', 'applicantMaritalStatus',
                    data.applicantMaritalStatus, MARITAL_OPTIONS)
        );

        // تحصیلات و تعداد فرزند
        html += _row2(
            _select('مدرک تحصیلی', 'applicantEducation',
                    data.applicantEducation, EDUCATION_OPTIONS),
            _field('تعداد فرزند', 'applicantChildren', data.applicantChildren, {
                type: 'number',
                inputmode: 'numeric',
                placeholder: '0'
            })
        );

        return _section('اطلاعات هویتی', '', html);
    }

    // ─────────────────────────────────────
    // 💰 مرحله ۳: اطلاعات مالی
    // ─────────────────────────────────────
    function renderFinancial(data, state) {
        data = data || {};
        var html = '';

        html += '<h3 class="wam-wizv2__title">💰 اطلاعات مالی و شغلی</h3>';
        html += '<p class="wam-wizv2__desc">' +
                'وضعیت شغلی و توان مالی متقاضی.' +
                '</p>';

        // شغل و سابقه کار
        html += _row2(
            _select('شغل', 'applicantJob', data.applicantJob,
                    JOB_OPTIONS, true),
            _field('سابقه کار (سال)', 'workExperience', data.workExperience, {
                type: 'number',
                inputmode: 'numeric',
                placeholder: '0'
            })
        );

        // نام محل کار
        html += _field('نام محل کار', 'employerName', data.employerName, {
            placeholder: 'نام شرکت / سازمان / کسب‌وکار'
        });

        // درآمد ماهانه و درآمد جانبی
        html += _row2(
            _field('درآمد ماهانه (ریال)', 'monthlyIncome', data.monthlyIncome, {
                required: true,
                inputmode: 'numeric',
                placeholder: 'مثال: 150000000'
            }),
            _field('درآمد جانبی (ریال)', 'otherIncome', data.otherIncome, {
                inputmode: 'numeric',
                placeholder: '0'
            })
        );

        // بدهی / اقساط جاری
        html += _row2(
            _field('مجموع اقساط جاری (ریال)', 'existingInstallments',
                    data.existingInstallments, {
                inputmode: 'numeric',
                placeholder: '0'
            }),
            _field('شماره حساب بانکی', 'bankAccount', data.bankAccount, {
                inputmode: 'numeric',
                placeholder: 'شماره حساب یا کارت'
            })
        );

        // یادداشت
        html += _textarea('توضیحات مالی (اختیاری)',
                'financialNote', data.financialNote, 3);

        return _section('اطلاعات مالی', '', html);
    }

    // ─────────────────────────────────────
    // 🏦 مرحله ۴: مشخصات وام
    // ─────────────────────────────────────
    function renderLoan(data, state) {
        data = data || {};
        var html = '';

        html += '<h3 class="wam-wizv2__title">🏦 مشخصات وام</h3>';
        html += '<p class="wam-wizv2__desc">' +
                'جزئیات وام درخواستی و شرایط.' +
                '</p>';

        // بانک و مبلغ
        html += _row2(
            _select('بانک درخواستی', 'bank', data.bank, BANKS, true),
            _field('مبلغ وام (ریال)', 'loanAmount', data.loanAmount, {
                required: true,
                inputmode: 'numeric',
                placeholder: 'مثال: 500000000'
            })
        );

        // مدت و هدف
        var durOpts = [];
        for (var i = 0; i < DURATIONS.length; i++) {
            durOpts.push({ v: DURATIONS[i], l: _fa(DURATIONS[i]) + ' ماه' });
        }
        html += _row2(
            _select('مدت بازپرداخت', 'loanDuration', data.loanDuration,
                    durOpts, true),
            _select('هدف وام', 'purpose', data.purpose,
                    PURPOSE_OPTIONS, true)
        );

        // نوع وثیقه و شرح
        html += _row2(
            _select('نوع وثیقه', 'collateralType', data.collateralType,
                    COLLATERAL_OPTIONS),
            _field('مبلغ وثیقه (ریال)', 'collateralAmount', data.collateralAmount, {
                inputmode: 'numeric',
                placeholder: '0'
            })
        );

        html += _textarea('شرح وثیقه', 'collateralDesc',
                data.collateralDesc, 2);

        // توضیحات کلی وام
        html += _textarea('توضیحات وام (اختیاری)', 'loanNote',
                data.loanNote, 3);

        return _section('مشخصات وام', '', html);
    }

    // ─────────────────────────────────────
    // 📎 مرحله ۵: مدارک
    // ─────────────────────────────────────
    function renderDocuments(data, state) {
        var html = '';

        html += '<h3 class="wam-wizv2__title">📎 بارگذاری مدارک</h3>';
        html += '<p class="wam-wizv2__desc">' +
                'مدارک مورد نیاز را بارگذاری کنید. حداکثر حجم هر فایل: ' +
                _fa(MAX_FILE_MB) + ' مگابایت.' +
                '</p>';

        var uploaded = (state && state.uploadedDocs) ? state.uploadedDocs : [];

        html += '<div class="wam-wizv2__docs">';

        for (var i = 0; i < REQUIRED_DOCS.length; i++) {
            var doc = REQUIRED_DOCS[i];
            var found = null;
            for (var j = 0; j < uploaded.length; j++) {
                if (uploaded[j].type === doc.code) { found = uploaded[j]; break; }
            }

            html += '<div class="wam-doc-item' + (found ? ' is-uploaded' : '') + '" ' +
                    'data-doc-code="' + _esc(doc.code) + '">';

            html += '<div class="wam-doc-item__head">';
            html += '<div class="wam-doc-item__title">' +
                    _esc(doc.title) +
                    (doc.required ? ' <span class="wam-required">*</span>' : '') +
                    '</div>';
            html += '<div class="wam-doc-item__status">';
            if (found) {
                html += '<span class="wam-badge wam-badge--completed">✓ بارگذاری شد</span>';
            } else {
                html += '<span class="wam-badge wam-badge--pending">بارگذاری نشده</span>';
            }
            html += '</div></div>';

            if (found) {
                html += '<div class="wam-doc-item__file">';
                html += '<div class="wam-doc-item__file-name">📄 ' +
                        _esc(found.name) + '</div>';
                html += '<div class="wam-doc-item__file-size">' +
                        _size(found.size) + '</div>';
                html += '<button type="button" class="wam-btn-icon wam-btn-icon--danger" ' +
                        'data-doc-action="remove" data-doc-id="' + _esc(found.id) + '" ' +
                        'title="حذف">🗑️</button>';
                html += '</div>';
            } else {
                html += '<div class="wam-doc-item__upload">';
                html += '<input type="file" id="doc_' + _esc(doc.code) + '" ' +
                        'data-doc-input="' + _esc(doc.code) + '" ' +
                        'accept="' + _esc(doc.accept) + '" style="display:none">';
                html += '<label for="doc_' + _esc(doc.code) + '" class="wam-btn wam-btn--sm wam-btn--ghost">' +
                        '📤 انتخاب فایل</label>';
                html += '</div>';
            }

            html += '</div>';
        }

        html += '</div>';

        html += '<div class="wam-wizv2__docs-note">';
        html += '⚠️ فایل‌های بارگذاری‌شده فقط برای بررسی اولیه است. ' +
                'در صورت نیاز به‌صورت حضوری نیز بررسی می‌شود.';
        html += '</div>';

        return _section('مدارک مورد نیاز', '', html);
    }

    // ─────────────────────────────────────
    // ✅ مرحله ۶: بررسی نهایی
    // ─────────────────────────────────────
    function renderReview(data, state) {
        data = data || {};
        var html = '';

        html += '<h3 class="wam-wizv2__title">✅ بررسی نهایی</h3>';
        html += '<p class="wam-wizv2__desc">' +
                'اطلاعات زیر را با دقت بررسی کنید. پس از ثبت، امکان ویرایش ندارید.' +
                '</p>';

        // اطلاعات متقاضی
        html += _reviewSection('👤 اطلاعات متقاضی', [
            ['نام و نام خانوادگی', data.applicantName],
            ['موبایل', data.applicantMobile],
            ['ایمیل', data.applicantEmail || '—'],
            ['تلفن ثابت', data.applicantPhone || '—']
        ]);

        // اطلاعات هویتی
        html += _reviewSection('🆔 اطلاعات هویتی', [
            ['کد ملی', data.applicantNationalCode],
            ['شماره شناسنامه', data.applicantIdNumber || '—'],
            ['تاریخ تولد', data.applicantBirthDate],
            ['محل تولد', data.applicantBirthPlace || '—'],
            ['جنسیت', _labelOf(data.applicantGender, GENDER_OPTIONS)],
            ['وضعیت تأهل', _labelOf(data.applicantMaritalStatus, MARITAL_OPTIONS)],
            ['تحصیلات', _labelOf(data.applicantEducation, EDUCATION_OPTIONS)],
            ['تعداد فرزند', data.applicantChildren || '—']
        ]);

        // اطلاعات مالی
        html += _reviewSection('💰 اطلاعات مالی', [
            ['شغل', data.applicantJob || '—'],
            ['سابقه کار', data.workExperience ? _fa(data.workExperience) + ' سال' : '—'],
            ['درآمد ماهانه', data.monthlyIncome ? _amt(data.monthlyIncome) + ' ریال' : '—'],
            ['درآمد جانبی', data.otherIncome ? _amt(data.otherIncome) + ' ریال' : '—'],
            ['اقساط جاری', data.existingInstallments ? _amt(data.existingInstallments) + ' ریال' : '—']
        ]);

        // مشخصات وام
        html += _reviewSection('🏦 مشخصات وام', [
            ['بانک', data.bank],
            ['مبلغ وام', data.loanAmount ? _amt(data.loanAmount) + ' ریال' : '—'],
            ['مدت بازپرداخت', data.loanDuration ? _fa(data.loanDuration) + ' ماه' : '—'],
            ['هدف وام', data.purpose || '—'],
            ['نوع وثیقه', _labelOf(data.collateralType, COLLATERAL_OPTIONS)],
            ['مبلغ وثیقه', data.collateralAmount ? _amt(data.collateralAmount) + ' ریال' : '—']
        ]);

        // مدارک
        var docs = (state && state.uploadedDocs) ? state.uploadedDocs : [];
        var docsRows = [];
        for (var i = 0; i < REQUIRED_DOCS.length; i++) {
            var d = REQUIRED_DOCS[i];
            var found = false;
            for (var j = 0; j < docs.length; j++) {
                if (docs[j].type === d.code) { found = true; break; }
            }
            docsRows.push([
                d.title,
                found ? '✓ بارگذاری شده' : (d.required ? '⚠️ الزامی' : '—')
            ]);
        }
        html += _reviewSection('📎 مدارک', docsRows);

        // چک‌باکس‌های تأیید
        html += '<div class="wam-wizv2__agreements">';
        html += _checkbox('agreeTerms',
            'قوانین و مقررات وام پی را مطالعه کرده و می‌پذیرم',
            data.agreeTerms);
        html += '<div class="wam-field__error" data-error="agreeTerms"></div>';
        html += _checkbox('agreeTruth',
            'صحت تمام اطلاعات وارد‌شده را تأیید می‌کنم',
            data.agreeTruth);
        html += '<div class="wam-field__error" data-error="agreeTruth"></div>';
        html += '</div>';

        return html;
    }

    function _reviewSection(title, rows) {
        var html = '<div class="wam-wizv2__review-section">';
        html += '<h4 class="wam-wizv2__review-title">' + _esc(title) + '</h4>';
        html += '<div class="wam-wizv2__review-rows">';
        for (var i = 0; i < rows.length; i++) {
            var label = rows[i][0];
            var value = rows[i][1];
            html += '<div class="wam-review-row">' +
                    '<span class="wam-review-row__label">' + _esc(label) + ':</span>' +
                    '<span class="wam-review-row__value">' +
                    _esc(value || '—') + '</span></div>';
        }
        html += '</div></div>';
        return html;
    }

    function _labelOf(value, options) {
        if (!value) return '—';
        for (var i = 0; i < options.length; i++) {
            var o = options[i];
            var v = typeof o === 'string' ? o : o.v;
            var l = typeof o === 'string' ? o : o.l;
            if (String(v) === String(value)) return l;
        }
        return value;
    }

    // ─────────────────────────────────────
    // 🎯 رجیستری رندرکننده‌ها
    // ─────────────────────────────────────
    var RENDERERS = {
        applicant:  renderApplicant,
        identity:   renderIdentity,
        financial:  renderFinancial,
        loan:       renderLoan,
        documents:  renderDocuments,
        review:     renderReview
    };

    function getRenderer(key) {
        return RENDERERS[key] || null;
    }

    function renderStep(key, data, state) {
        var fn = RENDERERS[key];
        if (typeof fn !== 'function') {
            return '<div class="wam-empty">رندرکننده مرحله «' +
                   _esc(key) + '» یافت نشد.</div>';
        }
        try {
            return fn(data, state);
        } catch (err) {
            console.error('[bwizv2-steps] خطا در رندر ' + key + ':', err);
            return '<div class="wam-empty">خطا در رندر مرحله.</div>';
        }
    }

    // ─────────────────────────────────────
    // 📋 لیست مدارک
    // ─────────────────────────────────────
    function getRequiredDocs() {
        return REQUIRED_DOCS.slice();
    }

    function getDocByCode(code) {
        for (var i = 0; i < REQUIRED_DOCS.length; i++) {
            if (REQUIRED_DOCS[i].code === code) return REQUIRED_DOCS[i];
        }
        return null;
    }

    // ─────────────────────────────────────
    // 🌐 API جهانی
    // ─────────────────────────────────────
    var WamBrokerWizardV2Steps = {
        // ثوابت
        BANKS: BANKS,
        JOB_OPTIONS: JOB_OPTIONS,
        GENDER_OPTIONS: GENDER_OPTIONS,
        MARITAL_OPTIONS: MARITAL_OPTIONS,
        EDUCATION_OPTIONS: EDUCATION_OPTIONS,
        PURPOSE_OPTIONS: PURPOSE_OPTIONS,
        COLLATERAL_OPTIONS: COLLATERAL_OPTIONS,
        DURATIONS: DURATIONS,
        REQUIRED_DOCS: REQUIRED_DOCS,
        MAX_FILE_MB: MAX_FILE_MB,

        // رندرکننده‌ها
        renderStep: renderStep,
        getRenderer: getRenderer,

        // رندر مستقیم هر مرحله
        renderApplicant: renderApplicant,
        renderIdentity: renderIdentity,
        renderFinancial: renderFinancial,
        renderLoan: renderLoan,
        renderDocuments: renderDocuments,
        renderReview: renderReview,

        // ابزارها
        getRequiredDocs: getRequiredDocs,
        getDocByCode: getDocByCode
    };

    window.WamBrokerWizardV2Steps = WamBrokerWizardV2Steps;

    // لاگ ثبت موفق
    try {
        if (typeof console !== 'undefined' && console.log) {
            console.log('%c[broker-wizard-v2-steps] v2.0.0 آماده — ۶ رندرکننده ثبت شد',
                'color:#105b35');
        }
    } catch (e) { /* بی‌صدا */ }

})();