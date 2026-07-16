/**
 * chrono.js — ChronoManager: Garmin ShotView import UI.
 *
 * Flow: pick a ShotView export (.csv single session / .xlsx multi-session)
 * → parse via garmin-import.js → preview cards with include checkboxes
 * → optionally pick a rifle (strings become 'suggested'; confirmed later
 * in the assignment step) → save each included string to velocity_strings
 * with stats from velocity-stats.js and the barrel round count at that time.
 *
 * Gated by hasFeature('chronoImport'). All storage goes through db.js.
 */

function ChronoManager(db) {
    this.db = db;
    this.container = null;
    this.sessions = [];        // parsed sessions, sorted oldest-first
    this.rifles = [];          // for the assignment dropdown
    this.activeBarrel = null;  // active barrel of the selected rifle
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

    // Rifle list for the assignment dropdown (non-blocking)
    this.db.getAllRifles().then(function (rifles) {
        self.rifles = rifles || [];
    }).catch(function () {
        self.rifles = [];
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
            self._setSessions([parseShotViewCSV(text, file.name)]);
        }).catch(function (err) {
            document.getElementById('chrono-results').innerHTML = '';
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
            self._setSessions(parseShotViewWorkbook(workbook));
        }).catch(function (err) {
            document.getElementById('chrono-results').innerHTML = '';
            self._showError(err.message);
        });
    } else {
        this._showError('Unsupported file type. Pick a ShotView .csv or .xlsx export.');
    }
};

/**
 * Store parsed sessions oldest-first (so cumulative round counts read
 * naturally) and render the preview.
 */
ChronoManager.prototype._setSessions = function (sessions) {
    this.sessions = sessions.slice().sort(function (a, b) {
        return String(a.date || '').localeCompare(String(b.date || ''));
    });
    this.activeBarrel = null;
    this._renderPreview();
};

/**
 * Render assignment controls + one preview card per parsed session.
 */
ChronoManager.prototype._renderPreview = function () {
    var out = '';
    var totalShots = 0;
    var warnings = [];

    // Assignment panel
    out += '<div class="detail-card chrono-assign">';
    out += '<div class="form-group"><label for="chrono-rifle">Assign to rifle (optional — you can confirm later)</label>';
    out += '<select id="chrono-rifle"><option value="">— No rifle yet —</option>';
    for (var r = 0; r < this.rifles.length; r++) {
        out += '<option value="' + this._escapeHtml(this.rifles[r].id) + '">' +
            this._escapeHtml(this.rifles[r].name) + '</option>';
    }
    out += '</select></div>';
    out += '<label class="chrono-add-rounds"><input type="checkbox" id="chrono-add-rounds" disabled> ' +
        'Add imported shots to the barrel round count</label>';
    out += '</div>';

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

        out += '<div class="form-group chrono-roundcount"><label for="chrono-rounds-' + i + '">Barrel round count at this string</label>';
        out += '<input type="number" id="chrono-rounds-' + i + '" class="chrono-rounds-input" data-index="' + i + '" min="0" step="1" placeholder="—"></div>';

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
    out += '<button id="chrono-import-btn" class="btn btn-primary">Import Selected</button>';
    out += '<div id="chrono-status" class="chrono-intro"></div>';

    document.getElementById('chrono-results').innerHTML = out;
    this._bindPreviewEvents();
};

ChronoManager.prototype._bindPreviewEvents = function () {
    var self = this;

    document.getElementById('chrono-rifle').addEventListener('change', function () {
        self._onRifleChange(this.value || null);
    });

    var includes = document.querySelectorAll('.chrono-include-cb');
    for (var i = 0; i < includes.length; i++) {
        includes[i].addEventListener('change', function () {
            self._refreshRoundCountDefaults();
        });
    }

    // Manual edits win over recomputed defaults
    var counts = document.querySelectorAll('.chrono-rounds-input');
    for (var c = 0; c < counts.length; c++) {
        counts[c].addEventListener('input', function () {
            this.setAttribute('data-edited', 'true');
        });
    }

    document.getElementById('chrono-import-btn').addEventListener('click', function () {
        self._importSelected();
    });
};

/**
 * Rifle picked: fetch its active barrel, then fill round-count defaults.
 */
