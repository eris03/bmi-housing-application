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
  var CELLS = {
    // Page 1 main 24-box grid (Name / Father / Age-DOB rows)
    main: [197.0, 213.5, 228.4, 243.2, 258.0, 272.8, 287.5, 302.3, 317.0, 331.8,
           346.5, 361.4, 376.2, 391.0, 405.8, 420.6, 435.4, 450.2, 464.9, 479.7,
           494.5, 509.3, 524.0, 538.7],
    // Phone (Office) boxes
    phoneO: [384.5, 404.9, 419.6, 434.4, 449.3, 464.0, 478.8, 493.6, 508.4, 523.3, 538.1],
    // Phone (Residence) / Mobile / E-mail row boxes (same layout)
    contact: [191.3, 213.0, 227.8, 242.6, 257.4, 272.1, 286.9, 301.7, 316.5, 331.3, 346.0],
    // Nominee name / address boxes
    nomName: [223.7, 242.2, 257.0, 271.8, 286.5, 301.3, 316.0, 330.8, 345.5, 360.4,
              375.2, 390.0, 404.8, 419.6, 434.4, 449.2, 463.9, 478.7, 493.5, 508.3, 523.0, 538.0],
    nomAge: [223.9, 242.4, 257.1, 272.8],
    nomRel: [359.0, 374.9, 389.8, 404.5, 419.3, 434.1, 448.9, 463.7, 478.6, 493.4, 508.1, 522.9, 537.8],
    nomAddr: [223.8, 242.3, 257.1, 271.9, 286.6, 301.4, 316.1, 330.9, 345.7, 360.6, 375.4,
              390.1, 404.9, 419.6, 434.4, 449.3, 464.0, 478.8, 493.6, 508.4, 523.1, 538.0]
  };

  // Draw text one character per box, centred in each cell. If the value is
  // longer than the available cells, fall back to continuous text starting at
  // the first cell (so long values like e-mails never overflow the boxes).
  function drawComb(page, font, text, centers, y, size, color) {
    text = sanitize(text).replace(/\s+$/, '');
    if (!text.trim()) return;
    if (text.length <= centers.length) {
      for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        if (ch === ' ') continue; // leave the box blank for spaces
        var w = font.widthOfTextAtSize(ch, size);
        page.drawText(ch, { x: centers[i] - w / 2, y: y, size: size, font: font, color: color });
      }
    } else {
      draw(page, font, text, centers[0] - 6, y, size, color);
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
    var ink = rgb(0.05, 0.08, 0.45); // dark blue, reads as hand-filled ink

    var white = rgb(1, 1, 1);
    var pages = pdfDoc.getPages();
    var p1 = pages[0], p2 = pages[1], p3 = pages[2], p4 = pages[3];

    var g = function (k) { return data[k] != null ? String(data[k]) : ''; };

    // ============ APPLICATION FOR PURCHASE OF SITE (pages 1-2) ============
    if (mode !== 'membership') {
    // Combined helper: age + date of birth, one char per box (no labels —
    // the row is already titled "Age, Date of Birth").
    var ageDobCells = [g('age'), g('dob') && fmtDate(g('dob'))].filter(Boolean).join('  ');

    // ===================== PAGE 1 : Purchase of Site =====================
    draw(p1, font, g('siteMeasuring'), 290, 587, 9, ink);
    draw(p1, font, g('layoutName'), 92, 575, 9, ink);
    drawComb(p1, fontB, g('name'), CELLS.main, 533, 11, ink);
    drawComb(p1, font, g('father'), CELLS.main, 502, 10, ink);
    drawComb(p1, font, ageDobCells, CELLS.main, 479, 10, ink);

    // 4. SC/ST  -> circle Y or N  (Y@196.1, N@209.2  baseline 444.5)
    if (g('scst') === 'Y') circle(p1, 198.5, 447, 7, 7, ink);
    else if (g('scst') === 'N') circle(p1, 212, 447, 7, 7, ink);

    // 5. Address for correspondence (2 lines) + contacts
    drawWrapped(p1, font, g('addressCorr'), 192, [403, 389], 9, ink, 340, 13);
    drawComb(p1, font, g('phoneR'), CELLS.contact, 356.5, 9, ink); // same box row as mobile
    drawComb(p1, font, g('phoneO'), CELLS.phoneO, 356.5, 9, ink); // (O) office phone
    drawComb(p1, font, g('mobile'), CELLS.contact, 337, 9, ink);
    drawComb(p1, font, g('email'), CELLS.contact, 317.5, 9, ink);

    // 6. Employment particulars (up to 3 lines)
    drawWrapped(p1, font, g('employment'), 192, [294, 281, 268], 9, ink, 345, 12);

    // 7. Ordinary resident / Native of Karnataka -> circle Y or N
    if (g('resident') === 'Y') circle(p1, 199, 243, 7, 7, ink);
    else if (g('resident') === 'N') circle(p1, 212.5, 243, 7, 7, ink);

    // 8. Nominee particulars (one char per box)
    drawComb(p1, font, g('nomName'), CELLS.nomName, 216, 9, ink);
    drawComb(p1, font, g('nomAge'), CELLS.nomAge, 200.5, 9, ink);
    drawComb(p1, font, g('nomRel'), CELLS.nomRel, 199, 9, ink);
    drawComb(p1, font, g('nomAddr'), CELLS.nomAddr, 182, 9, ink);

    // 9. Family members (up to 5 rows): name @225, age @383, rel @443
    var famY = [108, 88, 68.5, 49, 29.5];
    (data.family || []).slice(0, 5).forEach(function (m, i) {
      if (!m) return;
      draw(p1, font, m.name, 225, famY[i], 8.5, ink);
      draw(p1, font, m.age, 388, famY[i], 8.5, ink);
      draw(p1, font, m.relationship, 443, famY[i], 8.5, ink);
    });

    // ===================== PAGE 2 : Purchase (payment + sign) ============
    drawWrapped(p2, font, g('purBankInstr'), 395, [822, 798], 8.5, ink, 140, 13);
    draw(p2, font, g('purBank'), 278, 773.5, 9, ink);
    draw(p2, font, g('purAmount'), 292, 748, 9, ink);
    draw(p2, font, g('place'), 95, 512, 10, ink);
    draw(p2, font, fmtDate(g('date')), 90, 472, 10, ink);
    // Digital signature above "Signature of the Applicant"
    await placeImage(pdfDoc, p2, images.signature, 386, 474, 140, 40, null);
    } // end purchase

    // ============ APPLICATION FOR MEMBERSHIP (pages 3-4) ==================
    if (mode !== 'purchase') {
    // ===================== PAGE 3 : Membership ==========================
    draw(p3, font, g('phoneR'), 138, 71, 9, ink);
    draw(p3, font, g('phoneO'), 326, 71, 9, ink);
    draw(p3, font, g('mobile'), 98, 47.5, 9, ink);
    draw(p3, font, g('email'), 343, 47.5, 9, ink);

    draw(p3, fontB, g('name'), 270, 596, 10, ink);
    var dobPlaceAge = [fmtDate(g('dob')), g('placeOfBirth'), g('age') && ('Age ' + g('age'))]
      .filter(Boolean).join(', ');
    draw(p3, font, dobPlaceAge, 200, 576, 9, ink);
    draw(p3, font, g('father'), 205, 555, 9, ink);

    // 4. Address for correspondence (left, 4 dotted lines)
    drawWrapped(p3, font, g('addressCorr'), 70, [505, 478.5, 452, 425.5], 9.5, ink, 205, 26);
    // 7. Permanent address (left, 3 dotted lines)
    drawWrapped(p3, font, g('permAddr') || g('addressCorr'), 64, [388, 361.5, 335], 9.5, ink, 225, 26);
    // 8. Designation & full office address (right, 3 dotted lines)
    drawWrapped(p3, font, g('designation'), 310, [388, 361.5, 335], 9.5, ink, 220, 26);

    // 9. Nominee (left: name, age/dob ; right: relationship, address)
    draw(p3, font, g('nomName'), 115, 297.5, 9, ink);
    var nomAgeDob = [g('nomAge') && ('Age ' + g('nomAge')), g('nomDob') && fmtDate(g('nomDob'))]
      .filter(Boolean).join(', ');
    draw(p3, font, nomAgeDob, 135, 264.5, 9, ink);
    draw(p3, font, g('nomRel'), 365, 320, 9, ink);
    drawWrapped(p3, font, g('nomAddr'), 380, [298, 276], 8.5, ink, 150, 22);

    // 10. Shares: the form pre-prints "TEN"; only overlay if the applicant
    // explicitly requested a different count (placed clear of label & "TEN").
    var sh = g('shares').trim();
    if (sh && !/^(10|ten)$/i.test(sh)) draw(p3, font, sh, 255, 246, 9, ink);
    // 11. Remarks
    drawWrapped(p3, font, g('remarks'), 160, [229.5], 9, ink, 370, 11);

    // 12. Membership payment
    draw(p3, font, g('memCash'), 180, 179.5, 9, ink);
    draw(p3, font, g('memCheque'), 180, 157.5, 9, ink);
    draw(p3, font, g('memOnline'), 180, 123.5, 9, ink);
    draw(p3, font, g('memBankBranch'), 170, 100.5, 9, ink);

    // Photo boxes are intentionally left blank — a physical photograph is
    // pasted onto the printed form by the society.

    // ===================== PAGE 4 : Membership declaration ==============
    draw(p4, font, g('place'), 95, 513, 10, ink);
    draw(p4, font, fmtDate(g('date')), 90, 479, 10, ink);
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
