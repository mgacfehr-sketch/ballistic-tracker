/**
 * session-flow.js — Step-by-step session workflow controller.
 *
 * Manages the state machine for the core session flow:
 *   PROFILE → LOAD → CALIBRATE → DATA → POA → IMPACTS → RESULTS
 *
 * Coordinates between CanvasManager, CalibrationManager, and calculations.js.
 */

var STEPS = ['profile', 'load', 'calibrate', 'data', 'poa', 'impacts', 'results'];
var MAX_IMPACTS = 10;

function SessionFlow(canvasManager, db) {
    this.canvas = canvasManager;
    this.db = db;
    this.calibration = new CalibrationManager();

    this.currentStep = 0; // index into STEPS
    this.image = null;

    // Session data
    this.distanceYards = 0;
    this.bulletDiameter = 0;
    this.poa = null;           // {x, y} image coords
    this.impacts = [];         // [{x, y, shotNumber}] image coords, ordered by tap (shot #1 = cold bore)
    this.results = null;       // output from calculateSession
    this.coldBore = null;      // {verticalInches, verticalMOA, horizontalInches, horizontalMOA, radialInches, radialMOA} for shot #1

    // Profile references (null in Quick/Misc mode)
    this.rifleId = null;
    this.loadId = null;
    this.barrelId = null;
    this.selectedRifle = null;
    this.selectedLoad = null;

    // Optional session data
    this.roundsFired = 0;
    this.measuredVelocity = null;
    this.weather = null;
    this.savedSessionId = null;

    // Crop mode
    this.cropMode = false;
    this.croppedCanvas = null;

    // DOM references (set in init)
    this.els = {};

    // Bind canvas tap handler
    var self = this;
    this.canvas.onTap = function (pt) { self._onCanvasTap(pt); };
}

/**
 * Initialize DOM references. Call once after DOM is ready.
 */
SessionFlow.prototype.init = function () {
    this.els = {
        // Step sections
        steps: {},
        progressBar: document.getElementById('progress-bar'),
        // Step 1: Profile
        profilePicker: document.getElementById('profile-picker'),
        btnQuickMode: document.getElementById('btn-quick-mode'),
        // Step 2: Load
        btnCamera: document.getElementById('btn-camera'),
        btnGallery: document.getElementById('btn-gallery'),
        inputCamera: document.getElementById('input-camera'),
        inputGallery: document.getElementById('input-gallery'),
        // Step 3: Calibrate
        calibrationStatus: document.getElementById('calibration-status'),
        btnRedoCalibration: document.getElementById('btn-redo-calibration'),
        btnNextCalibration: document.getElementById('btn-next-calibration'),
        btnManualCalibration: document.getElementById('btn-manual-calibration'),
        // Step 4: Data
        inputDistance: document.getElementById('input-distance'),
        inputBulletDia: document.getElementById('input-bullet-dia'),
        btnNextData: document.getElementById('btn-next-data'),
        dataValidationHint: document.getElementById('data-validation-hint'),
        inputRoundsFired: document.getElementById('input-rounds-fired'),
        inputVelocity: document.getElementById('input-velocity'),
        inputTemp: document.getElementById('input-temp'),
        inputHumidity: document.getElementById('input-humidity'),
        inputWindMph: document.getElementById('input-wind-mph'),
        inputWindDir: document.getElementById('input-wind-dir'),
        inputAltitude: document.getElementById('input-altitude'),
        inputPressure: document.getElementById('input-pressure'),
        dataOptionalDetails: document.getElementById('data-optional-details'),
        btnFetchWeather: document.getElementById('btn-fetch-weather'),
        // Step 5: POA
        poaStatus: document.getElementById('poa-status'),
        btnRedoPoa: document.getElementById('btn-redo-poa'),
        btnNextPoa: document.getElementById('btn-next-poa'),
        // Step 6: Impacts
        impactStatus: document.getElementById('impact-status'),
        btnUndoImpact: document.getElementById('btn-undo-impact'),
        btnClearImpacts: document.getElementById('btn-clear-impacts'),
        btnCalculate: document.getElementById('btn-calculate'),
        // Step 7: Results
        resultsCard: document.getElementById('results-card'),
        btnSaveSession: document.getElementById('btn-save-session'),
        btnSaveImage: document.getElementById('btn-save-image'),
        btnShare: document.getElementById('btn-share'),
        btnNewFromResults: document.getElementById('btn-new-from-results'),
        btnCropImage: document.getElementById('btn-crop-image'),
        // Print/share blank target (on profile step)
        btnPrintTarget: document.getElementById('btn-print-target'),
        btnShareTarget: document.getElementById('btn-share-target'),
        // Brand lockup over the empty canvas — hidden once an image loads
        canvasWatermark: document.querySelector('.canvas-brand-lockup')
    };

    // Cache step sections
    for (var i = 0; i < STEPS.length; i++) {
        this.els.steps[STEPS[i]] = document.getElementById('step-' + STEPS[i]);
    }

    this._bindUI();
    this._showStep(0);
};

/**
 * Reset the session to the beginning.
 */
SessionFlow.prototype.reset = function () {
    this.currentStep = 0;
    this.image = null;
    this.calibration.reset();
    this.distanceYards = 0;
    this.bulletDiameter = 0;
    this.poa = null;
    this.impacts = [];
    this.results = null;
    this.coldBore = null;

    // Clear profile references
    this.rifleId = null;
    this.loadId = null;
    this.barrelId = null;
    this.selectedRifle = null;
    this.selectedLoad = null;

    // Clear optional fields
    this.roundsFired = 0;
    this.measuredVelocity = null;
    this.weather = null;
    this.savedSessionId = null;

    // Reset crop mode
    this.cropMode = false;
    this.croppedCanvas = null;
    if (this.els.btnCropImage) {
        this.els.btnCropImage.classList.remove('active');
        this.els.btnCropImage.textContent = 'Crop';
    }
    var canvasContainer = document.getElementById('canvas-container');
    if (canvasContainer) canvasContainer.classList.remove('crop-mode');

    this.canvas.clearImage();
    this.canvas.setHint('');
    if (this.els.canvasWatermark) this.els.canvasWatermark.classList.remove('hidden');

    // Reset inputs
    if (this.els.inputDistance) this.els.inputDistance.value = '';
    if (this.els.inputBulletDia) this.els.inputBulletDia.value = '';
    if (this.els.inputRoundsFired) this.els.inputRoundsFired.value = '';
    if (this.els.inputVelocity) this.els.inputVelocity.value = '';
    if (this.els.inputTemp) this.els.inputTemp.value = '';
    if (this.els.inputHumidity) this.els.inputHumidity.value = '';
    if (this.els.inputWindMph) this.els.inputWindMph.value = '';
    if (this.els.inputWindDir) this.els.inputWindDir.value = '';
    if (this.els.inputAltitude) this.els.inputAltitude.value = '';
    if (this.els.inputPressure) this.els.inputPressure.value = '';

    // Close optional details
    if (this.els.dataOptionalDetails) this.els.dataOptionalDetails.removeAttribute('open');

    // Reset weather button
    if (this.els.btnFetchWeather) {
        this.els.btnFetchWeather.disabled = false;
        this.els.btnFetchWeather.innerHTML = Icon('cloud', 18) + ' Get weather';
    }

    // Reset button states
    this._hideEl(this.els.btnRedoCalibration);
    this._hideEl(this.els.btnNextCalibration);
    this._hideEl(this.els.btnManualCalibration);
    this._hideEl(this.els.btnRedoPoa);
    this._hideEl(this.els.btnNextPoa);
    if (this.els.btnNextData) this.els.btnNextData.disabled = true;
    if (this.els.btnUndoImpact) this.els.btnUndoImpact.disabled = true;
    if (this.els.btnClearImpacts) this.els.btnClearImpacts.disabled = true;
    if (this.els.btnCalculate) this.els.btnCalculate.disabled = true;
    if (this.els.btnSaveSession) {
        this.els.btnSaveSession.disabled = false;
        this.els.btnSaveSession.innerHTML = Icon('check', 20) + ' Save session';
    }

    // Clear preset selection
    var presetBtns = document.querySelectorAll('.preset-btn');
    for (var i = 0; i < presetBtns.length; i++) {
        presetBtns[i].classList.remove('selected');
    }

    this._showStep(0);
};

// ── Step Navigation ────────────────────────────────────────────

