// ==========================================
// وام پی — Broker Store v1
// سرویس مرکزی مدیریت کارگزاران
// ==========================================
// مسئولیت‌ها:
//   - CRUD کارگزار (ایجاد، خواندن، آپدیت، حذف)
//   - تولید کد کارگزاری یکتا (BRK-YYYY-XXXX)
//   - مدیریت وضعیت (pending/active/suspended/rejected)
//   - ذخیره‌سازی Draft ثبت‌نام
//   - آمار عملکرد
//   - تأیید/رد توسط ادمین
//   - داده‌های Mock برای تست
// ==========================================

(function () {
    'use strict';

    // ==========================================
    // ⚙️ کلیدها و تنظیمات
    // ==========================================
    const BROKERS_KEY = 'wamPayBrokers';
    const DRAFT_PREFIX = 'wamPayBrokerDraft_';
    const COUNTER_KEY = 'wamPayBrokerCounter';

    const CONFIG = {
        codePrefix: 'BRK',
        defaultCommissionPercent: 0.03,
        defaultMaxActiveCases: 20,
        minExperienceYears: 0,
        maxExperienceYears: 40,
        minAge: 18,
        maxAge: 75,
        pendingTTLHours: 48,              // زمان بررسی ادمین
        specialties: [
            { id: 'resalat', name: 'وام قرض‌الحسنه رسالت', bank: 'رسالت' },
            { id: 'mehr',    name: 'وام قرض‌الحسنه مهر ایران', bank: 'مهر' },
            { id: 'sepah',   name: 'وام بانک سپه', bank: 'سپه' },
            { id: 'melli',   name: 'وام بانک ملی ایران', bank: 'ملی' }
        ]
    };

    // ==========================================
    // 🛠️ توابع کمکی
    // ==========================================
    function uid(prefix) {
        return (prefix || 'broker_') + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function nowISO() { return new Date().toISOString(); }

    function loadJSON(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            return JSON.parse(raw);
        } catch (_) { return fallback; }
    }

    function saveJSON(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('❌ خطا در ذخیره:', e);
            return false;
        }
    }

    function getAllBrokers() { return loadJSON(BROKERS_KEY, []); }
    function saveAllBrokers(arr) { return saveJSON(BROKERS_KEY, arr); }

    function toPersianDigits(n) {
        const fa = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
        return String(n).replace(/\d/g, d => fa[+d]);
    }

    // ==========================================
    // 🔢 تولید کد کارگزاری یکتا
    // ==========================================
    function generateBrokerCode() {
        const year = new Date().getFullYear();

        // شمارنده‌ی سالانه
        let counter = loadJSON(COUNTER_KEY, { year: year, last: 0 });

        if (counter.year !== year) {
            counter = { year: year, last: 0 };
        }

        counter.last += 1;
        saveJSON(COUNTER_KEY, counter);

        const seq = String(counter.last).padStart(4, '0');
        return CONFIG.codePrefix + '-' + year + '-' + seq;
    }

    function generateAppTrackingNumber() {
        const year = new Date().getFullYear();
        const rand = Math.floor(1000 + Math.random() * 9000);
        return 'APP-' + year + '-' + rand;
    }

    // ==========================================
    // 📦 ساختار پایه‌ی کارگزار جدید
    // ==========================================
    function buildBrokerObject(userId, identity, contact) {
        const now = nowISO();
        return {
            id: uid('broker_'),
            userId: userId,
            code: null,                      // بعد از تأیید تولید می‌شود
            appTrackingNumber: generateAppTrackingNumber(),

            // اطلاعات هویتی
            identity: {
                firstName: identity.firstName || '',
                lastName: identity.lastName || '',
                nationalId: identity.nationalId || '',
                fatherName: identity.fatherName || '',
                birthDate: identity.birthDate || '',
                gender: identity.gender || ''
            },

            // اطلاعات تماس + آدرس
            contact: {
                mobile: contact.mobile || '',
                mobileVerifiedByOTP: true,
                mobileVerifiedAt: now,
                phone: contact.phone || '',
                email: contact.email || '',
                address: {
                    province: contact.province || '',
                    city: contact.city || '',
                    fullAddress: contact.fullAddress || '',
                    postalCode: contact.postalCode || ''
                }
            },

            // احراز هویت پیشرفته
            verification: {
                video: null,
                address: null,
                mobileOwnership: null,
                overallStatus: 'pending',
                submittedAt: null,
                reviewedAt: null,
                reviewedBy: null,
                reviewNote: null,
                rejectionReason: null
            },

            // اطلاعات حرفه‌ای
            professional: {
                contractNumber: '',
                experienceYears: 0,
                specialties: [],
                maxActiveCases: CONFIG.defaultMaxActiveCases,
                referrer: '',
                joinDate: now,
                contractStartDate: null,
                commissionPercent: CONFIG.defaultCommissionPercent,
                status: 'pending'              // pending/active/suspended/rejected
            },

            // اطلاعات بانکی
            bankAccount: {
                iban: '',
                cardNumber: '',
                bankName: '',
                accountHolder: ''
            },

            // مدارک عمومی
            documents: {
                profilePhoto: null,
                nationalIdFront: null,
                nationalIdBack: null,
                birthCertificate: null,
                brokerLicense: null,
                contractDoc: null,
                bankCard: null
            },

            // کیف پول
            wallet: {
                balance: 0,
                totalEarned: 0,
                totalWithdrawn: 0,
                locked: 0,
                transactions: []
            },

            // آمار
            stats: {
                totalCases: 0,
                activeCases: 0,
                completedCases: 0,
                rejectedCases: 0,
                successRate: 0,
                averageResponseTime: 0,
                averageCompletionTime: 0,
                rating: 0,
                totalRatings: 0,
                lastActivityAt: null
            },

            // اعلان‌ها
            notifications: [
                {
                    id: uid('notif_'),
                    type: 'info',
                    title: 'ثبت‌نام موفق',
                    message: 'حساب کارگزاری شما ایجاد شد و در انتظار تأیید است.',
                    read: false,
                    at: now
                }
            ],

            // لاگ اقدامات
            actions: [
                {
                    id: uid('act_'),
                    type: 'registered',
                    at: now,
                    by: 'system',
                    note: 'ثبت‌نام اولیه در سامانه'
                }
            ],

            createdAt: now,
            updatedAt: now
        };
    }

    // ==========================================
    // ➕ ایجاد کارگزار جدید
    // ==========================================
    function createBroker(userId, identity, contact) {
        if (!userId || !identity || !contact) {
            throw new Error('پارامترهای الزامی موجود نیست');
        }

        // بررسی یکتا بودن
        const all = getAllBrokers();

        // بررسی تکراری بودن موبایل
        if (all.some(b => b.contact.mobile === contact.mobile)) {
            throw new Error('این شماره موبایل قبلاً ثبت‌نام کرده است');
        }

        // بررسی تکراری بودن کد ملی
        if (all.some(b => b.identity.nationalId === identity.nationalId)) {
            throw new Error('این کد ملی قبلاً ثبت‌نام کرده است');
        }

        // بررسی تکراری بودن userId
        if (all.some(b => b.userId === userId)) {
            throw new Error('این کاربر قبلاً کارگزار شده است');
        }

        const broker = buildBrokerObject(userId, identity, contact);
        all.push(broker);
        saveAllBrokers(all);

        console.log('✅ کارگزار جدید ساخته شد:', {
            id: broker.id,
            appTrackingNumber: broker.appTrackingNumber,
            name: (identity.firstName || '') + ' ' + (identity.lastName || '')
        });

        return broker;
    }

    // ==========================================
    // 🔍 بازیابی کارگزار
    // ==========================================
    function getBroker(id) {
        if (!id) return null;
        return getAllBrokers().find(b => b.id === id) || null;
    }

    function getBrokerByUserId(userId) {
        if (!userId) return null;
        return getAllBrokers().find(b => b.userId === userId) || null;
    }

    function getBrokerByCode(code) {
        if (!code) return null;
        return getAllBrokers().find(b => b.code === code) || null;
    }

    function getBrokerByMobile(mobile) {
        if (!mobile) return null;
        const clean = String(mobile).replace(/\D/g, '');
        return getAllBrokers().find(b => b.contact.mobile === clean) || null;
    }

    function getBrokerByNationalId(nationalId) {
        if (!nationalId) return null;
        return getAllBrokers().find(b => b.identity.nationalId === nationalId) || null;
    }

    // ==========================================
    // ✏️ آپدیت کارگزار
    // ==========================================
    function updateBroker(id, updates) {
        const all = getAllBrokers();
        const idx = all.findIndex(b => b.id === id);
        if (idx === -1) return null;

        all[idx] = Object.assign({}, all[idx], updates, { updatedAt: nowISO() });
        saveAllBrokers(all);
        return all[idx];
    }

    function updateNested(id, path, value) {
        const all = getAllBrokers();
        const idx = all.findIndex(b => b.id === id);
        if (idx === -1) return null;

        const paths = path.split('.');
        let current = all[idx];
        for (let i = 0; i < paths.length - 1; i++) {
            if (!current[paths[i]]) current[paths[i]] = {};
            current = current[paths[i]];
        }
        current[paths[paths.length - 1]] = value;
        all[idx].updatedAt = nowISO();
        saveAllBrokers(all);
        return all[idx];
    }

    // ==========================================
    // 📋 لیست کارگزاران
    // ==========================================
    function getAllBrokersList() {
        return getAllBrokers();
    }

    function getBrokersByStatus(status) {
        return getAllBrokers().filter(b => b.professional.status === status);
    }

    function getPendingBrokers() {
        return getAllBrokers().filter(b =>
            b.professional.status === 'pending' ||
            b.verification.overallStatus === 'pending'
        );
    }

    function getActiveBrokers() {
        return getAllBrokers().filter(b => b.professional.status === 'active');
    }

    function countByStatus(status) {
        return getAllBrokers().filter(b => b.professional.status === status).length;
    }

    // ==========================================
    // ✅ تأیید کارگزار (توسط ادمین)
    // ==========================================
    function approveBroker(id, adminName, note) {
        const broker = getBroker(id);
        if (!broker) throw new Error('کارگزار یافت نشد');

        if (broker.professional.status === 'active') {
            throw new Error('این کارگزار قبلاً تأیید شده است');
        }

        // تولید کد کارگزاری در زمان تأیید
        const code = broker.code || generateBrokerCode();

        const now = nowISO();
        const all = getAllBrokers();
        const idx = all.findIndex(b => b.id === id);

        all[idx].code = code;
        all[idx].professional.status = 'active';
        all[idx].professional.contractStartDate = now;
        all[idx].verification.overallStatus = 'approved';
        all[idx].verification.reviewedAt = now;
        all[idx].verification.reviewedBy = adminName || 'مدیر ارشد';
        all[idx].verification.reviewNote = note || 'تأیید شد';
        all[idx].updatedAt = now;

        // افزودن اعلان
        all[idx].notifications.push({
            id: uid('notif_'),
            type: 'success',
            title: '🎉 حساب کارگزاری فعال شد',
            message: 'حساب کارگزاری شما با کد ' + code + ' فعال شد.',
            read: false,
            at: now
        });

        // ثبت در لاگ
        all[idx].actions.push({
            id: uid('act_'),
            type: 'approved',
            at: now,
            by: adminName || 'مدیر ارشد',
            note: note || 'تأیید توسط مدیر ارشد'
        });

        saveAllBrokers(all);

        // آپدیت کاربر مربوطه
        updateUserRole(broker.userId, 'broker', 'active');

        console.log('✅ کارگزار تأیید شد:', { id: id, code: code });
        return all[idx];
    }

    // ==========================================
    // ❌ رد کارگزار
    // ==========================================
    function rejectBroker(id, adminName, reason) {
        const broker = getBroker(id);
        if (!broker) throw new Error('کارگزار یافت نشد');

        const now = nowISO();
        const all = getAllBrokers();
        const idx = all.findIndex(b => b.id === id);

        all[idx].professional.status = 'rejected';
        all[idx].verification.overallStatus = 'rejected';
        all[idx].verification.reviewedAt = now;
        all[idx].verification.reviewedBy = adminName || 'مدیر ارشد';
        all[idx].verification.rejectionReason = reason || 'دلایل نامشخص';
        all[idx].updatedAt = now;

        all[idx].notifications.push({
            id: uid('notif_'),
            type: 'danger',
            title: '❌ درخواست رد شد',
            message: 'متأسفانه درخواست ثبت‌نام شما رد شد. دلیل: ' + (reason || 'نامشخص'),
            read: false,
            at: now
        });

        all[idx].actions.push({
            id: uid('act_'),
            type: 'rejected',
            at: now,
            by: adminName || 'مدیر ارشد',
            note: reason || ''
        });

        saveAllBrokers(all);

        console.log('❌ کارگزار رد شد:', { id: id, reason: reason });
        return all[idx];
    }

    // ==========================================
    // 🔒 تعلیق / رفع تعلیق
    // ==========================================
    function toggleBrokerStatus(id) {
        const broker = getBroker(id);
        if (!broker) throw new Error('کارگزار یافت نشد');

        const currentStatus = broker.professional.status;
        let newStatus;

        if (currentStatus === 'active') newStatus = 'suspended';
        else if (currentStatus === 'suspended') newStatus = 'active';
        else throw new Error('امکان تعلیق این کارگزار وجود ندارد');

        updateNested(id, 'professional.status', newStatus);

        // اعلان
        const now = nowISO();
        const all = getAllBrokers();
        const idx = all.findIndex(b => b.id === id);
        all[idx].notifications.push({
            id: uid('notif_'),
            type: newStatus === 'suspended' ? 'warning' : 'success',
            title: newStatus === 'suspended' ? '⚠️ حساب تعلیق شد' : '✅ حساب فعال شد',
            message: newStatus === 'suspended'
                ? 'حساب کارگزاری شما موقتاً تعلیق شده است.'
                : 'حساب کارگزاری شما مجدداً فعال شد.',
            read: false,
            at: now
        });
        saveAllBrokers(all);

        console.log('🔄 وضعیت کارگزار تغییر کرد:', { id: id, from: currentStatus, to: newStatus });
        return getBroker(id);
    }

    // ==========================================
    // 👤 آپدیت نقش کاربر (پایه)
    // ==========================================
    function updateUserRole(userId, role, status) {
        try {
            const usersRaw = localStorage.getItem('wamPayUsers');
            if (!usersRaw) return;
            const users = JSON.parse(usersRaw);
            const idx = users.findIndex(u => u.id === userId);
            if (idx === -1) return;

            users[idx].role = role;
            users[idx].status = status || 'active';
            users[idx].updatedAt = nowISO();
            localStorage.setItem('wamPayUsers', JSON.stringify(users));
        } catch (e) {
            console.warn('⚠️ خطا در آپدیت نقش کاربر:', e);
        }
    }

    // ==========================================
    // 💾 ذخیره‌سازی Draft ثبت‌نام
    // ==========================================
    function saveDraft(userId, data) {
        if (!userId) return false;
        return saveJSON(DRAFT_PREFIX + userId, {
            data: data,
            updatedAt: nowISO()
        });
    }

    function loadDraft(userId) {
        if (!userId) return null;
        const draft = loadJSON(DRAFT_PREFIX + userId, null);
        return draft ? draft.data : null;
    }

    function clearDraft(userId) {
        if (!userId) return false;
        localStorage.removeItem(DRAFT_PREFIX + userId);
        return true;
    }

    // ==========================================
    // 📊 آمار کارگزار
    // ==========================================
    function getStats(brokerId) {
        const broker = getBroker(brokerId);
        if (!broker) return null;
        return broker.stats || {};
    }

    function recalculateStats(brokerId) {
        const broker = getBroker(brokerId);
        if (!broker) return null;

        // TODO: در آینده با خواندن پرونده‌ها از CaseRepository محاسبه می‌شود
        // فعلاً آمار پایه برمی‌گرداند

        return broker.stats;
    }

    // ==========================================
    // 📋 اعلان‌ها
    // ==========================================
    function addNotification(brokerId, type, title, message) {
        const all = getAllBrokers();
        const idx = all.findIndex(b => b.id === brokerId);
        if (idx === -1) return null;

        const notif = {
            id: uid('notif_'),
            type: type || 'info',
            title: title || '',
            message: message || '',
            read: false,
            at: nowISO()
        };
        all[idx].notifications.push(notif);
        saveAllBrokers(all);
        return notif;
    }

    function markNotificationRead(brokerId, notifId) {
        const all = getAllBrokers();
        const idx = all.findIndex(b => b.id === brokerId);
        if (idx === -1) return false;

        const notif = all[idx].notifications.find(n => n.id === notifId);
        if (notif) {
            notif.read = true;
            saveAllBrokers(all);
        }
        return true;
    }

    function getUnreadNotificationsCount(brokerId) {
        const broker = getBroker(brokerId);
        if (!broker) return 0;
        return broker.notifications.filter(n => !n.read).length;
    }

    // ==========================================
    // 📝 لاگ اقدامات
    // ==========================================
    function logAction(brokerId, type, note, by) {
        const all = getAllBrokers();
        const idx = all.findIndex(b => b.id === brokerId);
        if (idx === -1) return null;

        const action = {
            id: uid('act_'),
            type: type,
            at: nowISO(),
            by: by || 'broker',
            note: note || ''
        };
        all[idx].actions.push(action);
        saveAllBrokers(all);
        return action;
    }

    // ==========================================
    // 🎯 بررسی تکمیل بودن اطلاعات
    // ==========================================
    function isRegistrationComplete(broker) {
        if (!broker) return false;

        const checks = {
            identity: !!(broker.identity.firstName && broker.identity.lastName &&
                        broker.identity.nationalId && broker.identity.birthDate),
            contact: !!(broker.contact.mobile && broker.contact.email &&
                       broker.contact.address.fullAddress && broker.contact.address.postalCode),
            video: !!(broker.verification.video && broker.verification.video.fileName),
            address: !!(broker.verification.address && broker.verification.address.postalVerified),
            mobileOwnership: !!(broker.verification.mobileOwnership && broker.verification.mobileOwnership.document),
            professional: !!(broker.professional.experienceYears !== undefined &&
                            broker.professional.specialties && broker.professional.specialties.length > 0),
            bankAccount: !!(broker.bankAccount.iban && broker.bankAccount.cardNumber && broker.bankAccount.bankName),
            documents: !!(
                broker.documents.profilePhoto &&
                broker.documents.nationalIdFront &&
                broker.documents.nationalIdBack &&
                broker.documents.birthCertificate &&
                broker.documents.brokerLicense
            )
        };

        const missing = Object.keys(checks).filter(k => !checks[k]);

        return {
            complete: missing.length === 0,
            checks: checks,
            missing: missing
        };
    }

    function markRegistrationSubmitted(brokerId) {
        const all = getAllBrokers();
        const idx = all.findIndex(b => b.id === brokerId);
        if (idx === -1) return null;

        all[idx].verification.submittedAt = nowISO();
        all[idx].updatedAt = nowISO();

        all[idx].notifications.push({
            id: uid('notif_'),
            type: 'info',
            title: '📤 درخواست ارسال شد',
            message: 'درخواست ثبت‌نام شما دریافت شد و در انتظار بررسی است.',
            read: false,
            at: nowISO()
        });

        all[idx].actions.push({
            id: uid('act_'),
            type: 'submitted',
            at: nowISO(),
            by: 'broker',
            note: 'ارسال درخواست ثبت‌نام'
        });

        saveAllBrokers(all);
        return all[idx];
    }

    // ==========================================
    // 🧪 داده‌های Mock
    // ==========================================
    function seedMockData() {
        const existing = getAllBrokers();
        if (existing.length > 0) {
            console.log('ℹ️ داده‌های Mock قبلاً بارگذاری شده‌اند');
            return;
        }

        const now = nowISO();

        // Mock ۱: کارگزار فعال (آقای محمدی)
        const broker1 = buildBrokerObject('user_demo_broker_1', {
            firstName: 'محمد',
            lastName: 'محمدی',
            nationalId: '1234567890',
            fatherName: 'علی',
            birthDate: '1360/05/15',
            gender: 'male'
        }, {
            mobile: '09121112233',
            phone: '02188776655',
            email: 'mohammadi@example.com',
            province: 'تهران',
            city: 'تهران',
            fullAddress: 'خیابان ولیعصر، کوچه بهار، پلاک ۱۲، واحد ۳',
            postalCode: '1234567890'
        });
        broker1.code = 'BRK-2026-0001';
        broker1.professional.status = 'active';
        broker1.professional.experienceYears = 5;
        broker1.professional.specialties = ['resalat', 'mehr'];
        broker1.professional.contractNumber = 'CNT-2026-001';
        broker1.professional.contractStartDate = now;
        broker1.verification.overallStatus = 'approved';
        broker1.verification.reviewedAt = now;
        broker1.verification.reviewedBy = 'مدیر ارشد';
        broker1.bankAccount = {
            iban: 'IR123456789012345678901234',
            cardNumber: '6104337812345678',
            bankName: 'بانک ملی',
            accountHolder: 'محمد محمدی'
        };
        broker1.wallet.balance = 42500000;
        broker1.wallet.totalEarned = 245000000;

        // Mock ۲: کارگزار در انتظار تأیید
        const broker2 = buildBrokerObject('user_demo_broker_2', {
            firstName: 'سارا',
            lastName: 'احمدی',
            nationalId: '0987654321',
            fatherName: 'حسین',
            birthDate: '1370/08/20',
            gender: 'female'
        }, {
            mobile: '09122223344',
            phone: '02155667788',
            email: 'ahmadi@example.com',
            province: 'اصفهان',
            city: 'اصفهان',
            fullAddress: 'خیابان چهارباغ، پلاک ۵',
            postalCode: '8145678901'
        });
        broker2.verification.submittedAt = now;
        broker2.verification.overallStatus = 'pending';

        // Mock ۳: کارگزار تعلیق‌شده
        const broker3 = buildBrokerObject('user_demo_broker_3', {
            firstName: 'رضا',
            lastName: 'کریمی',
            nationalId: '1112223334',
            fatherName: 'محمود',
            birthDate: '1355/03/10',
            gender: 'male'
        }, {
            mobile: '09123334455',
            email: 'karimi@example.com',
            province: 'شیراز',
            city: 'شیراز',
            fullAddress: 'بلوار زند، پلاک ۸',
            postalCode: '7134567890'
        });
        broker3.code = 'BRK-2026-0002';
        broker3.professional.status = 'suspended';
        broker3.professional.experienceYears = 3;
        broker3.professional.specialties = ['sepah'];
        broker3.verification.overallStatus = 'approved';
        broker3.verification.reviewedAt = now;

        const all = [broker1, broker2, broker3];
        saveAllBrokers(all);

        // آپدیت شمارنده
        saveJSON(COUNTER_KEY, { year: new Date().getFullYear(), last: 2 });

        console.log('🧪 داده‌های Mock بارگذاری شد:');
        console.log('  ۱. محمد محمدی (فعال) — BRK-2026-0001');
        console.log('  ۲. سارا احمدی (در انتظار)');
        console.log('  ۳. رضا کریمی (تعلیق‌شده) — BRK-2026-0002');
    }

    // ==========================================
    // 🧹 پاک کردن داده‌ها
    // ==========================================
    function resetAll() {
        localStorage.removeItem(BROKERS_KEY);
        localStorage.removeItem(COUNTER_KEY);
        // پاک کردن Draftها
        const keys = Object.keys(localStorage);
        keys.forEach(k => {
            if (k.startsWith(DRAFT_PREFIX)) localStorage.removeItem(k);
        });
        console.log('🧹 تمام داده‌های کارگزار پاک شد');
    }

    // ==========================================
    // 📊 خلاصه‌ی آماری کلی
    // ==========================================
    function getGlobalStats() {
        const all = getAllBrokers();
        return {
            total: all.length,
            active: all.filter(b => b.professional.status === 'active').length,
            pending: all.filter(b => b.professional.status === 'pending').length,
            suspended: all.filter(b => b.professional.status === 'suspended').length,
            rejected: all.filter(b => b.professional.status === 'rejected').length,
            totalEarned: all.reduce((sum, b) => sum + (b.wallet.totalEarned || 0), 0),
            totalBalance: all.reduce((sum, b) => sum + (b.wallet.balance || 0), 0)
        };
    }

    // ==========================================
    // 🌐 API عمومی
    // ==========================================
    window.WamPayBrokerStore = {
        // Config
        CONFIG,

        // Utils
        toPersianDigits,

        // Code generation
        generateBrokerCode,
        generateAppTrackingNumber,

        // CRUD
        createBroker,
        getBroker,
        getBrokerByUserId,
        getBrokerByCode,
        getBrokerByMobile,
        getBrokerByNationalId,
        updateBroker,
        updateNested,

        // Lists
        getAllBrokersList,
        getBrokersByStatus,
        getPendingBrokers,
        getActiveBrokers,
        countByStatus,

        // Status changes
        approveBroker,
        rejectBroker,
        toggleBrokerStatus,

        // Draft
        saveDraft,
        loadDraft,
        clearDraft,

        // Stats
        getStats,
        recalculateStats,
        getGlobalStats,

        // Notifications
        addNotification,
        markNotificationRead,
        getUnreadNotificationsCount,

        // Actions log
        logAction,

        // Registration checks
        isRegistrationComplete,
        markRegistrationSubmitted,

        // Mock & Reset
        seedMockData,
        resetAll,

        // Debug
        _dump: function () {
            return {
                brokers: getAllBrokers(),
                counter: loadJSON(COUNTER_KEY, {})
            };
        }
    };

    console.log('🏢 WamPayBrokerStore v1 آماده — سرویس مدیریت کارگزاران');
})();