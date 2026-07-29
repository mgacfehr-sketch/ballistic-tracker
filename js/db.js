/**
 * db.js — BallisticDB: Supabase wrapper owning ALL database access.
 *
 * Promise-based CRUD for: Rifle, Barrel, Load, Session, ZeroRecord,
 * ScopeAdjustment, CleaningLog, ColdBoreShot, VelocityString,
 * AI Conversations/Usage — plus Storage (session images) and admin RPCs.
 *
 * UI modules never touch the Supabase client directly; this file owns
 * camelCase↔snake_case row mapping and scopes every query by user_id.
 *
 * Usage:
 *   var db = new BallisticDB(supabaseClient, userId);
 *   db.open().then(function() { ... });
 */

var MAX_RIFLES = 50;

// ── Case-conversion helpers ────────────────────────────────────

function _toSnake(str) {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function _toCamel(str) {
    return str.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); });
}

// Known abbreviations that lose casing in the round-trip
var _CAMEL_FIXES = { bulletBc: 'bulletBC' };

function _rowToJs(row) {
    if (!row) return null;
    var obj = {};
    for (var key in row) {
        if (!row.hasOwnProperty(key)) continue;
        if (key === 'user_id') continue;
        var camelKey = _toCamel(key);
        camelKey = _CAMEL_FIXES[camelKey] || camelKey;
        obj[camelKey] = row[key];
    }
    return obj;
}

function _jsToRow(obj, userId) {
    var row = {};
    for (var key in obj) {
        if (!obj.hasOwnProperty(key)) continue;
        row[_toSnake(key)] = obj[key];
    }
    row.user_id = userId;
    return row;
}

// ── Constructor ────────────────────────────────────────────────

function BallisticDB(supabaseClient, userId) {
    this.supabase = supabaseClient;
    this.userId = userId;
}

/**
 * Open — no-op for Supabase (kept for API compatibility).
 * @returns {Promise<void>}
 */
BallisticDB.prototype.open = function () {
    return Promise.resolve();
};

// ── Rifle CRUD ─────────────────────────────────────────────────

BallisticDB.prototype.addRifle = function (data) {
    var self = this;
    return self.supabase.from('rifles').select('*', { count: 'exact', head: true })
        .eq('user_id', self.userId)
        .then(function (countRes) {
            if (countRes.error) throw countRes.error;
            if (countRes.count >= MAX_RIFLES) {
                throw new Error('Maximum of ' + MAX_RIFLES + ' rifle profiles reached');
            }
            var now = new Date().toISOString();
            var rifle = {
                id: generateUUID(),
                name: data.name || '',
                caliber: data.caliber || '',
                scopeHeight: data.scopeHeight || 0,
                zeroRange: data.zeroRange || 0,
                angleUnit: data.angleUnit || 'MOA',
                notes: data.notes || '',
                // Suppressor configurations — optional
                hasConfigs: typeof data.hasConfigs === 'boolean' ? data.hasConfigs : null,
                activeConfig: data.activeConfig || null,
                configVelocityDelta: data.configVelocityDelta || null,
                configPoiShift: data.configPoiShift || null,
                // Scope facts (tall-target test) — all optional
                scopeClickValue: data.scopeClickValue || null,
                scopeCorrectionFactor: data.scopeCorrectionFactor || null,
                scopeTrackingTestedAt: data.scopeTrackingTestedAt || null,
                scopeCantWarn: typeof data.scopeCantWarn === 'boolean' ? data.scopeCantWarn : null,
                // Build sheet (certificate) — all optional
                serialNumber: data.serialNumber || null,
                action: data.action || null,
                barrelSpec: data.barrelSpec || null,
                triggerSpec: data.triggerSpec || null,
                chassis: data.chassis || null,
                muzzleDevice: data.muzzleDevice || null,
                createdAt: now,
                updatedAt: now
            };
            var row = _jsToRow(rifle, self.userId);
            return self.supabase.from('rifles').insert(row).select().single();
        })
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

BallisticDB.prototype.updateRifle = function (rifle) {
    var self = this;
    rifle.updatedAt = new Date().toISOString();
    var row = _jsToRow(rifle, self.userId);
    return self.supabase.from('rifles').update(row)
        .eq('id', rifle.id).eq('user_id', self.userId)
        .select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

BallisticDB.prototype.getRifle = function (id) {
    var self = this;
    if (typeof OfflineCache !== 'undefined' && !OfflineCache.isOnline()) {
        return OfflineCache.getCachedRifle(id);
    }
    return self.supabase.from('rifles').select()
        .eq('id', id).eq('user_id', self.userId)
        .maybeSingle()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        })
        .catch(function (err) {
            console.warn('[DB] getRifle failed, trying cache:', err);
            return OfflineCache.getCachedRifle(id);
        });
};

BallisticDB.prototype.getAllRifles = function () {
    var self = this;
    if (typeof OfflineCache !== 'undefined' && !OfflineCache.isOnline()) {
        return OfflineCache.getCachedRifles();
    }
    return self.supabase.from('rifles').select()
        .eq('user_id', self.userId)
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        })
        .catch(function (err) {
            console.warn('[DB] getAllRifles failed, trying cache:', err);
            return OfflineCache.getCachedRifles();
        });
};

BallisticDB.prototype.deleteRifle = function (id) {
    var self = this;
    // Get sessions first so we can delete their Storage images
    return self.getSessionsByRifle(id).then(function (sessions) {
        var imageDeletes = [];
        for (var i = 0; i < sessions.length; i++) {
            imageDeletes.push(self.deleteSessionImage(sessions[i].id).catch(function () {}));
        }
        return Promise.all(imageDeletes);
    }).then(function () {
        // Cascade-delete all children
        return Promise.all([
            self.supabase.from('barrels').delete().eq('rifle_id', id).eq('user_id', self.userId),
            self.supabase.from('loads').delete().eq('rifle_id', id).eq('user_id', self.userId),
            self.supabase.from('sessions').delete().eq('rifle_id', id).eq('user_id', self.userId),
            self.supabase.from('zero_records').delete().eq('rifle_id', id).eq('user_id', self.userId),
            self.supabase.from('scope_adjustments').delete().eq('rifle_id', id).eq('user_id', self.userId),
            self.supabase.from('cleaning_logs').delete().eq('rifle_id', id).eq('user_id', self.userId),
            self.supabase.from('cold_bore_shots').delete().eq('rifle_id', id).eq('user_id', self.userId),
            self.supabase.from('velocity_strings').delete().eq('rifle_id', id).eq('user_id', self.userId),
            self.supabase.from('field_shots').delete().eq('rifle_id', id).eq('user_id', self.userId)
        ]);
    }).then(function (results) {
        for (var i = 0; i < results.length; i++) {
            if (results[i].error) throw results[i].error;
        }
        return self.supabase.from('rifles').delete().eq('id', id).eq('user_id', self.userId);
    }).then(function (res) {
        if (res.error) throw res.error;
    });
};

// ── Barrel CRUD ────────────────────────────────────────────────

/**
 * Normalize barrel round count fields.
 * The DB has both round_count and total_rounds columns.
 * We standardize on totalRounds in JS (total_rounds in DB).
 * On read: prefer totalRounds, fall back to roundCount.
 * On write: sync both columns so they stay consistent.
 */
function _normalizeBarrel(barrel) {
    if (!barrel) return barrel;
    // Read: if totalRounds is missing/zero but roundCount has a value, use it
    if (!barrel.totalRounds && barrel.roundCount) {
        barrel.totalRounds = barrel.roundCount;
    }
    // Clean up the legacy field so downstream code only sees totalRounds
    delete barrel.roundCount;
    return barrel;
}

function _barrelRowForWrite(row) {
    // Sync round_count from total_rounds so both columns match
    if (row.total_rounds !== undefined) {
        row.round_count = row.total_rounds;
    }
    return row;
}

BallisticDB.prototype.addBarrel = function (data) {
    var self = this;
    var barrel = {
        id: generateUUID(),
        rifleId: data.rifleId,
        twistRate: data.twistRate || '',
        twistDirection: data.twistDirection || 'Right',
        installDate: data.installDate || new Date().toISOString().split('T')[0],
        isActive: data.isActive !== undefined ? data.isActive : true,
        totalRounds: data.totalRounds || 0,
        notes: data.notes || '',
        createdAt: new Date().toISOString()
    };
    var row = _barrelRowForWrite(_jsToRow(barrel, self.userId));
    return self.supabase.from('barrels').insert(row).select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            return _normalizeBarrel(_rowToJs(res.data));
        });
};

BallisticDB.prototype.updateBarrel = function (barrel) {
    var self = this;
    var row = _barrelRowForWrite(_jsToRow(barrel, self.userId));
    return self.supabase.from('barrels').update(row)
        .eq('id', barrel.id).eq('user_id', self.userId)
        .select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            return _normalizeBarrel(_rowToJs(res.data));
        });
};

