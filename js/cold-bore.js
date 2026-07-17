/**
 * cold-bore.js — Cold Bore Tracking.
 *
 * Pulls cold-bore data from two sources:
 *   1) Sessions where shot #1 was recorded against a POA — auto-derived
 *      from session.coldBore (preferred, new format).
 *   2) Manual entries in the cold_bore_shots table (legacy / hand-logged).
 *
 * Groups by load when multiple loads exist on the rifle.
 * Renders as a card (.plate) inside the rifle hub: verdict sentence
 * first, instrument strip under it, scatter plot, then folds for the
 * per-load breakdown, shot log, and tutorial.
 */

function ColdBoreManager(db) {
    this.db = db;
    this.profileManager = null;
}

/**
 * Render Cold Bore card inside rifle detail (container is a .qcard).
 */
ColdBoreManager.prototype.renderSection = function (container, rifleId, rifle) {
    var self = this;
    this._rifle = rifle || null; // for suppressor-config tagging on manual entries

    var html = '';
    html += '<div class="plate">';
    html += '<div id="cold-bore-content"><p class="t-micro">Loading&hellip;</p></div>';
    html += '</div>';

    container.insertAdjacentHTML('beforeend', html);

    self._loadData(rifleId);
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
            // Teaching empty state: one sentence; manual logging stays
            // reachable for shooters transcribing a paper cold-bore log.
            contentEl.innerHTML = '<div class="empty-teach">' +
                '<p>Mark shot #1 in your next session and yorT tracks your cold bore automatically.</p>' +
                '</div>' +
                '<div class="action-row"><button class="action-ghost" id="btn-add-cold-bore">' + Icon('plus', 16) + ' Log a shot by hand</button></div>';
            var emptyAdd = document.getElementById('btn-add-cold-bore');
            if (emptyAdd) {
                emptyAdd.addEventListener('click', function () {
                    self._showAddForm(rifleId);
                });
            }
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

        // Bind header + delete handlers
        var addBtn = document.getElementById('btn-add-cold-bore');
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                self._showAddForm(rifleId);
            });
        }
        self._bindDeleteButtons(rifleId);
    }).catch(function (err) {
        console.error('[ColdBore] Failed to load:', err);
        contentEl.innerHTML = '<p class="t-body u-quiet">Could not load cold bore data.</p>';
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

    var elevDir = overallAvg.vertMOA >= 0 ? 'high' : 'low';
    var windDir = overallAvg.horizMOA >= 0 ? 'right' : 'left';
    var vAbs = Math.abs(overallAvg.vertMOA).toFixed(2);
    var hAbs = Math.abs(overallAvg.horizMOA).toFixed(2);

    // Verdict sentence first (the HOLD), log action beside it.
    html += '<div class="plate-head">';
    html += '<p class="t-head">Cold bore lands ' + vAbs + ' MOA ' + elevDir + ', ' +
        hAbs + ' ' + windDir + ' &mdash; hold opposite for shot one.</p>';
    html += '<button class="action-ghost" id="btn-add-cold-bore">' + Icon('plus', 16) + 'Log shot</button>';
    html += '</div>';

    // Instrument strip: numbers under the sentence.
    html += '<div class="stat-strip">';
    html += '<div class="instrument">';
    html += '<div class="instrument-label">Vertical &middot; ' + elevDir + '</div>';
    html += '<div class="instrument-value">' + vAbs + '<span class="instrument-unit">MOA</span></div>';
    html += '</div>';
    html += '<div class="instrument">';
    html += '<div class="instrument-label">Horizontal &middot; ' + windDir + '</div>';
    html += '<div class="instrument-value">' + hAbs + '<span class="instrument-unit">MOA</span></div>';
    html += '</div>';
    html += '<div class="instrument">';
    html += '<div class="instrument-label">Total</div>';
    html += '<div class="instrument-value">' + overallAvg.totalMOA.toFixed(2) + '<span class="instrument-unit">MOA</span></div>';
    html += '</div>';
    html += '</div>';

    html += '<p class="t-micro u-mt-10">' + entries.length + ' cold bore shot' +
        (entries.length !== 1 ? 's' : '') + ' recorded</p>';

    // Scatter plot: center = POA, each dot = a cold bore offset.
    html += '<canvas id="cb-plot-all" class="u-center u-mt-10" width="280" height="280"></canvas>';

    // Per-load breakdown (only when there are 2+ loads)
    if (groups.length > 1) {
        html += '<details class="fold u-mt-10">';
        html += '<summary>Breakdown by load (' + groups.length + ')</summary>';
        html += '<div class="fold-body">';
        for (var g = 0; g < groups.length; g++) {
            var grp = groups[g];
            var gElevDir = grp.avg.vertMOA >= 0 ? 'high' : 'low';
            var gWindDir = grp.avg.horizMOA >= 0 ? 'right' : 'left';
            html += '<div class="u-label u-mt-10">' + escapeHtml(grp.loadName) + ' (' + grp.entries.length + ')</div>';
            html += '<div class="spec-row"><span class="spec-key">Avg vertical</span><span class="spec-val">' +
                Math.abs(grp.avg.vertMOA).toFixed(2) + ' MOA ' + gElevDir + '</span></div>';
            html += '<div class="spec-row"><span class="spec-key">Avg horizontal</span><span class="spec-val">' +
                Math.abs(grp.avg.horizMOA).toFixed(2) + ' MOA ' + gWindDir + '</span></div>';
            html += '<div class="spec-row"><span class="spec-key">Avg total</span><span class="spec-val">' +
                grp.avg.totalMOA.toFixed(2) + ' MOA</span></div>';
            html += '<canvas id="cb-plot-' + g + '" class="u-center u-mt-10" width="220" height="220"></canvas>';
        }
        html += '</div></details>';
    }

    // Shot log
    html += '<details class="fold">';
    html += '<summary>Shot log (' + entries.length + ')</summary>';
    html += '<div class="fold-body">';
    html += '<div class="datatable-wrap"><table class="datatable">';
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
            html += '<td><button class="action-ghost" data-cb-id="' + e.manualId +
                '" aria-label="Delete entry">' + Icon('trash', 16) + '</button></td>';
        } else {
            html += '<td><span class="chip">auto</span></td>';
        }
        html += '</tr>';
    }
    html += '</tbody></table></div>';
    html += '</div></details>';

    // Tutorial
    html += '<details class="fold">';
    html += '<summary>What is cold bore tracking?</summary>';
    html += '<div class="fold-body">' + this._tutorialText() + '</div>';
    html += '</details>';

    return html;
};

