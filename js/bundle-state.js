/* ==========================================
 * WAM PAY — ⚙️ State Bundle
 * ==========================================
 * 
 * Bundle خودکار
 * تعداد فایل: 7
 * تاریخ تولید: 2026-09-22T18:46:37.965Z
 * 
 * این فایل به صورت خودکار از چند فایل جداگانه
 * ادغام شده است. تغییرات مستقیم در این فایل
 * با اجرای بعدی Builder پاک می‌شوند.
 * ========================================== */




/* ==========================================
 * FROM: js/case-repository.js
 * ========================================== */


// ==========================================
// وام پی — Case Repository
// فایل: js/case-repository.js
// نسخه: ۱.۱
// تاریخ: 1405/01/15
// توضیح: مدیریت پرونده‌ها با versioning و locking
// ==========================================

(function () {
    'use strict';

    // ==========================================
    // ثوابت
    // ==========================================

    const STORAGE_KEY = 'wamPayCasesV2';
    const VERSIONS_KEY = 'wamPayCaseVersions';
    const LOCK_TIMEOUT_MS = 30 * 60 * 1000; // 30 دقیقه
    const MAX_VERSIONS = 20;
    const TOTAL_STEPS = 8;

    // ==========================================
    // توابع کمکی
    // ==========================================

    function deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch (e) {
            return obj;
        }
    }

    function deepMerge(target, source) {
        const result = deepClone(target);
        if (!source) return result;

        Object.keys(source).forEach(function (key) {
            const sv = source[key];
            const tv = result[key];

            if (sv === null || sv === undefined) {
                result[key] = sv;
            } else if (Array.isArray(sv)) {
                result[key] = deepClone(sv);
            } else if (typeof sv === 'object') {
                if (tv && typeof tv === 'object' && !Array.isArray(tv)) {
                    result[key] = deepMerge(tv, sv);
                } else {
                    result[key] = deepClone(sv);
                }
            } else {
                result[key] = sv;
            }
        });

        return result;
    }

    // ==========================================
    // ساختار اولیه
    // ==========================================

    function ensureStructure() {
        if (!Storage.has(STORAGE_KEY)) {
            Storage.setJSON(STORAGE_KEY, { version: 2, cases: {} });
        }
        if (!Storage.has(VERSIONS_KEY)) {
            Storage.setJSON(VERSIONS_KEY, {});
        }
    }

    function loadStore() {
        ensureStructure();
        const store = Storage.getJSON(STORAGE_KEY, { version: 2, cases: {} });
        if (!store.cases) store.cases = {};
        return store;
    }

    function saveStore(store) {
        return Storage.setJSON(STORAGE_KEY, store);
    }

    function loadVersions() {
        ensureStructure();
        return Storage.getJSON(VERSIONS_KEY, {});
    }

    function saveVersions(versions) {
        return Storage.setJSON(VERSIONS_KEY, versions);
    }

    // ==========================================
    // ساخت تأییدهای خالی
    // ==========================================

    function createEmptyApprovals() {
        const approvals = {};
        for (let i = 0; i <= TOTAL_STEPS; i++) {
            approvals[i] = {
                status: 'pending',
                approvedBy: null,
                approvedAt: null,
                note: ''
            };
        }
        return approvals;
    }

    // ==========================================
    // خواندن پرونده
    // ==========================================

    function get(caseId) {
        if (!caseId) return null;

        const store = loadStore();
        const record = store.cases[caseId];
        if (!record) return null;

        // بررسی lock timeout
        if (record._meta && record._meta.lockedBy) {
            const lockedAt = new Date(record._meta.lockedAt).getTime();
            if (Date.now() - lockedAt > LOCK_TIMEOUT_MS) {
                record._meta.lockedBy = null;
                record._meta.lockedAt = null;
                store.cases[caseId] = record;
                saveStore(store);
            }
        }

        return deepClone(record.data);
    }

    function getMeta(caseId) {
        if (!caseId) return null;
        const store = loadStore();
        const record = store.cases[caseId];
        return record ? deepClone(record._meta) : null;
    }

    function getAll() {
        const store = loadStore();
        return Object.keys(store.cases).map(function (id) {
            return deepClone(store.cases[id].data);
        });
    }

    function find(predicate) {
        return getAll().filter(predicate);
    }

    // ==========================================
    // ساخت پرونده
    // ==========================================

    function create(caseData, options) {
        options = options || {};

        if (!caseData || !caseData.caseId) {
            console.error('❌ CaseRepository.create: caseId الزامی');
            return null;
        }

        const store = loadStore();

        // اگر قبلاً وجود دارد، برنگردان
        if (store.cases[caseData.caseId]) {
            return null;
        }

        const now = new Date().toISOString();

        const completeData = Object.assign({
            caseId: caseData.caseId,
            id: caseData.id || caseData.caseId,
            createdAt: caseData.createdAt || now,
            updatedAt: now,
            currentStep: caseData.currentStep || 0,
            status: caseData.status || 'new',
            adminApprovals: caseData.adminApprovals || createEmptyApprovals(),
            events: caseData.events || [],
            steps: caseData.steps || {}
        }, caseData);

        store.cases[caseData.caseId] = {
            _meta: {
                version: 1,
                lockedBy: null,
                lockedAt: null,
                lastUpdatedBy: options.userId || 'system',
                createdAt: now,
                updatedAt: now
            },
            data: completeData
        };

        saveStore(store);
        addVersion(caseData.caseId, 1, { action: 'create' }, options.userId);

        if (window.EventBus && window.CaseEvents) {
            window.EventBus.emit(window.CaseEvents.CREATED, {
                caseId: caseData.caseId,
                data: completeData
            });
        }

        return deepClone(completeData);
    }

    // ==========================================
    // به‌روزرسانی پرونده
    // ==========================================

    function update(caseId, patch, options) {
        options = options || {};

        if (!caseId) return null;

        const store = loadStore();
        const record = store.cases[caseId];

        if (!record) {
            console.error('❌ پرونده پیدا نشد:', caseId);
            return null;
        }

        // بررسی lock
        if (record._meta.lockedBy &&
            record._meta.lockedBy !== options.userId &&
            !options.force) {

            if (window.WamUI) {
                window.WamUI.toast(
                    'این پرونده در حال ویرایش توسط کاربر دیگری است.',
                    'warning',
                    4000,
                    { title: '🔒 قفل شده' }
                );
            }

            if (window.EventBus && window.CaseEvents) {
                window.EventBus.emit(window.CaseEvents.LOCK_ERROR, {
                    caseId: caseId,
                    lockedBy: record._meta.lockedBy
                });
            }
            return null;
        }

        // بررسی نسخه (اختیاری)
        if (options.expectedVersion !== undefined &&
            record._meta.version !== options.expectedVersion) {
            return null;
        }

        const now = new Date().toISOString();
        const newVersion = record._meta.version + 1;

        const updatedData = deepMerge(record.data, patch);
        updatedData.updatedAt = now;

        store.cases[caseId] = {
            _meta: Object.assign({}, record._meta, {
                version: newVersion,
                lastUpdatedBy: options.userId || 'system',
                updatedAt: now
            }),
            data: updatedData
        };

        saveStore(store);
        addVersion(caseId, newVersion, patch, options.userId);

        if (window.EventBus && window.CaseEvents) {
            window.EventBus.emit(window.CaseEvents.UPDATED, {
                caseId: caseId,
                patch: patch,
                data: updatedData,
                version: newVersion,
                by: options.userId
            });
        }

        return deepClone(updatedData);
    }

    // ==========================================
    // حذف پرونده
    // ==========================================

    function remove(caseId) {
        if (!caseId) return false;

        const store = loadStore();
        if (!store.cases[caseId]) return false;

        delete store.cases[caseId];
        saveStore(store);

        const versions = loadVersions();
        delete versions[caseId];
        saveVersions(versions);

        if (window.EventBus && window.CaseEvents) {
            window.EventBus.emit(window.CaseEvents.DELETED, { caseId: caseId });
        }

        return true;
    }

    // ==========================================
    // قفل و بازکردن
    // ==========================================

    function lock(caseId, userId) {
        if (!caseId || !userId) return false;

        const store = loadStore();
        const record = store.cases[caseId];
        if (!record) return false;

        // اگر خودش قفل کرده
        if (record._meta.lockedBy === userId) return true;

        // اگر قفل دارد
        if (record._meta.lockedBy) {
            const lockedAt = new Date(record._meta.lockedAt).getTime();
            if (Date.now() - lockedAt < LOCK_TIMEOUT_MS) {
                return false;
            }
        }

        record._meta.lockedBy = userId;
        record._meta.lockedAt = new Date().toISOString();
        saveStore(store);

        if (window.EventBus && window.CaseEvents) {
            window.EventBus.emit(window.CaseEvents.LOCKED, {
                caseId: caseId,
                userId: userId
            });
        }

        return true;
    }

    function unlock(caseId, userId) {
        if (!caseId) return false;

        const store = loadStore();
        const record = store.cases[caseId];
        if (!record) return false;

        // اگر userId داده شده و مطابق نیست
        if (userId && record._meta.lockedBy !== userId) return false;

        record._meta.lockedBy = null;
        record._meta.lockedAt = null;
        saveStore(store);

        if (window.EventBus && window.CaseEvents) {
            window.EventBus.emit(window.CaseEvents.UNLOCKED, {
                caseId: caseId,
                userId: userId
            });
        }

        return true;
    }

    function isLocked(caseId, userId) {
        const meta = getMeta(caseId);
        if (!meta || !meta.lockedBy) return false;
        if (userId && meta.lockedBy === userId) return false;

        const lockedAt = new Date(meta.lockedAt).getTime();
        if (Date.now() - lockedAt > LOCK_TIMEOUT_MS) return false;

        return true;
    }

    function canEdit(caseId, userId) {
        if (!caseId || !userId) return false;
        const meta = getMeta(caseId);
        if (!meta) return false;
        if (!meta.lockedBy || meta.lockedBy === userId) return true;

        const lockedAt = new Date(meta.lockedAt).getTime();
        if (Date.now() - lockedAt > LOCK_TIMEOUT_MS) return true;

        return false;
    }

    // ==========================================
    // نسخه‌بندی
    // ==========================================

    function addVersion(caseId, version, patch, userId) {
        const versions = loadVersions();
        if (!versions[caseId]) versions[caseId] = [];

        versions[caseId].push({
            version: version,
            patch: deepClone(patch),
            by: userId || 'system',
            at: new Date().toISOString()
        });

        // حفظ حداکثر نسخه‌ها
        if (versions[caseId].length > MAX_VERSIONS) {
            versions[caseId] = versions[caseId].slice(-MAX_VERSIONS);
        }

        saveVersions(versions);
    }

    function getVersionHistory(caseId) {
        const versions = loadVersions();
        return versions[caseId] || [];
    }

    function rollback(caseId, version, options) {
        options = options || {};

        const versions = getVersionHistory(caseId);
        const target = versions.find(function (v) {
            return v.version === version;
        });

        if (!target) return null;

        const current = get(caseId);
        if (!current) return null;

        const rolledBack = deepMerge(current, target.patch);

        const updated = update(caseId, rolledBack, {
            userId: options.userId,
            force: true
        });

        if (window.EventBus && window.CaseEvents) {
            window.EventBus.emit(window.CaseEvents.ROLLED_BACK, {
                caseId: caseId,
                toVersion: version,
                by: options.userId
            });
        }

        return updated;
    }

    // ==========================================
    // Export
    // ==========================================

    window.CaseRepository = {
        get: get,
        getMeta: getMeta,
        getAll: getAll,
        find: find,
        create: create,
        update: update,
        delete: remove,
        lock: lock,
        unlock: unlock,
        isLocked: isLocked,
        canEdit: canEdit,
        getVersionHistory: getVersionHistory,
        rollback: rollback,
        createEmptyApprovals: createEmptyApprovals,
        STORAGE_KEY: STORAGE_KEY,
        VERSIONS_KEY: VERSIONS_KEY,
        LOCK_TIMEOUT_MS: LOCK_TIMEOUT_MS
    };

    // ==========================================
    // لاگ راه‌اندازی
    // ==========================================

    console.log('✅ CaseRepository آماده');

})();




/* ==========================================
 * FROM: js/migrations.js
 * ========================================== */


