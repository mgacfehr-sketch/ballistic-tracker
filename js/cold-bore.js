/**
 * cold-bore.js — Cold Bore Tracking.
 *
 * Pulls cold-bore data from two sources:
 *   1) Sessions where shot #1 was recorded against a POA — auto-derived
 *      from session.coldBore (preferred, new format).
 *   2) Manual entries in the cold_bore_shots table (legacy / hand-logged).
 *
 * Groups by load when multiple loads exist on the rifle.
 * Shows averages, history, and a target-diagram plot.
 */

function ColdBoreManager(db) {
    this.db = db;
    this.profileManager = null;
}

/**
 * Render Cold Bore section inside rifle detail.
 */
ColdBoreManager.prototype.renderSection = function (container, rifleId) {
    var self = this;
    var html = '';

    html += '<div class="detail-section">';
    html += '<div class="detail-section-header">';
    html += '<h3 class="detail-section-title">Cold Bore</h3>';
    html += '<button class="btn btn-sm btn-secondary" id="btn-add-cold-bore">+ Log Shot</button>';
    html += '</div>';
    html += '<div id="cold-bore-content"><p class="empty-state-sub">Loading...</p></div>';
    html += '</div>';

    container.insertAdjacentHTML('beforeend', html);

    self._loadData(rifleId);

    var addBtn = document.getElementById('btn-add-cold-bore');
    if (addBtn) {
        addBtn.addEventListener('click', function () {
            self._showAddForm(rifleId);
        });
    }
};

/**
 * Fetch sessions + manual logs, derive cold-bore entries, render.
 */
ColdBoreManager.prototype._loadData = function (rifleId) {
    var self = this;
    var contentEl = document.getElementById('cold-bore-content');
    if (!contentEl) return;

    Promise.all([
        self.db.getSessionsByRifle(rifleId).catch(function () { return []; }),
        self.db.getColdBoreShots(rifleId).catch(function () { return []; }),
        self.db.getLoadsByRifle(rifleId).catch(function () { return []; })
    ]).then(function (results) {
        var sessions = results[0] || [];
        var manualShots = results[1] || [];
        var loads = results[2] || [];

        // Build unified entries: { date, distanceYards, loadId, loadName, vertMOA, horizMOA, totalMOA, source }
        var entries = [];

        // From sessions — only those with auto cold_bore data
        for (var i = 0; i < sessions.length; i++) {
            var sess = sessions[i];
            if (!sess.coldBore) continue;
            var cb = sess.coldBore;
            // Skip if no MOA data
            if (cb.verticalMOA == null || cb.horizontalMOA == null) continue;
            var loadName = sess.loadName || '';
            if (!loadName && sess.loadId) {
                for (var ll = 0; ll < loads.length; ll++) {
                    if (loads[ll].id === sess.loadId) { loadName = loads[ll].name; break; }
                }
            }
            entries.push({
                date: sess.date,
                distanceYards: sess.distanceYards || 0,
                loadId: sess.loadId || null,
                loadName: loadName || 'Unknown load',
                vertMOA: cb.verticalMOA,
                horizMOA: cb.horizontalMOA,
                totalMOA: cb.radialMOA || Math.sqrt(cb.verticalMOA * cb.verticalMOA + cb.horizontalMOA * cb.horizontalMOA),
                vertInches: cb.verticalInches,
                horizInches: cb.horizontalInches,
                radialInches: cb.radialInches,
                source: 'session',
                sessionId: sess.id
            });
        }

        // From manual logs (legacy elev/wind only, no per-load)
        for (var j = 0; j < manualShots.length; j++) {
            var ms = manualShots[j];
            var msVert = ms.elevationOffsetMOA || 0;
            var msHoriz = ms.windageOffsetMOA || 0;
            entries.push({
                date: ms.date,
                distanceYards: ms.distanceYards || 0,
                loadId: null,
                loadName: 'Manual log',
                vertMOA: msVert,
                horizMOA: msHoriz,
                totalMOA: Math.sqrt(msVert * msVert + msHoriz * msHoriz),
                source: 'manual',
                manualId: ms.id
            });
        }

        if (entries.length === 0) {
            contentEl.innerHTML = self._renderTutorial();
            return;
        }

        // Sort newest first
        entries.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });

        // Group by loadId for per-load averages (sessions only)
        var groups = self._groupByLoad(entries);

        contentEl.innerHTML = self._renderEntries(entries, groups);

        // Draw plots after DOM insert
        self._drawPlot('cb-plot-all', entries);
        for (var g = 0; g < groups.length; g++) {
            self._drawPlot('cb-plot-' + g, groups[g].entries);
        }

        // Bind delete handlers
        self._bindDeleteButtons(rifleId);
    }).catch(function (err) {
        console.error('[ColdBore] Failed to load:', err);
        contentEl.innerHTML = '<p class="empty-state-sub">Failed to load cold bore data.</p>';
    });
};

