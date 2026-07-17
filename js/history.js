/**
 * history.js — Session history, cleaning logs, scope adjustments.
 *
 * Render layer emits the REDESIGN-SPEC vocabulary (css/ui.css):
 * view toolbars + .screen wrappers, .row-item lists grouped under
 * .month-label dividers, verdict-first session detail (.plate hero,
 * .stat-strip, .fold sections), teaching empty states.
 * Renders into the ProfileManager's container (#view-profiles).
 */

function HistoryManager(db, profileManager) {
    this.db = db;
    this.profileManager = profileManager;
    this._thumbnailUrls = [];
}

// ── Shared render helpers ───────────────────────────────────────

/**
 * View toolbar: back chevron + label, title.
 * @param {string} backId - element id for the back button
 * @param {string} backLabel - already-escaped label text
 * @param {string} title - already-escaped title text
 */
HistoryManager.prototype._toolbarHtml = function (backId, backLabel, title) {
    var html = '<div class="view-toolbar">';
    html += '<button class="toolbar-back" id="' + backId + '">' + Icon('chevron-left', 22) + '<span>' + backLabel + '</span></button>';
    html += '<h2 class="toolbar-title">' + title + '</h2>';
    html += '</div>';
    return html;
};

/**
 * Month divider label for a session date, e.g. "JULY 2026".
 */
HistoryManager.prototype._monthLabel = function (dateStr) {
    if (!dateStr) return 'Undated';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Undated';
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }).toUpperCase();
};

/**
 * Session rows grouped by month with .month-label dividers.
 * Rows are buttons carrying data-session-id; thumbnails load async.
 */
HistoryManager.prototype._sessionRowsHtml = function (sessions) {
    var html = '';
    var lastLabel = null;

    for (var i = 0; i < sessions.length; i++) {
        var s = sessions[i];
        var label = this._monthLabel(s.date);
        if (label !== lastLabel) {
            html += '<div class="month-label">' + escapeHtml(label) + '</div>';
            lastLabel = label;
        }

        var dateStr = s.date ? new Date(s.date).toLocaleDateString() : 'Unknown date';
        var groupStr = s.results && s.results.groupSizeMOA != null
            ? formatFixed(s.results.groupSizeMOA, 2) + ' MOA'
            : '&mdash;';
        var shotCount = s.impacts ? s.impacts.length : 0;

        html += '<button type="button" class="row-item" data-session-id="' + escapeAttr(s.id) + '">';
        html += '<img class="thumb" data-session-id="' + escapeAttr(s.id) + '" alt="">';
        html += '<div class="row-main">';
        html += '<div class="row-title">' + shotCount + ' shots &middot; ' + formatNum(s.distanceYards, 0) + ' yd</div>';
        html += '<div class="row-sub">' + escapeHtml(dateStr) + '</div>';
        html += '</div>';
        html += '<div class="row-aside">' + groupStr + '</div>';
        html += '</button>';
    }

    return html;
};

/**
 * One key/value spec row.
 */
HistoryManager.prototype._specRow = function (key, valHtml) {
    return '<div class="spec-row"><span class="spec-key">' + key + '</span><span class="spec-val">' + valHtml + '</span></div>';
};

// ── Session List ────────────────────────────────────────────────

/**
 * Show all sessions for a rifle, sorted by date descending.
 */
HistoryManager.prototype.showSessionList = function (rifleId) {
    var self = this;
    Promise.all([
        this.db.getRifle(rifleId),
        this.db.getSessionsByRifle(rifleId)
    ]).then(function (results) {
        var rifle = results[0];
        var sessions = results[1];
        if (!rifle) { self.profileManager.showRifleList(); return; }

        sessions.sort(function (a, b) {
            return (b.date || '').localeCompare(a.date || '');
        });

        self._renderSessionList(rifle, sessions);
    });
};

