/* BMI Housing Society application forms – UI logic (browser only). */
(function () {
  'use strict';

  var STORAGE_KEY = 'bmi_application_draft_v2';

  var APPS = {
    purchase:   { title: 'Application for Purchase of Site', file: 'BMI_Purchase_of_Site' },
    membership: { title: 'Application for Membership',       file: 'BMI_Membership' }
  };

  var TEXT_FIELDS = [
    'siteMeasuring', 'layoutName', 'name', 'father', 'placeOfBirth', 'age', 'dob',
    'addressCorr', 'phoneR', 'phoneO', 'mobile', 'email', 'permAddr', 'designation', 'employment',
    'nomName', 'nomRel', 'nomAge', 'nomDob', 'nomAddr',
    'purBankInstr', 'purBank', 'purAmount',
    'memCash', 'memCheque', 'memOnline', 'memBankBranch', 'shares', 'remarks',
    'place', 'date'
  ];

  var FAMILY_ROWS = 5;
  var sigBytes = null;      // PNG bytes of the drawn signature, or null
  var sigClear = null;      // function to clear the signature pad
  var currentApp = null;

  // ---- family table ------------------------------------------------------
  function buildFamily() {
    var html = '';
    for (var i = 0; i < FAMILY_ROWS; i++) {
      html += '<tr><td class="sl">' + (i + 1) + '.</td>' +
        '<td><input type="text" id="fam' + i + 'name"></td>' +
        '<td><input type="text" id="fam' + i + 'age"></td>' +
        '<td><input type="text" id="fam' + i + 'rel"></td></tr>';
    }
    document.getElementById('famBody').innerHTML = html;
  }

  // ---- helpers -----------------------------------------------------------
  function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
  function setVal(id, v) { var el = document.getElementById(id); if (el && v != null) el.value = v; }
  function radioVal(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }
  function setRadio(name, v) {
    if (!v) return;
    var el = document.querySelector('input[name="' + name + '"][value="' + v + '"]');
    if (el) el.checked = true;
  }

  function collectData() {
    var d = {};
    TEXT_FIELDS.forEach(function (k) { d[k] = val(k); });
    d.scst = radioVal('scst');
    d.resident = radioVal('resident');
    d.family = [];
    for (var i = 0; i < FAMILY_ROWS; i++) {
      d.family.push({ name: val('fam' + i + 'name'), age: val('fam' + i + 'age'), relationship: val('fam' + i + 'rel') });
    }
    return d;
  }

  // ---- draft persistence -------------------------------------------------
  var savedTimer;
  function flashSaved() {
    var m = document.getElementById('savedMsg');
    m.style.display = 'inline-block';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(function () { m.style.display = 'none'; }, 1400);
  }
  function saveDraft() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(collectData())); flashSaved(); } catch (e) {}
  }
  function restoreDraft() {
    var raw; try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return; }
    if (!raw) return;
    var d; try { d = JSON.parse(raw); } catch (e) { return; }
    TEXT_FIELDS.forEach(function (k) { if (d[k] != null) setVal(k, d[k]); });
    setRadio('scst', d.scst); setRadio('resident', d.resident);
    (d.family || []).forEach(function (m, i) {
      if (i >= FAMILY_ROWS || !m) return;
      setVal('fam' + i + 'name', m.name); setVal('fam' + i + 'age', m.age); setVal('fam' + i + 'rel', m.relationship);
    });
  }

  // ---- signature pad -----------------------------------------------------
  function dataUrlToBytes(durl) {
    var b64 = durl.split(',')[1], bin = atob(b64), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  function setupSignature() {
    var canvas = document.getElementById('sigPad');
    var ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0d2c66';
    var drawing = false, dirty = false, last = null;

    function pos(e) {
      var r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (canvas.width / r.width),
        y: (e.clientY - r.top) * (canvas.height / r.height)
      };
    }
    function start(e) { e.preventDefault(); drawing = true; last = pos(e); }
    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      var p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p; dirty = true;
    }
    function end() {
      if (!drawing) return;
      drawing = false;
      if (dirty) sigBytes = dataUrlToBytes(canvas.toDataURL('image/png'));
    }
    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);

    sigClear = function () {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      sigBytes = null; dirty = false;
    };
    document.getElementById('sigClear').addEventListener('click', sigClear);
  }

  // ---- app selection / navigation ---------------------------------------
  function showAppFields(app) {
    var els = document.querySelectorAll('[data-apps]');
    els.forEach(function (el) {
      var list = el.getAttribute('data-apps').split(/\s+/);
      el.classList.toggle('hidden', list.indexOf(app) === -1);
    });
  }

  function chooseApp(app) {
    currentApp = app;
    showAppFields(app);
    document.getElementById('formTitle').textContent = APPS[app].title;
    document.getElementById('genBtn').innerHTML = '⬇ Download ' +
      (app === 'purchase' ? 'Purchase' : 'Membership') + ' Application PDF';
    document.getElementById('landing').classList.add('hidden');
    document.getElementById('appForm').classList.remove('hidden');
    document.getElementById('actionBar').classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function backToLanding() {
    currentApp = null;
    document.getElementById('appForm').classList.add('hidden');
    document.getElementById('actionBar').classList.add('hidden');
    document.getElementById('landing').classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  // ---- template + generate ----------------------------------------------
  function templateBytes() {
    var bin = atob(window.TEMPLATE_PDF_BASE64), len = bin.length, bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  async function generate() {
    if (!currentApp) return;
    var btn = document.getElementById('genBtn');
    var data = collectData();
    if (!data.name.trim()) {
      alert('Please enter at least the applicant name before generating the PDF.');
      document.getElementById('name').focus();
      return;
    }
    btn.disabled = true;
    var orig = btn.innerHTML;
    btn.textContent = 'Generating…';
    try {
      var images = { signature: sigBytes ? { bytes: sigBytes, type: 'image/png' } : null };
      var bytes = await window.BMIOverlay.fillPdf(window.PDFLib, templateBytes(), data, images, currentApp);
      var blob = new Blob([bytes], { type: 'application/pdf' });
      var url = URL.createObjectURL(blob);
      var safe = data.name.trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'Applicant';
      var a = document.createElement('a');
      a.href = url; a.download = APPS[currentApp].file + '_' + safe + '.pdf';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    } catch (e) {
      console.error(e);
      alert('Sorry, something went wrong while creating the PDF:\n' + (e && e.message ? e.message : e));
    } finally {
      btn.disabled = false; btn.innerHTML = orig;
    }
  }

  // ---- init --------------------------------------------------------------
  function init() {
    buildFamily();
    restoreDraft();
    setupSignature();

    document.querySelectorAll('.opt').forEach(function (card) {
      card.addEventListener('click', function () { chooseApp(card.getAttribute('data-go')); });
    });
    document.getElementById('backBtn').addEventListener('click', backToLanding);
    document.getElementById('appForm').addEventListener('input', saveDraft);
    document.getElementById('genBtn').addEventListener('click', generate);
    document.getElementById('clearBtn').addEventListener('click', function () {
      if (!confirm('Clear all entered details? This cannot be undone.')) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      document.getElementById('appForm').reset();
      if (sigClear) sigClear();
      document.getElementById('shares').value = '10';
    });

    if (!window.PDFLib || !window.BMIOverlay || !window.TEMPLATE_PDF_BASE64) {
      alert('The form engine did not load correctly. Please keep index.html, app.js, overlay.js, template.js and the lib/ folder together in the same folder.');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
