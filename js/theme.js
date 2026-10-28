// ==========================================
// وام پی — Auth & UI Base
// فایل: theme.js
// نسخه: 1.0.1
// تاریخ: 1405/01/15
// کارش: مدیریت تم روشن/تیره/خودکار + همگام‌سازی با سیستم
// تغییرات v1.0.1:
// - 🆕 اصلاح _readStored برای زمانی که Storage لود نشده
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
        current: THEMES.AUTO,
        effective: THEMES.LIGHT,
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
    // 💾 خواندن/نوشتن تنظیمات (v1.0.1 — مقاوم)
    // ─────────────────────────────────────
    function _readStored() {
        // 🆕 اول چک کن Storage وجود داره و تابع get داره
        if (typeof window.Storage !== 'undefined' && 
            window.Storage && 
            typeof window.Storage.get === 'function') {
            try {
                var v = window.Storage.get(THEME_KEY, null);
                if (v === THEMES.LIGHT || v === THEMES.DARK || v === THEMES.AUTO) {
                    return v;
                }
            } catch (e) {
                // بی‌صدا
            }
        }

        // 🆕 Fallback مستقیم به localStorage
        try {
            var raw = localStorage.getItem(THEME_KEY);
            if (raw === THEMES.LIGHT || raw === THEMES.DARK || raw === THEMES.AUTO) {
                return raw;
            }
        } catch (e) {
            // بی‌صدا
        }

        return null;
    }

    function _writeStored(theme) {
        // 🆕 اول با Storage
        if (typeof window.Storage !== 'undefined' && 
            window.Storage && 
            typeof window.Storage.set === 'function') {
            try {
                return window.Storage.set(THEME_KEY, theme);
            } catch (e) {
                // ادامه بده به localStorage
            }
        }

        // 🆕 Fallback مستقیم به localStorage
        try {
            localStorage.setItem(THEME_KEY, theme);
            return true;
        } catch (e) {
            return false;
        }
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
        root.style.colorScheme = effective;

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
        for (var i = 0; i < STATE.listeners.length; i++) {
            try { STATE.listeners[i](eventName, data); } catch (e) { /* بی‌صدا */ }
        }
    }

    // ─────────────────────────────────────
    // 🎯 API اصلی
    // ─────────────────────────────────────
    function getTheme() { return STATE.current; }
    function getEffectiveTheme() { return STATE.effective; }
    function isDark() { return STATE.effective === THEMES.DARK; }
    function isLight() { return STATE.effective === THEMES.LIGHT; }
    function isAuto() { return STATE.current === THEMES.AUTO; }

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
                previous: { current: prevCurrent, effective: prevEffective },
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
        if (STATE.current === THEMES.LIGHT)       return setTheme(THEMES.DARK);
        if (STATE.current === THEMES.DARK)        return setTheme(THEMES.AUTO);
        return setTheme(THEMES.LIGHT);
    }

    function toggleSimple() {
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

    function _installSystemListener() {
        if (typeof window === 'undefined') return;
        if (!window.matchMedia) return;

        try {
            STATE.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            STATE.systemPrefersDark = STATE.mediaQuery.matches;

            var handler = function (e) { _handleSystemChange(e.matches); };

            if (STATE.mediaQuery.addEventListener) {
                STATE.mediaQuery.addEventListener('change', handler);
            } else if (STATE.mediaQuery.addListener) {
                STATE.mediaQuery.addListener(handler);
            }
        } catch (e) { /* بی‌صدا */ }
    }

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
                if (mode === 'simple') toggleSimple();
                else if (mode === 'reset') reset();
                else if (mode === 'dark') setTheme(THEMES.DARK);
                else if (mode === 'light') setTheme(THEMES.LIGHT);
                else if (mode === 'auto') setTheme(THEMES.AUTO);
                else toggle();
            });

            if (btn.dataset) btn.dataset.wamThemeBound = '1';
            count++;
        }
        return count;
    }

    function _updateIcons(root) {
        if (typeof document === 'undefined') return;
        root = root || document;

        var icons = root.querySelectorAll('[data-theme-icon]');
        for (var i = 0; i < icons.length; i++) {
            var el = icons[i];
            var kind = el.getAttribute('data-theme-icon') || 'emoji';
            if (kind === 'emoji') {
                if (STATE.current === THEMES.AUTO) el.textContent = '🌗';
                else if (STATE.effective === THEMES.DARK) el.textContent = '🌙';
                else el.textContent = '☀️';
            }
        }
    }

    function install(options) {
        options = options || {};
        if (STATE.installed && !options.force) return;

        STATE.systemPrefersDark = _getSystemPrefersDark();

        var stored = _readStored();
        STATE.current = stored || options.default || THEMES.AUTO;
        STATE.effective = _resolveEffective(STATE.current, STATE.systemPrefersDark);

        _applyToDOM(STATE.effective, STATE.current);
        _installSystemListener();

        var bindWhenReady = function () {
            _bindToggleButtons();
            _updateIcons();

            if (!options.noAutoBind) {
                if (window.MutationObserver) {
                    var obs = new MutationObserver(function () {
                        _bindToggleButtons();
                        _updateIcons();
                    });
                    obs.observe(document.body, { childList: true, subtree: true });
                }
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bindWhenReady);
        } else {
            bindWhenReady();
        }

        _emit(ThemeEvents.APPLIED, {
            current: STATE.current,
            effective: STATE.effective,
            initial: true
        });

        STATE.installed = true;
    }

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

    function onChange(callback) {
        if (typeof callback !== 'function') return function () {};
        STATE.listeners.push(callback);
        return function unsubscribe() {
            var idx = STATE.listeners.indexOf(callback);
            if (idx !== -1) STATE.listeners.splice(idx, 1);
        };
    }

    var WamTheme = {
        THEMES: THEMES,
        LABELS: THEME_LABELS,
        EVENTS: ThemeEvents,
        STORAGE_KEY: THEME_KEY,

        install: install,

        get: getTheme,
        getEffective: getEffectiveTheme,
        getSystem: getSystemTheme,
        isDark: isDark,
        isLight: isLight,
        isAuto: isAuto,

        set: setTheme,
        toggle: toggle,
        toggleSimple: toggleSimple,
        reset: reset,

        bindToggleButtons: _bindToggleButtons,
        updateIcons: _updateIcons,

        getStatus: getStatus,
        getAllThemes: getAllThemes,
        getThemeLabel: getThemeLabel,

        onChange: onChange
    };

    window.WamTheme = WamTheme;
    window.ThemeEvents = ThemeEvents;

    // اعمال سریع اولیه (v1.0.1 — مقاوم)
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