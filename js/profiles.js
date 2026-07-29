/**
 * profiles.js — Rifle and Load profile management UI.
 *
 * Manages views: rifle detail (Paperwork — loads + barrel + settings),
 * rifle form (create/edit), load form (create/edit), load detail. The
 * standalone rifle-LIST view was retired in the UI Consolidation phase
 * (surface budget law: Card / switcher sheet / details drawer, nothing
 * else) — showRifleList() is now a compatibility redirect to the Card,
 * kept under its old name so existing fallback callers don't need
 * touching; see its own comment.
 *
 * All rendering targets the #view-profiles container and emits the
 * ui.css vocabulary (docs/REDESIGN-SPEC.md Part IV).
 */

function ProfileManager(db) {
    this.db = db;
    this.container = null;
    this.currentRifleId = null; // set when viewing a rifle detail
    this.historyManager = null; // set by app.js after HistoryManager is created
}

/**
 * Initialize DOM reference. Call once after DOM ready.
 */
ProfileManager.prototype.init = function () {
    this.container = document.getElementById('view-profiles');
};

/**
 * showRifleList — STRIP-DOWN PHASE (owner order). The RIFLES entry
 * point, reached from MainMenu (AppNav.openRifleList). Deliberately
 * minimal: name + caliber per rifle, "+ Add rifle" last, nothing else
 * — no status chips, no search, no fleet summary (all HIDDEN this
 * phase, see STRIPDOWN-REPORT.md). Kept under this name (not renamed)
 * because the many existing fallback callers across certificate.js/
 * history.js/rifle-report.js/profiles.js itself already call it
 * expecting "somewhere safe to land" — it's a real, useful destination
 * again, not a bounce to the main menu.
 */
ProfileManager.prototype.showRifleList = function () {
    this.currentRifleId = null;
    var self = this;
    this.db.getAllRifles().catch(function () { return []; }).then(function (rifles) {
        rifles = rifles || [];
        rifles.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
        self._renderRifleList(rifles);
    });
};

ProfileManager.prototype._renderRifleList = function (rifles) {
    var self = this;
    var html = '<div class="screen">';
    html += '<div class="pagehead"><button class="backline" id="btn-rifles-back">&lsaquo; Menu</button>' +
        '<div class="pagetitle">Rifles</div></div>';

    if (!rifles.length) {
        html += '<div class="empty-teach">';
        html += '<p>Add your first rifle to get started.</p>';
        html += '<button type="button" class="btn-primary" id="btn-add-rifle">' + Icon('plus', 20) + 'Add rifle</button>';
        html += '</div>';
    } else {
        var rows = '';
        rifles.forEach(function (r) {
            rows += UI.rowlink({
                button: true, title: r.name || 'Rifle', sub: r.caliber || '',
                data: { 'rifle-id': r.id }, chev: true
            });
        });
        html += UI.card(rows);
        html += '<div class="fab-zone"><button type="button" class="btn-primary" id="btn-add-rifle">' +
            Icon('plus', 20) + 'Add rifle</button></div>';
    }
    html += '</div>';
    this.container.innerHTML = html;

    var backBtn = document.getElementById('btn-rifles-back');
    if (backBtn) backBtn.addEventListener('click', function () { if (window.AppNav) AppNav.go('home'); });
    var addBtn = document.getElementById('btn-add-rifle');
    if (addBtn) addBtn.addEventListener('click', function () { self.showRifleForm(null); });
    var rifleRows = this.container.querySelectorAll('[data-rifle-id]');
    for (var i = 0; i < rifleRows.length; i++) {
        rifleRows[i].addEventListener('click', function () {
            self.showRifleDetail(this.getAttribute('data-rifle-id'));
        });
    }
};

/**
 * Account overlay (UI Consolidation phase): the three things that used
 * to live on the killed Rifles-list page with no per-rifle home — Misc
 * sessions (paper sessions saved without a rifle), Suppressed shooting
 * (the standing can-tracking toggle), and Account (privacy policy +
 * delete account). Reached from Paperwork's "Settings & sign-out" row.
 * An overlay off the details drawer, not a new top-level surface — same
 * class as the trip-planner/troubleshooting-check overlays already used
 * elsewhere in this codebase, so it does not add to the rifle-surface
 * count.
 */
ProfileManager.prototype._showAccountOverlay = function () {
    var self = this;
    var overlay = document.createElement('div');
    overlay.className = 'overlay';
    var html = '<div class="overlay-card"><div class="overlay-title">Settings &amp; account</div>';

    html += UI.card(UI.rowlink({
        button: true, id: 'ao-misc-sessions',
        title: 'Misc sessions', sub: 'Sessions saved without a rifle profile', chev: true
    }));

    if (typeof Suppressors !== 'undefined') {
        html += '<details class="fold u-mt-14"><summary>Suppressed shooting</summary>';
        html += '<div class="fold-body" id="ao-sup-fold-body"><p class="t-body u-quiet">Loading&hellip;</p></div>';
        html += '</details>';
    }

    html += '<details class="fold u-mt-14"><summary>Account</summary>';
    html += '<div class="fold-body">';
    html += '<p class="t-body"><a href="privacy-policy.html">Privacy policy</a></p>';
    html += '<p class="t-body u-quiet u-mt-10">Deleting your account permanently removes every rifle, session, photo, and chrono string. This cannot be undone.</p>';
    html += '<button type="button" class="btn-danger u-mt-10" id="ao-delete-account">Delete account&hellip;</button>';
    html += '</div></details>';

    html += '<button class="btn u-full u-mt-10" id="ao-close">Close</button></div>';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('#ao-close').addEventListener('click', close);

    var miscBtn = overlay.querySelector('#ao-misc-sessions');
    if (miscBtn && this.historyManager) {
        miscBtn.addEventListener('click', function () {
            close();
            self.historyManager.showMiscSessionList();
        });
    }

    this._fillSuppressorFold(overlay);

    var deleteAccountBtn = overlay.querySelector('#ao-delete-account');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', function () {
            var typed = prompt('This permanently deletes your account and ALL data — rifles, sessions, photos, chrono strings.\n\nType DELETE to confirm:');
            if (typed !== 'DELETE') return;
            deleteAccountBtn.disabled = true;
            deleteAccountBtn.textContent = 'Deleting…';
            self.db.deleteMyAccount().then(function () {
                alert('Your account and all data have been deleted.');
                window.location.href = window.location.pathname;
            }).catch(function (err) {
                deleteAccountBtn.disabled = false;
                deleteAccountBtn.textContent = 'Delete account…';
                alert('Account deletion failed: ' + err.message);
            });
        });
    }
};

/** Suppressed-shooting fold: standing toggle (v3.0 step 9), replaces
 *  the old one-time onboarding question. Scoped to an explicit root
 *  element (the account overlay) rather than a page-level id lookup,
 *  since this now renders inside a transient overlay, not a persistent
 *  page container. */
ProfileManager.prototype._fillSuppressorFold = function (scope) {
    var self = this;
    var root = scope || document;
    var body = root.querySelector('#ao-sup-fold-body');
    if (!body || typeof Suppressors === 'undefined') return;
    Suppressors.isEnabled(this.db).then(function (on) {
        if (!body.isConnected) return;
        body.innerHTML = on
            ? '<p class="t-body u-quiet">On &mdash; sessions ask which can is on.</p>' +
              '<button type="button" class="action u-full u-mt-10" id="sup-manage">Manage cans</button>' +
              '<button type="button" class="action u-full u-mt-10" id="sup-turnoff">Turn off</button>'
            : '<p class="t-body u-quiet">Off &mdash; sessions never ask about a can.</p>' +
              '<button type="button" class="action u-full u-mt-10" id="sup-turnon">Turn on &amp; add a can</button>';

        var manage = body.querySelector('#sup-manage');
        if (manage) manage.addEventListener('click', function () {
            Suppressors.addSheet(self.db, { onDone: function () { self._fillSuppressorFold(root); } });
        });
        var turnoff = body.querySelector('#sup-turnoff');
        if (turnoff) turnoff.addEventListener('click', function () {
            Suppressors.setEnabled(self.db, false).then(function () { self._fillSuppressorFold(root); });
        });
        var turnon = body.querySelector('#sup-turnon');
        if (turnon) turnon.addEventListener('click', function () {
            Suppressors.setEnabled(self.db, true).then(function () {
                Suppressors.addSheet(self.db, { intro: true, onDone: function () { self._fillSuppressorFold(root); } });
            });
        });
    }).catch(function () { /* leave "Loading…" — non-critical setting */ });
};

