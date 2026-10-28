window.addEventListener('load', function() {
    const checkExist = setInterval(function() {
        const card = document.querySelector('.case-card');
        if (card && !card.querySelector('.btn-continue')) {
            clearInterval(checkExist);
            
            const btnDiv = document.createElement('div');
            btnDiv.style.padding = '15px';
            btnDiv.style.borderTop = '1px solid #eee';
            btnDiv.style.textAlign = 'center';

            const a = document.createElement('a');
            a.href = '#';
            a.className = 'btn-continue';
            a.textContent = ' ادامه پرونده و تکمیل مراحل';
            a.style.display = 'inline-block';
            a.style.padding = '12px 20px';
            a.style.background = '#1e8e4a';
            a.style.color = 'white';
            a.style.textDecoration = 'none';
            a.style.borderRadius = '8px';
            a.style.fontWeight = 'bold';
            a.style.width = '100%';
            a.style.boxSizing = 'border-box';
            a.style.cursor = 'pointer';

            a.onclick = async function(e) {
                e.preventDefault();
                e.stopPropagation();
                a.textContent = ' در حال دریافت پرونده...';
                
                const user = JSON.parse(localStorage.getItem('wamPayCurrentUser'));
                if (!user) return alert('لطفا دوباره لاگین کنید.');

                const { data, error } = await window.WAM_SB.client
                    .from('applications')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (error || !data) {
                    alert('خطا: پروندهای پیدا نشد.');
                    a.textContent = ' ادامه پرونده و تکمیل مراحل';
                    return;
                }

                //  ذخیره با ساختاری که ویزارد دقیقا انتظار داره
                const appData = {
                    id: data.id,
                    caseNumber: data.application_number,
                    userId: user.id,
                    userMobile: user.mobile,
                    status: 'draft', // به ظاهر draft ولی currentStep=3
                    currentStep: 3,
                    applicantData: {
                        mobile: user.mobile,
                        name: user.name || 'کاربر',
                        firstName: (data.personal_info && data.personal_info.firstName) || '',
                        lastName: (data.personal_info && data.personal_info.lastName) || '',
                        nationalId: (data.personal_info && data.personal_info.nationalId) || ''
                    },
                    data: {
                        identityAndJob: data.personal_info || {},
                        loanInfo: data.financial_info || {},
                        documents: data.documents || {}
                    }
                };

                localStorage.setItem('wamPayApplications', JSON.stringify([appData]));
                console.log(' پرونده ذخیره شد. رفرش...');
                window.location.href = 'applicant-wizard.html';
            };

            btnDiv.appendChild(a);
            card.appendChild(btnDiv);
        }
    }, 500);
});