// ==========================================
// وام پی — Migrations
// فایل: js/migrations.js
// نسخه: ۱.۱
// تاریخ: 1405/01/15
// توضیح: مهاجرت داده‌های V1 به V2 با progress
// ==========================================

(function () {
    'use strict';

    // ==========================================
    // ثوابت
    // ==========================================

    const FLAG_KEY = 'wamPayMigrationV2';
    const CURRENT_VERSION = 2;
    const TOTAL_STEPS = 8;
    const BATCH_SIZE = 5;   // تعداد پرونده در هر batch
    const BATCH_DELAY = 20; // ms بین batch ها

    // ==========================================
    // اجرای همه migrations (Async)
    // ==========================================

    function runAll() {

        return new Promise(function (resolve) {

            const lastVersion = parseInt(Storage.get(FLAG_KEY, '0'), 10) || 0;

            // اگر از قبل migration شده
            if (lastVersion >= CURRENT_VERSION) {
                console.log('✅ Migration لازم نیست');
                resolve({ ok: true, migrated: 0, skipped: true });
                return;
            }

            console.log('🔄 Migration از v' + lastVersion + ' به v' + CURRENT_VERSION);

            if (window.WamUI) {
                window.WamUI.loader.update(10, 'آماده‌سازی مهاجرت...');
            }

            // اجرای migration
            if (lastVersion < 2) {
                migrateToV2().then(function (result) {

                    Storage.set(FLAG_KEY, String(CURRENT_VERSION));

                    if (window.WamUI) {
                        window.WamUI.loader.update(100, 'تکمیل شد');
                    }

                    if (window.EventBus && window.CaseEvents) {
                        window.EventBus.emit(window.CaseEvents.MIGRATION_DONE, result);
                    }

                    resolve(result);
                });
            } else {
                Storage.set(FLAG_KEY, String(CURRENT_VERSION));
                resolve({ ok: true, migrated: 0 });
            }

        });
    }

    // ==========================================
    // Migration به V2 (Async با progress)
    // ==========================================

    function migrateToV2() {

        return new Promise(function (resolve) {

            // خواندن داده‌های قدیمی
            let oldCases = Storage.getJSON('wamPayCases', []);
            let oldApps = Storage.getJSON('wamPayApplications', []);

            if (!Array.isArray(oldCases)) oldCases = [];
            if (!Array.isArray(oldApps)) oldApps = [];

            console.log('  📋 wamPayCases:', oldCases.length);
            console.log('  📋 wamPayApplications:', oldApps.length);

            // ادغام در یک Map (بدون تکرار)
            const allMap = new Map();

            oldCases.forEach(function (c) {
                const caseId = c.caseId || c.id;
                if (caseId) allMap.set(caseId, c);
            });

            oldApps.forEach(function (a) {
                const caseId = a.caseId || a.id;
                if (!caseId) return;

                if (allMap.has(caseId)) {
                    allMap.set(caseId, deepMerge(allMap.get(caseId), a));
                } else {
                    allMap.set(caseId, a);
                }
            });

            const total = allMap.size;
            console.log('  📊 یکتا:', total);

            if (window.WamUI) {
                window.WamUI.loader.update(20, total + ' پرونده آماده مهاجرت...');
            }

            // اگر خالی
            if (total === 0) {
                backupOldData();
                resolve({ ok: true, migrated: 0, from: 0, to: 2 });
                return;
            }

            // آماده‌سازی لیست
            const entries = Array.from(allMap.entries());
            let processed = 0;
            let migrated = 0;
            let errors = 0;

            // پردازش batch به batch
            function processBatch() {

                const batch = entries.slice(processed, processed + BATCH_SIZE);

                // تمام شد
                if (batch.length === 0) {
                    backupOldData();

                    console.log('  ✅ موفق:', migrated);
                    if (errors > 0) console.log('  ❌ ناموفق:', errors);

                    resolve({
                        ok: true,
                        migrated: migrated,
                        errors: errors,
                        from: 0,
                        to: 2
                    });
                    return;
                }

                // پردازش هر پرونده
                batch.forEach(function (entry) {
                    const caseId = entry[0];
                    const caseData = entry[1];

                    try {
                        const prepared = prepareForV2(caseData);
                        const result = window.CaseRepository.create(prepared, {
                            userId: 'migration'
                        });

                        if (result) migrated++;
                        else errors++;
                    } catch (e) {
                        errors++;
                        console.warn('خطا:', caseId, e.message);
                    }
                });

                processed += batch.length;

                // بروزرسانی progress
                const percent = 20 + Math.round((processed / total) * 70);

                if (window.WamUI) {
                    window.WamUI.loader.update(
                        percent,
                        processed + ' از ' + total + ' پرونده...'
                    );
                }

                // batch بعدی
                setTimeout(processBatch, BATCH_DELAY);
            }

            // شروع
            processBatch();

        });
    }

    // ==========================================
    // آماده‌سازی پرونده برای V2
    // ==========================================

    function prepareForV2(caseData) {

        const prepared = deepClone(caseData);

        // تنظیم caseId و id
        prepared.caseId = prepared.caseId || prepared.id || ('WP-' + Date.now());
        prepared.id = prepared.id || prepared.caseId;

        // تنظیم currentStep
        if (typeof prepared.currentStep !== 'number') {
            prepared.currentStep = 0;
        }

        // ساخت adminApprovals
        if (!prepared.adminApprovals) {
            prepared.adminApprovals = {};
            for (let i = 0; i <= TOTAL_STEPS; i++) {
                const isCompleted = i < prepared.currentStep;
                prepared.adminApprovals[i] = {
                    status: isCompleted ? 'approved' : 'pending',
                    approvedBy: isCompleted ? 'migration' : null,
                    approvedAt: isCompleted ? (prepared.createdAt || new Date().toISOString()) : null,
                    note: 'مهاجرت خودکار'
                };
            }
        }

        // ساخت events
        if (!prepared.events) prepared.events = [];

        prepared.events.push({
            id: 'evt_mig_' + Date.now(),
            type: 'migration',
            label: 'مهاجرت از ساختار قدیمی',
            details: 'اطلاعات از ساختار V1 منتقل شد',
            by: 'system',
            byId: 'migration',
            at: new Date().toISOString()
        });

        // ساخت steps
        if (!prepared.steps) prepared.steps = {};

        return prepared;
    }

    // ==========================================
    // بک‌آپ داده‌های قدیمی
    // ==========================================

    function backupOldData() {

        const oldCases = Storage.get('wamPayCases');
        const oldApps = Storage.get('wamPayApplications');

        if (oldCases) {
            Storage.set('wamPayCases_backup_v1', oldCases);
        }

        if (oldApps) {
            Storage.set('wamPayApplications_backup_v1', oldApps);
        }

        console.log('  💾 بک‌آپ گرفته شد');
    }

    // ==========================================
    // بازگردانی از بک‌آپ
    // ==========================================

    function restoreFromBackup() {

        const backupCases = Storage.get('wamPayCases_backup_v1');
        const backupApps = Storage.get('wamPayApplications_backup_v1');

        if (backupCases) Storage.set('wamPayCases', backupCases);
        if (backupApps) Storage.set('wamPayApplications', backupApps);

        Storage.remove(FLAG_KEY);
        Storage.remove('wamPayCasesV2');
        Storage.remove('wamPayCaseVersions');

        console.log('✅ بازگردانی انجام شد');
        return true;
    }

    // ==========================================
    // وضعیت Migration
    // ==========================================

    function getStatus() {
        const lastVersion = parseInt(Storage.get(FLAG_KEY, '0'), 10) || 0;
        return {
            currentVersion: lastVersion,
            targetVersion: CURRENT_VERSION,
            needsMigration: lastVersion < CURRENT_VERSION,
            hasBackup: Storage.has('wamPayCases_backup_v1') ||
                       Storage.has('wamPayApplications_backup_v1')
        };
    }

    // ==========================================
    // توابع کمکی
    // ==========================================

    function deepMerge(target, source) {

        const result = JSON.parse(JSON.stringify(target));
        if (!source) return result;

        Object.keys(source).forEach(function (key) {
            const sv = source[key];
            const tv = result[key];

            if (sv === null || sv === undefined) {
                result[key] = sv;
            } else if (Array.isArray(sv)) {
                result[key] = JSON.parse(JSON.stringify(sv));
            } else if (typeof sv === 'object') {
                if (tv && typeof tv === 'object' && !Array.isArray(tv)) {
                    result[key] = deepMerge(tv, sv);
                } else {
                    result[key] = JSON.parse(JSON.stringify(sv));
                }
            } else {
                result[key] = sv;
            }
        });

        return result;
    }

    function deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch (e) {
            return obj;
        }
    }

    // ==========================================
    // Export
    // ==========================================

    window.Migrations = {
        runAll: runAll,
        restoreFromBackup: restoreFromBackup,
        getStatus: getStatus,
        CURRENT_VERSION: CURRENT_VERSION,
        FLAG_KEY: FLAG_KEY
    };

    // ==========================================
    // لاگ راه‌اندازی
    // ==========================================

    console.log('✅ Migrations آماده (Async + Mobile)');

})();




/* ==========================================
 * FROM: js/init.js
 * ========================================== */


