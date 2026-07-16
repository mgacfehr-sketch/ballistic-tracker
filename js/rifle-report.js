/**
 * rifle-report.js — RifleReportManager: per-rifle performance report.
 *
 * Gathers all sessions, velocity strings, and loads for one rifle,
 * aggregates them via aggregateRifle() (velocity-stats.js), and renders:
 * recommended load, best group (with target thumbnail), per-load rollup,
 * and the string list with assignment status. This screen is the data
 * source review for the Certificate of Performance.
 *
 * Renders into the ProfileManager's container (#view-profiles), like
 * history.js. Gated by hasFeature('certificate').
 */

function RifleReportManager(db, profileManager) {
    this.db = db;
    this.profileManager = profileManager;
    this._thumbUrl = null;
}

/**
 * Load everything for one rifle and render the report.
 */
RifleReportManager.prototype.show = function (rifleId) {
    var self = this;
    var container = this.profileManager.container;
    container.innerHTML = '<div class="profile-screen"><p class="chrono-intro">Building report…</p></div>';

    Promise.all([
        this.db.getRifle(rifleId),
        this.db.getSessionsByRifle(rifleId),
        this.db.getVelocityStringsByRifle(rifleId),
        this.db.getLoadsByRifle(rifleId)
    ]).then(function (results) {
        var rifle = results[0];
        if (!rifle) { self.profileManager.showRifleList(); return; }
        var agg = aggregateRifle({
            sessions: results[1] || [],
            strings: results[2] || [],
            loads: results[3] || []
        });
        self._render(rifle, agg, results[2] || [], results[3] || []);
    }).catch(function (err) {
        container.innerHTML = '<div class="profile-screen"><p class="chrono-error">Could not build the report: ' +
            escapeHtml(err.message) + '</p></div>';
    });
};

