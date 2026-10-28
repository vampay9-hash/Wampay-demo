// ==========================================
// وام پی — Auth & UI Base
// فایل: persian-datepicker.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: تقویم شمسی خودساخته — تبدیل تاریخ + انتخاب‌گر بازشو
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🗓️ ثابت‌ها
    // ─────────────────────────────────────
    var MONTHS_FA = [
        'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
        'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
    ];

    var WEEKDAYS_FA = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
    var WEEKDAYS_LONG_FA = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

    var ATTR_INPUT    = 'data-persian-date';
    var ATTR_BOUND    = 'data-persian-date-bound';
    var ATTR_SKIP     = 'data-persian-date-skip';
    var ATTR_MIN      = 'data-persian-date-min';
    var ATTR_MAX      = 'data-persian-date-max';
    var ATTR_FORMAT   = 'data-persian-date-format';

    var CLASS_WRAP    = 'wam-pdate';
    var CLASS_INPUT   = 'wam-pdate__input';
    var CLASS_POPUP   = 'wam-pdate__popup';
    var CLASS_HEADER  = 'wam-pdate__header';
    var CLASS_GRID    = 'wam-pdate__grid';
    var CLASS_FOOTER  = 'wam-pdate__footer';
    var CLASS_DAY     = 'wam-pdate__day';
    var CLASS_SELECT  = 'wam-pdate__day--selected';
    var CLASS_TODAY   = 'wam-pdate__day--today';
    var CLASS_DISABLED= 'wam-pdate__day--disabled';
    var CLASS_OTHER   = 'wam-pdate__day--other';

    var Z_INDEX = 9999;

    // ─────────────────────────────────────
    // 🧮 تبدیل تاریخ جلالی ↔ میلادی
    // الگوریتم استاندارد (بدون کتابخانه)
    // ─────────────────────────────────────

    // تقسیم صحیح
    function _div(a, b) { return Math.floor(a / b); }

    // تبدیل جلالی به عدد روز مطلق (Julian Day Number)
    function _jalaliToJDN(jy, jm, jd) {
        var jy2 = jy + 1595;
        var days = -355668 + (365 * jy2) +
                   (_div(jy2, 33) * 8) +
                   _div((jy2 % 33) + 3, 4) +
                   jd +
                   ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30 + 186));
        return days;
    }

    // تبدیل JDN به جلالی
    function _jdnToJalali(jdn) {
        var gy = 1600, gm = 1, gd = 1;
        // ابتدا به میلادی
        var jdnGreg = jdn;
        var g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
        var gy2 = (jdnGreg > 0) ? jdnGreg : (jdnGreg + 1);
        gy2 = (gy2 - 1) % 365;
        var jd = (jdnGreg > 0) ? jdnGreg : (jdnGreg + 1);
        jd = (jd - 1) % 365;
        var leap = 0;
        var g = (jdnGreg - 1721119) + 1;
        var y = Math.floor((g - 1) / 365.2425);
        g = g - Math.floor(y * 365.2425);
        if (g < 0) { g += 365; y--; }
        if (g < 60) {
            // ادامه
        }
        // روش دقیق‌تر:
        return _jdnToJalaliExact(jdn);
    }

    // روش دقیق‌تر تبدیل JDN به جلالی
    function _jdnToJalaliExact(jdn) {
        var depoch = jdn - 2121445;
        var j_np = _div(depoch, 12053);
        depoch %= 12053;

        var jy = 979 + 33 * j_np + 4 * _div(depoch, 1461);
        depoch %= 1461;

        if (depoch >= 366) {
            jy += _div(depoch - 1, 365);
            depoch = (depoch - 1) % 365;
        }

        var jm, jd;
        if (depoch < 186) {
            jm = 1 + _div(depoch, 31);
            jd = 1 + (depoch % 31);
        } else {
            jm = 7 + _div(depoch - 186, 30);
            jd = 1 + ((depoch - 186) % 30);
        }
        return { jy: jy, jm: jm, jd: jd };
    }

    // تبدیل میلادی به JDN
    function _gregToJDN(gy, gm, gd) {
        var a = _div(14 - gm, 12);
        var y = gy + 4800 - a;
        var m = gm + 12 * a - 3;
        return gd + _div(153 * m + 2, 5) + 365 * y +
               _div(y, 4) - _div(y, 100) + _div(y, 400) - 32045;
    }

    // تبدیل JDN به میلادی
    function _jdnToGreg(jdn) {
        var a = jdn + 32044;
        var b = _div(4 * a + 3, 146097);
        var c = a - _div(146097 * b, 4);
        var d = _div(4 * c + 3, 1461);
        var e = c - _div(1461 * d, 4);
        var m = _div(5 * e + 2, 153);
        var gd = e - _div(153 * m + 2, 5) + 1;
        var gm = m + 3 - 12 * _div(m, 10);
        var gy = 100 * b + d - 4800 + _div(m, 10);
        return { gy: gy, gm: gm, gd: gd };
    }

    // جلالی ← میلادی
    function jalaliToGregorian(jy, jm, jd) {
        var jdn = _jalaliToJDN(jy, jm, jd);
        return _jdnToGreg(jdn);
    }

    // میلادی ← جلالی
    function gregorianToJalali(gy, gm, gd) {
        var jdn = _gregToJDN(gy, gm, gd);
        return _jdnToJalaliExact(jdn);
    }

    // آیا سال جلالی کبیسه است؟
    function isJalaliLeap(jy) {
        var mod = jy % 33;
        return mod === 1 || mod === 5 || mod === 9 || mod === 13 ||
               mod === 17 || mod === 22 || mod === 26 || mod === 30;
    }

    // تعداد روزهای ماه جلالی
    function daysInJalaliMonth(jy, jm) {
        if (jm <= 6) return 31;
        if (jm <= 11) return 30;
        return isJalaliLeap(jy) ? 30 : 29;
    }

    // امروز به جلالی
    function todayJalali() {
        var now = new Date();
        return gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    }

    // ─────────────────────────────────────
    // 📅 Date ↔ Jalali
    // ─────────────────────────────────────
    function dateToJalali(date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) return null;
        return gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    }

    function jalaliToDate(jy, jm, jd) {
        var g = jalaliToGregorian(jy, jm, jd);
        return new Date(g.gy, g.gm - 1, g.gd);
    }

    // ─────────────────────────────────────
    // 🔢 کمکی اعداد فارسی
    // ─────────────────────────────────────
    var FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

    function toPersianDigits(str) {
        return String(str).replace(/[0-9]/g, function (d) { return FA_DIGITS[+d]; });
    }

    function toEnglishDigits(str) {
        return String(str)
            .replace(/[۰-۹]/g, function (d) { return String(FA_DIGITS.indexOf(d)); })
            .replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); });
    }

    function pad2(n) { return (n < 10 ? '0' : '') + n; }

    // ─────────────────────────────────────
    // 📝 فرمت‌دهی/پارس تاریخ
    // ─────────────────────────────────────
    function formatJalali(jy, jm, jd, format) {
        format = format || 'YYYY/MM/DD';
        var yyyy = String(jy);
        var yy   = yyyy.slice(-2);
        var mm   = pad2(jm);
        var m    = String(jm);
        var dd   = pad2(jd);
        var d    = String(jd);
        var out = format
            .replace(/YYYY/g, yyyy)
            .replace(/YY/g, yy)
            .replace(/MM/g, mm)
            .replace(/M/g, m)
            .replace(/DD/g, dd)
            .replace(/D/g, d);
        return out;
    }

    function parseJalali(str, format) {
        if (!str) return null;
        str = toEnglishDigits(String(str).trim());
        format = format || 'YYYY/MM/DD';

        // ساخت regex از format
        var pattern = format
            .replace(/YYYY/g, '(\\d{4})')
            .replace(/YY/g, '(\\d{2})')
            .replace(/MM/g, '(\\d{1,2})')
            .replace(/M/g, '(\\d{1,2})')
            .replace(/DD/g, '(\\d{1,2})')
            .replace(/D/g, '(\\d{1,2})')
            .replace(/[.\-/]/g, function (c) { return '\\' + c; });

        var re = new RegExp('^' + pattern + '$');
        var m = str.match(re);
        if (!m) {
            // تلاش fallback: yyyy/mm/dd
            var parts = str.split(/[\/\-\.\s]+/);
            if (parts.length !== 3) return null;
            var jy2 = parseInt(parts[0], 10);
            var jm2 = parseInt(parts[1], 10);
            var jd2 = parseInt(parts[2], 10);
            if (isNaN(jy2) || isNaN(jm2) || isNaN(jd2)) return null;
            return { jy: jy2, jm: jm2, jd: jd2 };
        }
        // ترتیب پیش‌فرض: YYYY MM DD
        var jy = parseInt(m[1], 10);
        var jm = parseInt(m[2], 10);
        var jd = parseInt(m[3], 10);
        if (isNaN(jy) || isNaN(jm) || isNaN(jd)) return null;
        return { jy: jy, jm: jm, jd: jd };
    }

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        activeInput: null,
        activePopup: null,
        viewYear: 0,
        viewMonth: 0,
        selected: null,       // { jy, jm, jd }
        minDate: null,        // { jy, jm, jd }
        maxDate: null,
        boundCount: 0,
        observer: null,
        listeners: [],
        _outsideHandler: null,
        _scrollHandler: null
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var DatePickerEvents = {
        OPENED:   'datepicker.opened',
        CLOSED:   'datepicker.closed',
        SELECTED: 'datepicker.selected',
        CLEARED:  'datepicker.cleared'
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
    // 🎯 کمکی تاریخ
    // ─────────────────────────────────────
    function _jdnOf(j) { return _jalaliToJDN(j.jy, j.jm, j.jd); }

    function _isBefore(a, b) {
        if (!a || !b) return false;
        return _jdnOf(a) < _jdnOf(b);
    }

    function _isAfter(a, b) {
        if (!a || !b) return false;
        return _jdnOf(a) > _jdnOf(b);
    }

    function _isSame(a, b) {
        if (!a || !b) return false;
        return a.jy === b.jy && a.jm === b.jm && a.jd === b.jd;
    }

    function _isDisabled(j) {
        if (STATE.minDate && _isBefore(j, STATE.minDate)) return true;
        if (STATE.maxDate && _isAfter(j, STATE.maxDate)) return true;
        return false;
    }

    // ─────────────────────────────────────
    // 🏗️ ساخت popup
    // ─────────────────────────────────────
    function _buildPopup() {
        var popup = document.createElement('div');
        popup.className = CLASS_POPUP;
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-label', 'انتخاب تاریخ');
        popup.style.zIndex = Z_INDEX;

        popup.innerHTML =
            '<div class="' + CLASS_HEADER + '">' +
                '<button type="button" data-nav="prev-year"  aria-label="سال قبل">«</button>' +
                '<button type="button" data-nav="prev-month" aria-label="ماه قبل">‹</button>' +
                '<span class="wam-pdate__title" data-title></span>' +
                '<button type="button" data-nav="next-month" aria-label="ماه بعد">›</button>' +
                '<button type="button" data-nav="next-year"  aria-label="سال بعد">»</button>' +
            '</div>' +
            '<div class="wam-pdate__weekdays"></div>' +
            '<div class="' + CLASS_GRID + '" data-grid></div>' +
            '<div class="' + CLASS_FOOTER + '">' +
                '<button type="button" data-action="today">امروز</button>' +
                '<button type="button" data-action="clear">پاک کردن</button>' +
                '<button type="button" data-action="close">بستن</button>' +
            '</div>';

        // روزهای هفته
        var wd = popup.querySelector('.wam-pdate__weekdays');
        for (var i = 0; i < 7; i++) {
            var span = document.createElement('span');
            span.textContent = WEEKDAYS_FA[i];
            wd.appendChild(span);
        }

        // رویدادها
        popup.addEventListener('click', function (e) {
            var t = e.target;
            if (!t) return;

            // ناوبری
            var nav = t.getAttribute('data-nav');
            if (nav) {
                e.preventDefault();
                _navigate(nav);
                return;
            }

            // اکشن‌ها
            var action = t.getAttribute('data-action');
            if (action) {
                e.preventDefault();
                _handleAction(action);
                return;
            }

            // انتخاب روز
            if (t.classList && t.classList.contains(CLASS_DAY)) {
                var jdn = parseInt(t.getAttribute('data-jdn'), 10);
                if (isNaN(jdn)) return;
                if (t.classList.contains(CLASS_DISABLED)) return;
                var j = _jdnToJalaliExact(jdn);
                _selectDate(j);
            }
        });

        popup.addEventListener('mousedown', function (e) {
            // جلوگیری از blur input
            e.preventDefault();
        });

        return popup;
    }

    function _navigate(nav) {
        if (nav === 'prev-year')  STATE.viewYear -= 1;
        if (nav === 'next-year')  STATE.viewYear += 1;
        if (nav === 'prev-month') {
            STATE.viewMonth -= 1;
            if (STATE.viewMonth < 1) { STATE.viewMonth = 12; STATE.viewYear -= 1; }
        }
        if (nav === 'next-month') {
            STATE.viewMonth += 1;
            if (STATE.viewMonth > 12) { STATE.viewMonth = 1; STATE.viewYear += 1; }
        }
        _render();
    }

    function _handleAction(action) {
        if (action === 'today') {
            var t = todayJalali();
            if (!_isDisabled(t)) {
                _selectDate(t);
            } else {
                STATE.viewYear = t.jy;
                STATE.viewMonth = t.jm;
                _render();
            }
        } else if (action === 'clear') {
            _clearSelection();
        } else if (action === 'close') {
            close();
        }
    }

    // ─────────────────────────────────────
    // 🎨 رندر تقویم
    // ─────────────────────────────────────
    function _render() {
        if (!STATE.activePopup) return;

        var popup = STATE.activePopup;
        var titleEl = popup.querySelector('[data-title]');
        var gridEl  = popup.querySelector('[data-grid]');

        if (titleEl) {
            titleEl.textContent = MONTHS_FA[STATE.viewMonth - 1] + ' ' +
                                  toPersianDigits(STATE.viewYear);
        }

        if (!gridEl) return;
        gridEl.innerHTML = '';

        var jy = STATE.viewYear;
        var jm = STATE.viewMonth;

        // روز اول ماه در چه روزی از هفته است؟
        // تبدیل اول ماه به میلادی، سپس روز هفته
        var first = jalaliToGregorian(jy, jm, 1);
        var firstDate = new Date(first.gy, first.gm - 1, first.gd);
        // getDay(): 0=Sunday, 6=Saturday
        // در تقویم جلالی: شنبه = 0 ... جمعه = 6
        // روز هفته در JS: یکشنبه=0 .. شنبه=6
        // می‌خواهیم: شنبه=0
        var jsDay = firstDate.getDay(); // 0=Sunday
        // تبدیل: JS Sunday=0 → Jalali Sat=0 → offset
        // JS: Sat=6, Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5
        // Jalali: Sat=0, Sun=1, Mon=2, Tue=3, Wed=4, Thu=5, Fri=6
        var jStart;
        if (jsDay === 6) jStart = 0;      // Sat
        else if (jsDay === 0) jStart = 1; // Sun
        else jStart = jsDay + 1;          // Mon..Fri

        // پر کردن روزهای خالی ابتدای ماه
        for (var i = 0; i < jStart; i++) {
            var empty = document.createElement('span');
            empty.className = CLASS_DAY + ' ' + CLASS_OTHER;
            empty.style.visibility = 'hidden';
            empty.textContent = '';
            gridEl.appendChild(empty);
        }

        // روزهای ماه
        var days = daysInJalaliMonth(jy, jm);
        var today = todayJalali();

        for (var d = 1; d <= days; d++) {
            var cell = document.createElement('button');
            cell.type = 'button';
            cell.className = CLASS_DAY;
            cell.textContent = toPersianDigits(d);
            cell.setAttribute('data-jdn', String(_jalaliToJDN(jy, jm, d)));

            var cur = { jy: jy, jm: jm, jd: d };

            if (STATE.selected && _isSame(cur, STATE.selected)) {
                cell.classList.add(CLASS_SELECT);
            }
            if (_isSame(cur, today)) {
                cell.classList.add(CLASS_TODAY);
            }
            if (_isDisabled(cur)) {
                cell.classList.add(CLASS_DISABLED);
                cell.disabled = true;
            }
            gridEl.appendChild(cell);
        }

        // پر کردن روزهای خالی انتهای ماه برای تکمیل ردیف آخر
        var total = jStart + days;
        var remainder = total % 7;
        if (remainder !== 0) {
            for (var k = 0; k < (7 - remainder); k++) {
                var e2 = document.createElement('span');
                e2.className = CLASS_DAY + ' ' + CLASS_OTHER;
                e2.style.visibility = 'hidden';
                gridEl.appendChild(e2);
            }
        }
    }

    // ─────────────────────────────────────
    // 🎯 انتخاب تاریخ
    // ─────────────────────────────────────
    function _selectDate(j) {
        if (!STATE.activeInput) return;

        STATE.selected = { jy: j.jy, jm: j.jm, jd: j.jd };

        var format = STATE.activeInput.getAttribute(ATTR_FORMAT) || 'YYYY/MM/DD';
        var text = formatJalali(j.jy, j.jm, j.jd, format);

        STATE.activeInput.value = text;
        STATE.activeInput.setAttribute('data-jalali', j.jy + '/' + pad2(j.jm) + '/' + pad2(j.jd));
        STATE.activeInput.setAttribute('data-gregorian',
            (function () {
                var g = jalaliToGregorian(j.jy, j.jm, j.jd);
                return g.gy + '-' + pad2(g.gm) + '-' + pad2(g.gd);
            })()
        );

        // رویدادهای استاندارد فرم
        try {
            STATE.activeInput.dispatchEvent(new Event('input', { bubbles: true }));
            STATE.activeInput.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e) { /* بی‌صدا */ }

        _emit(DatePickerEvents.SELECTED, {
            input: STATE.activeInput,
            name: STATE.activeInput.name || STATE.activeInput.id || null,
            jalali: { jy: j.jy, jm: j.jm, jd: j.jd },
            gregorian: (function () {
                var g = jalaliToGregorian(j.jy, j.jm, j.jd);
                return { gy: g.gy, gm: g.gm, gd: g.gd };
            })(),
            text: text
        });

        close();
    }

    function _clearSelection() {
        if (!STATE.activeInput) return;
        STATE.selected = null;
        STATE.activeInput.value = '';
        STATE.activeInput.removeAttribute('data-jalali');
        STATE.activeInput.removeAttribute('data-gregorian');

        try {
            STATE.activeInput.dispatchEvent(new Event('input', { bubbles: true }));
            STATE.activeInput.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e) { /* بی‌صدا */ }

        _emit(DatePickerEvents.CLEARED, {
            input: STATE.activeInput,
            name: STATE.activeInput.name || STATE.activeInput.id || null
        });

        close();
    }

    // ─────────────────────────────────────
    // 🌐 موقعیت popup
    // ─────────────────────────────────────
    function _positionPopup(input, popup) {
        var rect = input.getBoundingClientRect();
        var pw = popup.offsetWidth || 300;
        var ph = popup.offsetHeight || 320;
        var vw = window.innerWidth;
        var vh = window.innerHeight;

        var top = rect.bottom + window.scrollY + 6;
        var left = rect.left + window.scrollX;

        // اگر از پایین بیرون می‌زند، بالا نشان بده
        if (rect.bottom + ph + 12 > vh) {
            top = rect.top + window.scrollY - ph - 6;
        }
        // اگر از راست بیرون می‌زند، بچسبان به راست
        if (left + pw > vw + window.scrollX - 8) {
            left = Math.max(8, vw + window.scrollX - pw - 8);
        }
        if (left < 8 + window.scrollX) {
            left = 8 + window.scrollX;
        }

        popup.style.top = top + 'px';
        popup.style.left = left + 'px';
    }

    // ─────────────────────────────────────
    // 🚪 باز/بسته
    // ─────────────────────────────────────
    function open(input) {
        if (!input) return false;
        if (STATE.activeInput === input && STATE.activePopup) return true;

        close();

        STATE.activeInput = input;

        // خواندن مقدار فعلی
        var currentVal = input.value;
        var format = input.getAttribute(ATTR_FORMAT) || 'YYYY/MM/DD';
        var parsed = parseJalali(currentVal, format);

        if (parsed) {
            STATE.selected = parsed;
            STATE.viewYear = parsed.jy;
            STATE.viewMonth = parsed.jm;
        } else {
            STATE.selected = null;
            var t = todayJalali();
            STATE.viewYear = t.jy;
            STATE.viewMonth = t.jm;
        }

        // min/max
        var minAttr = input.getAttribute(ATTR_MIN);
        var maxAttr = input.getAttribute(ATTR_MAX);
        STATE.minDate = minAttr ? parseJalali(minAttr, format) : null;
        STATE.maxDate = maxAttr ? parseJalali(maxAttr, format) : null;

        // ساخت popup
        var popup = _buildPopup();
        STATE.activePopup = popup;
        document.body.appendChild(popup);

        _render();
        _positionPopup(input, popup);

        // افکت
        popup.style.opacity = '0';
        popup.style.transform = 'translateY(-4px)';
        popup.style.transition = 'opacity .15s, transform .15s';
        requestAnimationFrame(function () {
            popup.style.opacity = '1';
            popup.style.transform = 'translateY(0)';
        });

        // بستن با کلیک بیرون
        STATE._outsideHandler = function (e) {
            if (popup.contains(e.target)) return;
            if (e.target === input) return;
            close();
        };
        setTimeout(function () {
            document.addEventListener('mousedown', STATE._outsideHandler);
        }, 0);

        // بستن با اسکرول
        STATE._scrollHandler = function () {
            if (!STATE.activePopup) return;
            _positionPopup(STATE.activeInput, STATE.activePopup);
        };
        window.addEventListener('scroll', STATE._scrollHandler, true);
        window.addEventListener('resize', STATE._scrollHandler);

        // ESC
        input.addEventListener('keydown', _escHandler);

        _emit(DatePickerEvents.OPENED, {
            input: input,
            name: input.name || input.id || null
        });

        return true;
    }

    function _escHandler(e) {
        if (e.key === 'Escape' || e.keyCode === 27) {
            e.preventDefault();
            close();
        }
    }

    function close() {
        var popup = STATE.activePopup;
        var input = STATE.activeInput;
        if (!popup && !input) return false;

        if (popup && popup.parentNode) {
            try { popup.parentNode.removeChild(popup); } catch (e) { /* بی‌صدا */ }
        }

        if (STATE._outsideHandler) {
            document.removeEventListener('mousedown', STATE._outsideHandler);
            STATE._outsideHandler = null;
        }
        if (STATE._scrollHandler) {
            window.removeEventListener('scroll', STATE._scrollHandler, true);
            window.removeEventListener('resize', STATE._scrollHandler);
            STATE._scrollHandler = null;
        }
        if (input) {
            input.removeEventListener('keydown', _escHandler);
        }

        STATE.activePopup = null;
        STATE.activeInput = null;
        STATE.selected = null;

        _emit(DatePickerEvents.CLOSED, {
            input: input,
            name: input ? (input.name || input.id) : null
        });

        return true;
    }

    function isOpen() {
        return !!STATE.activePopup;
    }

    // ─────────────────────────────────────
    // 🔧 بایند روی input
    // ─────────────────────────────────────
    function _shouldSkip(input) {
        if (!input || input.tagName !== 'INPUT') return true;
        if (input.hasAttribute(ATTR_SKIP)) return true;
        if (input.disabled) return true;
        if (input.readOnly) return true;
        return false;
    }

    function _isBound(input) {
        return input && input.getAttribute(ATTR_BOUND) === '1';
    }

    function bind(input) {
        if (!input || _shouldSkip(input) || _isBound(input)) return false;

        input.setAttribute(ATTR_BOUND, '1');
        if (!input.hasAttribute(ATTR_INPUT)) {
            input.setAttribute(ATTR_INPUT, '');
        }
        input.autocomplete = input.autocomplete || 'off';
        input.inputMode = 'numeric';

        // رویداد فوکوس → باز کن
        input.addEventListener('focus', function () { open(input); });
        input.addEventListener('click', function () { open(input); });

        // تایپ دستی — پارس و اعتبارسنجی در blur
        input.addEventListener('blur', function () {
            // کمی تاخیر تا کلیک روی popup ثبت شود
            setTimeout(function () {
                if (STATE.activeInput === input) return;

                var format = input.getAttribute(ATTR_FORMAT) || 'YYYY/MM/DD';
                var v = input.value.trim();
                if (!v) {
                    input.removeAttribute('data-jalali');
                    input.removeAttribute('data-gregorian');
                    return;
                }
                var parsed = parseJalali(v, format);
                if (!parsed) {
                    input.classList.add('wam-pdate__input--invalid');
                    return;
                }
                input.classList.remove('wam-pdate__input--invalid');
                input.value = formatJalali(parsed.jy, parsed.jm, parsed.jd, format);
                input.setAttribute('data-jalali',
                    parsed.jy + '/' + pad2(parsed.jm) + '/' + pad2(parsed.jd));
                var g = jalaliToGregorian(parsed.jy, parsed.jm, parsed.jd);
                input.setAttribute('data-gregorian',
                    g.gy + '-' + pad2(g.gm) + '-' + pad2(g.gd));
            }, 120);
        });

        STATE.boundCount++;
        return true;
    }

    function bindAll(root) {
        if (typeof document === 'undefined') return 0;
        root = root || document;
        var inputs = root.querySelectorAll('input[' + ATTR_INPUT + ']');
        var count = 0;
        for (var i = 0; i < inputs.length; i++) {
            if (bind(inputs[i])) count++;
        }
        return count;
    }

    function unbind(input) {
        if (!_isBound(input)) return false;
        input.removeAttribute(ATTR_BOUND);
        STATE.boundCount = Math.max(0, STATE.boundCount - 1);
        // نکته: کلون کردن برای حذف لیسنرها ساده‌ترین راه است ولی id را از دست می‌دهد
        // به‌جای آن فقط attribute را حذف می‌کنیم
        return true;
    }

    function unbindAll(root) {
        if (typeof document === 'undefined') return 0;
        root = root || document;
        var inputs = root.querySelectorAll('[' + ATTR_BOUND + '="1"]');
        var count = 0;
        for (var i = 0; i < inputs.length; i++) {
            if (unbind(inputs[i])) count++;
        }
        return count;
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var run = function () {
            var n = bindAll(options.root || document);
            if (n > 0 && options.debug) {
                console.log('[persian-datepicker] ' + n + ' فیلد بایند شد');
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run);
        } else {
            run();
        }

        // ناظر DOM برای محتوای داینامیک
        if (options.observe !== false && typeof MutationObserver !== 'undefined') {
            var scheduled = null;
            STATE.observer = new MutationObserver(function (muts) {
                var hasNode = false;
                for (var i = 0; i < muts.length; i++) {
                    if (muts[i].addedNodes && muts[i].addedNodes.length > 0) {
                        hasNode = true; break;
                    }
                }
                if (!hasNode) return;
                if (scheduled) clearTimeout(scheduled);
                scheduled = setTimeout(function () {
                    bindAll(options.root || document);
                }, 120);
            });

            var target = options.root || document.body || document.documentElement;
            if (target) {
                try {
                    STATE.observer.observe(target, { childList: true, subtree: true });
                } catch (e) { /* بی‌صدا */ }
            }
        }

        STATE.installed = true;
    }

    function uninstall() {
        if (STATE.observer) {
            try { STATE.observer.disconnect(); } catch (e) { /* بی‌صدا */ }
            STATE.observer = null;
        }
        close();
        unbindAll(document);
        STATE.installed = false;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            boundCount: STATE.boundCount,
            isOpen: isOpen(),
            activeInput: STATE.activeInput ?
                (STATE.activeInput.name || STATE.activeInput.id || null) : null
        };
    }

    function onChange(cb) {
        if (typeof cb !== 'function') return function () {};
        STATE.listeners.push(cb);
        return function () {
            var idx = STATE.listeners.indexOf(cb);
            if (idx !== -1) STATE.listeners.splice(idx, 1);
        };
    }

    // ─────────────────────────────────────
    // 🌐 API جهانی
    // ─────────────────────────────────────
    var WamPersianDate = {
        // ثوابت
        MONTHS: MONTHS_FA,
        WEEKDAYS: WEEKDAYS_FA,
        WEEKDAYS_LONG: WEEKDAYS_LONG_FA,
        EVENTS: DatePickerEvents,

        // تبدیل تاریخ
        jalaliToGregorian: jalaliToGregorian,
        gregorianToJalali: gregorianToJalali,
        dateToJalali: dateToJalali,
        jalaliToDate: jalaliToDate,
        todayJalali: todayJalali,
        isLeapYear: isJalaliLeap,
        daysInMonth: daysInJalaliMonth,

        // اعداد فارسی
        toPersianDigits: toPersianDigits,
        toEnglishDigits: toEnglishDigits,

        // فرمت
        format: formatJalali,
        parse: parseJalali,

        // کنترل
        open: open,
        close: close,
        isOpen: isOpen,

        // بایند
        bind: bind,
        bindAll: bindAll,
        unbind: unbind,
        unbindAll: unbindAll,

        // نصب
        install: install,
        uninstall: uninstall,

        // گزارش
        getStatus: getStatus,
        onChange: onChange
    };

    // ثبت جهانی
    window.WamPersianDate = WamPersianDate;
    window.JalaliDate = WamPersianDate;   // میان‌بر
    window.DatePickerEvents = DatePickerEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { install(); });
        } else {
            install();
        }
    }

})();