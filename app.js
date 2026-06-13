/* BMI Housing Society application forms – UI logic (browser only). */
(function () {
  'use strict';

  var STORAGE_KEY = 'bmi_application_draft_v3';

  var APPS = {
    membership: { title: 'Application for Membership' },
    purchase:   { title: 'Application for Purchase of Site' }
  };

  var TEXT_FIELDS = [
    'siteMeasuring', 'layoutName', 'name', 'father', 'placeOfBirth', 'age', 'dob',
    'addressCorr', 'phoneR', 'phoneO', 'mobile', 'email', 'permAddr', 'designation', 'employment',
    'nomName', 'nomRel', 'nomAge', 'nomDob', 'nomAddr',
    'purBankInstr', 'purBank', 'purAmount',
    'place', 'date'
  ];

  var FAMILY_ROWS = 5;
  var sigBytes = null;       // PNG bytes of the drawn signature, or null
  var sigClearFn = null;     // clears the signature pad
  var currentApp = null;
  var previewUrl = null;

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
  function todayStr() {
    var t = new Date();
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
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

  // ---- age auto-fill from DOB (still editable) ---------------------------
  function calcAge() {
    var dob = document.getElementById('dob').value;
    if (!dob) return;
    var b = new Date(dob); if (isNaN(b.getTime())) return;
    var t = new Date(); var a = t.getFullYear() - b.getFullYear();
    var m = t.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
    if (a >= 0 && a < 140) document.getElementById('age').value = a;
  }

  // ---- permanent address "same as correspondence" ------------------------
  function setupPermSame() {
    var cb = document.getElementById('permSame');
    var pa = document.getElementById('permAddr');
    var ac = document.getElementById('addressCorr');
    function sync() {
      if (cb.checked) { pa.value = ac.value; pa.readOnly = true; }
      else { pa.readOnly = false; }
    }
    cb.addEventListener('change', sync);
    ac.addEventListener('input', function () { if (cb.checked) pa.value = ac.value; });
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
    ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    var drawing = false, dirty = false, last = null;
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
    }
    function start(e) { e.preventDefault(); drawing = true; last = pos(e); }
    function move(e) {
      if (!drawing) return; e.preventDefault();
      var p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p; dirty = true;
    }
    function end() { if (!drawing) return; drawing = false; if (dirty) sigBytes = dataUrlToBytes(canvas.toDataURL('image/png')); }
    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    sigClearFn = function () { ctx.clearRect(0, 0, canvas.width, canvas.height); sigBytes = null; dirty = false; };
    document.getElementById('sigClear').addEventListener('click', sigClearFn);
  }

  // ---- app selection / navigation ---------------------------------------
  function showAppFields(app) {
    document.querySelectorAll('[data-apps]').forEach(function (el) {
      var show = el.getAttribute('data-apps').split(/\s+/).indexOf(app) !== -1;
      el.classList.toggle('hidden', !show);
      el.querySelectorAll('input,select,textarea').forEach(function (c) { c.disabled = !show; });
    });
  }
  function chooseApp(app) {
    currentApp = app;
    showAppFields(app);
    document.getElementById('formTitle').textContent = APPS[app].title;
    document.getElementById('landing').classList.add('hidden');
    document.getElementById('previewView').classList.add('hidden');
    document.getElementById('appForm').classList.remove('hidden');
    document.getElementById('actionBar').classList.remove('hidden');
    window.scrollTo(0, 0);
  }
  function backToLanding() {
    currentApp = null;
    document.getElementById('appForm').classList.add('hidden');
    document.getElementById('previewView').classList.add('hidden');
    document.getElementById('actionBar').classList.add('hidden');
    document.getElementById('landing').classList.remove('hidden');
    window.scrollTo(0, 0);
  }
  function backToForm() {
    document.getElementById('previewView').classList.add('hidden');
    document.getElementById('appForm').classList.remove('hidden');
    document.getElementById('actionBar').classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  // ---- build / preview / download ---------------------------------------
  function templateBytes() {
    var bin = atob(window.TEMPLATE_PDF_BASE64), len = bin.length, bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  async function buildPdf() {
    var data = collectData();
    var images = { signature: sigBytes ? { bytes: sigBytes, type: 'image/png' } : null };
    return await window.BMIOverlay.fillPdf(window.PDFLib, templateBytes(), data, images, currentApp);
  }

  async function previewApp() {
    if (!currentApp) return;
    var btn = document.getElementById('previewBtn');
    btn.disabled = true; var t = btn.innerHTML; btn.textContent = 'Preparing…';
    try {
      var bytes = await buildPdf();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      document.getElementById('pdfFrame').src = previewUrl;
      document.getElementById('previewTitle').textContent = 'Preview — ' + APPS[currentApp].title;
      document.getElementById('appForm').classList.add('hidden');
      document.getElementById('actionBar').classList.add('hidden');
      document.getElementById('previewView').classList.remove('hidden');
      window.scrollTo(0, 0);
    } catch (e) {
      console.error(e);
      alert('Could not build the preview:\n' + (e && e.message ? e.message : e));
    } finally {
      btn.disabled = false; btn.innerHTML = t;
    }
  }

  async function downloadPdf() {
    var btn = document.getElementById('downloadBtn');
    btn.disabled = true; var t = btn.innerHTML; btn.textContent = 'Generating…';
    try {
      var bytes = await buildPdf();
      var data = collectData();
      var safe = (data.name || 'Applicant').trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'Applicant';
      var dateStr = (data.date || '').trim() || todayStr();
      var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      var a = document.createElement('a');
      a.href = url; a.download = safe + '_' + dateStr + '.pdf';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    } catch (e) {
      console.error(e);
      alert('Could not create the PDF:\n' + (e && e.message ? e.message : e));
    } finally {
      btn.disabled = false; btn.innerHTML = t;
    }
  }

  // ---- init --------------------------------------------------------------
  function init() {
    buildFamily();
    restoreDraft();
    setupSignature();
    setupPermSame();
    document.getElementById('dob').addEventListener('change', calcAge);

    document.querySelectorAll('.opt').forEach(function (card) {
      card.addEventListener('click', function () { chooseApp(card.getAttribute('data-go')); });
    });
    document.getElementById('backBtn').addEventListener('click', backToLanding);
    document.getElementById('editBtn').addEventListener('click', backToForm);
    document.getElementById('previewBtn').addEventListener('click', previewApp);
    document.getElementById('downloadBtn').addEventListener('click', downloadPdf);
    document.getElementById('appForm').addEventListener('input', saveDraft);
    document.getElementById('clearBtn').addEventListener('click', function () {
      if (!confirm('Clear all entered details? This cannot be undone.')) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      document.getElementById('appForm').reset();
      if (sigClearFn) sigClearFn();
      var pa = document.getElementById('permAddr'); if (pa) pa.readOnly = false;
    });

    if (!window.PDFLib || !window.BMIOverlay || !window.TEMPLATE_PDF_BASE64) {
      alert('The form engine did not load correctly. Please check your internet connection and reload the page.');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
