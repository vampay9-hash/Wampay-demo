// ==========================================
// وام پی - انیمیشن SVG لوگو
// نسخه: 1.0.0
// کاربرد: اجرای انیمیشن SVG لوگو در صفحه اصلی
// ==========================================

(function () {
    'use strict';

    // ────────────────────────────────────────
    // تابع اصلی اجرای انیمیشن
    // ────────────────────────────────────────
    function playLogoAnimation() {
        var logo = document.getElementById('wamLogoSvg');
        if (!logo) {
            console.warn('⚠️ وام پی: #wamLogoSvg پیدا نشد');
            return;
        }

        // پاک کردن کلاس قبلی (برای اجرای دوباره)
        logo.classList.remove('play');

        // Force reflow برای اجرای دوباره‌ی انیمیشن
        void logo.offsetWidth;

        // شروع انیمیشن
        logo.classList.add('play');

        console.log('🎬 انیمیشن SVG لوگو شروع شد');
    }

    // ────────────────────────────────────────
    // اجرای خودکار بعد از لود صفحه
    // ────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(playLogoAnimation, 250);
        });
    } else {
        setTimeout(playLogoAnimation, 250);
    }

    // ────────────────────────────────────────
    // API برای اجرای دوباره از Console
    // ────────────────────────────────────────
    window.replayLogoAnimation = playLogoAnimation;

})();