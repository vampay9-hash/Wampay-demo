/* ============================================================
   WAM PAY — Credit Invoice Service v1.0
   سرویس مدیریت فاکتورهای خرید و فروش امتیاز
   ============================================================ */

(function (global) {
    'use strict';

    // ===== Config =====
    const CONFIG = {
        invoicePrefix: 'INV-CRD',
        currency: 'IRT',
        currencyLabel: 'تومان',
        defaultPurchasePrice: 150000,   // قیمت پیش‌فرض خرید (۱۵۰,۰۰۰)
        defaultSalePrice: 200000,       // قیمت پیش‌فرض فروش (۲۰۰,۰۰۰)
        minRepaymentMonths: 10,
        maxRepaymentMonths: 24,
        minCreditCount: 1,
        maxCreditCount: 10000,
        creditTypes: [
            'رسالت',
            'مهر ایران',
            'سپه',
            'ملی',
            'قرض‌الحسنه',
            'رفاه',
            'پاسارگاد',
            'پارسیان',
            'سامان',
            'سایر'
        ]
    };

    // ===== Helpers =====
    const faNum = (n) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
    const faPrice = (n) => Number(n || 0).toLocaleString('fa-IR');
    const nowISO = () => new Date().toISOString();

    function generateId(prefix = 'crd') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function generateInvoiceNumber() {
        const year = new Date().getFullYear();
        const allInvoices = getAllInvoices();
        const seq = String(allInvoices.length + 1).padStart(4, '0');
        return `${CONFIG.invoicePrefix}-${year}-${seq}`;
    }

    // ===== Storage =====
    const STORAGE_KEYS = {
        invoices: 'wamPayCreditInvoices',
        log: 'wamPayCreditInvoiceLog'
    };

    function getAllInvoices() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.invoices) || '[]');
        } catch { return []; }
    }

    function saveInvoices(list) {
        try {
            localStorage.setItem(STORAGE_KEYS.invoices, JSON.stringify(list));
            return true;
        } catch (e) {
            console.error('Save invoices error:', e);
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

    // ===== Logging =====
    function log(action, invoiceId, payload = {}, actor = null) {
        const logs = getAllLogs();
        logs.unshift({
            id: generateId('log'),
            action,
            invoiceId,
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
                name: cu.name || cu.firstName + ' ' + (cu.lastName || '') || '—'
            };
        } catch {
            return { role: 'system', name: 'سیستم', id: null };
        }
    }

    // ===== Validation =====
    function validateInvoiceData(data) {
        const errors = [];

        // مبلغ وام
        if (!data.loanAmount || data.loanAmount <= 0) {
            errors.push('مبلغ وام باید بزرگتر از صفر باشد');
        }

        // ماه بازپرداخت
        if (!data.repaymentMonths ||
            data.repaymentMonths < CONFIG.minRepaymentMonths ||
            data.repaymentMonths > CONFIG.maxRepaymentMonths) {
            errors.push(`تعداد ماه بازپرداخت باید بین ${faNum(CONFIG.minRepaymentMonths)} تا ${faNum(CONFIG.maxRepaymentMonths)} ماه باشد`);
        }

        // نام امتیاز
        if (!data.creditName || !data.creditName.trim()) {
            errors.push('نام امتیاز را انتخاب کنید');
        }

        // تعداد امتیاز
        if (!data.creditCount ||
            data.creditCount < CONFIG.minCreditCount ||
            data.creditCount > CONFIG.maxCreditCount) {
            errors.push(`تعداد امتیاز باید بین ${faNum(CONFIG.minCreditCount)} تا ${faNum(CONFIG.maxCreditCount)} باشد`);
        }

        // قیمت خرید
        if (!data.purchasePrice || data.purchasePrice <= 0) {
            errors.push('قیمت خرید باید بزرگتر از صفر باشد');
        }

        // قیمت فروش
        if (!data.salePrice || data.salePrice <= 0) {
            errors.push('قیمت فروش باید بزرگتر از صفر باشد');
        }

        // قیمت فروش باید بیشتر از خرید باشد
        if (data.salePrice <= data.purchasePrice) {
            errors.push('قیمت فروش باید بیشتر از قیمت خرید باشد');
        }

        // حداکثر اختلاف منطقی (۲ برابر)
        if (data.salePrice > data.purchasePrice * 2) {
            errors.push('قیمت فروش نباید بیش از ۲ برابر قیمت خرید باشد');
        }

        return {
            ok: errors.length === 0,
            errors
        };
    }

    // ===== Calculations =====
    function computeInvoice(data) {
        const creditCount = Number(data.creditCount) || 0;
        const purchasePrice = Number(data.purchasePrice) || 0;
        const salePrice = Number(data.salePrice) || 0;

        const purchaseTotal = creditCount * purchasePrice;
        const saleTotal = creditCount * salePrice;
        const siteShare = saleTotal - purchaseTotal;
        const siteSharePerUnit = salePrice - purchasePrice;
        const sitePercent = saleTotal > 0 ? (siteShare / saleTotal) * 100 : 0;
        const brokerPercent = saleTotal > 0 ? (purchaseTotal / saleTotal) * 100 : 0;

        return {
            purchase: {
                pricePerUnit: purchasePrice,
                total: purchaseTotal,
                currency: CONFIG.currency
            },
            sale: {
                pricePerUnit: salePrice,
                total: saleTotal,
                currency: CONFIG.currency
            },
            profit: {
                siteShare: siteShare,
                siteSharePerUnit: siteSharePerUnit,
                sitePercent: Math.round(sitePercent * 100) / 100,
                brokerShare: purchaseTotal,
                brokerPercent: Math.round(brokerPercent * 100) / 100
            },
            // برای فرمت‌دهی UI
            display: {
                loanAmount: faPrice(data.loanAmount) + ' ' + CONFIG.currencyLabel,
                creditCount: faNum(creditCount) + ' امتیاز',
                creditName: data.creditName || '—',
                repaymentMonths: faNum(data.repaymentMonths) + ' ماه',
                purchasePrice: faPrice(purchasePrice) + ' ' + CONFIG.currencyLabel,
                salePrice: faPrice(salePrice) + ' ' + CONFIG.currencyLabel,
                purchaseTotal: faPrice(purchaseTotal) + ' ' + CONFIG.currencyLabel,
                saleTotal: faPrice(saleTotal) + ' ' + CONFIG.currencyLabel,
                siteShare: faPrice(siteShare) + ' ' + CONFIG.currencyLabel,
                brokerShare: faPrice(purchaseTotal) + ' ' + CONFIG.currencyLabel,
                sitePercent: faNum(Math.round(sitePercent)) + '٪'
            }
        };
    }

    // ===== CRUD =====
    function createInvoice(inputData, options = {}) {
        // Validation
        const validation = validateInvoiceData(inputData);
        if (!validation.ok) {
            return { ok: false, errors: validation.errors };
        }

        // محاسبات
        const computed = computeInvoice(inputData);

        const invoice = {
            id: generateId('crd'),
            invoiceNumber: generateInvoiceNumber(),

            // Case مرتبط
            caseId: options.caseId || null,
            caseNumber: options.caseNumber || null,
            brokerId: options.brokerId || null,
            brokerName: options.brokerName || null,

            // اطلاعات پایه
            loanAmount: Number(inputData.loanAmount),
            repaymentMonths: Number(inputData.repaymentMonths),
            creditName: inputData.creditName.trim(),
            creditCount: Number(inputData.creditCount),

            // قیمت‌ها
            purchase: computed.purchase,
            sale: computed.sale,
            profit: computed.profit,

            // تأییدات
            approvals: {
                brokerAdmin: {
                    approved: false,
                    by: null,
                    at: null,
                    note: null,
                    rejected: false,
                    rejectReason: null
                },
                accounting: {
                    approved: false,
                    by: null,
                    at: null,
                    adjustments: null,
                    note: null,
                    rejected: false,
                    rejectReason: null
                },
                superAdmin: {
                    approved: false,
                    by: null,
                    at: null,
                    note: null,
                    rejected: false,
                    rejectReason: null
                }
            },

            // وضعیت
            status: 'awaiting_broker_admin_review',

            // لاگ
            createdBy: getCurrentActor(),
            createdAt: nowISO(),
            updatedAt: nowISO()
        };

        // ذخیره
        const list = getAllInvoices();
        list.push(invoice);
        if (!saveInvoices(list)) {
            return { ok: false, errors: ['خطا در ذخیره‌سازی'] };
        }

        // لاگ
        log('invoice_created', invoice.id, {
            invoiceNumber: invoice.invoiceNumber,
            loanAmount: invoice.loanAmount,
            siteShare: invoice.profit.siteShare
        });

        console.log('✅ [Credit Invoice] فاکتور ساخته شد:', invoice.invoiceNumber);
        return { ok: true, invoice };
    }

    function getInvoiceById(id) {
        return getAllInvoices().find(i => i.id === id) || null;
    }

    function getInvoiceByNumber(number) {
        return getAllInvoices().find(i => i.invoiceNumber === number) || null;
    }

    function getInvoicesByCase(caseId) {
        return getAllInvoices().filter(i => i.caseId === caseId);
    }

    function getInvoicesByBroker(brokerId) {
        return getAllInvoices().filter(i => i.brokerId === brokerId);
    }

    function getInvoicesByStatus(status) {
        return getAllInvoices().filter(i => i.status === status);
    }

    function updateInvoice(id, patch) {
        const list = getAllInvoices();
        const idx = list.findIndex(i => i.id === id);
        if (idx < 0) return { ok: false, error: 'فاکتور یافت نشد' };

        const old = list[idx];
        list[idx] = {
            ...old,
            ...patch,
            updatedAt: nowISO()
        };

        if (!saveInvoices(list)) {
            return { ok: false, error: 'خطا در ذخیره‌سازی' };
        }

        log('invoice_updated', id, { changes: Object.keys(patch) });
        return { ok: true, invoice: list[idx] };
    }

    function deleteInvoice(id) {
        const list = getAllInvoices();
        const idx = list.findIndex(i => i.id === id);
        if (idx < 0) return { ok: false, error: 'فاکتور یافت نشد' };

        list.splice(idx, 1);
        saveInvoices(list);

        log('invoice_deleted', id, {});
        return { ok: true };
    }

    // ===== Approvals =====

    // ۱. تأیید ادمین کارگزار
    function approveByBrokerAdmin(id, adminInfo, note = null) {
        const invoice = getInvoiceById(id);
        if (!invoice) return { ok: false, error: 'فاکتور یافت نشد' };

        if (invoice.status !== 'awaiting_broker_admin_review') {
            return { ok: false, error: 'وضعیت فاکتور اجازه‌ی این عملیات را نمی‌دهد' };
        }

        const now = nowISO();
        const patch = {
            status: 'awaiting_accounting_review',
            'approvals.brokerAdmin': {
                approved: true,
                by: adminInfo.name || adminInfo,
                at: now,
                note
            }
        };

        // اعمال patch با پشتیبانی از dot notation
        const updated = applyPatch(invoice, patch);
        const result = updateInvoice(id, updated);
        if (!result.ok) return result;

        log('invoice_broker_admin_approved', id, {
            by: adminInfo.name || adminInfo
        });

        console.log('✅ [Credit Invoice] تأیید ادمین کارگزار:', invoice.invoiceNumber);
        return { ok: true, invoice: result.invoice };
    }

    // ۲. تأیید ادمین حسابداری
    function approveByAccounting(id, adminInfo, options = {}) {
        const invoice = getInvoiceById(id);
        if (!invoice) return { ok: false, error: 'فاکتور یافت نشد' };

        if (invoice.status !== 'awaiting_accounting_review') {
            return { ok: false, error: 'وضعیت فاکتور اجازه‌ی این عملیات را نمی‌دهد' };
        }

        const now = nowISO();
        let patch = {
            status: 'awaiting_super_admin_financial',
            'approvals.accounting': {
                approved: true,
                by: adminInfo.name || adminInfo,
                at: now,
                adjustments: options.adjustments || null,
                note: options.note || null
            }
        };

        // اگر ادمین حسابداری قیمت‌ها رو تنظیم کرد
        if (options.adjustedPurchasePrice || options.adjustedSalePrice) {
            const newData = {
                loanAmount: invoice.loanAmount,
                repaymentMonths: invoice.repaymentMonths,
                creditName: invoice.creditName,
                creditCount: invoice.creditCount,
                purchasePrice: options.adjustedPurchasePrice || invoice.purchase.pricePerUnit,
                salePrice: options.adjustedSalePrice || invoice.sale.pricePerUnit
            };
            const computed = computeInvoice(newData);
            patch.purchase = computed.purchase;
            patch.sale = computed.sale;
            patch.profit = computed.profit;
            patch['approvals.accounting'].adjustments = {
                oldPurchase: invoice.purchase.pricePerUnit,
                oldSale: invoice.sale.pricePerUnit,
                newPurchase: newData.purchasePrice,
                newSale: newData.salePrice
            };
        }

        const updated = applyPatch(invoice, patch);
        const result = updateInvoice(id, updated);
        if (!result.ok) return result;

        log('invoice_accounting_approved', id, {
            by: adminInfo.name || adminInfo,
            adjustments: options.adjustments || null
        });

        console.log('✅ [Credit Invoice] تأیید حسابداری:', invoice.invoiceNumber);
        return { ok: true, invoice: result.invoice };
    }

    // ۳. تأیید نهایی مدیر کل
    function approveBySuperAdmin(id, adminInfo, note = null) {
        const invoice = getInvoiceById(id);
        if (!invoice) return { ok: false, error: 'فاکتور یافت نشد' };

        if (invoice.status !== 'awaiting_super_admin_financial') {
            return { ok: false, error: 'وضعیت فاکتور اجازه‌ی این عملیات را نمی‌دهد' };
        }

        const now = nowISO();
        const patch = {
            status: 'awaiting_legal_draft',
            'approvals.superAdmin': {
                approved: true,
                by: adminInfo.name || adminInfo,
                at: now,
                note
            }
        };

        const updated = applyPatch(invoice, patch);
        const result = updateInvoice(id, updated);
        if (!result.ok) return result;

        log('invoice_super_admin_approved', id, {
            by: adminInfo.name || adminInfo
        });

        console.log('✅ [Credit Invoice] تأیید مدیر کل:', invoice.invoiceNumber);
        return { ok: true, invoice: result.invoice };
    }

    // ===== Reject =====
    function rejectBy(id, role, adminInfo, reason) {
        const invoice = getInvoiceById(id);
        if (!invoice) return { ok: false, error: 'فاکتور یافت نشد' };

        const roleMap = {
            brokerAdmin: 'awaiting_broker_admin_review',
            accounting: 'awaiting_accounting_review',
            superAdmin: 'awaiting_super_admin_financial'
        };

        if (invoice.status !== roleMap[role]) {
            return { ok: false, error: 'وضعیت اجازه نمی‌دهد' };
        }

        const now = nowISO();
        const patch = {
            status: 'rejected',
            [`approvals.${role}`]: {
                approved: false,
                rejected: true,
                by: adminInfo.name || adminInfo,
                at: now,
                rejectReason: reason
            }
        };

        const updated = applyPatch(invoice, patch);
        const result = updateInvoice(id, updated);
        if (!result.ok) return result;

        log('invoice_rejected', id, {
            by: adminInfo.name || adminInfo,
            role,
            reason
        });

        return { ok: true, invoice: result.invoice };
    }

    // ===== Helpers =====
    function applyPatch(obj, patch) {
        const result = JSON.parse(JSON.stringify(obj));
        for (const key in patch) {
            if (key.includes('.')) {
                const parts = key.split('.');
                let target = result;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!target[parts[i]]) target[parts[i]] = {};
                    target = target[parts[i]];
                }
                target[parts[parts.length - 1]] = patch[key];
            } else {
                result[key] = patch[key];
            }
        }
        return result;
    }

    // ===== Statistics =====
    function getStatistics() {
        const all = getAllInvoices();
        return {
            total: all.length,
            awaitingBrokerAdmin: all.filter(i => i.status === 'awaiting_broker_admin_review').length,
            awaitingAccounting: all.filter(i => i.status === 'awaiting_accounting_review').length,
            awaitingSuperAdmin: all.filter(i => i.status === 'awaiting_super_admin_financial').length,
            awaitingLegal: all.filter(i => i.status === 'awaiting_legal_draft').length,
            approved: all.filter(i => i.status !== 'rejected' && i.status !== 'draft').length,
            rejected: all.filter(i => i.status === 'rejected').length,
            totalSiteProfit: all
                .filter(i => i.status !== 'rejected')
                .reduce((sum, i) => sum + (i.profit?.siteShare || 0), 0),
            totalBrokerShare: all
                .filter(i => i.status !== 'rejected')
                .reduce((sum, i) => sum + (i.profit?.brokerShare || 0), 0),
            totalSaleValue: all
                .filter(i => i.status !== 'rejected')
                .reduce((sum, i) => sum + (i.sale?.total || 0), 0)
        };
    }

    function getStatusLabel(status) {
        const map = {
            draft: { label: 'پیش‌نویس', cls: 'pending', icon: '📝' },
            awaiting_broker_admin_review: { label: 'در انتظار ادمین کارگزار', cls: 'pending', icon: '⏳' },
            awaiting_accounting_review: { label: 'در انتظار حسابداری', cls: 'info', icon: '💰' },
            awaiting_super_admin_financial: { label: 'در انتظار مدیر کل', cls: 'info', icon: '⏳' },
            awaiting_legal_draft: { label: 'در انتظار حقوقی', cls: 'info', icon: '⚖️' },
            awaiting_broker_sign: { label: 'در انتظار امضای کارگزار', cls: 'pending', icon: '✍️' },
            awaiting_site_sign: { label: 'در انتظار امضای سایت', cls: 'pending', icon: '✍️' },
            awaiting_applicant_sign: { label: 'در انتظار امضای متقاضی', cls: 'pending', icon: '✍️' },
            contract_signed_by_all: { label: 'همه امضا کردند', cls: 'success', icon: '✅' },
            payment_pending: { label: 'در انتظار پرداخت', cls: 'pending', icon: '💳' },
            payment_in_escrow: { label: 'امانی', cls: 'info', icon: '🏦' },
            completed: { label: 'تکمیل', cls: 'success', icon: '🎉' },
            rejected: { label: 'ردشده', cls: 'error', icon: '❌' }
        };
        return map[status] || map.draft;
    }

    // ===== Preview for UI =====
    function previewInvoice(inputData) {
        const validation = validateInvoiceData(inputData);
        const computed = computeInvoice(inputData);
        return {
            valid: validation.ok,
            errors: validation.errors,
            computed
        };
    }

    // ===== Reset (تست) =====
    function resetAll() {
        localStorage.removeItem(STORAGE_KEYS.invoices);
        localStorage.removeItem(STORAGE_KEYS.log);
        console.log('🧹 [Credit Invoice] تمام داده‌ها پاک شد');
    }

    function dump() {
        return {
            invoices: getAllInvoices(),
            logs: getAllLogs(),
            statistics: getStatistics()
        };
    }

    // ===== Export =====
    global.WamPayCreditInvoice = {
        // Config
        CONFIG,

        // CRUD
        createInvoice,
        getInvoiceById,
        getInvoiceByNumber,
        getInvoicesByCase,
        getInvoicesByBroker,
        getInvoicesByStatus,
        getAllInvoices,
        updateInvoice,
        deleteInvoice,

        // Approvals
        approveByBrokerAdmin,
        approveByAccounting,
        approveBySuperAdmin,
        rejectBy,

        // Calculations
        computeInvoice,
        previewInvoice,
        validateInvoiceData,

        // Statistics
        getStatistics,
        getStatusLabel,

        // Utilities
        formatPrice: faPrice,
        formatNumber: faNum,

        // Debug
        resetAll,
        _dump: dump
    };

    console.log('%c💳 WAM PAY — Credit Invoice Service v1.0', 'color:#0b3b23;font-weight:bold;font-size:13px;');
    console.log('%c🛒 خرید از کارگزار | 💰 فروش به متقاضی | ✨ سود از اختلاف', 'color:#d4a62a;font-weight:bold;');

})(typeof window !== 'undefined' ? window : this);