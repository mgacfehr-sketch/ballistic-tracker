/**
 * rifle-cards.js — the rifle-page card system (UX Architecture, Surface 2).
 *
 * The rifle page is a stack of cards in the FIXED seven-question order:
 *   ready → dial → ammo → truth → progress → records → prove
 * (Am I ready? · What do I dial? · Which ammo? · Is my equipment telling
 * the truth? · Am I getting better? · Where's my stuff? · Prove it.)
 *
 * Card contract:
 *   { id, slot, tool,                 // tool: null=core | tool key (ToolRegistry.isVisible gate)
 *     isVisible(ctx) -> bool (SYNC, uses preloaded ctx only),
 *     render(el, ctx) }               // may fetch async; self-collapses (el.style.display='none')
 *                                     // or renders its empty state (one sentence + one button)
 * ctx = { db, rifle, loads, barrels, activeBarrel,
 *         managers: { profile, history, report, certificate } }
 *
 * Cards render ONLY when they have data (or teach in one sentence when
 * they're the universal need). Feature waves add cards here — never a
 * new screen, never a nav tab.
 */

var RifleCards = (function () {

    var SLOTS = ['ready', 'dial', 'ammo', 'truth', 'progress', 'records', 'prove'];
    var _cards = [];

    /** Pure: fixed slot order, registration order within a slot. */
    function orderCards(cards) {
        var indexed = cards.map(function (c, i) { return { c: c, i: i }; });
        indexed.sort(function (a, b) {
            var sa = SLOTS.indexOf(a.c.slot);
            var sb = SLOTS.indexOf(b.c.slot);
            if (sa !== sb) return sa - sb;
            return a.i - b.i;
        });
        return indexed.map(function (e) { return e.c; });
    }

    function register(card) {
        if (SLOTS.indexOf(card.slot) === -1) {
            throw new Error('Unknown card slot: ' + card.slot);
        }
        _cards.push(card);
    }

    function render(container, ctx) {
        if (!container) return;
        container.innerHTML = '';
        var visible = _cards.filter(function (c) {
            if (c.tool && !(typeof ToolRegistry !== 'undefined' && ToolRegistry.isVisible(c.tool))) {
                return false;
            }
            try { return !!c.isVisible(ctx); } catch (e) { return false; }
        });
        var ordered = orderCards(visible);
        for (var i = 0; i < ordered.length; i++) {
            var el = document.createElement('div');
            el.className = 'rifle-card rifle-card-' + ordered[i].slot;
            el.setAttribute('data-card-id', ordered[i].id);
            container.appendChild(el);
            try {
                ordered[i].render(el, ctx);
            } catch (e) {
                console.warn('[Cards] "' + ordered[i].id + '" render failed:', e);
                el.style.display = 'none'; // a broken card must never break the page
            }
        }
    }

    return {
        SLOTS: SLOTS,
        register: register,
        render: render,
        orderCards: orderCards
    };
})();

// ══ Core cards ════════════════════════════════════════════════

