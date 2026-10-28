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