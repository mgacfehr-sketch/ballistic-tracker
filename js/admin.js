/**
 * admin.js — Admin dashboard for yorT.
 *
 * Shows user overview, AI usage/cost, database stats,
 * and a full data export button.  Only accessible to the
 * hardcoded admin user ID. Dense bench-seat layout on the
 * shared instrument vocabulary (css/ui.css §17).
 */

var ADMIN_USER_ID = '7288736c-d421-47e1-8562-b51dcdabd805';

function AdminManager(db) {
    this.db = db;
    this.container = null;
}

AdminManager.prototype.init = function () {
    this.container = document.getElementById('view-admin');
};

AdminManager.prototype.show = function () {
    var self = this;
    if (!self.container) return;

    self.container.innerHTML =
        '<div class="view-toolbar">' +
        '<button type="button" class="toolbar-back" id="admin-back-btn">' + Icon('chevron-left', 20) + 'Home</button>' +
        '<h2 class="toolbar-title">Admin</h2></div>' +
        '<div class="screen" id="admin-content"><p class="t-body u-quiet">Loading&hellip;</p></div>';

    var backBtn = document.getElementById('admin-back-btn');
    if (backBtn) backBtn.addEventListener('click', function () {
        if (window.AppNav) AppNav.go('home');
    });

    Promise.all([
        self.db.adminGetStats(),
        self.db.adminGetUsers(),
        self.db.adminGetUsageSummary()
    ]).then(function (results) {
        var stats = results[0];
        var users = results[1];
        var usage = results[2];
        self._render(stats, users, usage);
    }).catch(function (err) {
        var el = document.getElementById('admin-content');
        if (el) {
            el.innerHTML = '<div class="alert-strip is-stop">' + Icon('alert', 18) +
                '<span>Failed to load admin data: ' + self._esc(friendlyError(err)) + '</span></div>';
        }
    });
};

AdminManager.prototype._render = function (stats, users, usage) {
    var self = this;
    var html = '';

    // ── Database stats ────────────────────────────────────────
    html += '<div class="qcard-kicker">Database</div>';
    html += '<div class="admin-grid">';
    html += self._statCard('Rifles', stats.totalRifles);
    html += self._statCard('Sessions', stats.totalSessions);
    html += self._statCard('Barrels', stats.totalBarrels);
    html += self._statCard('Loads', stats.totalLoads);
    html += self._statCard('AI chats', stats.totalConversations);
    html += self._statCard('Cleanings', stats.totalCleaningLogs);
    html += self._statCard('Scope adj', stats.totalScopeAdjustments);
    html += self._statCard('Zero records', stats.totalZeroRecords);
    html += '</div>';

    // ── AI usage ──────────────────────────────────────────────
    var thisMonth = usage.thisMonth || {};
    var allTime = usage.allTime || {};
    var perUser = usage.perUser || [];

    html += '<div class="qcard-kicker">AI usage</div>';
    html += '<div class="plate">';
    html += '<div class="stat-strip">';
    html += self._instrument('Month qs', Number(thisMonth.totalQuestions || 0).toLocaleString());
    html += self._instrument('Month cost', '$' + self._formatCost(thisMonth.totalCost));
    html += self._instrument('All-time qs', Number(allTime.totalQuestions || 0).toLocaleString());
    html += self._instrument('All-time cost', '$' + self._formatCost(allTime.totalCost));
    html += '</div>';

    if (perUser.length > 0) {
        html += '<div class="admin-table-wrap u-mt-14"><table class="admin-table">';
        html += '<thead><tr><th>User</th><th>Month qs</th><th>Month cost</th><th>Total qs</th><th>Total cost</th></tr></thead>';
        html += '<tbody>';
        for (var u = 0; u < perUser.length; u++) {
            var pu = perUser[u];
            html += '<tr>';
            html += '<td>' + self._esc(pu.email || pu.user_id) + '</td>';
            html += '<td>' + Number(pu.month_questions || 0).toLocaleString() + '</td>';
            html += '<td>$' + self._formatCost(pu.month_cost) + '</td>';
            html += '<td>' + Number(pu.total_questions || 0).toLocaleString() + '</td>';
            html += '<td>$' + self._formatCost(pu.total_cost) + '</td>';
            html += '</tr>';
        }
        html += '</tbody></table></div>';
    }
    html += '</div>';

    // ── User overview ─────────────────────────────────────────
    html += '<div class="qcard-kicker">Users (' + (users ? users.length : 0) + ')</div>';
    if (users && users.length > 0) {
        html += '<div class="admin-table-wrap"><table class="admin-table">';
        html += '<thead><tr><th>Email</th><th>Rifles</th><th>Sessions</th><th>AI qs</th><th>Last active</th></tr></thead>';
        html += '<tbody>';
        for (var i = 0; i < users.length; i++) {
            var usr = users[i];
            var lastActive = usr.last_active ? usr.last_active.split('T')[0] : 'Never';
            html += '<tr>';
            html += '<td>' + self._esc(usr.email || usr.user_id) + '</td>';
            html += '<td>' + Number(usr.rifle_count || 0).toLocaleString() + '</td>';
            html += '<td>' + Number(usr.session_count || 0).toLocaleString() + '</td>';
            html += '<td>' + Number(usr.ai_question_count || 0).toLocaleString() + '</td>';
            html += '<td>' + lastActive + '</td>';
            html += '</tr>';
        }
        html += '</tbody></table></div>';
    } else {
        html += '<p class="t-body u-quiet">No users yet.</p>';
    }

    // (Beta-feature toggles removed with the old markup — restore the
    // section together with its bindings when features are ready.)

    // ── Crowd data warehouse ──────────────────────────────────
    html += '<div class="qcard-kicker">Crowd data</div>';
    html += '<button type="button" class="row-item" id="admin-crowd-btn">';
    html += '<div class="row-main">';
    html += '<div class="row-title">Crowd data warehouse</div>';
    html += '<div class="row-sub">Anonymized velocity and group data across all users &mdash; filter and export</div>';
    html += '</div>';
    html += '<span class="row-aside">' + Icon('chevron-right', 18) + '</span>';
    html += '</button>';

    // ── Backup ────────────────────────────────────────────────
    html += '<div class="qcard-kicker">Backup</div>';
    html += '<p class="t-micro u-mb-12">Everything across all users, one JSON file.</p>';
    html += '<button type="button" class="action" id="admin-export-btn">' + Icon('download', 18) + 'Export all data</button>';

    var contentEl = document.getElementById('admin-content');
    if (contentEl) contentEl.innerHTML = html;

    // Bind export button
    var exportBtn = document.getElementById('admin-export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', function () {
            self._exportAllData();
        });
    }

    // Bind crowd data warehouse button
    var crowdBtn = document.getElementById('admin-crowd-btn');
    if (crowdBtn) {
        crowdBtn.addEventListener('click', function () {
            self._showCrowdData();
        });
    }
};

