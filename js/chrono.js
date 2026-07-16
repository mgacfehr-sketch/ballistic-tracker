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
    html += '<div id="chrono-review-launcher" class="detail-card chrono-assign hidden">';
    html += '<div class="form-group"><label for="chrono-review-rifle">Review &amp; assign saved strings</label>';
    html += '<select id="chrono-review-rifle"></select></div>';
    html += '<button id="chrono-review-btn" class="btn btn-secondary">Review Strings</button>';
    html += '</div>';
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

    // Rifle list for assignment dropdowns (non-blocking)
    this.db.getAllRifles().then(function (rifles) {
        self.rifles = rifles || [];
        if (!self.rifles.length) return;
        var sel = document.getElementById('chrono-review-rifle');
        var launcher = document.getElementById('chrono-review-launcher');
        if (!sel || !launcher) return; // view re-rendered meanwhile
        var opts = '';
        for (var i = 0; i < self.rifles.length; i++) {
            opts += '<option value="' + self._escapeHtml(self.rifles[i].id) + '">' +
                self._escapeHtml(self.rifles[i].name) + '</option>';
        }
        sel.innerHTML = opts;
        launcher.classList.remove('hidden');
        document.getElementById('chrono-review-btn').addEventListener('click', function () {
            self.showAssignmentReview(sel.value);
        });
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
    out += '<div class="form-group"><label for="chrono-base-rounds">Barrel round count BEFORE this import</label>';
    out += '<input type="number" id="chrono-base-rounds" min="0" step="1" placeholder="unknown" class="chrono-rounds-input" style="max-width:160px;"></div>';
    out += '<label class="chrono-add-rounds"><input type="checkbox" id="chrono-add-rounds" disabled> ' +
        'Update the barrel round count to match (base + imported shots)</label>';
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
        out += '<h3>' + this._escapeHtml(this._sessionTitle(s, i)) +
            ' <span class="chrono-badge chrono-dup-badge hidden" id="chrono-dup-' + i + '">already imported</span></h3>';
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

        out += '<div class="form-group chrono-roundcount"><label for="chrono-rounds-' + i + '">Barrel round count AFTER this string</label>';
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

    // Mark strings that already exist (against the current rifle pick,
    // or the unassigned pool) BEFORE any counts can build on them
    var rifleSel = document.getElementById('chrono-rifle');
    this._refreshDuplicates(rifleSel && rifleSel.value ? rifleSel.value : null);
};

/**
 * Preview-time duplicate marking: fetch existing strings and disable +
 * untick any parsed session that matches (epoch-normalized key). This
 * both prevents re-import AND keeps duplicate shots from advancing the
 * round-count odometer — excluded strings never count.
 */
ChronoManager.prototype._refreshDuplicates = function (rifleId) {
    var self = this;
    var req = rifleId
        ? this.db.getVelocityStringsByRifle(rifleId)
        : this.db.getUnassignedVelocityStrings();

    req.catch(function () { return []; }).then(function (existing) {
        var seen = {};
        (existing || []).forEach(function (e) {
            seen[stringDedupKey(e.sheetName, e.date)] = true;
        });
        for (var i = 0; i < self.sessions.length; i++) {
            var isDup = !!seen[stringDedupKey(self.sessions[i].name, self.sessions[i].date)];
            var cb = document.querySelector('.chrono-include-cb[data-index="' + i + '"]');
            var badge = document.getElementById('chrono-dup-' + i);
            if (cb) {
                if (isDup) {
                    cb.checked = false;
                    cb.disabled = true;
                } else if (cb.disabled) {
                    // no longer a duplicate under the new rifle pick
                    cb.disabled = false;
                    cb.checked = true;
                }
            }
            if (badge) badge.classList.toggle('hidden', !isDup);
        }
        self._refreshRoundCountDefaults();
    });
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

    // Base count drives every per-string value
    document.getElementById('chrono-base-rounds').addEventListener('input', function () {
        self._refreshRoundCountDefaults();
    });

    // Manual per-string edits win over recomputed defaults
    var counts = document.querySelectorAll('.chrono-roundcount .chrono-rounds-input');
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
        this._refreshDuplicates(null); // check vs the unassigned pool
        return;
    }
    this.db.getBarrelsByRifle(rifleId).then(function (barrels) {
        for (var i = 0; i < barrels.length; i++) {
            if (barrels[i].isActive) { self.activeBarrel = barrels[i]; break; }
        }
        if (!self.activeBarrel && barrels.length) self.activeBarrel = barrels[0];
        // Picking a rifle resets the base to that barrel's current count
        var baseInput = document.getElementById('chrono-base-rounds');
        if (baseInput) {
            baseInput.value = self.activeBarrel && typeof self.activeBarrel.totalRounds === 'number'
                ? String(self.activeBarrel.totalRounds) : '';
        }
        // Re-check duplicates against THIS rifle's strings (also
        // refreshes the round-count defaults afterwards)
        self._refreshDuplicates(rifleId);
    }).catch(function () {
        self._refreshRoundCountDefaults();
    });
};