// ==========================================
// وام پی — Core Layer
// فایل: init.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: راه‌اندازی هسته، اجرای migrations، ساخت WamPay API
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔒 بررسی وجود وابستگی‌ها
    // ─────────────────────────────────────
    function checkDependencies() {
        var missing = [];
        if (typeof Storage === 'undefined' || !Storage.PREFIX) missing.push('storage.js');
        if (typeof EventBus === 'undefined') missing.push('event-bus.js');
        if (typeof WamUI === 'undefined') missing.push('ui-feedback.js');
        if (typeof CaseRepository === 'undefined') missing.push('case-repository.js');
        if (typeof Migrations === 'undefined') missing.push('migrations.js');

        return {
            ok: missing.length === 0,
            missing: missing
        };
    }

    // ─────────────────────────────────────
    // 🩺 بررسی سلامت هسته
    // ─────────────────────────────────────
    function healthCheck() {
        var report = {
            storage: Storage.isAvailable(),
            caseRepo: typeof CaseRepository.getAll === 'function',
            eventBus: typeof EventBus.emit === 'function',
            ui: typeof WamUI.toast === 'function',
            migrations: typeof Migrations.runAll === 'function',
            timestamp: Date.now()
        };
        report.ok = report.storage && report.caseRepo &&
                    report.eventBus && report.ui && report.migrations;
        return report;
    }

    // ─────────────────────────────────────
    // 🚀 اجرای migrations
    // ─────────────────────────────────────
    function runMigrations() {
        try {
            var status = Migrations.getStatus();
            if (!status.needsMigration) {
                return Promise.resolve({
                    ok: true,
                    skipped: true,
                    message: 'نیازی به مهاجرت نیست'
                });
            }

            // نمایش loader در صورت وجود UI
            if (WamUI && WamUI.loader && typeof WamUI.loader.show === 'function') {
                WamUI.loader.show('وام پی', 'در حال به‌روزرسانی داده‌ها...');
            }

            return Migrations.runAll().then(function (result) {
                if (WamUI && WamUI.loader && typeof WamUI.loader.hide === 'function') {
                    WamUI.loader.hide();
                }

                if (result && result.migrated > 0) {
                    WamUI.toastSuccess(
                        result.migrated + ' پرونده با موفقیت مهاجرت شد',
                        'به‌روزرسانی'
                    );
                }

                EventBus.emit(CaseEvents.MIGRATION_DONE, result);
                return result;
            }).catch(function (err) {
                if (WamUI && WamUI.loader && typeof WamUI.loader.hide === 'function') {
                    WamUI.loader.hide();
                }
                console.error('[WamPay:init] خطا در مهاجرت:', err);
                WamUI.toastError('خطا در به‌روزرسانی داده‌ها', 'خطا');
                return { ok: false, error: err };
            });
        } catch (err) {
            console.error('[WamPay:init] خطای غیرمنتظره در migrations:', err);
            return Promise.resolve({ ok: false, error: err });
        }
    }

    // ─────────────────────────────────────
    // 📊 بررسی ظرفیت Storage
    // ─────────────────────────────────────
    function checkStorageCapacity() {
        try {
            var info = Storage.getInfo();
            if (info.percent >= 90) {
                EventBus.emit(CaseEvents.STORAGE_FULL, info);
                WamUI.toastWarning(
                    'فضای ذخیره‌سازی تقریباً پر است (' + info.percent + '%)',
                    'هشدار'
                );
            }
            return info;
        } catch (err) {
            console.warn('[WamPay:init] خطا در بررسی ظرفیت:', err);
            return null;
        }
    }

    // ─────────────────────────────────────
    // 🌐 ساخت API جهانی WamPay
    // ─────────────────────────────────────
    function buildWamPayAPI() {
        var api = {
            version: '1.0.0',
            buildDate: '1405/01/15',

            // ماژول‌های اصلی
            storage: Storage,
            events: EventBus,
            ui: WamUI,
            cases: CaseRepository,
            migrations: Migrations,

            // ثابت‌های رویداد
            CaseEvents: CaseEvents,

            // ابزارها
            health: healthCheck,
            isReady: false,
            readyAt: null
        };

        // متدهای میان‌بر پرکاربرد
        api.getCase = function (id) { return CaseRepository.get(id); };
        api.getAllCases = function () { return CaseRepository.getAll(); };
        api.on = function (evt, fn, opts) { return EventBus.on(evt, fn, opts); };
        api.emit = function (evt, data) { return EventBus.emit(evt, data); };
        api.toast = function (msg, type, dur) { return WamUI.toast(msg, type, dur); };

        return api;
    }

    // ─────────────────────────────────────
    // 🎬 اجرای اصلی init
    // ─────────────────────────────────────
    function init() {
        console.log('%c🚀 وام پی — راه‌اندازی هسته', 'color:#d4a62a;font-weight:bold;font-size:14px');

        // ۱. بررسی وابستگی‌ها
        var deps = checkDependencies();
        if (!deps.ok) {
            console.error('[WamPay:init] ❌ وابستگی‌های گم‌شده:', deps.missing);
            if (typeof WamUI !== 'undefined' && WamUI.toastError) {
                WamUI.toastError('خطا در راه‌اندازی: فایل‌های هسته ناقص هستند', 'خطای بحرانی');
            }
            return;
        }
        console.log('%c✅ وابستگی‌ها بررسی شد', 'color:#105b35;font-weight:bold');

        // ۲. بررسی سلامت
        var health = healthCheck();
        if (!health.ok) {
            console.error('[WamPay:init] ❌ هسته ناسالم:', health);
            return;
        }
        console.log('%c✅ سلامت هسته تأیید شد', 'color:#105b35;font-weight:bold');

        // ۳. ثبت API جهانی
        window.WamPay = buildWamPayAPI();

        // ۴. بررسی ظرفیت Storage
        var storageInfo = checkStorageCapacity();
        if (storageInfo) {
            console.log('[WamPay:init] وضعیت Storage:',
                storageInfo.sizeKB + 'KB',
                '(' + storageInfo.percent + '%)');
        }

        // ۵. اجرای migrations (async)
        runMigrations().then(function (result) {
            // ۶. علامت‌گذاری آماده بودن
            window.WamPay.isReady = true;
            window.WamPay.readyAt = Date.now();

            // ۷. اعلام رویداد آماده بودن هسته
            EventBus.emit(CaseEvents.CORE_READY, {
                version: window.WamPay.version,
                readyAt: window.WamPay.readyAt,
                migration: result
            });

            console.log(
                '%c✅ هسته وام پی آماده است',
                'color:#d4a62a;font-weight:bold;font-size:14px'
            );
            console.log('[WamPay:init] WamPay API: window.WamPay');
        });
    }

    // ─────────────────────────────────────
    // 🚦 راه‌اندازی بر اساس وضعیت DOM
    // ─────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOM آماده است
        init();
    }

    // ─────────────────────────────────────
    // 📤 خروجی‌ها برای debug
    // ─────────────────────────────────────
    window.WamPayInit = {
        init: init,
        healthCheck: healthCheck,
        checkDependencies: checkDependencies
    };

})();




/* ==========================================
 * FROM: js/step-guards.js
 * ========================================== */


