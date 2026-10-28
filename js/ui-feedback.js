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