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
    html += '<p class="chrono-intro">Pick the rifle, then import a Garmin ShotView export (single-session CSV or multi-session .xlsx).</p>';

    // Rifle-first: the import context is visible BEFORE any file is
    // parsed, and survives across multiple imports
    html += '<div id="chrono-import-section">';
    html += '<div class="detail-card chrono-assign">';
    html += '<div class="form-group"><label for="chrono-rifle">Rifle for this import</label>';
    html += '<select id="chrono-rifle"><option value="">— Pick a rifle —</option></select></div>';
    html += '<div class="form-group"><label for="chrono-base-rounds">Barrel round count BEFORE this import</label>';
    html += '<input type="number" id="chrono-base-rounds" min="0" step="1" placeholder="unknown" class="chrono-rounds-input" style="max-width:160px;">';
    html += '<p class="chrono-hint">Each string is tagged with its AFTER-count: this base + shots fired so far.</p></div>';
    html += '<label class="chrono-add-rounds"><input type="checkbox" id="chrono-add-rounds" disabled> ' +
        'Update the barrel round count to match (base + imported shots)</label>';
    html += '</div>';
    html += '<label class="btn btn-primary chrono-file-label" for="chrono-file">Choose ShotView File</label>';
    html += '<input type="file" id="chrono-file" accept=".csv,.xlsx" class="chrono-file-input">';
    html += '</div>'; // #chrono-import-section

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

    // Import-context bindings live here now (panel is static)
    document.getElementById('chrono-rifle').addEventListener('change', function () {
        self._onRifleChange(this.value || null);
    });
    document.getElementById('chrono-base-rounds').addEventListener('input', function () {
        self._refreshRoundCountDefaults();
    });

    // Rifle list for both dropdowns (non-blocking)
    this.db.getAllRifles().then(function (rifles) {
        self.rifles = rifles || [];
        if (!self.rifles.length) return;
        var importSel = document.getElementById('chrono-rifle');
        var sel = document.getElementById('chrono-review-rifle');
        var launcher = document.getElementById('chrono-review-launcher');
        if (!sel || !launcher || !importSel) return; // view re-rendered meanwhile
        var opts = '';
        for (var i = 0; i < self.rifles.length; i++) {
            opts += '<option value="' + self._escapeHtml(self.rifles[i].id) + '">' +
                self._escapeHtml(self.rifles[i].name) + '</option>';
        }
        importSel.innerHTML = '<option value="">— Pick a rifle —</option>' + opts;
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
        out += '<div class="chrono-badge chrono-dup-badge hidden" id="chrono-dup-' + i + '">already imported</div>';
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
 * Preview-time duplicate marking, two layers:
 *
 * 1. VELOCITY FINGERPRINT (primary): the incoming string's full
 *    per-shot velocity sequence is checked against EVERY saved string
 *    for this user, across all rifles — two real chrono strings never
 *    share identical shot-for-shot velocities. A hit shows a prominent
 *    warning naming the rifle it's already on and unticks the string,
 *    but leaves the checkbox ENABLED: re-ticking is the legitimate
 *    override for moving a string that was imported to the wrong rifle.
 *
 * 2. NAME+TIMESTAMP (backstop): a same-rifle (or unassigned-pool)
 *    sheet_name + epoch-date match is a hard duplicate — unticked AND
 *    disabled ("already imported").
 *
 * Either way, excluded strings never advance the round-count odometer.
 */
ChronoManager.prototype._refreshDuplicates = function (rifleId) {
    var self = this;

    this.db.getAllVelocityStrings().catch(function () { return []; }).then(function (existing) {
        var exactKeys = {};    // same-rifle/pool name+date → hard dup
        var fingerprints = {}; // velocity sequence → owning rifleId (or null)
        (existing || []).forEach(function (e) {
            var samePool = rifleId ? e.rifleId === rifleId : !e.rifleId;
            if (samePool) exactKeys[stringDedupKey(e.sheetName, e.date)] = true;
            var fp = velocityFingerprint(e.shots);
            if (fp && !(fp in fingerprints)) fingerprints[fp] = e.rifleId || null;
        });

        var rifleNames = {};
        (self.rifles || []).forEach(function (r) { rifleNames[r.id] = r.name; });

        for (var i = 0; i < self.sessions.length; i++) {
            var s = self.sessions[i];
            var isExact = !!exactKeys[stringDedupKey(s.name, s.date)];
            var fp2 = velocityFingerprint(s.shots);
            var fpOwner = fp2 && (fp2 in fingerprints) ? fingerprints[fp2] : undefined;
            var isFpDup = fpOwner !== undefined;

            var cb = document.querySelector('.chrono-include-cb[data-index="' + i + '"]');
            var badge = document.getElementById('chrono-dup-' + i);

            if (cb) {
                if (isExact) {
                    cb.checked = false;
                    cb.disabled = true;
                } else if (isFpDup) {
                    // default excluded, but overridable on purpose
                    if (!cb.disabled && cb.getAttribute('data-fp-warned') !== 'true') {
                        cb.checked = false;
                        cb.setAttribute('data-fp-warned', 'true');
                    }
                    cb.disabled = false;
                } else if (cb.disabled || cb.getAttribute('data-fp-warned') === 'true') {
                    // no longer a duplicate under the new rifle pick
                    cb.disabled = false;
                    cb.checked = true;
                    cb.removeAttribute('data-fp-warned');
                }
            }
            if (badge) {
                if (isExact) {
                    badge.textContent = 'already imported';
                    badge.classList.remove('chrono-fp-warn');
                    badge.classList.remove('hidden');
                } else if (isFpDup) {
                    var where = fpOwner === null ? 'in your unassigned strings'
                        : 'on rifle "' + (rifleNames[fpOwner] || 'unknown') + '"';
                    badge.textContent = '⚠ these exact shots are already imported ' + where +
                        ' — tick Include only to import anyway';
                    badge.classList.add('chrono-fp-warn');
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
        }
        self._refreshRoundCountDefaults();
    });
};

ChronoManager.prototype._bindPreviewEvents = function () {
    var self = this;

    var includes = document.querySelectorAll('.chrono-include-cb');
    for (var i = 0; i < includes.length; i++) {
        includes[i].addEventListener('change', function () {
            self._refreshRoundCountDefaults();
        });
    }

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

    // A rifle is required — bail BEFORE touching any state so every
    // tick, base count, and edited field survives the blocked attempt.
    if (!rifleId) {
        status.textContent = 'Select a rifle first — nothing was imported. Your selections are unchanged.';
        var rifleSelect = document.getElementById('chrono-rifle');
        if (rifleSelect) rifleSelect.focus();
        return;
    }

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
            // No auto-jump: hand the user an explicit next step instead
            // of yanking the screen away while they read the status
            var goBtn = document.createElement('button');
            goBtn.className = 'btn btn-primary';
            goBtn.textContent = 'Assign to loads →';
            goBtn.addEventListener('click', function () {
                self.showAssignmentReview(rifleId);
            });
            status.appendChild(document.createElement('br'));
            status.appendChild(goBtn);
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
 * which load each cluster belongs to. State-driven: unchecking a string
 * SPLITS it into its own assignable card (own load + assign button) —
 * two strings the app grouped together can be confirmed as two
 * different loads. Ambiguous strings start split out. Nothing combines
 * or assigns without an explicit Assign tap.
 */
ChronoManager.prototype.showAssignmentReview = function (rifleId) {
    var self = this;
    if (!rifleId) return;
    this._showError(null);

    // Review takes over the screen — hide the import controls
    // (Back to Import re-renders the whole view)
    var importSection = document.getElementById('chrono-import-section');
    if (importSection) importSection.classList.add('hidden');
    var launcher = document.getElementById('chrono-review-launcher');
    if (launcher) launcher.classList.add('hidden');

    // Preserve the confirmed-section expand state across re-renders
    // (deleting/editing several strings in a row shouldn't snap it shut)
    var confirmedDetails = document.getElementById('chrono-confirmed-details');
    if (confirmedDetails) this._confirmedOpen = confirmedDetails.hasAttribute('open');
    document.getElementById('chrono-results').innerHTML =
        '<p class="chrono-intro">Loading strings…</p>';

    // Carry the user's split choices across data refreshes (assigning
    // or deleting one string must not re-merge the others)
    var prevSplits = (this._review && this._review.splitIds) || {};

    Promise.all([
        this.db.getVelocityStringsByRifle(rifleId),
        this.db.getLoadsByRifle(rifleId)
    ]).then(function (results) {
        var strings = results[0] || [];
        var pending = strings.filter(function (s) { return s.assignmentStatus !== 'confirmed'; });
        var result = clusterStringsByVelocity(pending);

        var ambiguousIds = {};
        result.ambiguous.forEach(function (a) { ambiguousIds[a.string.id] = true; });

        // splits = ambiguous (always individual) + surviving user splits
        var splitIds = {};
        pending.forEach(function (s) {
            if (ambiguousIds[s.id] || prevSplits[s.id]) splitIds[s.id] = true;
        });

        self._review = {
            rifleId: rifleId,
            strings: strings,
            loads: results[1] || [],
            pending: pending,
            confirmed: strings.filter(function (s) { return s.assignmentStatus === 'confirmed'; }),
            clusters: result.clusters,
            ambiguousIds: ambiguousIds,
            splitIds: splitIds
        };
        self._renderAssignmentReview();
    }).catch(function (err) {
        self._showError('Could not load strings: ' + err.message);
    });
};

ChronoManager.prototype._renderAssignmentReview = function () {
    var self = this;
    var r = this._review;
    if (!r) return;
    var rifleId = r.rifleId;
    var strings = r.strings;
    var confirmed = r.confirmed;

    // Preserve dropdown picks + expand state across split re-renders
    var savedSelects = {};
    var liveSelects = document.querySelectorAll('.chrono-load-select');
    for (var ls = 0; ls < liveSelects.length; ls++) {
        savedSelects[liveSelects[ls].id] = liveSelects[ls].value;
    }
    var cd = document.getElementById('chrono-confirmed-details');
    if (cd) this._confirmedOpen = cd.hasAttribute('open');

    var loadNames = {};
    for (var ln = 0; ln < r.loads.length; ln++) loadNames[r.loads[ln].id] = r.loads[ln].name;

    var out = '<button id="chrono-back-btn" class="btn btn-secondary">← Back to Import</button>';
    out += '<h3 class="chrono-review-title">Assign Strings to Ammo</h3>';

    if (!r.pending.length) {
        out += '<p class="chrono-intro">No strings waiting for assignment.</p>';
        out += '<button id="chrono-goto-report" class="btn btn-primary">View Performance Report →</button>';
    }

    // Show each load's confirmed velocity in the pickers — this is the
    // screen where the user decides which load owns which velocities
    var loadAvg = {};
    r.strings.forEach(function (s) {
        if (s.assignmentStatus === 'confirmed' && s.loadId && typeof s.avgFps === 'number') {
            if (!loadAvg[s.loadId]) loadAvg[s.loadId] = { sum: 0, n: 0 };
            var w = s.shots && s.shots.length ? s.shots.length : 1;
            loadAvg[s.loadId].sum += s.avgFps * w;
            loadAvg[s.loadId].n += w;
        }
    });
    var loadOptions = '<option value="">— Pick a load —</option>';
    for (var lo = 0; lo < r.loads.length; lo++) {
        var la = loadAvg[r.loads[lo].id];
        loadOptions += '<option value="' + this._escapeHtml(r.loads[lo].id) + '">' +
            this._escapeHtml(r.loads[lo].name) +
            (la ? ' (avg ' + formatNum(la.sum / la.n, 0) + ' fps)' : '') + '</option>';
    }
    loadOptions += '<option value="__new__">+ New load…</option>';

    // Proposal cards — NOTHING is combined or assigned automatically.
    // Unticking a string splits it into its own assignable card below.
    var anyGroup = false;
    for (var pc = 0; pc < r.clusters.length; pc++) {
        if (r.clusters[pc].members.some(function (m) { return !r.splitIds[m.id]; })) anyGroup = true;
    }
    if (anyGroup) {
        out += '<p class="chrono-intro">These are <strong>proposals</strong> based on velocity — nothing is combined until you confirm. Untick a string to split it out and give it its own load.</p>';
    }

    for (var c = 0; c < r.clusters.length; c++) {
        var cluster = r.clusters[c];
        var members = cluster.members.filter(function (m) { return !r.splitIds[m.id]; });
        if (!members.length) continue; // fully split out — card disappears

        var groupShots = members.reduce(function (a, m) {
            return a + (m.shots && m.shots.length ? m.shots.length : 0);
        }, 0);

        out += '<div class="detail-card chrono-cluster">';
        out += '<h4>Proposed group ' + (c + 1) + ' — avg ~' + formatNum(cluster.meanFps, 0) + ' fps · ' +
            members.length + ' string' + (members.length === 1 ? '' : 's') +
            ' · ' + groupShots + ' shots</h4>';
        out += '<ul class="chrono-string-list chrono-proposal-list">';
        for (var m = 0; m < members.length; m++) {
            var s = members[m];
            out += '<li><label class="chrono-member-row">';
            out += '<input type="checkbox" class="chrono-member-cb" data-id="' +
                this._escapeHtml(s.id) + '" checked> ';
            out += this._escapeHtml(this._stringLabel(s));
            out += '</label> ' + this._roundsEditHtml(s) + ' ' + this._deleteBtnHtml(s);
            out += '</li>';
        }
        out += '</ul>';
        out += '<div class="chrono-confirm-row"><select class="chrono-load-select" id="chrono-cluster-load-' + c + '">' +
            loadOptions + '</select>';
        out += '<input type="text" class="chrono-newload-name hidden" maxlength="80" placeholder="New load name">';
        out += '<button class="btn btn-primary chrono-cluster-confirm" data-cluster="' + c +
            '" data-select="chrono-cluster-load-' + c + '">Assign group (' + members.length + ')</button></div>';
        out += '</div>';
    }

    // Split-out strings — each gets its OWN load pick + assign button
    var splitStrings = r.pending.filter(function (s) { return r.splitIds[s.id]; });
    if (splitStrings.length) {
        out += '<h4 class="chrono-split-heading">Assign separately</h4>';
        for (var sp = 0; sp < splitStrings.length; sp++) {
            var ss = splitStrings[sp];
            out += '<div class="detail-card chrono-cluster chrono-split-card">';
            out += '<div class="chrono-split-row">' + this._escapeHtml(this._stringLabel(ss)) +
                ' ' + this._roundsEditHtml(ss) + ' ' + this._deleteBtnHtml(ss);
            if (r.ambiguousIds[ss.id]) {
                out += ' <span class="chrono-badge">needs your call — sits between velocity groups</span>';
            } else {
                out += ' <button type="button" class="chrono-rejoin" data-id="' + this._escapeHtml(ss.id) +
                    '">↩ Back to group</button>';
            }
            out += '</div>';
            out += '<div class="chrono-confirm-row"><select class="chrono-load-select" id="chrono-split-load-' +
                this._escapeHtml(ss.id) + '">' + loadOptions + '</select>';
            out += '<input type="text" class="chrono-newload-name hidden" maxlength="80" placeholder="New load name">';
            out += '<button class="btn btn-primary chrono-split-confirm" data-id="' + this._escapeHtml(ss.id) +
                '" data-select="chrono-split-load-' + this._escapeHtml(ss.id) + '">Assign (1)</button></div>';
            out += '</div>';
        }
    }

    if (confirmed.length) {
        out += '<details class="chrono-shots" id="chrono-confirmed-details"' +
            (this._confirmedOpen ? ' open' : '') + '><summary>' + confirmed.length + ' already-confirmed string' +
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

    // "+ New load…" reveals its inline name field
    var loadSelects = document.querySelectorAll('.chrono-load-select');
    for (var lsx = 0; lsx < loadSelects.length; lsx++) {
        loadSelects[lsx].addEventListener('change', function () {
            var nameField = this.parentNode.querySelector('.chrono-newload-name');
            if (nameField) {
                nameField.classList.toggle('hidden', this.value !== '__new__');
                if (this.value === '__new__') nameField.focus();
            }
        });
    }

    // Everything confirmed → the natural next step is the report
    var gotoReport = document.getElementById('chrono-goto-report');
    if (gotoReport) {
        gotoReport.addEventListener('click', function () {
            if (window.ReportNav) window.ReportNav.open(rifleId);
        });
    }

    // Round-count corrections (works on confirmed strings too).
    // Inline edit: the button swaps for a number field — Enter/blur
    // saves, Escape cancels. No prompt() dialogs.
    var stringById = {};
    strings.forEach(function (s) { stringById[s.id] = s; });
    var editBtns = document.querySelectorAll('.chrono-edit-rounds');
    for (var eb = 0; eb < editBtns.length; eb++) {
        editBtns[eb].addEventListener('click', function () {
            var id = this.getAttribute('data-id');
            var s = stringById[id];
            var field = document.createElement('input');
            field.type = 'number';
            field.min = '0';
            field.step = '1';
            field.className = 'chrono-rounds-inline';
            field.value = s && typeof s.roundCountAt === 'number' ? s.roundCountAt : '';
            field.placeholder = 'rounds';
            this.replaceWith(field);
            field.focus();

            var done = false;
            function commit() {
                if (done) return;
                done = true;
                var value = field.value.trim() === '' ? null : parseInt(field.value, 10);
                if (value !== null && (!isFinite(value) || value < 0)) {
                    self._renderAssignmentReview(); // invalid → revert
                    return;
                }
                self.db.updateVelocityString({ id: id, roundCountAt: value }).then(function () {
                    self.showAssignmentReview(rifleId);
                }).catch(function (err) {
                    self._showError('Could not update the round count: ' + err.message);
                });
            }
            field.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') { done = true; self._renderAssignmentReview(); }
            });
            field.addEventListener('blur', commit);
        });
    }

    // Restore dropdown picks that survived the re-render
    for (var selId in savedSelects) {
        var selEl = document.getElementById(selId);
        if (selEl && savedSelects[selId]) selEl.value = savedSelects[selId];
    }

    // Unticking a member SPLITS it into its own assignable card
    var memberBoxes = document.querySelectorAll('.chrono-member-cb');
    for (var mb = 0; mb < memberBoxes.length; mb++) {
        memberBoxes[mb].addEventListener('change', function () {
            if (!this.checked) {
                r.splitIds[this.getAttribute('data-id')] = true;
                self._renderAssignmentReview();
            }
        });
    }

    // "Back to group" rejoins the split string with its proposal
    var rejoinBtns = document.querySelectorAll('.chrono-rejoin');
    for (var rj = 0; rj < rejoinBtns.length; rj++) {
        rejoinBtns[rj].addEventListener('click', function () {
            delete r.splitIds[this.getAttribute('data-id')];
            self._renderAssignmentReview();
        });
    }

    // Group assign — exactly the members currently shown in the card
    var buttons = document.querySelectorAll('.chrono-cluster-confirm');
    for (var b = 0; b < buttons.length; b++) {
        buttons[b].addEventListener('click', function () {
            var c2 = parseInt(this.getAttribute('data-cluster'), 10);
            var ids = r.clusters[c2].members.filter(function (m) {
                return !r.splitIds[m.id];
            }).map(function (m) { return m.id; });
            if (!ids.length) return;
            var select = document.getElementById(this.getAttribute('data-select'));
            self._confirmAssignment(rifleId, ids, select.value, this);
        });
    }

    // Split assign — one string, its own load
    var splitBtns = document.querySelectorAll('.chrono-split-confirm');
    for (var sb = 0; sb < splitBtns.length; sb++) {
        splitBtns[sb].addEventListener('click', function () {
            var select = document.getElementById(this.getAttribute('data-select'));
            self._confirmAssignment(rifleId, [this.getAttribute('data-id')], select.value, this);
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
        // Inline name field (revealed when "+ New load…" is picked) —
        // no prompt() dialogs for input flows
        var nameInput = btn.parentNode ? btn.parentNode.querySelector('.chrono-newload-name') : null;
        var name = nameInput ? nameInput.value.trim() : '';
        if (!name) {
            status.textContent = 'Enter a name for the new load.';
            if (nameInput) nameInput.focus();
            return;
        }
        loadPromise = this.db.addLoad({ rifleId: rifleId, name: name })
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
