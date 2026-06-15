/*
 * BMI Housing Society - Application form overlay engine.
 *
 * Draws the customer's typed details onto the ORIGINAL 4-page PDF
 * (used as a template) at the exact coordinates of each field, so the
 * downloaded PDF is identical in layout to the printed form.
 *
 * Coordinate system: PDF points, origin at BOTTOM-LEFT (y grows upward).
 * Page size: 595.5 x 842.2 (A4). Pages are 0-indexed internally.
 *
 * Works in the browser (window.PDFLib) and in Node (require('pdf-lib'))
 * via the shared fillPdf(PDFLib, templateBytes, data, images) entry point.
 */
(function (root) {
  'use strict';

  // ---- helpers -----------------------------------------------------------

  // Replace characters the standard Helvetica font cannot encode (e.g. the
  // rupee sign or smart quotes a user might paste) so drawing never throws.
  function sanitize(s) {
    if (s === undefined || s === null) return '';
    return String(s)
      .replace(/₹/g, 'Rs.')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/ /g, ' ');
  }

  function draw(page, font, text, x, y, size, color) {
    text = sanitize(text).trim();
    if (!text) return;
    page.drawText(text, { x: x, y: y, size: size, font: font, color: color });
  }

  // Wrap `text` to `maxWidth` and draw each resulting line on the
  // successive y positions in `ys`. Honours explicit newlines too.
  // If the text needs more lines than provided, remaining lines keep
  // flowing below the last y using `lineGap`.
  function drawWrapped(page, font, text, x, ys, size, color, maxWidth, lineGap) {
    text = sanitize(text);
    if (!text.trim()) return;
    lineGap = lineGap || (size + 4);
    var paras = text.split(/\r?\n/);
    var lines = [];
    paras.forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); return; }
      var cur = '';
      words.forEach(function (w) {
        var trial = cur ? cur + ' ' + w : w;
        if (maxWidth && font.widthOfTextAtSize(trial, size) > maxWidth && cur) {
          lines.push(cur);
          cur = w;
        } else {
          cur = trial;
        }
      });
      if (cur) lines.push(cur);
    });
    for (var i = 0; i < lines.length; i++) {
      var y = i < ys.length ? ys[i] : ys[ys.length - 1] - (i - ys.length + 1) * lineGap;
      draw(page, font, lines[i], x, y, size, color);
    }
  }

  // Comb-grid cell centre x-positions (PDF pts), measured from the form's
  // printed boxes. One character is drawn centred in each successive cell.
  // All cell centres below are measured directly from the printed PDF boxes
  // (pixel-accurate), so one block letter lands centred in each white cell.
  var CELLS = {
    // Page 1 main 24-box grid (Name / Father / Age-DOB / Address / Employment)
    main: [198.9, 213.6, 228.4, 243.1, 257.9, 272.6, 287.4, 302.1, 317.0, 331.9,
           346.6, 361.4, 376.1, 390.9, 405.6, 420.4, 435.4, 450.1, 464.9, 479.6,
           494.4, 509.3, 524.1, 538.9],
    // Phone (Office) boxes — right half of the contact row
    phoneO: [390.1, 404.9, 419.6, 434.4, 449.1, 464.0, 478.9, 493.6, 508.4, 523.1, 537.9],
    // Phone (Residence) / Mobile / E-mail row boxes — left half (same layout)
    contact: [198.1, 212.9, 227.6, 242.5, 257.4, 272.1, 286.9, 301.6, 316.4, 331.1, 345.9],
    // Nominee name / address boxes
    nomName: [227.4, 242.1, 256.9, 271.6, 286.4, 301.4, 316.1, 330.9, 345.6, 360.4,
              375.1, 389.9, 404.6, 419.4, 434.4, 449.1, 463.9, 478.6, 493.6, 508.4, 523.1, 537.9],
    nomAge: [227.6, 242.4, 257.1, 271.9],
    nomRel: [360.1, 374.9, 389.6, 404.5, 419.4, 434.1, 448.9, 463.6, 478.4, 493.4, 508.1, 522.9, 537.6],
    nomAddr: [227.4, 242.1, 257.1, 271.9, 286.6, 301.4, 316.1, 330.9, 345.6, 360.4, 375.4,
              390.1, 404.9, 419.6, 434.4, 449.3, 464.0, 478.9, 493.6, 508.4, 523.1, 537.9]
  };

  function drawCellChar(page, font, ch, cx, y, size, color) {
    if (ch === ' ') return; // leave the box blank for spaces
    var w = font.widthOfTextAtSize(ch, size);
    page.drawText(ch, { x: cx - w / 2, y: y, size: size, font: font, color: color });
  }

  // Draw text one BLOCK letter per box, centred in each cell. If the value is
  // longer than the available cells, fall back to continuous text starting at
  // the first cell (so long values like e-mails never overflow the boxes).
  function drawComb(page, font, text, centers, y, size, color) {
    var raw = sanitize(text).replace(/\s+$/, '');
    if (!raw.trim()) return;
    var t = raw.toUpperCase();
    if (t.length <= centers.length) {
      for (var i = 0; i < t.length; i++) drawCellChar(page, font, t[i], centers[i], y, size, color);
    } else {
      draw(page, font, raw, centers[0] - 6, y, size, color); // keep original case (e-mails)
    }
  }

  // Flow BLOCK letters one per box across several rows that share the same
  // column centres (used for the address / employment grids on page 1).
  function drawCombFlow(page, font, text, centers, ys, size, color) {
    var raw = sanitize(text).replace(/\s+$/, '');
    if (!raw.trim()) return;
    var t = raw.toUpperCase();
    if (t.length > centers.length * ys.length) {
      // too long for the boxes -> flow as continuous wrapped text instead
      drawWrapped(page, font, raw, centers[0] - 6, ys, size, color,
        centers[centers.length - 1] - centers[0] + 12, size + 4);
      return;
    }
    var idx = 0;
    for (var r = 0; r < ys.length && idx < t.length; r++) {
      for (var c = 0; c < centers.length && idx < t.length; c++) {
        drawCellChar(page, font, t[idx++], centers[c], ys[r], size, color);
      }
    }
  }

  // Draw an outline circle (no fill) around a Y/N choice marker.
  function circle(page, cx, cy, rx, ry, color) {
    page.drawEllipse({
      x: cx, y: cy, xScale: rx, yScale: ry,
      borderColor: color, borderWidth: 1.2,
      // no `color` => no fill, just the outline
    });
  }

  // A stable 4-digit serial number derived from the applicant's name + DOB.
  // The same person (same name & date of birth) always gets the same number,
  // so their Membership and Site applications share one serial.
  function serialFor(name, dob) {
    var key = sanitize(name).trim().toUpperCase().replace(/\s+/g, ' ') + '|' + (dob || '');
    if (!key.replace(/[|]/g, '').trim()) return ''; // nothing entered yet
    var h = 5381;
    for (var i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
    return String(h % 10000).padStart(4, '0');
  }

  // ---- main --------------------------------------------------------------

  // mode: 'purchase' (pages 1-2), 'membership' (pages 3-4), or 'both' (all 4).
  async function fillPdf(PDFLib, templateBytes, data, images, mode) {
    data = data || {};
    images = images || {};
    mode = mode || 'both';
    var PDFDocument = PDFLib.PDFDocument;
    var StandardFonts = PDFLib.StandardFonts;
    var rgb = PDFLib.rgb;

    var pdfDoc = await PDFDocument.load(templateBytes);
    var font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    var fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    var ink = rgb(0, 0, 0); // black ink

    var white = rgb(1, 1, 1);
    var pages = pdfDoc.getPages();
    var p1 = pages[0], p2 = pages[1], p3 = pages[2], p4 = pages[3];

    var g = function (k) { return data[k] != null ? String(data[k]) : ''; };
    var red = rgb(0.82, 0.09, 0.12);
    // Same 4-digit serial for this person's Membership AND Site applications.
    var serial = serialFor(g('name'), g('dob'));

    // CRITICAL: this template's page MediaBox does NOT start at y=0 — its
    // lower-left origin is at y≈7.83. pdf-lib's drawText() places text in
    // absolute user-space, but the page-1 comb-box coordinates below were
    // pixel-measured from the rendered page (relative to the VISIBLE bottom),
    // so they're short by exactly the MediaBox y-origin. Add it back, or every
    // block letter lands ~8pt too low (falling out of the white boxes).
    var mb = (p1.getMediaBox && p1.getMediaBox()) || { y: 0 };
    var dy = mb.y || 0;            // ≈ 7.83 for this template
    var Y = function (v) { return v + dy; };       // single y
    var YS = function (a) { return a.map(Y); };     // array of y's

    // ============ APPLICATION FOR PURCHASE OF SITE (pages 1-2) ============
    if (mode !== 'membership') {
    // Combined helper: age + date of birth, one char per box (no labels —
    // the row is already titled "Age, Date of Birth").
    var ageDobCells = [g('age'), g('dob') && fmtDate(g('dob'))].filter(Boolean).join('  ');

    // Draw a value onto a pre-printed dotted blank: first paint a strip of the
    // form's background green over the dots (so they don't show through the
    // typed value — "reduce the dots"), then draw the value resting on the line.
    var formGreen = rgb(162 / 255, 232 / 255, 167 / 255);
    function drawOnDottedLine(page, text, x, baselineY, size) {
      text = sanitize(text).trim();
      if (!text) return;
      var w = fontB.widthOfTextAtSize(text, size);
      page.drawRectangle({ x: x - 3, y: baselineY - 3.5, width: w + 7, height: size + 6, color: formGreen });
      page.drawText(text, { x: x, y: baselineY, size: size, font: fontB, color: ink });
    }

    // ===================== PAGE 1 : Purchase of Site =====================
    if (serial) draw(p1, fontB, serial, 480, 708, 13, red); // Sl. No. (red)
    // Site size + layout name sit on the two dotted blanks on the SAME line
    // ("…site Measuring [size] in [layout]"), both at the printed-text baseline
    // (y=579.9), with the dots masked beneath each value.
    drawOnDottedLine(p1, g('siteMeasuring'), 249, 579, 9);
    drawOnDottedLine(p1, g('layoutName'), 372, 579, 10);
    drawComb(p1, fontB, g('name'), CELLS.main, Y(534.7), 11, ink);
    drawComb(p1, fontB, g('father'), CELLS.main, Y(498.4), 11, ink);
    drawComb(p1, fontB, ageDobCells, CELLS.main, Y(473.4), 11, ink);

    // 4. SC/ST  -> circle Y or N  (printed Y@199, N@213, glyph centre y~440)
    if (g('scst') === 'Y') circle(p1, 199, Y(440), 7, 7, ink);
    else if (g('scst') === 'N') circle(p1, 213, Y(440), 7, 7, ink);

    // 5. Address for correspondence (one block letter per box, 3 rows) + contacts
    drawCombFlow(p1, fontB, g('addressCorr'), CELLS.main, YS([403.4, 388.1, 373.1]), 10.5, ink);
    drawComb(p1, fontB, g('phoneR'), CELLS.contact, Y(353.1), 10.5, ink);
    drawComb(p1, fontB, g('phoneO'), CELLS.phoneO, Y(353.1), 10.5, ink);
    drawComb(p1, fontB, g('mobile'), CELLS.contact, Y(332.1), 10.5, ink);
    drawComb(p1, fontB, g('email'), CELLS.contact, Y(312.4), 10.5, ink);

    // 6. Employment particulars (one block letter per box, 2 rows)
    drawCombFlow(p1, fontB, g('employment'), CELLS.main, YS([288.9, 273.9]), 10.5, ink);

    // 7. Ordinary resident / Native of Karnataka -> circle Y or N (glyph y~238)
    if (g('resident') === 'Y') circle(p1, 199.5, Y(238), 7, 7, ink);
    else if (g('resident') === 'N') circle(p1, 213.5, Y(238), 7, 7, ink);

    // 8. Nominee particulars (one char per box)
    drawComb(p1, fontB, g('nomName'), CELLS.nomName, Y(208.4), 10.5, ink);
    drawComb(p1, fontB, g('nomAge'), CELLS.nomAge, Y(190.9), 10.5, ink);
    drawComb(p1, fontB, g('nomRel'), CELLS.nomRel, Y(190.9), 10.5, ink);
    drawComb(p1, fontB, g('nomAddr'), CELLS.nomAddr, Y(173.4), 10.5, ink);

    // 9. Family members (up to 5 rows): name @225, age @383, rel @443
    var famY = [108, 88, 68.5, 49, 29.5];
    (data.family || []).slice(0, 5).forEach(function (m, i) {
      if (!m) return;
      draw(p1, fontB, m.name, 225, famY[i], 9, ink);
      draw(p1, fontB, m.age, 388, famY[i], 9, ink);
      draw(p1, fontB, m.relationship, 443, famY[i], 9, ink);
    });

    // ===================== PAGE 2 : Purchase (payment + sign) ============
    drawWrapped(p2, fontB, g('purBankInstr'), 395, [822, 798], 9, ink, 140, 13);
    draw(p2, fontB, g('purBank'), 278, 773.5, 10, ink);
    draw(p2, fontB, g('purAmount'), 292, 748, 10, ink);
    draw(p2, fontB, g('place'), 95, 512, 11, ink);
    draw(p2, fontB, fmtDate(g('date')), 90, 472, 11, ink);
    // Digital signature above "Signature of the Applicant"
    await placeImage(pdfDoc, p2, images.signature, 386, 474, 140, 40, null);
    } // end purchase

    // ============ APPLICATION FOR MEMBERSHIP (pages 3-4) ==================
    if (mode !== 'purchase') {
    // ===================== PAGE 3 : Membership ==========================
    if (serial) draw(p3, fontB, serial, 478, 694, 13, red); // Sl. No. (red)
    draw(p3, fontB, g('phoneR'), 138, 73.5, 11, ink);
    draw(p3, fontB, g('phoneO'), 326, 73.5, 11, ink);
    draw(p3, fontB, g('mobile'), 98, 50, 11, ink);
    draw(p3, fontB, g('email'), 343, 50, 11, ink);

    // Answers aligned into the form's right column (label = left column)
    draw(p3, fontB, g('name').toUpperCase(), 305, 599, 13, ink);
    var dobPlaceAge = [fmtDate(g('dob')), g('placeOfBirth'), g('age') && ('Age ' + g('age'))]
      .filter(Boolean).join(', ');
    draw(p3, fontB, dobPlaceAge, 305, 578, 11, ink);
    draw(p3, fontB, g('father').toUpperCase(), 305, 557, 11, ink);

    // 4. Address for correspondence (left, 4 dotted lines) — sit above the dots
    drawWrapped(p3, fontB, g('addressCorr'), 70, [508, 481.5, 455, 428.5], 11, ink, 205, 26);
    // 7. Permanent address (left, 3 dotted lines)
    drawWrapped(p3, fontB, g('permAddr') || g('addressCorr'), 64, [391, 364.5, 338], 11, ink, 225, 26);
    // 8. Designation & full office address (right, 3 dotted lines)
    drawWrapped(p3, fontB, g('designation'), 310, [391, 364.5, 338], 11, ink, 220, 26);

    // 9. Nominee (left: name, age/dob ; right: relationship, address)
    draw(p3, fontB, g('nomName').toUpperCase(), 115, 297.5, 11, ink);
    var nomAgeDob = [g('nomAge') && ('Age ' + g('nomAge')), g('nomDob') && fmtDate(g('nomDob'))]
      .filter(Boolean).join(', ');
    draw(p3, fontB, nomAgeDob, 135, 264.5, 11, ink);
    draw(p3, fontB, g('nomRel'), 365, 322, 11, ink);
    drawWrapped(p3, fontB, g('nomAddr'), 380, [301, 279], 11, ink, 150, 22);

    // Shares (pre-printed TEN), Remarks and the Payment section are left blank
    // on the form for the society's office to complete.

    // Photo boxes are intentionally left blank — a physical photograph is
    // pasted onto the printed form by the society.

    // ===================== PAGE 4 : Membership declaration ==============
    draw(p4, fontB, g('place'), 95, 513, 11, ink);
    draw(p4, fontB, fmtDate(g('date')), 90, 479, 11, ink);
    // Digital signature above "Signature of the Applicant"
    await placeImage(pdfDoc, p4, images.signature, 388, 476, 140, 40, null);
    } // end membership

    // Keep only the pages for the chosen application (remove from the end so
    // the indices of earlier pages stay valid while removing).
    if (mode === 'purchase') { pdfDoc.removePage(3); pdfDoc.removePage(2); }
    else if (mode === 'membership') { pdfDoc.removePage(1); pdfDoc.removePage(0); }

    return await pdfDoc.save();
  }

  // Embed an uploaded image (PNG/JPEG) centered within a box, covering the
  // "Affix your photograph" placeholder. `img` is a Uint8Array or null.
  async function placeImage(pdfDoc, page, img, bx, by, bw, bh, white) {
    if (!img || !img.bytes) return;
    var embedded;
    try {
      if (img.type === 'image/png') embedded = await pdfDoc.embedPng(img.bytes);
      else embedded = await pdfDoc.embedJpg(img.bytes);
    } catch (e) { return; }
    var scale = Math.min(bw / embedded.width, bh / embedded.height);
    var w = embedded.width * scale, h = embedded.height * scale;
    var x = bx + (bw - w) / 2, y = by + (bh - h) / 2;
    // white backing (for photos) — omitted for signatures so they overlay
    // transparently on the form's signature line.
    if (white) page.drawRectangle({ x: bx, y: by, width: bw, height: bh, color: white });
    page.drawImage(embedded, { x: x, y: y, width: w, height: h });
  }

  function fmtDate(s) {
    if (!s) return '';
    // Accept yyyy-mm-dd (from <input type=date>) -> dd-mm-yyyy
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return m[3] + '-' + m[2] + '-' + m[1];
    return s;
  }

  root.BMIOverlay = { fillPdf: fillPdf, fmtDate: fmtDate };
})(typeof window !== 'undefined' ? window : globalThis);
