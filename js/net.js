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

    return {
        apiBase: apiBase,
        apiChat: apiChat
    };
})();
