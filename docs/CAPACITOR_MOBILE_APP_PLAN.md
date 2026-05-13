# OASIS Capacitor Mobile App Plan

**Strategy:** PWA-first (Phase 2) → Capacitor wrapper (Phase 3+) → Native enhancements  
**Principle:** Web app remains the source of truth. Capacitor is a thin native shell. No business logic duplication.

---

## App Identifiers

| Platform | Identifier |
|----------|-----------|
| iOS Bundle ID | `app.oasisrentalmgt.mobile` |
| Android Package | `app.oasisrentalmgt.mobile` |
| App Name | OASIS Rental |
| Short Name | OASIS |

---

## 1. Capacitor Setup

### Install dependencies
```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/ios @capacitor/android
npx cap init "OASIS Rental" app.oasisrentalmgt.mobile --web-dir dist
```

### `capacitor.config.json`
```json
{
  "appId": "app.oasisrentalmgt.mobile",
  "appName": "OASIS Rental",
  "webDir": "dist",
  "server": {
    "androidScheme": "https",
    "iosScheme": "https"
  },
  "plugins": {
    "SplashScreen": {
      "launchShowDuration": 1200,
      "backgroundColor": "#0b4f6c",
      "androidSplashResourceName": "splash",
      "showSpinner": false
    },
    "StatusBar": {
      "style": "DARK",
      "backgroundColor": "#0b4f6c"
    },
    "Keyboard": {
      "resize": "body",
      "style": "DARK",
      "resizeOnFullScreen": true
    }
  }
}
```

### Build + sync flow
```bash
npm run build           # Build React/Vite app to dist/
npx cap sync            # Copy dist/ into iOS and Android projects
npx cap open ios        # Open Xcode
npx cap open android    # Open Android Studio
```

---

## 2. Environment Handling

Capacitor runs the built web app — all environment variables are baked into the bundle at build time.

### Recommended `.env` setup
```
# .env.production
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_APP_URL=https://app.oasisrentalmgt.com
VITE_ENVIRONMENT=production
```

```
# .env.capacitor   (used for native builds if scheme differs)
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_APP_URL=capacitor://app.oasisrentalmgt.mobile
VITE_ENVIRONMENT=mobile
```

### Build command for Capacitor
```bash
VITE_ENVIRONMENT=mobile npm run build && npx cap sync
```

---

## 3. Supabase Auth Deep Link Requirements

Supabase uses redirect URLs for OAuth and magic links. Native apps require custom scheme handling.

### Required Supabase Dashboard settings
Add to **Authentication → URL Configuration → Redirect URLs**:
```
app.oasisrentalmgt.mobile://login-callback
https://app.oasisrentalmgt.com/auth/callback
```

### iOS — `Info.plist`
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>app.oasisrentalmgt.mobile</string>
    </array>
  </dict>
</array>
```

### Android — `AndroidManifest.xml`
```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="app.oasisrentalmgt.mobile" />
</intent-filter>
```

### Supabase client initialisation for Capacitor
```js
import { Capacitor } from "@capacitor/core";

const redirectTo = Capacitor.isNativePlatform()
  ? "app.oasisrentalmgt.mobile://login-callback"
  : `${window.location.origin}/auth/callback`;

await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
```

---

## 4. Camera Plugin Plan

### Install
```bash
npm install @capacitor/camera
npx cap sync
```

### iOS `Info.plist` — required permissions
```xml
<key>NSCameraUsageDescription</key>
<string>OASIS uses your camera to capture maintenance photos and work order evidence.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>OASIS needs access to your photo library to upload maintenance photos and documents.</string>
```

### Android `AndroidManifest.xml`
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
```

### Usage (replaces `<input type="file" capture>`)
```js
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

async function takePhoto() {
  const photo = await Camera.getPhoto({
    quality: 85,
    allowEditing: false,
    resultType: CameraResultType.Blob,
    source: CameraSource.Camera,
  });
  // Convert blob to File and pass to existing upload service
}
```

---

## 5. Push Notification Plan

### Install
```bash
npm install @capacitor/push-notifications
npx cap sync
```

### iOS `Info.plist`
```xml
<key>UIBackgroundModes</key>
<array>
  <string>remote-notification</string>
</array>
```

### Device token flow
1. App requests permission on first launch (after user sign-in)
2. Native OS provides APNs (iOS) or FCM (Android) device token
3. App stores token in `device_push_tokens` table (see Phase 6 schema)
4. Supabase Edge Function sends push via APNs/FCM when events fire

### Priority push events (see Phase 6 for full list)
- Urgent maintenance request created
- Work order assigned to contractor
- Quote or invoice submitted
- Work order completed
- Rent overdue alert
- Document request completed
- Compliance deadline approaching