/**
 * Current base count from the field, or null when unknown/blank.
 */
ChronoManager.prototype._baseRounds = function () {
    var baseInput = document.getElementById('chrono-base-rounds');
    if (!baseInput || baseInput.value === '') return null;
    var v = parseInt(baseInput.value, 10);
    return isFinite(v) && v >= 0 ? v : null;
};

/**
 * Per-string counts for the CURRENT include selection, oldest-first,
 * AFTER semantics via the pure assignRoundCounts(). Excluded strings
 * get null (they don't advance the odometer).
 * @returns {Array<number|null>} one entry per this.sessions index
 */
ChronoManager.prototype._computeRoundCounts = function () {
    var base = this._baseRounds();
    var included = [];
    var map = []; // included position → sessions index
    for (var i = 0; i < this.sessions.length; i++) {
        var cb = document.querySelector('.chrono-include-cb[data-index="' + i + '"]');
        if (!cb || cb.checked) {
            map.push(i);
            included.push(this.sessions[i]);
        }
    }
    var counts = assignRoundCounts(base, included);
    var out = [];
    for (var s = 0; s < this.sessions.length; s++) out.push(null);
    for (var k = 0; k < map.length; k++) out[map[k]] = counts[k];
    return out;
};

/**
 * Repaint the per-string fields from the computed counts. Never
 * clobbers a hand-edited field.
 */
ChronoManager.prototype._refreshRoundCountDefaults = function () {
    var counts = this._computeRoundCounts();
    for (var i = 0; i < this.sessions.length; i++) {
        var input = document.getElementById('chrono-rounds-' + i);
        if (!input) continue;
        if (input.getAttribute('data-edited') !== 'true') {
            input.value = counts[i] === null ? '' : String(counts[i]);
        }
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
    var base = this._baseRounds();
    var counts = this._computeRoundCounts();

    var records = [];
    for (var i = 0; i < this.sessions.length; i++) {
        var include = document.querySelector('.chrono-include-cb[data-index="' + i + '"]');
        if (!include || !include.checked) continue;

        var s = this.sessions[i];
        var stats = velocityStats(s.shots);
        var dateObj = s.date ? new Date(s.date) : null;

        // Hand-edited field wins; otherwise the computed AFTER-count
        var roundCountAt = counts[i];
        var countInput = document.getElementById('chrono-rounds-' + i);
        if (countInput && countInput.getAttribute('data-edited') === 'true' && countInput.value !== '') {
            var edited = parseInt(countInput.value, 10);
            if (isFinite(edited) && edited >= 0) roundCountAt = edited;
        }

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
            roundCountAt: roundCountAt,
            assignmentStatus: rifleId ? 'suggested' : 'unassigned'
        });
    }

    if (!records.length) {
        status.textContent = 'Nothing selected — tick "Include" on at least one session.';
        return;
    }

    btn.disabled = true;
    status.textContent = 'Checking for duplicates…';

    // Duplicate-import guard: skip strings already saved for this
    // rifle (or already sitting unassigned) with the same sheet + date.
    var existingReq = rifleId
        ? this.db.getVelocityStringsByRifle(rifleId)
        : this.db.getUnassignedVelocityStrings();

    existingReq.catch(function () { return []; }).then(function (existing) {
        var seen = {};
        (existing || []).forEach(function (e) {
            seen[stringDedupKey(e.sheetName, e.date)] = true;
        });
        var fresh = [];
        var skipped = 0;
        records.forEach(function (r) {
            if (seen[stringDedupKey(r.sheetName, r.date)]) skipped++;
            else fresh.push(r);
        });

        if (!fresh.length) {
            btn.disabled = false;
            status.textContent = 'All ' + skipped + ' selected string' + (skipped === 1 ? ' was' : 's were') +
                ' already imported — nothing saved.';
            return;
        }

        status.textContent = 'Saving…';
        var saved = 0;
        var chain = Promise.resolve();
        fresh.forEach(function (record) {
            chain = chain.then(function () {
                return self.db.addVelocityString(record).then(function () { saved++; });
            });
        });

        return chain.then(function () {
            var totalShots = fresh.reduce(function (a, r) { return a + r.shots.length; }, 0);
            var skipNote = skipped ? ' (' + skipped + ' duplicate' + (skipped === 1 ? '' : 's') + ' skipped)' : '';
            // Absolute barrel update from the SAME base as the strings —
            // the two displays can no longer drift apart.
            if (addRounds && self.activeBarrel && base !== null) {
                var barrel = self.activeBarrel;
                barrel.totalRounds = base + totalShots;
                return self.db.updateBarrel(barrel).then(function () {
                    status.textContent = 'Imported ' + saved + ' string' + (saved === 1 ? '' : 's') +
                        ' (' + totalShots + ' shots)' + skipNote +
                        '. Barrel round count set to ' + barrel.totalRounds + '.';
                });
            }
            status.textContent = 'Imported ' + saved + ' string' + (saved === 1 ? '' : 's') +
                ' (' + totalShots + ' shots)' + skipNote + '.';
        }).then(function () {
            self.sessions = [];
            document.getElementById('chrono-import-btn').style.display = 'none';
            // Straight into assignment review when a rifle was chosen
            if (rifleId) {
                setTimeout(function () { self.showAssignmentReview(rifleId); }, 900);
            }
        }).catch(function (err) {
            btn.disabled = false;
            self._showError('Saved ' + saved + ' of ' + fresh.length + ' strings, then failed: ' +
                err.message + ' — fix the connection and re-import the rest (already-saved strings are kept, duplicates will be skipped).');
        });
    });
};

