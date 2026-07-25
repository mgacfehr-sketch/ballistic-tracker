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
 *     render(el, ctx) }               // may fetch async; self-collapses (adds the
 *                                     // 'hidden' class) or renders its empty state
 *                                     // (one sentence + one button)
 * ctx = { db, rifle, loads, barrels, activeBarrel,
 *         managers: { profile, history, report, certificate } }
 *
 * Cards render ONLY when they have data (or teach in one sentence when
 * they're the universal need). Feature waves add cards here — never a
 * new screen, never a nav tab.
 */

var RifleCards = (function () {

    var SLOTS = ['ready', 'dial', 'ammo', 'truth', 'progress', 'records', 'prove'];

    // The seven questions, in the user's words — rendered as quiet
    // engraved kickers above each slot that has at least one card, so
    // the fixed order is legible without adding chrome.
    var SLOT_QUESTIONS = {
        ready: 'Am I ready?',
        dial: 'What do I dial?',
        ammo: 'Which ammo?',
        truth: 'Is my equipment telling the truth?',
        progress: 'Am I getting better?',
        records: 'Where’s my stuff?',
        prove: 'Prove it.'
    };

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

    /**
     * A question label must never float over an empty slot: hide each
     * kicker unless at least one following card (before the next kicker)
     * is visible. Cards collapse asynchronously, so this re-runs via a
     * MutationObserver on card class changes.
     */
    function _syncKickers(container) {
        var kicker = null;
        var anyVisible = false;
        var nodes = container.children;
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if (node.classList.contains('qcard-kicker')) {
                if (kicker && kicker.classList.contains('hidden') === anyVisible) {
                    kicker.classList.toggle('hidden', !anyVisible);
                }
                kicker = node;
                anyVisible = false;
            } else if (node.classList.contains('qcard') && !node.classList.contains('hidden')) {
                anyVisible = true;
            }
        }
        if (kicker && kicker.classList.contains('hidden') === anyVisible) {
            kicker.classList.toggle('hidden', !anyVisible);
        }
    }

    var _observed = typeof WeakSet !== 'undefined' ? new WeakSet() : null;

    function _watchKickers(container) {
        if (typeof MutationObserver === 'undefined') return;
        if (_observed) {
            if (_observed.has(container)) return;
            _observed.add(container);
        }
        var mo = new MutationObserver(function () { _syncKickers(container); });
        mo.observe(container, { attributes: true, subtree: true, attributeFilter: ['class'] });
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
        var lastSlot = null;
        for (var i = 0; i < ordered.length; i++) {
            if (ordered[i].slot !== lastSlot) {
                lastSlot = ordered[i].slot;
                var label = document.createElement('div');
                label.className = 'qcard-kicker';
                label.textContent = SLOT_QUESTIONS[lastSlot] || '';
                container.appendChild(label);
            }
            var el = document.createElement('div');
            el.className = 'qcard';
            el.setAttribute('data-card-id', ordered[i].id);
            el.setAttribute('data-slot', ordered[i].slot);
            container.appendChild(el);
            try {
                ordered[i].render(el, ctx);
            } catch (e) {
                console.warn('[Cards] "' + ordered[i].id + '" render failed:', e);
                el.classList.add('hidden'); // a broken card must never break the page
            }
        }
        _syncKickers(container);
        _watchKickers(container);
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
        var html = '<div class="plate">';

        if (ctx.loads.length === 0) {
            html += '<div class="empty-teach">';
            html += '<p>Photograph the ammo box or add a load by hand.</p>';
            html += '<button class="action" id="btn-add-load">Add load</button>';
            html += '</div>';
        } else {
            for (var i = 0; i < ctx.loads.length; i++) {
                var ld = ctx.loads[i];
                var subParts = [];
                if (ld.bulletName) subParts.push(escapeHtml(ld.bulletName));
                if (ld.bulletWeight) subParts.push(formatNum(ld.bulletWeight, 1) + 'gr');
                if (ld.muzzleVelocity) subParts.push(formatNum(ld.muzzleVelocity, 0) + ' fps');
                html += '<button class="row-item" data-load-id="' + ld.id + '">';
                html += '<div class="row-main">';
                html += '<div class="row-title">' + escapeHtml(ld.name) + '</div>';
                html += '<div class="row-sub">' + (subParts.join(' &middot; ') || '&mdash;') + '</div>';
                html += '</div>';
                html += '<div class="row-aside">' + Icon('chevron-right', 18) + '</div>';
                html += '</button>';
            }
            html += '<button class="action-ghost u-mt-10" id="btn-add-load">+ Add load</button>';
        }
        html += '</div>';
        el.innerHTML = html;

        el.querySelector('#btn-add-load').addEventListener('click', function () {
            ctx.managers.profile.showLoadForm(ctx.rifle.id, null);
        });
        var loadRows = el.querySelectorAll('[data-load-id]');
        for (var lc = 0; lc < loadRows.length; lc++) {
            loadRows[lc].addEventListener('click', function () {
                ctx.managers.profile.showLoadDetail(ctx.rifle.id, this.getAttribute('data-load-id'));
            });
        }
    }
});