### Token registration snippet
```js
import { PushNotifications } from "@capacitor/push-notifications";

async function registerPushToken(userId, accountId) {
  const { receive } = await PushNotifications.requestPermissions();
  if (receive !== "granted") return;

  await PushNotifications.register();

  PushNotifications.addListener("registration", async ({ value: token }) => {
    await supabase.from("device_push_tokens").upsert({
      user_id: userId,
      account_id: accountId,
      token,
      platform: Capacitor.getPlatform(), // ios | android
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,token" });
  });
}
```

---

## 6. Biometric Auth Plan

### Install
```bash
npm install @aparajita/capacitor-biometric-auth
npx cap sync
```

### Flow
1. After Supabase sign-in, offer "Enable biometric login" prompt (once)
2. Store a short-lived session token in Capacitor SecureStorage (not localStorage)
3. On next app open, check for valid stored session before prompting biometric
4. On biometric success, resume Supabase session; on failure, show login form

### iOS requirements
```xml
<key>NSFaceIDUsageDescription</key>
<string>OASIS uses Face ID to keep your property data secure.</string>
```

---

## 7. Secure Storage Plan

### Install
```bash
npm install @capacitor/preferences
npx cap sync
```

### What to store securely
| Item | Storage | Notes |
|------|---------|-------|
| Supabase refresh token | `@capacitor/preferences` | Encrypted on device |
| Active account ID | `@capacitor/preferences` | Not sensitive but persisted |
| User language preference | `@capacitor/preferences` | Replaces localStorage |
| Biometric enabled flag | `@capacitor/preferences` | Boolean |

### What NOT to store
- Finance data, payment amounts, arrears — always fetch live from Supabase
- Tenant documents — always served via signed URLs
- Auth tokens in plaintext localStorage — use Preferences instead

---

## 8. App Store / Play Store Requirements

### Apple App Store
- [ ] Privacy policy URL (required on listing)
- [ ] Account deletion flow — must be in-app (App Store guideline 5.1.1(v))
- [ ] Data collection disclosure in app listing
- [ ] Screenshot set: 6.7" iPhone, 6.1" iPhone, 12.9" iPad (at minimum)
- [ ] App Review notes explaining landlord/tenant use case
- [ ] Age rating: 4+ (no objectionable content)

### Google Play Store
- [ ] Privacy policy URL
- [ ] Data safety section (what data is collected, why, where stored)
- [ ] Account deletion flow
- [ ] Target API level ≥ 34 (Android 14)
- [ ] Screenshot set for phone and tablet

### Account Deletion
App Store guideline 5.1.1(v) requires an in-app account deletion path.

**Implementation (already partially supported via Supabase):**
- Route: `/settings/account/delete`
- Requires password confirmation
- Deletes: auth user, account_members, owned accounts (if sole owner)
- Sends confirmation email
- All stored documents purged from Supabase Storage (cascading RLS)

---

## 9. Privacy Policy Requirements

Minimum sections required:
- What data OASIS collects (email, property data, maintenance photos, documents)
- How data is stored (Supabase, encrypted at rest)
- Who data is shared with (contractors and tenants scoped by account)
- User rights (access, correction, deletion)
- Contact for privacy requests
- Effective date

---

## 10. Testing Checklist

### Pre-submission
- [ ] Auth works on iOS (sign-in, session persist, sign-out)
- [ ] Auth works on Android (sign-in, session persist, sign-out)
- [ ] Camera permission prompt appears correctly
- [ ] Photo library permission prompt appears correctly
- [ ] Maintenance photo upload works from camera
- [ ] Work order photo upload works from photo library
- [ ] Document upload works on mobile
- [ ] Push notification permission prompt works
- [ ] Push notification taps navigate to correct screen
- [ ] Deep links open correct screen when app is installed
- [ ] Deep links route to login when unauthenticated
- [ ] Safe area padding correct on iPhone notch devices
- [ ] Safe area padding correct on Android devices with navigation bar
- [ ] Bottom nav renders and navigates correctly (all roles)
- [ ] Account switcher accessible on mobile
- [ ] Offline fallback appears when no internet
- [ ] App does not cache sensitive data
- [ ] RLS still blocks cross-account access on mobile
- [ ] Tenant cannot access landlord-only screens
- [ ] Contractor cannot access unrelated work orders
- [ ] Dark mode works correctly
- [ ] i18n (en/pl/de) switches correctly

### Regression
- [ ] Desktop web app still builds and works
- [ ] Existing auth flows unchanged
- [ ] Finance ledger unchanged
- [ ] Supabase RLS policies unchanged
- [ ] Existing notifications still fire
- [ ] Existing storage uploads still work
