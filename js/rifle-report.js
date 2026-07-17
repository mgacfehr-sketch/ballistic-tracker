/**
 * rifle-report.js — RifleReportManager: per-rifle performance report.
 *
 * Gathers all sessions, velocity strings, and loads for one rifle,
 * aggregates them via aggregateRifle() (velocity-stats.js), and renders:
 * recommended-load hero plate (stat strip of instruments), best group
 * (with target thumbnail), per-load datatable rollup, and the string
 * list with assignment status. This screen is the data source review
 * for the Certificate of Performance.
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
    container.innerHTML = '<div class="screen"><p class="u-quiet">Building report&hellip;</p></div>';

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
        container.innerHTML = '<div class="screen"><div class="alert-strip is-stop">' +
            Icon('alert', 18) + '<span>Could not build the report: ' +
            escapeHtml(err.message) + '</span></div></div>';
    });
};

RifleReportManager.prototype._render = function (rifle, agg, strings, loads) {
    var self = this;
    var loadNames = {};
    for (var i = 0; i < loads.length; i++) loadNames[loads[i].id] = loads[i].name;

    var html = '<div class="view-toolbar">';
    html += '<button class="toolbar-back" id="btn-report-back">' + Icon('chevron-left', 20) +
        '<span>' + escapeHtml(rifle.name) + '</span></button>';
    html += '<h2 class="toolbar-title">Performance report</h2>';
    html += '</div>';

    html += '<div class="screen">';

    // Pending-strings warning with resolve link
    var pending = agg.pendingStrings.unassigned + agg.pendingStrings.suggested + agg.pendingStrings.ambiguous;
    if (pending > 0) {
        html += '<div class="alert-strip u-mb-12">' + Icon('alert', 18);
        html += '<span>' + pending + ' velocity string' + (pending === 1 ? '' : 's') +
            ' not confirmed to a load yet &mdash; stats below only use confirmed strings. ' +
            '<button class="action-ghost" id="btn-report-resolve">Resolve now</button></span>';
        html += '</div>';
    }

    // HERO — recommended load
    html += '<div class="zone-hero"><div class="plate">';
    html += '<div class="instrument-label">Recommended load</div>';
    if (agg.recommendedLoadId) {
        var rec = agg.loads.filter(function (r) { return r.loadId === agg.recommendedLoadId; })[0];
        html += '<h3 class="t-title">' + escapeHtml(rec.load.name) + '</h3>';
        html += '<div class="u-mt-10"><span class="chip is-go">' + Icon('star', 14) + 'Recommended</span></div>';
        html += '<div class="stat-strip">';
        html += '<div class="instrument"><div class="instrument-label">Best group</div>' +
            '<div class="instrument-value">' + formatNum(rec.bestGroupMOA, 2) +
            '<span class="instrument-unit">MOA</span></div></div>';
        if (rec.stats.n) {
            html += '<div class="instrument"><div class="instrument-label">Avg</div>' +
                '<div class="instrument-value">' + formatNum(rec.stats.avg, 1) +
                '<span class="instrument-unit">fps</span></div></div>';
            html += '<div class="instrument"><div class="instrument-label">SD</div>' +
                '<div class="instrument-value">' + formatNum(rec.stats.sd, 1) + '</div></div>';
            html += '<div class="instrument"><div class="instrument-label">ES</div>' +
                '<div class="instrument-value">' + formatNum(rec.stats.es, 1) + '</div></div>';
        }
        html += '</div>';
        if (rec.stats.n) html += '<div class="t-micro u-mt-10">' + rec.stats.n + ' chrono shots</div>';
    } else {
        html += '<div class="empty-teach"><p>No recommendation yet &mdash; a load needs at least one saved target session with 3+ marked shots. Velocity data alone is not enough to recommend a load.</p></div>';
    }
    html += '</div></div>';

    // The one loud thing on this screen
    html += '<button class="action-primary" id="btn-generate-cert">' + Icon('award', 20) + 'Generate certificate</button>';

    // Best group
    html += '<div class="qcard-kicker">Best group</div>';
    html += '<div class="plate">';
    if (agg.bestGroup) {
        html += '<img class="thumb" id="report-best-thumb" alt="Best group target">';
        html += '<div class="instrument u-mt-10">';
        html += '<div class="instrument-value">' + formatNum(agg.bestGroup.moa, 2) +
            '<span class="instrument-unit">MOA</span></div>';
        html += '</div>';
        var facts = [];
        if (agg.bestGroup.inches !== null) facts.push(formatNum(agg.bestGroup.inches, 2) + '&Prime;');
        facts.push(agg.bestGroup.shots + ' shots at ' + (agg.bestGroup.distanceYards || '?') + ' yd');
        if (agg.bestGroup.loadId && loadNames[agg.bestGroup.loadId]) {
            facts.push(escapeHtml(loadNames[agg.bestGroup.loadId]));
        }
        if (agg.bestGroup.date) {
            var d = new Date(agg.bestGroup.date);
            if (!isNaN(d.getTime())) facts.push(d.toLocaleDateString());
        }
        html += '<div class="t-micro u-mt-10">' + facts.join(' &middot; ') + '</div>';
    } else {
        html += '<div class="empty-teach"><p>No eligible groups yet &mdash; needs a saved session with 3+ marked shots.</p></div>';
    }
    html += '</div>';

    // Per-load rollup
    html += '<div class="qcard-kicker">Loads</div>';
    if (agg.loads.length) {
        html += '<div class="datatable-wrap"><table class="datatable"><thead><tr>' +
            '<th>Load</th><th>Best grp</th><th>Avg</th><th>SD</th><th>ES</th><th>Shots</th></tr></thead><tbody>';
        for (var r = 0; r < agg.loads.length; r++) {
            var row = agg.loads[r];
            var isRec = row.loadId === agg.recommendedLoadId;
            html += '<tr' + (isRec ? ' class="is-marked"' : '') + '>';
            html += '<td>' + (isRec ? Icon('star', 12) + ' ' : '') + escapeHtml(row.load.name) + '</td>';
            html += '<td>' + (row.bestGroupMOA !== null ? formatNum(row.bestGroupMOA, 2) : '&mdash;') + '</td>';
            html += '<td>' + formatNum(row.stats.avg, 1) + '</td>';
            html += '<td>' + formatNum(row.stats.sd, 1) + '</td>';
            html += '<td>' + formatNum(row.stats.es, 1) + '</td>';
            html += '<td>' + (row.stats.n || '&mdash;') + '</td>';
            html += '</tr>';
        }
        html += '</tbody></table></div>';
    } else {
        html += '<div class="plate"><div class="empty-teach"><p>No loads on this rifle yet.</p></div></div>';
    }

    // Strings
    html += '<div class="qcard-kicker">Velocity strings (' + strings.length + ')</div>';
    if (strings.length) {
        for (var v = 0; v < strings.length; v++) {
            var s = strings[v];
            var sub = s.assignmentStatus === 'confirmed'
                ? escapeHtml(loadNames[s.loadId] || 'unknown load')
                : '<span class="chip">' + escapeHtml(s.assignmentStatus) + '</span>';
            html += '<div class="row-item">';
            html += '<div class="row-main">';
            html += '<div class="row-title">' + escapeHtml(self._stringLabel(s)) + '</div>';
            html += '<div class="row-sub">' + sub + '</div>';
            html += '</div>';
            html += '</div>';
        }
    } else {
        html += '<div class="plate"><div class="empty-teach"><p>No chrono strings imported yet &mdash; use Import chrono data on Home.</p></div></div>';
    }

    html += '</div>'; // .screen
    this.profileManager.container.innerHTML = html;

    document.getElementById('btn-report-back').addEventListener('click', function () {
        self._revokeThumb();
        self.profileManager.showRifleDetail(rifle.id);
    });
    var certBtn = document.getElementById('btn-generate-cert');
    if (certBtn) {
        certBtn.addEventListener('click', function () {
            self._revokeThumb();
            if (self.profileManager.certificateManager) {
                self.profileManager.certificateManager.showPreflight(rifle.id);
            }
        });
    }
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
