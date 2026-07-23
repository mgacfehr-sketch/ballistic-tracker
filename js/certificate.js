/**
 * certificate.js — CertificateManager: Certificate of Performance.
 *
 * Pre-flight confirmation → white print-style canvas render → one-page
 * letter PDF via jsPDF (pinned CDN) → Web Share (Capacitor-safe primary
 * path) with <a download> fallback.
 *
 * Honesty rules (customer-facing artifact):
 *   - generation is BLOCKED while any velocity string is unconfirmed
 *   - generation is BLOCKED without an eligible group (3+ marked shots)
 *     or without confirmed strings for the chosen load
 *   - missing build-sheet fields print as "—", never invented
 *
 * The QR square (bottom-right) is reserved via CertificateManager.QR_BOX;
 * the onboarding step stamps a real QR into it.
 */

var CERT_BRAND = 'WORKHORSE';          // header wordmark — swap when branding lands
var CERT_W = 1700;                     // 8.5" @ 200dpi
var CERT_H = 2200;                     // 11"  @ 200dpi
var CERT_MARGIN = 110;

function CertificateManager(db, profileManager) {
    this.db = db;
    this.profileManager = profileManager;
    this._canvas = null;      // last rendered certificate
    this._previewUrl = null;
    this._ctx = null;         // preflight data kept for re-render
}

// Reserved square for the step-10 QR stamp (canvas pixel coords)
CertificateManager.QR_BOX = {
    x: CERT_W - CERT_MARGIN - 240,
    y: CERT_H - CERT_MARGIN - 240,
    size: 240
};

// ── Pre-flight ────────────────────────────────────────────────

/**
 * Load everything, apply the blockers, and let the user confirm/override
 * exactly which group + load the certificate will print.
 */
CertificateManager.prototype.showPreflight = function (rifleId) {
    var self = this;
    var container = this.profileManager.container;
    container.innerHTML = '<div class="screen"><p class="u-quiet">Checking certificate data&hellip;</p></div>';

    Promise.all([
        this.db.getRifle(rifleId),
        this.db.getSessionsByRifle(rifleId),
        this.db.getVelocityStringsByRifle(rifleId),
        this.db.getLoadsByRifle(rifleId),
        this.db.getBarrelsByRifle(rifleId)
    ]).then(function (res) {
        var rifle = res[0];
        if (!rifle) { self.profileManager.showRifleList(); return; }
        var barrels = res[4] || [];
        var barrel = null;
        for (var i = 0; i < barrels.length; i++) {
            if (barrels[i].isActive) { barrel = barrels[i]; break; }
        }
        if (!barrel && barrels.length) barrel = barrels[0];

        self._ctx = {
            rifle: rifle,
            barrel: barrel,
            sessions: res[1] || [],
            strings: res[2] || [],
            loads: res[3] || [],
            agg: aggregateRifle({ sessions: res[1] || [], strings: res[2] || [], loads: res[3] || [] })
        };
        self._renderPreflight();
    }).catch(function (err) {
        container.innerHTML = '<div class="screen"><div class="alert-strip is-stop">' +
            Icon('alert', 18) + '<span>Could not load certificate data: ' +
            escapeHtml(err.message) + '</span></div></div>';
    });
};

CertificateManager.prototype._eligibleSessions = function () {
    return this._ctx.sessions.filter(function (s) {
        return s.results && typeof s.results.groupSizeMOA === 'number' &&
            s.impacts && s.impacts.length >= 3;
    });
};

