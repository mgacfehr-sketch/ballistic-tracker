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
    this.conversationId = null;
    this.conversationTitle = null;
    this.pendingImage = null; // { base64, mediaType }
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
        html += '<button class="btn btn-secondary btn-sm" id="ai-weather-btn" title="Get current weather">Weather</button>';
        html += '</div>';

        // Conversation toolbar
        html += '<div class="ai-conv-toolbar">';
        html += '<button class="btn btn-secondary btn-sm" id="ai-new-chat-btn">New Chat</button>';
        html += '<button class="btn btn-secondary btn-sm" id="ai-history-btn">History</button>';
        if (self.conversationTitle) {
            html += '<span class="ai-conv-title">' + self._escapeHtml(self.conversationTitle) + '</span>';
        }
        html += '</div>';

        // Conversation history panel (hidden by default)
        html += '<div class="ai-conv-history" id="ai-conv-history" style="display:none;">';
        html += '<div class="ai-conv-history-loading">Loading...</div>';
        html += '</div>';

        // Messages area
        html += '<div class="ai-messages" id="ai-messages">';
        if (self.messages.length === 0) {
            html += '<div class="ai-welcome">' +
                'I can help with:<br>' +
                '\u2022 Dial-ups and come-ups for any range<br>' +
                '\u2022 Group analysis and performance trends<br>' +
                '\u2022 Load comparisons across your profiles<br>' +
                '\u2022 Target image analysis<br>' +
                '\u2022 General ballistics questions<br><br>' +
                'Select a rifle above for personalized data. ' +
                'Tap <b>Weather</b> to auto-fill current conditions.</div>';
        } else {
            for (var j = 0; j < self.messages.length; j++) {
                var msg = self.messages[j];
                var hasImage = false;
                var displayText = '';
                if (Array.isArray(msg.content)) {
                    // Multipart content — extract text and check for images
                    for (var k = 0; k < msg.content.length; k++) {
                        if (msg.content[k].type === 'text') {
                            displayText += msg.content[k].text;
                        } else if (msg.content[k].type === 'image') {
                            hasImage = true;
                        }
                    }
                } else {
                    displayText = msg.content;
                }
                displayText = self._stripActionBlocks(displayText);
                if (msg.role === 'user') {
                    html += '<div class="ai-message ai-message-user">';
                    if (hasImage) html += '<div class="ai-message-img-tag">[Image attached]</div>';
                    html += self._escapeHtml(displayText);
                    html += '</div>';
                } else {
                    html += '<div class="ai-message ai-message-assistant">' + self._escapeHtml(displayText) + '</div>';
                }
            }
        }
        if (self.isLoading) {
            html += '<div class="ai-loading"><div class="ai-loading-dot"></div><div class="ai-loading-dot"></div><div class="ai-loading-dot"></div></div>';
        }
        html += '</div>';

        // Image preview strip (hidden by default)
        html += '<div class="ai-img-preview" id="ai-img-preview" style="display:none;">';
        html += '<img class="ai-img-preview-thumb" id="ai-img-preview-thumb" src="" alt="Preview">';
        html += '<button class="ai-img-preview-remove" id="ai-img-preview-remove" title="Remove image">&times;</button>';
        html += '</div>';

        // Input bar
        html += '<div class="ai-input-bar">';
        html += '<button class="ai-img-btn" id="ai-img-btn" title="Attach image">';
        html += '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
        html += '</button>';
        html += '<input type="file" id="ai-img-input" accept="image/*" capture="environment" hidden>';
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
                self.conversationId = null;
                self.conversationTitle = null;
                self._renderChat();
            }
        });
    }

    // Image upload button and file input
    var imgBtn = document.getElementById('ai-img-btn');
    var imgInput = document.getElementById('ai-img-input');
    var imgRemove = document.getElementById('ai-img-preview-remove');
    if (imgBtn && imgInput) {
        imgBtn.addEventListener('click', function () {
            imgInput.click();
        });
        imgInput.addEventListener('change', function () {
            if (this.files && this.files[0]) {
                self._stageImage(this.files[0]);
            }
            this.value = '';
        });
    }
    if (imgRemove) {
        imgRemove.addEventListener('click', function () {
            self._clearStagedImage();
        });
    }

    var weatherBtn = document.getElementById('ai-weather-btn');
    if (weatherBtn) {
        weatherBtn.addEventListener('click', function () {
            self._fetchAndInsertWeather();
        });
    }

    // New Chat button
    var newChatBtn = document.getElementById('ai-new-chat-btn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', function () {
            self.messages = [];
            self.conversationId = null;
            self.conversationTitle = null;
            self._renderChat();
        });
    }

    // History button
    var historyBtn = document.getElementById('ai-history-btn');
    if (historyBtn) {
        historyBtn.addEventListener('click', function () {
            var panel = document.getElementById('ai-conv-history');
            if (!panel) return;
            if (panel.style.display === 'none') {
                panel.style.display = 'block';
                self._loadConversationHistory();
            } else {
                panel.style.display = 'none';
            }
        });
    }
};

/**
 * Fetch current weather via geolocation + Open-Meteo and prefill chat input.
 */