// ── Assignment review (load auto-split) ───────────────────────

/**
 * Cluster a rifle's saved strings by velocity and let the user confirm
 * which load each cluster belongs to. Ambiguous strings are never part
 * of a bulk confirm — each gets its own "needs your call" card.
 */
ChronoManager.prototype.showAssignmentReview = function (rifleId) {
    var self = this;
    if (!rifleId) return;
    this._showError(null);
    document.getElementById('chrono-results').innerHTML =
        '<p class="chrono-intro">Loading strings…</p>';

    Promise.all([
        this.db.getVelocityStringsByRifle(rifleId),
        this.db.getLoadsByRifle(rifleId)
    ]).then(function (results) {
        self._renderAssignmentReview(rifleId, results[0] || [], results[1] || []);
    }).catch(function (err) {
        self._showError('Could not load strings: ' + err.message);
    });
};

ChronoManager.prototype._renderAssignmentReview = function (rifleId, strings, loads) {
    var self = this;
    var pending = strings.filter(function (s) { return s.assignmentStatus !== 'confirmed'; });
    var confirmed = strings.filter(function (s) { return s.assignmentStatus === 'confirmed'; });

    var result = clusterStringsByVelocity(pending);
    var ambiguousIds = {};
    for (var a = 0; a < result.ambiguous.length; a++) {
        ambiguousIds[result.ambiguous[a].string.id] = true;
    }

    var loadNames = {};
    for (var ln = 0; ln < loads.length; ln++) loadNames[loads[ln].id] = loads[ln].name;

    var out = '<button id="chrono-back-btn" class="btn btn-secondary">← Back to Import</button>';
    out += '<h3 class="chrono-review-title">Assign Strings to Ammo</h3>';

    if (!pending.length) {
        out += '<p class="chrono-intro">No strings waiting for assignment.</p>';
    }

    var loadOptions = '<option value="">— Pick a load —</option>';
    for (var lo = 0; lo < loads.length; lo++) {
        loadOptions += '<option value="' + this._escapeHtml(loads[lo].id) + '">' +
            this._escapeHtml(loads[lo].name) + '</option>';
    }
    loadOptions += '<option value="__new__">+ New load…</option>';

    // Proposal cards — NOTHING is combined or assigned automatically.
    // Every string carries its own checkbox; the user reviews the
    // proposed grouping and explicitly confirms membership + load.
    if (result.clusters.length) {
        out += '<p class="chrono-intro">These are <strong>proposals</strong> based on velocity — nothing is combined until you confirm. Untick any string that isn\'t the same ammo and assign it separately.</p>';
    }
    for (var c = 0; c < result.clusters.length; c++) {
        var cluster = result.clusters[c];
        out += '<div class="detail-card chrono-cluster">';
        out += '<h4>Proposed group ' + (c + 1) + ' — avg ~' + formatNum(cluster.meanFps, 0) + ' fps · ' +
            cluster.members.length + ' string' + (cluster.members.length === 1 ? '' : 's') +
            ' · ' + cluster.shotCount + ' shots</h4>';
        out += '<ul class="chrono-string-list chrono-proposal-list">';
        for (var m = 0; m < cluster.members.length; m++) {
            var s = cluster.members[m];
            var amb = !!ambiguousIds[s.id];
            out += '<li><label class="chrono-member-row">';
            out += '<input type="checkbox" class="chrono-member-cb" data-cluster="' + c + '" data-id="' +
                this._escapeHtml(s.id) + '"' + (amb ? '' : ' checked') + '> ';
            out += this._escapeHtml(this._stringLabel(s));
            out += '</label> ' + this._roundsEditHtml(s) + ' ' + this._deleteBtnHtml(s);
            if (amb) {
                out += ' <span class="chrono-badge">needs your call — sits between velocity groups</span>';
            }
            out += '</li>';
        }
        out += '</ul>';
        out += '<div class="chrono-confirm-row"><select class="chrono-load-select" id="chrono-cluster-load-' + c + '">' +
            loadOptions + '</select>';
        out += '<button class="btn btn-primary chrono-cluster-confirm" data-cluster="' + c +
            '" data-select="chrono-cluster-load-' + c + '"></button></div>';
        out += '</div>';
    }

    if (confirmed.length) {
        out += '<details class="chrono-shots"><summary>' + confirmed.length + ' already-confirmed string' +
            (confirmed.length === 1 ? '' : 's') + '</summary><ul class="chrono-string-list">';
        for (var cf = 0; cf < confirmed.length; cf++) {
            out += '<li>' + this._escapeHtml(this._stringLabel(confirmed[cf])) + ' → ' +
                this._escapeHtml(loadNames[confirmed[cf].loadId] || 'unknown load') +
                ' ' + this._roundsEditHtml(confirmed[cf]) +
                ' ' + this._deleteBtnHtml(confirmed[cf]) + '</li>';
        }
        out += '</ul></details>';
    }

    out += '<div id="chrono-status" class="chrono-intro"></div>';
    document.getElementById('chrono-results').innerHTML = out;

    document.getElementById('chrono-back-btn').addEventListener('click', function () {
        self.show();
    });

    // Round-count corrections (works on confirmed strings too)
    var stringById = {};
    strings.forEach(function (s) { stringById[s.id] = s; });
    var editBtns = document.querySelectorAll('.chrono-edit-rounds');
    for (var eb = 0; eb < editBtns.length; eb++) {
        editBtns[eb].addEventListener('click', function () {
            var id = this.getAttribute('data-id');
            var current = stringById[id] && typeof stringById[id].roundCountAt === 'number'
                ? String(stringById[id].roundCountAt) : '';
            var typed = window.prompt('Barrel round count AFTER this string (blank = unknown):', current);
            if (typed === null) return; // cancelled
            var value = typed.trim() === '' ? null : parseInt(typed, 10);
            if (value !== null && (!isFinite(value) || value < 0)) {
                window.alert('Enter a whole number of rounds, or leave blank.');
                return;
            }
            self.db.updateVelocityString({ id: id, roundCountAt: value }).then(function () {
                self.showAssignmentReview(rifleId);
            }).catch(function (err) {
                self._showError('Could not update the round count: ' + err.message);
            });
        });
    }

    // Live "Assign selected (N)" labels + explicit membership on confirm
    function checkedIdsFor(clusterIndex) {
        var boxes = document.querySelectorAll('.chrono-member-cb[data-cluster="' + clusterIndex + '"]');
        var ids = [];
        for (var i = 0; i < boxes.length; i++) {
            if (boxes[i].checked) ids.push(boxes[i].getAttribute('data-id'));
        }
        return ids;
    }
    function refreshButtonLabels() {
        var btns = document.querySelectorAll('.chrono-cluster-confirm');
        for (var i = 0; i < btns.length; i++) {
            var n = checkedIdsFor(btns[i].getAttribute('data-cluster')).length;
            btns[i].textContent = 'Assign selected (' + n + ')';
            btns[i].disabled = n === 0;
        }
    }
    var memberBoxes = document.querySelectorAll('.chrono-member-cb');
    for (var mb = 0; mb < memberBoxes.length; mb++) {
        memberBoxes[mb].addEventListener('change', refreshButtonLabels);
    }
    refreshButtonLabels();

    var buttons = document.querySelectorAll('.chrono-cluster-confirm');
    for (var b = 0; b < buttons.length; b++) {
        buttons[b].addEventListener('click', function () {
            var ids = checkedIdsFor(this.getAttribute('data-cluster'));
            if (!ids.length) return;
            var select = document.getElementById(this.getAttribute('data-select'));
            self._confirmAssignment(rifleId, ids, select.value, this);
        });
    }

    // Per-string deletion (confirm-guarded; works on confirmed strings)
    var delBtns = document.querySelectorAll('.chrono-delete-string');
    for (var db2 = 0; db2 < delBtns.length; db2++) {
        delBtns[db2].addEventListener('click', function () {
            var id = this.getAttribute('data-id');
            var s = stringById[id];
            var label = s ? self._stringLabel(s) : id;
            if (!window.confirm('Delete this velocity string?\n\n' + label +
                '\n\nThis removes it permanently and cannot be undone.')) return;
            self.db.deleteVelocityString(id).then(function () {
                self.showAssignmentReview(rifleId);
            }).catch(function (err) {
                self._showError('Could not delete the string: ' + err.message);
            });
        });
    }
};

