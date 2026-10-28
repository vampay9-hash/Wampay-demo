// ==========================================
// وام پی — نقطه ورود اصلی (Bootstrap)
// فایل: js/app.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// ==========================================
//
// این فایل، نقطه ورود نهایی کل برنامه است.
//   - تشخیص خودکار صفحه از data-page یا location.pathname
//   - راه‌اندازی ماژول‌های مربوطه هر صفحه
//   - گارد احراز هویت (WamPayGuard)
//   - هدایت نقش‌محور (role-based redirect)
//   - مدیریت خطاهای سراسری
//   - مدیریت وضعیت بارگذاری
//   - ناوبری سراسری
//
// وابستگی‌های اختیاری (هرکدام در دسترس باشد، استفاده می‌شود):
//   WamPayGuard, WamLogin, WamPermissions, WamUI,
//   WamDashboard, WamFollowUps, WamCases, CaseDetails,
//   WamConsultations, WamCalculator, WamLoanRegister,
//   WamPricing, WamWallet, WamContracts, WamPayments,
//   WamFinancialReports, WamAdvancedReports, EventBus,
//   WamPersianDate, Storage
//
// ==========================================

(function (global) {
  'use strict';

  var VERSION = '1.0.0';
  var NS = 'WamApp';
  var LOG_PREFIX = '[WamApp]';

  // ─── تنظیمات ───
  var CONFIG = {
    debug: false,
    pageAttr: 'data-page',
    rootAttr: 'data-app-root',
    homeByRole: {
      super_admin: 'admin-dashboard.html',
      admin: 'admin-dashboard.html',
      verifier: 'verifier-dashboard.html',
      broker: 'broker-dashboard.html',
      applicant: 'applicant-dashboard.html'
    },
    publicPages: ['login', 'register', 'forgot-password', 'reset-password'],
    loginPage: 'login.html'
  };

  // ─── وضعیت ───
  var _booted = false;
  var _page = null;
  var _pageModule = null;
  var _readyCallbacks = [];
  var _errorHandlers = [];

  // ─────────────────────────────
  // ابزارها
  // ─────────────────────────────

  function _log() {
    if (CONFIG.debug) {
      var args = Array.prototype.slice.call(arguments);
      console.log.apply(console, [LOG_PREFIX].concat(args));
    }
  }

  function _warn() {
    var args = Array.prototype.slice.call(arguments);
    if (global.console && console.warn) {
      console.warn.apply(console, [LOG_PREFIX].concat(args));
    }
  }

  function _err() {
    var args = Array.prototype.slice.call(arguments);
    if (global.console && console.error) {
      console.error.apply(console, [LOG_PREFIX].concat(args));
    }
  }

  function _qs(sel, ctx) {
    try { return (ctx || document).querySelector(sel); } catch (_) { return null; }
  }

  function _qsa(sel, ctx) {
    try {
      return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
    } catch (_) { return []; }
  }

  function _emit(name, payload) {
    try {
      if (global.EventBus && typeof global.EventBus.emit === 'function') {
        global.EventBus.emit(name, payload);
      }
    } catch (_) {}
  }

  function _has(name) {
    return !!(global[name]);
  }

  // ─────────────────────────────
  // تشخیص صفحه
  // ─────────────────────────────

  function detectPage() {
    // ۱) از data-page روی body یا html
    var body = document.body;
    var html = document.documentElement;
    var fromAttr = (body && body.getAttribute && body.getAttribute(CONFIG.pageAttr))
                || (html && html.getAttribute && html.getAttribute(CONFIG.pageAttr));
    if (fromAttr) return String(fromAttr).trim().toLowerCase();

    // ۲) از data-page-page legacy
    var legacy = body && body.getAttribute && body.getAttribute('data-page-page');
    if (legacy) return String(legacy).trim().toLowerCase();

    // ۳) از نام فایل
    var path = (global.location && global.location.pathname) || '';
    var file = path.split('/').pop() || '';
    file = file.replace(/\.html?$/i, '').toLowerCase();
    if (!file) return 'index';
    return file;
  }

  // ─────────────────────────────
  // گارد احراز هویت
  // ─────────────────────────────

  function isPublicPage(page) {
    return CONFIG.publicPages.indexOf(page) >= 0;
  }

  function isLoggedIn() {
    try {
      if (global.WamLogin && typeof global.WamLogin.isLoggedIn === 'function') {
        return !!global.WamLogin.isLoggedIn();
      }
      if (global.WamLogin && typeof global.WamLogin.getCurrentUser === 'function') {
        return !!global.WamLogin.getCurrentUser();
      }
      if (global.Storage && typeof global.Storage.get === 'function') {
        var raw = global.Storage.get('wamPayCurrentUser');
        if (raw) return true;
      }
    } catch (_) {}
    return false;
  }

  function currentRole() {
    try {
      if (global.WamLogin && typeof global.WamLogin.getCurrentUser === 'function') {
        var u = global.WamLogin.getCurrentUser();
        if (u) return u.role || u.userRole || null;
      }
      if (global.Storage && typeof global.Storage.get === 'function') {
        var raw = global.Storage.get('wamPayCurrentUser');
        if (raw) {
          var obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
          return obj && (obj.role || obj.userRole) || null;
        }
      }
    } catch (_) {}
    return null;
  }

  function homeFor(role) {
    if (!role) return CONFIG.loginPage;
    return CONFIG.homeByRole[role] || CONFIG.loginPage;
  }

  function redirect(url) {
    if (!url) return;
    if (global.location && global.location.href) {
      var cur = global.location.pathname.split('/').pop() || '';
      var target = String(url).split('/').pop() || '';
      if (cur === target) return;
      global.location.href = url;
    }
  }

  function guardPage(page) {
    if (isPublicPage(page)) return { ok: true };

    if (!isLoggedIn()) {
      _log('Not logged in — redirect to login');
      var back = encodeURIComponent(
        (global.location && global.location.pathname) || ''
      );
      redirect(CONFIG.loginPage + '?back=' + back);
      return { ok: false, reason: 'not_logged_in' };
    }

    // بررسی دسترسی نقش
    if (_has('WamPayGuard') && global.WamPayGuard) {
      try {
        if (typeof global.WamPayGuard.guard === 'function') {
          var r = global.WamPayGuard.guard(page);
          if (r === false) {
            var role = currentRole();
            redirect(homeFor(role));
            return { ok: false, reason: 'forbidden' };
          }
        }
      } catch (e) {
        _warn('Guard error:', e);
      }
    }

    return { ok: true };
  }

  // ─────────────────────────────
  // نگاشت صفحه → ماژول راه‌انداز
  // ─────────────────────────────

  var PAGE_BOOTSTRAP = {
    // ── عمومی ──
    'login':                 _bootLogin,
    'register':              _bootRegister,
    'forgot-password':       _bootForgotPassword,
    'reset-password':        _bootResetPassword,
    'index':                 _bootIndex,

    // ── داشبوردهای نقش‌محور ──
    'admin-dashboard':       _bootDashboard,
    'verifier-dashboard':    _bootDashboard,
    'broker-dashboard':      _bootDashboard,
    'applicant-dashboard':   _bootDashboard,
    'dashboard':             _bootDashboard,

    // ── پرونده‌ها ──
    'cases':                 _bootCases,
    'case-details':          _bootCaseDetails,
    'case-details-wizard':   _bootCaseWizard,

    // ── مشاوره ──
    'consultations':         _bootConsultations,
    'consultation-details':  _bootConsultationDetails,
    'consultation-tasks':    _bootConsultationTasks,

    // ── مالی ──
    'calculator':            _bootCalculator,
    'loan-register':         _bootLoanRegister,
    'pricing':               _bootPricing,
    'wallet':                _bootWallet,
    'contracts':             _bootContracts,
    'payments':              _bootPayments,

    // ── گزارش ──
    'financial-reports':     _bootFinancialReports,
    'advanced-reports':      _bootAdvancedReports,

    // ── پیگیری ──
    'follow-ups':            _bootFollowUps
  };

  // ─────────────────────────────
  // توابع راه‌انداز هر صفحه
  // ─────────────────────────────

  function _safeInstall(name, fn, opts) {
    try {
      if (!fn) { _warn('Module missing for:', name); return false; }
      fn(opts || {});
      _log('Booted:', name);
      return true;
    } catch (e) {
      _err('Boot failed for', name, e);
      _emit('app:module-error', { name: name, error: e });
      return false;
    }
  }

  function _bootLogin() {
    if (_has('WamLogin') && global.WamLogin && typeof global.WamLogin.install === 'function') {
      _safeInstall('WamLogin', global.WamLogin.install, { debug: CONFIG.debug });
    }
  }

  function _bootRegister() {
    _bootLogin();
  }

  function _bootForgotPassword() {
    _bootLogin();
  }

  function _bootResetPassword() {
    _bootLogin();
  }

  function _bootIndex() {
    // اگر لاگین است → داشبورد نقش، وگرنه → login
    if (isLoggedIn()) {
      redirect(homeFor(currentRole()));
    } else {
      redirect(CONFIG.loginPage);
    }
  }

  function _bootDashboard() {
    if (_has('WamDashboard') && global.WamDashboard &&
        typeof global.WamDashboard.install === 'function') {
      _safeInstall('WamDashboard', global.WamDashboard.install, {
        autoRefresh: true,
        autoRefreshMs: 60000,
        debug: CONFIG.debug
      });
    }
  }

  function _bootCases() {
    if (_has('WamCases') && global.WamCases &&
        typeof global.WamCases.install === 'function') {
      _safeInstall('WamCases', global.WamCases.install, { debug: CONFIG.debug });
    }
  }

  function _bootCaseDetails() {
    if (_has('CaseDetails') && global.CaseDetails &&
        typeof global.CaseDetails.install === 'function') {
      _safeInstall('CaseDetails', global.CaseDetails.install, { debug: CONFIG.debug });
    }
  }

  function _bootCaseWizard() {
    if (_has('CaseDetailsWizard') && global.CaseDetailsWizard &&
        typeof global.CaseDetailsWizard.install === 'function') {
      _safeInstall('CaseDetailsWizard', global.CaseDetailsWizard.install, { debug: CONFIG.debug });
    }
  }

  function _bootConsultations() {
    if (_has('WamConsultations') && global.WamConsultations &&
        typeof global.WamConsultations.install === 'function') {
      _safeInstall('WamConsultations', global.WamConsultations.install, { debug: CONFIG.debug });
    }
  }

  function _bootConsultationDetails() {
    if (_has('WamConsultationDetails') && global.WamConsultationDetails &&
        typeof global.WamConsultationDetails.install === 'function') {
      _safeInstall('WamConsultationDetails', global.WamConsultationDetails.install, { debug: CONFIG.debug });
    }
  }

  function _bootConsultationTasks() {
    if (_has('WamConsultationTasks') && global.WamConsultationTasks &&
        typeof global.WamConsultationTasks.install === 'function') {
      _safeInstall('WamConsultationTasks', global.WamConsultationTasks.install, { debug: CONFIG.debug });
    }
  }

  function _bootCalculator() {
    if (_has('WamCalculator') && global.WamCalculator &&
        typeof global.WamCalculator.install === 'function') {
      _safeInstall('WamCalculator', global.WamCalculator.install, { debug: CONFIG.debug });
    }
  }

  function _bootLoanRegister() {
    if (_has('WamLoanRegister') && global.WamLoanRegister &&
        typeof global.WamLoanRegister.install === 'function') {
      _safeInstall('WamLoanRegister', global.WamLoanRegister.install, { debug: CONFIG.debug });
    }
  }

  function _bootPricing() {
    if (_has('WamPricing') && global.WamPricing &&
        typeof global.WamPricing.install === 'function') {
      _safeInstall('WamPricing', global.WamPricing.install, { debug: CONFIG.debug });
    }
  }

  function _bootWallet() {
    if (_has('WamWallet') && global.WamWallet &&
        typeof global.WamWallet.install === 'function') {
      _safeInstall('WamWallet', global.WamWallet.install, { debug: CONFIG.debug });
    }
  }

  function _bootContracts() {
    if (_has('WamContracts') && global.WamContracts &&
        typeof global.WamContracts.install === 'function') {
      _safeInstall('WamContracts', global.WamContracts.install, { debug: CONFIG.debug });
    }
  }

  function _bootPayments() {
    if (_has('WamPayments') && global.WamPayments &&
        typeof global.WamPayments.install === 'function') {
      _safeInstall('WamPayments', global.WamPayments.install, { debug: CONFIG.debug });
    }
  }

  function _bootFinancialReports() {
    if (_has('WamFinancialReports') && global.WamFinancialReports &&
        typeof global.WamFinancialReports.install === 'function') {
      _safeInstall('WamFinancialReports', global.WamFinancialReports.install, { debug: CONFIG.debug });
    }
  }

  function _bootAdvancedReports() {
    if (_has('WamAdvancedReports') && global.WamAdvancedReports &&
        typeof global.WamAdvancedReports.install === 'function') {
      _safeInstall('WamAdvancedReports', global.WamAdvancedReports.install, { debug: CONFIG.debug });
    }
  }

  function _bootFollowUps() {
    if (_has('WamFollowUps') && global.WamFollowUps &&
        typeof global.WamFollowUps.install === 'function') {
      _safeInstall('WamFollowUps', global.WamFollowUps.install, {
        reminders: true,
        reminderMs: 60000,
        debug: CONFIG.debug
      });
    }
  }

  // ─────────────────────────────
  // مدیریت خطاهای سراسری
  // ─────────────────────────────

  function _installGlobalErrorHandlers() {
    global.addEventListener('error', function (e) {
      _emit('app:global-error', {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        error: e.error
      });
      _err('Global error:', e.message, e.filename + ':' + e.lineno);
    });

    global.addEventListener('unhandledrejection', function (e) {
      _emit('app:unhandled-rejection', { reason: e.reason });
      _warn('Unhandled rejection:', e.reason);
    });
  }

  // ─────────────────────────────
  // وضعیت بارگذاری
  // ─────────────────────────────

  function showLoader(text) {
    var loader = _qs('[data-app-loader]');
    if (!loader) {
      loader = document.createElement('div');
      loader.setAttribute('data-app-loader', '');
      loader.className = 'wam-app__loader';
      loader.innerHTML =
        '<div class="wam-app__loader-box">' +
          '<div class="wam-app__loader-spinner"></div>' +
          '<div class="wam-app__loader-text">' +
            (text || 'در حال بارگذاری...') +
          '</div>' +
        '</div>';
      document.body.appendChild(loader);
    }
    loader.style.display = '';
    loader.setAttribute('data-active', '1');
  }

  function hideLoader() {
    var loader = _qs('[data-app-loader]');
    if (loader) {
      loader.style.display = 'none';
      loader.removeAttribute('data-active');
    }
  }

  // ─────────────────────────────
  // ناوبری سراسری
  // ─────────────────────────────

  function navigate(url, opts) {
    opts = opts || {};
    if (!url) return;
    if (opts.replace && global.location && global.location.replace) {
      global.location.replace(url);
    } else {
      redirect(url);
    }
  }

  function goHome() {
    navigate(homeFor(currentRole()));
  }

  // ─────────────────────────────
  // بوت اصلی
  // ─────────────────────────────

  function boot(options) {
    if (_booted) {
      _log('Already booted');
      return api;
    }
    options = options || {};

    // ادغام تنظیمات
    for (var k in options) {
      if (Object.prototype.hasOwnProperty.call(options, k)) {
        CONFIG[k] = options[k];
      }
    }

    _installGlobalErrorHandlers();

    _page = detectPage();
    _log('Detected page:', _page);

    // گارد احراز هویت
    var guard = guardPage(_page);
    if (!guard.ok) {
      _log('Guard blocked:', guard.reason);
      return api;
    }

    // راه‌اندازی ماژول مربوطه
    var bootstrapFn = PAGE_BOOTSTRAP[_page];
    if (typeof bootstrapFn === 'function') {
      _pageModule = bootstrapFn;
      _pageModule();
    } else {
      _log('No bootstrap for page:', _page);
    }

    _booted = true;

    // رویداد آمادگی
    _emit('app:ready', {
      page: _page,
      role: currentRole(),
      version: VERSION
    });

    // فراخوانی callback های آمادگی
    for (var i = 0; i < _readyCallbacks.length; i++) {
      try { _readyCallbacks[i]({ page: _page }); } catch (e) {
        _err('ready cb error', e);
      }
    }

    _log('Boot complete. Version:', VERSION);
    return api;
  }

  function ready(cb) {
    if (typeof cb !== 'function') return api;
    if (_booted) {
      try { cb({ page: _page }); } catch (_) {}
    } else {
      _readyCallbacks.push(cb);
    }
    return api;
  }

  // ─────────────────────────────
  // API عمومی
  // ─────────────────────────────

  var api = {
    VERSION: VERSION,
    CONFIG: CONFIG,

    // چرخه عمر
    boot: boot,
    ready: ready,
    isBooted: function () { return _booted; },
    getPage: function () { return _page; },

    // تشخیص
    detectPage: detectPage,
    isPublicPage: isPublicPage,
    isLoggedIn: isLoggedIn,
    currentRole: currentRole,
    homeFor: homeFor,

    // ناوبری
    navigate: navigate,
    redirect: redirect,
    goHome: goHome,

    // UI
    showLoader: showLoader,
    hideLoader: hideLoader,

    // گارد
    guardPage: guardPage
  };

  // ─────────────────────────────
  // اجرای خودکار
  // ─────────────────────────────

  global.WamApp = api;
  global.WAM_APP_VERSION = VERSION;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  // Auto-boot روی DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      // فقط اگر autoBoot غیرفعال نشده باشد
      if (document.body &&
          document.body.getAttribute('data-app-no-auto') !== '1') {
        try { boot(); } catch (e) { _err('Auto-boot failed:', e); }
      }
    });
  } else {
    if (document.body &&
        document.body.getAttribute('data-app-no-auto') !== '1') {
      try { boot(); } catch (e) { _err('Auto-boot failed:', e); }
    }
  }

})(typeof window !== 'undefined' ? window : this);