CertificateManager.prototype._renderPreflight = function () {
    var self = this;
    var c = this._ctx;
    var agg = c.agg;

    var html = '<div class="view-toolbar">';
    html += '<button class="toolbar-back" id="btn-cert-back">' + Icon('chevron-left', 20) + '<span>Report</span></button>';
    html += '<h2 class="toolbar-title">Certificate</h2>';
    html += '</div>';

    html += '<div class="screen">';

    // Blockers — never generate over unresolved data
    var pending = agg.pendingStrings.unassigned + agg.pendingStrings.suggested + agg.pendingStrings.ambiguous;
    var eligible = this._eligibleSessions();
    var confirmedCount = agg.pendingStrings.confirmed;
    var blockers = [];
    if (pending > 0) {
        blockers.push(pending + ' velocity string' + (pending === 1 ? ' is' : 's are') +
            ' not confirmed to a load — the certificate cannot print numbers that might belong to different ammo.');
    }
    if (!eligible.length) {
        blockers.push('No eligible target group yet (needs a saved session with 3+ marked shots).');
    }
    if (!confirmedCount) {
        blockers.push('No confirmed velocity strings yet — import chrono data and confirm the load.');
    }

    if (blockers.length) {
        html += '<p class="t-head u-mb-12">Not enough verified data for a certificate.</p>';
        for (var b = 0; b < blockers.length; b++) {
            html += '<div class="alert-strip is-stop u-mb-12">' + Icon('alert', 18) +
                '<span>' + escapeHtml(blockers[b]) + '</span></div>';
        }
        if (pending > 0) html += '<button class="action u-mt-10" id="btn-cert-resolve">Resolve strings now</button>';
        html += '</div>';
        this.profileManager.container.innerHTML = html;
        document.getElementById('btn-cert-back').addEventListener('click', function () {
            self.profileManager.reportManager.show(c.rifle.id);
        });
        var rb = document.getElementById('btn-cert-resolve');
        if (rb) rb.addEventListener('click', function () {
            if (window.ChronoNav) window.ChronoNav.openReview(c.rifle.id);
        });
        return;
    }

    // Confirmation plate: what exactly will print
    html += '<div class="plate">';
    html += '<div class="spec-row"><span class="spec-key">Rifle</span><span class="spec-val">' + escapeHtml(c.rifle.name) + '</span></div>';
    if (c.rifle.serialNumber) {
        html += '<div class="spec-row"><span class="spec-key">Serial</span><span class="spec-val">' + escapeHtml(c.rifle.serialNumber) + '</span></div>';
    }
    html += '<p class="u-quiet u-mt-10 u-mb-12">Confirm the data that will appear. Defaults are the computed best group and recommended load.</p>';

    html += '<div class="field"><label class="field-label" for="cert-session">Group to certify</label><select id="cert-session">';
    eligible.sort(function (a, b) { return a.results.groupSizeMOA - b.results.groupSizeMOA; });
    for (var e = 0; e < eligible.length; e++) {
        var s = eligible[e];
        var d = s.date ? new Date(s.date).toLocaleDateString() : '—';
        html += '<option value="' + escapeAttr(s.id) + '"' +
            (agg.bestGroup && s.id === agg.bestGroup.sessionId ? ' selected' : '') + '>' +
            formatNum(s.results.groupSizeMOA, 2) + ' MOA · ' + s.impacts.length + ' shots · ' +
            (s.distanceYards || '?') + ' yd · ' + d + '</option>';
    }
    html += '</select></div>';

    html += '<div class="field"><label class="field-label" for="cert-load">Load to certify</label><select id="cert-load">';
    var loadsWithStrings = agg.loads.filter(function (r) { return r.stringCount > 0; });
    for (var l = 0; l < loadsWithStrings.length; l++) {
        var r = loadsWithStrings[l];
        html += '<option value="' + escapeAttr(r.loadId) + '"' +
            (r.loadId === agg.recommendedLoadId ? ' selected' : '') + '>' +
            escapeHtml(r.load.name) + ' — avg ' + formatNum(r.stats.avg, 1) + ', SD ' +
            formatNum(r.stats.sd, 1) + ', ES ' + formatNum(r.stats.es, 1) + ' (' + r.stats.n + ' shots)' +
            (r.loadId === agg.recommendedLoadId ? ' (recommended)' : '') + '</option>';
    }
    html += '</select></div>';

    html += '<button class="action-primary" id="btn-cert-generate">' + Icon('award', 20) + 'Generate certificate</button>';
    html += '</div>';

    html += '<div id="cert-preview-wrap" class="u-mt-14"></div>';
    html += '<div id="cert-status" class="t-micro u-mt-10"></div>';
    html += '</div>';

    this.profileManager.container.innerHTML = html;

    document.getElementById('btn-cert-back').addEventListener('click', function () {
        self._revokePreview();
        self.profileManager.reportManager.show(c.rifle.id);
    });
    document.getElementById('btn-cert-generate').addEventListener('click', function () {
        self._onGenerate();
    });
};

