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

    // ── First-run onboarding: the feature CHECKLIST (v2.3 §1.3) ──
    // Not tiers, not presets — "Which of these will you use?" with
    // checkboxes. Range Session pre-checked; Data & Records always on;
    // everything toggleable later from the "More tools" surface.

    /** Custom wizard step: multi-select job checklist. */
    function _mountJobChecklist(el, state, api) {
        var rows = (typeof ToolRegistry !== 'undefined' && ToolRegistry.getChecklist)
            ? ToolRegistry.getChecklist()
            : [];
        // Restore a prior visit's selection, else pre-check defaults
        var prior = state.answers.jobs;
        var checked = {};
        rows.forEach(function (r) {
            checked[r.key] = prior ? prior.indexOf(r.key) !== -1 : (r.defaultOn || r.active);
        });

        var html = '';
        rows.forEach(function (r) {
            html += '<button class="option-row' + (checked[r.key] ? ' on' : '') +
                '" data-job="' + r.key + '">' +
                '<span>' + UI.esc(r.label) +
                '<span class="choice-desc">' + UI.esc(r.desc) + '</span></span>' +
                '</button>';
        });
        html += '<p class="t-micro u-mt-10">Data &amp; Records is always on. ' +
            'Change any of this later under More tools — hiding a job keeps all its data.</p>';
        html += '<button class="btn-primary u-full u-mt-10" id="onb-jobs-next">Continue</button>';
        el.innerHTML = html;

        var opts = el.querySelectorAll('[data-job]');
        for (var i = 0; i < opts.length; i++) {
            opts[i].addEventListener('click', function () {
                var key = this.getAttribute('data-job');
                checked[key] = !checked[key];
                this.classList.toggle('on', checked[key]);
            });
        }
        el.querySelector('#onb-jobs-next').addEventListener('click', function () {
            var selected = rows.filter(function (r) { return checked[r.key]; })
                .map(function (r) { return r.key; });
            api.submit(selected.length ? selected : ['__none__']);
        });
    }

    var ONBOARDING_WIZARD = {
        id: 'onboarding',
        version: 2,
        steps: [
            {
                id: 'jobs',
                prompt: 'Which of these will you use?',
                type: 'custom',
                mount: _mountJobChecklist
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

    /**
     * Two questions and the app is shaped like its owner. Runs once per
     * account, cross-device via user_settings; a certificate QR deep
     * link always wins.
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
            new WizardShell(db, ONBOARDING_WIZARD, {
                modal: true,
                onComplete: function (answers) {
                    var jobs = (answers.jobs || []).filter(function (k) { return k !== '__none__'; });
                    ToolRegistry.applyPreset(jobs);
                    var suppressed = answers.suppressed === 'yes';
                    var pDone = [
                        db.setUserSetting('onboarding_done', true)
                    ];
                    if (typeof Suppressors !== 'undefined') {
                        pDone.push(Suppressors.setEnabled(db, suppressed));
                    }
                    Promise.all(pDone).catch(function () { /* cached locally */ });
                    if (suppressed && typeof Suppressors !== 'undefined') {
                        Suppressors.addSheet(db, {
                            intro: true,
                            onDone: function () {
                                if (window.AppNav) window.AppNav.go('home');
                            }
                        });
                    } else if (window.AppNav) {
                        window.AppNav.go('home');
                    }
                },
                onCancel: function () {
                    // Resumable next launch; never nag twice in a session
                }
            }).start();
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
        _parseOcrReply: _parseOcrReply // exposed for tests
    };
})();

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { _parseOcrReply: Onboarding._parseOcrReply };
}
