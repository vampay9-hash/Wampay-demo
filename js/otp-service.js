// ==========================================
// وام پی — OTP Service
// نسخه ۱: Mock + Real-Ready
// ==========================================

(function () {
    'use strict';

    const CONFIG = {
        mock: true,             // ⚠️ برای اتصال واقعی false کن
        mockCode: '12345',      // فقط در حالت mock
        length: 5,
        ttl: 120000,            // اعتبار کد: ۲ دقیقه
        resendCooldown: 60000,  // فاصله ارسال مجدد: ۱ دقیقه
        maxAttempts: 5,
        endpoints: {
            send:   '/api/otp/send',
            verify: '/api/otp/verify'
        }
    };

    const STORE_KEY = 'wamPayOTPSessions';

    // ---------- ذخیره‌سازی ----------
    function loadSessions() {
        try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}'); }
        catch (_) { return {}; }
    }
    function saveSessions(s) {
        try { sessionStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (_) {}
    }

    // ---------- کمکی ----------
    function normalizeMobile(m) {
        return String(m || '').replace(/[^\d]/g, '').slice(0, 11);
    }
    function isValidMobile(m) {
        return /^09[0-9]{9}$/.test(m);
    }
    function maskMobile(m) {
        if (!m || m.length < 11) return m || '';
        return m.slice(0, 4) + '***' + m.slice(7);
    }
    function now() { return Date.now(); }

    // ---------- ارسال ----------
    async function send(mobile, role) {
        mobile = normalizeMobile(mobile);

        if (!isValidMobile(mobile)) {
            return { ok: false, reason: 'invalid_mobile', message: 'شماره موبایل معتبر نیست.' };
        }

        const sessions = loadSessions();
        const prev = sessions[mobile];

        if (prev && prev.lastSentAt && (now() - prev.lastSentAt) < CONFIG.resendCooldown) {
            const remain = Math.ceil((CONFIG.resendCooldown - (now() - prev.lastSentAt)) / 1000);
            return { ok: false, reason: 'cooldown', remain, message: 'لطفاً ' + remain + ' ثانیه دیگر تلاش کنید.' };
        }

        // ===== MOCK =====
        if (CONFIG.mock) {
            const code = CONFIG.mockCode;
            sessions[mobile] = {
                mobile, role: role || 'applicant',
                code,
                createdAt: now(),
                expiresAt: now() + CONFIG.ttl,
                lastSentAt: now(),
                attempts: 0,
                verified: false
            };
            saveSessions(sessions);
            console.log('🧪 [MOCK OTP] کد برای', mobile, '→', code);
            return { ok: true, mock: true, code, expiresAt: sessions[mobile].expiresAt, cooldown: CONFIG.resendCooldown };
        }

        // ===== REAL =====
        try {
            const res = await fetch(CONFIG.endpoints.send, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mobile, role })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) {
                return { ok: false, reason: data.reason || 'server', message: data.message || 'ارسال کد ناموفق بود.' };
            }
            sessions[mobile] = {
                mobile, role: role || 'applicant',
                code: null,
                token: data.token || null,
                createdAt: now(),
                expiresAt: now() + (data.ttl || CONFIG.ttl),
                lastSentAt: now(),
                attempts: 0,
                verified: false
            };
            saveSessions(sessions);
            return { ok: true, mock: false, expiresAt: sessions[mobile].expiresAt, cooldown: CONFIG.resendCooldown };
        } catch (_) {
            return { ok: false, reason: 'network', message: 'خطای شبکه. دوباره تلاش کنید.' };
        }
    }

    // ---------- بررسی ----------
    async function verify(mobile, code) {
        mobile = normalizeMobile(mobile);
        code = String(code || '').replace(/[^\d]/g, '');

        if (!isValidMobile(mobile)) return { ok: false, reason: 'invalid_mobile', message: 'شماره موبایل نامعتبر.' };
        if (code.length !== CONFIG.length) return { ok: false, reason: 'invalid_code', message: 'کد باید ' + CONFIG.length + ' رقم باشد.' };

        const sessions = loadSessions();
        const s = sessions[mobile];

        if (!s) return { ok: false, reason: 'not_found', message: 'کدی برای این شماره ارسال نشده.' };
        if (s.verified) return { ok: false, reason: 'already_used', message: 'این کد قبلاً استفاده شده.' };
        if (now() > s.expiresAt) return { ok: false, reason: 'expired', message: 'کد منقضی شده. دوباره ارسال کنید.' };
        if (s.attempts >= CONFIG.maxAttempts) return { ok: false, reason: 'too_many', message: 'تلاش‌های زیاد. کد جدید بگیرید.' };

        // ===== MOCK =====
        if (CONFIG.mock) {
            if (code !== s.code) {
                s.attempts++;
                saveSessions(sessions);
                return { ok: false, reason: 'wrong', attempts: s.attempts, message: 'کد وارد شده صحیح نیست.' };
            }
            s.verified = true;
            saveSessions(sessions);
            return { ok: true, mock: true };
        }

        // ===== REAL =====
        try {
            const res = await fetch(CONFIG.endpoints.verify, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mobile, code, token: s.token })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) {
                s.attempts++;
                saveSessions(sessions);
                return { ok: false, reason: data.reason || 'wrong', message: data.message || 'کد صحیح نیست.' };
            }
            s.verified = true;
            saveSessions(sessions);
            return { ok: true, mock: false, verifiedToken: data.verifiedToken };
        } catch (_) {
            return { ok: false, reason: 'network', message: 'خطای شبکه.' };
        }
    }

    // ---------- API ----------
    function getSession(mobile) {
        return loadSessions()[normalizeMobile(mobile)] || null;
    }
    function clearSession(mobile) {
        const s = loadSessions();
        delete s[normalizeMobile(mobile)];
        saveSessions(s);
    }

    window.WamPayOTP = {
        CONFIG,
        send, verify,
        getSession, clearSession,
        isValidMobile, normalizeMobile, maskMobile
    };

    console.log('🔐 OTP Service ready — mode:', CONFIG.mock ? 'MOCK' : 'REAL');
})();