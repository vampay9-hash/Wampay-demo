// ==========================================
// وام پی — Verifier Panel
// فایل: verifier-sync.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: همگام‌سازی اعتبارسنج — sync بین تب‌ها، بازیابی خطا، صف عملیات
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION = '1.0.0';
    var SYNC_KEY = 'wamPayVerifierSync';
    var LOCK_KEY = 'wamPayVerifierSyncLock';
    var LOCK_TTL = 30000;   // ۳۰ ثانیه

    var AUTO_SYNC_MS = 120000;   // ۲ دقیقه
    var MAX_RETRY = 3;
    var RETRY_DELAY = 5000;

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        syncing: false,
        lastSyncAt: null,
        lastSyncOk: null,
        pendingOps: [],
        stats: {
            totalSyncs: 0,
            failedSyncs: 0,
            lastError: null,
            conflictsResolved: 0
        },
        autoSyncTimer: null,
        retryTimer: null,
        storageListener: null,
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var SyncEvents = {
        START:       'vsync.start',
        COMPLETE:    'vsync.complete',
        FAIL:        'vsync.fail',
        CONFLICT:    'vsync.conflict',
        OP_QUEUED:   'vsync.op_queued',
        OP_APPLIED:  'vsync.op_applied',
        OP_FAILED:   'vsync.op_failed',
        LOCK_ACQUIRED: 'vsync.lock_acquired',
        LOCK_RELEASED: 'vsync.lock_released',
        CROSS_TAB:   'vsync.cross_tab',
        STORAGE_ERR: 'vsync.storage_error'
    };

    function _emit(name, data) {
        if (typeof EventBus !== 'undefined') {
            try { EventBus.emit(name, data); } catch (e) { /* بی‌صدا */ }
        }
        for (var i = 0; i < STATE.listeners.length; i++) {
            try { STATE.listeners[i](name, data); } catch (e) { /* بی‌صدا */ }
        }
    }

    // ─────────────────────────────────────
    // 🔍 کمکی‌ها
    // ─────────────────────────────────────
    function _uid() {
        if (typeof WamPermissions === 'undefined') return null;
        var me = WamPermissions.getCurrentUser();
        return me ? me.id : null;
    }

    function _uidShort() {
        var u = _uid();
        return u ? u.slice(-6) : 'anon';
    }

    function _genId(prefix) {
        var r = Math.random().toString(36).slice(2, 8);
        return (prefix || 'op') + '_' + Date.now().toString(36) + '_' + r;
    }

    function _now() { return Date.now(); }

    function _toast(type, msg, title) {
        if (typeof WamUI === 'undefined') return;
        if (type === 'success' && WamUI.toastSuccess) WamUI.toastSuccess(msg, title || 'موفق');
        else if (type === 'error' && WamUI.toastError) WamUI.toastError(msg, title || 'خطا');
        else if (type === 'warning' && WamUI.toastWarning) WamUI.toastWarning(msg, title || 'توجه');
        else if (type === 'info' && WamUI.toastInfo) WamUI.toastInfo(msg, title || 'اطلاع');
    }

    // ─────────────────────────────────────
    // 🔒 قفل بین تب‌ها
    // ─────────────────────────────────────
    function _readLock() {
        if (typeof Storage === 'undefined') return null;
        return Storage.getJSON(LOCK_KEY, null);
    }

    function _writeLock(lock) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(LOCK_KEY, lock);
    }

    function _clearLock() {
        if (typeof Storage === 'undefined') return false;
        return Storage.remove(LOCK_KEY);
    }

    function acquireLock() {
        var lock = _readLock();
        var now = _now();

        // اگر قفل قدیمی منقضی شده
        if (lock && (now - lock.at) > LOCK_TTL) {
            _clearLock();
            lock = null;
        }

        if (lock && lock.owner !== _uidShort()) {
            return { ok: false, reason: 'locked_by_other', owner: lock.owner };
        }

        var newLock = {
            owner: _uidShort(),
            at: now,
            token: _genId('lock')
        };
        _writeLock(newLock);

        _emit(SyncEvents.LOCK_ACQUIRED, { owner: newLock.owner });
        return { ok: true, lock: newLock };
    }

    function releaseLock() {
        var lock = _readLock();
        if (!lock) return { ok: true };
        if (lock.owner !== _uidShort()) {
            return { ok: false, reason: 'not_owner' };
        }
        _clearLock();
        _emit(SyncEvents.LOCK_RELEASED, { owner: lock.owner });
        return { ok: true };
    }

    function hasLock() {
        var lock = _readLock();
        if (!lock) return false;
        if ((_now() - lock.at) > LOCK_TTL) return false;
        return lock.owner === _uidShort();
    }

    // ─────────────────────────────────────
    // 📋 SYNC META
    // ─────────────────────────────────────
    function _readSyncMeta() {
        if (typeof Storage === 'undefined') return {};
        return Storage.getJSON(SYNC_KEY, {}) || {};
    }

    function _writeSyncMeta(meta) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(SYNC_KEY, meta);
    }

    function _updateSyncMeta() {
        var meta = _readSyncMeta();
        meta.lastSyncAt = STATE.lastSyncAt;
        meta.lastSyncOk = STATE.lastSyncOk;
        meta.totalSyncs = STATE.stats.totalSyncs;
        meta.failedSyncs = STATE.stats.failedSyncs;
        meta.lastError = STATE.stats.lastError;
        meta.conflictsResolved = STATE.stats.conflictsResolved;
        meta.version = VERSION;
        return _writeSyncMeta(meta);
    }

    // ─────────────────────────────────────
    // 📤 صف عملیات
    // ─────────────────────────────────────
    function queueOperation(op) {
        if (!op || !op.type) return { ok: false, reason: 'invalid' };

        var queued = {
            id: _genId('q'),
            type: op.type,
            payload: op.payload || {},
            userId: _uid(),
            createdAt: _now(),
            retries: 0,
            maxRetries: op.maxRetries || MAX_RETRY,
            status: 'pending'
        };

        STATE.pendingOps.push(queued);
        _persistQueue();

        _emit(SyncEvents.OP_QUEUED, {
            opId: queued.id,
            type: queued.type,
            total: STATE.pendingOps.length
        });
        return { ok: true, op: queued };
    }

    function _persistQueue() {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(SYNC_KEY + 'Queue', STATE.pendingOps);
    }

    function _loadQueue() {
        if (typeof Storage === 'undefined') return [];
        var q = Storage.getJSON(SYNC_KEY + 'Queue', []);
        return Array.isArray(q) ? q : [];
    }

    function _removeOp(opId) {
        for (var i = STATE.pendingOps.length - 1; i >= 0; i--) {
            if (STATE.pendingOps[i].id === opId) {
                STATE.pendingOps.splice(i, 1);
                break;
            }
        }
        _persistQueue();
    }

    function getPendingOps() {
        return STATE.pendingOps.slice();
    }

    function clearPendingOps() {
        STATE.pendingOps = [];
        _persistQueue();
        return { ok: true };
    }

    // ─────────────────────────────────────
    // 🎯 اعمال یک عملیات
    // ─────────────────────────────────────
    function _applyOp(op) {
        if (!op) return { ok: false, reason: 'invalid' };

        try {
            if (op.type === 'add-note') {
                if (typeof WamVerifierStorage !== 'undefined' &&
                    WamVerifierStorage.addNote) {
                    var r1 = WamVerifierStorage.addNote(
                        op.payload.caseId,
                        op.payload.text,
                        op.payload.options || {}
                    );
                    return r1.ok ? { ok: true } : { ok: false, reason: r1.reason };
                }
                return { ok: false, reason: 'no_storage_module' };
            }

            if (op.type === 'toggle-check') {
                if (typeof WamVerifierStorage !== 'undefined' &&
                    WamVerifierStorage.toggleCheck) {
                    var r2 = WamVerifierStorage.toggleCheck(
                        op.payload.caseId,
                        op.payload.checkId,
                        op.payload.done
                    );
                    return r2.ok ? { ok: true } : { ok: false, reason: r2.reason };
                }
                return { ok: false, reason: 'no_storage_module' };
            }

            if (op.type === 'set-priority') {
                if (typeof CaseRepository !== 'undefined' &&
                    CaseRepository.update) {
                    var updated = CaseRepository.update(
                        op.payload.caseId,
                        { priority: op.payload.priority, prioritySetAt: _now() },
                        { userId: _uid() }
                    );
                    return updated ? { ok: true } : { ok: false, reason: 'update_failed' };
                }
                return { ok: false, reason: 'no_repo' };
            }

            if (op.type === 'approve-step' || op.type === 'reject-step' ||
                op.type === 'revise-step') {
                if (typeof CaseStateMachine === 'undefined') {
                    return { ok: false, reason: 'no_state_machine' };
                }
                var method = op.type === 'approve-step' ? 'completeStep' :
                             op.type === 'reject-step' ? 'rejectStep' : 'reviseStep';
                if (typeof CaseStateMachine[method] !== 'function') {
                    return { ok: false, reason: 'no_method' };
                }
                var r = CaseStateMachine[method](
                    op.payload.caseId,
                    op.payload.stepId,
                    {
                        userId: _uid(),
                        role: 'verifier',
                        note: op.payload.note || '',
                        syncApproval: op.payload.syncApproval !== false
                    }
                );
                return r && r.ok ? { ok: true, result: r } : { ok: false, reason: (r && r.reason) || 'failed' };
            }

            return { ok: false, reason: 'unknown_op' };
        } catch (e) {
            return { ok: false, reason: 'exception', error: String(e) };
        }
    }

    function _processQueue() {
        var queue = STATE.pendingOps.slice();
        var applied = 0;
        var failed = [];

        for (var i = 0; i < queue.length; i++) {
            var op = queue[i];
            var res = _applyOp(op);

            if (res.ok) {
                _removeOp(op.id);
                applied++;
                _emit(SyncEvents.OP_APPLIED, { opId: op.id, type: op.type });
            } else {
                op.retries++;
                op.lastError = res.reason;
                if (op.retries >= op.maxRetries) {
                    failed.push(op);
                    _removeOp(op.id);
                    _emit(SyncEvents.OP_FAILED, {
                        opId: op.id,
                        type: op.type,
                        reason: res.reason,
                        retries: op.retries
                    });
                }
            }
        }

        if (failed.length > 0) {
            _persistQueue();
        }

        return { applied: applied, failed: failed.length };
    }

    // ─────────────────────────────────────
    // 🔄 SYNC اصلی
    // ─────────────────────────────────────
    function syncAll(options) {
        options = options || {};
        if (STATE.syncing) {
            return { ok: false, reason: 'already_syncing' };
        }

        STATE.syncing = true;
        _emit(SyncEvents.START, { at: _now() });

        try {
            // ۱. تلاش برای قفل
            var lockRes = acquireLock();
            if (!lockRes.ok && !options.force) {
                STATE.syncing = false;
                _emit(SyncEvents.FAIL, { reason: lockRes.reason });
                if (!options.silent) {
                    _toast('warning',
                        'همگام‌سازی توسط تب دیگر در حال اجراست',
                        'توجه');
                }
                return { ok: false, reason: 'locked' };
            }

            var stats = {
                verifierStorage: null,
                queue: { applied: 0, failed: 0 },
                conflicts: 0
            };

            // ۲. اعمال صف
            var qRes = _processQueue();
            stats.queue = qRes;

            // ۳. همگام‌سازی WamVerifierStorage
            if (typeof WamVerifierStorage !== 'undefined' &&
                WamVerifierStorage.syncAll) {
                try {
                    stats.verifierStorage = WamVerifierStorage.syncAll();
                } catch (e) {
                    stats.verifierStorage = { ok: false, error: String(e) };
                }
            }

            // ۴. بررسی همگام‌سازی CaseRepository
            if (typeof CaseRepository !== 'undefined') {
                // Trigger یک خواندن برای refresh
                try { CaseRepository.getAll(); } catch (e) { /* بی‌صدا */ }
            }

            // ۵. به‌روزرسانی meta
            STATE.lastSyncAt = _now();
            STATE.lastSyncOk = true;
            STATE.stats.totalSyncs++;
            _updateSyncMeta();

            // ۶. آزادسازی قفل
            releaseLock();

            STATE.syncing = false;
            _emit(SyncEvents.COMPLETE, {
                at: STATE.lastSyncAt,
                stats: stats
            });

            if (!options.silent) {
                _toast('success', 'همگام‌سازی انجام شد', 'موفق');
            }

            return { ok: true, stats: stats };
        } catch (err) {
            STATE.syncing = false;
            STATE.lastSyncOk = false;
            STATE.stats.failedSyncs++;
            STATE.stats.lastError = String(err);
            _updateSyncMeta();

            releaseLock();

            _emit(SyncEvents.FAIL, { reason: 'exception', error: String(err) });
            if (!options.silent) {
                _toast('error', 'خطا در همگام‌سازی', 'خطا');
            }
            return { ok: false, reason: 'exception', error: String(err) };
        }
    }

    // ─────────────────────────────────────
    // 🔍 بررسی اختلافات
    // ─────────────────────────────────────
    function detectConflicts() {
        var conflicts = [];

        // اگر کاربر جاری با موارد ذخیره‌شده در verifier storage اختلاف داشته باشد
        if (typeof WamVerifierStorage === 'undefined') {
            return conflicts;
        }

        // بررسی draftها
        var draftKeys = [];
        if (typeof Storage !== 'undefined' && WamVerifierStorage.KEYS) {
            // draftهای منقضی
            try {
                var drafts = Storage.getJSON(WamVerifierStorage.KEYS.DRAFTS, {}) || {};
                var now = _now();
                for (var k in drafts) {
                    if (!Object.prototype.hasOwnProperty.call(drafts, k)) continue;
                    var d = drafts[k];
                    if (d && d.savedAt && (now - d.savedAt) > WamVerifierStorage.MAX_DRAFT_AGE_MS) {
                        conflicts.push({
                            type: 'expired_draft',
                            caseId: k,
                            age: now - d.savedAt
                        });
                    }
                }
            } catch (e) { /* بی‌صدا */ }
        }

        return conflicts;
    }

    function resolveConflict(conflict) {
        if (!conflict || !conflict.type) return { ok: false, reason: 'invalid' };

        if (conflict.type === 'expired_draft') {
            if (typeof WamVerifierStorage !== 'undefined' &&
                WamVerifierStorage.clearDraft) {
                WamVerifierStorage.clearDraft(conflict.caseId);
                STATE.stats.conflictsResolved++;
                _emit(SyncEvents.CONFLICT, {
                    type: 'expired_draft',
                    resolved: true,
                    caseId: conflict.caseId
                });
                return { ok: true };
            }
        }
        return { ok: false, reason: 'unknown_type' };
    }

    // ─────────────────────────────────────
    // 🌐 cross-tab
    // ─────────────────────────────────────
    function _installStorageListener() {
        if (typeof window === 'undefined') return;
        if (typeof Storage === 'undefined') return;

        STATE.storageListener = function (e) {
            if (!e || !e.key) return;

            // فقط کلیدهای مرتبط با sync
            if (e.key.indexOf(SYNC_KEY) !== 0 &&
                e.key.indexOf('wamPayVerifier') !== 0 &&
                e.key.indexOf('wamPayCases') !== 0) {
                return;
            }

            _emit(SyncEvents.CROSS_TAB, {
                key: e.key,
                newValue: e.newValue ? e.newValue.length : 0,
                at: _now()
            });

            // اگر op-queue تغییر کرده، بخوان
            if (e.key === (SYNC_KEY + 'Queue')) {
                STATE.pendingOps = _loadQueue();
            }
        };

        if (window.addEventListener) {
            window.addEventListener('storage', STATE.storageListener);
        }
    }

    function _removeStorageListener() {
        if (typeof window === 'undefined') return;
        if (!STATE.storageListener) return;
        if (window.removeEventListener) {
            window.removeEventListener('storage', STATE.storageListener);
        }
        STATE.storageListener = null;
    }

    // ─────────────────────────────────────
    // ⏱️ auto-sync
    // ─────────────────────────────────────
    function _startAutoSync() {
        _stopAutoSync();
        STATE.autoSyncTimer = setInterval(function () {
            try {
                syncAll({ silent: true });
            } catch (e) { /* بی‌صدا */ }
        }, AUTO_SYNC_MS);
    }

    function _stopAutoSync() {
        if (STATE.autoSyncTimer) {
            clearInterval(STATE.autoSyncTimer);
            STATE.autoSyncTimer = null;
        }
    }

    // ─────────────────────────────────────
    // 🔁 Retry loop
    // ─────────────────────────────────────
    function _scheduleRetry() {
        if (STATE.retryTimer) clearTimeout(STATE.retryTimer);
        STATE.retryTimer = setTimeout(function () {
            var queue = STATE.pendingOps;
            if (queue.length > 0) {
                syncAll({ silent: true });
            }
        }, RETRY_DELAY);
    }

    function _autoQueueFromEvents() {
        if (typeof EventBus === 'undefined') return;

        // هر بار یادداشتی ثبت شد، آن را در صف قرار بده (اگر آفلاین بودیم)
        EventBus.on('vstore.note.added', function (d) {
            // اگر storage خطا داده بود، بعداً retry کن
            // در این نسخه ساده، فقط آمار نگه‌داری می‌کنیم
        });
    }

    // ─────────────────────────────────────
    // 📊 گزارش کامل
    // ─────────────────────────────────────
    function getFullReport() {
        var meta = _readSyncMeta();
        return {
            version: VERSION,
            installed: STATE.installed,
            syncing: STATE.syncing,
            hasLock: hasLock(),
            lastSyncAt: STATE.lastSyncAt,
            lastSyncOk: STATE.lastSyncOk,
            autoSyncEnabled: !!STATE.autoSyncTimer,
            pendingOpsCount: STATE.pendingOps.length,
            stats: {
                totalSyncs: STATE.stats.totalSyncs,
                failedSyncs: STATE.stats.failedSyncs,
                conflictsResolved: STATE.stats.conflictsResolved,
                lastError: STATE.stats.lastError
            },
            meta: meta
        };
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (STATE.installed && !options.force) return;

        STATE.pendingOps = _loadQueue();
        _installStorageListener();
        _autoQueueFromEvents();

        // اجرای اولین sync
        if (options.autoSync !== false) {
            setTimeout(function () {
                syncAll({ silent: true });
            }, 500);
            _startAutoSync();
        }

        STATE.installed = true;

        if (options.debug) {
            console.log('[verifier-sync] v' + VERSION + ' آماده — ' +
                'صف: ' + STATE.pendingOps.length + ' عملیات');
        }
    }

    function uninstall() {
        _stopAutoSync();
        if (STATE.retryTimer) clearTimeout(STATE.retryTimer);
        _removeStorageListener();
        releaseLock();
        STATE.installed = false;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return getFullReport();
    }

    function onChange(cb) {
        if (typeof cb !== 'function') return function () {};
        STATE.listeners.push(cb);
        return function () {
            var i = STATE.listeners.indexOf(cb);
            if (i !== -1) STATE.listeners.splice(i, 1);
        };
    }

    // ─────────────────────────────────────
    // 🌐 API جهانی
    // ─────────────────────────────────────
    var WamVerifierSync = {
        VERSION: VERSION,
        EVENTS: SyncEvents,
        SYNC_KEY: SYNC_KEY,
        LOCK_KEY: LOCK_KEY,
        LOCK_TTL: LOCK_TTL,
        AUTO_SYNC_MS: AUTO_SYNC_MS,
        MAX_RETRY: MAX_RETRY,

        install: install,
        uninstall: uninstall,
        syncAll: syncAll,

        // قفل
        acquireLock: acquireLock,
        releaseLock: releaseLock,
        hasLock: hasLock,

        // صف
        queueOperation: queueOperation,
        getPendingOps: getPendingOps,
        clearPendingOps: clearPendingOps,

        // تعارض
        detectConflicts: detectConflicts,
        resolveConflict: resolveConflict,

        // گزارش
        getStatus: getStatus,
        getFullReport: getFullReport,
        onChange: onChange
    };

    window.WamVerifierSync = WamVerifierSync;
    window.VerifierSyncEvents = SyncEvents;

    // نصب خودکار
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { install(); });
        } else {
            install();
        }
    }

})();