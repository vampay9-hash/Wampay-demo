/* ==========================================
 * WAM PAY — 👤 Applicant Bundle
 * ==========================================
 * 
 * Bundle خودکار
 * تعداد فایل: 1
 * تاریخ تولید: 2026-09-22T18:47:34.512Z
 * 
 * این فایل به صورت خودکار از چند فایل جداگانه
 * ادغام شده است. تغییرات مستقیم در این فایل
 * با اجرای بعدی Builder پاک می‌شوند.
 * ========================================== */




/* ==========================================
 * FROM: js/applicant-wizard.js
 * ========================================== */


// ==========================================
// وام پی — Applicant Wizard
// منطق فرم چند مرحله‌ای درخواست تسهیلات
// نسخه ۱
// ==========================================

(function () {
    'use strict';

    // ==========================================
    // بررسی وابستگی‌ها
    // ==========================================

    if (!window.WamPayAuth) {
        console.error('❌ permissions.js بارگذاری نشده!');
        return;
    }
    if (!window.WamPayApplicantStore) {
        console.error('❌ applicant-store.js بارگذاری نشده!');
        return;
    }

    const Auth = window.WamPayAuth;
    const Store = window.WamPayApplicantStore;

    // ==========================================
    // بررسی ورود کاربر
    // ==========================================

    const currentUser = Auth.getCurrentUser();

    if (!currentUser) {
        sessionStorage.setItem('wamPayLoginMessage', 'برای ثبت درخواست ابتدا وارد شوید.');
        window.location.replace('login.html');
        return;
    }

    if (currentUser.role !== 'applicant') {
        alert('این صفحه فقط برای متقاضیان است.');
        window.location.replace(Auth.getRoleDashboard(currentUser.role));
        return;
    }

    // ==========================================
    // تعریف گام‌ها
    // ==========================================

    const STEPS = [
        { key: 'identity', label: 'اطلاعات هویتی',  fields: ['firstName','lastName','nationalId','birthDate'] },
        { key: 'contact',  label: 'اطلاعات تماس',   fields: ['phone','address','postalCode'] },
        { key: 'job',      label: 'اطلاعات شغلی',   fields: ['jobTitle','monthlyIncome','workYears'] },
        { key: 'bank',     label: 'اطلاعات بانکی',  fields: ['bankName','iban'] },
        { key: 'loan',     label: 'درخواست تسهیلات', fields: ['loanType','loanAmount','loanMonths','loanPurpose'] },
        { key: 'review',   label: 'بازبینی و ارسال', fields: [] }
    ];

    // ==========================================
    // وضعیت
    // ==========================================

    let currentStep = 0;
    let application = null;

    // ==========================================
    // المان‌ها
    // ==========================================

    const panels      = document.querySelectorAll('.step-panel');
    const progressFill= document.getElementById('progressFill');
    const stepNum     = document.getElementById('stepNum');
    const stepLabel   = document.getElementById('stepLabel');
    const stepsMini   = document.getElementById('stepsMini');
    const prevBtn     = document.getElementById('prevBtn');
    const nextBtn     = document.getElementById('nextBtn');
    const globalMsg   = document.getElementById('globalMessage');
    const formWrap    = document.getElementById('formWrap');
    const progressCard= document.getElementById('progressCard');
    const successScreen = document.getElementById('successScreen');
    const trackingId  = document.getElementById('trackingId');
    const summaryContainer = document.getElementById('summaryContainer');

    // ==========================================
    // کمکی
    // ==========================================

    function toPersianDigits(n) {
        const fa = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
        return String(n).replace(/\d/g, d => fa[+d]);
    }

    function showMessage(text, type) {
        globalMsg.hidden = false;
        globalMsg.textContent = text;
        globalMsg.classList.remove('error', 'success', 'info');
        globalMsg.classList.add(type || 'error');
    }

    function hideMessage() {
        globalMsg.hidden = true;
        globalMsg.textContent = '';
    }

    // ==========================================
    // مقداردهی اولیه
    // ==========================================

    function initApplication() {

        // بررسی آیا از قبل پیش‌نویس دارد؟
        const draft = Store.loadDraft(currentUser.id);

        if (draft && draft.applicationId) {
            const existing = Store.getApplicationById(draft.applicationId);
            if (existing && existing.status === 'draft') {
                application = existing;
                currentStep = existing.currentStep || 0;
                console.log('📝 پیش‌نویس بارگذاری شد:', application.id);
                fillFormFromApplication();
                renderStepsMini();
                renderStep();
                return;
            }
        }

        // ساخت درخواست جدید
        application = Store.createApplication(currentUser.id, currentUser.mobile);
        currentStep = 0;
        renderStepsMini();
        renderStep();
        console.log('🆕 درخواست جدید ساخته شد:', application.id);
    }

    // ==========================================
    // پر کردن فرم از application
    // ==========================================

    function fillFormFromApplication() {

        const map = {
            firstName:     'w_firstName',
            lastName:      'w_lastName',
            nationalId:    'w_nationalId',
            birthDate:     'w_birthDate',
            phone:         'w_phone',
            address:       'w_address',
            postalCode:    'w_postalCode',
            jobTitle:      'w_jobTitle',
            monthlyIncome: 'w_monthlyIncome',
            workYears:     'w_workYears',
            bankName:      'w_bankName',
            iban:          'w_iban',
            loanType:      'w_loanType',
            loanAmount:    'w_loanAmount',
            loanMonths:    'w_loanMonths',
            loanPurpose:   'w_loanPurpose'
        };

        Object.keys(map).forEach(function (key) {
            const el = document.getElementById(map[key]);
            if (!el) return;

            // جستجو در همه‌ی بخش‌های data
            const allData = Object.assign({}, 
                application.data.identity,
                application.data.contact,
                application.data.job,
                application.data.bank,
                application.data.loan
            );

            if (allData[key] !== undefined && allData[key] !== null) {
                el.value = allData[key];
            }
        });
    }

    // ==========================================
    // نوار بالا
    // ==========================================

    function renderStepsMini() {
        stepsMini.innerHTML = '';
        STEPS.forEach(function (s, i) {
            const d = document.createElement('div');
            d.className = 'step-dot';
            if (i === currentStep) d.classList.add('active');
            if (i < currentStep) d.classList.add('done');
            d.textContent = i < currentStep ? '✓' : toPersianDigits(i + 1);
            d.title = s.label;
            stepsMini.appendChild(d);
        });
    }

    // ==========================================
    // نمایش گام جاری
    // ==========================================

    function renderStep() {

        panels.forEach(function (p) {
            p.classList.toggle('hidden', Number(p.dataset.step) !== currentStep);
        });

        // Progress
        const pct = ((currentStep + 1) / STEPS.length) * 100;
        progressFill.style.width = pct + '%';

        stepNum.textContent = toPersianDigits(currentStep + 1);
        stepLabel.textContent = STEPS[currentStep].label;

        renderStepsMini();

        // دکمه‌ها
        prevBtn.disabled = currentStep === 0;
        prevBtn.style.opacity = currentStep === 0 ? '0.5' : '1';

        if (currentStep === STEPS.length - 1) {
            nextBtn.textContent = 'ثبت نهایی ✅';
            renderSummary();
        } else {
            nextBtn.textContent = 'بعدی';
        }

        hideMessage();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ==========================================
    // جمع‌آوری مقادیر از فرم
    // ==========================================

    function collectStepData(stepIdx) {

        const step = STEPS[stepIdx];
        if (!step) return {};

        const out = {};
        step.fields.forEach(function (key) {
            const el = document.getElementById('w_' + key);
            if (el) out[key] = (el.value || '').trim();
        });
        return out;
    }

    // ==========================================
    // اعتبارسنجی
    // ==========================================

    function validateStep(stepIdx) {

        const step = STEPS[stepIdx];
        if (!step || step.fields.length === 0) return true;

        // پاک‌سازی خطاها
        document.querySelectorAll('.field').forEach(f => f.classList.remove('invalid'));

        let ok = true;

        const data = collectStepData(stepIdx);

        step.fields.forEach(function (key) {

            const fieldWrapper = document.querySelector('.field[data-key="' + key + '"]');
            const val = data[key];

            let invalid = false;

            switch (key) {
                case 'firstName':
                case 'lastName':
                    invalid = !val || val.length < 2;
                    break;

                case 'nationalId':
                    invalid = !/^[0-9]{10}$/.test(val.replace(/[^\d]/g,''));
                    break;

                case 'birthDate':
                    invalid = !val || val.length < 8;
                    break;

                case 'phone':
                    invalid = !/^0[0-9]{9,10}$/.test(val.replace(/[^\d]/g,''));
                    break;

                case 'address':
                    invalid = !val || val.length < 10;
                    break;

                case 'postalCode':
                    invalid = !/^[0-9]{10}$/.test(val.replace(/[^\d]/g,''));
                    break;

                case 'jobTitle':
                    invalid = !val || val.length < 2;
                    break;

                case 'monthlyIncome': {
                    const n = Number(val.replace(/[^\d]/g,''));
                    invalid = !n || n < 1000000;
                    break;
                }

                case 'workYears': {
                    const n = Number(val.replace(/[^\d]/g,''));
                    invalid = isNaN(n) || n < 0 || n > 60;
                    break;
                }

                case 'bankName':
                    invalid = !val;
                    break;

                case 'iban': {
                    const clean = val.replace(/\s/g,'').toUpperCase();
                    invalid = !/^IR[0-9]{24}$/.test(clean);
                    break;
                }

                case 'loanType':
                    invalid = !val;
                    break;

                case 'loanAmount': {
                    const n = Number(val.replace(/[^\d]/g,''));
                    invalid = !n || n < 1000000;
                    break;
                }

                case 'loanMonths': {
                    const n = Number(val.replace(/[^\d]/g,''));
                    invalid = isNaN(n) || n < 6 || n > 60;
                    break;
                }

                case 'loanPurpose':
                    invalid = !val || val.length < 10;
                    break;
            }

            if (invalid) {
                ok = false;
                if (fieldWrapper) fieldWrapper.classList.add('invalid');
            }
        });

        return ok;
    }

    // ==========================================
    // ذخیره‌ی گام در application
    // ==========================================

    function saveCurrentStep() {
        const step = STEPS[currentStep];
        if (!step || step.fields.length === 0) return;

        const data = collectStepData(currentStep);
        application.data[step.key] = data;
        application.currentStep = currentStep;
        Store.saveApplication(application);
        Store.saveDraft(currentUser.id, { applicationId: application.id });
    }

    // ==========================================
    // رفتن به گام بعدی
    // ==========================================

    function goNext() {

        // اعتبارسنجی گام فعلی
        if (STEPS[currentStep].fields.length > 0) {
            if (!validateStep(currentStep)) {
                showMessage('لطفاً خطاهای فرم را برطرف کنید.', 'error');
                return;
            }
        }

        // ذخیره
        saveCurrentStep();

        // اگر آخرین گام است → ثبت نهایی
        if (currentStep === STEPS.length - 1) {
            submitFinal();
            return;
        }

        currentStep++;
        renderStep();
    }

    // ==========================================
    // رفتن به گام قبلی
    // ==========================================

    function goPrev() {
        if (currentStep === 0) return;
        saveCurrentStep();
        currentStep--;
        renderStep();
    }

    // ==========================================
    // خلاصه (Step 6)
    // ==========================================

    function renderSummary() {

        const d = application.data;

        function row(label, value) {
            return '<div class="summary-row"><span>' + label + '</span><span>' + (value || '—') + '</span></div>';
        }

        function block(title, stepIdx, rows) {
            return '' +
                '<div class="summary-block">' +
                    '<h4>' + title + ' <button type="button" data-goto="' + stepIdx + '">ویرایش</button></h4>' +
                    rows +
                '</div>';
        }

        const html = '' +
            block('اطلاعات هویتی', 0,
                row('نام', d.identity.firstName) +
                row('نام خانوادگی', d.identity.lastName) +
                row('کد ملی', toPersianDigits(d.identity.nationalId || '')) +
                row('تاریخ تولد', toPersianDigits(d.identity.birthDate || ''))
            ) +
            block('اطلاعات تماس', 1,
                row('تلفن ثابت', toPersianDigits(d.contact.phone || '')) +
                row('آدرس', d.contact.address) +
                row('کد پستی', toPersianDigits(d.contact.postalCode || ''))
            ) +
            block('اطلاعات شغلی', 2,
                row('شغل', d.job.jobTitle) +
                row('درآمد ماهانه', toPersianDigits((d.job.monthlyIncome || '').toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')) + ' تومان') +
                row('سابقه کار', toPersianDigits(d.job.workYears || '') + ' سال')
            ) +
            block('اطلاعات بانکی', 3,
                row('بانک', d.bank.bankName) +
                row('شبا', d.bank.iban)
            ) +
            block('درخواست تسهیلات', 4,
                row('نوع تسهیلات', d.loan.loanType) +
                row('مبلغ', toPersianDigits((d.loan.loanAmount || '').toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')) + ' تومان') +
                row('مدت', toPersianDigits(d.loan.loanMonths || '') + ' ماه') +
                row('هدف', d.loan.loanPurpose)
            );

        summaryContainer.innerHTML = html;

        // دکمه‌های ویرایش
        summaryContainer.querySelectorAll('[data-goto]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const idx = Number(btn.getAttribute('data-goto'));
                currentStep = idx;
                renderStep();
            });
        });
    }

    // ==========================================
    // ثبت نهایی
    // ==========================================

    function submitFinal() {

        // علامت‌گذاری وضعیت
        application.status = 'verifier_pending';
        application.submittedAt = new Date().toISOString();
        application.currentStep = STEPS.length - 1;
        Store.saveApplication(application);
        Store.clearDraft(currentUser.id);

        console.log('✅ درخواست ثبت شد:', application.id);

        // نمایش صفحه‌ی موفقیت
        formWrap.classList.add('hidden');
        progressCard.classList.add('hidden');
        successScreen.classList.remove('hidden');
        trackingId.textContent = application.id;

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ==========================================
    // رویدادها
    // ==========================================

    nextBtn.addEventListener('click', goNext);
    prevBtn.addEventListener('click', goPrev);

    // Enter در input‌ها → بعدی (به جز textarea)
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        const t = e.target;
        if (t.tagName === 'INPUT' || t.tagName === 'SELECT') {
            e.preventDefault();
            goNext();
        }
    });

    // ذخیره‌ی خودکار در تایپ
    let autoSaveTimer = null;
    document.addEventListener('input', function (e) {
        if (!e.target.id || !e.target.id.startsWith('w_')) return;
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(function () {
            try { saveCurrentStep(); } catch (_) {}
        }, 800);
    });

    // ==========================================
    // شروع
    // ==========================================

    initApplication();

    console.log('🧙♂️ Applicant Wizard v1 آماده — کاربر:', currentUser.mobile);

})();




/* ==========================================
 * END OF BUNDLE
 * ========================================== */