SessionFlow.prototype._showStep = function (index) {
    this.currentStep = index;
    var stepName = STEPS[index];

    // Wrong-rifle protection (Proven §3.2): the final confirm control
    // restates the rifle it will write to. No silent cross-rifle saves.
    if (stepName === 'results' && this.els.btnSaveSession && !this.savedSessionId) {
        this.els.btnSaveSession.innerHTML = Icon('check', 20) + ' ' +
            (this.selectedRifle && this.selectedRifle.name
                ? 'Save to ' + escapeHtml(this.selectedRifle.name)
                : 'Save session');
    }

    // Toggle step visibility
    for (var key in this.els.steps) {
        var el = this.els.steps[key];
        if (key === stepName) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    }

    // Update progress bar
    var pct = ((index + 1) / STEPS.length) * 100;
    if (this.els.progressBar) {
        this.els.progressBar.style.width = pct + '%';
    }

    // Load profile picker when showing profile step
    if (stepName === 'profile') {
        this._loadProfilePicker();
    }

    // Auto-fill conditions when entering the data step (feature-gated)
    if (stepName === 'data') {
        this._autoConditions();
    }

    // Set canvas hints per step
    this._updateHint();

    // Auto-scroll panel so action buttons are visible
    this._scrollPanelToBottom();

    // Step counter next to the title ("· N of 7") — injected once per
    // section so the markup stays static
    var section = this.els.steps[stepName];
    if (section && !section.querySelector('.step-count')) {
        var title = section.querySelector('.step-title');
        if (title) {
            var count = document.createElement('span');
            count.className = 'step-count';
            count.textContent = '· ' + (index + 1) + ' of ' + STEPS.length;
            title.insertAdjacentElement('afterend', count);
        }
    }
};

SessionFlow.prototype._nextStep = function () {
    if (this.currentStep < STEPS.length - 1) {
        this._showStep(this.currentStep + 1);
    }
};

/**
 * Go back one step, preserving everything already entered. Leaving the
 * results step clears the results overlay (recalculating rebuilds it).
 */
SessionFlow.prototype._prevStep = function () {
    if (this.currentStep <= 0) {
        // v3.0: step 1 is the flow's own entry point — with the bottom
        // tab bar gone, "back" from here means leaving the flow
        // entirely, not a no-op that strands the user.
        if (window.AppNav) AppNav.go('home');
        return;
    }
    if (STEPS[this.currentStep] === 'results') {
        this.canvas.overlayResults = null;
        this._removeMarkersOfType('centroid');
        this.canvas.render();
    }
    this._showStep(this.currentStep - 1);
};

SessionFlow.prototype._updateHint = function () {
    var step = STEPS[this.currentStep];
    switch (step) {
        case 'calibrate':
            if (this.calibration.state === 'waitingA') {
                this.canvas.setHint('Tap Point A of 1" reference');
            } else if (this.calibration.state === 'waitingB') {
                this.canvas.setHint('Tap Point B of 1" reference');
            } else {
                this.canvas.setHint('');
            }
            break;
        case 'poa':
            if (!this.poa) {
                this.canvas.setHint('Tap your point of aim');
            } else {
                this.canvas.setHint('');
            }
            break;
        case 'impacts':
            this.canvas.setHint('Tap impact #' + (this.impacts.length + 1));
            break;
        default:
            this.canvas.setHint('');
    }
};

// ── Step 1: Profile Picker ────────────────────────────────────

SessionFlow.prototype._loadProfilePicker = function () {
    var picker = this.els.profilePicker;
    if (!picker) return;
    // AUDIT-FINDINGS.md F3: a rifle-scoped SessionLaunch.start is already
    // in flight and will render its own (safer, wrong-rifle-proof) picker
    // once it resolves — don't race it with this flat, all-rifles one.
    if (this._scopedLaunchPending) return;

    if (!this.db) {
        picker.innerHTML = '<p class="t-micro">Database not available</p>';
        return;
    }

    var self = this;
    this.db.getAllRifles().then(function (rifles) {
        if (rifles.length === 0) {
            picker.innerHTML =
                '<div class="empty-teach">' +
                '<p>Pick a rifle so this target lands on its record &mdash; or tap &ldquo;Just measure this group&rdquo; below for a one-off measurement.</p>' +
                '<button class="action" id="btn-go-profiles">Set up a rifle</button>' +
                '</div>';
            var goBtn = document.getElementById('btn-go-profiles');
            if (goBtn) {
                goBtn.addEventListener('click', function () {
                    if (window.AppNav) AppNav.go('profiles');
                });
            }
            return;
        }

        // For each rifle, get its loads
        var promises = rifles.map(function (r) {
            return self.db.getLoadsByRifle(r.id).then(function (loads) {
                return { rifle: r, loads: loads };
            });
        });

        Promise.all(promises).then(function (groups) {
            self._renderProfilePicker(groups);
        });
    });
};

SessionFlow.prototype._renderProfilePicker = function (groups) {
    var picker = this.els.profilePicker;
    var self = this;
    var html = '';

    // Quick Start buttons (beta feature)
    if (typeof isBetaEnabled === 'function' && isBetaEnabled('quickStart') && groups.length > 0) {
        html += '<div class="qcard-kicker">Quick start</div>';
        html += '<div class="choice-stack u-mb-12">';
        for (var q = 0; q < groups.length; q++) {
            var qr = groups[q].rifle;
            var qloads = groups[q].loads;
            if (qloads.length === 0) continue;
            // Use first load as default
            var ql = qloads[0];
            html += '<button class="choice-plate quick-start-btn" data-rifle-id="' + escapeAttr(qr.id) + '" data-load-id="' + escapeAttr(ql.id) + '">';
            html += '<span>' + escapeHtml(qr.name);
            html += '<span class="choice-desc">' + escapeHtml(qr.caliber) + ' &middot; ' + escapeHtml(ql.name) + '</span></span>';
            html += Icon('chevron-right', 18);
            html += '</button>';
        }
        html += '</div>';
    }

    for (var g = 0; g < groups.length; g++) {
        var rifle = groups[g].rifle;
        var loads = groups[g].loads;

        loads.sort(function (a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });

        html += '<div class="qcard-kicker">' + escapeHtml(rifle.name) +
            (rifle.caliber ? ' &middot; ' + escapeHtml(rifle.caliber) : '') + '</div>';

        if (loads.length === 0) {
            html += '<p class="t-micro">No ammo on file for this rifle yet.</p>';
        } else {
            html += '<div class="choice-stack">';
            for (var l = 0; l < loads.length; l++) {
                var ld = loads[l];
                html += '<button class="choice-plate picker-load-btn" data-rifle-id="' + escapeAttr(rifle.id) + '" data-load-id="' + escapeAttr(ld.id) + '">';
                html += '<span>' + escapeHtml(ld.name);
                html += '<span class="choice-desc">' + ld.bulletWeight + 'gr &middot; ' + ld.bulletDiameter + '&quot;</span></span>';
                html += Icon('chevron-right', 18);
                html += '</button>';
            }
            html += '</div>';
        }
        // Device feedback: a load picker with no way to create a load
        // was a dead end. "+ New ammo" reveals a minimal inline form
        // right here — saving it selects this rifle with the new load
        // and continues into the session, nothing lost.
        html += '<button type="button" class="action" data-new-ammo-rifle="' + escapeAttr(rifle.id) + '">' +
            Icon('plus', 18) + 'New ammo</button>';
        html += '<div class="hidden" id="new-ammo-panel-' + escapeAttr(rifle.id) + '"></div>';
    }

    picker.innerHTML = html;

    if (typeof NewAmmoForm !== 'undefined') {
        var newAmmoBtns = picker.querySelectorAll('[data-new-ammo-rifle]');
        for (var na = 0; na < newAmmoBtns.length; na++) {
            newAmmoBtns[na].addEventListener('click', function () {
                var rId = this.getAttribute('data-new-ammo-rifle');
                var panel = document.getElementById('new-ammo-panel-' + rId);
                if (!panel) return;
                this.classList.add('hidden');
                panel.classList.remove('hidden');
                var idPrefix = 'na-' + rId;
                panel.innerHTML = NewAmmoForm.html(idPrefix);
                NewAmmoForm.bind(idPrefix, self.db, rId, function (load) {
                    self._selectProfile(rId, load.id);
                });
            });
        }
    }

    // Bind load buttons
    var btns = picker.querySelectorAll('.picker-load-btn');
    for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function () {
            var rId = this.getAttribute('data-rifle-id');
            var lId = this.getAttribute('data-load-id');
            self._selectProfile(rId, lId);
        });
    }

    // Bind quick-start buttons
    var qsBtns = picker.querySelectorAll('.quick-start-btn');
    for (var qi = 0; qi < qsBtns.length; qi++) {
        qsBtns[qi].addEventListener('click', function () {
            var rId = this.getAttribute('data-rifle-id');
            var lId = this.getAttribute('data-load-id');
            self._selectProfile(rId, lId);
            // Auto-fetch weather after profile select
            setTimeout(function () {
                if (self.els.btnFetchWeather && typeof self._fetchWeather === 'function') {
                    self._fetchWeather();
                }
            }, 300);
        });
    }
};