/**
 * Group entries by loadId. Returns array of {loadId, loadName, entries, avg}.
 */
ColdBoreManager.prototype._groupByLoad = function (entries) {
    var map = {};
    for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var key = e.loadId || '_no_load';
        if (!map[key]) {
            map[key] = { loadId: e.loadId, loadName: e.loadName, entries: [] };
        }
        map[key].entries.push(e);
    }
    var groups = [];
    for (var k in map) {
        if (!map.hasOwnProperty(k)) continue;
        var grp = map[k];
        grp.avg = this._averageEntries(grp.entries);
        groups.push(grp);
    }
    // Sort: real loads first, '_no_load' last
    groups.sort(function (a, b) {
        if (!a.loadId && b.loadId) return 1;
        if (a.loadId && !b.loadId) return -1;
        return (a.loadName || '').localeCompare(b.loadName || '');
    });
    return groups;
};

ColdBoreManager.prototype._averageEntries = function (entries) {
    if (!entries.length) return null;
    var sV = 0, sH = 0, sT = 0;
    for (var i = 0; i < entries.length; i++) {
        sV += entries[i].vertMOA;
        sH += entries[i].horizMOA;
        sT += entries[i].totalMOA;
    }
    return {
        vertMOA: sV / entries.length,
        horizMOA: sH / entries.length,
        totalMOA: sT / entries.length,
        count: entries.length
    };
};

