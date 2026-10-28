// ═══════════════════════════════════════════════════════════
// js/case-state-service.js
// سرویس مرکزی انتقال وضعیت — همگام‌سازی کامل
// ═══════════════════════════════════════════════════════════

(function (global) {
    'use strict';

    // ═══ نقشه‌ی Status → Queue ═══
    const STATUS_QUEUE_MAP = {
        'awaiting_broker_admin_review': 'wamPayBrokerAdminQueue',
        'awaiting_accounting_review': 'wamPayAccountingQueue',
        'awaiting_super_admin_financial': 'wamPaySuperAdminFinancialQueue',
        'awaiting_legal_draft': 'wamPayLegalQueue',
        'awaiting_broker_sign': 'wamPayBrokerSignQueue',
        'awaiting_site_sign': 'wamPaySiteSignQueue',
        'awaiting_applicant_sign': 'wamPayApplicantSignQueue',
        'awaiting_signature': 'wamPayApplicantSignQueue',
        'payment_pending': 'wamPayPaymentQueue',
        'payment_in_escrow': 'wamPayBrokerTransferQueue',
        'broker_transferred': 'wamPaySuperAdminTransferQueue',
        'super_admin_verified': 'wamPayApplicantConfirmQueue',
        'awaiting_applicant_confirm': 'wamPayApplicantConfirmQueue',
        'awaiting_declaration': 'wamPayDeclarationQueue'
    };

    // ═══ نقشه‌ی Status → currentStep ═══
    const STATUS_STEP_MAP = {
        'draft': 0,
        'verifier_pending': 0,
        'verifier_approved': 0,
        'broker_pending': 0,
        'broker_assigned': 0,
        'awaiting_broker_admin_review': 1,
        'awaiting_accounting_review': 2,
        'awaiting_super_admin_financial': 3,
        'awaiting_legal_draft': 4,
        'awaiting_broker_sign': 5,
        'awaiting_site_sign': 6,
        'awaiting_applicant_sign': 7,
        'awaiting_signature': 7,
        'contract_signed_by_all': 8,
        'contract_signed': 8,
        'payment_pending': 8,
        'payment_in_escrow': 8,
        'broker_transferred': 8,
        'super_admin_verified': 8,
        'applicant_confirmed': 8,
        'awaiting_declaration': 9,
        'declaration_signed': 9,
        'awaiting_legal_review': 9,
        'awaiting_accounting_review_final': 9,
        'payment_released': 10,
        'completed': 10,
        'rejected': 10,
        'refunded': 10
    };

    const ALL_QUEUES = [
        'wamPayBrokerAdminQueue', 'wamPayAccountingQueue',
        'wamPaySuperAdminFinancialQueue', 'wamPayLegalQueue',
        'wamPayBrokerSignQueue', 'wamPaySiteSignQueue',
        'wamPayApplicantSignQueue', 'wamPayPaymentQueue',
        'wamPayBrokerTransferQueue', 'wamPaySuperAdminTransferQueue',
        'wamPayApplicantConfirmQueue', 'wamPayDeclarationQueue'
    ];

    // ═══ توابع کمکی ═══
    function safeParse(key, fallback = null) {
        try {
            const v = localStorage.getItem(key);
            return v ? JSON.parse(v) : fallback;
        } catch (e) {
            console.warn(`safeParse failed for ${key}:`, e);
            return fallback;
        }
    }

    function saveJSON(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error(`saveJSON failed for ${key}:`, e);
            return false;
        }
    }

    function getCase(caseId) {
        const apps = safeParse('wamPayApplications', []);
        return apps.find(c => c.id === caseId || c.caseNumber === caseId);
    }

    function saveCase(caseObj) {
        const apps = safeParse('wamPayApplications', []);
        const idx = apps.findIndex(c => c.id === caseObj.id);
        if (idx >= 0) {
            apps[idx] = caseObj;
        } else {
            apps.push(caseObj);
        }
        return saveJSON('wamPayApplications', apps);
    }

    // ═══ مدیریت صف‌ها ═══
    function addToQueue(caseObj, status) {
        const queueKey = STATUS_QUEUE_MAP[status];
        if (!queueKey) return false;

        const queue = safeParse(queueKey, []);
        const exists = queue.find(x => x.caseNumber === caseObj.caseNumber);
        if (exists) {
            console.log(`   ℹ️ قبلاً توی صف بود: ${queueKey}`);
            return false;
        }

        queue.push({
            caseNumber: caseObj.caseNumber,
            caseId: caseObj.id,
            status: status,
            addedAt: new Date().toISOString()
        });
        saveJSON(queueKey, queue);
        console.log(`   ✅ به صف اضافه شد: ${queueKey}`);
        return true;
    }

    function removeFromQueue(caseObj, status) {
        const queueKey = STATUS_QUEUE_MAP[status];
        if (!queueKey) return false;

        const queue = safeParse(queueKey, []);
        const filtered = queue.filter(x => x.caseNumber !== caseObj.caseNumber);
        
        if (filtered.length === queue.length) return false;
        
        saveJSON(queueKey, filtered);
        console.log(`   🗑️ از صف حذف شد: ${queueKey}`);
        return true;
    }

    function clearAllQueues(caseObj) {
        let cleared = 0;
        ALL_QUEUES.forEach(qKey => {
            const queue = safeParse(qKey, []);
            const filtered = queue.filter(x => x.caseNumber !== caseObj.caseNumber);
            if (filtered.length !== queue.length) {
                saveJSON(qKey, filtered);
                cleared++;
            }
        });
        if (cleared > 0) console.log(`   🧹 ${cleared} صف پاک شد`);
        return cleared;
    }

    // ═══ محاسبه‌ی currentStep ═══
    function computeCurrentStep(status) {
        return STATUS_STEP_MAP[status] !== undefined ? STATUS_STEP_MAP[status] : 0;
    }

    // ═══ لاگ مالی ═══
    function logFinancial(caseObj, fromStatus, toStatus, options) {
        if (!global.WamPayFinancialLog) return;
        try {
            global.WamPayFinancialLog.logEvent('system_event', {
                from: fromStatus,
                to: toStatus,
                caseNumber: caseObj.caseNumber
            }, {
                caseId: caseObj.id,
                caseNumber: caseObj.caseNumber,
                title: `تغییر وضعیت: ${fromStatus} → ${toStatus}`,
                description: options?.note || null,
                status: 'completed',
                actor: options?.actor || null
            });
        } catch (e) {
            console.warn('Financial log failed:', e);
        }
    }

    // ═══ ⚡ تابع اصلی: انتقال کامل ═══
    function transition(caseId, nextStatus, options = {}) {
        console.log(`\n🔄 [CaseStateService] transition:`);
        console.log(`   caseId: ${caseId}`);
        console.log(`   nextStatus: ${nextStatus}`);

        // ─── ۱. پیدا کردن پرونده ───
        const caseObj = getCase(caseId);
        if (!caseObj) {
            console.error('❌ پرونده پیدا نشد:', caseId);
            return { ok: false, error: 'پرونده پیدا نشد' };
        }

        const fromStatus = caseObj.status;
        console.log(`   fromStatus: ${fromStatus}`);

        // ─── ۲. چک کردن امکان انتقال ───
        if (global.WamPayStateMachine) {
            const check = global.WamPayStateMachine.canTransition(
                fromStatus, 
                nextStatus, 
                options.role || global.WamPayStateMachine.getCurrentRole()
            );
            if (!check.ok) {
                console.error('❌', check.error);
                return check;
            }
        }

        // ─── ۳. حذف از صف قبلی ───
        removeFromQueue(caseObj, fromStatus);

        // ─── ۴. آپدیت پرونده ───
        const history = caseObj.stateHistory || [];
        history.push({
            from: fromStatus,
            to: nextStatus,
            at: new Date().toISOString(),
            by: options.actor || 'system',
            role: options.role || 'system',
            note: options.note || null
        });

        const updated = {
            ...caseObj,
            status: nextStatus,
            currentStep: computeCurrentStep(nextStatus),
            stateHistory: history,
            updatedAt: new Date().toISOString(),
            lastTransitionAt: new Date().toISOString()
        };

        // ─── ۵. ذخیره ───
        saveCase(updated);
        console.log(`   ✅ پرونده ذخیره شد`);

        // ─── ۶. اضافه به صف جدید ───
        addToQueue(updated, nextStatus);

        // ─── ۷. لاگ مالی ───
        logFinancial(updated, fromStatus, nextStatus, options);

        // ─── ۸. رویداد ───
        if (global.EventBus) {
            global.EventBus.emit('case:transition', { caseId, from: fromStatus, to: nextStatus });
        }

        console.log(`   ✅ انتقال انجام شد: ${fromStatus} → ${nextStatus}\n`);

        return { ok: true, case: updated };
    }

    // ═══ تکمیل پرونده (پایان) ═══
    function completeCase(caseId, options = {}) {
        console.log(`\n🎉 [CaseStateService] تکمیل پرونده: ${caseId}`);
        
        const caseObj = getCase(caseId);
        if (!caseObj) return { ok: false, error: 'پرونده پیدا نشد' };

        // پاک‌سازی همه‌ی صف‌ها
        clearAllQueues(caseObj);

        // آپدیت به completed
        return transition(caseId, 'completed', {
            ...options,
            note: options.note || 'پرونده تکمیل و بایگانی شد'
        });
    }

    // ═══ گزارش ═══
    function getReport() {
        const apps = safeParse('wamPayApplications', []);
        const queues = {};
        ALL_QUEUES.forEach(q => {
            queues[q] = safeParse(q, []).length;
        });
        return {
            totalCases: apps.length,
            queues,
            cases: apps.map(c => ({
                caseNumber: c.caseNumber,
                status: c.status,
                currentStep: c.currentStep
            }))
        };
    }

    // ═══ Export ═══
    global.CaseStateService = {
        // Core
        transition,
        completeCase,

        // Helpers
        getCase,
        saveCase,
        computeCurrentStep,

        // Queue
        addToQueue,
        removeFromQueue,
        clearAllQueues,

        // Log
        logFinancial,

        // Report
        getReport,

        // Constants
        STATUS_QUEUE_MAP,
        STATUS_STEP_MAP,
        ALL_QUEUES
    };

    console.log('%c⚙️ CaseStateService v1.0 آماده', 'color:#0b3b23;font-weight:bold;font-size:13px;');
    console.log('%c🔄 انتقال وضعیت + همگام‌سازی کامل', 'color:#d4a62a;font-weight:bold;');

})(typeof window !== 'undefined' ? window : this);