HistoryManager.prototype._renderSessionList = function (rifle, sessions) {
    var container = this.profileManager.container;

    var html = this._toolbarHtml('btn-history-back', escapeHtml(rifle.name), 'History');
    html += '<div class="screen">';

    if (sessions.length === 0) {
        html += '<div class="empty-teach">';
        html += '<p>Check a target from Home and the session lands here, photo and all.</p>';
        html += '<button class="action-primary" id="btn-history-start">' + Icon('camera', 20) + 'Check a target</button>';
        html += '</div>';
    } else {
        html += this._sessionRowsHtml(sessions);
    }

    html += '</div>';
    container.innerHTML = html;

    var self = this;

    document.getElementById('btn-history-back').addEventListener('click', function () {
        self.profileManager.showRifleDetail(rifle.id);
    });

    var startBtn = document.getElementById('btn-history-start');
    if (startBtn) {
        startBtn.addEventListener('click', function () {
            if (window.AppNav) window.AppNav.go('session');
        });
    }

    var rows = container.querySelectorAll('.row-item[data-session-id]');
    for (var i = 0; i < rows.length; i++) {
        rows[i].addEventListener('click', function () {
            var sid = this.getAttribute('data-session-id');
            self.showSessionDetail(sid, rifle.id);
        });
    }

    this._loadThumbnails(container);
};

// ── Session Detail ──────────────────────────────────────────────

HistoryManager.prototype.showSessionDetail = function (sessionId, rifleId) {
    var self = this;
    this.db.getSession(sessionId).then(function (session) {
        if (!session) { self.showSessionList(rifleId); return; }
        self._renderSessionDetail(session, rifleId);
    });
};

/**
 * Verdict-first session detail body (shared by rifle and misc detail):
 * hero plate (GROUP SIZE), stat strip, "All stats" fold, "Session
 * details" fold, annotated image plate, save/share actions, delete.
 */
