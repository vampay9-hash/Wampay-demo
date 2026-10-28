// ==========================================
// وام پی — Contract Template Manager v1.0.0
// مدیریت متن قرارداد واگذاری تسهیلات
// ==========================================

(function (window) {
    'use strict';

    // ═══════════════════════════════════════════
    // 📌 کلیدهای localStorage
    // ═══════════════════════════════════════════
    const STORAGE_KEY = 'wamPayContractTemplate';
    const HISTORY_KEY = 'wamPayContractTemplateHistory';
    const MAX_HISTORY = 10;

    // ═══════════════════════════════════════════
    // 📌 متن پیش‌فرض قرارداد
    // ═══════════════════════════════════════════
    const DEFAULT_TEMPLATE = `قرارداد واگذاری تسهیلات

شناسه قرارداد: {{contract_id}}
تاریخ تنظیم: {{today_date}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

۱. مشخصات واگذارگیرنده (متقاضی)

نام و نام خانوادگی: {{applicant_name}}
کد ملی: {{applicant_national_id}}
نام پدر: {{applicant_father_name}}
شماره تماس: {{applicant_mobile}}
آدرس: {{applicant_address}}

۲. مشخصات واگذارکننده (کارگزار)

نام: {{broker_name}}
کد کارگزار: {{broker_code}}

۳. مشخصات تسهیلات

بانک عامل: {{bank_name}}
مبلغ کل تسهیلات: {{loan_amount}} تومان
مدت بازپرداخت: {{loan_months}} ماه
قسط ماهیانه: {{monthly_installment}} تومان
نرخ سود: {{interest_rate}}٪ سالانه
حق‌الزحمه واگذاری (جُعل): {{broker_fee}} تومان
روش پرداخت: {{payment_method}}

۴. مفاد قرارداد

۱. واگذارکننده متعهد می‌گردد حق تسهیلات موضوع این قرارداد را به‌طور کامل و بدون هیچ‌گونه محدودیت به واگذارگیرنده واگذار نماید.

۲. واگذارگیرنده متعهد می‌گردد مبلغ حق‌الزحمه واگذاری (جُعل) را طبق شرایط مقرر پرداخت نماید.

۳. واگذارکننده متعهد است اسناد و مدارک مربوط به تسهیلات را به‌طور صحیح و مطابق واقع در اختیار سامانه قرار دهد.

۴. واگذارگیرنده متعهد می‌گردد پس از دریافت حق تسهیلات، تمامی اقساط را طبق زمان‌بندی بانک عامل پرداخت نماید.

۵. طرفین تأیید می‌نمایند که سامانه وام‌پی صرفاً نقش مشاور، معرف و بستر فنی را داشته و طرف قرارداد نمی‌باشد.

۶. هیچ‌یک از طرفین حق واگذاری حق تسهیلات به شخص ثالث را بدون موافقت کتبی طرف دیگر و بانک عامل ندارند.

۷. در صورت بروز اختلاف، ابتدا از طریق میانجی‌گری سامانه وام‌پی و در صورت عدم حصول توافق، از طریق مراجع قانونی پیگیری می‌شود.

۸. این قرارداد در دو نسخه الکترونیکی مشابه تنظیم و پس از امضای الکترونیکی طرفین، طبق ماده ۷ قانون تجارت الکترونیک ایران دارای اعتبار قانونی کامل است.

۹. رسیدگی به هرگونه اختلاف ناشی از این قرارداد، در صلاحیت مراجع قانونی مربوطه خواهد بود.

۱۰. طرفین تأیید می‌نمایند که مفاد قرارداد را مطالعه و پذیرفته‌اند.

۵. امضاها

امضای واگذارگیرنده (متقاضی): ____________________
امضای واگذارکننده (کارگزار): ____________________
مهر فنی سامانه وام‌پی: ____________________

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

سامانه هوشمند تسهیلات وام پی (WAM PAY)`;

    // ═══════════════════════════════════════════
    // 📌 لیست Placeholderها
    // ═══════════════════════════════════════════
    const PLACEHOLDERS = [
        // اطلاعات متقاضی
        { key: 'applicant_name',           label: 'نام کامل متقاضی',     example: 'علی رضایی' },
        { key: 'applicant_national_id',    label: 'کد ملی متقاضی',        example: '1234567890' },
        { key: 'applicant_father_name',    label: 'نام پدر متقاضی',       example: 'محمود' },
        { key: 'applicant_mobile',         label: 'موبایل متقاضی',        example: '09123456789' },
        { key: 'applicant_address',        label: 'آدرس متقاضی',          example: 'تهران، خیابان ولیعصر' },
        // اطلاعات کارگزار
        { key: 'broker_name',              label: 'نام کارگزار',          example: 'محمد صادقی' },
        { key: 'broker_code',              label: 'کد کارگزار',           example: 'BRK-123456' },
        // اطلاعات تسهیلات
        { key: 'bank_name',                label: 'نام بانک عامل',        example: 'رسالت' },
        { key: 'loan_amount',              label: 'مبلغ کل تسهیلات',      example: '100,000,000' },
        { key: 'loan_months',              label: 'مدت بازپرداخت (ماه)',  example: '24' },
        { key: 'monthly_installment',      label: 'قسط ماهیانه',          example: '4,500,000' },
        { key: 'interest_rate',            label: 'نرخ سود (٪)',          example: '18' },
        { key: 'broker_fee',               label: 'حق‌الزحمه واگذاری',    example: '3,000,000' },
        // اطلاعات قرارداد
        { key: 'contract_id',              label: 'شناسه قرارداد',        example: 'CTR-2026-1234' },
        { key: 'today_date',               label: 'تاریخ امروز',          example: '1405/07/25' },
        { key: 'payment_method',           label: 'روش پرداخت',           example: 'چک' },
        // اطلاعات چک (اختیاری)
        { key: 'check_amount',             label: 'مبلغ چک',              example: '100,000,000' },
        { key: 'check_date',               label: 'تاریخ چک',             example: '1405/08/15' },
        { key: 'check_sayad',              label: 'شماره صیادی',          example: '1234567890123456' },
        { key: 'check_issuer',             label: 'صادرکننده چک',         example: 'علی رضایی' },
        { key: 'check_recipient',          label: 'گیرنده چک',            example: 'شرکت وام پی' }
    ];

    // ═══════════════════════════════════════════
    // 📌 Helpers
    // ═══════════════════════════════════════════
    function safeParse(str, fb) {
        try {
            return str ? JSON.parse(str) : fb;
        } catch (e) {
            console.warn('[ContractTemplate] parse error:', e);
            return fb;
        }
    }

    function safeStringify(obj) {
        try {
            return JSON.stringify(obj);
        } catch (e) {
            console.error('[ContractTemplate] stringify error:', e);
            return '';
        }
    }

    function getCurrentUserInfo() {
        try {
            const raw = localStorage.getItem('wamPayCurrentUser');
            if (!raw) return { name: '—', mobile: '—', role: '—' };
            const u = JSON.parse(raw);
            return {
                name: u.name || u.full_name || '—',
                mobile: u.mobile || u.phone_number || '—',
                role: u.role || '—'
            };
        } catch (e) {
            return { name: '—', mobile: '—', role: '—' };
        }
    }

    // ═══════════════════════════════════════════
    // 📖 getContractTemplate()
    // خوندن متن قرارداد از localStorage
    // ═══════════════════════════════════════════
    function getContractTemplate() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                // اگه تنظیم نشده، پیش‌فرض رو برگردون
                return {
                    version: 1,
                    content: DEFAULT_TEMPLATE,
                    updatedAt: null,
                    updatedBy: null,
                    isDefault: true
                };
            }

            const data = safeParse(raw, null);
            if (!data || !data.content) {
                return {
                    version: 1,
                    content: DEFAULT_TEMPLATE,
                    updatedAt: null,
                    updatedBy: null,
                    isDefault: true
                };
            }

            return {
                version: data.version || 1,
                content: data.content,
                updatedAt: data.updatedAt || null,
                updatedBy: data.updatedBy || null,
                isDefault: false
            };
        } catch (e) {
            console.error('[ContractTemplate] getContractTemplate error:', e);
            return {
                version: 1,
                content: DEFAULT_TEMPLATE,
                updatedAt: null,
                updatedBy: null,
                isDefault: true
            };
        }
    }

    // ═══════════════════════════════════════════
    // 💾 saveContractTemplate(content, user)
    // ذخیره‌ی متن قرارداد
    // ═══════════════════════════════════════════
    function saveContractTemplate(content, user) {
        try {
            if (!content || typeof content !== 'string') {
                return { ok: false, error: 'متن قرارداد خالیه' };
            }

            if (content.trim().length < 50) {
                return { ok: false, error: 'متن قرارداد خیلی کوتاهه (حداقل ۵۰ کاراکتر)' };
            }

            const currentUser = user || getCurrentUserInfo();
            const now = new Date().toISOString();

            // ۱. خوندن نسخه‌ی قبلی
            const prevData = safeParse(localStorage.getItem(STORAGE_KEY), null);

            // ۲. ذخیره‌ی نسخه‌ی قبلی توی تاریخچه
            if (prevData && prevData.content && prevData.content !== content) {
                const history = safeParse(localStorage.getItem(HISTORY_KEY), []);
                history.push({
                    version: prevData.version || 1,
                    content: prevData.content,
                    savedAt: prevData.updatedAt || now,
                    savedBy: prevData.updatedBy || '—'
                });

                // فقط ۱۰ نسخه‌ی آخر
                while (history.length > MAX_HISTORY) {
                    history.shift();
                }
                localStorage.setItem(HISTORY_KEY, safeStringify(history));
            }

            // ۳. ذخیره‌ی نسخه‌ی جدید
            const newData = {
                version: (prevData && prevData.version ? prevData.version : 0) + 1,
                content: content,
                updatedAt: now,
                updatedBy: currentUser.name + ' (' + currentUser.mobile + ')'
            };

            localStorage.setItem(STORAGE_KEY, safeStringify(newData));

            console.log('✅ [ContractTemplate] ذخیره شد — نسخه', newData.version);
            return { ok: true, version: newData.version };
        } catch (e) {
            console.error('[ContractTemplate] saveContractTemplate error:', e);
            return { ok: false, error: 'خطا در ذخیره: ' + e.message };
        }
    }

    // ═══════════════════════════════════════════
    // 🔄 resetContractTemplate()
    // بازگردانی به پیش‌فرض
    // ═══════════════════════════════════════════
    function resetContractTemplate() {
        try {
            const prevData = safeParse(localStorage.getItem(STORAGE_KEY), null);
            if (prevData && prevData.content) {
                const history = safeParse(localStorage.getItem(HISTORY_KEY), []);
                history.push({
                    version: prevData.version || 1,
                    content: prevData.content,
                    savedAt: prevData.updatedAt || new Date().toISOString(),
                    savedBy: prevData.updatedBy || '—'
                });
                while (history.length > MAX_HISTORY) {
                    history.shift();
                }
                localStorage.setItem(HISTORY_KEY, safeStringify(history));
            }

            localStorage.removeItem(STORAGE_KEY);
            console.log('🔄 [ContractTemplate] بازگردانی به پیش‌فرض');
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }

    // ═══════════════════════════════════════════
    // 📜 getHistory()
    // ═══════════════════════════════════════════
    function getHistory() {
        try {
            const history = safeParse(localStorage.getItem(HISTORY_KEY), []);
            return Array.isArray(history) ? history : [];
        } catch (e) {
            return [];
        }
    }

    // ═══════════════════════════════════════════
    // 🎨 renderContract(data)
    // جایگزینی placeholderها با داده‌ی واقعی
    // ═══════════════════════════════════════════
    function renderContract(data) {
        try {
            const template = getContractTemplate();
            let content = template.content;

            // جایگزینی placeholderها
            PLACEHOLDERS.forEach(p => {
                const value = (data && data[p.key] !== undefined && data[p.key] !== null)
                    ? String(data[p.key])
                    : (p.example || '—');

                const regex = new RegExp('\\{\\{' + p.key + '\\}\\}', 'g');
                content = content.replace(regex, value);
            });

            // هر placeholder باقی‌مانده رو با «—» جایگزین کن
            content = content.replace(/\{\{[^}]+\}\}/g, '—');

            return content;
        } catch (e) {
            console.error('[ContractTemplate] renderContract error:', e);
            return getContractTemplate().content;
        }
    }

    // ═══════════════════════════════════════════
    // 📋 getPlaceholders()
    // ═══════════════════════════════════════════
    function getPlaceholders() {
        return PLACEHOLDERS.slice(); // کپی
    }

    // ═══════════════════════════════════════════
    // 👁️ previewContract(data)
    // پیش‌نمایش با داده‌ی نمونه
    // ═══════════════════════════════════════════
    function previewContract(data) {
        const sampleData = data || {};
        PLACEHOLDERS.forEach(p => {
            if (sampleData[p.key] === undefined) {
                sampleData[p.key] = p.example || '—';
            }
        });
        return renderContract(sampleData);
    }

    // ═══════════════════════════════════════════
    // 🔧 getDefaultTemplate()
    // ═══════════════════════════════════════════
    function getDefaultTemplate() {
        return DEFAULT_TEMPLATE;
    }

    // ═══════════════════════════════════════════
    // 🌐 Export
    // ═══════════════════════════════════════════
    window.ContractTemplate = {
        // اصلی
        getContractTemplate: getContractTemplate,
        saveContractTemplate: saveContractTemplate,
        resetContractTemplate: resetContractTemplate,
        renderContract: renderContract,
        previewContract: previewContract,
        getPlaceholders: getPlaceholders,
        getDefaultTemplate: getDefaultTemplate,
        getHistory: getHistory,

        // ثابت‌ها
        STORAGE_KEY: STORAGE_KEY,
        HISTORY_KEY: HISTORY_KEY,
        DEFAULT_TEMPLATE: DEFAULT_TEMPLATE
    };

    // 🔧 سازگاری با کدهای قدیمی
    window.WamPayContractTemplate = window.ContractTemplate;

    console.log('✅ Contract Template Manager v1.0.0 ready');
    console.log('   📌 Storage key:', STORAGE_KEY);
    console.log('   📌 تعداد placeholderها:', PLACEHOLDERS.length);

})(window);