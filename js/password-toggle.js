// ==========================================
// وام پی — Password Toggle
// ابزار عمومی نمایش/پنهان کردن رمز
// نسخه ۲: رنگ‌های برند + رفع تصادم !important
// ==========================================

(function () {
    'use strict';

    // ==========================================
    // تزریق CSS
    // ==========================================

    function injectStyles() {

        if (document.getElementById('pwd-toggle-styles')) return;

        const style = document.createElement('style');
        style.id = 'pwd-toggle-styles';
        style.textContent = `

            /* Wrapper */
            .pwd-wrapper {
                position: relative;
                display: block;
                width: 100%;
            }

            /* Padding برای input تا متن زیر دکمه نره
               ⚠️ فقط روی فیلدهای غیر .input-with-unit اعمال می‌شود
               تا با استایل ویزارد (padding-left: 70px) تصادم نکند. */
            .pwd-wrapper:not(.input-with-unit) input[type="password"],
            .pwd-wrapper:not(.input-with-unit) input[type="text"].pwd-input {
                padding-left: 46px !important;
            }

            /* دکمه چشم */
            .pwd-toggle-btn {
                position: absolute;
                left: 8px;
                top: 50%;
                transform: translateY(-50%);
                width: 36px;
                height: 36px;
                border-radius: 50%;
                border: none;
                background: transparent;
                color: var(--muted, #77847b);
                font-size: 18px;
                line-height: 1;
                cursor: pointer;
                display: grid;
                place-items: center;
                transition: background 0.2s ease, color 0.2s ease, transform 0.15s ease;
                padding: 0;
                font-family: inherit;
                z-index: 2;
                -webkit-tap-highlight-color: transparent;
                touch-action: manipulation;
            }

            .pwd-toggle-btn:hover {
                background: rgba(11, 59, 35, 0.08);
                color: var(--primary, #0b3b23);
            }

            .pwd-toggle-btn:active {
                transform: translateY(-50%) scale(0.9);
            }

            .pwd-toggle-btn.visible {
                color: var(--gold, #d4a62a);
                background: rgba(212, 166, 42, 0.12);
            }

            /* در دارک مود */
            [data-theme="dark"] .pwd-toggle-btn {
                color: rgba(255, 255, 255, 0.6);
            }

            [data-theme="dark"] .pwd-toggle-btn:hover {
                color: #a7d7b8;
                background: rgba(167, 215, 184, 0.12);
            }

            [data-theme="dark"] .pwd-toggle-btn.visible {
                color: var(--gold, #d4a62a);
                background: rgba(212, 166, 42, 0.18);
            }

        `;
        document.head.appendChild(style);
    }

    // ==========================================
    // افزایش خودکار فیلدهای رمز
    // ==========================================

    function enhance() {

        const inputs = document.querySelectorAll('input[type="password"]');

        inputs.forEach(function (input) {

            if (input.dataset.pwdEnhanced === 'true') return;
            input.dataset.pwdEnhanced = 'true';

            const parent = input.parentNode;
            if (!parent) return;

            // ساخت wrapper
            const wrapper = document.createElement('div');
            wrapper.className = 'pwd-wrapper';

            // ⚠️ انتقال کلاس .input-with-unit (اگر والد داشت) به wrapper
            // این کار رفع تصادم !important را تکمیل می‌کند.
            if (parent.classList.contains('input-with-unit')) {
                wrapper.classList.add('input-with-unit');
            }

            parent.insertBefore(wrapper, input);
            wrapper.appendChild(input);

            // ساخت دکمه
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pwd-toggle-btn';
            btn.innerHTML = '👁';
            btn.setAttribute('aria-label', 'نمایش رمز');
            btn.setAttribute('title', 'نمایش / پنهان کردن رمز');
            btn.setAttribute('tabindex', '-1');

            // رویداد کلیک
            btn.addEventListener('click', function (e) {

                e.preventDefault();
                e.stopPropagation();

                const isPassword = input.type === 'password';

                input.type = isPassword ? 'text' : 'password';

                if (!isPassword) {
                    input.classList.remove('pwd-input');
                } else {
                    input.classList.add('pwd-input');
                }

                btn.innerHTML = isPassword ? '🙈' : '👁';
                btn.classList.toggle('visible', isPassword);
                btn.setAttribute('aria-label', isPassword ? 'پنهان کردن رمز' : 'نمایش رمز');

                input.focus();

                setTimeout(function () {
                    const len = input.value.length;
                    try { input.setSelectionRange(len, len); } catch (_) {}
                }, 10);

            });

            wrapper.appendChild(btn);

        });

    }

    // ==========================================
    // راه‌اندازی
    // ==========================================

    function init() {

        injectStyles();
        enhance();

        // MutationObserver برای فیلدهای داینامیک (ویزارد)
        const observer = new MutationObserver(function (mutations) {

            let shouldEnhance = false;

            mutations.forEach(function (m) {
                if (m.addedNodes && m.addedNodes.length > 0) {
                    m.addedNodes.forEach(function (node) {
                        if (node.nodeType === 1) {
                            if (node.tagName === 'INPUT' && node.type === 'password') {
                                shouldEnhance = true;
                            }
                            if (node.querySelector && node.querySelector('input[type="password"]')) {
                                shouldEnhance = true;
                            }
                        }
                    });
                }
            });

            if (shouldEnhance) {
                setTimeout(enhance, 50);
            }

        });

        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        console.log('👁 PasswordToggle v2 آماده');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ==========================================
    // API عمومی
    // ==========================================

    window.PasswordToggle = {
        enhance: enhance,
        refresh: function () {
            enhance();
        }
    };

})();