CertificateManager.prototype._onGenerate = function () {
    var self = this;
    var c = this._ctx;
    var status = document.getElementById('cert-status');
    var sessionId = document.getElementById('cert-session').value;
    var loadId = document.getElementById('cert-load').value;

    var session = c.sessions.filter(function (s) { return s.id === sessionId; })[0];
    var loadRow = c.agg.loads.filter(function (r) { return r.loadId === loadId; })[0];
    if (!session || !loadRow || !loadRow.stats.n) {
        status.textContent = 'Pick a group and a load with confirmed chrono data.';
        return;
    }

    status.textContent = 'Rendering…';
    // §2.11: mint the single-use transfer token FIRST so the printed
    // QR is the cross-account transfer. Offline / mint failure falls
    // back to the plain rifle deep link — the certificate still prints.
    var mintPromise = (typeof TransferClient !== 'undefined' &&
        typeof navigator !== 'undefined' && navigator.onLine !== false)
        ? TransferClient.mint(this.db, c.rifle.id).then(function (out) {
            self._transferUrl = out.url;
        }).catch(function (e) {
            console.warn('[Certificate] transfer mint failed — QR falls back to deep link:', e);
            self._transferUrl = null;
        })
        : Promise.resolve(self._transferUrl = null);

    mintPromise.then(function () {
        return self.db.getSessionImage(session.id);
    }).then(function (record) {
        if (record && record.fullBlob) {
            var url = URL.createObjectURL(record.fullBlob);
            var img = new Image();
            img.onload = function () {
                URL.revokeObjectURL(url);
                self._renderCertificate(session, loadRow, img);
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                self._renderCertificate(session, loadRow, null);
            };
            img.src = url;
        } else {
            self._renderCertificate(session, loadRow, null);
        }
    }).catch(function () {
        self._renderCertificate(session, loadRow, null);
    });
};

// ── Canvas render ─────────────────────────────────────────────

