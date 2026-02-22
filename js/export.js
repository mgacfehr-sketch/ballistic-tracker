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
    var padding = 16 * sf;
    var lineHeight = 20 * sf;
    var fontSize = 14 * sf;
    var titleFontSize = 16 * sf;

    // Build text lines
    var lines = [];
    lines.push({ text: 'BALLISTIC TRACKER', bold: true, size: titleFontSize });
    lines.push({ text: '' }); // spacer
    lines.push({ text: results.shotCount + ' shots @ ' + results.distanceYards + ' yds', bold: false, size: fontSize });
    lines.push({ text: '' });
    lines.push({ text: 'Group: ' + formatFixed(results.groupSizeInches, 3) + '" / ' + formatFixed(results.groupSizeMOA, 2) + ' MOA', bold: true, size: fontSize });
    lines.push({ text: 'Mean Radius: ' + formatFixed(results.meanRadiusInches, 3) + '" / ' + formatFixed(results.meanRadiusMOA, 2) + ' MOA', bold: false, size: fontSize });
    lines.push({ text: '' });
    lines.push({ text: 'ATZ: ' + results.atzElevationDir + ' ' + formatFixed(results.atzElevationMOA, 2) + ', ' + results.atzWindageDir + ' ' + formatFixed(results.atzWindageMOA, 2) + ' MOA', bold: true, size: fontSize });

    // Measure card dimensions
    ctx.font = 'bold ' + Math.round(titleFontSize) + 'px sans-serif';
    var maxWidth = 0;
    for (var i = 0; i < lines.length; i++) {
        var f = (lines[i].bold ? 'bold ' : '') + Math.round(lines[i].size || fontSize) + 'px sans-serif';
        ctx.font = f;
        var w = ctx.measureText(lines[i].text).width;
        if (w > maxWidth) maxWidth = w;
    }

    var cardW = maxWidth + padding * 2;
    var cardH = lines.length * lineHeight + padding * 2;
    var cardX = canvasW - cardW - padding;
    var cardY = canvasH - cardH - padding;

    // Draw card background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    _roundRect(ctx, cardX, cardY, cardW, cardH, 8 * sf);
    ctx.fill();

    // Draw card border
    ctx.strokeStyle = 'rgba(76, 175, 80, 0.6)';
    ctx.lineWidth = 1.5 * sf;
    _roundRect(ctx, cardX, cardY, cardW, cardH, 8 * sf);
    ctx.stroke();

    // Draw text
    var textX = cardX + padding;
    var textY = cardY + padding + fontSize;

    for (var j = 0; j < lines.length; j++) {
        var line = lines[j];
        if (!line.text) {
            textY += lineHeight * 0.4;
            continue;
        }
        var font = (line.bold ? 'bold ' : '') + Math.round(line.size || fontSize) + 'px sans-serif';
        ctx.font = font;
        ctx.fillStyle = line.bold ? '#4caf50' : '#e0e0e0';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(line.text, textX, textY);
        textY += lineHeight;
    }
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