// ── Rifle Form (Create / Edit) ─────────────────────────────────

ProfileManager.prototype.showRifleForm = function (rifleId) {
    var self = this;
    if (rifleId) {
        // Load rifle + barrel together for unified form
        Promise.all([
            self.db.getRifle(rifleId),
            self.db.getBarrelsByRifle(rifleId)
        ]).then(function (results) {
            var rifle = results[0];
            var barrels = results[1];
            var activeBarrel = null;
            for (var i = 0; i < barrels.length; i++) {
                if (barrels[i].isActive) { activeBarrel = barrels[i]; break; }
            }
            if (rifle) self._renderRifleForm(rifle, activeBarrel);
        });
    } else {
        this._renderRifleForm(null, null);
    }
};

ProfileManager.prototype._renderRifleForm = function (rifle, barrel) {
    var isEdit = !!rifle;
    var title = isEdit ? 'Edit rifle' : 'New rifle';

    // Parse existing twist rate number from stored string (e.g. "1:8" → "8", "1:8.5" → "8.5")
    var twistNum = '';
    if (barrel && barrel.twistRate) {
        var parts = barrel.twistRate.split(':');
        twistNum = parts.length > 1 ? parts[1] : parts[0];
    }

    var html = '<div class="view-toolbar">';
    html += '<button type="button" class="toolbar-back" id="btn-form-back">' + Icon('chevron-left', 20) + 'Back</button>';
    html += '<h2 class="toolbar-title">' + title + '</h2>';
    html += '</div>';

    html += '<div class="screen">';
    html += '<form id="rifle-form">';

    html += '<div class="field">';
    html += '<label class="field-label" for="rf-name">Rifle name *</label>';
    html += '<input type="text" id="rf-name" maxlength="80" placeholder="e.g., Bergara B14 HMR" value="' + escapeAttr(rifle ? rifle.name : '') + '">';
    html += '</div>';

    html += '<div class="field">';
    html += '<label class="field-label" for="rf-caliber">Caliber *</label>';
    html += '<input type="text" id="rf-caliber" maxlength="40" placeholder="e.g., .308 Win" value="' + escapeAttr(rifle ? rifle.caliber : '') + '">';
    html += '</div>';

    html += '<div class="field-row">';
    html += '<div class="field">';
    html += '<label class="field-label" for="rf-scope-height">Scope height <span class="field-unit">in</span> <button type="button" class="hint-btn" onclick="showHelp(\'scopeHeight\')" title="What is scope height?">?</button></label>';
    html += '<input type="number" id="rf-scope-height" min="0" max="5" step="0.01" inputmode="decimal" placeholder="1.5" value="' + (rifle && rifle.scopeHeight ? rifle.scopeHeight : '') + '">';
    html += '</div>';
    html += '<div class="field">';
    html += '<label class="field-label" for="rf-zero-range">Zero range <span class="field-unit">yd</span> <button type="button" class="hint-btn" onclick="showHelp(\'zeroRange\')" title="What is zero range?">?</button></label>';
    html += '<input type="number" id="rf-zero-range" min="0" max="1500" step="1" inputmode="numeric" placeholder="100" value="' + (rifle && rifle.zeroRange ? rifle.zeroRange : '') + '">';
    html += '</div>';
    html += '</div>';

    // Turret units — wind grading and insights speak this unit
    var unitVal = rifle && String(rifle.angleUnit || '').toUpperCase() === 'MIL' ? 'MIL' : 'MOA';
    html += '<div class="field">';
    html += '<label class="field-label">Turret units</label>';
    // Template C segmented control; a hidden input carries the value
    html += '<input type="hidden" id="rf-angle-unit" value="' + (unitVal === 'MIL' ? 'MIL' : 'MOA') + '">';
    html += '<div class="segment" id="rf-angle-seg">';
    html += '<button type="button" data-unit="MOA"' + (unitVal !== 'MIL' ? ' class="on"' : '') + '>MOA</button>';
    html += '<button type="button" data-unit="MIL"' + (unitVal === 'MIL' ? ' class="on"' : '') + '>MIL (mrad)</button>';
    html += '</div>';
    html += '</div>';

    // ── Barrel fields merged into rifle form ──
    html += '<div class="field-row">';
    html += '<div class="field">';
    html += '<label class="field-label" for="rf-twist">Barrel twist <span class="field-unit">1:</span></label>';
    html += '<input type="number" id="rf-twist" min="1" max="20" step="0.5" inputmode="decimal" placeholder="8" value="' + escapeAttr(twistNum) + '">';
    html += '</div>';

    if (isEdit) {
        // Show twist direction on edit
        html += '<div class="field">';
        html += '<label class="field-label" for="rf-twist-dir">Twist direction</label>';
        html += '<select id="rf-twist-dir">';
        html += '<option value="Right"' + (barrel && barrel.twistDirection === 'Right' ? ' selected' : (!barrel ? ' selected' : '')) + '>Right</option>';
        html += '<option value="Left"' + (barrel && barrel.twistDirection === 'Left' ? ' selected' : '') + '>Left</option>';
        html += '</select>';
        html += '</div>';
    } else {
        // On create, skip twist direction (default Right)
        html += '<div class="field"></div>';
    }
    html += '</div>';

    if (isEdit) {
        html += '<div class="field-row">';
        html += '<div class="field">';
        html += '<label class="field-label" for="rf-rounds">Round count</label>';
        html += '<input type="number" id="rf-rounds" min="0" step="1" inputmode="numeric" placeholder="0" value="' + (barrel ? (barrel.totalRounds || 0) : 0) + '">';
        html += '</div>';
        html += '<div class="field">';
        html += '<span class="field-label">Since cleaned</span>';
        html += '<p class="t-body u-quiet" id="rf-since-cleaned">&mdash;</p>';
        html += '</div>';
        html += '</div>';

        // Install date — collapsed by default
        html += '<details class="fold u-mb-12">';
        html += '<summary>Install date</summary>';
        html += '<div class="fold-body">';
        html += '<div class="field">';
        html += '<input type="date" id="rf-install-date" value="' + escapeAttr(barrel ? barrel.installDate : new Date().toISOString().split('T')[0]) + '">';
        html += '</div>';
        html += '</div>';
        html += '</details>';
    }

    // Suppressor configurations (Template C segmented No/Yes)
    var hasConfigs = !!(rifle && rifle.hasConfigs);
    html += '<div class="field">';
    html += '<label class="field-label">Sometimes runs a suppressor</label>';
    html += '<input type="checkbox" id="rf-has-configs" class="hidden"' + (hasConfigs ? ' checked' : '') + '>';
    html += '<div class="segment" id="rf-configs-seg">';
    html += '<button type="button" data-configs="0"' + (!hasConfigs ? ' class="on"' : '') + '>No</button>';
    html += '<button type="button" data-configs="1"' + (hasConfigs ? ' class="on"' : '') + '>Yes</button>';
    html += '</div>';
    html += '<p class="field-hint">Bare and suppressed configurations get their own zero and velocity records</p>';
    html += '</div>';

    // Build sheet (certificate fields) — collapsed by default
    html += '<details class="fold u-mb-12"' + (rifle && (rifle.serialNumber || rifle.action || rifle.barrelSpec || rifle.triggerSpec || rifle.chassis || rifle.muzzleDevice) ? ' open' : '') + '>';
    html += '<summary>Build sheet (for certificate)</summary>';
    html += '<div class="fold-body">';
    html += '<div class="field"><label class="field-label" for="rf-serial">Serial number</label>';
    html += '<input type="text" id="rf-serial" placeholder="e.g. WH-0042" value="' + escapeAttr(rifle && rifle.serialNumber ? rifle.serialNumber : '') + '"></div>';
    html += '<div class="field"><label class="field-label" for="rf-action">Action</label>';
    html += '<input type="text" id="rf-action" placeholder="e.g. Defiance Deviant Elite" value="' + escapeAttr(rifle && rifle.action ? rifle.action : '') + '"></div>';
    html += '<div class="field"><label class="field-label" for="rf-barrel-spec">Barrel</label>';
    html += '<input type="text" id="rf-barrel-spec" placeholder="e.g. Proof Research CF 24&quot; Sendero" value="' + escapeAttr(rifle && rifle.barrelSpec ? rifle.barrelSpec : '') + '"></div>';
    html += '<div class="field"><label class="field-label" for="rf-trigger">Trigger</label>';
    html += '<input type="text" id="rf-trigger" placeholder="e.g. TriggerTech Diamond" value="' + escapeAttr(rifle && rifle.triggerSpec ? rifle.triggerSpec : '') + '"></div>';
    html += '<div class="field"><label class="field-label" for="rf-chassis">Chassis / stock</label>';
    html += '<input type="text" id="rf-chassis" placeholder="e.g. MPA BA Comp" value="' + escapeAttr(rifle && rifle.chassis ? rifle.chassis : '') + '"></div>';
    html += '<div class="field"><label class="field-label" for="rf-muzzle">Muzzle device</label>';
    html += '<input type="text" id="rf-muzzle" placeholder="e.g. Area 419 Hellfire" value="' + escapeAttr(rifle && rifle.muzzleDevice ? rifle.muzzleDevice : '') + '"></div>';
    html += '</div>';
    html += '</details>';

    html += '<div class="field">';
    html += '<label class="field-label" for="rf-notes">Notes</label>';
    html += '<textarea id="rf-notes" rows="3" placeholder="Optional notes">' + escapeHtml(rifle ? rifle.notes : '') + '</textarea>';
    html += '</div>';

    // Template C: sticky actions — Save · Cancel · guarded delete
    html += '<div class="form-actions">';
    html += '<button type="submit" class="btn-primary u-full">' + (isEdit ? 'Save' : 'Create rifle') + '</button>';
    html += '<button type="button" class="btn u-full" id="btn-rifle-form-cancel">Cancel</button>';
    if (isEdit) {
        html += '<button type="button" class="btn-danger u-full" id="btn-delete-rifle">Delete rifle&hellip;</button>';
    }
    html += '</div>';

    html += '</form>';
    html += '</div>'; // close .screen

    this.container.innerHTML = html;
    this._bindRifleFormEvents(rifle, barrel);

    // Compute "since cleaned" for display
    if (isEdit && barrel) {
        var self = this;
        this.db.getCleaningLogsByBarrel(barrel.id).then(function (cleaningLogs) {
            var sinceCleaning = self.historyManager
                ? self.historyManager._computeRoundsSinceCleaning(barrel.totalRounds || 0, cleaningLogs)
                : (barrel.totalRounds || 0);
            var el = document.getElementById('rf-since-cleaned');
            if (el) el.textContent = sinceCleaning;
        });
    }
};

