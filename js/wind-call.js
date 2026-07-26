/**
 * wind-call.js — Wind Call Helper page.
 *
 * Uses compass API for shooter heading, clock-face wind direction visual,
 * and calculates: wind drift, Coriolis, spin drift, and total hold.
 * Results render as an instrument plate (stat strip in the rifle's own
 * turret unit, total hold as the hero numeral). Admin-only beta feature.
 */

/* 1 milliradian = 3.43775 MOA (turret-unit conversion) */
var WIND_MIL_TO_MOA = 3.43775;

function WindCallManager(db) {
    this.db = db;
    this.container = null;
    this.selectedRifleId = null;
    this.selectedLoadId = null;
    this.heading = null;       // compass heading in degrees (null if unavailable)
    this.latitude = null;      // GPS latitude
    this.windAngle = 90;       // wind clock angle in degrees (0=12 o'clock, 90=3 o'clock)
    this.windSpeed = 10;       // mph
    this.distance = 500;       // yards
    this.isDragging = false;
    this._compassHandler = null;
}

WindCallManager.prototype.init = function () {
    this.container = document.getElementById('view-wind');
};

WindCallManager.prototype.show = function () {
    if (!this.container) return;
    this._render();
};

WindCallManager.prototype._render = function () {
    var self = this;
    if (!this.db) return;

    this.db.getAllRifles().then(function (rifles) {
        return Promise.all(rifles.map(function (r) {
            return self.db.getLoadsByRifle(r.id).then(function (loads) {
                return { rifle: r, loads: loads };
            });
        })).then(function (groups) {
            self._renderUI(groups);
        });
    });
};

WindCallManager.prototype._renderUI = function (groups) {
    var self = this;
    var html = '';

    html += '<div class="view-toolbar">' +
        '<button type="button" class="toolbar-back" id="wind-back-btn">' + Icon('chevron-left', 20) + 'Home</button>';
    html += '<h2 class="toolbar-title">Wind call</h2></div>';
    html += '<div class="screen">';

    // Rifle/load selector
    html += '<div class="field">';
    html += '<label class="field-label" for="wind-rifle-select">Rifle &amp; load</label>';
    html += '<select id="wind-rifle-select">';
    html += '<option value="">Select rifle &amp; load</option>';
    for (var g = 0; g < groups.length; g++) {
        var rifle = groups[g].rifle;
        var loads = groups[g].loads;
        for (var l = 0; l < loads.length; l++) {
            var ld = loads[l];
            if (!ld.bulletBC || !ld.muzzleVelocity) continue;
            var val = rifle.id + '|' + ld.id;
            var sel = (rifle.id === self.selectedRifleId && ld.id === self.selectedLoadId) ? ' selected' : '';
            html += '<option value="' + val + '"' + sel + '>' +
                escapeHtml(rifle.name) + ' / ' + escapeHtml(ld.name) + '</option>';
        }
    }
    html += '</select>';
    html += '</div>';

    // Compass heading
    html += '<div id="wind-compass-status">';
    if (this.heading !== null) {
        html += '<p class="t-micro">Heading ' + Math.round(this.heading) + '&deg; (' + self._headingToCardinal(this.heading) + ')</p>';
    } else {
        html += '<button type="button" class="action" id="wind-enable-compass">' + Icon('compass', 18) + 'Enable compass</button>';
    }
    html += '</div>';

    // Clock face (canvas draws its own palette-matched colors)
    html += '<canvas id="wind-clock-canvas" class="u-center u-mt-14" width="260" height="260"></canvas>';

    // Wind speed & distance inputs
    html += '<div class="field-row u-mt-14">';
    html += '<div class="field">';
    html += '<label class="field-label" for="wind-speed-input">Wind speed <span class="field-unit">mph</span></label>';
    html += '<input type="number" id="wind-speed-input" min="0" max="60" step="1" inputmode="numeric" value="' + this.windSpeed + '">';
    html += '</div>';
    html += '<div class="field">';
    html += '<label class="field-label" for="wind-distance-input">Distance <span class="field-unit">yds</span></label>';
    html += '<input type="number" id="wind-distance-input" min="50" max="2000" step="50" inputmode="numeric" value="' + this.distance + '">';
    html += '</div>';
    html += '</div>';

    // Results
    html += '<div id="wind-call-results"></div>';

    html += '</div>';

    this.container.innerHTML = html;
    this._bindEvents(groups);
    this._drawClock();
    this._calculate(groups);
};