// ── ammo: loads ───────────────────────────────────────────────
RifleCards.register({
    id: 'loads',
    slot: 'ammo',
    tool: null,
    isVisible: function () { return true; }, // universal (empty state teaches)
    render: function (el, ctx) {
        var html = '<div class="detail-section">';
        html += '<div class="detail-section-header">';
        html += '<h3 class="detail-section-title">Loads</h3>';
        html += '<button class="btn btn-sm btn-secondary" id="btn-add-load">+ Add Load</button>';
        html += '</div>';

        if (ctx.loads.length === 0) {
            html += '<p class="empty-state-sub">No loads yet — photograph the ammo box or add one.</p>';
        } else {
            for (var i = 0; i < ctx.loads.length; i++) {
                var ld = ctx.loads[i];
                html += '<div class="profile-card load-card" data-load-id="' + ld.id + '">';
                html += '<div class="profile-card-main">';
                html += '<span class="profile-card-name">' + escapeHtml(ld.name) + '</span>';
                var subParts = [];
                if (ld.bulletName) subParts.push(escapeHtml(ld.bulletName));
                if (ld.bulletWeight) subParts.push(formatNum(ld.bulletWeight, 1) + 'gr');
                if (ld.muzzleVelocity) subParts.push(formatNum(ld.muzzleVelocity, 0) + ' fps');
                html += '<span class="profile-card-sub">' + (subParts.join(' &middot; ') || '&mdash;') + '</span>';
                html += '</div>';
                html += '<span class="profile-card-arrow">&rsaquo;</span>';
                html += '</div>';
            }
        }
        html += '</div>';
        el.innerHTML = html;

        el.querySelector('#btn-add-load').addEventListener('click', function () {
            ctx.managers.profile.showLoadForm(ctx.rifle.id, null);
        });
        var loadCards = el.querySelectorAll('.load-card');
        for (var lc = 0; lc < loadCards.length; lc++) {
            loadCards[lc].addEventListener('click', function () {
                ctx.managers.profile.showLoadDetail(ctx.rifle.id, this.getAttribute('data-load-id'));
            });
        }
    }
});

// ── ready: zero status (the universal need — always present) ──
RifleCards.register({
    id: 'zero-status',
    slot: 'ready',
    tool: null,
    isVisible: function (ctx) { return !!ctx.rifle; },
    render: function (el, ctx) {
        el.innerHTML = '<div class="detail-card zero-status-card" id="zero-status-body"></div>';
        var body = el.querySelector('#zero-status-body');

        function emptyState() {
            body.innerHTML =
                '<p class="empty-state-sub" style="padding:0;">No zero check yet — photograph a target and yorT gives you the verdict.</p>' +
                '<button class="btn btn-primary" id="zero-status-check" style="margin-top:8px;">Check a target</button>';
            body.querySelector('#zero-status-check').addEventListener('click', function () {
                if (window.AppNav) window.AppNav.go('session');
            });
        }

        ctx.db.getSessionsByRifle(ctx.rifle.id).then(function (sessions) {
            (sessions || []).sort(function (a, b) {
                return (b.date || '').localeCompare(a.date || '');
            });
            var latest = null;
            for (var i = 0; i < sessions.length; i++) {
                if (sessions[i].results && typeof sessions[i].results.atzElevationMOA === 'number') {
                    latest = sessions[i];
                    break;
                }
            }
            var verdict = latest && typeof ZeroGuardian !== 'undefined'
                ? ZeroGuardian.verdictFor(latest.results) : null;
            if (!verdict) { emptyState(); return; }

            var when = latest.date ? new Date(latest.date).toLocaleDateString() : '';
            if (verdict.confirmed) {
                body.innerHTML = '<div class="zg-banner zg-confirmed">✓ ZERO CONFIRMED' +
                    '<span class="zg-sub">Last checked ' + when + '</span></div>';
            } else {
                var parts = [];
                if (verdict.elevClicks > 0) parts.push(verdict.elevClicks + ' click' + (verdict.elevClicks === 1 ? '' : 's') + ' ' + verdict.elevDir.toUpperCase());
                if (verdict.windClicks > 0) parts.push(verdict.windClicks + ' click' + (verdict.windClicks === 1 ? '' : 's') + ' ' + verdict.windDir.toUpperCase());
                body.innerHTML = '<div class="zg-banner zg-adjust">' +
                    (parts.length ? 'Last check: adjust ' + parts.join(', ') : 'Last check: nearly there') +
                    '<span class="zg-sub">' + when + ' — shoot a confirmation group</span></div>';
            }
        }).catch(function () {
            emptyState();
        });
    }
});

