/**
 * db.js — Supabase wrapper for all Ballistic Tracker entities.
 *
 * Promise-based CRUD operations for: Rifle, Barrel, Load, Session,
 * ZeroRecord, ScopeAdjustment, CleaningLog.
 *
 * Same public API as the original IndexedDB version — all callers
 * (session-flow.js, profiles.js, history.js, ai-assistant.js,
 * ballistic-solver.js) remain unchanged.
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
    return self.supabase.from('rifles').select()
        .eq('id', id).eq('user_id', self.userId)
        .maybeSingle()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

BallisticDB.prototype.getAllRifles = function () {
    var self = this;
    return self.supabase.from('rifles').select()
        .eq('user_id', self.userId)
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
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
            self.supabase.from('dope_entries').delete().eq('rifle_id', id).eq('user_id', self.userId),
            self.supabase.from('cold_bore_shots').delete().eq('rifle_id', id).eq('user_id', self.userId)
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
    return self.supabase.from('barrels').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId)
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(function (r) {
                return _normalizeBarrel(_rowToJs(r));
            });
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
    return self.supabase.from('loads').select()
        .eq('id', id).eq('user_id', self.userId)
        .maybeSingle()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

BallisticDB.prototype.getLoadsByRifle = function (rifleId) {
    var self = this;
    return self.supabase.from('loads').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId)
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
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
        sightInComments: data.sightInComments || '',
        isZeroSession: data.isZeroSession || false,
        createdAt: new Date().toISOString()
    };
    var row = _jsToRow(session, self.userId);
    return self.supabase.from('sessions').insert(row).select().single()
        .then(function (res) {
            if (res.error) throw res.error;
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
            return _rowToJs(res.data);
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
            return _rowToJs(res.data);
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

// ── Dope Entry CRUD ───────────────────────────────────────────

BallisticDB.prototype.addDopeEntry = function (data) {
    var self = this;
    var entry = {
        id: generateUUID(),
        rifleId: data.rifleId,
        loadId: data.loadId || null,
        distanceYards: data.distanceYards || 0,
        elevationMOA: data.elevationMOA || 0,
        windageMOA: data.windageMOA || 0,
        result: data.result || 'hit',
        notes: data.notes || '',
        date: data.date || new Date().toISOString(),
        createdAt: new Date().toISOString()
    };
    var row = _jsToRow(entry, self.userId);
    return self.supabase.from('dope_entries').insert(row).select().single()
        .then(function (res) {
            if (res.error) throw res.error;
            return _rowToJs(res.data);
        });
};

BallisticDB.prototype.getDopeEntries = function (rifleId) {
    var self = this;
    return self.supabase.from('dope_entries').select()
        .eq('user_id', self.userId).eq('rifle_id', rifleId)
        .order('created_at', { ascending: false })
        .then(function (res) {
            if (res.error) throw res.error;
            return (res.data || []).map(_rowToJs);
        });
};

BallisticDB.prototype.deleteDopeEntry = function (id) {
    var self = this;
    return self.supabase.from('dope_entries').delete()
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