ColdBoreManager.prototype._renderEntries = function (entries, groups) {
    var html = '';
    var overallAvg = this._averageEntries(entries);

    // Overall stats
    var elevDir = overallAvg.vertMOA >= 0 ? 'High' : 'Low';
    var windDir = overallAvg.horizMOA >= 0 ? 'Right' : 'Left';

    html += '<div class="cb-stats">';
    html += '<div class="cb-stat">';
    html += '<span class="cb-stat-value">' + Math.abs(overallAvg.vertMOA).toFixed(2) + '</span>';
    html += '<span class="cb-stat-label">Avg Vertical (MOA) ' + elevDir + '</span>';
    html += '</div>';
    html += '<div class="cb-stat">';
    html += '<span class="cb-stat-value">' + Math.abs(overallAvg.horizMOA).toFixed(2) + '</span>';
    html += '<span class="cb-stat-label">Avg Horizontal (MOA) ' + windDir + '</span>';
    html += '</div>';
    html += '<div class="cb-stat">';
    html += '<span class="cb-stat-value">' + overallAvg.totalMOA.toFixed(2) + '</span>';
    html += '<span class="cb-stat-label">Avg Total (MOA)</span>';
    html += '</div>';
    html += '<div class="cb-stat">';
    html += '<span class="cb-stat-value">' + entries.length + '</span>';
    html += '<span class="cb-stat-label">Based on ' + entries.length + ' cold bore shot' + (entries.length !== 1 ? 's' : '') + '</span>';
    html += '</div>';
    html += '</div>';

    // Hold recommendation hint
    html += '<p class="cb-tutorial-text" style="margin-top:8px;">';
    html += 'Cold bore tends to land <strong>' + Math.abs(overallAvg.vertMOA).toFixed(2) + ' MOA ' + elevDir + '</strong>, ';
    html += '<strong>' + Math.abs(overallAvg.horizMOA).toFixed(2) + ' MOA ' + windDir + '</strong>. ';
    html += 'Hold opposite for your first cold shot.';
    html += '</p>';

    // Overall plot
    html += '<div class="cb-plot-container">';
    html += '<canvas id="cb-plot-all" width="280" height="280"></canvas>';
    html += '</div>';

    // Per-load breakdown (only when there are 2+ loads)
    if (groups.length > 1) {
        html += '<details class="session-details" style="margin-top:8px;">';
        html += '<summary class="session-details-summary">Breakdown by load (' + groups.length + ')</summary>';
        html += '<div class="session-details-body">';
        for (var g = 0; g < groups.length; g++) {
            var grp = groups[g];
            var gElevDir = grp.avg.vertMOA >= 0 ? 'High' : 'Low';
            var gWindDir = grp.avg.horizMOA >= 0 ? 'Right' : 'Left';
            html += '<div style="margin-bottom:12px;border-top:1px solid var(--border);padding-top:8px;">';
            html += '<div style="font-weight:600;margin-bottom:4px;">' + escapeHtml(grp.loadName) + ' (' + grp.entries.length + ')</div>';
            html += '<div class="result-row"><span class="result-label">Avg Vertical</span><span class="result-value">' + Math.abs(grp.avg.vertMOA).toFixed(2) + ' MOA ' + gElevDir + '</span></div>';
            html += '<div class="result-row"><span class="result-label">Avg Horizontal</span><span class="result-value">' + Math.abs(grp.avg.horizMOA).toFixed(2) + ' MOA ' + gWindDir + '</span></div>';
            html += '<div class="result-row"><span class="result-label">Avg Total</span><span class="result-value">' + grp.avg.totalMOA.toFixed(2) + ' MOA</span></div>';
            html += '<div class="cb-plot-container" style="margin-top:4px;">';
            html += '<canvas id="cb-plot-' + g + '" width="220" height="220"></canvas>';
            html += '</div>';
            html += '</div>';
        }
        html += '</div></details>';
    }

    // History table
    html += '<details class="session-details" style="margin-top:8px;">';
    html += '<summary class="session-details-summary">Shot Log (' + entries.length + ')</summary>';
    html += '<div class="session-details-body">';
    html += '<div class="admin-table-wrap"><table class="admin-table">';
    html += '<thead><tr><th>Date</th><th>Dist</th><th>Load</th><th>Vert</th><th>Horiz</th><th>Total</th><th></th></tr></thead>';
    html += '<tbody>';
    for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var dateStr = e.date ? e.date.split('T')[0] : '?';
        var vDir = e.vertMOA >= 0 ? 'H' : 'L';
        var hDir = e.horizMOA >= 0 ? 'R' : 'L';
        html += '<tr>';
        html += '<td>' + dateStr + '</td>';
        html += '<td>' + (e.distanceYards || '?') + 'y</td>';
        html += '<td>' + escapeHtml(e.loadName) + '</td>';
        html += '<td>' + Math.abs(e.vertMOA).toFixed(2) + ' ' + vDir + '</td>';
        html += '<td>' + Math.abs(e.horizMOA).toFixed(2) + ' ' + hDir + '</td>';
        html += '<td>' + e.totalMOA.toFixed(2) + '</td>';
        if (e.source === 'manual') {
            html += '<td><button class="btn-icon btn-sm cb-delete-btn" data-cb-id="' + e.manualId + '">&times;</button></td>';
        } else {
            html += '<td><span class="cb-tag">auto</span></td>';
        }
        html += '</tr>';
    }
    html += '</tbody></table></div>';
    html += '</div></details>';

    // Tutorial
    html += '<details class="session-details" style="margin-top:8px;">';
    html += '<summary class="session-details-summary">What is Cold Bore Tracking?</summary>';
    html += '<div class="session-details-body">' + this._tutorialText() + '</div>';
    html += '</details>';

    return html;
};

ColdBoreManager.prototype._renderTutorial = function () {
    return '<div class="cb-tutorial">' +
        '<div class="cb-tutorial-title">Cold Bore Tracking</div>' +
        this._tutorialText() +
        '</div>';
};

ColdBoreManager.prototype._tutorialText = function () {
    return '<p class="cb-tutorial-text">' +
        '<strong>Why it matters:</strong> Your first shot on a clean, cold barrel often impacts at a different point than subsequent shots from a warm, fouled barrel. ' +
        'Knowing your cold bore offset lets you compensate on your critical first shot — which is often the only shot that matters in the field.' +
        '</p>' +
        '<p class="cb-tutorial-text">' +
        '<strong>How yorT collects this:</strong> Whenever you mark your impacts in fire order, shot #1 is treated as the cold-bore shot. Its offset from POA is saved with the session automatically.' +
        '</p>' +
        '<p class="cb-tutorial-text">' +
        '<strong>Tip:</strong> Tap your hole in fire order (shot #1 first). 10+ data points reveal a reliable trend.' +
        '</p>';
};

