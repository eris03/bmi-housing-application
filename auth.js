/* BMI Housing Society — authentication, employee management & submission log.
 * Uses Firebase (compat SDK) for: email/password login, an admin dashboard
 * that lists every submitted application + manages employees, and saving each
 * completed application to Firestore so the admin can review/download it.
 *
 * Roles:
 *   admin    — the ADMIN_EMAIL account. Sees all applications, adds/removes
 *              employees. Bootstraps its own admin record on first login.
 *   employee — added by the admin. Can fill & submit applications only.
 */
(function () {
  'use strict';

  var cfg = window.FIREBASE_CONFIG || {};
  var ADMIN_EMAIL = (window.ADMIN_EMAIL || '').toLowerCase();
  var configured = cfg.apiKey && cfg.apiKey.indexOf('PASTE') === -1;

  var el = function (id) { return document.getElementById(id); };
  function show(id) { var e = el(id); if (e) e.classList.remove('hidden'); }
  function hide(id) { var e = el(id); if (e) e.classList.add('hidden'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function whenReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  // -------- not configured yet: show a friendly notice ----------------------
  if (!configured) {
    whenReady(function () {
      show('authView'); hide('employeeArea'); hide('adminView');
      var n = el('authNotice');
      if (n) {
        n.innerHTML = 'Login is not set up yet. Open <b>firebase-config.js</b> and paste your '
          + 'Firebase project keys (see <b>SETUP-FIREBASE.md</b>), then reload.';
        n.classList.remove('hidden');
      }
      var f = el('loginForm'); if (f) f.classList.add('hidden');
    });
    return;
  }

  if (typeof firebase === 'undefined') {
    whenReady(function () {
      show('authView'); hide('employeeArea'); hide('adminView');
      var n = el('authNotice');
      if (n) { n.textContent = 'Could not load the sign-in library — check your internet connection and reload.'; n.classList.remove('hidden'); }
      var f = el('loginForm'); if (f) f.classList.add('hidden');
    });
    return;
  }

  firebase.initializeApp(cfg);
  var auth = firebase.auth();
  var db = firebase.firestore();
  // A second app instance lets the admin create employee logins WITHOUT being
  // signed out of their own session.
  var secondary = firebase.initializeApp(cfg, 'secondary');
  try { auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (e) {}

  var current = { user: null, role: null, name: null };

  // ---- helpers shared with the form app -----------------------------------
  function templateBytes() {
    var bin = atob(window.TEMPLATE_PDF_BASE64), len = bin.length, b = new Uint8Array(len);
    for (var i = 0; i < len; i++) b[i] = bin.charCodeAt(i);
    return b;
  }
  function dataUrlToImg(durl) {
    if (!durl) return null;
    var b64 = durl.split(',')[1], bin = atob(b64), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return { bytes: u, type: 'image/png' };
  }

  // expose to the form app
  window.BMIAuth = {
    getUser: function () { return current; },
    saveApplication: saveApplication,
    logout: function () { auth.signOut(); }
  };

  // ---- view routing -------------------------------------------------------
  function showLogin() {
    show('authView'); hide('employeeArea'); hide('adminView'); hide('actionBar'); hide('userChip');
  }
  function showEmployee() {
    hide('authView'); hide('adminView'); show('employeeArea'); show('userChip');
    // reset to landing
    if (window.BMIApp && window.BMIApp.toLanding) window.BMIApp.toLanding();
  }
  function showAdmin() {
    hide('authView'); hide('employeeArea'); hide('actionBar'); show('adminView'); show('userChip');
    loadApplications();
    loadEmployees();
    seedSampleEmployee();
  }

  // ---- auth state ---------------------------------------------------------
  auth.onAuthStateChanged(function (user) {
    if (!user) { current = { user: null, role: null, name: null }; updateChip(); showLogin(); return; }
    resolveRole(user).then(function (info) {
      current = { user: user, role: info.role, name: info.name, email: user.email };
      updateChip();
      if (info.role === 'admin') showAdmin();
      else if (info.role === 'employee') showEmployee();
      else {
        // signed in but not authorised (no user record) — block access
        showLogin();
        var n = el('authNotice');
        if (n) { n.textContent = 'This account is not authorised. Ask the admin to add you.'; n.classList.remove('hidden'); }
        auth.signOut();
      }
    });
  });

  // Determine the role. The designated admin self-bootstraps its record.
  function resolveRole(user) {
    var ref = db.collection('users').doc(user.uid);
    return ref.get().then(function (snap) {
      if (snap.exists) return snap.data();
      if ((user.email || '').toLowerCase() === ADMIN_EMAIL) {
        var rec = { email: user.email, name: 'Administrator', role: 'admin',
          createdAt: firebase.firestore.FieldValue.serverTimestamp() };
        return ref.set(rec).then(function () { return rec; });
      }
      return { role: null };
    }).catch(function () { return { role: null }; });
  }

  function updateChip() {
    var chip = el('userChip');
    if (!chip) return;
    if (!current.user) { chip.classList.add('hidden'); return; }
    chip.classList.remove('hidden');
    var label = el('userChipLabel');
    if (label) label.textContent = (current.name || current.email) + ' · ' + (current.role || '');
  }

  // ---- login form ---------------------------------------------------------
  whenReady(function () {
    var form = el('loginForm');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = el('loginEmail').value.trim();
      var pass = el('loginPassword').value;
      var err = el('loginError'); if (err) err.textContent = '';
      var btn = el('loginBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
      auth.signInWithEmailAndPassword(email, pass).catch(function (e2) {
        if (err) err.textContent = friendlyAuthError(e2);
      }).finally(function () { if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; } });
    });
    var lo = el('logoutBtn');
    if (lo) lo.addEventListener('click', function () { auth.signOut(); });

    // admin: add-employee form
    var af = el('addEmpForm');
    if (af) af.addEventListener('submit', function (e) {
      e.preventDefault();
      addEmployee(el('empName').value.trim(), el('empEmail').value.trim(), el('empPassword').value);
    });
    // admin: tab switching
    var tabApps = el('tabApps'), tabEmps = el('tabEmps');
    if (tabApps) tabApps.addEventListener('click', function () { switchTab('apps'); });
    if (tabEmps) tabEmps.addEventListener('click', function () { switchTab('emps'); });
  });

  function switchTab(which) {
    var apps = el('panelApps'), emps = el('panelEmps'), ta = el('tabApps'), te = el('tabEmps');
    if (which === 'apps') { show('panelApps'); hide('panelEmps'); if (ta) ta.classList.add('active'); if (te) te.classList.remove('active'); }
    else { hide('panelApps'); show('panelEmps'); if (te) te.classList.add('active'); if (ta) ta.classList.remove('active'); }
  }

  function friendlyAuthError(e) {
    var c = e && e.code ? e.code : '';
    if (c.indexOf('wrong-password') >= 0 || c.indexOf('invalid-credential') >= 0) return 'Wrong email or password.';
    if (c.indexOf('user-not-found') >= 0) return 'No account with that email.';
    if (c.indexOf('too-many-requests') >= 0) return 'Too many attempts. Try again later.';
    if (c.indexOf('network') >= 0) return 'Network error — check your connection.';
    return (e && e.message) ? e.message : 'Could not sign in.';
  }

  // ---- saving a submitted application (called by app.js on download) ------
  function saveApplication(rec) {
    if (!current.user) return Promise.resolve();
    var doc = {
      employeeUid: current.user.uid,
      employeeEmail: current.email,
      employeeName: current.name || current.email,
      appType: rec.appType,
      applicantName: (rec.data && rec.data.name) || '',
      formData: rec.data || {},
      signature: rec.signatureDataUrl || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    return db.collection('applications').add(doc).catch(function (e) {
      console.error('save application failed', e);
    });
  }

  // ---- ADMIN: applications list -------------------------------------------
  function loadApplications() {
    var tb = el('appsBody'); if (!tb) return;
    tb.innerHTML = '<tr><td colspan="5" class="amuted">Loading…</td></tr>';
    db.collection('applications').orderBy('createdAt', 'desc').get().then(function (qs) {
      if (qs.empty) { tb.innerHTML = '<tr><td colspan="5" class="amuted">No applications submitted yet.</td></tr>'; return; }
      var rows = '';
      qs.forEach(function (d) {
        var a = d.data();
        var when = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().toLocaleString() : '—';
        var type = a.appType === 'membership' ? 'Membership' : 'Purchase of Site';
        rows += '<tr>'
          + '<td>' + esc(when) + '</td>'
          + '<td>' + esc(a.applicantName || '—') + '</td>'
          + '<td>' + esc(type) + '</td>'
          + '<td>' + esc(a.employeeName || a.employeeEmail) + '</td>'
          + '<td><button class="abtn" data-dl="' + d.id + '">Download PDF</button></td>'
          + '</tr>';
      });
      tb.innerHTML = rows;
      tb.querySelectorAll('[data-dl]').forEach(function (b) {
        b.addEventListener('click', function () { downloadApplication(b.getAttribute('data-dl'), b); });
      });
    }).catch(function (e) {
      tb.innerHTML = '<tr><td colspan="5" class="amuted">Could not load (' + esc(e.message) + ').</td></tr>';
    });
  }

  function downloadApplication(id, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Building…'; }
    db.collection('applications').doc(id).get().then(function (snap) {
      if (!snap.exists) throw new Error('not found');
      var a = snap.data();
      var images = { signature: dataUrlToImg(a.signature) };
      return window.BMIOverlay.fillPdf(window.PDFLib, templateBytes(), a.formData || {}, images, a.appType)
        .then(function (bytes) {
          var safe = (a.applicantName || 'Applicant').trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'Applicant';
          var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
          var aEl = document.createElement('a');
          aEl.href = url; aEl.download = safe + '_' + (a.appType || 'form') + '.pdf';
          document.body.appendChild(aEl); aEl.click(); document.body.removeChild(aEl);
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        });
    }).catch(function (e) {
      alert('Could not build that PDF: ' + (e.message || e));
    }).finally(function () { if (btn) { btn.disabled = false; btn.textContent = 'Download PDF'; } });
  }

  // ---- ADMIN: employees ---------------------------------------------------
  function loadEmployees() {
    var tb = el('empsBody'); if (!tb) return;
    tb.innerHTML = '<tr><td colspan="3" class="amuted">Loading…</td></tr>';
    db.collection('users').where('role', '==', 'employee').get().then(function (qs) {
      if (qs.empty) { tb.innerHTML = '<tr><td colspan="3" class="amuted">No employees yet. Add one below.</td></tr>'; return; }
      var rows = '';
      qs.forEach(function (d) {
        var u = d.data();
        rows += '<tr><td>' + esc(u.name || '—') + '</td><td>' + esc(u.email) + '</td>'
          + '<td><button class="abtn danger" data-del="' + d.id + '" data-em="' + esc(u.email) + '">Remove</button></td></tr>';
      });
      tb.innerHTML = rows;
      tb.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () { removeEmployee(b.getAttribute('data-del'), b.getAttribute('data-em')); });
      });
    }).catch(function (e) {
      tb.innerHTML = '<tr><td colspan="3" class="amuted">Could not load (' + esc(e.message) + ').</td></tr>';
    });
  }

  function addEmployee(name, email, password) {
    var msg = el('addEmpMsg'); if (msg) { msg.textContent = ''; msg.className = 'ahint'; }
    if (!name || !email || !password) { if (msg) { msg.textContent = 'Fill name, email and password.'; msg.className = 'ahint err'; } return; }
    if (password.length < 6) { if (msg) { msg.textContent = 'Password must be at least 6 characters.'; msg.className = 'ahint err'; } return; }
    var btn = el('addEmpBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
    secondary.auth().createUserWithEmailAndPassword(email, password).then(function (cred) {
      var uid = cred.user.uid;
      return db.collection('users').doc(uid).set({
        email: email, name: name, role: 'employee',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(function () { return secondary.auth().signOut(); });
    }).then(function () {
      if (msg) { msg.textContent = 'Added ' + name + '. They can now log in.'; msg.className = 'ahint ok'; }
      el('addEmpForm').reset();
      loadEmployees();
    }).catch(function (e) {
      var t = e.code && e.code.indexOf('email-already-in-use') >= 0 ? 'That email already has an account.' : (e.message || 'Could not add.');
      if (msg) { msg.textContent = t; msg.className = 'ahint err'; }
    }).finally(function () { if (btn) { btn.disabled = false; btn.textContent = 'Add employee'; } });
  }

  function removeEmployee(uid, email) {
    if (!confirm('Remove ' + email + '? They will lose access immediately.')) return;
    db.collection('users').doc(uid).delete().then(function () {
      loadEmployees();
    }).catch(function (e) { alert('Could not remove: ' + (e.message || e)); });
  }

  // Seed the sample employee (Bhima) once, if no employees exist yet.
  function seedSampleEmployee() {
    db.collection('users').where('role', '==', 'employee').limit(1).get().then(function (qs) {
      if (!qs.empty) return;
      secondary.auth().createUserWithEmailAndPassword('bhima@therkdevelopers.com', 'Bhima@123').then(function (cred) {
        return db.collection('users').doc(cred.user.uid).set({
          email: 'bhima@therkdevelopers.com', name: 'Bhima', role: 'employee',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () { return secondary.auth().signOut(); });
      }).then(function () { loadEmployees(); }).catch(function () { /* already exists — ignore */ });
    });
  }
})();