HistoryManager.prototype._sessionDetailBodyHtml = function (session) {
    var r = session.results;
    var shotCount = session.impacts ? session.impacts.length : 0;
    var html = '';

    // Hero: the verdict number first
    if (r) {
        html += '<div class="plate">';
        html += '<div class="instrument">';
        html += '<div class="instrument-label">Group size</div>';
        html += '<div class="instrument-value t-display">' + formatFixed(r.groupSizeMOA, 2) + '<span class="instrument-unit">MOA</span></div>';
        html += '</div>';
        html += '<div class="t-micro u-mt-10">' + formatFixed(r.groupSizeInches, 3) + '&Prime; &middot; ' + shotCount + ' shots at ' + formatNum(session.distanceYards, 0) + ' yd</div>';

        html += '<div class="stat-strip">';
        html += '<div class="instrument"><div class="instrument-label">Mean radius</div><div class="instrument-value">' + formatFixed(r.meanRadiusMOA, 2) + '<span class="instrument-unit">MOA</span></div></div>';
        html += '<div class="instrument"><div class="instrument-label">Vertical</div><div class="instrument-value">' + formatFixed(r.verticalSpreadInches, 2) + '<span class="instrument-unit">in</span></div></div>';
        html += '<div class="instrument"><div class="instrument-label">Horizontal</div><div class="instrument-value">' + formatFixed(r.horizontalSpreadInches, 2) + '<span class="instrument-unit">in</span></div></div>';
        html += '</div>';
        html += '</div>';

        // Remaining stats: offsets + advanced, one quiet fold
        var statRows = '';
        if (r.elevationOffsetMOA != null) {
            var elevSign = r.elevationOffsetInches >= 0 ? 'high' : 'low';
            statRows += this._specRow('Elevation offset', formatFixed(Math.abs(r.elevationOffsetInches), 3) + '&Prime; ' + elevSign);
        }
        if (r.windageOffsetMOA != null) {
            var windSign = r.windageOffsetInches >= 0 ? 'right' : 'left';
            statRows += this._specRow('Windage offset', formatFixed(Math.abs(r.windageOffsetInches), 3) + '&Prime; ' + windSign);
        }
        if (r.cepInches != null) {
            statRows += this._specRow('CEP (50%)', formatFixed(r.cepInches, 3) + '&Prime; / ' + formatFixed(r.cepMOA, 2) + ' MOA');
            statRows += this._specRow('Radial SD', formatFixed(r.radialSDInches, 3) + '&Prime; / ' + formatFixed(r.radialSDMOA, 2) + ' MOA');
            statRows += this._specRow('Vertical SD', formatFixed(r.verticalSDInches, 3) + '&Prime; / ' + formatFixed(r.verticalSDMOA, 2) + ' MOA');
            statRows += this._specRow('Horizontal SD', formatFixed(r.horizontalSDInches, 3) + '&Prime; / ' + formatFixed(r.horizontalSDMOA, 2) + ' MOA');
            var mElevSign = r.meanElevationInches >= 0 ? 'high' : 'low';
            statRows += this._specRow('Mean elevation', formatFixed(Math.abs(r.meanElevationInches), 3) + '&Prime; ' + mElevSign + ' / ' + formatFixed(r.meanElevationMOA, 2) + ' MOA');
            var mWindSign = r.meanWindageInches >= 0 ? 'right' : 'left';
            statRows += this._specRow('Mean windage', formatFixed(Math.abs(r.meanWindageInches), 3) + '&Prime; ' + mWindSign + ' / ' + formatFixed(r.meanWindageMOA, 2) + ' MOA');
        }
        if (statRows) {
            html += '<details class="fold"><summary>All stats</summary><div class="fold-body">' + statRows + '</div></details>';
        }
    }

    // Session details fold: bullet, rounds, velocity, weather
    var detailRows = '';
    if (session.bulletDiameter) {
        detailRows += this._specRow('Bullet diameter', session.bulletDiameter + '&Prime;');
    }
    if (session.roundsFired) {
        detailRows += this._specRow('Rounds fired', session.roundsFired);
    }
    if (session.measuredVelocity) {
        detailRows += this._specRow('Measured velocity', session.measuredVelocity + ' fps');
    }
    var w = session.weather;
    if (w) {
        if (w.tempF != null) detailRows += this._specRow('Temperature', w.tempF + '&deg;F');
        if (w.humidity != null) detailRows += this._specRow('Humidity', w.humidity + '%');
        if (w.windMph != null) detailRows += this._specRow('Wind', w.windMph + ' mph' + (w.windDir ? ' ' + escapeHtml(w.windDir) : ''));
        if (w.altitudeFt != null) detailRows += this._specRow('Altitude', w.altitudeFt + ' ft');
        if (w.pressureInHg != null) detailRows += this._specRow('Pressure', w.pressureInHg + '&Prime; Hg');
    }
    if (detailRows) {
        html += '<details class="fold"><summary>Session details</summary><div class="fold-body">' + detailRows + '</div></details>';
    }

    // Annotated image
    html += '<div class="plate u-mt-14">';
    html += '<p class="u-quiet" id="session-image-loading">Loading image&hellip;</p>';
    html += '<img class="plate-img hidden" id="session-full-image" alt="Annotated target">';
    html += '</div>';
    html += '<div class="action-row u-mt-10 hidden" id="session-image-actions">';
    html += '<button class="action" id="btn-session-save-image">' + Icon('download', 18) + 'Save image</button>';
    html += '<button class="action" id="btn-session-share-image">' + Icon('share', 18) + 'Share</button>';
    html += '</div>';

    // Destructive action last, quiet outline
    html += '<button class="action-danger u-full u-mt-14" id="btn-delete-session">' + Icon('trash', 18) + 'Delete session</button>';

    return html;
};

HistoryManager.prototype._renderSessionDetail = function (session, rifleId) {
    var container = this.profileManager.container;
    var dateStr = session.date ? new Date(session.date).toLocaleDateString() : 'Unknown date';

    var html = this._toolbarHtml('btn-session-detail-back', 'History', escapeHtml(dateStr));
    html += '<div class="screen">';
    html += this._sessionDetailBodyHtml(session);
    html += '</div>';
    container.innerHTML = html;

    var self = this;

    document.getElementById('btn-session-detail-back').addEventListener('click', function () {
        self.showSessionList(rifleId);
    });

    document.getElementById('btn-delete-session').addEventListener('click', function () {
        if (confirm('Delete this session?')) {
            self.db.deleteSession(session.id).then(function () {
                self.showSessionList(rifleId);
            });
        }
    });

    this._loadFullImage(session.id);
};

// ── Cleaning Log ────────────────────────────────────────────────

