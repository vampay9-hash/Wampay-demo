/* ==========================================
 * WAM PAY — 📦 Common Bundle
 * ==========================================
 * 
 * Bundle خودکار
 * تعداد فایل: 6
 * تاریخ تولید: 2026-09-22T18:45:58.498Z
 * 
 * این فایل به صورت خودکار از چند فایل جداگانه
 * ادغام شده است. تغییرات مستقیم در این فایل
 * با اجرای بعدی Builder پاک می‌شوند.
 * ========================================== */




/* ==========================================
 * FROM: js/storage.js
 * ========================================== */


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




/* ==========================================
 * FROM: js/event-bus.js
 * ========================================== */


// ==========================================
// وام پی — Event Bus
// فایل: js/event-bus.js
// نسخه: ۱.۱
// تاریخ: 1405/01/15
// توضیح: سیستم انتشار/اشتراک رویداد
// ==========================================

(function () {
    'use strict';

    // ==========================================
    // وضعیت داخلی
    // ==========================================

    const listeners = new Map();
    const eventHistory = [];
    const MAX_HISTORY = 100;

    // ==========================================
    // تولید شناسه یکتا
    // ==========================================

    function generateId() {
        return 'evt_' +
               Date.now().toString(36) + '_' +
               Math.random().toString(36).substr(2, 6);
    }

    // ==========================================
    // ثبت شنونده (Subscribe)
    // ==========================================

    function on(eventName, handler, options) {

        options = options || {};

        if (!eventName || typeof handler !== 'function') {
            return function () {};
        }

        if (!listeners.has(eventName)) {
            listeners.set(eventName, []);
        }

        const listener = {
            id: generateId(),
            handler: handler,
            once: options.once === true,
            priority: options.priority || 0
        };

        const list = listeners.get(eventName);
        list.push(listener);

        // مرتب‌سازی بر اساس اولویت (بالاتر اول)
        list.sort(function (a, b) {
            return b.priority - a.priority;
        });

        // بازگرداندن تابع لغو اشتراک
        return function unsubscribe() {
            const currentList = listeners.get(eventName);
            if (!currentList) return;

            const idx = currentList.findIndex(function (l) {
                return l.id === listener.id;
            });

            if (idx !== -1) currentList.splice(idx, 1);
        };
    }

    // ==========================================
    // ثبت شنونده یک‌بارمصرف (Once)
    // ==========================================

    function once(eventName, handler) {
        return on(eventName, handler, { once: true });
    }

    // ==========================================
    // حذف شنونده (Unsubscribe)
    // ==========================================

    function off(eventName, handler) {
        const list = listeners.get(eventName);
        if (!list) return;

        const idx = list.findIndex(function (l) {
            return l.handler === handler;
        });

        if (idx !== -1) list.splice(idx, 1);
    }

    // ==========================================
    // انتشار رویداد (Publish)
    // ==========================================

    function emit(eventName, data) {

        if (!eventName) return;

        data = data || {};

        const event = {
            id: generateId(),
            name: eventName,
            data: data,
            timestamp: new Date().toISOString()
        };

        // ثبت در تاریخچه
        eventHistory.push(event);
        if (eventHistory.length > MAX_HISTORY) {
            eventHistory.shift();
        }

        // لاگ در حالت دیباگ
        if (window.WamPayDebugMode) {
            console.log('📡 EventBus:', eventName, data);
        }

        const list = listeners.get(eventName);
        if (!list || list.length === 0) return;

        const toRemove = [];

        list.forEach(function (listener) {
            try {
                listener.handler(data, event);

                if (listener.once) {
                    toRemove.push(listener.id);
                }
            } catch (err) {
                console.error('❌ EventBus error [' + eventName + ']:', err);
            }
        });

        // حذف شنونده‌های once
        if (toRemove.length > 0) {
            const updated = list.filter(function (l) {
                return toRemove.indexOf(l.id) === -1;
            });
            listeners.set(eventName, updated);
        }
    }

    // ==========================================
    // پاک‌سازی
    // ==========================================

    function clear(eventName) {
        if (eventName) {
            listeners.delete(eventName);
        } else {
            listeners.clear();
        }
    }

    // ==========================================
    // تاریخچه رویدادها
    // ==========================================

    function getHistory(filterEventName) {
        if (filterEventName) {
            return eventHistory.filter(function (e) {
                return e.name === filterEventName;
            });
        }
        return eventHistory.slice();
    }

    // ==========================================
    // اطلاعات وضعیت
    // ==========================================

    function getActiveEvents() {
        return Array.from(listeners.keys());
    }

    function listenerCount(eventName) {
        const list = listeners.get(eventName);
        return list ? list.length : 0;
    }

    // ==========================================
    // Export — EventBus
    // ==========================================

    window.EventBus = {
        on: on,
        once: once,
        off: off,
        emit: emit,
        clear: clear,
        getHistory: getHistory,
        getActiveEvents: getActiveEvents,
        listenerCount: listenerCount
    };

    // ==========================================
    // Export — CaseEvents (نام رویدادها)
    // ==========================================

    window.CaseEvents = {
        // پرونده
        CREATED: 'case.created',
        UPDATED: 'case.updated',
        DELETED: 'case.deleted',

        // قفل
        LOCKED: 'case.locked',
        UNLOCKED: 'case.unlocked',
        LOCK_ERROR: 'case.lock.error',

        // مراحل
        STEP_CHANGED: 'case.step.changed',
        STEP_APPROVED: 'case.step.approved',
        STEP_REJECTED: 'case.step.rejected',

        // تأییدهای ادمین
        ADMIN_APPROVED: 'case.admin.approved',
        ADMIN_REJECTED: 'case.admin.rejected',

        // اقدامات کاربران
        BROKER_ACTION: 'user.broker.action',
        APPLICANT_ACTION: 'user.applicant.action',
        ADMIN_ACTION: 'user.admin.action',

        // اتمام
        COMPLETED: 'case.completed',
        ROLLED_BACK: 'case.rolledback',

        // اعلان و گفتگو
        NOTIFICATION_ADDED: 'notif.added',
        NOTIFICATION_READ: 'notif.read',
        MESSAGE_SENT: 'chat.message.sent',
        MESSAGE_READ: 'chat.message.read',

        // سیستم
        STORAGE_FULL: 'storage.full',
        CORE_READY: 'core.ready',
        MIGRATION_DONE: 'migration.completed',
        MIGRATION_PROGRESS: 'migration.progress'
    };

    // ==========================================
    // لاگ راه‌اندازی
    // ==========================================

    console.log('✅ EventBus آماده');

})();




/* ==========================================
 * FROM: js/ui-feedback.js
 * ========================================== */


// ==========================================
// وام پی — UI Feedback
// فایل: js/ui-feedback.js
// نسخه: ۱.۰
// تاریخ: 1405/01/15
// توضیح: Toast + Loader + Confirm + Debug Panel
// ==========================================