/**
 * Persist a load assignment for the given string ids. '__new__' creates
 * a minimal load first (user fills in bullet details later in Profiles).
 */
ChronoManager.prototype._confirmAssignment = function (rifleId, stringIds, loadValue, btn) {
    var self = this;
    var status = document.getElementById('chrono-status');
    if (!loadValue) {
        status.textContent = 'Pick a load first.';
        return;
    }

    var loadPromise;
    if (loadValue === '__new__') {
        var name = window.prompt('Name for the new load (e.g. "Hornady 168gr ELD-M"):');
        if (!name || !name.trim()) return;
        loadPromise = this.db.addLoad({ rifleId: rifleId, name: name.trim() })
            .then(function (load) { return load.id; });
    } else {
        loadPromise = Promise.resolve(loadValue);
    }

    btn.disabled = true;
    status.textContent = 'Saving assignment…';

    loadPromise.then(function (loadId) {
        var chain = Promise.resolve();
        stringIds.forEach(function (id) {
            chain = chain.then(function () {
                return self.db.updateVelocityString({
                    id: id,
                    rifleId: rifleId,
                    loadId: loadId,
                    assignmentStatus: 'confirmed'
                });
            });
        });
        return chain;
    }).then(function () {
        self.showAssignmentReview(rifleId); // re-render with fresh state
    }).catch(function (err) {
        btn.disabled = false;
        status.textContent = 'Assignment failed: ' + err.message;
    });
};