WindCallManager.prototype._bindEvents = function (groups) {
    var self = this;

    var backBtn = document.getElementById('wind-back-btn');
    if (backBtn) backBtn.addEventListener('click', function () {
        if (window.AppNav) AppNav.go('home');
    });

    var select = document.getElementById('wind-rifle-select');
    if (select) {
        select.addEventListener('change', function () {
            var parts = this.value.split('|');
            self.selectedRifleId = parts[0] || null;
            self.selectedLoadId = parts[1] || null;
            self._calculate(groups);
        });
    }

    var compassBtn = document.getElementById('wind-enable-compass');
    if (compassBtn) {
        compassBtn.addEventListener('click', function () {
            self._startCompass();
        });
    }

    var speedInput = document.getElementById('wind-speed-input');
    var distInput = document.getElementById('wind-distance-input');
    if (speedInput) {
        speedInput.addEventListener('input', function () {
            self.windSpeed = parseFloat(this.value) || 0;
            self._calculate(groups);
        });
    }
    if (distInput) {
        distInput.addEventListener('input', function () {
            self.distance = parseFloat(this.value) || 100;
            self._calculate(groups);
        });
    }

    // Clock face drag
    var canvas = document.getElementById('wind-clock-canvas');
    if (canvas) {
        var onMove = function (x, y) {
            var rect = canvas.getBoundingClientRect();
            var cx = rect.width / 2;
            var cy = rect.height / 2;
            var dx = (x - rect.left) - cx;
            var dy = (y - rect.top) - cy;
            var angle = Math.atan2(dx, -dy) * 180 / Math.PI;
            if (angle < 0) angle += 360;
            self.windAngle = angle;
            self._drawClock();
            self._calculate(groups);
        };
        canvas.addEventListener('mousedown', function (e) { self.isDragging = true; onMove(e.clientX, e.clientY); });
        canvas.addEventListener('mousemove', function (e) { if (self.isDragging) onMove(e.clientX, e.clientY); });
        document.addEventListener('mouseup', function () { self.isDragging = false; });
        canvas.addEventListener('touchstart', function (e) { e.preventDefault(); self.isDragging = true; var t = e.touches[0]; onMove(t.clientX, t.clientY); }, { passive: false });
        canvas.addEventListener('touchmove', function (e) { e.preventDefault(); if (self.isDragging) { var t = e.touches[0]; onMove(t.clientX, t.clientY); } }, { passive: false });
        canvas.addEventListener('touchend', function () { self.isDragging = false; });
    }

    // Also try GPS for latitude
    if (navigator.geolocation && this.latitude === null) {
        navigator.geolocation.getCurrentPosition(function (pos) {
            self.latitude = pos.coords.latitude;
            self._calculate(groups);
        }, function () {}, { timeout: 5000 });
    }
};

WindCallManager.prototype._startCompass = function () {
    var self = this;

    // iOS 13+ requires permission
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(function (state) {
            if (state === 'granted') self._listenCompass();
        }).catch(function () {});
    } else {
        self._listenCompass();
    }
};

WindCallManager.prototype._listenCompass = function () {
    var self = this;
    if (self._compassHandler) return;

    self._compassHandler = function (e) {
        var heading = null;
        if (e.webkitCompassHeading !== undefined) {
            heading = e.webkitCompassHeading; // iOS
        } else if (e.alpha !== null) {
            heading = (360 - e.alpha) % 360; // Android
        }
        if (heading !== null) {
            self.heading = heading;
            var statusEl = document.getElementById('wind-compass-status');
            if (statusEl) {
                statusEl.innerHTML = '<p class="t-micro">Heading ' + Math.round(heading) + '&deg; (' + self._headingToCardinal(heading) + ')</p>';
            }
        }
    };
    window.addEventListener('deviceorientation', self._compassHandler);

    var statusEl = document.getElementById('wind-compass-status');
    if (statusEl) statusEl.innerHTML = '<p class="t-micro">Waiting for compass&hellip;</p>';
};

