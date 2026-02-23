/**
 * ai-assistant.js — AI chat assistant powered by Claude API.
 *
 * Gathers rifle history from IndexedDB and sends it as context
 * to the Anthropic Messages API for shooting analysis and advice.
 */

function AIAssistantManager(db) {
    this.db = db;
    this.container = null;
    this.messages = [];
    this.selectedRifleId = null;
    this.isLoading = false;
}

/**
 * Grab DOM container.
 */
AIAssistantManager.prototype.init = function () {
    this.container = document.getElementById('view-ai');
};

/**
 * Called when AI tab is activated. Renders the full chat UI.
 */
AIAssistantManager.prototype.show = function () {
    if (!this.db) {
        this.container.innerHTML =
            '<div class="ai-no-key">' +
            '<div class="ai-no-key-title">Database Unavailable</div>' +
            '<div class="ai-no-key-text">Close other tabs and reload.</div>' +
            '</div>';
        return;
    }

    this._renderChat();
};

/**
 * Build the full chat UI: rifle selector, messages area, input bar.
 */
AIAssistantManager.prototype._renderChat = function () {
    var self = this;

    this.db.getAllRifles().then(function (rifles) {
        var html = '';

        // Rifle selector header
        html += '<div class="ai-chat-header">';
        html += '<label for="ai-rifle-select">Rifle:</label>';
        html += '<select id="ai-rifle-select">';
        html += '<option value="">General (no rifle)</option>';
        for (var i = 0; i < rifles.length; i++) {
            var selected = rifles[i].id === self.selectedRifleId ? ' selected' : '';
            html += '<option value="' + rifles[i].id + '"' + selected + '>' +
                self._escapeHtml(rifles[i].name || 'Unnamed') +
                (rifles[i].caliber ? ' — ' + self._escapeHtml(rifles[i].caliber) : '') +
                '</option>';
        }
        html += '</select>';
        html += '</div>';

        // Messages area
        html += '<div class="ai-messages" id="ai-messages">';
        if (self.messages.length === 0) {
            html += '<div class="ai-welcome">Ask questions about your rifle, loads, or shooting performance. ' +
                'Select a rifle above for personalized analysis based on your session history.</div>';
        } else {
            for (var j = 0; j < self.messages.length; j++) {
                var msg = self.messages[j];
                if (msg.role === 'user') {
                    html += '<div class="ai-message ai-message-user">' + self._escapeHtml(msg.content) + '</div>';
                } else {
                    html += '<div class="ai-message ai-message-assistant">' + self._escapeHtml(msg.content) + '</div>';
                }
            }
        }
        if (self.isLoading) {
            html += '<div class="ai-loading"><div class="ai-loading-dot"></div><div class="ai-loading-dot"></div><div class="ai-loading-dot"></div></div>';
        }
        html += '</div>';

        // Input bar
        html += '<div class="ai-input-bar">';
        html += '<textarea class="ai-input" id="ai-input" placeholder="Ask about your shooting data..." rows="1"></textarea>';
        html += '<button class="ai-send-btn" id="ai-send-btn" title="Send">';
        html += '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
        html += '</button>';
        html += '</div>';

        self.container.innerHTML = html;

        // Bind events
        self._bindChatEvents();

        // Scroll to bottom
        self._scrollToBottom();
    });
};

/**
 * Bind event listeners for the chat UI.
 */
AIAssistantManager.prototype._bindChatEvents = function () {
    var self = this;
    var sendBtn = document.getElementById('ai-send-btn');
    var input = document.getElementById('ai-input');
    var rifleSelect = document.getElementById('ai-rifle-select');

    if (sendBtn && input) {
        sendBtn.addEventListener('click', function () {
            self._handleSend();
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                self._handleSend();
            }
        });

        // Auto-resize textarea
        input.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
    }

    if (rifleSelect) {
        rifleSelect.addEventListener('change', function () {
            var newId = this.value || null;
            if (newId !== self.selectedRifleId) {
                self.selectedRifleId = newId;
                self.messages = [];
                self._renderChat();
            }
        });
    }
};

/**
 * Handle the send button click.
 */
