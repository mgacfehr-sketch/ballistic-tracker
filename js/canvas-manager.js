/**
 * canvas-manager.js — Manages the HTML5 Canvas for image display, zoom/pan, and marker rendering.
 *
 * Responsibilities:
 * - Load and display target images
 * - Pinch-to-zoom and pan (touch + mouse)
 * - Convert screen coordinates to image coordinates
 * - Render markers (calibration, POA, impacts, centroid)
 */

function CanvasManager(canvasEl, hintEl, zoomIndicatorEl) {
    // ── State ──────────────────────────────────────────────────
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.hintEl = hintEl;
    this.zoomIndicatorEl = zoomIndicatorEl;

    this.image = null;         // HTMLImageElement
    this.imageWidth = 0;
    this.imageHeight = 0;

    // Transform: image-to-screen
    this.scale = 1;            // current display scale (fitScale * zoomLevel)
    this.fitScale = 1;         // scale to fit image into canvas
    this.zoomLevel = 1;        // user zoom factor (1 = fit, max ~10)
    this.offsetX = 0;          // pan offset in screen pixels
    this.offsetY = 0;

    // Markers to draw
    this.markers = [];         // [{type, point, label, number, color}]
    this.calibrationLine = null; // {a:{x,y}, b:{x,y}} or null
    this.bulletDiameterPx = 0;   // bullet diameter in image pixels (for impact circles)

    // Touch state
    this._touches = {};
    this._tapStart = null;
    this._isDragging = false;
    this._pinchStartDist = 0;
    this._pinchStartZoom = 1;
    this._lastPanX = 0;
    this._lastPanY = 0;

    // Results overlay (draggable)
    this.overlayResults = null;      // results object — when set, overlay is drawn
    this.overlayPos = null;          // {x, y} in image coords (top-left of card)
    this._overlayScreenRect = null;  // {x, y, w, h} in CSS coords for hit-testing
    this._overlayDragging = false;
    this._overlayDragOffsetX = 0;
    this._overlayDragOffsetY = 0;

    // Callback
    this.onTap = null;         // function({x, y}) in IMAGE coordinates

    // ── Init ───────────────────────────────────────────────────
    this._resize();
    this._bindEvents();
}

// ── Image Loading ──────────────────────────────────────────────

CanvasManager.prototype.loadImage = function (img) {
    this.image = img;
    this.imageWidth = img.naturalWidth || img.width;
    this.imageHeight = img.naturalHeight || img.height;
    this.zoomLevel = 1;
    this._fitImage();
    this.render();
};

CanvasManager.prototype.clearImage = function () {
    this.image = null;
    this.markers = [];
    this.calibrationLine = null;
    this.bulletDiameterPx = 0;
    this.overlayResults = null;
    this.overlayPos = null;
    this._overlayScreenRect = null;
    this.zoomLevel = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this._clearCanvas();
};

// ── Transform ──────────────────────────────────────────────────

CanvasManager.prototype._fitImage = function () {
    if (!this.image) return;
    var cw = this.canvas.width;
    var ch = this.canvas.height;
    var scaleX = cw / this.imageWidth;
    var scaleY = ch / this.imageHeight;
    this.fitScale = Math.min(scaleX, scaleY);
    this.scale = this.fitScale * this.zoomLevel;
    // Center the image
    this.offsetX = (cw - this.imageWidth * this.scale) / 2;
    this.offsetY = (ch - this.imageHeight * this.scale) / 2;
};

CanvasManager.prototype._refitPreservingCenter = function () {
    if (!this.image) return;
    var cw = this.canvas.width;
    var ch = this.canvas.height;

    // What image point is currently at canvas center?
    var centerImgX = (cw / 2 - this.offsetX) / this.scale;
    var centerImgY = (ch / 2 - this.offsetY) / this.scale;

    // Recalculate fitScale for (possibly new) canvas dimensions
    var scaleX = cw / this.imageWidth;
    var scaleY = ch / this.imageHeight;
    this.fitScale = Math.min(scaleX, scaleY);

    // Reapply zoom on new fitScale
    this.scale = this.fitScale * this.zoomLevel;

    // Place the same image point back at canvas center
    this.offsetX = cw / 2 - centerImgX * this.scale;
    this.offsetY = ch / 2 - centerImgY * this.scale;

    this._clampOffset();
    this._updateZoomIndicator();
    this.render();
};

