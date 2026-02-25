/**
 * dope-log.js — Come-Up Verification Log & BC Truing.
 *
 * Logs verified hits at known distances with known dials.
 * Back-calculates true BC by comparing actual drop vs predicted.
 * Builds verified DOPE chart per rifle/load.
 * Admin-only beta feature.
 */

function DopeLogManager(db) {
    this.db = db;
    this.profileManager = null; // set by app.js
}

/**
 * Render Verified DOPE section inside rifle detail.
 * Called from profiles.js _renderRifleDetail.
 */
DopeLogManager.prototype.renderSection = function (container, rifleId, loads) {
    var self = this;
    var html = '';

    html += '<div class="detail-section">';
    html += '<div class="detail-section-header">';
    html += '<h3 class="detail-section-title">Verified DOPE</h3>';
    html += '<button class="btn btn-sm btn-secondary" id="btn-add-dope">+ Log Hit</button>';
    html += '</div>';
    html += '<div id="dope-log-content"><p class="empty-state-sub">Loading...</p></div>';
    html += '</div>';

    container.insertAdjacentHTML('beforeend', html);

    // Load existing entries
    self._loadEntries(rifleId, loads);

    var addBtn = document.getElementById('btn-add-dope');
    if (addBtn) {
        addBtn.addEventListener('click', function () {
            self._showAddForm(rifleId, loads);
        });
    }
};

DopeLogManager.prototype._loadEntries = function (rifleId, loads) {
    var self = this;
    var contentEl = document.getElementById('dope-log-content');
    if (!contentEl) return;

    self.db.getDopeEntries(rifleId).then(function (entries) {
        if (!entries || entries.length === 0) {
            contentEl.innerHTML = '<p class="empty-state-sub">No verified data points yet. Log your confirmed hits to build a verified DOPE chart and true your BC.</p>';
            return;
        }

        // Group by load
        var byLoad = {};
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var lid = e.loadId || 'unknown';
            if (!byLoad[lid]) byLoad[lid] = [];
            byLoad[lid].push(e);
        }

        var html = '';

        // Show entries grouped by load
        for (var loadId in byLoad) {
            var loadEntries = byLoad[loadId];
            loadEntries.sort(function (a, b) { return (a.distanceYards || 0) - (b.distanceYards || 0); });

            // Find load name
            var loadName = 'Unknown Load';
            for (var l = 0; l < loads.length; l++) {
                if (loads[l].id === loadId) { loadName = loads[l].name; break; }
            }

            html += '<div class="dope-load-group">';
            html += '<div class="dope-load-name">' + escapeHtml(loadName) + '</div>';

            // BC truing
            var load = null;
            for (var ll = 0; ll < loads.length; ll++) {
                if (loads[ll].id === loadId) { load = loads[ll]; break; }
            }
            if (load && load.bulletBC) {
                var truedBC = self._calculateTrueBC(loadEntries, load, null);
                if (truedBC) {
                    html += '<div class="dope-bc-true">';
                    html += '<span>Box BC: ' + load.bulletBC.toFixed(3) + ' ' + (load.dragModel || 'G1') + '</span>';
                    html += '<span>Trued BC: <strong>' + truedBC.bc.toFixed(3) + '</strong></span>';
                    var diff = ((truedBC.bc - load.bulletBC) / load.bulletBC * 100).toFixed(1);
                    html += '<span class="' + (diff >= 0 ? 'dope-bc-up' : 'dope-bc-down') + '">' + (diff >= 0 ? '+' : '') + diff + '%</span>';
                    html += '</div>';
                }
            }

            // Entries table
            html += '<div class="admin-table-wrap"><table class="admin-table">';
            html += '<thead><tr><th>Dist</th><th>Elev Dial</th><th>Wind</th><th>Result</th><th></th></tr></thead>';
            html += '<tbody>';
            for (var j = 0; j < loadEntries.length; j++) {
                var entry = loadEntries[j];
                var resultClass = entry.result === 'hit' ? 'dope-hit' : (entry.result === 'miss' ? 'dope-miss' : 'dope-near');
                html += '<tr>';
                html += '<td>' + entry.distanceYards + 'y</td>';
                html += '<td>' + (entry.elevationMOA || 0).toFixed(1) + ' MOA</td>';
                html += '<td>' + (entry.windHoldMOA || 0).toFixed(1) + '</td>';
                html += '<td><span class="' + resultClass + '">' + escapeHtml(entry.result || '?') + '</span></td>';
                html += '<td><button class="btn-icon btn-sm dope-delete-btn" data-dope-id="' + entry.id + '" title="Delete">&times;</button></td>';
                html += '</tr>';
            }
            html += '</tbody></table></div>';
            html += '</div>';
        }

        contentEl.innerHTML = html;

        // Bind delete buttons
        var delBtns = contentEl.querySelectorAll('.dope-delete-btn');
        for (var d = 0; d < delBtns.length; d++) {
            delBtns[d].addEventListener('click', function () {
                var id = this.getAttribute('data-dope-id');
                if (confirm('Delete this entry?')) {
                    self.db.deleteDopeEntry(id).then(function () {
                        self._loadEntries(rifleId, loads);
                    });
                }
            });
        }
    }).catch(function () {
        contentEl.innerHTML = '<p class="empty-state-sub">Failed to load DOPE entries.</p>';
    });
};

