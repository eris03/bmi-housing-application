/* ===========================================================================
 * FIREBASE CONFIG  —  PASTE YOUR PROJECT KEYS BELOW
 * ---------------------------------------------------------------------------
 * 1. Create a free project at https://console.firebase.google.com
 * 2. Add a "Web app" to it; Firebase shows you a config object — copy the
 *    values into the fields below (replace every PASTE_… placeholder).
 * 3. In the console: Build → Authentication → Sign-in method → enable
 *    "Email/Password".  Build → Firestore Database → Create database.
 * 4. Add the admin login (Authentication → Users → Add user):
 *        email:  admin@therkdevelopers.com     password: Admin@123
 * 5. Paste the security rules from SETUP-FIREBASE.md into Firestore → Rules.
 * See SETUP-FIREBASE.md for click-by-click steps.
 * ======================================================================== */
window.FIREBASE_CONFIG = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_AUTH_DOMAIN",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_STORAGE_BUCKET",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};

// The one account allowed to bootstrap itself as admin (self-creates its admin
// record on first login). Employees are then added from the admin dashboard.
window.ADMIN_EMAIL = "admin@therkdevelopers.com";