// ── ready: zero status (the universal need — the hub's hero) ──
RifleCards.register({
    id: 'zero-status',
    slot: 'ready',
    tool: null,
    isVisible: function (ctx) { return !!ctx.rifle; },
    render: function (el, ctx) {
        el.innerHTML = '<div class="plate" id="zero-status-body"></div>';
        var body = el.querySelector('#zero-status-body');

        function emptyState() {
            body.innerHTML =
                '<div class="empty-teach">' +
                '<p>No zero check yet &mdash; photograph a target and yorT gives you the verdict.</p>' +
                '<button class="action-primary" id="zero-status-check">' + Icon('camera', 20) + ' Check a target</button>' +
                '</div>';
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
                if (!sessions[i].results || typeof sessions[i].results.atzElevationMOA !== 'number') continue;
                // Respect the active suppressor configuration: a bare zero
                // says nothing about the suppressed state
                if (ctx.rifle.hasConfigs && sessions[i].config &&
                    sessions[i].config !== (ctx.rifle.activeConfig || 'bare')) continue;
                latest = sessions[i];
                break;
            }
            var verdict = latest && typeof ZeroGuardian !== 'undefined'
                ? ZeroGuardian.verdictFor(latest.results) : null;
            if (!verdict) { emptyState(); return; }

            var when = latest.date ? new Date(latest.date).toLocaleDateString() : '';
            body.innerHTML = '';
            var verdictEl = document.createElement('div');
            body.appendChild(verdictEl);
            // The verdict itself is ZeroGuardian's component — never restyled here
            ZeroGuardian.render(verdictEl, latest.results);
            if (when) {
                var meta = document.createElement('div');
                meta.className = 't-micro u-mt-10';
                meta.textContent = verdict.confirmed
                    ? 'Last checked ' + when
                    : 'Last checked ' + when + ' — shoot a confirmation group';
                body.appendChild(meta);
            }

            // The hub's ONE brass action, contextual to the verdict
            var cta = document.createElement('button');
            cta.className = 'action-primary u-mt-14';
            cta.innerHTML = Icon('camera', 20) + (verdict.confirmed ? ' Check a target' : ' Confirm zero');
            cta.addEventListener('click', function () {
                if (window.AppNav) window.AppNav.go('session');
            });
            body.appendChild(cta);
        }).catch(function () {
            emptyState();
        });
    }
});