DopeLogManager.prototype._showAddForm = function (rifleId, loads) {
    var self = this;
    var contentEl = document.getElementById('dope-log-content');
    if (!contentEl) return;

    var html = '<div class="dope-add-form">';

    // Load selector
    html += '<div class="form-group">';
    html += '<label>Load</label>';
    html += '<select id="dope-load-select">';
    for (var i = 0; i < loads.length; i++) {
        html += '<option value="' + loads[i].id + '">' + escapeHtml(loads[i].name) + '</option>';
    }
    html += '</select>';
    html += '</div>';

    html += '<div class="form-row">';
    html += '<div class="form-group form-group-half">';
    html += '<label>Distance (yds)</label>';
    html += '<input type="number" id="dope-distance" min="50" max="2000" step="25" inputmode="numeric" placeholder="500">';
    html += '</div>';
    html += '<div class="form-group form-group-half">';
    html += '<label>Elev Dial (MOA)</label>';
    html += '<input type="number" id="dope-elevation" min="0" max="200" step="0.25" inputmode="decimal" placeholder="12.5">';
    html += '</div>';
    html += '</div>';

    html += '<div class="form-row">';
    html += '<div class="form-group form-group-half">';
    html += '<label>Wind Hold (MOA)</label>';
    html += '<input type="number" id="dope-wind" min="-20" max="20" step="0.25" inputmode="decimal" placeholder="0">';
    html += '</div>';
    html += '<div class="form-group form-group-half">';
    html += '<label>Result</label>';
    html += '<select id="dope-result">';
    html += '<option value="hit">Hit</option>';
    html += '<option value="high">High</option>';
    html += '<option value="low">Low</option>';
    html += '<option value="left">Left</option>';
    html += '<option value="right">Right</option>';
    html += '<option value="miss">Miss</option>';
    html += '</select>';
    html += '</div>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label>Notes (optional)</label>';
    html += '<input type="text" id="dope-notes" placeholder="e.g., 10 mph crosswind, 5000ft DA">';
    html += '</div>';

    html += '<div class="btn-row">';
    html += '<button class="btn btn-secondary" id="dope-cancel-btn">Cancel</button>';
    html += '<button class="btn btn-primary" id="dope-save-btn">Save</button>';
    html += '</div>';
    html += '</div>';

    contentEl.innerHTML = html;

    document.getElementById('dope-cancel-btn').addEventListener('click', function () {
        self._loadEntries(rifleId, loads);
    });

    document.getElementById('dope-save-btn').addEventListener('click', function () {
        var entry = {
            rifleId: rifleId,
            loadId: document.getElementById('dope-load-select').value,
            distanceYards: parseFloat(document.getElementById('dope-distance').value) || 0,
            elevationMOA: parseFloat(document.getElementById('dope-elevation').value) || 0,
            windHoldMOA: parseFloat(document.getElementById('dope-wind').value) || 0,
            result: document.getElementById('dope-result').value,
            notes: document.getElementById('dope-notes').value.trim(),
            date: new Date().toISOString()
        };

        if (entry.distanceYards < 50) {
            alert('Enter a valid distance.');
            return;
        }

        self.db.addDopeEntry(entry).then(function () {
            self._loadEntries(rifleId, loads);
        }).catch(function (err) {
            alert('Failed to save: ' + (err.message || err));
        });
    });
};

/**
 * Back-calculate true BC from verified hits.
 * For each hit entry, compare the actual elevation dialed vs predicted.
 * Adjust BC to minimize the error.
 */
DopeLogManager.prototype._calculateTrueBC = function (entries, load, rifle) {
    // Filter to only 'hit' results at distances > zero range
    var hits = entries.filter(function (e) {
        return e.result === 'hit' && e.distanceYards > 100 && e.elevationMOA > 0;
    });

    if (hits.length === 0) return null;

    var boxBC = load.bulletBC;
    var mv = load.muzzleVelocity;
    var dragModel = load.dragModel || 'G1';
    if (!boxBC || !mv) return null;

    // Simple secant-method BC truing:
    // For each hit, the actual come-up (elevationMOA) should match the solver's predicted comeUpMOA.
    // Adjust BC until the average error is minimized.
    var bestBC = boxBC;
    var bestError = Infinity;

    for (var bcMult = 0.85; bcMult <= 1.15; bcMult += 0.005) {
        var testBC = boxBC * bcMult;
        var totalError = 0;

        for (var h = 0; h < hits.length; h++) {
            var hit = hits[h];
            try {
                var result = computeTrajectory({
                    bc: testBC,
                    dragModel: dragModel,
                    muzzleVelocity: mv,
                    scopeHeight: 1.5,
                    zeroRange: 100,
                    bulletWeight: load.bulletWeight || 168,
                    maxRange: hit.distanceYards + 50,
                    rangeStep: 50
                });
                // Find predicted come-up at this distance
                if (result && result.table) {
                    var predicted = 0;
                    for (var r = 0; r < result.table.length; r++) {
                        if (result.table[r].rangeYards >= hit.distanceYards) {
                            predicted = result.table[r].comeUpMOA;
                            break;
                        }
                    }
                    totalError += Math.abs(predicted - hit.elevationMOA);
                }
            } catch (e) {}
        }

        var avgError = totalError / hits.length;
        if (avgError < bestError) {
            bestError = avgError;
            bestBC = testBC;
        }
    }

    return { bc: bestBC, error: bestError };
};
