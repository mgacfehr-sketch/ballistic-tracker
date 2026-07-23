/**
 * data-export.js — "Export my data" (Part 0.6 #6): your data is
 * yours, made concrete. CSV files per data type + rifle profile
 * summaries, generated CLIENT-SIDE, always available — including to
 * lapsed/free accounts (Part 0.6 #5).
 *
 * CSV encoding lives in js/records-core.js (pure, Node-tested).
 * Delivery prefers Web Share (Capacitor-safe); <a download> fallback.
 */

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
        } }
    ];

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
        overlay.innerHTML = '<div class="overlay-card">' +
            '<div class="overlay-title">Export my data</div>' +
            '<p class="overlay-text">Your data is yours. Each export is built on this device — nothing goes anywhere you don\'t send it.</p>' +
            '<div class="card" style="margin:0;max-height:50vh;overflow-y:auto">' + rows + '</div>' +
            '<button class="btn u-full u-mt-10" id="dx-close">Done</button>' +
            '</div>';
        document.body.appendChild(overlay);
        function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        overlay.querySelector('#dx-close').addEventListener('click', close);

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
        var blob = new Blob([text], { type: 'text/csv' });
        if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
            var file = new File([blob], name, { type: 'text/csv' });
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
