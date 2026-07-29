/**
 * test-exif-orientation.js — UI Consolidation phase, item (4): the
 * reported "uploaded target photo displayed rotated/twisted" bug.
 *
 * Root cause (js/utils.js's loadImageFromFile): the function's OWN
 * comment claimed "modern browsers auto-apply EXIF orientation via
 * createImageBitmap, so we use that" — but the code never actually
 * called createImageBitmap; it only ever loaded through a plain
 * `new Image(); img.src = objectURL`. A browser's on-screen "auto-
 * rotate an <img> for CSS display" behavior is a DIFFERENT code path
 * from what ctx.drawImage() decodes when painting that same <img> onto
 * a canvas — canvas drawing has long been inconsistent about inheriting
 * that same correction, especially in WebView/iOS Safari, exactly what
 * a phone camera's portrait photo goes through in this app's capture
 * flows (session-flow.js, steel-session.js, scope-check.js,
 * onboarding.js all load photos through this one shared function).
 *
 * This codebase ships no build tools, no npm packages, and no browser
 * test runner (CLAUDE.md) — there is no Node-native canvas/Image/
 * createImageBitmap to actually decode a JPEG and inspect pixels here.
 * Two things this suite CAN do for real, without mocking anything:
 *
 *   1. Build a REAL, byte-correct portrait-shot EXIF-rotated JPEG
 *      fixture (tests/fixtures/portrait-exif-orientation-6.jpg) —
 *      raw sensor storage is LANDSCAPE (wider than tall, exactly how a
 *      phone held in portrait commonly stores the frame), with a real
 *      EXIF Orientation=6 tag recorded ("rotate 90° CW for correct
 *      display" — the standard tag for that physical phone
 *      orientation). Parse it back with a hand-rolled JPEG/EXIF header
 *      reader (no library) to prove the fixture is a genuine adversarial
 *      case: raw dimensions are landscape, but the EXIF-corrected
 *      dimensions a spec-compliant decode must produce are portrait
 *      (swapped) — the exact shape mismatch that a botched EXIF path
 *      turns into a rotated/twisted result.
 *
 *   2. Confirm (source-presence) that the fix requests EXACTLY the
 *      orientation-aware decode the spec defines for that fixture —
 *      createImageBitmap(file, { imageOrientation: 'from-image' }) —
 *      closing the loop between the fixture's real bytes and the fix,
 *      rather than asserting the fix in the abstract.
 *
 * Run: node tests/test-exif-orientation.js
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var FIXTURE_PATH = path.join(__dirname, 'fixtures', 'portrait-exif-orientation-6.jpg');

var passed = 0;
var failed = 0;
function check(label, actual, expected) {
    var ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// ── Fixture construction ────────────────────────────────────────
// A minimal, structurally real JPEG: SOI, an APP1/EXIF segment
// carrying a single IFD0 Orientation entry, a baseline SOF0 declaring
// RAW (unrotated) pixel dimensions, then EOI. No scan data — this
// suite only reads headers, never decodes pixels (nothing in this
// Node environment can), so a complete entropy-coded scan would add
// bytes without adding anything this test can check.

function u16be(n) { return Buffer.from([(n >> 8) & 0xff, n & 0xff]); }

/** Real EXIF/TIFF IFD0 with one Orientation (tag 0x0112, SHORT) entry. */
function buildExifApp1(orientation) {
    var tiff = Buffer.concat([
        Buffer.from('II', 'ascii'),           // little-endian byte order
        Buffer.from([0x2a, 0x00]),            // TIFF magic 42
        Buffer.from([0x08, 0x00, 0x00, 0x00]), // offset to IFD0 = 8
        Buffer.from([0x01, 0x00]),            // IFD0: 1 entry
        Buffer.from([0x12, 0x01]),            //   tag 0x0112 Orientation (LE)
        Buffer.from([0x03, 0x00]),            //   type 3 = SHORT (LE)
        Buffer.from([0x01, 0x00, 0x00, 0x00]), //   count 1 (LE)
        Buffer.from([orientation & 0xff, 0x00, 0x00, 0x00]), // value, SHORT left-justified in 4 bytes
        Buffer.from([0x00, 0x00, 0x00, 0x00])  // next IFD offset = 0 (none)
    ]);
    var payload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
    return Buffer.concat([
        Buffer.from([0xff, 0xe1]),            // APP1 marker
        u16be(payload.length + 2),            // segment length includes itself
        payload
    ]);
}

/** Baseline DCT SOF0, 1 component (grayscale — simplest valid SOF0),
 *  declaring the RAW (as-stored-by-the-sensor) pixel dimensions. */
function buildSof0(width, height) {
    var payload = Buffer.concat([
        Buffer.from([0x08]),                  // precision: 8 bits
        u16be(height), u16be(width),
        Buffer.from([0x01]),                  // 1 component
        Buffer.from([0x01, 0x11, 0x00])       // component id=1, sampling 1x1, qtable 0
    ]);
    return Buffer.concat([
        Buffer.from([0xff, 0xc0]),
        u16be(payload.length + 2),
        payload
    ]);
}

function buildFixtureJpeg(orientation, rawWidth, rawHeight) {
    return Buffer.concat([
        Buffer.from([0xff, 0xd8]),            // SOI
        buildExifApp1(orientation),
        buildSof0(rawWidth, rawHeight),
        Buffer.from([0xff, 0xd9])              // EOI (no scan data — headers only, see file header comment)
    ]);
}