ProfileManager.prototype._bindRifleFormEvents = function (rifle, barrel) {
    var self = this;

    function leaveForm() {
        if (rifle) {
            self.showRifleDetail(rifle.id);
        } else {
            self.showRifleList();
        }
    }
    document.getElementById('btn-form-back').addEventListener('click', leaveForm);
    var cancelBtn = document.getElementById('btn-rifle-form-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', leaveForm);

    // Segmented controls drive their hidden inputs
    var unitSeg = document.getElementById('rf-angle-seg');
    if (unitSeg) {
        var unitBtns = unitSeg.querySelectorAll('[data-unit]');
        for (var u = 0; u < unitBtns.length; u++) {
            unitBtns[u].addEventListener('click', function () {
                document.getElementById('rf-angle-unit').value = this.getAttribute('data-unit');
                var siblings = unitSeg.querySelectorAll('[data-unit]');
                for (var s = 0; s < siblings.length; s++) siblings[s].classList.remove('on');
                this.classList.add('on');
            });
        }
    }
    var cfgSeg = document.getElementById('rf-configs-seg');
    if (cfgSeg) {
        var cfgBtns = cfgSeg.querySelectorAll('[data-configs]');
        for (var c = 0; c < cfgBtns.length; c++) {
            cfgBtns[c].addEventListener('click', function () {
                document.getElementById('rf-has-configs').checked = this.getAttribute('data-configs') === '1';
                var sibs = cfgSeg.querySelectorAll('[data-configs]');
                for (var s = 0; s < sibs.length; s++) sibs[s].classList.remove('on');
                this.classList.add('on');
            });
        }
    }

    document.getElementById('rifle-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var name = document.getElementById('rf-name').value.trim();
        var caliber = document.getElementById('rf-caliber').value.trim();
        if (!name || !caliber) {
            alert('Name and caliber are required');
            return;
        }

        var data = {
            name: name,
            caliber: caliber,
            scopeHeight: parseFloat(document.getElementById('rf-scope-height').value) || 0,
            zeroRange: parseFloat(document.getElementById('rf-zero-range').value) || 0,
            angleUnit: document.getElementById('rf-angle-unit').value,
            notes: document.getElementById('rf-notes').value.trim(),
            hasConfigs: document.getElementById('rf-has-configs').checked,
            activeConfig: document.getElementById('rf-has-configs').checked ? 'bare' : null,
            serialNumber: document.getElementById('rf-serial').value.trim() || null,
            action: document.getElementById('rf-action').value.trim() || null,
            barrelSpec: document.getElementById('rf-barrel-spec').value.trim() || null,
            triggerSpec: document.getElementById('rf-trigger').value.trim() || null,
            chassis: document.getElementById('rf-chassis').value.trim() || null,
            muzzleDevice: document.getElementById('rf-muzzle').value.trim() || null
        };

        // Collect barrel fields
        var barrelData = null;
        var twistInput = document.getElementById('rf-twist');
        var twistVal = twistInput ? twistInput.value.trim() : '';
        var twistDirEl = document.getElementById('rf-twist-dir');
        var twistDir = twistDirEl ? twistDirEl.value : 'Right';
        var roundsEl = document.getElementById('rf-rounds');
        var installDateEl = document.getElementById('rf-install-date');

        if (twistVal) {
            barrelData = {
                twistRate: '1:' + twistVal,
                twistDirection: twistDir,
                totalRounds: roundsEl ? (parseInt(roundsEl.value, 10) || 0) : 0,
                installDate: installDateEl ? installDateEl.value : new Date().toISOString().split('T')[0]
            };
        }

        if (rifle) {
            // Update rifle
            rifle.name = data.name;
            rifle.caliber = data.caliber;
            rifle.scopeHeight = data.scopeHeight;
            rifle.zeroRange = data.zeroRange;
            rifle.angleUnit = data.angleUnit;
            rifle.notes = data.notes;
            rifle.hasConfigs = data.hasConfigs;
            if (data.hasConfigs && !rifle.activeConfig) rifle.activeConfig = 'bare';
            rifle.serialNumber = data.serialNumber;
            rifle.action = data.action;
            rifle.barrelSpec = data.barrelSpec;
            rifle.triggerSpec = data.triggerSpec;
            rifle.chassis = data.chassis;
            rifle.muzzleDevice = data.muzzleDevice;

            var savePromise = self.db.updateRifle(rifle);

            // Also update or create barrel. A barrel failure must never
            // strand the user on the form — the rifle IS saved by then,
            // so say what happened and show the detail page anyway.
            if (barrelData) {
                savePromise = savePromise.then(function () {
                    var barrelPromise;
                    if (barrel) {
                        // Update existing barrel
                        barrel.twistRate = barrelData.twistRate;
                        barrel.twistDirection = barrelData.twistDirection;
                        barrel.totalRounds = barrelData.totalRounds;
                        if (barrelData.installDate) barrel.installDate = barrelData.installDate;
                        barrelPromise = self.db.updateBarrel(barrel);
                    } else {
                        // Create new barrel
                        barrelData.rifleId = rifle.id;
                        barrelData.isActive = true;
                        barrelPromise = self.db.addBarrel(barrelData).then(function (newBarrel) {
                            return self.db.setActiveBarrel(newBarrel.id, rifle.id);
                        });
                    }
                    return barrelPromise.catch(function (err) {
                        console.warn('[Profiles] barrel save failed:', err);
                        alert('Rifle saved, but the barrel update failed: ' + err.message);
                    });
                });
            }

            savePromise.then(function () {
                self.showRifleDetail(rifle.id);
            }).catch(function (err) {
                console.warn('[Profiles] rifle save failed:', err);
                alert('Save failed: ' + err.message);
            });
        } else {
            // Create rifle
            self.db.addRifle(data).then(function (newRifle) {
                // Create barrel alongside rifle
                if (barrelData) {
                    barrelData.rifleId = newRifle.id;
                    barrelData.isActive = true;
                    return self.db.addBarrel(barrelData).then(function (newBarrel) {
                        return self.db.setActiveBarrel(newBarrel.id, newRifle.id);
                    }).then(function () {
                        self.showRifleDetail(newRifle.id);
                    });
                } else {
                    self.showRifleDetail(newRifle.id);
                }
            }).catch(function (err) {
                alert(err.message);
            });
        }
    });

    var delBtn = document.getElementById('btn-delete-rifle');
    if (delBtn && rifle) {
        delBtn.addEventListener('click', function () {
            if (confirm('Delete "' + rifle.name + '" and all its loads and data?')) {
                self.db.deleteRifle(rifle.id).then(function () {
                    self.showRifleList();
                });
            }
        });
    }
};

