window.addEventListener('load', function() {
    // فقط اگه از داشبورد اومده باشیم
    if (!window.location.search.includes('continue=true')) return;
    
    const user = JSON.parse(localStorage.getItem('wamPayCurrentUser'));
    if (!user) return;

    if (!window.WAM_SB || !window.WAM_SB.client) {
        console.error(' Supabase Client آماده نیست.');
        return;
    }

    console.log(' [Continue] در حال دریافت پرونده از دیتابیس...');

    window.WAM_SB.client
        .from('applications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(function(result) {
            if (result.data) {
                const appData = {
                    id: result.data.id,
                    caseNumber: result.data.application_number,
                    status: result.data.status,
                    currentStep: 3,
                    data: {
                        identityAndJob: result.data.personal_info || {},
                        loanInfo: result.data.financial_info || {},
                        documents: result.data.documents || {}
                    }
                };
                localStorage.setItem('wamPayApplications', JSON.stringify([appData]));
                localStorage.removeItem('wamPayDraft');
                console.log(' [Continue] پرونده ذخیره شد. رفرش...');
                window.location.href = 'applicant-wizard.html';
            } else {
                console.warn(' [Continue] پروندهای پیدا نشد.');
            }
        })
        .catch(function(err) {
            console.error(' [Continue] خطا:', err);
        });
});