WindCallManager.prototype._headingToCardinal = function (deg) {
    var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
};

WindCallManager.prototype._drawClock = function () {
    var canvas = document.getElementById('wind-clock-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    var cx = w / 2;
    var cy = h / 2;
    var r = Math.min(cx, cy) - 10;

    ctx.clearRect(0, 0, w, h);

    // Background circle — raised panel on hairline (palette: --g1 / --line)
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#14171A';
    ctx.fill();
    ctx.strokeStyle = '#2A3036';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Clock numbers and tick marks (secondary ink / hairlines)
    ctx.fillStyle = '#9BA6AE';
    ctx.font = '13px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 1; i <= 12; i++) {
        var angle = (i * 30 - 90) * Math.PI / 180;
        var nx = cx + (r - 20) * Math.cos(angle);
        var ny = cy + (r - 20) * Math.sin(angle);
        ctx.fillText(i.toString(), nx, ny);

        // Tick mark
        var tx1 = cx + (r - 5) * Math.cos(angle);
        var ty1 = cy + (r - 5) * Math.sin(angle);
        var tx2 = cx + r * Math.cos(angle);
        var ty2 = cy + r * Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(tx1, ty1);
        ctx.lineTo(tx2, ty2);
        ctx.strokeStyle = '#2A3036';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // Shooter dot at center (primary ink)
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#EDF1F4';
    ctx.fill();

    // Wind direction hand
    var windRad = (this.windAngle - 90) * Math.PI / 180;
    var handLen = r - 35;
    var hx = cx + handLen * Math.cos(windRad);
    var hy = cy + handLen * Math.sin(windRad);

    // Arrow line (brass accent)
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(hx, hy);
    ctx.strokeStyle = '#D9A13B';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Arrowhead
    var arrowSize = 10;
    var arrowAngle = Math.atan2(hy - cy, hx - cx);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - arrowSize * Math.cos(arrowAngle - 0.4), hy - arrowSize * Math.sin(arrowAngle - 0.4));
    ctx.lineTo(hx - arrowSize * Math.cos(arrowAngle + 0.4), hy - arrowSize * Math.sin(arrowAngle + 0.4));
    ctx.closePath();
    ctx.fillStyle = '#D9A13B';
    ctx.fill();

    // Clock position label (primary ink)
    var clockPos = Math.round(this.windAngle / 30) % 12;
    if (clockPos === 0) clockPos = 12;
    ctx.fillStyle = '#EDF1F4';
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.fillText(clockPos + " o'clock", cx, cy + r + 6);
};

