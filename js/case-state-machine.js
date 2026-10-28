/* ============================================================
   WAM PAY — Case State Machine v3.2
   ماشین وضعیت پرونده — نسخه‌ی بازنویسی‌شده
   🆕 v3.2: افزودن status های تأیید نهایی سفته‌ها
   ============================================================ */

(function (global) {
    'use strict';

    // ============================================================
    //  📋  وضعیت‌های اصلی
    // ============================================================

    const STATUSES = {
        // ===== مرحله ۱: ثبت‌نام =====
        DRAFT: 'draft',

        // ===== مرحله ۲: مشاوره =====
        AWAITING_CONSULTATION: 'awaiting_consultation',
        CONSULTATION_APPROVED: 'consultation_approved',
        CONSULTATION_REJECTED: 'consultation_rejected',

        // ===== مرحله ۳: اعتبارسنجی =====
        UNDER_VERIFICATION: 'under_verification',
        VERIFICATION_APPROVED: 'verification_approved',
        VERIFICATION_REJECTED: 'verification_rejected',

        // ===== مرحله ۴: تکمیل مدارک =====
        AWAITING_FINALIZATION: 'awaiting_finalization',
        FINALIZATION_COMPLETE: 'finalization_complete',

        // 🆕 v3.2: تأیید نهایی سفته‌ها توسط اعتبارسنج
        AWAITING_FINAL_VERIFICATION: 'awaiting_final_verification',
        VERIFICATION_COMPLETE_PENDING_SUPERADMIN: 'verification_complete_pending_superadmin',
        VERIFICATION_FINAL_REJECTED: 'verification_final_rejected',

        // ===== مرحله ۵: کارگزار (بررسی اولیه) =====
        AWAITING_BROKER_REVIEW: 'awaiting_broker_review',
        BROKER_REVIEW_APPROVED: 'broker_review_approved',
        BROKER_REVIEW_REJECTED: 'broker_review_rejected',

        // 🆕 Alias برای سازگاری با کد قدیمی
        AWAITING_BROKER_ADMIN_REVIEW: 'awaiting_broker_admin_review',

        // ===== مرحله ۶: حقوقی پیش‌نویس =====
        LEGAL_DRAFT_PENDING: 'legal_draft_pending',
        AWAITING_LEGAL_DRAFT: 'awaiting_legal_draft',
        LEGAL_DRAFT_READY: 'legal_draft_ready',

        // ===== مرحله ۷: مدیر کل تأیید پیش‌نویس حقوقی =====
        CONTRACT_REVIEW_PENDING_SUPERADMIN: 'contract_review_pending_superadmin',
        CONTRACT_REVIEW_APPROVED: 'contract_review_approved',
        CONTRACT_REVIEW_REJECTED: 'contract_review_rejected',

        // ===== مرحله ۸: کارگزار (تأیید پیش‌نویس) =====
        AWAITING_BROKER_DRAFT_APPROVAL: 'awaiting_broker_draft_approval',
        BROKER_DRAFT_APPROVED: 'broker_draft_approved',

        // ===== مرحله ۹: متقاضی پیش‌نویس =====
        AWAITING_APPLICANT_DRAFT: 'awaiting_applicant_draft',
        APPLICANT_DRAFT_APPROVED: 'applicant_draft_approved',

        // ===== مرحله ۱۰: امضا (گام ۷) =====
        AWAITING_SIGNATURE: 'awaiting_signature',
        APPLICANT_SIGNED: 'applicant_signed',
        CONTRACT_SIGNED: 'contract_signed',

        // ===== مرحله ۱۱: پرداخت امانی =====
        PAYMENT_PENDING: 'payment_pending',
        PAYMENT_IN_ESCROW: 'payment_in_escrow',
        BROKER_TRANSFERRED: 'broker_transferred',
        SUPER_ADMIN_VERIFIED: 'super_admin_verified',
        APPLICANT_CONFIRMED: 'applicant_confirmed',

        // ===== مرحله ۱۲: اقرار =====
        AWAITING_DECLARATION: 'awaiting_declaration',
        DECLARATION_SIGNED: 'declaration_signed',

        // ===== مرحله ۱۳: بررسی نهایی =====
        AWAITING_LEGAL_REVIEW: 'awaiting_legal_review',
        AWAITING_ACCOUNTING_REVIEW: 'awaiting_accounting_review',
        PAYMENT_RELEASED: 'payment_released',

        // ===== مرحله ۱۴: بایگانی =====
        COMPLETED: 'completed',

        // ===== نهایی =====
        REJECTED: 'rejected',
        REFUNDED: 'refunded'
    };

    // ============================================================
    //  🎨  متادیتای وضعیت‌ها
    // ============================================================

    const STATUS_META = {
        [STATUSES.DRAFT]: {
            label: 'پیش‌نویس',
            icon: '📝',
            cls: 'pending',
            color: '#6b7d73',
            description: 'پرونده در حال تکمیل',
            phase: 'draft',
            order: 0,
            responsibleRole: 'applicant'
        },
        [STATUSES.AWAITING_CONSULTATION]: {
            label: 'در انتظار مشاور',
            icon: '💬',
            cls: 'pending',
            color: '#e67e22',
            description: 'پرونده برای مشاوره ارجاع شده',
            phase: 'consultation',
            order: 1,
            responsibleRole: 'consultation_admin',
            locked: true
        },
        [STATUSES.CONSULTATION_APPROVED]: {
            label: 'تأیید مشاور',
            icon: '✅',
            cls: 'success',
            color: '#1e8e4a',
            description: 'مشاور پرونده را تأیید کرد',
            phase: 'consultation',
            order: 2,
            responsibleRole: 'applicant'
        },
        [STATUSES.CONSULTATION_REJECTED]: {
            label: 'رد مشاور',
            icon: '❌',
            cls: 'error',
            color: '#c0392b',
            description: 'مشاور پرونده را رد کرد',
            phase: 'consultation',
            order: 2,
            responsibleRole: 'applicant'
        },
        [STATUSES.UNDER_VERIFICATION]: {
            label: 'در حال اعتبارسنجی',
            icon: '🔍',
            cls: 'progress',
            color: '#2980b9',
            description: 'پرونده در حال بررسی اعتبار',
            phase: 'verification',
            order: 3,
            responsibleRole: 'verification_admin',
            locked: true
        },
        [STATUSES.VERIFICATION_APPROVED]: {
            label: 'تأیید اعتبارسنجی',
            icon: '✅',
            cls: 'success',
            color: '#1e8e4a',
            description: 'اعتبارسنج تأیید کرد — منتظر آپلود سفته‌ها',
            phase: 'verification',
            order: 4,
            responsibleRole: 'applicant'
        },
        [STATUSES.VERIFICATION_REJECTED]: {
            label: 'رد اعتبارسنجی',
            icon: '❌',
            cls: 'error',
            color: '#c0392b',
            description: 'اعتبارسنج رد کرد',
            phase: 'verification',
            order: 4,
            responsibleRole: 'applicant'
        },
        [STATUSES.AWAITING_FINALIZATION]: {
            label: 'در انتظار تکمیل',
            icon: '📋',
            cls: 'progress',
            color: '#2980b9',
            description: 'در انتظار تکمیل مدارک',
            phase: 'finalization',
            order: 5,
            responsibleRole: 'applicant'
        },
        [STATUSES.FINALIZATION_COMPLETE]: {
            label: 'تکمیل شد',
            icon: '✅',
            cls: 'success',
            color: '#1e8e4a',
            description: 'مدارک تکمیل شد',
            phase: 'finalization',
            order: 6,
            responsibleRole: 'verification_admin'
        },
        // 🆕 v3.2: تأیید نهایی سفته‌ها
        [STATUSES.AWAITING_FINAL_VERIFICATION]: {
            label: 'در انتظار تأیید نهایی اعتبارسنج',
            icon: '🔍',
            cls: 'pending',
            color: '#e67e22',
            description: 'سفته‌ها آپلود شد — منتظر تأیید نهایی اعتبارسنج',
            phase: 'final_verification',
            order: 7,
            responsibleRole: 'verification_admin',
            locked: true
        },
        [STATUSES.VERIFICATION_COMPLETE_PENDING_SUPERADMIN]: {
            label: 'در انتظار تأیید مدیر کل',
            icon: '👑',
            cls: 'pending',
            color: '#d4a62a',
            description: 'اعتبارسنج تأیید کرد — منتظر تأیید مدیر کل',
            phase: 'final_verification',
            order: 8,
            responsibleRole: 'super_admin',
            locked: true
        },
        [STATUSES.VERIFICATION_FINAL_REJECTED]: {
            label: 'رد نهایی اعتبارسنج',
            icon: '❌',
            cls: 'error',
            color: '#c0392b',
            description: 'اعتبارسنج سفته‌ها را رد کرد',
            phase: 'final_verification',
            order: 8,
            responsibleRole: 'applicant'
        },
        [STATUSES.AWAITING_BROKER_REVIEW]: {
            label: 'در انتظار کارگزار',
            icon: '🤝',
            cls: 'pending',
            color: '#e67e22',
            description: 'در انتظار بررسی کارگزار (مرحله ۱)',
            phase: 'broker',
            order: 9,
            responsibleRole: 'broker_admin',
            locked: true
        },
        [STATUSES.AWAITING_BROKER_ADMIN_REVIEW]: {
            label: 'در انتظار ادمین کارگزار',
            icon: '🤝',
            cls: 'pending',
            color: '#e67e22',
            description: 'در انتظار بررسی ادمین کارگزار (alias)',
            phase: 'broker',
            order: 9,
            responsibleRole: 'broker_admin',
            locked: true
        },
        [STATUSES.BROKER_REVIEW_APPROVED]: {
            label: 'تأیید کارگزار',
            icon: '✅',
            cls: 'success',
            color: '#1e8e4a',
            description: 'کارگزار تأیید کرد (مرحله ۱)',
            phase: 'broker',
            order: 10,
            responsibleRole: 'legal_admin'
        },
        [STATUSES.BROKER_REVIEW_REJECTED]: {
            label: 'رد کارگزار',
            icon: '❌',
            cls: 'error',
            color: '#c0392b',
            description: 'کارگزار رد کرد',
            phase: 'broker',
            order: 10,
            responsibleRole: 'applicant'
        },
        // 🆕 v3.2: حقوقی
        [STATUSES.LEGAL_DRAFT_PENDING]: {
            label: 'در انتظار تنظیم پیش‌نویس',
            icon: '⚖️',
            cls: 'pending',
            color: '#e67e22',
            description: 'مدیر کل تأیید کرد — منتظر تنظیم پیش‌نویس حقوقی',
            phase: 'legal',
            order: 11,
            responsibleRole: 'legal_admin',
            locked: true
        },
        [STATUSES.AWAITING_LEGAL_DRAFT]: {
            label: 'در انتظار حقوقی',
            icon: '⚖️',
            cls: 'pending',
            color: '#e67e22',
            description: 'در انتظار تنظیم پیش‌نویس',
            phase: 'legal',
            order: 11,
            responsibleRole: 'legal_admin',
            locked: true
        },
        [STATUSES.LEGAL_DRAFT_READY]: {
            label: 'پیش‌نویس آماده',
            icon: '📄',
            cls: 'success',
            color: '#1e8e4a',
            description: 'پیش‌نویس قرارداد آماده است',
            phase: 'legal',
            order: 12,
            responsibleRole: 'super_admin'
        },
        // 🆕 v3.2: مدیر کل تأیید پیش‌نویس
        [STATUSES.CONTRACT_REVIEW_PENDING_SUPERADMIN]: {
            label: 'در انتظار تأیید پیش‌نویس',
            icon: '👑',
            cls: 'pending',
            color: '#d4a62a',
            description: 'پیش‌نویس آماده — منتظر تأیید مدیر کل',
            phase: 'legal',
            order: 13,
            responsibleRole: 'super_admin',
            locked: true
        },
        [STATUSES.CONTRACT_REVIEW_APPROVED]: {
            label: 'تأیید پیش‌نویس توسط مدیر کل',
            icon: '✅',
            cls: 'success',
            color: '#1e8e4a',
            description: 'پیش‌نویس تأیید شد — آماده برای متقاضی',
            phase: 'legal',
            order: 14,
            responsibleRole: 'applicant'
        },
        [STATUSES.CONTRACT_REVIEW_REJECTED]: {
            label: 'رد پیش‌نویس',
            icon: '❌',
            cls: 'error',
            color: '#c0392b',
            description: 'مدیر کل پیش‌نویس را رد کرد',
            phase: 'legal',
            order: 14,
            responsibleRole: 'legal_admin'
        },
        [STATUSES.AWAITING_BROKER_DRAFT_APPROVAL]: {
            label: 'در انتظار تأیید کارگزار',
            icon: '✍️',
            cls: 'pending',
            color: '#e67e22',
            description: 'در انتظار تأیید پیش‌نویس توسط کارگزار',
            phase: 'legal',
            order: 15,
            responsibleRole: 'broker_admin',
            locked: true
        },
        [STATUSES.BROKER_DRAFT_APPROVED]: {
            label: 'تأیید پیش‌نویس',
            icon: '✅',
            cls: 'success',
            color: '#1e8e4a',
            description: 'کارگزار پیش‌نویس را تأیید کرد (مرحله ۳)',
            phase: 'legal',
            order: 16,
            responsibleRole: 'applicant'
        },
        [STATUSES.AWAITING_APPLICANT_DRAFT]: {
            label: 'در انتظار متقاضی',
            icon: '👁️',
            cls: 'progress',
            color: '#2980b9',
            description: 'در انتظار مطالعه و تأیید متقاضی',
            phase: 'legal',
            order: 17,
            responsibleRole: 'applicant'
        },
        [STATUSES.APPLICANT_DRAFT_APPROVED]: {
            label: 'تأیید متقاضی',
            icon: '✅',
            cls: 'success',
            color: '#1e8e4a',
            description: 'متقاضی پیش‌نویس را تأیید کرد (مرحله ۵)',
            phase: 'legal',
            order: 18,
            responsibleRole: 'applicant'
        },
        [STATUSES.AWAITING_SIGNATURE]: {
            label: 'در انتظار امضا',
            icon: '✍️',
            cls: 'pending',
            color: '#e67e22',
            description: 'در انتظار امضای قرارداد',
            phase: 'signature',
            order: 19,
            responsibleRole: 'applicant',
            locked: true
        },
        [STATUSES.APPLICANT_SIGNED]: {
            label: 'متقاضی امضا کرد',
            icon: '✍️',
            cls: 'progress',
            color: '#2980b9',
            description: 'متقاضی امضا کرد — منتظر کارگزار و مدیر کل',
            phase: 'signature',
            order: 20,
            responsibleRole: 'broker_admin'
        },
        [STATUSES.CONTRACT_SIGNED]: {
            label: 'قرارداد امضا شد',
            icon: '✅',
            cls: 'success',
            color: '#1e8e4a',
            description: 'قرارداد توسط طرفین امضا شد',
            phase: 'signature',
            order: 21,
            responsibleRole: 'applicant'
        },
        [STATUSES.PAYMENT_PENDING]: {
            label: 'در انتظار پرداخت',
            icon: '💳',
            cls: 'pending',
            color: '#e67e22',
            description: 'در انتظار پرداخت امانی',
            phase: 'payment',
            order: 22,
            responsibleRole: 'applicant'
        },
        [STATUSES.PAYMENT_IN_ESCROW]: {
            label: 'پرداخت امانی',
            icon: '🏦',
            cls: 'progress',
            color: '#2980b9',
            description: 'پرداخت در حساب امانی',
            phase: 'payment',
            order: 23,
            responsibleRole: 'broker'
        },
        [STATUSES.BROKER_TRANSFERRED]: {
            label: 'انتقال حق',
            icon: '📤',
            cls: 'progress',
            color: '#2980b9',
            description: 'کارگزار حق تسهیلات را منتقل کرد',
            phase: 'payment',
            order: 24,
            responsibleRole: 'super_admin'
        },
        [STATUSES.SUPER_ADMIN_VERIFIED]: {
            label: 'تأیید مدیر کل',
            icon: '👑',
            cls: 'progress',
            color: '#d4a62a',
            description: 'مدیر کل تأیید کرد',
            phase: 'payment',
            order: 25,
            responsibleRole: 'applicant'
        },
        [STATUSES.APPLICANT_CONFIRMED]: {
            label: 'تأیید دریافت',
            icon: '✅',
            cls: 'progress',
            color: '#1e8e4a',
            description: 'متقاضی دریافت را تأیید کرد',
            phase: 'payment',
            order: 26,
            responsibleRole: 'applicant'
        },
        [STATUSES.AWAITING_DECLARATION]: {
            label: 'در انتظار اقرار',
            icon: '📜',
            cls: 'pending',
            color: '#e67e22',
            description: 'در انتظار اقرار سه‌طرفه',
            phase: 'declaration',
            order: 27,
            responsibleRole: 'applicant'
        },
        [STATUSES.DECLARATION_SIGNED]: {
            label: 'اقرار امضا شد',
            icon: '✅',
            cls: 'progress',
            color: '#1e8e4a',
            description: 'اقرار سه‌طرفه امضا شد',
            phase: 'declaration',
            order: 28,
            responsibleRole: 'legal_admin'
        },
        [STATUSES.AWAITING_LEGAL_REVIEW]: {
            label: 'در انتظار حقوقی',
            icon: '⚖️',
            cls: 'progress',
            color: '#2980b9',
            description: 'در انتظار بررسی نهایی حقوقی',
            phase: 'final_review',
            order: 29,
            responsibleRole: 'legal_admin'
        },
        [STATUSES.AWAITING_ACCOUNTING_REVIEW]: {
            label: 'در انتظار حسابداری',
            icon: '💰',
            cls: 'progress',
            color: '#2980b9',
            description: 'در انتظار بررسی نهایی حسابداری',
            phase: 'final_review',
            order: 30,
            responsibleRole: 'accounting_admin'
        },
        [STATUSES.PAYMENT_RELEASED]: {
            label: 'آزادسازی وجه',
            icon: '💸',
            cls: 'success',
            color: '#1e8e4a',
            description: 'وجه آزاد شد',
            phase: 'final',
            order: 31,
            responsibleRole: 'applicant'
        },
        [STATUSES.COMPLETED]: {
            label: 'تکمیل‌شده',
            icon: '🎉',
            cls: 'success',
            color: '#1e8e4a',
            description: 'پرونده تکمیل و بایگانی شد',
            phase: 'final',
            order: 32,
            responsibleRole: null
        },
        [STATUSES.REJECTED]: {
            label: 'ردشده',
            icon: '❌',
            cls: 'error',
            color: '#c0392b',
            description: 'پرونده رد شد',
            phase: 'closed',
            order: 100,
            responsibleRole: null
        },
        [STATUSES.REFUNDED]: {
            label: 'عودت داده شد',
            icon: '↩️',
            cls: 'error',
            color: '#c0392b',
            description: 'وجه عودت شد',
            phase: 'closed',
            order: 101,
            responsibleRole: null
        }
    };

    // ============================================================
    //  🔄  نقشه‌ی انتقال‌ها (v3.2)
    // ============================================================

    const TRANSITIONS = {
        [STATUSES.DRAFT]: [
            STATUSES.AWAITING_CONSULTATION,
            STATUSES.AWAITING_BROKER_ADMIN_REVIEW
        ],
        [STATUSES.AWAITING_CONSULTATION]: [
            STATUSES.CONSULTATION_APPROVED,
            STATUSES.AWAITING_BROKER_ADMIN_REVIEW,
            STATUSES.CONSULTATION_REJECTED
        ],
        [STATUSES.CONSULTATION_APPROVED]: [
            STATUSES.UNDER_VERIFICATION,
            STATUSES.AWAITING_BROKER_ADMIN_REVIEW
        ],
        [STATUSES.CONSULTATION_REJECTED]: [
            STATUSES.DRAFT
        ],
        [STATUSES.UNDER_VERIFICATION]: [
            STATUSES.VERIFICATION_APPROVED,
            STATUSES.VERIFICATION_REJECTED
        ],
        [STATUSES.VERIFICATION_APPROVED]: [
            STATUSES.AWAITING_FINALIZATION
        ],
        [STATUSES.VERIFICATION_REJECTED]: [
            STATUSES.DRAFT
        ],
        [STATUSES.AWAITING_FINALIZATION]: [
            STATUSES.FINALIZATION_COMPLETE
        ],
        // 🆕 v3.2: تکمیل → تأیید نهایی اعتبارسنج (نه کارگزار!)
        [STATUSES.FINALIZATION_COMPLETE]: [
            STATUSES.AWAITING_FINAL_VERIFICATION
        ],
        // 🆕 v3.2: تأیید نهایی اعتبارسنج
        [STATUSES.AWAITING_FINAL_VERIFICATION]: [
            STATUSES.VERIFICATION_COMPLETE_PENDING_SUPERADMIN,
            STATUSES.VERIFICATION_FINAL_REJECTED
        ],
        [STATUSES.VERIFICATION_COMPLETE_PENDING_SUPERADMIN]: [
            STATUSES.LEGAL_DRAFT_PENDING,
            STATUSES.VERIFICATION_FINAL_REJECTED
        ],
        [STATUSES.VERIFICATION_FINAL_REJECTED]: [
            STATUSES.AWAITING_FINALIZATION,
            STATUSES.DRAFT
        ],
        [STATUSES.AWAITING_BROKER_REVIEW]: [
            STATUSES.BROKER_REVIEW_APPROVED,
            STATUSES.BROKER_REVIEW_REJECTED
        ],
        [STATUSES.AWAITING_BROKER_ADMIN_REVIEW]: [
            STATUSES.BROKER_REVIEW_APPROVED,
            STATUSES.LEGAL_DRAFT_PENDING,
            STATUSES.BROKER_REVIEW_REJECTED,
            STATUSES.AWAITING_ACCOUNTING_REVIEW
        ],
        [STATUSES.BROKER_REVIEW_APPROVED]: [
            STATUSES.LEGAL_DRAFT_PENDING
        ],
        [STATUSES.BROKER_REVIEW_REJECTED]: [
            STATUSES.AWAITING_FINALIZATION,
            STATUSES.DRAFT
        ],
        // 🆕 v3.2: حقوقی
        [STATUSES.LEGAL_DRAFT_PENDING]: [
            STATUSES.LEGAL_DRAFT_READY
        ],
        [STATUSES.AWAITING_LEGAL_DRAFT]: [
            STATUSES.LEGAL_DRAFT_READY
        ],
        // 🆕 v3.2: آماده → منتظر مدیر کل
        [STATUSES.LEGAL_DRAFT_READY]: [
            STATUSES.CONTRACT_REVIEW_PENDING_SUPERADMIN
        ],
        [STATUSES.CONTRACT_REVIEW_PENDING_SUPERADMIN]: [
            STATUSES.CONTRACT_REVIEW_APPROVED,
            STATUSES.CONTRACT_REVIEW_REJECTED
        ],
        [STATUSES.CONTRACT_REVIEW_APPROVED]: [
            STATUSES.AWAITING_SIGNATURE,
            STATUSES.AWAITING_BROKER_DRAFT_APPROVAL
        ],
        [STATUSES.CONTRACT_REVIEW_REJECTED]: [
            STATUSES.LEGAL_DRAFT_PENDING
        ],
        [STATUSES.AWAITING_BROKER_DRAFT_APPROVAL]: [
            STATUSES.BROKER_DRAFT_APPROVED,
            STATUSES.LEGAL_DRAFT_PENDING
        ],
        [STATUSES.BROKER_DRAFT_APPROVED]: [
            STATUSES.AWAITING_APPLICANT_DRAFT
        ],
        [STATUSES.AWAITING_APPLICANT_DRAFT]: [
            STATUSES.APPLICANT_DRAFT_APPROVED
        ],
        [STATUSES.APPLICANT_DRAFT_APPROVED]: [
            STATUSES.AWAITING_SIGNATURE
        ],
        [STATUSES.AWAITING_SIGNATURE]: [
            STATUSES.APPLICANT_SIGNED
        ],
        [STATUSES.APPLICANT_SIGNED]: [
            STATUSES.CONTRACT_SIGNED
        ],
        [STATUSES.CONTRACT_SIGNED]: [
            STATUSES.PAYMENT_PENDING
        ],
        [STATUSES.PAYMENT_PENDING]: [
            STATUSES.PAYMENT_IN_ESCROW,
            STATUSES.REFUNDED
        ],
        [STATUSES.PAYMENT_IN_ESCROW]: [
            STATUSES.BROKER_TRANSFERRED,
            STATUSES.REFUNDED
        ],
        [STATUSES.BROKER_TRANSFERRED]: [
            STATUSES.SUPER_ADMIN_VERIFIED,
            STATUSES.REFUNDED
        ],
        [STATUSES.SUPER_ADMIN_VERIFIED]: [
            STATUSES.APPLICANT_CONFIRMED,
            STATUSES.REFUNDED
        ],
        [STATUSES.APPLICANT_CONFIRMED]: [
            STATUSES.AWAITING_DECLARATION,
            STATUSES.REFUNDED
        ],
        [STATUSES.AWAITING_DECLARATION]: [
            STATUSES.DECLARATION_SIGNED
        ],
        [STATUSES.DECLARATION_SIGNED]: [
            STATUSES.AWAITING_LEGAL_REVIEW
        ],
        [STATUSES.AWAITING_LEGAL_REVIEW]: [
            STATUSES.AWAITING_ACCOUNTING_REVIEW
        ],
        [STATUSES.AWAITING_ACCOUNTING_REVIEW]: [
            STATUSES.PAYMENT_RELEASED,
            STATUSES.BROKER_REVIEW_APPROVED
        ],
        [STATUSES.PAYMENT_RELEASED]: [
            STATUSES.COMPLETED
        ],
        [STATUSES.COMPLETED]: [],
        [STATUSES.REJECTED]: [],
        [STATUSES.REFUNDED]: []
    };

    // ============================================================
    //  👤  نقش‌های مجاز برای هر انتقال
    // ============================================================

    const TRANSITION_ROLES = {
        // مرحله ۱: مشاوره
        [`${STATUSES.DRAFT}>${STATUSES.AWAITING_CONSULTATION}`]: ['applicant', 'system'],
        [`${STATUSES.DRAFT}>${STATUSES.AWAITING_BROKER_ADMIN_REVIEW}`]: ['broker', 'system'],
        [`${STATUSES.AWAITING_CONSULTATION}>${STATUSES.CONSULTATION_APPROVED}`]: ['consultation_admin', 'super_admin'],
        [`${STATUSES.AWAITING_CONSULTATION}>${STATUSES.AWAITING_BROKER_ADMIN_REVIEW}`]: ['consultation_admin', 'super_admin'],
        [`${STATUSES.AWAITING_CONSULTATION}>${STATUSES.CONSULTATION_REJECTED}`]: ['consultation_admin', 'super_admin'],
        [`${STATUSES.CONSULTATION_REJECTED}>${STATUSES.DRAFT}`]: ['applicant', 'system'],
        [`${STATUSES.CONSULTATION_APPROVED}>${STATUSES.UNDER_VERIFICATION}`]: ['applicant', 'system'],
        [`${STATUSES.CONSULTATION_APPROVED}>${STATUSES.AWAITING_BROKER_ADMIN_REVIEW}`]: ['system', 'consultation_admin'],

        // مرحله ۲: اعتبارسنجی
        [`${STATUSES.UNDER_VERIFICATION}>${STATUSES.VERIFICATION_APPROVED}`]: ['verification_admin', 'super_admin'],
        [`${STATUSES.UNDER_VERIFICATION}>${STATUSES.VERIFICATION_REJECTED}`]: ['verification_admin', 'super_admin'],
        [`${STATUSES.VERIFICATION_REJECTED}>${STATUSES.DRAFT}`]: ['applicant', 'system'],
        [`${STATUSES.VERIFICATION_APPROVED}>${STATUSES.AWAITING_FINALIZATION}`]: ['system', 'applicant'],

        // مرحله ۳: تکمیل مدارک
        [`${STATUSES.AWAITING_FINALIZATION}>${STATUSES.FINALIZATION_COMPLETE}`]: ['applicant'],
        // 🆕 v3.2: تکمیل → تأیید نهایی اعتبارسنج
        [`${STATUSES.FINALIZATION_COMPLETE}>${STATUSES.AWAITING_FINAL_VERIFICATION}`]: ['applicant', 'system'],

        // 🆕 v3.2: تأیید نهایی اعتبارسنج
        [`${STATUSES.AWAITING_FINAL_VERIFICATION}>${STATUSES.VERIFICATION_COMPLETE_PENDING_SUPERADMIN}`]: ['verification_admin', 'super_admin'],
        [`${STATUSES.AWAITING_FINAL_VERIFICATION}>${STATUSES.VERIFICATION_FINAL_REJECTED}`]: ['verification_admin', 'super_admin'],
        [`${STATUSES.VERIFICATION_COMPLETE_PENDING_SUPERADMIN}>${STATUSES.LEGAL_DRAFT_PENDING}`]: ['super_admin'],
        [`${STATUSES.VERIFICATION_COMPLETE_PENDING_SUPERADMIN}>${STATUSES.VERIFICATION_FINAL_REJECTED}`]: ['super_admin'],
        [`${STATUSES.VERIFICATION_FINAL_REJECTED}>${STATUSES.AWAITING_FINALIZATION}`]: ['applicant', 'system'],
        [`${STATUSES.VERIFICATION_FINAL_REJECTED}>${STATUSES.DRAFT}`]: ['applicant', 'system'],

        // مرحله ۴: کارگزار (مسیر قدیمی، هنوز فعال)
        [`${STATUSES.AWAITING_BROKER_REVIEW}>${STATUSES.BROKER_REVIEW_APPROVED}`]: ['broker_admin', 'super_admin'],
        [`${STATUSES.AWAITING_BROKER_REVIEW}>${STATUSES.BROKER_REVIEW_REJECTED}`]: ['broker_admin', 'super_admin'],
        [`${STATUSES.AWAITING_BROKER_ADMIN_REVIEW}>${STATUSES.BROKER_REVIEW_APPROVED}`]: ['broker_admin', 'super_admin'],
        [`${STATUSES.AWAITING_BROKER_ADMIN_REVIEW}>${STATUSES.LEGAL_DRAFT_PENDING}`]: ['broker_admin', 'super_admin'],
        [`${STATUSES.AWAITING_BROKER_ADMIN_REVIEW}>${STATUSES.BROKER_REVIEW_REJECTED}`]: ['broker_admin', 'super_admin'],
        [`${STATUSES.AWAITING_BROKER_ADMIN_REVIEW}>${STATUSES.AWAITING_ACCOUNTING_REVIEW}`]: ['broker_admin', 'super_admin'],
        [`${STATUSES.BROKER_REVIEW_REJECTED}>${STATUSES.AWAITING_FINALIZATION}`]: ['applicant', 'system'],
        [`${STATUSES.BROKER_REVIEW_REJECTED}>${STATUSES.DRAFT}`]: ['applicant', 'system'],
        [`${STATUSES.BROKER_REVIEW_APPROVED}>${STATUSES.LEGAL_DRAFT_PENDING}`]: ['broker_admin', 'system'],

        // 🆕 v3.2: حقوقی
        [`${STATUSES.LEGAL_DRAFT_PENDING}>${STATUSES.LEGAL_DRAFT_READY}`]: ['legal_admin', 'super_admin'],
        [`${STATUSES.AWAITING_LEGAL_DRAFT}>${STATUSES.LEGAL_DRAFT_READY}`]: ['legal_admin', 'super_admin'],
        [`${STATUSES.LEGAL_DRAFT_READY}>${STATUSES.CONTRACT_REVIEW_PENDING_SUPERADMIN}`]: ['legal_admin', 'system'],
        [`${STATUSES.CONTRACT_REVIEW_PENDING_SUPERADMIN}>${STATUSES.CONTRACT_REVIEW_APPROVED}`]: ['super_admin'],
        [`${STATUSES.CONTRACT_REVIEW_PENDING_SUPERADMIN}>${STATUSES.CONTRACT_REVIEW_REJECTED}`]: ['super_admin'],
        [`${STATUSES.CONTRACT_REVIEW_APPROVED}>${STATUSES.AWAITING_SIGNATURE}`]: ['applicant', 'system'],
        [`${STATUSES.CONTRACT_REVIEW_APPROVED}>${STATUSES.AWAITING_BROKER_DRAFT_APPROVAL}`]: ['system'],
        [`${STATUSES.CONTRACT_REVIEW_REJECTED}>${STATUSES.LEGAL_DRAFT_PENDING}`]: ['legal_admin', 'super_admin'],

        [`${STATUSES.AWAITING_BROKER_DRAFT_APPROVAL}>${STATUSES.BROKER_DRAFT_APPROVED}`]: ['broker_admin', 'super_admin'],
        [`${STATUSES.AWAITING_BROKER_DRAFT_APPROVAL}>${STATUSES.LEGAL_DRAFT_PENDING}`]: ['broker_admin', 'system'],
        [`${STATUSES.BROKER_DRAFT_APPROVED}>${STATUSES.AWAITING_APPLICANT_DRAFT}`]: ['system', 'broker_admin'],
        [`${STATUSES.AWAITING_APPLICANT_DRAFT}>${STATUSES.APPLICANT_DRAFT_APPROVED}`]: ['applicant'],
        [`${STATUSES.APPLICANT_DRAFT_APPROVED}>${STATUSES.AWAITING_SIGNATURE}`]: ['applicant', 'system'],

        // مرحله ۵: امضا
        [`${STATUSES.AWAITING_SIGNATURE}>${STATUSES.APPLICANT_SIGNED}`]: ['applicant', 'system'],
        [`${STATUSES.APPLICANT_SIGNED}>${STATUSES.CONTRACT_SIGNED}`]: ['broker_admin', 'super_admin'],
        [`${STATUSES.CONTRACT_SIGNED}>${STATUSES.PAYMENT_PENDING}`]: ['system', 'applicant'],

        // مرحله ۶: پرداخت
        [`${STATUSES.PAYMENT_PENDING}>${STATUSES.PAYMENT_IN_ESCROW}`]: ['applicant', 'system'],
        [`${STATUSES.PAYMENT_PENDING}>${STATUSES.REFUNDED}`]: ['super_admin', 'accounting_admin'],
        [`${STATUSES.PAYMENT_IN_ESCROW}>${STATUSES.BROKER_TRANSFERRED}`]: ['broker', 'broker_admin'],
        [`${STATUSES.PAYMENT_IN_ESCROW}>${STATUSES.REFUNDED}`]: ['super_admin', 'accounting_admin'],
        [`${STATUSES.BROKER_TRANSFERRED}>${STATUSES.SUPER_ADMIN_VERIFIED}`]: ['super_admin'],
        [`${STATUSES.BROKER_TRANSFERRED}>${STATUSES.REFUNDED}`]: ['super_admin'],
        [`${STATUSES.SUPER_ADMIN_VERIFIED}>${STATUSES.APPLICANT_CONFIRMED}`]: ['applicant'],
        [`${STATUSES.SUPER_ADMIN_VERIFIED}>${STATUSES.REFUNDED}`]: ['super_admin'],
        [`${STATUSES.APPLICANT_CONFIRMED}>${STATUSES.AWAITING_DECLARATION}`]: ['applicant', 'system'],
        [`${STATUSES.APPLICANT_CONFIRMED}>${STATUSES.REFUNDED}`]: ['super_admin'],

        // مرحله ۷: اقرار
        [`${STATUSES.AWAITING_DECLARATION}>${STATUSES.DECLARATION_SIGNED}`]: ['applicant', 'broker'],
        [`${STATUSES.DECLARATION_SIGNED}>${STATUSES.AWAITING_LEGAL_REVIEW}`]: ['system', 'super_admin'],

        // مرحله ۸: بررسی نهایی
        [`${STATUSES.AWAITING_LEGAL_REVIEW}>${STATUSES.AWAITING_ACCOUNTING_REVIEW}`]: ['legal_admin', 'super_admin'],
        [`${STATUSES.AWAITING_ACCOUNTING_REVIEW}>${STATUSES.PAYMENT_RELEASED}`]: ['accounting_admin', 'super_admin'],
        [`${STATUSES.AWAITING_ACCOUNTING_REVIEW}>${STATUSES.BROKER_REVIEW_APPROVED}`]: ['accounting_admin', 'super_admin'],
        [`${STATUSES.PAYMENT_RELEASED}>${STATUSES.COMPLETED}`]: ['system', 'super_admin'],

        // رد و عودت
        reject: ['super_admin', 'deputy_admin', 'broker_admin', 'accounting_admin', 'legal_admin', 'consultation_admin', 'verification_admin'],
        refund: ['super_admin', 'accounting_admin']
    };

    // ============================================================
    //  ✅  APIهای اصلی
    // ============================================================

    function canTransition(fromStatus, toStatus, role = null) {
        if (!STATUS_META[fromStatus]) {
            return { ok: false, error: `وضعیت مبدأ نامعتبر: ${fromStatus}` };
        }
        if (!STATUS_META[toStatus]) {
            return { ok: false, error: `وضعیت مقصد نامعتبر: ${toStatus}` };
        }

        const allowed = TRANSITIONS[fromStatus] || [];
        if (!allowed.includes(toStatus)) {
            return {
                ok: false,
                error: `انتقال از «${STATUS_META[fromStatus].label}» به «${STATUS_META[toStatus].label}» مجاز نیست`
            };
        }

        if (role) {
            const key = `${fromStatus}>${toStatus}`;
            const allowedRoles = TRANSITION_ROLES[key];
            if (allowedRoles && !allowedRoles.includes(role)) {
                return {
                    ok: false,
                    error: `نقش «${role}» اجازه‌ی این انتقال را ندارد`
                };
            }
        }

        return { ok: true };
    }

    function transition(caseObj, toStatus, options = {}) {
        if (!caseObj || !caseObj.status) {
            return { ok: false, error: 'پرونده‌ی نامعتبر' };
        }

        const fromStatus = caseObj.status;
        const role = options.role || getCurrentRole();

        const check = canTransition(fromStatus, toStatus, role);
        if (!check.ok) return check;

        const transitionRecord = {
            from: fromStatus,
            to: toStatus,
            at: new Date().toISOString(),
            by: options.actor || options.by || getCurrentActor(),
            role,
            note: options.note || null,
            meta: options.meta || null
        };

        const history = caseObj.stateHistory || [];
        history.push(transitionRecord);

        const updated = {
            ...caseObj,
            status: toStatus,
            stateHistory: history,
            updatedAt: new Date().toISOString()
        };

        console.log(`🔄 [StateMachine v3.2] ${fromStatus} → ${toStatus} | case: ${caseObj.caseNumber || caseObj.id}`);

        return { ok: true, ...updated, case: updated, transition: transitionRecord };
    }

    // ============================================================
    //  🔍  توابع کمکی
    // ============================================================

    function getCurrentRole() {
        try {
            const cu = JSON.parse(localStorage.getItem('wamPayCurrentUser') || 'null');
            return cu?.role || 'system';
        } catch { return 'system'; }
    }

    function getCurrentActor() {
        try {
            const cu = JSON.parse(localStorage.getItem('wamPayCurrentUser') || 'null');
            if (!cu) return { role: 'system', name: 'سیستم', id: null };
            return {
                id: cu.id,
                role: cu.role,
                name: cu.name || `${cu.firstName || ''} ${cu.lastName || ''}`.trim() || '—'
            };
        } catch {
            return { role: 'system', name: 'سیستم', id: null };
        }
    }

    function getStatusMeta(status) {
        return STATUS_META[status] || {
            label: 'نامشخص',
            icon: '❓',
            cls: 'default',
            color: '#6b7d73',
            description: 'وضعیت نامشخص',
            phase: 'unknown',
            order: 999
        };
    }

    function getStatusLabel(status) { return getStatusMeta(status).label; }
    function getStatusIcon(status) { return getStatusMeta(status).icon; }
    function getStatusColor(status) { return getStatusMeta(status).color; }
    function getStatusClass(status) { return getStatusMeta(status).cls; }
    function getResponsibleRole(status) { return getStatusMeta(status).responsibleRole || null; }
    function isLocked(status) { return !!getStatusMeta(status).locked; }

    function isFinalStatus(status) {
        return [STATUSES.COMPLETED, STATUSES.REJECTED, STATUSES.REFUNDED].includes(status);
    }

    function isSuccessStatus(status) { return status === STATUSES.COMPLETED; }
    function isErrorStatus(status) { return [STATUSES.REJECTED, STATUSES.REFUNDED, STATUSES.VERIFICATION_FINAL_REJECTED, STATUSES.CONTRACT_REVIEW_REJECTED].includes(status); }
    function isActiveStatus(status) { return !isFinalStatus(status) && status !== STATUSES.DRAFT; }

    function getProgressPercent(status) {
        const steps = getPathSteps().map(s => s.status);
        const idx = steps.indexOf(status);
        if (idx < 0) return isErrorStatus(status) ? 100 : 0;
        return Math.round((idx / (steps.length - 1)) * 100);
    }

    function getPathSteps() {
        const seen = new Set();
        return Object.entries(STATUS_META)
            .filter(([_, meta]) => meta.order < 100)
            .filter(([status]) => {
                // alias ها رو حذف کن
                if (status === STATUSES.AWAITING_BROKER_ADMIN_REVIEW) return false;
                if (status === STATUSES.AWAITING_LEGAL_DRAFT) return false;
                if (status === STATUSES.AWAITING_BROKER_REVIEW) return false;
                if (status === STATUSES.BROKER_DRAFT_APPROVED) return false;
                if (status === STATUSES.AWAITING_APPLICANT_DRAFT) return false;
                if (status === STATUSES.APPLICANT_DRAFT_APPROVED) return false;
                if (status === STATUSES.AWAITING_BROKER_DRAFT_APPROVAL) return false;
                if (seen.has(meta?.order)) return false;
                seen.add(meta?.order);
                return true;
            })
            .sort((a, b) => a[1].order - b[1].order)
            .map(([status, meta]) => ({ status, ...meta }));
    }

    function getNextStatuses(currentStatus) {
        return TRANSITIONS[currentStatus] || [];
    }

    function getNextStatusForRole(currentStatus, role) {
        const nexts = getNextStatuses(currentStatus);
        for (const next of nexts) {
            const key = `${currentStatus}>${next}`;
            const allowed = TRANSITION_ROLES[key] || [];
            if (allowed.includes(role)) return next;
        }
        return null;
    }

    function getAllStatuses() {
        return Object.entries(STATUS_META).map(([status, meta]) => ({ status, ...meta }));
    }

    function getStatistics(cases) {
        const stats = {
            total: cases.length,
            byStatus: {},
            byPhase: {}
        };

        cases.forEach(c => {
            stats.byStatus[c.status] = (stats.byStatus[c.status] || 0) + 1;
            const meta = STATUS_META[c.status] || {};
            if (meta.phase) {
                stats.byPhase[meta.phase] = (stats.byPhase[meta.phase] || 0) + 1;
            }
        });

        return stats;
    }

    // ============================================================
    //  📤  Export
    // ============================================================

    global.WamPayStateMachine = {
        STATUSES,
        STATUS_META,
        TRANSITIONS,
        TRANSITION_ROLES,
        canTransition,
        transition,
        getCurrentRole,
        getCurrentActor,
        getStatusMeta,
        getStatusLabel,
        getStatusIcon,
        getStatusColor,
        getStatusClass,
        getResponsibleRole,
        isLocked,
        isFinalStatus,
        isSuccessStatus,
        isErrorStatus,
        isActiveStatus,
        getProgressPercent,
        getPathSteps,
        getNextStatuses,
        getNextStatusForRole,
        getAllStatuses,
        getStatistics
    };

    console.log('%c🔄 WAM PAY — Case State Machine v3.2', 'color:#0b3b23;font-weight:bold;font-size:13px;');
    console.log('%c📋 ۳۵+ وضعیت | 🔒 قفل کامل | 🎯 مسیر جدید واقعی', 'color:#d4a62a;font-weight:bold;');
    console.log('%c🆕 v3.2: awaiting_final_verification + verification_complete_pending_superadmin + legal_draft_pending', 'color:#1e8e4a;font-weight:bold;');

})(typeof window !== 'undefined' ? window : this);