SessionFlow.prototype._selectProfile = function (rifleId, loadId) {
    var self = this;

    Promise.all([
        this.db.getRifle(rifleId),
        this.db.getLoad(loadId),
        this.db.getBarrelsByRifle(rifleId)
    ]).then(function (results) {
        var rifle = results[0];
        var load = results[1];
        var barrels = results[2];

        self.rifleId = rifleId;
        self.loadId = loadId;
        self.selectedRifle = rifle;
        self.selectedLoad = load;

        // Find active barrel
        self.barrelId = null;
        for (var i = 0; i < barrels.length; i++) {
            if (barrels[i].isActive) {
                self.barrelId = barrels[i].id;
                break;
            }
        }

        // Auto-fill data inputs
        if (load) {
            if (load.bulletDiameter) {
                self.els.inputBulletDia.value = load.bulletDiameter;
                self._updatePresetHighlight();
            }
            if (load.muzzleVelocity && self.els.inputVelocity) {
                self.els.inputVelocity.value = load.muzzleVelocity;
            }
        }
        if (rifle && rifle.zeroRange) {
            self.els.inputDistance.value = rifle.zeroRange;
        }

        // §2.1: suppressor question (suppressor-enabled users only) +
        // lot question (every session) — one sheet, sticky defaults.
        self._askSessionQuestions(rifle, load).then(function () {
            self._validateDataInputs();
            self._nextStep();
        });
    });
};

/**
 * v2.5 §2.2: the quiet "details" link on the data step (simple lane).
 * Shows the silently-applied suppressor + lot; tapping reopens the
 * session-questions sheet to change them.
 */
SessionFlow.prototype._renderSessionDetailsLink = function (rifle, load, cans) {
    var self = this;
    var host = document.getElementById('step-data');
    if (!host) return;
    var el = document.getElementById('sq-details-link');
    if (!el) {
        el = document.createElement('button');
        el.id = 'sq-details-link';
        el.className = 'action u-full u-mt-10';
        host.appendChild(el);
        el.addEventListener('click', function () {
            self._askSessionQuestions(self.selectedRifle, self.selectedLoad, true).then(function () {
                self._renderSessionDetailsLink(self.selectedRifle, self.selectedLoad, cans);
            });
        });
    }
    var canName = 'Bare';
    (cans || []).forEach(function (c) { if (c.id === self.suppressorId) canName = c.name; });
    el.textContent = 'Details: ' + canName +
        (self.lotNumber ? ' · Lot ' + self.lotNumber : ' · no lot') + ' — change';
};

SessionFlow.prototype._selectQuickMode = function () {
    this.rifleId = null;
    this.loadId = null;
    this.barrelId = null;
    this.selectedRifle = null;
    this.selectedLoad = null;
    this.suppressorId = null;
    this.lotNumber = null;
    this._nextStep();
};

/**
 * The two session questions (§2.1), one sheet, ≤2 taps when the
 * defaults are right: "Suppressed?" (Bare | which can, last-used
 * preselected, + Add inline) and "Which lot?" (last lot preselected,
 * prior lots listed, New lot… entry). Backdrop tap accepts the
 * current selection — never a gate.
 */
SessionFlow.prototype._askSessionQuestions = function (rifle, load, force) {
    var self = this;
    self.suppressorId = null;
    self.lotNumber = load ? (load.lotNumber || null) : null;

    if (!rifle) return Promise.resolve();
    var supEnabled = (typeof Suppressors !== 'undefined')
        ? Suppressors.isEnabled(this.db) : Promise.resolve(false);

    return Promise.all([
        supEnabled,
        (typeof Suppressors !== 'undefined')
            ? Suppressors.getLastUsed(this.db, rifle.id) : Promise.resolve(null),
        this.db.getSuppressors ? this.db.getSuppressors().catch(function () { return []; }) : Promise.resolve([]),
        this.db.getSessionsByRifle(rifle.id).catch(function () { return []; }),
        this.db.getVelocityStringsByRifle(rifle.id).catch(function () { return []; })
    ]).then(function (res) {
        var enabled = res[0];
        var lastCan = res[1];
        var cans = res[2] || [];
        var sessions = res[3] || [];
        var strings = res[4] || [];

        // v2.5 §2.2 SIMPLE lane: apply last-time defaults SILENTLY;
        // a quiet "details" link on the data step reopens this sheet.
        if (!force && typeof Lanes !== 'undefined' && !Lanes.isDetailed()) {
            self.suppressorId = (lastCan && cans.some(function (c) { return c.id === lastCan; }))
                ? lastCan : null;
            var lastLot = null;
            sessions.slice().sort(function (a, b) {
                return String(b.date || '').localeCompare(String(a.date || ''));
            }).some(function (s) {
                if (load && s.loadId === load.id && s.lotNumber) { lastLot = s.lotNumber; return true; }
                return false;
            });
            self.lotNumber = lastLot || (load ? (load.lotNumber || null) : null);
            self._renderSessionDetailsLink(rifle, load, cans);
            return null;
        }
        if (!force) {
            // detailed lane: the sheet asks — no stale simple-lane link
            var staleLink = document.getElementById('sq-details-link');
            if (staleLink && staleLink.parentNode) staleLink.parentNode.removeChild(staleLink);
        }

        // Prior lots for THIS load, most recent first, plus the load's own
        var lots = [];
        function addLot(l) { if (l && lots.indexOf(l) === -1) lots.push(l); }
        sessions.slice().sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
        }).forEach(function (s) {
            if (load && s.loadId === load.id) addLot(s.lotNumber);
        });
        if (load) addLot(load.lotNumber);

        var askSuppressor = enabled;
        var askLot = !!load;
        if (!askSuppressor && !askLot) return null;

        // Inline lot-drift note (monitors speak where contextually true)
        var driftNote = null;
        if (typeof lotDrift === 'function') {
            var drifts = lotDrift(strings) || [];
            if (drifts.length) {
                var d = drifts[0];
                driftNote = 'Lot ' + d.newLot + ' ran ' + Math.abs(d.deltaFps) + ' fps ' +
                    (d.deltaFps > 0 ? 'faster' : 'slower') + ' than ' + d.prevLot + ' — worth a zero check.';
            }
        }

        return new Promise(function (resolve) {
            var pickedCan = lastCan && cans.some(function (c) { return c.id === lastCan; })
                ? lastCan : null;
            var pickedLot = lots.length ? lots[0] : null;

            var overlay = document.createElement('div');
            overlay.className = 'overlay';

            function render() {
                var html = '<div class="overlay-card">' +
                    '<div class="overlay-title">' + escapeHtml(rifle.name || 'Session') + '</div>';

                if (askSuppressor) {
                    html += '<p class="t-label u-mt-10">Suppressor</p>';
                    html += '<button class="option-row' + (pickedCan === null ? ' on' : '') +
                        '" data-can="bare"><span>Bare</span></button>';
                    cans.forEach(function (c) {
                        html += '<button class="option-row' + (pickedCan === c.id ? ' on' : '') +
                            '" data-can="' + c.id + '"><span>' + escapeHtml(c.name) +
                            (c.brand ? '<span class="choice-desc">' + escapeHtml(c.brand) + '</span>' : '') +
                            '</span></button>';
                    });
                    html += '<button class="option-row" data-can-add="1">' +
                        '<span class="u-gold">＋ Add a can</span></button>';
                }

                if (askLot) {
                    html += '<p class="t-label u-mt-10">Which lot?</p>';
                    lots.forEach(function (l, i) {
                        html += '<button class="option-row' + (pickedLot === l ? ' on' : '') +
                            '" data-lot="' + escapeHtml(l) + '"><span>Lot ' + escapeHtml(l) +
                            (i === 0 ? '<span class="choice-desc">same as last time</span>' : '') +
                            '</span></button>';
                    });
                    if (!lots.length) {
                        html += '<p class="t-micro">No lot on record yet — enter the box\'s lot below.</p>';
                    }
                    html += '<div class="field u-mt-10"><input type="text" id="sq-new-lot" ' +
                        'placeholder="New lot…" maxlength="40"></div>';
                    if (driftNote) {
                        html += '<p class="t-micro u-mt-10">' + escapeHtml(driftNote) + '</p>';
                    }
                }

                html += '<button class="btn-primary u-full u-mt-10" id="sq-continue">Continue</button>';
                html += '</div>';
                overlay.innerHTML = html;
                bind();
            }

            function finish() {
                var newLot = overlay.querySelector('#sq-new-lot');
                if (newLot && newLot.value.trim()) pickedLot = newLot.value.trim();
                self.suppressorId = (pickedCan === null || pickedCan === 'bare') ? null : pickedCan;
                self.lotNumber = pickedLot || null;
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                resolve();
            }

            function bind() {
                var canBtns = overlay.querySelectorAll('[data-can]');
                for (var i = 0; i < canBtns.length; i++) {
                    canBtns[i].addEventListener('click', function () {
                        var v = this.getAttribute('data-can');
                        pickedCan = v === 'bare' ? null : v;
                        render();
                    });
                }
                var addBtn = overlay.querySelector('[data-can-add]');
                if (addBtn) addBtn.addEventListener('click', function () {
                    if (typeof Suppressors === 'undefined') return;
                    Suppressors.addSheet(self.db, {
                        onDone: function (added) {
                            (added || []).forEach(function (c) { cans.push(c); });
                            if (added && added.length) pickedCan = added[added.length - 1].id;
                            render();
                        }
                    });
                });
                var lotBtns = overlay.querySelectorAll('[data-lot]');
                for (var j = 0; j < lotBtns.length; j++) {
                    lotBtns[j].addEventListener('click', function () {
                        pickedLot = this.getAttribute('data-lot');
                        var input = overlay.querySelector('#sq-new-lot');
                        if (input) input.value = '';
                        render();
                    });
                }
                overlay.querySelector('#sq-continue').addEventListener('click', finish);
            }

            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) finish(); // backdrop = accept defaults
            });
            document.body.appendChild(overlay);
            render();
        });
    }).catch(function () {
        // Question sheet is never a gate — proceed with defaults
        return null;
    });
};