WindCallManager.prototype._calculate = function (groups) {
    var resultsEl = document.getElementById('wind-call-results');
    if (!resultsEl) return;

    if (!this.selectedRifleId || !this.selectedLoadId) {
        resultsEl.innerHTML = '<p class="t-body u-quiet">Pick a rifle and load above to get holds.</p>';
        return;
    }

    // Find selected rifle and load
    var rifle = null, load = null;
    for (var g = 0; g < groups.length; g++) {
        if (groups[g].rifle.id === this.selectedRifleId) {
            rifle = groups[g].rifle;
            for (var l = 0; l < groups[g].loads.length; l++) {
                if (groups[g].loads[l].id === this.selectedLoadId) {
                    load = groups[g].loads[l];
                    break;
                }
            }
            break;
        }
    }

    if (!rifle || !load || !load.bulletBC || !load.muzzleVelocity) {
        resultsEl.innerHTML = '<p class="t-body u-quiet">This load is missing BC or muzzle velocity data.</p>';
        return;
    }

    var distYds = this.distance;
    var windMph = this.windSpeed;
    var clockPos = Math.round(this.windAngle / 30) % 12;
    if (clockPos === 0) clockPos = 12;

    // 1. Wind drift from trajectory solver
    var windResult = this._calcWindDrift(rifle, load, distYds, windMph, clockPos);

    // 2. Spin drift
    var spinDrift = this._calcSpinDrift(rifle, load, distYds);

    // 3. Coriolis horizontal deflection
    var coriolis = this._calcCoriolis(distYds, load, this.latitude, this.heading);

    // The rifle's own turret unit — every hold below is spoken in it
    var unit = String(rifle.angleUnit || '').toUpperCase() === 'MIL' ? 'MIL' : 'MOA';
    function inUnit(moa) {
        var v = unit === 'MIL' ? moa / WIND_MIL_TO_MOA : moa;
        return Math.abs(v).toFixed(2);
    }

    // Total windage hold
    var totalWindageInches = windResult.driftInches + spinDrift.inches + (coriolis.horizontalInches || 0);
    var totalWindageMOA = totalWindageInches / (distYds / 100 * 1.047);
    var holdDir = totalWindageMOA >= 0 ? 'R' : 'L';

    // Results plate: label, then the four holds — total is the hero numeral
    var html = '';
    html += '<div class="plate">';
    html += '<div class="instrument-label">Hold at ' + distYds + ' yds</div>';
    html += '<p class="t-micro">Wind ' + clockPos + " o'clock at " + windMph + ' mph</p>';

    html += '<div class="stat-strip">';
    html += this._instrument('Wind', inUnit(windResult.driftMOA), unit + ' ' + (windResult.driftMOA >= 0 ? 'R' : 'L'));
    html += this._instrument('Spin', inUnit(spinDrift.moa), unit + ' ' + (spinDrift.direction === 'Right' ? 'R' : 'L'));
    if (coriolis.horizontalMOA !== 0) {
        html += this._instrument('Coriolis', inUnit(coriolis.horizontalMOA), unit + ' ' + (coriolis.horizontalDir === 'Right' ? 'R' : 'L'));
    } else {
        html += this._instrument('Coriolis', '&mdash;', '');
    }
    html += this._instrument('Total', inUnit(totalWindageMOA), unit + ' ' + holdDir, true);
    html += '</div>';

    // Time of flight from solver
    if (windResult.tof) {
        html += '<p class="t-micro u-mt-10">Time of flight ' + windResult.tof.toFixed(3) + ' s</p>';
    }
    if (coriolis.verticalMOA !== 0) {
        html += '<p class="t-micro">Coriolis vertical ' + inUnit(coriolis.verticalMOA) + ' ' + unit +
            (coriolis.verticalMOA >= 0 ? ' up' : ' down') + '</p>';
    }
    if (!this.latitude) {
        html += '<p class="t-micro">Enable GPS for Coriolis corrections.</p>';
    }
    if (this.heading === null) {
        html += '<p class="t-micro">Enable compass for direction-dependent corrections.</p>';
    }
    html += '</div>';

    resultsEl.innerHTML = html;
};

/** One labeled hold readout; hero=true renders the value at display scale. */
WindCallManager.prototype._instrument = function (label, value, unitText, hero) {
    return '<div class="instrument">' +
        '<div class="instrument-label">' + label + '</div>' +
        '<div class="instrument-value' + (hero ? ' t-display' : '') + '">' + value +
        (unitText ? '<span class="instrument-unit">' + unitText + '</span>' : '') +
        '</div></div>';
};

/**
 * Calculate wind drift using the trajectory solver.
 */
WindCallManager.prototype._calcWindDrift = function (rifle, load, distYds, windMph, clockPos) {
    try {
        var result = computeTrajectory({
            bc: load.bulletBC,
            dragModel: load.dragModel || 'G1',
            muzzleVelocity: load.muzzleVelocity,
            scopeHeight: rifle.scopeHeight || 1.5,
            zeroRange: rifle.zeroRange || 100,
            bulletWeight: load.bulletWeight || 168,
            maxRange: distYds + 50,
            rangeStep: 50,
            windSpeedMph: windMph,
            windClockPos: clockPos,
            tempF: 59,
            pressureInHg: 29.92,
            humidity: 0
        });

        if (result && result.table) {
            // Find closest range row
            for (var i = result.table.length - 1; i >= 0; i--) {
                if (result.table[i].rangeYards <= distYds) {
                    var row = result.table[i];
                    // Interpolate if not exact
                    var drift = row.windDriftInches;
                    var tof = row.timeOfFlightSec;
                    if (i + 1 < result.table.length && result.table[i + 1].rangeYards > distYds) {
                        var next = result.table[i + 1];
                        var frac = (distYds - row.rangeYards) / (next.rangeYards - row.rangeYards);
                        drift = row.windDriftInches + frac * (next.windDriftInches - row.windDriftInches);
                        tof = row.timeOfFlightSec + frac * (next.timeOfFlightSec - row.timeOfFlightSec);
                    }
                    var driftMOA = drift / (distYds / 100 * 1.047);
                    return { driftInches: drift, driftMOA: driftMOA, tof: tof };
                }
            }
        }
    } catch (e) {}
    return { driftInches: 0, driftMOA: 0, tof: null };
};