RifleReportManager.prototype._render = function (rifle, agg, strings, loads) {
    var self = this;
    var loadNames = {};
    for (var i = 0; i < loads.length; i++) loadNames[loads[i].id] = loads[i].name;

    var html = '<div class="profile-screen">';
    html += '<div class="profile-toolbar">';
    html += '<button class="btn-back" id="btn-report-back">&lsaquo; ' + escapeHtml(rifle.name) + '</button>';
    html += '<h2 class="profile-title">Performance Report</h2>';
    html += '<div class="toolbar-spacer"></div>';
    html += '</div>';

    // Pending-strings warning with resolve link
    var pending = agg.pendingStrings.unassigned + agg.pendingStrings.suggested + agg.pendingStrings.ambiguous;
    if (pending > 0) {
        html += '<div class="chrono-warnings report-pending">' + pending + ' velocity string' +
            (pending === 1 ? '' : 's') + ' not confirmed to a load yet — stats below only use confirmed strings. ';
        html += '<button class="btn btn-secondary btn-sm" id="btn-report-resolve">Resolve now</button></div>';
    }

    // Recommended load
    html += '<div class="detail-section"><div class="detail-section-header">';
    html += '<h3 class="detail-section-title">Recommended Load</h3></div>';
    if (agg.recommendedLoadId) {
        var rec = agg.loads.filter(function (r) { return r.loadId === agg.recommendedLoadId; })[0];
        html += '<div class="detail-card report-recommended">';
        html += '<h3>★ ' + escapeHtml(rec.load.name) + '</h3>';
        html += '<div class="chrono-stats-row">';
        html += '<span>best group <strong>' + formatNum(rec.bestGroupMOA, 2) + ' MOA</strong></span>';
        if (rec.stats.n) {
            html += '<span>avg <strong>' + formatNum(rec.stats.avg, 1) + '</strong> fps</span>';
            html += '<span>SD ' + formatNum(rec.stats.sd, 1) + '</span>';
            html += '<span>ES ' + formatNum(rec.stats.es, 1) + '</span>';
            html += '<span>' + rec.stats.n + ' chrono shots</span>';
        }
        html += '</div></div>';
    } else {
        html += '<div class="detail-card"><p class="chrono-intro">No recommendation yet — a load needs at least one saved target session with 3+ marked shots. Velocity data alone is not enough to recommend a load.</p></div>';
    }
    html += '</div>';

    // Best group
    html += '<div class="detail-section"><div class="detail-section-header">';
    html += '<h3 class="detail-section-title">Best Group</h3></div>';
    if (agg.bestGroup) {
        html += '<div class="detail-card report-best-group">';
        html += '<img class="report-thumb" id="report-best-thumb" alt="Best group target">';
        html += '<div class="report-best-facts">';
        html += '<h3>' + formatNum(agg.bestGroup.moa, 2) + ' MOA';
        if (agg.bestGroup.inches !== null) html += ' <span class="report-inches">(' + formatNum(agg.bestGroup.inches, 2) + '")</span>';
        html += '</h3>';
        html += '<p>' + agg.bestGroup.shots + ' shots at ' + (agg.bestGroup.distanceYards || '?') + ' yd';
        if (agg.bestGroup.loadId && loadNames[agg.bestGroup.loadId]) {
            html += ' · ' + escapeHtml(loadNames[agg.bestGroup.loadId]);
        }
        if (agg.bestGroup.date) {
            var d = new Date(agg.bestGroup.date);
            if (!isNaN(d.getTime())) html += ' · ' + d.toLocaleDateString();
        }
        html += '</p></div></div>';
    } else {
        html += '<div class="detail-card"><p class="chrono-intro">No eligible groups yet (needs a saved session with 3+ marked shots).</p></div>';
    }
    html += '</div>';

    // Per-load rollup
    html += '<div class="detail-section"><div class="detail-section-header">';
    html += '<h3 class="detail-section-title">Loads</h3></div>';
    if (agg.loads.length) {
        html += '<div class="detail-card"><table class="chrono-table"><thead><tr>' +
            '<th>Load</th><th>Best grp</th><th>Avg</th><th>SD</th><th>ES</th><th>Shots</th></tr></thead><tbody>';
        for (var r = 0; r < agg.loads.length; r++) {
            var row = agg.loads[r];
            html += '<tr' + (row.loadId === agg.recommendedLoadId ? ' class="report-rec-row"' : '') + '>';
            html += '<td>' + (row.loadId === agg.recommendedLoadId ? '★ ' : '') + escapeHtml(row.load.name) + '</td>';
            html += '<td>' + (row.bestGroupMOA !== null ? formatNum(row.bestGroupMOA, 2) : '—') + '</td>';
            html += '<td>' + formatNum(row.stats.avg, 1) + '</td>';
            html += '<td>' + formatNum(row.stats.sd, 1) + '</td>';
            html += '<td>' + formatNum(row.stats.es, 1) + '</td>';
            html += '<td>' + (row.stats.n || '—') + '</td>';
            html += '</tr>';
        }
        html += '</tbody></table></div>';
    } else {
        html += '<div class="detail-card"><p class="chrono-intro">No loads on this rifle yet.</p></div>';
    }
    html += '</div>';

    // Strings
    html += '<div class="detail-section"><div class="detail-section-header">';
    html += '<h3 class="detail-section-title">Velocity Strings (' + strings.length + ')</h3></div>';
    if (strings.length) {
        html += '<div class="detail-card"><ul class="chrono-string-list">';
        for (var v = 0; v < strings.length; v++) {
            var s = strings[v];
            var label = s.assignmentStatus === 'confirmed'
                ? '→ ' + escapeHtml(loadNames[s.loadId] || 'unknown load')
                : '<span class="chrono-badge">' + escapeHtml(s.assignmentStatus) + '</span>';
            html += '<li>' + escapeHtml(self._stringLabel(s)) + ' ' + label + '</li>';
        }
        html += '</ul></div>';
    } else {
        html += '<div class="detail-card"><p class="chrono-intro">No chrono strings imported yet — use the Chrono tab.</p></div>';
    }
    html += '</div>';

    html += '</div>'; // .profile-screen
    this.profileManager.container.innerHTML = html;

    document.getElementById('btn-report-back').addEventListener('click', function () {
        self._revokeThumb();
        self.profileManager.showRifleDetail(rifle.id);
    });
    var resolveBtn = document.getElementById('btn-report-resolve');
    if (resolveBtn) {
        resolveBtn.addEventListener('click', function () {
            if (typeof window.ChronoNav !== 'undefined') {
                window.ChronoNav.openReview(rifle.id);
            }
        });
    }

    // Lazy-load the best-group thumbnail
    if (agg.bestGroup) {
        this.db.getSessionImage(agg.bestGroup.sessionId).then(function (record) {
            var img = document.getElementById('report-best-thumb');
            if (img && record && record.thumbnailBlob) {
                self._revokeThumb();
                self._thumbUrl = URL.createObjectURL(record.thumbnailBlob);
                img.src = self._thumbUrl;
                img.classList.add('loaded');
            }
        }).catch(function () {});
    }
};

RifleReportManager.prototype._stringLabel = function (s) {
    var when = '—';
    if (s.date) {
        var d = new Date(s.date);
        if (!isNaN(d.getTime())) when = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    var n = s.shots && s.shots.length ? s.shots.length : 0;
    return when + ' · avg ' + formatNum(s.avgFps, 1) + ' · SD ' + formatNum(s.sdFps, 1) + ' · ' + n + ' shots';
};

RifleReportManager.prototype._revokeThumb = function () {
    if (this._thumbUrl) {
        URL.revokeObjectURL(this._thumbUrl);
        this._thumbUrl = null;
    }
};
