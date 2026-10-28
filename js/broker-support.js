// ==========================================
// وام پی — Broker Panel
// فایل: broker-support.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: پشتیبانی کارگزار — تیکت، FAQ، راه‌های ارتباطی
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var TICKETS_KEY  = 'wamPaySupportTickets';
    var BROKERS_KEY  = 'wamPayBrokers';
    var PAGE_SIZE    = 10;

    var TICKET_STATUS = {
        open:        'باز',
        in_progress: 'در حال بررسی',
        answered:    'پاسخ داده‌شده',
        closed:      'بسته‌شده'
    };

    var TICKET_PRIORITY = {
        low:    'کم',
        normal: 'معمولی',
        high:   'بالا',
        urgent: 'فوری'
    };

    var CATEGORIES = [
        'مشکل فنی', 'سوال در مورد وام', 'مشکل کیف پول',
        'مشکل پرونده', 'درخواست جدید', 'انتقاد و پیشنهاد', 'سایر'
    ];

    var FAQ_ITEMS = [
        {
            q: 'چطور می‌توانم پرونده جدید ثبت کنم؟',
            a: 'از منوی «پرونده‌ها» یا دکمه «پرونده جدید» در داشبورد، ویزارد ثبت را باز کنید و مراحل را تکمیل کنید.'
        },
        {
            q: 'پورسانت من چه زمانی واریز می‌شود؟',
            a: 'پس از تکمیل موفق پرونده و پرداخت وام، پورسانت به‌صورت خودکار به کیف پول شما واریز می‌شود.'
        },
        {
            q: 'چگونه از کیف پول برداشت کنم؟',
            a: 'از بخش کیف پول، دکمه «درخواست برداشت» را بزنید. حداقل مبلغ برداشت ۵۰۰٬۰۰۰ ریال است و پس از تأیید ادمین واریز می‌شود.'
        },
        {
            q: 'پرونده‌ای که ثبت کردم در چه وضعیتی است؟',
            a: 'در داشبورد یا بخش پرونده‌ها، وضعیت و مرحله جاری هر پرونده را می‌بینید. با کلیک روی «جزئیات» می‌توانید روند را دنبال کنید.'
        },
        {
            q: 'چگونه اطلاعات پروفایلم را ویرایش کنم؟',
            a: 'از منوی «پروفایل»، دکمه «ویرایش» را بزنید، تغییرات را اعمال و ذخیره کنید.'
        },
        {
            q: 'اگر رمزم را فراموش کردم چه کنم؟',
            a: 'از بخش پروفایل > تغییر رمز عبور می‌توانید رمز را تغییر دهید. اگر دسترسی ندارید با پشتیبانی تماس بگیرید.'
        }
    ];

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        form: null,
        broker: null,
        tickets: [],
        filtered: [],
        page: 1,
        statusFilter: '',
        submitting: false,
        activeTab: 'new',       // 'new' | 'list' | 'faq' | 'contact'
        listeners: []
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var SupportEvents = {
        LOADED:        'broker.support.loaded',
        TICKET_CREATED:'broker.support.ticket_created',
        TICKET_CLOSED: 'broker.support.ticket_closed',
        TAB_CHANGE:    'broker.support.tab_change',
        FILTERED:      'broker.support.filtered',
        FAIL:          'broker.support.fail'
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
    // 🔍 کمکی‌ها
    // ─────────────────────────────────────
    function _escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _formatNumber(n) {
        var s = String(n === null || n === undefined ? 0 : n);
        var fa = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
        return s.replace(/[0-9]/g, function (d) { return fa[+d]; });
    }

    function _relativeTime(ts) {
        if (!ts) return '—';
        var d = Date.now() - ts;
        var s = Math.floor(d / 1000);
        if (s < 60) return 'همین الان';
        var m = Math.floor(s / 60);
        if (m < 60) return _formatNumber(m) + ' دقیقه پیش';
        var h = Math.floor(m / 60);
        if (h < 24) return _formatNumber(h) + ' ساعت پیش';
        var day = Math.floor(h / 24);
        if (day < 30) return _formatNumber(day) + ' روز پیش';
        return _formatNumber(Math.floor(day / 30)) + ' ماه پیش';
    }

    function _jalali(ts) {
        if (!ts) return '—';
        try {
            if (typeof WamPersianDate !== 'undefined') {
                var d = new Date(ts);
                var j = WamPersianDate.dateToJalali(d);
                if (j) return WamPersianDate.format(j.jy, j.jm, j.jd, 'YYYY/MM/DD');
            }
        } catch (e) { /* بی‌صدا */ }
        return new Date(ts).toLocaleDateString('fa-IR');
    }

    function _generateTicketCode() {
        var r = Math.random().toString(36).slice(2, 6).toUpperCase();
        return 'TK-' + r;
    }

    function _generateId() {
        var r = Math.random().toString(36).slice(2, 8);
        return 't_' + Date.now().toString(36) + '_' + r;
    }

    function _currentUserId() {
        if (typeof WamPermissions === 'undefined') return null;
        var me = WamPermissions.getCurrentUser();
        return me ? me.id : null;
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری / ذخیره
    // ─────────────────────────────────────
    function _loadAllTickets() {
        if (typeof Storage === 'undefined') return [];
        var arr = Storage.getJSON(TICKETS_KEY, []);
        return Array.isArray(arr) ? arr : [];
    }

    function _saveAllTickets(tickets) {
        if (typeof Storage === 'undefined') return false;
        return Storage.setJSON(TICKETS_KEY, tickets);
    }

    function _loadBroker() {
        if (typeof Storage === 'undefined') return null;
        var brokers = Storage.getJSON(BROKERS_KEY, []) || [];
        var user = (typeof WamPermissions !== 'undefined')
            ? WamPermissions.getCurrentUser() : null;
        if (!user) return null;

        for (var i = 0; i < brokers.length; i++) {
            var b = brokers[i];
            if (!b) continue;
            if (b.userId && b.userId === user.id) return b;
            if (b.mobile && user.mobile &&
                String(b.mobile).replace(/\D/g, '') ===
                String(user.mobile).replace(/\D/g, '')) return b;
        }
        return null;
    }

    function _loadMyTickets() {
        if (!STATE.broker) return [];
        var all = _loadAllTickets();
        var mine = [];
        for (var i = 0; i < all.length; i++) {
            var t = all[i];
            if (!t) continue;
            if (t.brokerId === STATE.broker.id) mine.push(t);
        }
        mine.sort(function (a, b) {
            return (b.updatedAt || b.createdAt || 0) -
                   (a.updatedAt || a.createdAt || 0);
        });
        return mine;
    }

    // ─────────────────────────────────────
    // 🧾 اعتبارسنجی
    // ─────────────────────────────────────
    function _validateTicket(data) {
        var errors = {};
        if (!data.subject || String(data.subject).trim().length < 3) {
            errors.subject = 'موضوع حداقل ۳ کاراکتر باشد';
        } else if (String(data.subject).trim().length > 120) {
            errors.subject = 'موضوع حداکثر ۱۲۰ کاراکتر';
        }
        if (!data.category) {
            errors.category = 'دسته‌بندی را انتخاب کنید';
        }
        if (!data.message || String(data.message).trim().length < 10) {
            errors.message = 'متن پیام حداقل ۱۰ کاراکتر باشد';
        } else if (String(data.message).trim().length > 2000) {
            errors.message = 'متن پیام حداکثر ۲۰۰۰ کاراکتر';
        }
        return errors;
    }

    // ─────────────────────────────────────
    // 🎯 ایجاد تیکت
    // ─────────────────────────────────────
    function createTicket(data, options) {
        options = options || {};
        var result = { ok: false, reason: null, ticket: null, errors: null };

        if (!STATE.broker) {
            result.reason = 'no_broker';
            return result;
        }

        var errors = _validateTicket(data);
        if (Object.keys(errors).length > 0) {
            result.reason = 'validation';
            result.errors = errors;
            return result;
        }

        var now = Date.now();
        var ticket = {
            id: _generateId(),
            code: _generateTicketCode(),
            brokerId: STATE.broker.id,
            brokerName: STATE.broker.name,
            brokerCode: STATE.broker.brokerCode,
            subject: String(data.subject).trim(),
            category: data.category,
            message: String(data.message).trim(),
            priority: data.priority || 'normal',
            status: 'open',
            createdBy: _currentUserId(),
            createdAt: now,
            updatedAt: now,
            replies: []
        };

        var all = _loadAllTickets();
        all.push(ticket);
        if (!_saveAllTickets(all)) {
            result.reason = 'storage_error';
            return result;
        }

        STATE.tickets = _loadMyTickets();
        STATE.filtered = STATE.tickets.slice();

        result.ok = true;
        result.ticket = ticket;

        _emit(SupportEvents.TICKET_CREATED, {
            ticket: {
                id: ticket.id,
                code: ticket.code,
                subject: ticket.subject,
                category: ticket.category,
                priority: ticket.priority
            },
            at: now
        });

        return result;
    }

    // ─────────────────────────────────────
    // 🔒 بستن تیکت
    // ─────────────────────────────────────
    function closeTicket(id) {
        var all = _loadAllTickets();
        for (var i = 0; i < all.length; i++) {
            var t = all[i];
            if (!t || t.id !== id) continue;
            if (t.brokerId !== STATE.broker.id) return { ok: false, reason: 'forbidden' };
            if (t.status === 'closed') return { ok: false, reason: 'already_closed' };

            t.status = 'closed';
            t.closedAt = Date.now();
            t.updatedAt = Date.now();

            if (!_saveAllTickets(all)) {
                return { ok: false, reason: 'storage_error' };
            }

            STATE.tickets = _loadMyTickets();
            STATE.filtered = STATE.tickets.slice();

            _emit(SupportEvents.TICKET_CLOSED, {
                ticketId: id, code: t.code, at: Date.now()
            });

            return { ok: true, ticket: t };
        }
        return { ok: false, reason: 'not_found' };
    }

    // ─────────────────────────────────────
    // 🔎 فیلتر تیکت‌ها
    // ─────────────────────────────────────
    function _applyFilters() {
        var st = STATE.statusFilter;
        STATE.filtered = STATE.tickets.filter(function (t) {
            if (!t) return false;
            if (st && t.status !== st) return false;
            return true;
        });
        _emit(SupportEvents.FILTERED, {
            count: STATE.filtered.length, status: st
        });
        return STATE.filtered;
    }

    // ─────────────────────────────────────
    // 📊 آمار
    // ─────────────────────────────────────
    function computeStats() {
        var stats = { total: 0, open: 0, inProgress: 0, answered: 0, closed: 0 };
        for (var i = 0; i < STATE.tickets.length; i++) {
            var t = STATE.tickets[i];
            if (!t) continue;
            stats.total++;
            var st = t.status || 'open';
            if (st === 'open') stats.open++;
            else if (st === 'in_progress') stats.inProgress++;
            else if (st === 'answered') stats.answered++;
            else if (st === 'closed') stats.closed++;
        }
        return stats;
    }

    // ─────────────────────────────────────
    // 🎨 رندر تب‌ها
    // ─────────────────────────────────────
    function _renderTabs() {
        var tabs = [
            { id: 'new',     icon: '➕', label: 'تیکت جدید' },
            { id: 'list',    icon: '📋', label: 'تیکت‌های من' },
            { id: 'faq',     icon: '❓', label: 'سوالات متداول' },
            { id: 'contact', icon: '📞', label: 'تماس با ما' }
        ];
        var html = '<div class="wam-support-tabs" role="tablist">';
        for (var i = 0; i < tabs.length; i++) {
            var t = tabs[i];
            html += '<button type="button" role="tab" ' +
                    'class="wam-support-tab' +
                    (STATE.activeTab === t.id ? ' is-active' : '') + '" ' +
                    'data-support-tab="' + t.id + '">' +
                    '<span>' + t.icon + '</span> ' + _escapeHtml(t.label) +
                    '</button>';
        }
        html += '</div>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — تب تیکت جدید
    // ─────────────────────────────────────
    function _renderNewTab() {
        var catOpts = '<option value="">— انتخاب دسته —</option>';
        for (var i = 0; i < CATEGORIES.length; i++) {
            catOpts += '<option value="' + _escapeHtml(CATEGORIES[i]) + '">' +
                       _escapeHtml(CATEGORIES[i]) + '</option>';
        }

        return '' +
            '<section class="wam-support-section">' +
                '<h3>➕ ثبت تیکت جدید</h3>' +
                '<p class="wam-text-muted">' +
                'مشکل یا سوال خود را با جزئیات بنویسید. در اولین فرصت پاسخ داده می‌شود.' +
                '</p>' +
                '<form id="wamSupportTicketForm" class="wam-support-form">' +
                    '<div class="wam-field"><label>موضوع *</label>' +
                        '<input name="subject" placeholder="خلاصه‌ای از مشکل">' +
                        '<div class="wam-field__error" data-error="subject"></div></div>' +

                    '<div class="wam-field"><label>دسته‌بندی *</label>' +
                        '<select name="category">' + catOpts + '</select>' +
                        '<div class="wam-field__error" data-error="category"></div></div>' +

                    '<div class="wam-field"><label>اولویت</label>' +
                        '<select name="priority">' +
                            '<option value="low">کم</option>' +
                            '<option value="normal" selected>معمولی</option>' +
                            '<option value="high">بالا</option>' +
                            '<option value="urgent">فوری</option>' +
                        '</select></div>' +

                    '<div class="wam-field"><label>متن پیام *</label>' +
                        '<textarea name="message" rows="6" ' +
                        'placeholder="توضیحات کامل..."></textarea>' +
                        '<div class="wam-field__error" data-error="message"></div></div>' +

                    '<div class="wam-field__error" data-error="general"></div>' +

                    '<div class="wam-form-actions">' +
                        '<button type="submit" class="wam-btn wam-btn--primary">' +
                            '📤 ارسال تیکت</button>' +
                    '</div>' +
                '</form>' +
            '</section>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — تب لیست
    // ─────────────────────────────────────
    function _renderListTab() {
        var s = computeStats();

        var html = '<section class="wam-support-section">';
        html += '<header class="wam-support-section__head">' +
                '<h3>📋 تیکت‌های من</h3>' +
                '<select data-support-filter="status">' +
                '<option value="">همه (' + _formatNumber(s.total) + ')</option>' +
                '<option value="open">باز (' + _formatNumber(s.open) + ')</option>' +
                '<option value="in_progress">در بررسی (' + _formatNumber(s.inProgress) + ')</option>' +
                '<option value="answered">پاسخ‌داده (' + _formatNumber(s.answered) + ')</option>' +
                '<option value="closed">بسته (' + _formatNumber(s.closed) + ')</option>' +
                '</select></header>';

        if (STATE.filtered.length === 0) {
            html += '<div class="wam-empty">' +
                    (STATE.tickets.length === 0
                        ? 'هنوز تیکتی ثبت نکرده‌اید.'
                        : 'تیکتی با این فیلتر یافت نشد.') +
                    '</div>';
        } else {
            var list = STATE.filtered;
            var start = (STATE.page - 1) * PAGE_SIZE;
            var end = Math.min(start + PAGE_SIZE, list.length);
            var items = list.slice(start, end);

            for (var i = 0; i < items.length; i++) {
                html += _ticketCard(items[i]);
            }

            var totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
            if (totalPages > 1) {
                html += '<div class="wam-pagination">' +
                        '<button data-support-page="' + (STATE.page - 1) + '"' +
                        (STATE.page === 1 ? ' disabled' : '') + '>‹</button>' +
                        '<span>صفحه ' + _formatNumber(STATE.page) +
                        ' از ' + _formatNumber(totalPages) + '</span>' +
                        '<button data-support-page="' + (STATE.page + 1) + '"' +
                        (STATE.page === totalPages ? ' disabled' : '') + '>›</button>' +
                        '</div>';
            }
        }
        html += '</section>';
        return html;
    }

    function _ticketCard(t) {
        var st = t.status || 'open';
        var stLabel = TICKET_STATUS[st] || st;
        var prLabel = TICKET_PRIORITY[t.priority || 'normal'];

        return '<div class="wam-ticket-card" data-ticket-id="' +
               _escapeHtml(t.id) + '">' +
               '<div class="wam-ticket-card__head">' +
                   '<code>' + _escapeHtml(t.code) + '</code>' +
                   '<span class="wam-badge wam-badge--' + _escapeHtml(st) + '">' +
                   _escapeHtml(stLabel) + '</span>' +
               '</div>' +
               '<div class="wam-ticket-card__subject">' +
               _escapeHtml(t.subject) + '</div>' +
               '<div class="wam-ticket-card__meta">' +
                   '<span>🗂️ ' + _escapeHtml(t.category) + '</span>' +
                   '<span>⚡ ' + _escapeHtml(prLabel) + '</span>' +
                   '<span>📅 ' + _escapeHtml(_relativeTime(t.createdAt)) + '</span>' +
                   (t.replies && t.replies.length > 0
                       ? '<span>💬 ' + _formatNumber(t.replies.length) + ' پاسخ</span>'
                       : '') +
               '</div>' +
               '<div class="wam-ticket-card__actions">' +
                   '<button class="wam-btn wam-btn--sm" ' +
                   'data-ticket-action="view" data-ticket-id="' +
                   _escapeHtml(t.id) + '">👁️ مشاهده</button>' +
                   (st !== 'closed'
                       ? '<button class="wam-btn wam-btn--sm wam-btn--ghost" ' +
                         'data-ticket-action="close" data-ticket-id="' +
                         _escapeHtml(t.id) + '">🔒 بستن</button>'
                       : '') +
               '</div></div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — تب FAQ
    // ─────────────────────────────────────
    function _renderFaqTab() {
        var html = '<section class="wam-support-section">' +
                   '<h3>❓ سوالات متداول</h3>';
        for (var i = 0; i < FAQ_ITEMS.length; i++) {
            var item = FAQ_ITEMS[i];
            html += '<details class="wam-faq-item">' +
                    '<summary>' + _escapeHtml(item.q) + '</summary>' +
                    '<div class="wam-faq-item__answer">' +
                    _escapeHtml(item.a) + '</div></details>';
        }
        html += '</section>';
        return html;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — تب تماس
    // ─────────────────────────────────────
    function _renderContactTab() {
        var b = STATE.broker || {};
        return '' +
            '<section class="wam-support-section">' +
                '<h3>📞 راه‌های ارتباطی</h3>' +
                '<div class="wam-contact-grid">' +
                    '<div class="wam-contact-card">' +
                        '<div class="wam-contact-card__icon">📱</div>' +
                        '<div class="wam-contact-card__title">تلفن پشتیبانی</div>' +
                        '<div class="wam-contact-card__value">' +
                        '<a href="tel:+982112345678">۰۲۱-۱۲۳۴۵۶۷۸</a></div>' +
                        '<div class="wam-contact-card__note">شنبه تا پنج‌شنبه ۹ تا ۱۸</div>' +
                    '</div>' +
                    '<div class="wam-contact-card">' +
                        '<div class="wam-contact-card__icon">✉️</div>' +
                        '<div class="wam-contact-card__title">ایمیل</div>' +
                        '<div class="wam-contact-card__value">' +
                        '<a href="mailto:support@wampay.ir">support@wampay.ir</a></div>' +
                        '<div class="wam-contact-card__note">پاسخ حداکثر تا ۲۴ ساعت</div>' +
                    '</div>' +
                    '<div class="wam-contact-card">' +
                        '<div class="wam-contact-card__icon">💬</div>' +
                        '<div class="wam-contact-card__title">گفتگوی آنلاین</div>' +
                        '<div class="wam-contact-card__value">' +
                        '<a href="broker-chat.html">ورود به چت</a></div>' +
                        '<div class="wam-contact-card__note">پاسخ فوری در ساعات کاری</div>' +
                    '</div>' +
                '</div>' +
                (b.brokerCode ?
                    '<div class="wam-contact-note">' +
                    'در تماس‌ها، کد کارگزار خود را ذکر کنید: ' +
                    '<code>' + _escapeHtml(b.brokerCode) + '</code>' +
                    '</div>' : '') +
            '</section>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function _renderCurrentTab() {
        if (STATE.activeTab === 'new')     return _renderNewTab();
        if (STATE.activeTab === 'list')    return _renderListTab();
        if (STATE.activeTab === 'faq')     return _renderFaqTab();
        if (STATE.activeTab === 'contact') return _renderContactTab();
        return '';
    }

    function render() {
        if (!STATE.root) return;

        _applyFilters();

        var html =
            '<div class="wam-broker-support">' +
                _renderTabs() +
                '<div class="wam-support-body">' +
                    _renderCurrentTab() +
                '</div>' +
            '</div>';

        STATE.root.innerHTML = html;
        _bindTabEvents();
        _bindCurrentForm();
        _bindFilters();
        _bindTicketActions();
    }

    // ─────────────────────────────────────
    // 🖱️ بایند
    // ─────────────────────────────────────
    function _bindTabEvents() {
        if (!STATE.root) return;
        var tabs = STATE.root.querySelectorAll('[data-support-tab]');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].addEventListener('click', _handleTabClick);
        }
    }

    function _handleTabClick(e) {
        e.preventDefault();
        var tab = this.getAttribute('data-support-tab');
        if (!tab || tab === STATE.activeTab) return;
        STATE.activeTab = tab;
        render();
        _emit(SupportEvents.TAB_CHANGE, { tab: tab, at: Date.now() });
    }

    function _bindCurrentForm() {
        if (!STATE.root) return;
        var form = STATE.root.querySelector('#wamSupportTicketForm');
        if (form) {
            STATE.form = form;
            form.addEventListener('submit', _handleSubmit);
            var inputs = form.querySelectorAll('input, select, textarea');
            for (var i = 0; i < inputs.length; i++) {
                inputs[i].addEventListener('input', function () {
                    var name = this.getAttribute('name');
                    if (name) _setFieldError(name, '');
                });
            }
        }
    }

    function _handleSubmit(e) {
        e.preventDefault();
        if (STATE.submitting) return;
        if (!STATE.form) return;

        _clearErrors();

        var form = STATE.form;
        var data = {
            subject: form.querySelector('[name="subject"]').value.trim(),
            category: form.querySelector('[name="category"]').value,
            message: form.querySelector('[name="message"]').value.trim(),
            priority: form.querySelector('[name="priority"]').value
        };

        STATE.submitting = true;
        _setBusy(true);

        setTimeout(function () {
            var res = createTicket(data);

            STATE.submitting = false;
            _setBusy(false);

            if (!res.ok) {
                _showErrors(res.errors || { general: 'خطا: ' + res.reason });
                _emit(SupportEvents.FAIL, { reason: res.reason });
                return;
            }

            if (typeof WamUI !== 'undefined') {
                WamUI.toastSuccess(
                    'تیکت با کد ' + res.ticket.code + ' ثبت شد',
                    'موفق'
                );
            }

            // پاک کردن فرم و رفتن به لیست
            if (form) try { form.reset(); } catch (err) { /* بی‌صدا */ }
            STATE.activeTab = 'list';
            render();
        }, 350);
    }

    function _bindFilters() {
        if (!STATE.root) return;
        var sel = STATE.root.querySelector('[data-support-filter="status"]');
        if (sel) {
            sel.value = STATE.statusFilter;
            sel.addEventListener('change', function () {
                STATE.statusFilter = this.value;
                STATE.page = 1;
                _applyFilters();
                render();
            });
        }

        var pageBtns = STATE.root.querySelectorAll('[data-support-page]');
        for (var i = 0; i < pageBtns.length; i++) {
            pageBtns[i].addEventListener('click', function () {
                var p = parseInt(this.getAttribute('data-support-page'), 10);
                if (isNaN(p) || p < 1) return;
                STATE.page = p;
                render();
            });
        }
    }

    function _bindTicketActions() {
        if (!STATE.root) return;
        var btns = STATE.root.querySelectorAll('[data-ticket-action]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', _handleTicketAction);
        }
    }

    function _handleTicketAction(e) {
        e.preventDefault();
        var action = this.getAttribute('data-ticket-action');
        var id = this.getAttribute('data-ticket-id');
        if (!id) return;

        if (action === 'view') {
            openTicketDetail(id);
        } else if (action === 'close') {
            _confirmClose(id);
        }
    }

    function _confirmClose(id) {
        var t = _findById(id);
        if (!t) return;
        var msg = 'تیکت «' + t.code + '» بسته شود؟';
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('بستن تیکت', msg, { danger: true }).then(function (ok) {
                if (ok) {
                    var res = closeTicket(id);
                    if (res.ok) {
                        if (typeof WamUI !== 'undefined') {
                            WamUI.toastSuccess('تیکت بسته شد', 'موفق');
                        }
                        render();
                    }
                }
            });
        } else if (window.confirm(msg)) {
            closeTicket(id);
            render();
        }
    }

    function _findById(id) {
        for (var i = 0; i < STATE.tickets.length; i++) {
            if (STATE.tickets[i] && STATE.tickets[i].id === id) return STATE.tickets[i];
        }
        return null;
    }

    // ─────────────────────────────────────
    // 👁️ نمایش جزئیات
    // ─────────────────────────────────────
    function openTicketDetail(id) {
        var t = _findById(id);
        if (!t) return;

        var existing = document.getElementById('wamTicketDetailModal');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var repliesHtml = '';
        if (Array.isArray(t.replies) && t.replies.length > 0) {
            repliesHtml = '<ul class="wam-ticket-replies">';
            for (var i = 0; i < t.replies.length; i++) {
                var r = t.replies[i];
                repliesHtml += '<li class="wam-ticket-reply">' +
                    '<div class="wam-ticket-reply__body">' +
                    _escapeHtml(r.text) + '</div>' +
                    '<div class="wam-ticket-reply__meta">' +
                    _escapeHtml(r.byName || 'پشتیبانی') + ' — ' +
                    _escapeHtml(_relativeTime(r.at)) + '</div></li>';
            }
            repliesHtml += '</ul>';
        } else {
            repliesHtml = '<div class="wam-empty wam-empty--sm">' +
                          'هنوز پاسخی داده نشده.</div>';
        }

        var st = t.status || 'open';
        var modal = document.createElement('div');
        modal.id = 'wamTicketDetailModal';
        modal.className = 'wam-modal';
        modal.innerHTML =
            '<div class="wam-modal__overlay" data-close></div>' +
            '<div class="wam-modal__panel wam-modal__panel--wide">' +
                '<header class="wam-modal__head">' +
                    '<div>' +
                        '<code>' + _escapeHtml(t.code) + '</code> ' +
                        '<span class="wam-badge wam-badge--' + _escapeHtml(st) + '">' +
                        _escapeHtml(TICKET_STATUS[st] || st) + '</span>' +
                    '</div>' +
                    '<button class="wam-modal__close" data-close>×</button>' +
                '</header>' +
                '<div class="wam-modal__body">' +
                    '<h3>' + _escapeHtml(t.subject) + '</h3>' +
                    '<div class="wam-ticket-detail-meta">' +
                        '<span>🗂️ ' + _escapeHtml(t.category) + '</span>' +
                        '<span>⚡ ' +
                        _escapeHtml(TICKET_PRIORITY[t.priority] || t.priority) + '</span>' +
                        '<span>📅 ' + _escapeHtml(_jalali(t.createdAt)) + '</span>' +
                    '</div>' +
                    '<div class="wam-ticket-detail-message">' +
                    _escapeHtml(t.message) + '</div>' +
                    '<h4>💬 پاسخ‌ها</h4>' +
                    repliesHtml +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);

        var cbs = modal.querySelectorAll('[data-close]');
        for (var k = 0; k < cbs.length; k++) {
            cbs[k].addEventListener('click', function () {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            });
        }
    }

    // ─────────────────────────────────────
    // 🎨 خطاها
    // ─────────────────────────────────────
    function _setFieldError(field, message) {
        if (!STATE.form) return;
        var el = STATE.form.querySelector('[data-error="' + field + '"]');
        if (el) {
            el.textContent = message || '';
            el.style.display = message ? 'block' : 'none';
        }
        var input = STATE.form.querySelector('[name="' + field + '"]');
        if (input) {
            if (message) input.classList.add('wam-input--error');
            else input.classList.remove('wam-input--error');
        }
    }

    function _clearErrors() {
        if (!STATE.form) return;
        var errs = STATE.form.querySelectorAll('[data-error]');
        for (var i = 0; i < errs.length; i++) {
            errs[i].textContent = '';
            errs[i].style.display = 'none';
        }
        var inputs = STATE.form.querySelectorAll('.wam-input--error');
        for (var j = 0; j < inputs.length; j++) {
            inputs[j].classList.remove('wam-input--error');
        }
    }

    function _showErrors(errors) {
        _clearErrors();
        if (!errors) return;
        for (var k in errors) {
            if (Object.prototype.hasOwnProperty.call(errors, k)) {
                _setFieldError(k, errors[k]);
            }
        }
    }

    function _setBusy(busy) {
        if (!STATE.form) return;
        var btn = STATE.form.querySelector('[type="submit"]');
        if (!btn) return;
        if (busy) {
            btn.disabled = true;
            btn.setAttribute('data-original-text', btn.textContent);
            btn.textContent = 'در حال ارسال...';
        } else {
            btn.disabled = false;
            var orig = btn.getAttribute('data-original-text');
            if (orig) btn.textContent = orig;
        }
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var user = (typeof WamPermissions !== 'undefined')
            ? WamPermissions.getCurrentUser() : null;
        if (!user) {
            if (typeof WamPayGuard !== 'undefined') {
                WamPayGuard.redirectToLogin('not_logged_in');
            }
            return;
        }
        if (user.role !== 'broker' && user.role !== 'admin' &&
            user.role !== 'super_admin') {
            if (typeof WamPayGuard !== 'undefined') {
                WamPayGuard.redirectToRoleHome(user.role);
            }
            return;
        }

        var run = function () {
            var root = options.root ||
                       document.querySelector('[data-support-root]') ||
                       document.querySelector('.wam-broker-support-page');
            if (!root) {
                if (options.debug) console.warn('[broker-support] root پیدا نشد');
                return;
            }
            STATE.root = root;
            STATE.broker = _loadBroker();

            if (!STATE.broker) {
                STATE.root.innerHTML =
                    '<div class="wam-empty">اطلاعات کارگزار یافت نشد.</div>';
                return;
            }

            STATE.tickets = _loadMyTickets();
            STATE.filtered = STATE.tickets.slice();

            render();
            STATE.installed = true;

            _emit(SupportEvents.LOADED, {
                broker: STATE.broker.id,
                ticketsCount: STATE.tickets.length,
                at: Date.now()
            });

            if (options.debug) {
                console.log('[broker-support] آماده، ' +
                    STATE.tickets.length + ' تیکت');
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run);
        } else {
            run();
        }
    }

    function uninstall() {
        STATE.root = null;
        STATE.form = null;
        STATE.installed = false;
    }

    function reload() {
        STATE.tickets = _loadMyTickets();
        STATE.filtered = STATE.tickets.slice();
        render();
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            brokerId: STATE.broker ? STATE.broker.id : null,
            activeTab: STATE.activeTab,
            ticketsCount: STATE.tickets.length,
            filteredCount: STATE.filtered.length,
            submitting: STATE.submitting,
            page: STATE.page,
            statusFilter: STATE.statusFilter
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
    var WamBrokerSupport = {
        EVENTS: SupportEvents,
        TICKET_STATUS: TICKET_STATUS,
        TICKET_PRIORITY: TICKET_PRIORITY,
        CATEGORIES: CATEGORIES,
        FAQ_ITEMS: FAQ_ITEMS,
        PAGE_SIZE: PAGE_SIZE,

        install: install,
        uninstall: uninstall,
        reload: reload,
        render: render,

        createTicket: createTicket,
        closeTicket: closeTicket,
        openTicketDetail: openTicketDetail,

        setTab: function (tab) {
            if (['new', 'list', 'faq', 'contact'].indexOf(tab) === -1) return false;
            STATE.activeTab = tab;
            render();
            return true;
        },
        getActiveTab: function () { return STATE.activeTab; },

        computeStats: computeStats,
        getMyTickets: function () { return STATE.tickets.slice(); },
        getFiltered: function () { return STATE.filtered.slice(); },

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamBrokerSupport = WamBrokerSupport;
    window.SupportEvents = SupportEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var body = document.body;
            if (!body) return;
            if (body.hasAttribute('data-broker-support-page') ||
                document.querySelector('[data-support-root]') ||
                document.querySelector('.wam-broker-support-page')) {
                install();
            }
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _auto);
        } else {
            _auto();
        }
    }

})();