// ── truth: scope tracking (silent while things are fine) ──────
RifleCards.register({
    id: 'scope-truth',
    slot: 'truth',
    tool: 'scopeTruth',
    isVisible: function (ctx) { return !!ctx.rifle; },
    render: function (el, ctx) {
        var rifle = ctx.rifle;
        var factor = rifle.scopeCorrectionFactor;
        var html;

        if (typeof factor !== 'number' || !isFinite(factor)) {
            // Empty state: one sentence + one button
            html = '<div class="detail-card">' +
                '<p class="empty-state-sub" style="padding:0;">This scope\'s tracking has never been verified — most scopes are 2–5% off, silently.</p>' +
                '<button class="btn btn-secondary" id="scope-truth-test" style="margin-top:8px;">Verify scope tracking</button>' +
                '</div>';
        } else {
            var errorPct = (factor - 1) * 100;
            var testedAt = rifle.scopeTrackingTestedAt ? new Date(rifle.scopeTrackingTestedAt) : null;
            var stale = testedAt && (Date.now() - testedAt.getTime()) > 365 * 24 * 3600 * 1000;
            var when = testedAt ? testedAt.toLocaleDateString() : '';

            if (Math.abs(errorPct) <= 1 && !stale && !rifle.scopeCantWarn) {
                // Silence is a feature: healthy + fresh renders one quiet line
                html = '<div class="detail-card"><p class="chrono-hint" style="margin:0;">✓ Scope tracks true — verified ' + when + '</p></div>';
            } else {
                html = '<div class="detail-card">';
                if (Math.abs(errorPct) > 1) {
                    html += '<p style="margin:0 0 6px;"><strong>Your clicks are ' +
                        formatNum(Math.abs(errorPct), 1) + '% ' + (errorPct < 0 ? 'small' : 'large') +
                        '</strong> — corrected automatically in every solution.</p>';
                }
                if (rifle.scopeCantWarn) {
                    html += '<p class="chrono-hint" style="color:var(--calibration-color);">⚠ Lateral drift seen during the test — check scope plumb/cant.</p>';
                }
                html += '<p class="chrono-hint">Verified ' + when + (stale ? ' — over a year old, re-test recommended' : '') + '</p>';
                html += '<button class="btn btn-secondary btn-sm" id="scope-truth-test">Re-test</button>';
                html += '</div>';
            }
        }
        el.innerHTML = html;

        var btn = el.querySelector('#scope-truth-test');
        if (btn && typeof ScopeCheck !== 'undefined') {
            btn.addEventListener('click', function () {
                ScopeCheck.start(ctx.db, function () {
                    ctx.managers.profile.showRifleDetail(ctx.rifle.id);
                });
            });
        }
    }
});