/**
 * Show cleaning log for a barrel.
 */
HistoryManager.prototype.showCleaningLog = function (rifleId, barrelId) {
    var self = this;
    Promise.all([
        this.db.getRifle(rifleId),
        this.db.getCleaningLogsByBarrel(barrelId),
        this.db.getBarrel(barrelId)
    ]).then(function (results) {
        var rifle = results[0];
        var logs = results[1];
        var barrel = results[2];
        if (!rifle) { self.profileManager.showRifleList(); return; }

        logs.sort(function (a, b) {
            return (b.date || '').localeCompare(a.date || '');
        });

        var totalRounds = barrel ? (barrel.totalRounds || 0) : 0;
        var roundsSinceCleaning = self._computeRoundsSinceCleaning(totalRounds, logs);

        self._renderCleaningLog(rifle, barrelId, logs, totalRounds, roundsSinceCleaning);
    });
};

HistoryManager.prototype._renderCleaningLog = function (rifle, barrelId, logs, totalRounds, roundsSinceCleaning) {
    var container = this.profileManager.container;

    var html = this._toolbarHtml('btn-cleaning-back', escapeHtml(rifle.name), 'Cleaning log');
    html += '<div class="screen">';

    // Barrel round-count instruments
    html += '<div class="stat-strip">';
    html += '<div class="instrument"><div class="instrument-label">Total rounds</div><div class="instrument-value">' + totalRounds + '</div></div>';
    html += '<div class="instrument"><div class="instrument-label">Since cleaning</div><div class="instrument-value">' + roundsSinceCleaning + '</div></div>';
    html += '</div>';

    if (logs.length === 0) {
        html += '<div class="empty-teach">';
        html += '<p>Log each cleaning and yorT keeps an honest count of rounds since.</p>';
        html += '<button class="action-primary" id="btn-add-cleaning">' + Icon('plus', 20) + 'Add cleaning</button>';
        html += '</div>';
    } else {
        html += '<div class="u-mt-14">';
        for (var i = 0; i < logs.length; i++) {
            var log = logs[i];
            var dateStr = log.date ? new Date(log.date).toLocaleDateString() : 'Unknown date';
            var sub = escapeHtml(dateStr) + (log.notes ? ' &mdash; ' + escapeHtml(log.notes) : '');
            html += '<div class="row-item" data-log-id="' + escapeAttr(log.id) + '">';
            html += '<div class="row-main">';
            html += '<div class="row-title">' + log.roundCountAtCleaning + ' rounds</div>';
            html += '<div class="row-sub">' + sub + '</div>';
            html += '</div>';
            html += '<div class="row-aside">';
            html += '<button class="toolbar-act" data-log-id="' + escapeAttr(log.id) + '" aria-label="Delete entry">' + Icon('trash', 18) + '</button>';
            html += '</div>';
            html += '</div>';
        }
        html += '</div>';
        html += '<button class="action-primary u-mt-14" id="btn-add-cleaning">' + Icon('plus', 20) + 'Add cleaning</button>';
    }

    html += '</div>';
    container.innerHTML = html;

    var self = this;

    document.getElementById('btn-cleaning-back').addEventListener('click', function () {
        self.profileManager.showRifleDetail(rifle.id);
    });

    document.getElementById('btn-add-cleaning').addEventListener('click', function () {
        self.showCleaningForm(rifle.id, barrelId);
    });

    var delBtns = container.querySelectorAll('.toolbar-act[data-log-id]');
    for (var i = 0; i < delBtns.length; i++) {
        delBtns[i].addEventListener('click', function (e) {
            e.stopPropagation();
            var logId = this.getAttribute('data-log-id');
            if (confirm('Delete this cleaning entry?')) {
                self.db.deleteCleaningLog(logId).then(function () {
                    self.showCleaningLog(rifle.id, barrelId);
                });
            }
        });
    }
};

// ── Cleaning Form ───────────────────────────────────────────────