// ── Rifle Detail ───────────────────────────────────────────────

ProfileManager.prototype.showRifleDetail = function (rifleId) {
    this.currentRifleId = rifleId;
    var self = this;

    Promise.all([
        this.db.getRifle(rifleId),
        this.db.getLoadsByRifle(rifleId),
        this.db.getBarrelsByRifle(rifleId),
        this.db.getSessionsByRifle(rifleId).catch(function () { return []; })
    ]).then(function (results) {
        var rifle = results[0];
        var loads = results[1];
        var barrels = results[2];
        var sessions = results[3];
        if (!rifle) { self.showRifleList(); return; }
        self._renderRifleDetail(rifle, loads, barrels, sessions);
    }).catch(function (err) {
        // Never dead-end silently — fall back to the list
        console.warn('[Profiles] rifle detail load failed:', err);
        alert('Couldn\'t open that rifle: ' + err.message);
        self.showRifleList();
    });
};

/**
 * STRIP-DOWN PHASE (owner order): "tap to view/edit every field about
 * that rifle... each rifle shows its ammo list... the saved session
 * (photo, group size, MV) must be viewable from that rifle's page."
 * Was THE RIFLE'S PAPERWORK (Contract v4.0, 9 rows — build sheet,
 * ammo, barrel, trip planner, certificate/report, export, scope
 * check, print target, account/settings). Every row besides Edit/Ammo
 * is HIDDEN this phase (see STRIPDOWN-REPORT.md) — the underlying
 * screens (showBarrelForm, _openTripPlanner, Categories.openReportCertificateFor,
 * DataExport.open, ScopeCheck.start, _openTargetPrintChooser,
 * _showAccountOverlay) all still exist, untouched, just not linked
 * from here anymore.
 */
ProfileManager.prototype._renderRifleDetail = function (rifle, loads, barrels, sessions) {
    var self = this;
    // Feed the Home "Recent" strip (guarded — home.js may not be loaded)
    if (typeof Recents !== 'undefined') Recents.touchRifle(rifle);
    var activeBarrel = null;
    for (var b = 0; b < barrels.length; b++) {
        if (barrels[b].isActive) { activeBarrel = barrels[b]; break; }
    }
    if (!activeBarrel && barrels.length) activeBarrel = barrels[0];

    sessions = (sessions || []).slice().sort(function (a, b) {
        return (b.date || '').localeCompare(a.date || '');
    });

    var html = '<div class="screen">';

    html += '<div class="pagehead">';
    html += '<button type="button" class="backline" id="btn-detail-back">&lsaquo; Rifles</button>';
    html += '<div class="pagetitle">' + escapeHtml(rifle.name) + '</div>';
    if (rifle.caliber) html += '<div class="pagesub mono">' + escapeHtml(rifle.caliber) + '</div>';
    html += '</div>';

    html += UI.card(UI.rowlink({
        button: true, id: 'rd-edit', title: 'Edit rifle',
        sub: 'Caliber, twist, scope height, zero range, and every build field', chev: true
    }));

    // ── Ammo ─────────────────────────────────────────────────
    html += UI.sectionHead('Ammo');
    var ammoRows = '';
    (loads || []).forEach(function (ld) {
        var bits = [];
        if (ld.bulletWeight) bits.push(ld.bulletWeight + ' gr');
        if (ld.muzzleVelocity) bits.push(Math.round(ld.muzzleVelocity) + ' fps');
        ammoRows += UI.rowlink({
            button: true, title: ld.name || 'Load', sub: bits.join(' · ') || '—',
            subMono: true, chev: true, data: { 'ammo-row': ld.id }
        });
    });
    ammoRows += UI.rowlink({
        button: true, titleHtml: '<span class="u-gold">＋ New ammo</span>',
        sub: 'Name, bullet, weight, BC, advertised speed', data: { 'ammo-add': '1' }
    });
    html += UI.card(ammoRows);

    // ── Sessions (STRIP-DOWN PHASE: "viewable from that rifle's
    // page") ────────────────────────────────────────────────
    html += UI.sectionHead('Sessions');
    if (!sessions.length) {
        html += UI.card('<p class="t-body u-quiet" style="padding:var(--space-md)">No range sessions logged yet.</p>');
    } else {
        var sessRows = '';
        sessions.forEach(function (s) {
            var r = s.results || {};
            var bits = [];
            if (typeof r.groupSizeMOA === 'number') bits.push(r.groupSizeMOA.toFixed(2) + ' MOA');
            if (s.measuredVelocity) bits.push(Math.round(s.measuredVelocity) + ' fps');
            var when = s.date ? new Date(s.date).toLocaleDateString() : '';
            sessRows += UI.rowlink({
                button: true, title: when || 'Session', sub: bits.join(' · ') || '—',
                subMono: true, chev: true, data: { 'session-row': s.id }
            });
        });
        html += UI.card(sessRows);
    }

    html += '</div>'; // .screen

    this.container.innerHTML = html;
    this._bindRifleDetailEvents(rifle, sessions);
};

ProfileManager.prototype._bindRifleDetailEvents = function (rifle, sessions) {
    var self = this;

    document.getElementById('btn-detail-back').addEventListener('click', function () {
        self.showRifleList();
    });
    document.getElementById('rd-edit').addEventListener('click', function () {
        self.showRifleForm(rifle.id);
    });

    var ammoRows = this.container.querySelectorAll('[data-ammo-row]');
    for (var i = 0; i < ammoRows.length; i++) {
        ammoRows[i].addEventListener('click', function () {
            self.showLoadDetail(rifle.id, this.getAttribute('data-ammo-row'));
        });
    }
    var ammoAdd = this.container.querySelector('[data-ammo-add]');
    if (ammoAdd) {
        ammoAdd.addEventListener('click', function () {
            self.showLoadForm(rifle.id, null);
        });
    }

    var sessionRows = this.container.querySelectorAll('[data-session-row]');
    for (var s = 0; s < sessionRows.length; s++) {
        sessionRows[s].addEventListener('click', function () {
            var id = this.getAttribute('data-session-row');
            if (self.historyManager) self.historyManager.showSessionDetail(id, rifle.id);
        });
    }
};

/**
 * Amendment 1 A14 — pre-trip round budgeting. "Runs only when the
 * shooter asks or states a planned objective; advisory only; never a
 * capture prerequisite" -- this is that explicit, request-only entry
 * point (never surfaced automatically in next-action.js's coach ladder).
 * Rounds since cleaning is computed from data the app already has
 * (Constitution §6: never ask what the phone/app already knows); the
 * cleaning interval and mission cost are THIS rifle's owner's own
 * numbers, not a product-wide default (A7: "owner preferences... not
 * product priors").
 */
