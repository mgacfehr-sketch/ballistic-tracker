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
        this.els.btnCropImage.textContent = 'Crop Image';
    }
    var canvasContainer = document.getElementById('canvas-container');
    if (canvasContainer) canvasContainer.classList.remove('crop-mode');

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

    // Reset weather button
    if (this.els.btnFetchWeather) {
        this.els.btnFetchWeather.disabled = false;
        this.els.btnFetchWeather.textContent = 'Get Current Weather';
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

    // Auto-fill conditions when entering the data step (feature-gated)
    if (stepName === 'data') {
        this._autoConditions();
    }

    // Set canvas hints per step
    this._updateHint();

    // Auto-scroll panel so action buttons are visible
    this._scrollPanelToBottom();
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
    if (this.currentStep <= 0) return;
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
    var self = this;
    var html = '';

    // Quick Start buttons (beta feature)
    if (typeof isBetaEnabled === 'function' && isBetaEnabled('quickStart') && groups.length > 0) {
        html += '<div class="quick-start-section">';
        html += '<div class="quick-start-label">Quick Start</div>';
        for (var q = 0; q < groups.length; q++) {
            var qr = groups[q].rifle;
            var qloads = groups[q].loads;
            if (qloads.length === 0) continue;
            // Use first load as default
            var ql = qloads[0];
            html += '<button class="quick-start-btn" data-rifle-id="' + escapeAttr(qr.id) + '" data-load-id="' + escapeAttr(ql.id) + '">';
            html += '<span class="quick-start-btn-name">' + escapeHtml(qr.name) + '</span>';
            html += '<span class="quick-start-btn-sub">' + escapeHtml(qr.caliber) + ' &middot; ' + escapeHtml(ql.name) + '</span>';
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

    // Print Target — open PDF in hidden iframe and trigger print at actual size
    if (this.els.btnPrintTarget) {
        this.els.btnPrintTarget.addEventListener('click', function () {
            self._printBlankTarget();
        });
    }

    // Share Blank Target — Web Share API, fall back to download
    if (this.els.btnShareTarget) {
        this.els.btnShareTarget.addEventListener('click', function () {
            self._shareBlankTarget();
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
        if (self.els.canvasWatermark) self.els.canvasWatermark.style.display = 'none';
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

    self.els.calibrationStatus.textContent = 'Looking for yorT target markers…';
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
            self._fallbackToManual('No yorT target detected — set scale manually.');
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

            self.els.calibrationStatus.innerHTML = '✅ yorT target detected — auto-scaled (' + warp.pixelsPerInch.toFixed(0) + ' px/in)';
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

    // Zero Guardian verdict banner (populated after innerHTML below)
    html += '<div id="zero-guardian-banner"></div>';

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
        html += '<span class="result-label">Radial SD <button class="help-btn" onclick="showHelp(\'radialSD\')" title="What is Radial SD?">?</button></span>';
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

    // Zero Guardian plain-English verdict (feature-gated inside render)
    if (typeof ZeroGuardian !== 'undefined') {
        ZeroGuardian.render(document.getElementById('zero-guardian-banner'), r);
    }
};

// ── Save Session ───────────────────────────────────────────────

SessionFlow.prototype._saveSession = function () {
    if (!this.results || !this.db) return;
    if (this.savedSessionId) return; // already saved
    if (typeof OfflineCache !== 'undefined' && !OfflineCache.isOnline()) {
        alert('Session saving requires an internet connection.');
        return;
    }

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
            ? ZeroGuardian.isConfirmed(this.results) : false
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
        // Never lose the session silently: it stays on screen, and the
        // user gets an immediate retry.
        btn.disabled = false;
        btn.textContent = 'Save Session';
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
            btn.textContent = 'Crop Image';
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
        var origText = btn.textContent;
        btn.textContent = 'Opening print…';
        setTimeout(function () {
            btn.disabled = false;
            btn.textContent = origText;
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
        var origText = btn.textContent;
        var restore = function () { btn.disabled = false; btn.textContent = origText; };
        setTimeout(restore, 4000);
    }

    fetch(BLANK_TARGET_URL).then(function (res) {
        if (!res.ok) throw new Error('PDF not available (' + res.status + ')');
        return res.blob();
    }).then(function (blob) {
        var file = new File([blob], BLANK_TARGET_FILENAME, { type: 'application/pdf' });
        var shareData = { files: [file], title: 'yorT Target', text: 'yorT printable target' };

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
    btn.textContent = 'Fetching conditions...';

    NetService.getConditions().then(function (cond) {
        self._fillConditions(cond);
        if (self.els.dataOptionalDetails) {
            self.els.dataOptionalDetails.setAttribute('open', '');
        }
        btn.textContent = 'Conditions Updated';
        setTimeout(function () {
            btn.disabled = false;
            btn.textContent = 'Get Current Weather';
        }, 2000);
    }).catch(function (err) {
        btn.disabled = false;
        btn.textContent = 'Get Current Weather';
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
        if (btn) btn.textContent = 'Auto-filled · tap to refresh';
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