HistoryManager.prototype.showCleaningForm = function (rifleId, barrelId) {
    var self = this;
    Promise.all([
        this.db.getRifle(rifleId),
        this.db.getBarrel(barrelId)
    ]).then(function (results) {
        var rifle = results[0];
        var barrel = results[1];
        if (!rifle) { self.profileManager.showRifleList(); return; }

        var totalRounds = barrel ? (barrel.totalRounds || 0) : 0;
        self._renderCleaningForm(rifle, barrelId, totalRounds);
    });
};

HistoryManager.prototype._renderCleaningForm = function (rifle, barrelId, totalRounds) {
    var container = this.profileManager.container;
    var today = new Date().toISOString().split('T')[0];

    var html = this._toolbarHtml('btn-form-back', 'Back', 'Add cleaning');
    html += '<div class="screen">';

    html += '<form id="cleaning-form">';

    html += '<div class="field">';
    html += '<label class="field-label" for="cl-date">Date</label>';
    html += '<input type="date" id="cl-date" value="' + today + '">';
    html += '</div>';

    html += '<div class="field">';
    html += '<label class="field-label" for="cl-rounds">Round count at cleaning</label>';
    html += '<input type="number" id="cl-rounds" min="0" step="1" inputmode="numeric" placeholder="' + totalRounds + '" value="' + totalRounds + '">';
    html += '</div>';

    html += '<div class="field">';
    html += '<label class="field-label" for="cl-notes">Notes</label>';
    html += '<textarea id="cl-notes" rows="2" placeholder="Optional notes"></textarea>';
    html += '</div>';
    html += '<p id="cl-error" class="field-error"></p>';

    html += '<button type="submit" class="action-primary u-mt-10">Save</button>';

    html += '</form>';
    html += '</div>';
    container.innerHTML = html;

    var self = this;

    document.getElementById('btn-form-back').addEventListener('click', function () {
        self.showCleaningLog(rifle.id, barrelId);
    });

    document.getElementById('cleaning-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var rounds = parseInt(document.getElementById('cl-rounds').value, 10);
        var errEl = document.getElementById('cl-error');
        if (!isFinite(rounds) || rounds <= 0) {
            // Inline validation — a 0-round cleaning is junk data that
            // pollutes the since-cleaning math
            if (errEl) errEl.textContent = 'Enter the barrel round count at cleaning (must be above 0).';
            return;
        }
        var data = {
            rifleId: rifle.id,
            barrelId: barrelId,
            date: document.getElementById('cl-date').value || new Date().toISOString(),
            roundCountAtCleaning: rounds,
            notes: document.getElementById('cl-notes').value.trim()
        };
        self.db.addCleaningLog(data).then(function () {
            self.showCleaningLog(rifle.id, barrelId);
        });
    });
};

// ── Scope Adjustments ───────────────────────────────────────────

HistoryManager.prototype.showScopeAdjustments = function (rifleId) {
    var self = this;
    Promise.all([
        this.db.getRifle(rifleId),
        this.db.getScopeAdjustmentsByRifle(rifleId)
    ]).then(function (results) {
        var rifle = results[0];
        var adjustments = results[1];
        if (!rifle) { self.profileManager.showRifleList(); return; }

        adjustments.sort(function (a, b) {
            return (b.date || '').localeCompare(a.date || '');
        });

        self._renderScopeAdjustments(rifle, adjustments);
    });
};

