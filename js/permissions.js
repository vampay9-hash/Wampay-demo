// ==========================================
// وام پی - نقش‌ها، دسترسی‌ها و Workflow
// فایل پایه - بدون side effect
// نسخه ۴: سناریوی OTP + 8 فاز جدید
// ==========================================

(function () {

    'use strict';

    // ==========================================
    // نقش‌ها
    // ==========================================

    const ROLES = {
        SUPER_ADMIN:  'super_admin',
        ADMIN:        'admin',
        VERIFIER:     'verifier',
        BROKER_ADMIN: 'broker_admin',
        BROKER:       'broker',
        APPLICANT:    'applicant'
    };

    const ADMIN_LOGIN_ROLES = [
        ROLES.SUPER_ADMIN,
        ROLES.ADMIN,
        ROLES.VERIFIER,
        ROLES.BROKER_ADMIN
    ];

    // ==========================================
    // برچسب‌های فارسی
    // ==========================================

    const ROLE_LABELS = {
        'super_admin':  'مدیر ارشد',
        'admin':        'ادمین کل',
        'verifier':     'ادمین اعتبارسنجی',
        'broker_admin': 'ادمین کارگزار',
        'broker':       'کارگزار',
        'applicant':    'متقاضی'
    };

    const ROLE_ICONS = {
        'super_admin':  '👑',
        'admin':        '⚙️',
        'verifier':     '🔍',
        'broker_admin': '📋',
        'broker':       '💼',
        'applicant':    '👤'
    };

    const ROLE_DASHBOARDS = {
        'super_admin':  'super-admin-dashboard.html',
        'admin':        'admin-dashboard.html',
        'verifier':     'verifier-dashboard.html',
        'broker_admin': 'broker-admin-dashboard.html',
        'broker':       'broker-dashboard.html',
        'applicant':    'applicant-dashboard.html'
    };

    // ==========================================
    // 🆕 دسترسی‌ها — گسترش با فازهای جدید
    // ==========================================

    const PERMISSIONS = {

        'super_admin': ['*'],

        'admin': [
            'view:admin-dashboard',
            'manage:users',
            'manage:brokers',
            'manage:cases',
            'manage:consultations',
            'manage:financial',
            'verify:cases',
            'assign:broker',
            'approve:contract-final',      // 🆕 فقط super_admin نهایی
            'create:broker-admin',
            'create:verifier'
        ],

        'verifier': [
            'view:verifier-dashboard',
            'view:cases',
            'assign:self',
            'verify:cases',
            'reject:cases',
            'review:initial',              // 🆕 بررسی اولیه
            'review:documents',            // 🆕 بررسی مدارک
            'refer:to-broker-admin'
        ],

        'broker_admin': [
            'view:broker-admin-dashboard',
            'view:broker-cases',
            'view:brokers',
            'manage:brokers',
            'approve:broker-registration',
            'approve:case',                // 🆕 تأیید پرونده اعتبارسنجی‌شده
            'reject:case',
            'assign:case-to-broker'        // 🆕 انتخاب کارگزار
        ],

        'broker': [
            'view:broker-dashboard',
            'view:own-cases',
            'review:own-cases',
            'consult:own-cases',
            'draft:contract',
            'submit:contract'              // 🆕 ارسال قرارداد برای تأیید
        ],

        'applicant': [
            'view:applicant-dashboard',
            'view:own-cases',
            'edit:own-profile',
            'create:case',
            'fill:wizard',                 // 🆕 ویزارد اولیه
            'upload:documents',            // 🆕 بارگذاری مدارک
            'sign:contract'                // 🆕 امضای قرارداد
        ]
    };

    // ==========================================
    // 🆕 مراحل Workflow — ۱۸ Stage
    // ==========================================

    const WORKFLOW_STAGES = {

        // ═══ فاز ۰ — ورود با OTP ═══
        APPLICANT_OTP_PENDING:        'applicant_otp_pending',
        APPLICANT_OTP_VERIFIED:       'applicant_otp_verified',

        // ═══ فاز ۱ — ویزارد متقاضی (۵ مرحله) ═══
        APPLICANT_WIZARD_DRAFT:       'applicant_wizard_draft',
        APPLICANT_STEP1:              'applicant_step1',       // مشخصات فردی
        APPLICANT_STEP2:              'applicant_step2',       // اطلاعات شغلی
        APPLICANT_STEP3:              'applicant_step3',       // نوع وام
        APPLICANT_STEP4:              'applicant_step4',       // مبلغ و قسط
        APPLICANT_STEP5:              'applicant_step5',       // تأیید

        // ═══ فاز ۲ — بررسی اولیه (verifier) ═══
        VERIFIER_PENDING:             'verifier_pending',
        VERIFIER_REVIEWING:           'verifier_reviewing',
        VERIFIER_INITIAL_APPROVED:    'verifier_initial_approved',
        VERIFIER_INITIAL_REJECTED:    'verifier_initial_rejected',

        // ═══ فاز ۳ — بارگذاری مدارک (applicant) ═══
        APPLICANT_DOCUMENTS_PENDING:  'applicant_documents_pending',
        APPLICANT_DOCUMENTS_UPLOADED: 'applicant_documents_uploaded',

        // ═══ فاز ۴ — بررسی مدارک (verifier) ═══
        VERIFIER_DOCS_PENDING:        'verifier_docs_pending',
        VERIFIER_DOCS_REVIEWING:      'verifier_docs_reviewing',
        VERIFIER_DONE:                'verifier_done',

        // ═══ فاز ۵ — ادمین کارگزار ═══
        BROKER_ADMIN_PENDING:         'broker_admin_pending',
        BROKER_ADMIN_APPROVED:        'broker_admin_approved',
        BROKER_ASSIGNED:              'broker_assigned',

        // ═══ فاز ۶ — کارگزار + قرارداد ═══
        BROKER_CONSULTING:            'broker_consulting',
        CONTRACT_DRAFT:               'contract_draft',
        CONTRACT_PENDING:             'contract_pending',
        CONTRACT_SIGNED:              'contract_signed',

        // ═══ فاز ۷ — تأیید نهایی (super_admin) ═══
        FINAL_APPROVAL:               'final_approval',
        FINAL_APPROVED:               'final_approved',

        // ═══ نهایی ═══
        COMPLETED:                    'completed',
        REJECTED:                     'rejected',
        CANCELLED:                    'cancelled'
    };

    // ==========================================
    // 🆕 نگاشت فاز ↔ مسئول
    // ==========================================

    const STAGE_OWNERS = {
        'applicant_otp_pending':         'applicant',
        'applicant_otp_verified':        'applicant',
        'applicant_wizard_draft':        'applicant',
        'applicant_step1':               'applicant',
        'applicant_step2':               'applicant',
        'applicant_step3':               'applicant',
        'applicant_step4':               'applicant',
        'applicant_step5':               'applicant',

        'verifier_pending':              'verifier',
        'verifier_reviewing':            'verifier',
        'verifier_initial_approved':     'applicant',
        'verifier_initial_rejected':     'applicant',

        'applicant_documents_pending':   'applicant',
        'applicant_documents_uploaded':  'verifier',

        'verifier_docs_pending':         'verifier',
        'verifier_docs_reviewing':       'verifier',
        'verifier_done':                 'broker_admin',

        'broker_admin_pending':          'broker_admin',
        'broker_admin_approved':         'broker_admin',
        'broker_assigned':               'broker',

        'broker_consulting':             'broker',
        'contract_draft':                'broker',
        'contract_pending':              'super_admin',
        'contract_signed':               'super_admin',

        'final_approval':                'super_admin',
        'final_approved':                'completed',
        'completed':                     'completed',
        'rejected':                      'rejected',
        'cancelled':                     'cancelled'
    };

    // ==========================================
    // 🆕 برچسب‌های فارسی Stage
    // ==========================================

    const STAGE_LABELS = {
        'applicant_otp_pending':         'در انتظار تأیید شماره موبایل',
        'applicant_otp_verified':        'شماره تأیید شد',
        'applicant_wizard_draft':        'ویزارد ناتمام',
        'applicant_step1':               'مرحله ۱ — مشخصات فردی',
        'applicant_step2':               'مرحله ۲ — اطلاعات شغلی',
        'applicant_step3':               'مرحله ۳ — نوع وام',
        'applicant_step4':               'مرحله ۴ — مبلغ و قسط',
        'applicant_step5':               'مرحله ۵ — تأیید نهایی',

        'verifier_pending':              'در انتظار بررسی اولیه',
        'verifier_reviewing':            'در حال بررسی اولیه',
        'verifier_initial_approved':     'تأیید اولیه — در انتظار بارگذاری مدارک',
        'verifier_initial_rejected':     'رد اولیه',

        'applicant_documents_pending':   'در انتظار بارگذاری مدارک',
        'applicant_documents_uploaded':  'مدارک بارگذاری شد',

        'verifier_docs_pending':         'در انتظار بررسی مدارک',
        'verifier_docs_reviewing':       'در حال بررسی مدارک',
        'verifier_done':                 'اعتبارسنجی تکمیل شد',

        'broker_admin_pending':          'در انتظار تأیید ادمین کارگزار',
        'broker_admin_approved':         'تأیید ادمین کارگزار',
        'broker_assigned':               'ارجاع به کارگزار',

        'broker_consulting':             'در حال مشاوره',
        'contract_draft':                'پیش‌نویس قرارداد',
        'contract_pending':              'در انتظار تأیید قرارداد',
        'contract_signed':               'قرارداد امضا شده',

        'final_approval':                'در انتظار تأیید نهایی',
        'final_approved':                'تأیید نهایی',
        'completed':                     'تکمیل‌شده',
        'rejected':                      'ردشده',
        'cancelled':                     'لغو‌شده'
    };

    // ==========================================
    // کلیدهای localStorage
    // ==========================================

    const STORAGE_KEYS = {
        USERS:          'wamPayUsers',
        CURRENT_USER:   'wamPayCurrentUser',
        TOKEN:          'wamPayToken',
        APPLICATIONS:   'wamPayApplications',
        CASES_LEGACY:   'wamPayCases',
        NOTIFICATIONS:  'wamPayNotifications',
        THEME:          'wamPayTheme',

        // 🆕 OTP
        OTP_KEY:        'wamPayOtp_',
        OTP_PENDING:    'wamPayOtpPending'
    };

    // ==========================================
    // توابع کمکی — احراز هویت
    // ==========================================

    function getCurrentUser() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.CURRENT_USER) || 'null');
        } catch (e) {
            return null;
        }
    }

    function setCurrentUser(user) {
        if (user === null) {
            localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
            return;
        }
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    }

    function getToken() {
        return localStorage.getItem(STORAGE_KEYS.TOKEN) || '';
    }

    function isLoggedIn() {
        return !!(getToken() && getCurrentUser());
    }

    function hasRole(role) {
        const user = getCurrentUser();
        if (!user) return false;
        if (Array.isArray(role)) {
            return role.includes(user.role);
        }
        return user.role === role;
    }

    function hasPermission(permission) {
        const user = getCurrentUser();
        if (!user) return false;
        const perms = PERMISSIONS[user.role] || [];
        if (perms.includes('*')) return true;
        return perms.includes(permission);
    }

    function hasAnyPermission(list) {
        if (!Array.isArray(list)) return false;
        return list.some(function (p) { return hasPermission(p); });
    }

    function hasAllPermissions(list) {
        if (!Array.isArray(list)) return false;
        return list.every(function (p) { return hasPermission(p); });
    }

    function getRoleLabel(role) {
        return ROLE_LABELS[role] || role;
    }

    function getRoleIcon(role) {
        return ROLE_ICONS[role] || '👤';
    }

    function getRoleDashboard(role) {
        return ROLE_DASHBOARDS[role] || 'login.html';
    }

    // ==========================================
    // مدیریت کاربران
    // ==========================================

    function getUsers() {
        try {
            const arr = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function saveUsers(users) {
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    }

    function hasSuperAdmin() {
        return getUsers().some(function (u) {
            return u.role === ROLES.SUPER_ADMIN;
        });
    }

    function generateId(prefix) {
        return (prefix || 'id_') + Date.now() + '_' +
               Math.random().toString(36).substr(2, 9);
    }

    function userExists(mobile, role) {
        if (!mobile) return false;
        return getUsers().some(function (u) {
            if (role) return u.mobile === mobile && u.role === role;
            return u.mobile === mobile;
        });
    }

    function userExistsAnyRole(mobile) {
        return userExists(mobile);
    }

    function findUser(mobile, role) {
        if (!mobile) return null;
        const users = getUsers();
        if (role) {
            return users.find(function (u) {
                return u.mobile === mobile && u.role === role;
            }) || null;
        }
        return users.find(function (u) {
            return u.mobile === mobile;
        }) || null;
    }

    function getUsersByRole(role, options) {
        options = options || {};
        return getUsers().filter(function (u) {
            if (u.role !== role) return false;
            if (options.activeOnly && u.status !== 'active') return false;
            return true;
        });
    }

    function hasUserWithRole(mobile, role) {
        return userExists(mobile, role);
    }

    // ==========================================
    // Case Workflow
    // ==========================================

    function getAllCases() {
        // اولویت ۱: CaseRepository
        if (typeof CaseRepository !== 'undefined' && CaseRepository.getAll) {
            try {
                var repoCases = CaseRepository.getAll();
                if (Array.isArray(repoCases) && repoCases.length > 0) {
                    return repoCases;
                }
            } catch (e) {}
        }

        // اولویت ۲: wamPayApplications
        try {
            var primary = JSON.parse(localStorage.getItem(STORAGE_KEYS.APPLICATIONS) || '[]');
            if (Array.isArray(primary) && primary.length > 0) return primary;
        } catch (e) {}

        // اولویت ۳: legacy
        try {
            var legacy = JSON.parse(localStorage.getItem(STORAGE_KEYS.CASES_LEGACY) || '[]');
            return Array.isArray(legacy) ? legacy : [];
        } catch (e) {
            return [];
        }
    }

    function saveCases(cases) {
        if (typeof CaseRepository !== 'undefined' &&
            CaseRepository.create && Array.isArray(cases)) {
            for (var i = 0; i < cases.length; i++) {
                var c = cases[i];
                if (!c || !c.caseId) continue;
                try {
                    if (!CaseRepository.get(c.caseId)) {
                        CaseRepository.create(c, { userId: null });
                    }
                } catch (e) {}
            }
            return true;
        }
        localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(cases));
        return true;
    }

    function getCasesByStage(stage) {
        const stages = Array.isArray(stage) ? stage : [stage];
        return getAllCases().filter(function (c) {
            if (!c || !c.workflow) return false;
            return stages.includes(c.workflow.currentStage);
        });
    }

    function countActiveCases(userId) {
        if (!userId) return 0;
        return getAllCases().filter(function (c) {
            if (!c) return false;
            const stage = c.workflow && c.workflow.currentStage;
            if (stage === WORKFLOW_STAGES.COMPLETED ||
                stage === WORKFLOW_STAGES.REJECTED ||
                stage === WORKFLOW_STAGES.CANCELLED) {
                return false;
            }
            return (c.step2 && c.step2.verifierId === userId) ||
                   (c.step4 && c.step4.verifierId === userId) ||
                   (c.step5 && c.step5.brokerAdminId === userId) ||
                   (c.step5 && c.step5.assignedBrokerId === userId) ||
                   (c.step6 && c.step6.brokerId === userId);
        }).length;
    }

    function getLeastBusyUser(role) {
        const candidates = getUsersByRole(role, { activeOnly: true });
        if (candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];
        return candidates.slice().sort(function (a, b) {
            return countActiveCases(a.id) - countActiveCases(b.id);
        })[0];
    }

    // ==========================================
    // 🆕 تخصیص پرونده
    // ==========================================

    function assignCase(caseId, userId, role) {
        if (!caseId || !userId || !role) return false;

        const cases = getAllCases();
        const idx = cases.findIndex(function (c) { return c.caseId === caseId; });
        if (idx === -1) return false;

        const user = getUsers().find(function (u) { return u.id === userId; });
        if (!user) return false;

        const now = new Date().toISOString();
        const c = cases[idx];

        if (role === ROLES.VERIFIER) {
            c.step2 = c.step2 || {};
            c.step2.verifierId = userId;
            c.step2.verifierName = user.name || user.mobile;
            c.step2.status = 'reviewing';
            updateCaseStage(caseId, WORKFLOW_STAGES.VERIFIER_REVIEWING, {
                byUserId: userId
            });
        } else if (role === ROLES.BROKER_ADMIN) {
            c.step5 = c.step5 || {};
            c.step5.brokerAdminId = userId;
            c.step5.brokerAdminName = user.name || user.mobile;
        } else if (role === ROLES.BROKER) {
            c.step5 = c.step5 || {};
            c.step5.assignedBrokerId = userId;
            c.step5.assignedBrokerName = user.name || user.mobile;
            c.step5.assignedAt = now;
            c.step6 = c.step6 || {};
            c.step6.brokerId = userId;
            c.step6.brokerName = user.name || user.mobile;
            updateCaseStage(caseId, WORKFLOW_STAGES.BROKER_ASSIGNED, {
                byUserId: userId
            });
        } else {
            return false;
        }

        c.updatedAt = now;
        saveCases(cases);
        return true;
    }

    // ==========================================
    // 🆕 به‌روزرسانی Stage
    // ==========================================

    function updateCaseStage(caseId, newStage, options) {
        options = options || {};
        if (!caseId || !newStage) return false;

        const cases = getAllCases();
        const idx = cases.findIndex(function (c) { return c.caseId === caseId; });
        if (idx === -1) return false;

        const now = new Date().toISOString();
        const c = cases[idx];

        if (!c.workflow) {
            c.workflow = { currentStage: newStage, history: [] };
        }

        const prevStage = c.workflow.currentStage;
        c.workflow.currentStage = newStage;
        c.workflow.history = c.workflow.history || [];
        c.workflow.history.push({
            from: prevStage,
            to: newStage,
            at: now,
            by: options.byUserId || null,
            note: options.note || ''
        });

        c.updatedAt = now;
        saveCases(cases);
        return true;
    }

    function getCasesForUser(userId, role) {
        if (!userId || !role) return [];

        return getAllCases().filter(function (c) {
            if (!c) return false;

            if (role === ROLES.VERIFIER) {
                return (c.step2 && c.step2.verifierId === userId) ||
                       (c.step4 && c.step4.verifierId === userId);
            }
            if (role === ROLES.BROKER_ADMIN) {
                return c.step5 && c.step5.brokerAdminId === userId;
            }
            if (role === ROLES.BROKER) {
                return (c.step5 && c.step5.assignedBrokerId === userId) ||
                       (c.step6 && c.step6.brokerId === userId);
            }
            if (role === ROLES.APPLICANT) {
                return c.userId === userId || c.applicantId === userId;
            }
            return false;
        });
    }

    // ==========================================
    // 🆕 Stage helpers
    // ==========================================

    function getStageOwner(stage) {
        return STAGE_OWNERS[stage] || 'unknown';
    }

    function getStageLabel(stage) {
        return STAGE_LABELS[stage] || stage || '—';
    }

    function isApplicantTurn(stage) {
        return getStageOwner(stage) === 'applicant';
    }

    function isVerifierTurn(stage) {
        return getStageOwner(stage) === 'verifier';
    }

    function isBrokerAdminTurn(stage) {
        return getStageOwner(stage) === 'broker_admin';
    }

    function isBrokerTurn(stage) {
        return getStageOwner(stage) === 'broker';
    }

    function isFinalStage(stage) {
        return stage === WORKFLOW_STAGES.COMPLETED ||
               stage === WORKFLOW_STAGES.REJECTED ||
               stage === WORKFLOW_STAGES.CANCELLED;
    }

    // ==========================================
    // بررسی نقش‌های مدیریتی
    // ==========================================

    function isAdminRole(role) {
        return ADMIN_LOGIN_ROLES.includes(role);
    }

    function isSuperAdmin(role) {
        return role === ROLES.SUPER_ADMIN;
    }

    function isBrokerAdmin(role) {
        return role === ROLES.BROKER_ADMIN;
    }

    function isVerifier(role) {
        return role === ROLES.VERIFIER;
    }

    // ==========================================
    // رمز عبور
    // ==========================================

    async function hashPassword(password) {
        if (!password || typeof password !== 'string') return '';

        if (!window.crypto || !window.crypto.subtle) {
            return simpleHash(password);
        }

        try {
            const enc = new TextEncoder().encode(password);
            const buf = await window.crypto.subtle.digest('SHA-256', enc);
            return Array.from(new Uint8Array(buf))
                .map(function (b) { return b.toString(16).padStart(2, '0'); })
                .join('');
        } catch (e) {
            return simpleHash(password);
        }
    }

    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        const base = Math.abs(hash).toString(16).padStart(8, '0');
        return (base + base + base + base + base + base + base + base).substring(0, 64);
    }

    function isHashed(password) {
        if (typeof password !== 'string') return false;
        return /^[a-f0-9]{64}$/.test(password);
    }

    async function verifyPassword(inputPassword, storedPassword) {
        if (!inputPassword || !storedPassword) return false;
        if (isHashed(storedPassword)) {
            const inputHash = await hashPassword(inputPassword);
            return inputHash === storedPassword;
        }
        return inputPassword === storedPassword;
    }

    // ==========================================
    // 🆕 OTP helpers
    // ==========================================

    function saveOtp(mobile, code, ttlMs) {
        if (!mobile || !code) return false;
        ttlMs = ttlMs || 2 * 60 * 1000;  // ۲ دقیقه
        const payload = {
            code: String(code),
            mobile: String(mobile),
            expiresAt: Date.now() + ttlMs,
            attempts: 0,
            createdAt: Date.now()
        };
        try {
            localStorage.setItem(STORAGE_KEYS.OTP_KEY + mobile, JSON.stringify(payload));
            return true;
        } catch (e) {
            return false;
        }
    }

    function getOtp(mobile) {
        if (!mobile) return null;
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.OTP_KEY + mobile);
            if (!raw) return null;
            const payload = JSON.parse(raw);
            if (!payload || !payload.expiresAt) return null;
            if (Date.now() > payload.expiresAt) {
                localStorage.removeItem(STORAGE_KEYS.OTP_KEY + mobile);
                return null;
            }
            return payload;
        } catch (e) {
            return null;
        }
    }

    function verifyOtp(mobile, code) {
        const payload = getOtp(mobile);
        if (!payload) return { ok: false, reason: 'expired' };
        payload.attempts = (payload.attempts || 0) + 1;
        if (payload.attempts > 5) {
            localStorage.removeItem(STORAGE_KEYS.OTP_KEY + mobile);
            return { ok: false, reason: 'too_many_attempts' };
        }
        if (String(payload.code) !== String(code)) {
            try {
                localStorage.setItem(STORAGE_KEYS.OTP_KEY + mobile, JSON.stringify(payload));
            } catch (e) {}
            return { ok: false, reason: 'wrong_code' };
        }
        localStorage.removeItem(STORAGE_KEYS.OTP_KEY + mobile);
        return { ok: true };
    }

    function clearOtp(mobile) {
        if (!mobile) return false;
        try {
            localStorage.removeItem(STORAGE_KEYS.OTP_KEY + mobile);
            return true;
        } catch (e) {
            return false;
        }
    }

    // ==========================================
    // Export اصلی — WamPayAuth
    // ==========================================

    window.WamPayAuth = {
        // Constants
        ROLES: ROLES,
        ADMIN_LOGIN_ROLES: ADMIN_LOGIN_ROLES,
        ROLE_LABELS: ROLE_LABELS,
        ROLE_ICONS: ROLE_ICONS,
        ROLE_DASHBOARDS: ROLE_DASHBOARDS,
        PERMISSIONS: PERMISSIONS,
        WORKFLOW_STAGES: WORKFLOW_STAGES,
        STAGE_OWNERS: STAGE_OWNERS,
        STAGE_LABELS: STAGE_LABELS,
        STORAGE_KEYS: STORAGE_KEYS,

        // User management
        getCurrentUser: getCurrentUser,
        setCurrentUser: setCurrentUser,
        getToken: getToken,
        isLoggedIn: isLoggedIn,
        getUsers: getUsers,
        saveUsers: saveUsers,

        // Role/Permission
        hasRole: hasRole,
        hasPermission: hasPermission,
        hasAnyPermission: hasAnyPermission,
        hasAllPermissions: hasAllPermissions,

        // Helpers
        getRoleLabel: getRoleLabel,
        getRoleIcon: getRoleIcon,
        getRoleDashboard: getRoleDashboard,
        hasSuperAdmin: hasSuperAdmin,
        generateId: generateId,

        // User lookup
        userExists: userExists,
        userExistsAnyRole: userExistsAnyRole,
        findUser: findUser,
        getUsersByRole: getUsersByRole,
        hasUserWithRole: hasUserWithRole,
        getLeastBusyUser: getLeastBusyUser,

        // Password security
        hashPassword: hashPassword,
        isHashed: isHashed,
        verifyPassword: verifyPassword,

        // Role helpers
        isAdminRole: isAdminRole,
        isSuperAdmin: isSuperAdmin,
        isBrokerAdmin: isBrokerAdmin,
        isVerifier: isVerifier,

        // Case workflow
        getAllCases: getAllCases,
        saveCases: saveCases,
        getCasesByStage: getCasesByStage,
        getCasesForUser: getCasesForUser,
        countActiveCases: countActiveCases,
        assignCase: assignCase,
        updateCaseStage: updateCaseStage,

        // 🆕 Stage helpers
        getStageOwner: getStageOwner,
        getStageLabel: getStageLabel,
        isApplicantTurn: isApplicantTurn,
        isVerifierTurn: isVerifierTurn,
        isBrokerAdminTurn: isBrokerAdminTurn,
        isBrokerTurn: isBrokerTurn,
        isFinalStage: isFinalStage,

        // 🆕 OTP helpers
        saveOtp: saveOtp,
        getOtp: getOtp,
        verifyOtp: verifyOtp,
        clearOtp: clearOtp
    };

    // ==========================================
    // 🔄 COMPATIBILITY SHIM — WamPermissions alias
    // ==========================================

    function hasRoleCompat(user, role) {
        if (!user) user = getCurrentUser();
        if (!user) return false;
        var roles = Array.isArray(role) ? role : [role];
        return roles.indexOf(user.role) !== -1;
    }

    function hasCompat(user, permission) {
        if (!user) user = getCurrentUser();
        if (!user) return false;
        var perms = PERMISSIONS[user.role] || [];
        if (perms.indexOf('*') !== -1) return true;
        return perms.indexOf(permission) !== -1;
    }

    function hasLevelAtLeast(user, minRole) {
        if (!user) user = getCurrentUser();
        if (!user) return false;
        var LEVELS = {
            super_admin:  100,
            admin:        80,
            broker_admin: 60,
            verifier:     60,
            broker:       40,
            applicant:    20
        };
        return (LEVELS[user.role] || 0) >= (LEVELS[minRole] || 0);
    }

    function clearCurrentUser() {
        try {
            localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
            localStorage.removeItem(STORAGE_KEYS.TOKEN);
        } catch (e) {}
    }

    window.WamPermissions = {
        getCurrentUser: getCurrentUser,
        setCurrentUser: setCurrentUser,
        getToken: getToken,
        isLoggedIn: isLoggedIn,
        getUsers: getUsers,
        saveUsers: saveUsers,
        clearCurrentUser: clearCurrentUser,

        hasRole: hasRoleCompat,
        has: hasCompat,
        hasPermission: hasPermission,
        hasAnyPermission: hasAnyPermission,
        hasAllPermissions: hasAllPermissions,
        hasLevelAtLeast: hasLevelAtLeast,

        ROLES: ROLES,
        PERMISSIONS: PERMISSIONS,

        getRoleLabel: getRoleLabel,
        getRoleIcon: getRoleIcon,
        getRoleHome: getRoleDashboard,
        getRoleDashboard: getRoleDashboard,
        hasSuperAdmin: hasSuperAdmin,
        generateId: generateId,

        userExists: userExists,
        findUser: findUser,
        getUsersByRole: getUsersByRole,

        getAllCases: getAllCases,
        saveCases: saveCases,
        getCasesByStage: getCasesByStage,
        getCasesForUser: getCasesForUser,
        countActiveCases: countActiveCases,
        assignCase: assignCase,
        updateCaseStage: updateCaseStage,

        hashPassword: hashPassword,
        isHashed: isHashed,
        verifyPassword: verifyPassword
    };

    // ==========================================
    // لاگ
    // ==========================================

    console.log('🔐 permissions.js v4 آماده — با ۱۸ Stage + OTP helpers');

})();