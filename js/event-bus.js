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