ProfileManager.prototype._openTripPlanner = function (rifle, activeBarrel) {
    var self = this;
    var pLogs = activeBarrel
        ? this.db.getCleaningLogsByBarrel(activeBarrel.id).catch(function () { return []; })
        : Promise.resolve([]);
    pLogs.then(function (logs) {
        var latest = null;
        (logs || []).forEach(function (l) { if (!latest || (l.date || '') > (latest.date || '')) latest = l; });
        var roundsSinceCleaning = activeBarrel
            ? Math.max(0, (activeBarrel.totalRounds || 0) - (latest ? (latest.roundCountAtCleaning || 0) : 0))
            : 0;

        var overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.innerHTML = '<div class="overlay-card">' +
            '<div class="overlay-title">Planning a trip?</div>' +
            '<p class="overlay-text">' + Number(roundsSinceCleaning).toLocaleString() +
            ' rounds since ' + UI.esc(rifle.name || 'this rifle') + '\'s last cleaning.</p>' +
            '<div class="field"><label for="tp-interval">Your usual cleaning interval (rounds)</label>' +
            '<input type="number" inputmode="numeric" id="tp-interval" value="75"></div>' +
            '<div class="field"><label for="tp-cost">Rounds this trip will likely cost</label>' +
            '<input type="number" inputmode="numeric" id="tp-cost" value="18"></div>' +
            '<p class="overlay-text" id="tp-verdict"></p>' +
            '<button class="btn-primary u-full" id="tp-calc">Check my margin</button>' +
            '<button class="btn u-full u-mt-10" id="tp-close">Close</button>' +
            '</div>';
        document.body.appendChild(overlay);
        function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        overlay.querySelector('#tp-close').addEventListener('click', close);
        overlay.querySelector('#tp-calc').addEventListener('click', function () {
            var interval = parseInt(document.getElementById('tp-interval').value, 10);
            var cost = parseInt(document.getElementById('tp-cost').value, 10);
            var verdictEl = document.getElementById('tp-verdict');
            if (typeof deriveRoundBudget !== 'function' || !isFinite(interval) || !isFinite(cost)) {
                verdictEl.textContent = 'Enter both numbers to check.';
                return;
            }
            var result = deriveRoundBudget({
                roundsSinceCleaning: roundsSinceCleaning,
                cleaningIntervalRounds: interval,
                missionRoundCost: cost
            });
            verdictEl.textContent = result.verdict;
            verdictEl.className = 'overlay-text ' + (result.word === 'ok' ? 'u-gold' : 'warn');
        });
    });
};

/** "Print a target" (Contract v4.0 surface 7) — same Letter/A4 chooser
 *  pattern the scope-tracking tall target already uses. */
ProfileManager.prototype._openTargetPrintChooser = function () {
    if (typeof TargetPDF === 'undefined') return;
    var overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = '<div class="overlay-card">' +
        '<div class="overlay-title">Print a target</div>' +
        '<button class="option-row" id="pt-letter"><span>Letter PDF</span></button>' +
        '<button class="option-row" id="pt-a4"><span>A4 PDF</span></button></div>';
    document.body.appendChild(overlay);
    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('#pt-letter').addEventListener('click', function () { close(); TargetPDF.paperTarget('letter'); });
    overlay.querySelector('#pt-a4').addEventListener('click', function () { close(); TargetPDF.paperTarget('a4'); });
};

/** Ammo list (Contract v4.0 surface 7) — the rifle's loads, one tap
 *  off the drawer; "+ New ammo" always last. */
ProfileManager.prototype.showLoadsList = function (rifleId) {
    var self = this;
    Promise.all([
        this.db.getRifle(rifleId),
        this.db.getLoadsByRifle(rifleId)
    ]).then(function (results) {
        var rifle = results[0];
        if (!rifle) { self.showRifleList(); return; }
        self._renderLoadsList(rifle, results[1] || []);
    }).catch(function (err) {
        alert('Couldn\'t open the ammo list: ' + err.message);
        self.showRifleDetail(rifleId);
    });
};

ProfileManager.prototype._renderLoadsList = function (rifle, loads) {
    var self = this;
    var html = '<div class="screen">';
    html += '<div class="pagehead">';
    html += '<button type="button" class="backline" id="btn-loads-back">&lsaquo; ' + escapeHtml(rifle.name) + '</button>';
    html += '<div class="pagetitle">Ammo</div>';
    html += '</div>';

    var rows = '';
    (loads || []).forEach(function (ld) {
        var bits = [];
        if (ld.muzzleVelocity) bits.push(Math.round(ld.muzzleVelocity) + ' fps');
        if (ld.lotNumber) bits.push('Lot ' + ld.lotNumber);
        if (ld.truedMv || ld.truedBc) bits.push('trued');
        rows += UI.rowlink({
            button: true,
            title: ld.name || 'Load',
            sub: bits.join(' · ') || '—',
            subMono: true,
            chev: true,
            data: { 'load-row': ld.id }
        });
    });
    rows += UI.rowlink({
        button: true,
        titleHtml: '<span class="u-gold">＋ New ammo</span>',
        sub: 'Factory box or bare basics',
        data: { 'load-add': '1' }
    });
    html += UI.card(rows);
    html += '</div>'; // .screen
    this.container.innerHTML = html;

    document.getElementById('btn-loads-back').addEventListener('click', function () {
        self.showRifleDetail(rifle.id);
    });
    var loadRows = this.container.querySelectorAll('[data-load-row]');
    for (var lr = 0; lr < loadRows.length; lr++) {
        loadRows[lr].addEventListener('click', function () {
            self.showLoadDetail(rifle.id, this.getAttribute('data-load-row'));
        });
    }
    var loadAdd = this.container.querySelector('[data-load-add]');
    if (loadAdd) {
        loadAdd.addEventListener('click', function () {
            self.showLoadForm(rifle.id, null);
        });
    }
};

// ── Barrel Form ────────────────────────────────────────────────

ProfileManager.prototype.showBarrelForm = function (rifleId, barrel) {
    var isEdit = !!barrel;

    var html = '<div class="view-toolbar">';
    html += '<button type="button" class="toolbar-back" id="btn-form-back">' + Icon('chevron-left', 20) + 'Back</button>';
    html += '<h2 class="toolbar-title">Barrel</h2>';
    html += '</div>';

    html += '<div class="screen">';
    html += '<form id="barrel-form">';

    html += '<div class="field-row">';
    html += '<div class="field">';
    html += '<label class="field-label" for="br-twist-rate">Twist rate <button type="button" class="hint-btn" onclick="showHelp(\'twistRate\')" title="What is twist rate?">?</button></label>';
    html += '<input type="text" id="br-twist-rate" maxlength="20" placeholder="e.g., 1:10" value="' + escapeAttr(barrel ? barrel.twistRate : '') + '">';
    html += '</div>';
    html += '<div class="field">';
    html += '<label class="field-label" for="br-twist-dir">Twist direction</label>';
    html += '<select id="br-twist-dir">';
    html += '<option value="Right"' + (barrel && barrel.twistDirection === 'Right' ? ' selected' : '') + '>Right</option>';
    html += '<option value="Left"' + (barrel && barrel.twistDirection === 'Left' ? ' selected' : '') + '>Left</option>';
    html += '</select>';
    html += '</div>';
    html += '</div>';

    html += '<div class="field-row">';
    html += '<div class="field">';
    html += '<label class="field-label" for="br-install-date">Install date</label>';
    html += '<input type="date" id="br-install-date" value="' + escapeAttr(barrel ? barrel.installDate : new Date().toISOString().split('T')[0]) + '">';
    html += '</div>';
    html += '<div class="field">';
    html += '<label class="field-label" for="br-total-rounds">Total rounds</label>';
    html += '<input type="number" id="br-total-rounds" min="0" step="1" inputmode="numeric" placeholder="0" value="' + (barrel ? (barrel.totalRounds || 0) : 0) + '">';
    html += '</div>';
    html += '</div>';

    html += '<div class="field">';
    html += '<label class="field-label" for="br-notes">Notes</label>';
    html += '<textarea id="br-notes" rows="2" placeholder="Optional notes">' + escapeHtml(barrel ? barrel.notes : '') + '</textarea>';
    html += '</div>';

    html += '<button type="submit" class="action-primary u-mt-14">' + (isEdit ? 'Save changes' : 'Create barrel') + '</button>';

    html += '</form>';
    html += '</div>'; // close .screen

    this.container.innerHTML = html;

    var self = this;

    document.getElementById('btn-form-back').addEventListener('click', function () {
        self.showRifleDetail(rifleId);
    });

    document.getElementById('barrel-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var data = {
            rifleId: rifleId,
            twistRate: document.getElementById('br-twist-rate').value.trim(),
            twistDirection: document.getElementById('br-twist-dir').value,
            installDate: document.getElementById('br-install-date').value,
            totalRounds: parseInt(document.getElementById('br-total-rounds').value, 10) || 0,
            isActive: true,
            notes: document.getElementById('br-notes').value.trim()
        };

        if (barrel) {
            barrel.twistRate = data.twistRate;
            barrel.twistDirection = data.twistDirection;
            barrel.installDate = data.installDate;
            barrel.totalRounds = data.totalRounds;
            barrel.notes = data.notes;
            self.db.updateBarrel(barrel).then(function () {
                self.showRifleDetail(rifleId);
            }).catch(function (err) {
                alert('Failed to update barrel: ' + (err.message || err));
            });
        } else {
            self.db.addBarrel(data).then(function (newBarrel) {
                return self.db.setActiveBarrel(newBarrel.id, rifleId);
            }).then(function () {
                self.showRifleDetail(rifleId);
            }).catch(function (err) {
                alert('Failed to add barrel: ' + (err.message || err));
            });
        }
    });
};