// ── UI Binding ─────────────────────────────────────────────────

SessionFlow.prototype._bindUI = function () {
    var self = this;

    // Step 1: Profile
    if (this.els.btnQuickMode) {
        this.els.btnQuickMode.addEventListener('click', function () {
            self._selectQuickMode();
        });
    }

    // Step 2: Load image
    this.els.btnCamera.addEventListener('click', function () {
        self.els.inputCamera.click();
    });
    this.els.btnGallery.addEventListener('click', function () {
        self.els.inputGallery.click();
    });
    this.els.inputCamera.addEventListener('change', function (e) {
        self._onImageSelected(e);
    });
    this.els.inputGallery.addEventListener('change', function (e) {
        self._onImageSelected(e);
    });

    // Step 3: Calibrate
    this.els.btnRedoCalibration.addEventListener('click', function () {
        self._startCalibration();
    });
    this.els.btnNextCalibration.addEventListener('click', function () {
        self._nextStep();
    });
    if (this.els.btnManualCalibration) {
        this.els.btnManualCalibration.addEventListener('click', function () {
            self._startCalibration();
        });
    }

    // Step 4: Data inputs
    this.els.inputDistance.addEventListener('input', function () {
        self._validateDataInputs();
    });
    this.els.inputBulletDia.addEventListener('input', function () {
        self._validateDataInputs();
        self._updatePresetHighlight();
    });
    this.els.btnNextData.addEventListener('click', function () {
        self._confirmData();
    });

    // Bullet diameter presets
    var presetBtns = document.querySelectorAll('.preset-btn');
    for (var i = 0; i < presetBtns.length; i++) {
        presetBtns[i].addEventListener('click', function () {
            self.els.inputBulletDia.value = this.getAttribute('data-value');
            self._validateDataInputs();
            self._updatePresetHighlight();
        });
    }

    // Weather fetch button
    if (this.els.btnFetchWeather) {
        this.els.btnFetchWeather.addEventListener('click', function () {
            self._fetchWeather();
        });
    }

    // Step 5: POA
    this.els.btnRedoPoa.addEventListener('click', function () {
        self.poa = null;
        self._removeMarkersOfType('poa');
        self.canvas.render();
        self._hideEl(self.els.btnRedoPoa);
        self._hideEl(self.els.btnNextPoa);
        self.els.poaStatus.textContent = 'Tap your point of aim on the target';
        self._updateHint();
    });
    this.els.btnNextPoa.addEventListener('click', function () {
        self._nextStep();
        self._updateHint();
    });

    // Step 6: Impacts
    this.els.btnUndoImpact.addEventListener('click', function () {
        self._undoLastImpact();
    });
    if (this.els.btnClearImpacts) {
        this.els.btnClearImpacts.addEventListener('click', function () {
            self._clearAllImpacts();
        });
    }
    this.els.btnCalculate.addEventListener('click', function () {
        self._calculate();
    });

    // Back controls (steps 2–7) — correct an earlier entry without
    // restarting the whole session
    var backBtns = document.querySelectorAll('.btn-step-back');
    for (var bk = 0; bk < backBtns.length; bk++) {
        backBtns[bk].addEventListener('click', function () {
            self._prevStep();
        });
    }

    // Step 7: Results
    if (this.els.btnSaveSession) {
        this.els.btnSaveSession.addEventListener('click', function () {
            self._saveSession();
        });
    }
    this.els.btnSaveImage.addEventListener('click', function () {
        self._saveImage();
    });
    this.els.btnShare.addEventListener('click', function () {
        self._shareImage();
    });
    this.els.btnNewFromResults.addEventListener('click', function () {
        self.reset();
    });
    if (this.els.btnCropImage) {
        this.els.btnCropImage.addEventListener('click', function () {
            self._toggleCropMode();
        });
    }

    // Print/Share Target — the branded Proven Data Target (v2.4 §2.9);
    // the classic canvas target remains only as the no-jsPDF fallback.
    if (this.els.btnPrintTarget) {
        this.els.btnPrintTarget.addEventListener('click', function () {
            if (typeof TargetPDF !== 'undefined' && TargetPDF.paperTarget &&
                window.jspdf && window.jspdf.jsPDF) {
                TargetPDF.paperTarget('letter');
            } else {
                self._printBlankTarget();
            }
        });
    }
    if (this.els.btnShareTarget) {
        this.els.btnShareTarget.addEventListener('click', function () {
            if (typeof TargetPDF !== 'undefined' && TargetPDF.paperTarget &&
                window.jspdf && window.jspdf.jsPDF) {
                TargetPDF.paperTarget('letter'); // _sharePdf uses the share sheet when available
            } else {
                self._shareBlankTarget();
            }
        });
    }
};

// ── Step 2: Image Loading ──────────────────────────────────────

SessionFlow.prototype._onImageSelected = function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;

    var self = this;
    loadImageFromFile(file).then(function (img) {
        self.image = img;
        self.canvas.loadImage(img);
        if (self.els.canvasWatermark) self.els.canvasWatermark.classList.add('hidden');
        self._nextStep(); // move to calibrate step

        // Try auto-detection of yorT target; fall back to manual if it fails.
        self._tryAutoCalibration(img);
    }).catch(function (err) {
        alert('Failed to load image: ' + err.message);
    });

    // Reset the input so the same file can be re-selected
    e.target.value = '';
};

/**
 * Attempt ArUco-based auto-calibration. If all 4 markers detect, warp the
 * image flat and set scale from the known 6.0" grid. Otherwise fall back
 * to manual two-point calibration.
 */
SessionFlow.prototype._tryAutoCalibration = function (img) {
    var self = this;

    // If library failed to load, skip straight to manual
    if (typeof ArucoCalibration === 'undefined' || window.__arucoLoadFailed) {
        self._startCalibration();
        return;
    }

    var ac = new ArucoCalibration();
    if (!ac.isReady()) {
        self._startCalibration();
        return;
    }

    self.els.calibrationStatus.textContent = 'Looking for Proven target markers…';
    self._hideEl(self.els.btnRedoCalibration);
    self._hideEl(self.els.btnNextCalibration);
    self._hideEl(self.els.btnManualCalibration);

    // Run detection on the next tick so the status text renders first
    setTimeout(function () {
        var result;
        try {
            result = ac.detect(img);
        } catch (err) {
            console.warn('[ArUco] Detection threw:', err);
            self._fallbackToManual('Detection error — set scale manually.');
            return;
        }

        if (!result.success) {
            self._fallbackToManual('No Proven target detected — set scale manually.');
            return;
        }

        // All 4 markers found — warp flat
        try {
            var warp = ac.warpFlat(img, result.markers, 120);
            // Replace the source image with a flattened version (cast canvas to image-like by drawing once more)
            var flatImg = warp.canvas;
            self.image = flatImg;
            self.canvas.loadImage(flatImg);

            // Set calibration as complete using the known scale
            self.calibration.state = 'complete';
            self.calibration.pixelsPerInch = warp.pixelsPerInch;
            self.calibration.pointA = { x: warp.gridStartPx, y: warp.gridStartPx };
            self.calibration.pointB = { x: warp.gridStartPx + warp.pixelsPerInch, y: warp.gridStartPx };

            // No on-image calibration markers — show overlay status only
            self.canvas.calibrationLine = null;
            self.canvas.render();

            self.els.calibrationStatus.innerHTML = '<span class="chip is-go">' + Icon('check', 14) + 'Verified</span> Proven target detected &mdash; auto-scaled (' + warp.pixelsPerInch.toFixed(0) + ' px/in)';
            self._showEl(self.els.btnRedoCalibration);
            self._showEl(self.els.btnNextCalibration);
            self._showEl(self.els.btnManualCalibration);
            self.canvas.setHint('');
        } catch (err) {
            console.error('[ArUco] Warp failed:', err);
            self._fallbackToManual('Auto-scale failed — set scale manually.');
        }
    }, 30);
};

