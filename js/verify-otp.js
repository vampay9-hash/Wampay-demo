// ==========================================
// وام پی — Verify OTP
// نسخه ۱
// ==========================================

(function () {
    'use strict';

    if (!window.WamPayAuth) { console.error('❌ permissions.js بارگذاری نشده!'); return; }
    if (!window.WamPayOTP)  { console.error('❌ otp-service.js بارگذاری نشده!'); return; }

    const Auth = window.WamPayAuth;
    const OTP  = window.WamPayOTP;
    const ADMIN_ROLES = ['super_admin', 'admin', 'verifier'];

    // ---------- تعیین شماره ----------
    const params = new URLSearchParams(window.location.search);
    const mobileFromUrl = OTP.normalizeMobile(params.get('mobile') || '');

    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem('wamPayOTPPending') || 'null'); } catch (_) {}

    const mobile = mobileFromUrl || (pending && pending.mobile) || '';
    const role   = (pending && pending.role) || 'applicant';

    if (!mobile || !OTP.isValidMobile(mobile)) {
        sessionStorage.setItem('wamPayLoginMessage', 'ابتدا شماره موبایل را وارد کنید.');
        window.location.replace('login.html');
        return;
    }

    // ---------- المان‌ها ----------
    const boxes      = Array.from(document.querySelectorAll('.otp-box'));
    const verifyBtn  = document.getElementById('verifyBtn');
    const resendBtn  = document.getElementById('resendBtn');
    const timerText  = document.getElementById('timerText');
    const messageEl  = document.getElementById('otpMessage');
    const mobileMask = document.getElementById('mobileMasked');
    const lenLabel   = document.getElementById('lenLabel');

    mobileMask.textContent = OTP.maskMobile(mobile);
    if (lenLabel) lenLabel.textContent = toPersianDigits(OTP.CONFIG.length);

    let verifying = false;
    let cdHandle = null;
    let rsHandle = null;

    // ---------- کمکی ----------
    function toPersianDigits(n) {
        const fa = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
        return String(n).replace(/\d/g, d => fa[+d]);
    }
    function showMessage(text, type) {
        messageEl.hidden = false;
        messageEl.textContent = text;
        messageEl.classList.remove('error', 'success');
        messageEl.classList.add(type);
    }
    function hideMessage() { messageEl.hidden = true; messageEl.textContent = ''; }
    function getCode() { return boxes.map(b => b.value).join(''); }
    function updateVerifyState() {
        const ok = getCode().length === OTP.CONFIG.length;
        verifyBtn.disabled = verifying || !ok;
        boxes.forEach(b => b.classList.toggle('filled', !!b.value));
    }

    // ---------- تایمر انقضا ----------
    function startExpiryCountdown(untilTs) {
        clearInterval(cdHandle);
        function tick() {
            const remain = Math.max(0, Math.floor((untilTs - Date.now()) / 1000));
            const m = String(Math.floor(remain / 60)).padStart(1, '0');
            const s = String(remain % 60).padStart(2, '0');
            timerText.textContent = toPersianDigits(m + ':' + s);
            if (remain <= 0) {
                clearInterval(cdHandle);
                timerText.textContent = 'منقضی';
                boxes.forEach(b => { b.disabled = true; });
                showMessage('کد منقضی شد. روی «ارسال مجدد» بزنید.', 'error');
            }
        }
        tick();
        cdHandle = setInterval(tick, 1000);
    }

    // ---------- تایمر ارسال مجدد ----------
    function startResendCooldown(ms) {
        resendBtn.disabled = true;
        clearInterval(rsHandle);
        const until = Date.now() + ms;
        function tick() {
            const remain = Math.max(0, Math.ceil((until - Date.now()) / 1000));
            if (remain <= 0) {
                clearInterval(rsHandle);
                resendBtn.disabled = false;
                resendBtn.textContent = 'ارسال مجدد';
            } else {
                resendBtn.textContent = 'ارسال مجدد (' + toPersianDigits(remain) + ')';
            }
        }
        tick();
        rsHandle = setInterval(tick, 1000);
    }

    // ---------- تأیید ----------
    async function doVerify() {
        if (verifying) return;
        const code = getCode();
        if (code.length !== OTP.CONFIG.length) {
            showMessage('کد ' + OTP.CONFIG.length + ' رقمی را کامل وارد کنید.', 'error');
            return;
        }

        verifying = true;
        verifyBtn.disabled = true;
        verifyBtn.textContent = 'در حال بررسی...';
        hideMessage();

        const res = await OTP.verify(mobile, code);

        if (!res.ok) {
            verifying = false;
            verifyBtn.textContent = 'تأیید و ورود';
            showMessage(res.message || 'کد صحیح نیست.', 'error');
            boxes.forEach(b => { b.value = ''; b.disabled = false; });
            boxes[0].focus();
            updateVerifyState();
            return;
        }

        // ---- پیدا کردن کاربر ----
        const users = Auth.getUsers();
        let user;
        if (role === 'admin') {
            user = users.find(u => u.mobile === mobile && ADMIN_ROLES.includes(u.role));
        } else {
            user = users.find(u => u.mobile === mobile && u.role === role);
        }

        if (!user) {
            verifying = false;
            verifyBtn.textContent = 'تأیید و ورود';
            showMessage('کاربری با این شماره یافت نشد.', 'error');
            return;
        }

        if (user.status === 'suspended') {
            verifying = false;
            verifyBtn.textContent = 'تأیید و ورود';
            showMessage('⛔ حساب شما مسدود شده است.', 'error');
            return;
        }

        // ---- ورود ----
        const token = 'token_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
        localStorage.setItem('wamPayToken', token);

        const i = users.findIndex(u => u.id === user.id);
        if (i !== -1) {
            users[i].lastLoginAt = new Date().toISOString();
            Auth.saveUsers(users);
            user = users[i];
        }
        Auth.setCurrentUser(user);

        // ---- پاک‌سازی ----
        OTP.clearSession(mobile);
        try { sessionStorage.removeItem('wamPayOTPPending'); } catch (_) {}

        verifyBtn.textContent = '✅ خوش آمدید!';
        showMessage('ورود موفق. در حال انتقال...', 'success');

        setTimeout(() => {
            if (user.mustChangePassword) { window.location.href = 'change-password.html'; return; }
            window.location.href = Auth.getRoleDashboard(user.role);
        }, 700);
    }

    // ---------- ورودی‌ها ----------
    boxes.forEach((box, idx) => {
        box.addEventListener('input', () => {
            box.value = box.value.replace(/[^\d]/g, '').slice(0, 1);
            if (box.value && idx < boxes.length - 1) boxes[idx + 1].focus();
            updateVerifyState();
            if (getCode().length === OTP.CONFIG.length) {
                setTimeout(doVerify, 150);
            }
        });

        box.addEventListener('keydown', e => {
            if (e.key === 'Backspace' && !box.value && idx > 0) {
                boxes[idx - 1].focus();
                boxes[idx - 1].value = '';
                updateVerifyState();
            }
            if (e.key === 'ArrowLeft')  { e.preventDefault(); idx < boxes.length - 1 && boxes[idx + 1].focus(); }
            if (e.key === 'ArrowRight') { e.preventDefault(); idx > 0 && boxes[idx - 1].focus(); }
            if (e.key === 'Enter') doVerify();
        });

        box.addEventListener('paste', e => {
            e.preventDefault();
            const txt = (e.clipboardData || window.clipboardData).getData('text') || '';
            const digits = txt.replace(/[^\d]/g, '').slice(0, OTP.CONFIG.length);
            digits.split('').forEach((d, k) => { if (boxes[k]) boxes[k].value = d; });
            const next = Math.min(digits.length, boxes.length - 1);
            boxes[next].focus();
            updateVerifyState();
            if (digits.length === OTP.CONFIG.length) setTimeout(doVerify, 150);
        });

        box.addEventListener('focus', () => box.select());
    });

    verifyBtn.addEventListener('click', doVerify);

    // ---------- ارسال مجدد ----------
    resendBtn.addEventListener('click', async () => {
        resendBtn.disabled = true;
        hideMessage();

        const res = await OTP.send(mobile, role);

        if (!res.ok) {
            showMessage(res.message || 'ارسال مجدد ناموفق بود.', 'error');
            if (res.reason === 'cooldown' && res.remain) startResendCooldown(res.remain * 1000);
            else resendBtn.disabled = false;
            return;
        }

        let msg = '✅ کد جدید ارسال شد.';
        if (res.mock && res.code) msg += ' (کد تست: ' + res.code + ')';
        showMessage(msg, 'success');

        boxes.forEach(b => { b.value = ''; b.disabled = false; });
        boxes[0].focus();
        updateVerifyState();
        startExpiryCountdown(res.expiresAt || (Date.now() + OTP.CONFIG.ttl));
        startResendCooldown(OTP.CONFIG.resendCooldown);
    });

    // ---------- شروع ----------
    const session = OTP.getSession(mobile);
    const expiresAt = session ? session.expiresAt : (Date.now() + OTP.CONFIG.ttl);
    startExpiryCountdown(expiresAt);

    if (session && session.lastSentAt) {
        const elapsed = Date.now() - session.lastSentAt;
        const remain  = Math.max(0, OTP.CONFIG.resendCooldown - elapsed);
        if (remain > 0) startResendCooldown(remain);
    }

    if (session && session.code && OTP.CONFIG.mock) {
        showMessage('🧪 حالت تست: کد ' + session.code + ' را وارد کنید.', 'success');
    }

    boxes[0].focus();
    updateVerifyState();

    console.log('🔐 verify-otp.js آماده —', OTP.maskMobile(mobile), '| role:', role);
})();