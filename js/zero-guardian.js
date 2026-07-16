/**
 * zero-guardian.js — plain-English zero verdict banner.
 *
 * A thin presentation skin over the existing results engine: takes the
 * session results' ATZ values, runs the pure zeroVerdict() from
 * calculations.js, and renders a big green "ZERO CONFIRMED" or an amber
 * "Adjust: X clicks DOWN, Y clicks RIGHT" banner above the detailed
 * stats. Includes a scope click-value selector (1/4 or 1/8 MOA, stored
 * as a localStorage setting).
 *
 * Gated by hasFeature('zeroGuardian'). No storage of its own beyond the
 * click-value preference; session-flow asks isConfirmed() when saving to
 * set the session's isZeroSession flag.
 */

var ZeroGuardian = (function () {

    var CLICK_KEY = 'yort_zg_click';
    var TOLERANCE_MOA = 0.25;

    function enabled() {
        return typeof hasFeature === 'function' && hasFeature('zeroGuardian');
    }

    function getClickValue() {
        try {
            var v = parseFloat(localStorage.getItem(CLICK_KEY));
            if (v === 0.125 || v === 0.25) return v;
        } catch (e) { /* localStorage unavailable */ }
        return 0.25;
    }

    function setClickValue(v) {
        try { localStorage.setItem(CLICK_KEY, String(v)); } catch (e) { /* ignore */ }
    }

    function _atzFromResults(results) {
        if (!results || typeof results.atzElevationMOA !== 'number') return null;
        return {
            elevationMOA: results.atzElevationMOA,
            windageMOA: results.atzWindageMOA,
            elevationDir: results.atzElevationDir,
            windageDir: results.atzWindageDir
        };
    }

    /**
     * Verdict for a results object with the current click preference,
     * or null when no POA/ATZ data exists.
     */
    function verdictFor(results) {
        var atz = _atzFromResults(results);
        if (!atz) return null;
        return zeroVerdict(atz, getClickValue(), TOLERANCE_MOA);
    }

    /**
     * True only when the feature is on AND the verdict is a confirmed
     * zero — used by session-flow for the isZeroSession flag.
     */
    function isConfirmed(results) {
        if (!enabled()) return false;
        var v = verdictFor(results);
        return !!(v && v.confirmed);
    }

    /**
     * Render the banner into a container. No POA → renders nothing.
     */
    function render(container, results) {
        if (!container) return;
        if (!enabled()) { container.innerHTML = ''; return; }

        var v = verdictFor(results);
        if (!v) {
            container.innerHTML = '';
            return;
        }

        var html;
        if (v.confirmed) {
            html = '<div class="zg-banner zg-confirmed">✓ ZERO CONFIRMED' +
                '<span class="zg-sub">Group center within ' + TOLERANCE_MOA + ' MOA of point of aim</span></div>';
        } else {
            var parts = [];
            if (v.elevClicks > 0) parts.push(v.elevClicks + ' click' + (v.elevClicks === 1 ? '' : 's') + ' ' + v.elevDir.toUpperCase());
            if (v.windClicks > 0) parts.push(v.windClicks + ' click' + (v.windClicks === 1 ? '' : 's') + ' ' + v.windDir.toUpperCase());
            // Off in MOA but rounds to 0 clicks on both axes
            var text = parts.length ? 'Adjust: ' + parts.join(', ') : 'Almost there — less than 1 click off';
            html = '<div class="zg-banner zg-adjust">' + text +
                '<span class="zg-sub">Then shoot a confirmation group</span></div>';
        }

        html += '<div class="zg-click-row"><label for="zg-click">Scope clicks</label>';
        html += '<select id="zg-click">';
        html += '<option value="0.25"' + (getClickValue() === 0.25 ? ' selected' : '') + '>1/4 MOA</option>';
        html += '<option value="0.125"' + (getClickValue() === 0.125 ? ' selected' : '') + '>1/8 MOA</option>';
        html += '</select></div>';

        container.innerHTML = html;
        var sel = container.querySelector('#zg-click');
        sel.addEventListener('change', function () {
            setClickValue(parseFloat(this.value));
            render(container, results); // re-render with new click math
        });
    }

    return {
        render: render,
        isConfirmed: isConfirmed,
        verdictFor: verdictFor,
        getClickValue: getClickValue
    };
})();
