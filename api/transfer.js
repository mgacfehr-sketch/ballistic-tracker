/**
 * api/transfer.js — certificate cross-account transfer endpoint (§2.11).
 *
 * The Workhorse flow: Troy certifies a rifle in HIS account; the buyer
 * scans the certificate QR and the rifle's calibrated profile imports
 * into THEIR account. Tokens are SINGLE-USE, minted and redeemed only
 * here (never trust the client): the certificate_transfers table has
 * SELECT-only RLS for users — all writes happen with the service role.
 *
 * Env (Vercel project settings):
 *   SUPABASE_URL               — the project URL (same as the client's)
 *   SUPABASE_SERVICE_ROLE_KEY  — service role secret (server-side only)
 *
 * POST { action: 'mint',   rifleSnapshot: {...} }   + Authorization: Bearer <user jwt>
 *   → { token }
 * POST { action: 'redeem', token: '...' }            + Authorization: Bearer <user jwt>
 *   → { snapshot, mintedAt, certifiedBy }
 */

var crypto = require('crypto');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    var supabaseUrl = process.env.SUPABASE_URL;
    var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
        res.status(500).json({ error: 'Transfer service not configured on server' });
        return;
    }

    // Authenticate the caller: their Supabase JWT must resolve to a user
    var auth = req.headers.authorization || '';
    var jwt = auth.replace(/^Bearer\s+/i, '');
    if (!jwt) {
        res.status(401).json({ error: 'Sign in to transfer a rifle' });
        return;
    }
    var userId = null;
    try {
        var userResp = await fetch(supabaseUrl + '/auth/v1/user', {
            headers: { apikey: serviceKey, Authorization: 'Bearer ' + jwt }
        });
        if (userResp.ok) {
            var user = await userResp.json();
            userId = user && user.id;
        }
    } catch (e) { /* treated as unauthenticated below */ }
    if (!userId) {
        res.status(401).json({ error: 'Could not verify your sign-in' });
        return;
    }

    function rest(path, opts) {
        opts = opts || {};
        opts.headers = Object.assign({
            apikey: serviceKey,
            Authorization: 'Bearer ' + serviceKey,
            'content-type': 'application/json',
            Prefer: 'return=representation'
        }, opts.headers || {});
        return fetch(supabaseUrl + '/rest/v1' + path, opts);
    }

    var body = req.body || {};

    try {
        if (body.action === 'mint') {
            var snapshot = body.rifleSnapshot;
            if (!snapshot || typeof snapshot !== 'object' || !snapshot.rifle) {
                res.status(400).json({ error: 'Missing rifle snapshot' });
                return;
            }
            var token = crypto.randomBytes(24).toString('base64url');
            var insert = await rest('/certificate_transfers', {
                method: 'POST',
                body: JSON.stringify({
                    token: token,
                    rifle_snapshot: snapshot,
                    minted_by: userId
                })
            });
            if (!insert.ok) {
                var errText = await insert.text();
                res.status(502).json({ error: 'Could not mint the transfer', detail: errText.slice(0, 200) });
                return;
            }
            res.status(200).json({ token: token });
            return;
        }

        if (body.action === 'redeem') {
            var t = String(body.token || '');
            if (!t) {
                res.status(400).json({ error: 'Missing token' });
                return;
            }
            // Single-use enforcement: only an unredeemed token updates.
            // PATCH with the redeemed_at IS NULL filter is atomic in PostgREST.
            var redeem = await rest(
                '/certificate_transfers?token=eq.' + encodeURIComponent(t) + '&redeemed_at=is.null',
                {
                    method: 'PATCH',
                    body: JSON.stringify({
                        redeemed_by: userId,
                        redeemed_at: new Date().toISOString()
                    })
                }
            );
            if (!redeem.ok) {
                res.status(502).json({ error: 'Transfer lookup failed' });
                return;
            }
            var rows = await redeem.json();
            if (!rows || !rows.length) {
                res.status(410).json({ error: 'This transfer was already redeemed or the code is invalid.' });
                return;
            }
            var row = rows[0];
            res.status(200).json({
                snapshot: row.rifle_snapshot,
                mintedAt: row.minted_at,
                mintedBy: row.minted_by
            });
            return;
        }

        res.status(400).json({ error: 'Unknown action' });
    } catch (err) {
        res.status(502).json({ error: 'Transfer service error' });
    }
};
