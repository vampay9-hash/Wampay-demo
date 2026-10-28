// ==========================================
// وام پی — Applicant Wizard v15.2.0
// 🆕 v15.2.0 (2026-10-27): Fix status انتقال از contract_review_approved مستقیم به awaiting_signature (بدون بازگشت به مدیر کل)
// ==========================================

(function () {
    'use strict';

    if (window.location.search.includes("continue=true")) {
        localStorage.removeItem("wamPayApplications");
        localStorage.removeItem("wamPayDraft");
        console.log("🧹 [Wizard] حافظه قدیمی پاک شد.");
    }

    if (!window.WamPayAuth) { console.error('❌ permissions.js'); return; }
    if (!window.WamPayApplicantStore) { console.error('❌ applicant-store.js'); return; }
    if (!window.WamPayTrust) { console.error('❌ trust-service.js'); return; }

    const Auth = window.WamPayAuth;
    const Store = window.WamPayApplicantStore;
    const Trust = window.WamPayTrust;

    const currentUser = Auth.getCurrentUser();
    if (!currentUser) {
        sessionStorage.setItem('wamPayLoginMessage', 'برای ثبت درخواست ابتدا وارد شوید.');
        window.location.replace('login.html');
        return;
    }
    if (currentUser.role !== 'applicant') {
        alert('این صفحه فقط برای متقاضیان است.');
        window.location.replace(Auth.getRoleDashboard(currentUser.role));
        return;
    }

    // ==========================================
    // 🆕 v15.0.0: لیست statusهای باز (برای Duplicate Fix)
    // ==========================================
    const OPEN_STATUSES = [
        'draft',
        'awaiting_consultation',
        'consultation_approved',
        'consultation_rejected',
        'under_verification',
        'verification_pending',
        'verification_rejected',
        'verification_approved',
        'awaiting_verification_final_review',
        'verification_complete_pending_superadmin',
        'legal_draft_pending',
        'legal_draft_ready',
        'broker_draft_approved',
        'applicant_draft_approved',
        'contract_review_pending_superadmin',
        'contract_review_approved',
        'awaiting_signature',
        'applicant_signed',
        'contract_signed',
        'payment_pending',
        'payment_in_escrow',
        'broker_transferred',
        'super_admin_verified',
        'applicant_confirmed',
        'awaiting_declaration',
        'declaration_signed',
        'payment_released'
    ];

    // ==========================================
    // ⚙️ ثابت‌ها
    // ==========================================
    const BANK_LOANS = [
        { id: 'resalat', name: 'رسالت', description: 'وام قرض‌الحسنه بانک رسالت' },
        { id: 'mehr',    name: 'مهر',   description: 'وام قرض‌الحسنه بانک مهر ایران', disabled: true },
        { id: 'sepah',   name: 'سپه',   description: 'وام بانک سپه', disabled: true },
        { id: 'melli',   name: 'ملی',   description: 'وام بانک ملی ایران', disabled: true }
    ];

    const LOAN_LIMITS = { min: 10000000, max: 500000000 };
    const MIN_INSTALLMENT_LIMIT = 100000;
    const RATING_CAPTIONS = ['', 'خیلی ضعیف', 'ضعیف', 'متوسط', 'خوب', 'عالی'];

    const FILE_LIMITS = {
        maxSizeMB: 2,
        maxSizeBytes: 2 * 1024 * 1024,
        allowedMimes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
        allowedExts: ['jpg', 'jpeg', 'png', 'pdf']
    };

    const CHECK_FILE_LIMITS = {
        maxSizeMB: 3,
        maxSizeBytes: 3 * 1024 * 1024,
        allowedMimes: ['image/jpeg', 'image/jpg', 'image/png'],
        allowedExts: ['jpg', 'jpeg', 'png']
    };

    const SMS_FILE_LIMITS = {
        maxSizeMB: 3,
        maxSizeBytes: 3 * 1024 * 1024,
        allowedMimes: ['image/jpeg', 'image/jpg', 'image/png'],
        allowedExts: ['jpg', 'jpeg', 'png']
    };

    const STEP8_STAGES = [
        { key: 'summary',          icon: '📋', label: 'خلاصه مالی' },
        { key: 'invoice',          icon: '📄', label: 'فاکتور' },
        { key: 'gateway',          icon: '💳', label: 'درگاه پرداخت' },
        { key: 'waitBroker',       icon: '⏳', label: 'انتظار کارگزار' },
        { key: 'superAdminVerify', icon: '🏛️', label: 'تأیید مدیر کل' },
        { key: 'applicantConfirm', icon: '✅', label: 'تأیید متقاضی' }
    ];

    const STEP9_STAGES = [
        { key: 'applicantDeclaration', icon: '✍️', label: 'اقرار متقاضی' },
        { key: 'brokerDeclaration',    icon: '🤝', label: 'اقرار کارگزار' },
        { key: 'release',              icon: '💰', label: 'آزادسازی وجه' }
    ];

    const STEP10_STAGES = [
        { key: 'archive', icon: '📦', label: 'سند بایگانی' },
        { key: 'final',   icon: '🎉', label: 'اتمام پرونده' }
    ];

    const JOB_TO_CATEGORY = {
        'کارمند دولتی': 'public_employee', 'کارمند تعاونی': 'public_employee', 'معلم': 'public_employee',
        'کارمند خصوصی': 'private_employee', 'کارگر': 'contract_worker',
        'آزاد': 'business_owner', 'کشاورز': 'business_owner',
        'بازنشسته': 'retired', 'راننده': 'driver', 'صاحب شرکت': 'company_owner',
        'پزشک': 'licensed_pro', 'وکیل': 'licensed_pro',
        'دانشجو': 'other', 'خانه‌دار': 'other', 'بیکار': 'other', 'سایر': 'other'
    };

    const CATEGORIES = {
        public_employee: { icon: '🏛️', title: 'کارمندان دولتی', sub: 'دولتی، تعاونی، آموزش و پرورش', docs: [
            { id: 'payslip', title: 'عکس فیش حقوقی ماه قبل', required: true, desc: 'آخرین فیش حقوقی' },
            { id: 'hakm', title: 'حکم کارگزینی (رسمی)', required: true, desc: 'حکم یا ابلاغ رسمی' },
            { id: 'bank_stmt', title: 'گردش حساب ۳ ماه اخیر', required: true, desc: 'PDF زیر ۲ مگابایت' }
        ]},
        private_employee: { icon: '🏢', title: 'کارمندان بخش خصوصی', sub: 'شرکت‌های خصوصی', docs: [
            { id: 'payslip', title: 'عکس فیش حقوقی', required: true, desc: 'آخرین فیش' },
            { id: 'hakm', title: 'حکم / گواهی اشتغال', required: true, desc: 'از شرکت' },
            { id: 'insurance', title: 'سابقه بیمه تأمین اجتماعی', required: true, desc: 'پرینت سابقه' },
            { id: 'bank_stmt', title: 'گردش حساب ۳ ماه', required: true, desc: 'PDF زیر ۲MB' }
        ]},
        contract_worker: { icon: '👷', title: 'کارگران پیمانی', sub: 'با سابقه بیمه', docs: [
            { id: 'work_cert', title: 'گواهی اشتغال به کار', required: true, desc: 'از کارفرما' },
            { id: 'insurance', title: 'سابقه بیمه', required: true, desc: 'پرینت سابقه' },
            { id: 'bank_stmt', title: 'گردش حساب ۳ ماه', required: true, desc: 'PDF' }
        ]},
        business_owner: { icon: '🏪', title: 'اصناف و بازاریان', sub: 'کسب‌وکار شخصی و کشاورزی', docs: [
            { id: 'business_license', title: 'عکس اصل پروانه کسب', required: true, desc: 'پروانه معتبر' },
            { id: 'bank_stmt', title: 'گردش حساب ۳ ماه', required: true, desc: 'حساب متصل به کارتخوان' },
            { id: 'extra_optional', title: 'مستندات اختیاری', required: false, desc: 'سند ملک یا خودرو' }
        ]},
        retired: { icon: '👴', title: 'بازنشستگان', sub: 'با حکم بازنشستگی', docs: [
            { id: 'payslip', title: 'عکس فیش حقوقی', required: true, desc: 'فیش بازنشستگی' },
            { id: 'bank_stmt', title: 'گردش حساب ۳ ماه', required: true, desc: 'PDF' },
            { id: 'extra_job', title: 'مستندات شغل دوم', required: false, desc: 'در صورت وجود' }
        ]},
        driver: { icon: '🚗', title: 'رانندگان', sub: 'حمل و نقل و مسافرکشی', docs: [
            { id: 'driver_license', title: 'عکس گواهینامه', required: true, desc: 'صفحه اول' },
            { id: 'smart_card', title: 'عکس کارت هوشمند', required: true, desc: 'کارت راننده' },
            { id: 'bank_stmt', title: 'گردش حساب ۳ ماه', required: true, desc: 'PDF' },
            { id: 'vehicle_doc', title: 'سند خودرو', required: false, desc: 'اگر مالک' }
        ]},
        company_owner: { icon: '🏢', title: 'صاحبان شرکت', sub: 'مدیران و سهام‌داران', docs: [
            { id: 'company_charter', title: 'شرکت‌نامه', required: true, desc: 'ثبت‌شده' },
            { id: 'articles', title: 'اساسنامه شرکت', required: true, desc: 'رسمی' },
            { id: 'gazette', title: 'روزنامه رسمی', required: true, desc: 'آگهی ثبت' },
            { id: 'bank_stmt', title: 'گردش حساب ۳ ماه', required: true, desc: 'شرکت یا شخصی' }
        ]},
        licensed_pro: { icon: '⚕️', title: 'پروانه‌داران خاص', sub: 'پزشکان، وکلا، مهندسان', docs: [
            { id: 'license', title: 'عکس اصل پروانه', required: true, desc: 'وکالت/طبابت/اشتغال' },
            { id: 'bank_stmt', title: 'گردش حساب ۳ ماه', required: true, desc: 'PDF' }
        ]},
        other: { icon: '📁', title: 'دسته‌ی خاص', sub: 'مشاغل خاص یا خانه‌دار',
            warning: 'ارائه‌ی ضامن معتبر و مدارک تکمیلی ضروری است.', docs: [
            { id: 'id_extra', title: 'مدارک هویتی تکمیلی', required: true, desc: 'مدارک مرتبط' },
            { id: 'guarantor', title: 'مدارک ضامن', required: true, desc: 'کارت ملی + فیش ضامن' },
            { id: 'bank_stmt', title: 'گردش حساب', required: false, desc: 'در صورت وجود' }
        ]}
    };

    const FINAL_DOCS = [
        { id: 'promissory_borrower', title: 'سفته الکترونیکی وام‌گیرنده', desc: 'امضا شده توسط متقاضی' },
        { id: 'promissory_guarantor', title: 'سفته الکترونیکی ضامن', desc: 'امضا شده توسط ضامن' }
    ];

    const STEPS = [
        { key: 'identityAndJob', label: 'اطلاعات هویتی و شغلی', fields: [
            'firstName','lastName','nationalId','fatherName','birthDate','gender','militaryStatus',
            'phone','postalCode','address','jobType','employerName','position','workYears',
            'monthlyIncome','otherIncome','workPhone','workAddress'
        ]},
        { key: 'loanInfo', label: 'اطلاعات ثبت وام', fields: ['bankLoanType','loanAmount','minInstallment','maxInstallment']},
        { key: 'consultation', label: 'بررسی و مشاوره', fields: [] },
        { key: 'documents', label: 'ارسال مدارک', fields: [] },
        { key: 'finalization', label: 'تکمیل و اعتبارسنجی', fields: ['finalBankAccount','paymentMethod'] },
        { key: 'contractReview', label: 'بررسی و تنظیم قرارداد واگذاری', fields: [] },
        { key: 'eSignature', label: 'امضای الکترونیکی قرارداد', fields: [] },
        { key: 'trustPayment', label: 'واگذاری وجه امانی', fields: [] },
        { key: 'declaration', label: 'اقرار و پرداخت به واگذارکننده', fields: [] },
        { key: 'archive', label: 'بایگانی و اتمام', fields: [] }
    ];

    const ESIG_STAGE_DEFS = {
        summary:    { icon: '📋', label: 'خلاصه' },
        commitment: { icon: '⚖️', label: 'تعهد' },
        otp:        { icon: '🔐', label: 'هویت' },
        checkInfo:  { icon: '📄', label: 'اطلاعات چک' },
        signature:  { icon: '✍️', label: 'امضا' },
        review:     { icon: '👁️', label: 'بازبینی' },
        chain:      { icon: '🔗', label: 'زنجیره' },
        issue:      { icon: '🎉', label: 'صدور' }
    };

    let eSigStageKeys = [];
    let currentStep = 0;
    let application = null;

    let eSigStage = 0;
    let eSigCanvas = null;
    let eSigCtx = null;
    let eSigDrawing = false;
    let eSigLastPoint = null;
    let eSigDotCount = 0;
    let eSigOTPCode = null;
    let eSigOTPExpiresAt = 0;
    let eSigOTPExpireTimer = null;
    let eSigChainedRunning = false;

    let step8Stage = 0;
    let step8WaitTimer = null;
    let step8BrokerAutoTimer = null;
    let step8SuperAdminTimer = null;

    let step9Stage = 0;
    let declCanvas = null;
    let declCtx = null;
    let declDrawing = false;
    let declLastPoint = null;
    let declDotCount = 0;
    let declOTPVerified = false;
    let declOTPCode = null;
    let declOTPExpiresAt = 0;
    let declOTPExpireTimer = null;

    let step10Stage = 0;

    const panels = document.querySelectorAll('.step-panel');
    const progressFill = document.getElementById('progressFill');
    const stepNum = document.getElementById('stepNum');
    const stepLabel = document.getElementById('stepLabel');
    const stepsMini = document.getElementById('stepsMini');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const globalMsg = document.getElementById('globalMessage');
    const formWrap = document.getElementById('formWrap');
    const progressCard = document.getElementById('progressCard');
    const successScreen = document.getElementById('successScreen');

    // ==========================================
    // 🆕 v14.4.1 — سینک با Supabase (اصلاح‌شده)
    // ==========================================
    const DB_SYNC_ENABLED = !!(window.WAM_SB && window.WAM_SB.client);
    if (!DB_SYNC_ENABLED) {
        console.warn('⚠️ [Wizard DB] Supabase client لود نشده — فقط localStorage فعاله.');
    } else {
        console.log('✅ [Wizard DB] Supabase client آماده است.');
    }

    function stripHeavyFields(appData) {
        try {
            const clone = JSON.parse(JSON.stringify(appData || {}));

            ['documents', 'finalDocs'].forEach(bucket => {
                if (clone[bucket]) {
                    Object.keys(clone[bucket]).forEach(docId => {
                        const d = clone[bucket][docId];
                        if (d && d.dataUrl) {
                            const sizeKB = d.dataUrl.length / 1024;
                            if (sizeKB > 500) {
                                console.warn('⚠️ [DB] dataUrl >500KB حذف شد:', docId, sizeKB.toFixed(0) + 'KB');
                                delete d.dataUrl;
                            }
                        }
                    });
                }
            });

            if (clone.eSignature && clone.eSignature.checkInfo && clone.eSignature.checkInfo.imageDataUrl) {
                const sizeKB = clone.eSignature.checkInfo.imageDataUrl.length / 1024;
                if (sizeKB > 500) delete clone.eSignature.checkInfo.imageDataUrl;
            }
            if (clone.step8 && clone.step8.applicantConfirmation && clone.step8.applicantConfirmation.smsDoc) {
                const s = clone.step8.applicantConfirmation.smsDoc;
                if (s.dataUrl && (s.dataUrl.length / 1024) > 500) delete s.dataUrl;
            }

            if (clone.eSignature) {
                const es = clone.eSignature;
                if (es.applicantSignature && es.applicantSignature.imageDataUrl) {
                    if ((es.applicantSignature.imageDataUrl.length / 1024) > 500) delete es.applicantSignature.imageDataUrl;
                }
                if (es.brokerSignature && es.brokerSignature.imageDataUrl) {
                    if ((es.brokerSignature.imageDataUrl.length / 1024) > 500) delete es.brokerSignature.imageDataUrl;
                }
                if (es.superAdminSignature) {
                    if (es.superAdminSignature.imageDataUrl && (es.superAdminSignature.imageDataUrl.length / 1024) > 500)
                        delete es.superAdminSignature.imageDataUrl;
                    if (es.superAdminSignature.sealDataUrl && (es.superAdminSignature.sealDataUrl.length / 1024) > 500)
                        delete es.superAdminSignature.sealDataUrl;
                }
                if (es.finalContract && es.finalContract.dataUrl) {
                    if ((es.finalContract.dataUrl.length / 1024) > 500) delete es.finalContract.dataUrl;
                }
            }

            return clone;
        } catch (e) {
            console.warn('⚠️ [Wizard DB] stripHeavyFields error:', e);
            return appData || {};
        }
    }

    // 🆕 v15.0.0: syncApplicationToDB با حفظ user_id اصلی
    async function syncApplicationToDB() {
        if (!DB_SYNC_ENABLED) return;
        if (!application || !application.caseNumber) {
            console.warn('⚠️ [Wizard DB] application.caseNumber وجود ندارد.');
            return;
        }

        try {
            const d = application.data || {};
            const loanData = d.loanInfo || {};

            const loanType = loanData.bankLoanType || 'resalat';
            const loanAmount = Number(loanData.loanAmount) || 0;

          // 🆕 v15.0.1: حفظ user_id اصلی (اصلاح‌شده)
let userId = null;
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (currentUser && currentUser.id && uuidRegex.test(currentUser.id)) {
    userId = currentUser.id;
} else if (application.userId && uuidRegex.test(application.userId)) {
    userId = application.userId;
} else if (application.user_id && uuidRegex.test(application.user_id)) {
    userId = application.user_id;
} else {
    // اگر هیچ UUID معتبری نبود، از user_id ساخته‌شده توسط applicant-store استفاده کن
    try {
        const users = JSON.parse(localStorage.getItem('wamPayUsers') || '[]');
        const u = users.find(x => x.mobile === (currentUser && currentUser.mobile));
        if (u && u.id && uuidRegex.test(u.id)) userId = u.id;
    } catch (_) {}
}

            const payload = {
                user_id: userId,
                application_number: application.caseNumber,
                loan_type: loanType,
                loan_amount: loanAmount,
                loan_bank: loanType,
                status: application.status || 'draft',
                current_step: (application.currentStep || 0) + 1,
                total_steps: 10,
                personal_info: Object.assign({}, d.identityAndJob || {}),
               financial_info: Object.assign({},
                 d.loanInfo || {},
                 d.consultationResult || {},
                 d.finalDocs ? { finalDocs: d.finalDocs } : {}
                 ),
                documents: stripHeavyFields({ documents: d.documents }).documents || {},
                updated_at: new Date().toISOString()
            };

            console.log('📤 [Wizard DB] ارسال به DB:', {
                app: payload.application_number,
                status: payload.status,
                step: payload.current_step,
                userId: userId ? userId.slice(0, 8) + '...' : 'NULL',
                docs: Object.keys(payload.documents).length
            });

            const { data, error } = await window.WAM_SB.client
                .from('applications')
                .upsert(payload, { onConflict: 'application_number' })
                .select('id')
                .maybeSingle();

            if (error) {
                console.error('❌ [Wizard DB] خطای Supabase:', error);
                throw error;
            }

            if (data && data.id && data.id !== application.id) {
                application.id = data.id;
                Store.saveApplication(application);
            }

            console.log('✅ [Wizard DB] سینک موفق:', application.caseNumber);
        } catch (err) {
            console.error('❌ [Wizard DB] خطا:', err.message || err);
        }
    }

    async function syncDocumentToDB(docBucket, docId, docObj) {
        if (!DB_SYNC_ENABLED || !application) return;
        try {
            console.log('📎 [Wizard DB] سینک مدرک:',
                docBucket + '/' + docId,
                docObj && docObj.name ? docObj.name : '');
            await syncApplicationToDB();
        } catch (err) {
            console.error('❌ [Wizard DB] خطا در سینک مدرک:', err.message || err);
        }
    }

    async function loadApplicationFromDB() {
        if (!DB_SYNC_ENABLED || !application || !application.caseNumber) return;
        try {
            const { data, error } = await window.WAM_SB.client
                .from('applications')
                .select('status, admin_notes, rejection_reason, approved_at, updated_at, ' +
                        'final_loan_amount, final_monthly_installment, final_verification_fee, ' +
                        'final_interest_rate, verification_report_image, verification_notes, ' +
                        'verification_admin_approved_at, verification_superadmin_approved_at, ' +
                        'legal_draft_content, legal_draft_ready_at')
                .eq('application_number', application.caseNumber)
                .maybeSingle();

            if (error) {
                console.warn('⚠️ [Load] خطا:', error.message);
                return;
            }

            if (data) {
                const dbStatus = data.status;
                const localStatus = application.status;

                if (dbStatus && dbStatus !== localStatus) {
                    console.log('🔄 [Load] status آپدیت شد: ' + localStatus + ' → ' + dbStatus);
                    application.status = dbStatus;
                }

                if (data.admin_notes !== undefined) {
                    application.adminNotes = data.admin_notes;
                }
                if (data.rejection_reason !== undefined) {
                    application.rejectionReason = data.rejection_reason;
                }
                if (data.approved_at) {
                    application.approvedAt = data.approved_at;
                }

                application.finalLoanAmount = data.final_loan_amount;
                application.finalMonthlyInstallment = data.final_monthly_installment;
                application.finalVerificationFee = data.final_verification_fee;
                application.finalInterestRate = data.final_interest_rate;
                application.verificationReportImage = data.verification_report_image;
                application.verificationNotes = data.verification_notes;
                application.verificationAdminApprovedAt = data.verification_admin_approved_at;
                application.verificationSuperAdminApprovedAt = data.verification_superadmin_approved_at;
                application.legalDraftContent = data.legal_draft_content;
                application.legalDraftReadyAt = data.legal_draft_ready_at;
                if (data.final_loan_amount) {
                application.data.consultationResult = {
                totalLoan: data.final_loan_amount,
                monthlyInstallment: data.final_monthly_installment,
                fee: data.final_verification_fee,
                interestRate: data.final_interest_rate,
                paymentMethod: null,
                createdAt: new Date().toISOString()
               };
               // 🆕 لود کردن اطلاعات امضا برای دانلود سند
               if (data.financial_info && data.financial_info.eSignature) {
               application.data.eSignature = data.financial_info.eSignature;
               }
             }

                Store.saveApplication(application);
            }
        } catch (err) {
            console.warn('⚠️ [Load] خطا:', err.message);
        }
    }

    // ==========================================
    // کمکی
    // ==========================================
    function toPersianDigits(n) {
        const fa = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
        return String(n).replace(/\d/g, d => fa[+d]);
    }
    function toEnglishDigits(str) {
        return String(str || '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
    }
    function showMessage(text, type) {
        if (!globalMsg) return;
        globalMsg.hidden = false;
        globalMsg.textContent = text;
        globalMsg.classList.remove('error', 'success', 'warn');
        globalMsg.classList.add(type || 'error');
    }
    function hideMessage() { if (globalMsg) { globalMsg.hidden = true; globalMsg.textContent = ''; } }
    function formatAmount(n) {
        if (!n && n !== 0) return '—';
        const clean = toEnglishDigits(String(n)).replace(/[^\d]/g, '');
        if (!clean) return '—';
        return toPersianDigits(clean.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
    }

    function num(val) {
        return Number(toEnglishDigits(String(val || '')).replace(/[^\d]/g, '')) || 0;
    }

    function formatNumberInput(el) {
        if (!el) return;
        const raw = el.value.replace(/[^\d]/g, '');
        if (!raw) { el.value = ''; return; }
        el.value = Number(raw).toLocaleString('en-US');
    }

    function formatFileSize(bytes) {
        if (!bytes) return '۰';
        if (bytes < 1024) return toPersianDigits(bytes) + ' بایت';
        if (bytes < 1024 * 1024) return toPersianDigits(Math.round(bytes / 1024)) + ' کیلوبایت';
        return toPersianDigits((bytes / 1024 / 1024).toFixed(1)) + ' مگابایت';
    }
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }
    function formatDateTimeFa(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR', {hour:'2-digit', minute:'2-digit'});
    }

    // ==========================================
    // 🔒 قفل گام‌ها
    // ==========================================
    function canGoToNextStep(step) {
        const SM = window.WamPayStateMachine;
        if (!SM) {
            console.warn('⚠️ [Lock] StateMachine لود نشده — قفل غیرفعال');
            return { ok: true };
        }
        const currentStatus = (application && application.status) || 'draft';
        const STEP_REQUIRED_STATUS = {
            'identityAndJob':    ['draft', 'consultation_rejected', 'verification_rejected'],
            'loanInfo':          ['draft', 'consultation_rejected', 'verification_rejected'],
            'consultation':      ['draft', 'awaiting_consultation', 'consultation_approved'],
            'documents':         ['consultation_approved', 'verification_rejected', 'verification_pending'],
            'finalization':      ['verification_approved', 'legal_draft_ready'],
            'contractReview':    ['contract_review_approved'],
            'eSignature':        ['contract_review_approved', 'awaiting_signature'],  // 🆕 v15.2.0
            'trustPayment':      ['contract_signed'],
            'declaration':       ['applicant_confirmed'],
            'archive':           ['payment_released']
        };
        const requiredStatuses = STEP_REQUIRED_STATUS[step.key];
        if (!requiredStatuses) return { ok: true };
        if (!requiredStatuses.includes(currentStatus)) {
            let meta = { icon: '📝', label: currentStatus };
            try { if (SM.getStatusMeta) meta = SM.getStatusMeta(currentStatus) || meta; } catch (_) {}
            return {
                ok: false,
                error: '🔒 این گام قفله. وضعیت فعلی: «' + meta.icon + ' ' + meta.label + '». باید منتظر تأیید بمونید.'
            };
        }
        return { ok: true };
    }

    // ==========================================
    // تقویم شمسی
    // ==========================================
    const MIN_JY = 1335, MAX_JY = 1410;
    const JALALI_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];

    function isJalaliLeapYear(jy) {
        const r = jy % 33;
        return [1, 5, 9, 13, 17, 22, 26, 30].indexOf(r) !== -1;
    }
    function getDaysInJalaliMonth(jy, jm) {
        if (jm >= 1 && jm <= 6) return 31;
        if (jm >= 7 && jm <= 11) return 30;
        if (jm === 12) return isJalaliLeapYear(jy) ? 30 : 29;
        return 30;
    }
    function populateYearDropdown() {
        const sel = document.getElementById('w_birthYear'); if (!sel) return;
        sel.innerHTML = '<option value="">سال</option>';
        for (let y = MAX_JY; y >= MIN_JY; y--) {
            const o = document.createElement('option'); o.value = String(y);
            o.textContent = toPersianDigits(y); sel.appendChild(o);
        }
    }
    function populateMonthDropdown() {
        const sel = document.getElementById('w_birthMonth'); if (!sel) return;
        sel.innerHTML = '<option value="">ماه</option>';
        for (let m = 1; m <= 12; m++) {
            const o = document.createElement('option'); o.value = String(m);
            o.textContent = JALALI_MONTHS[m - 1]; sel.appendChild(o);
        }
    }
    function populateDayDropdown() {
        const sel = document.getElementById('w_birthDay'); if (!sel) return;
        const jy = parseInt(document.getElementById('w_birthYear').value, 10) || MAX_JY;
        const jm = parseInt(document.getElementById('w_birthMonth').value, 10) || 1;
        const days = getDaysInJalaliMonth(jy, jm);
        const prev = sel.value;
        sel.innerHTML = '<option value="">روز</option>';
        for (let d = 1; d <= days; d++) {
            const o = document.createElement('option'); o.value = String(d);
            o.textContent = toPersianDigits(d); sel.appendChild(o);
        }
        if (prev && parseInt(prev, 10) <= days) sel.value = prev;
    }
    function syncBirthDateValue() {
        const d = document.getElementById('w_birthDay').value;
        const m = document.getElementById('w_birthMonth').value;
        const y = document.getElementById('w_birthYear').value;
        const h = document.getElementById('w_birthDate');
        if (d && m && y) h.value = y + '/' + String(m).padStart(2, '0') + '/' + String(d).padStart(2, '0');
        else h.value = '';
    }
    function setBirthDateDropdowns(dateStr) {
        if (!dateStr) return;
        const p = String(dateStr).split('/'); if (p.length !== 3) return;
        const y = parseInt(p[0],10), m = parseInt(p[1],10), d = parseInt(p[2],10);
        const ySel = document.getElementById('w_birthYear'), mSel = document.getElementById('w_birthMonth');
        const dSel = document.getElementById('w_birthDay');
        if (!isNaN(y) && y >= MIN_JY && y <= MAX_JY) ySel.value = String(y);
        if (!isNaN(m) && m >= 1 && m <= 12) mSel.value = String(m);
        populateDayDropdown();
        if (!isNaN(d) && d >= 1 && d <= dSel.options.length - 1) dSel.value = String(d);
        syncBirthDateValue();
    }
    function bindBirthDateEvents() {
        const y = document.getElementById('w_birthYear');
        const m = document.getElementById('w_birthMonth');
        const d = document.getElementById('w_birthDay');
        if (!y || !m || !d) return;
        y.addEventListener('change', () => { populateDayDropdown(); syncBirthDateValue(); });
        m.addEventListener('change', () => { populateDayDropdown(); syncBirthDateValue(); });
        d.addEventListener('change', syncBirthDateValue);
    }
    function populateBankLoans() {
        const sel = document.getElementById('w_bankLoanType'); if (!sel) return;
        sel.innerHTML = '<option value="">انتخاب کنید...</option>';
        BANK_LOANS.forEach(b => {
            const o = document.createElement('option'); o.value = b.id;
            o.textContent = b.name + (b.description ? ' — ' + b.description : '');
            if (b.disabled) {
                o.disabled = true;
                o.textContent += ' (به‌زودی)';
            }
            sel.appendChild(o);
        });
    }

    // ==========================================
    // اعتبارسنجی‌های عمومی
    // ==========================================
    function isValidNationalCode(code) {
        code = toEnglishDigits(String(code)).replace(/\D/g, '');
        if (code.length !== 10) return false;
        if (/^(\d)\1{9}$/.test(code)) return false;
        let sum = 0;
        for (let i = 0; i < 9; i++) sum += parseInt(code[i], 10) * (10 - i);
        const rem = sum % 11, chk = parseInt(code[9], 10);
        return (rem < 2 && chk === rem) || (rem >= 2 && chk === 11 - rem);
    }
    function calcAgeFromJalali(bd) {
        const c = toEnglishDigits(String(bd)).replace(/[^\d\/]/g, ''); const p = c.split('/');
        if (p.length !== 3) return null;
        const jy = parseInt(p[0],10), jm = parseInt(p[1],10), jd = parseInt(p[2],10);
        if (isNaN(jy)||isNaN(jm)||isNaN(jd)) return null;
        if (jy < 1300 || jy > 1420 || jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
        let age = 1405 - jy;
        if (jm > 7 || (jm === 7 && jd > 1)) age--;
        return age;
    }

    function syncTermsCheckbox() {
        const cb = document.getElementById('w_termsAgreed');
        const label = document.getElementById('termsCheck');
        const err = document.getElementById('termsErr');
        if (!cb || !label) return;
        label.classList.toggle('checked', cb.checked);
        if (err) err.style.display = cb.checked ? 'none' : 'block';
    }

    // ==========================================
    // مدیریت مراحل گام ۷
    // ==========================================
    function getPaymentMethod() {
        return ((application.data.finalization || {}).paymentMethod) || 'escrow';
    }

    function buildESigStageKeys() {
        const pm = getPaymentMethod();
        eSigStageKeys = ['summary', 'commitment', 'otp'];
        if (pm === 'check') {
            eSigStageKeys.push('checkInfo');
        }
        eSigStageKeys.push('signature', 'review', 'chain', 'issue');
    }

    function currentESigKey() { return eSigStageKeys[eSigStage] || 'summary'; }
    function eSigTotalStages() { return eSigStageKeys.length; }
    function eSigStageNumber() { return eSigStage + 1; }

    function eSigGoTo(key) {
        const idx = eSigStageKeys.indexOf(key);
        if (idx >= 0) {
            eSigStage = idx;
            if (application && application.data && application.data.eSignature) {
                application.data.eSignature.currentStageKey = key;
                Store.saveApplication(application);
            }
            renderESignatureStep();
        }
    }

    // ==========================================
    // مقداردهی اولیه
    // ==========================================
    async function initApplication() {
        populateYearDropdown(); populateMonthDropdown(); populateDayDropdown();
        bindBirthDateEvents(); populateBankLoans();

        if (DB_SYNC_ENABLED) {
            try {
                const userId = currentUser.id;
                const mobile = currentUser.mobile;

                let query = window.WAM_SB.client
                    .from('applications')
                  .select('id, application_number, user_id, status, current_step, total_steps, loan_amount, loan_type, loan_bank, personal_info, financial_info, created_at, updated_at')  
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
                    query = query.or(`user_id.eq.${userId},personal_info->>mobile.eq.${mobile}`);
                } else if (mobile) {
                    query = query.eq('personal_info->>mobile', mobile);
                } else {
                    query = null;
                }

                if (query) {
                    const { data: dbApps, error: dbErr } = await query;

                    if (!dbErr && dbApps && dbApps.length > 0) {
                        const dbApp = dbApps[0];
                        if (OPEN_STATUSES.includes(dbApp.status)) {
                            console.log('♻️ [Wizard DB] پرونده‌ی باز از DB بازیابی شد:', dbApp.application_number, '| status:', dbApp.status);

                            application = {
                                id: dbApp.id,
                                caseNumber: dbApp.application_number,
                                userId: dbApp.user_id,
                                user_id: dbApp.user_id,
                                status: dbApp.status,
                                currentStep: (dbApp.current_step || 1) - 1,
                                data: {
                                    identityAndJob: dbApp.personal_info || {},
                                    loanInfo: dbApp.financial_info || {},
                                    documents: dbApp.documents || {},
                                    consultationResult: dbApp.financial_info || {}
                                },
                                createdAt: dbApp.created_at,
                                updatedAt: dbApp.updated_at
                            };

                            currentStep = determineCurrentStepFromStatus(application);
                            Store.saveApplication(application);
                            fillFormFromApplication();
                            renderStepsMini();
                            renderStep();
                            setTimeout(() => loadApplicationFromDB().then(() => renderStep()), 500);
                            return;
                        }
                    }
                }
            } catch (dbErr) {
                console.warn('⚠️ [Wizard DB] خطا در چک اولیه:', dbErr.message);
            }
        }

        try {
            const userApps = Store.getApplicationsByUser(currentUser.id);
            const openCase = userApps.find(a =>
                a.status && !['completed', 'rejected', 'refunded'].includes(a.status)
            );

            if (openCase) {
                application = openCase;
                currentStep = determineCurrentStepFromStatus(openCase);
                fillFormFromApplication();
                renderStepsMini();
                renderStep();
                console.log('♻️ [Wizard] پرونده‌ی باز از LocalStorage:', openCase.caseNumber, '| status:', openCase.status);
                setTimeout(() => loadApplicationFromDB().then(() => renderStep()), 500);
                return;
            }
        } catch (e) {
            console.warn('⚠️ خطا در چک پرونده‌ی باز:', e);
        }

        const draft = Store.loadDraft(currentUser.id);
        if (draft && draft.applicationId) {
            const ex = Store.getApplicationById(draft.applicationId);
            if (ex && ex.status === 'draft') {
                application = ex;
                currentStep = ex.currentStep || 0;
                fillFormFromApplication();
                renderStepsMini(); renderStep();
                setTimeout(() => loadApplicationFromDB().then(() => renderStep()), 500);
                return;
            }
            if (ex && ex.status && ex.status !== 'draft') {
                application = ex;
                currentStep = determineCurrentStepFromStatus(ex);
                fillFormFromApplication();
                renderStepsMini(); renderStep();
                setTimeout(() => loadApplicationFromDB().then(() => renderStep()), 500);
                return;
            }
        }

        application = Store.createApplication(currentUser.id, currentUser.mobile);
        application.userId = currentUser.id;
        application.user_id = currentUser.id;
        currentStep = 0;
        renderStepsMini(); renderStep();
        console.log('🆕 [Wizard] پرونده‌ی جدید:', application.caseNumber);
        setTimeout(() => loadApplicationFromDB().then(() => renderStep()), 500);
    }

    function determineCurrentStepFromStatus(app) {
        const s = app.status;
        if (s === 'draft' && typeof app.currentStep === 'number') { return app.currentStep; }
        if (['awaiting_consultation'].includes(s)) return 2;
        if (['consultation_approved'].includes(s)) return 3;
        if (['consultation_rejected'].includes(s)) return 2;
        if (['under_verification', 'verification_pending', 'verification_rejected'].includes(s)) return 3;
        if (['verification_approved', 'legal_draft_ready'].includes(s)) return 4;
        if (['awaiting_verification_final_review', 'verification_complete_pending_superadmin', 'legal_draft_pending'].includes(s)) return 4;
        if (['broker_draft_approved', 'applicant_draft_approved'].includes(s)) return 5;
        if (['contract_review_pending_superadmin', 'contract_review_approved'].includes(s)) return 5;
        if (['awaiting_signature', 'applicant_signed'].includes(s)) return 6;
        if (['contract_signed'].includes(s)) return 7;
        if (['payment_pending','payment_in_escrow','broker_transferred','super_admin_verified','applicant_confirmed'].includes(s)) return 7;
        if (['awaiting_declaration','declaration_signed'].includes(s)) return 8;
        if (['payment_released'].includes(s)) return 9;
        if (['completed'].includes(s)) return 9;
        return 0;
    }

    function fillFormFromApplication() {
        const map = {
            firstName:'w_firstName',lastName:'w_lastName',nationalId:'w_nationalId',fatherName:'w_fatherName',
            birthDate:'w_birthDate',gender:'gender',militaryStatus:'militaryStatus',
            phone:'w_phone',postalCode:'w_postalCode',address:'w_address',
            jobType:'w_jobType',employerName:'w_employerName',position:'w_position',
            workYears:'w_workYears',monthlyIncome:'w_monthlyIncome',otherIncome:'w_otherIncome',
            workPhone:'w_workPhone',workAddress:'w_workAddress',
            bankLoanType:'w_bankLoanType',loanAmount:'w_loanAmount',
            minInstallment:'w_minInstallment',maxInstallment:'w_maxInstallment',
            finalBankAccount:'w_finalBankAccount'
        };
        const all = Object.assign({},
            application.data.identityAndJob || {},
            application.data.loanInfo || {},
            application.data.finalization || {}
        );
        Object.keys(map).forEach(key => {
            const sel = map[key]; const value = all[key];
            if (value === undefined || value === null) return;
            if (key === 'gender' || key === 'militaryStatus') {
                const r = document.querySelector('input[name="'+key+'"][value="'+value+'"]');
                if (r) { r.checked = true; r.closest('.radio-opt').classList.add('checked'); }
                return;
            }
            if (key === 'birthDate') { setBirthDateDropdowns(value); return; }
            const el = document.getElementById(sel);
            if (el) el.value = value;
        });
        toggleMilitaryField();
        if (application.data.consultation) restoreConsultation(application.data.consultation);
        if (application.data.finalization && application.data.finalization.paymentMethod) {
            restorePaymentMethod(application.data.finalization.paymentMethod);
        }
        if (application.data.finalization) {
            const cb = document.getElementById('w_termsAgreed');
            if (cb) cb.checked = !!application.data.finalization.termsAgreed;
            syncTermsCheckbox();
        }
    }

    function restoreConsultation(consult) {
        const r = document.querySelector('input[name="consultStatus"][value="'+consult.status+'"]');
        if (!r) return;
        r.checked = true; r.closest('.rating-option').classList.add('checked');
        const ss = document.getElementById('starsSection');
        const cs = document.getElementById('complaintSection');
        if (consult.status === 'called') {
            ss.classList.remove('hidden');
            const n = Number(consult.rating) || 0;
            document.querySelectorAll('#starsContainer span').forEach((s,i)=>s.classList.toggle('active', i<n));
            document.getElementById('w_consultRating').value = String(n);
            document.getElementById('starsCaption').textContent = RATING_CAPTIONS[n] || '—';
            document.getElementById('w_consultComment').value = consult.comment || '';
        } else if (consult.status === 'not_called') {
            cs.classList.remove('hidden');
            document.getElementById('w_consultComplaint').value = consult.complaint || '';
        }
        document.getElementById('ratingSuccess').classList.remove('hidden');
        const b = document.getElementById('saveRatingBtn');
        b.disabled = true; b.textContent = '✅ نظر ثبت شد';
    }

    function restorePaymentMethod(method) {
        const pm = document.querySelector('.payment-method[data-value="'+method+'"]');
        if (pm) { pm.classList.add('checked'); const r = pm.querySelector('input[type="radio"]'); if (r) r.checked = true; }
    }

    // ==========================================
    // نوار بالا
    // ==========================================
    function renderStepsMini() {
        if (!stepsMini) return;
        stepsMini.innerHTML = '';
        STEPS.forEach((s,i) => {
            const d = document.createElement('div');
            d.className = 'step-dot';
            if (i === currentStep) d.classList.add('active');
            if (i < currentStep) d.classList.add('done');
            d.textContent = i < currentStep ? '✓' : toPersianDigits(i+1);
            d.title = s.label;
            stepsMini.appendChild(d);
        });
    }

    function renderStep() {
        panels.forEach(p => p.classList.toggle('hidden', Number(p.dataset.step) !== currentStep));
        const pct = ((currentStep+1) / STEPS.length) * 100;
        if (progressFill) progressFill.style.width = pct + '%';
        if (stepNum) stepNum.textContent = toPersianDigits(currentStep+1);
        if (stepLabel) stepLabel.textContent = STEPS[currentStep].label;
        renderStepsMini();

        const stepKey = STEPS[currentStep].key;

        const hideNav = ['eSignature', 'trustPayment', 'declaration', 'archive'].includes(stepKey);
        if (prevBtn && nextBtn) {
            if (hideNav) {
                prevBtn.style.display = 'none';
                nextBtn.style.display = 'none';
            } else {
                prevBtn.style.display = '';
                nextBtn.style.display = '';
                prevBtn.disabled = currentStep === 0;
                prevBtn.style.opacity = currentStep === 0 ? '0.5' : '1';

                nextBtn.textContent = 'بعدی';
                nextBtn.disabled = false;
                nextBtn.style.opacity = '1';
                nextBtn.style.cursor = 'pointer';
                nextBtn.style.background = '';
                nextBtn.style.color = '';
                nextBtn.title = '';

                if (stepKey === 'documents') {
                    const isUnderReview = application.status === 'under_verification';
                    const isApproved = application.status === 'verification_approved';
                    const needsFix = ['verification_rejected', 'verification_pending'].includes(application.status);

                    if (isUnderReview || isApproved) {
                        nextBtn.textContent = isApproved
                            ? '✅ تأیید شده — در انتظار گام بعدی'
                            : '⏳ در انتظار بررسی اعتبارسنجی';
                        nextBtn.disabled = true;
                        nextBtn.style.opacity = '0.5';
                        nextBtn.style.cursor = 'not-allowed';
                    } else if (allRequiredUploaded()) {
                        nextBtn.textContent = needsFix
                            ? '📤 ارسال مجدد به اعتبارسنجی'
                            : '📤 ثبت و ارسال به اعتبارسنجی';
                        nextBtn.disabled = false;
                        nextBtn.style.background = 'linear-gradient(135deg, #0b3b23, #1e8e4a)';
                        nextBtn.style.color = '#fff';
                    } else {
                        nextBtn.textContent = '⚠️ ابتدا مدارک اجباری را آپلود کنید';
                        nextBtn.disabled = true;
                        nextBtn.style.opacity = '0.5';
                        nextBtn.style.cursor = 'not-allowed';
                    }
                } else {
                    try {
                        const lockCheck = canGoToNextStep(STEPS[currentStep]);
                        if (!lockCheck.ok) {
                            nextBtn.textContent = '🔒 در انتظار تأیید';
                            nextBtn.title = lockCheck.error;
                            nextBtn.style.opacity = '0.5';
                            nextBtn.style.cursor = 'not-allowed';
                            nextBtn.disabled = true;
                        }
                    } catch (e) {
                        console.warn('⚠️ [Lock] خطا در نمایش قفل:', e);
                    }
                }
            }
        }

        if (stepKey === 'documents') renderDocumentsStep();

        else if (stepKey === 'consultation') {
            const consultStatus = application.status;
            const isApproved = (consultStatus === 'consultation_approved');
            const isPending  = (consultStatus === 'awaiting_consultation');

            const calledBtn    = document.querySelector('.rating-option[data-value="called"]');
            const notCalledBtn = document.querySelector('.rating-option[data-value="not_called"]');

            if (calledBtn) {
                if (isApproved) {
                    calledBtn.style.opacity = '1';
                    calledBtn.style.pointerEvents = 'auto';
                    calledBtn.title = '';
                } else {
                    calledBtn.style.opacity = '0.5';
                    calledBtn.style.pointerEvents = 'none';
                    calledBtn.title = '⏳ در انتظار تأیید مشاور';
                }
            }
            if (notCalledBtn) {
                if (isPending || consultStatus === 'draft') {
                    notCalledBtn.style.opacity = '1';
                    notCalledBtn.style.pointerEvents = 'auto';
                    notCalledBtn.title = '';
                } else if (isApproved) {
                    notCalledBtn.style.opacity = '0.5';
                    notCalledBtn.style.pointerEvents = 'none';
                    notCalledBtn.title = 'مشاور پرونده را تأیید کرده است';
                } else {
                    notCalledBtn.style.opacity = '1';
                    notCalledBtn.style.pointerEvents = 'auto';
                }
            }
            if (nextBtn && !hideNav) {
                if (!application.data.consultation) {
                    nextBtn.disabled = true;
                    nextBtn.style.opacity = '0.5';
                }
            }
        }
        else if (stepKey === 'finalization') renderFinalizationStep();
        else if (stepKey === 'contractReview') renderContractStep();
        else if (stepKey === 'eSignature') renderESignatureStep();
        else if (stepKey === 'trustPayment') renderStep8();
        else if (stepKey === 'declaration') renderStep9();
        else if (stepKey === 'archive') renderStep10();

        hideMessage();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function toggleMilitaryField() {
        const g = document.querySelector('input[name="gender"]:checked');
        const f = document.getElementById('militaryField');
        if (!f) return;
        if (g && g.value === 'male') f.classList.remove('hidden');
        else {
            f.classList.add('hidden');
            document.querySelectorAll('input[name="militaryStatus"]').forEach(r => {
                r.checked = false; r.closest('.radio-opt').classList.remove('checked');
            });
        }
    }

    // ==========================================
    // گام ۴: مدارک
    // ==========================================
    function getCategoryKey() {
        const job = (application.data.identityAndJob || {}).jobType || '';
        return JOB_TO_CATEGORY[job] || 'other';
    }

    function renderDocumentsStep() {
        const key = getCategoryKey(); const cat = CATEGORIES[key]; if (!cat) return;
        document.getElementById('categoryIcon').textContent = cat.icon;
        document.getElementById('categoryTitle').textContent = cat.title;
        document.getElementById('categorySub').textContent = cat.sub;
        application.data.docCategory = key;
        if (cat.warning) showMessage('⚠️ ' + cat.warning, 'warn');

        const adminNoteBox = document.getElementById('adminNoteBox');
        if (adminNoteBox) adminNoteBox.remove();

        if (application.status === 'verification_pending' && application.adminNotes) {
            const noteBox = document.createElement('div');
            noteBox.id = 'adminNoteBox';
            noteBox.style.cssText = 'background:rgba(230,126,34,.1);border:1.5px solid #e67e22;border-right:4px solid #e67e22;border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:13.5px;line-height:1.9';
            noteBox.innerHTML = '<div style="font-weight:900;color:#e67e22;margin-bottom:6px">⚠️ نواقص اعلام‌شده توسط کارشناس اعتبارسنجی:</div>' +
                '<div style="background:rgba(255,255,255,.6);padding:10px 14px;border-radius:8px;margin-top:8px">' + escapeHtml(application.adminNotes) + '</div>' +
                '<div style="font-size:12px;color:#888;margin-top:10px;padding-top:8px;border-top:1px dashed rgba(230,126,34,.3)">📝 موارد بالا را اصلاح کرده و دکمهٔ ارسال مجدد را بزنید.</div>';
            const catHeader = document.getElementById('categoryTitle');
            if (catHeader && catHeader.parentElement) catHeader.parentElement.after(noteBox);
        } else if (application.status === 'verification_rejected' && application.rejectionReason) {
            const noteBox = document.createElement('div');
            noteBox.id = 'adminNoteBox';
            noteBox.style.cssText = 'background:rgba(192,57,43,.1);border:1.5px solid #c0392b;border-right:4px solid #c0392b;border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:13.5px;line-height:1.9';
            noteBox.innerHTML = '<div style="font-weight:900;color:#c0392b;margin-bottom:6px">❌ پرونده رد شد:</div>' +
                '<div style="background:rgba(255,255,255,.6);padding:10px 14px;border-radius:8px;margin-top:8px">' + escapeHtml(application.rejectionReason) + '</div>' +
                '<div style="font-size:12px;color:#888;margin-top:10px;padding-top:8px;border-top:1px dashed rgba(192,57,43,.3)">📝 موارد بالا را اصلاح کرده و دکمهٔ ارسال مجدد را بزنید.</div>';
            const catHeader = document.getElementById('categoryTitle');
            if (catHeader && catHeader.parentElement) catHeader.parentElement.after(noteBox);
        }

        const savedDocs = application.data.documents || {};
        const list = document.getElementById('docsList'); list.innerHTML = '';
        cat.docs.forEach(doc => {
            const uploaded = savedDocs[doc.id] || null;
            const item = document.createElement('div');
            item.className = 'doc-item ' + (doc.required ? 'required' : 'optional');
            if (uploaded) item.classList.add('uploaded');
            item.dataset.docId = doc.id;
            item.innerHTML = buildDocItemHTML(doc, uploaded);
            list.appendChild(item);
        });
        bindDocumentEvents(); updateUploadProgress();
    }

    function buildDocItemHTML(doc, uploaded) {
        const badge = doc.required ? '<span class="badge-required">اجباری</span>' : '<span class="badge-optional">اختیاری</span>';
        const status = uploaded ? '<span class="doc-status done">✅ بارگذاری شد</span>' : '<span class="doc-status pending">⚠️ در انتظار</span>';
        let body = '';
        if (uploaded) {
            const preview = uploaded.mime && uploaded.mime.indexOf('image/') === 0 && uploaded.dataUrl
                ? '<img src="'+uploaded.dataUrl+'" alt="">' : (uploaded.mime === 'application/pdf' ? '📄' : '📎');
            body = '<div class="doc-file-info">' +
                    '<div class="doc-file-preview">'+preview+'</div>' +
                    '<div class="doc-file-details">' +
                        '<div class="doc-file-name">'+escapeHtml(uploaded.name)+'</div>' +
                        '<div class="doc-file-meta">'+formatFileSize(uploaded.size)+' · '+(uploaded.mime||'')+'</div>' +
                    '</div>' +
                    '<div class="doc-actions">' +
                        '<button type="button" class="doc-action-btn" data-action="preview">👁️</button>' +
                        '<button type="button" class="doc-action-btn danger" data-action="remove">🗑️</button>' +
                    '</div></div>';
        } else {
            body = '<div class="doc-upload-area">' +
                    '<input type="file" class="doc-file-input" id="file_'+doc.id+'" accept=".jpg,.jpeg,.png,.pdf">' +
                    '<label for="file_'+doc.id+'" class="doc-upload-btn">' +
                        '<span>📤</span><span>انتخاب فایل</span>' +
                    '</label></div><div class="doc-error"></div>';
        }
        return '<div class="doc-head"><div class="doc-head-left">' +
                '<h4 class="doc-title">'+escapeHtml(doc.title)+' '+badge+'</h4>' +
                '<p class="doc-desc">'+escapeHtml(doc.desc)+'</p></div>' + status + '</div>' + body;
    }

    function bindDocumentEvents() {
        const list = document.getElementById('docsList'); if (!list) return;
        list.querySelectorAll('.doc-file-input').forEach(i => i.addEventListener('change', handleFileSelect));
        list.querySelectorAll('.doc-action-btn').forEach(b => b.addEventListener('click', handleDocAction));
    }

    function handleFileSelect(e) {
        const input = e.target; const file = input.files && input.files[0]; if (!file) return;
        const item = input.closest('.doc-item'); const docId = item.dataset.docId;
        const errEl = item.querySelector('.doc-error');
        if (errEl) { errEl.textContent = ''; errEl.classList.remove('show'); }
        if (file.size > FILE_LIMITS.maxSizeBytes) {
            showDocError(errEl, 'حجم فایل بیش از ' + FILE_LIMITS.maxSizeMB + ' مگابایت است.');
            input.value = ''; return;
        }
        const mime = (file.type || '').toLowerCase();
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (FILE_LIMITS.allowedMimes.indexOf(mime) === -1 && FILE_LIMITS.allowedExts.indexOf(ext) === -1) {
            showDocError(errEl, 'فرمت مجاز نیست. فقط JPG، PNG یا PDF.'); input.value = ''; return;
        }
        const reader = new FileReader();
        reader.onload = function (ev) {
            const dataUrl = ev.target.result;
            if (!application.data.documents) application.data.documents = {};
            application.data.documents[docId] = { id: docId, name: file.name, size: file.size, mime: mime, dataUrl: dataUrl, uploadedAt: new Date().toISOString() };
            Store.saveApplication(application);
            Store.saveDraft(currentUser.id, { applicationId: application.id });
            syncDocumentToDB('documents', docId, application.data.documents[docId]);
            const cat = CATEGORIES[getCategoryKey()];
            const doc = cat.docs.find(d => d.id === docId);
            item.classList.add('uploaded');
            item.innerHTML = buildDocItemHTML(doc, application.data.documents[docId]);
            item.querySelector('.doc-action-btn[data-action="preview"]').addEventListener('click', handleDocAction);
            item.querySelector('.doc-action-btn[data-action="remove"]').addEventListener('click', handleDocAction);
            updateUploadProgress(); hideMessage();
            if (allRequiredUploaded()) {
                showMessage('✅ همه‌ی مدارک اجباری بارگذاری شد. اکنون می‌توانید برای اعتبارسنجی ارسال کنید.', 'success');
    
          // 🆕 فعال کردن دستی دکمه بعدی
           if (nextBtn) {
            nextBtn.textContent = '📤 ثبت و ارسال به اعتبارسنجی';
         nextBtn.disabled = false;
         nextBtn.style.opacity = '1';
         nextBtn.style.cursor = 'pointer';
         nextBtn.style.background = 'linear-gradient(135deg, #0b3b23, #1e8e4a)';
         nextBtn.style.color = '#fff';
         }
          }
        };
        reader.onerror = function () { showDocError(errEl, 'خطا در خواندن فایل.'); };
        reader.readAsDataURL(file);
    }

    function showDocError(errEl, msg) { if (!errEl) return; errEl.textContent = msg; errEl.classList.add('show'); }

    function handleDocAction(e) {
        e.preventDefault(); const btn = e.currentTarget;
        const action = btn.dataset.action; const item = btn.closest('.doc-item');
        const docId = item.dataset.docId;
        if (action === 'preview') openDocPreview(application.data.documents[docId]);
        else if (action === 'remove') removeDoc(docId, item);
    }

    function openDocPreview(doc) {
        if (!doc) return;
        const existing = document.getElementById('docPreviewModal'); if (existing) existing.remove();
        const modal = document.createElement('div');
        modal.id = 'docPreviewModal'; modal.className = 'doc-preview-modal open';
        let body = '';
        if (doc.mime && doc.mime.indexOf('image/') === 0) {
            body = '<img src="'+doc.dataUrl+'">';
        } else if (doc.mime === 'application/pdf') {
            body = '<iframe src="'+doc.dataUrl+'"></iframe>';
        } else if (doc.mime === 'text/html') {
            let html = '';
            if (doc.dataUrl && doc.dataUrl.indexOf('data:text/html;charset=utf-8,') === 0) {
                html = decodeURIComponent(doc.dataUrl.replace('data:text/html;charset=utf-8,', ''));
            } else if (doc.dataUrl && doc.dataUrl.indexOf('data:text/html;base64,') === 0) {
                try { html = atob(doc.dataUrl.replace('data:text/html;base64,', '')); } catch (_) {}
            }
            body = '<iframe style="width:100%;height:75vh;border:0;background:#fff"></iframe>';
            modal.innerHTML = '<div class="doc-preview-inner"><div class="doc-preview-head"><h3>📄 '+escapeHtml(doc.name)+'</h3><button class="doc-preview-close" type="button">×</button></div><div class="doc-preview-body">'+body+'</div></div>';
            document.body.appendChild(modal);
            const iframe = modal.querySelector('iframe');
            if (iframe) iframe.srcdoc = html;
            modal.querySelector('.doc-preview-close').addEventListener('click', () => modal.remove());
            modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.remove(); });
            return;
        } else {
            body = '<p style="text-align:center">پیش‌نمایش موجود نیست.</p>';
        }
        modal.innerHTML = '<div class="doc-preview-inner"><div class="doc-preview-head"><h3>📄 '+escapeHtml(doc.name)+'</h3><button class="doc-preview-close" type="button">×</button></div><div class="doc-preview-body">'+body+'</div></div>';
        document.body.appendChild(modal);
        modal.querySelector('.doc-preview-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.remove(); });
    }

    function removeDoc(docId, item) {
        if (!confirm('این مدرک حذف شود؟')) return;
        delete application.data.documents[docId];
        Store.saveApplication(application); Store.saveDraft(currentUser.id, { applicationId: application.id });
        syncApplicationToDB();
        const cat = CATEGORIES[getCategoryKey()]; const doc = cat.docs.find(d => d.id === docId);
        item.classList.remove('uploaded'); item.innerHTML = buildDocItemHTML(doc, null);
        item.querySelector('.doc-file-input').addEventListener('change', handleFileSelect);
        updateUploadProgress();
        renderStep();
    }

    function updateUploadProgress() {
        const cat = CATEGORIES[getCategoryKey()]; if (!cat) return;
        const total = cat.docs.filter(d => d.required).length;
        const docs = application.data.documents || {};
        const uploaded = cat.docs.filter(d => d.required && docs[d.id]).length;
        const pct = total > 0 ? (uploaded / total) * 100 : 0;
        const pf = document.getElementById('uploadProgressFill');
        const pt = document.getElementById('uploadProgressText');
        if (pf) pf.style.width = pct + '%';
        if (pt) pt.textContent = toPersianDigits(uploaded) + ' از ' + toPersianDigits(total);
    }

    function allRequiredUploaded() {
        const cat = CATEGORIES[getCategoryKey()]; if (!cat) return false;
        const docs = application.data.documents || {};
        return cat.docs.filter(d => d.required).every(d => docs[d.id]);
    }

    // ==========================================
    // ارسال مدارک به اعتبارسنجی
    // ==========================================
    async function submitDocumentsForVerification() {
        if (!allRequiredUploaded()) {
            showMessage('⚠️ لطفاً همه مدارک اجباری را بارگذاری کنید.', 'error');
            const fp = document.querySelector('.doc-item.required:not(.uploaded)');
            if (fp) fp.scrollIntoView({behavior:'smooth',block:'center'});
            return;
        }

        if (!confirm('آیا از ثبت و ارسال مدارک برای بررسی اعتبارسنجی مطمئن هستید؟\n\nپس از ارسال، امکان تغییر مدارک وجود ندارد تا زمانی که کارشناس اعتبارسنجی تصمیم بگیرد.')) {
            return;
        }

        if (nextBtn) {
            nextBtn.disabled = true;
            nextBtn.textContent = '⏳ در حال ارسال...';
            nextBtn.style.opacity = '0.8';
            nextBtn.style.cursor = 'wait';
        }

        try {
            application.status = 'under_verification';
            application.currentStep = 4;
            application.submittedToVerificationAt = new Date().toISOString();
            Store.saveApplication(application);
            Store.saveDraft(currentUser.id, { applicationId: application.id });

            if (window.WAM_SB && window.WAM_SB.client && application.caseNumber) {
                const { error } = await window.WAM_SB.client
                    .from('applications')
                    .update({
                        status: 'under_verification',
                        current_step: 5,
                        admin_notes: null,
                        rejection_reason: null,
                        updated_at: new Date().toISOString()
                    })
                    .eq('application_number', application.caseNumber);

                if (error) {
                    console.error('❌ خطا در DB:', error);
                    throw error;
                }
                console.log('✅ [Submit] مدارک ارسال شد → under_verification (نواقص قبلی پاک شد)');
            }

            showMessage('✅ مدارک با موفقیت ثبت و برای اعتبارسنجی ارسال شد. منتظر تصمیم کارشناس باشید.', 'success');

            setTimeout(() => window.location.reload(), 2000);

        } catch (err) {
            console.error('❌ خطا در ارسال مدارک:', err);
            showMessage('خطا در ارسال: ' + err.message, 'error');
            if (nextBtn) {
                nextBtn.disabled = false;
                nextBtn.textContent = '📤 ثبت و ارسال به اعتبارسنجی';
                nextBtn.style.opacity = '1';
                nextBtn.style.cursor = 'pointer';
            }
        }
    }

    // ==========================================
    // گام ۵: اعتبارسنجی
    // ==========================================
    function ensureVerificationData() {
        if (application.finalLoanAmount) {
            application.data.verification = {
                status: 'approved',
                imageUrl: application.verificationReportImage,
                notes: application.verificationNotes,
                verifiedAt: application.verificationAdminApprovedAt,
                verifierName: 'کارشناس اعتبارسنجی'
            };
            application.data.consultationResult = {
                totalLoan: application.finalLoanAmount,
                monthlyInstallment: application.finalMonthlyInstallment,
                fee: application.finalVerificationFee,
                interestRate: application.finalInterestRate,
                paymentMethod: null,
                createdAt: new Date().toISOString()
            };
            return;
        }

        if (application.data.verification) return;
        const loanAmount = num((application.data.loanInfo || {}).loanAmount) || 100000000;
        const months = 24, annualRate = 0.18, monthlyRate = annualRate / 12;
        const pow = Math.pow(1 + monthlyRate, months);
        const monthly = Math.round(loanAmount * monthlyRate * pow / (pow - 1));
        const fee = Math.round(loanAmount * 0.03);

        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">' +
            '<rect width="600" height="400" fill="#f4f7f4"/>' +
            '<rect x="20" y="20" width="560" height="360" fill="none" stroke="#0b3b23" stroke-width="2" rx="12"/>' +
            '<text x="300" y="120" text-anchor="middle" font-family="Tahoma" font-size="22" font-weight="bold" fill="#0b3b23">گزارش اعتبارسنجی</text>' +
            '<text x="300" y="190" text-anchor="middle" font-size="70" fill="#1e8e4a">✅</text>' +
            '<text x="300" y="250" text-anchor="middle" font-family="Tahoma" font-size="16" font-weight="bold" fill="#1e8e4a">مدارک بررسی و تأیید شد</text>' +
            '<text x="300" y="290" text-anchor="middle" font-family="Tahoma" font-size="13" fill="#77847b">کارشناس: خانم صادقی</text>' +
            '<text x="300" y="320" text-anchor="middle" font-family="Tahoma" font-size="12" fill="#77847b">تاریخ: 1405/07/02</text>' +
            '<text x="300" y="355" text-anchor="middle" font-family="Tahoma" font-size="11" fill="#d4a62a">وام پی — سامانه هوشمند تسهیلات</text>' +
            '</svg>';

        application.data.verification = {
            status: 'approved',
            imageUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
            notes: 'تمامی مدارک ارسالی بررسی و تأیید شد. اطلاعات مطابق مستندات بانکی است.',
            verifiedAt: new Date().toISOString(),
            verifierName: 'خانم صادقی — کارشناس اعتبارسنجی'
        };
        application.data.consultationResult = {
            totalLoan: loanAmount, monthlyInstallment: monthly, fee: fee, interestRate: 18,
            paymentMethod: null, createdAt: new Date().toISOString()
        };
        Store.saveApplication(application);
    }

    function renderFinalizationStep() {
        ensureVerificationData();
        const v = application.data.verification || {};
        const vBox = document.getElementById('verificationResult');
        if (vBox) {
            if (v.status === 'approved' && v.imageUrl) {
                vBox.innerHTML = '<div class="verify-result-card">' +
                    '<div class="verify-head"><div class="verify-head-left">' +
                    '<div class="verify-status-icon">✅</div>' +
                    '<div><div class="verify-status-title">اعتبارسنجی تأیید شد</div>' +
                    '<div class="verify-status-sub">'+escapeHtml(v.verifierName||'')+'</div></div>' +
                    '</div><span class="verify-badge">تأیید شده</span></div>' +
                    '<div class="verify-image-wrap"><img src="'+v.imageUrl+'" class="verify-image">' +
                    '<div class="verify-image-hint">🖼️ گزارش اعتبارسنجی (بارگذاری توسط ادمین)</div></div>' +
                    (v.notes ? '<div class="verify-notes"><strong>📝 یادداشت:</strong>'+escapeHtml(v.notes)+'</div>' : '') +
                    '</div>';
            } else {
                vBox.innerHTML = '<div style="text-align:center;padding:32px;color:var(--wam-text-muted)">⏳ در انتظار اعتبارسنجی</div>';
            }
        }

        const cr = application.data.consultationResult || {};
        const rate = cr.interestRate || 18;
        const cBox = document.getElementById('consultationResult');
        if (cBox) {
            cBox.innerHTML = '<div class="consult-result-grid">' +
                '<div class="consult-result-item highlight"><div class="consult-result-icon">💰</div><div class="consult-result-label">مبلغ کل وام</div><div class="consult-result-value">'+formatAmount(cr.totalLoan)+' <small>تومان</small></div></div>' +
                '<div class="consult-result-item"><div class="consult-result-icon">📅</div><div class="consult-result-label">قسط ماهیانه</div><div class="consult-result-value">'+formatAmount(cr.monthlyInstallment)+' <small>تومان</small></div></div>' +
                '<div class="consult-result-item"><div class="consult-result-icon">🎫</div><div class="consult-result-label">هزینه امتیاز</div><div class="consult-result-value">'+formatAmount(cr.fee)+' <small>تومان</small></div></div>' +
                '<div class="consult-result-item"><div class="consult-result-icon">📊</div><div class="consult-result-label">نرخ سود</div><div class="consult-result-value">'+toPersianDigits(rate)+'٪ <small>سالانه</small></div></div>' +
                '</div>' +
                '<div class="info-box"><strong>💡 توضیح:</strong> مبالغ توسط کارشناس اعتبارسنجی محاسبه شده و مبنای نهایی است.</div>';
        }

        const fd = application.data.finalDocs || {};
        const fList = document.getElementById('finalDocsList');
        if (fList) {
            fList.innerHTML = '';
            FINAL_DOCS.forEach(doc => {
                const uploaded = fd[doc.id] || null;
                const item = document.createElement('div');
                item.className = 'doc-item required';
                if (uploaded) item.classList.add('uploaded');
                item.dataset.docId = doc.id;
                item.innerHTML = buildFinalDocItemHTML(doc, uploaded);
                fList.appendChild(item);
            });
            bindFinalDocsEvents();
        }

        if (application.data.finalization && application.data.finalization.paymentMethod)
            restorePaymentMethod(application.data.finalization.paymentMethod);

        const cbTerms = document.getElementById('w_termsAgreed');
        if (cbTerms) cbTerms.checked = !!(application.data.finalization && application.data.finalization.termsAgreed);
        syncTermsCheckbox();
    }

    function buildFinalDocItemHTML(doc, uploaded) {
        const status = uploaded ? '<span class="doc-status done">✅ بارگذاری شد</span>' : '<span class="doc-status pending">⚠️ در انتظار</span>';
        let body = '';
        if (uploaded) {
            const preview = uploaded.mime && uploaded.mime.indexOf('image/') === 0 && uploaded.dataUrl
                ? '<img src="'+uploaded.dataUrl+'">' : (uploaded.mime === 'application/pdf' ? '📄' : '📎');
            body = '<div class="doc-file-info"><div class="doc-file-preview">'+preview+'</div>' +
                '<div class="doc-file-details"><div class="doc-file-name">'+escapeHtml(uploaded.name)+'</div>' +
                '<div class="doc-file-meta">'+formatFileSize(uploaded.size)+' · '+(uploaded.mime||'')+'</div></div>' +
                '<div class="doc-actions"><button type="button" class="doc-action-btn" data-action="preview">👁️</button>' +
                '<button type="button" class="doc-action-btn danger" data-action="remove">🗑️</button></div></div>';
        } else {
            body = '<div class="doc-upload-area"><input type="file" class="doc-file-input" id="file_'+doc.id+'" accept=".jpg,.jpeg,.png,.pdf">' +
                '<label for="file_'+doc.id+'" class="doc-upload-btn"><span>📤</span><span>انتخاب فایل</span></label></div><div class="doc-error"></div>';
        }
        return '<div class="doc-head"><div class="doc-head-left">' +
            '<h4 class="doc-title">'+escapeHtml(doc.title)+' <span class="badge-required">اجباری</span></h4>' +
            '<p class="doc-desc">'+escapeHtml(doc.desc)+'</p></div>' + status + '</div>' + body;
    }

    function bindFinalDocsEvents() {
        const list = document.getElementById('finalDocsList'); if (!list) return;
        list.querySelectorAll('.doc-file-input').forEach(i => i.addEventListener('change', handleFinalDocUpload));
        list.querySelectorAll('.doc-action-btn').forEach(b => b.addEventListener('click', handleFinalDocAction));
    }

    function handleFinalDocUpload(e) {
        const input = e.target; const file = input.files && input.files[0]; if (!file) return;
        const item = input.closest('.doc-item'); const docId = item.dataset.docId;
        const errEl = item.querySelector('.doc-error');
        if (errEl) { errEl.textContent = ''; errEl.classList.remove('show'); }
        if (file.size > FILE_LIMITS.maxSizeBytes) {
            showDocError(errEl, 'حجم بیش از ' + FILE_LIMITS.maxSizeMB + ' مگابایت.'); input.value = ''; return;
        }
        const mime = (file.type||'').toLowerCase();
        const ext = (file.name.split('.').pop()||'').toLowerCase();
        if (FILE_LIMITS.allowedMimes.indexOf(mime)===-1 && FILE_LIMITS.allowedExts.indexOf(ext)===-1) {
            showDocError(errEl, 'فرمت مجاز نیست.'); input.value = ''; return;
        }
        const reader = new FileReader();
        reader.onload = function (ev) {
            const dataUrl = ev.target.result;
            if (!application.data.finalDocs) application.data.finalDocs = {};
            application.data.finalDocs[docId] = { id: docId, name: file.name, size: file.size, mime: mime, dataUrl: dataUrl, uploadedAt: new Date().toISOString() };
            Store.saveApplication(application); Store.saveDraft(currentUser.id, { applicationId: application.id });
            syncDocumentToDB('finalDocs', docId, application.data.finalDocs[docId]);
            const doc = FINAL_DOCS.find(d => d.id === docId);
            item.classList.add('uploaded');
            item.innerHTML = buildFinalDocItemHTML(doc, application.data.finalDocs[docId]);
            item.querySelector('.doc-action-btn[data-action="preview"]').addEventListener('click', handleFinalDocAction);
            item.querySelector('.doc-action-btn[data-action="remove"]').addEventListener('click', handleFinalDocAction);
            hideMessage();
        };
        reader.onerror = function () { showDocError(errEl, 'خطا در خواندن فایل.'); };
        reader.readAsDataURL(file);
    }

    function handleFinalDocAction(e) {
        e.preventDefault(); const btn = e.currentTarget;
        const action = btn.dataset.action; const item = btn.closest('.doc-item');
        const docId = item.dataset.docId;
        if (action === 'preview') openDocPreview(application.data.finalDocs[docId]);
        else if (action === 'remove') {
            if (!confirm('این سفته حذف شود؟')) return;
            delete application.data.finalDocs[docId];
            Store.saveApplication(application); Store.saveDraft(currentUser.id, { applicationId: application.id });
            syncApplicationToDB();
            const doc = FINAL_DOCS.find(d => d.id === docId);
            item.classList.remove('uploaded'); item.innerHTML = buildFinalDocItemHTML(doc, null);
            item.querySelector('.doc-file-input').addEventListener('change', handleFinalDocUpload);
        }
    }

    // ==========================================
    // گام ۶: بررسی کارگزار — پیش‌نویس قرارداد
    // ==========================================
    function generateContractHTML() {
        const d = application.data;
        const id = d.identityAndJob || {};
        const li = d.loanInfo || {};
        const cr = d.consultationResult || {};
        const bank = BANK_LOANS.find(b => b.id === li.bankLoanType) || { name: '—' };
        const today = new Date().toLocaleDateString('fa-IR');
        const broker = (typeof getRealBrokerInfo === 'function') ? getRealBrokerInfo() : { name: '—', code: '—' };
        const currentUserMobile = (currentUser && currentUser.mobile) || '—';
        const applicantName = ((id.firstName || '') + ' ' + (id.lastName || '')).trim() || '—';

        const templateData = {
            applicant_name: applicantName,
            applicant_national_id: id.nationalId || '—',
            applicant_father_name: id.fatherName || '—',
            applicant_mobile: currentUserMobile,
            applicant_address: id.address || '—',
            broker_name: broker.name || '—',
            broker_code: broker.code || '—',
            bank_name: bank.name || '—',
            loan_amount: formatAmount(cr.totalLoan || 0),
            loan_months: '24',
            monthly_installment: formatAmount(cr.monthlyInstallment || 0),
            interest_rate: toPersianDigits(cr.interestRate || 18),
            broker_fee: formatAmount(cr.fee || 0),
            contract_id: application.id || '—',
            today_date: today,
            payment_method: (getPaymentMethod() === 'check') ? 'چک' : 'حساب امانی',
            check_amount: formatAmount(cr.totalLoan || 0),
            check_date: '—',
            check_sayad: '—',
            check_issuer: applicantName,
            check_recipient: 'شرکت وام پی'
        };

        let contractText = '';
        if (window.ContractTemplate && typeof window.ContractTemplate.renderContract === 'function') {
            try {
                contractText = window.ContractTemplate.renderContract(templateData);
            } catch (e) {
                console.error('[generateContractHTML] renderContract error:', e);
            }
        }
        if (!contractText || contractText.length < 50) {
            console.warn('⚠️ ContractTemplate در دسترس نیست — استفاده از متن پیش‌فرض داخلی');
            contractText = 'اینجانب ' + applicantName + ' به کد ملی ' + (id.nationalId || '—') + '، ' +
                'با آگاهی کامل از مفاد قرارداد واگذاری تسهیلات بانک ' + bank.name + ' به مبلغ ' +
                formatAmount(cr.totalLoan || 0) + ' تومان، ' +
                'با مدت بازپرداخت ۲۴ ماه و قسط ماهیانه ' + formatAmount(cr.monthlyInstallment || 0) + ' تومان، ' +
                'با نرخ سود ' + toPersianDigits(cr.interestRate || 18) + '٪ سالانه، ' +
                'و با پرداخت حق‌الزحمه واگذاری (جُعل) به مبلغ ' + formatAmount(cr.fee || 0) + ' تومان، ' +
                'کلیه شرایط این قرارداد را می‌پذیرم.\n\n' +
                'واگذارکننده: ' + broker.name + ' (کد: ' + broker.code + ')\n' +
                'روش پرداخت: ' + templateData.payment_method + '\n' +
                'تاریخ تنظیم: ' + today;
        }

        return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<title>پیش‌نویس قرارداد واگذاری تسهیلات</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Vazirmatn',Tahoma,sans-serif;background:#fff;color:#1a2b22;padding:40px;line-height:1.9;font-size:14px;direction:rtl}
.contract{max-width:800px;margin:0 auto}
.header{text-align:center;padding-bottom:20px;border-bottom:3px double #0b3b23;margin-bottom:24px}
.header h1{font-size:22px;color:#0b3b23;font-weight:900;margin-bottom:6px}
.header .sub{font-size:13px;color:#77847b}
.header .badge{display:inline-block;background:rgba(212,166,42,.15);color:#8a6d1a;padding:4px 12px;border-radius:99px;font-size:11px;font-weight:700;margin-top:8px}
.content{white-space:pre-wrap;font-size:13px;line-height:2;text-align:right;font-family:'Vazirmatn',Tahoma,sans-serif}
.sig{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:30px;padding-top:20px;border-top:2px dashed #e2e6e0}
.sig .box{text-align:center;padding:30px 10px 10px;border:1.5px solid #e2e6e0;border-radius:10px}
.sig .box .label{font-size:12px;font-weight:700;color:#0b3b23;margin-bottom:30px}
.sig .box .line{border-top:1px dashed #77847b;margin:30px 10px 4px;font-size:11px;color:#77847b}
.footer{margin-top:30px;padding-top:16px;border-top:1px solid #e2e6e0;text-align:center;font-size:11px;color:#77847b}
@media print{body{padding:20px}}
</style>
</head>
<body>
<div class="contract">
<div class="header">
<h1>پیش‌نویس قرارداد واگذاری تسهیلات</h1>
<div class="sub">سامانه هوشمند تسهیلات وام پی</div>
<div class="badge">⚠️ این سند پیش‌نویس است و به‌عنوان اصل قرارداد تلقی نمی‌شود</div>
</div>
<div class="content">${escapeHtml(contractText)}</div>
<div class="sig">
<div class="box"><div class="label">امضای واگذارگیرنده (متقاضی)</div><div class="line">نام و امضا</div></div>
<div class="box"><div class="label">امضای واگذارکننده (کارگزار)</div><div class="line">نام و امضا</div></div>
</div>
<div class="footer">
<div>سامانه هوشمند تسهیلات وام پی — WAM PAY</div>
<div>تاریخ تنظیم پیش‌نویس: ${today}</div>
</div>
</div>
</body>
</html>`;
    }

    function getRealBrokerInfo() {
        try {
            const allUsers = JSON.parse(localStorage.getItem('wamPayUsers') || '[]');
            const realBroker = allUsers.find(u => u.role === 'broker');
            if (realBroker) {
                return {
                    id: realBroker.id,
                    name: realBroker.name,
                    code: 'BRK-' + String(realBroker.id).slice(-6)
                };
            }
        } catch (_) {}
        return { id: 'broker_default', name: 'کارگزار سامانه', code: 'BRK-000' };
    }

    function ensureContractFlowData() {
        const cf = application.data.contractFlow;
        if (cf && cf.contractFile && cf.contractFile.dataUrl) return;

        const broker = getRealBrokerInfo();
        let contractHTML, dataUrl, fileName, draftedBy;
        
        if (application.legalDraftContent) {
            console.log('📄 [Contract] استفاده از پیش‌نویس حقوقی آپلود شده توسط مدیر کل');
            dataUrl = application.legalDraftContent;
            const isPdf = dataUrl.startsWith('data:application/pdf');
                fileName = 'پیش‌نویس_حقوقی_' + application.caseNumber + (isPdf ? '.pdf' : '.html');
            draftedBy = 'کارشناس حقوقی وام پی';
            contractHTML = dataUrl;
        } else {
            console.log('📄 [Contract] تولید پیش‌نویس پیش‌فرض (هنوز مدیر کل آپلود نکرده)');
            contractHTML = generateContractHTML();
            dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(contractHTML);
             fileName = 'پیش‌نویس_قرارداد_واگذاری_' + application.id + '.html';
            draftedBy = 'کارشناس حقوقی وام پی';
        }

        const now = new Date();

        const base = cf || {
            brokerReview: {
                status: 'approved',
                brokerId: broker.id, brokerName: broker.name, brokerCode: broker.code,
                note: 'پرونده بررسی شد. مدارک و اطلاعات مطابق استانداردهای بانکی است.',
                reviewedAt: now.toISOString()
            },
            brokerDraftApproval: {
                status: 'approved', approvedAt: now.toISOString(),
                brokerName: broker.name,
                note: 'مفاد پیش‌نویس مورد بررسی و تأیید قرار گرفت.'
            },
            applicantRead: { readAt: null },
            applicantApproval: { status: 'pending', approvedAt: null, note: null },
            superAdminApproval: { status: 'pending', approvedAt: null, superAdminName: 'جناب آقای پاکذاتی' }
        };

        base.contractFile = {
            fileName: fileName, dataUrl: dataUrl, size: (contractHTML || '').length,
            mime: 'text/html', draftedBy: draftedBy,
            draftedAt: now.toISOString(),
            legalNote: application.legalDraftContent 
                ? 'پیش‌نویس توسط مدیر کل سامانه تنظیم و تأیید شده است.'
                : 'پیش‌نویس طبق استانداردهای بانکی تنظیم شده است.'
        };
        application.data.contractFlow = base;
        Store.saveApplication(application);
    }

    function renderContractStep() {
        ensureContractFlowData();
        const cf = application.data.contractFlow || {};
        const flow = document.getElementById('contractFlow');
        if (!flow) return;

        const br = cf.brokerReview || {};
        const cfile = cf.contractFile || {};
        const bda = cf.brokerDraftApproval || {};
        const aread = cf.applicantRead || {};
        const aappr = cf.applicantApproval || {};
        const saa = cf.superAdminApproval || {};

        const isRead = !!aread.readAt;
        const isApproved = aappr.status === 'approved';
        const isSuperAdminApproved = saa.status === 'approved';
        const isPendingSuperAdmin = application.status === 'contract_review_pending_superadmin';

        flow.innerHTML =
            '<div class="contract-stage done">' +
                '<div class="contract-stage-head"><div class="contract-stage-num">✓</div>' +
                '<div style="flex:1"><h4 class="contract-stage-title">مرحله ۱: بررسی و تأیید پرونده</h4>' +
                '<p class="contract-stage-sub">پرونده توسط کارگزار بررسی و تأیید شد</p></div></div>' +
                '<div class="contract-stage-body">' +
                    '<span class="contract-stage-status done">✅ تأیید شد</span>' +
                    '<div class="contract-person"><div class="avatar">' + escapeHtml((br.brokerName||'م').charAt(0)) + '</div>' +
                    '<span>' + escapeHtml(br.brokerName||'—') + ' <b>— کد: ' + escapeHtml(br.brokerCode||'—') + '</b></span></div>' +
                    (br.note ? '<div style="font-size:12px;color:var(--wam-text-muted);margin-top:6px;line-height:1.8">📝 '+escapeHtml(br.note)+'</div>' : '') +
                '</div>' +
            '</div>' +

            '<div class="contract-stage done">' +
                '<div class="contract-stage-head"><div class="contract-stage-num">✓</div>' +
                '<div style="flex:1"><h4 class="contract-stage-title">مرحله ۲: تنظیم پیش‌نویس قرارداد واگذاری</h4>' +
                '<p class="contract-stage-sub">پیش‌نویس توسط مدیر کل سامانه تنظیم شد</p></div></div>' +
                '<div class="contract-stage-body">' +
                    '<span class="contract-stage-status done">✅ تنظیم شد</span>' +
                    '<div class="contract-person"><div class="avatar">⚖️</div>' +
                    '<span>' + escapeHtml(cfile.draftedBy||'کارشناس حقوقی') + '</span></div>' +
                '</div>' +
            '</div>' +

            '<div class="contract-stage ' + (isRead ? 'done' : 'active') + '">' +
                '<div class="contract-stage-head"><div class="contract-stage-num">' + (isRead ? '✓' : '۳') + '</div>' +
                '<div style="flex:1"><h4 class="contract-stage-title">مرحله ۳: دریافت و مطالعه پیش‌نویس</h4>' +
                '<p class="contract-stage-sub">لطفاً فایل پیش‌نویس را دانلود و به‌طور کامل مطالعه فرمایید</p></div></div>' +
                '<div class="contract-stage-body">' +
                    '<span class="contract-stage-status ' + (isRead ? 'done' : 'active') + '">' +
                    (isRead ? '✅ مطالعه شد' : '🔔 نیاز به اقدام') + '</span>' +
                    '<div class="contract-draft-card">' +
                        '<div class="contract-draft-head">' +
                            '<div class="contract-draft-icon">📄</div>' +
                            '<div class="contract-draft-info">' +
                                '<div class="contract-draft-name">' + escapeHtml(cfile.fileName||'—') + '</div>' +
                                '<div class="contract-draft-meta">تنظیم: ' + escapeHtml(cfile.draftedBy||'—') +
                                ' · حجم: ' + formatFileSize(cfile.size) + ' · تاریخ: ' + new Date(cfile.draftedAt||Date.now()).toLocaleDateString('fa-IR') + '</div>' +
                            '</div>' +
                        '</div>' +
                        '<button type="button" class="contract-download-btn' + (isRead ? ' done' : '') + '" id="downloadContractBtn">' +
                            (isRead ? '📥 دانلود مجدد پیش‌نویس' : '📥 دانلود پیش‌نویس قرارداد') +
                        '</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<div class="contract-stage ' + (isApproved ? 'done' : (isRead ? 'active' : 'waiting')) + '">' +
                '<div class="contract-stage-head"><div class="contract-stage-num">' + (isApproved ? '✓' : '۴') + '</div>' +
                '<div style="flex:1"><h4 class="contract-stage-title">مرحله ۴: تأیید پیش‌نویس توسط واگذارگیرنده</h4>' +
                '<p class="contract-stage-sub">پس از مطالعه دقیق مفاد، پیش‌نویس را تأیید نمایید</p></div></div>' +
                '<div class="contract-stage-body">' +
                    '<span class="contract-stage-status ' + (isApproved ? 'done' : (isRead ? 'active' : 'waiting')) + '">' +
                    (isApproved ? '✅ تأیید شد' : (isRead ? '🔔 نیاز به اقدام' : '⏳ در انتظار مطالعه')) + '</span>' +
                    '<label class="contract-check' + (isApproved ? ' checked' : '') + '" id="applicantApproveCheck" ' + (!isRead ? 'style="opacity:.5;pointer-events:none"' : '') + '>' +
                        '<input type="checkbox" id="w_applicantContractApproved"' + (isApproved ? ' checked' : '') + '>' +
                        '<span class="contract-check-box"></span>' +
                        '<span class="contract-check-text"><strong>مفاد قرارداد واگذاری تسهیلات را مطالعه نمودم و مورد تایید است.</strong></span>' +
                    '</label>' +
                '</div>' +
            '</div>' +

            '<div class="contract-stage ' + (isSuperAdminApproved ? 'done' : (isApproved ? 'active' : 'waiting')) + '">' +
                '<div class="contract-stage-head"><div class="contract-stage-num">' + (isSuperAdminApproved ? '✓' : '۵') + '</div>' +
                '<div style="flex:1"><h4 class="contract-stage-title">مرحله ۵: تأیید پیش‌نویس توسط مدیر کل</h4>' +
                '<p class="contract-stage-sub">تأیید نهایی توسط مدیر ارشد سامانه</p></div></div>' +
                '<div class="contract-stage-body">' +
                    '<span class="contract-stage-status ' + (isSuperAdminApproved ? 'done' : (isApproved ? 'active' : 'waiting')) + '">' +
                    (isSuperAdminApproved ? '✅ تأیید شد' : (isApproved ? '⏳ در انتظار تأیید مدیر کل' : '⏳ در انتظار تأیید شما')) + '</span>' +
                    (isSuperAdminApproved
                        ? '<div class="contract-person"><div class="avatar">' + escapeHtml((saa.superAdminName||'م').charAt(0)) + '</div>' +
                          '<span>' + escapeHtml(saa.superAdminName||'مدیر کل') + '</span></div>'
                        : '') +
                    (isPendingSuperAdmin 
                        ? '<div style="margin-top:10px;padding:12px;background:rgba(230,126,34,.1);border-right:4px solid #e67e22;border-radius:8px;font-size:12.5px;line-height:1.8">⏳ پرونده برای تأیید به مدیر کل ارسال شد. منتظر بمانید...</div>'
                        : '') +
                '</div>' +
            '</div>';

        const dlBtn = document.getElementById('downloadContractBtn');
        if (dlBtn) dlBtn.addEventListener('click', handleContractDownload);

        const cbApprove = document.getElementById('w_applicantContractApproved');
        const checkLabel = document.getElementById('applicantApproveCheck');
        if (cbApprove && checkLabel) {
            cbApprove.addEventListener('change', function () {
                checkLabel.classList.toggle('checked', this.checked);
                handleApplicantApproval(this.checked);
            });
        }
    }

    // 🆕 v15.2.0: تغییر وضعیت به awaiting_signature (بدون بازگشت به مدیر کل)
    function handleApplicantApproval(approved) {
        const cf = application.data.contractFlow;
        if (!cf) return;

        if (approved) {
            cf.applicantApproval = {
                status: 'approved',
                approvedAt: new Date().toISOString(),
                note: 'واگذارگیرنده مفاد پیش‌نویس را مطالعه و تأیید کرد.'
            };
            
            // 🆕 v15.2.0: مستقیم به awaiting_signature — مدیر کل قبلاً تأیید کرده
            application.status = 'awaiting_signature';
            
            Store.saveApplication(application);
            Store.saveDraft(currentUser.id, { applicationId: application.id });
            syncApplicationToDB();

            // 🆕 v15.2.0: پیام اصلاح‌شده
            showMessage('✅ پیش‌نویس را تأیید کردید. آماده برای امضای الکترونیکی.', 'success');
            
            setTimeout(() => {
                if (STEPS[currentStep].key === 'contractReview') renderContractStep();
            }, 500);
        } else {
            cf.applicantApproval = { status: 'pending', approvedAt: null, note: null };
            Store.saveApplication(application);
            Store.saveDraft(currentUser.id, { applicationId: application.id });
            syncApplicationToDB();
        }
    }

    function handleContractDownload() {
    let cf = application.data.contractFlow;
    if (!cf || !cf.contractFile) {
        ensureContractFlowData();
        cf = application.data.contractFlow;
    }
    if (!cf || !cf.contractFile) {
        showMessage('فایل پیش‌نویس موجود نیست.', 'error');
        return;
    }

    // 🆕 v15.1.0: تشخیص PDF و نمایش در تب جدید
    const isPdf = application.legalDraftContent && 
                  application.legalDraftContent.startsWith('data:application/pdf');

    if (isPdf) {
        console.log('📄 [Contract] پیش‌نویس PDF تشخیص داده شد');
        try {
            const w = window.open('', '_blank');
            if (!w) {
                showMessage('⚠️ popup مسدود شد. لطفاً popup را مجاز کنید.', 'error');
                return;
            }

            const base64 = application.legalDraftContent.split(',')[1];
            const bin = atob(base64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            const blob = new Blob([arr], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            w.location.href = url;

            markContractAsRead(cf);
            showMessage('✅ پیش‌نویس PDF باز شد. لطفاً مطالعه فرمایید.', 'success');
            setTimeout(() => { renderContractStep(); }, 500);
        } catch (err) {
            console.error('PDF display error:', err);
            showMessage('خطا در نمایش PDF: ' + err.message, 'error');
        }
        return;
    }

    // مسیر HTML (روش قبلی)
    try {
        let htmlContent;
        if (application.legalDraftContent) {
            if (application.legalDraftContent.startsWith('data:text/html')) {
                htmlContent = decodeURIComponent(application.legalDraftContent.replace('data:text/html;charset=utf-8,', ''));
            } else if (application.legalDraftContent.startsWith('data:text/html;base64,')) {
                htmlContent = atob(application.legalDraftContent.replace('data:text/html;base64,', ''));
            } else {
                htmlContent = application.legalDraftContent;
            }
        } else {
            htmlContent = generateContractHTML();
        }

        if (!htmlContent || htmlContent.length < 100) {
            showMessage('محتوای قرارداد خالی است.', 'error');
            return;
        }

        const w = window.open('', '_blank');
        if (!w) {
            console.warn('⚠️ popup blocked — استفاده از fallback download');
            const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = cf.contractFile.fileName || 'contract-draft.html';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            markContractAsRead(cf);
            showMessage('📥 فایل پیش‌نویس دانلود شد. آن را در مرورگر باز کنید و "Save as PDF" بزنید.', 'success');
            setTimeout(() => { renderContractStep(); }, 500);
            return;
        }

        w.document.open();
        w.document.write(htmlContent);
        w.document.close();

        let printed = false;
        const doPrint = function () {
            if (printed) return;
            printed = true;
            try {
                w.focus();
                w.print();
                markContractAsRead(cf);
                showMessage('✅ پنجره‌ی چاپ باز شد. لطفاً «Save as PDF» را انتخاب کنید.', 'success');
                setTimeout(() => { renderContractStep(); }, 500);
            } catch (e) {
                console.error('Print error:', e);
                showMessage('خطا در چاپ: ' + e.message, 'error');
            }
        };

        w.onload = function () {
            setTimeout(doPrint, 600);
        };

        setTimeout(function () {
            if (printed) return;
            doPrint();
        }, 2000);

    } catch (err) {
        console.error('handleContractDownload error:', err);
        showMessage('خطا در دانلود فایل: ' + err.message, 'error');
    }
}

    function markContractAsRead(cf) {
        if (!cf.applicantRead) cf.applicantRead = {};
        if (!cf.applicantRead.readAt) {
            cf.applicantRead.readAt = new Date().toISOString();
            Store.saveApplication(application);
            Store.saveDraft(currentUser.id, { applicationId: application.id });
            syncApplicationToDB();
        }
    }

    // ==========================================
    // گام ۷: امضای الکترونیکی
    // ==========================================
    function initESignature() {
        if (!application.data.eSignature) {
            application.data.eSignature = {
                reAuth: { verifiedAt: null },
                checkInfo: null,
                applicantSignature: null,
                brokerSignature: null,
                superAdminSignature: null,
                finalContract: null,
                completedAt: null,
                startedAt: new Date().toISOString(),
                currentStageKey: 'summary'
            };
            Store.saveApplication(application);
        }

        buildESigStageKeys();
        const es = application.data.eSignature;
        let stageKey = es.currentStageKey || 'summary';

        if (eSigStageKeys.indexOf(stageKey) === -1) {
            if (es.finalContract) stageKey = 'issue';
            else if (es.superAdminSignature && es.brokerSignature) stageKey = 'chain';
            else if (es.applicantSignature && es.applicantSignature.confirmed) stageKey = 'review';
            else if (es.applicantSignature) stageKey = 'review';
            else if (es.checkInfo && es.checkInfo.recipientConfirmed) stageKey = 'signature';
            else if (es.reAuth && es.reAuth.verifiedAt) {
                stageKey = (getPaymentMethod() === 'check' && !es.checkInfo) ? 'checkInfo' : 'signature';
            }
            else stageKey = 'summary';
        }

        eSigStage = eSigStageKeys.indexOf(stageKey);
        if (eSigStage < 0) eSigStage = 0;
    }

    function renderESignatureStep() {
        initESignature();
        const flow = document.getElementById('signatureFlow');
        if (!flow) return;

        const stageKey = currentESigKey();
        let content = buildESigProgress();

        switch (stageKey) {
            case 'summary':    content += buildESigStage0(); break;
            case 'commitment': content += buildESigStage1(); break;
            case 'otp':        content += buildESigStage2(); break;
            case 'checkInfo':  content += buildESigCheckInfoStage(); break;
            case 'signature':  content += buildESigStage3(); break;
            case 'review':     content += buildESigStage4(); break;
            case 'chain':      content += buildESigStage5(); break;
            case 'issue':      content += buildESigStage6(); break;
        }
        flow.innerHTML = content;

        switch (stageKey) {
            case 'summary':    bindESigStage0(); break;
            case 'commitment': bindESigStage1(); break;
            case 'otp':        bindESigStage2(); break;
            case 'checkInfo':  bindESigCheckInfoStage(); break;
            case 'signature':  bindESigStage3(); break;
            case 'review':     bindESigStage4(); break;
            case 'chain':      bindESigStage5(); break;
            case 'issue':      bindESigStage6(); break;
        }
    }

    function buildESigProgress() {
        let html = '<div class="esignature-progress">';
        eSigStageKeys.forEach((key, i) => {
            const def = ESIG_STAGE_DEFS[key];
            let cls = 'esig-dot';
            if (i < eSigStage) cls += ' done';
            else if (i === eSigStage) cls += ' active';
            const inner = i < eSigStage ? '' : toPersianDigits(i + 1);
            html += '<div class="' + cls + '" title="' + def.label + '">' + inner + '</div>';
        });
        html += '</div>';
        return html;
    }

    function buildESigStage0() {
        const id = application.data.identityAndJob || {};
        const li = application.data.loanInfo || {};
        const cr = application.data.consultationResult || {};
        const cf = application.data.contractFlow || {};
        const bank = BANK_LOANS.find(b => b.id === li.bankLoanType) || { name: '—' };

        const br = cf.brokerReview || {};
        const aappr = cf.applicantApproval || {};
        const saa = cf.superAdminApproval || {};

        const fmt = (iso) => formatDateTimeFa(iso);

        return '<div class="esig-stage">' +
            '<div class="esig-stage-title"><div class="esig-stage-icon">📋</div><span>مرحله ۱ از ' + toPersianDigits(eSigTotalStages()) + ' — خلاصه قرارداد واگذاری تسهیلات</span></div>' +
            '<p class="esig-stage-sub">قبل از امضا، لطفاً یک بار دیگر اطلاعات زیر را بررسی کنید.</p>' +

            '<div class="contract-summary-box">' +
                '<div class="contract-summary-row"><span>👤 واگذارگیرنده</span><span>' + escapeHtml((id.firstName||'') + ' ' + (id.lastName||'')) + '</span></div>' +
                '<div class="contract-summary-row"><span>🆔 کد ملی</span><span>' + toPersianDigits(id.nationalId||'—') + '</span></div>' +
                '<div class="contract-summary-row"><span>🏦 بانک عامل</span><span>' + escapeHtml(bank.name) + '</span></div>' +
                '<div class="contract-summary-row"><span>💰 مبلغ کل تسهیلات</span><span>' + formatAmount(cr.totalLoan) + ' تومان</span></div>' +
                '<div class="contract-summary-row"><span>📅 قسط ماهیانه</span><span>' + formatAmount(cr.monthlyInstallment) + ' تومان</span></div>' +
                '<div class="contract-summary-row"><span>📊 نرخ سود</span><span>' + toPersianDigits(cr.interestRate || 18) + '٪ سالانه</span></div>' +
                '<div class="contract-summary-row"><span>🎫 حق‌الزحمه واگذاری (جُعل)</span><span>' + formatAmount(cr.fee) + ' تومان</span></div>' +
                '<div class="contract-summary-row"><span>💳 روش پرداخت</span><span>' + (getPaymentMethod() === 'check' ? '📄 چک' : '🏦 حساب امانی') + '</span></div>' +
            '</div>' +

            '<div class="contract-approvers">' +
                '<div class="contract-approver"><div class="contract-approver-avatar">' + escapeHtml((br.brokerName||'م').charAt(0)) + '</div>' +
                    '<div class="contract-approver-info"><div class="contract-approver-name">' + escapeHtml(br.brokerName||'—') + '</div>' +
                    '<div class="contract-approver-role">واگذارکننده — ' + escapeHtml(br.brokerCode||'—') + ' — ' + fmt(br.reviewedAt) + '</div></div>' +
                    '<span class="contract-approver-status">✅ تأیید</span></div>' +
                '<div class="contract-approver"><div class="contract-approver-avatar">👤</div>' +
                    '<div class="contract-approver-info"><div class="contract-approver-name">شما (واگذارگیرنده)</div>' +
                    '<div class="contract-approver-role">متقاضی — ' + fmt(aappr.approvedAt) + '</div></div>' +
                    '<span class="contract-approver-status">✅ تأیید</span></div>' +
                '<div class="contract-approver"><div class="contract-approver-avatar">' + escapeHtml((saa.superAdminName||'م').charAt(0)) + '</div>' +
                    '<div class="contract-approver-info"><div class="contract-approver-name">' + escapeHtml(saa.superAdminName||'مدیر کل') + '</div>' +
                    '<div class="contract-approver-role">مدیر کل — ' + fmt(saa.approvedAt) + '</div></div>' +
                    '<span class="contract-approver-status">✅ تأیید</span></div>' +
            '</div>' +

            '<div class="esig-actions">' +
                '<button type="button" class="btn btn-secondary" id="esigViewDraft">📄 مشاهده کامل پیش‌نویس</button>' +
                '<button type="button" class="btn btn-primary" id="esigNext1">متوجه شدم، ادامه ➜</button>' +
            '</div>' +
        '</div>';
    }

    function bindESigStage0() {
        const v = document.getElementById('esigViewDraft');
        if (v) v.addEventListener('click', () => {
            const cfile = (application.data.contractFlow || {}).contractFile || {};
            if (cfile.dataUrl) openDocPreview({ name: cfile.fileName || 'contract.html', mime: 'text/html', dataUrl: cfile.dataUrl });
        });
        const n = document.getElementById('esigNext1');
        if (n) n.addEventListener('click', () => { eSigGoTo('commitment'); });
    }

    function buildESigStage1() {
        const stageNum = eSigStageNumber();
        return '<div class="esig-stage">' +
            '<div class="esig-stage-title"><div class="esig-stage-icon">⚖️</div><span>مرحله ' + toPersianDigits(stageNum) + ' از ' + toPersianDigits(eSigTotalStages()) + ' — متن تعهد نهایی</span></div>' +
            '<p class="esig-stage-sub">لطفاً متن زیر را با دقت مطالعه و تأیید کنید.</p>' +
            '<div class="legal-text-box">' +
                '<strong>اینجانب با آگاهی کامل و بدون هیچ‌گونه اجبار، موارد زیر را می‌پذیرم:</strong>' +
                '<ol>' +
                    '<li><strong>صحت اطلاعات:</strong> صحت تمام اطلاعات ارائه‌شده را تأیید می‌کنم.</li>' +
                    '<li><strong>تعهد پرداخت:</strong> به پرداخت حق‌الزحمه واگذاری (جُعل) طبق شرایط توافق‌شده متعهد می‌شوم.</li>' +
                    '<li><strong>آگاهی از نقش وام‌پی:</strong> می‌دانم که سامانه وام‌پی صرفاً مشاور، معرف و بستر فنی است و طرف قرارداد نمی‌باشد.</li>' +
                    '<li><strong>اعتبار قانونی امضا:</strong> طبق <strong>ماده ۷ قانون تجارت الکترونیک ایران</strong>.</li>' +
                    '<li><strong>قابلیت استناد:</strong> این سند قابل ارائه به مراجع قضایی است.</li>' +
                    '<li><strong>حق انصراف:</strong> تا پیش از ثبت نهایی امضا محفوظ است.</li>' +
                '</ol>' +
            '</div>' +
            '<label class="esig-check" id="esigLegalCheck">' +
                '<input type="checkbox" id="esigLegalAccepted">' +
                '<span class="esig-check-box"></span>' +
                '<span class="esig-check-text"><strong>متن تعهد فوق را خوانده، درک کرده و می‌پذیرم.</strong></span>' +
            '</label>' +
            '<div class="esig-error" id="esigLegalErr">⚠️ برای ادامه، باید متن تعهد را بپذیرید.</div>' +
            '<div class="esig-actions">' +
                '<button type="button" class="btn btn-secondary" id="esigBack1">⮜ بازگشت</button>' +
                '<button type="button" class="btn btn-primary" id="esigNext2" disabled>ادامه ➜</button>' +
            '</div>' +
        '</div>';
    }

    function bindESigStage1() {
        const cb = document.getElementById('esigLegalAccepted');
        const label = document.getElementById('esigLegalCheck');
        const nextBtn2 = document.getElementById('esigNext2');
        const err = document.getElementById('esigLegalErr');
        if (cb) {
            cb.addEventListener('change', function () {
                label.classList.toggle('checked', this.checked);
                if (nextBtn2) nextBtn2.disabled = !this.checked;
                if (err && this.checked) err.classList.remove('show');
            });
        }
        document.getElementById('esigBack1').addEventListener('click', () => { eSigGoTo('summary'); });
        document.getElementById('esigNext2').addEventListener('click', () => {
            if (!cb.checked) { err.classList.add('show'); return; }
            eSigGoTo('otp');
        });
    }

    function buildESigStage2() {
        const stageNum = eSigStageNumber();
        const maskedMobile = currentUser.mobile ? currentUser.mobile.slice(0, 4) + '***' + currentUser.mobile.slice(-4) : '09xx***xxxx';
        return '<div class="esig-stage">' +
            '<div class="esig-stage-title"><div class="esig-stage-icon">🔐</div><span>مرحله ' + toPersianDigits(stageNum) + ' از ' + toPersianDigits(eSigTotalStages()) + ' — تأیید هویت مجدد</span></div>' +
            '<p class="esig-stage-sub">هویت شما با یک کد یک‌بارمصرف تأیید می‌شود.</p>' +
            '<div class="esig-otp-info">کد به شماره <strong>' + escapeHtml(maskedMobile) + '</strong> ارسال شد.</div>' +
            '<div class="otp-inputs" id="esigOtpInputs">' +
                '<input type="tel" maxlength="1" inputmode="numeric"><input type="tel" maxlength="1" inputmode="numeric"><input type="tel" maxlength="1" inputmode="numeric"><input type="tel" maxlength="1" inputmode="numeric"><input type="tel" maxlength="1" inputmode="numeric">' +
            '</div>' +
            '<div class="otp-meta">' +
                '<span>⏱️ انقضا: <strong id="esigOtpExpire">—</strong></span>' +
                '<button type="button" id="esigOtpResend" style="background:none;border:none;font-family:inherit;color:var(--wam-primary);font-weight:800;font-size:12px;cursor:pointer">ارسال مجدد</button>' +
            '</div>' +
            '<div class="esig-error" id="esigOtpErr">کد وارد شده صحیح نیست.</div>' +
            '<div class="esig-actions">' +
                '<button type="button" class="btn btn-secondary" id="esigBack2">⮜ بازگشت</button>' +
                '<button type="button" class="btn btn-primary" id="esigVerifyOtp" disabled>✅ تأیید کد</button>' +
            '</div>' +
        '</div>';
    }

    function bindESigStage2() {
        const inputs = document.querySelectorAll('#esigOtpInputs input');
        const verifyBtn = document.getElementById('esigVerifyOtp');
        const resendBtn = document.getElementById('esigOtpResend');
        const expireEl = document.getElementById('esigOtpExpire');
        const errEl = document.getElementById('esigOtpErr');

        eSigOTPCode = '12345';
        eSigOTPExpiresAt = Date.now() + 120000;
        console.log('🧪 [MOCK OTP e-Sign] کد شما: 12345');

        inputs.forEach((inp, idx) => {
            inp.value = '';
            inp.addEventListener('input', (e) => {
                const v = e.target.value.replace(/\D/g, '');
                e.target.value = v.slice(0, 1);
                e.target.classList.toggle('filled', !!e.target.value);
                if (e.target.value && idx < inputs.length - 1) inputs[idx + 1].focus();
                checkOtpComplete();
            });
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value && idx > 0) inputs[idx - 1].focus();
            });
            inp.addEventListener('paste', (e) => {
                e.preventDefault();
                const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
                if (paste) {
                    for (let i = 0; i < inputs.length && i < paste.length; i++) {
                        inputs[i].value = paste[i];
                        inputs[i].classList.add('filled');
                    }
                    const next = Math.min(paste.length, inputs.length - 1);
                    inputs[next].focus();
                    checkOtpComplete();
                }
            });
        });
        inputs[0].focus();

        function checkOtpComplete() {
            const full = Array.from(inputs).every(i => i.value.length === 1);
            verifyBtn.disabled = !full;
        }

        function updateExpire() {
            const left = Math.max(0, Math.floor((eSigOTPExpiresAt - Date.now()) / 1000));
            const mm = String(Math.floor(left / 60)).padStart(2, '0');
            const ss = String(left % 60).padStart(2, '0');
            expireEl.textContent = toPersianDigits(mm + ':' + ss);
            if (left <= 0) {
                clearInterval(eSigOTPExpireTimer);
                errEl.textContent = 'زمان کد به پایان رسیده.';
                errEl.classList.add('show');
                verifyBtn.disabled = true;
            }
        }
        updateExpire();
        clearInterval(eSigOTPExpireTimer);
        eSigOTPExpireTimer = setInterval(updateExpire, 1000);

        resendBtn.addEventListener('click', () => {
            eSigOTPExpiresAt = Date.now() + 120000;
            inputs.forEach(i => { i.value = ''; i.classList.remove('filled'); });
            inputs[0].focus();
            errEl.classList.remove('show');
            verifyBtn.disabled = true;
            updateExpire();
            clearInterval(eSigOTPExpireTimer);
            eSigOTPExpireTimer = setInterval(updateExpire, 1000);
            console.log('🧪 [MOCK OTP e-Sign] کد جدید: 12345');
            showMessage('✅ کد مجدداً ارسال شد.', 'success');
        });

        verifyBtn.addEventListener('click', () => {
            const entered = Array.from(inputs).map(i => i.value).join('');
            if (entered === eSigOTPCode && Date.now() < eSigOTPExpiresAt) {
                clearInterval(eSigOTPExpireTimer);
                application.data.eSignature.reAuth = {
                    method: 'otp',
                    mobile: currentUser.mobile,
                    verifiedAt: new Date().toISOString()
                };
                Store.saveApplication(application);
                if (getPaymentMethod() === 'check') {
                    eSigGoTo('checkInfo');
                } else {
                    eSigGoTo('signature');
                }
            } else {
                errEl.classList.add('show');
                inputs.forEach(i => i.classList.remove('filled'));
                inputs[0].focus();
                verifyBtn.disabled = true;
            }
        });

        document.getElementById('esigBack2').addEventListener('click', () => {
            clearInterval(eSigOTPExpireTimer);
            eSigGoTo('commitment');
        });
    }

    function buildESigCheckInfoStage() {
        const stageNum = eSigStageNumber();
        const cr = application.data.consultationResult || {};
        const id = application.data.identityAndJob || {};
        const es = application.data.eSignature;
        const saved = es.checkInfo || {};

        const totalLoan = cr.totalLoan || 0;
        const defaultRecipient = saved.recipientName || 'شرکت وام پی';
        const issuerName = ((id.firstName || '') + ' ' + (id.lastName || '')).trim();

        let savedYear = '', savedMonth = '', savedDay = '';
        if (saved.date && /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(saved.date)) {
            const parts = saved.date.split('/');
            savedYear = parts[0];
            savedMonth = String(parseInt(parts[1], 10));
            savedDay = String(parseInt(parts[2], 10));
        }

        let yearOpts = '<option value="">سال</option>';
        for (let y = 1410; y >= 1404; y--) {
            yearOpts += '<option value="' + y + '"' + (savedYear === String(y) ? ' selected' : '') + '>' + toPersianDigits(y) + '</option>';
        }
        let monthOpts = '<option value="">ماه</option>';
        JALALI_MONTHS.forEach((m, i) => {
            const mNum = i + 1;
            monthOpts += '<option value="' + mNum + '"' + (savedMonth === String(mNum) ? ' selected' : '') + '>' + m + '</option>';
        });
        let dayOpts = '<option value="">روز</option>';
        const jy = parseInt(savedYear, 10) || 1404;
        const jm = parseInt(savedMonth, 10) || 1;
        const days = getDaysInJalaliMonth(jy, jm);
        for (let d = 1; d <= days; d++) {
            dayOpts += '<option value="' + d + '"' + (savedDay === String(d) ? ' selected' : '') + '>' + toPersianDigits(d) + '</option>';
        }

        return '<div class="esig-stage">' +
            '<div class="esig-stage-title"><div class="esig-stage-icon">📄</div><span>مرحله ' + toPersianDigits(stageNum) + ' از ' + toPersianDigits(eSigTotalStages()) + ' — اطلاعات چک</span></div>' +
            '<p class="esig-stage-sub">اطلاعات چک را با دقت وارد کنید. این اطلاعات در سند نهایی درج خواهد شد.</p>' +

            '<div class="field" style="margin-bottom:12px">' +
                '<label>💰 مبلغ چک (تومان) <span class="req">*</span></label>' +
                '<div class="check-info-fixed" style="direction:ltr;text-align:right">' + formatAmount(totalLoan) + ' تومان</div>' +
                '<span class="hint">مبلغ چک برابر با مبلغ کل تسهیلات است.</span>' +
            '</div>' +

            '<div class="field" style="margin-bottom:12px">' +
                '<label>📅 تاریخ چک <span class="req">*</span></label>' +
                '<div class="check-date-jalali">' +
                    '<select id="esigCheckYear">' + yearOpts + '</select>' +
                    '<select id="esigCheckMonth">' + monthOpts + '</select>' +
                    '<select id="esigCheckDay">' + dayOpts + '</select>' +
                '</div>' +
                '<div class="esig-error" id="esigCheckDateErr">تاریخ چک را کامل وارد کنید.</div>' +
            '</div>' +

            '<div class="field" style="margin-bottom:12px">' +
                '<label>🔢 شماره صیادی (۱۶ رقم) <span class="req">*</span></label>' +
                '<input type="tel" inputmode="numeric" id="esigSayadNumber" maxlength="16" placeholder="۱۶ رقم" value="' + escapeHtml(saved.sayadNumber || '') + '" style="direction:ltr;text-align:center;letter-spacing:2px;font-family:monospace">' +
                '<div class="esig-error" id="esigSayadErr">شماره صیادی باید دقیقاً ۱۶ رقم باشد.</div>' +
            '</div>' +

            '<div class="field" style="margin-bottom:12px">' +
                '<label>👤 انتقال دهنده (صادرکننده چک) <span class="req">*</span></label>' +
                '<div class="check-info-fixed">' + escapeHtml(issuerName || '—') + '</div>' +
            '</div>' +

            '<div class="field" style="margin-bottom:12px">' +
                '<label>👥 انتقال گیرنده (ذی‌نفع) <span class="req">*</span></label>' +
                '<input type="text" id="esigRecipientName" value="' + escapeHtml(defaultRecipient) + '" placeholder="مثلاً: شرکت وام پی">' +
                '<div class="esig-error" id="esigRecipientErr">نام باید حداقل ۳ حرف باشد.</div>' +
            '</div>' +

            '<div class="field" style="margin-bottom:12px">' +
                '<label>📎 بارگذاری عکس چک <span class="req">*</span></label>' +
                '<div class="check-upload-area' + (saved.imageDataUrl ? ' uploaded' : '') + '" id="esigCheckUploadArea">' +
                    '<input type="file" class="check-upload-input" id="esigCheckFileInput" accept=".jpg,.jpeg,.png">' +
                    (saved.imageDataUrl
                        ? '<div style="text-align:center">' +
                            '<div style="font-size:32px;margin-bottom:8px">✅</div>' +
                            '<div style="font-size:13px;font-weight:800;color:var(--wam-success);margin-bottom:10px">تصویر چک بارگذاری شد</div>' +
                            '<img src="' + saved.imageDataUrl + '" class="check-upload-preview" alt="چک">' +
                            '<div class="check-upload-info">' +
                                '<span class="icon">📄</span>' +
                                '<div class="text">' +
                                    '<strong>' + escapeHtml(saved.imageName || 'check.jpg') + '</strong>' +
                                    '<span>' + formatFileSize(saved.imageSize || 0) + '</span>' +
                                '</div>' +
                                '<button type="button" class="remove-btn" id="esigCheckRemoveBtn" title="حذف تصویر">🗑️</button>' +
                            '</div>' +
                          '</div>'
                        : '<div style="font-size:32px;margin-bottom:8px">📤</div>' +
                          '<div style="font-size:13.5px;font-weight:800;color:var(--wam-primary)">برای بارگذاری عکس چک کلیک کنید</div>' +
                          '<div style="font-size:11.5px;color:var(--wam-text-muted);margin-top:4px">JPG یا PNG — حداکثر ۳MB</div>') +
                '</div>' +
                '<div class="esig-error" id="esigCheckImageErr">لطفاً عکس چک را بارگذاری کنید.</div>' +
            '</div>' +

            '<label class="check-sayad-confirm' + (saved.recipientConfirmed ? ' checked' : '') + '" id="esigSayadConfirmLabel">' +
                '<input type="checkbox" id="esigSayadConfirmed"' + (saved.recipientConfirmed ? ' checked' : '') + '>' +
                '<span class="box"></span>' +
                '<span class="text">' +
                    '<strong>تأیید ثبت صیادی چک توسط گیرنده</strong><br>' +
                    'اینجانب تأیید می‌کنم که اطلاعات چک فوق در سامانه صیاد ثبت شده است.' +
                '</span>' +
            '</label>' +
            '<div class="esig-error" id="esigSayadConfirmErr">تأیید ثبت صیادی الزامی است.</div>' +

            '<div class="esig-actions">' +
                '<button type="button" class="btn btn-secondary" id="esigBackCheck">⮜ بازگشت</button>' +
                '<button type="button" class="btn btn-primary" id="esigConfirmCheckInfo">✅ تأیید و ادامه ➜</button>' +
            '</div>' +
        '</div>';
    }

    function bindESigCheckInfoStage() {
        const cr = application.data.consultationResult || {};
        const id = application.data.identityAndJob || {};
        const totalLoan = cr.totalLoan || 0;
        const issuerName = ((id.firstName || '') + ' ' + (id.lastName || '')).trim();

        const yearSel = document.getElementById('esigCheckYear');
        const monthSel = document.getElementById('esigCheckMonth');
        const daySel = document.getElementById('esigCheckDay');
        const sayadInput = document.getElementById('esigSayadNumber');
        const recipientInput = document.getElementById('esigRecipientName');
        const fileInput = document.getElementById('esigCheckFileInput');
        const uploadArea = document.getElementById('esigCheckUploadArea');
        const sayadConfirmLabel = document.getElementById('esigSayadConfirmLabel');
        const sayadConfirmCb = document.getElementById('esigSayadConfirmed');

        if (sayadConfirmCb) {
            sayadConfirmCb.addEventListener('change', function () {
                sayadConfirmLabel.classList.toggle('checked', this.checked);
                if (this.checked) document.getElementById('esigSayadConfirmErr').classList.remove('show');
            });
        }

        if (sayadInput) {
            sayadInput.addEventListener('input', function () {
                this.value = this.value.replace(/\D/g, '').slice(0, 16);
                if (this.value.length === 16) document.getElementById('esigSayadErr').classList.remove('show');
            });
        }

        function refreshDays() {
            const jy = parseInt(yearSel.value, 10) || 1404;
            const jm = parseInt(monthSel.value, 10) || 1;
            const prev = daySel.value;
            const days = getDaysInJalaliMonth(jy, jm);
            let opts = '<option value="">روز</option>';
            for (let d = 1; d <= days; d++) {
                opts += '<option value="' + d + '"' + (String(d) === prev ? ' selected' : '') + '>' + toPersianDigits(d) + '</option>';
            }
            daySel.innerHTML = opts;
            if (prev && parseInt(prev, 10) <= days) daySel.value = prev;
        }
        yearSel.addEventListener('change', refreshDays);
        monthSel.addEventListener('change', refreshDays);

        uploadArea.addEventListener('click', function (e) {
            if (e.target && e.target.id === 'esigCheckRemoveBtn') return;
            if (e.target && e.target.closest && e.target.closest('#esigCheckRemoveBtn')) return;
            fileInput.click();
        });

        fileInput.addEventListener('change', function () {
            const file = this.files && this.files[0];
            if (!file) return;
            if (file.size > CHECK_FILE_LIMITS.maxSizeBytes) {
                document.getElementById('esigCheckImageErr').textContent = 'حجم بیش از ۳ مگابایت است.';
                document.getElementById('esigCheckImageErr').classList.add('show');
                fileInput.value = ''; return;
            }
            const mime = (file.type || '').toLowerCase();
            const ext = (file.name.split('.').pop() || '').toLowerCase();
            if (CHECK_FILE_LIMITS.allowedMimes.indexOf(mime) === -1 && CHECK_FILE_LIMITS.allowedExts.indexOf(ext) === -1) {
                document.getElementById('esigCheckImageErr').textContent = 'فرمت مجاز: JPG یا PNG.';
                document.getElementById('esigCheckImageErr').classList.add('show');
                fileInput.value = ''; return;
            }
            const reader = new FileReader();
            reader.onload = function (ev) {
                const dataUrl = ev.target.result;
                if (!application.data.eSignature.checkInfo) application.data.eSignature.checkInfo = {};
                application.data.eSignature.checkInfo.imageDataUrl = dataUrl;
                application.data.eSignature.checkInfo.imageName = file.name;
                application.data.eSignature.checkInfo.imageSize = file.size;
                application.data.eSignature.checkInfo.imageMime = mime;
                Store.saveApplication(application);
                document.getElementById('esigCheckImageErr').classList.remove('show');
                renderESignatureStep();
            };
            reader.readAsDataURL(file);
        });

        const removeBtn = document.getElementById('esigCheckRemoveBtn');
        if (removeBtn) {
            removeBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (!confirm('تصویر چک حذف شود؟')) return;
                if (application.data.eSignature.checkInfo) {
                    delete application.data.eSignature.checkInfo.imageDataUrl;
                    delete application.data.eSignature.checkInfo.imageName;
                    delete application.data.eSignature.checkInfo.imageSize;
                    delete application.data.eSignature.checkInfo.imageMime;
                    Store.saveApplication(application);
                }
                renderESignatureStep();
            });
        }

        document.getElementById('esigBackCheck').addEventListener('click', () => { eSigGoTo('otp'); });

        document.getElementById('esigConfirmCheckInfo').addEventListener('click', () => {
            let valid = true;
            const jy = parseInt(yearSel.value, 10);
            const jm = parseInt(monthSel.value, 10);
            const jd = parseInt(daySel.value, 10);
            if (!jy || !jm || !jd) { document.getElementById('esigCheckDateErr').classList.add('show'); valid = false; }
            else document.getElementById('esigCheckDateErr').classList.remove('show');

            const sayad = (sayadInput.value || '').trim();
            if (!/^\d{16}$/.test(sayad)) { document.getElementById('esigSayadErr').classList.add('show'); valid = false; }
            else document.getElementById('esigSayadErr').classList.remove('show');

            const recipient = (recipientInput.value || '').trim();
            if (recipient.length < 3) { document.getElementById('esigRecipientErr').classList.add('show'); valid = false; }
            else document.getElementById('esigRecipientErr').classList.remove('show');

            if (!application.data.eSignature.checkInfo || !application.data.eSignature.checkInfo.imageDataUrl) {
                document.getElementById('esigCheckImageErr').classList.add('show'); valid = false;
            } else document.getElementById('esigCheckImageErr').classList.remove('show');

            if (!sayadConfirmCb.checked) { document.getElementById('esigSayadConfirmErr').classList.add('show'); valid = false; }
            else document.getElementById('esigSayadConfirmErr').classList.remove('show');

            if (!valid) { showMessage('⚠️ لطفاً خطاها را برطرف کنید.', 'error'); return; }

            const dateStr = jy + '/' + String(jm).padStart(2, '0') + '/' + String(jd).padStart(2, '0');
            const ci = application.data.eSignature.checkInfo || {};
            ci.amount = totalLoan;
            ci.date = dateStr;
            ci.dateDisplay = toPersianDigits(jd) + ' ' + JALALI_MONTHS[jm - 1] + ' ' + toPersianDigits(jy);
            ci.sayadNumber = sayad;
            ci.issuerName = issuerName;
            ci.recipientName = recipient;
            ci.recipientConfirmed = true;
            ci.confirmedAt = new Date().toISOString();
            application.data.eSignature.checkInfo = ci;
            Store.saveApplication(application);
            showMessage('✅ اطلاعات چک ثبت شد.', 'success');
            eSigGoTo('signature');
        });
    }

    function buildESigStage3() {
        const stageNum = eSigStageNumber();
        return '<div class="esig-stage">' +
            '<div class="esig-stage-title"><div class="esig-stage-icon">✍️</div><span>مرحله ' + toPersianDigits(stageNum) + ' از ' + toPersianDigits(eSigTotalStages()) + ' — امضای دستی شما</span></div>' +
            '<p class="esig-stage-sub">با انگشت یا ماوس امضای خود را در کادر زیر رسم کنید.</p>' +
            '<div class="sig-canvas-wrap" id="sigCanvasWrap">' +
                '<canvas id="signatureCanvas"></canvas>' +
                '<div class="sig-placeholder" id="sigPlaceholder">✍️ اینجا امضا کنید</div>' +
            '</div>' +
            '<div class="sig-tools">' +
                '<button type="button" class="sig-tool-btn active" data-tool="pen">🖊️ قلم</button>' +
                '<button type="button" class="sig-tool-btn" data-tool="eraser">🧽 پاک‌کن</button>' +
                '<button type="button" class="sig-tool-btn" id="sigClear">🗑️ پاک کردن همه</button>' +
            '</div>' +
            '<div class="esig-error" id="sigErr">⚠️ حداقل ۱۵ نقطه رسم کنید.</div>' +
            '<div class="esig-actions">' +
                '<button type="button" class="btn btn-secondary" id="esigBack3">⮜ بازگشت</button>' +
                '<button type="button" class="btn btn-primary" id="esigConfirmSig" disabled>✅ تأیید و ادامه</button>' +
            '</div>' +
        '</div>';
    }

    function bindESigStage3() {
        initSignatureCanvas();
        document.querySelectorAll('.sig-tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.sig-tool-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                const tool = this.dataset.tool;
                if (eSigCtx) {
                    eSigCtx.lineWidth = tool === 'eraser' ? 18 : 2.5;
                    eSigCtx.strokeStyle = tool === 'eraser' ? '#ffffff' : '#0b3b23';
                    eSigCtx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
                }
            });
        });
        document.getElementById('sigClear').addEventListener('click', clearSignature);
        const canvasWrap = document.getElementById('sigCanvasWrap');
        eSigCanvas.addEventListener('pointerdown', (e) => {
            eSigDrawing = true;
            canvasWrap.classList.add('active');
            const rect = eSigCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left; const y = e.clientY - rect.top;
            eSigLastPoint = { x, y }; eSigDotCount++;
            eSigCtx.beginPath(); eSigCtx.moveTo(x, y);
            try { eSigCanvas.setPointerCapture(e.pointerId); } catch (_) {}
        });
        eSigCanvas.addEventListener('pointermove', (e) => {
            if (!eSigDrawing) return;
            const rect = eSigCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left; const y = e.clientY - rect.top;
            eSigCtx.lineTo(x, y); eSigCtx.stroke();
            eSigDotCount++; eSigLastPoint = { x, y };
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt => {
            eSigCanvas.addEventListener(evt, () => {
                if (!eSigDrawing) return;
                eSigDrawing = false; eSigCtx.closePath(); checkSigNotEmpty();
            });
        });
        document.getElementById('esigBack3').addEventListener('click', () => {
            if (getPaymentMethod() === 'check') eSigGoTo('checkInfo');
            else eSigGoTo('otp');
        });
        document.getElementById('esigConfirmSig').addEventListener('click', () => {
            if (eSigDotCount < 15) { document.getElementById('sigErr').classList.add('show'); return; }
            const out = document.createElement('canvas');
            out.width = eSigCanvas.width; out.height = eSigCanvas.height;
            const octx = out.getContext('2d');
            octx.fillStyle = '#ffffff'; octx.fillRect(0, 0, out.width, out.height);
            octx.drawImage(eSigCanvas, 0, 0);
            const dataUrl = out.toDataURL('image/png');
            application.data.eSignature.applicantSignature = {
                method: 'canvas', imageDataUrl: dataUrl,
                signedAt: new Date().toISOString(),
                deviceType: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
                userAgent: navigator.userAgent,
                dotCount: eSigDotCount, confirmed: false
            };
            Store.saveApplication(application);
            eSigDotCount = 0;
            eSigGoTo('review');
        });
    }

    function initSignatureCanvas() {
        const canvas = document.getElementById('signatureCanvas');
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
        eSigCtx = canvas.getContext('2d');
        eSigCtx.scale(dpr, dpr);
        eSigCtx.strokeStyle = '#0b3b23'; eSigCtx.lineWidth = 2.5;
        eSigCtx.lineCap = 'round'; eSigCtx.lineJoin = 'round';
        eSigCtx.globalCompositeOperation = 'source-over';
        eSigCanvas = canvas; eSigDrawing = false; eSigDotCount = 0;
    }

    function clearSignature() {
        if (!eSigCanvas || !eSigCtx) return;
        eSigCtx.clearRect(0, 0, eSigCanvas.width, eSigCanvas.height);
        eSigDotCount = 0;
        const placeholder = document.getElementById('sigPlaceholder');
        if (placeholder) placeholder.classList.remove('hidden');
        const wrap = document.getElementById('sigCanvasWrap');
        if (wrap) wrap.classList.remove('active');
        const btn = document.getElementById('esigConfirmSig');
        if (btn) btn.disabled = true;
        const err = document.getElementById('sigErr');
        if (err) err.classList.remove('show');
    }

    function checkSigNotEmpty() {
        const placeholder = document.getElementById('sigPlaceholder');
        if (placeholder && eSigDotCount > 5) placeholder.classList.add('hidden');
        const btn = document.getElementById('esigConfirmSig');
        if (btn) btn.disabled = eSigDotCount < 15;
        const err = document.getElementById('sigErr');
        if (err && eSigDotCount >= 15) err.classList.remove('show');
    }

    function buildESigStage4() {
        const stageNum = eSigStageNumber();
        const sig = application.data.eSignature.applicantSignature || {};
        const signedAtFa = formatDateTimeFa(sig.signedAt);
        const device = sig.deviceType === 'mobile' ? 'موبایل' : 'دسکتاپ';
        const mobileMasked = currentUser.mobile ? currentUser.mobile.slice(0, 4) + '***' + currentUser.mobile.slice(-4) : '09xx***xxxx';

        let checkSummaryHtml = '';
        if (getPaymentMethod() === 'check' && application.data.eSignature.checkInfo) {
            const ci = application.data.eSignature.checkInfo;
            checkSummaryHtml =
                '<div class="contract-summary-box" style="margin-top:14px;background:rgba(212,166,42,.06);border-color:rgba(212,166,42,.3)">' +
                    '<div style="font-size:13px;font-weight:900;color:var(--wam-primary);margin-bottom:8px">📄 اطلاعات چک ثبت‌شده</div>' +
                    '<div class="contract-summary-row"><span>💰 مبلغ چک</span><span>' + formatAmount(ci.amount) + ' تومان</span></div>' +
                    '<div class="contract-summary-row"><span>📅 تاریخ چک</span><span>' + escapeHtml(ci.dateDisplay || ci.date || '—') + '</span></div>' +
                    '<div class="contract-summary-row"><span>🔢 شماره صیادی</span><span style="direction:ltr;display:inline-block;font-family:monospace">' + escapeHtml(ci.sayadNumber || '—') + '</span></div>' +
                    '<div class="contract-summary-row"><span>👤 انتقال دهنده</span><span>' + escapeHtml(ci.issuerName || '—') + '</span></div>' +
                    '<div class="contract-summary-row"><span>👥 انتقال گیرنده</span><span>' + escapeHtml(ci.recipientName || '—') + '</span></div>' +
                    '<div class="contract-summary-row"><span>✅ تأیید صیادی</span><span style="color:#1e8e4a">ثبت شد</span></div>' +
                '</div>';
        }

        return '<div class="esig-stage">' +
            '<div class="esig-stage-title"><div class="esig-stage-icon">👁️</div><span>مرحله ' + toPersianDigits(stageNum) + ' از ' + toPersianDigits(eSigTotalStages()) + ' — بازبینی نهایی</span></div>' +
            '<p class="esig-stage-sub">امضای شما ثبت شد. لطفاً یک بار دیگر بررسی کنید.</p>' +
            '<div class="sig-review-box">' +
                '<img src="' + sig.imageDataUrl + '" alt="امضای شما">' +
                '<div class="sig-review-meta">' +
                    '<div class="sig-review-meta-item"><strong>📅 تاریخ و زمان</strong><span>' + escapeHtml(signedAtFa) + '</span></div>' +
                    '<div class="sig-review-meta-item"><strong>📍 دستگاه</strong><span>' + device + '</span></div>' +
                    '<div class="sig-review-meta-item"><strong>🔒 هویت تأیید شد</strong><span>' + escapeHtml(mobileMasked) + '</span></div>' +
                    '<div class="sig-review-meta-item"><strong>✍️ نوع امضا</strong><span>دستی (Canvas)</span></div>' +
                '</div>' +
            '</div>' +
            checkSummaryHtml +
            '<div class="sig-warning">⚠️ <strong>توجه:</strong> با تأیید نهایی، امضای شما رسماً ثبت می‌شود.</div>' +
            '<div class="esig-actions">' +
                '<button type="button" class="btn btn-secondary" id="esigEditSig">↩️ اصلاح امضا</button>' +
                '<button type="button" class="btn btn-primary" id="esigFinalConfirm">✅ تأیید نهایی و صدور قرارداد</button>' +
            '</div>' +
        '</div>';
    }

    function bindESigStage4() {
        document.getElementById('esigEditSig').addEventListener('click', () => {
            if (!confirm('با بازگشت، امضای فعلی پاک می‌شود. ادامه؟')) return;
            application.data.eSignature.applicantSignature = null;
            Store.saveApplication(application);
            eSigGoTo('signature');
        });
        document.getElementById('esigFinalConfirm').addEventListener('click', () => {
            application.data.eSignature.applicantSignature.confirmed = true;
            application.data.eSignature.applicantSignature.confirmedAt = new Date().toISOString();
            Store.saveApplication(application);
            eSigGoTo('chain');
            setTimeout(runChainedSignatures, 400);
        });
    }

    function buildESigStage5() {
        const stageNum = eSigStageNumber();
        const es = application.data.eSignature;
        const bState = es.brokerSignature ? 'done' : 'processing';
        const aState = es.superAdminSignature ? 'done' : (es.brokerSignature ? 'processing' : 'waiting');

        const broker = getRealBrokerInfo();

        const renderChain = (name, role, state, avatarChar) => {
            const cls = state === 'done' ? 'done' : state === 'processing' ? 'processing' : '';
            const statusText = state === 'done' ? '✅ امضا شد' : state === 'processing' ? '⏳ در حال دریافت...' : '⏸ در انتظار';
            const avatarCls = state === 'processing' ? 'processing' : '';
            return '<div class="chain-item ' + cls + '">' +
                '<div class="chain-avatar ' + avatarCls + '">' + escapeHtml(avatarChar) + '</div>' +
                '<div class="chain-info"><div class="chain-name">' + escapeHtml(name) + '</div>' +
                '<div class="chain-role">' + escapeHtml(role) + '</div></div>' +
                '<span class="chain-status">' + statusText + '</span>' +
            '</div>';
        };

        return '<div class="esig-stage">' +
            '<div class="esig-stage-title"><div class="esig-stage-icon">🔗</div><span>مرحله ' + toPersianDigits(stageNum) + ' از ' + toPersianDigits(eSigTotalStages()) + ' — امضاهای زنجیره‌ای</span></div>' +
            '<p class="esig-stage-sub">امضاهای واگذارکننده و مدیر کل به‌صورت خودکار دریافت می‌شود.</p>' +
            '<div class="chain-flow">' +
                renderChain('شما (واگذارگیرنده)', 'متقاضی تسهیلات', 'done', '👤') +
                renderChain(broker.name, 'واگذارکننده — کد ' + broker.code, bState, broker.name.charAt(0)) +
                renderChain('جناب آقای پاکذاتی', 'مدیر کل سامانه وام پی', aState, 'پ') +
            '</div>' +
            '<div id="esigChainActions" style="margin-top:14px"></div>' +
        '</div>';
    }

    function bindESigStage5() {
    if (application.data.eSignature.brokerSignature && application.data.eSignature.superAdminSignature) {
        showChainContinue();
    } 
    else if (application.status === 'awaiting_superadmin_signature') {
        const waitBox = document.getElementById('esigChainActions');
        if (waitBox) {
            waitBox.innerHTML = '<div style="padding:14px;background:rgba(230,126,34,.1);border:1px solid #e67e22;border-radius:8px;text-align:center;font-size:13px;line-height:1.9">⏳ <strong>در انتظار تأیید مدیر کل</strong><br><span style="font-size:11.5px;color:#77847b">مدیر کل در حال بررسی قرارداد است. لطفاً چند لحظه صبر کنید...</span></div>';
        }

        if (window._adminVerifyTimer) clearInterval(window._adminVerifyTimer);
        
        window._adminVerifyTimer = setInterval(async () => {
            if (!window.WAM_SB || !window.WAM_SB.client || !application.caseNumber) return;

            try {
                const { data, error } = await window.WAM_SB.client
                    .from('applications')
                    .select('status, financial_info')
                    .eq('application_number', application.caseNumber)
                    .single();

                if (error || !data) return;

                if (data.status === 'contract_signed' && data.financial_info?.eSignature?.superAdminSignature) {
                    clearInterval(window._adminVerifyTimer);
                    
                    application.status = 'contract_signed';
                    application.data.eSignature.superAdminSignature = data.financial_info.eSignature.superAdminSignature;
                    Store.saveApplication(application);
                    
                    showMessage('✅ مدیر کل قرارداد را تأیید کرد!', 'success');
                    setTimeout(() => renderESignatureStep(), 500);
                }
            } catch (e) {
                console.warn('⚠️ [AdminVerify] خطا در چک:', e);
            }
        }, 5000);
    }
}

  function runChainedSignatures() {
    if (eSigChainedRunning) return;
    eSigChainedRunning = true;
    const es = application.data.eSignature;
    const broker = getRealBrokerInfo();

    if (!es.brokerSignature) {
        setTimeout(() => {
            es.brokerSignature = {
                brokerId: broker.id, brokerName: broker.name, brokerCode: broker.code,
                imageDataUrl: generateMockSignaturePNG(broker.name),
                signedAt: new Date().toISOString()
            };
            Store.saveApplication(application);

            application.status = 'awaiting_superadmin_signature';
            Store.saveApplication(application);
            syncApplicationToDB();

            if (currentESigKey() === 'chain') renderESignatureStep();
            eSigChainedRunning = false;
        }, 1600);
    } else {
        eSigChainedRunning = false;
    }
}

    function generateMockSignaturePNG(name) {
        const w = 400, h = 140;
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
            '<rect width="' + w + '" height="' + h + '" fill="#fff"/>' +
            '<path d="M30 90 Q80 30, 140 80 T260 70 T360 90" fill="none" stroke="#0b3b23" stroke-width="3.5" stroke-linecap="round"/>' +
            '<path d="M60 110 Q120 90, 180 105 T300 100" fill="none" stroke="#0b3b23" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>' +
            '<text x="' + (w/2) + '" y="130" text-anchor="middle" font-family="Tahoma" font-size="11" fill="#77847b">' + escapeHtml(name) + ' — امضای الکترونیکی</text>' +
            '</svg>';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    function generateMockSealSVG() {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">' +
            '<circle cx="60" cy="60" r="55" fill="none" stroke="#0b3b23" stroke-width="2"/>' +
            '<circle cx="60" cy="60" r="48" fill="none" stroke="#0b3b23" stroke-width="1" stroke-dasharray="3,3"/>' +
            '<text x="60" y="40" text-anchor="middle" font-family="Tahoma" font-size="9" font-weight="bold" fill="#0b3b23">سامانه وام پی</text>' +
            '<text x="60" y="66" text-anchor="middle" font-size="26" fill="#0b3b23">★</text>' +
            '<text x="60" y="90" text-anchor="middle" font-family="Tahoma" font-size="8" fill="#0b3b23">WAM PAY</text>' +
            '</svg>';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    async function ensureFinalContract() {
        const es = application.data.eSignature;
        if (es.finalContract) return es.finalContract;

        const contractId = 'CTR-' + new Date().getFullYear() + '-' + String(Math.floor(1000 + Math.random() * 9000));
        const issuedAt = new Date();
        const issuedAtFa = issuedAt.toLocaleDateString('fa-IR') + ' ' + issuedAt.toLocaleTimeString('fa-IR', {hour:'2-digit', minute:'2-digit'});

        const cr = application.data.consultationResult || {};
        const totalLoan = cr?.totalLoan || 0;
        const paymentMethod = getPaymentMethod();

        const contentForHash = JSON.stringify({
            contractId, 
            applicantNationalId: (application.data.identityAndJob || {})?.nationalId,
            applicantMobile: currentUser?.mobile,
            totalLoan: totalLoan,
            paymentMethod: paymentMethod,
            checkInfo: es?.checkInfo || null,
            signedAt: es?.applicantSignature?.signedAt,
            brokerSignedAt: es?.brokerSignature?.signedAt,
            superAdminSignedAt: es?.superAdminSignature?.signedAt,
            issuedAt: issuedAt.toISOString()
        });
        const hash = await Trust.sha256(contentForHash);
        const shortHash = hash.slice(0, 32).toUpperCase();
        const qrDataUrl = generateMockQRDataUrl('wampay.ir/verify/' + contractId);
        const finalHTML = buildFinalContractHTML(contractId, issuedAtFa, hash, qrDataUrl);

        const contract = {
            contractId, fileName: 'قرارداد_واگذاری_تسهیلات_' + contractId + '.html',
            dataUrl: 'data:text/html;charset=utf-8,' + encodeURIComponent(finalHTML),
            html: finalHTML, size: finalHTML.length, mime: 'text/html',
            sha256Hash: hash, shortHash,
            qrCodeDataUrl: qrDataUrl, issuedAt: issuedAt.toISOString(),
            verifyUrl: 'wampay.ir/verify/' + contractId
        };
        es.finalContract = contract;

        if (['draft', 'awaiting_signature', 'contract_signed'].includes(application.status) || !application.status) {
            application.status = 'contract_signed';
        }
        application.signedAt = issuedAt.toISOString();
        Store.saveApplication(application);
        syncApplicationToDB();
        return contract;
    }

    function buildESigStage6() {
        const stageNum = eSigStageNumber();
        return '<div class="esig-stage" id="esigFinalStage">' +
            '<div class="esig-stage-title"><div class="esig-stage-icon">🎉</div><span>مرحله ' + toPersianDigits(stageNum) + ' از ' + toPersianDigits(eSigTotalStages()) + ' — صدور قرارداد نهایی</span></div>' +
            '<p class="esig-stage-sub">⏳ در حال تولید سند نهایی...</p>' +
            '<div style="text-align:center;padding:32px"><div class="loader-spinner"></div></div>' +
        '</div>';
    }

    async function bindESigStage6() {
        const contract = await ensureFinalContract();
        const box = document.getElementById('esigFinalStage');
        if (!box) return;
        const issuedFa = formatDateTimeFa(contract.issuedAt);

        const id = application.data.identityAndJob || {};
        const cr = application.data.consultationResult || {};
        const totalLoan = cr?.totalLoan || 0;

        box.innerHTML =
            '<div class="esig-stage-title"><div class="esig-stage-icon">🎉</div><span>مرحله ' + toPersianDigits(eSigStageNumber()) + ' از ' + toPersianDigits(eSigTotalStages()) + ' — قرارداد نهایی صادر شد</span></div>' +
            '<p class="esig-stage-sub">سند رسمی قرارداد واگذاری تسهیلات با موفقیت تولید و ثبت شد.</p>' +
            '<div class="final-contract-card">' +
                '<div class="final-contract-label">شناسه یکتای قرارداد</div>' +
                '<div class="final-contract-id">' + escapeHtml(contract.contractId) + '</div>' +
                '<div style="text-align:center;font-size:11.5px;color:var(--wam-text-muted);margin-top:6px">تاریخ صدور: ' + issuedFa + '</div>' +
                '<div class="final-hash"><div style="color:var(--wam-text-muted);margin-bottom:4px">🔐 SHA-256</div>' + escapeHtml(contract.shortHash) + '...</div>' +
                '<div class="final-qr-wrap"><img src="' + contract.qrCodeDataUrl + '" style="width:140px;height:140px" alt="QR"></div>' +
                '<div style="text-align:center;font-size:10.5px;color:var(--wam-text-muted)">اعتبارسنجی: ' + escapeHtml(contract.verifyUrl) + '</div>' +
            '</div>' +
            '<div class="contract-summary-box" style="margin-top:14px">' +
                '<div class="contract-summary-row"><span>👤 واگذارگیرنده</span><span>' + escapeHtml((id.firstName||'') + ' ' + (id.lastName||'')) + '</span></div>' +
                '<div class="contract-summary-row"><span>💰 مبلغ قرارداد</span><span>' + formatAmount(totalLoan) + ' تومان</span></div>' +
                '<div class="contract-summary-row"><span>💳 روش پرداخت</span><span>' + (getPaymentMethod() === 'check' ? '📄 چک' : '🏦 حساب امانی') + '</span></div>' +
                '<div class="contract-summary-row"><span>📌 وضعیت</span><span style="color:#1e8e4a">✅ آماده برای واگذاری وجه امانی</span></div>' +
            '</div>' +
            '<div class="final-actions">' +
                '<button type="button" class="btn btn-primary" id="esigDownloadFinal">🖨️ چاپ / PDF سند نهایی</button>' +
                '<button type="button" class="btn btn-secondary" id="esigPrintFinal">📥 دانلود HTML</button>' +
                '<button type="button" class="btn btn-gold" id="esigContinueToPayment" style="grid-column:1/-1">➜ ادامه به واگذاری وجه امانی</button>' +
            '</div>';

        document.getElementById('esigDownloadFinal').addEventListener('click', () => printFinal(contract));
        document.getElementById('esigPrintFinal').addEventListener('click', () => downloadFinalHTML(contract));
        document.getElementById('esigContinueToPayment').addEventListener('click', () => {
            application.status = 'payment_pending';
            Store.saveApplication(application);
            syncApplicationToDB();
            goNextStep();
        });
    }

    function downloadFinalHTML(contract) {
        const a = document.createElement('a');
        a.href = contract.dataUrl; a.download = contract.fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        showMessage('✅ فایل HTML سند نهایی دانلود شد.', 'success');
    }

    function printFinal(contract) {
        const w = window.open('', '_blank');
        if (!w) {
            downloadFinalHTML(contract);
            showMessage('⚠️ popup مسدود شد — فایل HTML دانلود شد. آن را در مرورگر باز کنید و "Save as PDF" بزنید.', 'warn');
            return;
        }
        w.document.write(contract.html); w.document.close();
        setTimeout(() => {
            try {
                w.focus();
                w.print();
                showMessage('✅ پنجره چاپ باز شد. "Save as PDF" را انتخاب کنید.', 'success');
            } catch (_) {
                downloadFinalHTML(contract);
            }
        }, 600);
    }

    function generateMockQRDataUrl(text) {
        const size = 25, cell = 6;
        const total = size * cell;
        let h = 5381;
        for (let i = 0; i < text.length; i++) h = ((h << 5) + h) + text.charCodeAt(i);
        h = Math.abs(h);
        const isFinder = (x, y) => (x < 7 && y < 7) || (x >= size-7 && y < 7) || (x < 7 && y >= size-7);
        const isFinderBlack = (x, y) => {
            const check = (fx, fy) => {
                const rx = x - fx, ry = y - fy;
                if (rx < 0 || rx > 6 || ry < 0 || ry > 6) return null;
                if (rx === 0 || rx === 6 || ry === 0 || ry === 6) return true;
                if (rx >= 2 && rx <= 4 && ry >= 2 && ry <= 4) return true;
                return false;
            };
            let r = check(0, 0); if (r !== null) return r;
            r = check(size - 7, 0); if (r !== null) return r;
            r = check(0, size - 7); if (r !== null) return r;
            return null;
        };
        let cells = '';
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                let black = false;
                if (isFinder(x, y)) black = isFinderBlack(x, y) || false;
                else black = ((h * (x + 13) * (y + 7)) % 5) < 2;
                if (black) cells += '<rect x="' + (x*cell) + '" y="' + (y*cell) + '" width="' + cell + '" height="' + cell + '" fill="#0b3b23"/>';
            }
        }
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + total + '" height="' + total + '" viewBox="0 0 ' + total + ' ' + total + '">' +
            '<rect width="' + total + '" height="' + total + '" fill="#fff"/>' + cells + '</svg>';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    function buildFinalContractHTML(contractId, issuedAtFa, hash, qrDataUrl) {
        const d = application.data;
        const es = d.eSignature;
        const id = d.identityAndJob || {};
        const li = d.loanInfo || {};
        const cr = d.consultationResult || {};
        const bank = BANK_LOANS.find(b => b.id === li.bankLoanType) || { name: '—' };
        const broker = es.brokerSignature || {};
        const admin = es.superAdminSignature || {};
        const applicant = es.applicantSignature || {};
        const checkInfo = es.checkInfo || null;
        const isCheck = getPaymentMethod() === 'check';

        const applicantSignedAtFa = formatDateTimeFa(applicant.signedAt);
        const brokerSignedAtFa = formatDateTimeFa(broker.signedAt);
        const adminSignedAtFa = formatDateTimeFa(admin.signedAt);

        let checkSection = '';
        if (isCheck && checkInfo) {
            checkSection =
                '<div class="section"><h2>۳. اطلاعات چک پرداختی</h2><table>' +
                    '<tr><td>روش پرداخت</td><td>📄 چک</td></tr>' +
                    '<tr><td>مبلغ چک</td><td>' + formatAmount(checkInfo.amount || 0) + ' تومان</td></tr>' +
                    '<tr><td>تاریخ چک</td><td>' + escapeHtml(checkInfo.dateDisplay || checkInfo.date || '—') + '</td></tr>' +
                    '<tr><td>شماره صیادی</td><td style="direction:ltr;text-align:right;font-family:monospace">' + escapeHtml(checkInfo.sayadNumber || '—') + '</td></tr>' +
                    '<tr><td>انتقال دهنده</td><td>' + escapeHtml(checkInfo.issuerName || '—') + '</td></tr>' +
                    '<tr><td>انتقال گیرنده</td><td>' + escapeHtml(checkInfo.recipientName || '—') + '</td></tr>' +
                    '<tr><td>وضعیت تأیید صیادی</td><td>✅ تأیید شده توسط گیرنده</td></tr>' +
                '</table></div>';
        }

        const nextSectionNum = isCheck ? '۴' : '۳';
        const nextNextNum = isCheck ? '۵' : '۴';
        const signatureNum = checkInfo && checkInfo.imageDataUrl ? '۶' : (isCheck ? '۵' : '۴');

        return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<title>قرارداد واگذاری تسهیلات — ${contractId}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Vazirmatn',Tahoma,sans-serif;background:#fff;color:#1a2b22;padding:40px;line-height:1.9;font-size:13.5px;direction:rtl}
.contract{max-width:840px;margin:0 auto}
.header{text-align:center;padding-bottom:22px;border-bottom:3px double #0b3b23;margin-bottom:26px}
.header h1{font-size:24px;color:#0b3b23;font-weight:900;margin-bottom:8px}
.header .sub{font-size:13px;color:#77847b}
.header .official-badge{display:inline-block;background:linear-gradient(135deg,#0b3b23,#1e8e4a);color:#fff;padding:5px 16px;border-radius:99px;font-size:11px;font-weight:800;margin-top:10px}
.contract-id-box{background:linear-gradient(135deg,rgba(11,59,35,.05),rgba(212,166,42,.08));border:1.5px solid #d4a62a;border-radius:12px;padding:14px;margin:20px 0;text-align:center}
.contract-id-label{font-size:10.5px;color:#77847b;font-weight:700;letter-spacing:1px}
.contract-id-value{font-family:monospace;font-size:20px;font-weight:900;color:#0b3b23;letter-spacing:2px;margin-top:4px}
.section{margin-bottom:22px}
.section h2{font-size:15px;font-weight:900;color:#0b3b23;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #d4a62a}
.section table{width:100%;border-collapse:collapse}
.section table td{padding:8px 10px;border-bottom:1px dashed #e2e6e0;font-size:13px}
.section table td:first-child{color:#77847b;width:35%}
.section table td:last-child{font-weight:700}
.section ol{padding-right:22px}
.section ol li{margin-bottom:10px;font-size:13px;line-height:2}
.sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:26px;padding-top:22px;border-top:2px dashed #e2e6e0}
.sig-box{border:1.5px solid #e2e6e0;border-radius:10px;padding:12px;text-align:center;background:#f9fbf9}
.sig-box .sig-label{font-size:11.5px;font-weight:800;color:#0b3b23;margin-bottom:8px}
.sig-box img{max-width:100%;height:auto;max-height:70px;background:#fff;border-radius:6px;border:1px solid #e2e6e0;display:block;margin:0 auto}
.sig-box .sig-meta{margin-top:8px;font-size:10.5px;color:#77847b}
.wam-seal-box{background:linear-gradient(135deg,rgba(11,59,35,.04),rgba(212,166,42,.06));border:2px dashed #d4a62a;border-radius:12px;padding:16px;margin-top:18px;text-align:center}
.wam-seal-box .wam-seal-title{font-size:12.5px;font-weight:900;color:#0b3b23;margin-bottom:8px}
.wam-seal-box .wam-seal-sub{font-size:11.5px;color:#77847b;line-height:1.9;margin-bottom:12px}
.wam-seal-box .wam-seal-img{width:100px;height:100px;display:block;margin:8px auto}
.wam-seal-box .wam-seal-name{font-size:11.5px;font-weight:800;color:#0b3b23;margin-top:6px}
.wam-seal-box .wam-seal-role{font-size:10.5px;color:#77847b}
.verification-box{background:linear-gradient(135deg,#f4f7f4,#f9fbf9);border:1.5px solid #e2e6e0;border-radius:12px;padding:16px;margin-top:22px;display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:center}
.verification-box img{width:120px;height:120px;background:#fff;border-radius:8px;border:1px solid #e2e6e0;padding:4px}
.verification-info h3{font-size:13px;font-weight:900;color:#0b3b23;margin-bottom:6px}
.verification-info p{font-size:11.5px;color:#77847b;line-height:1.9;margin-bottom:4px}
.hash-code{font-family:monospace;font-size:9.5px;color:#0b3b23;background:#fff;border:1px dashed #c8d0c8;border-radius:6px;padding:6px 8px;direction:ltr;text-align:left;word-break:break-all;margin-top:6px}
.check-image-box{background:#f4f7f4;border:1.5px solid #e2e6e0;border-radius:12px;padding:14px;margin-top:14px;text-align:center}
.check-image-box img{max-width:100%;max-height:400px;border-radius:8px;border:1px solid #e2e6e0;background:#fff}
.check-image-label{font-size:12px;color:#77847b;font-weight:700;margin-bottom:10px}
.footer{margin-top:30px;padding-top:16px;border-top:2px solid #0b3b23;text-align:center;font-size:11px;color:#77847b;line-height:2}
.legal-note{background:rgba(30,142,74,.06);border:1.5px solid rgba(30,142,74,.25);border-radius:10px;padding:12px 14px;margin-top:18px;font-size:11.5px;color:#1e6e3a;line-height:1.9}
@media print{body{padding:15px}.contract{max-width:100%}}
</style>
</head>
<body>
<div class="contract">
    <div class="header">
        <h1>قرارداد واگذاری تسهیلات</h1>
        <div class="sub">سامانه هوشمند تسهیلات وام پی (WAM PAY)</div>
        <div class="official-badge">✅ دارای اعتبار قانونی طبق ماده ۷ قانون تجارت الکترونیک ایران</div>
    </div>
    <div class="contract-id-box">
        <div class="contract-id-label">شناسه یکتای قرارداد</div>
        <div class="contract-id-value">${contractId}</div>
    </div>
    <div class="section"><h2>۱. مشخصات واگذارگیرنده (متقاضی)</h2><table>
        <tr><td>نام و نام خانوادگی</td><td>${escapeHtml((id.firstName||'')+' '+(id.lastName||''))}</td></tr>
        <tr><td>کد ملی</td><td>${toPersianDigits(id.nationalId||'—')}</td></tr>
        <tr><td>نام پدر</td><td>${escapeHtml(id.fatherName||'—')}</td></tr>
        <tr><td>شماره تماس</td><td>${escapeHtml(currentUser.mobile||'—')}</td></tr>
        <tr><td>آدرس</td><td>${escapeHtml(id.address||'—')}</td></tr>
    </table></div>
    <div class="section"><h2>۲. مشخصات تسهیلات</h2><table>
        <tr><td>بانک عامل</td><td>${escapeHtml(bank.name)}</td></tr>
        <tr><td>مبلغ کل تسهیلات</td><td>${formatAmount(cr.totalLoan || 0)} تومان</td></tr>
        <tr><td>مدت بازپرداخت</td><td>${toPersianDigits(24)} ماه</td></tr>
        <tr><td>قسط ماهیانه</td><td>${formatAmount(cr.monthlyInstallment || 0)} تومان</td></tr>
        <tr><td>نرخ سود</td><td>${toPersianDigits(cr.interestRate || 18)}٪ سالانه</td></tr>
        <tr><td>حق‌الزحمه واگذاری (جُعل)</td><td>${formatAmount(cr.fee || 0)} تومان</td></tr>
    </table></div>
    ${checkSection}
    <div class="section"><h2>${nextSectionNum}. مفاد قرارداد</h2><ol>
        <li>واگذارکننده متعهد می‌گردد حق تسهیلات موضوع این قرارداد را به‌طور کامل و بدون هیچ‌گونه محدودیت به واگذارگیرنده واگذار نماید.</li>
        <li>واگذارگیرنده متعهد می‌گردد مبلغ حق‌الزحمه واگذاری (جُعل) را طبق شرایط مقرر پرداخت نماید.</li>
        <li>واگذارکننده متعهد است اسناد و مدارک مربوط به تسهیلات را به‌طور صحیح و مطابق واقع در اختیار سامانه قرار دهد.</li>
        <li>واگذارگیرنده متعهد می‌گردد پس از دریافت حق تسهیلات، تمامی اقساط را طبق زمان‌بندی بانک عامل پرداخت نماید.</li>
        <li>طرفین تأیید می‌نمایند که سامانه وام‌پی صرفاً نقش مشاور، معرف و بستر فنی را داشته و طرف قرارداد نمی‌باشد.</li>
        <li>هیچ‌یک از طرفین حق واگذاری حق تسهیلات به شخص ثالث را بدون موافقت کتبی طرف دیگر و بانک عامل ندارند.</li>
        <li>در صورت بروز اختلاف، ابتدا از طریق میانجی‌گری سامانه وام‌پی و در صورت عدم حصول توافق، از طریق مراجع قانونی پیگیری می‌شود.</li>
        <li>این قرارداد در دو نسخه الکترونیکی مشابه تنظیم و پس از امضای الکترونیکی طرفین، طبق ماده ۷ قانون تجارت الکترونیک ایران دارای اعتبار قانونی کامل است.</li>
        <li>رسیدگی به هرگونه اختلاف ناشی از این قرارداد، در صلاحیت مراجع قانونی مربوطه خواهد بود.</li>
        <li>طرفین تأیید می‌نمایند که مفاد قرارداد را مطالعه و پذیرفته‌اند.</li>
    </ol></div>
    ${checkInfo && checkInfo.imageDataUrl ? '<div class="section"><h2>' + nextNextNum + '. تصویر چک پرداختی</h2><div class="check-image-box"><div class="check-image-label">📄 تصویر چک ارسالی توسط واگذارگیرنده</div><img src="' + checkInfo.imageDataUrl + '" alt="تصویر چک"></div></div>' : ''}
    <div class="section"><h2>${signatureNum}. امضاهای الکترونیکی طرفین</h2>
        <div class="sig-grid">
            <div class="sig-box">
                <div class="sig-label">👤 واگذارگیرنده (متقاضی)</div>
                <img src="${applicant.imageDataUrl||''}" alt="امضای واگذارگیرنده">
                <div class="sig-meta"><div>${escapeHtml((id.firstName||'')+' '+(id.lastName||''))}</div><div>${escapeHtml(applicantSignedAtFa)}</div></div>
            </div>
            <div class="sig-box">
                <div class="sig-label">🤝 واگذارکننده (کارگزار)</div>
                <img src="${broker.imageDataUrl||''}" alt="امضای واگذارنده">
                <div class="sig-meta"><div>${escapeHtml(broker.brokerName||'—')}</div><div>کد کارگزاری: ${escapeHtml(broker.brokerCode||'—')}</div><div>${escapeHtml(brokerSignedAtFa)}</div></div>
            </div>
        </div>
    </div>
    <div class="wam-seal-box">
        <div class="wam-seal-title">🏛️ تأیید فنی سامانه وام پی</div>
        <div class="wam-seal-sub">
            سامانه وام پی به‌عنوان مشاور، معرف و بستر فنی این قرارداد، صرفاً صحت فنی ثبت اسناد و انتقال وجه امانی را تأیید می‌نماید و <strong>طرف قرارداد نمی‌باشد</strong>.
        </div>
        <img src="${admin.sealDataUrl||''}" class="wam-seal-img" alt="مهر سامانه">
        <div class="wam-seal-name">${escapeHtml(admin.superAdminName||'جناب آقای پاکذاتی')}</div>
        <div class="wam-seal-role">مدیر سامانه — تاریخ تأیید: ${escapeHtml(adminSignedAtFa)}</div>
    </div>
    <div class="verification-box">
        <img src="${qrDataUrl}" alt="QR">
        <div class="verification-info">
            <h3>🔐 اعتبارسنجی قرارداد</h3>
            <p><strong>شناسه:</strong> ${contractId}</p>
            <p><strong>تاریخ صدور:</strong> ${escapeHtml(issuedAtFa)}</p>
            <p><strong>لینک:</strong> <span style="direction:ltr;display:inline-block">wampay.ir/verify/${contractId}</span></p>
            <p>هش SHA-256:</p>
            <div class="hash-code">${hash}</div>
        </div>
    </div>
    <div class="legal-note">
        <strong>📌 اعتبار قانونی:</strong> این سند طبق <strong>ماده ۷ قانون تجارت الکترونیک ایران</strong> دارای اعتبار قانونی است.
    </div>
    <div class="footer">
        <div><strong>سامانه هوشمند تسهیلات وام پی — WAM PAY</strong></div>
        <div>تاریخ صدور: ${escapeHtml(issuedAtFa)}</div>
        <div>شناسه: ${contractId}  ·  مرجع: ${hash.slice(0,16).toUpperCase()}</div>
    </div>
</div>
</body>
</html>`;
    }

    // ==========================================
    // گام ۸: پرداخت امانی
    // ==========================================
    function renderStep8() {
        if (!application.data.step8) {
            application.data.step8 = {
                stage: 'summary',
                method: 'trust_wallet',
                trustDeed: null,
                invoice: null,
                brokerTransfer: { status: 'pending' },
                superAdminVerification: { status: 'pending' },
                applicantConfirmation: { status: 'pending' },
                startedAt: new Date().toISOString()
            };
            Store.saveApplication(application);
        }

        const flow = document.getElementById('step8Flow');
        if (!flow) return;

        const s8 = application.data.step8;
        const stageIdx = STEP8_STAGES.findIndex(s => s.key === s8.stage);
        step8Stage = stageIdx >= 0 ? stageIdx : 0;

        let content = buildStep8Progress();
        const currentKey = STEP8_STAGES[step8Stage].key;
        switch (currentKey) {
            case 'summary':          content += buildStep8Summary(); break;
            case 'invoice':          content += buildStep8Invoice(); break;
            case 'gateway':          content += buildStep8Gateway(); break;
            case 'waitBroker':       content += buildStep8WaitBroker(); break;
            case 'superAdminVerify': content += buildStep8SuperAdminVerify(); break;
            case 'applicantConfirm': content += buildStep8ApplicantConfirm(); break;
        }
        flow.innerHTML = content;

        switch (currentKey) {
            case 'summary':          bindStep8Summary(); break;
            case 'invoice':          bindStep8Invoice(); break;
            case 'gateway':          bindStep8Gateway(); break;
            case 'waitBroker':       bindStep8WaitBroker(); break;
            case 'superAdminVerify': bindStep8SuperAdminVerify(); break;
            case 'applicantConfirm': bindStep8ApplicantConfirm(); break;
        }
    }

    function buildStep8Progress() {
        let html = '<div class="esignature-progress">';
        const s8 = application.data.step8;
        const currentIdx = STEP8_STAGES.findIndex(s => s.key === s8.stage);
        STEP8_STAGES.forEach((s, i) => {
            let cls = 'esig-dot';
            if (i < currentIdx) cls += ' done';
            else if (i === currentIdx) cls += ' active';
            const inner = i < currentIdx ? '' : toPersianDigits(i + 1);
            html += '<div class="' + cls + '" title="' + s.label + '">' + inner + '</div>';
        });
        html += '</div>';
        return html;
    }

    function goStep8Stage(key) {
        if (step8BrokerAutoTimer) { clearTimeout(step8BrokerAutoTimer); step8BrokerAutoTimer = null; }
        if (step8SuperAdminTimer) { clearTimeout(step8SuperAdminTimer); step8SuperAdminTimer = null; }
        if (step8WaitTimer) { clearInterval(step8WaitTimer); step8WaitTimer = null; }
        application.data.step8.stage = key;
        Store.saveApplication(application);
        syncApplicationToDB();
        renderStep8();
    }

    function buildStep8Summary() {
        const cr = application.data.consultationResult || {};
        const charges = Trust.computeCharges(cr.totalLoan, cr.fee);
        const isCustom = charges.isCustomFee;

        return '<div class="esig-stage">' +
            '<div class="esig-stage-title"><div class="esig-stage-icon">📋</div><span>مرحله ۱ از ۶ — خلاصه مالی</span></div>' +
            '<p class="esig-stage-sub">مبلغ پرداختی شما به‌عنوان امانت نزد سامانه وام پی نگهداری می‌شود و تنها پس از تأیید سه‌طرفه آزاد می‌گردد.</p>' +

            '<div class="trust-summary-card">' +
                '<div class="trust-summary-title"><div class="icon">💰</div><span>جزئیات مالی پرداخت</span></div>' +

                '<div class="trust-summary-row">' +
                    '<span class="label">💵 مبلغ کل تسهیلات</span>' +
                    '<span class="value">' + formatAmount(cr.totalLoan) + ' تومان</span>' +
                '</div>' +

                '<div class="trust-summary-row highlight">' +
                    '<span class="label">📥 مبلغ امانت (پرداختی شما)</span>' +
                    '<span class="value">' + formatAmount(charges.totalCharge) + ' تومان</span>' +
                '</div>' +

                '<div class="trust-summary-row">' +
                    '<span class="label">🏛️ کارمزد سامانه' +
                        '<span class="percent-badge">' + charges.serviceFeePercentDisplay + (isCustom ? ' توافقی' : '') + '</span>' +
                    '</span>' +
                    '<span class="value">' + formatAmount(charges.serviceFee) + ' تومان</span>' +
                '</div>' +

                '<div class="trust-summary-row broker-payout">' +
                    '<span class="label">🤝 حق‌الزحمه واگذاری (جُعل)</span>' +
                    '<span class="value">' + formatAmount(charges.brokerAmount) + ' تومان</span>' +
                '</div>' +
            '</div>' +

            '<div class="trust-status-box info">' +
                '<div class="icon">🏛️</div>' +
                '<div class="body">' +
                    '<div class="title">امانت‌داری وام پی</div>' +
                    '<p class="text">مبلغ فوق به‌عنوان امانت (طبق ماده ۶۱۴ قانون مدنی ایران) نزد سامانه وام پی نگهداری می‌شود و پس از تأیید نهایی سه‌طرفه، حق‌الزحمه واگذاری به واگذارکننده آزاد می‌گردد.</p>' +
                '</div>' +
            '</div>' +

            '<div class="esig-actions">' +
                '<button type="button" class="btn btn-secondary" id="step8BackTo7">⮜ بازگشت به قرارداد</button>' +
                '<button type="button" class="btn btn-primary" id="step8NextToInvoice">متوجه شدم، ادامه ➜</button>' +
            '</div>' +
        '</div>';
    }

    function bindStep8Summary() {
        document.getElementById('step8BackTo7').addEventListener('click', () => {
            goPrevStep();
        });
        document.getElementById('step8NextToInvoice').addEventListener('click', () => {
            goStep8Stage('invoice');
        });
    }

    function buildStep8Invoice() {
        const cr = application.data.consultationResult || {};
        const charges = Trust.computeCharges(cr.totalLoan, cr.fee);
        const s8 = application.data.step8;
        const invoiceNumber = (s8.invoice && s8.invoice.invoiceNumber) || ('INV-' + new Date().getFullYear() + '-' + String(Math.floor(1000 + Math.random()*9000)));

        return '<div class="esig-stage">' +
            '<div class="esig-stage-title"><div class="esig-stage-icon">📄</div><span>مرحله ۲ از ۶ — فاکتور پرداخت</span></div>' +
            '<p class="esig-stage-sub">لطفاً فاکتور زیر را بررسی و سپس پرداخت را انجام دهید.</p>' +

            '<div class="trust-invoice">' +
                '<div class="trust-invoice-head">' +
                    '<div class="title">🧾 فاکتور رسمی وام پی</div>' +
                    '<div class="invoice-number">' + invoiceNumber + '</div>' +
                '</div>' +
                '<div class="trust-invoice-body">' +
                    '<div class="trust-invoice-row"><span>شماره قرارداد</span><span>' + escapeHtml(((application.data.eSignature || {}).finalContract || {}).contractId || '—') + '</span></div>' +
                    '<div class="trust-invoice-row"><span>واگذارگیرنده</span><span>' + escapeHtml((application.data.identityAndJob.firstName||'') + ' ' + (application.data.identityAndJob.lastName||'')) + '</span></div>' +
                    '<div class="trust-invoice-row"><span>مبلغ کل تسهیلات</span><span>' + formatAmount(cr.totalLoan) + ' تومان</span></div>' +
                    '<div class="trust-invoice-row"><span>کارمزد سامانه (' + charges.serviceFeePercentDisplay + ')</span><span>' + formatAmount(charges.serviceFee) + ' تومان</span></div>' +
                    '<div class="trust-invoice-row"><span>حق‌الزحمه واگذاری (جُعل)</span><span>' + formatAmount(charges.brokerAmount) + ' تومان</span></div>' +
                '</div>' +
                '<div class="trust-invoice-total">' +
                    '<span class="label">💳 مبلغ قابل پرداخت</span>' +
                    '<span class="amount">' + formatAmount(charges.totalCharge) + ' تومان</span>' +
                '</div>' +
            '</div>' +

            '<div class="trust-status-box pending">' +
                '<div class="icon">⚠️</div>' +
                '<div class="body">' +
                    '<div class="title">توجه مهم</div>' +
                    '<p class="text">مبلغ فوق به‌عنوان امانت نزد وام پی نگهداری می‌شود. پس از پرداخت، واگذارکننده باید حق تسهیلات را منتقل کند و سپس وجه آزاد می‌شود.</p>' +
                '</div>' +
            '</div>' +

            '<div class="esig-actions">' +
                '<button type="button" class="btn btn-secondary" id="step8BackSummary">⮜ بازگشت</button>' +
                '<button type="button" class="btn btn-gold" id="step8PayBtn">💳 پرداخت و شارژ امانت</button>' +
            '</div>' +
        '</div>';
    }

    function bindStep8Invoice() {
        document.getElementById('step8BackSummary').addEventListener('click', () => goStep8Stage('summary'));
        document.getElementById('step8PayBtn').addEventListener('click', () => {
            goStep8Stage('gateway');
        });
    }

    function buildStep8Gateway() {
        const cr = application.data.consultationResult || {};
        const charges = Trust.computeCharges(cr.totalLoan, cr.fee);

        return '<div class="esig-stage">' +
            '<div class="esig-stage-title"><div class="esig-stage-icon">💳</div><span>مرحله ۳ از ۶ — درگاه پرداخت</span></div>' +
            '<p class="esig-stage-sub">در حال اتصال به درگاه پرداخت شاپرک...</p>' +

            '<div class="trust-gateway">' +
                '<div class="trust-gateway-icon">🏦</div>' +
                '<div class="trust-gateway-title">درگاه پرداخت اینترنتی وام پی</div>' +
                '<p class="trust-gateway-sub">پرداخت امن از طریق کلیه کارت‌های عضو شتاب</p>' +
                '<div class="trust-bank-badge">🔒 اتصال امن SSL — شبیه‌سازی</div>' +
                '<div class="trust-gateway-processing">' +
                    '<div class="spinner"></div>' +
                    '<div class="text">در حال پردازش مبلغ ' + formatAmount(charges.totalCharge) + ' تومان...</div>' +
                '</div>' +
            '</div>' +

            '<div class="trust-status-box info">' +
                '<div class="icon">ℹ️</div>' +
                '<div class="body">' +
                    '<p class="text">شبیه‌سازی درگاه پرداخت. در نسخه واقعی، اتصال به درگاه شاپرک انجام می‌شود.</p>' +
                '</div>' +
            '</div>';
    }

    function bindStep8Gateway() {
        if (application.data.step8.gatewayStarted) return;
        application.data.step8.gatewayStarted = true;
        Store.saveApplication(application);

        setTimeout(async () => {
            try {
                const cr = application.data.consultationResult || {};
                const charges = Trust.computeCharges(cr.totalLoan, cr.fee);

                const deposit = await Trust.createTrustDeposit({
                    userId: currentUser.id,
                    userName: currentUser.name,
                    mobile: currentUser.mobile,
                    applicationId: application.id,
                    contractId: ((application.data.eSignature || {}).finalContract || {}).contractId,
                    amount: charges.totalCharge,
                    charges: charges,
                    gatewayRef: 'MOCK-' + Date.now()
                });

                application.data.step8.trustDeed = {
                    depositId: deposit.id,
                    deedNumber: deposit.deed.deedNumber,
                    deedHash: deposit.deed.deedHash,
                    amount: deposit.amount,
                    serviceFee: charges.serviceFee,
                    serviceFeePercent: charges.serviceFeePercent,
                    serviceFeePercentDisplay: charges.serviceFeePercentDisplay,
                    brokerAmount: charges.brokerAmount,
                    isCustomFee: charges.isCustomFee || false,
                    status: 'held',
                    issuedAt: deposit.deed.issuedAt
                };

                application.data.step8.invoice = {
                    invoiceNumber: deposit.invoice.invoiceNumber,
                    paidAt: deposit.invoice.paidAt,
                    transactionId: deposit.id,
                    gatewayRef: deposit.invoice.gatewayRef
                };

                application.status = 'payment_in_escrow';
                Store.saveApplication(application);
                syncApplicationToDB();

                showMessage('✅ پرداخت با موفقیت انجام شد.', 'success');
                goStep8Stage('waitBroker');
            } catch (err) {
                console.error('❌ خطا در پرداخت:', err);
                application.data.step8.gatewayStarted = false;
                Store.saveApplication(application);
                showMessage('خطا در پردازش پرداخت: ' + err.message, 'error');
            }
        }, 2500);
    }

    function buildStep8WaitBroker() {
        const s8 = application.data.step8;
        const td = s8.trustDeed || {};
        const bt = s8.brokerTransfer || {};
        const broker = getRealBrokerInfo();

        let contentHtml = '<div class="esig-stage">' +
            '<div class="esig-stage-title"><div class="esig-stage-icon">⏳</div><span>مرحله ۴ از ۶ — انتظار اقدام واگذارکننده</span></div>' +
            '<p class="esig-stage-sub">پرداخت شما با موفقیت ثبت شد. اکنون واگذارکننده باید حق تسهیلات را منتقل کرده و سند انتقال را بارگذاری کند.</p>' +

            '<div class="trust-deed-card">' +
                '<div class="trust-deed-label">سند امانت صادر شد</div>' +
                '<div class="trust-deed-number">' + escapeHtml(td.deedNumber || '—') + '</div>' +
                '<div class="trust-deed-hash">🔐 ' + escapeHtml((td.deedHash || '').slice(0, 32)) + '...</div>' +
                '<div class="trust-deed-note">💾 مبلغ ' + formatAmount(td.amount) + ' تومان به‌عنوان امانت نزد وام پی نگهداری می‌شود.</div>' +
            '</div>';

        if (bt.status === 'pending') {
            contentHtml +=
                '<div class="trust-wait-timer">' +
                    '<div class="trust-wait-timer-circle"><div class="trust-wait-timer-value" id="step8Timer">۷۲:۰۰:۰۰</div></div>' +
                    '<div class="trust-wait-timer-label">زمان باقی‌مانده برای اقدام واگذارکننده</div>' +
                    '<p class="trust-wait-timer-message">در صورت عدم اقدام واگذارکننده در این مدت، وجه امانت به شما عودت داده می‌شود.</p>' +
                '</div>' +
                '<div class="trust-status-box pending">' +
                    '<div class="icon">⏳</div>' +
                    '<div class="body">' +
                        '<div class="title">در انتظار اقدام واگذارکننده</div>' +
                        '<p class="text">واگذارکننده حق تسهیلات را به شما منتقل می‌کند و سند انتقال را بارگذاری می‌کند. این عملیات شبیه‌سازی شده و بعد از چند ثانیه انجام می‌شود.</p>' +
                    '</div>' +
                '</div>';
        } else {
            contentHtml +=
                '<div class="trust-broker-doc-card">' +
                    '<div class="trust-broker-doc-head">' +
                        '<div class="avatar">' + escapeHtml(broker.name.charAt(0)) + '</div>' +
                        '<div class="info"><strong>' + escapeHtml(broker.name) + '</strong><span>واگذارکننده — کد ' + escapeHtml(broker.code) + '</span></div>' +
                    '</div>' +
                    '<div class="trust-broker-doc-body">' +
                        '<div class="doc-icon">📄</div>' +
                        '<div class="doc-info">' +
                            '<div class="doc-name">' + escapeHtml((bt.evidenceDoc && bt.evidenceDoc.fileName) || 'سند انتقال') + '</div>' +
                            '<div class="doc-meta">' + formatFileSize((bt.evidenceDoc && bt.evidenceDoc.size) || 0) + '</div>' +
                        '</div>' +
                    '</div>' +
                    (bt.brokerNote ? '<div class="trust-broker-note">📝 ' + escapeHtml(bt.brokerNote) + '</div>' : '') +
                '</div>' +
                '<div class="trust-status-box done">' +
                    '<div class="icon">✅</div>' +
                    '<div class="body">' +
                        '<div class="title">واگذارکننده حق تسهیلات را منتقل کرد</div>' +
                        '<p class="text">سند انتقال توسط واگذارکننده بارگذاری شده و در انتظار تأیید مدیر کل است.</p>' +
                    '</div>' +
                '</div>' +
                '<div class="esig-actions">' +
                    '<button type="button" class="btn btn-primary" id="step8ToSuperAdmin" style="width:100%">➜ ادامه</button>' +
                '</div>';
        }

        contentHtml += '</div>';
        return contentHtml;
    }

    function bindStep8WaitBroker() {
        const bt = application.data.step8.brokerTransfer || {};
        if (bt.status === 'pending') {
            if (step8BrokerAutoTimer) clearTimeout(step8BrokerAutoTimer);
            step8BrokerAutoTimer = setTimeout(() => {
                if (!application || !application.data || !application.data.step8) return;
                application.data.step8.brokerTransfer = {
                    status: 'transferred',
                    transferredAt: new Date().toISOString(),
                    brokerNote: 'حق تسهیلات مورد نظر به واگذارگیرنده منتقل شد. کد پیگیری انتقال: TRF-' + Math.floor(100000 + Math.random()*900000),
                    evidenceDoc: {
                        fileName: 'انتقال_حق_تسهیلات_' + application.id + '.pdf',
                        size: 145000,
                        mime: 'application/pdf',
                        uploadedAt: new Date().toISOString()
                    }
                };
                application.status = 'broker_transferred';
                Store.saveApplication(application);
                syncApplicationToDB();
                showMessage('✅ واگذارکننده حق تسهیلات را منتقل کرد.', 'success');
                renderStep8();
            }, 8000);
        } else {
            const btn = document.getElementById('step8ToSuperAdmin');
            if (btn) btn.addEventListener('click', () => {
                goStep8Stage('superAdminVerify');
            });
        }
    }

    function buildStep8SuperAdminVerify() {
        const s8 = application.data.step8;
        const sav = s8.superAdminVerification || {};

        if (sav.status === 'pending') {
            return '<div class="esig-stage">' +
                '<div class="esig-stage-title"><div class="esig-stage-icon">🏛️</div><span>مرحله ۵ از ۶ — تأیید مدیر کل</span></div>' +
                '<p class="esig-stage-sub">سند انتقال واگذارکننده در حال بررسی توسط مدیر کل است.</p>' +
                '<div class="trust-super-admin-card">' +
                    '<div class="trust-super-admin-head">' +
                        '<div class="avatar">پ</div>' +
                        '<div class="info"><strong>جناب آقای پاکذاتی</strong><span>مدیر کل سامانه وام پی</span></div>' +
                    '</div>' +
                    '<span class="trust-super-admin-status pending">⏳ در حال بررسی سند</span>' +
                '</div>' +
                '<div class="trust-status-box pending">' +
                    '<div class="icon">⏳</div>' +
                    '<div class="body"><p class="text">شبیه‌سازی تأیید مدیر کل — بعد از چند ثانیه انجام می‌شود.</p></div>' +
                '</div>' +
            '</div>';
        } else if (sav.status === 'verified') {
            return '<div class="esig-stage">' +
                '<div class="esig-stage-title"><div class="esig-stage-icon">🏛️</div><span>مرحله ۵ از ۶ — تأیید مدیر کل</span></div>' +
                '<div class="trust-super-admin-card">' +
                    '<div class="trust-super-admin-head">' +
                        '<div class="avatar">پ</div>' +
                        '<div class="info"><strong>' + escapeHtml(sav.superAdminName || 'جناب آقای پاکذاتی') + '</strong><span>مدیر کل سامانه وام پی</span></div>' +
                    '</div>' +
                    '<span class="trust-super-admin-status verified">✅ تأیید شد</span>' +
                    (sav.note ? '<div class="trust-broker-note" style="margin-top:12px">📝 ' + escapeHtml(sav.note) + '</div>' : '') +
                '</div>' +
                '<div class="trust-status-box done">' +
                    '<div class="icon">✅</div>' +
                    '<div class="body">' +
                        '<div class="title">سند انتقال تأیید شد</div>' +
                        '<p class="text">اکنون نیاز است که شما دریافت حق تسهیلات را تأیید کنید.</p>' +
                    '</div>' +
                '</div>' +
                '<div class="esig-actions">' +
                    '<button type="button" class="btn btn-primary" id="step8ToApplicantConfirm" style="width:100%">➜ ادامه</button>' +
                '</div>' +
            '</div>';
        }
        return '';
    }

    function bindStep8SuperAdminVerify() {
        const sav = application.data.step8.superAdminVerification || {};
        if (sav.status === 'pending') {
            if (step8SuperAdminTimer) clearTimeout(step8SuperAdminTimer);
            step8SuperAdminTimer = setTimeout(() => {
                if (!application || !application.data || !application.data.step8) return;
                application.data.step8.superAdminVerification = {
                    status: 'verified',
                    verifiedAt: new Date().toISOString(),
                    note: 'سند انتقال واگذارکننده بررسی و تأیید شد.',
                    superAdminName: 'جناب آقای پاکذاتی'
                };
                application.status = 'super_admin_verified';
                Store.saveApplication(application);
                syncApplicationToDB();
                showMessage('✅ مدیر کل سند را تأیید کرد.', 'success');
                renderStep8();
            }, 3000);
        } else {
            const btn = document.getElementById('step8ToApplicantConfirm');
            if (btn) btn.addEventListener('click', () => {
                goStep8Stage('applicantConfirm');
            });
        }
    }

    function buildStep8ApplicantConfirm() {
        const s8 = application.data.step8;
        const ac = s8.applicantConfirmation || {};
        const hasSms = ac.smsDoc && ac.smsDoc.dataUrl;
        const isConfirmed = ac.status === 'confirmed' && hasSms;

        return '<div class="esig-stage">' +
            '<div class="esig-stage-title"><div class="esig-stage-icon">✅</div><span>مرحله ۶ از ۶ — تأیید دریافت حق تسهیلات</span></div>' +
            '<p class="esig-stage-sub">لطفاً عکس پیامک بانکی که دریافت حق تسهیلات را نشان می‌دهد، بارگذاری کنید و سپس تأیید نمایید.</p>' +

            '<div class="trust-applicant-confirm">' +
                '<div class="trust-applicant-confirm-title">📱 بارگذاری عکس پیامک بانک</div>' +
                '<p class="trust-applicant-confirm-sub">عکس پیامک بانکی که نشان می‌دهد حق تسهیلات به حساب شما واریز شده است را بارگذاری کنید.</p>' +

                '<div class="trust-sms-upload' + (hasSms ? ' uploaded' : '') + '" id="step8SmsUpload">' +
                    '<input type="file" id="step8SmsFileInput" accept=".jpg,.jpeg,.png" style="display:none">' +
                    (hasSms
                        ? '<div style="text-align:center">' +
                            '<div class="upload-icon">✅</div>' +
                            '<div class="upload-title">پیامک بارگذاری شد</div>' +
                            '<img src="' + ac.smsDoc.dataUrl + '" class="trust-sms-preview" alt="پیامک">' +
                            '<div class="trust-sms-file">' +
                                '<span class="icon">📱</span>' +
                                '<div class="info">' +
                                    '<div class="name">' + escapeHtml(ac.smsDoc.fileName) + '</div>' +
                                    '<div class="meta">' + formatFileSize(ac.smsDoc.size) + '</div>' +
                                '</div>' +
                                '<button type="button" class="remove" id="step8SmsRemove">🗑️</button>' +
                            '</div>' +
                          '</div>'
                        : '<div class="upload-icon">📱</div>' +
                          '<div class="upload-title">برای بارگذاری عکس پیامک کلیک کنید</div>' +
                          '<div class="upload-sub">JPG یا PNG — حداکثر ۳ مگابایت</div>') +
                '</div>' +

                '<label class="trust-confirm-check' + (isConfirmed ? ' checked' : '') + '" id="step8ConfirmCheck">' +
                    '<input type="checkbox" id="step8ConfirmCb"' + (isConfirmed ? ' checked' : '') + '>' +
                    '<span class="box"></span>' +
                    '<span class="text"><strong>اینجانب تأیید می‌کنم</strong> که حق تسهیلات موضوع قرارداد را کامل دریافت کرده‌ام.</span>' +
                '</label>' +
            '</div>' +

            (isConfirmed
                ? '<div class="trust-status-box done">' +
                    '<div class="icon">✅</div>' +
                    '<div class="body">' +
                        '<div class="title">تأیید شما ثبت شد</div>' +
                        '<p class="text">آماده برای انتقال به گام اقرار و پرداخت به واگذارکننده.</p>' +
                    '</div>' +
                  '</div>' +
                  '<div class="esig-actions">' +
                    '<button type="button" class="btn btn-gold" id="step8ToDeclaration" style="width:100%">➜ ادامه به اقرار</button>' +
                  '</div>'
                : '') +
        '</div>';
    }

    function bindStep8ApplicantConfirm() {
        const upload = document.getElementById('step8SmsUpload');
        const fileInput = document.getElementById('step8SmsFileInput');
        const checkLabel = document.getElementById('step8ConfirmCheck');
        const checkCb = document.getElementById('step8ConfirmCb');

        if (upload && fileInput) {
            upload.addEventListener('click', (e) => {
                if (e.target && e.target.id === 'step8SmsRemove') return;
                if (e.target && e.target.closest && e.target.closest('#step8SmsRemove')) return;
                fileInput.click();
            });

            fileInput.addEventListener('change', function () {
                const file = this.files && this.files[0];
                if (!file) return;
                if (file.size > SMS_FILE_LIMITS.maxSizeBytes) {
                    showMessage('⚠️ حجم فایل بیش از ۳ مگابایت است.', 'error');
                    fileInput.value = ''; return;
                }
                const mime = (file.type || '').toLowerCase();
                if (SMS_FILE_LIMITS.allowedMimes.indexOf(mime) === -1) {
                    showMessage('⚠️ فقط JPG یا PNG مجاز است.', 'error');
                    fileInput.value = ''; return;
                }
                const reader = new FileReader();
                reader.onload = (ev) => {
                    if (!application.data.step8.applicantConfirmation) application.data.step8.applicantConfirmation = { status: 'pending' };
                    application.data.step8.applicantConfirmation.smsDoc = {
                        fileName: file.name,
                        size: file.size,
                        mime: mime,
                        dataUrl: ev.target.result,
                        uploadedAt: new Date().toISOString()
                    };
                    Store.saveApplication(application);
                    syncApplicationToDB();
                    renderStep8();
                };
                reader.readAsDataURL(file);
            });
        }

        const removeBtn = document.getElementById('step8SmsRemove');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!confirm('تصویر پیامک حذف شود؟')) return;
                if (application.data.step8.applicantConfirmation) {
                    delete application.data.step8.applicantConfirmation.smsDoc;
                    application.data.step8.applicantConfirmation.status = 'pending';
                    Store.saveApplication(application);
                    syncApplicationToDB();
                }
                renderStep8();
            });
        }

        if (checkCb && checkLabel) {
            checkCb.addEventListener('change', function () {
                const ac = application.data.step8.applicantConfirmation || {};
                if (!ac.smsDoc || !ac.smsDoc.dataUrl) {
                    this.checked = false;
                    showMessage('⚠️ لطفاً ابتدا عکس پیامک را بارگذاری کنید.', 'error');
                    return;
                }
                checkLabel.classList.toggle('checked', this.checked);
                if (this.checked) {
                    application.data.step8.applicantConfirmation = Object.assign({}, ac, {
                        status: 'confirmed',
                        confirmedAt: new Date().toISOString()
                    });
                    application.data.step8.completedAt = new Date().toISOString();
                    application.status = 'applicant_confirmed';
                    Store.saveApplication(application);
                    syncApplicationToDB();
                    showMessage('✅ تأیید شما ثبت شد.', 'success');
                    setTimeout(() => renderStep8(), 300);
                }
            });
        }

        const toDecl = document.getElementById('step8ToDeclaration');
        if (toDecl) toDecl.addEventListener('click', () => {
            application.status = 'awaiting_declaration';
            Store.saveApplication(application);
            syncApplicationToDB();
            goNextStep();
        });
    }

    // ==========================================
    // گام ۹: اقرار سه‌طرفه
    // ==========================================
    function renderStep9() {
        if (!application.data.step9) {
            application.data.step9 = {
                stage: 'applicantDeclaration',
                applicantDeclaration: null,
                brokerDeclaration: null,
                superAdminApproval: { approved: false },
                paymentRelease: null,
                startedAt: new Date().toISOString()
            };
            Store.saveApplication(application);
        }
        const flow = document.getElementById('step9Flow');
        if (!flow) return;

        const s9 = application.data.step9;
        const idx = STEP9_STAGES.findIndex(s => s.key === s9.stage);
        step9Stage = idx >= 0 ? idx : 0;
        const currentKey = STEP9_STAGES[step9Stage].key;

        let content = buildStep9Progress();
        switch (currentKey) {
            case 'applicantDeclaration': content += buildStep9Applicant(); break;
            case 'brokerDeclaration':    content += buildStep9Broker(); break;
            case 'release':              content += buildStep9Release(); break;
        }
        flow.innerHTML = content;

        switch (currentKey) {
            case 'applicantDeclaration': bindStep9Applicant(); break;
            case 'brokerDeclaration':    bindStep9Broker(); break;
            case 'release':              bindStep9Release(); break;
        }
    }

    function buildStep9Progress() {
        let html = '<div class="esignature-progress">';
        const s9 = application.data.step9;
        const currentIdx = STEP9_STAGES.findIndex(s => s.key === s9.stage);
        STEP9_STAGES.forEach((s, i) => {
            let cls = 'esig-dot';
            if (i < currentIdx) cls += ' done';
            else if (i === currentIdx) cls += ' active';
            const inner = i < currentIdx ? '' : toPersianDigits(i + 1);
            html += '<div class="' + cls + '" title="' + s.label + '">' + inner + '</div>';
        });
        html += '</div>';
        return html;
    }

    function goStep9Stage(key) {
        application.data.step9.stage = key;
        Store.saveApplication(application);
        syncApplicationToDB();
        renderStep9();
    }

    function buildStep9Applicant() {
        const id = application.data.identityAndJob || {};
        const contractId = ((application.data.eSignature || {}).finalContract || {}).contractId || '—';
        const applicantName = (id.firstName || '') + ' ' + (id.lastName || '');
        const nationalId = id.nationalId || '';
        const s9 = application.data.step9;
        const ad = s9.applicantDeclaration || {};

        const isVerified = declOTPVerified || (ad.otpVerified);
        const hasSig = ad.signatureImage && ad.signatureImage.length > 50;

        return '<div class="declaration-card applicant">' +
            '<div class="declaration-head">' +
                '<div class="avatar">👤</div>' +
                '<div class="info">' +
                    '<h4>مرحله ۱ از ۳ — اقرارنامه واگذارگیرنده</h4>' +
                    '<p>اقرار بدون قید و شرط دریافت حق تسهیلات</p>' +
                '</div>' +
            '</div>' +

            '<div class="declaration-text">' +
                '<span class="preamble">اینجانب ' + escapeHtml(applicantName) + ' به کد ملی ' + toPersianDigits(nationalId) + '، در کمال صحت و سلامت عقل و با آگاهی کامل، اقرار و تأیید می‌نمایم:</span>' +
                '<ol>' +
                    '<li><strong>دریافت کامل حق تسهیلات:</strong> حق تسهیلات موضوع قرارداد شماره <strong>' + escapeHtml(contractId) + '</strong> را به‌طور کامل و بدون قید و شرط دریافت کرده‌ام.</li>' +
                    '<li><strong>آگاهی از نقش سامانه وام پی:</strong> به‌طور کامل می‌دانم که سامانه وام پی صرفاً نقش مشاور، معرف و بستر فنی را داشته و طرف قرارداد نبوده و هیچ‌گونه مسئولیتی در قبال تعهدات طرفین ندارد.</li>' +
                    '<li><strong>عدم ادعا نسبت به وام پی:</strong> هیچ‌گونه ادعا یا اعتراضی نسبت به سامانه وام پی ندارم و هرگونه ادعا صرفاً متوجه طرف قرارداد (واگذارکننده) می‌باشد.</li>' +
                    '<li><strong>مسئولیت صحت اطلاعات:</strong> مسئولیت کامل صحت اطلاعات هویتی، مالی و شغلی ارائه‌شده به سامانه، بر عهده اینجانب می‌باشد.</li>' +
                    '<li><strong>رضایت به آزادسازی وجه:</strong> رضایت کامل به آزادسازی وجه امانی به واگذارکننده، پس از تأیید دریافت حق تسهیلات توسط اینجانب و تأیید نهایی مدیر سامانه، می‌دهم.</li>' +
                    '<li><strong>مسئولیت پرداخت اقساط:</strong> مسئولیت کامل پرداخت اقساط تسهیلات به بانک عامل، بر عهده اینجانب می‌باشد.</li>' +
                    '<li><strong>تعهد به عدم واگذاری به ثالث:</strong> متعهد می‌گردم حق تسهیلات موضوع این قرارداد را به شخص ثالثی واگذار ننمایم مگر با موافقت کتبی واگذارکننده و بانک عامل.</li>' +
                    '<li><strong>مسئولیت اظهار خلاف واقع:</strong> مسئولیت کیفری و حقوقی هرگونه اظهار خلاف واقع در این اقرارنامه، بر عهده اینجانب می‌باشد.</li>' +
                '</ol>' +
            '</div>' +

            '<div class="declaration-signature-wrap' + (hasSig ? '' : '') + '" id="declWrap">' +
                '<canvas id="declarationCanvas"></canvas>' +
                '<div class="declaration-signature-placeholder' + (hasSig ? ' hidden' : '') + '" id="declPlaceholder">✍️ اینجا امضا کنید</div>' +
            '</div>' +

            '<div class="declaration-signature-tools">' +
                '<button type="button" class="declaration-sig-btn active" data-dtool="pen">🖊️ قلم</button>' +
                '<button type="button" class="declaration-sig-btn" data-dtool="eraser">🧽 پاک‌کن</button>' +
                '<button type="button" class="declaration-sig-btn" id="declClear">🗑️ پاک کردن</button>' +
            '</div>' +

            '<button type="button" class="declaration-otp-btn' + (isVerified ? ' verified' : '') + '" id="declOtpBtn">' +
                (isVerified ? '✅ هویت تأیید شد' : '🔐 تأیید هویت با کد یک‌بارمصرف') +
            '</button>' +

            '<div class="esig-error" id="declErr" style="margin-top:10px">⚠️ لطفاً امضا کنید و هویت خود را تأیید نمایید.</div>' +

            '<div class="esig-actions" style="margin-top:16px">' +
                '<button type="button" class="btn btn-primary" id="declNextToBroker" disabled>✅ ثبت اقرار و ادامه ➜</button>' +
            '</div>' +
        '</div>';
    }

    function bindStep9Applicant() {
        initDeclarationCanvas();

        const wrap = document.getElementById('declWrap');
        declCanvas.addEventListener('pointerdown', (e) => {
            declDrawing = true;
            wrap.classList.add('active');
            const rect = declCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left, y = e.clientY - rect.top;
            declLastPoint = { x, y }; declDotCount++;
            declCtx.beginPath(); declCtx.moveTo(x, y);
            try { declCanvas.setPointerCapture(e.pointerId); } catch (_) {}
        });
        declCanvas.addEventListener('pointermove', (e) => {
            if (!declDrawing) return;
            const rect = declCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left, y = e.clientY - rect.top;
            declCtx.lineTo(x, y); declCtx.stroke();
            declDotCount++; declLastPoint = { x, y };
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt => {
            declCanvas.addEventListener(evt, () => {
                if (!declDrawing) return;
                declDrawing = false; declCtx.closePath();
                checkDeclSig();
            });
        });

        document.querySelectorAll('.declaration-sig-btn[data-dtool]').forEach(btn => {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.declaration-sig-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                const tool = this.dataset.dtool;
                if (declCtx) {
                    declCtx.lineWidth = tool === 'eraser' ? 16 : 2;
                    declCtx.strokeStyle = tool === 'eraser' ? '#ffffff' : '#0b3b23';
                    declCtx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
                }
            });
        });

        document.getElementById('declClear').addEventListener('click', () => {
            declCtx.clearRect(0, 0, declCanvas.width, declCanvas.height);
            declDotCount = 0;
            const ph = document.getElementById('declPlaceholder');
            if (ph) ph.classList.remove('hidden');
            checkDeclSig();
        });

        const otpBtn = document.getElementById('declOtpBtn');
        if (!declOTPVerified && !(application.data.step9.applicantDeclaration && application.data.step9.applicantDeclaration.otpVerified)) {
            otpBtn.addEventListener('click', () => openDeclOTP());
        } else {
            declOTPVerified = true;
        }

        const nextBtn = document.getElementById('declNextToBroker');
        function checkDeclSig() {
            const valid = declDotCount >= 15 && declOTPVerified;
            nextBtn.disabled = !valid;
        }
        checkDeclSig();

        nextBtn.addEventListener('click', () => {
            if (declDotCount < 15) { showMessage('⚠️ حداقل ۱۵ نقطه رسم کنید.', 'error'); return; }
            if (!declOTPVerified) { showMessage('⚠️ ابتدا هویت خود را تأیید کنید.', 'error'); return; }

            const out = document.createElement('canvas');
            out.width = declCanvas.width; out.height = declCanvas.height;
            const octx = out.getContext('2d');
            octx.fillStyle = '#ffffff'; octx.fillRect(0, 0, out.width, out.height);
            octx.drawImage(declCanvas, 0, 0);
            const dataUrl = out.toDataURL('image/png');

            const contractId = ((application.data.eSignature || {}).finalContract || {}).contractId || '—';

            application.data.step9.applicantDeclaration = {
                text: 'اقرارنامه واگذارگیرنده — شناسه ' + contractId,
                signatureImage: dataUrl,
                signedAt: new Date().toISOString(),
                otpVerified: true,
                otpVerifiedAt: new Date().toISOString()
            };
            application.status = 'awaiting_declaration';
            Store.saveApplication(application);
            syncApplicationToDB();
            showMessage('✅ اقرار شما ثبت شد.', 'success');
            goStep9Stage('brokerDeclaration');
        });
    }

    function initDeclarationCanvas() {
        const canvas = document.getElementById('declarationCanvas');
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
        declCtx = canvas.getContext('2d');
        declCtx.scale(dpr, dpr);
        declCtx.strokeStyle = '#0b3b23'; declCtx.lineWidth = 2;
        declCtx.lineCap = 'round'; declCtx.lineJoin = 'round';
        declCtx.globalCompositeOperation = 'source-over';
        declCanvas = canvas; declDrawing = false; declDotCount = 0;
    }

    function openDeclOTP() {
        const maskedMobile = currentUser.mobile ? currentUser.mobile.slice(0, 4) + '***' + currentUser.mobile.slice(-4) : '09xx***xxxx';
        declOTPCode = '12345';
        declOTPExpiresAt = Date.now() + 120000;
        console.log('🧪 [MOCK OTP Declaration] کد شما: 12345');

        const existing = document.getElementById('declOtpModal'); if (existing) existing.remove();
        const modal = document.createElement('div');
        modal.id = 'declOtpModal';
        modal.className = 'doc-preview-modal open';
        modal.innerHTML =
            '<div class="doc-preview-inner" style="max-width:420px">' +
                '<div class="doc-preview-head"><h3>🔐 تأیید هویت مجدد</h3>' +
                '<button class="doc-preview-close" type="button" id="declOtpClose">×</button></div>' +
                '<div class="doc-preview-body">' +
                    '<div class="esig-otp-info">کد به <strong>' + escapeHtml(maskedMobile) + '</strong> ارسال شد.</div>' +
                    '<div class="otp-inputs" id="declOtpInputs" style="margin:14px 0">' +
                        '<input type="tel" maxlength="1" inputmode="numeric"><input type="tel" maxlength="1" inputmode="numeric"><input type="tel" maxlength="1" inputmode="numeric"><input type="tel" maxlength="1" inputmode="numeric"><input type="tel" maxlength="1" inputmode="numeric">' +
                    '</div>' +
                    '<div class="otp-meta"><span>⏱️ <strong id="declOtpTimer">۲:۰۰</strong></span>' +
                    '<button type="button" id="declOtpResend" style="background:none;border:none;font-family:inherit;color:var(--wam-primary);font-weight:800;font-size:12px;cursor:pointer">ارسال مجدد</button></div>' +
                    '<div class="esig-error" id="declOtpErr">کد اشتباه است.</div>' +
                    '<button type="button" class="btn btn-primary" id="declOtpVerify" disabled style="width:100%;margin-top:10px">✅ تأیید کد</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);

        modal.querySelector('#declOtpClose').addEventListener('click', () => {
            clearInterval(declOTPExpireTimer);
            modal.remove();
        });

        const inputs = modal.querySelectorAll('#declOtpInputs input');
        inputs.forEach((inp, idx) => {
            inp.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 1);
                e.target.classList.toggle('filled', !!e.target.value);
                if (e.target.value && idx < inputs.length - 1) inputs[idx + 1].focus();
                check();
            });
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value && idx > 0) inputs[idx - 1].focus();
            });
        });
        inputs[0].focus();

        function check() {
            const full = Array.from(inputs).every(i => i.value.length === 1);
            modal.querySelector('#declOtpVerify').disabled = !full;
        }

        function updTimer() {
            const left = Math.max(0, Math.floor((declOTPExpiresAt - Date.now()) / 1000));
            const mm = String(Math.floor(left / 60)).padStart(2, '0');
            const ss = String(left % 60).padStart(2, '0');
            const el = modal.querySelector('#declOtpTimer');
            if (el) el.textContent = toPersianDigits(mm + ':' + ss);
            if (left <= 0) { clearInterval(declOTPExpireTimer); }
        }
        updTimer();
        clearInterval(declOTPExpireTimer);
        declOTPExpireTimer = setInterval(updTimer, 1000);

        modal.querySelector('#declOtpResend').addEventListener('click', () => {
            declOTPExpiresAt = Date.now() + 120000;
            inputs.forEach(i => { i.value = ''; i.classList.remove('filled'); });
            modal.querySelector('#declOtpErr').classList.remove('show');
            updTimer();
            console.log('🧪 [MOCK OTP Declaration] کد جدید: 12345');
            showMessage('✅ کد مجدداً ارسال شد.', 'success');
        });

        modal.querySelector('#declOtpVerify').addEventListener('click', () => {
            const entered = Array.from(inputs).map(i => i.value).join('');
            if (entered === declOTPCode && Date.now() < declOTPExpiresAt) {
                clearInterval(declOTPExpireTimer);
                declOTPVerified = true;
                if (!application.data.step9.applicantDeclaration) application.data.step9.applicantDeclaration = {};
                application.data.step9.applicantDeclaration.otpVerified = true;
                application.data.step9.applicantDeclaration.otpVerifiedAt = new Date().toISOString();
                Store.saveApplication(application);
                modal.remove();
                showMessage('✅ هویت تأیید شد.', 'success');
                renderStep9();
            } else {
                modal.querySelector('#declOtpErr').classList.add('show');
                inputs.forEach(i => i.classList.remove('filled'));
                inputs[0].focus();
            }
        });
    }

    function buildStep9Broker() {
        const bd = application.data.step9.brokerDeclaration;
        const contractId = ((application.data.eSignature || {}).finalContract || {}).contractId || '—';
        const charges = Trust.computeCharges(
            (application.data.consultationResult || {}).totalLoan,
            (application.data.consultationResult || {}).fee
        );
        const broker = getRealBrokerInfo();

        if (!bd && !application.data.step9.brokerSigningStarted) {
            application.data.step9.brokerSigningStarted = true;
            Store.saveApplication(application);
            setTimeout(() => {
                if (!application || !application.data || !application.data.step9) return;
                if (application.data.step9.brokerDeclaration) return;
                application.data.step9.brokerDeclaration = {
                    text: 'اقرارنامه واگذارکننده — شناسه ' + contractId,
                    brokerSignatureImage: generateMockSignaturePNG(broker.name),
                    brokerName: broker.name,
                    brokerCode: broker.code,
                    signedAt: new Date().toISOString()
                };
                Store.saveApplication(application);
                syncApplicationToDB();
                showMessage('✅ واگذارکننده اقرارنامه را امضا کرد.', 'success');
                renderStep9();
            }, 2500);
        }

        return '<div class="declaration-card broker">' +
            '<div class="declaration-head">' +
                '<div class="avatar">' + escapeHtml(broker.name.charAt(0)) + '</div>' +
                '<div class="info">' +
                    '<h4>مرحله ۲ از ۳ — اقرارنامه واگذارکننده</h4>' +
                    '<p>' + escapeHtml(broker.name) + ' — کد ' + escapeHtml(broker.code) + '</p>' +
                '</div>' +
            '</div>' +

            '<div class="declaration-text">' +
                '<span class="preamble">اینجانب ' + escapeHtml(broker.name) + ' به کد کارگزاری ' + escapeHtml(broker.code) + '، در کمال صحت و سلامت عقل و با آگاهی کامل، اقرار و تأیید می‌نمایم:</span>' +
                '<ol>' +
                    '<li><strong>انجام تعهدات:</strong> تمامی تعهدات خود را طبق قرارداد شماره <strong>' + escapeHtml(contractId) + '</strong> به‌طور کامل انجام داده‌ام.</li>' +
                    '<li><strong>واگذاری کامل حق تسهیلات:</strong> حق تسهیلات موضوع قرارداد را به‌طور کامل به واگذارگیرنده واگذار کرده‌ام و پس از دریافت حق‌الزحمه، هیچ‌گونه ادعا یا مطالبه دیگری نسبت به تسهیلات واگذارشده ندارم.</li>' +
                    '<li><strong>صحت اسناد و مدارک:</strong> تمامی اسناد و مدارک ارائه‌شده به سامانه، صحیح و مطابق واقع می‌باشد و مسئولیت اصالت آن‌ها بر عهده اینجانب است.</li>' +
                    '<li><strong>رضایت به دریافت حق‌الزحمه:</strong> رضایت کامل به دریافت مبلغ <strong>' + formatAmount(charges.brokerAmount) + ' تومان</strong> پس از کسر کارمزد سامانه، دارم.</li>' +
                    '<li><strong>عدم دریافت وجه اضافی:</strong> متعهد می‌گردم هیچ‌گونه وجه اضافی خارج از چارچوب قرارداد از واگذارگیرنده دریافت نکنم.</li>' +
                    '<li><strong>آگاهی از نقش سامانه وام پی:</strong> به‌طور کامل می‌دانم که سامانه وام پی صرفاً نقش مشاور، معرف و بستر فنی را داشته و طرف قرارداد نبوده و هیچ‌گونه مسئولیتی در قبال تعهدات اینجانب ندارد.</li>' +
                    '<li><strong>مسئولیت تخلف:</strong> مسئولیت کیفری و حقوقی هرگونه تخلف یا اظهار خلاف واقع، بر عهده اینجانب می‌باشد.</li>' +
                    '<li><strong>پاسخگویی به شکایات:</strong> متعهد می‌گردم در صورت بروز هرگونه شکایت از سوی واگذارگیرنده، ظرف مدت ۷۲ ساعت در فرآیند میانجی‌گری سامانه وام پی همکاری نمایم.</li>' +
                '</ol>' +
            '</div>' +

            (bd
                ? '<div class="declaration-broker-signature">' +
                    '<img src="' + bd.brokerSignatureImage + '" alt="امضای واگذارکننده">' +
                    '<div class="meta">✅ امضا در ' + formatDateTimeFa(bd.signedAt) + '</div>' +
                  '</div>' +
                  '<div class="esig-actions" style="margin-top:16px">' +
                    '<button type="button" class="btn btn-primary" id="declToRelease" style="width:100%">➜ ادامه به پرداخت حق‌الزحمه</button>' +
                  '</div>'
                : '<div class="trust-status-box pending">' +
                    '<div class="icon">⏳</div>' +
                    '<div class="body"><p class="text">در انتظار امضای واگذارکننده...</p></div>' +
                  '</div>') +
        '</div>';
    }

    function bindStep9Broker() {
        const btn = document.getElementById('declToRelease');
        if (btn) btn.addEventListener('click', () => {
            goStep9Stage('release');
        });
    }

    function buildStep9Release() {
        const s9 = application.data.step9;
        const pr = s9.paymentRelease;

        if (!pr && !s9.releaseStarted) {
            s9.releaseStarted = true;
            Store.saveApplication(application);

            setTimeout(async () => {
                try {
                    const cr = application.data.consultationResult || {};
                    const charges = Trust.computeCharges(cr.totalLoan, cr.fee);
                    const depositId = application.data.step8.trustDeed.depositId;
                    const broker = getRealBrokerInfo();

                    await Trust.releaseToBroker(depositId, {
                        brokerId: broker.id,
                        brokerName: broker.name,
                        brokerCode: broker.code
                    }, 'جناب آقای پاکذاتی');

                    application.data.step9.paymentRelease = {
                        totalHeld: charges.totalCharge,
                        serviceFeeDeducted: charges.serviceFee,
                        serviceFeePercentDisplay: charges.serviceFeePercentDisplay,
                        brokerAmount: charges.brokerAmount,
                        releasedAt: new Date().toISOString(),
                        releasedBy: 'جناب آقای پاکذاتی',
                        transactionId: 'txn_release_' + Date.now()
                    };
                    application.data.step9.superAdminApproval = {
                        approved: true,
                        approvedAt: new Date().toISOString(),
                        superAdminName: 'جناب آقای پاکذاتی'
                    };
                    application.data.step9.completedAt = new Date().toISOString();
                    application.status = 'payment_released';
                    Store.saveApplication(application);
                    syncApplicationToDB();
                    showMessage('🎉 حق‌الزحمه واگذاری به واگذارکننده پرداخت شد.', 'success');
                    renderStep9();
                } catch (err) {
                    console.error('❌ خطا در آزادسازی:', err);
                    application.data.step9.releaseStarted = false;
                    Store.saveApplication(application);
                    showMessage('خطا در آزادسازی: ' + err.message, 'error');
                }
            }, 2500);

            return '<div class="declaration-card admin">' +
                '<div class="declaration-head">' +
                    '<div class="avatar">پ</div>' +
                    '<div class="info">' +
                        '<h4>مرحله ۳ از ۳ — پرداخت حق‌الزحمه واگذاری</h4>' +
                        '<p>تأیید نهایی و پرداخت به واگذارکننده</p>' +
                    '</div>' +
                '</div>' +
                '<div class="trust-status-box pending">' +
                    '<div class="icon">⏳</div>' +
                    '<div class="body">' +
                        '<div class="title">در حال پرداخت حق‌الزحمه توسط مدیر کل</div>' +
                        '<p class="text">پس از بررسی اقرارنامه‌های سه‌طرفه، مدیر کل وجه امانت را به واگذارکننده پرداخت می‌کند.</p>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }

        if (!pr) {
            return '<div class="declaration-card admin">' +
                '<div class="declaration-head">' +
                    '<div class="avatar">پ</div>' +
                    '<div class="info">' +
                        '<h4>مرحله ۳ از ۳ — پرداخت حق‌الزحمه واگذاری</h4>' +
                        '<p>تأیید نهایی و پرداخت به واگذارکننده</p>' +
                    '</div>' +
                '</div>' +
                '<div class="trust-status-box pending">' +
                    '<div class="icon">⏳</div>' +
                    '<div class="body">' +
                        '<div class="title">در حال پرداخت حق‌الزحمه توسط مدیر کل</div>' +
                        '<p class="text">لطفاً چند لحظه صبر کنید...</p>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }

        return '<div class="declaration-card admin">' +
            '<div class="declaration-head">' +
                '<div class="avatar">پ</div>' +
                '<div class="info">' +
                    '<h4>مرحله ۳ از ۳ — پرداخت انجام شد</h4>' +
                    '<p>تأیید نهایی مدیر کل</p>' +
                '</div>' +
            '</div>' +
            '<div class="release-result">' +
                '<div class="release-result-head">' +
                    '<div class="icon">💰</div>' +
                    '<div>' +
                        '<div class="title">حق‌الزحمه واگذاری پرداخت شد</div>' +
                        '<p class="sub">' + formatDateTimeFa(pr.releasedAt) + '</p>' +
                    '</div>' +
                '</div>' +
                '<div class="release-row"><span>💰 مبلغ کل امانت</span><span>' + formatAmount(pr.totalHeld) + ' تومان</span></div>' +
                '<div class="release-row"><span>🏛️ کارمزد سامانه (' + pr.serviceFeePercentDisplay + ')</span><span>' + formatAmount(pr.serviceFeeDeducted) + ' تومان</span></div>' +
                '<div class="release-row total"><span>🤝 پرداختی به واگذارکننده (جُعل)</span><span>' + formatAmount(pr.brokerAmount) + ' تومان</span></div>' +
            '</div>' +
            '<div class="esig-actions" style="margin-top:16px">' +
                '<button type="button" class="btn btn-gold" id="declToArchive" style="width:100%">➜ ادامه به بایگانی پرونده</button>' +
            '</div>' +
        '</div>';
    }

    function bindStep9Release() {
        const btn = document.getElementById('declToArchive');
        if (btn) btn.addEventListener('click', () => {
            application.status = 'payment_released';
            Store.saveApplication(application);
            syncApplicationToDB();
            goNextStep();
        });
    }

    // ==========================================
    // گام ۱۰: بایگانی و اتمام
    // ==========================================
    function renderStep10() {
        if (!application.data.step10) {
            application.data.step10 = {
                stage: 'archive',
                archive: null,
                startedAt: new Date().toISOString()
            };
            Store.saveApplication(application);
        }
        const flow = document.getElementById('step10Flow');
        if (!flow) return;

        const s10 = application.data.step10;
        const idx = STEP10_STAGES.findIndex(s => s.key === s10.stage);
        step10Stage = idx >= 0 ? idx : 0;
        const currentKey = STEP10_STAGES[step10Stage].key;

        let content = buildStep10Progress();
        switch (currentKey) {
            case 'archive': content += buildStep10Archive(); break;
            case 'final':   content += buildStep10Final(); break;
        }
        flow.innerHTML = content;

        switch (currentKey) {
            case 'archive': bindStep10Archive(); break;
            case 'final':   bindStep10Final(); break;
        }
    }

    function buildStep10Progress() {
        let html = '<div class="esignature-progress">';
        const s10 = application.data.step10;
        const currentIdx = STEP10_STAGES.findIndex(s => s.key === s10.stage);
        STEP10_STAGES.forEach((s, i) => {
            let cls = 'esig-dot';
            if (i < currentIdx) cls += ' done';
            else if (i === currentIdx) cls += ' active';
            const inner = i < currentIdx ? '' : toPersianDigits(i + 1);
            html += '<div class="' + cls + '" title="' + s.label + '">' + inner + '</div>';
        });
        html += '</div>';
        return html;
    }

    function goStep10Stage(key) {
        application.data.step10.stage = key;
        Store.saveApplication(application);
        renderStep10();
    }

    function buildStep10Archive() {
        const s10 = application.data.step10;

        if (!s10.archive && !s10.archiveStarted) {
            s10.archiveStarted = true;
            Store.saveApplication(application);

            setTimeout(async () => {
                try {
                    const archiveId = 'ARCH-' + new Date().getFullYear() + '-' + String(Math.floor(1000 + Math.random() * 9000));
                    const archivedAt = new Date().toISOString();
                    const contractId = ((application.data.eSignature || {}).finalContract || {}).contractId || '—';
                    const deedNumber = ((application.data.step8 || {}).trustDeed || {}).deedNumber || '—';

                    const archiveData = JSON.stringify({
                        archiveId, applicationId: application.id, contractId, deedNumber,
                        archivedAt, status: 'completed'
                    });
                    const archiveHash = await Trust.sha256(archiveData);

                    application.data.step10.archive = {
                        archiveId,
                        archivedAt,
                        documents: {
                            contract: contractId,
                            invoice: ((application.data.step8 || {}).invoice || {}).invoiceNumber || '—',
                            trustDeed: deedNumber,
                            declaration: 'اقرارنامه سه‌طرفه ' + contractId,
                            evidences: 'اسناد پشتیبان'
                        },
                        archiveHash
                    };
                    application.status = 'completed';
                    application.completedAt = archivedAt;
                    Store.clearDraft(currentUser.id);
                    Store.saveApplication(application);
                    syncApplicationToDB();
                    showMessage('✅ پرونده بایگانی شد.', 'success');
                    renderStep10();
                } catch (err) {
                    console.error('❌ خطا در بایگانی:', err);
                    application.data.step10.archiveStarted = false;
                    Store.saveApplication(application);
                    showMessage('خطا در بایگانی: ' + err.message, 'error');
                }
            }, 2000);

            return '<div class="esig-stage">' +
                '<div class="esig-stage-title"><div class="esig-stage-icon">📦</div><span>مرحله ۱ از ۲ — تولید سند بایگانی</span></div>' +
                '<p class="esig-stage-sub">در حال تولید سند بایگانی نهایی...</p>' +
                '<div style="text-align:center;padding:32px"><div class="loader-spinner"></div></div>' +
            '</div>';
        }

        if (!s10.archive) {
            return '<div class="esig-stage">' +
                '<div class="esig-stage-title"><div class="esig-stage-icon">📦</div><span>مرحله ۱ از ۲ — تولید سند بایگانی</span></div>' +
                '<p class="esig-stage-sub">لطفاً چند لحظه صبر کنید...</p>' +
                '<div style="text-align:center;padding:32px"><div class="loader-spinner"></div></div>' +
            '</div>';
        }

        const arc = s10.archive;
        return '<div class="esig-stage">' +
            '<div class="esig-stage-title"><div class="esig-stage-icon">📦</div><span>مرحله ۱ از ۲ — سند بایگانی</span></div>' +
            '<div class="archive-card">' +
                '<div class="archive-icon">📦</div>' +
                '<div class="archive-title">سند بایگانی رسمی</div>' +
                '<p class="archive-sub">پرونده شما با موفقیت بایگانی شد.</p>' +
                '<div class="archive-id-box">' +
                    '<div class="archive-id-label">شناسه بایگانی</div>' +
                    '<div class="archive-id-value">' + escapeHtml(arc.archiveId) + '</div>' +
                '</div>' +
                '<div class="archive-hash">🔐 ' + escapeHtml((arc.archiveHash || '').slice(0, 48)) + '...</div>' +
            '</div>' +
            '<div class="archive-documents">' +
                '<div class="archive-documents-title">📚 اسناد موجود در بایگانی</div>' +
                '<div class="archive-documents-list">' +
                    '<div class="archive-doc-item"><div class="doc-icon">📄</div><div class="doc-info"><strong>قرارداد واگذاری تسهیلات</strong><span>' + escapeHtml(arc.documents.contract) + '</span></div><span class="status">✅</span></div>' +
                    '<div class="archive-doc-item"><div class="doc-icon">🧾</div><div class="doc-info"><strong>فاکتور پرداخت</strong><span>' + escapeHtml(arc.documents.invoice || '—') + '</span></div><span class="status">✅</span></div>' +
                    '<div class="archive-doc-item"><div class="doc-icon">🏛️</div><div class="doc-info"><strong>سند امانت</strong><span>' + escapeHtml(arc.documents.trustDeed) + '</span></div><span class="status">✅</span></div>' +
                    '<div class="archive-doc-item"><div class="doc-icon">✍️</div><div class="doc-info"><strong>اقرارنامه سه‌طرفه</strong><span>' + escapeHtml(arc.documents.declaration) + '</span></div><span class="status">✅</span></div>' +
                    '<div class="archive-doc-item"><div class="doc-icon">📎</div><div class="doc-info"><strong>اسناد پشتیبان</strong><span>' + escapeHtml(arc.documents.evidences) + '</span></div><span class="status">✅</span></div>' +
                '</div>' +
            '</div>' +
            '<div class="esig-actions" style="margin-top:16px">' +
                '<button type="button" class="btn btn-primary" id="archiveToFinal" style="width:100%">🎉 مشاهده پایان موفق</button>' +
            '</div>' +
        '</div>';
    }

    function bindStep10Archive() {
        const btn = document.getElementById('archiveToFinal');
        if (btn) btn.addEventListener('click', () => {
            goStep10Stage('final');
        });
    }

    function buildStep10Final() {
        const arc = application.data.step10.archive || {};
        const cr = application.data.consultationResult || {};
        const contractId = ((application.data.eSignature || {}).finalContract || {}).contractId || '—';
        const charges = Trust.computeCharges(cr.totalLoan, cr.fee);

        return '<div class="final-success-card">' +
            '<div class="final-success-icon">🎉</div>' +
            '<h2 class="final-success-title">پرونده با موفقیت تکمیل شد</h2>' +
            '<p class="final-success-sub">' +
                'تمام مراحل ۱۰ گانه سامانه وام پی با موفقیت به پایان رسید.<br>' +
                'قرارداد واگذاری تسهیلات صادر، حق‌الزحمه پرداخت و پرونده بایگانی شد.' +
            '</p>' +

            '<div class="final-success-info">' +
                '<div class="row"><span>📌 شناسه قرارداد</span><span>' + escapeHtml(contractId) + '</span></div>' +
                '<div class="row"><span>📦 شناسه بایگانی</span><span>' + escapeHtml(arc.archiveId || '—') + '</span></div>' +
                '<div class="row"><span>💰 مبلغ وام</span><span>' + formatAmount(cr.totalLoan) + ' تومان</span></div>' +
                '<div class="row"><span>🏛️ کارمزد سامانه</span><span>' + formatAmount(charges.serviceFee) + ' تومان</span></div>' +
                '<div class="row"><span>🤝 پرداختی به واگذارکننده</span><span>' + formatAmount(charges.brokerAmount) + ' تومان</span></div>' +
                '<div class="row"><span>✅ وضعیت</span><span style="color:#1e8e4a">تکمیل و بایگانی</span></div>' +
            '</div>' +

            '<div class="archive-actions">' +
                '<button type="button" class="btn btn-primary" id="finalDownloadAll">🖨️ چاپ / PDF سند نهایی</button>' +
                '<button type="button" class="btn btn-secondary" id="finalPrintAll">📥 دانلود HTML</button>' +
            '</div>' +

            '<div style="font-size:12.5px;color:var(--wam-text-muted);text-align:center;margin:20px 0;font-style:italic;line-height:2">' +
                'از اعتماد شما سپاسگزاریم 🌹<br>تیم وام پی همواره در خدمت شماست.' +
            '</div>' +

            '<button type="button" class="btn btn-gold" id="finalGoDashboard" style="width:100%">🏠 بازگشت به داشبورد</button>' +
        '</div>';
    }

    function bindStep10Final() {
        showConfetti();

        document.getElementById('finalDownloadAll').addEventListener('click', () => {
         const contract = (application.data.eSignature && application.data.eSignature.finalContract) || null;
         if (contract) {
         printFinal(contract);
         } else {
        showMessage('⚠️ فایل سند نهایی هنوز آماده نیست. لطفاً صفحه را رفرش کنید.', 'warn');
         }
        });

        document.getElementById('finalPrintAll').addEventListener('click', () => {
         const contract = (application.data.eSignature && application.data.eSignature.finalContract) || null;
         if (contract) {
        downloadFinalHTML(contract);
         } else {
        showMessage('⚠️ فایل سند نهایی هنوز آماده نیست. لطفاً صفحه را رفرش کنید.', 'warn');
          }
         });

        document.getElementById('finalGoDashboard').addEventListener('click', () => {
            window.location.href = 'applicant-dashboard.html';
        });
          }

    function showConfetti() {
        const colors = ['#0b3b23','#d4a62a','#1e8e4a','#c0392b','#f4b400'];
        const c = document.createElement('div');
        c.className = 'confetti';
        for (let i = 0; i < 60; i++) {
            const p = document.createElement('div');
            p.className = 'confetti-piece';
            p.style.left = Math.random() * 100 + '%';
            p.style.background = colors[Math.floor(Math.random() * colors.length)];
            p.style.animationDelay = (Math.random() * 0.8) + 's';
            p.style.animationDuration = (2 + Math.random() * 1.5) + 's';
            c.appendChild(p);
        }
        document.body.appendChild(c);
        setTimeout(() => c.remove(), 4500);
    }

    // ==========================================
    // اعتبارسنجی گام‌ها
    // ==========================================
    function collectStepData(stepIdx) {
        const step = STEPS[stepIdx]; if (!step) return {};
        const out = {};
        step.fields.forEach(key => {
            if (key === 'gender' || key === 'militaryStatus') {
                const c = document.querySelector('input[name="'+key+'"]:checked');
                out[key] = c ? c.value : ''; return;
            }
            if (key === 'paymentMethod') {
                const c = document.querySelector('input[name="paymentMethod"]:checked');
                out[key] = c ? c.value : ''; return;
            }
            const el = document.getElementById('w_'+key);
            if (el) {
                let val = (el.value || '').trim();
                if (['loanAmount','monthlyIncome','otherIncome','minInstallment','maxInstallment'].includes(key)) {
                    val = val.replace(/,/g, '');
                }
                out[key] = val;
            }
        });
        return out;
    }

    function validateStep(stepIdx) {
        const step = STEPS[stepIdx]; if (!step) return true;
        if (step.key === 'consultation') return !!application.data.consultation;
        if (step.key === 'documents') return allRequiredUploaded();
        if (step.key === 'finalization') return validateFinalization();
        if (step.key === 'contractReview') return validateContractReview();
        if (step.key === 'eSignature') return true;
        if (step.key === 'trustPayment') return true;
        if (step.key === 'declaration') return true;
        if (step.key === 'archive') return true;
        if (step.fields.length === 0) return true;

        document.querySelectorAll('.field').forEach(f => f.classList.remove('invalid'));
        let ok = true;
        const data = collectStepData(stepIdx);

        step.fields.forEach(key => {
            const fw = document.querySelector('.field[data-key="'+key+'"]');
            const val = data[key]; let inv = false;
            switch (key) {
                case 'firstName': case 'lastName': case 'fatherName':
                    inv = !val || val.length < 2; break;
                case 'nationalId': inv = !isValidNationalCode(val); break;
                case 'birthDate': { const age = calcAgeFromJalali(val); inv = age === null || age < 18 || age > 75; break; }
                case 'gender': inv = !val; break;
                case 'militaryStatus': { const g = document.querySelector('input[name="gender"]:checked'); if (g && g.value === 'male') inv = !val; break; }
                case 'phone': if (val) inv = !/^0\d{7,10}$/.test(toEnglishDigits(val).replace(/\D/g,'')); break;
                case 'postalCode': inv = !/^[0-9]{10}$/.test(toEnglishDigits(val).replace(/\D/g,'')); break;
                case 'address': inv = !val || val.length < 15; break;
                case 'jobType': inv = !val; break;
                case 'employerName': inv = !val || val.length < 3; break;
                case 'workYears': { const n = num(val); inv = isNaN(n) || n < 0 || n > 60 || val === ''; break; }
                case 'monthlyIncome': inv = !num(val) || num(val) < 10000000; break;
                case 'bankLoanType': inv = !val; break;
                case 'loanAmount': { const n = num(val); inv = !n || n < LOAN_LIMITS.min || n > LOAN_LIMITS.max; break; }
                case 'minInstallment': { const n = num(val); inv = !n || n < MIN_INSTALLMENT_LIMIT; break; }
                case 'maxInstallment': { const n = num(val); const mn = num(data.minInstallment); inv = !n || n < MIN_INSTALLMENT_LIMIT || (mn && n < mn); break; }
            }
            if (inv) { ok = false; if (fw) fw.classList.add('invalid'); }
        });
        return ok;
    }

    function validateFinalization() {
        let ok = true;
        const pm = document.querySelector('input[name="paymentMethod"]:checked');
        const pmField = document.getElementById('paymentMethodField');
        if (!pm) { ok = false; if (pmField) pmField.classList.add('invalid'); }
        else if (pmField) pmField.classList.remove('invalid');

        const baEl = document.getElementById('w_finalBankAccount');
        const ba = baEl ? (baEl.value||'').trim() : '';
        const baClean = toEnglishDigits(ba).replace(/\D/g,'');
        const bf = document.querySelector('.field[data-key="finalBankAccount"]');
        if (!baClean || baClean.length < 10) { ok = false; if (bf) bf.classList.add('invalid'); }
        else if (bf) bf.classList.remove('invalid');

        const fd = application.data.finalDocs || {};
        FINAL_DOCS.forEach(d => { if (!fd[d.id]) ok = false; });

        const cb = document.getElementById('w_termsAgreed');
        const err = document.getElementById('termsErr');
        if (!cb || !cb.checked) { ok = false; if (err) err.style.display = 'block'; }
        else if (err) err.style.display = 'none';

        return ok;
    }

    function validateContractReview() {
        const cf = application.data.contractFlow;
        if (!cf) return false;
        return cf.applicantApproval && cf.applicantApproval.status === 'approved'
            && cf.superAdminApproval && cf.superAdminApproval.status === 'approved';
    }

    function saveCurrentStep() {
        const step = STEPS[currentStep]; if (!step || step.fields.length === 0) return;
        if (['consultation','documents','contractReview','eSignature','trustPayment','declaration','archive'].includes(step.key)) return;
        const data = collectStepData(currentStep);
        if (step.key === 'finalization') {
            application.data.finalization = {
                finalBankAccount: data.finalBankAccount,
                paymentMethod: data.paymentMethod,
                termsAgreed: !!(document.getElementById('w_termsAgreed') || {}).checked,
                agreedAt: new Date().toISOString()
            };
        } else {
            application.data[step.key] = data;
        }
        application.currentStep = currentStep;
        Store.saveApplication(application);
        Store.saveDraft(currentUser.id, { applicationId: application.id });
    }

    // ==========================================
    // ناوبری
    // ==========================================
    function goNext() {
        const step = STEPS[currentStep];

        if (step.key === 'documents') {
            submitDocumentsForVerification();
            return;
        }

        const lockCheck = canGoToNextStep(step);
        if (!lockCheck.ok) {
            showMessage(lockCheck.error, 'error');
            console.log('🔒 [Lock]', lockCheck.error);
            return;
        }

        if (step.key === 'loanInfo' && STEPS[currentStep + 1] && STEPS[currentStep + 1].key === 'consultation') {
            if (application.status === 'draft') {
                application.status = 'awaiting_consultation';
                application.currentStep = currentStep + 1;
                Store.saveApplication(application);

                const q = JSON.parse(localStorage.getItem('wamPayConsultationQueue') || '[]');
                if (!q.find(x => x.id === application.id)) {
                    q.push({
                        id: application.id,
                        caseId: application.id,
                        caseNumber: application.caseNumber,
                        applicantName: ((application.data.identityAndJob || {}).firstName || '') + ' ' +
                                       ((application.data.identityAndJob || {}).lastName || ''),
                        applicantMobile: currentUser.mobile,
                        name: ((application.data.identityAndJob || {}).firstName || '') + ' ' +
                              ((application.data.identityAndJob || {}).lastName || ''),
                        status: 'awaiting_consultation',
                        date: new Date().toISOString(),
                        data: application.data
                    });
                    localStorage.setItem('wamPayConsultationQueue', JSON.stringify(q));
                    console.log('✅ [Consultation] پرونده به صف مشاور ارسال شد:', application.caseNumber);
                }
            }
        }


        if (step.key === 'consultation') {
            if (!application.data.consultation) {
                const e = document.getElementById('ratingErr');
                if (e) {
                    e.textContent = '⚠️ لطفاً نظر خود را ثبت کنید.';
                    e.classList.add('show');
                    e.scrollIntoView({behavior:'smooth',block:'center'});
                }
                return;
            }
        } else if (step.key === 'finalization') {
            if (!validateFinalization()) {
                showMessage('⚠️ لطفاً خطاها را برطرف کنید.', 'error');
                const fi = document.querySelector('.field.invalid');
                if (fi) fi.scrollIntoView({behavior:'smooth',block:'center'});
                return;
            }
        } else if (step.key === 'contractReview') {
            if (!validateContractReview()) {
                showMessage('⚠️ لطفاً پیش‌نویس را دانلود، مطالعه و تأیید کنید.', 'error');
                const st = document.querySelector('.contract-stage.active');
                if (st) st.scrollIntoView({behavior:'smooth',block:'center'});
                return;
            }
       } else if (['eSignature','trustPayment','declaration','archive'].includes(step.key)) {
    return;
            
        } else if (step.fields.length > 0) {
            if (!validateStep(currentStep)) {
                showMessage('لطفاً خطاهای فرم را برطرف کنید.', 'error');
                const fe = document.querySelector('.field.invalid');
                if (fe) fe.scrollIntoView({behavior:'smooth',block:'center'});
                return;
            }
        }

        saveCurrentStep();

        syncApplicationToDB();

        if (STEPS[currentStep + 1] && STEPS[currentStep + 1].key === 'eSignature') {
            if (application.status !== 'awaiting_signature') {
                application.status = 'awaiting_signature';
                Store.saveApplication(application);
            }
        }

        currentStep++;
        if (currentStep > STEPS.length - 1) currentStep = STEPS.length - 1;
        application.currentStep = currentStep;
        Store.saveApplication(application);
        renderStep();
    }

    function goPrev() {
        if (currentStep === 0) return;
        saveCurrentStep(); currentStep--; renderStep();
    }

    function goNextStep() {
        saveCurrentStep();
        if (currentStep === 6) {
            if (application.status !== 'payment_pending') {
                application.status = 'payment_pending';
                Store.saveApplication(application);
            }
        }
        currentStep++;
        if (currentStep > STEPS.length - 1) currentStep = STEPS.length - 1;
        renderStep();
    }

    function goPrevStep() {
        if (currentStep === 0) return;
        saveCurrentStep(); currentStep--; renderStep();
    }
    

    // ==========================================
    // مشاوره
    // ==========================================
    function bindConsultationEvents() {
        const options = document.querySelectorAll('#ratingOptions .rating-option');
        const ss = document.getElementById('starsSection');
        const cs = document.getElementById('complaintSection');
        const stars = document.querySelectorAll('#starsContainer span');
        const sb = document.getElementById('saveRatingBtn');
        if (!options.length || !sb) return;

        options.forEach(opt => {
            opt.addEventListener('click', function () {
                options.forEach(o => o.classList.remove('checked'));
                this.classList.add('checked');
                const r = this.querySelector('input[type="radio"]'); if (r) r.checked = true;
                const v = this.getAttribute('data-value');
                if (v === 'called') { ss.classList.remove('hidden'); cs.classList.add('hidden'); }
                else if (v === 'not_called') { ss.classList.add('hidden'); cs.classList.remove('hidden'); }
            });
        });
        stars.forEach(star => {
            star.addEventListener('click', function () {
                const v = parseInt(this.getAttribute('data-star'),10);
                stars.forEach((s,i)=>s.classList.toggle('active', i<v));
                document.getElementById('w_consultRating').value = String(v);
                document.getElementById('starsCaption').textContent = RATING_CAPTIONS[v];
            });
        });
        sb.addEventListener('click', function () {
            const selected = document.querySelector('input[name="consultStatus"]:checked');
            const er = document.getElementById('ratingErr');
            if (!selected) { er.textContent = '⚠️ لطفاً یکی از گزینه‌ها را انتخاب کنید.'; er.classList.add('show'); return; }
            const status = selected.value;
            const rating = document.getElementById('w_consultRating').value;
            const comment = document.getElementById('w_consultComment').value.trim();
            const complaint = document.getElementById('w_consultComplaint').value.trim();
            if (status === 'called' && !rating) { er.textContent = '⚠️ لطفاً امتیاز خود را انتخاب کنید.'; er.classList.add('show'); return; }
            er.classList.remove('show');

            application.data.consultation = {
                status, rating: status === 'called' ? Number(rating) : null,
                comment: status === 'called' ? (comment||null) : null,
                complaint: status === 'not_called' ? (complaint||null) : null,
                submittedAt: new Date().toISOString()
            };

            if (application.status === 'draft') {
                application.status = 'awaiting_consultation';
            }

            const q = JSON.parse(localStorage.getItem('wamPayConsultationQueue') || '[]');
            if (!q.find(x => x.id === application.id)) {
                q.push({
                    id: application.id,
                    caseId: application.id,
                    caseNumber: application.caseNumber,
                    applicantName: ((application.data.identityAndJob || {}).firstName || '') + ' ' +
                                   ((application.data.identityAndJob || {}).lastName || ''),
                    applicantMobile: currentUser.mobile,
                    name: ((application.data.identityAndJob || {}).firstName || '') + ' ' +
                          ((application.data.identityAndJob || {}).lastName || ''),
                    status: 'awaiting_consultation',
                    date: new Date().toISOString(),
                    data: application.data
                });
                localStorage.setItem('wamPayConsultationQueue', JSON.stringify(q));
            }

            application.currentStep = currentStep;
            Store.saveApplication(application);
            Store.saveDraft(currentUser.id, { applicationId: application.id });
            syncApplicationToDB();
            document.getElementById('ratingSuccess').classList.remove('hidden');
            sb.disabled = true; sb.textContent = '✅ نظر ثبت شد';
            showMessage('✅ نظر شما ثبت شد. منتظر تأیید مشاور باشید.', 'success');
            renderStep();
        });
    }

    function bindFinalizationEvents() {
        const pms = document.querySelectorAll('.payment-method');
        pms.forEach(pm => {
            pm.addEventListener('click', function () {
                pms.forEach(p => p.classList.remove('checked'));
                this.classList.add('checked');
                const r = this.querySelector('input[type="radio"]'); if (r) r.checked = true;
                const f = document.getElementById('paymentMethodField'); if (f) f.classList.remove('invalid');
            });
        });

        const cbTerms = document.getElementById('w_termsAgreed');
        if (cbTerms) {
            cbTerms.addEventListener('change', syncTermsCheckbox);
            syncTermsCheckbox();
        }

        const ba = document.getElementById('w_finalBankAccount');
        if (ba) ba.addEventListener('input', function () {
            this.value = this.value.replace(/[^\d]/g,'').slice(0,20);
            const fw = document.querySelector('.field[data-key="finalBankAccount"]');
            if (fw) fw.classList.remove('invalid');
        });
    }

    // ==========================================
    // رویدادها
    // ==========================================
    if (nextBtn) nextBtn.addEventListener('click', goNext);
    if (prevBtn) prevBtn.addEventListener('click', goPrev);

    document.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const t = e.target;
        if (t.tagName === 'INPUT' && t.type !== 'file' && t.type !== 'checkbox' && t.type !== 'radio') {
            e.preventDefault(); goNext();
        }
    });

    let autoSaveTimer = null;
    document.addEventListener('input', e => {
        if (!e.target.id || !e.target.id.startsWith('w_')) return;
        if (currentStep >= 5) return;
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => { try { saveCurrentStep(); } catch (_) {} }, 800);
    });

    const numberFields = ['w_loanAmount', 'w_monthlyIncome', 'w_otherIncome', 'w_minInstallment', 'w_maxInstallment'];
    numberFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', function() {
                formatNumberInput(this);
            });
        }
    });

    function bindRadioGroup(gid, name, cb) {
        const g = document.getElementById(gid); if (!g) return;
        g.querySelectorAll('input[type="radio"]').forEach(r => {
            r.addEventListener('change', function () {
                g.querySelectorAll('.radio-opt').forEach(o => o.classList.remove('checked'));
                this.closest('.radio-opt').classList.add('checked');
                if (cb) cb(this.value);
                const w = document.querySelector('.field[data-key="' + name + '"]');
                if (w) w.classList.remove('invalid');
            });
        });
    }
    bindRadioGroup('genderGroup', 'gender', () => toggleMilitaryField());
    bindRadioGroup('militaryGroup', 'militaryStatus');

    // شروع
    initApplication();
    bindConsultationEvents();
    bindFinalizationEvents();

    if (application && application.id && DB_SYNC_ENABLED) {
        syncApplicationToDB();
    }

    console.log('🧙‍♂️ Applicant Wizard v15.2.0 + Lock + DB Sync + Submit + Notes + Duplicate Fix + Number Format + AwaitingSignature Fix — آماده است');
    console.log('%c🆕 v15.2.0: Fix status → awaiting_signature (بدون بازگشت به مدیر کل)', 'color:#1e8e4a;font-weight:bold;');
    console.log('%c✅ هر ۳ تغییر اعمال شد — آماده تست', 'color:#d4a62a;font-weight:bold;');
})();