/**
 * profiles.js — Rifle and Load profile management UI.
 *
 * Manages views: rifle list, rifle form (create/edit), rifle detail
 * (with loads + barrel), load form (create/edit), load detail.
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
 * Show the rifle list (main profiles screen).
 */
ProfileManager.prototype.showRifleList = function () {
    this.currentRifleId = null;
    var self = this;
    Promise.all([
        this.db.getAllRifles(),
        this.db.getSetting('workflowCardDismissed')
    ]).then(function (results) {
        var rifles = results[0];
        rifles.sort(function (a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });
        self._renderRifleList(rifles, results[1] === true);
    });
};

ProfileManager.prototype._renderRifleList = function (rifles, workflowDismissed) {
    var self = this;
    var html = '<div class="screen">';
    html += '<div class="pagehead"><div class="pagetitle">Rifles</div></div>';

    // Fleet summary chips line ("4 ready · 2 need adjustment · 1 not checked")
    if (rifles.length > 1) {
        html += '<div class="fleetline" id="fleet-summary"></div>';
    }

    // One-time workflow pointer (dismissible, never returns)
    if (!workflowDismissed && typeof hasFeature === 'function' && hasFeature('certificate')) {
        html += '<div class="card card-pad u-mb-12" id="workflow-card">';
        html += '<h4 class="t-head">From ammo box to certificate</h4>';
        html += '<p class="t-body u-quiet u-mt-10">Create a rifle and load here. Import chrono data and check targets from Home. When a load proves out, generate its certificate from the rifle&rsquo;s performance report.</p>';
        html += '<button type="button" class="action-ghost u-mt-10" id="workflow-dismiss">Got it</button>';
        html += '</div>';
    }

    if (rifles.length === 0) {
        html += '<div class="empty-teach">';
        html += '<p>Every target photo, chrono string, and insight lands on a rifle &mdash; add yours to start.</p>';
        html += '<button type="button" class="btn-primary" id="btn-add-rifle">' + Icon('plus', 20) + 'Add rifle</button>';
        html += '</div>';
    } else {
        // Search appears only when the fleet outgrows a screen
        if (rifles.length > 8) {
            html += '<div class="search">' + Icon('search', 18) +
                '<input type="text" id="rifle-search" placeholder="Search rifles&hellip;" aria-label="Search rifles"></div>';
        }
        html += '<div class="card" id="rifle-list-card">';
        for (var i = 0; i < rifles.length; i++) {
            var r = rifles[i];
            html += UI.rowlink({
                button: true,
                title: r.name || 'Rifle',
                sub: r.caliber || '',
                data: { 'rifle-id': r.id },
                right: '<span class="chip" data-fleet-chip="' + UI.esc(r.id) + '">&hellip;</span>'
            });
        }
        html += '</div>';
        html += '<p class="t-micro u-mt-10 edge">' + rifles.length + ' / ' + MAX_RIFLES + ' profiles</p>';
    }

    // Misc sessions link
    html += UI.sectionHead('More');
    html += UI.card(
        UI.rowlink({
            button: true, id: 'btn-misc-sessions',
            title: 'Misc sessions', sub: 'Sessions saved without a rifle profile', chev: true
        })
    );

    // Account (privacy + deletion — store compliance)
    html += '<details class="fold u-mt-14 edge"><summary>Account</summary>';
    html += '<div class="fold-body">';
    html += '<p class="t-body"><a href="privacy-policy.html">Privacy policy</a></p>';
    html += '<p class="t-body u-quiet u-mt-10">Deleting your account permanently removes every rifle, session, photo, and chrono string. This cannot be undone.</p>';
    html += '<button type="button" class="btn-danger u-mt-10" id="btn-delete-account">Delete account&hellip;</button>';
    html += '</div></details>';

    html += '</div>'; // close .screen

    // Add rifle · Scan certificate, pinned in thumb reach
    if (rifles.length > 0) {
        html += '<div class="fab-zone">';
        html += '<button type="button" class="btn-primary" id="btn-add-rifle">' + Icon('plus', 20) + 'Add rifle</button>';
        html += '<button type="button" class="btn u-full u-mt-10" id="btn-scan-cert">Scan certificate</button>';
        html += '</div>';
    }

    this.container.innerHTML = html;
    this._bindRifleListEvents();
    this._fillFleetReadiness(rifles);
};

