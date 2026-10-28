/* ==========================================
 * WAM PAY — 🔍 Verifier Bundle
 * ==========================================
 * 
 * Bundle خودکار
 * تعداد فایل: 6
 * تاریخ تولید: 2026-09-22T18:46:59.008Z
 * 
 * این فایل به صورت خودکار از چند فایل جداگانه
 * ادغام شده است. تغییرات مستقیم در این فایل
 * با اجرای بعدی Builder پاک می‌شوند.
 * ========================================== */




/* ==========================================
 * FROM: js/verifier-storage.js
 * ========================================== */


// ==========================================
// وام پی — Verifier Panel
// فایل: verifier-storage.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: لایه ذخیره‌سازی اختصاصی اعتبارسنج
//        (یادداشت‌ها، بررسی‌ها، پیش‌نویس‌ها، آمار)
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها — کلیدهای ذخیره‌سازی
    // ─────────────────────────────────────
    var KEYS = {
        NOTES:      'wamPayVerifierNotes',     // یادداشت‌های روی پرونده‌ها
        CHECKS:     'wamPayVerifierChecks',    // چک‌لیست‌های بررسی
        DRAFTS:     'wamPayVerifierDrafts',    // پیش‌نویس یادداشت‌ها
        PREFERENCES:'wamPayVerifierPrefs',     // تنظیمات شخصی
        STATS:      'wamPayVerifierStats',     // آمار محلی
        ACTIVITY:   'wamPayVerifierActivity'   // فعالیت‌های اخیر
    };

    var VERSION = '1.0.0';
    var MAX_ACTIVITY = 100;
    var MAX_NOTES_PER_CASE = 50;
    var MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000;   // ۷ روز

    // چک‌لیست استاندارد برای بررسی پرونده
    var DEFAULT_CHECKLIST = [
        { id: 'identity',       label: 'احراز هویت متقاضی',           required: true,  done: false },
        { id: 'income',         label: 'بررسی درآمد و توان بازپرداخت', required: true,  done: false },
        { id: 'docs',           label: 'صحّت مدارک بارگذاری‌شده',     required: true,  done: false },
        { id: 'national',       label: 'استعلام کد ملی',              required: true,  done: false },
        { id: 'credit',         label: 'بررسی سابقه اعتباری',          required: false, done: false },
        { id: 'collateral',     label: 'بررسی وثیقه / ضامن',          required: false, done: false },
        { id: 'bank',           label: 'بررسی حساب بانکی',            required: true,  done: false },
        { id: 'final',          label: 'تأیید نهایی بررسی',            required: true,  done: false }
    ];

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        currentVerifierId: null,
        listeners: [],
        lastAccessAt: null,
        cache: {}
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var VStoreEvents = {
        NOTE_ADDED:      'vstore.note.added',
        NOTE_REMOVED:    'vstore.note.removed',
        NOTE_UPDATED:    'vstore.note.updated',
        CHECK_UPDATED:   'vstore.check.updated',
        CHECKLIST_RESET: 'vstore.checklist.reset',
        DRAFT_SAVED:     'vstore.draft.saved',
        DRAFT_CLEARED:   'vstore.draft.cleared',
        PREF_SAVED:      'vstore.pref.saved',
        STATS_UPDATED:   'vstore.stats.updated',
        SYNCED:          'vstore.synced',
        CLEARED:         'vstore.cleared'
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

    function _genId(prefix) {
        var r = Math.random().toString(36).slice(2, 8);
        return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + r;
    }

    function _clone(obj) {
        try { return JSON.parse(JSON.stringify(obj)); }
        catch (e) { return null; }
    }

    function _safeRead(key, fallback) {
        if (typeof Storage === 'undefined') return fallback || null;
        var v = Storage.getJSON(key, null);
        return v === null ? (fallback || null) : v;
    }

    function _safeWrite(key, value) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(key, value);
    }

    // ─────────────────────────────────────
    // 📝 NOTES — یادداشت‌ها
    // ─────────────────────────────────────
    function _getAllNotes() {
        var notes = _safeRead(KEYS.NOTES, {});
        return notes && typeof notes === 'object' ? notes : {};
    }

    function _saveAllNotes(all) {
        return _safeWrite(KEYS.NOTES, all);
    }

    function getNotes(caseId) {
        if (!caseId) return [];
        var all = _getAllNotes();
        var list = all[caseId];
        return Array.isArray(list) ? list.slice() : [];
    }

    function addNote(caseId, text, options) {
        options = options || {};
        if (!caseId) return { ok: false, reason: 'no_case' };
        if (!text || String(text).trim().length === 0) {
            return { ok: false, reason: 'empty' };
        }

        var all = _getAllNotes();
        if (!Array.isArray(all[caseId])) all[caseId] = [];

        if (all[caseId].length >= MAX_NOTES_PER_CASE) {
            return { ok: false, reason: 'max_reached' };
        }

        var note = {
            id: _genId('note'),
            text: String(text).trim(),
            category: options.category || 'general',   // general | review | warning | reject
            pinned: !!options.pinned,
            authorId: _uid(),
            authorName: options.authorName || _getNameOfCurrentUser(),
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        all[caseId].push(note);
        if (!_saveAllNotes(all)) return { ok: false, reason: 'storage_error' };

        _recordActivity('note_added', { caseId: caseId, noteId: note.id });
        _emit(VStoreEvents.NOTE_ADDED, { caseId: caseId, note: note });
        return { ok: true, note: note };
    }

    function updateNote(caseId, noteId, patch) {
        if (!caseId || !noteId) return { ok: false, reason: 'missing' };
        var all = _getAllNotes();
        var list = all[caseId];
        if (!Array.isArray(list)) return { ok: false, reason: 'not_found' };

        for (var i = 0; i < list.length; i++) {
            var n = list[i];
            if (n.id !== noteId) continue;
            if (patch.text !== undefined) n.text = String(patch.text).trim();
            if (patch.category !== undefined) n.category = patch.category;
            if (patch.pinned !== undefined) n.pinned = !!patch.pinned;
            n.updatedAt = Date.now();

            if (!_saveAllNotes(all)) return { ok: false, reason: 'storage_error' };
            _emit(VStoreEvents.NOTE_UPDATED, { caseId: caseId, note: n });
            return { ok: true, note: n };
        }
        return { ok: false, reason: 'not_found' };
    }

    function removeNote(caseId, noteId) {
        if (!caseId || !noteId) return { ok: false, reason: 'missing' };
        var all = _getAllNotes();
        var list = all[caseId];
        if (!Array.isArray(list)) return { ok: false, reason: 'not_found' };

        for (var i = list.length - 1; i >= 0; i--) {
            if (list[i].id === noteId) {
                var removed = list.splice(i, 1)[0];
                if (!_saveAllNotes(all)) {
                    list.splice(i, 0, removed);
                    return { ok: false, reason: 'storage_error' };
                }
                _recordActivity('note_removed', { caseId: caseId, noteId: noteId });
                _emit(VStoreEvents.NOTE_REMOVED, { caseId: caseId, note: removed });
                return { ok: true, note: removed };
            }
        }
        return { ok: false, reason: 'not_found' };
    }

    function clearNotes(caseId) {
        if (!caseId) return { ok: false, reason: 'no_case' };
        var all = _getAllNotes();
        if (!all[caseId]) return { ok: true, count: 0 };
        var count = all[caseId].length;
        delete all[caseId];
        if (!_saveAllNotes(all)) return { ok: false, reason: 'storage_error' };
        _emit(VStoreEvents.CLEARED, { type: 'notes', caseId: caseId, count: count });
        return { ok: true, count: count };
    }

    function getNotesCount(caseId) {
        var list = getNotes(caseId);
        return list.length;
    }

    // ─────────────────────────────────────
    // ✅ CHECKS — چک‌لیست‌ها
    // ─────────────────────────────────────
    function _getAllChecks() {
        var c = _safeRead(KEYS.CHECKS, {});
        return c && typeof c === 'object' ? c : {};
    }

    function _saveAllChecks(all) {
        return _safeWrite(KEYS.CHECKS, all);
    }

    function getChecklist(caseId) {
        if (!caseId) return [];
        var all = _getAllChecks();
        if (!all[caseId] || !Array.isArray(all[caseId])) {
            // چک‌لیست پیش‌فرض
            all[caseId] = _clone(DEFAULT_CHECKLIST);
            _saveAllChecks(all);
        }
        return all[caseId].slice();
    }

    function toggleCheck(caseId, checkId, done) {
        if (!caseId || !checkId) return { ok: false, reason: 'missing' };
        var all = _getAllChecks();
        var list = all[caseId] || _clone(DEFAULT_CHECKLIST);
        var found = false;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === checkId) {
                if (done === undefined) {
                    list[i].done = !list[i].done;
                } else {
                    list[i].done = !!done;
                }
                list[i].doneAt = list[i].done ? Date.now() : null;
                list[i].doneBy = list[i].done ? _uid() : null;
                found = true;
                break;
            }
        }
        if (!found) return { ok: false, reason: 'not_found' };

        all[caseId] = list;
        if (!_saveAllChecks(all)) return { ok: false, reason: 'storage_error' };

        _emit(VStoreEvents.CHECK_UPDATED, {
            caseId: caseId, checkId: checkId, done: done
        });
        return { ok: true, list: list };
    }

    function resetChecklist(caseId) {
        if (!caseId) return { ok: false, reason: 'no_case' };
        var all = _getAllChecks();
        all[caseId] = _clone(DEFAULT_CHECKLIST);
        if (!_saveAllChecks(all)) return { ok: false, reason: 'storage_error' };
        _emit(VStoreEvents.CHECKLIST_RESET, { caseId: caseId });
        return { ok: true, list: all[caseId] };
    }

    function getChecklistProgress(caseId) {
        var list = getChecklist(caseId);
        var done = 0;
        var requiredDone = 0;
        var requiredTotal = 0;
        for (var i = 0; i < list.length; i++) {
            if (list[i].done) done++;
            if (list[i].required) {
                requiredTotal++;
                if (list[i].done) requiredDone++;
            }
        }
        return {
            done: done,
            total: list.length,
            percent: list.length > 0 ? Math.round((done / list.length) * 100) : 0,
            requiredDone: requiredDone,
            requiredTotal: requiredTotal,
            isComplete: requiredDone === requiredTotal
        };
    }

    // ─────────────────────────────────────
    // 📝 DRAFTS — پیش‌نویس یادداشت‌ها
    // ─────────────────────────────────────
    function _getAllDrafts() {
        var d = _safeRead(KEYS.DRAFTS, {});
        return d && typeof d === 'object' ? d : {};
    }

    function _saveAllDrafts(all) {
        return _safeWrite(KEYS.DRAFTS, all);
    }

    function saveDraft(caseId, text) {
        if (!caseId) return { ok: false, reason: 'no_case' };
        var all = _getAllDrafts();
        all[caseId] = {
            text: String(text || ''),
            savedAt: Date.now(),
            authorId: _uid()
        };
        if (!_saveAllDrafts(all)) return { ok: false, reason: 'storage_error' };
        _emit(VStoreEvents.DRAFT_SAVED, { caseId: caseId });
        return { ok: true };
    }

    function getDraft(caseId) {
        if (!caseId) return null;
        var all = _getAllDrafts();
        var d = all[caseId];
        if (!d) return null;
        // TTL
        if (d.savedAt && (Date.now() - d.savedAt) > MAX_DRAFT_AGE_MS) {
            delete all[caseId];
            _saveAllDrafts(all);
            return null;
        }
        return _clone(d);
    }

    function clearDraft(caseId) {
        if (!caseId) return { ok: false, reason: 'no_case' };
        var all = _getAllDrafts();
        if (!all[caseId]) return { ok: true };
        delete all[caseId];
        if (!_saveAllDrafts(all)) return { ok: false, reason: 'storage_error' };
        _emit(VStoreEvents.DRAFT_CLEARED, { caseId: caseId });
        return { ok: true };
    }

    function hasDraft(caseId) {
        return getDraft(caseId) !== null;
    }

    // ─────────────────────────────────────
    // ⚙️ PREFERENCES — تنظیمات شخصی
    // ─────────────────────────────────────
    var DEFAULT_PREFS = {
        autoRefresh: true,
        refreshInterval: 120000,
        showChecklistOnReview: true,
        defaultPriority: 'normal',
        notificationsEnabled: true,
        theme: 'auto'
    };

    function _getAllPrefs() {
        var p = _safeRead(KEYS.PREFERENCES, {});
        return p && typeof p === 'object' ? p : {};
    }

    function getPreferences(verifierId) {
        verifierId = verifierId || _uid();
        if (!verifierId) return _clone(DEFAULT_PREFS);
        var all = _getAllPrefs();
        var mine = all[verifierId];
        if (!mine) return _clone(DEFAULT_PREFS);
        // merge با default
        var merged = _clone(DEFAULT_PREFS);
        for (var k in mine) {
            if (Object.prototype.hasOwnProperty.call(mine, k)) merged[k] = mine[k];
        }
        return merged;
    }

    function setPreference(key, value, verifierId) {
        if (!key) return { ok: false, reason: 'no_key' };
        verifierId = verifierId || _uid();
        if (!verifierId) return { ok: false, reason: 'no_verifier' };

        var all = _getAllPrefs();
        if (!all[verifierId]) all[verifierId] = {};
        all[verifierId][key] = value;
        if (!_safeWrite(KEYS.PREFERENCES, all)) {
            return { ok: false, reason: 'storage_error' };
        }
        _emit(VStoreEvents.PREF_SAVED, { key: key, value: value });
        return { ok: true };
    }

    function resetPreferences(verifierId) {
        verifierId = verifierId || _uid();
        if (!verifierId) return { ok: false, reason: 'no_verifier' };
        var all = _getAllPrefs();
        delete all[verifierId];
        if (!_safeWrite(KEYS.PREFERENCES, all)) {
            return { ok: false, reason: 'storage_error' };
        }
        return { ok: true, prefs: _clone(DEFAULT_PREFS) };
    }

    // ─────────────────────────────────────
    // 📊 STATS — آمار محلی
    // ─────────────────────────────────────
    function _getAllStats() {
        var s = _safeRead(KEYS.STATS, {});
        return s && typeof s === 'object' ? s : {};
    }

    function _saveAllStats(all) {
        return _safeWrite(KEYS.STATS, all);
    }

    function computeMyStats() {
        var uid = _uid();
        var stats = {
            verifierId: uid,
            totalReviewed: 0,
            totalApproved: 0,
            totalRejected: 0,
            totalNotes: 0,
            totalChecks: 0,
            lastActivityAt: null
        };

        if (!uid) return stats;

        // آمار پرونده‌ها
        if (typeof CaseRepository !== 'undefined') {
            try {
                var cases = CaseRepository.getAll() || [];
                for (var i = 0; i < cases.length; i++) {
                    var c = cases[i];
                    if (!c) continue;

                    var counted = false;
                    // در adminApprovals
                    var appr = c.adminApprovals || {};
                    for (var k in appr) {
                        if (!Object.prototype.hasOwnProperty.call(appr, k)) continue;
                        var a = appr[k];
                        if (!a || !a.approvedBy) continue;
                        if (a.approvedBy !== uid) continue;
                        if (counted) break;
                        counted = true;
                        stats.totalReviewed++;
                        if (a.status === 'approved') stats.totalApproved++;
                        else if (a.status === 'rejected') stats.totalRejected++;
                    }

                    // در steps
                    if (c.steps) {
                        for (var sid in c.steps) {
                            if (!Object.prototype.hasOwnProperty.call(c.steps, sid)) continue;
                            var s = c.steps[sid];
                            if (s && (s.completedBy === uid || s.startedBy === uid)) {
                                if (!counted) {
                                    counted = true;
                                    stats.totalReviewed++;
                                }
                                break;
                            }
                        }
                    }
                }
            } catch (e) { /* بی‌صدا */ }
        }

        // آمار یادداشت‌ها
        var notes = _getAllNotes();
        for (var caseId in notes) {
            if (!Object.prototype.hasOwnProperty.call(notes, caseId)) continue;
            var list = notes[caseId];
            if (!Array.isArray(list)) continue;
            for (var j = 0; j < list.length; j++) {
                if (list[j] && list[j].authorId === uid) stats.totalNotes++;
            }
        }

        // آمار چک‌ها
        var checks = _getAllChecks();
        for (var cid in checks) {
            if (!Object.prototype.hasOwnProperty.call(checks, cid)) continue;
            var lst = checks[cid];
            if (!Array.isArray(lst)) continue;
            for (var m = 0; m < lst.length; m++) {
                if (lst[m] && lst[m].done && lst[m].doneBy === uid) stats.totalChecks++;
            }
        }

        // آخرین فعالیت
        var activity = _getActivity();
        for (var n = 0; n < activity.length; n++) {
            if (activity[n].authorId === uid) {
                stats.lastActivityAt = activity[n].at;
                break;
            }
        }

        // ذخیره snapshot
        var all = _getAllStats();
        all[uid] = Object.assign({}, stats, { computedAt: Date.now() });
        _saveAllStats(all);

        _emit(VStoreEvents.STATS_UPDATED, { stats: stats });
        return stats;
    }

    function getCachedStats(verifierId) {
        verifierId = verifierId || _uid();
        if (!verifierId) return null;
        var all = _getAllStats();
        return all[verifierId] || null;
    }

    // ─────────────────────────────────────
    // 📋 ACTIVITY — فعالیت‌های اخیر
    // ─────────────────────────────────────
    function _getActivity() {
        var a = _safeRead(KEYS.ACTIVITY, []);
        return Array.isArray(a) ? a : [];
    }

    function _saveActivity(list) {
        return _safeWrite(KEYS.ACTIVITY, list);
    }

    function _recordActivity(type, data) {
        var list = _getActivity();
        var item = {
            id: _genId('act'),
            type: type,
            authorId: _uid(),
            data: data || {},
            at: Date.now()
        };
        list.push(item);
        if (list.length > MAX_ACTIVITY) {
            list = list.slice(-MAX_ACTIVITY);
        }
        _saveActivity(list);
        return item;
    }

    function getActivity(limit) {
        var list = _getActivity();
        // فقط فعالیت‌های من
        var uid = _uid();
        var mine = [];
        for (var i = list.length - 1; i >= 0; i--) {
            if (list[i] && (!uid || list[i].authorId === uid)) {
                mine.push(list[i]);
                if (limit && mine.length >= limit) break;
            }
        }
        return mine;
    }

    function clearActivity() {
        var uid = _uid();
        var list = _getActivity();
        var remaining = [];
        for (var i = 0; i < list.length; i++) {
            if (list[i] && list[i].authorId !== uid) remaining.push(list[i]);
        }
        _saveActivity(remaining);
        return { ok: true, count: list.length - remaining.length };
    }

    // ─────────────────────────────────────
    // 🔄 SYNC — همگام‌سازی
    // ─────────────────────────────────────
    function syncAll() {
        if (!STATE.installed) return { ok: false, reason: 'not_installed' };

        var result = {
            ok: true,
            notes: 0,
            checks: 0,
            drafts: 0,
            prefs: 0,
            syncedAt: Date.now()
        };

        var notes = _getAllNotes();
        for (var k in notes) {
            if (Object.prototype.hasOwnProperty.call(notes, k)) result.notes++;
        }

        var checks = _getAllChecks();
        for (var k2 in checks) {
            if (Object.prototype.hasOwnProperty.call(checks, k2)) result.checks++;
        }

        var drafts = _getAllDrafts();
        for (var k3 in drafts) {
            if (Object.prototype.hasOwnProperty.call(drafts, k3)) result.drafts++;
        }

        var prefs = _getAllPrefs();
        for (var k4 in prefs) {
            if (Object.prototype.hasOwnProperty.call(prefs, k4)) result.prefs++;
        }

        // پاکسازی draftهای منقضی
        _cleanupExpiredDrafts();

        _emit(VStoreEvents.SYNCED, result);
        return result;
    }

    function _cleanupExpiredDrafts() {
        var all = _getAllDrafts();
        var now = Date.now();
        var cleaned = 0;
        for (var k in all) {
            if (!Object.prototype.hasOwnProperty.call(all, k)) continue;
            var d = all[k];
            if (d && d.savedAt && (now - d.savedAt) > MAX_DRAFT_AGE_MS) {
                delete all[k];
                cleaned++;
            }
        }
        if (cleaned > 0) _saveAllDrafts(all);
        return cleaned;
    }

    // ─────────────────────────────────────
    // 🧹 پاکسازی و ریست
    // ─────────────────────────────────────
    function clearAll(scope) {
        // scope: 'notes' | 'checks' | 'drafts' | 'prefs' | 'activity' | 'all'
        if (scope === 'notes' || scope === 'all') Storage.remove(KEYS.NOTES);
        if (scope === 'checks' || scope === 'all') Storage.remove(KEYS.CHECKS);
        if (scope === 'drafts' || scope === 'all') Storage.remove(KEYS.DRAFTS);
        if (scope === 'prefs' || scope === 'all') Storage.remove(KEYS.PREFERENCES);
        if (scope === 'activity' || scope === 'all') Storage.remove(KEYS.ACTIVITY);
        if (scope === 'all') Storage.remove(KEYS.STATS);

        _emit(VStoreEvents.CLEARED, { scope: scope });
        return { ok: true, scope: scope };
    }

    function getStorageSize() {
        var size = 0;
        for (var k in KEYS) {
            if (!Object.prototype.hasOwnProperty.call(KEYS, k)) continue;
            var key = KEYS[k];
            if (typeof Storage !== 'undefined' && Storage.has(key)) {
                var raw = Storage.get(key, '');
                if (raw) size += raw.length;
            }
        }
        return { bytes: size, kb: Math.round(size / 1024 * 10) / 10 };
    }

    // ─────────────────────────────────────
    // 👤 نام کاربر جاری
    // ─────────────────────────────────────
    function _getNameOfCurrentUser() {
        if (typeof WamPermissions === 'undefined') return null;
        var me = WamPermissions.getCurrentUser();
        return me ? (me.name || me.username) : null;
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (STATE.installed && !options.force) return;

        STATE.currentVerifierId = _uid();
        STATE.lastAccessAt = Date.now();
        STATE.installed = true;

        // پاکسازی خودکار
        _cleanupExpiredDrafts();

        if (options.debug) {
            console.log('[verifier-storage] v' + VERSION + ' آماده — ' +
                'verifierId: ' + STATE.currentVerifierId);
        }
    }

    function uninstall() {
        STATE.installed = false;
        STATE.currentVerifierId = null;
        STATE.cache = {};
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        var size = getStorageSize();
        return {
            version: VERSION,
            installed: STATE.installed,
            verifierId: STATE.currentVerifierId,
            storageSizeBytes: size.bytes,
            storageSizeKB: size.kb,
            lastAccessAt: STATE.lastAccessAt,
            constants: {
                maxNotesPerCase: MAX_NOTES_PER_CASE,
                maxActivity: MAX_ACTIVITY,
                draftTTL: MAX_DRAFT_AGE_MS
            }
        };
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
    var WamVerifierStorage = {
        // ثوابت
        VERSION: VERSION,
        KEYS: KEYS,
        EVENTS: VStoreEvents,
        DEFAULT_CHECKLIST: DEFAULT_CHECKLIST,
        DEFAULT_PREFS: DEFAULT_PREFS,
        MAX_NOTES_PER_CASE: MAX_NOTES_PER_CASE,
        MAX_ACTIVITY: MAX_ACTIVITY,
        MAX_DRAFT_AGE_MS: MAX_DRAFT_AGE_MS,

        // چرخه
        install: install,
        uninstall: uninstall,
        syncAll: syncAll,
        clearAll: clearAll,
        getStorageSize: getStorageSize,

        // یادداشت‌ها
        getNotes: getNotes,
        addNote: addNote,
        updateNote: updateNote,
        removeNote: removeNote,
        clearNotes: clearNotes,
        getNotesCount: getNotesCount,

        // چک‌لیست
        getChecklist: getChecklist,
        toggleCheck: toggleCheck,
        resetChecklist: resetChecklist,
        getChecklistProgress: getChecklistProgress,

        // پیش‌نویس
        saveDraft: saveDraft,
        getDraft: getDraft,
        clearDraft: clearDraft,
        hasDraft: hasDraft,

        // تنظیمات
        getPreferences: getPreferences,
        setPreference: setPreference,
        resetPreferences: resetPreferences,

        // آمار
        computeMyStats: computeMyStats,
        getCachedStats: getCachedStats,

        // فعالیت
        getActivity: getActivity,
        clearActivity: clearActivity,

        // گزارش
        getStatus: getStatus,
        onChange: onChange
    };

    window.WamVerifierStorage = WamVerifierStorage;
    window.VStoreEvents = VStoreEvents;

    // ثبت خودکار
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { install(); });
        } else {
            install();
        }
    }

})();




