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

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RifleCards: RifleCards };
}