AIAssistantManager.prototype._handleSend = function () {
    var input = document.getElementById('ai-input');
    if (!input) return;

    var text = input.value.trim();
    if (!text || this.isLoading) return;

    input.value = '';
    input.style.height = 'auto';
    this._sendMessage(text);
};

/**
 * Main send flow: add user message, gather context, call API, show response.
 */
AIAssistantManager.prototype._sendMessage = function (userText) {
    var self = this;

    // Add user message
    this.messages.push({ role: 'user', content: userText });
    this._appendMessage('user', userText);
    this._showLoading(true);

    // Gather context and call API
    var contextPromise = this.selectedRifleId
        ? this._gatherContext(this.selectedRifleId)
        : Promise.resolve(null);

    contextPromise.then(function (context) {
        var systemPrompt = self._buildSystemPrompt(context);
        return self._callAPI(systemPrompt);
    }).then(function (responseText) {
        self.messages.push({ role: 'assistant', content: responseText });
        self._showLoading(false);
        self._appendMessage('assistant', responseText);
    }).catch(function (err) {
        self._showLoading(false);
        self._appendError(err.message || 'An error occurred');
    });
};

/**
 * Gather all relevant data for a rifle to build context.
 */
AIAssistantManager.prototype._gatherContext = function (rifleId) {
    var self = this;
    var ctx = {};

    return Promise.all([
        self.db.getRifle(rifleId),
        self.db.getLoadsByRifle(rifleId),
        self.db.getBarrelsByRifle(rifleId),
        self.db.getSessionsByRifle(rifleId),
        self.db.getCleaningLogsByRifle(rifleId),
        self.db.getScopeAdjustmentsByRifle(rifleId),
        self.db.getZeroRecordsByRifle(rifleId)
    ]).then(function (results) {
        ctx.rifle = results[0];
        ctx.loads = results[1];
        ctx.barrels = results[2];

        // Sort sessions by date desc, take last 20
        var sessions = results[3] || [];
        sessions.sort(function (a, b) {
            return (b.date || '').localeCompare(a.date || '');
        });
        ctx.sessions = sessions.slice(0, 20);

        ctx.cleaningLogs = results[4] || [];
        ctx.scopeAdjustments = results[5] || [];
        ctx.zeroRecords = results[6] || [];

        return ctx;
    });
};

/**
 * Build a structured system prompt from the gathered context.
 */
