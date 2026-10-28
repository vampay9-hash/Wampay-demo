// ==========================================
// وام پی — Auth & UI Base
// فایل: global-keys.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: میان‌برهای کیبورد سراسری + پنل راهنما
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // ⌨️ ثابت‌ها
    // ─────────────────────────────────────
    var ATTR_BIND = 'data-wam-keys-skip';
    var MOD_SEP   = '+';
    var HELP_ID   = 'wam-keys-help';

    // کلیدهای مجاز به‌عنوان modifier
    var MODIFIERS = ['ctrl', 'alt', 'shift', 'meta'];

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        shortcuts: [],       // لیست میان‌برها
        helpOpen: false,
        helpEl: null,
        enabled: true,
        seqBuffer: [],       // برای میان‌برهای چندمرحله‌ای (اختیاری)
        seqTimer: null,
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var KeysEvents = {
        TRIGGERED: 'keys.triggered',
        MISSED:    'keys.missed',
        HELP_OPEN: 'keys.help.open',
        HELP_CLOSE:'keys.help.close'
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
    // 🔍 ابزارهای کمکی
    // ─────────────────────────────────────
    function _isEditable(target) {
        if (!target || target.nodeType !== 1) return false;
        var tag = (target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
        if (target.isContentEditable) return true;
        // داخل کامپوننت‌های خاص
        if (target.closest && target.closest('[contenteditable="true"]')) return true;
        return false;
    }

    function _isSkipped() {
        if (typeof document === 'undefined') return false;
        var root = document.documentElement;
        if (root && root.hasAttribute(ATTR_BIND)) return true;
        var body = document.body;
        if (body && body.hasAttribute(ATTR_BIND)) return true;
        return false;
    }

    // نرمال‌سازی کلید
    function _normalizeKey(key) {
        if (!key) return '';
        key = String(key).toLowerCase().trim();
        if (key === 'esc' || key === 'escape') return 'escape';
        if (key === ' ') return 'space';
        if (key === 'return') return 'enter';
        if (key === 'arrowup' || key === 'up') return 'arrowup';
        if (key === 'arrowdown' || key === 'down') return 'arrowdown';
        if (key === 'arrowleft' || key === 'left') return 'arrowleft';
        if (key === 'arrowright' || key === 'right') return 'arrowright';
        if (key === 'del') return 'delete';
        if (key === 'ins') return 'insert';
        if (key === 'pgup') return 'pageup';
        if (key === 'pgdn') return 'pagedown';
        return key;
    }

    // نرمال‌سازی یک رشته میان‌بر (مثل "Ctrl+Alt+D") به ساختار
    // خروجی: { ctrl, alt, shift, meta, key, raw }
    function parseShortcut(str) {
        if (!str || typeof str !== 'string') return null;
        var parts = str.split(MOD_SEP).map(function (s) { return s.trim(); })
                       .filter(function (s) { return s.length > 0; });
        if (parts.length === 0) return null;

        var combo = {
            ctrl: false, alt: false, shift: false, meta: false,
            key: null, raw: str.trim()
        };

        for (var i = 0; i < parts.length; i++) {
            var p = parts[i].toLowerCase();
            if (p === 'ctrl' || p === 'control')    combo.ctrl = true;
            else if (p === 'alt')                    combo.alt = true;
            else if (p === 'shift')                  combo.shift = true;
            else if (p === 'meta' || p === 'cmd')    combo.meta = true;
            else                                     combo.key = _normalizeKey(p);
        }

        if (!combo.key) return null;
        return combo;
    }

    // ساخت رشته نمایشی (برای راهنما)
    function formatShortcut(combo, forMac) {
        if (typeof combo === 'string') combo = parseShortcut(combo);
        if (!combo) return '';
        var parts = [];
        if (combo.ctrl)  parts.push(forMac ? '⌃' : 'Ctrl');
        if (combo.alt)   parts.push(forMac ? '⌥' : 'Alt');
        if (combo.shift) parts.push(forMac ? '⇧' : 'Shift');
        if (combo.meta)  parts.push(forMac ? '⌘' : 'Meta');

        var keyLabel = combo.key;
        var map = {
            'escape':    'Esc',
            'enter':     'Enter',
            'space':     'Space',
            'tab':       'Tab',
            'backspace': 'Backspace',
            'delete':    'Del',
            'arrowup':   '↑',
            'arrowdown': '↓',
            'arrowleft': '←',
            'arrowright':'→',
            'pageup':    'PgUp',
            'pagedown':  'PgDn',
            'home':      'Home',
            'end':       'End',
            'insert':    'Ins'
        };
        if (map[keyLabel]) keyLabel = map[keyLabel];
        else if (keyLabel && keyLabel.length === 1) keyLabel = keyLabel.toUpperCase();
        else if (keyLabel) keyLabel = keyLabel.charAt(0).toUpperCase() + keyLabel.slice(1);

        parts.push(keyLabel);
        return parts.join(' + ');
    }

    // ─────────────────────────────────────
    // 🎯 مطابقت کلید فشرده‌شده با میان‌بر
    // ─────────────────────────────────────
    function _matches(e, combo) {
        if (!e || !combo) return false;

        var key = (e.key || '').toLowerCase();
        // پشتیبانی از e.keyCode در موارد نادر
        var normalized = _normalizeKey(key);

        if (normalized !== combo.key) return false;

        // برای دکمه‌های حرفی، از getModifierState استفاده نکن؛ از پرچم‌ها
        if (!!e.ctrlKey  !== !!combo.ctrl)  return false;
        if (!!e.altKey   !== !!combo.alt)   return false;
        if (!!e.shiftKey !== !!combo.shift) return false;
        if (!!e.metaKey  !== !!combo.meta)  return false;

        return true;
    }

    // ─────────────────────────────────────
    // 🎯 اجرای یک میان‌بر
    // ─────────────────────────────────────
    function _trigger(entry, e) {
        var ctx = {
            event: e,
            combo: entry.combo,
            raw: entry.raw,
            description: entry.description,
            scope: entry.scope,
            at: Date.now()
        };

        // محدودیت scope
        if (typeof entry.when === 'function') {
            try {
                if (!entry.when(ctx)) {
                    _emit(KeysEvents.MISSED, ctx);
                    return false;
                }
            } catch (err) {
                console.warn('[global-keys] خطا در when:', err);
                return false;
            }
        }

        // محدودیت نقش
        if (entry.roles && entry.roles.length > 0) {
            if (typeof WamPermissions === 'undefined') return false;
            if (!WamPermissions.hasRole(null, entry.roles)) {
                _emit(KeysEvents.MISSED, ctx);
                return false;
            }
        }

        // جلوگیری از پیش‌فرض
        if (entry.preventDefault !== false && e) {
            e.preventDefault();
            e.stopPropagation();
        }

        // فراخوانی handler
        try {
            entry.handler(ctx);
        } catch (err) {
            console.error('[global-keys] خطا در اجرای میان‌بر:', err);
        }

        _emit(KeysEvents.TRIGGERED, {
            raw: entry.raw,
            description: entry.description,
            scope: entry.scope,
            at: Date.now()
        });

        return true;
    }

    // ─────────────────────────────────────
    // 🎧 هندلر اصلی
    // ─────────────────────────────────────
    function _handleKeydown(e) {
        if (!STATE.enabled) return;
        if (_isSkipped()) return;

        // اگر داخل input هستیم و میان‌بر با modifier نیست، رد شو
        var inEditable = _isEditable(e.target);
        var hasModifier = e.ctrlKey || e.altKey || e.metaKey;

        for (var i = 0; i < STATE.shortcuts.length; i++) {
            var entry = STATE.shortcuts[i];
            if (!entry || !entry.combo) continue;

            if (!_matches(e, entry.combo)) continue;

            // اگر داخل فیلد متنی هستیم، فقط میان‌برهای Escape و میان‌برهای با modifier مجازند
            if (inEditable && !hasModifier && entry.combo.key !== 'escape') {
                continue;
            }

            // allowInInput = true → حتی داخل input اجرا شود
            if (inEditable && !hasModifier && !entry.allowInInput &&
                entry.combo.key !== 'escape') {
                continue;
            }

            if (_trigger(entry, e)) return;
        }
    }

    // ─────────────────────────────────────
    // ➕ ثبت/حذف میان‌بر
    // ─────────────────────────────────────
    function register(spec) {
        if (!spec) return null;

        var raw = spec.key || spec.shortcut || spec.keys;
        var combo = typeof raw === 'string'
            ? parseShortcut(raw)
            : (raw && typeof raw === 'object' ? raw : null);

        if (!combo) return null;
        if (typeof spec.handler !== 'function') return null;

        var entry = {
            combo: combo,
            raw: formatShortcut(combo),
            description: spec.description || '',
            scope: spec.scope || 'global',
            roles: Array.isArray(spec.roles) ? spec.roles.slice() : null,
            when: typeof spec.when === 'function' ? spec.when : null,
            preventDefault: spec.preventDefault !== false,
            allowInInput: !!spec.allowInInput,
            handler: spec.handler,
            id: spec.id || ('k_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8))
        };

        // حذف تکراری بر اساس id
        if (spec.id) {
            unregister(spec.id);
        }

        STATE.shortcuts.push(entry);
        return entry;
    }

    function registerMany(list) {
        if (!Array.isArray(list)) return 0;
        var n = 0;
        for (var i = 0; i < list.length; i++) {
            if (register(list[i])) n++;
        }
        return n;
    }

    function unregister(idOrRaw) {
        if (!idOrRaw) return false;
        var removed = 0;
        for (var i = STATE.shortcuts.length - 1; i >= 0; i--) {
            var s = STATE.shortcuts[i];
            if (s.id === idOrRaw || s.raw === idOrRaw) {
                STATE.shortcuts.splice(i, 1);
                removed++;
            }
        }
        return removed > 0;
    }

    function unregisterAll() {
        var n = STATE.shortcuts.length;
        STATE.shortcuts = [];
        return n;
    }

    function list() {
        return STATE.shortcuts.map(function (s) {
            return {
                id: s.id,
                key: s.raw,
                description: s.description,
                scope: s.scope,
                roles: s.roles
            };
        });
    }

    // ─────────────────────────────────────
    // 🎛️ فعال/غیرفعال
    // ─────────────────────────────────────
    function enable() {
        STATE.enabled = true;
        return true;
    }

    function disable() {
        STATE.enabled = false;
        return true;
    }

    function toggle() {
        return STATE.enabled ? disable() : enable();
    }

    function isEnabled() {
        return STATE.enabled;
    }

    // ─────────────────────────────────────
    // 📖 پنل راهنما
    // ─────────────────────────────────────
    function _buildHelpPanel() {
        var existing = document.getElementById(HELP_ID);
        if (existing) existing.parentNode.removeChild(existing);

        var wrap = document.createElement('div');
        wrap.id = HELP_ID;
        wrap.className = 'wam-keys-help';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-label', 'راهنمای میان‌برها');

        var shortcuts = STATE.shortcuts.slice();

        // گروه‌بندی بر اساس scope
        var groups = {};
        for (var i = 0; i < shortcuts.length; i++) {
            var s = shortcuts[i];
            var sc = s.scope || 'global';
            if (!groups[sc]) groups[sc] = [];
            groups[sc].push(s);
        }

        var html = '';
        html += '<div class="wam-keys-help__overlay" data-close></div>';
        html += '<div class="wam-keys-help__panel">';
        html += '<header class="wam-keys-help__head">';
        html += '<h3>⌨️ میان‌برهای کیبورد</h3>';
        html += '<button type="button" class="wam-keys-help__close" data-close aria-label="بستن">×</button>';
        html += '</header>';
        html += '<div class="wam-keys-help__body">';

        if (shortcuts.length === 0) {
            html += '<p class="wam-keys-help__empty">هنوز میان‌بری ثبت نشده است.</p>';
        } else {
            var scopeOrder = ['global', 'navigation', 'case', 'admin', 'broker', 'verifier', 'applicant', 'dev'];
            var scopeLabels = {
                global: 'عمومی',
                navigation: 'پیمایش',
                case: 'پرونده',
                admin: 'پنل ادمین',
                broker: 'پنل کارگزار',
                verifier: 'پنل اعتبارسنج',
                applicant: 'پنل متقاضی',
                dev: 'توسعه'
            };
            var done = {};
            var orderedScopes = [];

            for (var k = 0; k < scopeOrder.length; k++) {
                if (groups[scopeOrder[k]]) {
                    orderedScopes.push(scopeOrder[k]);
                    done[scopeOrder[k]] = true;
                }
            }
            for (var sc2 in groups) {
                if (!done[sc2]) orderedScopes.push(sc2);
            }

            for (var j = 0; j < orderedScopes.length; j++) {
                var sc3 = orderedScopes[j];
                html += '<section class="wam-keys-help__group">';
                html += '<h4>' + (scopeLabels[sc3] || sc3) + '</h4>';
                html += '<ul>';
                for (var m = 0; m < groups[sc3].length; m++) {
                    var item = groups[sc3][m];
                    html += '<li>';
                    html += '<kbd>' + _escapeHtml(item.raw) + '</kbd>';
                    html += '<span>' + _escapeHtml(item.description || '—') + '</span>';
                    html += '</li>';
                }
                html += '</ul>';
                html += '</section>';
            }
        }

        html += '</div>';
        html += '</div>';
        wrap.innerHTML = html;

        // رویدادها
        wrap.addEventListener('click', function (e) {
            var t = e.target;
            if (!t) return;
            if (t.hasAttribute('data-close') || t.closest('[data-close]')) {
                closeHelp();
            }
        });

        document.body.appendChild(wrap);
        STATE.helpEl = wrap;

        // انیمیشن
        requestAnimationFrame(function () {
            wrap.classList.add('wam-keys-help--visible');
        });

        return wrap;
    }

    function _escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function openHelp() {
        if (typeof document === 'undefined') return false;
        if (STATE.helpOpen) return true;
        _buildHelpPanel();
        STATE.helpOpen = true;
        _emit(KeysEvents.HELP_OPEN, { count: STATE.shortcuts.length });
        return true;
    }

    function closeHelp() {
        if (!STATE.helpOpen) return false;
        var el = STATE.helpEl;
        if (el && el.parentNode) {
            el.classList.remove('wam-keys-help--visible');
            setTimeout(function () {
                if (el && el.parentNode) el.parentNode.removeChild(el);
            }, 180);
        }
        STATE.helpEl = null;
        STATE.helpOpen = false;
        _emit(KeysEvents.HELP_CLOSE, {});
        return true;
    }

    function toggleHelp() {
        return STATE.helpOpen ? closeHelp() : openHelp();
    }

    // ─────────────────────────────────────
    // 📥 نصب لیسنر اصلی
    // ─────────────────────────────────────
    function _installListener() {
        if (typeof document === 'undefined') return;
        document.addEventListener('keydown', _handleKeydown, true);
    }

    // ─────────────────────────────────────
    // 📦 میان‌برهای پیش‌فرض وام پی
    // ─────────────────────────────────────
    function _registerDefaults() {
        // راهنما
        register({
            id: 'help',
            key: 'shift+?',
            description: 'نمایش راهنمای میان‌برها',
            scope: 'global',
            handler: function () { toggleHelp(); }
        });

        // بستن پنل/مودال
        register({
            id: 'esc',
            key: 'Escape',
            description: 'بستن پنجره/پنل باز',
            scope: 'global',
            allowInInput: true,
            handler: function () {
                if (STATE.helpOpen) { closeHelp(); return; }
                // بستن مودال WamUI
                var modal = document.querySelector('.wam-ui-modal, .wam-ui-dialog');
                if (modal) {
                    var closeBtn = modal.querySelector('[data-close], .wam-ui-close');
                    if (closeBtn) closeBtn.click();
                }
            }
        });

        // تم تیره/روشن
        register({
            id: 'theme-toggle',
            key: 'alt+t',
            description: 'تغییر تم روشن/تیره',
            scope: 'global',
            handler: function () {
                if (typeof WamTheme !== 'undefined') WamTheme.toggleSimple();
            }
        });

        // دیباگ
        register({
            id: 'debug-toggle',
            key: 'alt+d',
            description: 'باز/بستن پنل دیباگ',
            scope: 'dev',
            roles: ['admin', 'super_admin'],
            handler: function () {
                if (typeof WamUI !== 'undefined' && WamUI.openDebug) {
                    WamUI.openDebug();
                }
            }
        });

        // دیباگ ماشین وضعیت
        register({
            id: 'sm-debug',
            key: 'alt+shift+d',
            description: 'فعال/غیرفعال دیباگ state machine',
            scope: 'dev',
            roles: ['admin', 'super_admin'],
            handler: function () {
                if (typeof WamStateDebug !== 'undefined') {
                    WamStateDebug.toggle();
                }
            }
        });

        // رفتن به خانه نقش
        register({
            id: 'home',
            key: 'alt+h',
            description: 'رفتن به صفحه اصلی نقش',
            scope: 'navigation',
            handler: function () {
                if (typeof WamPayGuard === 'undefined') return;
                var user = WamPayGuard.getCurrentUser();
                if (user && user.role) {
                    WamPayGuard.redirectToRoleHome(user.role);
                }
            }
        });
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        _installListener();

        if (options.registerDefaults !== false) {
            _registerDefaults();
        }

        if (Array.isArray(options.shortcuts)) {
            registerMany(options.shortcuts);
        }

        STATE.installed = true;
    }

    function uninstall() {
        if (typeof document !== 'undefined') {
            document.removeEventListener('keydown', _handleKeydown, true);
        }
        closeHelp();
        STATE.installed = false;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            enabled: STATE.enabled,
            count: STATE.shortcuts.length,
            helpOpen: STATE.helpOpen
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
    var WamGlobalKeys = {
        // ثوابت
        EVENTS: KeysEvents,
        HELP_ID: HELP_ID,

        // نصب
        install: install,
        uninstall: uninstall,

        // کنترل
        enable: enable,
        disable: disable,
        toggle: toggle,
        isEnabled: isEnabled,

        // ثبت
        register: register,
        registerMany: registerMany,
        unregister: unregister,
        unregisterAll: unregisterAll,
        list: list,

        // راهنما
        openHelp: openHelp,
        closeHelp: closeHelp,
        toggleHelp: toggleHelp,

        // کمکی
        parseShortcut: parseShortcut,
        formatShortcut: formatShortcut,

        // گزارش
        getStatus: getStatus,
        onChange: onChange
    };

    // ثبت جهانی
    window.WamGlobalKeys = WamGlobalKeys;
    window.WamKeys = WamGlobalKeys;   // میان‌بر
    window.KeysEvents = KeysEvents;

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