CanvasManager.prototype._updateTransform = function () {
    this.scale = this.fitScale * this.zoomLevel;
};

/**
 * Convert screen (canvas DOM) coordinates to image pixel coordinates.
 */
CanvasManager.prototype.screenToImage = function (sx, sy) {
    var dpr = window.devicePixelRatio || 1;
    var cx = sx * dpr;
    var cy = sy * dpr;
    return {
        x: (cx - this.offsetX) / this.scale,
        y: (cy - this.offsetY) / this.scale
    };
};

/**
 * Convert image coordinates to screen (canvas pixel) coordinates.
 */
CanvasManager.prototype.imageToScreen = function (ix, iy) {
    return {
        x: ix * this.scale + this.offsetX,
        y: iy * this.scale + this.offsetY
    };
};

// ── Zoom / Pan ─────────────────────────────────────────────────

CanvasManager.prototype.zoomTo = function (newZoom, pivotScreenX, pivotScreenY) {
    var dpr = window.devicePixelRatio || 1;
    var px = pivotScreenX * dpr;
    var py = pivotScreenY * dpr;

    var oldScale = this.scale;
    this.zoomLevel = clamp(newZoom, 1, 15);
    this._updateTransform();
    var newScale = this.scale;

    // Adjust offset so the point under the pivot stays fixed
    this.offsetX = px - (px - this.offsetX) * (newScale / oldScale);
    this.offsetY = py - (py - this.offsetY) * (newScale / oldScale);

    this._clampOffset();
    this._updateZoomIndicator();
    this.render();
};

CanvasManager.prototype._clampOffset = function () {
    var cw = this.canvas.width;
    var ch = this.canvas.height;
    var iw = this.imageWidth * this.scale;
    var ih = this.imageHeight * this.scale;

    if (iw <= cw) {
        this.offsetX = (cw - iw) / 2;
    } else {
        this.offsetX = clamp(this.offsetX, cw - iw, 0);
    }

    if (ih <= ch) {
        this.offsetY = (ch - ih) / 2;
    } else {
        this.offsetY = clamp(this.offsetY, ch - ih, 0);
    }
};

CanvasManager.prototype._updateZoomIndicator = function () {
    if (this.zoomIndicatorEl) {
        this.zoomIndicatorEl.textContent = this.zoomLevel.toFixed(1) + 'x';
        this.zoomIndicatorEl.classList.toggle('hidden', this.zoomLevel <= 1.05);
    }
};

// ── Rendering ──────────────────────────────────────────────────

CanvasManager.prototype.render = function () {
    var ctx = this.ctx;
    var cw = this.canvas.width;
    var ch = this.canvas.height;

    this._clearCanvas();

    if (!this.image) return;

    // Draw image with transform
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);
    ctx.drawImage(this.image, 0, 0, this.imageWidth, this.imageHeight);
    ctx.restore();

    // Draw calibration line
    if (this.calibrationLine) {
        this._drawCalibrationLine(this.calibrationLine.a, this.calibrationLine.b);
    }

    // Draw markers
    for (var i = 0; i < this.markers.length; i++) {
        this._drawMarker(this.markers[i]);
    }

    // Draw draggable results overlay
    if (this.overlayResults) {
        try {
            this._drawLiveOverlay();
        } catch (e) {
            console.error('[Overlay] _drawLiveOverlay error:', e.message);
        }
    }
};

CanvasManager.prototype._clearCanvas = function () {
    this.ctx.fillStyle = '#0a0a0a';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
};

/**
 * Capture the visible image region from the live canvas (includes markers + overlay).
 * Returns a new canvas containing just the image-covered portion of the viewport.
 */
