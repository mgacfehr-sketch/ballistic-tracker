/**
 * beta-features.js — Feature flag system for beta/admin-only features.
 *
 * Features are hidden behind flags. Admin always has access.
 * The admin page has toggles to release features to all users.
 */

var BETA_FEATURES = {
    windCall:       { key: 'beta_wind_call',       label: 'Wind Call Helper',             desc: 'Compass-based wind hold calculator with drift, Coriolis, and spin drift' },
    dopeLog:        { key: 'beta_dope_log',        label: 'Come-Up Verification & BC Truing', desc: 'Log verified hits to back-calculate true BC' },
    coldBore:       { key: 'beta_cold_bore',       label: 'Cold Bore Tracking',           desc: 'Track cold bore shot offset trends over time' },
    quickStart:     { key: 'beta_quick_start',     label: 'Quick Session Start',          desc: 'One-tap rifle buttons to start sessions with auto-weather' },
    highContrast:   { key: 'beta_high_contrast',   label: 'High Contrast / Sunlight Mode', desc: 'High-visibility mode for bright outdoor conditions' },
    offlineMode:    { key: 'beta_offline_mode',    label: 'Offline Mode',                 desc: 'Cache profiles and solver for offline use' },
    sessionCompare: { key: 'beta_session_compare', label: 'Session Comparison via yorT',  desc: 'Ask yorT to compare sessions with stats and images' }
};

// Set during app init
var _currentUserId = null;

/**
 * Initialize the beta system with the current user.
 */
function initBetaFeatures(userId) {
    _currentUserId = userId;
}

/**
 * Check if the current user is the admin.
 */
function isAdmin() {
    return _currentUserId === ADMIN_USER_ID;
}

/**
 * Check if a beta feature is available to the current user.
 * Currently ALL beta features are disabled for everyone (including admin).
 * To re-enable, restore the original logic below.
 */
function isBetaEnabled(featureName) {
    // ── All beta features hidden until ready for release ──
    return false;
    // Original logic (re-enable when ready):
    // if (isAdmin()) return true;
    // var feat = BETA_FEATURES[featureName];
    // if (!feat) return false;
    // try {
    //     var val = localStorage.getItem('yort_' + feat.key);
    //     return val === 'true';
    // } catch (e) {
    //     return false;
    // }
}

/**
 * Set whether a beta feature is released to all users.
 */
function setBetaFlag(featureName, enabled) {
    var feat = BETA_FEATURES[featureName];
    if (!feat) return;
    try {
        localStorage.setItem('yort_' + feat.key, enabled ? 'true' : 'false');
    } catch (e) {
        // localStorage unavailable
    }
}

/**
 * Get the release state of a beta flag.
 */
function getBetaFlag(featureName) {
    var feat = BETA_FEATURES[featureName];
    if (!feat) return false;
    try {
        return localStorage.getItem('yort_' + feat.key) === 'true';
    } catch (e) {
        return false;
    }
}
