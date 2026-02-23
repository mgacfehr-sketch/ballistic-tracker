/**
 * db.js — IndexedDB wrapper for all Ballistic Tracker entities.
 *
 * Promise-based CRUD operations for: Rifle, Barrel, Load, Session,
 * ZeroRecord, ScopeAdjustment, CleaningLog.
 *
 * Usage:
 *   var db = new BallisticDB();
 *   db.open().then(function() { ... });
 */

var DB_NAME = 'ballistic-tracker';
var DB_VERSION = 3;
var MAX_RIFLES = 50;

function BallisticDB() {
    this.db = null;
}

/**
 * Open (or create) the database. Must be called before any other method.
 * @returns {Promise<void>}
 */
BallisticDB.prototype.open = function () {
    var self = this;
    return new Promise(function (resolve, reject) {
        if (self.db) { resolve(); return; }

        var request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = function (e) {
            var db = e.target.result;

            try {
                // Rifles
                if (!db.objectStoreNames.contains('rifles')) {
                    db.createObjectStore('rifles', { keyPath: 'id' });
                }

                // Barrels
                if (!db.objectStoreNames.contains('barrels')) {
                    var barrelStore = db.createObjectStore('barrels', { keyPath: 'id' });
                    barrelStore.createIndex('rifleId', 'rifleId', { unique: false });
                }

                // Loads
                if (!db.objectStoreNames.contains('loads')) {
                    var loadStore = db.createObjectStore('loads', { keyPath: 'id' });
                    loadStore.createIndex('rifleId', 'rifleId', { unique: false });
                }

                // Sessions
                if (!db.objectStoreNames.contains('sessions')) {
                    var sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
                    sessionStore.createIndex('rifleId', 'rifleId', { unique: false });
                    sessionStore.createIndex('loadId', 'loadId', { unique: false });
                    sessionStore.createIndex('barrelId', 'barrelId', { unique: false });
                }

                // Zero Records
                if (!db.objectStoreNames.contains('zeroRecords')) {
                    var zeroStore = db.createObjectStore('zeroRecords', { keyPath: 'id' });
                    zeroStore.createIndex('rifleId', 'rifleId', { unique: false });
                    zeroStore.createIndex('loadId', 'loadId', { unique: false });
                }

                // Scope Adjustments
                if (!db.objectStoreNames.contains('scopeAdjustments')) {
                    var scopeStore = db.createObjectStore('scopeAdjustments', { keyPath: 'id' });
                    scopeStore.createIndex('rifleId', 'rifleId', { unique: false });
                }

                // Cleaning Logs
                if (!db.objectStoreNames.contains('cleaningLogs')) {
                    var cleanStore = db.createObjectStore('cleaningLogs', { keyPath: 'id' });
                    cleanStore.createIndex('rifleId', 'rifleId', { unique: false });
                    cleanStore.createIndex('barrelId', 'barrelId', { unique: false });
                }

                // Session Images (annotated export images)
                if (!db.objectStoreNames.contains('sessionImages')) {
                    db.createObjectStore('sessionImages', { keyPath: 'sessionId' });
                }

                // Settings (API keys, preferences)
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            } catch (err) {
                console.error('DB upgrade failed:', err);
                if (e.target.transaction) {
                    e.target.transaction.abort();
                }
            }
        };

        request.onblocked = function () {
            reject(new Error('Database upgrade blocked — close other tabs and reload'));
        };

        request.onsuccess = function (e) {
            self.db = e.target.result;
            self.db.onversionchange = function () {
                self.db.close();
                self.db = null;
            };
            resolve();
        };

        request.onerror = function (e) {
            reject(new Error('IndexedDB open failed: ' + e.target.error));
        };
    });
};

// ── Generic helpers ────────────────────────────────────────────

BallisticDB.prototype._tx = function (storeName, mode) {
    var tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
};

BallisticDB.prototype._put = function (storeName, record) {
    var self = this;
    return new Promise(function (resolve, reject) {
        var store = self._tx(storeName, 'readwrite');
        var req = store.put(record);
        req.onsuccess = function () { resolve(record); };
        req.onerror = function (e) { reject(e.target.error); };
    });
};

BallisticDB.prototype._get = function (storeName, id) {
    var self = this;
    return new Promise(function (resolve, reject) {
        var store = self._tx(storeName, 'readonly');
        var req = store.get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function (e) { reject(e.target.error); };
    });
};

BallisticDB.prototype._getAll = function (storeName) {
    var self = this;
    return new Promise(function (resolve, reject) {
        var store = self._tx(storeName, 'readonly');
        var req = store.getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function (e) { reject(e.target.error); };
    });
};