/** Readiness chips per row + the fleet summary line (async fill). */
ProfileManager.prototype._fillFleetReadiness = function (rifles) {
    var self = this;
    if (!rifles.length || typeof Readiness === 'undefined') return;
    Promise.all(rifles.map(function (r) {
        return Readiness.assess(self.db, r).then(function (res) {
            var chipEl = self.container.querySelector('[data-fleet-chip="' + r.id + '"]');
            if (chipEl) chipEl.outerHTML = UI.chip(res.chip.kind, res.chip.text);
            // status one-liner under the name
            var row = self.container.querySelector('[data-rifle-id="' + r.id + '"] .txt span');
            if (row) {
                var status = res.state === 'ready' && res.lastChecked
                    ? 'zero confirmed ' + res.lastChecked.toLocaleDateString()
                    : (res.state === 'adjust' && res.correction
                        ? res.correction.toLowerCase() + ' needed'
                        : (res.state === 'adjust' ? 'confirm with one more group' : 'never checked'));
                row.textContent = (r.caliber ? r.caliber + ' · ' : '') + status;
            }
            return res.state;
        }).catch(function () { return null; });
    })).then(function (states) {
        var summary = document.getElementById('fleet-summary');
        if (!summary || !summary.isConnected) return;
        var counts = { ready: 0, adjust: 0, unchecked: 0 };
        states.forEach(function (s) { if (s && counts.hasOwnProperty(s)) counts[s]++; });
        var chips = '';
        if (counts.ready) chips += UI.chip('ready', counts.ready + ' ready');
        if (counts.adjust) chips += UI.chip('caution', counts.adjust + ' need adjustment');
        if (counts.unchecked) chips += UI.chip('problem', counts.unchecked + ' not checked');
        summary.innerHTML = chips;
    });
};

ProfileManager.prototype._bindRifleListEvents = function () {
    var self = this;
    var addBtn = document.getElementById('btn-add-rifle');
    if (addBtn) {
        addBtn.addEventListener('click', function () {
            self.showRifleForm(null);
        });
    }

    var workflowDismiss = document.getElementById('workflow-dismiss');
    if (workflowDismiss) {
        workflowDismiss.addEventListener('click', function () {
            self.db.setSetting('workflowCardDismissed', true);
            var card = document.getElementById('workflow-card');
            if (card) card.classList.add('hidden');
        });
    }

    var cards = this.container.querySelectorAll('[data-rifle-id]');
    for (var i = 0; i < cards.length; i++) {
        cards[i].addEventListener('click', function () {
            var id = this.getAttribute('data-rifle-id');
            self.showRifleDetail(id);
        });
    }

    // Search filters rows in place (shown only for >8 rifles)
    var search = document.getElementById('rifle-search');
    if (search) {
        search.addEventListener('input', function () {
            var q = this.value.toLowerCase();
            var rows = self.container.querySelectorAll('#rifle-list-card [data-rifle-id]');
            for (var r = 0; r < rows.length; r++) {
                var text = rows[r].textContent.toLowerCase();
                rows[r].classList.toggle('hidden', q && text.indexOf(q) === -1);
            }
        });
    }

    // Scan certificate: certificates carry a QR deep link — explain it
    var scanBtn = document.getElementById('btn-scan-cert');
    if (scanBtn) {
        scanBtn.addEventListener('click', function () {
            var overlay = document.createElement('div');
            overlay.className = 'overlay';
            overlay.innerHTML =
                '<div class="overlay-card">' +
                '<div class="overlay-title">Scan a certificate</div>' +
                '<p class="overlay-text">Every Proven certificate carries a QR code. Point your phone&rsquo;s camera at it &mdash; the link opens that rifle right here.</p>' +
                '<button class="btn u-full" id="scan-cert-close">Got it</button>' +
                '</div>';
            document.body.appendChild(overlay);
            function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
            overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
            overlay.querySelector('#scan-cert-close').addEventListener('click', close);
        });
    }

    var deleteAccountBtn = document.getElementById('btn-delete-account');
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

    var miscBtn = document.getElementById('btn-misc-sessions');
    if (miscBtn && this.historyManager) {
        miscBtn.addEventListener('click', function () {
            self.historyManager.showMiscSessionList();
        });
    }
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
    html += '<label class="field-label" for="rf-angle-unit">Turret units</label>';
    html += '<select id="rf-angle-unit">';
    html += '<option value="MOA"' + (unitVal === 'MOA' ? ' selected' : '') + '>MOA</option>';
    html += '<option value="MIL"' + (unitVal === 'MIL' ? ' selected' : '') + '>MIL (mrad)</option>';
    html += '</select>';
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

    // Suppressor configurations
    html += '<div class="field">';
    html += '<label class="t-body">';
    html += '<input type="checkbox" id="rf-has-configs"' + (rifle && rifle.hasConfigs ? ' checked' : '') + '> ';
    html += 'This rifle sometimes runs a suppressor</label>';
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

    html += '<button type="submit" class="action-primary u-mt-14">' + (isEdit ? 'Save changes' : 'Create rifle') + '</button>';
    if (isEdit) {
        html += '<button type="button" class="action-danger u-full u-mt-10" id="btn-delete-rifle">Delete rifle</button>';
    }

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

    document.getElementById('btn-form-back').addEventListener('click', function () {
        if (rifle) {
            self.showRifleDetail(rifle.id);
        } else {
            self.showRifleList();
        }
    });

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
        this.db.getBarrelsByRifle(rifleId)
    ]).then(function (results) {
        var rifle = results[0];
        var loads = results[1];
        var barrels = results[2];
        if (!rifle) { self.showRifleList(); return; }
        self._renderRifleDetail(rifle, loads, barrels);
    }).catch(function (err) {
        // Never dead-end silently — fall back to the list
        console.warn('[Profiles] rifle detail load failed:', err);
        alert('Couldn\'t open that rifle: ' + err.message);
        self.showRifleList();
    });
};

