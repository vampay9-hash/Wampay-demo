/* ============================================================
   WAM PAY — Contract Service v1.0
   سرویس مدیریت قراردادهای خرید و فروش امتیاز
   ============================================================ */

(function (global) {
    'use strict';

    // ===== Config =====
    const CONFIG = {
        purchasePrefix: 'CTR-PUR',
        salePrefix: 'CTR-SAL',
        currencyLabel: 'تومان',
        siteName: 'سامانه‌ی هوشمند تسهیلات وام‌پی',
        siteLegalName: 'شرکت وام‌پی (سهامی خاص)',
        siteRegistrationNumber: 'IR-XXX-XXXXXX',
        siteAddress: 'تهران، ...',
        version: '1.0',
        // آستانه‌ی اعتبار امضا
        minSignaturePoints: 15
    };

    const CONTRACT_TYPES = {
        purchase: 'purchase',   // خرید (سایت ↔ کارگزار)
        sale: 'sale'            // فروش (سایت ↔ متقاضی)
    };

    // ===== Helpers =====
    const faNum = (n) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
    const faPrice = (n) => Number(n || 0).toLocaleString('fa-IR');
    const nowISO = () => new Date().toISOString();

    function generateId(prefix = 'ctr') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function generateContractNumber(type) {
        const year = new Date().getFullYear();
        const all = getAllContracts();
        const prefix = type === 'purchase' ? CONFIG.purchasePrefix : CONFIG.salePrefix;
        const typeContracts = all.filter(c => c.type === type);
        const seq = String(typeContracts.length + 1).padStart(4, '0');
        return `${prefix}-${year}-${seq}`;
    }

    function formatShamsiDate(iso) {
        try {
            const d = new Date(iso);
            const fa = (n) => String(n).padStart(2, '0').replace(/\d/g, x => '۰۱۲۳۴۵۶۷۸۹'[x]);
            return `${fa(d.getFullYear())}/${fa(d.getMonth()+1)}/${fa(d.getDate())}`;
        } catch { return '—'; }
    }

    // ===== SHA-256 Hash =====
    async function sha256(text) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(text);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            console.warn('SHA-256 unavailable, fallback:', e);
            // فallback ساده
            let h = 0;
            for (let i = 0; i < text.length; i++) {
                h = ((h << 5) - h + text.charCodeAt(i)) | 0;
            }
            return Math.abs(h).toString(16).padStart(8, '0');
        }
    }

    // ===== Storage =====
    const STORAGE_KEYS = {
        contracts: 'wamPayContracts',
        log: 'wamPayContractLog',
        archive: 'wamPayContractsArchive'
    };

    function getAllContracts() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.contracts) || '[]');
        } catch { return []; }
    }

    function saveContracts(list) {
        try {
            localStorage.setItem(STORAGE_KEYS.contracts, JSON.stringify(list));
            return true;
        } catch (e) {
            console.error('Save contracts error:', e);
            return false;
        }
    }

    function getAllLogs() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.log) || '[]');
        } catch { return []; }
    }

    function saveLogs(list) {
        try {
            if (list.length > 500) list.length = 500;
            localStorage.setItem(STORAGE_KEYS.log, JSON.stringify(list));
            return true;
        } catch { return false; }
    }

    function log(action, contractId, payload = {}, actor = null) {
        const logs = getAllLogs();
        logs.unshift({
            id: generateId('log'),
            action,
            contractId,
            payload,
            actor: actor || getCurrentActor(),
            at: nowISO()
        });
        saveLogs(logs);
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

    // ============================================================
    //  📄  تولید متن قرارداد
    // ============================================================

    function generatePurchaseContractText(contractData) {
        const {
            contractNumber,
            invoice,
            broker,
            loan
        } = contractData;

        const createdAt = formatShamsiDate(nowISO());
        const purchasePrice = invoice.purchase.pricePerUnit;
        const salePrice = invoice.sale.pricePerUnit;
        const creditCount = invoice.creditCount;
        const creditName = invoice.creditName;
        const purchaseTotal = invoice.purchase.total;
        const saleTotal = invoice.sale.total;
        const siteShare = invoice.profit.siteShare;
        const repaymentMonths = invoice.repaymentMonths;
        const loanAmount = invoice.loanAmount;

        return `
═══════════════════════════════════════════════════════════
                قرارداد خرید امتیاز
        ${CONFIG.siteName}
═══════════════════════════════════════════════════════════

شماره قرارداد: ${contractNumber}
تاریخ تنظیم: ${createdAt}

───────────────────────────────────────────────────────────
بخش اول — طرفین قرارداد
───────────────────────────────────────────────────────────

۱-۱. فروشنده (کارگزار):
     نام و نام خانوادگی: ${broker.firstName || ''} ${broker.lastName || ''}
     کد ملی: ${broker.nationalId || '—'}
     شماره پرونده‌ی کارگزاری: ${broker.fileNumber || '—'}
     شماره تماس: ${broker.mobile || '—'}
     خط ثابت: ${broker.landline?.full || '—'}
     آدرس: ${broker.address || '—'}

۱-۲. خریدار (سایت):
     ${CONFIG.siteLegalName}
     شماره ثبت: ${CONFIG.siteRegistrationNumber}
     نماینده: مدیرعامل
     آدرس: ${CONFIG.siteAddress}

───────────────────────────────────────────────────────────
بخش دوم — موضوع قرارداد
───────────────────────────────────────────────────────────

۲-۱. موضوع این قرارداد، خرید امتیاز از نوع «${creditName}» توسط سایت
     از فروشنده (کارگزار) می‌باشد.

۲-۲. مشخصات امتیاز موضوع قرارداد:
     • نام امتیاز: ${creditName}
     • تعداد امتیاز: ${faNum(creditCount)} امتیاز
     • مبلغ وام مرتبط: ${faPrice(loanAmount)} ${CONFIG.currencyLabel}
     • مدت بازپرداخت: ${faNum(repaymentMonths)} ماه

───────────────────────────────────────────────────────────
بخش سوم — قیمت و مبلغ قرارداد
───────────────────────────────────────────────────────────

۳-۱. قیمت هر واحد امتیاز (خرید):
     ${faPrice(purchasePrice)} ${CONFIG.currencyLabel}

۳-۲. جمع کل مبلغ خرید:
     ${faNum(creditCount)} × ${faPrice(purchasePrice)} =
     ${faPrice(purchaseTotal)} ${CONFIG.currencyLabel}

۳-۳. نحوه‌ی پرداخت:
     سایت متعهد می‌شود پس از دریافت وجه از متقاضی و پس از
     انجام کامل تعهدات قراردادی توسط فروشنده، مبلغ مذکور در
     بند ۳-۲ را به کیف پول فروشنده واریز نماید.

───────────────────────────────────────────────────────────
بخش چهارم — علم به فروش مجدد ⭐
───────────────────────────────────────────────────────────

۴-۱. فروشنده (کارگزار) آگاه و مطلع است که سایت این امتیاز را
     به قیمت هر واحد ${faPrice(salePrice)} ${CONFIG.currencyLabel}
     به متقاضی (مشتری نهایی) می‌فروشد.

۴-۲. جمع کل مبلغ فروش سایت به متقاضی:
     ${faNum(creditCount)} × ${faPrice(salePrice)} =
     ${faPrice(saleTotal)} ${CONFIG.currencyLabel}

۴-۳. فروشنده از پیش، با اطلاع کامل از این موضوع، موافقت خود را
     نسبت به خرید و فروش مجدد اعلام می‌نماید.

───────────────────────────────────────────────────────────
بخش پنجم — سلب حق اعتراض ⭐⭐⭐
───────────────────────────────────────────────────────────

۵-۱. مابه‌التفاوت قیمت فروش و خرید امتیاز موضوع قرارداد، عبارت است از:

     قیمت فروش (${faPrice(salePrice)}) − قیمت خرید (${faPrice(purchasePrice)})
     = ${faPrice(salePrice - purchasePrice)} ${CONFIG.currencyLabel} به ازای هر واحد

۵-۲. سود خالص سایت از این معامله:
     ${faPrice(siteShare)} ${CONFIG.currencyLabel}

۵-۳. فروشنده اقرار و اعلام می‌نماید که این مبلغ، سود خالص و
     قانونی سایت محسوب می‌شود و وی هیچ‌گونه ادعا، اعتراض،
     مطالبه، یا شکایتی نسبت به این سود یا نسبت به قیمت فروش
     سایت به متقاضی ندارد.

۵-۴. فروشنده از هرگونه دعوی حقوقی، کیفری، انتظامی و اداری
     در این خصوص، نسبت به سایت، مدیران، سهامداران و
     کارکنان آن، سلب و ساقط است.

۵-۵. در صورت طرح هرگونه ادعا خلاف این بند، فروشنده متعهد
     به جبران تمامی خسارات مادی و معنوی وارده به سایت
     (شامل هزینه‌های دادرسی و حق‌الوکاله) می‌باشد.

───────────────────────────────────────────────────────────
بخش ششم — تعهدات فروشنده
───────────────────────────────────────────────────────────

۶-۱. فروشنده متعهد می‌شود در زمان مقرر، امتیاز موضوع قرارداد
     را به سایت منتقل نماید.

۶-۲. فروشنده متعهد به رعایت تعهدات قراردادی با متقاضی و
     انجام کلیه‌ی وظایف خود می‌باشد.

۶-۳. فروشنده متعهد به رعایت قوانین، مقررات، و شرایط
     استفاده‌ی سامانه‌ی وام‌پی می‌باشد.

۶-۴. فروشنده متعهد می‌شود پس از امضای این قرارداد، از
     انصراف یک‌طرفه خودداری نماید.

───────────────────────────────────────────────────────────
بخش هفتم — ضمانت اجرا
───────────────────────────────────────────────────────────

۷-۱. در صورت تخلف فروشنده از هر یک از تعهدات مندرج در
     این قرارداد، وی مسئول جبران کلیه‌ی خسارات وارده
     به سایت و متقاضی می‌باشد.

۷-۲. در صورت انصراف فروشنده پس از امضا، سایت مجاز است
     علاوه بر مطالبه‌ی خسارات، مبلغ قابل‌توجهی به‌عنوان
     جریمه‌ی عدم انجام تعهد دریافت نماید.

───────────────────────────────────────────────────────────
بخش هشتم — امضاها
───────────────────────────────────────────────────────────

۸-۱. فروشنده (کارگزار):
     نام: ${broker.firstName || ''} ${broker.lastName || ''}
     تاریخ امضا: .......... 
     امضا: [امضای دیجیتال الصاق‌شده]

۸-۲. خریدار (سایت):
     نماینده: مدیرعامل
     تاریخ امضا: ..........
     امضا: [مهر و امضای سایت]

۸-۳. تأییدکنندگان سایت:
     • ادمین کل: ..........
     • ادمین حقوقی: ..........

───────────────────────────────────────────────────────────
این قرارداد در تاریخ ${createdAt} تنظیم و پس از امضای
طرفین، لازم‌الاجرا می‌باشد.
───────────────────────────────────────────────────────────
`;
    }

    function generateSaleContractText(contractData) {
        const {
            contractNumber,
            invoice,
            applicant,
            broker
        } = contractData;

        const createdAt = formatShamsiDate(nowISO());
        const salePrice = invoice.sale.pricePerUnit;
        const creditCount = invoice.creditCount;
        const creditName = invoice.creditName;
        const saleTotal = invoice.sale.total;
        const purchaseTotal = invoice.purchase.total;
        const repaymentMonths = invoice.repaymentMonths;
        const loanAmount = invoice.loanAmount;

        return `
═══════════════════════════════════════════════════════════
                قرارداد فروش امتیاز
        ${CONFIG.siteName}
═══════════════════════════════════════════════════════════

شماره قرارداد: ${contractNumber}
تاریخ تنظیم: ${createdAt}

───────────────────────────────────────────────────────────
بخش اول — طرفین قرارداد
───────────────────────────────────────────────────────────

۱-۱. فروشنده (سایت):
     ${CONFIG.siteLegalName}
     شماره ثبت: ${CONFIG.siteRegistrationNumber}
     نماینده: مدیرعامل
     آدرس: ${CONFIG.siteAddress}

۱-۲. خریدار (متقاضی):
     نام و نام خانوادگی: ${applicant.firstName || ''} ${applicant.lastName || ''}
     کد ملی: ${applicant.nationalId || '—'}
     شماره تماس: ${applicant.mobile || '—'}
     آدرس: ${applicant.address || '—'}

───────────────────────────────────────────────────────────
بخش دوم — موضوع قرارداد
───────────────────────────────────────────────────────────

۲-۱. موضوع این قرارداد، خرید امتیاز از نوع «${creditName}» توسط
     متقاضی از سایت می‌باشد.

۲-۲. مشخصات امتیاز موضوع قرارداد:
     • نام امتیاز: ${creditName}
     • تعداد امتیاز: ${faNum(creditCount)} امتیاز
     • مبلغ وام مرتبط: ${faPrice(loanAmount)} ${CONFIG.currencyLabel}
     • مدت بازپرداخت: ${faNum(repaymentMonths)} ماه

───────────────────────────────────────────────────────────
بخش سوم — قیمت و مبلغ قرارداد
───────────────────────────────────────────────────────────

۳-۱. قیمت هر واحد امتیاز (فروش):
     ${faPrice(salePrice)} ${CONFIG.currencyLabel}

۳-۲. جمع کل مبلغ فروش:
     ${faNum(creditCount)} × ${faPrice(salePrice)} =
     ${faPrice(saleTotal)} ${CONFIG.currencyLabel}

۳-۳. متقاضی متعهد به پرداخت مبلغ مذکور در بند ۳-۲
     به حساب امانی سایت می‌باشد.

───────────────────────────────────────────────────────────
بخش چهارم — پرداخت امانی
───────────────────────────────────────────────────────────

۴-۱. مبلغ خرید در حساب امانی وام‌پی نگهداری می‌شود.

۴-۲. پس از انجام تعهدات توسط کارگزار معرف (${broker.firstName || ''} ${broker.lastName || ''} - پرونده: ${broker.fileNumber || '—'})،
     مبلغ امانی به شرح زیر توزیع می‌شود:

     • سود سایت: ${faPrice(invoice.profit.siteShare)} ${CONFIG.currencyLabel}
     • سهم کارگزار: ${faPrice(purchaseTotal)} ${CONFIG.currencyLabel}

───────────────────────────────────────────────────────────
بخش پنجم — تعهدات متقاضی
───────────────────────────────────────────────────────────

۵-۱. متقاضی متعهد به پرداخت به‌موقع مبلغ امانی می‌باشد.

۵-۲. متقاضی از پیش می‌پذیرد که پس از انتقال امتیاز، امکان
     انصراف یک‌طرفه وجود ندارد.

۵-۳. متقاضی متعهد به رعایت قوانین و مقررات وام‌پی می‌باشد.

───────────────────────────────────────────────────────────
بخش ششم — حق عودت
───────────────────────────────────────────────────────────

۶-۱. در صورت انصراف متقاضی پیش از انتقال امتیاز، مبلغ
     امانی به‌طور کامل بازگردانده می‌شود.

۶-۲. کارمزد حسابداری (متغیر) بابت هزینه‌های اداری از مبلغ
     بازگشتی کسر می‌گردد.

───────────────────────────────────────────────────────────
بخش هفتم — امضاها
───────────────────────────────────────────────────────────

۷-۱. خریدار (متقاضی):
     نام: ${applicant.firstName || ''} ${applicant.lastName || ''}
     تاریخ امضا: ..........
     امضا: [امضای دیجیتال الصاق‌شده]

۷-۲. فروشنده (سایت):
     نماینده: مدیرعامل
     تاریخ امضا: ..........
     امضا: [مهر و امضای سایت]

۷-۳. تأییدکنندگان سایت:
     • ادمین کل: ..........
     • ادمین حقوقی: ..........

───────────────────────────────────────────────────────────
این قرارداد در تاریخ ${createdAt} تنظیم و پس از امضای
طرفین، لازم‌الاجرا می‌باشد.
───────────────────────────────────────────────────────────
`;
    }

    // ============================================================
    //  📝  CRUD قراردادها
    // ============================================================

    function createContract(type, contractData, options = {}) {
        if (!CONTRACT_TYPES[type]) {
            return { ok: false, error: 'نوع قرارداد نامعتبر' };
        }

        const contractNumber = generateContractNumber(type);
        const now = nowISO();

        // تولید متن
        const textData = { ...contractData, contractNumber };
        const content = type === 'purchase'
            ? generatePurchaseContractText(textData)
            : generateSaleContractText(textData);

        const contract = {
            id: generateId('ctr'),
            contractNumber,
            type,

            // ارتباطات
            caseId: options.caseId || null,
            caseNumber: options.caseNumber || null,
            invoiceId: options.invoiceId || null,
            invoiceNumber: options.invoiceNumber || null,
            brokerId: options.brokerId || null,
            applicantId: options.applicantId || null,

            // محتوا
            content,
            contentHash: null,  // پر می‌شود بعد از hash

            // داده‌ی snapshot
            snapshot: {
                invoice: contractData.invoice,
                broker: contractData.broker,
                applicant: contractData.applicant,
                loan: contractData.loan
            },

            // امضاها
            signatures: type === 'purchase' ? {
                broker: { signed: false, image: null, otpVerified: false, at: null, ip: null, ua: null },
                superAdmin: { signed: false, image: null, at: null, by: null },
                legalAdmin: { signed: false, image: null, at: null, by: null }
            } : {
                applicant: { signed: false, image: null, otpVerified: false, at: null, ip: null, ua: null },
                superAdmin: { signed: false, image: null, at: null, by: null },
                legalAdmin: { signed: false, image: null, at: null, by: null }
            },

            // تأییدات
            approvals: {
                superAdmin: { approved: false, by: null, at: null, note: null },
                legalAdmin: { approved: false, by: null, at: null, note: null }
            },

            // وضعیت
            status: 'draft',  // draft → broker_signed → site_signed → completed

            // بایگانی
            archived: false,
            archivedAt: null,
            archiveId: null,

            createdBy: getCurrentActor(),
            createdAt: now,
            updatedAt: now
        };

        // ذخیره
        const list = getAllContracts();
        list.push(contract);
        if (!saveContracts(list)) {
            return { ok: false, error: 'خطا در ذخیره‌سازی' };
        }

        // محاسبه‌ی hash
        sha256(content).then(hash => {
            updateContract(contract.id, { contentHash: `SHA256:${hash}` });
        });

        log('contract_created', contract.id, {
            contractNumber,
            type
        });

        console.log(`✅ [Contract] قرارداد ${type} ساخته شد:`, contractNumber);
        return { ok: true, contract };
    }

    function getContractById(id) {
        return getAllContracts().find(c => c.id === id) || null;
    }

    function getContractByNumber(number) {
        return getAllContracts().find(c => c.contractNumber === number) || null;
    }

    function getContractsByCase(caseId) {
        return getAllContracts().filter(c => c.caseId === caseId);
    }

    function getContractsByType(type) {
        return getAllContracts().filter(c => c.type === type);
    }

    function getContractsByStatus(status) {
        return getAllContracts().filter(c => c.status === status);
    }

    function updateContract(id, patch) {
        const list = getAllContracts();
        const idx = list.findIndex(c => c.id === id);
        if (idx < 0) return { ok: false, error: 'قرارداد یافت نشد' };

        list[idx] = {
            ...list[idx],
            ...patch,
            updatedAt: nowISO()
        };

        if (!saveContracts(list)) {
            return { ok: false, error: 'خطا در ذخیره‌سازی' };
        }

        return { ok: true, contract: list[idx] };
    }

    // ============================================================
    //  ✍️  امضاها
    // ============================================================

    function signByBroker(contractId, signatureData) {
        const contract = getContractById(contractId);
        if (!contract) return { ok: false, error: 'قرارداد یافت نشد' };
        if (contract.type !== 'purchase') return { ok: false, error: 'نوع قرارداد نامعتبر' };

        if (!signatureData.image || !signatureData.otpVerified) {
            return { ok: false, error: 'امضا و تأیید OTP الزامی است' };
        }

        const now = nowISO();
        const signatures = { ...contract.signatures };
        signatures.broker = {
            signed: true,
            image: signatureData.image,
            otpVerified: true,
            at: now,
            ip: signatureData.ip || null,
            ua: signatureData.ua || null
        };

        const newStatus = contract.status === 'draft' ? 'broker_signed' : contract.status;

        const result = updateContract(contractId, { signatures, status: newStatus });
        if (!result.ok) return result;

        log('contract_signed_by_broker', contractId, {});

        console.log('✅ [Contract] امضای کارگزار ثبت شد:', contract.contractNumber);
        return { ok: true, contract: result.contract };
    }

    function signByApplicant(contractId, signatureData) {
        const contract = getContractById(contractId);
        if (!contract) return { ok: false, error: 'قرارداد یافت نشد' };
        if (contract.type !== 'sale') return { ok: false, error: 'نوع قرارداد نامعتبر' };

        if (!signatureData.image || !signatureData.otpVerified) {
            return { ok: false, error: 'امضا و تأیید OTP الزامی است' };
        }

        const now = nowISO();
        const signatures = { ...contract.signatures };
        signatures.applicant = {
            signed: true,
            image: signatureData.image,
            otpVerified: true,
            at: now,
            ip: signatureData.ip || null,
            ua: signatureData.ua || null
        };

        const result = updateContract(contractId, { signatures });
        if (!result.ok) return result;

        log('contract_signed_by_applicant', contractId, {});

        console.log('✅ [Contract] امضای متقاضی ثبت شد:', contract.contractNumber);
        return { ok: true, contract: result.contract };
    }

    function signBySuperAdmin(contractId, adminInfo) {
        const contract = getContractById(contractId);
        if (!contract) return { ok: false, error: 'قرارداد یافت نشد' };

        const now = nowISO();
        const signatures = { ...contract.signatures };
        signatures.superAdmin = {
            signed: true,
            image: null,  // مهر دیجیتال
            at: now,
            by: adminInfo.name || adminInfo
        };

        const approvals = { ...contract.approvals };
        approvals.superAdmin = {
            approved: true,
            by: adminInfo.name || adminInfo,
            at: now,
            note: null
        };

        // اگر حقوقی هم امضا کرده، وضعیت را به site_signed تغییر بده
        const legalSigned = contract.signatures.legalAdmin?.signed;
        const bothSigned = legalSigned;
        const newStatus = bothSigned ? 'site_signed' :
            (contract.status === 'broker_signed' || contract.status === 'draft' ? 'site_signed' : contract.status);

        const result = updateContract(contractId, {
            signatures,
            approvals,
            status: newStatus
        });
        if (!result.ok) return result;

        log('contract_signed_by_super_admin', contractId, {
            by: adminInfo.name || adminInfo
        });

        console.log('✅ [Contract] امضای مدیر کل ثبت شد:', contract.contractNumber);
        return { ok: true, contract: result.contract };
    }

    function signByLegalAdmin(contractId, adminInfo) {
        const contract = getContractById(contractId);
        if (!contract) return { ok: false, error: 'قرارداد یافت نشد' };

        const now = nowISO();
        const signatures = { ...contract.signatures };
        signatures.legalAdmin = {
            signed: true,
            image: null,
            at: now,
            by: adminInfo.name || adminInfo
        };

        const approvals = { ...contract.approvals };
        approvals.legalAdmin = {
            approved: true,
            by: adminInfo.name || adminInfo,
            at: now,
            note: null
        };

        const result = updateContract(contractId, { signatures, approvals });
        if (!result.ok) return result;

        log('contract_signed_by_legal', contractId, {
            by: adminInfo.name || adminInfo
        });

        console.log('✅ [Contract] امضای حقوقی ثبت شد:', contract.contractNumber);
        return { ok: true, contract: result.contract };
    }

    // ============================================================
    //  ✅  بررسی نهایی
    // ============================================================

    function isContractFullySigned(contractId) {
        const c = getContractById(contractId);
        if (!c) return false;

        if (c.type === 'purchase') {
            return c.signatures.broker.signed &&
                   c.signatures.superAdmin.signed &&
                   c.signatures.legalAdmin.signed;
        } else {
            return c.signatures.applicant.signed &&
                   c.signatures.superAdmin.signed &&
                   c.signatures.legalAdmin.signed;
        }
    }

    function finalizeContract(contractId) {
        const contract = getContractById(contractId);
        if (!contract) return { ok: false, error: 'قرارداد یافت نشد' };

        if (!isContractFullySigned(contractId)) {
            return { ok: false, error: 'همه‌ی امضاها کامل نشده است' };
        }

        const now = nowISO();
        const result = updateContract(contractId, {
            status: 'completed',
            finalizedAt: now
        });

        if (!result.ok) return result;

        log('contract_finalized', contractId, {});
        console.log('🎉 [Contract] قرارداد نهایی شد:', contract.contractNumber);

        return { ok: true, contract: result.contract };
    }

    // ============================================================
    //  📦  بایگانی
    // ============================================================

    async function archiveContract(contractId) {
        const contract = getContractById(contractId);
        if (!contract) return { ok: false, error: 'قرارداد یافت نشد' };

        if (contract.archived) {
            return { ok: true, contract };  // قبلاً بایگانی شده
        }

        const archiveId = `ARCH-CTR-${new Date().getFullYear()}-${String(getArchivedContracts().length + 1).padStart(4, '0')}`;
        const archiveData = {
            ...contract,
            archiveId,
            archivedAt: nowISO()
        };

        const finalHash = await sha256(JSON.stringify(archiveData));
        const archiveHash = `SHA256:${finalHash}`;

        // به‌روزرسانی
        const result = updateContract(contractId, {
            archived: true,
            archivedAt: archiveData.archivedAt,
            archiveId,
            archiveHash
        });
        if (!result.ok) return result;

        // افزودن به آرشیو
        const archive = getArchivedContracts();
        archive.push({
            id: archiveId,
            contractId: contract.id,
            contractNumber: contract.contractNumber,
            type: contract.type,
            caseId: contract.caseId,
            brokerId: contract.brokerId,
            applicantId: contract.applicantId,
            archiveHash,
            archivedAt: archiveData.archivedAt
        });
        localStorage.setItem(STORAGE_KEYS.archive, JSON.stringify(archive));

        log('contract_archived', contractId, { archiveId, archiveHash });
        console.log('📦 [Contract] قرارداد بایگانی شد:', contract.contractNumber, '| Hash:', archiveHash.slice(0, 20) + '...');

        return { ok: true, contract: result.contract, archiveId, archiveHash };
    }

    function getArchivedContracts() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.archive) || '[]');
        } catch { return []; }
    }

    // ============================================================
    //  📊  آمار و گزارش
    // ============================================================

    function getStatistics() {
        const all = getAllContracts();
        return {
            total: all.length,
            purchaseContracts: all.filter(c => c.type === 'purchase').length,
            saleContracts: all.filter(c => c.type === 'sale').length,
            draft: all.filter(c => c.status === 'draft').length,
            brokerSigned: all.filter(c => c.status === 'broker_signed').length,
            siteSigned: all.filter(c => c.status === 'site_signed').length,
            completed: all.filter(c => c.status === 'completed').length,
            archived: all.filter(c => c.archived).length
        };
    }

    function getStatusLabel(status) {
        const map = {
            draft: { label: 'پیش‌نویس', cls: 'pending', icon: '📝' },
            broker_signed: { label: 'امضای کارگزار انجام شد', cls: 'info', icon: '✅' },
            site_signed: { label: 'امضای سایت انجام شد', cls: 'info', icon: '✅' },
            completed: { label: 'تکمیل', cls: 'success', icon: '🎉' },
            archived: { label: 'بایگانی', cls: 'success', icon: '📦' }
        };
        return map[status] || map.draft;
    }

    // ============================================================
    //  🧪  Utilities
    // ============================================================

    function resetAll() {
        localStorage.removeItem(STORAGE_KEYS.contracts);
        localStorage.removeItem(STORAGE_KEYS.log);
        localStorage.removeItem(STORAGE_KEYS.archive);
        console.log('🧹 [Contract] تمام داده‌ها پاک شد');
    }

    function dump() {
        return {
            contracts: getAllContracts(),
            logs: getAllLogs(),
            archive: getArchivedContracts(),
            statistics: getStatistics()
        };
    }

    // ============================================================
    //  📤  Export
    // ============================================================

    global.WamPayContracts = {
        // Config
        CONFIG,
        CONTRACT_TYPES,

        // CRUD
        createContract,
        getContractById,
        getContractByNumber,
        getContractsByCase,
        getContractsByType,
        getContractsByStatus,
        getAllContracts,
        updateContract,

        // Signatures
        signByBroker,
        signByApplicant,
        signBySuperAdmin,
        signByLegalAdmin,

        // Verification
        isContractFullySigned,
        finalizeContract,

        // Archive
        archiveContract,
        getArchivedContracts,

        // Text Generation
        generatePurchaseContractText,
        generateSaleContractText,

        // Statistics
        getStatistics,
        getStatusLabel,

        // Utilities
        formatPrice: faPrice,
        formatNumber: faNum,
        sha256,

        // Debug
        resetAll,
        _dump: dump
    };

    console.log('%c📄 WAM PAY — Contract Service v1.0', 'color:#0b3b23;font-weight:bold;font-size:13px;');
    console.log('%c📝 دو قرارداد | ✍️ امضای دیجیتال | 📦 بایگانی با SHA-256', 'color:#d4a62a;font-weight:bold;');

})(typeof window !== 'undefined' ? window : this);