// ── progress: barrel round counts (with inline editor) ────────
RifleCards.register({
    id: 'barrel',
    slot: 'progress',
    tool: null,
    isVisible: function (ctx) { return !!ctx.activeBarrel; },
    render: function (el, ctx) {
        var activeBarrel = ctx.activeBarrel;
        var totalRounds = activeBarrel.totalRounds || 0;
        el.innerHTML = '<div id="barrel-stats" style="display:flex;gap:8px;padding:0 16px 4px;"></div>';

        ctx.db.getCleaningLogsByBarrel(activeBarrel.id).then(function (cleaningLogs) {
            var statsEl = el.querySelector('#barrel-stats');
            if (!statsEl) return;
            var sinceCleaning = ctx.managers.history
                ? ctx.managers.history._computeRoundsSinceCleaning(totalRounds, cleaningLogs)
                : totalRounds;

            statsEl.innerHTML =
                '<div class="dashboard-stat" id="stat-total-rounds">' +
                    '<span class="dashboard-stat-value" id="rounds-display">' + totalRounds + '</span>' +
                    '<span class="dashboard-stat-label">Total Rounds</span>' +
                    '<button class="btn btn-sm btn-secondary" id="btn-edit-rounds" style="margin-top:4px;padding:2px 10px;font-size:0.75rem;">Edit</button>' +
                '</div>' +
                '<div class="dashboard-stat">' +
                    '<span class="dashboard-stat-value">' + sinceCleaning + '</span>' +
                    '<span class="dashboard-stat-label">Since Cleaning</span>' +
                '</div>';

            statsEl.querySelector('#btn-edit-rounds').addEventListener('click', function () {
                var statEl = statsEl.querySelector('#stat-total-rounds');
                if (!statEl) return;
                statEl.innerHTML =
                    '<input type="number" id="rounds-input" min="0" step="1" inputmode="numeric" value="' + totalRounds + '" style="width:80px;text-align:center;font-size:1.1rem;padding:4px;border-radius:6px;border:1px solid #555;background:#2a2a2a;color:#fff;">' +
                    '<div style="display:flex;gap:6px;margin-top:6px;">' +
                        '<button class="btn btn-sm btn-primary" id="btn-save-rounds" style="padding:2px 10px;font-size:0.75rem;">Save</button>' +
                        '<button class="btn btn-sm btn-secondary" id="btn-cancel-rounds" style="padding:2px 10px;font-size:0.75rem;">Cancel</button>' +
                    '</div>';
                var inp = statEl.querySelector('#rounds-input');
                inp.focus();
                inp.select();

                statEl.querySelector('#btn-save-rounds').addEventListener('click', function () {
                    var parsed = parseInt(inp.value, 10);
                    if (!isNaN(parsed) && parsed >= 0) {
                        activeBarrel.totalRounds = parsed;
                        ctx.db.updateBarrel(activeBarrel).then(function () {
                            ctx.managers.profile.showRifleDetail(ctx.rifle.id);
                        });
                    }
                });

                statEl.querySelector('#btn-cancel-rounds').addEventListener('click', function () {
                    ctx.managers.profile.showRifleDetail(ctx.rifle.id);
                });

                inp.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') {
                        statEl.querySelector('#btn-save-rounds').click();
                    }
                });
            });
        }).catch(function () {
            el.style.display = 'none'; // no cleaning data reachable — collapse
        });
    }
});

// ── records: build info (rifle + barrel spec sheet) ───────────
RifleCards.register({
    id: 'build-info',
    slot: 'records',
    tool: null,
    isVisible: function (ctx) { return !!ctx.rifle; },
    render: function (el, ctx) {
        var rifle = ctx.rifle;
        var activeBarrel = ctx.activeBarrel;
        var html = '<div class="detail-card">';
        html += '<div class="detail-row"><span class="detail-label">Caliber</span><span class="detail-value">' + escapeHtml(rifle.caliber) + '</span></div>';
        if (rifle.scopeHeight) {
            html += '<div class="detail-row"><span class="detail-label">Scope Height</span><span class="detail-value">' + rifle.scopeHeight + '"</span></div>';
        }
        if (rifle.zeroRange) {
            html += '<div class="detail-row"><span class="detail-label">Zero Range</span><span class="detail-value">' + rifle.zeroRange + ' yds</span></div>';
        }
        if (activeBarrel && activeBarrel.twistRate) {
            html += '<div class="detail-row"><span class="detail-label">Twist</span><span class="detail-value">' + escapeHtml(activeBarrel.twistRate) + ' ' + (activeBarrel.twistDirection || 'Right') + '</span></div>';
        }
        var buildRows = [
            ['Serial #', rifle.serialNumber],
            ['Action', rifle.action],
            ['Barrel', rifle.barrelSpec],
            ['Trigger', rifle.triggerSpec],
            ['Chassis', rifle.chassis],
            ['Muzzle', rifle.muzzleDevice]
        ];
        for (var br = 0; br < buildRows.length; br++) {
            if (buildRows[br][1]) {
                html += '<div class="detail-row"><span class="detail-label">' + buildRows[br][0] +
                    '</span><span class="detail-value">' + escapeHtml(buildRows[br][1]) + '</span></div>';
            }
        }
        if (rifle.notes) {
            html += '<div class="detail-row detail-row-notes"><span class="detail-label">Notes</span><span class="detail-value">' + escapeHtml(rifle.notes) + '</span></div>';
        }
        html += '</div>';
        el.innerHTML = html;
    }
});