ColdBoreManager.prototype._tutorialText = function () {
    return '<p class="t-body u-quiet">' +
        '<strong>Why it matters:</strong> Your first shot on a clean, cold barrel often impacts at a different point than subsequent shots from a warm, fouled barrel. ' +
        'Knowing your cold bore offset lets you compensate on your critical first shot &mdash; which is often the only shot that matters in the field.' +
        '</p>' +
        '<p class="t-body u-quiet u-mt-10">' +
        '<strong>How yorT collects this:</strong> Whenever you mark your impacts in fire order, shot #1 is treated as the cold-bore shot. Its offset from POA is saved with the session automatically.' +
        '</p>' +
        '<p class="t-body u-quiet u-mt-10">' +
        '<strong>Tip:</strong> Tap your holes in fire order (shot #1 first). 10+ data points reveal a reliable trend.' +
        '</p>';
};

ColdBoreManager.prototype._bindDeleteButtons = function (rifleId) {
    var self = this;
    var contentEl = document.getElementById('cold-bore-content');
    if (!contentEl) return;
    var delBtns = contentEl.querySelectorAll('[data-cb-id]');
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

    var html = '';
    html += '<h4 class="t-head u-mb-12">Log a cold bore shot</h4>';

    html += '<div class="field">';
    html += '<label class="field-label" for="cb-distance">Distance <span class="field-unit">yd</span></label>';
    html += '<input type="number" id="cb-distance" min="50" max="2000" step="25" inputmode="numeric" placeholder="100">';
    html += '</div>';

    html += '<div class="field">';
    html += '<div class="field-label">Barrel condition</div>';
    html += '<div class="seg" id="cb-condition">';
    html += '<button type="button" class="seg-opt is-selected" data-value="clean_cold">Clean &amp; cold</button>';
    html += '<button type="button" class="seg-opt" data-value="cold_fouled">Cold, fouled</button>';
    html += '</div>';
    html += '</div>';

    html += '<div class="field-row">';
    html += '<div class="field">';
    html += '<label class="field-label" for="cb-elev">Vert offset <span class="field-unit">MOA</span></label>';
    html += '<input type="number" id="cb-elev" step="0.25" inputmode="decimal" placeholder="+1.5 high, -0.5 low">';
    html += '</div>';
    html += '<div class="field">';
    html += '<label class="field-label" for="cb-wind">Horiz offset <span class="field-unit">MOA</span></label>';
    html += '<input type="number" id="cb-wind" step="0.25" inputmode="decimal" placeholder="+0.5 right, -0.5 left">';
    html += '</div>';
    html += '</div>';

    html += '<div class="field">';
    html += '<label class="field-label" for="cb-notes">Notes <span class="field-unit">optional</span></label>';
    html += '<input type="text" id="cb-notes" placeholder="e.g., barrel cleaned yesterday">';
    html += '</div>';
    html += '<p id="cb-error" class="field-error"></p>';

    html += '<div class="action-row u-mt-10">';
    html += '<button class="action-ghost" id="cb-cancel-btn">Cancel</button>';
    html += '<button class="action" id="cb-save-btn">Save</button>';
    html += '</div>';

    contentEl.innerHTML = html;

    // Segmented control: one selected option at a time.
    var segOpts = contentEl.querySelectorAll('#cb-condition .seg-opt');
    for (var s = 0; s < segOpts.length; s++) {
        segOpts[s].addEventListener('click', function () {
            for (var t = 0; t < segOpts.length; t++) segOpts[t].classList.remove('is-selected');
            this.classList.add('is-selected');
        });
    }

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
        var selectedCond = contentEl.querySelector('#cb-condition .seg-opt.is-selected');
        var shot = {
            rifleId: rifleId,
            distanceYards: parseFloat(document.getElementById('cb-distance').value) || 100,
            condition: selectedCond ? selectedCond.getAttribute('data-value') : 'clean_cold',
            config: self._rifle && self._rifle.hasConfigs
                ? (self._rifle.activeConfig || 'bare') : null,
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
 * Colors are spec-token literals (canvas cannot read CSS variables here):
 * impacts --impact, POA --poa, rings/grid --line, labels --ink-2,
 * average marker --hold (the number you act on). Background transparent.
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
    ctx.strokeStyle = '#2A3036';
    ctx.lineWidth = 1;
    for (var ring = 1; ring <= maxMOA; ring++) {
        ctx.beginPath();
        ctx.arc(cx, cy, ring * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#9BA6AE';
        ctx.font = '10px sans-serif';
        ctx.fillText(ring + ' MOA', cx + ring * scale + 4, cy - 4);
    }

    // Crosshairs
    ctx.strokeStyle = '#2A3036';
    ctx.beginPath();
    ctx.moveTo(cx, 10);
    ctx.lineTo(cx, h - 10);
    ctx.moveTo(10, cy);
    ctx.lineTo(w - 10, cy);
    ctx.stroke();

    // POA marker
    ctx.fillStyle = '#4D9FD6';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9BA6AE';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('POA', cx + 8, cy - 8);

    // Plot each shot — impact green
    for (var k = 0; k < entries.length; k++) {
        var e = entries[k];
        var px = cx + e.horizMOA * scale;
        var py = cy - e.vertMOA * scale;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(70, 178, 104, 0.7)';
        ctx.fill();
        ctx.strokeStyle = '#46B268';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // Average marker (only with multiple shots) — brass, the hold point
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
        ctx.fillStyle = 'rgba(217, 161, 59, 0.85)';
        ctx.fill();
        ctx.strokeStyle = '#D9A13B';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#D9A13B';
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
