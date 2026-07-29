/**
 * data-export.js — "Export my data" (Part 0.6 #6): your data is
 * yours, made concrete. CSV files per data type + rifle profile
 * summaries, generated CLIENT-SIDE, always available — including to
 * lapsed/free accounts (Part 0.6 #5).
 *
 * CSV encoding lives in js/records-core.js (pure, Node-tested).
 * Delivery prefers Web Share (Capacitor-safe); <a download> fallback.
 */

(function () {
    'use strict';
    if (typeof module !== 'undefined' && module.exports && typeof deriveTroubleshootingHold === 'undefined') {
        global.deriveTroubleshootingHold = require('./validation-status.js').deriveTroubleshootingHold;
    }
})();

var DataExport = (function () {
    'use strict';

    var TYPES = [
        { key: 'rifles', label: 'Rifles', fetch: function (db) { return db.getAllRifles(); } },
        { key: 'loads', label: 'Loads', fetch: function (db) { return _perRifle(db, 'getLoadsByRifle'); } },
        { key: 'sessions', label: 'Sessions (paper)', fetch: function (db) { return db.getAllSessions(); } },
        { key: 'velocity-strings', label: 'Velocity strings', fetch: function (db) { return db.getAllVelocityStrings(); } },
        { key: 'velocity-shots', label: 'Velocity shots (per shot)', fetch: function (db) {
            return db.getAllVelocityStrings().then(function (strings) {
                var out = [];
                (strings || []).forEach(function (s) {
                    (s.shots || []).forEach(function (shot) {
                        out.push({ stringId: s.id, rifleId: s.rifleId, date: s.date,
                            lotNumber: s.lotNumber, shot: shot.shot, fps: shot.fps, time: shot.time });
                    });
                });
                return out;
            });
        } },
        { key: 'steel-strings', label: 'Steel strings', fetch: function (db) {
            return db.getSteelStringsByRifle ? _perRifle(db, 'getSteelStringsByRifle') : Promise.resolve([]);
        } },
        { key: 'steel-shots', label: 'Steel shots (per shot)', fetch: function (db) {
            if (!db.getSteelStringsByRifle) return Promise.resolve([]);
            return _perRifle(db, 'getSteelStringsByRifle').then(function (strings) {
                var chain = Promise.resolve([]);
                (strings || []).forEach(function (s) {
                    chain = chain.then(function (acc) {
                        return db.getSteelShotsByString(s.id).catch(function () { return []; })
                            .then(function (shots) { return acc.concat(shots); });
                    });
                });
                return chain;
            });
        } },
        { key: 'zero-events', label: 'Zero events', fetch: function (db) { return _perRifle(db, 'getZeroEventsByRifle'); } },
        { key: 'mv-measurements', label: 'MV measurements', fetch: function (db) { return _perRifle(db, 'getMvMeasurementsByRifle'); } },
        { key: 'tracking-verifications', label: 'Tracking verifications', fetch: function (db) { return _perRifle(db, 'getTrackingVerificationsByRifle'); } },
        { key: 'truing-history', label: 'Truing history', fetch: function (db) { return _perRifle(db, 'getTruingEventsByRifle'); } },
        { key: 'cold-bore', label: 'Cold bore shots', fetch: function (db) { return _perRifle(db, 'getColdBoreShots'); } },
        { key: 'scope-adjustments', label: 'Scope adjustments', fetch: function (db) { return _perRifle(db, 'getScopeAdjustmentsByRifle'); } },
        { key: 'suppressors', label: 'Suppressors', fetch: function (db) {
            return db.getSuppressors ? db.getSuppressors() : Promise.resolve([]);
        } },
        // Overnight run #2, item 3 — export parity for Amendment 1's
        // Phase B fact spine and Phase C/D memory layer. Same
        // fetch-or-empty-array shape as every type above, so a database
        // the owner hasn't migrated yet degrades to an empty sheet/CSV
        // rather than breaking "Export everything."
        { key: 'fact-events', label: 'Fact events', fetch: function (db) {
            return db.getAllFactEvents ? db.getAllFactEvents() : Promise.resolve([]);
        } },
        { key: 'attachment-vault', label: 'Attachment vault (metadata)', fetch: function (db) {
            return db.getAllAttachmentVault ? db.getAllAttachmentVault() : Promise.resolve([]);
        } },
        { key: 'validation-statuses', label: 'Validation statuses', fetch: function (db) {
            return _validationStatusRows(db);
        } }
    ];

    /** One row per rifle: the SAME derivation validation-status.js's
     *  deriveTroubleshootingHold already uses live (js/rifle-app.js's
     *  resting screen, js/rifle-payoff.js's gate) — never a second,
     *  divergent classification invented for export. Raw
     *  troubleshooting_checks/config_epochs rows are already covered by
     *  their own account-wide export types above; this sheet is the
     *  DERIVED status a shooter would recognize from the app itself. */
    function _validationStatusRows(db) {
        if (!db.getAllRifles) return Promise.resolve([]);
        return db.getAllRifles().then(function (rifles) {
            var chain = Promise.resolve([]);
            (rifles || []).forEach(function (r) {
                chain = chain.then(function (acc) {
                    return Promise.all([
                        db.getTroubleshootingChecksByRifle ? db.getTroubleshootingChecksByRifle(r.id).catch(function () { return []; }) : Promise.resolve([]),
                        db.getConfigEpochsByRifle ? db.getConfigEpochsByRifle(r.id).catch(function () { return []; }) : Promise.resolve([])
                    ]).then(function (res) {
                        var checks = res[0] || [], epochs = res[1] || [];
                        var alarmRows = checks.filter(function (c) { return c && c.step === 'alarm'; })
                            .sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
                        var alarmAt = alarmRows.length ? alarmRows[0].createdAt : null;
                        var ladderChecks = checks.filter(function (c) { return c && c.step !== 'alarm'; })
                            .map(function (c) { return { step: c.step, result: c.result, at: c.createdAt }; });
                        var hold = (typeof deriveTroubleshootingHold === 'function')
                            ? deriveTroubleshootingHold({ alarmAt: alarmAt, checks: ladderChecks })
                            : { inHold: false, ladderStep: null };
                        var lastEpoch = epochs.length ? epochs[epochs.length - 1] : null;
                        acc.push({
                            rifleId: r.id, rifleName: r.name || null,
                            troubleshootingHold: hold.inHold, holdLadderStep: hold.ladderStep || null,
                            lastAlarmAt: alarmAt, troubleshootingCheckCount: checks.length,
                            lastConfigEpochKind: lastEpoch ? lastEpoch.kind : null,
                            lastConfigEpochValue: lastEpoch ? lastEpoch.value : null,
                            lastConfigEpochAt: lastEpoch ? lastEpoch.startedAt : null,
                            configEpochCount: epochs.length
                        });
                        return acc;
                    });
                });
            });
            return chain;
        });
    }

    function _perRifle(db, method) {
        return db.getAllRifles().then(function (rifles) {
            var chain = Promise.resolve([]);
            (rifles || []).forEach(function (r) {
                chain = chain.then(function (acc) {
                    return db[method](r.id).catch(function () { return []; })
                        .then(function (rows) { return acc.concat(rows || []); });
                });
            });
            return chain;
        });
    }

    /** v2.4 §4.2: one workbook, one worksheet per data type, same
     *  columns as the CSVs. SheetJS is already pinned for chrono
     *  import — zero added bundle cost. */
    function _exportWorkbook(db, statusEl) {
        var wb = XLSX.utils.book_new();
        var chain = Promise.resolve();
        TYPES.forEach(function (t) {
            chain = chain.then(function () {
                if (statusEl) statusEl.textContent = 'Building ' + t.label + '…';
                return t.fetch(db).catch(function () { return []; }).then(function (data) {
                    // objects → JSON strings, matching csvEncode's cells
                    var rows = (data || []).map(function (r) {
                        var out = {};
                        for (var k in r) {
                            if (!r.hasOwnProperty(k)) continue;
                            var v = r[k];
                            out[k] = (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
                        }
                        return out;
                    });
                    var ws = XLSX.utils.json_to_sheet(rows);
                    XLSX.utils.book_append_sheet(wb, ws, t.key.slice(0, 31));
                });
            });
        });
        return chain.then(function () {
            var array = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            var blob = new Blob([array], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            _deliverBlob('proven-everything.xlsx', blob);
            if (statusEl) statusEl.textContent = 'Workbook sent — one sheet per data type.';
        }).catch(function (e) {
            if (statusEl) statusEl.textContent = 'Failed: ' + e.message;
        });
    }

    function open(db) {
        var overlay = document.createElement('div');
        overlay.className = 'overlay';
        var rows = '';
        TYPES.forEach(function (t) {
            rows += UI.rowlink({
                button: true, title: t.label, sub: 'CSV', chev: true,
                data: { export: t.key }
            });
        });
        var hasXlsx = typeof XLSX !== 'undefined' && XLSX.utils;
        overlay.innerHTML = '<div class="overlay-card">' +
            '<div class="overlay-title">Export my data</div>' +
            '<p class="overlay-text">Your data is yours. Each export is built on this device — nothing goes anywhere you don\'t send it.</p>' +
            (hasXlsx
                ? '<button class="btn-utility u-full u-mb-12" id="dx-everything">Export everything (.xlsx)</button>' +
                  '<p class="t-micro" id="dx-everything-status" style="margin-bottom:10px"></p>'
                : '') +
            '<div class="card" style="margin:0;max-height:50vh;overflow-y:auto">' + rows + '</div>' +
            '<button class="btn u-full u-mt-10" id="dx-close">Done</button>' +
            '</div>';
        document.body.appendChild(overlay);
        function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        overlay.querySelector('#dx-close').addEventListener('click', close);

        var everything = overlay.querySelector('#dx-everything');
        if (everything) everything.addEventListener('click', function () {
            everything.disabled = true;
            _exportWorkbook(db, overlay.querySelector('#dx-everything-status')).then(function () {
                everything.disabled = false;
            });
        });

        var btns = overlay.querySelectorAll('[data-export]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function () {
                var key = this.getAttribute('data-export');
                var type = TYPES.filter(function (t) { return t.key === key; })[0];
                var row = this;
                var sub = row.querySelector('.txt span');
                if (sub) sub.textContent = 'Building…';
                type.fetch(db).then(function (data) {
                    var csv = csvEncode(data || []);
                    _deliver('proven-' + key + '.csv', csv);
                    if (sub) sub.textContent = (data || []).length + ' rows — sent';
                }).catch(function (e) {
                    if (sub) sub.textContent = 'Failed: ' + e.message;
                });
            });
        }
    }

    function _deliver(name, text) {
        _deliverBlob(name, new Blob([text], { type: 'text/csv' }));
    }

    function _deliverBlob(name, blob) {
        if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
            var file = new File([blob], name, { type: blob.type });
            if (navigator.canShare({ files: [file] })) {
                navigator.share({ files: [file], title: name }).catch(function () {
                    _download(name, blob);
                });
                return;
            }
        }
        _download(name, blob);
    }

    function _download(name, blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            URL.revokeObjectURL(a.href);
            if (a.parentNode) a.parentNode.removeChild(a);
        }, 2000);
    }

    return { open: open, TYPES: TYPES };
})();

// Export for Node unit tests (overnight run #2, item 3's round-trip
// test needs TYPES' fetch functions directly). Nothing at module scope
// touches document/XLSX/navigator -- those only run inside open()/
// _exportWorkbook(), never called by the Node suite -- same pattern as
// js/suppressors.js's own widened export.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataExport;
}