// ── progress: cold bore (delegates to ColdBoreManager) ────────
RifleCards.register({
    id: 'cold-bore',
    slot: 'progress',
    tool: null,
    isVisible: function () { return typeof ColdBoreManager !== 'undefined'; },
    render: function (el, ctx) {
        new ColdBoreManager(ctx.db).renderSection(el, ctx.rifle.id);
    }
});

// ── progress: DOPE log (beta-gated, delegates) ─────────────────
RifleCards.register({
    id: 'dope-log',
    slot: 'progress',
    tool: null,
    isVisible: function () {
        return typeof isBetaEnabled === 'function' && isBetaEnabled('dopeLog') &&
            typeof DopeLogManager !== 'undefined';
    },
    render: function (el, ctx) {
        new DopeLogManager(ctx.db).renderSection(el, ctx.rifle.id, ctx.loads);
    }
});

// ── records: history & log links ──────────────────────────────
RifleCards.register({
    id: 'history-links',
    slot: 'records',
    tool: null,
    isVisible: function () { return true; },
    render: function (el, ctx) {
        var activeBarrel = ctx.activeBarrel;
        var html = '<div class="detail-section">';
        html += '<div class="detail-section-header">';
        html += '<h3 class="detail-section-title">History &amp; Logs</h3>';
        html += '</div>';
        html += '<div class="profile-list" style="padding:0 16px;">';
        html += '<div class="profile-card" id="btn-session-history">';
        html += '<div class="profile-card-main"><span class="profile-card-name">Session History</span></div>';
        html += '<span class="profile-card-arrow">&rsaquo;</span>';
        html += '</div>';
        if (activeBarrel) {
            html += '<div class="profile-card" id="btn-cleaning-log" data-barrel-id="' + activeBarrel.id + '">';
            html += '<div class="profile-card-main"><span class="profile-card-name">Cleaning Log</span></div>';
            html += '<span class="profile-card-arrow">&rsaquo;</span>';
            html += '</div>';
        }
        html += '<div class="profile-card" id="btn-scope-adjustments">';
        html += '<div class="profile-card-main"><span class="profile-card-name">Scope Adjustments</span></div>';
        html += '<span class="profile-card-arrow">&rsaquo;</span>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
        el.innerHTML = html;

        var history = ctx.managers.history;
        var historyBtn = el.querySelector('#btn-session-history');
        if (historyBtn && history) {
            historyBtn.addEventListener('click', function () {
                history.showSessionList(ctx.rifle.id);
            });
        }
        var cleaningBtn = el.querySelector('#btn-cleaning-log');
        if (cleaningBtn && history && activeBarrel) {
            cleaningBtn.addEventListener('click', function () {
                history.showCleaningLog(ctx.rifle.id, activeBarrel.id);
            });
        }
        var scopeBtn = el.querySelector('#btn-scope-adjustments');
        if (scopeBtn && history) {
            scopeBtn.addEventListener('click', function () {
                history.showScopeAdjustments(ctx.rifle.id);
            });
        }
    }
});

// ── prove: performance report / certificate entry ─────────────
RifleCards.register({
    id: 'report-promo',
    slot: 'prove',
    tool: null,
    isVisible: function () {
        return typeof hasFeature === 'function' && hasFeature('certificate');
    },
    render: function (el, ctx) {
        var html = '<div class="profile-card report-promo" id="btn-performance-report">';
        html += '<div class="profile-card-main">';
        html += '<span class="profile-card-name">Performance Report</span>';
        html += '<span class="profile-card-sub">Best group &middot; velocity stats &middot; certificate</span>';
        html += '</div>';
        html += '<span class="profile-card-arrow">&rsaquo;</span>';
        html += '</div>';
        el.innerHTML = html;

        var reportBtn = el.querySelector('#btn-performance-report');
        if (reportBtn && ctx.managers.report) {
            reportBtn.addEventListener('click', function () {
                ctx.managers.report.show(ctx.rifle.id);
            });
        }
    }
});

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RifleCards: RifleCards };
}