// ── truth: suppressor configuration (only when the rifle has one) ──
RifleCards.register({
    id: 'config-toggle',
    slot: 'truth',
    tool: null,
    isVisible: function (ctx) { return !!(ctx.rifle && ctx.rifle.hasConfigs); },
    render: function (el, ctx) {
        var rifle = ctx.rifle;
        var active = rifle.activeConfig === 'suppressed' ? 'suppressed' : 'bare';

        var html = '<div class="plate">';
        html += '<div class="seg">';
        html += '<button class="seg-opt' + (active === 'bare' ? ' is-selected' : '') + '" data-config="bare">' +
            Icon('sound', 18) + 'Bare</button>';
        html += '<button class="seg-opt' + (active === 'suppressed' ? ' is-selected' : '') + '" data-config="suppressed">' +
            Icon('sound-off', 18) + 'Suppressed</button>';
        html += '</div>';
        html += '<div id="config-shift" class="t-micro u-mt-10"></div>';
        html += '</div>';
        el.innerHTML = html;

        // Measured shift — computed from tagged sessions/strings, and
        // persisted onto the rifle so the solver can respect it
        Promise.all([
            ctx.db.getSessionsByRifle(rifle.id),
            ctx.db.getVelocityStringsByRifle(rifle.id)
        ]).then(function (res) {
            var shift = typeof configShift === 'function' ? configShift(res[0], res[1]) : null;
            var line = el.querySelector('#config-shift');
            if (!line) return;
            if (!shift) {
                line.textContent = 'Shoot tagged sessions in both states and yorT measures the shift for you.';
                return;
            }
            var parts = [];
            if (shift.poi) {
                var e = shift.poi.elevMOA;
                var w = shift.poi.windMOA;
                if (Math.abs(e) >= 0.1) parts.push(formatNum(Math.abs(e), 1) + ' MOA ' + (e > 0 ? 'high' : 'low'));
                if (Math.abs(w) >= 0.1) parts.push(formatNum(Math.abs(w), 1) + ' MOA ' + (w > 0 ? 'right' : 'left'));
            }
            if (shift.velocityDelta !== null && Math.abs(shift.velocityDelta) >= 5) {
                parts.push(formatNum(Math.abs(shift.velocityDelta), 0) + ' fps ' + (shift.velocityDelta > 0 ? 'faster' : 'slower'));
            }
            line.innerHTML = parts.length
                ? '<strong>Can ON shifts POI ' + parts.join(', ') + '</strong> &mdash; accounted for.'
                : 'No meaningful shift measured between configurations.';

            // Persist measurements for the solver (best-effort)
            var changed = false;
            if (shift.velocityDelta !== null && rifle.configVelocityDelta !== shift.velocityDelta) {
                rifle.configVelocityDelta = shift.velocityDelta;
                changed = true;
            }
            if (shift.poi && JSON.stringify(rifle.configPoiShift) !== JSON.stringify(shift.poi)) {
                rifle.configPoiShift = shift.poi;
                changed = true;
            }
            if (changed) ctx.db.updateRifle(rifle).catch(function () {});
        }).catch(function () {});

        var btns = el.querySelectorAll('[data-config]');
        for (var b = 0; b < btns.length; b++) {
            btns[b].addEventListener('click', function () {
                var next = this.getAttribute('data-config');
                if (next === active) return;
                rifle.activeConfig = next;
                ctx.db.updateRifle(rifle).then(function () {
                    ctx.managers.profile.showRifleDetail(rifle.id);
                });
            });
        }
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
            html = '<div class="plate"><div class="empty-teach">' +
                '<p>This scope&rsquo;s tracking has never been verified &mdash; most scopes are 2&ndash;5% off, silently.</p>' +
                '<button class="action" id="scope-truth-test">Verify scope tracking</button>' +
                '</div></div>';
        } else {
            var errorPct = (factor - 1) * 100;
            var testedAt = rifle.scopeTrackingTestedAt ? new Date(rifle.scopeTrackingTestedAt) : null;
            var stale = testedAt && (Date.now() - testedAt.getTime()) > 365 * 24 * 3600 * 1000;
            var when = testedAt ? testedAt.toLocaleDateString() : '';

            if (Math.abs(errorPct) <= 1 && !stale && !rifle.scopeCantWarn) {
                // Silence is a feature: healthy + fresh renders one quiet line
                html = '<div class="plate">' +
                    '<span class="chip is-go">' + Icon('check', 14) + 'Tracks true</span>' +
                    '<span class="t-micro"> Verified ' + when + '</span>' +
                    '</div>';
            } else {
                html = '<div class="plate">';
                if (Math.abs(errorPct) > 1) {
                    html += '<span class="chip is-hold">Corrected</span>';
                    html += '<p class="u-mt-10">Your clicks are <strong>' +
                        formatNum(Math.abs(errorPct), 1) + '% ' + (errorPct < 0 ? 'small' : 'large') +
                        '</strong> &mdash; corrected automatically in every solution.</p>';
                }
                if (rifle.scopeCantWarn) {
                    html += '<div class="alert-strip u-mt-10">' + Icon('alert', 18) +
                        '<span>Lateral drift seen during the test &mdash; check scope plumb/cant.</span></div>';
                }
                html += '<p class="t-micro u-mt-10">Verified ' + when + (stale ? ' — over a year old, re-test recommended' : '') + '</p>';
                html += '<button class="action-ghost u-mt-10" id="scope-truth-test">Re-test</button>';
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

        ctx.db.getCleaningLogsByBarrel(activeBarrel.id).then(function (cleaningLogs) {
            var sinceCleaning = ctx.managers.history
                ? ctx.managers.history._computeRoundsSinceCleaning(totalRounds, cleaningLogs)
                : totalRounds;

            el.innerHTML =
                '<div class="plate">' +
                    '<div class="stat-strip">' +
                        '<div class="instrument">' +
                            '<div class="instrument-label">Total rounds</div>' +
                            '<div class="instrument-value" id="rounds-display">' + Number(totalRounds).toLocaleString() + '</div>' +
                        '</div>' +
                        '<div class="instrument">' +
                            '<div class="instrument-label">Since cleaning</div>' +
                            '<div class="instrument-value">' + Number(sinceCleaning).toLocaleString() + '</div>' +
                        '</div>' +
                    '</div>' +
                    '<button class="action-ghost" id="btn-edit-rounds">' + Icon('pencil', 16) + 'Edit round count</button>' +
                    '<div class="field-row hidden" id="rounds-editor">' +
                        '<input type="number" class="field-input" id="rounds-input" min="0" step="1" inputmode="numeric" value="' + totalRounds + '">' +
                        '<button class="action" id="btn-save-rounds">Save</button>' +
                    '</div>' +
                '</div>';

            var editBtn = el.querySelector('#btn-edit-rounds');
            var editor = el.querySelector('#rounds-editor');
            editBtn.addEventListener('click', function () {
                editBtn.classList.add('hidden');
                editor.classList.remove('hidden');
                var inp = editor.querySelector('#rounds-input');
                inp.focus();
                inp.select();
            });

            editor.querySelector('#btn-save-rounds').addEventListener('click', function () {
                var parsed = parseInt(editor.querySelector('#rounds-input').value, 10);
                if (!isNaN(parsed) && parsed >= 0) {
                    activeBarrel.totalRounds = parsed;
                    ctx.db.updateBarrel(activeBarrel).then(function () {
                        ctx.managers.profile.showRifleDetail(ctx.rifle.id);
                    });
                }
            });

            editor.querySelector('#rounds-input').addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    editor.querySelector('#btn-save-rounds').click();
                }
            });
        }).catch(function () {
            el.classList.add('hidden'); // no cleaning data reachable — collapse
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
        var html = '<div class="plate">';
        html += '<div class="spec-row"><span class="spec-key">Caliber</span><span class="spec-val">' + escapeHtml(rifle.caliber) + '</span></div>';
        if (rifle.scopeHeight) {
            html += '<div class="spec-row"><span class="spec-key">Scope height</span><span class="spec-val">' + rifle.scopeHeight + '&Prime;</span></div>';
        }
        if (rifle.zeroRange) {
            html += '<div class="spec-row"><span class="spec-key">Zero range</span><span class="spec-val">' + rifle.zeroRange + ' yd</span></div>';
        }
        if (activeBarrel && activeBarrel.twistRate) {
            html += '<div class="spec-row"><span class="spec-key">Twist</span><span class="spec-val">' + escapeHtml(activeBarrel.twistRate) + ' ' + (activeBarrel.twistDirection || 'Right') + '</span></div>';
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
                html += '<div class="spec-row"><span class="spec-key">' + buildRows[br][0] +
                    '</span><span class="spec-val">' + escapeHtml(buildRows[br][1]) + '</span></div>';
            }
        }
        if (rifle.notes) {
            html += '<div class="spec-row"><span class="spec-key">Notes</span><span class="spec-val">' + escapeHtml(rifle.notes) + '</span></div>';
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
        new ColdBoreManager(ctx.db).renderSection(el, ctx.rifle.id, ctx.rifle);
    }
});

