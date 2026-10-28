/* ============================================================
   WAM PAY — Applicant Wizard Addons (v2.1)
   تغییرات:
   ۱. حذف auto-approve ها
   ۲. افزودن دکمه «ثبت و ارسال» به گام ۵
   ۳. خواندن application از Supabase + DOM (برای سفته‌های تازه‌آپلود)
   ۴. قفل کردن دکمه‌های بعدی/قبلی بعد از ثبت
   ============================================================ */

(function () {
    'use strict';

    console.log('%c🔧 [Addons v2.1] applicant-wizard-addons.js لود می‌شود...', 'color:#1e8e4a;font-weight:bold;');

    // ============================================================
    //  ۱. غیرفعال کردن auto-approve ها
    // ============================================================
    function disableAutoApproves() {
        if (window.step8BrokerAutoTimer) clearTimeout(window.step8BrokerAutoTimer);
        if (window.step8SuperAdminTimer) clearTimeout(window.step8SuperAdminTimer);
        if (window.step8WaitTimer) clearInterval(window.step8WaitTimer);
    }

    // ============================================================
    //  ۲. پیدا کردن پرونده‌ی فعال از Supabase
    // ============================================================
    async function findActiveCase() {
        if (!window.WAM_SB || !window.WAM_SB.client) {
            console.warn('⚠️ [Addons] WAM_SB موجود نیست');
            return null;
        }

        try {
            const urlParams = new URLSearchParams(window.location.search);
            const caseId = urlParams.get('caseId');
            
            if (caseId) {
                const { data } = await window.WAM_SB.client
                    .from('applications')
                    .select('*')
                    .eq('id', caseId)
                    .single();
                if (data) return data;
            }

            const currentUser = JSON.parse(localStorage.getItem('wamPayCurrentUser') || 'null');
            if (currentUser && currentUser.id) {
                const { data } = await window.WAM_SB.client
                    .from('applications')
                    .select('*')
                    .eq('user_id', currentUser.id)
                    .order('created_at', { ascending: false })
                    .limit(1);
                
                if (data && data.length > 0) {
                    const openCase = data.find(a => 
                        !['completed', 'rejected', 'refunded'].includes(a.status)
                    );
                    if (openCase) return openCase;
                }
            }

            return null;
        } catch (e) {
            console.error('❌ [Addons] خطا در پیدا کردن پرونده:', e);
            return null;
        }
    }

    // ============================================================
    //  ✅ v2.1: چک وجود سفته‌ها (از DOM + DB)
    // ============================================================
    function checkFinalDocsUploaded(app) {
        // ۱. چک از DOM (اگه کاربر الان آپلود کرده)
        const domBorrower = document.querySelector('.doc-item.uploaded[data-doc-id="promissory_borrower"]');
        const domGuarantor = document.querySelector('.doc-item.uploaded[data-doc-id="promissory_guarantor"]');
        
        // ۲. چک از DB
        const fi = app.financial_info || {};
        const dbFinalDocs = fi.finalDocs || app.final_docs || {};
        const dbDocuments = app.documents || {};
        
        const dbBorrower = !!(dbFinalDocs.promissory_borrower || dbDocuments.promissory_borrower);
        const dbGuarantor = !!(dbFinalDocs.promissory_guarantor || dbDocuments.promissory_guarantor);

        // ۳. چک از LocalStorage (application.data.finalDocs)
        let lsBorrower = false, lsGuarantor = false;
        try {
            const allApps = JSON.parse(localStorage.getItem('wamPayApplications') || '[]');
            const currentUser = JSON.parse(localStorage.getItem('wamPayCurrentUser') || 'null');
            if (currentUser) {
                const lsApp = allApps.find(a => 
                    a.userId === currentUser.id || 
                    a.user_id === currentUser.id ||
                    a.applicantId === currentUser.id
                );
                if (lsApp && lsApp.data && lsApp.data.finalDocs) {
                    lsBorrower = !!lsApp.data.finalDocs.promissory_borrower;
                    lsGuarantor = !!lsApp.data.finalDocs.promissory_guarantor;
                }
            }
        } catch (e) {}

        const hasBorrower = !!(domBorrower || dbBorrower || lsBorrower);
        const hasGuarantor = !!(domGuarantor || dbGuarantor || lsGuarantor);

        console.log('🔍 [Addons] چک سفته‌ها:', {
            borrower: { dom: !!domBorrower, db: dbBorrower, ls: lsBorrower, final: hasBorrower },
            guarantor: { dom: !!domGuarantor, db: dbGuarantor, ls: lsGuarantor, final: hasGuarantor }
        });

        return { hasBorrower, hasGuarantor };
    }

    // ============================================================
    //  ۳. افزودن دکمه «ثبت و ارسال» به گام ۵
    // ============================================================
    function injectSubmitButton(panel) {
        if (!panel) return;
        if (panel.querySelector('#submitFinalizationBtn')) return;

        console.log('%c➕ [Addons] دکمه «ثبت و ارسال» به گام ۵ اضافه شد', 'color:#1e8e4a;font-weight:bold;');

        const btn = document.createElement('button');
        btn.id = 'submitFinalizationBtn';
        btn.type = 'button';
        btn.className = 'btn btn-primary';
        btn.style.cssText = `
            width: 100%;
            margin-top: 20px;
            padding: 14px;
            font-size: 15px;
            font-weight: 800;
            background: linear-gradient(135deg, #0b3b23, #1e8e4a);
            color: #fff;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(30,142,74,0.3);
            transition: all 0.2s;
        `;
        btn.innerHTML = '📤 ثبت و ارسال به اعتبارسنجی نهایی';

        btn.addEventListener('click', handleSubmitFinalization);

        panel.appendChild(btn);
    }

    // ============================================================
    //  ✅ v2.1: قفل کردن دکمه‌های ناوبری
    // ============================================================
    function lockNavigationButtons() {
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        
        if (prevBtn) {
            prevBtn.disabled = true;
            prevBtn.style.opacity = '0.5';
            prevBtn.style.cursor = 'not-allowed';
        }
        
        if (nextBtn) {
            nextBtn.disabled = true;
            nextBtn.style.opacity = '0.5';
            nextBtn.style.cursor = 'not-allowed';
        }
        
        console.log('🔒 [Addons] دکمه‌های ناوبری قفل شدند');
    }

    // ============================================================
    //  ۴. هندل کلیک «ثبت و ارسال»
    // ============================================================
    async function handleSubmitFinalization() {
        const btn = document.getElementById('submitFinalizationBtn');
        if (!btn) return;

        btn.disabled = true;
        btn.innerHTML = '⏳ در حال بررسی...';

        try {
            const app = await findActiveCase();
            
            if (!app) {
                alert('⚠️ خطا: پرونده‌ی فعال پیدا نشد.\n\nلطفاً مطمئن شوید در مرحله‌ی تکمیل نهایی هستید.');
                btn.disabled = false;
                btn.innerHTML = '📤 ثبت و ارسال به اعتبارسنجی نهایی';
                return;
            }

            console.log('📁 [Addons] پرونده پیدا شد:', app.application_number, '| status:', app.status);

            // ✅ v2.1: چک سفته‌ها (DOM + DB + LocalStorage)
            const { hasBorrower, hasGuarantor } = checkFinalDocsUploaded(app);

            if (!hasBorrower) {
                alert('⚠️ لطفاً سفته الکترونیکی وام‌گیرنده را آپلود کنید.');
                btn.disabled = false;
                btn.innerHTML = '📤 ثبت و ارسال به اعتبارسنجی نهایی';
                return;
            }

            if (!hasGuarantor) {
                alert('⚠️ لطفاً سفته الکترونیکی ضامن را آپلود کنید.');
                btn.disabled = false;
                btn.innerHTML = '📤 ثبت و ارسال به اعتبارسنجی نهایی';
                return;
            }

            // چک شماره حساب
            const bankAccount = (app.financial_info && app.financial_info.finalization && app.financial_info.finalization.finalBankAccount) 
                || document.getElementById('w_finalBankAccount')?.value 
                || '';
            if (!bankAccount.trim()) {
                alert('⚠️ لطفاً شماره حساب بانکی را وارد کنید.');
                btn.disabled = false;
                btn.innerHTML = '📤 ثبت و ارسال به اعتبارسنجی نهایی';
                return;
            }

            // چک روش پرداخت
            const paymentMethod = (app.financial_info && app.financial_info.finalization && app.financial_info.finalization.paymentMethod)
                || document.querySelector('input[name="paymentMethod"]:checked')?.value;
            if (!paymentMethod) {
                alert('⚠️ لطفاً روش پرداخت را انتخاب کنید.');
                btn.disabled = false;
                btn.innerHTML = '📤 ثبت و ارسال به اعتبارسنجی نهایی';
                return;
            }

            // چک پذیرش شرایط
            const terms = document.getElementById('w_termsAgreed')?.checked;
            if (!terms) {
                alert('⚠️ لطفاً شرایط و قوانین را بپذیرید.');
                btn.disabled = false;
                btn.innerHTML = '📤 ثبت و ارسال به اعتبارسنجی نهایی';
                return;
            }

            if (!confirm('آیا از ثبت نهایی و ارسال به اعتبارسنجی مطمئن هستید؟')) {
                btn.disabled = false;
                btn.innerHTML = '📤 ثبت و ارسال به اعتبارسنجی نهایی';
                return;
            }

            btn.innerHTML = '⏳ در حال ثبت...';

            // آپدیت دیتابیس
            const { error } = await window.WAM_SB.client
                .from('applications')
                .update({
                    status: 'awaiting_final_verification',
                    current_step: 5,
                    updated_at: new Date().toISOString()
                })
                .eq('application_number', app.application_number);

            if (error) throw error;

            console.log('✅ [Addons] پرونده به awaiting_final_verification تغییر کرد:', app.application_number);

            // ✅ v2.1: قفل کردن دکمه‌های ناوبری
            lockNavigationButtons();

            // ✅ v2.1: تغییر متن دکمه
            btn.innerHTML = '✅ پرونده ارسال شد — منتظر تأیید اعتبارسنج';
            btn.style.background = 'linear-gradient(135deg, #1e8e4a, #2ea05a)';
            btn.style.cursor = 'not-allowed';
            btn.disabled = true;

            alert('✅ پرونده با موفقیت برای بررسی نهایی اعتبارسنج ارسال شد.\n\nمنتظر بمانید تا اعتبارسنج پرونده را تأیید کند.\n\n🔒 پرونده‌ی شما در این مرحله قفل شده و نمی‌توانید به گام بعدی بروید.');
            
            // ✅ v2.1: به‌جای reload، فقط وضعیت رو آپدیت کن
            // (چون reload ممکنه دکمه رو دوباره فعال کنه)
            setTimeout(() => window.location.reload(), 3000);

        } catch (e) {
            console.error('❌ [Addons] خطا:', e);
            alert('خطا: ' + (e.message || e));
            btn.disabled = false;
            btn.innerHTML = '📤 ثبت و ارسال به اعتبارسنجی نهایی';
        }
    }

    // ============================================================
    //  ✅ v2.1: بررسی وضعیت قفل (برای بعد از reload)
    // ============================================================
    async function checkLockedStatus() {
        const app = await findActiveCase();
        if (!app) return;

        // اگه پرونده در وضعیت awaiting_final_verification هست، قفل کن
        if (app.status === 'awaiting_final_verification') {
            const step5Panel = document.querySelector('.step-panel[data-step="4"]');
            if (step5Panel && !step5Panel.classList.contains('hidden')) {
                // اگه دکمه ثبت هست، غیرفعالش کن
                const submitBtn = document.getElementById('submitFinalizationBtn');
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '✅ پرونده ارسال شد — منتظر تأیید اعتبارسنج';
                    submitBtn.style.background = 'linear-gradient(135deg, #1e8e4a, #2ea05a)';
                    submitBtn.style.cursor = 'not-allowed';
                }

                // دکمه‌های ناوبری رو قفل کن
                lockNavigationButtons();
            }
        }
    }

    // ============================================================
    //  ۵. رصد تغییر گام‌ها
    // ============================================================
    function startObserving() {
        setTimeout(async () => {
            const step5Panel = document.querySelector('.step-panel[data-step="4"]');
            if (step5Panel && !step5Panel.classList.contains('hidden')) {
                injectSubmitButton(step5Panel);
                await checkLockedStatus(); // ✅ v2.1
            }
        }, 1500);

        const observer = new MutationObserver(async () => {
            const step5Panel = document.querySelector('.step-panel[data-step="4"]');
            if (step5Panel && !step5Panel.classList.contains('hidden')) {
                injectSubmitButton(step5Panel);
                await checkLockedStatus(); // ✅ v2.1
            }
        });

        const panelsContainer = document.querySelector('.step-panel')?.parentElement;
        if (panelsContainer) {
            observer.observe(panelsContainer, {
                attributes: true,
                attributeFilter: ['class'],
                subtree: true
            });
        }
    }

    // ============================================================
    //  ۶. اجرا
    // ============================================================
    function init() {
        console.log('%c🔧 [Addons v2.1] شروع اضافه کردن تغییرات...', 'color:#0b3b23;font-weight:bold;');
        disableAutoApproves();
        startObserving();
        console.log('%c✅ [Addons v2.1] applicant-wizard-addons.js آماده است', 'color:#1e8e4a;font-weight:bold;font-size:14px;');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 300);
    }

    window.WamPayWizardAddons = {
        version: '2.1',
        init: init,
        findActiveCase: findActiveCase,
        checkFinalDocsUploaded: checkFinalDocsUploaded,
        lockNavigationButtons: lockNavigationButtons
    };

})();