AIAssistantManager.prototype._fetchAndInsertWeather = function () {
    var btn = document.getElementById('ai-weather-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Locating...'; }

    if (!navigator.geolocation) {
        if (btn) { btn.disabled = false; btn.textContent = 'Weather'; }
        alert('Geolocation is not supported by your browser.');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        function (position) {
            var lat = position.coords.latitude.toFixed(4);
            var lon = position.coords.longitude.toFixed(4);
            if (btn) btn.textContent = 'Fetching...';

            fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
                '&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m' +
                '&temperature_unit=fahrenheit&wind_speed_unit=mph')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data && data.current) {
                    var c = data.current;
                    var tempF = c.temperature_2m != null ? Math.round(c.temperature_2m) : '?';
                    var humidity = c.relative_humidity_2m != null ? Math.round(c.relative_humidity_2m) : '?';
                    var pressureInHg = c.surface_pressure != null ? (c.surface_pressure * 0.02953).toFixed(2) : '?';
                    var windMph = c.wind_speed_10m != null ? Math.round(c.wind_speed_10m) : '?';

                    var text = 'Current conditions: ' + tempF + ' degrees F, ' +
                        humidity + '% humidity, ' + pressureInHg + ' inHg, ' +
                        windMph + ' mph wind';

                    var input = document.getElementById('ai-input');
                    if (input) {
                        input.value = text;
                        input.style.height = 'auto';
                        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
                        input.focus();
                    }
                }
                if (btn) { btn.disabled = false; btn.textContent = 'Weather'; }
            })
            .catch(function () {
                if (btn) { btn.disabled = false; btn.textContent = 'Weather'; }
                alert('Failed to fetch weather data.');
            });
        },
        function () {
            if (btn) { btn.disabled = false; btn.textContent = 'Weather'; }
            alert('Location access denied. Enable location to fetch weather.');
        },
        { timeout: 10000 }
    );
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

    // Capture staged image before clearing
    var stagedImage = this.pendingImage;
    this.pendingImage = null;
    var previewEl = document.getElementById('ai-img-preview');
    if (previewEl) previewEl.style.display = 'none';

    // Build user message content (possibly multipart with image)
    var userContent;
    var hasImage = false;
    if (stagedImage) {
        userContent = [
            { type: 'image', source: { type: 'base64', media_type: stagedImage.mediaType, data: stagedImage.base64 } },
            { type: 'text', text: userText }
        ];
        hasImage = true;
    } else {
        userContent = userText;
    }

    this.messages.push({ role: 'user', content: userContent });
    this._appendMessage('user', userText, hasImage);
    this._showLoading(true);

    // Check for session reference to auto-attach image
    var autoAttachPromise;
    if (!hasImage) {
        autoAttachPromise = self._tryAutoAttachImage(userText);
    } else {
        autoAttachPromise = Promise.resolve(null);
    }

    autoAttachPromise.then(function (autoImage) {
        if (autoImage) {
            // Replace last user message with multipart including auto-attached image
            var lastMsg = self.messages[self.messages.length - 1];
            var origText = typeof lastMsg.content === 'string' ? lastMsg.content : userText;
            lastMsg.content = [
                { type: 'image', source: { type: 'base64', media_type: autoImage.mediaType, data: autoImage.base64 } },
                { type: 'text', text: origText + '\n\n[Session target image auto-attached]' }
            ];
        }

        return self._gatherContext(self.selectedRifleId);
    }).then(function (context) {
        var systemPrompt = self._buildSystemPrompt(context);
        return self._callAPI(systemPrompt);
    }).then(function (response) {
        var responseText = response.text;
        var usage = response.usage;

        self.messages.push({ role: 'assistant', content: responseText });
        self._showLoading(false);
        self._appendMessage('assistant', responseText);

        // Log AI usage
        if (usage) {
            var inputTokens = usage.input_tokens || 0;
            var outputTokens = usage.output_tokens || 0;
            var estimatedCost = (inputTokens * 3 / 1000000) + (outputTokens * 15 / 1000000);
            self.db.addUsageLog({
                rifleId: self.selectedRifleId || null,
                questionPreview: userText.substring(0, 100),
                inputTokens: inputTokens,
                outputTokens: outputTokens,
                estimatedCost: parseFloat(estimatedCost.toFixed(6))
            }).catch(function (e) {
                console.warn('[AI] Failed to log usage:', e);
            });
        }

        // Auto-title from first user message
        if (!self.conversationTitle) {
            self.conversationTitle = userText.substring(0, 60);
            if (userText.length > 60) self.conversationTitle += '...';
        }

        // Save or update conversation (strip image data to avoid bloat)
        var convData = {
            rifleId: self.selectedRifleId || null,
            title: self.conversationTitle,
            messages: self._stripImagesForStorage(self.messages)
        };

        if (self.conversationId) {
            convData.id = self.conversationId;
            self.db.updateConversation(convData).catch(function (e) {
                console.warn('[AI] Failed to update conversation:', e);
            });
        } else {
            self.db.addConversation(convData).then(function (saved) {
                self.conversationId = saved.id;
            }).catch(function (e) {
                console.warn('[AI] Failed to save conversation:', e);
            });
        }

        // Parse and execute any action blocks
        self._parseAndExecuteActions(responseText);
    }).catch(function (err) {
        self._showLoading(false);
        self._appendError(err.message || 'An error occurred');
    });
};

/**
 * Gather all relevant data: all rifles + loads (for trajectories), plus
 * detailed data for the selected rifle if one is chosen.
 */