HistoryManager.prototype._renderScopeAdjustments = function (rifle, adjustments) {
    var container = this.profileManager.container;

    var html = this._toolbarHtml('btn-scope-back', escapeHtml(rifle.name), 'Scope adjustments');
    html += '<div class="screen">';

    if (adjustments.length === 0) {
        html += '<div class="empty-teach">';
        html += '<p>Log every turret change and yorT keeps a paper trail of where your zero has moved.</p>';
        html += '<button class="action-primary" id="btn-add-scope-adj">' + Icon('plus', 20) + 'Add adjustment</button>';
        html += '</div>';
    } else {
        for (var i = 0; i < adjustments.length; i++) {
            var adj = adjustments[i];
            var dateStr = adj.date ? new Date(adj.date).toLocaleDateString() : 'Unknown date';
            var elevDir = adj.elevationChange >= 0 ? 'UP' : 'DOWN';
            var windDir = adj.windageChange >= 0 ? 'RIGHT' : 'LEFT';
            var title = formatFixed(Math.abs(adj.elevationChange), 2) + ' MOA ' + elevDir +
                ' &middot; ' + formatFixed(Math.abs(adj.windageChange), 2) + ' MOA ' + windDir;
            var sub = escapeHtml(dateStr) + (adj.reason ? ' &mdash; ' + escapeHtml(adj.reason) : '');

            html += '<div class="row-item" data-adj-id="' + escapeAttr(adj.id) + '">';
            html += '<div class="row-main">';
            html += '<div class="row-title">' + title + '</div>';
            html += '<div class="row-sub">' + sub + '</div>';
            html += '</div>';
            html += '<div class="row-aside">';
            html += '<button class="toolbar-act" data-adj-id="' + escapeAttr(adj.id) + '" aria-label="Delete entry">' + Icon('trash', 18) + '</button>';
            html += '</div>';
            html += '</div>';
        }
        html += '<button class="action-primary u-mt-14" id="btn-add-scope-adj">' + Icon('plus', 20) + 'Add adjustment</button>';
    }

    html += '</div>';
    container.innerHTML = html;

    var self = this;

    document.getElementById('btn-scope-back').addEventListener('click', function () {
        self.profileManager.showRifleDetail(rifle.id);
    });

    document.getElementById('btn-add-scope-adj').addEventListener('click', function () {
        self.showScopeAdjustmentForm(rifle.id);
    });

    var delBtns = container.querySelectorAll('.toolbar-act[data-adj-id]');
    for (var i = 0; i < delBtns.length; i++) {
        delBtns[i].addEventListener('click', function (e) {
            e.stopPropagation();
            var adjId = this.getAttribute('data-adj-id');
            if (confirm('Delete this scope adjustment?')) {
                self.db.deleteScopeAdjustment(adjId).then(function () {
                    self.showScopeAdjustments(rifle.id);
                });
            }
        });
    }
};

// ── Scope Adjustment Form ───────────────────────────────────────

HistoryManager.prototype.showScopeAdjustmentForm = function (rifleId) {
    var self = this;
    this.db.getRifle(rifleId).then(function (rifle) {
        if (!rifle) { self.profileManager.showRifleList(); return; }
        self._renderScopeAdjustmentForm(rifle);
    });
};

HistoryManager.prototype._renderScopeAdjustmentForm = function (rifle) {
    var container = this.profileManager.container;
    var today = new Date().toISOString().split('T')[0];

    var html = this._toolbarHtml('btn-form-back', 'Back', 'Add adjustment');
    html += '<div class="screen">';

    html += '<form id="scope-adj-form">';

    html += '<div class="field">';
    html += '<label class="field-label" for="sa-date">Date</label>';
    html += '<input type="date" id="sa-date" value="' + today + '">';
    html += '</div>';

    html += '<div class="field-row">';
    html += '<div class="field">';
    html += '<label class="field-label" for="sa-elev">Elevation <span class="field-unit">MOA</span></label>';
    html += '<input type="number" id="sa-elev" step="0.25" inputmode="decimal" placeholder="0">';
    html += '<p class="field-hint">+ up / - down</p>';
    html += '</div>';
    html += '<div class="field">';
    html += '<label class="field-label" for="sa-wind">Windage <span class="field-unit">MOA</span></label>';
    html += '<input type="number" id="sa-wind" step="0.25" inputmode="decimal" placeholder="0">';
    html += '<p class="field-hint">+ right / - left</p>';
    html += '</div>';
    html += '</div>';

    html += '<div class="field">';
    html += '<label class="field-label" for="sa-reason">Reason</label>';
    html += '<input type="text" id="sa-reason" maxlength="100" placeholder="e.g. zero confirmation, load change">';
    html += '</div>';

    html += '<div class="field">';
    html += '<label class="field-label" for="sa-notes">Notes</label>';
    html += '<textarea id="sa-notes" rows="2" placeholder="Optional notes"></textarea>';
    html += '</div>';
    html += '<p id="sa-error" class="field-error"></p>';

    html += '<button type="submit" class="action-primary u-mt-10">Save</button>';

    html += '</form>';
    html += '</div>';
    container.innerHTML = html;

    var self = this;

    document.getElementById('btn-form-back').addEventListener('click', function () {
        self.showScopeAdjustments(rifle.id);
    });

    document.getElementById('scope-adj-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var elev = parseFloat(document.getElementById('sa-elev').value) || 0;
        var wind = parseFloat(document.getElementById('sa-wind').value) || 0;
        var errEl = document.getElementById('sa-error');
        if (elev === 0 && wind === 0) {
            // A 0/0 adjustment is noise in the trend data
            if (errEl) errEl.textContent = 'Enter at least one non-zero adjustment.';
            return;
        }
        var data = {
            rifleId: rifle.id,
            date: document.getElementById('sa-date').value || new Date().toISOString(),
            elevationChange: elev,
            windageChange: wind,
            reason: document.getElementById('sa-reason').value.trim(),
            notes: document.getElementById('sa-notes').value.trim()
        };
        self.db.addScopeAdjustment(data).then(function () {
            self.showScopeAdjustments(rifle.id);
        });
    });
};