// ==========================================
// وام پی — State Layer
// فایل: step-guards.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: نگهبان مراحل پرونده — بررسی پیش‌نیازها، دسترسی و اعتبار
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 📋 تعریف ۹ مرحله پرونده
    // ─────────────────────────────────────
    var STEPS = [
        {
            id: 'step_1',
            index: 1,
            key: 'registration',
            title: 'ثبت درخواست',
            description: 'ثبت اطلاعات اولیه متقاضی و مبلغ وام',
            roles: ['applicant', 'broker'],
            dependencies: [],
            requiredFields: ['bank', 'loanAmount', 'applicantName', 'applicantMobile']
        },
        {
            id: 'step_2',
            index: 2,
            key: 'documents',
            title: 'بارگذاری مدارک',
            description: 'بارگذاری مدارک هویتی و مالی',
            roles: ['applicant', 'broker'],
            dependencies: ['step_1'],
            requiredFields: ['documents']
        },
        {
            id: 'step_3',
            index: 3,
            key: 'initial_review',
            title: 'بررسی اولیه',
            description: 'بررسی اولیه صحت مدارک',
            roles: ['verifier', 'admin', 'super_admin'],
            dependencies: ['step_2'],
            requiredFields: []
        },
        {
            id: 'step_4',
            index: 4,
            key: 'verification',
            title: 'اعتبارسنجی',
            description: 'اعتبارسنجی نهایی متقاضی',
            roles: ['verifier', 'admin', 'super_admin'],
            dependencies: ['step_3'],
            requiredFields: []
        },
        {
            id: 'step_5',
            index: 5,
            key: 'admin_approval',
            title: 'تأیید ادمین',
            description: 'تأیید نهایی توسط ادمین',
            roles: ['admin', 'super_admin'],
            dependencies: ['step_4'],
            requiredFields: []
        },
        {
            id: 'step_6',
            index: 6,
            key: 'submit_to_bank',
            title: 'ارسال به بانک',
            description: 'ارسال پرونده به بانک مربوطه',
            roles: ['admin', 'super_admin'],
            dependencies: ['step_5'],
            requiredFields: []
        },
        {
            id: 'step_7',
            index: 7,
            key: 'bank_approval',
            title: 'تأیید بانک',
            description: 'دریافت تأییدیه از بانک',
            roles: ['admin', 'super_admin'],
            dependencies: ['step_6'],
            requiredFields: []
        },
        {
            id: 'step_8',
            index: 8,
            key: 'contract',
            title: 'تنظیم قرارداد',
            description: 'تنظیم و امضای قرارداد',
            roles: ['admin', 'broker', 'super_admin'],
            dependencies: ['step_7'],
            requiredFields: ['contractNumber']
        },
        {
            id: 'step_9',
            index: 9,
            key: 'disbursement',
            title: 'پرداخت',
            description: 'پرداخت وام و بستن پرونده',
            roles: ['admin', 'super_admin'],
            dependencies: ['step_8'],
            requiredFields: []
        }
    ];

    // وضعیت‌های مجاز هر مرحله
    var STEP_STATUS = {
        PENDING:     'pending',
        IN_PROGRESS: 'in_progress',
        COMPLETED:   'completed',
        REJECTED:    'rejected',
        BLOCKED:     'blocked',
        SKIPPED:     'skipped'
    };

    // وضعیت‌های قفل‌کننده پرونده (اجازه هیچ تغییری نمی‌دهند)
    var FROZEN_CASE_STATUSES = ['completed', 'cancelled', 'archived', 'rolledback'];

    // رویدادها
    var StepGuardEvents = {
        GUARD_PASSED: 'step.guard.passed',
        GUARD_FAILED: 'step.guard.failed'  // رزرو — فعلاً emit نمی‌شود
    };

    // ─────────────────────────────────────
    // 🔍 توابع کمکی داخلی
    // ─────────────────────────────────────
    function getStepById(stepId) {
        for (var i = 0; i < STEPS.length; i++) {
            if (STEPS[i].id === stepId) return STEPS[i];
        }
        return null;
    }

    function getStepByIndex(index) {
        if (index < 1 || index > STEPS.length) return null;
        return STEPS[index - 1];
    }

    function getStepState(caseData, stepId) {
        if (!caseData || !caseData.steps) return null;
        return caseData.steps[stepId] || null;
    }

    function getPreviousStep(stepId) {
        var step = getStepById(stepId);
        if (!step || step.index <= 1) return null;
        return getStepByIndex(step.index - 1);
    }

    function getNextStep(stepId) {
        var step = getStepById(stepId);
        if (!step || step.index >= STEPS.length) return null;
        return getStepByIndex(step.index + 1);
    }

    // ─────────────────────────────────────
    // ✅ بررسی وضعیت یک مرحله
    // ─────────────────────────────────────
    function isStepCompleted(caseData, stepId) {
        var s = getStepState(caseData, stepId);
        return !!(s && s.status === STEP_STATUS.COMPLETED);
    }

    function isStepRejected(caseData, stepId) {
        var s = getStepState(caseData, stepId);
        return !!(s && s.status === STEP_STATUS.REJECTED);
    }

    function isStepBlocked(caseData, stepId) {
        var s = getStepState(caseData, stepId);
        return !!(s && s.status === STEP_STATUS.BLOCKED);
    }

    function isStepInProgress(caseData, stepId) {
        var s = getStepState(caseData, stepId);
        return !!(s && s.status === STEP_STATUS.IN_PROGRESS);
    }

    function isStepPending(caseData, stepId) {
        var s = getStepState(caseData, stepId);
        return !s || s.status === STEP_STATUS.PENDING;
    }

    // ─────────────────────────────────────
    // 🚦 بررسی پیش‌نیازها
    // ─────────────────────────────────────
    function checkDependencies(caseData, step) {
        var missing = [];
        if (!step || !step.dependencies) return missing;
        for (var i = 0; i < step.dependencies.length; i++) {
            var depId = step.dependencies[i];
            if (!isStepCompleted(caseData, depId)) {
                var dep = getStepById(depId);
                missing.push(dep ? dep.title : depId);
            }
        }
        return missing;
    }

    // ─────────────────────────────────────
    // 🔐 بررسی دسترسی نقش
    // ─────────────────────────────────────
    function hasRoleAccess(step, role) {
        if (!step || !step.roles || step.roles.length === 0) return true;
        if (!role) return false;
        return step.roles.indexOf(role) !== -1;
    }

    // ─────────────────────────────────────
    // 📝 اعتبارسنجی فیلدهای اجباری
    // ─────────────────────────────────────
    function validateRequiredFields(caseData, step) {
        var missing = [];
        if (!step || !step.requiredFields) return missing;
        for (var i = 0; i < step.requiredFields.length; i++) {
            var field = step.requiredFields[i];
            var value = caseData ? caseData[field] : null;
            var isEmpty = value === undefined || value === null || value === '';
            if (!isEmpty && Object.prototype.toString.call(value) === '[object Array]' && value.length === 0) {
                isEmpty = true;
            }
            if (isEmpty) missing.push(field);
        }
        return missing;
    }

    // ─────────────────────────────────────
    // 🧊 بررسی قفل پرونده
    // ─────────────────────────────────────
    function checkLock(caseId, userId) {
        if (typeof CaseRepository === 'undefined') return { ok: true };
        if (CaseRepository.isLocked(caseId, userId)) {
            var meta = CaseRepository.getMeta(caseId);
            return {
                ok: false,
                reason: 'پرونده در حال ویرایش توسط کاربر دیگری است',
                lockedBy: meta ? meta.lockedBy : null
            };
        }
        return { ok: true };
    }

    // ─────────────────────────────────────
    // 🎯 هسته داخلی: _canEnter (بدون emit)
    // ─────────────────────────────────────
    function _canEnter(caseId, stepId, options) {
        options = options || {};

        var result = {
            ok: false,
            stepId: stepId,
            reasons: [],
            step: getStepById(stepId)
        };

        // ۱. CaseRepository در دسترس؟
        if (typeof CaseRepository === 'undefined') {
            result.reasons.push('CaseRepository در دسترس نیست');
            return result;
        }

        // ۲. پرونده وجود دارد؟
        var caseData = CaseRepository.get(caseId);
        if (!caseData) {
            result.reasons.push('پرونده یافت نشد');
            return result;
        }
        result.caseData = caseData;

        // ۳. مرحله معتبر است؟
        if (!result.step) {
            result.reasons.push('مرحله نامعتبر است: ' + stepId);
            return result;
        }

        // ۴. پرونده در وضعیت قفل‌شده نیست؟
        if (FROZEN_CASE_STATUSES.indexOf(caseData.status) !== -1) {
            result.reasons.push('پرونده در وضعیت «' + caseData.status + '» است و قابل ویرایش نیست');
            return result;
        }

        // ۵. نقش دسترسی دارد؟
        if (options.role && !hasRoleAccess(result.step, options.role)) {
            result.reasons.push('نقش شما اجازه دسترسی به این مرحله را ندارد');
            return result;
        }

        // ۶. پیش‌نیازها تکمیل شده‌اند؟
        var missingDeps = checkDependencies(caseData, result.step);
        if (missingDeps.length > 0) {
            result.reasons.push('مراحل پیش‌نیاز تکمیل نشده: ' + missingDeps.join('، '));
            result.missingDependencies = missingDeps;
            return result;
        }

        // ۷. مرحله رد نشده باشد؟
        if (isStepRejected(caseData, stepId)) {
            result.reasons.push('این مرحله رد شده است. ابتدا باید اصلاح شود');
            return result;
        }

        // ۸. قفل توسط دیگری نباشد؟
        var lockCheck = checkLock(caseId, options.userId);
        if (!lockCheck.ok) {
            result.reasons.push(lockCheck.reason);
            result.lockedBy = lockCheck.lockedBy;
            return result;
        }

        // ✅ همه چیز OK
        result.ok = true;
        return result;
    }

    // ─────────────────────────────────────
    // 🎯 GUARD اصلی: canEnter
    // ─────────────────────────────────────
    function canEnter(caseId, stepId, options) {
        options = options || {};
        var result = _canEnter(caseId, stepId, options);

        if (result.ok && typeof EventBus !== 'undefined') {
            EventBus.emit(StepGuardEvents.GUARD_PASSED, {
                caseId: caseId,
                stepId: stepId,
                action: 'enter',
                userId: options.userId
            });
        }
        return result;
    }

    // ─────────────────────────────────────
    // 🎯 GUARD اصلی: canComplete
    // ─────────────────────────────────────
    function canComplete(caseId, stepId, options) {
        options = options || {};

        var enterCheck = _canEnter(caseId, stepId, options);
        if (!enterCheck.ok) return enterCheck;

        var caseData = enterCheck.caseData;
        var step = enterCheck.step;

        var result = {
            ok: false,
            stepId: stepId,
            reasons: [],
            step: step,
            caseData: caseData
        };

        // فیلدهای اجباری
        var missingFields = validateRequiredFields(caseData, step);
        if (missingFields.length > 0) {
            result.reasons.push('فیلدهای اجباری تکمیل نشده: ' + missingFields.join('، '));
            result.missingFields = missingFields;
            return result;
        }

        // قبلاً تکمیل نشده باشد
        if (isStepCompleted(caseData, stepId)) {
            result.reasons.push('این مرحله قبلاً تکمیل شده است');
            return result;
        }

        result.ok = true;

        if (typeof EventBus !== 'undefined') {
            EventBus.emit(StepGuardEvents.GUARD_PASSED, {
                caseId: caseId,
                stepId: stepId,
                action: 'complete',
                userId: options.userId
            });
        }
        return result;
    }

    // ─────────────────────────────────────
    // 🎯 GUARD اصلی: canReject
    // ─────────────────────────────────────
    function canReject(caseId, stepId, options) {
        options = options || {};

        var enterCheck = _canEnter(caseId, stepId, options);
        if (!enterCheck.ok) return enterCheck;

        var result = {
            ok: true,
            stepId: stepId,
            reasons: [],
            step: enterCheck.step,
            caseData: enterCheck.caseData
        };

        if (isStepCompleted(enterCheck.caseData, stepId)) {
            result.ok = false;
            result.reasons.push('مرحله تکمیل‌شده قابل رد کردن نیست');
            return result;
        }

        if (typeof EventBus !== 'undefined') {
            EventBus.emit(StepGuardEvents.GUARD_PASSED, {
                caseId: caseId,
                stepId: stepId,
                action: 'reject',
                userId: options.userId
            });
        }
        return result;
    }

    // ─────────────────────────────────────
    // 🎯 GUARD اصلی: canSkip
    // ─────────────────────────────────────
    function canSkip(caseId, stepId, options) {
        options = options || {};

        var enterCheck = _canEnter(caseId, stepId, options);
        if (!enterCheck.ok) return enterCheck;

        var result = {
            ok: false,
            stepId: stepId,
            reasons: [],
            step: enterCheck.step,
            caseData: enterCheck.caseData
        };

        // فقط admin / super_admin می‌توانند skip کنند
        var skipRoles = ['admin', 'super_admin'];
        if (options.role && skipRoles.indexOf(options.role) === -1) {
            result.reasons.push('نقش شما اجازه رد کردن مرحله را ندارد');
            return result;
        }

        result.ok = true;
        return result;
    }

    // ─────────────────────────────────────
    // 📊 گزارش دلایل مسدود بودن
    // ─────────────────────────────────────
    function getBlockingReasons(caseId, stepId, options) {
        options = options || {};
        var action = options.action || 'enter';

        var result;
        if (action === 'complete')      result = canComplete(caseId, stepId, options);
        else if (action === 'reject')   result = canReject(caseId, stepId, options);
        else if (action === 'skip')     result = canSkip(caseId, stepId, options);
        else                            result = canEnter(caseId, stepId, options);

        return {
            ok: result.ok,
            action: action,
            stepId: stepId,
            reasons: result.reasons || []
        };
    }

    // ─────────────────────────────────────
    // 📋 وضعیت کل مراحل یک پرونده
    // ─────────────────────────────────────
    function getStepsOverview(caseId) {
        if (typeof CaseRepository === 'undefined') return [];
        var caseData = CaseRepository.get(caseId);
        if (!caseData) return [];

        var overview = [];
        for (var i = 0; i < STEPS.length; i++) {
            var step = STEPS[i];
            var state = getStepState(caseData, step.id);
            overview.push({
                id: step.id,
                index: step.index,
                key: step.key,
                title: step.title,
                status: state ? state.status : STEP_STATUS.PENDING,
                completedAt: state ? state.completedAt : null,
                completedBy: state ? state.completedBy : null,
                isCurrent: caseData.currentStep === step.id
            });
        }
        return overview;
    }

    // ─────────────────────────────────────
    // 🧮 تشخیص مرحله جاری
    // ─────────────────────────────────────
    function detectCurrentStep(caseData) {
        if (!caseData) return null;

        if (caseData.currentStep && getStepById(caseData.currentStep)) {
            return caseData.currentStep;
        }

        for (var i = 0; i < STEPS.length; i++) {
            if (!isStepCompleted(caseData, STEPS[i].id)) {
                return STEPS[i].id;
            }
        }
        return null;
    }

    // ─────────────────────────────────────
    // 🔧 اعتبارسنجی کل پرونده
    // ─────────────────────────────────────
    function validateCaseIntegrity(caseData) {
        var issues = [];
        if (!caseData) {
            return { ok: false, issues: ['پرونده نامعتبر'] };
        }

        for (var i = 0; i < STEPS.length; i++) {
            var step = STEPS[i];
            var state = getStepState(caseData, step.id);
            if (state && state.status === STEP_STATUS.COMPLETED && !state.completedAt) {
                issues.push('مرحله «' + step.title + '» تکمیل شده ولی تاریخ ندارد');
            }
        }

        return { ok: issues.length === 0, issues: issues };
    }

    // ─────────────────────────────────────
    // 🌐 API جهانی
    // ─────────────────────────────────────
    var StepGuards = {
        // ثوابت
        STEPS: STEPS,
        STEP_STATUS: STEP_STATUS,
        FROZEN_CASE_STATUSES: FROZEN_CASE_STATUSES,
        EVENTS: StepGuardEvents,

        // Guards اصلی
        canEnter: canEnter,
        canComplete: canComplete,
        canReject: canReject,
        canSkip: canSkip,

        // ابزارها
        getStepById: getStepById,
        getStepByIndex: getStepByIndex,
        getPreviousStep: getPreviousStep,
        getNextStep: getNextStep,
        getStepState: getStepState,

        // وضعیت‌ها
        isStepCompleted: isStepCompleted,
        isStepRejected: isStepRejected,
        isStepBlocked: isStepBlocked,
        isStepInProgress: isStepInProgress,
        isStepPending: isStepPending,

        // گزارش‌ها
        getBlockingReasons: getBlockingReasons,
        getStepsOverview: getStepsOverview,
        detectCurrentStep: detectCurrentStep,
        validateCaseIntegrity: validateCaseIntegrity,

        // اعتبارسنجی
        checkDependencies: checkDependencies,
        validateRequiredFields: validateRequiredFields,
        hasRoleAccess: hasRoleAccess
    };

    // ثبت جهانی
    window.StepGuards = StepGuards;
    window.StepGuardEvents = StepGuardEvents;

})();




/* ==========================================
 * FROM: js/admin-approvals.js
 * ========================================== */