/* ==========================================
 * FROM: js/verifier-wizard.js
 * ========================================== */


// ==========================================
// وام پی — Verifier Panel
// فایل: verifier-wizard.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: ویزارد بررسی پرونده توسط اعتبارسنج
//        (چک‌لیست + یادداشت + تصمیم نهایی)
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var ROOT_ATTR    = 'data-verifier-wizard';
    var CASE_ATTR    = 'data-case-id';
    var DECISIONS    = {
        APPROVE: 'approve',
        REJECT:  'reject',
        REVISE:  'revise'
    };

    var DECISION_LABELS = {
        approve: 'تأیید پرونده',
        reject:  'رد پرونده',
        revise:  'درخواست اصلاح'
    };

    var NOTE_CATEGORIES = {
        general: 'یادداشت',
        review:  'بررسی',
        warning: 'هشدار',
        reject:  'رد'
    };

    var MIN_REJECT_NOTE = 10;

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        caseId: null,
        caseData: null,
        checklist: [],
        currentIndex: 0,
        totalSteps: 0,
        decision: null,
        decisionNote: '',
        submitting: false,
        listeners: [],
        _autoSaveTimer: null
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var VWizEvents = {
        START:        'vwiz.start',
        STEP_CHANGE:  'vwiz.step',
        CHECK_TOGGLED:'vwiz.check_toggled',
        NOTE_ADDED:   'vwiz.note_added',
        DECISION_SET: 'vwiz.decision_set',
        DRAFT_SAVED:  'vwiz.draft_saved',
        SUBMIT:       'vwiz.submit',
        SUCCESS:      'vwiz.success',
        FAIL:         'vwiz.fail',
        CANCEL:       'vwiz.cancel'
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
    function _esc(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _fa(n) {
        var s = String(n === null || n === undefined ? 0 : n);
        return s.replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _amt(n) {
        if (n === null || n === undefined || n === '') return '—';
        var x = Number(n);
        if (isNaN(x)) return '—';
        return x.toLocaleString('en-US').replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _relTime(ts) {
        if (!ts) return '—';
        var d = Date.now() - ts;
        var s = Math.floor(d / 1000);
        if (s < 60) return 'همین الان';
        var m = Math.floor(s / 60);
        if (m < 60) return _fa(m) + ' دقیقه پیش';
        var h = Math.floor(m / 60);
        if (h < 24) return _fa(h) + ' ساعت پیش';
        var day = Math.floor(h / 24);
        if (day < 30) return _fa(day) + ' روز پیش';
        return _fa(Math.floor(day / 30)) + ' ماه پیش';
    }

    function _jalali(ts) {
        if (!ts) return '—';
        try {
            if (typeof WamPersianDate !== 'undefined') {
                var d = new Date(ts);
                var j = WamPersianDate.dateToJalali(d);
                if (j) return WamPersianDate.format(j.jy, j.jm, j.jd, 'YYYY/MM/DD');
            }
        } catch (e) { /* بی‌صدا */ }
        return new Date(ts).toLocaleDateString('fa-IR');
    }

    function _uid() {
        if (typeof WamPermissions === 'undefined') return null;
        var me = WamPermissions.getCurrentUser();
        return me ? me.id : null;
    }

    function _nameOfCurrentUser() {
        if (typeof WamPermissions === 'undefined') return null;
        var me = WamPermissions.getCurrentUser();
        return me ? (me.name || me.username) : null;
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری پرونده
    // ─────────────────────────────────────
    function _loadCase(caseId) {
        if (!caseId) return null;
        if (typeof CaseRepository === 'undefined') return null;
        try { return CaseRepository.get(caseId); }
        catch (e) { return null; }
    }

    function _ensureChecklist(caseId) {
        if (typeof WamVerifierStorage === 'undefined') return [];
        if (!WamVerifierStorage.getChecklist) return [];

        // اطمینان از وجود چک‌لیست
        var list = WamVerifierStorage.getChecklist(caseId);
        return Array.isArray(list) ? list : [];
    }

    function _loadDraft() {
        if (typeof WamVerifierStorage === 'undefined') return null;
        if (!WamVerifierStorage.getDraft) return null;
        return WamVerifierStorage.getDraft(STATE.caseId);
    }

    function _saveDraft() {
        if (typeof WamVerifierStorage === 'undefined') return;
        if (!WamVerifierStorage.saveDraft) return;

        var draftData = {
            currentIndex: STATE.currentIndex,
            decision: STATE.decision,
            decisionNote: STATE.decisionNote
        };
        WamVerifierStorage.saveDraft(STATE.caseId,
            JSON.stringify(draftData));
        _emit(VWizEvents.DRAFT_SAVED, { caseId: STATE.caseId });
    }

    function _scheduleAutoSave() {
        if (STATE._autoSaveTimer) clearTimeout(STATE._autoSaveTimer);
        STATE._autoSaveTimer = setTimeout(function () {
            _saveDraft();
        }, 900);
    }

    // ─────────────────────────────────────
    // 📊 پیشرفت
    // ─────────────────────────────────────
    function computeProgress() {
        var list = STATE.checklist || [];
        var done = 0;
        var requiredDone = 0;
        var requiredTotal = 0;
        for (var i = 0; i < list.length; i++) {
            if (list[i].done) done++;
            if (list[i].required) {
                requiredTotal++;
                if (list[i].done) requiredDone++;
            }
        }
        return {
            done: done,
            total: list.length,
            percent: list.length > 0 ? Math.round((done / list.length) * 100) : 0,
            requiredDone: requiredDone,
            requiredTotal: requiredTotal,
            isComplete: requiredDone === requiredTotal && requiredTotal > 0
        };
    }

    function canSubmit() {
        var p = computeProgress();
        if (!p.isComplete) return false;
        if (!STATE.decision) return false;
        if (STATE.decision === DECISIONS.REJECT &&
            (!STATE.decisionNote || STATE.decisionNote.trim().length < MIN_REJECT_NOTE)) {
            return false;
        }
        if (STATE.decision === DECISIONS.REVISE &&
            (!STATE.decisionNote || STATE.decisionNote.trim().length < MIN_REJECT_NOTE)) {
            return false;
        }
        return true;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — هدر
    // ─────────────────────────────────────
    function _renderHeader() {
        var c = STATE.caseData || {};
        var p = computeProgress();

        return '<header class="wam-vwiz__header">' +
            '<div class="wam-vwiz__head-left">' +
                '<button class="wam-btn-icon" data-vwiz-action="close" ' +
                'title="بازگشت">‹</button>' +
                '<div>' +
                    '<div class="wam-vwiz__title">🔍 بررسی پرونده</div>' +
                    '<div class="wam-vwiz__subtitle">' +
                        '<code>' + _esc(c.caseId || '—') + '</code>' +
                        ' · ' + _esc(c.applicantName || '—') +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="wam-vwiz__head-right">' +
                '<button class="wam-btn-icon" data-vwiz-action="save-draft" ' +
                'title="ذخیره پیش‌نویس">💾</button>' +
                '<span class="wam-vwiz__progress-badge">' +
                    _fa(p.done) + '/' + _fa(p.total) +
                '</span>' +
            '</div>' +
        '</header>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — خلاصه پرونده
    // ─────────────────────────────────────
    function _renderCaseSummary() {
        var c = STATE.caseData || {};
        return '<section class="wam-vwiz__summary">' +
            '<div class="wam-vwiz__summary-row">' +
                '<span>متقاضی:</span> <strong>' + _esc(c.applicantName || '—') + '</strong>' +
            '</div>' +
            '<div class="wam-vwiz__summary-row">' +
                '<span>موبایل:</span> ' + _esc(c.applicantMobile || '—') +
            '</div>' +
            '<div class="wam-vwiz__summary-row">' +
                '<span>بانک:</span> ' + _esc(c.bank || '—') +
            '</div>' +
            '<div class="wam-vwiz__summary-row">' +
                '<span>مبلغ:</span> ' + _amt(c.loanAmount) + ' ریال' +
            '</div>' +
            '<div class="wam-vwiz__summary-row">' +
                '<span>هدف:</span> ' + _esc(c.purpose || '—') +
            '</div>' +
            '<div class="wam-vwiz__summary-row">' +
                '<span>تاریخ ثبت:</span> ' + _esc(_jalali(c.createdAt)) +
            '</div>' +
        '</section>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نوار پیشرفت
    // ─────────────────────────────────────
    function _renderProgressBar() {
        var p = computeProgress();
        return '<div class="wam-vwiz__progress">' +
            '<div class="wam-vwiz__progress-fill" style="width:' +
            p.percent + '%"></div></div>' +
            '<div class="wam-vwiz__progress-label">' +
            _fa(p.done) + ' از ' + _fa(p.total) + ' مورد بررسی شد ' +
            '(' + _fa(p.percent) + '٪)' +
            '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — مرحله (check item)
    // ─────────────────────────────────────
    function _renderStep() {
        var list = STATE.checklist || [];
        if (list.length === 0) {
            return '<div class="wam-empty">چک‌لیستی وجود ندارد.</div>';
        }
        var idx = STATE.currentIndex;
        var item = list[idx];
        if (!item) return '<div class="wam-empty">مرحله نامعتبر.</div>';

        var notes = _getNotesForCurrentStep(item.id);

        var html = '<section class="wam-vwiz__step" data-step-id="' +
            _esc(item.id) + '">';

        html += '<div class="wam-vwiz__step-head">';
        html += '<div class="wam-vwiz__step-num">' +
                _fa(idx + 1) + '/' + _fa(list.length) + '</div>';
        html += '<h3 class="wam-vwiz__step-title">' +
                _esc(item.label) +
                (item.required ? ' <span class="wam-required">*</span>' : '') +
                '</h3>';
        html += '</div>';

        html += '<label class="wam-vwiz__check">' +
            '<input type="checkbox" data-vwiz="check" ' +
            (item.done ? 'checked' : '') + '>' +
            '<span>' + _esc(item.label) + '</span>' +
        '</label>';

        if (item.done && item.doneAt) {
            html += '<div class="wam-vwiz__check-meta">' +
                '✓ بررسی‌شده در ' + _esc(_relTime(item.doneAt)) +
                '</div>';
        }

        // یادداشت مرحله
        html += '<div class="wam-vwiz__notes">';
        html += '<div class="wam-vwiz__notes-head">' +
                '<span>📝 یادداشت‌ها</span>' +
                '</div>';

        if (notes.length > 0) {
            html += '<ul class="wam-vwiz__notes-list">';
            for (var i = 0; i < notes.length; i++) {
                var n = notes[i];
                html += '<li class="wam-vwiz__note wam-vwiz__note--' +
                        _esc(n.category || 'general') + '">' +
                    '<div class="wam-vwiz__note-text">' +
                    _esc(n.text) + '</div>' +
                    '<div class="wam-vwiz__note-meta">' +
                    _esc(n.authorName || '') + ' · ' +
                    _esc(_relTime(n.createdAt)) + ' ' +
                    '<button class="wam-btn-icon wam-btn-icon--danger" ' +
                    'data-vwiz-action="delete-note" data-note-id="' +
                    _esc(n.id) + '" title="حذف">🗑️</button>' +
                    '</div></li>';
            }
            html += '</ul>';
        } else {
            html += '<div class="wam-vwiz__notes-empty">یادداشتی ثبت نشده.</div>';
        }

        html += '<form class="wam-vwiz__note-form" data-vwiz="note-form">' +
            '<textarea name="noteText" rows="2" ' +
            'placeholder="یادداشت خود را بنویسید..."></textarea>' +
            '<div class="wam-vwiz__note-form-row">' +
                '<select name="noteCategory">' +
                    '<option value="general">یادداشت</option>' +
                    '<option value="review">بررسی</option>' +
                    '<option value="warning">هشدار</option>' +
                '</select>' +
                '<button type="submit" class="wam-btn wam-btn--sm wam-btn--primary">' +
                'افزودن</button>' +
            '</div>' +
        '</form>';

        html += '</div>';

        html += '</section>';
        return html;
    }

    function _getNotesForCurrentStep(stepId) {
        if (typeof WamVerifierStorage === 'undefined') return [];
        if (!WamVerifierStorage.getNotes) return [];
        var all = WamVerifierStorage.getNotes(STATE.caseId);
        // فیلتر بر اساس stepId در category یا بر اساس متن
        // در این نسخه ساده، همه یادداشت‌ها را نشان می‌دهیم
        return all;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ناوبری مرحله
    // ─────────────────────────────────────
    function _renderStepNav() {
        var list = STATE.checklist || [];
        var first = STATE.currentIndex === 0;
        var last = STATE.currentIndex >= list.length - 1;

        return '<div class="wam-vwiz__nav">' +
            '<button type="button" class="wam-btn wam-btn--ghost" ' +
            'data-vwiz-action="prev"' + (first ? ' disabled' : '') + '>' +
            '‹ قبلی</button>' +
            '<span class="wam-vwiz__nav-label">مرحله ' +
            _fa(STATE.currentIndex + 1) + ' از ' + _fa(list.length) +
            '</span>' +
            (last
                ? '<button type="button" class="wam-btn wam-btn--primary" ' +
                  'data-vwiz-action="to-decision">تصمیم نهایی ›</button>'
                : '<button type="button" class="wam-btn wam-btn--primary" ' +
                  'data-vwiz-action="next">بعدی ›</button>') +
        '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — تصمیم نهایی
    // ─────────────────────────────────────
    function _renderDecision() {
        var p = computeProgress();
        var html = '<section class="wam-vwiz__decision">';
        html += '<h3>✅ تصمیم نهایی</h3>';

        // خلاصه چک‌لیست
        html += '<div class="wam-vwiz__decision-summary">';
        html += '<div class="wam-vwiz__decision-row">' +
                '<span>موارد بررسی‌شده:</span>' +
                '<strong>' + _fa(p.done) + ' از ' + _fa(p.total) + '</strong>' +
                '</div>';
        html += '<div class="wam-vwiz__decision-row">' +
                '<span>الزامی‌های تکمیل:</span>' +
                '<strong class="' + (p.isComplete ? 'wam-success' : 'wam-danger') + '">' +
                _fa(p.requiredDone) + ' از ' + _fa(p.requiredTotal) + '</strong>' +
                '</div>';
        html += '</div>';

        if (!p.isComplete) {
            html += '<div class="wam-vwiz__decision-warning">' +
                '⚠️ برای تصمیم‌گیری، ابتدا همه موارد الزامی چک‌لیست را تکمیل کنید.' +
                '</div>';
        }

        // انتخاب تصمیم
        html += '<div class="wam-vwiz__decision-options">';

        html += _renderDecisionOption('approve', '✅', 'تأیید پرونده',
            'پرونده از نظر شما معتبر است', 'success');
        html += _renderDecisionOption('reject', '❌', 'رد پرونده',
            'پرونده شرایط لازم را ندارد', 'danger');
        html += _renderDecisionOption('revise', '🔄', 'درخواست اصلاح',
            'نیاز به اصلاح اطلاعات یا مدارک', 'warning');

        html += '</div>';

        // یادداشت تصمیم
        var noteRequired = (STATE.decision === 'reject' || STATE.decision === 'revise');
        html += '<div class="wam-vwiz__decision-note">';
        html += '<label>' + (noteRequired ? 'دلیل (الزامی) *' : 'یادداشت (اختیاری)') + '</label>';
        html += '<textarea name="decisionNote" rows="4" ' +
                'placeholder="' +
                (noteRequired ? 'دلیل را با جزئیات بنویسید...' : 'توضیح اختیاری...') +
                '">' + _esc(STATE.decisionNote) + '</textarea>';
        if (noteRequired && STATE.decisionNote.trim().length < MIN_REJECT_NOTE) {
            html += '<div class="wam-vwiz__error">حداقل ' +
                    _fa(MIN_REJECT_NOTE) + ' کاراکتر وارد کنید</div>';
        }
        html += '</div>';

        // دکمه ارسال
        var canGo = canSubmit();
        html += '<div class="wam-vwiz__decision-actions">';
        html += '<button type="button" class="wam-btn wam-btn--ghost" ' +
                'data-vwiz-action="back-to-checklist">‹ بازگشت به چک‌لیست</button>';
        html += '<button type="button" class="wam-btn wam-btn--primary" ' +
                'data-vwiz-action="submit"' +
                (canGo ? '' : ' disabled') + '>' +
                'ثبت تصمیم</button>';
        html += '</div>';

        html += '</section>';
        return html;
    }

    function _renderDecisionOption(id, icon, title, desc, accent) {
        var selected = STATE.decision === id;
        return '<div class="wam-vwiz__decision-option wam-vwiz__decision-option--' +
            accent + (selected ? ' is-selected' : '') + '" ' +
            'data-vwiz="decision" data-decision="' + id + '">' +
            '<div class="wam-vwiz__decision-option-icon">' + icon + '</div>' +
            '<div class="wam-vwiz__decision-option-body">' +
                '<div class="wam-vwiz__decision-option-title">' + title + '</div>' +
                '<div class="wam-vwiz__decision-option-desc">' + desc + '</div>' +
            '</div>' +
            (selected ? '<div class="wam-vwiz__decision-option-check">✓</div>' : '') +
        '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;

        if (!STATE.caseData) {
            STATE.root.innerHTML = '<div class="wam-empty">' +
                'پرونده یافت نشد.</div>';
            return;
        }

        var isDecision = (STATE.currentIndex === -1);
        var bodyHtml = isDecision ? _renderDecision() : _renderStep();

        var html =
            '<div class="wam-vwiz">' +
                _renderHeader() +
                _renderCaseSummary() +
                _renderProgressBar() +
                '<div class="wam-vwiz__body">' +
                    bodyHtml +
                '</div>' +
                (isDecision ? '' : _renderStepNav()) +
            '</div>';

        STATE.root.innerHTML = html;
        _bindEvents();
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents() {
        if (!STATE.root) return;

        // اکشن‌های اصلی
        var btns = STATE.root.querySelectorAll('[data-vwiz-action]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', _handleAction);
        }

        // چک‌باکس مرحله
        var checkBox = STATE.root.querySelector('[data-vwiz="check"]');
        if (checkBox) {
            checkBox.addEventListener('change', _handleCheckToggle);
        }

        // فرم یادداشت
        var noteForm = STATE.root.querySelector('[data-vwiz="note-form"]');
        if (noteForm) {
            noteForm.addEventListener('submit', _handleNoteSubmit);
        }

        // انتخاب تصمیم
        var decisions = STATE.root.querySelectorAll('[data-vwiz="decision"]');
        for (var j = 0; j < decisions.length; j++) {
            decisions[j].addEventListener('click', _handleDecisionSelect);
        }

        // textarea یادداشت تصمیم
        var noteEl = STATE.root.querySelector('[name="decisionNote"]');
        if (noteEl) {
            noteEl.addEventListener('input', function () {
                STATE.decisionNote = this.value;
                _scheduleAutoSave();
                _refreshSubmitState();
            });
        }
    }

    function _handleAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-vwiz-action');

        if (a === 'close') {
            if (confirmExit()) {
                _emit(VWizEvents.CANCEL, { at: Date.now() });
                _goBack();
            }
            return;
        }
        if (a === 'save-draft') {
            _saveDraft();
            if (typeof WamUI !== 'undefined') {
                WamUI.toastSuccess('پیش‌نویس ذخیره شد', 'موفق');
            }
            return;
        }
        if (a === 'prev') { goPrev(); return; }
        if (a === 'next') { goNext(); return; }
        if (a === 'to-decision') { goToDecision(); return; }
        if (a === 'back-to-checklist') { backToChecklist(); return; }
        if (a === 'submit') { submit(); return; }
        if (a === 'delete-note') {
            var noteId = this.getAttribute('data-note-id');
            _deleteNote(noteId);
            return;
        }
    }

    function _handleCheckToggle() {
        var list = STATE.checklist || [];
        var item = list[STATE.currentIndex];
        if (!item) return;

        var done = this.checked;

        if (typeof WamVerifierStorage !== 'undefined' &&
            WamVerifierStorage.toggleCheck) {
            WamVerifierStorage.toggleCheck(STATE.caseId, item.id, done);
        }

        item.done = done;
        item.doneAt = done ? Date.now() : null;
        item.doneBy = done ? _uid() : null;

        _emit(VWizEvents.CHECK_TOGGLED, {
            caseId: STATE.caseId,
            checkId: item.id,
            done: done
        });

        // رندر مجدد (فقط برای به‌روزرسانی progress)
        render();
    }

    function _handleNoteSubmit(e) {
        e.preventDefault();
        var form = e.target;
        var textEl = form.querySelector('[name="noteText"]');
        var catEl = form.querySelector('[name="noteCategory"]');
        if (!textEl) return;

        var text = textEl.value.trim();
        if (text.length === 0) return;

        if (typeof WamVerifierStorage === 'undefined' ||
            !WamVerifierStorage.addNote) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('ماژول ذخیره‌سازی یافت نشد', 'خطا');
            }
            return;
        }

        var res = WamVerifierStorage.addNote(STATE.caseId, text, {
            category: catEl ? catEl.value : 'general',
            authorName: _nameOfCurrentUser()
        });

        if (!res.ok) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('خطا در ثبت یادداشت', 'خطا');
            }
            return;
        }

        _emit(VWizEvents.NOTE_ADDED, {
            caseId: STATE.caseId, note: res.note
        });

        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('یادداشت ثبت شد', 'موفق');
        }

        render();
    }

    function _deleteNote(noteId) {
        if (!noteId) return;
        if (typeof WamVerifierStorage === 'undefined' ||
            !WamVerifierStorage.removeNote) return;

        var doIt = function () {
            var res = WamVerifierStorage.removeNote(STATE.caseId, noteId);
            if (res.ok) {
                if (typeof WamUI !== 'undefined') {
                    WamUI.toastInfo('یادداشت حذف شد', 'موفق');
                }
                render();
            }
        };

        var msg = 'این یادداشت حذف شود؟';
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('حذف یادداشت', msg, { danger: true })
                .then(function (ok) { if (ok) doIt(); });
        } else if (window.confirm(msg)) {
            doIt();
        }
    }

    function _handleDecisionSelect(e) {
        e.preventDefault();
        var d = this.getAttribute('data-decision');
        if (!d) return;
        STATE.decision = d;
        _scheduleAutoSave();
        _emit(VWizEvents.DECISION_SET, {
            caseId: STATE.caseId, decision: d
        });
        render();
    }

    // ─────────────────────────────────────
    // 🎯 ناوبری
    // ─────────────────────────────────────
    function goNext() {
        var list = STATE.checklist || [];
        if (STATE.currentIndex >= list.length - 1) {
            goToDecision();
            return;
        }
        STATE.currentIndex++;
        _scheduleAutoSave();
        render();
        _emit(VWizEvents.STEP_CHANGE, { index: STATE.currentIndex });
    }

    function goPrev() {
        if (STATE.currentIndex <= 0) return;
        STATE.currentIndex--;
        _scheduleAutoSave();
        render();
        _emit(VWizEvents.STEP_CHANGE, { index: STATE.currentIndex });
    }

    function goToDecision() {
        STATE.currentIndex = -1;
        _scheduleAutoSave();
        render();
        _emit(VWizEvents.STEP_CHANGE, { index: -1 });
    }

    function backToChecklist() {
        var list = STATE.checklist || [];
        STATE.currentIndex = Math.max(0, list.length - 1);
        render();
    }

    function _refreshSubmitState() {
        // فقط دکمه را فعال/غیرفعال کن بدون رندر کل
        if (!STATE.root) return;
        var btns = STATE.root.querySelectorAll('[data-vwiz-action="submit"]');
        for (var i = 0; i < btns.length; i++) {
            if (canSubmit()) btns[i].removeAttribute('disabled');
            else btns[i].setAttribute('disabled', 'disabled');
        }
    }

    // ─────────────────────────────────────
    // ✅ ارسال نهایی
    // ─────────────────────────────────────
    function submit() {
        if (STATE.submitting) return false;

        // اعتبارسنجی نهایی
        if (!STATE.decision) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('ابتدا تصمیم خود را انتخاب کنید', 'خطا');
            }
            return false;
        }

        var p = computeProgress();
        if (!p.isComplete) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('ابتدا همه موارد الزامی چک‌لیست را تکمیل کنید', 'خطا');
            }
            return false;
        }

        if ((STATE.decision === DECISIONS.REJECT ||
             STATE.decision === DECISIONS.REVISE) &&
            STATE.decisionNote.trim().length < MIN_REJECT_NOTE) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('دلیل باید حداقل ' +
                    _fa(MIN_REJECT_NOTE) + ' کاراکتر باشد', 'خطا');
            }
            return false;
        }

        STATE.submitting = true;
        _setBusy(true);
        _emit(VWizEvents.SUBMIT, {
            caseId: STATE.caseId,
            decision: STATE.decision
        });

        setTimeout(function () {
            var res = _applyDecision();

            if (!res.ok) {
                STATE.submitting = false;
                _setBusy(false);
                _emit(VWizEvents.FAIL, res);
                if (typeof WamUI !== 'undefined') {
                    WamUI.toastError(
                        'خطا در ثبت: ' + (res.reason || 'نامشخص'), 'خطا');
                }
                return;
            }

            // پاکسازی draft
            if (typeof WamVerifierStorage !== 'undefined' &&
                WamVerifierStorage.clearDraft) {
                WamVerifierStorage.clearDraft(STATE.caseId);
            }

            _emit(VWizEvents.SUCCESS, {
                caseId: STATE.caseId,
                decision: STATE.decision
            });

            if (typeof WamUI !== 'undefined') {
                var label = DECISION_LABELS[STATE.decision] || STATE.decision;
                WamUI.toastSuccess(label + ' با موفقیت ثبت شد', 'موفق');
                if (WamUI.loader) {
                    WamUI.loader.show('وام پی', 'در حال بازگشت...');
                }
            }

            setTimeout(_goBack, 900);
        }, 450);
    }

    function _applyDecision() {
        if (typeof CaseStateMachine === 'undefined') {
            return { ok: false, reason: 'no_state_machine' };
        }
        var caseId = STATE.caseId;
        var me = _uid();
        var opts = { userId: me, role: 'verifier' };

        var currentStep = STATE.caseData.currentStep || 'step_4';

        var r;
        if (STATE.decision === DECISIONS.APPROVE) {
            // تکمیل مرحله اعتبارسنجی
            if (typeof CaseStateMachine.completeStep === 'function') {
                r = CaseStateMachine.completeStep(caseId, currentStep, {
                    userId: me,
                    role: 'verifier',
                    note: STATE.decisionNote || 'تأیید توسط اعتبارسنج',
                    syncApproval: true
                });
            } else {
                return { ok: false, reason: 'no_complete_method' };
            }
        } else if (STATE.decision === DECISIONS.REJECT) {
            if (typeof CaseStateMachine.rejectStep === 'function') {
                r = CaseStateMachine.rejectStep(caseId, currentStep, {
                    userId: me,
                    role: 'verifier',
                    note: STATE.decisionNote,
                    syncApproval: true
                });
            } else {
                return { ok: false, reason: 'no_reject_method' };
            }
        } else if (STATE.decision === DECISIONS.REVISE) {
            if (typeof CaseStateMachine.reviseStep === 'function') {
                r = CaseStateMachine.reviseStep(caseId, currentStep, {
                    userId: me,
                    role: 'verifier',
                    note: STATE.decisionNote,
                    syncApproval: true
                });
            } else {
                return { ok: false, reason: 'no_revise_method' };
            }
        } else {
            return { ok: false, reason: 'invalid_decision' };
        }

        if (!r || !r.ok) {
            return { ok: false, reason: (r && r.reason) || 'transition_failed' };
        }

        return { ok: true, result: r };
    }

    function _setBusy(b) {
        if (!STATE.root) return;
        var btn = STATE.root.querySelector('[data-vwiz-action="submit"]');
        if (!btn) return;
        if (b) {
            btn.disabled = true;
            btn.setAttribute('data-orig', btn.textContent);
            btn.textContent = 'در حال ثبت...';
        } else {
            btn.disabled = false;
            var o = btn.getAttribute('data-orig');
            if (o) btn.textContent = o;
        }
    }

    // ─────────────────────────────────────
    // 🚪 بازگشت / انصراف
    // ─────────────────────────────────────
    function confirmExit() {
        if (STATE.submitting) return false;
        if (STATE.decision || computeProgress().done > 0) {
            var msg = 'تغییرات ذخیره شده‌اند. بازگردیم؟';
            return window.confirm(msg);
        }
        return true;
    }

    function _goBack() {
        if (typeof WamUI !== 'undefined' && WamUI.loader) {
            WamUI.loader.hide();
        }
        // بازگشت به پنل اعتبارسنج
        if (window.history && window.history.length > 1) {
            window.history.back();
        } else {
            window.location.href = 'verifier-panel.html';
        }
    }

    // ─────────────────────────────────────
    // 🎯 بارگذاری اولیه
    // ─────────────────────────────────────
    function _getCaseIdFromUrl() {
        try {
            var params = new URLSearchParams(window.location.search);
            return params.get('id') || params.get('caseId');
        } catch (e) {
            return null;
        }
    }

    function open(caseId) {
        if (!caseId) return false;

        STATE.caseId = caseId;
        STATE.caseData = _loadCase(caseId);
        if (!STATE.caseData) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('پرونده یافت نشد', 'خطا');
            }
            return false;
        }

        // بارگذاری چک‌لیست
        STATE.checklist = _ensureChecklist(caseId);
        STATE.totalSteps = STATE.checklist.length;
        STATE.currentIndex = 0;
        STATE.decision = null;
        STATE.decisionNote = '';

        // بازیابی draft
        var draft = _loadDraft();
        if (draft) {
            try {
                var d = JSON.parse(draft.text || '{}');
                if (typeof d.currentIndex === 'number') {
                    STATE.currentIndex = d.currentIndex;
                }
                if (d.decision) STATE.decision = d.decision;
                if (d.decisionNote) STATE.decisionNote = d.decisionNote;
                if (typeof WamUI !== 'undefined') {
                    WamUI.toastInfo('پیش‌نویس قبلی بازیابی شد', 'خوش آمدید');
                }
            } catch (e) { /* بی‌صدا */ }
        }

        render();
        _emit(VWizEvents.START, { caseId: caseId, at: Date.now() });
        return true;
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var run = function () {
            var me = (typeof WamPermissions !== 'undefined')
                ? WamPermissions.getCurrentUser() : null;
            if (!me) {
                if (typeof WamPayGuard !== 'undefined') {
                    WamPayGuard.redirectToLogin('not_logged_in');
                }
                return;
            }
            if (me.role !== 'verifier' && me.role !== 'admin' &&
                me.role !== 'super_admin') {
                if (typeof WamPayGuard !== 'undefined') {
                    WamPayGuard.redirectToRoleHome(me.role);
                }
                return;
            }

            var root = options.root ||
                       document.querySelector('[' + ROOT_ATTR + ']') ||
                       document.querySelector('.wam-verifier-wizard');
            if (!root) {
                if (options.debug) console.warn('[verifier-wizard] root پیدا نشد');
                return;
            }
            STATE.root = root;

            var caseId = options.caseId || _getCaseIdFromUrl();
            if (!caseId) {
                STATE.root.innerHTML = '<div class="wam-empty">' +
                    'شناسه پرونده داده نشده است.</div>';
                return;
            }

            var ok = open(caseId);
            if (!ok) {
                STATE.root.innerHTML = '<div class="wam-empty">' +
                    'پرونده یافت نشد یا خطا در بارگذاری.</div>';
                return;
            }

            STATE.installed = true;
            if (options.debug) {
                console.log('[verifier-wizard] آماده — ' + caseId);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run);
        } else {
            run();
        }
    }

    function uninstall() {
        if (STATE._autoSaveTimer) {
            clearTimeout(STATE._autoSaveTimer);
            STATE._autoSaveTimer = null;
        }
        STATE.root = null;
        STATE.installed = false;
        STATE.caseId = null;
        STATE.caseData = null;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            caseId: STATE.caseId,
            currentIndex: STATE.currentIndex,
            totalSteps: STATE.totalSteps,
            decision: STATE.decision,
            decisionNoteLength: (STATE.decisionNote || '').length,
            submitting: STATE.submitting,
            progress: computeProgress(),
            canSubmit: canSubmit()
        };
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
    var WamVerifierWizard = {
        EVENTS: VWizEvents,
        ROOT_ATTR: ROOT_ATTR,
        DECISIONS: DECISIONS,
        DECISION_LABELS: DECISION_LABELS,
        NOTE_CATEGORIES: NOTE_CATEGORIES,
        MIN_REJECT_NOTE: MIN_REJECT_NOTE,

        install: install,
        uninstall: uninstall,
        open: open,
        render: render,

        goNext: goNext,
        goPrev: goPrev,
        goToDecision: goToDecision,
        backToChecklist: backToChecklist,

        submit: submit,
        saveDraft: _saveDraft,

        computeProgress: computeProgress,
        canSubmit: canSubmit,

        getCaseData: function () { return STATE.caseData; },
        getChecklist: function () { return STATE.checklist.slice(); },

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamVerifierWizard = WamVerifierWizard;
    window.VerifierWizardEvents = VWizEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-verifier-wizard-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-verifier-wizard')) {
                install();
            }
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _auto);
        } else {
            _auto();
        }
    }

})();




