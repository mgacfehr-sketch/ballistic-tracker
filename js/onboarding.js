/**
 * onboarding.js — Onboarding helpers: ammo-box OCR + certificate QR
 * deep linking. Gated by hasFeature('onboarding').
 *
 * OCR: photo of an ammo box → downscaled JPEG → Claude vision via
 * NetService.apiChat → strict-JSON extraction → PREFILL the load form
 * (never auto-saves; the user reviews every field).
 *
 * QR: certificates carry a QR of appBaseUrl()?rifle=<id>; app.js calls
 * handleDeepLink() after auth to open that rifle directly.
 */

var Onboarding = (function () {

    var OCR_SYSTEM =
        'You extract ammunition details from a photo of an ammo box. ' +
        'Reply with ONLY a JSON object — no prose, no markdown fences: ' +
        '{"name": string|null, "bulletName": string|null, "bulletWeight": number|null, ' +
        '"bulletDiameter": number|null, "bulletBC": number|null, "dragModel": "G1"|"G7"|null, ' +
        '"muzzleVelocity": number|null, "lotNumber": string|null} ' +
        'Rules: name = brand + weight + bullet (e.g. "Hornady 168gr ELD Match"). ' +
        'bulletWeight in grains. bulletDiameter in inches (convert caliber/mm: .308 Win -> 0.308, 6.5mm -> 0.264). ' +
        'muzzleVelocity in fps only if printed on the box. ' +
        'Use null for anything not clearly readable in the photo. Never guess.';

    function enabled() {
        return typeof hasFeature === 'function' && hasFeature('onboarding');
    }

    // ── Ammo-box OCR ──────────────────────────────────────────

    /**
     * Downscale a photo to ≤1024px JPEG base64 (keeps vision costs and
     * upload size sane on phone camera images).
     */
    function _downscale(file) {
        return loadImageFromFile(file).then(function (img) {
            var max = 1024;
            var scale = Math.min(1, max / Math.max(img.width, img.height));
            var canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
        });
    }

    /**
     * Strict parse + sanity-clamp of the model's JSON reply.
     * Returns only whitelisted, range-checked fields (missing → absent).
     */
    function _parseOcrReply(text) {
        var cleaned = String(text).replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        var raw;
        try {
            raw = JSON.parse(cleaned);
        } catch (e) {
            throw new Error('Could not read the box — the response was not valid data. Enter the load manually.');
        }

        var out = {};
        if (typeof raw.name === 'string' && raw.name.trim()) out.name = raw.name.trim().slice(0, 80);
        if (typeof raw.bulletName === 'string' && raw.bulletName.trim()) out.bulletName = raw.bulletName.trim().slice(0, 80);
        if (typeof raw.bulletWeight === 'number' && raw.bulletWeight >= 10 && raw.bulletWeight <= 1200) out.bulletWeight = raw.bulletWeight;
        if (typeof raw.bulletDiameter === 'number' && raw.bulletDiameter >= 0.1 && raw.bulletDiameter <= 1.0) out.bulletDiameter = raw.bulletDiameter;
        if (typeof raw.bulletBC === 'number' && raw.bulletBC > 0 && raw.bulletBC <= 2) out.bulletBC = raw.bulletBC;
        if (raw.dragModel === 'G1' || raw.dragModel === 'G7') out.dragModel = raw.dragModel;
        if (typeof raw.muzzleVelocity === 'number' && raw.muzzleVelocity >= 500 && raw.muzzleVelocity <= 5000) out.muzzleVelocity = raw.muzzleVelocity;
        if (typeof raw.lotNumber === 'string' && raw.lotNumber.trim()) out.lotNumber = raw.lotNumber.trim().slice(0, 40);

        if (!Object.keys(out).length) {
            throw new Error("Couldn't read the box — enter the load manually.");
        }
        return out;
    }

    /**
     * Run the OCR pipeline on a photo file.
     * @returns {Promise<Object>} whitelisted load fields
     */
    function scanAmmoBox(file) {
        return _downscale(file).then(function (base64) {
            return NetService.apiChat({
                system: OCR_SYSTEM,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
                        { type: 'text', text: 'Extract the ammunition details from this box.' }
                    ]
                }]
            });
        }).then(function (response) {
            return response.json().then(function (data) {
                if (!response.ok) {
                    throw new Error((data && data.error && (data.error.message || data.error)) || 'OCR request failed.');
                }
                if (!data.content || !data.content.length || !data.content[0].text) {
                    throw new Error('OCR request returned no text.');
                }
                return _parseOcrReply(data.content[0].text);
            });
        });
    }

    /**
     * HTML for the scan control: a quiet full-width action label over a
     * hidden camera input, with a micro status line ('' when gated off).
     */
    function scanButtonHtml() {
        if (!enabled()) return '';
        return '<div class="field">' +
            '<label class="action u-full" for="onboarding-scan-input">' +
            Icon('camera', 18) + 'Scan the ammo box</label>' +
            '<input type="file" id="onboarding-scan-input" accept="image/*" capture="environment" class="hidden">' +
            '<p class="t-micro u-mt-10" id="onboarding-scan-status"></p>' +
            '</div>';
    }

    /**
     * Wire the scan input; onPrefill(fields) fires with validated fields.
     */
    function bindScanButton(onPrefill) {
        var input = document.getElementById('onboarding-scan-input');
        var status = document.getElementById('onboarding-scan-status');
        if (!input) return;
        input.addEventListener('change', function () {
            if (!input.files || !input.files.length) return;
            var file = input.files[0];
            input.value = '';
            status.textContent = 'Reading box…';
            scanAmmoBox(file).then(function (fields) {
                status.textContent = 'Check the fields below, then save.';
                onPrefill(fields);
            }).catch(function (err) {
                status.textContent = err.message;
            });
        });
    }

    // ── First-run onboarding: RIFLE-FIRST (v2.4 §1.5) ─────────
    // The payoff ladder: (1) your rifle, (2) your bullet & box
    // velocity, (3) the suppressor question — then LAND ON THE CARD:
    // DOPE available immediately, "Proven to 0 yards · Estimated",
    // next-action lit. 90 seconds to first payoff. No feature
    // checklist — all four doors are on by default (More tools hides).

    function _fieldHtml(id, label, unit, attrs) {
        return '<div class="field">' +
            '<label class="field-label" for="' + id + '">' + label +
            (unit ? ' <span class="field-unit">' + unit + '</span>' : '') + '</label>' +
            '<input id="' + id + '" ' + attrs + '>' +
            '</div>';
    }

    function _val(id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }
    function _num(id, min, max) {
        var v = parseFloat(_val(id));
        if (!isFinite(v)) return null;
        if (typeof min === 'number' && v < min) return null;
        if (typeof max === 'number' && v > max) return null;
        return v;
    }

    /** Step 1: name + cartridge. Everything else can wait (§1.5). */
    function _mountRifleStep(el, state, api) {
        var prior = state.answers.rifle || {};
        var html = _fieldHtml('onb-rifle-name', 'Rifle name', null,
            'type="text" maxlength="60" placeholder="TB 6.5 PRC" value="' + UI.esc(prior.name || '') + '"');
        html += _fieldHtml('onb-rifle-cal', 'Cartridge', null,
            'type="text" maxlength="30" placeholder="6.5 PRC" value="' + UI.esc(prior.caliber || '') + '"');
        html += '<p class="t-micro u-mt-10">Scope height, zero range, and the build sheet can ' +
            'wait — add details later on the rifle page.</p>';
        html += '<button class="btn-primary u-full u-mt-10" id="onb-rifle-next">Continue</button>';
        el.innerHTML = html;
        el.querySelector('#onb-rifle-next').addEventListener('click', function () {
            var name = _val('onb-rifle-name');
            if (!name) { api.error('Give the rifle a name — anything works.'); return; }
            api.submit({ name: name, caliber: _val('onb-rifle-cal') });
        });
    }

    /** Step 2: the load essentials — bullet entry supplies the BC.
     *  Ammo-box OCR appears here as a capture method (§2.8). */
    function _mountLoadStep(el, state, api) {
        var prior = state.answers.load || {};
        var html = scanButtonHtml();
        html += _fieldHtml('onb-load-name', 'Ammo / load name', null,
            'type="text" maxlength="80" placeholder="Hornady 143 ELD-X Precision Hunter" value="' + UI.esc(prior.name || '') + '"');
        html += '<div class="field-row">';
        html += _fieldHtml('onb-load-weight', 'Bullet weight', 'gr',
            'type="number" min="10" max="1200" step="1" inputmode="numeric" placeholder="143" value="' + (prior.bulletWeight || '') + '"');
        html += _fieldHtml('onb-load-bc', 'BC', null,
            'type="number" min="0" max="2" step="0.001" inputmode="decimal" placeholder="0.315" value="' + (prior.bulletBC || '') + '"');
        html += '</div>';
        html += '<div class="field"><label class="field-label">Drag model</label>' +
            '<div class="segment" id="onb-drag">' +
            '<button type="button" data-drag="G1"' + (prior.dragModel === 'G1' ? ' class="on"' : '') + '>G1</button>' +
            '<button type="button" data-drag="G7"' + (prior.dragModel !== 'G1' ? ' class="on"' : '') + '>G7</button>' +
            '</div></div>';
        html += _fieldHtml('onb-load-mv', 'Box velocity', 'fps',
            'type="number" min="500" max="5000" step="1" inputmode="numeric" placeholder="2960" value="' + (prior.muzzleVelocity || '') + '"');
        html += '<p class="t-micro u-mt-10">The box number is enough to start — your DOPE card ' +
            'works immediately, marked estimated until you prove it.</p>';
        html += '<button class="btn-primary u-full u-mt-10" id="onb-load-next">Continue</button>';
        html += '<button class="btn u-full u-mt-10" id="onb-load-skip">Skip for now</button>';
        el.innerHTML = html;

        var drag = prior.dragModel === 'G1' ? 'G1' : 'G7';
        var seg = el.querySelector('#onb-drag');
        seg.addEventListener('click', function (e) {
            var btn = e.target.closest ? e.target.closest('[data-drag]') : null;
            if (!btn) return;
            drag = btn.getAttribute('data-drag');
            var btns = seg.querySelectorAll('[data-drag]');
            for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i] === btn);
        });

        bindScanButton(function (fields) {
            if (fields.name) document.getElementById('onb-load-name').value = fields.name;
            if (fields.bulletWeight) document.getElementById('onb-load-weight').value = fields.bulletWeight;
            if (fields.bulletBC) document.getElementById('onb-load-bc').value = fields.bulletBC;
            if (fields.muzzleVelocity) document.getElementById('onb-load-mv').value = fields.muzzleVelocity;
            if (fields.dragModel) {
                drag = fields.dragModel;
                var btns = seg.querySelectorAll('[data-drag]');
                for (var i = 0; i < btns.length; i++) {
                    btns[i].classList.toggle('on', btns[i].getAttribute('data-drag') === drag);
                }
            }
        });

        el.querySelector('#onb-load-next').addEventListener('click', function () {
            var name = _val('onb-load-name');
            if (!name) { api.error('Name the ammo — the box label works.'); return; }
            api.submit({
                name: name,
                bulletWeight: _num('onb-load-weight', 10, 1200),
                bulletBC: _num('onb-load-bc', 0.05, 2),
                dragModel: drag,
                muzzleVelocity: _num('onb-load-mv', 500, 5000)
            });
        });
        el.querySelector('#onb-load-skip').addEventListener('click', function () {
            api.submit('__skip__');
        });
    }

    var ONBOARDING_WIZARD = {
        id: 'onboarding',
        version: 3, // v2.4: rifle-first; the v2 checklist state resets cleanly
        steps: [
            {
                id: 'rifle',
                prompt: 'Add your rifle',
                type: 'custom',
                mount: _mountRifleStep
            },
            {
                id: 'load',
                prompt: 'Your bullet &amp; box velocity',
                type: 'custom',
                mount: _mountLoadStep
            },
            {
                id: 'suppressed',
                prompt: 'Do you ever shoot suppressed?',
                type: 'choice',
                choices: [
                    { value: 'no', label: 'No', desc: 'Sessions will never ask about a can' },
                    { value: 'yes', label: 'Yes', desc: 'Sessions will ask which can is on' }
                ]
            }
        ]
    };

    /** Create the rifle + load from wizard answers, then land on the
     *  card. Shared by first-run and the Home card's empty state. */
    function _completeFirstRun(db, answers) {
        // All four doors on by default (§1.5) — More tools can hide
        if (typeof ToolRegistry !== 'undefined') {
            ToolRegistry.applyPreset(['rangeSession', 'steelSession', 'ballistics']);
        }

        var pRifle = answers.rifle
            ? db.addRifle({
                name: answers.rifle.name,
                caliber: answers.rifle.caliber || ''
            }).catch(function (e) {
                console.warn('[Onboarding] rifle create failed:', e);
                return null;
            })
            : Promise.resolve(null);

        return pRifle.then(function (rifle) {
            var pLoad = Promise.resolve(null);
            if (rifle && answers.load && answers.load !== '__skip__') {
                pLoad = db.addLoad({
                    rifleId: rifle.id,
                    name: answers.load.name,
                    bulletWeight: answers.load.bulletWeight || 0,
                    bulletBC: answers.load.bulletBC || 0,
                    dragModel: answers.load.dragModel || 'G7',
                    muzzleVelocity: answers.load.muzzleVelocity || 0
                }).catch(function (e) {
                    console.warn('[Onboarding] load create failed:', e);
                    return null;
                });
            }
            return pLoad.then(function () { return rifle; });
        }).then(function (rifle) {
            // The card opens on this rifle: "Proven to 0 yards · Estimated"
            if (rifle && typeof Recents !== 'undefined') Recents.touchRifle(rifle);

            var suppressed = answers.suppressed === 'yes';
            var pDone = [db.setUserSetting('onboarding_done', true)];
            if (typeof Suppressors !== 'undefined') {
                pDone.push(Suppressors.setEnabled(db, suppressed));
            }
            Promise.all(pDone).catch(function () { /* cached locally */ });

            function land() {
                if (window.AppNav) window.AppNav.go('home');
            }
            if (suppressed && typeof Suppressors !== 'undefined') {
                Suppressors.addSheet(db, { intro: true, onDone: land });
            } else {
                land();
            }
        });
    }

    function _runWizard(db) {
        new WizardShell(db, ONBOARDING_WIZARD, {
            modal: true,
            onComplete: function (answers) { _completeFirstRun(db, answers); },
            onCancel: function () {
                // Resumable next launch; never nag twice in a session
            }
        }).start();
    }

    /**
     * Three steps and the first payoff is on screen. Runs once per
     * account, cross-device via user_settings; a certificate QR deep
     * link always wins (a scanned rifle arrives already proven).
     */
    function maybeRunFirstRun(db) {
        if (!enabled()) return;
        if (typeof WizardShell === 'undefined' || typeof ToolRegistry === 'undefined') return;

        // Deep link is the better first-run (the rifle arrives knowing
        // itself) — skip onboarding entirely on that path. Certificate
        // transfers (§2.11) override the same way.
        try {
            var qp = new URLSearchParams(window.location.search);
            if (qp.get('rifle') || qp.get('transfer')) return;
        } catch (e) { /* no URLSearchParams — proceed */ }

        db.getUserSetting('onboarding_done').then(function (done) {
            if (done) return;
            _runWizard(db);
        });
    }

    // ── Certificate QR + deep link ────────────────────────────

    /**
     * Deep-link URL for one rifle.
     */
    function rifleUrl(rifleId) {
        return NetService.appBaseUrl() + '?rifle=' + encodeURIComponent(rifleId);
    }

    /**
     * Stamp a QR for the rifle into the certificate canvas (reserved
     * box from CertificateManager.QR_BOX). No-op if the pinned QR lib
     * failed to load — the square simply stays empty.
     */
    function stampQR(ctx, rifleId, box, urlOverride) {
        if (typeof qrcode === 'undefined') return false;
        var qr = qrcode(0, 'M');
        // §2.11: a minted transfer URL supersedes the plain deep link —
        // the buyer's scan imports the rifle into THEIR account
        qr.addData(urlOverride || rifleUrl(rifleId));
        qr.make();
        var count = qr.getModuleCount();
        var quiet = 8; // quiet-zone padding inside the box
        var cell = (box.size - quiet * 2) / count;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(box.x, box.y, box.size, box.size);
        ctx.fillStyle = '#16211a';
        for (var r = 0; r < count; r++) {
            for (var c = 0; c < count; c++) {
                if (qr.isDark(r, c)) {
                    ctx.fillRect(box.x + quiet + c * cell, box.y + quiet + r * cell,
                        Math.ceil(cell), Math.ceil(cell));
                }
            }
        }
        ctx.font = '400 22px Georgia, serif';
        ctx.fillStyle = '#5a6b60';
        ctx.textAlign = 'center';
        ctx.fillText('SCAN FOR RIFLE RECORD', box.x + box.size / 2, box.y + box.size + 30);
        return true;
    }

    /**
     * After auth: open ?rifle=<id> directly if it belongs to this user.
     * Cleans the query string via history.replaceState (no reload
     * semantics — Capacitor-safe). Unknown/foreign ids land on home.
     */
    function handleDeepLink(db, openRifle) {
        if (!enabled()) return;
        var params = new URLSearchParams(window.location.search);
        var rifleId = params.get('rifle');
        var transferToken = params.get('transfer');
        if (!rifleId && !transferToken) return;

        params.delete('rifle');
        params.delete('transfer');
        var clean = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
        window.history.replaceState(null, '', clean);

        // Certificate transfer (§2.11): redeem the single-use token and
        // the rifle imports into THIS account with factory provenance
        if (transferToken && typeof TransferClient !== 'undefined') {
            TransferClient.redeemFlow(db, transferToken, openRifle);
            return;
        }
        if (!rifleId) return;

        db.getRifle(rifleId).then(function (rifle) {
            if (rifle) openRifle(rifle.id);
        }).catch(function () {
            // invalid/foreign id — stay on home
        });
    }

    return {
        scanAmmoBox: scanAmmoBox,
        scanButtonHtml: scanButtonHtml,
        bindScanButton: bindScanButton,
        rifleUrl: rifleUrl,
        stampQR: stampQR,
        handleDeepLink: handleDeepLink,
        maybeRunFirstRun: maybeRunFirstRun,
        runFirstRifleWizard: _runWizard,
        _parseOcrReply: _parseOcrReply // exposed for tests
    };
})();

/** The Home card's empty-state entry (v2.4 §1.1): same rifle-first
 *  wizard, runnable any time — not just first run. */
var FirstRifleFlow = {
    start: function (db) {
        if (typeof WizardShell === 'undefined') {
            if (window.AppNav) AppNav.go('profiles');
            return;
        }
        Onboarding.runFirstRifleWizard(db);
    }
};

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { _parseOcrReply: Onboarding._parseOcrReply };
}