CertificateManager.prototype._renderCertificate = function (session, loadRow, targetImg) {
    var c = this._ctx;
    var canvas = document.createElement('canvas');
    canvas.width = CERT_W;
    canvas.height = CERT_H;
    var ctx = canvas.getContext('2d');
    var M = CERT_MARGIN;
    var ink = '#16211a';
    var dim = '#5a6b60';
    var accent = '#2e7d32';
    var rule = '#c9d4cc';

    // Print-white page
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CERT_W, CERT_H);
    ctx.strokeStyle = rule;
    ctx.lineWidth = 3;
    ctx.strokeRect(M / 2, M / 2, CERT_W - M, CERT_H - M);

    function dash(v) { return v === null || v === undefined || v === '' ? '—' : String(v); }

    // Header
    ctx.fillStyle = ink;
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 92px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(CERT_BRAND, CERT_W / 2, M + 100);
    ctx.font = '400 44px Georgia, serif';
    ctx.fillStyle = dim;
    ctx.fillText('C E R T I F I C A T E   O F   P E R F O R M A N C E', CERT_W / 2, M + 170);

    ctx.font = '600 54px Georgia, serif';
    ctx.fillStyle = ink;
    ctx.fillText(c.rifle.name, CERT_W / 2, M + 265);
    ctx.font = '400 38px Georgia, serif';
    ctx.fillStyle = dim;
    ctx.fillText('Serial No. ' + dash(c.rifle.serialNumber) + '   ·   ' + dash(c.rifle.caliber), CERT_W / 2, M + 325);

    ctx.strokeStyle = rule;
    ctx.beginPath();
    ctx.moveTo(M, M + 380);
    ctx.lineTo(CERT_W - M, M + 380);
    ctx.stroke();

    // Left column: build sheet
    var leftX = M;
    var y = M + 470;
    ctx.textAlign = 'left';
    ctx.font = '700 40px Georgia, serif';
    ctx.fillStyle = accent;
    ctx.fillText('BUILD SHEET', leftX, y);
    y += 30;

    var twist = c.barrel && c.barrel.twistRate
        ? c.barrel.twistRate + (c.barrel.twistDirection ? ' ' + c.barrel.twistDirection : '') : null;
    var rows = [
        ['Action', c.rifle.action],
        ['Barrel', c.rifle.barrelSpec],
        ['Twist', twist],
        ['Trigger', c.rifle.triggerSpec],
        ['Chassis', c.rifle.chassis],
        ['Muzzle', c.rifle.muzzleDevice]
    ];
    for (var r = 0; r < rows.length; r++) {
        y += 78;
        ctx.font = '400 34px Georgia, serif';
        ctx.fillStyle = dim;
        ctx.fillText(rows[r][0].toUpperCase(), leftX, y);
        ctx.font = '600 38px Georgia, serif';
        ctx.fillStyle = ink;
        this._fitText(ctx, dash(rows[r][1]), leftX, y + 44, 640);
        y += 44;
    }

    // Right column: target image + group facts
    var boxX = CERT_W - M - 620;
    var boxY = M + 440;
    var boxW = 620;
    var boxH = 620;
    ctx.strokeStyle = rule;
    ctx.strokeRect(boxX, boxY, boxW, boxH);
    if (targetImg) {
        // cover-fit crop
        var scale = Math.max(boxW / targetImg.width, boxH / targetImg.height);
        var sw = boxW / scale, sh = boxH / scale;
        var sx = (targetImg.width - sw) / 2, sy = (targetImg.height - sh) / 2;
        ctx.drawImage(targetImg, sx, sy, sw, sh, boxX, boxY, boxW, boxH);
        ctx.strokeRect(boxX, boxY, boxW, boxH);
    } else {
        ctx.font = '400 32px Georgia, serif';
        ctx.fillStyle = dim;
        ctx.textAlign = 'center';
        ctx.fillText('Target image unavailable', boxX + boxW / 2, boxY + boxH / 2);
    }

    ctx.textAlign = 'center';
    var gy = boxY + boxH + 90;
    ctx.font = '700 84px Georgia, serif';
    ctx.fillStyle = accent;
    ctx.fillText(formatNum(session.results.groupSizeMOA, 2) + ' MOA', boxX + boxW / 2, gy);
    ctx.font = '400 36px Georgia, serif';
    ctx.fillStyle = dim;
    var inches = typeof session.results.groupSizeInches === 'number'
        ? formatNum(session.results.groupSizeInches, 2) + '" · ' : '';
    var when = session.date ? new Date(session.date).toLocaleDateString() : '—';
    ctx.fillText(inches + session.impacts.length + ' shots · ' + dash(session.distanceYards) + ' yards · ' + when,
        boxX + boxW / 2, gy + 56);

    // Velocity block (full width)
    var vy = Math.max(y + 140, gy + 170);
    ctx.strokeStyle = rule;
    ctx.beginPath();
    ctx.moveTo(M, vy - 70);
    ctx.lineTo(CERT_W - M, vy - 70);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.font = '700 40px Georgia, serif';
    ctx.fillStyle = accent;
    ctx.fillText('VELOCITY — ' + loadRow.load.name.toUpperCase(), M, vy);

    var stats = loadRow.stats;
    var cols = [
        ['AVERAGE', formatNum(stats.avg, 1) + ' fps'],
        ['SD', formatNum(stats.sd, 1) + ' fps'],
        ['ES', formatNum(stats.es, 1) + ' fps'],
        ['SHOTS', String(stats.n)],
        ['ROUNDS AT TEST', dash(this._roundCountAtTest(loadRow.loadId))]
    ];
    var colW = (CERT_W - 2 * M) / cols.length;
    for (var k = 0; k < cols.length; k++) {
        var cx = M + colW * k + colW / 2;
        ctx.textAlign = 'center';
        ctx.font = '400 30px Georgia, serif';
        ctx.fillStyle = dim;
        ctx.fillText(cols[k][0], cx, vy + 90);
        ctx.font = '700 52px Georgia, serif';
        ctx.fillStyle = ink;
        ctx.fillText(cols[k][1], cx, vy + 160);
    }

    // Conditions (only what the session actually recorded)
    var cy = vy + 260;
    var weather = session.weather || null;
    if (weather) {
        var parts = [];
        if (weather.temperature !== null && weather.temperature !== undefined) parts.push(weather.temperature + '°F');
        if (weather.humidity !== null && weather.humidity !== undefined) parts.push(weather.humidity + '% RH');
        if (weather.barometricPressure !== null && weather.barometricPressure !== undefined) parts.push(weather.barometricPressure + ' inHg');
        if (weather.altitude !== null && weather.altitude !== undefined) parts.push(weather.altitude + ' ft');
        if (weather.windSpeed !== null && weather.windSpeed !== undefined) parts.push('wind ' + weather.windSpeed + ' mph' + (weather.windDirection ? ' ' + weather.windDirection : ''));
        if (parts.length) {
            ctx.textAlign = 'center';
            ctx.font = '400 32px Georgia, serif';
            ctx.fillStyle = dim;
            ctx.fillText('Conditions: ' + parts.join(' · '), CERT_W / 2, cy);
        }
    }

    // QR: the single-use TRANSFER token when minted (§2.11 — scan
    // imports the rifle into the buyer's account), else the plain
    // rifle deep link. Empty square if the QR lib failed to load.
    if (typeof Onboarding !== 'undefined') {
        Onboarding.stampQR(ctx, c.rifle.id, CertificateManager.QR_BOX, this._transferUrl || null);
    }

    // Footer: generated date + signature line (QR square stays reserved)
    var fy = CERT_H - M - 60;
    ctx.textAlign = 'left';
    ctx.font = '400 30px Georgia, serif';
    ctx.fillStyle = dim;
    ctx.fillText('Generated ' + new Date().toLocaleDateString(), M, fy + 40);

    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.moveTo(M + 620, fy + 10);
    ctx.lineTo(M + 1160, fy + 10);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText('Verified by', M + 890, fy + 52);

    this._canvas = canvas;
    this._lastMeta = { session: session, loadRow: loadRow };
    this._showPreview();
};

