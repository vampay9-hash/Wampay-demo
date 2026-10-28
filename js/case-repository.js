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