/**
 * The SLIM rifle page (Proven §3.4): identity header · readiness
 * verdict banner + Confirm zero · stat strip (rounds, best MOA,
 * 90% yd) · build sheet · five category shortcut rows. Nothing else —
 * all detail lives in the category screens.
 */
ProfileManager.prototype._renderRifleDetail = function (rifle, loads, barrels) {
    var self = this;
    // Feed the Home "Recent" strip (guarded — home.js may not be loaded)
    if (typeof Recents !== 'undefined') Recents.touchRifle(rifle);
    var activeBarrel = null;
    for (var b = 0; b < barrels.length; b++) {
        if (barrels[b].isActive) { activeBarrel = barrels[b]; break; }
    }
    if (!activeBarrel && barrels.length) activeBarrel = barrels[0];

    var html = '<div class="screen">';

    // Identity header: name, spec line, Edit
    html += '<div class="pagehead">';
    html += '<button type="button" class="backline" id="btn-detail-back">&lsaquo; Rifles</button>';
    html += '<div class="pagehead-row">';
    html += '<div class="pagetitle">' + escapeHtml(rifle.name) + '</div>';
    html += '<button type="button" class="pagehead-act" id="btn-edit-rifle">Edit</button>';
    html += '</div>';
    var specBits = [];
    if (rifle.caliber) specBits.push(escapeHtml(rifle.caliber));
    if (activeBarrel && activeBarrel.twistRate) specBits.push(escapeHtml(activeBarrel.twistRate));
    if (rifle.barrelSpec) specBits.push(escapeHtml(rifle.barrelSpec));
    if (rifle.serialNumber) specBits.push('SN ' + escapeHtml(rifle.serialNumber));
    if (specBits.length) html += '<div class="pagesub mono">' + specBits.join(' &middot; ') + '</div>';
    html += '</div>';

    // Readiness verdict banner + Confirm zero (fills in async)
    html += '<div id="rifle-verdict"></div>';
    html += '<button type="button" class="btn-primary btn-edge" id="btn-confirm-zero">Confirm zero</button>';

    // Stat strip: rounds · best MOA · 90% yd (fills in async)
    html += '<div class="card u-mt-14" id="rifle-stats">' +
        UI.statStrip([
            { value: activeBarrel ? Number(activeBarrel.totalRounds || 0).toLocaleString() : '—', label: 'Rounds' },
            { value: '—', label: 'Best MOA' },
            { value: '—', label: '90% yd' }
        ]) + '</div>';

    // Build sheet
    var specRows = '';
    var buildRows = [
        ['Caliber', rifle.caliber],
        ['Scope height', rifle.scopeHeight ? rifle.scopeHeight + '″' : null],
        ['Zero range', rifle.zeroRange ? rifle.zeroRange + ' yd' : null],
        ['Twist', activeBarrel && activeBarrel.twistRate
            ? activeBarrel.twistRate + ' ' + (activeBarrel.twistDirection || 'Right') : null],
        ['Serial #', rifle.serialNumber],
        ['Action', rifle.action],
        ['Barrel', rifle.barrelSpec],
        ['Trigger', rifle.triggerSpec],
        ['Chassis', rifle.chassis],
        ['Muzzle', rifle.muzzleDevice],
        ['Notes', rifle.notes]
    ];
    for (var br = 0; br < buildRows.length; br++) {
        if (buildRows[br][1]) {
            specRows += '<div class="spec-row"><span class="spec-key">' + buildRows[br][0] +
                '</span><span class="spec-val">' + escapeHtml(buildRows[br][1]) + '</span></div>';
        }
    }
    if (specRows) {
        html += UI.sectionHead('Build sheet');
        html += '<div class="card card-pad">' + specRows + '</div>';
    }

    // Five shortcut rows — one per job category, chip pre-set to this rifle
    html += UI.sectionHead('Everything else');
    var catRows = '';
    if (typeof Categories !== 'undefined') {
        Categories.KEYS.forEach(function (key) {
            if (!Categories.hasActiveTools(key)) return;
            var def = Categories.DEFS[key];
            catRows += UI.rowlink({
                button: true,
                title: def.title,
                sub: def.desc,
                chev: true,
                data: { 'cat-shortcut': key }
            });
        });
    }
    html += UI.card(catRows);

    html += '</div>'; // .screen

    this.container.innerHTML = html;
    this._bindRifleDetailEvents(rifle, activeBarrel);
    this._fillRifleDetailAsync(rifle, loads, activeBarrel);
};