// ==========================================
// وام پی — State Layer
// فایل: admin-approvals.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: مدیریت تأییدهای ادمین برای هر مرحله پرونده
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 📋 نام مراحل — هم‌راستا با StepGuards.STEPS
    // ─────────────────────────────────────
    var STEP_KEYS = [
        { id: 'step_1', key: 'registration',    title: 'ثبت درخواست' },
        { id: 'step_2', key: 'documents',       title: 'بارگذاری مدارک' },
        { id: 'step_3', key: 'initial_review',  title: 'بررسی اولیه' },
        { id: 'step_4', key: 'verification',    title: 'اعتبارسنجی' },
        { id: 'step_5', key: 'admin_approval',  title: 'تأیید ادمین' },
        { id: 'step_6', key: 'submit_to_bank',  title: 'ارسال به بانک' },
        { id: 'step_7', key: 'bank_approval',   title: 'تأیید بانک' },
        { id: 'step_8', key: 'contract',        title: 'تنظیم قرارداد' },
        { id: 'step_9', key: 'disbursement',    title: 'پرداخت' }
    ];

    // وضعیت‌های تأیید
    var APPROVAL_STATUS = {
        PENDING:  'pending',
        APPROVED: 'approved',
        REJECTED: 'rejected',
        REVISION: 'revision'   // نیازمند اصلاح
    };

    // نقش‌های مجاز برای تأیید
    var APPROVER_ROLES = ['admin', 'super_admin'];

    // رویدادها
    var ApprovalEvents = {
        APPROVED: 'approval.approved',
        REJECTED: 'approval.rejected',
        REVISION: 'approval.revision',
        RESET:    'approval.reset'
    };

    // ─────────────────────────────────────
    // 🔍 توابع کمکی داخلی
    // ─────────────────────────────────────
    function isValidStepKey(stepKey) {
        for (var i = 0; i < STEP_KEYS.length; i++) {
            if (STEP_KEYS[i].id === stepKey || STEP_KEYS[i].key === stepKey) {
                return true;
            }
        }
        return false;
    }

    function normalizeStepKey(stepKey) {
        // اگر id داده شده بود، key برمی‌گرداند
        for (var i = 0; i < STEP_KEYS.length; i++) {
            if (STEP_KEYS[i].id === stepKey) return STEP_KEYS[i].key;
        }
        return stepKey;
    }

    function getStepTitle(stepKey) {
        var normalized = normalizeStepKey(stepKey);
        for (var i = 0; i < STEP_KEYS.length; i++) {
            if (STEP_KEYS[i].key === normalized) return STEP_KEYS[i].title;
        }
        return stepKey;
    }

    function canApprove(role) {
        return APPROVER_ROLES.indexOf(role) !== -1;
    }

    function createEmptyApprovalObject() {
        var result = {};
        for (var i = 0; i < STEP_KEYS.length; i++) {
            result[STEP_KEYS[i].key] = {
                status: APPROVAL_STATUS.PENDING,
                approvedBy: null,
                approvedAt: null,
                note: '',
                updatedAt: null
            };
        }
        return result;
    }

    // ─────────────────────────────────────
    // 📥 خواندن تأییدهای یک پرونده
    // ─────────────────────────────────────
    function getApprovals(caseId) {
        if (typeof CaseRepository === 'undefined') return null;
        var caseData = CaseRepository.get(caseId);
        if (!caseData) return null;

        // اگر adminApprovals خالی نبود، همان را برگردان
        if (caseData.adminApprovals && typeof caseData.adminApprovals === 'object') {
            // اطمینان از وجود همه کلیدها
            var merged = createEmptyApprovalObject();
            for (var key in caseData.adminApprovals) {
                if (Object.prototype.hasOwnProperty.call(caseData.adminApprovals, key)) {
                    merged[key] = Object.assign({}, merged[key], caseData.adminApprovals[key]);
                }
            }
            return merged;
        }

        // اولین بار — از CaseRepository استفاده کن
        if (typeof CaseRepository.createEmptyApprovals === 'function') {
            return CaseRepository.createEmptyApprovals();
        }
        return createEmptyApprovalObject();
    }

    // ─────────────────────────────────────
    // 📥 وضعیت یک تأیید خاص
    // ─────────────────────────────────────
    function getApproval(caseId, stepKey) {
        if (!isValidStepKey(stepKey)) return null;
        var normalized = normalizeStepKey(stepKey);
        var approvals = getApprovals(caseId);
        if (!approvals) return null;
        return approvals[normalized] || null;
    }

    // ─────────────────────────────────────
    // ✅ بررسی وضعیت‌ها
    // ─────────────────────────────────────
    function isApproved(caseId, stepKey) {
        var a = getApproval(caseId, stepKey);
        return !!(a && a.status === APPROVAL_STATUS.APPROVED);
    }

    function isRejected(caseId, stepKey) {
        var a = getApproval(caseId, stepKey);
        return !!(a && a.status === APPROVAL_STATUS.REJECTED);
    }

    function isPending(caseId, stepKey) {
        var a = getApproval(caseId, stepKey);
        return !a || a.status === APPROVAL_STATUS.PENDING;
    }

    function needsRevision(caseId, stepKey) {
        var a = getApproval(caseId, stepKey);
        return !!(a && a.status === APPROVAL_STATUS.REVISION);
    }

    // ─────────────────────────────────────
    // ✍️ ثبت تأیید
    // ─────────────────────────────────────
    function approve(caseId, stepKey, options) {
        options = options || {};
        var result = { ok: false, reason: null, approval: null };

        if (!isValidStepKey(stepKey)) {
            result.reason = 'مرحله نامعتبر است: ' + stepKey;
            return result;
        }
        if (options.role && !canApprove(options.role)) {
            result.reason = 'نقش شما اجازه تأیید ندارد';
            return result;
        }

        var normalized = normalizeStepKey(stepKey);
        var caseData = typeof CaseRepository !== 'undefined'
            ? CaseRepository.get(caseId)
            : null;
        if (!caseData) {
            result.reason = 'پرونده یافت نشد';
            return result;
        }

        var approvals = getApprovals(caseId) || createEmptyApprovalObject();
        var now = Date.now();

        approvals[normalized] = {
            status: APPROVAL_STATUS.APPROVED,
            approvedBy: options.userId || null,
            approvedAt: now,
            note: options.note || '',
            updatedAt: now
        };

        // ذخیره در پرونده
        if (typeof CaseRepository !== 'undefined' && CaseRepository.update) {
            var updated = CaseRepository.update(
                caseId,
                { adminApprovals: approvals },
                { userId: options.userId }
            );
            if (!updated) {
                result.reason = 'ذخیره‌سازی ناموفق بود';
                return result;
            }
        }

        // emit رویداد
        if (typeof EventBus !== 'undefined') {
            EventBus.emit(ApprovalEvents.APPROVED, {
                caseId: caseId,
                stepKey: normalized,
                stepTitle: getStepTitle(normalized),
                userId: options.userId,
                note: options.note || '',
                at: now
            });
        }

        result.ok = true;
        result.approval = approvals[normalized];
        return result;
    }

    // ─────────────────────────────────────
    // ❌ ثبت رد
    // ─────────────────────────────────────
    function reject(caseId, stepKey, options) {
        options = options || {};
        var result = { ok: false, reason: null, approval: null };

        if (!isValidStepKey(stepKey)) {
            result.reason = 'مرحله نامعتبر است: ' + stepKey;
            return result;
        }
        if (options.role && !canApprove(options.role)) {
            result.reason = 'نقش شما اجازه رد کردن ندارد';
            return result;
        }
        if (!options.note || options.note.trim() === '') {
            result.reason = 'برای رد کردن، ذکر دلیل الزامی است';
            return result;
        }

        var normalized = normalizeStepKey(stepKey);
        var caseData = typeof CaseRepository !== 'undefined'
            ? CaseRepository.get(caseId)
            : null;
        if (!caseData) {
            result.reason = 'پرونده یافت نشد';
            return result;
        }

        var approvals = getApprovals(caseId) || createEmptyApprovalObject();
        var now = Date.now();

        approvals[normalized] = {
            status: APPROVAL_STATUS.REJECTED,
            approvedBy: options.userId || null,
            approvedAt: now,
            note: options.note,
            updatedAt: now
        };

        if (typeof CaseRepository !== 'undefined' && CaseRepository.update) {
            var updated = CaseRepository.update(
                caseId,
                { adminApprovals: approvals },
                { userId: options.userId }
            );
            if (!updated) {
                result.reason = 'ذخیره‌سازی ناموفق بود';
                return result;
            }
        }

        if (typeof EventBus !== 'undefined') {
            EventBus.emit(ApprovalEvents.REJECTED, {
                caseId: caseId,
                stepKey: normalized,
                stepTitle: getStepTitle(normalized),
                userId: options.userId,
                note: options.note,
                at: now
            });
        }

        result.ok = true;
        result.approval = approvals[normalized];
        return result;
    }

    // ─────────────────────────────────────
    // 🔄 درخواست اصلاح
    // ─────────────────────────────────────
    function requestRevision(caseId, stepKey, options) {
        options = options || {};
        var result = { ok: false, reason: null, approval: null };

        if (!isValidStepKey(stepKey)) {
            result.reason = 'مرحله نامعتبر است: ' + stepKey;
            return result;
        }
        if (options.role && !canApprove(options.role)) {
            result.reason = 'نقش شما اجازه این کار را ندارد';
            return result;
        }
        if (!options.note || options.note.trim() === '') {
            result.reason = 'برای درخواست اصلاح، ذکر دلیل الزامی است';
            return result;
        }

        var normalized = normalizeStepKey(stepKey);
        var caseData = typeof CaseRepository !== 'undefined'
            ? CaseRepository.get(caseId)
            : null;
        if (!caseData) {
            result.reason = 'پرونده یافت نشد';
            return result;
        }

        var approvals = getApprovals(caseId) || createEmptyApprovalObject();
        var now = Date.now();

        approvals[normalized] = {
            status: APPROVAL_STATUS.REVISION,
            approvedBy: options.userId || null,
            approvedAt: now,
            note: options.note,
            updatedAt: now
        };

        if (typeof CaseRepository !== 'undefined' && CaseRepository.update) {
            var updated = CaseRepository.update(
                caseId,
                { adminApprovals: approvals },
                { userId: options.userId }
            );
            if (!updated) {
                result.reason = 'ذخیره‌سازی ناموفق بود';
                return result;
            }
        }

        if (typeof EventBus !== 'undefined') {
            EventBus.emit(ApprovalEvents.REVISION, {
                caseId: caseId,
                stepKey: normalized,
                stepTitle: getStepTitle(normalized),
                userId: options.userId,
                note: options.note,
                at: now
            });
        }

        result.ok = true;
        result.approval = approvals[normalized];
        return result;
    }

    // ─────────────────────────────────────
    // 🔄 ریست یک تأیید
    // ─────────────────────────────────────
    function reset(caseId, stepKey, options) {
        options = options || {};
        var result = { ok: false, reason: null };

        if (!isValidStepKey(stepKey)) {
            result.reason = 'مرحله نامعتبر است: ' + stepKey;
            return result;
        }

        var normalized = normalizeStepKey(stepKey);
        var approvals = getApprovals(caseId);
        if (!approvals) {
            result.reason = 'پرونده یافت نشد';
            return result;
        }

        var now = Date.now();
        approvals[normalized] = {
            status: APPROVAL_STATUS.PENDING,
            approvedBy: null,
            approvedAt: null,
            note: '',
            updatedAt: now
        };

        if (typeof CaseRepository !== 'undefined' && CaseRepository.update) {
            CaseRepository.update(
                caseId,
                { adminApprovals: approvals },
                { userId: options.userId }
            );
        }

        if (typeof EventBus !== 'undefined') {
            EventBus.emit(ApprovalEvents.RESET, {
                caseId: caseId,
                stepKey: normalized,
                userId: options.userId,
                at: now
            });
        }

        result.ok = true;
        return result;
    }

    // ─────────────────────────────────────
    // 📊 خلاصه تأییدها
    // ─────────────────────────────────────
    function getSummary(caseId) {
        var approvals = getApprovals(caseId);
        var summary = {
            total: STEP_KEYS.length,
            approved: 0,
            rejected: 0,
            pending: 0,
            revision: 0,
            items: []
        };
        if (!approvals) return summary;

        for (var i = 0; i < STEP_KEYS.length; i++) {
            var step = STEP_KEYS[i];
            var a = approvals[step.key] || { status: APPROVAL_STATUS.PENDING };
            if (a.status === APPROVAL_STATUS.APPROVED) summary.approved++;
            else if (a.status === APPROVAL_STATUS.REJECTED) summary.rejected++;
            else if (a.status === APPROVAL_STATUS.REVISION) summary.revision++;
            else summary.pending++;

            summary.items.push({
                stepKey: step.key,
                stepId: step.id,
                title: step.title,
                status: a.status,
                approvedBy: a.approvedBy || null,
                approvedAt: a.approvedAt || null,
                note: a.note || ''
            });
        }
        return summary;
    }

    // ─────────────────────────────────────
    // 📊 بررسی وجود تأییدهای فعال
    // ─────────────────────────────────────
    function hasAnyApproval(caseId) {
        var s = getSummary(caseId);
        return s.approved > 0 || s.rejected > 0 || s.revision > 0;
    }

    // ─────────────────────────────────────
    // 🧮 آیا همه مراحل تأیید شده‌اند؟
    // ─────────────────────────────────────
    function isFullyApproved(caseId) {
        var s = getSummary(caseId);
        return s.approved === s.total;
    }

    // ─────────────────────────────────────
    // 🎯 اولین مرحله تأییدنشده
    // ─────────────────────────────────────
    function getFirstPendingStep(caseId) {
        var s = getSummary(caseId);
        for (var i = 0; i < s.items.length; i++) {
            if (s.items[i].status !== APPROVAL_STATUS.APPROVED) {
                return s.items[i].stepKey;
            }
        }
        return null;
    }

    // ─────────────────────────────────────
    // 🌐 API جهانی
    // ─────────────────────────────────────
    var AdminApprovals = {
        // ثوابت
        STEP_KEYS: STEP_KEYS,
        APPROVAL_STATUS: APPROVAL_STATUS,
        APPROVER_ROLES: APPROVER_ROLES,
        EVENTS: ApprovalEvents,

        // خواندن
        getApprovals: getApprovals,
        getApproval: getApproval,
        getSummary: getSummary,
        getFirstPendingStep: getFirstPendingStep,

        // بررسی
        isApproved: isApproved,
        isRejected: isRejected,
        isPending: isPending,
        needsRevision: needsRevision,
        hasAnyApproval: hasAnyApproval,
        isFullyApproved: isFullyApproved,

        // اقدامات
        approve: approve,
        reject: reject,
        requestRevision: requestRevision,
        reset: reset,

        // کمکی
        isValidStepKey: isValidStepKey,
        normalizeStepKey: normalizeStepKey,
        getStepTitle: getStepTitle,
        canApprove: canApprove,
        createEmptyApprovals: createEmptyApprovalObject
    };

    // ثبت جهانی
    window.AdminApprovals = AdminApprovals;
    window.ApprovalEvents = ApprovalEvents;

})();




/* ==========================================
 * FROM: js/case-state-machine.js
 * ========================================== */


