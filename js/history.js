/**
 * history.js — Session history, cleaning logs, scope adjustments.
 *
 * Renders into the ProfileManager's container (#view-profiles).
 * Navigated to from rifle detail view in profiles.
 */

function HistoryManager(db, profileManager) {
    this.db = db;
    this.profileManager = profileManager;
    this._thumbnailUrls = [];
}

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
    var html = '<div class="profile-screen">';

    html += '<div class="profile-toolbar">';
    html += '<button class="btn-back" id="btn-history-back">&lsaquo; ' + escapeHtml(rifle.name) + '</button>';
    html += '<h2 class="profile-title">Session History</h2>';
    html += '<div class="toolbar-spacer"></div>';
    html += '</div>';

    if (sessions.length === 0) {
        html += '<div class="empty-state">';
        html += '<img src="assets/logo.png" alt="" class="empty-state-logo" onerror="this.style.display=\'none\'">';
        html += '<p class="empty-state-text">No sessions yet</p>';
        html += '<p class="empty-state-sub">Complete a session and tap "Save Session" to log it here</p>';
        html += '</div>';
    } else {
        html += '<div class="profile-list">';
        for (var i = 0; i < sessions.length; i++) {
            var s = sessions[i];
            var dateStr = s.date ? new Date(s.date).toLocaleDateString() : 'Unknown date';
            var groupStr = s.results && s.results.groupSizeMOA != null
                ? formatFixed(s.results.groupSizeMOA, 2) + ' MOA'
                : '—';
            var shotCount = s.impacts ? s.impacts.length : 0;

            html += '<div class="profile-card session-card" data-session-id="' + escapeAttr(s.id) + '">';
            html += '<img class="session-thumbnail" data-session-id="' + escapeAttr(s.id) + '">';
            html += '<div class="profile-card-main">';
            html += '<span class="profile-card-name">' + escapeHtml(dateStr) + ' &middot; ' + s.distanceYards + ' yds</span>';
            html += '<span class="profile-card-sub">' + shotCount + ' shots &middot; ES: ' + groupStr + '</span>';
            html += '</div>';
            html += '<span class="profile-card-arrow">&rsaquo;</span>';
            html += '</div>';
        }
        html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;

    var self = this;

    document.getElementById('btn-history-back').addEventListener('click', function () {
        self.profileManager.showRifleDetail(rifle.id);
    });

    var cards = container.querySelectorAll('.session-card');
    for (var i = 0; i < cards.length; i++) {
        cards[i].addEventListener('click', function () {
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

HistoryManager.prototype._renderSessionDetail = function (session, rifleId) {
    var container = this.profileManager.container;
    var r = session.results;
    var dateStr = session.date ? new Date(session.date).toLocaleDateString() : 'Unknown date';

    var html = '<div class="profile-screen">';

    html += '<div class="profile-toolbar">';
    html += '<button class="btn-back" id="btn-session-detail-back">&lsaquo; History</button>';
    html += '<h2 class="profile-title">' + escapeHtml(dateStr) + '</h2>';
    html += '<div class="toolbar-spacer"></div>';
    html += '</div>';

    // Results card
    if (r) {
        html += '<div class="detail-card">';
        html += '<div class="detail-row"><span class="detail-label">Distance</span><span class="detail-value">' + session.distanceYards + ' yds</span></div>';
        html += '<div class="detail-row"><span class="detail-label">Shots</span><span class="detail-value">' + (session.impacts ? session.impacts.length : 0) + '</span></div>';
        html += '<div class="detail-row"><span class="detail-label">Extreme Spread</span><span class="detail-value">' + formatFixed(r.groupSizeInches, 3) + '&quot; / ' + formatFixed(r.groupSizeMOA, 2) + ' MOA</span></div>';
        html += '<div class="detail-row"><span class="detail-label">Mean Radius</span><span class="detail-value">' + formatFixed(r.meanRadiusInches, 3) + '&quot; / ' + formatFixed(r.meanRadiusMOA, 2) + ' MOA</span></div>';
        html += '<div class="detail-row"><span class="detail-label">Vertical Spread</span><span class="detail-value">' + formatFixed(r.verticalSpreadInches, 3) + '&quot;</span></div>';
        html += '<div class="detail-row"><span class="detail-label">Horizontal Spread</span><span class="detail-value">' + formatFixed(r.horizontalSpreadInches, 3) + '&quot;</span></div>';
        if (r.elevationOffsetMOA != null) {
            var elevSign = r.elevationOffsetInches >= 0 ? 'High' : 'Low';
            html += '<div class="detail-row"><span class="detail-label">Elevation Offset</span><span class="detail-value">' + formatFixed(Math.abs(r.elevationOffsetInches), 3) + '&quot; ' + elevSign + '</span></div>';
        }
        if (r.windageOffsetMOA != null) {
            var windSign = r.windageOffsetInches >= 0 ? 'Right' : 'Left';
            html += '<div class="detail-row"><span class="detail-label">Windage Offset</span><span class="detail-value">' + formatFixed(Math.abs(r.windageOffsetInches), 3) + '&quot; ' + windSign + '</span></div>';
        }

        // Advanced Stats (collapsible)
        if (r.cepInches != null) {
            html += '<details class="session-details" style="margin-top:8px;">';
            html += '<summary class="session-details-summary">Advanced Stats</summary>';
            html += '<div class="session-details-body">';
            html += '<div class="detail-row"><span class="detail-label">CEP (50%)</span><span class="detail-value">' + formatFixed(r.cepInches, 3) + '&quot; / ' + formatFixed(r.cepMOA, 2) + ' MOA</span></div>';
            html += '<div class="detail-row"><span class="detail-label">Radial SD</span><span class="detail-value">' + formatFixed(r.radialSDInches, 3) + '&quot; / ' + formatFixed(r.radialSDMOA, 2) + ' MOA</span></div>';
            html += '<div class="detail-row"><span class="detail-label">Vertical SD</span><span class="detail-value">' + formatFixed(r.verticalSDInches, 3) + '&quot; / ' + formatFixed(r.verticalSDMOA, 2) + ' MOA</span></div>';
            html += '<div class="detail-row"><span class="detail-label">Horizontal SD</span><span class="detail-value">' + formatFixed(r.horizontalSDInches, 3) + '&quot; / ' + formatFixed(r.horizontalSDMOA, 2) + ' MOA</span></div>';
            var mElevSign = r.meanElevationInches >= 0 ? 'High' : 'Low';
            html += '<div class="detail-row"><span class="detail-label">Mean Elevation</span><span class="detail-value">' + formatFixed(Math.abs(r.meanElevationInches), 3) + '&quot; ' + mElevSign + ' / ' + formatFixed(r.meanElevationMOA, 2) + ' MOA</span></div>';
            var mWindSign = r.meanWindageInches >= 0 ? 'Right' : 'Left';
            html += '<div class="detail-row"><span class="detail-label">Mean Windage</span><span class="detail-value">' + formatFixed(Math.abs(r.meanWindageInches), 3) + '&quot; ' + mWindSign + ' / ' + formatFixed(r.meanWindageMOA, 2) + ' MOA</span></div>';
            html += '</div></details>';
        }

        html += '</div>';
    }

    // Session details (collapsible)
    html += '<details class="session-details">';
    html += '<summary class="session-details-summary">Session Details</summary>';
    html += '<div class="session-details-body">';
    html += '<div class="detail-card">';

    if (session.bulletDiameter) {
        html += '<div class="detail-row"><span class="detail-label">Bullet Diameter</span><span class="detail-value">' + session.bulletDiameter + '&quot;</span></div>';
    }
    if (session.roundsFired) {
        html += '<div class="detail-row"><span class="detail-label">Rounds Fired</span><span class="detail-value">' + session.roundsFired + '</span></div>';
    }
    if (session.measuredVelocity) {
        html += '<div class="detail-row"><span class="detail-label">Measured Velocity</span><span class="detail-value">' + session.measuredVelocity + ' fps</span></div>';
    }

    // Weather
    var w = session.weather;
    if (w) {
        if (w.tempF != null) {
            html += '<div class="detail-row"><span class="detail-label">Temperature</span><span class="detail-value">' + w.tempF + '&deg;F</span></div>';
        }
        if (w.humidity != null) {
            html += '<div class="detail-row"><span class="detail-label">Humidity</span><span class="detail-value">' + w.humidity + '%</span></div>';
        }
        if (w.windMph != null) {
            html += '<div class="detail-row"><span class="detail-label">Wind</span><span class="detail-value">' + w.windMph + ' mph' + (w.windDir ? ' ' + escapeHtml(w.windDir) : '') + '</span></div>';
        }
        if (w.altitudeFt != null) {
            html += '<div class="detail-row"><span class="detail-label">Altitude</span><span class="detail-value">' + w.altitudeFt + ' ft</span></div>';
        }
        if (w.pressureInHg != null) {
            html += '<div class="detail-row"><span class="detail-label">Pressure</span><span class="detail-value">' + w.pressureInHg + '&quot; Hg</span></div>';
        }
    }

    html += '</div></div></details>';

    // Annotated image
    html += '<div class="session-image-container">';
    html += '<p class="session-image-loading" id="session-image-loading">Loading image...</p>';
    html += '<img class="session-full-image" id="session-full-image" style="display:none">';
    html += '</div>';
    html += '<div class="btn-row" id="session-image-actions" style="display:none;padding:0 16px 8px;">';
    html += '<button class="btn btn-secondary" id="btn-session-save-image">Save Image</button>';
    html += '<button class="btn btn-secondary" id="btn-session-share-image">Share</button>';
    html += '</div>';

    // Delete button
    html += '<div class="btn-row" style="padding: 16px;">';
    html += '<button class="btn btn-danger" id="btn-delete-session">Delete Session</button>';
    html += '</div>';

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

    var html = '<div class="profile-screen">';

    html += '<div class="profile-toolbar">';
    html += '<button class="btn-back" id="btn-cleaning-back">&lsaquo; ' + escapeHtml(rifle.name) + '</button>';
    html += '<h2 class="profile-title">Cleaning Log</h2>';
    html += '<button class="btn btn-sm btn-primary" id="btn-add-cleaning">+ Add</button>';
    html += '</div>';

    // Dashboard stats
    html += '<div style="display:flex;gap:8px;padding:0 16px 12px;">';
    html += '<div class="dashboard-stat"><span class="dashboard-stat-value">' + totalRounds + '</span><span class="dashboard-stat-label">Total Rounds</span></div>';
    html += '<div class="dashboard-stat"><span class="dashboard-stat-value">' + roundsSinceCleaning + '</span><span class="dashboard-stat-label">Since Cleaning</span></div>';
    html += '</div>';

    if (logs.length === 0) {
        html += '<div class="empty-state">';
        html += '<p class="empty-state-text">No cleaning entries</p>';
        html += '<p class="empty-state-sub">Tap "+ Add" to log a cleaning</p>';
        html += '</div>';
    } else {
        html += '<div class="profile-list">';
        for (var i = 0; i < logs.length; i++) {
            var log = logs[i];
            var dateStr = log.date ? new Date(log.date).toLocaleDateString() : 'Unknown date';
            html += '<div class="log-entry" data-log-id="' + escapeAttr(log.id) + '">';
            html += '<div class="log-entry-main">';
            html += '<span class="log-entry-date">' + escapeHtml(dateStr) + '</span>';
            html += '<span class="log-entry-detail">' + log.roundCountAtCleaning + ' rounds at cleaning</span>';
            if (log.notes) {
                html += '<span class="log-entry-detail">' + escapeHtml(log.notes) + '</span>';
            }
            html += '</div>';
            html += '<button class="btn-icon btn-delete-log" data-log-id="' + escapeAttr(log.id) + '" title="Delete">&times;</button>';
            html += '</div>';
        }
        html += '</div>';
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

    var delBtns = container.querySelectorAll('.btn-delete-log');
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

    var html = '<div class="profile-screen">';

    html += '<div class="profile-toolbar">';
    html += '<button class="btn-back" id="btn-form-back">&lsaquo; Back</button>';
    html += '<h2 class="profile-title">Add Cleaning</h2>';
    html += '<div class="toolbar-spacer"></div>';
    html += '</div>';

    html += '<form id="cleaning-form" class="profile-form">';

    html += '<div class="form-group">';
    html += '<label for="cl-date">Date</label>';
    html += '<input type="date" id="cl-date" value="' + today + '">';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label for="cl-rounds">Round Count at Cleaning</label>';
    html += '<input type="number" id="cl-rounds" min="0" step="1" inputmode="numeric" placeholder="' + totalRounds + '" value="' + totalRounds + '">';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label for="cl-notes">Notes</label>';
    html += '<textarea id="cl-notes" rows="2" placeholder="Optional notes"></textarea>';
    html += '</div>';

    html += '<div class="btn-row">';
    html += '<button type="submit" class="btn btn-primary">Save</button>';
    html += '</div>';

    html += '</form>';
    html += '</div>';
    container.innerHTML = html;

    var self = this;

    document.getElementById('btn-form-back').addEventListener('click', function () {
        self.showCleaningLog(rifle.id, barrelId);
    });

    document.getElementById('cleaning-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var data = {
            rifleId: rifle.id,
            barrelId: barrelId,
            date: document.getElementById('cl-date').value || new Date().toISOString(),
            roundCountAtCleaning: parseInt(document.getElementById('cl-rounds').value, 10) || 0,
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

    var html = '<div class="profile-screen">';

    html += '<div class="profile-toolbar">';
    html += '<button class="btn-back" id="btn-scope-back">&lsaquo; ' + escapeHtml(rifle.name) + '</button>';
    html += '<h2 class="profile-title">Scope Adjustments</h2>';
    html += '<button class="btn btn-sm btn-primary" id="btn-add-scope-adj">+ Add</button>';
    html += '</div>';

    if (adjustments.length === 0) {
        html += '<div class="empty-state">';
        html += '<p class="empty-state-text">No scope adjustments</p>';
        html += '<p class="empty-state-sub">Tap "+ Add" to log a scope change</p>';
        html += '</div>';
    } else {
        html += '<div class="profile-list">';
        for (var i = 0; i < adjustments.length; i++) {
            var adj = adjustments[i];
            var dateStr = adj.date ? new Date(adj.date).toLocaleDateString() : 'Unknown date';
            var elevDir = adj.elevationChange >= 0 ? 'Up' : 'Down';
            var windDir = adj.windageChange >= 0 ? 'Right' : 'Left';

            html += '<div class="log-entry" data-adj-id="' + escapeAttr(adj.id) + '">';
            html += '<div class="log-entry-main">';
            html += '<span class="log-entry-date">' + escapeHtml(dateStr) + '</span>';
            html += '<span class="log-entry-detail">';
            html += elevDir + ' ' + formatFixed(Math.abs(adj.elevationChange), 2) + ' MOA, ';
            html += windDir + ' ' + formatFixed(Math.abs(adj.windageChange), 2) + ' MOA';
            html += '</span>';
            if (adj.reason) {
                html += '<span class="log-entry-detail">' + escapeHtml(adj.reason) + '</span>';
            }
            html += '</div>';
            html += '<button class="btn-icon btn-delete-adj" data-adj-id="' + escapeAttr(adj.id) + '" title="Delete">&times;</button>';
            html += '</div>';
        }
        html += '</div>';
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

    var delBtns = container.querySelectorAll('.btn-delete-adj');
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

    var html = '<div class="profile-screen">';

    html += '<div class="profile-toolbar">';
    html += '<button class="btn-back" id="btn-form-back">&lsaquo; Back</button>';
    html += '<h2 class="profile-title">Add Adjustment</h2>';
    html += '<div class="toolbar-spacer"></div>';
    html += '</div>';

    html += '<form id="scope-adj-form" class="profile-form">';

    html += '<div class="form-group">';
    html += '<label for="sa-date">Date</label>';
    html += '<input type="date" id="sa-date" value="' + today + '">';
    html += '</div>';

    html += '<div class="form-row">';
    html += '<div class="form-group form-group-half">';
    html += '<label for="sa-elev">Elevation (MOA)</label>';
    html += '<input type="number" id="sa-elev" step="0.25" inputmode="decimal" placeholder="0">';
    html += '<span class="form-hint">+ Up / - Down</span>';
    html += '</div>';
    html += '<div class="form-group form-group-half">';
    html += '<label for="sa-wind">Windage (MOA)</label>';
    html += '<input type="number" id="sa-wind" step="0.25" inputmode="decimal" placeholder="0">';
    html += '<span class="form-hint">+ Right / - Left</span>';
    html += '</div>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label for="sa-reason">Reason</label>';
    html += '<input type="text" id="sa-reason" maxlength="100" placeholder="e.g., Zero confirmation, Load change">';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label for="sa-notes">Notes</label>';
    html += '<textarea id="sa-notes" rows="2" placeholder="Optional notes"></textarea>';
    html += '</div>';

    html += '<div class="btn-row">';
    html += '<button type="submit" class="btn btn-primary">Save</button>';
    html += '</div>';

    html += '</form>';
    html += '</div>';
    container.innerHTML = html;

    var self = this;

    document.getElementById('btn-form-back').addEventListener('click', function () {
        self.showScopeAdjustments(rifle.id);
    });

    document.getElementById('scope-adj-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var data = {
            rifleId: rifle.id,
            date: document.getElementById('sa-date').value || new Date().toISOString(),
            elevationChange: parseFloat(document.getElementById('sa-elev').value) || 0,
            windageChange: parseFloat(document.getElementById('sa-wind').value) || 0,
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
    var html = '<div class="profile-screen">';

    html += '<div class="profile-toolbar">';
    html += '<button class="btn-back" id="btn-misc-back">&lsaquo; Profiles</button>';
    html += '<h2 class="profile-title">Misc Sessions</h2>';
    html += '<div class="toolbar-spacer"></div>';
    html += '</div>';

    if (sessions.length === 0) {
        html += '<div class="empty-state">';
        html += '<img src="assets/logo.png" alt="" class="empty-state-logo" onerror="this.style.display=\'none\'">';
        html += '<p class="empty-state-text">No misc sessions</p>';
        html += '<p class="empty-state-sub">Sessions saved without a rifle profile appear here</p>';
        html += '</div>';
    } else {
        html += '<div class="profile-list">';
        for (var i = 0; i < sessions.length; i++) {
            var s = sessions[i];
            var dateStr = s.date ? new Date(s.date).toLocaleDateString() : 'Unknown date';
            var groupStr = s.results && s.results.groupSizeMOA != null
                ? formatFixed(s.results.groupSizeMOA, 2) + ' MOA'
                : '—';
            var shotCount = s.impacts ? s.impacts.length : 0;

            html += '<div class="profile-card session-card" data-session-id="' + escapeAttr(s.id) + '">';
            html += '<img class="session-thumbnail" data-session-id="' + escapeAttr(s.id) + '">';
            html += '<div class="profile-card-main">';
            html += '<span class="profile-card-name">' + escapeHtml(dateStr) + ' &middot; ' + s.distanceYards + ' yds</span>';
            html += '<span class="profile-card-sub">' + shotCount + ' shots &middot; ES: ' + groupStr + '</span>';
            html += '</div>';
            html += '<span class="profile-card-arrow">&rsaquo;</span>';
            html += '</div>';
        }
        html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;

    var self = this;

    document.getElementById('btn-misc-back').addEventListener('click', function () {
        self.profileManager.showRifleList();
    });

    var cards = container.querySelectorAll('.session-card');
    for (var i = 0; i < cards.length; i++) {
        cards[i].addEventListener('click', function () {
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
    var r = session.results;
    var dateStr = session.date ? new Date(session.date).toLocaleDateString() : 'Unknown date';

    var html = '<div class="profile-screen">';

    html += '<div class="profile-toolbar">';
    html += '<button class="btn-back" id="btn-misc-detail-back">&lsaquo; Misc Sessions</button>';
    html += '<h2 class="profile-title">' + escapeHtml(dateStr) + '</h2>';
    html += '<div class="toolbar-spacer"></div>';
    html += '</div>';

    // Results card
    if (r) {
        html += '<div class="detail-card">';
        html += '<div class="detail-row"><span class="detail-label">Distance</span><span class="detail-value">' + session.distanceYards + ' yds</span></div>';
        html += '<div class="detail-row"><span class="detail-label">Shots</span><span class="detail-value">' + (session.impacts ? session.impacts.length : 0) + '</span></div>';
        html += '<div class="detail-row"><span class="detail-label">Extreme Spread</span><span class="detail-value">' + formatFixed(r.groupSizeInches, 3) + '&quot; / ' + formatFixed(r.groupSizeMOA, 2) + ' MOA</span></div>';
        html += '<div class="detail-row"><span class="detail-label">Mean Radius</span><span class="detail-value">' + formatFixed(r.meanRadiusInches, 3) + '&quot; / ' + formatFixed(r.meanRadiusMOA, 2) + ' MOA</span></div>';
        html += '<div class="detail-row"><span class="detail-label">Vertical Spread</span><span class="detail-value">' + formatFixed(r.verticalSpreadInches, 3) + '&quot;</span></div>';
        html += '<div class="detail-row"><span class="detail-label">Horizontal Spread</span><span class="detail-value">' + formatFixed(r.horizontalSpreadInches, 3) + '&quot;</span></div>';
        if (r.elevationOffsetMOA != null) {
            var elevSign = r.elevationOffsetInches >= 0 ? 'High' : 'Low';
            html += '<div class="detail-row"><span class="detail-label">Elevation Offset</span><span class="detail-value">' + formatFixed(Math.abs(r.elevationOffsetInches), 3) + '&quot; ' + elevSign + '</span></div>';
        }
        if (r.windageOffsetMOA != null) {
            var windSign = r.windageOffsetInches >= 0 ? 'Right' : 'Left';
            html += '<div class="detail-row"><span class="detail-label">Windage Offset</span><span class="detail-value">' + formatFixed(Math.abs(r.windageOffsetInches), 3) + '&quot; ' + windSign + '</span></div>';
        }

        // Advanced Stats (collapsible)
        if (r.cepInches != null) {
            html += '<details class="session-details" style="margin-top:8px;">';
            html += '<summary class="session-details-summary">Advanced Stats</summary>';
            html += '<div class="session-details-body">';
            html += '<div class="detail-row"><span class="detail-label">CEP (50%)</span><span class="detail-value">' + formatFixed(r.cepInches, 3) + '&quot; / ' + formatFixed(r.cepMOA, 2) + ' MOA</span></div>';
            html += '<div class="detail-row"><span class="detail-label">Radial SD</span><span class="detail-value">' + formatFixed(r.radialSDInches, 3) + '&quot; / ' + formatFixed(r.radialSDMOA, 2) + ' MOA</span></div>';
            html += '<div class="detail-row"><span class="detail-label">Vertical SD</span><span class="detail-value">' + formatFixed(r.verticalSDInches, 3) + '&quot; / ' + formatFixed(r.verticalSDMOA, 2) + ' MOA</span></div>';
            html += '<div class="detail-row"><span class="detail-label">Horizontal SD</span><span class="detail-value">' + formatFixed(r.horizontalSDInches, 3) + '&quot; / ' + formatFixed(r.horizontalSDMOA, 2) + ' MOA</span></div>';
            var mElevSign = r.meanElevationInches >= 0 ? 'High' : 'Low';
            html += '<div class="detail-row"><span class="detail-label">Mean Elevation</span><span class="detail-value">' + formatFixed(Math.abs(r.meanElevationInches), 3) + '&quot; ' + mElevSign + ' / ' + formatFixed(r.meanElevationMOA, 2) + ' MOA</span></div>';
            var mWindSign = r.meanWindageInches >= 0 ? 'Right' : 'Left';
            html += '<div class="detail-row"><span class="detail-label">Mean Windage</span><span class="detail-value">' + formatFixed(Math.abs(r.meanWindageInches), 3) + '&quot; ' + mWindSign + ' / ' + formatFixed(r.meanWindageMOA, 2) + ' MOA</span></div>';
            html += '</div></details>';
        }

        html += '</div>';
    }

    // Session details (collapsible)
    html += '<details class="session-details">';
    html += '<summary class="session-details-summary">Session Details</summary>';
    html += '<div class="session-details-body">';
    html += '<div class="detail-card">';

    if (session.bulletDiameter) {
        html += '<div class="detail-row"><span class="detail-label">Bullet Diameter</span><span class="detail-value">' + session.bulletDiameter + '&quot;</span></div>';
    }
    if (session.roundsFired) {
        html += '<div class="detail-row"><span class="detail-label">Rounds Fired</span><span class="detail-value">' + session.roundsFired + '</span></div>';
    }
    if (session.measuredVelocity) {
        html += '<div class="detail-row"><span class="detail-label">Measured Velocity</span><span class="detail-value">' + session.measuredVelocity + ' fps</span></div>';
    }

    var w = session.weather;
    if (w) {
        if (w.tempF != null) {
            html += '<div class="detail-row"><span class="detail-label">Temperature</span><span class="detail-value">' + w.tempF + '&deg;F</span></div>';
        }
        if (w.humidity != null) {
            html += '<div class="detail-row"><span class="detail-label">Humidity</span><span class="detail-value">' + w.humidity + '%</span></div>';
        }
        if (w.windMph != null) {
            html += '<div class="detail-row"><span class="detail-label">Wind</span><span class="detail-value">' + w.windMph + ' mph' + (w.windDir ? ' ' + escapeHtml(w.windDir) : '') + '</span></div>';
        }
        if (w.altitudeFt != null) {
            html += '<div class="detail-row"><span class="detail-label">Altitude</span><span class="detail-value">' + w.altitudeFt + ' ft</span></div>';
        }
        if (w.pressureInHg != null) {
            html += '<div class="detail-row"><span class="detail-label">Pressure</span><span class="detail-value">' + w.pressureInHg + '&quot; Hg</span></div>';
        }
    }

    html += '</div></div></details>';

    // Annotated image
    html += '<div class="session-image-container">';
    html += '<p class="session-image-loading" id="session-image-loading">Loading image...</p>';
    html += '<img class="session-full-image" id="session-full-image" style="display:none">';
    html += '</div>';
    html += '<div class="btn-row" id="session-image-actions" style="display:none;padding:0 16px 8px;">';
    html += '<button class="btn btn-secondary" id="btn-session-save-image">Save Image</button>';
    html += '<button class="btn btn-secondary" id="btn-session-share-image">Share</button>';
    html += '</div>';

    // Delete button
    html += '<div class="btn-row" style="padding: 16px;">';
    html += '<button class="btn btn-danger" id="btn-delete-session">Delete Session</button>';
    html += '</div>';

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
 * Load thumbnails for all session-thumbnail images in a container.
 */
HistoryManager.prototype._loadThumbnails = function (container) {
    this._revokeThumbnailUrls();
    var self = this;
    var imgs = container.querySelectorAll('img.session-thumbnail');
    for (var i = 0; i < imgs.length; i++) {
        (function (img) {
            var sid = img.getAttribute('data-session-id');
            if (!sid) return;
            self.db.getSessionImage(sid).then(function (record) {
                if (record && record.thumbnailBlob) {
                    var url = URL.createObjectURL(record.thumbnailBlob);
                    self._thumbnailUrls.push(url);
                    img.src = url;
                    img.classList.add('loaded');
                }
            }).catch(function () {});
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
            imgEl.style.display = 'block';
            loadingEl.style.display = 'none';
            if (actionsEl) actionsEl.style.display = '';

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

            // Clean up object URL when image view changes
            imgEl.addEventListener('load', function () {
                // URL stays valid until page navigates away; revoke on next render
            });
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