/* ==========================================
 * FROM: js/verifier-actions.js
 * ========================================== */


// ==========================================
// وام پی — Verifier Panel
// فایل: verifier-actions.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: اکشن‌های اعتبارسنج — عملیات گروهی، فیلتر پیشرفته، ابزارها
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION = '1.0.0';

    var SORT_OPTIONS = {
        oldest:   'قدیمی‌ترین',
        newest:   'جدیدترین',
        amount:   'بیشترین مبلغ',
        priority: 'اولویت'
    };

    var PRIORITY_LABELS = {
        low:    'کم',
        normal: 'معمولی',
        high:   'بالا',
        urgent: 'فوری'
    };

    var QUICK_FILTERS = {
        all:        'همه',
        urgent:     'فوری (بیش از ۳ روز)',
        today:      'امروز',
        bigAmount:  'مبالغ بالا',
        highPriority: 'اولویت بالا'
    };

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        cases: [],
        filtered: [],
        selectedIds: {},
        filters: {
            query: '',
            bank: '',
            minAmount: '',
            maxAmount: '',
            quick: 'all',
            priority: ''
        },
        sort: 'oldest',
        listeners: [],
        _boundSelectAll: false
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var VActionEvents = {
        LOADED:         'vact.loaded',
        BULK_APPROVE:   'vact.bulk_approve',
        BULK_REJECT:    'vact.bulk_reject',
        BULK_PRIORITY:  'vact.bulk_priority',
        BULK_ASSIGN:    'vact.bulk_assign',
        EXPORTED:       'vact.exported',
        FILTERED:       'vact.filtered',
        SELECTION:      'vact.selection',
        ACTION_FAIL:    'vact.action_fail'
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
    function _fa(n) {
        var s = String(n === null || n === undefined ? 0 : n);
        return s.replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _amt(n) {
        if (n === null || n === undefined || n === '') return '—';
        var x = Number(n);
        if (isNaN(x)) return '—';
        return x.toLocaleString('en-US').replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _en(s) {
        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.toEnglishDigits) {
            return WamPersianDate.toEnglishDigits(s);
        }
        return String(s || '').replace(/[۰-۹]/g, function (d) {
            return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
        });
    }

    function _uid() {
        if (typeof WamPermissions === 'undefined') return null;
        var me = WamPermissions.getCurrentUser();
        return me ? me.id : null;
    }

    function _toast(type, msg, title) {
        if (typeof WamUI === 'undefined') return;
        if (type === 'success' && WamUI.toastSuccess) WamUI.toastSuccess(msg, title || 'موفق');
        else if (type === 'error' && WamUI.toastError) WamUI.toastError(msg, title || 'خطا');
        else if (type === 'warning' && WamUI.toastWarning) WamUI.toastWarning(msg, title || 'توجه');
        else if (type === 'info' && WamUI.toastInfo) WamUI.toastInfo(msg, title || 'اطلاع');
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری پرونده‌ها
    // ─────────────────────────────────────
    function _loadAllCases() {
        if (typeof CaseRepository === 'undefined') return [];
        try {
            var all = CaseRepository.getAll() || [];
            // فقط پرونده‌هایی که در مرحله بررسی هستند
            var q = [];
            for (var i = 0; i < all.length; i++) {
                var c = all[i];
                if (!c) continue;
                var step = c.currentStep || '';
                var st = c.status || 'draft';
                if ((step === 'step_3' || step === 'step_4') &&
                    st !== 'completed' && st !== 'rejected' &&
                    st !== 'cancelled' && st !== 'archived') {
                    q.push(c);
                }
            }
            return q;
        } catch (e) {
            return [];
        }
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر پیشرفته
    // ─────────────────────────────────────
    function _applyFilters() {
        var f = STATE.filters;
        var q = (f.query || '').toLowerCase().trim();
        var minAmt = f.minAmount ? Number(_en(f.minAmount)) : 0;
        var maxAmt = f.maxAmount ? Number(_en(f.maxAmount)) : 0;
        var now = Date.now();
        var todayStart = new Date().setHours(0, 0, 0, 0);
        var threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

        STATE.filtered = STATE.cases.filter(function (c) {
            if (!c) return false;

            // جستجوی متنی
            if (q) {
                var hay = [c.caseId, c.applicantName, c.applicantMobile,
                           c.bank, c.brokerName]
                    .filter(Boolean).join(' ').toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }

            // بانک
            if (f.bank && c.bank !== f.bank) return false;

            // مبالغ
            var amt = Number(c.loanAmount) || 0;
            if (minAmt > 0 && amt < minAmt) return false;
            if (maxAmt > 0 && amt > maxAmt) return false;

            // اولویت (اگر در case ذخیره شده)
            if (f.priority && c.priority !== f.priority) return false;

            // فیلتر سریع
            var created = c.createdAt || c.updatedAt || 0;
            if (f.quick === 'urgent') {
                if (created > threeDaysAgo) return false;
            } else if (f.quick === 'today') {
                if (created < todayStart) return false;
            } else if (f.quick === 'bigAmount') {
                if (amt < 500000000) return false;   // ۵۰ میلیون تومان
            } else if (f.quick === 'highPriority') {
                if (c.priority !== 'high' && c.priority !== 'urgent') return false;
            }

            return true;
        });

        // مرتب‌سازی
        _applySort();

        _emit(VActionEvents.FILTERED, {
            count: STATE.filtered.length, filters: STATE.filters, sort: STATE.sort
        });
        return STATE.filtered;
    }

    function _applySort() {
        var s = STATE.sort;
        STATE.filtered.sort(function (a, b) {
            if (s === 'oldest') {
                return (a.createdAt || 0) - (b.createdAt || 0);
            }
            if (s === 'newest') {
                return (b.createdAt || 0) - (a.createdAt || 0);
            }
            if (s === 'amount') {
                return (Number(b.loanAmount) || 0) - (Number(a.loanAmount) || 0);
            }
            if (s === 'priority') {
                var order = { urgent: 4, high: 3, normal: 2, low: 1 };
                return (order[b.priority] || 0) - (order[a.priority] || 0);
            }
            return 0;
        });
    }

    // ─────────────────────────────────────
    // ☑️ انتخاب
    // ─────────────────────────────────────
    function _getSelectedIds() {
        var ids = [];
        for (var k in STATE.selectedIds) {
            if (Object.prototype.hasOwnProperty.call(STATE.selectedIds, k)) ids.push(k);
        }
        return ids;
    }

    function selectAll() {
        for (var i = 0; i < STATE.filtered.length; i++) {
            STATE.selectedIds[STATE.filtered[i].caseId] = true;
        }
        _emit(VActionEvents.SELECTION, { count: _getSelectedIds().length });
        return _getSelectedIds().length;
    }

    function clearSelection() {
        STATE.selectedIds = {};
        _emit(VActionEvents.SELECTION, { count: 0 });
        return true;
    }

    function toggleSelect(caseId, checked) {
        if (!caseId) return false;
        if (checked === undefined) {
            if (STATE.selectedIds[caseId]) delete STATE.selectedIds[caseId];
            else STATE.selectedIds[caseId] = true;
        } else {
            if (checked) STATE.selectedIds[caseId] = true;
            else delete STATE.selectedIds[caseId];
        }
        _emit(VActionEvents.SELECTION, { count: _getSelectedIds().length });
        return true;
    }

    function getSelectionCount() {
        return _getSelectedIds().length;
    }

    // ─────────────────────────────────────
    // 🎯 عملیات گروهی
    // ─────────────────────────────────────
    function bulkApprove(options) {
        options = options || {};
        var ids = options.ids || _getSelectedIds();
        if (ids.length === 0) return { ok: false, reason: 'no_selection' };

        if (typeof CaseStateMachine === 'undefined') {
            return { ok: false, reason: 'no_state_machine' };
        }

        var me = _uid();
        var success = 0;
        var failed = [];

        for (var i = 0; i < ids.length; i++) {
            var caseId = ids[i];
            var c = _findCase(caseId);
            if (!c) { failed.push({ caseId: caseId, reason: 'not_found' }); continue; }

            try {
                var r = CaseStateMachine.completeStep(
                    caseId,
                    c.currentStep || 'step_4',
                    {
                        userId: me,
                        role: 'verifier',
                        note: options.note || 'تأیید گروهی توسط اعتبارسنج',
                        syncApproval: true
                    }
                );
                if (r && r.ok) success++;
                else failed.push({ caseId: caseId, reason: (r && r.reason) || 'failed' });
            } catch (e) {
                failed.push({ caseId: caseId, reason: 'exception' });
            }
        }

        _emit(VActionEvents.BULK_APPROVE, {
            total: ids.length, success: success, failed: failed.length, at: Date.now()
        });

        if (success > 0) {
            _toast('success', _fa(success) + ' پرونده تأیید شد', 'موفق');
        }
        if (failed.length > 0) {
            _toast('warning', _fa(failed.length) + ' پرونده ناموفق', 'توجه');
        }

        clearSelection();
        reload();
        return { ok: true, success: success, failed: failed };
    }

    function bulkReject(options) {
        options = options || {};
        var ids = options.ids || _getSelectedIds();
        if (ids.length === 0) return { ok: false, reason: 'no_selection' };
        if (!options.note || String(options.note).trim().length < 10) {
            return { ok: false, reason: 'note_required' };
        }

        if (typeof CaseStateMachine === 'undefined') {
            return { ok: false, reason: 'no_state_machine' };
        }

        var me = _uid();
        var success = 0;
        var failed = [];

        for (var i = 0; i < ids.length; i++) {
            var caseId = ids[i];
            var c = _findCase(caseId);
            if (!c) { failed.push({ caseId: caseId, reason: 'not_found' }); continue; }

            try {
                var r = CaseStateMachine.rejectStep(
                    caseId,
                    c.currentStep || 'step_4',
                    {
                        userId: me,
                        role: 'verifier',
                        note: options.note,
                        syncApproval: true
                    }
                );
                if (r && r.ok) success++;
                else failed.push({ caseId: caseId, reason: (r && r.reason) || 'failed' });
            } catch (e) {
                failed.push({ caseId: caseId, reason: 'exception' });
            }
        }

        _emit(VActionEvents.BULK_REJECT, {
            total: ids.length, success: success, failed: failed.length, at: Date.now()
        });

        if (success > 0) {
            _toast('warning', _fa(success) + ' پرونده رد شد', 'توجه');
        }
        if (failed.length > 0) {
            _toast('warning', _fa(failed.length) + ' پرونده ناموفق', 'توجه');
        }

        clearSelection();
        reload();
        return { ok: true, success: success, failed: failed };
    }

    function bulkSetPriority(priority) {
        var ids = _getSelectedIds();
        if (ids.length === 0) return { ok: false, reason: 'no_selection' };
        if (!PRIORITY_LABELS[priority]) return { ok: false, reason: 'invalid_priority' };

        var success = 0;
        for (var i = 0; i < ids.length; i++) {
            if (_setCasePriority(ids[i], priority)) success++;
        }

        _emit(VActionEvents.BULK_PRIORITY, {
            total: ids.length, success: success, priority: priority, at: Date.now()
        });

        if (success > 0) {
            _toast('success', _fa(success) + ' پرونده اولویت‌گذاری شد', 'موفق');
        }
        clearSelection();
        reload();
        return { ok: true, success: success };
    }

    function bulkAssign(assigneeId) {
        var ids = _getSelectedIds();
        if (ids.length === 0) return { ok: false, reason: 'no_selection' };
        if (!assigneeId) return { ok: false, reason: 'no_assignee' };

        var success = 0;
        for (var i = 0; i < ids.length; i++) {
            if (_assignCase(ids[i], assigneeId)) success++;
        }

        _emit(VActionEvents.BULK_ASSIGN, {
            total: ids.length, success: success, assigneeId: assigneeId, at: Date.now()
        });

        if (success > 0) {
            _toast('success', _fa(success) + ' پرونده ارجاع شد', 'موفق');
        }
        clearSelection();
        reload();
        return { ok: true, success: success };
    }

    // ─────────────────────────────────────
    // 🎯 عملیات روی یک پرونده
    // ─────────────────────────────────────
    function _findCase(caseId) {
        for (var i = 0; i < STATE.cases.length; i++) {
            if (STATE.cases[i] && STATE.cases[i].caseId === caseId) {
                return STATE.cases[i];
            }
        }
        return null;
    }

    function _setCasePriority(caseId, priority) {
        if (typeof CaseRepository === 'undefined') return false;
        try {
            var updated = CaseRepository.update(caseId, {
                priority: priority,
                prioritySetAt: Date.now(),
                prioritySetBy: _uid()
            }, { userId: _uid() });
            return !!updated;
        } catch (e) {
            return false;
        }
    }

    function _assignCase(caseId, assigneeId) {
        if (typeof CaseRepository === 'undefined') return false;
        try {
            var updated = CaseRepository.update(caseId, {
                assignedVerifier: assigneeId,
                assignedAt: Date.now(),
                assignedBy: _uid()
            }, { userId: _uid() });
            return !!updated;
        } catch (e) {
            return false;
        }
    }

    // ─────────────────────────────────────
    // 📊 آمار گروهی
    // ─────────────────────────────────────
    function computeBulkStats() {
        var stats = {
            count: STATE.filtered.length,
            totalAmount: 0,
            averageAmount: 0,
            oldestAge: 0,
            urgent: 0
        };

        var now = Date.now();
        var oldest = now;

        for (var i = 0; i < STATE.filtered.length; i++) {
            var c = STATE.filtered[i];
            if (!c) continue;
            var amt = Number(c.loanAmount) || 0;
            stats.totalAmount += amt;

            var age = now - (c.createdAt || now);
            var ageDays = Math.floor(age / (24 * 60 * 60 * 1000));
            if (ageDays > 3) stats.urgent++;
            if ((c.createdAt || now) < oldest) oldest = c.createdAt || now;
        }

        stats.averageAmount = stats.count > 0
            ? Math.round(stats.totalAmount / stats.count) : 0;
        stats.oldestAge = oldest === now
            ? 0 : Math.floor((now - oldest) / (24 * 60 * 60 * 1000));

        return stats;
    }

    // ─────────────────────────────────────
    // 📤 خروجی CSV
    // ─────────────────────────────────────
    function exportFiltered() {
        if (STATE.filtered.length === 0) {
            _toast('warning', 'داده‌ای برای خروجی نیست', 'توجه');
            return { ok: false, reason: 'empty' };
        }

        var headers = ['شناسه', 'متقاضی', 'موبایل', 'بانک', 'مبلغ',
                       'مرحله', 'وضعیت', 'اولویت', 'تاریخ ثبت'];
        var rows = [headers];

        for (var i = 0; i < STATE.filtered.length; i++) {
            var c = STATE.filtered[i];
            rows.push([
                c.caseId || '',
                c.applicantName || '',
                c.applicantMobile || '',
                c.bank || '',
                String(c.loanAmount || 0),
                c.currentStep || '',
                c.status || '',
                c.priority ? PRIORITY_LABELS[c.priority] : '—',
                c.createdAt ? new Date(c.createdAt).toLocaleDateString('fa-IR') : ''
            ]);
        }

        var csv = rows.map(function (row) {
            return row.map(function (cell) {
                var s = String(cell === null || cell === undefined ? '' : cell);
                if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 ||
                    s.indexOf('\n') !== -1) {
                    s = '"' + s.replace(/"/g, '""') + '"';
                }
                return s;
            }).join(',');
        }).join('\n');

        var blob;
        try {
            blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        } catch (e) {
            window.open('data:text/csv;charset=utf-8,' + encodeURIComponent(csv), '_blank');
            _emit(VActionEvents.EXPORTED, { count: STATE.filtered.length, at: Date.now() });
            return { ok: true, count: STATE.filtered.length };
        }

        var ts = new Date().toISOString().slice(0, 10);
        var filename = 'verifier-queue-' + ts + '.csv';

        if (navigator.msSaveBlob) {
            navigator.msSaveBlob(blob, filename);
        } else {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
                document.body.removeChild(a);
                URL.revokeObjectURL(a.href);
            }, 200);
        }

        _emit(VActionEvents.EXPORTED, { count: STATE.filtered.length, at: Date.now() });
        _toast('success', _fa(STATE.filtered.length) + ' مورد خروجی گرفته شد', 'موفق');
        return { ok: true, count: STATE.filtered.length };
    }

    // ─────────────────────────────────────
    // 🔧 فیلترها
    // ─────────────────────────────────────
    function setFilter(key, value) {
        if (!key) return false;
        STATE.filters[key] = value;
        _applyFilters();
        return true;
    }

    function setFilters(patch) {
        if (!patch) return false;
        for (var k in patch) {
            if (Object.prototype.hasOwnProperty.call(patch, k)) {
                STATE.filters[k] = patch[k];
            }
        }
        _applyFilters();
        return true;
    }

    function resetFilters() {
        STATE.filters = {
            query: '',
            bank: '',
            minAmount: '',
            maxAmount: '',
            quick: 'all',
            priority: ''
        };
        _applyFilters();
        return true;
    }

    function setSort(sortKey) {
        if (!SORT_OPTIONS[sortKey]) return false;
        STATE.sort = sortKey;
        _applySort();
        return true;
    }

    // ─────────────────────────────────────
    // 🔄 reload
    // ─────────────────────────────────────
    function reload() {
        STATE.cases = _loadAllCases();
        _applyFilters();
        // پاکسازی انتخاب‌های نامعتبر
        var validIds = {};
        for (var i = 0; i < STATE.cases.length; i++) {
            if (STATE.selectedIds[STATE.cases[i].caseId]) {
                validIds[STATE.cases[i].caseId] = true;
            }
        }
        STATE.selectedIds = validIds;

        _emit(VActionEvents.LOADED, {
            count: STATE.cases.length,
            filtered: STATE.filtered.length,
            at: Date.now()
        });
        return STATE.filtered.length;
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (STATE.installed && !options.force) return;

        STATE.cases = _loadAllCases();
        _applyFilters();
        STATE.installed = true;

        if (options.debug) {
            console.log('[verifier-actions] v' + VERSION + ' آماده — ' +
                STATE.cases.length + ' پرونده، ' +
                STATE.filtered.length + ' نتیجه فیلتر');
        }
    }

    function uninstall() {
        STATE.cases = [];
        STATE.filtered = [];
        STATE.selectedIds = {};
        STATE.installed = false;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            version: VERSION,
            installed: STATE.installed,
            totalCases: STATE.cases.length,
            filteredCount: STATE.filtered.length,
            selectionCount: _getSelectedIds().length,
            filters: JSON.parse(JSON.stringify(STATE.filters)),
            sort: STATE.sort
        };
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
    var WamVerifierActions = {
        VERSION: VERSION,
        EVENTS: VActionEvents,
        SORT_OPTIONS: SORT_OPTIONS,
        PRIORITY_LABELS: PRIORITY_LABELS,
        QUICK_FILTERS: QUICK_FILTERS,

        install: install,
        uninstall: uninstall,
        reload: reload,

        // فیلتر و مرتب‌سازی
        setFilter: setFilter,
        setFilters: setFilters,
        resetFilters: resetFilters,
        setSort: setSort,
        getFiltered: function () { return STATE.filtered.slice(); },

        // انتخاب
        selectAll: selectAll,
        clearSelection: clearSelection,
        toggleSelect: toggleSelect,
        getSelectedIds: _getSelectedIds,
        getSelectionCount: getSelectionCount,

        // عملیات گروهی
        bulkApprove: bulkApprove,
        bulkReject: bulkReject,
        bulkSetPriority: bulkSetPriority,
        bulkAssign: bulkAssign,

        // عملیات تکی
        setPriority: function (caseId, priority) {
            return _setCasePriority(caseId, priority);
        },
        assign: function (caseId, assigneeId) {
            return _assignCase(caseId, assigneeId);
        },

        // آمار و خروجی
        computeBulkStats: computeBulkStats,
        exportFiltered: exportFiltered,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamVerifierActions = WamVerifierActions;
    window.VerifierActionEvents = VActionEvents;

    // ثبت خودکار
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { install(); });
        } else {
            install();
        }
    }

})();




