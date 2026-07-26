/**
 * chrono.js — ChronoManager: Garmin ShotView import UI.
 *
 * Flow: pick a ShotView export (.csv single session / .xlsx multi-session)
 * → parse via garmin-import.js → preview plates with include checkboxes
 * → optionally pick a rifle (strings become 'suggested'; confirmed later
 * in the assignment step) → save each included string to velocity_strings
 * with stats from velocity-stats.js and the barrel round count at that time.
 *
 * Markup follows docs/REDESIGN-SPEC.md (Part IV vocabulary, css/ui.css).
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
        tab.classList.remove('hidden');
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
    html += '<div class="view-toolbar" id="chrono-toolbar-import">';
    html += '<button type="button" class="toolbar-back" id="chrono-home-back-btn">' + Icon('chevron-left', 20) + 'Home</button>';
    html += '<h2 class="toolbar-title">Chrono import</h2>';
    html += '</div>';

    html += '<div class="view-toolbar hidden" id="chrono-toolbar-review">';
    html += '<button type="button" class="toolbar-back" id="chrono-back-btn">' +
        Icon('chevron-left', 20) + 'Import</button>';
    html += '<h2 class="toolbar-title">Assign strings to ammo</h2>';
    html += '</div>';

    html += '<div class="screen">';

    // Rifle-first hero plate: the import context is visible BEFORE any
    // file is parsed, and survives across multiple imports
    html += '<div id="chrono-import-section">';
    html += '<div class="plate">';
    html += '<h3 class="t-head">Import chrono data</h3>';
    html += '<p class="t-body u-quiet">Garmin ShotView (CSV or XLSX) or a LabRadar series report (CSV) &mdash; straight from the device.</p>';
    html += '<div class="field-row u-mt-14">';
    html += '<div class="field"><label class="field-label" for="chrono-rifle">Rifle for this import</label>';
    html += '<select id="chrono-rifle"><option value="">Pick a rifle</option></select></div>';
    html += '<div class="field"><label class="field-label" for="chrono-base-rounds">Rounds before import</label>';
    html += '<input type="number" id="chrono-base-rounds" min="0" step="1" placeholder="unknown">';
    html += '<p class="field-hint">Each string is tagged with its after-count: this base + shots fired so far.</p>';
    html += '</div></div>';
    html += '<label class="t-body u-quiet" for="chrono-add-rounds">' +
        '<input type="checkbox" id="chrono-add-rounds" disabled> ' +
        'Update the barrel round count to match (base + imported shots)</label>';
    html += '</div>'; // .plate
    html += '<label class="action-primary u-mt-14" id="chrono-file-label" for="chrono-file">' +
        Icon('import', 20) + 'Choose chrono file</label>';
    html += '<input type="file" id="chrono-file" accept=".csv,.xlsx" class="hidden">';
    html += '</div>'; // #chrono-import-section

    html += '<div id="chrono-review-launcher" class="hidden">';
    html += '<div class="qcard-kicker">Review saved strings</div>';
    html += '<div class="field"><label class="field-label" for="chrono-review-rifle">Rifle</label>';
    html += '<select id="chrono-review-rifle"></select></div>';
    html += '<button type="button" id="chrono-review-btn" class="action">Review strings</button>';
    html += '</div>';

    html += '<div id="chrono-error" class="alert-strip is-stop u-mt-10 hidden"></div>';
    html += '<div id="chrono-results" class="u-mt-10"></div>';
    html += '</div>'; // .screen
    this.container.innerHTML = html;

    var self = this;
    var homeBackBtn = document.getElementById('chrono-home-back-btn');
    if (homeBackBtn) homeBackBtn.addEventListener('click', function () {
        if (window.AppNav) AppNav.go('home');
    });
    var input = document.getElementById('chrono-file');
    input.addEventListener('change', function () {
        if (input.files && input.files.length > 0) {
            self._handleFile(input.files[0]);
        }
        input.value = ''; // allow re-picking the same file
    });

    // Review takes over the screen; the toolbar back returns here
    document.getElementById('chrono-back-btn').addEventListener('click', function () {
        self.show();
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
        importSel.innerHTML = '<option value="">Pick a rifle</option>' + opts;
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
        '<p class="t-body u-quiet">Reading ' + this._escapeHtml(file.name) + '&hellip;</p>';

    var name = (file.name || '').toLowerCase();

    if (name.slice(-4) === '.csv') {
        file.text().then(function (text) {
            // ShotView first; a LabRadar report (§2.2) parses as the
            // fallback. The error shown matches what the file looks like.
            var session;
            try {
                session = parseShotViewCSV(text, file.name);
            } catch (svErr) {
                if (typeof parseLabRadarCSV === 'function') {
                    try {
                        session = parseLabRadarCSV(text, file.name);
                    } catch (lrErr) {
                        throw (typeof looksLikeLabRadar === 'function' && looksLikeLabRadar(text))
                            ? lrErr : svErr;
                    }
                } else {
                    throw svErr;
                }
            }
            self._setSessions([session]);
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
 * One labelled instrument (label above number, unit beside) for a
 * stat strip.
 */