// v2.4 §2.4: the beta DOPE-log BC-sweep truing card is RETIRED — one
// way to true: the v2.3 truing engine. dope-log.js and its data stay
// on disk, readable; only this UI entry is removed.

// ── truth: ammo lot drift (silent unless a lot differs) ───────
RifleCards.register({
    id: 'lot-alert',
    slot: 'truth',
    tool: 'chrono',
    isVisible: function (ctx) { return !!ctx.rifle; },
    render: function (el, ctx) {
        ctx.db.getVelocityStringsByRifle(ctx.rifle.id).then(function (strings) {
            var alerts = typeof lotDrift === 'function' ? lotDrift(strings) : [];
            if (!alerts.length) {
                el.classList.add('hidden'); // silence is a feature
                return;
            }
            var loadNames = {};
            (ctx.loads || []).forEach(function (l) { loadNames[l.id] = l.name; });
            var html = '';
            alerts.forEach(function (a, idx) {
                html += '<div class="alert-strip' + (idx > 0 ? ' u-mt-10' : '') + '">' + Icon('alert', 18) +
                    '<span><strong>' +
                    escapeHtml(loadNames[a.loadId] || 'A load') + ' &mdash; lot ' + escapeHtml(a.newLot) +
                    ' runs ' + Math.abs(a.deltaFps) + ' fps ' + (a.deltaFps > 0 ? 'faster' : 'slower') +
                    '</strong> than lot ' + escapeHtml(a.prevLot) + ' &mdash; confirm your zero before it matters.</span></div>';
            });
            el.innerHTML = html;
        }).catch(function () {
            el.classList.add('hidden');
        });
    }
});

