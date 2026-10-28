// ==========================================
// وام پی - ثبت‌نام متقاضی (ویزارد ۶ مرحله)
// نسخه ۳: یکپارچگی کامل با WamPayAuth
//         + هش رمز + پیش‌نویس خودکار + تأیید نهایی
// ==========================================

document.addEventListener("DOMContentLoaded", function () {

    console.log('📝 applicant-register.js v3');

    // ==========================================
    // وابستگی حیاتی
    // ==========================================

    const Auth = window.WamPayAuth;

    if (!Auth) {
        console.error('❌ permissions.js بارگذاری نشده!');
        // پیام "در حال بارگذاری..." در #wizardContent باقی می‌ماند
        // تا کاربر بداند مشکلی هست و رفرش کند.
        return;
    }

    // ==========================================
    // کلیدهای localStorage
    // ==========================================

    const KEY_PENDING = 'wamPayPendingRegistration';  // از login.js
    const KEY_DRAFT   = 'wamPayRegisterDraft';        // پیش‌نویس ویزارد
    const KEY_TOKEN   = 'wamPayToken';
    const KEY_USER    = 'wamPayCurrentUser';

    // ==========================================
    // پارامترها
    // ==========================================

    const urlParams = new URLSearchParams(window.location.search);
    const urlMobile = urlParams.get('mobile') || '';

    let pending = {};
    try {
        pending = JSON.parse(localStorage.getItem(KEY_PENDING) || '{}');
    } catch (e) { pending = {}; }

    let draft = {};
    try {
        draft = JSON.parse(localStorage.getItem(KEY_DRAFT) || '{}');
    } catch (e) { draft = {}; }

    const initialMobile = urlMobile || pending.mobile || draft.mobile || '';

    // ==========================================
    // وضعیت
    // ==========================================

    const state = {
        password: '',
        confirmPassword: '',
        mobile: initialMobile,
        nationalId: '',
        firstName: '',
        lastName: '',
        birthYear: '',
        birthMonth: '',
        birthDay: '',
        gender: '',
        maritalStatus: '',
        province: '',
        city: '',
        address: '',
        job: '',
        income: 0,
        loanAmount: 0,
        maxInstallment: 0,
        minInstallment: 0
    };

    // بازیابی از پیش‌نویس (به‌جز رمز — که به دلایل امنیتی ذخیره نمی‌شود)
    if (draft && typeof draft === 'object') {
        Object.keys(draft).forEach(function (k) {
            if (k in state && draft[k] !== undefined && draft[k] !== '' &&
                k !== 'password' && k !== 'confirmPassword') {
                state[k] = draft[k];
            }
        });
    }

    // اولویت نهایی: موبایل از URL
    if (urlMobile) state.mobile = urlMobile;

    // ==========================================
    // مراحل
    // ==========================================

    const STEPS = [
        { id: 1, label: 'رمز عبور' },
        { id: 2, label: 'موبایل و کد ملی' },
        { id: 3, label: 'اطلاعات فردی' },
        { id: 4, label: 'محل سکونت' },
        { id: 5, label: 'اطلاعات شغلی' },
        { id: 6, label: 'مبلغ وام' }
    ];

    let currentStep = 1;
    let finishing = false;

    const progressEl = document.getElementById('wizardProgress');
    const contentEl  = document.getElementById('wizardContent');

    // ==========================================
    // توابع کمکی
    // ==========================================

    function parseNumber(v) {
        const n = Number(String(v || '').replace(/[^\d]/g, ''));
        return Number.isFinite(n) ? n : 0;
    }

    function toPersianDigits(str) {
        return String(str).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
    }

    /**
     * الگوریتم دقیق کبیسه شمسی
     * بازه معتبر: ~۱۲۰۶ تا ۱۴۹۸
     */
    function isPersianLeap(year) {
        const y = Number(year);
        if (!y) return false;
        const remainder = (y + 2346) % 2820;
        const mod33 = remainder % 33;
        return [1, 5, 9, 13, 17, 22, 26, 30].includes(mod33);
    }

    function getPersianMonthDays(year, month) {
        month = Number(month);
        if (!month) return 31;
        if (month <= 6) return 31;
        if (month <= 11) return 30;
        return isPersianLeap(year) ? 30 : 29;
    }

    /**
     * ذخیره پیش‌نویس در localStorage
     * ⚠️ رمز و تکرارش ذخیره نمی‌شوند
     */
    function savePending() {
        try {
            const safeState = Object.assign({}, state);
            delete safeState.password;
            delete safeState.confirmPassword;
            localStorage.setItem(KEY_DRAFT, JSON.stringify(safeState));
        } catch (e) {
            console.warn('ذخیره پیش‌نویس ناموفق:', e);
        }
    }

    function clearDraft() {
        try {
            localStorage.removeItem(KEY_DRAFT);
        } catch (e) {}
    }

    // ==========================================
    // نوار پیشرفت
    // ==========================================

    function renderProgress() {
        progressEl.innerHTML = '';

        STEPS.forEach(function (step) {

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'wizard-step';
            btn.dataset.step = step.id;

            if (step.id < currentStep) btn.classList.add('done');
            if (step.id === currentStep) btn.classList.add('active');

            if (step.id !== currentStep) {
                btn.style.cursor = 'pointer';
                btn.addEventListener('click', function () {
                    if (step.id < currentStep) {
                        saveCurrentStep();
                    } else if (step.id > currentStep) {
                        if (!saveCurrentStep()) return;
                    }
                    currentStep = step.id;
                    savePending();
                    render();
                });
            } else {
                btn.style.cursor = 'default';
            }

            btn.innerHTML = `
                <div class="step-number">
                    <span class="step-number-text">${toPersianDigits(step.id)}</span>
                    <span class="step-check">✓</span>
                </div>
                <span class="step-label">${step.label}</span>
            `;

            progressEl.appendChild(btn);
        });
    }

    // ==========================================
    // رندر
    // ==========================================

    function render() {
        try {
            renderProgress();

            switch (currentStep) {
                case 1: contentEl.innerHTML = renderStep1(); bindStep1(); break;
                case 2: contentEl.innerHTML = renderStep2(); bindStep2(); break;
                case 3: contentEl.innerHTML = renderStep3(); bindStep3(); break;
                case 4: contentEl.innerHTML = renderStep4(); bindStep4(); break;
                case 5: contentEl.innerHTML = renderStep5(); bindStep5(); break;
                case 6: contentEl.innerHTML = renderStep6(); bindStep6(); break;
            }

            // فعال‌سازی دکمه‌های چشم رمز (اگر password-toggle.js لود شده)
            if (window.PasswordToggle && window.PasswordToggle.refresh) {
                setTimeout(function () {
                    window.PasswordToggle.refresh();
                }, 100);
            }

            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            console.error('خطا در render:', err);
            contentEl.innerHTML =
                '<p style="color:red;text-align:center;">خطا: ' +
                (err.message || err) + '</p>';
        }
    }

    // ==========================================
    // مرحله ۱: رمز عبور
    // ==========================================

    function renderStep1() {
        return `
            <h2>تعیین رمز عبور</h2>
            <p class="subtitle">یک رمز عبور امن برای حساب خود انتخاب کنید</p>

            <div class="form-group">
                <label>رمز عبور</label>
                <input type="password" id="f_password" value="${state.password}" placeholder="حداقل ۶ کاراکتر">
            </div>

            <div class="form-group">
                <label>تکرار رمز عبور</label>
                <input type="password" id="f_confirmPassword" value="${state.confirmPassword}" placeholder="رمز را دوباره وارد کنید">
            </div>

            <div class="wizard-actions">
                <button type="button" class="btn btn-soft" onclick="doLogout()">
                    ← انصراف از ثبت‌نام
                </button>
                <button type="button" class="btn btn-primary" id="nextBtn">مرحله بعد →</button>
            </div>
        `;
    }

    function bindStep1() {
        const p2 = document.getElementById('f_confirmPassword');
        p2.addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('nextBtn').click();
        });

        document.getElementById('nextBtn').addEventListener('click', function () {
            if (saveStep1()) nextStep();
        });
    }

    function saveStep1() {
        const p1 = document.getElementById('f_password').value.trim();
        const p2 = document.getElementById('f_confirmPassword').value.trim();

        if (!p1) { alert('رمز عبور را وارد کنید.'); return false; }
        if (p1.length < 6) { alert('رمز عبور باید حداقل ۶ کاراکتر باشد.'); return false; }
        if (!p2) { alert('تکرار رمز عبور را وارد کنید.'); return false; }
        if (p1 !== p2) { alert('رمز عبور و تکرارش یکسان نیستند.'); return false; }

        state.password = p1;
        state.confirmPassword = p2;
        return true;
    }

    // ==========================================
    // مرحله ۲: موبایل و کد ملی
    // ==========================================

    function renderStep2() {
        const mobileDisabled = !!initialMobile;
        return `
            <h2>موبایل و کد ملی</h2>
            <p class="subtitle">شماره موبایل و کد ملی خود را وارد کنید</p>

            <div class="form-group">
                <label>شماره موبایل</label>
                <input type="tel" id="f_mobile" value="${state.mobile}"
                    placeholder="09123456789" inputmode="numeric" maxlength="11" ${mobileDisabled ? 'disabled' : ''}>
            </div>

            <div class="form-group">
                <label>کد ملی</label>
                <input type="text" id="f_nationalId" value="${state.nationalId}"
                    placeholder="کد ملی ۱۰ رقمی" inputmode="numeric" maxlength="10">
            </div>

            <div class="wizard-actions">
                <button type="button" class="btn btn-soft" id="prevBtn">← مرحله قبل</button>
                <button type="button" class="btn btn-primary" id="nextBtn">مرحله بعد →</button>
            </div>
        `;
    }

    function bindStep2() {
        const nat = document.getElementById('f_nationalId');
        nat.addEventListener('input', function () {
            nat.value = nat.value.replace(/[^\d]/g, '').slice(0, 10);
        });

        const mob = document.getElementById('f_mobile');
        if (mob && !mob.disabled) {
            mob.addEventListener('input', function () {
                mob.value = mob.value.replace(/[^\d]/g, '').slice(0, 11);
            });
        }

        document.getElementById('prevBtn').addEventListener('click', prevStep);
        document.getElementById('nextBtn').addEventListener('click', function () {
            if (saveStep2()) nextStep();
        });
    }

    function saveStep2() {
        const mob = document.getElementById('f_mobile').value.trim();
        const nat = document.getElementById('f_nationalId').value.trim();

        if (!mob || !/^09[0-9]{9}$/.test(mob)) { alert('شماره موبایل معتبر نیست.'); return false; }
        if (!/^[0-9]{10}$/.test(nat)) { alert('کد ملی باید ۱۰ رقم باشد.'); return false; }

        state.mobile = mob;
        state.nationalId = nat;
        return true;
    }

    // ==========================================
    // مرحله ۳: اطلاعات فردی
    // ==========================================

    function renderStep3() {
        const years = [];
        for (let y = 1330; y <= 1410; y++) years.push(y);
        const months = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];

        const yearOpts = years.map(y =>
            `<option value="${y}" ${state.birthYear == y ? 'selected' : ''}>${toPersianDigits(y)}</option>`
        ).join('');

        const monthOpts = months.map((m, i) =>
            `<option value="${i+1}" ${state.birthMonth == (i+1) ? 'selected' : ''}>${m}</option>`
        ).join('');

        return `
            <h2>اطلاعات فردی</h2>
            <p class="subtitle">نام، نام خانوادگی و تاریخ تولد خود را وارد کنید</p>

            <div class="form-row">
                <div class="form-group">
                    <label>نام</label>
                    <input type="text" id="f_firstName" value="${state.firstName}" placeholder="مثلاً علی">
                </div>
                <div class="form-group">
                    <label>نام خانوادگی</label>
                    <input type="text" id="f_lastName" value="${state.lastName}" placeholder="مثلاً محمدی">
                </div>
            </div>

            <div class="form-group">
                <label>تاریخ تولد (شمسی)</label>
                <div class="birth-row">
                    <select id="f_birthYear"><option value="">سال</option>${yearOpts}</select>
                    <select id="f_birthMonth"><option value="">ماه</option>${monthOpts}</select>
                    <select id="f_birthDay"><option value="">روز</option></select>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>جنسیت</label>
                    <select id="f_gender">
                        <option value="">انتخاب کنید</option>
                        <option value="male" ${state.gender==='male'?'selected':''}>مرد</option>
                        <option value="female" ${state.gender==='female'?'selected':''}>زن</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>وضعیت تأهل</label>
                    <select id="f_maritalStatus">
                        <option value="">انتخاب کنید</option>
                        <option value="single" ${state.maritalStatus==='single'?'selected':''}>مجرد</option>
                        <option value="married" ${state.maritalStatus==='married'?'selected':''}>متأهل</option>
                    </select>
                </div>
            </div>

            <div class="wizard-actions">
                <button type="button" class="btn btn-soft" id="prevBtn">← مرحله قبل</button>
                <button type="button" class="btn btn-primary" id="nextBtn">مرحله بعد →</button>
            </div>
        `;
    }

    function bindStep3() {
        const yearSel  = document.getElementById('f_birthYear');
        const monthSel = document.getElementById('f_birthMonth');
        const daySel   = document.getElementById('f_birthDay');

        function updateDays() {
            const year  = yearSel.value;
            const month = monthSel.value;
            const selectedDay = state.birthDay;

            let maxDay = 31;
            if (year && month) maxDay = getPersianMonthDays(year, month);
            else if (month) maxDay = getPersianMonthDays(1399, month);

            let opts = '<option value="">روز</option>';
            for (let d = 1; d <= maxDay; d++) {
                opts += `<option value="${d}" ${selectedDay == d ? 'selected' : ''}>${toPersianDigits(d)}</option>`;
            }
            daySel.innerHTML = opts;
        }

        yearSel.addEventListener('change', updateDays);
        monthSel.addEventListener('change', updateDays);
        updateDays();

        document.getElementById('prevBtn').addEventListener('click', prevStep);
        document.getElementById('nextBtn').addEventListener('click', function () {
            if (saveStep3()) nextStep();
        });
    }

    function saveStep3() {
        const fn = document.getElementById('f_firstName').value.trim();
        const ln = document.getElementById('f_lastName').value.trim();
        const by = document.getElementById('f_birthYear').value;
        const bm = document.getElementById('f_birthMonth').value;
        const bd = document.getElementById('f_birthDay').value;
        const g  = document.getElementById('f_gender').value;
        const ms = document.getElementById('f_maritalStatus').value;

        if (!fn || fn.length < 2) { alert('نام معتبر وارد کنید.'); return false; }
        if (!ln || ln.length < 2) { alert('نام خانوادگی معتبر وارد کنید.'); return false; }
        if (!by || !bm || !bd) { alert('تاریخ تولد را کامل کنید.'); return false; }
        if (!g)  { alert('جنسیت را انتخاب کنید.'); return false; }
        if (!ms) { alert('وضعیت تأهل را انتخاب کنید.'); return false; }

        state.firstName = fn;
        state.lastName = ln;
        state.birthYear = by;
        state.birthMonth = bm;
        state.birthDay = bd;
        state.gender = g;
        state.maritalStatus = ms;
        return true;
    }

    // ==========================================
    // مرحله ۴: محل سکونت
    // ==========================================

    function renderStep4() {
        return `
            <h2>محل سکونت</h2>
            <p class="subtitle">استان، شهر و آدرس خود را وارد کنید</p>

            <div class="form-row">
                <div class="form-group">
                    <label>استان</label>
                    <input type="text" id="f_province" value="${state.province}" placeholder="مثلاً تهران">
                </div>
                <div class="form-group">
                    <label>شهر</label>
                    <input type="text" id="f_city" value="${state.city}" placeholder="مثلاً تهران">
                </div>
            </div>

            <div class="form-group">
                <label>آدرس</label>
                <textarea id="f_address" placeholder="آدرس کامل محل سکونت">${state.address}</textarea>
            </div>

            <div class="wizard-actions">
                <button type="button" class="btn btn-soft" id="prevBtn">← مرحله قبل</button>
                <button type="button" class="btn btn-primary" id="nextBtn">مرحله بعد →</button>
            </div>
        `;
    }

    function bindStep4() {
        document.getElementById('prevBtn').addEventListener('click', prevStep);
        document.getElementById('nextBtn').addEventListener('click', function () {
            if (saveStep4()) nextStep();
        });
    }

    function saveStep4() {
        const p = document.getElementById('f_province').value.trim();
        const c = document.getElementById('f_city').value.trim();
        const a = document.getElementById('f_address').value.trim();

        if (!p) { alert('استان را وارد کنید.'); return false; }
        if (!c) { alert('شهر را وارد کنید.'); return false; }
        if (!a || a.length < 5) { alert('آدرس کامل را وارد کنید.'); return false; }

        state.province = p;
        state.city = c;
        state.address = a;
        return true;
    }

    // ==========================================
    // مرحله ۵: اطلاعات شغلی
    // ==========================================

    function renderStep5() {
        return `
            <h2>اطلاعات شغلی</h2>
            <p class="subtitle">شغل و درآمد ماهیانه خود را وارد کنید</p>

            <div class="form-group">
                <label>شغل</label>
                <input type="text" id="f_job" value="${state.job}" placeholder="مثلاً کارمند">
            </div>

            <div class="form-group">
                <label>درآمد ماهیانه خالص</label>
                <div class="input-with-unit">
                    <input type="text" id="f_income"
                        value="${state.income ? state.income.toLocaleString('en-US') : ''}"
                        placeholder="مثلاً 15,000,000" inputmode="numeric">
                    <span>تومان</span>
                </div>
            </div>

            <div class="wizard-actions">
                <button type="button" class="btn btn-soft" id="prevBtn">← مرحله قبل</button>
                <button type="button" class="btn btn-primary" id="nextBtn">مرحله بعد →</button>
            </div>
        `;
    }

    function bindStep5() {
        const incomeInput = document.getElementById('f_income');
        incomeInput.addEventListener('input', function () {
            const raw = incomeInput.value.replace(/[^\d]/g, '');
            incomeInput.value = raw ? Number(raw).toLocaleString('en-US') : '';
        });

        document.getElementById('prevBtn').addEventListener('click', prevStep);
        document.getElementById('nextBtn').addEventListener('click', function () {
            if (saveStep5()) nextStep();
        });
    }

    function saveStep5() {
        const job = document.getElementById('f_job').value.trim();
        const inc = parseNumber(document.getElementById('f_income').value);

        if (!job) { alert('شغل را وارد کنید.'); return false; }
        if (inc <= 0) { alert('درآمد ماهیانه را وارد کنید.'); return false; }

        state.job = job;
        state.income = inc;
        return true;
    }

    // ==========================================
    // مرحله ۶: مبلغ وام
    // ==========================================

    function renderStep6() {
        return `
            <h2>مبلغ وام و توان بازپرداخت</h2>
            <p class="subtitle">مبلغ درخواستی و بازهٔ قسط ماهیانه را وارد کنید</p>

            <div class="form-group">
                <label>مبلغ وام درخواستی</label>
                <div class="input-with-unit">
                    <input type="text" id="f_loanAmount"
                        value="${state.loanAmount ? state.loanAmount.toLocaleString('en-US') : ''}"
                        placeholder="مثلاً 250,000,000" inputmode="numeric">
                    <span>تومان</span>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>حداکثر قسط ماهیانه</label>
                    <div class="input-with-unit">
                        <input type="text" id="f_maxInstallment"
                            value="${state.maxInstallment ? state.maxInstallment.toLocaleString('en-US') : ''}"
                            placeholder="مثلاً 8,000,000" inputmode="numeric">
                        <span>تومان</span>
                    </div>
                </div>
                <div class="form-group">
                    <label>حداقل قسط ماهیانه</label>
                    <div class="input-with-unit">
                        <input type="text" id="f_minInstallment"
                            value="${state.minInstallment ? state.minInstallment.toLocaleString('en-US') : ''}"
                            placeholder="مثلاً 3,000,000" inputmode="numeric">
                        <span>تومان</span>
                    </div>
                </div>
            </div>

            <div class="wizard-actions">
                <button type="button" class="btn btn-soft" id="prevBtn">← مرحله قبل</button>
                <button type="button" class="btn btn-primary" id="finishBtn">✅ تکمیل ثبت‌نام</button>
            </div>
        `;
    }

    function bindStep6() {
        ['f_loanAmount', 'f_maxInstallment', 'f_minInstallment'].forEach(function (id) {
            const el = document.getElementById(id);
            el.addEventListener('input', function () {
                const raw = el.value.replace(/[^\d]/g, '');
                el.value = raw ? Number(raw).toLocaleString('en-US') : '';
            });
        });

        document.getElementById('prevBtn').addEventListener('click', prevStep);

        const finishBtn = document.getElementById('finishBtn');
        finishBtn.addEventListener('click', function () {
            if (finishBtn.disabled) return;

            const prevText = finishBtn.textContent;
            finishBtn.disabled = true;
            finishBtn.textContent = '⏳ در حال ثبت...';

            finish().finally(function () {
                finishBtn.disabled = false;
                finishBtn.textContent = prevText;
            });
        });
    }

    function saveStep6() {
        const amt  = parseNumber(document.getElementById('f_loanAmount').value);
        const maxI = parseNumber(document.getElementById('f_maxInstallment').value);
        const minI = parseNumber(document.getElementById('f_minInstallment').value);

        if (amt <= 0)  { alert('مبلغ وام را وارد کنید.'); return false; }
        if (maxI <= 0) { alert('حداکثر قسط را وارد کنید.'); return false; }
        if (minI <= 0) { alert('حداقل قسط را وارد کنید.'); return false; }
        if (minI > maxI) { alert('حداقل قسط نباید از حداکثر بیشتر باشد.'); return false; }

        state.loanAmount = amt;
        state.maxInstallment = maxI;
        state.minInstallment = minI;
        return true;
    }

    // ==========================================
    // ناوبری
    // ==========================================

    function saveCurrentStep() {
        try {
            if (currentStep === 1) return saveStep1();
            if (currentStep === 2) return saveStep2();
            if (currentStep === 3) return saveStep3();
            if (currentStep === 4) return saveStep4();
            if (currentStep === 5) return saveStep5();
            if (currentStep === 6) return saveStep6();
        } catch (e) {
            console.warn(e);
        }
        return true;
    }

    function nextStep() {
        if (currentStep < STEPS.length) {
            savePending();
            currentStep++;
            render();
        }
    }

    function prevStep() {
        saveCurrentStep();
        savePending();
        if (currentStep > 1) {
            currentStep--;
            render();
        }
    }

    // ==========================================
    // خروج / انصراف — یکپارچه و سراسری
    // ==========================================

    window.doLogout = function () {
        if (!confirm('از ثبت‌نام منصرف می‌شوید؟')) return;

        try {
            localStorage.removeItem(KEY_TOKEN);
            localStorage.removeItem(KEY_USER);
            localStorage.removeItem(KEY_PENDING);
            localStorage.removeItem(KEY_DRAFT);
        } catch (e) {}

        window.location.href = 'login.html';
    };

    // سازگاری با نسخه قبلی
    window.goBackToLogin = window.doLogout;

    // ==========================================
    // پایان — خلاصه + هش رمز + ذخیره در Auth
    // ==========================================

    function buildSummary() {
        const fmt = (n) => Number(n || 0).toLocaleString('fa-IR');
        const genderLabel  = state.gender === 'male' ? 'مرد' : 'زن';
        const maritalLabel = state.maritalStatus === 'single' ? 'مجرد' : 'متأهل';

        return '📋 خلاصه اطلاعات شما:\n\n' +
            '👤 نام: ' + state.firstName + ' ' + state.lastName + '\n' +
            '📱 موبایل: ' + state.mobile + '\n' +
            '🆔 کد ملی: ' + state.nationalId + '\n' +
            '🎂 تولد: ' + toPersianDigits(state.birthYear) + '/' +
                            toPersianDigits(state.birthMonth) + '/' +
                            toPersianDigits(state.birthDay) + '\n' +
            '⚥ جنسیت: ' + genderLabel + ' — ' + maritalLabel + '\n' +
            '🏠 سکونت: ' + state.province + ' — ' + state.city + '\n' +
            '💼 شغل: ' + state.job + '\n' +
            '💰 درآمد: ' + fmt(state.income) + ' تومان\n' +
            '🏦 مبلغ وام: ' + fmt(state.loanAmount) + ' تومان\n' +
            '📅 قسط: ' + fmt(state.minInstallment) + ' تا ' +
                          fmt(state.maxInstallment) + ' تومان\n\n' +
            'آیا از ثبت‌نام مطمئن هستید؟';
    }

    async function finish() {
        if (finishing) return;
        if (!saveStep6()) return;

        // چک رمز (چون در draft ذخیره نمی‌شود، ممکن است بعد از رفرش خالی باشد)
        if (!state.password || state.password.length < 6) {
            alert('رمز عبور تنظیم نشده است.\nلطفاً به مرحله ۱ برگردید و رمز را وارد کنید.');
            currentStep = 1;
            render();
            return;
        }

        // تأیید نهایی با خلاصه اطلاعات
        if (!confirm(buildSummary())) return;

        finishing = true;

        try {
            // چک تکراری بودن موبایل (از Auth)
            if (Auth.userExists(state.mobile, 'applicant')) {
                alert('⚠️ این شماره موبایل قبلاً به عنوان متقاضی ثبت شده است.\n\nحالا با موبایل و رمز خود وارد شوید.');
                setTimeout(function () {
                    window.location.href = 'login.html';
                }, 1500);
                return;
            }

            // هش کردن رمز عبور با SHA-256
            const hashedPassword = await Auth.hashPassword(state.password);

            const now = new Date().toISOString();

            const newUser = {
                id: Auth.generateId('user_'),
                mobile: state.mobile,
                password: hashedPassword,
                role: 'applicant',
                name: state.firstName + ' ' + state.lastName,
                nationalId: state.nationalId,
                firstName: state.firstName,
                lastName: state.lastName,
                birthDate: state.birthYear + '/' + state.birthMonth + '/' + state.birthDay,
                gender: state.gender,
                maritalStatus: state.maritalStatus,
                province: state.province,
                city: state.city,
                address: state.address,
                job: state.job,
                income: state.income,
                loanAmount: state.loanAmount,
                maxInstallment: state.maxInstallment,
                minInstallment: state.minInstallment,
                status: 'active',
                mustChangePassword: false,
                createdAt: now,
                updatedAt: now,
                lastLoginAt: now
            };

            // ذخیره از طریق Auth (نه localStorage مستقیم)
            const users = Auth.getUsers();
            users.push(newUser);
            Auth.saveUsers(users);

            // پاک‌سازی پیش‌نویس و pending
            clearDraft();
            try { localStorage.removeItem(KEY_PENDING); } catch (e) {}

            // خودکار لاگین
            const token = 'token_' + Date.now() + '_' +
                          Math.random().toString(36).substr(2, 9);

            localStorage.setItem(KEY_TOKEN, token);
            Auth.setCurrentUser(newUser);

            console.log('✅ کاربر جدید ثبت و لاگین شد:', newUser.id);

            alert('🎉 خوش آمدید ' + newUser.name + '!\n\nثبت‌نام شما با موفقیت انجام شد.\nاکنون وارد پنل متقاضی می‌شوید.');

            // هدایت به داشبورد از طریق Auth
            const target = Auth.getRoleDashboard('applicant');

            setTimeout(function () {
                window.location.href = target;
            }, 500);

        } catch (err) {
            console.error('خطا در finish:', err);
            alert('خطا در ثبت‌نام: ' + (err.message || 'ناشناخته'));
            finishing = false;
        }
    }

    // ==========================================
    // اجرای اولیه
    // ==========================================

    render();

    console.log('✅ ویزارد ۶ مرحله‌ای v3 آماده — یکپارچه با WamPayAuth');
});