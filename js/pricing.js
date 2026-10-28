// ==========================================
// وام پی — Shared Modules
// فایل: pricing.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: قیمت‌گذاری و محاسبه پورسانت کارگزار — نرخ‌های پویا
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION   = '1.0.0';
    var ROOT_ATTR = 'data-pricing-root';
    var RULES_KEY = 'wamPayPricingRules';
    var SIMS_KEY  = 'wamPayPricingSims';

    var COMMISSION_TYPES = {
        PERCENT:  'percent',    // درصد از مبلغ وام
        FIXED:    'fixed',      // مبلغ ثابت
        TIERED:   'tiered'      // پله‌ای
    };

    var COMMISSION_LABELS = {
        percent: 'درصد از مبلغ',
        fixed:   'مبلغ ثابت',
        tiered:  'پله‌ای'
    };

    var BROKER_LEVELS = {
        bronze:   'برنز',
        silver:   'نقره‌ای',
        gold:     'طلایی',
        platinum: 'پلاتینیوم'
    };

    var DEFAULT_RULES = [
        {
            id: 'rule_default',
            name: 'پورسانت پیش‌فرض',
            type: 'percent',
            value: 1,
            minAmount: 0,
            maxAmount: 0,
            brokerLevel: null,
            bank: null,
            active: true,
            priority: 0,
            createdAt: Date.now()
        },
        {
            id: 'rule_bronze',
            name: 'برنز - پله‌ای',
            type: 'tiered',
            tiers: [
                { max: 100000000,  rate: 0.5 },
                { max: 500000000,  rate: 0.8 },
                { max: 0,          rate: 1.2 }   // 0 = بی‌نهایت
            ],
            minAmount: 0,
            maxAmount: 0,
            brokerLevel: 'bronze',
            bank: null,
            active: true,
            priority: 10,
            createdAt: Date.now()
        },
        {
            id: 'rule_silver',
            name: 'نقره‌ای - پله‌ای',
            type: 'tiered',
            tiers: [
                { max: 100000000,  rate: 0.7 },
                { max: 500000000,  rate: 1.0 },
                { max: 0,          rate: 1.5 }
            ],
            minAmount: 0,
            maxAmount: 0,
            brokerLevel: 'silver',
            bank: null,
            active: true,
            priority: 20,
            createdAt: Date.now()
        },
        {
            id: 'rule_gold',
            name: 'طلایی - پله‌ای',
            type: 'tiered',
            tiers: [
                { max: 100000000,  rate: 1.0 },
                { max: 500000000,  rate: 1.3 },
                { max: 0,          rate: 1.8 }
            ],
            minAmount: 0,
            maxAmount: 0,
            brokerLevel: 'gold',
            bank: null,
            active: true,
            priority: 30,
            createdAt: Date.now()
        },
        {
            id: 'rule_platinum',
            name: 'پلاتینیوم - پله‌ای',
            type: 'tiered',
            tiers: [
                { max: 100000000,  rate: 1.3 },
                { max: 500000000,  rate: 1.6 },
                { max: 0,          rate: 2.2 }
            ],
            minAmount: 0,
            maxAmount: 0,
            brokerLevel: 'platinum',
            bank: null,
            active: true,
            priority: 40,
            createdAt: Date.now()
        }
    ];

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        role: null,
        userId: null,
        rules: [],
        simulations: [],
        selectedRuleId: null,
        lastSimulation: null,
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var PricingEvents = {
        LOADED:         'pricing.loaded',
        RULES_LOADED:   'pricing.rules_loaded',
        RULE_CREATED:   'pricing.rule_created',
        RULE_UPDATED:   'pricing.rule_updated',
        RULE_DELETED:   'pricing.rule_deleted',
        RULE_TOGGLED:   'pricing.rule_toggled',
        COMMISSION_CALC:'pricing.commission_calculated',
        SIMULATION_RUN: 'pricing.simulation_run',
        SIMULATION_SAVED:'pricing.simulation_saved',
        SIMULATION_DELETED:'pricing.simulation_deleted',
        RESET:          'pricing.reset',
        RENDERED:       'pricing.rendered'
    };

    function _emit(name, data) {
        if (typeof EventBus !== 'undefined') {
            try { EventBus.emit(name, data); } catch (e) { /* بی‌صدا */ }
        }
        for (var i = 0; i < STATE.listeners.length; i++) {
            try { STATE.listeners[i](name, data); } catch (e) { /* بی‌صدا */ }
        }
    }

    // ─────────────────────────────────────
    // 🔍 کمکی‌ها
    // ─────────────────────────────────────
    function _esc(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _fa(n) {
        var s = String(n === null || n === undefined ? 0 : n);
        return s.replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _amt(n) {
        if (n === null || n === undefined || n === '') return '۰';
        var x = Number(n);
        if (isNaN(x)) return '۰';
        var sign = x < 0 ? '−' : '';
        x = Math.abs(x);
        var f = Math.round(x).toLocaleString('en-US');
        return sign + f.replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _pct(n) {
        if (n === null || n === undefined) return '—';
        var x = Number(n);
        if (isNaN(x)) return '—';
        return _fa(Math.round(x * 100) / 100) + '٪';
    }

    function _en(s) {
        if (typeof WamPersianDate !== 'undefined' && WamPersianDate.toEnglishDigits) {
            return WamPersianDate.toEnglishDigits(s);
        }
        return String(s || '').replace(/[۰-۹]/g, function (d) {
            return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
        });
    }

    function _jalali(ts) {
        if (!ts) return '—';
        try {
            if (typeof WamPersianDate !== 'undefined') {
                var d = new Date(ts);
                var j = WamPersianDate.dateToJalali(d);
                if (j) return WamPersianDate.format(j.jy, j.jm, j.jd, 'YYYY/MM/DD');
            }
        } catch (e) { /* بی‌صدا */ }
        return new Date(ts).toLocaleDateString('fa-IR');
    }

    function _uid() {
        if (typeof WamPermissions === 'undefined') return null;
        var me = WamPermissions.getCurrentUser();
        return me ? me.id : null;
    }

    function _user() {
        if (typeof WamPermissions === 'undefined') return null;
        return WamPermissions.getCurrentUser();
    }

    function _genId(prefix) {
        var r = Math.random().toString(36).slice(2, 8);
        return (prefix || 'rule') + '_' + Date.now().toString(36) + '_' + r;
    }

    function _toast(type, msg, title) {
        if (typeof WamUI === 'undefined') return;
        if (type === 'success' && WamUI.toastSuccess) WamUI.toastSuccess(msg, title || 'موفق');
        else if (type === 'error' && WamUI.toastError) WamUI.toastError(msg, title || 'خطا');
        else if (type === 'warning' && WamUI.toastWarning) WamUI.toastWarning(msg, title || 'توجه');
        else if (type === 'info' && WamUI.toastInfo) WamUI.toastInfo(msg, title || 'اطلاع');
    }

    // ─────────────────────────────────────
    // 💾 بارگذاری / ذخیره قوانین
    // ─────────────────────────────────────
    function _loadRules() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(RULES_KEY, null);
        if (!Array.isArray(arr) || arr.length === 0) {
            // ایجاد قوانین پیش‌فرض
            var defaults = JSON.parse(JSON.stringify(DEFAULT_RULES));
            Storage.setJSON(RULES_KEY, defaults);
            return defaults;
        }
        return arr;
    }

    function _saveRules(list) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(RULES_KEY, list);
    }

    function _findRule(id) {
        for (var i = 0; i < STATE.rules.length; i++) {
            if (STATE.rules[i] && STATE.rules[i].id === id) return STATE.rules[i];
        }
        return null;
    }

    function _persistRule(rule) {
        var all = _loadRules();
        var found = false;
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].id === rule.id) {
                all[i] = rule;
                found = true;
                break;
            }
        }
        if (!found) all.push(rule);
        return _saveRules(all);
    }

    // ─────────────────────────────────────
    // 🧮 محاسبه پورسانت
    // ─────────────────────────────────────
    function calculateCommission(amount, options) {
        options = options || {};
        var amt = Number(_en(amount)) || 0;
        var brokerLevel = options.brokerLevel || null;
        var bank = options.bank || null;
        var brokerId = options.brokerId || null;
        var appliedRules = [];

        if (amt <= 0) {
            return {
                ok: false,
                reason: 'invalid_amount',
                amount: amt,
                commission: 0,
                rate: 0,
                appliedRule: null
            };
        }

        // فیلتر قوانین فعال
        var candidates = [];
        for (var i = 0; i < STATE.rules.length; i++) {
            var r = STATE.rules[i];
            if (!r || r.active === false) continue;

            // محدوده مبلغ
            if (r.minAmount && amt < r.minAmount) continue;
            if (r.maxAmount && amt > r.maxAmount) continue;

            // سطح کارگزار
            if (r.brokerLevel && brokerLevel && r.brokerLevel !== brokerLevel) continue;
            if (r.brokerLevel && !brokerLevel) continue;

            // بانک
            if (r.bank && bank && r.bank !== bank) continue;
            if (r.bank && !bank) continue;

            candidates.push(r);
        }

        // مرتب‌سازی بر اساس priority (بالاتر = مهم‌تر)
        candidates.sort(function (a, b) {
            return (b.priority || 0) - (a.priority || 0);
        });

        var selectedRule = candidates[0] || null;
        var commission = 0;
        var rate = 0;

        if (selectedRule) {
            if (selectedRule.type === 'percent') {
                rate = Number(selectedRule.value) || 0;
                commission = amt * (rate / 100);
            } else if (selectedRule.type === 'fixed') {
                commission = Number(selectedRule.value) || 0;
                rate = (commission / amt) * 100;
            } else if (selectedRule.type === 'tiered') {
                var tiers = Array.isArray(selectedRule.tiers)
                    ? selectedRule.tiers : [];
                // مرتب‌سازی پله‌ها
                tiers.sort(function (a, b) {
                    var ma = a.max || Infinity;
                    var mb = b.max || Infinity;
                    return ma - mb;
                });
                for (var t = 0; t < tiers.length; t++) {
                    var tier = tiers[t];
                    if (!tier.max || amt <= tier.max) {
                        rate = Number(tier.rate) || 0;
                        commission = amt * (rate / 100);
                        break;
                    }
                }
            }

            appliedRules.push({
                id: selectedRule.id,
                name: selectedRule.name,
                type: selectedRule.type,
                rate: rate
            });
        }

        commission = Math.round(commission);

        _emit(PricingEvents.COMMISSION_CALC, {
            amount: amt,
            commission: commission,
            rate: rate,
            rule: selectedRule ? selectedRule.id : null
        });

        return {
            ok: true,
            amount: amt,
            commission: commission,
            rate: rate,
            appliedRule: selectedRule ? {
                id: selectedRule.id,
                name: selectedRule.name,
                type: selectedRule.type
            } : null,
            allCandidates: candidates.map(function (c) {
                return { id: c.id, name: c.name, priority: c.priority };
            })
        };
    }

    function calculateBatch(items, options) {
        if (!Array.isArray(items)) return [];
        var results = [];
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (!it) continue;
            var r = calculateCommission(it.amount, {
                brokerLevel: it.brokerLevel || options && options.brokerLevel,
                bank: it.bank || options && options.bank,
                brokerId: it.brokerId
            });
            r.itemId = it.id || null;
            results.push(r);
        }
        return results;
    }

    // ─────────────────────────────────────
    // 🎯 CRUD قوانین
    // ─────────────────────────────────────
    function createRule(data, options) {
        options = options || {};
        var result = { ok: false, reason: null, rule: null, errors: null };

        var errors = _validateRule(data);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        var user = _user();
        var rule = {
            id: _genId('rule'),
            name: String(data.name).trim(),
            type: data.type || 'percent',
            value: Number(data.value) || 0,
            tiers: Array.isArray(data.tiers) ? data.tiers.slice() : null,
            minAmount: Number(_en(data.minAmount)) || 0,
            maxAmount: Number(_en(data.maxAmount)) || 0,
            brokerLevel: data.brokerLevel || null,
            bank: data.bank || null,
            active: data.active !== false,
            priority: Number(data.priority) || 0,
            createdAt: Date.now(),
            createdBy: user ? user.id : null
        };

        var all = _loadRules();
        all.push(rule);
        if (!_saveRules(all)) {
            result.reason = 'storage_error';
            return result;
        }

        STATE.rules = all;
        _emit(PricingEvents.RULE_CREATED, { rule: rule });
        result.ok = true;
        result.rule = rule;
        return result;
    }

    function updateRule(id, patch, options) {
        options = options || {};
        var result = { ok: false, reason: null, rule: null, errors: null };

        var rule = _findRule(id);
        if (!rule) { result.reason = 'not_found'; return result; }

        if (patch.name !== undefined &&
            String(patch.name).trim().length < 2) {
            result.reason = 'validation';
            result.errors = { name: 'نام حداقل ۲ کاراکتر' };
            return result;
        }

        var allowed = ['name', 'type', 'value', 'tiers', 'minAmount',
                       'maxAmount', 'brokerLevel', 'bank', 'active', 'priority'];
        for (var i = 0; i < allowed.length; i++) {
            var k = allowed[i];
            if (patch[k] !== undefined) rule[k] = patch[k];
        }
        if (patch.value !== undefined) rule.value = Number(patch.value) || 0;
        if (patch.minAmount !== undefined) rule.minAmount = Number(_en(patch.minAmount)) || 0;
        if (patch.maxAmount !== undefined) rule.maxAmount = Number(_en(patch.maxAmount)) || 0;
        if (patch.priority !== undefined) rule.priority = Number(patch.priority) || 0;

        rule.updatedAt = Date.now();
        rule.updatedBy = _uid();

        if (!_persistRule(rule)) {
            result.reason = 'storage_error';
            return result;
        }

        result.ok = true;
        result.rule = rule;
        _emit(PricingEvents.RULE_UPDATED, { rule: rule });
        return result;
    }

    function deleteRule(id) {
        var rule = _findRule(id);
        if (!rule) return { ok: false, reason: 'not_found' };
        if (!canManage()) return { ok: false, reason: 'forbidden' };

        // جلوگیری از حذف آخرین قانون
        var activeCount = 0;
        for (var i = 0; i < STATE.rules.length; i++) {
            if (STATE.rules[i] && STATE.rules[i].active !== false) activeCount++;
        }
        if (rule.active !== false && activeCount <= 1) {
            return { ok: false, reason: 'last_active_rule' };
        }

        var all = _loadRules();
        var idx = -1;
        for (var j = 0; j < all.length; j++) {
            if (all[j] && all[j].id === id) { idx = j; break; }
        }
        if (idx === -1) return { ok: false, reason: 'not_found' };

        var removed = all.splice(idx, 1)[0];
        if (!_saveRules(all)) {
            all.splice(idx, 0, removed);
            return { ok: false, reason: 'storage_error' };
        }

        STATE.rules = all;
        _emit(PricingEvents.RULE_DELETED, { ruleId: id, rule: removed });
        return { ok: true, rule: removed };
    }

    function toggleRule(id) {
        var rule = _findRule(id);
        if (!rule) return { ok: false, reason: 'not_found' };
        if (!canManage()) return { ok: false, reason: 'forbidden' };

        rule.active = rule.active === false;
        rule.updatedAt = Date.now();

        // اگر می‌خواهیم غیرفعال کنیم، بررسی آخرین قانون فعال
        if (rule.active === false) {
            var activeCount = 0;
            for (var i = 0; i < STATE.rules.length; i++) {
                if (STATE.rules[i] && STATE.rules[i].active !== false) activeCount++;
            }
            if (activeCount === 0) {
                rule.active = true;
                return { ok: false, reason: 'last_active_rule' };
            }
        }

        if (!_persistRule(rule)) return { ok: false, reason: 'storage_error' };

        _emit(PricingEvents.RULE_TOGGLED, {
            ruleId: id, active: rule.active
        });
        return { ok: true, rule: rule };
    }

    function resetRules() {
        if (!canManage()) return { ok: false, reason: 'forbidden' };
        var defaults = JSON.parse(JSON.stringify(DEFAULT_RULES));
        if (!_saveRules(defaults)) return { ok: false, reason: 'storage_error' };
        STATE.rules = defaults;
        _emit(PricingEvents.RESET, { at: Date.now() });
        return { ok: true, rules: defaults };
    }

    function getRules() {
        return STATE.rules.slice();
    }

    function getActiveRules() {
        return STATE.rules.filter(function (r) {
            return r && r.active !== false;
        });
    }

    // ─────────────────────────────────────
    // 🧾 اعتبارسنجی
    // ─────────────────────────────────────
    function _validateRule(data) {
        var e = {};
        if (!data.name || String(data.name).trim().length < 2) {
            e.name = 'نام حداقل ۲ کاراکتر';
        } else if (String(data.name).trim().length > 80) {
            e.name = 'نام حداکثر ۸۰ کاراکتر';
        }
        if (!data.type || !COMMISSION_LABELS[data.type]) {
            e.type = 'نوع پورسانت نامعتبر';
        }
        if (data.type === 'tiered') {
            if (!Array.isArray(data.tiers) || data.tiers.length === 0) {
                e.tiers = 'حداقل یک پله لازم است';
            }
        } else {
            if (!data.value || Number(data.value) <= 0) {
                e.value = 'مقدار باید مثبت باشد';
            }
            if (data.type === 'percent' && Number(data.value) > 100) {
                e.value = 'درصد نمی‌تواند بیش از ۱۰۰ باشد';
            }
        }
        return e;
    }

    // ─────────────────────────────────────
    // 🔒 دسترسی
    // ─────────────────────────────────────
    function canManage() {
        return STATE.role === 'admin' || STATE.role === 'super_admin';
    }

    function canView() {
        return !!STATE.role;
    }

    // ─────────────────────────────────────
    // 📊 شبیه‌سازی
    // ─────────────────────────────────────
    function simulate(items, options) {
        options = options || {};
        if (!Array.isArray(items) || items.length === 0) {
            return { ok: false, reason: 'no_items' };
        }

        var results = [];
        var totalAmount = 0;
        var totalCommission = 0;
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (!it) continue;
            var r = calculateCommission(it.amount, {
                brokerLevel: it.brokerLevel || options.brokerLevel,
                bank: it.bank || options.bank
            });
            if (r.ok) {
                totalAmount += r.amount;
                totalCommission += r.commission;
                results.push({
                    itemId: it.id || null,
                    label: it.label || ('مورد ' + (i + 1)),
                    amount: r.amount,
                    commission: r.commission,
                    rate: r.rate,
                    rule: r.appliedRule
                });
            }
        }

        var simulation = {
            id: _genId('sim'),
            name: options.name || 'شبیه‌سازی بدون نام',
            brokerLevel: options.brokerLevel || null,
            bank: options.bank || null,
            itemCount: results.length,
            totalAmount: totalAmount,
            totalCommission: totalCommission,
            averageRate: totalAmount > 0
                ? (totalCommission / totalAmount) * 100 : 0,
            results: results,
            createdAt: Date.now(),
            createdBy: _uid()
        };

        STATE.lastSimulation = simulation;

        _emit(PricingEvents.SIMULATION_RUN, {
            simulationId: simulation.id,
            itemCount: results.length,
            totalCommission: totalCommission
        });

        return { ok: true, simulation: simulation };
    }

    function saveSimulation(name) {
        if (!STATE.lastSimulation) {
            return { ok: false, reason: 'no_simulation' };
        }

        var sim = JSON.parse(JSON.stringify(STATE.lastSimulation));
        sim.id = _genId('sim');
        sim.name = name || 'شبیه‌سازی ' + _jalali(Date.now());
        sim.savedAt = Date.now();

        if (typeof Storage === 'undefined') {
            return { ok: false, reason: 'storage_error' };
        }

        var all = Storage.getJSON(SIMS_KEY, []);
        if (!Array.isArray(all)) all = [];
        all.push(sim);
        // حداکثر ۵۰ شبیه‌سازی
        if (all.length > 50) all = all.slice(-50);

        if (!Storage.setJSON(SIMS_KEY, all)) {
            return { ok: false, reason: 'storage_error' };
        }

        _emit(PricingEvents.SIMULATION_SAVED, { simulation: sim });
        return { ok: true, simulation: sim };
    }

    function getSavedSimulations() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(SIMS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function deleteSimulation(id) {
        if (typeof Storage === 'undefined') return { ok: false, reason: 'storage_error' };
        var all = getSavedSimulations();
        var idx = -1;
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].id === id) { idx = i; break; }
        }
        if (idx === -1) return { ok: false, reason: 'not_found' };

        var removed = all.splice(idx, 1)[0];
        if (!Storage.setJSON(SIMS_KEY, all)) {
            all.splice(idx, 0, removed);
            return { ok: false, reason: 'storage_error' };
        }

        _emit(PricingEvents.SIMULATION_DELETED, { simulationId: id });
        return { ok: true, simulation: removed };
    }

    // ─────────────────────────────────────
    // 📊 آمار
    // ─────────────────────────────────────
    function computeStats() {
        var rules = STATE.rules;
        var active = 0;
        var byType = { percent: 0, fixed: 0, tiered: 0 };
        for (var i = 0; i < rules.length; i++) {
            var r = rules[i];
            if (!r) continue;
            if (r.active !== false) active++;
            if (byType[r.type] !== undefined) byType[r.type]++;
        }
        return {
            totalRules: rules.length,
            activeRules: active,
            byType: byType,
            savedSimulations: getSavedSimulations().length,
            brokerLevels: Object.keys(BROKER_LEVELS).length
        };
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت آمار
    // ─────────────────────────────────────
    function _renderStats() {
        var s = computeStats();
        return '<div class="wam-pricing__stats">' +
            '<div class="wam-pricing__stat"><span>کل قوانین:</span> <strong>' +
                _fa(s.totalRules) + '</strong></div>' +
            '<div class="wam-pricing__stat"><span>فعال:</span> <strong>' +
                _fa(s.activeRules) + '</strong></div>' +
            '<div class="wam-pricing__stat"><span>درصدی:</span> <strong>' +
                _fa(s.byType.percent) + '</strong></div>' +
            '<div class="wam-pricing__stat"><span>ثابت:</span> <strong>' +
                _fa(s.byType.fixed) + '</strong></div>' +
            '<div class="wam-pricing__stat"><span>پله‌ای:</span> <strong>' +
                _fa(s.byType.tiered) + '</strong></div>' +
            '<div class="wam-pricing__stat"><span>شبیه‌سازی‌ها:</span> <strong>' +
                _fa(s.savedSimulations) + '</strong></div>' +
        '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ردیف قانون
    // ─────────────────────────────────────
    function _renderRuleRow(rule) {
        var typeLabel = COMMISSION_LABELS[rule.type] || rule.type;
        var valueDisplay = '';
        if (rule.type === 'percent') {
            valueDisplay = _pct(rule.value);
        } else if (rule.type === 'fixed') {
            valueDisplay = _amt(rule.value) + ' ریال';
        } else if (rule.type === 'tiered') {
            valueDisplay = _fa(rule.tiers ? rule.tiers.length : 0) + ' پله';
        }

        var conditions = [];
        if (rule.brokerLevel) {
            conditions.push('سطح: ' + (BROKER_LEVELS[rule.brokerLevel] || rule.brokerLevel));
        }
        if (rule.bank) conditions.push('بانک: ' + rule.bank);
        if (rule.minAmount) conditions.push('از ' + _amt(rule.minAmount));
        if (rule.maxAmount) conditions.push('تا ' + _amt(rule.maxAmount));

        return '<tr data-pricing-rule-id="' + _esc(rule.id) + '"' +
            (rule.active === false ? ' class="is-inactive"' : '') + '>' +
            '<td><strong>' + _esc(rule.name) + '</strong>' +
            (conditions.length > 0
                ? '<div class="wam-pricing__rule-conditions">' +
                  _esc(conditions.join(' · ')) + '</div>' : '') +
            '</td>' +
            '<td>' + _esc(typeLabel) + '</td>' +
            '<td>' + valueDisplay + '</td>' +
            '<td>' + _fa(rule.priority || 0) + '</td>' +
            '<td>' +
                (rule.active === false
                    ? '<span class="wam-badge wam-badge--inactive">غیرفعال</span>'
                    : '<span class="wam-badge wam-badge--active">فعال</span>') +
            '</td>' +
            '<td class="wam-pricing__actions">' +
                (canManage() ?
                    '<button class="wam-btn-icon" data-pricing-action="edit-rule" ' +
                    'data-id="' + _esc(rule.id) + '" title="ویرایش">✏️</button>' +
                    '<button class="wam-btn-icon" data-pricing-action="toggle-rule" ' +
                    'data-id="' + _esc(rule.id) + '" title="' +
                    (rule.active === false ? 'فعال‌سازی' : 'غیرفعال‌سازی') + '">' +
                    (rule.active === false ? '🟢' : '⏸️') + '</button>' +
                    '<button class="wam-btn-icon wam-btn-icon--danger" ' +
                    'data-pricing-action="delete-rule" ' +
                    'data-id="' + _esc(rule.id) + '" title="حذف">🗑️</button>'
                    : '—') +
            '</td>' +
        '</tr>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — بخش قوانین
    // ─────────────────────────────────────
    function _renderRulesSection() {
        var html = '<section class="wam-pricing__section">';
        html += '<header class="wam-pricing__section-head">' +
                '<h3>📋 قوانین پورسانت</h3>';
        if (canManage()) {
            html += '<button class="wam-btn wam-btn--sm wam-btn--primary" ' +
                    'data-pricing-action="new-rule">➕ قانون جدید</button>';
        }
        html += '</header>';

        if (STATE.rules.length === 0) {
            html += '<div class="wam-empty">هنوز قانونی تعریف نشده است.</div>';
        } else {
            html += '<div class="wam-pricing__table-wrap">' +
                    '<table class="wam-pricing__table"><thead><tr>' +
                    '<th>نام</th>' +
                    '<th>نوع</th>' +
                    '<th>مقدار</th>' +
                    '<th>اولویت</th>' +
                    '<th>وضعیت</th>' +
                    '<th>عملیات</th>' +
                    '</tr></thead><tbody>';
            for (var i = 0; i < STATE.rules.length; i++) {
                html += _renderRuleRow(STATE.rules[i]);
            }
            html += '</tbody></table></div>';
        }

        html += '</section>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — بخش محاسبه
    // ─────────────────────────────────────
    function _renderCalculatorSection() {
        var levels = '';
        for (var lv in BROKER_LEVELS) {
            if (!Object.prototype.hasOwnProperty.call(BROKER_LEVELS, lv)) continue;
            levels += '<option value="' + lv + '">' +
                      _esc(BROKER_LEVELS[lv]) + '</option>';
        }

        var html = '<section class="wam-pricing__section">';
        html += '<h3>🧮 محاسبه پورسانت</h3>';
        html += '<div class="wam-pricing__calc">';
        html += '<div class="wam-pricing__calc-row">';
        html += '<div class="wam-field">' +
                '<label>مبلغ وام (ریال)</label>' +
                '<input type="text" inputmode="numeric" ' +
                'data-pricing="calc-amount" placeholder="مثال: 500000000">' +
                '</div>';
        html += '<div class="wam-field">' +
                '<label>سطح کارگزار</label>' +
                '<select data-pricing="calc-level">' +
                '<option value="">— بدون سطح —</option>' +
                levels + '</select></div>';
        html += '</div>';

        html += '<div class="wam-pricing__calc-actions">' +
                '<button type="button" class="wam-btn wam-btn--primary" ' +
                'data-pricing-action="calc">محاسبه</button>' +
                '<button type="button" class="wam-btn wam-btn--ghost" ' +
                'data-pricing-action="clear-calc">پاک کردن</button>' +
                '</div>';

        // نتیجه
        if (STATE.lastSimulation) {
            var sim = STATE.lastSimulation;
            html += '<div class="wam-pricing__result">';
            html += '<div class="wam-pricing__result-grid">';
            html += '<div class="wam-pricing__result-item">' +
                    '<span>مبلغ:</span>' +
                    '<strong>' + _amt(sim.totalAmount) + ' ریال</strong></div>';
            html += '<div class="wam-pricing__result-item wam-pricing__result-item--primary">' +
                    '<span>پورسانت:</span>' +
                    '<strong>' + _amt(sim.totalCommission) + ' ریال</strong></div>';
            html += '<div class="wam-pricing__result-item">' +
                    '<span>نرخ مؤثر:</span>' +
                    '<strong>' + _pct(sim.averageRate) + '</strong></div>';
            html += '</div>';

            if (sim.results && sim.results.length > 0) {
                html += '<ul class="wam-pricing__sim-list">';
                for (var i = 0; i < sim.results.length; i++) {
                    var r = sim.results[i];
                    html += '<li>' +
                        '<span>' + _esc(r.label) + '</span>' +
                        '<span>' + _amt(r.amount) + ' → ' +
                        _amt(r.commission) + ' (' + _pct(r.rate) + ')</span>' +
                    '</li>';
                }
                html += '</ul>';
            }

            html += '<div class="wam-pricing__result-actions">' +
                    '<button type="button" class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                    'data-pricing-action="save-sim">💾 ذخیره شبیه‌سازی</button>' +
                    '</div>';

            html += '</div>';
        }

        html += '</div></section>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — بخش شبیه‌سازی‌های ذخیره‌شده
    // ─────────────────────────────────────
    function _renderSavedSimulations() {
        var sims = getSavedSimulations();
        if (sims.length === 0) return '';

        var html = '<section class="wam-pricing__section">';
        html += '<h3>💾 شبیه‌سازی‌های ذخیره‌شده (' +
                _fa(sims.length) + ')</h3>';
        html += '<ul class="wam-pricing__saved-list">';
        for (var i = sims.length - 1; i >= 0; i--) {
            var sim = sims[i];
            html += '<li class="wam-pricing__saved-item" ' +
                    'data-sim-id="' + _esc(sim.id) + '">' +
                '<div class="wam-pricing__saved-info">' +
                    '<div class="wam-pricing__saved-name">' +
                    _esc(sim.name) + '</div>' +
                    '<div class="wam-pricing__saved-meta">' +
                    _jalali(sim.savedAt) + ' · ' +
                    _fa(sim.itemCount) + ' مورد · ' +
                    _amt(sim.totalCommission) + ' ریال' +
                    '</div>' +
                '</div>' +
                '<div class="wam-pricing__saved-actions">' +
                    (canManage() ?
                        '<button class="wam-btn-icon wam-btn-icon--danger" ' +
                        'data-pricing-action="delete-sim" ' +
                        'data-id="' + _esc(sim.id) + '" ' +
                        'title="حذف">🗑️</button>' : '') +
                '</div>' +
            '</li>';
        }
        html += '</ul></section>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;

        var html = '<div class="wam-pricing">' +
            '<div class="wam-pricing__header">' +
                '<h3>💵 قیمت‌گذاری و پورسانت</h3>' +
                '<p class="wam-pricing__desc">' +
                'مدیریت قوانین پورسانت کارگزاران و شبیه‌سازی محاسبات</p>' +
            '</div>' +
            _renderStats() +
            _renderRulesSection() +
            _renderCalculatorSection() +
            _renderSavedSimulations() +
        '</div>';

        STATE.root.innerHTML = html;
        _bindEvents();

        _emit(PricingEvents.RENDERED, { at: Date.now() });
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents() {
        if (!STATE.root) return;

        var btns = STATE.root.querySelectorAll('[data-pricing-action]');
        for (var i = 0; i < btns.length; i++) {
            if (btns[i].dataset.pricingBound) continue;
            btns[i].addEventListener('click', _handleAction);
            btns[i].dataset.pricingBound = '1';
        }
    }

    function _handleAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-pricing-action');
        var id = this.getAttribute('data-id');

        if (a === 'new-rule')     { openRuleForm(null); return; }
        if (a === 'edit-rule')    { openRuleForm(id); return; }
        if (a === 'toggle-rule')  { _quickToggle(id); return; }
        if (a === 'delete-rule')  { _confirmDeleteRule(id); return; }
        if (a === 'calc')         { _handleCalc(); return; }
        if (a === 'clear-calc')   { _handleClearCalc(); return; }
        if (a === 'save-sim')     { _handleSaveSim(); return; }
        if (a === 'delete-sim')   { _confirmDeleteSim(id); return; }
    }

    function _handleCalc() {
        if (!STATE.root) return;
        var amountEl = STATE.root.querySelector('[data-pricing="calc-amount"]');
        var levelEl = STATE.root.querySelector('[data-pricing="calc-level"]');
        if (!amountEl) return;

        var amount = amountEl.value.trim();
        if (!amount || Number(_en(amount)) <= 0) {
            _toast('warning', 'مبلغ را وارد کنید', 'توجه');
            return;
        }

        var r = simulate([{
            label: 'وام تک',
            amount: amount,
            brokerLevel: levelEl ? levelEl.value || null : null
        }], {
            name: 'محاسبه سریع',
            brokerLevel: levelEl ? levelEl.value || null : null
        });

        if (r.ok) {
            render();
            _toast('success', 'پورسانت محاسبه شد', 'موفق');
        } else {
            _toast('error', 'خطا در محاسبه', 'خطا');
        }
    }

    function _handleClearCalc() {
        if (!STATE.root) return;
        var amountEl = STATE.root.querySelector('[data-pricing="calc-amount"]');
        if (amountEl) amountEl.value = '';
        STATE.lastSimulation = null;
        render();
    }

    function _handleSaveSim() {
        if (!STATE.lastSimulation) return;
        var name = prompt('نام شبیه‌سازی:',
            STATE.lastSimulation.name || 'شبیه‌سازی');
        if (!name) return;

        var r = saveSimulation(name);
        if (r.ok) {
            render();
            _toast('success', 'شبیه‌سازی ذخیره شد', 'موفق');
        } else {
            _toast('error', 'خطا در ذخیره', 'خطا');
        }
    }

    function _quickToggle(id) {
        var r = toggleRule(id);
        if (!r.ok) {
            var msg = r.reason === 'last_active_rule'
                ? 'نمی‌توان آخرین قانون فعال را غیرفعال کرد'
                : 'خطا در تغییر وضعیت';
            _toast('warning', msg, 'توجه');
            return;
        }
        render();
        _toast('success',
            r.rule.active ? 'قانون فعال شد' : 'قانون غیرفعال شد',
            'موفق');
    }

    function _confirmDeleteRule(id) {
        var rule = _findRule(id);
        if (!rule) return;
        var msg = 'قانون «' + rule.name + '» حذف شود؟';
        var doIt = function () {
            var r = deleteRule(id);
            if (r.ok) {
                render();
                _toast('success', 'قانون حذف شد', 'موفق');
            } else {
                var m = r.reason === 'last_active_rule'
                    ? 'نمی‌توان آخرین قانون فعال را حذف کرد'
                    : 'خطا در حذف';
                _toast('warning', m, 'توجه');
            }
        };
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('حذف قانون', msg, { danger: true })
                .then(function (ok) { if (ok) doIt(); });
        } else if (window.confirm(msg)) {
            doIt();
        }
    }

    function _confirmDeleteSim(id) {
        var msg = 'این شبیه‌سازی حذف شود؟';
        var doIt = function () {
            var r = deleteSimulation(id);
            if (r.ok) {
                render();
                _toast('success', 'شبیه‌سازی حذف شد', 'موفق');
            }
        };
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('حذف شبیه‌سازی', msg, { danger: true })
                .then(function (ok) { if (ok) doIt(); });
        } else if (window.confirm(msg)) {
            doIt();
        }
    }

    // ─────────────────────────────────────
    // 🎯 فرم قانون
    // ─────────────────────────────────────
    function openRuleForm(id) {
        if (!canManage()) {
            _toast('error', 'دسترسی ندارید', 'خطا');
            return;
        }
        var editMode = !!id;
        var rule = editMode ? _findRule(id) : null;
        if (editMode && !rule) return;

        var existing = document.getElementById('wamPricingFormModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var r = rule || {};

        var typeOpts = '';
        for (var t in COMMISSION_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(COMMISSION_LABELS, t)) continue;
            typeOpts += '<option value="' + t + '"' +
                (r.type === t || (!r.type && t === 'percent') ? ' selected' : '') + '>' +
                _esc(COMMISSION_LABELS[t]) + '</option>';
        }

        var levelOpts = '<option value="">— بدون سطح —</option>';
        for (var lv in BROKER_LEVELS) {
            if (!Object.prototype.hasOwnProperty.call(BROKER_LEVELS, lv)) continue;
            levelOpts += '<option value="' + lv + '"' +
                (r.brokerLevel === lv ? ' selected' : '') + '>' +
                _esc(BROKER_LEVELS[lv]) + '</option>';
        }

        var modal = document.createElement('div');
        modal.id = 'wamPricingFormModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>' + (editMode ? 'ویرایش قانون' : 'قانون جدید') + '</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form class="wam-modal__body">' +
                    '<div class="wam-field"><label>نام قانون *</label>' +
                        '<input name="name" value="' + _esc(r.name || '') + '">' +
                        '<div class="wam-field__error" data-error="name"></div></div>' +

                    '<div class="wam-field"><label>نوع پورسانت *</label>' +
                        '<select name="type">' + typeOpts + '</select>' +
                        '<div class="wam-field__error" data-error="type"></div></div>' +

                    '<div class="wam-field" data-field="value">' +
                        '<label>مقدار (درصد یا ریال) *</label>' +
                        '<input name="value" inputmode="numeric" value="' +
                        _esc(String(r.value || '')) + '">' +
                        '<div class="wam-field__error" data-error="value"></div></div>' +

                    '<div class="wam-field" data-field="tiers" style="display:none">' +
                        '<label>پله‌ها (JSON)</label>' +
                        '<textarea name="tiers" rows="5" ' +
                        'placeholder=\'[{"max":100000000,"rate":0.5},...]\'>' +
                        _esc(r.tiers ? JSON.stringify(r.tiers) : '') + '</textarea>' +
                        '<div class="wam-field__error" data-error="tiers"></div>' +
                        '<div class="wam-field__help">' +
                        'max=0 یعنی بی‌نهایت. rate به درصد است.</div></div>' +

                    '<div class="wam-pricing__form-row">' +
                        '<div class="wam-field"><label>حداقل مبلغ</label>' +
                            '<input name="minAmount" inputmode="numeric" value="' +
                            _esc(String(r.minAmount || '')) + '"></div>' +
                        '<div class="wam-field"><label>حداکثر مبلغ</label>' +
                            '<input name="maxAmount" inputmode="numeric" value="' +
                            _esc(String(r.maxAmount || '')) + '"></div>' +
                    '</div>' +

                    '<div class="wam-pricing__form-row">' +
                        '<div class="wam-field"><label>سطح کارگزار</label>' +
                            '<select name="brokerLevel">' + levelOpts + '</select></div>' +
                        '<div class="wam-field"><label>بانک</label>' +
                            '<input name="bank" value="' + _esc(r.bank || '') +
                            '" placeholder="اختیاری"></div>' +
                    '</div>' +

                    '<div class="wam-field"><label>اولویت (بالاتر = مهم‌تر)</label>' +
                        '<input name="priority" type="number" min="0" max="100" value="' +
                        _esc(String(r.priority || 0)) + '"></div>' +

                    '<div class="wam-field__error" data-error="general"></div>' +
                    '<footer class="wam-modal__footer">' +
                        '<button type="button" class="wam-btn wam-btn--ghost" ' +
                        'data-close>انصراف</button>' +
                        '<button type="submit" class="wam-btn wam-btn--primary">' +
                        (editMode ? 'ذخیره' : 'ثبت') + '</button>' +
                    '</footer>' +
                '</form>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var i = 0; i < cbs.length; i++) {
            cbs[i].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }

        var form = modal.querySelector('form');
        var typeSel = form.querySelector('[name="type"]');
        var valueField = form.querySelector('[data-field="value"]');
        var tiersField = form.querySelector('[data-field="tiers"]');

        function updateVisibility() {
            var t = typeSel.value;
            if (t === 'tiered') {
                valueField.style.display = 'none';
                tiersField.style.display = '';
            } else {
                valueField.style.display = '';
                tiersField.style.display = 'none';
            }
        }
        typeSel.addEventListener('change', updateVisibility);
        updateVisibility();

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            _handleRuleSubmit(form, editMode, id);
        });
    }

    function _handleRuleSubmit(form, editMode, id) {
        _clearFormErrors(form);

        var data = {
            name: form.querySelector('[name="name"]').value.trim(),
            type: form.querySelector('[name="type"]').value,
            minAmount: form.querySelector('[name="minAmount"]').value.trim(),
            maxAmount: form.querySelector('[name="maxAmount"]').value.trim(),
            brokerLevel: form.querySelector('[name="brokerLevel"]').value || null,
            bank: form.querySelector('[name="bank"]').value.trim() || null,
            priority: Number(form.querySelector('[name="priority"]').value) || 0
        };

        if (data.type === 'tiered') {
            var tiersRaw = form.querySelector('[name="tiers"]').value.trim();
            try {
                data.tiers = JSON.parse(tiersRaw || '[]');
            } catch (err) {
                _showFormErrors(form, { tiers: 'فرمت JSON نامعتبر' });
                return;
            }
        } else {
            data.value = form.querySelector('[name="value"]').value.trim();
        }

        var res = editMode ? updateRule(id, data) : createRule(data);

        if (!res.ok) {
            _showFormErrors(form, res.errors || { general: 'خطا: ' + res.reason });
            return;
        }

        var modal = document.getElementById('wamPricingFormModal');
        if (modal && modal.parentNode) modal.parentNode.removeChild(modal);

        _toast('success', editMode ? 'قانون به‌روزرسانی شد' : 'قانون ثبت شد', 'موفق');
        render();
    }

    function _clearFormErrors(form) {
        var errs = form.querySelectorAll('[data-error]');
        for (var i = 0; i < errs.length; i++) {
            errs[i].textContent = '';
            errs[i].style.display = 'none';
        }
    }

    function _showFormErrors(form, errors) {
        for (var k in errors) {
            if (!Object.prototype.hasOwnProperty.call(errors, k)) continue;
            var el = form.querySelector('[data-error="' + k + '"]');
            if (el) { el.textContent = errors[k]; el.style.display = 'block'; }
        }
    }

    // ─────────────────────────────────────
    // 🔄 reload
    // ─────────────────────────────────────
    function reload() {
        STATE.rules = _loadRules();
        render();
        _emit(PricingEvents.LOADED, {
            count: STATE.rules.length, at: Date.now()
        });
        return STATE.rules.length;
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var run = function () {
            var user = _user();
            STATE.userId = user ? user.id : null;
            STATE.role = user ? user.role : null;

            var root = options.root ||
                       document.querySelector('[' + ROOT_ATTR + ']') ||
                       document.querySelector('.wam-pricing');
            if (!root) {
                if (options.debug) console.warn('[pricing] root پیدا نشد');
                return;
            }
            STATE.root = root;

            STATE.rules = _loadRules();
            render();

            STATE.installed = true;

            _emit(PricingEvents.READY, {
                rulesCount: STATE.rules.length,
                role: STATE.role,
                at: Date.now()
            });

            if (options.debug) {
                console.log('[pricing] v' + VERSION + ' — ' +
                    STATE.rules.length + ' قانون');
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run);
        } else {
            run();
        }
    }

    function uninstall() {
        STATE.root = null;
        STATE.installed = false;
    }

    function reset() {
        STATE.lastSimulation = null;
        STATE.selectedRuleId = null;
        if (STATE.root) render();
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            version: VERSION,
            installed: STATE.installed,
            role: STATE.role,
            rulesCount: STATE.rules.length,
            activeRulesCount: getActiveRules().length,
            savedSimulationsCount: getSavedSimulations().length,
            hasLastSimulation: !!STATE.lastSimulation
        };
    }

    function onChange(cb) {
        if (typeof cb !== 'function') return function () {};
        STATE.listeners.push(cb);
        return function () {
            var i = STATE.listeners.indexOf(cb);
            if (i !== -1) STATE.listeners.splice(i, 1);
        };
    }

    // ─────────────────────────────────────
    // 🌐 API جهانی
    // ─────────────────────────────────────
    var WamPricing = {
        VERSION: VERSION,
        EVENTS: PricingEvents,
        ROOT_ATTR: ROOT_ATTR,
        RULES_KEY: RULES_KEY,
        SIMS_KEY: SIMS_KEY,
        COMMISSION_TYPES: COMMISSION_TYPES,
        COMMISSION_LABELS: COMMISSION_LABELS,
        BROKER_LEVELS: BROKER_LEVELS,
        DEFAULT_RULES: DEFAULT_RULES,

        install: install,
        uninstall: uninstall,
        reload: reload,
        render: render,
        reset: reset,

        // محاسبه
        calculateCommission: calculateCommission,
        calculateBatch: calculateBatch,
        simulate: simulate,

        // CRUD قوانین
        createRule: createRule,
        updateRule: updateRule,
        deleteRule: deleteRule,
        toggleRule: toggleRule,
        resetRules: resetRules,
        getRules: getRules,
        getActiveRules: getActiveRules,
        findRule: _findRule,

        // شبیه‌سازی
        saveSimulation: saveSimulation,
        getSavedSimulations: getSavedSimulations,
        deleteSimulation: deleteSimulation,

        openRuleForm: openRuleForm,

        canManage: canManage,
        canView: canView,

        computeStats: computeStats,

        formatAmount: _amt,
        formatPercent: _pct,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamPricing = WamPricing;
    window.PricingEvents = PricingEvents;

    // نصب خودکار
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-pricing-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-pricing')) {
                install();
            }
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _auto);
        } else {
            _auto();
        }
    }

})();