BallisticDB.prototype.getBarrel = function (id) {
    var self = this;
    return self.supabase.from('barrels').select()
        .eq('id', id).eq('user_id', self.userId)
        .maybeSingle()
        .then(function (res) {
            if (res.error) throw res.error;
            return _normalizeBarrel(_rowToJs(res.data));
        });
};

BallisticDB.prototype.getBarrelsByRifle = function (rifleId) {
    var self = this;
    if (typeof OfflineCache !== 'undefined' && !OfflineCache.isOnline()) {
        return OfflineCache.getCachedBarrels(rifleId);
    }
    return self.supabase.from('barrels').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId)
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(function (r) {
                return _normalizeBarrel(_rowToJs(r));
            });
        })
        .catch(function (err) {
            console.warn('[DB] getBarrelsByRifle failed, trying cache:', err);
            return OfflineCache.getCachedBarrels(rifleId);
        });
};

BallisticDB.prototype.deleteBarrel = function (id) {
    var self = this;
    return self.supabase.from('barrels').delete()
        .eq('id', id).eq('user_id', self.userId)
        .then(function (res) {
            if (res.error) throw res.error;
        });
};

BallisticDB.prototype.setActiveBarrel = function (barrelId, rifleId) {
    var self = this;
    return this.getBarrelsByRifle(rifleId).then(function (barrels) {
        var updates = [];
        for (var i = 0; i < barrels.length; i++) {
            var wasActive = barrels[i].isActive;
            barrels[i].isActive = (barrels[i].id === barrelId);
            if (barrels[i].isActive !== wasActive) {
                updates.push(self.updateBarrel(barrels[i]));
            }
        }
        return Promise.all(updates);
    });
};

// ── Load CRUD ──────────────────────────────────────────────────

BallisticDB.prototype.addLoad = function (data) {
    var self = this;
    var load = {
        id: generateUUID(),
        rifleId: data.rifleId,
        name: data.name || '',
        lotNumber: data.lotNumber || null,
        recipe: data.recipe || null,
        bulletName: data.bulletName || '',
        bulletWeight: data.bulletWeight || 0,
        bulletLength: data.bulletLength || 0,
        bulletDiameter: data.bulletDiameter || 0,
        bulletBC: data.bulletBC || 0,
        dragModel: data.dragModel || 'G1',
        muzzleVelocity: data.muzzleVelocity || 0,
        notes: data.notes || '',
        createdAt: new Date().toISOString()
    };
    var row = _jsToRow(load, self.userId);
    return self.supabase.from('loads').insert(row).select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

BallisticDB.prototype.updateLoad = function (load) {
    var self = this;
    var row = _jsToRow(load, self.userId);
    return self.supabase.from('loads').update(row)
        .eq('id', load.id).eq('user_id', self.userId)
        .select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

BallisticDB.prototype.getLoad = function (id) {
    var self = this;
    if (typeof OfflineCache !== 'undefined' && !OfflineCache.isOnline()) {
        return OfflineCache.getCachedLoad(id);
    }
    return self.supabase.from('loads').select()
        .eq('id', id).eq('user_id', self.userId)
        .maybeSingle()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        })
        .catch(function (err) {
            console.warn('[DB] getLoad failed, trying cache:', err);
            return OfflineCache.getCachedLoad(id);
        });
};

BallisticDB.prototype.getLoadsByRifle = function (rifleId) {
    var self = this;
    if (typeof OfflineCache !== 'undefined' && !OfflineCache.isOnline()) {
        return OfflineCache.getCachedLoads(rifleId);
    }
    return self.supabase.from('loads').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId)
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        })
        .catch(function (err) {
            console.warn('[DB] getLoadsByRifle failed, trying cache:', err);
            return OfflineCache.getCachedLoads(rifleId);
        });
};

BallisticDB.prototype.deleteLoad = function (id) {
    var self = this;
    return self.supabase.from('loads').delete()
        .eq('id', id).eq('user_id', self.userId)
        .then(function (res) {
            if (res.error) throw res.error;
        });
};

// ── Session CRUD ───────────────────────────────────────────────

// v2.5 §3.2 field audit: suppressor_id + lot_number are real columns
// (REORG-migrations.sql). rifle_name/rifle_caliber/load_name/
// load_bullet_name/load_bullet_weight are NOT — they were only ever
// referenced in a COALESCE fallback in the separate crowd-data branch's
// admin export query (written for a future state, never an ADD COLUMN
// here). SIMPLE-migrations.sql adds them for real; until the owner runs
// it, _addSessionRow degrades gracefully instead of hard-failing.
var SESSION_SNAPSHOT_FIELDS = ['rifleName', 'rifleCaliber', 'loadName', 'loadBulletName', 'loadBulletWeight'];

/** PostgREST "column not found in schema cache" — the ADD COLUMN migration hasn't run yet. */
function _isMissingColumnError(err) {
    if (!err) return false;
    if (err.code === 'PGRST204') return true;
    return /could not find.*column.*schema cache/i.test(String(err.message || ''));
}

/**
 * Generic insert-with-graceful-column-degradation, for additive Phase
 * C/D columns (barrel_id, etc) that ship in JS/UI code before their
 * owner-run migration necessarily lands — same idiom as
 * _insertSessionGraceful above, generalized so every new optional
 * column doesn't need its own bespoke retry method. If the DB rejects a
 * row because a not-yet-migrated column doesn't exist, strip exactly
 * those columns and retry ONCE.
 */
function _insertGracefulRow(supabase, table, row, droppableCols, allowRetry) {
    return supabase.from(table).insert(row).select().single().then(function (res) {
        if (res.error) {
            if (allowRetry && _isMissingColumnError(res.error)) {
                console.warn('[db] ' + table + ' is missing a column (' + droppableCols.join(', ') +
                    ') — run PHASECD-migrations.sql. Saving without it for now:', res.error.message);
                var stripped = {};
                for (var k in row) {
                    if (row.hasOwnProperty(k) && droppableCols.indexOf(k) === -1) stripped[k] = row[k];
                }
                return _insertGracefulRow(supabase, table, stripped, [], false);
            }
            throw res.error;
        }
        return res;
    });
}

BallisticDB.prototype.addSession = function (data) {
    var self = this;
    var session = {
        id: generateUUID(),
        rifleId: data.rifleId || null,
        loadId: data.loadId || null,
        barrelId: data.barrelId || null,
        date: data.date || new Date().toISOString(),
        distanceYards: data.distanceYards || 0,
        roundsFired: data.roundsFired || 0,
        measuredVelocity: data.measuredVelocity || null,
        weather: data.weather || null,
        imageFilename: data.imageFilename || '',
        calibrationData: data.calibrationData || null,
        bulletDiameter: data.bulletDiameter || 0,
        poaPoint: data.poaPoint || null,
        impacts: data.impacts || [],
        results: data.results || null,
        coldBore: data.coldBore || null,
        sightInComments: data.sightInComments || '',
        isZeroSession: data.isZeroSession || false,
        config: data.config || null,
        sessionType: data.sessionType || null,
        ladder: data.ladder || null,
        // real columns (REORG-migrations.sql) — always safe to send
        suppressorId: data.suppressorId || null,
        lotNumber: data.lotNumber || null,
        // snapshot columns (SIMPLE-migrations.sql, may not exist yet —
        // see _isMissingColumnError fallback below)
        rifleName: data.rifleName || null,
        rifleCaliber: data.rifleCaliber || null,
        loadName: data.loadName || null,
        loadBulletName: data.loadBulletName || null,
        loadBulletWeight: data.loadBulletWeight || null,
        createdAt: new Date().toISOString()
    };
    return self._insertSessionGraceful(session, true);
};

/**
 * Insert a session row; if the DB rejects it for a missing snapshot
 * column (the migration hasn't run yet), strip those fields and retry
 * ONCE rather than failing the whole save. Snapshot data is a nice-to-
 * have enrichment, not a save-blocking requirement.
 */
BallisticDB.prototype._insertSessionGraceful = function (session, allowRetry) {
    var self = this;
    var row = _jsToRow(session, self.userId);
    return self.supabase.from('sessions').insert(row).select().single()
        .then(function (res) {
            if (res.error) {
                if (allowRetry && _isMissingColumnError(res.error)) {
                    console.warn('[db] sessions is missing snapshot columns — ' +
                        'run SIMPLE-migrations.sql. Saving without them for now:', res.error.message);
                    var stripped = {};
                    for (var k in session) {
                        if (session.hasOwnProperty(k) && SESSION_SNAPSHOT_FIELDS.indexOf(k) === -1) {
                            stripped[k] = session[k];
                        }
                    }
                    return self._insertSessionGraceful(stripped, false);
                }
                throw res.error;
            }
            return _rowToJs(res.data);
        });
};

