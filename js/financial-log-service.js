/* ============================================================
   WAM PAY — Financial Log Service v1.0
   سرویس لاگ کامل فعالیت‌های مالی و تراکنش‌ها
   ============================================================ */

(function (global) {
    'use strict';

    // ===== Config =====
    const CONFIG = {
        maxLogs: 2000,              // حداکثر تعداد لاگ نگهداری‌شده
        currencyLabel: 'تومان',
        // انواع رویدادهای مالی
        eventTypes: {
            // فاکتور
            INVOICE_CREATED: 'invoice_created',
            INVOICE_UPDATED: 'invoice_updated',
            INVOICE_DELETED: 'invoice_deleted',
            INVOICE_BROKER_ADMIN_APPROVED: 'invoice_broker_admin_approved',
            INVOICE_ACCOUNTING_APPROVED: 'invoice_accounting_approved',
            INVOICE_SUPER_ADMIN_APPROVED: 'invoice_super_admin_approved',
            INVOICE_REJECTED: 'invoice_rejected',

            // قرارداد
            CONTRACT_CREATED: 'contract_created',
            CONTRACT_SIGNED_BROKER: 'contract_signed_broker',
            CONTRACT_SIGNED_APPLICANT: 'contract_signed_applicant',
            CONTRACT_SIGNED_SUPER_ADMIN: 'contract_signed_super_admin',
            CONTRACT_SIGNED_LEGAL: 'contract_signed_legal',
            CONTRACT_FINALIZED: 'contract_finalized',
            CONTRACT_ARCHIVED: 'contract_archived',

            // پرداخت
            PAYMENT_INITIATED: 'payment_initiated',
            PAYMENT_IN_ESCROW: 'payment_in_escrow',
            PAYMENT_RELEASED: 'payment_released',
            PAYMENT_REFUNDED: 'payment_refunded',

            // کیف پول
            WALLET_CREDITED: 'wallet_credited',
            WALLET_DEBITED: 'wallet_debited',
            WALLET_SETTLEMENT_REQUESTED: 'wallet_settlement_requested',
            WALLET_SETTLEMENT_APPROVED: 'wallet_settlement_approved',

            // سایر
            PRICE_ADJUSTED: 'price_adjusted',
            FINANCIAL_NOTE: 'financial_note',
            SYSTEM_EVENT: 'system_event'
        },
        // دسته‌بندی رنگ
        categories: {
            invoice: { label: 'فاکتور', color: '#2980b9', icon: '📋' },
            contract: { label: 'قرارداد', color: '#1e8e4a', icon: '📄' },
            payment: { label: 'پرداخت', color: '#d4a62a', icon: '💰' },
            wallet: { label: 'کیف پول', color: '#e67e22', icon: '🏦' },
            adjustment: { label: 'تنظیم', color: '#8e44ad', icon: '⚙️' },
            system: { label: 'سیستم', color: '#6b7d73', icon: '🔧' }
        }
    };

    // ===== Helpers =====
    const faNum = (n) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
    const faPrice = (n) => Number(n || 0).toLocaleString('fa-IR');
    const nowISO = () => new Date().toISOString();

    function generateId(prefix = 'flog') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function formatShamsiDate(iso) {
        try {
            const d = new Date(iso);
            const fa = (n) => String(n).padStart(2, '0').replace(/\d/g, x => '۰۱۲۳۴۵۶۷۸۹'[x]);
            return `${fa(d.getFullYear())}/${fa(d.getMonth()+1)}/${fa(d.getDate())} — ${fa(d.getHours())}:${fa(d.getMinutes())}`;
        } catch { return '—'; }
    }

    // ===== Storage =====
    const STORAGE_KEYS = {
        logs: 'wamPayFinancialLog',
        archive: 'wamPayFinancialLogArchive',
        meta: 'wamPayFinancialLogMeta'
    };

    function getAllLogs() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.logs) || '[]');
        } catch { return []; }
    }

    function saveLogs(list) {
        try {
            // اگر از حد مجاز گذشت، قدیمی‌ترها به آرشیو
            if (list.length > CONFIG.maxLogs) {
                const toArchive = list.slice(CONFIG.maxLogs);
                const archive = getArchivedLogs();
                archive.push(...toArchive);
                // محدود کردن آرشیو
                if (archive.length > 10000) archive.length = 10000;
                localStorage.setItem(STORAGE_KEYS.archive, JSON.stringify(archive));

                list = list.slice(0, CONFIG.maxLogs);
            }
            localStorage.setItem(STORAGE_KEYS.logs, JSON.stringify(list));
            return true;
        } catch (e) {
            console.error('Save financial log error:', e);
            return false;
        }
    }

    function getArchivedLogs() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.archive) || '[]');
        } catch { return []; }
    }

    function getMeta() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.meta) || '{}');
        } catch { return {}; }
    }

    function saveMeta(meta) {
        try {
            localStorage.setItem(STORAGE_KEYS.meta, JSON.stringify(meta));
        } catch {}
    }

    // ===== Actor =====
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

    // ===== Category Map =====
    function getCategoryForEvent(eventType) {
        if (!eventType) return 'system';
        if (eventType.startsWith('invoice')) return 'invoice';
        if (eventType.startsWith('contract')) return 'contract';
        if (eventType.startsWith('payment')) return 'payment';
        if (eventType.startsWith('wallet')) return 'wallet';
        if (eventType.startsWith('price')) return 'adjustment';
        return 'system';
    }

    // ============================================================
    //  📝  ثبت لاگ
    // ============================================================

    function logEvent(eventType, payload = {}, options = {}) {
        const logs = getAllLogs();
        const actor = options.actor || getCurrentActor();
        const category = getCategoryForEvent(eventType);

        const entry = {
            id: generateId('flog'),
            eventType,
            category,

            // ارتباطات
            caseId: options.caseId || null,
            caseNumber: options.caseNumber || null,
            invoiceId: options.invoiceId || null,
            invoiceNumber: options.invoiceNumber || null,
            contractId: options.contractId || null,
            contractNumber: options.contractNumber || null,
            userId: options.userId || actor.id,
            brokerId: options.brokerId || null,

            // عنوان و توضیح
            title: options.title || getDefaultTitle(eventType),
            description: options.description || null,

            // مبالغ (برای فیلتر و آمار)
            amounts: {
                amount: options.amount || 0,
                siteShare: options.siteShare || 0,
                brokerShare: options.brokerShare || 0,
                loanAmount: options.loanAmount || 0,
                currency: 'IRT'
            },

            // داده‌های اضافی
            payload,

            // Actor
            actor,

            // زمان
            at: nowISO(),
            timestamp: Date.now(),

            // وضعیت
            status: options.status || 'completed',
            important: options.important || false,
            tags: options.tags || []
        };

        logs.unshift(entry);  // جدیدترین اول
        if (!saveLogs(logs)) {
            console.error('خطا در ذخیره‌ی لاگ مالی');
            return { ok: false };
        }

        // به‌روزرسانی meta
        const meta = getMeta();
        meta.lastEventAt = entry.at;
        meta.totalEvents = (meta.totalEvents || 0) + 1;
        saveMeta(meta);

        console.log(`💰 [FinancialLog] ${entry.title}`, {
            type: eventType,
            amount: entry.amounts.amount
        });

        return { ok: true, entry };
    }

    function getDefaultTitle(eventType) {
        const map = {
            invoice_created: 'ایجاد فاکتور امتیاز',
            invoice_updated: 'ویرایش فاکتور امتیاز',
            invoice_deleted: 'حذف فاکتور امتیاز',
            invoice_broker_admin_approved: 'تأیید فاکتور توسط ادمین کارگزار',
            invoice_accounting_approved: 'تأیید فاکتور توسط حسابداری',
            invoice_super_admin_approved: 'تأیید فاکتور توسط مدیر کل',
            invoice_rejected: 'رد فاکتور',
            contract_created: 'ایجاد قرارداد',
            contract_signed_broker: 'امضای قرارداد توسط کارگزار',
            contract_signed_applicant: 'امضای قرارداد توسط متقاضی',
            contract_signed_super_admin: 'امضای قرارداد توسط مدیر کل',
            contract_signed_legal: 'امضای قرارداد توسط حقوقی',
            contract_finalized: 'نهایی‌سازی قرارداد',
            contract_archived: 'بایگانی قرارداد',
            payment_initiated: 'شروع پرداخت',
            payment_in_escrow: 'پرداخت امانی',
            payment_released: 'آزادسازی وجه',
            payment_refunded: 'بازگشت وجه',
            wallet_credited: 'واریز به کیف پول',
            wallet_debited: 'برداشت از کیف پول',
            wallet_settlement_requested: 'درخواست تسویه',
            wallet_settlement_approved: 'تأیید تسویه',
            price_adjusted: 'تنظیم قیمت',
            financial_note: 'یادداشت مالی',
            system_event: 'رویداد سیستمی'
        };
        return map[eventType] || 'رویداد مالی';
    }

    // ============================================================
    //  🔍  جستجو و فیلتر
    // ============================================================

    function query(filters = {}) {
        let logs = getAllLogs();

        // فیلتر بر اساس eventType
        if (filters.eventTypes && filters.eventTypes.length > 0) {
            logs = logs.filter(l => filters.eventTypes.includes(l.eventType));
        }

        // فیلتر بر اساس category
        if (filters.category) {
            logs = logs.filter(l => l.category === filters.category);
        }

        // فیلتر بر اساس caseId
        if (filters.caseId) {
            logs = logs.filter(l => l.caseId === filters.caseId);
        }

        // فیلتر بر اساس contractId
        if (filters.contractId) {
            logs = logs.filter(l => l.contractId === filters.contractId);
        }

        // فیلتر بر اساس invoiceId
        if (filters.invoiceId) {
            logs = logs.filter(l => l.invoiceId === filters.invoiceId);
        }

        // فیلتر بر اساس brokerId
        if (filters.brokerId) {
            logs = logs.filter(l => l.brokerId === filters.brokerId);
        }

        // فیلتر بر اساس actor role
        if (filters.actorRole) {
            logs = logs.filter(l => l.actor?.role === filters.actorRole);
        }

        // فیلتر بر اساس بازه‌ی زمانی
        if (filters.from) {
            const fromTime = new Date(filters.from).getTime();
            logs = logs.filter(l => l.timestamp >= fromTime);
        }
        if (filters.to) {
            const toTime = new Date(filters.to).getTime();
            logs = logs.filter(l => l.timestamp <= toTime);
        }

        // فیلتر بر اساس مهم
        if (filters.importantOnly) {
            logs = logs.filter(l => l.important);
        }

        // فیلتر بر اساس مقدار
        if (filters.minAmount) {
            logs = logs.filter(l => l.amounts.amount >= filters.minAmount);
        }
        if (filters.maxAmount) {
            logs = logs.filter(l => l.amounts.amount <= filters.maxAmount);
        }

        // جستجوی متنی
        if (filters.q) {
            const q = filters.q.toLowerCase().trim();
            logs = logs.filter(l =>
                (l.title || '').toLowerCase().includes(q) ||
                (l.description || '').toLowerCase().includes(q) ||
                (l.caseNumber || '').toLowerCase().includes(q) ||
                (l.contractNumber || '').toLowerCase().includes(q) ||
                (l.invoiceNumber || '').toLowerCase().includes(q) ||
                (l.actor?.name || '').toLowerCase().includes(q)
            );
        }

        // مرتب‌سازی
        const sortBy = filters.sortBy || 'timestamp';
        const sortDir = filters.sortDir || 'desc';
        logs.sort((a, b) => {
            const va = a[sortBy] || 0;
            const vb = b[sortBy] || 0;
            return sortDir === 'desc' ? vb - va : va - vb;
        });

        // صفحه‌بندی
        const total = logs.length;
        const page = filters.page || 1;
        const perPage = filters.perPage || 50;
        const start = (page - 1) * perPage;
        const paginated = logs.slice(start, start + perPage);

        return {
            total,
            page,
            perPage,
            pages: Math.ceil(total / perPage),
            logs: paginated
        };
    }

    function getLogById(id) {
        return getAllLogs().find(l => l.id === id) || null;
    }

    function getLogsByCase(caseId) {
        return getAllLogs().filter(l => l.caseId === caseId);
    }

    function getLogsByContract(contractId) {
        return getAllLogs().filter(l => l.contractId === contractId);
    }

    function getRecentLogs(limit = 20) {
        return getAllLogs().slice(0, limit);
    }

    function getImportantLogs(limit = 10) {
        return getAllLogs().filter(l => l.important).slice(0, limit);
    }

    // ============================================================
    //  📊  آمار و تحلیل
    // ============================================================

    function getStatistics(filters = {}) {
        const logs = query({ ...filters, page: 1, perPage: 999999 }).logs;

        const stats = {
            total: logs.length,

            // بر اساس category
            byCategory: {},
            // بر اساس eventType
            byEventType: {},
            // بر اساس actor
            byActor: {},

            // مبالغ
            totalAmount: 0,
            totalSiteShare: 0,
            totalBrokerShare: 0,
            totalLoanAmount: 0,

            // بر اساس روز
            byDay: {}
        };

        logs.forEach(l => {
            // دسته‌بندی
            stats.byCategory[l.category] = (stats.byCategory[l.category] || 0) + 1;
            stats.byEventType[l.eventType] = (stats.byEventType[l.eventType] || 0) + 1;

            // Actor
            const actorName = l.actor?.name || 'سیستم';
            if (!stats.byActor[actorName]) {
                stats.byActor[actorName] = { count: 0, role: l.actor?.role };
            }
            stats.byActor[actorName].count++;

            // مبالغ
            stats.totalAmount += l.amounts?.amount || 0;
            stats.totalSiteShare += l.amounts?.siteShare || 0;
            stats.totalBrokerShare += l.amounts?.brokerShare || 0;
            stats.totalLoanAmount += l.amounts?.loanAmount || 0;

            // بر اساس روز
            const day = l.at ? l.at.slice(0, 10) : 'unknown';
            if (!stats.byDay[day]) {
                stats.byDay[day] = { count: 0, amount: 0 };
            }
            stats.byDay[day].count++;
            stats.byDay[day].amount += l.amounts?.amount || 0;
        });

        return stats;
    }

    function getDailyReport(date) {
        const day = date ? date.slice(0, 10) : new Date().toISOString().slice(0, 10);
        const logs = getAllLogs().filter(l => l.at && l.at.slice(0, 10) === day);

        return {
            date: day,
            count: logs.length,
            totalAmount: logs.reduce((s, l) => s + (l.amounts?.amount || 0), 0),
            siteEarnings: logs.reduce((s, l) => s + (l.amounts?.siteShare || 0), 0),
            brokerEarnings: logs.reduce((s, l) => s + (l.amounts?.brokerShare || 0), 0),
            byEventType: logs.reduce((acc, l) => {
                acc[l.eventType] = (acc[l.eventType] || 0) + 1;
                return acc;
            }, {}),
            logs
        };
    }

    function getMonthlyReport(year, month) {
        const target = `${year}-${String(month).padStart(2, '0')}`;
        const logs = getAllLogs().filter(l => l.at && l.at.slice(0, 7) === target);

        return {
            year,
            month,
            count: logs.length,
            totalAmount: logs.reduce((s, l) => s + (l.amounts?.amount || 0), 0),
            siteEarnings: logs.reduce((s, l) => s + (l.amounts?.siteShare || 0), 0),
            brokerEarnings: logs.reduce((s, l) => s + (l.amounts?.brokerShare || 0), 0),
            byCategory: logs.reduce((acc, l) => {
                acc[l.category] = (acc[l.category] || 0) + 1;
                return acc;
            }, {}),
            logs
        };
    }

    // ============================================================
    //  🎯  Helper برای ثبت‌های پرکاربرد
    // ============================================================

    function logInvoiceCreated(invoice, caseData) {
        return logEvent(CONFIG.eventTypes.INVOICE_CREATED, {
            invoiceNumber: invoice.invoiceNumber,
            creditCount: invoice.creditCount,
            creditName: invoice.creditName
        }, {
            caseId: caseData?.id,
            caseNumber: caseData?.caseNumber,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            brokerId: caseData?.brokerId,
            title: `ایجاد فاکتور ${invoice.invoiceNumber}`,
            description: `${invoice.creditCount} امتیاز ${invoice.creditName} — خرید: ${faPrice(invoice.purchase.total)} تومان، فروش: ${faPrice(invoice.sale.total)} تومان`,
            amount: invoice.sale.total,
            siteShare: invoice.profit.siteShare,
            brokerShare: invoice.profit.brokerShare,
            loanAmount: invoice.loanAmount,
            tags: ['فاکتور', invoice.creditName],
            important: true
        });
    }

    function logInvoiceApproved(invoice, by, stage) {
        const types = {
            brokerAdmin: CONFIG.eventTypes.INVOICE_BROKER_ADMIN_APPROVED,
            accounting: CONFIG.eventTypes.INVOICE_ACCOUNTING_APPROVED,
            superAdmin: CONFIG.eventTypes.INVOICE_SUPER_ADMIN_APPROVED
        };
        const titles = {
            brokerAdmin: `تأیید فاکتور ${invoice.invoiceNumber} توسط ادمین کارگزار`,
            accounting: `تأیید فاکتور ${invoice.invoiceNumber} توسط حسابداری`,
            superAdmin: `تأیید فاکتور ${invoice.invoiceNumber} توسط مدیر کل`
        };

        return logEvent(types[stage], {
            stage,
            invoiceNumber: invoice.invoiceNumber
        }, {
            caseId: invoice.caseId,
            caseNumber: invoice.caseNumber,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            brokerId: invoice.brokerId,
            title: titles[stage],
            description: `تأیید توسط ${by.name || by}`,
            amount: invoice.sale.total,
            siteShare: invoice.profit.siteShare,
            brokerShare: invoice.profit.brokerShare,
            actor: { role: stage, name: by.name || by, id: by.id || null },
            tags: ['تأیید', stage],
            important: true
        });
    }

    function logInvoiceRejected(invoice, by, role, reason) {
        return logEvent(CONFIG.eventTypes.INVOICE_REJECTED, {
            role,
            reason
        }, {
            caseId: invoice.caseId,
            caseNumber: invoice.caseNumber,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            brokerId: invoice.brokerId,
            title: `رد فاکتور ${invoice.invoiceNumber}`,
            description: `دلیل: ${reason}`,
            status: 'rejected',
            actor: { role, name: by.name || by, id: by.id || null },
            tags: ['رد', role],
            important: true
        });
    }

    function logContractCreated(contract) {
        const typeLabel = contract.type === 'purchase' ? 'خرید' : 'فروش';
        return logEvent(CONFIG.eventTypes.CONTRACT_CREATED, {
            type: contract.type,
            contractNumber: contract.contractNumber
        }, {
            caseId: contract.caseId,
            caseNumber: contract.caseNumber,
            contractId: contract.id,
            contractNumber: contract.contractNumber,
            invoiceId: contract.invoiceId,
            invoiceNumber: contract.invoiceNumber,
            brokerId: contract.brokerId,
            title: `ایجاد قرارداد ${typeLabel} ${contract.contractNumber}`,
            tags: ['قرارداد', typeLabel]
        });
    }

    function logContractSigned(contract, signer, role) {
        const types = {
            broker: CONFIG.eventTypes.CONTRACT_SIGNED_BROKER,
            applicant: CONFIG.eventTypes.CONTRACT_SIGNED_APPLICANT,
            superAdmin: CONFIG.eventTypes.CONTRACT_SIGNED_SUPER_ADMIN,
            legalAdmin: CONFIG.eventTypes.CONTRACT_SIGNED_LEGAL
        };
        const titles = {
            broker: 'امضای قرارداد توسط کارگزار',
            applicant: 'امضای قرارداد توسط متقاضی',
            superAdmin: 'امضای قرارداد توسط مدیر کل',
            legalAdmin: 'امضای قرارداد توسط حقوقی'
        };

        return logEvent(types[role], {
            signerRole: role,
            contractNumber: contract.contractNumber
        }, {
            caseId: contract.caseId,
            caseNumber: contract.caseNumber,
            contractId: contract.id,
            contractNumber: contract.contractNumber,
            invoiceId: contract.invoiceId,
            brokerId: contract.brokerId,
            title: `${titles[role]} ${contract.contractNumber}`,
            actor: { role, name: signer.name || signer, id: signer.id || null },
            tags: ['امضا', role],
            important: true
        });
    }

    function logPayment(caseId, caseNumber, amount, breakdown, status = 'completed') {
        const typeMap = {
            initiated: CONFIG.eventTypes.PAYMENT_INITIATED,
            escrow: CONFIG.eventTypes.PAYMENT_IN_ESCROW,
            released: CONFIG.eventTypes.PAYMENT_RELEASED,
            refunded: CONFIG.eventTypes.PAYMENT_REFUNDED
        };
        const titleMap = {
            initiated: 'شروع پرداخت',
            escrow: 'پرداخت در امانت',
            released: 'آزادسازی وجه',
            refunded: 'بازگشت وجه'
        };

        return logEvent(typeMap[status] || CONFIG.eventTypes.PAYMENT_INITIATED, {
            breakdown
        }, {
            caseId,
            caseNumber,
            title: `${titleMap[status]} — ${caseNumber}`,
            amount,
            siteShare: breakdown?.siteShare || 0,
            brokerShare: breakdown?.brokerShare || 0,
            tags: ['پرداخت', status],
            important: true
        });
    }

    function logWalletCredit(userId, userName, amount, reason) {
        return logEvent(CONFIG.eventTypes.WALLET_CREDITED, {
            reason
        }, {
            userId,
            title: `واریز ${faPrice(amount)} تومان به کیف پول`,
            description: `کاربر: ${userName} — دلیل: ${reason}`,
            amount,
            tags: ['کیف پول', 'واریز'],
            important: true
        });
    }

    function logPriceAdjustment(invoice, oldPrices, newPrices, by, reason) {
        return logEvent(CONFIG.eventTypes.PRICE_ADJUSTED, {
            oldPrices,
            newPrices,
            reason
        }, {
            caseId: invoice.caseId,
            caseNumber: invoice.caseNumber,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            title: `تنظیم قیمت فاکتور ${invoice.invoiceNumber}`,
            description: `خرید: ${faPrice(oldPrices.purchase)} → ${faPrice(newPrices.purchase)} | فروش: ${faPrice(oldPrices.sale)} → ${faPrice(newPrices.sale)}`,
            actor: { role: 'accounting_admin', name: by.name || by, id: by.id || null },
            tags: ['تنظیم', 'قیمت'],
            important: true
        });
    }

    function logFinancialNote(title, description, options = {}) {
        return logEvent(CONFIG.eventTypes.FINANCIAL_NOTE, {}, {
            ...options,
            title,
            description,
            tags: ['یادداشت', ...(options.tags || [])]
        });
    }

    // ============================================================
    //  📤  Export
    // ============================================================

    function exportJSON(filters = {}) {
        const logs = query({ ...filters, page: 1, perPage: 999999 }).logs;
        return JSON.stringify({
            exportedAt: nowISO(),
            count: logs.length,
            filters,
            logs
        }, null, 2);
    }

    function exportCSV(filters = {}) {
        const logs = query({ ...filters, page: 1, perPage: 999999 }).logs;
        const headers = ['تاریخ', 'نوع رویداد', 'عنوان', 'کاربر', 'مبلغ', 'سهم سایت', 'سهم کارگزار', 'شماره پرونده', 'شماره قرارداد'];
        const rows = logs.map(l => [
            formatShamsiDate(l.at),
            l.eventType,
            l.title || '',
            l.actor?.name || '',
            l.amounts?.amount || 0,
            l.amounts?.siteShare || 0,
            l.amounts?.brokerShare || 0,
            l.caseNumber || '',
            l.contractNumber || ''
        ]);
        // BOM برای نمایش درست فارسی در Excel
        const bom = '\uFEFF';
        const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        return bom + csv;
    }

    function downloadExport(format = 'json', filters = {}) {
        const content = format === 'csv' ? exportCSV(filters) : exportJSON(filters);
        const mime = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';
        const ext = format === 'csv' ? 'csv' : 'json';
        const filename = `wampay-financial-log-${Date.now()}.${ext}`;

        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        console.log('📥 [FinancialLog] Export:', filename);
        return filename;
    }

    // ============================================================
    //  🧹  پاک‌سازی
    // ============================================================

    function clearOldLogs(beforeDate) {
        const cutoff = new Date(beforeDate).getTime();
        const logs = getAllLogs();
        const kept = logs.filter(l => l.timestamp >= cutoff);
        const removed = logs.length - kept.length;

        saveLogs(kept);
        console.log(`🧹 [FinancialLog] ${removed} لاگ قدیمی حذف شد`);
        return { removed, kept: kept.length };
    }

    function clearAll() {
        if (!confirm('⚠️ حذف تمام لاگ‌های مالی؟ این عملیات قابل بازگشت نیست!')) {
            return { ok: false, cancelled: true };
        }
        localStorage.removeItem(STORAGE_KEYS.logs);
        localStorage.removeItem(STORAGE_KEYS.archive);
        localStorage.removeItem(STORAGE_KEYS.meta);
        console.log('🗑️ [FinancialLog] تمام لاگ‌ها پاک شد');
        return { ok: true };
    }

    // ============================================================
    //  🧪  Debug
    // ============================================================

    function dump() {
        return {
            logs: getAllLogs(),
            archived: getArchivedLogs(),
            meta: getMeta(),
            statistics: getStatistics()
        };
    }

    // ============================================================
    //  📤  Export
    // ============================================================

    global.WamPayFinancialLog = {
        // Config
        CONFIG,
        EVENT_TYPES: CONFIG.eventTypes,
        CATEGORIES: CONFIG.categories,

        // Core
        logEvent,
        getLogById,
        query,
        getRecentLogs,
        getImportantLogs,
        getLogsByCase,
        getLogsByContract,

        // Helper Methods
        logInvoiceCreated,
        logInvoiceApproved,
        logInvoiceRejected,
        logContractCreated,
        logContractSigned,
        logPayment,
        logWalletCredit,
        logPriceAdjustment,
        logFinancialNote,

        // Statistics
        getStatistics,
        getDailyReport,
        getMonthlyReport,

        // Export
        exportJSON,
        exportCSV,
        downloadExport,

        // Maintenance
        clearOldLogs,
        clearAll,

        // Utilities
        formatDate: formatShamsiDate,
        formatPrice: faPrice,
        formatNumber: faNum,

        // Debug
        _dump: dump
    };

    console.log('%c📊 WAM PAY — Financial Log Service v1.0', 'color:#0b3b23;font-weight:bold;font-size:13px;');
    console.log('%c💰 ثبت تمام رویدادهای مالی | 📈 آمار و تحلیل | 📥 Export', 'color:#d4a62a;font-weight:bold;');

})(typeof window !== 'undefined' ? window : this);