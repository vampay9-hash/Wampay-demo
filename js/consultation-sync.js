// این فایل اطلاعات دیتابیس رو به داشبورد مشاوره تزریق میکنه
(async function() {
    if (!window.WAM_SB || !window.WAM_SB.client) {
        console.error('❌ Supabase Client آماده نیست.');
        return;
    }

    console.log('🔄 [Sync] در حال دریافت پرونده‌ها از دیتابیس برای داشبورد مشاور...');

    const { data, error } = await window.WAM_SB.client
        .from('applications')
        .select('*')
        .in('status', ['awaiting_consultation', 'consultation_approved', 'draft']);

    if (error) {
        console.error('❌ [Sync] خطا در خواندن دیتابیس:', error);
        return;
    }

    const bankNames = { 'resalat': 'رسالت', 'mehr': 'مهر', 'sepah': 'سپه', 'melli': 'ملی' };

    const queue = data.map(app => {
        // تبدیل وضعیت دیتابیس به وضعیتی که داشبورد مشاوره میفهمه
        let displayStatus = app.status;
        if (app.status === 'awaiting_consultation' || app.status === 'draft') {
            displayStatus = 'pending';
        } else if (app.status === 'consultation_approved') {
            displayStatus = 'referred';
        }

        // 🔍 پیدا کردن داده‌ها با هر ساختاری که هست
        // اگر داده‌ها در ستون data باشن (ویزارد جدید)
        const d = app.data || {};
        // اگر در ستون‌های جداگانه باشن (دیتابیس قدیمی)
        const personal = app.personal_info || app.applicant_data || app.applicantData || {};
        const financial = app.financial_info || app.loan_data || app.loanData || {};

        // ترکیب همه ساختارها
        const identity = d.identityAndJob || personal;
        const loan = d.loanInfo || financial;

        // استخراج فیلدها
        const firstName = identity.firstName || '';
        const lastName = identity.lastName || '';
        const fullName = (firstName + ' ' + lastName).trim() || identity.fullName || identity.name || '—';

        return {
            id: app.id,
            caseId: app.id,
            caseNumber: app.case_number || app.application_number || app.caseNumber || '—',
            applicantName: fullName,
            applicantMobile: app.mobile || identity.mobile || identity.phone || '—',
            applicantNationalId: identity.nationalId || '—',
            loanAmount: loan.loanAmount ? Number(loan.loanAmount) : 0,
            creditName: bankNames[loan.bankLoanType] || loan.bankLoanType || '—',
            jobType: identity.jobType || '—',
            source: app.source || 'direct',
            brokerName: app.broker_name || app.brokerName || '—',
            priority: app.priority || 'normal',
            status: displayStatus,
            originalStatus: app.status,
            submittedAt: app.created_at || app.createdAt || new Date().toISOString(),
            date: app.created_at || app.createdAt,
            consultedAt: null,
            consultedBy: null,
            rating: 0,
            calls: [],
            note: '',
            checklist: {},
            referralNote: '',
            data: {
                identityAndJob: identity,
                loanInfo: loan,
                documents: d.documents || app.documents || {}
            }
        };
    });

    localStorage.setItem('wamPayConsultationQueue', JSON.stringify(queue));
    console.log('✅ [Sync] تعداد ' + queue.length + ' پرونده به حافظه مرورگر تزریق شد.');

    if (queue.length > 0 && !sessionStorage.getItem('consultation_synced')) {
        sessionStorage.setItem('consultation_synced', 'true');
        location.reload();
    }
})();