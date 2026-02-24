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
    this.impacts = [];         // [{x, y}] image coords, ordered
    this.results = null;       // output from calculateSession

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
        // Global
        btnNewSession: document.getElementById('btn-new-session'),
        canvasWatermark: document.querySelector('.canvas-watermark')
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

    this.canvas.clearImage();
    this.canvas.setHint('');
    if (this.els.canvasWatermark) this.els.canvasWatermark.style.display = '';

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

    // Reset button states
    this._hideEl(this.els.btnRedoCalibration);
    this._hideEl(this.els.btnNextCalibration);
    this._hideEl(this.els.btnRedoPoa);
    this._hideEl(this.els.btnNextPoa);
    if (this.els.btnNextData) this.els.btnNextData.disabled = true;
    if (this.els.btnUndoImpact) this.els.btnUndoImpact.disabled = true;
    if (this.els.btnClearImpacts) this.els.btnClearImpacts.disabled = true;
    if (this.els.btnCalculate) this.els.btnCalculate.disabled = true;
    if (this.els.btnSaveSession) {
        this.els.btnSaveSession.disabled = false;
        this.els.btnSaveSession.textContent = 'Save Session';
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

    // Set canvas hints per step
    this._updateHint();
};

SessionFlow.prototype._nextStep = function () {
    if (this.currentStep < STEPS.length - 1) {
        this._showStep(this.currentStep + 1);
    }
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

    if (!this.db) {
        picker.innerHTML = '<p class="empty-state-sub">Database not available</p>';
        return;
    }

    var self = this;
    this.db.getAllRifles().then(function (rifles) {
        if (rifles.length === 0) {
            picker.innerHTML =
                '<div class="empty-state" style="padding:16px 0;">' +
                '<p class="empty-state-text">No rifles configured</p>' +
                '<p class="empty-state-sub" style="margin-bottom:12px;">Create a rifle and load profile to track your data, or use Quick Mode below.</p>' +
                '<button class="btn btn-primary btn-sm" id="btn-go-profiles">Go to Profiles</button>' +
                '</div>';
            var goBtn = document.getElementById('btn-go-profiles');
            if (goBtn) {
                goBtn.addEventListener('click', function () {
                    var profilesTab = document.querySelector('.nav-tab[data-view="profiles"]');
                    if (profilesTab) profilesTab.click();
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
    var html = '';

    for (var g = 0; g < groups.length; g++) {
        var rifle = groups[g].rifle;
        var loads = groups[g].loads;

        loads.sort(function (a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });

        html += '<div class="picker-rifle-group">';
        html += '<div class="picker-rifle-name">' + escapeHtml(rifle.name) + ' <span style="color:var(--text-muted);font-weight:400;">' + escapeHtml(rifle.caliber) + '</span></div>';

        if (loads.length === 0) {
            html += '<p class="empty-state-sub" style="padding:4px 0;">No loads — add one in Profiles</p>';
        } else {
            for (var l = 0; l < loads.length; l++) {
                var ld = loads[l];
                html += '<button class="picker-load-btn" data-rifle-id="' + escapeAttr(rifle.id) + '" data-load-id="' + escapeAttr(ld.id) + '">';
                html += escapeHtml(ld.name);
                html += '<span class="picker-load-sub">' + ld.bulletWeight + 'gr &middot; ' + ld.bulletDiameter + '&quot;</span>';
                html += '</button>';
            }
        }
        html += '</div>';
    }

    picker.innerHTML = html;

    // Bind load buttons
    var self = this;
    var btns = picker.querySelectorAll('.picker-load-btn');
    for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function () {
            var rId = this.getAttribute('data-rifle-id');
            var lId = this.getAttribute('data-load-id');
            self._selectProfile(rId, lId);
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

        self._validateDataInputs();
        self._nextStep();
    });
};

SessionFlow.prototype._selectQuickMode = function () {
    this.rifleId = null;
    this.loadId = null;
    this.barrelId = null;
    this.selectedRifle = null;
    this.selectedLoad = null;
    this._nextStep();
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

    // Global new session
    this.els.btnNewSession.addEventListener('click', function () {
        self.reset();
    });
};

// ── Step 2: Image Loading ──────────────────────────────────────

SessionFlow.prototype._onImageSelected = function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;

    var self = this;
    loadImageFromFile(file).then(function (img) {
        self.image = img;
        self.canvas.loadImage(img);
        if (self.els.canvasWatermark) self.els.canvasWatermark.style.display = 'none';
        self._startCalibration();
        self._nextStep();
    }).catch(function (err) {
        alert('Failed to load image: ' + err.message);
    });

    // Reset the input so the same file can be re-selected
    e.target.value = '';
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
};

// ── Step 6: Impacts ────────────────────────────────────────────

SessionFlow.prototype._placeImpact = function (point) {
    if (this.impacts.length >= MAX_IMPACTS) return;

    this.impacts.push({ x: point.x, y: point.y });
    var num = this.impacts.length;

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

    // Add centroid marker
    this._removeMarkersOfType('centroid');
    this.canvas.markers.push({
        type: 'centroid',
        point: { x: this.results.centroid.x, y: this.results.centroid.y }
    });

    // Show draggable results overlay on canvas
    this.canvas.overlayResults = this.results;
    this.canvas.overlayPos = null; // will default to bottom-right on first render
    this.canvas.render();

    this._renderResults();
    this._nextStep();
    this.canvas.setHint('');
};

SessionFlow.prototype._renderResults = function () {
    var r = this.results;
    var card = this.els.resultsCard;

    var html = '';

    // Group size
    html += '<div class="result-section-title">Group Size</div>';
    html += '<div class="result-row highlight">';
    html += '<span class="result-label">Extreme Spread <button class="help-btn" onclick="showHelp(\'moa\')" title="What is MOA?">?</button></span>';
    html += '<span class="result-value">' + formatFixed(r.groupSizeInches, 3) + '&quot; / ' + formatFixed(r.groupSizeMOA, 2) + ' MOA</span>';
    html += '</div>';
    html += '<div class="result-row">';
    html += '<span class="result-label">Mean Radius <button class="help-btn" onclick="showHelp(\'meanRadius\')" title="What is Mean Radius?">?</button></span>';
    html += '<span class="result-value">' + formatFixed(r.meanRadiusInches, 3) + '&quot; / ' + formatFixed(r.meanRadiusMOA, 2) + ' MOA</span>';
    html += '</div>';

    html += '<div class="result-divider"></div>';

    // Spread
    html += '<div class="result-section-title">Spread</div>';
    html += '<div class="result-row">';
    html += '<span class="result-label">Vertical</span>';
    html += '<span class="result-value">' + formatFixed(r.verticalSpreadInches, 3) + '&quot; / ' + formatFixed(r.verticalSpreadMOA, 2) + ' MOA</span>';
    html += '</div>';
    html += '<div class="result-row">';
    html += '<span class="result-label">Horizontal</span>';
    html += '<span class="result-value">' + formatFixed(r.horizontalSpreadInches, 3) + '&quot; / ' + formatFixed(r.horizontalSpreadMOA, 2) + ' MOA</span>';
    html += '</div>';

    html += '<div class="result-divider"></div>';

    // POA offset
    html += '<div class="result-section-title">POA Offset</div>';
    html += '<div class="result-row">';
    html += '<span class="result-label">Elevation</span>';
    var elevSign = r.elevationOffsetInches >= 0 ? 'High' : 'Low';
    html += '<span class="result-value">' + formatFixed(Math.abs(r.elevationOffsetInches), 3) + '&quot; ' + elevSign + ' / ' + formatFixed(r.elevationOffsetMOA, 2) + ' MOA</span>';
    html += '</div>';
    html += '<div class="result-row">';
    html += '<span class="result-label">Windage</span>';
    var windSign = r.windageOffsetInches >= 0 ? 'Right' : 'Left';
    html += '<span class="result-value">' + formatFixed(Math.abs(r.windageOffsetInches), 3) + '&quot; ' + windSign + ' / ' + formatFixed(r.windageOffsetMOA, 2) + ' MOA</span>';
    html += '</div>';

    html += '<div class="result-divider"></div>';

    // ATZ
    html += '<div class="result-section-title">Adjust to Zero <button class="help-btn" onclick="showHelp(\'atz\')" title="What is ATZ?">?</button></div>';
    html += '<div class="atz-row">';
    html += '<div class="atz-item">';
    html += '<span class="atz-direction">' + r.atzElevationDir + '</span>';
    html += '<span class="atz-value">' + formatFixed(r.atzElevationMOA, 2) + '</span>';
    html += '<span class="atz-unit">MOA</span>';
    html += '</div>';
    html += '<div class="atz-item">';
    html += '<span class="atz-direction">' + r.atzWindageDir + '</span>';
    html += '<span class="atz-value">' + formatFixed(r.atzWindageMOA, 2) + '</span>';
    html += '<span class="atz-unit">MOA</span>';
    html += '</div>';
    html += '</div>';

    // Footer info
    html += '<div class="result-divider"></div>';
    html += '<div class="result-row">';
    html += '<span class="result-label">Shots / Distance</span>';
    html += '<span class="result-value">' + r.shotCount + ' shots @ ' + r.distanceYards + ' yds</span>';
    html += '</div>';

    // Advanced Stats (collapsible)
    if (r.cepInches != null) {
        html += '<details class="session-details">';
        html += '<summary class="session-details-summary">Advanced Stats</summary>';
        html += '<div class="session-details-body">';

        html += '<div class="result-row">';
        html += '<span class="result-label">CEP (50%) <button class="help-btn" onclick="showHelp(\'cep\')" title="What is CEP?">?</button></span>';
        html += '<span class="result-value">' + formatFixed(r.cepInches, 3) + '&quot; / ' + formatFixed(r.cepMOA, 2) + ' MOA</span>';
        html += '</div>';

        html += '<div class="result-row">';
        html += '<span class="result-label">Radial SD</span>';
        html += '<span class="result-value">' + formatFixed(r.radialSDInches, 3) + '&quot; / ' + formatFixed(r.radialSDMOA, 2) + ' MOA</span>';
        html += '</div>';

        html += '<div class="result-divider"></div>';

        html += '<div class="result-row">';
        html += '<span class="result-label">Vertical SD</span>';
        html += '<span class="result-value">' + formatFixed(r.verticalSDInches, 3) + '&quot; / ' + formatFixed(r.verticalSDMOA, 2) + ' MOA</span>';
        html += '</div>';

        html += '<div class="result-row">';
        html += '<span class="result-label">Horizontal SD</span>';
        html += '<span class="result-value">' + formatFixed(r.horizontalSDInches, 3) + '&quot; / ' + formatFixed(r.horizontalSDMOA, 2) + ' MOA</span>';
        html += '</div>';

        html += '<div class="result-divider"></div>';

        var meanElevSign = r.meanElevationInches >= 0 ? 'High' : 'Low';
        html += '<div class="result-row">';
        html += '<span class="result-label">Mean Elevation</span>';
        html += '<span class="result-value">' + formatFixed(Math.abs(r.meanElevationInches), 3) + '&quot; ' + meanElevSign + ' / ' + formatFixed(r.meanElevationMOA, 2) + ' MOA</span>';
        html += '</div>';

        var meanWindSign = r.meanWindageInches >= 0 ? 'Right' : 'Left';
        html += '<div class="result-row">';
        html += '<span class="result-label">Mean Windage</span>';
        html += '<span class="result-value">' + formatFixed(Math.abs(r.meanWindageInches), 3) + '&quot; ' + meanWindSign + ' / ' + formatFixed(r.meanWindageMOA, 2) + ' MOA</span>';
        html += '</div>';

        html += '</div></details>';
    }

    card.innerHTML = html;
};

// ── Save Session ───────────────────────────────────────────────

SessionFlow.prototype._saveSession = function () {
    if (!this.results || !this.db) return;
    if (this.savedSessionId) return; // already saved

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
        results: this.results
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
    btn.textContent = 'Saving...';

    this.db.addSession(sessionData).then(function (saved) {
        self.savedSessionId = saved.id;
        btn.textContent = 'Saved to History';
        self._storeAnnotatedImage(saved.id);
    }).catch(function (err) {
        btn.disabled = false;
        btn.textContent = 'Save Session';
        alert('Failed to save: ' + err.message);
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
        var exportCanvas = renderAnnotatedImage(
            this.image,
            this.canvas.markers,
            this.canvas.calibrationLine,
            this.canvas.bulletDiameterPx,
            this.results,
            this.canvas.overlayPos
        );
        console.log('[Session] Export canvas rendered — size:', exportCanvas.width, 'x', exportCanvas.height);

        var thumbCanvas = generateThumbnail(exportCanvas, 400);
        console.log('[Session] Thumbnail generated — size:', thumbCanvas.width, 'x', thumbCanvas.height);

        Promise.all([
            canvasToJpegBlob(exportCanvas, 0.85),
            canvasToJpegBlob(thumbCanvas, 0.75)
        ]).then(function (blobs) {
            console.log('[Session] Blobs created — full:', blobs[0].size, 'bytes, thumb:', blobs[1].size, 'bytes');
            return self.db.saveSessionImage(sessionId, blobs[0], blobs[1]);
        }).then(function () {
            console.log('[Session] Annotated image saved to DB successfully');
            // Verification: read it back
            return self.db.getSessionImage(sessionId);
        }).then(function (record) {
            if (record && record.fullBlob) {
                console.log('[Session] Image verified in DB — full blob size:', record.fullBlob.size);
            } else {
                console.error('[Session] Image verification FAILED — record:', record);
            }
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
        this.canvas.setHint('');
    }
};

// ── Export Actions ──────────────────────────────────────────────

SessionFlow.prototype._saveImage = function () {
    if (!this.results) return;

    var exportCanvas = renderAnnotatedImage(
        this.image,
        this.canvas.markers,
        this.canvas.calibrationLine,
        this.canvas.bulletDiameterPx,
        this.results,
        this.canvas.overlayPos
    );

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

    var exportCanvas = renderAnnotatedImage(
        this.image,
        this.canvas.markers,
        this.canvas.calibrationLine,
        this.canvas.bulletDiameterPx,
        this.results,
        this.canvas.overlayPos
    );

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

// ── Helpers ────────────────────────────────────────────────────

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
