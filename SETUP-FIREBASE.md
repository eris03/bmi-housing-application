# Firebase setup (one-time, ~15 minutes)

The login + admin features need a free Firebase project. You only do this once.

## 1. Create the project
1. Go to **https://console.firebase.google.com** and sign in with your Google account.
2. Click **Add project** → name it e.g. `bmi-housing` → continue → you can **disable** Google Analytics → **Create project**.

## 2. Add a Web App and copy the config
1. On the project home, click the **`</>`** (Web) icon → register an app (nickname `bmi-web`) → **Register app**.
2. Firebase shows a `firebaseConfig = { … }` block. Copy the six values.
3. Open **`firebase-config.js`** in this folder and paste each value, replacing the `PASTE_…` placeholders:
   ```js
   window.FIREBASE_CONFIG = {
     apiKey: "…",
     authDomain: "…",
     projectId: "…",
     storageBucket: "…",
     messagingSenderId: "…",
     appId: "…"
   };
   ```

## 3. Enable Email/Password login
1. Left menu → **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Email/Password** → **Enable** → Save.

## 4. Create the admin login
1. Authentication → **Users** tab → **Add user**.
2. Email: `admin@therkdevelopers.com`  Password: `Admin@123` → **Add user**.
   (You can change these later; if you use a different admin email, also update
   `window.ADMIN_EMAIL` in `firebase-config.js` **and** the email in the rules below.)

## 5. Create the database
1. Left menu → **Build → Firestore Database → Create database**.
2. Choose **Start in production mode** → pick a location → **Enable**.

## 6. Paste the security rules
Firestore → **Rules** tab → replace everything with the block below → **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function hasUserDoc() { return exists(/databases/$(database)/documents/users/$(request.auth.uid)); }
    function myRole() { return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role; }
    function isAdmin() { return signedIn() && hasUserDoc() && myRole() == 'admin'; }
    function isActive() { return signedIn() && hasUserDoc(); }
    function isDesignatedAdmin() {
      return signedIn() && request.auth.token.email != null
             && request.auth.token.email.lower() == 'admin@therkdevelopers.com';
    }

    match /users/{uid} {
      allow read:   if isAdmin() || (signedIn() && request.auth.uid == uid);
      allow create: if isAdmin()
                    || (signedIn() && request.auth.uid == uid
                        && isDesignatedAdmin()
                        && request.resource.data.role == 'admin');
      allow update, delete: if isAdmin();
    }

    match /applications/{id} {
      allow create: if isActive() && request.resource.data.employeeUid == request.auth.uid;
      allow read:   if isAdmin() || (isActive() && resource.data.employeeUid == request.auth.uid);
      allow update, delete: if isAdmin();
    }
  }
}
```
> If you changed the admin email in step 4, change it in `isDesignatedAdmin()` too (keep it lowercase).

## 7. Authorize your website domain
Authentication → **Settings** → **Authorized domains** → make sure
`eris03.github.io` is listed (add it if not). `localhost` is there by default.

## 8. Done — log in
1. Reload the site (hard refresh).
2. Sign in as **admin@therkdevelopers.com / Admin@123**.
3. The dashboard opens; the sample employee **Bhima** (`bhima@therkdevelopers.com` / `Bhima@123`) is created automatically the first time.
4. Add more employees from the **Employees** tab. Each one logs in with the email + password you set, fills applications, and every submission appears under **Applications** with who filled it and a **Download PDF** button.

### Notes
- **Removing an employee** from the dashboard instantly blocks their access. To also delete their login credential entirely, remove them in Authentication → Users in the console.
- Applications are stored as form data (not files), so the admin's **Download PDF** rebuilds the exact PDF on demand — including the signature.