// ==========================================
// وام پی — State Layer
// فایل: case-state-machine.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: ماشین وضعیت پرونده — مدیریت انتقال بین مراحل
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 📊 ثابت‌ها
    // ─────────────────────────────────────
    var CASE_STATUS = {
        DRAFT:       'draft',
        IN_PROGRESS: 'in_progress',
        PENDING:     'pending',
        APPROVED:    'approved',
        COMPLETED:   'completed',
        REJECTED:    'rejected',
        CANCELLED:   'cancelled',
        ARCHIVED:    'archived',
        ROLLEDBACK:  'rolledback'
    };

    var TRANSITION_TYPES = {
        START:    'start',      // شروع یک مرحله
        COMPLETE: 'complete',   // تکمیل یک مرحله
        REJECT:   'reject',     // رد یک مرحله
        REVISE:   'revise',     // درخواست اصلاح
        SKIP:     'skip',       // رد کردن مرحله
        NEXT:     'next',       // رفتن به مرحله بعد
        PREV:     'prev',       // بازگشت به مرحله قبل
        RESET:    'reset'       // ریست کامل
    };

    // رویدادهای ماشین وضعیت
    var StateMachineEvents = {
        TRANSITION:       'sm.transition',
        TRANSITION_OK:    'sm.transition.ok',
        TRANSITION_FAIL:  'sm.transition.fail',
        STEP_STARTED:     'sm.step.started',
        STEP_COMPLETED:   'sm.step.completed',
        STEP_REJECTED:    'sm.step.rejected',
        STEP_REVISED:     'sm.step.revised',
        CASE_FINISHED:    'sm.case.finished'
    };

    // ─────────────────────────────────────
    // 🔍 بررسی دسترسی وابستگی‌ها
    // ─────────────────────────────────────
    function _checkDeps() {
        var missing = [];
        if (typeof CaseRepository === 'undefined')  missing.push('case-repository.js');
        if (typeof EventBus === 'undefined')        missing.push('event-bus.js');
        if (typeof StepGuards === 'undefined')      missing.push('step-guards.js');
        if (typeof AdminApprovals === 'undefined')  missing.push('admin-approvals.js');
        return { ok: missing.length === 0, missing: missing };
    }

    // ─────────────────────────────────────
    // 🔧 توابع کمکی
    // ─────────────────────────────────────
    function _emit(eventName, data) {
        if (typeof EventBus !== 'undefined') {
            EventBus.emit(eventName, data);
        }
    }

    function _getCase(caseId) {
        if (typeof CaseRepository === 'undefined') return null;
        return CaseRepository.get(caseId);
    }

    function _updateCase(caseId, patch, options) {
        if (typeof CaseRepository === 'undefined') return null;
        return CaseRepository.update(caseId, patch, options || {});
    }

    function _buildResult(ok, extra) {
        var r = { ok: ok, reason: null, data: null };
        if (extra) {
            for (var k in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, k)) {
                    r[k] = extra[k];
                }
            }
        }
        return r;
    }

    function _now() { return Date.now(); }

    // ─────────────────────────────────────
    // 📥 وضعیت جاری پرونده
    // ─────────────────────────────────────
    function getCurrentStep(caseId) {
        var caseData = _getCase(caseId);
        if (!caseData) return null;
        if (typeof StepGuards === 'undefined') return caseData.currentStep || null;
        return StepGuards.detectCurrentStep(caseData);
    }

    function getCurrentStatus(caseId) {
        var caseData = _getCase(caseId);
        if (!caseData) return null;
        return caseData.status || CASE_STATUS.DRAFT;
    }

    function isFinished(caseId) {
        var status = getCurrentStatus(caseId);
        return status === CASE_STATUS.COMPLETED ||
               status === CASE_STATUS.CANCELLED ||
               status === CASE_STATUS.ARCHIVED ||
               status === CASE_STATUS.ROLLEDBACK;
    }

    function canTransition(caseId, action, options) {
        options = options || {};
        if (typeof StepGuards === 'undefined') {
            return _buildResult(false, { reason: 'StepGuards در دسترس نیست' });
        }
        var stepId = options.stepId || getCurrentStep(caseId);
        if (!stepId) {
            return _buildResult(false, { reason: 'مرحله جاری مشخص نیست' });
        }

        var guardResult;
        if (action === TRANSITION_TYPES.COMPLETE) {
            guardResult = StepGuards.canComplete(caseId, stepId, options);
        } else if (action === TRANSITION_TYPES.REJECT) {
            guardResult = StepGuards.canReject(caseId, stepId, options);
        } else if (action === TRANSITION_TYPES.SKIP) {
            guardResult = StepGuards.canSkip(caseId, stepId, options);
        } else {
            guardResult = StepGuards.canEnter(caseId, stepId, options);
        }
        return guardResult;
    }

    // ─────────────────────────────────────
    // 🎬 شروع یک مرحله
    // ─────────────────────────────────────
    function startStep(caseId, stepId, options) {
        options = options || {};
        var guard = StepGuards.canEnter(caseId, stepId, options);
        if (!guard.ok) {
            _emit(StateMachineEvents.TRANSITION_FAIL, {
                caseId: caseId, stepId: stepId,
                action: TRANSITION_TYPES.START,
                reasons: guard.reasons
            });
            return _buildResult(false, {
                reason: (guard.reasons && guard.reasons[0]) || 'دسترسی مجاز نیست',
                reasons: guard.reasons
            });
        }

        var caseData = guard.caseData;
        var steps = caseData.steps || {};
        var now = _now();

        if (!steps[stepId]) {
            steps[stepId] = {};
        }
        steps[stepId].status      = StepGuards.STEP_STATUS.IN_PROGRESS;
        steps[stepId].startedAt   = steps[stepId].startedAt || now;
        steps[stepId].startedBy   = options.userId || null;
        steps[stepId].updatedAt   = now;

        var updated = _updateCase(caseId, {
            steps: steps,
            currentStep: stepId,
            status: CASE_STATUS.IN_PROGRESS
        }, { userId: options.userId });

        if (!updated) {
            return _buildResult(false, { reason: 'ذخیره‌سازی ناموفق بود' });
        }

        _emit(StateMachineEvents.STEP_STARTED, {
            caseId: caseId, stepId: stepId,
            userId: options.userId, at: now
        });
        _emit(StateMachineEvents.TRANSITION_OK, {
            caseId: caseId, stepId: stepId,
            action: TRANSITION_TYPES.START, userId: options.userId
        });
        _emit(CaseEvents.STEP_CHANGED, {
            caseId: caseId, stepId: stepId,
            status: StepGuards.STEP_STATUS.IN_PROGRESS,
            userId: options.userId
        });

        return _buildResult(true, { data: { caseId: caseId, stepId: stepId } });
    }

    // ─────────────────────────────────────
    // ✅ تکمیل یک مرحله
    // ─────────────────────────────────────
    function completeStep(caseId, stepId, options) {
        options = options || {};
        var guard = StepGuards.canComplete(caseId, stepId, options);
        if (!guard.ok) {
            _emit(StateMachineEvents.TRANSITION_FAIL, {
                caseId: caseId, stepId: stepId,
                action: TRANSITION_TYPES.COMPLETE,
                reasons: guard.reasons
            });
            return _buildResult(false, {
                reason: (guard.reasons && guard.reasons[0]) || 'تکمیل مجاز نیست',
                reasons: guard.reasons
            });
        }

        var caseData = guard.caseData;
        var steps = caseData.steps || {};
        var now = _now();

        if (!steps[stepId]) steps[stepId] = {};
        steps[stepId].status      = StepGuards.STEP_STATUS.COMPLETED;
        steps[stepId].completedAt = now;
        steps[stepId].completedBy = options.userId || null;
        steps[stepId].updatedAt   = now;

        // به‌روزرسانی adminApprovals اگر مربوط به همین مرحله باشد
        if (options.syncApproval && typeof AdminApprovals !== 'undefined') {
            var step = StepGuards.getStepById(stepId);
            if (step) {
                try {
                    AdminApprovals.approve(caseId, step.key, {
                        userId: options.userId,
                        role: options.role,
                        note: options.note || ''
                    });
                } catch (e) { /* بی‌صدا */ }
            }
        }

        // محاسبه مرحله بعدی
        var nextStep = StepGuards.getNextStep(stepId);
        var nextStepId = nextStep ? nextStep.id : null;

        // اگر آخرین مرحله بود، پرونده را کامل کن
        var newStatus = CASE_STATUS.IN_PROGRESS;
        var finished = !nextStepId;

        if (finished) {
            newStatus = CASE_STATUS.COMPLETED;
        }

        var updated = _updateCase(caseId, {
            steps: steps,
            currentStep: nextStepId || stepId,
            status: newStatus,
            completedAt: finished ? now : null
        }, { userId: options.userId });

        if (!updated) {
            return _buildResult(false, { reason: 'ذخیره‌سازی ناموفق بود' });
        }

        _emit(StateMachineEvents.STEP_COMPLETED, {
            caseId: caseId, stepId: stepId,
            userId: options.userId, at: now,
            nextStepId: nextStepId
        });
        _emit(StateMachineEvents.TRANSITION_OK, {
            caseId: caseId, stepId: stepId,
            action: TRANSITION_TYPES.COMPLETE, userId: options.userId
        });
        _emit(CaseEvents.STEP_APPROVED, {
            caseId: caseId, stepId: stepId, userId: options.userId
        });

        if (finished) {
            _emit(StateMachineEvents.CASE_FINISHED, {
                caseId: caseId, at: now, userId: options.userId
            });
            _emit(CaseEvents.COMPLETED, {
                caseId: caseId, at: now, userId: options.userId
            });
        }

        return _buildResult(true, {
            data: {
                caseId: caseId, stepId: stepId,
                nextStepId: nextStepId,
                finished: finished
            }
        });
    }

    // ─────────────────────────────────────
    // ❌ رد یک مرحله
    // ─────────────────────────────────────
    function rejectStep(caseId, stepId, options) {
        options = options || {};
        if (!options.note || String(options.note).trim() === '') {
            return _buildResult(false, { reason: 'برای رد کردن، ذکر دلیل الزامی است' });
        }

        var guard = StepGuards.canReject(caseId, stepId, options);
        if (!guard.ok) {
            _emit(StateMachineEvents.TRANSITION_FAIL, {
                caseId: caseId, stepId: stepId,
                action: TRANSITION_TYPES.REJECT,
                reasons: guard.reasons
            });
            return _buildResult(false, {
                reason: (guard.reasons && guard.reasons[0]) || 'رد کردن مجاز نیست',
                reasons: guard.reasons
            });
        }

        var caseData = guard.caseData;
        var steps = caseData.steps || {};
        var now = _now();

        if (!steps[stepId]) steps[stepId] = {};
        steps[stepId].status     = StepGuards.STEP_STATUS.REJECTED;
        steps[stepId].rejectedAt = now;
        steps[stepId].rejectedBy = options.userId || null;
        steps[stepId].rejectNote = options.note;
        steps[stepId].updatedAt  = now;

        // ثبت در adminApprovals
        if (options.syncApproval && typeof AdminApprovals !== 'undefined') {
            var step = StepGuards.getStepById(stepId);
            if (step) {
                try {
                    AdminApprovals.reject(caseId, step.key, {
                        userId: options.userId,
                        role: options.role,
                        note: options.note
                    });
                } catch (e) { /* بی‌صدا */ }
            }
        }

        var updated = _updateCase(caseId, {
            steps: steps,
            status: CASE_STATUS.REJECTED
        }, { userId: options.userId });

        if (!updated) {
            return _buildResult(false, { reason: 'ذخیره‌سازی ناموفق بود' });
        }

        _emit(StateMachineEvents.STEP_REJECTED, {
            caseId: caseId, stepId: stepId,
            userId: options.userId, note: options.note, at: now
        });
        _emit(StateMachineEvents.TRANSITION_OK, {
            caseId: caseId, stepId: stepId,
            action: TRANSITION_TYPES.REJECT, userId: options.userId
        });
        _emit(CaseEvents.STEP_REJECTED, {
            caseId: caseId, stepId: stepId,
            userId: options.userId, note: options.note
        });

        return _buildResult(true, { data: { caseId: caseId, stepId: stepId } });
    }

    // ─────────────────────────────────────
    // 🔄 درخواست اصلاح
    // ─────────────────────────────────────
    function reviseStep(caseId, stepId, options) {
        options = options || {};
        if (!options.note || String(options.note).trim() === '') {
            return _buildResult(false, { reason: 'برای درخواست اصلاح، ذکر دلیل الزامی است' });
        }

        var guard = StepGuards.canEnter(caseId, stepId, options);
        if (!guard.ok) {
            _emit(StateMachineEvents.TRANSITION_FAIL, {
                caseId: caseId, stepId: stepId,
                action: TRANSITION_TYPES.REVISE,
                reasons: guard.reasons
            });
            return _buildResult(false, {
                reason: (guard.reasons && guard.reasons[0]) || 'درخواست اصلاح مجاز نیست',
                reasons: guard.reasons
            });
        }

        var caseData = guard.caseData;
        var steps = caseData.steps || {};
        var now = _now();

        if (!steps[stepId]) steps[stepId] = {};
        steps[stepId].status     = StepGuards.STEP_STATUS.IN_PROGRESS;
        steps[stepId].revisionAt = now;
        steps[stepId].revisionBy = options.userId || null;
        steps[stepId].revisionNote = options.note;
        steps[stepId].updatedAt  = now;

        if (options.syncApproval && typeof AdminApprovals !== 'undefined') {
            var step = StepGuards.getStepById(stepId);
            if (step) {
                try {
                    AdminApprovals.requestRevision(caseId, step.key, {
                        userId: options.userId,
                        role: options.role,
                        note: options.note
                    });
                } catch (e) { /* بی‌صدا */ }
            }
        }

        var updated = _updateCase(caseId, {
            steps: steps,
            currentStep: stepId,
            status: CASE_STATUS.IN_PROGRESS
        }, { userId: options.userId });

        if (!updated) {
            return _buildResult(false, { reason: 'ذخیره‌سازی ناموفق بود' });
        }

        _emit(StateMachineEvents.STEP_REVISED, {
            caseId: caseId, stepId: stepId,
            userId: options.userId, note: options.note, at: now
        });
        _emit(StateMachineEvents.TRANSITION_OK, {
            caseId: caseId, stepId: stepId,
            action: TRANSITION_TYPES.REVISE, userId: options.userId
        });

        return _buildResult(true, { data: { caseId: caseId, stepId: stepId } });
    }

    // ─────────────────────────────────────
    // ⏭️ انتقال به مرحله بعد
    // ─────────────────────────────────────
    function moveNext(caseId, options) {
        options = options || {};
        var current = getCurrentStep(caseId);
        if (!current) {
            return _buildResult(false, { reason: 'مرحله جاری مشخص نیست' });
        }
        var next = StepGuards.getNextStep(current);
        if (!next) {
            return _buildResult(false, { reason: 'مرحله بعدی وجود ندارد' });
        }
        return startStep(caseId, next.id, options);
    }

    // ─────────────────────────────────────
    // ⏮️ انتقال به مرحله قبل
    // ─────────────────────────────────────
    function movePrev(caseId, options) {
        options = options || {};
        var current = getCurrentStep(caseId);
        if (!current) {
            return _buildResult(false, { reason: 'مرحله جاری مشخص نیست' });
        }
        var prev = StepGuards.getPreviousStep(current);
        if (!prev) {
            return _buildResult(false, { reason: 'مرحله قبلی وجود ندارد' });
        }
        return startStep(caseId, prev.id, options);
    }

    // ─────────────────────────────────────
    // 🔁 ریست کامل مراحل پرونده
    // ─────────────────────────────────────
    function resetAllSteps(caseId, options) {
        options = options || {};
        var caseData = _getCase(caseId);
        if (!caseData) return _buildResult(false, { reason: 'پرونده یافت نشد' });

        // فقط admin / super_admin
        var allowed = ['admin', 'super_admin'];
        if (options.role && allowed.indexOf(options.role) === -1) {
            return _buildResult(false, { reason: 'نقش شما اجازه ریست ندارد' });
        }

        var steps = {};
        for (var i = 0; i < StepGuards.STEPS.length; i++) {
            var s = StepGuards.STEPS[i];
            steps[s.id] = { status: StepGuards.STEP_STATUS.PENDING };
        }

        var firstStep = StepGuards.STEPS[0];

        var updated = _updateCase(caseId, {
            steps: steps,
            currentStep: firstStep ? firstStep.id : null,
            status: CASE_STATUS.DRAFT,
            adminApprovals: (typeof AdminApprovals !== 'undefined')
                ? AdminApprovals.createEmptyApprovals()
                : null
        }, { userId: options.userId });

        if (!updated) return _buildResult(false, { reason: 'ذخیره‌سازی ناموفق بود' });

        _emit(StateMachineEvents.TRANSITION_OK, {
            caseId: caseId, action: TRANSITION_TYPES.RESET,
            userId: options.userId
        });

        return _buildResult(true);
    }

    // ─────────────────────────────────────
    // 📊 خلاصه وضعیت پرونده
    // ─────────────────────────────────────
    function getSnapshot(caseId) {
        var caseData = _getCase(caseId);
        if (!caseData) return null;

        var stepsOverview = (typeof StepGuards !== 'undefined')
            ? StepGuards.getStepsOverview(caseId)
            : [];

        var approvalsSummary = (typeof AdminApprovals !== 'undefined')
            ? AdminApprovals.getSummary(caseId)
            : null;

        var total = stepsOverview.length || 0;
        var completed = 0;
        for (var i = 0; i < stepsOverview.length; i++) {
            if (stepsOverview[i].status === StepGuards.STEP_STATUS.COMPLETED) completed++;
        }
        var progress = total > 0 ? Math.round((completed / total) * 100) : 0;

        return {
            caseId: caseId,
            status: caseData.status || CASE_STATUS.DRAFT,
            currentStep: getCurrentStep(caseId),
            isFinished: isFinished(caseId),
            progress: progress,
            completedCount: completed,
            totalCount: total,
            steps: stepsOverview,
            approvals: approvalsSummary
        };
    }

    // ─────────────────────────────────────
    // 🧾 لاگ انتقال‌ها (خواندن از پرونده)
    // ─────────────────────────────────────
    function getTransitionHistory(caseId) {
        var caseData = _getCase(caseId);
        if (!caseData) return [];
        return caseData.transitions || [];
    }

    function _logTransition(caseId, entry, userId) {
        var caseData = _getCase(caseId);
        if (!caseData) return;
        var history = caseData.transitions || [];
        history.push({
            action: entry.action,
            stepId: entry.stepId || null,
            by: userId || null,
            at: _now(),
            note: entry.note || ''
        });
        // فقط ۲۰۰ رکورد آخر
        if (history.length > 200) history = history.slice(-200);
        _updateCase(caseId, { transitions: history }, { userId: userId });
    }

    // ─────────────────────────────────────
    // 📥 نصب شنونده خودکار برای لاگ
    // ─────────────────────────────────────
    function _installLogger() {
        if (typeof EventBus === 'undefined') return;

        EventBus.on(StateMachineEvents.STEP_STARTED, function (d) {
            _logTransition(d.caseId, { action: TRANSITION_TYPES.START, stepId: d.stepId }, d.userId);
        });
        EventBus.on(StateMachineEvents.STEP_COMPLETED, function (d) {
            _logTransition(d.caseId, { action: TRANSITION_TYPES.COMPLETE, stepId: d.stepId }, d.userId);
        });
        EventBus.on(StateMachineEvents.STEP_REJECTED, function (d) {
            _logTransition(d.caseId, { action: TRANSITION_TYPES.REJECT, stepId: d.stepId, note: d.note }, d.userId);
        });
        EventBus.on(StateMachineEvents.STEP_REVISED, function (d) {
            _logTransition(d.caseId, { action: TRANSITION_TYPES.REVISE, stepId: d.stepId, note: d.note }, d.userId);
        });
    }

    // ─────────────────────────────────────
    // 🌐 API جهانی
    // ─────────────────────────────────────
    var CaseStateMachine = {
        // ثوابت
        CASE_STATUS: CASE_STATUS,
        TRANSITION_TYPES: TRANSITION_TYPES,
        EVENTS: StateMachineEvents,

        // وضعیت
        getCurrentStep: getCurrentStep,
        getCurrentStatus: getCurrentStatus,
        isFinished: isFinished,
        canTransition: canTransition,

        // اقدامات
        startStep: startStep,
        completeStep: completeStep,
        rejectStep: rejectStep,
        reviseStep: reviseStep,
        moveNext: moveNext,
        movePrev: movePrev,
        resetAllSteps: resetAllSteps,

        // گزارش‌ها
        getSnapshot: getSnapshot,
        getTransitionHistory: getTransitionHistory,

        // کمکی
        checkDependencies: _checkDeps
    };

    // ثبت جهانی
    window.CaseStateMachine = CaseStateMachine;
    window.StateMachineEvents = StateMachineEvents;

    // نصب لاگر
    _installLogger();

})();