/* ==========================================
 * FROM: js/verifier-sync.js
 * ========================================== */


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




/* ==========================================
 * FROM: js/verifier-views-all.js
 * ========================================== */


// ==========================================
// وام پی — Verifier Panel
// فایل: verifier-views-all.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: نمای جدول کامل پرونده‌ها + فیلترها + عملیات گروهی
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var ROOT_ATTR = 'data-verifier-views-all';
    var PAGE_SIZE = 15;

    var COLUMNS = [
        { key: 'caseId',        label: 'شناسه',      sortable: true,  width: '110px' },
        { key: 'applicantName', label: 'متقاضی',     sortable: true },
        { key: 'bank',          label: 'بانک',       sortable: true,  width: '90px' },
        { key: 'loanAmount',    label: 'مبلغ',       sortable: true,  width: '120px' },
        { key: 'purpose',       label: 'هدف',        sortable: false },
        { key: 'priority',      label: 'اولویت',     sortable: true,  width: '80px' },
        { key: 'step',          label: 'مرحله',      sortable: false, width: '120px' },
        { key: 'age',           label: 'مدت انتظار', sortable: true,  width: '100px' }
    ];

    var PRIORITY_LABELS = {
        low: 'کم', normal: 'معمولی', high: 'بالا', urgent: 'فوری'
    };

    var STEP_TITLES = {
        step_1: 'ثبت درخواست', step_2: 'بارگذاری مدارک',
        step_3: 'بررسی اولیه', step_4: 'اعتبارسنجی',
        step_5: 'تأیید ادمین', step_6: 'ارسال به بانک',
        step_7: 'تأیید بانک', step_8: 'تنظیم قرارداد',
        step_9: 'پرداخت'
    };

    var BANKS = [
        'ملی', 'صادرات', 'تجارت', 'سپه', 'کشاورزی', 'مسکن',
        'رسالت', 'پاسارگاد', 'پارسیان', 'سامان', 'ملت', 'رفاه',
        'مهر ایران', 'قوامین', 'شهر', 'آینده', 'سینا', 'دی'
    ];

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        cases: [],
        page: 1,
        sortColumn: 'age',
        sortDirection: 'desc',
        selectedIds: {},
        viewMode: 'table',      // table | cards
        listeners: [],
        _boundIds: {}
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var VAllEvents = {
        LOADED:     'vall.loaded',
        RENDERED:   'vall.rendered',
        ROW_CLICK:  'vall.row_click',
        SORT:       'vall.sort',
        PAGE:       'vall.page',
        SELECT:     'vall.select',
        VIEW_MODE:  'vall.view_mode',
        ACTION:     'vall.action'
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
    function _esc(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _fa(n) {
        var s = String(n === null || n === undefined ? 0 : n);
        return s.replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _amt(n) {
        if (n === null || n === undefined || n === '') return '—';
        var x = Number(n);
        if (isNaN(x)) return '—';
        return x.toLocaleString('en-US').replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _en(s) {
        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.toEnglishDigits) {
            return WamPersianDate.toEnglishDigits(s);
        }
        return String(s || '').replace(/[0-۹]/g, function (d) {
            return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
        });
    }

    function _relTime(ts) {
        if (!ts) return '—';
        var d = Date.now() - ts;
        var s = Math.floor(d / 1000);
        if (s < 60) return 'همین الان';
        var m = Math.floor(s / 60);
        if (m < 60) return _fa(m) + ' دقیقه';
        var h = Math.floor(m / 60);
        if (h < 24) return _fa(h) + ' ساعت';
        var day = Math.floor(h / 24);
        if (day < 30) return _fa(day) + ' روز';
        var mon = Math.floor(day / 30);
        if (mon < 12) return _fa(mon) + ' ماه';
        return _fa(Math.floor(mon / 12)) + ' سال';
    }

    function _ageDays(c) {
        if (!c) return 0;
        var created = c.createdAt || c.updatedAt || Date.now();
        return Math.floor((Date.now() - created) / (24 * 60 * 60 * 1000));
    }

    function _stepTitle(stepId) {
        return STEP_TITLES[stepId] || stepId || '—';
    }

    function _priorityLabel(p) {
        return PRIORITY_LABELS[p] || '—';
    }

    function _toast(type, msg, title) {
        if (typeof WamUI === 'undefined') return;
        if (type === 'success' && WamUI.toastSuccess) WamUI.toastSuccess(msg, title || 'موفق');
        else if (type === 'error' && WamUI.toastError) WamUI.toastError(msg, title || 'خطا');
        else if (type === 'warning' && WamUI.toastWarning) WamUI.toastWarning(msg, title || 'توجه');
        else if (type === 'info' && WamUI.toastInfo) WamUI.toastInfo(msg, title || 'اطلاع');
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری
    // ─────────────────────────────────────
    function _loadCases() {
        if (typeof CaseRepository === 'undefined') return [];
        try {
            var all = CaseRepository.getAll() || [];
            var list = [];
            for (var i = 0; i < all.length; i++) {
                var c = all[i];
                if (!c) continue;
                var st = c.status || 'draft';
                if (st === 'cancelled' || st === 'archived') continue;
                list.push(c);
            }
            return list;
        } catch (e) {
            return [];
        }
    }

    function _getFiltered() {
        // اگر ماژول Actions لود شده، از آن استفاده کن
        if (typeof WamVerifierActions !== 'undefined' &&
            WamVerifierActions.getFiltered) {
            try {
                var f = WamVerifierActions.getFiltered();
                if (Array.isArray(f) && f.length > 0) {
                    // Aها ممکن است خالی باشد اگر فیلتر نتیجه نداده باشد
                    if (f.length > 0) return f.slice();
                }
            } catch (e) { /* بی‌صدا */ }
        }
        return STATE.cases.slice();
    }

    // ─────────────────────────────────────
    // 🔀 مرتب‌سازی
    // ─────────────────────────────────────
    function _applySort(list) {
        var col = STATE.sortColumn;
        var dir = STATE.sortDirection === 'asc' ? 1 : -1;

        list.sort(function (a, b) {
            var va = _getSortValue(a, col);
            var vb = _getSortValue(b, col);

            if (typeof va === 'number' && typeof vb === 'number') {
                return (va - vb) * dir;
            }
            va = String(va || '').toLowerCase();
            vb = String(vb || '').toLowerCase();
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return 0;
        });
        return list;
    }

    function _getSortValue(c, col) {
        if (!c) return '';
        if (col === 'caseId')        return c.caseId || '';
        if (col === 'applicantName') return c.applicantName || '';
        if (col === 'bank')          return c.bank || '';
        if (col === 'loanAmount')    return Number(c.loanAmount) || 0;
        if (col === 'priority') {
            var order = { low: 1, normal: 2, high: 3, urgent: 4 };
            return order[c.priority] || 0;
        }
        if (col === 'age') {
            // برای age: کمتر = جدیدتر. برای sort desc = قدیمی‌تر بالاتر
            return _ageDays(c);
        }
        return '';
    }

    // ─────────────────────────────────────
    // ☑️ انتخاب
    // ─────────────────────────────────────
    function _getSelectedIds() {
        var ids = [];
        for (var k in STATE.selectedIds) {
            if (Object.prototype.hasOwnProperty.call(STATE.selectedIds, k)) {
                ids.push(k);
            }
        }
        return ids;
    }

    function _syncWithActions() {
        // انتخاب‌ها را با WamVerifierActions همگام کن
        if (typeof WamVerifierActions === 'undefined') return;
        if (!WamVerifierActions.clearSelection) return;

        // از API خودش استفاده کن برای همگام‌سازی
        var ids = _getSelectedIds();
        // به Actions انتقال بده
        if (WamVerifierActions.toggleSelect) {
            // پاک کن اول
            WamVerifierActions.clearSelection();
            for (var i = 0; i < ids.length; i++) {
                WamVerifierActions.toggleSelect(ids[i], true);
            }
        }
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نوار ابزار
    // ─────────────────────────────────────
    function _renderToolbar() {
        var selected = _getSelectedIds().length;

        var html = '<div class="wam-vall-toolbar">';

        // سمت راست — انتخاب‌ها
        html += '<div class="wam-vall-toolbar__left">';
        html += '<div class="wam-vall-toolbar__count">' +
                _fa(STATE.cases.length) + ' پرونده' +
                (selected > 0 ? ' — ' + _fa(selected) + ' انتخاب شده' : '') +
                '</div>';
        html += '</div>';

        // سمت چپ — اقدامات
        html += '<div class="wam-vall-toolbar__right">';

        if (selected > 0) {
            html += '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
                    'data-vall-action="bulk-approve">✅ تأیید گروهی</button>';
            html += '<button class="wam-btn wam-btn--sm wam-btn--danger" ' +
                    'data-vall-action="bulk-reject">❌ رد گروهی</button>';
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-vall-action="clear-selection">لغو</button>';
        } else {
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-vall-action="export">📤 CSV</button>';
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-vall-action="refresh">🔄</button>';
            html += '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-vall-action="toggle-view" title="حالت نمایش">' +
                    (STATE.viewMode === 'table' ? '🃏' : '📋') +
                    '</button>';
        }

        html += '</div>';
        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — هدر جدول
    // ─────────────────────────────────────
    function _renderTableHead() {
        var html = '<thead><tr>';

        html += '<th class="wam-vall__check">' +
                '<input type="checkbox" data-vall="select-all"' +
                (_getSelectedIds().length > 0 ? ' checked' : '') + '></th>';

        for (var i = 0; i < COLUMNS.length; i++) {
            var col = COLUMNS[i];
            var sortIcon = '';
            var isCurrent = STATE.sortColumn === col.key;
            if (isCurrent) {
                sortIcon = STATE.sortDirection === 'asc' ? ' ▲' : ' ▼';
            }
            var attrs = col.sortable ? ' data-vall-sort="' + col.key + '"' : '';
            var cls = 'wam-vall__th' + (col.sortable ? ' is-sortable' : '') +
                      (isCurrent ? ' is-active' : '');
            html += '<th class="' + cls + '"' + attrs +
                    (col.width ? ' style="width:' + col.width + '"' : '') + '>' +
                    _esc(col.label) + sortIcon + '</th>';
        }

        html += '<th class="wam-vall__actions">عملیات</th>';
        html += '</tr></thead>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ردیف جدول
    // ─────────────────────────────────────
    function _renderTableRow(c) {
        if (!c) return '';
        var priority = c.priority || 'normal';
        var age = _ageDays(c);
        var isUrgent = age > 3;
        var selected = !!STATE.selectedIds[c.caseId];

        var html = '<tr data-vall-case="' + _esc(c.caseId) + '"' +
                   (selected ? ' class="is-selected"' : '') +
                   (isUrgent ? ' data-urgent="1"' : '') + '>';

        html += '<td><input type="checkbox" data-vall="select-row"' +
                (selected ? ' checked' : '') + '></td>';

        html += '<td class="wam-vall__id"><code>' +
                _esc(c.caseId) + '</code>' +
                (isUrgent ? ' <span class="wam-vall__urgent">⏰</span>' : '') +
                '</td>';

        html += '<td class="wam-vall__name">' +
                _esc(c.applicantName || '—') + '</td>';

        html += '<td>' + _esc(c.bank || '—') + '</td>';

        html += '<td class="wam-vall__amount">' +
                _amt(c.loanAmount) + '</td>';

        html += '<td class="wam-vall__purpose">' +
                _esc(c.purpose || '—') + '</td>';

        html += '<td><span class="wam-vall__priority wam-vall__priority--' +
                _esc(priority) + '">' +
                _esc(_priorityLabel(priority)) + '</span></td>';

        html += '<td class="wam-vall__step">' +
                _esc(_stepTitle(c.currentStep)) + '</td>';

        html += '<td class="wam-vall__age' + (isUrgent ? ' is-urgent' : '') + '">' +
                _fa(age) + ' روز</td>';

        html += '<td class="wam-vall__actions">';
        html += '<button class="wam-btn-icon" data-vall-row-action="view" ' +
                'title="مشاهده">👁️</button>';
        html += '<button class="wam-btn-icon" data-vall-row-action="review" ' +
                'title="بررسی">🔍</button>';
        html += '</td>';

        html += '</tr>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت (view=cards)
    // ─────────────────────────────────────
    function _renderCard(c) {
        if (!c) return '';
        var priority = c.priority || 'normal';
        var age = _ageDays(c);
        var isUrgent = age > 3;
        var selected = !!STATE.selectedIds[c.caseId];

        return '<div class="wam-vall-card' +
               (selected ? ' is-selected' : '') +
               (isUrgent ? ' is-urgent' : '') + '" ' +
               'data-vall-case="' + _esc(c.caseId) + '">' +
               '<div class="wam-vall-card__head">' +
               '<input type="checkbox" data-vall="select-row"' +
               (selected ? ' checked' : '') + '>' +
               '<code>' + _esc(c.caseId) + '</code>' +
               '<span class="wam-vall__priority wam-vall__priority--' +
               _esc(priority) + '">' + _esc(_priorityLabel(priority)) + '</span>' +
               '</div>' +
               '<div class="wam-vall-card__name">' +
               _esc(c.applicantName || '—') + '</div>' +
               '<div class="wam-vall-card__rows">' +
               '<div><span>بانک:</span> ' + _esc(c.bank || '—') + '</div>' +
               '<div><span>مبلغ:</span> ' + _amt(c.loanAmount) + ' ریال</div>' +
               '<div><span>مرحله:</span> ' + _esc(_stepTitle(c.currentStep)) + '</div>' +
               '<div><span>انتظار:</span> ' + _fa(age) + ' روز</div>' +
               '</div>' +
               '<div class="wam-vall-card__foot">' +
               '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
               'data-vall-row-action="review">🔍 بررسی</button>' +
               '</div>' +
               '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — صفحه‌بندی
    // ─────────────────────────────────────
    function _renderPagination(total) {
        var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (pages <= 1) return '';

        var current = STATE.page;
        var html = '<div class="wam-vall__pagination">';

        html += '<button data-vall-page="' + (current - 1) + '"' +
                (current === 1 ? ' disabled' : '') + '>‹ قبلی</button>';

        var start = Math.max(1, current - 2);
        var end = Math.min(pages, current + 2);
        if (start > 1) {
            html += '<button data-vall-page="1">' + _fa(1) + '</button>';
            if (start > 2) html += '<span>…</span>';
        }

        for (var i = start; i <= end; i++) {
            html += '<button data-vall-page="' + i + '"' +
                    (i === current ? ' class="is-active"' : '') + '>' +
                    _fa(i) + '</button>';
        }

        if (end < pages) {
            if (end < pages - 1) html += '<span>…</span>';
            html += '<button data-vall-page="' + pages + '">' +
                    _fa(pages) + '</button>';
        }

        html += '<button data-vall-page="' + (current + 1) + '"' +
                (current === pages ? ' disabled' : '') + '>بعدی ›</button>';
        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;

        var list = _getFiltered();
        _applySort(list);

        var total = list.length;
        var start = (STATE.page - 1) * PAGE_SIZE;
        var end = Math.min(start + PAGE_SIZE, total);
        var pageItems = list.slice(start, end);

        var body = '';

        if (total === 0) {
            body = '<div class="wam-empty">' +
                   '<div class="wam-empty__icon">📭</div>' +
                   '<p>پرونده‌ای برای نمایش نیست.</p>' +
                   '</div>';
        } else if (STATE.viewMode === 'table') {
            body = '<div class="wam-vall__table-wrap">' +
                   '<table class="wam-vall__table">' +
                   _renderTableHead() + '<tbody>';
            for (var i = 0; i < pageItems.length; i++) {
                body += _renderTableRow(pageItems[i]);
            }
            body += '</tbody></table></div>';
        } else {
            body = '<div class="wam-vall__cards">';
            for (var j = 0; j < pageItems.length; j++) {
                body += _renderCard(pageItems[j]);
            }
            body += '</div>';
        }

        var html =
            '<div class="wam-vall">' +
                _renderToolbar() +
                body +
                _renderPagination(total) +
            '</div>';

        STATE.root.innerHTML = html;

        _bindEvents();

        _emit(VAllEvents.RENDERED, {
            total: total,
            page: STATE.page,
            viewMode: STATE.viewMode,
            at: Date.now()
        });
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents() {
        if (!STATE.root) return;

        // دکمه‌های نوار ابزار
        var toolbarBtns = STATE.root.querySelectorAll('[data-vall-action]');
        for (var i = 0; i < toolbarBtns.length; i++) {
            if (toolbarBtns[i].dataset.vallBound) continue;
            toolbarBtns[i].addEventListener('click', _handleToolbarAction);
            toolbarBtns[i].dataset.vallBound = '1';
        }

        // هدر مرتب‌سازی
        var sortTh = STATE.root.querySelectorAll('[data-vall-sort]');
        for (var j = 0; j < sortTh.length; j++) {
            if (sortTh[j].dataset.vallBound) continue;
            sortTh[j].addEventListener('click', _handleSortClick);
            sortTh[j].dataset.vallBound = '1';
        }

        // انتخاب همه
        var selectAll = STATE.root.querySelector('[data-vall="select-all"]');
        if (selectAll && !selectAll.dataset.vallBound) {
            selectAll.addEventListener('change', _handleSelectAll);
            selectAll.dataset.vallBound = '1';
        }

        // چک‌باکس ردیف
        var rowChecks = STATE.root.querySelectorAll('[data-vall="select-row"]');
        for (var k = 0; k < rowChecks.length; k++) {
            if (rowChecks[k].dataset.vallBound) continue;
            rowChecks[k].addEventListener('change', _handleRowSelect);
            rowChecks[k].dataset.vallBound = '1';
        }

        // اکشن‌های ردیف
        var rowActions = STATE.root.querySelectorAll('[data-vall-row-action]');
        for (var m = 0; m < rowActions.length; m++) {
            if (rowActions[m].dataset.vallBound) continue;
            rowActions[m].addEventListener('click', _handleRowAction);
            rowActions[m].dataset.vallBound = '1';
        }

        // صفحه‌بندی
        var pageBtns = STATE.root.querySelectorAll('[data-vall-page]');
        for (var n = 0; n < pageBtns.length; n++) {
            if (pageBtns[n].dataset.vallBound) continue;
            pageBtns[n].addEventListener('click', _handlePageClick);
            pageBtns[n].dataset.vallBound = '1';
        }

        // کلیک روی ردیف
        var rows = STATE.root.querySelectorAll('tr[data-vall-case]');
        for (var r = 0; r < rows.length; r++) {
            if (rows[r].dataset.vallBound) continue;
            rows[r].addEventListener('click', _handleRowClick);
            rows[r].dataset.vallBound = '1';
        }
    }

    function _handleToolbarAction(e) {
        e.preventDefault();
        var action = this.getAttribute('data-vall-action');

        if (action === 'refresh') {
            reload();
            _toast('success', 'بروزرسانی شد', 'موفق');
            return;
        }
        if (action === 'export') {
            if (typeof WamVerifierActions !== 'undefined' &&
                WamVerifierActions.exportFiltered) {
                WamVerifierActions.exportFiltered();
            }
            return;
        }
        if (action === 'toggle-view') {
            STATE.viewMode = STATE.viewMode === 'table' ? 'cards' : 'table';
            render();
            _emit(VAllEvents.VIEW_MODE, { mode: STATE.viewMode });
            return;
        }
        if (action === 'clear-selection') {
            STATE.selectedIds = {};
            render();
            return;
        }
        if (action === 'bulk-approve') {
            _confirmBulkApprove();
            return;
        }
        if (action === 'bulk-reject') {
            _confirmBulkReject();
            return;
        }
    }

    function _handleSortClick(e) {
        e.preventDefault();
        var col = this.getAttribute('data-vall-sort');
        if (!col) return;
        if (STATE.sortColumn === col) {
            STATE.sortDirection = STATE.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            STATE.sortColumn = col;
            STATE.sortDirection = 'asc';
        }
        STATE.page = 1;
        render();
        _emit(VAllEvents.SORT, { column: col, direction: STATE.sortDirection });
    }

    function _handleSelectAll() {
        var checked = this.checked;
        // فقط موارد صفحه جاری
        var list = _getFiltered();
        _applySort(list);
        var start = (STATE.page - 1) * PAGE_SIZE;
        var end = Math.min(start + PAGE_SIZE, list.length);
        for (var i = start; i < end; i++) {
            if (checked) STATE.selectedIds[list[i].caseId] = true;
            else delete STATE.selectedIds[list[i].caseId];
        }
        render();
        _emit(VAllEvents.SELECT, { count: _getSelectedIds().length });
    }

    function _handleRowSelect(e) {
        e.stopPropagation();
        var tr = this.closest('[data-vall-case]');
        if (!tr) return;
        var caseId = tr.getAttribute('data-vall-case');
        if (!caseId) return;
        if (this.checked) STATE.selectedIds[caseId] = true;
        else delete STATE.selectedIds[caseId];
        render();
        _emit(VAllEvents.SELECT, { count: _getSelectedIds().length });
    }

    function _handleRowClick(e) {
        // اگر روی checkbox یا دکمه نیست
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' ||
            e.target.closest('button')) return;

        var caseId = this.getAttribute('data-vall-case');
        if (caseId) _openReview(caseId);
    }

    function _handleRowAction(e) {
        e.preventDefault();
        e.stopPropagation();
        var action = this.getAttribute('data-vall-row-action');
        var tr = this.closest('[data-vall-case]');
        if (!tr) return;
        var caseId = tr.getAttribute('data-vall-case');
        if (!caseId) return;

        if (action === 'view') {
            _openDetails(caseId);
        } else if (action === 'review') {
            _openReview(caseId);
        }
    }

    function _handlePageClick() {
        var p = parseInt(this.getAttribute('data-vall-page'), 10);
        if (isNaN(p) || p < 1) return;
        STATE.page = p;
        render();
        _emit(VAllEvents.PAGE, { page: p });
    }

    // ─────────────────────────────────────
    // 🎯 باز کردن پرونده
    // ─────────────────────────────────────
    function _openReview(caseId) {
        if (!caseId) return;
        _emit(VAllEvents.ROW_CLICK, { caseId: caseId, action: 'review' });
        window.location.href = 'verifier-wizard.html?id=' +
            encodeURIComponent(caseId);
    }

    function _openDetails(caseId) {
        if (!caseId) return;
        _emit(VAllEvents.ROW_CLICK, { caseId: caseId, action: 'view' });

        var c = null;
        for (var i = 0; i < STATE.cases.length; i++) {
            if (STATE.cases[i].caseId === caseId) { c = STATE.cases[i]; break; }
        }
        if (!c) return;

        var existing = document.getElementById('wamVallDetailModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var modal = document.createElement('div');
        modal.id = 'wamVallDetailModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel wam-modal__panel--wide">' +
                '<header class="wam-modal__head">' +
                    '<h3>' + _esc(c.caseId) + '</h3>' +
                    '<button type="button" class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<div class="wam-modal__body">' +
                    _detailRow('متقاضی', c.applicantName) +
                    _detailRow('موبایل', c.applicantMobile) +
                    _detailRow('کد ملی', c.applicantNationalCode) +
                    _detailRow('بانک', c.bank) +
                    _detailRow('مبلغ', _amt(c.loanAmount) + ' ریال') +
                    _detailRow('مدت', c.loanDuration ? _fa(c.loanDuration) + ' ماه' : '—') +
                    _detailRow('هدف', c.purpose) +
                    _detailRow('مرحله', _stepTitle(c.currentStep)) +
                    _detailRow('وضعیت', c.status) +
                    _detailRow('کارگزار', c.brokerName) +
                '</div>' +
                '<footer class="wam-modal__footer">' +
                    '<button type="button" class="wam-btn wam-btn--primary" ' +
                    'data-vall-action="review-from-modal" ' +
                    'data-case-id="' + _esc(c.caseId) + '">🔍 بررسی پرونده</button>' +
                '</footer>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var i = 0; i < cbs.length; i++) {
            cbs[i].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }

        var reviewBtn = modal.querySelector('[data-vall-action="review-from-modal"]');
        if (reviewBtn) {
            reviewBtn.addEventListener('click', function () {
                var id = this.getAttribute('data-case-id');
                if (modal.parentNode) modal.parentNode.removeChild(modal);
                _openReview(id);
            });
        }
    }

    function _detailRow(label, value) {
        return '<div class="wam-vall-detail-row">' +
               '<span class="wam-vall-detail-row__label">' +
               _esc(label) + ':</span>' +
               '<span class="wam-vall-detail-row__value">' +
               _esc(value || '—') + '</span></div>';
    }

    // ─────────────────────────────────────
    // 🎯 عملیات گروهی با تأیید
    // ─────────────────────────────────────
    function _confirmBulkApprove() {
        var ids = _getSelectedIds();
        if (ids.length === 0) return;
        var msg = _fa(ids.length) + ' پرونده به‌صورت گروهی تأیید شوند؟';

        var doIt = function () {
            if (typeof WamVerifierActions === 'undefined' ||
                !WamVerifierActions.bulkApprove) {
                _toast('error', 'ماژول اکشن‌ها یافت نشد', 'خطا');
                return;
            }
            _syncWithActions();
            var r = WamVerifierActions.bulkApprove({
                note: 'تأیید گروهی از جدول'
            });
            if (r && r.ok) {
                STATE.selectedIds = {};
                reload();
            }
        };

        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('تأیید گروهی', msg).then(function (ok) {
                if (ok) doIt();
            });
        } else if (window.confirm(msg)) {
            doIt();
        }
    }

    function _confirmBulkReject() {
        var ids = _getSelectedIds();
        if (ids.length === 0) return;

        var existing = document.getElementById('wamBulkRejectModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var modal = document.createElement('div');
        modal.id = 'wamBulkRejectModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>❌ رد گروهی</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form id="wamBulkRejectForm" class="wam-modal__body">' +
                    '<p>' + _fa(ids.length) + ' پرونده رد خواهند شد. ' +
                    'دلیل رد را وارد کنید:</p>' +
                    '<textarea name="note" rows="4" ' +
                    'placeholder="دلیل (حداقل ۱۰ کاراکتر)..." required></textarea>' +
                    '<div class="wam-field__error" data-error="note"></div>' +
                    '<footer class="wam-modal__footer">' +
                        '<button type="button" class="wam-btn wam-btn--ghost" ' +
                        'data-close>انصراف</button>' +
                        '<button type="submit" class="wam-btn wam-btn--danger">' +
                        'رد گروهی</button>' +
                    '</footer>' +
                '</form>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var i = 0; i < cbs.length; i++) {
            cbs[i].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }

        var form = modal.querySelector('#wamBulkRejectForm');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var note = form.querySelector('[name="note"]').value.trim();
                if (note.length < 10) {
                    var errEl = form.querySelector('[data-error="note"]');
                    if (errEl) {
                        errEl.textContent = 'دلیل باید حداقل ۱۰ کاراکتر باشد';
                        errEl.style.display = 'block';
                    }
                    return;
                }

                if (typeof WamVerifierActions === 'undefined' ||
                    !WamVerifierActions.bulkReject) {
                    _toast('error', 'ماژول اکشن‌ها یافت نشد', 'خطا');
                    return;
                }

                _syncWithActions();
                var r = WamVerifierActions.bulkReject({ note: note });
                if (modal.parentNode) modal.parentNode.removeChild(modal);

                if (r && r.ok) {
                    STATE.selectedIds = {};
                    reload();
                }
            });
        }
    }

    // ─────────────────────────────────────
    // 🔄 reload
    // ─────────────────────────────────────
    function reload() {
        STATE.cases = _loadCases();
        STATE.page = 1;

        // پاکسازی انتخاب‌های نامعتبر
        var validIds = {};
        for (var i = 0; i < STATE.cases.length; i++) {
            if (STATE.selectedIds[STATE.cases[i].caseId]) {
                validIds[STATE.cases[i].caseId] = true;
            }
        }
        STATE.selectedIds = validIds;

        render();
        _emit(VAllEvents.LOADED, {
            count: STATE.cases.length, at: Date.now()
        });
        return STATE.cases.length;
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var run = function () {
            var me = (typeof WamPermissions !== 'undefined')
                ? WamPermissions.getCurrentUser() : null;
            if (!me) {
                if (typeof WamPayGuard !== 'undefined') {
                    WamPayGuard.redirectToLogin('not_logged_in');
                }
                return;
            }
            if (me.role !== 'verifier' && me.role !== 'admin' &&
                me.role !== 'super_admin') {
                if (typeof WamPayGuard !== 'undefined') {
                    WamPayGuard.redirectToRoleHome(me.role);
                }
                return;
            }

            var root = options.root ||
                       document.querySelector('[' + ROOT_ATTR + ']') ||
                       document.querySelector('.wam-verifier-views-all');
            if (!root) {
                if (options.debug) console.warn('[verifier-views-all] root پیدا نشد');
                return;
            }
            STATE.root = root;

            STATE.cases = _loadCases();
            render();

            STATE.installed = true;
            _emit(VAllEvents.LOADED, {
                count: STATE.cases.length, at: Date.now()
            });

            if (options.debug) {
                console.log('[verifier-views-all] آماده — ' +
                    STATE.cases.length + ' پرونده');
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run);
        } else {
            run();
        }
    }

    function uninstall() {
        STATE.root = null;
        STATE.cases = [];
        STATE.selectedIds = {};
        STATE._boundIds = {};
        STATE.installed = false;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            total: STATE.cases.length,
            selected: _getSelectedIds().length,
            page: STATE.page,
            pageSize: PAGE_SIZE,
            sortColumn: STATE.sortColumn,
            sortDirection: STATE.sortDirection,
            viewMode: STATE.viewMode
        };
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
    var WamVerifierViewsAll = {
        EVENTS: VAllEvents,
        ROOT_ATTR: ROOT_ATTR,
        PAGE_SIZE: PAGE_SIZE,
        COLUMNS: COLUMNS,

        install: install,
        uninstall: uninstall,
        reload: reload,
        render: render,

        setViewMode: function (mode) {
            if (mode !== 'table' && mode !== 'cards') return false;
            STATE.viewMode = mode;
            render();
            return true;
        },
        getViewMode: function () { return STATE.viewMode; },

        setSort: function (col, dir) {
            if (!col) return false;
            STATE.sortColumn = col;
            if (dir === 'asc' || dir === 'desc') STATE.sortDirection = dir;
            render();
            return true;
        },
        getSort: function () {
            return { column: STATE.sortColumn, direction: STATE.sortDirection };
        },

        gotoPage: function (p) {
            p = parseInt(p, 10);
            if (isNaN(p) || p < 1) return false;
            STATE.page = p;
            render();
            return true;
        },

        selectAll: function () {
            var list = _getFiltered();
            _applySort(list);
            var start = (STATE.page - 1) * PAGE_SIZE;
            var end = Math.min(start + PAGE_SIZE, list.length);
            for (var i = start; i < end; i++) {
                STATE.selectedIds[list[i].caseId] = true;
            }
            render();
            return _getSelectedIds().length;
        },
        clearSelection: function () {
            STATE.selectedIds = {};
            render();
            return true;
        },
        getSelectedIds: _getSelectedIds,

        getCases: function () { return STATE.cases.slice(); },
        getFiltered: function () { return _getFiltered(); },

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamVerifierViewsAll = WamVerifierViewsAll;
    window.VerifierAllEvents = VAllEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-verifier-views-all-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-verifier-views-all')) {
                install();
            }
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _auto);
        } else {
            _auto();
        }
    }

})();