AIAssistantManager.prototype._buildSystemPrompt = function (context) {
    var lines = [];
    lines.push('You are Yort, an expert precision rifle shooting coach and ballistics analyst.');
    lines.push('You help shooters analyze their performance data, diagnose issues, and improve accuracy.');
    lines.push('Be concise and practical. Use MOA or MIL as appropriate. Reference specific data when available.');
    lines.push('When introducing yourself or asked who you are, say you are Yort.');
    lines.push('');

    if (!context) {
        lines.push('The user has not selected a specific rifle. Answer general ballistics and shooting questions.');
        return lines.join('\n');
    }

    // Rifle info
    if (context.rifle) {
        var r = context.rifle;
        lines.push('=== RIFLE ===');
        lines.push('Name: ' + (r.name || 'Unknown'));
        lines.push('Caliber: ' + (r.caliber || 'Unknown'));
        if (r.scopeHeight) lines.push('Scope Height: ' + r.scopeHeight + '"');
        if (r.zeroRange) lines.push('Zero Range: ' + r.zeroRange + ' yards');
        lines.push('Angle Unit: ' + (r.angleUnit || 'MOA'));
        if (r.notes) lines.push('Notes: ' + r.notes);
        lines.push('');
    }

    // Barrels
    if (context.barrels && context.barrels.length > 0) {
        lines.push('=== BARRELS ===');
        for (var b = 0; b < context.barrels.length; b++) {
            var barrel = context.barrels[b];
            lines.push((barrel.isActive ? '[ACTIVE] ' : '') +
                'Twist: ' + (barrel.twistRate || '?') + ' ' + (barrel.twistDirection || '') +
                ', Installed: ' + (barrel.installDate || '?'));
            if (barrel.notes) lines.push('  Notes: ' + barrel.notes);
        }
        lines.push('');
    }

    // Loads
    if (context.loads && context.loads.length > 0) {
        lines.push('=== LOADS ===');
        for (var l = 0; l < context.loads.length; l++) {
            var load = context.loads[l];
            var loadInfo = (load.name || 'Unnamed') + ': ';
            if (load.bulletName) loadInfo += load.bulletName + ' ';
            if (load.bulletWeight) loadInfo += load.bulletWeight + 'gr ';
            if (load.bulletDiameter) loadInfo += load.bulletDiameter + '" dia ';
            if (load.bulletBC) loadInfo += 'BC ' + load.bulletBC + ' ' + (load.dragModel || 'G1');
            if (load.muzzleVelocity) loadInfo += ', MV ' + load.muzzleVelocity + ' fps';
            lines.push(loadInfo);
        }
        lines.push('');
    }

    // Sessions summary
    if (context.sessions && context.sessions.length > 0) {
        lines.push('=== RECENT SESSIONS (last ' + context.sessions.length + ') ===');
        for (var s = 0; s < context.sessions.length; s++) {
            var sess = context.sessions[s];
            var sessionLine = '';

            // Date
            if (sess.date) {
                sessionLine += sess.date.split('T')[0] + ' | ';
            }

            // Distance
            sessionLine += (sess.distanceYards || '?') + 'yds';

            // Group size / MOA from results
            if (sess.results) {
                if (sess.results.groupSizeInches !== undefined) {
                    sessionLine += ' | Group: ' + sess.results.groupSizeInches.toFixed(3) + '"';
                }
                if (sess.results.groupSizeMOA !== undefined) {
                    sessionLine += ' (' + sess.results.groupSizeMOA.toFixed(2) + ' MOA)';
                }
                if (sess.results.meanRadiusMOA !== undefined) {
                    sessionLine += ' | MR: ' + sess.results.meanRadiusMOA.toFixed(2) + ' MOA';
                }
                if (sess.results.atzMOA) {
                    var atz = sess.results.atzMOA;
                    sessionLine += ' | ATZ: ';
                    if (atz.elevation !== undefined) sessionLine += 'E ' + atz.elevation.toFixed(2);
                    if (atz.windage !== undefined) sessionLine += ' W ' + atz.windage.toFixed(2);
                }
            }

            // Rounds fired
            if (sess.roundsFired) sessionLine += ' | ' + sess.roundsFired + 'rds';

            // Velocity
            if (sess.measuredVelocity) sessionLine += ' | ' + sess.measuredVelocity + 'fps';

            // Weather
            if (sess.weather) {
                var w = sess.weather;
                var wx = [];
                if (w.tempF !== undefined && w.tempF !== null) wx.push(w.tempF + 'F');
                if (w.humidity !== undefined && w.humidity !== null) wx.push(w.humidity + '%RH');
                if (w.windMph !== undefined && w.windMph !== null) {
                    var windStr = w.windMph + 'mph';
                    if (w.windDirection) windStr += ' ' + w.windDirection;
                    wx.push(windStr);
                }
                if (wx.length > 0) sessionLine += ' | Wx: ' + wx.join(', ');
            }

            lines.push(sessionLine);
        }
        lines.push('');
    }

    // Cleaning logs
    if (context.cleaningLogs && context.cleaningLogs.length > 0) {
        lines.push('=== CLEANING HISTORY (last 10) ===');
        var cleanLogs = context.cleaningLogs.slice(0, 10);
        for (var c = 0; c < cleanLogs.length; c++) {
            var cl = cleanLogs[c];
            lines.push((cl.date ? cl.date.split('T')[0] : '?') +
                (cl.roundCountAtCleaning ? ' at ' + cl.roundCountAtCleaning + ' rounds' : '') +
                (cl.notes ? ' — ' + cl.notes : ''));
        }
        lines.push('');
    }

    // Scope adjustments
    if (context.scopeAdjustments && context.scopeAdjustments.length > 0) {
        lines.push('=== SCOPE ADJUSTMENTS (last 10) ===');
        var adjs = context.scopeAdjustments.slice(0, 10);
        for (var a = 0; a < adjs.length; a++) {
            var adj = adjs[a];
            lines.push((adj.date ? adj.date.split('T')[0] : '?') +
                ' | Elev: ' + (adj.elevationChange || 0) +
                ', Wind: ' + (adj.windageChange || 0) +
                (adj.reason ? ' — ' + adj.reason : ''));
        }
        lines.push('');
    }

    // Zero records
    if (context.zeroRecords && context.zeroRecords.length > 0) {
        lines.push('=== ZERO RECORDS ===');
        for (var z = 0; z < context.zeroRecords.length; z++) {
            var zr = context.zeroRecords[z];
            lines.push((zr.date || '?') + ' at ' + (zr.rangeYards || '?') + 'yds' +
                (zr.notes ? ' — ' + zr.notes : ''));
        }
        lines.push('');
    }

    return lines.join('\n');
};

