/**
 * categories.js — the five job-category screens (Proven §3.2).
 *
 * ONE component, five instances. Pattern per the "Shoot" mockup frame:
 *   ‹ Home · category title
 *   THE RIFLE CHIP (gold border): name · cartridge/load · readiness
 *     word · "Change ›" opens the rifle switcher. Defaults to the
 *     last-used rifle; persists for the browser session. Every tool
 *     launched from a category runs against the chip's rifle.
 *   Tools (rows) — gated by hasFeature + ToolRegistry
 *   "For this rifle" — the category-relevant intelligence strip
 *
 * Dormant (tier-eligible, inactive) tools appear as quiet "Add" rows;
 * activating re-renders in place. That replaces the old Home drawer.
 *
 * Renders into #view-home (a category screen is one tap below Home,
 * inside the Home tab). Categories.show(key, rifleId?) is the single
 * entry — the slim rifle page's shortcut rows call it with a rifle.
 */

var Categories = (function () {
    'use strict';

    var CHIP_KEY = 'yort_cat_rifle'; // sessionStorage: persists per session

    var _db = null;
    var _managers = null;   // { profile, history, report, certificate, home }
    var _container = null;

    /* ── chip rifle state ─────────────────────────────────── */

    function getChipRifleId() {
        try { return sessionStorage.getItem(CHIP_KEY); } catch (e) { return null; }
    }
    function setChipRifleId(id) {
        try { sessionStorage.setItem(CHIP_KEY, id); } catch (e) { /* best effort */ }
    }

    /** Chip rifle: explicit > per-session sticky > last-used > first. */
    function resolveRifle(rifles, explicitId) {
        if (!rifles || !rifles.length) return null;
        var want = explicitId || getChipRifleId() ||
            (typeof Recents !== 'undefined' && Recents.get() ? Recents.get().rifleId : null);
        for (var i = 0; i < rifles.length; i++) {
            if (rifles[i].id === want) return rifles[i];
        }
        return rifles[0];
    }

    /* ── category definitions ─────────────────────────────── */
    // Each tool row: { id, title, sub, gate() -> bool, dormantKey?,
    //                  launch(ctx) }  ctx = { db, rifle, loads,
    //                  barrels, activeBarrel, managers }
    // gate() combines the tier axis (hasFeature) and the user axis
    // (ToolRegistry) exactly like the old Home actions did.

    function toolVisible(key) {
        return typeof ToolRegistry !== 'undefined' && ToolRegistry.isVisible(key);
    }
    function featureOn(name) {
        return typeof hasFeature === 'function' && hasFeature(name);
    }

    var DEFS = {
        range: {
            key: 'range',
            icon: 'job-range',
            title: 'Range Session',
            desc: 'Paper targets, chrono, document the day',
            registryTools: ['rangeSession'],
            tools: [
                {
                    id: 'check-target',
                    title: 'Start a range session',
                    sub: 'Photograph the target — Proven measures the group and your zero',
                    gate: function () { return toolVisible('rangeSession'); },
                    launch: function (ctx) { launchSession(ctx.rifle, false); }
                },
                // v2.4 §2.1: Quick Mode merged into Range Session — the
                // "Just measure this group" escape lives at session entry.
                {
                    id: 'import-chrono',
                    title: 'Import chrono data',
                    sub: 'ShotView export — auto-assigns across your whole fleet',
                    gate: function () { return toolVisible('rangeSession') && featureOn('chronoImport'); },
                    launch: function () { if (window.AppNav) AppNav.go('chrono'); }
                },
                {
                    id: 'print-target',
                    title: 'Print target',
                    sub: 'The Proven auto-calibration target',
                    utility: true, // §1.4: gold utility — does something, instantly
                    gate: function () { return toolVisible('rangeSession'); },
                    launch: function () { printOrShareTarget(); }
                }
            ],
            strip: stripCheck
        },

        steel: {
            key: 'steel',
            icon: 'job-steel',
            title: 'Steel/Field Session',
            desc: 'Log hits at distance — casual or full',
            registryTools: ['steelSession'],
            tools: [
                {
                    id: 'steel-session',
                    title: 'Start a steel session',
                    sub: 'Per-shot impacts, wind, holds — the data truing feeds on',
                    gate: function () {
                        return toolVisible('steelSession') && typeof SteelSession !== 'undefined';
                    },
                    launch: function (ctx) {
                        if (window.ToolActions && ToolActions.steelSession) {
                            ToolActions.steelSession(ctx.db, ctx.rifle ? ctx.rifle.id : null);
                        }
                    }
                },
                // v2.4 §2.3: the legacy quick hit tally is retired — Steel
                // casual is the one casual logger. field_shots data stays
                // readable (effective range + history keep consuming it).
            ],
            strip: stripSteel
        },

        loaddev: {
            key: 'loaddev',
            icon: 'job-loaddev',
            title: 'Load Development',
            desc: 'Ladder tests, recipes, ammo comparison',
            registryTools: ['loadDev'],
            // Tier-hidden in v1 (Part 0.5) — every gate rides the loadDev
            // feature flag, so the whole job vanishes from Home until the
            // tier ships. Loads themselves live on the rifle page.
            tools: [
                {
                    id: 'ladder-test',
                    title: 'Run a ladder test',
                    sub: 'Find the charge your barrel likes',
                    gate: function () { return toolVisible('loadDev'); },
                    launch: function (ctx) {
                        if (window.ToolActions && ToolActions.ladderInfo) ToolActions.ladderInfo(ctx.db);
                    }
                },
                {
                    id: 'dev-logbook',
                    title: 'Development logbook',
                    sub: 'Per-load bench notes and results',
                    gate: function () { return toolVisible('loadDev'); },
                    launch: function (ctx) { openLogbook(ctx); }
                }
            ],
            strip: stripCheck
        },

        ballistics: {
            key: 'ballistics',
            icon: 'job-ballistics',
            title: 'Ballistics',
            desc: 'Firing solution & DOPE cards',
            registryTools: ['ballistics'],
            tools: [
                {
                    id: 'firing-solution',
                    title: 'Get a firing solution',
                    sub: 'Dial for any distance · conditions current',
                    gate: function () { return toolVisible('ballistics'); },
                    launch: function () { if (window.AppNav) AppNav.go('solver'); }
                },
                // §2.7: DOPE cards + Device Export grouped (not merged)
                {
                    id: 'dope-card',
                    title: 'Print a DOPE card',
                    sub: 'Range card for your pocket or stock',
                    section: 'Take it with you',
                    gate: function () { return toolVisible('ballistics'); },
                    launch: function (ctx) {
                        if (window.ToolActions && ToolActions.dopeCards) ToolActions.dopeCards(ctx.db);
                    }
                },
                {
                    id: 'device-export',
                    title: 'Device export',
                    sub: 'Compensated BC + MV for your rangefinder or Kestrel',
                    section: 'Take it with you',
                    gate: function () {
                        return toolVisible('ballistics') && typeof DeviceExport !== 'undefined';
                    },
                    launch: function (ctx) {
                        if (window.ToolActions && ToolActions.deviceExport) {
                            ToolActions.deviceExport(ctx.db, ctx.rifle ? ctx.rifle.id : null);
                        }
                    }
                },
                {
                    id: 'wind-call',
                    title: 'Make a wind call',
                    sub: 'Grade your calls, learn your bias',
                    gate: function () { return featureOn('windCall'); },
                    launch: function () { if (window.AppNav) AppNav.go('wind'); }
                },
                {
                    id: 'true-rifle',
                    title: 'True this rifle',
                    sub: 'Make solutions match reality',
                    utility: true, // v2.4 §1.3/§1.4: truing's door lives here as a gold utility
                    gate: function () { return typeof TruingJob !== 'undefined'; },
                    launch: function (ctx) {
                        if (window.ToolActions && ToolActions.truing) {
                            ToolActions.truing(ctx.db, ctx.rifle ? ctx.rifle.id : null);
                        }
                    }
                }
            ],
            strip: stripShoot
        },

        truing: {
            key: 'truing',
            icon: 'job-truing',
            title: 'Truing',
            desc: 'Make solutions match reality',
            registryTools: ['truing'],
            tools: [
                {
                    id: 'truing-start',
                    title: 'True this rifle',
                    sub: 'Quick or full — corrections your dope can bet on',
                    gate: function () {
                        return toolVisible('truing') && typeof TruingJob !== 'undefined';
                    },
                    launch: function (ctx) {
                        if (window.ToolActions && ToolActions.truing) {
                            ToolActions.truing(ctx.db, ctx.rifle ? ctx.rifle.id : null);
                        }
                    }
                }
            ],
            strip: stripTruing
        },

        scopetrack: {
            key: 'scopetrack',
            icon: 'job-scopetrack',
            title: 'Scope Tracking',
            desc: 'Verify your clicks are true',
            registryTools: ['scopeTracking'],
            tools: [
                {
                    id: 'scope-check',
                    title: 'Verify scope tracking',
                    sub: 'Most scopes are 2–5% off, silently — 10 minutes at 100',
                    gate: function () { return toolVisible('scopeTracking'); },
                    dormantKey: 'scopeTracking',
                    launch: function (ctx) {
                        if (typeof ScopeCheck !== 'undefined') {
                            ScopeCheck.start(ctx.db, function () { show('scopetrack', ctx.rifle && ctx.rifle.id); });
                        }
                    }
                },
                {
                    id: 'tall-target-pdf',
                    title: 'Print tall target',
                    sub: 'Plumb line, known spacing — the test target',
                    utility: true, // §1.4
                    gate: function () {
                        return toolVisible('scopeTracking') && typeof TargetPDF !== 'undefined' &&
                            !!TargetPDF.tallTarget;
                    },
                    launch: function () {
                        var overlay = document.createElement('div');
                        overlay.className = 'overlay';
                        overlay.innerHTML = '<div class="overlay-card">' +
                            '<div class="overlay-title">Tall target</div>' +
                            '<button class="btn-primary u-full" id="tt-letter">Letter PDF</button>' +
                            '<button class="btn u-full u-mt-10" id="tt-a4">A4 PDF</button></div>';
                        document.body.appendChild(overlay);
                        function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
                        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
                        overlay.querySelector('#tt-letter').addEventListener('click', function () { close(); TargetPDF.tallTarget('letter'); });
                        overlay.querySelector('#tt-a4').addEventListener('click', function () { close(); TargetPDF.tallTarget('a4'); });
                    }
                }
            ],
            strip: stripScopeTrack
        },

        records: {
            key: 'records',
            icon: 'job-records',
            title: 'Data & Records',
            desc: 'History, dashboards, reports, proof',
            registryTools: [],
            statusCard: true, // Calibration Status card at the top (§2.7)
            tools: [
                // v2.4 §2.5: ONE history screen with filter chips replaces
                // the five separate lists. Entries keep their detail views.
                {
                    id: 'history',
                    title: 'History',
                    sub: 'Sessions · Steel · Truing · Maintenance',
                    gate: function () { return true; },
                    launch: function (ctx) { showUnifiedHistory(ctx); }
                },
                {
                    id: 'cold-bore-log',
                    title: 'Cold bore log',
                    sub: 'What shot one really does',
                    gate: function () { return typeof ColdBoreManager !== 'undefined'; },
                    launch: function (ctx) { showColdBoreLog(ctx); }
                },
                {
                    id: 'dev-logbook',
                    title: 'Development logbook',
                    sub: 'Per-load bench notes and results',
                    gate: function () { return toolVisible('bench'); },
                    launch: function (ctx) { openLogbook(ctx); }
                },
                // v2.4 §2.2: Performance Report + Certificate = one entry
                {
                    id: 'report-certificate',
                    title: 'Report & Certificate',
                    sub: 'For your records, or proof to share',
                    gate: function () { return featureOn('certificate'); },
                    launch: function (ctx) { openReportCertificate(ctx); }
                },
                {
                    id: 'export-data',
                    title: 'Export data',
                    sub: 'Everything, built on this device — your data is yours',
                    utility: true, // §1.4
                    gate: function () { return typeof DataExport !== 'undefined'; },
                    launch: function (ctx) { DataExport.open(ctx.db); }
                }
            ],
            strip: stripRecords
        }
    };

    // Home order per contract §1.2 (Rifles lives in the tab bar).
    // loaddev is tier-hidden in v1; truing/steel full loggers appear as
    // their modules land — hasActiveTools() hides empty jobs automatically.
    var KEYS = ['range', 'steel', 'loaddev', 'ballistics', 'truing', 'scopetrack', 'records'];

    /* ── visibility (Home hides toolless categories) ──────── */

    function visibleTools(key) {
        var def = DEFS[key];
        if (!def) return [];
        return def.tools.filter(function (t) {
            try { return !!t.gate(); } catch (e) { return false; }
        });
    }

    function hasActiveTools(key) {
        var def = DEFS[key];
        if (!def) return false;
        if (visibleTools(key).length) return true;
        // The loads list / config toggle count as tools of their category
        if (def.loadsList) return true;
        return false;
    }

    /** Tier-eligible but inactive tools of this category (the "Add" rows). */
    function dormantTools(key) {
        var def = DEFS[key];
        if (!def || typeof ToolRegistry === 'undefined') return [];
        return def.tools.filter(function (t) {
            if (!t.dormantKey) return false;
            if (t.gate()) return false; // already visible
            var reg = TOOLS[t.dormantKey];
            if (!reg) return false;
            if (reg.feature && !featureOn(reg.feature)) return false; // tier says no
            return true;
        });
    }

    /* ── launch helpers ───────────────────────────────────── */

    function launchSession(rifle, quickMode) {
        if (window.SessionLaunch) {
            SessionLaunch.start({ rifleId: rifle ? rifle.id : null, quickMode: !!quickMode });
        } else if (window.AppNav) {
            AppNav.go('session');
        }
    }

    function printOrShareTarget() {
        // v2.4 §2.9: the classic blank target is RETIRED — the branded
        // Proven Data Target passed its detector verification gate.
        // Classic print/share code stays on disk as the no-jsPDF fallback.
        var hasGen = typeof TargetPDF !== 'undefined' && TargetPDF.paperTarget;
        if (!hasGen) {
            if (window.TargetSheet && TargetSheet.print) TargetSheet.print();
            return;
        }
        var overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.innerHTML =
            '<div class="overlay-card">' +
            '<div class="overlay-title">Print target</div>' +
            '<p class="overlay-text">The Proven Data Target — aim at a diamond; the four CAL plates set the scale by themselves. Print at 100%.</p>' +
            '<button class="btn-primary u-full" id="target-letter">Letter PDF</button>' +
            '<button class="btn u-full u-mt-10" id="target-a4">A4 PDF</button>' +
            '</div>';
        document.body.appendChild(overlay);
        function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        overlay.querySelector('#target-letter').addEventListener('click', function () { close(); TargetPDF.paperTarget('letter'); });
        overlay.querySelector('#target-a4').addEventListener('click', function () { close(); TargetPDF.paperTarget('a4'); });
    }

    /** Cold bore log: a records sub-screen wrapping ColdBoreManager. */
    function showColdBoreLog(ctx) {
        if (!ctx.rifle || !_container) return;
        _container.setAttribute('data-screen', 'cat-records-coldbore');
        _container.innerHTML =
            '<div class="screen">' +
            '<div class="pagehead">' +
            '<button class="backline" id="cb-back">&lsaquo; Data &amp; Records</button>' +
            '<div class="pagetitle">Cold bore &middot; ' + UI.esc(ctx.rifle.name || 'Rifle') + '</div>' +
            '</div>' +
            '<div id="cb-body" class="edge"></div>' +
            '</div>';
        var back = document.getElementById('cb-back');
        if (back) back.addEventListener('click', function () {
            show('records', ctx.rifle.id);
        });
        new ColdBoreManager(_db).renderSection(document.getElementById('cb-body'), ctx.rifle.id, ctx.rifle);
    }

    /* ══ v2.4 §2.5: ONE history screen, filter chips ══════════
     * Sessions · Steel · Truing · Maintenance (cleaning + scope
     * adjustments interleaved). Entries keep their existing detail
     * views; the five separate lists are retired. */

    var HISTORY_CHIPS = [
        { key: 'sessions', label: 'Sessions' },
        { key: 'steel', label: 'Steel' },
        { key: 'truing', label: 'Truing' },
        { key: 'maintenance', label: 'Maintenance' }
    ];

    function showUnifiedHistory(ctx, chipKey) {
        if (!ctx.rifle || !_container) return;
        chipKey = chipKey || 'sessions';
        _container.setAttribute('data-screen', 'cat-records-history');

        var chips = '<div class="segment" id="uh-chips">';
        HISTORY_CHIPS.forEach(function (c) {
            chips += '<button data-chip="' + c.key + '"' +
                (c.key === chipKey ? ' class="on"' : '') + '>' + c.label + '</button>';
        });
        chips += '</div>';

        _container.innerHTML =
            '<div class="screen">' +
            '<div class="pagehead">' +
            '<button class="backline" id="uh-back">&lsaquo; Data &amp; Records</button>' +
            '<div class="pagetitle">History &middot; ' + UI.esc(ctx.rifle.name || 'Rifle') + '</div>' +
            '</div>' +
            '<div class="card card-pad" style="margin-bottom:10px">' + chips + '</div>' +
            '<div id="uh-body"><div class="card"><div class="rowlink"><div class="txt">' +
            '<span class="t-micro">Loading&hellip;</span></div></div></div></div>' +
            '</div>';

        document.getElementById('uh-back').addEventListener('click', function () {
            show('records', ctx.rifle.id);
        });
        document.getElementById('uh-chips').addEventListener('click', function (e) {
            var btn = e.target.closest ? e.target.closest('[data-chip]') : null;
            if (!btn) return;
            showUnifiedHistory(ctx, btn.getAttribute('data-chip'));
        });

        var body = document.getElementById('uh-body');
        if (chipKey === 'sessions') _uhSessions(ctx, body);
        else if (chipKey === 'steel') _uhSteel(ctx, body);
        else if (chipKey === 'truing') _uhTruing(ctx, body);
        else _uhMaintenance(ctx, body);
    }

    function _uhEmpty(body, text) {
        body.innerHTML = '<div class="empty-teach"><p>' + text + '</p></div>';
    }

    function _uhSessions(ctx, body) {
        ctx.db.getSessionsByRifle(ctx.rifle.id).catch(function () { return []; })
            .then(function (sessions) {
                if (!body.isConnected) return;
                if (!sessions.length) {
                    _uhEmpty(body, 'Photograph a target from Range Session and it lands here, photo and all.');
                    return;
                }
                sessions.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
                var rows = '';
                sessions.forEach(function (s) {
                    var shots = s.impacts ? s.impacts.length : 0;
                    var moa = s.results && s.results.groupSizeMOA != null
                        ? formatFixed(s.results.groupSizeMOA, 2) + ' MOA' : '—';
                    rows += UI.rowlink({
                        button: true,
                        title: shots + ' shots · ' + formatNum(s.distanceYards, 0) + ' yd',
                        sub: (s.date ? new Date(s.date).toLocaleDateString() : '') + ' · ' + moa,
                        subMono: true,
                        chev: true,
                        data: { session: s.id }
                    });
                });
                body.innerHTML = UI.card(rows);
                var items = body.querySelectorAll('[data-session]');
                for (var i = 0; i < items.length; i++) {
                    items[i].addEventListener('click', function () {
                        if (_managers.history) {
                            if (window.AppNav) AppNav.go('profiles');
                            _managers.history.showSessionDetail(this.getAttribute('data-session'), ctx.rifle.id);
                        }
                    });
                }
            });
    }

    function _uhSteel(ctx, body) {
        ctx.db.getSteelStringsByRifle(ctx.rifle.id).catch(function () { return []; })
            .then(function (strings) {
                if (!body.isConnected) return;
                if (!strings.length) {
                    _uhEmpty(body, 'No steel strings yet — log one from the Steel/Field Session door.');
                    return;
                }
                var rows = '';
                strings.forEach(function (st) {
                    var when = st.sessionDate ? new Date(st.sessionDate).toLocaleDateString() : '';
                    var bits = [when, st.tier];
                    if (st.wind && st.wind.mph) bits.push(steelWindText(st.wind.clock, st.wind.mph));
                    if (st.lotNumber) bits.push('Lot ' + st.lotNumber);
                    if (st._pending) bits.push('pending sync');
                    rows += UI.rowlink({
                        button: true,
                        title: st.distanceYd + ' yd',
                        sub: bits.filter(Boolean).join(' · '),
                        subMono: true,
                        chev: true,
                        data: { steel: st.id }
                    });
                });
                body.innerHTML = UI.card(rows);
                var items = body.querySelectorAll('[data-steel]');
                for (var i = 0; i < items.length; i++) {
                    items[i].addEventListener('click', function () {
                        var id = this.getAttribute('data-steel');
                        var st = strings.filter(function (s) { return s.id === id; })[0];
                        if (st) _steelStringSheet(ctx, st);
                    });
                }
            });
    }

    function _uhTruing(ctx, body) {
        ctx.db.getTruingEventsByRifle(ctx.rifle.id).catch(function () { return []; })
            .then(function (events) {
                if (!body.isConnected) return;
                if (!events.length) {
                    _uhEmpty(body, 'Untrued so far — true this rifle and every correction lives here forever.');
                    return;
                }
                var rows = '';
                events.forEach(function (e) {
                    var when = e.appliedAt ? new Date(e.appliedAt).toLocaleDateString() : '';
                    var what = e.correctionType === 'bc'
                        ? 'BC ' + Number(e.oldValue).toFixed(3) + ' → ' + Number(e.newValue).toFixed(3)
                        : 'MV ' + Math.round(e.oldValue) + ' → ' + Math.round(e.newValue) + ' fps';
                    var far = e.far && e.far.rangeYds ? e.far.rangeYds + ' yd' : '';
                    rows += UI.rowlink({
                        title: what,
                        subHtml: '<span class="mono">' + UI.esc([when, e.mode, far,
                            e.confidence ? 'confidence ' + e.confidence : null]
                            .filter(Boolean).join(' · ')) + '</span>'
                    });
                });
                body.innerHTML = UI.card(rows);
            });
    }

    /** Cleaning + scope adjustments, interleaved by date (§2.5). */
    function _uhMaintenance(ctx, body) {
        var pClean = ctx.activeBarrel
            ? ctx.db.getCleaningLogsByBarrel(ctx.activeBarrel.id).catch(function () { return []; })
            : Promise.resolve([]);
        Promise.all([
            pClean,
            ctx.db.getScopeAdjustmentsByRifle(ctx.rifle.id).catch(function () { return []; })
        ]).then(function (res) {
            if (!body.isConnected) return;
            var entries = [];
            (res[0] || []).forEach(function (l) {
                entries.push({
                    date: l.date || '',
                    title: 'Cleaned at ' + Number(l.roundCountAtCleaning || 0).toLocaleString() + ' rounds',
                    sub: (l.date ? new Date(l.date).toLocaleDateString() : '') +
                        (l.notes ? ' — ' + l.notes : '')
                });
            });
            (res[1] || []).forEach(function (a) {
                var elevDir = a.elevationChange >= 0 ? 'UP' : 'DOWN';
                var windDir = a.windageChange >= 0 ? 'RIGHT' : 'LEFT';
                entries.push({
                    date: a.date || '',
                    title: 'Scope: ' + formatFixed(Math.abs(a.elevationChange || 0), 2) + ' ' + elevDir +
                        ' · ' + formatFixed(Math.abs(a.windageChange || 0), 2) + ' ' + windDir,
                    sub: (a.date ? new Date(a.date).toLocaleDateString() : '') +
                        (a.reason ? ' — ' + a.reason : '')
                });
            });
            entries.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });

            var html = '';
            if (!entries.length) {
                html = '<div class="empty-teach"><p>Cleanings and scope adjustments will interleave here.</p></div>';
            } else {
                var rows = '';
                entries.forEach(function (en) {
                    rows += UI.rowlink({ title: en.title, sub: en.sub, subMono: true });
                });
                html = UI.card(rows);
            }
            html += '<button class="action u-full u-mt-10" id="uh-add-adj">Log a scope adjustment</button>';
            body.innerHTML = html;

            var addBtn = document.getElementById('uh-add-adj');
            if (addBtn) addBtn.addEventListener('click', function () {
                if (_managers.history) {
                    if (window.AppNav) AppNav.go('profiles');
                    _managers.history.showScopeAdjustmentForm(ctx.rifle.id);
                }
            });
        });
    }

    function _steelStringSheet(ctx, st) {
        ctx.db.getSteelShotsByString(st.id).catch(function () { return []; })
            .then(function (shots) {
                var overlay = document.createElement('div');
                overlay.className = 'overlay';
                var rows = '';
                shots.forEach(function (s) {
                    var units = s.units || st.units || 'MOA';
                    rows += '<div class="rowlink"><div class="txt"><span class="mono">Shot ' + s.seq +
                        ' &middot; ' + UI.esc(steelDescribeShot(s.elevOff, s.windOff, units)) +
                        (s.mvFps ? ' &middot; ' + Math.round(s.mvFps) + ' fps' : '') +
                        '</span></div></div>';
                });
                overlay.innerHTML = '<div class="overlay-card">' +
                    '<div class="overlay-title">' + st.distanceYd + ' yd &middot; ' +
                    (st.sessionDate ? new Date(st.sessionDate).toLocaleDateString() : '') + '</div>' +
                    (rows ? '<div class="card" style="margin:0;max-height:40vh;overflow-y:auto">' + rows + '</div>'
                        : '<p class="overlay-text">Casual string — no per-shot log.' +
                          (st.notes ? ' Note: ' + UI.esc(st.notes) : '') + '</p>') +
                    (shots.length
                        ? '<button class="btn u-full u-mt-10" id="ss-pair">Pair chrono string &rsaquo;</button>'
                        : '') +
                    '<button class="btn u-full u-mt-10" id="ss-close">Close</button>' +
                    '</div>';
                document.body.appendChild(overlay);
                function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
                overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
                overlay.querySelector('#ss-close').addEventListener('click', close);
                var pair = overlay.querySelector('#ss-pair');
                if (pair) pair.addEventListener('click', function () {
                    close();
                    if (typeof SteelSession !== 'undefined') {
                        SteelSession.pairChrono(ctx.db, st, function () {
                            showSteelHistory(ctx);
                        });
                    }
                });
            });
    }

    /* ══ v2.4 §2.2: Report & Certificate — one entry, first choice ══ */

    function openReportCertificate(ctx) {
        if (!ctx.rifle) return;
        var overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.innerHTML =
            '<div class="overlay-card">' +
            '<div class="overlay-title">Report &amp; Certificate</div>' +
            '<button class="option-row" id="rc-records"><span>For your records' +
            '<span class="choice-desc">The performance report — best group, recommended load</span></span></button>' +
            '<button class="option-row" id="rc-proof"><span>Proof to share or transfer' +
            '<span class="choice-desc">Certificate with QR, or a one-time transfer code</span></span></button>' +
            '</div>';
        document.body.appendChild(overlay);
        function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        overlay.querySelector('#rc-records').addEventListener('click', function () {
            close();
            if (_managers.report) {
                if (window.AppNav) AppNav.go('profiles');
                _managers.report.show(ctx.rifle.id);
            }
        });
        overlay.querySelector('#rc-proof').addEventListener('click', function () {
            close();
            _openProofSheet(ctx);
        });
    }

    /** Certificate + transfer, unchanged mechanics (§2.2). */
    function _openProofSheet(ctx) {
        var hasTransfer = typeof TransferClient !== 'undefined';
        var overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.innerHTML =
            '<div class="overlay-card">' +
            '<div class="overlay-title">Proof to share or transfer</div>' +
            '<button class="option-row" id="pf-cert"><span>Certificate' +
            '<span class="choice-desc">Proven by Workhorse — PDF with the rifle\'s QR</span></span></button>' +
            (hasTransfer
                ? '<button class="option-row" id="pf-transfer"><span>Transfer package' +
                  '<span class="choice-desc">One-time code — the rifle arrives in the buyer\'s account knowing itself</span></span></button>'
                : '') +
            '</div>';
        document.body.appendChild(overlay);
        function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        overlay.querySelector('#pf-cert').addEventListener('click', function () {
            close();
            showCertificate(ctx);
        });
        var tr = overlay.querySelector('#pf-transfer');
        if (tr) tr.addEventListener('click', function () {
            close();
            if (ctx.rifle) TransferClient.mintSheet(ctx.db, ctx.rifle);
        });
    }

    function openLogbook(ctx) {
        // The logbook lives on the load detail — open the ★/first load
        if (!ctx.rifle || !_managers.profile) return;
        var loads = ctx.loads || [];
        if (window.AppNav) AppNav.go('profiles');
        if (!loads.length) {
            _managers.profile.showLoadForm(ctx.rifle.id, null);
            return;
        }
        _managers.profile.showLoadDetail(ctx.rifle.id, loads[0].id);
    }

    function showCertificate(ctx) {
        if (_managers.certificate && ctx.rifle) {
            if (window.AppNav) AppNav.go('profiles');
            _managers.certificate.showPreflight(ctx.rifle.id);
        }
    }

    /* ── the screen ───────────────────────────────────────── */

    function init(db, managers) {
        _db = db;
        _managers = managers || {};
        _container = document.getElementById('view-home');
    }

    /**
     * Render category `key`. Optional rifleId pre-sets the chip
     * (slim rifle page shortcuts use this).
     */
    function show(key, rifleId) {
        var def = DEFS[key];
        if (!def || !_container || !_db) return;
        if (window.AppNav) AppNav.go('home'); // category screens live in the Home tab
        _container.setAttribute('data-screen', 'cat-' + key);
        if (rifleId) setChipRifleId(rifleId);

        _db.getAllRifles().then(function (rifles) {
            var rifle = resolveRifle(rifles, rifleId);
            if (rifle) setChipRifleId(rifle.id);

            if (!rifle) {
                renderNoRifles(def);
                return;
            }

            Promise.all([
                _db.getLoadsByRifle(rifle.id).catch(function () { return []; }),
                _db.getBarrelsByRifle(rifle.id).catch(function () { return []; })
            ]).then(function (res) {
                var loads = res[0] || [];
                var barrels = res[1] || [];
                var activeBarrel = null;
                for (var b = 0; b < barrels.length; b++) {
                    if (barrels[b].isActive) { activeBarrel = barrels[b]; break; }
                }
                if (!activeBarrel && barrels.length) activeBarrel = barrels[0];

                var ctx = {
                    db: _db, rifle: rifle, loads: loads, barrels: barrels,
                    activeBarrel: activeBarrel, managers: _managers, rifles: rifles
                };
                renderScreen(def, ctx);
            });
        });
    }

    function renderNoRifles(def) {
        _container.innerHTML =
            '<div class="screen">' +
            '<div class="pagehead">' +
            '<button class="backline" id="cat-back">&lsaquo; Home</button>' +
            '<div class="pagetitle">' + UI.esc(def.title) + '</div>' +
            '</div>' +
            '<div class="empty-teach">' +
            '<p>Set up a rifle first — everything here runs against one.</p>' +
            '<button class="btn-primary" id="cat-first-rifle">Add rifle</button>' +
            '</div></div>';
        bindBack();
        var btn = document.getElementById('cat-first-rifle');
        if (btn) btn.addEventListener('click', function () {
            if (window.AppNav) AppNav.go('profiles');
        });
    }

    function renderScreen(def, ctx) {
        var html = '<div class="screen">';

        // ‹ Home · title
        html += '<div class="pagehead">' +
            '<button class="backline" id="cat-back">&lsaquo; Home</button>' +
            '<div class="pagetitle">' + UI.esc(def.title) + '</div>' +
            '</div>';

        // THE RIFLE CHIP (readiness word resolves async)
        var chipSub = [];
        if (ctx.rifle.caliber) chipSub.push(ctx.rifle.caliber);
        html += UI.rifleChip({
            id: 'cat-rifle-chip',
            name: ctx.rifle.name || 'Rifle',
            sub: chipSub.join(' · ')
        });

        // Calibration Status card at the top (§2.7 — Data & Records)
        if (def.statusCard) {
            html += '<div id="cat-status-card" class="u-mt-14"></div>';
        }

        // Tools — grouped by section (§2.7: "Take it with you" etc.);
        // unsectioned tools render first under "Tools". Utilities (§1.4)
        // render as gold verb-first buttons below the flow rows —
        // cards go somewhere, gold buttons do something.
        var tools = visibleTools(def.key);
        var dormant = dormantTools(def.key);
        var utilities = tools.filter(function (t) { return t.utility; });
        var rowTools = tools.filter(function (t) { return !t.utility; });
        if (rowTools.length || dormant.length) {
            var sections = [];        // ordered section names
            var bySection = {};
            rowTools.forEach(function (t) {
                var sec = t.section || 'Tools';
                if (!bySection[sec]) { bySection[sec] = []; sections.push(sec); }
                bySection[sec].push(t);
            });
            if (!bySection.Tools && dormant.length) { bySection.Tools = []; sections.unshift('Tools'); }
            sections.forEach(function (sec) {
                html += UI.sectionHead(sec);
                var rows = '';
                bySection[sec].forEach(function (t) {
                    rows += UI.rowlink({ button: true, title: t.title, sub: t.sub, chev: true, data: { tool: t.id } });
                });
                if (sec === 'Tools') {
                    dormant.forEach(function (t) {
                        rows += UI.rowlink({
                            button: true,
                            titleHtml: '<span class="u-gold">＋ ' + UI.esc(t.title) + '</span>',
                            sub: 'Tap to add this tool',
                            data: { activate: t.dormantKey }
                        });
                    });
                }
                html += UI.card(rows, { 'data-cat-tools': sec });
            });
        }
        if (utilities.length) {
            html += '<div class="utility-row">';
            utilities.forEach(function (t) {
                html += UI.utilityBtn({ label: t.title, data: { tool: t.id } });
            });
            html += '</div>';
        }

        // Config toggle (verify) — acts in place, tags all new data
        if (def.configToggle && ctx.rifle.hasConfigs) {
            var active = ctx.rifle.activeConfig === 'suppressed' ? 'suppressed' : 'bare';
            html += UI.sectionHead('Configuration');
            html += '<div class="card card-pad">' +
                '<div class="segment" id="cat-config-seg">' +
                '<button data-config="bare"' + (active === 'bare' ? ' class="on"' : '') + '>Bare</button>' +
                '<button data-config="suppressed"' + (active === 'suppressed' ? ' class="on"' : '') + '>Suppressed</button>' +
                '</div>' +
                '<div id="cat-config-note" class="t-micro u-mt-10">All new sessions and strings tag as ' +
                (active === 'suppressed' ? 'suppressed' : 'bare') + '.</div>' +
                '</div>';
        }

        // Loads list (ammo)
        if (def.loadsList) {
            html += UI.sectionHead('Loads for this rifle');
            html += '<div id="cat-loads"></div>';
        }

        // "For this rifle" strip
        html += UI.sectionHead('For this rifle');
        html += '<div id="cat-strip"><div class="card"><div class="rowlink"><div class="txt">' +
            '<span class="t-micro">Reading the rifle&hellip;</span></div></div></div></div>';

        html += '</div>';
        _container.innerHTML = html;

        bindBack();
        bindChip(def, ctx);
        bindTools(def, ctx);
        if (def.configToggle && ctx.rifle.hasConfigs) bindConfigToggle(def, ctx);
        if (def.loadsList) renderLoadsList(ctx);
        if (def.statusCard && typeof CalibrationStatusCard !== 'undefined' && CalibrationStatusCard) {
            var scEl = document.getElementById('cat-status-card');
            if (scEl) CalibrationStatusCard.render(scEl, _db, ctx.rifle);
        }

        // chip readiness word + load line (".264 · Federal 143 ELD-X · READY")
        Readiness.assess(_db, ctx.rifle).then(function (r) {
            var chip = document.getElementById('cat-rifle-chip');
            if (!chip || !chip.isConnected) return;
            var bits = [];
            if (ctx.rifle.caliber) bits.push(UI.esc(ctx.rifle.caliber));
            var loadName = null;
            if (r.session && r.session.loadId) {
                ctx.loads.forEach(function (l) { if (l.id === r.session.loadId) loadName = l.name; });
            }
            if (!loadName && ctx.loads.length === 1) loadName = ctx.loads[0].name;
            if (loadName) bits.push(UI.esc(loadName));
            bits.push('<b>' + UI.esc(r.word) + '</b>');
            var span = chip.querySelector('.txt span');
            if (span) span.innerHTML = bits.join(' &middot; ');
            else chip.querySelector('.txt').innerHTML += '<span>' + bits.join(' &middot; ') + '</span>';
        });

        // strip
        var stripEl = document.getElementById('cat-strip');
        try {
            def.strip(stripEl, ctx);
        } catch (e) {
            console.warn('[Categories] strip failed:', e);
            if (stripEl) stripEl.innerHTML = '';
        }
    }

    function bindBack() {
        var back = document.getElementById('cat-back');
        if (back) back.addEventListener('click', function () {
            if (_managers.home) _managers.home.show();
        });
    }

    function bindTools(def, ctx) {
        var card = _container; // tools may span several section cards
        if (!card) return;
        var rows = card.querySelectorAll('[data-tool]');
        for (var i = 0; i < rows.length; i++) {
            rows[i].addEventListener('click', function () {
                var id = this.getAttribute('data-tool');
                for (var t = 0; t < def.tools.length; t++) {
                    if (def.tools[t].id === id) { def.tools[t].launch(ctx); return; }
                }
            });
        }
        var adds = card.querySelectorAll('[data-activate]');
        for (var a = 0; a < adds.length; a++) {
            adds[a].addEventListener('click', function () {
                var key = this.getAttribute('data-activate');
                ToolRegistry.activate(key).then(function () {
                    show(def.key, ctx.rifle.id); // re-render with the tool live
                });
            });
        }
    }

    function bindConfigToggle(def, ctx) {
        var seg = document.getElementById('cat-config-seg');
        if (!seg) return;
        var btns = seg.querySelectorAll('[data-config]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function () {
                var next = this.getAttribute('data-config');
                if (next === (ctx.rifle.activeConfig || 'bare')) return;
                ctx.rifle.activeConfig = next;
                _db.updateRifle(ctx.rifle).then(function () {
                    Readiness.invalidate(ctx.rifle.id); // config changes the verdict
                    show(def.key, ctx.rifle.id);
                });
            });
        }
    }

    /* ── the rifle switcher ───────────────────────────────── */

    function bindChip(def, ctx) {
        var chip = document.getElementById('cat-rifle-chip');
        if (!chip) return;
        chip.addEventListener('click', function () {
            openSwitcher(ctx.rifles, function (rifle) {
                show(def.key, rifle.id);
            });
        });
    }

    function openSwitcher(rifles, onPick) {
        var overlay = document.createElement('div');
        overlay.className = 'overlay';
        var rows = '';
        rifles.forEach(function (r) {
            rows += UI.rowlink({
                button: true,
                title: r.name || 'Rifle',
                sub: r.caliber || '',
                data: { pick: r.id },
                right: '<span class="chip" data-chip-for="' + UI.esc(r.id) + '">&hellip;</span>'
            });
        });
        overlay.innerHTML =
            '<div class="overlay-card">' +
            '<div class="overlay-title">Which rifle?</div>' +
            '<div class="card" style="margin:0">' + rows + '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        function close() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) close();
        });
        var picks = overlay.querySelectorAll('[data-pick]');
        for (var i = 0; i < picks.length; i++) {
            picks[i].addEventListener('click', function () {
                var id = this.getAttribute('data-pick');
                for (var r = 0; r < rifles.length; r++) {
                    if (rifles[r].id === id) {
                        setChipRifleId(id);
                        close();
                        onPick(rifles[r]);
                        return;
                    }
                }
            });
        }
        // readiness chips resolve async, one per rifle
        rifles.forEach(function (r) {
            Readiness.assess(_db, r).then(function (res) {
                var el = overlay.querySelector('[data-chip-for="' + r.id + '"]');
                if (el) el.outerHTML = UI.chip(res.chip.kind, res.chip.text);
            });
        });
    }

    /* ── loads list (ammo) ────────────────────────────────── */

    function renderLoadsList(ctx) {
        var el = document.getElementById('cat-loads');
        if (!el) return;

        if (!ctx.loads.length) {
            el.innerHTML = '<div class="card"><div class="empty-teach">' +
                '<p>No loads yet — add one by hand or scan the ammo box.</p>' +
                '<button class="btn" id="cat-loads-add">Add load</button>' +
                '</div></div>';
            var add = document.getElementById('cat-loads-add');
            if (add) add.addEventListener('click', function () {
                if (_managers.profile) {
                    if (window.AppNav) AppNav.go('profiles');
                    _managers.profile.showLoadForm(ctx.rifle.id, null);
                }
            });
            return;
        }

        Promise.all([
            ctx.db.getSessionsByRifle(ctx.rifle.id).catch(function () { return []; }),
            ctx.db.getVelocityStringsByRifle(ctx.rifle.id).catch(function () { return []; })
        ]).then(function (res) {
            if (!el.isConnected) return;
            var agg = typeof aggregateRifle === 'function'
                ? aggregateRifle({ sessions: res[0], strings: res[1], loads: ctx.loads })
                : { loads: [], recommendedLoadId: null };
            var byId = {};
            (agg.loads || []).forEach(function (row) { byId[row.loadId] = row; });

            var rows = '';
            ctx.loads.forEach(function (ld) {
                var row = byId[ld.id];
                var bits = [];
                if (row && row.bestGroupMOA !== null && row.bestGroupMOA !== undefined) {
                    bits.push(formatFixed(row.bestGroupMOA, 2) + ' MOA');
                }
                if (row && row.stats && row.stats.sd !== null && row.stats.sd !== undefined) {
                    bits.push('SD ' + formatFixed(row.stats.sd, 1));
                }
                if (row && row.shotCount) bits.push(row.shotCount + ' shots');
                if (!bits.length && ld.muzzleVelocity) bits.push(formatNum(ld.muzzleVelocity, 0) + ' fps');
                var isMatch = agg.recommendedLoadId === ld.id;
                rows += UI.rowlink({
                    button: true,
                    title: ld.name || 'Load',
                    sub: bits.join(' · ') || '—',
                    subMono: true,
                    data: { load: ld.id },
                    chip: isMatch ? { kind: 'gold', text: '★ Match' } : null,
                    chev: !isMatch
                });
            });
            el.innerHTML = UI.card(rows);

            var loadRows = el.querySelectorAll('[data-load]');
            for (var i = 0; i < loadRows.length; i++) {
                loadRows[i].addEventListener('click', function () {
                    if (_managers.profile) {
                        if (window.AppNav) AppNav.go('profiles');
                        _managers.profile.showLoadDetail(ctx.rifle.id, this.getAttribute('data-load'));
                    }
                });
            }
        });
    }

    /* ── strips: the category-relevant intelligence ───────── */

    function stripRows(rows) {
        var html = '';
        rows.forEach(function (r) {
            html += UI.rowlink({ title: r.title, subHtml: '<span class="mono">' + r.sub + '</span>' });
        });
        return UI.card(html);
    }

    /** CHECK & ZERO: verdict + exact correction · last checked · cold bore. */
    function stripCheck(el, ctx) {
        Promise.all([
            Readiness.assess(ctx.db, ctx.rifle),
            coldBoreLine(ctx)
        ]).then(function (res) {
            if (!el || !el.isConnected) return;
            var r = res[0];
            var cb = res[1];
            var rows = [];
            rows.push({
                title: r.word === 'READY' ? 'Ready' : (r.word === 'ADJUST' ? 'Adjust' : 'Not checked'),
                sub: UI.esc(r.correction || r.note)
            });
            if (r.lastChecked) {
                rows.push({ title: 'Last checked', sub: UI.esc(r.lastChecked.toLocaleDateString()) });
            }
            if (cb) rows.push({ title: 'Cold bore', sub: UI.esc(cb) });
            el.innerHTML = stripRows(rows);
        });
    }

    /** SHOOT: effective range by position · cold bore. */
    function stripShoot(el, ctx) {
        Promise.all([
            ctx.db.getFieldShotsByRifle(ctx.rifle.id).catch(function () { return []; }),
            coldBoreLine(ctx)
        ]).then(function (res) {
            if (!el || !el.isConnected) return;
            var shots = res[0] || [];
            var cb = res[1];
            var rows = [];
            if (shots.length && typeof FieldCore !== 'undefined') {
                var eff = FieldCore.computeEffectiveRange(shots);
                var positions = Object.keys(eff);
                if (positions.length) {
                    var bits = positions.map(function (p) {
                        return UI.esc(p) + ' ' + Number(eff[p].yards).toLocaleString();
                    });
                    rows.push({ title: 'Effective range', sub: '90% on ' + FieldCore.VITALS_IN + '&Prime;: ' + bits.join(' · ') });
                } else {
                    rows.push({ title: 'Effective range', sub: shots.length + ' strings logged — needs more per distance' });
                }
            } else {
                rows.push({ title: 'Effective range', sub: 'Log steel strings at distance and this fills itself' });
            }
            if (cb) rows.push({ title: 'Cold bore', sub: UI.esc(cb) });
            el.innerHTML = stripRows(rows);
        });
    }

    /** STEEL: effective range by position · wind-call insight. */
    function stripSteel(el, ctx) {
        ctx.db.getFieldShotsByRifle(ctx.rifle.id).catch(function () { return []; })
            .then(function (shots) {
                if (!el || !el.isConnected) return;
                shots = shots || [];
                var rows = [];
                if (shots.length && typeof FieldCore !== 'undefined') {
                    var eff = FieldCore.computeEffectiveRange(shots);
                    var positions = Object.keys(eff);
                    if (positions.length) {
                        var bits = positions.map(function (p) {
                            return UI.esc(p) + ' ' + Number(eff[p].yards).toLocaleString();
                        });
                        rows.push({ title: 'Effective range', sub: '90% on ' + FieldCore.VITALS_IN + '&Prime;: ' + bits.join(' · ') });
                    } else {
                        rows.push({ title: 'Effective range', sub: shots.length + ' strings logged — needs more per distance' });
                    }
                    var insight = FieldCore.windInsight(
                        FieldCore.analyzeWindCalls(shots),
                        ctx.rifle.angleUnit || undefined
                    );
                    if (insight) rows.push({ title: 'Wind calls', sub: UI.esc(insight) });
                } else {
                    rows.push({ title: 'Effective range', sub: 'Log steel strings and this fills itself' });
                }
                el.innerHTML = stripRows(rows);
            });
    }

    /** TRUING: the three prerequisites, from the Calibration Status card. */
    function stripTruing(el, ctx) {
        if (typeof CalibrationStatusCard === 'undefined' || !CalibrationStatusCard) {
            el.innerHTML = '';
            return;
        }
        CalibrationStatusCard.render(el, ctx.db, ctx.rifle);
    }

    /** SCOPE TRACKING: correction factor + verified date. */
    function stripScopeTrack(el, ctx) {
        var rifle = ctx.rifle;
        var rows = [];
        var factor = rifle.scopeCorrectionFactor;
        if (typeof factor === 'number' && isFinite(factor)) {
            var errorPct = (factor - 1) * 100;
            var when = rifle.scopeTrackingTestedAt
                ? new Date(rifle.scopeTrackingTestedAt).toLocaleDateString() : '';
            rows.push({
                title: 'Scope tracking',
                sub: (Math.abs(errorPct) <= 1
                    ? 'Tracks true'
                    : 'Clicks ' + formatFixed(Math.abs(errorPct), 1) + '% ' + (errorPct < 0 ? 'small' : 'large') + ' — auto-corrected') +
                    (when ? ' · verified ' + UI.esc(when) : '')
            });
        } else {
            rows.push({
                title: 'Scope tracking',
                sub: 'Never verified — a 4% turret error pollutes every dialed solution'
            });
        }
        el.innerHTML = stripRows(rows);
    }

    /** RECORDS (§2.7): rounds · best group · computed monitor surfaces —
     *  per-can suppressor shift, lot drift (≥30 fps highlighted), cold
     *  bore, effective range. Monitors speak HERE, never on Home. */
    function stripRecords(el, ctx) {
        var barrel = ctx.activeBarrel;
        var pTotals = barrel
            ? ctx.db.getCleaningLogsByBarrel(barrel.id).catch(function () { return []; })
            : Promise.resolve([]);
        Promise.all([
            pTotals,
            ctx.db.getSessionsByRifle(ctx.rifle.id).catch(function () { return []; }),
            ctx.db.getVelocityStringsByRifle(ctx.rifle.id).catch(function () { return []; }),
            ctx.db.getSuppressors ? ctx.db.getSuppressors().catch(function () { return []; }) : Promise.resolve([]),
            ctx.db.getFieldShotsByRifle(ctx.rifle.id).catch(function () { return []; }),
            coldBoreLine(ctx)
        ]).then(function (res) {
            if (!el || !el.isConnected) return;
            var total = barrel ? (barrel.totalRounds || 0) : 0;
            var since = total;
            if (barrel && _managers.history && _managers.history._computeRoundsSinceCleaning) {
                since = _managers.history._computeRoundsSinceCleaning(total, res[0] || []);
            }
            var agg = typeof aggregateRifle === 'function'
                ? aggregateRifle({ sessions: res[1] || [], strings: [], loads: ctx.loads || [] })
                : null;

            // computed surfaces (silence is a feature — rows render only when true)
            var monitorRows = '';
            if (typeof suppressorShiftByCan === 'function' && (res[3] || []).length) {
                suppressorShiftByCan(res[1], res[2], res[3]).forEach(function (shift) {
                    monitorRows += UI.rowlink({
                        title: 'Suppressor shift',
                        subHtml: '<span class="mono">' + UI.esc(suppressorShiftLine(shift)) + '</span>'
                    });
                });
            }
            if (typeof lotDrift === 'function') {
                (lotDrift(res[2] || []) || []).forEach(function (a) {
                    var big = Math.abs(a.deltaFps) >= 30;
                    monitorRows += UI.rowlink({
                        title: 'Lot drift',
                        subHtml: '<span class="mono"' + (big ? ' style="color:var(--status-caution)"' : '') + '>Lot ' +
                            UI.esc(a.newLot) + ' runs ' + Math.abs(a.deltaFps) + ' fps ' +
                            (a.deltaFps > 0 ? 'faster' : 'slower') + ' than ' + UI.esc(a.prevLot) +
                            (big ? ' — confirm zero' : '') + '</span>'
                    });
                });
            }
            if (res[5]) {
                monitorRows += UI.rowlink({
                    title: 'Cold bore',
                    subHtml: '<span class="mono">' + UI.esc(res[5]) + '</span>'
                });
            }
            if ((res[4] || []).length && typeof FieldCore !== 'undefined') {
                var eff = FieldCore.computeEffectiveRange(res[4]);
                var positions = Object.keys(eff);
                if (positions.length) {
                    monitorRows += UI.rowlink({
                        title: 'Effective range',
                        subHtml: '<span class="mono">90% on ' + FieldCore.VITALS_IN + '&Prime;: ' +
                            positions.map(function (p) {
                                return UI.esc(p) + ' ' + Number(eff[p].yards).toLocaleString();
                            }).join(' · ') + '</span>'
                    });
                }
            }

            // v2.4 §2.6: THE BARREL CARD — rounds, since-cleaning,
            // log-cleaning inline; the drift monitors speak above it.
            var html = monitorRows ? UI.card(monitorRows) : '';
            html += '<div class="card' + (monitorRows ? ' u-mt-10' : '') + '">';
            if (barrel) {
                html += '<div class="rowlink" style="min-height:auto;padding-top:14px;padding-bottom:0">' +
                    '<div class="txt"><b>Barrel</b></div></div>';
                html += UI.statStrip([
                    { value: Number(total).toLocaleString(), label: 'Rounds' },
                    { value: Number(since).toLocaleString(), label: 'Since cleaning' },
                    { value: agg && agg.bestGroup ? formatFixed(agg.bestGroup.moa, 2) : '—', label: 'Best MOA' }
                ]);
                html += '<div style="border-top:1px solid var(--border-default)">' +
                    '<button class="rowlink" id="cat-log-cleaning"><div class="txt">' +
                    '<b>Log a cleaning</b></div><span class="chev">&rsaquo;</span></button>' +
                    '<button class="rowlink" id="cat-edit-rounds"><div class="txt">' +
                    '<b>Edit round count</b></div><span class="chev">&rsaquo;</span></button></div>';
            } else if (agg && agg.bestGroup) {
                html += UI.statStrip([{ value: formatFixed(agg.bestGroup.moa, 2), label: 'Best MOA' }]);
            } else {
                html += '<div class="rowlink"><div class="txt"><span>No rounds logged yet</span></div></div>';
            }
            html += '</div>';
            el.innerHTML = html;

            var edit = document.getElementById('cat-edit-rounds');
            if (edit && barrel) {
                edit.addEventListener('click', function () {
                    var v = prompt('Total rounds through this barrel:', String(total));
                    if (v === null) return;
                    var parsed = parseInt(v, 10);
                    if (!isNaN(parsed) && parsed >= 0) {
                        barrel.totalRounds = parsed;
                        ctx.db.updateBarrel(barrel).then(function () {
                            show('records', ctx.rifle.id);
                        });
                    }
                });
            }
            var logClean = document.getElementById('cat-log-cleaning');
            if (logClean && barrel) {
                logClean.addEventListener('click', function () {
                    _logCleaningSheet(ctx, barrel, total);
                });
            }
        });
    }

    /** Inline log-cleaning (§2.6) — round count prefilled, one tap. */
    function _logCleaningSheet(ctx, barrel, total) {
        var overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.innerHTML =
            '<div class="overlay-card">' +
            '<div class="overlay-title">Log a cleaning</div>' +
            '<div class="field"><label class="field-label" for="lc-rounds">Round count at cleaning</label>' +
            '<input type="number" id="lc-rounds" min="1" step="1" inputmode="numeric" value="' + total + '"></div>' +
            '<p class="field-error" id="lc-error"></p>' +
            '<button class="btn-primary u-full" id="lc-save">Save cleaning</button>' +
            '<button class="btn u-full u-mt-10" id="lc-cancel">Cancel</button>' +
            '</div>';
        document.body.appendChild(overlay);
        function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        overlay.querySelector('#lc-cancel').addEventListener('click', close);
        overlay.querySelector('#lc-save').addEventListener('click', function () {
            var rounds = parseInt(document.getElementById('lc-rounds').value, 10);
            if (!isFinite(rounds) || rounds <= 0) {
                document.getElementById('lc-error').textContent =
                    'Enter the barrel round count at cleaning (must be above 0).';
                return;
            }
            ctx.db.addCleaningLog({
                rifleId: ctx.rifle.id,
                barrelId: barrel.id,
                date: new Date().toISOString(),
                roundCountAtCleaning: rounds,
                notes: ''
            }).then(function () {
                close();
                show('records', ctx.rifle.id);
            }).catch(function () {
                document.getElementById('lc-error').textContent =
                    'Could not save — check your connection and try again.';
            });
        });
    }

    /** Shared: the cold-bore one-liner ("First shot 0.2 high — hold under"). */
    function coldBoreLine(ctx) {
        if (typeof ColdBoreManager === 'undefined') return Promise.resolve(null);
        return ctx.db.getColdBoreShots(ctx.rifle.id).then(function (shots) {
            if (!shots || !shots.length) return null;
            // Average vertical offset (cold-bore entries carry vertMOA/horizMOA)
            var sumV = 0, n = 0;
            shots.forEach(function (s) {
                if (typeof s.vertMOA === 'number') { sumV += s.vertMOA; n++; }
            });
            if (!n) return null;
            var v = sumV / n;
            if (Math.abs(v) < 0.1) return 'First shot goes where you aim';
            return 'First shot ' + formatFixed(Math.abs(v), 1) + ' ' +
                (v > 0 ? 'high — hold under' : 'low — hold over');
        }).catch(function () { return null; });
    }

    return {
        KEYS: KEYS,
        DEFS: DEFS,
        init: init,
        show: show,
        hasActiveTools: hasActiveTools,
        visibleTools: visibleTools,
        getChipRifleId: getChipRifleId,
        setChipRifleId: setChipRifleId,
        openSwitcher: openSwitcher
    };
})();

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Categories: Categories };
}