BallisticDB.prototype.updateSession = function (session) {
    var self = this;
    var row = _jsToRow(session, self.userId);
    return self.supabase.from('sessions').update(row)
        .eq('id', session.id).eq('user_id', self.userId)
        .select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

BallisticDB.prototype.getSession = function (id) {
    var self = this;
    return self.supabase.from('sessions').select()
        .eq('id', id).eq('user_id', self.userId)
        .maybeSingle()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

BallisticDB.prototype.getSessionsByRifle = function (rifleId) {
    var self = this;
    return self.supabase.from('sessions').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId)
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

BallisticDB.prototype.getAllSessions = function () {
    var self = this;
    return self.supabase.from('sessions').select()
        .eq('user_id', self.userId)
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

BallisticDB.prototype.getMiscSessions = function () {
    var self = this;
    return self.supabase.from('sessions').select()
        .eq('user_id', self.userId)
        .is('rifle_id', null)
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

BallisticDB.prototype.deleteSession = function (id) {
    var self = this;
    return self.deleteSessionImage(id).catch(function () {}).then(function () {
        return self.supabase.from('sessions').delete()
            .eq('id', id).eq('user_id', self.userId);
    }).then(function (res) {
        if (res.error) throw res.error;
    });
};

// ── Attachment Vault (Amendment 1 Part B — PHASEB-migrations.sql P2) ──
// Content-hash + upload-state tracking for original files. Addresses
// owner-review #10 (session-images bucket had neither) and Amendment
// 1's "vault-first import" principle (original file + hash preserved
// BEFORE association; unresolved imports park safely).

/**
 * Register a content hash for a file that is ALREADY being uploaded to
 * its own conventional path (session/steel images) — no duplicate
 * storage write, just a hash-tracking row alongside it. Best-effort:
 * never throws to the caller (CLAUDE.md rule 8 — image upload failure
 * must never block a session save; the same guarantee extends here).
 */
BallisticDB.prototype._registerAttachmentHash = function (kind, blob, storagePath, associatedTable, associatedRowId) {
    var self = this;
    return sha256Hex(blob).then(function (hash) {
        var record = {
            id: generateUUID(),
            kind: kind,
            contentHash: hash,
            byteSize: blob.size || null,
            storageBucket: 'session-images',
            storagePath: storagePath,
            status: 'associated',
            associatedTable: associatedTable,
            associatedRowId: associatedRowId,
            resolvedAt: new Date().toISOString()
        };
        var row = _jsToRow(record, self.userId);
        return self.supabase.from('attachment_vault').insert(row).select().single();
    }).then(function (res) {
        if (res && res.error && res.error.code !== '23505') { // unique_violation = already registered
            console.warn('[db] attachment_vault hash registration failed for ' + storagePath + ':', res.error.message);
        }
    }).catch(function (err) {
        console.warn('[db] attachment_vault hash registration threw for ' + storagePath + ':', err);
    });
};

/**
 * Vault-first import: hash + upload the ORIGINAL import file to
 * {userId}/{hash} in the DEDICATED import-vault bucket (owner ruling,
 * OWNER-ACTIONS item 6: original evidence has a different lifecycle
 * and policy surface than display images, so it gets its own bucket
 * rather than reusing session-images), BEFORE any parsing/association
 * happens. Identical bytes re-uploaded by the same user return the
 * existing vault row instead of erroring (unique on
 * user_id+content_hash) — a safe re-import no-op at the vault layer,
 * independent of js/chrono.js's own per-shot dedup (owner-review #7).
 * @returns {Promise<Object>} the vault row (existing or newly created)
 */
BallisticDB.prototype.vaultImportFile = function (kind, blob, filename) {
    var self = this;
    return sha256Hex(blob).then(function (hash) {
        // Check FIRST, upload only if genuinely new (owner-review RLS audit
        // finding: bucket upload(...,{upsert:true}) against a path that
        // already exists — e.g. re-importing the exact same file, which
        // this hash-keyed path makes identical bytes always land on —
        // needs an UPDATE storage policy, which this dedicated bucket DOES
        // have from the start (PHASEB-migrations.sql P0b), but checking
        // attachment_vault first still avoids a wasted re-upload of
        // identical bytes either way.
        return self.supabase.from('attachment_vault').select()
            .eq('user_id', self.userId).eq('content_hash', hash).maybeSingle()
            .then(function (existing) {
                if (existing.error) throw existing.error;
                if (existing.data) return _rowToJs(existing.data);

                var path = self.userId + '/' + hash;
                return self.supabase.storage.from('import-vault')
                    .upload(path, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' })
                    .then(function (upRes) {
                        if (upRes.error) throw upRes.error;
                        var record = {
                            id: generateUUID(),
                            kind: kind,
                            originalFilename: filename || null,
                            contentHash: hash,
                            byteSize: blob.size || null,
                            storageBucket: 'import-vault',
                            storagePath: path,
                            status: 'unresolved'
                        };
                        var row = _jsToRow(record, self.userId);
                        return self.supabase.from('attachment_vault').insert(row).select().single();
                    })
                    .then(function (res) {
                        if (res.error) {
                            if (res.error.code === '23505') {
                                // Lost a race with a concurrent identical
                                // upload — fetch and return the row that won.
                                return self.supabase.from('attachment_vault').select()
                                    .eq('user_id', self.userId).eq('content_hash', hash).single()
                                    .then(function (existing2) {
                                        if (existing2.error) throw existing2.error;
                                        return _rowToJs(existing2.data);
                                    });
                            }
                            throw res.error;
                        }
                        return _rowToJs(res.data);
                    });
            });
    });
};

/** Mark a vaulted import resolved once its parsed rows are saved. */
BallisticDB.prototype.resolveVaultedImport = function (vaultId, associatedTable, associatedRowId) {
    var self = this;
    var row = _jsToRow({
        status: 'associated',
        associatedTable: associatedTable,
        associatedRowId: associatedRowId || null,
        resolvedAt: new Date().toISOString()
    }, self.userId);
    return self.supabase.from('attachment_vault').update(row)
        .eq('id', vaultId).eq('user_id', self.userId)
        .then(function (res) {
            if (res.error) throw res.error;
        });
};

/**
 * Read-only existence check for one exact Storage path — does it
 * already exist, regardless of what the last upload attempt's response
 * said? Uses list()+search, which only needs the bucket's SELECT
 * policy — this works even on a bucket that has no UPDATE policy yet
 * (owner-review RLS audit finding), and is what makes
 * js/sync-queue.js's retry hardening below possible without depending
 * on that policy fix. Never throws — "can't confirm" and "confirmed
 * absent" both resolve false; the caller must treat "false" as "not
 * verified," not "definitely doesn't exist."
 */
BallisticDB.prototype._storageObjectExists = function (bucket, path) {
    var self = this;
    var slash = path.lastIndexOf('/');
    var folder = slash === -1 ? '' : path.slice(0, slash);
    var filename = slash === -1 ? path : path.slice(slash + 1);
    return self.supabase.storage.from(bucket).list(folder, { search: filename, limit: 1 })
        .then(function (res) {
            if (res.error) return false;
            return (res.data || []).some(function (entry) { return entry.name === filename; });
        })
        .catch(function () { return false; });
};

/** Did BOTH of a session's images actually land, regardless of what the
 *  last upload attempt's response said? (Amendment 1 A16 hardening —
 *  see js/sync-queue.js's flush() image-retry path.) */
BallisticDB.prototype.sessionImageExists = function (sessionId) {
    var self = this;
    var fullPath = self.userId + '/' + sessionId + '.jpg';
    var thumbPath = self.userId + '/' + sessionId + '_thumb.jpg';
    return Promise.all([
        self._storageObjectExists('session-images', fullPath),
        self._storageObjectExists('session-images', thumbPath)
    ]).then(function (results) { return results[0] && results[1]; });
};

/** Did this steel photo actually land? Same purpose as
 *  sessionImageExists above, single-file case. */
BallisticDB.prototype.steelPhotoExists = function (stringId) {
    var self = this;
    var path = self.userId + '/steel_' + stringId + '.jpg';
    return self._storageObjectExists('session-images', path);
};

// ── Session Images (Supabase Storage) ──────────────────────────

BallisticDB.prototype.saveSessionImage = function (sessionId, fullBlob, thumbnailBlob) {
    var self = this;
    var fullPath = self.userId + '/' + sessionId + '.jpg';
    var thumbPath = self.userId + '/' + sessionId + '_thumb.jpg';
    return Promise.all([
        self.supabase.storage.from('session-images').upload(fullPath, fullBlob, {
            upsert: true,
            contentType: 'image/jpeg'
        }),
        self.supabase.storage.from('session-images').upload(thumbPath, thumbnailBlob, {
            upsert: true,
            contentType: 'image/jpeg'
        })
    ]).then(function (results) {
        if (results[0].error) throw results[0].error;
        if (results[1].error) throw results[1].error;
        self._registerAttachmentHash('session_image', fullBlob, fullPath, 'sessions', sessionId);
        return { sessionId: sessionId, createdAt: new Date().toISOString() };
    });
};

BallisticDB.prototype.getSessionImage = function (sessionId) {
    var self = this;
    var fullPath = self.userId + '/' + sessionId + '.jpg';
    var thumbPath = self.userId + '/' + sessionId + '_thumb.jpg';
    return Promise.all([
        self.supabase.storage.from('session-images').download(fullPath),
        self.supabase.storage.from('session-images').download(thumbPath)
    ]).then(function (results) {
        if (results[0].error || results[1].error) return null;
        return {
            sessionId: sessionId,
            fullBlob: results[0].data,
            thumbnailBlob: results[1].data
        };
    });
};

BallisticDB.prototype.deleteSessionImage = function (sessionId) {
    var self = this;
    var fullPath = self.userId + '/' + sessionId + '.jpg';
    var thumbPath = self.userId + '/' + sessionId + '_thumb.jpg';
    return self.supabase.storage.from('session-images').remove([fullPath, thumbPath])
        .then(function () {});
};

// ── ZeroRecord CRUD ────────────────────────────────────────────

BallisticDB.prototype.addZeroRecord = function (data) {
    var self = this;
    var record = {
        id: generateUUID(),
        rifleId: data.rifleId,
        loadId: data.loadId,
        sessionId: data.sessionId || null,
        date: data.date || new Date().toISOString().split('T')[0],
        rangeYards: data.rangeYards || 0,
        weather: data.weather || null,
        config: data.config || null,
        notes: data.notes || ''
    };
    var row = _jsToRow(record, self.userId);
    return self.supabase.from('zero_records').insert(row).select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

BallisticDB.prototype.getZeroRecordsByRifle = function (rifleId) {
    var self = this;
    return self.supabase.from('zero_records').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId)
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

BallisticDB.prototype.deleteZeroRecord = function (id) {
    var self = this;
    return self.supabase.from('zero_records').delete()
        .eq('id', id).eq('user_id', self.userId)
        .then(function (res) {
            if (res.error) throw res.error;
        });
};

// ── ScopeAdjustment CRUD ───────────────────────────────────────

BallisticDB.prototype.addScopeAdjustment = function (data) {
    var self = this;
    var adj = {
        id: generateUUID(),
        rifleId: data.rifleId,
        sessionId: data.sessionId || null,
        date: data.date || new Date().toISOString(),
        elevationChange: data.elevationChange || 0,
        windageChange: data.windageChange || 0,
        reason: data.reason || '',
        notes: data.notes || ''
    };
    var row = _jsToRow(adj, self.userId);
    return self.supabase.from('scope_adjustments').insert(row).select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            var saved = _rowToJs(res.data);
            self._writeFactEvent('scope_adjustment', 'scope_adjustments', saved, { provenance: 'manual' });
            return saved;
        });
};

BallisticDB.prototype.getScopeAdjustmentsByRifle = function (rifleId) {
    var self = this;
    return self.supabase.from('scope_adjustments').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId)
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

BallisticDB.prototype.deleteScopeAdjustment = function (id) {
    var self = this;
    return self.supabase.from('scope_adjustments').delete()
        .eq('id', id).eq('user_id', self.userId)
        .then(function (res) {
            if (res.error) throw res.error;
        });
};

// ── CleaningLog CRUD ───────────────────────────────────────────

BallisticDB.prototype.addCleaningLog = function (data) {
    var self = this;
    var log = {
        id: generateUUID(),
        rifleId: data.rifleId,
        barrelId: data.barrelId,
        date: data.date || new Date().toISOString(),
        roundCountAtCleaning: data.roundCountAtCleaning || 0,
        notes: data.notes || ''
    };
    var row = _jsToRow(log, self.userId);
    return self.supabase.from('cleaning_logs').insert(row).select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            var saved = _rowToJs(res.data);
            self._writeFactEvent('cleaning', 'cleaning_logs', saved, { provenance: 'manual' });
            return saved;
        });
};

BallisticDB.prototype.getCleaningLogsByRifle = function (rifleId) {
    var self = this;
    return self.supabase.from('cleaning_logs').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId)
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

BallisticDB.prototype.getCleaningLogsByBarrel = function (barrelId) {
    var self = this;
    return self.supabase.from('cleaning_logs').select()
        .eq('user_id', self.userId).eq('barrel_id', barrelId)
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

BallisticDB.prototype.deleteCleaningLog = function (id) {
    var self = this;
    return self.supabase.from('cleaning_logs').delete()
        .eq('id', id).eq('user_id', self.userId)
        .then(function (res) {
            if (res.error) throw res.error;
        });
};

// ── Cold Bore Shot CRUD ───────────────────────────────────────

BallisticDB.prototype.addColdBoreShot = function (data) {
    var self = this;
    var shot = {
        id: generateUUID(),
        rifleId: data.rifleId,
        distanceYards: data.distanceYards || 100,
        condition: data.condition || 'clean_cold',
        config: data.config || null,
        elevationOffsetMOA: data.elevationOffsetMOA || 0,
        windageOffsetMOA: data.windageOffsetMOA || 0,
        notes: data.notes || '',
        date: data.date || new Date().toISOString(),
        createdAt: new Date().toISOString()
    };
    var row = _jsToRow(shot, self.userId);
    return self.supabase.from('cold_bore_shots').insert(row).select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

BallisticDB.prototype.getColdBoreShots = function (rifleId) {
    var self = this;
    return self.supabase.from('cold_bore_shots').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId)
        .order('created_at', { ascending: false })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

BallisticDB.prototype.deleteColdBoreShot = function (id) {
    var self = this;
    return self.supabase.from('cold_bore_shots').delete()
        .eq('id', id).eq('user_id', self.userId)
        .then(function (res) {
            if (res.error) throw res.error;
        });
};

// ── Velocity String CRUD ──────────────────────────────────────

BallisticDB.prototype.addVelocityString = function (data) {
    var self = this;
    var record = {
        id: generateUUID(),
        rifleId: data.rifleId || null,
        loadId: data.loadId || null,
        barrelId: data.barrelId || null,
        date: data.date || new Date().toISOString(),
        source: data.source || 'manual',
        sheetName: data.sheetName || '',
        shots: data.shots || [],
        avgFps: typeof data.avgFps === 'number' ? data.avgFps : null,
        sdFps: typeof data.sdFps === 'number' ? data.sdFps : null,
        esFps: typeof data.esFps === 'number' ? data.esFps : null,
        roundCountAt: typeof data.roundCountAt === 'number' ? data.roundCountAt : null,
        assignmentStatus: data.assignmentStatus || 'unassigned',
        config: data.config || null,
        lotNumber: data.lotNumber || null,
        notes: data.notes || '',
        createdAt: new Date().toISOString()
    };
    var row = _jsToRow(record, self.userId);
    return self.supabase.from('velocity_strings').insert(row).select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

BallisticDB.prototype.updateVelocityString = function (record) {
    var self = this;
    var row = _jsToRow(record, self.userId);
    return self.supabase.from('velocity_strings').update(row)
        .eq('id', record.id).eq('user_id', self.userId)
        .select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

BallisticDB.prototype.getVelocityStringsByRifle = function (rifleId) {
    var self = this;
    if (typeof OfflineCache !== 'undefined' && !OfflineCache.isOnline()) {
        return OfflineCache.getCachedVelocityStrings(rifleId);
    }
    return self.supabase.from('velocity_strings').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId)
        .order('date', { ascending: false })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        })
        .catch(function (err) {
            console.warn('[DB] getVelocityStringsByRifle failed, trying cache:', err);
            return OfflineCache.getCachedVelocityStrings(rifleId);
        });
};

BallisticDB.prototype.getAllVelocityStrings = function () {
    var self = this;
    return self.supabase.from('velocity_strings').select()
        .eq('user_id', self.userId)
        .order('date', { ascending: false })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

BallisticDB.prototype.getUnassignedVelocityStrings = function () {
    var self = this;
    return self.supabase.from('velocity_strings').select()
        .eq('user_id', self.userId).is('rifle_id', null)
        .order('date', { ascending: false })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

BallisticDB.prototype.deleteVelocityString = function (id) {
    var self = this;
    return self.supabase.from('velocity_strings').delete()
        .eq('id', id).eq('user_id', self.userId)
        .then(function (res) {
            if (res.error) throw res.error;
        });
};

// ── Field Shot CRUD (steel/hit logging) ───────────────────────

BallisticDB.prototype.addFieldShot = function (data) {
    var self = this;
    var record = {
        id: generateUUID(),
        rifleId: data.rifleId,
        loadId: data.loadId || null,
        date: data.date || new Date().toISOString(),
        distanceYards: data.distanceYards || null,
        hits: typeof data.hits === 'number' ? data.hits : null,
        shots: typeof data.shots === 'number' ? data.shots : null,
        position: data.position || null,
        targetSizeIn: typeof data.targetSizeIn === 'number' && data.targetSizeIn > 0 ? data.targetSizeIn : null,
        config: data.config || null,
        weather: data.weather || null,
        windCall: data.windCall || null,
        windActual: data.windActual || null,
        notes: data.notes || '',
        createdAt: new Date().toISOString()
    };
    var row = _jsToRow(record, self.userId);
    return self.supabase.from('field_shots').insert(row).select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

BallisticDB.prototype.getFieldShotsByRifle = function (rifleId) {
    var self = this;
    return self.supabase.from('field_shots').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId)
        .order('date', { ascending: false })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

BallisticDB.prototype.deleteFieldShot = function (id) {
    var self = this;
    return self.supabase.from('field_shots').delete()
        .eq('id', id).eq('user_id', self.userId)
        .then(function (res) {
            if (res.error) throw res.error;
        });
};

// ── AI Conversations CRUD ─────────────────────────────────────

BallisticDB.prototype.addConversation = function (data) {
    var self = this;
    var conv = {
        id: generateUUID(),
        rifleId: data.rifleId || null,
        title: data.title || 'New Conversation',
        messages: data.messages || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    var row = _jsToRow(conv, self.userId);
    return self.supabase.from('ai_conversations').insert(row).select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

BallisticDB.prototype.updateConversation = function (conv) {
    var self = this;
    conv.updatedAt = new Date().toISOString();
    var row = _jsToRow(conv, self.userId);
    return self.supabase.from('ai_conversations').update(row)
        .eq('id', conv.id).eq('user_id', self.userId)
        .select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

BallisticDB.prototype.getConversationsByRifle = function (rifleId) {
    var self = this;
    var query = self.supabase.from('ai_conversations').select()
        .eq('user_id', self.userId);
    if (rifleId) {
        query = query.eq('rifle_id', rifleId);
    } else {
        query = query.is('rifle_id', null);
    }
    return query.order('updated_at', { ascending: false })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

BallisticDB.prototype.deleteConversation = function (id) {
    var self = this;
    return self.supabase.from('ai_conversations').delete()
        .eq('id', id).eq('user_id', self.userId)
        .then(function (res) {
            if (res.error) throw res.error;
        });
};

// ── AI Usage Logging ──────────────────────────────────────────

BallisticDB.prototype.addUsageLog = function (data) {
    var self = this;
    var log = {
        id: generateUUID(),
        rifleId: data.rifleId || null,
        questionPreview: data.questionPreview || '',
        inputTokens: data.inputTokens || 0,
        outputTokens: data.outputTokens || 0,
        estimatedCost: data.estimatedCost || 0,
        createdAt: new Date().toISOString()
    };
    var row = _jsToRow(log, self.userId);
    return self.supabase.from('ai_usage_logs').insert(row).select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

// ── Admin RPC Methods (admin-only, bypass RLS) ────────────────

BallisticDB.prototype.adminGetStats = function () {
    return this.supabase.rpc('admin_get_stats').then(function (res) {
        if (res.error) throw res.error;
        return res.data;
    });
};

BallisticDB.prototype.adminGetUsers = function () {
    return this.supabase.rpc('admin_get_users').then(function (res) {
        if (res.error) throw res.error;
        return res.data || [];
    });
};

BallisticDB.prototype.adminGetUsageSummary = function () {
    return this.supabase.rpc('admin_get_usage_summary').then(function (res) {
        if (res.error) throw res.error;
        return res.data;
    });
};

BallisticDB.prototype.adminExportAll = function () {
    return this.supabase.rpc('admin_export_all').then(function (res) {
        if (res.error) throw res.error;
        return res.data;
    });
};

/**
 * Crowd Data Warehouse rows (admin-only). Unlike the legacy admin_*
 * RPCs, crowd_get_data() verifies the caller SERVER-SIDE against the
 * admin_users table and raises for anyone else. Rows are anonymized
 * (opaque shooter_key, no emails/notes/filenames) and stay snake_case
 * — they are export data, not app entities.
 */
BallisticDB.prototype.crowdGetData = function () {
    return this.supabase.rpc('crowd_get_data').then(function (res) {
        if (res.error) throw res.error;
        return res.data || [];
    });
};

// ── Account deletion ───────────────────────────────────────────

/**
 * Permanently delete the CALLER's account: every table row, all Storage
 * images, and the auth user itself — via the delete_my_account()
 * SECURITY DEFINER RPC (parameterless; acts only on auth.uid()).
 * Signs out afterwards. Irreversible.
 */
BallisticDB.prototype.deleteMyAccount = function () {
    var self = this;
    return self.supabase.rpc('delete_my_account').then(function (res) {
        if (res.error) throw res.error;
        // Auth row is gone — clear the local session too
        return self.supabase.auth.signOut().catch(function () {
            // Already-invalid session errors are fine
        });
    });
};

// ── User settings (Supabase-synced, localStorage write-through) ──
// Cross-device key/value store (tool activations, onboarding state).
// Reads fall back to the local cache offline; writes go to both.

BallisticDB.prototype.setUserSetting = function (key, value) {
    var self = this;
    try {
        localStorage.setItem('yort_us_' + key, JSON.stringify(value));
    } catch (e) { /* cache best-effort */ }
    var row = {
        user_id: self.userId,
        key: key,
        value: value,
        updated_at: new Date().toISOString()
    };
    return self.supabase.from('user_settings')
        .upsert(row, { onConflict: 'user_id,key' })
        .then(function (res) {
            if (res.error) throw res.error;
            return value;
        });
};

BallisticDB.prototype.getUserSetting = function (key) {
    var self = this;
    function cached() {
        try {
            var raw = localStorage.getItem('yort_us_' + key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }
    if (typeof OfflineCache !== 'undefined' && !OfflineCache.isOnline()) {
        return Promise.resolve(cached());
    }
    return self.supabase.from('user_settings').select('value')
        .eq('user_id', self.userId).eq('key', key)
        .maybeSingle()
        .then(function (res) {
            if (res.error) throw res.error;
            var value = res.data ? res.data.value : null;
            try {
                if (value !== null) localStorage.setItem('yort_us_' + key, JSON.stringify(value));
            } catch (e) { /* cache best-effort */ }
            return value;
        })
        .catch(function (err) {
            console.warn('[DB] getUserSetting failed, using cache:', err);
            return cached();
        });
};

// ── Settings (localStorage fallback) ──────────────────────────

BallisticDB.prototype.setSetting = function (key, value) {
    try {
        localStorage.setItem('yort_' + key, JSON.stringify(value));
    } catch (e) {
        console.error('[DB] setSetting failed:', e);
    }
    return Promise.resolve({ key: key, value: value });
};

BallisticDB.prototype.getSetting = function (key) {
    try {
        var raw = localStorage.getItem('yort_' + key);
        return Promise.resolve(raw ? JSON.parse(raw) : null);
    } catch (e) {
        return Promise.resolve(null);
    }
};

BallisticDB.prototype.deleteSetting = function (key) {
    localStorage.removeItem('yort_' + key);
    return Promise.resolve();
};

// ═════════════════════════════════════════════════════════════
// v2.3 Range-Day Reorg — ADDITIVE CRUD ONLY below this line.
// New tables from REORG-migrations.sql. Nothing above changed
// (STANDARDS.md: db.js is additive-only from v2.3 forward).
// ═════════════════════════════════════════════════════════════

// ── Suppressor library CRUD (§1.3b) ───────────────────────────

BallisticDB.prototype.addSuppressor = function (data) {
    var self = this;
    var record = {
        id: generateUUID(),
        name: data.name,
        brand: data.brand || null,
        model: data.model || null,
        lengthIn: typeof data.lengthIn === 'number' ? data.lengthIn : null,
        weightOz: typeof data.weightOz === 'number' ? data.weightOz : null,
        notes: data.notes || '',
        createdAt: new Date().toISOString()
    };
    var row = _jsToRow(record, self.userId);
    return self.supabase.from('suppressors').insert(row).select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

BallisticDB.prototype.getSuppressors = function () {
    var self = this;
    return self.supabase.from('suppressors').select()
        .eq('user_id', self.userId)
        .order('created_at', { ascending: true })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

BallisticDB.prototype.updateSuppressor = function (record) {
    var self = this;
    var row = _jsToRow(record, self.userId);
    return self.supabase.from('suppressors').update(row)
        .eq('id', record.id).eq('user_id', self.userId)
        .select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

BallisticDB.prototype.deleteSuppressor = function (id) {
    var self = this;
    return self.supabase.from('suppressors').delete()
        .eq('id', id).eq('user_id', self.userId)
        .then(function (res) {
            if (res.error) throw res.error;
        });
};

// ── Phase B fact envelope (Amendment 1 Part B — PHASEB-migrations.sql) ──
//
// Best-effort mirror of an already-provenance-aware write into the
// unified fact_events envelope. NEVER blocks or fails the caller's
// primary write/promise — a fact_events failure is logged and
// swallowed here. source_table + source_row_id is the idempotency key
// (also used by PHASEB-migrations.sql's backfill script), so a retried
// offline-queue flush can never double-write the same fact twice.
//
// savedRow must be the already-_rowToJs'd result of the primary insert
// (so it carries a real id). eventTime/provenance are read from the
// row's own known field names where present; callers that need a
// specific value pass opts to override.
BallisticDB.prototype._writeFactEvent = function (eventType, sourceTable, savedRow, opts) {
    var self = this;
    opts = opts || {};
    var envelope = {
        id: generateUUID(),
        rifleId: typeof opts.rifleId !== 'undefined' ? opts.rifleId : (savedRow.rifleId || null),
        eventType: eventType,
        schemaVersion: 1,
        eventTime: opts.eventTime || savedRow.date || savedRow.appliedAt || savedRow.sessionDate ||
            savedRow.createdAt || new Date().toISOString(),
        provenance: opts.provenance || 'manual',
        sourceTable: sourceTable,
        sourceRowId: savedRow.id,
        eligibility: 'eligible',
        syncState: 'synced',
        payload: savedRow
    };
    var row = _jsToRow(envelope, self.userId);
    return self.supabase.from('fact_events').insert(row).select().single()
        .then(function (res) {
            if (res.error && res.error.code !== '23505') { // unique_violation = already mirrored
                console.warn('[db] fact_events dual-write failed for ' + sourceTable + '/' + savedRow.id + ':', res.error.message);
            }
        })
        .catch(function (err) {
            console.warn('[db] fact_events dual-write threw for ' + sourceTable + '/' + savedRow.id + ':', err);
        });
};

// ── Calibration event CRUD (§2.10 — append-only, Part 0.6 #2) ──

BallisticDB.prototype.addZeroEvent = function (data) {
    var self = this;
    var record = {
        id: generateUUID(),
        rifleId: data.rifleId,
        loadId: data.loadId || null,
        sessionId: data.sessionId || null,
        date: data.date || new Date().toISOString(),
        distanceYards: typeof data.distanceYards === 'number' ? data.distanceYards : null,
        shotCount: typeof data.shotCount === 'number' ? data.shotCount : null,
        groupData: data.groupData || null,
        suppressorId: data.suppressorId || null,
        lotNumber: data.lotNumber || null,
        // Amendment 1 Phase C: which barrel epoch this zero belongs to
        // (PHASECD-migrations.sql, additive, nullable) -- see
        // js/config-memory.js's checkCompatibility, which needs this to
        // know a barrel change has invalidated a prior zero.
        barrelId: data.barrelId || null,
        source: data.source || 'session',
        createdAt: new Date().toISOString()
    };
    var row = _jsToRow(record, self.userId);
    return _insertGracefulRow(self.supabase, 'zero_events', row, ['barrel_id'], true)
        .then(function (res) {
            var saved = _rowToJs(res.data);
            self._writeFactEvent('zero', 'zero_events', saved, { provenance: saved.source || 'legacy/unknown' });
            return saved;
        });
};

BallisticDB.prototype.getZeroEventsByRifle = function (rifleId) {
    var self = this;
    return self.supabase.from('zero_events').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId)
        .order('date', { ascending: false })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

// v3.0 §3.2: the record view's Delete — a single append-only EVENT
// stays deletable by the user who logged it (Part 0.6 principle #5,
// "explicit account/record deletion is user-initiated"); it just never
// happens automatically.
BallisticDB.prototype.deleteZeroEvent = function (id) {
    var self = this;
    return self.supabase.from('zero_events').delete()
        .eq('id', id).eq('user_id', self.userId)
        .then(function (res) {
            if (res.error) throw res.error;
        });
};

BallisticDB.prototype.addMvMeasurement = function (data) {
    var self = this;
    var record = {
        id: generateUUID(),
        rifleId: data.rifleId,
        loadId: data.loadId || null,
        velocityStringId: data.velocityStringId || null,
        date: data.date || new Date().toISOString(),
        value: data.value,
        sd: typeof data.sd === 'number' ? data.sd : null,
        es: typeof data.es === 'number' ? data.es : null,
        shotCount: typeof data.shotCount === 'number' ? data.shotCount : null,
        lotNumber: data.lotNumber || null,
        suppressorId: data.suppressorId || null,
        // Amendment 1 Phase C: see addZeroEvent's comment -- same additive column.
        barrelId: data.barrelId || null,
        source: data.source || 'manual',
        createdAt: new Date().toISOString()
    };
    var row = _jsToRow(record, self.userId);
    return _insertGracefulRow(self.supabase, 'mv_measurements', row, ['barrel_id'], true)
        .then(function (res) {
            var saved = _rowToJs(res.data);
            self._writeFactEvent('velocity', 'mv_measurements', saved, { provenance: saved.source || 'legacy/unknown' });
            return saved;
        });
};

BallisticDB.prototype.getMvMeasurementsByRifle = function (rifleId) {
    var self = this;
    return self.supabase.from('mv_measurements').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId)
        .order('date', { ascending: false })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

BallisticDB.prototype.deleteMvMeasurement = function (id) {
    var self = this;
    return self.supabase.from('mv_measurements').delete()
        .eq('id', id).eq('user_id', self.userId)
        .then(function (res) {
            if (res.error) throw res.error;
        });
};

BallisticDB.prototype.addTrackingVerification = function (data) {
    var self = this;
    var record = {
        id: generateUUID(),
        rifleId: data.rifleId,
        date: data.date || new Date().toISOString(),
        factor: data.factor,
        clickValue: typeof data.clickValue === 'number' ? data.clickValue : null,
        cantWarn: typeof data.cantWarn === 'boolean' ? data.cantWarn : null,
        method: data.method || 'tall-target',
        createdAt: new Date().toISOString()
    };
    var row = _jsToRow(record, self.userId);
    return self.supabase.from('tracking_verifications').insert(row).select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            var saved = _rowToJs(res.data);
            self._writeFactEvent('tracking_verification', 'tracking_verifications', saved, { provenance: 'measured' });
            return saved;
        });
};

BallisticDB.prototype.getTrackingVerificationsByRifle = function (rifleId) {
    var self = this;
    return self.supabase.from('tracking_verifications').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId)
        .order('date', { ascending: false })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

// ── Truing event CRUD (§2.5 — append-only) ────────────────────

BallisticDB.prototype.addTruingEvent = function (data) {
    var self = this;
    var record = {
        id: generateUUID(),
        rifleId: data.rifleId,
        loadId: data.loadId || null,
        mode: data.mode,
        stage: data.stage,
        close: data.close || null,
        far: data.far || null,
        inputs: data.inputs || null,
        ledger: data.ledger || null,
        supersonicPct: typeof data.supersonicPct === 'number' ? data.supersonicPct : null,
        correctionType: data.correctionType,
        oldValue: typeof data.oldValue === 'number' ? data.oldValue : null,
        newValue: typeof data.newValue === 'number' ? data.newValue : null,
        confidence: data.confidence || null,
        appliedAt: data.appliedAt || new Date().toISOString(),
        // Amendment 1 Phase C: see addZeroEvent's comment -- same additive column.
        barrelId: data.barrelId || null,
        createdAt: new Date().toISOString()
    };
    var row = _jsToRow(record, self.userId);
    return _insertGracefulRow(self.supabase, 'truing_events', row, ['barrel_id'], true)
        .then(function (res) {
            var saved = _rowToJs(res.data);
            self._writeFactEvent('truing', 'truing_events', saved, { provenance: 'derived', eventTime: saved.appliedAt });
            return saved;
        });
};

BallisticDB.prototype.getTruingEventsByRifle = function (rifleId) {
    var self = this;
    return self.supabase.from('truing_events').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId)
        .order('applied_at', { ascending: false })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

// Table -> Phase B fact-event mapping for the offline-flush path below.
// flushQueuedRow upserts directly (bypassing addZeroEvent etc. and
// their inline _writeFactEvent calls entirely), so an offline-queued-
// then-flushed fact would never reach fact_events without this —
// same 8 tables as the online dual-write, same event types/provenance.
var FLUSH_FACT_EVENT_MAP = {
    zero_events: { eventType: 'zero', provenanceField: 'source' },
    mv_measurements: { eventType: 'velocity', provenanceField: 'source' },
    tracking_verifications: { eventType: 'tracking_verification', provenance: 'measured' },
    truing_events: { eventType: 'truing', provenance: 'derived' },
    steel_strings: { eventType: 'steel_string', provenance: 'manual' },
    steel_shots: { eventType: 'steel_shot', provenance: 'manual', needsRifleLookup: true },
    cleaning_logs: { eventType: 'cleaning', provenance: 'manual' },
    scope_adjustments: { eventType: 'scope_adjustment', provenance: 'manual' }
};

/** Best-effort, fire-and-forget — see FLUSH_FACT_EVENT_MAP above. */
BallisticDB.prototype._flushFactEventIfMapped = function (table, saved) {
    var self = this;
    var mapping = FLUSH_FACT_EVENT_MAP[table];
    if (!mapping) return;
    var provenance = mapping.provenance || saved[mapping.provenanceField] || 'legacy/unknown';
    if (mapping.needsRifleLookup) {
        self.supabase.from('steel_strings').select('rifle_id').eq('id', saved.stringId).single()
            .then(function (r) {
                self._writeFactEvent(mapping.eventType, table, saved,
                    { provenance: provenance, rifleId: r && r.data ? r.data.rifle_id : null });
            })
            .catch(function () {
                self._writeFactEvent(mapping.eventType, table, saved, { provenance: provenance, rifleId: null });
            });
    } else {
        self._writeFactEvent(mapping.eventType, table, saved, { provenance: provenance });
    }
};

// ── Offline sync support (js/sync-queue.js) ───────────────────
// The ONE generic write the flush path uses: upsert a queued row by
// its client UUID. Client wins by definition (Part 0.6 #1 — the
// device is the source of truth; server data never overwrites
// unsynced local work).

BallisticDB.prototype.flushQueuedRow = function (table, record) {
    var self = this;
    var row = _jsToRow(record, self.userId);
    delete row._pending;
    return self.supabase.from(table).upsert(row, { onConflict: 'id' })
        .select().single()
        .then(function (res) {
            if (res.error) {
                // An offline-queued session bypasses addSession's whitelist
                // (it upserts the raw queued payload) — apply the same
                // missing-snapshot-column grace on reconnect (v2.5 §3.2).
                if (table === 'sessions' && _isMissingColumnError(res.error)) {
                    console.warn('[db] queued session missing snapshot columns — ' +
                        'run SIMPLE-migrations.sql. Flushing without them for now:', res.error.message);
                    var snapshotCols = SESSION_SNAPSHOT_FIELDS.map(_toSnake);
                    var stripped = {};
                    for (var k in row) {
                        if (row.hasOwnProperty(k) && snapshotCols.indexOf(k) === -1) stripped[k] = row[k];
                    }
                    return self.supabase.from(table).upsert(stripped, { onConflict: 'id' })
                        .select().single()
                        .then(function (res2) {
                            if (res2.error) throw res2.error;
                            var saved2 = _rowToJs(res2.data);
                            self._flushFactEventIfMapped(table, saved2);
                            return saved2;
                        });
                }
                throw res.error;
            }
            var saved = _rowToJs(res.data);
            self._flushFactEventIfMapped(table, saved);
            return saved;
        });
};

// ── Steel Session CRUD (§2.2) ─────────────────────────────────

BallisticDB.prototype.addSteelString = function (data) {
    var self = this;
    var record = {
        id: data.id || generateUUID(),
        rifleId: data.rifleId,
        loadId: data.loadId || null,
        sessionDate: data.sessionDate || new Date().toISOString(),
        distanceYd: data.distanceYd,
        tier: data.tier || 'full',
        dialedElev: typeof data.dialedElev === 'number' ? data.dialedElev : 0,
        dialedWind: typeof data.dialedWind === 'number' ? data.dialedWind : 0,
        units: data.units || 'MOA',
        wind: data.wind || null,
        directionOfFireDeg: typeof data.directionOfFireDeg === 'number' ? data.directionOfFireDeg : null,
        dofSource: data.dofSource || null,
        environment: data.environment || null,
        suppressorId: data.suppressorId || null,
        lotNumber: data.lotNumber || null,
        // Amendment 1 Phase C: see addZeroEvent's comment -- same additive column.
        barrelId: data.barrelId || null,
        photoRef: data.photoRef || null,
        notes: data.notes || '',
        createdAt: new Date().toISOString()
    };
    var row = _jsToRow(record, self.userId);
    return _insertGracefulRow(self.supabase, 'steel_strings', row, ['barrel_id'], true)
        .then(function (res) {
            var saved = _rowToJs(res.data);
            self._writeFactEvent('steel_string', 'steel_strings', saved, { provenance: 'manual' });
            return saved;
        });
};

BallisticDB.prototype.getSteelStringsByRifle = function (rifleId) {
    var self = this;
    return self.supabase.from('steel_strings').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId)
        .order('session_date', { ascending: false })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

BallisticDB.prototype.addSteelShot = function (data) {
    var self = this;
    var record = {
        id: data.id || generateUUID(),
        stringId: data.stringId,
        seq: data.seq,
        elevOff: typeof data.elevOff === 'number' ? data.elevOff : 0,
        windOff: typeof data.windOff === 'number' ? data.windOff : 0,
        units: data.units || 'MOA',
        heldElev: typeof data.heldElev === 'number' ? data.heldElev : 0,
        heldWind: typeof data.heldWind === 'number' ? data.heldWind : 0,
        mvFps: typeof data.mvFps === 'number' ? data.mvFps : null,
        mvSource: data.mvSource || null,
        windOverride: data.windOverride || null,
        createdAt: new Date().toISOString()
    };
    var row = _jsToRow(record, self.userId);
    return self.supabase.from('steel_shots').insert(row).select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            var saved = _rowToJs(res.data);
            // steel_shots carries no rifle_id column directly — best-effort
            // lookup through the parent string, fire-and-forget (never
            // blocks this save; mirrors PHASEB-migrations.sql's backfill
            // join for the same table).
            self.supabase.from('steel_strings').select('rifle_id').eq('id', saved.stringId).single()
                .then(function (strRes) {
                    var rifleId = (strRes && strRes.data) ? strRes.data.rifle_id : null;
                    self._writeFactEvent('steel_shot', 'steel_shots', saved, { provenance: 'manual', rifleId: rifleId });
                })
                .catch(function () {
                    self._writeFactEvent('steel_shot', 'steel_shots', saved, { provenance: 'manual', rifleId: null });
                });
            return saved;
        });
};

BallisticDB.prototype.getSteelShotsByString = function (stringId) {
    var self = this;
    return self.supabase.from('steel_shots').select()
        .eq('user_id', self.userId).eq('string_id', stringId)
        .order('seq', { ascending: true })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

BallisticDB.prototype.updateSteelShot = function (record) {
    var self = this;
    var row = _jsToRow(record, self.userId);
    return self.supabase.from('steel_shots').update(row)
        .eq('id', record.id).eq('user_id', self.userId)
        .select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

// v3.0 §3.2: the record view's Delete for a steel string — cascades
// its shots first (a string with orphaned shots would still read back
// fine since shots are always queried scoped to string_id, but leaving
// them around is just clutter, not a hazard either way).
BallisticDB.prototype.deleteSteelString = function (id) {
    var self = this;
    return self.supabase.from('steel_shots').delete()
        .eq('string_id', id).eq('user_id', self.userId)
        .then(function (res) {
            if (res.error) throw res.error;
            return self.supabase.from('steel_strings').delete()
                .eq('id', id).eq('user_id', self.userId);
        }).then(function (res) {
            if (res.error) throw res.error;
        });
};

/** Casual-tier steel photo → Storage (same bucket + rules as
 *  session images; steel_ prefix). Failure never blocks a save. */
BallisticDB.prototype.saveSteelPhoto = function (stringId, blob) {
    var self = this;
    var path = self.userId + '/steel_' + stringId + '.jpg';
    return self.supabase.storage.from('session-images')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
        .then(function (res) {
            if (res.error) throw res.error;
            self._registerAttachmentHash('steel_image', blob, path, 'steel_strings', stringId);
            return path;
        });
};

// ═════════════════════════════════════════════════════════════
// Amendment 1 Phase C — carry-forward memory + minimal invalidation.
// PHASECD-migrations.sql adds config_epochs and recurring_targets.
// See js/config-memory.js for the pure derivation/compatibility core
// these tables feed.
// ═════════════════════════════════════════════════════════════

// ── Config epochs (suppressor/lot CHANGE events, not every use) ──
// Amendment 1 A2: "ammunition/lot" and configuration change are
// lifecycle facts, equally canonical inputs. Append-only: "current" is
// derived (js/config-memory.js's deriveCurrentState) from whichever row
// per (rifle, kind) has the latest started_at -- never an UPDATE here.

BallisticDB.prototype.addConfigEpoch = function (data) {
    var self = this;
    var record = {
        id: generateUUID(),
        rifleId: data.rifleId,
        kind: data.kind, // 'suppressor' | 'lot'
        value: (data.value === undefined) ? null : data.value,
        startedAt: data.startedAt || new Date().toISOString(),
        source: data.source || 'manual',
        createdAt: new Date().toISOString()
    };
    var row = _jsToRow(record, self.userId);
    return self.supabase.from('config_epochs').insert(row).select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            var saved = _rowToJs(res.data);
            self._writeFactEvent('config_change', 'config_epochs', saved,
                { provenance: saved.source || 'manual', eventTime: saved.startedAt });
            return saved;
        });
};

BallisticDB.prototype.getConfigEpochsByRifle = function (rifleId, kind) {
    var self = this;
    var q = self.supabase.from('config_epochs').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId);
    if (kind) q = q.eq('kind', kind);
    return q.order('started_at', { ascending: false })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

/**
 * Recognition-confirmed lot change (Phase C: "recognition confirms
 * replace questions" -- e.g. "Still shooting the Hornady 143s?" / "New
 * lot"). Writes the append-only epoch AND keeps the fast-read cache
 * (loads.lotNumber, what calibration-status.js's `currentLot` input and
 * every capture screen already reads) in sync -- config_epochs is the
 * history that makes the compatibility service and freshness checks
 * possible; loads.lotNumber stays the cheap current-value read.
 * A no-op when the answer was "still this lot" (nothing changed, so
 * nothing is written -- an epoch record must mean a real change).
 */
BallisticDB.prototype.changeLot = function (rifleId, loadId, newLot) {
    var self = this;
    return self.getLoad(loadId).then(function (load) {
        if (load && (load.lotNumber || null) === (newLot || null)) {
            return load;
        }
        return self.addConfigEpoch({ rifleId: rifleId, kind: 'lot', value: newLot || null, source: 'manual' })
            .then(function () {
                if (!load) return null;
                load.lotNumber = newLot || null;
                return self.updateLoad(load);
            });
    });
};

// ── Recurring targets (Constitution §35.5 -- remembered places) ──
// "If a shooter repeatedly uses the same 900-yard or 1,000-yard steel
// at a known range, PROVEN should remember: target identity, distance,
// azimuth... target size; and prior observations." v1 scope: distance +
// optional azimuth/label, ranked by recency then use count (Phase C:
// "switcher ranked by recency"). Cross-device (a real table, not the
// device-local yort_steel_last convenience key rifle-add.js already
// keeps -- that stays as an instant-offline last-value fallback).

BallisticDB.prototype.addRecurringTargetUse = function (rifleId, distanceYd, opts) {
    var self = this;
    opts = opts || {};
    if (!rifleId || typeof distanceYd !== 'number' || distanceYd <= 0) return Promise.resolve(null);
    var now = new Date().toISOString();
    return self.supabase.from('recurring_targets').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId).eq('distance_yd', distanceYd)
        .maybeSingle()
        .then(function (res) {
            if (res.error) throw res.error;
            if (res.data) {
                var existing = _rowToJs(res.data);
                var row = _jsToRow({
                    id: existing.id,
                    useCount: (existing.useCount || 1) + 1,
                    lastUsedAt: now,
                    azimuthDeg: (typeof opts.azimuthDeg === 'number') ? opts.azimuthDeg : (existing.azimuthDeg || null),
                    label: opts.label || existing.label || null
                }, self.userId);
                return self.supabase.from('recurring_targets').update(row)
                    .eq('id', existing.id).eq('user_id', self.userId)
                    .select().single();
            }
            var record = {
                id: generateUUID(), rifleId: rifleId, distanceYd: distanceYd,
                azimuthDeg: typeof opts.azimuthDeg === 'number' ? opts.azimuthDeg : null,
                label: opts.label || null, useCount: 1, lastUsedAt: now, createdAt: now
            };
            var newRow = _jsToRow(record, self.userId);
            return self.supabase.from('recurring_targets').insert(newRow).select().single();
        })
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

/** Ranked by recency then use count -- Phase C: "switcher ranked by recency." */
BallisticDB.prototype.getRecurringTargets = function (rifleId) {
    var self = this;
    return self.supabase.from('recurring_targets').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId)
        .order('last_used_at', { ascending: false })
        .order('use_count', { ascending: false })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

// ═════════════════════════════════════════════════════════════
// Amendment 1 Phase D — troubleshooting ladder (Validation Doctrine §7).
// One row IS the alarm trigger (step: 'alarm', result: 'alarm', written
// by rifle-payoff.js's validation gate the moment a spot-check reads
// 'alarm'); subsequent rows are the ladder steps themselves (zero,
// mount, velocity, builder), each an append-only fact -- never edited,
// never deleted, per the Validation Doctrine's own "recording each
// check as a fact." js/validation-status.js's deriveTroubleshootingHold
// derives current hold state from the latest 'alarm' row plus every
// row after it.
// ═════════════════════════════════════════════════════════════

BallisticDB.prototype.addTroubleshootingCheck = function (data) {
    var self = this;
    var record = {
        id: generateUUID(),
        rifleId: data.rifleId,
        step: data.step,       // 'alarm' | 'zero' | 'mount' | 'velocity' | 'builder'
        result: data.result,   // 'alarm' | 'ok' | 'issue_found' | 'resolved'
        notes: data.notes || null,
        createdAt: new Date().toISOString()
    };
    var row = _jsToRow(record, self.userId);
    return self.supabase.from('troubleshooting_checks').insert(row).select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            var saved = _rowToJs(res.data);
            self._writeFactEvent('troubleshooting_check', 'troubleshooting_checks', saved, { provenance: 'manual' });
            return saved;
        });
};

BallisticDB.prototype.getTroubleshootingChecksByRifle = function (rifleId) {
    var self = this;
    return self.supabase.from('troubleshooting_checks').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId)
        .order('created_at', { ascending: true })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

// ── Export parity (overnight run #2, item 3) ───────────────────
// Account-wide getters (no rifle_id filter) for the fact spine and
// vault-first import metadata, so "Export everything" (js/data-export.js)
// can include them alongside the pre-existing per-rifle exports. Same
// convention as getAllRifles/getAllSessions/getAllVelocityStrings above.

BallisticDB.prototype.getAllFactEvents = function () {
    var self = this;
    return self.supabase.from('fact_events').select()
        .eq('user_id', self.userId)
        .order('event_time', { ascending: true })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

// attachment_vault never stores file bytes (P2's own schema — hash,
// path, size, kind, status only), so this IS the metadata already;
// nothing to strip before export.
BallisticDB.prototype.getAllAttachmentVault = function () {
    var self = this;
    return self.supabase.from('attachment_vault').select()
        .eq('user_id', self.userId)
        .order('created_at', { ascending: true })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

BallisticDB.prototype.getAllTroubleshootingChecks = function () {
    var self = this;
    return self.supabase.from('troubleshooting_checks').select()
        .eq('user_id', self.userId)
        .order('created_at', { ascending: true })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

BallisticDB.prototype.getAllConfigEpochs = function () {
    var self = this;
    return self.supabase.from('config_epochs').select()
        .eq('user_id', self.userId)
        .order('created_at', { ascending: true })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

// ═════════════════════════════════════════════════════════════
// Amendment 1 Phase E — per-shot residual engine, SHADOW STAGE ONLY.
// js/residual-engine.js computes; this ONLY logs the output. Nothing
// in this codebase reads residual_shadow_log back (E-SHADOW-SPEC.md
// §9) -- that is the literal enforcement of "shadow." Best-effort,
// fire-and-forget: a logging failure must never surface to the
// shooter or affect the real save it rides alongside.
// ═════════════════════════════════════════════════════════════

BallisticDB.prototype.logResidualShadow = function (data) {
    var self = this;
    var record = {
        id: generateUUID(),
        rifleId: data.rifleId,
        loadId: data.loadId || null,
        rangeYds: data.rangeYds,
        engineVersion: data.engineVersion || '1.0.0',
        output: data.output,
        createdAt: new Date().toISOString()
    };
    var row = _jsToRow(record, self.userId);
    return _insertGracefulRow(self.supabase, 'residual_shadow_log', row, [], true)
        .then(function (res) { return _rowToJs(res.data); })
        .catch(function (err) {
            console.warn('[db] residual_shadow_log write failed (shadow-only, no impact):', err);
        });
};