// ── Load Form (Create / Edit) ──────────────────────────────────

ProfileManager.prototype.showLoadForm = function (rifleId, loadId) {
    var self = this;
    if (loadId) {
        this.db.getLoad(loadId).then(function (load) {
            if (load) self._renderLoadForm(rifleId, load);
        });
    } else {
        this._renderLoadForm(rifleId, null);
    }
};

ProfileManager.prototype._renderLoadForm = function (rifleId, load) {
    var isEdit = !!load;
    var title = isEdit ? 'Edit load' : 'New load';

    var html = '<div class="view-toolbar">';
    html += '<button type="button" class="toolbar-back" id="btn-form-back">' + Icon('chevron-left', 20) + 'Back</button>';
    html += '<h2 class="toolbar-title">' + title + '</h2>';
    html += '</div>';

    html += '<div class="screen">';
    html += '<form id="load-form">';

    // Ammo-box OCR scan (feature-gated; returns '' when off)
    if (typeof Onboarding !== 'undefined') {
        html += Onboarding.scanButtonHtml();
    }

    html += '<div class="field">';
    html += '<label class="field-label" for="ld-name">Load name *</label>';
    html += '<input type="text" id="ld-name" maxlength="80" placeholder="e.g., Hornady 168gr ELD-M" value="' + escapeAttr(load ? load.name : '') + '">';
    html += '</div>';

    html += '<div class="field">';
    html += '<label class="field-label" for="ld-lot">Lot number</label>';
    html += '<input type="text" id="ld-lot" maxlength="40" placeholder="From the box flap — catches lot-to-lot velocity shifts" value="' + escapeAttr(load && load.lotNumber ? load.lotNumber : '') + '">';
    html += '</div>';

    html += '<div class="field">';
    html += '<label class="field-label" for="ld-bullet-name">Bullet name</label>';
    html += '<input type="text" id="ld-bullet-name" maxlength="80" placeholder="e.g., ELD Match" value="' + escapeAttr(load ? load.bulletName : '') + '">';
    html += '</div>';

    html += '<div class="field-row">';
    html += '<div class="field">';
    html += '<label class="field-label" for="ld-bullet-weight">Weight <span class="field-unit">gr</span> *</label>';
    html += '<input type="number" id="ld-bullet-weight" min="1" max="1000" step="0.1" inputmode="decimal" placeholder="168" value="' + (load && load.bulletWeight ? load.bulletWeight : '') + '">';
    html += '</div>';
    html += '<div class="field">';
    html += '<label class="field-label" for="ld-bullet-dia">Diameter <span class="field-unit">in</span> *</label>';
    html += '<input type="number" id="ld-bullet-dia" min="0.1" max="1.0" step="0.001" inputmode="decimal" placeholder="0.308" value="' + (load && load.bulletDiameter ? load.bulletDiameter : '') + '">';
    html += '</div>';
    html += '</div>';

    html += '<div class="field-row">';
    html += '<div class="field">';
    html += '<label class="field-label" for="ld-bullet-bc">BC <button type="button" class="hint-btn" onclick="showHelp(\'bc\')" title="What is BC?">?</button></label>';
    html += '<input type="number" id="ld-bullet-bc" min="0" max="2" step="0.001" inputmode="decimal" placeholder="0.462" value="' + (load && load.bulletBC ? load.bulletBC : '') + '">';
    html += '</div>';
    html += '<div class="field">';
    html += '<label class="field-label" for="ld-drag-model">Drag model <button type="button" class="hint-btn" onclick="showHelp(\'dragModel\')" title="What is drag model?">?</button></label>';
    html += '<select id="ld-drag-model">';
    html += '<option value="G1"' + (load && load.dragModel === 'G1' ? ' selected' : '') + '>G1</option>';
    html += '<option value="G7"' + (load && load.dragModel === 'G7' ? ' selected' : '') + '>G7</option>';
    html += '</select>';
    html += '</div>';
    html += '</div>';

    html += '<div class="field-row">';
    html += '<div class="field">';
    html += '<label class="field-label" for="ld-mv">Muzzle velocity <span class="field-unit">fps</span></label>';
    html += '<input type="number" id="ld-mv" min="0" max="5000" step="1" inputmode="numeric" placeholder="2650" value="' + (load && load.muzzleVelocity ? load.muzzleVelocity : '') + '">';
    html += '<p class="field-hint">BC and muzzle velocity are needed for the Solver — leave blank if unknown</p>';
    html += '</div>';
    html += '<div class="field">';
    html += '<label class="field-label" for="ld-bullet-len">Bullet length <span class="field-unit">in</span></label>';
    html += '<input type="number" id="ld-bullet-len" min="0" max="3" step="0.001" inputmode="decimal" placeholder="1.275" value="' + (load && load.bulletLength ? load.bulletLength : '') + '">';
    html += '</div>';
    html += '</div>';

    // Recipe (bench tool) — the one place typing is expected
    if (typeof ToolRegistry !== 'undefined' && ToolRegistry.isVisible('bench')) {
        var rec = (load && load.recipe) || {};
        var rb = rec.brass || {}, rp = rec.primer || {}, rw = rec.powder || {}, ru = rec.bullet || {};
        html += '<details class="fold u-mb-12"' + (load && load.recipe ? ' open' : '') + '>';
        html += '<summary>Recipe (handload)</summary>';
        html += '<div class="fold-body">';
        html += '<div class="field-row">';
        html += '<div class="field"><label class="field-label" for="rc-brass">Brass</label><input type="text" id="rc-brass" list="mem-brass" maxlength="40" placeholder="Lapua" value="' + escapeAttr(rb.make || '') + '"></div>';
        html += '<div class="field"><label class="field-label" for="rc-brass-lot">Lot</label><input type="text" id="rc-brass-lot" maxlength="20" placeholder="lot" value="' + escapeAttr(rb.lot || '') + '"></div>';
        html += '<div class="field"><label class="field-label" for="rc-brass-fired">Fired</label><input type="number" id="rc-brass-fired" min="0" step="1" placeholder="0" value="' + (typeof rb.timesFired === 'number' ? rb.timesFired : '') + '"></div>';
        html += '</div>';
        html += '<div class="field-row">';
        html += '<div class="field"><label class="field-label" for="rc-primer">Primer</label><input type="text" id="rc-primer" list="mem-primer" maxlength="40" placeholder="CCI BR-2" value="' + escapeAttr(rp.make || '') + '"></div>';
        html += '<div class="field"><label class="field-label" for="rc-primer-lot">Primer lot</label><input type="text" id="rc-primer-lot" maxlength="20" value="' + escapeAttr(rp.lot || '') + '"></div>';
        html += '</div>';
        html += '<div class="field-row">';
        html += '<div class="field"><label class="field-label" for="rc-powder">Powder</label><input type="text" id="rc-powder" list="mem-powder" maxlength="40" placeholder="H4350" value="' + escapeAttr(rw.make || '') + '"></div>';
        html += '<div class="field"><label class="field-label" for="rc-charge">Charge <span class="field-unit">gr</span></label><input type="number" id="rc-charge" min="0" max="150" step="0.1" placeholder="41.8" value="' + (typeof rw.chargeGr === 'number' ? rw.chargeGr : '') + '"></div>';
        html += '<div class="field"><label class="field-label" for="rc-powder-lot">Powder lot</label><input type="text" id="rc-powder-lot" maxlength="20" placeholder="matters: 30-60 fps between lots" value="' + escapeAttr(rw.lot || '') + '"></div>';
        html += '</div>';
        html += '<div class="field-row">';
        html += '<div class="field"><label class="field-label" for="rc-bullet">Bullet make</label><input type="text" id="rc-bullet" list="mem-bullet" maxlength="40" placeholder="Berger" value="' + escapeAttr(ru.make || '') + '"></div>';
        html += '<div class="field"><label class="field-label" for="rc-bullet-lot">Bullet lot</label><input type="text" id="rc-bullet-lot" maxlength="20" placeholder="lot" value="' + escapeAttr(ru.lot || '') + '"></div>';
        html += '</div>';
        html += '<div class="field"><label class="field-label" for="rc-seating">Seating depth <span class="field-unit">in</span></label><input type="number" id="rc-seating" min="0" max="5" step="0.001" placeholder="2.810 CBTO" value="' + (typeof rec.seatingDepthIn === 'number' ? rec.seatingDepthIn : '') + '"></div>';
        html += '<datalist id="mem-brass"></datalist><datalist id="mem-primer"></datalist><datalist id="mem-powder"></datalist><datalist id="mem-bullet"></datalist>';
        html += '</div></details>';
    }

    html += '<div class="field">';
    html += '<label class="field-label" for="ld-notes">Notes</label>';
    html += '<textarea id="ld-notes" rows="2" placeholder="Optional notes">' + escapeHtml(load ? load.notes : '') + '</textarea>';
    html += '</div>';

    // Template C: sticky actions — Save · Cancel · guarded delete
    html += '<div class="form-actions">';
    html += '<button type="submit" class="btn-primary u-full">' + (isEdit ? 'Save' : 'Create load') + '</button>';
    html += '<button type="button" class="btn u-full" id="btn-load-form-cancel">Cancel</button>';
    if (isEdit) {
        html += '<button type="button" class="btn-danger u-full" id="btn-delete-load">Delete load&hellip;</button>';
    }
    html += '</div>';

    html += '</form>';
    html += '</div>'; // close .screen

    this.container.innerHTML = html;
    this._bindLoadFormEvents(rifleId, load);
};

