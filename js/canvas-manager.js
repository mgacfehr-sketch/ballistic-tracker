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
};

CanvasManager.prototype._clearCanvas = function () {
    this.ctx.fillStyle = '#0a0a0a';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
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
            self._fitImage();
            self.zoomLevel = clamp(self.zoomLevel, 1, 15);
            self._updateTransform();
            self._clampOffset();
        }
        self.render();
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
        this._tapStart = { x: pos.x, y: pos.y, time: Date.now() };
        this._isDragging = false;
        this._lastPanX = pos.x;
        this._lastPanY = pos.y;
    }
    else if (touches.length === 2) {
        // Start pinch
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
    this._tapStart = { x: x, y: y, time: Date.now() };
    this._isDragging = false;
    this._lastPanX = x;
    this._lastPanY = y;
};

CanvasManager.prototype._onMouseMove = function (e) {
    if (!this._tapStart) return;
    var rect = this.canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
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
