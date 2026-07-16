/**
 * chrono.js — ChronoManager: Garmin ShotView import UI.
 *
 * Lets the user pick a ShotView export (.csv single session or .xlsx
 * multi-session), parses it via garmin-import.js, and shows a preview
 * table per session with include/exclude checkboxes.
 *
 * Saving to velocity_strings comes in the next build step — this module
 * currently stops at a verified preview. Gated by hasFeature('chronoImport').
 */

function ChronoManager(db) {
    this.db = db;
    this.container = null;
    this.sessions = [];   // parsed sessions from the last file
}

/**
 * Grab the view container and reveal the nav tab if the feature is on.
 */
ChronoManager.prototype.init = function () {
    this.container = document.getElementById('view-chrono');
    var tab = document.getElementById('nav-chrono');
    if (tab && typeof hasFeature === 'function' && hasFeature('chronoImport')) {
        tab.style.display = '';
    }
};

/**
 * Render the import screen.
 */
ChronoManager.prototype.show = function () {
    if (!this.container) return;
    if (typeof hasFeature !== 'function' || !hasFeature('chronoImport')) {
        this.container.innerHTML = '';
        return;
    }

    var html = '';
    html += '<div class="chrono-screen">';
    html += '<h2>Chrono Import</h2>';
    html += '<p class="chrono-intro">Import a Garmin ShotView export — a single-session CSV or a multi-session spreadsheet (.xlsx).</p>';
    html += '<label class="btn btn-primary chrono-file-label" for="chrono-file">Choose ShotView File</label>';
    html += '<input type="file" id="chrono-file" accept=".csv,.xlsx" class="chrono-file-input">';
    html += '<div id="chrono-error" class="chrono-error hidden"></div>';
    html += '<div id="chrono-results"></div>';
    html += '</div>';
    this.container.innerHTML = html;

    var self = this;
    var input = document.getElementById('chrono-file');
    input.addEventListener('change', function () {
        if (input.files && input.files.length > 0) {
            self._handleFile(input.files[0]);
        }
        input.value = ''; // allow re-picking the same file
    });
};

/**
 * Parse the chosen file and render the preview (or a readable error).
 */
ChronoManager.prototype._handleFile = function (file) {
    var self = this;
    this._showError(null);
    document.getElementById('chrono-results').innerHTML =
        '<p class="chrono-intro">Reading ' + this._escapeHtml(file.name) + '…</p>';

    var name = (file.name || '').toLowerCase();

    if (name.slice(-4) === '.csv') {
        file.text().then(function (text) {
            self.sessions = [parseShotViewCSV(text, file.name)];
            self._renderPreview();
        }).catch(function (err) {
            self._showError(err.message);
        });
    } else if (name.slice(-5) === '.xlsx') {
        if (typeof XLSX === 'undefined') {
            this._showError('The spreadsheet library failed to load (offline or CDN blocked). ' +
                'Reload the app and try again, or export a CSV instead.');
            return;
        }
        file.arrayBuffer().then(function (buf) {
            var workbook = XLSX.read(new Uint8Array(buf), { type: 'array' });
            self.sessions = parseShotViewWorkbook(workbook);
            self._renderPreview();
        }).catch(function (err) {
            self._showError(err.message);
        });
    } else {
        this._showError('Unsupported file type. Pick a ShotView .csv or .xlsx export.');
    }
};

/**
 * Render one preview card per parsed session.
 */
ChronoManager.prototype._renderPreview = function () {
    var out = '';
    var totalShots = 0;
    var warnings = [];

    for (var i = 0; i < this.sessions.length; i++) {
        var s = this.sessions[i];
        totalShots += s.shots.length;
        warnings = warnings.concat(s.warnings || []);

        var fpsList = s.shots.map(function (x) { return x.fps; });
        var min = Math.min.apply(null, fpsList);
        var max = Math.max.apply(null, fpsList);

        out += '<div class="detail-card chrono-session" data-index="' + i + '">';
        out += '<label class="chrono-include"><input type="checkbox" class="chrono-include-cb" data-index="' + i + '" checked> Include</label>';
        out += '<h3>' + this._escapeHtml(this._sessionTitle(s, i)) + '</h3>';
        out += '<div class="chrono-stats-row">';
        out += '<span><strong>' + s.shots.length + '</strong> shots</span>';
        out += '<span>' + formatNum(min, 1) + '–' + formatNum(max, 1) + ' fps</span>';
        if (s.reported && s.reported.avg !== null) {
            out += '<span>avg <strong>' + formatNum(s.reported.avg, 1) + '</strong></span>';
        }
        if (s.reported && s.reported.sd !== null) {
            out += '<span>SD ' + formatNum(s.reported.sd, 1) + '</span>';
        }
        if (s.reported && s.reported.es !== null) {
            out += '<span>ES ' + formatNum(s.reported.es, 1) + '</span>';
        }
        out += '</div>';

        out += '<details class="chrono-shots"><summary>Shots</summary><table class="chrono-table"><thead><tr><th>#</th><th>Speed (fps)</th><th>Time</th></tr></thead><tbody>';
        for (var j = 0; j < s.shots.length; j++) {
            var shot = s.shots[j];
            out += '<tr><td>' + shot.shot + '</td><td>' + formatNum(shot.fps, 1) + '</td><td>' +
                this._escapeHtml(shot.time || '—') + '</td></tr>';
        }
        out += '</tbody></table></details>';
        out += '</div>';
    }

    if (warnings.length) {
        out += '<div class="chrono-warnings"><strong>Warnings</strong><ul>';
        for (var w = 0; w < warnings.length; w++) {
            out += '<li>' + this._escapeHtml(warnings[w]) + '</li>';
        }
        out += '</ul></div>';
    }

    out += '<p class="chrono-intro">' + this.sessions.length + ' session' +
        (this.sessions.length === 1 ? '' : 's') + ', ' + totalShots + ' shots parsed.</p>';
    out += '<button class="btn btn-primary" disabled title="Saving arrives in the next update">Import Selected (coming next)</button>';

    document.getElementById('chrono-results').innerHTML = out;
};

/**
 * Human title for a session card: date if known, else sheet/file name.
 */
ChronoManager.prototype._sessionTitle = function (session, index) {
    if (session.date) {
        var d = new Date(session.date);
        if (!isNaN(d.getTime())) {
            return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
                ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        }
    }
    return session.name || ('Session ' + (index + 1));
};

ChronoManager.prototype._showError = function (message) {
    var el = document.getElementById('chrono-error');
    if (!el) return;
    if (message) {
        el.textContent = message;
        el.classList.remove('hidden');
        document.getElementById('chrono-results').innerHTML = '';
    } else {
        el.textContent = '';
        el.classList.add('hidden');
    }
};

ChronoManager.prototype._escapeHtml = function (text) {
    var div = document.createElement('div');
    div.textContent = text === null || text === undefined ? '' : String(text);
    return div.innerHTML;
};