(function () {
    'use strict';

    // ==========================================
    // تزریق CSS
    // ==========================================

    function injectStyles() {

        if (document.getElementById('wamUI-Styles')) return;

        const style = document.createElement('style');
        style.id = 'wamUI-Styles';
        style.textContent = `

            /* ===== RESET TOUCH ===== */
            * {
                -webkit-tap-highlight-color: transparent;
                touch-action: manipulation;
            }

            /* ===== TOAST ===== */
            .wam-toast-container {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                pointer-events: none;
                z-index: 999998;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: flex-end;
                padding: 20px 16px calc(20px + env(safe-area-inset-bottom));
            }

            .wam-toast {
                pointer-events: auto;
                max-width: 400px;
                width: 100%;
                padding: 14px 18px;
                margin-bottom: 10px;
                border-radius: 14px;
                font-family: inherit;
                font-size: 13px;
                font-weight: 700;
                line-height: 1.8;
                text-align: right;
                box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
                display: flex;
                align-items: center;
                gap: 10px;
                transform: translateY(120%);
                opacity: 0;
                transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s;
                direction: rtl;
                -webkit-user-select: none;
                user-select: none;
            }

            .wam-toast.show {
                transform: translateY(0);
                opacity: 1;
            }

            .wam-toast-icon {
                font-size: 20px;
                line-height: 1;
                flex-shrink: 0;
            }

            .wam-toast-body {
                flex: 1;
                min-width: 0;
            }

            .wam-toast-title {
                font-size: 13px;
                font-weight: 900;
                margin-bottom: 2px;
            }

            .wam-toast-text {
                font-size: 11.5px;
                font-weight: 500;
                opacity: 0.9;
                line-height: 1.7;
                word-wrap: break-word;
            }

            .wam-toast-close {
                flex-shrink: 0;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                border: none;
                background: rgba(255, 255, 255, 0.15);
                color: inherit;
                font-size: 16px;
                cursor: pointer;
                display: grid;
                place-items: center;
            }

            .wam-toast.success {
                background: linear-gradient(135deg, #22c55e, #16a34a);
                color: #ffffff;
            }

            .wam-toast.error {
                background: linear-gradient(135deg, #ef4444, #b91c1c);
                color: #ffffff;
            }

            .wam-toast.warning {
                background: linear-gradient(135deg, #fbbf24, #d97706);
                color: #ffffff;
            }

            .wam-toast.info {
                background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                color: #ffffff;
            }

            .wam-toast.gold {
                background: linear-gradient(135deg, #ffe48a, #d5a42a);
                color: #183a26;
            }

            /* ===== LOADER FULLSCREEN ===== */
            .wam-loader {
                position: fixed;
                inset: 0;
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
                background: linear-gradient(135deg, #041f13 0%, #0b3b23 100%);
                color: #ffffff;
                transition: opacity 0.4s ease;
                padding: 20px;
                direction: rtl;
            }

            .wam-loader.hidden {
                opacity: 0;
                pointer-events: none;
            }

            .wam-loader-inner {
                text-align: center;
                max-width: 320px;
                width: 100%;
            }

            .wam-loader-spinner {
                width: 64px;
                height: 64px;
                margin: 0 auto 20px;
                border: 4px solid rgba(244, 212, 119, 0.15);
                border-top-color: #f4d477;
                border-radius: 50%;
                animation: wamSpin 1s linear infinite;
            }

            @keyframes wamSpin {
                to { transform: rotate(360deg); }
            }

            .wam-loader-title {
                font-size: 17px;
                font-weight: 900;
                margin-bottom: 8px;
                color: #f4d477;
            }

            .wam-loader-text {
                font-size: 13px;
                opacity: 0.8;
                margin-bottom: 20px;
                min-height: 20px;
            }

            .wam-loader-progress {
                height: 5px;
                border-radius: 5px;
                background: rgba(255, 255, 255, 0.1);
                overflow: hidden;
            }

            .wam-loader-progress-fill {
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, #ffe48a, #d5a42a);
                border-radius: 5px;
                transition: width 0.3s ease;
            }

            .wam-loader-percent {
                display: inline-block;
                margin-top: 12px;
                font-size: 12px;
                font-weight: 700;
                opacity: 0.6;
            }

            /* ===== DEBUG PANEL ===== */
            .wam-debug-panel {
                position: fixed;
                inset: 0;
                z-index: 999997;
                background: rgba(0, 0, 0, 0.7);
                backdrop-filter: blur(6px);
                display: none;
                direction: rtl;
                padding: 16px;
                overflow-y: auto;
            }

            .wam-debug-panel.open {
                display: block;
            }

            .wam-debug-inner {
                background: #0b1a13;
                border: 1px solid rgba(244, 212, 119, 0.3);
                border-radius: 18px;
                padding: 18px;
                max-width: 500px;
                margin: 20px auto;
                color: #e6efe9;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
                font-size: 12px;
                line-height: 1.8;
            }

            .wam-debug-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 14px;
                padding-bottom: 12px;
                border-bottom: 1px solid rgba(244, 212, 119, 0.2);
            }

            .wam-debug-header h3 {
                font-size: 15px;
                font-weight: 900;
                color: #f4d477;
                margin: 0;
            }

            .wam-debug-close {
                width: 32px;
                height: 32px;
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.15);
                background: transparent;
                color: #fff;
                font-size: 18px;
                cursor: pointer;
                display: grid;
                place-items: center;
            }

            .wam-debug-section {
                margin-bottom: 16px;
                padding: 12px;
                border-radius: 12px;
                background: rgba(255, 255, 255, 0.04);
            }

            .wam-debug-section-title {
                font-size: 11px;
                font-weight: 900;
                color: #f4d477;
                margin-bottom: 8px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .wam-debug-row {
                display: flex;
                justify-content: space-between;
                padding: 5px 0;
                font-size: 12px;
                border-bottom: 1px dashed rgba(255, 255, 255, 0.06);
            }

            .wam-debug-row:last-child {
                border-bottom: none;
            }

            .wam-debug-row .label {
                color: rgba(255, 255, 255, 0.55);
            }

            .wam-debug-row .value {
                color: #e6efe9;
                font-weight: 700;
                direction: ltr;
            }

            .wam-debug-actions {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                margin-top: 14px;
            }

            .wam-debug-btn {
                padding: 10px 8px;
                border-radius: 10px;
                border: 1px solid rgba(244, 212, 119, 0.3);
                background: rgba(244, 212, 119, 0.08);
                color: #f4d477;
                font-family: inherit;
                font-size: 11px;
                font-weight: 800;
                cursor: pointer;
                min-height: 42px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
            }

            .wam-debug-btn:active {
                background: rgba(244, 212, 119, 0.15);
                transform: scale(0.97);
            }

            .wam-debug-btn.danger {
                border-color: rgba(220, 38, 38, 0.4);
                background: rgba(220, 38, 38, 0.1);
                color: #fca5a5;
            }

            /* ===== CONFIRM MODAL ===== */
            .wam-confirm-overlay {
                position: fixed;
                inset: 0;
                z-index: 999998;
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(4px);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                direction: rtl;
                animation: wamFadeIn 0.2s ease;
            }

            @keyframes wamFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            .wam-confirm-box {
                background: #ffffff;
                border-radius: 20px;
                padding: 24px 22px;
                max-width: 380px;
                width: 100%;
                box-shadow: 0 25px 60px rgba(0, 0, 0, 0.3);
                animation: wamSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            }

            @keyframes wamSlideUp {
                from { transform: translateY(40px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }

            .wam-confirm-icon {
                font-size: 44px;
                text-align: center;
                margin-bottom: 12px;
                line-height: 1;
            }

            .wam-confirm-title {
                font-size: 16px;
                font-weight: 900;
                color: #0b3b23;
                text-align: center;
                margin-bottom: 8px;
            }

            .wam-confirm-message {
                font-size: 13px;
                color: #64748b;
                text-align: center;
                line-height: 2;
                margin-bottom: 20px;
            }

            .wam-confirm-actions {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
            }

            .wam-confirm-btn {
                min-height: 48px;
                padding: 12px;
                border-radius: 12px;
                border: none;
                font-family: inherit;
                font-size: 13px;
                font-weight: 900;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
            }

            .wam-confirm-btn:active {
                transform: scale(0.97);
            }

            .wam-confirm-btn.cancel {
                background: #f1f5f9;
                color: #475569;
            }

            .wam-confirm-btn.confirm {
                background: linear-gradient(135deg, #22c55e, #16a34a);
                color: #ffffff;
            }

            .wam-confirm-btn.danger {
                background: linear-gradient(135deg, #ef4444, #b91c1c);
                color: #ffffff;
            }

            /* ===== Safe Area ===== */
            @supports (padding: env(safe-area-inset-bottom)) {
                .wam-toast-container {
                    padding-bottom: calc(20px + env(safe-area-inset-bottom));
                }
            }

        `;

        document.head.appendChild(style);
    }

    // ==========================================
    // تابع کمکی — escapeHtml
    // ==========================================

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    // ==========================================
    // TOAST
    // ==========================================

    let toastContainer = null;

    function ensureToastContainer() {
        if (toastContainer && document.body.contains(toastContainer)) {
            return toastContainer;
        }

        toastContainer = document.createElement('div');
        toastContainer.className = 'wam-toast-container';
        document.body.appendChild(toastContainer);
        return toastContainer;
    }

    function toast(message, type, duration, options) {

        type = type || 'info';
        duration = duration === undefined ? 3000 : duration;
        options = options || {};

        const container = ensureToastContainer();

        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️',
            gold: '⭐'
        };

        const el = document.createElement('div');
        el.className = 'wam-toast ' + type;

        const icon = options.icon || icons[type] || '🔔';
        const title = options.title || '';

        el.innerHTML = `
            <span class="wam-toast-icon">${icon}</span>
            <div class="wam-toast-body">
                ${title ? '<div class="wam-toast-title">' + escapeHtml(title) + '</div>' : ''}
                <div class="wam-toast-text">${escapeHtml(message)}</div>
            </div>
            <button type="button" class="wam-toast-close" aria-label="بستن">✕</button>
        `;

        container.appendChild(el);

        requestAnimationFrame(function () {
            el.classList.add('show');
        });

        el.querySelector('.wam-toast-close').addEventListener('click', function () {
            closeToast(el);
        });

        if (duration > 0) {
            setTimeout(function () { closeToast(el); }, duration);
        }

        return el;
    }

    function closeToast(el) {
        if (!el || !el.parentNode) return;
        el.classList.remove('show');
        setTimeout(function () {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 300);
    }

    // ==========================================
    // LOADER
    // ==========================================

    let loaderEl = null;

    function showLoader(title, text) {

        if (loaderEl) return;

        loaderEl = document.createElement('div');
        loaderEl.className = 'wam-loader';
        loaderEl.innerHTML = `
            <div class="wam-loader-inner">
                <div class="wam-loader-spinner"></div>
                <div class="wam-loader-title">${escapeHtml(title || 'وام پی')}</div>
                <div class="wam-loader-text">${escapeHtml(text || 'در حال آماده‌سازی...')}</div>
                <div class="wam-loader-progress">
                    <div class="wam-loader-progress-fill"></div>
                </div>
                <span class="wam-loader-percent">0%</span>
            </div>
        `;
        document.body.appendChild(loaderEl);
    }

    function updateLoader(percent, text) {

        if (!loaderEl) return;

        const fill = loaderEl.querySelector('.wam-loader-progress-fill');
        const percentEl = loaderEl.querySelector('.wam-loader-percent');
        const textEl = loaderEl.querySelector('.wam-loader-text');

        if (fill) fill.style.width = Math.min(100, Math.max(0, percent)) + '%';
        if (percentEl) percentEl.textContent = Math.round(percent) + '%';
        if (text && textEl) textEl.textContent = text;
    }

    function hideLoader(delay) {

        if (!loaderEl) return;

        delay = delay || 0;

        setTimeout(function () {
            if (!loaderEl) return;

            loaderEl.classList.add('hidden');

            setTimeout(function () {
                if (loaderEl && loaderEl.parentNode) {
                    loaderEl.parentNode.removeChild(loaderEl);
                }
                loaderEl = null;
            }, 400);
        }, delay);
    }

    // ==========================================
    // CONFIRM (Modal)
    // ==========================================

    function confirm(title, message, options) {

        return new Promise(function (resolve) {

            options = options || {};

            const overlay = document.createElement('div');
            overlay.className = 'wam-confirm-overlay';

            const isDanger = options.danger === true;

            overlay.innerHTML = `
                <div class="wam-confirm-box">
                    <div class="wam-confirm-icon">${options.icon || '❓'}</div>
                    <div class="wam-confirm-title">${escapeHtml(title)}</div>
                    <div class="wam-confirm-message">${escapeHtml(message)}</div>
                    <div class="wam-confirm-actions">
                        <button type="button" class="wam-confirm-btn cancel" data-action="cancel">
                            ${escapeHtml(options.cancelText || 'انصراف')}
                        </button>
                        <button type="button" class="wam-confirm-btn ${isDanger ? 'danger' : 'confirm'}" data-action="confirm">
                            ${escapeHtml(options.confirmText || 'تأیید')}
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            function close(result) {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
                resolve(result);
            }

            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) {
                    close(false);
                }
            });

            overlay.querySelector('[data-action="cancel"]').addEventListener('click', function () {
                close(false);
            });

            overlay.querySelector('[data-action="confirm"]').addEventListener('click', function () {
                close(true);
            });

        });
    }

    // ==========================================
    // DEBUG PANEL
    // ==========================================

    let debugPanel = null;
    let tapCount = 0;
    let tapTimer = null;

    function createDebugPanel() {

        if (debugPanel) return debugPanel;

        debugPanel = document.createElement('div');
        debugPanel.className = 'wam-debug-panel';
        debugPanel.innerHTML = `
            <div class="wam-debug-inner">
                <div class="wam-debug-header">
                    <h3>🛠 پنل توسعه‌دهنده</h3>
                    <button type="button" class="wam-debug-close" id="wamDebugClose">✕</button>
                </div>
                <div id="wamDebugContent">
                    <p style="text-align:center;opacity:0.6;">در حال بارگذاری...</p>
                </div>
            </div>
        `;
        document.body.appendChild(debugPanel);

        debugPanel.querySelector('#wamDebugClose').addEventListener('click', function () {
            debugPanel.classList.remove('open');
        });

        debugPanel.addEventListener('click', function (e) {
            if (e.target === debugPanel) {
                debugPanel.classList.remove('open');
            }
        });

        return debugPanel;
    }

    function renderDebugContent() {

        const content = document.getElementById('wamDebugContent');
        if (!content) return;

        const info = window.Storage
            ? window.Storage.getInfo()
            : { sizeKB: 0, percent: 0, keyCount: 0 };

        const migration = window.Migrations
            ? window.Migrations.getStatus()
            : { currentVersion: 0, needsMigration: false };

        const cases = window.CaseRepository
            ? window.CaseRepository.getAll()
            : [];

        content.innerHTML = `
            <div class="wam-debug-section">
                <div class="wam-debug-section-title">📊 وضعیت کلی</div>
                <div class="wam-debug-row">
                    <span class="label">نسخه Core</span>
                    <span class="value">${window.WamPayCore ? window.WamPayCore.version : '—'}</span>
                </div>
                <div class="wam-debug-row">
                    <span class="label">Migration</span>
                    <span class="value">v${migration.currentVersion}</span>
                </div>
                <div class="wam-debug-row">
                    <span class="label">تعداد پرونده‌ها</span>
                    <span class="value">${cases.length}</span>
                </div>
            </div>

            <div class="wam-debug-section">
                <div class="wam-debug-section-title">💾 Storage</div>
                <div class="wam-debug-row">
                    <span class="label">حجم</span>
                    <span class="value">${info.sizeKB} KB</span>
                </div>
                <div class="wam-debug-row">
                    <span class="label">استفاده</span>
                    <span class="value">${info.percent}%</span>
                </div>
                <div class="wam-debug-row">
                    <span class="label">تعداد کلید</span>
                    <span class="value">${info.keyCount}</span>
                </div>
            </div>

            <div class="wam-debug-section">
                <div class="wam-debug-section-title">🎬 آخرین رویدادها</div>
                <div id="wamDebugEventsList" style="font-size:11px;">
                    در حال بارگذاری...
                </div>
            </div>

            <div class="wam-debug-actions">
                <button class="wam-debug-btn" onclick="WamUI.debugAction('cases')">📋 پرونده‌ها</button>
                <button class="wam-debug-btn" onclick="WamUI.debugAction('events')">📡 رویدادها</button>
                <button class="wam-debug-btn" onclick="WamUI.debugAction('clear-toasts')">🧹 پاک Toast</button>
                <button class="wam-debug-btn" onclick="WamUI.debugAction('storage')">💾 Storage</button>
                <button class="wam-debug-btn danger" onclick="WamUI.debugAction('restore')">↩ بازگردانی</button>
                <button class="wam-debug-btn danger" onclick="WamUI.debugAction('reset')">🗑 ریست کامل</button>
            </div>
        `;

        const eventsList = document.getElementById('wamDebugEventsList');
        if (eventsList && window.EventBus) {
            const events = window.EventBus.getHistory().slice(-8).reverse();

            if (events.length === 0) {
                eventsList.innerHTML = '<p style="opacity:0.5;">رویدادی ثبت نشده</p>';
            } else {
                eventsList.innerHTML = events.map(function (e) {
                    return '<div style="padding:5px 0;border-bottom:1px dashed rgba(255,255,255,0.06);">' +
                        '<span style="color:#f4d477;">' + escapeHtml(e.name) + '</span>' +
                        '<span style="opacity:0.5;float:left;font-size:10px;">' +
                        (e.timestamp.split('T')[1] || '').split('.')[0] + '</span>' +
                        '</div>';
                }).join('');
            }
        }
    }

    function openDebugPanel() {
        createDebugPanel();
        renderDebugContent();
        debugPanel.classList.add('open');
    }

    function handleTap() {
        tapCount++;
        if (tapTimer) clearTimeout(tapTimer);
        tapTimer = setTimeout(function () { tapCount = 0; }, 3000);

        if (tapCount >= 5) {
            tapCount = 0;
            openDebugPanel();
        }
    }

    // ==========================================
    // Debug Actions
    // ==========================================

    function debugAction(action) {

        switch (action) {

            case 'cases':
                const cases = window.CaseRepository ? window.CaseRepository.getAll() : [];
                toast(cases.length + ' پرونده ثبت شده', 'info', 4000);
                console.log(cases);
                break;

            case 'events':
                const events = window.EventBus ? window.EventBus.getHistory() : [];
                toast(events.length + ' رویداد ثبت شده (در Console)', 'info', 4000);
                console.log(events);
                break;

            case 'storage':
                const info = window.Storage ? window.Storage.getInfo() : null;
                if (info) {
                    toast(info.sizeKB + ' KB — ' + info.percent + '%', 'gold', 4000);
                }
                break;

            case 'clear-toasts':
                if (toastContainer) {
                    toastContainer.innerHTML = '';
                }
                toast('Toast ها پاک شدند', 'success');
                break;

            case 'restore':
                confirm('بازگردانی از بک‌آپ', 'همه پرونده‌ها به نسخه قبل از migration برمی‌گردند. ادامه؟', {
                    danger: true,
                    icon: '↩'
                }).then(function (ok) {
                    if (!ok) return;
                    if (window.Migrations) {
                        window.Migrations.restoreFromBackup();
                        toast('بازگردانی انجام شد. صفحه رفرش می‌شود...', 'success');
                        setTimeout(function () { location.reload(); }, 1500);
                    }
                });
                break;

            case 'reset':
                confirm('ریست کامل', 'همهٔ داده‌های وام پی پاک خواهند شد. مطمئنید؟', {
                    danger: true,
                    icon: '🗑'
                }).then(function (ok) {
                    if (!ok) return;
                    if (window.Storage) {
                        window.Storage.clearAll();
                        toast('ریست شد. صفحه رفرش می‌شود...', 'success');
                        setTimeout(function () { location.reload(); }, 1500);
                    }
                });
                break;
        }
    }

    // ==========================================
    // اتصال Debug به آواتار
    // ==========================================

    function attachDebugGesture() {

        const targets = [
            document.getElementById('sidebarAvatar'),
            document.querySelector('.broker-sidebar .sidebar-profile'),
            document.querySelector('.profile-avatar')
        ];

        targets.forEach(function (el) {
            if (el && !el._wamDebugBound) {
                el._wamDebugBound = true;
                el.addEventListener('click', handleTap);
                el.style.cursor = 'pointer';
            }
        });
    }

    // ==========================================
    // راه‌اندازی
    // ==========================================

    function init() {
        injectStyles();
        attachDebugGesture();

        const observer = new MutationObserver(function () {
            attachDebugGesture();
        });

        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ==========================================
    // Export
    // ==========================================

    window.WamUI = {
        toast: toast,
        loader: {
            show: showLoader,
            update: updateLoader,
            hide: hideLoader
        },
        confirm: confirm,
        openDebug: openDebugPanel,
        debugAction: debugAction,
        toastSuccess: function (msg, title) {
            return toast(msg, 'success', 3000, { title: title });
        },
        toastError: function (msg, title) {
            return toast(msg, 'error', 5000, { title: title });
        },
        toastWarning: function (msg, title) {
            return toast(msg, 'warning', 4000, { title: title });
        },
        toastInfo: function (msg, title) {
            return toast(msg, 'info', 3000, { title: title });
        }
    };

    console.log('✅ WamUI آماده — Toast + Loader + Confirm + Debug Panel');

})();




/* ==========================================
 * FROM: js/permissions.js
 * ========================================== */


// ==========================================
// وام پی - نقش‌ها، دسترسی‌ها و Workflow
// فایل پایه - بدون side effect
// نسخه ۴: سناریوی OTP + 8 فاز جدید
// ==========================================

(function () {

    'use strict';

    // ==========================================
    // نقش‌ها
    // ==========================================

    const ROLES = {
        SUPER_ADMIN:  'super_admin',
        ADMIN:        'admin',
        VERIFIER:     'verifier',
        BROKER_ADMIN: 'broker_admin',
        BROKER:       'broker',
        APPLICANT:    'applicant'
    };

    const ADMIN_LOGIN_ROLES = [
        ROLES.SUPER_ADMIN,
        ROLES.ADMIN,
        ROLES.VERIFIER,
        ROLES.BROKER_ADMIN
    ];

    // ==========================================
    // برچسب‌های فارسی
    // ==========================================

    const ROLE_LABELS = {
        'super_admin':  'مدیر ارشد',
        'admin':        'ادمین کل',
        'verifier':     'ادمین اعتبارسنجی',
        'broker_admin': 'ادمین کارگزار',
        'broker':       'کارگزار',
        'applicant':    'متقاضی'
    };

    const ROLE_ICONS = {
        'super_admin':  '👑',
        'admin':        '⚙️',
        'verifier':     '🔍',
        'broker_admin': '📋',
        'broker':       '💼',
        'applicant':    '👤'
    };

    const ROLE_DASHBOARDS = {
        'super_admin':  'super-admin-dashboard.html',
        'admin':        'admin-dashboard.html',
        'verifier':     'verifier-dashboard.html',
        'broker_admin': 'broker-admin-dashboard.html',
        'broker':       'broker-dashboard.html',
        'applicant':    'applicant-dashboard.html'
    };

    // ==========================================
    // 🆕 دسترسی‌ها — گسترش با فازهای جدید
    // ==========================================

    const PERMISSIONS = {

        'super_admin': ['*'],

        'admin': [
            'view:admin-dashboard',
            'manage:users',
            'manage:brokers',
            'manage:cases',
            'manage:consultations',
            'manage:financial',
            'verify:cases',
            'assign:broker',
            'approve:contract-final',      // 🆕 فقط super_admin نهایی
            'create:broker-admin',
            'create:verifier'
        ],

        'verifier': [
            'view:verifier-dashboard',
            'view:cases',
            'assign:self',
            'verify:cases',
            'reject:cases',
            'review:initial',              // 🆕 بررسی اولیه
            'review:documents',            // 🆕 بررسی مدارک
            'refer:to-broker-admin'
        ],

        'broker_admin': [
            'view:broker-admin-dashboard',
            'view:broker-cases',
            'view:brokers',
            'manage:brokers',
            'approve:broker-registration',
            'approve:case',                // 🆕 تأیید پرونده اعتبارسنجی‌شده
            'reject:case',
            'assign:case-to-broker'        // 🆕 انتخاب کارگزار
        ],

        'broker': [
            'view:broker-dashboard',
            'view:own-cases',
            'review:own-cases',
            'consult:own-cases',
            'draft:contract',
            'submit:contract'              // 🆕 ارسال قرارداد برای تأیید
        ],

        'applicant': [
            'view:applicant-dashboard',
            'view:own-cases',
            'edit:own-profile',
            'create:case',
            'fill:wizard',                 // 🆕 ویزارد اولیه
            'upload:documents',            // 🆕 بارگذاری مدارک
            'sign:contract'                // 🆕 امضای قرارداد
        ]
    };

    // ==========================================
    // 🆕 مراحل Workflow — ۱۸ Stage
    // ==========================================

    const WORKFLOW_STAGES = {

        // ═══ فاز ۰ — ورود با OTP ═══
        APPLICANT_OTP_PENDING:        'applicant_otp_pending',
        APPLICANT_OTP_VERIFIED:       'applicant_otp_verified',

        // ═══ فاز ۱ — ویزارد متقاضی (۵ مرحله) ═══
        APPLICANT_WIZARD_DRAFT:       'applicant_wizard_draft',
        APPLICANT_STEP1:              'applicant_step1',       // مشخصات فردی
        APPLICANT_STEP2:              'applicant_step2',       // اطلاعات شغلی
        APPLICANT_STEP3:              'applicant_step3',       // نوع وام
        APPLICANT_STEP4:              'applicant_step4',       // مبلغ و قسط
        APPLICANT_STEP5:              'applicant_step5',       // تأیید

        // ═══ فاز ۲ — بررسی اولیه (verifier) ═══
        VERIFIER_PENDING:             'verifier_pending',
        VERIFIER_REVIEWING:           'verifier_reviewing',
        VERIFIER_INITIAL_APPROVED:    'verifier_initial_approved',
        VERIFIER_INITIAL_REJECTED:    'verifier_initial_rejected',

        // ═══ فاز ۳ — بارگذاری مدارک (applicant) ═══
        APPLICANT_DOCUMENTS_PENDING:  'applicant_documents_pending',
        APPLICANT_DOCUMENTS_UPLOADED: 'applicant_documents_uploaded',

        // ═══ فاز ۴ — بررسی مدارک (verifier) ═══
        VERIFIER_DOCS_PENDING:        'verifier_docs_pending',
        VERIFIER_DOCS_REVIEWING:      'verifier_docs_reviewing',
        VERIFIER_DONE:                'verifier_done',

        // ═══ فاز ۵ — ادمین کارگزار ═══
        BROKER_ADMIN_PENDING:         'broker_admin_pending',
        BROKER_ADMIN_APPROVED:        'broker_admin_approved',
        BROKER_ASSIGNED:              'broker_assigned',

        // ═══ فاز ۶ — کارگزار + قرارداد ═══
        BROKER_CONSULTING:            'broker_consulting',
        CONTRACT_DRAFT:               'contract_draft',
        CONTRACT_PENDING:             'contract_pending',
        CONTRACT_SIGNED:              'contract_signed',

        // ═══ فاز ۷ — تأیید نهایی (super_admin) ═══
        FINAL_APPROVAL:               'final_approval',
        FINAL_APPROVED:               'final_approved',

        // ═══ نهایی ═══
        COMPLETED:                    'completed',
        REJECTED:                     'rejected',
        CANCELLED:                    'cancelled'
    };

    // ==========================================
    // 🆕 نگاشت فاز ↔ مسئول
    // ==========================================

    const STAGE_OWNERS = {
        'applicant_otp_pending':         'applicant',
        'applicant_otp_verified':        'applicant',
        'applicant_wizard_draft':        'applicant',
        'applicant_step1':               'applicant',
        'applicant_step2':               'applicant',
        'applicant_step3':               'applicant',
        'applicant_step4':               'applicant',
        'applicant_step5':               'applicant',

        'verifier_pending':              'verifier',
        'verifier_reviewing':            'verifier',
        'verifier_initial_approved':     'applicant',
        'verifier_initial_rejected':     'applicant',

        'applicant_documents_pending':   'applicant',
        'applicant_documents_uploaded':  'verifier',

        'verifier_docs_pending':         'verifier',
        'verifier_docs_reviewing':       'verifier',
        'verifier_done':                 'broker_admin',

        'broker_admin_pending':          'broker_admin',
        'broker_admin_approved':         'broker_admin',
        'broker_assigned':               'broker',

        'broker_consulting':             'broker',
        'contract_draft':                'broker',
        'contract_pending':              'super_admin',
        'contract_signed':               'super_admin',

        'final_approval':                'super_admin',
        'final_approved':                'completed',
        'completed':                     'completed',
        'rejected':                      'rejected',
        'cancelled':                     'cancelled'
    };

    // ==========================================
    // 🆕 برچسب‌های فارسی Stage
    // ==========================================

    const STAGE_LABELS = {
        'applicant_otp_pending':         'در انتظار تأیید شماره موبایل',
        'applicant_otp_verified':        'شماره تأیید شد',
        'applicant_wizard_draft':        'ویزارد ناتمام',
        'applicant_step1':               'مرحله ۱ — مشخصات فردی',
        'applicant_step2':               'مرحله ۲ — اطلاعات شغلی',
        'applicant_step3':               'مرحله ۳ — نوع وام',
        'applicant_step4':               'مرحله ۴ — مبلغ و قسط',
        'applicant_step5':               'مرحله ۵ — تأیید نهایی',

        'verifier_pending':              'در انتظار بررسی اولیه',
        'verifier_reviewing':            'در حال بررسی اولیه',
        'verifier_initial_approved':     'تأیید اولیه — در انتظار بارگذاری مدارک',
        'verifier_initial_rejected':     'رد اولیه',

        'applicant_documents_pending':   'در انتظار بارگذاری مدارک',
        'applicant_documents_uploaded':  'مدارک بارگذاری شد',

        'verifier_docs_pending':         'در انتظار بررسی مدارک',
        'verifier_docs_reviewing':       'در حال بررسی مدارک',
        'verifier_done':                 'اعتبارسنجی تکمیل شد',

        'broker_admin_pending':          'در انتظار تأیید ادمین کارگزار',
        'broker_admin_approved':         'تأیید ادمین کارگزار',
        'broker_assigned':               'ارجاع به کارگزار',

        'broker_consulting':             'در حال مشاوره',
        'contract_draft':                'پیش‌نویس قرارداد',
        'contract_pending':              'در انتظار تأیید قرارداد',
        'contract_signed':               'قرارداد امضا شده',

        'final_approval':                'در انتظار تأیید نهایی',
        'final_approved':                'تأیید نهایی',
        'completed':                     'تکمیل‌شده',
        'rejected':                      'ردشده',
        'cancelled':                     'لغو‌شده'
    };

    // ==========================================
    // کلیدهای localStorage
    // ==========================================

    const STORAGE_KEYS = {
        USERS:          'wamPayUsers',
        CURRENT_USER:   'wamPayCurrentUser',
        TOKEN:          'wamPayToken',
        APPLICATIONS:   'wamPayApplications',
        CASES_LEGACY:   'wamPayCases',
        NOTIFICATIONS:  'wamPayNotifications',
        THEME:          'wamPayTheme',

        // 🆕 OTP
        OTP_KEY:        'wamPayOtp_',
        OTP_PENDING:    'wamPayOtpPending'
    };

    // ==========================================
    // توابع کمکی — احراز هویت
    // ==========================================

    function getCurrentUser() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.CURRENT_USER) || 'null');
        } catch (e) {
            return null;
        }
    }

    function setCurrentUser(user) {
        if (user === null) {
            localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
            return;
        }
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    }

    function getToken() {
        return localStorage.getItem(STORAGE_KEYS.TOKEN) || '';
    }

    function isLoggedIn() {
        return !!(getToken() && getCurrentUser());
    }

    function hasRole(role) {
        const user = getCurrentUser();
        if (!user) return false;
        if (Array.isArray(role)) {
            return role.includes(user.role);
        }
        return user.role === role;
    }

    function hasPermission(permission) {
        const user = getCurrentUser();
        if (!user) return false;
        const perms = PERMISSIONS[user.role] || [];
        if (perms.includes('*')) return true;
        return perms.includes(permission);
    }

    function hasAnyPermission(list) {
        if (!Array.isArray(list)) return false;
        return list.some(function (p) { return hasPermission(p); });
    }

    function hasAllPermissions(list) {
        if (!Array.isArray(list)) return false;
        return list.every(function (p) { return hasPermission(p); });
    }

    function getRoleLabel(role) {
        return ROLE_LABELS[role] || role;
    }

    function getRoleIcon(role) {
        return ROLE_ICONS[role] || '👤';
    }

    function getRoleDashboard(role) {
        return ROLE_DASHBOARDS[role] || 'login.html';
    }

    // ==========================================
    // مدیریت کاربران
    // ==========================================

    function getUsers() {
        try {
            const arr = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function saveUsers(users) {
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    }

    function hasSuperAdmin() {
        return getUsers().some(function (u) {
            return u.role === ROLES.SUPER_ADMIN;
        });
    }

    function generateId(prefix) {
        return (prefix || 'id_') + Date.now() + '_' +
               Math.random().toString(36).substr(2, 9);
    }

    function userExists(mobile, role) {
        if (!mobile) return false;
        return getUsers().some(function (u) {
            if (role) return u.mobile === mobile && u.role === role;
            return u.mobile === mobile;
        });
    }

    function userExistsAnyRole(mobile) {
        return userExists(mobile);
    }

    function findUser(mobile, role) {
        if (!mobile) return null;
        const users = getUsers();
        if (role) {
            return users.find(function (u) {
                return u.mobile === mobile && u.role === role;
            }) || null;
        }
        return users.find(function (u) {
            return u.mobile === mobile;
        }) || null;
    }

    function getUsersByRole(role, options) {
        options = options || {};
        return getUsers().filter(function (u) {
            if (u.role !== role) return false;
            if (options.activeOnly && u.status !== 'active') return false;
            return true;
        });
    }

    function hasUserWithRole(mobile, role) {
        return userExists(mobile, role);
    }

    // ==========================================
    // Case Workflow
    // ==========================================

    function getAllCases() {
        // اولویت ۱: CaseRepository
        if (typeof CaseRepository !== 'undefined' && CaseRepository.getAll) {
            try {
                var repoCases = CaseRepository.getAll();
                if (Array.isArray(repoCases) && repoCases.length > 0) {
                    return repoCases;
                }
            } catch (e) {}
        }

        // اولویت ۲: wamPayApplications
        try {
            var primary = JSON.parse(localStorage.getItem(STORAGE_KEYS.APPLICATIONS) || '[]');
            if (Array.isArray(primary) && primary.length > 0) return primary;
        } catch (e) {}

        // اولویت ۳: legacy
        try {
            var legacy = JSON.parse(localStorage.getItem(STORAGE_KEYS.CASES_LEGACY) || '[]');
            return Array.isArray(legacy) ? legacy : [];
        } catch (e) {
            return [];
        }
    }

    function saveCases(cases) {
        if (typeof CaseRepository !== 'undefined' &&
            CaseRepository.create && Array.isArray(cases)) {
            for (var i = 0; i < cases.length; i++) {
                var c = cases[i];
                if (!c || !c.caseId) continue;
                try {
                    if (!CaseRepository.get(c.caseId)) {
                        CaseRepository.create(c, { userId: null });
                    }
                } catch (e) {}
            }
            return true;
        }
        localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(cases));
        return true;
    }

    function getCasesByStage(stage) {
        const stages = Array.isArray(stage) ? stage : [stage];
        return getAllCases().filter(function (c) {
            if (!c || !c.workflow) return false;
            return stages.includes(c.workflow.currentStage);
        });
    }

    function countActiveCases(userId) {
        if (!userId) return 0;
        return getAllCases().filter(function (c) {
            if (!c) return false;
            const stage = c.workflow && c.workflow.currentStage;
            if (stage === WORKFLOW_STAGES.COMPLETED ||
                stage === WORKFLOW_STAGES.REJECTED ||
                stage === WORKFLOW_STAGES.CANCELLED) {
                return false;
            }
            return (c.step2 && c.step2.verifierId === userId) ||
                   (c.step4 && c.step4.verifierId === userId) ||
                   (c.step5 && c.step5.brokerAdminId === userId) ||
                   (c.step5 && c.step5.assignedBrokerId === userId) ||
                   (c.step6 && c.step6.brokerId === userId);
        }).length;
    }

    function getLeastBusyUser(role) {
        const candidates = getUsersByRole(role, { activeOnly: true });
        if (candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];
        return candidates.slice().sort(function (a, b) {
            return countActiveCases(a.id) - countActiveCases(b.id);
        })[0];
    }

    // ==========================================
    // 🆕 تخصیص پرونده
    // ==========================================

    function assignCase(caseId, userId, role) {
        if (!caseId || !userId || !role) return false;

        const cases = getAllCases();
        const idx = cases.findIndex(function (c) { return c.caseId === caseId; });
        if (idx === -1) return false;

        const user = getUsers().find(function (u) { return u.id === userId; });
        if (!user) return false;

        const now = new Date().toISOString();
        const c = cases[idx];

        if (role === ROLES.VERIFIER) {
            c.step2 = c.step2 || {};
            c.step2.verifierId = userId;
            c.step2.verifierName = user.name || user.mobile;
            c.step2.status = 'reviewing';
            updateCaseStage(caseId, WORKFLOW_STAGES.VERIFIER_REVIEWING, {
                byUserId: userId
            });
        } else if (role === ROLES.BROKER_ADMIN) {
            c.step5 = c.step5 || {};
            c.step5.brokerAdminId = userId;
            c.step5.brokerAdminName = user.name || user.mobile;
        } else if (role === ROLES.BROKER) {
            c.step5 = c.step5 || {};
            c.step5.assignedBrokerId = userId;
            c.step5.assignedBrokerName = user.name || user.mobile;
            c.step5.assignedAt = now;
            c.step6 = c.step6 || {};
            c.step6.brokerId = userId;
            c.step6.brokerName = user.name || user.mobile;
            updateCaseStage(caseId, WORKFLOW_STAGES.BROKER_ASSIGNED, {
                byUserId: userId
            });
        } else {
            return false;
        }

        c.updatedAt = now;
        saveCases(cases);
        return true;
    }

    // ==========================================
    // 🆕 به‌روزرسانی Stage
    // ==========================================

    function updateCaseStage(caseId, newStage, options) {
        options = options || {};
        if (!caseId || !newStage) return false;

        const cases = getAllCases();
        const idx = cases.findIndex(function (c) { return c.caseId === caseId; });
        if (idx === -1) return false;

        const now = new Date().toISOString();
        const c = cases[idx];

        if (!c.workflow) {
            c.workflow = { currentStage: newStage, history: [] };
        }

        const prevStage = c.workflow.currentStage;
        c.workflow.currentStage = newStage;
        c.workflow.history = c.workflow.history || [];
        c.workflow.history.push({
            from: prevStage,
            to: newStage,
            at: now,
            by: options.byUserId || null,
            note: options.note || ''
        });

        c.updatedAt = now;
        saveCases(cases);
        return true;
    }

    function getCasesForUser(userId, role) {
        if (!userId || !role) return [];

        return getAllCases().filter(function (c) {
            if (!c) return false;

            if (role === ROLES.VERIFIER) {
                return (c.step2 && c.step2.verifierId === userId) ||
                       (c.step4 && c.step4.verifierId === userId);
            }
            if (role === ROLES.BROKER_ADMIN) {
                return c.step5 && c.step5.brokerAdminId === userId;
            }
            if (role === ROLES.BROKER) {
                return (c.step5 && c.step5.assignedBrokerId === userId) ||
                       (c.step6 && c.step6.brokerId === userId);
            }
            if (role === ROLES.APPLICANT) {
                return c.userId === userId || c.applicantId === userId;
            }
            return false;
        });
    }

    // ==========================================
    // 🆕 Stage helpers
    // ==========================================

    function getStageOwner(stage) {
        return STAGE_OWNERS[stage] || 'unknown';
    }

    function getStageLabel(stage) {
        return STAGE_LABELS[stage] || stage || '—';
    }

    function isApplicantTurn(stage) {
        return getStageOwner(stage) === 'applicant';
    }

    function isVerifierTurn(stage) {
        return getStageOwner(stage) === 'verifier';
    }

    function isBrokerAdminTurn(stage) {
        return getStageOwner(stage) === 'broker_admin';
    }

    function isBrokerTurn(stage) {
        return getStageOwner(stage) === 'broker';
    }

    function isFinalStage(stage) {
        return stage === WORKFLOW_STAGES.COMPLETED ||
               stage === WORKFLOW_STAGES.REJECTED ||
               stage === WORKFLOW_STAGES.CANCELLED;
    }

    // ==========================================
    // بررسی نقش‌های مدیریتی
    // ==========================================

    function isAdminRole(role) {
        return ADMIN_LOGIN_ROLES.includes(role);
    }

    function isSuperAdmin(role) {
        return role === ROLES.SUPER_ADMIN;
    }

    function isBrokerAdmin(role) {
        return role === ROLES.BROKER_ADMIN;
    }

    function isVerifier(role) {
        return role === ROLES.VERIFIER;
    }

    // ==========================================
    // رمز عبور
    // ==========================================

    async function hashPassword(password) {
        if (!password || typeof password !== 'string') return '';

        if (!window.crypto || !window.crypto.subtle) {
            return simpleHash(password);
        }

        try {
            const enc = new TextEncoder().encode(password);
            const buf = await window.crypto.subtle.digest('SHA-256', enc);
            return Array.from(new Uint8Array(buf))
                .map(function (b) { return b.toString(16).padStart(2, '0'); })
                .join('');
        } catch (e) {
            return simpleHash(password);
        }
    }

    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        const base = Math.abs(hash).toString(16).padStart(8, '0');
        return (base + base + base + base + base + base + base + base).substring(0, 64);
    }

    function isHashed(password) {
        if (typeof password !== 'string') return false;
        return /^[a-f0-9]{64}$/.test(password);
    }

    async function verifyPassword(inputPassword, storedPassword) {
        if (!inputPassword || !storedPassword) return false;
        if (isHashed(storedPassword)) {
            const inputHash = await hashPassword(inputPassword);
            return inputHash === storedPassword;
        }
        return inputPassword === storedPassword;
    }

    // ==========================================
    // 🆕 OTP helpers
    // ==========================================

    function saveOtp(mobile, code, ttlMs) {
        if (!mobile || !code) return false;
        ttlMs = ttlMs || 2 * 60 * 1000;  // ۲ دقیقه
        const payload = {
            code: String(code),
            mobile: String(mobile),
            expiresAt: Date.now() + ttlMs,
            attempts: 0,
            createdAt: Date.now()
        };
        try {
            localStorage.setItem(STORAGE_KEYS.OTP_KEY + mobile, JSON.stringify(payload));
            return true;
        } catch (e) {
            return false;
        }
    }

    function getOtp(mobile) {
        if (!mobile) return null;
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.OTP_KEY + mobile);
            if (!raw) return null;
            const payload = JSON.parse(raw);
            if (!payload || !payload.expiresAt) return null;
            if (Date.now() > payload.expiresAt) {
                localStorage.removeItem(STORAGE_KEYS.OTP_KEY + mobile);
                return null;
            }
            return payload;
        } catch (e) {
            return null;
        }
    }

    function verifyOtp(mobile, code) {
        const payload = getOtp(mobile);
        if (!payload) return { ok: false, reason: 'expired' };
        payload.attempts = (payload.attempts || 0) + 1;
        if (payload.attempts > 5) {
            localStorage.removeItem(STORAGE_KEYS.OTP_KEY + mobile);
            return { ok: false, reason: 'too_many_attempts' };
        }
        if (String(payload.code) !== String(code)) {
            try {
                localStorage.setItem(STORAGE_KEYS.OTP_KEY + mobile, JSON.stringify(payload));
            } catch (e) {}
            return { ok: false, reason: 'wrong_code' };
        }
        localStorage.removeItem(STORAGE_KEYS.OTP_KEY + mobile);
        return { ok: true };
    }

    function clearOtp(mobile) {
        if (!mobile) return false;
        try {
            localStorage.removeItem(STORAGE_KEYS.OTP_KEY + mobile);
            return true;
        } catch (e) {
            return false;
        }
    }

    // ==========================================
    // Export اصلی — WamPayAuth
    // ==========================================

    window.WamPayAuth = {
        // Constants
        ROLES: ROLES,
        ADMIN_LOGIN_ROLES: ADMIN_LOGIN_ROLES,
        ROLE_LABELS: ROLE_LABELS,
        ROLE_ICONS: ROLE_ICONS,
        ROLE_DASHBOARDS: ROLE_DASHBOARDS,
        PERMISSIONS: PERMISSIONS,
        WORKFLOW_STAGES: WORKFLOW_STAGES,
        STAGE_OWNERS: STAGE_OWNERS,
        STAGE_LABELS: STAGE_LABELS,
        STORAGE_KEYS: STORAGE_KEYS,

        // User management
        getCurrentUser: getCurrentUser,
        setCurrentUser: setCurrentUser,
        getToken: getToken,
        isLoggedIn: isLoggedIn,
        getUsers: getUsers,
        saveUsers: saveUsers,

        // Role/Permission
        hasRole: hasRole,
        hasPermission: hasPermission,
        hasAnyPermission: hasAnyPermission,
        hasAllPermissions: hasAllPermissions,

        // Helpers
        getRoleLabel: getRoleLabel,
        getRoleIcon: getRoleIcon,
        getRoleDashboard: getRoleDashboard,
        hasSuperAdmin: hasSuperAdmin,
        generateId: generateId,

        // User lookup
        userExists: userExists,
        userExistsAnyRole: userExistsAnyRole,
        findUser: findUser,
        getUsersByRole: getUsersByRole,
        hasUserWithRole: hasUserWithRole,
        getLeastBusyUser: getLeastBusyUser,

        // Password security
        hashPassword: hashPassword,
        isHashed: isHashed,
        verifyPassword: verifyPassword,

        // Role helpers
        isAdminRole: isAdminRole,
        isSuperAdmin: isSuperAdmin,
        isBrokerAdmin: isBrokerAdmin,
        isVerifier: isVerifier,

        // Case workflow
        getAllCases: getAllCases,
        saveCases: saveCases,
        getCasesByStage: getCasesByStage,
        getCasesForUser: getCasesForUser,
        countActiveCases: countActiveCases,
        assignCase: assignCase,
        updateCaseStage: updateCaseStage,

        // 🆕 Stage helpers
        getStageOwner: getStageOwner,
        getStageLabel: getStageLabel,
        isApplicantTurn: isApplicantTurn,
        isVerifierTurn: isVerifierTurn,
        isBrokerAdminTurn: isBrokerAdminTurn,
        isBrokerTurn: isBrokerTurn,
        isFinalStage: isFinalStage,

        // 🆕 OTP helpers
        saveOtp: saveOtp,
        getOtp: getOtp,
        verifyOtp: verifyOtp,
        clearOtp: clearOtp
    };

    // ==========================================
    // 🔄 COMPATIBILITY SHIM — WamPermissions alias
    // ==========================================

    function hasRoleCompat(user, role) {
        if (!user) user = getCurrentUser();
        if (!user) return false;
        var roles = Array.isArray(role) ? role : [role];
        return roles.indexOf(user.role) !== -1;
    }

    function hasCompat(user, permission) {
        if (!user) user = getCurrentUser();
        if (!user) return false;
        var perms = PERMISSIONS[user.role] || [];
        if (perms.indexOf('*') !== -1) return true;
        return perms.indexOf(permission) !== -1;
    }

    function hasLevelAtLeast(user, minRole) {
        if (!user) user = getCurrentUser();
        if (!user) return false;
        var LEVELS = {
            super_admin:  100,
            admin:        80,
            broker_admin: 60,
            verifier:     60,
            broker:       40,
            applicant:    20
        };
        return (LEVELS[user.role] || 0) >= (LEVELS[minRole] || 0);
    }

    function clearCurrentUser() {
        try {
            localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
            localStorage.removeItem(STORAGE_KEYS.TOKEN);
        } catch (e) {}
    }

    window.WamPermissions = {
        getCurrentUser: getCurrentUser,
        setCurrentUser: setCurrentUser,
        getToken: getToken,
        isLoggedIn: isLoggedIn,
        getUsers: getUsers,
        saveUsers: saveUsers,
        clearCurrentUser: clearCurrentUser,

        hasRole: hasRoleCompat,
        has: hasCompat,
        hasPermission: hasPermission,
        hasAnyPermission: hasAnyPermission,
        hasAllPermissions: hasAllPermissions,
        hasLevelAtLeast: hasLevelAtLeast,

        ROLES: ROLES,
        PERMISSIONS: PERMISSIONS,

        getRoleLabel: getRoleLabel,
        getRoleIcon: getRoleIcon,
        getRoleHome: getRoleDashboard,
        getRoleDashboard: getRoleDashboard,
        hasSuperAdmin: hasSuperAdmin,
        generateId: generateId,

        userExists: userExists,
        findUser: findUser,
        getUsersByRole: getUsersByRole,

        getAllCases: getAllCases,
        saveCases: saveCases,
        getCasesByStage: getCasesByStage,
        getCasesForUser: getCasesForUser,
        countActiveCases: countActiveCases,
        assignCase: assignCase,
        updateCaseStage: updateCaseStage,

        hashPassword: hashPassword,
        isHashed: isHashed,
        verifyPassword: verifyPassword
    };

    // ==========================================
    // لاگ
    // ==========================================

    console.log('🔐 permissions.js v4 آماده — با ۱۸ Stage + OTP helpers');

})();




/* ==========================================
 * FROM: js/auth-guard.js
 * ========================================== */


// ==========================================
// وام پی — Auth Guard
// فایل: auth-guard.js
// نسخه: 2.0.0
// کارش: گارد امنیتی صفحات
// وابسته به: WamPayAuth (js/permissions.js)
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🗺️ مسیر صفحات پروژه
    // ─────────────────────────────────────
    var PAGES = {
        LOGIN:             'login.html',
        SETUP_ADMIN:       'setup-admin.html',
        CHANGE_PASSWORD:   'change-password.html',
        ACCESS_DENIED:     'access-denied.html',

        SUPER_ADMIN:       'super-admin-dashboard.html',
        ADMIN:             'admin-dashboard.html',
        VERIFIER:          'verifier-dashboard.html',
        BROKER_ADMIN:      'broker-admin-dashboard.html',
        BROKER:            'broker-dashboard.html',
        APPLICANT:         'applicant-dashboard.html'
    };

    // صفحه اصلی هر نقش
    var ROLE_HOME = {
        super_admin:  PAGES.SUPER_ADMIN,
        admin:        PAGES.ADMIN,
        verifier:     PAGES.VERIFIER,
        broker_admin: PAGES.BROKER_ADMIN,
        broker:       PAGES.BROKER,
        applicant:    PAGES.APPLICANT
    };

    // صفحات عمومی (بدون نیاز به ورود)
    var PUBLIC_PAGES = [
        PAGES.LOGIN,
        PAGES.SETUP_ADMIN
    ];

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        lastCheck: null
    };

    // ─────────────────────────────────────
    // 🔍 دسترسی به Auth
    // ─────────────────────────────────────
    function Auth() {
        return window.WamPayAuth || null;
    }

    function checkDeps() {
        var missing = [];
        if (!window.WamPayAuth) missing.push('js/permissions.js');
        return { ok: missing.length === 0, missing: missing };
    }

    // ─────────────────────────────────────
    // 🌐 کمکی‌های URL
    // ─────────────────────────────────────
    function getCurrentPage() {
        var path = window.location.pathname || '';
        var parts = path.split('/');
        return parts[parts.length - 1] || 'index.html';
    }

    function isPublicPage(page) {
        page = page || getCurrentPage();
        return PUBLIC_PAGES.indexOf(page) !== -1;
    }

    function buildRedirectUrl(target, params) {
        params = params || {};
        var query = [];
        for (var k in params) {
            if (Object.prototype.hasOwnProperty.call(params, k)) {
                query.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
            }
        }
        return query.length > 0 ? (target + '?' + query.join('&')) : target;
    }

    // ─────────────────────────────────────
    // 🚪 ریدایرکت‌ها
    // ─────────────────────────────────────
    function redirectToLogin(reason) {
        var params = {};
        if (reason) params.reason = reason;
        var current = getCurrentPage();
        if (current && current !== PAGES.LOGIN) {
            params.next = current;
        }
        window.location.replace(buildRedirectUrl(PAGES.LOGIN, params));
    }

    function redirectToAccessDenied() {
        window.location.replace(PAGES.ACCESS_DENIED);
    }

    function redirectToRoleHome(role) {
        var home = ROLE_HOME[role];
        if (home) {
            window.location.replace(home);
        } else {
            redirectToLogin('unknown_role');
        }
    }

    function redirectToOwnDashboard() {
        var A = Auth();
        if (!A) { redirectToLogin(); return; }
        var user = A.getCurrentUser();
        if (!user || !user.role) { redirectToLogin(); return; }
        redirectToRoleHome(user.role);
    }

    function redirectTo(url) {
        window.location.replace(url);
    }

    // ─────────────────────────────────────
    // 🔐 بررسی ورود
    // ─────────────────────────────────────
    function isLoggedIn() {
        var A = Auth();
        if (!A) return false;
        return A.isLoggedIn();
    }

    function getCurrentUser() {
        var A = Auth();
        if (!A) return null;
        return A.getCurrentUser();
    }

    function getRoleHome(role) {
        return ROLE_HOME[role] || null;
    }

    function getUserName() {
        var user = getCurrentUser();
        if (!user) return 'مهمان';
        return user.name || user.mobile || 'کاربر';
    }

    function showUserInHeader(elementId) {
        var el = document.getElementById(elementId || 'userName');
        if (!el) return;
        el.textContent = getUserName();
    }

    // ─────────────────────────────────────
    // 🚨 نتیجه گارد
    // ─────────────────────────────────────
    function _allow() {
        return { ok: true, reason: null, redirect: null };
    }

    function _deny(reason, redirectTo) {
        return { ok: false, reason: reason, redirect: redirectTo || PAGES.LOGIN };
    }

    // ─────────────────────────────────────
    // 🛡️ گارد اصلی
    // ─────────────────────────────────────
    function guard(options) {
        options = options || {};
        var currentPage = options.page || getCurrentPage();

        // اگر صفحه عمومی است
        if (isPublicPage(currentPage)) {
            // اگر کاربر لاگین است و در login، به خانه‌اش بفرست
            if (currentPage === PAGES.LOGIN && isLoggedIn()) {
                var u = getCurrentUser();
                var home = getRoleHome(u.role);
                if (home && !options.noRedirect) {
                    return _deny('already_logged_in', home);
                }
            }
            return _allow();
        }

        // ۱. بررسی لاگین
        if (!isLoggedIn()) {
            return _deny('not_logged_in', PAGES.LOGIN);
        }

        var user = getCurrentUser();

        // ۲. بررسی وضعیت
        if (user.status === 'suspended') {
            return _deny('suspended', PAGES.LOGIN);
        }
        if (user.status === 'pending' && !options.allowPending) {
            return _deny('pending', PAGES.LOGIN);
        }

        // ۳. تغییر رمز اجباری
        if (user.mustChangePassword &&
            currentPage !== PAGES.CHANGE_PASSWORD &&
            currentPage !== PAGES.LOGIN) {
            return _deny('must_change_password', PAGES.CHANGE_PASSWORD);
        }

        // ۴. بررسی نقش
        if (options.roles && options.roles.length > 0) {
            if (options.roles.indexOf(user.role) === -1) {
                var h = getRoleHome(user.role);
                return _deny('wrong_role', h || PAGES.ACCESS_DENIED);
            }
        }

        // ۵. بررسی دسترسی
        if (options.permission) {
            var A = Auth();
            if (A && !A.hasPermission(options.permission)) {
                var h2 = getRoleHome(user.role);
                return _deny('no_permission', h2 || PAGES.ACCESS_DENIED);
            }
        }

        return _allow();
    }

    // ─────────────────────────────────────
    // 🎬 اعمال گارد (با ریدایرکت)
    // ─────────────────────────────────────
    function enforce(options) {
        options = options || {};
        var result = guard(options);

        if (!result.ok) {
            STATE.lastCheck = {
                ok: false,
                reason: result.reason,
                at: Date.now()
            };
            if (!options.silent) {
                redirectTo(result.redirect);
            }
        } else {
            STATE.lastCheck = {
                ok: true,
                reason: null,
                at: Date.now()
            };
        }
        return result;
    }

    // ─────────────────────────────────────
    // ✅ APIهای سازگار با صفحات جدید
    // ─────────────────────────────────────

    /**
     * requireAuth — بررسی لاگین + وضعیت
     * @returns {boolean}
     */
    function requireAuth(options) {
        options = options || {};
        var currentPage = getCurrentPage();
        var user = getCurrentUser();

        // اگر لاگین نیست
        if (!user) {
            if (!options.silent) {
                redirectToLogin(options.message || 'not_logged_in');
            }
            return false;
        }

        // بررسی وضعیت
        if (user.status === 'suspended') {
            if (!options.silent) {
                redirectToLogin('suspended');
            }
            return false;
        }

        if (user.status === 'pending' && !options.allowPending) {
            if (!options.silent) {
                redirectToLogin('pending');
            }
            return false;
        }

        // تغییر رمز اجباری
        if (user.mustChangePassword &&
            !options.skipPasswordCheck &&
            currentPage !== PAGES.CHANGE_PASSWORD &&
            currentPage !== PAGES.LOGIN) {
            if (!options.silent) {
                redirectTo(PAGES.CHANGE_PASSWORD);
            }
            return false;
        }

        return true;
    }

    /**
     * requireRole — بررسی نقش
     * @param {string|string[]} allowedRoles
     * @param {object} options
     * @returns {boolean}
     */
    function requireRole(allowedRoles, options) {
        options = options || {};

        // اول بررسی لاگین
        if (!requireAuth(options)) {
            return false;
        }

        var user = getCurrentUser();
        var rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

        if (rolesArray.indexOf(user.role) === -1) {
            console.warn('🚫 دسترسی غیرمجاز:', {
                userRole: user.role,
                required: rolesArray
            });

            if (!options.silent) {
                if (options.redirectToOwn !== false) {
                    // پیش‌فرض: به داشبورد خودش
                    redirectToOwnDashboard();
                } else {
                    redirectToAccessDenied();
                }
            }
            return false;
        }

        return true;
    }

    /**
     * requirePermission — بررسی مجوز
     */
    function requirePermission(permission, options) {
        options = options || {};

        if (!requireAuth(options)) return false;

        var A = Auth();
        if (A && !A.hasPermission(permission)) {
            console.warn('🚫 دسترسی غیرمجاز:', { permission: permission });
            if (!options.silent) {
                if (options.redirectToOwn !== false) {
                    redirectToOwnDashboard();
                } else {
                    redirectToAccessDenied();
                }
            }
            return false;
        }
        return true;
    }

    /**
     * requireSuperAdmin — فقط مدیر ارشد
     */
    function requireSuperAdmin(options) {
        return requireRole(['super_admin'], options);
    }

    /**
     * requireAdmin — همه نقش‌های ادمینی
     */
    function requireAdmin(options) {
        return requireRole(
            ['super_admin', 'admin', 'verifier', 'broker_admin'],
            options
        );
    }

    // ─────────────────────────────────────
    // 🚪 خروج
    // ─────────────────────────────────────
    function logout(options) {
        options = options || {};

        try {
            localStorage.removeItem('wamPayCurrentUser');
            localStorage.removeItem('wamPayToken');
            localStorage.removeItem('wamPayRemember');
        } catch (e) {}

        if (typeof EventBus !== 'undefined' && EventBus.emit) {
            try {
                EventBus.emit('auth:logout', { at: Date.now() });
            } catch (e) {}
        }

        if (!options.silent) {
            window.location.replace(PAGES.LOGIN);
        }
        return true;
    }

    // ─────────────────────────────────────
    // 🎯 نصب از data-attributes
    // ─────────────────────────────────────
    function installFromDOM() {
        if (typeof document === 'undefined') return null;
        var body = document.body;
        if (!body) return null;

        if (body.hasAttribute('data-guard-skip')) {
            return _allow();
        }

        var rolesAttr = body.getAttribute('data-guard-roles');
        var permAttr  = body.getAttribute('data-guard-perm');

        var options = {};
        if (rolesAttr) {
            options.roles = rolesAttr.split(',').map(function (s) { return s.trim(); })
                            .filter(function (s) { return s.length > 0; });
        }
        if (permAttr) options.permission = permAttr.trim();

        // اگر هیچ attribute نبود، کاری نکن
        if (!options.roles && !options.permission) {
            return _allow();
        }

        return enforce(options);
    }

    // ─────────────────────────────────────
    // 🚀 نصب (بدون auto-redirect — صفحات خودشان صدا می‌زنند)
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (STATE.installed && !options.force) return STATE.lastCheck;

        var deps = checkDeps();
        if (!deps.ok) {
            console.warn('[WamPayGuard] وابستگی‌های گم‌شده:', deps.missing);
            STATE.installed = true;
            return _deny('missing_deps', PAGES.LOGIN);
        }

        STATE.installed = true;

        if (options.disabled) return _allow();

        if (options.roles || options.permission) {
            return enforce(options);
        }

        return installFromDOM();
    }

    // ─────────────────────────────────────
    // 🧪 تست (بدون ریدایرکت)
    // ─────────────────────────────────────
    function test(options) {
        return guard(options || {});
    }

    // ─────────────────────────────────────
    // 📊 وضعیت
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            lastCheck: STATE.lastCheck,
            currentPage: getCurrentPage(),
            isLoggedIn: isLoggedIn(),
            user: getCurrentUser(),
            isPublicPage: isPublicPage()
        };
    }

    // ─────────────────────────────────────
    // 📄 محافظت از لینک‌ها
    // ─────────────────────────────────────
    function protectLinks(root) {
        if (typeof document === 'undefined') return 0;
        root = root || document;
        var links = root.querySelectorAll('a[href][data-guard-roles]');
        var hidden = 0;
        var user = getCurrentUser();

        for (var i = 0; i < links.length; i++) {
            var a = links[i];
            var roles = a.getAttribute('data-guard-roles')
                        .split(',').map(function (s) { return s.trim(); });
            if (!user || roles.indexOf(user.role) === -1) {
                a.style.display = 'none';
                hidden++;
            }
        }
        return hidden;
    }

    // ─────────────────────────────────────
    // 🌐 Export
    // ─────────────────────────────────────
    var WamPayGuard = {
        // ثوابت
        PAGES: PAGES,
        ROLE_HOME: ROLE_HOME,
        PUBLIC_PAGES: PUBLIC_PAGES,

        // API جدید (سازگار با صفحات ما)
        requireAuth: requireAuth,
        requireRole: requireRole,
        requirePermission: requirePermission,
        requireSuperAdmin: requireSuperAdmin,
        requireAdmin: requireAdmin,

        // API قدیمی (پشتیبان)
        guard: guard,
        enforce: enforce,
        install: install,
        installFromDOM: installFromDOM,
        test: test,

        // کاربر
        isLoggedIn: isLoggedIn,
        getCurrentUser: getCurrentUser,
        getUserName: getUserName,
        showUserInHeader: showUserInHeader,
        logout: logout,

        // ریدایرکت
        redirectToLogin: redirectToLogin,
        redirectToAccessDenied: redirectToAccessDenied,
        redirectToRoleHome: redirectToRoleHome,
        redirectToOwnDashboard: redirectToOwnDashboard,
        redirectTo: redirectTo,

        // کمکی
        getCurrentPage: getCurrentPage,
        isPublicPage: isPublicPage,
        getRoleHome: getRoleHome,
        protectLinks: protectLinks,
        getStatus: getStatus,
        checkDependencies: checkDeps
    };

    window.WamPayGuard = WamPayGuard;
    window.WamPayPages = PAGES;

    // میان‌بر
    window.wamLogout = function () { return logout(); };

    // ⚠️ auto-install را حذف کردیم — صفحات خودشان صدا می‌زنند

    console.log('🛡 auth-guard.js v2 آماده — سازگار با WamPayAuth');

})();




/* ==========================================
 * FROM: js/theme.js
 * ========================================== */


// ==========================================
// وام پی — Auth & UI Base
// فایل: theme.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: مدیریت تم روشن/تیره/خودکار + همگام‌سازی با سیستم
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🎨 ثابت‌ها
    // ─────────────────────────────────────
    var THEMES = {
        LIGHT: 'light',
        DARK:  'dark',
        AUTO:  'auto'
    };

    var THEME_KEY = 'wamPayTheme';
    var ATTR = 'data-theme';
    var AUTO_ATTR = 'data-theme-auto';

    var THEME_LABELS = {
        light: 'روشن',
        dark:  'تیره',
        auto:  'خودکار'
    };

    var ThemeEvents = {
        CHANGED: 'theme.changed',
        APPLIED: 'theme.applied',
        SYSTEM:  'theme.system.changed'
    };

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        current: THEMES.AUTO,       // انتخاب کاربر
        effective: THEMES.LIGHT,    // اعمال‌شده روی DOM
        systemPrefersDark: false,
        mediaQuery: null,
        installed: false,
        listeners: []
    };

    // ─────────────────────────────────────
    // 🔍 ابزارهای سیستمی
    // ─────────────────────────────────────
    function _getSystemPrefersDark() {
        if (typeof window === 'undefined') return false;
        if (!window.matchMedia) return false;
        try {
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        } catch (e) {
            return false;
        }
    }

    function _resolveEffective(theme, systemDark) {
        if (theme === THEMES.AUTO) {
            return systemDark ? THEMES.DARK : THEMES.LIGHT;
        }
        return theme === THEMES.DARK ? THEMES.DARK : THEMES.LIGHT;
    }

    // ─────────────────────────────────────
    // 💾 خواندن/نوشتن تنظیمات
    // ─────────────────────────────────────
    function _readStored() {
        if (typeof Storage === 'undefined') return null;
        var v = Storage.get(THEME_KEY, null);
        if (v === THEMES.LIGHT || v === THEMES.DARK || v === THEMES.AUTO) {
            return v;
        }
        return null;
    }

    function _writeStored(theme) {
        if (typeof Storage === 'undefined') return false;
        return Storage.set(THEME_KEY, theme);
    }

    // ─────────────────────────────────────
    // 🎬 اعمال روی DOM
    // ─────────────────────────────────────
    function _applyToDOM(effective, mode) {
        if (typeof document === 'undefined') return;
        var root = document.documentElement;
        if (!root) return;

        root.setAttribute(ATTR, effective);
        root.setAttribute(AUTO_ATTR, mode === THEMES.AUTO ? '1' : '0');

        // پشتیبانی از color-scheme برای فرم‌ها و اسکرول‌بار
        root.style.colorScheme = effective;

        // کلاس‌های میان‌بر (اختیاری برای CSS)
        var cl = root.classList;
        if (cl) {
            cl.remove('theme-light', 'theme-dark', 'theme-auto');
            cl.add('theme-' + effective);
            if (mode === THEMES.AUTO) cl.add('theme-auto');
        }
    }

    // ─────────────────────────────────────
    // 📡 انتشار رویداد
    // ─────────────────────────────────────
    function _emit(eventName, data) {
        if (typeof EventBus !== 'undefined') {
            try { EventBus.emit(eventName, data); } catch (e) { /* بی‌صدا */ }
        }
        // لیسنرهای داخلی
        for (var i = 0; i < STATE.listeners.length; i++) {
            try { STATE.listeners[i](eventName, data); } catch (e) { /* بی‌صدا */ }
        }
    }

    // ─────────────────────────────────────
    // 🎯 API اصلی
    // ─────────────────────────────────────
    function getTheme() {
        return STATE.current;
    }

    function getEffectiveTheme() {
        return STATE.effective;
    }

    function isDark() {
        return STATE.effective === THEMES.DARK;
    }

    function isLight() {
        return STATE.effective === THEMES.LIGHT;
    }

    function isAuto() {
        return STATE.current === THEMES.AUTO;
    }

    function setTheme(theme, options) {
        options = options || {};
        if (theme !== THEMES.LIGHT && theme !== THEMES.DARK && theme !== THEMES.AUTO) {
            return false;
        }

        var prevCurrent   = STATE.current;
        var prevEffective = STATE.effective;

        STATE.current = theme;
        STATE.effective = _resolveEffective(theme, STATE.systemPrefersDark);

        if (!options.skipStore) _writeStored(theme);
        _applyToDOM(STATE.effective, STATE.current);

        var changed = (prevCurrent !== STATE.current) ||
                      (prevEffective !== STATE.effective);

        if (changed) {
            _emit(ThemeEvents.CHANGED, {
                current: STATE.current,
                effective: STATE.effective,
                previous: {
                    current: prevCurrent,
                    effective: prevEffective
                },
                at: Date.now()
            });
        }

        if (!options.silent) {
            _emit(ThemeEvents.APPLIED, {
                current: STATE.current,
                effective: STATE.effective
            });
        }

        return true;
    }

    function toggle() {
        // چرخه: light → dark → auto → light
        if (STATE.current === THEMES.LIGHT)       return setTheme(THEMES.DARK);
        if (STATE.current === THEMES.DARK)        return setTheme(THEMES.AUTO);
        return setTheme(THEMES.LIGHT);
    }

    function toggleSimple() {
        // فقط بین روشن و تیره (بدون auto)
        return setTheme(STATE.effective === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK);
    }

    function reset() {
        return setTheme(THEMES.AUTO);
    }

    // ─────────────────────────────────────
    // 🖥️ تم سیستم
    // ─────────────────────────────────────
    function getSystemTheme() {
        return STATE.systemPrefersDark ? THEMES.DARK : THEMES.LIGHT;
    }

    function _handleSystemChange(isDark) {
        STATE.systemPrefersDark = !!isDark;

        _emit(ThemeEvents.SYSTEM, {
            system: getSystemTheme(),
            at: Date.now()
        });

        // فقط اگر روی auto باشیم، تغییر اعمال شود
        if (STATE.current === THEMES.AUTO) {
            var prevEffective = STATE.effective;
            STATE.effective = _resolveEffective(STATE.current, STATE.systemPrefersDark);
            _applyToDOM(STATE.effective, STATE.current);

            if (prevEffective !== STATE.effective) {
                _emit(ThemeEvents.CHANGED, {
                    current: STATE.current,
                    effective: STATE.effective,
                    previous: { current: STATE.current, effective: prevEffective },
                    system: true,
                    at: Date.now()
                });
            }
        }
    }

    // ─────────────────────────────────────
    // 📥 نصب لیسنر سیستم
    // ─────────────────────────────────────
    function _installSystemListener() {
        if (typeof window === 'undefined') return;
        if (!window.matchMedia) return;

        try {
            STATE.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            STATE.systemPrefersDark = STATE.mediaQuery.matches;

            var handler = function (e) {
                _handleSystemChange(e.matches);
            };

            if (STATE.mediaQuery.addEventListener) {
                STATE.mediaQuery.addEventListener('change', handler);
            } else if (STATE.mediaQuery.addListener) {
                STATE.mediaQuery.addListener(handler);
            }
        } catch (e) { /* بی‌صدا */ }
    }

    // ─────────────────────────────────────
    // 🔘 دکمه‌های toggle در DOM
    // ─────────────────────────────────────
    function _bindToggleButtons(root) {
        if (typeof document === 'undefined') return 0;
        root = root || document;

        var buttons = root.querySelectorAll('[data-theme-toggle]');
        var count = 0;

        for (var i = 0; i < buttons.length; i++) {
            var btn = buttons[i];
            if (btn.dataset && btn.dataset.wamThemeBound === '1') continue;

            btn.addEventListener('click', function (e) {
                e.preventDefault();
                var mode = this.getAttribute('data-theme-toggle') || 'cycle';
                if (mode === 'simple') {
                    toggleSimple();
                } else if (mode === 'reset') {
                    reset();
                } else if (mode === 'dark') {
                    setTheme(THEMES.DARK);
                } else if (mode === 'light') {
                    setTheme(THEMES.LIGHT);
                } else if (mode === 'auto') {
                    setTheme(THEMES.AUTO);
                } else {
                    toggle();
                }
            });

            if (btn.dataset) btn.dataset.wamThemeBound = '1';
            count++;
        }
        return count;
    }

    // ─────────────────────────────────────
    // 🎨 آپدیت آیکن‌ها (اختیاری)
    // ─────────────────────────────────────
    function _updateIcons(root) {
        if (typeof document === 'undefined') return;
        root = root || document;

        var icons = root.querySelectorAll('[data-theme-icon]');
        for (var i = 0; i < icons.length; i++) {
            var el = icons[i];
            var kind = el.getAttribute('data-theme-icon') || 'emoji';
            if (kind === 'emoji') {
                if (STATE.current === THEMES.AUTO) {
                    el.textContent = '🌗';
                } else if (STATE.effective === THEMES.DARK) {
                    el.textContent = '🌙';
                } else {
                    el.textContent = '☀️';
                }
            }
        }
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (STATE.installed && !options.force) return;

        // ۱. خواندن از Storage یا auto
        STATE.systemPrefersDark = _getSystemPrefersDark();

        var stored = _readStored();
        STATE.current = stored || options.default || THEMES.AUTO;
        STATE.effective = _resolveEffective(STATE.current, STATE.systemPrefersDark);

        // ۲. اعمال فوری روی DOM (قبل از render کامل)
        _applyToDOM(STATE.effective, STATE.current);

        // ۳. نصب لیسنر سیستم
        _installSystemListener();

        // ۴. بایند دکمه‌ها (بعد از DOM آماده)
        var bindWhenReady = function () {
            _bindToggleButtons();
            _updateIcons();

            // اگر پرچم auto-binding خاموش نبود
            if (!options.noAutoBind) {
                // بررسی تغیرات DOM برای دکمه‌های جدید
                if (window.MutationObserver) {
                    var obs = new MutationObserver(function () {
                        _bindToggleButtons();
                        _updateIcons();
                    });
                    obs.observe(document.body, {
                        childList: true,
                        subtree: true
                    });
                }
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bindWhenReady);
        } else {
            bindWhenReady();
        }

        // ۵. رویداد اولیه
        _emit(ThemeEvents.APPLIED, {
            current: STATE.current,
            effective: STATE.effective,
            initial: true
        });

        STATE.installed = true;
    }

    // ─────────────────────────────────────
    // 📊 خلاصه وضعیت
    // ─────────────────────────────────────
    function getStatus() {
        return {
            current: STATE.current,
            effective: STATE.effective,
            currentLabel: THEME_LABELS[STATE.current],
            effectiveLabel: THEME_LABELS[STATE.effective],
            systemTheme: getSystemTheme(),
            systemPrefersDark: STATE.systemPrefersDark,
            isAuto: isAuto(),
            isDark: isDark(),
            isLight: isLight(),
            installed: STATE.installed
        };
    }

    // ─────────────────────────────────────
    // 📋 لیست تم‌ها برای UI
    // ─────────────────────────────────────
    function getAllThemes() {
        return [
            { key: THEMES.LIGHT, label: THEME_LABELS.light, icon: '☀️' },
            { key: THEMES.DARK,  label: THEME_LABELS.dark,  icon: '🌙' },
            { key: THEMES.AUTO,  label: THEME_LABELS.auto,  icon: '🌗' }
        ];
    }

    function getThemeLabel(theme) {
        return THEME_LABELS[theme] || theme || '—';
    }

    // ─────────────────────────────────────
    // 📡 لیسنر داخلی (برای کدهایی که EventBus ندارند)
    // ─────────────────────────────────────
    function onChange(callback) {
        if (typeof callback !== 'function') return function () {};
        STATE.listeners.push(callback);
        return function unsubscribe() {
            var idx = STATE.listeners.indexOf(callback);
            if (idx !== -1) STATE.listeners.splice(idx, 1);
        };
    }

    // ─────────────────────────────────────
    // 🌐 API جهانی
    // ─────────────────────────────────────
    var WamTheme = {
        // ثوابت
        THEMES: THEMES,
        LABELS: THEME_LABELS,
        EVENTS: ThemeEvents,
        STORAGE_KEY: THEME_KEY,

        // نصب
        install: install,

        // خواندن
        get: getTheme,
        getEffective: getEffectiveTheme,
        getSystem: getSystemTheme,
        isDark: isDark,
        isLight: isLight,
        isAuto: isAuto,

        // تنظیم
        set: setTheme,
        toggle: toggle,
        toggleSimple: toggleSimple,
        reset: reset,

        // UI
        bindToggleButtons: _bindToggleButtons,
        updateIcons: _updateIcons,

        // گزارش
        getStatus: getStatus,
        getAllThemes: getAllThemes,
        getThemeLabel: getThemeLabel,

        // لیسنر
        onChange: onChange
    };

    // ثبت جهانی
    window.WamTheme = WamTheme;
    window.ThemeEvents = ThemeEvents;

    // ─────────────────────────────────────
    // ⚡ نصب فوری (حتی قبل از DOMContentLoaded)
    // برای جلوگیری از فلش تم اشتباه
    // ─────────────────────────────────────
    // اعمال سریع attribute روی html به‌صورت inline
    (function _earlyApply() {
        if (typeof document === 'undefined') return;
        var root = document.documentElement;
        if (!root) return;

        var stored = _readStored();
        var sysDark = _getSystemPrefersDark();
        var mode = stored || THEMES.AUTO;
        var effective = _resolveEffective(mode, sysDark);

        root.setAttribute(ATTR, effective);
        root.setAttribute(AUTO_ATTR, mode === THEMES.AUTO ? '1' : '0');
        root.style.colorScheme = effective;
    })();

    // نصب کامل بعد از آماده شدن
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () {
                install();
            });
        } else {
            install();
        }
    }

})();




/* ==========================================
 * END OF BUNDLE
 * ========================================== */