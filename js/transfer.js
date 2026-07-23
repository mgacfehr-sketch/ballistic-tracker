/**
 * transfer.js — certificate cross-account transfer client (§2.11).
 *
 * Mint: build the TRANSFER PACKAGE from a rifle — profile/build sheet,
 * active zero summary, measured MV (+SD, date), trued values, scope
 * factor, config notes — and have the server mint a SINGLE-USE token
 * (api/transfer.js; the client can never write the transfers table).
 *
 * Redeem: the buyer's app opens ?transfer=<token> → the server redeems
 * it exactly once → the rifle imports into THEIR account with
 * provenance stamps: origin='factory', certified_by, certified_at —
 * displayed on the rifle page and immutable. Post-import owner changes
 * layer on top as normal owner events (Part 0.6 #2).
 *
 * Single-user model preserved: one-time transfer, never shared access.
 */

var TransferClient = (function () {
    'use strict';

    function _endpoint() {
        var base = (typeof NetService !== 'undefined' && NetService.apiBase) ? NetService.apiBase() : '';
        return base + '/api/transfer';
    }

    function _jwt(db) {
        return db.supabase.auth.getSession().then(function (res) {
            var s = res && res.data && res.data.session;
            return s ? s.access_token : null;
        }).catch(function () { return null; });
    }

    function _post(db, body) {
        return _jwt(db).then(function (jwt) {
            if (!jwt) throw new Error('Sign in first.');
            return fetch(_endpoint(), {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    Authorization: 'Bearer ' + jwt
                },
                body: JSON.stringify(body)
            });
        }).then(function (resp) {
            return resp.json().then(function (data) {
                if (!resp.ok) throw new Error(data && data.error ? data.error : 'Transfer failed');
                return data;
            });
        });
    }

    /** Build the transfer package for one rifle. */
    function buildSnapshot(db, rifleId) {
        return Promise.all([
            db.getRifle(rifleId),
            db.getLoadsByRifle(rifleId).catch(function () { return []; }),
            db.getBarrelsByRifle(rifleId).catch(function () { return []; }),
            db.getZeroEventsByRifle(rifleId).catch(function () { return []; }),
            db.getMvMeasurementsByRifle(rifleId).catch(function () { return []; }),
            db.getTrackingVerificationsByRifle(rifleId).catch(function () { return []; }),
            db.getTruingEventsByRifle(rifleId).catch(function () { return []; })
        ]).then(function (res) {
            var rifle = res[0];
            if (!rifle) throw new Error('Rifle not found');
            return {
                v: 1,
                rifle: rifle,
                loads: res[1],
                barrels: res[2],
                zeroEvent: res[3][0] || null,
                mvMeasurement: res[4][0] || null,
                trackingVerification: res[5][0] || null,
                truingEvent: res[6][0] || null,
                certifiedBy: 'Workhorse Rifles',
                serial: rifle.serialNumber || null
            };
        });
    }

    /** Mint a single-use token; returns {token, url}. */
    function mint(db, rifleId) {
        return buildSnapshot(db, rifleId).then(function (snapshot) {
            return _post(db, { action: 'mint', rifleSnapshot: snapshot });
        }).then(function (data) {
            var base = (typeof NetService !== 'undefined' && NetService.appBaseUrl)
                ? NetService.appBaseUrl() : '';
            return { token: data.token, url: base + '?transfer=' + encodeURIComponent(data.token) };
        });
    }

    /**
     * Redeem a token into THIS account. Creates the rifle (+ barrel,
     * loads, calibration events) with factory provenance. Returns the
     * new rifle.
     */
    function redeem(db, token) {
        return _post(db, { action: 'redeem', token: token }).then(function (data) {
            var snap = data.snapshot || {};
            var src = snap.rifle || {};
            var certifiedAt = data.mintedAt || new Date().toISOString();

            var rifleData = {};
            ['name', 'caliber', 'scopeHeight', 'zeroRange', 'angleUnit', 'notes',
                'serialNumber', 'action', 'barrelSpec', 'triggerSpec', 'chassis', 'muzzleDevice',
                'scopeClickValue', 'scopeCorrectionFactor', 'scopeTrackingTestedAt', 'scopeCantWarn'
            ].forEach(function (k) { if (src[k] !== undefined && src[k] !== null) rifleData[k] = src[k]; });

            return db.addRifle(rifleData).then(function (rifle) {
                // addRifle whitelists fields — the provenance stamps
                // (origin/certified_by/certified_at) apply via update
                rifle.origin = 'factory';
                rifle.certifiedBy = snap.certifiedBy || 'Workhorse Rifles';
                rifle.certifiedAt = certifiedAt;
                return db.updateRifle(rifle).catch(function () { return rifle; });
            }).then(function (rifle) {
                var chain = Promise.resolve();
                (snap.barrels || []).slice(0, 1).forEach(function (b) {
                    chain = chain.then(function () {
                        return db.addBarrel({
                            rifleId: rifle.id, twistRate: b.twistRate,
                            twistDirection: b.twistDirection, isActive: true,
                            totalRounds: b.totalRounds || 0
                        }).catch(function () { /* barrel optional */ });
                    });
                });
                var loadIdMap = {};
                (snap.loads || []).forEach(function (l) {
                    chain = chain.then(function () {
                        var loadData = {};
                        ['name', 'bulletName', 'bulletWeight', 'bulletLength', 'bulletDiameter',
                            'bulletBC', 'dragModel', 'muzzleVelocity', 'lotNumber', 'notes'
                        ].forEach(function (k) { if (l[k] !== undefined && l[k] !== null) loadData[k] = l[k]; });
                        loadData.rifleId = rifle.id;
                        return db.addLoad(loadData).then(function (saved) {
                            loadIdMap[l.id] = saved.id;
                            // addLoad whitelists fields — trued values apply via update
                            if (l.truedBc || l.truedMv) {
                                saved.truedBc = l.truedBc || null;
                                saved.truedMv = l.truedMv || null;
                                saved.truedAt = l.truedAt || null;
                                return db.updateLoad(saved).catch(function () {});
                            }
                        }).catch(function () { /* keep going */ });
                    });
                });
                chain = chain.then(function () {
                    var events = Promise.resolve();
                    if (snap.zeroEvent) {
                        events = events.then(function () {
                            return db.addZeroEvent({
                                rifleId: rifle.id,
                                loadId: loadIdMap[snap.zeroEvent.loadId] || null,
                                date: snap.zeroEvent.date,
                                distanceYards: snap.zeroEvent.distanceYards,
                                shotCount: snap.zeroEvent.shotCount,
                                groupData: snap.zeroEvent.groupData,
                                lotNumber: snap.zeroEvent.lotNumber,
                                source: 'factory'
                            }).catch(function () {});
                        });
                    }
                    if (snap.mvMeasurement) {
                        events = events.then(function () {
                            return db.addMvMeasurement({
                                rifleId: rifle.id,
                                loadId: loadIdMap[snap.mvMeasurement.loadId] || null,
                                date: snap.mvMeasurement.date,
                                value: snap.mvMeasurement.value,
                                sd: snap.mvMeasurement.sd,
                                es: snap.mvMeasurement.es,
                                shotCount: snap.mvMeasurement.shotCount,
                                lotNumber: snap.mvMeasurement.lotNumber,
                                source: 'factory'
                            }).catch(function () {});
                        });
                    }
                    if (snap.trackingVerification) {
                        events = events.then(function () {
                            return db.addTrackingVerification({
                                rifleId: rifle.id,
                                date: snap.trackingVerification.date,
                                factor: snap.trackingVerification.factor,
                                clickValue: snap.trackingVerification.clickValue,
                                method: 'tall-target'
                            }).catch(function () {});
                        });
                    }
                    return events;
                });
                return chain.then(function () { return rifle; });
            });
        });
    }

    /** The mint sheet (Data & Records → Transfer package). */
    function mintSheet(db, rifle) {
        var overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.innerHTML = '<div class="overlay-card">' +
            '<div class="overlay-title">Transfer package</div>' +
            '<p class="overlay-text">A one-time code that imports ' + UI.esc(rifle.name || 'this rifle') +
            '\'s calibrated profile — build sheet, zero, measured velocity, trued values, scope factor — ' +
            'into the buyer\'s account. Single use; your records stay yours.</p>' +
            '<div id="tp-body"><button class="btn-primary u-full" id="tp-mint">Create transfer code</button></div>' +
            '<button class="btn u-full u-mt-10" id="tp-close">Close</button>' +
            '</div>';
        document.body.appendChild(overlay);
        function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        overlay.querySelector('#tp-close').addEventListener('click', close);
        overlay.querySelector('#tp-mint').addEventListener('click', function () {
            var body = overlay.querySelector('#tp-body');
            body.innerHTML = '<p class="t-micro">Minting…</p>';
            mint(db, rifle.id).then(function (out) {
                var qrHtml = '';
                if (typeof qrcode !== 'undefined') {
                    var qr = qrcode(0, 'M');
                    qr.addData(out.url);
                    qr.make();
                    qrHtml = qr.createSvgTag({ scalable: true, margin: 2 });
                }
                body.innerHTML =
                    (qrHtml ? '<div style="width:220px;margin:0 auto">' + qrHtml + '</div>' : '') +
                    '<p class="t-micro mono u-mt-10" style="word-break:break-all">' + UI.esc(out.url) + '</p>' +
                    '<p class="t-micro u-mt-10">The buyer scans this (or opens the link) signed into THEIR Proven account. One use only.</p>';
            }).catch(function (e) {
                body.innerHTML = '<p class="t-micro">Could not mint: ' + UI.esc(e.message) +
                    '</p><button class="btn u-full u-mt-10" id="tp-retry">Try again</button>';
                var retry = body.querySelector('#tp-retry');
                if (retry) retry.addEventListener('click', function () { close(); mintSheet(db, rifle); });
            });
        });
    }

    /** Redeem UX for ?transfer= deep links. */
    function redeemFlow(db, token, openRifle) {
        var overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.innerHTML = '<div class="overlay-card">' +
            '<div class="overlay-title">Importing your rifle</div>' +
            '<p class="t-micro" id="tr-redeem-status">Redeeming the certificate…</p></div>';
        document.body.appendChild(overlay);
        function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
        redeem(db, token).then(function (rifle) {
            close();
            if (openRifle) openRifle(rifle.id);
        }).catch(function (e) {
            var st = overlay.querySelector('#tr-redeem-status');
            if (st) st.textContent = e.message;
            setTimeout(close, 4000);
        });
    }

    return {
        mint: mint,
        redeem: redeem,
        buildSnapshot: buildSnapshot,
        mintSheet: mintSheet,
        redeemFlow: redeemFlow
    };
})();
