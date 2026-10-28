// ==========================================
// وام پی — ورود
// نسخه ۸: افزودن متقاضی خودکار از پرونده‌های کارگزار
// ==========================================

(function () {
    'use strict';

    if (!window.WamPayAuth) { console.error('❌ permissions.js بارگذاری نشده!'); return; }
    if (!window.WamPayOTP)  { console.error('❌ otp-service.js بارگذاری نشده!'); return; }

    const Auth = window.WamPayAuth;
    const OTP  = window.WamPayOTP;
    const ADMIN_ROLES = ['super_admin', 'admin', 'verifier'];

    // ==========================================
    // متن‌های دکمه
    // ==========================================
    const BTN_TEXT = {
        applicant: 'ورود و ثبت‌نام',
        broker:    'ورود و ثبت‌نام',
        admin:     'ورود',
        loading:   'در حال ارسال کد...',
        checking:  'در حال بررسی...',
        redirect:  'در حال انتقال...'
    };

    const authTabs  = document.querySelectorAll('.auth-tab');
    const roleBtns  = document.querySelectorAll('.role-btn');
    const loginForm       = document.getElementById('loginForm');
    const registerForm    = document.getElementById('registerForm');
    const loginFormTitle  = document.getElementById('loginFormTitle');
    const adminHint       = document.getElementById('adminHint');
    const loginMobile        = document.getElementById('loginMobile');
    const loginPasswordField = document.getElementById('loginPasswordField');
    const loginPassword      = document.getElementById('loginPassword');
    const loginBtn           = document.getElementById('loginBtn');
    const loginMessage       = document.getElementById('loginMessage');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const setupLink          = document.getElementById('setupLink');

    let currentTab  = 'login';
    let currentRole = 'applicant';
    let loginBusy   = false;

    function isValidMobile(m) { return /^09[0-9]{9}$/.test(m); }
    function isAdminRole()    { return currentRole === 'admin'; }
    function roleText(role)   { return role === 'admin' ? 'ادمین' : (Auth.getRoleLabel ? Auth.getRoleLabel(role) : role); }

    function defaultBtnText() {
        return isAdminRole() ? BTN_TEXT.admin : BTN_TEXT.applicant;
    }

    function showMessage(el, text, type) {
        if (!el) return;
        el.hidden = false;
        el.textContent = text;
        el.classList.remove('error', 'success');
        el.classList.add(type);
    }
    function hideMessage(el) { if (!el) return; el.hidden = true; el.textContent = ''; }
    function hideAllMessages() { hideMessage(loginMessage); }

    function setLoginBusy(busy, label) {
        loginBusy = busy;
        if (!loginBtn) return;
        loginBtn.disabled = busy;
        if (label) loginBtn.textContent = label;
        else loginBtn.textContent = defaultBtnText();
    }

    function findUser(mobile, role) {
        const users = Auth.getUsers();
        if (role === 'admin') {
            return users.find(u => u.mobile === mobile && ADMIN_ROLES.includes(u.role));
        }
        return users.find(u => u.mobile === mobile && u.role === role);
    }

    // ==========================================
    // 🆕 ساخت/بازیابی متقاضی
    // اول: چک پرونده‌های کارگزار (source: broker_referral)
    // دوم: چک کاربران قبلی (wamPayUsers)
    // سوم: ساخت کاربر ساده خودکار
    // ==========================================
    function findApplicantInCases(mobile) {
        try {
            const cases = JSON.parse(localStorage.getItem('wamPayApplications') || '[]');
            const matched = cases.find(c =>
                c.applicantData?.mobile === mobile &&
                c.source === 'broker_referral'
            );
            return matched || null;
        } catch (e) {
            console.warn('⚠️ [Login] خطا در خواندن پرونده‌ها:', e.message);
            return null;
        }
    }

    function createApplicantUser(mobile) {
        const users = Auth.getUsers();
        let newUser = null;

        // ۱. تلاش برای یافتن در پرونده‌های کارگزار
        const matchedCase = findApplicantInCases(mobile);

        if (matchedCase) {
            newUser = {
                id: 'applicant_' + matchedCase.id,
                mobile: mobile,
                name: matchedCase.applicantData.name || ('کاربر ' + mobile.slice(-4)),
                firstName: matchedCase.applicantData.firstName || '',
                lastName: matchedCase.applicantData.lastName || '',
                nationalId: matchedCase.applicantData.nationalId || '',
                role: 'applicant',
                status: 'active',
                source: 'broker_referral',
                brokerId: matchedCase.brokerId || null,
                brokerName: matchedCase.brokerName || null,
                linkedCaseId: matchedCase.id,
                caseNumber: matchedCase.caseNumber || null,
                password: null,
                mustChangePassword: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                lastLoginAt: null,
                autoCreated: true,
                fromBrokerCase: true
            };
            console.log('✅ [Login] متقاضی از پرونده‌ی کارگزار پیدا شد:', {
                caseNumber: matchedCase.caseNumber,
                broker: matchedCase.brokerName,
                applicant: newUser.name
            });
        }

        // ۲. اگه پیدا نشد، کاربر ساده بساز
        if (!newUser) {
            newUser = {
                id: Auth.generateId ? Auth.generateId('user_') :
                    'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                mobile: mobile,
                name: 'کاربر ' + mobile.slice(-4),
                role: 'applicant',
                status: 'active',
                password: null,
                mustChangePassword: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                lastLoginAt: null,
                autoCreated: true
            };
            console.log('🆕 [Login] کاربر متقاضی ساده ساخته شد:', { id: newUser.id, mobile: newUser.mobile });
        }

        users.push(newUser);
        Auth.saveUsers(users);
        return newUser;
    }

    // ==========================================
    // تب‌ها
    // ==========================================
    authTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-tab');
            if (target === currentTab) return;
            if (currentRole === 'admin' && target === 'register') return;
            currentTab = target;
            authTabs.forEach(t => t.classList.toggle('active', t === tab));
            hideAllMessages();
            if (target === 'login') {
                if (loginForm) loginForm.hidden = false;
                if (registerForm) registerForm.hidden = true;
                loginMobile && loginMobile.focus();
            } else {
                if (loginForm) loginForm.hidden = true;
                if (registerForm) registerForm.hidden = false;
            }
        });
    });

    // ==========================================
    // نقش‌ها
    // ==========================================
    roleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const role = btn.getAttribute('data-role');
            if (role === currentRole) return;
            currentRole = role;
            roleBtns.forEach(b => b.classList.toggle('active', b === btn));

            const registerTab = document.querySelector('.auth-tab[data-tab="register"]');

            if (isAdminRole()) {
                if (registerTab) registerTab.style.display = 'none';
                if (currentTab === 'register') {
                    currentTab = 'login';
                    authTabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === 'login'));
                    if (loginForm) loginForm.hidden = false;
                    if (registerForm) registerForm.hidden = true;
                }
                adminHint && (adminHint.hidden = false);
                loginPasswordField && loginPasswordField.classList.remove('hidden');
                forgotPasswordLink && forgotPasswordLink.classList.remove('hidden');
                loginFormTitle && (loginFormTitle.textContent = 'ورود ادمین');
                loginMobile && (loginMobile.placeholder = 'شماره موبایل ادمین');
                loginBtn && (loginBtn.textContent = BTN_TEXT.admin);
            } else {
                if (registerTab) registerTab.style.display = 'none';
                adminHint && (adminHint.hidden = true);
                loginPasswordField && loginPasswordField.classList.add('hidden');
                forgotPasswordLink && forgotPasswordLink.classList.add('hidden');
                loginFormTitle && (loginFormTitle.textContent = 'ورود به حساب');
                loginMobile && (loginMobile.placeholder = '09123456789');
                loginBtn && (loginBtn.textContent = BTN_TEXT.applicant);
            }
            hideAllMessages();
        });
    });

    // ==========================================
    // ارسال OTP
    // ==========================================
    async function doSendOTP() {
        if (loginBusy) return;
        hideAllMessages();
        const mobile = (loginMobile.value || '').trim();

        if (!mobile) { showMessage(loginMessage, 'لطفاً شماره موبایل را وارد کنید.', 'error'); loginMobile.focus(); return; }
        if (!isValidMobile(mobile)) { showMessage(loginMessage, 'شماره موبایل معتبر نیست.', 'error'); loginMobile.focus(); return; }

        let user = findUser(mobile, currentRole);

        if (!user && currentRole === 'applicant') {
            user = createApplicantUser(mobile);
        }

        if (!user) {
            if (currentRole === 'broker') {
                showMessage(loginMessage, 'کارگزار گرامی، لطفاً ابتدا از طریق فرم ثبت‌نام کارگزار ثبت‌نام کنید.', 'error');
            } else {
                showMessage(loginMessage, 'کاربری با این شماره ثبت نشده.', 'error');
            }
            return;
        }

        if (user.status === 'suspended') { showMessage(loginMessage, '⛔ حساب شما مسدود شده است. با پشتیبانی تماس بگیرید.', 'error'); return; }
        if (user.status === 'pending') { showMessage(loginMessage, '⏳ حساب شما در انتظار تأیید است. لطفاً منتظر بمانید.', 'error'); return; }

        setLoginBusy(true, BTN_TEXT.loading);
        const res = await OTP.send(mobile, currentRole);

        if (!res.ok) {
            setLoginBusy(false);
            showMessage(loginMessage, res.message || 'ارسال کد ناموفق بود.', 'error');
            return;
        }

        try {
            sessionStorage.setItem('wamPayOTPPending', JSON.stringify({
                mobile: mobile, role: currentRole, userId: user.id, sentAt: Date.now()
            }));
        } catch (_) {}

        let msg = '✅ کد ' + OTP.CONFIG.length + ' رقمی به شماره‌ی شما ارسال شد.';
        if (res.mock && res.code && OTP.CONFIG.showMockCodeInUI) {
            msg += ' (کد تست: ' + res.code + ')';
        }
        showMessage(loginMessage, msg, 'success');

        setLoginBusy(true, BTN_TEXT.redirect);
        setTimeout(() => {
            window.location.href = 'verify-otp.html?mobile=' + encodeURIComponent(mobile);
        }, 800);
    }

    // ==========================================
    // ورود ادمین
    // ==========================================
    async function doAdminLogin() {
        if (loginBusy) return;
        hideAllMessages();
        const mobile   = (loginMobile.value || '').trim();
        const password = (loginPassword.value || '').trim();

        if (!mobile || !isValidMobile(mobile)) { showMessage(loginMessage, 'شماره موبایل معتبر نیست.', 'error'); loginMobile.focus(); return; }
        if (!password) { showMessage(loginMessage, 'لطفاً رمز عبور را وارد کنید.', 'error'); loginPassword.focus(); return; }

        const user = findUser(mobile, 'admin');
        if (!user) { showMessage(loginMessage, 'کاربری با این شماره در نقش ادمین پیدا نشد.', 'error'); return; }
        if (!user.password) { showMessage(loginMessage, 'برای این حساب رمز تنظیم نشده است.', 'error'); return; }

        setLoginBusy(true, BTN_TEXT.checking);
        let ok = false;
        try { ok = await Auth.verifyPassword(password, user.password); }
        catch (e) { console.error(e); ok = false; }

        if (!ok) {
            setLoginBusy(false);
            showMessage(loginMessage, 'رمز عبور اشتباه است.', 'error');
            loginPassword.value = '';
            loginPassword.focus();
            return;
        }

        if (user.status === 'suspended') { setLoginBusy(false); showMessage(loginMessage, '⛔ حساب مسدود است.', 'error'); return; }

        if (Auth.isHashed && !Auth.isHashed(user.password)) {
            try {
                const hash = await Auth.hashPassword(password);
                const users = Auth.getUsers();
                const i = users.findIndex(u => u.id === user.id);
                if (i !== -1) { users[i].password = hash; users[i].updatedAt = new Date().toISOString(); Auth.saveUsers(users); user.password = hash; }
            } catch (_) {}
        }

        const token = 'token_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
        localStorage.setItem('wamPayToken', token);

        const users = Auth.getUsers();
        const i = users.findIndex(u => u.id === user.id);
        if (i !== -1) { users[i].lastLoginAt = new Date().toISOString(); Auth.saveUsers(users); user = users[i]; }

        Auth.setCurrentUser(user);

        showMessage(loginMessage, '✅ خوش آمدید ' + (user.name || user.mobile) + '!', 'success');
        setLoginBusy(true, BTN_TEXT.redirect);

        setTimeout(() => {
            if (user.mustChangePassword) { window.location.href = 'change-password.html'; return; }
            window.location.href = Auth.getRoleDashboard(user.role);
        }, 700);
    }

    // ==========================================
    // فراموشی رمز
    // ==========================================
    async function doForgotPassword() {
        hideAllMessages();
        const mobile = (loginMobile.value || '').trim();
        if (!mobile || !isValidMobile(mobile)) { showMessage(loginMessage, 'ابتدا شماره موبایل معتبر وارد کنید.', 'error'); loginMobile.focus(); return; }

        const user = findUser(mobile, 'admin');
        if (!user) { showMessage(loginMessage, 'کاربری با این مشخصات یافت نشد.', 'error'); return; }

        const np = prompt('رمز عبور جدید (حداقل ۶ کاراکتر):');
        if (np === null) return;
        if (!np || np.length < 6) { showMessage(loginMessage, 'رمز باید حداقل ۶ کاراکتر باشد.', 'error'); return; }

        try {
            const hashed = await Auth.hashPassword(np);
            const users = Auth.getUsers();
            const i = users.findIndex(u => u.id === user.id);
            if (i === -1) { showMessage(loginMessage, 'خطا در یافتن کاربر.', 'error'); return; }
            users[i].password = hashed;
            users[i].updatedAt = new Date().toISOString();
            Auth.saveUsers(users);
            showMessage(loginMessage, '✅ رمز تغییر یافت. حالا وارد شوید.', 'success');
        } catch (e) {
            console.error(e);
            showMessage(loginMessage, 'خطا در تغییر رمز.', 'error');
        }
    }

    function checkSetupStatus() {
        if (!setupLink) return;
        const has = Auth.hasSuperAdmin();
        setupLink.hidden = !!has;
    }

    // ==========================================
    // فیلتر ورودی موبایل
    // ==========================================
    [loginMobile].forEach(input => {
        if (!input) return;
        input.addEventListener('input', function () {
            this.value = this.value.replace(/[^\d]/g, '').slice(0, 11);
        });
    });

    // ==========================================
    // کلید Enter
    // ==========================================
    if (loginMobile) {
        loginMobile.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            if (isAdminRole()) { if (loginPassword) loginPassword.focus(); }
            else { doSendOTP(); }
        });
    }
    if (loginPassword) loginPassword.addEventListener('keydown', e => { if (e.key === 'Enter') doAdminLogin(); });

    // ==========================================
    // رویداد دکمه
    // ==========================================
    if (loginBtn) loginBtn.addEventListener('click', () => { isAdminRole() ? doAdminLogin() : doSendOTP(); });
    if (forgotPasswordLink) forgotPasswordLink.addEventListener('click', e => { e.preventDefault(); doForgotPassword(); });

    // ==========================================
    // اجرای اولیه
    // ==========================================
    document.addEventListener('DOMContentLoaded', () => {
        checkSetupStatus();
        const msg = sessionStorage.getItem('wamPayLoginMessage');
        if (msg) { showMessage(loginMessage, msg, 'error'); sessionStorage.removeItem('wamPayLoginMessage'); }

        const params = new URLSearchParams(window.location.search);
        if (params.get('setup') === 'success') {
            showMessage(loginMessage, '✅ مدیر ارشد ساخته شد. حالا وارد شوید.', 'success');
        }
        if (params.get('otp') === 'cancel') {
            showMessage(loginMessage, 'ورود لغو شد. می‌توانید دوباره تلاش کنید.', 'error');
        }
        if (loginMobile) setTimeout(() => loginMobile.focus(), 200);
    });

    console.log('🔐 login.js v8 آماده — پشتیبانی از متقاضی کارگزار');
})();