SessionFlow.prototype._fallbackToManual = function (message) {
    if (message && this.els.calibrationStatus) {
        this.els.calibrationStatus.textContent = message;
    }
    this._startCalibration();
};

// ── Step 3: Calibration ────────────────────────────────────────

SessionFlow.prototype._startCalibration = function () {
    this.calibration.start();
    this._removeMarkersOfType('calibration');
    this.canvas.calibrationLine = null;
    this.canvas.render();

    this.els.calibrationStatus.textContent = 'Zoom into a known 1-inch reference, then tap Point A';
    this._hideEl(this.els.btnRedoCalibration);
    this._hideEl(this.els.btnNextCalibration);
    this._hideEl(this.els.btnManualCalibration);
    this._updateHint();
};

// ── Step 4: Data ───────────────────────────────────────────────

SessionFlow.prototype._validateDataInputs = function () {
    var d = parseFloat(this.els.inputDistance.value);
    var b = parseFloat(this.els.inputBulletDia.value);
    var validD = d > 0 && d <= 1500;
    var validB = b > 0 && b <= 1.0;
    var valid = validD && validB;
    this.els.btnNextData.disabled = !valid;

    // Show hint about what's missing
    var hint = this.els.dataValidationHint;
    if (hint) {
        if (valid) {
            hint.textContent = '';
        } else {
            var missing = [];
            if (!validD) missing.push('distance (1–1500 yds)');
            if (!validB) missing.push('bullet diameter');
            hint.textContent = 'Enter ' + missing.join(' and ') + ' to continue';
        }
    }
};

SessionFlow.prototype._updatePresetHighlight = function () {
    var val = this.els.inputBulletDia.value;
    var presetBtns = document.querySelectorAll('.preset-btn');
    for (var i = 0; i < presetBtns.length; i++) {
        var btn = presetBtns[i];
        if (btn.getAttribute('data-value') === val) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    }
};

SessionFlow.prototype._confirmData = function () {
    this.distanceYards = parseFloat(this.els.inputDistance.value);
    this.bulletDiameter = parseFloat(this.els.inputBulletDia.value);

    // Set bullet diameter in canvas pixels for impact marker sizing
    if (this.calibration.pixelsPerInch > 0) {
        this.canvas.bulletDiameterPx = this.bulletDiameter * this.calibration.pixelsPerInch;
    }

    // Collect optional fields
    this.roundsFired = parseInt(this.els.inputRoundsFired.value, 10) || 0;
    this.measuredVelocity = parseFloat(this.els.inputVelocity.value) || null;

    // Collect weather snapshot
    var tempF = parseFloat(this.els.inputTemp.value);
    var humidity = parseFloat(this.els.inputHumidity.value);
    var windMph = parseFloat(this.els.inputWindMph.value);
    var windDir = this.els.inputWindDir.value.trim();
    var altitudeFt = parseFloat(this.els.inputAltitude.value);
    var pressureInHg = parseFloat(this.els.inputPressure.value);

    var hasWeather = !isNaN(tempF) || !isNaN(humidity) || !isNaN(windMph) || windDir || !isNaN(altitudeFt) || !isNaN(pressureInHg);
    if (hasWeather) {
        this.weather = {
            tempF: !isNaN(tempF) ? tempF : null,
            humidity: !isNaN(humidity) ? humidity : null,
            windMph: !isNaN(windMph) ? windMph : null,
            windDir: windDir || null,
            altitudeFt: !isNaN(altitudeFt) ? altitudeFt : null,
            pressureInHg: !isNaN(pressureInHg) ? pressureInHg : null
        };
    } else {
        this.weather = null;
    }

    this._nextStep();
    this._updateHint();
};

// ── Step 5: POA ────────────────────────────────────────────────

SessionFlow.prototype._placePOA = function (point) {
    this.poa = { x: point.x, y: point.y };
    this._removeMarkersOfType('poa');
    this.canvas.markers.push({ type: 'poa', point: this.poa });
    this.canvas.render();

    this.els.poaStatus.textContent = 'Point of aim placed';
    this._showEl(this.els.btnRedoPoa);
    this._showEl(this.els.btnNextPoa);
    this.canvas.setHint('');
    this._scrollPanelToBottom();
};

// ── Step 6: Impacts ────────────────────────────────────────────

SessionFlow.prototype._placeImpact = function (point) {
    if (this.impacts.length >= MAX_IMPACTS) return;

    var num = this.impacts.length + 1;
    this.impacts.push({ x: point.x, y: point.y, shotNumber: num });

    this.canvas.markers.push({
        type: 'impact',
        point: { x: point.x, y: point.y },
        number: num
    });
    this.canvas.render();

    this._updateImpactUI();
};

SessionFlow.prototype._undoLastImpact = function () {
    if (this.impacts.length === 0) return;
    this.impacts.pop();

    // Remove the last impact marker
    for (var i = this.canvas.markers.length - 1; i >= 0; i--) {
        if (this.canvas.markers[i].type === 'impact') {
            this.canvas.markers.splice(i, 1);
            break;
        }
    }
    this.canvas.render();
    this._updateImpactUI();
};

SessionFlow.prototype._clearAllImpacts = function () {
    if (this.impacts.length === 0) return;
    this.impacts = [];
    // Remove all impact markers
    this.canvas.markers = this.canvas.markers.filter(function (m) {
        return m.type !== 'impact';
    });
    this.canvas.render();
    this._updateImpactUI();
};

SessionFlow.prototype._updateImpactUI = function () {
    var count = this.impacts.length;
    this.els.impactStatus.textContent = 'Tap each bullet hole (' + count + '/' + MAX_IMPACTS + ')';
    this.els.btnUndoImpact.disabled = count === 0;
    if (this.els.btnClearImpacts) this.els.btnClearImpacts.disabled = count === 0;
    this.els.btnCalculate.disabled = count < 2;

    if (count >= MAX_IMPACTS) {
        this.canvas.setHint('Maximum ' + MAX_IMPACTS + ' impacts reached');
    } else {
        this.canvas.setHint('Tap impact #' + (count + 1));
    }
};

// ── Step 7: Calculate & Display ────────────────────────────────

SessionFlow.prototype._calculate = function () {
    if (this.impacts.length < 2) return;

    try {
        this.results = calculateSession({
            impacts: this.impacts,
            poa: this.poa,
            pixelsPerInch: this.calibration.pixelsPerInch,
            bulletDiameter: this.bulletDiameter,
            distanceYards: this.distanceYards
        });
    } catch (err) {
        alert('Calculation error: ' + err.message);
        return;
    }

    // Compute cold-bore (shot #1) offset from POA — used by cold-bore tracking
    this.coldBore = null;
    if (this.poa && this.impacts.length > 0 && this.impacts[0].shotNumber === 1) {
        this.coldBore = calculateShotOffset(
            this.impacts[0],
            this.poa,
            this.calibration.pixelsPerInch,
            this.distanceYards
        );
    }

    // Remove calibration markers and line — they served their purpose
    this._removeMarkersOfType('calibration');
    this.canvas.calibrationLine = null;

    // Add centroid marker
    this._removeMarkersOfType('centroid');
    this.canvas.markers.push({
        type: 'centroid',
        point: { x: this.results.centroid.x, y: this.results.centroid.y }
    });

    // Attach rifle name to results for overlay display
    this.results.rifleName = this.selectedRifle ? this.selectedRifle.name : null;

    // Show draggable results overlay on canvas
    this.canvas.overlayResults = this.results;
    this.canvas.overlayPos = null; // will auto-place near group on first render
    this.canvas.overlayScale = 1.0;
    this.canvas.render();

    this._renderResults();
    this._nextStep();
    this.canvas.setHint('');

    // Re-render after step transition to ensure overlay draws on visible canvas
    // Step panel content change can resize the canvas container
    var self = this;
    setTimeout(function () {
        self.canvas._refitPreservingCenter(); // calls _resize() internally
    }, 150);
};