/**
 * Read the recipe fields into a structured object, or null when every
 * field is empty (no-recipe loads stay clean). Also feeds component
 * memory (best-effort, cross-device via user_settings).
 */
ProfileManager.prototype._collectRecipe = function () {
    function val(id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }
    function num(id) {
        var v = parseFloat(val(id));
        return isFinite(v) ? v : null;
    }
    if (!document.getElementById('rc-brass')) return undefined; // bench off → leave untouched

    var recipe = {
        brass: { make: val('rc-brass') || null, lot: val('rc-brass-lot') || null, timesFired: num('rc-brass-fired') },
        primer: { make: val('rc-primer') || null, lot: val('rc-primer-lot') || null },
        powder: { make: val('rc-powder') || null, lot: val('rc-powder-lot') || null, chargeGr: num('rc-charge') },
        bullet: { make: val('rc-bullet') || null, lot: val('rc-bullet-lot') || null },
        seatingDepthIn: num('rc-seating')
    };
    var hasAny = recipe.brass.make || recipe.primer.make || recipe.powder.make ||
        recipe.bullet.make || recipe.powder.chargeGr !== null || recipe.seatingDepthIn !== null;
    if (!hasAny) return null;

    // Remember components for the pickers (merge, cap 20 each)
    var self = this;
    this.db.getUserSetting('componentMemory').then(function (mem) {
        mem = mem || {};
        [['brass', recipe.brass.make], ['primer', recipe.primer.make],
         ['powder', recipe.powder.make], ['bullet', recipe.bullet.make]].forEach(function (pair) {
            if (!pair[1]) return;
            mem[pair[0]] = mem[pair[0]] || [];
            if (mem[pair[0]].indexOf(pair[1]) === -1) {
                mem[pair[0]].unshift(pair[1]);
                mem[pair[0]] = mem[pair[0]].slice(0, 20);
            }
        });
        return self.db.setUserSetting('componentMemory', mem);
    }).catch(function () {});

    return recipe;
};

ProfileManager.prototype._bindLoadFormEvents = function (rifleId, load) {
    var self = this;

    function leaveForm() {
        if (load) {
            self.showLoadDetail(rifleId, load.id);
        } else {
            self.showRifleDetail(rifleId);
        }
    }
    document.getElementById('btn-form-back').addEventListener('click', leaveForm);
    var cancelBtn = document.getElementById('btn-load-form-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', leaveForm);

    // Component pickers remember prior entries (bench)
    if (typeof ToolRegistry !== 'undefined' && ToolRegistry.isVisible('bench')) {
        this.db.getUserSetting('componentMemory').then(function (mem) {
            if (!mem) return;
            ['brass', 'primer', 'powder', 'bullet'].forEach(function (kind) {
                var dl = document.getElementById('mem-' + kind);
                if (dl && mem[kind]) {
                    dl.innerHTML = mem[kind].map(function (v) {
                        return '<option value="' + escapeAttr(v) + '">';
                    }).join('');
                }
            });
        }).catch(function () {});
    }

    // Ammo-box OCR: prefill the form fields for the user to review
    if (typeof Onboarding !== 'undefined') {
        Onboarding.bindScanButton(function (fields) {
            if (fields.name) document.getElementById('ld-name').value = fields.name;
            if (fields.bulletName) document.getElementById('ld-bullet-name').value = fields.bulletName;
            if (fields.bulletWeight) document.getElementById('ld-bullet-weight').value = fields.bulletWeight;
            if (fields.bulletDiameter) document.getElementById('ld-bullet-dia').value = fields.bulletDiameter;
            if (fields.bulletBC) document.getElementById('ld-bullet-bc').value = fields.bulletBC;
            if (fields.dragModel) document.getElementById('ld-drag-model').value = fields.dragModel;
            if (fields.muzzleVelocity) document.getElementById('ld-mv').value = fields.muzzleVelocity;
            if (fields.lotNumber) document.getElementById('ld-lot').value = fields.lotNumber;
        });
    }

    document.getElementById('load-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var name = document.getElementById('ld-name').value.trim();
        var weight = parseFloat(document.getElementById('ld-bullet-weight').value);
        var dia = parseFloat(document.getElementById('ld-bullet-dia').value);

        if (!name || !weight || !dia) {
            alert('Name, weight, and diameter are required');
            return;
        }

        var data = {
            rifleId: rifleId,
            name: name,
            lotNumber: document.getElementById('ld-lot').value.trim() || null,
            recipe: self._collectRecipe(),
            bulletName: document.getElementById('ld-bullet-name').value.trim(),
            bulletWeight: weight,
            bulletDiameter: dia,
            // Blank optional numbers store as null, never 0 — "0 fps"
            // reads as data corruption on cards and certificates
            bulletBC: parseFloat(document.getElementById('ld-bullet-bc').value) || null,
            dragModel: document.getElementById('ld-drag-model').value,
            muzzleVelocity: parseFloat(document.getElementById('ld-mv').value) || null,
            bulletLength: parseFloat(document.getElementById('ld-bullet-len').value) || null,
            notes: document.getElementById('ld-notes').value.trim()
        };

        if (load) {
            load.name = data.name;
            load.lotNumber = data.lotNumber;
            if (data.recipe !== undefined) load.recipe = data.recipe;
            load.bulletName = data.bulletName;
            load.bulletWeight = data.bulletWeight;
            load.bulletDiameter = data.bulletDiameter;
            load.bulletBC = data.bulletBC;
            load.dragModel = data.dragModel;
            load.muzzleVelocity = data.muzzleVelocity;
            load.bulletLength = data.bulletLength;
            load.notes = data.notes;
            self.db.updateLoad(load).then(function () {
                self.showLoadDetail(rifleId, load.id);
            });
        } else {
            self.db.addLoad(data).then(function () {
                self.showRifleDetail(rifleId);
            });
        }
    });

    var delBtn = document.getElementById('btn-delete-load');
    if (delBtn && load) {
        delBtn.addEventListener('click', function () {
            if (confirm('Delete load "' + load.name + '"?')) {
                self.db.deleteLoad(load.id).then(function () {
                    self.showRifleDetail(rifleId);
                });
            }
        });
    }
};

// ── Load Detail ────────────────────────────────────────────────

