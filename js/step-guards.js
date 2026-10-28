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