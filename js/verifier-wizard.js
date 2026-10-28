// ==========================================
// وام پی — Verifier Panel
// فایل: verifier-wizard.js
// نسخه: 1.0.0
// تاریخ: 1405/01/15
// کارش: ویزارد بررسی پرونده توسط اعتبارسنج
//        (چک‌لیست + یادداشت + تصمیم نهایی)
// ==========================================

(function () {
    'use strict';

    // ─────────────────────────────────────
    // 🔑 ثابت‌ها
    // ─────────────────────────────────────
    var ROOT_ATTR    = 'data-verifier-wizard';
    var CASE_ATTR    = 'data-case-id';
    var DECISIONS    = {
        APPROVE: 'approve',
        REJECT:  'reject',
        REVISE:  'revise'
    };

    var DECISION_LABELS = {
        approve: 'تأیید پرونده',
        reject:  'رد پرونده',
        revise:  'درخواست اصلاح'
    };

    var NOTE_CATEGORIES = {
        general: 'یادداشت',
        review:  'بررسی',
        warning: 'هشدار',
        reject:  'رد'
    };

    var MIN_REJECT_NOTE = 10;

    // ─────────────────────────────────────
    // 🧠 وضعیت داخلی
    // ─────────────────────────────────────
    var STATE = {
        installed: false,
        root: null,
        caseId: null,
        caseData: null,
        checklist: [],
        currentIndex: 0,
        totalSteps: 0,
        decision: null,
        decisionNote: '',
        submitting: false,
        listeners: [],
        _autoSaveTimer: null
    };

    // ─────────────────────────────────────
    // 📡 رویدادها
    // ─────────────────────────────────────
    var VWizEvents = {
        START:        'vwiz.start',
        STEP_CHANGE:  'vwiz.step',
        CHECK_TOGGLED:'vwiz.check_toggled',
        NOTE_ADDED:   'vwiz.note_added',
        DECISION_SET: 'vwiz.decision_set',
        DRAFT_SAVED:  'vwiz.draft_saved',
        SUBMIT:       'vwiz.submit',
        SUCCESS:      'vwiz.success',
        FAIL:         'vwiz.fail',
        CANCEL:       'vwiz.cancel'
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
    function _esc(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _fa(n) {
        var s = String(n === null || n === undefined ? 0 : n);
        return s.replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _amt(n) {
        if (n === null || n === undefined || n === '') return '—';
        var x = Number(n);
        if (isNaN(x)) return '—';
        return x.toLocaleString('en-US').replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }

    function _relTime(ts) {
        if (!ts) return '—';
        var d = Date.now() - ts;
        var s = Math.floor(d / 1000);
        if (s < 60) return 'همین الان';
        var m = Math.floor(s / 60);
        if (m < 60) return _fa(m) + ' دقیقه پیش';
        var h = Math.floor(m / 60);
        if (h < 24) return _fa(h) + ' ساعت پیش';
        var day = Math.floor(h / 24);
        if (day < 30) return _fa(day) + ' روز پیش';
        return _fa(Math.floor(day / 30)) + ' ماه پیش';
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

    function _uid() {
        if (typeof WamPermissions === 'undefined') return null;
        var me = WamPermissions.getCurrentUser();
        return me ? me.id : null;
    }

    function _nameOfCurrentUser() {
        if (typeof WamPermissions === 'undefined') return null;
        var me = WamPermissions.getCurrentUser();
        return me ? (me.name || me.username) : null;
    }

    // ─────────────────────────────────────
    // 📥 بارگذاری پرونده
    // ─────────────────────────────────────
    function _loadCase(caseId) {
        if (!caseId) return null;
        if (typeof CaseRepository === 'undefined') return null;
        try { return CaseRepository.get(caseId); }
        catch (e) { return null; }
    }

    function _ensureChecklist(caseId) {
        if (typeof WamVerifierStorage === 'undefined') return [];
        if (!WamVerifierStorage.getChecklist) return [];

        // اطمینان از وجود چک‌لیست
        var list = WamVerifierStorage.getChecklist(caseId);
        return Array.isArray(list) ? list : [];
    }

    function _loadDraft() {
        if (typeof WamVerifierStorage === 'undefined') return null;
        if (!WamVerifierStorage.getDraft) return null;
        return WamVerifierStorage.getDraft(STATE.caseId);
    }

    function _saveDraft() {
        if (typeof WamVerifierStorage === 'undefined') return;
        if (!WamVerifierStorage.saveDraft) return;

        var draftData = {
            currentIndex: STATE.currentIndex,
            decision: STATE.decision,
            decisionNote: STATE.decisionNote
        };
        WamVerifierStorage.saveDraft(STATE.caseId,
            JSON.stringify(draftData));
        _emit(VWizEvents.DRAFT_SAVED, { caseId: STATE.caseId });
    }

    function _scheduleAutoSave() {
        if (STATE._autoSaveTimer) clearTimeout(STATE._autoSaveTimer);
        STATE._autoSaveTimer = setTimeout(function () {
            _saveDraft();
        }, 900);
    }

    // ─────────────────────────────────────
    // 📊 پیشرفت
    // ─────────────────────────────────────
    function computeProgress() {
        var list = STATE.checklist || [];
        var done = 0;
        var requiredDone = 0;
        var requiredTotal = 0;
        for (var i = 0; i < list.length; i++) {
            if (list[i].done) done++;
            if (list[i].required) {
                requiredTotal++;
                if (list[i].done) requiredDone++;
            }
        }
        return {
            done: done,
            total: list.length,
            percent: list.length > 0 ? Math.round((done / list.length) * 100) : 0,
            requiredDone: requiredDone,
            requiredTotal: requiredTotal,
            isComplete: requiredDone === requiredTotal && requiredTotal > 0
        };
    }

    function canSubmit() {
        var p = computeProgress();
        if (!p.isComplete) return false;
        if (!STATE.decision) return false;
        if (STATE.decision === DECISIONS.REJECT &&
            (!STATE.decisionNote || STATE.decisionNote.trim().length < MIN_REJECT_NOTE)) {
            return false;
        }
        if (STATE.decision === DECISIONS.REVISE &&
            (!STATE.decisionNote || STATE.decisionNote.trim().length < MIN_REJECT_NOTE)) {
            return false;
        }
        return true;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — هدر
    // ─────────────────────────────────────
    function _renderHeader() {
        var c = STATE.caseData || {};
        var p = computeProgress();

        return '<header class="wam-vwiz__header">' +
            '<div class="wam-vwiz__head-left">' +
                '<button class="wam-btn-icon" data-vwiz-action="close" ' +
                'title="بازگشت">‹</button>' +
                '<div>' +
                    '<div class="wam-vwiz__title">🔍 بررسی پرونده</div>' +
                    '<div class="wam-vwiz__subtitle">' +
                        '<code>' + _esc(c.caseId || '—') + '</code>' +
                        ' · ' + _esc(c.applicantName || '—') +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="wam-vwiz__head-right">' +
                '<button class="wam-btn-icon" data-vwiz-action="save-draft" ' +
                'title="ذخیره پیش‌نویس">💾</button>' +
                '<span class="wam-vwiz__progress-badge">' +
                    _fa(p.done) + '/' + _fa(p.total) +
                '</span>' +
            '</div>' +
        '</header>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — خلاصه پرونده
    // ─────────────────────────────────────
    function _renderCaseSummary() {
        var c = STATE.caseData || {};
        return '<section class="wam-vwiz__summary">' +
            '<div class="wam-vwiz__summary-row">' +
                '<span>متقاضی:</span> <strong>' + _esc(c.applicantName || '—') + '</strong>' +
            '</div>' +
            '<div class="wam-vwiz__summary-row">' +
                '<span>موبایل:</span> ' + _esc(c.applicantMobile || '—') +
            '</div>' +
            '<div class="wam-vwiz__summary-row">' +
                '<span>بانک:</span> ' + _esc(c.bank || '—') +
            '</div>' +
            '<div class="wam-vwiz__summary-row">' +
                '<span>مبلغ:</span> ' + _amt(c.loanAmount) + ' ریال' +
            '</div>' +
            '<div class="wam-vwiz__summary-row">' +
                '<span>هدف:</span> ' + _esc(c.purpose || '—') +
            '</div>' +
            '<div class="wam-vwiz__summary-row">' +
                '<span>تاریخ ثبت:</span> ' + _esc(_jalali(c.createdAt)) +
            '</div>' +
        '</section>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — نوار پیشرفت
    // ─────────────────────────────────────
    function _renderProgressBar() {
        var p = computeProgress();
        return '<div class="wam-vwiz__progress">' +
            '<div class="wam-vwiz__progress-fill" style="width:' +
            p.percent + '%"></div></div>' +
            '<div class="wam-vwiz__progress-label">' +
            _fa(p.done) + ' از ' + _fa(p.total) + ' مورد بررسی شد ' +
            '(' + _fa(p.percent) + '٪)' +
            '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — مرحله (check item)
    // ─────────────────────────────────────
    function _renderStep() {
        var list = STATE.checklist || [];
        if (list.length === 0) {
            return '<div class="wam-empty">چک‌لیستی وجود ندارد.</div>';
        }
        var idx = STATE.currentIndex;
        var item = list[idx];
        if (!item) return '<div class="wam-empty">مرحله نامعتبر.</div>';

        var notes = _getNotesForCurrentStep(item.id);

        var html = '<section class="wam-vwiz__step" data-step-id="' +
            _esc(item.id) + '">';

        html += '<div class="wam-vwiz__step-head">';
        html += '<div class="wam-vwiz__step-num">' +
                _fa(idx + 1) + '/' + _fa(list.length) + '</div>';
        html += '<h3 class="wam-vwiz__step-title">' +
                _esc(item.label) +
                (item.required ? ' <span class="wam-required">*</span>' : '') +
                '</h3>';
        html += '</div>';

        html += '<label class="wam-vwiz__check">' +
            '<input type="checkbox" data-vwiz="check" ' +
            (item.done ? 'checked' : '') + '>' +
            '<span>' + _esc(item.label) + '</span>' +
        '</label>';

        if (item.done && item.doneAt) {
            html += '<div class="wam-vwiz__check-meta">' +
                '✓ بررسی‌شده در ' + _esc(_relTime(item.doneAt)) +
                '</div>';
        }

        // یادداشت مرحله
        html += '<div class="wam-vwiz__notes">';
        html += '<div class="wam-vwiz__notes-head">' +
                '<span>📝 یادداشت‌ها</span>' +
                '</div>';

        if (notes.length > 0) {
            html += '<ul class="wam-vwiz__notes-list">';
            for (var i = 0; i < notes.length; i++) {
                var n = notes[i];
                html += '<li class="wam-vwiz__note wam-vwiz__note--' +
                        _esc(n.category || 'general') + '">' +
                    '<div class="wam-vwiz__note-text">' +
                    _esc(n.text) + '</div>' +
                    '<div class="wam-vwiz__note-meta">' +
                    _esc(n.authorName || '') + ' · ' +
                    _esc(_relTime(n.createdAt)) + ' ' +
                    '<button class="wam-btn-icon wam-btn-icon--danger" ' +
                    'data-vwiz-action="delete-note" data-note-id="' +
                    _esc(n.id) + '" title="حذف">🗑️</button>' +
                    '</div></li>';
            }
            html += '</ul>';
        } else {
            html += '<div class="wam-vwiz__notes-empty">یادداشتی ثبت نشده.</div>';
        }

        html += '<form class="wam-vwiz__note-form" data-vwiz="note-form">' +
            '<textarea name="noteText" rows="2" ' +
            'placeholder="یادداشت خود را بنویسید..."></textarea>' +
            '<div class="wam-vwiz__note-form-row">' +
                '<select name="noteCategory">' +
                    '<option value="general">یادداشت</option>' +
                    '<option value="review">بررسی</option>' +
                    '<option value="warning">هشدار</option>' +
                '</select>' +
                '<button type="submit" class="wam-btn wam-btn--sm wam-btn--primary">' +
                'افزودن</button>' +
            '</div>' +
        '</form>';

        html += '</div>';

        html += '</section>';
        return html;
    }

    function _getNotesForCurrentStep(stepId) {
        if (typeof WamVerifierStorage === 'undefined') return [];
        if (!WamVerifierStorage.getNotes) return [];
        var all = WamVerifierStorage.getNotes(STATE.caseId);
        // فیلتر بر اساس stepId در category یا بر اساس متن
        // در این نسخه ساده، همه یادداشت‌ها را نشان می‌دهیم
        return all;
    }

    // ─────────────────────────────────────
    // 🎨 رندر — ناوبری مرحله
    // ─────────────────────────────────────
    function _renderStepNav() {
        var list = STATE.checklist || [];
        var first = STATE.currentIndex === 0;
        var last = STATE.currentIndex >= list.length - 1;

        return '<div class="wam-vwiz__nav">' +
            '<button type="button" class="wam-btn wam-btn--ghost" ' +
            'data-vwiz-action="prev"' + (first ? ' disabled' : '') + '>' +
            '‹ قبلی</button>' +
            '<span class="wam-vwiz__nav-label">مرحله ' +
            _fa(STATE.currentIndex + 1) + ' از ' + _fa(list.length) +
            '</span>' +
            (last
                ? '<button type="button" class="wam-btn wam-btn--primary" ' +
                  'data-vwiz-action="to-decision">تصمیم نهایی ›</button>'
                : '<button type="button" class="wam-btn wam-btn--primary" ' +
                  'data-vwiz-action="next">بعدی ›</button>') +
        '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر — تصمیم نهایی
    // ─────────────────────────────────────
    function _renderDecision() {
        var p = computeProgress();
        var html = '<section class="wam-vwiz__decision">';
        html += '<h3>✅ تصمیم نهایی</h3>';

        // خلاصه چک‌لیست
        html += '<div class="wam-vwiz__decision-summary">';
        html += '<div class="wam-vwiz__decision-row">' +
                '<span>موارد بررسی‌شده:</span>' +
                '<strong>' + _fa(p.done) + ' از ' + _fa(p.total) + '</strong>' +
                '</div>';
        html += '<div class="wam-vwiz__decision-row">' +
                '<span>الزامی‌های تکمیل:</span>' +
                '<strong class="' + (p.isComplete ? 'wam-success' : 'wam-danger') + '">' +
                _fa(p.requiredDone) + ' از ' + _fa(p.requiredTotal) + '</strong>' +
                '</div>';
        html += '</div>';

        if (!p.isComplete) {
            html += '<div class="wam-vwiz__decision-warning">' +
                '⚠️ برای تصمیم‌گیری، ابتدا همه موارد الزامی چک‌لیست را تکمیل کنید.' +
                '</div>';
        }

        // انتخاب تصمیم
        html += '<div class="wam-vwiz__decision-options">';

        html += _renderDecisionOption('approve', '✅', 'تأیید پرونده',
            'پرونده از نظر شما معتبر است', 'success');
        html += _renderDecisionOption('reject', '❌', 'رد پرونده',
            'پرونده شرایط لازم را ندارد', 'danger');
        html += _renderDecisionOption('revise', '🔄', 'درخواست اصلاح',
            'نیاز به اصلاح اطلاعات یا مدارک', 'warning');

        html += '</div>';

        // یادداشت تصمیم
        var noteRequired = (STATE.decision === 'reject' || STATE.decision === 'revise');
        html += '<div class="wam-vwiz__decision-note">';
        html += '<label>' + (noteRequired ? 'دلیل (الزامی) *' : 'یادداشت (اختیاری)') + '</label>';
        html += '<textarea name="decisionNote" rows="4" ' +
                'placeholder="' +
                (noteRequired ? 'دلیل را با جزئیات بنویسید...' : 'توضیح اختیاری...') +
                '">' + _esc(STATE.decisionNote) + '</textarea>';
        if (noteRequired && STATE.decisionNote.trim().length < MIN_REJECT_NOTE) {
            html += '<div class="wam-vwiz__error">حداقل ' +
                    _fa(MIN_REJECT_NOTE) + ' کاراکتر وارد کنید</div>';
        }
        html += '</div>';

        // دکمه ارسال
        var canGo = canSubmit();
        html += '<div class="wam-vwiz__decision-actions">';
        html += '<button type="button" class="wam-btn wam-btn--ghost" ' +
                'data-vwiz-action="back-to-checklist">‹ بازگشت به چک‌لیست</button>';
        html += '<button type="button" class="wam-btn wam-btn--primary" ' +
                'data-vwiz-action="submit"' +
                (canGo ? '' : ' disabled') + '>' +
                'ثبت تصمیم</button>';
        html += '</div>';

        html += '</section>';
        return html;
    }

    function _renderDecisionOption(id, icon, title, desc, accent) {
        var selected = STATE.decision === id;
        return '<div class="wam-vwiz__decision-option wam-vwiz__decision-option--' +
            accent + (selected ? ' is-selected' : '') + '" ' +
            'data-vwiz="decision" data-decision="' + id + '">' +
            '<div class="wam-vwiz__decision-option-icon">' + icon + '</div>' +
            '<div class="wam-vwiz__decision-option-body">' +
                '<div class="wam-vwiz__decision-option-title">' + title + '</div>' +
                '<div class="wam-vwiz__decision-option-desc">' + desc + '</div>' +
            '</div>' +
            (selected ? '<div class="wam-vwiz__decision-option-check">✓</div>' : '') +
        '</div>';
    }

    // ─────────────────────────────────────
    // 🎨 رندر کلی
    // ─────────────────────────────────────
    function render() {
        if (!STATE.root) return;

        if (!STATE.caseData) {
            STATE.root.innerHTML = '<div class="wam-empty">' +
                'پرونده یافت نشد.</div>';
            return;
        }

        var isDecision = (STATE.currentIndex === -1);
        var bodyHtml = isDecision ? _renderDecision() : _renderStep();

        var html =
            '<div class="wam-vwiz">' +
                _renderHeader() +
                _renderCaseSummary() +
                _renderProgressBar() +
                '<div class="wam-vwiz__body">' +
                    bodyHtml +
                '</div>' +
                (isDecision ? '' : _renderStepNav()) +
            '</div>';

        STATE.root.innerHTML = html;
        _bindEvents();
    }

    // ─────────────────────────────────────
    // 🖱️ بایند رویدادها
    // ─────────────────────────────────────
    function _bindEvents() {
        if (!STATE.root) return;

        // اکشن‌های اصلی
        var btns = STATE.root.querySelectorAll('[data-vwiz-action]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', _handleAction);
        }

        // چک‌باکس مرحله
        var checkBox = STATE.root.querySelector('[data-vwiz="check"]');
        if (checkBox) {
            checkBox.addEventListener('change', _handleCheckToggle);
        }

        // فرم یادداشت
        var noteForm = STATE.root.querySelector('[data-vwiz="note-form"]');
        if (noteForm) {
            noteForm.addEventListener('submit', _handleNoteSubmit);
        }

        // انتخاب تصمیم
        var decisions = STATE.root.querySelectorAll('[data-vwiz="decision"]');
        for (var j = 0; j < decisions.length; j++) {
            decisions[j].addEventListener('click', _handleDecisionSelect);
        }

        // textarea یادداشت تصمیم
        var noteEl = STATE.root.querySelector('[name="decisionNote"]');
        if (noteEl) {
            noteEl.addEventListener('input', function () {
                STATE.decisionNote = this.value;
                _scheduleAutoSave();
                _refreshSubmitState();
            });
        }
    }

    function _handleAction(e) {
        e.preventDefault();
        var a = this.getAttribute('data-vwiz-action');

        if (a === 'close') {
            if (confirmExit()) {
                _emit(VWizEvents.CANCEL, { at: Date.now() });
                _goBack();
            }
            return;
        }
        if (a === 'save-draft') {
            _saveDraft();
            if (typeof WamUI !== 'undefined') {
                WamUI.toastSuccess('پیش‌نویس ذخیره شد', 'موفق');
            }
            return;
        }
        if (a === 'prev') { goPrev(); return; }
        if (a === 'next') { goNext(); return; }
        if (a === 'to-decision') { goToDecision(); return; }
        if (a === 'back-to-checklist') { backToChecklist(); return; }
        if (a === 'submit') { submit(); return; }
        if (a === 'delete-note') {
            var noteId = this.getAttribute('data-note-id');
            _deleteNote(noteId);
            return;
        }
    }

    function _handleCheckToggle() {
        var list = STATE.checklist || [];
        var item = list[STATE.currentIndex];
        if (!item) return;

        var done = this.checked;

        if (typeof WamVerifierStorage !== 'undefined' &&
            WamVerifierStorage.toggleCheck) {
            WamVerifierStorage.toggleCheck(STATE.caseId, item.id, done);
        }

        item.done = done;
        item.doneAt = done ? Date.now() : null;
        item.doneBy = done ? _uid() : null;

        _emit(VWizEvents.CHECK_TOGGLED, {
            caseId: STATE.caseId,
            checkId: item.id,
            done: done
        });

        // رندر مجدد (فقط برای به‌روزرسانی progress)
        render();
    }

    function _handleNoteSubmit(e) {
        e.preventDefault();
        var form = e.target;
        var textEl = form.querySelector('[name="noteText"]');
        var catEl = form.querySelector('[name="noteCategory"]');
        if (!textEl) return;

        var text = textEl.value.trim();
        if (text.length === 0) return;

        if (typeof WamVerifierStorage === 'undefined' ||
            !WamVerifierStorage.addNote) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('ماژول ذخیره‌سازی یافت نشد', 'خطا');
            }
            return;
        }

        var res = WamVerifierStorage.addNote(STATE.caseId, text, {
            category: catEl ? catEl.value : 'general',
            authorName: _nameOfCurrentUser()
        });

        if (!res.ok) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('خطا در ثبت یادداشت', 'خطا');
            }
            return;
        }

        _emit(VWizEvents.NOTE_ADDED, {
            caseId: STATE.caseId, note: res.note
        });

        if (typeof WamUI !== 'undefined') {
            WamUI.toastSuccess('یادداشت ثبت شد', 'موفق');
        }

        render();
    }

    function _deleteNote(noteId) {
        if (!noteId) return;
        if (typeof WamVerifierStorage === 'undefined' ||
            !WamVerifierStorage.removeNote) return;

        var doIt = function () {
            var res = WamVerifierStorage.removeNote(STATE.caseId, noteId);
            if (res.ok) {
                if (typeof WamUI !== 'undefined') {
                    WamUI.toastInfo('یادداشت حذف شد', 'موفق');
                }
                render();
            }
        };

        var msg = 'این یادداشت حذف شود؟';
        if (typeof WamUI !== 'undefined' && WamUI.confirm) {
            WamUI.confirm('حذف یادداشت', msg, { danger: true })
                .then(function (ok) { if (ok) doIt(); });
        } else if (window.confirm(msg)) {
            doIt();
        }
    }

    function _handleDecisionSelect(e) {
        e.preventDefault();
        var d = this.getAttribute('data-decision');
        if (!d) return;
        STATE.decision = d;
        _scheduleAutoSave();
        _emit(VWizEvents.DECISION_SET, {
            caseId: STATE.caseId, decision: d
        });
        render();
    }

    // ─────────────────────────────────────
    // 🎯 ناوبری
    // ─────────────────────────────────────
    function goNext() {
        var list = STATE.checklist || [];
        if (STATE.currentIndex >= list.length - 1) {
            goToDecision();
            return;
        }
        STATE.currentIndex++;
        _scheduleAutoSave();
        render();
        _emit(VWizEvents.STEP_CHANGE, { index: STATE.currentIndex });
    }

    function goPrev() {
        if (STATE.currentIndex <= 0) return;
        STATE.currentIndex--;
        _scheduleAutoSave();
        render();
        _emit(VWizEvents.STEP_CHANGE, { index: STATE.currentIndex });
    }

    function goToDecision() {
        STATE.currentIndex = -1;
        _scheduleAutoSave();
        render();
        _emit(VWizEvents.STEP_CHANGE, { index: -1 });
    }

    function backToChecklist() {
        var list = STATE.checklist || [];
        STATE.currentIndex = Math.max(0, list.length - 1);
        render();
    }

    function _refreshSubmitState() {
        // فقط دکمه را فعال/غیرفعال کن بدون رندر کل
        if (!STATE.root) return;
        var btns = STATE.root.querySelectorAll('[data-vwiz-action="submit"]');
        for (var i = 0; i < btns.length; i++) {
            if (canSubmit()) btns[i].removeAttribute('disabled');
            else btns[i].setAttribute('disabled', 'disabled');
        }
    }

    // ─────────────────────────────────────
    // ✅ ارسال نهایی
    // ─────────────────────────────────────
    function submit() {
        if (STATE.submitting) return false;

        // اعتبارسنجی نهایی
        if (!STATE.decision) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('ابتدا تصمیم خود را انتخاب کنید', 'خطا');
            }
            return false;
        }

        var p = computeProgress();
        if (!p.isComplete) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('ابتدا همه موارد الزامی چک‌لیست را تکمیل کنید', 'خطا');
            }
            return false;
        }

        if ((STATE.decision === DECISIONS.REJECT ||
             STATE.decision === DECISIONS.REVISE) &&
            STATE.decisionNote.trim().length < MIN_REJECT_NOTE) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('دلیل باید حداقل ' +
                    _fa(MIN_REJECT_NOTE) + ' کاراکتر باشد', 'خطا');
            }
            return false;
        }

        STATE.submitting = true;
        _setBusy(true);
        _emit(VWizEvents.SUBMIT, {
            caseId: STATE.caseId,
            decision: STATE.decision
        });

        setTimeout(function () {
            var res = _applyDecision();

            if (!res.ok) {
                STATE.submitting = false;
                _setBusy(false);
                _emit(VWizEvents.FAIL, res);
                if (typeof WamUI !== 'undefined') {
                    WamUI.toastError(
                        'خطا در ثبت: ' + (res.reason || 'نامشخص'), 'خطا');
                }
                return;
            }

            // پاکسازی draft
            if (typeof WamVerifierStorage !== 'undefined' &&
                WamVerifierStorage.clearDraft) {
                WamVerifierStorage.clearDraft(STATE.caseId);
            }

            _emit(VWizEvents.SUCCESS, {
                caseId: STATE.caseId,
                decision: STATE.decision
            });

            if (typeof WamUI !== 'undefined') {
                var label = DECISION_LABELS[STATE.decision] || STATE.decision;
                WamUI.toastSuccess(label + ' با موفقیت ثبت شد', 'موفق');
                if (WamUI.loader) {
                    WamUI.loader.show('وام پی', 'در حال بازگشت...');
                }
            }

            setTimeout(_goBack, 900);
        }, 450);
    }

    function _applyDecision() {
        if (typeof CaseStateMachine === 'undefined') {
            return { ok: false, reason: 'no_state_machine' };
        }
        var caseId = STATE.caseId;
        var me = _uid();
        var opts = { userId: me, role: 'verifier' };

        var currentStep = STATE.caseData.currentStep || 'step_4';

        var r;
        if (STATE.decision === DECISIONS.APPROVE) {
            // تکمیل مرحله اعتبارسنجی
            if (typeof CaseStateMachine.completeStep === 'function') {
                r = CaseStateMachine.completeStep(caseId, currentStep, {
                    userId: me,
                    role: 'verifier',
                    note: STATE.decisionNote || 'تأیید توسط اعتبارسنج',
                    syncApproval: true
                });
            } else {
                return { ok: false, reason: 'no_complete_method' };
            }
        } else if (STATE.decision === DECISIONS.REJECT) {
            if (typeof CaseStateMachine.rejectStep === 'function') {
                r = CaseStateMachine.rejectStep(caseId, currentStep, {
                    userId: me,
                    role: 'verifier',
                    note: STATE.decisionNote,
                    syncApproval: true
                });
            } else {
                return { ok: false, reason: 'no_reject_method' };
            }
        } else if (STATE.decision === DECISIONS.REVISE) {
            if (typeof CaseStateMachine.reviseStep === 'function') {
                r = CaseStateMachine.reviseStep(caseId, currentStep, {
                    userId: me,
                    role: 'verifier',
                    note: STATE.decisionNote,
                    syncApproval: true
                });
            } else {
                return { ok: false, reason: 'no_revise_method' };
            }
        } else {
            return { ok: false, reason: 'invalid_decision' };
        }

        if (!r || !r.ok) {
            return { ok: false, reason: (r && r.reason) || 'transition_failed' };
        }

        return { ok: true, result: r };
    }

    function _setBusy(b) {
        if (!STATE.root) return;
        var btn = STATE.root.querySelector('[data-vwiz-action="submit"]');
        if (!btn) return;
        if (b) {
            btn.disabled = true;
            btn.setAttribute('data-orig', btn.textContent);
            btn.textContent = 'در حال ثبت...';
        } else {
            btn.disabled = false;
            var o = btn.getAttribute('data-orig');
            if (o) btn.textContent = o;
        }
    }

    // ─────────────────────────────────────
    // 🚪 بازگشت / انصراف
    // ─────────────────────────────────────
    function confirmExit() {
        if (STATE.submitting) return false;
        if (STATE.decision || computeProgress().done > 0) {
            var msg = 'تغییرات ذخیره شده‌اند. بازگردیم؟';
            return window.confirm(msg);
        }
        return true;
    }

    function _goBack() {
        if (typeof WamUI !== 'undefined' && WamUI.loader) {
            WamUI.loader.hide();
        }
        // بازگشت به پنل اعتبارسنج
        if (window.history && window.history.length > 1) {
            window.history.back();
        } else {
            window.location.href = 'verifier-panel.html';
        }
    }

    // ─────────────────────────────────────
    // 🎯 بارگذاری اولیه
    // ─────────────────────────────────────
    function _getCaseIdFromUrl() {
        try {
            var params = new URLSearchParams(window.location.search);
            return params.get('id') || params.get('caseId');
        } catch (e) {
            return null;
        }
    }

    function open(caseId) {
        if (!caseId) return false;

        STATE.caseId = caseId;
        STATE.caseData = _loadCase(caseId);
        if (!STATE.caseData) {
            if (typeof WamUI !== 'undefined') {
                WamUI.toastError('پرونده یافت نشد', 'خطا');
            }
            return false;
        }

        // بارگذاری چک‌لیست
        STATE.checklist = _ensureChecklist(caseId);
        STATE.totalSteps = STATE.checklist.length;
        STATE.currentIndex = 0;
        STATE.decision = null;
        STATE.decisionNote = '';

        // بازیابی draft
        var draft = _loadDraft();
        if (draft) {
            try {
                var d = JSON.parse(draft.text || '{}');
                if (typeof d.currentIndex === 'number') {
                    STATE.currentIndex = d.currentIndex;
                }
                if (d.decision) STATE.decision = d.decision;
                if (d.decisionNote) STATE.decisionNote = d.decisionNote;
                if (typeof WamUI !== 'undefined') {
                    WamUI.toastInfo('پیش‌نویس قبلی بازیابی شد', 'خوش آمدید');
                }
            } catch (e) { /* بی‌صدا */ }
        }

        render();
        _emit(VWizEvents.START, { caseId: caseId, at: Date.now() });
        return true;
    }

    // ─────────────────────────────────────
    // 🚀 نصب
    // ─────────────────────────────────────
    function install(options) {
        options = options || {};
        if (typeof document === 'undefined') return;
        if (STATE.installed && !options.force) return;

        var run = function () {
            var me = (typeof WamPermissions !== 'undefined')
                ? WamPermissions.getCurrentUser() : null;
            if (!me) {
                if (typeof WamPayGuard !== 'undefined') {
                    WamPayGuard.redirectToLogin('not_logged_in');
                }
                return;
            }
            if (me.role !== 'verifier' && me.role !== 'admin' &&
                me.role !== 'super_admin') {
                if (typeof WamPayGuard !== 'undefined') {
                    WamPayGuard.redirectToRoleHome(me.role);
                }
                return;
            }

            var root = options.root ||
                       document.querySelector('[' + ROOT_ATTR + ']') ||
                       document.querySelector('.wam-verifier-wizard');
            if (!root) {
                if (options.debug) console.warn('[verifier-wizard] root پیدا نشد');
                return;
            }
            STATE.root = root;

            var caseId = options.caseId || _getCaseIdFromUrl();
            if (!caseId) {
                STATE.root.innerHTML = '<div class="wam-empty">' +
                    'شناسه پرونده داده نشده است.</div>';
                return;
            }

            var ok = open(caseId);
            if (!ok) {
                STATE.root.innerHTML = '<div class="wam-empty">' +
                    'پرونده یافت نشد یا خطا در بارگذاری.</div>';
                return;
            }

            STATE.installed = true;
            if (options.debug) {
                console.log('[verifier-wizard] آماده — ' + caseId);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run);
        } else {
            run();
        }
    }

    function uninstall() {
        if (STATE._autoSaveTimer) {
            clearTimeout(STATE._autoSaveTimer);
            STATE._autoSaveTimer = null;
        }
        STATE.root = null;
        STATE.installed = false;
        STATE.caseId = null;
        STATE.caseData = null;
    }

    // ─────────────────────────────────────
    // 📊 گزارش
    // ─────────────────────────────────────
    function getStatus() {
        return {
            installed: STATE.installed,
            caseId: STATE.caseId,
            currentIndex: STATE.currentIndex,
            totalSteps: STATE.totalSteps,
            decision: STATE.decision,
            decisionNoteLength: (STATE.decisionNote || '').length,
            submitting: STATE.submitting,
            progress: computeProgress(),
            canSubmit: canSubmit()
        };
    }

    function onChange(cb) {
        if (typeof cb !== 'function') return function () {};
        STATE.listeners.push(cb);
        return function () {
            var i = STATE.listeners.indexOf(cb);
            if (i !== -1) STATE.listeners.splice(i, 1);
        };
    }

    // ─────────────────────────────────────
    // 🌐 API جهانی
    // ─────────────────────────────────────
    var WamVerifierWizard = {
        EVENTS: VWizEvents,
        ROOT_ATTR: ROOT_ATTR,
        DECISIONS: DECISIONS,
        DECISION_LABELS: DECISION_LABELS,
        NOTE_CATEGORIES: NOTE_CATEGORIES,
        MIN_REJECT_NOTE: MIN_REJECT_NOTE,

        install: install,
        uninstall: uninstall,
        open: open,
        render: render,

        goNext: goNext,
        goPrev: goPrev,
        goToDecision: goToDecision,
        backToChecklist: backToChecklist,

        submit: submit,
        saveDraft: _saveDraft,

        computeProgress: computeProgress,
        canSubmit: canSubmit,

        getCaseData: function () { return STATE.caseData; },
        getChecklist: function () { return STATE.checklist.slice(); },

        getStatus: getStatus,
        onChange: onChange
    };

    window.WamVerifierWizard = WamVerifierWizard;
    window.VerifierWizardEvents = VWizEvents;

    // ─────────────────────────────────────
    // ⚡ نصب خودکار
    // ─────────────────────────────────────
    if (typeof document !== 'undefined') {
        var _auto = function () {
            var b = document.body;
            if (!b) return;
            if (b.hasAttribute('data-verifier-wizard-page') ||
                document.querySelector('[' + ROOT_ATTR + ']') ||
                document.querySelector('.wam-verifier-wizard')) {
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