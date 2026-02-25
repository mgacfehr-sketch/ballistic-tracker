/**
 * admin.js — Admin dashboard for yorT.
 *
 * Shows user overview, AI usage/cost, database stats,
 * and a full data export button.  Only accessible to the
 * hardcoded admin user ID.
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
        '<div class="admin-page">' +
        '<h2 class="admin-title">Admin Dashboard</h2>' +
        '<div id="admin-content" class="admin-loading">Loading...</div>' +
        '</div>';

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
        if (el) el.innerHTML = '<div class="admin-error">Failed to load admin data: ' + self._esc(err.message) + '</div>';
    });
};

AdminManager.prototype._render = function (stats, users, usage) {
    var self = this;
    var html = '';

    // ── Database Stats Section ────────────────────────────────
    html += '<section class="admin-section">';
    html += '<h3 class="admin-section-title">Database Stats</h3>';
    html += '<div class="admin-stats-grid">';
    html += self._statCard('Rifles', stats.totalRifles);
    html += self._statCard('Sessions', stats.totalSessions);
    html += self._statCard('Barrels', stats.totalBarrels);
    html += self._statCard('Loads', stats.totalLoads);
    html += self._statCard('AI Conversations', stats.totalConversations);
    html += self._statCard('Cleaning Logs', stats.totalCleaningLogs);
    html += self._statCard('Scope Adjustments', stats.totalScopeAdjustments);
    html += self._statCard('Zero Records', stats.totalZeroRecords);
    html += '</div>';
    html += '</section>';

    // ── AI Usage Section ──────────────────────────────────────
    var thisMonth = usage.thisMonth || {};
    var allTime = usage.allTime || {};
    var perUser = usage.perUser || [];

    html += '<section class="admin-section">';
    html += '<h3 class="admin-section-title">AI Usage</h3>';
    html += '<div class="admin-stats-grid">';
    html += self._statCard('Questions (this month)', thisMonth.totalQuestions || 0);
    html += self._statCard('Cost (this month)', '$' + self._formatCost(thisMonth.totalCost));
    html += self._statCard('Questions (all time)', allTime.totalQuestions || 0);
    html += self._statCard('Cost (all time)', '$' + self._formatCost(allTime.totalCost));
    html += '</div>';

    if (perUser.length > 0) {
        html += '<h4 class="admin-subsection-title">Per-User Breakdown</h4>';
        html += '<div class="admin-table-wrap"><table class="admin-table">';
        html += '<thead><tr><th>User</th><th>Month Qs</th><th>Month Cost</th><th>Total Qs</th><th>Total Cost</th></tr></thead>';
        html += '<tbody>';
        for (var u = 0; u < perUser.length; u++) {
            var pu = perUser[u];
            html += '<tr>';
            html += '<td>' + self._esc(pu.email || pu.user_id) + '</td>';
            html += '<td>' + (pu.month_questions || 0) + '</td>';
            html += '<td>$' + self._formatCost(pu.month_cost) + '</td>';
            html += '<td>' + (pu.total_questions || 0) + '</td>';
            html += '<td>$' + self._formatCost(pu.total_cost) + '</td>';
            html += '</tr>';
        }
        html += '</tbody></table></div>';
    }
    html += '</section>';

    // ── User Overview Section ─────────────────────────────────
    html += '<section class="admin-section">';
    html += '<h3 class="admin-section-title">Users (' + (users ? users.length : 0) + ')</h3>';
    if (users && users.length > 0) {
        html += '<div class="admin-table-wrap"><table class="admin-table">';
        html += '<thead><tr><th>Email</th><th>Rifles</th><th>Sessions</th><th>AI Qs</th><th>Last Active</th></tr></thead>';
        html += '<tbody>';
        for (var i = 0; i < users.length; i++) {
            var usr = users[i];
            var lastActive = usr.last_active ? usr.last_active.split('T')[0] : 'Never';
            html += '<tr>';
            html += '<td>' + self._esc(usr.email || usr.user_id) + '</td>';
            html += '<td>' + (usr.rifle_count || 0) + '</td>';
            html += '<td>' + (usr.session_count || 0) + '</td>';
            html += '<td>' + (usr.ai_question_count || 0) + '</td>';
            html += '<td>' + lastActive + '</td>';
            html += '</tr>';
        }
        html += '</tbody></table></div>';
    } else {
        html += '<p class="admin-empty">No users found.</p>';
    }
    html += '</section>';

    // ── Beta Features Section (hidden until features are ready) ──
    // html += '<section class="admin-section">';
    // html += '<h3 class="admin-section-title">Beta Features</h3>';
    // html += '<p class="admin-desc">Toggle features on to release them to all users.</p>';
    // html += '<div class="admin-beta-toggles">';
    // for (var fk in BETA_FEATURES) {
    //     var feat = BETA_FEATURES[fk];
    //     var checked = getBetaFlag(fk) ? ' checked' : '';
    //     html += '<label class="admin-beta-toggle">';
    //     html += '<input type="checkbox" data-feature="' + fk + '"' + checked + '>';
    //     html += '<span class="admin-beta-toggle-text">';
    //     html += '<span class="admin-beta-toggle-label">' + self._esc(feat.label) + '</span>';
    //     html += '<span class="admin-beta-toggle-desc">' + self._esc(feat.desc) + '</span>';
    //     html += '</span>';
    //     html += '</label>';
    // }
    // html += '</div>';
    // html += '</section>';

    // ── Export Button ─────────────────────────────────────────
    html += '<section class="admin-section">';
    html += '<h3 class="admin-section-title">Backup</h3>';
    html += '<p class="admin-desc">Export all data across all users as a single JSON file.</p>';
    html += '<button class="btn btn-primary" id="admin-export-btn">Export All Data</button>';
    html += '</section>';

    var contentEl = document.getElementById('admin-content');
    if (contentEl) {
        contentEl.className = '';
        contentEl.innerHTML = html;
    }

    // Bind export button
    var exportBtn = document.getElementById('admin-export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', function () {
            self._exportAllData();
        });
    }

    // Bind beta feature toggles
    var toggles = document.querySelectorAll('.admin-beta-toggle input[type="checkbox"]');
    for (var ti = 0; ti < toggles.length; ti++) {
        toggles[ti].addEventListener('change', function () {
            setBetaFlag(this.getAttribute('data-feature'), this.checked);
        });
    }
};

AdminManager.prototype._exportAllData = function () {
    var self = this;
    var btn = document.getElementById('admin-export-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Exporting...'; }

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

        if (btn) { btn.disabled = false; btn.textContent = 'Export All Data'; }
    }).catch(function (err) {
        alert('Export failed: ' + err.message);
        if (btn) { btn.disabled = false; btn.textContent = 'Export All Data'; }
    });
};

AdminManager.prototype._statCard = function (label, value) {
    return '<div class="admin-stat-card">' +
        '<div class="admin-stat-value">' + (value !== undefined ? value : 0) + '</div>' +
        '<div class="admin-stat-label">' + label + '</div>' +
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
