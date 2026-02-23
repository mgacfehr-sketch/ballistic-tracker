/**
 * export.js — Renders an annotated image with markers and results overlay.
 *
 * Creates an offscreen canvas at the full image resolution,
 * draws the original photo, all markers, and a results card overlay.
 * Returns the canvas for saving/sharing.
 */

/**
 * Render the annotated image to an offscreen canvas.
 * @param {HTMLImageElement} image - The original target photo
 * @param {Array} markers - Array of marker objects from canvas-manager
 * @param {object|null} calibrationLine - {a:{x,y}, b:{x,y}} or null
 * @param {number} bulletDiameterPx - Bullet diameter in image pixels
 * @param {object} results - Results from calculateSession
 * @returns {HTMLCanvasElement} The rendered canvas
 */
function renderAnnotatedImage(image, markers, calibrationLine, bulletDiameterPx, results) {
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
        _drawResultsOverlay(ctx, w, h, results, sf);
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

function _drawResultsOverlay(ctx, canvasW, canvasH, results, sf) {
    var padding = 18 * sf;
    var lineHeight = 22 * sf;
    var fontSize = 14 * sf;
    var titleFontSize = 18 * sf;
    var smallFontSize = 12 * sf;

    // ATZ in inches: absolute value of POA offsets (ATZ negates the offset direction)
    var atzElevInches = Math.abs(results.elevationOffsetInches || 0);
    var atzWindInches = Math.abs(results.windageOffsetInches || 0);
    // Abbreviate direction: Down→D, Up→U, Left→L, Right→R
    var atzElevAbbr = (results.atzElevationDir || '')[0] || '';
    var atzWindAbbr = (results.atzWindageDir || '')[0] || '';

    // Build text lines
    var lines = [];
    lines.push({ text: 'YORT', bold: true, size: titleFontSize, color: '#4caf50' });
    lines.push({ text: '', gap: 0.5 }); // spacer
    lines.push({ text: results.distanceYards + ' Yards / ' + results.shotCount + ' Shot Group', bold: false, size: fontSize, color: '#e0e0e0' });
    lines.push({ text: '', gap: 0.3 });
    lines.push({ text: 'Group: ' + formatFixed(results.groupSizeInches, 3) + '" (' + formatFixed(results.groupSizeMOA, 2) + ' MOA)', bold: true, size: fontSize, color: '#ffffff' });
    lines.push({ text: '', gap: 0.3 });
    lines.push({ text: 'ATZ(INCH): ' + atzElevAbbr + ': ' + formatFixed(atzElevInches, 2) + '  ' + atzWindAbbr + ': ' + formatFixed(atzWindInches, 2), bold: true, size: fontSize, color: '#4caf50' });
    lines.push({ text: 'ATZ(MOA):  ' + atzElevAbbr + ': ' + formatFixed(results.atzElevationMOA, 2) + '  ' + atzWindAbbr + ': ' + formatFixed(results.atzWindageMOA, 2), bold: false, size: smallFontSize, color: '#aaaaaa' });

    // Measure card dimensions
    var maxWidth = 0;
    for (var i = 0; i < lines.length; i++) {
        if (!lines[i].text) continue;
        var f = (lines[i].bold ? 'bold ' : '') + Math.round(lines[i].size || fontSize) + 'px sans-serif';
        ctx.font = f;
        var w = ctx.measureText(lines[i].text).width;
        if (w > maxWidth) maxWidth = w;
    }

    // Calculate total height
    var totalHeight = padding * 2;
    for (var k = 0; k < lines.length; k++) {
        if (!lines[k].text) {
            totalHeight += lineHeight * (lines[k].gap || 0.4);
        } else {
            totalHeight += lineHeight;
        }
    }

    var cardW = maxWidth + padding * 2;
    var cardH = totalHeight;
    var cardX = canvasW - cardW - padding;
    var cardY = canvasH - cardH - padding;

    // Draw card background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.80)';
    _roundRect(ctx, cardX, cardY, cardW, cardH, 8 * sf);
    ctx.fill();

    // Draw card border
    ctx.strokeStyle = 'rgba(76, 175, 80, 0.7)';
    ctx.lineWidth = 2 * sf;
    _roundRect(ctx, cardX, cardY, cardW, cardH, 8 * sf);
    ctx.stroke();

    // Draw accent line under title
    var textX = cardX + padding;
    var textY = cardY + padding + titleFontSize;

    // Draw title
    ctx.font = 'bold ' + Math.round(titleFontSize) + 'px sans-serif';
    ctx.fillStyle = lines[0].color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(lines[0].text, textX, textY);
    textY += lineHeight;

    // Accent line under title
    ctx.strokeStyle = 'rgba(76, 175, 80, 0.5)';
    ctx.lineWidth = 1 * sf;
    ctx.beginPath();
    ctx.moveTo(textX, textY);
    ctx.lineTo(textX + maxWidth, textY);
    ctx.stroke();

    // Draw remaining lines
    for (var j = 1; j < lines.length; j++) {
        var line = lines[j];
        if (!line.text) {
            textY += lineHeight * (line.gap || 0.4);
            continue;
        }
        var font = (line.bold ? 'bold ' : '') + Math.round(line.size || fontSize) + 'px sans-serif';
        ctx.font = font;
        ctx.fillStyle = line.color || '#e0e0e0';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(line.text, textX, textY);
        textY += lineHeight;
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

/**
 * Draw a rounded rectangle path.
 */
function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}
