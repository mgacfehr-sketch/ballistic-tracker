/**
 * history.js — Session history, cleaning logs, scope adjustments.
 *
 * Renders into the ProfileManager's container (#view-profiles).
 * Navigated to from rifle detail view in profiles.
 */

function HistoryManager(db, profileManager) {
    this.db = db;
    this.profileManager = profileManager;
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
        this.db.getSessionsByRifle(rifleId)
    ]).then(function (results) {
        var rifle = results[0];
        var logs = results[1];
        var sessions = results[2];
        if (!rifle) { self.profileManager.showRifleList(); return; }

        logs.sort(function (a, b) {
            return (b.date || '').localeCompare(a.date || '');
        });

        var totalRounds = self._computeTotalRounds(sessions, barrelId);
        var roundsSinceCleaning = self._computeRoundsSinceCleaning(sessions, logs, barrelId);

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
        this.db.getSessionsByRifle(rifleId)
    ]).then(function (results) {
        var rifle = results[0];
        var sessions = results[1];
        if (!rifle) { self.profileManager.showRifleList(); return; }

        var totalRounds = self._computeTotalRounds(sessions, barrelId);
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

// ── Round Count Helpers ─────────────────────────────────────────

/**
 * Sum roundsFired from sessions associated with a barrel.
 */
HistoryManager.prototype._computeTotalRounds = function (sessions, barrelId) {
    var total = 0;
    for (var i = 0; i < sessions.length; i++) {
        if (sessions[i].barrelId === barrelId) {
            total += sessions[i].roundsFired || 0;
        }
    }
    return total;
};

/**
 * Rounds fired after the most recent cleaning log entry.
 */
HistoryManager.prototype._computeRoundsSinceCleaning = function (sessions, cleaningLogs, barrelId) {
    if (cleaningLogs.length === 0) {
        return this._computeTotalRounds(sessions, barrelId);
    }

    // Find latest cleaning date
    var latest = cleaningLogs[0].date || '';
    for (var i = 1; i < cleaningLogs.length; i++) {
        if ((cleaningLogs[i].date || '') > latest) {
            latest = cleaningLogs[i].date;
        }
    }

    var rounds = 0;
    for (var j = 0; j < sessions.length; j++) {
        if (sessions[j].barrelId === barrelId && (sessions[j].date || '') > latest) {
            rounds += sessions[j].roundsFired || 0;
        }
    }
    return rounds;
};
