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
 * Stage A / entitlement features — the single gate point for tiered
 * features (CLAUDE.md Build Principle #4). UI modules call hasFeature()
 * and never inline tier logic. When subscription billing arrives, this
 * function becomes the entitlement check; for now Stage A ships enabled.
 */
var STAGE_A_FEATURES = {
    chronoImport:   { label: 'Garmin Chrono Import',      desc: 'Import ShotView velocity exports (CSV/XLSX)' },
    certificate:    { label: 'Certificate of Performance', desc: 'Per-rifle performance report and PDF certificate' },
    zeroGuardian:   { label: 'Zero Guardian',             desc: 'Plain-English zero confirmed / clicks-needed verdict' },
    autoConditions: { label: 'Auto Conditions',           desc: 'Automatic GPS + weather station conditions' },
    onboarding:     { label: 'Smart Onboarding',          desc: 'Ammo-box photo OCR and certificate QR deep links' }
};

function hasFeature(featureName) {
    return Object.prototype.hasOwnProperty.call(STAGE_A_FEATURES, featureName);
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