AdminManager.prototype._showCrowdData = function () {
    var self = this;
    if (typeof CrowdDataManager === 'undefined') {
        alert('Crowd data module failed to load. Hard-reload and try again.');
        return;
    }
    if (!self.crowdManager) {
        self.crowdManager = new CrowdDataManager(self.db);
    }
    // The crowd view owns the whole admin view (its own toolbar + screen);
    // onBack re-renders the dashboard.
    if (!self.container) return;
    self.crowdManager.show(self.container, function () {
        self.show();
    });
};

AdminManager.prototype._exportAllData = function () {
    var self = this;
    var btn = document.getElementById('admin-export-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = Icon('download', 18) + 'Exporting&hellip;'; }

    self.db.adminExportAll().then(function (data) {
        var json = JSON.stringify(data, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);

        var now = new Date();
        var ts = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0') + '_' +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0');

        var a = document.createElement('a');
        a.href = url;
        a.download = 'yort-backup-' + ts + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (btn) { btn.disabled = false; btn.innerHTML = Icon('download', 18) + 'Export all data'; }
    }).catch(function (err) {
        alert('Export failed: ' + friendlyError(err));
        if (btn) { btn.disabled = false; btn.innerHTML = Icon('download', 18) + 'Export all data'; }
    });
};

/** One dense stat tile: instrument (label over numeral) on an E2 tile. */
AdminManager.prototype._statCard = function (label, value) {
    return '<div class="tile">' +
        this._instrument(label, Number(value || 0).toLocaleString()) +
        '</div>';
};

AdminManager.prototype._instrument = function (label, value) {
    return '<div class="instrument">' +
        '<div class="instrument-label">' + this._esc(label) + '</div>' +
        '<div class="instrument-value">' + value + '</div>' +
        '</div>';
};

AdminManager.prototype._formatCost = function (val) {
    var num = parseFloat(val) || 0;
    return num.toFixed(4);
};

AdminManager.prototype._esc = function (str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
};