ProfileManager.prototype._fillRifleDetailAsync = function (rifle, loads, activeBarrel) {
    var self = this;

    // Verdict banner
    if (typeof Readiness !== 'undefined') {
        Readiness.assess(this.db, rifle).then(function (r) {
            var el = document.getElementById('rifle-verdict');
            if (!el || !el.isConnected) return;
            var kind = r.state === 'ready' ? 'ready' : (r.state === 'adjust' ? 'caution' : 'problem');
            var text = r.state === 'ready'
                ? 'READY — ' + r.note + '.'
                : (r.state === 'adjust' && r.correction
                    ? 'ADJUST — ' + r.correction + ', then shoot a confirmation group.'
                    : (r.state === 'adjust'
                        ? 'ALMOST THERE — less than 1 click off, shoot a confirmation group.'
                        : 'NOT CHECKED — photograph a target and Proven confirms your zero.'));
            el.innerHTML = UI.banner(kind, UI.esc(text), true);
        });
    }

    // Stats: best MOA + 90% yd
    Promise.all([
        this.db.getSessionsByRifle(rifle.id).catch(function () { return []; }),
        this.db.getVelocityStringsByRifle(rifle.id).catch(function () { return []; }),
        this.db.getFieldShotsByRifle(rifle.id).catch(function () { return []; })
    ]).then(function (res) {
        var el = document.getElementById('rifle-stats');
        if (!el || !el.isConnected) return;
        var bestMoa = '—';
        if (typeof aggregateRifle === 'function') {
            var agg = aggregateRifle({ sessions: res[0], strings: res[1], loads: loads || [] });
            if (agg.bestGroup) bestMoa = formatFixed(agg.bestGroup.moa, 2);
        }
        var effYd = '—';
        if (res[2] && res[2].length && typeof FieldCore !== 'undefined') {
            var eff = FieldCore.computeEffectiveRange(res[2]);
            var best = 0;
            for (var p in eff) {
                if (eff.hasOwnProperty(p) && eff[p].yards > best) best = eff[p].yards;
            }
            if (best) effYd = Number(best).toLocaleString();
        }
        el.innerHTML = UI.statStrip([
            { value: activeBarrel ? Number(activeBarrel.totalRounds || 0).toLocaleString() : '—', label: 'Rounds' },
            { value: bestMoa, label: 'Best MOA' },
            { value: effYd, label: '90% yd' }
        ]);
    });
};

ProfileManager.prototype._bindRifleDetailEvents = function (rifle, activeBarrel) {
    var self = this;

    document.getElementById('btn-detail-back').addEventListener('click', function () {
        self.showRifleList();
    });

    document.getElementById('btn-edit-rifle').addEventListener('click', function () {
        self.showRifleForm(rifle.id);
    });

    var confirmZero = document.getElementById('btn-confirm-zero');
    if (confirmZero) {
        confirmZero.addEventListener('click', function () {
            if (window.SessionLaunch) {
                SessionLaunch.start({ rifleId: rifle.id });
            } else if (window.AppNav) {
                AppNav.go('session');
            }
        });
    }

    // Category shortcuts open that screen WITH THIS RIFLE in the chip
    var shortcuts = this.container.querySelectorAll('[data-cat-shortcut]');
    for (var i = 0; i < shortcuts.length; i++) {
        shortcuts[i].addEventListener('click', function () {
            if (window.AppNav) AppNav.openCategory(this.getAttribute('data-cat-shortcut'), rifle.id);
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

    html += '<button type="submit" class="action-primary u-mt-14">' + (isEdit ? 'Save changes' : 'Create load') + '</button>';
    if (isEdit) {
        html += '<button type="button" class="action-danger u-full u-mt-10" id="btn-delete-load">Delete load</button>';
    }

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

    document.getElementById('btn-form-back').addEventListener('click', function () {
        if (load) {
            self.showLoadDetail(rifleId, load.id);
        } else {
            self.showRifleDetail(rifleId);
        }
    });

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
