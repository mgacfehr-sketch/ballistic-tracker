/**
 * wind-call.js — Wind Call Helper page.
 *
 * Uses compass API for shooter heading, clock-face wind direction visual,
 * and calculates: wind drift, Coriolis, spin drift, and total hold.
 * Admin-only beta feature.
 */

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

    html += '<div class="wind-call-page">';

    // Rifle/Load selector
    html += '<div class="wind-call-selector">';
    html += '<select id="wind-rifle-select" class="wind-select">';
    html += '<option value="">Select Rifle & Load</option>';
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
    html += '<div class="wind-call-compass-status" id="wind-compass-status">';
    if (this.heading !== null) {
        html += 'Heading: ' + Math.round(this.heading) + '&deg; (' + self._headingToCardinal(this.heading) + ')';
    } else {
        html += '<button class="btn btn-secondary btn-sm" id="wind-enable-compass">Enable Compass</button>';
    }
    html += '</div>';

    // Clock face
    html += '<div class="wind-clock-container">';
    html += '<canvas id="wind-clock-canvas" width="260" height="260"></canvas>';
    html += '</div>';

    // Wind speed & distance inputs
    html += '<div class="wind-call-inputs">';
    html += '<div class="form-row">';
    html += '<div class="form-group form-group-half">';
    html += '<label for="wind-speed-input">Wind Speed (mph)</label>';
    html += '<input type="number" id="wind-speed-input" min="0" max="60" step="1" inputmode="numeric" value="' + this.windSpeed + '">';
    html += '</div>';
    html += '<div class="form-group form-group-half">';
    html += '<label for="wind-distance-input">Distance (yds)</label>';
    html += '<input type="number" id="wind-distance-input" min="50" max="2000" step="50" inputmode="numeric" value="' + this.distance + '">';
    html += '</div>';
    html += '</div>';
    html += '</div>';

    // Results
    html += '<div class="wind-call-results" id="wind-call-results"></div>';

    html += '</div>';

    this.container.innerHTML = html;
    this._bindEvents(groups);
    this._drawClock();
    this._calculate(groups);
};

WindCallManager.prototype._bindEvents = function (groups) {
    var self = this;

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
                statusEl.innerHTML = 'Heading: ' + Math.round(heading) + '&deg; (' + self._headingToCardinal(heading) + ')';
            }
        }
    };
    window.addEventListener('deviceorientation', self._compassHandler);

    var statusEl = document.getElementById('wind-compass-status');
    if (statusEl) statusEl.innerHTML = 'Waiting for compass...';
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

    // Background circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1e1e1e';
    ctx.fill();
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Clock numbers and tick marks
    ctx.fillStyle = '#888';
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
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // Shooter dot at center
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#4caf50';
    ctx.fill();

    // Wind direction hand
    var windRad = (this.windAngle - 90) * Math.PI / 180;
    var handLen = r - 35;
    var hx = cx + handLen * Math.cos(windRad);
    var hy = cy + handLen * Math.sin(windRad);

    // Arrow line
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(hx, hy);
    ctx.strokeStyle = '#f44336';
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
    ctx.fillStyle = '#f44336';
    ctx.fill();

    // Clock position label
    var clockPos = Math.round(this.windAngle / 30) % 12;
    if (clockPos === 0) clockPos = 12;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.fillText(clockPos + " o'clock", cx, cy + r + 6);
};

WindCallManager.prototype._calculate = function (groups) {
    var resultsEl = document.getElementById('wind-call-results');
    if (!resultsEl) return;

    if (!this.selectedRifleId || !this.selectedLoadId) {
        resultsEl.innerHTML = '<div class="wind-call-empty">Select a rifle and load above</div>';
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
        resultsEl.innerHTML = '<div class="wind-call-empty">Missing BC or MV data for this load</div>';
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

    // Build results HTML
    var html = '';
    html += '<div class="wind-call-result-header">Hold Adjustments at ' + distYds + ' yds</div>';

    // Wind drift
    html += '<div class="wind-call-result-row">';
    html += '<span class="wind-call-result-label">Wind Drift (' + clockPos + " o'clock, " + windMph + ' mph)</span>';
    html += '<span class="wind-call-result-value">' + windResult.driftInches.toFixed(1) + '" / ' + windResult.driftMOA.toFixed(2) + ' MOA</span>';
    html += '</div>';

    // Spin drift
    if (spinDrift.inches !== 0) {
        html += '<div class="wind-call-result-row">';
        html += '<span class="wind-call-result-label">Spin Drift (' + spinDrift.direction + ')</span>';
        html += '<span class="wind-call-result-value">' + Math.abs(spinDrift.inches).toFixed(1) + '" / ' + Math.abs(spinDrift.moa).toFixed(2) + ' MOA</span>';
        html += '</div>';
    }

    // Coriolis
    if (coriolis.horizontalMOA !== 0) {
        html += '<div class="wind-call-result-row">';
        html += '<span class="wind-call-result-label">Coriolis (horizontal)</span>';
        html += '<span class="wind-call-result-value">' + Math.abs(coriolis.horizontalInches).toFixed(1) + '" / ' + Math.abs(coriolis.horizontalMOA).toFixed(2) + ' MOA ' + coriolis.horizontalDir + '</span>';
        html += '</div>';

        html += '<div class="wind-call-result-row">';
        html += '<span class="wind-call-result-label">Coriolis (vertical)</span>';
        html += '<span class="wind-call-result-value">' + Math.abs(coriolis.verticalInches).toFixed(1) + '" / ' + Math.abs(coriolis.verticalMOA).toFixed(2) + ' MOA</span>';
        html += '</div>';
    }

    // Total windage hold
    var totalWindageInches = windResult.driftInches + spinDrift.inches + (coriolis.horizontalInches || 0);
    var totalWindageMOA = totalWindageInches / (distYds / 100 * 1.047);
    var holdDir = totalWindageMOA >= 0 ? 'Right' : 'Left';

    html += '<div class="wind-call-result-divider"></div>';
    html += '<div class="wind-call-result-row wind-call-result-total">';
    html += '<span class="wind-call-result-label">Total Windage Hold</span>';
    html += '<span class="wind-call-result-value">' + Math.abs(totalWindageMOA).toFixed(2) + ' MOA ' + holdDir + '</span>';
    html += '</div>';

    // Time of flight from solver
    if (windResult.tof) {
        html += '<div class="wind-call-result-row">';
        html += '<span class="wind-call-result-label">Time of Flight</span>';
        html += '<span class="wind-call-result-value">' + windResult.tof.toFixed(3) + ' sec</span>';
        html += '</div>';
    }

    if (!this.latitude) {
        html += '<div class="wind-call-note">Enable GPS for Coriolis corrections</div>';
    }
    if (this.heading === null) {
        html += '<div class="wind-call-note">Enable compass for direction-dependent corrections</div>';
    }

    resultsEl.innerHTML = html;
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