CanvasManager.prototype.captureViewport = function () {
    var cw = this.canvas.width;
    var ch = this.canvas.height;

    // Image bounds in canvas pixels
    var imgLeft = this.offsetX;
    var imgTop = this.offsetY;
    var imgRight = this.offsetX + this.imageWidth * this.scale;
    var imgBottom = this.offsetY + this.imageHeight * this.scale;

    // Intersect with canvas bounds to get visible image region
    var sx = Math.max(0, imgLeft);
    var sy = Math.max(0, imgTop);
    var sx2 = Math.min(cw, imgRight);
    var sy2 = Math.min(ch, imgBottom);

    var cropW = Math.round(sx2 - sx);
    var cropH = Math.round(sy2 - sy);

    if (cropW <= 0 || cropH <= 0) {
        // Fallback: return full canvas
        return this.canvas;
    }

    var out = document.createElement('canvas');
    out.width = cropW;
    out.height = cropH;
    var outCtx = out.getContext('2d');
    outCtx.drawImage(this.canvas, Math.round(sx), Math.round(sy), cropW, cropH, 0, 0, cropW, cropH);
    return out;
};

CanvasManager.prototype._drawMarker = function (marker) {
    var sp = this.imageToScreen(marker.point.x, marker.point.y);
    var ctx = this.ctx;
    var dpr = window.devicePixelRatio || 1;
    var markerSize = 14 * dpr; // fixed screen size for crosshair arms
    var lineWidth = 2 * dpr;

    if (marker.type === 'calibration') {
        // Orange dot with letter
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 6 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = '#ff9800';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();
        // Label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold ' + (11 * dpr) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(marker.label || '', sp.x, sp.y - 8 * dpr);
    }
    else if (marker.type === 'poa') {
        // Blue crosshair with circle
        ctx.strokeStyle = '#2196f3';
        ctx.lineWidth = lineWidth;
        // Cross
        ctx.beginPath();
        ctx.moveTo(sp.x - markerSize, sp.y);
        ctx.lineTo(sp.x + markerSize, sp.y);
        ctx.moveTo(sp.x, sp.y - markerSize);
        ctx.lineTo(sp.x, sp.y + markerSize);
        ctx.stroke();
        // Circle
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, markerSize * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        // Label
        ctx.fillStyle = '#2196f3';
        ctx.font = 'bold ' + (10 * dpr) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('POA', sp.x, sp.y - markerSize - 2 * dpr);
    }
    else if (marker.type === 'impact') {
        var color = '#4caf50';
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;

        // Bullet diameter circle (scales with zoom)
        if (this.bulletDiameterPx > 0) {
            var radiusPx = (this.bulletDiameterPx / 2) * this.scale;
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, radiusPx, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(76, 175, 80, 0.5)';
            ctx.lineWidth = 1 * dpr;
            ctx.stroke();
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
        }

        // Crosshair
        ctx.beginPath();
        ctx.moveTo(sp.x - markerSize, sp.y);
        ctx.lineTo(sp.x + markerSize, sp.y);
        ctx.moveTo(sp.x, sp.y - markerSize);
        ctx.lineTo(sp.x, sp.y + markerSize);
        ctx.stroke();
        // Number label
        ctx.fillStyle = color;
        ctx.font = 'bold ' + (11 * dpr) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(String(marker.number || ''), sp.x, sp.y - markerSize - 2 * dpr);
    }
    else if (marker.type === 'centroid') {
        // Small orange-red X
        var s = 6 * dpr;
        ctx.strokeStyle = '#ff5722';
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.moveTo(sp.x - s, sp.y - s);
        ctx.lineTo(sp.x + s, sp.y + s);
        ctx.moveTo(sp.x + s, sp.y - s);
        ctx.lineTo(sp.x - s, sp.y + s);
        ctx.stroke();
    }
};