// ── progress: personal effective range (from field shots) ─────
RifleCards.register({
    id: 'effective-range',
    slot: 'progress',
    tool: 'field',
    isVisible: function (ctx) { return !!ctx.rifle; },
    render: function (el, ctx) {
        el.innerHTML = '<div class="plate" id="eff-range-body"></div>';
        var body = el.querySelector('#eff-range-body');

        // v2.4 §2.3: Steel casual is the one casual logger — the quick
        // hit tally entry is retired; existing field_shots stay counted.
        function bindLog() {
            var logBtn = body.querySelector('#eff-range-log');
            if (logBtn) {
                logBtn.addEventListener('click', function () {
                    if (window.ToolActions && window.ToolActions.steelSession) {
                        window.ToolActions.steelSession(ctx.db, ctx.rifle ? ctx.rifle.id : null);
                    }
                });
            }
        }

        ctx.db.getFieldShotsByRifle(ctx.rifle.id).then(function (shots) {
            if (!shots || !shots.length) {
                body.innerHTML =
                    '<div class="empty-teach">' +
                    '<p>Log steel strings at distance and this card fills itself &mdash; your honest &ldquo;should I shoot?&rdquo; number.</p>' +
                    '<button class="action" id="eff-range-log">Log a steel string</button>' +
                    '</div>';
                bindLog();
                return;
            }

            var eff = FieldCore.computeEffectiveRange(shots);
            var positions = Object.keys(eff);
            var html = '';
            if (positions.length) {
                // Verdict sentence first, numbers under
                html += '<p class="t-head">90% hits on a ' + FieldCore.VITALS_IN + '&Prime; vitals target</p>';
                html += '<div class="stat-strip">';
                positions.forEach(function (p) {
                    html += '<div class="instrument">' +
                        '<div class="instrument-label">' + escapeHtml(p) + '</div>' +
                        '<div class="instrument-value">' + Number(eff[p].yards).toLocaleString() +
                        '<span class="instrument-unit">yd</span></div>' +
                        '</div>';
                });
                html += '</div>';
                html += '<p class="t-micro u-mt-10">From ' + shots.length + ' logged strings. Updates itself as you log.</p>';
            } else {
                // Progress state — never silent while the shooter is feeding it
                html += '<div class="empty-teach">' +
                    '<p>' + shots.length + ' string' + (shots.length === 1 ? '' : 's') +
                    ' logged &mdash; a few more at each distance and I&rsquo;ll compute your effective range. ' +
                    'Each 100-yd bin needs 5+ shots at 90% before it counts.</p>' +
                    '<button class="action" id="eff-range-log">Log field shots</button>' +
                    '</div>';
            }

            // Wind grader insight (F5) — only when it has something real,
            // spoken in the rifle's own turret unit
            var insight = FieldCore.windInsight(FieldCore.analyzeWindCalls(shots), ctx.rifle.angleUnit || 'MOA');
            if (insight) {
                html += '<p class="t-micro u-mt-10">' + insight + '</p>';
            }
            body.innerHTML = html;
            bindLog();
        }).catch(function (err) {
            // No silent failures: say what happened instead of vanishing
            console.warn('[EffRange] failed to load field shots:', err);
            body.innerHTML = '<p class="t-micro">Couldn&rsquo;t load field data &mdash; check your connection and reopen this rifle.</p>';
        });
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
        var html = '';
        html += '<button class="row-item" id="btn-session-history">';
        html += '<div class="row-main"><div class="row-title">Session history</div></div>';
        html += '<div class="row-aside">' + Icon('chevron-right', 18) + '</div>';
        html += '</button>';
        if (activeBarrel) {
            html += '<button class="row-item" id="btn-cleaning-log" data-barrel-id="' + activeBarrel.id + '">';
            html += '<div class="row-main"><div class="row-title">Cleaning log</div></div>';
            html += '<div class="row-aside">' + Icon('chevron-right', 18) + '</div>';
            html += '</button>';
        }
        html += '<button class="row-item" id="btn-scope-adjustments">';
        html += '<div class="row-main"><div class="row-title">Scope adjustments</div></div>';
        html += '<div class="row-aside">' + Icon('chevron-right', 18) + '</div>';
        html += '</button>';
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
        var html = '<button class="row-item" id="btn-performance-report">';
        html += Icon('award', 18);
        html += '<div class="row-main">';
        html += '<div class="row-title">Performance report</div>';
        html += '<div class="row-sub">Best group, recommended load, certificate</div>';
        html += '</div>';
        html += '<div class="row-aside">' + Icon('chevron-right', 18) + '</div>';
        html += '</button>';
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