// ── Misc (Quick Mode) Sessions ──────────────────────────────────

/**
 * Show all sessions without a rifle association (Quick/Misc mode).
 */
HistoryManager.prototype.showMiscSessionList = function () {
    var self = this;
    this.db.getMiscSessions().then(function (sessions) {
        sessions.sort(function (a, b) {
            return (b.date || '').localeCompare(a.date || '');
        });
        self._renderMiscSessionList(sessions);
    });
};

HistoryManager.prototype._renderMiscSessionList = function (sessions) {
    var container = this.profileManager.container;

    var html = this._toolbarHtml('btn-misc-back', 'Profiles', 'Misc sessions');
    html += '<div class="screen">';

    if (sessions.length === 0) {
        html += '<div class="empty-teach">';
        html += '<p>Sessions saved without a rifle profile land here.</p>';
        html += '<button class="action-primary" id="btn-misc-start">' + Icon('camera', 20) + 'Check a target</button>';
        html += '</div>';
    } else {
        html += this._sessionRowsHtml(sessions);
    }

    html += '</div>';
    container.innerHTML = html;

    var self = this;

    document.getElementById('btn-misc-back').addEventListener('click', function () {
        self.profileManager.showRifleList();
    });

    var startBtn = document.getElementById('btn-misc-start');
    if (startBtn) {
        startBtn.addEventListener('click', function () {
            if (window.AppNav) window.AppNav.go('session');
        });
    }

    var rows = container.querySelectorAll('.row-item[data-session-id]');
    for (var i = 0; i < rows.length; i++) {
        rows[i].addEventListener('click', function () {
            var sid = this.getAttribute('data-session-id');
            self.showMiscSessionDetail(sid);
        });
    }

    this._loadThumbnails(container);
};

/**
 * Show detail for a misc session. Back navigates to misc list.
 */
HistoryManager.prototype.showMiscSessionDetail = function (sessionId) {
    var self = this;
    this.db.getSession(sessionId).then(function (session) {
        if (!session) { self.showMiscSessionList(); return; }
        self._renderMiscSessionDetail(session);
    });
};

HistoryManager.prototype._renderMiscSessionDetail = function (session) {
    var container = this.profileManager.container;
    var dateStr = session.date ? new Date(session.date).toLocaleDateString() : 'Unknown date';

    var html = this._toolbarHtml('btn-misc-detail-back', 'Misc sessions', escapeHtml(dateStr));
    html += '<div class="screen">';
    html += this._sessionDetailBodyHtml(session);
    html += '</div>';
    container.innerHTML = html;

    var self = this;

    document.getElementById('btn-misc-detail-back').addEventListener('click', function () {
        self.showMiscSessionList();
    });

    document.getElementById('btn-delete-session').addEventListener('click', function () {
        if (confirm('Delete this session?')) {
            self.db.deleteSession(session.id).then(function () {
                self.showMiscSessionList();
            });
        }
    });

    this._loadFullImage(session.id);
};

// ── Round Count Helpers ─────────────────────────────────────────