CanvasManager.prototype._drawCalibrationLine = function (a, b) {
    var sa = this.imageToScreen(a.x, a.y);
    var sb = this.imageToScreen(b.x, b.y);
    var ctx = this.ctx;
    var dpr = window.devicePixelRatio || 1;

    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 2 * dpr;
    ctx.setLineDash([6 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
    ctx.setLineDash([]);
};

// ── Results Overlay (Draggable) ─────────────────────────────────

CanvasManager.prototype._drawLiveOverlay = function () {
    if (!this.overlayResults) return;

    var ctx = this.ctx;
    var dpr = window.devicePixelRatio || 1;
    var sf = dpr;
    var padding = 12 * sf;
    var lineHeight = 17 * sf;
    var fontSize = 11 * sf;
    var titleFontSize = 13 * sf;
    var heroFontSize = 22 * sf;
    var smallFontSize = 9 * sf;

    var results = this.overlayResults;
    var atzElevInches = Math.abs(results.elevationOffsetInches || 0);
    var atzWindInches = Math.abs(results.windageOffsetInches || 0);
    var atzElevAbbr = (results.atzElevationDir || '')[0] || '';
    var atzWindAbbr = (results.atzWindageDir || '')[0] || '';

    // Line layout: title, context, hero MOA, supporting details, ATZ
    var lines = [];
    lines.push({ text: 'yorT', bold: true, size: titleFontSize, color: '#4caf50' });
    lines.push({ text: '', gap: 0.3 });
    lines.push({ text: results.distanceYards + ' yds / ' + results.shotCount + ' shots', bold: false, size: smallFontSize, color: '#aaaaaa' });
    lines.push({ text: '', gap: 0.3 });
    lines.push({ text: formatFixed(results.groupSizeMOA, 2) + ' MOA', bold: true, size: heroFontSize, color: '#ffffff', hero: true });
    lines.push({ text: '', gap: 0.15 });
    lines.push({ text: formatFixed(results.groupSizeInches, 3) + '" group', bold: false, size: fontSize, color: '#bbbbbb' });
    lines.push({ text: '', gap: 0.3 });
    lines.push({ text: 'ATZ  ' + atzElevAbbr + ': ' + formatFixed(results.atzElevationMOA, 2) + '  ' + atzWindAbbr + ': ' + formatFixed(results.atzWindageMOA, 2) + ' MOA', bold: true, size: fontSize, color: '#4caf50' });
    lines.push({ text: 'ATZ  ' + atzElevAbbr + ': ' + formatFixed(atzElevInches, 2) + '"  ' + atzWindAbbr + ': ' + formatFixed(atzWindInches, 2) + '"', bold: false, size: smallFontSize, color: '#888888' });

    // Measure card dimensions
    var maxWidth = 0;
    for (var i = 0; i < lines.length; i++) {
        if (!lines[i].text) continue;
        ctx.font = (lines[i].bold ? 'bold ' : '') + Math.round(lines[i].size || fontSize) + 'px sans-serif';
        var w = ctx.measureText(lines[i].text).width;
        if (w > maxWidth) maxWidth = w;
    }

    var heroLineHeight = heroFontSize * 1.2;
    var totalHeight = padding * 2;
    for (var k = 0; k < lines.length; k++) {
        if (!lines[k].text) {
            totalHeight += lineHeight * (lines[k].gap || 0.3);
        } else if (lines[k].hero) {
            totalHeight += heroLineHeight;
        } else {
            totalHeight += lineHeight;
        }
    }

    var cardW = maxWidth + padding * 2;
    var cardH = totalHeight;

    // Smart initial position: near the shot group but not covering markers
    if (!this.overlayPos) {
        var cardWImg = cardW / this.scale;
        var cardHImg = cardH / this.scale;
        var gap = 15 * dpr / this.scale; // gap between group bbox and card

        // Compute bounding box of impacts + POA in image coords
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var mi = 0; mi < this.markers.length; mi++) {
            var m = this.markers[mi];
            if (m.type === 'impact' || m.type === 'poa' || m.type === 'centroid') {
                if (m.point.x < minX) minX = m.point.x;
                if (m.point.y < minY) minY = m.point.y;
                if (m.point.x > maxX) maxX = m.point.x;
                if (m.point.y > maxY) maxY = m.point.y;
            }
        }

        var placed = false;
        if (minX !== Infinity) {
            // Add marker radius padding to bbox
            var mPad = 25 * dpr / this.scale;
            var bx1 = minX - mPad, by1 = minY - mPad;
            var bx2 = maxX + mPad, by2 = maxY + mPad;
            var imgW = this.imageWidth, imgH = this.imageHeight;

            // Try right of group
            if (bx2 + gap + cardWImg <= imgW) {
                var ry = clamp((by1 + by2) / 2 - cardHImg / 2, 0, imgH - cardHImg);
                this.overlayPos = { x: bx2 + gap, y: ry };
                placed = true;
            }
            // Try below group
            if (!placed && by2 + gap + cardHImg <= imgH) {
                var bx = clamp((bx1 + bx2) / 2 - cardWImg / 2, 0, imgW - cardWImg);
                this.overlayPos = { x: bx, y: by2 + gap };
                placed = true;
            }
            // Try left of group
            if (!placed && bx1 - gap - cardWImg >= 0) {
                var ly = clamp((by1 + by2) / 2 - cardHImg / 2, 0, imgH - cardHImg);
                this.overlayPos = { x: bx1 - gap - cardWImg, y: ly };
                placed = true;
            }
            // Try above group
            if (!placed && by1 - gap - cardHImg >= 0) {
                var ax = clamp((bx1 + bx2) / 2 - cardWImg / 2, 0, imgW - cardWImg);
                this.overlayPos = { x: ax, y: by1 - gap - cardHImg };
                placed = true;
            }
        }

        // Fallback: bottom-right of image
        if (!placed) {
            this.overlayPos = {
                x: this.imageWidth - cardWImg - (10 * dpr / this.scale),
                y: this.imageHeight - cardHImg - (10 * dpr / this.scale)
            };
        }
    }

    var sp = this.imageToScreen(this.overlayPos.x, this.overlayPos.y);
    var cardX = sp.x;
    var cardY = sp.y;

    // Save screen rect for hit-testing (CSS pixel coords)
    this._overlayScreenRect = {
        x: cardX / dpr,
        y: cardY / dpr,
        w: cardW / dpr,
        h: cardH / dpr
    };

    // Card background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.80)';
    _roundRect(ctx, cardX, cardY, cardW, cardH, 6 * sf);
    ctx.fill();

    // Card border
    ctx.strokeStyle = 'rgba(76, 175, 80, 0.7)';
    ctx.lineWidth = 1.5 * sf;
    _roundRect(ctx, cardX, cardY, cardW, cardH, 6 * sf);
    ctx.stroke();

    // Draw text
    var textX = cardX + padding;
    var textY = cardY + padding;

    for (var j = 0; j < lines.length; j++) {
        var line = lines[j];
        if (!line.text) {
            textY += lineHeight * (line.gap || 0.3);
            continue;
        }
        ctx.font = (line.bold ? 'bold ' : '') + Math.round(line.size || fontSize) + 'px sans-serif';
        ctx.fillStyle = line.color || '#e0e0e0';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(line.text, textX, textY);
        textY += (line.hero ? heroLineHeight : lineHeight);
    }

    // Drag handle dots (top-right corner of card)
    var gripX = cardX + cardW - padding;
    var gripY = cardY + 6 * sf;
    var dotSize = 1.5 * sf;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (var row = 0; row < 3; row++) {
        for (var col = 0; col < 2; col++) {
            ctx.beginPath();
            ctx.arc(gripX - col * 5 * sf, gripY + row * 5 * sf, dotSize, 0, Math.PI * 2);
            ctx.fill();
        }
    }
};

CanvasManager.prototype._isPointInOverlay = function (cssX, cssY) {
    if (!this._overlayScreenRect) return false;
    var r = this._overlayScreenRect;
    return cssX >= r.x && cssX <= r.x + r.w &&
           cssY >= r.y && cssY <= r.y + r.h;
};

// ── Hint Text ──────────────────────────────────────────────────

CanvasManager.prototype.setHint = function (text) {
    if (this.hintEl) {
        this.hintEl.textContent = text || '';
    }
};

// ── Event Handling ─────────────────────────────────────────────

CanvasManager.prototype._bindEvents = function () {
    var self = this;

    // Resize
    window.addEventListener('resize', function () {
        self._resize();
        if (self.image) {
            self._refitPreservingCenter();
        } else {
            self.render();
        }
    });

    // Touch events
    this.canvas.addEventListener('touchstart', function (e) { self._onTouchStart(e); }, { passive: false });
    this.canvas.addEventListener('touchmove', function (e) { self._onTouchMove(e); }, { passive: false });
    this.canvas.addEventListener('touchend', function (e) { self._onTouchEnd(e); }, { passive: false });
    this.canvas.addEventListener('touchcancel', function (e) { self._onTouchEnd(e); }, { passive: false });

    // Mouse events (desktop fallback)
    this.canvas.addEventListener('mousedown', function (e) { self._onMouseDown(e); });
    this.canvas.addEventListener('mousemove', function (e) { self._onMouseMove(e); });
    this.canvas.addEventListener('mouseup', function (e) { self._onMouseUp(e); });
    this.canvas.addEventListener('wheel', function (e) { self._onWheel(e); }, { passive: false });
};

CanvasManager.prototype._resize = function () {
    var dpr = window.devicePixelRatio || 1;
    var rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
};

// ── Touch Handling ─────────────────────────────────────────────

CanvasManager.prototype._getTouchPos = function (touch) {
    var rect = this.canvas.getBoundingClientRect();
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
};

CanvasManager.prototype._onTouchStart = function (e) {
    e.preventDefault();
    var touches = e.touches;

    if (touches.length === 1) {
        var pos = this._getTouchPos(touches[0]);

        // Check if touching the overlay card
        if (this.overlayResults && this._isPointInOverlay(pos.x, pos.y)) {
            this._overlayDragging = true;
            this._overlayDragOffsetX = pos.x - this._overlayScreenRect.x;
            this._overlayDragOffsetY = pos.y - this._overlayScreenRect.y;
            this._tapStart = null;
            return;
        }

        this._tapStart = { x: pos.x, y: pos.y, time: Date.now() };
        this._isDragging = false;
        this._lastPanX = pos.x;
        this._lastPanY = pos.y;
    }
    else if (touches.length === 2) {
        // Start pinch — cancel overlay drag
        this._overlayDragging = false;
        this._tapStart = null; // cancel tap
        var p1 = this._getTouchPos(touches[0]);
        var p2 = this._getTouchPos(touches[1]);
        this._pinchStartDist = dist(p1, p2);
        this._pinchStartZoom = this.zoomLevel;
        this._lastPanX = (p1.x + p2.x) / 2;
        this._lastPanY = (p1.y + p2.y) / 2;
    }
};

CanvasManager.prototype._onTouchMove = function (e) {
    e.preventDefault();
    var touches = e.touches;

    if (touches.length === 1 && this._overlayDragging) {
        var pos = this._getTouchPos(touches[0]);
        this.overlayPos = this.screenToImage(
            pos.x - this._overlayDragOffsetX,
            pos.y - this._overlayDragOffsetY
        );
        this.render();
        return;
    }

    if (touches.length === 1 && this._tapStart) {
        var pos = this._getTouchPos(touches[0]);
        var moved = dist(pos, this._tapStart);
        if (moved > 8) {
            this._isDragging = true;
        }
        if (this._isDragging && this.zoomLevel > 1) {
            var dpr = window.devicePixelRatio || 1;
            this.offsetX += (pos.x - this._lastPanX) * dpr;
            this.offsetY += (pos.y - this._lastPanY) * dpr;
            this._clampOffset();
            this.render();
        }
        this._lastPanX = pos.x;
        this._lastPanY = pos.y;
    }
    else if (touches.length === 2) {
        var p1 = this._getTouchPos(touches[0]);
        var p2 = this._getTouchPos(touches[1]);
        var currentDist = dist(p1, p2);
        var midX = (p1.x + p2.x) / 2;
        var midY = (p1.y + p2.y) / 2;

        // Pinch zoom
        if (this._pinchStartDist > 0) {
            var ratio = currentDist / this._pinchStartDist;
            var newZoom = this._pinchStartZoom * ratio;
            this.zoomTo(newZoom, midX, midY);
        }

        // Two-finger pan
        var dpr = window.devicePixelRatio || 1;
        this.offsetX += (midX - this._lastPanX) * dpr;
        this.offsetY += (midY - this._lastPanY) * dpr;
        this._clampOffset();
        this.render();

        this._lastPanX = midX;
        this._lastPanY = midY;
    }
};

CanvasManager.prototype._onTouchEnd = function (e) {
    e.preventDefault();

    if (this._overlayDragging && e.touches.length === 0) {
        this._overlayDragging = false;
        return;
    }

    if (e.touches.length === 0 && this._tapStart && !this._isDragging) {
        var elapsed = Date.now() - this._tapStart.time;
        if (elapsed < 400) {
            this._handleTap(this._tapStart.x, this._tapStart.y);
        }
    }
    this._tapStart = null;
    this._isDragging = false;
    this._pinchStartDist = 0;
};

// ── Mouse Handling (Desktop) ───────────────────────────────────

CanvasManager.prototype._onMouseDown = function (e) {
    var rect = this.canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;

    // Check if clicking the overlay card
    if (this.overlayResults && this._isPointInOverlay(x, y)) {
        this._overlayDragging = true;
        this._overlayDragOffsetX = x - this._overlayScreenRect.x;
        this._overlayDragOffsetY = y - this._overlayScreenRect.y;
        return;
    }

    this._tapStart = { x: x, y: y, time: Date.now() };
    this._isDragging = false;
    this._lastPanX = x;
    this._lastPanY = y;
};

CanvasManager.prototype._onMouseMove = function (e) {
    var rect = this.canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;

    if (this._overlayDragging) {
        this.overlayPos = this.screenToImage(
            x - this._overlayDragOffsetX,
            y - this._overlayDragOffsetY
        );
        this.render();
        return;
    }

    if (!this._tapStart) return;
    var moved = dist({ x: x, y: y }, this._tapStart);
    if (moved > 5) {
        this._isDragging = true;
    }
    if (this._isDragging && this.zoomLevel > 1) {
        var dpr = window.devicePixelRatio || 1;
        this.offsetX += (x - this._lastPanX) * dpr;
        this.offsetY += (y - this._lastPanY) * dpr;
        this._clampOffset();
        this.render();
    }
    this._lastPanX = x;
    this._lastPanY = y;
};

CanvasManager.prototype._onMouseUp = function (e) {
    if (this._overlayDragging) {
        this._overlayDragging = false;
        return;
    }
    if (this._tapStart && !this._isDragging) {
        this._handleTap(this._tapStart.x, this._tapStart.y);
    }
    this._tapStart = null;
    this._isDragging = false;
};

CanvasManager.prototype._onWheel = function (e) {
    e.preventDefault();
    var rect = this.canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.zoomTo(this.zoomLevel * delta, x, y);
};

// ── Tap Dispatch ───────────────────────────────────────────────

CanvasManager.prototype._handleTap = function (screenX, screenY) {
    if (!this.image) return;
    var imgPt = this.screenToImage(screenX, screenY);
    // Only process taps within the image bounds
    if (imgPt.x < 0 || imgPt.x > this.imageWidth || imgPt.y < 0 || imgPt.y > this.imageHeight) {
        return;
    }
    if (typeof this.onTap === 'function') {
        this.onTap(imgPt);
    }
};
