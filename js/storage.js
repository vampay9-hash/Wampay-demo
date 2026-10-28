// ==========================================
// وام پی — Storage Layer
// فایل: js/storage.js
// نسخه: ۱.۱
// تاریخ: 1405/01/15
// توضیح: لایه ذخیره‌سازی localStorage
// ==========================================

(function () {
    'use strict';

    // ==========================================
    // تنظیمات
    // ==========================================

    const PREFIX = 'wamPay';
    const ESTIMATED_MAX = 5 * 1024 * 1024; // 5 MB
    let quotaWarned = false;

    // ==========================================
    // توابع اصلی — Get
    // ==========================================

    function get(key, defaultValue) {
        try {
            const value = localStorage.getItem(key);
            return value === null
                ? (defaultValue !== undefined ? defaultValue : null)
                : value;
        } catch (e) {
            return defaultValue !== undefined ? defaultValue : null;
        }
    }

    function getJSON(key, defaultValue) {
        try {
            const value = localStorage.getItem(key);
            if (value === null) {
                return defaultValue !== undefined ? defaultValue : null;
            }
            return JSON.parse(value);
        } catch (e) {
            console.error('❌ Storage.getJSON error:', key, e);
            return defaultValue !== undefined ? defaultValue : null;
        }
    }

    // ==========================================
    // توابع اصلی — Set
    // ==========================================

    function set(key, value) {
        try {
            localStorage.setItem(key, String(value));
            return true;
        } catch (e) {
            handleQuotaError(e, key);
            return false;
        }
    }

    function setJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            handleQuotaError(e, key);
            return false;
        }
    }

    // ==========================================
    // خطای پر شدن حافظه
    // ==========================================

    function handleQuotaError(e, key) {

        console.error('❌ Storage error:', key, e);

        if (e.name === 'QuotaExceededError' || e.code === 22) {

            if (!quotaWarned) {
                quotaWarned = true;

                if (window.WamUI) {
                    window.WamUI.toast(
                        'حافظهٔ مرورگر شما پر شده است. لطفاً برخی پرونده‌های قدیمی را حذف کنید.',
                        'error',
                        8000,
                        { title: '⚠️ حافظه پر شده' }
                    );
                } else {
                    alert('⚠️ حافظهٔ مرورگر پر شده است');
                }

                setTimeout(function () { quotaWarned = false; }, 30000);
            }

            if (window.EventBus && window.CaseEvents) {
                window.EventBus.emit(window.CaseEvents.STORAGE_FULL, {
                    key: key,
                    size: getSize(),
                    percent: getUsagePercent()
                });
            }
        }
    }

    // ==========================================
    // توابع اصلی — Remove / Has
    // ==========================================

    function remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            return false;
        }
    }

    function has(key) {
        try {
            return localStorage.getItem(key) !== null;
        } catch (e) {
            return false;
        }
    }

    // ==========================================
    // توابع لیست کلیدها
    // ==========================================

    function keys(prefix) {
        prefix = prefix || '';
        const result = [];

        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.indexOf(prefix) === 0) {
                    result.push(key);
                }
            }
        } catch (e) {
            console.error('❌ Storage.keys error:', e);
        }

        return result;
    }

    // ==========================================
    // پاک کردن کل داده‌های وام پی
    // ==========================================

    function clearAll() {
        const keysToRemove = keys(PREFIX);
        let count = 0;

        keysToRemove.forEach(function (k) {
            try {
                localStorage.removeItem(k);
                count++;
            } catch (e) {}
        });

        return count;
    }

    // ==========================================
    // محاسبه حجم
    // ==========================================

    function getSize() {
        let total = 0;

        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.indexOf(PREFIX) === 0) {
                    const value = localStorage.getItem(key);
                    total += (key.length + (value ? value.length : 0)) * 2;
                }
            }
        } catch (e) {}

        return total;
    }

    function getAvailableSize() {
        return Math.max(0, ESTIMATED_MAX - getSize());
    }

    function getUsagePercent() {
        return Math.min(100, Math.round((getSize() / ESTIMATED_MAX) * 100));
    }

    function getInfo() {
        const size = getSize();
        return {
            size: size,
            sizeKB: Math.round(size / 1024),
            available: getAvailableSize(),
            max: ESTIMATED_MAX,
            percent: getUsagePercent(),
            keyCount: keys(PREFIX).length
        };
    }

    // ==========================================
    // بررسی پشتیبانی localStorage
    // (iOS Private Mode)
    // ==========================================

    function isAvailable() {
        try {
            const test = '__wam_test__';
            localStorage.setItem(test, '1');
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    }

    // ==========================================
    // Export
    // ==========================================

    window.Storage = {
        get: get,
        getJSON: getJSON,
        set: set,
        setJSON: setJSON,
        remove: remove,
        has: has,
        keys: keys,
        clearAll: clearAll,
        getSize: getSize,
        getAvailableSize: getAvailableSize,
        getUsagePercent: getUsagePercent,
        getInfo: getInfo,
        isAvailable: isAvailable,
        PREFIX: PREFIX
    };

    // ==========================================
    // بررسی اولیه
    // ==========================================

    if (!isAvailable()) {
        console.error('❌ localStorage در دسترس نیست (حالت خصوصی؟)');
    } else {
        const info = getInfo();
        console.log('✅ Storage آماده — ' + info.sizeKB + ' KB (' + info.percent + '%)');
    }

})();