SessionFlow.prototype._renderResults = function () {
    var r = this.results;
    var card = this.els.resultsCard;

    var html = '';

    // Zero Guardian verdict banner (populated after innerHTML below) —
    // verdict first, numbers under: the banner leads the whole card
    html += '<div id="zero-guardian-banner" class="u-mb-12"></div>';

    // HERO — group size as the dominant instrument
    html += '<div class="plate">';
    html += '<div class="instrument">';
    html += '<div class="instrument-label">Group size <button class="hint-btn" onclick="showHelp(\'moa\')" title="What is MOA?">?</button></div>';
    html += '<div class="instrument-value t-display">' + formatFixed(r.groupSizeMOA, 2) + '<span class="instrument-unit">MOA</span></div>';
    html += '<div class="t-micro">' + formatFixed(r.groupSizeInches, 3) + '&Prime; extreme spread &middot; ' + r.shotCount + ' shots @ ' + r.distanceYards + ' yds</div>';
    html += '</div>';
    html += '<div class="stat-strip">';
    html += '<div class="instrument"><div class="instrument-label">Mean radius <button class="hint-btn" onclick="showHelp(\'meanRadius\')" title="What is Mean Radius?">?</button></div>';
    html += '<div class="instrument-value">' + formatFixed(r.meanRadiusMOA, 2) + '<span class="instrument-unit">MOA</span></div></div>';
    html += '<div class="instrument"><div class="instrument-label">Vertical</div>';
    html += '<div class="instrument-value">' + formatFixed(r.verticalSpreadMOA, 2) + '<span class="instrument-unit">MOA</span></div></div>';
    html += '<div class="instrument"><div class="instrument-label">Horizontal</div>';
    html += '<div class="instrument-value">' + formatFixed(r.horizontalSpreadMOA, 2) + '<span class="instrument-unit">MOA</span></div></div>';
    html += '</div></div>';

    // Adjust to Zero — the dial the shooter came for
    html += '<div class="plate u-mt-10">';
    html += '<div class="instrument-label">Adjust to zero <button class="hint-btn" onclick="showHelp(\'atz\')" title="What is ATZ?">?</button></div>';
    html += '<div class="stat-strip">';
    html += '<div class="instrument"><div class="instrument-label">' + r.atzElevationDir + '</div>';
    html += '<div class="instrument-value">' + formatFixed(r.atzElevationMOA, 2) + '<span class="instrument-unit">MOA</span></div></div>';
    html += '<div class="instrument"><div class="instrument-label">' + r.atzWindageDir + '</div>';
    html += '<div class="instrument-value">' + formatFixed(r.atzWindageMOA, 2) + '<span class="instrument-unit">MOA</span></div></div>';
    html += '</div></div>';

    // Every remaining number lives below the fold
    html += '<details class="fold u-mt-10">';
    html += '<summary>All stats</summary>';
    html += '<div class="fold-body">';
    html += '<div class="spec-row"><span class="spec-key">Extreme spread</span><span class="spec-val">' + formatFixed(r.groupSizeInches, 3) + '&Prime; / ' + formatFixed(r.groupSizeMOA, 2) + ' MOA</span></div>';
    html += '<div class="spec-row"><span class="spec-key">Mean radius</span><span class="spec-val">' + formatFixed(r.meanRadiusInches, 3) + '&Prime; / ' + formatFixed(r.meanRadiusMOA, 2) + ' MOA</span></div>';
    html += '<div class="spec-row"><span class="spec-key">Vertical spread</span><span class="spec-val">' + formatFixed(r.verticalSpreadInches, 3) + '&Prime; / ' + formatFixed(r.verticalSpreadMOA, 2) + ' MOA</span></div>';
    html += '<div class="spec-row"><span class="spec-key">Horizontal spread</span><span class="spec-val">' + formatFixed(r.horizontalSpreadInches, 3) + '&Prime; / ' + formatFixed(r.horizontalSpreadMOA, 2) + ' MOA</span></div>';
    var elevSign = r.elevationOffsetInches >= 0 ? 'High' : 'Low';
    html += '<div class="spec-row"><span class="spec-key">Elevation offset</span><span class="spec-val">' + formatFixed(Math.abs(r.elevationOffsetInches), 3) + '&Prime; ' + elevSign + ' / ' + formatFixed(r.elevationOffsetMOA, 2) + ' MOA</span></div>';
    var windSign = r.windageOffsetInches >= 0 ? 'Right' : 'Left';
    html += '<div class="spec-row"><span class="spec-key">Windage offset</span><span class="spec-val">' + formatFixed(Math.abs(r.windageOffsetInches), 3) + '&Prime; ' + windSign + ' / ' + formatFixed(r.windageOffsetMOA, 2) + ' MOA</span></div>';

    // Advanced statistics (only when computed)
    if (r.cepInches != null) {
        html += '<div class="spec-row"><span class="spec-key">CEP (50%) <button class="hint-btn" onclick="showHelp(\'cep\')" title="What is CEP?">?</button></span><span class="spec-val">' + formatFixed(r.cepInches, 3) + '&Prime; / ' + formatFixed(r.cepMOA, 2) + ' MOA</span></div>';
        html += '<div class="spec-row"><span class="spec-key">Radial SD <button class="hint-btn" onclick="showHelp(\'radialSD\')" title="What is Radial SD?">?</button></span><span class="spec-val">' + formatFixed(r.radialSDInches, 3) + '&Prime; / ' + formatFixed(r.radialSDMOA, 2) + ' MOA</span></div>';
        html += '<div class="spec-row"><span class="spec-key">Vertical SD</span><span class="spec-val">' + formatFixed(r.verticalSDInches, 3) + '&Prime; / ' + formatFixed(r.verticalSDMOA, 2) + ' MOA</span></div>';
        html += '<div class="spec-row"><span class="spec-key">Horizontal SD</span><span class="spec-val">' + formatFixed(r.horizontalSDInches, 3) + '&Prime; / ' + formatFixed(r.horizontalSDMOA, 2) + ' MOA</span></div>';
        var meanElevSign = r.meanElevationInches >= 0 ? 'High' : 'Low';
        html += '<div class="spec-row"><span class="spec-key">Mean elevation</span><span class="spec-val">' + formatFixed(Math.abs(r.meanElevationInches), 3) + '&Prime; ' + meanElevSign + ' / ' + formatFixed(r.meanElevationMOA, 2) + ' MOA</span></div>';
        var meanWindSign = r.meanWindageInches >= 0 ? 'Right' : 'Left';
        html += '<div class="spec-row"><span class="spec-key">Mean windage</span><span class="spec-val">' + formatFixed(Math.abs(r.meanWindageInches), 3) + '&Prime; ' + meanWindSign + ' / ' + formatFixed(r.meanWindageMOA, 2) + ' MOA</span></div>';
    }
    html += '</div></details>';

    card.innerHTML = html;

    // Ladder split (bench tool): enough impacts to form charge groups
    if (typeof ToolRegistry !== 'undefined' && ToolRegistry.isVisible('bench') &&
        typeof LadderManager !== 'undefined' && this.impacts.length >= 4) {
        var ladderBtn = document.createElement('button');
        ladderBtn.className = 'action u-full u-mt-10';
        ladderBtn.innerHTML = this.ladderResult
            ? Icon('check', 18) + ' Ladder attached (re-split)'
            : Icon('flask', 18) + ' Split into ladder groups';
        var flowRef = this;
        ladderBtn.addEventListener('click', function () {
            LadderManager.open(flowRef);
        });
        card.appendChild(ladderBtn);
    }

    // Zero Guardian plain-English verdict (feature-gated inside render);
    // click math silently corrected by the rifle's scope-tracking factor
    if (typeof ZeroGuardian !== 'undefined') {
        ZeroGuardian.render(document.getElementById('zero-guardian-banner'), r,
            this.selectedRifle ? this.selectedRifle.scopeCorrectionFactor : null);
    }
};

// ── Save Session ───────────────────────────────────────────────