// ── Fixture reader (independent of the builder above — a real parse,
//    not just reading back what we know we wrote, so a builder bug
//    can't silently agree with itself) ───────────────────────────

/** Walks JPEG markers looking for APP1/EXIF Orientation and SOF0
 *  width/height. Minimal on purpose: this suite only needs these two
 *  facts, not a general-purpose EXIF/JPEG library. */
function parseJpeg(buf) {
    assert(buf[0] === 0xff && buf[1] === 0xd8, 'not a JPEG (bad SOI)');
    var out = { orientation: null, rawWidth: null, rawHeight: null };
    var i = 2;
    while (i < buf.length - 1) {
        assert(buf[i] === 0xff, 'expected a marker at offset ' + i);
        var marker = buf[i + 1];
        if (marker === 0xd9) break; // EOI
        var len = buf.readUInt16BE(i + 2);
        var segStart = i + 4;
        if (marker === 0xe1) { // APP1
            var seg = buf.slice(segStart, i + 2 + len);
            if (seg.slice(0, 6).toString('ascii') === 'Exif\0\0') {
                var tiff = seg.slice(6);
                var le = tiff[0] === 0x49; // 'I'
                assert(le, 'fixture builder only emits little-endian TIFF');
                var ifd0Offset = tiff.readUInt32LE(4);
                var entryCount = tiff.readUInt16LE(ifd0Offset);
                for (var e = 0; e < entryCount; e++) {
                    var entryOff = ifd0Offset + 2 + e * 12;
                    var tag = tiff.readUInt16LE(entryOff);
                    if (tag === 0x0112) {
                        out.orientation = tiff.readUInt16LE(entryOff + 8); // SHORT value, first 2 bytes of the 4-byte slot
                    }
                }
            }
        } else if (marker >= 0xc0 && marker <= 0xc3) { // SOF0-3
            out.rawHeight = buf.readUInt16BE(segStart + 1);
            out.rawWidth = buf.readUInt16BE(segStart + 3);
        }
        i = i + 2 + len;
    }
    return out;
}

/** What a spec-compliant EXIF-aware decode (imageOrientation:
 *  'from-image') MUST produce for the given raw dimensions + tag —
 *  orientations 5-8 involve a 90-degree turn, which swaps width/height. */
function correctedDimensions(rawWidth, rawHeight, orientation) {
    var swaps = { 5: true, 6: true, 7: true, 8: true };
    return swaps[orientation]
        ? { width: rawHeight, height: rawWidth }
        : { width: rawWidth, height: rawHeight };
}

console.log('\n--- Fixture: a real portrait-shot, EXIF-rotated JPEG ---\n');

var fixtureBuf = buildFixtureJpeg(6, 40, 30); // orientation 6, raw storage 40x30 (landscape)
fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
fs.writeFileSync(FIXTURE_PATH, fixtureBuf);

check('fixture file was written to tests/fixtures/', fs.existsSync(FIXTURE_PATH), true);

var parsed = parseJpeg(fs.readFileSync(FIXTURE_PATH));
check('fixture carries a real EXIF Orientation=6 tag (phone held rotated 90° CW)', parsed.orientation, 6);
check('fixture\'s RAW sensor storage is landscape (40x30)', { w: parsed.rawWidth, h: parsed.rawHeight }, { w: 40, h: 30 });

var corrected = correctedDimensions(parsed.rawWidth, parsed.rawHeight, parsed.orientation);
check('a spec-correct EXIF-aware decode of this fixture MUST be portrait (30x40) — swapped from raw storage',
    corrected, { width: 30, height: 40 });
check('raw storage and the EXIF-corrected result are genuinely different shapes (a real adversarial case, not a no-op)',
    corrected.width !== parsed.rawWidth || corrected.height !== parsed.rawHeight, true);

console.log('\n--- The fix: js/utils.js requests exactly this orientation-aware decode ---\n');

var utilsSource = fs.readFileSync(path.join(ROOT, 'js/utils.js'), 'utf8');

check('loadImageFromFile calls createImageBitmap with { imageOrientation: \'from-image\' } (the spec-defined fix for this exact bug class)',
    /createImageBitmap\(file,\s*\{\s*imageOrientation:\s*'from-image'\s*\}\)/.test(utilsSource), true);

check('the old comment\'s FALSE claim ("createImageBitmap... so we use that" with no actual call) is gone — the function body genuinely does what it now says',
    /Modern browsers \(2024\+\) auto-apply EXIF orientation via createImageBitmap, so we use that\./.test(utilsSource), false);

check('a createImageBitmap failure/unsupported-option falls back to the <img> path rather than failing the whole capture',
    /\.catch\(function \(\) \{\s*\/\/[\s\S]{0,300}?loadViaImgElement\(\);/.test(utilsSource), true);

check('environments with no createImageBitmap at all still work (falls back immediately)',
    /if \(typeof createImageBitmap === 'function'\) \{[\s\S]*?\} else \{\s*loadViaImgElement\(\);\s*\}/.test(utilsSource), true);

console.log('\n--- Every capture path that loads a user photo goes through the fixed function ---\n');

['js/session-flow.js', 'js/steel-session.js', 'js/scope-check.js', 'js/onboarding.js'].forEach(function (f) {
    check(f + ' loads photos via loadImageFromFile (the one shared, now-fixed path)',
        fs.readFileSync(path.join(ROOT, f), 'utf8').indexOf('loadImageFromFile(') !== -1, true);
});

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