/**
 * Small 🗑 delete button for one saved string (confirm-guarded).
 */
ChronoManager.prototype._deleteBtnHtml = function (s) {
    return '<button type="button" class="chrono-delete-string" data-id="' + this._escapeHtml(s.id) + '" ' +
        'title="Delete this string permanently">🗑 Delete</button>';
};

/**
 * Small "rounds: N ✎" edit button for one saved string.
 */
ChronoManager.prototype._roundsEditHtml = function (s) {
    var shown = typeof s.roundCountAt === 'number' ? s.roundCountAt : '—';
    return '<button type="button" class="chrono-edit-rounds" data-id="' + this._escapeHtml(s.id) + '" ' +
        'title="Edit barrel round count after this string">rounds: ' + shown + ' ✎</button>';
};

/**
 * Short label for a saved string: date · avg/SD/ES · shot count.
 */
ChronoManager.prototype._stringLabel = function (s) {
    var when = '—';
    if (s.date) {
        var d = new Date(s.date);
        if (!isNaN(d.getTime())) when = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    var n = s.shots && s.shots.length ? s.shots.length : 0;
    return when + ' · avg ' + formatNum(s.avgFps, 1) + ' · SD ' + formatNum(s.sdFps, 1) +
        ' · ES ' + formatNum(s.esFps, 1) + ' · ' + n + ' shots';
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