SessionFlow.prototype._saveSession = function () {
    if (!this.results || !this.db) return;
    if (this.savedSessionId) return; // already saved
    // Offline saves queue in SyncQueue (Part 0.6 #1) — no online gate.

    // Warn if POA missing — cold-bore tracking needs it
    if (!this.poa) {
        var proceed = confirm("Set your point of aim — it's needed for cold bore tracking.\n\nSave anyway? This session won't count toward cold-bore stats.");
        if (!proceed) return;
    }

    var roundsFired = this.roundsFired || this.impacts.length;

    var sessionData = {
        rifleId: this.rifleId,
        loadId: this.loadId,
        barrelId: this.barrelId,
        date: new Date().toISOString(),
        distanceYards: this.distanceYards,
        roundsFired: roundsFired,
        measuredVelocity: this.measuredVelocity,
        weather: this.weather,
        calibrationData: {
            pixelsPerInch: this.calibration.pixelsPerInch,
            pointA: this.calibration.pointA,
            pointB: this.calibration.pointB
        },
        bulletDiameter: this.bulletDiameter,
        poaPoint: this.poa,
        impacts: this.impacts.slice(),
        results: this.results,
        coldBore: this.coldBore,
        // Zero Guardian: a confirmed verdict marks this as a zero session
        isZeroSession: typeof ZeroGuardian !== 'undefined' && this.poa
            ? ZeroGuardian.isConfirmed(this.results) : false,
        // Suppressor: the per-session question (§2.1). Bare = null.
        suppressorId: this.suppressorId || null,
        // Lot: asked every session; drift computes silently from these tags
        lotNumber: this.lotNumber || null,
        // Legacy two-state tag kept in sync for old analytics surfaces
        config: this.suppressorId ? 'suppressed'
            : (this.selectedRifle && this.selectedRifle.hasConfigs
                ? (this.selectedRifle.activeConfig || 'bare') : null),
        // Ladder test attachment (bench tool)
        sessionType: this.ladderResult ? 'ladder' : null,
        ladder: this.ladderResult || null
    };

    // Store snapshot of rifle/load names for historical reference
    if (this.selectedRifle) {
        sessionData.rifleName = this.selectedRifle.name;
        sessionData.rifleCaliber = this.selectedRifle.caliber;
    }
    if (this.selectedLoad) {
        sessionData.loadName = this.selectedLoad.name;
        sessionData.loadBulletName = this.selectedLoad.bulletName;
        sessionData.loadBulletWeight = this.selectedLoad.bulletWeight;
    }

    var self = this;
    var btn = this.els.btnSaveSession;
    btn.disabled = true;
    btn.textContent = 'Saving…';

    var writeFn = (typeof SyncQueue !== 'undefined' && SyncQueue)
        ? function (fn, data) { return SyncQueue.write(fn, data); }
        : function (fn, data) { return self.db[fn](data); };

    writeFn('addSession', sessionData).then(function (saved) {
        self.savedSessionId = saved.id;
        self.ladderResult = null; // consumed by this save
        btn.innerHTML = Icon('check', 20) + (saved._pending
            ? ' Saved — will sync when you\'re back online'
            : ' Saved to history');
        if (typeof Recents !== 'undefined') Recents.touchSession(saved.id, self.selectedRifle);
        self._storeAnnotatedImage(saved.id);
        // A confirmed zero writes an append-only zero EVENT (§2.10) —
        // the Calibration Status card derives from these. Best-effort.
        if (sessionData.isZeroSession && sessionData.rifleId && self.results) {
            writeFn('addZeroEvent', {
                rifleId: sessionData.rifleId,
                loadId: sessionData.loadId,
                sessionId: saved.id,
                date: sessionData.date,
                distanceYards: sessionData.distanceYards,
                shotCount: (sessionData.impacts || []).length,
                groupData: {
                    groupSizeMOA: self.results.groupSizeMOA,
                    atzElevationMOA: self.results.atzElevationMOA,
                    atzWindageMOA: self.results.atzWindageMOA,
                    meanRadius: self.results.meanRadius
                },
                suppressorId: sessionData.suppressorId,
                lotNumber: sessionData.lotNumber,
                source: 'session'
            }).catch(function (e) { console.warn('[Session] zero event failed:', e); });
            if (typeof Readiness !== 'undefined') Readiness.invalidate(sessionData.rifleId);
        }
        // Sticky defaults: remember the can + latest lot for next time
        if (sessionData.rifleId && typeof Suppressors !== 'undefined') {
            Suppressors.rememberLastUsed(self.db, sessionData.rifleId, sessionData.suppressorId);
        }
        if (self.selectedLoad && sessionData.lotNumber &&
            self.selectedLoad.lotNumber !== sessionData.lotNumber) {
            self.selectedLoad.lotNumber = sessionData.lotNumber;
            self.db.updateLoad(self.selectedLoad).catch(function () {});
        }
        // Handload bookkeeping: a session on a recipe load = one firing
        // on its brass (best-effort, never blocks anything)
        if (self.selectedLoad && self.selectedLoad.recipe && self.selectedLoad.recipe.brass) {
            var recipeLoad = self.selectedLoad;
            recipeLoad.recipe.brass.timesFired = (recipeLoad.recipe.brass.timesFired || 0) + 1;
            self.db.updateLoad(recipeLoad).catch(function () {});
        }
    }).catch(function (err) {
        // Never lose the session silently: it stays on screen, and the
        // user gets an immediate retry.
        btn.disabled = false;
        btn.innerHTML = Icon('check', 20) + ' Save session';
        if (confirm('Save failed: ' + err.message +
            '\n\nYour session is still on screen. Retry the save now?')) {
            self._saveSession();
        }
    });
};

/**
 * Render and store the annotated image + thumbnail for a saved session.
 * Non-fatal: errors are logged but do not affect the saved session.
 */
SessionFlow.prototype._storeAnnotatedImage = function (sessionId) {
    var self = this;
    console.log('[Session] _storeAnnotatedImage called — sessionId:', sessionId);
    console.log('[Session] image:', !!this.image, 'markers:', this.canvas.markers.length, 'results:', !!this.results);

    if (!this.image) {
        console.error('[Session] Cannot store annotated image — this.image is null');
        return;
    }

    try {
        var exportCanvas = this._getExportCanvas();
        console.log('[Session] Export canvas rendered — size:', exportCanvas.width, 'x', exportCanvas.height);

        // §2.9b image compression: cap the stored display version to a
        // 2048px longest edge at JPEG q0.80 — plenty for viewing and
        // shot review, a fraction of a raw phone photo. Shot marking
        // already happened on the full-res in-memory image; this only
        // affects the STORED copy. Full-res is not retained (no feature
        // needs it today).
        var storedCanvas = typeof capCanvasSize === 'function'
            ? capCanvasSize(exportCanvas, 2048) : exportCanvas;
        console.log('[Session] Stored size:', storedCanvas.width, 'x', storedCanvas.height);

        var thumbCanvas = generateThumbnail(storedCanvas, 400);

        Promise.all([
            canvasToJpegBlob(storedCanvas, 0.80),
            canvasToJpegBlob(thumbCanvas, 0.75)
        ]).then(function (blobs) {
            console.log('[Session] Blobs created — full:', blobs[0].size, 'bytes, thumb:', blobs[1].size, 'bytes');
            return (typeof SyncQueue !== 'undefined' && SyncQueue)
                ? SyncQueue.writeImage(sessionId, blobs[0], blobs[1])
                : self.db.saveSessionImage(sessionId, blobs[0], blobs[1]);
        }).then(function (result) {
            if (result && result.queued) {
                console.log('[Session] Image queued — uploads when back online');
                return null;
            }
            console.log('[Session] Annotated image saved to DB successfully');
            // Verification: read it back
            return self.db.getSessionImage(sessionId).then(function (record) {
                if (record && record.fullBlob) {
                    console.log('[Session] Image verified in DB — full blob size:', record.fullBlob.size);
                } else {
                    console.error('[Session] Image verification FAILED — record:', record);
                }
            });
        }).catch(function (err) {
            console.error('[Session] Failed to store annotated image:', err);
        });
    } catch (err) {
        console.error('[Session] Failed to render annotated image:', err);
    }
};

// ── Canvas Tap Routing ─────────────────────────────────────────

SessionFlow.prototype._onCanvasTap = function (point) {
    var step = STEPS[this.currentStep];

    switch (step) {
        case 'calibrate':
            this._onCalibrationTap(point);
            break;
        case 'poa':
            this._placePOA(point);
            break;
        case 'impacts':
            this._placeImpact(point);
            break;
    }
};

SessionFlow.prototype._onCalibrationTap = function (point) {
    var result = this.calibration.handleTap(point);

    if (result.error) {
        this.els.calibrationStatus.textContent = result.error;
        return;
    }

    if (result.state === 'waitingB') {
        // Point A placed
        this.canvas.markers.push({ type: 'calibration', point: { x: point.x, y: point.y }, label: 'A' });
        this.canvas.render();
        this.els.calibrationStatus.textContent = 'Now tap Point B (1 inch from A)';
        this._updateHint();
    }
    else if (result.state === 'complete') {
        // Point B placed, calibration done
        this.canvas.markers.push({ type: 'calibration', point: { x: point.x, y: point.y }, label: 'B' });
        this.canvas.calibrationLine = {
            a: this.calibration.pointA,
            b: this.calibration.pointB
        };
        this.canvas.render();

        var ppi = result.pixelsPerInch;
        this.els.calibrationStatus.textContent = 'Calibrated: ' + formatFixed(ppi, 1) + ' px/in';
        this._showEl(this.els.btnRedoCalibration);
        this._showEl(this.els.btnNextCalibration);
        this._hideEl(this.els.btnManualCalibration);
        this.canvas.setHint('');
        this._scrollPanelToBottom();
    }
};

// ── Crop Mode ──────────────────────────────────────────────────

SessionFlow.prototype._toggleCropMode = function () {
    this.cropMode = !this.cropMode;
    var btn = this.els.btnCropImage;
    var container = document.getElementById('canvas-container');

    if (this.cropMode) {
        // Entering crop mode — clear any previous capture
        this.croppedCanvas = null;
        if (btn) {
            btn.classList.add('active');
            btn.textContent = 'Done Cropping';
        }
        if (container) container.classList.add('crop-mode');
        this.canvas.setHint('Zoom & pan to frame your image');
    } else {
        // Exiting crop mode — capture the viewport NOW before UI changes
        this.croppedCanvas = this.canvas.captureViewport();
        if (btn) {
            btn.classList.remove('active');
            btn.textContent = 'Crop';
        }
        if (container) container.classList.remove('crop-mode');
        this.canvas.setHint('');
    }
};

