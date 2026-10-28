// ==========================================
// وام پی — Core Layer
// فایل: init.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: راه‌اندازی هسته، اجرای migrations، ساخت WamPay API
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔒 بررسی وجود وابستگی‌ها
    // ─────────────────────────────────────
    function checkDependencies() {
        var missing = [];
        if (typeof Storage === 'undefined' || !Storage.PREFIX) missing.push('storage.js');
        if (typeof EventBus === 'undefined') missing.push('event-bus.js');
        if (typeof WamUI === 'undefined') missing.push('ui-feedback.js');
        if (typeof CaseRepository === 'undefined') missing.push('case-repository.js');
        if (typeof Migrations === 'undefined') missing.push('migrations.js');

        return {
            ok: missing.length === 0,
            missing: missing
        };
    }

    // ─────────────────────────────────────
    // 🩺 بررسی سلامت هسته
    // ─────────────────────────────────────
    function healthCheck() {
        var report = {
            storage: Storage.isAvailable(),
            caseRepo: typeof CaseRepository.getAll === 'function',
            eventBus: typeof EventBus.emit === 'function',
            ui: typeof WamUI.toast === 'function',
            migrations: typeof Migrations.runAll === 'function',
            timestamp: Date.now()
        };
        report.ok = report.storage && report.caseRepo &&
                    report.eventBus && report.ui && report.migrations;
        return report;
    }

    // ─────────────────────────────────────
    // 🚀 اجرای migrations
    // ─────────────────────────────────────
    function runMigrations() {
        try {
            var status = Migrations.getStatus();
            if (!status.needsMigration) {
                return Promise.resolve({
                    ok: true,
                    skipped: true,
                    message: 'نیازی به مهاجرت نیست'
                });
            }

            // نمایش loader در صورت وجود UI
            if (WamUI && WamUI.loader && typeof WamUI.loader.show === 'function') {
                WamUI.loader.show('وام پی', 'در حال به‌روزرسانی داده‌ها...');
            }

            return Migrations.runAll().then(function (result) {
                if (WamUI && WamUI.loader && typeof WamUI.loader.hide === 'function') {
                    WamUI.loader.hide();
                }

                if (result && result.migrated > 0) {
                    WamUI.toastSuccess(
                        result.migrated + ' پرونده با موفقیت مهاجرت شد',
                        'به‌روزرسانی'
                    );
                }

                EventBus.emit(CaseEvents.MIGRATION_DONE, result);
                return result;
            }).catch(function (err) {
                if (WamUI && WamUI.loader && typeof WamUI.loader.hide === 'function') {
                    WamUI.loader.hide();
                }
                console.error('[WamPay:init] خطا در مهاجرت:', err);
                WamUI.toastError('خطا در به‌روزرسانی داده‌ها', 'خطا');
                return { ok: false, error: err };
            });
        } catch (err) {
            console.error('[WamPay:init] خطای غیرمنتظره در migrations:', err);
            return Promise.resolve({ ok: false, error: err });
        }
    }

    // ─────────────────────────────────────
    // 📊 بررسی ظرفیت Storage
    // ─────────────────────────────────────
    function checkStorageCapacity() {
        try {
            var info = Storage.getInfo();
            if (info.percent >= 90) {
                EventBus.emit(CaseEvents.STORAGE_FULL, info);
                WamUI.toastWarning(
                    'فضای ذخیره‌سازی تقریباً پر است (' + info.percent + '%)',
                    'هشدار'
                );
            }
            return info;
        } catch (err) {
            console.warn('[WamPay:init] خطا در بررسی ظرفیت:', err);
            return null;
        }
    }

    // ─────────────────────────────────────
    // 🌐 ساخت API جهانی WamPay
    // ─────────────────────────────────────
    function buildWamPayAPI() {
        var api = {
            version: '1.0.0',
            buildDate: '1405/01/15',

            // ماژول‌های اصلی
            storage: Storage,
            events: EventBus,
            ui: WamUI,
            cases: CaseRepository,
            migrations: Migrations,

            // ثابت‌های رویداد
            CaseEvents: CaseEvents,

            // ابزارها
            health: healthCheck,
            isReady: false,
            readyAt: null
        };

        // متدهای میان‌بر پرکاربرد
        api.getCase = function (id) { return CaseRepository.get(id); };
        api.getAllCases = function () { return CaseRepository.getAll(); };
        api.on = function (evt, fn, opts) { return EventBus.on(evt, fn, opts); };
        api.emit = function (evt, data) { return EventBus.emit(evt, data); };
        api.toast = function (msg, type, dur) { return WamUI.toast(msg, type, dur); };

        return api;
    }

    // ─────────────────────────────────────
    // 🎬 اجرای اصلی init
    // ─────────────────────────────────────
    function init() {
        console.log('%c🚀 وام پی — راه‌اندازی هسته', 'color:#d4a62a;font-weight:bold;font-size:14px');

        // ۱. بررسی وابستگی‌ها
        var deps = checkDependencies();
        if (!deps.ok) {
            console.error('[WamPay:init] ❌ وابستگی‌های گم‌شده:', deps.missing);
            if (typeof WamUI !== 'undefined' && WamUI.toastError) {
                WamUI.toastError('خطا در راه‌اندازی: فایل‌های هسته ناقص هستند', 'خطای بحرانی');
            }
            return;
        }
        console.log('%c✅ وابستگی‌ها بررسی شد', 'color:#105b35;font-weight:bold');

        // ۲. بررسی سلامت
        var health = healthCheck();
        if (!health.ok) {
            console.error('[WamPay:init] ❌ هسته ناسالم:', health);
            return;
        }
        console.log('%c✅ سلامت هسته تأیید شد', 'color:#105b35;font-weight:bold');

        // ۳. ثبت API جهانی
        window.WamPay = buildWamPayAPI();

        // ۴. بررسی ظرفیت Storage
        var storageInfo = checkStorageCapacity();
        if (storageInfo) {
            console.log('[WamPay:init] وضعیت Storage:',
                storageInfo.sizeKB + 'KB',
                '(' + storageInfo.percent + '%)');
        }

        // ۵. اجرای migrations (async)
        runMigrations().then(function (result) {
            // ۶. علامت‌گذاری آماده بودن
            window.WamPay.isReady = true;
            window.WamPay.readyAt = Date.now();

            // ۷. اعلام رویداد آماده بودن هسته
            EventBus.emit(CaseEvents.CORE_READY, {
                version: window.WamPay.version,
                readyAt: window.WamPay.readyAt,
                migration: result
            });

            console.log(
                '%c✅ هسته وام پی آماده است',
                'color:#d4a62a;font-weight:bold;font-size:14px'
            );
            console.log('[WamPay:init] WamPay API: window.WamPay');
        });
    }

    // ─────────────────────────────────────
    // 🚦 راه‌اندازی بر اساس وضعیت DOM
    // ─────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOM آماده است
        init();
    }

    // ─────────────────────────────────────
    // 📤 خروجی‌ها برای debug
    // ─────────────────────────────────────
    window.WamPayInit = {
        init: init,
        healthCheck: healthCheck,
        checkDependencies: checkDependencies
    };

})();