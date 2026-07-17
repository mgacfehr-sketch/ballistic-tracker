/**
 * wizard.js — WizardShell: the DOM layer over WizardCore.
 *
 * One question per screen, ≥44px choice buttons, big Next, Back,
 * skip-aware progress. State persists (localStorage via db.setSetting)
 * after EVERY transition, so an interrupted wizard resumes exactly
 * where it stopped; completing clears the saved state.
 *
 * Usage:
 *   new WizardShell(db, def, {
 *     modal: true | container: element,
 *     onComplete: function (answers) {},
 *     onCancel: function () {}          // optional — shows an × when set
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
    if (this.opts.container) {
        this._root = this.opts.container;
        return;
    }
    this._root = document.createElement('div');
    this._root.className = 'wizard-overlay';
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
    if (!this.opts.container && this._root && this._root.parentNode) {
        this._root.parentNode.removeChild(this._root);
    } else if (this._root) {
        this._root.innerHTML = '';
    }
};

WizardShell.prototype._advance = function (answer) {
    var verdict = WizardCore.canNext(this.def, this.state, answer);
    if (!verdict.ok) {
        var err = this._root.querySelector('.wizard-error');
        if (err) err.textContent = verdict.error;
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

    var html = '<div class="wizard-card">';
    if (this.opts.onCancel) {
        html += '<button class="wizard-close" aria-label="Close" title="Close">×</button>';
    }
    if (progress.total > 1) {
        html += '<div class="wizard-progress"><div class="wizard-progress-bar" style="width:' +
            Math.round(progress.fraction * 100) + '%"></div></div>';
        html += '<div class="wizard-count">' + progress.current + ' of ' + progress.total + '</div>';
    }
    html += '<h3 class="wizard-prompt">' + step.prompt + '</h3>';

    if (step.type === 'custom') {
        // Custom steps own their body and advance via api.submit(answer).
        // step.mount(bodyEl, state, api) is called after the shell renders.
        html += '<div class="wizard-custom" id="wizard-custom-body"></div>';
    } else if (step.type === 'choice') {
        for (var c = 0; c < step.choices.length; c++) {
            var ch = step.choices[c];
            html += '<button class="wizard-choice" data-value="' + ch.value + '">' +
                '<span class="wizard-choice-label">' + ch.label + '</span>' +
                (ch.desc ? '<span class="wizard-choice-desc">' + ch.desc + '</span>' : '') +
                '</button>';
        }
    } else {
        html += '<input class="wizard-input" id="wizard-input" type="' +
            (step.type === 'number' ? 'number' : 'text') + '" value="' +
            (saved !== undefined && saved !== null ? String(saved).replace(/"/g, '&quot;') : '') + '">';
    }

    html += '<p class="wizard-error"></p>';
    html += '<div class="wizard-nav">';
    if (this.state.index > 0) {
        html += '<button class="btn btn-secondary" id="wizard-back">‹ Back</button>';
    }
    if (step.type !== 'choice' && step.type !== 'custom') {
        html += '<button class="btn btn-primary wizard-next" id="wizard-next">Next</button>';
    }
    html += '</div>';
    html += '</div>';

    this._root.innerHTML = html;

    if (step.type === 'custom' && step.mount) {
        step.mount(this._root.querySelector('#wizard-custom-body'), this.state, {
            submit: function (answer) { self._advance(answer); },
            error: function (msg) {
                var errEl = self._root.querySelector('.wizard-error');
                if (errEl) errEl.textContent = msg || '';
            }
        });
    }

    // Choice taps answer AND advance — one decision per screen
    var choices = this._root.querySelectorAll('.wizard-choice');
    for (var i = 0; i < choices.length; i++) {
        choices[i].addEventListener('click', function () {
            self._advance(this.getAttribute('data-value'));
        });
    }
    var nextBtn = this._root.querySelector('#wizard-next');
    if (nextBtn) {
        nextBtn.addEventListener('click', function () {
            var input = self._root.querySelector('#wizard-input');
            var v = input ? input.value : '';
            self._advance(self.def.steps[self.state.index].type === 'number' && v !== ''
                ? parseFloat(v) : v);
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
    var closeBtn = this._root.querySelector('.wizard-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', function () {
            self._persist(); // resumable — nothing lost
            self._unmount();
            if (self.opts.onCancel) self.opts.onCancel();
        });
    }
};
