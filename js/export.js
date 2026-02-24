/**
 * export.js — Renders an annotated image with markers and results overlay.
 *
 * Creates an offscreen canvas at the full image resolution,
 * draws the original photo, all markers, and a results card overlay.
 * Returns the canvas for saving/sharing.
 */

// Pre-load and process logo into white-silhouette-on-transparent for watermark
var _exportLogoCanvas = null;
(function() {
    var img = new Image();
    img.onload = function() {
        var w = img.naturalWidth, h = img.naturalHeight;
        var tc = document.createElement('canvas');
        tc.width = w; tc.height = h;
        var tctx = tc.getContext('2d');
        tctx.drawImage(img, 0, 0, w, h);
        var id = tctx.getImageData(0, 0, w, h);
        var d = id.data;
        for (var i = 0; i < d.length; i += 4) {
            var lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
            var alpha = lum < 180 ? Math.round(255 * (1 - lum / 180)) : 0;
            d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = alpha;
        }
        tctx.putImageData(id, 0, 0);
        _exportLogoCanvas = tc;
    };
    img.onerror = function() { _exportLogoCanvas = null; };
    img.src = 'assets/logo.png';
})();

/**
 * Render the annotated image to an offscreen canvas.
 * @param {HTMLImageElement} image - The original target photo
 * @param {Array} markers - Array of marker objects from canvas-manager
 * @param {object|null} calibrationLine - {a:{x,y}, b:{x,y}} or null
 * @param {number} bulletDiameterPx - Bullet diameter in image pixels
 * @param {object} results - Results from calculateSession
 * @returns {HTMLCanvasElement} The rendered canvas
 */
function renderAnnotatedImage(image, markers, calibrationLine, bulletDiameterPx, results, overlayPos, overlayScale) {
    var w = image.naturalWidth || image.width;
    var h = image.naturalHeight || image.height;

    // Scale factor for marker sizes relative to image resolution
    // Target: markers look good on a ~3000px wide image
    var sf = Math.max(w, h) / 2000;
    sf = Math.max(sf, 0.5); // minimum scale

    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');

    // Draw original image
    ctx.drawImage(image, 0, 0, w, h);

    // Draw calibration line
    if (calibrationLine) {
        _drawExportCalibrationLine(ctx, calibrationLine, sf);
    }

    // Draw markers
    for (var i = 0; i < markers.length; i++) {
        _drawExportMarker(ctx, markers[i], bulletDiameterPx, sf);
    }

    // Draw results overlay card
    if (results) {
        _drawResultsOverlay(ctx, w, h, results, sf, overlayPos, overlayScale || 1.0);
    }

    return canvas;
}

function _drawExportCalibrationLine(ctx, line, sf) {
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 2 * sf;
    ctx.setLineDash([8 * sf, 5 * sf]);
    ctx.beginPath();
    ctx.moveTo(line.a.x, line.a.y);
    ctx.lineTo(line.b.x, line.b.y);
    ctx.stroke();
    ctx.setLineDash([]);
}

