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