/**
 * Returns the export canvas — cropped viewport if crop mode is on,
 * otherwise the full annotated image render.
 */
SessionFlow.prototype._getExportCanvas = function () {
    // If user cropped, use the captured viewport snapshot
    if (this.croppedCanvas) {
        return this.croppedCanvas;
    }
    // If actively in crop mode (hasn't hit Done yet), capture live viewport
    if (this.cropMode) {
        return this.canvas.captureViewport();
    }
    // Full annotated image — filter out calibration markers (already removed
    // in _calculate, but guard against any stragglers)
    var markers = this.canvas.markers.filter(function (m) {
        return m.type !== 'calibration';
    });
    return renderAnnotatedImage(
        this.image,
        markers,
        null, // no calibration line in export
        this.canvas.bulletDiameterPx,
        this.results,
        this.canvas.overlayPos,
        this.canvas.overlayScale
    );
};

// ── Export Actions ──────────────────────────────────────────────

SessionFlow.prototype._saveImage = function () {
    if (!this.results) return;

    var exportCanvas = this._getExportCanvas();

    exportCanvas.toBlob(function (blob) {
        if (!blob) return;
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'ballistic-group-' + Date.now() + '.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 'image/png');
};

SessionFlow.prototype._shareImage = function () {
    if (!this.results) return;

    var exportCanvas = this._getExportCanvas();

    exportCanvas.toBlob(function (blob) {
        if (!blob) return;

        if (navigator.share && navigator.canShare) {
            var file = new File([blob], 'ballistic-group.png', { type: 'image/png' });
            var shareData = { files: [file] };
            if (navigator.canShare(shareData)) {
                navigator.share(shareData).catch(function () {});
                return;
            }
        }
        // Fallback to save
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'ballistic-group-' + Date.now() + '.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 'image/png');
};

// ── Print / Share Blank Target ─────────────────────────────────

var BLANK_TARGET_URL = 'assets/yorT-target.pdf';
var BLANK_TARGET_FILENAME = 'yorT-target.pdf';

/**
 * Print the blank yorT target PDF at actual size (100% scale).
 * Loads the PDF in a hidden iframe and calls its print(), which surfaces
 * the device's native print sheet. On mobile this exposes any wireless
 * printer the system has registered.
 */
SessionFlow.prototype._printBlankTarget = function () {
    var btn = this.els.btnPrintTarget;
    if (btn) {
        btn.disabled = true;
        var origText = btn.innerHTML;
        btn.textContent = 'Opening print…';
        setTimeout(function () {
            btn.disabled = false;
            btn.innerHTML = origText;
        }, 4000);
    }

    // Inject a print-scope style block that forces actual size
    var styleId = '__yort_print_actual_size';
    if (!document.getElementById(styleId)) {
        var styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.media = 'print';
        styleEl.textContent = '@page { size: auto; margin: 0; }';
        document.head.appendChild(styleEl);
    }

    // Reuse a single hidden iframe so repeated taps don't pile up
    var iframeId = '__yort_print_iframe';
    var existing = document.getElementById(iframeId);
    if (existing) existing.parentNode.removeChild(existing);

    var iframe = document.createElement('iframe');
    iframe.id = iframeId;
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    iframe.src = BLANK_TARGET_URL + '#zoom=100&toolbar=0';

    iframe.onload = function () {
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (err) {
            // Cross-origin or PDF viewer can't be programmatically printed
            // — fall back to opening the PDF in a new tab so the user can
            // tap the system Share/Print menu themselves.
            console.warn('[Print] iframe.print failed:', err);
            window.open(BLANK_TARGET_URL, '_blank');
        }
    };

    document.body.appendChild(iframe);
};

/**
 * Share the blank yorT target PDF via the OS share sheet.
 * Falls back to download/open when Web Share for files is unavailable.
 */
SessionFlow.prototype._shareBlankTarget = function () {
    var btn = this.els.btnShareTarget;
    if (btn) {
        btn.disabled = true;
        var origText = btn.innerHTML;
        var restore = function () { btn.disabled = false; btn.innerHTML = origText; };
        setTimeout(restore, 4000);
    }

    fetch(BLANK_TARGET_URL).then(function (res) {
        if (!res.ok) throw new Error('PDF not available (' + res.status + ')');
        return res.blob();
    }).then(function (blob) {
        var file = new File([blob], BLANK_TARGET_FILENAME, { type: 'application/pdf' });
        var shareData = { files: [file], title: 'Proven Target', text: 'Proven printable target' };

        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
            return navigator.share(shareData).catch(function (err) {
                // User-cancelled share is normal — swallow silently
                if (err && err.name !== 'AbortError') {
                    console.warn('[Share] navigator.share failed:', err);
                    _fallbackDownload(blob);
                }
            });
        }
        // No Web Share with file support — download
        _fallbackDownload(blob);
    }).catch(function (err) {
        console.error('[Share] Failed to load target PDF:', err);
        alert('Could not open the target PDF.');
    });

    function _fallbackDownload(blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = BLANK_TARGET_FILENAME;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
};

// ── Weather Fetch ──────────────────────────────────────────────

SessionFlow.prototype._fetchWeather = function () {
    var self = this;
    var btn = this.els.btnFetchWeather;
    if (!btn) return;

    btn.disabled = true;
    btn.textContent = 'Fetching conditions…';

    NetService.getConditions().then(function (cond) {
        self._fillConditions(cond);
        if (self.els.dataOptionalDetails) {
            self.els.dataOptionalDetails.setAttribute('open', '');
        }
        btn.innerHTML = Icon('check', 18) + ' Conditions updated';
        setTimeout(function () {
            btn.disabled = false;
            btn.innerHTML = Icon('cloud', 18) + ' Get weather';
        }, 2000);
    }).catch(function (err) {
        btn.disabled = false;
        btn.innerHTML = Icon('cloud', 18) + ' Get weather';
        alert(err.code === 'denied' ? 'Location access denied. Enable location to fetch weather.' :
            err.code === 'unsupported' ? 'Geolocation is not supported by your browser.' :
            'Failed to fetch weather data.');
    });
};

/**
 * Write a NetService conditions snapshot into the weather inputs.
 */
SessionFlow.prototype._fillConditions = function (cond) {
    if (!cond) return;
    if (cond.temperature !== null && this.els.inputTemp) this.els.inputTemp.value = cond.temperature;
    if (cond.humidity !== null && this.els.inputHumidity) this.els.inputHumidity.value = cond.humidity;
    if (cond.pressure !== null && this.els.inputPressure) this.els.inputPressure.value = cond.pressure.toFixed(2);
    if (cond.windSpeed !== null && this.els.inputWindMph) this.els.inputWindMph.value = cond.windSpeed;
    if (cond.windDirection !== null && this.els.inputWindDir) this.els.inputWindDir.value = cond.windDirection;
    if (cond.altitude !== null && this.els.inputAltitude) this.els.inputAltitude.value = cond.altitude;
};

/**
 * Auto-conditions: silently fill the weather fields when entering the
 * data step, so the shooter types nothing. Feature-gated; skips when
 * any field already holds a value; location denial degrades silently
 * to the manual form.
 */
SessionFlow.prototype._autoConditions = function () {
    var self = this;
    if (typeof hasFeature !== 'function' || !hasFeature('autoConditions')) return;
    if (typeof NetService === 'undefined') return;

    var fields = [this.els.inputTemp, this.els.inputHumidity, this.els.inputPressure,
        this.els.inputWindMph, this.els.inputWindDir, this.els.inputAltitude];
    for (var i = 0; i < fields.length; i++) {
        if (fields[i] && fields[i].value !== '') return; // user already entered data
    }

    NetService.getConditions().then(function (cond) {
        self._fillConditions(cond);
        var btn = self.els.btnFetchWeather;
        if (btn) btn.innerHTML = Icon('check', 18) + ' Auto-filled &middot; tap to refresh';
    }).catch(function () {
        // Silent: manual entry stays available
    });
};

// ── Helpers ────────────────────────────────────────────────────

SessionFlow.prototype._scrollPanelToBottom = function () {
    var panel = document.getElementById('step-panel');
    if (panel) {
        setTimeout(function () {
            panel.scrollTop = panel.scrollHeight;
        }, 50);
    }
};

SessionFlow.prototype._removeMarkersOfType = function (type) {
    this.canvas.markers = this.canvas.markers.filter(function (m) {
        return m.type !== type;
    });
};

SessionFlow.prototype._showEl = function (el) {
    if (el) el.classList.remove('hidden');
};

SessionFlow.prototype._hideEl = function (el) {
    if (el) el.classList.add('hidden');
};
