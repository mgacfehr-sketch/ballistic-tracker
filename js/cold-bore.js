/**
 * cold-bore.js — Cold Bore Tracking.
 *
 * Tracks cold bore shot offset trends over time.
 * Shows tutorial, visual plot, and average offset in MOA.
 * Admin-only beta feature.
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
    html += '<h3 class="detail-section-title">Cold Bore Tracking</h3>';
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

ColdBoreManager.prototype._loadData = function (rifleId) {
    var self = this;
    var contentEl = document.getElementById('cold-bore-content');
    if (!contentEl) return;

    self.db.getColdBoreShots(rifleId).then(function (shots) {
        if (!shots || shots.length === 0) {
            contentEl.innerHTML = self._renderTutorial();
            return;
        }

        var html = '';

        // Calculate average offset
        var totalElev = 0, totalWind = 0;
        for (var i = 0; i < shots.length; i++) {
            totalElev += shots[i].elevationOffsetMOA || 0;
            totalWind += shots[i].windageOffsetMOA || 0;
        }
        var avgElev = totalElev / shots.length;
        var avgWind = totalWind / shots.length;
        var elevDir = avgElev >= 0 ? 'High' : 'Low';
        var windDir = avgWind >= 0 ? 'Right' : 'Left';

        // Stats summary
        html += '<div class="cb-stats">';
        html += '<div class="cb-stat">';
        html += '<span class="cb-stat-value">' + Math.abs(avgElev).toFixed(2) + '</span>';
        html += '<span class="cb-stat-label">Avg Elev (MOA) ' + elevDir + '</span>';
        html += '</div>';
        html += '<div class="cb-stat">';
        html += '<span class="cb-stat-value">' + Math.abs(avgWind).toFixed(2) + '</span>';
        html += '<span class="cb-stat-label">Avg Wind (MOA) ' + windDir + '</span>';
        html += '</div>';
        html += '<div class="cb-stat">';
        html += '<span class="cb-stat-value">' + shots.length + '</span>';
        html += '<span class="cb-stat-label">Shots Logged</span>';
        html += '</div>';
        html += '</div>';

        // Visual plot (canvas)
        html += '<div class="cb-plot-container">';
        html += '<canvas id="cb-plot-canvas" width="280" height="280"></canvas>';
        html += '</div>';

        // Recent entries
        html += '<details class="session-details">';
        html += '<summary class="session-details-summary">Shot Log (' + shots.length + ')</summary>';
        html += '<div class="session-details-body">';
        html += '<div class="admin-table-wrap"><table class="admin-table">';
        html += '<thead><tr><th>Date</th><th>Dist</th><th>Elev</th><th>Wind</th><th></th></tr></thead>';
        html += '<tbody>';
        var sorted = shots.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        for (var j = 0; j < sorted.length; j++) {
            var s = sorted[j];
            html += '<tr>';
            html += '<td>' + (s.date ? s.date.split('T')[0] : '?') + '</td>';
            html += '<td>' + (s.distanceYards || '?') + 'y</td>';
            html += '<td>' + (s.elevationOffsetMOA || 0).toFixed(1) + '</td>';
            html += '<td>' + (s.windageOffsetMOA || 0).toFixed(1) + '</td>';
            html += '<td><button class="btn-icon btn-sm cb-delete-btn" data-cb-id="' + s.id + '">&times;</button></td>';
            html += '</tr>';
        }
        html += '</tbody></table></div>';
        html += '</div></details>';

        // Tutorial link
        html += '<details class="session-details" style="margin-top:8px;">';
        html += '<summary class="session-details-summary">What is Cold Bore Tracking?</summary>';
        html += '<div class="session-details-body">' + self._tutorialText() + '</div>';
        html += '</details>';

        contentEl.innerHTML = html;

        // Draw the plot
        self._drawPlot(shots);

        // Bind delete
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
    }).catch(function () {
        contentEl.innerHTML = '<p class="empty-state-sub">Failed to load cold bore data.</p>';
    });
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
        'Knowing your cold bore offset lets you compensate on your critical first shot \u2014 which is often the only shot that matters in the field.' +
        '</p>' +
        '<p class="cb-tutorial-text">' +
        '<strong>How to do it:</strong>' +
        '</p>' +
        '<ol class="cb-tutorial-list">' +
        '<li>Start with a clean, cold barrel (room temp, not recently fired)</li>' +
        '<li>Fire ONE round at a known distance with your standard zero</li>' +
        '<li>Mark where it hit relative to your point of aim</li>' +
        '<li>Log the offset here (elevation and windage in MOA)</li>' +
        '<li>Then shoot your normal group for comparison</li>' +
        '<li>Over time, a pattern will emerge showing your cold bore tendency</li>' +
        '</ol>' +
        '<p class="cb-tutorial-text">' +
        '<strong>Tip:</strong> Most rifles print their cold bore shot slightly high and to one side. 10+ data points will reveal a reliable trend.' +
        '</p>';
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
    html += '<label>Elev Offset (MOA)</label>';
    html += '<input type="number" id="cb-elev" step="0.25" inputmode="decimal" placeholder="+1.5 high, -0.5 low">';
    html += '</div>';
    html += '<div class="form-group form-group-half">';
    html += '<label>Wind Offset (MOA)</label>';
    html += '<input type="number" id="cb-wind" step="0.25" inputmode="decimal" placeholder="+0.5 right, -0.5 left">';
    html += '</div>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label>Notes (optional)</label>';
    html += '<input type="text" id="cb-notes" placeholder="e.g., barrel cleaned yesterday">';
    html += '</div>';

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
        var shot = {
            rifleId: rifleId,
            distanceYards: parseFloat(document.getElementById('cb-distance').value) || 100,
            condition: document.getElementById('cb-condition').value,
            elevationOffsetMOA: parseFloat(document.getElementById('cb-elev').value) || 0,
            windageOffsetMOA: parseFloat(document.getElementById('cb-wind').value) || 0,
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
 */
ColdBoreManager.prototype._drawPlot = function (shots) {
    var canvas = document.getElementById('cb-plot-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    var cx = w / 2;
    var cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, w, h);

    // Target rings (1 MOA increments)
    var maxMOA = 3;
    var scale = (Math.min(cx, cy) - 20) / maxMOA;

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

    // POA label
    ctx.fillStyle = '#2196f3';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('POA', cx + 8, cy - 8);

    // Plot each shot
    for (var i = 0; i < shots.length; i++) {
        var s = shots[i];
        var px = cx + (s.windageOffsetMOA || 0) * scale;
        var py = cy - (s.elevationOffsetMOA || 0) * scale; // negative because canvas Y is inverted

        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(244, 67, 54, 0.7)';
        ctx.fill();
        ctx.strokeStyle = '#f44336';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // Average offset marker
    if (shots.length > 1) {
        var avgE = 0, avgW = 0;
        for (var j = 0; j < shots.length; j++) {
            avgE += shots[j].elevationOffsetMOA || 0;
            avgW += shots[j].windageOffsetMOA || 0;
        }
        avgE /= shots.length;
        avgW /= shots.length;

        var ax = cx + avgW * scale;
        var ay = cy - avgE * scale;

        ctx.beginPath();
        ctx.arc(ax, ay, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(76, 175, 80, 0.8)';
        ctx.fill();
        ctx.strokeStyle = '#4caf50';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#4caf50';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText('AVG', ax + 10, ay + 4);
    }
};
