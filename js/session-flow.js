/**
 * session-flow.js — Step-by-step session workflow controller.
 *
 * Manages the state machine for the core session flow:
 *   LOAD → CALIBRATE → DATA → POA → IMPACTS → RESULTS
 *
 * Coordinates between CanvasManager, CalibrationManager, and calculations.js.
 */

var STEPS = ['load', 'calibrate', 'data', 'poa', 'impacts', 'results'];
var MAX_IMPACTS = 10;

function SessionFlow(canvasManager) {
    this.canvas = canvasManager;
    this.calibration = new CalibrationManager();

    this.currentStep = 0; // index into STEPS
    this.image = null;

    // Session data
    this.distanceYards = 0;
    this.bulletDiameter = 0;
    this.poa = null;           // {x, y} image coords
    this.impacts = [];         // [{x, y}] image coords, ordered
    this.results = null;       // output from calculateSession

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
        // Step 1: Load
        btnCamera: document.getElementById('btn-camera'),
        btnGallery: document.getElementById('btn-gallery'),
        inputCamera: document.getElementById('input-camera'),
        inputGallery: document.getElementById('input-gallery'),
        // Step 2: Calibrate
        calibrationStatus: document.getElementById('calibration-status'),
        btnRedoCalibration: document.getElementById('btn-redo-calibration'),
        btnNextCalibration: document.getElementById('btn-next-calibration'),
        // Step 3: Data
        inputDistance: document.getElementById('input-distance'),
        inputBulletDia: document.getElementById('input-bullet-dia'),
        btnNextData: document.getElementById('btn-next-data'),
        // Step 4: POA
        poaStatus: document.getElementById('poa-status'),
        btnRedoPoa: document.getElementById('btn-redo-poa'),
        btnNextPoa: document.getElementById('btn-next-poa'),
        // Step 5: Impacts
        impactStatus: document.getElementById('impact-status'),
        btnUndoImpact: document.getElementById('btn-undo-impact'),
        btnCalculate: document.getElementById('btn-calculate'),
        // Step 6: Results
        resultsCard: document.getElementById('results-card'),
        btnSaveImage: document.getElementById('btn-save-image'),
        btnShare: document.getElementById('btn-share'),
        btnNewFromResults: document.getElementById('btn-new-from-results'),
        // Global
        btnNewSession: document.getElementById('btn-new-session')
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

    this.canvas.clearImage();
    this.canvas.setHint('');

    // Reset inputs
    if (this.els.inputDistance) this.els.inputDistance.value = '';
    if (this.els.inputBulletDia) this.els.inputBulletDia.value = '';

    // Reset button states
    this._hideEl(this.els.btnRedoCalibration);
    this._hideEl(this.els.btnNextCalibration);
    this._hideEl(this.els.btnRedoPoa);
    this._hideEl(this.els.btnNextPoa);
    if (this.els.btnNextData) this.els.btnNextData.disabled = true;
    if (this.els.btnUndoImpact) this.els.btnUndoImpact.disabled = true;
    if (this.els.btnCalculate) this.els.btnCalculate.disabled = true;

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

// ── UI Binding ─────────────────────────────────────────────────

SessionFlow.prototype._bindUI = function () {
    var self = this;

    // Step 1: Load image
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

    // Step 2: Calibrate
    this.els.btnRedoCalibration.addEventListener('click', function () {
        self._startCalibration();
    });
    this.els.btnNextCalibration.addEventListener('click', function () {
        self._nextStep();
    });

    // Step 3: Data inputs
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

    // Step 4: POA
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

    // Step 5: Impacts
    this.els.btnUndoImpact.addEventListener('click', function () {
        self._undoLastImpact();
    });
    this.els.btnCalculate.addEventListener('click', function () {
        self._calculate();
    });

    // Step 6: Results
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

// ── Step 1: Image Loading ──────────────────────────────────────

SessionFlow.prototype._onImageSelected = function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;

    var self = this;
    loadImageFromFile(file).then(function (img) {
        self.image = img;
        self.canvas.loadImage(img);
        self._startCalibration();
        self._nextStep();
    }).catch(function (err) {
        alert('Failed to load image: ' + err.message);
    });

    // Reset the input so the same file can be re-selected
    e.target.value = '';
};

// ── Step 2: Calibration ────────────────────────────────────────

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

// ── Step 3: Data ───────────────────────────────────────────────

SessionFlow.prototype._validateDataInputs = function () {
    var d = parseFloat(this.els.inputDistance.value);
    var b = parseFloat(this.els.inputBulletDia.value);
    var valid = d > 0 && d <= 1500 && b > 0 && b <= 1.0;
    this.els.btnNextData.disabled = !valid;
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

    this._nextStep();
    this._updateHint();
};

// ── Step 4: POA ────────────────────────────────────────────────

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

// ── Step 5: Impacts ────────────────────────────────────────────

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

SessionFlow.prototype._updateImpactUI = function () {
    var count = this.impacts.length;
    this.els.impactStatus.textContent = 'Tap each bullet hole (' + count + '/' + MAX_IMPACTS + ')';
    this.els.btnUndoImpact.disabled = count === 0;
    this.els.btnCalculate.disabled = count < 2;

    if (count >= MAX_IMPACTS) {
        this.canvas.setHint('Maximum ' + MAX_IMPACTS + ' impacts reached');
    } else {
        this.canvas.setHint('Tap impact #' + (count + 1));
    }
};

// ── Step 6: Calculate & Display ────────────────────────────────

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
    html += '<span class="result-label">Extreme Spread</span>';
    html += '<span class="result-value">' + formatFixed(r.groupSizeInches, 3) + '&quot; / ' + formatFixed(r.groupSizeMOA, 2) + ' MOA</span>';
    html += '</div>';
    html += '<div class="result-row">';
    html += '<span class="result-label">Mean Radius</span>';
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
    html += '<div class="result-section-title">Adjust to Zero</div>';
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

    card.innerHTML = html;
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
        this.results
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
        this.results
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