/**
 * Rounds since last cleaning = barrel totalRounds minus roundCountAtCleaning
 * from the most recent cleaning log entry.
 * @param {number} totalRounds - The barrel's manually-tracked total round count.
 * @param {Array} cleaningLogs - Cleaning log entries for this barrel.
 * @returns {number}
 */
HistoryManager.prototype._computeRoundsSinceCleaning = function (totalRounds, cleaningLogs) {
    if (cleaningLogs.length === 0) {
        return totalRounds;
    }

    // Find the cleaning log with the latest date
    var latest = cleaningLogs[0];
    for (var i = 1; i < cleaningLogs.length; i++) {
        if ((cleaningLogs[i].date || '') > (latest.date || '')) {
            latest = cleaningLogs[i];
        }
    }

    var diff = totalRounds - (latest.roundCountAtCleaning || 0);
    return diff >= 0 ? diff : 0;
};

// ── Image Helpers ───────────────────────────────────────────────

/**
 * Revoke all tracked thumbnail object URLs.
 */
HistoryManager.prototype._revokeThumbnailUrls = function () {
    for (var i = 0; i < this._thumbnailUrls.length; i++) {
        URL.revokeObjectURL(this._thumbnailUrls[i]);
    }
    this._thumbnailUrls = [];
};

/**
 * Load thumbnails for all .thumb images in a container.
 * Images without a stored thumbnail are hidden.
 */
HistoryManager.prototype._loadThumbnails = function (container) {
    this._revokeThumbnailUrls();
    var self = this;
    var imgs = container.querySelectorAll('img.thumb[data-session-id]');
    for (var i = 0; i < imgs.length; i++) {
        (function (img) {
            var sid = img.getAttribute('data-session-id');
            if (!sid) return;
            self.db.getSessionImage(sid).then(function (record) {
                if (record && record.thumbnailBlob) {
                    var url = URL.createObjectURL(record.thumbnailBlob);
                    self._thumbnailUrls.push(url);
                    img.src = url;
                } else {
                    img.classList.add('hidden');
                }
            }).catch(function () {
                img.classList.add('hidden');
            });
        })(imgs[i]);
    }
};

/**
 * Load and display the full annotated image for a session detail view.
 */
HistoryManager.prototype._loadFullImage = function (sessionId) {
    var self = this;
    var imgEl = document.getElementById('session-full-image');
    var loadingEl = document.getElementById('session-image-loading');
    var actionsEl = document.getElementById('session-image-actions');
    if (!imgEl || !loadingEl) return;

    this.db.getSessionImage(sessionId).then(function (record) {
        if (record && record.fullBlob) {
            var url = URL.createObjectURL(record.fullBlob);
            imgEl.src = url;
            imgEl.classList.remove('hidden');
            loadingEl.classList.add('hidden');
            if (actionsEl) actionsEl.classList.remove('hidden');

            // Bind save button
            var saveBtn = document.getElementById('btn-session-save-image');
            if (saveBtn) {
                saveBtn.addEventListener('click', function () {
                    self._downloadBlob(record.fullBlob, 'ballistic-group-' + Date.now() + '.jpg');
                });
            }

            // Bind share button
            var shareBtn = document.getElementById('btn-session-share-image');
            if (shareBtn) {
                shareBtn.addEventListener('click', function () {
                    self._shareBlob(record.fullBlob);
                });
            }

            // Object URL stays valid until the next render replaces the view
        } else {
            loadingEl.textContent = 'No image available';
        }
    }).catch(function () {
        loadingEl.textContent = 'Failed to load image';
    });
};

/**
 * Download a blob as a file.
 */
HistoryManager.prototype._downloadBlob = function (blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

/**
 * Share a blob via Web Share API, falling back to download.
 */
HistoryManager.prototype._shareBlob = function (blob) {
    if (navigator.share && navigator.canShare) {
        var file = new File([blob], 'ballistic-group.jpg', { type: 'image/jpeg' });
        var shareData = { files: [file] };
        if (navigator.canShare(shareData)) {
            navigator.share(shareData).catch(function () {});
            return;
        }
    }
    this._downloadBlob(blob, 'ballistic-group-' + Date.now() + '.jpg');
};