BallisticDB.prototype._getAllByIndex = function (storeName, indexName, value) {
    var self = this;
    return new Promise(function (resolve, reject) {
        var store = self._tx(storeName, 'readonly');
        var index = store.index(indexName);
        var req = index.getAll(value);
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function (e) { reject(e.target.error); };
    });
};

BallisticDB.prototype._delete = function (storeName, id) {
    var self = this;
    return new Promise(function (resolve, reject) {
        var store = self._tx(storeName, 'readwrite');
        var req = store.delete(id);
        req.onsuccess = function () { resolve(); };
        req.onerror = function (e) { reject(e.target.error); };
    });
};

BallisticDB.prototype._count = function (storeName) {
    var self = this;
    return new Promise(function (resolve, reject) {
        var store = self._tx(storeName, 'readonly');
        var req = store.count();
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function (e) { reject(e.target.error); };
    });
};

// ── Rifle CRUD ─────────────────────────────────────────────────

BallisticDB.prototype.addRifle = function (data) {
    var self = this;
    return this._count('rifles').then(function (count) {
        if (count >= MAX_RIFLES) {
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
        return self._put('rifles', rifle);
    });
};

BallisticDB.prototype.updateRifle = function (rifle) {
    rifle.updatedAt = new Date().toISOString();
    return this._put('rifles', rifle);
};

BallisticDB.prototype.getRifle = function (id) {
    return this._get('rifles', id);
};

BallisticDB.prototype.getAllRifles = function () {
    return this._getAll('rifles');
};

BallisticDB.prototype.deleteRifle = function (id) {
    var self = this;
    // Cascade: delete all barrels, loads, sessions, zeroRecords,
    // scopeAdjustments, cleaningLogs linked to this rifle
    return Promise.all([
        self._getAllByIndex('barrels', 'rifleId', id),
        self._getAllByIndex('loads', 'rifleId', id),
        self._getAllByIndex('sessions', 'rifleId', id),
        self._getAllByIndex('zeroRecords', 'rifleId', id),
        self._getAllByIndex('scopeAdjustments', 'rifleId', id),
        self._getAllByIndex('cleaningLogs', 'rifleId', id)
    ]).then(function (results) {
        var deletes = [];
        var storeNames = ['barrels', 'loads', 'sessions', 'zeroRecords', 'scopeAdjustments', 'cleaningLogs'];
        for (var s = 0; s < results.length; s++) {
            for (var i = 0; i < results[s].length; i++) {
                deletes.push(self._delete(storeNames[s], results[s][i].id));
                if (storeNames[s] === 'sessions') {
                    deletes.push(self._delete('sessionImages', results[s][i].id).catch(function () {}));
                }
            }
        }
        return Promise.all(deletes);
    }).then(function () {
        return self._delete('rifles', id);
    });
};

// ── Barrel CRUD ────────────────────────────────────────────────

BallisticDB.prototype.addBarrel = function (data) {
    var barrel = {
        id: generateUUID(),
        rifleId: data.rifleId,
        twistRate: data.twistRate || '',
        twistDirection: data.twistDirection || 'Right',
        installDate: data.installDate || new Date().toISOString().split('T')[0],
        isActive: data.isActive !== undefined ? data.isActive : true,
        notes: data.notes || ''
    };
    return this._put('barrels', barrel);
};

BallisticDB.prototype.updateBarrel = function (barrel) {
    return this._put('barrels', barrel);
};

BallisticDB.prototype.getBarrel = function (id) {
    return this._get('barrels', id);
};

BallisticDB.prototype.getBarrelsByRifle = function (rifleId) {
    return this._getAllByIndex('barrels', 'rifleId', rifleId);
};

BallisticDB.prototype.deleteBarrel = function (id) {
    return this._delete('barrels', id);
};

/**
 * Set a barrel as the active barrel for its rifle, deactivating others.
 */
BallisticDB.prototype.setActiveBarrel = function (barrelId, rifleId) {
    var self = this;
    return this.getBarrelsByRifle(rifleId).then(function (barrels) {
        var updates = [];
        for (var i = 0; i < barrels.length; i++) {
            var wasActive = barrels[i].isActive;
            barrels[i].isActive = (barrels[i].id === barrelId);
            if (barrels[i].isActive !== wasActive) {
                updates.push(self._put('barrels', barrels[i]));
            }
        }
        return Promise.all(updates);
    });
};

// ── Load CRUD ──────────────────────────────────────────────────

BallisticDB.prototype.addLoad = function (data) {
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
    return this._put('loads', load);
};

BallisticDB.prototype.updateLoad = function (load) {
    return this._put('loads', load);
};

BallisticDB.prototype.getLoad = function (id) {
    return this._get('loads', id);
};

BallisticDB.prototype.getLoadsByRifle = function (rifleId) {
    return this._getAllByIndex('loads', 'rifleId', rifleId);
};

BallisticDB.prototype.deleteLoad = function (id) {
    return this._delete('loads', id);
};

// ── Session CRUD ───────────────────────────────────────────────

BallisticDB.prototype.addSession = function (data) {
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
    return this._put('sessions', session);
};

BallisticDB.prototype.updateSession = function (session) {
    return this._put('sessions', session);
};

BallisticDB.prototype.getSession = function (id) {
    return this._get('sessions', id);
};

BallisticDB.prototype.getSessionsByRifle = function (rifleId) {
    return this._getAllByIndex('sessions', 'rifleId', rifleId);
};

BallisticDB.prototype.getAllSessions = function () {
    return this._getAll('sessions');
};

/**
 * Get sessions with no rifle association (Quick/Misc mode).
 * IndexedDB indexes don't match null keys, so we fetch all and filter.
 */
BallisticDB.prototype.getMiscSessions = function () {
    return this._getAll('sessions').then(function (sessions) {
        return sessions.filter(function (s) { return !s.rifleId; });
    });
};

BallisticDB.prototype.deleteSession = function (id) {
    var self = this;
    return this._delete('sessionImages', id).catch(function () {}).then(function () {
        return self._delete('sessions', id);
    });
};

// ── Session Images CRUD ────────────────────────────────────────

BallisticDB.prototype.saveSessionImage = function (sessionId, fullBlob, thumbnailBlob) {
    return this._put('sessionImages', {
        sessionId: sessionId,
        fullBlob: fullBlob,
        thumbnailBlob: thumbnailBlob,
        createdAt: new Date().toISOString()
    });
};

BallisticDB.prototype.getSessionImage = function (sessionId) {
    return this._get('sessionImages', sessionId);
};

BallisticDB.prototype.deleteSessionImage = function (sessionId) {
    return this._delete('sessionImages', sessionId);
};

// ── ZeroRecord CRUD ────────────────────────────────────────────

BallisticDB.prototype.addZeroRecord = function (data) {
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
    return this._put('zeroRecords', record);
};

BallisticDB.prototype.getZeroRecordsByRifle = function (rifleId) {
    return this._getAllByIndex('zeroRecords', 'rifleId', rifleId);
};

BallisticDB.prototype.deleteZeroRecord = function (id) {
    return this._delete('zeroRecords', id);
};

// ── ScopeAdjustment CRUD ───────────────────────────────────────

BallisticDB.prototype.addScopeAdjustment = function (data) {
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
    return this._put('scopeAdjustments', adj);
};

BallisticDB.prototype.getScopeAdjustmentsByRifle = function (rifleId) {
    return this._getAllByIndex('scopeAdjustments', 'rifleId', rifleId);
};

BallisticDB.prototype.deleteScopeAdjustment = function (id) {
    return this._delete('scopeAdjustments', id);
};

// ── CleaningLog CRUD ───────────────────────────────────────────

BallisticDB.prototype.addCleaningLog = function (data) {
    var log = {
        id: generateUUID(),
        rifleId: data.rifleId,
        barrelId: data.barrelId,
        date: data.date || new Date().toISOString(),
        roundCountAtCleaning: data.roundCountAtCleaning || 0,
        notes: data.notes || ''
    };
    return this._put('cleaningLogs', log);
};

BallisticDB.prototype.getCleaningLogsByRifle = function (rifleId) {
    return this._getAllByIndex('cleaningLogs', 'rifleId', rifleId);
};

BallisticDB.prototype.getCleaningLogsByBarrel = function (barrelId) {
    return this._getAllByIndex('cleaningLogs', 'barrelId', barrelId);
};

BallisticDB.prototype.deleteCleaningLog = function (id) {
    return this._delete('cleaningLogs', id);
};

// ── Settings CRUD ─────────────────────────────────────────────

BallisticDB.prototype.setSetting = function (key, value) {
    return this._put('settings', {
        key: key,
        value: value,
        updatedAt: new Date().toISOString()
    });
};

BallisticDB.prototype.getSetting = function (key) {
    return this._get('settings', key).then(function (record) {
        return record ? record.value : null;
    });
};

BallisticDB.prototype.deleteSetting = function (key) {
    return this._delete('settings', key);
};