ColdBoreManager.prototype._bindDeleteButtons = function (rifleId) {
    var self = this;
    var contentEl = document.getElementById('cold-bore-content');
    if (!contentEl) return;
    var delBtns = contentEl.querySelectorAll('.cb-delete-btn');
    for (var d = 0; d < delBtns.length; d++) {
        delBtns[d].addEventListener('click', function () {
            var id = this.getAttribute('data-cb-id');
            if (confirm('Delete this entry?')) {
                self.db.deleteColdBoreShot(id).then(function () {
                    self._loadData(rifleId);
                });
            }
        });
    }
};

ColdBoreManager.prototype._showAddForm = function (rifleId) {
    var self = this;
    var contentEl = document.getElementById('cold-bore-content');
    if (!contentEl) return;

    var html = '<div class="dope-add-form">';

    html += '<div class="form-row">';
    html += '<div class="form-group form-group-half">';
    html += '<label>Distance (yds)</label>';
    html += '<input type="number" id="cb-distance" min="50" max="2000" step="25" inputmode="numeric" placeholder="100">';
    html += '</div>';
    html += '<div class="form-group form-group-half">';
    html += '<label>Barrel Condition</label>';
    html += '<select id="cb-condition">';
    html += '<option value="clean_cold">Clean & Cold</option>';
    html += '<option value="cold_fouled">Cold (fouled)</option>';
    html += '</select>';
    html += '</div>';
    html += '</div>';

    html += '<div class="form-row">';
    html += '<div class="form-group form-group-half">';
    html += '<label>Vert Offset (MOA)</label>';
    html += '<input type="number" id="cb-elev" step="0.25" inputmode="decimal" placeholder="+1.5 high, -0.5 low">';
    html += '</div>';
    html += '<div class="form-group form-group-half">';
    html += '<label>Horiz Offset (MOA)</label>';
    html += '<input type="number" id="cb-wind" step="0.25" inputmode="decimal" placeholder="+0.5 right, -0.5 left">';
    html += '</div>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label>Notes (optional)</label>';
    html += '<input type="text" id="cb-notes" placeholder="e.g., barrel cleaned yesterday">';
    html += '</div>';
    html += '<p id="cb-error" class="form-error"></p>';

    html += '<div class="btn-row">';
    html += '<button class="btn btn-secondary" id="cb-cancel-btn">Cancel</button>';
    html += '<button class="btn btn-primary" id="cb-save-btn">Save</button>';
    html += '</div>';
    html += '</div>';

    contentEl.innerHTML = html;

    document.getElementById('cb-cancel-btn').addEventListener('click', function () {
        self._loadData(rifleId);
    });

    document.getElementById('cb-save-btn').addEventListener('click', function () {
        var elev = parseFloat(document.getElementById('cb-elev').value) || 0;
        var wind = parseFloat(document.getElementById('cb-wind').value) || 0;
        if (elev === 0 && wind === 0) {
            // A 0/0 entry adds noise to the cold-bore trend; require a
            // real offset (a genuinely centered cold shot is ~never
            // exactly 0.00/0.00)
            var errEl = document.getElementById('cb-error');
            if (errEl) errEl.textContent = 'Enter at least one non-zero offset.';
            return;
        }
        var shot = {
            rifleId: rifleId,
            distanceYards: parseFloat(document.getElementById('cb-distance').value) || 100,
            condition: document.getElementById('cb-condition').value,
            elevationOffsetMOA: elev,
            windageOffsetMOA: wind,
            notes: document.getElementById('cb-notes').value.trim(),
            date: new Date().toISOString()
        };

        self.db.addColdBoreShot(shot).then(function () {
            self._loadData(rifleId);
        }).catch(function (err) {
            alert('Failed to save: ' + (err.message || err));
        });
    });
};

/**
 * Draw a scatter plot of cold bore shots on a target-like canvas.
 * Center = POA, each dot = cold bore offset.
 * @param {string} canvasId
 * @param {array} entries — unified entries with vertMOA / horizMOA
 */