AIAssistantManager.prototype._gatherContext = function (selectedRifleId) {
    var self = this;
    var ctx = {};

    return self.db.getAllRifles().then(function (allRifles) {
        ctx.allRifles = allRifles || [];

        // Fetch loads for every rifle
        var loadPromises = ctx.allRifles.map(function (r) {
            return self.db.getLoadsByRifle(r.id).then(function (loads) {
                return { rifleId: r.id, loads: loads || [] };
            });
        });
        return Promise.all(loadPromises);
    }).then(function (loadResults) {
        // Build a map: rifleId → loads array
        ctx.allLoadsMap = {};
        for (var i = 0; i < loadResults.length; i++) {
            ctx.allLoadsMap[loadResults[i].rifleId] = loadResults[i].loads;
        }

        // If a rifle is selected, fetch detailed data for it
        if (selectedRifleId) {
            return Promise.all([
                self.db.getRifle(selectedRifleId),
                self.db.getBarrelsByRifle(selectedRifleId),
                self.db.getSessionsByRifle(selectedRifleId),
                self.db.getCleaningLogsByRifle(selectedRifleId),
                self.db.getScopeAdjustmentsByRifle(selectedRifleId),
                self.db.getZeroRecordsByRifle(selectedRifleId),
                self.db.getConversationsByRifle(selectedRifleId)
            ]).then(function (results) {
                ctx.rifle = results[0];
                ctx.loads = ctx.allLoadsMap[selectedRifleId] || [];
                ctx.barrels = results[1] || [];

                var sessions = results[2] || [];
                sessions.sort(function (a, b) {
                    return (b.date || '').localeCompare(a.date || '');
                });
                ctx.sessions = sessions.slice(0, 20);

                ctx.cleaningLogs = results[3] || [];
                ctx.scopeAdjustments = results[4] || [];
                ctx.zeroRecords = results[5] || [];
                ctx.pastConversations = results[6] || [];

                return ctx;
            });
        }

        // For General (no rifle), still fetch past conversations
        return self.db.getConversationsByRifle(null).then(function (convs) {
            ctx.pastConversations = convs || [];
            return ctx;
        });
    }).then(function (ctx) {
        // Always compute standard atmosphere trajectories first
        ctx.trajectories = self._computeTrajectories(ctx.allRifles, ctx.allLoadsMap, {});

        // If the user has provided weather conditions in the conversation,
        // re-run the solver with those conditions for an adjusted table
        var chatWeather = self._extractWeatherFromChat();
        if (chatWeather.tempF !== undefined || chatWeather.windSpeedMph !== undefined ||
            chatWeather.humidity !== undefined || chatWeather.pressureInHg !== undefined) {
            ctx.adjustedTrajectories = self._computeTrajectories(ctx.allRifles, ctx.allLoadsMap, chatWeather);
            ctx.adjustedConditions = chatWeather;
        }

        return ctx;
    });
};

/**
 * Compute trajectory tables for every rifle+load pair that has sufficient data.
 * Returns an array of { rifleName, rifleId, loadName, loadId, conditions, table }.
 */
AIAssistantManager.prototype._computeTrajectories = function (allRifles, allLoadsMap, weather) {
    var results = [];

    for (var i = 0; i < allRifles.length; i++) {
        var rifle = allRifles[i];
        var loads = allLoadsMap[rifle.id] || [];

        for (var j = 0; j < loads.length; j++) {
            var load = loads[j];

            // Skip loads missing BC or muzzle velocity — can't compute
            if (!load.bulletBC || !load.muzzleVelocity) continue;

            var params = {
                bc: load.bulletBC,
                dragModel: load.dragModel || 'G1',
                muzzleVelocity: load.muzzleVelocity,
                scopeHeight: rifle.scopeHeight || 1.5,
                zeroRange: rifle.zeroRange || 100,
                bulletWeight: load.bulletWeight || 168,
                maxRange: 1500,
                rangeStep: 50,
                tempF: weather.tempF || 59,
                pressureInHg: weather.pressureInHg || 29.92,
                humidity: weather.humidity || 0,
                windSpeedMph: weather.windSpeedMph || 0,
                windClockPos: weather.windClockPos || 3
            };

            try {
                var result = computeTrajectory(params);
                // computeTrajectory returns { zeroAngleDeg, table }
                var table = result && result.table ? result.table : [];
                if (table.length === 0) continue;
                results.push({
                    rifleName: rifle.name || 'Unnamed',
                    rifleId: rifle.id,
                    loadName: load.name || 'Unnamed',
                    loadId: load.id,
                    conditions: {
                        tempF: params.tempF,
                        pressureInHg: params.pressureInHg,
                        humidity: params.humidity,
                        windSpeedMph: params.windSpeedMph,
                        windClockPos: params.windClockPos
                    },
                    table: table
                });
            } catch (e) {
                // Skip failed computations silently
            }
        }
    }

    return results;
};

/**
 * Scan user messages for weather conditions (temp, wind, humidity, pressure).
 * Returns an object with any found values.
 */