ChronoManager.prototype._instrumentHtml = function (label, value, unit) {
    return '<div class="instrument"><div class="instrument-label">' + label +
        '</div><div class="instrument-value">' + value +
        (unit ? '<span class="instrument-unit">' + unit + '</span>' : '') +
        '</div></div>';
};

/**
 * Render one preview plate per parsed session.
 */
ChronoManager.prototype._renderPreview = function () {
    var out = '';
    var totalShots = 0;
    var warnings = [];

    for (var i = 0; i < this.sessions.length; i++) {
        var s = this.sessions[i];
        totalShots += s.shots.length;
        warnings = warnings.concat(s.warnings || []);

        // Garmin's own numbers when the export carries them, otherwise
        // the same math the import will save (velocity-stats.js)
        var stats = velocityStats(s.shots);
        var avg = s.reported && s.reported.avg !== null ? s.reported.avg : stats.avg;
        var sd = s.reported && s.reported.sd !== null ? s.reported.sd : stats.sd;
        var es = s.reported && s.reported.es !== null ? s.reported.es : stats.es;

        out += '<div class="plate u-mb-12" data-index="' + i + '">';
        out += '<label class="t-head"><input type="checkbox" class="chrono-include-cb" data-index="' +
            i + '" checked> ' + this._escapeHtml(this._sessionTitle(s, i)) + '</label>';
        out += '<div id="chrono-dup-' + i + '" class="hidden"></div>';

        out += '<div class="stat-strip">';
        out += this._instrumentHtml('Shots', String(s.shots.length), null);
        out += this._instrumentHtml('Avg', formatNum(avg, 0), 'fps');
        out += this._instrumentHtml('SD', formatNum(sd, 1), 'fps');
        out += this._instrumentHtml('ES', formatNum(es, 1), 'fps');
        out += '</div>';

        out += '<div class="field u-mt-10"><label class="field-label" for="chrono-rounds-' + i +
            '">Barrel round count after this string</label>';
        out += '<input type="number" id="chrono-rounds-' + i + '" class="chrono-rounds-input" data-index="' +
            i + '" min="0" step="1" placeholder="unknown"></div>';

        out += '<details class="fold"><summary>Shots</summary><div class="fold-body">';
        out += '<div class="datatable-wrap"><table class="datatable"><thead><tr>' +
            '<th>#</th><th>Speed (fps)</th><th>Time</th></tr></thead><tbody>';
        for (var j = 0; j < s.shots.length; j++) {
            var shot = s.shots[j];
            out += '<tr><td>' + shot.shot + '</td><td>' + formatNum(shot.fps, 1) + '</td><td>' +
                this._escapeHtml(shot.time || '—') + '</td></tr>';
        }
        out += '</tbody></table></div></div></details>';
        out += '</div>'; // .plate
    }

    for (var w = 0; w < warnings.length; w++) {
        out += '<div class="alert-strip u-mb-12">' + Icon('alert', 18) +
            '<span>' + this._escapeHtml(warnings[w]) + '</span></div>';
    }

    out += '<p class="t-micro">' + this.sessions.length + ' session' +
        (this.sessions.length === 1 ? '' : 's') + ', ' + totalShots + ' shots parsed.</p>';
    out += '<button type="button" id="chrono-import-btn" class="action-primary u-mt-10">Import selected</button>';
    out += '<div id="chrono-status" class="t-micro u-mt-10"></div>';

    document.getElementById('chrono-results').innerHTML = out;

    // With results on screen, "Import selected" is the one loud thing —
    // the file picker steps back to a quiet action
    var fileLabel = document.getElementById('chrono-file-label');
    if (fileLabel) fileLabel.className = 'action u-full u-mt-14';

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
 *    disabled ("Already imported").
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
                    badge.className = 'chip is-stop u-mt-10';
                    badge.textContent = 'Already imported';
                } else if (isFpDup) {
                    var where = fpOwner === null ? 'in your unassigned strings'
                        : 'on rifle "' + (rifleNames[fpOwner] || 'unknown') + '"';
                    badge.className = 'alert-strip u-mt-10';
                    badge.innerHTML = Icon('alert', 18) + '<span>These exact shots are already imported ' +
                        self._escapeHtml(where) + ' &mdash; tick this string only to import anyway.</span>';
                } else {
                    badge.className = 'hidden';
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
    var counts = document.querySelectorAll('#chrono-results .chrono-rounds-input');
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

        // Suppressor configuration tag from the selected rifle
        var importRifle = null;
        for (var ir = 0; ir < self.rifles.length; ir++) {
            if (self.rifles[ir].id === rifleId) { importRifle = self.rifles[ir]; break; }
        }
        records.push({
            rifleId: rifleId,
            barrelId: rifleId && self.activeBarrel ? self.activeBarrel.id : null,
            config: importRifle && importRifle.hasConfigs
                ? (importRifle.activeConfig || 'bare') : null,
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
        status.textContent = 'Nothing selected — tick at least one session.';
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
            document.getElementById('chrono-import-btn').classList.add('hidden');
            // No auto-jump: hand the user an explicit next step instead
            // of yanking the screen away while they read the status
            var goBtn = document.createElement('button');
            goBtn.type = 'button';
            goBtn.className = 'action u-mt-10';
            goBtn.innerHTML = 'Assign to loads ' + Icon('arrow-right', 18);
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

    // Review takes over the screen — hide the import controls and swap
    // toolbars (the toolbar back re-renders the whole view)
    var importSection = document.getElementById('chrono-import-section');
    if (importSection) importSection.classList.add('hidden');
    var launcher = document.getElementById('chrono-review-launcher');
    if (launcher) launcher.classList.add('hidden');
    var importToolbar = document.getElementById('chrono-toolbar-import');
    if (importToolbar) importToolbar.classList.add('hidden');
    var reviewToolbar = document.getElementById('chrono-toolbar-review');
    if (reviewToolbar) reviewToolbar.classList.remove('hidden');

    // Preserve the confirmed-section expand state across re-renders
    // (deleting/editing several strings in a row shouldn't snap it shut)
    var confirmedDetails = document.getElementById('chrono-confirmed-details');
    if (confirmedDetails) this._confirmedOpen = confirmedDetails.hasAttribute('open');
    document.getElementById('chrono-results').innerHTML =
        '<p class="t-body u-quiet">Loading strings&hellip;</p>';

    // Carry the user's split choices across data refreshes (assigning
    // or deleting one string must not re-merge the others)
    var prevSplits = (this._review && this._review.splitIds) || {};

    Promise.all([
        this.db.getVelocityStringsByRifle(rifleId),
        this.db.getLoadsByRifle(rifleId),
        this.db.getRifle(rifleId).catch(function () { return null; })
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
            rifle: results[2] || null,
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

    var out = '';

    if (!r.pending.length) {
        out += '<div class="empty-teach"><p>No strings waiting for assignment.</p>';
        out += '<button type="button" id="chrono-goto-report" class="action">' +
            Icon('award', 18) + 'View performance report</button></div>';
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
    var loadOptions = '<option value="">Pick a load</option>';
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
        out += '<p class="t-body u-quiet u-mb-12">These are <strong>proposals</strong> based on velocity — nothing is combined until you confirm. Untick a string to split it out and give it its own load.</p>';
    }

    for (var c = 0; c < r.clusters.length; c++) {
        var cluster = r.clusters[c];
        var members = cluster.members.filter(function (m) { return !r.splitIds[m.id]; });
        if (!members.length) continue; // fully split out — card disappears

        var groupShots = members.reduce(function (a, m) {
            return a + (m.shots && m.shots.length ? m.shots.length : 0);
        }, 0);

        out += '<div class="plate u-mb-12">';
        out += '<h4 class="t-head">These ' + groupShots + ' shots look like one load</h4>';
        out += '<p class="t-micro">Proposed group ' + (c + 1) + ' · avg ~' + formatNum(cluster.meanFps, 0) +
            ' fps · ' + members.length + ' string' + (members.length === 1 ? '' : 's') + '</p>';
        out += '<div class="u-mt-10">';
        for (var m = 0; m < members.length; m++) {
            var s = members[m];
            var escId = this._escapeHtml(s.id);
            out += '<div class="row-item">';
            out += '<input type="checkbox" class="chrono-member-cb" id="chrono-member-' + escId +
                '" data-id="' + escId + '" checked>';
            out += '<label class="row-main" for="chrono-member-' + escId + '">' +
                this._escapeHtml(this._stringLabel(s)) + '</label>';
            out += '<div class="row-aside">' + this._roundsEditHtml(s) + this._deleteBtnHtml(s) + '</div>';
            out += '</div>';
        }
        out += '</div>';
        out += '<div class="field u-mt-10"><label class="field-label" for="chrono-cluster-load-' + c +
            '">Load</label>';
        out += '<select class="chrono-load-select" id="chrono-cluster-load-' + c + '">' + loadOptions + '</select>';
        out += '<input type="text" class="chrono-newload-name u-mt-10 hidden" maxlength="80" placeholder="New load name">';
        // Wrong-rifle protection: the confirm restates the rifle it writes to
        out += '<button type="button" class="action u-full u-mt-10 chrono-cluster-confirm" data-cluster="' + c +
            '" data-select="chrono-cluster-load-' + c + '">Assign group (' + members.length + ')' +
            (r.rifle && r.rifle.name ? ' to ' + this._escapeHtml(r.rifle.name) : '') + '</button>';
        out += '</div>';
        out += '</div>'; // .plate
    }

    // Split-out strings — each gets its OWN load pick + assign button
    var splitStrings = r.pending.filter(function (s) { return r.splitIds[s.id]; });
    if (splitStrings.length) {
        out += '<div class="qcard-kicker">Assign separately</div>';
        for (var sp = 0; sp < splitStrings.length; sp++) {
            var ss = splitStrings[sp];
            out += '<div class="plate u-mb-12">';
            out += '<div class="t-body">' + this._escapeHtml(this._stringLabel(ss)) + '</div>';
            out += '<div class="u-mt-10">' + this._roundsEditHtml(ss) + ' ' + this._deleteBtnHtml(ss);
            if (!r.ambiguousIds[ss.id]) {
                out += ' <button type="button" class="action-ghost chrono-rejoin" data-id="' +
                    this._escapeHtml(ss.id) + '">' + Icon('undo', 16) + 'Back to group</button>';
            }
            out += '</div>';
            if (r.ambiguousIds[ss.id]) {
                out += '<div class="alert-strip u-mt-10">' + Icon('alert', 18) +
                    '<span>Needs your call — this string sits between velocity groups.</span></div>';
            }
            out += '<div class="field u-mt-10"><label class="field-label" for="chrono-split-load-' +
                this._escapeHtml(ss.id) + '">Load</label>';
            out += '<select class="chrono-load-select" id="chrono-split-load-' + this._escapeHtml(ss.id) + '">' +
                loadOptions + '</select>';
            out += '<input type="text" class="chrono-newload-name u-mt-10 hidden" maxlength="80" placeholder="New load name">';
            out += '<button type="button" class="action u-full u-mt-10 chrono-split-confirm" data-id="' +
                this._escapeHtml(ss.id) + '" data-select="chrono-split-load-' + this._escapeHtml(ss.id) +
                '">Assign (1)' +
                (r.rifle && r.rifle.name ? ' to ' + this._escapeHtml(r.rifle.name) : '') + '</button>';
            out += '</div>';
            out += '</div>'; // .plate
        }
    }

    if (confirmed.length) {
        out += '<details class="fold" id="chrono-confirmed-details"' +
            (this._confirmedOpen ? ' open' : '') + '><summary>' + confirmed.length +
            ' already-confirmed string' + (confirmed.length === 1 ? '' : 's') +
            '</summary><div class="fold-body">';
        for (var cf = 0; cf < confirmed.length; cf++) {
            out += '<div class="row-item">';
            out += '<div class="row-main"><div>' + this._escapeHtml(this._stringLabel(confirmed[cf])) +
                '</div><div class="row-sub">' +
                this._escapeHtml(loadNames[confirmed[cf].loadId] || 'unknown load') + '</div></div>';
            out += '<div class="row-aside">' + this._roundsEditHtml(confirmed[cf]) +
                this._deleteBtnHtml(confirmed[cf]) + '</div>';
            out += '</div>';
        }
        out += '</div></details>';
    }

    out += '<div id="chrono-status" class="t-micro u-mt-10"></div>';
    document.getElementById('chrono-results').innerHTML = out;

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
            var wrap = document.createElement('span');
            wrap.className = 'stepper';
            var field = document.createElement('input');
            field.type = 'number';
            field.min = '0';
            field.step = '1';
            field.value = s && typeof s.roundCountAt === 'number' ? s.roundCountAt : '';
            field.placeholder = 'rounds';
            wrap.appendChild(field);
            this.replaceWith(wrap);
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
        // Lot inheritance: strings confirmed to a load carry its lot
        // number at confirmation time (the lot they were shot from)
        var lot = null;
        var reviewLoads = (self._review && self._review.loads) || [];
        for (var rl = 0; rl < reviewLoads.length; rl++) {
            if (reviewLoads[rl].id === loadId) { lot = reviewLoads[rl].lotNumber || null; break; }
        }
        var chain = Promise.resolve();
        stringIds.forEach(function (id) {
            chain = chain.then(function () {
                return self.db.updateVelocityString({
                    id: id,
                    rifleId: rifleId,
                    loadId: loadId,
                    lotNumber: lot,
                    assignmentStatus: 'confirmed'
                }).then(function (updated) {
                    // Every accepted import writes an MV measurement
                    // EVENT (§2.8) — feeds the Calibration Status card.
                    self._recordMvEvent(updated);
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
 * Write the append-only mv_measurements event for a string confirmed
 * to a load (§2.8/§2.10). Best-effort; never blocks the assignment.
 */
ChronoManager.prototype._recordMvEvent = function (record) {
    if (!record || !record.rifleId || !record.shots || !record.shots.length) return;
    if (typeof velocityStats !== 'function') return;
    var self = this;
    var stats = velocityStats(record.shots);
    var payload = {
        rifleId: record.rifleId,
        loadId: record.loadId || null,
        velocityStringId: record.id,
        date: record.date || new Date().toISOString(),
        value: stats.avg,
        sd: stats.sd,
        es: stats.es,
        shotCount: stats.n,
        lotNumber: record.lotNumber || null,
        suppressorId: record.suppressorId || null,
        source: record.source === 'labradar_csv' ? 'labradar' : 'shotview'
    };
    var write = (typeof SyncQueue !== 'undefined' && SyncQueue)
        ? function (fn, d) { return SyncQueue.write(fn, d); }
        : function (fn, d) { return self.db[fn](d); };
    write('addMvMeasurement', payload).catch(function (e) {
        console.warn('[Chrono] mv event failed:', e);
    });
};

/**
 * Ghost delete button for one saved string (confirm-guarded).
 */
ChronoManager.prototype._deleteBtnHtml = function (s) {
    return '<button type="button" class="action-ghost chrono-delete-string" data-id="' +
        this._escapeHtml(s.id) + '" title="Delete this string permanently">' +
        Icon('trash', 16) + 'Delete</button>';
};

/**
 * Ghost "Rounds: N" edit button for one saved string.
 */
ChronoManager.prototype._roundsEditHtml = function (s) {
    var shown = typeof s.roundCountAt === 'number' ? s.roundCountAt : '—';
    return '<button type="button" class="action-ghost chrono-edit-rounds" data-id="' +
        this._escapeHtml(s.id) + '" title="Edit barrel round count after this string">Rounds: ' +
        shown + ' ' + Icon('pencil', 16) + '</button>';
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
 * Human title for a session plate: date if known, else sheet/file name.
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
        el.innerHTML = Icon('alert', 18) + '<span>' + this._escapeHtml(message) + '</span>';
        el.classList.remove('hidden');
    } else {
        el.innerHTML = '';
        el.classList.add('hidden');
    }
};

ChronoManager.prototype._escapeHtml = function (text) {
    var div = document.createElement('div');
    div.textContent = text === null || text === undefined ? '' : String(text);
    return div.innerHTML;
};
