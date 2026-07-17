/**
 * wizard.js — WizardShell: the DOM layer over WizardCore.
 *
 * Full-screen conversation (REDESIGN-SPEC III.5): one question per
 * screen, machined progress ticks, choice plates that answer AND
 * advance on tap, a single brass Next for typed answers. State
 * persists (via db.setSetting) after EVERY transition, so an
 * interrupted wizard resumes exactly where it stopped; completing
 * clears the saved state.
 *
 * Usage:
 *   new WizardShell(db, def, {
 *     modal: true | container: element,
 *     onComplete: function (answers) {},
 *     onCancel: function () {}          // optional — shows a close button when set
 *   }).start();
 */

function WizardShell(db, def, opts) {
    this.db = db;
    this.def = def;
    this.opts = opts || {};
    this.state = null;
    this._root = null;
}

WizardShell.prototype.start = function () {
    var self = this;
    this.db.getSetting('wizard_' + this.def.id).then(function (saved) {
        self.state = WizardCore.hydrate(self.def, saved);
        self._mount();
        self._render();
    });
};

WizardShell.prototype._mount = function () {
    this._root = document.createElement('div');
    if (this.opts.container) {
        // Inline: plain wrapper, same wiz-bar/body/foot structure inside
        this.opts.container.appendChild(this._root);
        return;
    }
    this._root.className = 'wiz';
    document.body.appendChild(this._root);
};

WizardShell.prototype._persist = function () {
    this.db.setSetting('wizard_' + this.def.id, WizardCore.serialize(this.state));
};

WizardShell.prototype._finish = function () {
    var answers = this.state.answers;
    this.db.deleteSetting('wizard_' + this.def.id);
    this._unmount();
    if (this.opts.onComplete) this.opts.onComplete(answers);
};

WizardShell.prototype._unmount = function () {
    if (this._root && this._root.parentNode) {
        this._root.parentNode.removeChild(this._root);
    }
};

WizardShell.prototype._setError = function (msg) {
    var el = this._root.querySelector('.wiz-error');
    if (!el) return;
    el.innerHTML = msg ? Icon('alert', 16) : '';
    if (msg) {
        var span = document.createElement('span');
        span.textContent = msg;
        el.appendChild(span);
    }
};

WizardShell.prototype._advance = function (answer) {
    var verdict = WizardCore.canNext(this.def, this.state, answer);
    if (!verdict.ok) {
        this._setError(verdict.error);
        return;
    }
    this.state = WizardCore.next(this.def, this.state, answer);
    if (WizardCore.isComplete(this.def, this.state)) {
        this._finish();
    } else {
        this._persist();
        this._render();
    }
};

WizardShell.prototype._render = function () {
    var self = this;
    var step = this.def.steps[this.state.index];
    if (!step) { this._finish(); return; }

    var progress = WizardCore.progress(this.def, this.state);
    var saved = this.state.answers[step.id];
    this._pending = saved; // choice selection buffer; Next commits it

    // ── Template D shell: progress bar · step · question ──────
    var pct = progress.total ? Math.round(100 * progress.current / progress.total) : 100;
    var html = '<div class="wiz-bar">' +
        '<div class="wiz-progress"><i style="width:' + pct + '%"></i></div>' +
        (this.opts.onCancel
            ? '<button class="wiz-close" id="wizard-close" aria-label="Close">' + Icon('x', 20) + '</button>'
            : '') +
        '</div>';

    html += '<div class="wiz-body">';
    if (progress.total > 1) {
        html += '<div class="wiz-step">Step ' + progress.current + ' of ' + progress.total + '</div>';
    }
    html += '<h2 class="wiz-question">' + step.prompt + '</h2>';

    if (step.type === 'custom') {
        // Custom steps own their body and advance via api.submit(answer).
        // step.mount(bodyEl, state, api) is called after the shell renders.
        html += '<div id="wizard-custom-body"></div>';
    } else if (step.type === 'choice') {
        for (var c = 0; c < step.choices.length; c++) {
            var ch = step.choices[c];
            var selected = saved !== undefined && saved !== null && String(saved) === String(ch.value);
            html += '<button class="option-row' + (selected ? ' on' : '') +
                '" data-value="' + ch.value + '">' +
                '<span>' + ch.label +
                (ch.desc ? '<span class="choice-desc">' + ch.desc + '</span>' : '') +
                '</span>' +
                '</button>';
        }
    } else {
        html += '<div class="field">' +
            '<input id="wizard-input" type="' + (step.type === 'number' ? 'number' : 'text') + '"' +
            (step.type === 'number' ? ' inputmode="decimal"' : '') + ' value="' +
            (saved !== undefined && saved !== null ? String(saved).replace(/"/g, '&quot;') : '') + '">' +
            '</div>';
    }

    html += '<div class="wiz-error"></div>';
    html += '</div>';

    // ── fixed actions: Next + Back (custom steps own their advance) ──
    html += '<div class="wiz-actions">';
    if (step.type !== 'custom') {
        html += '<button class="wiz-next btn-primary" id="wizard-next">Next</button>';
    }
    if (this.state.index > 0) {
        html += '<button class="wiz-back" id="wizard-back">&lsaquo; Back</button>';
    }
    html += '</div>';

    this._root.innerHTML = html;

    if (step.type === 'custom' && step.mount) {
        step.mount(this._root.querySelector('#wizard-custom-body'), this.state, {
            submit: function (answer) { self._advance(answer); },
            error: function (msg) { self._setError(msg || ''); }
        });
    }

    // Option taps select; the fixed Next commits (Template D)
    var choices = this._root.querySelectorAll('.option-row');
    for (var i = 0; i < choices.length; i++) {
        choices[i].addEventListener('click', function () {
            self._pending = this.getAttribute('data-value');
            var rows = self._root.querySelectorAll('.option-row');
            for (var r = 0; r < rows.length; r++) rows[r].classList.remove('on');
            this.classList.add('on');
            self._setError('');
        });
    }
    var nextBtn = this._root.querySelector('#wizard-next');
    if (nextBtn) {
        nextBtn.addEventListener('click', function () {
            var stepNow = self.def.steps[self.state.index];
            if (stepNow.type === 'choice') {
                self._advance(self._pending);
                return;
            }
            var input = self._root.querySelector('#wizard-input');
            var v = input ? input.value : '';
            self._advance(stepNow.type === 'number' && v !== '' ? parseFloat(v) : v);
        });
    }
    var backBtn = this._root.querySelector('#wizard-back');
    if (backBtn) {
        backBtn.addEventListener('click', function () {
            self.state = WizardCore.back(self.def, self.state);
            self._persist();
            self._render();
        });
    }
    var closeBtn = this._root.querySelector('#wizard-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', function () {
            self._persist(); // resumable — nothing lost
            self._unmount();
            if (self.opts.onCancel) self.opts.onCancel();
        });
    }
};