AIAssistantManager.prototype._extractWeatherFromChat = function () {
    var weather = {};
    for (var i = 0; i < this.messages.length; i++) {
        if (this.messages[i].role !== 'user') continue;
        var msgContent = this.messages[i].content;
        var text = '';
        if (Array.isArray(msgContent)) {
            for (var t = 0; t < msgContent.length; t++) {
                if (msgContent[t].type === 'text') text += msgContent[t].text + ' ';
            }
        } else {
            text = msgContent;
        }

        // Temperature: "85 degrees", "85°F", "temp is 85"
        var tempMatch = text.match(/(\-?\d+)\s*(?:degrees?\s*F?|°\s*F?)/i) ||
                        text.match(/temp(?:erature)?\s*(?:is|:|\s)\s*(\-?\d+)/i);
        if (tempMatch) weather.tempF = parseInt(tempMatch[1], 10);

        // Wind speed: "10 mph", "wind 10", "wind speed 10"
        var windMatch = text.match(/(\d+)\s*mph/i) ||
                        text.match(/wind\s*(?:speed)?\s*(?:is|:|\s)\s*(\d+)/i);
        if (windMatch) weather.windSpeedMph = parseInt(windMatch[1] || windMatch[2], 10);

        // Wind direction as clock: "3 o'clock", "9 oclock"
        var clockMatch = text.match(/(\d{1,2})\s*o['\u2019]?\s*clock/i);
        if (clockMatch) weather.windClockPos = parseInt(clockMatch[1], 10);

        // Humidity: "50% humidity", "humidity 50%", "50% RH"
        var humMatch = text.match(/(\d+)\s*%\s*(?:humidity|RH)/i) ||
                       text.match(/humidity\s*(?:is|:|\s)\s*(\d+)/i);
        if (humMatch) weather.humidity = parseInt(humMatch[1], 10);

        // Pressure: "29.92 inHg", "pressure 30.1"
        var presMatch = text.match(/([\d.]+)\s*(?:inHg|in\s*Hg)/i) ||
                        text.match(/pressure\s*(?:is|:|\s)\s*([\d.]+)/i);
        if (presMatch) weather.pressureInHg = parseFloat(presMatch[1]);
    }
    return weather;
};

/**
 * Build a structured system prompt from the gathered context.
 */
AIAssistantManager.prototype._buildSystemPrompt = function (context) {
    var lines = [];
    lines.push('You are yorT, an expert long-range shooting advisor built into a ballistic tracking app. You have deep knowledge of applied ballistics, including external ballistics theory as taught by Bryan Litz of Applied Ballistics, practical long-range shooting methodology used by top competitors and professional hunters like Aaron Davidson of Gunwerks, rifle system optimization, load development, reading wind, and diagnosing accuracy problems. You understand topics like spin drift, Coriolis effect, transonic instability, barrel harmonics, seating depth tuning, ES/SD optimization, and practical field shooting.');
    lines.push('');
    lines.push('When a beginner asks a question, explain it simply with practical, actionable advice. When an experienced shooter asks, engage at their technical level. Always reference the shooter\'s actual data from their rifle profiles and session history when available. Be direct and specific \u2014 give them a clear answer first, then explain the reasoning.');
    lines.push('');
    lines.push('Here are common scenarios you should handle with expert-level guidance:');
    lines.push('');
    lines.push('SCENARIO 1 - POI shift after cleaning:');
    lines.push('When a shooter says their point of impact shifted after cleaning their barrel, do NOT immediately recommend adjusting the scope. Tell them to put 10-15 rounds through the rifle first before making any scope adjustments. Many rifles shoot to a different point of impact with a clean barrel versus a fouled one. Typically by 15 rounds the barrel has settled back into its normal fouled state. Only if the POI shift persists after 15 rounds should they consider a scope adjustment.');
    lines.push('');
    lines.push('SCENARIO 2 - Hits are off at long range but zeroed at 100:');
    lines.push('When a shooter says they are zeroed at 100 yards but hitting low (or high) at longer distances beyond 500 yards, do NOT tell them to adjust their scope. The problem is almost certainly that their muzzle velocity or ballistic coefficient in their calculator does not match reality. Tell them: if they don\'t have a verified muzzle velocity from a chronograph, adjust the MV in their calculator until the predicted impact matches where they\'re actually hitting. If they are confident in their MV, then adjust the BC. This is called \'truing\' the gun. The BC printed on the bullet box is an average and may not match their specific rifle, barrel length, or conditions. Every gun shoots slightly differently and the BC needs to be trued for precise long-range work.');
    lines.push('');
    lines.push('SCENARIO 3 - POI change after switching ammo lots:');
    lines.push('When a shooter switches to a new box of the same ammo and notices point of impact has changed, explain that lot-to-lot variation in factory ammunition is real and common. Different production lots can have slight differences in powder charge, bullet concentricity, and other factors. If the shift is consistent over 10 rounds, they should re-zero for that lot. This is one reason serious long-range shooters buy ammo in bulk from the same lot or handload their own ammunition for consistency.');
    lines.push('');
    lines.push('You have access to the shooter\'s rifle profiles, load data, session history, ballistic solver results, and sometimes target images. Use this data to give personalized, specific advice rather than generic answers. When you reference numbers, use the actual data from their profiles.');
    lines.push('');
    lines.push('You also have access to pre-computed ballistic trajectory tables below.');
    lines.push('STANDARD tables use standard atmosphere (59\u00B0F, 29.92 inHg, 0% humidity, zero wind).');
    lines.push('When a user asks for a dial-up or come-up, immediately give the answer from the STANDARD table. Then say: "This is based on standard conditions (59\u00B0F, 29.92 inHg, no wind). For a more precise dial-up, what\'s the current temperature, wind speed, and wind direction?"');
    lines.push('If ADJUSTED tables are also present below (re-computed with user-provided conditions), use those instead and state the exact conditions used. Do NOT ask for conditions again.');
    lines.push('For ranges between table rows, interpolate linearly.');
    lines.push('If a user asks a ballistics question and the rifle has MULTIPLE loads, ask which load they want to use. List the load names. If the rifle has only ONE load, use it automatically without asking.');
    lines.push('If no rifle is selected and there are multiple rifles, ask which rifle. If only one rifle exists, use it automatically.');
    lines.push('When giving dial-up/come-up values, reference the ComeUp(MOA) column.');
    lines.push('');

    if (!context) {
        lines.push('No rifle data available. Answer general ballistics and shooting questions.');
        return lines.join('\n');
    }

    // If no rifle is selected, still show all rifles and trajectories
    if (!context.rifle && context.allRifles && context.allRifles.length > 0) {
        lines.push('The user has not selected a specific rifle. The following rifles are available:');
        for (var ri = 0; ri < context.allRifles.length; ri++) {
            var ar = context.allRifles[ri];
            var arLoads = context.allLoadsMap[ar.id] || [];
            lines.push('- ' + (ar.name || 'Unnamed') + (ar.caliber ? ' (' + ar.caliber + ')' : '') +
                ' — ' + arLoads.length + ' load(s)');
        }
        lines.push('');
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

    // Standard atmosphere trajectory tables
    if (context.trajectories && context.trajectories.length > 0) {
        lines.push('=== STANDARD TRAJECTORY TABLES (59\u00B0F, 29.92 inHg, 0% RH, no wind) ===');
        lines.push('');
        for (var t = 0; t < context.trajectories.length; t++) {
            var traj = context.trajectories[t];
            lines.push('--- ' + traj.rifleName + ' / ' + traj.loadName + ' ---');
            lines.push('Range(yd) | Drop(in) | Drop(MOA) | ComeUp(MOA) | Wind(in) | Wind(MOA) | Vel(fps) | Energy(ft-lb)');
            for (var row = 0; row < traj.table.length; row++) {
                var d = traj.table[row];
                lines.push(
                    d.rangeYards + ' | ' +
                    d.dropInches.toFixed(1) + ' | ' +
                    d.dropMOA.toFixed(2) + ' | ' +
                    d.comeUpMOA.toFixed(2) + ' | ' +
                    d.windDriftInches.toFixed(1) + ' | ' +
                    d.windDriftMOA.toFixed(2) + ' | ' +
                    d.velocityFps + ' | ' +
                    d.energyFtLbs
                );
            }
            lines.push('');
        }
    }

    // Adjusted trajectory tables (re-computed with user-provided conditions)
    if (context.adjustedTrajectories && context.adjustedTrajectories.length > 0) {
        var ac = context.adjustedConditions || {};
        var condParts = [];
        if (ac.tempF !== undefined) condParts.push(ac.tempF + '\u00B0F');
        if (ac.pressureInHg !== undefined) condParts.push(ac.pressureInHg + ' inHg');
        if (ac.humidity !== undefined) condParts.push(ac.humidity + '% RH');
        if (ac.windSpeedMph !== undefined) {
            var windDesc = ac.windSpeedMph + ' mph';
            if (ac.windClockPos !== undefined) windDesc += ' from ' + ac.windClockPos + " o'clock";
            condParts.push('wind ' + windDesc);
        }
        lines.push('=== ADJUSTED TRAJECTORY TABLES (' + condParts.join(', ') + ') ===');
        lines.push('Use these tables instead of the STANDARD tables above.');
        lines.push('');
        for (var at = 0; at < context.adjustedTrajectories.length; at++) {
            var atraj = context.adjustedTrajectories[at];
            lines.push('--- ' + atraj.rifleName + ' / ' + atraj.loadName + ' ---');
            lines.push('Range(yd) | Drop(in) | Drop(MOA) | ComeUp(MOA) | Wind(in) | Wind(MOA) | Vel(fps) | Energy(ft-lb)');
            for (var arow = 0; arow < atraj.table.length; arow++) {
                var ad = atraj.table[arow];
                lines.push(
                    ad.rangeYards + ' | ' +
                    ad.dropInches.toFixed(1) + ' | ' +
                    ad.dropMOA.toFixed(2) + ' | ' +
                    ad.comeUpMOA.toFixed(2) + ' | ' +
                    ad.windDriftInches.toFixed(1) + ' | ' +
                    ad.windDriftMOA.toFixed(2) + ' | ' +
                    ad.velocityFps + ' | ' +
                    ad.energyFtLbs
                );
            }
            lines.push('');
        }
    }

    // Past conversation summaries
    if (context.pastConversations && context.pastConversations.length > 0) {
        var currentId = self.conversationId;
        var pastConvs = context.pastConversations.filter(function (c) {
            return c.id !== currentId;
        }).slice(0, 5);

        if (pastConvs.length > 0) {
            lines.push('=== PAST CONVERSATION SUMMARIES ===');
            for (var pc = 0; pc < pastConvs.length; pc++) {
                var conv = pastConvs[pc];
                var msgs = conv.messages || [];
                lines.push('--- "' + (conv.title || 'Untitled') + '" (' + (conv.updatedAt ? conv.updatedAt.split('T')[0] : '?') + ') ---');
                var userCount = 0;
                var assistantCount = 0;
                for (var m = 0; m < msgs.length; m++) {
                    if (msgs[m].role === 'user' && userCount < 2) {
                        lines.push('User: ' + (msgs[m].content || '').substring(0, 150));
                        userCount++;
                    } else if (msgs[m].role === 'assistant' && assistantCount < 1) {
                        lines.push('Assistant: ' + self._stripActionBlocks(msgs[m].content || '').substring(0, 200));
                        assistantCount++;
                    }
                    if (userCount >= 2 && assistantCount >= 1) break;
                }
            }
            lines.push('');
        }
    }

    // Image analysis instructions
    lines.push('=== IMAGE ANALYSIS ===');
    lines.push('When the user sends a target image, analyze it thoroughly:');
    lines.push('1. Describe the shot group pattern (tight/loose, round/elongated)');
    lines.push('2. Identify stringing patterns: vertical (velocity/charge variation), horizontal (wind/trigger), diagonal (scope/stock issues)');
    lines.push('3. Estimate POA offset if visible (high/low/left/right)');
    lines.push('4. Note any flyers and what the group looks like without them');
    lines.push('5. Give actionable feedback: what to adjust, what to test next');
    lines.push('6. If the image includes an overlay with stats, reference those numbers in your analysis');
    lines.push('Be specific and practical. Shooters want to know what to DO, not just what they see.');
    lines.push('');

    // Session comparison instructions
    lines.push('=== SESSION COMPARISON ===');
    lines.push('When the user asks to compare sessions (e.g., "compare my last two sessions", "how have I improved"):');
    lines.push('1. Present key stats side by side: group size (inches and MOA), mean radius, ES/SD if available');
    lines.push('2. Note improvements or regressions in precision (group size) and accuracy (POA offset)');
    lines.push('3. Compare conditions: distance, weather, ammo if different');
    lines.push('4. Look for trends: is the shooter getting tighter groups? Is POI shifting consistently?');
    lines.push('5. If target images are attached, compare visual patterns between the two');
    lines.push('6. Give specific, actionable advice based on the comparison');
    lines.push('Format the comparison as a clear table or side-by-side layout when possible.');
    lines.push('');

    // Database tools instructions
    lines.push('=== DATABASE TOOLS ===');
    lines.push('You can write to the user\'s database by including action blocks in your response.');
    lines.push('Format: |||ACTION:{"type":"...","rifleId":"...","...":"..."}|||');
    lines.push('');
    lines.push('Available actions (ONLY use when the user explicitly asks you to log/record/save something):');
    lines.push('');
    lines.push('1. scope_adjustment — Log a scope adjustment');
    lines.push('   {"type":"scope_adjustment","rifleId":"<id>","elevation":<MOA>,"windage":<MOA>,"reason":"<text>"}');
    lines.push('');
    lines.push('2. rifle_note — Add a note to a rifle\'s notes field');
    lines.push('   {"type":"rifle_note","rifleId":"<id>","note":"<text>"}');
    lines.push('');
    lines.push('3. cleaning_log — Log a barrel cleaning');
    lines.push('   {"type":"cleaning_log","rifleId":"<id>","roundCount":<optional_number>,"notes":"<text>"}');
    lines.push('');
    lines.push('4. update_rounds — Update the active barrel\'s round count');
    lines.push('   {"type":"update_rounds","rifleId":"<id>","totalRounds":<number>}');
    lines.push('');
    lines.push('5. session_note — Add a note to a session');
    lines.push('   {"type":"session_note","sessionId":"<id>","note":"<text>"}');
    lines.push('');
    lines.push('IMPORTANT:');
    lines.push('- ONLY use actions when the user explicitly asks you to record/log/save something');
    lines.push('- NEVER use actions proactively or without the user\'s request');
    lines.push('- Always confirm what you\'re about to save before including the action block');
    lines.push('- Use the rifleId from the selected rifle context above');
    lines.push('- The action block can appear anywhere in your response text');
    lines.push('');

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
                messages: self._prepareMessagesForAPI()
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
                resolve({
                    text: data.content[0].text,
                    usage: data.usage || null
                });
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
AIAssistantManager.prototype._appendMessage = function (role, content, hasImage) {
    var messagesEl = document.getElementById('ai-messages');
    if (!messagesEl) return;

    // Remove welcome message if present
    var welcome = messagesEl.querySelector('.ai-welcome');
    if (welcome) welcome.remove();

    var div = document.createElement('div');
    div.className = 'ai-message ai-message-' + role;
    if (hasImage && role === 'user') {
        var imgTag = document.createElement('div');
        imgTag.className = 'ai-message-img-tag';
        imgTag.textContent = '[Image attached]';
        div.appendChild(imgTag);
    }
    var displayContent = this._stripActionBlocks(content);
    var textNode = document.createTextNode(displayContent);
    div.appendChild(textNode);
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
 * Stage an image file for attachment to the next message.
 * Validates type/size, resizes to max 1024px, stores as JPEG base64.
 */
AIAssistantManager.prototype._stageImage = function (file) {
    var self = this;
    var validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (validTypes.indexOf(file.type) === -1) {
        alert('Unsupported image type. Use JPEG, PNG, GIF, or WebP.');
        return;
    }
    if (file.size > 20 * 1024 * 1024) {
        alert('Image too large. Maximum 20MB.');
        return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
            // Resize to max 1024px
            var maxDim = 1024;
            var w = img.width;
            var h = img.height;
            if (w > maxDim || h > maxDim) {
                if (w > h) {
                    h = Math.round(h * maxDim / w);
                    w = maxDim;
                } else {
                    w = Math.round(w * maxDim / h);
                    h = maxDim;
                }
            }
            var canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);

            var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            var base64 = dataUrl.split(',')[1];

            self.pendingImage = { base64: base64, mediaType: 'image/jpeg' };

            // Show preview
            var previewEl = document.getElementById('ai-img-preview');
            var thumbEl = document.getElementById('ai-img-preview-thumb');
            if (previewEl && thumbEl) {
                thumbEl.src = dataUrl;
                previewEl.style.display = 'flex';
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
};

/**
 * Clear the staged image and hide preview.
 */
AIAssistantManager.prototype._clearStagedImage = function () {
    this.pendingImage = null;
    var previewEl = document.getElementById('ai-img-preview');
    if (previewEl) previewEl.style.display = 'none';
};

/**
 * Strip image content blocks from messages for IndexedDB storage.
 * Replaces image blocks with a text placeholder to avoid base64 bloat.
 */
AIAssistantManager.prototype._stripImagesForStorage = function (messages) {
    return messages.map(function (msg) {
        if (!Array.isArray(msg.content)) return msg;
        var stripped = msg.content.map(function (block) {
            if (block.type === 'image') {
                return { type: 'text', text: '[Image was attached]' };
            }
            return block;
        });
        // Collapse to plain string if only text blocks remain
        var texts = [];
        for (var i = 0; i < stripped.length; i++) {
            if (stripped[i].type === 'text') texts.push(stripped[i].text);
        }
        return { role: msg.role, content: texts.join('\n') };
    });
};

/**
 * Prepare messages for the API call.
 * Only the last user message keeps image data; older images are replaced with placeholders.
 */
AIAssistantManager.prototype._prepareMessagesForAPI = function () {
    var filtered = this.messages.filter(function (m) {
        return m.role === 'user' || m.role === 'assistant';
    });

    // Find index of last user message
    var lastUserIdx = -1;
    for (var i = filtered.length - 1; i >= 0; i--) {
        if (filtered[i].role === 'user') { lastUserIdx = i; break; }
    }

    return filtered.map(function (msg, idx) {
        if (!Array.isArray(msg.content)) return msg;

        // Keep images only in the last user message
        if (idx === lastUserIdx) return msg;

        // Replace image blocks in older messages
        var stripped = msg.content.map(function (block) {
            if (block.type === 'image') {
                return { type: 'text', text: '[Image was attached]' };
            }
            return block;
        });
        return { role: msg.role, content: stripped };
    });
};

/**
 * Convert a Blob to base64 string.
 */
AIAssistantManager.prototype._blobToBase64 = function (blob) {
    return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
            var dataUrl = reader.result;
            var base64 = dataUrl.split(',')[1];
            resolve(base64);
        };
        reader.onerror = function () { reject(new Error('Failed to read blob')); };
        reader.readAsDataURL(blob);
    });
};

/**
 * Detect if user text references a session (e.g., "last session", "most recent",
 * "today", "yesterday", "session #3"). Returns a matching session or null.
 */
AIAssistantManager.prototype._detectSessionReference = function (text) {
    var self = this;
    var lower = text.toLowerCase();

    // Check for session-related keywords
    var patterns = [
        /\blast\s+session\b/,
        /\bmost\s+recent\b/,
        /\blatest\s+session\b/,
        /\btoday['s]?\s+session\b/,
        /\byesterday['s]?\s+session\b/,
        /\bmy\s+(?:last|latest|recent)\s+(?:group|target|shot)\b/,
        /\banalyze\s+(?:my|the|this)\s+(?:last|latest|recent)\b/,
        /\bsession\s*#?\s*(\d+)\b/
    ];

    var matched = false;
    for (var i = 0; i < patterns.length; i++) {
        if (patterns[i].test(lower)) { matched = true; break; }
    }
    if (!matched) return Promise.resolve(null);

    // Fetch recent sessions for the selected rifle (or all if none selected)
    var fetchPromise;
    if (self.selectedRifleId) {
        fetchPromise = self.db.getSessionsByRifle(self.selectedRifleId);
    } else {
        fetchPromise = self.db.getAllSessions ? self.db.getAllSessions() : Promise.resolve([]);
    }

    return fetchPromise.then(function (sessions) {
        if (!sessions || sessions.length === 0) return null;

        // Sort by date descending
        sessions.sort(function (a, b) {
            return (b.date || '').localeCompare(a.date || '');
        });

        // For "session #N", try to match by index
        var numMatch = lower.match(/session\s*#?\s*(\d+)/);
        if (numMatch) {
            var idx = parseInt(numMatch[1], 10) - 1;
            if (idx >= 0 && idx < sessions.length) return sessions[idx];
        }

        // Default: return the most recent session
        return sessions[0];
    });
};

/**
 * Try to auto-attach a session target image when the user references a session.
 * Returns { base64, mediaType } or null.
 */
AIAssistantManager.prototype._tryAutoAttachImage = function (userText) {
    var self = this;

    return self._detectSessionReference(userText).then(function (session) {
        if (!session || !session.id) return null;

        return self.db.getSessionImage(session.id).then(function (record) {
            if (!record || !record.fullBlob) return null;

            // Resize the blob before attaching
            return self._blobToBase64(record.fullBlob).then(function (fullBase64) {
                return new Promise(function (resolve) {
                    var img = new Image();
                    img.onload = function () {
                        var maxDim = 1024;
                        var w = img.width;
                        var h = img.height;
                        if (w > maxDim || h > maxDim) {
                            if (w > h) {
                                h = Math.round(h * maxDim / w);
                                w = maxDim;
                            } else {
                                w = Math.round(w * maxDim / h);
                                h = maxDim;
                            }
                        }
                        var canvas = document.createElement('canvas');
                        canvas.width = w;
                        canvas.height = h;
                        var ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, w, h);
                        var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                        var base64 = dataUrl.split(',')[1];
                        resolve({ base64: base64, mediaType: 'image/jpeg' });
                    };
                    img.onerror = function () { resolve(null); };
                    img.src = 'data:image/jpeg;base64,' + fullBase64;
                });
            });
        }).catch(function () { return null; });
    }).catch(function () { return null; });
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

/**
 * Strip |||ACTION:...|||  blocks from text for display.
 */
AIAssistantManager.prototype._stripActionBlocks = function (text) {
    if (!text) return '';
    return text.replace(/\|\|\|ACTION:[\s\S]*?\|\|\|/g, '').trim();
};

/**
 * Load conversation history for the current rifle and render into the panel.
 */
AIAssistantManager.prototype._loadConversationHistory = function () {
    var self = this;
    var panel = document.getElementById('ai-conv-history');
    if (!panel) return;

    self.db.getConversationsByRifle(self.selectedRifleId).then(function (convs) {
        if (!convs || convs.length === 0) {
            panel.innerHTML = '<div class="ai-conv-history-empty">No past conversations.</div>';
            return;
        }

        var html = '';
        for (var i = 0; i < convs.length; i++) {
            var c = convs[i];
            var isActive = c.id === self.conversationId ? ' ai-conv-item-active' : '';
            var dateStr = c.updatedAt ? c.updatedAt.split('T')[0] : '';
            html += '<div class="ai-conv-item' + isActive + '" data-conv-id="' + c.id + '">';
            html += '<div class="ai-conv-item-title">' + self._escapeHtml(c.title || 'Untitled') + '</div>';
            html += '<div class="ai-conv-item-date">' + dateStr + '</div>';
            html += '</div>';
        }
        panel.innerHTML = html;

        // Bind click events on conversation items
        var items = panel.querySelectorAll('.ai-conv-item');
        for (var j = 0; j < items.length; j++) {
            items[j].addEventListener('click', function () {
                var convId = this.getAttribute('data-conv-id');
                self._loadConversation(convId);
            });
        }
    }).catch(function (e) {
        console.warn('[AI] Failed to load conversation history:', e);
        panel.innerHTML = '<div class="ai-conv-history-empty">Failed to load history.</div>';
    });
};

/**
 * Load a specific conversation by ID and render it.
 */
AIAssistantManager.prototype._loadConversation = function (convId) {
    var self = this;

    // Find the conversation from the list (already fetched)
    self.db.getConversationsByRifle(self.selectedRifleId).then(function (convs) {
        var conv = null;
        for (var i = 0; i < convs.length; i++) {
            if (convs[i].id === convId) {
                conv = convs[i];
                break;
            }
        }
        if (!conv) return;

        self.conversationId = conv.id;
        self.conversationTitle = conv.title;
        self.messages = conv.messages || [];
        self._renderChat();
    }).catch(function (e) {
        console.warn('[AI] Failed to load conversation:', e);
    });
};

/**
 * Parse AI response for |||ACTION:{...}||| blocks and execute them.
 */
AIAssistantManager.prototype._parseAndExecuteActions = function (text) {
    var self = this;
    var regex = /\|\|\|ACTION:([\s\S]*?)\|\|\|/g;
    var match;
    while ((match = regex.exec(text)) !== null) {
        try {
            var action = JSON.parse(match[1]);
            self._executeAction(action);
        } catch (e) {
            console.warn('[AI] Failed to parse action:', e);
        }
    }
};

/**
 * Execute a single database action from the AI response.
 */
AIAssistantManager.prototype._executeAction = function (action) {
    var self = this;
    if (!action || !action.type) return;

    switch (action.type) {
        case 'scope_adjustment':
            if (!action.rifleId) return;
            self.db.addScopeAdjustment({
                rifleId: action.rifleId,
                elevationChange: action.elevation || 0,
                windageChange: action.windage || 0,
                reason: action.reason || ''
            }).then(function () {
                self._appendActionStatus('Saved scope adjustment.');
            }).catch(function (e) {
                console.warn('[AI] Failed to save scope adjustment:', e);
                self._appendActionStatus('Failed to save scope adjustment.');
            });
            break;

        case 'rifle_note':
            if (!action.rifleId || !action.note) return;
            self.db.getRifle(action.rifleId).then(function (rifle) {
                if (!rifle) throw new Error('Rifle not found');
                var existingNotes = rifle.notes || '';
                rifle.notes = existingNotes ? existingNotes + '\n' + action.note : action.note;
                return self.db.updateRifle(rifle);
            }).then(function () {
                self._appendActionStatus('Added note to rifle.');
            }).catch(function (e) {
                console.warn('[AI] Failed to add rifle note:', e);
                self._appendActionStatus('Failed to add rifle note.');
            });
            break;

        case 'cleaning_log':
            if (!action.rifleId) return;
            self.db.getBarrelsByRifle(action.rifleId).then(function (barrels) {
                var activeBarrel = null;
                for (var i = 0; i < barrels.length; i++) {
                    if (barrels[i].isActive) { activeBarrel = barrels[i]; break; }
                }
                if (!activeBarrel) throw new Error('No active barrel found');
                return self.db.addCleaningLog({
                    rifleId: action.rifleId,
                    barrelId: activeBarrel.id,
                    roundCountAtCleaning: action.roundCount || activeBarrel.totalRounds || 0,
                    notes: action.notes || ''
                });
            }).then(function () {
                self._appendActionStatus('Logged barrel cleaning.');
            }).catch(function (e) {
                console.warn('[AI] Failed to log cleaning:', e);
                self._appendActionStatus('Failed to log barrel cleaning.');
            });
            break;

        case 'update_rounds':
            if (!action.rifleId || action.totalRounds === undefined) return;
            self.db.getBarrelsByRifle(action.rifleId).then(function (barrels) {
                var activeBarrel = null;
                for (var i = 0; i < barrels.length; i++) {
                    if (barrels[i].isActive) { activeBarrel = barrels[i]; break; }
                }
                if (!activeBarrel) throw new Error('No active barrel found');
                activeBarrel.totalRounds = action.totalRounds;
                return self.db.updateBarrel(activeBarrel);
            }).then(function () {
                self._appendActionStatus('Updated round count to ' + action.totalRounds + '.');
            }).catch(function (e) {
                console.warn('[AI] Failed to update round count:', e);
                self._appendActionStatus('Failed to update round count.');
            });
            break;

        case 'session_note':
            if (!action.sessionId || !action.note) return;
            self.db.getSession(action.sessionId).then(function (session) {
                if (!session) throw new Error('Session not found');
                var existing = session.sightInComments || '';
                session.sightInComments = existing ? existing + '\n' + action.note : action.note;
                return self.db.updateSession(session);
            }).then(function () {
                self._appendActionStatus('Added session note.');
            }).catch(function (e) {
                console.warn('[AI] Failed to add session note:', e);
                self._appendActionStatus('Failed to add session note.');
            });
            break;

        default:
            console.warn('[AI] Unknown action type:', action.type);
    }
};

/**
 * Append a small status message to the chat (for action confirmations).
 */
AIAssistantManager.prototype._appendActionStatus = function (text) {
    var messagesEl = document.getElementById('ai-messages');
    if (!messagesEl) return;

    var div = document.createElement('div');
    div.className = 'ai-action-status';
    div.textContent = text;
    messagesEl.appendChild(div);
    this._scrollToBottom();
};