/**
 * Call the API proxy at /api/chat.
 */
AIAssistantManager.prototype._callAPI = function (systemPrompt) {
    var self = this;

    return new Promise(function (resolve, reject) {
        fetch('/api/chat', {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                system: systemPrompt,
                messages: self.messages.filter(function (m) {
                    return m.role === 'user' || m.role === 'assistant';
                })
            })
        }).then(function (response) {
            return response.json().then(function (data) {
                if (!response.ok) {
                    var errMsg = 'API error';
                    if (response.status === 429) {
                        errMsg = 'Rate limited. Please wait a moment and try again.';
                    } else if (response.status === 529) {
                        errMsg = 'API is overloaded. Please try again later.';
                    } else if (data && data.error && data.error.message) {
                        errMsg = data.error.message;
                    } else if (data && data.error) {
                        errMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
                    }
                    throw new Error(errMsg);
                }
                return data;
            });
        }).then(function (data) {
            if (data.content && data.content.length > 0 && data.content[0].text) {
                resolve(data.content[0].text);
            } else {
                reject(new Error('Unexpected API response format'));
            }
        }).catch(function (err) {
            if (err.message === 'Failed to fetch') {
                reject(new Error('Network error. Check your connection.'));
            } else {
                reject(err);
            }
        });
    });
};

/**
 * Append a message bubble to the chat messages area.
 */
AIAssistantManager.prototype._appendMessage = function (role, content) {
    var messagesEl = document.getElementById('ai-messages');
    if (!messagesEl) return;

    // Remove welcome message if present
    var welcome = messagesEl.querySelector('.ai-welcome');
    if (welcome) welcome.remove();

    var div = document.createElement('div');
    div.className = 'ai-message ai-message-' + role;
    div.textContent = content;
    messagesEl.appendChild(div);
    this._scrollToBottom();
};

/**
 * Append an error message to the chat.
 */
AIAssistantManager.prototype._appendError = function (message) {
    var messagesEl = document.getElementById('ai-messages');
    if (!messagesEl) return;

    var div = document.createElement('div');
    div.className = 'ai-error';
    div.textContent = message;
    messagesEl.appendChild(div);
    this._scrollToBottom();
};

/**
 * Show or hide the loading indicator.
 */
AIAssistantManager.prototype._showLoading = function (show) {
    this.isLoading = show;
    var messagesEl = document.getElementById('ai-messages');
    var sendBtn = document.getElementById('ai-send-btn');
    if (!messagesEl) return;

    // Remove existing loading indicator
    var existing = messagesEl.querySelector('.ai-loading');
    if (existing) existing.remove();

    if (show) {
        var loading = document.createElement('div');
        loading.className = 'ai-loading';
        loading.innerHTML = '<div class="ai-loading-dot"></div><div class="ai-loading-dot"></div><div class="ai-loading-dot"></div>';
        messagesEl.appendChild(loading);
        this._scrollToBottom();
    }

    if (sendBtn) {
        sendBtn.disabled = show;
    }
};

/**
 * Scroll the messages area to the bottom.
 */
AIAssistantManager.prototype._scrollToBottom = function () {
    var messagesEl = document.getElementById('ai-messages');
    if (messagesEl) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }
};

/**
 * Escape HTML special characters.
 */
AIAssistantManager.prototype._escapeHtml = function (str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
};