function _drawExportMarker(ctx, marker, bulletDiameterPx, sf) {
    var x = marker.point.x;
    var y = marker.point.y;
    var armLen = 18 * sf;
    var lw = 2.5 * sf;

    if (marker.type === 'calibration') {
        ctx.beginPath();
        ctx.arc(x, y, 7 * sf, 0, Math.PI * 2);
        ctx.fillStyle = '#ff9800';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1 * sf;
        ctx.stroke();
        // Label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold ' + Math.round(14 * sf) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(marker.label || '', x, y - 10 * sf);
    }
    else if (marker.type === 'poa') {
        ctx.strokeStyle = '#2196f3';
        ctx.lineWidth = lw;
        // Cross
        ctx.beginPath();
        ctx.moveTo(x - armLen, y);
        ctx.lineTo(x + armLen, y);
        ctx.moveTo(x, y - armLen);
        ctx.lineTo(x, y + armLen);
        ctx.stroke();
        // Circle
        ctx.beginPath();
        ctx.arc(x, y, armLen * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        // Label
        ctx.fillStyle = '#2196f3';
        ctx.font = 'bold ' + Math.round(13 * sf) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('POA', x, y - armLen - 3 * sf);
    }
    else if (marker.type === 'impact') {
        var color = '#4caf50';

        // Bullet diameter circle
        if (bulletDiameterPx > 0) {
            ctx.beginPath();
            ctx.arc(x, y, bulletDiameterPx / 2, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(76, 175, 80, 0.5)';
            ctx.lineWidth = 1.5 * sf;
            ctx.stroke();
        }

        // Crosshair
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(x - armLen, y);
        ctx.lineTo(x + armLen, y);
        ctx.moveTo(x, y - armLen);
        ctx.lineTo(x, y + armLen);
        ctx.stroke();

        // Number
        ctx.fillStyle = color;
        ctx.font = 'bold ' + Math.round(14 * sf) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(String(marker.number || ''), x, y - armLen - 3 * sf);
    }
    else if (marker.type === 'centroid') {
        var s = 8 * sf;
        ctx.strokeStyle = '#ff5722';
        ctx.lineWidth = 2.5 * sf;
        ctx.beginPath();
        ctx.moveTo(x - s, y - s);
        ctx.lineTo(x + s, y + s);
        ctx.moveTo(x + s, y - s);
        ctx.lineTo(x - s, y + s);
        ctx.stroke();
    }
}

function _drawResultsOverlay(ctx, canvasW, canvasH, results, sf, overlayPos, os) {
    os = os || 1.0;
    var s = sf * os;  // combined scale: image resolution * user resize
    var padding = 18 * s;
    var lineHeight = 22 * s;
    var fontSize = 14 * s;
    var titleFontSize = 20 * s;
    var heroFontSize = 32 * s;
    var smallFontSize = 12 * s;
    var GREEN = '#4CAF50';
    var dividerGap = 8 * s;

    var atzElevInches = Math.abs(results.elevationOffsetInches || 0);
    var atzWindInches = Math.abs(results.windageOffsetInches || 0);
    var atzElevAbbr = (results.atzElevationDir || '')[0] || '';
    var atzWindAbbr = (results.atzWindageDir || '')[0] || '';

    // Measure all text widths to determine card width (centered layout)
    var heroLineHeight = heroFontSize * 1.3;
    var textItems = [
        { font: 'bold ' + Math.round(titleFontSize) + 'px sans-serif', text: 'yorT' },
        { font: Math.round(smallFontSize) + 'px sans-serif', text: results.distanceYards + ' Yards / ' + results.shotCount + ' Shot group' },
        { font: 'bold ' + Math.round(heroFontSize) + 'px sans-serif', text: formatFixed(results.groupSizeMOA, 2) + ' MOA' },
        { font: Math.round(fontSize) + 'px sans-serif', text: formatFixed(results.groupSizeInches, 3) + '"' },
        { font: Math.round(smallFontSize) + 'px sans-serif', text: atzElevAbbr + ': ' + formatFixed(atzElevInches, 2) + '"   ' + atzWindAbbr + ': ' + formatFixed(atzWindInches, 2) + '"' }
    ];
    if (results.rifleName) {
        textItems.push({ font: 'bold ' + Math.round(smallFontSize) + 'px sans-serif', text: results.rifleName });
    }
    var maxWidth = 0;
    for (var ti = 0; ti < textItems.length; ti++) {
        ctx.font = textItems[ti].font;
        var tw = ctx.measureText(textItems[ti].text).width;
        if (tw > maxWidth) maxWidth = tw;
    }

    // Calculate total height
    var totalHeight = padding * 2;
    totalHeight += lineHeight;          // yorT title
    totalHeight += lineHeight * 0.2;    // gap
    totalHeight += lineHeight;          // distance/shots
    totalHeight += dividerGap * 2 + 1 * s; // divider with gaps
    totalHeight += heroLineHeight;      // MOA hero
    totalHeight += lineHeight * 0.1;    // tiny gap
    totalHeight += lineHeight;          // inches
    totalHeight += dividerGap * 2 + 1 * s; // divider with gaps
    totalHeight += lineHeight;          // ATZ
    if (results.rifleName) {
        totalHeight += lineHeight * 0.6;
        totalHeight += lineHeight;      // rifle name
    }

    var cardW = maxWidth + padding * 2.5;
    var cardH = totalHeight;
    var cardX, cardY;
    if (overlayPos) {
        cardX = overlayPos.x;
        cardY = overlayPos.y;
    } else {
        cardX = canvasW - cardW - padding;
        cardY = canvasH - cardH - padding;
    }

    var cornerR = 8 * s;

    // Card background
    ctx.fillStyle = 'rgba(20, 20, 20, 0.85)';
    _roundRect(ctx, cardX, cardY, cardW, cardH, cornerR);
    ctx.fill();

    // Logo watermark behind content (white silhouette, no background rectangle)
    if (_exportLogoCanvas) {
        ctx.save();
        var wmH = cardH * 0.75;
        var wmAspect = _exportLogoCanvas.width / _exportLogoCanvas.height;
        var wmW = wmH * wmAspect;
        var wmX = cardX + (cardW - wmW) / 2;
        var wmY = cardY + (cardH - wmH) / 2 + cardH * 0.08;
        ctx.globalAlpha = 0.10;
        _roundRect(ctx, cardX, cardY, cardW, cardH, cornerR);
        ctx.clip();
        ctx.drawImage(_exportLogoCanvas, wmX, wmY, wmW, wmH);
        ctx.restore();
    }

    // Card border — subtle green
    ctx.strokeStyle = 'rgba(76, 175, 80, 0.35)';
    ctx.lineWidth = 1 * s;
    _roundRect(ctx, cardX, cardY, cardW, cardH, cornerR);
    ctx.stroke();

    // ── Draw centered content ──
    var centerX = cardX + cardW / 2;
    var curY = cardY + padding;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // 1) "yorT" — "yor" white, "T" green
    ctx.font = 'bold ' + Math.round(titleFontSize) + 'px sans-serif';
    var yorW = ctx.measureText('yor').width;
    var tW = ctx.measureText('T').width;
    var brandTotalW = yorW + tW;
    var brandStartX = centerX - brandTotalW / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('yor', brandStartX, curY);
    ctx.fillStyle = GREEN;
    ctx.fillText('T', brandStartX + yorW, curY);
    curY += lineHeight;

    // 2) Distance & shots
    curY += lineHeight * 0.2;
    ctx.textAlign = 'center';
    ctx.font = Math.round(smallFontSize) + 'px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(results.distanceYards + ' Yards / ' + results.shotCount + ' Shot group', centerX, curY);
    curY += lineHeight;

    // Divider line
    curY += dividerGap;
    ctx.strokeStyle = 'rgba(76, 175, 80, 0.3)';
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(cardX + padding, curY);
    ctx.lineTo(cardX + cardW - padding, curY);
    ctx.stroke();
    curY += dividerGap + 1 * s;

    // 3) MOA hero — GREEN, big bold
    ctx.font = 'bold ' + Math.round(heroFontSize) + 'px sans-serif';
    ctx.fillStyle = GREEN;
    ctx.textAlign = 'center';
    ctx.fillText(formatFixed(results.groupSizeMOA, 2) + ' MOA', centerX, curY);
    curY += heroLineHeight;

    // 4) Group size inches
    curY += lineHeight * 0.1;
    ctx.font = Math.round(fontSize) + 'px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(formatFixed(results.groupSizeInches, 3) + '"', centerX, curY);
    curY += lineHeight;

    // Divider line
    curY += dividerGap;
    ctx.strokeStyle = 'rgba(76, 175, 80, 0.3)';
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(cardX + padding, curY);
    ctx.lineTo(cardX + cardW - padding, curY);
    ctx.stroke();
    curY += dividerGap + 1 * s;

    // 5) ATZ in inches
    ctx.font = Math.round(smallFontSize) + 'px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(atzElevAbbr + ': ' + formatFixed(atzElevInches, 2) + '"   ' + atzWindAbbr + ': ' + formatFixed(atzWindInches, 2) + '"', centerX, curY);
    curY += lineHeight;

    // 6) Rifle name — GREEN, bold, small caps with letter spacing
    if (results.rifleName) {
        curY += lineHeight * 0.6;
        ctx.font = 'bold ' + Math.round(smallFontSize) + 'px sans-serif';
        ctx.fillStyle = GREEN;
        var nameUpper = results.rifleName.toUpperCase();
        var spacing = 2 * s;
        var nameW = 0;
        for (var ci = 0; ci < nameUpper.length; ci++) {
            nameW += ctx.measureText(nameUpper[ci]).width + (ci < nameUpper.length - 1 ? spacing : 0);
        }
        var nx = centerX - nameW / 2;
        ctx.textAlign = 'left';
        for (var cj = 0; cj < nameUpper.length; cj++) {
            ctx.fillText(nameUpper[cj], nx, curY);
            nx += ctx.measureText(nameUpper[cj]).width + spacing;
        }
    }
}

/**
 * Generate a scaled-down thumbnail canvas from a source canvas.
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {number} maxWidth - Maximum width in pixels (default 400)
 * @returns {HTMLCanvasElement}
 */
function generateThumbnail(sourceCanvas, maxWidth) {
    maxWidth = maxWidth || 400;
    if (sourceCanvas.width <= maxWidth) return sourceCanvas;

    var scale = maxWidth / sourceCanvas.width;
    var thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = Math.round(sourceCanvas.width * scale);
    thumbCanvas.height = Math.round(sourceCanvas.height * scale);
    var ctx = thumbCanvas.getContext('2d');
    ctx.drawImage(sourceCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
    return thumbCanvas;
}

/**
 * Convert a canvas to a JPEG Blob.
 * @param {HTMLCanvasElement} canvas
 * @param {number} quality - JPEG quality 0–1
 * @returns {Promise<Blob>}
 */
function canvasToJpegBlob(canvas, quality) {
    return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
            if (blob) resolve(blob);
            else reject(new Error('Canvas toBlob returned null'));
        }, 'image/jpeg', quality);
    });
}

// _roundRect is defined in utils.js (loaded before export.js)