ColdBoreManager.prototype._drawPlot = function (canvasId, entries) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    var cx = w / 2;
    var cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, w, h);

    // Find max MOA to fit all points
    var maxAbs = 1;
    for (var i = 0; i < entries.length; i++) {
        var v = Math.abs(entries[i].vertMOA);
        var hh = Math.abs(entries[i].horizMOA);
        if (v > maxAbs) maxAbs = v;
        if (hh > maxAbs) maxAbs = hh;
    }
    var maxMOA = Math.ceil(maxAbs + 0.5);
    if (maxMOA < 2) maxMOA = 2;
    var scale = (Math.min(cx, cy) - 20) / maxMOA;

    // Rings
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (var ring = 1; ring <= maxMOA; ring++) {
        ctx.beginPath();
        ctx.arc(cx, cy, ring * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#555';
        ctx.font = '10px sans-serif';
        ctx.fillText(ring + ' MOA', cx + ring * scale + 4, cy - 4);
    }

    // Crosshairs
    ctx.strokeStyle = '#444';
    ctx.beginPath();
    ctx.moveTo(cx, 10);
    ctx.lineTo(cx, h - 10);
    ctx.moveTo(10, cy);
    ctx.lineTo(w - 10, cy);
    ctx.stroke();

    // POA marker
    ctx.fillStyle = '#2196f3';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('POA', cx + 8, cy - 8);

    // Plot each shot — orange/yellow for cold bore
    for (var k = 0; k < entries.length; k++) {
        var e = entries[k];
        var px = cx + e.horizMOA * scale;
        var py = cy - e.vertMOA * scale;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 193, 7, 0.7)';
        ctx.fill();
        ctx.strokeStyle = '#ffc107';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // Average marker (only with multiple shots)
    if (entries.length > 1) {
        var avgV = 0, avgH = 0;
        for (var m = 0; m < entries.length; m++) {
            avgV += entries[m].vertMOA;
            avgH += entries[m].horizMOA;
        }
        avgV /= entries.length;
        avgH /= entries.length;
        var ax = cx + avgH * scale;
        var ay = cy - avgV * scale;
        ctx.beginPath();
        ctx.arc(ax, ay, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(76, 175, 80, 0.85)';
        ctx.fill();
        ctx.strokeStyle = '#4caf50';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#4caf50';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText('AVG', ax + 10, ay + 4);
    }
};

/**
 * Async helper for ai-assistant.js — returns summary used in system prompt.
 * Resolves to null if no data.
 */
ColdBoreManager.prototype.getSummaryForRifle = function (rifleId) {
    var self = this;
    return Promise.all([
        self.db.getSessionsByRifle(rifleId).catch(function () { return []; }),
        self.db.getColdBoreShots(rifleId).catch(function () { return []; }),
        self.db.getLoadsByRifle(rifleId).catch(function () { return []; })
    ]).then(function (results) {
        var sessions = results[0] || [];
        var manualShots = results[1] || [];
        var loads = results[2] || [];

        var entries = [];
        for (var i = 0; i < sessions.length; i++) {
            var sess = sessions[i];
            if (!sess.coldBore) continue;
            var cb = sess.coldBore;
            if (cb.verticalMOA == null || cb.horizontalMOA == null) continue;
            var loadName = sess.loadName || '';
            if (!loadName && sess.loadId) {
                for (var ll = 0; ll < loads.length; ll++) {
                    if (loads[ll].id === sess.loadId) { loadName = loads[ll].name; break; }
                }
            }
            entries.push({
                date: sess.date,
                distanceYards: sess.distanceYards || 0,
                loadId: sess.loadId || null,
                loadName: loadName || 'Unknown load',
                vertMOA: cb.verticalMOA,
                horizMOA: cb.horizontalMOA,
                totalMOA: cb.radialMOA || Math.sqrt(cb.verticalMOA * cb.verticalMOA + cb.horizontalMOA * cb.horizontalMOA),
                source: 'session'
            });
        }
        for (var j = 0; j < manualShots.length; j++) {
            var ms = manualShots[j];
            var v = ms.elevationOffsetMOA || 0;
            var hh = ms.windageOffsetMOA || 0;
            entries.push({
                date: ms.date,
                distanceYards: ms.distanceYards || 0,
                loadId: null,
                loadName: 'Manual log',
                vertMOA: v,
                horizMOA: hh,
                totalMOA: Math.sqrt(v * v + hh * hh),
                source: 'manual'
            });
        }
        return entries;
    });
};
