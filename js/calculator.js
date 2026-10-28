// ==========================================
// وام پی — Shared Modules
// فایل: calculator.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: ماشین‌حساب وام — قسط، سود، جدول بازپرداخت، سناریوها
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var VERSION   = '1.0.0';
    var ROOT_ATTR = 'data-calculator-root';
    var SCENARIOS_KEY = 'wamPayCalculatorScenarios';

    var METHODS = {
        AMORTIZED:  'amortized',   // قسط مساوی (رایج‌ترین)
        PRINCIPAL:  'principal',   // اصل ثابت + سود نزولی
        BULLET:     'bullet'       // سود فقط، اصل در پایان
    };

    var METHOD_LABELS = {
        amortized: 'قسط مساوی (Amortized)',
        principal: 'اصل ثابت (Principal)',
        bullet:    'سود فقط (Bullet)'
    };

    var RATE_TYPES = {
        ANNUAL:  'annual',
        MONTHLY: 'monthly',
        DAILY:   'daily'
    };

    var RATE_TYPE_LABELS = {
        annual:  'سالانه',
        monthly: 'ماهانه',
        daily:   'روزانه'
    };

    var DURATION_UNITS = {
        MONTH: 'month',
        YEAR:  'year'
    };

    var DEFAULT_RATE = 18;   // ۱۸٪ سالانه پیش‌فرض

    var PRESET_RATES = [
        { label: 'قرض‌الحسنه (۴٪)',     rate: 4 },
        { label: 'وام مسکن (۱۸٪)',       rate: 18 },
        { label: 'وام خودرو (۲۱٪)',      rate: 21 },
        { label: 'وام ازدواج (۴٪)',      rate: 4 },
        { label: 'وام سرمایه (۲۳٪)',     rate: 23 }
    ];

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        role: null,
        userId: null,
        input: {
            principal: 0,          // مبلغ اصل وام (ریال)
            rate: DEFAULT_RATE,    // نرخ
            rateType: 'annual',    // نوع نرخ
            duration: 12,          // مدت
            durationUnit: 'month', // واحد مدت
            method: 'amortized',   // روش محاسبه
            startDate: null        // تاریخ شروع (اختیاری)
        },
        result: null,              // نتیجه محاسبه
        schedule: [],              // جدول بازپرداخت
        scenarios: [],             // سناریوهای ذخیره‌شده
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var CalcEvents = {
        READY:      'calc.ready',
        COMPUTED:   'calc.computed',
        INPUT_CHANGE:'calc.input_change',
        PRESET_APPLIED:'calc.preset_applied',
        SCENARIO_SAVED:'calc.scenario_saved',
        SCENARIO_LOADED:'calc.scenario_loaded',
        SCENARIO_DELETED:'calc.scenario_deleted',
        SCHEDULE_EXPORTED:'calc.schedule_exported',
        RESET:      'calc.reset',
        RENDERED:   'calc.rendered',
        ACTION:     'calc.action'
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
        return (prefix || 'sc') + '_' + Date.now().toString(36) + '_' + r;
    }

    function _toast(type, msg, title) {
        if (typeof WamUI === 'undefined') return;
        if (type === 'success' && WamUI.toastSuccess) WamUI.toastSuccess(msg, title || 'موفق');
        else if (type === 'error' && WamUI.toastError) WamUI.toastError(msg, title || 'خطا');
        else if (type === 'warning' && WamUI.toastWarning) WamUI.toastWarning(msg, title || 'توجه');
        else if (type === 'info' && WamUI.toastInfo) WamUI.toastInfo(msg, title || 'اطلاع');
    }

    // ─────────────────────────────────────
    // 🧮 نرخ ماهانه
    // ─────────────────────────────────────
    function _monthlyRate(input) {
        var r = Number(input.rate) || 0;
        if (r <= 0) return 0;

        // به درصد → اعشار
        r = r / 100;

        if (input.rateType === 'annual') return r / 12;
        if (input.rateType === 'monthly') return r;
        if (input.rateType === 'daily') return r * 30;
        return r / 12;
    }

    function _monthsCount(input) {
        var d = Number(input.duration) || 0;
        if (input.durationUnit === 'year') return d * 12;
        return d;
    }

    // ─────────────────────────────────────
    // 🧮 محاسبات اصلی
    // ─────────────────────────────────────
    function compute(input) {
        input = input || STATE.input;
        var P = Number(input.principal) || 0;
        var n = _monthsCount(input);
        var i = _monthlyRate(input);
        var method = input.method || 'amortized';

        if (P <= 0 || n <= 0) {
            return {
                ok: false,
                reason: 'invalid_input',
                principal: P,
                months: n,
                monthlyRate: i,
                method: method
            };
        }

        var result = {
            ok: true,
            principal: P,
            months: n,
            monthlyRate: i,
            annualRate: i * 12,
            method: method,
            totalInterest: 0,
            totalPayment: 0,
            firstInstallment: 0,
            lastInstallment: 0,
            monthlyPayment: 0,
            schedule: []
        };

        // ─── Amortized (قسط مساوی) ───
        if (method === 'amortized') {
            var monthly;
            if (i === 0) {
                monthly = P / n;
            } else {
                var pow = Math.pow(1 + i, n);
                monthly = P * i * pow / (pow - 1);
            }
            result.monthlyPayment = monthly;
            result.firstInstallment = monthly;
            result.lastInstallment = monthly;
            result.totalPayment = monthly * n;
            result.totalInterest = result.totalPayment - P;

            // ساخت جدول
            var balance = P;
            for (var m = 1; m <= n; m++) {
                var interestM = balance * i;
                var principalM = monthly - interestM;
                balance -= principalM;
                if (Math.abs(balance) < 1) balance = 0;

                result.schedule.push({
                    month: m,
                    payment: monthly,
                    principal: principalM,
                    interest: interestM,
                    balance: Math.max(0, balance)
                });
            }
        }

        // ─── Principal (اصل ثابت) ───
        else if (method === 'principal') {
            var principalM2 = P / n;
            var totalInt = 0;
            var balance2 = P;

            for (var m2 = 1; m2 <= n; m2++) {
                var interest2 = balance2 * i;
                var payment2 = principalM2 + interest2;
                totalInt += interest2;
                balance2 -= principalM2;
                if (Math.abs(balance2) < 1) balance2 = 0;

                result.schedule.push({
                    month: m2,
                    payment: payment2,
                    principal: principalM2,
                    interest: interest2,
                    balance: Math.max(0, balance2)
                });
            }

            result.firstInstallment = result.schedule[0].payment;
            result.lastInstallment = result.schedule[n - 1].payment;
            result.monthlyPayment = result.firstInstallment;
            result.totalInterest = totalInt;
            result.totalPayment = P + totalInt;
        }

        // ─── Bullet (سود فقط، اصل در پایان) ───
        else if (method === 'bullet') {
            var interestB = P * i;
            for (var m3 = 1; m3 <= n; m3++) {
                var isLast = (m3 === n);
                result.schedule.push({
                    month: m3,
                    payment: isLast ? (interestB + P) : interestB,
                    principal: isLast ? P : 0,
                    interest: interestB,
                    balance: isLast ? 0 : P
                });
            }
            result.monthlyPayment = interestB;
            result.firstInstallment = interestB;
            result.lastInstallment = interestB + P;
            result.totalInterest = interestB * n;
            result.totalPayment = P + result.totalInterest;
        }

        return result;
    }

    function _recompute(silent) {
        STATE.result = compute(STATE.input);
        STATE.schedule = STATE.result.ok ? STATE.result.schedule : [];
        if (!silent) {
            _emit(CalcEvents.COMPUTED, {
                input: JSON.parse(JSON.stringify(STATE.input)),
                result: _summarizeResult(STATE.result)
            });
        }
        return STATE.result;
    }

    function _summarizeResult(r) {
        if (!r) return null;
        return {
            ok: r.ok,
            principal: r.principal,
            months: r.months,
            monthlyRate: r.monthlyRate,
            annualRate: r.annualRate,
            method: r.method,
            monthlyPayment: r.monthlyPayment,
            firstInstallment: r.firstInstallment,
            lastInstallment: r.lastInstallment,
            totalInterest: r.totalInterest,
            totalPayment: r.totalPayment
        };
    }

    // ─────────────────────────────────────
    // 🎯 API عمومی
    // ─────────────────────────────────────
    function setInput(patch) {
        if (!patch) return false;
        for (var k in patch) {
            if (Object.prototype.hasOwnProperty.call(patch, k)) {
                STATE.input[k] = patch[k];
            }
        }
        _recompute();
        return true;
    }

    function setPrincipal(v) {
        STATE.input.principal = Number(_en(v)) || 0;
        _recompute();
        return STATE.input.principal;
    }

    function setRate(v) {
        STATE.input.rate = Number(_en(v)) || 0;
        _recompute();
        return STATE.input.rate;
    }

    function setDuration(v, unit) {
        STATE.input.duration = Number(_en(v)) || 0;
        if (unit) STATE.input.durationUnit = unit;
        _recompute();
        return STATE.input.duration;
    }

    function setMethod(m) {
        if (!METHODS[m.toUpperCase()]) return false;
        STATE.input.method = m;
        _recompute();
        return true;
    }

    function setRateType(t) {
        if (!RATE_TYPE_LABELS[t]) return false;
        STATE.input.rateType = t;
        _recompute();
        return true;
    }

    function reset() {
        STATE.input = {
            principal: 0,
            rate: DEFAULT_RATE,
            rateType: 'annual',
            duration: 12,
            durationUnit: 'month',
            method: 'amortized',
            startDate: null
        };
        STATE.result = null;
        STATE.schedule = [];
        _emit(CalcEvents.RESET, { at: Date.now() });
        return true;
    }

    function applyPreset(rate) {
        STATE.input.rate = Number(rate) || 0;
        _recompute();
        _emit(CalcEvents.PRESET_APPLIED, { rate: rate });
        return true;
    }

    // ─────────────────────────────────────
    // 📊 ابزارهای گزارش
    // ─────────────────────────────────────
    function getResult() {
        return _summarizeResult(STATE.result);
    }

    function getSchedule() {
        return STATE.schedule.slice();
    }

    function getInput() {
        return JSON.parse(JSON.stringify(STATE.input));
    }

    function getSummary() {
        if (!STATE.result || !STATE.result.ok) return null;
        return {
            principal: STATE.result.principal,
            months: STATE.result.months,
            annualRate: STATE.result.annualRate,
            method: STATE.result.method,
            monthlyPayment: STATE.result.monthlyPayment,
            firstInstallment: STATE.result.firstInstallment,
            lastInstallment: STATE.result.lastInstallment,
            totalInterest: STATE.result.totalInterest,
            totalPayment: STATE.result.totalPayment,
            interestRatio: STATE.result.totalPayment > 0
                ? (STATE.result.totalInterest / STATE.result.principal) * 100
                : 0
        };
    }

    // ─────────────────────────────────────
    // 🎬 سناریوها
    // ─────────────────────────────────────
    function _loadScenarios() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(SCENARIOS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveScenarios(list) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(SCENARIOS_KEY, list);
    }

    function saveScenario(name) {
        if (!name || String(name).trim().length < 2) {
            return { ok: false, reason: 'no_name' };
        }
        if (!STATE.result || !STATE.result.ok) {
            return { ok: false, reason: 'no_result' };
        }

        var user = _user();
        var scenario = {
            id: _genId('scn'),
            name: String(name).trim(),
            input: JSON.parse(JSON.stringify(STATE.input)),
            summary: getSummary(),
            createdBy: user ? user.id : null,
            createdByName: user ? (user.name || user.username) : null,
            createdAt: Date.now()
        };

        var all = _loadScenarios();
        all.push(scenario);
        if (!_saveScenarios(all)) {
            return { ok: false, reason: 'storage_error' };
        }

        STATE.scenarios = all;
        _emit(CalcEvents.SCENARIO_SAVED, {
            scenario: { id: scenario.id, name: scenario.name }
        });
        return { ok: true, scenario: scenario };
    }

    function loadScenario(id) {
        var all = _loadScenarios();
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].id === id) {
                STATE.input = JSON.parse(JSON.stringify(all[i].input));
                _recompute();
                _emit(CalcEvents.SCENARIO_LOADED, {
                    scenario: { id: all[i].id, name: all[i].name }
                });
                return { ok: true, scenario: all[i] };
            }
        }
        return { ok: false, reason: 'not_found' };
    }

    function deleteScenario(id) {
        var all = _loadScenarios();
        var idx = -1;
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].id === id) { idx = i; break; }
        }
        if (idx === -1) return { ok: false, reason: 'not_found' };

        var removed = all.splice(idx, 1)[0];
        if (!_saveScenarios(all)) {
            all.splice(idx, 0, removed);
            return { ok: false, reason: 'storage_error' };
        }

        STATE.scenarios = all;
        _emit(CalcEvents.SCENARIO_DELETED, { scenarioId: id });
        return { ok: true, scenario: removed };
    }

    function getScenarios() {
        return _loadScenarios();
    }

    function clearScenarios() {
        if (typeof Storage === 'undefined') return false;
        Storage.remove(SCENARIOS_KEY);
        STATE.scenarios = [];
        return true;
    }

    // ─────────────────────────────────────
    // 📤 خروجی CSV جدول بازپرداخت
    // ─────────────────────────────────────
    function exportScheduleCSV() {
        if (!STATE.schedule || STATE.schedule.length === 0) {
            _toast('warning', 'جدول بازپرداختی وجود ندارد', 'توجه');
            return { ok: false, reason: 'no_schedule' };
        }

        var headers = ['ماه', 'قسط', 'اصل', 'سود', 'مانده'];
        var rows = [headers];
        for (var i = 0; i < STATE.schedule.length; i++) {
            var r = STATE.schedule[i];
            rows.push([
                String(r.month),
                String(Math.round(r.payment)),
                String(Math.round(r.principal)),
                String(Math.round(r.interest)),
                String(Math.round(r.balance))
            ]);
        }

        var csv = rows.map(function (row) {
            return row.join(',');
        }).join('\n');

        var blob;
        try {
            blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        } catch (e) {
            window.open('data:text/csv;charset=utf-8,' + encodeURIComponent(csv), '_blank');
            _emit(CalcEvents.SCHEDULE_EXPORTED, { count: STATE.schedule.length });
            return { ok: true, count: STATE.schedule.length };
        }

        var ts = new Date().toISOString().slice(0, 10);
        var filename = 'wampay-schedule-' + ts + '.csv';

        if (navigator.msSaveBlob) {
            navigator.msSaveBlob(blob, filename);
        } else {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
                document.body.removeChild(a);
                URL.revokeObjectURL(a.href);
            }, 200);
        }

        _emit(CalcEvents.SCHEDULE_EXPORTED, { count: STATE.schedule.length });
        _toast('success', _fa(STATE.schedule.length) + ' ردیف خروجی گرفته شد', 'موفق');
        return { ok: true, count: STATE.schedule.length };
    }

    // ─────────────────────────────────────
    // 📊 داده نمودار
    // ─────────────────────────────────────
    function getChartData() {
        if (!STATE.result || !STATE.result.ok) return null;
        var r = STATE.result;

        // Pie: principal vs interest
        var pie = [
            { label: 'اصل وام',     value: r.principal,     color: '#105b35' },
            { label: 'سود پرداختی', value: r.totalInterest, color: '#d4a62a' }
        ];

        // Bar: monthly principal/interest
        var bar = [];
        var step = Math.max(1, Math.ceil(r.schedule.length / 12));
        for (var i = 0; i < r.schedule.length; i += step) {
            var s = r.schedule[i];
            bar.push({
                month: s.month,
                principal: s.principal,
                interest: s.interest
            });
        }

        return {
            pie: pie,
            bar: bar,
            totals: {
                principal: r.principal,
                interest: r.totalInterest,
                payment: r.totalPayment
            }
        };
    }

    // ─────────────────────────────────────
    // 🎨 رندر — فرم ورودی
    // ─────────────────────────────────────
    function _renderInputForm() {
        var inp = STATE.input;

        // Preset رادیوها
        var presetsHtml = '';
        for (var p = 0; p < PRESET_RATES.length; p++) {
            var pr = PRESET_RATES[p];
            presetsHtml += '<button type="button" ' +
                'class="wam-calc__preset' +
                (inp.rate === pr.rate ? ' is-active' : '') + '" ' +
                'data-calc-action="preset" data-rate="' + pr.rate + '">' +
                _esc(pr.label) + '</button>';
        }

        // Methods
        var methodOpts = '';
        for (var m in METHOD_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(METHOD_LABELS, m)) continue;
            methodOpts += '<option value="' + m + '"' +
                (inp.method === m ? ' selected' : '') + '>' +
                _esc(METHOD_LABELS[m]) + '</option>';
        }

        // Rate types
        var rateTypeOpts = '';
        for (var rt in RATE_TYPE_LABELS) {
            if (!Object.prototype.hasOwnProperty.call(RATE_TYPE_LABELS, rt)) continue;
            rateTypeOpts += '<option value="' + rt + '"' +
                (inp.rateType === rt ? ' selected' : '') + '>' +
                _esc(RATE_TYPE_LABELS[rt]) + '</option>';
        }

        return '<div class="wam-calc__form">' +
            '<div class="wam-field">' +
                '<label>مبلغ وام (ریال)</label>' +
                '<input type="text" inputmode="numeric" data-calc="principal" ' +
                'value="' + _esc(inp.principal ? String(inp.principal) : '') + '" ' +
                'placeholder="مثال: 500000000">' +
            '</div>' +

            '<div class="wam-calc__presets">' + presetsHtml + '</div>' +

            '<div class="wam-calc__row">' +
                '<div class="wam-field">' +
                    '<label>نرخ سود</label>' +
                    '<input type="number" min="0" max="100" step="0.1" ' +
                    'data-calc="rate" value="' + _esc(inp.rate) + '">' +
                '</div>' +
                '<div class="wam-field">' +
                    '<label>نوع نرخ</label>' +
                    '<select data-calc="rateType">' + rateTypeOpts + '</select>' +
                '</div>' +
            '</div>' +

            '<div class="wam-calc__row">' +
                '<div class="wam-field">' +
                    '<label>مدت</label>' +
                    '<input type="number" min="1" max="360" step="1" ' +
                    'data-calc="duration" value="' + _esc(inp.duration) + '">' +
                '</div>' +
                '<div class="wam-field">' +
                    '<label>واحد مدت</label>' +
                    '<select data-calc="durationUnit">' +
                        '<option value="month"' +
                        (inp.durationUnit === 'month' ? ' selected' : '') + '>ماه</option>' +
                        '<option value="year"' +
                        (inp.durationUnit === 'year' ? ' selected' : '') + '>' +
                        'سال</option>' +
                    '</select>' +
                '</div>' +
            '</div>' +

            '<div class="wam-field">' +
                '<label>روش محاسبه</label>' +
                '<select data-calc="method">' + methodOpts + '</select>' +
            '</div>' +

            '<div class="wam-calc__form-actions">' +
                '<button type="button" class="wam-btn wam-btn--ghost" ' +
                'data-calc-action="reset">پاک کردن</button>' +
                '<button type="button" class="wam-btn wam-btn--ghost" ' +
                'data-calc-action="save-scenario">💾 ذخیره سناریو</button>' +
            '</div>' +
        '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — کارت خلاصه
    // ─────────────────────────────────────
    function _renderSummaryCard() {
        var s = getSummary();
        if (!s) {
            return '<div class="wam-empty">' +
                'برای مشاهده نتیجه، مبلغ و مدت را وارد کنید.</div>';
        }

        return '<div class="wam-calc__summary">' +
            '<div class="wam-calc__summary-grid">' +
                _summaryItem('💰 قسط ماهانه', _amt(s.monthlyPayment), 'primary', 'ریال') +
                _summaryItem('📊 مجموع پرداختی', _amt(s.totalPayment), '', 'ریال') +
                _summaryItem('📈 مجموع سود', _amt(s.totalInterest), 'warning', 'ریال') +
                _summaryItem('🎯 نسبت سود', _fa(Math.round(s.interestRatio)) + '٪', 'info') +
                _summaryItem('📅 مدت', _fa(s.months) + ' ماه', '') +
                _summaryItem('📉 نرخ سالانه', _fa(Math.round(s.annualRate * 100 * 10) / 10) + '٪', '') +
            '</div>' +
            (s.firstInstallment !== s.lastInstallment ?
                '<div class="wam-calc__installment-range">' +
                'قسط اول: ' + _amt(s.firstInstallment) + ' — ' +
                'قسط آخر: ' + _amt(s.lastInstallment) + ' ریال' +
                '</div>' : '') +
        '</div>';
    }

    function _summaryItem(label, value, accent, unit) {
        return '<div class="wam-calc__stat' +
            (accent ? ' wam-calc__stat--' + accent : '') + '">' +
            '<div class="wam-calc__stat-label">' + _esc(label) + '</div>' +
            '<div class="wam-calc__stat-value">' + _esc(value) +
            (unit ? ' <small>' + _esc(unit) + '</small>' : '') +
            '</div></div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نمودار ساده (CSS bars)
    // ─────────────────────────────────────
    function _renderChart() {
        var chart = getChartData();
        if (!chart) return '';

        var total = chart.totals.payment || 1;
        var principalPct = (chart.totals.principal / total) * 100;
        var interestPct = (chart.totals.interest / total) * 100;

        return '<div class="wam-calc__chart">' +
            '<div class="wam-calc__chart-title">ترکیب پرداختی</div>' +
            '<div class="wam-calc__bar">' +
                '<div class="wam-calc__bar-fill wam-calc__bar-fill--principal" ' +
                'style="width:' + principalPct + '%"></div>' +
                '<div class="wam-calc__bar-fill wam-calc__bar-fill--interest" ' +
                'style="width:' + interestPct + '%"></div>' +
            '</div>' +
            '<div class="wam-calc__legend">' +
                '<span><span class="wam-calc__dot wam-calc__dot--principal"></span>' +
                ' اصل: ' + _fa(Math.round(principalPct)) + '٪</span>' +
                '<span><span class="wam-calc__dot wam-calc__dot--interest"></span>' +
                ' سود: ' + _fa(Math.round(interestPct)) + '٪</span>' +
            '</div>' +
        '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — جدول بازپرداخت
    // ─────────────────────────────────────
    function _renderScheduleTable() {
        if (!STATE.schedule || STATE.schedule.length === 0) return '';

        var rows = STATE.schedule;
        var html = '<div class="wam-calc__schedule">';
        html += '<div class="wam-calc__schedule-head">' +
                '<h3>📅 جدول بازپرداخت (' + _fa(rows.length) + ' قسط)</h3>' +
                '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                'data-calc-action="export-csv">📤 CSV</button>' +
                '</div>';

        html += '<div class="wam-calc__schedule-wrap">' +
                '<table class="wam-calc__schedule-table">' +
                '<thead><tr>' +
                    '<th>#</th>' +
                    '<th>قسط</th>' +
                    '<th>اصل</th>' +
                    '<th>سود</th>' +
                    '<th>مانده</th>' +
                '</tr></thead><tbody>';

        // فقط ۶۰ ردیف اول (برای عملکرد)
        var limit = Math.min(rows.length, 60);
        for (var i = 0; i < limit; i++) {
            var r = rows[i];
            html += '<tr>' +
                '<td>' + _fa(r.month) + '</td>' +
                '<td>' + _amt(r.payment) + '</td>' +
                '<td>' + _amt(r.principal) + '</td>' +
                '<td>' + _amt(r.interest) + '</td>' +
                '<td>' + _amt(r.balance) + '</td>' +
            '</tr>';
        }

        if (rows.length > limit) {
            html += '<tr class="wam-calc__more-row"><td colspan="5">' +
                '… و ' + _fa(rows.length - limit) + ' ردیف دیگر' +
                '</td></tr>';
        }

        html += '</tbody></table></div></div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — سناریوها
    // ─────────────────────────────────────
    function _renderScenarios() {
        var list = getScenarios();
        if (list.length === 0) return '';

        var html = '<div class="wam-calc__scenarios">';
        html += '<h3>💾 سناریوهای ذخیره‌شده</h3>';
        html += '<ul class="wam-calc__scenario-list">';

        for (var i = list.length - 1; i >= 0; i--) {
            var s = list[i];
            var sm = s.summary || {};
            html += '<li class="wam-calc__scenario" data-scenario-id="' +
                _esc(s.id) + '">' +
                '<div class="wam-calc__scenario-head">' +
                    '<strong>' + _esc(s.name) + '</strong>' +
                    '<span class="wam-calc__scenario-date">' +
                    _esc(_jalali(s.createdAt)) + '</span>' +
                '</div>' +
                '<div class="wam-calc__scenario-body">' +
                    '<span>مبلغ: ' + _amt(sm.principal) + '</span>' +
                    '<span>قسط: ' + _amt(sm.monthlyPayment) + '</span>' +
                    '<span>مدت: ' + _fa(sm.months) + ' ماه</span>' +
                '</div>' +
                '<div class="wam-calc__scenario-actions">' +
                    '<button class="wam-btn wam-btn--sm" ' +
                    'data-calc-action="load-scenario" data-id="' +
                    _esc(s.id) + '">بازیابی</button>' +
                    '<button class="wam-btn wam-btn--sm wam-btn--ghost ' +
                    'wam-btn--danger" data-calc-action="delete-scenario" ' +
                    'data-id="' + _esc(s.id) + '">🗑️</button>' +
                '</div>' +
            '</li>';
        }

        html += '</ul></div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;

        var html =
            '<div class="wam-calc">' +
                '<div class="wam-calc__header">' +
                    '<h3>🧮 ماشین‌حساب وام</h3>' +
                    '<p class="wam-calc__desc">محاسبه قسط، سود و جدول بازپرداخت</p>' +
                '</div>' +
                _renderInputForm() +
                _renderSummaryCard() +
                _renderChart() +
                _renderScheduleTable() +
                _renderScenarios() +
            '</div>';

        STATE.root.innerHTML = html;
        _bindEvents();
        _bindInputs();

        _emit(CalcEvents.RENDERED, { at: Date.now() });
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindInputs() {
        if (!STATE.root) return;

        var inputs = STATE.root.querySelectorAll('[data-calc]');
        for (var i = 0; i < inputs.length; i++) {
            var el = inputs[i];
            var key = el.getAttribute('data-calc');
            if (!key) continue;

            el.addEventListener('input', function () {
                var k = this.getAttribute('data-calc');
                var v = this.value;

                if (k === 'principal') {
                    var cleanVal = _en(v).replace(/\D/g, '');
                    STATE.input.principal = Number(cleanVal) || 0;
                } else if (k === 'rate') {
                    STATE.input.rate = Number(_en(v)) || 0;
                } else if (k === 'duration') {
                    STATE.input.duration = Number(_en(v)) || 0;
                }
                _recompute();
                _partialRender();
            });

            el.addEventListener('change', function () {
                var k = this.getAttribute('data-calc');
                var v = this.value;

                if (k === 'rateType') STATE.input.rateType = v;
                else if (k === 'durationUnit') STATE.input.durationUnit = v;
                else if (k === 'method') STATE.input.method = v;

                _recompute();
                render();
            });
        }
    }

    function _partialRender() {
        if (!STATE.root) return;
        // فقط بخش summary و chart و schedule را رندر کن
        var summaryEl = STATE.root.querySelector('.wam-calc__summary');
        if (summaryEl) {
            var tmp = document.createElement('div');
            tmp.innerHTML = _renderSummaryCard();
            var newSummary = tmp.firstChild;
            if (newSummary) summaryEl.parentNode.replaceChild(newSummary, summaryEl);
        }

        var chartEl = STATE.root.querySelector('.wam-calc__chart');
        if (chartEl) {
            var tmp2 = document.createElement('div');
            tmp2.innerHTML = _renderChart();
            var newChart = tmp2.firstChild;
            if (newChart) chartEl.parentNode.replaceChild(newChart, chartEl);
            else chartEl.parentNode.removeChild(chartEl);
        }

        var scheduleEl = STATE.root.querySelector('.wam-calc__schedule');
        if (scheduleEl) {
            var tmp3 = document.createElement('div');
            tmp3.innerHTML = _renderScheduleTable();
            var newSchedule = tmp3.firstChild;
            if (newSchedule) scheduleEl.parentNode.replaceChild(newSchedule, scheduleEl);
            else scheduleEl.parentNode.removeChild(scheduleEl);
        }

        // rebind export CSV button
        var csvBtn = STATE.root.querySelector('[data-calc-action="export-csv"]');
        if (csvBtn) {
            csvBtn.addEventListener('click', function (e) {
                e.preventDefault();
                exportScheduleCSV();
            });
        }
    }

    function _bindEvents() {
        if (!STATE.root) return;

        var btns = STATE.root.querySelectorAll('[data-calc-action]');
        for (var i = 0; i < btns.length; i++) {
            if (btns[i].dataset.calcBound) continue;
            btns[i].addEventListener('click', _handleAction);
            btns[i].dataset.calcBound = '1';
        }
    }

    function _handleAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-calc-action');

        if (a === 'reset') {
            reset();
            render();
            _toast('info', 'فرم پاک شد', 'موفق');
            return;
        }
        if (a === 'preset') {
            var rate = this.getAttribute('data-rate');
            applyPreset(rate);
            render();
            return;
        }
        if (a === 'save-scenario') {
            _promptSaveScenario();
            return;
        }
        if (a === 'load-scenario') {
            var id = this.getAttribute('data-id');
            var r = loadScenario(id);
            if (r.ok) {
                render();
                _toast('success', 'سناریو بارگذاری شد', 'موفق');
            }
            return;
        }
        if (a === 'delete-scenario') {
            var did = this.getAttribute('data-id');
            _confirmDeleteScenario(did);
            return;
        }
        if (a === 'export-csv') {
            exportScheduleCSV();
            return;
        }

        _emit(CalcEvents.ACTION, { action: a });
    }

    function _promptSaveScenario() {
        if (!STATE.result || !STATE.result.ok) {
            _toast('warning', 'ابتدا محاسبه را انجام دهید', 'توجه');
            return;
        }

        var existing = document.getElementById('wamCalcSaveModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var modal = document.createElement('div');
        modal.id = 'wamCalcSaveModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel">' +
                '<header class="wam-modal__head">' +
                    '<h3>💾 ذخیره سناریو</h3>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<form class="wam-modal__body">' +
                    '<div class="wam-field"><label>نام سناریو</label>' +
                        '<input name="name" placeholder="مثال: وام مسکن ۵۰۰ میلیون" ' +
                        'autofocus required></div>' +
                    '<footer class="wam-modal__footer">' +
                        '<button type="button" class="wam-btn wam-btn--ghost" ' +
                        'data-close>انصراف</button>' +
                        '<button type="submit" class="wam-btn wam-btn--primary">' +
                        'ذخیره</button>' +
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
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var name = form.querySelector('[name="name"]').value.trim();
            var r = saveScenario(name);
            if (r.ok) {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
                render();
                _toast('success', 'سناریو «' + name + '» ذخیره شد', 'موفق');
            } else {
                _toast('error', 'خطا در ذخیره', 'خطا');
            }
        });

        setTimeout(function () {
            var inp = form.querySelector('[name="name"]');
            if (inp) inp.focus();
        }, 50);
    }

    function _confirmDeleteScenario(id) {
        var msg = 'این سناریو حذف شود؟';
        var doIt = function () {
            var r = deleteScenario(id);
            if (r.ok) {
                render();
                _toast('success', 'سناریو حذف شد', 'موفق');
            }
        };
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('حذف سناریو', msg, { danger: true })
                .then(function (ok) { if (ok) doIt(); });
        } else if (window.confirm(msg)) {
            doIt();
        }
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
                       document.querySelector('.wam-calculator');
            if (!root) {
                if (options.debug) console.warn('[calculator] root پیدا نشد');
                return;
            }
            STATE.root = root;

            // مقادیر اولیه
            if (options.principal) STATE.input.principal = Number(options.principal);
            if (options.rate) STATE.input.rate = Number(options.rate);
            if (options.duration) STATE.input.duration = Number(options.duration);
            if (options.method) STATE.input.method = options.method;

            STATE.scenarios = _loadScenarios();
            _recompute(true);
            render();

            STATE.installed = true;

            _emit(CalcEvents.READY, {
                input: STATE.input,
                hasResult: !!(STATE.result && STATE.result.ok)
            });

            if (options.debug) {
                console.log('[calculator] v' + VERSION + ' آماده');
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

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            version: VERSION,
            installed: STATE.installed,
            hasResult: !!(STATE.result && STATE.result.ok),
            scheduleCount: STATE.schedule.length,
            scenariosCount: getScenarios().length,
            input: JSON.parse(JSON.stringify(STATE.input))
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
    var WamCalculator = {
        VERSION: VERSION,
        EVENTS: CalcEvents,
        ROOT_ATTR: ROOT_ATTR,
        SCENARIOS_KEY: SCENARIOS_KEY,
        METHODS: METHODS,
        METHOD_LABELS: METHOD_LABELS,
        RATE_TYPES: RATE_TYPES,
        RATE_TYPE_LABELS: RATE_TYPE_LABELS,
        PRESET_RATES: PRESET_RATES,
        DEFAULT_RATE: DEFAULT_RATE,

        // چرخه
        install: install,
        uninstall: uninstall,
        render: render,
        reset: reset,

        // محاسبه
        compute: compute,
        recompute: _recompute,
        getResult: getResult,
        getSummary: getSummary,
        getSchedule: getSchedule,
        getInput: getInput,
        getChartData: getChartData,

        // تنظیمات
        setInput: setInput,
        setPrincipal: setPrincipal,
        setRate: setRate,
        setDuration: setDuration,
        setMethod: setMethod,
        setRateType: setRateType,
        applyPreset: applyPreset,

        // سناریوها
        saveScenario: saveScenario,
        loadScenario: loadScenario,
        deleteScenario: deleteScenario,
        getScenarios: getScenarios,
        clearScenarios: clearScenarios,

        // خروجی
        exportScheduleCSV: exportScheduleCSV,

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamCalculator = WamCalculator;
    window.CalculatorEvents = CalcEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-calculator-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-calculator')) {
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