/**
 * F10 — the load-development logbook: every session (ladder tests
 * called out), every confirmed chrono string, in date order, with the
 * best group marked. A view over existing data — the binder they
 * always meant to keep, kept for them.
 */
ProfileManager.prototype._renderLoadLogbook = function (rifleId, load) {
    var el = document.getElementById('load-logbook');
    if (!el) return; // bench off

    Promise.all([
        this.db.getSessionsByRifle(rifleId),
        this.db.getVelocityStringsByRifle(rifleId)
    ]).then(function (res) {
        var sessions = (res[0] || []).filter(function (s) { return s.loadId === load.id; });
        var strings = (res[1] || []).filter(function (s) {
            return s.loadId === load.id && s.assignmentStatus === 'confirmed';
        });

        // Best (smallest) eligible group gets the mark
        var bestId = null, bestMOA = Infinity;
        sessions.forEach(function (s) {
            if (s.results && typeof s.results.groupSizeMOA === 'number' &&
                s.impacts && s.impacts.length >= 3 && s.results.groupSizeMOA < bestMOA) {
                bestMOA = s.results.groupSizeMOA;
                bestId = s.id;
            }
        });

        var entries = [];
        sessions.forEach(function (s) {
            var isLadder = s.sessionType === 'ladder' && s.ladder;
            if (isLadder) {
                entries.push({
                    date: s.date || '',
                    icon: 'flask',
                    text: 'Ladder — ' + (s.ladder.sentence || 'series recorded')
                });
            } else {
                entries.push({
                    date: s.date || '',
                    icon: 'target',
                    text: 'Group — ' + (s.results && typeof s.results.groupSizeMOA === 'number'
                        ? formatNum(s.results.groupSizeMOA, 2) + ' MOA · ' + (s.impacts ? s.impacts.length : 0) + ' shots'
                        : 'session'),
                    best: s.id === bestId
                });
            }
        });
        strings.forEach(function (s) {
            entries.push({
                date: s.date || '',
                icon: 'import',
                text: 'String — avg ' + formatNum(s.avgFps, 0) + ' · SD ' + formatNum(s.sdFps, 1) +
                    (s.lotNumber ? ' · lot ' + s.lotNumber : ''),
                suppressed: s.config === 'suppressed'
            });
        });
        entries.sort(function (a, b) { return b.date.localeCompare(a.date); });

        if (!entries.length) {
            el.innerHTML = '<p class="t-body u-quiet">Nothing logged with this load yet — sessions and chrono strings will assemble here by themselves.</p>';
            return;
        }
        var html = '';
        entries.forEach(function (e) {
            var when = e.date ? new Date(e.date).toLocaleDateString() : '&mdash;';
            html += '<div class="row-item">';
            html += Icon(e.icon, 18, 'u-quiet');
            html += '<div class="row-main">';
            html += '<div class="row-title">' + escapeHtml(e.text) +
                (e.suppressed ? ' ' + Icon('sound-off', 14, 'u-quiet') : '') + '</div>';
            html += '<div class="row-sub">' + when + '</div>';
            html += '</div>';
            if (e.best) {
                html += '<div class="row-aside"><span class="chip is-go">' + Icon('star', 14) + 'Best</span></div>';
            }
            html += '</div>';
        });
        el.innerHTML = html;
    }).catch(function () {
        el.innerHTML = '<p class="t-body u-quiet">Could not load the development log.</p>';
    });
};

ProfileManager.prototype.showLoadDetail = function (rifleId, loadId) {
    var self = this;
    this.db.getLoad(loadId).then(function (load) {
        if (!load) { self.showRifleDetail(rifleId); return; }
        self._renderLoadDetail(rifleId, load);
    });
};

ProfileManager.prototype._renderLoadDetail = function (rifleId, load) {
    var html = '<div class="view-toolbar">';
    html += '<button type="button" class="toolbar-back" id="btn-form-back">' + Icon('chevron-left', 20) + 'Back</button>';
    html += '<h2 class="toolbar-title">' + escapeHtml(load.name) + '</h2>';
    html += '<button type="button" class="toolbar-act" id="btn-edit-load" title="Edit" aria-label="Edit load">' + Icon('pencil', 20) + '</button>';
    html += '</div>';

    html += '<div class="screen">';

    // Spec card
    html += '<div class="plate">';
    if (load.bulletName) {
        html += '<div class="spec-row"><span class="spec-key">Bullet</span><span class="spec-val">' + escapeHtml(load.bulletName) + '</span></div>';
    }
    html += '<div class="spec-row"><span class="spec-key">Weight</span><span class="spec-val">' + load.bulletWeight + ' gr</span></div>';
    html += '<div class="spec-row"><span class="spec-key">Diameter</span><span class="spec-val">' + load.bulletDiameter + '&Prime;</span></div>';
    if (load.bulletBC) {
        html += '<div class="spec-row"><span class="spec-key">BC (' + load.dragModel + ')</span><span class="spec-val">' + load.bulletBC + '</span></div>';
    }
    if (load.muzzleVelocity) {
        html += '<div class="spec-row"><span class="spec-key">Muzzle velocity</span><span class="spec-val">' + load.muzzleVelocity + ' fps</span></div>';
    }
    if (load.bulletLength) {
        html += '<div class="spec-row"><span class="spec-key">Bullet length</span><span class="spec-val">' + load.bulletLength + '&Prime;</span></div>';
    }
    if (load.lotNumber) {
        html += '<div class="spec-row"><span class="spec-key">Lot</span><span class="spec-val">' + escapeHtml(load.lotNumber) + '</span></div>';
    }
    if (load.notes) {
        html += '<div class="spec-row"><span class="spec-key">Notes</span><span class="spec-val">' + escapeHtml(load.notes) + '</span></div>';
    }
    html += '</div>';

    // Recipe block (bench)
    if (load.recipe) {
        var rec = load.recipe;
        html += '<div class="qcard-kicker">Recipe</div>';
        html += '<div class="plate">';
        var recRows = [
            ['Brass', rec.brass && rec.brass.make ? rec.brass.make +
                (rec.brass.lot ? ' · lot ' + rec.brass.lot : '') +
                (typeof rec.brass.timesFired === 'number' ? ' · fired ' + rec.brass.timesFired + 'x' : '') : null],
            ['Primer', rec.primer && rec.primer.make ? rec.primer.make + (rec.primer.lot ? ' · lot ' + rec.primer.lot : '') : null],
            ['Powder', rec.powder && rec.powder.make ? rec.powder.make +
                (typeof rec.powder.chargeGr === 'number' ? ' · ' + rec.powder.chargeGr + ' gr' : '') +
                (rec.powder.lot ? ' · lot ' + rec.powder.lot : '') : null],
            ['Bullet', rec.bullet && rec.bullet.make ? rec.bullet.make + (rec.bullet.lot ? ' · lot ' + rec.bullet.lot : '') : null],
            ['Seating', typeof rec.seatingDepthIn === 'number' ? rec.seatingDepthIn + '"' : null]
        ];
        recRows.forEach(function (row) {
            if (row[1]) {
                html += '<div class="spec-row"><span class="spec-key">' + row[0] +
                    '</span><span class="spec-val">' + escapeHtml(row[1]) + '</span></div>';
            }
        });
        html += '</div>';
    }

    // Development logbook (bench) — the binder, kept for them
    if (typeof ToolRegistry !== 'undefined' && ToolRegistry.isVisible('bench')) {
        html += '<div class="qcard-kicker">Development log</div>';
        html += '<div id="load-logbook"><p class="t-body u-quiet">Loading&hellip;</p></div>';
    }

    html += '<button type="button" class="action-danger u-full u-mt-14" id="btn-delete-load">Delete load</button>';

    html += '</div>'; // close .screen

    this.container.innerHTML = html;

    var self = this;
    this._renderLoadLogbook(rifleId, load);

    document.getElementById('btn-form-back').addEventListener('click', function () {
        self.showRifleDetail(rifleId);
    });

    document.getElementById('btn-edit-load').addEventListener('click', function () {
        self.showLoadForm(rifleId, load.id);
    });

    document.getElementById('btn-delete-load').addEventListener('click', function () {
        if (confirm('Delete load "' + load.name + '"?')) {
            self.db.deleteLoad(load.id).then(function () {
                self.showRifleDetail(rifleId);
            });
        }
    });
};

// ── HTML Helpers ───────────────────────────────────────────────

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;');
}
