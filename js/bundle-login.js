/* ==========================================
 * WAM PAY — 🔐 Login Bundle v6
 * ==========================================
 * 
 * Bundle خودکار
 * تعداد فایل: 2
 * 
 * برای صفحات: forgot-password, register, reset-password
 * 
 * نسخه ۶: ورود متقاضی با OTP + ساخت خودکار کاربر
 *         بدون applicant-register.html
 * ========================================== */




/* ==========================================
 * FROM: js/password-toggle.js
 * ========================================== */


// ==========================================
// وام پی — Password Toggle
// ابزار عمومی نمایش/پنهان کردن رمز
// نسخه ۲: رنگ‌های برند + رفع تصادم !important
// ==========================================

(function () {
    'use strict';

    function injectStyles() {
        if (document.getElementById('pwd-toggle-styles')) return;
        const style = document.createElement('style');
        style.id = 'pwd-toggle-styles';
        style.textContent = `
            .pwd-wrapper { position: relative; display: block; width: 100%; }
            .pwd-wrapper:not(.input-with-unit) input[type="password"],
            .pwd-wrapper:not(.input-with-unit) input[type="text"].pwd-input { padding-left: 46px !important; }
            .pwd-toggle-btn {
                position: absolute; left: 8px; top: 50%; transform: translateY(-50%);
                width: 36px; height: 36px; border-radius: 50%; border: none;
                background: transparent; color: var(--muted, #77847b);
                font-size: 18px; line-height: 1; cursor: pointer;
                display: grid; place-items: center;
                transition: background 0.2s ease, color 0.2s ease, transform 0.15s ease;
                padding: 0; font-family: inherit; z-index: 2;
                -webkit-tap-highlight-color: transparent; touch-action: manipulation;
            }
            .pwd-toggle-btn:hover { background: rgba(11, 59, 35, 0.08); color: var(--primary, #0b3b23); }
            .pwd-toggle-btn:active { transform: translateY(-50%) scale(0.9); }
            .pwd-toggle-btn.visible { color: var(--gold, #d4a62a); background: rgba(212, 166, 42, 0.12); }
            [data-theme="dark"] .pwd-toggle-btn { color: rgba(255, 255, 255, 0.6); }
            [data-theme="dark"] .pwd-toggle-btn:hover { color: #a7d7b8; background: rgba(167, 215, 184, 0.12); }
            [data-theme="dark"] .pwd-toggle-btn.visible { color: var(--gold, #d4a62a); background: rgba(212, 166, 42, 0.18); }
        `;
        document.head.appendChild(style);
    }

    function enhance() {
        const inputs = document.querySelectorAll('input[type="password"]');
        inputs.forEach(function (input) {
            if (input.dataset.pwdEnhanced === 'true') return;
            input.dataset.pwdEnhanced = 'true';
            const parent = input.parentNode;
            if (!parent) return;
            const wrapper = document.createElement('div');
            wrapper.className = 'pwd-wrapper';
            if (parent.classList.contains('input-with-unit')) {
                wrapper.classList.add('input-with-unit');
            }
            parent.insertBefore(wrapper, input);
            wrapper.appendChild(input);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pwd-toggle-btn';
            btn.innerHTML = '👁';
            btn.setAttribute('aria-label', 'نمایش رمز');
            btn.setAttribute('title', 'نمایش / پنهان کردن رمز');
            btn.setAttribute('tabindex', '-1');
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                if (!isPassword) input.classList.remove('pwd-input');
                else input.classList.add('pwd-input');
                btn.innerHTML = isPassword ? '🙈' : '👁';
                btn.classList.toggle('visible', isPassword);
                btn.setAttribute('aria-label', isPassword ? 'پنهان کردن رمز' : 'نمایش رمز');
                input.focus();
                setTimeout(function () {
                    const len = input.value.length;
                    try { input.setSelectionRange(len, len); } catch (_) {}
                }, 10);
            });
            wrapper.appendChild(btn);
        });
    }

    function init() {
        injectStyles();
        enhance();
        const observer = new MutationObserver(function (mutations) {
            let shouldEnhance = false;
            mutations.forEach(function (m) {
                if (m.addedNodes && m.addedNodes.length > 0) {
                    m.addedNodes.forEach(function (node) {
                        if (node.nodeType === 1) {
                            if (node.tagName === 'INPUT' && node.type === 'password') shouldEnhance = true;
                            if (node.querySelector && node.querySelector('input[type="password"]')) shouldEnhance = true;
                        }
                    });
                }
            });
            if (shouldEnhance) setTimeout(enhance, 50);
        });
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        }
        console.log('👁 PasswordToggle v2 آماده');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.PasswordToggle = {
        enhance: enhance,
        refresh: function () { enhance(); }
    };
})();




/* ==========================================
 * FROM: js/login.js v6
 * ========================================== */


// ==========================================
// وام پی — ورود
// نسخه ۶: ورود متقاضی با OTP + ساخت خودکار کاربر
// ==========================================

(function () {
    'use strict';

    if (!window.WamPayAuth) { console.error('❌ permissions.js بارگذاری نشده!'); return; }
    if (!window.WamPayOTP)  { console.error('❌ otp-service.js بارگذاری نشده!'); return; }

    const Auth = window.WamPayAuth;
    const OTP  = window.WamPayOTP;
    const ADMIN_ROLES = ['super_admin', 'admin', 'verifier'];

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

    function createApplicantUser(mobile) {
        const users = Auth.getUsers();
        const newUser = {
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
        users.push(newUser);
        Auth.saveUsers(users);
        console.log('🆕 کاربر متقاضی خودکار ساخته شد:', { id: newUser.id, mobile: newUser.mobile });
        return newUser;
    }

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

    [loginMobile].forEach(input => {
        if (!input) return;
        input.addEventListener('input', function () {
            this.value = this.value.replace(/[^\d]/g, '').slice(0, 11);
        });
    });

    if (loginMobile) {
        loginMobile.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            if (isAdminRole()) { if (loginPassword) loginPassword.focus(); }
            else { doSendOTP(); }
        });
    }
    if (loginPassword) loginPassword.addEventListener('keydown', e => { if (e.key === 'Enter') doAdminLogin(); });

    if (loginBtn) loginBtn.addEventListener('click', () => { isAdminRole() ? doAdminLogin() : doSendOTP(); });
    if (forgotPasswordLink) forgotPasswordLink.addEventListener('click', e => { e.preventDefault(); doForgotPassword(); });

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

    console.log('🔐 login.js v6 آماده — متقاضی با ساخت خودکار + OTP');
})();




/* ==========================================
 * END OF BUNDLE — v6
 * ========================================== */