/* ==========================================
 * FROM: js/verifier-app.js
 * ========================================== */


// ==========================================
// وام پی — Verifier Panel
// فایل: verifier-app.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: پنل اصلی اعتبارسنج — SPA با نمای داینامیک
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var AUTOREFRESH_MS = 120000;

    var VIEWS = {
        DASHBOARD:    'dashboard',
        QUEUE:        'queue',        // صف بررسی
        MY_VERIFIED:  'verified',     // تأییدشده‌های من
        NOTIFS:       'notifications',
        PROFILE:      'profile',
        SYNC:         'sync'
    };

    var VIEW_TITLES = {
        dashboard:     'داشبورد',
        queue:         'صف بررسی',
        verified:      'بررسی‌شده‌ها',
        notifications: 'اعلان‌ها',
        profile:       'پروفایل',
        sync:          'همگام‌سازی'
    };

    var STATUS_LABELS = {
        draft:        'پیش‌نویس',
        in_progress:  'در جریان',
        pending:      'در انتظار',
        approved:     'تأییدشده',
        completed:    'تکمیل‌شده',
        rejected:     'رد شده',
        cancelled:    'لغو شده',
        archived:     'بایگانی'
    };

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        currentView: VIEWS.DASHBOARD,
        currentUser: null,
        cases: [],
        queue: [],
        verified: [],
        notifications: [],
        autoRefreshTimer: null,
        listeners: [],
        lastUpdate: null
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var VEvents = {
        READY:       'verifier.ready',
        VIEW_CHANGE: 'verifier.view.change',
        UPDATED:     'verifier.updated',
        REFRESH:     'verifier.refresh',
        ACTION:      'verifier.action'
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
    function _esc(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _fa(n) {
        var s = String(n === null || n === undefined ? 0 : n);
        return s.replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _amt(n) {
        if (n === null || n === undefined || n === '') return '—';
        var x = Number(n);
        if (isNaN(x)) return '—';
        return x.toLocaleString('en-US').replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _relTime(ts) {
        if (!ts) return '—';
        var d = Date.now() - ts;
        var s = Math.floor(d / 1000);
        if (s < 60) return 'همین الان';
        var m = Math.floor(s / 60);
        if (m < 60) return _fa(m) + ' دقیقه پیش';
        var h = Math.floor(m / 60);
        if (h < 24) return _fa(h) + ' ساعت پیش';
        var day = Math.floor(h / 24);
        if (day < 30) return _fa(day) + ' روز پیش';
        return _fa(Math.floor(day / 30)) + ' ماه پیش';
    }

    function _statusLabel(st) {
        return STATUS_LABELS[st] || st || '—';
    }

    // ─────────────────────────────────────
    // 👤 کاربر جاری
    // ─────────────────────────────────────
    function _getCurrentUser() {
        if (typeof WamPermissions === 'undefined') return null;
        return WamPermissions.getCurrentUser();
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری پرونده‌ها
    // ─────────────────────────────────────
    function _loadAllCases() {
        if (typeof CaseRepository === 'undefined') return [];
        try { return CaseRepository.getAll() || []; }
        catch (e) { return []; }
    }

    function _loadQueue() {
        // پرونده‌هایی که در مرحله بررسی اولیه یا اعتبارسنجی هستند
        var all = _loadAllCases();
        var q = [];
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (!c) continue;
            var step = c.currentStep || '';
            var st = c.status || 'draft';
            if ((step === 'step_3' || step === 'step_4') &&
                st !== 'completed' && st !== 'rejected' &&
                st !== 'cancelled' && st !== 'archived') {
                q.push(c);
            }
        }
        q.sort(function (a, b) {
            return (a.updatedAt || a.createdAt || 0) -
                   (b.updatedAt || b.createdAt || 0);  // قدیمی‌ترها بالاتر
        });
        return q;
    }

    function _loadMyVerified() {
        var all = _loadAllCases();
        var me = STATE.currentUser ? STATE.currentUser.id : null;
        if (!me) return [];
        var v = [];
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (!c) continue;
            var approvals = c.adminApprovals || {};
            // بررسی که آیا این verifier در هر کدام از تأییدهاست
            for (var k in approvals) {
                if (!Object.prototype.hasOwnProperty.call(approvals, k)) continue;
                var a = approvals[k];
                if (a && a.approvedBy === me) { v.push(c); break; }
            }
            // یا در تاریخچه steps
            if (c.steps) {
                for (var sid in c.steps) {
                    if (!Object.prototype.hasOwnProperty.call(c.steps, sid)) continue;
                    var s = c.steps[sid];
                    if (s && (s.completedBy === me || s.startedBy === me)) {
                        if (v.indexOf(c) === -1) v.push(c);
                        break;
                    }
                }
            }
        }
        v.sort(function (a, b) {
            return (b.updatedAt || b.createdAt || 0) -
                   (a.updatedAt || a.createdAt || 0);
        });
        return v;
    }

    function _loadNotifications() {
        var notifs = [];
        if (typeof EventBus === 'undefined') return notifs;
        try {
            var h = EventBus.getHistory() || [];
            var myCaseIds = {};
            for (var i = 0; i < STATE.cases.length; i++) {
                myCaseIds[STATE.cases[i].caseId] = true;
            }
            for (var j = h.length - 1; j >= 0 && notifs.length < 12; j--) {
                var ev = h[j];
                if (!ev || !ev.name) continue;
                if (ev.name.indexOf('case.') === 0 ||
                    ev.name.indexOf('sm.') === 0 ||
                    ev.name.indexOf('approval.') === 0) {
                    if (ev.data && ev.data.caseId &&
                        (STATE.queue.indexOf(ev.data.caseId) !== -1 ||
                         STATE.verified.indexOf(ev.data.caseId) !== -1)) {
                        notifs.push({
                            name: ev.name,
                            data: ev.data,
                            timestamp: ev.timestamp || 0
                        });
                    }
                }
            }
        } catch (e) { /* بی‌صدا */ }
        return notifs;
    }

    // ─────────────────────────────────────
    // 📊 آمار
    // ─────────────────────────────────────
    function computeStats() {
        var stats = {
            queue: STATE.queue.length,
            verified: STATE.verified.length,
            pending: 0,
            urgent: 0,
            totalAmount: 0
        };

        // صف
        for (var i = 0; i < STATE.queue.length; i++) {
            var c = STATE.queue[i];
            if (!c) continue;
            var h = Date.now() - (c.createdAt || c.updatedAt || 0);
            if (h > 3 * 24 * 60 * 60 * 1000) stats.urgent++;
            var step = c.currentStep || '';
            if (step === 'step_3') stats.pending++;
        }

        // مبلغ کل
        var all = STATE.queue.concat(STATE.verified);
        var seen = {};
        for (var j = 0; j < all.length; j++) {
            var c2 = all[j];
            if (!c2 || seen[c2.caseId]) continue;
            seen[c2.caseId] = true;
            stats.totalAmount += Number(c2.loanAmount) || 0;
        }

        return stats;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت آمار
    // ─────────────────────────────────────
    function _statCard(label, value, icon, accent) {
        accent = accent || '';
        return '<div class="wam-stat' + (accent ? ' wam-stat--' + accent : '') + '">' +
               '<div class="wam-stat__icon">' + icon + '</div>' +
               '<div class="wam-stat__body">' +
                   '<div class="wam-stat__value">' + _fa(value) + '</div>' +
                   '<div class="wam-stat__label">' + _esc(label) + '</div>' +
               '</div></div>';
    }

    // ─────────────────────────────────────
    // 🎨 ردیف پرونده
    // ─────────────────────────────────────
    function _caseRow(c, withAction) {
        var st = c.status || 'draft';
        var waiting = c.createdAt ? Date.now() - c.createdAt : 0;
        var isUrgent = waiting > 3 * 24 * 60 * 60 * 1000;

        var html = '<div class="wam-vcase-row' +
            (isUrgent ? ' is-urgent' : '') + '" data-case-id="' +
            _esc(c.caseId) + '">';

        html += '<div class="wam-vcase-row__head">';
        html += '<code>' + _esc(c.caseId) + '</code> ';
        html += '<span class="wam-badge wam-badge--' + _esc(st) + '">' +
                _esc(_statusLabel(st)) + '</span>';
        if (isUrgent) {
            html += ' <span class="wam-badge wam-badge--urgent">⏰ فوری</span>';
        }
        html += '</div>';

        html += '<div class="wam-vcase-row__body">';
        html += '<div class="wam-vcase-row__line"><span>متقاضی:</span> <strong>' +
                _esc(c.applicantName || '—') + '</strong></div>';
        html += '<div class="wam-vcase-row__line"><span>بانک:</span> ' +
                _esc(c.bank || '—') + '</div>';
        html += '<div class="wam-vcase-row__line"><span>مبلغ:</span> ' +
                _amt(c.loanAmount) + ' ریال</div>';
        html += '<div class="wam-vcase-row__line"><span>مرحله:</span> ' +
                _esc(c.currentStep || '—') + '</div>';
        html += '</div>';

        html += '<div class="wam-vcase-row__foot">';
        html += '<span class="wam-vcase-row__time">' +
                _esc(_relTime(c.updatedAt || c.createdAt)) + '</span>';
        if (withAction !== false) {
            html += '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
                    'data-vcase-action="review" data-case-id="' +
                    _esc(c.caseId) + '">🔍 بررسی</button>';
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نمای داشبورد
    // ─────────────────────────────────────
    function _renderDashboard() {
        var s = computeStats();
        var html = '';

        html += '<div class="wam-verifier-stats">';
        html += _statCard('در صف بررسی', s.queue, '📋', 'warning');
        html += _statCard('بررسی‌شده', s.verified, '✅', 'success');
        html += _statCard('فوری', s.urgent, '⏰', 'danger');
        html += _statCard('مبلغ کل', 0, '💰');
        html += '</div>';

        html += '<div class="wam-verifier-amounts">';
        html += '<div class="wam-verifier-amounts__row">' +
                '<span>مجموع مبالغ در انتظار بررسی:</span>' +
                '<strong>' + _amt(s.totalAmount) + ' ریال</strong></div>';
        html += '</div>';

        // آخرین پرونده‌های صف
        html += '<section class="wam-verifier-section">';
        html += '<header class="wam-verifier-section__head">' +
                '<h3>📋 در انتظار بررسی</h3>' +
                '<button class="wam-btn wam-btn--sm" data-vverifier-view="' +
                VIEWS.QUEUE + '">مشاهده همه</button></header>';
        if (STATE.queue.length === 0) {
            html += '<div class="wam-empty">هیچ پرونده‌ای در صف نیست. 🎉</div>';
        } else {
            html += '<div class="wam-verifier-list">';
            for (var i = 0; i < Math.min(5, STATE.queue.length); i++) {
                html += _caseRow(STATE.queue[i]);
            }
            html += '</div>';
        }
        html += '</section>';

        // ابزارهای سریع
        html += '<section class="wam-verifier-section">';
        html += '<h3>⚡ اقدامات سریع</h3>';
        html += '<div class="wam-verifier-quick">';
        html += '<button class="wam-verifier-quick__item" ' +
                'data-vverifier-view="' + VIEWS.QUEUE + '">' +
                '<span>📋</span><span>صف بررسی</span></button>';
        html += '<button class="wam-verifier-quick__item" ' +
                'data-vverifier-view="' + VIEWS.MY_VERIFIED + '">' +
                '<span>✅</span><span>بررسی‌شده‌ها</span></button>';
        html += '<button class="wam-verifier-quick__item" ' +
                'data-vverifier-view="' + VIEWS.SYNC + '">' +
                '<span>🔄</span><span>همگام‌سازی</span></button>';
        html += '<button class="wam-verifier-quick__item" ' +
                'data-vverifier-view="' + VIEWS.NOTIFS + '">' +
                '<span>🔔</span><span>اعلان‌ها</span></button>';
        html += '</div>';
        html += '</section>';

        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — صف بررسی
    // ─────────────────────────────────────
    function _renderQueue() {
        var html = '<section class="wam-verifier-section">';
        html += '<header class="wam-verifier-section__head">' +
                '<h3>📋 صف بررسی</h3>' +
                '<button class="wam-btn wam-btn--sm" ' +
                'data-vverifier-action="refresh">🔄</button></header>';

        if (STATE.queue.length === 0) {
            html += '<div class="wam-empty">صف بررسی خالی است. 🎉</div>';
        } else {
            html += '<div class="wam-verifier-list">';
            for (var i = 0; i < STATE.queue.length; i++) {
                html += _caseRow(STATE.queue[i]);
            }
            html += '</div>';
        }
        html += '</section>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — بررسی‌شده‌ها
    // ─────────────────────────────────────
    function _renderVerified() {
        var html = '<section class="wam-verifier-section">';
        html += '<h3>✅ بررسی‌شده‌های من</h3>';
        if (STATE.verified.length === 0) {
            html += '<div class="wam-empty">هنوز پرونده‌ای را بررسی نکرده‌اید.</div>';
        } else {
            html += '<div class="wam-verifier-list">';
            for (var i = 0; i < STATE.verified.length; i++) {
                html += _caseRow(STATE.verified[i], false);
            }
            html += '</div>';
        }
        html += '</section>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — اعلان‌ها
    // ─────────────────────────────────────
    function _renderNotifs() {
        var html = '<section class="wam-verifier-section"><h3>🔔 اعلان‌ها</h3>';
        if (STATE.notifications.length === 0) {
            html += '<div class="wam-empty">اعلانی نیست.</div>';
        } else {
            html += '<ul class="wam-notif-list">';
            for (var i = 0; i < STATE.notifications.length; i++) {
                var n = STATE.notifications[i];
                html += '<li class="wam-notif-item">' +
                    '<div class="wam-notif-item__body">' +
                    '<div class="wam-notif-item__text">' +
                    _esc(n.name) + '</div>' +
                    '<div class="wam-notif-item__meta">' +
                    (n.data && n.data.caseId ?
                        '<code>' + _esc(n.data.caseId) + '</code> · ' : '') +
                    _esc(_relTime(n.timestamp)) + '</div></div></li>';
            }
            html += '</ul>';
        }
        html += '</section>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — پروفایل
    // ─────────────────────────────────────
    function _renderProfile() {
        var u = STATE.currentUser || {};
        return '<section class="wam-verifier-section"><h3>👤 پروفایل</h3>' +
            '<div class="wam-profile-info">' +
            _prow('نام', u.name || '—') +
            _prow('نام کاربری', u.username || '—') +
            _prow('موبایل', u.mobile || '—') +
            _prow('نقش', 'اعتبارسنج') +
            '</div>' +
            '<div class="wam-profile-actions">' +
            '<a class="wam-btn wam-btn--primary" ' +
            'href="change-password.html">تغییر رمز عبور</a></div>' +
            '</section>';
    }

    function _prow(l, v) {
        return '<div class="wam-profile-row"><span class="wam-profile-row__label">' +
               _esc(l) + ':</span><span class="wam-profile-row__value">' +
               _esc(v) + '</span></div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — همگام‌سازی
    // ─────────────────────────────────────
    function _renderSync() {
        return '<section class="wam-verifier-section"><h3>🔄 همگام‌سازی</h3>' +
            '<p class="wam-text-muted">وضعیت همگام‌سازی داده‌ها:</p>' +
            '<div class="wam-sync-info">' +
            '<div class="wam-sync-info__row"><span>آخرین بروزرسانی:</span>' +
            '<strong>' + _esc(_relTime(STATE.lastUpdate)) + '</strong></div>' +
            '<div class="wam-sync-info__row"><span>صف بررسی:</span>' +
            '<strong>' + _fa(STATE.queue.length) + ' مورد</strong></div>' +
            '<div class="wam-sync-info__row"><span>بررسی‌شده:</span>' +
            '<strong>' + _fa(STATE.verified.length) + ' مورد</strong></div>' +
            '</div>' +
            '<div class="wam-verifier-quick">' +
            '<button class="wam-btn wam-btn--primary" ' +
            'data-vverifier-action="refresh">🔄 همگام‌سازی الان</button>' +
            '</div></section>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ناوبری
    // ─────────────────────────────────────
    function _renderNav() {
        var items = [
            { id: VIEWS.DASHBOARD,   icon: '🏠', label: 'داشبورد' },
            { id: VIEWS.QUEUE,       icon: '📋', label: 'صف بررسی' },
            { id: VIEWS.MY_VERIFIED, icon: '✅', label: 'بررسی‌شده‌ها' },
            { id: VIEWS.NOTIFS,      icon: '🔔', label: 'اعلان‌ها' },
            { id: VIEWS.SYNC,        icon: '🔄', label: 'همگام‌سازی' },
            { id: VIEWS.PROFILE,     icon: '👤', label: 'پروفایل' }
        ];
        var html = '<nav class="wam-verifier-nav" role="tablist">';
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            html += '<button type="button" role="tab" ' +
                    'class="wam-verifier-nav__item' +
                    (STATE.currentView === it.id ? ' is-active' : '') + '" ' +
                    'data-vverifier-view="' + it.id + '">' +
                    '<span class="wam-verifier-nav__icon">' + it.icon + '</span>' +
                    '<span class="wam-verifier-nav__label">' +
                    _esc(it.label) + '</span></button>';
        }
        html += '</nav>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — هدر
    // ─────────────────────────────────────
    function _renderHeader() {
        var u = STATE.currentUser || {};
        return '<header class="wam-verifier-header">' +
            '<div class="wam-verifier-header__left">' +
                '<div class="wam-verifier-header__avatar">' +
                    _esc((u.name || 'ا').charAt(0)) + '</div>' +
                '<div class="wam-verifier-header__info">' +
                    '<div class="wam-verifier-header__name">' +
                    _esc(u.name || 'اعتبارسنج') + '</div>' +
                    '<div class="wam-verifier-header__role">' +
                    '🔍 اعتبارسنج</div></div></div>' +
            '<div class="wam-verifier-header__right">' +
                '<button class="wam-btn-icon" data-vverifier-action="refresh" ' +
                'title="بروزرسانی">🔄</button>' +
                '<button class="wam-btn-icon" data-vverifier-action="logout" ' +
                'title="خروج">🚪</button>' +
            '</div></header>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نمای جاری
    // ─────────────────────────────────────
    function _renderCurrentView() {
        if (STATE.currentView === VIEWS.DASHBOARD)   return _renderDashboard();
        if (STATE.currentView === VIEWS.QUEUE)       return _renderQueue();
        if (STATE.currentView === VIEWS.MY_VERIFIED) return _renderVerified();
        if (STATE.currentView === VIEWS.NOTIFS)      return _renderNotifs();
        if (STATE.currentView === VIEWS.PROFILE)     return _renderProfile();
        if (STATE.currentView === VIEWS.SYNC)        return _renderSync();
        return '<div class="wam-empty">نمای نامعتبر.</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;
        STATE.root.innerHTML =
            '<div class="wam-verifier-app">' +
                _renderHeader() +
                '<main class="wam-verifier-main" data-vverifier="content">' +
                    _renderCurrentView() +
                '</main>' +
                _renderNav() +
            '</div>';
        _bindEvents();
        STATE.lastUpdate = Date.now();
        _emit(VEvents.UPDATED, {
            view: STATE.currentView, at: STATE.lastUpdate
        });
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents() {
        if (!STATE.root) return;

        var views = STATE.root.querySelectorAll('[data-vverifier-view]');
        for (var i = 0; i < views.length; i++) {
            views[i].addEventListener('click', _handleViewClick);
        }

        var actions = STATE.root.querySelectorAll('[data-vverifier-action]');
        for (var j = 0; j < actions.length; j++) {
            actions[j].addEventListener('click', _handleAction);
        }

        var caseActions = STATE.root.querySelectorAll('[data-vcase-action]');
        for (var k = 0; k < caseActions.length; k++) {
            caseActions[k].addEventListener('click', _handleCaseAction);
        }
    }

    function _handleViewClick(e) {
        e.preventDefault();
        var v = this.getAttribute('data-vverifier-view');
        if (!v || !VIEW_TITLES[v]) return;
        if (STATE.currentView === v) return;
        navigate(v);
    }

    function _handleAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-vverifier-action');
        if (a === 'logout') {
            if (typeof WamPayGuard !== 'undefined') WamPayGuard.logout();
            else if (typeof WamLogin !== 'undefined') WamLogin.logout();
            return;
        }
        if (a === 'refresh') { refresh(); return; }
        _emit(VEvents.ACTION, { action: a, at: Date.now() });
    }

    function _handleCaseAction(e) {
        e.preventDefault();
        var action = this.getAttribute('data-vcase-action');
        var id = this.getAttribute('data-case-id');
        if (!id) return;
        if (action === 'review') {
            // هدایت به صفحه جزئیات پرونده
            window.location.href = 'case-details.html?id=' +
                encodeURIComponent(id);
        }
    }

    // ─────────────────────────────────────
    // 🎯 ناوبری
    // ─────────────────────────────────────
    function navigate(view) {
        if (!VIEW_TITLES[view]) return false;
        if (STATE.currentView === view) return false;
        STATE.currentView = view;
        try {
            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, '', '#' + view);
            } else {
                window.location.hash = view;
            }
        } catch (e) { /* بی‌صدا */ }
        render();
        _emit(VEvents.VIEW_CHANGE, { view: view, at: Date.now() });
        return true;
    }

    // ─────────────────────────────────────
    // 🔄 بروزرسانی
    // ─────────────────────────────────────
    function refresh(options) {
        options = options || {};
        if (!STATE.root) return false;
        STATE.cases = _loadAllCases();
        STATE.queue = _loadQueue();
        STATE.verified = _loadMyVerified();
        STATE.notifications = _loadNotifications();
        render();
        _emit(VEvents.REFRESH, { at: Date.now() });
        if (!options.silent && typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('بروزرسانی شد', 'موفق');
        }
        return true;
    }

    function _startAutoRefresh() {
        _stopAutoRefresh();
        STATE.autoRefreshTimer = setInterval(function () {
            try {
                STATE.cases = _loadAllCases();
                STATE.queue = _loadQueue();
                STATE.verified = _loadMyVerified();
                STATE.notifications = _loadNotifications();
                render();
            } catch (e) { /* بی‌صدا */ }
        }, AUTOREFRESH_MS);
    }

    function _stopAutoRefresh() {
        if (STATE.autoRefreshTimer) {
            clearInterval(STATE.autoRefreshTimer);
            STATE.autoRefreshTimer = null;
        }
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var run = function () {
            STATE.currentUser = _getCurrentUser();
            if (!STATE.currentUser) {
                if (typeof WamPayGuard !== 'undefined') {
                    WamPayGuard.redirectToLogin('not_logged_in');
                }
                return;
            }
            var role = STATE.currentUser.role;
            if (role !== 'verifier' && role !== 'admin' && role !== 'super_admin') {
                if (typeof WamPayGuard !== 'undefined') {
                    WamPayGuard.redirectToRoleHome(role);
                }
                return;
            }

            var root = options.root ||
                       document.querySelector('[data-verifier-app]') ||
                       document.querySelector('.wam-verifier-panel') ||
                       document.querySelector('main');
            if (!root) {
                if (options.debug) console.warn('[verifier-app] root پیدا نشد');
                return;
            }
            STATE.root = root;

            // تعیین view از hash
            var hash = (typeof window !== 'undefined' && window.location.hash)
                ? window.location.hash.replace(/^#/, '') : '';
            if (hash && VIEW_TITLES[hash]) STATE.currentView = hash;

            // بارگذاری
            STATE.cases = _loadAllCases();
            STATE.queue = _loadQueue();
            STATE.verified = _loadMyVerified();
            STATE.notifications = _loadNotifications();

            render();

            if (options.autoRefresh !== false) _startAutoRefresh();

            STATE.installed = true;
            _emit(VEvents.READY, {
                user: { id: STATE.currentUser.id, username: STATE.currentUser.username },
                queueCount: STATE.queue.length,
                at: Date.now()
            });

            if (options.debug) {
                console.log('[verifier-app] آماده — ' + STATE.queue.length + ' در صف');
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run);
        } else {
            run();
        }
    }

    function uninstall() {
        _stopAutoRefresh();
        STATE.root = null;
        STATE.installed = false;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            user: STATE.currentUser ? {
                id: STATE.currentUser.id,
                username: STATE.currentUser.username,
                role: STATE.currentUser.role
            } : null,
            currentView: STATE.currentView,
            queueCount: STATE.queue.length,
            verifiedCount: STATE.verified.length,
            autoRefresh: !!STATE.autoRefreshTimer,
            lastUpdate: STATE.lastUpdate
        };
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
    var WamVerifierApp = {
        EVENTS: VEvents,
        VIEWS: VIEWS,
        VIEW_TITLES: VIEW_TITLES,
        STATUS_LABELS: STATUS_LABELS,
        AUTOREFRESH_MS: AUTOREFRESH_MS,

        install: install,
        uninstall: uninstall,
        refresh: refresh,
        render: render,

        navigate: navigate,
        getCurrentView: function () { return STATE.currentView; },

        computeStats: computeStats,
        getQueue: function () { return STATE.queue.slice(); },
        getVerified: function () { return STATE.verified.slice(); },
        getNotifications: function () { return STATE.notifications.slice(); },

        getCurrentUser: _getCurrentUser,
        startAutoRefresh: _startAutoRefresh,
        stopAutoRefresh: _stopAutoRefresh,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamVerifierApp = WamVerifierApp;
    window.VerifierEvents = VEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-verifier-page') ||
                document.querySelector('[data-verifier-app]') ||
                document.querySelector('.wam-verifier-panel')) {
                install();
            }
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _auto);
        } else {
            _auto();
        }
    }

})();




/* ==========================================
 * END OF BUNDLE
 * ========================================== */