ChronoManager.prototype._onRifleChange = function (rifleId) {
    var self = this;
    this.activeBarrel = null;
    var addRounds = document.getElementById('chrono-add-rounds');
    addRounds.disabled = !rifleId;
    if (!rifleId) {
        addRounds.checked = false;
        this._refreshRoundCountDefaults();
        return;
    }
    this.db.getBarrelsByRifle(rifleId).then(function (barrels) {
        for (var i = 0; i < barrels.length; i++) {
            if (barrels[i].isActive) { self.activeBarrel = barrels[i]; break; }
        }
        if (!self.activeBarrel && barrels.length) self.activeBarrel = barrels[0];
        self._refreshRoundCountDefaults();
    }).catch(function () {
        self._refreshRoundCountDefaults();
    });
};

/**
 * Default round count per string = barrel count + shots of earlier
 * included strings in this import. Never clobbers a hand-edited field.
 */
ChronoManager.prototype._refreshRoundCountDefaults = function () {
    var base = this.activeBarrel && typeof this.activeBarrel.totalRounds === 'number'
        ? this.activeBarrel.totalRounds : null;
    var cumulative = 0;
    for (var i = 0; i < this.sessions.length; i++) {
        var input = document.getElementById('chrono-rounds-' + i);
        var include = document.querySelector('.chrono-include-cb[data-index="' + i + '"]');
        if (!input) continue;
        if (input.getAttribute('data-edited') !== 'true') {
            input.value = base === null ? '' : String(base + cumulative);
        }
        if (include && include.checked) cumulative += this.sessions[i].shots.length;
    }
};

/**
 * Save every included string via db.js, then optionally bump the barrel
 * round count by the number of imported shots.
 */
ChronoManager.prototype._importSelected = function () {
    var self = this;
    var btn = document.getElementById('chrono-import-btn');
    var status = document.getElementById('chrono-status');
    var rifleId = document.getElementById('chrono-rifle').value || null;
    var addRounds = document.getElementById('chrono-add-rounds').checked;

    var records = [];
    for (var i = 0; i < this.sessions.length; i++) {
        var include = document.querySelector('.chrono-include-cb[data-index="' + i + '"]');
        if (!include || !include.checked) continue;

        var s = this.sessions[i];
        var stats = velocityStats(s.shots);
        var countInput = document.getElementById('chrono-rounds-' + i);
        var roundCountAt = countInput && countInput.value !== '' ? parseInt(countInput.value, 10) : null;
        var dateObj = s.date ? new Date(s.date) : null;

        records.push({
            rifleId: rifleId,
            barrelId: rifleId && self.activeBarrel ? self.activeBarrel.id : null,
            date: dateObj && !isNaN(dateObj.getTime()) ? dateObj.toISOString() : new Date().toISOString(),
            source: s.source,
            sheetName: s.name || '',
            shots: s.shots,
            avgFps: stats.avg,
            sdFps: stats.sd,
            esFps: stats.es,
            roundCountAt: isFinite(roundCountAt) && roundCountAt !== null ? roundCountAt : null,
            assignmentStatus: rifleId ? 'suggested' : 'unassigned'
        });
    }

    if (!records.length) {
        status.textContent = 'Nothing selected — tick "Include" on at least one session.';
        return;
    }

    btn.disabled = true;
    status.textContent = 'Saving…';

    var saved = 0;
    var chain = Promise.resolve();
    records.forEach(function (record) {
        chain = chain.then(function () {
            return self.db.addVelocityString(record).then(function () { saved++; });
        });
    });

    chain.then(function () {
        var totalShots = records.reduce(function (a, r) { return a + r.shots.length; }, 0);
        if (addRounds && self.activeBarrel) {
            var barrel = self.activeBarrel;
            barrel.totalRounds = (barrel.totalRounds || 0) + totalShots;
            return self.db.updateBarrel(barrel).then(function () {
                status.textContent = 'Imported ' + saved + ' string' + (saved === 1 ? '' : 's') +
                    ' (' + totalShots + ' shots). Barrel round count is now ' + barrel.totalRounds + '.';
            });
        }
        status.textContent = 'Imported ' + saved + ' string' + (saved === 1 ? '' : 's') +
            ' (' + totalShots + ' shots).';
    }).then(function () {
        self.sessions = [];
        document.getElementById('chrono-import-btn').style.display = 'none';
    }).catch(function (err) {
        btn.disabled = false;
        self._showError('Saved ' + saved + ' of ' + records.length + ' strings, then failed: ' +
            err.message + ' — fix the connection and re-import the rest (already-saved strings are kept).');
    });
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
