// ==========================================
// وام پی — Applicant Store
// سرویس ذخیره‌سازی درخواست‌های تسهیلات
// نسخه 4.1.1 — با پشتیبانی Supabase + UUID واقعی
// 🆕 v4.1: اولویت با currentUser.id (رفع تداخل UUID)
// 🆕 v4.1.1: حذف optional chaining برای سازگاری با Node.js 12
// ==========================================

(function () {
    'use strict';

    const APPS_KEY = 'wamPayApplications';
    const DRAFT_PREFIX = 'wamPayDraft_';

    // ==========================================
    // ابزار داخلی
    // ==========================================

    function uid(prefix) {
        return (prefix || 'id') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    }

    function readApps() {
        try { return JSON.parse(localStorage.getItem(APPS_KEY) || '[]'); }
        catch (_) { return []; }
    }

    function writeApps(apps) {
        try { localStorage.setItem(APPS_KEY, JSON.stringify(apps)); } catch (_) {}
    }

    function getCurrentUser() {
        try { return JSON.parse(localStorage.getItem('wamPayCurrentUser') || '{}'); }
        catch (_) { return {}; }
    }

    function generateCaseNumber() {
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 900000 + 100000);
        return 'CASE-' + year + '-' + random;
    }

    // 🆕 تولید UUID نسخه ۴
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // 🆕 چک اعتبار UUID
    function isValidUUID(str) {
        if (!str || typeof str !== 'string') return false;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    }

    // ==========================================
    // 🆕 پیدا کردن یا ساختن کاربر در Supabase
    // نسخه 4.1: اولویت با currentUser.id
    // ==========================================
    async function resolveUserId(user) {
        if (!window.WAM_SB || !window.WAM_SB.client) return null;
        if (!user) return null;

        // ⭐ تغییر اصلی: اول currentUser.id (از localStorage) رو چک کن
        if (user.id && isValidUUID(user.id)) {
            console.log('✅ [Sync] از currentUser.id استفاده می‌کنم:', user.id);
            return user.id;
        }

        // ۱. اگه کاربر با Supabase Auth لاگین کرده
        try {
            const { data: authData } = await window.WAM_SB.client.auth.getUser();
            if (authData && authData.user && authData.user.id) {
                console.log('✅ [Sync] از auth.uid() استفاده می‌کنم:', authData.user.id);
                return authData.user.id;
            }
        } catch (e) {
            // ادامه بده
        }

        if (!user.mobile) return null;

        // ۲. با موبایل توی users بگرد
        try {
            const { data: existingUser, error: searchErr } = await window.WAM_SB.client
                .from('users')
                .select('id')
                .eq('phone_number', user.mobile)
                .maybeSingle();

            if (!searchErr && existingUser && existingUser.id) {
                console.log('✅ [Sync] کاربر پیدا شد در users:', existingUser.id);
                return existingUser.id;
            }
        } catch (e) {
            console.warn('⚠️ [Sync] خطا در جستجو:', e.message);
        }

        // ۳. کاربر جدید بساز
        try {
            const newUuid = generateUUID();
            console.log('🆕 [Sync] کاربر جدید ساخته می‌شود:', newUuid);

            const { data: newUser, error: createErr } = await window.WAM_SB.client
                .from('users')
                .insert({
                    id: newUuid,
                    full_name: user.name || ('کاربر ' + (user.mobile || '').slice(-4)),
                    phone_number: user.mobile,
                    role: user.role || 'applicant',
                    status: 'active',
                    email: user.mobile + '@wampay.local',
                    metadata: {
                        source: 'wizard_auto_create',
                        createdAt: new Date().toISOString()
                    }
                })
                .select('id')
                .single();

            if (createErr || !newUser) {
                console.warn('⚠️ [Sync] خطا در ساخت کاربر:', (createErr && createErr.message) || 'نامشخص');
                return null;
            }

            console.log('✅ [Sync] کاربر جدید ساخته شد:', newUser.id);
            return newUser.id;
        } catch (e) {
            console.warn('⚠️ [Sync] خطا در ساخت کاربر:', e.message);
            return null;
        }
    }

    // ==========================================
    // 🆕 آپلود فایل به Supabase Storage
    // ==========================================
    async function uploadFileToSupabase(base64DataUrl, fileName, folder) {
        if (!window.WAM_SB || !window.WAM_SB.client) return null;
        if (!base64DataUrl || !base64DataUrl.startsWith('data:')) return null;

        try {
            const res = await fetch(base64DataUrl);
            const blob = await res.blob();

            const timestamp = Date.now();
            const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
            const path = folder + '/' + timestamp + '_' + safeName;

            const { data, error } = await window.WAM_SB.client.storage
                .from('documents')
                .upload(path, blob, {
                    contentType: blob.type,
                    upsert: false
                });

            if (error) {
                console.warn('⚠️ خطا در آپلود:', error.message);
                return null;
            }

            const { data: urlData } = window.WAM_SB.client.storage
                .from('documents')
                .getPublicUrl(path);

            return urlData.publicUrl;
        } catch (e) {
            console.warn('⚠️ خطا در آپلود فایل:', e.message);
            return null;
        }
    }

    // ==========================================
    // 🆕 همگام‌سازی با Supabase
    // نسخه 4.1: استفاده مستقیم از currentUser.id
    // ==========================================
    async function syncToSupabase(app) {
        if (!window.WAM_SB || !window.WAM_SB.client) {
            console.log('ℹ️ Supabase موجود نیست، فقط LocalStorage ذخیره شد');
            return null;
        }

        try {
            const user = getCurrentUser();
            if (!user || !user.mobile) {
                console.log('ℹ️ کاربر لاگین نیست، Sync انجام نشد');
                return null;
            }

            // 🆕 پیدا کردن UUID واقعی کاربر (اولویت با currentUser.id)
            const realUserId = await resolveUserId(user);
            if (!realUserId) {
                console.warn('⚠️ [Sync] UUID کاربر پیدا نشد');
                return null;
            }

            // تبدیل ساختار LocalStorage به ساختار Supabase
            const appData = app.data || {};
            const identityData = appData.identityAndJob || {};
            const loanData = appData.loanInfo || {};

            const supabaseData = {
                application_number: app.caseNumber || app.id,
                user_id: realUserId,
                loan_type: loanData.bankLoanType || 'personal',
                loan_bank: loanData.bankLoanType || null,
                loan_amount: parseInt(loanData.loanAmount || 0) || 0,
                status: app.status || 'draft',
                current_step: app.currentStep || 0,
                total_steps: 10,
                personal_info: {
                    firstName: identityData.firstName,
                    lastName: identityData.lastName,
                    nationalId: identityData.nationalId,
                    fatherName: identityData.fatherName,
                    birthDate: identityData.birthDate,
                    gender: identityData.gender,
                    phone: identityData.phone,
                    mobile: user.mobile,
                    address: identityData.address,
                    postalCode: identityData.postalCode,
                    jobType: identityData.jobType,
                    employerName: identityData.employerName,
                    monthlyIncome: identityData.monthlyIncome,
                    workYears: identityData.workYears
                },
                financial_info: {
                    bankLoanType: loanData.bankLoanType,
                    loanAmount: loanData.loanAmount,
                    minInstallment: loanData.minInstallment,
                    maxInstallment: loanData.maxInstallment
                },
                documents: appData.documents || {},
                submitted_at: app.submittedAt || null,
                updated_at: new Date().toISOString()
            };

            // چک کن آیا رکورد قبلاً هست
            const { data: existing, error: checkErr } = await window.WAM_SB.client
                .from('applications')
                .select('id')
                .eq('application_number', app.caseNumber)
                .maybeSingle();

            if (existing) {
                const { error: updateErr } = await window.WAM_SB.client
                    .from('applications')
                    .update(supabaseData)
                    .eq('id', existing.id);

                if (updateErr) {
                    console.warn('⚠️ خطا در آپدیت Supabase:', updateErr.message);
                    return null;
                }

                console.log('✅ [Supabase] پرونده آپدیت شد:', app.caseNumber);
                return existing.id;
            } else {
                const { data: inserted, error: insertErr } = await window.WAM_SB.client
                    .from('applications')
                    .insert(supabaseData)
                    .select('id')
                    .single();

                if (insertErr) {
                    console.warn('⚠️ خطا در درج Supabase:', insertErr.message);
                    return null;
                }

                console.log('✅ [Supabase] پرونده جدید درج شد:', app.caseNumber);
                return inserted.id;
            }
        } catch (e) {
            console.warn('⚠️ خطا در syncToSupabase:', e.message);
            return null;
        }
    }

    // ==========================================
    // درخواست‌ها
    // ==========================================

    function getAllApplications() {
        return readApps();
    }

    function getApplicationsByUser(userId) {
        return readApps().filter(a => a.userId === userId);
    }

    function getApplicationById(id) {
        return readApps().find(a => a.id === id) || null;
    }

    // ═══════════════════════════════════════════════════════════
    // saveApplication — Dual Write (LocalStorage + Supabase)
    // ═══════════════════════════════════════════════════════════
    function saveApplication(app) {
        const apps = readApps();
        const idx = apps.findIndex(a => a.id === app.id);
        app.updatedAt = new Date().toISOString();
        if (idx === -1) {
            app.createdAt = app.createdAt || new Date().toISOString();
            apps.push(app);
        } else {
            apps[idx] = app;
        }
        writeApps(apps);

        // 🆕 Sync با Supabase (Async - در پس‌زمینه)
        syncToSupabase(app).catch(e => console.warn('⚠️ syncToSupabase:', e.message));

        return app;
    }

    // ═══════════════════════════════════════════════════════════
    // createApplication
    // ═══════════════════════════════════════════════════════════
    function createApplication(userId, userMobile) {
        const existingApps = readApps();
        const openCase = existingApps.find(a =>
            a.userId === userId &&
            !['completed', 'rejected', 'refunded'].includes(a.status)
        );

        if (openCase) {
            console.log('♻️ [ApplicantStore] پرونده‌ی باز کاربر پیدا شد:', openCase.caseNumber || openCase.id);
            return openCase;
        }

        const currentUser = getCurrentUser();
        const caseNumber = generateCaseNumber();

        const app = {
            id: uid('app'),
            caseNumber: caseNumber,
            userId: userId,
            userMobile: userMobile,
            status: 'draft',
            currentStep: 0,
            source: 'direct',
            applicantData: {
                mobile: userMobile,
                name: currentUser.name || 'کاربر',
                firstName: currentUser.firstName || '',
                lastName: currentUser.lastName || '',
                nationalId: currentUser.nationalId || ''
            },
            data: {
                identity: {},
                contact: {},
                job: {},
                bank: {},
                loan: {}
            },
            submittedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        saveApplication(app);
        console.log('🆕 [ApplicantStore] پرونده‌ی جدید ساخته شد:', caseNumber);
        return app;
    }

    function deleteApplication(id) {
        const apps = readApps().filter(a => a.id !== id);
        writeApps(apps);

        if (window.WAM_SB && window.WAM_SB.client) {
            (async () => {
                try {
                    const app = getApplicationById(id);
                    if (app && app.caseNumber) {
                        await window.WAM_SB.client
                            .from('applications')
                            .delete()
                            .eq('application_number', app.caseNumber);
                        console.log('✅ [Supabase] پرونده حذف شد:', app.caseNumber);
                    }
                } catch (e) {
                    console.warn('⚠️ خطا در حذف Supabase:', e.message);
                }
            })();
        }
    }

    function submitApplication(id) {
        const app = getApplicationById(id);
        if (!app) return null;
        app.status = 'verifier_pending';
        app.submittedAt = new Date().toISOString();
        return saveApplication(app);
    }

    // ==========================================
    // پیش‌نویس (Draft) — per user
    // ==========================================

    function saveDraft(userId, draft) {
        try {
            localStorage.setItem(DRAFT_PREFIX + userId, JSON.stringify({
                ...draft,
                savedAt: Date.now()
            }));
        } catch (_) {}
    }

    function loadDraft(userId) {
        try {
            const raw = localStorage.getItem(DRAFT_PREFIX + userId);
            return raw ? JSON.parse(raw) : null;
        } catch (_) { return null; }
    }

    function clearDraft(userId) {
        try { localStorage.removeItem(DRAFT_PREFIX + userId); } catch (_) {}
    }

    // ==========================================
    // خواندن از Supabase
    // ==========================================
    async function getAllFromSupabase() {
        if (!window.WAM_SB || !window.WAM_SB.client) return [];
        try {
            const { data, error } = await window.WAM_SB.client
                .from('applications')
                .select('*');
            if (error) {
                console.warn('⚠️ خطا در خواندن از Supabase:', error.message);
                return [];
            }
            return data || [];
        } catch (e) {
            console.warn('⚠️ خطا در getAllFromSupabase:', e.message);
            return [];
        }
    }

    // ==========================================
    // آمار
    // ==========================================

    function getStats(userId) {
        const apps = getApplicationsByUser(userId);
        return {
            total: apps.length,
            drafts: apps.filter(a => a.status === 'draft').length,
            pending: apps.filter(a => a.status === 'verifier_pending').length,
            approved: apps.filter(a => a.status === 'approved').length,
            rejected: apps.filter(a => a.status === 'rejected').length
        };
    }

    // ==========================================
    // API عمومی
    // ==========================================

    window.WamPayApplicantStore = {
        getAllApplications,
        getApplicationsByUser,
        getApplicationById,
        createApplication,
        saveApplication,
        deleteApplication,
        submitApplication,
        saveDraft,
        loadDraft,
        clearDraft,
        getStats,
        uid,
        syncToSupabase,
        uploadFileToSupabase,
        getAllFromSupabase,
        resolveUserId,
        generateUUID
    };

    console.log('📦 Applicant Store ready (v4.1.1 — UUID اولویت + سازگار با Node.js 12)');
})();