/** Shrink font until the text fits maxWidth (build-sheet values). */
CertificateManager.prototype._fitText = function (ctx, text, x, y, maxWidth) {
    var size = 38;
    while (size > 22 && ctx.measureText(text).width > maxWidth) {
        size -= 2;
        ctx.font = '600 ' + size + 'px Georgia, serif';
    }
    ctx.fillText(text, x, y, maxWidth);
};

/**
 * Barrel round count "at test": from the latest-dated confirmed string
 * of the certified load that has one recorded, else null → "—".
 */
CertificateManager.prototype._roundCountAtTest = function (loadId) {
    var withCount = this._ctx.strings.filter(function (s) {
        return s.loadId === loadId && s.assignmentStatus === 'confirmed' &&
            typeof s.roundCountAt === 'number';
    });
    if (!withCount.length) return null;
    withCount.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    return withCount[0].roundCountAt;
};

// ── Preview + export ──────────────────────────────────────────

CertificateManager.prototype._showPreview = function () {
    var self = this;
    var wrap = document.getElementById('cert-preview-wrap');
    var status = document.getElementById('cert-status');
    if (!wrap) return;

    this._revokePreview();
    var html = '<img id="cert-preview-img" class="plate-img" alt="Certificate preview">';
    html += '<button class="action-primary u-mt-10" id="btn-cert-export">Export PDF</button>';
    wrap.innerHTML = html;

    // One loud thing per screen: Export is now primary, so quiet Generate down.
    var genBtn = document.getElementById('btn-cert-generate');
    if (genBtn) {
        genBtn.classList.remove('action-primary');
        genBtn.classList.add('action', 'u-full');
    }

    this._canvas.toBlob(function (blob) {
        self._previewUrl = URL.createObjectURL(blob);
        var img = document.getElementById('cert-preview-img');
        if (img) img.src = self._previewUrl;
    }, 'image/jpeg', 0.9);
    status.textContent = 'Review the preview, then export.';

    // The preview is the money moment — bring it above the fold
    if (wrap.scrollIntoView) {
        wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    document.getElementById('btn-cert-export').addEventListener('click', function () {
        self._exportPDF();
    });
};

CertificateManager.prototype._exportPDF = function () {
    var status = document.getElementById('cert-status');
    if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
        status.textContent = 'PDF library failed to load (offline or CDN blocked). Reload and try again.';
        return;
    }
    var doc = new window.jspdf.jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait' });
    doc.addImage(this._canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 8.5, 11);
    var blob = doc.output('blob');
    var name = 'certificate-' + (this._ctx.rifle.serialNumber || this._ctx.rifle.name || 'rifle')
        .replace(/[^a-z0-9-]+/gi, '-').toLowerCase() + '.pdf';

    // Mobile → Web Share sheet (the Capacitor-safe primary path).
    // Desktop → straight download: desktop Chrome also implements
    // canShare({files}), but the OS share dialog there is clumsy and
    // hard to save from, so it must not win on desktop.
    var isMobile = navigator.maxTouchPoints > 0 &&
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isMobile) {
        var file = null;
        try { file = new File([blob], name, { type: 'application/pdf' }); } catch (e) { /* older WebView */ }
        if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
            navigator.share({ files: [file], title: 'Certificate of Performance' }).catch(function () {
                // user cancelled — no-op
            });
            return;
        }
        // Share unavailable on this mobile browser — fall through to download
    }

    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    status.textContent = 'PDF downloaded: ' + name;
};

CertificateManager.prototype._revokePreview = function () {
    if (this._previewUrl) {
        URL.revokeObjectURL(this._previewUrl);
        this._previewUrl = null;
    }
};
