/**
 * net.js — Network service layer (NetService).
 *
 * All calls to the app's own backend go through here so the base URL
 * stays configurable — a Capacitor WebView cannot resolve root-relative
 * paths like '/api/chat'. External API calls (e.g. weather) will be
 * consolidated here as they are touched (CLAUDE.md Build Principle #1).
 */

var NetService = (function () {

    /**
     * Base URL for the serverless API. '' = same origin (web deploy).
     * Native/Capacitor builds set localStorage 'yort_api_base' to the
     * deployed origin (e.g. 'https://yort.example.com').
     */
    function apiBase() {
        try {
            var stored = localStorage.getItem('yort_api_base');
            if (stored) return stored.replace(/\/+$/, '');
        } catch (e) {
            // localStorage unavailable — same-origin fallback
        }
        return '';
    }

    /**
     * POST to the Claude chat proxy.
     * @param {Object} body - { system, messages }
     * @returns {Promise<Response>}
     */
    function apiChat(body) {
        return fetch(apiBase() + '/api/chat', {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify(body)
        });
    }

    /**
     * Public base URL of the app itself — used for QR deep links on
     * certificates. Override via localStorage 'yort_app_base' (e.g. the
     * production origin when generating from a dev machine, or the
     * hosted URL from inside a Capacitor build).
     */
    function appBaseUrl() {
        try {
            var stored = localStorage.getItem('yort_app_base');
            if (stored) return stored.replace(/\/+$/, '');
        } catch (e) { /* localStorage unavailable */ }
        return window.location.origin +
            window.location.pathname.replace(/index\.html$/, '').replace(/\/+$/, '');
    }

    // ── Conditions (GPS + weather station) ────────────────────

    /**
     * Meteorological degrees ("wind FROM") → compass string.
     */
    function _degreesToCompass(degrees) {
        var dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        var index = Math.round(((degrees % 360) + 360) % 360 / 22.5) % 16;
        return 'from ' + dirs[index];
    }

    /**
     * Promisified geolocation. Rejects with .code = 'unsupported' or
     * 'denied' so callers can degrade silently.
     */
    function getPosition() {
        return new Promise(function (resolve, reject) {
            if (!navigator.geolocation) {
                var e = new Error('Geolocation is not supported by this browser.');
                e.code = 'unsupported';
                reject(e);
                return;
            }
            navigator.geolocation.getCurrentPosition(resolve, function () {
                var e = new Error('Location access denied.');
                e.code = 'denied';
                reject(e);
            }, { timeout: 10000 });
        });
    }

    /**
     * CAPACITOR SEAM — device barometer.
     * There is NO web Barometer API; browsers cannot read the phone's
     * pressure sensor. When the app is wrapped with Capacitor, a plugin
     * implementation replaces this to return station-independent local
     * pressure in inHg. Until then it resolves null and getConditions()
     * falls back to the weather station's surface pressure.
     * @returns {Promise<number|null>} inHg or null
     */
    function getDevicePressure() {
        return Promise.resolve(null);
    }

    /**
     * One-call conditions pipeline: GPS position → Open-Meteo current
     * weather + elevation → one normalized snapshot. Elevation failure
     * is non-fatal (altitude comes back null).
     *
     * @returns {Promise<{temperature, humidity, pressure, windSpeed,
     *   windDirection, altitude, latitude, longitude, source}>}
     *   Numbers are rounded for direct display; nulls where unknown.
     */
    function getConditions() {
        return getPosition().then(function (position) {
            var lat = position.coords.latitude.toFixed(4);
            var lon = position.coords.longitude.toFixed(4);

            var weatherReq = fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
                '&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m' +
                '&temperature_unit=fahrenheit&wind_speed_unit=mph')
                .then(function (res) { return res.json(); });

            var elevationReq = fetch('https://api.open-meteo.com/v1/elevation?latitude=' + lat + '&longitude=' + lon)
                .then(function (res) { return res.json(); })
                .catch(function () { return null; }); // non-fatal

            return Promise.all([weatherReq, elevationReq, getDevicePressure()])
                .then(function (results) {
                    var c = (results[0] && results[0].current) || {};
                    var elev = results[1] && results[1].elevation && results[1].elevation[0] != null
                        ? results[1].elevation[0] : null;
                    var devicePressure = results[2];

                    return {
                        temperature: c.temperature_2m != null ? Math.round(c.temperature_2m) : null,
                        humidity: c.relative_humidity_2m != null ? Math.round(c.relative_humidity_2m) : null,
                        pressure: devicePressure !== null ? devicePressure
                            : (c.surface_pressure != null ? Math.round(c.surface_pressure * 0.02953 * 100) / 100 : null),
                        windSpeed: c.wind_speed_10m != null ? Math.round(c.wind_speed_10m) : null,
                        windDirection: c.wind_direction_10m != null ? _degreesToCompass(c.wind_direction_10m) : null,
                        altitude: elev !== null ? Math.round(elev * 3.28084) : null,
                        latitude: parseFloat(lat),
                        longitude: parseFloat(lon),
                        source: devicePressure !== null ? 'device+station' : 'station'
                    };
                });
        });
    }

    return {
        apiBase: apiBase,
        apiChat: apiChat,
        appBaseUrl: appBaseUrl,
        getPosition: getPosition,
        getConditions: getConditions,
        getDevicePressure: getDevicePressure
    };
})();
