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

    // ── First-run onboarding (the wizard's first consumer) ────

    var ONBOARDING_WIZARD = {
        id: 'onboarding',
        version: 1,
        steps: [{
            id: 'main-use',
            prompt: 'What do you mainly do?',
            type: 'choice',
            choices: [
                { value: 'hunt', label: 'Hunt', desc: 'Zero checks, dope, first-shot confidence' },
                { value: 'compete', label: 'Compete', desc: 'Chrono data, groups, trends' },
                { value: 'handload', label: 'Handload', desc: 'Loads, velocities, testing' },
                { value: 'all', label: 'All of it', desc: 'Wake everything up' }
            ]
        }]
    };

    /**
     * One question, ten seconds, and the app is shaped like its owner
     * (UX Architecture rule 6). Runs once per account, cross-device via
     * user_settings; a certificate QR deep link always wins.
     */
    function maybeRunFirstRun(db) {
        if (!enabled()) return;
        if (typeof WizardShell === 'undefined' || typeof ToolRegistry === 'undefined') return;

        // Deep link is the better first-run (the rifle arrives knowing
        // itself) — skip onboarding entirely on that path
        try {
            if (new URLSearchParams(window.location.search).get('rifle')) return;
        } catch (e) { /* no URLSearchParams — proceed */ }

        db.getUserSetting('onboarding_done').then(function (done) {
            if (done) return;
            new WizardShell(db, ONBOARDING_WIZARD, {
                modal: true,
                onComplete: function (answers) {
                    ToolRegistry.applyPreset(answers['main-use']);
                    db.setUserSetting('onboarding_done', true);
                    if (window.AppNav) window.AppNav.go('home');
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
    function stampQR(ctx, rifleId, box) {
        if (typeof qrcode === 'undefined') return false;
        var qr = qrcode(0, 'M');
        qr.addData(rifleUrl(rifleId));
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
        if (!rifleId) return;

        params.delete('rifle');
        var clean = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
        window.history.replaceState(null, '', clean);

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