/* ==========================================
 * FROM: js/state-machine-debug.js
 * ========================================== */


// ==========================================
// وام پی — State Layer
// فایل: state-machine-debug.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: ابزار دیباگ ماشین وضعیت — بازرسی، اجرا، لاگ
// ==========================================

(function () {
    'use strict';

    var DEBUG = {
        enabled: false,
        activeCaseId: null,
        panelEl: null,
        logBuffer: [],
        maxLog: 100,
        initialized: false
    };

    // ─────────────────────────────────────
    // 🔍 بررسی وابستگی‌ها
    // ─────────────────────────────────────
    function checkDeps() {
        var missing = [];
        if (typeof CaseStateMachine === 'undefined') missing.push('case-state-machine.js');
        if (typeof StepGuards === 'undefined')       missing.push('step-guards.js');
        if (typeof AdminApprovals === 'undefined')   missing.push('admin-approvals.js');
        if (typeof CaseRepository === 'undefined')   missing.push('case-repository.js');
        if (typeof EventBus === 'undefined')         missing.push('event-bus.js');
        return { ok: missing.length === 0, missing: missing };
    }

    // ─────────────────────────────────────
    // 📝 لاگ داخلی
    // ─────────────────────────────────────
    function log(level, message, data) {
        var entry = {
            level: level,             // 'info' | 'ok' | 'warn' | 'error'
            message: message,
            data: data || null,
            at: Date.now()
        };
        DEBUG.logBuffer.push(entry);
        if (DEBUG.logBuffer.length > DEBUG.maxLog) {
            DEBUG.logBuffer = DEBUG.logBuffer.slice(-DEBUG.maxLog);
        }
        // چاپ در کنسول
        var prefix = '%c[WamStateDebug]';
        var style = 'color:#d4a62a;font-weight:bold';
        if (level === 'error') {
            console.error(prefix + ' ' + message, style, data || '');
        } else if (level === 'warn') {
            console.warn(prefix + ' ' + message, style, data || '');
        } else {
            console.log(prefix + ' ' + message, style, data || '');
        }
        return entry;
    }

    // ─────────────────────────────────────
    // 🎯 ست کردن پرونده فعال
    // ─────────────────────────────────────
    function setActiveCase(caseId) {
        if (!caseId) {
            DEBUG.activeCaseId = null;
            log('info', 'پرونده فعال پاک شد');
            return null;
        }
        var c = CaseRepository.get(caseId);
        if (!c) {
            log('error', 'پرونده یافت نشد: ' + caseId);
            return null;
        }
        DEBUG.activeCaseId = caseId;
        log('ok', 'پرونده فعال: ' + caseId);
        return c;
    }

    function getActiveCaseId() {
        return DEBUG.activeCaseId;
    }

    function _resolveCaseId(caseId) {
        return caseId || DEBUG.activeCaseId;
    }

    // ─────────────────────────────────────
    // 📊 نمایش خلاصه پرونده
    // ─────────────────────────────────────
    function inspect(caseId) {
        caseId = _resolveCaseId(caseId);
        if (!caseId) {
            log('error', 'هیچ پرونده‌ای فعال نیست');
            return null;
        }

        var snapshot = CaseStateMachine.getSnapshot(caseId);
        if (!snapshot) {
            log('error', 'پرونده یافت نشد: ' + caseId);
            return null;
        }

        var history = CaseStateMachine.getTransitionHistory(caseId);

        log('info', '── خلاصه پرونده ' + caseId + ' ──', {
            status: snapshot.status,
            currentStep: snapshot.currentStep,
            progress: snapshot.progress + '%',
            completed: snapshot.completedCount + '/' + snapshot.totalCount,
            isFinished: snapshot.isFinished,
            transitions: history.length
        });

        return snapshot;
    }

    // ─────────────────────────────────────
    // 📋 نمایش مراحل به‌صورت جدول
    // ─────────────────────────────────────
    function steps(caseId) {
        caseId = _resolveCaseId(caseId);
        if (!caseId) { log('error', 'هیچ پرونده‌ای فعال نیست'); return null; }

        var overview = StepGuards.getStepsOverview(caseId);
        if (!overview || overview.length === 0) {
            log('warn', 'مرحله‌ای یافت نشد');
            return [];
        }

        if (console.table) {
            console.table(overview.map(function (s) {
                return {
                    'شماره': s.index,
                    'شناسه': s.id,
                    'عنوان': s.title,
                    'وضعیت': s.status,
                    'جاری': s.isCurrent ? '✓' : ''
                };
            }));
        } else {
            log('info', 'مراحل پرونده', overview);
        }
        return overview;
    }

    // ─────────────────────────────────────
    // ✅ نمایش خلاصه تأییدها
    // ─────────────────────────────────────
    function approvals(caseId) {
        caseId = _resolveCaseId(caseId);
        if (!caseId) { log('error', 'هیچ پرونده‌ای فعال نیست'); return null; }

        var summary = AdminApprovals.getSummary(caseId);
        if (!summary) return null;

        log('info', 'خلاصه تأییدها:', {
            total: summary.total,
            approved: summary.approved,
            rejected: summary.rejected,
            pending: summary.pending,
            revision: summary.revision
        });

        if (console.table) {
            console.table(summary.items.map(function (i) {
                return {
                    'مرحله': i.title,
                    'وضعیت': i.status,
                    'تأییدکننده': i.approvedBy || '—',
                    'یادداشت': i.note || '—'
                };
            }));
        }
        return summary;
    }

    // ─────────────────────────────────────
    // 🧪 اجرای یک انتقال (شبیه‌سازی امن)
    // ─────────────────────────────────────
    function transition(action, stepId, options) {
        options = options || {};
        var caseId = _resolveCaseId(options.caseId);
        if (!caseId) { log('error', 'هیچ پرونده‌ای فعال نیست'); return null; }

        stepId = stepId || CaseStateMachine.getCurrentStep(caseId);
        if (!stepId) { log('error', 'مرحله مشخص نیست'); return null; }

        // بدون userId، فقط تست دسترسی است
        if (!options.dryRun) options.dryRun = true;

        var checkOptions = {
            userId: options.userId || null,
            role: options.role || 'admin'
        };

        var result;
        if (options.dryRun) {
            // فقط بررسی کن، اجرا نکن
            result = CaseStateMachine.canTransition(caseId, action, checkOptions);
            log(result.ok ? 'ok' : 'warn',
                'شبیه‌سازی ' + action + ' روی ' + stepId,
                result);
            return result;
        }

        switch (action) {
            case 'start':
                result = CaseStateMachine.startStep(caseId, stepId, checkOptions);
                break;
            case 'complete':
                result = CaseStateMachine.completeStep(caseId, stepId, checkOptions);
                break;
            case 'reject':
                result = CaseStateMachine.rejectStep(caseId, stepId, {
                    userId: options.userId,
                    role: options.role || 'admin',
                    note: options.note || 'دیباگ'
                });
                break;
            case 'revise':
                result = CaseStateMachine.reviseStep(caseId, stepId, {
                    userId: options.userId,
                    role: options.role || 'admin',
                    note: options.note || 'نیاز به اصلاح'
                });
                break;
            case 'next':
                result = CaseStateMachine.moveNext(caseId, checkOptions);
                break;
            case 'prev':
                result = CaseStateMachine.movePrev(caseId, checkOptions);
                break;
            default:
                log('error', 'action نامعتبر: ' + action);
                return null;
        }

        log(result.ok ? 'ok' : 'warn',
            action + ' → ' + stepId,
            result);
        return result;
    }

    // ─────────────────────────────────────
    // 📜 نمایش تاریخچه انتقال‌ها
    // ─────────────────────────────────────
    function history(caseId, limit) {
        caseId = _resolveCaseId(caseId);
        if (!caseId) { log('error', 'هیچ پرونده‌ای فعال نیست'); return []; }

        var list = CaseStateMachine.getTransitionHistory(caseId);
        if (limit) list = list.slice(-limit);

        if (console.table) {
            console.table(list.map(function (h) {
                return {
                    'زمان': new Date(h.at).toLocaleString('fa-IR'),
                    'اقدام': h.action,
                    'مرحله': h.stepId || '—',
                    'کاربر': h.by || '—',
                    'یادداشت': h.note || '—'
                };
            }));
        } else {
            log('info', 'تاریخچه انتقال‌ها', list);
        }
        return list;
    }

    // ─────────────────────────────────────
    // 🗑️ ریست کامل (فقط برای دیباگ)
    // ─────────────────────────────────────
    function resetCase(caseId, options) {
        options = options || {};
        caseId = _resolveCaseId(caseId);
        if (!caseId) { log('error', 'هیچ پرونده‌ای فعال نیست'); return null; }

        if (!options.confirm) {
            log('warn', 'برای ریست باید confirm: true بدهید');
            return null;
        }

        var r = CaseStateMachine.resetAllSteps(caseId, {
            userId: options.userId || 'debug',
            role: 'admin'
        });

        log(r.ok ? 'ok' : 'error', 'ریست پرونده ' + caseId, r);
        return r;
    }

    // ─────────────────────────────────────
    // 🧾 لاگ داخلی دیباگ
    // ─────────────────────────────────────
    function getLog(limit) {
        if (limit) return DEBUG.logBuffer.slice(-limit);
        return DEBUG.logBuffer.slice();
    }

    function clearLog() {
        DEBUG.logBuffer = [];
        log('info', 'لاگ پاک شد');
    }

    // ─────────────────────────────────────
    // 📥 لیسنر خودکار رویدادها
    // ─────────────────────────────────────
    function _installListeners() {
        if (typeof EventBus === 'undefined' || !StateMachineEvents) return;

        EventBus.on(StateMachineEvents.TRANSITION_OK, function (d) {
            if (DEBUG.enabled) {
                log('ok', '✔ ' + d.action + ' @ ' + d.stepId + ' [' + d.caseId + ']', d);
            }
        });
        EventBus.on(StateMachineEvents.TRANSITION_FAIL, function (d) {
            if (DEBUG.enabled) {
                log('warn', '✘ ' + d.action + ' @ ' + d.stepId + ' [' + d.caseId + ']', d.reasons);
            }
        });
        EventBus.on(StateMachineEvents.CASE_FINISHED, function (d) {
            if (DEBUG.enabled) {
                log('ok', '🎉 پرونده ' + d.caseId + ' تکمیل شد', d);
            }
        });
        EventBus.on(StateMachineEvents.STEP_STARTED, function (d) {
            if (DEBUG.enabled) log('info', '▶ شروع ' + d.stepId, d);
        });
        EventBus.on(StateMachineEvents.STEP_COMPLETED, function (d) {
            if (DEBUG.enabled) log('info', '✓ تکمیل ' + d.stepId, d);
        });
        EventBus.on(StateMachineEvents.STEP_REJECTED, function (d) {
            if (DEBUG.enabled) log('warn', '✗ رد ' + d.stepId, d);
        });
        EventBus.on(StateMachineEvents.STEP_REVISED, function (d) {
            if (DEBUG.enabled) log('warn', '↻ اصلاح ' + d.stepId, d);
        });
    }

    // ─────────────────────────────────────
    // 🎛️ فعال/غیرفعال کردن
    // ─────────────────────────────────────
    function enable() {
        DEBUG.enabled = true;
        log('ok', '🛠️ دیباگ ماشین وضعیت فعال شد');
        return true;
    }

    function disable() {
        DEBUG.enabled = false;
        log('info', 'دیباگ غیرفعال شد');
        return true;
    }

    function isEnabled() {
        return DEBUG.enabled;
    }

    function toggle() {
        return DEBUG.enabled ? disable() : enable();
    }

    // ─────────────────────────────────────
    // 📊 راهنمای سریع
    // ─────────────────────────────────────
    function help() {
        var lines = [
            '🛠️ WamStateDebug — راهنمای سریع',
            '',
            '▶ فعال/غیرفعال:',
            '   WamStateDebug.enable()',
            '   WamStateDebug.disable()',
            '   WamStateDebug.toggle()',
            '',
            '▶ تنظیم پرونده فعال:',
            '   WamStateDebug.setCase("WP-001")',
            '',
            '▶ بازرسی:',
            '   WamStateDebug.inspect()      — خلاصه پرونده فعال',
            '   WamStateDebug.steps()        — جدول مراحل',
            '   WamStateDebug.approvals()    — جدول تأییدها',
            '   WamStateDebug.history(20)    — ۲۰ انتقال آخر',
            '',
            '▶ شبیه‌سازی (بدون اجرا):',
            '   WamStateDebug.transition("complete")',
            '',
            '▶ اجرای واقعی:',
            '   WamStateDebug.transition("complete", null, {',
            '       dryRun: false, userId: "u_1", role: "admin"',
            '   })',
            '',
            '▶ ریست (خطرناک):',
            '   WamStateDebug.resetCase(null, { confirm: true })',
            '',
            '▶ لاگ داخلی:',
            '   WamStateDebug.getLog(50)',
            '   WamStateDebug.clearLog()',
            '',
            '▶ تست سریع کل چرخه:',
            '   WamStateDebug.simulate()     — روی پرونده فعال',
            ''
        ];
        console.log(lines.join('\n'));
        return lines;
    }

    // ─────────────────────────────────────
    // 🧪 شبیه‌سازی حرکت تا آخر (فقط خواندنی)
    // ─────────────────────────────────────
    function simulate(caseId, options) {
        options = options || {};
        caseId = _resolveCaseId(caseId);
        if (!caseId) { log('error', 'هیچ پرونده‌ای فعال نیست'); return null; }

        var steps = StepGuards.getStepsOverview(caseId);
        if (!steps || steps.length === 0) {
            log('warn', 'مرحله‌ای نیست');
            return null;
        }

        log('info', '🧪 شبیه‌سازی پرونده ' + caseId, {
            mode: options.dryRun === false ? 'اجرای واقعی' : 'فقط بررسی',
            totalSteps: steps.length
        });

        var trace = [];
        for (var i = 0; i < steps.length; i++) {
            var s = steps[i];
            var r = CaseStateMachine.canTransition(caseId, 'complete', {
                userId: options.userId || 'debug',
                role: options.role || 'admin'
            });
            trace.push({
                index: s.index,
                title: s.title,
                status: s.status,
                canComplete: r.ok,
                reason: r.ok ? null : (r.reasons && r.reasons[0])
            });
        }

        if (console.table) {
            console.table(trace.map(function (t) {
                return {
                    'شماره': t.index,
                    'عنوان': t.title,
                    'وضعیت': t.status,
                    'قابل تکمیل': t.canComplete ? '✓' : '✗',
                    'دلیل': t.reason || '—'
                };
            }));
        }
        return trace;
    }

    // ─────────────────────────────────────
    // 🌐 API جهانی
    // ─────────────────────────────────────
    var WamStateDebug = {
        // کنترل
        enable: enable,
        disable: disable,
        toggle: toggle,
        isEnabled: isEnabled,

        // پرونده فعال
        setCase: setActiveCase,
        getCase: getActiveCaseId,

        // بازرسی
        inspect: inspect,
        steps: steps,
        approvals: approvals,
        history: history,

        // شبیه‌سازی/اجرا
        transition: transition,
        simulate: simulate,
        resetCase: resetCase,

        // لاگ
        getLog: getLog,
        clearLog: clearLog,

        // راهنما
        help: help,

        // کمکی
        checkDependencies: checkDeps,
        _internal: DEBUG
    };

    // ثبت جهانی
    window.WamStateDebug = WamStateDebug;

    // نصب لیسنرها
    _installListeners();

    // پیام آمادگی (فقط در کنسول)
    console.log(
        '%c🛠️ WamStateDebug آماده است — WamStateDebug.help() را اجرا کنید',
        'color:#105b35;font-weight:bold'
    );

})();




/* ==========================================
 * END OF BUNDLE
 * ========================================== */