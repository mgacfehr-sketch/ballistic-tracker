/**
 * profiles.js — Rifle and Load profile management UI.
 *
 * Manages views: rifle list, rifle form (create/edit), rifle detail
 * (with loads + barrel), load form (create/edit).
 *
 * All rendering targets the #view-profiles container.
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
    this.db.getAllRifles().then(function (rifles) {
        rifles.sort(function (a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });
        self._renderRifleList(rifles);
    });
};

ProfileManager.prototype._renderRifleList = function (rifles) {
    var html = '<div class="profile-screen">';
    html += '<div class="profile-toolbar">';
    html += '<h2 class="profile-title">Rifles</h2>';
    html += '<button class="btn btn-primary btn-sm" id="btn-add-rifle">+ Add Rifle</button>';
    html += '</div>';

    if (rifles.length === 0) {
        html += '<div class="empty-state">';
        html += '<p class="empty-state-text">No rifles yet</p>';
        html += '<p class="empty-state-sub">Tap "+ Add Rifle" to create your first profile</p>';
        html += '</div>';
    } else {
        html += '<div class="profile-list">';
        for (var i = 0; i < rifles.length; i++) {
            var r = rifles[i];
            html += '<div class="profile-card" data-rifle-id="' + r.id + '">';
            html += '<div class="profile-card-main">';
            html += '<span class="profile-card-name">' + escapeHtml(r.name) + '</span>';
            html += '<span class="profile-card-sub">' + escapeHtml(r.caliber) + '</span>';
            html += '</div>';
            html += '<span class="profile-card-arrow">&rsaquo;</span>';
            html += '</div>';
        }
        html += '</div>';
        html += '<p class="profile-count">' + rifles.length + ' / ' + MAX_RIFLES + ' profiles</p>';
    }

    // Misc sessions link
    html += '<div class="detail-section">';
    html += '<div class="profile-list" style="padding:0 16px;">';
    html += '<div class="profile-card" id="btn-misc-sessions">';
    html += '<div class="profile-card-main">';
    html += '<span class="profile-card-name">Misc Sessions</span>';
    html += '<span class="profile-card-sub">Sessions saved without a rifle profile</span>';
    html += '</div>';
    html += '<span class="profile-card-arrow">&rsaquo;</span>';
    html += '</div>';
    html += '</div>';
    html += '</div>';

    html += '</div>';
    this.container.innerHTML = html;
    this._bindRifleListEvents();
};

ProfileManager.prototype._bindRifleListEvents = function () {
    var self = this;
    var addBtn = document.getElementById('btn-add-rifle');
    if (addBtn) {
        addBtn.addEventListener('click', function () {
            self.showRifleForm(null);
        });
    }

    var cards = this.container.querySelectorAll('.profile-card[data-rifle-id]');
    for (var i = 0; i < cards.length; i++) {
        cards[i].addEventListener('click', function () {
            var id = this.getAttribute('data-rifle-id');
            self.showRifleDetail(id);
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
        this.db.getRifle(rifleId).then(function (rifle) {
            if (rifle) self._renderRifleForm(rifle);
        });
    } else {
        this._renderRifleForm(null);
    }
};

ProfileManager.prototype._renderRifleForm = function (rifle) {
    var isEdit = !!rifle;
    var title = isEdit ? 'Edit Rifle' : 'New Rifle';

    var html = '<div class="profile-screen">';
    html += '<div class="profile-toolbar">';
    html += '<button class="btn-back" id="btn-form-back">&lsaquo; Back</button>';
    html += '<h2 class="profile-title">' + title + '</h2>';
    html += '<div class="toolbar-spacer"></div>';
    html += '</div>';

    html += '<form id="rifle-form" class="profile-form">';

    html += '<div class="form-group">';
    html += '<label for="rf-name">Rifle Name *</label>';
    html += '<input type="text" id="rf-name" maxlength="80" placeholder="e.g., Bergara B14 HMR" value="' + escapeAttr(rifle ? rifle.name : '') + '">';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label for="rf-caliber">Caliber *</label>';
    html += '<input type="text" id="rf-caliber" maxlength="40" placeholder="e.g., .308 Win" value="' + escapeAttr(rifle ? rifle.caliber : '') + '">';
    html += '</div>';

    html += '<div class="form-row">';
    html += '<div class="form-group form-group-half">';
    html += '<label for="rf-scope-height">Scope Height (in)</label>';
    html += '<input type="number" id="rf-scope-height" min="0" max="5" step="0.01" inputmode="decimal" placeholder="1.5" value="' + (rifle && rifle.scopeHeight ? rifle.scopeHeight : '') + '">';
    html += '</div>';
    html += '<div class="form-group form-group-half">';
    html += '<label for="rf-zero-range">Zero Range (yds)</label>';
    html += '<input type="number" id="rf-zero-range" min="0" max="1500" step="1" inputmode="numeric" placeholder="100" value="' + (rifle && rifle.zeroRange ? rifle.zeroRange : '') + '">';
    html += '</div>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label for="rf-notes">Notes</label>';
    html += '<textarea id="rf-notes" rows="3" placeholder="Optional notes">' + escapeHtml(rifle ? rifle.notes : '') + '</textarea>';
    html += '</div>';

    html += '<div class="btn-row">';
    if (isEdit) {
        html += '<button type="button" class="btn btn-danger" id="btn-delete-rifle">Delete</button>';
    }
    html += '<button type="submit" class="btn btn-primary">' + (isEdit ? 'Save Changes' : 'Create Rifle') + '</button>';
    html += '</div>';

    html += '</form>';
    html += '</div>';

    this.container.innerHTML = html;
    this._bindRifleFormEvents(rifle);
};

ProfileManager.prototype._bindRifleFormEvents = function (rifle) {
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
            notes: document.getElementById('rf-notes').value.trim()
        };

        if (rifle) {
            // Update
            rifle.name = data.name;
            rifle.caliber = data.caliber;
            rifle.scopeHeight = data.scopeHeight;
            rifle.zeroRange = data.zeroRange;
            rifle.notes = data.notes;
            self.db.updateRifle(rifle).then(function () {
                self.showRifleDetail(rifle.id);
            });
        } else {
            // Create
            self.db.addRifle(data).then(function (newRifle) {
                self.showRifleDetail(newRifle.id);
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
    });
};

ProfileManager.prototype._renderRifleDetail = function (rifle, loads, barrels) {
    var activeBarrel = null;
    for (var b = 0; b < barrels.length; b++) {
        if (barrels[b].isActive) { activeBarrel = barrels[b]; break; }
    }

    loads.sort(function (a, b) {
        return (a.name || '').localeCompare(b.name || '');
    });

    var html = '<div class="profile-screen">';

    // Toolbar
    html += '<div class="profile-toolbar">';
    html += '<button class="btn-back" id="btn-detail-back">&lsaquo; Rifles</button>';
    html += '<h2 class="profile-title">' + escapeHtml(rifle.name) + '</h2>';
    html += '<button class="btn-icon" id="btn-edit-rifle" title="Edit">&#9998;</button>';
    html += '</div>';

    // Rifle info card
    html += '<div class="detail-card">';
    html += '<div class="detail-row"><span class="detail-label">Caliber</span><span class="detail-value">' + escapeHtml(rifle.caliber) + '</span></div>';
    if (rifle.scopeHeight) {
        html += '<div class="detail-row"><span class="detail-label">Scope Height</span><span class="detail-value">' + rifle.scopeHeight + '"</span></div>';
    }
    if (rifle.zeroRange) {
        html += '<div class="detail-row"><span class="detail-label">Zero Range</span><span class="detail-value">' + rifle.zeroRange + ' yds</span></div>';
    }
    if (rifle.notes) {
        html += '<div class="detail-row detail-row-notes"><span class="detail-label">Notes</span><span class="detail-value">' + escapeHtml(rifle.notes) + '</span></div>';
    }
    html += '</div>';

    // Barrel section
    html += '<div class="detail-section">';
    html += '<div class="detail-section-header">';
    html += '<h3 class="detail-section-title">Barrel</h3>';
    if (!activeBarrel) {
        html += '<button class="btn btn-sm btn-secondary" id="btn-add-barrel">+ Add</button>';
    }
    html += '</div>';

    if (activeBarrel) {
        html += '<div class="detail-card">';
        html += '<div class="detail-row"><span class="detail-label">Twist</span><span class="detail-value">' + escapeHtml(activeBarrel.twistRate) + ' ' + activeBarrel.twistDirection + '</span></div>';
        html += '<div class="detail-row"><span class="detail-label">Installed</span><span class="detail-value">' + activeBarrel.installDate + '</span></div>';
        if (activeBarrel.notes) {
            html += '<div class="detail-row detail-row-notes"><span class="detail-label">Notes</span><span class="detail-value">' + escapeHtml(activeBarrel.notes) + '</span></div>';
        }
        html += '<div class="btn-row btn-row-compact">';
        html += '<button class="btn btn-sm btn-secondary" id="btn-edit-barrel" data-barrel-id="' + activeBarrel.id + '">Edit</button>';
        html += '<button class="btn btn-sm btn-danger-outline" id="btn-delete-barrel" data-barrel-id="' + activeBarrel.id + '">Delete</button>';
        html += '</div>';
        html += '</div>';
    } else {
        html += '<p class="empty-state-sub">No barrel configured</p>';
    }
    html += '</div>';

    // Barrel stats (round counts)
    if (activeBarrel) {
        html += '<div id="barrel-stats" style="display:flex;gap:8px;padding:0 16px 4px;"></div>';
    }

    // Loads section
    html += '<div class="detail-section">';
    html += '<div class="detail-section-header">';
    html += '<h3 class="detail-section-title">Loads</h3>';
    html += '<button class="btn btn-sm btn-secondary" id="btn-add-load">+ Add</button>';
    html += '</div>';

    if (loads.length === 0) {
        html += '<p class="empty-state-sub">No loads yet</p>';
    } else {
        for (var i = 0; i < loads.length; i++) {
            var ld = loads[i];
            html += '<div class="profile-card load-card" data-load-id="' + ld.id + '">';
            html += '<div class="profile-card-main">';
            html += '<span class="profile-card-name">' + escapeHtml(ld.name) + '</span>';
            html += '<span class="profile-card-sub">' + escapeHtml(ld.bulletName) + ' &middot; ' + ld.bulletWeight + 'gr &middot; ' + ld.muzzleVelocity + ' fps</span>';
            html += '</div>';
            html += '<span class="profile-card-arrow">&rsaquo;</span>';
            html += '</div>';
        }
    }
    html += '</div>';

    // Session History link
    html += '<div class="detail-section">';
    html += '<div class="detail-section-header">';
    html += '<h3 class="detail-section-title">History &amp; Logs</h3>';
    html += '</div>';
    html += '<div class="profile-list" style="padding:0 16px;">';
    html += '<div class="profile-card" id="btn-session-history">';
    html += '<div class="profile-card-main"><span class="profile-card-name">Session History</span></div>';
    html += '<span class="profile-card-arrow">&rsaquo;</span>';
    html += '</div>';
    if (activeBarrel) {
        html += '<div class="profile-card" id="btn-cleaning-log" data-barrel-id="' + activeBarrel.id + '">';
        html += '<div class="profile-card-main"><span class="profile-card-name">Cleaning Log</span></div>';
        html += '<span class="profile-card-arrow">&rsaquo;</span>';
        html += '</div>';
    }
    html += '<div class="profile-card" id="btn-scope-adjustments">';
    html += '<div class="profile-card-main"><span class="profile-card-name">Scope Adjustments</span></div>';
    html += '<span class="profile-card-arrow">&rsaquo;</span>';
    html += '</div>';
    html += '</div>';
    html += '</div>';

    html += '</div>';

    this.container.innerHTML = html;
    this._bindRifleDetailEvents(rifle, activeBarrel);
};

ProfileManager.prototype._bindRifleDetailEvents = function (rifle, activeBarrel) {
    var self = this;

    document.getElementById('btn-detail-back').addEventListener('click', function () {
        self.showRifleList();
    });

    document.getElementById('btn-edit-rifle').addEventListener('click', function () {
        self.showRifleForm(rifle.id);
    });

    var addBarrelBtn = document.getElementById('btn-add-barrel');
    if (addBarrelBtn) {
        addBarrelBtn.addEventListener('click', function () {
            self.showBarrelForm(rifle.id, null);
        });
    }

    var editBarrelBtn = document.getElementById('btn-edit-barrel');
    if (editBarrelBtn) {
        editBarrelBtn.addEventListener('click', function () {
            self.showBarrelForm(rifle.id, activeBarrel);
        });
    }

    var deleteBarrelBtn = document.getElementById('btn-delete-barrel');
    if (deleteBarrelBtn && activeBarrel) {
        deleteBarrelBtn.addEventListener('click', function () {
            if (confirm('Delete this barrel?')) {
                self.db.deleteBarrel(activeBarrel.id).then(function () {
                    self.showRifleDetail(rifle.id);
                });
            }
        });
    }

    document.getElementById('btn-add-load').addEventListener('click', function () {
        self.showLoadForm(rifle.id, null);
    });

    var loadCards = this.container.querySelectorAll('.load-card');
    for (var i = 0; i < loadCards.length; i++) {
        loadCards[i].addEventListener('click', function () {
            var loadId = this.getAttribute('data-load-id');
            self.showLoadDetail(rifle.id, loadId);
        });
    }

    // History & log links
    var historyBtn = document.getElementById('btn-session-history');
    if (historyBtn && this.historyManager) {
        historyBtn.addEventListener('click', function () {
            self.historyManager.showSessionList(rifle.id);
        });
    }

    var cleaningBtn = document.getElementById('btn-cleaning-log');
    if (cleaningBtn && this.historyManager && activeBarrel) {
        cleaningBtn.addEventListener('click', function () {
            self.historyManager.showCleaningLog(rifle.id, activeBarrel.id);
        });
    }

    var scopeBtn = document.getElementById('btn-scope-adjustments');
    if (scopeBtn && this.historyManager) {
        scopeBtn.addEventListener('click', function () {
            self.historyManager.showScopeAdjustments(rifle.id);
        });
    }

    // Load barrel round counts from stored totalRounds
    if (activeBarrel && this.historyManager) {
        var totalRounds = activeBarrel.totalRounds || 0;
        this.db.getCleaningLogsByBarrel(activeBarrel.id).then(function (cleaningLogs) {
            var sinceCleaning = self.historyManager._computeRoundsSinceCleaning(totalRounds, cleaningLogs);

            var statsEl = document.getElementById('barrel-stats');
            if (statsEl) {
                statsEl.innerHTML = '<div class="dashboard-stat" id="stat-total-rounds" style="cursor:pointer;"><span class="dashboard-stat-value">' + totalRounds + '</span><span class="dashboard-stat-label">Total Rounds &#9998;</span></div>'
                    + '<div class="dashboard-stat"><span class="dashboard-stat-value">' + sinceCleaning + '</span><span class="dashboard-stat-label">Since Cleaning</span></div>';

                document.getElementById('stat-total-rounds').addEventListener('click', function () {
                    var newVal = prompt('Update total round count:', totalRounds);
                    if (newVal !== null) {
                        var parsed = parseInt(newVal, 10);
                        if (!isNaN(parsed) && parsed >= 0) {
                            activeBarrel.totalRounds = parsed;
                            self.db.updateBarrel(activeBarrel).then(function () {
                                self.showRifleDetail(rifle.id);
                            });
                        }
                    }
                });
            }
        });
    }
};

// ── Barrel Form ────────────────────────────────────────────────

ProfileManager.prototype.showBarrelForm = function (rifleId, barrel) {
    var isEdit = !!barrel;
    var title = isEdit ? 'Edit Barrel' : 'New Barrel';

    var html = '<div class="profile-screen">';
    html += '<div class="profile-toolbar">';
    html += '<button class="btn-back" id="btn-form-back">&lsaquo; Back</button>';
    html += '<h2 class="profile-title">' + title + '</h2>';
    html += '<div class="toolbar-spacer"></div>';
    html += '</div>';

    html += '<form id="barrel-form" class="profile-form">';

    html += '<div class="form-row">';
    html += '<div class="form-group form-group-half">';
    html += '<label for="br-twist-rate">Twist Rate</label>';
    html += '<input type="text" id="br-twist-rate" maxlength="20" placeholder="e.g., 1:10" value="' + escapeAttr(barrel ? barrel.twistRate : '') + '">';
    html += '</div>';
    html += '<div class="form-group form-group-half">';
    html += '<label for="br-twist-dir">Twist Direction</label>';
    html += '<select id="br-twist-dir">';
    html += '<option value="Right"' + (barrel && barrel.twistDirection === 'Right' ? ' selected' : '') + '>Right</option>';
    html += '<option value="Left"' + (barrel && barrel.twistDirection === 'Left' ? ' selected' : '') + '>Left</option>';
    html += '</select>';
    html += '</div>';
    html += '</div>';

    html += '<div class="form-row">';
    html += '<div class="form-group form-group-half">';
    html += '<label for="br-install-date">Install Date</label>';
    html += '<input type="date" id="br-install-date" value="' + escapeAttr(barrel ? barrel.installDate : new Date().toISOString().split('T')[0]) + '">';
    html += '</div>';
    html += '<div class="form-group form-group-half">';
    html += '<label for="br-total-rounds">Total Rounds</label>';
    html += '<input type="number" id="br-total-rounds" min="0" step="1" inputmode="numeric" placeholder="0" value="' + (barrel ? (barrel.totalRounds || 0) : 0) + '">';
    html += '</div>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label for="br-notes">Notes</label>';
    html += '<textarea id="br-notes" rows="2" placeholder="Optional notes">' + escapeHtml(barrel ? barrel.notes : '') + '</textarea>';
    html += '</div>';

    html += '<div class="btn-row">';
    html += '<button type="submit" class="btn btn-primary">' + (isEdit ? 'Save Changes' : 'Add Barrel') + '</button>';
    html += '</div>';

    html += '</form>';
    html += '</div>';

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
            });
        } else {
            self.db.addBarrel(data).then(function (newBarrel) {
                return self.db.setActiveBarrel(newBarrel.id, rifleId);
            }).then(function () {
                self.showRifleDetail(rifleId);
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
    var title = isEdit ? 'Edit Load' : 'New Load';

    var html = '<div class="profile-screen">';
    html += '<div class="profile-toolbar">';
    html += '<button class="btn-back" id="btn-form-back">&lsaquo; Back</button>';
    html += '<h2 class="profile-title">' + title + '</h2>';
    html += '<div class="toolbar-spacer"></div>';
    html += '</div>';

    html += '<form id="load-form" class="profile-form">';

    html += '<div class="form-group">';
    html += '<label for="ld-name">Load Name *</label>';
    html += '<input type="text" id="ld-name" maxlength="80" placeholder="e.g., Hornady 168gr ELD-M" value="' + escapeAttr(load ? load.name : '') + '">';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label for="ld-bullet-name">Bullet Name</label>';
    html += '<input type="text" id="ld-bullet-name" maxlength="80" placeholder="e.g., ELD Match" value="' + escapeAttr(load ? load.bulletName : '') + '">';
    html += '</div>';

    html += '<div class="form-row">';
    html += '<div class="form-group form-group-half">';
    html += '<label for="ld-bullet-weight">Weight (gr) *</label>';
    html += '<input type="number" id="ld-bullet-weight" min="1" max="1000" step="0.1" inputmode="decimal" placeholder="168" value="' + (load && load.bulletWeight ? load.bulletWeight : '') + '">';
    html += '</div>';
    html += '<div class="form-group form-group-half">';
    html += '<label for="ld-bullet-dia">Diameter (in) *</label>';
    html += '<input type="number" id="ld-bullet-dia" min="0.1" max="1.0" step="0.001" inputmode="decimal" placeholder="0.308" value="' + (load && load.bulletDiameter ? load.bulletDiameter : '') + '">';
    html += '</div>';
    html += '</div>';

    html += '<div class="form-row">';
    html += '<div class="form-group form-group-half">';
    html += '<label for="ld-bullet-bc">BC</label>';
    html += '<input type="number" id="ld-bullet-bc" min="0" max="2" step="0.001" inputmode="decimal" placeholder="0.462" value="' + (load && load.bulletBC ? load.bulletBC : '') + '">';
    html += '</div>';
    html += '<div class="form-group form-group-half">';
    html += '<label for="ld-drag-model">Drag Model</label>';
    html += '<select id="ld-drag-model">';
    html += '<option value="G1"' + (load && load.dragModel === 'G1' ? ' selected' : '') + '>G1</option>';
    html += '<option value="G7"' + (load && load.dragModel === 'G7' ? ' selected' : '') + '>G7</option>';
    html += '</select>';
    html += '</div>';
    html += '</div>';

    html += '<div class="form-row">';
    html += '<div class="form-group form-group-half">';
    html += '<label for="ld-mv">Muzzle Velocity (fps)</label>';
    html += '<input type="number" id="ld-mv" min="0" max="5000" step="1" inputmode="numeric" placeholder="2650" value="' + (load && load.muzzleVelocity ? load.muzzleVelocity : '') + '">';
    html += '</div>';
    html += '<div class="form-group form-group-half">';
    html += '<label for="ld-bullet-len">Bullet Length (in)</label>';
    html += '<input type="number" id="ld-bullet-len" min="0" max="3" step="0.001" inputmode="decimal" placeholder="1.275" value="' + (load && load.bulletLength ? load.bulletLength : '') + '">';
    html += '</div>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label for="ld-notes">Notes</label>';
    html += '<textarea id="ld-notes" rows="2" placeholder="Optional notes">' + escapeHtml(load ? load.notes : '') + '</textarea>';
    html += '</div>';

    html += '<div class="btn-row">';
    if (isEdit) {
        html += '<button type="button" class="btn btn-danger" id="btn-delete-load">Delete</button>';
    }
    html += '<button type="submit" class="btn btn-primary">' + (isEdit ? 'Save Changes' : 'Create Load') + '</button>';
    html += '</div>';

    html += '</form>';
    html += '</div>';

    this.container.innerHTML = html;
    this._bindLoadFormEvents(rifleId, load);
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
            bulletName: document.getElementById('ld-bullet-name').value.trim(),
            bulletWeight: weight,
            bulletDiameter: dia,
            bulletBC: parseFloat(document.getElementById('ld-bullet-bc').value) || 0,
            dragModel: document.getElementById('ld-drag-model').value,
            muzzleVelocity: parseFloat(document.getElementById('ld-mv').value) || 0,
            bulletLength: parseFloat(document.getElementById('ld-bullet-len').value) || 0,
            notes: document.getElementById('ld-notes').value.trim()
        };

        if (load) {
            load.name = data.name;
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

ProfileManager.prototype.showLoadDetail = function (rifleId, loadId) {
    var self = this;
    this.db.getLoad(loadId).then(function (load) {
        if (!load) { self.showRifleDetail(rifleId); return; }
        self._renderLoadDetail(rifleId, load);
    });
};

ProfileManager.prototype._renderLoadDetail = function (rifleId, load) {
    var html = '<div class="profile-screen">';
    html += '<div class="profile-toolbar">';
    html += '<button class="btn-back" id="btn-form-back">&lsaquo; Back</button>';
    html += '<h2 class="profile-title">' + escapeHtml(load.name) + '</h2>';
    html += '<button class="btn-icon" id="btn-edit-load" title="Edit">&#9998;</button>';
    html += '</div>';

    html += '<div class="detail-card">';
    if (load.bulletName) {
        html += '<div class="detail-row"><span class="detail-label">Bullet</span><span class="detail-value">' + escapeHtml(load.bulletName) + '</span></div>';
    }
    html += '<div class="detail-row"><span class="detail-label">Weight</span><span class="detail-value">' + load.bulletWeight + ' gr</span></div>';
    html += '<div class="detail-row"><span class="detail-label">Diameter</span><span class="detail-value">' + load.bulletDiameter + '"</span></div>';
    if (load.bulletBC) {
        html += '<div class="detail-row"><span class="detail-label">BC (' + load.dragModel + ')</span><span class="detail-value">' + load.bulletBC + '</span></div>';
    }
    if (load.muzzleVelocity) {
        html += '<div class="detail-row"><span class="detail-label">Muzzle Velocity</span><span class="detail-value">' + load.muzzleVelocity + ' fps</span></div>';
    }
    if (load.bulletLength) {
        html += '<div class="detail-row"><span class="detail-label">Bullet Length</span><span class="detail-value">' + load.bulletLength + '"</span></div>';
    }
    if (load.notes) {
        html += '<div class="detail-row detail-row-notes"><span class="detail-label">Notes</span><span class="detail-value">' + escapeHtml(load.notes) + '</span></div>';
    }
    html += '</div>';

    html += '<div class="btn-row" style="padding: 0 16px;">';
    html += '<button class="btn btn-danger" id="btn-delete-load">Delete Load</button>';
    html += '</div>';

    html += '</div>';

    this.container.innerHTML = html;

    var self = this;

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
