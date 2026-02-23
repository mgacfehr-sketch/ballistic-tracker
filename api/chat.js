module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    var apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        res.status(500).json({ error: 'API key not configured on server' });
        return;
    }

    var { system, messages } = req.body || {};
    if (!messages || !Array.isArray(messages)) {
        res.status(400).json({ error: 'Missing or invalid messages array' });
        return;
    }

    try {
        var response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 1024,
                system: system || '',
                messages: messages
            })
        });

        var data = await response.json();

        if (!response.ok) {
            res.status(response.status).json(data);
            return;
        }

        res.status(200).json(data);
    } catch (err) {
        res.status(502).json({ error: 'Failed to reach Anthropic API' });
    }
};
