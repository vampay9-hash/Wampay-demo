// ==========================================
// وام پی — Trust Service v1.1
// سرویس امانت‌داری و مدیریت وجوه
// ==========================================
// 🆕 v1.1:
//   - درصد کارمزد سایت قابل تنظیم توسط مدیر کل
//   - توافق پویا با کارگزار (کمتر یا بیشتر از پیش‌فرض)
//   - لاگ تغییرات درصد کارمزد
// ==========================================

(function () {
    'use strict';

    // ==========================================
    // ⚙️ کلیدها و تنظیمات
    // ==========================================
    const STORAGE_KEY = 'wamPayTrustDeposits';
    const TXN_KEY = 'wamPayTrustTransactions';
    const CHAIN_KEY = 'wamPayTrustChain';
    const FEE_HISTORY_KEY = 'wamPayServiceFeeHistory';    // 🆕 لاگ تغییرات درصد

    const CONFIG = {
        // 🆕 درصد پیش‌فرض سامانه (قابل تغییر توسط مدیر کل در هر پرونده)
        defaultServiceFeePercent: 0.03,        // ۳٪
        minServiceFeePercent: 0.005,           // حداقل ۰.۵٪ (برای VIP)
        maxServiceFeePercent: 0.10,            // حداکثر ۱۰٪ (سقف قانونی)
        
        defaultChargePercent: 0.20,            // ۲۰٪ پیش‌فرض (اگر کارگزار تعیین نکرده)
        currency: 'IRT',
        currencyLabel: 'تومان',
        trusteeName: 'سامانه‌ی هوشمند تسهیلات وام‌پی',
        trusteeShortName: 'وام‌پی',
        bankAccount: 'IR-XX-BANK-0000-0000-0000-0000'
    };

    // ==========================================
    // 🛠️ توابع کمکی
    // ==========================================
    function uid(prefix) {
        return (prefix || 'id_') + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function nowISO() { return new Date().toISOString(); }

    async function sha256(text) {
        try {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (_) {
            let h = 0;
            for (let i = 0; i < text.length; i++) h = ((h << 5) - h) + text.charCodeAt(i);
            return 'fb' + Math.abs(h).toString(16).padStart(62, '0');
        }
    }

    function loadJSON(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            return JSON.parse(raw);
        } catch (_) { return fallback; }
    }

    function saveJSON(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('❌ خطا در ذخیره:', e);
            return false;
        }
    }

    function getAllDeposits() { return loadJSON(STORAGE_KEY, []); }
    function saveDeposits(arr) { return saveJSON(STORAGE_KEY, arr); }

    function getAllTransactions() { return loadJSON(TXN_KEY, []); }
    function saveTransactions(arr) { return saveJSON(TXN_KEY, arr); }

    function getAllChain() { return loadJSON(CHAIN_KEY, []); }
    function saveChain(arr) { return saveJSON(CHAIN_KEY, arr); }

    function getAllFeeHistory() { return loadJSON(FEE_HISTORY_KEY, []); }
    function saveFeeHistory(arr) { return saveJSON(FEE_HISTORY_KEY, arr); }

    // ==========================================
    // 💰 محاسبه‌ی مالی (به‌روزشده — پشتیبانی از درصد پویا)
    // ==========================================
    /**
     * محاسبه‌ی سهم سایت و کارگزار
     * @param {number} loanAmount - مبلغ کل وام
     * @param {number} [totalCharge] - هزینه‌ی کل پرداختی متقاضی (اختیاری)
     * @param {number} [customFeePercent] - 🆕 درصد توافقی سامانه (اختیاری)
     * @returns {object}
     */
    function computeCharges(loanAmount, totalCharge, customFeePercent) {
        const loan = Number(loanAmount) || 0;
        const charge = Number(totalCharge) || Math.round(loan * CONFIG.defaultChargePercent);

        // 🆕 تعیین درصد نهایی
        let feePercent = CONFIG.defaultServiceFeePercent;
        let isCustom = false;

        if (customFeePercent !== undefined && customFeePercent !== null) {
            const fp = Number(customFeePercent);
            if (!isNaN(fp) && fp >= CONFIG.minServiceFeePercent && fp <= CONFIG.maxServiceFeePercent) {
                feePercent = fp;
                isCustom = (fp !== CONFIG.defaultServiceFeePercent);
            }
        }

        const serviceFee = Math.round(loan * feePercent);
        const brokerAmount = Math.max(0, charge - serviceFee);

        return {
            loanAmount: loan,
            totalCharge: charge,
            serviceFee: serviceFee,
            serviceFeePercent: feePercent,
            serviceFeePercentDisplay: (feePercent * 100).toFixed(2).replace(/\.?0+$/, '') + '٪',
            defaultFeePercent: CONFIG.defaultServiceFeePercent,
            isCustomFee: isCustom,
            brokerAmount: brokerAmount,
            currency: CONFIG.currency,
            currencyLabel: CONFIG.currencyLabel
        };
    }

    // ==========================================
    // 🆕 مدیریت درصد کارمزد
    // ==========================================
    /**
     * ثبت تغییر درصد کارمزد توسط مدیر کل
     * @param {object} params
     */
    async function recordFeeChange(params) {
        const {
            applicationId,
            loanAmount,
            oldPercent,
            newPercent,
            superAdminName,
            reason
        } = params;

        const now = nowISO();
        const entry = {
            id: uid('fee_'),
            applicationId,
            loanAmount,
            oldPercent,
            oldPercentDisplay: (oldPercent * 100).toFixed(2).replace(/\.?0+$/, '') + '٪',
            newPercent,
            newPercentDisplay: (newPercent * 100).toFixed(2).replace(/\.?0+$/, '') + '٪',
            superAdminName: superAdminName || 'جناب آقای پاکذاتی',
            reason: reason || 'توافق با کارگزار',
            at: now,
            hash: await sha256(JSON.stringify({
                applicationId, oldPercent, newPercent, at: now
            }))
        };

        const history = getAllFeeHistory();
        history.push(entry);
        saveFeeHistory(history);

        console.log('✅ تغییر درصد کارمزد ثبت شد:', entry);
        return entry;
    }

    function getFeeHistory(applicationId) {
        return getAllFeeHistory().filter(h => h.applicationId === applicationId);
    }

    /**
     * اعتبارسنجی درصد پیشنهادی
     */
    function validateFeePercent(percent) {
        const p = Number(percent);
        if (isNaN(p)) return { ok: false, error: 'عدد نامعتبر' };
        if (p < CONFIG.minServiceFeePercent) {
            return { ok: false, error: `حداقل ${(CONFIG.minServiceFeePercent * 100)}٪ مجاز است` };
        }
        if (p > CONFIG.maxServiceFeePercent) {
            return { ok: false, error: `حداکثر ${(CONFIG.maxServiceFeePercent * 100)}٪ مجاز است` };
        }
        return { ok: true, value: p };
    }

    // ==========================================
    // 📝 صدور سند امانت
    // ==========================================
    async function generateTrustDeedNumber() {
        const year = new Date().getFullYear();
        const rand = String(Math.floor(1000 + Math.random() * 9000));
        return `AMN-${year}-${rand}`;
    }

    async function generateDeedHash(deedData) {
        const content = JSON.stringify({
            deedNumber: deedData.deedNumber,
            userId: deedData.userId,
            applicationId: deedData.applicationId,
            contractId: deedData.contractId,
            amount: deedData.amount,
            issuedAt: deedData.issuedAt
        });
        return await sha256(content);
    }

    // ==========================================
    // 🏦 ثبت امانت جدید (شارژ)
    // ==========================================
    async function createTrustDeposit(params) {
        const {
            userId, userName, mobile,
            applicationId, contractId,
            amount, charges,
            customFeePercent,               // 🆕 درصد توافقی (اختیاری)
            purpose = 'service_fee',
            gatewayRef = null,
            invoiceNumber = null
        } = params;

        if (!userId || !applicationId || !amount) {
            throw new Error('پارامترهای الزامی موجود نیست');
        }

        const now = nowISO();
        const deedNumber = await generateTrustDeedNumber();

        const deedHash = await generateDeedHash({
            deedNumber, userId, applicationId, contractId,
            amount, issuedAt: now
        });

        // محاسبه‌ی charges با درصد توافقی (اگر داده شده)
        const finalCharges = charges || computeCharges(0, amount, customFeePercent);

        const deposit = {
            id: uid('trust_'),
            userId,
            userName,
            mobile,
            applicationId,
            contractId,
            amount,
            purpose,
            status: 'held',

            charges: finalCharges,

            deed: {
                deedNumber,
                deedHash,
                issuedAt: now,
                trusteeName: CONFIG.trusteeName,
                bankAccount: CONFIG.bankAccount,
                legalBasis: 'ماده ۶۱۴ قانون مدنی ایران'
            },

            invoice: {
                invoiceNumber: invoiceNumber || `INV-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`,
                gatewayRef,
                paidAt: now
            },

            createdAt: now,
            updatedAt: now
        };

        const all = getAllDeposits();
        all.push(deposit);
        saveDeposits(all);

        await logTransaction({
            walletId: userId,
            type: 'trust_deposit',
            amount,
            relatedApplicationId: applicationId,
            relatedContractId: contractId,
            relatedDepositId: deposit.id,
            status: 'completed',
            note: `ثبت امانت با سند ${deedNumber} — کارمزد سایت: ${finalCharges.serviceFeePercentDisplay}`
        });

        await appendToChain({
            applicationId,
            actor: 'applicant',
            actorId: userId,
            actorName: userName,
            action: 'trust_deposit',
            amount,
            at: now,
            depositId: deposit.id
        });

        console.log('✅ امانت ثبت شد:', {
            id: deposit.id,
            deedNumber,
            amount,
            serviceFeePercent: finalCharges.serviceFeePercentDisplay,
            serviceFee: finalCharges.serviceFee,
            brokerAmount: finalCharges.brokerAmount
        });

        return deposit;
    }

    // ==========================================
    // 🔍 بازیابی امانت‌ها
    // ==========================================
    function getTrustDeposit(id) {
        return getAllDeposits().find(d => d.id === id) || null;
    }

    function getTrustDepositsByUser(userId) {
        return getAllDeposits().filter(d => d.userId === userId);
    }

    function getTrustDepositsByApp(applicationId) {
        return getAllDeposits().filter(d => d.applicationId === applicationId);
    }

    function getActiveDepositForApp(applicationId) {
        const all = getAllDeposits().filter(d => d.applicationId === applicationId);
        return all.find(d => d.status === 'held') || all[all.length - 1] || null;
    }

    // ==========================================
    // 📝 به‌روزرسانی امانت
    // ==========================================
    async function updateTrustDeposit(id, updates) {
        const all = getAllDeposits();
        const idx = all.findIndex(d => d.id === id);
        if (idx === -1) return null;

        all[idx] = Object.assign({}, all[idx], updates, { updatedAt: nowISO() });
        saveDeposits(all);
        return all[idx];
    }

    /**
     * 🆕 به‌روزرسانی درصد کارمزد یک امانت موجود (قبل از آزادسازی)
     */
    async function updateDepositFeePercent(depositId, newPercent, superAdminName, reason) {
        const deposit = getTrustDeposit(depositId);
        if (!deposit) throw new Error('امانت یافت نشد');
        if (deposit.status !== 'held') throw new Error('این امانت قابل تغییر نیست');

        const validation = validateFeePercent(newPercent);
        if (!validation.ok) throw new Error(validation.error);

        const oldPercent = deposit.charges.serviceFeePercent;
        
        // محاسبه‌ی مجدد
        const newCharges = computeCharges(
            deposit.charges.loanAmount,
            deposit.charges.totalCharge,
            newPercent
        );

        deposit.charges = newCharges;
        
        // لاگ تغییر
        await recordFeeChange({
            applicationId: deposit.applicationId,
            loanAmount: deposit.charges.loanAmount,
            oldPercent,
            newPercent,
            superAdminName,
            reason
        });

        await updateTrustDeposit(deposit.id, deposit);

        console.log('✅ درصد کارمزد به‌روزرسانی شد:', {
            depositId: deposit.id,
            oldPercent: (oldPercent * 100) + '%',
            newPercent: (newPercent * 100) + '%',
            newServiceFee: newCharges.serviceFee,
            newBrokerAmount: newCharges.brokerAmount
        });

        return deposit;
    }

    // ==========================================
    // 🚀 آزادسازی وجه به کارگزار
    // ==========================================
    async function releaseToBroker(depositId, brokerInfo, superAdminName) {
        const deposit = getTrustDeposit(depositId);
        if (!deposit) throw new Error('امانت یافت نشد');
        if (deposit.status !== 'held') throw new Error('این امانت قبلاً تسویه شده است');

        const now = nowISO();
        const charges = deposit.charges || computeCharges(0, deposit.amount);

        deposit.status = 'released';
        deposit.release = {
            action: 'to_broker',
            releasedAt: now,
            releasedBy: 'super_admin',
            superAdminName: superAdminName || 'جناب آقای پاکذاتی',
            broker: {
                brokerId: brokerInfo.brokerId,
                brokerName: brokerInfo.brokerName,
                brokerCode: brokerInfo.brokerCode
            },
            breakdown: {
                totalHeld: deposit.amount,
                serviceFee: charges.serviceFee,
                serviceFeePercent: charges.serviceFeePercentDisplay,
                brokerAmount: charges.brokerAmount,
                currency: CONFIG.currencyLabel
            },
            transactionId: uid('txn_release_')
        };

        await updateTrustDeposit(deposit.id, deposit);

        await logTransaction({
            walletId: brokerInfo.brokerId,
            type: 'trust_release_to_broker',
            amount: charges.brokerAmount,
            relatedApplicationId: deposit.applicationId,
            relatedContractId: deposit.contractId,
            relatedDepositId: deposit.id,
            status: 'completed',
            note: `آزادسازی به کارگزار — کارمزد سایت ${charges.serviceFeePercentDisplay}`
        });

        await logTransaction({
            walletId: 'wampay_system',
            type: 'service_fee',
            amount: charges.serviceFee,
            relatedApplicationId: deposit.applicationId,
            relatedContractId: deposit.contractId,
            relatedDepositId: deposit.id,
            status: 'completed',
            note: `هزینه خدمات سایت — ${charges.serviceFeePercentDisplay} مبلغ وام`
        });

        await appendToChain({
            applicationId: deposit.applicationId,
            actor: 'super_admin',
            actorName: superAdminName || 'جناب آقای پاکذاتی',
            action: 'release_to_broker',
            amount: charges.brokerAmount,
            at: now,
            depositId: deposit.id
        });

        console.log('✅ آزادسازی به کارگزار:', {
            depositId: deposit.id,
            brokerAmount: charges.brokerAmount,
            serviceFee: charges.serviceFee,
            serviceFeePercent: charges.serviceFeePercentDisplay
        });

        return deposit;
    }

    // ==========================================
    // ↩️ عودت وجه به متقاضی
    // ==========================================
    async function refundToApplicant(depositId, reason, superAdminName) {
        const deposit = getTrustDeposit(depositId);
        if (!deposit) throw new Error('امانت یافت نشد');
        if (deposit.status !== 'held') throw new Error('این امانت قبلاً تسویه شده است');

        const now = nowISO();

        deposit.status = 'refunded';
        deposit.refund = {
            action: 'to_applicant',
            refundedAt: now,
            refundedBy: 'super_admin',
            superAdminName: superAdminName || 'جناب آقای پاکذاتی',
            reason: reason || 'عودت به دلیل عدم ایفای تعهد کارگزار',
            transactionId: uid('txn_refund_')
        };

        await updateTrustDeposit(deposit.id, deposit);

        await logTransaction({
            walletId: deposit.userId,
            type: 'trust_refund_to_applicant',
            amount: deposit.amount,
            relatedApplicationId: deposit.applicationId,
            relatedContractId: deposit.contractId,
            relatedDepositId: deposit.id,
            status: 'completed',
            note: `عودت وجه امانی — ${reason}`
        });

        await appendToChain({
            applicationId: deposit.applicationId,
            actor: 'super_admin',
            actorName: superAdminName || 'جناب آقای پاکذاتی',
            action: 'refund_to_applicant',
            amount: deposit.amount,
            at: now,
            depositId: deposit.id
        });

        console.log('↩️ عودت به متقاضی:', { depositId: deposit.id, amount: deposit.amount });
        return deposit;
    }

    // ==========================================
    // 📊 دفتر تراکنش‌ها
    // ==========================================
    async function logTransaction(data) {
        const txn = {
            id: uid('txn_'),
            walletId: data.walletId,
            type: data.type,
            amount: data.amount,
            currency: CONFIG.currencyLabel,
            relatedApplicationId: data.relatedApplicationId,
            relatedContractId: data.relatedContractId,
            relatedDepositId: data.relatedDepositId,
            status: data.status || 'completed',
            note: data.note || '',
            createdAt: nowISO()
        };
        const all = getAllTransactions();
        all.push(txn);
        saveTransactions(all);
        return txn;
    }

    function getTransactionsByDeposit(depositId) {
        return getAllTransactions().filter(t => t.relatedDepositId === depositId);
    }

    function getTransactionsByUser(userId) {
        return getAllTransactions().filter(t => t.walletId === userId);
    }

    // ==========================================
    // 🔐 زنجیره‌ی اعتماد
    // ==========================================
    async function appendToChain(entry) {
        const chain = getAllChain();
        const prevHash = chain.length > 0 ? chain[chain.length - 1].hash : '0'.repeat(64);

        const content = JSON.stringify({
            applicationId: entry.applicationId,
            actor: entry.actor,
            action: entry.action,
            amount: entry.amount || 0,
            at: entry.at,
            prevHash
        });
        const hash = await sha256(content);

        const block = {
            id: uid('chain_'),
            index: chain.length,
            applicationId: entry.applicationId,
            actor: entry.actor,
            actorId: entry.actorId || null,
            actorName: entry.actorName || null,
            action: entry.action,
            amount: entry.amount || 0,
            at: entry.at,
            depositId: entry.depositId || null,
            prevHash,
            hash
        };
        chain.push(block);
        saveChain(chain);
        return block;
    }

    function getChainByApp(applicationId) {
        return getAllChain().filter(b => b.applicationId === applicationId);
    }

    function verifyChain(applicationId) {
        const chain = getChainByApp(applicationId);
        if (chain.length === 0) return { ok: true, length: 0 };
        for (let i = 1; i < chain.length; i++) {
            if (chain[i].prevHash !== chain[i - 1].hash) {
                return { ok: false, error: `زنجیره در بلوک ${i} شکسته شده` };
            }
        }
        return { ok: true, length: chain.length };
    }

    // ==========================================
    // 🧹 ابزارهای UI
    // ==========================================
    function getDepositSummary(depositId) {
        const d = getTrustDeposit(depositId);
        if (!d) return null;
        const charges = d.charges || computeCharges(0, d.amount);
        return {
            id: d.id,
            deedNumber: d.deed.deedNumber,
            deedHash: d.deed.deedHash,
            status: d.status,
            amount: d.amount,
            totalCharge: charges.totalCharge,
            serviceFee: charges.serviceFee,
            serviceFeePercent: charges.serviceFeePercentDisplay,
            isCustomFee: charges.isCustomFee || false,
            brokerAmount: charges.brokerAmount,
            currency: CONFIG.currencyLabel,
            issuedAt: d.deed.issuedAt,
            invoiceNumber: d.invoice.invoiceNumber
        };
    }

    function formatAmount(n) {
        if (!n && n !== 0) return '۰';
        const fa = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
        return String(n).replace(/\d/g, d => fa[+d]).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    // ==========================================
    // 🌐 API عمومی
    // ==========================================
    window.WamPayTrust = {
        // Config
        CONFIG,

        // Utils
        formatAmount,
        uid,
        nowISO,
        sha256,

        // Charges
        computeCharges,

        // 🆕 Fee Management
        validateFeePercent,
        recordFeeChange,
        getFeeHistory,
        updateDepositFeePercent,

        // Deposits
        createTrustDeposit,
        getTrustDeposit,
        getTrustDepositsByUser,
        getTrustDepositsByApp,
        getActiveDepositForApp,
        updateTrustDeposit,
        getDepositSummary,

        // Actions
        releaseToBroker,
        refundToApplicant,

        // Transactions
        logTransaction,
        getTransactionsByDeposit,
        getTransactionsByUser,

        // Trust Chain
        appendToChain,
        getChainByApp,
        verifyChain,

        // Debug
        _dump: function () {
            return {
                deposits: getAllDeposits(),
                transactions: getAllTransactions(),
                chain: getAllChain(),
                feeHistory: getAllFeeHistory()
            };
        },
        _reset: function () {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(TXN_KEY);
            localStorage.removeItem(CHAIN_KEY);
            localStorage.removeItem(FEE_HISTORY_KEY);
            console.log('🧹 داده‌های امانت‌داری پاک شد');
        }
    };

    console.log('🏛️ WamPayTrust v1.1 آماده — با پشتیبانی از کارمزد پویا');
})();