/**
 * Estimate spin drift using the Litz approximation:
 * SD(inches) = 1.25 * (SG + 1.2) * TOF^1.83
 * where SG is the gyroscopic stability factor.
 */
WindCallManager.prototype._calcSpinDrift = function (rifle, load, distYds) {
    // Get barrel twist info for direction
    var twistDir = 'right'; // default assumption
    // We can't easily get barrel data here without async, so use convention:
    // Most barrels are right-hand twist, spin drift goes right.

    // Estimate time of flight
    var tof = distYds * 3 / load.muzzleVelocity; // rough estimate

    // Stability factor approximation (typical rifle bullet SG ~ 1.5-2.0)
    var sg = 1.8; // reasonable default
    if (load.bulletLength && load.bulletDiameter) {
        // Miller stability formula approximation (simplified)
        // Not perfectly accurate but gives ballpark
        var diam = load.bulletDiameter;
        var len = load.bulletLength;
        if (len > 0 && diam > 0) {
            sg = 1.5 + (diam / len) * 2; // rough proxy
        }
    }

    // Litz spin drift formula: SD = 1.25 * (SG + 1.2) * TOF^1.83
    var sdInches = 1.25 * (sg + 1.2) * Math.pow(tof, 1.83);
    var sdMOA = sdInches / (distYds / 100 * 1.047);

    // Right-hand twist = drift right (positive)
    return {
        inches: sdInches,
        moa: sdMOA,
        direction: twistDir === 'right' ? 'Right' : 'Left'
    };
};

/**
 * Calculate Coriolis deflection.
 * Horizontal (Eötvös): deflection = 2 * omega * sin(lat) * TOF * Vx
 * Vertical (Eötvös vertical component): varies with azimuth
 */
WindCallManager.prototype._calcCoriolis = function (distYds, load, lat, azimuth) {
    if (lat === null || lat === undefined) return { horizontalInches: 0, horizontalMOA: 0, horizontalDir: '', verticalInches: 0, verticalMOA: 0 };

    var omega = 7.2921e-5; // Earth's angular velocity (rad/s)
    var latRad = lat * Math.PI / 180;
    var distFt = distYds * 3;
    var tof = distFt / load.muzzleVelocity; // approximate TOF
    var avgVel = distFt / tof; // ft/s

    // Horizontal deflection: 2 * omega * sin(lat) * v * t
    // This deflects RIGHT in Northern Hemisphere
    var horizDeflFt = 2 * omega * Math.sin(latRad) * avgVel * tof * tof / 2;
    var horizDeflIn = horizDeflFt * 12;
    var horizMOA = horizDeflIn / (distYds / 100 * 1.047);
    var horizDir = lat >= 0 ? 'Right' : 'Left';

    // Vertical (Eötvös effect) — depends on azimuth
    var vertDeflIn = 0;
    if (azimuth !== null && azimuth !== undefined) {
        var azRad = azimuth * Math.PI / 180;
        // Shooting east = bullet rises, west = drops
        var vertDeflFt = 2 * omega * Math.cos(latRad) * Math.sin(azRad) * avgVel * tof * tof / 2;
        vertDeflIn = vertDeflFt * 12;
    }
    var vertMOA = vertDeflIn / (distYds / 100 * 1.047);

    return {
        horizontalInches: horizDeflIn,
        horizontalMOA: horizMOA,
        horizontalDir: horizDir,
        verticalInches: vertDeflIn,
        verticalMOA: vertMOA
    };
};

WindCallManager.prototype.cleanup = function () {
    if (this._compassHandler) {
        window.removeEventListener('deviceorientation', this._compassHandler);
        this._compassHandler = null;
    }
};
